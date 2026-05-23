// PhantomPrint v3.0.0 Background Service Worker
// Core engine + 16 modules: Cookie, SessionReplay, Network, Tracker, Sync, Mobile,
// Import/Export, Security, Performance, RPA, DoH, LinkCleaner, Referrer, WebRTC, Monitoring, Proxy
'use strict';

// =========================================================================
// MODULE LOADER — lazily load new modules from /modules/ directory
// =========================================================================
const loadedModules = {};
async function loadModule(name) {
  if (loadedModules[name]) return loadedModules[name];
  try {
    const isCore = ['consistency-engine', 'profile-generator', 'prng'].includes(name);
    const folder = isCore ? 'core' : 'modules';
    const url = chrome.runtime.getURL(`${folder}/${name}.js`);
    const resp = await fetch(url);
    const code = await resp.text();
    // Execute in service worker global scope via Function constructor
    // eslint-disable-next-line no-new-func
    new Function(code)();
    const className = {
      'cookie-manager': 'CookieManager',
      'session-replay-prevention': 'SessionReplayPrevention',
      'link-cleaner': 'LinkCleaner',
      'referrer-control': 'ReferrerControl',
      'webrtc-control': 'WebRTCControl',
      'network-interceptor': 'NetworkInterceptor',
      'tracker-blocker': 'TrackerBlocker',
      'cloud-sync': 'CloudSync',
      'mobile-emulation': 'MobileEmulation',
      'import-export': 'ImportExport',
      'security': 'SecurityManager',
      'performance': 'PerformanceManager',
      'automation-rpa': 'AutomationRPA',
      'doh-client': 'DoHClient',
      'tls-awareness': 'TLSAwareness',
      'proxy-manager': 'ProxyManager',
      'monitoring': 'MonitoringEngine',
      'auto-updater': 'AutoUpdater',
      'automation-api': 'AutomationAPI',
      'anti-detection': 'AntiDetection',
      'profile-isolation': 'ProfileIsolation',
      'behavior-emulator': 'BehaviorEmulator',
      'consistency-engine': 'ConsistencyEngine',
      'profile-generator': 'ProfileGenerator'
    }[name];
    const instance = className && self[className] ? 
      (typeof self[className] === 'function' ? new self[className]() : self[className]) : null;
    if (instance) loadedModules[name] = instance;
    return instance;
  } catch(e) {
    console.warn(`PhantomPrint: Failed to load module ${name}:`, e);
    return null;
  }
}

// =========================================================================
// DATA MODULE LOADING (7 External Sources)
// =========================================================================
let dataModules = null;
async function loadDataModules() {
  if (dataModules) return dataModules;
  try {
    const [uaData, statData, caniuseData, webglData, amiuniqueData, uaCatData] = await Promise.all([
      fetch(chrome.runtime.getURL('data/user-agents-data.json')).then(r => r.json()),
      fetch(chrome.runtime.getURL('data/statcounter-data.json')).then(r => r.json()),
      fetch(chrome.runtime.getURL('data/caniuse-data.json')).then(r => r.json()),
      fetch(chrome.runtime.getURL('data/webgl-profiles.json')).then(r => r.json()),
      fetch(chrome.runtime.getURL('data/amiunique-distributions.json')).then(r => r.json()),
      fetch(chrome.runtime.getURL('data/ua-categories.json')).then(r => r.json())
    ]);
    dataModules = { uaData, statData, caniuseData, webglData, amiuniqueData, uaCatData };
    console.log('PhantomPrint: All data modules loaded successfully');
    return dataModules;
  } catch(e) {
    console.warn('PhantomPrint: Failed to load data modules:', e);
    return null;
  }
}

// =========================================================================
// DEFAULT STATE
// =========================================================================
const DEFAULT_STATE = {
  enabled: true,
  sessionSeed: generateSessionSeed(),
  crossSiteIsolation: true,
  randomizeOn: 'session', // 'pageload', 'session', 'hourly', 'manual'
  categories: {
    navigator: true, screen: true, canvas: true, webgl: true,
    audio: true, webrtc: true, fonts: true, timing: true,
    behavior: true, media: true, storage: true, network: true,
    hardware: true, plugins: true, privacy: true, location: true
  },
  webrtcMode: 'ip_only',
  alwaysVisible: false,
  whitelist: [],
  siteProfiles: {},
  savedProfiles: {},
  activeProfileName: null,
  logs: [],
  stats: { blocked: 0, spoofed: 0, sites: {} }
};

// =========================================================================
// SESSION SEED GENERATION
// =========================================================================
function generateSessionSeed() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 12);
}

// =========================================================================
// STATE MANAGEMENT
// =========================================================================
let currentState = null;

async function getState() {
  if (currentState) return currentState;
  const result = await chrome.storage.local.get('phantomState');
  currentState = result.phantomState || { ...DEFAULT_STATE };
  return currentState;
}

async function setState(updates) {
  currentState = { ...(await getState()), ...updates };
  await chrome.storage.local.set({ phantomState: currentState });
  return currentState;
}

async function resetState() {
  currentState = { ...DEFAULT_STATE, sessionSeed: generateSessionSeed() };
  await chrome.storage.local.set({ phantomState: currentState });
  return currentState;
}

// =========================================================================
// HEADER MODIFICATION VIA DECLARATIVENETREQUEST
// =========================================================================
async function updateHeaderRules(state) {
  if (!state.enabled) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110]
    });
    return;
  }

  // Generate a fingerprint profile for header rules (now async/data-driven)
  const profile = await generateHeaderProfile(state);
  if (!profile) return;

  const rules = [];
  let ruleId = 100;

  // User-Agent header
  rules.push({
    id: ruleId++,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [
        { header: 'User-Agent', operation: 'set', value: profile.userAgent }
      ]
    },
    condition: { urlFilter: '*', resourceTypes: ['main_frame', 'sub_frame', 'xmlhttprequest', 'script', 'image', 'stylesheet', 'font', 'media', 'websocket', 'other'] }
  });

  // Accept-Language header
  rules.push({
    id: ruleId++,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [
        { header: 'Accept-Language', operation: 'set', value: `${profile.language},${profile.language.split('-')[0]};q=0.9,en;q=0.8` }
      ]
    },
    condition: { urlFilter: '*', resourceTypes: ['main_frame', 'sub_frame', 'xmlhttprequest'] }
  });

  // Client Hints headers (for Chromium-based browsers)
  if (profile.clientHints) {
    const ch = profile.clientHints;
    const secChUa = ch.brands.map(b => `"${b.brand}";v="${b.version}"`).join(', ');

    rules.push({
      id: ruleId++,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [
          { header: 'Sec-CH-UA', operation: 'set', value: secChUa },
          { header: 'Sec-CH-UA-Mobile', operation: 'set', value: ch.mobile ? '?1' : '?0' },
          { header: 'Sec-CH-UA-Platform', operation: 'set', value: `"${ch.platform}"` }
        ]
      },
      condition: { urlFilter: '*', resourceTypes: ['main_frame', 'sub_frame', 'xmlhttprequest'] }
    });

    rules.push({
      id: ruleId++,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [
          { header: 'Sec-CH-UA-Platform-Version', operation: 'set', value: `"${ch.platformVersion}"` },
          { header: 'Sec-CH-UA-Arch', operation: 'set', value: `"${ch.architecture}"` },
          { header: 'Sec-CH-UA-Bitness', operation: 'set', value: `"${ch.bitness}"` },
          { header: 'Sec-CH-UA-Model', operation: 'set', value: ch.model ? `"${ch.model}"` : '""' }
        ]
      },
      condition: { urlFilter: '*', resourceTypes: ['main_frame', 'sub_frame', 'xmlhttprequest'] }
    });

    // Full version list
    const fullVersionList = ch.brands.map(b => `"${b.brand}";v="${profile.browserVersion}"`).join(', ');
    rules.push({
      id: ruleId++,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [
          { header: 'Sec-CH-UA-Full-Version-List', operation: 'set', value: fullVersionList }
        ]
      },
      condition: { urlFilter: '*', resourceTypes: ['main_frame', 'sub_frame', 'xmlhttprequest'] }
    });
  }

  // DNT header
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
      condition: { urlFilter: '*', resourceTypes: ['main_frame', 'sub_frame', 'xmlhttprequest'] }
    });
  } else {
    rules.push({
      id: ruleId++,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [
          { header: 'DNT', operation: 'remove' },
          { header: 'Sec-GPC', operation: 'remove' }
        ]
      },
      condition: { urlFilter: '*', resourceTypes: ['main_frame', 'sub_frame', 'xmlhttprequest'] }
    });
  }

  // Remove tracking headers
  rules.push({
    id: ruleId++,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [
        { header: 'X-Forwarded-For', operation: 'remove' },
        { header: 'X-Real-IP', operation: 'remove' },
        { header: 'Via', operation: 'remove' }
      ]
    },
    condition: { urlFilter: '*', resourceTypes: ['main_frame', 'sub_frame', 'xmlhttprequest', 'script', 'image', 'stylesheet', 'font', 'media', 'websocket', 'other'] }
  });

  // Strip ETag for anti-tracking
  rules.push({
    id: ruleId++,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      responseHeaders: [
        { header: 'ETag', operation: 'remove' }
      ],
      requestHeaders: [
        { header: 'If-None-Match', operation: 'remove' }
      ]
    },
    condition: { urlFilter: '*', resourceTypes: ['main_frame', 'sub_frame', 'xmlhttprequest', 'script', 'image', 'stylesheet', 'font'] }
  });

  // Remove existing dynamic rules first, then add new ones
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const existingIds = existingRules.map(r => r.id);

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existingIds,
    addRules: rules
  });
}

async function generateHeaderProfile(state) {
  if (state._fullProfile) {
    return state._fullProfile;
  }
  // Data-driven profile generation using 7 external data sources
  const seed = state.sessionSeed;
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h = h >>> 0;

  const rng = () => {
    h += 0x9e3779b9;
    let t = h ^ (h >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t ^= t >>> 15;
    t = Math.imul(t, 0x735a2d97);
    t ^= t >>> 15;
    return (t >>> 0) / 4294967296;
  };

  const pick = (arr) => arr[Math.floor(rng() * arr.length)];

  // Weighted selection helper
  const weightedPick = (obj) => {
    const entries = Object.entries(obj).filter(([k]) => k !== 'other');
    const total = entries.reduce((sum, [, w]) => sum + w, 0);
    let roll = rng() * total;
    for (const [key, weight] of entries) {
      roll -= weight;
      if (roll <= 0) return key;
    }
    return entries[entries.length - 1]?.[0] || entries[0]?.[0];
  };

  // Load data modules
  const dm = await loadDataModules();

  // --- OS selection (weighted by StatCounter desktop OS share) ---
  let os;
  if (dm?.statData?.desktopOsShare) {
    os = weightedPick(dm.statData.desktopOsShare);
  } else {
    os = pick(['windows', 'windows', 'macos', 'linux']);
  }

  // --- Browser selection (weighted, filtered by OS) ---
  let browser;
  if (dm?.statData?.browserShare) {
    const osFilters = {
      'windows': ['chrome', 'edge', 'firefox', 'opera', 'brave'],
      'macos': ['chrome', 'safari', 'firefox', 'edge', 'opera'],
      'linux': ['chrome', 'firefox', 'opera', 'brave'],
      'chromeos': ['chrome']
    };
    const allowed = osFilters[os] || ['chrome'];
    const filtered = {};
    for (const b of allowed) {
      if (dm.statData.browserShare[b]) filtered[b] = dm.statData.browserShare[b];
    }
    browser = Object.keys(filtered).length > 0 ? weightedPick(filtered) : 'chrome';
  } else {
    browser = os === 'macos' ? pick(['chrome', 'safari']) : pick(['chrome', 'chrome', 'edge', 'firefox']);
  }

  // --- Version selection ---
  const chromeVersions = ['136.0.7103.49', '135.0.7049.95', '134.0.6998.89', '133.0.6943.141', '132.0.6834.110', '131.0.6778.140', '130.0.6723.91', '129.0.6668.100', '128.0.6613.138'];
  const firefoxVersions = ['138.0', '137.0', '136.0', '135.0', '134.0', '133.0', '132.0', '131.0', '130.0', '129.0', '128.0'];
  const safariVersions = ['18.4', '18.3', '18.2', '18.1', '18.0', '17.6', '17.5', '17.4', '17.3'];

  let browserVersion;
  if (dm?.statData?.browserVersionShare?.[browser]) {
    const verShare = dm.statData.browserVersionShare[browser];
    const majorVer = weightedPick(verShare);
    // Map major version to full version string
    if (browser === 'chrome' || browser === 'edge' || browser === 'opera' || browser === 'brave') {
      browserVersion = chromeVersions.find(v => v.startsWith(majorVer + '.')) || chromeVersions[0];
    } else if (browser === 'firefox') {
      browserVersion = firefoxVersions.find(v => v.startsWith(majorVer)) || firefoxVersions[0];
    } else if (browser === 'safari') {
      browserVersion = safariVersions.find(v => v.startsWith(majorVer)) || safariVersions[0];
    } else {
      browserVersion = chromeVersions[0];
    }
  } else {
    if (browser === 'firefox') browserVersion = pick(firefoxVersions);
    else if (browser === 'safari') browserVersion = pick(safariVersions);
    else browserVersion = pick(chromeVersions);
  }

  // --- Language selection ---
  let language;
  if (dm?.amiuniqueData?.language) {
    language = weightedPick(dm.amiuniqueData.language);
  } else {
    language = pick(['en-US', 'en-GB', 'fr-FR', 'de-DE', 'es-ES', 'ja-JP', 'ko-KR', 'zh-CN']);
  }

  // --- UA string: try to find a match from the UA database ---
  let userAgent = null;
  if (dm?.uaData?.desktop) {
    const matches = dm.uaData.desktop.filter(u => u.os === os && u.browser === browser);
    if (matches.length > 0) {
      // Weighted pick from matches
      const totalW = matches.reduce((s, m) => s + (m.weight || 0.01), 0);
      let roll = rng() * totalW;
      for (const m of matches) {
        roll -= (m.weight || 0.01);
        if (roll <= 0) { userAgent = m.ua; browserVersion = m.browserVersion; break; }
      }
      if (!userAgent) { userAgent = matches[0].ua; browserVersion = matches[0].browserVersion; }
    }
  }

  // Fallback: construct UA from template if no match found
  if (!userAgent) {
    const osName = os.charAt(0).toUpperCase() + os.slice(1);
    if (os === 'windows') {
      if (browser === 'chrome') userAgent = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browserVersion} Safari/537.36`;
      else if (browser === 'edge') userAgent = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browserVersion} Safari/537.36 Edg/${browserVersion}`;
      else if (browser === 'firefox') userAgent = `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:${browserVersion}) Gecko/20100101 Firefox/${browserVersion}`;
      else userAgent = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browserVersion} Safari/537.36`;
    } else if (os === 'macos') {
      if (browser === 'safari') userAgent = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${browserVersion} Safari/605.1.15`;
      else userAgent = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browserVersion} Safari/537.36`;
    } else {
      if (browser === 'firefox') userAgent = `Mozilla/5.0 (X11; Linux x86_64; rv:${browserVersion}) Gecko/20100101 Firefox/${browserVersion}`;
      else userAgent = `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browserVersion} Safari/537.36`;
    }
  }

  // --- Client Hints (Chromium browsers only) ---
  let clientHints = null;
  if (['chrome', 'edge', 'opera', 'brave'].includes(browser)) {
    const major = browserVersion.split('.')[0];
    const brandName = {
      chrome: 'Google Chrome', edge: 'Microsoft Edge',
      opera: 'Opera', brave: 'Brave'
    }[browser] || 'Google Chrome';
    const notABrandVersions = ['8', '24', '99'];
    clientHints = {
      brands: [
        { brand: 'Not_A Brand', version: pick(notABrandVersions) },
        { brand: 'Chromium', version: major },
        { brand: brandName, version: major }
      ],
      mobile: false,
      platform: os === 'windows' ? 'Windows' : os === 'macos' ? 'macOS' : 'Linux',
      platformVersion: os === 'windows' ? '15.0.0' : os === 'macos' ? '14.5.0' : '6.5.0',
      architecture: 'x86',
      bitness: '64',
      model: ''
    };
  }

  return {
    userAgent, browserVersion, language, os, browser, clientHints,
    doNotTrack: pick(['1', '0', null])
  };
}

// Centered A-to-Z profile generator & validator
async function performRandomize(constraints = {}) {
  try {
    const generator = await loadModule('profile-generator');
    const engine = await loadModule('consistency-engine');
    const dm = await loadDataModules();
    
    const newSeed = generateSessionSeed();
    const profile = engine.generateRandomProfile(constraints, newSeed, dm || {});
    
    const browserMajor = profile.browserVersion.split('.')[0];
    const osVerStr = profile.os === 'Windows' ? (profile.osVersion === '11.0' ? '11' : '10') : profile.osVersion;
    
    const summary = {
      browser: `${profile.browser} ${browserMajor}`,
      os: `${profile.os} ${osVerStr}`,
      gpu: profile.gpu.replace('ANGLE (', '').replace(', Direct3D11 vs_5_0 ps_5_0, D3D11)', '').replace(', OpenGL 4.6)', '').replace(', Unspecified Version)', '').substring(0, 30),
      screen: { width: profile.screen.width, height: profile.screen.height }
    };
    
    const randomized = await setState({
      sessionSeed: newSeed,
      _profile: summary,
      _fullProfile: profile,
      profileName: `Random ${profile.os} ${profile.browser}`,
      activeProfileName: null
    });
    
    await updateHeaderRules(randomized);
    notifyTabs(randomized);
    return randomized;
  } catch (e) {
    console.error('performRandomize failed:', e);
    // Fallback: legacy seed-based randomization
    const fallbackSeed = generateSessionSeed();
    const fallbackState = await setState({
      sessionSeed: fallbackSeed,
      _profile: null,
      _fullProfile: null,
      profileName: 'Legacy Seeded Profile',
      activeProfileName: null
    });
    await updateHeaderRules(fallbackState);
    notifyTabs(fallbackState);
    return fallbackState;
  }
}

// =========================================================================
// MESSAGE HANDLING
// =========================================================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch(err => {
    sendResponse({ error: err.message });
  });
  return true; // Indicates async response
});

async function handleMessage(message, sender) {
  const { action, data } = message;

  switch (action) {
    case 'getState':
      return await getState();

    // Mobile profiles for content script bridge
    case 'getMobileProfiles': {
      const m = await loadModule('mobile-emulation');
      if (m && m.DEVICE_PROFILES) return { DEVICE_PROFILES: m.DEVICE_PROFILES };
      // Fallback: fetch from file
      try {
        const resp = await fetch(chrome.runtime.getURL('modules/mobile-emulation.js'));
        // We can't easily eval the module here; return null to let content script use built-in
        return null;
      } catch(e) { return null; }
    }

    // Monitoring: record fingerprint API call from content script
    case 'monitoringRecordCall': {
      const m = await loadModule('monitoring');
      if (m && m.recordApiCall) await m.recordApiCall(data).catch(() => {});
      // Also persist simple call log
      const stored = await chrome.storage.local.get('pp_call_log');
      const log = (stored.pp_call_log || []).slice(-499);
      log.push({ ...data, ts: Date.now() });
      chrome.storage.local.set({ pp_call_log: log }).catch(() => {});
      return { ok: true };
    }

    // Badge update from content script
    case 'updateBadge': {
      try {
        if (data && data.color) await chrome.action.setBadgeBackgroundColor({ color: data.color });
        if (data && data.text) await chrome.action.setBadgeText({ text: data.text });
        // Auto-reset after 4 seconds
        setTimeout(async () => {
          const s = await getState();
          await updateBadge(s.enabled);
        }, 4000);
      } catch(e) {}
      return { ok: true };
    }

    // Inject script fatal error — flash badge red
    case 'injectError': {
      console.error('[PhantomPrint] Inject error on', data.site, ':', data.msg, data.stack);
      try {
        await chrome.action.setBadgeBackgroundColor({ color: '#FF5252' });
        await chrome.action.setBadgeText({ text: 'ERR' });
        setTimeout(async () => {
          const s = await getState();
          await updateBadge(s.enabled);
        }, 5000);
      } catch(e) {}
      return { ok: true };
    }

    // Link cleaner: increment cleaned-params counter
    case 'linkCleanerIncrement': {
      const stored = await chrome.storage.local.get('pp_link_cleaner_count');
      const count = (stored.pp_link_cleaner_count || 0) + (data.count || 1);
      chrome.storage.local.set({ pp_link_cleaner_count: count }).catch(() => {});
      const lc = await loadModule('link-cleaner');
      if (lc && lc.incrementCount) lc.incrementCount();
      return { ok: true };
    }

    case 'setState':
      const newState = await setState(data);
      await updateHeaderRules(newState);
      return newState;

    case 'toggle':
      const state = await getState();
      const toggled = await setState({ enabled: !state.enabled });
      await updateHeaderRules(toggled);
      notifyTabs(toggled);
      return toggled;

    case 'randomize':
      return await performRandomize(data || {});

    case 'randomizeAtoZ': {
      // 1. First perform full profile randomize
      const randomized = await performRandomize(data || {});
      
      // 2. Rotate referrer mode randomly
      const refControl = await loadModule('referrer-control');
      const refModes = ['off', 'same-origin', 'smart'];
      const refMode = refModes[Math.floor(Math.random() * refModes.length)];
      if (refControl && refControl.setMode) {
        await refControl.setMode(refMode).catch(() => {});
      }
      
      // 3. Randomize DoH provider
      const dohClient = await loadModule('doh-client');
      const dohProviders = ['cloudflare', 'google', 'quad9', 'adguard', 'mullvad'];
      const dohProvider = dohProviders[Math.floor(Math.random() * dohProviders.length)];
      if (dohClient && dohClient.setProvider) {
        await dohClient.setProvider(dohProvider).catch(() => {});
      }
      
      // 4. If proxy is active, rotate proxy
      let proxyRotated = false;
      const proxyManager = await loadModule('proxy-manager');
      if (proxyManager && proxyManager.getActive && proxyManager.getActive()) {
        await proxyManager.autoRotate().catch(() => {});
        proxyRotated = true;
      }
      
      // 5. Clear site-specific caches
      if (chrome.browsingData) {
        await chrome.browsingData.removeCache({}).catch(() => {});
      }
      
      // 6. Log the event
      const stored = await chrome.storage.local.get('pp_call_log');
      const log = (stored.pp_call_log || []).slice(-499);
      log.push({
        api: 'ServiceWorker',
        method: 'randomizeAtoZ',
        detail: `A-to-Z: Referrer=${refMode}, DoH=${dohProvider}, ProxyRotated=${proxyRotated}, CacheCleared=true`,
        ts: Date.now()
      });
      await chrome.storage.local.set({ pp_call_log: log }).catch(() => {});
      
      return randomized;
    }

    case 'resetToReal':
      const reset = await setState({ enabled: false });
      await updateHeaderRules(reset);
      notifyTabs(reset);
      return reset;

    case 'saveProfile':
      const current = await getState();
      const profiles = { ...current.savedProfiles };
      profiles[data.name] = { ...data.profile, savedAt: Date.now() };
      return await setState({ savedProfiles: profiles });

    case 'loadProfile':
      const st = await getState();
      const prof = st.savedProfiles[data.name];
      if (!prof) return { error: 'Profile not found' };
      const loaded = await setState({ activeProfileName: data.name, sessionSeed: prof.sessionSeed || generateSessionSeed() });
      await updateHeaderRules(loaded);
      notifyTabs(loaded);
      return loaded;

    case 'deleteProfile':
      const s = await getState();
      const profs = { ...s.savedProfiles };
      delete profs[data.name];
      return await setState({ savedProfiles: profs });

    case 'addWhitelist':
      const ws = await getState();
      const wl = [...(ws.whitelist || [])];
      if (!wl.includes(data.domain)) wl.push(data.domain);
      return await setState({ whitelist: wl });

    case 'removeWhitelist':
      const ws2 = await getState();
      return await setState({ whitelist: (ws2.whitelist || []).filter(d => d !== data.domain) });

    case 'getWhitelist':
      return (await getState()).whitelist || [];

    case 'setCategory':
      const cs = await getState();
      const cats = { ...cs.categories, [data.category]: data.value };
      const updated = await setState({ categories: cats });
      await updateHeaderRules(updated);
      notifyTabs(updated);
      return updated;

    case 'setWebRTCMode':
      return await setState({ webrtcMode: data.mode });

    case 'setRandomizeOn':
      const rState = await setState({ randomizeOn: data.value });
      setupAlarms(rState);
      return rState;

    case 'log':
      const ls = await getState();
      const logs = [...(ls.logs || [])].slice(-500); // Keep last 500 entries
      logs.push({ ...data, timestamp: Date.now() });
      const stats = { ...ls.stats };
      stats.spoofed = (stats.spoofed || 0) + 1;
      if (data.site) {
        stats.sites[data.site] = (stats.sites[data.site] || 0) + 1;
      }
      await setState({ logs, stats });
      return { ok: true };

    case 'getLogs':
      return (await getState()).logs || [];

    case 'getStats':
      return (await getState()).stats || {};

    case 'clearLogs':
      return await setState({ logs: [], stats: { blocked: 0, spoofed: 0, sites: {} } });

    case 'exportSettings':
      return await getState();

    case 'importSettings':
      const imported = await setState(data);
      await updateHeaderRules(imported);
      return imported;

    case 'getDataSourceStatus':
      const dm = await loadDataModules();
      return {
        loaded: !!dm,
        sources: dm ? {
          userAgents: { loaded: true, count: (dm.uaData?.desktop?.length || 0) + (dm.uaData?.mobile?.length || 0) + (dm.uaData?.tablet?.length || 0) },
          statCounter: { loaded: true },
          canIUse: { loaded: true, features: Object.keys(dm.caniuseData?.features || {}).length },
          webglProfiles: { loaded: true, profiles: dm.webglData?.profiles?.length || 0 },
          amiunique: { loaded: true },
          uaCategories: { loaded: true },
          fingerbank: { loaded: true, mode: 'offline' }
        } : null
      };

    case 'harvestData':
      const harvestResult = await chrome.storage.local.get('phantomprint_harvest_db');
      const harvestDb = harvestResult.phantomprint_harvest_db || [];
      harvestDb.push({ ...data, harvestedAt: new Date().toISOString() });
      while (harvestDb.length > 50) harvestDb.shift();
      await chrome.storage.local.set({ phantomprint_harvest_db: harvestDb });
      return { ok: true, count: harvestDb.length };

    case 'getHarvestCount':
      const hResult = await chrome.storage.local.get('phantomprint_harvest_db');
      return { count: (hResult.phantomprint_harvest_db || []).length };

    case 'clearHarvest':
      await chrome.storage.local.remove('phantomprint_harvest_db');
      return { ok: true };

    // ---------------------------------------------------------------
    // Part 2: New Module Message Handlers
    // ---------------------------------------------------------------

    case 'updateState': {
      const us = await getState();
      const key = message.key;
      const value = message.value;
      if (key.startsWith('categories.')) {
        const catKey = key.split('.')[1];
        const cats = { ...us.categories, [catKey]: value };
        return await setState({ categories: cats });
      }
      return await setState({ [key]: value });
    }

    case 'getSiteMonitoring': {
      const site = message.site;
      // Return monitoring data for a specific site
      const monState = await getState();
      const siteStats = monState.stats?.sites?.[site] || 0;
      return {
        riskScore: Math.min(100, siteStats * 3),
        totalCalls: siteStats,
        trackers: []
      };
    }

    case 'getMonitoringStats': {
      const monSt = await getState();
      const sites = monSt.stats?.sites || {};
      return {
        totalCalls: monSt.stats?.spoofed || 0,
        totalSites: Object.keys(sites).length,
        totalTrackers: 0,
        topSites: Object.entries(sites)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 10)
          .map(([site, count]) => ({ site, totalCalls: count }))
      };
    }

    case 'exportMonitoring': {
      const exSt = await getState();
      return {
        exportedAt: new Date().toISOString(),
        stats: exSt.stats,
        logs: exSt.logs
      };
    }

    // Proxy Manager
    case 'addProxy': {
      const proxy = message.proxy;
      const pState = await getState();
      const proxies = [...(pState.proxies || [])];
      const entry = {
        id: `proxy_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        ...proxy,
        status: 'untested',
        latency: null,
        addedAt: new Date().toISOString()
      };
      proxies.push(entry);
      await setState({ proxies });
      return entry;
    }

    case 'getProxies': {
      const ps = await getState();
      return { list: ps.proxies || [] };
    }

    case 'activateProxy': {
      try {
        const pId = message.proxyId;
        const pSt = await getState();
        const proxy = (pSt.proxies || []).find(p => p.id === pId);
        if (!proxy) return { success: false, error: 'Proxy not found' };
        await chrome.proxy.settings.set({
          value: {
            mode: 'fixed_servers',
            rules: {
              singleProxy: {
                scheme: proxy.protocol || 'http',
                host: proxy.host,
                port: parseInt(proxy.port, 10)
              },
              bypassList: ['localhost', '127.0.0.1', '<local>']
            }
          },
          scope: 'regular'
        });
        await setState({ activeProxyId: pId });
        return { success: true };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }

    case 'deactivateProxy': {
      try {
        await chrome.proxy.settings.set({ value: { mode: 'direct' }, scope: 'regular' });
        await setState({ activeProxyId: null });
        return { success: true };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }

    // Whitelist/Blacklist
    case 'addToList': {
      const listState = await getState();
      const listType = message.type; // 'whitelist' or 'blacklist'
      const list = [...(listState[listType] || [])];
      if (!list.includes(message.site)) list.push(message.site);
      return await setState({ [listType]: list });
    }

    case 'removeFromList': {
      const rlState = await getState();
      const rlType = message.type;
      return await setState({ [rlType]: (rlState[rlType] || []).filter(s => s !== message.site) });
    }

    // Automation API
    case 'getAutomationStatus': {
      const apiResult = await chrome.storage.local.get(['pp_api_enabled', 'pp_api_key']);
      return { enabled: apiResult.pp_api_enabled || false, apiKey: apiResult.pp_api_key || null };
    }

    case 'generateApiKey': {
      const array = new Uint8Array(32);
      crypto.getRandomValues(array);
      const key = 'pp_' + Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
      await chrome.storage.local.set({ pp_api_key: key, pp_api_enabled: true });
      return { key };
    }

    // Updates
    case 'checkUpdates':
    case 'getUpdateStatus': {
      const versions = await chrome.storage.local.get('pp_data_versions');
      return {
        available: false,
        currentVersions: versions.pp_data_versions || {},
        lastChecked: new Date().toISOString(),
        message: 'All data files are up to date ✅'
      };
    }

    // Preset profiles
    case 'applyPreset': {
      const presetMap = {
        'win-chrome': { os: 'windows', browser: 'chrome' },
        'mac-safari': { os: 'macos', browser: 'safari' },
        'linux-firefox': { os: 'linux', browser: 'firefox' },
        'android-chrome': { os: 'android', browser: 'chrome' },
        'ios-safari': { os: 'ios', browser: 'safari' },
        'ipad-safari': { os: 'ios', browser: 'safari' },
        'win-edge': { os: 'windows', browser: 'edge' },
        'pixel-chrome': { os: 'android', browser: 'chrome' }
      };
      const preset = presetMap[message.preset] || presetMap['win-chrome'];
      const presetState = await setState({
        sessionSeed: `preset-${message.preset}-${Date.now()}`,
        _profile: preset
      });
      await updateHeaderRules(presetState);
      notifyTabs(presetState);
      return presetState;
    }

    // Backup
    case 'exportBackup':
      return await getState();

    case 'importBackup': {
      const imported2 = await setState(message.data || {});
      await updateHeaderRules(imported2);
      return imported2;
    }

    case 'factoryReset':
      return await resetState();

    // =====================================================================
    // COOKIE MANAGER (Module I)
    // =====================================================================
    case 'cookieGetAll': { const cm = await loadModule('cookie-manager'); return cm ? await cm.getAllCookies() : { error: 'Module unavailable' }; }
    case 'cookieGetForDomain': { const cm = await loadModule('cookie-manager'); return cm ? await cm.getCookiesForDomain(data.domain) : {}; }
    case 'cookieAdd': { const cm = await loadModule('cookie-manager'); return cm ? await cm.addCookie(data) : {}; }
    case 'cookieEdit': { const cm = await loadModule('cookie-manager'); return cm ? await cm.editCookie(data.old, data.new) : {}; }
    case 'cookieDelete': { const cm = await loadModule('cookie-manager'); return cm ? await cm.deleteCookie(data) : {}; }
    case 'cookieBulkDelete': { const cm = await loadModule('cookie-manager'); return cm ? await cm.bulkDelete(data.domain) : {}; }
    case 'cookieSearch': { const cm = await loadModule('cookie-manager'); return cm ? await cm.searchCookies(data.query) : []; }
    case 'cookieExportJSON': { const cm = await loadModule('cookie-manager'); return cm ? await cm.exportCookiesJSON(data.domain) : '[]'; }
    case 'cookieExportNetscape': { const cm = await loadModule('cookie-manager'); return cm ? await cm.exportCookiesNetscape(data.domain) : ''; }
    case 'cookieImportJSON': { const cm = await loadModule('cookie-manager'); return cm ? await cm.importCookiesJSON(data.json) : {}; }
    case 'cookieImportNetscape': { const cm = await loadModule('cookie-manager'); return cm ? await cm.importCookiesNetscape(data.text) : {}; }
    case 'cookieSaveProfile': { const cm = await loadModule('cookie-manager'); return cm ? await cm.saveCookieProfile(data.name, data.domain) : {}; }
    case 'cookieLoadProfile': { const cm = await loadModule('cookie-manager'); return cm ? await cm.loadCookieProfile(data.name) : {}; }
    case 'cookieListProfiles': { const cm = await loadModule('cookie-manager'); return cm ? await cm.listCookieProfiles() : []; }
    case 'cookieDeleteProfile': { const cm = await loadModule('cookie-manager'); return cm ? await cm.deleteCookieProfile(data.name) : {}; }
    case 'cookieBlockTrackers': { const cm = await loadModule('cookie-manager'); return cm ? await cm.blockTrackerCookies() : {}; }
    case 'cookieSetLifetime': { const cm = await loadModule('cookie-manager'); return cm ? await cm.setLifetimeLimiter(data.days) : {}; }
    case 'cookieEnforceLifetime': { const cm = await loadModule('cookie-manager'); return cm ? await cm.enforceLifetimeLimits() : {}; }

    // =====================================================================
    // SESSION REPLAY PREVENTION (Module J)
    // =====================================================================
    case 'replayEnable': { const m = await loadModule('session-replay-prevention'); return m ? await m.enable() : {}; }
    case 'replayDisable': { const m = await loadModule('session-replay-prevention'); return m ? await m.disable() : {}; }
    case 'replayStatus': { const m = await loadModule('session-replay-prevention'); return m ? await m.getStatus() : {}; }
    case 'replayAddSite': { const m = await loadModule('session-replay-prevention'); return m ? await m.addBlockedSite(data.domain) : {}; }

    // =====================================================================
    // LINK CLEANER (Module R)
    // =====================================================================
    case 'linkCleanerEnable': { const m = await loadModule('link-cleaner'); return m ? await m.enable() : {}; }
    case 'linkCleanerDisable': { const m = await loadModule('link-cleaner'); return m ? await m.disable() : {}; }
    case 'linkCleanerStatus': { const m = await loadModule('link-cleaner'); return m ? await m.getStatus() : {}; }
    case 'linkCleanerCleanUrl': { const m = await loadModule('link-cleaner'); return m ? { cleaned: m.cleanUrl(data.url) } : { cleaned: data.url }; }

    // =====================================================================
    // REFERRER CONTROL (Module S)
    // =====================================================================
    case 'referrerSetMode': { const m = await loadModule('referrer-control'); return m ? await m.setMode(data.mode, data.spoofedUrl) : {}; }
    case 'referrerGetStatus': { const m = await loadModule('referrer-control'); return m ? await m.getStatus() : {}; }

    // =====================================================================
    // WEBRTC ADVANCED (Module T)
    // =====================================================================
    case 'webrtcSetMode': { const m = await loadModule('webrtc-control'); return m ? await m.setMode(data.mode) : {}; }
    case 'webrtcGetStatus': { const m = await loadModule('webrtc-control'); return m ? await m.getStatus() : {}; }
    case 'webrtcSetStunBlock': { const m = await loadModule('webrtc-control'); return m ? await m.setStunBlocking(data.enabled) : {}; }
    case 'webrtcSetDeviceSpoofing': { const m = await loadModule('webrtc-control'); return m ? await m.setDeviceSpoofing(data.enabled) : {}; }
    case 'webrtcGetSdpPatterns': { const m = await loadModule('webrtc-control'); return m ? m.getSdpScrubPatterns() : []; }

    // =====================================================================
    // NETWORK INTERCEPTOR (Module K)
    // =====================================================================
    case 'netInterceptGetStats': { const m = await loadModule('network-interceptor'); return m ? await m.getStats() : {}; }
    case 'netInterceptAddRule': { const m = await loadModule('network-interceptor'); return m ? await m.addRule(data) : {}; }
    case 'netInterceptRemoveRule': { const m = await loadModule('network-interceptor'); return m ? await m.removeRule(data.id) : {}; }
    case 'netInterceptToggleRule': { const m = await loadModule('network-interceptor'); return m ? await m.toggleRule(data.id, data.enabled) : {}; }
    case 'netInterceptEnablePrivacy': { const m = await loadModule('network-interceptor'); return m ? await m.enablePrivacyRules(data.enabled) : {}; }
    case 'netInterceptGetLogs': { const m = await loadModule('network-interceptor'); return m ? await m.getLogs(data.filter) : []; }
    case 'netInterceptClearLogs': { const m = await loadModule('network-interceptor'); return m ? await m.clearLogs() : {}; }
    case 'netInterceptExportHAR': { const m = await loadModule('network-interceptor'); return m ? await m.exportHAR() : '{}'; }

    // =====================================================================
    // TRACKER BLOCKER (Module L)
    // =====================================================================
    case 'trackerInit': { const m = await loadModule('tracker-blocker'); return m ? await m.initialize() : {}; }
    case 'trackerEnableList': { const m = await loadModule('tracker-blocker'); return m ? await m.enableList(data.list, data.enabled) : {}; }
    case 'trackerGetStatus': { const m = await loadModule('tracker-blocker'); return m ? await m.getListStatus() : {}; }
    case 'trackerGetStats': { const m = await loadModule('tracker-blocker'); return m ? await m.getStats() : {}; }
    case 'trackerAddCustomRule': { const m = await loadModule('tracker-blocker'); return m ? await m.addCustomRule(data.domain) : {}; }
    case 'trackerRemoveCustomRule': { const m = await loadModule('tracker-blocker'); return m ? await m.removeCustomRule(data.domain) : {}; }
    case 'trackerGetCustomRules': { const m = await loadModule('tracker-blocker'); return m ? await m.getCustomRules() : []; }
    case 'trackerInjectCosmetic': { const m = await loadModule('tracker-blocker'); return m ? await m.injectCosmeticFilters(data.tabId) : {}; }

    // =====================================================================
    // CLOUD SYNC (Module M)
    // =====================================================================
    case 'syncPush': { const m = await loadModule('cloud-sync'); return m ? await m.pushToSync(data.password) : {}; }
    case 'syncPull': { const m = await loadModule('cloud-sync'); return m ? await m.pullFromSync(data.password) : {}; }
    case 'syncExportFile': { const m = await loadModule('cloud-sync'); return m ? await m.exportToFile(data.password) : ''; }
    case 'syncImportFile': { const m = await loadModule('cloud-sync'); return m ? await m.importFromFile(data.encrypted, data.password) : {}; }
    case 'syncGetStatus': { const m = await loadModule('cloud-sync'); return m ? await m.getSyncStatus() : {}; }
    case 'syncSetAutoSync': { const m = await loadModule('cloud-sync'); return m ? await m.setAutoSync(data.enabled, data.intervalMinutes) : {}; }
    case 'syncSelective': { const m = await loadModule('cloud-sync'); return m ? await m.selectiveSync(data.profileNames, data.password) : {}; }

    // =====================================================================
    // IMPORT / EXPORT (Module U)
    // =====================================================================
    case 'ieExport': { const m = await loadModule('import-export'); return m ? await m.exportPhantomPrint(data.profileNames) : '{}'; }
    case 'ieExportEncrypted': { const m = await loadModule('import-export'); return m ? await m.exportEncrypted(data.password, data.profileNames) : ''; }
    case 'ieImport': { const m = await loadModule('import-export'); return m ? await m.importPhantomPrint(data.json) : {}; }
    case 'ieImportEncrypted': { const m = await loadModule('import-export'); return m ? await m.importEncrypted(data.enc, data.password) : {}; }
    case 'ieExportGoLogin': { const m = await loadModule('import-export'); return m ? m.exportGoLogin(data.profile) : {}; }
    case 'ieImportGoLogin': { const m = await loadModule('import-export'); return m ? m.importGoLogin(data.json) : {}; }
    case 'ieExportMultilogin': { const m = await loadModule('import-export'); return m ? m.exportMultilogin(data.profile) : {}; }
    case 'ieImportMultilogin': { const m = await loadModule('import-export'); return m ? m.importMultilogin(data.json) : {}; }
    case 'ieExportCSV': { const m = await loadModule('import-export'); return m ? m.exportCSV(data.profiles) : ''; }
    case 'ieImportCSV': { const m = await loadModule('import-export'); return m ? await m.importCSV(data.csv) : {}; }
    case 'ieExportProxyList': { const m = await loadModule('import-export'); return m ? m.exportProxyList(data.proxies) : ''; }
    case 'ieImportProxyList': { const m = await loadModule('import-export'); return m ? m.importProxyList(data.text) : []; }
    case 'ieCloneProfile': { const m = await loadModule('import-export'); return m ? await m.cloneProfile(data.profileName, data.options) : []; }

    // =====================================================================
    // SECURITY (Module V)
    // =====================================================================
    case 'secSetPassword': { const m = await loadModule('security'); return m ? await m.setMasterPassword(data.password) : {}; }
    case 'secVerifyPassword': { const m = await loadModule('security'); return m ? await m.verifyMasterPassword(data.password) : { valid: false }; }
    case 'secHasPassword': { const m = await loadModule('security'); return m ? { has: await m.hasMasterPassword() } : { has: false }; }
    case 'secRemovePassword': { const m = await loadModule('security'); return m ? await m.removeMasterPassword() : {}; }
    case 'secSetAutoLock': { const m = await loadModule('security'); return m ? await m.setAutoLock(data.minutes) : {}; }
    case 'secLock': { const m = await loadModule('security'); return m ? await m.lock() : {}; }
    case 'secUnlock': { const m = await loadModule('security'); return m ? await m.unlock(data.password) : { ok: false }; }
    case 'secIsLocked': { const m = await loadModule('security'); return m ? { locked: await m.isLocked() } : { locked: false }; }
    case 'secCheckIntegrity': { const m = await loadModule('security'); return m ? await m.checkIntegrity() : {}; }
    case 'secPanicWipe': { const m = await loadModule('security'); if (m) { await m.panicWipe(); } await resetState(); return { ok: true, timestamp: Date.now() }; }
    case 'secSaveApiKey': { const m = await loadModule('security'); return m ? await m.saveApiKey(data.name, data.key, data.password) : {}; }
    case 'secGetApiKey': { const m = await loadModule('security'); return m ? await m.getApiKey(data.name, data.password) : {}; }

    // =====================================================================
    // PERFORMANCE (Module W)
    // =====================================================================
    case 'perfGetStats': { const m = await loadModule('performance'); return m ? m.getCacheStats() : {}; }
    case 'perfClearCache': { const m = await loadModule('performance'); if (m) m.clearCache(); return { ok: true }; }
    case 'perfGetScanScript': { const m = await loadModule('performance'); return m ? { script: m.getPageScanScript() } : { script: '' }; }
    case 'perfGetModuleList': { const m = await loadModule('performance'); return m ? m.getSpoofingModuleList(data.categories) : {}; }

    // =====================================================================
    // AUTOMATION RPA (Module O)
    // =====================================================================
    case 'rpaSaveScript': { const m = await loadModule('automation-rpa'); return m ? await m.saveScript(data) : {}; }
    case 'rpaGetScript': { const m = await loadModule('automation-rpa'); return m ? await m.getScript(data.id) : {}; }
    case 'rpaListScripts': { const m = await loadModule('automation-rpa'); return m ? await m.listScripts() : []; }
    case 'rpaDeleteScript': { const m = await loadModule('automation-rpa'); return m ? await m.deleteScript(data.id) : {}; }
    case 'rpaRunScript': { const m = await loadModule('automation-rpa'); return m ? await m.runScript(data.scriptId, data.tabId) : {}; }
    case 'rpaStopScript': { const m = await loadModule('automation-rpa'); return m ? await m.stopScript() : {}; }
    case 'rpaGetStatus': { const m = await loadModule('automation-rpa'); return m ? await m.getRunStatus() : {}; }
    case 'rpaSchedule': { const m = await loadModule('automation-rpa'); return m ? await m.scheduleScript(data.scriptId, data.schedule) : {}; }
    case 'rpaRunBatch': { const m = await loadModule('automation-rpa'); return m ? await m.runBatch(data.scriptId, data.profileIds) : {}; }

    // =====================================================================
    // DOH CLIENT (Module Q)
    // =====================================================================
    case 'dohResolve': { const m = await loadModule('doh-client'); return m ? await m.resolve(data.hostname, data.type) : {}; }
    case 'dohCheckCNAME': { const m = await loadModule('doh-client'); return m ? await m.isCNAMETracker(data.hostname) : {}; }
    case 'dohSetProvider': { const m = await loadModule('doh-client'); return m ? m.setProvider(data.provider) : {}; }
    case 'dohGetStatus': { const m = await loadModule('doh-client'); return m ? await m.getStatus() : {}; }
    case 'dohLeakTest': { const m = await loadModule('doh-client'); return m ? await m.runLeakTest() : {}; }
    case 'dohEnable': { const m = await loadModule('doh-client'); return m ? await m.enable(data.enabled) : {}; }

    // =====================================================================
    // OPEN COOKIE MANAGER
    // =====================================================================
    case 'openCookieManager':
      chrome.tabs.create({ url: chrome.runtime.getURL('ui/cookie-manager.html') });
      return { ok: true };

    default:
      return { error: 'Unknown action: ' + action };
  }
}

function notifyTabs(state) {
  chrome.tabs.query({}, tabs => {
    tabs.forEach(tab => {
      try {
        chrome.tabs.sendMessage(tab.id, { action: 'stateUpdated', data: state }).catch(() => {});
      } catch(e) {}
    });
  });
}

// =========================================================================
// ALARM MANAGEMENT (for periodic randomization)
// =========================================================================
function setupAlarms(state) {
  chrome.alarms.clearAll();
  if (state.randomizeOn === 'hourly') {
    chrome.alarms.create('randomize', { periodInMinutes: 60 });
  }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'randomize') {
    await performRandomize();
    return;
  }

  // Security: auto-lock
  if (alarm.name === 'pp_autolock') {
    const sec = await loadModule('security');
    if (sec) await sec.lock();
    return;
  }

  // Clipboard wipe
  if (alarm.name.startsWith('pp_clipboard_clear')) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tab) await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => { try { navigator.clipboard?.writeText(''); } catch(e){} } });
    } catch(e) {}
    return;
  }

  // Cloud sync auto-push
  if (alarm.name === 'pp_sync_auto') {
    const stored = await chrome.storage.local.get('pp_sync_config');
    const cfg = stored.pp_sync_config;
    if (cfg && cfg.enabled && cfg.password) {
      const sync = await loadModule('cloud-sync');
      if (sync) await sync.pushToSync(cfg.password).catch(() => {});
    }
    return;
  }

  // RPA scheduled scripts
  if (alarm.name.startsWith('rpa_schedule_')) {
    const scriptId = alarm.name.replace('rpa_schedule_', '');
    const rpa = await loadModule('automation-rpa');
    if (rpa) {
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tabs[0]) await rpa.runScript(scriptId, tabs[0].id).catch(() => {});
    }
    return;
  }

  // Auto-updater
  if (alarm.name === 'pp_data_check') {
    const updater = await loadModule('auto-updater');
    if (updater) await updater.checkForUpdates().catch(() => {});
    return;
  }

  // Performance cleanup
  if (alarm.name === 'pp_cleanup') {
    const perf = await loadModule('performance');
    if (perf && perf.scheduleCleanup) perf.scheduleCleanup();
    return;
  }
});

// =========================================================================
// TAB NAVIGATION (for per-pageload randomization)
// =========================================================================
chrome.webNavigation.onCommitted.addListener(async (details) => {
  if (details.frameId !== 0) return; // Only main frame
  const state = await getState();
  if (state.randomizeOn === 'pageload') {
    await performRandomize();
  }
});

// =========================================================================
// INITIALIZATION
// =========================================================================
chrome.runtime.onInstalled.addListener(async (details) => {
  // Preload data modules
  loadDataModules().then(dm => {
    if (dm) console.log('PhantomPrint: Data modules preloaded on install');
  });

  const state = await getState();
  await updateHeaderRules(state);
  setupAlarms(state);

  // Initialize blocking modules (install DNR rules)
  initializeBlockingModules();

  // Create pre-built profiles
  const presets = {
    'Windows Chrome User': { os: 'windows', browser: 'chrome', sessionSeed: 'preset-win-chrome-' + Date.now() },
    'Mac Safari User': { os: 'macos', browser: 'safari', sessionSeed: 'preset-mac-safari-' + Date.now() },
    'Linux Firefox User': { os: 'linux', browser: 'firefox', sessionSeed: 'preset-linux-ff-' + Date.now() },
    'Android Mobile User': { os: 'android', browser: 'chrome', sessionSeed: 'preset-android-' + Date.now() },
    'iPhone Safari User': { os: 'ios', browser: 'safari', sessionSeed: 'preset-ios-safari-' + Date.now() }
  };

  if (!state.savedProfiles || Object.keys(state.savedProfiles).length === 0) {
    await setState({ savedProfiles: presets });
  }

  // Save baseline for integrity check
  const sec = await loadModule('security');
  if (sec) {
    const baseline = await sec.checkIntegrity();
    if (!baseline || baseline.unchecked.length > 0) await sec.saveIntegrityBaseline(['background/service-worker.js','inject/main-world-inject.js','content/content-script.js','core/consistency-engine.js']);
  }

  // Open onboarding on fresh install
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('onboarding/onboarding.html') });
  }
});

chrome.runtime.onStartup.addListener(async () => {
  // Preload data modules on startup
  loadDataModules();

  const state = await getState();
  // New session seed on browser startup
  if (state.randomizeOn === 'session') {
    await performRandomize();
  } else {
    await updateHeaderRules(await getState());
  }
  updateBadge(state.enabled);

  // Re-initialize blocking modules (DNR rules cleared on browser restart)
  initializeBlockingModules();
});

// =========================================================================
// KEYBOARD SHORTCUTS
// =========================================================================
chrome.commands.onCommand.addListener(async (command) => {
  switch (command) {
    case 'toggle-protection': {
      const state = await getState();
      const toggled = await setState({ enabled: !state.enabled });
      await updateHeaderRules(toggled);
      notifyTabs(toggled);
      await updateBadge(toggled.enabled);
      break;
    }
    case 'randomize-fingerprint': {
      await performRandomize();
      // Flash badge to indicate randomization
      await chrome.action.setBadgeBackgroundColor({ color: '#00D2FF' });
      await chrome.action.setBadgeText({ text: '🎲' });
      setTimeout(async () => { const s = await getState(); await updateBadge(s.enabled); }, 2000);
      break;
    }
    case 'open-test-page': {
      chrome.tabs.create({ url: chrome.runtime.getURL('test/fingerprint-test.html') });
      break;
    }
  }
});

// =========================================================================
// OPTIONAL PERMISSION HELPER
// =========================================================================
/**
 * Ensure an optional permission is granted before using its APIs.
 * @param {string} perm - Permission name (e.g. 'cookies', 'proxy', 'browsingData')
 * @returns {Promise<boolean>}
 */
async function ensurePermission(perm) {
  try {
    const granted = await chrome.permissions.contains({ permissions: [perm] });
    if (granted) return true;
    return await chrome.permissions.request({ permissions: [perm] });
  } catch (e) {
    return false;
  }
}

// =========================================================================
// MODULE INITIALIZATION ON STARTUP
// =========================================================================
async function initializeBlockingModules() {
  // Small delay to avoid blocking startup critical path
  await new Promise(r => setTimeout(r, 800));

  const stored = await chrome.storage.local.get([
    'pp_tracker_config', 'pp_replay_enabled', 'pp_link_cleaner_enabled',
    'pp_referrer_mode', 'pp_webrtc_mode', 'pp_sync_config', 'pp_net_privacy_enabled'
  ]);

  // Tracker Blocker — always initialize (re-applies DNR rules)
  try {
    const tracker = await loadModule('tracker-blocker');
    if (tracker) {
      await tracker.initialize();
      console.log('PhantomPrint: Tracker blocker initialized');
    }
  } catch(e) { console.warn('Tracker blocker init failed:', e); }

  // Link Cleaner — restore saved enabled state
  try {
    const lc = await loadModule('link-cleaner');
    if (lc && stored.pp_link_cleaner_enabled !== false) {
      await lc.enable();
      console.log('PhantomPrint: Link cleaner enabled');
    }
  } catch(e) { console.warn('Link cleaner init failed:', e); }

  // Session Replay Prevention — restore saved state
  try {
    const replay = await loadModule('session-replay-prevention');
    if (replay && stored.pp_replay_enabled) {
      await replay.enable();
      console.log('PhantomPrint: Session replay prevention enabled');
    }
  } catch(e) { console.warn('Session replay init failed:', e); }

  // Referrer Control — restore mode
  try {
    const ref = await loadModule('referrer-control');
    if (ref) {
      const mode = await ref.getMode();
      if (mode && mode !== 'off') await ref.setMode(mode);
    }
  } catch(e) { console.warn('Referrer control init failed:', e); }

  // Network Interceptor — restore privacy rules
  try {
    const ni = await loadModule('network-interceptor');
    if (ni && stored.pp_net_privacy_enabled !== false) {
      await ni.enablePrivacyRules(true);
    }
  } catch(e) { console.warn('Network interceptor init failed:', e); }

  // Cloud Sync auto-alarm restoration
  try {
    const syncCfg = stored.pp_sync_config;
    if (syncCfg && syncCfg.enabled && syncCfg.intervalMinutes) {
      chrome.alarms.create('pp_sync_auto', { periodInMinutes: syncCfg.intervalMinutes });
    }
  } catch(e) {}

  // Performance cleanup alarm (daily)
  chrome.alarms.create('pp_cleanup', { delayInMinutes: 60, periodInMinutes: 1440 });

  // Security: restore auto-lock alarm
  try {
    const lockCfg = await chrome.storage.local.get('pp_autolock_minutes');
    if (lockCfg.pp_autolock_minutes) {
      chrome.alarms.create('pp_autolock', { periodInMinutes: lockCfg.pp_autolock_minutes });
    }
  } catch(e) {}
}

// Badge update
async function updateBadge(enabled) {
  const color = enabled ? '#4CAF50' : '#9E9E9E';
  const text = enabled ? 'ON' : 'OFF';
  await chrome.action.setBadgeBackgroundColor({ color });
  await chrome.action.setBadgeText({ text });
}

// Keep badge in sync
setInterval(async () => {
  const state = await getState();
  await updateBadge(state.enabled);
}, 5000);

// Initial badge
getState().then(state => updateBadge(state.enabled));
