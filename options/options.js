// PhantomPrint v5.0 — Options Page Script
'use strict';

// ── Helpers ──────────────────────────────────────────────────
function msg(action, data) {
  return chrome.runtime.sendMessage({ action, ...data });
}

function notify(text, type = 'info', duration = 4000) {
  const el = document.getElementById('ppNotification');
  const textEl = document.getElementById('ppNotifText');
  if (!el || !textEl) return;
  textEl.textContent = text;
  el.className = 'pp-notification ' + type;
  el.style.display = 'flex';
  if (notify._timer) clearTimeout(notify._timer);
  if (duration > 0) notify._timer = setTimeout(() => { el.style.display = 'none'; }, duration);
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  return Math.floor(diff / 86400000) + 'd ago';
}

function getOSIcon(os) {
  if (!os) return '🖥️';
  const o = os.toLowerCase();
  if (o.includes('windows')) return '🪟';
  if (o.includes('mac') || o.includes('ios')) return '🍎';
  if (o.includes('android')) return '🤖';
  if (o.includes('linux')) return '🐧';
  return '🖥️';
}

function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Module Definitions ───────────────────────────────────────
const MODULE_DEFS = [
  { key: 'navigator', icon: '🧭', name: 'Navigator', desc: 'Spoof userAgent, platform, hardwareConcurrency, deviceMemory, languages, maxTouchPoints, vendor, doNotTrack' },
  { key: 'screen', icon: '🖥️', name: 'Screen', desc: 'Spoof screen dimensions, colorDepth, pixelDepth, devicePixelRatio, orientation' },
  { key: 'canvas', icon: '🎨', name: 'Canvas 2D', desc: 'Add deterministic noise to canvas pixel data to prevent canvas fingerprinting' },
  { key: 'webgl', icon: '🔷', name: 'WebGL', desc: 'Spoof WebGL renderer, vendor, parameters, extensions, and shader precision' },
  { key: 'webgpu', icon: '⚡', name: 'WebGPU', desc: 'Spoof WebGPU adapter info, device, architecture, and vendor strings' },
  { key: 'audio', icon: '🔊', name: 'Audio', desc: 'Add noise to AudioContext fingerprint, spoof sample rate and latency' },
  { key: 'fonts', icon: '🔤', name: 'Fonts', desc: 'Spoof available system fonts to match the selected OS profile' },
  { key: 'webrtc', icon: '📡', name: 'WebRTC', desc: 'Block real IP leaks via WebRTC, spoof ICE candidates' },
  { key: 'rects', icon: '📐', name: 'Element Rects', desc: 'Add noise to getBoundingClientRect() and getClientRects() measurements' },
  { key: 'timezone', icon: '🕐', name: 'Timezone', desc: 'Spoof Intl.DateTimeFormat, Date.getTimezoneOffset, and timezone strings' },
  { key: 'battery', icon: '🔋', name: 'Battery API', desc: 'Spoof navigator.getBattery() charging state, level, and timing' },
  { key: 'speech', icon: '🗣️', name: 'Speech Synthesis', desc: 'Spoof speechSynthesis.getVoices() to match the OS profile' },
  { key: 'media', icon: '📷', name: 'Media Devices', desc: 'Spoof navigator.mediaDevices.enumerateDevices() camera/mic counts' },
  { key: 'timing', icon: '⏱️', name: 'Timing', desc: 'Add noise to performance.now() and Date.now() for timing attack prevention' },
  { key: 'storage', icon: '💾', name: 'Storage', desc: 'Spoof navigator.storage.estimate() quota and usage values' },
  { key: 'events', icon: '🖱️', name: 'Input Events', desc: 'Add noise to mouse/touch event coordinates to prevent behavioral fingerprinting' },
  { key: 'geolocation', icon: '📍', name: 'Geolocation', desc: 'Spoof navigator.geolocation to return coordinates matching the profile timezone' },
  { key: 'permissions', icon: '🔐', name: 'Permissions API', desc: 'Spoof navigator.permissions.query() results based on device type' },
  { key: 'keyboard', icon: '⌨️', name: 'Keyboard Layout', desc: 'Spoof navigator.keyboard.getLayoutMap() to match the profile language' }
];

// ── State ────────────────────────────────────────────────────
let state = null;

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadState();
  buildModulesList();
  wireTabNav();
  wireEvents();
  loadProxies();
  loadSessions();
  loadHistory();
  loadWhitelist();
});

async function loadState() {
  try {
    state = await msg('getState');
    renderAll();
  } catch(e) {
    notify('Failed to load settings: ' + e.message, 'error');
  }
}

function renderAll() {
  if (!state) return;
  renderProfile();
  renderModules();
  renderTrackerBlocker();
  renderTimezone();
  renderAutoRotate();
  renderMasterToggle();
}

// ── Tab Navigation ───────────────────────────────────────────
function wireTabNav() {
  document.querySelectorAll('.pp-nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const tab = item.dataset.tab;
      document.querySelectorAll('.pp-nav-item').forEach(i => i.classList.remove('active'));
      document.querySelectorAll('.pp-tab').forEach(t => t.classList.remove('active'));
      item.classList.add('active');
      const tabEl = document.getElementById('tab-' + tab);
      if (tabEl) tabEl.classList.add('active');

      // Lazy load tab data
      if (tab === 'history') loadHistory();
      if (tab === 'sessions') loadSessions();
      if (tab === 'whitelist') loadWhitelist();
      if (tab === 'proxy') loadProxies();
    });
  });
}

// ── Master Toggle ────────────────────────────────────────────
function renderMasterToggle() {
  const toggle = document.getElementById('masterToggle');
  if (toggle) toggle.checked = state.isEnabled !== false;
}

// ── Profile ──────────────────────────────────────────────────
function renderProfile() {
  const profile = state.fingerprintProfile;
  if (!profile) return;

  document.getElementById('bigProfileIcon').textContent = getOSIcon(profile.os);
  document.getElementById('profileUA').textContent = profile.userAgent || '—';
  document.getElementById('profileMeta').textContent =
    (profile.os || '?') + ' · ' + (profile.browser || 'Chrome') + ' · ' + (profile.language || 'en-US');

  document.getElementById('pgOS').textContent = profile.os || '—';
  document.getElementById('pgBrowser').textContent = profile.browser || 'Chrome';
  const scr = profile.screen;
  document.getElementById('pgScreen').textContent = scr ? scr.width + '×' + scr.height : '—';
  const gpu = profile.gpu;
  document.getElementById('pgGPU').textContent = gpu ? (gpu.renderer || gpu).toString().slice(0, 30) : '—';
  document.getElementById('pgCores').textContent = profile.hardwareConcurrency || '—';
  document.getElementById('pgRAM').textContent = profile.deviceMemory ? profile.deviceMemory + ' GB' : '—';
  document.getElementById('pgLang').textContent = profile.language || '—';
  const tz = profile.timezone;
  document.getElementById('pgTZ').textContent = tz ? (tz.zone || tz) : '—';
  document.getElementById('pgMobile').textContent = profile.mobile ? 'Yes' : 'No';
  document.getElementById('pgTouch').textContent = profile.maxTouchPoints || '0';
  document.getElementById('pgColor').textContent = profile.colorDepth ? profile.colorDepth + '-bit' : '—';
  document.getElementById('pgDPR').textContent = profile.devicePixelRatio || '1';

  // Preset & noise level
  const presetEl = document.getElementById('profilePreset');
  if (presetEl && state.profilePreset) presetEl.value = state.profilePreset;
  const noiseLevelEl = document.getElementById('noiseLevel');
  if (noiseLevelEl && state.noiseLevel) noiseLevelEl.value = state.noiseLevel;
}

// ── Modules ──────────────────────────────────────────────────
function buildModulesList() {
  const list = document.getElementById('modulesList');
  if (!list) return;
  list.innerHTML = MODULE_DEFS.map(m => `
    <div class="pp-module-row">
      <span class="pp-module-icon-lg">${m.icon}</span>
      <div class="pp-module-info">
        <div class="pp-module-name-lg">${esc(m.name)}</div>
        <div class="pp-module-desc">${esc(m.desc)}</div>
      </div>
      <label class="pp-toggle-switch">
        <input type="checkbox" class="module-toggle" data-module="${m.key}">
        <span class="pp-toggle-slider"></span>
      </label>
    </div>
  `).join('');

  // Wire module toggles
  list.querySelectorAll('.module-toggle').forEach(input => {
    input.addEventListener('change', async (e) => {
      const mod = e.target.dataset.module;
      const enabled = e.target.checked;
      try {
        await msg('toggleModule', { module: mod, enabled });
        if (!state.modules) state.modules = {};
        state.modules[mod] = enabled;
        notify((enabled ? '✅ ' : '❌ ') + mod + ' ' + (enabled ? 'enabled' : 'disabled'), enabled ? 'success' : 'warning', 2000);
      } catch(err) {
        notify('Error: ' + err.message, 'error');
      }
    });
  });
}

function renderModules() {
  const modules = state.modules || {};
  document.querySelectorAll('.module-toggle').forEach(input => {
    const mod = input.dataset.module;
    input.checked = modules[mod] !== false;
  });
}

// ── Tracker Blocker ──────────────────────────────────────────
function renderTrackerBlocker() {
  const tb = state.trackerBlocker || {};
  const tbEnabled = document.getElementById('tbEnabled');
  if (tbEnabled) tbEnabled.checked = tb.enabled !== false;

  const lists = tb.lists || {};
  document.querySelectorAll('.tb-list-toggle').forEach(input => {
    const list = input.dataset.list;
    input.checked = lists[list] !== false;
  });
}

// ── Timezone ─────────────────────────────────────────────────
function renderTimezone() {
  const mode = state.timezoneMode || 'auto';
  const radios = document.querySelectorAll('input[name="tzMode"]');
  radios.forEach(r => { r.checked = r.value === mode; });

  const customRow = document.getElementById('customTZRow');
  if (customRow) customRow.style.display = mode === 'custom' ? 'flex' : 'none';

  if (state.customTimezone) {
    const sel = document.getElementById('customTimezone');
    if (sel) sel.value = state.customTimezone;
  }

  // Show IP info if available
  const ipLoc = state.ipLocation;
  if (ipLoc) {
    document.getElementById('ipInfo').style.display = 'block';
    document.getElementById('ipAddr').textContent = ipLoc.ip || '—';
    document.getElementById('ipCountry').textContent = ipLoc.country || '—';
    document.getElementById('ipCity').textContent = ipLoc.city || '—';
    document.getElementById('ipTZ').textContent = ipLoc.timezone ? (ipLoc.timezone.zone || ipLoc.timezone) : '—';
  }
}

// ── Auto-Rotate ──────────────────────────────────────────────
function renderAutoRotate() {
  const autoRotate = document.getElementById('autoRotate');
  if (autoRotate) autoRotate.checked = state.autoRotate || false;
  const interval = document.getElementById('rotateInterval');
  if (interval) interval.value = state.autoRotateInterval || 30;
  const rotateOnNewTab = document.getElementById('rotateOnNewTab');
  if (rotateOnNewTab) rotateOnNewTab.checked = state.rotateOnNewTab || false;
}

// ── Wire All Events ──────────────────────────────────────────
function wireEvents() {
  // Notification close
  document.getElementById('ppNotifClose').addEventListener('click', () => {
    document.getElementById('ppNotification').style.display = 'none';
  });

  // Master toggle
  document.getElementById('masterToggle').addEventListener('change', async (e) => {
    try {
      await msg('toggleEnabled', { enabled: e.target.checked });
      state.isEnabled = e.target.checked;
      notify(e.target.checked ? '✅ Protection enabled' : '⚠️ Protection disabled', e.target.checked ? 'success' : 'warning');
    } catch(err) { notify('Error: ' + err.message, 'error'); }
  });

  // Generate new profile
  document.getElementById('btnGenerate').addEventListener('click', async () => {
    const btn = document.getElementById('btnGenerate');
    const preset = document.getElementById('profilePreset').value;
    const noiseLevel = document.getElementById('noiseLevel').value;
    btn.disabled = true;
    btn.textContent = '⏳ Generating...';
    try {
      await msg('setProfilePreset', { preset });
      await msg('setNoiseLevel', { level: noiseLevel });
      const result = await msg('randomizeAll', { preset });
      if (result && result.profile) {
        state.fingerprintProfile = result.profile;
        state.profilePreset = preset;
        state.noiseLevel = noiseLevel;
        renderProfile();
        notify('🎲 New fingerprint profile generated and applied!', 'success');
      }
    } catch(err) { notify('Error: ' + err.message, 'error'); }
    finally { btn.disabled = false; btn.textContent = '🎲 Generate New Profile'; }
  });

  // Export profile
  document.getElementById('btnExport').addEventListener('click', async () => {
    try {
      const result = await msg('exportProfile');
      if (result && result.data) {
        const blob = new Blob([result.data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'phantomprint-profile-' + Date.now() + '.json';
        a.click();
        URL.revokeObjectURL(url);
        notify('📤 Profile exported!', 'success');
      }
    } catch(err) { notify('Error: ' + err.message, 'error'); }
  });

  // Import profile
  document.getElementById('btnImport').addEventListener('click', () => {
    document.getElementById('importFile').click();
  });
  document.getElementById('importFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const result = await msg('importProfile', { data: text });
      if (result && result.success) {
        state = await msg('getState');
        renderAll();
        notify('📥 Profile imported successfully!', 'success');
      } else {
        notify('Import failed: ' + (result.error || 'Unknown error'), 'error');
      }
    } catch(err) { notify('Error: ' + err.message, 'error'); }
    e.target.value = '';
  });

  // Auto-rotate
  document.getElementById('autoRotate').addEventListener('change', async (e) => {
    const enabled = e.target.checked;
    const interval = parseInt(document.getElementById('rotateInterval').value, 10) || 30;
    try {
      await msg('setAutoRotate', { enabled, interval });
      state.autoRotate = enabled;
      notify(enabled ? '🔄 Auto-rotate enabled' : '⏹️ Auto-rotate disabled', 'success');
    } catch(err) { notify('Error: ' + err.message, 'error'); }
  });

  document.getElementById('rotateInterval').addEventListener('change', async (e) => {
    const interval = parseInt(e.target.value, 10) || 30;
    if (state.autoRotate) {
      await msg('setAutoRotate', { enabled: true, interval });
    }
    state.autoRotateInterval = interval;
  });

  document.getElementById('rotateOnNewTab').addEventListener('change', async (e) => {
    await msg('setState', { data: { rotateOnNewTab: e.target.checked } });
    state.rotateOnNewTab = e.target.checked;
    notify(e.target.checked ? '🆕 Rotate on new tab enabled' : '⏹️ Rotate on new tab disabled', 'success');
  });

  // Test buttons
  document.querySelectorAll('.pp-test-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await msg('openTestSite', { site: btn.dataset.site });
    });
  });

  // Enable/Disable all modules
  document.getElementById('btnEnableAll').addEventListener('click', async () => {
    const modules = {};
    MODULE_DEFS.forEach(m => { modules[m.key] = true; });
    await msg('setModules', { modules });
    state.modules = modules;
    renderModules();
    notify('✅ All modules enabled', 'success');
  });

  document.getElementById('btnDisableAll').addEventListener('click', async () => {
    const modules = {};
    MODULE_DEFS.forEach(m => { modules[m.key] = false; });
    await msg('setModules', { modules });
    state.modules = modules;
    renderModules();
    notify('❌ All modules disabled', 'warning');
  });

  // Tracker Blocker
  document.getElementById('tbEnabled').addEventListener('change', async (e) => {
    try {
      await msg('setTrackerBlocker', { enabled: e.target.checked });
      if (!state.trackerBlocker) state.trackerBlocker = {};
      state.trackerBlocker.enabled = e.target.checked;
      notify(e.target.checked ? '🚫 Tracker blocker enabled' : '⏹️ Tracker blocker disabled', e.target.checked ? 'success' : 'warning');
    } catch(err) { notify('Error: ' + err.message, 'error'); }
  });

  document.querySelectorAll('.tb-list-toggle').forEach(input => {
    input.addEventListener('change', async (e) => {
      const list = e.target.dataset.list;
      const enabled = e.target.checked;
      try {
        await msg('setTrackerBlocker', { lists: { [list]: enabled } });
        if (!state.trackerBlocker) state.trackerBlocker = {};
        if (!state.trackerBlocker.lists) state.trackerBlocker.lists = {};
        state.trackerBlocker.lists[list] = enabled;
        notify((enabled ? '✅ ' : '❌ ') + list + ' list ' + (enabled ? 'enabled' : 'disabled'), 'success', 2000);
      } catch(err) { notify('Error: ' + err.message, 'error'); }
    });
  });

  // Timezone
  document.querySelectorAll('input[name="tzMode"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      const mode = e.target.value;
      const customRow = document.getElementById('customTZRow');
      if (customRow) customRow.style.display = mode === 'custom' ? 'flex' : 'none';
    });
  });

  document.getElementById('btnSaveTZ').addEventListener('click', async () => {
    const mode = document.querySelector('input[name="tzMode"]:checked')?.value || 'auto';
    const customTZ = document.getElementById('customTimezone').value;
    try {
      await msg('setTimezoneMode', { mode, timezone: mode === 'custom' ? customTZ : undefined });
      state.timezoneMode = mode;
      if (mode === 'custom') state.customTimezone = customTZ;
      notify('💾 Timezone settings saved!', 'success');
    } catch(err) { notify('Error: ' + err.message, 'error'); }
  });

  document.getElementById('btnDetectIP').addEventListener('click', async () => {
    const btn = document.getElementById('btnDetectIP');
    btn.disabled = true;
    btn.textContent = '⏳ Detecting...';
    try {
      const result = await msg('autoDetectTimezone');
      if (result && result.success && result.ipLocation) {
        state.ipLocation = result.ipLocation;
        renderTimezone();
        notify('🌐 IP location detected: ' + (result.ipLocation.city || '') + ' ' + (result.ipLocation.country || ''), 'success');
      } else {
        notify('Detection failed: ' + (result.error || 'Unknown error'), 'error');
      }
    } catch(err) { notify('Error: ' + err.message, 'error'); }
    finally { btn.disabled = false; btn.textContent = '🌐 Detect from IP'; }
  });

  // Whitelist add
  document.getElementById('btnAddWL').addEventListener('click', async () => {
    const input = document.getElementById('wlInput');
    const domain = input.value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!domain) { notify('Please enter a domain', 'warning'); return; }
    try {
      await msg('addToWhitelist', { domain });
      if (!state.whitelist) state.whitelist = [];
      if (!state.whitelist.includes(domain)) state.whitelist.push(domain);
      input.value = '';
      renderWhitelist();
      notify('✅ Added to whitelist: ' + domain, 'success');
    } catch(err) { notify('Error: ' + err.message, 'error'); }
  });

  document.getElementById('wlInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('btnAddWL').click();
  });

  // Sessions
  document.getElementById('btnSaveSession').addEventListener('click', async () => {
    const name = document.getElementById('sessionName').value.trim();
    if (!name) { notify('Please enter a session name', 'warning'); return; }
    const session = {
      id: 'sess_' + Date.now(),
      name,
      profile: state.fingerprintProfile,
      modules: state.modules,
      noiseLevel: state.noiseLevel,
      createdAt: Date.now()
    };
    try {
      await msg('saveSession', { session });
      document.getElementById('sessionName').value = '';
      loadSessions();
      notify('💾 Session "' + name + '" saved!', 'success');
    } catch(err) { notify('Error: ' + err.message, 'error'); }
  });

  // History clear
  document.getElementById('btnClearHistory').addEventListener('click', async () => {
    if (!confirm('Clear all fingerprint history?')) return;
    try {
      await msg('clearHistory');
      document.getElementById('historyTable').innerHTML = '<div class="pp-empty">History cleared</div>';
      notify('🗑️ History cleared', 'success');
    } catch(err) { notify('Error: ' + err.message, 'error'); }
  });

  // Proxy
  document.getElementById('btnAddProxy').addEventListener('click', async () => {
    const protocol = document.getElementById('proxyProtocol').value;
    const host = document.getElementById('proxyHost').value.trim();
    const port = document.getElementById('proxyPort').value.trim();
    const label = document.getElementById('proxyLabel').value.trim() || (protocol + '://' + host + ':' + port);
    if (!host || !port) { notify('Please enter host and port', 'warning'); return; }
    const proxy = { protocol, host, port: parseInt(port, 10), label, id: 'proxy_' + Date.now() };
    try {
      // Save to list
      const result = await msg('getProxy');
      const proxies = result.proxies || [];
      proxies.push(proxy);
      await msg('saveProxies', { proxies });
      // Connect
      await msg('setProxy', { proxy });
      document.getElementById('proxyHost').value = '';
      document.getElementById('proxyPort').value = '';
      document.getElementById('proxyLabel').value = '';
      loadProxies();
      notify('🌐 Proxy connected: ' + label, 'success');
    } catch(err) { notify('Error: ' + err.message, 'error'); }
  });

  document.getElementById('btnDisableProxy').addEventListener('click', async () => {
    try {
      await msg('setProxy', { proxy: null });
      loadProxies();
      notify('⏹️ Proxy disconnected', 'warning');
    } catch(err) { notify('Error: ' + err.message, 'error'); }
  });

  // Advanced
  document.getElementById('debugMode').addEventListener('change', async (e) => {
    await msg('setDebugMode', { enabled: e.target.checked });
    state.debugMode = e.target.checked;
    notify(e.target.checked ? '🐛 Debug mode enabled' : '⏹️ Debug mode disabled', 'success', 2000);
  });
  if (state) {
    const debugEl = document.getElementById('debugMode');
    if (debugEl) debugEl.checked = state.debugMode || false;
  }

  document.getElementById('btnExportAll').addEventListener('click', async () => {
    try {
      const result = await msg('exportProfile');
      if (result && result.data) {
        const blob = new Blob([result.data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'phantomprint-settings-' + Date.now() + '.json';
        a.click();
        URL.revokeObjectURL(url);
        notify('📤 Settings exported!', 'success');
      }
    } catch(err) { notify('Error: ' + err.message, 'error'); }
  });

  document.getElementById('btnImportAll').addEventListener('click', () => {
    document.getElementById('importAllFile').click();
  });
  document.getElementById('importAllFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const result = await msg('importProfile', { data: text });
      if (result && result.success) {
        state = await msg('getState');
        renderAll();
        notify('📥 Settings imported successfully!', 'success');
      } else {
        notify('Import failed: ' + (result.error || 'Unknown error'), 'error');
      }
    } catch(err) { notify('Error: ' + err.message, 'error'); }
    e.target.value = '';
  });

  document.getElementById('btnResetAll').addEventListener('click', async () => {
    if (!confirm('Reset ALL PhantomPrint settings to defaults? This cannot be undone.')) return;
    try {
      const result = await msg('resetState');
      if (result && result.success) {
        state = result.state || await msg('getState');
        renderAll();
        notify('⚠️ All settings reset to defaults', 'warning');
      }
    } catch(err) { notify('Error: ' + err.message, 'error'); }
  });
}

// ── Whitelist ────────────────────────────────────────────────
async function loadWhitelist() {
  const container = document.getElementById('whitelistItems');
  if (!container) return;
  try {
    const result = await msg('getWhitelist');
    const whitelist = result.whitelist || [];
    state.whitelist = whitelist;
    renderWhitelist();
  } catch(e) {}
}

function renderWhitelist() {
  const container = document.getElementById('whitelistItems');
  if (!container) return;
  const whitelist = state.whitelist || [];
  if (whitelist.length === 0) {
    container.innerHTML = '<div class="pp-empty">No whitelisted sites</div>';
    return;
  }
  container.innerHTML = whitelist.map(domain => `
    <div class="pp-wl-item">
      <span class="pp-wl-domain">${esc(domain)}</span>
      <button class="pp-wl-remove" data-domain="${esc(domain)}" title="Remove">✕</button>
    </div>
  `).join('');

  container.querySelectorAll('.pp-wl-remove').forEach(btn => {
    btn.addEventListener('click', async () => {
      const domain = btn.dataset.domain;
      try {
        await msg('removeFromWhitelist', { domain });
        state.whitelist = (state.whitelist || []).filter(d => d !== domain);
        renderWhitelist();
        notify('✅ Removed: ' + domain, 'success', 2000);
      } catch(err) { notify('Error: ' + err.message, 'error'); }
    });
  });
}

// ── Proxy ────────────────────────────────────────────────────
async function loadProxies() {
  try {
    const result = await msg('getProxy');
    const proxies = result.proxies || [];
    const activeProxy = result.activeProxy;

    const dot = document.getElementById('proxyDot');
    const statusText = document.getElementById('proxyStatusText');
    const disableBtn = document.getElementById('btnDisableProxy');

    if (activeProxy) {
      dot.className = 'pp-status-dot active';
      statusText.textContent = activeProxy.label || (activeProxy.protocol + '://' + activeProxy.host + ':' + activeProxy.port);
      disableBtn.style.display = 'inline-flex';
    } else {
      dot.className = 'pp-status-dot';
      statusText.textContent = 'No proxy active';
      disableBtn.style.display = 'none';
    }

    const list = document.getElementById('proxyList');
    if (!list) return;
    if (proxies.length === 0) {
      list.innerHTML = '<div class="pp-empty">No saved proxies</div>';
      return;
    }

    list.innerHTML = proxies.map(p => `
      <div class="pp-proxy-item ${activeProxy && activeProxy.id === p.id ? 'active-proxy' : ''}">
        <span class="pp-proxy-label">${esc(p.label || p.protocol + '://' + p.host + ':' + p.port)}</span>
        <span class="pp-proxy-addr">${esc(p.protocol)}://${esc(p.host)}:${esc(p.port)}</span>
        <button class="pp-btn pp-btn-secondary pp-btn-sm proxy-connect" data-id="${esc(p.id)}">Connect</button>
        <button class="pp-btn pp-btn-danger pp-btn-sm proxy-delete" data-id="${esc(p.id)}">✕</button>
      </div>
    `).join('');

    list.querySelectorAll('.proxy-connect').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const proxy = proxies.find(p => p.id === id);
        if (!proxy) return;
        try {
          await msg('setProxy', { proxy });
          loadProxies();
          notify('🌐 Connected to: ' + (proxy.label || proxy.host), 'success');
        } catch(err) { notify('Error: ' + err.message, 'error'); }
      });
    });

    list.querySelectorAll('.proxy-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const updated = proxies.filter(p => p.id !== id);
        await msg('saveProxies', { proxies: updated });
        loadProxies();
        notify('🗑️ Proxy removed', 'success', 2000);
      });
    });
  } catch(e) {}
}

// ── Sessions ─────────────────────────────────────────────────
async function loadSessions() {
  const list = document.getElementById('sessionsList');
  if (!list) return;
  try {
    const result = await msg('getSessions');
    const sessions = result.sessions || [];
    const activeId = state.activeSessionId;

    if (sessions.length === 0) {
      list.innerHTML = '<div class="pp-empty">No saved sessions</div>';
      return;
    }

    list.innerHTML = sessions.map(s => `
      <div class="pp-session-item ${s.id === activeId ? 'active-session' : ''}">
        <div class="pp-session-info">
          <div class="pp-session-name">${esc(s.name)}</div>
          <div class="pp-session-meta">${s.profile ? (s.profile.os || '?') + ' · ' + (s.profile.browser || 'Chrome') : '?'} · ${timeAgo(s.createdAt)}</div>
        </div>
        <div class="pp-session-actions">
          <button class="pp-btn pp-btn-primary pp-btn-sm session-activate" data-id="${esc(s.id)}">▶ Load</button>
          <button class="pp-btn pp-btn-danger pp-btn-sm session-delete" data-id="${esc(s.id)}">✕</button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.session-activate').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await msg('activateSession', { sessionId: btn.dataset.id });
          state = await msg('getState');
          renderAll();
          loadSessions();
          notify('▶ Session loaded!', 'success');
        } catch(err) { notify('Error: ' + err.message, 'error'); }
      });
    });

    list.querySelectorAll('.session-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this session?')) return;
        try {
          await msg('deleteSession', { sessionId: btn.dataset.id });
          loadSessions();
          notify('🗑️ Session deleted', 'success', 2000);
        } catch(err) { notify('Error: ' + err.message, 'error'); }
      });
    });
  } catch(e) {}
}

// ── History ──────────────────────────────────────────────────
async function loadHistory() {
  const table = document.getElementById('historyTable');
  if (!table) return;
  try {
    const result = await msg('getHistory');
    const history = result.history || [];
    if (history.length === 0) {
      table.innerHTML = '<div class="pp-empty">No history yet. Visit some websites to see activity here.</div>';
      return;
    }
    table.innerHTML = `
      <div class="pp-history-row header">
        <span>Domain</span>
        <span>OS</span>
        <span>Browser</span>
        <span>Time</span>
      </div>
      ${history.slice(0, 100).map(entry => `
        <div class="pp-history-row">
          <span class="pp-history-domain-cell">${esc(entry.domain || '?')}</span>
          <span class="pp-history-os-cell">${esc(entry.os || '?')}</span>
          <span class="pp-history-browser-cell">${esc(entry.browser || 'Chrome')}</span>
          <span class="pp-history-time-cell">${timeAgo(entry.ts)}</span>
        </div>
      `).join('')}
    `;
  } catch(e) {
    table.innerHTML = '<div class="pp-empty">Failed to load history</div>';
  }
}
