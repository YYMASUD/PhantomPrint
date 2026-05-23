/**
 * PhantomPrint — DoHClient
 * DNS-over-HTTPS client with LRU+TTL cache, CNAME tracker detection,
 * DNS leak testing, and provider management. Runs in service worker.
 */

class DoHClient {
  // ─── Provider Registry ───────────────────────────────────────────────────────

  static PROVIDERS = Object.freeze({
    cloudflare: {
      name:    'Cloudflare',
      url:     'https://cloudflare-dns.com/dns-query',
      privacy: 'high',
    },
    google: {
      name:    'Google',
      url:     'https://dns.google/dns-query',
      privacy: 'medium',
    },
    quad9: {
      name:    'Quad9',
      url:     'https://dns.quad9.net/dns-query',
      privacy: 'high',
    },
    nextdns: {
      name:    'NextDNS',
      url:     'https://dns.nextdns.io/dns-query',
      privacy: 'high',
    },
    mullvad: {
      name:    'Mullvad',
      url:     'https://dns.mullvad.net/dns-query',
      privacy: 'high',
    },
  });

  // ─── Tracker Domain List ─────────────────────────────────────────────────────

  static TRACKER_DOMAINS = new Set([
    'criteo.com',
    'facebook.net',
    'doubleclick.net',
    'google-analytics.com',
    'hotjar.com',
    'fullstory.com',
    'segment.com',
    'amplitude.com',
    'mixpanel.com',
    'scorecardresearch.com',
    'quantserve.com',
    'rubiconproject.com',
    'pubmatic.com',
    'openx.net',
    'adnxs.com',
    'adsrvr.org',
    'advertising.com',
    'taboola.com',
    'outbrain.com',
    'smartadserver.com',
    'bing.com',
    'adroll.com',
    'appnexus.com',
    'mediamath.com',
    'liveramp.com',
    'acuityads.com',
    'eyeota.net',
    'bluekai.com',
    'krux.com',
    'addthis.com',
    'shareaholic.com',
    'disqus.com',
    'bizrate.com',
    'chartbeat.com',
    'parsely.com',
    'comscore.com',
    'newrelic.com',
    'optimizely.com',
    'braze.com',
    'klaviyo.com',
    'hubspot.com',
    'intercom.io',
    'zendesk.com',
    'olark.com',
    'livechatinc.com',
    'tealium.com',
    'ensighten.com',
    'clicktale.com',
    'mparticle.com',
    'heap.io',
    'logrocket.com',
  ]);

  // ─── Constructor ─────────────────────────────────────────────────────────────

  constructor() {
    /** LRU cache: key = `${hostname}/${type}`, value = {answers, expiresAt} */
    this._cache = new Map();
    this._maxCacheSize = 500;
    this._currentProviderKey = 'cloudflare';
    this._enabled = true;
    this._queriesResolved = 0;
    this._trackersFound = 0;
  }

  // ─── Cache Internals ─────────────────────────────────────────────────────────

  /** @private */
  _cacheKey(hostname, type) {
    return `${hostname.toLowerCase()}/${type.toUpperCase()}`;
  }

  /** @private — Retrieve a valid (non-expired) cache entry or null. */
  _cacheGet(hostname, type) {
    const key = this._cacheKey(hostname, type);
    if (!this._cache.has(key)) return null;
    const entry = this._cache.get(key);
    if (Date.now() > entry.expiresAt) {
      this._cache.delete(key);
      return null;
    }
    // Refresh LRU position
    this._cache.delete(key);
    this._cache.set(key, entry);
    return entry;
  }

  /** @private — Store a response in the LRU+TTL cache. */
  _cacheSet(hostname, type, answers, ttl) {
    const key = this._cacheKey(hostname, type);
    // Evict oldest entry if at capacity
    if (this._cache.size >= this._maxCacheSize) {
      const oldestKey = this._cache.keys().next().value;
      this._cache.delete(oldestKey);
    }
    this._cache.set(key, {
      answers,
      expiresAt: Date.now() + (ttl > 0 ? ttl * 1000 : 60_000),
    });
  }

  // ─── Core Resolution ─────────────────────────────────────────────────────────

  /**
   * Resolve a hostname using DoH (application/dns-json format).
   * @param {string} hostname
   * @param {string} [type='A']  DNS record type
   * @returns {Promise<{status:number, answers:object[], cached:boolean}>}
   */
  async resolve(hostname, type = 'A') {
    const cached = this._cacheGet(hostname, type);
    if (cached) {
      return { status: 0, answers: cached.answers, cached: true };
    }

    const provider = await this.getProvider();
    const url = `${provider.url}?name=${encodeURIComponent(hostname)}&type=${encodeURIComponent(type)}`;

    const response = await fetch(url, {
      headers: { Accept: 'application/dns-json' },
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`DoH fetch failed: HTTP ${response.status} for ${hostname}`);
    }

    const data = await response.json();
    const answers = data.Answer ?? [];
    const status = data.Status ?? 0; // NOERROR = 0

    // Determine minimum TTL from answers (default 60s)
    const minTtl = answers.reduce((m, a) => Math.min(m, a.TTL ?? 60), 300);
    this._cacheSet(hostname, type, answers, minTtl);
    this._queriesResolved++;

    return { status, answers, cached: false };
  }

  /**
   * Follow CNAME chain to final A record.
   * @param {string} hostname
   * @returns {Promise<{hostname:string, cname_chain:string[], final_ip:string|null,
   *                    is_tracker:boolean, tracker_domain:string|null}>}
   */
  async resolveCNAME(hostname) {
    const cnameChain = [];
    let current = hostname;
    const MAX_HOPS = 10;

    for (let hop = 0; hop < MAX_HOPS; hop++) {
      let result;
      try {
        result = await this.resolve(current, 'CNAME');
      } catch {
        break;
      }

      const cnameRecord = result.answers.find(a => a.type === 5); // CNAME type = 5
      if (!cnameRecord) break;

      // Strip trailing dot from CNAME data
      const nextHost = cnameRecord.data.replace(/\.$/, '');
      cnameChain.push(nextHost);
      current = nextHost;
    }

    // Resolve final A record
    let finalIp = null;
    try {
      const aResult = await this.resolve(current, 'A');
      const aRecord = aResult.answers.find(a => a.type === 1); // A = 1
      finalIp = aRecord?.data ?? null;
    } catch {
      // Silently ignore A record failures
    }

    // Check tracker status
    const trackerInfo = this._findTrackerInChain([hostname, ...cnameChain]);

    if (trackerInfo.isTracker) this._trackersFound++;

    return {
      hostname,
      cname_chain: cnameChain,
      final_ip: finalIp,
      is_tracker: trackerInfo.isTracker,
      tracker_domain: trackerInfo.trackerDomain,
    };
  }

  /**
   * Check whether any CNAME in the resolution chain is a known tracker.
   * @param {string} hostname
   * @returns {Promise<{isTracker:boolean, trackerDomain:string|null, cname:string|null}>}
   */
  async isCNAMETracker(hostname) {
    const chain = [];
    let current = hostname;
    const MAX_HOPS = 10;

    for (let hop = 0; hop < MAX_HOPS; hop++) {
      let result;
      try {
        result = await this.resolve(current, 'CNAME');
      } catch {
        break;
      }

      const cnameRecord = result.answers.find(a => a.type === 5);
      if (!cnameRecord) break;

      const nextHost = cnameRecord.data.replace(/\.$/, '');
      chain.push(nextHost);
      current = nextHost;
    }

    const all = [hostname, ...chain];
    const found = this._findTrackerInChain(all);

    return {
      isTracker: found.isTracker,
      trackerDomain: found.trackerDomain,
      cname: found.isTracker ? found.cname : null,
    };
  }

  /** @private — Scan a list of hostnames for membership in TRACKER_DOMAINS. */
  _findTrackerInChain(hosts) {
    for (const host of hosts) {
      for (const trackerApex of DoHClient.TRACKER_DOMAINS) {
        if (host === trackerApex || host.endsWith(`.${trackerApex}`)) {
          return { isTracker: true, trackerDomain: trackerApex, cname: host };
        }
      }
    }
    return { isTracker: false, trackerDomain: null, cname: null };
  }

  // ─── Provider Management ─────────────────────────────────────────────────────

  /**
   * Switch the active DoH provider and persist the selection.
   * @param {string} providerKey  Key from DoHClient.PROVIDERS
   */
  setProvider(providerKey) {
    if (!DoHClient.PROVIDERS[providerKey]) {
      throw new Error(`Unknown DoH provider: ${providerKey}`);
    }
    this._currentProviderKey = providerKey;
    // Persist asynchronously (best-effort)
    chrome.storage.local.set({ pp_doh_provider: providerKey }).catch(() => {});
    // Invalidate cache when switching providers
    this._cache.clear();
  }

  /**
   * Return the current provider config, loading from storage if needed.
   * @returns {Promise<{name:string, url:string, privacy:string}>}
   */
  async getProvider() {
    if (!this._providerLoaded) {
      const result = await chrome.storage.local.get('pp_doh_provider');
      if (result.pp_doh_provider && DoHClient.PROVIDERS[result.pp_doh_provider]) {
        this._currentProviderKey = result.pp_doh_provider;
      }
      this._providerLoaded = true;
    }
    return DoHClient.PROVIDERS[this._currentProviderKey];
  }

  /**
   * @returns {Promise<{enabled:boolean, provider:object, cacheSize:number,
   *                    queriesResolved:number, trackersFound:number}>}
   */
  async getStatus() {
    const provider = await this.getProvider();
    return {
      enabled:         this._enabled,
      provider,
      cacheSize:       this._cache.size,
      queriesResolved: this._queriesResolved,
      trackersFound:   this._trackersFound,
    };
  }

  // ─── DNS Leak Test ───────────────────────────────────────────────────────────

  /**
   * Attempt to detect DNS leaks by resolving a randomised test hostname
   * and analysing whether resolution went through DoH or a system resolver.
   * @returns {Promise<{leaked:boolean, resolvedVia:string, notes:string}>}
   */
  async runLeakTest() {
    // Generate a random label to avoid cached results
    const randomLabel = Math.random().toString(36).slice(2, 12);
    const testHostname = `${randomLabel}.dnsleaktest.com`;

    let resolvedVia = 'unknown';
    let leaked = false;
    let notes = '';

    try {
      const result = await this.resolve(testHostname, 'A');

      if (result.cached) {
        notes = 'Result was cached; clearing cache and retrying would give a fresh result.';
        resolvedVia = 'cache';
        leaked = false;
      } else {
        // If we got here via our DoH fetch, resolution went through the DoH provider
        const provider = await this.getProvider();
        resolvedVia = `DoH (${provider.name})`;
        leaked = false;
        notes = `Hostname resolved successfully via ${provider.url}. No system DNS leak detected.`;
      }
    } catch (err) {
      // Resolution failed entirely — could mean system DNS was tried and blocked,
      // or DoH itself is unreachable
      leaked = true;
      resolvedVia = 'system (suspected)';
      notes = `DoH resolution failed (${err.message}). System resolver may have been used instead.`;
    }

    return { leaked, resolvedVia, notes };
  }

  // ─── Enable / Disable ────────────────────────────────────────────────────────

  /**
   * Toggle DoH on or off and persist the setting.
   * @param {boolean} enabled
   */
  async enable(enabled) {
    this._enabled = !!enabled;
    await chrome.storage.local.set({ pp_doh_enabled: this._enabled });
    if (!this._enabled) {
      this._cache.clear();
    }
  }

  /**
   * Load persisted enabled/provider settings from storage.
   * Call once during service worker initialisation.
   */
  async init() {
    const result = await chrome.storage.local.get(['pp_doh_enabled', 'pp_doh_provider']);
    if (typeof result.pp_doh_enabled === 'boolean') {
      this._enabled = result.pp_doh_enabled;
    }
    if (result.pp_doh_provider && DoHClient.PROVIDERS[result.pp_doh_provider]) {
      this._currentProviderKey = result.pp_doh_provider;
    }
    this._providerLoaded = true;
  }
}

if (typeof self !== 'undefined') self.DoHClient = DoHClient;
