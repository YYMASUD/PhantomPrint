/**
 * @file webrtc-control.js
 * @description Advanced WebRTC leak prevention and control for PhantomPrint.
 * Controls chrome.privacy.network.webRTCIPHandlingPolicy, STUN server blocking (DNR 3200–3220),
 * device spoofing flags, and SDP scrubbing patterns for content script use.
 * Runs in the PhantomPrint service worker.
 */

class WebRTCControl {
  /**
   * Supported WebRTC control modes.
   * @readonly
   * @enum {string}
   */
  static MODES = {
    DISABLE:          'disable',
    PROXY_ONLY:       'proxy-only',
    FAKE_CANDIDATES:  'fake-candidates',
    DEFAULT:          'default'
  };

  /**
   * Regex patterns (as strings) for scrubbing SDP offer/answer messages.
   * These are returned as strings so content scripts can reconstruct them via new RegExp().
   * @type {Array<{pattern: string, flags: string, description: string}>}
   */
  static SDP_SCRUB_PATTERNS = [
    {
      pattern: 'a=rtpmap:[0-9]+.*',
      flags: 'g',
      description: 'Normalize codec list to prevent fingerprinting via codec ordering'
    },
    {
      pattern: 'a=fingerprint:.*\\r\\n',
      flags: 'g',
      description: 'Remove DTLS fingerprint to prevent TLS fingerprinting'
    },
    {
      pattern: 'o=- [0-9]+ [0-9]+ .*',
      flags: 'g',
      description: 'Normalize session ID and version in origin line'
    },
    {
      pattern: 'c=IN IP[46] .*',
      flags: 'g',
      description: 'Remove connection IP address from session-level connection data'
    },
    {
      pattern: 'a=candidate:.*\\r\\n',
      flags: 'gi',
      description: 'Remove all ICE candidates (host, srflx, relay) to prevent IP leaks'
    },
    {
      pattern: 'a=ice-ufrag:.*\\r\\n',
      flags: 'g',
      description: 'Remove ICE username fragment to prevent session tracking'
    },
    {
      pattern: 'a=ice-pwd:.*\\r\\n',
      flags: 'g',
      description: 'Remove ICE password to prevent session tracking'
    },
    {
      pattern: 'a=ssrc:[0-9]+ cname:.*\\r\\n',
      flags: 'g',
      description: 'Remove SSRC CNAME which can be used as a persistent identifier'
    },
    {
      pattern: 'a=extmap:.*\\r\\n',
      flags: 'g',
      description: 'Remove extension maps that can reveal browser internals'
    },
    {
      pattern: 'a=msid:.*\\r\\n',
      flags: 'g',
      description: 'Remove media stream ID to prevent cross-session tracking'
    }
  ];

  /**
   * Known STUN/TURN server hostnames to block via DNR.
   * Rule IDs 3200–3220 are reserved for STUN blocking.
   * @type {string[]}
   */
  static STUN_SERVERS = [
    'stun.l.google.com',
    'stun1.l.google.com',
    'stun2.l.google.com',
    'stun3.l.google.com',
    'stun4.l.google.com',
    'stun.ekiga.net',
    'stun.ideasip.com',
    'stun.schlund.de',
    'stun.voiparound.com',
    'stun.voipbuster.com',
    'stun.voipstunt.com',
    'stun.voxgratia.org',
    'stun.stunprotocol.org',
    'stun.sipgate.net',
    'stun.counterpath.com',
    'stun.services.mozilla.com',
    'stunserver.org',
    'stun.softjoys.com',
    'stun.xten.com',
    'stun.zoiper.com',
    'global.stun.twilio.com'
  ];

  constructor() {
    this.STORAGE_KEY_MODE       = 'phantomprint_webrtc_mode';
    this.STORAGE_KEY_STUN       = 'phantomprint_webrtc_stun_blocked';
    this.STORAGE_KEY_DEVICES    = 'phantomprint_webrtc_devices_spoofed';
    this.STORAGE_KEY_DEVICE_SEED = 'phantomprint_webrtc_device_seed';
    this.STUN_RULE_ID_START     = 3200;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Mode Management
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Set the WebRTC IP handling mode and apply the corresponding policy.
   * Falls back gracefully if the privacy API is unavailable.
   * @param {string} mode - One of WebRTCControl.MODES
   * @returns {Promise<void>}
   */
  async setMode(mode) {
    /** @type {Object.<string, string>} */
    const policyMap = {
      [WebRTCControl.MODES.DISABLE]:         'disable_non_proxied_udp',
      [WebRTCControl.MODES.PROXY_ONLY]:      'proxy_only',
      [WebRTCControl.MODES.FAKE_CANDIDATES]: 'default_public_interface_only',
      [WebRTCControl.MODES.DEFAULT]:         'default'
    };

    const policy = policyMap[mode];
    if (!policy) throw new Error(`Unknown WebRTC mode: "${mode}"`);

    // Apply via chrome.privacy API if available
    if (chrome.privacy && chrome.privacy.network && chrome.privacy.network.webRTCIPHandlingPolicy) {
      await chrome.privacy.network.webRTCIPHandlingPolicy.set({ value: policy });
    }

    await chrome.storage.local.set({ [this.STORAGE_KEY_MODE]: mode });
  }

  /**
   * Get the currently stored WebRTC mode.
   * @returns {Promise<string>} One of WebRTCControl.MODES, defaults to 'default'
   */
  async getMode() {
    const data = await chrome.storage.local.get(this.STORAGE_KEY_MODE);
    return data[this.STORAGE_KEY_MODE] || WebRTCControl.MODES.DEFAULT;
  }

  /**
   * Return full WebRTC status object.
   * @returns {Promise<{mode: string, webrtcBlocked: boolean, stunBlocked: boolean, devicesBlocked: boolean}>}
   */
  async getStatus() {
    const data = await chrome.storage.local.get([
      this.STORAGE_KEY_MODE,
      this.STORAGE_KEY_STUN,
      this.STORAGE_KEY_DEVICES
    ]);
    const mode = data[this.STORAGE_KEY_MODE] || WebRTCControl.MODES.DEFAULT;
    const stunBlocked    = !!data[this.STORAGE_KEY_STUN];
    const devicesBlocked = !!data[this.STORAGE_KEY_DEVICES];
    const webrtcBlocked  = mode === WebRTCControl.MODES.DISABLE;

    return { mode, webrtcBlocked, stunBlocked, devicesBlocked };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STUN Server Blocking
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Generate DNR rules to block all known STUN/TURN servers.
   * @private
   * @returns {chrome.declarativeNetRequest.Rule[]}
   */
  _buildStunRules() {
    return WebRTCControl.STUN_SERVERS.map((host, index) => ({
      id: this.STUN_RULE_ID_START + index,
      priority: 1,
      action: { type: 'block' },
      condition: {
        urlFilter: `*${host}*`,
        resourceTypes: ['websocket', 'xmlhttprequest', 'other']
      }
    }));
  }

  /**
   * Get all STUN rule IDs.
   * @private
   * @returns {number[]}
   */
  _getStunRuleIds() {
    return WebRTCControl.STUN_SERVERS.map((_, i) => this.STUN_RULE_ID_START + i);
  }

  /**
   * Enable or disable DNR-based STUN server blocking.
   * @param {boolean} enabled
   * @returns {Promise<void>}
   */
  async setStunBlocking(enabled) {
    if (enabled) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: this._getStunRuleIds(),
        addRules: this._buildStunRules()
      });
    } else {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: this._getStunRuleIds(),
        addRules: []
      });
    }
    await chrome.storage.local.set({ [this.STORAGE_KEY_STUN]: enabled });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Device Spoofing
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Enable or disable the device ID spoofing flag.
   * The content script reads this flag and replaces navigator.mediaDevices.enumerateDevices.
   * Also generates and persists a stable seed for this session if enabling.
   * @param {boolean} enabled
   * @returns {Promise<void>}
   */
  async setDeviceSpoofing(enabled) {
    if (enabled) {
      // Generate a random seed and store it (stable across the session)
      const data = await chrome.storage.local.get(this.STORAGE_KEY_DEVICE_SEED);
      if (!data[this.STORAGE_KEY_DEVICE_SEED]) {
        const seed = Array.from(
          self.crypto.getRandomValues(new Uint8Array(8)),
          b => b.toString(16).padStart(2, '0')
        ).join('');
        await chrome.storage.local.set({ [this.STORAGE_KEY_DEVICE_SEED]: seed });
      }
    }
    await chrome.storage.local.set({ [this.STORAGE_KEY_DEVICES]: enabled });
  }

  /**
   * Generate 3 stable fake device IDs derived from a seed using FNV-1a hash.
   * Produces consistent device IDs for the same seed across calls.
   * @param {string} seed - Hex string seed value
   * @returns {{audioInput: string, videoInput: string, audioOutput: string}}
   */
  getSpoofedDeviceIds(seed) {
    /**
     * FNV-1a 32-bit hash — non-cryptographic, purely for stable ID generation.
     * @param {string} input
     * @returns {string} 64-char hex string suitable for a deviceId
     */
    const fnv1a = (input) => {
      let hash = 0x811c9dc5;
      for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = (hash * 0x01000193) >>> 0;
      }
      // Expand to 64 hex chars by repeating the hash with different salts
      const expand = (salt) => {
        let h = 0x811c9dc5;
        const str = input + salt;
        for (let i = 0; i < str.length; i++) {
          h ^= str.charCodeAt(i);
          h = (h * 0x01000193) >>> 0;
        }
        return h.toString(16).padStart(8, '0');
      };
      return [
        expand('a'), expand('b'), expand('c'), expand('d'),
        expand('e'), expand('f'), expand('g'), expand('h')
      ].join('');
    };

    return {
      audioInput:  fnv1a(seed + ':audio:input'),
      videoInput:  fnv1a(seed + ':video:input'),
      audioOutput: fnv1a(seed + ':audio:output')
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SDP Scrubbing
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Return the SDP scrub patterns as an array of plain objects with pattern and flags.
   * Content scripts can reconstruct RegExp objects from these for SDP mutation.
   * @returns {Array<{pattern: string, flags: string, description: string}>}
   */
  getSdpScrubPatterns() {
    return WebRTCControl.SDP_SCRUB_PATTERNS.map(p => ({ ...p }));
  }
}

if (typeof self !== 'undefined') self.WebRTCControl = WebRTCControl;
