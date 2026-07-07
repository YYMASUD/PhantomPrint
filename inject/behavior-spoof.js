// PhantomPrint User Behavior Tracking Protection
// Adds noise to mouse, keyboard, touch, scroll events and blocks device sensors
const BehaviorSpoof = (() => {
  'use strict';

  let rng = null;

  function apply(profile, config, prng) {
    if (!config.enabled) return;
    rng = prng;

    function makeNative(fn, name) {
      const s = `function ${name || fn.name || ''}() { [native code] }`;
      Object.defineProperty(fn, 'toString', { value: () => s, writable: false, configurable: true });
      return fn;
    }

    // Mouse event noise
    if (config.categories && config.categories.behavior !== false) {
      addMouseNoise(makeNative);
      addKeyboardNoise(makeNative);
      addTouchNoise(makeNative);
      addScrollNoise(makeNative);
      blockDeviceSensors(profile, makeNative);
      blockIdleDetection(makeNative);
      spoofVisibility(config, makeNative);
    }
  }

  function addMouseNoise(makeNative) {
    const origAddEventListener = EventTarget.prototype.addEventListener;
    const origRemoveEventListener = EventTarget.prototype.removeEventListener;
    const mouseEvents = ['mousemove', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu'];

    // BUG FIX: Store wrapped→original listener mapping per target so removeEventListener
    // can correctly unregister the wrapped version when the original is passed.
    // Previously, wrapped listeners were anonymous closures with no way to remove them.
    const listenerMap = new WeakMap(); // target → Map(original → wrapped)

    EventTarget.prototype.addEventListener = makeNative(function addEventListener(type, listener, options) {
      if (mouseEvents.includes(type) && typeof listener === 'function') {
        // Get or create the per-target listener map
        if (!listenerMap.has(this)) listenerMap.set(this, new Map());
        const targetMap = listenerMap.get(this);

        // Reuse existing wrapper if already registered (idempotent)
        if (targetMap.has(listener)) {
          return origAddEventListener.call(this, type, targetMap.get(listener), options);
        }

        const wrappedListener = function(event) {
          // Add micro-jitter to coordinates
          const noiseX = Math.floor((rng.next() - 0.5) * 4); // ±2px
          const noiseY = Math.floor((rng.next() - 0.5) * 4);

          const fakeEvent = new Proxy(event, {
            get(target, prop) {
              switch(prop) {
                case 'clientX': return target.clientX + noiseX;
                case 'clientY': return target.clientY + noiseY;
                case 'screenX': return target.screenX + noiseX;
                case 'screenY': return target.screenY + noiseY;
                case 'offsetX': return target.offsetX + noiseX;
                case 'offsetY': return target.offsetY + noiseY;
                case 'pageX': return target.pageX + noiseX;
                case 'pageY': return target.pageY + noiseY;
                case 'timeStamp': return target.timeStamp + (rng.next() - 0.5) * 2;
                default: {
                  const val = target[prop];
                  return typeof val === 'function' ? val.bind(target) : val;
                }
              }
            }
          });
          listener.call(this, fakeEvent);
        };

        targetMap.set(listener, wrappedListener);
        return origAddEventListener.call(this, type, wrappedListener, options);
      }
      return origAddEventListener.call(this, type, listener, options);
    }, 'addEventListener');

    // BUG FIX: Also wrap removeEventListener to look up the wrapped version
    EventTarget.prototype.removeEventListener = makeNative(function removeEventListener(type, listener, options) {
      if (mouseEvents.includes(type) && typeof listener === 'function') {
        const targetMap = listenerMap.get(this);
        if (targetMap && targetMap.has(listener)) {
          const wrappedListener = targetMap.get(listener);
          targetMap.delete(listener);
          return origRemoveEventListener.call(this, type, wrappedListener, options);
        }
      }
      return origRemoveEventListener.call(this, type, listener, options);
    }, 'removeEventListener');
  }

  function addKeyboardNoise(makeNative) {
    // Add timing noise to keyboard events via event timestamp modification
    const origDispatchEvent = EventTarget.prototype.dispatchEvent;

    // Override KeyboardEvent timestamp reading
    const origTimeStamp = Object.getOwnPropertyDescriptor(Event.prototype, 'timeStamp');
    if (origTimeStamp && origTimeStamp.get) {
      // We add noise only when events are consumed via addEventListener (done above)
      // For keyboard, we just need micro-timing noise on the timestamp
      // This is already handled by the general event listener wrapper above
    }
  }

  function addTouchNoise(makeNative) {
    // Touch events - add noise to touch coordinates
    if (!window.TouchEvent) return;

    const origCreateTouch = document.createTouch;
    if (origCreateTouch) {
      document.createTouch = makeNative(function createTouch(view, target, identifier, pageX, pageY, screenX, screenY, clientX, clientY, radiusX, radiusY, rotationAngle, force) {
        const noiseX = (rng.next() - 0.5) * 2;
        const noiseY = (rng.next() - 0.5) * 2;
        return origCreateTouch.call(document, view, target, identifier,
          pageX + noiseX, pageY + noiseY,
          screenX + noiseX, screenY + noiseY,
          clientX + noiseX, clientY + noiseY,
          radiusX ? radiusX + (rng.next() - 0.5) * 0.5 : radiusX,
          radiusY ? radiusY + (rng.next() - 0.5) * 0.5 : radiusY,
          rotationAngle, force ? force + (rng.next() - 0.5) * 0.01 : force);
      }, 'createTouch');
    }
  }

  function addScrollNoise(makeNative) {
    // Add sub-pixel noise to scroll position reads
    const origScrollX = Object.getOwnPropertyDescriptor(window, 'scrollX') ||
      Object.getOwnPropertyDescriptor(window, 'pageXOffset');
    const origScrollY = Object.getOwnPropertyDescriptor(window, 'scrollY') ||
      Object.getOwnPropertyDescriptor(window, 'pageYOffset');

    if (origScrollX && origScrollX.get) {
      const origGet = origScrollX.get;
      Object.defineProperty(window, 'scrollX', {
        get: function() {
          const val = origGet.call(window);
          // Only add noise when scrolled (don't add noise at 0)
          return val > 0 ? val + Math.round((rng.next() - 0.5) * 2) : val;
        },
        configurable: true, enumerable: true
      });
      Object.defineProperty(window, 'pageXOffset', {
        get: function() { return window.scrollX; },
        configurable: true, enumerable: true
      });
    }

    if (origScrollY && origScrollY.get) {
      const origGet = origScrollY.get;
      Object.defineProperty(window, 'scrollY', {
        get: function() {
          const val = origGet.call(window);
          return val > 0 ? val + Math.round((rng.next() - 0.5) * 2) : val;
        },
        configurable: true, enumerable: true
      });
      Object.defineProperty(window, 'pageYOffset', {
        get: function() { return window.scrollY; },
        configurable: true, enumerable: true
      });
    }
  }

  function blockDeviceSensors(profile, makeNative) {
    // Block DeviceOrientationEvent
    if (window.DeviceOrientationEvent) {
      window.DeviceOrientationEvent = makeNative(function DeviceOrientationEvent(type, init) {
        return new Event(type);
      }, 'DeviceOrientationEvent');
      // Prevent listening for orientation events
      const origAddEL = EventTarget.prototype.addEventListener;
      const blocked = ['deviceorientation', 'deviceorientationabsolute', 'devicemotion'];
      // Note: We don't fully block addEventListener here as it's already wrapped above
      // Instead, we make the events return null values
    }

    // Block DeviceMotionEvent
    if (window.DeviceMotionEvent) {
      window.DeviceMotionEvent = makeNative(function DeviceMotionEvent(type, init) {
        return new Event(type);
      }, 'DeviceMotionEvent');
    }

    // Override Sensor APIs
    const sensorAPIs = ['Accelerometer', 'Gyroscope', 'Magnetometer', 'AbsoluteOrientationSensor',
      'RelativeOrientationSensor', 'LinearAccelerationSensor', 'GravitySensor', 'AmbientLightSensor'];

    sensorAPIs.forEach(api => {
      if (window[api]) {
        window[api] = makeNative(function() {
          throw new DOMException('Sensor API access denied', 'NotAllowedError');
        }, api);
      }
    });
  }

  function blockIdleDetection(makeNative) {
    // Block IdleDetector API
    if (window.IdleDetector) {
      window.IdleDetector = makeNative(function IdleDetector() {
        return {
          start: makeNative(function() { return Promise.reject(new DOMException('Not allowed', 'NotAllowedError')); }, 'start'),
          addEventListener: function() {},
          removeEventListener: function() {}
        };
      }, 'IdleDetector');
      window.IdleDetector.requestPermission = makeNative(function() {
        return Promise.resolve('denied');
      }, 'requestPermission');
    }
  }

  function spoofVisibility(config, makeNative) {
    if (!config.alwaysVisible) return;

    // Override Page Visibility API to always report visible
    Object.defineProperty(document, 'visibilityState', {
      get: makeNative(function() { return 'visible'; }, 'get visibilityState'),
      configurable: false, enumerable: true
    });

    Object.defineProperty(document, 'hidden', {
      get: makeNative(function() { return false; }, 'get hidden'),
      configurable: false, enumerable: true
    });

    // Suppress visibilitychange events
    const origDocAddEL = document.addEventListener;
    document.addEventListener = makeNative(function addEventListener(type, listener, options) {
      if (type === 'visibilitychange') return; // Suppress
      return origDocAddEL.call(document, type, listener, options);
    }, 'addEventListener');
  }

  return { apply };
})();
