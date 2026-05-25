// PhantomPrint v5.2 — Content Script
// Runs at document_start. Injects config + inject.js into main world.
(function() {
  "use strict";

  var url = window.location.href;
  if (url.startsWith("chrome://") || url.startsWith("chrome-extension://") ||
      url.startsWith("about:") || url.startsWith("edge://") ||
      url.startsWith("moz-extension://")) return;

  var domain = window.location.hostname;

  // Get real Chrome version for dynamic UA building
  var realChromeVersion = "148";
  try {
    var m = navigator.userAgent.match(/Chrome\/(\d+)/);
    if (m) realChromeVersion = m[1];
  } catch(e) {}

  chrome.storage.local.get([
    "isEnabled", "fingerprintProfile", "modules", "seed",
    "noiseLevel", "whitelist", "perSiteProfiles",
    "timezoneMode", "customTimezone", "ipLocation"
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

    // ALWAYS update Chrome version to match real browser
    if (profile.userAgent && profile.userAgent.includes("Chrome/")) {
      profile.userAgent = profile.userAgent.replace(
        /Chrome\/\d+\.\d+\.\d+\.\d+/,
        "Chrome/" + realChromeVersion + ".0.0.0"
      );
      if (profile.appVersion) {
        profile.appVersion = profile.appVersion.replace(
          /Chrome\/\d+\.\d+\.\d+\.\d+/,
          "Chrome/" + realChromeVersion + ".0.0.0"
        );
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
      modules.timezone = false; // FORCE disable timezone module
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

    // Inject config as hidden element
    var el = document.createElement("script");
    el.type = "application/json";
    el.id = "__phantomprint_cfg__";
    el.textContent = JSON.stringify(config);
    (document.head || document.documentElement).prepend(el);

    // Inject spoofing script into main world
    var script = document.createElement("script");
    script.src = chrome.runtime.getURL("inject/inject.js");
    script.onload = function() { script.remove(); };
    (document.head || document.documentElement).prepend(script);
  });

  // Listen for messages from popup/background
  chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
    if (msg.action === "applyFingerprint") {
      window.location.reload();
    }
    return true;
  });
})();
