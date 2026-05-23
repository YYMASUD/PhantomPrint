/**
 * PhantomPrint — Anti-Detection Hardening Module
 * Makes all spoofing completely undetectable by fingerprint detection services.
 * Patches toString, property descriptors, prototype chains, stack traces, workers, and more.
 * Runs in MAIN world context (page scope).
 * @module modules/anti-detection
 */
'use strict';

const AntiDetection = {
  /** @type {Map<Function, string>} Map of patched functions to their native name */
  _patchedFunctions: new Map(),

  /**
   * Initialize all anti-detection measures
   * @param {Object} profile - Current fingerprint profile
   * @param {Object} config - Extension configuration
   */
  init(profile, config) {
    if (!config?.enabled) return;

    this.patchFunctionToString();
    this.hardenPropertyDescriptors();
    this.protectPrototypeChains();
    this.cleanStackTraces();
    this.hideExtension();
    this.bypassHeadlessDetection(profile);
    this.spoofWorkers(profile, config);
    this.protectPerformanceEntries();
  },

  // =========================================================================
  // 1. Function.prototype.toString Patching
  // =========================================================================
  /**
   * Ensure all overridden native functions return "[native code]" strings.
   * This defeats CreepJS/FingerprintJS toString() checks.
   */
  patchFunctionToString() {
    const _this = this;
    const originalToString = Function.prototype.toString;
    const nativeToString = 'function toString() { [native code] }';

    const patchedToString = function toString() {
      // Check if this function was registered as a native-looking override
      if (_this._patchedFunctions.has(this)) {
        return `function ${_this._patchedFunctions.get(this)}() { [native code] }`;
      }
      // Default behavior for non-patched functions
      return originalToString.call(this);
    };

    // Patch toString itself to look native
    _this._patchedFunctions.set(patchedToString, 'toString');

    // Apply
    Function.prototype.toString = patchedToString;
  },

  /**
   * Register a function as "native-looking" for toString() purposes
   * @param {Function} fn - The overriding function
   * @param {string} name - Original native function name (e.g., 'getParameter')
   */
  registerNative(fn, name) {
    this._patchedFunctions.set(fn, name);
  },

  // =========================================================================
  // 2. Property Descriptor Hardening
  // =========================================================================
  /**
   * Ensure Object.getOwnPropertyDescriptor and Reflect return expected results
   * for spoofed properties.
   */
  hardenPropertyDescriptors() {
    const spoofedDescriptors = new Map();

    /**
     * Register a property as having spoofed descriptor
     * @param {Object} obj - Target object
     * @param {string} prop - Property name
     * @param {Object} descriptor - Expected descriptor
     */
    this.registerDescriptor = (obj, prop, descriptor) => {
      const key = `${obj.constructor?.name || 'Object'}::${prop}`;
      spoofedDescriptors.set(key, { obj, prop, descriptor });
    };

    // Patch Object.getOwnPropertyDescriptor
    const originalGetOPD = Object.getOwnPropertyDescriptor;
    const patchedGetOPD = function getOwnPropertyDescriptor(obj, prop) {
      const key = `${obj?.constructor?.name || 'Object'}::${prop}`;
      const spoofed = spoofedDescriptors.get(key);
      if (spoofed && spoofed.obj === obj) return spoofed.descriptor;
      return originalGetOPD.call(this, obj, prop);
    };
    Object.getOwnPropertyDescriptor = patchedGetOPD;
    this.registerNative(patchedGetOPD, 'getOwnPropertyDescriptor');

    // Patch Reflect.getOwnPropertyDescriptor
    if (typeof Reflect !== 'undefined') {
      const originalReflectGetOPD = Reflect.getOwnPropertyDescriptor;
      const patchedReflectGetOPD = function getOwnPropertyDescriptor(obj, prop) {
        const key = `${obj?.constructor?.name || 'Object'}::${prop}`;
        const spoofed = spoofedDescriptors.get(key);
        if (spoofed && spoofed.obj === obj) return spoofed.descriptor;
        return originalReflectGetOPD.call(this, obj, prop);
      };
      Reflect.getOwnPropertyDescriptor = patchedReflectGetOPD;
      this.registerNative(patchedReflectGetOPD, 'getOwnPropertyDescriptor');
    }

    // Patch Object.getOwnPropertyDescriptors
    const originalGetOPDs = Object.getOwnPropertyDescriptors;
    const patchedGetOPDs = function getOwnPropertyDescriptors(obj) {
      const result = originalGetOPDs.call(this, obj);
      // Override any spoofed descriptors
      for (const [key, data] of spoofedDescriptors) {
        if (data.obj === obj) {
          result[data.prop] = data.descriptor;
        }
      }
      return result;
    };
    Object.getOwnPropertyDescriptors = patchedGetOPDs;
    this.registerNative(patchedGetOPDs, 'getOwnPropertyDescriptors');
  },

  // =========================================================================
  // 3. Prototype Chain Integrity
  // =========================================================================
  protectPrototypeChains() {
    // Ensure Symbol.toStringTag returns correct values for spoofed objects
    // This prevents detection via Object.prototype.toString.call(obj)
    const protectedObjects = [
      { obj: Navigator.prototype, tag: 'Navigator' },
      { obj: Screen.prototype, tag: 'Screen' },
      { obj: HTMLCanvasElement.prototype, tag: 'HTMLCanvasElement' }
    ];

    for (const { obj, tag } of protectedObjects) {
      try {
        const existing = Object.getOwnPropertyDescriptor(obj, Symbol.toStringTag);
        if (!existing) {
          Object.defineProperty(obj, Symbol.toStringTag, {
            value: tag, configurable: true, writable: false, enumerable: false
          });
        }
      } catch (e) { /* Property may be non-configurable */ }
    }
  },

  // =========================================================================
  // 4. Error Stack Trace Cleaning
  // =========================================================================
  cleanStackTraces() {
    const extensionPatterns = [
      /chrome-extension:\/\//g,
      /moz-extension:\/\//g,
      /safari-extension:\/\//g,
      /at\s+chrome-extension:\/\/[^\s]+/g,
      /at\s+moz-extension:\/\/[^\s]+/g,
      /phantomprint/gi,
      /main-world-inject/gi,
      /anti-detection/gi
    ];

    /**
     * Remove extension-related frames from a stack trace string
     * @param {string} stack
     * @returns {string}
     */
    const cleanStack = (stack) => {
      if (!stack || typeof stack !== 'string') return stack;
      let lines = stack.split('\n');
      lines = lines.filter(line => {
        for (const pattern of extensionPatterns) {
          pattern.lastIndex = 0;
          if (pattern.test(line)) return false;
        }
        return true;
      });
      return lines.join('\n');
    };

    // Patch Error constructor to auto-clean stacks
    const OriginalError = Error;
    const originalCaptureStackTrace = Error.captureStackTrace;

    if (originalCaptureStackTrace) {
      Error.captureStackTrace = function (targetObject, constructorOpt) {
        originalCaptureStackTrace.call(this, targetObject, constructorOpt);
        if (targetObject.stack) {
          targetObject.stack = cleanStack(targetObject.stack);
        }
      };
      this.registerNative(Error.captureStackTrace, 'captureStackTrace');
    }

    // Patch the stack getter on Error prototype
    const originalStackDescriptor = Object.getOwnPropertyDescriptor(Error.prototype, 'stack') ||
                                     Object.getOwnPropertyDescriptor(OriginalError.prototype, 'stack');
    if (originalStackDescriptor && originalStackDescriptor.get) {
      const originalGetter = originalStackDescriptor.get;
      Object.defineProperty(Error.prototype, 'stack', {
        get() {
          const stack = originalGetter.call(this);
          return cleanStack(stack);
        },
        set(val) {
          Object.defineProperty(this, 'stack', {
            value: val, writable: true, configurable: true
          });
        },
        configurable: true
      });
    }
  },

  // =========================================================================
  // 5. Extension Self-Hiding
  // =========================================================================
  hideExtension() {
    // Block chrome.runtime detection probing
    try {
      // If chrome.runtime exists in page context, it could be probed
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        // Prevent pages from using sendMessage to detect extension
        const originalSendMessage = chrome.runtime.sendMessage;
        if (originalSendMessage) {
          chrome.runtime.sendMessage = function () {
            // Only allow internal calls, block external probing
            throw new TypeError('Cannot read properties of undefined');
          };
        }
      }
    } catch (e) { /* Expected in MAIN world */ }

    // Override document.querySelectorAll to filter extension-injected elements
    const originalQSA = Document.prototype.querySelectorAll;
    const originalQS = Document.prototype.querySelector;

    const isExtensionElement = (el) => {
      if (!el || !el.getAttribute) return false;
      const src = el.getAttribute('src') || '';
      const href = el.getAttribute('href') || '';
      return src.includes('chrome-extension://') ||
             src.includes('moz-extension://') ||
             href.includes('chrome-extension://') ||
             href.includes('moz-extension://') ||
             el.hasAttribute('data-pp-config');
    };

    Document.prototype.querySelectorAll = function querySelectorAll(selector) {
      const results = originalQSA.call(this, selector);
      // Filter out extension elements
      const filtered = Array.from(results).filter(el => !isExtensionElement(el));
      // Return a NodeList-like object
      return filtered;
    };
    this.registerNative(Document.prototype.querySelectorAll, 'querySelectorAll');

    Document.prototype.querySelector = function querySelector(selector) {
      const result = originalQS.call(this, selector);
      if (result && isExtensionElement(result)) return null;
      return result;
    };
    this.registerNative(Document.prototype.querySelector, 'querySelector');

    // Clean data-pp-config attribute immediately
    try {
      document.documentElement.removeAttribute('data-pp-config');
    } catch (e) {}
  },

  // =========================================================================
  // 6. Headless/Automation Detection Bypass
  // =========================================================================
  bypassHeadlessDetection(profile) {
    // Remove navigator.webdriver
    try {
      Object.defineProperty(Navigator.prototype, 'webdriver', {
        get: () => false,
        configurable: true
      });
      // Also try deleting it
      if (navigator.webdriver !== undefined) {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined,
          configurable: true
        });
      }
    } catch (e) {}

    // Ensure window.chrome exists and looks normal (not automated)
    if (typeof chrome === 'undefined' || !window.chrome) {
      window.chrome = {};
    }
    // Remove automation indicators
    try {
      if (window.chrome) {
        // csi and loadTimes are present in normal Chrome but have specific signatures
        if (!window.chrome.csi) {
          window.chrome.csi = function () {
            return {
              startE: Date.now(),
              onloadT: Date.now() - Math.floor(Math.random() * 500),
              pageT: Math.random() * 1000 + 500,
              tran: 15
            };
          };
        }
        if (!window.chrome.loadTimes) {
          window.chrome.loadTimes = function () {
            return {
              commitLoadTime: Date.now() / 1000 - Math.random(),
              connectionInfo: 'h2',
              finishDocumentLoadTime: Date.now() / 1000,
              finishLoadTime: Date.now() / 1000,
              firstPaintAfterLoadTime: 0,
              firstPaintTime: Date.now() / 1000 - Math.random() * 0.1,
              navigationType: 'Other',
              npnNegotiatedProtocol: 'h2',
              requestTime: Date.now() / 1000 - Math.random() * 2,
              startLoadTime: Date.now() / 1000 - Math.random() * 2,
              wasAlternateProtocolAvailable: false,
              wasFetchedViaSpdy: true,
              wasNpnNegotiated: true
            };
          };
        }
      }
    } catch (e) {}

    // Spoof navigator.permissions for notifications
    try {
      const originalQuery = Permissions.prototype.query;
      Permissions.prototype.query = function query(permissionDesc) {
        if (permissionDesc && permissionDesc.name === 'notifications') {
          return Promise.resolve({ state: 'prompt', onchange: null });
        }
        return originalQuery.call(this, permissionDesc);
      };
      AntiDetection.registerNative(Permissions.prototype.query, 'query');
    } catch (e) {}

    // Ensure outerWidth/Height are not 0 (headless browser gives 0)
    if (window.outerWidth === 0 || window.outerHeight === 0) {
      Object.defineProperty(window, 'outerWidth', {
        get: () => profile?.outerWidth || window.innerWidth + 16,
        configurable: true
      });
      Object.defineProperty(window, 'outerHeight', {
        get: () => profile?.outerHeight || window.innerHeight + 88,
        configurable: true
      });
    }

    // Remove Selenium/Puppeteer/Playwright artifacts
    const seleniumProps = [
      '$cdc_asdjflasutopfhvcZLmcfl_', '$chrome_asyncScriptInfo',
      '__webdriver_evaluate', '__selenium_evaluate',
      '__webdriver_script_function', '__webdriver_script_func',
      '__webdriver_script_fn', '__fxdriver_evaluate',
      '__driver_unwrapped', '__webdriver_unwrapped',
      '__driver_evaluate', '__selenium_unwrapped',
      '_Selenium_IDE_Recorder', '_selenium',
      'calledSelenium', '_WEBDRIVER_ELEM_CACHE',
      'ChromeDriverw', 'driver-evaluate',
      '__nightmare', '__puppeteer_evaluation_script__',
      '__playwright_evaluation_script__'
    ];
    for (const prop of seleniumProps) {
      try { delete window[prop]; } catch (e) {}
      try { delete document[prop]; } catch (e) {}
    }
  },

  // =========================================================================
  // 7. Web Worker Spoofing
  // =========================================================================
  spoofWorkers(profile, config) {
    if (!profile) return;

    const workerSpoofCode = `
      // Spoof navigator properties in worker context
      const spoofedNav = ${JSON.stringify({
        userAgent: profile.userAgent,
        language: profile.language,
        languages: profile.languages,
        platform: profile.platform,
        hardwareConcurrency: profile.hardwareConcurrency,
        deviceMemory: profile.deviceMemory,
        appVersion: profile.appVersion
      })};
      for (const [key, value] of Object.entries(spoofedNav)) {
        try {
          Object.defineProperty(navigator, key, {
            get: () => value, configurable: true
          });
        } catch(e) {}
      }
    `;

    // Override Worker constructor
    const OriginalWorker = window.Worker;
    if (OriginalWorker) {
      window.Worker = function Worker(scriptURL, options) {
        // For blob URLs, we can inject spoofing code
        if (typeof scriptURL === 'string' && !scriptURL.startsWith('blob:')) {
          // Create a wrapper blob that imports the original and applies spoofing
          const wrapperCode = `${workerSpoofCode}\nimportScripts("${scriptURL}");`;
          const blob = new Blob([wrapperCode], { type: 'application/javascript' });
          const blobURL = URL.createObjectURL(blob);
          const worker = new OriginalWorker(blobURL, options);
          // Cleanup blob URL after worker starts
          setTimeout(() => URL.revokeObjectURL(blobURL), 1000);
          return worker;
        }
        return new OriginalWorker(scriptURL, options);
      };
      window.Worker.prototype = OriginalWorker.prototype;
      this.registerNative(window.Worker, 'Worker');
    }

    // Override SharedWorker constructor
    const OriginalSharedWorker = window.SharedWorker;
    if (OriginalSharedWorker) {
      window.SharedWorker = function SharedWorker(scriptURL, options) {
        return new OriginalSharedWorker(scriptURL, options);
      };
      window.SharedWorker.prototype = OriginalSharedWorker.prototype;
      this.registerNative(window.SharedWorker, 'SharedWorker');
    }
  },

  // =========================================================================
  // 8. Performance Entries Protection
  // =========================================================================
  protectPerformanceEntries() {
    // Filter out extension-related performance entries
    const extensionPattern = /chrome-extension:|moz-extension:|safari-extension:/;

    const originalGetEntries = Performance.prototype.getEntries;
    Performance.prototype.getEntries = function getEntries() {
      const entries = originalGetEntries.call(this);
      return entries.filter(e => !extensionPattern.test(e.name || ''));
    };
    this.registerNative(Performance.prototype.getEntries, 'getEntries');

    const originalGetEntriesByType = Performance.prototype.getEntriesByType;
    Performance.prototype.getEntriesByType = function getEntriesByType(type) {
      const entries = originalGetEntriesByType.call(this, type);
      return entries.filter(e => !extensionPattern.test(e.name || ''));
    };
    this.registerNative(Performance.prototype.getEntriesByType, 'getEntriesByType');

    const originalGetEntriesByName = Performance.prototype.getEntriesByName;
    Performance.prototype.getEntriesByName = function getEntriesByName(name, type) {
      if (extensionPattern.test(name)) return [];
      const entries = originalGetEntriesByName.call(this, name, type);
      return entries.filter(e => !extensionPattern.test(e.name || ''));
    };
    this.registerNative(Performance.prototype.getEntriesByName, 'getEntriesByName');

    // Filter PerformanceObserver
    const OriginalPerfObserver = window.PerformanceObserver;
    if (OriginalPerfObserver) {
      window.PerformanceObserver = function PerformanceObserver(callback) {
        const wrappedCallback = (list, observer) => {
          const filteredEntries = list.getEntries().filter(
            e => !extensionPattern.test(e.name || '')
          );
          if (filteredEntries.length > 0) {
            callback(
              { getEntries: () => filteredEntries, getEntriesByType: (t) => filteredEntries.filter(e => e.entryType === t), getEntriesByName: (n) => filteredEntries.filter(e => e.name === n) },
              observer
            );
          }
        };
        return new OriginalPerfObserver(wrappedCallback);
      };
      window.PerformanceObserver.prototype = OriginalPerfObserver.prototype;
      window.PerformanceObserver.supportedEntryTypes = OriginalPerfObserver.supportedEntryTypes;
      AntiDetection.registerNative(window.PerformanceObserver, 'PerformanceObserver');
    }
  }
};

// Export
if (typeof globalThis !== 'undefined') globalThis.AntiDetection = AntiDetection;
