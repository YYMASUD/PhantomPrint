// PhantomPrint — Extra Spoofing Module
// Covers: Geolocation, matchMedia, Permissions API, Keyboard Layout, Network Info
// Must run in MAIN world before any page scripts
(function() {
  "use strict";

  const cfgEl = document.getElementById("__phantomprint_cfg__");
  if (!cfgEl) return;
  let CFG;
  try { CFG = JSON.parse(cfgEl.textContent); } catch(e) { return; }
  if (!CFG || !CFG.enabled) return;

  const P = CFG.profile;
  const MOD = CFG.modules || {};
  const SEED = CFG.seed || Date.now();

  const _defineProperty = Object.defineProperty;
  const _call = Function.prototype.call;
  const _toString = Function.prototype.toString;
  const nativeStrings = new WeakMap();

  function regNative(fn, name) {
    const n = name || fn.name || "";
    nativeStrings.set(fn, "function " + n + "() { [native code] }");
    try { _defineProperty(fn, "name", { value: n, configurable: true }); } catch(e) {}
    return fn;
  }

  // Patch toString to cover our new natives
  const existingToString = Function.prototype.toString;
  const patchedToString = function toString() {
    if (nativeStrings.has(this)) return nativeStrings.get(this);
    return _call.call(existingToString, this);
  };
  nativeStrings.set(patchedToString, "function toString() { [native code] }");
  try {
    _defineProperty(Function.prototype, "toString", {
      value: patchedToString, writable: true, configurable: true, enumerable: false
    });
  } catch(e) {}

  // ═══ 1. GEOLOCATION SPOOFING ═══
  if (MOD.geolocation !== false && P) {
    try {
      // Derive lat/lng from timezone
      const TZ_COORDS = {
        'America/New_York':     { lat: 40.7128,  lng: -74.0060  },
        'America/Chicago':      { lat: 41.8781,  lng: -87.6298  },
        'America/Denver':       { lat: 39.7392,  lng: -104.9903 },
        'America/Los_Angeles':  { lat: 34.0522,  lng: -118.2437 },
        'America/Toronto':      { lat: 43.6532,  lng: -79.3832  },
        'America/Vancouver':    { lat: 49.2827,  lng: -123.1207 },
        'America/Sao_Paulo':    { lat: -23.5505, lng: -46.6333  },
        'America/Mexico_City':  { lat: 19.4326,  lng: -99.1332  },
        'America/Buenos_Aires': { lat: -34.6037, lng: -58.3816  },
        'Europe/London':        { lat: 51.5074,  lng: -0.1278   },
        'Europe/Paris':         { lat: 48.8566,  lng: 2.3522    },
        'Europe/Berlin':        { lat: 52.5200,  lng: 13.4050   },
        'Europe/Madrid':        { lat: 40.4168,  lng: -3.7038   },
        'Europe/Rome':          { lat: 41.9028,  lng: 12.4964   },
        'Europe/Amsterdam':     { lat: 52.3676,  lng: 4.9041    },
        'Europe/Warsaw':        { lat: 52.2297,  lng: 21.0122   },
        'Europe/Stockholm':     { lat: 59.3293,  lng: 18.0686   },
        'Europe/Moscow':        { lat: 55.7558,  lng: 37.6173   },
        'Europe/Istanbul':      { lat: 41.0082,  lng: 28.9784   },
        'Asia/Tokyo':           { lat: 35.6762,  lng: 139.6503  },
        'Asia/Seoul':           { lat: 37.5665,  lng: 126.9780  },
        'Asia/Shanghai':        { lat: 31.2304,  lng: 121.4737  },
        'Asia/Taipei':          { lat: 25.0330,  lng: 121.5654  },
        'Asia/Singapore':       { lat: 1.3521,   lng: 103.8198  },
        'Asia/Bangkok':         { lat: 13.7563,  lng: 100.5018  },
        'Asia/Kolkata':         { lat: 28.6139,  lng: 77.2090   },
        'Asia/Dubai':           { lat: 25.2048,  lng: 55.2708   },
        'Asia/Riyadh':          { lat: 24.7136,  lng: 46.6753   },
        'Asia/Ho_Chi_Minh':     { lat: 10.8231,  lng: 106.6297  },
        'Asia/Jakarta':         { lat: -6.2088,  lng: 106.8456  },
        'Asia/Kuala_Lumpur':    { lat: 3.1390,   lng: 101.6869  },
        'Australia/Sydney':     { lat: -33.8688, lng: 151.2093  },
        'Pacific/Auckland':     { lat: -36.8485, lng: 174.7633  },
        'Africa/Cairo':         { lat: 30.0444,  lng: 31.2357   },
        'Africa/Lagos':         { lat: 6.5244,   lng: 3.3792    }
      };

      const tz = P.timezone ? (P.timezone.zone || P.timezone) : null;
      let baseCoords = TZ_COORDS[tz] || { lat: 40.7128, lng: -74.0060 };

      // Add small deterministic noise based on seed
      const seedNum = typeof SEED === 'number' ? SEED : parseInt(String(SEED).slice(-8), 10);
      const latNoise = ((seedNum % 1000) / 1000 - 0.5) * 0.2;
      const lngNoise = (((seedNum >> 3) % 1000) / 1000 - 0.5) * 0.2;

      const fakeCoords = {
        latitude: baseCoords.lat + latNoise,
        longitude: baseCoords.lng + lngNoise,
        altitude: null,
        accuracy: 20 + (seedNum % 30),
        altitudeAccuracy: null,
        heading: null,
        speed: null
      };

      const fakePosition = {
        coords: fakeCoords,
        timestamp: Date.now()
      };

      if (navigator.geolocation) {
        const origGeo = navigator.geolocation;

        const fakeGeo = {
          getCurrentPosition: regNative(function getCurrentPosition(success, error, options) {
            setTimeout(function() {
              if (typeof success === 'function') {
                success(fakePosition);
              }
            }, 50 + (seedNum % 200));
          }, 'getCurrentPosition'),

          watchPosition: regNative(function watchPosition(success, error, options) {
            const id = Math.floor(Math.random() * 100000);
            setTimeout(function() {
              if (typeof success === 'function') {
                success(fakePosition);
              }
            }, 50);
            return id;
          }, 'watchPosition'),

          clearWatch: regNative(function clearWatch(id) {}, 'clearWatch')
        };

        _defineProperty(Navigator.prototype, 'geolocation', {
          get: regNative(function() { return fakeGeo; }, 'get geolocation'),
          configurable: true,
          enumerable: true
        });
      }
    } catch(e) {}
  }

  // ═══ 2. CSS MEDIA QUERY SPOOFING ═══
  if (MOD.media !== false && P) {
    try {
      const prefersColorScheme = P.prefersColorScheme || 'light';
      const prefersReducedMotion = P.prefersReducedMotion ? 'reduce' : 'no-preference';
      const colorGamut = P.colorGamut || 'srgb';
      const forcedColors = P.forcedColors ? 'active' : 'none';
      const prefersContrast = P.prefersContrast ? 'more' : 'no-preference';
      const isMobile = P.mobile || false;
      const pointerType = isMobile ? 'coarse' : 'fine';
      const hoverType = isMobile ? 'none' : 'hover';
      const displayMode = 'browser';

      // Map of media feature → spoofed value
      const MEDIA_OVERRIDES = {
        'prefers-color-scheme': {
          'dark': prefersColorScheme === 'dark',
          'light': prefersColorScheme === 'light'
        },
        'prefers-reduced-motion': {
          'reduce': prefersReducedMotion === 'reduce',
          'no-preference': prefersReducedMotion === 'no-preference'
        },
        'color-gamut': {
          'srgb': true,
          'p3': colorGamut === 'p3' || colorGamut === 'rec2020',
          'rec2020': colorGamut === 'rec2020'
        },
        'forced-colors': {
          'active': forcedColors === 'active',
          'none': forcedColors === 'none'
        },
        'prefers-contrast': {
          'more': prefersContrast === 'more',
          'less': false,
          'no-preference': prefersContrast === 'no-preference'
        },
        'pointer': {
          'coarse': pointerType === 'coarse',
          'fine': pointerType === 'fine',
          'none': false
        },
        'hover': {
          'hover': hoverType === 'hover',
          'none': hoverType === 'none'
        },
        'any-pointer': {
          'coarse': isMobile,
          'fine': !isMobile,
          'none': false
        },
        'any-hover': {
          'hover': !isMobile,
          'none': isMobile
        },
        'display-mode': {
          'browser': true,
          'standalone': false,
          'fullscreen': false,
          'minimal-ui': false
        },
        'prefers-reduced-data': {
          'reduce': false,
          'no-preference': true
        },
        'prefers-reduced-transparency': {
          'reduce': false,
          'no-preference': true
        },
        'dynamic-range': {
          'high': P.dynamicRange || false,
          'standard': !(P.dynamicRange || false)
        },
        'inverted-colors': {
          'inverted': false,
          'none': true
        }
      };

      function checkMediaQuery(query) {
        // Parse the query to find feature:value pairs
        const lq = query.toLowerCase().trim();

        for (const [feature, values] of Object.entries(MEDIA_OVERRIDES)) {
          if (lq.includes(feature)) {
            for (const [value, matches] of Object.entries(values)) {
              if (lq.includes(value)) {
                return matches;
              }
            }
          }
        }
        return null; // Unknown query — let browser handle
      }

      const origMatchMedia = window.matchMedia.bind(window);

      const fakeMatchMedia = regNative(function matchMedia(query) {
        const result = origMatchMedia(query);
        const override = checkMediaQuery(query);

        if (override === null) return result;

        // Create a fake MediaQueryList
        const fakeResult = Object.create(Object.getPrototypeOf(result));

        _defineProperty(fakeResult, 'matches', {
          get: function() { return override; },
          configurable: true
        });
        _defineProperty(fakeResult, 'media', {
          get: function() { return result.media; },
          configurable: true
        });
        fakeResult.addEventListener = result.addEventListener.bind(result);
        fakeResult.removeEventListener = result.removeEventListener.bind(result);
        fakeResult.addListener = result.addListener ? result.addListener.bind(result) : function(){};
        fakeResult.removeListener = result.removeListener ? result.removeListener.bind(result) : function(){};
        fakeResult.dispatchEvent = result.dispatchEvent.bind(result);
        fakeResult.onchange = result.onchange;

        return fakeResult;
      }, 'matchMedia');

      _defineProperty(window, 'matchMedia', {
        value: fakeMatchMedia,
        writable: true,
        configurable: true,
        enumerable: true
      });
    } catch(e) {}
  }

  // ═══ 3. PERMISSIONS API SPOOFING ═══
  if (MOD.permissions !== false && P) {
    try {
      if (navigator.permissions && navigator.permissions.query) {
        const isMobile = P.mobile || false;

        // Spoof permission states based on device type
        const PERMISSION_STATES = {
          'geolocation': 'prompt',
          'notifications': 'prompt',
          'push': 'prompt',
          'midi': 'prompt',
          'camera': isMobile ? 'prompt' : 'denied',
          'microphone': isMobile ? 'prompt' : 'denied',
          'speaker-selection': 'prompt',
          'device-info': 'prompt',
          'background-fetch': 'prompt',
          'background-sync': 'granted',
          'bluetooth': 'prompt',
          'persistent-storage': 'prompt',
          'ambient-light-sensor': 'prompt',
          'accelerometer': isMobile ? 'granted' : 'denied',
          'gyroscope': isMobile ? 'granted' : 'denied',
          'magnetometer': isMobile ? 'granted' : 'denied',
          'clipboard-read': 'prompt',
          'clipboard-write': 'granted',
          'display-capture': 'prompt',
          'nfc': isMobile ? 'prompt' : 'denied',
          'payment-handler': 'prompt',
          'idle-detection': 'prompt',
          'periodic-background-sync': 'prompt',
          'system-wake-lock': 'prompt',
          'storage-access': 'prompt',
          'window-management': 'prompt',
          'local-fonts': 'prompt',
          'screen-wake-lock': 'prompt'
        };

        const origQuery = navigator.permissions.query.bind(navigator.permissions);

        _defineProperty(navigator.permissions, 'query', {
          value: regNative(function query(permissionDesc) {
            const name = permissionDesc && permissionDesc.name;
            const state = PERMISSION_STATES[name];

            if (state !== undefined) {
              return Promise.resolve({
                name: name,
                state: state,
                onchange: null,
                addEventListener: function() {},
                removeEventListener: function() {},
                dispatchEvent: function() { return true; }
              });
            }

            return origQuery(permissionDesc);
          }, 'query'),
          writable: true,
          configurable: true
        });
      }
    } catch(e) {}
  }

  // ═══ 4. KEYBOARD LAYOUT API SPOOFING ═══
  if (MOD.keyboard !== false && P) {
    try {
      if (navigator.keyboard && navigator.keyboard.getLayoutMap) {
        const lang = P.language || 'en-US';

        // Map language to keyboard layout codes
        const LAYOUT_MAPS = {
          'en-US': { 'KeyA': 'a', 'KeyB': 'b', 'KeyC': 'c', 'KeyD': 'd', 'KeyE': 'e', 'KeyF': 'f', 'KeyG': 'g', 'KeyH': 'h', 'KeyI': 'i', 'KeyJ': 'j', 'KeyK': 'k', 'KeyL': 'l', 'KeyM': 'm', 'KeyN': 'n', 'KeyO': 'o', 'KeyP': 'p', 'KeyQ': 'q', 'KeyR': 'r', 'KeyS': 's', 'KeyT': 't', 'KeyU': 'u', 'KeyV': 'v', 'KeyW': 'w', 'KeyX': 'x', 'KeyY': 'y', 'KeyZ': 'z', 'Digit1': '1', 'Digit2': '2', 'Digit3': '3', 'Digit4': '4', 'Digit5': '5', 'Digit6': '6', 'Digit7': '7', 'Digit8': '8', 'Digit9': '9', 'Digit0': '0' },
          'en-GB': { 'KeyA': 'a', 'KeyB': 'b', 'KeyC': 'c', 'KeyD': 'd', 'KeyE': 'e', 'KeyF': 'f', 'KeyG': 'g', 'KeyH': 'h', 'KeyI': 'i', 'KeyJ': 'j', 'KeyK': 'k', 'KeyL': 'l', 'KeyM': 'm', 'KeyN': 'n', 'KeyO': 'o', 'KeyP': 'p', 'KeyQ': 'q', 'KeyR': 'r', 'KeyS': 's', 'KeyT': 't', 'KeyU': 'u', 'KeyV': 'v', 'KeyW': 'w', 'KeyX': 'x', 'KeyY': 'y', 'KeyZ': 'z', 'Digit1': '1', 'Digit2': '2', 'Digit3': '3', 'Digit4': '4', 'Digit5': '5', 'Digit6': '6', 'Digit7': '7', 'Digit8': '8', 'Digit9': '9', 'Digit0': '0' },
          'de-DE': { 'KeyA': 'a', 'KeyB': 'b', 'KeyC': 'c', 'KeyD': 'd', 'KeyE': 'e', 'KeyF': 'f', 'KeyG': 'g', 'KeyH': 'h', 'KeyI': 'i', 'KeyJ': 'j', 'KeyK': 'k', 'KeyL': 'l', 'KeyM': 'm', 'KeyN': 'n', 'KeyO': 'o', 'KeyP': 'p', 'KeyQ': 'q', 'KeyR': 'r', 'KeyS': 's', 'KeyT': 't', 'KeyU': 'u', 'KeyV': 'v', 'KeyW': 'w', 'KeyX': 'x', 'KeyY': 'z', 'KeyZ': 'y', 'Digit1': '1', 'Digit2': '2', 'Digit3': '3', 'Digit4': '4', 'Digit5': '5', 'Digit6': '6', 'Digit7': '7', 'Digit8': '8', 'Digit9': '9', 'Digit0': '0' },
          'fr-FR': { 'KeyA': 'q', 'KeyB': 'b', 'KeyC': 'c', 'KeyD': 'd', 'KeyE': 'e', 'KeyF': 'f', 'KeyG': 'g', 'KeyH': 'h', 'KeyI': 'i', 'KeyJ': 'j', 'KeyK': 'k', 'KeyL': 'l', 'KeyM': ',', 'KeyN': 'n', 'KeyO': 'o', 'KeyP': 'p', 'KeyQ': 'a', 'KeyR': 'r', 'KeyS': 's', 'KeyT': 't', 'KeyU': 'u', 'KeyV': 'v', 'KeyW': 'z', 'KeyX': 'x', 'KeyY': 'y', 'KeyZ': 'w', 'Digit1': '&', 'Digit2': 'é', 'Digit3': '"', 'Digit4': "'", 'Digit5': '(', 'Digit6': '-', 'Digit7': 'è', 'Digit8': '_', 'Digit9': 'ç', 'Digit0': 'à' }
        };

        const layoutData = LAYOUT_MAPS[lang] || LAYOUT_MAPS['en-US'];

        // Create a Map-like object
        const fakeLayoutMap = new Map(Object.entries(layoutData));

        const origGetLayoutMap = navigator.keyboard.getLayoutMap.bind(navigator.keyboard);

        _defineProperty(navigator.keyboard, 'getLayoutMap', {
          value: regNative(function getLayoutMap() {
            return Promise.resolve(fakeLayoutMap);
          }, 'getLayoutMap'),
          writable: true,
          configurable: true
        });
      }
    } catch(e) {}
  }

  // ═══ 5. NETWORK INFORMATION API ENHANCEMENT ═══
  if (MOD.navigator !== false && P && P.connection) {
    try {
      const conn = P.connection;
      if (navigator.connection) {
        const connProto = Object.getPrototypeOf(navigator.connection);

        // Add 'type' property (wifi/cellular/ethernet)
        const connType = P.mobile ? 'cellular' : 'wifi';
        try {
          Object.defineProperty(connProto, 'type', {
            get: regNative(function() { return connType; }, 'get type'),
            configurable: true
          });
        } catch(e) {}

        // Suppress onchange events that could reveal real connection
        try {
          Object.defineProperty(connProto, 'onchange', {
            get: function() { return null; },
            set: function() {},
            configurable: true
          });
        } catch(e) {}
      }
    } catch(e) {}
  }

  // ═══ 6. SCREEN ORIENTATION SPOOFING ═══
  if (MOD.screen !== false && P && P.orientation) {
    try {
      if (screen.orientation) {
        const orientProto = Object.getPrototypeOf(screen.orientation);
        const orientType = P.orientation.type || (P.mobile ? 'portrait-primary' : 'landscape-primary');
        const orientAngle = P.orientation.angle || 0;

        try {
          Object.defineProperty(orientProto, 'type', {
            get: regNative(function() { return orientType; }, 'get type'),
            configurable: true
          });
          Object.defineProperty(orientProto, 'angle', {
            get: regNative(function() { return orientAngle; }, 'get angle'),
            configurable: true
          });
        } catch(e) {}
      }
    } catch(e) {}
  }

  // ═══ 7. NAVIGATOR.PDFVIEWERENABLED SPOOFING ═══
  if (MOD.navigator !== false && P) {
    try {
      const pdfEnabled = P.pdfViewerEnabled !== undefined ? P.pdfViewerEnabled : true;
      Object.defineProperty(Navigator.prototype, 'pdfViewerEnabled', {
        get: regNative(function() { return pdfEnabled; }, 'get pdfViewerEnabled'),
        configurable: true,
        enumerable: true
      });
    } catch(e) {}
  }

  // ═══ 8. NAVIGATOR.COOKIEENABLED SPOOFING ═══
  if (MOD.navigator !== false) {
    try {
      Object.defineProperty(Navigator.prototype, 'cookieEnabled', {
        get: regNative(function() { return true; }, 'get cookieEnabled'),
        configurable: true,
        enumerable: true
      });
    } catch(e) {}
  }

  // ═══ 9. WINDOW.HISTORY.LENGTH SPOOFING ═══
  if (MOD.navigator !== false && P && P.historyLength !== undefined) {
    try {
      Object.defineProperty(History.prototype, 'length', {
        get: regNative(function() { return P.historyLength; }, 'get length'),
        configurable: true,
        enumerable: true
      });
    } catch(e) {}
  }

  // ═══ 10. NAVIGATOR.ONLINE SPOOFING ═══
  if (MOD.navigator !== false) {
    try {
      Object.defineProperty(Navigator.prototype, 'onLine', {
        get: regNative(function() { return true; }, 'get onLine'),
        configurable: true,
        enumerable: true
      });
    } catch(e) {}
  }

  // ═══ CLEANUP: Remove config element now that all scripts have read it ═══
  // inject.js no longer removes it so that this script (the last one injected) can read it.
  try {
    const cfgElToRemove = document.getElementById('__phantomprint_cfg__');
    if (cfgElToRemove) cfgElToRemove.remove();
  } catch(e) {}

})();
