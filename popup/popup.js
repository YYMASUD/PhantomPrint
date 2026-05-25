// PhantomPrint v4.0 — Popup Controller
(function() {
  'use strict';

  // ═══════════════════════════════════════════════
  // DOM References
  // ═══════════════════════════════════════════════
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  let state = {};

  // ═══════════════════════════════════════════════
  // Initialize on DOM ready
  // ═══════════════════════════════════════════════
  document.addEventListener('DOMContentLoaded', async () => {
    try {
      state = await sendMessage({ action: 'getState' });
    } catch (e) {
      state = {};
    }
    renderState();
    bindEvents();
  });

  // ═══════════════════════════════════════════════
  // Message helper
  // ═══════════════════════════════════════════════
  function sendMessage(msg) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(msg, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    });
  }

  // ═══════════════════════════════════════════════
  // Render current state to UI
  // ═══════════════════════════════════════════════
  function renderState() {
    // Master toggle
    const masterToggle = $('#master-toggle');
    const overlay = $('#disabled-overlay');
    masterToggle.checked = state.isEnabled !== false;
    overlay.classList.toggle('active', !masterToggle.checked);

    // Profile info
    const p = state.fingerprintProfile;
    if (p) {
      const chromeMatch = (p.userAgent || '').match(/Chrome\/(\d+)/);
      const browserStr = chromeMatch ? 'Chrome ' + chromeMatch[1] : 'Browser';
      $('#pf-browser').textContent = browserStr;
      $('#pf-os').textContent = p.os || 'Unknown';
      $('#pf-screen').textContent = p.screen ? p.screen.width + '\u00D7' + p.screen.height : '-';
      const gpuShort = (p.gpu && p.gpu.renderer) ? p.gpu.renderer.replace(/ANGLE \(.*?,\s*/, '').replace(/\s*Direct3D.*/, '').replace(/\s*OpenGL.*/, '') : '-';
      $('#pf-gpu').textContent = gpuShort;
    }

    // Module toggles
    const modules = state.modules || {};
    $$('.module-card').forEach((card) => {
      const mod = card.dataset.module;
      const cb = card.querySelector('input[type="checkbox"]');
      const isOn = modules[mod] !== false;
      cb.checked = isOn;
      card.classList.toggle('active', isOn);
      card.classList.toggle('inactive', !isOn);
    });

    // Advanced section
    if (state.autoRotate) $('#auto-rotate-toggle').checked = true;
    if (state.autoRotateInterval) $('#rotate-interval').value = String(state.autoRotateInterval);
    if (state.profilePreset) $('#profile-preset').value = state.profilePreset;
    if (state.noiseLevel) $('#noise-level').value = state.noiseLevel;

    // Protection score
    updateProtectionScore();
  }

  // ═══════════════════════════════════════════════
  // Protection score calculation
  // ═══════════════════════════════════════════════
  function updateProtectionScore() {
    const modules = state.modules || {};
    const allMods = ['canvas','webgl','audio','navigator','screen','fonts','webrtc','timezone','rects','battery','media','speech'];
    const activeCount = allMods.filter(m => modules[m] !== false).length;
    const total = allMods.length;
    const pct = Math.round((activeCount / total) * 100);

    // Has profile?
    const hasProfile = !!state.fingerprintProfile;
    const finalPct = hasProfile ? pct : Math.round(pct * 0.5);

    $('#score-value').textContent = finalPct + '%';
    $('#score-detail').textContent = activeCount + '/' + total + ' modules active';

    // Update ring
    const circumference = 213.6; // 2 * PI * 34
    const offset = circumference - (circumference * finalPct / 100);
    const ring = $('#score-ring-fill');
    if (ring) ring.style.strokeDashoffset = offset;

    // Color coding
    const scoreEl = $('#score-value');
    if (finalPct >= 70) {
      scoreEl.style.color = 'var(--accent)';
    } else if (finalPct >= 40) {
      scoreEl.style.color = 'var(--warning)';
    } else {
      scoreEl.style.color = 'var(--danger)';
    }
  }

  // ═══════════════════════════════════════════════
  // Bind all event listeners
  // ═══════════════════════════════════════════════
  function bindEvents() {
    // Master toggle
    $('#master-toggle').addEventListener('change', async (e) => {
      const enabled = e.target.checked;
      await sendMessage({ action: 'toggleEnabled', enabled });
      state.isEnabled = enabled;
      $('#disabled-overlay').classList.toggle('active', !enabled);
    });

    // ONE-CLICK RANDOMIZE
    const randomizeBtn = $('#randomize-all-btn');
    randomizeBtn.addEventListener('click', async () => {
      randomizeBtn.classList.add('loading');
      randomizeBtn.disabled = true;

      try {
        const preset = $('#profile-preset').value || 'Random';
        const response = await sendMessage({ action: 'randomizeAll', preset });

        if (response && response.profile) {
          state.fingerprintProfile = response.profile;
          state.isEnabled = true;
        }

        // Refresh full state
        state = await sendMessage({ action: 'getState' });

        randomizeBtn.classList.remove('loading');
        randomizeBtn.classList.add('success');
        const btnText = randomizeBtn.querySelector('.btn-text');
        const btnIcon = randomizeBtn.querySelector('.btn-icon');
        btnText.textContent = '\u2713 Randomized!';
        btnIcon.textContent = '\u2713';

        renderState();

        setTimeout(() => {
          randomizeBtn.classList.remove('success');
          btnText.textContent = 'ONE-CLICK RANDOMIZE ALL';
          btnIcon.textContent = '\u{1F3B2}';
          randomizeBtn.disabled = false;
        }, 1500);
      } catch (error) {
        console.error('Randomization failed:', error);
        randomizeBtn.classList.remove('loading');
        randomizeBtn.classList.add('error');
        const btnText = randomizeBtn.querySelector('.btn-text');
        btnText.textContent = '\u26A0 Error - Retry';
        randomizeBtn.disabled = false;
        setTimeout(() => {
          randomizeBtn.classList.remove('error');
          btnText.textContent = 'ONE-CLICK RANDOMIZE ALL';
        }, 2000);
      }
    });

    // Module toggles
    $$('.module-card input[type="checkbox"]').forEach((cb) => {
      cb.addEventListener('change', async (e) => {
        const card = e.target.closest('.module-card');
        const mod = card.dataset.module;
        const enabled = e.target.checked;
        card.classList.toggle('active', enabled);
        card.classList.toggle('inactive', !enabled);

        await sendMessage({ action: 'toggleModule', module: mod, enabled });
        if (!state.modules) state.modules = {};
        state.modules[mod] = enabled;
        updateProtectionScore();
      });
    });

    // Advanced toggle
    $('#advanced-toggle').addEventListener('click', () => {
      const section = $('#advanced-section');
      const chevron = $('#advanced-chevron');
      section.classList.toggle('open');
      chevron.classList.toggle('open');
    });

    // Auto-rotate
    $('#auto-rotate-toggle').addEventListener('change', async (e) => {
      const interval = parseInt($('#rotate-interval').value) || 30;
      await sendMessage({ action: 'setAutoRotate', enabled: e.target.checked, interval });
    });

    $('#rotate-interval').addEventListener('change', async (e) => {
      const autoOn = $('#auto-rotate-toggle').checked;
      if (autoOn) {
        await sendMessage({ action: 'setAutoRotate', enabled: true, interval: parseInt(e.target.value) });
      }
    });

    // Profile preset
    $('#profile-preset').addEventListener('change', async (e) => {
      await sendMessage({ action: 'setProfilePreset', preset: e.target.value });
    });

    // Noise level
    $('#noise-level').addEventListener('change', async (e) => {
      await sendMessage({ action: 'setNoiseLevel', level: e.target.value });
    });

    // Action buttons
    $('#btn-view').addEventListener('click', () => {
      if (state.fingerprintProfile) {
        const p = state.fingerprintProfile;
        const info = [
          'ID: ' + (p.id || '-'),
          'UA: ' + (p.userAgent || '-'),
          'Platform: ' + (p.platform || '-'),
          'Screen: ' + (p.screen ? p.screen.width + 'x' + p.screen.height : '-'),
          'GPU: ' + (p.gpu ? p.gpu.renderer : '-'),
          'Cores: ' + (p.hardwareConcurrency || '-'),
          'Memory: ' + (p.deviceMemory || '-') + 'GB',
          'TZ: ' + (p.timezone ? p.timezone.zone : '-'),
          'Lang: ' + (p.language || '-')
        ].join('\n');
        alert(info);
      }
    });

    $('#btn-test').addEventListener('click', async () => {
      await sendMessage({ action: 'openTestSite', site: 'browserleaks' });
    });

    $('#btn-export').addEventListener('click', async () => {
      const result = await sendMessage({ action: 'exportProfile' });
      if (result && result.data) {
        const blob = new Blob([result.data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'phantomprint-profile.json';
        a.click();
        URL.revokeObjectURL(url);
      }
    });

    $('#btn-import').addEventListener('click', () => {
      $('#import-file').click();
    });

    $('#import-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const text = await file.text();
      const result = await sendMessage({ action: 'importProfile', data: text });
      if (result && result.success) {
        state = await sendMessage({ action: 'getState' });
        renderState();
        alert('Profile imported successfully!');
      } else {
        alert('Import failed: ' + (result.error || 'Unknown error'));
      }
      e.target.value = '';
    });

    // Settings
    $('#btn-settings').addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });

    // Whitelist
    $('#whitelist-btn').addEventListener('click', () => {
      $('#whitelist-modal').classList.add('active');
      loadWhitelist();
    });

    $('#whitelist-close').addEventListener('click', () => {
      $('#whitelist-modal').classList.remove('active');
    });

    
    // Timezone mode — with IP-based auto-sync
    var tzModeEl = document.getElementById('tz-mode');
    var tzDetectRow = document.getElementById('tz-detect-row');
    var tzCurrentRow = document.getElementById('tz-current-row');
    var tzWarning = document.getElementById('tz-warning');

    if (tzModeEl) {
      if (state.timezoneMode) tzModeEl.value = state.timezoneMode;

      function updateTzUI() {
        var mode = tzModeEl.value;
        var showDetect = (mode === 'ip' || mode === 'custom');
        if (tzDetectRow) tzDetectRow.style.display = showDetect ? 'flex' : 'none';
        var hasLoc = state.ipLocation || state.customTimezone;
        if (tzCurrentRow) tzCurrentRow.style.display = (showDetect && hasLoc) ? 'flex' : 'none';
        if (tzWarning) tzWarning.style.display = (mode !== 'auto') ? 'block' : 'none';
        // Show detected info
        var tzVal = document.getElementById('tz-current-value');
        if (tzVal) {
          if (state.ipLocation && state.ipLocation.timezone) {
            tzVal.textContent = state.ipLocation.timezone.zone + ' (' + (state.ipLocation.country || '') + ') — lang: ' + (state.ipLocation.languages ? state.ipLocation.languages[0] : '-');
          } else if (state.customTimezone) {
            tzVal.textContent = state.customTimezone.zone || '-';
          }
        }
      }
      updateTzUI();

      tzModeEl.addEventListener('change', async function(e) {
        var mode = e.target.value;
        await sendMessage({ action: 'setTimezoneMode', mode: mode });
        state.timezoneMode = mode;
        // Auto-detect when switching to IP mode
        if (mode === 'ip' && !state.ipLocation) {
          var tzDetectBtn2 = document.getElementById('tz-detect-btn');
          if (tzDetectBtn2) tzDetectBtn2.click();
        }
        updateTzUI();
      });
    }

    var tzDetectBtn = document.getElementById('tz-detect-btn');
    if (tzDetectBtn) {
      tzDetectBtn.addEventListener('click', async function() {
        tzDetectBtn.textContent = 'Detecting...';
        tzDetectBtn.disabled = true;
        try {
          var result = await sendMessage({ action: 'autoDetectTimezone' });
          if (result && result.success && result.ipLocation) {
            state.ipLocation = result.ipLocation;
            state.customTimezone = result.ipLocation.timezone;
            updateTzUI();
            tzDetectBtn.textContent = '\u2713 ' + result.ipLocation.timezone.zone;
          } else {
            tzDetectBtn.textContent = 'Failed - Retry';
          }
        } catch(e) {
          tzDetectBtn.textContent = 'Error - Retry';
        }
        setTimeout(function() { tzDetectBtn.textContent = 'Detect from IP'; tzDetectBtn.disabled = false; }, 2500);
      });
    }

    $('#wl-add-btn').addEventListener('click', async () => {
      const input = $('#wl-domain-input');
      const domain = input.value.trim();
      if (domain) {
        await sendMessage({ action: 'addToWhitelist', domain });
        input.value = '';
        loadWhitelist();
      }
    });
  }

  // ═══════════════════════════════════════════════
  // Whitelist management
  // ═══════════════════════════════════════════════
  async function loadWhitelist() {
    const result = await sendMessage({ action: 'getWhitelist' });
    const list = $('#wl-list');
    list.innerHTML = '';
    const whitelist = result.whitelist || [];
    whitelist.forEach((domain) => {
      const item = document.createElement('div');
      item.className = 'wl-item';
      item.innerHTML = '<span class="wl-item-domain">' + domain + '</span><button class="wl-item-remove" data-domain="' + domain + '">\u2715</button>';
      item.querySelector('.wl-item-remove').addEventListener('click', async () => {
        await sendMessage({ action: 'removeFromWhitelist', domain });
        loadWhitelist();
      });
      list.appendChild(item);
    });
  }

})();
