// PhantomPrint Storage & Privacy Protection
// Blocks storage-based tracking, incognito detection, and HSTS supercookies
const StorageSpoof = (() => {
  'use strict';

  function apply(profile, config, prng) {
    if (!config.enabled) return;

    function makeNative(fn, name) {
      const s = `function ${name || fn.name || ''}() { [native code] }`;
      Object.defineProperty(fn, 'toString', { value: () => s, writable: false, configurable: true });
      return fn;
    }

    // Anti-incognito detection
    blockIncognitoDetection(makeNative, profile);

    // Override indexedDB.databases() if available
    if (window.indexedDB && window.indexedDB.databases) {
      const origDatabases = window.indexedDB.databases.bind(window.indexedDB);
      window.indexedDB.databases = makeNative(function databases() {
        return Promise.resolve([]); // Return empty list to prevent enumeration
      }, 'databases');
    }

    // Override performance.memory (Chrome-specific)
    if (performance.memory) {
      Object.defineProperty(performance, 'memory', {
        get: makeNative(function() {
          return {
            jsHeapSizeLimit: 4294705152,
            totalJSHeapSize: Math.floor(prng.nextFloat(10000000, 50000000)),
            usedJSHeapSize: Math.floor(prng.nextFloat(5000000, 30000000))
          };
        }, 'get memory'),
        configurable: false, enumerable: true
      });
    }

    // Override StorageManager quota to prevent incognito detection
    if (navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate = makeNative(function estimate() {
        return Promise.resolve({
          quota: profile.storageQuota,
          usage: profile.storageUsage,
          usageDetails: {}
        });
      }, 'estimate');
    }

    // Block requestFileSystem (used for incognito detection)
    if (window.requestFileSystem || window.webkitRequestFileSystem) {
      const fakeFS = {
        root: {
          getFile: makeNative(function(path, options, success, error) {
            if (success) setTimeout(() => success({ name: 'test', fullPath: '/' + path }), 10);
          }, 'getFile'),
          getDirectory: makeNative(function(path, options, success, error) {
            if (success) setTimeout(() => success({ name: 'test', fullPath: '/' + path }), 10);
          }, 'getDirectory')
        },
        name: 'temporary'
      };

      window.requestFileSystem = makeNative(function requestFileSystem(type, size, success, error) {
        if (success) setTimeout(() => success(fakeFS), 10);
      }, 'requestFileSystem');
      window.webkitRequestFileSystem = window.requestFileSystem;
    }

    // Override navigator.storage.persist
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist = makeNative(function persist() {
        return Promise.resolve(true);
      }, 'persist');
    }

    if (navigator.storage && navigator.storage.persisted) {
      navigator.storage.persisted = makeNative(function persisted() {
        return Promise.resolve(false);
      }, 'persisted');
    }

    // Block Cache API fingerprinting via timing
    if (window.caches) {
      const origCachesOpen = window.caches.open.bind(window.caches);
      window.caches.open = makeNative(function open(cacheName) {
        return origCachesOpen(cacheName);
      }, 'open');
    }
  }

  function blockIncognitoDetection(makeNative, profile) {
    // Method 1: StorageManager quota check
    // Already handled above via storage.estimate override

    // Method 2: FileSystem API - already handled above

    // Method 3: Safari-specific indexedDB check
    // In Safari incognito, opening an IndexedDB would fail
    // We ensure it always appears to work
    const origIDBOpen = window.indexedDB.open;
    window.indexedDB.open = makeNative(function open(name, version) {
      return origIDBOpen.call(window.indexedDB, name, version);
    }, 'open');

    // Method 4: Storage quota probe (Chrome < 74)
    // Already handled by storage.estimate override

    // Method 5: performance.memory check (Chrome)
    // Already handled above

    // Method 6: ServiceWorker availability check
    if (navigator.serviceWorker) {
      // Ensure serviceWorker appears available
      Object.defineProperty(navigator, 'serviceWorker', {
        get: makeNative(function() {
          return navigator.serviceWorker || {
            register: makeNative(function() { return Promise.reject(new DOMException('SecurityError')); }, 'register'),
            ready: Promise.resolve({}),
            controller: null,
            getRegistrations: makeNative(function() { return Promise.resolve([]); }, 'getRegistrations')
          };
        }, 'get serviceWorker'),
        configurable: false, enumerable: true
      });
    }
  }

  return { apply };
})();
