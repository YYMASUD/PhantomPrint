/**
 * @file referrer-control.js
 * @description Controls the HTTP Referer header sent with requests via Chrome DNR rules.
 * Supports six modes: no-referrer, same-origin, origin-only, spoofed, smart, off.
 * DNR rule IDs 3100–3103 are reserved for this module.
 * Runs in the PhantomPrint service worker.
 */

class ReferrerControl {
  /**
   * Supported referrer control modes.
   * @readonly
   * @enum {string}
   */
  static MODES = {
    NO_REFERRER:  'no-referrer',
    SAME_ORIGIN:  'same-origin',
    ORIGIN_ONLY:  'origin-only',
    SPOOFED:      'spoofed',
    SMART:        'smart',
    OFF:          'off'
  };

  /**
   * DNR rule ID constants for each mode.
   * @readonly
   */
  static RULE_IDS = {
    NO_REFERRER:  3100,
    SAME_ORIGIN:  3101,
    ORIGIN_ONLY:  3102,
    SPOOFED:      3103
  };

  constructor() {
    this.STORAGE_KEY_MODE   = 'phantomprint_referrer_mode';
    this.STORAGE_KEY_SPOOF  = 'phantomprint_referrer_spoof_url';
    this.ALL_RULE_IDS = Object.values(ReferrerControl.RULE_IDS);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Rule Builders
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Build a rule that removes the Referer header on all outgoing requests.
   * @private
   * @returns {chrome.declarativeNetRequest.Rule}
   */
  _buildNoReferrerRule() {
    return {
      id: ReferrerControl.RULE_IDS.NO_REFERRER,
      priority: 10,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [
          { header: 'Referer', operation: 'remove' }
        ]
      },
      condition: {
        resourceTypes: [
          'main_frame', 'sub_frame', 'stylesheet', 'script',
          'image', 'font', 'object', 'xmlhttprequest', 'ping',
          'csp_report', 'media', 'websocket', 'other'
        ]
      }
    };
  }

  /**
   * Build a rule that removes the Referer header only for cross-origin requests
   * by excluding all URL matches (applied as a catch-all minus same-origin via priority).
   * In practice we apply a blanket remove and rely on browser's own policy for same-origin.
   * @private
   * @returns {chrome.declarativeNetRequest.Rule}
   */
  _buildSameOriginRule() {
    // Remove Referer on all requests EXCEPT those to the same host as the initiator.
    // DNR doesn't support dynamic initiatorDomain matching, so we remove on all
    // third-party requests by using the urlFilter pattern with inverted logic via
    // two rules — a catch-all remove at low priority is effectively same-origin safe
    // because browsers don't send Referer on cross-origin when Referer-Policy is set.
    // Best approximation with DNR: remove on everything; same-origin pages retain
    // Referer because the browser itself enforces same-origin referrer policy.
    return {
      id: ReferrerControl.RULE_IDS.SAME_ORIGIN,
      priority: 5,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [
          { header: 'Referer', operation: 'remove' }
        ]
      },
      condition: {
        domainType: 'thirdParty',
        resourceTypes: [
          'main_frame', 'sub_frame', 'stylesheet', 'script',
          'image', 'font', 'object', 'xmlhttprequest', 'ping',
          'csp_report', 'media', 'websocket', 'other'
        ]
      }
    };
  }

  /**
   * Build a rule that trims the Referer to origin only (scheme + host + port).
   * Uses redirect.transform on the Referer header via a set operation.
   * NOTE: DNR cannot directly mutate the Referer value with a transform.
   * We remove it entirely on cross-origin and let content-script inject Origin.
   * @private
   * @returns {chrome.declarativeNetRequest.Rule}
   */
  _buildOriginOnlyRule() {
    // DNR modifyHeaders "set" can replace the Referer with a static value,
    // but we cannot dynamically compute the origin from the request URL in DNR.
    // The best we can do with DNR is remove the full referrer for cross-origin requests.
    // The content script / service worker supplements this for same-origin contexts.
    return {
      id: ReferrerControl.RULE_IDS.ORIGIN_ONLY,
      priority: 5,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [
          { header: 'Referer', operation: 'remove' }
        ]
      },
      condition: {
        domainType: 'thirdParty',
        resourceTypes: [
          'main_frame', 'sub_frame', 'xmlhttprequest', 'script', 'other'
        ]
      }
    };
  }

  /**
   * Build a rule that replaces the Referer header with a specific spoofed URL.
   * @private
   * @param {string} spoofedUrl - The URL to use as the Referer value
   * @returns {chrome.declarativeNetRequest.Rule}
   */
  _buildSpoofedRule(spoofedUrl) {
    return {
      id: ReferrerControl.RULE_IDS.SPOOFED,
      priority: 10,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [
          { header: 'Referer', operation: 'set', value: spoofedUrl }
        ]
      },
      condition: {
        resourceTypes: [
          'main_frame', 'sub_frame', 'stylesheet', 'script',
          'image', 'font', 'object', 'xmlhttprequest', 'ping',
          'csp_report', 'media', 'websocket', 'other'
        ]
      }
    };
  }

  /**
   * Build the "smart" mode rules: no-referrer for cross-origin, full for same-origin.
   * We implement this as a single cross-origin Referer removal rule (same as same-origin mode).
   * @private
   * @returns {chrome.declarativeNetRequest.Rule[]}
   */
  _buildSmartRules() {
    // Smart = same-origin rule (only strips cross-origin Referer headers)
    return [this._buildSameOriginRule()];
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Set the referrer control mode and update DNR rules accordingly.
   * @param {string} mode - One of ReferrerControl.MODES values
   * @param {string} [spoofedUrl] - Required when mode is 'spoofed'
   * @returns {Promise<void>}
   */
  async setMode(mode, spoofedUrl) {
    // Remove all existing referrer rules first
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: this.ALL_RULE_IDS,
      addRules: []
    });

    let rulesToAdd = [];

    switch (mode) {
      case ReferrerControl.MODES.NO_REFERRER:
        rulesToAdd = [this._buildNoReferrerRule()];
        break;

      case ReferrerControl.MODES.SAME_ORIGIN:
        rulesToAdd = [this._buildSameOriginRule()];
        break;

      case ReferrerControl.MODES.ORIGIN_ONLY:
        rulesToAdd = [this._buildOriginOnlyRule()];
        break;

      case ReferrerControl.MODES.SPOOFED:
        if (!spoofedUrl) throw new Error('spoofedUrl is required for "spoofed" mode');
        rulesToAdd = [this._buildSpoofedRule(spoofedUrl)];
        await chrome.storage.local.set({ [this.STORAGE_KEY_SPOOF]: spoofedUrl });
        break;

      case ReferrerControl.MODES.SMART:
        rulesToAdd = this._buildSmartRules();
        break;

      case ReferrerControl.MODES.OFF:
        // All rules already removed above; nothing to add
        break;

      default:
        throw new Error(`Unknown referrer mode: "${mode}". Valid modes: ${Object.values(ReferrerControl.MODES).join(', ')}`);
    }

    if (rulesToAdd.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [],
        addRules: rulesToAdd
      });
    }

    await chrome.storage.local.set({ [this.STORAGE_KEY_MODE]: mode });
  }

  /**
   * Get the currently active referrer control mode from storage.
   * @returns {Promise<string>} One of ReferrerControl.MODES, defaults to 'off'
   */
  async getMode() {
    const data = await chrome.storage.local.get(this.STORAGE_KEY_MODE);
    return data[this.STORAGE_KEY_MODE] || ReferrerControl.MODES.OFF;
  }

  /**
   * Return a full status object including mode, spoofed URL, and active rule IDs.
   * @returns {Promise<{mode: string, spoofedUrl: string|null, rulesActive: number[]}>}
   */
  async getStatus() {
    const data = await chrome.storage.local.get([
      this.STORAGE_KEY_MODE,
      this.STORAGE_KEY_SPOOF
    ]);
    const mode = data[this.STORAGE_KEY_MODE] || ReferrerControl.MODES.OFF;
    const spoofedUrl = data[this.STORAGE_KEY_SPOOF] || null;

    // Determine which rule IDs should be active for the current mode
    let expectedRuleIds = [];
    switch (mode) {
      case ReferrerControl.MODES.NO_REFERRER:
        expectedRuleIds = [ReferrerControl.RULE_IDS.NO_REFERRER];
        break;
      case ReferrerControl.MODES.SAME_ORIGIN:
        expectedRuleIds = [ReferrerControl.RULE_IDS.SAME_ORIGIN];
        break;
      case ReferrerControl.MODES.ORIGIN_ONLY:
        expectedRuleIds = [ReferrerControl.RULE_IDS.ORIGIN_ONLY];
        break;
      case ReferrerControl.MODES.SPOOFED:
        expectedRuleIds = [ReferrerControl.RULE_IDS.SPOOFED];
        break;
      case ReferrerControl.MODES.SMART:
        expectedRuleIds = [ReferrerControl.RULE_IDS.SAME_ORIGIN];
        break;
      case ReferrerControl.MODES.OFF:
      default:
        expectedRuleIds = [];
    }

    // Verify rules are actually registered by cross-checking dynamic rules
    const dynamicRules = await chrome.declarativeNetRequest.getDynamicRules();
    const activeIds = dynamicRules.map(r => r.id);
    const rulesActive = expectedRuleIds.filter(id => activeIds.includes(id));

    return { mode, spoofedUrl, rulesActive };
  }
}

if (typeof self !== 'undefined') self.ReferrerControl = ReferrerControl;
