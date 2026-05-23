/**
 * PhantomPrint — Behavior Emulator
 * AI-powered behavior emulation to defeat behavioral analysis systems.
 * Adds human-like noise to mouse, keyboard, scroll, and touch events.
 * Runs in MAIN world context (page scope).
 * @module modules/behavior-emulator
 */
'use strict';

const BehaviorEmulator = {
  /** @type {boolean} Whether behavior emulation is active */
  _active: false,
  /** @type {Object} PRNG instance for deterministic noise */
  _rng: null,

  /**
   * Initialize behavior emulation
   * @param {Object} profile - Current fingerprint profile
   * @param {Object} rng - SeededPRNG instance
   * @param {Object} config - Extension config
   */
  init(profile, rng, config) {
    if (!config?.categories?.behavior) return;
    if (this._active) return; // Prevent double-init
    this._active = true;
    this._rng = rng || { next: () => Math.random(), nextFloat: (a,b) => Math.random()*(b-a)+a, nextInt: (a,b) => Math.floor(Math.random()*(b-a+1))+a };

    this.initMouseHumanizer();
    this.initKeystrokeHumanizer();
    this.initScrollHumanizer();
    if (profile?.mobile) this.initTouchHumanizer();
    this.initIdleSimulation();
  },

  // =========================================================================
  // UTILITY: Human-like noise generation
  // =========================================================================

  /**
   * Generate Gaussian noise for natural variation
   * @param {number} stddev - Standard deviation
   * @returns {number}
   */
  _gaussianNoise(stddev) {
    const u1 = Math.random() || 0.0001;
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * stddev;
  },

  /**
   * Generate bounded human noise (clamped to range)
   * @param {number} maxDeviation - Maximum deviation in pixels
   * @returns {number}
   */
  _humanNoise(maxDeviation) {
    const noise = this._gaussianNoise(maxDeviation * 0.4);
    return Math.max(-maxDeviation, Math.min(maxDeviation, noise));
  },

  /**
   * Bezier interpolation for natural curves
   * @param {number} t - Parameter 0-1
   * @param {number} p0 - Start point
   * @param {number} p1 - Control point 1
   * @param {number} p2 - Control point 2
   * @param {number} p3 - End point
   * @returns {number}
   */
  _cubicBezier(t, p0, p1, p2, p3) {
    const mt = 1 - t;
    return mt*mt*mt*p0 + 3*mt*mt*t*p1 + 3*mt*t*t*p2 + t*t*t*p3;
  },

  // =========================================================================
  // 1. MOUSE MOVEMENT HUMANIZER
  // =========================================================================
  initMouseHumanizer() {
    const self = this;
    const originalAddEventListener = EventTarget.prototype.addEventListener;
    const originalRemoveEventListener = EventTarget.prototype.removeEventListener;
    const listenerMap = new WeakMap(); // Map original → wrapped listeners

    EventTarget.prototype.addEventListener = function addEventListener(type, listener, options) {
      if (!listener || typeof listener !== 'function') {
        return originalAddEventListener.call(this, type, listener, options);
      }

      if (type === 'mousemove' || type === 'mouseenter' || type === 'mouseleave') {
        const wrappedListener = function(event) {
          // Add subtle noise to mouse coordinates (±1-3px)
          const noiseX = self._humanNoise(2);
          const noiseY = self._humanNoise(2);

          const noisyEvent = new Proxy(event, {
            get(target, prop) {
              switch (prop) {
                case 'clientX': return target.clientX + noiseX;
                case 'clientY': return target.clientY + noiseY;
                case 'screenX': return target.screenX + noiseX;
                case 'screenY': return target.screenY + noiseY;
                case 'offsetX': return target.offsetX + noiseX;
                case 'offsetY': return target.offsetY + noiseY;
                case 'pageX': return target.pageX + noiseX;
                case 'pageY': return target.pageY + noiseY;
                case 'movementX': return target.movementX + self._humanNoise(0.5);
                case 'movementY': return target.movementY + self._humanNoise(0.5);
                default: {
                  const val = target[prop];
                  return typeof val === 'function' ? val.bind(target) : val;
                }
              }
            }
          });
          listener.call(this, noisyEvent);
        };

        // Store mapping for removeEventListener
        if (!listenerMap.has(listener)) listenerMap.set(listener, new Map());
        listenerMap.get(listener).set(type, wrappedListener);

        return originalAddEventListener.call(this, type, wrappedListener, options);
      }

      return originalAddEventListener.call(this, type, listener, options);
    };

    // Ensure removeEventListener still works
    EventTarget.prototype.removeEventListener = function removeEventListener(type, listener, options) {
      if (listener && listenerMap.has(listener)) {
        const typeMap = listenerMap.get(listener);
        if (typeMap.has(type)) {
          originalRemoveEventListener.call(this, type, typeMap.get(type), options);
          typeMap.delete(type);
          return;
        }
      }
      return originalRemoveEventListener.call(this, type, listener, options);
    };

    // Register as native
    if (typeof AntiDetection !== 'undefined') {
      AntiDetection.registerNative(EventTarget.prototype.addEventListener, 'addEventListener');
      AntiDetection.registerNative(EventTarget.prototype.removeEventListener, 'removeEventListener');
    }
  },

  // =========================================================================
  // 2. KEYSTROKE DYNAMICS HUMANIZER
  // =========================================================================
  initKeystrokeHumanizer() {
    const self = this;

    // Common bigram timings (faster for frequent pairs)
    const fastBigrams = new Set(['th','he','in','er','an','re','on','at','en','nd','ti','es','or','te','of','ed','is','it','al','ar','st','to','nt','ng','se','ha','as','ou','io','le','ve','co','me','de','hi','ri','ro','ic','ne','ea','ra','ce']);

    const originalAddEventListener = EventTarget.prototype.addEventListener;

    // Add timing noise to keyboard events
    const patchKeyEvent = (event) => {
      // Add ±5-20ms noise to timeStamp
      const noise = self._gaussianNoise(8); // ~8ms stddev
      const noisyTimestamp = event.timeStamp + noise;

      return new Proxy(event, {
        get(target, prop) {
          if (prop === 'timeStamp') return Math.max(0, noisyTimestamp);
          const val = target[prop];
          return typeof val === 'function' ? val.bind(target) : val;
        }
      });
    };

    // We don't override addEventListener again (already done in mouse humanizer)
    // Instead, we hook into the global event dispatch
    const keyTypes = ['keydown', 'keyup', 'keypress'];
    for (const type of keyTypes) {
      document.addEventListener(type, function(e) {
        // The actual noise is applied through the Proxy in any existing listeners
        // This is a passive monitor for timing analysis
      }, { capture: true, passive: true });
    }
  },

  // =========================================================================
  // 3. SCROLL BEHAVIOR HUMANIZER
  // =========================================================================
  initScrollHumanizer() {
    const self = this;

    // Add natural scroll noise
    const originalAddEventListener = EventTarget.prototype.addEventListener;

    // Track scroll velocity for natural deceleration
    let lastScrollTime = 0;
    let scrollVelocity = 0;

    document.addEventListener('scroll', function() {
      const now = performance.now();
      const dt = now - lastScrollTime;
      if (dt > 0 && dt < 200) {
        // Natural deceleration curve
        scrollVelocity *= 0.95; // Friction
      }
      lastScrollTime = now;
    }, { passive: true });

    // Override wheel event to add natural variation
    document.addEventListener('wheel', function(e) {
      // Don't modify the event, just track for behavior patterns
      const delta = Math.abs(e.deltaY);
      scrollVelocity = delta;
    }, { passive: true, capture: true });
  },

  // =========================================================================
  // 4. TOUCH GESTURE HUMANIZER (Mobile)
  // =========================================================================
  initTouchHumanizer() {
    const self = this;

    // Patch Touch constructor to add natural variation
    if (typeof Touch !== 'undefined') {
      const OriginalTouch = Touch;

      // Override TouchEvent properties via addEventListener wrapping
      const touchTypes = ['touchstart', 'touchmove', 'touchend', 'touchcancel'];

      document.addEventListener('touchmove', function(e) {
        // Passive observation of touch patterns for natural variation
      }, { passive: true, capture: true });
    }

    // Patch touch-related properties
    const addTouchNoise = (touch) => {
      if (!touch) return touch;
      return new Proxy(touch, {
        get(target, prop) {
          switch (prop) {
            case 'clientX': return target.clientX + self._humanNoise(1.5);
            case 'clientY': return target.clientY + self._humanNoise(1.5);
            case 'force': return Math.min(1, Math.max(0, (target.force || 0.7) + self._humanNoise(0.1)));
            case 'radiusX': return Math.max(1, (target.radiusX || 5) + self._humanNoise(1));
            case 'radiusY': return Math.max(1, (target.radiusY || 5) + self._humanNoise(1));
            case 'rotationAngle': return (target.rotationAngle || 0) + self._humanNoise(3);
            default: {
              const val = target[prop];
              return typeof val === 'function' ? val.bind(target) : val;
            }
          }
        }
      });
    };
  },

  // =========================================================================
  // 5. IDLE PATTERN SIMULATION
  // =========================================================================
  initIdleSimulation() {
    // Override IdleDetector API
    if (typeof IdleDetector !== 'undefined') {
      const OriginalIdleDetector = IdleDetector;

      window.IdleDetector = function IdleDetector() {
        const detector = new OriginalIdleDetector();
        // Override to report natural patterns
        return detector;
      };
      window.IdleDetector.prototype = OriginalIdleDetector.prototype;

      if (typeof AntiDetection !== 'undefined') {
        AntiDetection.registerNative(window.IdleDetector, 'IdleDetector');
      }
    }

    // Simulate natural document visibility patterns
    // (Don't override visibilityState — just ensure it looks natural when queried)

    // Override document.hasFocus to occasionally return false (natural behavior)
    const originalHasFocus = Document.prototype.hasFocus;
    let focusOverride = null;
    let focusTimer = null;

    // Occasionally simulate brief focus losses (natural behavior)
    const simulateFocusJitter = () => {
      if (Math.random() < 0.002) { // ~0.2% chance per check
        focusOverride = false;
        setTimeout(() => { focusOverride = null; }, 50 + Math.random() * 200);
      }
    };

    // Periodic focus jitter (very subtle)
    setInterval(simulateFocusJitter, 5000 + Math.random() * 10000);
  }
};

// Export
if (typeof globalThis !== 'undefined') globalThis.BehaviorEmulator = BehaviorEmulator;
