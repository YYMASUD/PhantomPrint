/**
 * PhantomPrint Options/Dashboard — Controller
 */
'use strict';

(function() {
  let state = {};

  // =========================================================================
  // Messaging
  // =========================================================================
  function msg(data) {
    return new Promise(resolve => {
      chrome.runtime.sendMessage(data, r => resolve(r || {}));
    });
  }

  // =========================================================================
  // Tab Navigation
  // =========================================================================
  function initTabs() {
    const navItems = document.querySelectorAll('.nav-item');
    const tabs = document.querySelectorAll('.tab-content');

    navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const tabId = item.dataset.tab;
        navItems.forEach(n => n.classList.remove('active'));
        tabs.forEach(t => t.classList.remove('active'));
        item.classList.add('active');
        document.getElementById(`tab-${tabId}`).classList.add('active');
        // Load tab-specific data
        loadTabData(tabId);
      });
    });
  }

  // =========================================================================
  // Load State
  // =========================================================================
  async function loadState() {
    try {
      state = await msg({ action: 'getState' }) || {};
    } catch (e) {
      state = { enabled: true, categories: {} };
    }
    renderDashboard();
  }

  // =========================================================================
  // Dashboard
  // =========================================================================
  function renderDashboard() {
    // Score gauge
    const score = calculateScore();
    const circumference = 534; // 2 * PI * 85
    const offset = circumference - (score / 100) * circumference;
    const fill = document.getElementById('dashGaugeFill');
    if (fill) fill.style.strokeDashoffset = offset;
    const sv = document.getElementById('dashScore');
    if (sv) sv.textContent = score;

    // Profile info
    const p = state._profile || {};
    setText('dpBrowser', p.browser || 'Chrome 136');
    setText('dpOS', p.os || 'Windows 11');
    setText('dpGPU', p.gpu || 'NVIDIA RTX 4070');
    setText('dpScreen', p.screen ? `${p.screen.width}×${p.screen.height}` : '1920×1080');
    setText('dpLang', p.language || 'en-US');
    setText('dpTZ', p.timezone || 'America/New_York');
  }

  function calculateScore() {
    let score = 20;
    const cats = state.categories || {};
    const total = Object.keys(cats).length || 1;
    const enabled = Object.values(cats).filter(v => v).length;
    score += Math.round((enabled / total) * 60);
    if (state.crossSiteIsolation) score += 10;
    score += 5;
    return Math.min(100, score);
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  // =========================================================================
  // Tab-Specific Data Loading
  // =========================================================================
  async function loadTabData(tabId) {
    switch (tabId) {
      case 'monitoring': await loadMonitoring(); break;
      case 'spoofing': loadSpoofingSettings(); break;
      case 'proxy': await loadProxies(); break;
      case 'whitelist': loadWhitelist(); break;
      case 'automation': await loadAutomation(); break;
      case 'updates': await loadUpdates(); break;
      case 'settings': loadSettings(); break;
    }
  }

  // =========================================================================
  // Monitoring
  // =========================================================================
  async function loadMonitoring() {
    try {
      const stats = await msg({ action: 'getMonitoringStats' });
      setText('monTotal', stats.totalCalls || 0);
      setText('monSites', stats.totalSites || 0);
      setText('monTrackers', stats.totalTrackers || 0);
      setText('statSites', stats.totalSites || 0);
      setText('statBlocked', stats.totalCalls || 0);
    } catch (e) {}
  }

  // =========================================================================
  // Spoofing Settings
  // =========================================================================
  function loadSpoofingSettings() {
    const container = document.getElementById('spoofingCategories');
    if (container.children.length > 0) return; // Already loaded

    const categories = [
      { id: 'navigator', icon: '🧭', name: 'Navigator', params: ['userAgent', 'platform', 'language', 'languages', 'hardwareConcurrency', 'deviceMemory', 'maxTouchPoints', 'vendor', 'appVersion'] },
      { id: 'screen', icon: '🖥️', name: 'Screen', params: ['width', 'height', 'availWidth', 'availHeight', 'colorDepth', 'pixelDepth', 'devicePixelRatio'] },
      { id: 'canvas', icon: '🖼️', name: 'Canvas', params: ['toDataURL', 'toBlob', 'getImageData', 'measureText'] },
      { id: 'webgl', icon: '🧊', name: 'WebGL', params: ['renderer', 'vendor', 'getParameter', 'getSupportedExtensions', 'getShaderPrecisionFormat'] },
      { id: 'audio', icon: '🔊', name: 'Audio', params: ['sampleRate', 'channelCount', 'baseLatency', 'createOscillator', 'getChannelData'] },
      { id: 'webrtc', icon: '📡', name: 'WebRTC', params: ['localIP', 'publicIP', 'ICECandidates', 'stunRequests'] },
      { id: 'fonts', icon: '🔤', name: 'Fonts', params: ['fontList', 'fontMetrics', 'measureText'] },
      { id: 'timezone', icon: '🕐', name: 'Timezone', params: ['timezone', 'timezoneOffset', 'dateFormat', 'Intl.DateTimeFormat'] },
      { id: 'behavior', icon: '🤖', name: 'Behavior', params: ['mouseNoise', 'keystrokeTiming', 'scrollPattern', 'touchVariation'] },
      { id: 'media', icon: '🎬', name: 'Media', params: ['videoCodecs', 'audioCodecs', 'enumerateDevices', 'speechVoices'] },
      { id: 'storage', icon: '💾', name: 'Storage', params: ['etag', 'hsts', 'cookies', 'cacheIsolation'] },
      { id: 'network', icon: '🌐', name: 'Network', params: ['connectionType', 'downlink', 'rtt', 'saveData'] },
      { id: 'hardware', icon: '💻', name: 'Hardware', params: ['battery', 'bluetooth', 'usb', 'gamepad'] },
      { id: 'privacy', icon: '🔒', name: 'Privacy', params: ['doNotTrack', 'globalPrivacyControl', 'permissions'] },
    ];

    container.innerHTML = categories.map(cat => `
      <div class="spoof-category" data-cat="${cat.id}">
        <div class="spoof-cat-header" onclick="this.parentElement.classList.toggle('open')">
          <div class="spoof-cat-title"><span>${cat.icon}</span><span>${cat.name}</span></div>
          <label class="switch" onclick="event.stopPropagation()">
            <input type="checkbox" ${state.categories?.[cat.id] !== false ? 'checked' : ''} data-cat-toggle="${cat.id}">
            <span class="switch-slider"></span>
          </label>
        </div>
        <div class="spoof-cat-body">
          ${cat.params.map(p => `<div class="spoof-param"><span class="sp-name">${p}</span><span class="sp-value">Spoofed</span></div>`).join('')}
        </div>
      </div>
    `).join('');

    // Bind category toggles
    container.querySelectorAll('[data-cat-toggle]').forEach(input => {
      input.addEventListener('change', () => {
        const cat = input.dataset.catToggle;
        msg({ action: 'updateState', key: `categories.${cat}`, value: input.checked });
      });
    });
  }

  // =========================================================================
  // Proxy Manager
  // =========================================================================
  async function loadProxies() {
    try {
      const proxies = await msg({ action: 'getProxies' });
      renderProxyTable(proxies?.list || []);
    } catch (e) {}
  }

  function renderProxyTable(proxies) {
    const tbody = document.getElementById('proxyTableBody');
    if (!proxies.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-row">No proxies configured</td></tr>';
      return;
    }
    tbody.innerHTML = proxies.map(p => `
      <tr>
        <td>${p.host}</td><td>${p.port}</td><td>${p.protocol}</td>
        <td>${p.status === 'active' ? '🟢' : p.status === 'slow' ? '⚠️' : p.status === 'dead' ? '❌' : '⬜'} ${p.status}</td>
        <td>${p.latency ? p.latency + 'ms' : '—'}</td>
        <td>${p.location?.city || '—'}</td>
        <td><button class="btn" onclick="testProxy('${p.id}')">Test</button></td>
      </tr>
    `).join('');
  }

  // =========================================================================
  // Whitelist / Blacklist
  // =========================================================================
  function loadWhitelist() {
    const wl = state.whitelist || [];
    const bl = state.blacklist || [];
    renderList('whitelistList', wl, 'whitelist');
    renderList('blacklistList', bl, 'blacklist');
  }

  function renderList(containerId, items, type) {
    const ul = document.getElementById(containerId);
    ul.innerHTML = items.map(site => `
      <li><span>${site}</span><button class="wl-remove" data-type="${type}" data-site="${site}">✕</button></li>
    `).join('');
    ul.querySelectorAll('.wl-remove').forEach(btn => {
      btn.addEventListener('click', async () => {
        await msg({ action: 'removeFromList', type: btn.dataset.type, site: btn.dataset.site });
        state = await msg({ action: 'getState' });
        loadWhitelist();
      });
    });
  }

  // =========================================================================
  // Automation
  // =========================================================================
  async function loadAutomation() {
    try {
      const data = await msg({ action: 'getAutomationStatus' });
      document.getElementById('apiEnabled').checked = data?.enabled || false;
      document.getElementById('apiKeyDisplay').textContent = data?.apiKey ? data.apiKey.substring(0, 20) + '...' : 'Not generated';
    } catch (e) {}
  }

  // =========================================================================
  // Updates
  // =========================================================================
  async function loadUpdates() {
    try {
      const data = await msg({ action: 'getUpdateStatus' });
      setText('extVersion', chrome.runtime.getManifest().version);
      setText('dataVersion', data?.currentVersions?.['user-agents-data']?.version || '1.0.0');
      setText('lastCheck', data?.lastChecked || 'Never');
    } catch (e) {}
  }

  // =========================================================================
  // Settings
  // =========================================================================
  function loadSettings() {
    document.getElementById('currentSeed').textContent = state.sessionSeed || 'default';
    const crossIso = document.getElementById('crossSiteIso');
    if (crossIso) crossIso.checked = state.crossSiteIsolation !== false;

    const freq = state.randomizationFrequency || 'session';
    const radio = document.querySelector(`input[name="randFreq"][value="${freq}"]`);
    if (radio) radio.checked = true;
  }

  // =========================================================================
  // Event Bindings
  // =========================================================================
  function bindEvents() {
    // Add proxy
    document.getElementById('btnAddProxy')?.addEventListener('click', async () => {
      const proxy = {
        host: document.getElementById('proxyHost').value,
        port: document.getElementById('proxyPort').value,
        protocol: document.getElementById('proxyProtocol').value,
        username: document.getElementById('proxyUser').value,
        password: document.getElementById('proxyPass').value
      };
      if (!proxy.host || !proxy.port) return;
      await msg({ action: 'addProxy', proxy });
      await loadProxies();
      document.getElementById('proxyHost').value = '';
      document.getElementById('proxyPort').value = '';
    });

    // Whitelist/Blacklist add
    document.getElementById('btnAddWl')?.addEventListener('click', async () => {
      const site = document.getElementById('wlInput').value.trim();
      if (!site) return;
      await msg({ action: 'addToList', type: 'whitelist', site });
      document.getElementById('wlInput').value = '';
      state = await msg({ action: 'getState' });
      loadWhitelist();
    });
    document.getElementById('btnAddBl')?.addEventListener('click', async () => {
      const site = document.getElementById('blInput').value.trim();
      if (!site) return;
      await msg({ action: 'addToList', type: 'blacklist', site });
      document.getElementById('blInput').value = '';
      state = await msg({ action: 'getState' });
      loadWhitelist();
    });

    // Randomize / Profile buttons
    document.getElementById('btnRandomProfile')?.addEventListener('click', async () => {
      await msg({ action: 'randomize' });
      state = await msg({ action: 'getState' });
      renderDashboard();
    });

    // Check updates
    document.getElementById('btnCheckUpdates')?.addEventListener('click', async () => {
      const result = await msg({ action: 'checkUpdates' });
      document.getElementById('updateResult').textContent = result?.message || 'All data files are up to date ✅';
    });

    // Generate API key
    document.getElementById('btnGenKey')?.addEventListener('click', async () => {
      const result = await msg({ action: 'generateApiKey' });
      document.getElementById('apiKeyDisplay').textContent = result?.key?.substring(0, 20) + '...' || 'Error';
    });

    // Seed regeneration
    document.getElementById('btnRegenSeed')?.addEventListener('click', async () => {
      const newSeed = `manual-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;
      await msg({ action: 'updateState', key: 'sessionSeed', value: newSeed });
      document.getElementById('currentSeed').textContent = newSeed;
    });

    // Cross-site isolation
    document.getElementById('crossSiteIso')?.addEventListener('change', (e) => {
      msg({ action: 'updateState', key: 'crossSiteIsolation', value: e.target.checked });
    });

    // Randomization frequency
    document.querySelectorAll('input[name="randFreq"]').forEach(radio => {
      radio.addEventListener('change', () => {
        msg({ action: 'updateState', key: 'randomizationFrequency', value: radio.value });
      });
    });

    // Factory reset
    document.getElementById('btnReset')?.addEventListener('click', async () => {
      if (confirm('This will reset ALL settings to defaults. Continue?')) {
        await msg({ action: 'factoryReset' });
        state = await msg({ action: 'getState' });
        renderDashboard();
        location.reload();
      }
    });

    // Export/Import backup
    document.getElementById('btnBackup')?.addEventListener('click', async () => {
      const data = await msg({ action: 'exportBackup' });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'phantomprint-backup.json'; a.click();
      URL.revokeObjectURL(url);
    });

    // Export monitoring
    document.getElementById('btnExportJson')?.addEventListener('click', async () => {
      const data = await msg({ action: 'exportMonitoring', format: 'json' });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'phantomprint-monitoring.json'; a.click();
      URL.revokeObjectURL(url);
    });

    // Run fingerprint test
    document.getElementById('btnRunTest')?.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('test/fingerprint-test.html') });
    });

    // Preset profiles
    document.querySelectorAll('.preset-card').forEach(card => {
      card.addEventListener('click', async () => {
        const preset = card.dataset.preset;
        await msg({ action: 'applyPreset', preset });
        state = await msg({ action: 'getState' });
        renderDashboard();
      });
    });
  }

  // =========================================================================
  // Init
  // =========================================================================
  document.addEventListener('DOMContentLoaded', async () => {
    initTabs();
    await loadState();
    bindEvents();
    initPrivacyTab();
    initMobileTab();
    initSecurityTab();
    initSyncTab();
    initNetworkTab();
  });

  // =========================================================================
  // PRIVACY TOOLS TAB
  // =========================================================================
  async function initPrivacyTab() {
    // Session Replay
    const replayEl = document.getElementById('replayEnabled');
    if (replayEl) {
      chrome.storage.local.get('pp_replay_enabled', r => {
        if (replayEl) replayEl.checked = !!r.pp_replay_enabled;
      });
      replayEl.addEventListener('change', async () => {
        const en = replayEl.checked;
        chrome.storage.local.set({ pp_replay_enabled: en });
        await msg({ action: en ? 'replayEnable' : 'replayDisable' });
        const st = document.getElementById('replayStatus');
        if (st) st.textContent = en ? '✅ Session replay scripts are being blocked' : '⏸️ Session replay prevention disabled';
      });
      const status = await msg({ action: 'replayGetStatus' });
      const st = document.getElementById('replayStatus');
      if (st && status) st.textContent = status.enabled ? `✅ Blocking ${status.rules || 42} replay scripts` : '⏸️ Disabled';
    }

    // Link cleaner
    const linkEl = document.getElementById('linkCleanEnabled');
    if (linkEl) {
      chrome.storage.local.get(['pp_link_cleaner_enabled', 'pp_link_cleaner_count'], r => {
        if (linkEl) linkEl.checked = r.pp_link_cleaner_enabled !== false;
        const cnt = document.getElementById('linkCleanCount');
        if (cnt) cnt.textContent = r.pp_link_cleaner_count || '0';
      });
      linkEl.addEventListener('change', async () => {
        const en = linkEl.checked;
        chrome.storage.local.set({ pp_link_cleaner_enabled: en });
        await msg({ action: en ? 'linkCleanerEnable' : 'linkCleanerDisable' });
      });
    }

    // Referrer control
    const refMode = document.getElementById('referrerMode');
    const spoofRow = document.getElementById('spoofedUrlRow');
    if (refMode) {
      const current = await msg({ action: 'referrerGetMode' });
      if (current && current.mode) refMode.value = current.mode;
      if (current && current.spoofedUrl) { const su = document.getElementById('spoofedUrl'); if (su) su.value = current.spoofedUrl; }
      refMode.addEventListener('change', () => { if (spoofRow) spoofRow.style.display = refMode.value === 'spoofed' ? 'flex' : 'none'; });
      const btnRef = document.getElementById('btnSetReferrer');
      if (btnRef) btnRef.addEventListener('click', async () => {
        const su = document.getElementById('spoofedUrl');
        await msg({ action: 'referrerSetMode', data: { mode: refMode.value, spoofedUrl: su ? su.value : '' } });
        showNotif('Referrer mode updated');
      });
    }

    // DoH
    const dohEl = document.getElementById('dohEnabled');
    const dohProv = document.getElementById('dohProvider');
    if (dohEl) {
      const dohStatus = await msg({ action: 'dohGetStatus' });
      if (dohStatus) { dohEl.checked = !!dohStatus.enabled; if (dohProv && dohStatus.provider) dohProv.value = dohStatus.provider; }
      dohEl.addEventListener('change', async () => {
        await msg({ action: 'dohSetEnabled', data: { enabled: dohEl.checked, provider: dohProv ? dohProv.value : 'cloudflare' } });
      });
      if (dohProv) dohProv.addEventListener('change', async () => {
        await msg({ action: 'dohSetProvider', data: { provider: dohProv.value } });
      });
      const btnDns = document.getElementById('btnTestDns');
      if (btnDns) btnDns.addEventListener('click', async () => {
        btnDns.textContent = '⏳ Testing…';
        const result = await msg({ action: 'dohRunLeakTest' });
        const res = document.getElementById('dohTestResult');
        if (res) res.textContent = result && result.passed ? `✅ No DNS leaks (provider: ${result.provider})` : `⚠️ Possible leak: ${JSON.stringify(result)}`;
        btnDns.textContent = '🧪 Run DNS Leak Test';
      });
    }
  }

  // =========================================================================
  // MOBILE EMULATION TAB
  // =========================================================================
  async function initMobileTab() {
    const mobileEnabled = document.getElementById('mobileEnabled');
    const mobileDevice = document.getElementById('mobileDevice');
    const btnApply = document.getElementById('btnApplyMobile');
    const infoDiv = document.getElementById('mobileDeviceInfo');

    if (!mobileEnabled) return;

    // Load saved settings
    const savedState = await msg({ action: 'getState' });
    if (savedState) {
      mobileEnabled.checked = !!savedState.mobileEnabled;
      if (mobileDevice && savedState.mobileProfileName) mobileDevice.value = savedState.mobileProfileName;
    }

    // Show device info on selection
    const deviceSpecs = {
      'iPhone 15 Pro Max': 'UA: Mozilla/5.0 (iPhone; CPU iPhone OS 18_5...) • Screen: 430×932 @3x • Memory: 8GB • CPU: 6 cores',
      'Samsung Galaxy S24 Ultra': 'UA: Mozilla/5.0 (Linux; Android 15; SM-S928B) • Screen: 412×915 @3.75x • Memory: 12GB • CPU: 8 cores',
      'Google Pixel 9 Pro': 'UA: Mozilla/5.0 (Linux; Android 15; Pixel 9 Pro) • Screen: 412×915 @3x • Memory: 16GB • CPU: 9 cores',
      'iPad Pro 12.9" M4': 'UA: Mozilla/5.0 (iPad; CPU OS 18_2...) • Screen: 1024×1366 @2x • Memory: 8GB • CPU: 10 cores'
    };
    if (mobileDevice && infoDiv) {
      mobileDevice.addEventListener('change', () => {
        const spec = deviceSpecs[mobileDevice.value];
        infoDiv.textContent = spec || (mobileDevice.value ? 'Device profile selected' : 'Select a device profile to see details');
      });
    }

    if (btnApply) btnApply.addEventListener('click', async () => {
      const profileName = mobileDevice ? mobileDevice.value : '';
      await msg({ action: 'updateState', data: { mobileEnabled: mobileEnabled.checked, mobileProfileName: profileName } });
      showNotif('Mobile profile applied — take effect on next page load');
    });
  }

  // =========================================================================
  // SECURITY TAB
  // =========================================================================
  async function initSecurityTab() {
    const pwStatus = document.getElementById('passwordStatus');
    if (!pwStatus) return;

    // Check if password is set
    const secStatus = await msg({ action: 'secIsLocked' });
    if (pwStatus) pwStatus.textContent = secStatus && secStatus.locked ? '🔒 Extension is locked' : secStatus && secStatus.hasPassword ? '🔓 Password set, unlocked' : '🔓 No master password set';

    // Set password
    const btnSetPw = document.getElementById('btnSetPassword');
    if (btnSetPw) btnSetPw.addEventListener('click', async () => {
      const cur = document.getElementById('pwCurrent').value;
      const nw = document.getElementById('pwNew').value;
      const cf = document.getElementById('pwConfirm').value;
      if (nw !== cf) { showNotif('Passwords do not match', true); return; }
      if (nw.length < 6) { showNotif('Password must be at least 6 characters', true); return; }
      const result = await msg({ action: 'secSetPassword', data: { currentPassword: cur, newPassword: nw } });
      showNotif(result && result.success ? '✅ Password updated' : '❌ ' + (result && result.error || 'Failed'));
    });

    // Remove password
    const btnRemovePw = document.getElementById('btnRemovePassword');
    if (btnRemovePw) btnRemovePw.addEventListener('click', async () => {
      const cur = document.getElementById('pwCurrent').value;
      const result = await msg({ action: 'secRemovePassword', data: { password: cur } });
      showNotif(result && result.success ? '✅ Password removed' : '❌ ' + (result && result.error || 'Failed'));
    });

    // Auto-lock
    const autoLock = document.getElementById('autoLockMinutes');
    const btnAutoLock = document.getElementById('btnSetAutoLock');
    if (autoLock) {
      chrome.storage.local.get('pp_autolock_minutes', r => { if (autoLock) autoLock.value = r.pp_autolock_minutes || 0; });
      if (btnAutoLock) btnAutoLock.addEventListener('click', async () => {
        const mins = parseInt(autoLock.value);
        chrome.storage.local.set({ pp_autolock_minutes: mins });
        await msg({ action: 'secSetAutoLock', data: { minutes: mins } });
        if (mins > 0) chrome.alarms.create('pp_autolock', { periodInMinutes: mins });
        else chrome.alarms.clear('pp_autolock');
        showNotif(mins > 0 ? `Auto-lock set to ${mins} minutes` : 'Auto-lock disabled');
      });
    }

    // Tamper detection
    const btnIntegrity = document.getElementById('btnCheckIntegrity');
    if (btnIntegrity) btnIntegrity.addEventListener('click', async () => {
      btnIntegrity.textContent = '⏳ Checking…';
      const result = await msg({ action: 'secCheckIntegrity' });
      const el = document.getElementById('integrityResult');
      if (el) {
        if (result && result.tampered && result.tampered.length > 0) {
          el.innerHTML = '⚠️ <span style="color:#FF5252">Tampered files: ' + result.tampered.join(', ') + '</span>';
        } else if (result && result.ok) {
          el.innerHTML = '✅ All ' + (result.checked || 0) + ' files verified intact';
        } else {
          el.innerHTML = '⚪ No baseline set — install fresh to establish baseline';
        }
      }
      btnIntegrity.textContent = 'Check File Integrity';
    });

    // Panic button
    const btnPanic = document.getElementById('btnPanic');
    if (btnPanic) btnPanic.addEventListener('click', async () => {
      const confirmed = window.confirm('⚠️ PANIC MODE\n\nThis will PERMANENTLY delete ALL PhantomPrint data:\n• All profiles\n• All settings\n• All cookies managed by this extension\n• All DNR rules\n• All storage\n\nThis CANNOT be undone. Continue?');
      if (!confirmed) return;
      const dbl = window.confirm('Are you absolutely sure? Last chance to cancel.');
      if (!dbl) return;
      await msg({ action: 'secPanicWipe' });
      showNotif('💥 All data wiped. Extension reset.');
    });
  }

  // =========================================================================
  // DATA & SYNC TAB
  // =========================================================================
  async function initSyncTab() {
    // Cloud sync push
    const btnPush = document.getElementById('btnSyncPush');
    const btnPull = document.getElementById('btnSyncPull');
    const syncStatus = document.getElementById('syncStatus');

    if (btnPush) btnPush.addEventListener('click', async () => {
      const pw = document.getElementById('syncPassword').value;
      if (!pw) { showNotif('Enter a sync password first', true); return; }
      btnPush.textContent = '⏳ Pushing…';
      const result = await msg({ action: 'syncPush', data: { password: pw } });
      if (syncStatus) syncStatus.textContent = result && result.success ? `✅ Pushed at ${new Date().toLocaleTimeString()}` : '❌ Push failed: ' + (result && result.error || 'Unknown error');
      btnPush.textContent = '⬆️ Push to Cloud';
    });

    if (btnPull) btnPull.addEventListener('click', async () => {
      const pw = document.getElementById('syncPassword').value;
      if (!pw) { showNotif('Enter your sync password', true); return; }
      btnPull.textContent = '⏳ Pulling…';
      const result = await msg({ action: 'syncPull', data: { password: pw } });
      if (syncStatus) syncStatus.textContent = result && result.success ? `✅ Pulled ${result.profileCount || 0} profiles` : '❌ Pull failed: ' + (result && result.error || 'Unknown error');
      btnPull.textContent = '⬇️ Pull from Cloud';
    });

    // Auto-sync interval
    const syncInterval = document.getElementById('syncInterval');
    if (syncInterval) {
      chrome.storage.local.get('pp_sync_config', r => {
        if (syncInterval && r.pp_sync_config) syncInterval.value = r.pp_sync_config.intervalMinutes || 0;
      });
      syncInterval.addEventListener('change', () => {
        const mins = parseInt(syncInterval.value);
        chrome.storage.local.get('pp_sync_config', r => {
          const cfg = r.pp_sync_config || {};
          cfg.intervalMinutes = mins; cfg.enabled = mins > 0;
          chrome.storage.local.set({ pp_sync_config: cfg });
          if (mins > 0) chrome.alarms.create('pp_sync_auto', { periodInMinutes: mins });
          else chrome.alarms.clear('pp_sync_auto');
        });
      });
    }

    // Export
    const btnExport = document.getElementById('btnExport');
    if (btnExport) btnExport.addEventListener('click', async () => {
      const fmt = document.getElementById('exportFormat').value;
      const pw = document.getElementById('syncPassword').value;
      const result = await msg({ action: 'ieExport', data: { format: fmt, password: pw } });
      if (result && result.data) {
        const blob = new Blob([typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `phantomprint-export-${Date.now()}.${fmt === 'csv' ? 'csv' : 'json'}`;
        a.click();
      }
    });

    // Import
    const btnImport = document.getElementById('btnImportFile');
    const importFile = document.getElementById('importFile');
    if (btnImport && importFile) btnImport.addEventListener('click', async () => {
      if (!importFile.files || !importFile.files[0]) { showNotif('Select a file first', true); return; }
      const reader = new FileReader();
      reader.onload = async (e) => {
        const fmt = document.getElementById('importFormat').value;
        const pw = document.getElementById('syncPassword').value;
        const result = await msg({ action: 'ieImport', data: { data: e.target.result, format: fmt, password: pw } });
        showNotif(result && result.success ? `✅ Imported ${result.count || 0} profiles` : '❌ Import failed');
      };
      reader.readAsText(importFile.files[0]);
    });

    // Clone
    const btnClone = document.getElementById('btnClone');
    if (btnClone) btnClone.addEventListener('click', async () => {
      const name = document.getElementById('cloneProfileName').value.trim();
      if (!name) { showNotif('Enter profile name', true); return; }
      const result = await msg({ action: 'ieCloneProfile', data: {
        name, count: parseInt(document.getElementById('cloneCount').value) || 1,
        changeBrowser: document.getElementById('cloneChangeBrowser').checked,
        changeOS: document.getElementById('cloneChangeOS').checked,
        changeGPU: document.getElementById('cloneChangeGPU').checked
      }});
      const el = document.getElementById('cloneResult');
      if (el) el.textContent = result && result.success ? `✅ Created ${result.count} clones` : '❌ ' + (result && result.error || 'Failed');
    });
  }

  // =========================================================================
  // NETWORK TAB
  // =========================================================================
  async function initNetworkTab() {
    // Privacy rules toggle
    const netPrivacy = document.getElementById('netPrivacyEnabled');
    if (netPrivacy) {
      chrome.storage.local.get('pp_net_privacy_enabled', r => { if (netPrivacy) netPrivacy.checked = r.pp_net_privacy_enabled !== false; });
      netPrivacy.addEventListener('change', async () => {
        chrome.storage.local.set({ pp_net_privacy_enabled: netPrivacy.checked });
        await msg({ action: 'netInterceptEnablePrivacy', data: { enabled: netPrivacy.checked } });
      });
    }

    // Add header rule
    const btnAdd = document.getElementById('btnAddHeaderRule');
    if (btnAdd) btnAdd.addEventListener('click', async () => {
      const rule = {
        urlPattern: document.getElementById('ruleUrlPattern').value,
        headerName: document.getElementById('ruleHeaderName').value,
        headerValue: document.getElementById('ruleHeaderValue').value,
        type: document.getElementById('ruleHeaderType').value
      };
      if (!rule.urlPattern || !rule.headerName) { showNotif('URL pattern and header name required', true); return; }
      await msg({ action: 'netInterceptAddRule', data: rule });
      showNotif('Rule added');
    });

    // Load request logs
    const refreshLogs = async () => {
      const logs = await msg({ action: 'netInterceptGetLogs', data: { limit: 20 } });
      const logEl = document.getElementById('requestLog');
      const cntEl = document.getElementById('logCount');
      if (logEl && Array.isArray(logs)) {
        if (cntEl) cntEl.textContent = `(${logs.length} recent)`;
        logEl.innerHTML = logs.slice().reverse().map(r =>
          `<div style="padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.05);">` +
          `<span style="color:#6C5CE7">${r.method || 'GET'}</span> ` +
          `<span style="color:#00D2FF">${(r.url || '').substring(0, 80)}</span> ` +
          `<span style="color:var(--text-muted)">${r.type || ''} ${r.timing ? r.timing + 'ms' : ''}</span></div>`
        ).join('');
      }
    };
    refreshLogs();

    // Clear logs
    const btnClear = document.getElementById('btnClearLogs');
    if (btnClear) btnClear.addEventListener('click', async () => {
      await msg({ action: 'netInterceptClearLogs' });
      const logEl = document.getElementById('requestLog');
      if (logEl) logEl.innerHTML = '';
      showNotif('Logs cleared');
    });

    // Export HAR
    const btnHar = document.getElementById('btnExportHAR');
    if (btnHar) btnHar.addEventListener('click', async () => {
      const har = await msg({ action: 'netInterceptExportHAR' });
      if (har) {
        const blob = new Blob([typeof har === 'string' ? har : JSON.stringify(har, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `phantomprint-${Date.now()}.har`;
        a.click();
      }
    });
  }

  // =========================================================================
  // Helper: show notification
  // =========================================================================
  function showNotif(msg, isError) {
    let el = document.getElementById('opt-notif');
    if (!el) {
      el = document.createElement('div');
      el.id = 'opt-notif';
      el.style.cssText = 'position:fixed;top:20px;right:20px;background:rgba(15,15,26,0.95);border:1px solid rgba(108,92,231,0.5);border-radius:10px;padding:10px 18px;font-size:13px;color:#e8e8f0;z-index:9999;transition:all 0.3s;opacity:0;max-width:300px;box-shadow:0 8px 32px rgba(0,0,0,0.5);';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.borderColor = isError ? 'rgba(255,82,82,0.5)' : 'rgba(108,92,231,0.5)';
    el.style.opacity = '1';
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.style.opacity = '0'; }, 3000);
  }

})();
