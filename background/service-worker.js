// PhantomPrint v5.0 — Background Service Worker
// Handles message routing, profile generation, alarms, header modification.
// All state is persisted in chrome.storage.local (service workers can terminate).
'use strict';

// ═══════════════════════════════════════════════════════════════
// DEFAULT STATE
// ═══════════════════════════════════════════════════════════════
const DEFAULT_STATE = {
  isEnabled: true,
  fingerprintProfile: null,
  modules: {
    navigator: true,
    screen: true,
    canvas: true,
    webgl: true,
    webgpu: true,
    audio: true,
    fonts: true,
    webrtc: true,
    rects: true,
    timezone: true,
    battery: true,
    speech: true,
    media: true,
    timing: true,
    storage: true,
    events: true,
    geolocation: true,
    permissions: true,
    keyboard: true
  },
  seed: Date.now(),
  noiseLevel: 'medium',
  whitelist: [],
  perSiteProfiles: {},
  autoRotate: false,
  autoRotateInterval: 30,
  lastRandomized: null,
  profilePreset: 'random',
  debugMode: false,
  trackerBlocker: {
    enabled: true,
    lists: {
      easyPrivacy: true,
      peterLowe: true,
      fingerprinting: true,
      sessionReplay: true,
      cryptominers: true,
      social: false
    }
  }
};

// ═══════════════════════════════════════════════════════════════
// BUILT-IN PROFILE DATABASE (fallback when ProfileGenerator unavailable)
// ═══════════════════════════════════════════════════════════════
const FALLBACK_PROFILES = [
  {
    id: 'win_chrome_rtx3060_1080p', os: 'Windows', platform: 'Win32', browser: 'Chrome',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
    appVersion: '5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
    vendor: 'Google Inc.', hardwareConcurrency: 12, deviceMemory: 16,
    languages: ['en-US', 'en'], language: 'en-US', maxTouchPoints: 0,
    colorDepth: 24, pixelDepth: 24, mobile: false,
    screen: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, colorDepth: 24, pixelDepth: 24 },
    devicePixelRatio: 1,
    gpu: { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)', maxTextureSize: 16384, maxViewportDims: [32768, 32768], maxVertexAttribs: 16, maxVertexUniformVectors: 4096, maxVaryingVectors: 32, maxCombinedTextureImageUnits: 32, maxVertexTextureImageUnits: 16, maxTextureImageUnits: 16, maxFragmentUniformVectors: 1024, maxCubeMapTextureSize: 16384, maxRenderbufferSize: 16384, aliasedLineWidthRange: [1, 1], aliasedPointSizeRange: [1, 1024] },
    timezone: { offset: -300, zone: 'America/New_York' }, doNotTrack: null,
    connection: { effectiveType: '4g', rtt: 50, downlink: 10 },
    fonts: ['Arial', 'Arial Black', 'Calibri', 'Cambria', 'Comic Sans MS', 'Consolas', 'Courier New', 'Georgia', 'Impact', 'Lucida Console', 'Segoe UI', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana'],
    voiceCount: 5, mediaDevices: { audioinput: 1, videoinput: 1, audiooutput: 2 },
    battery: { charging: true, chargingTime: 0, dischargingTime: Infinity, level: 1.0 },
    audioParams: { baseLatency: 0.01, outputLatency: 0.01, sampleRate: 48000 },
    prefersColorScheme: 'light', prefersReducedMotion: false, colorGamut: 'srgb',
    historyLength: 3, pdfViewerEnabled: true
  },
  {
    id: 'win_chrome_rtx4070_1440p', os: 'Windows', platform: 'Win32', browser: 'Chrome',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
    appVersion: '5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
    vendor: 'Google Inc.', hardwareConcurrency: 16, deviceMemory: 32,
    languages: ['en-US', 'en'], language: 'en-US', maxTouchPoints: 0,
    colorDepth: 24, pixelDepth: 24, mobile: false,
    screen: { width: 2560, height: 1440, availWidth: 2560, availHeight: 1400, colorDepth: 24, pixelDepth: 24 },
    devicePixelRatio: 1,
    gpu: { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)', maxTextureSize: 16384, maxViewportDims: [32768, 32768], maxVertexAttribs: 16, maxVertexUniformVectors: 4096, maxVaryingVectors: 32, maxCombinedTextureImageUnits: 32, maxVertexTextureImageUnits: 16, maxTextureImageUnits: 16, maxFragmentUniformVectors: 1024, maxCubeMapTextureSize: 16384, maxRenderbufferSize: 16384, aliasedLineWidthRange: [1, 1], aliasedPointSizeRange: [1, 1024] },
    timezone: { offset: -360, zone: 'America/Chicago' }, doNotTrack: '1',
    connection: { effectiveType: '4g', rtt: 50, downlink: 10 },
    fonts: ['Arial', 'Arial Black', 'Calibri', 'Cambria', 'Comic Sans MS', 'Consolas', 'Courier New', 'Georgia', 'Impact', 'Lucida Console', 'Segoe UI', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana'],
    voiceCount: 5, mediaDevices: { audioinput: 2, videoinput: 1, audiooutput: 3 },
    battery: { charging: true, chargingTime: 0, dischargingTime: Infinity, level: 1.0 },
    audioParams: { baseLatency: 0.01, outputLatency: 0.01, sampleRate: 48000 },
    prefersColorScheme: 'light', prefersReducedMotion: false, colorGamut: 'srgb',
    historyLength: 5, pdfViewerEnabled: true
  },
  {
    id: 'mac_chrome_m2_retina', os: 'macOS', platform: 'MacIntel', browser: 'Chrome',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
    appVersion: '5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
    vendor: 'Google Inc.', hardwareConcurrency: 8, deviceMemory: 8,
    languages: ['en-US', 'en'], language: 'en-US', maxTouchPoints: 0,
    colorDepth: 30, pixelDepth: 30, mobile: false,
    screen: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1055, colorDepth: 30, pixelDepth: 30 },
    devicePixelRatio: 2,
    gpu: { vendor: 'Google Inc. (Apple)', renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)', maxTextureSize: 16384, maxViewportDims: [16384, 16384], maxVertexAttribs: 16, maxVertexUniformVectors: 4096, maxVaryingVectors: 31, maxCombinedTextureImageUnits: 32, maxVertexTextureImageUnits: 16, maxTextureImageUnits: 16, maxFragmentUniformVectors: 1024, maxCubeMapTextureSize: 16384, maxRenderbufferSize: 16384, aliasedLineWidthRange: [1, 1], aliasedPointSizeRange: [1, 255] },
    timezone: { offset: -480, zone: 'America/Los_Angeles' }, doNotTrack: null,
    connection: { effectiveType: '4g', rtt: 50, downlink: 10 },
    fonts: ['Arial', 'Arial Black', 'Comic Sans MS', 'Courier New', 'Georgia', 'Helvetica', 'Helvetica Neue', 'Impact', 'Lucida Grande', 'Monaco', 'Palatino', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana'],
    voiceCount: 67, mediaDevices: { audioinput: 1, videoinput: 1, audiooutput: 1 },
    battery: { charging: false, chargingTime: Infinity, dischargingTime: 36000, level: 0.88 },
    audioParams: { baseLatency: 0.005, outputLatency: 0.005, sampleRate: 44100 },
    prefersColorScheme: 'dark', prefersReducedMotion: false, colorGamut: 'p3',
    historyLength: 2, pdfViewerEnabled: true
  },
  {
    id: 'linux_chrome_mesa_intel', os: 'Linux', platform: 'Linux x86_64', browser: 'Chrome',
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
    appVersion: '5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
    vendor: 'Google Inc.', hardwareConcurrency: 8, deviceMemory: 8,
    languages: ['en-US', 'en'], language: 'en-US', maxTouchPoints: 0,
    colorDepth: 24, pixelDepth: 24, mobile: false,
    screen: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1053, colorDepth: 24, pixelDepth: 24 },
    devicePixelRatio: 1,
    gpu: { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Mesa Intel(R) UHD Graphics 630 (CFL GT2), OpenGL 4.6)', maxTextureSize: 16384, maxViewportDims: [16384, 16384], maxVertexAttribs: 16, maxVertexUniformVectors: 4096, maxVaryingVectors: 32, maxCombinedTextureImageUnits: 32, maxVertexTextureImageUnits: 16, maxTextureImageUnits: 16, maxFragmentUniformVectors: 1024, maxCubeMapTextureSize: 16384, maxRenderbufferSize: 16384, aliasedLineWidthRange: [1, 7.375], aliasedPointSizeRange: [1, 255] },
    timezone: { offset: -300, zone: 'America/New_York' }, doNotTrack: 'unspecified',
    connection: { effectiveType: '4g', rtt: 50, downlink: 10 },
    fonts: ['Arial', 'Courier New', 'DejaVu Sans', 'DejaVu Serif', 'FreeMono', 'FreeSans', 'Liberation Mono', 'Liberation Sans', 'Liberation Serif', 'Noto Sans', 'Times New Roman', 'Ubuntu'],
    voiceCount: 0, mediaDevices: { audioinput: 1, videoinput: 0, audiooutput: 1 },
    battery: { charging: true, chargingTime: 0, dischargingTime: Infinity, level: 1.0 },
    audioParams: { baseLatency: 0.005, outputLatency: 0.005, sampleRate: 48000 },
    prefersColorScheme: 'light', prefersReducedMotion: false, colorGamut: 'srgb',
    historyLength: 1, pdfViewerEnabled: true
  },
  {
    id: 'android_chrome_pixel9', os: 'Android', platform: 'Linux armv8l', browser: 'Chrome',
    userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Mobile Safari/537.36',
    appVersion: '5.0 (Linux; Android 15; Pixel 9 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Mobile Safari/537.36',
    vendor: 'Google Inc.', hardwareConcurrency: 9, deviceMemory: 12,
    languages: ['en-US', 'en'], language: 'en-US', maxTouchPoints: 10,
    colorDepth: 32, pixelDepth: 32, mobile: true,
    screen: { width: 412, height: 915, availWidth: 412, availHeight: 875, colorDepth: 32, pixelDepth: 32 },
    devicePixelRatio: 2.625,
    gpu: { vendor: 'Qualcomm', renderer: 'Adreno (TM) 750', maxTextureSize: 16384, maxViewportDims: [16384, 16384], maxVertexAttribs: 16, maxVertexUniformVectors: 256, maxVaryingVectors: 15, maxCombinedTextureImageUnits: 32, maxVertexTextureImageUnits: 16, maxTextureImageUnits: 16, maxFragmentUniformVectors: 256, maxCubeMapTextureSize: 16384, maxRenderbufferSize: 16384, aliasedLineWidthRange: [1, 1], aliasedPointSizeRange: [1, 1024] },
    timezone: { offset: -300, zone: 'America/New_York' }, doNotTrack: null,
    connection: { effectiveType: '4g', rtt: 35, downlink: 30 },
    fonts: ['Roboto', 'Noto Sans', 'Droid Sans', 'Arial', 'Times New Roman'],
    voiceCount: 3, mediaDevices: { audioinput: 1, videoinput: 2, audiooutput: 1 },
    battery: { charging: false, chargingTime: Infinity, dischargingTime: 25200, level: 0.88 },
    audioParams: { baseLatency: 0.01, outputLatency: 0.02, sampleRate: 48000 },
    prefersColorScheme: 'light', prefersReducedMotion: false, colorGamut: 'srgb',
    historyLength: 4, pdfViewerEnabled: true
  }
];

// ═══════════════════════════════════════════════════════════════
// PROFILE GENERATION — Uses ProfileGenerator if available, else fallback
// ═══════════════════════════════════════════════════════════════
function selectRandomProfile(preset) {
  let pool = FALLBACK_PROFILES;
  if (preset) {
    const presetLower = preset.toLowerCase();
    if (presetLower === 'windows' || presetLower === 'windows desktop') {
      pool = FALLBACK_PROFILES.filter(p => p.os === 'Windows');
    } else if (presetLower === 'macos' || presetLower === 'mac desktop') {
      pool = FALLBACK_PROFILES.filter(p => p.os === 'macOS');
    } else if (presetLower === 'linux' || presetLower === 'linux desktop') {
      pool = FALLBACK_PROFILES.filter(p => p.os === 'Linux');
    } else if (presetLower === 'android') {
      pool = FALLBACK_PROFILES.filter(p => p.os === 'Android');
    } else if (presetLower === 'ios') {
      pool = FALLBACK_PROFILES.filter(p => p.os === 'iOS');
    } else if (presetLower === 'mobile') {
      pool = FALLBACK_PROFILES.filter(p => p.mobile);
    }
    if (pool.length === 0) pool = FALLBACK_PROFILES;
  }
  const chosen = pool[Math.floor(Math.random() * pool.length)];
  return JSON.parse(JSON.stringify(chosen));
}

function generateNewProfile(preset) {
  const profile = selectRandomProfile(preset);
  // Add noise seeds for canvas/webgl/audio
  profile.canvasNoiseSeed = Math.random().toString(16).slice(2, 18);
  profile.webglNoiseSeed = Math.random().toString(16).slice(2, 18);
  profile.audioNoiseSeed = Math.random().toString(16).slice(2, 18);
  profile._generatedAt = Date.now();
  return profile;
}

// ═══════════════════════════════════════════════════════════════
// TRACKER BLOCKER — Built-in domain lists
// ═══════════════════════════════════════════════════════════════
const TRACKER_DOMAINS = {
  easyPrivacy: [
    'google-analytics.com','googletagmanager.com','analytics.google.com',
    'stats.g.doubleclick.net','doubleclick.net','googleadservices.com',
    'googlesyndication.com','adservice.google.com',
    'facebook.net','connect.facebook.net','graph.facebook.com','pixel.facebook.com',
    'mixpanel.com','api.mixpanel.com','cdn.mxpnl.com',
    'segment.com','cdn.segment.com','api.segment.io',
    'amplitude.com','api2.amplitude.com','cdn.amplitude.com',
    'heap.io','heapanalytics.com','cdn.heapanalytics.com',
    'hotjar.com','static.hotjar.com','script.hotjar.com',
    'fullstory.com','rs.fullstory.com','edge.fullstory.com',
    'mouseflow.com','cdn.mouseflow.com',
    'logrocket.com','cdn.logrocket.io',
    'clarity.ms','c.clarity.ms',
    'smartlook.com','web-sdk.smartlook.com',
    'newrelic.com','bam.nr-data.net','js-agent.newrelic.com',
    'sentry.io','browser.sentry-cdn.com',
    'mc.yandex.ru','metrika.yandex.com'
  ],
  peterLowe: [
    'amazon-adsystem.com','aax.amazon-adsystem.com',
    'criteo.com','static.criteo.net','bidder.criteo.com',
    'appnexus.com','adnxs.com','ib.adnxs.com',
    'ads-twitter.com','analytics.twitter.com',
    'openx.net','openx.com','u.openx.net',
    'pubmatic.com','ads.pubmatic.com',
    'casalemedia.com','indexww.com',
    'rubiconproject.com','rlcdn.com',
    'quantserve.com','pixel.quantserve.com',
    'scorecardresearch.com','comscore.com',
    'taboola.com','trc.taboola.com','cdn.taboola.com',
    'outbrain.com','widgets.outbrain.com',
    'addthis.com','addthisedge.com',
    'sharethis.com','platform.sharethis.com',
    'moatads.com','mfadsrvr.com',
    'tradedoubler.com','awin1.com',
    'linksynergy.com','click.linksynergy.com'
  ],
  fingerprinting: [
    'fingerprintjs.com','api.fpjs.io','fpcdn.io',
    'iovation.com','iojs.net','ci-mpsnare.iojs.net',
    'threatmetrix.com','h.online-metrix.net',
    'signifyd.com','api.signifyd.com',
    'sardine.ai','api.sardine.ai','device.sardine.ai',
    'kount.com','cdn.kount.com',
    'sift.com','siftscience.com','device.siftscience.com',
    'castle.io','api.castle.io',
    'sessioncam.com','cdn.sessioncam.com'
  ],
  sessionReplay: [
    'hotjar.com','static.hotjar.com','script.hotjar.com',
    'fullstory.com','rs.fullstory.com',
    'mouseflow.com','cdn.mouseflow.com',
    'logrocket.com','cdn.logrocket.io',
    'smartlook.com','web-sdk.smartlook.com',
    'inspectlet.com','cdn.inspectlet.com',
    'glassbox.com','cdn.glassboxdigital.com',
    'contentsquare.net','tag.contentsquare.com',
    'sessionstack.com','c.sessionstack.com'
  ],
  cryptominers: [
    'coinhive.com','coin-hive.com','cnhv.co',
    'jsecoin.com','load.jsecoin.com',
    'cryptoloot.pro','minero.cc','webmr.io',
    'authedmine.com','monerominer.rocks',
    'coinimp.com','deepminer.io','miner.rocks'
  ],
  social: [
    'platform.twitter.com','syndication.twitter.com',
    'widgets.pinterest.com','assets.pinterest.com','ct.pinterest.com',
    'platform.linkedin.com','snap.licdn.com',
    'vk.com','userapi.com',
    'disqus.com','disquscdn.com',
    'static.addtoany.com','addtoany.com'
  ]
};

const TB_RULE_BASE = 5000;
const TB_RULE_MAX  = 5999;

async function applyTrackerBlockerRules() {
  try {
    const data = await chrome.storage.local.get(['trackerBlocker', 'isEnabled']);
    const tbConfig = data.trackerBlocker || DEFAULT_STATE.trackerBlocker;

    // Remove existing tracker rules
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    const tbIds = existing.filter(r => r.id >= TB_RULE_BASE && r.id <= TB_RULE_MAX).map(r => r.id);
    if (tbIds.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: tbIds });
    }

    if (!tbConfig.enabled || !data.isEnabled) return;

    const addRules = [];
    let ruleId = TB_RULE_BASE;
    const lists = tbConfig.lists || {};

    for (const [listName, domains] of Object.entries(TRACKER_DOMAINS)) {
      if (!lists[listName]) continue;
      for (const domain of domains) {
        if (ruleId > TB_RULE_MAX) break;
        addRules.push({
          id: ruleId++,
          priority: 1,
          action: { type: 'block' },
          condition: {
            requestDomains: [domain],
            resourceTypes: ['main_frame','sub_frame','xmlhttprequest','script','image','media','font','stylesheet','other','ping']
          }
        });
      }
    }

    if (addRules.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({ addRules });
    }
  } catch(e) {
    console.error('[PhantomPrint] TrackerBlocker error:', e);
  }
}

// ═══════════════════════════════════════════════════════════════
// AUTO IP TIMEZONE SYNC — Multiple fallback APIs
// ═══════════════════════════════════════════════════════════════
const LANG_MAP = {
  'US':['en-US','en'],'GB':['en-GB','en'],'CA':['en-CA','en','fr'],
  'AU':['en-AU','en'],'IN':['en-IN','hi','en'],'NZ':['en-NZ','en'],
  'CN':['zh-CN','zh','en'],'TW':['zh-TW','zh','en'],'HK':['zh-HK','zh','en'],
  'JP':['ja','en'],'KR':['ko','en'],
  'DE':['de-DE','de','en'],'FR':['fr-FR','fr','en'],'ES':['es-ES','es','en'],
  'IT':['it-IT','it','en'],'BR':['pt-BR','pt','en'],'RU':['ru','en'],
  'NL':['nl-NL','nl','en'],'PL':['pl','en'],'SE':['sv-SE','sv','en'],
  'TR':['tr','en'],'SA':['ar-SA','ar','en'],'TH':['th','en'],
  'VN':['vi','en'],'ID':['id','en'],'MX':['es-MX','es','en'],
  'AR':['es-AR','es','en'],'CO':['es-CO','es','en'],
  'AT':['de-AT','de','en'],'CH':['de-CH','de','fr','en'],
  'PT':['pt-PT','pt','en'],'BE':['nl-BE','nl','fr','en'],
  'UA':['uk','ru','en'],'DK':['da','en'],'FI':['fi','en'],
  'AE':['ar-AE','ar','en'],'EG':['ar-EG','ar','en'],'IL':['he','en'],
  'MY':['ms','en'],'PH':['fil','en'],'SG':['en-SG','zh','en'],
  'CZ':['cs','en'],'RO':['ro','en'],'HU':['hu','en'],'GR':['el','en']
};

const TZ_OFFSETS = {
  'Asia/Shanghai':-480,'Asia/Hong_Kong':-480,'Asia/Taipei':-480,
  'Asia/Tokyo':-540,'Asia/Seoul':-540,
  'Asia/Kolkata':-330,'Asia/Bangkok':-420,'Asia/Singapore':-480,
  'Asia/Dubai':-240,'Asia/Jerusalem':-120,
  'Europe/London':0,'Europe/Paris':-60,'Europe/Berlin':-60,
  'Europe/Moscow':-180,'Europe/Istanbul':-180,
  'America/New_York':300,'America/Chicago':360,'America/Denver':420,
  'America/Los_Angeles':480,'America/Sao_Paulo':180,
  'America/Buenos_Aires':180,'America/Mexico_City':360,
  'Australia/Sydney':-600,'Pacific/Auckland':-720,
  'Africa/Cairo':-120,'Africa/Lagos':-60
};

function getOffsetForTz(tz) {
  if (TZ_OFFSETS[tz] !== undefined) return TZ_OFFSETS[tz];
  try {
    const now = new Date();
    const utc = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
    const local = new Date(now.toLocaleString('en-US', { timeZone: tz }));
    return Math.round((utc - local) / 60000);
  } catch(e) { return 0; }
}

async function tryFetchIP(url, parser) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    return parser(data);
  } catch(e) {
    clearTimeout(timeout);
    throw e;
  }
}

async function autoSyncIPTimezone() {
  const apis = [
    () => tryFetchIP('https://ipwho.is/', d => ({
      tz: d.timezone?.id, country: d.country_code, city: d.city, ip: d.ip,
      offset: d.timezone?.offset ? -d.timezone.offset/60 : undefined
    })),
    () => tryFetchIP('http://ip-api.com/json/?fields=status,country,countryCode,city,timezone,query', d => ({
      tz: d.timezone, country: d.countryCode, city: d.city, ip: d.query
    })),
    () => tryFetchIP('https://ipapi.co/json/', d => ({
      tz: d.timezone, country: d.country_code, city: d.city, ip: d.ip
    })),
    () => tryFetchIP('https://worldtimeapi.org/api/ip', d => ({
      tz: d.timezone, country: '', city: '', ip: d.client_ip
    }))
  ];

  let result = null;
  for (const apiFn of apis) {
    try {
      result = await apiFn();
      if (result && result.tz) break;
    } catch(e) { continue; }
  }

  if (!result || !result.tz) {
    const sysTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    result = { tz: sysTz, country: '', city: '', ip: '' };
  }

  const offsetMin = result.offset !== undefined ? result.offset : getOffsetForTz(result.tz);
  const country = result.country || '';

  const ipLocation = {
    timezone: { zone: result.tz, offset: offsetMin },
    languages: LANG_MAP[country] || ['en-US','en'],
    country,
    city: result.city || '',
    ip: result.ip || ''
  };

  await chrome.storage.local.set({ ipLocation });
  return ipLocation;
}

// ═══════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    const profile = generateNewProfile('random');
    const seed = Date.now();
    await chrome.storage.local.set({
      ...DEFAULT_STATE,
      fingerprintProfile: profile,
      seed,
      lastRandomized: Date.now(),
      timezoneMode: 'auto'
    });
    try { await autoSyncIPTimezone(); } catch(e) {}
    // Show onboarding
    chrome.tabs.create({ url: chrome.runtime.getURL('onboarding/onboarding.html') });
  } else if (details.reason === 'update') {
    const data = await chrome.storage.local.get(null);
    const merged = { ...DEFAULT_STATE, ...data };
    if (!merged.fingerprintProfile) {
      merged.fingerprintProfile = generateNewProfile('random');
      merged.seed = Date.now();
      merged.lastRandomized = Date.now();
    }
    if (!merged.timezoneMode) merged.timezoneMode = 'auto';
    // Migrate old modules format — add new module keys
    if (merged.modules) {
      if (merged.modules.webgpu === undefined) merged.modules.webgpu = true;
      if (merged.modules.geolocation === undefined) merged.modules.geolocation = true;
      if (merged.modules.permissions === undefined) merged.modules.permissions = true;
      if (merged.modules.keyboard === undefined) merged.modules.keyboard = true;
    }
    await chrome.storage.local.set(merged);
  }
  await updateHeaderRules();
  await applyTrackerBlockerRules();
});

// ═══════════════════════════════════════════════════════════════
// MESSAGE HANDLING
// ═══════════════════════════════════════════════════════════════
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch(err => {
    console.error('[PhantomPrint] Message error:', err);
    sendResponse({ error: err.message });
  });
  return true;
});

async function handleMessage(message, sender) {
  switch (message.action) {

    // ── State Management ──
    case 'getState': {
      const data = await chrome.storage.local.get(null);
      return { ...DEFAULT_STATE, ...data };
    }

    case 'setState': {
      await chrome.storage.local.set(message.data);
      if (message.data.isEnabled !== undefined) await updateHeaderRules();
      return { success: true };
    }

    case 'resetState': {
      const profile = generateNewProfile('random');
      const newState = {
        ...DEFAULT_STATE,
        fingerprintProfile: profile,
        seed: Date.now(),
        lastRandomized: Date.now()
      };
      await chrome.storage.local.set(newState);
      await updateHeaderRules();
      await applyTrackerBlockerRules();
      return { success: true, state: newState };
    }

    // ── Profile Randomization ──
    case 'randomizeAll':
    case 'applyNewProfile': {
      const preset = message.preset || 'random';
      const newProfile = message.profile || generateNewProfile(preset);
      const newSeed = Date.now();

      await chrome.storage.local.set({
        fingerprintProfile: newProfile,
        seed: newSeed,
        lastRandomized: Date.now(),
        isEnabled: true
      });

      autoSyncIPTimezone().catch(() => {});
      await updateHeaderRules();
      await notifyAllTabs({ action: 'applyFingerprint' });

      return { success: true, profile: newProfile };
    }

    // ── Module Toggles ──
    case 'toggleModule': {
      const data = await chrome.storage.local.get('modules');
      const modules = data.modules || { ...DEFAULT_STATE.modules };
      modules[message.module] = message.enabled;
      await chrome.storage.local.set({ modules });
      return { success: true, modules };
    }

    case 'setModules': {
      await chrome.storage.local.set({ modules: message.modules });
      return { success: true };
    }

    // ── Master Toggle ──
    case 'toggleEnabled': {
      const enabled = message.enabled;
      await chrome.storage.local.set({ isEnabled: enabled });
      await updateHeaderRules();
      await applyTrackerBlockerRules();
      return { success: true, isEnabled: enabled };
    }

    // ── Whitelist ──
    case 'getWhitelist': {
      const wlData = await chrome.storage.local.get('whitelist');
      return { whitelist: wlData.whitelist || [] };
    }

    case 'addToWhitelist': {
      const wl1 = await chrome.storage.local.get('whitelist');
      const whitelist = wl1.whitelist || [];
      if (!whitelist.includes(message.domain)) {
        whitelist.push(message.domain);
        await chrome.storage.local.set({ whitelist });
      }
      return { success: true, whitelist };
    }

    case 'removeFromWhitelist': {
      const wl2 = await chrome.storage.local.get('whitelist');
      const wl = (wl2.whitelist || []).filter(d => d !== message.domain);
      await chrome.storage.local.set({ whitelist: wl });
      return { success: true, whitelist: wl };
    }

    // ── Auto-Rotate ──
    case 'setAutoRotate': {
      const enabled = message.enabled;
      const interval = message.interval || 30;
      await chrome.storage.local.set({ autoRotate: enabled, autoRotateInterval: interval });
      if (enabled) {
        chrome.alarms.create('autoRotate', { periodInMinutes: interval });
      } else {
        chrome.alarms.clear('autoRotate');
      }
      return { success: true };
    }

    // ── Noise Level ──
    case 'setNoiseLevel': {
      await chrome.storage.local.set({ noiseLevel: message.level });
      return { success: true };
    }

    // ── Profile Preset ──
    case 'setProfilePreset': {
      await chrome.storage.local.set({ profilePreset: message.preset });
      return { success: true };
    }

    // ── Per-Site Profile ──
    case 'setPerSiteProfile': {
      const psp = await chrome.storage.local.get('perSiteProfiles');
      const profiles = psp.perSiteProfiles || {};
      profiles[message.domain] = message.profile;
      await chrome.storage.local.set({ perSiteProfiles: profiles });
      return { success: true };
    }

    case 'removePerSiteProfile': {
      const psp2 = await chrome.storage.local.get('perSiteProfiles');
      const profs = psp2.perSiteProfiles || {};
      delete profs[message.domain];
      await chrome.storage.local.set({ perSiteProfiles: profs });
      return { success: true };
    }

    // ── Export/Import ──
    case 'exportProfile': {
      const exportData = await chrome.storage.local.get(null);
      return {
        success: true,
        data: JSON.stringify({
          version: '5.0.0',
          exportDate: new Date().toISOString(),
          profile: exportData.fingerprintProfile,
          modules: exportData.modules,
          whitelist: exportData.whitelist,
          noiseLevel: exportData.noiseLevel,
          perSiteProfiles: exportData.perSiteProfiles,
          trackerBlocker: exportData.trackerBlocker
        }, null, 2)
      };
    }

    case 'importProfile': {
      try {
        const imported = JSON.parse(message.data);
        const updates = {};
        if (imported.profile) updates.fingerprintProfile = imported.profile;
        if (imported.modules) updates.modules = imported.modules;
        if (imported.whitelist) updates.whitelist = imported.whitelist;
        if (imported.noiseLevel) updates.noiseLevel = imported.noiseLevel;
        if (imported.perSiteProfiles) updates.perSiteProfiles = imported.perSiteProfiles;
        if (imported.trackerBlocker) updates.trackerBlocker = imported.trackerBlocker;
        updates.seed = Date.now();
        updates.lastRandomized = Date.now();
        await chrome.storage.local.set(updates);
        await updateHeaderRules();
        await applyTrackerBlockerRules();
        return { success: true };
      } catch(e) {
        return { success: false, error: 'Invalid import data: ' + e.message };
      }
    }

    // ── Fingerprint Test ──
    case 'openTestSite': {
      const testUrls = {
        browserleaks: 'https://browserleaks.com/canvas',
        amiunique: 'https://amiunique.org/fingerprint',
        coveryourtracks: 'https://coveryourtracks.eff.org/',
        pixelscan: 'https://pixelscan.net/',
        creepjs: 'https://abrahamjuliot.github.io/creepjs/',
        fingerprintjs: 'https://fingerprintjs.github.io/fingerprintjs/'
      };
      const url = testUrls[message.site] || message.url || testUrls.browserleaks;
      chrome.tabs.create({ url });
      return { success: true };
    }

    // ── Inject into main world ──
    case 'injectMainWorld': {
      const tabId = message.tabId || (sender && sender.tab && sender.tab.id);
      if (tabId) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            files: ['inject/inject.js']
          });
        } catch(e) {}
      }
      return { success: true };
    }

    // ── Debug Mode ──
    case 'setDebugMode': {
      await chrome.storage.local.set({ debugMode: message.enabled });
      return { success: true };
    }

    // ── Timezone ──
    case 'autoDetectTimezone': {
      try {
        const ipLocation = await autoSyncIPTimezone();
        if (ipLocation) {
          await chrome.storage.local.set({
            ipLocation,
            customTimezone: ipLocation.timezone,
            timezoneMode: 'ip'
          });
          return { success: true, ipLocation };
        }
        return { success: false, error: 'All IP APIs failed' };
      } catch(e) {
        return { success: false, error: e.message };
      }
    }

    case 'setTimezoneMode': {
      await chrome.storage.local.set({ timezoneMode: message.mode });
      if (message.timezone) await chrome.storage.local.set({ customTimezone: message.timezone });
      return { success: true };
    }

    // ── Tracker Blocker ──
    case 'setTrackerBlocker': {
      const tbData = await chrome.storage.local.get('trackerBlocker');
      const tb = tbData.trackerBlocker || { ...DEFAULT_STATE.trackerBlocker };
      if (message.enabled !== undefined) tb.enabled = message.enabled;
      if (message.lists) tb.lists = { ...tb.lists, ...message.lists };
      await chrome.storage.local.set({ trackerBlocker: tb });
      await applyTrackerBlockerRules();
      return { success: true, trackerBlocker: tb };
    }

    case 'getTrackerBlocker': {
      const tbData2 = await chrome.storage.local.get('trackerBlocker');
      return { trackerBlocker: tbData2.trackerBlocker || DEFAULT_STATE.trackerBlocker };
    }

    // ── Proxy Manager ──
    case 'setProxy': {
      try {
        if (message.proxy) {
          const schemeMap = { 'http':'http','https':'https','socks4':'socks4','socks5':'socks5' };
          await chrome.proxy.settings.set({
            value: {
              mode: 'fixed_servers',
              rules: {
                singleProxy: {
                  scheme: schemeMap[message.proxy.protocol] || 'http',
                  host: message.proxy.host,
                  port: parseInt(message.proxy.port, 10)
                },
                bypassList: ['localhost','127.0.0.1','::1','<local>']
              }
            },
            scope: 'regular'
          });
          await chrome.storage.local.set({ activeProxy: message.proxy });
        } else {
          await chrome.proxy.settings.set({ value: { mode: 'direct' }, scope: 'regular' });
          await chrome.storage.local.set({ activeProxy: null });
        }
        return { success: true };
      } catch(e) {
        return { success: false, error: e.message };
      }
    }

    case 'getProxy': {
      const proxyData = await chrome.storage.local.get(['pp_proxies','activeProxy']);
      return { proxies: proxyData.pp_proxies || [], activeProxy: proxyData.activeProxy || null };
    }

    case 'saveProxies': {
      await chrome.storage.local.set({ pp_proxies: message.proxies });
      return { success: true };
    }

    // ── Fingerprint History ──
    case 'getHistory': {
      const histData = await chrome.storage.local.get('pp_history');
      return { history: histData.pp_history || [] };
    }

    case 'clearHistory': {
      await chrome.storage.local.set({ pp_history: [] });
      return { success: true };
    }

    // ── Profile Sessions ──
    case 'getSessions': {
      const sessData = await chrome.storage.local.get('pp_sessions');
      return { sessions: sessData.pp_sessions || [] };
    }

    case 'saveSession': {
      const sessData2 = await chrome.storage.local.get('pp_sessions');
      const sessions = sessData2.pp_sessions || [];
      const existing = sessions.findIndex(s => s.id === message.session.id);
      if (existing >= 0) {
        sessions[existing] = message.session;
      } else {
        sessions.push(message.session);
      }
      await chrome.storage.local.set({ pp_sessions: sessions });
      return { success: true, sessions };
    }

    case 'deleteSession': {
      const sessData3 = await chrome.storage.local.get('pp_sessions');
      const filtered = (sessData3.pp_sessions || []).filter(s => s.id !== message.sessionId);
      await chrome.storage.local.set({ pp_sessions: filtered });
      return { success: true };
    }

    case 'activateSession': {
      const sessData4 = await chrome.storage.local.get('pp_sessions');
      const sess = (sessData4.pp_sessions || []).find(s => s.id === message.sessionId);
      if (!sess) return { success: false, error: 'Session not found' };
      const updates = { activeSessionId: sess.id };
      if (sess.profile) { updates.fingerprintProfile = sess.profile; updates.seed = Date.now(); updates.lastRandomized = Date.now(); }
      if (sess.modules) updates.modules = sess.modules;
      if (sess.noiseLevel) updates.noiseLevel = sess.noiseLevel;
      await chrome.storage.local.set(updates);
      await updateHeaderRules();
      await notifyAllTabs({ action: 'applyFingerprint' });
      return { success: true, session: sess };
    }

    default:
      return { error: 'Unknown action: ' + message.action };
  }
}

// ═══════════════════════════════════════════════════════════════
// NOTIFY ALL TABS
// ═══════════════════════════════════════════════════════════════
async function notifyAllTabs(message) {
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      try {
        if (tab.id && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
          chrome.tabs.sendMessage(tab.id, message).catch(() => {});
        }
      } catch(e) {}
    }
  } catch(e) {}
}

// ═══════════════════════════════════════════════════════════════
// HEADER MODIFICATION via declarativeNetRequest
// ═══════════════════════════════════════════════════════════════
async function updateHeaderRules() {
  try {
    const data = await chrome.storage.local.get(['isEnabled', 'fingerprintProfile']);

    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    // Only remove header rules (IDs 1-99), not tracker rules (5000+)
    const headerIds = existingRules.filter(r => r.id < 100).map(r => r.id);
    if (headerIds.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: headerIds });
    }

    if (!data.isEnabled || !data.fingerprintProfile) return;

    const profile = data.fingerprintProfile;
    const rules = [];
    let ruleId = 1;

    // Rule 1: User-Agent
    if (profile.userAgent) {
      rules.push({
        id: ruleId++, priority: 1,
        action: { type: 'modifyHeaders', requestHeaders: [{ header: 'User-Agent', operation: 'set', value: profile.userAgent }] },
        condition: { urlFilter: '*', resourceTypes: ['main_frame','sub_frame','stylesheet','script','image','font','object','xmlhttprequest','ping','media','websocket','other'] }
      });
    }

    // Rule 2: Accept-Language
    if (profile.languages && profile.languages.length > 0) {
      const acceptLang = profile.languages.map((lang, i) => {
        if (i === 0) return lang;
        return `${lang};q=${Math.max(0.1, 1 - i * 0.1).toFixed(1)}`;
      }).join(',');
      rules.push({
        id: ruleId++, priority: 1,
        action: { type: 'modifyHeaders', requestHeaders: [{ header: 'Accept-Language', operation: 'set', value: acceptLang }] },
        condition: { urlFilter: '*', resourceTypes: ['main_frame','sub_frame','xmlhttprequest'] }
      });
    }

    // Rule 3: Client Hints
    if (profile.userAgent) {
      const chromeMatch = profile.userAgent.match(/Chrome\/(\d+)/);
      const chromeVersion = chromeMatch ? chromeMatch[1] : '136';
      const platformMap = { 'Win32':'Windows','MacIntel':'macOS','Linux x86_64':'Linux','Linux armv8l':'Android','iPhone':'iOS','iPad':'iOS' };
      const platformName = platformMap[profile.platform] || 'Windows';
      const isMobile = profile.mobile || false;

      rules.push({
        id: ruleId++, priority: 1,
        action: {
          type: 'modifyHeaders',
          requestHeaders: [
            { header: 'Sec-CH-UA', operation: 'set', value: `"Chromium";v="${chromeVersion}", "Google Chrome";v="${chromeVersion}", "Not-A.Brand";v="99"` },
            { header: 'Sec-CH-UA-Mobile', operation: 'set', value: isMobile ? '?1' : '?0' },
            { header: 'Sec-CH-UA-Platform', operation: 'set', value: `"${platformName}"` }
          ]
        },
        condition: { urlFilter: '*', resourceTypes: ['main_frame','sub_frame','xmlhttprequest'] }
      });
    }

    // Rule 4: DNT
    if (profile.doNotTrack === '1') {
      rules.push({
        id: ruleId++, priority: 1,
        action: { type: 'modifyHeaders', requestHeaders: [{ header: 'DNT', operation: 'set', value: '1' }, { header: 'Sec-GPC', operation: 'set', value: '1' }] },
        condition: { urlFilter: '*', resourceTypes: ['main_frame','sub_frame','xmlhttprequest'] }
      });
    }

    if (rules.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({ addRules: rules });
    }
  } catch(e) {
    console.error('[PhantomPrint] Header rules error:', e);
  }
}

// ═══════════════════════════════════════════════════════════════
// ALARMS — Auto-rotation + smart triggers
// ═══════════════════════════════════════════════════════════════
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'autoRotate') {
    const data = await chrome.storage.local.get(['autoRotate','isEnabled','profilePreset']);
    if (data.autoRotate && data.isEnabled) {
      const newProfile = generateNewProfile(data.profilePreset || 'random');
      await chrome.storage.local.set({ fingerprintProfile: newProfile, seed: Date.now(), lastRandomized: Date.now() });
      await updateHeaderRules();
      await notifyAllTabs({ action: 'applyFingerprint' });
      // Show notification
      try {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: 'PhantomPrint',
          message: 'Fingerprint auto-rotated to ' + (newProfile.os || 'new') + ' profile'
        });
      } catch(e) {}
    }
  }
});

// Restore alarms on service worker restart
chrome.storage.local.get(['autoRotate','autoRotateInterval'], (data) => {
  if (data.autoRotate) {
    chrome.alarms.create('autoRotate', { periodInMinutes: data.autoRotateInterval || 30 });
  }
});

// ═══════════════════════════════════════════════════════════════
// TAB EVENTS — Smart auto-rotate on new tab / domain change
// ═══════════════════════════════════════════════════════════════
chrome.tabs.onCreated.addListener(async (tab) => {
  const data = await chrome.storage.local.get(['autoRotate','autoRotateInterval','isEnabled','profilePreset','rotateOnNewTab']);
  if (data.rotateOnNewTab && data.isEnabled) {
    const newProfile = generateNewProfile(data.profilePreset || 'random');
    await chrome.storage.local.set({ fingerprintProfile: newProfile, seed: Date.now(), lastRandomized: Date.now() });
    await updateHeaderRules();
  }
});

// ═══════════════════════════════════════════════════════════════
// STARTUP — Ensure state is initialized
// ═══════════════════════════════════════════════════════════════
chrome.storage.local.get('isEnabled', (data) => {
  if (data.isEnabled === undefined) {
    const profile = generateNewProfile('random');
    chrome.storage.local.set({
      ...DEFAULT_STATE,
      fingerprintProfile: profile,
      seed: Date.now(),
      lastRandomized: Date.now()
    });
  }
  updateHeaderRules();
  applyTrackerBlockerRules();
});
