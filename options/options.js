// PhantomPrint Options Page Script
'use strict';

const CATEGORY_INFO = {
  navigator: { icon: '&#127760;', name: 'Navigator & Browser Info', desc: 'User-Agent, platform, language, plugins, and browser APIs' },
  screen: { icon: '&#128187;', name: 'Screen & Display', desc: 'Resolution, viewport, DPR, orientation, and media queries' },
  canvas: { icon: '&#127912;', name: 'Canvas Fingerprinting', desc: 'Pixel noise injection for toDataURL, getImageData, measureText' },
  webgl: { icon: '&#127918;', name: 'WebGL Fingerprinting', desc: 'GPU vendor/renderer, WebGL parameters, shader precision' },
  audio: { icon: '&#127925;', name: 'AudioContext Fingerprinting', desc: 'Audio processing noise, sample rate, channel count' },
  webrtc: { icon: '&#128222;', name: 'WebRTC Protection', desc: 'Local IP stripping, media device spoofing, SDP sanitization' },
  fonts: { icon: '&#128221;', name: 'Font Fingerprinting', desc: 'Font enumeration restriction, metric normalization' },
  timing: { icon: '&#9201;', name: 'Timing & Performance', desc: 'Reduced precision for performance.now(), Date, timezone spoofing' },
  behavior: { icon: '&#128065;', name: 'Behavior Tracking', desc: 'Mouse/keyboard/scroll noise, sensor blocking, idle detection' },
  media: { icon: '&#127909;', name: 'Media Capabilities', desc: 'Codec support, speech voices, EME, login detection blocking' },
  storage: { icon: '&#128451;', name: 'Storage & Cookies', desc: 'Anti-incognito detection, storage quota spoofing, cache protection' },
  network: { icon: '&#127760;', name: 'Network & Connection', desc: 'NetworkInformation API spoofing, connection type/speed' },
  hardware: { icon: '&#9881;', name: 'Hardware Information', desc: 'CPU cores, device memory, battery, touch, hardware APIs' },
  plugins: { icon: '&#128268;', name: 'Plugins & Extensions', desc: 'Plugin/MIME type spoofing, extension self-hiding' },
  privacy: { icon: '&#128274;', name: 'Privacy & Security', desc: 'Permissions API, incognito detection blocking' },
  location: { icon: '&#128205;', name: 'Location & Timezone', desc: 'Geolocation blocking, timezone/locale consistency' }
};

let currentState = null;

document.addEventListener('DOMContentLoaded', async () => {
  currentState = await sendMessage({ action: 'getState' });
  if (!currentState) return;
  initUI();
  setupNavigation();
  setupEventListeners();
});

async function sendMessage(msg) {
  try { return await chrome.runtime.sendMessage(msg); }
  catch(e) { console.error('PhantomPrint:', e); return null; }
}

function initUI() {
  updateDashboard();
  buildCategories();
  updateProfiles();
  updateWhitelist();
  updateRandomization();
  updateLogs();
}

function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      item.classList.add('active');
      document.getElementById(`section-${item.dataset.section}`).classList.add('active');
    });
  });
}

function updateDashboard() {
  const score = calculateScore();
  document.getElementById('dashScore').textContent = `${score}%`;
  document.getElementById('dashScoreBar').style.width = `${score}%`;

  const statusEl = document.getElementById('dashStatus');
  statusEl.innerHTML = currentState.enabled
    ? '<span class="status-dot active"></span> Active'
    : '<span class="status-dot" style="background:#ef4444"></span> Paused';

  // Summary
  const s = currentState.sessionSeed || '';
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h = h >>> 0;
  const pick = (arr) => { h += 0x9e3779b9; let t = h ^ (h >>> 16); t = Math.imul(t, 0x21f0aaad); t ^= t >>> 15; return arr[((t >>> 0) % arr.length)]; };

  document.getElementById('dashBrowser').textContent = pick(['Chrome 120','Chrome 121','Firefox 121','Safari 17.2','Edge 120']);
  document.getElementById('dashOS').textContent = pick(['Windows 10','Windows 11','macOS 14','Linux 6.5','Android 14']);
  document.getElementById('dashScreen').textContent = pick(['1920x1080','1366x768','2560x1440','1440x900']);
  document.getElementById('dashGPU').textContent = pick(['RTX 3060','RX 580','UHD 630','Apple M2']);
  document.getElementById('dashLang').textContent = pick(['en-US','en-GB','fr-FR','de-DE','ja-JP']);
  document.getElementById('dashTZ').textContent = pick(['America/New_York','Europe/London','Asia/Tokyo','Europe/Berlin']);

  // Stats
  const stats = currentState.stats || {};
  document.getElementById('statSpoofed').textContent = stats.spoofed || 0;
  document.getElementById('statSites').textContent = Object.keys(stats.sites || {}).length;
}

function calculateScore() {
  if (!currentState.enabled) return 0;
  const cats = currentState.categories || {};
  const total = Object.keys(cats).length || 16;
  const enabled = Object.values(cats).filter(v => v !== false).length;
  return Math.round((enabled / total) * 100);
}

function buildCategories() {
  const container = document.getElementById('categoriesList');
  container.innerHTML = '';
  Object.entries(CATEGORY_INFO).forEach(([key, info]) => {
    const enabled = currentState.categories[key] !== false;
    const row = document.createElement('div');
    row.className = 'category-row';
    row.innerHTML = `
      <div class="cat-info">
        <span class="cat-icon">${info.icon}</span>
        <div class="cat-details"><h3>${info.name}</h3><p>${info.desc}</p></div>
      </div>
      <label class="switch"><input type="checkbox" data-category="${key}" ${enabled ? 'checked' : ''}><span class="slider"></span></label>
    `;
    container.appendChild(row);
  });

  container.querySelectorAll('[data-category]').forEach(input => {
    input.addEventListener('change', async (e) => {
      const cat = e.target.dataset.category;
      currentState = await sendMessage({ action: 'setCategory', data: { category: cat, value: e.target.checked } });
      updateDashboard();
    });
  });
}

function updateProfiles() {
  const container = document.getElementById('profilesList');
  const profiles = currentState.savedProfiles || {};
  container.innerHTML = '';

  if (Object.keys(profiles).length === 0) {
    container.innerHTML = '<p style="color:#666;font-size:13px;padding:8px">No saved profiles</p>';
    return;
  }

  Object.entries(profiles).forEach(([name, data]) => {
    const item = document.createElement('div');
    item.className = 'profile-item';
    const isActive = name === currentState.activeProfileName;
    item.innerHTML = `
      <span class="profile-name">${name} ${isActive ? '(active)' : ''}</span>
      <div class="profile-actions">
        <button class="btn btn-small btn-primary" data-load="${name}">Load</button>
        <button class="btn btn-small btn-danger" data-delete="${name}">Delete</button>
      </div>
    `;
    container.appendChild(item);
  });

  container.querySelectorAll('[data-load]').forEach(btn => {
    btn.addEventListener('click', async () => {
      currentState = await sendMessage({ action: 'loadProfile', data: { name: btn.dataset.load } });
      updateDashboard();
      updateProfiles();
    });
  });

  container.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (confirm(`Delete profile "${btn.dataset.delete}"?`)) {
        currentState = await sendMessage({ action: 'deleteProfile', data: { name: btn.dataset.delete } });
        updateProfiles();
      }
    });
  });
}

function updateWhitelist() {
  const container = document.getElementById('whitelistList');
  const whitelist = currentState.whitelist || [];
  container.innerHTML = '';

  if (whitelist.length === 0) {
    container.innerHTML = '<p style="color:#666;font-size:13px;padding:8px">No whitelisted sites</p>';
    return;
  }

  whitelist.forEach(site => {
    const row = document.createElement('div');
    row.className = 'wl-row';
    row.innerHTML = `<span>${site}</span><button data-remove="${site}">&times;</button>`;
    container.appendChild(row);
  });

  container.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', async () => {
      currentState = await sendMessage({ action: 'removeWhitelist', data: { domain: btn.dataset.remove } });
      updateWhitelist();
    });
  });
}

function updateRandomization() {
  const radios = document.querySelectorAll('[name="randomizeOn"]');
  radios.forEach(r => { r.checked = r.value === currentState.randomizeOn; });

  document.getElementById('crossSiteToggle').checked = currentState.crossSiteIsolation;

  const webrtcRadios = document.querySelectorAll('[name="webrtcMode"]');
  webrtcRadios.forEach(r => { r.checked = r.value === currentState.webrtcMode; });

  document.getElementById('currentSeed').textContent = currentState.sessionSeed || '--';
}

async function updateLogs() {
  const logs = await sendMessage({ action: 'getLogs' }) || [];
  const container = document.getElementById('logsTable');
  const headerHTML = '<div class="log-header"><span>Time</span><span>Site</span><span>API</span></div>';

  if (logs.length === 0) {
    container.innerHTML = headerHTML + '<div class="log-row" style="color:#666">No fingerprinting attempts logged yet.</div>';
    return;
  }

  const rowsHTML = logs.slice(-100).reverse().map(log => {
    const time = new Date(log.timestamp).toLocaleTimeString();
    return `<div class="log-row"><span>${time}</span><span>${log.site || '--'}</span><span>${log.api || '--'}</span></div>`;
  }).join('');

  container.innerHTML = headerHTML + rowsHTML;
}

function setupEventListeners() {
  // Dashboard actions
  document.getElementById('dashRandomize').addEventListener('click', async () => {
    currentState = await sendMessage({ action: 'randomize' });
    updateDashboard();
    updateRandomization();
  });

  document.getElementById('dashReset').addEventListener('click', async () => {
    if (confirm('Reset to real fingerprint? This will disable all spoofing.')) {
      currentState = await sendMessage({ action: 'resetToReal' });
      initUI();
    }
  });

  // Save new profile
  document.getElementById('saveNewProfile').addEventListener('click', async () => {
    const name = prompt('Enter profile name:');
    if (!name) return;
    currentState = await sendMessage({
      action: 'saveProfile',
      data: { name, profile: { sessionSeed: currentState.sessionSeed, categories: currentState.categories, webrtcMode: currentState.webrtcMode } }
    });
    updateProfiles();
  });

  // Export
  document.getElementById('exportBtn').addEventListener('click', async () => {
    const data = await sendMessage({ action: 'exportSettings' });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'phantomprint-settings.json'; a.click();
    URL.revokeObjectURL(url);
  });

  // Import
  document.getElementById('importBtn').addEventListener('click', () => {
    document.getElementById('importFile').click();
  });
  document.getElementById('importFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    try {
      const data = JSON.parse(text);
      currentState = await sendMessage({ action: 'importSettings', data });
      initUI();
      alert('Settings imported successfully!');
    } catch(err) {
      alert('Invalid settings file.');
    }
  });

  // Whitelist add
  document.getElementById('addWhitelistBtn').addEventListener('click', async () => {
    const input = document.getElementById('whitelistInput');
    const domain = input.value.trim();
    if (!domain) return;
    currentState = await sendMessage({ action: 'addWhitelist', data: { domain } });
    input.value = '';
    updateWhitelist();
  });
  document.getElementById('whitelistInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('addWhitelistBtn').click();
  });

  // Randomization settings
  document.querySelectorAll('[name="randomizeOn"]').forEach(radio => {
    radio.addEventListener('change', async (e) => {
      currentState = await sendMessage({ action: 'setRandomizeOn', data: { value: e.target.value } });
    });
  });

  document.getElementById('crossSiteToggle').addEventListener('change', async (e) => {
    currentState = await sendMessage({ action: 'setState', data: { crossSiteIsolation: e.target.checked } });
  });

  document.querySelectorAll('[name="webrtcMode"]').forEach(radio => {
    radio.addEventListener('change', async (e) => {
      currentState = await sendMessage({ action: 'setWebRTCMode', data: { mode: e.target.value } });
    });
  });

  document.getElementById('regenerateSeed').addEventListener('click', async () => {
    currentState = await sendMessage({ action: 'randomize' });
    updateRandomization();
    updateDashboard();
  });

  // Clear logs
  document.getElementById('clearLogsBtn').addEventListener('click', async () => {
    await sendMessage({ action: 'clearLogs' });
    currentState = await sendMessage({ action: 'getState' });
    updateLogs();
    updateDashboard();
  });
}
