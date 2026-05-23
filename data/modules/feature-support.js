// PhantomPrint - Feature Support Module (Source 3: CanIUse)
// Ensures spoofed browser feature detection matches the claimed browser+version
'use strict';

const FeatureSupport = (() => {
  let _data = null;

  function setData(data) { _data = data; }

  // Find the closest version that has support data
  function findVersionSupport(browserData, version) {
    if (!browserData) return null;
    const major = parseInt(version);
    // Check exact version first
    if (browserData[version] !== undefined) return browserData[version];
    if (browserData[String(major)] !== undefined) return browserData[String(major)];
    // Find closest lower version
    const versions = Object.keys(browserData).map(v => parseFloat(v)).filter(v => !isNaN(v)).sort((a, b) => b - a);
    for (const v of versions) {
      if (v <= major) return browserData[String(v)];
    }
    return null;
  }

  function isFeatureSupported(feature, browser, version) {
    if (!_data || !_data.features) return true; // Default: don't block features
    const featureData = _data.features[feature];
    if (!featureData) return true;
    const browserKey = browser.toLowerCase().replace(' ', '_');
    const browserData = featureData[browserKey] || featureData[browser];
    if (!browserData) return true;
    const support = findVersionSupport(browserData, version);
    if (support === null) return true;
    // y = yes, a = partial (treat as yes), n = no, x = prefix required
    if (typeof support === 'string') {
      return support.startsWith('y') || support.startsWith('a');
    }
    return support === true;
  }

  function getSupportedCSSProperties(browser, version) {
    if (!_data || !_data.cssProperties) return [];
    const browserKey = browser.toLowerCase();
    const browserData = _data.cssProperties[browserKey];
    if (!browserData) return [];
    const major = String(parseInt(version));
    // Find closest version
    const versions = Object.keys(browserData).map(Number).filter(v => !isNaN(v)).sort((a, b) => b - a);
    for (const v of versions) {
      if (v <= parseInt(major)) return browserData[String(v)] || [];
    }
    return [];
  }

  function getSupportedAPIs(browser, version) {
    if (!_data || !_data.apiExistence) return [];
    const browserKey = browser.toLowerCase();
    const browserData = _data.apiExistence[browserKey];
    if (!browserData) return [];
    const major = String(parseInt(version));
    const versions = Object.keys(browserData).map(Number).filter(v => !isNaN(v)).sort((a, b) => b - a);
    for (const v of versions) {
      if (v <= parseInt(major)) return browserData[String(v)] || [];
    }
    return [];
  }

  function shouldExposeAPI(apiName, browser, version) {
    const apis = getSupportedAPIs(browser, version);
    if (apis.length === 0) return true; // Default: don't hide
    return apis.includes(apiName);
  }

  function needsPrefix(feature, browser) {
    // Known prefix requirements
    const prefixMap = {
      'safari': {
        'backdrop-filter': '-webkit-backdrop-filter'
      }
    };
    const browserKey = browser.toLowerCase();
    if (prefixMap[browserKey] && prefixMap[browserKey][feature]) {
      return prefixMap[browserKey][feature];
    }
    return null;
  }

  return {
    setData,
    isFeatureSupported,
    getSupportedCSSProperties,
    getSupportedAPIs,
    shouldExposeAPI,
    needsPrefix
  };
})();

if (typeof module !== 'undefined') module.exports = FeatureSupport;
