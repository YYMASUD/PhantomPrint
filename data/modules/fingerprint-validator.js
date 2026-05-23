// PhantomPrint - Fingerprint Validator Module (Source 7: Fingerbank-inspired)
// Validates that generated spoofed profiles look like real devices
// Uses offline heuristic rules + optional API validation
'use strict';

const FingerprintValidator = (() => {
  const VALIDATION_RULES = [
    // Rule 1: OS ↔ Platform consistency
    {
      name: 'os_platform_match',
      severity: 'critical',
      check: (profile) => {
        const map = {
          'windows': 'Win32', 'macos': 'MacIntel',
          'linux': 'Linux', 'android': 'Linux',
          'ios': 'iPhone'
        };
        const expected = map[profile.os];
        if (!expected) return { pass: true };
        if (profile.os === 'ios' && profile.tablet && profile.platform === 'iPad') return { pass: true };
        if (profile.os === 'android' && profile.platform && profile.platform.startsWith('Linux')) return { pass: true };
        if (profile.os === 'linux' && profile.platform && profile.platform.startsWith('Linux')) return { pass: true };
        return {
          pass: profile.platform === expected || profile.platform.startsWith(expected.substring(0, 3)),
          message: `Platform "${profile.platform}" doesn't match OS "${profile.os}" (expected "${expected}")`
        };
      }
    },
    // Rule 2: Browser ↔ User-Agent consistency
    {
      name: 'browser_ua_match',
      severity: 'critical',
      check: (profile) => {
        if (!profile.userAgent) return { pass: false, message: 'Missing userAgent' };
        const checks = {
          'Chrome': 'Chrome/', 'Firefox': 'Firefox/',
          'Safari': 'Safari/', 'Edge': 'Edg/'
        };
        const token = checks[profile.browser];
        if (!token) return { pass: true };
        if (profile.browser === 'Safari' && profile.userAgent.includes('Chrome/')) {
          return { pass: false, message: 'Safari UA should not contain Chrome/' };
        }
        return {
          pass: profile.userAgent.includes(token),
          message: `UA missing ${token} token for browser ${profile.browser}`
        };
      }
    },
    // Rule 3: GPU ↔ OS consistency
    {
      name: 'gpu_os_match',
      severity: 'critical',
      check: (profile) => {
        if (!profile.gpu) return { pass: true };
        const r = profile.gpu.toLowerCase();
        // Apple GPU only on Apple OS
        if ((r.includes('apple') || r.includes('metal')) &&
            profile.os !== 'macos' && profile.os !== 'ios') {
          return { pass: false, message: 'Apple GPU on non-Apple OS' };
        }
        // D3D11 only on Windows
        if (r.includes('d3d11') && profile.os !== 'windows') {
          return { pass: false, message: 'D3D11 renderer on non-Windows OS' };
        }
        // Adreno/Mali only on Android
        if ((r.includes('adreno') || r.includes('mali')) && profile.os !== 'android') {
          return { pass: false, message: 'Mobile GPU on non-Android OS' };
        }
        return { pass: true };
      }
    },
    // Rule 4: Touch ↔ Device type consistency
    {
      name: 'touch_device_match',
      severity: 'high',
      check: (profile) => {
        if (profile.mobile && profile.maxTouchPoints === 0) {
          return { pass: false, message: 'Mobile device with 0 touch points' };
        }
        if (!profile.mobile && !profile.tablet && profile.maxTouchPoints > 0 &&
            profile.os !== 'windows') { // Windows laptops can have touch
          return { pass: false, message: 'Desktop with touch points on non-Windows OS' };
        }
        return { pass: true };
      }
    },
    // Rule 5: Client Hints ↔ Browser consistency
    {
      name: 'client_hints_browser',
      severity: 'critical',
      check: (profile) => {
        if (profile.browser === 'Firefox' && profile.clientHints) {
          return { pass: false, message: 'Firefox should not have Client Hints' };
        }
        if (profile.browser === 'Safari' && profile.clientHints) {
          return { pass: false, message: 'Safari should not have Client Hints' };
        }
        if ((profile.browser === 'Chrome' || profile.browser === 'Edge') && !profile.clientHints) {
          return { pass: false, message: 'Chromium browser missing Client Hints' };
        }
        return { pass: true };
      }
    },
    // Rule 6: Plugins ↔ Browser consistency
    {
      name: 'plugins_browser',
      severity: 'high',
      check: (profile) => {
        if (profile.browser === 'Firefox' && profile.plugins && profile.plugins.length > 0) {
          return { pass: false, message: 'Firefox should have empty plugins array' };
        }
        if ((profile.browser === 'Chrome' || profile.browser === 'Edge') &&
            (!profile.plugins || profile.plugins.length !== 5)) {
          return { pass: false, message: 'Chromium browser should have exactly 5 plugins' };
        }
        return { pass: true };
      }
    },
    // Rule 7: Screen ↔ Device type consistency
    {
      name: 'screen_device_match',
      severity: 'medium',
      check: (profile) => {
        if (!profile.screen) return { pass: true };
        const w = profile.screen.width;
        if (profile.mobile && !profile.tablet && w > 500) {
          return { pass: false, message: `Mobile screen width ${w} too large` };
        }
        if (!profile.mobile && w < 600) {
          return { pass: false, message: `Desktop screen width ${w} too small` };
        }
        return { pass: true };
      }
    },
    // Rule 8: DPR ↔ OS consistency
    {
      name: 'dpr_os_match',
      severity: 'medium',
      check: (profile) => {
        if (profile.os === 'macos' && profile.devicePixelRatio !== 2) {
          return { pass: false, message: 'macOS should have DPR=2 (Retina)' };
        }
        return { pass: true };
      }
    },
    // Rule 9: Language ↔ Languages array consistency
    {
      name: 'language_array_match',
      severity: 'high',
      check: (profile) => {
        if (profile.languages && profile.languages.length > 0 &&
            profile.languages[0] !== profile.language) {
          return { pass: false, message: 'languages[0] must equal navigator.language' };
        }
        return { pass: true };
      }
    },
    // Rule 10: deviceMemory must be a valid value
    {
      name: 'device_memory_valid',
      severity: 'medium',
      check: (profile) => {
        const valid = [0.25, 0.5, 1, 2, 4, 8, 16, 32];
        if (profile.deviceMemory && !valid.includes(profile.deviceMemory)) {
          return { pass: false, message: `Invalid deviceMemory: ${profile.deviceMemory}` };
        }
        return { pass: true };
      }
    },
    // Rule 11: hardwareConcurrency should be even
    {
      name: 'hardware_concurrency_even',
      severity: 'low',
      check: (profile) => {
        if (profile.hardwareConcurrency && profile.hardwareConcurrency % 2 !== 0) {
          return { pass: false, message: `Odd hardwareConcurrency: ${profile.hardwareConcurrency}` };
        }
        return { pass: true };
      }
    },
    // Rule 12: Viewport ≤ Screen
    {
      name: 'viewport_screen_match',
      severity: 'high',
      check: (profile) => {
        if (!profile.viewport || !profile.screen) return { pass: true };
        if (profile.viewport.width > profile.screen.width) {
          return { pass: false, message: 'Viewport width > screen width' };
        }
        if (profile.viewport.height > profile.screen.height) {
          return { pass: false, message: 'Viewport height > screen height' };
        }
        return { pass: true };
      }
    },
    // Rule 13: colorDepth must equal pixelDepth
    {
      name: 'color_pixel_depth',
      severity: 'high',
      check: (profile) => {
        if (profile.screen && profile.screen.colorDepth !== profile.screen.pixelDepth) {
          return { pass: false, message: 'colorDepth must equal pixelDepth' };
        }
        return { pass: true };
      }
    },
    // Rule 14: Vendor ↔ Browser consistency
    {
      name: 'vendor_browser_match',
      severity: 'critical',
      check: (profile) => {
        const expected = {
          'Chrome': 'Google Inc.', 'Edge': 'Google Inc.',
          'Firefox': '', 'Safari': 'Apple Computer, Inc.'
        };
        if (expected[profile.browser] !== undefined && profile.vendor !== expected[profile.browser]) {
          return { pass: false, message: `Vendor "${profile.vendor}" wrong for ${profile.browser}` };
        }
        return { pass: true };
      }
    },
    // Rule 15: productSub ↔ Browser consistency
    {
      name: 'productsub_browser_match',
      severity: 'high',
      check: (profile) => {
        if (profile.browser === 'Firefox' && profile.productSub !== '20100101') {
          return { pass: false, message: 'Firefox productSub must be 20100101' };
        }
        if (['Chrome','Edge','Safari'].includes(profile.browser) && profile.productSub !== '20030107') {
          return { pass: false, message: `${profile.browser} productSub must be 20030107` };
        }
        return { pass: true };
      }
    }
  ];

  function validateProfile(profile) {
    const results = {
      valid: true,
      score: 100,
      errors: [],
      warnings: [],
      details: []
    };

    for (const rule of VALIDATION_RULES) {
      const result = rule.check(profile);
      const detail = { rule: rule.name, severity: rule.severity, ...result };
      results.details.push(detail);

      if (!result.pass) {
        if (rule.severity === 'critical') {
          results.valid = false;
          results.score -= 20;
          results.errors.push(`[${rule.name}] ${result.message}`);
        } else if (rule.severity === 'high') {
          results.score -= 10;
          results.errors.push(`[${rule.name}] ${result.message}`);
        } else if (rule.severity === 'medium') {
          results.score -= 5;
          results.warnings.push(`[${rule.name}] ${result.message}`);
        } else {
          results.score -= 2;
          results.warnings.push(`[${rule.name}] ${result.message}`);
        }
      }
    }

    results.score = Math.max(0, results.score);
    if (results.score < 60) results.valid = false;

    return results;
  }

  function isProfileRealistic(profile) {
    const result = validateProfile(profile);
    return result.valid && result.score >= 80;
  }

  function getDeviceClassification(ua) {
    if (!ua) return { type: 'unknown', os: 'unknown', browser: 'unknown' };
    const result = { type: 'desktop', os: 'unknown', browser: 'unknown' };

    // Device type
    if (ua.includes('Mobile')) result.type = 'mobile';
    else if (ua.includes('Tablet') || ua.includes('iPad')) result.type = 'tablet';

    // OS
    if (ua.includes('Windows NT')) result.os = 'windows';
    else if (ua.includes('Mac OS X')) result.os = ua.includes('iPhone') || ua.includes('iPad') ? 'ios' : 'macos';
    else if (ua.includes('Android')) result.os = 'android';
    else if (ua.includes('Linux')) result.os = 'linux';

    // Browser
    if (ua.includes('Edg/')) result.browser = 'edge';
    else if (ua.includes('OPR/') || ua.includes('Opera')) result.browser = 'opera';
    else if (ua.includes('SamsungBrowser')) result.browser = 'samsung_internet';
    else if (ua.includes('Firefox/')) result.browser = 'firefox';
    else if (ua.includes('Chrome/')) result.browser = 'chrome';
    else if (ua.includes('Safari/') && !ua.includes('Chrome')) result.browser = 'safari';

    return result;
  }

  return {
    validateProfile,
    isProfileRealistic,
    getDeviceClassification,
    VALIDATION_RULES
  };
})();

if (typeof module !== 'undefined') module.exports = FingerprintValidator;
