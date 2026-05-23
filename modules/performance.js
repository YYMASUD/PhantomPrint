/**
 * PhantomPrint — PerformanceManager
 * LRU profile cache, page pre-scanner, data compression, lazy loading helpers,
 * DNR rule batching, and service worker cleanup scheduling.
 * Runs in service worker AND as a helper for inject scripts.
 */

class PerformanceManager {
  // ─── Known Fingerprinting APIs ───────────────────────────────────────────────

  static FINGERPRINT_APIS = [
    'HTMLCanvasElement',
    'WebGLRenderingContext',
    'WebGL2RenderingContext',
    'AudioContext',
    'OfflineAudioContext',
    'RTCPeerConnection',
    'navigator.userAgent',
    'navigator.platform',
    'navigator.hardwareConcurrency',
    'navigator.deviceMemory',
    'navigator.maxTouchPoints',
    'screen.width',
    'screen.colorDepth',
    'devicePixelRatio',
    'FontFace',
    'CSS.supports',
    'navigator.userAgentData',
    'navigator.connection',
    'performance.now',
    'Intl.DateTimeFormat',
    'navigator.getBattery',
    'navigator.mediaDevices',
    'navigator.permissions',
    'speechSynthesis',
    'navigator.plugins',
    'document.fonts',
    'matchMedia',
    'navigator.storage',
    'navigator.language',
    'navigator.languages',
    'navigator.doNotTrack',
    'screen.availWidth',
    'screen.availHeight',
    'screen.orientation',
    'window.outerWidth',
    'window.outerHeight',
  ];

  // ─── LRU Profile Cache ───────────────────────────────────────────────────────

  /**
   * @param {number} maxSize  Maximum number of cached profiles (default 10)
   */
  constructor(maxSize = 10) {
    this._maxSize = maxSize;
    /** @type {Map<string, {profile: any, accessedAt: number}>} */
    this._cache = new Map();
    this._hits = 0;
    this._misses = 0;
    this._batchQueue = [];
    this._batchTimer = null;
  }

  /**
   * Return a cached profile by key, or null on a miss.
   * Updates the LRU access order by reinserting the entry.
   * @param {string} key
   * @returns {any|null}
   */
  getCachedProfile(key) {
    if (!this._cache.has(key)) {
      this._misses++;
      return null;
    }
    this._hits++;
    // Refresh access order (delete + re-insert moves to end)
    const entry = this._cache.get(key);
    entry.accessedAt = Date.now();
    this._cache.delete(key);
    this._cache.set(key, entry);
    return entry.profile;
  }

  /**
   * Store a profile with LRU eviction when cache is full.
   * @param {string} key
   * @param {any} profile
   */
  setCachedProfile(key, profile) {
    // If already present, remove so it becomes most-recently-used after re-insert
    if (this._cache.has(key)) this._cache.delete(key);

    // Evict LRU entry (first in Map iteration order) if at capacity
    if (this._cache.size >= this._maxSize) {
      const lruKey = this._cache.keys().next().value;
      this._cache.delete(lruKey);
    }

    this._cache.set(key, { profile, accessedAt: Date.now() });
  }

  /** Wipe all cached profiles and reset hit/miss counters. */
  clearCache() {
    this._cache.clear();
    this._hits = 0;
    this._misses = 0;
  }

  /**
   * @returns {{size:number, maxSize:number, hits:number, misses:number, hitRate:number}}
   */
  getCacheStats() {
    const total = this._hits + this._misses;
    return {
      size: this._cache.size,
      maxSize: this._maxSize,
      hits: this._hits,
      misses: this._misses,
      hitRate: total === 0 ? 0 : this._hits / total,
    };
  }

  // ─── Pre-Scanner ─────────────────────────────────────────────────────────────

  /**
   * Return a serialisable string representation of a function that, when
   * eval'd in the page context, scans for fingerprinting APIs and libraries.
   * The returned string is suitable for use with chrome.scripting.executeScript
   * via the `func` property after being wrapped in a Function constructor.
   *
   * @returns {string}  Self-invoking function body as a string
   */
  getPageScanScript() {
    // NOTE: This entire function body is serialised to a string so it must be
    //       fully self-contained — no closure references to outer scope.
    const scanFn = function () {
      const APIS = [
        'HTMLCanvasElement', 'WebGLRenderingContext', 'WebGL2RenderingContext',
        'AudioContext', 'OfflineAudioContext', 'RTCPeerConnection',
        'navigator.userAgent', 'navigator.platform', 'navigator.hardwareConcurrency',
        'navigator.deviceMemory', 'navigator.maxTouchPoints', 'screen.width',
        'screen.colorDepth', 'devicePixelRatio', 'FontFace', 'CSS.supports',
        'navigator.userAgentData', 'navigator.connection', 'performance.now',
        'Intl.DateTimeFormat', 'navigator.getBattery', 'navigator.mediaDevices',
        'navigator.permissions', 'speechSynthesis', 'navigator.plugins',
        'document.fonts', 'matchMedia', 'navigator.storage',
        'navigator.language', 'navigator.languages',
      ];

      const LIBRARY_GLOBALS = ['fpjs', 'ClientJS', 'Fingerprint2', 'FingerprintJS', 'cf_chl_opt'];

      const scriptTexts = Array.from(document.scripts)
        .map(s => s.textContent || s.src || '')
        .join('\n');

      const fingerprintingApis = APIS.filter(api => scriptTexts.includes(api));
      const librariesDetected = LIBRARY_GLOBALS.filter(lib => typeof window[lib] !== 'undefined');

      const needsFull = fingerprintingApis.length > 3 || librariesDetected.length > 0;

      return { needsFull, fingerprintingApis, librariesDetected };
    };

    return `(${scanFn.toString()})()`;
  }

  // ─── Data Compression ────────────────────────────────────────────────────────

  /**
   * Lightweight LZ77-inspired compression followed by base64 encoding.
   * Suitable for small-to-medium strings (profile data, settings snapshots).
   * @param {string} str
   * @returns {string}  base64-encoded compressed payload
   */
  compressString(str) {
    if (!str || str.length === 0) return btoa('');

    const WINDOW = 255;
    const MAX_LEN = 255;
    const tokens = []; // each token: [offset, length, char] or [0, 0, char]

    let i = 0;
    while (i < str.length) {
      let bestOffset = 0;
      let bestLength = 0;

      const lookbackStart = Math.max(0, i - WINDOW);
      for (let j = lookbackStart; j < i; j++) {
        let len = 0;
        while (
          len < MAX_LEN &&
          i + len < str.length &&
          str[j + len] === str[i + len]
        ) {
          len++;
        }
        if (len > bestLength) {
          bestLength = len;
          bestOffset = i - j;
        }
      }

      if (bestLength >= 3) {
        tokens.push([bestOffset, bestLength, str[i + bestLength] ?? '']);
        i += bestLength + 1;
      } else {
        tokens.push([0, 0, str[i]]);
        i++;
      }
    }

    // Encode tokens as a compact binary-ish string then base64
    const parts = tokens.map(([off, len, ch]) => {
      const o = String.fromCharCode(off & 0xff);
      const l = String.fromCharCode(len & 0xff);
      const c = ch || '\x00';
      return `${o}${l}${c}`;
    });

    return btoa(unescape(encodeURIComponent(parts.join(''))));
  }

  /**
   * Decompress a string previously compressed with compressString().
   * @param {string} compressed  base64-encoded payload
   * @returns {string}
   */
  decompressString(compressed) {
    if (!compressed) return '';

    let raw;
    try {
      raw = decodeURIComponent(escape(atob(compressed)));
    } catch {
      return '';
    }

    let output = '';
    let i = 0;

    while (i + 2 < raw.length) {
      const offset = raw.charCodeAt(i);
      const length = raw.charCodeAt(i + 1);
      const ch = raw[i + 2];
      i += 3;

      if (length >= 3 && offset > 0) {
        const start = output.length - offset;
        for (let k = 0; k < length; k++) {
          output += output[start + (k % offset)] ?? '';
        }
      }

      if (ch !== '\x00') output += ch;
    }

    return output;
  }

  // ─── Lazy Loading ────────────────────────────────────────────────────────────

  /**
   * Determine which spoofing modules are needed based on enabled feature flags.
   * Used by the inject script to skip unused code branches.
   * @param {{[key:string]: boolean}} categories  e.g. {canvas:true, webgl:false, ...}
   * @returns {{canvas:boolean, webgl:boolean, audio:boolean, webrtc:boolean,
   *            fonts:boolean, timezone:boolean, behavior:boolean,
   *            media:boolean, mobile:boolean}}
   */
  getSpoofingModuleList(categories = {}) {
    return {
      canvas:   !!(categories.canvas   ?? true),
      webgl:    !!(categories.webgl    ?? true),
      audio:    !!(categories.audio    ?? true),
      webrtc:   !!(categories.webrtc   ?? true),
      fonts:    !!(categories.fonts    ?? true),
      timezone: !!(categories.timezone ?? true),
      behavior: !!(categories.behavior ?? true),
      media:    !!(categories.media    ?? false),
      mobile:   !!(categories.mobile   ?? false),
    };
  }

  // ─── DNR Rule Batching ───────────────────────────────────────────────────────

  /**
   * Queue a set of DNR rule operations and flush them in a single API call
   * after a 100 ms debounce window.
   *
   * @param {Array<{add?:object, remove?:number}>} operations
   */
  batchRuleUpdates(operations) {
    this._batchQueue.push(...operations);

    if (this._batchTimer !== null) {
      clearTimeout(this._batchTimer);
    }

    this._batchTimer = setTimeout(async () => {
      this._batchTimer = null;
      const ops = this._batchQueue.splice(0);
      if (ops.length === 0) return;

      const addRules = [];
      const removeRuleIds = [];

      for (const op of ops) {
        if (op.add) addRules.push(op.add);
        if (op.remove != null) removeRuleIds.push(op.remove);
      }

      try {
        await chrome.declarativeNetRequest.updateDynamicRules({
          addRules,
          removeRuleIds,
        });
      } catch (err) {
        console.error('[PhantomPrint] DNR batch update failed:', err);
      }
    }, 100);
  }

  // ─── Service Worker Optimization ─────────────────────────────────────────────

  /**
   * Create a recurring alarm to run periodic cleanup every 24 hours.
   * The alarm handler should call _runScheduledCleanup().
   */
  scheduleCleanup() {
    chrome.alarms.create('pp_sw_cleanup', {
      delayInMinutes: 1440,
      periodInMinutes: 1440,
    });
  }

  /**
   * Execute periodic cleanup tasks.
   * Call this from the service worker's chrome.alarms.onAlarm handler
   * when alarm.name === 'pp_sw_cleanup'.
   */
  async runScheduledCleanup() {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const allData = await chrome.storage.local.get(null);

    const updates = {};
    const removals = [];

    for (const [key, value] of Object.entries(allData)) {
      // Trim log entries older than 7 days
      if (key.startsWith('pp_log_') && Array.isArray(value)) {
        const trimmed = value.filter(entry => (entry.timestamp ?? 0) >= sevenDaysAgo);
        if (trimmed.length !== value.length) updates[key] = trimmed;
      }

      // Trim monitoring stats arrays to 1000 most-recent entries
      if (key.startsWith('pp_stats_') && Array.isArray(value) && value.length > 1000) {
        updates[key] = value.slice(-1000);
      }
    }

    if (Object.keys(updates).length > 0) {
      await chrome.storage.local.set(updates);
    }

    // Evict old LRU cache entries (those not accessed in 24 h)
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const [k, entry] of this._cache.entries()) {
      if (entry.accessedAt < cutoff) this._cache.delete(k);
    }
  }
}

if (typeof self !== 'undefined') self.PerformanceManager = PerformanceManager;
