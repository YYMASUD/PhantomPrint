// PhantomPrint v4.0 — Background Service Worker
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
    events: true
  },
  seed: Date.now(),
  noiseLevel: 'medium',
  whitelist: [],
  perSiteProfiles: {},
  autoRotate: false,
  autoRotateInterval: 30, // minutes
  lastRandomized: null,
  profilePreset: 'random',
  debugMode: false
};

// ═══════════════════════════════════════════════════════════════
// DEVICE PROFILES (embedded subset for background context)
// ═══════════════════════════════════════════════════════════════
const PROFILES = [
  {
    id: 'win_chrome_rtx3060_1080p', os: 'Windows', platform: 'Win32',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    appVersion: '5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    vendor: 'Google Inc.', hardwareConcurrency: 12, deviceMemory: 16,
    languages: ['en-US', 'en'], language: 'en-US', maxTouchPoints: 0,
    colorDepth: 24, pixelDepth: 24,
    screen: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040 },
    devicePixelRatio: 1,
    gpu: { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)', maxTextureSize: 16384, maxViewportDims: [32768, 32768], maxVertexAttribs: 16, maxVertexUniformVectors: 4096, maxVaryingVectors: 32, maxCombinedTextureImageUnits: 32, maxVertexTextureImageUnits: 16, maxTextureImageUnits: 16, maxFragmentUniformVectors: 1024, maxCubeMapTextureSize: 16384, maxRenderbufferSize: 16384, aliasedLineWidthRange: [1, 1], aliasedPointSizeRange: [1, 1024] },
    timezone: { offset: -300, zone: 'America/New_York' }, doNotTrack: null,
    connection: { effectiveType: '4g', rtt: 50, downlink: 10 },
    fonts: ['Arial', 'Arial Black', 'Calibri', 'Cambria', 'Comic Sans MS', 'Consolas', 'Courier New', 'Georgia', 'Impact', 'Lucida Console', 'Segoe UI', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana'],
    voiceCount: 5, mediaDevices: { audioinput: 1, videoinput: 1, audiooutput: 2 },
    battery: { charging: true, chargingTime: 0, dischargingTime: Infinity, level: 1.0 },
    audioParams: { baseLatency: 0.01, outputLatency: 0.01, sampleRate: 48000 }
  },
  {
    id: 'win_chrome_rtx4070_1440p', os: 'Windows', platform: 'Win32',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    appVersion: '5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    vendor: 'Google Inc.', hardwareConcurrency: 16, deviceMemory: 32,
    languages: ['en-US', 'en'], language: 'en-US', maxTouchPoints: 0,
    colorDepth: 24, pixelDepth: 24,
    screen: { width: 2560, height: 1440, availWidth: 2560, availHeight: 1400 },
    devicePixelRatio: 1,
    gpu: { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)', maxTextureSize: 16384, maxViewportDims: [32768, 32768], maxVertexAttribs: 16, maxVertexUniformVectors: 4096, maxVaryingVectors: 32, maxCombinedTextureImageUnits: 32, maxVertexTextureImageUnits: 16, maxTextureImageUnits: 16, maxFragmentUniformVectors: 1024, maxCubeMapTextureSize: 16384, maxRenderbufferSize: 16384, aliasedLineWidthRange: [1, 1], aliasedPointSizeRange: [1, 1024] },
    timezone: { offset: -360, zone: 'America/Chicago' }, doNotTrack: '1',
    connection: { effectiveType: '4g', rtt: 50, downlink: 10 },
    fonts: ['Arial', 'Arial Black', 'Calibri', 'Cambria', 'Comic Sans MS', 'Consolas', 'Courier New', 'Georgia', 'Impact', 'Lucida Console', 'Segoe UI', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana'],
    voiceCount: 5, mediaDevices: { audioinput: 2, videoinput: 1, audiooutput: 3 },
    battery: { charging: true, chargingTime: 0, dischargingTime: Infinity, level: 1.0 },
    audioParams: { baseLatency: 0.01, outputLatency: 0.01, sampleRate: 48000 }
  },
  {
    id: 'win_chrome_uhd630_1080p', os: 'Windows', platform: 'Win32',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    appVersion: '5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    vendor: 'Google Inc.', hardwareConcurrency: 8, deviceMemory: 8,
    languages: ['en-US', 'en'], language: 'en-US', maxTouchPoints: 0,
    colorDepth: 24, pixelDepth: 24,
    screen: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040 },
    devicePixelRatio: 1,
    gpu: { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)', maxTextureSize: 16384, maxViewportDims: [16384, 16384], maxVertexAttribs: 16, maxVertexUniformVectors: 4096, maxVaryingVectors: 32, maxCombinedTextureImageUnits: 32, maxVertexTextureImageUnits: 16, maxTextureImageUnits: 16, maxFragmentUniformVectors: 1024, maxCubeMapTextureSize: 16384, maxRenderbufferSize: 16384, aliasedLineWidthRange: [1, 1], aliasedPointSizeRange: [1, 1024] },
    timezone: { offset: -300, zone: 'America/New_York' }, doNotTrack: null,
    connection: { effectiveType: '4g', rtt: 100, downlink: 5 },
    fonts: ['Arial', 'Calibri', 'Cambria', 'Comic Sans MS', 'Consolas', 'Courier New', 'Georgia', 'Impact', 'Segoe UI', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana'],
    voiceCount: 5, mediaDevices: { audioinput: 1, videoinput: 1, audiooutput: 1 },
    battery: { charging: false, chargingTime: Infinity, dischargingTime: 18000, level: 0.85 },
    audioParams: { baseLatency: 0.01, outputLatency: 0.02, sampleRate: 44100 }
  },
  {
    id: 'mac_chrome_m1_retina', os: 'macOS', platform: 'MacIntel',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    appVersion: '5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    vendor: 'Google Inc.', hardwareConcurrency: 8, deviceMemory: 8,
    languages: ['en-US', 'en'], language: 'en-US', maxTouchPoints: 0,
    colorDepth: 30, pixelDepth: 30,
    screen: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1055 },
    devicePixelRatio: 2,
    gpu: { vendor: 'Google Inc. (Apple)', renderer: 'ANGLE (Apple, Apple M1, OpenGL 4.1)', maxTextureSize: 16384, maxViewportDims: [16384, 16384], maxVertexAttribs: 16, maxVertexUniformVectors: 4096, maxVaryingVectors: 31, maxCombinedTextureImageUnits: 32, maxVertexTextureImageUnits: 16, maxTextureImageUnits: 16, maxFragmentUniformVectors: 1024, maxCubeMapTextureSize: 16384, maxRenderbufferSize: 16384, aliasedLineWidthRange: [1, 1], aliasedPointSizeRange: [1, 255] },
    timezone: { offset: -480, zone: 'America/Los_Angeles' }, doNotTrack: null,
    connection: { effectiveType: '4g', rtt: 50, downlink: 10 },
    fonts: ['Arial', 'Arial Black', 'Comic Sans MS', 'Courier New', 'Georgia', 'Helvetica', 'Helvetica Neue', 'Impact', 'Lucida Grande', 'Monaco', 'Palatino', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana'],
    voiceCount: 67, mediaDevices: { audioinput: 1, videoinput: 1, audiooutput: 1 },
    battery: { charging: false, chargingTime: Infinity, dischargingTime: 36000, level: 0.88 },
    audioParams: { baseLatency: 0.005, outputLatency: 0.005, sampleRate: 44100 }
  },
  {
    id: 'linux_chrome_mesa_intel', os: 'Linux', platform: 'Linux x86_64',
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    appVersion: '5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    vendor: 'Google Inc.', hardwareConcurrency: 8, deviceMemory: 8,
    languages: ['en-US', 'en'], language: 'en-US', maxTouchPoints: 0,
    colorDepth: 24, pixelDepth: 24,
    screen: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1053 },
    devicePixelRatio: 1,
    gpu: { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Mesa Intel(R) UHD Graphics 630 (CFL GT2), OpenGL 4.6)', maxTextureSize: 16384, maxViewportDims: [16384, 16384], maxVertexAttribs: 16, maxVertexUniformVectors: 4096, maxVaryingVectors: 32, maxCombinedTextureImageUnits: 32, maxVertexTextureImageUnits: 16, maxTextureImageUnits: 16, maxFragmentUniformVectors: 1024, maxCubeMapTextureSize: 16384, maxRenderbufferSize: 16384, aliasedLineWidthRange: [1, 7.375], aliasedPointSizeRange: [1, 255] },
    timezone: { offset: -300, zone: 'America/New_York' }, doNotTrack: 'unspecified',
    connection: { effectiveType: '4g', rtt: 50, downlink: 10 },
    fonts: ['Arial', 'Courier New', 'DejaVu Sans', 'DejaVu Serif', 'FreeMono', 'FreeSans', 'Liberation Mono', 'Liberation Sans', 'Liberation Serif', 'Noto Sans', 'Times New Roman', 'Ubuntu'],
    voiceCount: 0, mediaDevices: { audioinput: 1, videoinput: 0, audiooutput: 1 },
    battery: { charging: true, chargingTime: 0, dischargingTime: Infinity, level: 1.0 },
    audioParams: { baseLatency: 0.005, outputLatency: 0.005, sampleRate: 48000 }
  }
];

const PROFILE_CATEGORIES = {
  'Windows Desktop': p => p.os === 'Windows',
  'Mac Desktop': p => p.os === 'macOS',
  'Linux Desktop': p => p.os === 'Linux',
  'Random': () => true
};

// ═══════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    const profile = selectRandomProfile();
    const seed = Date.now();
    await chrome.storage.local.set({
      ...DEFAULT_STATE,
      fingerprintProfile: profile,
      seed: seed,
      lastRandomized: Date.now(),
      timezoneMode: 'auto'
    });
    // Auto-detect timezone from IP on first install
    try { await autoSyncIPTimezone(); } catch(e) {}
  } else if (details.reason === 'update') {
    const data = await chrome.storage.local.get(null);
    const merged = { ...DEFAULT_STATE, ...data };
    if (!merged.fingerprintProfile) {
      merged.fingerprintProfile = selectRandomProfile();
      merged.seed = Date.now();
      merged.lastRandomized = Date.now();
    }
    // Ensure timezoneMode exists
    if (!merged.timezoneMode) merged.timezoneMode = 'auto';
    await chrome.storage.local.set(merged);
  }
  await updateHeaderRules();
});

// ═══════════════════════════════════════════════════════════════
// PROFILE SELECTION
// ═══════════════════════════════════════════════════════════════
function selectRandomProfile(category) {
  let pool = PROFILES;
  if (category && PROFILE_CATEGORIES[category]) {
    pool = PROFILES.filter(PROFILE_CATEGORIES[category]);
    if (pool.length === 0) pool = PROFILES;
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

function generateNewProfile(preset) {
  const profile = selectRandomProfile(preset);
  // Deep clone to avoid mutations
  return JSON.parse(JSON.stringify(profile));
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

// Timezone offset map (IANA timezone → getTimezoneOffset value)
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
  // Try to compute from Intl (works in service worker context)
  try {
    const now = new Date();
    const utc = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
    const local = new Date(now.toLocaleString('en-US', { timeZone: tz }));
    return Math.round((utc - local) / 60000);
  } catch(e) {
    return 0;
  }
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
    // API 1: ipwho.is — no rate limit, HTTPS, works globally
    () => tryFetchIP('https://ipwho.is/', d => ({
      tz: d.timezone?.id, country: d.country_code, city: d.city, ip: d.ip,
      offset: d.timezone?.offset ? -d.timezone.offset/60 : undefined
    })),
    // API 2: ip-api.com — fast, reliable (HTTP only but works)
    () => tryFetchIP('http://ip-api.com/json/?fields=status,country,countryCode,city,timezone,query', d => ({
      tz: d.timezone, country: d.countryCode, city: d.city, ip: d.query
    })),
    // API 3: ipapi.co — HTTPS but rate-limited
    () => tryFetchIP('https://ipapi.co/json/', d => ({
      tz: d.timezone, country: d.country_code, city: d.city, ip: d.ip,
      utc_offset: d.utc_offset
    })),
    // API 4: worldtimeapi — timezone focused
    () => tryFetchIP('https://worldtimeapi.org/api/ip', d => ({
      tz: d.timezone, country: '', city: '', ip: d.client_ip,
      offset: d.utc_offset ? -(parseInt(d.utc_offset.substring(1,3))*60 + parseInt(d.utc_offset.substring(4,6))) * (d.utc_offset[0]==='+' ? 1 : -1) : undefined
    }))
  ];

  let result = null;
  for (const apiFn of apis) {
    try {
      result = await apiFn();
      if (result && result.tz) break;
    } catch(e) {
      continue; // Try next API
    }
  }

  if (!result || !result.tz) {
    // Ultimate fallback: use system timezone from Intl
    const sysTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    result = { tz: sysTz, country: '', city: '', ip: '' };
  }

  const offsetMin = result.offset !== undefined ? result.offset : getOffsetForTz(result.tz);
  const country = result.country || '';
  
  const ipLocation = {
    timezone: { zone: result.tz, offset: offsetMin },
    languages: LANG_MAP[country] || ['en-US','en'],
    country: country,
    city: result.city || '',
    ip: result.ip || ''
  };
  
  await chrome.storage.local.set({ ipLocation: ipLocation });
  return ipLocation;
}

// ═══════════════════════════════════════════════════════════════
// MESSAGE HANDLING
// ═══════════════════════════════════════════════════════════════
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch(err => {
    console.error('Message handling error:', err);
    sendResponse({ error: err.message });
  });
  return true; // Keep channel open for async response
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
      if (message.data.isEnabled !== undefined) {
        await updateHeaderRules();
      }
      return { success: true };
    }

    case 'resetState': {
      const profile = selectRandomProfile();
      const newState = {
        ...DEFAULT_STATE,
        fingerprintProfile: profile,
        seed: Date.now(),
        lastRandomized: Date.now()
      };
      await chrome.storage.local.set(newState);
      await updateHeaderRules();
      return { success: true, state: newState };
    }

    // ── Profile Randomization ──
    case 'randomizeAll':
    case 'applyNewProfile': {
      const preset = message.preset || 'Random';
      const newProfile = message.profile || generateNewProfile(preset);
      const newSeed = Date.now();

      await chrome.storage.local.set({
        fingerprintProfile: newProfile,
        seed: newSeed,
        lastRandomized: Date.now(),
        isEnabled: true
      });

      // Auto-sync IP timezone in background (don't block randomization)
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
      await chrome.storage.local.set({
        autoRotate: enabled,
        autoRotateInterval: interval
      });

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
          version: '4.0.0',
          exportDate: new Date().toISOString(),
          profile: exportData.fingerprintProfile,
          modules: exportData.modules,
          whitelist: exportData.whitelist,
          noiseLevel: exportData.noiseLevel,
          perSiteProfiles: exportData.perSiteProfiles
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
        updates.seed = Date.now();
        updates.lastRandomized = Date.now();
        await chrome.storage.local.set(updates);
        await updateHeaderRules();
        return { success: true };
      } catch (e) {
        return { success: false, error: 'Invalid import data' };
      }
    }

    // ── Fingerprint Test ──
    case 'openTestSite': {
      const testUrls = {
        browserleaks: 'https://browserleaks.com/canvas',
        amiunique: 'https://amiunique.org/fingerprint',
        coveryourtracks: 'https://coveryourtracks.eff.org/'
      };
      const url = testUrls[message.site] || message.url || testUrls.browserleaks;
      chrome.tabs.create({ url });
      return { success: true };
    }

    // ── Inject into main world (fallback for CSP-restricted pages) ──
    case 'injectMainWorld': {
      const tabId = message.tabId || (sender && sender.tab && sender.tab.id);
      if (tabId) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tabId },
            world: 'MAIN',
            files: ['inject/inject.js']
          });
        } catch (e) {
          // May fail on protected pages
        }
      }
      return { success: true };
    }

    // ── Debug Mode ──
    case 'setDebugMode': {
      await chrome.storage.local.set({ debugMode: message.enabled });
      return { success: true };
    }
    // ── Timezone auto-detect from IP (uses multi-API fallback) ──
    case 'autoDetectTimezone': {
      try {
        const ipLocation = await autoSyncIPTimezone();
        if (ipLocation) {
          await chrome.storage.local.set({
            ipLocation: ipLocation,
            customTimezone: ipLocation.timezone,
            timezoneMode: 'ip'
          });
          return { success: true, ipLocation: ipLocation };
        }
        return { success: false, error: 'All IP APIs failed' };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }

    case 'setTimezoneMode': {
      await chrome.storage.local.set({ timezoneMode: message.mode });
      if (message.timezone) {
        await chrome.storage.local.set({ customTimezone: message.timezone });
      }
      return { success: true };
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
      } catch (e) {}
    }
  } catch (e) {}
}

// ═══════════════════════════════════════════════════════════════
// HEADER MODIFICATION via declarativeNetRequest
// ═══════════════════════════════════════════════════════════════
async function updateHeaderRules() {
  try {
    const data = await chrome.storage.local.get(['isEnabled', 'fingerprintProfile']);

    // Remove existing rules
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const existingIds = existingRules.map(r => r.id);
    if (existingIds.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: existingIds });
    }

    if (!data.isEnabled || !data.fingerprintProfile) return;

    const profile = data.fingerprintProfile;
    const rules = [];
    let ruleId = 1;

    // Rule 1: Override User-Agent header
    if (profile.userAgent) {
      rules.push({
        id: ruleId++,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          requestHeaders: [
            { header: 'User-Agent', operation: 'set', value: profile.userAgent }
          ]
        },
        condition: {
          urlFilter: '*',
          resourceTypes: ['main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font', 'object', 'xmlhttprequest', 'ping', 'media', 'websocket', 'other']
        }
      });
    }

    // Rule 2: Override Accept-Language header
    if (profile.languages && profile.languages.length > 0) {
      const acceptLang = profile.languages.map((lang, i) => {
        if (i === 0) return lang;
        const q = Math.max(0.1, 1 - i * 0.1).toFixed(1);
        return `${lang};q=${q}`;
      }).join(',');

      rules.push({
        id: ruleId++,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          requestHeaders: [
            { header: 'Accept-Language', operation: 'set', value: acceptLang }
          ]
        },
        condition: {
          urlFilter: '*',
          resourceTypes: ['main_frame', 'sub_frame', 'xmlhttprequest']
        }
      });
    }

    // Rule 3: Client Hints headers
    if (profile.userAgent) {
      const chromeMatch = profile.userAgent.match(/Chrome\/(\d+)/);
      const chromeVersion = chromeMatch ? chromeMatch[1] : '125';
      const platformMap = {
        'Win32': 'Windows',
        'MacIntel': 'macOS',
        'Linux x86_64': 'Linux',
        'Linux armv8l': 'Android',
        'iPhone': 'iOS'
      };
      const platformName = platformMap[profile.platform] || 'Windows';
      const isMobile = profile.maxTouchPoints > 0 && (profile.platform === 'Linux armv8l' || profile.platform === 'iPhone');

      rules.push({
        id: ruleId++,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          requestHeaders: [
            { header: 'Sec-CH-UA', operation: 'set', value: `"Chromium";v="${chromeVersion}", "Google Chrome";v="${chromeVersion}", "Not-A.Brand";v="99"` },
            { header: 'Sec-CH-UA-Mobile', operation: 'set', value: isMobile ? '?1' : '?0' },
            { header: 'Sec-CH-UA-Platform', operation: 'set', value: `"${platformName}"` }
          ]
        },
        condition: {
          urlFilter: '*',
          resourceTypes: ['main_frame', 'sub_frame', 'xmlhttprequest']
        }
      });
    }

    // Rule 4: DNT header
    if (profile.doNotTrack === '1') {
      rules.push({
        id: ruleId++,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          requestHeaders: [
            { header: 'DNT', operation: 'set', value: '1' },
            { header: 'Sec-GPC', operation: 'set', value: '1' }
          ]
        },
        condition: {
          urlFilter: '*',
          resourceTypes: ['main_frame', 'sub_frame', 'xmlhttprequest']
        }
      });
    }

    if (rules.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({ addRules: rules });
    }
  } catch (e) {
    console.error('Failed to update header rules:', e);
  }
}

// ═══════════════════════════════════════════════════════════════
// ALARMS — Auto-rotation
// ═══════════════════════════════════════════════════════════════
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'autoRotate') {
    const data = await chrome.storage.local.get(['autoRotate', 'isEnabled', 'profilePreset']);
    if (data.autoRotate && data.isEnabled) {
      const newProfile = generateNewProfile(data.profilePreset || 'Random');
      await chrome.storage.local.set({
        fingerprintProfile: newProfile,
        seed: Date.now(),
        lastRandomized: Date.now()
      });
      await updateHeaderRules();
      await notifyAllTabs({ action: 'applyFingerprint' });
    }
  }
});

// Restore alarms on service worker restart
chrome.storage.local.get(['autoRotate', 'autoRotateInterval'], (data) => {
  if (data.autoRotate) {
    chrome.alarms.create('autoRotate', {
      periodInMinutes: data.autoRotateInterval || 30
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// TAB NAVIGATION — Apply header rules on tab updates
// ═══════════════════════════════════════════════════════════════
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId === 0) {
    // Main frame navigation — header rules are already applied via DNR
    // No additional action needed
  }
});

// ═══════════════════════════════════════════════════════════════
// STARTUP — Ensure state is initialized
// ═══════════════════════════════════════════════════════════════
chrome.storage.local.get('isEnabled', (data) => {
  if (data.isEnabled === undefined) {
    // First run without install event — initialize
    const profile = selectRandomProfile();
    chrome.storage.local.set({
      ...DEFAULT_STATE,
      fingerprintProfile: profile,
      seed: Date.now(),
      lastRandomized: Date.now()
    });
  }
  updateHeaderRules();
});
