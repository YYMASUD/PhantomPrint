// PhantomPrint v5.0 — Popup Script
'use strict';

// ── Helpers ──────────────────────────────────────────────────
function msg(action, data) {
  return chrome.runtime.sendMessage({ action, ...data });
}

function notify(text, type = 'info', duration = 3000) {
  const el = document.getElementById('ppNotification');
  const textEl = document.getElementById('ppNotifText');
  if (!el || !textEl) return;
  textEl.textContent = text;
  el.className = 'pp-notification ' + type;
  el.style.display = 'flex';
  if (notify._timer) clearTimeout(notify._timer);
  if (duration > 0) {
    notify._timer = setTimeout(() => { el.style.display = 'none'; }, duration);
  }
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

function shortGPU(renderer) {
  if (!renderer) return '—';
  // Extract GPU model from ANGLE string
  const m = renderer.match(/ANGLE \([^,]+,\s*([^,]+)/);
  if (m) {
    return m[1].replace('NVIDIA GeForce ', '').replace('AMD Radeon ', '').replace('Intel(R) ', '').replace(' Direct3D11 vs_5_0 ps_5_0', '').replace(' Direct3D11', '').trim().slice(0, 18);
  }
  return renderer.slice(0, 18);
}

// ── State ────────────────────────────────────────────────────
let state = null;
let currentDomain = '';
let historyVisible = false;

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Get current tab domain
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url) {
      try { currentDomain = new URL(tab.url).hostname; } catch(e) {}
    }
  } catch(e) {}

  // Load state
  await loadState();

  // Wire up events
  wireEvents();
});

async function loadState() {
  try {
    state = await msg('getState');
    renderUI();
  } catch(e) {
    notify('Failed to load state: ' + e.message, 'error');
  }
}

function renderUI() {
  if (!state) return;

  const popup = document.querySelector('.pp-popup');
  const masterToggle = document.getElementById('masterToggle');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const statusDomain = document.getElementById('statusDomain');

  // Master toggle
  masterToggle.checked = state.isEnabled !== false;

  // Check whitelist
  const whitelist = state.whitelist || [];
  const isWhitelisted = currentDomain && whitelist.some(d => currentDomain === d || currentDomain.endsWith('.' + d));

  // Status
  if (!state.isEnabled) {
    statusDot.className = 'pp-status-dot inactive';
    statusText.textContent = 'Protection disabled';
    popup.classList.add('disabled');
  } else if (isWhitelisted) {
    statusDot.className = 'pp-status-dot whitelisted';
    statusText.textContent = 'Site whitelisted';
    popup.classList.remove('disabled');
  } else {
    statusDot.className = 'pp-status-dot active';
    statusText.textContent = 'Active — fingerprint spoofed';
    popup.classList.remove('disabled');
  }

  statusDomain.textContent = currentDomain || '';

  // Profile card
  const profile = state.fingerprintProfile;
  if (profile) {
    document.getElementById('profileIcon').textContent = getOSIcon(profile.os);
    document.getElementById('profileName').textContent = profile.userAgent
      ? profile.userAgent.replace('Mozilla/5.0 ', '').slice(0, 50)
      : (profile.os + ' — ' + (profile.browser || 'Chrome'));
    document.getElementById('profileSub').textContent =
      (profile.os || '?') + ' · ' + (profile.browser || 'Chrome') + ' · ' + (profile.language || 'en-US');

    // Stats
    document.getElementById('statOS').textContent = profile.os || '—';
    document.getElementById('statGPU').textContent = shortGPU(profile.gpu && profile.gpu.renderer ? profile.gpu.renderer : (profile.gpu || ''));
    const scr = profile.screen;
    document.getElementById('statScreen').textContent = scr ? scr.width + '×' + scr.height : '—';
    document.getElementById('statCores').textContent = profile.hardwareConcurrency || '—';
    document.getElementById('statRAM').textContent = profile.deviceMemory ? profile.deviceMemory + 'GB' : '—';
    const tz = profile.timezone;
    document.getElementById('statTZ').textContent = tz ? (tz.zone || tz).toString().split('/').pop() : '—';
  }

  // Modules
  const modules = state.modules || {};
  document.querySelectorAll('.module-toggle').forEach(input => {
    const mod = input.dataset.module;
    const enabled = modules[mod] !== false;
    input.checked = enabled;
    const card = input.closest('.pp-module');
    if (card) {
      card.classList.toggle('active', enabled);
      card.classList.toggle('inactive', !enabled);
    }
  });

  // Whitelist button text
  const btnWL = document.getElementById('btnWhitelist');
  if (btnWL) {
    btnWL.textContent = isWhitelisted ? '✅ Remove from Whitelist' : '🚫 Whitelist Site';
  }
}

function wireEvents() {
  // Master toggle
  document.getElementById('masterToggle').addEventListener('change', async (e) => {
    const enabled = e.target.checked;
    try {
      await msg('toggleEnabled', { enabled });
      state.isEnabled = enabled;
      renderUI();
      notify(enabled ? '✅ Protection enabled' : '⚠️ Protection disabled', enabled ? 'success' : 'warning');
    } catch(err) {
      notify('Error: ' + err.message, 'error');
    }
  });

  // Module toggles
  document.querySelectorAll('.module-toggle').forEach(input => {
    input.addEventListener('change', async (e) => {
      const mod = e.target.dataset.module;
      const enabled = e.target.checked;
      try {
        await msg('toggleModule', { module: mod, enabled });
        if (!state.modules) state.modules = {};
        state.modules[mod] = enabled;
        renderUI();
        notify((enabled ? '✅ ' : '❌ ') + mod + ' module ' + (enabled ? 'enabled' : 'disabled'), enabled ? 'success' : 'warning', 2000);
      } catch(err) {
        notify('Error: ' + err.message, 'error');
      }
    });
    // Prevent card click from double-firing
    input.addEventListener('click', e => e.stopPropagation());
  });

  // Module card click = toggle
  document.querySelectorAll('.pp-module').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.pp-mini-toggle')) return;
      const input = card.querySelector('.module-toggle');
      if (input) {
        input.checked = !input.checked;
        input.dispatchEvent(new Event('change'));
      }
    });
  });

  // Randomize button (quick)
  document.getElementById('btnRandomize').addEventListener('click', async () => {
    try {
      document.getElementById('btnRandomize').textContent = '⏳';
      const result = await msg('randomizeAll', { preset: state.profilePreset || 'random' });
      if (result && result.profile) {
        state.fingerprintProfile = result.profile;
        renderUI();
        notify('🎲 New fingerprint applied!', 'success');
      }
    } catch(err) {
      notify('Error: ' + err.message, 'error');
    } finally {
      document.getElementById('btnRandomize').textContent = '🔀';
    }
  });

  // Copy profile info
  document.getElementById('btnCopy').addEventListener('click', async () => {
    const profile = state && state.fingerprintProfile;
    if (!profile) return;
    const info = [
      'OS: ' + (profile.os || '?'),
      'UA: ' + (profile.userAgent || '?'),
      'Screen: ' + (profile.screen ? profile.screen.width + 'x' + profile.screen.height : '?'),
      'GPU: ' + (profile.gpu && profile.gpu.renderer ? profile.gpu.renderer : '?'),
      'Cores: ' + (profile.hardwareConcurrency || '?'),
      'RAM: ' + (profile.deviceMemory || '?') + 'GB',
      'TZ: ' + (profile.timezone ? (profile.timezone.zone || profile.timezone) : '?'),
      'Lang: ' + (profile.language || '?')
    ].join('\n');
    try {
      await navigator.clipboard.writeText(info);
      notify('📋 Profile info copied!', 'success', 2000);
    } catch(e) {
      notify('Copy failed', 'error');
    }
  });

  // New Profile button
  document.getElementById('btnNewProfile').addEventListener('click', async () => {
    const btn = document.getElementById('btnNewProfile');
    btn.textContent = '⏳ Generating...';
    btn.disabled = true;
    try {
      const result = await msg('randomizeAll', { preset: state.profilePreset || 'random' });
      if (result && result.profile) {
        state.fingerprintProfile = result.profile;
        renderUI();
        notify('🎲 New fingerprint profile applied! Reload tabs to apply.', 'success', 4000);
      }
    } catch(err) {
      notify('Error: ' + err.message, 'error');
    } finally {
      btn.textContent = '🎲 New Profile';
      btn.disabled = false;
    }
  });

  // Whitelist button
  document.getElementById('btnWhitelist').addEventListener('click', async () => {
    if (!currentDomain) {
      notify('No domain detected', 'warning');
      return;
    }
    const whitelist = state.whitelist || [];
    const isWhitelisted = whitelist.some(d => currentDomain === d || currentDomain.endsWith('.' + d));
    try {
      if (isWhitelisted) {
        await msg('removeFromWhitelist', { domain: currentDomain });
        state.whitelist = whitelist.filter(d => d !== currentDomain);
        notify('✅ Removed from whitelist: ' + currentDomain, 'success');
      } else {
        await msg('addToWhitelist', { domain: currentDomain });
        state.whitelist = [...whitelist, currentDomain];
        notify('🚫 Whitelisted: ' + currentDomain, 'warning');
      }
      renderUI();
    } catch(err) {
      notify('Error: ' + err.message, 'error');
    }
  });

  // Notification close
  document.getElementById('ppNotifClose').addEventListener('click', () => {
    document.getElementById('ppNotification').style.display = 'none';
  });

  // Options button
  document.getElementById('btnOptions').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Test button
  document.getElementById('btnTest').addEventListener('click', async () => {
    await msg('openTestSite', { site: 'browserleaks' });
    window.close();
  });

  // History button
  document.getElementById('btnHistory').addEventListener('click', async () => {
    historyVisible = !historyVisible;
    const panel = document.getElementById('historyPanel');
    if (historyVisible) {
      panel.style.display = 'block';
      await loadHistory();
    } else {
      panel.style.display = 'none';
    }
  });

  // History close
  document.getElementById('historyClose').addEventListener('click', () => {
    historyVisible = false;
    document.getElementById('historyPanel').style.display = 'none';
  });

  // Clear history
  document.getElementById('btnClearHistory').addEventListener('click', async () => {
    try {
      await msg('clearHistory');
      document.getElementById('historyList').innerHTML = '<div class="pp-empty">History cleared</div>';
      notify('📜 History cleared', 'success', 2000);
    } catch(e) {
      notify('Error: ' + e.message, 'error');
    }
  });
}

async function loadHistory() {
  const list = document.getElementById('historyList');
  try {
    const result = await msg('getHistory');
    const history = result.history || [];
    if (history.length === 0) {
      list.innerHTML = '<div class="pp-empty">No history yet</div>';
      return;
    }
    list.innerHTML = history.slice(0, 30).map(entry => `
      <div class="pp-history-item">
        <span class="pp-history-domain">${entry.domain || '?'}</span>
        <span class="pp-history-profile">${entry.os || '?'}</span>
        <span class="pp-history-time">${timeAgo(entry.ts)}</span>
      </div>
    `).join('');
  } catch(e) {
    list.innerHTML = '<div class="pp-empty">Failed to load history</div>';
  }
}
