/**
 * @file link-cleaner.js
 * @description Strips tracking query parameters from URLs using Chrome DNR rules.
 * Also provides a pure-function URL cleaner for popup/content-script use.
 * Uses DNR rule ID 3000. Runs in the PhantomPrint service worker.
 */

class LinkCleaner {
  /**
   * All known tracking query parameter names to strip from URLs.
   * @type {string[]}
   */
  static TRACKING_PARAMS = [
    // Google / Universal Analytics
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_term',
    'utm_content',
    'utm_id',
    'utm_source_platform',
    'utm_creative_format',
    'utm_marketing_tactic',
    // Google Ads
    'gclid',
    'gclsrc',
    'dclid',
    // Facebook / Meta
    'fbclid',
    // Microsoft Ads (Bing)
    'msclkid',
    // Twitter / X
    'twclid',
    // TikTok
    'ttclid',
    // LinkedIn
    'li_fat_id',
    // Mailchimp
    'mc_cid',
    'mc_eid',
    // HubSpot
    '_hsenc',
    '_hsmi',
    '__hstc',
    '__hsfp',
    '__hssc',
    // Yandex
    'yclid',
    '_openstat',
    // Wicked Reports
    'wickedid',
    // Vero
    '__s',
    'vero_id',
    // Marketo
    'mkt_tok',
    // Adobe Campaign
    's_cid',
    // IBM Coremetrics
    'icid',
    // Amazon
    'ref_',
    // Instagram
    'igshid',
    // WebTrends
    'WT.mc_id',
    // Google Analytics (legacy)
    '_ga',
    // LinkedIn Campaign tracking
    'trk',
    'trk_msg',
    'trk_contact',
    'trk_sid',
    // Matomo / Piwik
    'pk_campaign',
    'pk_kwd',
    'piwik_campaign',
    'piwik_kwd',
    // General
    'mc_cid',
    'mc_eid',
    'redirect_log_mongo_id',
    'redirect_mongo_id',
    'sb_referer_host'
  ];

  /**
   * Known redirect-wrapper URL patterns used by social / search platforms.
   * Each entry has a `host` and `param` key containing the actual URL.
   * @type {Array<{host: string, param: string}>}
   */
  static REDIRECT_WRAPPERS = [
    { host: 'google.com',       param: 'q' },
    { host: 'google.com',       param: 'url' },
    { host: 'l.facebook.com',   param: 'u' },
    { host: 'lm.facebook.com',  param: 'u' },
    { host: 'l.instagram.com',  param: 'u' },
    { host: 'out.reddit.com',   param: 'target' },
    { host: 't.co',             param: null },   // No param — t.co IS the redirect
    { host: 'r.search.yahoo.com', param: 'p' },
    { host: 'bing.com',         param: 'u' },    // bing.com/ck/a?
    { host: 'go.redirectingat.com', param: 'url' },
    { host: 'track.linksynergy.com', param: 'murl' }
  ];

  constructor() {
    this.STORAGE_KEY_ENABLED = 'phantomprint_linkcleaner_enabled';
    this.STORAGE_KEY_COUNT   = 'phantomprint_linkcleaner_count';
    this.RULE_ID = 3000;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DNR Rule Management
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Build the DNR rule that strips all tracking parameters from navigation requests.
   * Uses queryTransform.removeParams so the page still loads — only the params are removed.
   * @private
   * @returns {chrome.declarativeNetRequest.Rule}
   */
  _buildRule() {
    return {
      id: this.RULE_ID,
      priority: 1,
      action: {
        type: 'redirect',
        redirect: {
          transform: {
            queryTransform: {
              removeParams: LinkCleaner.TRACKING_PARAMS
            }
          }
        }
      },
      condition: {
        resourceTypes: ['main_frame', 'sub_frame']
      }
    };
  }

  /**
   * Install the DNR rule to strip tracking parameters on navigation.
   * @returns {Promise<void>}
   */
  async enable() {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [this.RULE_ID],
      addRules: [this._buildRule()]
    });
    await chrome.storage.local.set({ [this.STORAGE_KEY_ENABLED]: true });
  }

  /**
   * Remove the DNR tracking-parameter stripping rule.
   * @returns {Promise<void>}
   */
  async disable() {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [this.RULE_ID],
      addRules: []
    });
    await chrome.storage.local.set({ [this.STORAGE_KEY_ENABLED]: false });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Status & Counter
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Return current enabled state and total cleaned-URL count.
   * @returns {Promise<{enabled: boolean, cleanedCount: number}>}
   */
  async getStatus() {
    const data = await chrome.storage.local.get([
      this.STORAGE_KEY_ENABLED,
      this.STORAGE_KEY_COUNT
    ]);
    return {
      enabled:      !!data[this.STORAGE_KEY_ENABLED],
      cleanedCount: data[this.STORAGE_KEY_COUNT] || 0
    };
  }

  /**
   * Increment the cleaned-URL counter (called by content script / background on each match).
   * @returns {Promise<number>} New total count
   */
  async incrementCount() {
    const data = await chrome.storage.local.get(this.STORAGE_KEY_COUNT);
    const newCount = (data[this.STORAGE_KEY_COUNT] || 0) + 1;
    await chrome.storage.local.set({ [this.STORAGE_KEY_COUNT]: newCount });
    return newCount;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Utility Methods
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Return the list of tracking parameters.
   * @returns {string[]}
   */
  getTrackingParams() {
    return [...LinkCleaner.TRACKING_PARAMS];
  }

  /**
   * Pure function: strip all known tracking parameters from a URL string.
   * Also unwraps redirect wrapper URLs where possible.
   * Does not modify storage or DNR rules.
   * @param {string} url - The URL to clean
   * @returns {string} Cleaned URL (original returned if parsing fails)
   */
  cleanUrl(url) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (_) {
      return url;
    }

    // Attempt redirect-wrapper unwrapping first
    const wrapper = LinkCleaner.REDIRECT_WRAPPERS.find(w => {
      return parsed.hostname === w.host || parsed.hostname.endsWith('.' + w.host);
    });
    if (wrapper && wrapper.param) {
      const inner = parsed.searchParams.get(wrapper.param);
      if (inner) {
        try {
          // Recurse to also clean the inner URL
          return this.cleanUrl(decodeURIComponent(inner));
        } catch (_) {}
      }
    }

    // Strip tracking parameters
    let modified = false;
    for (const param of LinkCleaner.TRACKING_PARAMS) {
      if (parsed.searchParams.has(param)) {
        parsed.searchParams.delete(param);
        modified = true;
      }
    }

    // Normalise empty query string
    let result = parsed.toString();
    if (modified && parsed.searchParams.toString() === '') {
      result = result.replace(/\?$/, '');
    }
    return result;
  }
}

if (typeof self !== 'undefined') self.LinkCleaner = LinkCleaner;
