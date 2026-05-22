// PhantomPrint Navigator Spoofing Module
// Overrides all navigator properties with consistent spoofed values
const NavigatorSpoof = (() => {
  'use strict';

  function apply(profile, config) {
    if (!config.enabled) return;

    const nativeToString = Function.prototype.toString;
    const nativeCode = 'function %s() { [native code] }';

    // Helper to make overridden functions look native
    function makeNative(fn, name) {
      const descriptor = { value: function() { return nativeCode.replace('%s', name || fn.name || ''); }, writable: false, configurable: true };
      Object.defineProperty(fn, 'toString', descriptor);
      Object.defineProperty(fn, 'toLocaleString', descriptor);
      return fn;
    }

    // Helper to define a non-configurable property matching original descriptors
    function defineProperty(obj, prop, value, opts = {}) {
      try {
        const original = Object.getOwnPropertyDescriptor(obj, prop) ||
          Object.getOwnPropertyDescriptor(Object.getPrototypeOf(obj), prop);
        const desc = {
          get: makeNative(function() { return value; }, `get ${prop}`),
          set: undefined,
          enumerable: opts.enumerable !== undefined ? opts.enumerable : (original ? original.enumerable : true),
          configurable: opts.configurable !== undefined ? opts.configurable : false
        };
        Object.defineProperty(obj, prop, desc);
      } catch (e) {
        // Fallback: try direct property override via Proxy on prototype
      }
    }

    // Override navigator properties
    const nav = navigator;
    const navProto = Object.getPrototypeOf(nav);

    // userAgent
    defineProperty(navProto, 'userAgent', profile.userAgent);
    defineProperty(navProto, 'appName', profile.appName);
    defineProperty(navProto, 'appVersion', profile.appVersion);
    defineProperty(navProto, 'vendor', profile.vendor);
    defineProperty(navProto, 'vendorSub', profile.vendorSub);
    defineProperty(navProto, 'product', profile.product);
    defineProperty(navProto, 'productSub', profile.productSub);
    defineProperty(navProto, 'platform', profile.platform);
    defineProperty(navProto, 'language', profile.language);
    defineProperty(navProto, 'languages', Object.freeze([...profile.languages]));
    defineProperty(navProto, 'hardwareConcurrency', profile.hardwareConcurrency);
    defineProperty(navProto, 'deviceMemory', profile.deviceMemory);
    defineProperty(navProto, 'maxTouchPoints', profile.maxTouchPoints);
    defineProperty(navProto, 'cookieEnabled', true);
    defineProperty(navProto, 'pdfViewerEnabled', profile.pdfViewerEnabled);
    defineProperty(navProto, 'doNotTrack', profile.doNotTrack);

    // BuildID for Firefox spoofing
    if (profile.buildID !== undefined) {
      defineProperty(navProto, 'buildID', profile.buildID);
    } else {
      // If spoofing Chrome, make sure buildID is undefined
      try {
        Object.defineProperty(navProto, 'buildID', { get: undefined, set: undefined, configurable: false });
      } catch(e) {}
    }

    // javaEnabled() - always returns false
    const origJavaEnabled = navProto.javaEnabled;
    navProto.javaEnabled = makeNative(function javaEnabled() { return false; }, 'javaEnabled');

    // navigator.connection (NetworkInformation)
    if (config.categories && config.categories.network !== false) {
      if (profile.connection) {
        const connProps = {
          effectiveType: profile.connection.effectiveType,
          downlink: profile.connection.downlink,
          rtt: profile.connection.rtt,
          saveData: profile.connection.saveData,
          type: 'wifi',
          onchange: null
        };
        const fakeConn = {};
        Object.keys(connProps).forEach(key => {
          Object.defineProperty(fakeConn, key, { value: connProps[key], writable: false, enumerable: true, configurable: false });
        });
        Object.setPrototypeOf(fakeConn, NetworkInformation ? NetworkInformation.prototype : Object.prototype);
        defineProperty(navProto, 'connection', fakeConn);
      }
    }

    // navigator.getBattery()
    if (config.categories && config.categories.hardware !== false) {
      const batteryData = profile.battery;
      const fakeBattery = {
        charging: batteryData.charging,
        chargingTime: batteryData.chargingTime,
        dischargingTime: batteryData.dischargingTime,
        level: batteryData.level,
        addEventListener: makeNative(function addEventListener() {}, 'addEventListener'),
        removeEventListener: makeNative(function removeEventListener() {}, 'removeEventListener'),
        dispatchEvent: makeNative(function dispatchEvent() { return true; }, 'dispatchEvent'),
        onchargingchange: null,
        onchargingtimechange: null,
        ondischargingtimechange: null,
        onlevelchange: null
      };
      navProto.getBattery = makeNative(function getBattery() {
        return Promise.resolve(fakeBattery);
      }, 'getBattery');
    }

    // navigator.getGamepads()
    navProto.getGamepads = makeNative(function getGamepads() {
      return [];
    }, 'getGamepads');

    // Block hardware APIs
    if (config.categories && config.categories.hardware !== false) {
      try { delete navProto.bluetooth; } catch(e) {}
      try { delete navProto.usb; } catch(e) {}
      try { delete navProto.hid; } catch(e) {}
      try { delete navProto.serial; } catch(e) {}
      Object.defineProperty(navProto, 'bluetooth', { get: function() { return undefined; }, configurable: false, enumerable: false });
      Object.defineProperty(navProto, 'usb', { get: function() { return undefined; }, configurable: false, enumerable: false });
      Object.defineProperty(navProto, 'hid', { get: function() { return undefined; }, configurable: false, enumerable: false });
      Object.defineProperty(navProto, 'serial', { get: function() { return undefined; }, configurable: false, enumerable: false });
    }

    // Touch support
    if (!profile.touchEnabled) {
      // Ensure ontouchstart is not present on window for desktop
      try {
        Object.defineProperty(window, 'ontouchstart', { get: function() { return undefined; }, set: function() {}, configurable: false, enumerable: false });
      } catch(e) {}
    } else {
      Object.defineProperty(window, 'ontouchstart', { value: null, writable: true, configurable: false, enumerable: true });
    }

    // navigator.plugins and mimeTypes
    if (config.categories && config.categories.plugins !== false) {
      spoofPlugins(profile, makeNative);
    }

    // navigator.storage.estimate()
    if (config.categories && config.categories.storage !== false) {
      if (navigator.storage && navigator.storage.estimate) {
        const origEstimate = navigator.storage.estimate.bind(navigator.storage);
        navigator.storage.estimate = makeNative(function estimate() {
          return Promise.resolve({
            quota: profile.storageQuota,
            usage: profile.storageUsage
          });
        }, 'estimate');
      }
    }

    // navigator.mediaDevices.enumerateDevices()
    if (config.categories && config.categories.webrtc !== false) {
      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        navigator.mediaDevices.enumerateDevices = makeNative(function enumerateDevices() {
          return Promise.resolve(profile.mediaDevices.map(d => ({
            deviceId: d.deviceId,
            kind: d.kind,
            label: d.label,
            groupId: d.groupId,
            toJSON() { return { deviceId: this.deviceId, kind: this.kind, label: this.label, groupId: this.groupId }; }
          })));
        }, 'enumerateDevices');
      }
    }

    // navigator.permissions.query() - return consistent results
    if (config.categories && config.categories.privacy !== false) {
      if (navigator.permissions && navigator.permissions.query) {
        const origQuery = navigator.permissions.query.bind(navigator.permissions);
        navigator.permissions.query = makeNative(function query(desc) {
          const permState = { name: desc.name, state: 'prompt', onchange: null };
          const knownPrompt = ['notifications', 'push', 'midi', 'camera', 'microphone', 'geolocation', 'clipboard-read', 'clipboard-write'];
          if (knownPrompt.includes(desc.name)) {
            permState.state = 'prompt';
          }
          return Promise.resolve(permState);
        }, 'query');
      }
    }

    // Override window.history.length
    Object.defineProperty(window.history, 'length', {
      get: makeNative(function() { return profile.historyLength; }, 'get length'),
      configurable: false,
      enumerable: true
    });

    // Geolocation spoofing
    if (config.categories && config.categories.location !== false) {
      spoofGeolocation(profile, makeNative);
    }
  }

  function spoofPlugins(profile, makeNative) {
    const pluginData = profile.plugins;
    const mimeData = [];
    pluginData.forEach(p => {
      if (p.mimeTypes) {
        p.mimeTypes.forEach(m => mimeData.push({ ...m, enabledPlugin: p }));
      }
    });

    // Create fake PluginArray
    const fakePlugins = {
      length: pluginData.length,
      item: makeNative(function item(i) { return pluginData[i] || null; }, 'item'),
      namedItem: makeNative(function namedItem(name) { return pluginData.find(p => p.name === name) || null; }, 'namedItem'),
      refresh: makeNative(function refresh() {}, 'refresh'),
      [Symbol.iterator]: function*() { for (let i = 0; i < pluginData.length; i++) yield pluginData[i]; }
    };
    for (let i = 0; i < pluginData.length; i++) {
      fakePlugins[i] = pluginData[i];
    }
    Object.defineProperty(Object.getPrototypeOf(navigator), 'plugins', {
      get: makeNative(function() { return fakePlugins; }, 'get plugins'),
      configurable: false, enumerable: true
    });

    // Create fake MimeTypeArray
    const fakeMimes = {
      length: mimeData.length,
      item: makeNative(function item(i) { return mimeData[i] || null; }, 'item'),
      namedItem: makeNative(function namedItem(type) { return mimeData.find(m => m.type === type) || null; }, 'namedItem'),
      [Symbol.iterator]: function*() { for (let i = 0; i < mimeData.length; i++) yield mimeData[i]; }
    };
    for (let i = 0; i < mimeData.length; i++) {
      fakeMimes[i] = mimeData[i];
    }
    Object.defineProperty(Object.getPrototypeOf(navigator), 'mimeTypes', {
      get: makeNative(function() { return fakeMimes; }, 'get mimeTypes'),
      configurable: false, enumerable: true
    });
  }

  function spoofGeolocation(profile, makeNative) {
    // Block geolocation by default (return PERMISSION_DENIED)
    const geo = navigator.geolocation;
    if (!geo) return;

    geo.getCurrentPosition = makeNative(function getCurrentPosition(success, error, options) {
      if (error) {
        setTimeout(() => {
          error({ code: 1, message: 'User denied Geolocation', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
        }, 100);
      }
    }, 'getCurrentPosition');

    geo.watchPosition = makeNative(function watchPosition(success, error, options) {
      if (error) {
        setTimeout(() => {
          error({ code: 1, message: 'User denied Geolocation', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
        }, 100);
      }
      return 0;
    }, 'watchPosition');

    geo.clearWatch = makeNative(function clearWatch() {}, 'clearWatch');
  }

  return { apply };
})();
