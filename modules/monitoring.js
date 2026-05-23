/**
 * PhantomPrint — Real-Time Fingerprint Monitoring
 * Tracks all fingerprint-related API calls, calculates risk scores,
 * detects known trackers, and provides statistics.
 * Runs in service worker context.
 * @module modules/monitoring
 */
'use strict';

const MonitoringEngine = {
  /** @type {Map<string, Object>} Per-site monitoring data */
  _siteData: new Map(),
  /** @type {number} Max log entries to keep per site */
  MAX_LOGS_PER_SITE: 200,
  /** @type {number} Max sites to track */
  MAX_SITES: 100,

  // Known fingerprinting script patterns
  KNOWN_TRACKERS: [
    { name: 'FingerprintJS', patterns: ['fingerprintjs', 'fpjs.io', 'cdn.jsdelivr.net/npm/@fingerprintjs', 'fpjscdn.net'] },
    { name: 'CreepJS', patterns: ['creepjs', 'abrahamjuliot.github.io/creepjs'] },
    { name: 'Cloudflare Bot', patterns: ['challenges.cloudflare.com', 'cf-chl-', 'cdn-cgi/challenge-platform'] },
    { name: 'DataDome', patterns: ['datadome.co', 'dd.datadome', 'js.datadome'] },
    { name: 'PerimeterX/HUMAN', patterns: ['perimeterx.net', 'px-cdn.net', 'px-cloud.net', 'pxchk.net'] },
    { name: 'Akamai Bot Manager', patterns: ['akamaized.net/akam', 'akamaihd.net/bm', 'ds-aksb-a.akamaihd.net'] },
    { name: 'Google reCAPTCHA', patterns: ['google.com/recaptcha', 'gstatic.com/recaptcha'] },
    { name: 'hCaptcha', patterns: ['hcaptcha.com', 'js.hcaptcha.com'] },
    { name: 'Kasada', patterns: ['ips.perimeterx.net', 'ct.pinterest.com'] },
    { name: 'Shape Security', patterns: ['shape.com', 'shapesecurity.com'] },
    { name: 'Imperva/Incapsula', patterns: ['incapsula.com', 'imperva.com', '_Incapsula_Resource'] },
    { name: 'ThreatMetrix', patterns: ['online-metrix.net', 'lexisnexisrisk.com'] }
  ],

  // API risk weights for score calculation
  API_RISK_WEIGHTS: {
    'canvas.toDataURL': 15,
    'canvas.getImageData': 12,
    'webgl.getParameter': 10,
    'webgl.getExtension': 5,
    'webgl.getSupportedExtensions': 5,
    'audio.createOscillator': 12,
    'audio.getChannelData': 15,
    'audio.createDynamicsCompressor': 10,
    'rtc.createPeerConnection': 20,
    'rtc.createDataChannel': 8,
    'navigator.userAgent': 2,
    'navigator.platform': 3,
    'navigator.hardwareConcurrency': 5,
    'navigator.deviceMemory': 5,
    'navigator.languages': 3,
    'screen.width': 2,
    'screen.height': 2,
    'screen.colorDepth': 3,
    'font.enumeration': 10,
    'storage.localStorage': 2,
    'storage.indexedDB': 3,
    'battery.getBattery': 8,
    'media.enumerateDevices': 8,
    'speechSynthesis.getVoices': 8,
    'permissions.query': 3,
    'webgl.getShaderPrecisionFormat': 8
  },

  /**
   * Log a fingerprint API call
   * @param {string} site - Hostname
   * @param {string} api - API name (e.g., 'canvas.toDataURL')
   * @param {string} [detail] - Additional detail
   * @param {string} [url] - Full URL
   */
  async logApiCall(site, api, detail = '', url = '') {
    if (!site) return;

    let siteData = this._siteData.get(site);
    if (!siteData) {
      siteData = {
        site,
        firstSeen: new Date().toISOString(),
        apiCalls: [],
        apiCounts: {},
        trackers: [],
        riskScore: 0,
        totalCalls: 0
      };
      this._siteData.set(site, siteData);

      // Enforce max sites limit
      if (this._siteData.size > this.MAX_SITES) {
        const oldest = [...this._siteData.keys()][0];
        this._siteData.delete(oldest);
      }
    }

    // Add log entry
    const entry = {
      api,
      detail,
      timestamp: new Date().toISOString(),
      blocked: true
    };

    siteData.apiCalls.push(entry);
    if (siteData.apiCalls.length > this.MAX_LOGS_PER_SITE) {
      siteData.apiCalls = siteData.apiCalls.slice(-this.MAX_LOGS_PER_SITE);
    }

    // Update counts
    siteData.apiCounts[api] = (siteData.apiCounts[api] || 0) + 1;
    siteData.totalCalls++;

    // Recalculate risk score
    siteData.riskScore = this._calculateRiskScore(siteData);

    // Persist periodically
    if (siteData.totalCalls % 10 === 0) {
      await this._persistData();
    }
  },

  /**
   * Log a detected fingerprinting script
   * @param {string} site - Hostname
   * @param {string} scriptUrl - URL of detected script
   * @param {string} trackerName - Identified tracker name
   */
  async logTracker(site, scriptUrl, trackerName) {
    let siteData = this._siteData.get(site);
    if (!siteData) {
      siteData = {
        site,
        firstSeen: new Date().toISOString(),
        apiCalls: [],
        apiCounts: {},
        trackers: [],
        riskScore: 0,
        totalCalls: 0
      };
      this._siteData.set(site, siteData);
    }

    if (!siteData.trackers.find(t => t.name === trackerName)) {
      siteData.trackers.push({
        name: trackerName,
        url: scriptUrl,
        detectedAt: new Date().toISOString()
      });
      siteData.riskScore = Math.min(100, siteData.riskScore + 25);
    }
  },

  /**
   * Detect known trackers from a script URL
   * @param {string} url - Script URL to check
   * @returns {{detected: boolean, name?: string}}
   */
  detectTracker(url) {
    if (!url) return { detected: false };
    const lowerUrl = url.toLowerCase();

    for (const tracker of this.KNOWN_TRACKERS) {
      for (const pattern of tracker.patterns) {
        if (lowerUrl.includes(pattern.toLowerCase())) {
          return { detected: true, name: tracker.name };
        }
      }
    }
    return { detected: false };
  },

  /**
   * Calculate fingerprinting risk score for a site (0-100)
   * @param {Object} siteData
   * @returns {number}
   */
  _calculateRiskScore(siteData) {
    let score = 0;

    // Score from API calls
    for (const [api, count] of Object.entries(siteData.apiCounts)) {
      const weight = this.API_RISK_WEIGHTS[api] || 1;
      // Diminishing returns for repeated calls
      score += weight * Math.min(count, 3);
    }

    // Bonus for trackers
    score += siteData.trackers.length * 20;

    // Bonus for diversity of APIs used
    const uniqueApis = Object.keys(siteData.apiCounts).length;
    if (uniqueApis >= 5) score += 10;
    if (uniqueApis >= 10) score += 15;
    if (uniqueApis >= 15) score += 20;

    return Math.min(100, Math.round(score));
  },

  /**
   * Get monitoring data for a specific site
   * @param {string} site - Hostname
   * @returns {Object|null}
   */
  getSiteData(site) {
    return this._siteData.get(site) || null;
  },

  /**
   * Get risk score for a site
   * @param {string} site - Hostname
   * @returns {number} 0-100
   */
  getRiskScore(site) {
    const data = this._siteData.get(site);
    return data?.riskScore || 0;
  },

  /**
   * Get risk level string
   * @param {number} score
   * @returns {string}
   */
  getRiskLevel(score) {
    if (score <= 30) return 'low';
    if (score <= 60) return 'medium';
    return 'high';
  },

  /**
   * Get top fingerprinting sites
   * @param {number} [limit=10]
   * @returns {Array<{site: string, riskScore: number, totalCalls: number}>}
   */
  getTopSites(limit = 10) {
    return [...this._siteData.values()]
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, limit)
      .map(d => ({
        site: d.site,
        riskScore: d.riskScore,
        totalCalls: d.totalCalls,
        trackers: d.trackers.map(t => t.name)
      }));
  },

  /**
   * Get overall statistics
   * @returns {Object}
   */
  getStats() {
    let totalCalls = 0;
    let totalSites = this._siteData.size;
    let totalTrackers = 0;
    const apiBreakdown = {};

    for (const data of this._siteData.values()) {
      totalCalls += data.totalCalls;
      totalTrackers += data.trackers.length;
      for (const [api, count] of Object.entries(data.apiCounts)) {
        apiBreakdown[api] = (apiBreakdown[api] || 0) + count;
      }
    }

    // Sort API breakdown by count
    const topApis = Object.entries(apiBreakdown)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 15)
      .map(([api, count]) => ({ api, count }));

    return {
      totalCalls,
      totalSites,
      totalTrackers,
      topApis,
      topSites: this.getTopSites(10)
    };
  },

  /**
   * Export monitoring data as JSON
   * @returns {string}
   */
  exportJSON() {
    const data = {
      exportedAt: new Date().toISOString(),
      sites: [...this._siteData.values()],
      stats: this.getStats()
    };
    return JSON.stringify(data, null, 2);
  },

  /**
   * Export monitoring data as CSV
   * @returns {string}
   */
  exportCSV() {
    const rows = ['Site,API,Count,Risk Score,Timestamp'];
    for (const data of this._siteData.values()) {
      for (const call of data.apiCalls) {
        rows.push(`"${data.site}","${call.api}",1,${data.riskScore},"${call.timestamp}"`);
      }
    }
    return rows.join('\n');
  },

  /**
   * Clear all monitoring data
   */
  async clearAll() {
    this._siteData.clear();
    await chrome.storage.local.remove('pp_monitoring_data');
  },

  /**
   * Persist monitoring data to storage
   * @private
   */
  async _persistData() {
    // Serialize Map to array
    const serialized = [...this._siteData.entries()].map(([key, data]) => ({
      ...data,
      // Trim old log entries to save space
      apiCalls: data.apiCalls.slice(-50)
    }));

    try {
      await chrome.storage.local.set({ pp_monitoring_data: serialized });
    } catch (e) {
      // Storage quota exceeded — trim older data
      if (e.message?.includes('QUOTA')) {
        const trimmed = serialized.slice(-50);
        await chrome.storage.local.set({ pp_monitoring_data: trimmed });
      }
    }
  },

  /**
   * Load persisted monitoring data
   * @returns {Promise<void>}
   */
  async loadPersistedData() {
    try {
      const result = await chrome.storage.local.get('pp_monitoring_data');
      const data = result.pp_monitoring_data || [];
      for (const item of data) {
        this._siteData.set(item.site, item);
      }
    } catch (e) {}
  }
};

// Export
if (typeof globalThis !== 'undefined') globalThis.MonitoringEngine = MonitoringEngine;
