// PhantomPrint v5.0 — Content Script
// Runs at document_start. Injects config + all spoofing scripts into main world.
(function() {
  "use strict";

  var url = window.location.href;
  if (url.startsWith("chrome://") || url.startsWith("chrome-extension://") ||
      url.startsWith("about:") || url.startsWith("edge://") ||
      url.startsWith("moz-extension://")) return;

  var domain = window.location.hostname;

  // Get real Chrome version for dynamic UA building
  var realChromeVersion = "136";
  try {
    var m = navigator.userAgent.match(/Chrome\/(\d+)/);
    if (m) realChromeVersion = m[1];
  } catch(e) {}

  chrome.storage.local.get([
    "isEnabled", "fingerprintProfile", "modules", "seed",
    "noiseLevel", "whitelist", "perSiteProfiles",
    "timezoneMode", "customTimezone", "ipLocation",
    "pp_history"
  ], function(data) {
    if (data.isEnabled === false) return;

    // Whitelist check
    var wl = data.whitelist || [];
    for (var i = 0; i < wl.length; i++) {
      if (domain === wl[i] || domain.endsWith("." + wl[i])) return;
    }

    var profile = data.fingerprintProfile;
    if (!profile) return;

    // Deep clone
    profile = JSON.parse(JSON.stringify(profile));

    // Per-site profile
    var perSite = data.perSiteProfiles || {};
    if (perSite[domain]) {
      profile = JSON.parse(JSON.stringify(perSite[domain]));
    }

    // ALWAYS update Chrome version to match real browser (avoids UA mismatch detection)
    if (profile.userAgent && profile.userAgent.includes("Chrome/")) {
      profile.userAgent = profile.userAgent.replace(
        /Chrome\/\d+(\.\d+)*/,
        "Chrome/" + realChromeVersion + ".0.0.0"
      );
      if (profile.appVersion) {
        profile.appVersion = profile.appVersion.replace(
          /Chrome\/\d+(\.\d+)*/,
          "Chrome/" + realChromeVersion + ".0.0.0"
        );
      }
      // Update client hints major version too
      if (profile.clientHints) {
        if (profile.clientHints.brands) {
          profile.clientHints.brands = profile.clientHints.brands.map(function(b) {
            if (b.brand === 'Chromium' || b.brand === 'Google Chrome' || b.brand === 'Microsoft Edge') {
              return { brand: b.brand, version: realChromeVersion };
            }
            return b;
          });
        }
        if (profile.clientHints.fullVersionList) {
          profile.clientHints.fullVersionList = profile.clientHints.fullVersionList.map(function(b) {
            if (b.brand === 'Chromium' || b.brand === 'Google Chrome' || b.brand === 'Microsoft Edge') {
              return { brand: b.brand, version: realChromeVersion + '.0.0.0' };
            }
            return b;
          });
        }
      }
    }

    // Clone modules so we can modify
    var modules = JSON.parse(JSON.stringify(data.modules || {}));

    // ═══ TIMEZONE HANDLING ═══
    var ipLoc = data.ipLocation;
    var tzMode = data.timezoneMode || "auto";

    if (tzMode === "auto") {
      // Auto = use system timezone, DON'T spoof at all
      profile.timezone = null;
      modules.timezone = false;
    } else if (tzMode === "ip" && ipLoc && ipLoc.timezone) {
      profile.timezone = ipLoc.timezone;
      if (ipLoc.languages) {
        profile.languages = ipLoc.languages;
        profile.language = ipLoc.languages[0];
      }
    } else if (tzMode === "custom" && data.customTimezone) {
      profile.timezone = data.customTimezone;
    } else if (tzMode === "profile") {
      // Keep profile timezone as-is
    } else {
      // Fallback: don't spoof
      profile.timezone = null;
      modules.timezone = false;
    }

    var config = {
      enabled: true,
      profile: profile,
      modules: modules,
      seed: data.seed || Date.now(),
      noiseLevel: data.noiseLevel || "medium"
    };

    // ── Inject config as a non-enumerable, self-deleting window property ──────
    // Using a DOM element (the old approach) is detectable: any page script can
    // call document.getElementById('__phantomprint_cfg__') during the window
    // in which the element exists. Using a non-enumerable window property avoids
    // DOM fingerprinting entirely. The property is deleted by extra-spoof.js
    // (the last injected module) once all scripts have consumed it.
    var configScript = document.createElement("script");
    configScript.textContent =
      "Object.defineProperty(window,'__pp_cfg__',{value:" + JSON.stringify(config) +
      ",writable:false,configurable:true,enumerable:false});";
    (document.head || document.documentElement).prepend(configScript);
    configScript.remove(); // Remove the script element immediately after injection

    // ── Inject all spoofing scripts in correct order ──
    // Order matters: inject.js FIRST (sets up PRNG, native masking, __ppNatives),
    // then uadata-spoof (needs __ppNatives), then webgpu-spoof, then extra-spoof
    // (owns cleanup of __pp_cfg__ and __ppNatives).
    var scripts = [
      "inject/inject.js",        // Core: navigator, screen, canvas, webgl, audio, fonts, webrtc, rects, timezone, battery, speech, media, timing, storage
      "inject/uadata-spoof.js",  // navigator.userAgentData (UA Client Hints JS API)
      "inject/webgpu-spoof.js",  // WebGPU API spoofing
      "inject/extra-spoof.js"    // Geolocation, matchMedia, Permissions, Keyboard, Network + cleanup
    ];

    // Inject sequentially to maintain order
    function injectNext(index) {
      if (index >= scripts.length) return;
      var script = document.createElement("script");
      script.src = chrome.runtime.getURL(scripts[index]);
      script.onload = function() {
        script.remove();
        injectNext(index + 1);
      };
      script.onerror = function() {
        script.remove();
        injectNext(index + 1);
      };
      (document.head || document.documentElement).prepend(script);
    }

    injectNext(0);

    // ── Record visit in fingerprint history ──
    try {
      var history = data.pp_history || [];
      var entry = {
        domain: domain,
        profileId: profile.id || (profile.os + '_' + (profile.browser || 'chrome')),
        os: profile.os,
        browser: profile.browser || 'Chrome',
        ts: Date.now()
      };
      history.unshift(entry);
      if (history.length > 200) history = history.slice(0, 200);
      chrome.storage.local.set({ pp_history: history });
    } catch(e) {}
  });

  // Listen for messages from popup/background
  chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
    if (msg.action === "applyFingerprint") {
      window.location.reload();
    }
    return true;
  });
})();
