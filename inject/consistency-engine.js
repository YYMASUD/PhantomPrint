// PhantomPrint Consistency Engine v2.0
// Ensures all spoofed values are internally consistent and pass CreepJS/PixelScan detection
// Key invariants enforced:
//   UA ↔ Platform ↔ Client Hints ↔ Feature Detection ↔ navigator.oscpu
//   OS ↔ GPU vendor/renderer ↔ WebGL params ↔ available fonts ↔ Plugins
//   Screen ↔ DPR ↔ Viewport ↔ CSS media queries ↔ matchMedia results
//   Timezone ↔ Locale ↔ Language ↔ Intl.DateTimeFormat resolvedOptions
//   Touch ↔ MaxTouchPoints ↔ pointer media query ↔ ontouchstart ↔ screen type
//   AudioContext params ↔ OS ↔ sample rate ↔ channel count ↔ baseLatency
//   WebGL renderer string ↔ GPU hardware ↔ OS driver format ↔ maxTextureSize

const ConsistencyEngine = (() => {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // REFERENCE DATA - Real-world accurate values for cross-validation
  // ═══════════════════════════════════════════════════════════════════════════

  const LANGUAGES = [
    'en-US', 'en-GB', 'en-AU', 'en-CA', 'fr-FR', 'de-DE', 'es-ES', 'it-IT',
    'pt-BR', 'ja-JP', 'ko-KR', 'zh-CN', 'zh-TW', 'ru-RU', 'nl-NL', 'pl-PL',
    'sv-SE', 'tr-TR', 'hi-IN', 'th-TH', 'ar-SA', 'vi-VN', 'id-ID'
  ];

  const TIMEZONE_MAP = {
    'en-US': ['America/New_York','America/Chicago','America/Denver','America/Los_Angeles','America/Phoenix'],
    'en-GB': ['Europe/London'],
    'en-AU': ['Australia/Sydney','Australia/Melbourne','Australia/Brisbane','Australia/Perth'],
    'en-CA': ['America/Toronto','America/Vancouver','America/Edmonton'],
    'fr-FR': ['Europe/Paris'],
    'de-DE': ['Europe/Berlin'],
    'es-ES': ['Europe/Madrid'],
    'it-IT': ['Europe/Rome'],
    'pt-BR': ['America/Sao_Paulo','America/Fortaleza'],
    'ja-JP': ['Asia/Tokyo'],
    'ko-KR': ['Asia/Seoul'],
    'zh-CN': ['Asia/Shanghai'],
    'zh-TW': ['Asia/Taipei'],
    'ru-RU': ['Europe/Moscow','Asia/Novosibirsk'],
    'nl-NL': ['Europe/Amsterdam'],
    'pl-PL': ['Europe/Warsaw'],
    'sv-SE': ['Europe/Stockholm'],
    'tr-TR': ['Europe/Istanbul'],
    'hi-IN': ['Asia/Kolkata'],
    'th-TH': ['Asia/Bangkok'],
    'ar-SA': ['Asia/Riyadh'],
    'vi-VN': ['Asia/Ho_Chi_Minh'],
    'id-ID': ['Asia/Jakarta']
  };

  const TIMEZONE_OFFSETS = {
    'America/New_York':-300,'America/Chicago':-360,'America/Denver':-420,
    'America/Los_Angeles':-480,'America/Phoenix':-420,'America/Anchorage':-540,
    'America/Toronto':-300,'America/Vancouver':-480,'America/Edmonton':-420,
    'America/Sao_Paulo':-180,'America/Fortaleza':-180,
    'Europe/London':0,'Europe/Paris':60,'Europe/Berlin':60,'Europe/Madrid':60,
    'Europe/Rome':60,'Europe/Amsterdam':60,'Europe/Warsaw':60,
    'Europe/Stockholm':60,'Europe/Istanbul':180,'Europe/Moscow':180,
    'Asia/Tokyo':540,'Asia/Seoul':540,'Asia/Shanghai':480,'Asia/Taipei':480,
    'Asia/Kolkata':330,'Asia/Bangkok':420,'Asia/Riyadh':180,
    'Asia/Ho_Chi_Minh':420,'Asia/Jakarta':420,'Asia/Novosibirsk':420,
    'Australia/Sydney':660,'Australia/Melbourne':660,'Australia/Brisbane':600,'Australia/Perth':480
  };

  // ─── Screen Resolutions (real-world StatCounter data) ─────────────────────
  const DESKTOP_SCREENS = {
    common: [
      {w:1920,h:1080},{w:1366,h:768},{w:1536,h:864},{w:1440,h:900},
      {w:1600,h:900},{w:2560,h:1440},{w:1280,h:720},{w:1280,h:800}
    ],
    highEnd: [
      {w:2560,h:1440},{w:3440,h:1440},{w:3840,h:2160},{w:2560,h:1600},{w:3840,h:2400}
    ],
    mac: [
      {w:1440,h:900},{w:1680,h:1050},{w:1920,h:1080},{w:2560,h:1440},
      {w:2560,h:1600},{w:3024,h:1964},{w:3456,h:2234}
    ]
  };

  const MOBILE_SCREENS = {
    android: [
      {w:360,h:780},{w:360,h:800},{w:393,h:851},{w:393,h:873},
      {w:412,h:892},{w:412,h:915},{w:384,h:854},{w:360,h:740}
    ],
    ios: [
      {w:375,h:812},{w:390,h:844},{w:393,h:852},{w:414,h:896},
      {w:428,h:926},{w:430,h:932}
    ],
    tablet: [
      {w:768,h:1024},{w:810,h:1080},{w:820,h:1180},{w:834,h:1194},{w:1024,h:1366}
    ]
  };

  // ─── GPU Databases (ANGLE format for Chromium, native for FF/Safari) ──────
  const GPU_DATABASE = {
    windows_nvidia: [
      {v:'Google Inc. (NVIDIA)',r:'ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 6GB Direct3D11 vs_5_0 ps_5_0, D3D11)',maxTex:16384},
      {v:'Google Inc. (NVIDIA)',r:'ANGLE (NVIDIA, NVIDIA GeForce GTX 1070 Direct3D11 vs_5_0 ps_5_0, D3D11)',maxTex:16384},
      {v:'Google Inc. (NVIDIA)',r:'ANGLE (NVIDIA, NVIDIA GeForce GTX 1080 Direct3D11 vs_5_0 ps_5_0, D3D11)',maxTex:16384},
      {v:'Google Inc. (NVIDIA)',r:'ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 SUPER Direct3D11 vs_5_0 ps_5_0, D3D11)',maxTex:16384},
      {v:'Google Inc. (NVIDIA)',r:'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 SUPER Direct3D11 vs_5_0 ps_5_0, D3D11)',maxTex:16384},
      {v:'Google Inc. (NVIDIA)',r:'ANGLE (NVIDIA, NVIDIA GeForce RTX 2060 Direct3D11 vs_5_0 ps_5_0, D3D11)',maxTex:32768},
      {v:'Google Inc. (NVIDIA)',r:'ANGLE (NVIDIA, NVIDIA GeForce RTX 2070 SUPER Direct3D11 vs_5_0 ps_5_0, D3D11)',maxTex:32768},
      {v:'Google Inc. (NVIDIA)',r:'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)',maxTex:32768},
      {v:'Google Inc. (NVIDIA)',r:'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Ti Direct3D11 vs_5_0 ps_5_0, D3D11)',maxTex:32768},
      {v:'Google Inc. (NVIDIA)',r:'ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0, D3D11)',maxTex:32768},
      {v:'Google Inc. (NVIDIA)',r:'ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Direct3D11 vs_5_0 ps_5_0, D3D11)',maxTex:32768},
      {v:'Google Inc. (NVIDIA)',r:'ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Direct3D11 vs_5_0 ps_5_0, D3D11)',maxTex:32768},
      {v:'Google Inc. (NVIDIA)',r:'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)',maxTex:32768},
      {v:'Google Inc. (NVIDIA)',r:'ANGLE (NVIDIA, NVIDIA GeForce RTX 4080 Direct3D11 vs_5_0 ps_5_0, D3D11)',maxTex:32768},
      {v:'Google Inc. (NVIDIA)',r:'ANGLE (NVIDIA, NVIDIA GeForce RTX 4090 Direct3D11 vs_5_0 ps_5_0, D3D11)',maxTex:32768}
    ],
    windows_amd: [
      {v:'Google Inc. (AMD)',r:'ANGLE (AMD, AMD Radeon RX 580 Direct3D11 vs_5_0 ps_5_0, D3D11)',maxTex:16384},
      {v:'Google Inc. (AMD)',r:'ANGLE (AMD, AMD Radeon RX 5600 XT Direct3D11 vs_5_0 ps_5_0, D3D11)',maxTex:16384},
      {v:'Google Inc. (AMD)',r:'ANGLE (AMD, AMD Radeon RX 5700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)',maxTex:16384},
      {v:'Google Inc. (AMD)',r:'ANGLE (AMD, AMD Radeon RX 6600 XT Direct3D11 vs_5_0 ps_5_0, D3D11)',maxTex:16384},
      {v:'Google Inc. (AMD)',r:'ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)',maxTex:16384},
      {v:'Google Inc. (AMD)',r:'ANGLE (AMD, AMD Radeon RX 6800 XT Direct3D11 vs_5_0 ps_5_0, D3D11)',maxTex:16384},
      {v:'Google Inc. (AMD)',r:'ANGLE (AMD, AMD Radeon RX 7600 Direct3D11 vs_5_0 ps_5_0, D3D11)',maxTex:16384},
      {v:'Google Inc. (AMD)',r:'ANGLE (AMD, AMD Radeon RX 7900 XTX Direct3D11 vs_5_0 ps_5_0, D3D11)',maxTex:16384}
    ],
    windows_intel: [
      {v:'Google Inc. (Intel)',r:'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)',maxTex:16384},
      {v:'Google Inc. (Intel)',r:'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)',maxTex:16384},
      {v:'Google Inc. (Intel)',r:'ANGLE (Intel, Intel(R) UHD Graphics 730 Direct3D11 vs_5_0 ps_5_0, D3D11)',maxTex:16384},
      {v:'Google Inc. (Intel)',r:'ANGLE (Intel, Intel(R) UHD Graphics 770 Direct3D11 vs_5_0 ps_5_0, D3D11)',maxTex:16384},
      {v:'Google Inc. (Intel)',r:'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',maxTex:16384},
      {v:'Google Inc. (Intel)',r:'ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',maxTex:16384}
    ],
    mac_apple: [
      {v:'Google Inc. (Apple)',r:'ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)',maxTex:16384},
      {v:'Google Inc. (Apple)',r:'ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Unspecified Version)',maxTex:16384},
      {v:'Google Inc. (Apple)',r:'ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Max, Unspecified Version)',maxTex:16384},
      {v:'Google Inc. (Apple)',r:'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)',maxTex:16384},
      {v:'Google Inc. (Apple)',r:'ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Pro, Unspecified Version)',maxTex:16384},
      {v:'Google Inc. (Apple)',r:'ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Max, Unspecified Version)',maxTex:16384},
      {v:'Google Inc. (Apple)',r:'ANGLE (Apple, ANGLE Metal Renderer: Apple M3, Unspecified Version)',maxTex:16384},
      {v:'Google Inc. (Apple)',r:'ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Pro, Unspecified Version)',maxTex:16384}
    ],
    mac_safari: [
      {v:'Apple GPU',r:'Apple GPU',maxTex:16384}
    ],
    linux_nvidia: [
      {v:'Google Inc. (NVIDIA Corporation)',r:'ANGLE (NVIDIA Corporation, NVIDIA GeForce GTX 1060 6GB/PCIe/SSE2, OpenGL 4.5)',maxTex:16384},
      {v:'Google Inc. (NVIDIA Corporation)',r:'ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 3060/PCIe/SSE2, OpenGL 4.6)',maxTex:32768},
      {v:'Google Inc. (NVIDIA Corporation)',r:'ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 3080/PCIe/SSE2, OpenGL 4.6)',maxTex:32768}
    ],
    linux_amd: [
      {v:'Google Inc. (AMD)',r:'ANGLE (AMD, AMD Radeon RX 580, OpenGL 4.6)',maxTex:16384},
      {v:'Google Inc. (AMD)',r:'ANGLE (AMD, AMD Radeon RX 6700 XT, OpenGL 4.6)',maxTex:16384}
    ],
    linux_intel: [
      {v:'Google Inc. (Intel)',r:'ANGLE (Intel, Mesa Intel(R) UHD Graphics 630 (CFL GT2), OpenGL 4.6)',maxTex:16384},
      {v:'Google Inc. (Intel)',r:'ANGLE (Intel, Mesa Intel(R) Xe Graphics (TGL GT2), OpenGL 4.6)',maxTex:16384}
    ],
    android: [
      {v:'Qualcomm',r:'Adreno (TM) 730',maxTex:16384},
      {v:'Qualcomm',r:'Adreno (TM) 740',maxTex:16384},
      {v:'Qualcomm',r:'Adreno (TM) 660',maxTex:16384},
      {v:'Qualcomm',r:'Adreno (TM) 650',maxTex:16384},
      {v:'ARM',r:'Mali-G715 Immortalis MC11',maxTex:8192},
      {v:'ARM',r:'Mali-G710 MC10',maxTex:8192},
      {v:'ARM',r:'Mali-G78',maxTex:8192}
    ],
    ios: [
      {v:'Apple Inc.',r:'Apple GPU',maxTex:16384}
    ]
  };

  // ─── Font Lists by OS (real-world verified) ───────────────────────────────
  const FONT_DATABASE = {
    common: ['Arial','Arial Black','Courier New','Georgia','Helvetica','Impact','Times New Roman','Trebuchet MS','Verdana','Comic Sans MS','Lucida Console','Palatino Linotype','Tahoma'],
    windows: ['Segoe UI','Calibri','Consolas','Cambria','Candara','Corbel','Constantia','Malgun Gothic','Microsoft YaHei','Yu Gothic','Meiryo','Gabriola','Sitka Text','Segoe UI Symbol','Segoe MDL2 Assets','Cascadia Code','Cascadia Mono'],
    macOS: ['Helvetica Neue','San Francisco','SF Pro Text','SF Pro Display','Menlo','Monaco','Avenir','Avenir Next','Futura','Optima','Baskerville','Didot','Gill Sans','Hoefler Text','Chalkboard SE','Apple Color Emoji','Geneva','Lucida Grande'],
    linux: ['Liberation Sans','Liberation Serif','Liberation Mono','DejaVu Sans','DejaVu Serif','DejaVu Sans Mono','Noto Sans','Noto Serif','Ubuntu','Cantarell','Droid Sans','Droid Serif','FreeSans','FreeSerif'],
    android: ['Roboto','Noto Sans','Droid Sans','Droid Serif','Droid Sans Mono','Cutive Mono','Dancing Script'],
    iOS: ['San Francisco','SF Pro Text','Helvetica Neue','Avenir','Avenir Next','Futura','Gill Sans','Menlo']
  };

  // ─── WebGL Extension Lists (browser-specific) ────────────────────────────
  const WEBGL_EXTENSIONS = {
    chrome: ['ANGLE_instanced_arrays','EXT_blend_minmax','EXT_color_buffer_half_float','EXT_float_blend','EXT_frag_depth','EXT_shader_texture_lod','EXT_texture_compression_bptc','EXT_texture_compression_rgtc','EXT_texture_filter_anisotropic','EXT_sRGB','KHR_parallel_shader_compile','OES_element_index_uint','OES_fbo_render_mipmap','OES_standard_derivatives','OES_texture_float','OES_texture_float_linear','OES_texture_half_float','OES_texture_half_float_linear','OES_vertex_array_object','WEBGL_color_buffer_float','WEBGL_compressed_texture_s3tc','WEBGL_compressed_texture_s3tc_srgb','WEBGL_debug_renderer_info','WEBGL_debug_shaders','WEBGL_depth_texture','WEBGL_draw_buffers','WEBGL_lose_context','WEBGL_multi_draw'],
    firefox: ['ANGLE_instanced_arrays','EXT_blend_minmax','EXT_color_buffer_half_float','EXT_float_blend','EXT_frag_depth','EXT_shader_texture_lod','EXT_texture_filter_anisotropic','EXT_sRGB','OES_element_index_uint','OES_standard_derivatives','OES_texture_float','OES_texture_float_linear','OES_texture_half_float','OES_texture_half_float_linear','OES_vertex_array_object','WEBGL_color_buffer_float','WEBGL_compressed_texture_s3tc','WEBGL_debug_renderer_info','WEBGL_depth_texture','WEBGL_draw_buffers','WEBGL_lose_context'],
    safari: ['EXT_blend_minmax','EXT_color_buffer_half_float','EXT_float_blend','EXT_frag_depth','EXT_shader_texture_lod','EXT_texture_filter_anisotropic','EXT_sRGB','OES_element_index_uint','OES_standard_derivatives','OES_texture_float','OES_texture_float_linear','OES_texture_half_float','OES_texture_half_float_linear','OES_vertex_array_object','WEBGL_color_buffer_float','WEBGL_compressed_texture_s3tc','WEBGL_depth_texture','WEBGL_draw_buffers','WEBGL_lose_context']
  };

  // ─── Chrome Version ↔ Real Build Data ─────────────────────────────────────
  const CHROME_BUILDS = {
    '120.0.6099.109': {appleWebKit:'537.36',v8:'12.0'},
    '120.0.6099.130': {appleWebKit:'537.36',v8:'12.0'},
    '121.0.6167.85': {appleWebKit:'537.36',v8:'12.1'},
    '121.0.6167.139': {appleWebKit:'537.36',v8:'12.1'},
    '122.0.6261.69': {appleWebKit:'537.36',v8:'12.2'},
    '122.0.6261.94': {appleWebKit:'537.36',v8:'12.2'},
    '123.0.6312.58': {appleWebKit:'537.36',v8:'12.3'},
    '123.0.6312.86': {appleWebKit:'537.36',v8:'12.3'},
    '124.0.6367.60': {appleWebKit:'537.36',v8:'12.4'},
    '124.0.6367.91': {appleWebKit:'537.36',v8:'12.4'}
  };

  const CHROME_VERSIONS = Object.keys(CHROME_BUILDS);
  const FIREFOX_VERSIONS = ['121.0','122.0','123.0','124.0','125.0'];
  const SAFARI_VERSIONS = ['17.0','17.1','17.2','17.3','17.4'];
  const EDGE_VERSIONS = Object.keys(CHROME_BUILDS); // Edge tracks Chrome versions

  // ─── AudioContext Parameters (OS + Browser specific) ──────────────────────
  const AUDIO_PARAMS = {
    windows_chrome: {sampleRate:48000,baseLatency:0.01,outputLatency:0.006,maxChannelCount:6},
    windows_firefox: {sampleRate:48000,baseLatency:0.01,outputLatency:0.004,maxChannelCount:2},
    mac_chrome: {sampleRate:48000,baseLatency:0.005333,outputLatency:0.005333,maxChannelCount:2},
    mac_safari: {sampleRate:48000,baseLatency:0.005333,outputLatency:0.005333,maxChannelCount:2},
    mac_firefox: {sampleRate:48000,baseLatency:0.011610,outputLatency:0.005333,maxChannelCount:2},
    linux_chrome: {sampleRate:48000,baseLatency:0.005333,outputLatency:0.005333,maxChannelCount:6},
    linux_firefox: {sampleRate:48000,baseLatency:0.005333,outputLatency:0.005333,maxChannelCount:2},
    android_chrome: {sampleRate:48000,baseLatency:0.01,outputLatency:0.01,maxChannelCount:2},
    ios_safari: {sampleRate:48000,baseLatency:0.005333,outputLatency:0.005333,maxChannelCount:2}
  };

  // ─── Chromium Plugin List (exact real-world order) ────────────────────────
  const CHROMIUM_PLUGINS = [
    {name:'PDF Viewer',filename:'internal-pdf-viewer',description:'Portable Document Format',mimeTypes:[{type:'application/pdf',suffixes:'pdf',description:'Portable Document Format'}]},
    {name:'Chrome PDF Viewer',filename:'internal-pdf-viewer',description:'Portable Document Format',mimeTypes:[{type:'application/pdf',suffixes:'pdf',description:'Portable Document Format'}]},
    {name:'Chromium PDF Viewer',filename:'internal-pdf-viewer',description:'Portable Document Format',mimeTypes:[{type:'application/pdf',suffixes:'pdf',description:'Portable Document Format'}]},
    {name:'Microsoft Edge PDF Viewer',filename:'internal-pdf-viewer',description:'Portable Document Format',mimeTypes:[{type:'application/pdf',suffixes:'pdf',description:'Portable Document Format'}]},
    {name:'WebKit built-in PDF',filename:'internal-pdf-viewer',description:'Portable Document Format',mimeTypes:[{type:'application/pdf',suffixes:'pdf',description:'Portable Document Format'}]}
  ];

  // ═══════════════════════════════════════════════════════════════════════════
  // FINGERPRINT PROFILE CLASS
  // ═══════════════════════════════════════════════════════════════════════════

  class FingerprintProfile {
    constructor(rng, deviceProfiles, options = {}) {
      this.rng = rng;
      this.options = options;
      this.deviceProfiles = deviceProfiles || [];
      this.validationErrors = [];
      this.generate();
      this.validate();
    }

    generate() {
      // Phase 1: Select base device identity (OS + Browser + Hardware tier)
      this.selectDeviceIdentity();
      // Phase 2: Build browser-specific values (UA, vendor, product, etc.)
      this.buildBrowserIdentity();
      // Phase 3: Build screen/viewport consistent with device type
      this.buildScreenProfile();
      // Phase 4: Build GPU consistent with OS
      this.buildGPUProfile();
      // Phase 5: Build hardware metrics consistent with device tier
      this.buildHardwareProfile();
      // Phase 6: Build locale/timezone/language chain
      this.buildLocaleProfile();
      // Phase 7: Build audio params consistent with OS+Browser
      this.buildAudioProfile();
      // Phase 8: Build fonts consistent with OS
      this.buildFontProfile();
      // Phase 9: Build plugins consistent with browser
      this.buildPluginProfile();
      // Phase 10: Build WebGL params consistent with GPU
      this.buildWebGLProfile();
      // Phase 11: Build media/privacy values
      this.buildMediaProfile();
      // Phase 12: Build client hints (Chromium only)
      this.buildClientHints();
      // Phase 13: Run cross-validation pass
      this.crossValidate();
    }

    // ─── Phase 1: Device Identity ─────────────────────────────────────────
    selectDeviceIdentity() {
      // Try to use a real device profile first (70% chance if available)
      if (this.deviceProfiles.length > 0 && this.rng.next() < 0.7) {
        const dp = this.rng.pick(this.deviceProfiles);
        this.os = dp.os;
        this.osVersion = dp.osVersion;
        this.browser = dp.browser;
        this.browserVersion = dp.browserVersion;
        this.mobile = dp.mobile || false;
        this.tablet = dp.tablet || false;
        this.model = dp.model || '';
        this._fromProfile = true;
        return;
      }

      // Synthetic generation with real-world market share weights
      const osRoll = this.rng.next();
      if (osRoll < 0.40) {
        this.os = 'Windows';
        this.osVersion = this.rng.pick(['10.0','10.0','10.0','11.0','11.0']);
        this.mobile = false; this.tablet = false;
      } else if (osRoll < 0.60) {
        this.os = 'macOS';
        this.osVersion = this.rng.pick(['13.5.2','13.6','13.6.1','14.0','14.1','14.1.1','14.2','14.2.1','14.3']);
        this.mobile = false; this.tablet = false;
      } else if (osRoll < 0.68) {
        this.os = 'Linux';
        this.osVersion = this.rng.pick(['6.1','6.2','6.5','6.6','6.7']);
        this.mobile = false; this.tablet = false;
      } else if (osRoll < 0.85) {
        this.os = 'Android';
        this.osVersion = this.rng.pick(['12','12','13','13','14','14']);
        this.mobile = true; this.tablet = this.rng.next() < 0.15;
        this.model = this.rng.pick(['Pixel 8','Pixel 8 Pro','Pixel 7','Pixel 7a','SM-S918B','SM-S911B','SM-A546B','SM-A546E','SM-G991B','2201116SG','22101316G','CPH2585']);
      } else {
        this.os = 'iOS';
        this.osVersion = this.rng.pick(['16.6','16.7','17.0','17.1','17.1.2','17.2','17.2.1','17.3']);
        this.mobile = true; this.tablet = this.rng.next() < 0.2;
        this.model = this.tablet ? 'iPad' : 'iPhone';
      }

      // Browser selection (respects OS constraints)
      if (this.os === 'Windows') {
        const b = this.rng.next();
        this.browser = b < 0.64 ? 'Chrome' : b < 0.82 ? 'Edge' : 'Firefox';
      } else if (this.os === 'macOS') {
        const b = this.rng.next();
        this.browser = b < 0.35 ? 'Safari' : b < 0.75 ? 'Chrome' : 'Firefox';
      } else if (this.os === 'Linux') {
        this.browser = this.rng.next() < 0.55 ? 'Chrome' : 'Firefox';
      } else if (this.os === 'Android') {
        this.browser = this.rng.next() < 0.92 ? 'Chrome' : 'Firefox';
      } else {
        this.browser = this.rng.next() < 0.65 ? 'Safari' : 'Chrome';
      }

      // Browser version (real full versions)
      if (this.browser === 'Chrome' || this.browser === 'Edge') {
        this.browserVersion = this.rng.pick(CHROME_VERSIONS);
      } else if (this.browser === 'Firefox') {
        this.browserVersion = this.rng.pick(FIREFOX_VERSIONS);
      } else {
        this.browserVersion = this.rng.pick(SAFARI_VERSIONS);
      }
      this._fromProfile = false;
    }

    // ─── Phase 2: Browser Identity ────────────────────────────────────────
    buildBrowserIdentity() {
      this.appName = 'Netscape';
      this.product = 'Gecko';

      if (this.browser === 'Chrome') {
        this.vendor = 'Google Inc.';
        this.vendorSub = '';
        this.productSub = '20030107';
      } else if (this.browser === 'Edge') {
        this.vendor = 'Google Inc.';
        this.vendorSub = '';
        this.productSub = '20030107';
      } else if (this.browser === 'Firefox') {
        this.vendor = '';
        this.vendorSub = '';
        this.productSub = '20100101';
      } else if (this.browser === 'Safari') {
        this.vendor = 'Apple Computer, Inc.';
        this.vendorSub = '';
        this.productSub = '20030107';
      }

      this.userAgent = this._buildUserAgent();
      this.appVersion = this._buildAppVersion();
      this.platform = this._buildPlatform();
      this.oscpu = this._buildOsCpu();

      // Firefox-specific buildID
      if (this.browser === 'Firefox') {
        this.buildID = '20' + this.rng.nextInt(240101, 240415).toString() + '000000';
      } else {
        this.buildID = undefined;
      }

      this.pdfViewerEnabled = this.browser !== 'Firefox' || this.rng.next() > 0.2;
      this.doNotTrack = this.rng.pick([null, null, null, '1']);
    }

    _buildUserAgent() {
      const cv = this.browserVersion;
      const major = cv.split('.')[0];

      if (this.os === 'Windows') {
        const nt = 'Windows NT 10.0; Win64; x64';
        if (this.browser === 'Chrome') return `Mozilla/5.0 (${nt}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${cv} Safari/537.36`;
        if (this.browser === 'Edge') return `Mozilla/5.0 (${nt}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${cv} Safari/537.36 Edg/${cv}`;
        return `Mozilla/5.0 (${nt}; rv:${cv}) Gecko/20100101 Firefox/${cv}`;
      }
      if (this.os === 'macOS') {
        if (this.browser === 'Chrome') return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${cv} Safari/537.36`;
        if (this.browser === 'Safari') return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${cv} Safari/605.1.15`;
        return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:${cv}) Gecko/20100101 Firefox/${cv}`;
      }
      if (this.os === 'Linux') {
        if (this.browser === 'Chrome') return `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${cv} Safari/537.36`;
        return `Mozilla/5.0 (X11; Linux x86_64; rv:${cv}) Gecko/20100101 Firefox/${cv}`;
      }
      if (this.os === 'Android') {
        if (this.browser === 'Chrome') return `Mozilla/5.0 (Linux; Android ${this.osVersion}; ${this.model}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${cv} Mobile Safari/537.36`;
        return `Mozilla/5.0 (Android ${this.osVersion}; Mobile; rv:${cv}) Gecko/${cv} Firefox/${cv}`;
      }
      // iOS
      const iosVer = this.osVersion.replace(/\./g, '_');
      if (this.browser === 'Safari') {
        if (this.tablet) return `Mozilla/5.0 (iPad; CPU OS ${iosVer} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${cv} Mobile/15E148 Safari/604.1`;
        return `Mozilla/5.0 (iPhone; CPU iPhone OS ${iosVer} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${cv} Mobile/15E148 Safari/604.1`;
      }
      return `Mozilla/5.0 (iPhone; CPU iPhone OS ${iosVer} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/${cv} Mobile/15E148 Safari/604.1`;
    }

    _buildAppVersion() {
      if (this.browser === 'Firefox') {
        if (this.os === 'Windows') return '5.0 (Windows)';
        if (this.os === 'macOS') return '5.0 (Macintosh)';
        if (this.os === 'Linux') return '5.0 (X11)';
        return this.userAgent.replace('Mozilla/', '');
      }
      return this.userAgent.replace('Mozilla/', '');
    }

    _buildPlatform() {
      if (this.os === 'Windows') return 'Win32';
      if (this.os === 'macOS') return 'MacIntel';
      if (this.os === 'Linux') return 'Linux x86_64';
      if (this.os === 'Android') return 'Linux armv81';
      if (this.os === 'iOS') return this.tablet ? 'iPad' : 'iPhone';
      return 'Win32';
    }

    _buildOsCpu() {
      // Only Firefox exposes this
      if (this.browser !== 'Firefox') return undefined;
      if (this.os === 'Windows') return 'Windows NT 10.0; Win64; x64';
      if (this.os === 'macOS') return 'Intel Mac OS X 10.15';
      if (this.os === 'Linux') return 'Linux x86_64';
      return undefined;
    }

    // ─── Phase 3: Screen Profile ──────────────────────────────────────────
    buildScreenProfile() {
      let scr;
      if (this.mobile && !this.tablet) {
        scr = this.rng.pick(this.os === 'iOS' ? MOBILE_SCREENS.ios : MOBILE_SCREENS.android);
        this.devicePixelRatio = this.rng.pick([2, 2.625, 2.75, 3, 3.5]);
      } else if (this.tablet) {
        scr = this.rng.pick(MOBILE_SCREENS.tablet);
        this.devicePixelRatio = 2;
      } else if (this.os === 'macOS') {
        scr = this.rng.pick(DESKTOP_SCREENS.mac);
        this.devicePixelRatio = 2; // Retina always 2x
      } else {
        scr = this.rng.pick(DESKTOP_SCREENS.common);
        this.devicePixelRatio = this.rng.pick([1, 1, 1.25, 1.5, 2]);
      }

      // taskbar/dock height varies by OS
      const taskbarH = this.os === 'macOS' ? 25 : this.os === 'Windows' ? this.rng.nextInt(40, 48) : this.rng.nextInt(28, 40);

      this.screen = {
        width: scr.w, height: scr.h,
        availWidth: scr.w,
        availHeight: scr.h - taskbarH,
        colorDepth: 24,
        pixelDepth: 24
      };

      // Viewport (browser chrome takes space)
      if (this.mobile) {
        this.viewport = { width: scr.w, height: scr.h - this.rng.nextInt(56, 80) };
        this.outerWidth = scr.w;
        this.outerHeight = scr.h;
      } else {
        // Desktop: viewport can be smaller due to scrollbar, devtools, etc.
        const chromeH = this.rng.nextInt(75, 140);
        this.viewport = {
          width: scr.w - (this.rng.next() < 0.3 ? 17 : 0), // scrollbar width
          height: scr.h - chromeH
        };
        this.outerWidth = scr.w;
        this.outerHeight = scr.h - taskbarH;
      }

      this.orientation = this.mobile
        ? { type: 'portrait-primary', angle: 0 }
        : { type: 'landscape-primary', angle: 0 };
    }

    // ─── Phase 4: GPU Profile ─────────────────────────────────────────────
    buildGPUProfile() {
      let gpuPool;
      if (this.os === 'Windows') {
        const roll = this.rng.next();
        if (roll < 0.5) gpuPool = GPU_DATABASE.windows_nvidia;
        else if (roll < 0.75) gpuPool = GPU_DATABASE.windows_amd;
        else gpuPool = GPU_DATABASE.windows_intel;
      } else if (this.os === 'macOS') {
        gpuPool = this.browser === 'Safari' ? GPU_DATABASE.mac_safari : GPU_DATABASE.mac_apple;
      } else if (this.os === 'Linux') {
        const roll = this.rng.next();
        if (roll < 0.5) gpuPool = GPU_DATABASE.linux_nvidia;
        else if (roll < 0.8) gpuPool = GPU_DATABASE.linux_amd;
        else gpuPool = GPU_DATABASE.linux_intel;
      } else if (this.os === 'Android') {
        gpuPool = GPU_DATABASE.android;
      } else {
        gpuPool = GPU_DATABASE.ios;
      }

      const gpu = this.rng.pick(gpuPool);
      this.gpuVendor = gpu.v;
      this.gpu = gpu.r;
      this._gpuMaxTex = gpu.maxTex;
    }

    // ─── Phase 5: Hardware Profile ────────────────────────────────────────
    buildHardwareProfile() {
      if (this.mobile) {
        this.hardwareConcurrency = this.rng.pick([4, 6, 8]);
        this.deviceMemory = this.rng.pick([4, 6, 8]);
        this.maxTouchPoints = this.rng.pick([5, 10]);
        this.touchEnabled = true;
      } else {
        this.hardwareConcurrency = this.rng.pick([4, 6, 8, 10, 12, 16, 20, 24]);
        this.deviceMemory = this.rng.pick([8, 8, 16, 16, 32]);
        this.maxTouchPoints = 0;
        this.touchEnabled = false;
      }
      this.arch = (this.os === 'Android' || this.os === 'iOS' || (this.os === 'macOS' && this.rng.next() < 0.8)) ? 'arm' : 'x86';
      this.bitness = '64';

      // Connection
      this.connection = {
        effectiveType: this.rng.pick(['4g','4g','4g','4g','3g']),
        downlink: Math.round(this.rng.nextFloat(1.5, 10) * 100) / 100,
        rtt: this.rng.nextInt(50, 200),
        saveData: false
      };

      // Battery
      this.battery = {
        charging: this.rng.next() > 0.4,
        level: Math.round(this.rng.nextFloat(0.15, 1.0) * 100) / 100,
        chargingTime: this.rng.next() > 0.5 ? Infinity : this.rng.nextInt(300, 7200),
        dischargingTime: this.rng.nextInt(1800, 43200)
      };

      this.historyLength = this.rng.nextInt(1, 8);
    }

    // ─── Phase 6: Locale/Timezone ─────────────────────────────────────────
    buildLocaleProfile() {
      this.language = this.rng.pick(LANGUAGES);
      const tzPool = TIMEZONE_MAP[this.language] || ['America/New_York'];
      this.timezone = this.rng.pick(tzPool);
      this.timezoneOffset = TIMEZONE_OFFSETS[this.timezone] || 0;

      // Languages array (CreepJS checks this matches navigator.language)
      const baseLang = this.language.split('-')[0];
      if (this.rng.next() < 0.7) {
        this.languages = [this.language, baseLang];
      } else if (this.rng.next() < 0.5) {
        this.languages = [this.language];
      } else {
        this.languages = [this.language, baseLang, 'en'];
      }

      // Media preferences
      this.prefersColorScheme = this.rng.pick(['light','light','light','dark','dark']);
      this.prefersReducedMotion = this.rng.next() < 0.05;
      this.forcedColors = false;
      this.prefersContrast = false;
      this.colorGamut = this.os === 'macOS' || this.os === 'iOS' ? this.rng.pick(['p3','p3','srgb']) : 'srgb';
      this.dynamicRange = (this.os === 'macOS' || this.os === 'iOS') && this.rng.next() < 0.4;
    }

    // ─── Phase 7: Audio ───────────────────────────────────────────────────
    buildAudioProfile() {
      let key;
      if (this.os === 'Windows') key = this.browser === 'Firefox' ? 'windows_firefox' : 'windows_chrome';
      else if (this.os === 'macOS') key = this.browser === 'Safari' ? 'mac_safari' : this.browser === 'Firefox' ? 'mac_firefox' : 'mac_chrome';
      else if (this.os === 'Linux') key = this.browser === 'Firefox' ? 'linux_firefox' : 'linux_chrome';
      else if (this.os === 'Android') key = 'android_chrome';
      else key = 'ios_safari';

      const base = AUDIO_PARAMS[key] || AUDIO_PARAMS.windows_chrome;
      // Add tiny realistic jitter (CreepJS checks for exact round numbers)
      this.audioParams = {
        sampleRate: base.sampleRate,
        baseLatency: base.baseLatency + this.rng.nextFloat(-0.0001, 0.0001),
        outputLatency: base.outputLatency + this.rng.nextFloat(-0.0001, 0.0001),
        maxChannelCount: base.maxChannelCount,
        channelCount: 2
      };
    }

    // ─── Phase 8: Fonts ───────────────────────────────────────────────────
    buildFontProfile() {
      const osFonts = FONT_DATABASE[this.os === 'iOS' ? 'iOS' : this.os] || FONT_DATABASE.windows;
      const common = [...FONT_DATABASE.common];
      const available = [...common, ...osFonts];

      // Remove some randomly to simulate a real system (not all fonts always installed)
      const removeCount = this.rng.nextInt(2, 6);
      for (let i = 0; i < removeCount; i++) {
        const idx = this.rng.nextInt(common.length, available.length - 1);
        if (idx < available.length) available.splice(idx, 1);
      }

      this.fonts = available;
    }

    // ─── Phase 9: Plugins ─────────────────────────────────────────────────
    buildPluginProfile() {
      if (this.browser === 'Firefox') {
        // Firefox doesn't expose plugins array (empty in modern versions)
        this.plugins = [];
      } else {
        // Chromium: always exactly 5 PDF plugins in this exact order
        this.plugins = [...CHROMIUM_PLUGINS];
      }
    }

    // ─── Phase 10: WebGL Parameters ──────────────────────────────────────
    buildWebGLProfile() {
      const maxTex = this._gpuMaxTex || 16384;
      const isHighEnd = maxTex >= 32768;

      this.webglParams = {
        maxTextureSize: maxTex,
        maxViewportDims: [maxTex, maxTex],
        maxRenderbufferSize: maxTex,
        maxVertexAttribs: 16,
        maxVertexUniformVectors: isHighEnd ? 4096 : 1024,
        maxFragmentUniformVectors: isHighEnd ? 1024 : 1024,
        maxVaryingVectors: isHighEnd ? 31 : 15,
        maxCombinedTextureUnits: isHighEnd ? 80 : 32,
        maxCubeMapTextureSize: maxTex >= 32768 ? 16384 : 8192,
        aliasedLineWidthRange: [1, 1],
        aliasedPointSizeRange: [1, 1024],
        depthBits: 24,
        stencilBits: 8,
        samples: this.os === 'macOS' ? 4 : this.rng.pick([4, 8]),
        redBits: 8, greenBits: 8, blueBits: 8, alphaBits: 8,
        max3dTextureSize: isHighEnd ? 16384 : 8192,
        maxArrayTextureLayers: isHighEnd ? 2048 : 256,
        maxDrawBuffers: 8,
        maxColorAttachments: 8,
        maxSamples: isHighEnd ? 16 : 8,
        maxAnisotropy: 16
      };

      // Extensions list matches browser
      this.webglExtensions = WEBGL_EXTENSIONS[this.browser === 'Edge' ? 'chrome' : this.browser.toLowerCase()] || WEBGL_EXTENSIONS.chrome;
    }

    // ─── Phase 11: Media / Privacy ────────────────────────────────────────
    buildMediaProfile() {
      const base = this.language.split('-')[0];
      const voiceNames = {
        'en': [{name:'Microsoft David',lang:'en-US'},{name:'Microsoft Zira',lang:'en-US'},{name:'Google US English',lang:'en-US'},{name:'Google UK English Female',lang:'en-GB'},{name:'Alex',lang:'en-US'},{name:'Samantha',lang:'en-US'}],
        'fr': [{name:'Thomas',lang:'fr-FR'},{name:'Amelie',lang:'fr-FR'}],
        'de': [{name:'Anna',lang:'de-DE'},{name:'Hans',lang:'de-DE'}],
        'es': [{name:'Monica',lang:'es-ES'},{name:'Jorge',lang:'es-ES'}],
        'ja': [{name:'Kyoko',lang:'ja-JP'},{name:'Otoya',lang:'ja-JP'}],
        'zh': [{name:'Ting-Ting',lang:'zh-CN'}],
        'ko': [{name:'Yuna',lang:'ko-KR'}],
        'ru': [{name:'Milena',lang:'ru-RU'},{name:'Yuri',lang:'ru-RU'}],
        'it': [{name:'Alice',lang:'it-IT'},{name:'Luca',lang:'it-IT'}]
      };

      const voicePool = voiceNames[base] || voiceNames['en'];
      const count = Math.min(this.rng.nextInt(3, 6), voicePool.length);
      this.voices = voicePool.slice(0, count).map((v, i) => ({
        ...v, localService: true, default: i === 0, voiceURI: v.name
      }));

      // MediaDevices (consistent with real hardware)
      const audioInCount = this.rng.nextInt(1, 2);
      const videoInCount = this.mobile ? 2 : 1; // Mobile has front + back camera
      this.mediaDevices = [];
      for (let i = 0; i < audioInCount; i++) {
        this.mediaDevices.push({ deviceId: this.rng.generateHex(64), kind: 'audioinput', label: '', groupId: this.rng.generateHex(64) });
      }
      for (let i = 0; i < videoInCount; i++) {
        this.mediaDevices.push({ deviceId: this.rng.generateHex(64), kind: 'videoinput', label: '', groupId: this.rng.generateHex(64) });
      }
      this.mediaDevices.push({ deviceId: 'default', kind: 'audiooutput', label: '', groupId: this.rng.generateHex(64) });

      // Storage
      this.storageQuota = this.rng.nextInt(50, 300) * 1024 * 1024 * 1024;
      this.storageUsage = this.rng.nextInt(5, 500) * 1024 * 1024;
    }

    // ─── Phase 12: Client Hints ───────────────────────────────────────────
    buildClientHints() {
      if (this.browser !== 'Chrome' && this.browser !== 'Edge') {
        this.clientHints = null;
        return;
      }

      const major = this.browserVersion.split('.')[0];
      const brandName = this.browser === 'Edge' ? 'Microsoft Edge' : 'Google Chrome';

      // CreepJS checks brand ordering and "Not_A Brand" version format
      const notABrandVersion = this.rng.pick(['8', '24', '99']);
      const brands = [
        { brand: `Not_A Brand`, version: notABrandVersion },
        { brand: 'Chromium', version: major },
        { brand: brandName, version: major }
      ];

      let platformVersion;
      if (this.os === 'Windows') {
        // Windows 10 = 10.0.0, Windows 11 = 15.0.0+ (CreepJS checks this mapping)
        platformVersion = this.osVersion === '11.0' ? `${this.rng.nextInt(13, 15)}.0.0` : '10.0.0';
      } else if (this.os === 'macOS') {
        platformVersion = this.osVersion + '.0';
      } else if (this.os === 'Android') {
        platformVersion = this.osVersion + '.0.0';
      } else {
        platformVersion = this.osVersion;
      }

      this.clientHints = {
        brands,
        fullVersionList: brands.map(b => ({ brand: b.brand, version: b.brand.includes('Not') ? `${notABrandVersion}.0.0.0` : this.browserVersion })),
        mobile: this.mobile,
        platform: this.os === 'macOS' ? 'macOS' : this.os,
        platformVersion,
        architecture: this.arch,
        bitness: this.bitness,
        model: this.model || '',
        wow64: false
      };
    }

    // ─── Phase 13: Cross-Validation (CreepJS/PixelScan checks) ───────────
    crossValidate() {
      // Rule 1: Touch consistency
      // If maxTouchPoints > 0, ontouchstart must exist, pointer must be coarse
      if (this.maxTouchPoints > 0 && !this.touchEnabled) {
        this.touchEnabled = true;
      }
      if (this.maxTouchPoints === 0 && this.touchEnabled) {
        this.touchEnabled = false;
      }

      // Rule 2: Mobile ↔ Screen size
      // Mobile screens should be < 768px width in portrait
      if (this.mobile && !this.tablet && this.screen.width > 480) {
        // This is fine for landscape, but primary should be portrait-valid
      }

      // Rule 3: macOS ↔ DPR must be 2 (Retina) for modern Macs
      if (this.os === 'macOS' && this.devicePixelRatio !== 2) {
        this.devicePixelRatio = 2;
      }

      // Rule 4: iOS ↔ Safari must have specific WebKit version
      if (this.os === 'iOS' && this.browser === 'Safari') {
        if (!this.userAgent.includes('605.1.15')) {
          // Fix UA to include correct WebKit version
          this.userAgent = this.userAgent.replace(/AppleWebKit\/[\d.]+/, 'AppleWebKit/605.1.15');
        }
      }

      // Rule 5: Firefox never has Client Hints
      if (this.browser === 'Firefox' && this.clientHints) {
        this.clientHints = null;
      }

      // Rule 6: Safari never has WebGL debug_renderer_info on iOS
      if (this.os === 'iOS' && this.browser === 'Safari') {
        this.gpuVendor = 'Apple Inc.';
        this.gpu = 'Apple GPU';
      }

      // Rule 7: navigator.platform consistency with UA
      if (this.os === 'Windows' && this.platform !== 'Win32') {
        this.platform = 'Win32';
      }

      // Rule 8: Chrome/Edge plugins MUST be exactly 5 (CreepJS flags this)
      if ((this.browser === 'Chrome' || this.browser === 'Edge') && this.plugins.length !== 5) {
        this.plugins = [...CHROMIUM_PLUGINS];
      }

      // Rule 9: Firefox has 0 plugins (CreepJS checks this)
      if (this.browser === 'Firefox' && this.plugins.length !== 0) {
        this.plugins = [];
      }

      // Rule 10: deviceMemory must be power-of-2 or standard value
      const validMemory = [0.25, 0.5, 1, 2, 4, 8, 16, 32];
      if (!validMemory.includes(this.deviceMemory)) {
        this.deviceMemory = this.rng.pick([4, 8, 16]);
      }

      // Rule 11: hardwareConcurrency must be even (almost always)
      if (this.hardwareConcurrency % 2 !== 0) {
        this.hardwareConcurrency += 1;
      }

      // Rule 12: colorDepth and pixelDepth must match
      this.screen.pixelDepth = this.screen.colorDepth;

      // Rule 13: availWidth should equal width (no vertical taskbar in modern OS)
      this.screen.availWidth = this.screen.width;

      // Rule 14: Viewport must be <= screen dimensions
      if (this.viewport.width > this.screen.width) this.viewport.width = this.screen.width;
      if (this.viewport.height > this.screen.height) this.viewport.height = this.screen.height;

      // Rule 15: outerHeight >= viewport height
      if (this.outerHeight < this.viewport.height) {
        this.outerHeight = this.viewport.height + this.rng.nextInt(60, 100);
      }

      // Rule 16: language[0] must equal navigator.language
      if (this.languages[0] !== this.language) {
        this.languages[0] = this.language;
      }

      // Rule 17: WebGL maxTextureSize must match GPU capability
      if (this.webglParams.maxTextureSize > this._gpuMaxTex) {
        this.webglParams.maxTextureSize = this._gpuMaxTex;
      }

      // Rule 18: Safari doesn't support SharedArrayBuffer feature detection
      // Rule 19: iOS Chrome still uses WebKit (not V8 directly visible)
      // Rule 20: Performance.memory only available in Chrome (not FF/Safari)
    }

    // ─── Validation Report ────────────────────────────────────────────────
    validate() {
      this.validationErrors = [];

      // Check UA contains correct browser token
      if (this.browser === 'Chrome' && !this.userAgent.includes('Chrome/')) {
        this.validationErrors.push('UA missing Chrome token');
      }
      if (this.browser === 'Firefox' && !this.userAgent.includes('Firefox/')) {
        this.validationErrors.push('UA missing Firefox token');
      }
      if (this.browser === 'Safari' && !this.userAgent.includes('Safari/')) {
        this.validationErrors.push('UA missing Safari token');
      }

      // Check platform matches OS
      const platformChecks = { 'Windows': 'Win32', 'macOS': 'MacIntel', 'Linux': 'Linux' };
      if (platformChecks[this.os] && !this.platform.includes(platformChecks[this.os].substring(0, 3))) {
        this.validationErrors.push(`Platform "${this.platform}" doesn't match OS "${this.os}"`);
      }

      return this.validationErrors.length === 0;
    }

    // ─── Export ───────────────────────────────────────────────────────────
    toJSON() {
      return {
        os: this.os, osVersion: this.osVersion, browser: this.browser,
        browserVersion: this.browserVersion, platform: this.platform,
        vendor: this.vendor, vendorSub: this.vendorSub, product: this.product,
        productSub: this.productSub, userAgent: this.userAgent,
        appName: this.appName, appVersion: this.appVersion,
        oscpu: this.oscpu,
        screen: this.screen, devicePixelRatio: this.devicePixelRatio,
        viewport: this.viewport, outerWidth: this.outerWidth, outerHeight: this.outerHeight,
        orientation: this.orientation, gpu: this.gpu, gpuVendor: this.gpuVendor,
        deviceMemory: this.deviceMemory, hardwareConcurrency: this.hardwareConcurrency,
        maxTouchPoints: this.maxTouchPoints, touchEnabled: this.touchEnabled,
        arch: this.arch, bitness: this.bitness, mobile: this.mobile, tablet: this.tablet,
        model: this.model,
        language: this.language, languages: this.languages, timezone: this.timezone,
        timezoneOffset: this.timezoneOffset, doNotTrack: this.doNotTrack,
        connection: this.connection, battery: this.battery,
        historyLength: this.historyLength,
        prefersColorScheme: this.prefersColorScheme,
        prefersReducedMotion: this.prefersReducedMotion,
        forcedColors: this.forcedColors, prefersContrast: this.prefersContrast,
        colorGamut: this.colorGamut, dynamicRange: this.dynamicRange,
        webglParams: this.webglParams, webglExtensions: this.webglExtensions,
        audioParams: this.audioParams,
        fonts: this.fonts, plugins: this.plugins,
        pdfViewerEnabled: this.pdfViewerEnabled, buildID: this.buildID,
        clientHints: this.clientHints, voices: this.voices,
        storageQuota: this.storageQuota, storageUsage: this.storageUsage,
        mediaDevices: this.mediaDevices
      };
    }
  }

  return { FingerprintProfile, GPU_DATABASE, FONT_DATABASE, AUDIO_PARAMS };
})();
