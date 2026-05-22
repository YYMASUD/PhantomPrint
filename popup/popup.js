// PhantomPrint Popup v2.0 - Real-time fingerprint preview
'use strict';

const CATEGORIES = [
  { key: 'navigator', icon: '🌐', name: 'Nav' },
  { key: 'screen', icon: '🖥', name: 'Screen' },
  { key: 'canvas', icon: '🎨', name: 'Canvas' },
  { key: 'webgl', icon: '🎮', name: 'WebGL' },
  { key: 'audio', icon: '🎵', name: 'Audio' },
  { key: 'webrtc', icon: '📞', name: 'RTC' },
  { key: 'fonts', icon: '📝', name: 'Fonts' },
  { key: 'timing', icon: '⏱', name: 'Time' },
  { key: 'behavior', icon: '👁', name: 'Input' },
  { key: 'media', icon: '🎬', name: 'Media' }
];

let currentState = null;

document.addEventListener('DOMContentLoaded', init);

async function init() {
  currentState = await sendMessage({ action: 'getState' });
  if (!currentState) {
    currentState = { enabled: true, categories: {}, savedProfiles: {}, whitelist: [], sessionSeed: '' };
  }
  render();
  setupListeners();
  // Fetch live fingerprint from active tab
  fetchLiveFingerprint();
}

async function sendMessage(msg) {
  try { return await chrome.runtime.sendMessage(msg); }
  catch(e) { return null; }
}

function render() {
  const { enabled, categories, savedProfiles, sessionSeed } = currentState;

  // Master toggle + disabled state
  document.getElementById('masterToggle').checked = enabled;
  document.getElementById('app').classList.toggle('disabled', !enabled);

  const badge = document.getElementById('statusBadge');
  badge.textContent = enabled ? 'Active' : 'Paused';
  badge.classList.toggle('paused', !enabled);

  // Score
  const cats = categories || {};
  const total = CATEGORIES.length;
  const active = CATEGORIES.filter(c => cats[c.key] !== false).length;
  const pct = Math.round((active / total) * 100);
  const circumference = 2 * Math.PI * 42; // r=42
  document.getElementById('scoreValue').textContent = pct;
  document.getElementById('scoreRing').setAttribute('stroke-dasharray', `${(pct / 100) * circumference} ${circumference}`);
  document.getElementById('catCount').textContent = `${active}/${total}`;

  const descriptions = { 100: 'Maximum Protection', 90: 'Excellent', 70: 'Good', 50: 'Moderate', 0: 'Minimal' };
  const descKey = pct >= 100 ? 100 : pct >= 90 ? 90 : pct >= 70 ? 70 : pct >= 50 ? 50 : 0;
  document.getElementById('scoreDesc').textContent = descriptions[descKey];

  // Category buttons
  const grid = document.getElementById('categoryGrid');
  grid.innerHTML = CATEGORIES.map(cat => {
    const isActive = cats[cat.key] !== false;
    return `<div class="cat-btn ${isActive ? 'active' : ''}" data-cat="${cat.key}">
      <span class="cat-emoji">${cat.icon}</span>
      <span class="cat-name">${cat.name}</span>
    </div>`;
  }).join('');

  // Profiles
  const profilesRow = document.getElementById('profilesRow');
  const profiles = savedProfiles || {};
  const names = Object.keys(profiles);
  if (names.length === 0) {
    profilesRow.innerHTML = '<span style="font-size:11px;color:var(--text-muted)">No saved profiles</span>';
  } else {
    profilesRow.innerHTML = names.slice(0, 6).map(name => {
      const isActive = name === currentState.activeProfileName;
      return `<div class="profile-chip ${isActive ? 'active' : ''}" data-profile="${name}">${name}</div>`;
    }).join('');
  }

  // Fingerprint preview from seed
  updateFingerprintPreview();
}

function updateFingerprintPreview() {
  const seed = currentState.sessionSeed || 'default';
  // Deterministic preview values from seed
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h = h >>> 0;
  const rng = () => { h += 0x9e3779b9; let t = h ^ (h >>> 16); t = Math.imul(t, 0x21f0aaad); t ^= t >>> 15; t = Math.imul(t, 0x735a2d97); t ^= t >>> 15; return (t >>> 0) / 4294967296; };
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];

  const browsers = ['Chrome 122','Chrome 123','Chrome 124','Firefox 123','Firefox 124','Safari 17.2','Safari 17.3','Edge 122','Edge 123'];
  const oses = ['Windows 10','Windows 11','macOS 14.2','macOS 14.3','Linux 6.6','Android 14','iOS 17.2'];
  const screens = ['1920x1080','2560x1440','1366x768','1440x900','1536x864','3840x2160','393x873'];
  const gpus = ['RTX 3060','RTX 3070','RTX 4060','RX 6700 XT','Intel Iris Xe','Apple M2','Apple M3','Adreno 740'];
  const langs = ['en-US','en-GB','fr-FR','de-DE','ja-JP','es-ES','zh-CN','ko-KR'];
  const tzs = ['America/New_York','America/Los_Angeles','Europe/London','Europe/Berlin','Asia/Tokyo','Asia/Shanghai'];
  const cores = ['4 / 8GB','6 / 16GB','8 / 16GB','8 / 32GB','12 / 32GB','16 / 64GB'];
  const touches = ['None (Desktop)','5 points (Mobile)','10 points (Mobile)'];

  document.getElementById('fpBrowser').textContent = pick(browsers);
  document.getElementById('fpOS').textContent = pick(oses);
  document.getElementById('fpScreen').textContent = pick(screens);
  document.getElementById('fpGPU').textContent = pick(gpus);
  document.getElementById('fpLang').textContent = pick(langs);
  document.getElementById('fpTZ').textContent = pick(tzs);
  document.getElementById('fpHW').textContent = pick(cores);
  document.getElementById('fpTouch').textContent = pick(touches);

  // Generate a hash from the seed
  const hashStr = (h >>> 0).toString(16).padStart(8, '0') +
    ((h * 31 + 7) >>> 0).toString(16).padStart(8, '0') +
    ((h * 127 + 13) >>> 0).toString(16).padStart(8, '0');
  document.getElementById('fpHash').textContent = hashStr.substring(0, 16);
}

async function fetchLiveFingerprint() {
  // Try to get real fingerprint data from the active tab
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id || tab.url.startsWith('chrome://')) return;

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        return window.__phantomprint_profile__ || null;
      }
    });

    if (results && results[0] && results[0].result) {
      const p = results[0].result;
      if (p.browser) document.getElementById('fpBrowser').textContent = `${p.browser} ${p.browserVersion ? p.browserVersion.split('.')[0] : ''}`;
      if (p.os) document.getElementById('fpOS').textContent = `${p.os} ${p.osVersion || ''}`;
      if (p.screen) document.getElementById('fpScreen').textContent = `${p.screen.width}x${p.screen.height}`;
      if (p.gpu) {
        const gpuShort = p.gpu.length > 25 ? p.gpu.replace(/ANGLE \([^,]+, /, '').replace(/ Direct3D11.*|, OpenGL.*|, Unspecified.*/, '') : p.gpu;
        document.getElementById('fpGPU').textContent = gpuShort;
      }
      if (p.language) document.getElementById('fpLang').textContent = p.language;
      if (p.timezone) document.getElementById('fpTZ').textContent = p.timezone;
      if (p.hardwareConcurrency) document.getElementById('fpHW').textContent = `${p.hardwareConcurrency} / ${p.deviceMemory || '?'}GB`;
      if (p.maxTouchPoints !== undefined) document.getElementById('fpTouch').textContent = p.maxTouchPoints > 0 ? `${p.maxTouchPoints} pts` : 'None';
    }
  } catch(e) {
    // Tab scripting failed - use seed-based preview (already shown)
  }
}

function setupListeners() {
  // Master toggle
  document.getElementById('masterToggle').addEventListener('change', async () => {
    currentState = await sendMessage({ action: 'toggle' });
    if (currentState) render();
  });

  // Randomize
  document.getElementById('randomizeBtn').addEventListener('click', async () => {
    currentState = await sendMessage({ action: 'randomize' });
    if (currentState) { render(); fetchLiveFingerprint(); }
  });

  // Whitelist current site
  document.getElementById('whitelistBtn').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url) {
      try {
        const url = new URL(tab.url);
        currentState = await sendMessage({ action: 'addWhitelist', data: { domain: url.hostname } });
        if (currentState) render();
      } catch(e) {}
    }
  });

  // Reset
  document.getElementById('resetBtn').addEventListener('click', async () => {
    currentState = await sendMessage({ action: 'resetToReal' });
    if (currentState) render();
  });

  // Copy fingerprint hash
  document.getElementById('copyFP').addEventListener('click', () => {
    const hash = document.getElementById('fpHash').textContent;
    navigator.clipboard.writeText(hash).then(() => {
      const btn = document.getElementById('copyFP');
      btn.textContent = '\u2713';
      setTimeout(() => { btn.textContent = '\u{1F4CB}'; }, 1500);
    });
  });

  // Category toggles (delegated)
  document.getElementById('categoryGrid').addEventListener('click', async (e) => {
    const btn = e.target.closest('.cat-btn');
    if (!btn) return;
    const cat = btn.dataset.cat;
    const isActive = btn.classList.contains('active');
    currentState = await sendMessage({ action: 'setCategory', data: { category: cat, value: !isActive } });
    if (currentState) render();
  });

  // Profile chips (delegated)
  document.getElementById('profilesRow').addEventListener('click', async (e) => {
    const chip = e.target.closest('.profile-chip');
    if (!chip) return;
    const name = chip.dataset.profile;
    currentState = await sendMessage({ action: 'loadProfile', data: { name } });
    if (currentState) { render(); fetchLiveFingerprint(); }
  });

  // Footer links
  document.getElementById('openOptions').addEventListener('click', (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });
  document.getElementById('openTest').addEventListener('click', (e) => { e.preventDefault(); chrome.tabs.create({ url: chrome.runtime.getURL('test/fingerprint-test.html') }); });
  document.getElementById('openLogs').addEventListener('click', (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });
}
