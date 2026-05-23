/**
 * @file cookie-manager.js
 * @description Full-featured cookie management system for the PhantomPrint service worker.
 * Uses chrome.cookies API and SubtleCrypto for AES-256-GCM encrypted export/import.
 * Runs in the service worker context — no ES module imports required.
 */

class CookieManager {
  /**
   * @typedef {Object} CookieDetails
   * @property {string} url
   * @property {string} name
   * @property {string} [value]
   * @property {string} [domain]
   * @property {string} [path]
   * @property {boolean} [secure]
   * @property {boolean} [httpOnly]
   * @property {string} [sameSite]
   * @property {number} [expirationDate]
   * @property {string} [storeId]
   */

  constructor() {
    this.STORAGE_KEY_PROFILES = 'phantomprint_cookie_profiles';
    this.STORAGE_KEY_AUTO_DELETE = 'phantomprint_auto_delete_enabled';
    this.STORAGE_KEY_LIFETIME = 'phantomprint_cookie_max_days';
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION 1 — Core CRUD
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Retrieve all cookies and group them by domain.
   * @returns {Promise<Object.<string, chrome.cookies.Cookie[]>>}
   */
  async getAllCookies() {
    const cookies = await chrome.cookies.getAll({});
    const grouped = {};
    for (const cookie of cookies) {
      const domain = cookie.domain.replace(/^\./, '');
      if (!grouped[domain]) grouped[domain] = [];
      grouped[domain].push(cookie);
    }
    return grouped;
  }

  /**
   * Get all cookies for a specific domain (strips leading dot for matching).
   * @param {string} domain
   * @returns {Promise<chrome.cookies.Cookie[]>}
   */
  async getCookiesForDomain(domain) {
    const normalised = domain.replace(/^\./, '');
    const all = await chrome.cookies.getAll({ domain: normalised });
    return all;
  }

  /**
   * Add (or overwrite) a cookie using full detail object.
   * @param {CookieDetails} details
   * @returns {Promise<chrome.cookies.Cookie|null>}
   */
  async addCookie(details) {
    const setDetails = { url: details.url, name: details.name };
    if (details.value !== undefined)          setDetails.value = details.value;
    if (details.domain !== undefined)         setDetails.domain = details.domain;
    if (details.path !== undefined)           setDetails.path = details.path;
    if (details.secure !== undefined)         setDetails.secure = details.secure;
    if (details.httpOnly !== undefined)       setDetails.httpOnly = details.httpOnly;
    if (details.sameSite !== undefined)       setDetails.sameSite = details.sameSite;
    if (details.expirationDate !== undefined) setDetails.expirationDate = details.expirationDate;
    if (details.storeId !== undefined)        setDetails.storeId = details.storeId;
    return chrome.cookies.set(setDetails);
  }

  /**
   * Edit an existing cookie by removing the old one and creating the new one.
   * @param {CookieDetails} oldDetails - Identifies the cookie to remove
   * @param {CookieDetails} newDetails - Full details for the replacement cookie
   * @returns {Promise<chrome.cookies.Cookie|null>}
   */
  async editCookie(oldDetails, newDetails) {
    await this.deleteCookie(oldDetails);
    return this.addCookie(newDetails);
  }

  /**
   * Delete a specific cookie.
   * @param {{url: string, name: string, storeId?: string}} details
   * @returns {Promise<chrome.cookies.Cookie|null>}
   */
  async deleteCookie(details) {
    const removeDetails = { url: details.url, name: details.name };
    if (details.storeId) removeDetails.storeId = details.storeId;
    return chrome.cookies.remove(removeDetails);
  }

  /**
   * Delete all cookies for a given domain.
   * @param {string} domain
   * @returns {Promise<{deleted: number}>}
   */
  async bulkDelete(domain) {
    const cookies = await this.getCookiesForDomain(domain);
    let deleted = 0;
    for (const cookie of cookies) {
      const protocol = cookie.secure ? 'https://' : 'http://';
      const url = `${protocol}${cookie.domain.replace(/^\./, '')}${cookie.path}`;
      await chrome.cookies.remove({ url, name: cookie.name });
      deleted++;
    }
    return { deleted };
  }

  /**
   * Search all cookies by name, value, or domain substring.
   * @param {string} query
   * @returns {Promise<chrome.cookies.Cookie[]>}
   */
  async searchCookies(query) {
    const all = await chrome.cookies.getAll({});
    const q = query.toLowerCase();
    return all.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.value.toLowerCase().includes(q) ||
      c.domain.toLowerCase().includes(q)
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION 2 — Export / Import
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Export cookies as a JSON string. Optionally filter by domain.
   * @param {string} [domain]
   * @returns {Promise<string>}
   */
  async exportCookiesJSON(domain) {
    const cookies = domain
      ? await this.getCookiesForDomain(domain)
      : await chrome.cookies.getAll({});
    return JSON.stringify(cookies, null, 2);
  }

  /**
   * Export cookies in Netscape/Mozilla cookie file format.
   * Compatible with curl --cookie-jar and wget.
   * @param {string} [domain]
   * @returns {Promise<string>}
   */
  async exportCookiesNetscape(domain) {
    const cookies = domain
      ? await this.getCookiesForDomain(domain)
      : await chrome.cookies.getAll({});
    const lines = ['# Netscape HTTP Cookie File', '# Generated by PhantomPrint', ''];
    for (const c of cookies) {
      const domainFlag = c.domain.startsWith('.') ? 'TRUE' : 'FALSE';
      const secure = c.secure ? 'TRUE' : 'FALSE';
      const expiry = c.expirationDate ? Math.floor(c.expirationDate) : 0;
      const path = c.path || '/';
      lines.push(`${c.domain}\t${domainFlag}\t${path}\t${secure}\t${expiry}\t${c.name}\t${c.value}`);
    }
    return lines.join('\n');
  }

  /**
   * Export cookies for a domain as a Cookie header string (key=value; key=value).
   * @param {string} domain
   * @returns {Promise<string>}
   */
  async exportCookiesHeader(domain) {
    const cookies = await this.getCookiesForDomain(domain);
    return cookies.map(c => `${c.name}=${c.value}`).join('; ');
  }

  /**
   * Import cookies from a JSON string (array of cookie objects).
   * @param {string} jsonString
   * @returns {Promise<{imported: number, failed: number}>}
   */
  async importCookiesJSON(jsonString) {
    const cookies = JSON.parse(jsonString);
    if (!Array.isArray(cookies)) throw new Error('Expected an array of cookies');
    let imported = 0, failed = 0;
    for (const cookie of cookies) {
      try {
        const protocol = cookie.secure ? 'https://' : 'http://';
        const domain = cookie.domain.replace(/^\./, '');
        const url = `${protocol}${domain}${cookie.path || '/'}`;
        await this.addCookie({ ...cookie, url });
        imported++;
      } catch (e) {
        failed++;
      }
    }
    return { imported, failed };
  }

  /**
   * Import cookies from Netscape format text.
   * @param {string} text
   * @returns {Promise<{imported: number, failed: number}>}
   */
  async importCookiesNetscape(text) {
    const lines = text.split('\n').filter(l => l.trim() && !l.startsWith('#'));
    let imported = 0, failed = 0;
    for (const line of lines) {
      const parts = line.split('\t');
      if (parts.length < 7) { failed++; continue; }
      const [domain, , path, secure, expiry, name, value] = parts;
      const isSecure = secure === 'TRUE';
      const protocol = isSecure ? 'https://' : 'http://';
      const cleanDomain = domain.replace(/^\./, '');
      const url = `${protocol}${cleanDomain}${path}`;
      try {
        await this.addCookie({
          url, name, value, domain,
          path, secure: isSecure,
          expirationDate: parseInt(expiry, 10) || undefined
        });
        imported++;
      } catch (e) {
        failed++;
      }
    }
    return { imported, failed };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION 3 — Encryption / Decryption (AES-256-GCM + PBKDF2)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Encrypt a string payload with AES-256-GCM using a PBKDF2-derived key.
   * Uses 100,000 PBKDF2 iterations with SHA-256.
   * @param {string} data - Plaintext to encrypt
   * @param {string} password - User-supplied passphrase
   * @returns {Promise<{salt: string, iv: string, data: string}>} Base64-encoded fields
   */
  async encryptExport(data, password) {
    const enc = new TextEncoder();
    const salt = self.crypto.getRandomValues(new Uint8Array(16));
    const iv   = self.crypto.getRandomValues(new Uint8Array(12));

    const keyMaterial = await self.crypto.subtle.importKey(
      'raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveKey']
    );
    const key = await self.crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt']
    );
    const ciphertext = await self.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      enc.encode(data)
    );
    return {
      salt: this._bufToBase64(salt),
      iv:   this._bufToBase64(iv),
      data: this._bufToBase64(new Uint8Array(ciphertext))
    };
  }

  /**
   * Decrypt data previously encrypted with encryptExport.
   * @param {{salt: string, iv: string, data: string}} encData
   * @param {string} password
   * @returns {Promise<string>} Decrypted plaintext
   */
  async decryptImport(encData, password) {
    const enc = new TextEncoder();
    const salt       = this._base64ToBuf(encData.salt);
    const iv         = this._base64ToBuf(encData.iv);
    const ciphertext = this._base64ToBuf(encData.data);

    const keyMaterial = await self.crypto.subtle.importKey(
      'raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveKey']
    );
    const key = await self.crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );
    const plaintext = await self.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );
    return new TextDecoder().decode(plaintext);
  }

  /** @private */
  _bufToBase64(buf) {
    return btoa(String.fromCharCode(...buf));
  }

  /** @private */
  _base64ToBuf(b64) {
    return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION 4 — Cookie Profiles
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Save a named snapshot of all cookies (or cookies for one domain).
   * @param {string} name - Profile name
   * @param {string} [domain] - Optional domain filter
   * @returns {Promise<void>}
   */
  async saveCookieProfile(name, domain) {
    const cookies = domain
      ? await this.getCookiesForDomain(domain)
      : await chrome.cookies.getAll({});
    const { [this.STORAGE_KEY_PROFILES]: profiles = {} } = await chrome.storage.local.get(this.STORAGE_KEY_PROFILES);
    profiles[name] = { cookies, savedAt: Date.now(), domain: domain || null };
    await chrome.storage.local.set({ [this.STORAGE_KEY_PROFILES]: profiles });
  }

  /**
   * Restore cookies from a named profile, clearing existing cookies first.
   * @param {string} name - Profile name to restore
   * @returns {Promise<{restored: number, failed: number}>}
   */
  async loadCookieProfile(name) {
    const { [this.STORAGE_KEY_PROFILES]: profiles = {} } = await chrome.storage.local.get(this.STORAGE_KEY_PROFILES);
    const profile = profiles[name];
    if (!profile) throw new Error(`Profile "${name}" not found`);

    // Clear existing cookies for affected scope
    const existing = profile.domain
      ? await this.getCookiesForDomain(profile.domain)
      : await chrome.cookies.getAll({});
    for (const c of existing) {
      const protocol = c.secure ? 'https://' : 'http://';
      const url = `${protocol}${c.domain.replace(/^\./, '')}${c.path}`;
      await chrome.cookies.remove({ url, name: c.name });
    }

    let restored = 0, failed = 0;
    for (const cookie of profile.cookies) {
      try {
        const protocol = cookie.secure ? 'https://' : 'http://';
        const domain = cookie.domain.replace(/^\./, '');
        const url = `${protocol}${domain}${cookie.path || '/'}`;
        await this.addCookie({ ...cookie, url });
        restored++;
      } catch (e) {
        failed++;
      }
    }
    return { restored, failed };
  }

  /**
   * List all saved cookie profile names and metadata.
   * @returns {Promise<Array<{name: string, savedAt: number, domain: string|null, count: number}>>}
   */
  async listCookieProfiles() {
    const { [this.STORAGE_KEY_PROFILES]: profiles = {} } = await chrome.storage.local.get(this.STORAGE_KEY_PROFILES);
    return Object.entries(profiles).map(([name, data]) => ({
      name,
      savedAt: data.savedAt,
      domain: data.domain,
      count: data.cookies.length
    }));
  }

  /**
   * Delete a saved cookie profile by name.
   * @param {string} name
   * @returns {Promise<void>}
   */
  async deleteCookieProfile(name) {
    const { [this.STORAGE_KEY_PROFILES]: profiles = {} } = await chrome.storage.local.get(this.STORAGE_KEY_PROFILES);
    delete profiles[name];
    await chrome.storage.local.set({ [this.STORAGE_KEY_PROFILES]: profiles });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION 5 — Auto-Delete & Tracker Blocking
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Enable or disable the auto-delete tracking flag in storage.
   * @param {boolean} enabled
   * @returns {Promise<void>}
   */
  async enableAutoDeleteTracking(enabled) {
    await chrome.storage.local.set({ [this.STORAGE_KEY_AUTO_DELETE]: enabled });
  }

  /**
   * Return a list of 50+ known tracker/advertising cookie domains.
   * @returns {string[]}
   */
  getTrackerDomains() {
    return [
      'doubleclick.net', 'googleadservices.com', 'googlesyndication.com',
      'google-analytics.com', 'googletagmanager.com', 'googletagservices.com',
      'adnxs.com', 'adsrvr.org', 'rubiconproject.com', 'openx.net',
      'pubmatic.com', 'casalemedia.com', 'criteo.com', 'criteo.net',
      'adform.net', 'demdex.net', 'bluekai.com', 'exelator.com',
      'quantserve.com', 'scorecardresearch.com', 'comscore.com',
      'outbrain.com', 'taboola.com', 'medianet.com', 'media.net',
      'amazon-adsystem.com', 'ads.linkedin.com', 'px.ads.linkedin.com',
      'ads.twitter.com', 'pixel.facebook.com', 'connect.facebook.net',
      'bat.bing.com', 'clarity.ms', 'hotjar.com', 'fullstory.com',
      'logrocket.com', 'mouseflow.com', 'smartlook.com', 'heapanalytics.com',
      'segment.com', 'segment.io', 'mixpanel.com', 'amplitude.com',
      'braze.com', 'braze.eu', 'mparticle.com', 'klaviyo.com',
      'pardot.com', 'marketo.net', 'eloqua.com', 'hubspot.com',
      'omtrdc.net', 'everesttech.net', 'mopub.com', 'applovin.com'
    ];
  }

  /**
   * Delete all cookies belonging to known tracker domains.
   * @returns {Promise<{deleted: number}>}
   */
  async blockTrackerCookies() {
    const trackers = this.getTrackerDomains();
    let deleted = 0;
    for (const domain of trackers) {
      const result = await this.bulkDelete(domain);
      deleted += result.deleted;
    }
    return { deleted };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SECTION 6 — Lifetime Limiter
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Save the maximum cookie lifetime in days to storage.
   * @param {number} maxDays
   * @returns {Promise<void>}
   */
  async setLifetimeLimiter(maxDays) {
    await chrome.storage.local.set({ [this.STORAGE_KEY_LIFETIME]: maxDays });
  }

  /**
   * Delete all cookies whose expiration date exceeds the maxDays setting.
   * Session cookies (no expiry) are not affected.
   * @returns {Promise<{deleted: number, skipped: number}>}
   */
  async enforceLifetimeLimits() {
    const { [this.STORAGE_KEY_LIFETIME]: maxDays } = await chrome.storage.local.get(this.STORAGE_KEY_LIFETIME);
    if (!maxDays || maxDays <= 0) return { deleted: 0, skipped: 0 };

    const nowSecs = Date.now() / 1000;
    const limitSecs = maxDays * 86400;
    const all = await chrome.cookies.getAll({});
    let deleted = 0, skipped = 0;

    for (const cookie of all) {
      if (!cookie.expirationDate) { skipped++; continue; }
      const lifetimeSecs = cookie.expirationDate - nowSecs;
      if (lifetimeSecs > limitSecs) {
        const protocol = cookie.secure ? 'https://' : 'http://';
        const domain = cookie.domain.replace(/^\./, '');
        const url = `${protocol}${domain}${cookie.path}`;
        await chrome.cookies.remove({ url, name: cookie.name });
        deleted++;
      } else {
        skipped++;
      }
    }
    return { deleted, skipped };
  }
}

if (typeof self !== 'undefined') self.CookieManager = CookieManager;
