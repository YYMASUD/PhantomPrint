// PhantomPrint — navigator.userAgentData (User-Agent Client Hints JS API) Spoofing
// Spoofs the JavaScript-side UAData interface so it matches the HTTP Sec-CH-UA-* headers
// and the spoofed navigator.userAgent. Without this, fingerprinters compare the HTTP
// headers (already spoofed) against the JS API (unprotected) and flag the mismatch.
//
// Must run in MAIN world at document_start. Reads config from window.__pp_cfg__
// (set by content.js as a non-enumerable, self-removing window property).
(function () {
  'use strict';

  var CFG = window.__pp_cfg__;
  if (!CFG || !CFG.enabled) return;
  var P   = CFG.profile;
  var MOD = CFG.modules || {};
  if (MOD.navigator === false || !P) return;

  var _defineProperty = Object.defineProperty;
  var _call           = Function.prototype.call;

  // Reuse the shared nativeStrings WeakMap exposed by inject.js.
  // inject.js always runs first (content.js injects in order), so
  // window.__ppNatives will be available.
  var nativeStrings = (window.__ppNatives instanceof WeakMap)
    ? window.__ppNatives : new WeakMap();

  if (!(window.__ppNatives instanceof WeakMap)) {
    // Fallback: patch toString locally so our functions look native
    var _ts = Function.prototype.toString;
    var _lp = function toString() {
      if (nativeStrings.has(this)) return nativeStrings.get(this);
      return _call.call(_ts, this);
    };
    nativeStrings.set(_lp, 'function toString() { [native code] }');
    try { _defineProperty(Function.prototype, 'toString',
      { value: _lp, writable: true, configurable: true, enumerable: false }); } catch (e) {}
  }

  function regNative(fn, name) {
    var n = name || fn.name || '';
    nativeStrings.set(fn, 'function ' + n + '() { [native code] }');
    try { _defineProperty(fn, 'name', { value: n, configurable: true }); } catch (e) {}
    return fn;
  }

  // Build spoofed values from profile.clientHints
  var ch = P.clientHints || {};
  var brands = Array.isArray(ch.brands)
    ? ch.brands.map(function (b) { return { brand: String(b.brand), version: String(b.version) }; })
    : [{ brand:'Chromium',version:'136'},{ brand:'Google Chrome',version:'136'},{ brand:'Not_A Brand',version:'99'}];

  var fullVersionList = Array.isArray(ch.fullVersionList)
    ? ch.fullVersionList.map(function (b) { return { brand: String(b.brand), version: String(b.version) }; })
    : brands.map(function (b) { return { brand: b.brand, version: b.version + '.0.0.0' }; });

  var platform = ch.platform || (function () {
    var o = P.os || 'Windows';
    return o === 'macOS' ? 'macOS' : o === 'Linux' ? 'Linux' :
           o === 'Android' ? 'Android' : o === 'iOS' ? 'iOS' : 'Windows';
  })();

  var mobile = ch.mobile !== undefined ? !!ch.mobile : !!P.mobile;
  var architecture = ch.architecture || (P.os === 'Android' || P.os === 'iOS' ? 'arm' : 'x86');

  // Detect Apple Silicon from GPU string
  if (P.os === 'macOS' && !ch.architecture) {
    var g = String(P.gpu || P.gpuVendor || '').toLowerCase();
    if (g.indexOf('apple') !== -1 || g.indexOf(' m1') !== -1 ||
        g.indexOf(' m2') !== -1  || g.indexOf(' m3') !== -1) {
      architecture = 'arm';
    }
  }

  var bitness  = ch.bitness  || '64';
  var wow64    = ch.wow64    !== undefined ? ch.wow64 : false;
  var model    = ch.model    || (P.os === 'Android' ? (P.model || 'Pixel 7') : '');
  var platformVersion = ch.platformVersion || (function () {
    var o = P.os || 'Windows';
    return o === 'Windows' ? '15.0.0' : o === 'macOS' ? '14.0.0' :
           o === 'Android' ? '14.0.0' : o === 'iOS'   ? '17.0.0' : '';
  })();

  var uaFullVersion = (function () {
    for (var i = 0; i < fullVersionList.length; i++) {
      var b = fullVersionList[i];
      if (b.brand === 'Google Chrome' || b.brand === 'Chromium' || b.brand === 'Microsoft Edge')
        return b.version;
    }
    return '136.0.0.0';
  })();

  var heValues = {
    architecture: architecture, bitness: bitness, brands: brands,
    fullVersionList: fullVersionList, mobile: mobile, model: model,
    platform: platform, platformVersion: platformVersion,
    uaFullVersion: uaFullVersion, wow64: wow64
  };

  // Build the fake NavigatorUAData object
  var fakeUAData = {
    brands: brands, mobile: mobile, platform: platform,
    getHighEntropyValues: regNative(function getHighEntropyValues(hints) {
      var result = {};
      if (!Array.isArray(hints)) return Promise.resolve(result);
      for (var i = 0; i < hints.length; i++) {
        var h = hints[i];
        if (Object.prototype.hasOwnProperty.call(heValues, h)) result[h] = heValues[h];
      }
      return Promise.resolve(result);
    }, 'getHighEntropyValues'),
    toJSON: regNative(function toJSON() {
      return { brands: brands, mobile: mobile, platform: platform };
    }, 'toJSON')
  };

  try {
    if (typeof NavigatorUAData !== 'undefined')
      Object.setPrototypeOf(fakeUAData, NavigatorUAData.prototype);
  } catch (e) {}

  // Install on Navigator.prototype (covers all navigator instances + iframes)
  var getter = regNative(function () { return fakeUAData; }, 'get userAgentData');
  try {
    _defineProperty(Navigator.prototype, 'userAgentData',
      { get: getter, set: undefined, configurable: true, enumerable: true });
  } catch (e) {
    try {
      _defineProperty(navigator, 'userAgentData',
        { get: getter, set: undefined, configurable: true, enumerable: true });
    } catch (e2) {}
  }

})();
