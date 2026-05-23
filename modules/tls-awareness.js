/**
 * PhantomPrint — TLS/JA3/JA4 Fingerprint Awareness
 * Detects TLS fingerprint mismatches and warns users.
 * Cannot modify TLS handshake (browser-level), but detects and advises.
 * Runs in service worker context.
 * @module modules/tls-awareness
 */
'use strict';

const TLSAwareness = {
  /** @type {Object|null} Loaded TLS fingerprint database */
  _database: null,
  /** @type {Object|null} Last detected TLS fingerprint */
  _lastDetected: null,
  /** @type {string|null} Detection endpoint URL */
  _endpoint: 'https://tools.scrapfly.io/api/fp/ja3',

  /**
   * Load TLS fingerprint database from extension resources
   * @returns {Promise<Object|null>}
   */
  async loadDatabase() {
    if (this._database) return this._database;
    try {
      const resp = await fetch(chrome.runtime.getURL('data/tls-fingerprints.json'));
      this._database = await resp.json();
      return this._database;
    } catch (e) {
      console.warn('TLSAwareness: Failed to load TLS database:', e);
      return null;
    }
  },

  /**
   * Detect user's real JA3/JA4 fingerprint via external endpoint
   * @returns {Promise<{ja3: string, ja4: string, raw: string}|null>}
   */
  async detectRealFingerprint() {
    try {
      const response = await fetch(this._endpoint, {
        method: 'GET',
        cache: 'no-store'
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      this._lastDetected = {
        ja3: data.ja3 || data.digest || '',
        ja4: data.ja4 || '',
        raw: data.ja3_text || data.raw || '',
        detectedAt: new Date().toISOString()
      };
      return this._lastDetected;
    } catch (e) {
      console.warn('TLSAwareness: Detection failed (endpoint may be unavailable):', e.message);
      // Try fallback endpoint
      try {
        const fallback = await fetch('https://tls.browserleaks.com/json', { cache: 'no-store' });
        const data = await fallback.json();
        this._lastDetected = {
          ja3: data.ja3_hash || '',
          ja4: '',
          raw: data.ja3_text || '',
          detectedAt: new Date().toISOString()
        };
        return this._lastDetected;
      } catch (e2) {
        return null;
      }
    }
  },

  /**
   * Find matching browser profile from database based on JA3 hash
   * @param {string} ja3Hash - Detected JA3 hash
   * @returns {Object|null} Matching database entry
   */
  findMatch(ja3Hash) {
    if (!this._database?.fingerprints || !ja3Hash) return null;
    return this._database.fingerprints.find(fp => fp.ja3 === ja3Hash) || null;
  },

  /**
   * Compare detected TLS fingerprint against spoofed UA
   * @param {string} spoofedUA - Current spoofed User-Agent string
   * @returns {Promise<Object>} Comparison result
   */
  async compareWithSpoofedUA(spoofedUA) {
    const db = await this.loadDatabase();
    const detected = this._lastDetected || await this.detectRealFingerprint();

    if (!detected) {
      return {
        status: 'unknown',
        message: 'Could not detect TLS fingerprint (endpoint unavailable)',
        recommendation: 'TLS fingerprint check unavailable. Spoof within same browser family for safety.'
      };
    }

    // Parse spoofed UA to determine browser/version
    const spoofedBrowser = this._parseBrowser(spoofedUA);
    const realMatch = detected.ja3 ? this.findMatch(detected.ja3) : null;

    // Determine real browser from TLS fingerprint
    const realBrowser = realMatch ? {
      browser: realMatch.browser,
      version: realMatch.version,
      os: realMatch.os
    } : this._guessFromJA3(detected.raw);

    // Compare
    if (!realBrowser || !spoofedBrowser) {
      return {
        status: 'unknown',
        realJa3: detected.ja3,
        realBrowser: realBrowser?.browser || 'Unknown',
        spoofedBrowser: spoofedBrowser?.browser || 'Unknown',
        message: 'Could not determine browser from TLS fingerprint',
        recommendation: 'Spoof within same browser family for safety'
      };
    }

    const sameFamily = realBrowser.browser.toLowerCase() === spoofedBrowser.browser.toLowerCase() ||
      (this._isChromiumFamily(realBrowser.browser) && this._isChromiumFamily(spoofedBrowser.browser));

    if (sameFamily) {
      return {
        status: 'match',
        realJa3: detected.ja3,
        realBrowser: `${realBrowser.browser} ${realBrowser.version || ''}`.trim(),
        spoofedBrowser: `${spoofedBrowser.browser} ${spoofedBrowser.version || ''}`.trim(),
        message: `✅ TLS fingerprint matches spoofed browser family (${spoofedBrowser.browser})`,
        recommendation: 'Good! Your TLS fingerprint is consistent with your spoofed identity.'
      };
    } else {
      return {
        status: 'mismatch',
        realJa3: detected.ja3,
        realBrowser: `${realBrowser.browser} ${realBrowser.version || ''}`.trim(),
        spoofedBrowser: `${spoofedBrowser.browser} ${spoofedBrowser.version || ''}`.trim(),
        message: `⚠️ MISMATCH: UA says ${spoofedBrowser.browser} but TLS fingerprint indicates ${realBrowser.browser}`,
        recommendation: `Anti-bot systems will detect this mismatch. Only spoof within the ${realBrowser.browser} family.`
      };
    }
  },

  /**
   * Check if browser is Chromium-based (share similar TLS fingerprints)
   * @param {string} browser
   * @returns {boolean}
   */
  _isChromiumFamily(browser) {
    const chromiumBrowsers = ['chrome', 'edge', 'opera', 'brave', 'vivaldi', 'chromium'];
    return chromiumBrowsers.includes(browser.toLowerCase());
  },

  /**
   * Parse browser info from User-Agent string
   * @param {string} ua
   * @returns {{browser: string, version: string}|null}
   */
  _parseBrowser(ua) {
    if (!ua) return null;
    if (ua.includes('Firefox/')) {
      const m = ua.match(/Firefox\/([\d.]+)/);
      return { browser: 'Firefox', version: m?.[1] || '' };
    }
    if (ua.includes('Edg/')) {
      const m = ua.match(/Edg\/([\d.]+)/);
      return { browser: 'Edge', version: m?.[1] || '' };
    }
    if (ua.includes('OPR/')) {
      const m = ua.match(/OPR\/([\d.]+)/);
      return { browser: 'Opera', version: m?.[1] || '' };
    }
    if (ua.includes('Safari/') && !ua.includes('Chrome/')) {
      const m = ua.match(/Version\/([\d.]+)/);
      return { browser: 'Safari', version: m?.[1] || '' };
    }
    if (ua.includes('Chrome/')) {
      const m = ua.match(/Chrome\/([\d.]+)/);
      return { browser: 'Chrome', version: m?.[1] || '' };
    }
    return null;
  },

  /**
   * Guess browser from raw JA3 cipher suites
   * @param {string} raw - Raw JA3 string
   * @returns {{browser: string, version: string}|null}
   */
  _guessFromJA3(raw) {
    if (!raw) return null;
    // Chrome/Chromium typically includes GREASE values and specific TLS 1.3 ciphers
    if (raw.includes('4865') && raw.includes('4866') && raw.includes('4867')) {
      return { browser: 'Chrome', version: '' };
    }
    // Firefox uses different cipher ordering
    if (raw.includes('4865') && raw.includes('49195') && !raw.includes('4866-4867')) {
      return { browser: 'Firefox', version: '' };
    }
    // Safari
    if (raw.includes('4865') && raw.includes('49199') && raw.includes('52393')) {
      return { browser: 'Safari', version: '' };
    }
    return null;
  },

  /**
   * Get current TLS awareness status for dashboard display
   * @param {string} spoofedUA
   * @returns {Promise<Object>}
   */
  async getStatus(spoofedUA) {
    const comparison = await this.compareWithSpoofedUA(spoofedUA);
    return {
      ...comparison,
      databaseLoaded: !!this._database,
      databaseSize: this._database?.fingerprints?.length || 0,
      lastChecked: this._lastDetected?.detectedAt || null
    };
  }
};

// Export
if (typeof globalThis !== 'undefined') globalThis.TLSAwareness = TLSAwareness;
