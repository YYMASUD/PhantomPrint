/**
 * TrackerBlocker — Lightweight tracker blocking engine
 * Runs in service worker context. Uses chrome.declarativeNetRequest (DNR).
 * DNR rule ID range: 5000–5999
 */

'use strict';

class TrackerBlocker {
  constructor() {
    this.RULE_ID_BASE = 5000;
    this.RULE_ID_MAX  = 5999;

    // Storage keys
    this.STORAGE_KEY_LIST_STATUS  = 'tb_list_status';
    this.STORAGE_KEY_CUSTOM_RULES = 'tb_custom_rules';
    this.STORAGE_KEY_STATS        = 'tb_stats';

    // ID reservations per list (each list gets a 100-rule slice)
    this.LIST_ID_RANGES = {
      easyPrivacy    : { start: 5000, end: 5099 },
      peterLowe      : { start: 5100, end: 5199 },
      fingerprinting : { start: 5200, end: 5299 },
      sessionReplay  : { start: 5300, end: 5349 },
      cryptominers   : { start: 5350, end: 5399 },
      social         : { start: 5400, end: 5449 },
      custom         : { start: 5450, end: 5599 },
    };

    // Hardcoded tracker domains grouped for DNR generation
    this.BUILT_IN_DOMAINS = {
      easyPrivacy: [
        // Google Analytics & Tag Manager
        'google-analytics.com', 'googletagmanager.com', 'analytics.google.com',
        'stats.g.doubleclick.net', 'doubleclick.net', 'googleadservices.com',
        'googlesyndication.com', 'adservice.google.com',
        // Facebook
        'facebook.net', 'connect.facebook.net', 'graph.facebook.com',
        'pixel.facebook.com', 'an.facebook.com',
        // Mixpanel
        'mixpanel.com', 'api.mixpanel.com', 'cdn.mxpnl.com', 'cdn4.mxpnl.com',
        // Segment
        'segment.com', 'cdn.segment.com', 'api.segment.io',
        // Amplitude
        'amplitude.com', 'api2.amplitude.com', 'cdn.amplitude.com',
        // Heap
        'heap.io', 'heapanalytics.com', 'cdn.heapanalytics.com',
        // Kissmetrics
        'kissmetrics.com', 'a.kissmetrics.com', 'kissmetrics.io',
        // Hotjar
        'hotjar.com', 'static.hotjar.com', 'script.hotjar.com', 'insights.hotjar.com',
        // FullStory
        'fullstory.com', 'rs.fullstory.com', 'edge.fullstory.com',
        // Mouseflow
        'mouseflow.com', 'cdn.mouseflow.com',
        // LogRocket
        'logrocket.com', 'cdn.logrocket.io', 'r.lr-relay.com',
        // Microsoft Clarity
        'clarity.ms', 'c.clarity.ms',
        // Smartlook
        'smartlook.com', 'web-sdk.smartlook.com', 'manager.smartlook.com',
        // Inspectlet
        'inspectlet.com', 'cdn.inspectlet.com',
        // CrazyEgg
        'crazyegg.com', 'script.crazyegg.com',
        // Lucky Orange
        'luckyorange.com', 'd10lpsik1i8c69.cloudfront.net',
        // New Relic
        'newrelic.com', 'bam.nr-data.net', 'js-agent.newrelic.com',
        // Sentry
        'sentry.io', 'browser.sentry-cdn.com',
        // Bugsnag
        'bugsnag.com', 'sessions.bugsnag.com',
        // Raygun
        'raygun.io', 'api.raygun.io',
        // Rollbar
        'rollbar.com', 'api.rollbar.com',
        // TrackJS
        'trackjs.com', 'usage.trackjs.com',
        // Yandex Metrika
        'mc.yandex.ru', 'metrika.yandex.com', 'mc.yandex.com',
      ],

      peterLowe: [
        // Amazon
        'amazon-adsystem.com', 'aax.amazon-adsystem.com', 'aax-us-east.amazon-adsystem.com',
        // Criteo
        'criteo.com', 'static.criteo.net', 'bidder.criteo.com', 'gum.criteo.com',
        // AppNexus / Xandr
        'appnexus.com', 'adnxs.com', 'ib.adnxs.com', 'secure.adnxs.com',
        // Twitter/X Ads
        'ads-twitter.com', 'static.ads-twitter.com', 'analytics.twitter.com',
        // Advertising.com / Oath
        'advertising.com', 'adtech.de', 'nexac.com',
        // Yieldmo
        'yieldmo.com', 'match.yieldmo.com',
        // OpenX
        'openx.net', 'openx.com', 'u.openx.net', 'delivery.openx.net',
        // PubMatic
        'pubmatic.com', 'ads.pubmatic.com', 'image6.pubmatic.com',
        // Index Exchange (Casale Media)
        'casalemedia.com', 'indexww.com', 'idx.liadm.com',
        // Rubicon Project / Magnite
        'rubiconproject.com', 'rlcdn.com', 'fastlane.rubiconproject.com',
        // Quantserve
        'quantserve.com', 'pixel.quantserve.com',
        // Scorecard Research / comScore
        'scorecardresearch.com', 'comscore.com', 'beacon.scorecardresearch.com',
        // Taboola
        'taboola.com', 'trc.taboola.com', 'nr-data.taboola.com', 'cdn.taboola.com',
        // Outbrain
        'outbrain.com', 'widgets.outbrain.com', 'log.outbrain.com',
        // Zemanta / Outbrain DSP
        'zemanta.com', 'p.zemanta.com',
        // Gravity
        'gravity.com', 'gs.iaddock.com',
        // AddThis / Oracle
        'addthis.com', 'addthisedge.com',
        // ShareThis
        'sharethis.com', 'platform.sharethis.com',
        // MOAT / Oracle
        'moatads.com', 'mfadsrvr.com', 'd3t3ozftmdmh3i.cloudfront.net',
        // Yield Manager
        'yieldmanager.com', 'ad.yieldmanager.com',
        // FastClick
        'fastclick.net',
        // TradeDoubler
        'tradedoubler.com', 'impde.tradedoubler.com',
        // Zanox / Awin
        'zanox.com', 'awin1.com',
        // LinkSynergy / Rakuten
        'linksynergy.com', 'click.linksynergy.com',
        // Nielsen
        'nielsen.com', 'secure-dcr.imrworldwide.com', 'secure-us.imrworldwide.com',
      ],

      fingerprinting: [
        'fingerprintjs.com', 'api.fpjs.io', 'fpcdn.io',
        'iovation.com', 'iojs.net', 'ci-mpsnare.iojs.net',
        'threatmetrix.com', 'h.online-metrix.net',
        'signifyd.com', 'api.signifyd.com',
        'sardine.ai', 'api.sardine.ai', 'device.sardine.ai',
        'kount.com', 'cdn.kount.com',
        'sift.com', 'siftscience.com', 'device.siftscience.com', 'cdn.siftscience.com',
        'castle.io', 'api.castle.io',
        'datatheorem.com',
        'tiltlabs.io',
        'sessioncam.com', 'cdn.sessioncam.com',
      ],

      sessionReplay: [
        'hotjar.com', 'static.hotjar.com', 'script.hotjar.com',
        'fullstory.com', 'rs.fullstory.com',
        'mouseflow.com', 'cdn.mouseflow.com',
        'logrocket.com', 'cdn.logrocket.io',
        'smartlook.com', 'web-sdk.smartlook.com',
        'inspectlet.com', 'cdn.inspectlet.com',
        'glassbox.com', 'cdn.glassboxdigital.com',
        'contentsquare.net', 'tag.contentsquare.com',
        'sessionstack.com', 'c.sessionstack.com',
        'daisycon.com',
      ],

      cryptominers: [
        'coinhive.com', 'coin-hive.com', 'cnhv.co',
        'jsecoin.com', 'load.jsecoin.com',
        'cryptoloot.pro', 'www.cryptoloot.pro',
        'minero.cc', 'www.minero.cc',
        'webmr.io',
        'authedmine.com',
        'monerominer.rocks',
        'ppoi.org',
        'minemytraffic.com',
        'crypto-loot.org',
        'coinblind.com',
        'coinimp.com', 'www.coinimp.com',
        'deepminer.io',
        'miner.rocks',
      ],

      social: [
        // Twitter/X embeds
        'platform.twitter.com', 'syndication.twitter.com', 'cdn.syndication.twimg.com',
        // Pinterest
        'widgets.pinterest.com', 'assets.pinterest.com', 'ct.pinterest.com',
        // LinkedIn
        'platform.linkedin.com', 'snap.licdn.com', 'licdn.com',
        'analytics.pointdrive.linkedin.com',
        // VKontakte
        'vk.com', 'userapi.com', 'vk.me',
        // Odnoklassniki
        'ok.ru', 'odnoklassniki.ru',
        // Disqus
        'disqus.com', 'disquscdn.com', 'referrer.disqus.com',
        // Reddit
        'www.redditstatic.com', 'reddit.com',
        // Tumblr
        'assets.tumblr.com',
        // AddToAny
        'static.addtoany.com', 'addtoany.com',
      ],
    };

    // Cosmetic filter CSS
    this.COSMETIC_CSS = `
      [class*="ad-"]:not([class*="shade"]):not([class*="load"]):not([class*="grad"]),
      [id*="ad-container"],
      [id*="banner-ad"],
      [class*="banner-ad"],
      .sponsored,
      [data-ad],
      .ad-slot,
      [class*="banner"]:not(header):not(nav):not(footer):not([class*="img"]):not([class*="hero"]):not([class*="feature"]),
      .promotedItem,
      .promoted-item,
      [class*="sponsored"],
      .outbrain-widget,
      .taboola-widget,
      [data-taboola-widget],
      [id*="taboola"],
      [id*="outbrain"],
      [class*="dfp-"],
      [class*="gpt-"],
      [class*="advert"],
      [id*="advert"],
      .ad-wrapper,
      .ad-container,
      .ad-unit,
      .ad-box,
      [class*="adsense"],
      [id*="adsense"],
      ins.adsbygoogle,
      .widget-ads,
      [data-google-query-id],
      [class*="native-ad"],
      [id*="native-ad"],
      .native-ad,
      [class*="promo-"]:not([class*="promo-code"]),
      .promotional,
      [class*="tracking-pixel"],
      img[width="1"][height="1"],
      img[width="0"][height="0"]
    `;
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────

  async _getStorage(key, defaultValue) {
    return new Promise((resolve) => {
      chrome.storage.local.get([key], (result) => {
        resolve(result[key] !== undefined ? result[key] : defaultValue);
      });
    });
  }

  async _setStorage(key, value) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [key]: value }, resolve);
    });
  }

  _domainsToRules(domains, idStart, idEnd) {
    const rules = [];
    let id = idStart;
    for (const domain of domains) {
      if (id > idEnd) break;
      rules.push({
        id      : id++,
        priority: 1,
        action  : { type: 'block' },
        condition: {
          requestDomains: [domain],
          resourceTypes : [
            'main_frame','sub_frame','xmlhttprequest','script',
            'image','media','font','stylesheet','other','ping',
          ],
        },
      });
    }
    return rules;
  }

  async _getDefaultListStatus() {
    return {
      easyPrivacy   : { enabled: true },
      peterLowe     : { enabled: true },
      fingerprinting: { enabled: true },
      sessionReplay : { enabled: true },
      cryptominers  : { enabled: true },
      social        : { enabled: false },
      custom        : { enabled: true },
    };
  }

  async _getListStatus() {
    const defaults = await this._getDefaultListStatus();
    const stored   = await this._getStorage(this.STORAGE_KEY_LIST_STATUS, {});
    return Object.assign({}, defaults, stored);
  }

  // ─── Initialization ───────────────────────────────────────────────────────

  async initialize() {
    await this.applyAllDnrRules();
    return { initialized: true };
  }

  async applyAllDnrRules() {
    const listStatus  = await this._getListStatus();
    const customRules = await this.getCustomRules();

    // Gather IDs to remove (our whole range 5000–5999)
    let existing = [];
    try {
      existing = await chrome.declarativeNetRequest.getDynamicRules();
    } catch (_) {}

    const managedIds = existing
      .filter((r) => r.id >= this.RULE_ID_BASE && r.id <= this.RULE_ID_MAX)
      .map((r) => r.id);

    const addRules = [];

    // Built-in lists
    for (const [listName, range] of Object.entries(this.LIST_ID_RANGES)) {
      if (listName === 'custom') continue;
      const status = listStatus[listName];
      if (!status || !status.enabled) continue;

      const domains = this.BUILT_IN_DOMAINS[listName] || [];
      addRules.push(...this._domainsToRules(domains, range.start, range.end));
    }

    // Custom blocked domains
    if (listStatus.custom && listStatus.custom.enabled) {
      const customRange = this.LIST_ID_RANGES.custom;
      let id = customRange.start;
      for (const domain of customRules) {
        if (id > customRange.end) break;
        addRules.push({
          id      : id++,
          priority: 1,
          action  : { type: 'block' },
          condition: {
            requestDomains: [domain],
            resourceTypes : [
              'main_frame','sub_frame','xmlhttprequest','script',
              'image','media','font','stylesheet','other','ping',
            ],
          },
        });
      }
    }

    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: managedIds,
      addRules     : addRules,
    });
  }

  // ─── List Management ──────────────────────────────────────────────────────

  async enableList(listName, enabled) {
    const validLists = Object.keys(this.LIST_ID_RANGES);
    if (!validLists.includes(listName)) {
      throw new Error(`Unknown list: ${listName}. Valid: ${validLists.join(', ')}`);
    }

    const status = await this._getListStatus();
    if (!status[listName]) status[listName] = {};
    status[listName].enabled = Boolean(enabled);

    await this._setStorage(this.STORAGE_KEY_LIST_STATUS, status);
    await this.applyAllDnrRules();
    return { listName, enabled: Boolean(enabled) };
  }

  async getListStatus() {
    const status = await this._getListStatus();
    const result = {};

    for (const [name, range] of Object.entries(this.LIST_ID_RANGES)) {
      const domains    = name === 'custom'
        ? await this.getCustomRules()
        : (this.BUILT_IN_DOMAINS[name] || []);

      result[name] = {
        enabled   : status[name] ? status[name].enabled : true,
        ruleCount : Math.min(domains.length, range.end - range.start + 1),
      };
    }

    return result;
  }

  // ─── Statistics ───────────────────────────────────────────────────────────

  async getStats() {
    const stats = await this._getStorage(this.STORAGE_KEY_STATS, {
      totalBlocked: 0,
      todayBlocked: 0,
      lastReset   : new Date().toDateString(),
      topDomains  : {},
    });

    // Auto-reset daily counter
    const today = new Date().toDateString();
    if (stats.lastReset !== today) {
      stats.todayBlocked = 0;
      stats.lastReset    = today;
      await this._setStorage(this.STORAGE_KEY_STATS, stats);
    }

    // Build top-domains sorted array
    const topDomains = Object.entries(stats.topDomains || {})
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalBlocked: stats.totalBlocked || 0,
      todayBlocked: stats.todayBlocked || 0,
      topDomains  : topDomains,
    };
  }

  async incrementBlockCount(domain) {
    const stats = await this._getStorage(this.STORAGE_KEY_STATS, {
      totalBlocked: 0,
      todayBlocked: 0,
      lastReset   : new Date().toDateString(),
      topDomains  : {},
    });

    const today = new Date().toDateString();
    if (stats.lastReset !== today) {
      stats.todayBlocked = 0;
      stats.lastReset    = today;
    }

    stats.totalBlocked = (stats.totalBlocked || 0) + 1;
    stats.todayBlocked = (stats.todayBlocked || 0) + 1;

    if (domain) {
      if (!stats.topDomains) stats.topDomains = {};
      stats.topDomains[domain] = (stats.topDomains[domain] || 0) + 1;

      // Prune to top 200 domains to avoid storage bloat
      const entries = Object.entries(stats.topDomains);
      if (entries.length > 200) {
        entries.sort((a, b) => b[1] - a[1]);
        stats.topDomains = Object.fromEntries(entries.slice(0, 200));
      }
    }

    await this._setStorage(this.STORAGE_KEY_STATS, stats);
  }

  // ─── Custom Rules ─────────────────────────────────────────────────────────

  async addCustomRule(domain) {
    if (!domain || typeof domain !== 'string') throw new Error('Invalid domain');

    // Normalize
    domain = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');

    const rules = await this.getCustomRules();
    if (rules.includes(domain)) return { domain, added: false, reason: 'already exists' };

    rules.push(domain);
    await this._setStorage(this.STORAGE_KEY_CUSTOM_RULES, rules);
    await this.applyAllDnrRules();
    return { domain, added: true };
  }

  async removeCustomRule(domain) {
    domain = domain.trim().toLowerCase();
    const rules = await this.getCustomRules();
    const idx   = rules.indexOf(domain);
    if (idx === -1) return { domain, removed: false };

    rules.splice(idx, 1);
    await this._setStorage(this.STORAGE_KEY_CUSTOM_RULES, rules);
    await this.applyAllDnrRules();
    return { domain, removed: true };
  }

  async getCustomRules() {
    return this._getStorage(this.STORAGE_KEY_CUSTOM_RULES, []);
  }

  async exportCustomRules() {
    const rules = await this.getCustomRules();
    return rules.join('\n');
  }

  async importCustomRules(text) {
    if (!text || typeof text !== 'string') throw new Error('Invalid input');

    const lines = text
      .split('\n')
      .map((l) => l.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, ''))
      .filter((l) => l.length > 0 && !l.startsWith('#') && l.includes('.'));

    // Deduplicate
    const unique = [...new Set(lines)];

    await this._setStorage(this.STORAGE_KEY_CUSTOM_RULES, unique);
    await this.applyAllDnrRules();
    return { imported: unique.length, domains: unique };
  }

  // ─── Cosmetic Filters ─────────────────────────────────────────────────────

  async injectCosmeticFilters(tabId) {
    if (!tabId) throw new Error('tabId is required');

    try {
      await chrome.scripting.insertCSS({
        target: { tabId: tabId },
        css   : this.COSMETIC_CSS,
      });
      return { injected: true, tabId };
    } catch (err) {
      console.warn('[TrackerBlocker] insertCSS failed for tab', tabId, err.message);
      return { injected: false, tabId, error: err.message };
    }
  }
}

if (typeof self !== 'undefined') self.TrackerBlocker = TrackerBlocker;
