/**
 * PhantomPrint Popup — Controller
 * Manages popup state, toggle interactions, and service worker communication.
 */
'use strict';

(function() {
  // =========================================================================
  // DOM References
  // =========================================================================
  const $ = (id) => document.getElementById(id);
  const masterSwitch = $('masterSwitch');
  const scoreValue = $('scoreValue');
  const gaugeCircle = $('gaugeCircle');
  const profileName = $('profileName');
  const profBrowser = $('profBrowser');
  const profOS = $('profOS');
  const profScreen = $('profScreen');
  const profGPU = $('profGPU');
  const profProxy = $('profProxy');
  const riskFill = $('riskFill');
  const riskScore = $('riskScore');
  const blockedCount = $('blockedCount');
  const togglesGrid = $('togglesGrid');
  const popup = document.querySelector('.popup');

  // =========================================================================
  // State
  // =========================================================================
  let state = null;

  // =========================================================================
  // Initialize
  // =========================================================================
  async function init() {
    try {
      state = await sendMessage({ action: 'getState' });
    } catch (e) {
      state = getDefaultState();
    }
    renderState();
    bindEvents();
    loadSiteInfo();
  }

  function getDefaultState() {
    return {
      enabled: true,
      categories: {
        canvas: true, webgl: true, audio: true, webrtc: true,
        fonts: true, timezone: true, behavior: true, headers: true,
        storage: true, proxy: false
      },
      sessionSeed: 'default',
      profileName: 'Default Profile'
    };
  }

  // =========================================================================
  // Render
  // =========================================================================
  async function renderState() {
    if (!state) return;

    // Master toggle
    masterSwitch.checked = state.enabled !== false;
    popup.classList.toggle('disabled', !state.enabled);

    // Protection score (async — queries storage for module states)
    const score = await calculateScore(state);
    updateGauge(score);

    // Profile info
    profileName.textContent = state.profileName || 'Default Profile';
    profBrowser.textContent = (state._profile && state._profile.browser) || 'Chrome 136';
    profOS.textContent = (state._profile && state._profile.os) || 'Windows 11';
    profScreen.textContent = (state._profile && state._profile.screen)
      ? `${state._profile.screen.width}×${state._profile.screen.height}`
      : '1920×1080';
    profGPU.textContent = (state._profile && state._profile.gpu) || 'NVIDIA RTX 4070';
    profGPU.title = (state._profile && state._profile.gpu) || '';

    // Proxy status
    if (state._proxyActive) {
      profProxy.innerHTML = '<span class="status-dot dot-on"></span> Connected';
    } else {
      profProxy.innerHTML = '<span class="status-dot dot-off"></span> Not Set';
    }

    // Category toggles
    const cats = state.categories || {};
    togglesGrid.querySelectorAll('input[data-key]').forEach(input => {
      const key = input.dataset.key;
      input.checked = cats[key] !== false;
    });
  }

  async function calculateScore(state) {
    if (!state.enabled) return 0;
    let score = 10; // Base for being enabled

    // Core spoofing categories (max 50pts)
    const cats = state.categories || {};
    const coreKeys = ['canvas','webgl','audio','webrtc','fonts','timezone','behavior','headers','storage','proxy'];
    const coreEnabled = coreKeys.filter(k => cats[k] !== false).length;
    score += Math.round((coreEnabled / coreKeys.length) * 50);

    // Advanced modules (max 40pts, 5pts each)
    try {
      const stored = await chrome.storage.local.get([
        'pp_tracker_enabled', 'pp_replay_enabled', 'pp_link_cleaner_enabled',
        'pp_referrer_mode', 'pp_doh_enabled', 'pp_net_privacy_enabled'
      ]);
      const moduleChecks = [
        stored.pp_tracker_enabled !== false,           // Tracker blocker
        !!stored.pp_replay_enabled,                    // Session replay prevention
        stored.pp_link_cleaner_enabled !== false,       // Link cleaner
        stored.pp_referrer_mode && stored.pp_referrer_mode !== 'off', // Referrer control
        !!stored.pp_doh_enabled,                       // DNS-over-HTTPS
        stored.pp_net_privacy_enabled !== false,        // Network privacy headers
        !!state._proxyActive,                          // Proxy connected
        !!state.crossSiteIsolation                     // Cross-site isolation
      ];
      score += moduleChecks.filter(Boolean).length * 5;
    } catch (e) {
      // Fallback: just add crossSiteIsolation and proxy
      if (state.crossSiteIsolation) score += 5;
      if (state._proxyActive) score += 5;
    }

    return Math.min(100, score);
  }

  function updateGauge(score) {
    const circumference = 314; // 2 * PI * 50
    const offset = circumference - (score / 100) * circumference;
    gaugeCircle.style.strokeDashoffset = offset;
    scoreValue.textContent = score;

    // Color based on score
    if (score >= 70) gaugeCircle.style.stroke = '#6C5CE7';
    else if (score >= 40) gaugeCircle.style.stroke = '#FFB74D';
    else gaugeCircle.style.stroke = '#FF5252';
  }

  async function loadSiteInfo() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.url) return;

      const url = new URL(tab.url);
      const host = url.hostname;

      // Get monitoring data for this site
      const data = await sendMessage({ action: 'getSiteMonitoring', site: host });
      if (data) {
        const risk = data.riskScore || 0;
        riskFill.style.width = `${risk}%`;

        if (risk <= 30) {
          riskFill.className = 'risk-fill';
          riskScore.textContent = 'Low';
          riskScore.className = 'risk-score';
        } else if (risk <= 60) {
          riskFill.className = 'risk-fill medium';
          riskScore.textContent = 'Medium';
          riskScore.className = 'risk-score medium';
        } else {
          riskFill.className = 'risk-fill high';
          riskScore.textContent = 'High';
          riskScore.className = 'risk-score high';
        }

        blockedCount.textContent = data.totalCalls || 0;
      }
    } catch (e) {
      // Tab access may fail
    }
  }

  // =========================================================================
  // Events
  // =========================================================================
  function bindEvents() {
    // Master toggle
    masterSwitch.addEventListener('change', async () => {
      state.enabled = masterSwitch.checked;
      popup.classList.toggle('disabled', !state.enabled);
      updateGauge(calculateScore(state));
      await sendMessage({ action: 'updateState', key: 'enabled', value: state.enabled });
    });

    // Category toggles
    togglesGrid.querySelectorAll('input[data-key]').forEach(input => {
      input.addEventListener('change', async () => {
        const key = input.dataset.key;
        if (!state.categories) state.categories = {};
        state.categories[key] = input.checked;
        updateGauge(calculateScore(state));
        await sendMessage({ action: 'updateState', key: `categories.${key}`, value: input.checked });
      });
    });

    // Toggle dropdown
    $('randomizeMenu').addEventListener('click', (e) => {
      e.stopPropagation();
      $('randomizeDropdown').classList.toggle('hidden');
    });

    // Close dropdown on click outside
    document.addEventListener('click', () => {
      if ($('randomizeDropdown')) {
        $('randomizeDropdown').classList.add('hidden');
      }
    });

    // Dropdown items click handlers
    document.querySelectorAll('.dropdown-item').forEach(item => {
      item.addEventListener('click', async (e) => {
        e.stopPropagation();
        $('randomizeDropdown').classList.add('hidden');
        
        $('randomizeBtn').classList.add('spinning');
        
        try {
          const action = item.dataset.action === 'atoz' ? 'randomizeAtoZ' : 'randomize';
          const constraints = item.dataset.action === 'atoz' ? {} : {
            os: item.dataset.os || undefined,
            browser: item.dataset.browser || undefined
          };
          
          const result = await sendMessage({ action, data: constraints });
          if (result) {
            state = { ...state, ...result };
            renderState();
            
            $('scoreValue').classList.add('flash');
            setTimeout(() => $('scoreValue').classList.remove('flash'), 600);
          }
        } catch (err) {
          console.error(err);
        } finally {
          $('randomizeBtn').classList.remove('spinning');
        }
      });
    });

    // Randomize Button (default full randomize)
    $('randomizeBtn').addEventListener('click', async () => {
      $('randomizeBtn').classList.add('spinning');
      try {
        const result = await sendMessage({ action: 'randomize', data: {} });
        if (result) {
          state = { ...state, ...result };
          renderState();
          
          $('scoreValue').classList.add('flash');
          setTimeout(() => $('scoreValue').classList.remove('flash'), 600);
        }
      } catch (err) {
        console.error(err);
      } finally {
        $('randomizeBtn').classList.remove('spinning');
      }
    });

    // Dashboard button
    $('dashboardBtn').addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
      window.close();
    });

    // Test button
    $('testBtn').addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('test/fingerprint-test.html') });
      window.close();
    });

    // Settings button
    $('settingsBtn').addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
      window.close();
    });

    // Cookie Manager button
    $('cookieBtn').addEventListener('click', () => {
      sendMessage({ action: 'openCookieManager' });
      window.close();
    });

    // Whitelist button
    $('whitelistBtn').addEventListener('click', async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.url) {
          const host = new URL(tab.url).hostname;
          await sendMessage({ action: 'addWhitelist', site: host });
          $('whitelistBtn').textContent = '✓ Whitelisted';
          $('whitelistBtn').style.borderColor = '#00E676';
          $('whitelistBtn').style.color = '#00E676';
        }
      } catch (e) {}
    });

    // =========================================================================
    // NEW MODULE QUICK TOGGLES
    // =========================================================================

    // Tracker Blocker toggle
    const trackerToggle = $('trackerToggle');
    if (trackerToggle) {
      // Load current state
      chrome.storage.local.get('pp_tracker_enabled', r => {
        trackerToggle.checked = r.pp_tracker_enabled !== false;
      });
      trackerToggle.addEventListener('change', async () => {
        const enabled = trackerToggle.checked;
        chrome.storage.local.set({ pp_tracker_enabled: enabled });
        if (enabled) {
          await sendMessage({ action: 'trackerInit' });
        } else {
          // Remove all tracker DNR rules (5000-5999)
          const ruleIds = Array.from({length: 1000}, (_, i) => 5000 + i);
          chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: ruleIds }).catch(() => {});
        }
        showToast('Tracker Blocker ' + (enabled ? 'Enabled' : 'Disabled'));
      });
    }

    // Session Replay Prevention toggle
    const replayToggle = $('replayToggle');
    if (replayToggle) {
      chrome.storage.local.get('pp_replay_enabled', r => {
        replayToggle.checked = !!r.pp_replay_enabled;
      });
      replayToggle.addEventListener('change', async () => {
        const enabled = replayToggle.checked;
        chrome.storage.local.set({ pp_replay_enabled: enabled });
        if (enabled) await sendMessage({ action: 'replayEnable' });
        else await sendMessage({ action: 'replayDisable' });
        showToast('Session Replay Prevention ' + (enabled ? 'Enabled' : 'Disabled'));
      });
    }

    // Link Cleaner toggle
    const linkCleanToggle = $('linkCleanToggle');
    if (linkCleanToggle) {
      chrome.storage.local.get('pp_link_cleaner_enabled', r => {
        linkCleanToggle.checked = r.pp_link_cleaner_enabled !== false;
      });
      linkCleanToggle.addEventListener('change', async () => {
        const enabled = linkCleanToggle.checked;
        chrome.storage.local.set({ pp_link_cleaner_enabled: enabled });
        if (enabled) await sendMessage({ action: 'linkCleanerEnable' });
        else await sendMessage({ action: 'linkCleanerDisable' });
        showToast('Link Cleaner ' + (enabled ? 'Enabled' : 'Disabled'));
      });
    }
  }

  // =========================================================================
  // Toast notification
  // =========================================================================
  function showToast(msg) {
    let el = document.getElementById('pp-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'pp-toast';
      el.style.cssText = 'position:fixed;bottom:64px;left:50%;transform:translateX(-50%) translateY(8px);background:rgba(20,20,40,0.95);border:1px solid rgba(108,92,231,0.4);border-radius:8px;padding:8px 16px;font-size:12px;color:#e8e8f0;z-index:9999;transition:all 0.3s;pointer-events:none;opacity:0;white-space:nowrap;';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = '1';
    el.style.transform = 'translateX(-50%) translateY(0)';
    clearTimeout(el._timer);
    el._timer = setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateX(-50%) translateY(8px)';
    }, 2000);
  }

  // =========================================================================
  // Messaging
  // =========================================================================
  function sendMessage(msg) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(msg, (response) => {
        resolve(response || {});
      });
    });
  }

  // =========================================================================
  // Boot
  // =========================================================================
  document.addEventListener('DOMContentLoaded', init);
})();
