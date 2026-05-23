// PhantomPrint - Self-Harvest Collector (Phase 3)
// Collects REAL browser fingerprint data from the user's own browsers
// to supplement external databases with verified real-world data
'use strict';

const HarvestCollector = (() => {
  const STORAGE_KEY = 'phantomprint_harvest_db';
  const MAX_HARVESTED = 50; // Max stored profiles

  // Collect the current browser's real fingerprint
  async function collectCurrentFingerprint() {
    const fp = {};

    // Navigator properties
    fp.userAgent = navigator.userAgent;
    fp.platform = navigator.platform;
    fp.vendor = navigator.vendor || '';
    fp.language = navigator.language;
    fp.languages = Array.from(navigator.languages || [fp.language]);
    fp.hardwareConcurrency = navigator.hardwareConcurrency;
    fp.deviceMemory = navigator.deviceMemory || null;
    fp.maxTouchPoints = navigator.maxTouchPoints || 0;
    fp.cookieEnabled = navigator.cookieEnabled;
    fp.doNotTrack = navigator.doNotTrack;
    fp.pdfViewerEnabled = navigator.pdfViewerEnabled;

    // Client Hints
    if (navigator.userAgentData) {
      try {
        const uad = await navigator.userAgentData.getHighEntropyValues([
          'platform', 'platformVersion', 'architecture', 'bitness',
          'model', 'mobile', 'fullVersionList'
        ]);
        fp.clientHints = {
          platform: uad.platform,
          platformVersion: uad.platformVersion,
          architecture: uad.architecture,
          bitness: uad.bitness,
          model: uad.model,
          mobile: uad.mobile,
          brands: uad.fullVersionList || navigator.userAgentData.brands
        };
      } catch(e) {
        fp.clientHints = null;
      }
    } else {
      fp.clientHints = null;
    }

    // Screen
    fp.screen = {
      width: screen.width, height: screen.height,
      availWidth: screen.availWidth, availHeight: screen.availHeight,
      colorDepth: screen.colorDepth, pixelDepth: screen.pixelDepth
    };
    fp.devicePixelRatio = window.devicePixelRatio;
    fp.innerWidth = window.innerWidth;
    fp.innerHeight = window.innerHeight;
    fp.outerWidth = window.outerWidth;
    fp.outerHeight = window.outerHeight;

    // Timezone
    fp.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    fp.timezoneOffset = new Date().getTimezoneOffset();

    // WebGL
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (gl) {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        fp.webgl = {
          vendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
          renderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
          version: gl.getParameter(gl.VERSION),
          shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
          maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
          maxViewportDims: Array.from(gl.getParameter(gl.MAX_VIEWPORT_DIMS)),
          maxRenderbufferSize: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
          maxVertexAttribs: gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
          maxVertexUniformVectors: gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS),
          maxFragmentUniformVectors: gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS),
          maxVaryingVectors: gl.getParameter(gl.MAX_VARYING_VECTORS),
          maxCombinedTextureUnits: gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS),
          maxCubeMapTextureSize: gl.getParameter(gl.MAX_CUBE_MAP_TEXTURE_SIZE),
          extensions: gl.getSupportedExtensions() || []
        };
        // Shader precision
        fp.webgl.shaderPrecision = {};
        for (const type of [gl.VERTEX_SHADER, gl.FRAGMENT_SHADER]) {
          const prefix = type === gl.VERTEX_SHADER ? 'vertex' : 'fragment';
          for (const prec of [gl.HIGH_FLOAT, gl.MEDIUM_FLOAT, gl.LOW_FLOAT]) {
            const precName = prec === gl.HIGH_FLOAT ? 'High' : prec === gl.MEDIUM_FLOAT ? 'Medium' : 'Low';
            const format = gl.getShaderPrecisionFormat(type, prec);
            if (format) {
              fp.webgl.shaderPrecision[`${prefix}Shader${precName}Float`] = {
                rangeMin: format.rangeMin, rangeMax: format.rangeMax, precision: format.precision
              };
            }
          }
        }
      }
    } catch(e) {
      fp.webgl = null;
    }

    // WebGL2
    try {
      const canvas2 = document.createElement('canvas');
      const gl2 = canvas2.getContext('webgl2');
      if (gl2) {
        fp.webgl2 = {
          version: gl2.getParameter(gl2.VERSION),
          max3dTextureSize: gl2.getParameter(gl2.MAX_3D_TEXTURE_SIZE),
          maxArrayTextureLayers: gl2.getParameter(gl2.MAX_ARRAY_TEXTURE_LAYERS),
          maxDrawBuffers: gl2.getParameter(gl2.MAX_DRAW_BUFFERS),
          maxColorAttachments: gl2.getParameter(gl2.MAX_COLOR_ATTACHMENTS),
          maxUniformBufferBindings: gl2.getParameter(gl2.MAX_UNIFORM_BUFFER_BINDINGS),
          extensions: gl2.getSupportedExtensions() || []
        };
      }
    } catch(e) {
      fp.webgl2 = null;
    }

    // Audio
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      fp.audio = {
        sampleRate: ctx.sampleRate,
        maxChannelCount: ctx.destination.maxChannelCount,
        state: ctx.state
      };
      ctx.close();
    } catch(e) {
      fp.audio = null;
    }

    // Fonts (basic measurement)
    fp.fonts = await detectFonts();

    // Media devices
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      fp.mediaDevices = {
        audioinput: devices.filter(d => d.kind === 'audioinput').length,
        audiooutput: devices.filter(d => d.kind === 'audiooutput').length,
        videoinput: devices.filter(d => d.kind === 'videoinput').length
      };
    } catch(e) {
      fp.mediaDevices = null;
    }

    // Connection
    if (navigator.connection) {
      fp.connection = {
        effectiveType: navigator.connection.effectiveType,
        downlink: navigator.connection.downlink,
        rtt: navigator.connection.rtt,
        saveData: navigator.connection.saveData
      };
    } else {
      fp.connection = null;
    }

    // Plugins
    fp.plugins = Array.from(navigator.plugins || []).map(p => ({ name: p.name, filename: p.filename }));

    // Speech voices
    try {
      fp.voices = speechSynthesis.getVoices().map(v => ({
        name: v.name, lang: v.lang, localService: v.localService
      }));
    } catch(e) {
      fp.voices = [];
    }

    // Storage estimate
    try {
      const estimate = await navigator.storage.estimate();
      fp.storage = { quota: estimate.quota, usage: estimate.usage };
    } catch(e) {
      fp.storage = null;
    }

    // Media queries
    fp.mediaQueries = {
      prefersColorScheme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
      prefersReducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      forcedColors: matchMedia('(forced-colors: active)').matches,
      colorGamut: matchMedia('(color-gamut: p3)').matches ? 'p3' : matchMedia('(color-gamut: srgb)').matches ? 'srgb' : 'narrow'
    };

    // Metadata
    fp.harvestedAt = new Date().toISOString();
    fp.harvestId = generateHarvestId();

    return fp;
  }

  function generateHarvestId() {
    return 'hv_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
  }

  // Basic font detection via width measurement
  async function detectFonts() {
    const testFonts = [
      'Arial','Arial Black','Calibri','Cambria','Comic Sans MS','Consolas',
      'Courier New','Georgia','Helvetica','Helvetica Neue','Impact',
      'Lucida Console','Menlo','Monaco','Palatino Linotype','San Francisco',
      'Segoe UI','Tahoma','Times New Roman','Trebuchet MS','Verdana',
      'DejaVu Sans','Liberation Sans','Noto Sans','Roboto','Ubuntu'
    ];
    const detected = [];
    try {
      // Use document.fonts if available
      if (document.fonts && document.fonts.check) {
        for (const font of testFonts) {
          if (document.fonts.check(`12px "${font}"`)) {
            detected.push(font);
          }
        }
      }
    } catch(e) {}
    return detected;
  }

  // Save a harvested profile to chrome.storage
  async function saveToHarvestDB(fingerprint) {
    return new Promise((resolve, reject) => {
      const api = typeof browser !== 'undefined' ? browser : chrome;
      api.storage.local.get(STORAGE_KEY, (result) => {
        const db = result[STORAGE_KEY] || [];
        db.push(fingerprint);
        // Keep only latest MAX_HARVESTED entries
        while (db.length > MAX_HARVESTED) db.shift();
        api.storage.local.set({ [STORAGE_KEY]: db }, () => {
          if (api.runtime.lastError) reject(api.runtime.lastError);
          else resolve(db.length);
        });
      });
    });
  }

  // Get all harvested profiles
  async function getHarvestedProfiles() {
    return new Promise((resolve) => {
      const api = typeof browser !== 'undefined' ? browser : chrome;
      api.storage.local.get(STORAGE_KEY, (result) => {
        resolve(result[STORAGE_KEY] || []);
      });
    });
  }

  // Get harvested profile count
  async function getHarvestCount() {
    const profiles = await getHarvestedProfiles();
    return profiles.length;
  }

  // Clear all harvested data
  async function clearHarvestDB() {
    return new Promise((resolve) => {
      const api = typeof browser !== 'undefined' ? browser : chrome;
      api.storage.local.remove(STORAGE_KEY, resolve);
    });
  }

  return {
    collectCurrentFingerprint,
    saveToHarvestDB,
    getHarvestedProfiles,
    getHarvestCount,
    clearHarvestDB,
    STORAGE_KEY
  };
})();

if (typeof module !== 'undefined') module.exports = HarvestCollector;
