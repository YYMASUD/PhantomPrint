/**
 * PhantomPrint — Proxy Manager
 * Full proxy management with geo-matching, health monitoring, and leak protection.
 * Runs in service worker context.
 * @module modules/proxy-manager
 */
'use strict';

const ProxyManager = {
  /** @type {Array} Proxy list */
  _proxies: [],
  /** @type {string|null} Currently active proxy ID */
  _activeProxyId: null,

  /**
   * Initialize proxy manager, load saved proxies
   * @returns {Promise<void>}
   */
  async init() {
    const result = await chrome.storage.local.get(['pp_proxies', 'pp_active_proxy']);
    this._proxies = result.pp_proxies || [];
    this._activeProxyId = result.pp_active_proxy || null;
  },

  /**
   * Add a new proxy
   * @param {Object} proxy - Proxy configuration
   * @param {string} proxy.host - Proxy hostname/IP
   * @param {number} proxy.port - Proxy port
   * @param {string} [proxy.protocol='http'] - http, https, socks4, socks5
   * @param {string} [proxy.username] - Auth username
   * @param {string} [proxy.password] - Auth password
   * @param {string} [proxy.name] - Display name
   * @param {string} [proxy.profileId] - Assigned fingerprint profile
   * @returns {Promise<Object>} Created proxy entry
   */
  async addProxy(proxy) {
    const entry = {
      id: `proxy_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      host: proxy.host,
      port: parseInt(proxy.port, 10),
      protocol: proxy.protocol || 'http',
      username: proxy.username || '',
      password: proxy.password || '',
      name: proxy.name || `${proxy.host}:${proxy.port}`,
      profileId: proxy.profileId || null,
      status: 'untested',
      latency: null,
      location: null,
      addedAt: new Date().toISOString()
    };

    this._proxies.push(entry);
    await this._save();
    return entry;
  },

  /**
   * Bulk import proxies from text (one per line: host:port or host:port:user:pass)
   * @param {string} text - Proxy list text
   * @returns {Promise<{imported: number, failed: number}>}
   */
  async bulkImport(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    let imported = 0, failed = 0;

    for (const line of lines) {
      try {
        const parts = line.split(':');
        if (parts.length < 2) { failed++; continue; }
        await this.addProxy({
          host: parts[0],
          port: parseInt(parts[1], 10),
          username: parts[2] || '',
          password: parts[3] || '',
          protocol: parts[4] || 'http'
        });
        imported++;
      } catch (e) {
        failed++;
      }
    }

    return { imported, failed };
  },

  /**
   * Remove a proxy by ID
   * @param {string} proxyId
   * @returns {Promise<boolean>}
   */
  async removeProxy(proxyId) {
    const idx = this._proxies.findIndex(p => p.id === proxyId);
    if (idx === -1) return false;
    this._proxies.splice(idx, 1);
    if (this._activeProxyId === proxyId) {
      await this.deactivate();
    }
    await this._save();
    return true;
  },

  /**
   * Activate a proxy
   * @param {string} proxyId
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async activate(proxyId) {
    const proxy = this._proxies.find(p => p.id === proxyId);
    if (!proxy) return { success: false, error: 'Proxy not found' };

    const schemeMap = {
      'http': 'http', 'https': 'https',
      'socks4': 'socks4', 'socks5': 'socks5'
    };

    try {
      await chrome.proxy.settings.set({
        value: {
          mode: 'fixed_servers',
          rules: {
            singleProxy: {
              scheme: schemeMap[proxy.protocol] || 'http',
              host: proxy.host,
              port: proxy.port
            },
            bypassList: ['localhost', '127.0.0.1', '::1', '<local>']
          }
        },
        scope: 'regular'
      });

      this._activeProxyId = proxyId;
      proxy.status = 'active';
      await this._save();

      // Setup auth handler if credentials provided
      if (proxy.username && proxy.password) {
        this._setupAuthHandler(proxy);
      }

      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  /**
   * Deactivate proxy (revert to direct connection)
   * @returns {Promise<void>}
   */
  async deactivate() {
    try {
      await chrome.proxy.settings.set({
        value: { mode: 'direct' },
        scope: 'regular'
      });
    } catch (e) {}

    if (this._activeProxyId) {
      const proxy = this._proxies.find(p => p.id === this._activeProxyId);
      if (proxy) proxy.status = 'inactive';
    }
    this._activeProxyId = null;
    await this._save();
  },

  /**
   * Setup authentication handler for proxy credentials
   * @param {Object} proxy
   * @private
   */
  _setupAuthHandler(proxy) {
    // Note: chrome.webRequest.onAuthRequired requires "webRequest" and "webRequestAuthProvider" permissions
    try {
      if (chrome.webRequest && chrome.webRequest.onAuthRequired) {
        chrome.webRequest.onAuthRequired.addListener(
          (details) => {
            if (details.isProxy) {
              return {
                authCredentials: {
                  username: proxy.username,
                  password: proxy.password
                }
              };
            }
          },
          { urls: ['<all_urls>'] },
          ['blocking']
        );
      }
    } catch (e) {
      console.warn('ProxyManager: Auth handler setup failed:', e.message);
    }
  },

  /**
   * Test proxy connectivity and measure latency
   * @param {string} proxyId
   * @returns {Promise<{alive: boolean, latency: number|null, error?: string}>}
   */
  async testProxy(proxyId) {
    const proxy = this._proxies.find(p => p.id === proxyId);
    if (!proxy) return { alive: false, latency: null, error: 'Proxy not found' };

    // Temporarily activate this proxy, test, then restore
    const previousActiveId = this._activeProxyId;
    await this.activate(proxyId);

    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch('https://httpbin.org/ip', {
        signal: controller.signal,
        cache: 'no-store'
      });
      clearTimeout(timeout);

      const latency = Date.now() - start;
      const data = await response.json();

      proxy.latency = latency;
      proxy.status = latency < 2000 ? 'active' : 'slow';
      proxy.externalIp = data.origin;
      proxy.lastTested = new Date().toISOString();

      // Try to get geo-location from IP
      await this._detectGeoLocation(proxy);

      await this._save();

      // Restore previous state
      if (previousActiveId && previousActiveId !== proxyId) {
        await this.activate(previousActiveId);
      } else if (!previousActiveId) {
        await this.deactivate();
      }

      return { alive: true, latency, ip: data.origin };
    } catch (e) {
      proxy.status = 'dead';
      proxy.latency = null;
      proxy.lastTested = new Date().toISOString();
      await this._save();

      // Restore previous state
      if (previousActiveId && previousActiveId !== proxyId) {
        await this.activate(previousActiveId);
      } else {
        await this.deactivate();
      }

      return { alive: false, latency: null, error: e.message };
    }
  },

  /**
   * Test all proxies
   * @returns {Promise<Array<{id: string, alive: boolean, latency: number|null}>>}
   */
  async testAll() {
    const results = [];
    for (const proxy of this._proxies) {
      const result = await this.testProxy(proxy.id);
      results.push({ id: proxy.id, ...result });
    }
    return results;
  },

  /**
   * Detect proxy geo-location via IP lookup
   * @param {Object} proxy
   * @private
   */
  async _detectGeoLocation(proxy) {
    if (!proxy.externalIp) return;
    try {
      const resp = await fetch(`https://ipapi.co/${proxy.externalIp}/json/`, { cache: 'no-store' });
      if (resp.ok) {
        const geo = await resp.json();
        proxy.location = {
          country: geo.country_name || '',
          countryCode: geo.country_code || '',
          region: geo.region || '',
          city: geo.city || '',
          timezone: geo.timezone || '',
          latitude: geo.latitude || 0,
          longitude: geo.longitude || 0
        };
      }
    } catch (e) {
      // Non-critical
    }
  },

  /**
   * Get fingerprint adjustments to match proxy location
   * @param {string} proxyId
   * @returns {Object|null} Suggested fingerprint overrides
   */
  getGeoMatchSuggestions(proxyId) {
    const proxy = this._proxies.find(p => p.id === proxyId);
    if (!proxy?.location) return null;

    const loc = proxy.location;
    const countryLangMap = {
      'US': 'en-US', 'GB': 'en-GB', 'CA': 'en-CA', 'AU': 'en-AU',
      'DE': 'de-DE', 'FR': 'fr-FR', 'ES': 'es-ES', 'IT': 'it-IT',
      'JP': 'ja-JP', 'KR': 'ko-KR', 'CN': 'zh-CN', 'TW': 'zh-TW',
      'BR': 'pt-BR', 'PT': 'pt-PT', 'RU': 'ru-RU', 'NL': 'nl-NL',
      'PL': 'pl-PL', 'SE': 'sv-SE', 'DK': 'da-DK', 'NO': 'nb-NO',
      'FI': 'fi-FI', 'TR': 'tr-TR', 'MX': 'es-MX', 'IN': 'hi-IN',
      'TH': 'th-TH', 'VN': 'vi-VN', 'ID': 'id-ID', 'MY': 'ms-MY'
    };

    return {
      timezone: loc.timezone,
      language: countryLangMap[loc.countryCode] || 'en-US',
      geolocation: { latitude: loc.latitude, longitude: loc.longitude },
      country: loc.country,
      countryCode: loc.countryCode
    };
  },

  /**
   * Run DNS leak test
   * @returns {Promise<{leaked: boolean, dnsServers: string[]}>}
   */
  async dnsLeakTest() {
    try {
      // Use a DNS leak test API
      const resp = await fetch('https://ipleak.net/json/', { cache: 'no-store' });
      const data = await resp.json();
      const dnsServers = data.dns_servers || [];

      return {
        leaked: dnsServers.length > 0,
        dnsServers: dnsServers.map(s => s.ip || s),
        yourIp: data.ip || ''
      };
    } catch (e) {
      return { leaked: false, dnsServers: [], error: e.message };
    }
  },

  /**
   * Auto-rotate to next available proxy
   * @returns {Promise<{success: boolean, newProxyId?: string}>}
   */
  async autoRotate() {
    const alive = this._proxies.filter(p => p.status !== 'dead');
    if (alive.length === 0) return { success: false };

    const currentIdx = alive.findIndex(p => p.id === this._activeProxyId);
    const nextIdx = (currentIdx + 1) % alive.length;
    const result = await this.activate(alive[nextIdx].id);
    return { success: result.success, newProxyId: alive[nextIdx].id };
  },

  /**
   * Get all proxies
   * @returns {Array}
   */
  getProxies() { return [...this._proxies]; },

  /**
   * Get active proxy
   * @returns {Object|null}
   */
  getActive() { return this._proxies.find(p => p.id === this._activeProxyId) || null; },

  /**
   * Save state to storage
   * @private
   */
  async _save() {
    await chrome.storage.local.set({
      pp_proxies: this._proxies,
      pp_active_proxy: this._activeProxyId
    });
  }
};

// Export
if (typeof globalThis !== 'undefined') globalThis.ProxyManager = ProxyManager;
