/**
 * PhantomPrint Import / Export Module
 * Universal profile exchange — native JSON, encrypted, GoLogin, Multilogin, CSV, proxy lists.
 * Runs in service worker — may use chrome.* APIs and SubtleCrypto.
 */

class ImportExport {
  constructor() {
    this.VERSION      = '2.0.0';
    this.PBKDF2_ITER  = 100_000;
    this.NETSCAPE_HDR = '# Netscape HTTP Cookie File';
  }

  // ─── Native PhantomPrint Export ───────────────────────────────────────────

  /**
   * Export profiles (and settings) as a plain PhantomPrint JSON object.
   * @param {string[]|null} [profileNames]  Subset; null = all.
   * @param {'json'} [format]
   * @returns {Promise<{version:string, exported:number, profiles:object, settings:object}>}
   */
  async exportPhantomPrint(profileNames = null, format = 'json') {
    const stored = await chrome.storage.local.get([
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
    ]);

    let profiles = stored.savedProfiles || {};
    if (profileNames && profileNames.length) {
      const subset = {};
      for (const n of profileNames) {
        if (profiles[n]) subset[n] = profiles[n];
      }
      profiles = subset;
    }

    const settings = {
      whitelist:             stored.whitelist              || [],
      blacklist:             stored.blacklist              || [],
      categories:            stored.categories             || [],
      randomizationFrequency:stored.randomizationFrequency || 'session',
      crossSiteIsolation:    stored.crossSiteIsolation     || false,
      webrtcMode:            stored.webrtcMode             || 'disabled',
      proxies:               stored.proxies                || [],
      cookieProfiles:        stored.cookieProfiles         || {},
      networkRules:          stored.networkRules           || [],
      blockerConfig:         stored.blockerConfig          || {},
    };

    return {
      version:  this.VERSION,
      exported: Date.now(),
      profiles,
      settings,
    };
  }

  /**
   * Encrypt a PhantomPrint export payload with AES-256-GCM.
   * @param {string}   password
   * @param {string[]|null} [profileNames]
   * @returns {Promise<string>}  JSON string: {salt, iv, data, version}
   */
  async exportEncrypted(password, profileNames = null) {
    const payload = await this.exportPhantomPrint(profileNames);
    const encObj  = await this._encryptData(payload, password);
    return JSON.stringify(encObj, null, 2);
  }

  // ─── Native PhantomPrint Import ───────────────────────────────────────────

  /**
   * Parse and merge a PhantomPrint JSON export into chrome.storage.local.
   * @param {string} jsonString
   */
  async importPhantomPrint(jsonString) {
    let parsed;
    try {
      parsed = JSON.parse(jsonString);
    } catch {
      throw new Error('Invalid PhantomPrint JSON — could not parse.');
    }

    if (!parsed.version || !parsed.profiles) {
      throw new Error('Invalid PhantomPrint export format (missing version or profiles).');
    }

    const existing = await chrome.storage.local.get('savedProfiles');
    const current  = existing.savedProfiles || {};

    // Merge profiles (imported profiles win on collision)
    const merged = { ...current, ...parsed.profiles };
    const update = { savedProfiles: merged };

    // Merge settings if present
    if (parsed.settings) {
      const s = parsed.settings;
      if (s.whitelist)             update.whitelist             = s.whitelist;
      if (s.blacklist)             update.blacklist             = s.blacklist;
      if (s.categories)            update.categories            = s.categories;
      if (s.randomizationFrequency)update.randomizationFrequency= s.randomizationFrequency;
      if (s.crossSiteIsolation !== undefined) update.crossSiteIsolation = s.crossSiteIsolation;
      if (s.webrtcMode)            update.webrtcMode            = s.webrtcMode;
      if (s.proxies)               update.proxies               = s.proxies;
      if (s.cookieProfiles)        update.cookieProfiles        = s.cookieProfiles;
      if (s.networkRules)          update.networkRules          = s.networkRules;
      if (s.blockerConfig)         update.blockerConfig         = s.blockerConfig;
    }

    await chrome.storage.local.set(update);
  }

  /**
   * Decrypt an encrypted export then import it.
   * @param {string} encString  JSON-encoded {salt,iv,data,version}
   * @param {string} password
   */
  async importEncrypted(encString, password) {
    let encObj;
    try {
      encObj = JSON.parse(encString);
    } catch {
      throw new Error('Invalid encrypted export — could not parse JSON.');
    }
    const decrypted = await this._decryptData(encObj, password);
    await this.importPhantomPrint(JSON.stringify(decrypted));
  }

  // ─── GoLogin Compatibility ────────────────────────────────────────────────

  /**
   * Convert a single PhantomPrint profile object to GoLogin JSON format.
   * @param {object} profile  A PhantomPrint profile object.
   * @returns {object}
   */
  exportGoLogin(profile) {
    const fp = profile.fingerprint || {};
    const nav = fp.navigator      || {};
    const scr = fp.screen         || {};

    return {
      name:     profile.name     || 'Imported Profile',
      os:       this._ppOsToGoLogin(nav.platform || ''),
      startUrl: profile.startUrl || 'about:blank',
      notes:    profile.notes    || '',
      canvas:   { mode: 'noise' },
      webgl:    { mode: 'noise' },
      navigator: {
        userAgent:          nav.userAgent        || '',
        resolution:         `${scr.width || 1920}x${scr.height || 1080}`,
        language:           nav.language         || 'en-US',
        platform:           nav.platform         || 'Win32',
        hardwareConcurrency:nav.hardwareConcurrency || 4,
        deviceMemory:       nav.deviceMemory      || 8,
        maxTouchPoints:     nav.maxTouchPoints    || 0,
        vendor:             nav.vendor            || 'Google Inc.',
      },
      timezone: fp.timezone || 'America/New_York',
      proxy: profile.proxy
        ? {
            mode:     'http',
            host:     profile.proxy.host || '',
            port:     profile.proxy.port || 80,
            username: profile.proxy.username || '',
            password: profile.proxy.password || '',
          }
        : { mode: 'none' },
    };
  }

  /**
   * Convert a GoLogin profile JSON to a PhantomPrint profile object.
   * @param {object|string} goLoginJson
   * @returns {object}
   */
  importGoLogin(goLoginJson) {
    const g = typeof goLoginJson === 'string' ? JSON.parse(goLoginJson) : goLoginJson;
    const [w, h] = (g.navigator?.resolution || '1920x1080').split('x').map(Number);

    return {
      name:   g.name || 'GoLogin Import',
      notes:  g.notes || '',
      source: 'gologin',
      fingerprint: {
        navigator: {
          userAgent:           g.navigator?.userAgent           || '',
          platform:            this._goLoginOsToPp(g.os || ''),
          language:            g.navigator?.language           || 'en-US',
          hardwareConcurrency: g.navigator?.hardwareConcurrency || 4,
          deviceMemory:        g.navigator?.deviceMemory        || 8,
          maxTouchPoints:      g.navigator?.maxTouchPoints      || 0,
          vendor:              g.navigator?.vendor              || 'Google Inc.',
        },
        screen:    { width: w, height: h, colorDepth: 24 },
        timezone:  g.timezone || 'America/New_York',
      },
      proxy: g.proxy && g.proxy.mode !== 'none'
        ? {
            host:     g.proxy.host     || '',
            port:     g.proxy.port     || 80,
            username: g.proxy.username || '',
            password: g.proxy.password || '',
            protocol: g.proxy.mode     || 'http',
          }
        : null,
    };
  }

  // ─── Multilogin Compatibility ─────────────────────────────────────────────

  /**
   * Convert a PhantomPrint profile to a simplified Multilogin .mlx JSON format.
   * @param {object} profile
   * @returns {object}
   */
  exportMultilogin(profile) {
    const fp  = profile.fingerprint || {};
    const nav = fp.navigator       || {};
    const scr = fp.screen          || {};
    const ua  = nav.userAgent      || '';

    const browserType = ua.includes('Firefox') ? 'mimic' : 'stealthfox';
    const osType      = this._detectOsType(nav.platform || '');

    return {
      core: {
        version:     '3',
        name:        profile.name || 'Imported Profile',
        osType,
        browserType,
      },
      network: profile.proxy
        ? {
            proxyEnabled: true,
            proxy: {
              type:     (profile.proxy.protocol || 'http').toUpperCase(),
              host:     profile.proxy.host     || '',
              port:     profile.proxy.port     || 80,
              username: profile.proxy.username || '',
              password: profile.proxy.password || '',
            },
          }
        : { proxyEnabled: false },
      fingerprint: {
        navigator: {
          userAgent:           nav.userAgent           || '',
          language:            nav.language            || 'en-US',
          platform:            nav.platform            || 'Win32',
          hardwareConcurrency: nav.hardwareConcurrency || 4,
          deviceMemory:        nav.deviceMemory        || 8,
          maxTouchPoints:      nav.maxTouchPoints      || 0,
          vendor:              nav.vendor              || 'Google Inc.',
        },
        screen: {
          width:      scr.width      || 1920,
          height:     scr.height     || 1080,
          colorDepth: scr.colorDepth || 24,
        },
        timezone: fp.timezone || 'America/New_York',
        webgl:    { mode: 'NOISE' },
        canvas:   { mode: 'NOISE' },
        audio:    { mode: 'NOISE' },
      },
    };
  }

  /**
   * Convert a Multilogin .mlx JSON profile to PhantomPrint format.
   * @param {object|string} mlxJson
   * @returns {object}
   */
  importMultilogin(mlxJson) {
    const m  = typeof mlxJson === 'string' ? JSON.parse(mlxJson) : mlxJson;
    const fp = m.fingerprint || {};
    const n  = fp.navigator  || {};
    const s  = fp.screen     || {};

    return {
      name:   m.core?.name  || 'Multilogin Import',
      source: 'multilogin',
      fingerprint: {
        navigator: {
          userAgent:           n.userAgent           || '',
          platform:            n.platform            || 'Win32',
          language:            n.language            || 'en-US',
          hardwareConcurrency: n.hardwareConcurrency || 4,
          deviceMemory:        n.deviceMemory        || 8,
          maxTouchPoints:      n.maxTouchPoints      || 0,
          vendor:              n.vendor              || 'Google Inc.',
        },
        screen:   { width: s.width || 1920, height: s.height || 1080, colorDepth: s.colorDepth || 24 },
        timezone: fp.timezone || 'America/New_York',
      },
      proxy: m.network?.proxyEnabled && m.network.proxy
        ? {
            host:     m.network.proxy.host     || '',
            port:     m.network.proxy.port     || 80,
            username: m.network.proxy.username || '',
            password: m.network.proxy.password || '',
            protocol: (m.network.proxy.type    || 'HTTP').toLowerCase(),
          }
        : null,
    };
  }

  // ─── CSV Export / Import ──────────────────────────────────────────────────

  /**
   * Export an array of profiles as CSV.
   * Columns: name, browser, os, screen, gpu, language, timezone, proxy
   * @param {object[]} profiles
   * @returns {string}
   */
  exportCSV(profiles) {
    const header = 'name,browser,os,screen,gpu,language,timezone,proxy';
    const rows = profiles.map(p => {
      const fp  = p.fingerprint || {};
      const nav = fp.navigator  || {};
      const scr = fp.screen     || {};
      const gpu = fp.webgl      || {};

      const proxy = p.proxy
        ? `${p.proxy.protocol || 'http'}://${p.proxy.host || ''}:${p.proxy.port || ''}`
        : '';

      return [
        this._csvEscape(p.name              || ''),
        this._csvEscape(nav.userAgent       ? this._detectBrowserFromUA(nav.userAgent) : ''),
        this._csvEscape(nav.platform        || ''),
        this._csvEscape(`${scr.width || ''}x${scr.height || ''}`),
        this._csvEscape(gpu.renderer        || ''),
        this._csvEscape(nav.language        || ''),
        this._csvEscape(fp.timezone         || ''),
        this._csvEscape(proxy),
      ].join(',');
    });

    return [header, ...rows].join('\r\n');
  }

  /**
   * Parse a CSV string and return an array of minimal PhantomPrint profile objects.
   * @param {string} csvString
   * @returns {object[]}
   */
  importCSV(csvString) {
    const lines = csvString.replace(/\r\n/g, '\n').split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];

    const header = lines[0].split(',').map(h => h.trim().toLowerCase());
    const profiles = [];

    for (let i = 1; i < lines.length; i++) {
      const cols  = this._csvParseLine(lines[i]);
      const get   = key => cols[header.indexOf(key)] || '';
      const [w, h] = (get('screen') || 'x').split('x').map(Number);
      const proxy  = this._parseProxyUrl(get('proxy'));

      profiles.push({
        name:   get('name') || `CSV Profile ${i}`,
        source: 'csv',
        fingerprint: {
          navigator: {
            platform: get('os')       || '',
            language: get('language') || 'en-US',
          },
          screen:   { width: w || 1920, height: h || 1080, colorDepth: 24 },
          timezone: get('timezone') || '',
          webgl:    { renderer: get('gpu') || '' },
        },
        proxy,
      });
    }

    return profiles;
  }

  // ─── Proxy List Export / Import ───────────────────────────────────────────

  /**
   * Export an array of proxy objects, one per line: protocol://user:pass@host:port
   * @param {object[]} proxies
   * @returns {string}
   */
  exportProxyList(proxies) {
    return proxies.map(p => {
      const proto = p.protocol || 'http';
      const auth  = (p.username && p.password)
        ? `${encodeURIComponent(p.username)}:${encodeURIComponent(p.password)}@`
        : '';
      return `${proto}://${auth}${p.host}:${p.port}`;
    }).join('\n');
  }

  /**
   * Parse various proxy list formats into an array of proxy objects.
   * Supported: host:port | host:port:user:pass | protocol://host:port | protocol://user:pass@host:port
   * @param {string} text
   * @returns {object[]}
   */
  importProxyList(text) {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    return lines.map(line => this._parseProxyLine(line)).filter(Boolean);
  }

  // ─── Profile Cloning ─────────────────────────────────────────────────────

  /**
   * Clone a named profile with a fresh seed, optionally mutating browser/OS/GPU.
   * @param {string} profileName
   * @param {{ count?:number, changeBrowser?:boolean, changeOS?:boolean, changeGPU?:boolean }} [options]
   * @returns {Promise<string[]>}  Array of new profile names.
   */
  async cloneProfile(profileName, options = {}) {
    const { count = 1, changeBrowser = false, changeOS = false, changeGPU = false } = options;

    const stored = await chrome.storage.local.get('savedProfiles');
    const profiles = stored.savedProfiles || {};
    const source   = profiles[profileName];

    if (!source) throw new Error(`Profile "${profileName}" not found.`);

    const clones    = {};
    const newNames  = [];

    for (let i = 0; i < count; i++) {
      const seed     = Math.random().toString(36).slice(2, 10);
      const newName  = `${profileName} (Clone ${seed})`;
      const clone    = JSON.parse(JSON.stringify(source));

      clone.name     = newName;
      clone.seed     = seed;
      clone.clonedAt = Date.now();
      clone.cloneOf  = profileName;

      if (changeBrowser && clone.fingerprint?.navigator) {
        clone.fingerprint.navigator.userAgent = this._mutateBrowserInUA(
          clone.fingerprint.navigator.userAgent || '',
        );
      }

      if (changeOS && clone.fingerprint?.navigator) {
        clone.fingerprint.navigator.platform = this._randomAlternatePlatform(
          clone.fingerprint.navigator.platform || '',
        );
      }

      if (changeGPU && clone.fingerprint?.webgl) {
        clone.fingerprint.webgl.renderer = this._randomAlternateGPU(
          clone.fingerprint.webgl.renderer || '',
        );
      }

      clones[newName] = clone;
      newNames.push(newName);
    }

    await chrome.storage.local.set({
      savedProfiles: { ...profiles, ...clones },
    });

    return newNames;
  }

  // ─── Netscape Cookie Import ────────────────────────────────────────────────

  /**
   * Parse a Netscape HTTP Cookie File and store its cookies against a named profile.
   * @param {string} text
   * @param {string} profileName
   */
  async importCookieNetscape(text, profileName) {
    const lines = text.split(/\r?\n/).filter(l => l.trim() && !l.startsWith('#'));
    const cookies = lines.map(line => {
      const parts = line.split('\t');
      if (parts.length < 7) return null;
      const [domain, includeSubdomains, path, secure, expires, name, value] = parts;
      return {
        domain:         domain.replace(/^\./, ''),
        includeSubdomains: includeSubdomains.toUpperCase() === 'TRUE',
        path:           path   || '/',
        secure:         secure.toUpperCase() === 'TRUE',
        expirationDate: Number(expires),
        name:           name   || '',
        value:          value  || '',
      };
    }).filter(Boolean);

    const stored = await chrome.storage.local.get('cookieProfiles');
    const cp = stored.cookieProfiles || {};
    cp[profileName] = cookies;
    await chrome.storage.local.set({ cookieProfiles: cp });
  }

  // ─── Encryption (mirrors CloudSync) ──────────────────────────────────────

  /**
   * AES-256-GCM encrypt via PBKDF2 key derivation.
   * @param {*}      data
   * @param {string} password
   * @returns {Promise<{salt:string, iv:string, data:string, version:string}>}
   */
  async _encryptData(data, password) {
    const encoder = new TextEncoder();
    const plain   = encoder.encode(JSON.stringify(data));
    const salt    = crypto.getRandomValues(new Uint8Array(16));
    const iv      = crypto.getRandomValues(new Uint8Array(12));

    const base = await crypto.subtle.importKey(
      'raw', encoder.encode(password), { name: 'PBKDF2' }, false, ['deriveKey'],
    );
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: this.PBKDF2_ITER, hash: 'SHA-256' },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt'],
    );
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain);

    return {
      salt:    this._toB64(salt),
      iv:      this._toB64(iv),
      data:    this._toB64(new Uint8Array(cipher)),
      version: '1.0',
    };
  }

  /**
   * Decrypt a payload produced by _encryptData().
   * @param {{salt:string, iv:string, data:string, version:string}} encObj
   * @param {string} password
   * @returns {Promise<*>}
   */
  async _decryptData(encObj, password) {
    if (encObj.version !== '1.0') throw new Error(`Unknown encryption version: ${encObj.version}`);
    const encoder = new TextEncoder();
    const salt    = this._fromB64(encObj.salt);
    const iv      = this._fromB64(encObj.iv);
    const cipher  = this._fromB64(encObj.data);

    const base = await crypto.subtle.importKey(
      'raw', encoder.encode(password), { name: 'PBKDF2' }, false, ['deriveKey'],
    );
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: this.PBKDF2_ITER, hash: 'SHA-256' },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt'],
    );
    let plain;
    try {
      plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
    } catch {
      throw new Error('Decryption failed — wrong password or corrupted data.');
    }
    return JSON.parse(new TextDecoder().decode(plain));
  }

  // ─── Private Utility Helpers ──────────────────────────────────────────────

  _toB64(buf) {
    return btoa(String.fromCharCode(...buf));
  }

  _fromB64(b64) {
    return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  }

  _csvEscape(value) {
    const s = String(value);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }

  _csvParseLine(line) {
    const cols = [];
    let inQuote = false, cur = '';
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === ',' && !inQuote) {
        cols.push(cur); cur = '';
      } else {
        cur += ch;
      }
    }
    cols.push(cur);
    return cols;
  }

  _parseProxyUrl(url) {
    if (!url) return null;
    return this._parseProxyLine(url);
  }

  _parseProxyLine(line) {
    try {
      // Format: protocol://user:pass@host:port
      if (line.includes('://')) {
        const url      = new URL(line);
        return {
          protocol: url.protocol.replace(':', '') || 'http',
          host:     url.hostname,
          port:     Number(url.port) || 80,
          username: decodeURIComponent(url.username || ''),
          password: decodeURIComponent(url.password || ''),
        };
      }

      // Format: host:port or host:port:user:pass
      const parts = line.split(':');
      if (parts.length === 2) {
        return { protocol: 'http', host: parts[0], port: Number(parts[1]) || 80, username: '', password: '' };
      }
      if (parts.length === 4) {
        return { protocol: 'http', host: parts[0], port: Number(parts[1]) || 80, username: parts[2], password: parts[3] };
      }
    } catch {
      return null;
    }
    return null;
  }

  _detectBrowserFromUA(ua) {
    if (ua.includes('Firefox'))  return 'Firefox';
    if (ua.includes('Edg/'))     return 'Edge';
    if (ua.includes('OPR/'))     return 'Opera';
    if (ua.includes('Chrome'))   return 'Chrome';
    if (ua.includes('Safari'))   return 'Safari';
    return 'Unknown';
  }

  _detectOsType(platform) {
    if (/win/i.test(platform))   return 'win';
    if (/mac/i.test(platform))   return 'mac';
    if (/linux/i.test(platform)) return 'lin';
    if (/android/i.test(platform)) return 'android';
    if (/iphone|ipad/i.test(platform)) return 'ios';
    return 'win';
  }

  _ppOsToGoLogin(platform) {
    if (/win/i.test(platform))   return 'win';
    if (/mac/i.test(platform))   return 'mac';
    if (/linux/i.test(platform)) return 'lin';
    if (/android/i.test(platform)) return 'android';
    return 'win';
  }

  _goLoginOsToPp(os) {
    const map = { win: 'Win32', mac: 'MacIntel', lin: 'Linux x86_64', android: 'Linux armv8l' };
    return map[os.toLowerCase()] || 'Win32';
  }

  _mutateBrowserInUA(ua) {
    // Bump Chrome minor version by a small random amount
    return ua.replace(/Chrome\/(\d+)\.(\d+)\.(\d+)\.(\d+)/, (_, maj, min, b, p) => {
      const newPatch = Number(p) + Math.floor(Math.random() * 50 + 1);
      return `Chrome/${maj}.${min}.${b}.${newPatch}`;
    });
  }

  _randomAlternatePlatform(current) {
    const platforms = ['Win32', 'Linux x86_64', 'MacIntel', 'Linux aarch64'];
    const others    = platforms.filter(p => p !== current);
    return others[Math.floor(Math.random() * others.length)];
  }

  _randomAlternateGPU(current) {
    const gpus = [
      'ANGLE (NVIDIA GeForce RTX 3080 Direct3D11 vs_5_0 ps_5_0)',
      'ANGLE (AMD Radeon RX 6800 XT Direct3D11 vs_5_0 ps_5_0)',
      'ANGLE (Intel(R) UHD Graphics 770 Direct3D11 vs_5_0 ps_5_0)',
      'ANGLE (NVIDIA GeForce RTX 4090 Direct3D11 vs_5_0 ps_5_0)',
      'ANGLE (AMD Radeon RX 7900 XTX Direct3D11 vs_5_0 ps_5_0)',
    ];
    const others = gpus.filter(g => g !== current);
    return others[Math.floor(Math.random() * others.length)];
  }
}

if (typeof self !== 'undefined') self.ImportExport = ImportExport;
