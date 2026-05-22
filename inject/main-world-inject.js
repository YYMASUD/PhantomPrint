// PhantomPrint - Main World Injection Script
// This runs in the page context BEFORE any page scripts execute
// It coordinates all spoofing modules with a consistent fingerprint profile
(function() {
  'use strict';

  // =========================================================================
  // PRNG - Seeded pseudo-random number generator (xoshiro128**)
  // =========================================================================
  class PRNG {
    constructor(seed) {
      this.state = new Uint32Array(4);
      this.seed(seed);
    }
    seed(s) {
      if (typeof s === 'string') s = PRNG.hashString(s);
      for (let i = 0; i < 4; i++) {
        s += 0x9e3779b9;
        let t = s ^ (s >>> 16);
        t = Math.imul(t, 0x21f0aaad);
        t ^= t >>> 15;
        t = Math.imul(t, 0x735a2d97);
        t ^= t >>> 15;
        this.state[i] = t >>> 0;
      }
    }
    static hashString(str) {
      let h = 0x811c9dc5;
      for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
      }
      return h >>> 0;
    }
    next() {
      const s = this.state;
      const result = Math.imul(s[1] * 5, 1) << 7 | Math.imul(s[1] * 5, 1) >>> 25;
      const t = s[1] << 9;
      s[2] ^= s[0]; s[3] ^= s[1]; s[1] ^= s[2]; s[0] ^= s[3];
      s[2] ^= t;
      s[3] = (s[3] << 11) | (s[3] >>> 21);
      return (result >>> 0) / 4294967296;
    }
    nextInt(min, max) { return Math.floor(this.next() * (max - min + 1)) + min; }
    nextFloat(min, max) { return this.next() * (max - min) + min; }
    pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
    shuffle(arr) {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(this.next() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }
    generateHex(len) {
      let s = '';
      for (let i = 0; i < len; i++) s += Math.floor(this.next() * 16).toString(16);
      return s;
    }
  }

  // =========================================================================
  // Configuration retrieval from DOM dataset (injected by content script)
  // =========================================================================
  function getConfig() {
    // Method 1: Check synchronous window property (set by content script inline injection)
    if (window.__pp_config__) {
      const cfg = window.__pp_config__;
      try { delete window.__pp_config__; } catch(e) {}
      return cfg;
    }
    // Method 2: Check DOM attribute (set by content script)
    try {
      const el = document.documentElement;
      const configStr = el.getAttribute('data-pp-config');
      if (configStr) {
        el.removeAttribute('data-pp-config');
        return JSON.parse(configStr);
      }
    } catch(e) {}
    // Method 3: Default config if neither method provided config
    return {
      enabled: true,
      sessionSeed: Date.now().toString(36) + Math.random().toString(36),
      crossSiteIsolation: true,
      categories: {
        navigator: true, screen: true, canvas: true, webgl: true,
        audio: true, webrtc: true, fonts: true, timing: true,
        behavior: true, media: true, storage: true, network: true,
        hardware: true, plugins: true, privacy: true, location: true
      },
      webrtcMode: 'ip_only',
      alwaysVisible: false,
      whitelist: []
    };
  }

  // =========================================================================
  // Determine if current site is whitelisted
  // =========================================================================
  function isWhitelisted(config) {
    const hostname = window.location.hostname;
    return (config.whitelist || []).some(site => {
      if (site === hostname) return true;
      if (site.startsWith('.') && hostname.endsWith(site)) return true;
      if (hostname.endsWith('.' + site)) return true;
      return false;
    });
  }

  // =========================================================================
  // Generate per-site seed for cross-site unlinkability
  // =========================================================================
  function generateSiteSeed(config) {
    const hostname = window.location.hostname;
    // Extract eTLD+1 for consistent per-site fingerprints
    const parts = hostname.split('.');
    const domain = parts.length > 2 ? parts.slice(-2).join('.') : hostname;
    
    if (config.crossSiteIsolation) {
      return config.sessionSeed + '::' + domain;
    }
    return config.sessionSeed;
  }

  // =========================================================================
  // CONSISTENCY ENGINE (inline for MAIN world execution)
  // =========================================================================
  const LANGUAGES = ['en-US', 'en-GB', 'en-AU', 'fr-FR', 'de-DE', 'es-ES', 'it-IT', 'ja-JP', 'ko-KR', 'zh-CN', 'ru-RU', 'nl-NL', 'pl-PL', 'sv-SE'];
  const TIMEZONE_MAP = {
    'en-US': ['America/New_York','America/Chicago','America/Denver','America/Los_Angeles'],
    'en-GB': ['Europe/London'], 'en-AU': ['Australia/Sydney'],
    'fr-FR': ['Europe/Paris'], 'de-DE': ['Europe/Berlin'], 'es-ES': ['Europe/Madrid'],
    'it-IT': ['Europe/Rome'], 'ja-JP': ['Asia/Tokyo'], 'ko-KR': ['Asia/Seoul'],
    'zh-CN': ['Asia/Shanghai'], 'ru-RU': ['Europe/Moscow'], 'nl-NL': ['Europe/Amsterdam'],
    'pl-PL': ['Europe/Warsaw'], 'sv-SE': ['Europe/Stockholm']
  };
  const TIMEZONE_OFFSETS = {
    'America/New_York':-300,'America/Chicago':-360,'America/Denver':-420,'America/Los_Angeles':-480,
    'Europe/London':0,'Europe/Paris':60,'Europe/Berlin':60,'Europe/Madrid':60,'Europe/Rome':60,
    'Europe/Amsterdam':60,'Europe/Warsaw':60,'Europe/Stockholm':60,'Europe/Moscow':180,
    'Asia/Tokyo':540,'Asia/Seoul':540,'Asia/Shanghai':480,'Australia/Sydney':660
  };

  function generateProfile(rng) {
    const profile = {};
    
    // OS and Browser selection
    const osChoice = rng.next();
    if (osChoice < 0.45) {
      profile.os = 'Windows'; profile.osVersion = rng.pick(['10.0','11.0']);
      profile.platform = 'Win32'; profile.arch = 'x86'; profile.mobile = false;
    } else if (osChoice < 0.7) {
      profile.os = 'macOS'; profile.osVersion = rng.pick(['13.6','14.1','14.2']);
      profile.platform = 'MacIntel'; profile.arch = 'arm'; profile.mobile = false;
    } else if (osChoice < 0.8) {
      profile.os = 'Linux'; profile.osVersion = rng.pick(['6.1','6.5','6.6']);
      profile.platform = 'Linux x86_64'; profile.arch = 'x86'; profile.mobile = false;
    } else if (osChoice < 0.92) {
      profile.os = 'Android'; profile.osVersion = rng.pick(['12','13','14']);
      profile.platform = 'Linux armv8l'; profile.arch = 'arm'; profile.mobile = true;
      profile.model = rng.pick(['Pixel 8','Pixel 7 Pro','SM-S918B','SM-A546B','SM-G991B']);
    } else {
      profile.os = 'iOS'; profile.osVersion = rng.pick(['16.7','17.1','17.2','17.3']);
      profile.platform = 'iPhone'; profile.arch = 'arm'; profile.mobile = true;
      profile.model = 'iPhone';
    }
    profile.bitness = '64';

    // Browser for OS
    if (profile.os === 'Windows') {
      const b = rng.next();
      profile.browser = b < 0.65 ? 'Chrome' : b < 0.85 ? 'Edge' : 'Firefox';
    } else if (profile.os === 'macOS') {
      const b = rng.next();
      profile.browser = b < 0.4 ? 'Safari' : b < 0.8 ? 'Chrome' : 'Firefox';
    } else if (profile.os === 'Linux') {
      profile.browser = rng.next() < 0.55 ? 'Chrome' : 'Firefox';
    } else if (profile.os === 'Android') {
      profile.browser = rng.next() < 0.9 ? 'Chrome' : 'Firefox';
    } else {
      profile.browser = rng.next() < 0.7 ? 'Safari' : 'Chrome';
    }

    const chromeVer = rng.pick(['119.0.0.0','120.0.0.0','121.0.0.0','122.0.0.0']);
    const ffVer = rng.pick(['119.0','120.0','121.0','122.0']);
    const safariVer = rng.pick(['16.7','17.0','17.1','17.2']);
    const edgeVer = rng.pick(['119.0.0.0','120.0.0.0','121.0.0.0','122.0.0.0']);

    if (profile.browser === 'Chrome') {
      profile.browserVersion = chromeVer; profile.vendor = 'Google Inc.';
      profile.vendorSub = ''; profile.productSub = '20030107';
    } else if (profile.browser === 'Firefox') {
      profile.browserVersion = ffVer; profile.vendor = '';
      profile.vendorSub = ''; profile.productSub = '20100101';
    } else if (profile.browser === 'Safari') {
      profile.browserVersion = safariVer; profile.vendor = 'Apple Computer, Inc.';
      profile.vendorSub = ''; profile.productSub = '20030107';
    } else {
      profile.browserVersion = edgeVer; profile.vendor = 'Google Inc.';
      profile.vendorSub = ''; profile.productSub = '20030107';
    }
    profile.product = 'Gecko';
    profile.appName = 'Netscape';

    // Build User-Agent
    if (profile.os === 'Windows') {
      const nt = 'Windows NT 10.0; Win64; x64';
      if (profile.browser === 'Chrome') profile.userAgent = `Mozilla/5.0 (${nt}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${profile.browserVersion} Safari/537.36`;
      else if (profile.browser === 'Edge') profile.userAgent = `Mozilla/5.0 (${nt}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${profile.browserVersion} Safari/537.36 Edg/${profile.browserVersion}`;
      else profile.userAgent = `Mozilla/5.0 (${nt}; rv:${profile.browserVersion}) Gecko/20100101 Firefox/${profile.browserVersion}`;
    } else if (profile.os === 'macOS') {
      if (profile.browser === 'Chrome') profile.userAgent = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${profile.browserVersion} Safari/537.36`;
      else if (profile.browser === 'Safari') profile.userAgent = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${profile.browserVersion} Safari/605.1.15`;
      else profile.userAgent = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:${profile.browserVersion}) Gecko/20100101 Firefox/${profile.browserVersion}`;
    } else if (profile.os === 'Linux') {
      if (profile.browser === 'Chrome') profile.userAgent = `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${profile.browserVersion} Safari/537.36`;
      else profile.userAgent = `Mozilla/5.0 (X11; Linux x86_64; rv:${profile.browserVersion}) Gecko/20100101 Firefox/${profile.browserVersion}`;
    } else if (profile.os === 'Android') {
      if (profile.browser === 'Chrome') profile.userAgent = `Mozilla/5.0 (Linux; Android ${profile.osVersion}; ${profile.model}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${profile.browserVersion} Mobile Safari/537.36`;
      else profile.userAgent = `Mozilla/5.0 (Android ${profile.osVersion}; Mobile; rv:${profile.browserVersion}) Gecko/${profile.browserVersion} Firefox/${profile.browserVersion}`;
    } else {
      const iosVer = profile.osVersion.replace(/\./g, '_');
      if (profile.browser === 'Safari') profile.userAgent = `Mozilla/5.0 (iPhone; CPU iPhone OS ${iosVer} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${profile.browserVersion} Mobile/15E148 Safari/604.1`;
      else profile.userAgent = `Mozilla/5.0 (iPhone; CPU iPhone OS ${iosVer} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/${profile.browserVersion} Mobile/15E148 Safari/604.1`;
    }

    // appVersion
    if (profile.browser === 'Firefox') {
      if (profile.os === 'Windows') profile.appVersion = '5.0 (Windows)';
      else if (profile.os === 'macOS') profile.appVersion = '5.0 (Macintosh)';
      else if (profile.os === 'Linux') profile.appVersion = '5.0 (X11)';
      else profile.appVersion = profile.userAgent.replace('Mozilla/', '');
    } else {
      profile.appVersion = profile.userAgent.replace('Mozilla/', '');
    }

    // Screen
    const desktopScreens = [{w:1366,h:768},{w:1440,h:900},{w:1536,h:864},{w:1600,h:900},{w:1920,h:1080},{w:2560,h:1440},{w:3840,h:2160}];
    const mobileScreens = [{w:360,h:780},{w:375,h:812},{w:390,h:844},{w:393,h:851},{w:412,h:892},{w:430,h:932}];
    let scr;
    if (profile.mobile) {
      scr = rng.pick(mobileScreens);
      profile.devicePixelRatio = rng.pick([2, 2.5, 2.625, 2.75, 3]);
    } else {
      scr = rng.pick(desktopScreens);
      profile.devicePixelRatio = profile.os === 'macOS' ? 2 : rng.pick([1, 1.25, 1.5, 2]);
    }
    const taskbar = rng.nextInt(40, 72);
    profile.screen = { width: scr.w, height: scr.h, availWidth: scr.w, availHeight: scr.h - taskbar, colorDepth: rng.pick([24,24,24,32]), pixelDepth: 24 };
    profile.screen.pixelDepth = profile.screen.colorDepth;

    // Viewport
    if (profile.mobile) {
      profile.viewport = { width: scr.w, height: scr.h - rng.nextInt(50, 80) };
    } else {
      profile.viewport = { width: scr.w - rng.nextInt(0, 20), height: scr.h - rng.nextInt(80, 160) };
    }
    profile.outerWidth = profile.viewport.width + rng.nextInt(0, 16);
    profile.outerHeight = profile.viewport.height + rng.nextInt(60, 120);
    profile.orientation = profile.mobile ? { type: 'portrait-primary', angle: 0 } : { type: 'landscape-primary', angle: 0 };

    // Hardware
    profile.hardwareConcurrency = profile.mobile ? rng.pick([4,6,8]) : rng.pick([4,6,8,12,16]);
    profile.deviceMemory = profile.mobile ? rng.pick([4,8]) : rng.pick([4,8,16,32]);
    profile.maxTouchPoints = profile.mobile ? rng.pick([5,10]) : 0;
    profile.touchEnabled = profile.maxTouchPoints > 0;

    // GPU
    if (profile.os === 'Windows') {
      const gpus = [
        {v:'Google Inc. (NVIDIA)',r:'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)'},
        {v:'Google Inc. (NVIDIA)',r:'ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0, D3D11)'},
        {v:'Google Inc. (NVIDIA)',r:'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 SUPER Direct3D11 vs_5_0 ps_5_0, D3D11)'},
        {v:'Google Inc. (AMD)',r:'ANGLE (AMD, AMD Radeon RX 580 Direct3D11 vs_5_0 ps_5_0, D3D11)'},
        {v:'Google Inc. (AMD)',r:'ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)'},
        {v:'Google Inc. (Intel)',r:'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)'},
        {v:'Google Inc. (Intel)',r:'ANGLE (Intel, Intel(R) Iris Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)'}
      ];
      const g = rng.pick(gpus); profile.gpuVendor = g.v; profile.gpu = g.r;
    } else if (profile.os === 'macOS') {
      if (profile.browser === 'Safari') { profile.gpuVendor = 'Apple GPU'; profile.gpu = 'Apple GPU'; }
      else { const chips = ['Apple M1','Apple M1 Pro','Apple M2','Apple M2 Pro','Apple M3'];
        const c = rng.pick(chips); profile.gpuVendor = 'Google Inc. (Apple)'; profile.gpu = `ANGLE (Apple, ANGLE Metal Renderer: ${c}, Unspecified Version)`; }
    } else if (profile.os === 'Linux') {
      const gpus = [
        {v:'Google Inc. (NVIDIA)',r:'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060, OpenGL 4.6)'},
        {v:'Google Inc. (AMD)',r:'ANGLE (AMD, AMD Radeon RX 6700 XT, OpenGL 4.6)'},
        {v:'Google Inc. (Mesa)',r:'ANGLE (Mesa, Mesa Intel(R) UHD Graphics 630 (CFL GT2), OpenGL 4.6)'}
      ];
      const g = rng.pick(gpus); profile.gpuVendor = g.v; profile.gpu = g.r;
    } else if (profile.os === 'Android') {
      const gpus = [{v:'Qualcomm',r:'Adreno (TM) 740'},{v:'Qualcomm',r:'Adreno (TM) 730'},{v:'ARM',r:'Mali-G715'},{v:'ARM',r:'Mali-G78'}];
      const g = rng.pick(gpus); profile.gpuVendor = g.v; profile.gpu = g.r;
    } else {
      profile.gpuVendor = 'Apple Inc.'; profile.gpu = 'Apple GPU';
    }

    // Language & Timezone
    profile.language = rng.pick(LANGUAGES);
    const tzPool = TIMEZONE_MAP[profile.language] || ['America/New_York'];
    profile.timezone = rng.pick(tzPool);
    profile.timezoneOffset = TIMEZONE_OFFSETS[profile.timezone] || 0;
    profile.languages = rng.next() < 0.6 ? [profile.language, profile.language.split('-')[0]] : [profile.language];

    // Misc
    profile.doNotTrack = rng.pick(['1', '0', null]);
    profile.historyLength = rng.nextInt(1, 10);
    profile.pdfViewerEnabled = profile.browser !== 'Firefox' || rng.next() > 0.3;
    profile.buildID = profile.browser === 'Firefox' ? '20' + rng.nextInt(230101, 240201) + '000000' : undefined;

    // Connection
    profile.connection = { effectiveType: rng.pick(['4g','4g','4g','3g']), downlink: rng.nextFloat(1.5, 10), rtt: rng.nextInt(50, 200), saveData: false };

    // Battery
    profile.battery = { level: Math.round(rng.nextFloat(0.2, 1.0) * 100) / 100, charging: rng.next() > 0.5, chargingTime: rng.next() > 0.5 ? Infinity : rng.nextInt(600, 7200), dischargingTime: rng.nextInt(3600, 36000) };

    // Media preferences
    profile.prefersColorScheme = rng.pick(['light','light','light','dark']);
    profile.prefersReducedMotion = rng.next() < 0.1;
    profile.forcedColors = false;
    profile.prefersContrast = rng.next() < 0.05;
    profile.colorGamut = rng.pick(['srgb','srgb','p3']);
    profile.dynamicRange = rng.next() < 0.3;

    // WebGL params
    const isHighEnd = profile.deviceMemory >= 16;
    profile.webglParams = {
      maxTextureSize: isHighEnd ? rng.pick([16384, 32768]) : rng.pick([8192, 16384]),
      maxViewportDims: isHighEnd ? [32768, 32768] : [16384, 16384],
      maxRenderbufferSize: isHighEnd ? 32768 : 16384,
      maxVertexAttribs: 16, maxVertexUniformVectors: rng.pick([256, 1024, 4096]),
      maxFragmentUniformVectors: rng.pick([256, 1024]), maxVaryingVectors: rng.pick([15, 16, 30, 31]),
      maxCombinedTextureUnits: rng.pick([32, 48, 80]), maxCubeMapTextureSize: isHighEnd ? 16384 : 8192,
      aliasedLineWidthRange: rng.pick([[1, 1], [1, 7.375]]),
      aliasedPointSizeRange: rng.pick([[1, 1024], [1, 8192]]),
      depthBits: 24, stencilBits: 8, samples: 4,
      redBits: 8, greenBits: 8, blueBits: 8, alphaBits: 8,
      max3dTextureSize: isHighEnd ? 16384 : 8192, maxArrayTextureLayers: rng.pick([256, 512, 2048]),
      maxDrawBuffers: rng.pick([4, 8]), maxColorAttachments: rng.pick([4, 8]), maxSamples: rng.pick([4, 8, 16])
    };

    // Audio
    profile.audioParams = { sampleRate: rng.pick([44100, 48000]), maxChannelCount: rng.pick([2, 6, 8]), channelCount: 2, baseLatency: rng.nextFloat(0.005, 0.02), outputLatency: rng.nextFloat(0.001, 0.01) };

    // Fonts
    const commonFonts = ['Arial','Helvetica','Times New Roman','Courier New','Georgia','Verdana','Trebuchet MS','Impact','Comic Sans MS','Palatino Linotype','Lucida Console','Tahoma'];
    const osFontsMap = {
      'Windows': ['Segoe UI','Calibri','Consolas','Cambria','Candara','Corbel','Constantia','Malgun Gothic','Microsoft YaHei','Yu Gothic','Meiryo','Gabriola'],
      'macOS': ['Helvetica Neue','Menlo','Monaco','Avenir','Avenir Next','Futura','Optima','Baskerville','Didot','Gill Sans','Hoefler Text','Chalkboard SE'],
      'iOS': ['Helvetica Neue','Avenir','Avenir Next','Futura','Gill Sans','Menlo'],
      'Linux': ['Liberation Sans','Liberation Serif','DejaVu Sans','DejaVu Serif','Noto Sans','Noto Serif','Ubuntu','Cantarell'],
      'Android': ['Roboto','Noto Sans','Droid Sans','Droid Serif','Droid Sans Mono']
    };
    const osFonts = osFontsMap[profile.os] || osFontsMap['Windows'];
    const allFonts = [...commonFonts, ...osFonts];
    profile.fonts = rng.shuffle(allFonts).slice(0, rng.nextInt(20, 35));

    // Plugins
    if (profile.browser === 'Firefox') {
      profile.plugins = [];
    } else {
      profile.plugins = [
        {name:'PDF Viewer',filename:'internal-pdf-viewer',description:'Portable Document Format',mimeTypes:[{type:'application/pdf',suffixes:'pdf',description:'Portable Document Format'}]},
        {name:'Chrome PDF Viewer',filename:'internal-pdf-viewer',description:'Portable Document Format',mimeTypes:[{type:'application/pdf',suffixes:'pdf',description:'Portable Document Format'}]},
        {name:'Chromium PDF Viewer',filename:'internal-pdf-viewer',description:'Portable Document Format',mimeTypes:[{type:'application/pdf',suffixes:'pdf',description:'Portable Document Format'}]},
        {name:'Microsoft Edge PDF Viewer',filename:'internal-pdf-viewer',description:'Portable Document Format',mimeTypes:[{type:'application/pdf',suffixes:'pdf',description:'Portable Document Format'}]},
        {name:'WebKit built-in PDF',filename:'internal-pdf-viewer',description:'Portable Document Format',mimeTypes:[{type:'application/pdf',suffixes:'pdf',description:'Portable Document Format'}]}
      ];
    }

    // Storage
    profile.storageQuota = rng.nextInt(50, 300) * 1024 * 1024 * 1024;
    profile.storageUsage = rng.nextInt(10, 500) * 1024 * 1024;

    // Voices
    const voiceNames = {'en':['David','Zira','Mark','Samantha','Alex','Daniel'],'fr':['Thomas','Amelie'],'de':['Anna','Hans'],'es':['Monica','Jorge'],'ja':['Kyoko','Otoya'],'zh':['Ting-Ting'],'ko':['Yuna'],'ru':['Milena','Yuri']};
    const base = profile.language.split('-')[0];
    const names = voiceNames[base] || voiceNames['en'];
    profile.voices = names.slice(0, rng.nextInt(3, names.length)).map((n, i) => ({ name: n, lang: profile.language, localService: true, default: i === 0 }));

    // Media devices
    const audioInputs = rng.nextInt(1, 3);
    profile.mediaDevices = [];
    for (let i = 0; i < audioInputs; i++) profile.mediaDevices.push({ deviceId: rng.generateHex(64), kind: 'audioinput', label: '', groupId: rng.generateHex(64) });
    profile.mediaDevices.push({ deviceId: rng.generateHex(64), kind: 'videoinput', label: '', groupId: rng.generateHex(64) });
    profile.mediaDevices.push({ deviceId: 'default', kind: 'audiooutput', label: '', groupId: rng.generateHex(64) });

    // Client Hints
    const major = profile.browserVersion.split('.')[0];
    if (profile.browser === 'Chrome' || profile.browser === 'Edge') {
      const brandName = profile.browser === 'Edge' ? 'Microsoft Edge' : 'Google Chrome';
      profile.clientHints = {
        brands: [{brand:'Not_A Brand',version:'8'},{brand:'Chromium',version:major},{brand:brandName,version:major}],
        mobile: profile.mobile,
        platform: profile.os === 'macOS' ? 'macOS' : profile.os,
        platformVersion: profile.os === 'Windows' ? (profile.osVersion === '11.0' ? '15.0.0' : '10.0.0') : profile.osVersion + '.0',
        architecture: profile.arch, bitness: profile.bitness, model: profile.model || ''
      };
    } else {
      profile.clientHints = null;
    }

    return profile;
  }

  // =========================================================================
  // APPLY ALL SPOOFING
  // =========================================================================
  function applyAllSpoofing(profile, config, rng) {
    const makeNative = (fn, name) => {
      const s = `function ${name || fn.name || ''}() { [native code] }`;
      Object.defineProperty(fn, 'toString', { value: () => s, writable: false, configurable: true });
      return fn;
    };

    const defineGetter = (obj, prop, value) => {
      Object.defineProperty(obj, prop, {
        get: makeNative(function() { return value; }, `get ${prop}`),
        set: undefined, enumerable: true, configurable: false
      });
    };

    // ===== NAVIGATOR =====
    if (config.categories.navigator !== false) {
      const navProto = Object.getPrototypeOf(navigator);
      defineGetter(navProto, 'userAgent', profile.userAgent);
      defineGetter(navProto, 'appName', profile.appName);
      defineGetter(navProto, 'appVersion', profile.appVersion);
      defineGetter(navProto, 'vendor', profile.vendor);
      defineGetter(navProto, 'vendorSub', profile.vendorSub);
      defineGetter(navProto, 'product', profile.product);
      defineGetter(navProto, 'productSub', profile.productSub);
      defineGetter(navProto, 'platform', profile.platform);
      defineGetter(navProto, 'language', profile.language);
      defineGetter(navProto, 'languages', Object.freeze([...profile.languages]));
      defineGetter(navProto, 'hardwareConcurrency', profile.hardwareConcurrency);
      defineGetter(navProto, 'deviceMemory', profile.deviceMemory);
      defineGetter(navProto, 'maxTouchPoints', profile.maxTouchPoints);
      defineGetter(navProto, 'cookieEnabled', true);
      defineGetter(navProto, 'pdfViewerEnabled', profile.pdfViewerEnabled);
      defineGetter(navProto, 'doNotTrack', profile.doNotTrack);
      if (profile.buildID !== undefined) defineGetter(navProto, 'buildID', profile.buildID);

      navProto.javaEnabled = makeNative(function javaEnabled() { return false; }, 'javaEnabled');
      navProto.getGamepads = makeNative(function getGamepads() { return []; }, 'getGamepads');

      // Battery
      const bat = profile.battery;
      navProto.getBattery = makeNative(function getBattery() {
        return Promise.resolve({ charging: bat.charging, chargingTime: bat.chargingTime, dischargingTime: bat.dischargingTime, level: bat.level, addEventListener(){}, removeEventListener(){}, dispatchEvent(){ return true; }, onchargingchange: null, onchargingtimechange: null, ondischargingtimechange: null, onlevelchange: null });
      }, 'getBattery');

      // Block hardware APIs
      ['bluetooth','usb','hid','serial'].forEach(api => {
        try { Object.defineProperty(navProto, api, { get: () => undefined, configurable: false, enumerable: false }); } catch(e){}
      });

      // navigator.userAgentData (CreepJS checks this exists for Chromium)
      if (profile.clientHints && (profile.browser === 'Chrome' || profile.browser === 'Edge')) {
        const ch = profile.clientHints;
        const uaData = {
          brands: ch.brands.map(b => Object.freeze({brand:b.brand,version:b.version})),
          mobile: ch.mobile,
          platform: ch.platform,
          getHighEntropyValues: makeNative(function getHighEntropyValues(hints) {
            return Promise.resolve({
              brands: ch.brands, mobile: ch.mobile, platform: ch.platform,
              platformVersion: ch.platformVersion, architecture: ch.architecture,
              bitness: ch.bitness, model: ch.model, fullVersionList: ch.fullVersionList || ch.brands,
              wow64: false
            });
          }, 'getHighEntropyValues'),
          toJSON: makeNative(function toJSON() { return { brands: ch.brands, mobile: ch.mobile, platform: ch.platform }; }, 'toJSON')
        };
        Object.freeze(uaData.brands);
        defineGetter(navProto, 'userAgentData', uaData);
      } else if (profile.browser === 'Firefox' || profile.browser === 'Safari') {
        // Firefox and Safari don't have userAgentData
        try { Object.defineProperty(navProto, 'userAgentData', { get: () => undefined, configurable: false, enumerable: false }); } catch(e) {}
      }

      // Touch
      if (!profile.touchEnabled) {
        try { Object.defineProperty(window, 'ontouchstart', { get: () => undefined, set: () => {}, configurable: false, enumerable: false }); } catch(e){}
      } else {
        try { Object.defineProperty(window, 'ontouchstart', { value: null, writable: true, configurable: false, enumerable: true }); } catch(e){}
      }

      // History length
      try { Object.defineProperty(window.history, 'length', { get: makeNative(function() { return profile.historyLength; }, 'get length'), configurable: false, enumerable: true }); } catch(e){}

      // Plugins
      if (profile.plugins.length > 0) {
        const pd = profile.plugins;
        const fakePlugins = { length: pd.length, item: makeNative(function(i){ return pd[i]||null; },'item'), namedItem: makeNative(function(n){ return pd.find(p=>p.name===n)||null; },'namedItem'), refresh: makeNative(function(){},'refresh'), [Symbol.iterator]: function*(){ for(let i=0;i<pd.length;i++) yield pd[i]; } };
        for(let i=0;i<pd.length;i++) fakePlugins[i]=pd[i];
        defineGetter(navProto, 'plugins', fakePlugins);
        const md = []; pd.forEach(p=>{if(p.mimeTypes)p.mimeTypes.forEach(m=>md.push({...m,enabledPlugin:p}));});
        const fakeMimes = { length: md.length, item: makeNative(function(i){ return md[i]||null; },'item'), namedItem: makeNative(function(t){ return md.find(m=>m.type===t)||null; },'namedItem'), [Symbol.iterator]: function*(){ for(let i=0;i<md.length;i++) yield md[i]; } };
        for(let i=0;i<md.length;i++) fakeMimes[i]=md[i];
        defineGetter(navProto, 'mimeTypes', fakeMimes);
      }

      // Connection
      if (config.categories.network !== false) {
        try {
          const conn = profile.connection;
          const fakeConn = { effectiveType: conn.effectiveType, downlink: conn.downlink, rtt: conn.rtt, saveData: conn.saveData, type: 'wifi', onchange: null, addEventListener(){}, removeEventListener(){} };
          defineGetter(navProto, 'connection', fakeConn);
        } catch(e){}
      }

      // Storage estimate
      if (navigator.storage && navigator.storage.estimate) {
        navigator.storage.estimate = makeNative(function estimate() { return Promise.resolve({ quota: profile.storageQuota, usage: profile.storageUsage }); }, 'estimate');
      }

      // Permissions
      if (navigator.permissions && navigator.permissions.query) {
        navigator.permissions.query = makeNative(function query(desc) { return Promise.resolve({ name: desc.name, state: 'prompt', onchange: null }); }, 'query');
      }

      // MediaDevices
      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        const devs = profile.mediaDevices;
        navigator.mediaDevices.enumerateDevices = makeNative(function enumerateDevices() {
          return Promise.resolve(devs.map(d => ({ deviceId: d.deviceId, kind: d.kind, label: d.label, groupId: d.groupId, toJSON(){ return this; } })));
        }, 'enumerateDevices');
      }

      // Geolocation - block
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition = makeNative(function getCurrentPosition(s,e){ if(e) setTimeout(()=>e({code:1,message:'User denied Geolocation',PERMISSION_DENIED:1,POSITION_UNAVAILABLE:2,TIMEOUT:3}),100); },'getCurrentPosition');
        navigator.geolocation.watchPosition = makeNative(function watchPosition(s,e){ if(e) setTimeout(()=>e({code:1,message:'User denied Geolocation',PERMISSION_DENIED:1,POSITION_UNAVAILABLE:2,TIMEOUT:3}),100); return 0; },'watchPosition');
        navigator.geolocation.clearWatch = makeNative(function clearWatch(){},'clearWatch');
      }
    }

    // ===== SCREEN =====
    if (config.categories.screen !== false) {
      const screenProto = Object.getPrototypeOf(screen);
      defineGetter(screenProto, 'width', profile.screen.width);
      defineGetter(screenProto, 'height', profile.screen.height);
      defineGetter(screenProto, 'availWidth', profile.screen.availWidth);
      defineGetter(screenProto, 'availHeight', profile.screen.availHeight);
      defineGetter(screenProto, 'colorDepth', profile.screen.colorDepth);
      defineGetter(screenProto, 'pixelDepth', profile.screen.pixelDepth);
      if (screen.orientation) {
        const op = Object.getPrototypeOf(screen.orientation);
        defineGetter(op, 'type', profile.orientation.type);
        defineGetter(op, 'angle', profile.orientation.angle);
      }
      defineGetter(window, 'devicePixelRatio', profile.devicePixelRatio);
      defineGetter(window, 'innerWidth', profile.viewport.width);
      defineGetter(window, 'innerHeight', profile.viewport.height);
      defineGetter(window, 'outerWidth', profile.outerWidth);
      defineGetter(window, 'outerHeight', profile.outerHeight);

      // matchMedia override
      const origMM = window.matchMedia;
      window.matchMedia = makeNative(function matchMedia(q) {
        const ql = q.toLowerCase();
        let m = null;
        if (ql.includes('prefers-color-scheme')) m = ql.includes('dark') ? profile.prefersColorScheme==='dark' : profile.prefersColorScheme==='light';
        else if (ql.includes('prefers-reduced-motion')) m = ql.includes('reduce') ? profile.prefersReducedMotion : !profile.prefersReducedMotion;
        else if (ql.includes('forced-colors')) m = ql.includes('active') ? profile.forcedColors : !profile.forcedColors;
        else if (ql.includes('prefers-contrast')) m = ql.includes('high') ? profile.prefersContrast : !profile.prefersContrast;
        else if (ql.includes('color-gamut')) { if(ql.includes('rec2020')) m=profile.colorGamut==='rec2020'; else if(ql.includes('p3')) m=profile.colorGamut==='p3'||profile.colorGamut==='rec2020'; else m=true; }
        else if (ql.includes('dynamic-range')) m = ql.includes('high') ? profile.dynamicRange : true;
        else if (ql.includes('pointer')) { if(ql.includes('coarse')) m=profile.touchEnabled; else if(ql.includes('fine')) m=!profile.touchEnabled; else m=false; }
        else if (ql.includes('hover')) { if(ql.includes('none')) m=profile.touchEnabled; else m=!profile.touchEnabled; }
        if (m !== null) { return { matches: m, media: q, onchange: null, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){}, dispatchEvent(){ return true; } }; }
        return origMM.call(window, q);
      }, 'matchMedia');
    }

    // ===== CANVAS =====
    if (config.categories.canvas !== false) {
      // Per-canvas noise seed for idempotent noise (CreepJS calls toDataURL multiple times)
      const canvasSeeds = new WeakMap();
      const noisedSet = new WeakSet();
      function getCanvasSeed(canvas) {
        if (!canvasSeeds.has(canvas)) canvasSeeds.set(canvas, rng.next() * 4294967296 >>> 0);
        return canvasSeeds.get(canvas);
      }
      // Deterministic noise RNG seeded per-canvas (always produces same noise)
      function canvasNoiseRNG(seed) {
        let s = seed;
        return () => { s += 0x9e3779b9; let t = s ^ (s >>> 16); t = Math.imul(t, 0x21f0aaad); t ^= t >>> 15; t = Math.imul(t, 0x735a2d97); t ^= t >>> 15; return (t >>> 0) / 4294967296; };
      }
      const origGID = CanvasRenderingContext2D.prototype.getImageData;
      function applyIdempotentNoise(canvas) {
        if (noisedSet.has(canvas)) return; // Already noised this render cycle
        noisedSet.add(canvas);
        try {
          const ctx = canvas.getContext('2d');
          if (!ctx || canvas.width === 0 || canvas.height === 0) return;
          const id = origGID.call(ctx, 0, 0, canvas.width, canvas.height);
          const data = id.data;
          const noiseR = canvasNoiseRNG(getCanvasSeed(canvas));
          const pixelCount = canvas.width * canvas.height;
          const step = Math.max(4, Math.floor(pixelCount / Math.max(1, Math.floor(pixelCount * 0.02))));
          for (let p = 0; p < pixelCount; p += step) {
            const idx = p * 4;
            if (idx + 3 >= data.length || data[idx + 3] === 0) continue;
            const ch = Math.floor(noiseR() * 3);
            const noise = Math.floor(noiseR() * 5) - 2;
            data[idx + ch] = Math.max(0, Math.min(255, data[idx + ch] + noise));
          }
          ctx.putImageData(id, 0, 0);
        } catch(e) {}
      }
      // Invalidate noise on draw operations
      ['fillRect','strokeRect','clearRect','fill','stroke','drawImage','putImageData','fillText','strokeText'].forEach(m => {
        const orig = CanvasRenderingContext2D.prototype[m];
        if (!orig) return;
        CanvasRenderingContext2D.prototype[m] = makeNative(function() { if(this.canvas) noisedSet.delete(this.canvas); return orig.apply(this,arguments); }, m);
      });
      const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = makeNative(function toDataURL() {
        applyIdempotentNoise(this);
        return origToDataURL.apply(this, arguments);
      }, 'toDataURL');
      const origToBlob = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = makeNative(function toBlob() {
        applyIdempotentNoise(this);
        return origToBlob.apply(this, arguments);
      }, 'toBlob');
      CanvasRenderingContext2D.prototype.getImageData = makeNative(function getImageData(sx,sy,sw,sh) {
        const id = origGID.call(this,sx,sy,sw,sh);
        // Apply deterministic noise to returned data (based on region)
        const seed = getCanvasSeed(this.canvas || {}) ^ (sx*7919+sy*6271+sw*1013+sh*3571);
        const noiseR = canvasNoiseRNG(seed >>> 0);
        const data = id.data;
        const step = Math.max(4, Math.floor(data.length / 200));
        for (let i = 0; i < data.length; i += step) { if(data[i+3]===0)continue; const ch=Math.floor(noiseR()*3); data[i+ch]=Math.max(0,Math.min(255,data[i+ch]+Math.floor(noiseR()*5)-2)); }
        return id;
      }, 'getImageData');
      // measureText: use deterministic offset based on font+text hash (not rng.next)
      const origMT = CanvasRenderingContext2D.prototype.measureText;
      CanvasRenderingContext2D.prototype.measureText = makeNative(function measureText(text) {
        const m = origMT.call(this, text);
        const key = (this.font||'') + '|' + text;
        let h = 0x811c9dc5;
        for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 0x01000193); }
        const offset = ((h >>> 0) / 4294967296 - 0.5) * 0.00001;
        const ow = m.width;
        Object.defineProperty(m,'width',{get:()=>ow+offset,enumerable:true,configurable:true});
        return m;
      }, 'measureText');
    }

    // ===== WEBGL =====
    if (config.categories.webgl !== false) {
      const wp = profile.webglParams;
      const paramMap = { 3379:wp.maxTextureSize, 3386:new Int32Array(wp.maxViewportDims), 34024:wp.maxRenderbufferSize, 34921:wp.maxVertexAttribs, 36347:wp.maxVertexUniformVectors, 36349:wp.maxFragmentUniformVectors, 36348:wp.maxVaryingVectors, 35661:wp.maxCombinedTextureUnits, 34076:wp.maxCubeMapTextureSize, 36063:wp.depthBits, 36064:wp.stencilBits, 36183:wp.samples, 3410:wp.redBits, 3411:wp.greenBits, 3412:wp.blueBits, 3413:wp.alphaBits, 32883:wp.max3dTextureSize, 35071:wp.maxArrayTextureLayers, 34852:wp.maxDrawBuffers };
      const floatMap = { 33901:new Float32Array(wp.aliasedLineWidthRange), 33902:new Float32Array(wp.aliasedPointSizeRange) };
      const origGP = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = makeNative(function getParameter(p) {
        if (p===0x9245) return profile.gpuVendor;
        if (p===0x9246) return profile.gpu;
        if (paramMap[p]!==undefined) return paramMap[p];
        if (floatMap[p]!==undefined) return floatMap[p];
        return origGP.call(this,p);
      }, 'getParameter');
      const origGE = WebGLRenderingContext.prototype.getExtension;
      WebGLRenderingContext.prototype.getExtension = makeNative(function getExtension(name) {
        if (name==='WEBGL_debug_renderer_info') return {UNMASKED_VENDOR_WEBGL:0x9245,UNMASKED_RENDERER_WEBGL:0x9246};
        return origGE.call(this,name);
      }, 'getExtension');
      if (typeof WebGL2RenderingContext!=='undefined') {
        const origGP2 = WebGL2RenderingContext.prototype.getParameter;
        WebGL2RenderingContext.prototype.getParameter = makeNative(function getParameter(p) {
          if (p===0x9245) return profile.gpuVendor;
          if (p===0x9246) return profile.gpu;
          if (paramMap[p]!==undefined) return paramMap[p];
          if (floatMap[p]!==undefined) return floatMap[p];
          return origGP2.call(this,p);
        }, 'getParameter');
        const origGE2 = WebGL2RenderingContext.prototype.getExtension;
        WebGL2RenderingContext.prototype.getExtension = makeNative(function getExtension(name) {
          if (name==='WEBGL_debug_renderer_info') return {UNMASKED_VENDOR_WEBGL:0x9245,UNMASKED_RENDERER_WEBGL:0x9246};
          return origGE2.call(this,name);
        }, 'getExtension');
      }
      // readPixels noise
      const origRP = WebGLRenderingContext.prototype.readPixels;
      WebGLRenderingContext.prototype.readPixels = makeNative(function readPixels(x,y,w,h,f,t,px) {
        origRP.call(this,x,y,w,h,f,t,px);
        if (px&&px.length&&w<=500&&h<=200) { const step=Math.max(4,Math.floor(px.length/50)); for(let i=0;i<px.length;i+=step){const ch=Math.floor(rng.next()*3);if(i+ch<px.length)px[i+ch]=Math.max(0,Math.min(255,px[i+ch]+(rng.next()>0.5?1:-1)));} }
      }, 'readPixels');
    }

    // ===== AUDIO =====
    if (config.categories.audio !== false) {
      const ap = profile.audioParams;
      const OrigAC = window.AudioContext || window.webkitAudioContext;
      if (OrigAC) {
        try { Object.defineProperty(OrigAC.prototype,'baseLatency',{get:makeNative(function(){return ap.baseLatency;},'get baseLatency'),configurable:false,enumerable:true}); } catch(e){}
        try { Object.defineProperty(OrigAC.prototype,'outputLatency',{get:makeNative(function(){return ap.outputLatency;},'get outputLatency'),configurable:false,enumerable:true}); } catch(e){}
      }
      const OrigOAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      if (OrigOAC) {
        const origSR = OrigOAC.prototype.startRendering;
        OrigOAC.prototype.startRendering = makeNative(function startRendering() {
          return origSR.call(this).then(buf => { for(let c=0;c<buf.numberOfChannels;c++){const d=buf.getChannelData(c);const step=Math.max(1,Math.floor(d.length/100));for(let i=0;i<d.length;i+=step)d[i]+=(rng.next()-0.5)*0.0002;} return buf; });
        }, 'startRendering');
      }
      if (window.AnalyserNode) {
        const origGFF = AnalyserNode.prototype.getFloatFrequencyData;
        AnalyserNode.prototype.getFloatFrequencyData = makeNative(function getFloatFrequencyData(a) { origGFF.call(this,a); const step=Math.max(1,Math.floor(a.length/50)); for(let i=0;i<a.length;i+=step)a[i]+=(rng.next()-0.5)*0.002; }, 'getFloatFrequencyData');
        const origGBF = AnalyserNode.prototype.getByteFrequencyData;
        AnalyserNode.prototype.getByteFrequencyData = makeNative(function getByteFrequencyData(a) { origGBF.call(this,a); const step=Math.max(1,Math.floor(a.length/20)); for(let i=0;i<a.length;i+=step)a[i]=Math.max(0,Math.min(255,a[i]+(rng.next()>0.5?1:-1))); }, 'getByteFrequencyData');
      }
    }

    // ===== WEBRTC =====
    if (config.categories.webrtc !== false) {
      const OrigRTC = window.RTCPeerConnection || window.webkitRTCPeerConnection;
      if (OrigRTC && config.webrtcMode !== 'full_block') {
        // IP stripping via candidate sanitization is handled at addEventListener level
        // Minimal approach: override createOffer/createAnswer to strip local IPs from SDP
        const sanitizeIPs = (sdp) => sdp ? sdp.replace(/(\b(?:10|172\.(?:1[6-9]|2\d|3[01])|192\.168)\.\d{1,3}\.\d{1,3}\b)/g, '0.0.0.0') : sdp;
        const origCO = OrigRTC.prototype.createOffer;
        OrigRTC.prototype.createOffer = makeNative(function createOffer(opts) { return origCO.call(this,opts).then(o=>({type:o.type,sdp:sanitizeIPs(o.sdp)})); }, 'createOffer');
        const origCA = OrigRTC.prototype.createAnswer;
        OrigRTC.prototype.createAnswer = makeNative(function createAnswer(opts) { return origCA.call(this,opts).then(a=>({type:a.type,sdp:sanitizeIPs(a.sdp)})); }, 'createAnswer');
      } else if (OrigRTC && config.webrtcMode === 'full_block') {
        window.RTCPeerConnection = undefined;
        window.webkitRTCPeerConnection = undefined;
      }
    }

    // ===== FONTS =====
    if (config.categories.fonts !== false) {
      const allowed = new Set(profile.fonts);
      if (document.fonts && document.fonts.check) {
        const origCheck = document.fonts.check.bind(document.fonts);
        document.fonts.check = makeNative(function check(font, text) {
          const parts = font.split(/\s+/); let family = '';
          let foundSize = false;
          for (const p of parts) { if (/^\d/.test(p)||p.includes('px')||p.includes('pt')||p.includes('em')){foundSize=true;continue;} if(foundSize){family=parts.slice(parts.indexOf(p)).join(' ');break;} }
          if(!family)family=font;
          family=family.replace(/['"]/g,'').split(',')[0].trim();
          if (family && !allowed.has(family)) return false;
          return origCheck(font, text||' ');
        }, 'check');
      }
    }

    // ===== TIMING =====
    if (config.categories.timing !== false) {
      // Constant offset per session (not per call) to avoid CreepJS jitter detection
      const tOff = rng.nextFloat(-5, 5);
      const origPN = performance.now.bind(performance);
      // Reduce precision to 100us (matches Chrome's cross-origin isolation behavior)
      performance.now = makeNative(function now() { return Math.round(origPN() * 10) / 10; }, 'now');
      const origTO = performance.timeOrigin;
      Object.defineProperty(performance,'timeOrigin',{get:makeNative(function(){return origTO+tOff;},'get timeOrigin'),configurable:false,enumerable:true});
      const origDN = Date.now;
      // Reduce Date.now precision slightly (5ms quantization, mimics cross-origin)
      Date.now = makeNative(function now(){ return Math.round(origDN.call(Date)/5)*5; }, 'now');

      // Timezone (getTimezoneOffset returns minutes BEHIND UTC: NY=-300 stored, getTimezoneOffset returns +300)
      Date.prototype.getTimezoneOffset = makeNative(function getTimezoneOffset(){ return -(profile.timezoneOffset); }, 'getTimezoneOffset');
      const OrigDTF = Intl.DateTimeFormat;
      Intl.DateTimeFormat = makeNative(function DateTimeFormat(locales, options) {
        const opts = options ? {...options} : {};
        if (!opts.timeZone) opts.timeZone = profile.timezone;
        if (new.target) return new OrigDTF(locales||profile.language, opts);
        return OrigDTF(locales||profile.language, opts);
      }, 'DateTimeFormat');
      Intl.DateTimeFormat.prototype = OrigDTF.prototype;
      Intl.DateTimeFormat.supportedLocalesOf = OrigDTF.supportedLocalesOf;
      const origRO = OrigDTF.prototype.resolvedOptions;
      OrigDTF.prototype.resolvedOptions = makeNative(function resolvedOptions() { const r=origRO.call(this); if(!r.timeZone||r.timeZone==='UTC')r.timeZone=profile.timezone; return r; }, 'resolvedOptions');
    }

    // ===== MEDIA =====
    if (config.categories.media !== false) {
      // Speech voices
      if (window.speechSynthesis) {
        const sv = profile.voices.map((v,i) => ({name:v.name,lang:v.lang,localService:true,default:v.default||i===0,voiceURI:v.name}));
        speechSynthesis.getVoices = makeNative(function getVoices(){ return sv; }, 'getVoices');
      }
      // canPlayType consistency
      const origCPT = HTMLMediaElement.prototype.canPlayType;
      HTMLMediaElement.prototype.canPlayType = makeNative(function canPlayType(type) {
        const t = type.split(';')[0].trim();
        const isSafari = profile.browser === 'Safari';
        if (t==='video/webm'||t==='audio/ogg') return isSafari ? '' : 'probably';
        if (t==='video/mp4'||t==='audio/mp4'||t==='audio/mpeg') return 'probably';
        return origCPT.call(this, type);
      }, 'canPlayType');
    }

    // ===== STORAGE/PRIVACY =====
    if (config.categories.storage !== false || config.categories.privacy !== false) {
      // Anti-incognito: fake performance.memory
      if (performance.memory) {
        Object.defineProperty(performance,'memory',{get:makeNative(function(){return{jsHeapSizeLimit:4294705152,totalJSHeapSize:Math.floor(rng.nextFloat(1e7,5e7)),usedJSHeapSize:Math.floor(rng.nextFloat(5e6,3e7))};},'get memory'),configurable:false,enumerable:true});
      }
      // Fake requestFileSystem
      if (window.webkitRequestFileSystem || window.requestFileSystem) {
        const fakeFS = {root:{getFile(p,o,s){if(s)setTimeout(()=>s({name:'t',fullPath:'/'+p}),10);},getDirectory(p,o,s){if(s)setTimeout(()=>s({name:'t',fullPath:'/'+p}),10);}},name:'temporary'};
        window.requestFileSystem = window.webkitRequestFileSystem = makeNative(function requestFileSystem(t,s,success){if(success)setTimeout(()=>success(fakeFS),10);},'requestFileSystem');
      }
    }

    // ===== EXTENSION SELF-HIDING =====
    // Prevent detection of extension via chrome.runtime
    try {
      if (window.chrome && window.chrome.runtime) {
        Object.defineProperty(window.chrome.runtime, 'id', { get: () => undefined, configurable: false });
        window.chrome.runtime.sendMessage = undefined;
        window.chrome.runtime.connect = undefined;
      }
    } catch(e) {}
  }

  // =========================================================================
  // MAIN EXECUTION
  // =========================================================================
  const config = getConfig();

  if (!config.enabled || isWhitelisted(config)) {
    return; // Extension is paused or site is whitelisted
  }

  const siteSeed = generateSiteSeed(config);
  const rng = new PRNG(siteSeed);
  const profile = generateProfile(rng);

  // Store profile for test page access
  try {
    Object.defineProperty(window, '__phantomprint_profile__', { value: profile, writable: false, configurable: false, enumerable: false });
  } catch(e) {}

  // Apply all spoofing
  applyAllSpoofing(profile, config, rng);

  // Monitor for dynamically created iframes
  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.tagName === 'IFRAME' || node.tagName === 'FRAME') {
          try {
            const iframeWindow = node.contentWindow;
            if (iframeWindow) {
              // Re-apply spoofing to iframe context
              // Note: For same-origin iframes, the content script will handle injection
              // For cross-origin, we can't access contentWindow
            }
          } catch(e) {}
        }
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

})();
