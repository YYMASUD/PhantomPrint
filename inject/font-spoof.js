// PhantomPrint Font Fingerprinting Protection
// Limits detectable fonts to a whitelist and normalizes font metrics
const FontSpoof = (() => {
  'use strict';

  function apply(profile, config, prng) {
    if (!config.enabled) return;

    function makeNative(fn, name) {
      const s = `function ${name || fn.name || ''}() { [native code] }`;
      Object.defineProperty(fn, 'toString', { value: () => s, writable: false, configurable: true });
      return fn;
    }

    const allowedFonts = new Set(profile.fonts);

    // Override document.fonts.check() - only confirm whitelisted fonts
    if (document.fonts && document.fonts.check) {
      const origCheck = document.fonts.check.bind(document.fonts);
      document.fonts.check = makeNative(function check(font, text) {
        const fontFamily = extractFontFamily(font);
        if (fontFamily && !allowedFonts.has(fontFamily)) {
          return false;
        }
        return origCheck(font, text || ' ');
      }, 'check');
    }

    // Override document.fonts.forEach to return limited font list
    if (document.fonts) {
      const origForEach = document.fonts.forEach;
      if (origForEach) {
        document.fonts.forEach = makeNative(function forEach(callback, thisArg) {
          origForEach.call(this, function(fontFace, key, set) {
            if (allowedFonts.has(fontFace.family.replace(/['"]/g, ''))) {
              callback.call(thisArg, fontFace, key, set);
            }
          });
        }, 'forEach');
      }

      // Override fonts.entries(), keys(), values() iterators
      const origEntries = document.fonts.entries;
      if (origEntries) {
        document.fonts.entries = makeNative(function* entries() {
          for (const entry of origEntries.call(this)) {
            if (allowedFonts.has(entry[0].family.replace(/['"]/g, ''))) {
              yield entry;
            }
          }
        }, 'entries');
      }
    }

    // Intercept font detection via offsetWidth/offsetHeight
    // Many fingerprinters create span elements and check dimensions with different fonts
    const origOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
    const origOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');

    if (origOffsetWidth && origOffsetWidth.get) {
      const origWidthGet = origOffsetWidth.get;
      Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
        get: makeNative(function() {
          const width = origWidthGet.call(this);
          if (isFontProbeElement(this)) {
            const fontFamily = getFontFromStyle(this);
            if (fontFamily && !allowedFonts.has(fontFamily)) {
              // Return the same width as the fallback font (making it appear font is not installed)
              return getDefaultWidth(this);
            }
          }
          return width;
        }, 'get offsetWidth'),
        configurable: true, enumerable: true
      });
    }

    if (origOffsetHeight && origOffsetHeight.get) {
      const origHeightGet = origOffsetHeight.get;
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
        get: makeNative(function() {
          const height = origHeightGet.call(this);
          if (isFontProbeElement(this)) {
            const fontFamily = getFontFromStyle(this);
            if (fontFamily && !allowedFonts.has(fontFamily)) {
              return getDefaultHeight(this);
            }
          }
          return height;
        }, 'get offsetHeight'),
        configurable: true, enumerable: true
      });
    }

    // Override getBoundingClientRect for font probe elements
    const origGetBCR = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = makeNative(function getBoundingClientRect() {
      const rect = origGetBCR.call(this);
      if (isFontProbeElement(this)) {
        const fontFamily = getFontFromStyle(this);
        if (fontFamily && !allowedFonts.has(fontFamily)) {
          // Return dimensions as if using fallback font
          const defW = getDefaultWidth(this);
          const defH = getDefaultHeight(this);
          return {
            x: rect.x, y: rect.y,
            width: defW || rect.width,
            height: defH || rect.height,
            top: rect.top, right: rect.x + (defW || rect.width),
            bottom: rect.top + (defH || rect.height), left: rect.left,
            toJSON: function() { return this; }
          };
        }
      }
      return rect;
    }, 'getBoundingClientRect');

    // Override FontFace constructor to restrict loading non-whitelisted fonts check
    // Note: We don't block FontFace creation (would break web fonts), just detection
  }

  function extractFontFamily(fontString) {
    // Parse CSS font shorthand or font-family value
    const parts = fontString.split(/\s+/);
    // Try to find the font family name (last part, possibly quoted)
    let family = '';
    let foundSize = false;
    for (let i = 0; i < parts.length; i++) {
      if (/^\d/.test(parts[i]) || parts[i].includes('px') || parts[i].includes('pt') || parts[i].includes('em')) {
        foundSize = true;
        continue;
      }
      if (foundSize) {
        family = parts.slice(i).join(' ');
        break;
      }
    }
    if (!family) family = fontString;
    return family.replace(/['"]/g, '').split(',')[0].trim();
  }

  function isFontProbeElement(el) {
    if (!el || !el.style) return false;
    // Font probes are typically: invisible, positioned off-screen, or very small
    const style = el.style;
    if (style.position === 'absolute' && (style.left === '-9999px' || style.top === '-9999px' || style.visibility === 'hidden')) return true;
    if (el.offsetParent === null && el.parentElement && el.parentElement !== document.body) return true;
    // Check if the element has a very specific font-detection pattern
    const text = el.textContent || el.innerText;
    if (text && (text === 'mmmmmmmmmmlli' || text === 'WwMmLli' || text.length <= 20)) return true;
    // Check parent - fingerprinters often use a container div
    if (el.parentElement && el.parentElement.children.length > 10) return true;
    return false;
  }

  function getFontFromStyle(el) {
    const computed = window.getComputedStyle(el);
    const family = computed.fontFamily || el.style.fontFamily;
    if (!family) return null;
    const first = family.split(',')[0].trim().replace(/['"]/g, '');
    return first;
  }

  // Cache for default dimensions
  const defaultDimensionCache = new WeakMap();

  function getDefaultWidth(el) {
    if (defaultDimensionCache.has(el)) return defaultDimensionCache.get(el).width;
    // We can't easily compute this without causing recursion, so return a standard value
    // based on text content length and font size
    const computed = window.getComputedStyle(el);
    const fontSize = parseFloat(computed.fontSize) || 16;
    const text = el.textContent || '';
    const approxWidth = Math.round(text.length * fontSize * 0.6);
    return approxWidth || 100;
  }

  function getDefaultHeight(el) {
    if (defaultDimensionCache.has(el)) return defaultDimensionCache.get(el).height;
    const computed = window.getComputedStyle(el);
    const fontSize = parseFloat(computed.fontSize) || 16;
    return Math.round(fontSize * 1.2);
  }

  return { apply };
})();
