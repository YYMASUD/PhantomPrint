/**
 * PhantomPrint — SecurityManager
 * Master password protection, auto-lock, tamper detection, panic wipe,
 * API key encryption, and clipboard scheduling. Runs in service worker.
 */

class SecurityManager {
  // ─── Helpers ────────────────────────────────────────────────────────────────

  /** Convert an ArrayBuffer to a lowercase hex string. */
  static _bufToHex(buf) {
    return Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /** Convert a hex string back to a Uint8Array. */
  static _hexToBuf(hex) {
    const arr = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      arr[i / 2] = parseInt(hex.slice(i, i + 2), 16);
    }
    return arr;
  }

  /** Generate cryptographically random bytes. */
  static _randomBytes(n) {
    return crypto.getRandomValues(new Uint8Array(n));
  }

  /**
   * Derive a 32-byte AES key from a password and salt using PBKDF2 + SHA-256.
   * @param {string} password
   * @param {Uint8Array} salt
   * @param {number} iterations
   * @returns {Promise<CryptoKey>}
   */
  static async _deriveKey(password, salt, iterations = 100_000) {
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey(
      'raw',
      enc.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Hash a password with PBKDF2 and return {hash:hex, salt:hex}.
   * This produces a raw 32-byte digest stored as hex (not a full CryptoKey),
   * used for simple hash-comparison verification.
   */
  static async _hashPassword(password, salt) {
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey(
      'raw',
      enc.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
      baseKey,
      256
    );
    return SecurityManager._bufToHex(bits);
  }

  // ─── Master Password ─────────────────────────────────────────────────────────

  /**
   * Hash and persist a new master password.
   * Stores {hash:hex, salt:hex, iterations:100000} as 'pp_master_pw'.
   * @param {string} password
   */
  async setMasterPassword(password) {
    if (!password || typeof password !== 'string' || password.length < 1) {
      throw new Error('Password must be a non-empty string.');
    }
    const salt = SecurityManager._randomBytes(32);
    const hash = await SecurityManager._hashPassword(password, salt);
    await chrome.storage.local.set({
      pp_master_pw: {
        hash,
        salt: SecurityManager._bufToHex(salt),
        iterations: 100_000,
      },
    });
  }

  /**
   * Verify a candidate password against the stored hash.
   * @param {string} password
   * @returns {Promise<boolean>}
   */
  async verifyMasterPassword(password) {
    const stored = await this._getStoredPassword();
    if (!stored) return false;
    const salt = SecurityManager._hexToBuf(stored.salt);
    const hash = await SecurityManager._hashPassword(password, salt);
    return hash === stored.hash;
  }

  /** @returns {Promise<boolean>} true if a master password is stored */
  async hasMasterPassword() {
    const stored = await this._getStoredPassword();
    return stored !== null;
  }

  /** Remove the stored master password and locked state. */
  async removeMasterPassword() {
    await chrome.storage.local.remove(['pp_master_pw', 'pp_lock_state']);
  }

  /** @private */
  async _getStoredPassword() {
    const result = await chrome.storage.local.get('pp_master_pw');
    return result.pp_master_pw ?? null;
  }

  // ─── Auto-Lock ───────────────────────────────────────────────────────────────

  /**
   * Configure and start the auto-lock alarm.
   * @param {number} minutes  0 = disable
   */
  async setAutoLock(minutes) {
    await chrome.storage.local.set({ pp_autolock_minutes: minutes });
    chrome.alarms.clear('pp_autolock');
    if (minutes > 0) {
      chrome.alarms.create('pp_autolock', { delayInMinutes: minutes, periodInMinutes: minutes });
    }
  }

  /** Mark the extension as locked in storage. */
  async lock() {
    await chrome.storage.local.set({
      pp_lock_state: { locked: true, lockedAt: Date.now() },
    });
  }

  /**
   * Attempt to unlock. Verifies password, clears locked state, resets timer.
   * @param {string} password
   * @returns {Promise<boolean>} true if unlock succeeded
   */
  async unlock(password) {
    const ok = await this.verifyMasterPassword(password);
    if (!ok) return false;
    await chrome.storage.local.remove('pp_lock_state');
    await this.resetLockTimer();
    return true;
  }

  /**
   * @returns {Promise<boolean>} true when locked state exists AND a master password is set
   */
  async isLocked() {
    const [lockResult] = await Promise.all([
      chrome.storage.local.get('pp_lock_state'),
    ]);
    const lockState = lockResult.pp_lock_state;
    if (!lockState || !lockState.locked) return false;
    return this.hasMasterPassword();
  }

  /** Restart the auto-lock countdown alarm. */
  async resetLockTimer() {
    const result = await chrome.storage.local.get('pp_autolock_minutes');
    const minutes = result.pp_autolock_minutes ?? 0;
    if (minutes > 0) {
      chrome.alarms.clear('pp_autolock');
      chrome.alarms.create('pp_autolock', { delayInMinutes: minutes, periodInMinutes: minutes });
    }
  }

  // ─── Tamper Detection ────────────────────────────────────────────────────────

  /** Key files checked during integrity verification. */
  static KEY_FILES = [
    'background/service-worker.js',
    'inject/main-world-inject.js',
    'content/content-script.js',
    'core/consistency-engine.js',
  ];

  /**
   * Fetch an extension file and compute its SHA-256 hash.
   * @param {string} filename  Relative path inside the extension
   * @returns {Promise<string>} Hex-encoded SHA-256
   */
  async computeFileHash(filename) {
    const text = await fetch(chrome.runtime.getURL(filename)).then(r => {
      if (!r.ok) throw new Error(`Failed to fetch ${filename}: ${r.status}`);
      return r.text();
    });
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return SecurityManager._bufToHex(buf);
  }

  /**
   * Compute and save hash baseline for all listed files.
   * @param {string[]} [files]  Defaults to SecurityManager.KEY_FILES
   */
  async saveIntegrityBaseline(files = SecurityManager.KEY_FILES) {
    const baseline = {};
    await Promise.all(
      files.map(async f => {
        try {
          baseline[f] = await this.computeFileHash(f);
        } catch {
          baseline[f] = null; // file not accessible
        }
      })
    );
    await chrome.storage.local.set({ pp_integrity_baseline: baseline });
  }

  /**
   * Compare current file hashes against the stored baseline.
   * @returns {Promise<{ok:boolean, tampered:string[], unchecked:string[]}>}
   */
  async checkIntegrity() {
    const result = await chrome.storage.local.get('pp_integrity_baseline');
    const baseline = result.pp_integrity_baseline;
    if (!baseline) return { ok: true, tampered: [], unchecked: [] };

    const tampered = [];
    const unchecked = [];

    await Promise.all(
      Object.entries(baseline).map(async ([filename, expectedHash]) => {
        if (expectedHash === null) {
          unchecked.push(filename);
          return;
        }
        try {
          const currentHash = await this.computeFileHash(filename);
          if (currentHash !== expectedHash) tampered.push(filename);
        } catch {
          unchecked.push(filename);
        }
      })
    );

    return { ok: tampered.length === 0, tampered, unchecked };
  }

  // ─── Panic Button ────────────────────────────────────────────────────────────

  /**
   * DESTROY EVERYTHING — clear all storage, browsing data, and DNR rules.
   * @returns {Promise<{ok:true, timestamp:number}>}
   */
  async panicWipe() {
    // 1. Clear all extension storage
    await Promise.all([
      chrome.storage.local.clear(),
      chrome.storage.sync.clear(),
    ]);

    // 2. Wipe browsing data
    await chrome.browsingData.remove(
      {},
      {
        cookies: true,
        localStorage: true,
        indexedDB: true,
        cacheStorage: true,
        serviceWorkers: true,
      }
    );

    // 3. Remove all declarativeNetRequest dynamic rules
    try {
      const existing = await chrome.declarativeNetRequest.getDynamicRules();
      if (existing.length > 0) {
        await chrome.declarativeNetRequest.updateDynamicRules({
          removeRuleIds: existing.map(r => r.id),
        });
      }
    } catch {
      // DNR may not be available in all contexts; silently skip
    }

    return { ok: true, timestamp: Date.now() };
  }

  // ─── API Key Encryption ──────────────────────────────────────────────────────

  /**
   * Encrypt an API key string using AES-256-GCM with the master password as key material.
   * @param {string} key       Plaintext API key
   * @param {string} password  Master password
   * @returns {Promise<{ciphertext:string, iv:string, salt:string}>}
   */
  async encryptApiKey(key, password) {
    const salt = SecurityManager._randomBytes(32);
    const cryptoKey = await SecurityManager._deriveKey(password, salt);
    const iv = SecurityManager._randomBytes(12);
    const enc = new TextEncoder();
    const cipherBuf = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      enc.encode(key)
    );
    return {
      ciphertext: SecurityManager._bufToHex(cipherBuf),
      iv: SecurityManager._bufToHex(iv),
      salt: SecurityManager._bufToHex(salt),
    };
  }

  /**
   * Decrypt an encrypted API key object.
   * @param {{ciphertext:string, iv:string, salt:string}} encObj
   * @param {string} password
   * @returns {Promise<string>} Plaintext API key
   */
  async decryptApiKey(encObj, password) {
    const salt = SecurityManager._hexToBuf(encObj.salt);
    const cryptoKey = await SecurityManager._deriveKey(password, salt);
    const iv = SecurityManager._hexToBuf(encObj.iv);
    const cipherBuf = SecurityManager._hexToBuf(encObj.ciphertext);
    const plainBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      cipherBuf
    );
    return new TextDecoder().decode(plainBuf);
  }

  /**
   * Encrypt and persist a named API key.
   * @param {string} name      Logical key identifier
   * @param {string} key       Plaintext API key
   * @param {string} password  Master password
   */
  async saveApiKey(name, key, password) {
    const encObj = await this.encryptApiKey(key, password);
    const storageKey = `pp_apikey_${name}`;
    await chrome.storage.local.set({ [storageKey]: encObj });
  }

  /**
   * Retrieve and decrypt a named API key.
   * @param {string} name
   * @param {string} password
   * @returns {Promise<string>} Plaintext API key
   */
  async getApiKey(name, password) {
    const storageKey = `pp_apikey_${name}`;
    const result = await chrome.storage.local.get(storageKey);
    const encObj = result[storageKey];
    if (!encObj) throw new Error(`No API key stored for name: ${name}`);
    return this.decryptApiKey(encObj, password);
  }

  // ─── Clipboard ───────────────────────────────────────────────────────────────

  /**
   * Save the clipboard auto-clear timeout preference.
   * @param {number} seconds  0 = disabled
   */
  async setClearTimeout(seconds) {
    await chrome.storage.local.set({ pp_clipboard_clear_seconds: seconds });
  }

  /**
   * Schedule a one-shot alarm to wipe the clipboard via scripting API.
   * @param {number} delaySeconds
   */
  async scheduleClearClipboard(delaySeconds) {
    if (delaySeconds <= 0) return;
    const alarmName = `pp_clipboard_clear_${Date.now()}`;
    chrome.alarms.create(alarmName, { delayInMinutes: delaySeconds / 60 });

    // The alarm listener in the service worker must call this action:
    // chrome.scripting.executeScript({
    //   target: { allFrames: false, tabId: <activeTab> },
    //   func: () => navigator.clipboard?.writeText(''),
    // });
    // Persist the alarm name so the generic alarm listener can identify it.
    const result = await chrome.storage.local.get('pp_clipboard_alarms');
    const existing = result.pp_clipboard_alarms ?? [];
    existing.push({ alarmName, scheduledAt: Date.now(), delaySeconds });
    await chrome.storage.local.set({ pp_clipboard_alarms: existing });
  }

  /**
   * Called from the service worker's chrome.alarms.onAlarm listener.
   * Wipes clipboard on the active tab if the alarm is a clipboard alarm.
   * @param {chrome.alarms.Alarm} alarm
   */
  async handleAlarm(alarm) {
    if (alarm.name === 'pp_autolock') {
      await this.lock();
      return;
    }

    if (alarm.name.startsWith('pp_clipboard_clear_')) {
      // Find the currently active tab and clear its clipboard
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab?.id) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: activeTab.id, allFrames: false },
            func: () => { navigator.clipboard?.writeText(''); },
          });
        } catch {
          // Tab may not support scripting (e.g. chrome:// URLs)
        }
      }

      // Clean up the stored alarm record
      const result = await chrome.storage.local.get('pp_clipboard_alarms');
      const alarms = (result.pp_clipboard_alarms ?? []).filter(
        a => a.alarmName !== alarm.name
      );
      await chrome.storage.local.set({ pp_clipboard_alarms: alarms });
    }
  }
}

if (typeof self !== 'undefined') self.SecurityManager = SecurityManager;
