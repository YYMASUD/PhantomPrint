// PhantomPrint - UA Categories Module (Source 6: user-agents.net)
// Provides UA strings filtered by device type, rendering engine, and vendor
'use strict';

const UACategories = (() => {
  let _data = null;

  function setData(data) { _data = data; }

  function pickRandom(arr, rng) {
    if (!arr || arr.length === 0) return null;
    return arr[Math.floor(rng.next() * arr.length)];
  }

  function getUAByDeviceType(type, subType, rng) {
    if (!_data || !_data.byDeviceType) return null;
    const deviceData = _data.byDeviceType[type];
    if (!deviceData) return null;
    if (subType && deviceData[subType]) {
      return pickRandom(deviceData[subType], rng);
    }
    // Pick from any sub-category
    const allUAs = Object.values(deviceData).flat();
    return pickRandom(allUAs, rng);
  }

  function getUAByEngine(engine, rng) {
    if (!_data || !_data.byEngine) return null;
    const engineData = _data.byEngine[engine];
    if (!engineData || !engineData.samples) return null;
    return pickRandom(engineData.samples, rng);
  }

  function getBrowsersByEngine(engine) {
    if (!_data || !_data.byEngine) return [];
    const engineData = _data.byEngine[engine];
    return engineData ? engineData.browsers || [] : [];
  }

  function getUAByVendor(vendor, rng) {
    if (!_data || !_data.byVendor) return null;
    const vendorData = _data.byVendor[vendor];
    if (!vendorData || !vendorData.samples) return null;
    return pickRandom(vendorData.samples, rng);
  }

  function getDevicesByVendor(vendor) {
    if (!_data || !_data.byVendor) return [];
    const vendorData = _data.byVendor[vendor];
    return vendorData ? vendorData.devices || [] : [];
  }

  function getModelsByVendor(vendor) {
    if (!_data || !_data.byVendor) return [];
    const vendorData = _data.byVendor[vendor];
    return vendorData ? vendorData.models || [] : [];
  }

  function getAllDeviceTypes() {
    if (!_data || !_data.byDeviceType) return [];
    return Object.keys(_data.byDeviceType);
  }

  function getAllEngines() {
    if (!_data || !_data.byEngine) return [];
    return Object.keys(_data.byEngine);
  }

  function getAllVendors() {
    if (!_data || !_data.byVendor) return [];
    return Object.keys(_data.byVendor);
  }

  return {
    setData,
    getUAByDeviceType,
    getUAByEngine,
    getBrowsersByEngine,
    getUAByVendor,
    getDevicesByVendor,
    getModelsByVendor,
    getAllDeviceTypes,
    getAllEngines,
    getAllVendors
  };
})();

if (typeof module !== 'undefined') module.exports = UACategories;
