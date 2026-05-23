// PhantomPrint - Distribution Data Module (Source 5: AmIUnique Research)
// Provides weighted distributions for all fingerprint attributes
// Ensures generated profiles use COMMON values to minimize uniqueness
'use strict';

const DistributionData = (() => {
  let _data = null;

  function setData(data) { _data = data; }

  // Weighted selection from a distribution object {value: weight, ...}
  function weightedSelect(distribution, rng) {
    if (!distribution) return null;
    const entries = Object.entries(distribution).filter(([k]) => k !== 'other');
    const total = entries.reduce((sum, [, w]) => sum + w, 0);
    let roll = rng.next() * total;
    for (const [key, weight] of entries) {
      roll -= weight;
      if (roll <= 0) return key;
    }
    return entries[entries.length - 1][0];
  }

  function getCommonValue(attribute, rng) {
    if (!_data || !_data[attribute]) return null;
    const dist = _data[attribute];
    if (typeof dist !== 'object') return dist;
    return weightedSelect(dist, rng);
  }

  function getWeightedTimezone(locale, rng) {
    if (!_data || !_data.timezone) return 'America/New_York';
    // If locale provided, filter to geographically consistent timezones
    if (locale) {
      const region = locale.split('-')[1] || '';
      const regionTimezones = {
        'US': ['America/New_York','America/Chicago','America/Denver','America/Los_Angeles','America/Phoenix','America/Anchorage'],
        'GB': ['Europe/London'],
        'AU': ['Australia/Sydney','Australia/Melbourne'],
        'CA': ['America/Toronto','America/Vancouver'],
        'CN': ['Asia/Shanghai'],
        'JP': ['Asia/Tokyo'],
        'KR': ['Asia/Seoul'],
        'DE': ['Europe/Berlin'],
        'FR': ['Europe/Paris'],
        'ES': ['Europe/Madrid'],
        'IT': ['Europe/Rome'],
        'BR': ['America/Sao_Paulo'],
        'RU': ['Europe/Moscow'],
        'IN': ['Asia/Kolkata'],
        'NL': ['Europe/Amsterdam'],
        'PL': ['Europe/Warsaw'],
        'SE': ['Europe/Stockholm'],
        'TR': ['Europe/Istanbul'],
        'SA': ['Asia/Riyadh'],
        'TH': ['Asia/Bangkok'],
        'VN': ['Asia/Ho_Chi_Minh'],
        'ID': ['Asia/Jakarta'],
        'TW': ['Asia/Taipei'],
        'SG': ['Asia/Singapore'],
        'NZ': ['Pacific/Auckland'],
        'MX': ['America/Mexico_City'],
        'HK': ['Asia/Hong_Kong'],
        'AT': ['Europe/Vienna'],
        'CH': ['Europe/Zurich']
      };
      const tzList = regionTimezones[region];
      if (tzList && tzList.length > 0) {
        // Build weights from distribution data
        const filtered = {};
        for (const tz of tzList) {
          if (_data.timezone[tz]) filtered[tz] = _data.timezone[tz];
        }
        if (Object.keys(filtered).length > 0) return weightedSelect(filtered, rng);
        // If no match in distribution, pick randomly from locale-appropriate list
        return tzList[Math.floor(rng.next() * tzList.length)];
      }
    }
    return weightedSelect(_data.timezone, rng);
  }

  function getWeightedLanguage(rng) {
    if (!_data || !_data.language) return 'en-US';
    return weightedSelect(_data.language, rng);
  }

  function getWeightedHardwareConcurrency(isMobile, rng) {
    if (!_data || !_data.hardwareConcurrency) return 8;
    const val = parseInt(weightedSelect(_data.hardwareConcurrency, rng));
    // Mobile typically has 4-8 cores, desktops 4-32
    if (isMobile && val > 8) return rng.next() < 0.5 ? 8 : 6;
    return val;
  }

  function getWeightedDeviceMemory(isMobile, rng) {
    if (!_data || !_data.deviceMemory) return 8;
    const val = parseInt(weightedSelect(_data.deviceMemory, rng));
    // Mobile typically has 4-8 GB
    if (isMobile && val > 8) return rng.next() < 0.5 ? 8 : 4;
    return val;
  }

  function getWeightedDPR(os, isMobile, rng) {
    if (!_data || !_data.devicePixelRatio) return isMobile ? 2 : 1;
    const val = parseFloat(weightedSelect(_data.devicePixelRatio, rng));
    // macOS is always 2 (Retina)
    if (os === 'macos') return 2;
    // iOS is always 2 or 3
    if (os === 'ios') return val >= 2.5 ? 3 : 2;
    return val;
  }

  function getWeightedColorDepth(rng) {
    if (!_data || !_data.colorDepth) return 24;
    return parseInt(weightedSelect(_data.colorDepth, rng));
  }

  function getWeightedTouchPoints(isMobile, rng) {
    if (!_data || !_data.maxTouchPoints) return isMobile ? 5 : 0;
    const val = parseInt(weightedSelect(_data.maxTouchPoints, rng));
    // Force consistency: desktop = 0, mobile = 5 or 10
    if (!isMobile && val > 0) return 0;
    if (isMobile && val === 0) return 5;
    return val;
  }

  function getFontsForOS(os) {
    if (!_data || !_data.commonFontSets) return [];
    const osKey = os.toLowerCase();
    return _data.commonFontSets[osKey] || _data.commonFontSets['windows'] || [];
  }

  function getCodecsForBrowser(browser) {
    if (!_data || !_data.codecSupport) return null;
    const browserKey = browser.toLowerCase();
    return _data.codecSupport[browserKey] || _data.codecSupport['chrome'] || null;
  }

  function getVoicesForProfile(os, browser) {
    if (!_data || !_data.speechVoices) return [];
    const osKey = os.toLowerCase();
    const browserKey = browser.toLowerCase();
    // Try OS_browser key first
    const key = `${osKey}_${browserKey}`;
    if (_data.speechVoices[key]) return _data.speechVoices[key];
    // Try OS variations
    const osMap = { 'windows': 'windows', 'macos': 'macos', 'linux': 'linux', 'android': 'android', 'ios': 'ios' };
    const mappedOS = osMap[osKey] || 'windows';
    const fallbackKey = `${mappedOS}_${browserKey}`;
    if (_data.speechVoices[fallbackKey]) return _data.speechVoices[fallbackKey];
    // Default to windows_chrome
    return _data.speechVoices['windows_chrome'] || [];
  }

  function getAudioSampleRate(rng) {
    if (!_data || !_data.audioSampleRate) return 48000;
    return parseInt(weightedSelect(_data.audioSampleRate, rng));
  }

  return {
    setData,
    getCommonValue,
    getWeightedTimezone,
    getWeightedLanguage,
    getWeightedHardwareConcurrency,
    getWeightedDeviceMemory,
    getWeightedDPR,
    getWeightedColorDepth,
    getWeightedTouchPoints,
    getFontsForOS,
    getCodecsForBrowser,
    getVoicesForProfile,
    getAudioSampleRate
  };
})();

if (typeof module !== 'undefined') module.exports = DistributionData;
