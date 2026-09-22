// PhantomPrint Timing & Performance Fingerprinting Protection
// Reduces precision of timing APIs and adds noise to prevent timing-based fingerprinting
const TimingSpoof = (() => {
  'use strict';

  let rng = null;
  let timeOffset = 0;

  function apply(profile, config, prng) {
    if (!config.enabled) return;
    rng = prng;
    // BUG FIX: prng has no nextFloat() method. Use next() arithmetic instead.
    timeOffset = (prng.next() - 0.5) * 10; // Small random offset ±5ms for timeOrigin

    function makeNative(fn, name) {
      const s = `function ${name || fn.name || ''}() { [native code] }`;
      Object.defineProperty(fn, 'toString', { value: () => s, writable: false, configurable: true });
      return fn;
    }

    // Override Performance.prototype.now — single authoritative override.
    // Must be on the PROTOTYPE (not the instance) so all Performance objects
    // share the same monotonic counter. Using an instance override alongside a
    // prototype override creates two separate counters which can go non-monotonic,
    // a specific signal that CreepJS and PixelScan test for.
    let lastNow = 0;
    const origPerfNow = Performance.prototype.now;
    Performance.prototype.now = makeNative(function now() {
      const real = origPerfNow.call(this);
      // Round to 100 microsecond precision + tiny noise (same as Firefox RFP)
      const rounded = Math.round(real * 10) / 10;
      const noise = (rng.next() - 0.5) * 0.1;
      let result = rounded + noise;
      // Ensure monotonically increasing — never go backward
      if (result <= lastNow) result = lastNow + 0.001;
      lastNow = result;
      return result;
    }, 'now');

    // Override performance.timeOrigin
    const origTimeOrigin = performance.timeOrigin;
    Object.defineProperty(performance, 'timeOrigin', {
      get: makeNative(function() { return origTimeOrigin + timeOffset; }, 'get timeOrigin'),
      configurable: false, enumerable: true
    });

    // Override Date.now() - round to nearest 10ms
    const origDateNow = Date.now;
    Date.now = makeNative(function now() {
      const t = origDateNow.call(Date);
      return Math.round(t / 10) * 10;
    }, 'now');

    // Override performance.getEntriesByType to add noise to timing entries
    const origGetEntries = performance.getEntriesByType.bind(performance);
    performance.getEntriesByType = makeNative(function getEntriesByType(type) {
      const entries = origGetEntries(type);
      if (type === 'navigation' || type === 'resource') {
        return entries.map(entry => addNoiseToTimingEntry(entry));
      }
      return entries;
    }, 'getEntriesByType');

    // Override performance.getEntries
    const origGetAllEntries = performance.getEntries.bind(performance);
    performance.getEntries = makeNative(function getEntries() {
      const entries = origGetAllEntries();
      return entries.map(entry => {
        if (entry.entryType === 'navigation' || entry.entryType === 'resource') {
          return addNoiseToTimingEntry(entry);
        }
        return entry;
      });
    }, 'getEntries');

    // Override performance.getEntriesByName
    const origGetByName = performance.getEntriesByName.bind(performance);
    performance.getEntriesByName = makeNative(function getEntriesByName(name, type) {
      const entries = origGetByName(name, type);
      return entries.map(entry => {
        if (entry.entryType === 'navigation' || entry.entryType === 'resource') {
          return addNoiseToTimingEntry(entry);
        }
        return entry;
      });
    }, 'getEntriesByName');

    // Timezone spoofing - Override Date methods
    spoofTimezone(profile, makeNative);

    // Override Intl.DateTimeFormat
    spoofIntl(profile, makeNative);
  }

  function addNoiseToTimingEntry(entry) {
    // Create a proxy that adds small noise to all timing values
    // BUG FIX: rng has no nextFloat(). Use next() arithmetic.
    const noise = (rng.next() - 0.5) * 4; // ±2ms noise
    const handler = {
      get(target, prop) {
        const value = target[prop];
        if (typeof value === 'number' && value > 0) {
          // Add noise to timing values but keep them ordered correctly
          return Math.round((value + noise) * 10) / 10;
        }
        if (typeof value === 'function') {
          return value.bind(target);
        }
        return value;
      }
    };
    try {
      return new Proxy(entry, handler);
    } catch(e) {
      return entry;
    }
  }

  function spoofTimezone(profile, makeNative) {
    const targetOffset = profile.timezoneOffset;
    const targetTZ = profile.timezone;

    // Override getTimezoneOffset
    const origGetTZOffset = Date.prototype.getTimezoneOffset;
    Date.prototype.getTimezoneOffset = makeNative(function getTimezoneOffset() {
      return -targetOffset; // getTimezoneOffset returns negative of UTC offset in minutes
    }, 'getTimezoneOffset');

    // Override toLocaleString methods to use spoofed timezone
    const dateMethodsToOverride = ['toLocaleString', 'toLocaleDateString', 'toLocaleTimeString'];
    dateMethodsToOverride.forEach(method => {
      const orig = Date.prototype[method];
      Date.prototype[method] = makeNative(function() {
        const args = [...arguments];
        if (!args[1]) args[1] = {};
        if (typeof args[1] === 'object' && !args[1].timeZone) {
          args[1].timeZone = targetTZ;
        }
        return orig.apply(this, args);
      }, method);
    });

    // Override toString and toTimeString to reflect spoofed timezone
    const origToString = Date.prototype.toString;
    Date.prototype.toString = makeNative(function toString() {
      const str = origToString.call(this);
      // Replace timezone abbreviation - this is complex to do perfectly
      // Most fingerprinters use getTimezoneOffset() anyway
      return str;
    }, 'toString');
  }

  function spoofIntl(profile, makeNative) {
    const targetTZ = profile.timezone;
    const targetLocale = profile.language;

    // Override Intl.DateTimeFormat
    const OrigDateTimeFormat = Intl.DateTimeFormat;
    const PhantomDateTimeFormat = makeNative(function DateTimeFormat(locales, options) {
      const opts = options ? { ...options } : {};
      if (!opts.timeZone) {
        opts.timeZone = targetTZ;
      }
      const loc = locales || targetLocale;
      if (new.target) {
        return new OrigDateTimeFormat(loc, opts);
      }
      return OrigDateTimeFormat(loc, opts);
    }, 'DateTimeFormat');

    PhantomDateTimeFormat.prototype = OrigDateTimeFormat.prototype;
    PhantomDateTimeFormat.supportedLocalesOf = OrigDateTimeFormat.supportedLocalesOf;

    // Override resolvedOptions to return spoofed timezone
    const origResolvedOptions = OrigDateTimeFormat.prototype.resolvedOptions;
    OrigDateTimeFormat.prototype.resolvedOptions = makeNative(function resolvedOptions() {
      const resolved = origResolvedOptions.call(this);
      // If no explicit timezone was set, use spoofed one
      if (!this.__explicitTZ) {
        resolved.timeZone = targetTZ;
      }
      resolved.locale = resolved.locale || targetLocale;
      return resolved;
    }, 'resolvedOptions');

    Intl.DateTimeFormat = PhantomDateTimeFormat;
  }

  return { apply };
})();
