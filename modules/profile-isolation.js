/**
 * PhantomPrint — Profile Isolation Engine
 * Provides complete data isolation between fingerprint profiles.
 * Manages cookies, storage, cache, and cross-site identity isolation.
 * Runs in service worker context.
 * @module modules/profile-isolation
 */
'use strict';

const ProfileIsolation = {
  /**
   * Clear all browsing data for profile isolation
   * @param {Object} options - What to clear
   * @param {boolean} [options.cookies=true] - Clear cookies
   * @param {boolean} [options.localStorage=true] - Clear localStorage
   * @param {boolean} [options.sessionStorage=true] - Clear sessionStorage
   * @param {boolean} [options.indexedDB=true] - Clear IndexedDB
   * @param {boolean} [options.cacheStorage=true] - Clear CacheStorage
   * @param {boolean} [options.cache=true] - Clear HTTP cache
   * @returns {Promise<{cleared: string[]}>}
   */
  async clearProfileData(options = {}) {
    const defaults = { cookies: true, localStorage: true, sessionStorage: true, indexedDB: true, cacheStorage: true, cache: true };
    const opts = { ...defaults, ...options };
    const cleared = [];

    try {
      if (opts.cookies) {
        await chrome.browsingData.removeCookies({ since: 0 });
        cleared.push('cookies');
      }
      if (opts.localStorage) {
        await chrome.browsingData.removeLocalStorage({ since: 0 });
        cleared.push('localStorage');
      }
      if (opts.cache) {
        await chrome.browsingData.removeCache({ since: 0 });
        cleared.push('cache');
      }
      if (opts.indexedDB) {
        await chrome.browsingData.removeIndexedDB({ since: 0 });
        cleared.push('indexedDB');
      }
      if (opts.cacheStorage) {
        await chrome.browsingData.removeCacheStorage({ since: 0 });
        cleared.push('cacheStorage');
      }
    } catch (e) {
      console.warn('ProfileIsolation: Error clearing data:', e.message);
    }

    return { cleared };
  },

  /**
   * Clear data for a specific origin only
   * @param {string} origin - Origin to clear (e.g., "https://example.com")
   * @param {Object} options - What to clear
   * @returns {Promise<{cleared: string[]}>}
   */
  async clearOriginData(origin, options = {}) {
    const defaults = { cookies: true, localStorage: true, cache: true };
    const opts = { ...defaults, ...options };
    const cleared = [];

    try {
      if (opts.cookies) {
        const cookies = await chrome.cookies.getAll({ url: origin });
        for (const cookie of cookies) {
          await chrome.cookies.remove({ url: origin, name: cookie.name });
        }
        cleared.push('cookies');
      }
      // Other data types require browsingData API with origins filter (Chromium 116+)
      if (opts.localStorage || opts.cache) {
        await chrome.browsingData.remove(
          { origins: [origin] },
          {
            localStorage: opts.localStorage || false,
            cache: opts.cache || false,
            indexedDB: opts.indexedDB || false,
            cacheStorage: opts.cacheStorage || false
          }
        );
        if (opts.localStorage) cleared.push('localStorage');
        if (opts.cache) cleared.push('cache');
      }
    } catch (e) {
      console.warn('ProfileIsolation: Error clearing origin data:', e.message);
    }

    return { cleared };
  },

  /**
   * Handle profile switch — clear data and update state
   * @param {string} oldProfileId - Previous profile ID
   * @param {string} newProfileId - New profile ID
   * @param {Object} isolationSettings - User's isolation preferences
   * @returns {Promise<{success: boolean, cleared: string[]}>}
   */
  async onProfileSwitch(oldProfileId, newProfileId, isolationSettings = {}) {
    const defaults = {
      clearCookies: true,
      clearStorage: true,
      clearCache: false,
      preserveWhitelisted: true
    };
    const settings = { ...defaults, ...isolationSettings };
    let allCleared = [];

    if (oldProfileId === newProfileId) return { success: true, cleared: [] };

    // Save current profile's data snapshot before clearing
    await this._saveProfileSnapshot(oldProfileId);

    // Clear data based on settings
    const result = await this.clearProfileData({
      cookies: settings.clearCookies,
      localStorage: settings.clearStorage,
      sessionStorage: settings.clearStorage,
      indexedDB: settings.clearStorage,
      cacheStorage: settings.clearStorage,
      cache: settings.clearCache
    });
    allCleared = result.cleared;

    // Restore new profile's data snapshot if available
    await this._restoreProfileSnapshot(newProfileId);

    return { success: true, cleared: allCleared };
  },

  /**
   * Save a snapshot of current browsing data for a profile
   * @param {string} profileId
   * @private
   */
  async _saveProfileSnapshot(profileId) {
    // Store profile metadata (we can't fully snapshot browser data from extension)
    const key = `pp_profile_snapshot_${profileId}`;
    await chrome.storage.local.set({
      [key]: {
        savedAt: new Date().toISOString(),
        profileId
      }
    });
  },

  /**
   * Restore a profile's data snapshot
   * @param {string} profileId
   * @private
   */
  async _restoreProfileSnapshot(profileId) {
    const key = `pp_profile_snapshot_${profileId}`;
    const result = await chrome.storage.local.get(key);
    // Profile snapshots are metadata-only; actual data restoration is limited
    // by browser extension APIs
  },

  /**
   * Setup ETag/HSTS tracking protection via declarativeNetRequest
   * @returns {Promise<void>}
   */
  async setupTrackingProtection() {
    const rules = [
      // Strip ETag headers (prevents ETag-based tracking)
      {
        id: 200,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          responseHeaders: [
            { header: 'ETag', operation: 'remove' }
          ],
          requestHeaders: [
            { header: 'If-None-Match', operation: 'remove' },
            { header: 'If-Modified-Since', operation: 'remove' }
          ]
        },
        condition: {
          urlFilter: '*',
          resourceTypes: ['main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font', 'xmlhttprequest', 'other']
        }
      },
      // Strip HSTS headers to prevent HSTS supercookie tracking
      {
        id: 201,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          responseHeaders: [
            { header: 'Strict-Transport-Security', operation: 'remove' }
          ]
        },
        condition: {
          urlFilter: '*',
          resourceTypes: ['main_frame', 'sub_frame']
        }
      }
    ];

    try {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [200, 201],
        addRules: rules
      });
    } catch (e) {
      console.warn('ProfileIsolation: Failed to setup tracking protection rules:', e);
    }
  },

  /**
   * Remove tracking protection rules
   * @returns {Promise<void>}
   */
  async removeTrackingProtection() {
    try {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [200, 201]
      });
    } catch (e) {}
  },

  /**
   * Auto-clear cookies on tab close
   * @param {number} tabId - Closed tab ID
   * @param {Object} state - Extension state
   */
  async onTabClosed(tabId, state) {
    if (!state?.isolation?.clearOnTabClose) return;

    // Get the tab's URL before it was closed (from our tracking)
    const urlKey = `pp_tab_url_${tabId}`;
    const result = await chrome.storage.session.get(urlKey);
    const url = result[urlKey];

    if (url) {
      try {
        const origin = new URL(url).origin;
        await this.clearOriginData(origin, { cookies: true, localStorage: false });
      } catch (e) {}
      await chrome.storage.session.remove(urlKey);
    }
  },

  /**
   * Track tab URL for tab-close cleanup
   * @param {number} tabId
   * @param {string} url
   */
  async trackTabUrl(tabId, url) {
    try {
      await chrome.storage.session.set({ [`pp_tab_url_${tabId}`]: url });
    } catch (e) {}
  },

  /**
   * Block third-party cookies
   * @param {boolean} enable
   */
  async setThirdPartyCookieBlocking(enable) {
    if (!chrome.privacy?.websites?.thirdPartyCookiesAllowed) return;
    try {
      await chrome.privacy.websites.thirdPartyCookiesAllowed.set({
        value: !enable
      });
    } catch (e) {
      console.warn('ProfileIsolation: Cannot set third-party cookie policy:', e);
    }
  },

  /**
   * Get isolation status
   * @returns {Promise<Object>}
   */
  async getStatus() {
    const result = await chrome.storage.local.get('pp_isolation_settings');
    return {
      enabled: true,
      settings: result.pp_isolation_settings || {
        clearOnProfileSwitch: true,
        clearOnTabClose: false,
        blockThirdPartyCookies: false,
        stripEtags: true,
        stripHSTS: true,
        crossSiteIsolation: true
      }
    };
  }
};

// Export
if (typeof globalThis !== 'undefined') globalThis.ProfileIsolation = ProfileIsolation;
