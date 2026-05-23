// PhantomPrint - Market Share Module (Source 2: StatCounter GlobalStats)
// Provides weighted random selection based on real-world market share data
'use strict';

const MarketShare = (() => {
  let _data = null;

  function setData(data) { _data = data; }

  function weightedSelect(distribution, rng) {
    if (!distribution) return null;
    const entries = Object.entries(distribution);
    const total = entries.reduce((sum, [, w]) => sum + w, 0);
    let roll = rng.next() * total;
    for (const [key, weight] of entries) {
      roll -= weight;
      if (roll <= 0) return key;
    }
    return entries[entries.length - 1][0];
  }

  function weightedRandomBrowser(rng) {
    if (!_data || !_data.browserShare) return 'chrome';
    return weightedSelect(_data.browserShare, rng);
  }

  function weightedRandomOS(rng) {
    if (!_data || !_data.osShare) return 'windows';
    return weightedSelect(_data.osShare, rng);
  }

  function weightedRandomDesktopOS(rng) {
    if (!_data || !_data.desktopOsShare) return 'windows';
    return weightedSelect(_data.desktopOsShare, rng);
  }

  function weightedRandomResolution(deviceType, rng) {
    if (!_data || !_data.screenResolutions) return { width: 1920, height: 1080 };
    const pool = _data.screenResolutions[deviceType || 'desktop'];
    if (!pool) return { width: 1920, height: 1080 };
    
    // Filter out 'other'
    const filtered = {};
    for (const [res, weight] of Object.entries(pool)) {
      if (res !== 'other') filtered[res] = weight;
    }
    
    const chosen = weightedSelect(filtered, rng);
    if (!chosen) return { width: 1920, height: 1080 };
    const [w, h] = chosen.split('x').map(Number);
    return { width: w, height: h };
  }

  function weightedRandomDeviceType(rng) {
    if (!_data || !_data.deviceTypeShare) return 'desktop';
    return weightedSelect(_data.deviceTypeShare, rng);
  }

  function weightedRandomBrowserVersion(browser, rng) {
    if (!_data || !_data.browserVersionShare) return null;
    const versions = _data.browserVersionShare[browser];
    if (!versions) return null;
    const filtered = {};
    for (const [ver, weight] of Object.entries(versions)) {
      if (ver !== 'other') filtered[ver] = weight;
    }
    return weightedSelect(filtered, rng);
  }

  function weightedRandomDeviceVendor(rng) {
    if (!_data || !_data.deviceVendorShare) return 'samsung';
    const filtered = {};
    for (const [vendor, weight] of Object.entries(_data.deviceVendorShare)) {
      if (vendor !== 'other') filtered[vendor] = weight;
    }
    return weightedSelect(filtered, rng);
  }

  function getRegionalWeights(region) {
    if (!_data || !_data.regionBrowserShare) return null;
    return _data.regionBrowserShare[region] || null;
  }

  function weightedRandomBrowserForRegion(region, rng) {
    const weights = getRegionalWeights(region);
    if (!weights) return weightedRandomBrowser(rng);
    const filtered = {};
    for (const [browser, weight] of Object.entries(weights)) {
      if (browser !== 'other') filtered[browser] = weight;
    }
    return weightedSelect(filtered, rng);
  }

  return {
    setData,
    weightedRandomBrowser,
    weightedRandomOS,
    weightedRandomDesktopOS,
    weightedRandomResolution,
    weightedRandomDeviceType,
    weightedRandomBrowserVersion,
    weightedRandomDeviceVendor,
    getRegionalWeights,
    weightedRandomBrowserForRegion
  };
})();

if (typeof module !== 'undefined') module.exports = MarketShare;
