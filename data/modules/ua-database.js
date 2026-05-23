// PhantomPrint - User Agent Database Module (Source 1: top-user-agents)
// Provides weighted random UA selection from pre-embedded real-world data
'use strict';

const UADatabase = (() => {
  let _data = null;

  function loadData() {
    if (_data) return _data;
    try {
      // In service worker context, use importScripts or fetch
      // Data is loaded via the service worker's fetch at startup
      return _data;
    } catch(e) {
      return null;
    }
  }

  function setData(data) {
    _data = data;
  }

  // Weighted random selection using cumulative distribution
  function weightedPick(items, rng) {
    if (!items || items.length === 0) return null;
    const totalWeight = items.reduce((sum, item) => sum + (item.weight || 0), 0);
    if (totalWeight <= 0) return items[Math.floor(rng.next() * items.length)];
    
    let roll = rng.next() * totalWeight;
    for (const item of items) {
      roll -= (item.weight || 0);
      if (roll <= 0) return item;
    }
    return items[items.length - 1];
  }

  function getRandomUA(deviceType, rng) {
    if (!_data) return null;
    const pool = deviceType ? _data[deviceType] : null;
    if (pool && pool.length > 0) return weightedPick(pool, rng);
    // Default: pick from all categories weighted by device type share
    const allPools = ['desktop', 'mobile', 'tablet'];
    const weights = { desktop: 0.42, mobile: 0.53, tablet: 0.05 };
    const roll = rng.next();
    let cumulative = 0;
    for (const type of allPools) {
      cumulative += weights[type];
      if (roll <= cumulative && _data[type] && _data[type].length > 0) {
        return weightedPick(_data[type], rng);
      }
    }
    return _data.desktop ? weightedPick(_data.desktop, rng) : null;
  }

  function getWeightedRandomUA(rng) {
    return getRandomUA(null, rng);
  }

  function getUAByBrowser(browser, os, rng) {
    if (!_data) return null;
    const allUAs = [...(_data.desktop || []), ...(_data.mobile || []), ...(_data.tablet || [])];
    const filtered = allUAs.filter(ua => {
      const matchBrowser = ua.browser === browser.toLowerCase();
      const matchOS = os ? ua.os === os.toLowerCase() : true;
      return matchBrowser && matchOS;
    });
    if (filtered.length === 0) return null;
    return weightedPick(filtered, rng);
  }

  function getAllUAsForOS(os) {
    if (!_data) return [];
    const allUAs = [...(_data.desktop || []), ...(_data.mobile || []), ...(_data.tablet || [])];
    return allUAs.filter(ua => ua.os === os.toLowerCase());
  }

  function getUAsByDeviceType(deviceType) {
    if (!_data) return [];
    return _data[deviceType] || [];
  }

  return {
    setData,
    loadData,
    getRandomUA,
    getWeightedRandomUA,
    getUAByBrowser,
    getAllUAsForOS,
    getUAsByDeviceType,
    weightedPick
  };
})();

if (typeof module !== 'undefined') module.exports = UADatabase;
