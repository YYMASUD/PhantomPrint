// PhantomPrint Content Script
// Runs in isolated world - bridges extension storage/messaging with MAIN world injection
// CRITICAL: This MUST set config before the MAIN world script reads it.
// Strategy: Use synchronous storage read (chrome.storage is async, so we cache in localStorage
// from the isolated world which isn't visible to MAIN world — instead we use DOM attribute).
// The manifest loads this script BEFORE the MAIN world script (both at document_start),
// and Chrome processes content_scripts entries in order.
'use strict';

(async function() {
  // Get current state from background
  let state = null;
  try {
    state = await chrome.runtime.sendMessage({ action: 'getState' });
  } catch(e) {
    // Extension context invalidated - use defaults
    state = { enabled: true, sessionSeed: Date.now().toString(36), crossSiteIsolation: true, categories: { navigator: true, screen: true, canvas: true, webgl: true, audio: true, webrtc: true, fonts: true, timing: true, behavior: true, media: true, storage: true, network: true, hardware: true, plugins: true, privacy: true, location: true }, webrtcMode: 'ip_only', alwaysVisible: false, whitelist: [] };
  }

  if (!state || !state.enabled) return;

  // Check whitelist
  const hostname = window.location.hostname;
  const isWhitelisted = (state.whitelist || []).some(site => {
    if (site === hostname) return true;
    if (site.startsWith('.') && hostname.endsWith(site)) return true;
    if (hostname.endsWith('.' + site)) return true;
    return false;
  });

  if (isWhitelisted) return;

  // Inject configuration into the page via DOM attribute
  // This must happen BEFORE the MAIN world script reads it
  const config = {
    enabled: state.enabled,
    sessionSeed: state.sessionSeed,
    crossSiteIsolation: state.crossSiteIsolation,
    categories: state.categories,
    webrtcMode: state.webrtcMode,
    alwaysVisible: state.alwaysVisible,
    whitelist: state.whitelist
  };

  // Set config on documentElement for main world script to read
  document.documentElement.setAttribute('data-pp-config', JSON.stringify(config));

  // ALSO inject a tiny synchronous script that sets the config on window
  // This guarantees it runs before any other MAIN world scripts
  const inlineScript = document.createElement('script');
  inlineScript.textContent = `window.__pp_config__=${JSON.stringify(config)};`;
  (document.head || document.documentElement).prepend(inlineScript);
  inlineScript.remove();

  // Listen for state updates from background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'stateUpdated') {
      // Can't easily re-apply spoofing after page load, but update for next navigation
      sendResponse({ ok: true });
    }
    return false;
  });

  // Log fingerprinting attempts (detected by page behavior)
  function logAttempt(api, site) {
    try {
      chrome.runtime.sendMessage({
        action: 'log',
        data: { api, site: hostname, url: window.location.href }
      }).catch(() => {});
    } catch(e) {}
  }

  // Monitor for fingerprinting-related API calls via Performance Observer
  if (window.PerformanceObserver) {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          // Detect canvas/webgl fingerprinting by resource timing patterns
          if (entry.name && entry.name.includes('toDataURL')) {
            logAttempt('canvas', hostname);
          }
        }
      });
      observer.observe({ entryTypes: ['measure'] });
    } catch(e) {}
  }

  // Detect when fingerprinting scripts are loaded
  const knownFPScripts = ['fingerprintjs', 'fpjs', 'creepjs', 'clientjs', 'evercookie'];
  const scriptObserver = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.tagName === 'SCRIPT' && node.src) {
          const src = node.src.toLowerCase();
          for (const fp of knownFPScripts) {
            if (src.includes(fp)) {
              logAttempt('fingerprint_script:' + fp, hostname);
              break;
            }
          }
        }
      }
    }
  });

  if (document.documentElement) {
    scriptObserver.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
