// PhantomPrint Screen & Display Spoofing Module
// Overrides screen properties, viewport dimensions, and matchMedia queries
const ScreenSpoof = (() => {
  'use strict';

  function apply(profile, config) {
    if (!config.enabled) return;

    function makeNative(fn, name) {
      const s = `function ${name || fn.name || ''}() { [native code] }`;
      Object.defineProperty(fn, 'toString', { value: () => s, writable: false, configurable: true });
      return fn;
    }

    // BUG FIX: configurable:false prevents re-override by extra-spoof.js and other modules.
    // Use configurable:true so properties can be redefined if needed.
    function defineGetter(obj, prop, value) {
      Object.defineProperty(obj, prop, {
        get: makeNative(function() { return value; }, `get ${prop}`),
        set: undefined,
        enumerable: true,
        configurable: true
      });
    }

    // Screen properties
    const screenProto = Object.getPrototypeOf(screen);
    defineGetter(screenProto, 'width', profile.screen.width);
    defineGetter(screenProto, 'height', profile.screen.height);
    defineGetter(screenProto, 'availWidth', profile.screen.availWidth);
    defineGetter(screenProto, 'availHeight', profile.screen.availHeight);
    defineGetter(screenProto, 'colorDepth', profile.screen.colorDepth);
    defineGetter(screenProto, 'pixelDepth', profile.screen.pixelDepth);

    // Screen orientation
    if (screen.orientation) {
      const orientProto = Object.getPrototypeOf(screen.orientation);
      defineGetter(orientProto, 'type', profile.orientation.type);
      defineGetter(orientProto, 'angle', profile.orientation.angle);
    }

    // Window dimensions
    defineGetter(window, 'devicePixelRatio', profile.devicePixelRatio);
    defineGetter(window, 'innerWidth', profile.viewport.width);
    defineGetter(window, 'innerHeight', profile.viewport.height);
    defineGetter(window, 'outerWidth', profile.outerWidth);
    defineGetter(window, 'outerHeight', profile.outerHeight);

    // Override matchMedia to return consistent spoofed results
    const origMatchMedia = window.matchMedia;
    window.matchMedia = makeNative(function matchMedia(query) {
      const spoofedResult = getSpoofedMediaQuery(query, profile);
      if (spoofedResult !== null) {
        return createMediaQueryList(query, spoofedResult);
      }
      // For non-spoofed queries, use original
      return origMatchMedia.call(window, query);
    }, 'matchMedia');

    // Override CSS.supports for consistency
    if (window.CSS && window.CSS.supports) {
      const origSupports = window.CSS.supports.bind(window.CSS);
      window.CSS.supports = makeNative(function supports(prop, value) {
        if (arguments.length === 1) {
          return origSupports(prop);
        }
        return origSupports(prop, value);
      }, 'supports');
    }

    // Override visualViewport if available
    if (window.visualViewport) {
      defineGetter(window.visualViewport, 'width', profile.viewport.width);
      defineGetter(window.visualViewport, 'height', profile.viewport.height);
      defineGetter(window.visualViewport, 'scale', 1);
      defineGetter(window.visualViewport, 'offsetLeft', 0);
      defineGetter(window.visualViewport, 'offsetTop', 0);
      defineGetter(window.visualViewport, 'pageLeft', 0);
      defineGetter(window.visualViewport, 'pageTop', 0);
    }
  }

  function getSpoofedMediaQuery(query, profile) {
    const q = query.toLowerCase().trim();

    // Color scheme
    if (q.includes('prefers-color-scheme')) {
      if (q.includes('dark')) return profile.prefersColorScheme === 'dark';
      if (q.includes('light')) return profile.prefersColorScheme === 'light';
    }

    // Reduced motion
    if (q.includes('prefers-reduced-motion')) {
      if (q.includes('reduce')) return profile.prefersReducedMotion;
      if (q.includes('no-preference')) return !profile.prefersReducedMotion;
    }

    // Forced colors
    if (q.includes('forced-colors')) {
      if (q.includes('active')) return profile.forcedColors;
      if (q.includes('none')) return !profile.forcedColors;
    }

    // Contrast
    if (q.includes('prefers-contrast')) {
      if (q.includes('high') || q.includes('more')) return profile.prefersContrast;
      if (q.includes('no-preference')) return !profile.prefersContrast;
    }

    // Color gamut
    if (q.includes('color-gamut')) {
      if (q.includes('rec2020')) return profile.colorGamut === 'rec2020';
      if (q.includes('p3')) return profile.colorGamut === 'p3' || profile.colorGamut === 'rec2020';
      if (q.includes('srgb')) return true;
    }

    // Dynamic range
    if (q.includes('dynamic-range')) {
      if (q.includes('high')) return profile.dynamicRange;
      if (q.includes('standard')) return true;
    }

    // Device width/height
    if (q.includes('device-width') || q.includes('device-height')) {
      return evaluateDimensionQuery(q, profile);
    }

    // Width/height media queries
    if (q.includes('min-width') || q.includes('max-width') || q.includes('min-height') || q.includes('max-height')) {
      return evaluateViewportQuery(q, profile);
    }

    // Pointer and hover
    if (q.includes('pointer')) {
      if (q.includes('coarse')) return profile.touchEnabled;
      if (q.includes('fine')) return !profile.touchEnabled;
      if (q.includes('none')) return false;
    }
    if (q.includes('hover')) {
      if (q.includes('none')) return profile.touchEnabled;
      if (q.includes('hover')) return !profile.touchEnabled;
    }

    // Display mode
    if (q.includes('display-mode')) {
      if (q.includes('browser')) return true;
      return false;
    }

    return null; // Not a query we spoof
  }

  function evaluateDimensionQuery(query, profile) {
    const widthMatch = query.match(/device-width:\s*(\d+)px/);
    const heightMatch = query.match(/device-height:\s*(\d+)px/);
    if (widthMatch) {
      const val = parseInt(widthMatch[1]);
      if (query.includes('min-')) return profile.screen.width >= val;
      if (query.includes('max-')) return profile.screen.width <= val;
      return profile.screen.width === val;
    }
    if (heightMatch) {
      const val = parseInt(heightMatch[1]);
      if (query.includes('min-')) return profile.screen.height >= val;
      if (query.includes('max-')) return profile.screen.height <= val;
      return profile.screen.height === val;
    }
    return null;
  }

  function evaluateViewportQuery(query, profile) {
    const minW = query.match(/min-width:\s*(\d+)px/);
    const maxW = query.match(/max-width:\s*(\d+)px/);
    const minH = query.match(/min-height:\s*(\d+)px/);
    const maxH = query.match(/max-height:\s*(\d+)px/);
    let result = true;
    if (minW) result = result && profile.viewport.width >= parseInt(minW[1]);
    if (maxW) result = result && profile.viewport.width <= parseInt(maxW[1]);
    if (minH) result = result && profile.viewport.height >= parseInt(minH[1]);
    if (maxH) result = result && profile.viewport.height <= parseInt(maxH[1]);
    return result;
  }

  function createMediaQueryList(query, matches) {
    const mql = {
      matches: matches,
      media: query,
      onchange: null,
      addEventListener: function(type, listener) {},
      removeEventListener: function(type, listener) {},
      addListener: function(cb) {},
      removeListener: function(cb) {},
      dispatchEvent: function(event) { return true; }
    };
    // Make it look like a real MediaQueryList
    Object.setPrototypeOf(mql, MediaQueryList.prototype);
    return mql;
  }

  return { apply };
})();
