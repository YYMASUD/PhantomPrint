// PhantomPrint v4.0 — Options Page Controller
(function() {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);
  let state = {};

  function sendMessage(msg) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(msg, (r) => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(r);
      });
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    state = await sendMessage({ action: 'getState' });
    renderState();
    bindEvents();
  });

  function renderState() {
    $('#opt-enabled').checked = state.isEnabled !== false;
    $('#opt-noise').value = state.noiseLevel || 'medium';
    $('#opt-autorotate').checked = !!state.autoRotate;
    $('#opt-interval').value = String(state.autoRotateInterval || 30);
    $('#opt-preset').value = state.profilePreset || 'Random';
    $('#opt-debug').checked = !!state.debugMode;

    // Profile display
    const display = $('#opt-profile-display');
    if (state.fingerprintProfile) {
      display.textContent = JSON.stringify(state.fingerprintProfile, null, 2);
    } else {
      display.textContent = 'No profile generated yet. Click "Randomize Now".';
    }

    // Modules list
    const modList = $('#opt-modules-list');
    modList.innerHTML = '';
    const allMods = ['canvas','webgl','audio','navigator','screen','fonts','webrtc','timezone','rects','battery','media','speech','timing','storage','events'];
    const modules = state.modules || {};
    allMods.forEach(mod => {
      const row = document.createElement('div');
      row.className = 'module-row';
      const isOn = modules[mod] !== false;
      row.innerHTML = '<span class="module-label">' + mod.charAt(0).toUpperCase() + mod.slice(1) + '</span><label class="toggle-switch"><input type="checkbox" data-mod="' + mod + '"' + (isOn ? ' checked' : '') + '><span class="toggle-track"></span></label>';
      modList.appendChild(row);
    });
  }

  function bindEvents() {
    // Tab navigation
    $$('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        $$('.nav-item').forEach(i => i.classList.remove('active'));
        $$('.tab-panel').forEach(p => p.classList.remove('active'));
        item.classList.add('active');
        $('#tab-' + item.dataset.tab).classList.add('active');
      });
    });

    // General settings
    $('#opt-enabled').addEventListener('change', async (e) => {
      await sendMessage({ action: 'toggleEnabled', enabled: e.target.checked });
    });
    $('#opt-noise').addEventListener('change', async (e) => {
      await sendMessage({ action: 'setNoiseLevel', level: e.target.value });
    });
    $('#opt-autorotate').addEventListener('change', async (e) => {
      await sendMessage({ action: 'setAutoRotate', enabled: e.target.checked, interval: parseInt($('#opt-interval').value) });
    });
    $('#opt-interval').addEventListener('change', async (e) => {
      if ($('#opt-autorotate').checked) {
        await sendMessage({ action: 'setAutoRotate', enabled: true, interval: parseInt(e.target.value) });
      }
    });
    $('#opt-preset').addEventListener('change', async (e) => {
      await sendMessage({ action: 'setProfilePreset', preset: e.target.value });
    });

    // Randomize
    $('#opt-randomize').addEventListener('click', async () => {
      const preset = $('#opt-preset').value;
      await sendMessage({ action: 'randomizeAll', preset });
      state = await sendMessage({ action: 'getState' });
      renderState();
    });

    // Reset
    $('#opt-reset').addEventListener('click', async () => {
      if (confirm('Reset all settings to defaults?')) {
        await sendMessage({ action: 'resetState' });
        state = await sendMessage({ action: 'getState' });
        renderState();
      }
    });

    // Module toggles (delegated)
    $('#opt-modules-list').addEventListener('change', async (e) => {
      if (e.target.dataset.mod) {
        await sendMessage({ action: 'toggleModule', module: e.target.dataset.mod, enabled: e.target.checked });
      }
    });

    // Export
    $('#opt-export').addEventListener('click', async () => {
      const result = await sendMessage({ action: 'exportProfile' });
      if (result && result.data) {
        const blob = new Blob([result.data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'phantomprint-profile.json'; a.click();
        URL.revokeObjectURL(url);
      }
    });

    // Import
    $('#opt-import-btn').addEventListener('click', () => $('#opt-import-file').click());
    $('#opt-import-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const text = await file.text();
      const result = await sendMessage({ action: 'importProfile', data: text });
      if (result && result.success) {
        state = await sendMessage({ action: 'getState' });
        renderState();
        alert('Imported successfully!');
      }
      e.target.value = '';
    });

    // Whitelist
    $('#opt-wl-add').addEventListener('click', async () => {
      const domain = $('#opt-wl-input').value.trim();
      if (domain) {
        await sendMessage({ action: 'addToWhitelist', domain });
        $('#opt-wl-input').value = '';
        loadWhitelist();
      }
    });
    loadWhitelist();

    // Debug
    $('#opt-debug').addEventListener('change', async (e) => {
      await sendMessage({ action: 'setDebugMode', enabled: e.target.checked });
    });

    // Test sites
    $('#opt-test-bl').addEventListener('click', () => sendMessage({ action: 'openTestSite', site: 'browserleaks' }));
    $('#opt-test-ami').addEventListener('click', () => sendMessage({ action: 'openTestSite', site: 'amiunique' }));
    $('#opt-test-cyt').addEventListener('click', () => sendMessage({ action: 'openTestSite', site: 'coveryourtracks' }));

    // Factory reset
    $('#opt-factory-reset').addEventListener('click', async () => {
      if (confirm('This will erase ALL settings and profiles. Continue?')) {
        await sendMessage({ action: 'resetState' });
        state = await sendMessage({ action: 'getState' });
        renderState();
      }
    });
  }

  async function loadWhitelist() {
    const result = await sendMessage({ action: 'getWhitelist' });
    const container = $('#opt-wl-list');
    container.innerHTML = '';
    (result.whitelist || []).forEach(domain => {
      const row = document.createElement('div');
      row.className = 'wl-entry';
      row.innerHTML = '<span>' + domain + '</span><button class="wl-remove" data-domain="' + domain + '">&times;</button>';
      row.querySelector('.wl-remove').addEventListener('click', async () => {
        await sendMessage({ action: 'removeFromWhitelist', domain });
        loadWhitelist();
      });
      container.appendChild(row);
    });
  }
})();
