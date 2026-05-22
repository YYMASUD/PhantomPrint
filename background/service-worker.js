// PhantomPrint Background Service Worker
// Manages extension state, header modification, profile storage, and messaging
'use strict';

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

  // Generate a fingerprint profile for header rules
  const profile = generateHeaderProfile(state);
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

function generateHeaderProfile(state) {
  // Simple deterministic profile generation for headers
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

  const os = pick(['Windows', 'Windows', 'macOS', 'Linux']);
  const browser = os === 'macOS' ? pick(['Chrome', 'Safari']) : pick(['Chrome', 'Chrome', 'Edge', 'Firefox']);
  const chromeVer = pick(['120.0.6099.130', '121.0.6167.139', '122.0.6261.94', '123.0.6312.86', '124.0.6367.91']);
  const ffVer = pick(['121.0', '122.0', '123.0', '124.0', '125.0']);
  const safariVer = pick(['17.1', '17.2', '17.3', '17.4']);
  const languages = ['en-US', 'en-GB', 'fr-FR', 'de-DE', 'es-ES', 'ja-JP', 'ko-KR', 'zh-CN'];
  const language = pick(languages);

  let userAgent, browserVersion;
  if (os === 'Windows') {
    if (browser === 'Chrome') { browserVersion = chromeVer; userAgent = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVer} Safari/537.36`; }
    else if (browser === 'Edge') { browserVersion = chromeVer; userAgent = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVer} Safari/537.36 Edg/${chromeVer}`; }
    else { browserVersion = ffVer; userAgent = `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:${ffVer}) Gecko/20100101 Firefox/${ffVer}`; }
  } else if (os === 'macOS') {
    if (browser === 'Chrome') { browserVersion = chromeVer; userAgent = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVer} Safari/537.36`; }
    else { browserVersion = safariVer; userAgent = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${safariVer} Safari/605.1.15`; }
  } else {
    if (browser === 'Chrome') { browserVersion = chromeVer; userAgent = `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVer} Safari/537.36`; }
    else { browserVersion = ffVer; userAgent = `Mozilla/5.0 (X11; Linux x86_64; rv:${ffVer}) Gecko/20100101 Firefox/${ffVer}`; }
  }

  let clientHints = null;
  if (browser === 'Chrome' || browser === 'Edge') {
    const major = browserVersion.split('.')[0];
    const brandName = browser === 'Edge' ? 'Microsoft Edge' : 'Google Chrome';
    clientHints = {
      brands: [{ brand: 'Not_A Brand', version: '8' }, { brand: 'Chromium', version: major }, { brand: brandName, version: major }],
      mobile: false,
      platform: os,
      platformVersion: os === 'Windows' ? '10.0.0' : '14.2.0',
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
      const randomized = await setState({ sessionSeed: generateSessionSeed() });
      await updateHeaderRules(randomized);
      notifyTabs(randomized);
      return randomized;

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
    const state = await setState({ sessionSeed: generateSessionSeed() });
    await updateHeaderRules(state);
    notifyTabs(state);
  }
});

// =========================================================================
// TAB NAVIGATION (for per-pageload randomization)
// =========================================================================
chrome.webNavigation.onCommitted.addListener(async (details) => {
  if (details.frameId !== 0) return; // Only main frame
  const state = await getState();
  if (state.randomizeOn === 'pageload') {
    await setState({ sessionSeed: generateSessionSeed() });
  }
});

// =========================================================================
// INITIALIZATION
// =========================================================================
chrome.runtime.onInstalled.addListener(async () => {
  const state = await getState();
  await updateHeaderRules(state);
  setupAlarms(state);

  // Create pre-built profiles
  const presets = {
    'Windows Chrome User': { os: 'Windows', browser: 'Chrome', sessionSeed: 'preset-win-chrome-' + Date.now() },
    'Mac Safari User': { os: 'macOS', browser: 'Safari', sessionSeed: 'preset-mac-safari-' + Date.now() },
    'Linux Firefox User': { os: 'Linux', browser: 'Firefox', sessionSeed: 'preset-linux-ff-' + Date.now() },
    'Android Mobile User': { os: 'Android', browser: 'Chrome', sessionSeed: 'preset-android-' + Date.now() },
    'iPhone Safari User': { os: 'iOS', browser: 'Safari', sessionSeed: 'preset-ios-safari-' + Date.now() }
  };

  if (!state.savedProfiles || Object.keys(state.savedProfiles).length === 0) {
    await setState({ savedProfiles: presets });
  }
});

chrome.runtime.onStartup.addListener(async () => {
  const state = await getState();
  // New session seed on browser startup
  if (state.randomizeOn === 'session') {
    await setState({ sessionSeed: generateSessionSeed() });
  }
  await updateHeaderRules(await getState());
});

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
