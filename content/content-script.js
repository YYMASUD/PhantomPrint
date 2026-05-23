// PhantomPrint Content Script v3.0
// Runs in isolated world - bridges extension storage/messaging with MAIN world injection
// Handles: config injection, mobile emulation data, SDP scrub patterns,
//          session replay detection, link cleaner badge updates, monitoring
'use strict';

(async function() {
  // =========================================================================
  // STATE FETCH
  // =========================================================================
  let state = null;
  try {
    state = await chrome.runtime.sendMessage({ action: 'getState' });
  } catch(e) {
    // Extension context invalidated - use defaults
    state = {
      enabled: true, sessionSeed: Date.now().toString(36), crossSiteIsolation: true,
      categories: { navigator:true, screen:true, canvas:true, webgl:true, audio:true, webrtc:true,
        fonts:true, timing:true, behavior:true, media:true, storage:true, network:true,
        hardware:true, plugins:true, privacy:true, location:true },
      webrtcMode: 'ip_only', alwaysVisible: false, whitelist: []
    };
  }

  if (!state || !state.enabled) return;

  // =========================================================================
  // WHITELIST CHECK
  // =========================================================================
  const hostname = window.location.hostname;
  const isWhitelisted = (state.whitelist || []).some(site => {
    if (site === hostname) return true;
    if (site.startsWith('*') && hostname.endsWith(site.slice(1))) return true;
    if (hostname.endsWith('.' + site)) return true;
    return site === hostname;
  });
  if (isWhitelisted) return;

  // =========================================================================
  // FETCH EXTRA DATA IN PARALLEL
  // =========================================================================
  const [webglData, uaData, statData, amiuniqueData, mobileProfiles, sdpPatterns] = await Promise.all([
    fetch(chrome.runtime.getURL('data/webgl-profiles.json')).then(r => r.json()).catch(() => null),
    fetch(chrome.runtime.getURL('data/user-agents-data.json')).then(r => r.json()).catch(() => null),
    fetch(chrome.runtime.getURL('data/statcounter-data.json')).then(r => r.json()).catch(() => null),
    fetch(chrome.runtime.getURL('data/amiunique-distributions.json')).then(r => r.json()).catch(() => null),
    // Fetch mobile emulation profiles from background (loaded from mobile-emulation.js)
    chrome.runtime.sendMessage({ action: 'getMobileProfiles' }).catch(() => null),
    // Fetch SDP scrub patterns from webrtc-control module
    chrome.runtime.sendMessage({ action: 'webrtcGetSdpPatterns', data: {} }).catch(() => [])
  ]);

  // =========================================================================
  // BUILD CONFIG PAYLOAD
  // =========================================================================
  const config = {
    enabled: state.enabled,
    sessionSeed: state.sessionSeed,
    crossSiteIsolation: state.crossSiteIsolation,
    categories: state.categories,
    webrtcMode: state.webrtcMode,
    alwaysVisible: state.alwaysVisible,
    whitelist: state.whitelist,
    // New module flags
    mobileProfileName: state.mobileProfileName || null,
    replayPreventionEnabled: state.replayPreventionEnabled || false,
    linkCleanerEnabled: state.linkCleanerEnabled || true,
    referrerMode: state.referrerMode || 'smart',
    _fullProfile: state._fullProfile || null,
    // Data payloads
    __dataModules__: { webglData, uaData, statData, amiuniqueData },
    __mobileProfiles__: mobileProfiles || null,
    __sdpPatterns__: Array.isArray(sdpPatterns) ? sdpPatterns : []
  };

  // Set config attribute for any other readers
  document.documentElement.setAttribute('data-pp-config', JSON.stringify({
    enabled: config.enabled,
    sessionSeed: config.sessionSeed,
    categories: config.categories
  }));

  // =========================================================================
  // INJECT CONFIG TO MAIN WORLD (synchronous, runs before any page scripts)
  // =========================================================================
  const inlineScript = document.createElement('script');
  inlineScript.textContent = 'window.__pp_config__=' + JSON.stringify(config) + ';';
  (document.head || document.documentElement).prepend(inlineScript);
  inlineScript.remove();

  // =========================================================================
  // SESSION REPLAY DETECTION (DOM-level, isolated world)
  // =========================================================================
  const REPLAY_SCRIPT_PATTERNS = [
    'hotjar.com', 'fullstory.com', 'logrocket.io', 'mouseflow.com', 'clarity.ms',
    'heapanalytics.com', 'smartlook.com', 'crazyegg.com', 'inspectlet.com',
    'contentsquare.net', 'quantum-metric.com', 'medallia.com', 'qualtrics.com'
  ];
  const FINGERPRINT_SCRIPT_PATTERNS = [
    'fingerprintjs', 'fpjs', 'creepjs', 'clientjs', 'evercookie', 'fp.clarity',
    'threatmetrix', 'iovation', 'sardine.ai', 'kount.com', 'sift.com'
  ];

  const scriptObserver = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.tagName !== 'SCRIPT' || !node.src) continue;
        const src = node.src.toLowerCase();

        // Check for session replay scripts
        if (REPLAY_SCRIPT_PATTERNS.some(p => src.includes(p))) {
          logAttempt('session_replay_script:' + src.split('/')[2], hostname);
          // Notify service worker to record this detection
          chrome.runtime.sendMessage({ action: 'replayAddSite', data: { domain: hostname } }).catch(() => {});
          // Update badge to warn
          chrome.runtime.sendMessage({ action: 'updateBadge', data: { color: '#FF5252', text: 'SPY' } }).catch(() => {});
        }

        // Check for fingerprinting scripts
        if (FINGERPRINT_SCRIPT_PATTERNS.some(p => src.includes(p))) {
          logAttempt('fingerprint_script:' + src.split('/')[2], hostname);
          chrome.runtime.sendMessage({ action: 'updateBadge', data: { color: '#FFB74D', text: 'FP!' } }).catch(() => {});
        }
      }
    }
  });

  if (document.documentElement) {
    scriptObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  // =========================================================================
  // LINK CLEANER BADGE UPDATE
  // =========================================================================
  (function() {
    const url = window.location.href;
    const trackingParams = [
      'utm_source','utm_medium','utm_campaign','utm_term','utm_content',
      'fbclid','gclid','msclkid','ttclid','dclid','twclid'
    ];
    const params = new URLSearchParams(window.location.search);
    const found = trackingParams.filter(p => params.has(p));
    if (found.length > 0) {
      chrome.runtime.sendMessage({ action: 'linkCleanerIncrement', data: { count: found.length } }).catch(() => {});
    }
  })();

  // =========================================================================
  // MONITORING: Track fingerprinting API usage via postMessage bridge
  // =========================================================================
  window.addEventListener('message', evt => {
    if (evt.source !== window || !evt.data || evt.data.__pp_source !== 'main-world') return;
    const { type, api, details } = evt.data;
    if (type === 'fp_api_call') {
      chrome.runtime.sendMessage({
        action: 'monitoringRecordCall',
        data: { api, site: hostname, url: window.location.href, details }
      }).catch(() => {});
    }
    // Handle fatal inject script errors — flash badge red
    if (type === 'fatal_error') {
      chrome.runtime.sendMessage({
        action: 'injectError',
        data: { msg: evt.data.msg, stack: evt.data.stack, site: hostname }
      }).catch(() => {});
    }
  }, false);

  // =========================================================================
  // STATE UPDATES FROM BACKGROUND
  // =========================================================================
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'stateUpdated') {
      sendResponse({ ok: true });
    }
    return false;
  });

  // =========================================================================
  // HELPER
  // =========================================================================
  function logAttempt(api, site) {
    try {
      chrome.runtime.sendMessage({
        action: 'log',
        data: { api, site: hostname, url: window.location.href }
      }).catch(() => {});
    } catch(e) {}
  }

})();
