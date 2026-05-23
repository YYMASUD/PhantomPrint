/**
 * @file session-replay-prevention.js
 * @description Blocks session replay and user-monitoring scripts via Chrome DNR rules.
 * Covers 40+ known replay/analytics vendor script URLs.
 * Runs in the PhantomPrint service worker. No ES module imports needed.
 */

class SessionReplayPrevention {
  /**
   * Known session replay and behaviour-analytics script URL patterns.
   * Rule IDs 2000–2099 are reserved for this module.
   * @type {string[]}
   */
  static REPLAY_SCRIPT_URLS = [
    // Hotjar
    'static.hotjar.com',
    'script.hotjar.com',
    'vars.hotjar.com',
    // FullStory
    'fullstory.com/s/fs.js',
    'rs.fullstory.com',
    'edge.fullstory.com',
    // LogRocket
    'cdn.logrocket.io',
    'cdn.lr-ingest.io',
    'cdn.lr-intake.com',
    // Mouseflow
    'cdn.mouseflow.com',
    'mouseflow.com/projects',
    // Microsoft Clarity
    'clarity.ms/clarity.js',
    'www.clarity.ms/tag',
    // Heap Analytics
    'cdn.heapanalytics.com',
    'heapanalytics.com/js',
    // Smartlook
    'web-sdk.smartlook.com',
    'rec.smartlook.com',
    // Crazy Egg
    'script.crazyegg.com',
    'd10lpsik1i8c69.cloudfront.net',
    // Inspectlet
    'cdn.inspectlet.com',
    'www.inspectlet.com/inspectlet.js',
    // Yandex Metrica
    'mc.yandex.ru/metrika/watch.js',
    'mc.yandex.ru/metrika/tag.js',
    'mc.yandex.com/metrika',
    // Quantum Metric
    'cdn.quantummetric.com',
    'ptl.quantummetric.com',
    // Contentsquare / UXAnalytics
    'z.cs-cdn.net',
    'z2.cs-cdn.net',
    'uxa-production.cs-cdn.net',
    // Glassbox
    'gbq.glassboxdigital.io',
    'cdn.glassboxdigital.io',
    // Dynatrace
    'js-cdn.dynatrace.com',
    'bf10542.live.dynatrace.com',
    // Qualtrics XM
    'siteintercept.qualtrics.com/WRSiteInterceptEngine',
    'eus.qualtrics.com/WRSiteInterceptEngine',
    // Medallia
    'resources.digital-cloud.medallia.com',
    'cx-resources.medallia.com',
    // UserTesting
    'assets.usertesting.com',
    'sdk.usertesting.com',
    // VWO (session recording portion)
    'dev.visualwebsiteoptimizer.com/deploy/js_visitor_settings.php',
    'cdn.pushwoosh.com/webpush.js',
    // Lucky Orange
    'lo.io/lucky.js',
    'd10lpsik1i8c69.cloudfront.net',
    // SessionCam
    'cdn.sessioncam.com/static',
    // Decibel Insight / Medallia DXA
    'cdn.decibelinsight.net',
    // Mopinion
    'deploy.mopinion.com',
    // WalkMe
    'prd-cdn.walkme.com',
    // Pendo
    'cdn.pendo.io/agent/static',
    // Appcues
    'fast.appcues.com',
    // TryMyUI
    'assets.trymyui.com'
  ];

  constructor() {
    this.STORAGE_KEY_ENABLED = 'phantomprint_replay_enabled';
    this.STORAGE_KEY_BLOCKED_SITES = 'phantomprint_replay_blocked_sites';
    this.STORAGE_KEY_BLOCKED_COUNT = 'phantomprint_replay_blocked_count';
    this.RULE_ID_START = 2000;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DNR Rule Helpers
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Generate a DNR block rule for a given URL pattern substring.
   * @private
   * @param {string} urlPart - URL fragment to match
   * @param {number} ruleId
   * @returns {chrome.declarativeNetRequest.Rule}
   */
  _buildBlockRule(urlPart, ruleId) {
    return {
      id: ruleId,
      priority: 1,
      action: { type: 'block' },
      condition: {
        urlFilter: `*${urlPart}*`,
        resourceTypes: ['script', 'xmlhttprequest', 'other']
      }
    };
  }

  /**
   * Generate all DNR block rules for every known replay script.
   * @returns {chrome.declarativeNetRequest.Rule[]}
   */
  _buildAllRules() {
    return SessionReplayPrevention.REPLAY_SCRIPT_URLS.map((url, index) =>
      this._buildBlockRule(url, this.RULE_ID_START + index)
    );
  }

  /**
   * Get the full list of rule IDs used by this module.
   * @returns {number[]}
   */
  _getRuleIds() {
    return SessionReplayPrevention.REPLAY_SCRIPT_URLS.map((_, i) => this.RULE_ID_START + i);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Enable session replay blocking by installing all DNR rules.
   * @returns {Promise<void>}
   */
  async enable() {
    const rules = this._buildAllRules();
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: this._getRuleIds(),
      addRules: rules
    });
    await chrome.storage.local.set({ [this.STORAGE_KEY_ENABLED]: true });
  }

  /**
   * Disable session replay blocking by removing all DNR rules.
   * @returns {Promise<void>}
   */
  async disable() {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: this._getRuleIds(),
      addRules: []
    });
    await chrome.storage.local.set({ [this.STORAGE_KEY_ENABLED]: false });
  }

  /**
   * Get the current status of replay prevention.
   * @returns {Promise<{enabled: boolean, blockedCount: number, detectedSites: string[]}>}
   */
  async getStatus() {
    const data = await chrome.storage.local.get([
      this.STORAGE_KEY_ENABLED,
      this.STORAGE_KEY_BLOCKED_COUNT,
      this.STORAGE_KEY_BLOCKED_SITES
    ]);
    return {
      enabled:       !!data[this.STORAGE_KEY_ENABLED],
      blockedCount:  data[this.STORAGE_KEY_BLOCKED_COUNT] || 0,
      detectedSites: data[this.STORAGE_KEY_BLOCKED_SITES] || []
    };
  }

  /**
   * Record that a replay script was detected and loaded on a site.
   * @param {string} domain
   * @returns {Promise<void>}
   */
  async addBlockedSite(domain) {
    const data = await chrome.storage.local.get([
      this.STORAGE_KEY_BLOCKED_SITES,
      this.STORAGE_KEY_BLOCKED_COUNT
    ]);
    const sites = data[this.STORAGE_KEY_BLOCKED_SITES] || [];
    const count = (data[this.STORAGE_KEY_BLOCKED_COUNT] || 0) + 1;
    if (!sites.includes(domain)) sites.push(domain);
    await chrome.storage.local.set({
      [this.STORAGE_KEY_BLOCKED_SITES]: sites,
      [this.STORAGE_KEY_BLOCKED_COUNT]: count
    });
  }

  /**
   * Get the list of domains where replay tools were detected.
   * @returns {Promise<string[]>}
   */
  async getBlockedSites() {
    const data = await chrome.storage.local.get(this.STORAGE_KEY_BLOCKED_SITES);
    return data[this.STORAGE_KEY_BLOCKED_SITES] || [];
  }

  /**
   * Return the static list of URL patterns used for blocking.
   * Useful for content scripts that need to detect these patterns.
   * @returns {string[]}
   */
  getReplayUrlPatterns() {
    return [...SessionReplayPrevention.REPLAY_SCRIPT_URLS];
  }
}

if (typeof self !== 'undefined') self.SessionReplayPrevention = SessionReplayPrevention;
