/**
 * PhantomPrint Cloud Sync Module
 * Encrypted cloud synchronization via chrome.storage.sync + file export/import.
 * Runs in service worker context — can use chrome.* APIs and SubtleCrypto.
 */

class CloudSync {
  constructor() {
    this.SYNC_KEYS = [
      'savedProfiles',
      'whitelist',
      'blacklist',
      'categories',
      'randomizationFrequency',
      'crossSiteIsolation',
      'webrtcMode',
      'proxies',
      'cookieProfiles',
      'networkRules',
      'blockerConfig',
    ];

    this.CHUNK_PREFIX = 'phantomprint_sync_';
    this.MAX_CHUNK_BYTES = 8192;
    this.PBKDF2_ITERATIONS = 100_000;
    this.ALARM_NAME = 'phantomprint_autosync';
  }

  // ─── Crypto Helpers ───────────────────────────────────────────────────────

  /**
   * Encrypt arbitrary data with AES-256-GCM, key derived via PBKDF2.
   * @param {*} data  Any JSON-serialisable value.
   * @param {string} password
   * @returns {Promise<{salt:string, iv:string, data:string, version:string}>}
   */
  async encryptData(data, password) {
    const encoder = new TextEncoder();
    const plaintext = encoder.encode(JSON.stringify(data));

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv   = crypto.getRandomValues(new Uint8Array(12));

    const baseKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveKey'],
    );

    const aesKey = await crypto.subtle.deriveKey(
      {
        name:       'PBKDF2',
        salt,
        iterations: this.PBKDF2_ITERATIONS,
        hash:       'SHA-256',
      },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt'],
    );

    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      plaintext,
    );

    return {
      salt:    this._toBase64(salt),
      iv:      this._toBase64(iv),
      data:    this._toBase64(new Uint8Array(ciphertext)),
      version: '1.0',
    };
  }

  /**
   * Decrypt a payload produced by encryptData().
   * @param {{salt:string, iv:string, data:string, version:string}} encObj
   * @param {string} password
   * @returns {Promise<*>}
   */
  async decryptData(encObj, password) {
    if (encObj.version !== '1.0') {
      throw new Error(`Unsupported encryption version: ${encObj.version}`);
    }

    const encoder   = new TextEncoder();
    const salt      = this._fromBase64(encObj.salt);
    const iv        = this._fromBase64(encObj.iv);
    const cipherBuf = this._fromBase64(encObj.data);

    const baseKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveKey'],
    );

    const aesKey = await crypto.subtle.deriveKey(
      {
        name:       'PBKDF2',
        salt,
        iterations: this.PBKDF2_ITERATIONS,
        hash:       'SHA-256',
      },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt'],
    );

    let plainBuf;
    try {
      plainBuf = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        aesKey,
        cipherBuf,
      );
    } catch {
      throw new Error('Decryption failed — wrong password or corrupted data.');
    }

    return JSON.parse(new TextDecoder().decode(plainBuf));
  }

  // ─── Chrome Storage Sync ──────────────────────────────────────────────────

  /**
   * Encrypt all SYNC_KEYS from chrome.storage.local and push to chrome.storage.sync
   * as chunked entries: phantomprint_sync_0, phantomprint_sync_1, …
   * @param {string} password
   */
  async pushToSync(password) {
    const localData = await this._getLocalKeys(this.SYNC_KEYS);
    const encrypted = await this.encryptData(localData, password);
    const jsonStr   = JSON.stringify(encrypted);

    // Clear old chunks first
    await this._clearSyncChunks();

    const chunks = this._splitIntoChunks(jsonStr, this.MAX_CHUNK_BYTES);
    const toStore = {};
    chunks.forEach((chunk, i) => {
      toStore[`${this.CHUNK_PREFIX}${i}`] = chunk;
    });
    // Store the total chunk count for reliable reassembly
    toStore['phantomprint_sync_meta'] = { chunkCount: chunks.length, pushedAt: Date.now() };

    await chrome.storage.sync.set(toStore);
    await chrome.storage.local.set({ _lastSyncTime: Date.now() });
  }

  /**
   * Pull all chunks from chrome.storage.sync, decrypt, and merge into chrome.storage.local.
   * @param {string} password
   */
  async pullFromSync(password) {
    const meta = await this._getSyncMeta();
    if (!meta || !meta.chunkCount) {
      throw new Error('No sync data found in chrome.storage.sync.');
    }

    const keys = Array.from({ length: meta.chunkCount }, (_, i) => `${this.CHUNK_PREFIX}${i}`);
    const stored = await chrome.storage.sync.get(keys);
    const chunks = keys.map(k => stored[k] || '');
    const jsonStr = this._reassembleChunks(chunks);

    const encObj = JSON.parse(jsonStr);
    const data   = await this.decryptData(encObj, password);

    // Merge into local storage (do not wipe keys not present in sync payload)
    await chrome.storage.local.set({ ...data, _lastSyncTime: Date.now() });
  }

  // ─── File Export / Import ─────────────────────────────────────────────────

  /**
   * Export all SYNC_KEYS as an encrypted JSON string suitable for saving as .phantomprint file.
   * @param {string} password
   * @param {string[]|null} [keys=null]  Subset of SYNC_KEYS to export; null = all.
   * @returns {Promise<string>}
   */
  async exportToFile(password, keys = null) {
    const targetKeys = keys || this.SYNC_KEYS;
    const localData  = await this._getLocalKeys(targetKeys);
    const encrypted  = await this.encryptData(localData, password);
    return JSON.stringify(encrypted, null, 2);
  }

  /**
   * Parse an encrypted .phantomprint file and import its contents into chrome.storage.local.
   * @param {string} encryptedJson  Contents of a .phantomprint file.
   * @param {string} password
   */
  async importFromFile(encryptedJson, password) {
    let encObj;
    try {
      encObj = JSON.parse(encryptedJson);
    } catch {
      throw new Error('Invalid .phantomprint file — could not parse JSON.');
    }

    const data = await this.decryptData(encObj, password);
    await chrome.storage.local.set({ ...data, _lastSyncTime: Date.now() });
  }

  // ─── Auto-Sync Alarm ─────────────────────────────────────────────────────

  /**
   * @returns {Promise<number|null>}  Unix timestamp in ms, or null if never synced.
   */
  async getLastSyncTime() {
    const result = await chrome.storage.local.get('_lastSyncTime');
    return result._lastSyncTime || null;
  }

  /**
   * Configure (or disable) a periodic auto-sync alarm.
   * The alarm fires `chrome.alarms.onAlarm` which the background should handle.
   * @param {boolean} enabled
   * @param {number}  intervalMinutes
   */
  async setAutoSync(enabled, intervalMinutes = 30) {
    await chrome.alarms.clear(this.ALARM_NAME);

    if (enabled) {
      chrome.alarms.create(this.ALARM_NAME, {
        delayInMinutes:    intervalMinutes,
        periodInMinutes:   intervalMinutes,
      });
    }

    await chrome.storage.local.set({
      _autoSync:         enabled,
      _autoSyncInterval: intervalMinutes,
    });
  }

  /**
   * @returns {Promise<{lastSync:number|null, autoSync:boolean, intervalMinutes:number, chunkCount:number, totalSize:number}>}
   */
  async getSyncStatus() {
    const local = await chrome.storage.local.get([
      '_lastSyncTime',
      '_autoSync',
      '_autoSyncInterval',
    ]);

    const meta = await this._getSyncMeta();
    const chunkCount = meta ? meta.chunkCount : 0;

    // Approximate total size stored in sync
    let totalSize = 0;
    if (chunkCount > 0) {
      const keys = Array.from({ length: chunkCount }, (_, i) => `${this.CHUNK_PREFIX}${i}`);
      const stored = await chrome.storage.sync.get(keys);
      for (const k of keys) {
        if (stored[k]) totalSize += stored[k].length;
      }
    }

    return {
      lastSync:        local._lastSyncTime   || null,
      autoSync:        local._autoSync       || false,
      intervalMinutes: local._autoSyncInterval || 30,
      chunkCount,
      totalSize,
    };
  }

  // ─── Selective Sync ───────────────────────────────────────────────────────

  /**
   * Sync only specific named profiles (from the 'savedProfiles' map).
   * @param {string[]} profileNames
   * @param {string}   password
   */
  async selectiveSync(profileNames, password) {
    const result = await chrome.storage.local.get('savedProfiles');
    const all    = result.savedProfiles || {};

    const subset = {};
    for (const name of profileNames) {
      if (all[name]) subset[name] = all[name];
    }

    const encObj  = await this.encryptData({ savedProfiles: subset }, password);
    const jsonStr = JSON.stringify(encObj);

    await this._clearSyncChunks();

    const chunks  = this._splitIntoChunks(jsonStr, this.MAX_CHUNK_BYTES);
    const toStore = {};
    chunks.forEach((chunk, i) => {
      toStore[`${this.CHUNK_PREFIX}${i}`] = chunk;
    });
    toStore['phantomprint_sync_meta'] = { chunkCount: chunks.length, pushedAt: Date.now() };

    await chrome.storage.sync.set(toStore);
    await chrome.storage.local.set({ _lastSyncTime: Date.now() });
  }

  // ─── Private Utilities ────────────────────────────────────────────────────

  /**
   * Split a string into an array of sub-strings each ≤ maxBytes UTF-8 bytes.
   * We operate on characters (ASCII-safe base64), so bytes === chars here.
   * @param {string} data
   * @param {number} maxBytes
   * @returns {string[]}
   */
  _splitIntoChunks(data, maxBytes) {
    const chunks = [];
    for (let i = 0; i < data.length; i += maxBytes) {
      chunks.push(data.slice(i, i + maxBytes));
    }
    return chunks;
  }

  /**
   * Join chunk array back into the original string.
   * @param {string[]} chunks
   * @returns {string}
   */
  _reassembleChunks(chunks) {
    return chunks.join('');
  }

  /** @param {Uint8Array} buf @returns {string} */
  _toBase64(buf) {
    return btoa(String.fromCharCode(...buf));
  }

  /** @param {string} b64 @returns {Uint8Array} */
  _fromBase64(b64) {
    return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  }

  /**
   * Read multiple keys from chrome.storage.local and return them as an object.
   * @param {string[]} keys
   * @returns {Promise<object>}
   */
  async _getLocalKeys(keys) {
    return chrome.storage.local.get(keys);
  }

  /**
   * Remove all phantomprint_sync_* chunk keys from chrome.storage.sync.
   */
  async _clearSyncChunks() {
    const all = await chrome.storage.sync.get(null);
    const toRemove = Object.keys(all).filter(
      k => k.startsWith(this.CHUNK_PREFIX) || k === 'phantomprint_sync_meta',
    );
    if (toRemove.length > 0) {
      await chrome.storage.sync.remove(toRemove);
    }
  }

  /**
   * Retrieve the metadata entry stored alongside the sync chunks.
   * @returns {Promise<{chunkCount:number, pushedAt:number}|null>}
   */
  async _getSyncMeta() {
    const result = await chrome.storage.sync.get('phantomprint_sync_meta');
    return result.phantomprint_sync_meta || null;
  }
}

if (typeof self !== 'undefined') self.CloudSync = CloudSync;
