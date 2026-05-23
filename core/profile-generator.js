/**
 * PhantomPrint — Server-Side Profile Generator
 * Generates complete, validated, consistent fingerprint profiles with 130+ parameters.
 * Runs in the service worker context — uses chrome.* APIs and data sources.
 * @module core/profile-generator
 */
'use strict';

const ProfileGenerator = {

  // =========================================================================
  // STATIC DATA
  // =========================================================================
  LANGUAGES: ['en-US','en-GB','en-AU','en-CA','fr-FR','fr-CA','de-DE','de-AT','es-ES','es-MX','it-IT','ja-JP','ko-KR','zh-CN','zh-TW','ru-RU','pt-BR','pt-PT','nl-NL','pl-PL','sv-SE','da-DK','nb-NO','fi-FI','tr-TR','ar-SA','hi-IN','th-TH','vi-VN'],

  TIMEZONE_MAP: {
    'en-US':['America/New_York','America/Chicago','America/Denver','America/Los_Angeles'],
    'en-GB':['Europe/London'],'en-AU':['Australia/Sydney'],'en-CA':['America/Toronto','America/Vancouver'],
    'fr-FR':['Europe/Paris'],'fr-CA':['America/Toronto'],'de-DE':['Europe/Berlin'],'de-AT':['Europe/Vienna'],
    'es-ES':['Europe/Madrid'],'es-MX':['America/Mexico_City'],'it-IT':['Europe/Rome'],
    'ja-JP':['Asia/Tokyo'],'ko-KR':['Asia/Seoul'],'zh-CN':['Asia/Shanghai'],'zh-TW':['Asia/Taipei'],
    'ru-RU':['Europe/Moscow'],'pt-BR':['America/Sao_Paulo'],'pt-PT':['Europe/Lisbon'],
    'nl-NL':['Europe/Amsterdam'],'pl-PL':['Europe/Warsaw'],'sv-SE':['Europe/Stockholm'],
    'da-DK':['Europe/Copenhagen'],'nb-NO':['Europe/Oslo'],'fi-FI':['Europe/Helsinki'],
    'tr-TR':['Europe/Istanbul'],'ar-SA':['Asia/Riyadh'],'hi-IN':['Asia/Kolkata'],
    'th-TH':['Asia/Bangkok'],'vi-VN':['Asia/Ho_Chi_Minh']
  },

  TIMEZONE_OFFSETS: {
    'America/New_York':-300,'America/Chicago':-360,'America/Denver':-420,'America/Los_Angeles':-480,
    'America/Toronto':-300,'America/Vancouver':-480,'America/Mexico_City':-360,'America/Sao_Paulo':-180,
    'Europe/London':0,'Europe/Paris':60,'Europe/Berlin':60,'Europe/Madrid':60,'Europe/Rome':60,
    'Europe/Amsterdam':60,'Europe/Warsaw':60,'Europe/Stockholm':60,'Europe/Moscow':180,
    'Europe/Vienna':60,'Europe/Lisbon':0,'Europe/Copenhagen':60,'Europe/Oslo':60,
    'Europe/Helsinki':120,'Europe/Istanbul':180,
    'Asia/Tokyo':540,'Asia/Seoul':540,'Asia/Shanghai':480,'Asia/Taipei':480,
    'Asia/Riyadh':180,'Asia/Kolkata':330,'Asia/Bangkok':420,'Asia/Ho_Chi_Minh':420,
    'Australia/Sydney':660
  },

  CHROME_VERSIONS: ['136.0.7103.49','135.0.7049.95','134.0.6998.89','133.0.6943.141','132.0.6834.110','131.0.6778.140','130.0.6723.91'],
  FIREFOX_VERSIONS: ['138.0','137.0','136.0','135.0','134.0','133.0','132.0','128.0'],
  SAFARI_VERSIONS: ['18.4','18.3','18.2','18.1','17.6','17.5','17.4','17.3'],
  EDGE_VERSIONS: ['136.0.3240.50','135.0.3179.73','134.0.3124.85','133.0.3065.92'],

  DESKTOP_SCREENS: [{w:1366,h:768},{w:1440,h:900},{w:1536,h:864},{w:1600,h:900},{w:1920,h:1080},{w:2560,h:1440},{w:3840,h:2160}],
  MOBILE_SCREENS: [{w:360,h:780},{w:375,h:812},{w:390,h:844},{w:393,h:851},{w:412,h:892},{w:430,h:932}],
  TABLET_SCREENS: [{w:768,h:1024},{w:810,h:1080},{w:820,h:1180},{w:834,h:1194}],

  OS_FONTS: {
    'Windows': ['Segoe UI','Calibri','Consolas','Cambria','Candara','Corbel','Constantia','Malgun Gothic','Microsoft YaHei','Yu Gothic','Meiryo','Gabriola'],
    'macOS': ['Helvetica Neue','Menlo','Monaco','Avenir','Avenir Next','Futura','Optima','Baskerville','Didot','Gill Sans','Hoefler Text','Chalkboard SE'],
    'iOS': ['Helvetica Neue','Avenir','Avenir Next','Futura','Gill Sans','Menlo'],
    'Linux': ['Liberation Sans','Liberation Serif','DejaVu Sans','DejaVu Serif','Noto Sans','Noto Serif','Ubuntu','Cantarell'],
    'Android': ['Roboto','Noto Sans','Droid Sans','Droid Serif','Droid Sans Mono']
  },
  COMMON_FONTS: ['Arial','Helvetica','Times New Roman','Courier New','Georgia','Verdana','Trebuchet MS','Impact','Comic Sans MS','Palatino Linotype','Lucida Console','Tahoma'],

  ANDROID_MODELS: ['Pixel 9 Pro','Pixel 9','Pixel 8a','Pixel 8','SM-S928B','SM-S926B','SM-S924B','SM-A556B','SM-A356B','SM-A256B','2401116SG','23129RAA4G','22081212UG'],
  TABLET_MODELS_ANDROID: ['SM-X810','SM-X710','SM-X210','SM-T870','SM-T970'],

  WINDOWS_GPUS: [
    {v:'Google Inc. (NVIDIA)',r:'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)'},
    {v:'Google Inc. (NVIDIA)',r:'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)'},
    {v:'Google Inc. (NVIDIA)',r:'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 SUPER Direct3D11 vs_5_0 ps_5_0, D3D11)'},
    {v:'Google Inc. (NVIDIA)',r:'ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Ti Direct3D11 vs_5_0 ps_5_0, D3D11)'},
    {v:'Google Inc. (AMD)',r:'ANGLE (AMD, AMD Radeon RX 6800 XT Direct3D11 vs_5_0 ps_5_0, D3D11)'},
    {v:'Google Inc. (AMD)',r:'ANGLE (AMD, AMD Radeon RX 7600 Direct3D11 vs_5_0 ps_5_0, D3D11)'},
    {v:'Google Inc. (Intel)',r:'ANGLE (Intel, Intel(R) UHD Graphics 770 Direct3D11 vs_5_0 ps_5_0, D3D11)'},
    {v:'Google Inc. (Intel)',r:'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)'},
    {v:'Google Inc. (Intel)',r:'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)'}
  ],
  MACOS_GPUS: [
    {v:'Google Inc. (Apple)',r:'ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)'},
    {v:'Google Inc. (Apple)',r:'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)'},
    {v:'Google Inc. (Apple)',r:'ANGLE (Apple, ANGLE Metal Renderer: Apple M3, Unspecified Version)'},
    {v:'Google Inc. (Apple)',r:'ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Pro, Unspecified Version)'}
  ],
  MACOS_SAFARI_GPU: {v:'Apple Inc.',r:'Apple GPU'},
  LINUX_GPUS: [
    {v:'Google Inc. (NVIDIA Corporation)',r:'ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 3060/PCIe/SSE2, OpenGL 4.6)'},
    {v:'Google Inc. (AMD)',r:'ANGLE (AMD, AMD Radeon RX 6800 XT, OpenGL 4.6)'},
    {v:'Google Inc. (Intel)',r:'ANGLE (Intel, Mesa Intel(R) UHD Graphics 630 (CFL GT2), OpenGL 4.6)'}
  ],
  ANDROID_GPUS: [{v:'Qualcomm',r:'Adreno (TM) 740'},{v:'Qualcomm',r:'Adreno (TM) 660'},{v:'Qualcomm',r:'Adreno (TM) 750'},{v:'ARM',r:'Mali-G715'},{v:'ARM',r:'Mali-G78'}],
  IOS_GPU: {v:'Apple Inc.',r:'Apple GPU'},

  VOICE_NAMES: {'en':['David','Zira','Mark','Samantha','Alex','Daniel','Karen','Moira'],'fr':['Thomas','Amelie'],'de':['Anna','Hans'],'es':['Monica','Jorge'],'ja':['Kyoko','Otoya'],'zh':['Ting-Ting'],'ko':['Yuna'],'ru':['Milena','Yuri'],'it':['Alice','Luca'],'pt':['Luciana'],'nl':['Xander'],'pl':['Zosia'],'sv':['Alva'],'da':['Sara'],'nb':['Nora'],'fi':['Satu'],'tr':['Yelda'],'ar':['Maged'],'hi':['Lekha'],'th':['Kanya'],'vi':['Linh']},

  // =========================================================================
  // PRNG (standalone for service worker context)
  // =========================================================================
  _createRNG(seed) {
    // Use SeededPRNG if globally available, otherwise inline xoshiro128**
    if (typeof SeededPRNG !== 'undefined') return new SeededPRNG(seed);

    // Inline minimal PRNG
    function murmurhash3(key) {
      let h = 0;
      for (let i = 0; i < key.length; i++) {
        h ^= key.charCodeAt(i);
        h = Math.imul(h, 0x5bd1e995);
        h ^= h >>> 15;
      }
      return h >>> 0;
    }
    const s = typeof seed === 'string' ? murmurhash3(seed) : seed >>> 0;
    const state = new Uint32Array(4);
    let z = s;
    for (let i = 0; i < 4; i++) {
      z += 0x9e3779b9;
      let t = z ^ (z >>> 16); t = Math.imul(t, 0x21f0aaad);
      t ^= t >>> 15; t = Math.imul(t, 0x735a2d97); t ^= t >>> 15;
      state[i] = t >>> 0;
    }
    for (let i = 0; i < 8; i++) { // warmup
      const t = state[1] << 9; state[2] ^= state[0]; state[3] ^= state[1];
      state[1] ^= state[2]; state[0] ^= state[3]; state[2] ^= t;
      state[3] = (state[3] << 11) | (state[3] >>> 21);
    }

    return {
      next() {
        const result = Math.imul(state[1] * 5, 1);
        const r = ((result << 7) | (result >>> 25)) * 9;
        const t = state[1] << 9;
        state[2] ^= state[0]; state[3] ^= state[1]; state[1] ^= state[2]; state[0] ^= state[3]; state[2] ^= t;
        state[3] = (state[3] << 11) | (state[3] >>> 21);
        return (r >>> 0) / 4294967296;
      },
      nextInt(min, max) { return Math.floor(this.next() * (max - min + 1)) + min; },
      nextFloat(min, max) { return this.next() * (max - min) + min; },
      pick(arr) { return arr[Math.floor(this.next() * arr.length)]; },
      shuffle(arr) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; },
      generateHex(len) { let s = ''; for (let i = 0; i < len; i++) s += Math.floor(this.next() * 16).toString(16); return s; },
      weightedPick(obj) {
        const entries = Object.entries(obj).filter(([k]) => k !== 'other');
        if (entries.length === 0) return undefined;
        const total = entries.reduce((sum, [, w]) => sum + w, 0);
        let threshold = this.next() * total;
        for (const [key, weight] of entries) { threshold -= weight; if (threshold <= 0) return key; }
        return entries[entries.length - 1][0];
      }
    };
  },

  // =========================================================================
  // MAIN: Generate a complete fingerprint profile
  // =========================================================================
  /**
   * @param {Object} [constraints] - Pin specific values: { os, browser, language, mobile }
   * @param {string} seed - Session seed string
   * @param {Object} [dataSources] - { statData, webglData, amiuniqueData, deviceProfiles }
   * @returns {Object} Complete profile with 130+ parameters
   */
  generateFullProfile(constraints = {}, seed = '', dataSources = {}) {
    const rng = this._createRNG(seed || ('pp-' + Date.now() + '-' + Math.random()));
    const profile = {};
    const { statData, webglData, amiuniqueData } = dataSources;

    // =================================================================
    // 1. OS SELECTION (hierarchy root — everything else depends on this)
    // =================================================================
    if (constraints.os) {
      profile.os = constraints.os;
    } else if (statData && statData.desktopOsShare) {
      const mobileRoll = rng.next();
      if (mobileRoll < 0.45) {
        const desktopOS = rng.weightedPick(statData.desktopOsShare);
        profile.os = desktopOS === 'windows' ? 'Windows' : desktopOS === 'macos' ? 'macOS' : 'Linux';
      } else if (mobileRoll < 0.85) {
        const androidShare = statData.osShare?.android || 0.41;
        const iosShare = statData.osShare?.ios || 0.18;
        profile.os = rng.next() < (androidShare / (androidShare + iosShare)) ? 'Android' : 'iOS';
      } else {
        profile.os = rng.next() < 0.6 ? 'iOS' : 'Android';
      }
    } else {
      const r = rng.next();
      profile.os = r < 0.35 ? 'Windows' : r < 0.55 ? 'macOS' : r < 0.65 ? 'Linux' : r < 0.82 ? 'Android' : 'iOS';
    }

    // Override mobile from constraints
    if (constraints.mobile !== undefined) {
      if (constraints.mobile && !['Android','iOS'].includes(profile.os)) profile.os = rng.next() < 0.7 ? 'Android' : 'iOS';
      if (!constraints.mobile && ['Android','iOS'].includes(profile.os)) profile.os = rng.next() < 0.6 ? 'Windows' : 'macOS';
    }

    // OS details
    const osDetails = {
      'Windows':  { versions: ['10.0','11.0'], platform: 'Win32', arch: 'x86', mobile: false },
      'macOS':    { versions: ['14.2','14.5','15.0','15.1'], platform: 'MacIntel', arch: 'arm', mobile: false },
      'Linux':    { versions: ['6.1','6.5','6.8'], platform: 'Linux x86_64', arch: 'x86', mobile: false },
      'Android':  { versions: ['13','14','15'], platform: 'Linux armv8l', arch: 'arm', mobile: true },
      'iOS':      { versions: ['17.5','17.6','18.1','18.2','18.3','18.4'], platform: 'iPhone', arch: 'arm', mobile: true }
    };
    const osInfo = osDetails[profile.os] || osDetails['Windows'];
    profile.osVersion = rng.pick(osInfo.versions);
    profile.platform = osInfo.platform;
    profile.arch = osInfo.arch;
    profile.mobile = osInfo.mobile;
    profile.bitness = '64';
    profile.tablet = false;

    // Mobile model
    if (profile.os === 'Android') {
      if (rng.next() < 0.15) { // 15% tablet
        profile.tablet = true;
        profile.model = rng.pick(this.TABLET_MODELS_ANDROID);
      } else {
        profile.model = rng.pick(this.ANDROID_MODELS);
      }
    } else if (profile.os === 'iOS') {
      if (rng.next() < 0.2) { // 20% iPad
        profile.tablet = true;
        profile.platform = 'iPad';
        profile.model = 'iPad';
      } else {
        profile.model = 'iPhone';
      }
    } else {
      profile.model = '';
    }

    // =================================================================
    // 2. BROWSER SELECTION
    // =================================================================
    if (constraints.browser) {
      profile.browser = constraints.browser;
    } else {
      const osFilters = {
        'Windows': { chrome: 65, edge: 15, firefox: 12, opera: 5, brave: 3 },
        'macOS':   { safari: 35, chrome: 40, firefox: 12, edge: 8, opera: 3, brave: 2 },
        'Linux':   { chrome: 55, firefox: 35, opera: 5, brave: 5 },
        'Android': { chrome: 88, samsung_internet: 5, firefox: 4, edge: 3 },
        'iOS':     { safari: 68, chrome: 25, firefox: 7 }
      };
      const browserWeights = statData?.browserShare || osFilters[profile.os] || osFilters['Windows'];
      const allowedKeys = Object.keys(osFilters[profile.os] || {});
      const filtered = {};
      for (const k of allowedKeys) { if (browserWeights[k]) filtered[k] = browserWeights[k]; }
      const browserKey = Object.keys(filtered).length > 0 ? rng.weightedPick(filtered) : 'chrome';
      const map = { chrome:'Chrome', edge:'Edge', firefox:'Firefox', safari:'Safari', opera:'Opera', brave:'Brave', samsung_internet:'Samsung Internet' };
      profile.browser = map[browserKey] || 'Chrome';
    }

    // =================================================================
    // 3. BROWSER VERSION & VENDOR
    // =================================================================
    if (profile.browser === 'Chrome')      { profile.browserVersion = rng.pick(this.CHROME_VERSIONS);  profile.vendor = 'Google Inc.';          }
    else if (profile.browser === 'Firefox') { profile.browserVersion = rng.pick(this.FIREFOX_VERSIONS); profile.vendor = '';                     }
    else if (profile.browser === 'Safari')  { profile.browserVersion = rng.pick(this.SAFARI_VERSIONS);  profile.vendor = 'Apple Computer, Inc.'; }
    else if (profile.browser === 'Edge')    { profile.browserVersion = rng.pick(this.EDGE_VERSIONS);    profile.vendor = 'Google Inc.';          }
    else if (profile.browser === 'Opera')   { profile.browserVersion = rng.pick(this.CHROME_VERSIONS);  profile.vendor = 'Google Inc.';          }
    else if (profile.browser === 'Brave')   { profile.browserVersion = rng.pick(this.CHROME_VERSIONS);  profile.vendor = 'Google Inc.';          }
    else                                    { profile.browserVersion = rng.pick(this.CHROME_VERSIONS);  profile.vendor = 'Google Inc.';          }

    profile.vendorSub = '';
    profile.productSub = profile.browser === 'Firefox' ? '20100101' : '20030107';
    profile.product = 'Gecko';
    profile.appName = 'Netscape';

    // =================================================================
    // 4. USER-AGENT STRING
    // =================================================================
    profile.userAgent = this._buildUA(profile, rng);

    // appVersion
    if (profile.browser === 'Firefox') {
      if (profile.os === 'Windows') profile.appVersion = '5.0 (Windows)';
      else if (profile.os === 'macOS') profile.appVersion = '5.0 (Macintosh)';
      else if (profile.os === 'Linux') profile.appVersion = '5.0 (X11)';
      else profile.appVersion = profile.userAgent.replace('Mozilla/', '');
    } else {
      profile.appVersion = profile.userAgent.replace('Mozilla/', '');
    }

    // =================================================================
    // 5. SCREEN & VIEWPORT
    // =================================================================
    let scr;
    if (profile.mobile && !profile.tablet) {
      scr = rng.pick(this.MOBILE_SCREENS);
      profile.devicePixelRatio = rng.pick([2, 2.5, 2.625, 2.75, 3]);
    } else if (profile.tablet) {
      scr = rng.pick(this.TABLET_SCREENS);
      profile.devicePixelRatio = rng.pick([2, 2.5, 3]);
    } else {
      scr = rng.pick(this.DESKTOP_SCREENS);
      profile.devicePixelRatio = profile.os === 'macOS' ? 2 : rng.pick([1, 1.25, 1.5, 2]);
    }
    const taskbar = rng.nextInt(40, 72);
    const colorDepth = rng.pick([24, 24, 24, 32]);
    profile.screen = { width: scr.w, height: scr.h, availWidth: scr.w, availHeight: scr.h - taskbar, colorDepth, pixelDepth: colorDepth };

    if (profile.mobile) {
      profile.viewport = { width: scr.w, height: scr.h - rng.nextInt(50, 80) };
    } else {
      profile.viewport = { width: scr.w - rng.nextInt(0, 20), height: scr.h - rng.nextInt(80, 160) };
    }
    profile.outerWidth = profile.viewport.width + rng.nextInt(0, 16);
    profile.outerHeight = profile.viewport.height + rng.nextInt(60, 120);
    profile.orientation = profile.mobile ? { type: 'portrait-primary', angle: 0 } : { type: 'landscape-primary', angle: 0 };

    // =================================================================
    // 6. HARDWARE
    // =================================================================
    profile.hardwareConcurrency = profile.mobile ? rng.pick([4, 6, 8]) : rng.pick([4, 6, 8, 12, 16]);
    profile.deviceMemory = profile.mobile ? rng.pick([4, 8]) : rng.pick([4, 8, 16, 32]);
    profile.maxTouchPoints = profile.mobile ? rng.pick([5, 10]) : 0;
    profile.touchEnabled = profile.maxTouchPoints > 0;

    // =================================================================
    // 7. GPU (data-driven or fallback)
    // =================================================================
    this._pickGPU(profile, rng, webglData);

    // =================================================================
    // 8. LANGUAGE & TIMEZONE
    // =================================================================
    if (constraints.language) {
      profile.language = constraints.language;
    } else if (amiuniqueData?.language) {
      profile.language = rng.weightedPick(amiuniqueData.language) || 'en-US';
    } else {
      profile.language = rng.pick(this.LANGUAGES);
    }

    const tzPool = this.TIMEZONE_MAP[profile.language] || ['America/New_York'];
    profile.timezone = rng.pick(tzPool);
    profile.timezoneOffset = this.TIMEZONE_OFFSETS[profile.timezone] || 0;
    profile.languages = rng.next() < 0.6 ? [profile.language, profile.language.split('-')[0]] : [profile.language];

    // =================================================================
    // 9. FONTS
    // =================================================================
    const osFonts = this.OS_FONTS[profile.os] || this.OS_FONTS['Windows'];
    const allFonts = [...this.COMMON_FONTS, ...osFonts];
    profile.fonts = rng.shuffle(allFonts).slice(0, rng.nextInt(20, 35));

    // =================================================================
    // 10. AUDIO
    // =================================================================
    profile.audioParams = {
      sampleRate: rng.pick([44100, 48000]),
      maxChannelCount: rng.pick([2, 6, 8]),
      channelCount: 2,
      baseLatency: rng.nextFloat(0.005, 0.02),
      outputLatency: rng.nextFloat(0.001, 0.01)
    };

    // =================================================================
    // 11. PLUGINS
    // =================================================================
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

    // =================================================================
    // 12. CONNECTION
    // =================================================================
    profile.connection = {
      effectiveType: rng.pick(['4g','4g','4g','3g']),
      downlink: Math.round(rng.nextFloat(1.5, 10) * 100) / 100,
      rtt: rng.nextInt(50, 200),
      saveData: false
    };

    // =================================================================
    // 13. BATTERY
    // =================================================================
    profile.battery = {
      level: Math.round(rng.nextFloat(0.2, 1.0) * 100) / 100,
      charging: rng.next() > 0.5,
      chargingTime: rng.next() > 0.5 ? Infinity : rng.nextInt(600, 7200),
      dischargingTime: rng.nextInt(3600, 36000)
    };

    // =================================================================
    // 14. MEDIA PREFERENCES (CSS media queries)
    // =================================================================
    profile.prefersColorScheme = rng.pick(['light','light','light','dark']);
    profile.prefersReducedMotion = rng.next() < 0.1;
    profile.forcedColors = false;
    profile.prefersContrast = rng.next() < 0.05;
    profile.colorGamut = rng.pick(['srgb','srgb','p3']);
    profile.dynamicRange = rng.next() < 0.3;

    // =================================================================
    // 15. MISC NAVIGATOR
    // =================================================================
    profile.doNotTrack = rng.pick(['1', '0', null]);
    profile.historyLength = rng.nextInt(1, 10);
    profile.pdfViewerEnabled = profile.browser !== 'Firefox' || rng.next() > 0.3;
    profile.buildID = profile.browser === 'Firefox' ? '20' + rng.nextInt(230101, 240201) + '000000' : undefined;

    // =================================================================
    // 16. STORAGE
    // =================================================================
    profile.storageQuota = rng.nextInt(50, 300) * 1024 * 1024 * 1024;
    profile.storageUsage = rng.nextInt(10, 500) * 1024 * 1024;

    // =================================================================
    // 17. VOICES
    // =================================================================
    const base = profile.language.split('-')[0];
    const names = this.VOICE_NAMES[base] || this.VOICE_NAMES['en'];
    profile.voices = names.slice(0, rng.nextInt(3, Math.min(6, names.length))).map((n, i) => ({
      name: n, lang: profile.language, localService: true, default: i === 0
    }));

    // =================================================================
    // 18. MEDIA DEVICES
    // =================================================================
    const audioInputs = rng.nextInt(1, 3);
    profile.mediaDevices = [];
    for (let i = 0; i < audioInputs; i++) {
      profile.mediaDevices.push({ deviceId: rng.generateHex(64), kind: 'audioinput', label: '', groupId: rng.generateHex(64) });
    }
    profile.mediaDevices.push({ deviceId: rng.generateHex(64), kind: 'videoinput', label: '', groupId: rng.generateHex(64) });
    profile.mediaDevices.push({ deviceId: 'default', kind: 'audiooutput', label: '', groupId: rng.generateHex(64) });

    // =================================================================
    // 19. CLIENT HINTS
    // =================================================================
    const major = profile.browserVersion.split('.')[0];
    if (['Chrome','Edge','Opera','Brave'].includes(profile.browser)) {
      const brandName = profile.browser === 'Edge' ? 'Microsoft Edge' :
                        profile.browser === 'Opera' ? 'Opera' :
                        profile.browser === 'Brave' ? 'Brave' : 'Google Chrome';
      profile.clientHints = {
        brands: [
          { brand: 'Not_A Brand', version: '8' },
          { brand: 'Chromium', version: major },
          { brand: brandName, version: major }
        ],
        fullVersionList: [
          { brand: 'Not_A Brand', version: '8.0.0.0' },
          { brand: 'Chromium', version: profile.browserVersion },
          { brand: brandName, version: profile.browserVersion }
        ],
        mobile: profile.mobile,
        platform: profile.os === 'macOS' ? 'macOS' : profile.os,
        platformVersion: profile.os === 'Windows' ? (profile.osVersion === '11.0' ? '15.0.0' : '10.0.0') : profile.osVersion + '.0',
        architecture: profile.arch,
        bitness: profile.bitness,
        model: profile.model || ''
      };
    } else {
      profile.clientHints = null;
    }

    // =================================================================
    // 20. CANVAS / WEBGL / AUDIO NOISE SEEDS
    // =================================================================
    profile.canvasNoiseSeed = rng.generateHex(16);
    profile.webglNoiseSeed = rng.generateHex(16);
    profile.audioNoiseSeed = rng.generateHex(16);

    // =================================================================
    // 21. TIMESTAMP
    // =================================================================
    profile._generatedAt = Date.now();
    profile._seed = seed;

    return profile;
  },

  // =========================================================================
  // Build User-Agent string
  // =========================================================================
  _buildUA(profile) {
    const { os, osVersion, browser, browserVersion, model } = profile;
    if (os === 'Windows') {
      const nt = 'Windows NT 10.0; Win64; x64';
      if (browser === 'Chrome')  return `Mozilla/5.0 (${nt}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browserVersion} Safari/537.36`;
      if (browser === 'Edge')    return `Mozilla/5.0 (${nt}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browserVersion} Safari/537.36 Edg/${browserVersion}`;
      if (browser === 'Firefox') return `Mozilla/5.0 (${nt}; rv:${browserVersion}) Gecko/20100101 Firefox/${browserVersion}`;
      if (browser === 'Opera')   return `Mozilla/5.0 (${nt}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browserVersion} Safari/537.36 OPR/${browserVersion}`;
      if (browser === 'Brave')   return `Mozilla/5.0 (${nt}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browserVersion} Safari/537.36`;
      return `Mozilla/5.0 (${nt}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browserVersion} Safari/537.36`;
    }
    if (os === 'macOS') {
      if (browser === 'Safari')  return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${browserVersion} Safari/605.1.15`;
      if (browser === 'Chrome')  return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browserVersion} Safari/537.36`;
      if (browser === 'Firefox') return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:${browserVersion}) Gecko/20100101 Firefox/${browserVersion}`;
      return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browserVersion} Safari/537.36`;
    }
    if (os === 'Linux') {
      if (browser === 'Firefox') return `Mozilla/5.0 (X11; Linux x86_64; rv:${browserVersion}) Gecko/20100101 Firefox/${browserVersion}`;
      return `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browserVersion} Safari/537.36`;
    }
    if (os === 'Android') {
      if (browser === 'Firefox') return `Mozilla/5.0 (Android ${osVersion}; Mobile; rv:${browserVersion}) Gecko/${browserVersion} Firefox/${browserVersion}`;
      return `Mozilla/5.0 (Linux; Android ${osVersion}; ${model}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browserVersion} Mobile Safari/537.36`;
    }
    // iOS
    const iosVer = osVersion.replace(/\./g, '_');
    if (browser === 'Safari') return `Mozilla/5.0 (iPhone; CPU iPhone OS ${iosVer} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${browserVersion} Mobile/15E148 Safari/604.1`;
    return `Mozilla/5.0 (iPhone; CPU iPhone OS ${iosVer} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/${browserVersion} Mobile/15E148 Safari/604.1`;
  },

  // =========================================================================
  // Pick GPU (data-driven or fallback)
  // =========================================================================
  _pickGPU(profile, rng, webglData) {
    // Try data-driven first
    if (webglData?.profiles) {
      const osMap = { Windows:'windows', macOS:'macos', Linux:'linux', Android:'android', iOS:'ios' };
      const brMap = { Chrome:'chrome', Firefox:'firefox', Safari:'safari', Edge:'chrome', Opera:'chrome', Brave:'chrome' };
      let pool = webglData.profiles.filter(p => p.os === osMap[profile.os] && p.browser === brMap[profile.browser]);
      if (pool.length === 0) pool = webglData.profiles.filter(p => p.os === osMap[profile.os]);
      if (pool.length === 0) pool = webglData.profiles;

      const totalW = pool.reduce((s, p) => s + (p.weight || 0.01), 0);
      let roll = rng.next() * totalW;
      let gpuProfile = pool[0];
      for (const p of pool) { roll -= (p.weight || 0.01); if (roll <= 0) { gpuProfile = p; break; } }

      profile.gpuVendor = gpuProfile.vendor || gpuProfile.unmaskedVendor;
      profile.gpu = gpuProfile.renderer || gpuProfile.unmaskedRenderer;
      profile.webglParams = {
        maxTextureSize: gpuProfile.maxTextureSize, maxViewportDims: gpuProfile.maxViewportDims,
        maxRenderbufferSize: gpuProfile.maxRenderbufferSize, maxVertexAttribs: gpuProfile.maxVertexAttribs,
        maxVertexUniformVectors: gpuProfile.maxVertexUniformVectors, maxFragmentUniformVectors: gpuProfile.maxFragmentUniformVectors,
        maxVaryingVectors: gpuProfile.maxVaryingVectors, maxCombinedTextureUnits: gpuProfile.maxCombinedTextureUnits,
        maxCubeMapTextureSize: gpuProfile.maxCubeMapTextureSize,
        aliasedLineWidthRange: gpuProfile.aliasedLineWidthRange, aliasedPointSizeRange: gpuProfile.aliasedPointSizeRange,
        depthBits: gpuProfile.depthBits, stencilBits: gpuProfile.stencilBits,
        redBits: gpuProfile.redBits, greenBits: gpuProfile.greenBits, blueBits: gpuProfile.blueBits, alphaBits: gpuProfile.alphaBits,
        maxSamples: gpuProfile.maxSamples,
        max3dTextureSize: gpuProfile.webgl2Params?.max3dTextureSize || 8192,
        maxArrayTextureLayers: gpuProfile.webgl2Params?.maxArrayTextureLayers || 2048,
        maxDrawBuffers: gpuProfile.webgl2Params?.maxDrawBuffers || 8,
        maxColorAttachments: gpuProfile.webgl2Params?.maxColorAttachments || 8
      };
      profile.webglExtensions = gpuProfile.extensions;
      profile.webgl2Extensions = gpuProfile.webgl2Extensions;
      profile.shaderPrecision = gpuProfile.shaderPrecision;
      profile.webglVersion = gpuProfile.webglVersion;
      profile.webgl2Version = gpuProfile.webgl2Version;
      return;
    }

    // Fallback: hardcoded GPUs
    let g;
    if (profile.os === 'Windows')      g = rng.pick(this.WINDOWS_GPUS);
    else if (profile.os === 'macOS')   g = profile.browser === 'Safari' ? this.MACOS_SAFARI_GPU : rng.pick(this.MACOS_GPUS);
    else if (profile.os === 'Linux')   g = rng.pick(this.LINUX_GPUS);
    else if (profile.os === 'Android') g = rng.pick(this.ANDROID_GPUS);
    else                               g = this.IOS_GPU;

    profile.gpuVendor = g.v;
    profile.gpu = g.r;

    // Fallback WebGL params
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
      depthBits: 24, stencilBits: 8, maxSamples: rng.pick([4, 8, 16]),
      redBits: 8, greenBits: 8, blueBits: 8, alphaBits: 8,
      max3dTextureSize: isHighEnd ? 16384 : 8192, maxArrayTextureLayers: rng.pick([256, 512, 2048]),
      maxDrawBuffers: rng.pick([4, 8]), maxColorAttachments: rng.pick([4, 8])
    };
  }
};

// Export
if (typeof globalThis !== 'undefined') globalThis.ProfileGenerator = ProfileGenerator;
if (typeof self !== 'undefined') self.ProfileGenerator = ProfileGenerator;
