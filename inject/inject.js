// PhantomPrint v5.1 — Stealth Fingerprint Spoofing Engine
// Designed to pass Pixelscan, CreepJS, BrowserLeaks, FingerprintJS
// All overrides: prototype-level, WeakMap toString, no Proxy for primitives
(function() {
  "use strict";

  // ═══ BOOTSTRAP
  // Config is delivered via window.__pp_cfg__ (a non-enumerable, configurable
  // window property written by an inline script in content.js). This avoids the
  // detectable <script id="__phantomprint_cfg__"> DOM element that fingerprinters
  // could find with getElementById() during the injection window.
  const CFG = window.__pp_cfg__;
  if (!CFG || !CFG.enabled) return;

  const P = CFG.profile;
  const MOD = CFG.modules || {};
  const NOISE_LVL = CFG.noiseLevel || "medium";
  const SEED = CFG.seed || Date.now();
  const NM = { low: 0.3, medium: 1.0, high: 2.5 }[NOISE_LVL] || 1.0;

  function modOn(n) { return MOD[n] !== false; }

  // ═══ PRNG — Mulberry32-based seeded PRNG
  const RNG = (function(seed) {
    const s = new Uint32Array(4);
    let v = typeof seed === "string" ? fnv(seed) : (seed >>> 0);
    for (let i = 0; i < 4; i++) {
      v += 0x9e3779b9;
      let t = v ^ (v >>> 16); t = Math.imul(t, 0x21f0aaad);
      t ^= t >>> 15; t = Math.imul(t, 0x735a2d97); t ^= t >>> 15;
      s[i] = t >>> 0;
    }
    function next() {
      const r = (Math.imul(s[1] * 5, 1 << 7 | 1) >>> 0);
      const t = s[1] << 9;
      s[2] ^= s[0]; s[3] ^= s[1]; s[1] ^= s[2]; s[0] ^= s[3];
      s[2] ^= t; s[3] = (s[3] << 11 | s[3] >>> 21) >>> 0;
      return r;
    }
    function random() { return next() / 4294967296; }
    function randomInt(a, b) { return a + Math.floor(random() * (b - a + 1)); }
    function randomChoice(arr) { return arr[Math.floor(random() * arr.length)]; }
    function noise(mag) { return (random() - 0.5) * 2 * mag * NM; }
    function fnv(str) {
      let h = 0x811c9dc5;
      for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
      return h >>> 0;
    }
    function hash(x) { return fnv(String(x)); }
    function derive(label) { return fnv(s[0] + ":" + label) / 4294967296; }
    return { random, randomInt, randomChoice, noise, hash, derive, fnv, state: s };
  })(SEED);

  // ═══ STEALTH CORE — WeakMap-based native function masking
  const _apply = Function.prototype.apply;
  const _bind = Function.prototype.bind;
  const _call = Function.prototype.call;
  const _toString = Function.prototype.toString;
  const _defineProperty = Object.defineProperty;
  const _getOPD = Object.getOwnPropertyDescriptor;
  const _getProto = Object.getPrototypeOf;

  // WeakMap: spoofed function → native toString string
  // Exposed as window.__ppNatives so subsequent inject modules (uadata-spoof,
  // extra-spoof, etc.) can register their own functions against the SAME map,
  // avoiding the double-patch problem where two separate WeakMaps exist and
  // the second toString wrapper can't see the first map's entries.
  const nativeStrings = new WeakMap();
  try {
    _defineProperty(window, "__ppNatives", {
      value: nativeStrings, writable: false, configurable: true, enumerable: false
    });
  } catch(e) {}

  // Patch Function.prototype.toString FIRST — single authoritative patch
  const patchedToString = function toString() {
    if (nativeStrings.has(this)) return nativeStrings.get(this);
    return _call.call(_toString, this);
  };
  nativeStrings.set(patchedToString, "function toString() { [native code] }");
  _defineProperty(Function.prototype, "toString", {
    value: patchedToString, writable: true, configurable: true, enumerable: false
  });

  // Register a function as "native-looking"
  function regNative(fn, name) {
    const n = name || fn.name || "";
    nativeStrings.set(fn, "function " + n + "() { [native code] }");
    try { _defineProperty(fn, "name", { value: n, configurable: true }); } catch(e) {}
    try { _defineProperty(fn, "length", { value: fn.length, configurable: true }); } catch(e) {}
    return fn;
  }

  // Override a PROTOTYPE getter with correct descriptor type
  function defGetter(proto, prop, getterFn) {
    const getter = regNative(getterFn, "get " + prop);
    _defineProperty(proto, prop, {
      get: getter, set: undefined, enumerable: true, configurable: true
    });
  }

  // Wrap a prototype method
  function wrapMethod(proto, name, wrapperFactory) {
    const orig = proto[name];
    if (!orig) return orig;
    const wrapped = regNative(wrapperFactory(orig), name);
    _defineProperty(proto, name, {
      value: wrapped, writable: true, enumerable: true, configurable: true
    });
    return orig;
  }

  // ═══ ERROR STACK SANITIZATION (no Proxy!)
  try {
    const _origPrepare = Error.prepareStackTrace;
    Error.prepareStackTrace = function(err, callSites) {
      let formatted;
      if (_origPrepare) {
        try { formatted = _origPrepare(err, callSites); } catch(e) { formatted = err + ""; }
      } else {
        formatted = err + "\n" + callSites.map(function(cs) {
          return "    at " + cs.toString();
        }).join("\n");
      }
      if (typeof formatted === "string") {
        formatted = formatted
          .replace(/chrome-extension:\/\/[^\s\n)]+/g, "<anonymous>")
          .replace(/moz-extension:\/\/[^\s\n)]+/g, "<anonymous>");
      }
      return formatted;
    };
  } catch(e) {}

  // ═══ MODULE 1: NAVIGATOR — Override on PROTOTYPE, not instance
  if (modOn("navigator") && P) {
    try {
      const navOverrides = {
        userAgent: P.userAgent,
        platform: P.platform,
        vendor: P.vendor,
        appVersion: P.appVersion,
        hardwareConcurrency: P.hardwareConcurrency,
        deviceMemory: P.deviceMemory,
        maxTouchPoints: P.maxTouchPoints,
        language: P.language || (P.languages && P.languages[0]),
        doNotTrack: P.doNotTrack
      };

      for (var prop in navOverrides) {
        if (navOverrides[prop] !== undefined) {
          (function(p, v) {
            defGetter(Navigator.prototype, p, function() { return v; });
          })(prop, navOverrides[prop]);
        }
      }

      // navigator.languages — frozen array
      if (P.languages) {
        var frozenLangs = Object.freeze([].concat(P.languages));
        defGetter(Navigator.prototype, "languages", function() { return frozenLangs; });
      }

      // navigator.connection
      if (P.connection && navigator.connection) {
        var conn = P.connection;
        var connProto = _getProto(navigator.connection);
        if (connProto) {
          if (conn.effectiveType) defGetter(connProto, "effectiveType", function() { return conn.effectiveType; });
          if (conn.rtt !== undefined) defGetter(connProto, "rtt", function() { return conn.rtt; });
          if (conn.downlink !== undefined) defGetter(connProto, "downlink", function() { return conn.downlink; });
        }
      }

      // navigator.plugins — 5 PDF plugins (standard Chrome)
      try {
        var pluginNames = [
          "PDF Viewer", "Chrome PDF Viewer", "Chromium PDF Viewer",
          "Microsoft Edge PDF Viewer", "WebKit built-in PDF"
        ];
        var fakePlugins = { length: 5 };
        fakePlugins.item = regNative(function item(i) { return fakePlugins[i] || null; }, "item");
        fakePlugins.namedItem = regNative(function namedItem(n) {
          for (var i = 0; i < 5; i++) if (fakePlugins[i] && fakePlugins[i].name === n) return fakePlugins[i];
          return null;
        }, "namedItem");
        fakePlugins.refresh = regNative(function refresh() {}, "refresh");
        fakePlugins[Symbol.iterator] = regNative(function*() {
          for (var i = 0; i < 5; i++) yield fakePlugins[i];
        }, Symbol.iterator);
        for (var pi = 0; pi < pluginNames.length; pi++) {
          var plug = Object.create(Plugin.prototype);
          _defineProperty(plug, "name", { value: pluginNames[pi], enumerable: true });
          _defineProperty(plug, "filename", { value: "internal-pdf-viewer", enumerable: true });
          _defineProperty(plug, "description", { value: "Portable Document Format", enumerable: true });
          _defineProperty(plug, "length", { value: 1, enumerable: true });
          fakePlugins[pi] = plug;
        }
        defGetter(Navigator.prototype, "plugins", function() { return fakePlugins; });
      } catch(e) {}

      // navigator.mimeTypes
      try {
        var fakeMimes = { length: 2 };
        fakeMimes.item = regNative(function item(i) { return fakeMimes[i] || null; }, "item");
        fakeMimes.namedItem = regNative(function namedItem(n) {
          for (var i = 0; i < 2; i++) if (fakeMimes[i] && fakeMimes[i].type === n) return fakeMimes[i];
          return null;
        }, "namedItem");
        fakeMimes[Symbol.iterator] = regNative(function*() {
          for (var i = 0; i < 2; i++) yield fakeMimes[i];
        }, Symbol.iterator);
        var mimeList = [
          { type: "application/pdf", desc: "Portable Document Format", suf: "pdf" },
          { type: "text/pdf", desc: "Portable Document Format", suf: "pdf" }
        ];
        for (var mi = 0; mi < mimeList.length; mi++) {
          var mm = Object.create(MimeType.prototype);
          _defineProperty(mm, "type", { value: mimeList[mi].type, enumerable: true });
          _defineProperty(mm, "description", { value: mimeList[mi].desc, enumerable: true });
          _defineProperty(mm, "suffixes", { value: mimeList[mi].suf, enumerable: true });
          fakeMimes[mi] = mm;
        }
        defGetter(Navigator.prototype, "mimeTypes", function() { return fakeMimes; });
      } catch(e) {}


      // navigator.webdriver — must be undefined in a real browser.
      // Returning `false` is itself detectable (Pixelscan, CreepJS check for this
      // as it means the property exists but was explicitly set false — a bot signal).
      // A normal Chrome browser has no webdriver property at all, so we install an
      // accessor that returns undefined, matching a clean browser environment.
      try {
        _defineProperty(Navigator.prototype, "webdriver", {
          get: regNative(function() { return undefined; }, "get webdriver"),
          set: undefined,
          enumerable: true,
          configurable: true
        });
      } catch(e) {}

    } catch(e) {}
  }

  // ═══ MODULE 2: SCREEN — Override on Screen.prototype
  if (modOn("screen") && P && P.screen) {
    try {
      var scr = P.screen;
      defGetter(Screen.prototype, "width", function() { return scr.width; });
      defGetter(Screen.prototype, "height", function() { return scr.height; });
      defGetter(Screen.prototype, "availWidth", function() { return scr.availWidth; });
      defGetter(Screen.prototype, "availHeight", function() { return scr.availHeight; });
      // availLeft / availTop reveal multi-monitor setups; always 0 on a single display
      defGetter(Screen.prototype, "availLeft", function() { return 0; });
      defGetter(Screen.prototype, "availTop",  function() { return 0; });
      if (P.colorDepth !== undefined) {
        defGetter(Screen.prototype, "colorDepth", function() { return P.colorDepth; });
        defGetter(Screen.prototype, "pixelDepth", function() { return P.pixelDepth || P.colorDepth; });
      }
      if (P.devicePixelRatio !== undefined) {
        _defineProperty(window, "devicePixelRatio", {
          get: regNative(function() { return P.devicePixelRatio; }, "get devicePixelRatio"),
          set: undefined, enumerable: true, configurable: true
        });
      }
      _defineProperty(window, "outerWidth", {
        get: regNative(function() { return scr.availWidth; }, "get outerWidth"),
        set: undefined, enumerable: true, configurable: true
      });
      _defineProperty(window, "outerHeight", {
        get: regNative(function() { return scr.availHeight; }, "get outerHeight"),
        set: undefined, enumerable: true, configurable: true
      });
    } catch(e) {}
  }

  // ═══ MODULE 3: CANVAS — Deterministic content-aware noise
  // CRITICAL FIX: Save original getImageData BEFORE overriding, use it in toDataURL
  // to prevent double-noise (toDataURL calling overridden getImageData)
  if (modOn("canvas")) {
    try {
      var canvasSeed = RNG.hash("canvas:" + SEED);

      // Save ORIGINALS before any override
      var _origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
      var _origToDataURL = HTMLCanvasElement.prototype.toDataURL;
      var _origToBlob = HTMLCanvasElement.prototype.toBlob;

      function addCanvasNoise(imageData) {
        var data = imageData.data;
        var len = data.length;
        var mag = Math.max(1, Math.round(2 * NM));
        // Content-aware seed from first 256 bytes
        var contentSeed = canvasSeed;
        var sampleLen = Math.min(len, 256);
        for (var k = 0; k < sampleLen; k += 4) {
          contentSeed = (Math.imul(contentSeed ^ data[k], 0x5bd1e995) + data[k+1]) >>> 0;
        }
        var s = contentSeed;
        for (var i = 0; i < len; i += 4) {
          s = (Math.imul(s ^ (i >> 2), 0x5bd1e995) + 0x6c078965) >>> 0;
          var r = ((s >> 0) & 0xFF) % (mag * 2 + 1) - mag;
          var g = ((s >> 8) & 0xFF) % (mag * 2 + 1) - mag;
          var b = ((s >> 16) & 0xFF) % (mag * 2 + 1) - mag;
          data[i] = Math.max(0, Math.min(255, data[i] + r));
          data[i+1] = Math.max(0, Math.min(255, data[i+1] + g));
          data[i+2] = Math.max(0, Math.min(255, data[i+2] + b));
        }
        return imageData;
      }

      // toDataURL — uses ORIGINAL getImageData to avoid double-noise
      var tdCache = new WeakMap();
      wrapMethod(HTMLCanvasElement.prototype, "toDataURL", function(orig) {
        return function toDataURL(type, quality) {
          var key = (type || "image/png") + ":" + (quality || "");
          var c = tdCache.get(this);
          if (c && c.k === key) return c.v;
          try {
            var ctx = this.getContext("2d");
            if (ctx) {
              // Use ORIGINAL getImageData — not the overridden one
              var id = _call.call(_origGetImageData, ctx, 0, 0, this.width, this.height);
              addCanvasNoise(id);
              var tmp = document.createElement("canvas");
              tmp.width = this.width; tmp.height = this.height;
              tmp.getContext("2d").putImageData(id, 0, 0);
              var result = _call.call(_origToDataURL, tmp, type, quality);
              tdCache.set(this, { k: key, v: result });
              return result;
            }
          } catch(e) {}
          return _call.call(_origToDataURL, this, type, quality);
        };
      });

      // toBlob — uses ORIGINAL getImageData
      wrapMethod(HTMLCanvasElement.prototype, "toBlob", function(orig) {
        return function toBlob(cb, type, quality) {
          try {
            var ctx = this.getContext("2d");
            if (ctx) {
              var id = _call.call(_origGetImageData, ctx, 0, 0, this.width, this.height);
              addCanvasNoise(id);
              var tmp = document.createElement("canvas");
              tmp.width = this.width; tmp.height = this.height;
              tmp.getContext("2d").putImageData(id, 0, 0);
              return _call.call(_origToBlob, tmp, cb, type, quality);
            }
          } catch(e) {}
          return _call.call(_origToBlob, this, cb, type, quality);
        };
      });

      // getImageData — applies noise for direct calls
      wrapMethod(CanvasRenderingContext2D.prototype, "getImageData", function(orig) {
        return function getImageData(sx, sy, sw, sh) {
          var id = _call.call(_origGetImageData, this, sx, sy, sw, sh);
          addCanvasNoise(id);
          return id;
        };
      });

      // measureText noise
      wrapMethod(CanvasRenderingContext2D.prototype, "measureText", function(orig) {
        return function measureText(text) {
          var r = _call.call(orig, this, text);
          var h = RNG.derive("mt:" + text + ":" + this.font);
          var wn = (h - 0.5) * 0.15 * NM;
          try { _defineProperty(r, "width", { value: r.width + wn, writable: false, configurable: true }); } catch(e) {}
          return r;
        };
      });

      // OffscreenCanvas
      if (typeof OffscreenCanvas !== "undefined" && OffscreenCanvas.prototype.convertToBlob) {
        wrapMethod(OffscreenCanvas.prototype, "convertToBlob", function(orig) {
          return function convertToBlob(opts) {
            try {
              var ctx = this.getContext("2d");
              if (ctx) {
                var id = ctx.getImageData(0, 0, this.width, this.height);
                addCanvasNoise(id);
                ctx.putImageData(id, 0, 0);
              }
            } catch(e) {}
            return _call.call(orig, this, opts);
          };
        });
      }
    } catch(e) {}
  }

  // ═══ MODULE 4: WEBGL
  if (modOn("webgl") && P && P.gpu) {
    try {
      var gpu = P.gpu;
      var GL = WebGLRenderingContext;
      var PM = new Map();
      if (gpu.maxTextureSize) PM.set(GL.MAX_TEXTURE_SIZE, gpu.maxTextureSize);
      if (gpu.maxVertexAttribs) PM.set(GL.MAX_VERTEX_ATTRIBS, gpu.maxVertexAttribs);
      if (gpu.maxVertexUniformVectors) PM.set(GL.MAX_VERTEX_UNIFORM_VECTORS, gpu.maxVertexUniformVectors);
      if (gpu.maxVaryingVectors) PM.set(GL.MAX_VARYING_VECTORS, gpu.maxVaryingVectors);
      if (gpu.maxCombinedTextureImageUnits) PM.set(GL.MAX_COMBINED_TEXTURE_IMAGE_UNITS, gpu.maxCombinedTextureImageUnits);
      if (gpu.maxVertexTextureImageUnits) PM.set(GL.MAX_VERTEX_TEXTURE_IMAGE_UNITS, gpu.maxVertexTextureImageUnits);
      if (gpu.maxTextureImageUnits) PM.set(GL.MAX_TEXTURE_IMAGE_UNITS, gpu.maxTextureImageUnits);
      if (gpu.maxFragmentUniformVectors) PM.set(GL.MAX_FRAGMENT_UNIFORM_VECTORS, gpu.maxFragmentUniformVectors);
      if (gpu.maxCubeMapTextureSize) PM.set(GL.MAX_CUBE_MAP_TEXTURE_SIZE, gpu.maxCubeMapTextureSize);
      if (gpu.maxRenderbufferSize) PM.set(GL.MAX_RENDERBUFFER_SIZE, gpu.maxRenderbufferSize);
      if (gpu.maxViewportDims) PM.set(GL.MAX_VIEWPORT_DIMS, new Int32Array(gpu.maxViewportDims));
      if (gpu.aliasedLineWidthRange) PM.set(GL.ALIASED_LINE_WIDTH_RANGE, new Float32Array(gpu.aliasedLineWidthRange));
      if (gpu.aliasedPointSizeRange) PM.set(GL.ALIASED_POINT_SIZE_RANGE, new Float32Array(gpu.aliasedPointSizeRange));
      PM.set(GL.SHADING_LANGUAGE_VERSION, "WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)");
      PM.set(GL.VERSION, "WebGL 1.0 (OpenGL ES 2.0 Chromium)");
      PM.set(GL.VENDOR, "WebKit");
      PM.set(GL.RENDERER, "WebKit WebGL");

      var UNMASKED_VENDOR = 0x9245;
      var UNMASKED_RENDERER = 0x9246;

      function patchGLGetParam(proto) {
        wrapMethod(proto, "getParameter", function(orig) {
          return function getParameter(pname) {
            if (pname === UNMASKED_VENDOR) return gpu.vendor;
            if (pname === UNMASKED_RENDERER) return gpu.renderer;
            if (PM.has(pname)) return PM.get(pname);
            return _call.call(orig, this, pname);
          };
        });
      }

      patchGLGetParam(WebGLRenderingContext.prototype);
      if (typeof WebGL2RenderingContext !== "undefined") {
        patchGLGetParam(WebGL2RenderingContext.prototype);
      }

      // readPixels noise
      wrapMethod(WebGLRenderingContext.prototype, "readPixels", function(orig) {
        return function readPixels(x, y, w, h, fmt, typ, px) {
          _call.call(orig, this, x, y, w, h, fmt, typ, px);
          if (px && px.length) {
            var s = RNG.hash("glrp:" + w + ":" + h);
            for (var i = 0; i < px.length; i += 4) {
              s = (Math.imul(s ^ i, 0x5bd1e995) + 0x6c078965) >>> 0;
              px[i] = Math.max(0, Math.min(255, px[i] + ((s & 3) - 1)));
              px[i+1] = Math.max(0, Math.min(255, px[i+1] + (((s>>2) & 3) - 1)));
              px[i+2] = Math.max(0, Math.min(255, px[i+2] + (((s>>4) & 3) - 1)));
            }
          }
        };
      });
    } catch(e) {}
  }

  // ═══ MODULE 5: AUDIO
  if (modOn("audio")) {
    try {
      var aParams = P.audioParams || {};
      var ACProto = (window.AudioContext || window.webkitAudioContext);
      if (ACProto) {
        if (aParams.baseLatency !== undefined) defGetter(ACProto.prototype, "baseLatency", function() { return aParams.baseLatency; });
        if (aParams.outputLatency !== undefined) defGetter(ACProto.prototype, "outputLatency", function() { return aParams.outputLatency; });
        if (aParams.sampleRate !== undefined) defGetter(ACProto.prototype, "sampleRate", function() { return aParams.sampleRate; });
      }
      if (typeof AudioBuffer !== "undefined") {
        var audioCache = new WeakMap();
        wrapMethod(AudioBuffer.prototype, "getChannelData", function(orig) {
          return function getChannelData(ch) {
            var data = _call.call(orig, this, ch);
            var c = audioCache.get(this);
            if (!c) { c = {}; audioCache.set(this, c); }
            if (c[ch]) return data;
            c[ch] = true;
            var nm = 0.0001 * NM;
            var s = RNG.hash("audio:" + this.length + ":" + ch);
            for (var i = 0; i < data.length; i++) {
              s = (Math.imul(s ^ i, 0x5bd1e995) + 0x6c078965) >>> 0;
              data[i] += ((s / 4294967296) - 0.5) * 2 * nm;
            }
            return data;
          };
        });
      }
      var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      if (OAC) {
        wrapMethod(OAC.prototype, "startRendering", function(orig) {
          return function startRendering() {
            return _call.call(orig, this).then(function(buf) { return buf; });
          };
        });
      }
    } catch(e) {}
  }

  // ═══ MODULE 6: FONTS
  if (modOn("fonts") && P && P.fonts) {
    try {
      var allowedFonts = new Set(P.fonts.map(function(f) { return f.toLowerCase(); }));
      var generics = new Set(["serif","sans-serif","monospace","cursive","fantasy","system-ui","math","emoji","fangsong"]);
      if (document.fonts && document.fonts.check) {
        var _fc = document.fonts.check.bind(document.fonts);
        _defineProperty(document.fonts, "check", {
          value: regNative(function check(font, text) {
            var parts = font.match(/(?:['"]([^'"]+)['"]|([^\s,]+))\s*(?:,|$)/g);
            if (parts) {
              for (var j = 0; j < parts.length; j++) {
                var fam = parts[j].replace(/['",]/g, "").trim().toLowerCase();
                if (generics.has(fam)) continue;
                if (!allowedFonts.has(fam)) return false;
              }
            }
            return _fc(font, text || "");
          }, "check"),
          writable: true, configurable: true
        });
      }
    } catch(e) {}
  }

  // ═══ MODULE 7: WEBRTC — NUCLEAR LEAK PREVENTION
  if (modOn("webrtc")) {
    try {
      var rtcNames = ["RTCPeerConnection", "webkitRTCPeerConnection", "mozRTCPeerConnection"];
      var ipRe = /([0-9]{1,3}\.){3}[0-9]{1,3}/g;
      var ipv6Re = /([a-f0-9]{1,4}:){2,7}[a-f0-9]{1,4}/gi;

      function scrubIPs(str) {
        return str.replace(ipRe, "0.0.0.0").replace(ipv6Re, "::1");
      }
      function scrubSDP(sdp) {
        if (!sdp) return sdp;
        sdp = sdp.replace(/a=candidate:.*?\r?\n/g, "");
        return scrubIPs(sdp);
      }

      rtcNames.forEach(function(rtcName) {
        if (!(rtcName in window)) return;
        var OrigRTC = window[rtcName];

        var FakeRTC = regNative(function RTCPeerConnection(config, constraints) {
          config = Object.assign({}, config || {});
          config.iceServers = [];
          var pc = new OrigRTC(config, constraints);

          // Scrub setLocalDescription
          var _setSLD = pc.setLocalDescription.bind(pc);
          pc.setLocalDescription = regNative(function setLocalDescription(desc) {
            if (desc && desc.sdp) {
              desc = new RTCSessionDescription({ type: desc.type, sdp: scrubSDP(desc.sdp) });
            }
            return _setSLD(desc);
          }, "setLocalDescription");

          // Scrub setRemoteDescription
          var _setSRD = pc.setRemoteDescription.bind(pc);
          pc.setRemoteDescription = regNative(function setRemoteDescription(desc) {
            if (desc && desc.sdp) {
              desc = new RTCSessionDescription({ type: desc.type, sdp: scrubSDP(desc.sdp) });
            }
            return _setSRD(desc);
          }, "setRemoteDescription");

          // onicecandidate property — suppress real candidates
          var _userCb = null;
          _defineProperty(pc, "onicecandidate", {
            get: function() { return _userCb; },
            set: function(cb) {
              if (typeof cb !== "function") { _userCb = cb; return; }
              _userCb = cb;
            },
            configurable: true, enumerable: true
          });

          // addEventListener — suppress icecandidate events with real IPs
          var _origAEL = pc.addEventListener.bind(pc);
          pc.addEventListener = regNative(function addEventListener(type, listener, opts) {
            if (type === "icecandidate") {
              var wrapped = function(ev) {
                if (ev.candidate && ev.candidate.candidate) return; // suppress
                listener.call(this, ev);
              };
              return _origAEL("icecandidate", wrapped, opts);
            }
            return _origAEL(type, listener, opts);
          }, "addEventListener");

          return pc;
        }, rtcName);

        FakeRTC.prototype = OrigRTC.prototype;
        if (OrigRTC.generateCertificate) FakeRTC.generateCertificate = OrigRTC.generateCertificate;
        window[rtcName] = FakeRTC;
      });
    } catch(e) {}
  }

  // ═══ MODULE 8: CLIENT RECTS
  if (modOn("rects")) {
    try {
      function elHash(el) {
        var id = (el.tagName || "");
        if (el.id) id += "#" + el.id;
        if (el.className && typeof el.className === "string") id += "." + el.className.split(" ").sort().join(".");
        id += ":" + (el.textContent || "").slice(0, 20);
        return RNG.derive("rect:" + id);
      }
      wrapMethod(Element.prototype, "getBoundingClientRect", function(orig) {
        return function getBoundingClientRect() {
          var r = _call.call(orig, this);
          var h = elHash(this);
          var n = (h - 0.5) * 0.02 * NM;
          return new DOMRect(r.x + n, r.y + n * 0.7, r.width + n * 0.5, r.height + n * 0.3);
        };
      });
      wrapMethod(Element.prototype, "getClientRects", function(orig) {
        return function getClientRects() {
          var rects = _call.call(orig, this);
          var h = elHash(this);
          var n = (h - 0.5) * 0.02 * NM;
          var result = [];
          for (var i = 0; i < rects.length; i++) {
            var r = rects[i];
            result.push(new DOMRect(r.x + n, r.y + n * 0.7, r.width + n * 0.5, r.height + n * 0.3));
          }
          result.item = regNative(function item(i) { return result[i] || null; }, "item");
          _defineProperty(result, "length", { value: result.length });
          return result;
        };
      });
    } catch(e) {}
  }

  // ═══ MODULE 9: TIMEZONE — Full coherence
  if (modOn("timezone") && P && P.timezone) {
    try {
      var tz = P.timezone;

      // getTimezoneOffset
      wrapMethod(Date.prototype, "getTimezoneOffset", function(orig) {
        return function getTimezoneOffset() { return tz.offset; };
      });

      // Save original Intl.DateTimeFormat before overriding
      var OrigDTF = Intl.DateTimeFormat;

      // Intl.DateTimeFormat.resolvedOptions
      wrapMethod(Intl.DateTimeFormat.prototype, "resolvedOptions", function(orig) {
        return function resolvedOptions() {
          var r = _call.call(orig, this);
          if (tz.zone) r.timeZone = tz.zone;
          return r;
        };
      });

      // Intl.DateTimeFormat constructor
      var FakeDTF = regNative(function DateTimeFormat(locales, opts) {
        opts = Object.assign({}, opts || {});
        if (!opts.timeZone && tz.zone) opts.timeZone = tz.zone;
        if (new.target) return new OrigDTF(locales, opts);
        return OrigDTF(locales, opts);
      }, "DateTimeFormat");
      FakeDTF.prototype = OrigDTF.prototype;
      FakeDTF.supportedLocalesOf = OrigDTF.supportedLocalesOf;
      nativeStrings.set(FakeDTF.supportedLocalesOf, "function supportedLocalesOf() { [native code] }");
      Intl.DateTimeFormat = FakeDTF;

      // Date.prototype.toString — reconstruct with correct timezone
      wrapMethod(Date.prototype, "toString", function(orig) {
        return function toString() {
          try {
            var d = this;
            var datePart = new OrigDTF("en-US", { timeZone: tz.zone, weekday:"short", year:"numeric", month:"short", day:"2-digit" }).format(d);
            var timePart = new OrigDTF("en-US", { timeZone: tz.zone, hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false }).format(d);
            var sign = tz.offset <= 0 ? "+" : "-";
            var absOff = Math.abs(tz.offset);
            var hh = String(Math.floor(absOff / 60)).padStart(2, "0");
            var mm = String(absOff % 60).padStart(2, "0");
            var tzName = tz.zone.replace(/_/g, " ");
            return datePart + " " + timePart + " GMT" + sign + hh + mm + " (" + tzName + ")";
          } catch(e) {
            return _call.call(orig, this);
          }
        };
      });

      // Date.prototype.toTimeString
      wrapMethod(Date.prototype, "toTimeString", function(orig) {
        return function toTimeString() {
          try {
            var d = this;
            var timePart = new OrigDTF("en-US", { timeZone: tz.zone, hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false }).format(d);
            var sign = tz.offset <= 0 ? "+" : "-";
            var absOff = Math.abs(tz.offset);
            var hh = String(Math.floor(absOff / 60)).padStart(2, "0");
            var mm = String(absOff % 60).padStart(2, "0");
            return timePart + " GMT" + sign + hh + mm;
          } catch(e) {
            return _call.call(orig, this);
          }
        };
      });

      // ── Spoof remaining Intl.* constructors so they don't leak the real locale ──
      // Fingerprinters call Intl.Collator().resolvedOptions().locale etc. to detect
      // the real system locale even when navigator.language is spoofed.
      try {
        var targetLocale = P.language || (P.languages && P.languages[0]) || "en-US";

        function wrapIntlConstructor(ctor, ctorName) {
          if (!Intl[ctorName]) return;
          var OrigCtor = Intl[ctorName];
          var FakeCtor = regNative(function() {
            var args = Array.prototype.slice.call(arguments);
            // If no locale argument passed, inject the spoofed one
            if (!args[0]) args[0] = targetLocale;
            if (new.target) {
              var inst = Object.create(OrigCtor.prototype);
              OrigCtor.apply(inst, args);
              return inst;
            }
            return OrigCtor.apply(null, args);
          }, ctorName);
          try { FakeCtor.prototype = OrigCtor.prototype; } catch(e) {}
          if (OrigCtor.supportedLocalesOf)
            FakeCtor.supportedLocalesOf = OrigCtor.supportedLocalesOf;
          Intl[ctorName] = FakeCtor;
        }
        ["Collator", "NumberFormat", "PluralRules", "RelativeTimeFormat",
         "ListFormat", "Segmenter"].forEach(function(n) {
          try { wrapIntlConstructor(Intl, n); } catch(e) {}
        });
      } catch(e) {}

    } catch(e) {}
  }

  // ═══ MODULE 10: BATTERY — proper method override (not getter-returns-function)
  if (modOn("battery")) {
    try {
      if (navigator.getBattery) {
        var bd = P.battery || { charging: true, chargingTime: 0, dischargingTime: Infinity, level: 1.0 };
        var fbm = {
          charging: bd.charging, chargingTime: bd.chargingTime,
          dischargingTime: bd.dischargingTime, level: bd.level,
          addEventListener: regNative(function addEventListener(){}, "addEventListener"),
          removeEventListener: regNative(function removeEventListener(){}, "removeEventListener"),
          dispatchEvent: regNative(function dispatchEvent(){ return true; }, "dispatchEvent"),
          onchargingchange: null, onchargingtimechange: null,
          ondischargingtimechange: null, onlevelchange: null
        };
        if (typeof BatteryManager !== "undefined") Object.setPrototypeOf(fbm, BatteryManager.prototype);
        // Override as a method on Navigator.prototype (not a getter that returns a fn)
        _defineProperty(Navigator.prototype, "getBattery", {
          value: regNative(function getBattery() { return Promise.resolve(fbm); }, "getBattery"),
          writable: true, enumerable: true, configurable: true
        });
      }
    } catch(e) {}
  }

  // ═══ MODULE 11: SPEECH SYNTHESIS
  if (modOn("speech")) {
    try {
      if (window.speechSynthesis) {
        var voiceCount = P.voiceCount || 5;
        var _gv = speechSynthesis.getVoices.bind(speechSynthesis);
        var cachedV = null;
        _defineProperty(speechSynthesis, "getVoices", {
          value: regNative(function getVoices() {
            if (cachedV) return cachedV;
            var rv = _gv();
            if (rv.length === 0) return rv;
            var sel = []; var step = Math.max(1, Math.floor(rv.length / voiceCount));
            for (var i = 0; i < rv.length && sel.length < voiceCount; i += step) sel.push(rv[i]);
            cachedV = sel;
            return cachedV;
          }, "getVoices"),
          writable: true, configurable: true
        });
      }
    } catch(e) {}
  }

  // ═══ MODULE 12: MEDIA DEVICES
  if (modOn("media")) {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        var mc = P.mediaDevices || { audioinput: 1, videoinput: 1, audiooutput: 1 };
        var _ed = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);
        _defineProperty(navigator.mediaDevices, "enumerateDevices", {
          value: regNative(function enumerateDevices() {
            return _ed().then(function() {
              var fakes = [];
              ["audioinput","videoinput","audiooutput"].forEach(function(kind) {
                for (var i = 0; i < (mc[kind] || 0); i++) {
                  fakes.push({
                    deviceId: RNG.hash("dev:" + kind + ":" + i).toString(16),
                    kind: kind, label: "",
                    groupId: RNG.hash("grp:" + kind + ":" + i).toString(16)
                  });
                }
              });
              return fakes;
            });
          }, "enumerateDevices"),
          writable: true, configurable: true
        });
      }
    } catch(e) {}
  }

  // ═══ MODULE 13: PERFORMANCE TIMING
  // NOTE: performance.now() is fully handled by timing-spoof.js which runs after
  // this script. Do NOT add a second override here — two independent overrides
  // create separate monotonic counters, allowing non-monotonic timestamps which
  // CreepJS detects. timing-spoof.js owns the single authoritative override.

  // ═══ MODULE 14: STORAGE ESTIMATE
  if (modOn("storage")) {
    try {
      if (navigator.storage && navigator.storage.estimate) {
        var _est = navigator.storage.estimate.bind(navigator.storage);
        _defineProperty(navigator.storage, "estimate", {
          value: regNative(function estimate() {
            return _est().then(function(est) {
              return {
                quota: RNG.randomChoice([268435456000, 536870912000, 1073741824000]),
                usage: Math.floor(est.usage * (0.8 + RNG.random() * 0.4)),
                usageDetails: est.usageDetails
              };
            });
          }, "estimate"),
          writable: true, configurable: true
        });
      }
    } catch(e) {}
  }

  
  // ═══ STEALTH: Complete window.chrome object (Pixelscan / CreepJS checks)
  // Real Chrome exposes chrome.loadTimes(), chrome.csi(), chrome.app, chrome.runtime.
  // A missing or incomplete object is an immediate fingerprint of extension tampering.
  try {
    if (!window.chrome) window.chrome = {};

    if (!window.chrome.runtime) {
      window.chrome.runtime = {};
    }

    // chrome.loadTimes() — present in real Chrome (deprecated but still exists)
    if (!window.chrome.loadTimes) {
      var _ltBase = performance.timing ? performance.timing.navigationStart : Date.now();
      window.chrome.loadTimes = regNative(function loadTimes() {
        return {
          requestTime:        _ltBase / 1000,
          startLoadTime:      _ltBase / 1000,
          commitLoadTime:     (_ltBase + 15) / 1000,
          finishDocumentLoadTime: (_ltBase + 80) / 1000,
          finishLoadTime:     (_ltBase + 120) / 1000,
          firstPaintTime:     (_ltBase + 40) / 1000,
          firstPaintAfterLoadTime: 0,
          navigationType:     "Other",
          wasFetchedViaSpdy:  false,
          wasNpnNegotiated:   true,
          npnNegotiatedProtocol: "h2",
          wasAlternateProtocolAvailable: false,
          connectionInfo:     "h2"
        };
      }, "loadTimes");
    }

    // chrome.csi() — present in real Chrome
    if (!window.chrome.csi) {
      window.chrome.csi = regNative(function csi() {
        return {
          startE:  performance.timing ? performance.timing.navigationStart : Date.now(),
          onloadT: performance.timing ? performance.timing.loadEventStart : Date.now() + 100,
          pageT:   performance.now(),
          tran:    15
        };
      }, "csi");
    }

    // chrome.app — present in real Chrome
    if (!window.chrome.app) {
      window.chrome.app = {
        isInstalled: false,
        getDetails:    regNative(function getDetails()    { return null; }, "getDetails"),
        getIsInstalled: regNative(function getIsInstalled() { return false; }, "getIsInstalled"),
        installState:  regNative(function installState(cb) { if (cb) cb("not_installed"); }, "installState"),
        runningState:  regNative(function runningState()  { return "cannot_run"; }, "runningState")
      };
    }
  } catch(e) {}

  // ═══ STEALTH: Iframe pass-through
  try {
    var _cwDesc = _getOPD(HTMLIFrameElement.prototype, "contentWindow");
    if (_cwDesc && _cwDesc.get) {
      var _cwGet = _cwDesc.get;
      _defineProperty(HTMLIFrameElement.prototype, "contentWindow", {
        get: regNative(function() { return _call.call(_cwGet, this); }, "get contentWindow"),
        set: undefined, enumerable: true, configurable: true
      });
    }
  } catch(e) {}

  // Signal completion
  try { window.dispatchEvent(new CustomEvent("__phantomprint_ready__")); } catch(e) {}

})();
