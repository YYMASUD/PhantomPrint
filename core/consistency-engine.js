/**
 * PhantomPrint — Consistency Engine
 * Validates fingerprint profiles for cross-parameter consistency.
 * Detects and auto-fixes mismatches that would reveal spoofing.
 * @module core/consistency-engine
 */
'use strict';

const ConsistencyEngine = {
  // =========================================================================
  // TIMEZONE ↔ LANGUAGE CONSISTENCY MAP
  // =========================================================================
  LOCALE_TIMEZONE_MAP: {
    'en-US': ['America/New_York','America/Chicago','America/Denver','America/Los_Angeles','America/Phoenix','America/Anchorage','Pacific/Honolulu'],
    'en-GB': ['Europe/London'],
    'en-AU': ['Australia/Sydney','Australia/Melbourne','Australia/Perth'],
    'en-CA': ['America/Toronto','America/Vancouver','America/Edmonton'],
    'fr-FR': ['Europe/Paris'],
    'fr-CA': ['America/Toronto','America/Montreal'],
    'de-DE': ['Europe/Berlin'],
    'de-AT': ['Europe/Vienna'],
    'es-ES': ['Europe/Madrid'],
    'es-MX': ['America/Mexico_City'],
    'it-IT': ['Europe/Rome'],
    'ja-JP': ['Asia/Tokyo'],
    'ko-KR': ['Asia/Seoul'],
    'zh-CN': ['Asia/Shanghai'],
    'zh-TW': ['Asia/Taipei'],
    'ru-RU': ['Europe/Moscow','Asia/Yekaterinburg'],
    'pt-BR': ['America/Sao_Paulo'],
    'pt-PT': ['Europe/Lisbon'],
    'nl-NL': ['Europe/Amsterdam'],
    'pl-PL': ['Europe/Warsaw'],
    'sv-SE': ['Europe/Stockholm'],
    'da-DK': ['Europe/Copenhagen'],
    'nb-NO': ['Europe/Oslo'],
    'fi-FI': ['Europe/Helsinki'],
    'tr-TR': ['Europe/Istanbul'],
    'ar-SA': ['Asia/Riyadh'],
    'hi-IN': ['Asia/Kolkata'],
    'th-TH': ['Asia/Bangkok'],
    'vi-VN': ['Asia/Ho_Chi_Minh'],
    'id-ID': ['Asia/Jakarta'],
    'ms-MY': ['Asia/Kuala_Lumpur']
  },

  // OS-specific fonts that should NOT appear on other OSes
  OS_EXCLUSIVE_FONTS: {
    windows: ['Segoe UI', 'Calibri', 'Consolas', 'Cambria', 'Candara', 'Corbel', 'Constantia', 'Malgun Gothic', 'Microsoft YaHei', 'Yu Gothic', 'Meiryo', 'Gabriola', 'Segoe Print', 'Segoe Script'],
    macos: ['Helvetica Neue', 'San Francisco', 'SF Pro', 'SF Mono', 'Menlo', 'Monaco', 'Avenir', 'Avenir Next', 'Futura', 'Optima', 'Baskerville', 'Didot', 'Gill Sans', 'Hoefler Text', 'Chalkboard SE', 'Apple Color Emoji'],
    ios: ['San Francisco', 'SF Pro', 'SF Compact', 'Helvetica Neue', 'Apple Color Emoji'],
    linux: ['Liberation Sans', 'Liberation Serif', 'Liberation Mono', 'DejaVu Sans', 'DejaVu Serif', 'Noto Sans', 'Noto Serif', 'Ubuntu', 'Cantarell', 'Droid Sans'],
    android: ['Roboto', 'Noto Sans', 'Droid Sans', 'Droid Serif', 'Droid Sans Mono', 'Noto Color Emoji']
  },

  // Browser ↔ Vendor mapping
  BROWSER_VENDOR_MAP: {
    'Chrome': 'Google Inc.',
    'Edge': 'Google Inc.',
    'Opera': 'Google Inc.',
    'Brave': 'Google Inc.',
    'Firefox': '',
    'Safari': 'Apple Computer, Inc.',
    'Samsung Internet': 'Google Inc.'
  },

  // Browser ↔ productSub mapping
  BROWSER_PRODUCTSUB_MAP: {
    'Chrome': '20030107',
    'Edge': '20030107',
    'Opera': '20030107',
    'Brave': '20030107',
    'Firefox': '20100101',
    'Safari': '20030107',
    'Samsung Internet': '20030107'
  },

  /**
   * Validate a fingerprint profile for internal consistency
   * @param {Object} profile - Complete fingerprint profile
   * @returns {{valid: boolean, errors: string[], warnings: string[], score: number}}
   */
  validateProfile(profile) {
    const errors = [];
    const warnings = [];

    if (!profile) return { valid: false, errors: ['Profile is null or undefined'], warnings: [], score: 0 };

    // ---------------------------------------------------------------
    // RULE 1: OS ↔ User-Agent string
    // ---------------------------------------------------------------
    if (profile.userAgent) {
      if (profile.os === 'Windows' && !profile.userAgent.includes('Windows'))
        errors.push('R1: UA must contain "Windows" for Windows OS');
      if (profile.os === 'macOS' && !profile.userAgent.includes('Macintosh') && !profile.userAgent.includes('Mac OS'))
        errors.push('R1: UA must contain "Macintosh" or "Mac OS" for macOS');
      if (profile.os === 'Linux' && !profile.mobile && !profile.userAgent.includes('Linux') && !profile.userAgent.includes('X11'))
        errors.push('R1: UA must contain "Linux" or "X11" for Linux desktop');
      if (profile.os === 'Android' && !profile.userAgent.includes('Android'))
        errors.push('R1: UA must contain "Android" for Android');
      if (profile.os === 'iOS' && !profile.userAgent.includes('iPhone') && !profile.userAgent.includes('iPad'))
        errors.push('R1: UA must contain "iPhone" or "iPad" for iOS');
    }

    // ---------------------------------------------------------------
    // RULE 2: OS ↔ Platform
    // ---------------------------------------------------------------
    if (profile.platform) {
      const platformMap = {
        'Windows': 'Win32',
        'macOS': 'MacIntel',
        'Linux': 'Linux x86_64',
        'Android': 'Linux armv8l',
        'iOS': ['iPhone', 'iPad', 'iPod']
      };
      const expected = platformMap[profile.os];
      if (expected) {
        if (Array.isArray(expected)) {
          if (!expected.includes(profile.platform))
            errors.push(`R2: Platform "${profile.platform}" invalid for ${profile.os} (expected one of: ${expected.join(', ')})`);
        } else if (profile.platform !== expected && !(profile.os === 'Linux' && profile.platform.startsWith('Linux'))) {
          errors.push(`R2: Platform "${profile.platform}" must be "${expected}" for ${profile.os}`);
        }
      }
    }

    // ---------------------------------------------------------------
    // RULE 3: GPU ↔ OS (critical — instant detection if wrong)
    // ---------------------------------------------------------------
    if (profile.gpu) {
      if (profile.os === 'Windows') {
        if (profile.gpu.includes('Apple GPU') || profile.gpu.includes('Metal Renderer'))
          errors.push('R3: Apple GPU / Metal renderer impossible on Windows');
        if (profile.gpu.includes('OpenGL 4.6') && profile.gpu.includes('ANGLE'))
          warnings.push('R3: ANGLE with OpenGL 4.6 is unusual on Windows (typically D3D11)');
      }
      if (profile.os === 'macOS') {
        if (profile.gpu.includes('D3D11'))
          errors.push('R3: D3D11 renderer impossible on macOS');
        if (profile.gpu.includes('Adreno') || profile.gpu.includes('Mali'))
          errors.push('R3: Mobile GPU impossible on macOS');
      }
      if (profile.os === 'Linux') {
        if (profile.gpu.includes('D3D11'))
          errors.push('R3: D3D11 renderer impossible on Linux');
        if (profile.gpu.includes('Metal'))
          errors.push('R3: Metal renderer impossible on Linux');
      }
      if (profile.os === 'Android') {
        if (profile.gpu.includes('D3D11') || profile.gpu.includes('Metal'))
          errors.push('R3: D3D11/Metal renderer impossible on Android');
        if (profile.gpu.includes('GeForce') || profile.gpu.includes('Radeon'))
          errors.push('R3: Desktop GPU impossible on Android');
      }
      if (profile.os === 'iOS') {
        if (profile.gpuVendor !== 'Apple Inc.' && profile.gpu !== 'Apple GPU')
          warnings.push('R3: iOS typically reports "Apple GPU" or "Apple Inc." vendor');
      }
    }

    // ---------------------------------------------------------------
    // RULE 4: Browser ↔ Vendor
    // ---------------------------------------------------------------
    if (profile.browser && profile.vendor !== undefined) {
      const expectedVendor = this.BROWSER_VENDOR_MAP[profile.browser];
      if (expectedVendor !== undefined && profile.vendor !== expectedVendor) {
        errors.push(`R4: Vendor must be "${expectedVendor}" for ${profile.browser} (got "${profile.vendor}")`);
      }
    }

    // ---------------------------------------------------------------
    // RULE 5: Browser ↔ productSub
    // ---------------------------------------------------------------
    if (profile.browser && profile.productSub !== undefined) {
      const expected = this.BROWSER_PRODUCTSUB_MAP[profile.browser];
      if (expected && profile.productSub !== expected) {
        errors.push(`R5: productSub must be "${expected}" for ${profile.browser}`);
      }
    }

    // ---------------------------------------------------------------
    // RULE 6: Screen ↔ Device Type
    // ---------------------------------------------------------------
    if (profile.screen) {
      if (!profile.mobile && profile.screen.width < 800)
        warnings.push('R6: Desktop screen width < 800px is very unusual');
      if (!profile.mobile && profile.screen.width > 7680)
        warnings.push('R6: Desktop screen width > 7680px is extremely rare');
      if (profile.mobile && profile.screen.width > 500)
        warnings.push('R6: Mobile screen width > 500px is unusual (tablets excluded)');
      if (profile.mobile && !profile.tablet && profile.screen.width > 450)
        warnings.push('R6: Phone screen width > 450px is unusual');
      if (profile.screen.colorDepth && ![24, 30, 32, 48].includes(profile.screen.colorDepth))
        warnings.push(`R6: Unusual colorDepth: ${profile.screen.colorDepth}`);
      if (profile.screen.availHeight && profile.screen.availHeight > profile.screen.height)
        errors.push('R6: availHeight cannot exceed screen height');
    }

    // ---------------------------------------------------------------
    // RULE 7: Touch ↔ Device Type
    // ---------------------------------------------------------------
    if (profile.maxTouchPoints !== undefined) {
      if (profile.mobile && profile.maxTouchPoints === 0)
        errors.push('R7: Mobile devices must have touch support (maxTouchPoints > 0)');
      if (!profile.mobile && profile.maxTouchPoints > 0 && profile.os !== 'Windows')
        warnings.push('R7: Non-Windows desktops rarely have touch');
    }

    // ---------------------------------------------------------------
    // RULE 8: DPR ↔ Device Type ↔ Screen
    // ---------------------------------------------------------------
    if (profile.devicePixelRatio !== undefined) {
      if (!profile.mobile && profile.devicePixelRatio > 3)
        warnings.push('R8: Desktop DPR > 3 is extremely rare');
      if (profile.mobile && profile.devicePixelRatio < 1.5)
        warnings.push('R8: Modern mobile DPR < 1.5 is very rare');
      if (profile.os === 'macOS' && profile.devicePixelRatio !== 1 && profile.devicePixelRatio !== 2)
        warnings.push('R8: macOS DPR is typically 1 (non-retina) or 2 (retina)');
    }

    // ---------------------------------------------------------------
    // RULE 9: Timezone ↔ Language consistency
    // ---------------------------------------------------------------
    if (profile.language && profile.timezone) {
      const validTZs = this.LOCALE_TIMEZONE_MAP[profile.language];
      if (validTZs && !validTZs.includes(profile.timezone)) {
        warnings.push(`R9: Timezone "${profile.timezone}" unusual for language "${profile.language}"`);
      }
    }

    // ---------------------------------------------------------------
    // RULE 10: Fonts ↔ OS
    // ---------------------------------------------------------------
    if (profile.fonts && profile.os) {
      const osKey = profile.os.toLowerCase().replace('macos', 'macos');
      for (const [fontOs, exclusiveFonts] of Object.entries(this.OS_EXCLUSIVE_FONTS)) {
        if (fontOs === osKey) continue; // Skip fonts for current OS
        for (const font of exclusiveFonts) {
          if (profile.fonts.includes(font)) {
            errors.push(`R10: Font "${font}" is ${fontOs}-exclusive but OS is ${profile.os}`);
          }
        }
      }
    }

    // ---------------------------------------------------------------
    // RULE 11: Memory ↔ CPU ↔ Device class
    // ---------------------------------------------------------------
    if (profile.deviceMemory && profile.hardwareConcurrency) {
      if (profile.deviceMemory >= 32 && profile.hardwareConcurrency < 4)
        warnings.push('R11: 32GB+ RAM with < 4 CPU cores is unusual');
      if (profile.mobile && profile.deviceMemory > 16)
        warnings.push('R11: Mobile devices rarely exceed 16GB RAM');
      if (profile.mobile && profile.hardwareConcurrency > 12)
        warnings.push('R11: Mobile devices rarely exceed 12 CPU cores');
    }

    // ---------------------------------------------------------------
    // RULE 12: Client Hints ↔ UA ↔ Platform
    // ---------------------------------------------------------------
    if (profile.clientHints) {
      const ch = profile.clientHints;
      if (ch.platform) {
        const expectedPlatforms = {
          'Windows': 'Windows', 'macOS': 'macOS', 'Linux': 'Linux',
          'Android': 'Android', 'iOS': 'iOS'
        };
        if (expectedPlatforms[profile.os] && ch.platform !== expectedPlatforms[profile.os])
          errors.push(`R12: Client Hints platform "${ch.platform}" doesn't match OS "${profile.os}"`);
      }
      if (ch.mobile !== undefined && ch.mobile !== !!profile.mobile)
        errors.push('R12: Client Hints mobile flag doesn\'t match device type');
    }

    // ---------------------------------------------------------------
    // RULE 13: Browser features ↔ Browser type
    // ---------------------------------------------------------------
    if (profile.browser) {
      if (profile.browser === 'Firefox' && profile.plugins && profile.plugins.length > 0)
        warnings.push('R13: Firefox typically reports empty plugins array');
      if (profile.browser === 'Safari' && profile.buildID)
        errors.push('R13: Safari does not have buildID');
      if (profile.browser !== 'Firefox' && profile.buildID)
        warnings.push('R13: Only Firefox uses buildID');
    }

    // ---------------------------------------------------------------
    // RULE 14: Mobile ↔ Orientation
    // ---------------------------------------------------------------
    if (profile.orientation) {
      if (profile.mobile && profile.orientation.type === 'landscape-primary')
        warnings.push('R14: Mobile devices typically start in portrait');
      if (!profile.mobile && profile.orientation.type === 'portrait-primary' && profile.os !== 'Windows')
        warnings.push('R14: Non-Windows desktops are typically landscape');
    }

    // ---------------------------------------------------------------
    // RULE 15: Connection type ↔ Device
    // ---------------------------------------------------------------
    if (profile.connection) {
      if (!profile.mobile && profile.connection.effectiveType === '2g')
        warnings.push('R15: Desktop on 2G connection is very unusual');
      if (profile.connection.downlink > 100)
        warnings.push('R15: Downlink > 100 Mbps is unusual for connection API');
    }

    // ---------------------------------------------------------------
    // RULE 16: Battery ↔ Desktop
    // ---------------------------------------------------------------
    if (profile.battery && !profile.mobile && profile.os !== 'macOS') {
      warnings.push('R16: Battery API on non-laptop desktop is unusual');
    }

    // ---------------------------------------------------------------
    // RULE 17: WebGL version strings ↔ Browser
    // ---------------------------------------------------------------
    if (profile.webglVersion) {
      if (profile.browser !== 'Firefox' && !profile.webglVersion.includes('Chromium') &&
          profile.browser !== 'Safari' && !profile.webglVersion.includes('OpenGL'))
        warnings.push('R17: Chrome/Edge WebGL version should contain "Chromium"');
    }

    // ---------------------------------------------------------------
    // RULE 18: outerWidth/Height must be >= innerWidth/Height
    // ---------------------------------------------------------------
    if (profile.viewport && profile.outerWidth !== undefined) {
      if (profile.outerWidth < profile.viewport.width)
        errors.push('R18: outerWidth cannot be less than viewport width');
      if (profile.outerHeight < profile.viewport.height)
        errors.push('R18: outerHeight cannot be less than viewport height');
    }

    // ---------------------------------------------------------------
    // RULE 19: availWidth/availHeight vs screen
    // ---------------------------------------------------------------
    if (profile.screen) {
      if (profile.screen.availWidth > profile.screen.width)
        errors.push('R19: availWidth cannot exceed screen width');
    }

    // ---------------------------------------------------------------
    // RULE 20: WebGL params ↔ GPU class
    // ---------------------------------------------------------------
    if (profile.webglParams && profile.gpu) {
      const wp = profile.webglParams;
      if (profile.gpu.includes('Mali') || profile.gpu.includes('Adreno')) {
        if (wp.maxTextureSize > 16384)
          warnings.push('R20: Mobile GPU maxTextureSize > 16384 is unusual');
      }
      if (profile.gpu.includes('RTX 4090') || profile.gpu.includes('RTX 4080')) {
        if (wp.maxTextureSize < 32768)
          warnings.push('R20: High-end NVIDIA GPU should support 32768 maxTextureSize');
      }
    }

    // ---------------------------------------------------------------
    // RULE 21: Audio params consistency
    // ---------------------------------------------------------------
    if (profile.audioParams) {
      if (![44100, 48000, 96000].includes(profile.audioParams.sampleRate))
        warnings.push(`R21: Unusual audio sample rate: ${profile.audioParams.sampleRate}`);
    }

    // ---------------------------------------------------------------
    // RULE 22: languages array must start with language
    // ---------------------------------------------------------------
    if (profile.languages && profile.language) {
      if (profile.languages[0] !== profile.language)
        errors.push('R22: First language in languages array must match primary language');
    }

    // ---------------------------------------------------------------
    // RULE 23: DoNotTrack ↔ Privacy profile
    // ---------------------------------------------------------------
    // (Informational only — no hard errors)

    // ---------------------------------------------------------------
    // RULE 24: Navigator.appVersion ↔ UA
    // ---------------------------------------------------------------
    if (profile.appVersion && profile.userAgent) {
      if (!profile.userAgent.includes(profile.appVersion.substring(0, 10)) &&
          !profile.appVersion.startsWith('5.0'))
        warnings.push('R24: appVersion should relate to User-Agent string');
    }

    // ---------------------------------------------------------------
    // RULE 25: Screen pixelDepth ↔ colorDepth
    // ---------------------------------------------------------------
    if (profile.screen && profile.screen.pixelDepth !== undefined && profile.screen.colorDepth !== undefined) {
      if (profile.screen.pixelDepth !== profile.screen.colorDepth && profile.browser !== 'Firefox')
        warnings.push('R25: pixelDepth should equal colorDepth in Chromium browsers');
    }

    // ---------------------------------------------------------------
    // RULE 26: Apple GPU on non-Apple OS (instant flag)
    // ---------------------------------------------------------------
    if (profile.gpu) {
      const isAppleGPU = /Apple\s*(GPU|M[0-9]|A[0-9])/i.test(profile.gpu) || profile.gpu.includes('Metal');
      const isAppleOS = profile.os === 'macOS' || profile.os === 'iOS';
      if (isAppleGPU && !isAppleOS)
        errors.push(`R26: Apple GPU/Metal renderer "${profile.gpu}" impossible on ${profile.os}`);
    }

    // ---------------------------------------------------------------
    // RULE 27: Segoe UI on non-Windows
    // ---------------------------------------------------------------
    if (profile.fonts && profile.os) {
      const segoeFamily = ['Segoe UI', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Segoe Print', 'Segoe Script'];
      const isWindows = profile.os === 'Windows';
      if (!isWindows) {
        for (const sf of segoeFamily) {
          if (profile.fonts.includes(sf))
            errors.push(`R27: "${sf}" is Windows-exclusive but OS is ${profile.os}`);
        }
      }
    }

    // ---------------------------------------------------------------
    // RULE 28: San Francisco / SF Pro on non-Apple OS
    // ---------------------------------------------------------------
    if (profile.fonts && profile.os) {
      const sfFonts = ['San Francisco', 'SF Pro', 'SF Pro Display', 'SF Pro Text', 'SF Mono', 'SF Compact', 'New York'];
      const isApple = profile.os === 'macOS' || profile.os === 'iOS';
      if (!isApple) {
        for (const sf of sfFonts) {
          if (profile.fonts.includes(sf))
            errors.push(`R28: "${sf}" is macOS/iOS-exclusive but OS is ${profile.os}`);
        }
      }
    }

    // ---------------------------------------------------------------
    // RULE 29: Client Hints brands must contain browser name
    // ---------------------------------------------------------------
    if (profile.clientHints && profile.clientHints.fullVersionList && profile.browser) {
      const brands = profile.clientHints.fullVersionList;
      const browserBrandMap = {
        'Chrome': ['Google Chrome', 'Chromium'],
        'Edge': ['Microsoft Edge', 'Chromium'],
        'Opera': ['Opera', 'Chromium'],
        'Brave': ['Brave', 'Chromium'],
        'Safari': [], // Safari doesn't send CH brands
        'Firefox': [] // Firefox doesn't send CH brands
      };
      const expectedBrands = browserBrandMap[profile.browser];
      if (expectedBrands && expectedBrands.length > 0 && Array.isArray(brands)) {
        const brandNames = brands.map(b => b.brand || b.name || b);
        const hasExpected = expectedBrands.some(eb => brandNames.some(bn => bn.includes(eb)));
        if (!hasExpected)
          errors.push(`R29: Client Hints brands [${brandNames.join(', ')}] must contain "${expectedBrands[0]}" for ${profile.browser}`);
      }
    }

    // Calculate consistency score
    const maxScore = 100;
    const errorPenalty = errors.length * 8;
    const warningPenalty = warnings.length * 2;
    const score = Math.max(0, maxScore - errorPenalty - warningPenalty);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      score
    };
  },

  /**
   * Auto-fix detectable inconsistencies in a profile
   * Priority hierarchy: OS → Browser → GPU → Screen → Everything else
   * @param {Object} profile - Profile to fix (mutated in place)
   * @returns {{fixed: string[], profile: Object}}
   */
  autoFixProfile(profile) {
    const fixed = [];

    if (!profile) return { fixed: [], profile };

    // Fix platform based on OS
    const platformMap = {
      'Windows': 'Win32', 'macOS': 'MacIntel', 'Linux': 'Linux x86_64',
      'Android': 'Linux armv8l', 'iOS': 'iPhone'
    };
    if (platformMap[profile.os] && profile.platform !== platformMap[profile.os]) {
      if (profile.os !== 'iOS' || (profile.platform !== 'iPhone' && profile.platform !== 'iPad')) {
        profile.platform = platformMap[profile.os];
        fixed.push(`Platform → ${profile.platform}`);
      }
    }

    // Fix vendor based on browser
    if (profile.browser && this.BROWSER_VENDOR_MAP[profile.browser] !== undefined) {
      const expected = this.BROWSER_VENDOR_MAP[profile.browser];
      if (profile.vendor !== expected) {
        profile.vendor = expected;
        fixed.push(`Vendor → "${expected}"`);
      }
    }

    // Fix Apple GPU on non-Apple OS (R26)
    if (profile.gpu && profile.os) {
      const isAppleGPU = /Apple\s*(GPU|M[0-9]|A[0-9])/i.test(profile.gpu) || profile.gpu.includes('Metal');
      const isAppleOS = profile.os === 'macOS' || profile.os === 'iOS';
      if (isAppleGPU && !isAppleOS) {
        const fallbackGPUs = {
          'Windows': 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)',
          'Linux': 'ANGLE (Intel, Mesa Intel(R) UHD Graphics 630 (CFL GT2), OpenGL 4.6)',
          'Android': 'Adreno (TM) 740',
        };
        profile.gpu = fallbackGPUs[profile.os] || fallbackGPUs['Windows'];
        profile.gpuVendor = profile.os === 'Android' ? 'Qualcomm' : 'Google Inc. (Intel)';
        fixed.push(`GPU → replaced Apple GPU with ${profile.os}-appropriate GPU`);
      }
    }

    // Fix Client Hints brands (R29)
    if (profile.clientHints && profile.browser) {
      const ch = profile.clientHints;
      const ver = profile.browserVersion || '136';
      const majorVer = String(ver).split('.')[0];
      const chromiumBrands = [
        { brand: 'Chromium', version: majorVer },
        { brand: 'Not;A=Brand', version: '24' }
      ];
      if (profile.browser === 'Chrome' && ch.fullVersionList) {
        const hasChrome = ch.fullVersionList.some(b => (b.brand || '').includes('Google Chrome'));
        if (!hasChrome) {
          ch.fullVersionList = [...chromiumBrands, { brand: 'Google Chrome', version: majorVer }];
          fixed.push('Client Hints brands → added Google Chrome');
        }
      } else if (profile.browser === 'Edge' && ch.fullVersionList) {
        const hasEdge = ch.fullVersionList.some(b => (b.brand || '').includes('Microsoft Edge'));
        if (!hasEdge) {
          ch.fullVersionList = [...chromiumBrands, { brand: 'Microsoft Edge', version: majorVer }];
          fixed.push('Client Hints brands → added Microsoft Edge');
        }
      }
    }

    // Fix productSub based on browser
    if (profile.browser && this.BROWSER_PRODUCTSUB_MAP[profile.browser]) {
      const expected = this.BROWSER_PRODUCTSUB_MAP[profile.browser];
      if (profile.productSub !== expected) {
        profile.productSub = expected;
        fixed.push(`productSub → ${expected}`);
      }
    }

    // Fix mobile flag
    if (['Android', 'iOS'].includes(profile.os) && !profile.mobile) {
      profile.mobile = true;
      fixed.push('mobile → true');
    }
    if (['Windows', 'Linux'].includes(profile.os) && profile.mobile) {
      profile.mobile = false;
      fixed.push('mobile → false');
    }

    // Fix touch based on mobile
    if (profile.mobile && profile.maxTouchPoints === 0) {
      profile.maxTouchPoints = 5;
      fixed.push('maxTouchPoints → 5');
    }
    if (!profile.mobile && profile.os !== 'Windows' && profile.maxTouchPoints > 0) {
      profile.maxTouchPoints = 0;
      fixed.push('maxTouchPoints → 0');
    }

    // Fix languages array
    if (profile.language && (!profile.languages || profile.languages[0] !== profile.language)) {
      const langBase = profile.language.split('-')[0];
      profile.languages = [profile.language, langBase];
      fixed.push(`languages → [${profile.languages.join(', ')}]`);
    }

    // Fix screen consistency
    if (profile.screen) {
      if (profile.screen.availWidth > profile.screen.width) {
        profile.screen.availWidth = profile.screen.width;
        fixed.push('availWidth clamped to screen width');
      }
      if (profile.screen.availHeight > profile.screen.height) {
        profile.screen.availHeight = profile.screen.height - 48;
        fixed.push('availHeight clamped');
      }
      if (profile.screen.pixelDepth !== profile.screen.colorDepth) {
        profile.screen.pixelDepth = profile.screen.colorDepth;
        fixed.push('pixelDepth synced with colorDepth');
      }
    }

    // Fix outerWidth/Height
    if (profile.viewport) {
      if (profile.outerWidth < profile.viewport.width) {
        profile.outerWidth = profile.viewport.width + 8;
        fixed.push('outerWidth fixed');
      }
      if (profile.outerHeight < profile.viewport.height) {
        profile.outerHeight = profile.viewport.height + 80;
        fixed.push('outerHeight fixed');
      }
    }

    // Fix Client Hints
    if (profile.clientHints && profile.os) {
      const platformMap2 = {
        'Windows': 'Windows', 'macOS': 'macOS', 'Linux': 'Linux',
        'Android': 'Android', 'iOS': 'iOS'
      };
      if (platformMap2[profile.os] && profile.clientHints.platform !== platformMap2[profile.os]) {
        profile.clientHints.platform = platformMap2[profile.os];
        fixed.push(`Client Hints platform → ${platformMap2[profile.os]}`);
      }
      if (profile.clientHints.mobile !== !!profile.mobile) {
        profile.clientHints.mobile = !!profile.mobile;
        fixed.push(`Client Hints mobile → ${profile.mobile}`);
      }
    }

    // Fix orientation
    if (!profile.orientation) {
      profile.orientation = profile.mobile ?
        { type: 'portrait-primary', angle: 0 } :
        { type: 'landscape-primary', angle: 0 };
      fixed.push(`orientation → ${profile.orientation.type}`);
    }

    // Remove OS-exclusive fonts from wrong OS
    if (profile.fonts && profile.os) {
      const osKey = profile.os.toLowerCase();
      let fontsCleaned = false;
      for (const [fontOs, exclusiveFonts] of Object.entries(this.OS_EXCLUSIVE_FONTS)) {
        if (fontOs === osKey || (osKey === 'macos' && fontOs === 'macos')) continue;
        for (const font of exclusiveFonts) {
          const idx = profile.fonts.indexOf(font);
          if (idx !== -1) {
            profile.fonts.splice(idx, 1);
            fontsCleaned = true;
          }
        }
      }
      if (fontsCleaned) fixed.push('Removed OS-exclusive fonts from wrong OS');
    }

    // Fix Firefox-specific
    if (profile.browser === 'Firefox') {
      if (profile.plugins && profile.plugins.length > 0) {
        profile.plugins = [];
        fixed.push('Cleared plugins for Firefox');
      }
    }

    return { fixed, profile };
  },

  /**
   * Generate a fully consistent random profile
   * @param {Object} [constraints] - Constraints to apply (e.g. { os, browser })
   * @param {string} [seed] - Optional seed for randomization
   * @param {Object} [dataSources] - Optional data sources for weighted pick
   * @returns {Object} Complete, validated, auto-fixed profile
   */
  generateRandomProfile(constraints = {}, seed = '', dataSources = {}) {
    const generator = typeof ProfileGenerator !== 'undefined' ? ProfileGenerator : (typeof self !== 'undefined' && self.ProfileGenerator ? self.ProfileGenerator : null);
    if (!generator) {
      throw new Error('ConsistencyEngine: ProfileGenerator is not loaded');
    }
    const profile = generator.generateFullProfile(constraints, seed, dataSources);
    const { profile: fixedProfile } = this.autoFixProfile(profile);
    return fixedProfile;
  }
};

// Export
if (typeof globalThis !== 'undefined') globalThis.ConsistencyEngine = ConsistencyEngine;
if (typeof self !== 'undefined') self.ConsistencyEngine = ConsistencyEngine;
