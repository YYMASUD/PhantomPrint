/**
 * PhantomPrint — Automation API
 * Allows external tools (Selenium, Puppeteer, Playwright) to control the extension.
 * Exposes profile management, fingerprint control, and monitoring via messaging.
 * Runs in service worker context.
 * @module modules/automation-api
 */
'use strict';

const AutomationAPI = {
  /** @type {boolean} Whether API is enabled */
  _enabled: false,
  /** @type {string|null} API key for authentication */
  _apiKey: null,
  /** @type {number} Rate limit counter */
  _requestCount: 0,
  /** @type {number} Rate limit window start */
  _windowStart: 0,
  /** @type {number} Max requests per minute */
  MAX_REQUESTS_PER_MINUTE: 100,
  /** @type {Array} Audit log */
  _auditLog: [],

  /**
   * Initialize the automation API
   * @returns {Promise<void>}
   */
  async init() {
    const result = await chrome.storage.local.get(['pp_api_enabled', 'pp_api_key', 'pp_audit_log']);
    this._enabled = result.pp_api_enabled || false;
    this._apiKey = result.pp_api_key || null;
    this._auditLog = result.pp_audit_log || [];

    // Register external message listener
    if (chrome.runtime.onMessageExternal) {
      chrome.runtime.onMessageExternal.addListener(
        (message, sender, sendResponse) => {
          this._handleExternalMessage(message, sender, sendResponse);
          return true; // Keep channel open for async response
        }
      );
    }
  },

  /**
   * Generate a new API key
   * @returns {Promise<string>}
   */
  async generateApiKey() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    const key = 'pp_' + Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
    this._apiKey = key;
    await chrome.storage.local.set({ pp_api_key: key });
    return key;
  },

  /**
   * Enable or disable the API
   * @param {boolean} enabled
   * @returns {Promise<void>}
   */
  async setEnabled(enabled) {
    this._enabled = enabled;
    await chrome.storage.local.set({ pp_api_enabled: enabled });
  },

  /**
   * Check rate limiting
   * @returns {boolean} true if within limits
   * @private
   */
  _checkRateLimit() {
    const now = Date.now();
    if (now - this._windowStart > 60000) {
      this._windowStart = now;
      this._requestCount = 0;
    }
    this._requestCount++;
    return this._requestCount <= this.MAX_REQUESTS_PER_MINUTE;
  },

  /**
   * Authenticate a request
   * @param {string} key - Provided API key
   * @returns {boolean}
   * @private
   */
  _authenticate(key) {
    if (!this._apiKey) return false;
    return key === this._apiKey;
  },

  /**
   * Log an API call for auditing
   * @param {string} action - Action performed
   * @param {string} senderId - Sender extension/origin ID
   * @param {boolean} success - Whether it succeeded
   * @private
   */
  async _log(action, senderId, success) {
    const entry = {
      action,
      senderId,
      success,
      timestamp: new Date().toISOString()
    };
    this._auditLog.unshift(entry);
    if (this._auditLog.length > 500) this._auditLog = this._auditLog.slice(0, 500);
    // Persist periodically
    if (this._auditLog.length % 20 === 0) {
      await chrome.storage.local.set({ pp_audit_log: this._auditLog.slice(0, 200) });
    }
  },

  /**
   * Handle external message from another extension or tool
   * @param {Object} message
   * @param {Object} sender
   * @param {Function} sendResponse
   * @private
   */
  async _handleExternalMessage(message, sender, sendResponse) {
    // Check if API is enabled
    if (!this._enabled) {
      sendResponse({ error: 'API is disabled', code: 'DISABLED' });
      return;
    }

    // Rate limiting
    if (!this._checkRateLimit()) {
      sendResponse({ error: 'Rate limit exceeded', code: 'RATE_LIMITED' });
      return;
    }

    // Authentication
    if (!this._authenticate(message.apiKey)) {
      await this._log(message.action || 'unknown', sender.id || 'unknown', false);
      sendResponse({ error: 'Invalid API key', code: 'UNAUTHORIZED' });
      return;
    }

    const senderId = sender.id || sender.origin || 'unknown';

    try {
      let result;
      switch (message.action) {
        case 'getFingerprint':
          result = await this._getFingerprint();
          break;
        case 'setProfile':
          result = await this._setProfile(message.profileId);
          break;
        case 'randomize':
          result = await this._randomize();
          break;
        case 'setProxy':
          result = await this._setProxy(message.proxy);
          break;
        case 'getStats':
          result = await this._getStats();
          break;
        case 'createProfile':
          result = await this._createProfile(message.params);
          break;
        case 'listProfiles':
          result = await this._listProfiles();
          break;
        case 'exportProfiles':
          result = await this._exportProfiles();
          break;
        case 'importProfiles':
          result = await this._importProfiles(message.data);
          break;
        case 'getProtectionScore':
          result = await this._getProtectionScore();
          break;
        case 'enable':
          result = await this._setEnabled(true);
          break;
        case 'disable':
          result = await this._setEnabled(false);
          break;
        case 'ping':
          result = { pong: true, version: chrome.runtime.getManifest().version };
          break;
        default:
          result = { error: `Unknown action: ${message.action}`, code: 'UNKNOWN_ACTION' };
      }

      await this._log(message.action, senderId, true);
      sendResponse({ success: true, data: result });
    } catch (e) {
      await this._log(message.action, senderId, false);
      sendResponse({ success: false, error: e.message });
    }
  },

  // ---------------------------------------------------------------
  // API action implementations
  // ---------------------------------------------------------------

  async _getFingerprint() {
    const state = await chrome.storage.local.get('phantomprint_state');
    return {
      sessionSeed: state.phantomprint_state?.sessionSeed,
      enabled: state.phantomprint_state?.enabled,
      categories: state.phantomprint_state?.categories
    };
  },

  async _setProfile(profileId) {
    const state = await chrome.storage.local.get('phantomprint_state');
    const s = state.phantomprint_state || {};
    if (!s.savedProfiles?.[profileId]) {
      return { error: 'Profile not found' };
    }
    s.sessionSeed = s.savedProfiles[profileId].sessionSeed || `profile-${Date.now()}`;
    await chrome.storage.local.set({ phantomprint_state: s });
    return { applied: profileId };
  },

  async _randomize() {
    const state = await chrome.storage.local.get('phantomprint_state');
    const s = state.phantomprint_state || {};
    s.sessionSeed = `api-${Date.now()}-${Math.random().toString(36).substr(2)}`;
    await chrome.storage.local.set({ phantomprint_state: s });
    return { newSeed: s.sessionSeed };
  },

  async _setProxy(proxy) {
    if (typeof ProxyManager !== 'undefined') {
      const entry = await ProxyManager.addProxy(proxy);
      const result = await ProxyManager.activate(entry.id);
      return { proxyId: entry.id, activated: result.success };
    }
    return { error: 'ProxyManager not available' };
  },

  async _getStats() {
    if (typeof MonitoringEngine !== 'undefined') {
      return MonitoringEngine.getStats();
    }
    return { totalCalls: 0, totalSites: 0 };
  },

  async _createProfile(params) {
    const state = await chrome.storage.local.get('phantomprint_state');
    const s = state.phantomprint_state || {};
    if (!s.savedProfiles) s.savedProfiles = {};
    const name = params.name || `API Profile ${Date.now()}`;
    s.savedProfiles[name] = {
      ...params,
      sessionSeed: params.sessionSeed || `api-${Date.now()}-${Math.random().toString(36).substr(2)}`,
      createdAt: new Date().toISOString()
    };
    await chrome.storage.local.set({ phantomprint_state: s });
    return { created: name };
  },

  async _listProfiles() {
    const state = await chrome.storage.local.get('phantomprint_state');
    return Object.keys(state.phantomprint_state?.savedProfiles || {});
  },

  async _exportProfiles() {
    const state = await chrome.storage.local.get('phantomprint_state');
    return state.phantomprint_state?.savedProfiles || {};
  },

  async _importProfiles(data) {
    if (!data || typeof data !== 'object') return { error: 'Invalid data' };
    const state = await chrome.storage.local.get('phantomprint_state');
    const s = state.phantomprint_state || {};
    if (!s.savedProfiles) s.savedProfiles = {};
    let imported = 0;
    for (const [name, profile] of Object.entries(data)) {
      s.savedProfiles[name] = profile;
      imported++;
    }
    await chrome.storage.local.set({ phantomprint_state: s });
    return { imported };
  },

  async _getProtectionScore() {
    const state = await chrome.storage.local.get('phantomprint_state');
    const s = state.phantomprint_state || {};
    let score = 0;
    if (s.enabled) score += 20;
    const cats = s.categories || {};
    const totalCats = Object.keys(cats).length || 1;
    const enabledCats = Object.values(cats).filter(v => v).length;
    score += Math.round((enabledCats / totalCats) * 60);
    if (s.crossSiteIsolation) score += 10;
    if (s.whitelist?.length > 0) score += 5;
    score += 5; // Data sources loaded bonus
    return { score: Math.min(100, score) };
  },

  async _setEnabled(enabled) {
    const state = await chrome.storage.local.get('phantomprint_state');
    const s = state.phantomprint_state || {};
    s.enabled = enabled;
    await chrome.storage.local.set({ phantomprint_state: s });
    return { enabled };
  },

  /**
   * Get audit log
   * @returns {Array}
   */
  getAuditLog() {
    return this._auditLog;
  }
};

// Export
if (typeof globalThis !== 'undefined') globalThis.AutomationAPI = AutomationAPI;
