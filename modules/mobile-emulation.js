/**
 * PhantomPrint Mobile Emulation Module
 * Runs in MAIN WORLD (page context) — NO chrome.* APIs used here.
 * Called by applyAllSpoofing() to emulate mobile device characteristics.
 */

const MobileEmulation = {
  // ─── Device Profiles ──────────────────────────────────────────────────────

  DEVICE_PROFILES: [
    // ── 1. iPhone 15 Pro Max ─────────────────────────────────────────────
    {
      name:            'iPhone 15 Pro Max',
      userAgent:       'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
      platform:        'iPhone',
      vendor:          'Apple Computer, Inc.',
      productSub:      '20030107',
      screen:          { width: 430, height: 932, colorDepth: 32 },
      devicePixelRatio: 3,
      maxTouchPoints:  5,
      hardwareConcurrency: 6,
      deviceMemory:    4,
      connection:      { effectiveType: '4g', downlink: 20, rtt: 50 },
      fonts:           ['San Francisco', 'Helvetica Neue', 'Arial', 'Times New Roman', 'Courier New'],
      voices:          ['Samantha', 'Alex', 'Victoria'],
      gpu:             { vendor: 'Apple', renderer: 'Apple GPU' },
      os:              'iOS',
      osVersion:       '18.5',
      browser:         'Safari',
      browserVersion:  '18.5',
      model:           'iPhone15,3',
      clientHints: {
        brands:          [{ brand: 'Not/A)Brand', version: '8' }, { brand: 'Safari', version: '18' }],
        mobile:          true,
        platform:        'iOS',
        platformVersion: '18.5.0',
        architecture:    'arm',
        bitness:         '64',
        model:           '',
      },
      orientation: { type: 'portrait-primary', angle: 0 },
      battery:     { level: 0.82, charging: false, chargingTime: Infinity, dischargingTime: 21600 },
      audioParams: { sampleRate: 48000, maxChannelCount: 2 },
      webglParams: {
        vendor:   'Apple',
        renderer: 'Apple GPU',
        version:  'WebGL 2.0 (OpenGL ES 3.0 Metal - 71.6.3)',
      },
    },

    // ── 2. iPhone 15 ─────────────────────────────────────────────────────
    {
      name:            'iPhone 15',
      userAgent:       'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
      platform:        'iPhone',
      vendor:          'Apple Computer, Inc.',
      productSub:      '20030107',
      screen:          { width: 393, height: 852, colorDepth: 32 },
      devicePixelRatio: 3,
      maxTouchPoints:  5,
      hardwareConcurrency: 6,
      deviceMemory:    4,
      connection:      { effectiveType: '4g', downlink: 18, rtt: 55 },
      fonts:           ['San Francisco', 'Helvetica Neue', 'Arial', 'Georgia'],
      voices:          ['Samantha', 'Alex'],
      gpu:             { vendor: 'Apple', renderer: 'Apple GPU' },
      os:              'iOS',
      osVersion:       '18.5',
      browser:         'Safari',
      browserVersion:  '18.5',
      model:           'iPhone15,2',
      clientHints: {
        brands:          [{ brand: 'Not/A)Brand', version: '8' }, { brand: 'Safari', version: '18' }],
        mobile:          true,
        platform:        'iOS',
        platformVersion: '18.5.0',
        architecture:    'arm',
        bitness:         '64',
        model:           '',
      },
      orientation: { type: 'portrait-primary', angle: 0 },
      battery:     { level: 0.71, charging: true, chargingTime: 3600, dischargingTime: Infinity },
      audioParams: { sampleRate: 48000, maxChannelCount: 2 },
      webglParams: {
        vendor:   'Apple',
        renderer: 'Apple GPU',
        version:  'WebGL 2.0 (OpenGL ES 3.0 Metal - 71.6.3)',
      },
    },

    // ── 3. iPhone 14 ─────────────────────────────────────────────────────
    {
      name:            'iPhone 14',
      userAgent:       'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
      platform:        'iPhone',
      vendor:          'Apple Computer, Inc.',
      productSub:      '20030107',
      screen:          { width: 390, height: 844, colorDepth: 32 },
      devicePixelRatio: 3,
      maxTouchPoints:  5,
      hardwareConcurrency: 6,
      deviceMemory:    4,
      connection:      { effectiveType: '4g', downlink: 15, rtt: 60 },
      fonts:           ['San Francisco', 'Helvetica Neue', 'Arial', 'Times New Roman'],
      voices:          ['Samantha', 'Alex'],
      gpu:             { vendor: 'Apple', renderer: 'Apple GPU' },
      os:              'iOS',
      osVersion:       '17.6',
      browser:         'Safari',
      browserVersion:  '17.6',
      model:           'iPhone14,5',
      clientHints: {
        brands:          [{ brand: 'Not/A)Brand', version: '8' }, { brand: 'Safari', version: '17' }],
        mobile:          true,
        platform:        'iOS',
        platformVersion: '17.6.0',
        architecture:    'arm',
        bitness:         '64',
        model:           '',
      },
      orientation: { type: 'portrait-primary', angle: 0 },
      battery:     { level: 0.65, charging: false, chargingTime: Infinity, dischargingTime: 18000 },
      audioParams: { sampleRate: 44100, maxChannelCount: 2 },
      webglParams: {
        vendor:   'Apple',
        renderer: 'Apple GPU',
        version:  'WebGL 2.0 (OpenGL ES 3.0 Metal - 68.3.4)',
      },
    },

    // ── 4. Samsung Galaxy S24 Ultra ───────────────────────────────────────
    {
      name:            'Samsung Galaxy S24 Ultra',
      userAgent:       'Mozilla/5.0 (Linux; Android 15; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.7103.60 Mobile Safari/537.36',
      platform:        'Linux armv8l',
      vendor:          'Google Inc.',
      productSub:      '20030107',
      screen:          { width: 412, height: 915, colorDepth: 32 },
      devicePixelRatio: 3.088,
      maxTouchPoints:  10,
      hardwareConcurrency: 12,
      deviceMemory:    12,
      connection:      { effectiveType: '4g', downlink: 25, rtt: 40 },
      fonts:           ['Roboto', 'Samsung One', 'Noto Sans', 'Arial', 'Sans-serif'],
      voices:          ['Google US English', 'Google UK English Female'],
      gpu:             { vendor: 'Qualcomm', renderer: 'Adreno (TM) 750' },
      os:              'Android',
      osVersion:       '15',
      browser:         'Chrome',
      browserVersion:  '136',
      model:           'SM-S928B',
      clientHints: {
        brands:          [
          { brand: 'Chromium', version: '136' },
          { brand: 'Google Chrome', version: '136' },
          { brand: 'Not.A/Brand', version: '99' },
        ],
        mobile:          true,
        platform:        'Android',
        platformVersion: '15',
        architecture:    'arm',
        bitness:         '64',
        model:           'SM-S928B',
      },
      orientation: { type: 'portrait-primary', angle: 0 },
      battery:     { level: 0.90, charging: false, chargingTime: Infinity, dischargingTime: 28800 },
      audioParams: { sampleRate: 48000, maxChannelCount: 2 },
      webglParams: {
        vendor:   'Qualcomm',
        renderer: 'Adreno (TM) 750',
        version:  'WebGL 2.0 (OpenGL ES 3.1)',
      },
    },

    // ── 5. Samsung Galaxy S23 ─────────────────────────────────────────────
    {
      name:            'Samsung Galaxy S23',
      userAgent:       'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.7049.111 Mobile Safari/537.36',
      platform:        'Linux armv8l',
      vendor:          'Google Inc.',
      productSub:      '20030107',
      screen:          { width: 393, height: 851, colorDepth: 32 },
      devicePixelRatio: 2.625,
      maxTouchPoints:  10,
      hardwareConcurrency: 8,
      deviceMemory:    8,
      connection:      { effectiveType: '4g', downlink: 22, rtt: 45 },
      fonts:           ['Roboto', 'Samsung One', 'Noto Sans', 'Arial'],
      voices:          ['Google US English', 'Google Korean'],
      gpu:             { vendor: 'Qualcomm', renderer: 'Adreno (TM) 740' },
      os:              'Android',
      osVersion:       '14',
      browser:         'Chrome',
      browserVersion:  '135',
      model:           'SM-S911B',
      clientHints: {
        brands:          [
          { brand: 'Chromium', version: '135' },
          { brand: 'Google Chrome', version: '135' },
          { brand: 'Not.A/Brand', version: '99' },
        ],
        mobile:          true,
        platform:        'Android',
        platformVersion: '14',
        architecture:    'arm',
        bitness:         '64',
        model:           'SM-S911B',
      },
      orientation: { type: 'portrait-primary', angle: 0 },
      battery:     { level: 0.55, charging: true, chargingTime: 4200, dischargingTime: Infinity },
      audioParams: { sampleRate: 48000, maxChannelCount: 2 },
      webglParams: {
        vendor:   'Qualcomm',
        renderer: 'Adreno (TM) 740',
        version:  'WebGL 2.0 (OpenGL ES 3.1)',
      },
    },

    // ── 6. Samsung Galaxy A54 ─────────────────────────────────────────────
    {
      name:            'Samsung Galaxy A54',
      userAgent:       'Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.6998.166 Mobile Safari/537.36',
      platform:        'Linux armv8l',
      vendor:          'Google Inc.',
      productSub:      '20030107',
      screen:          { width: 360, height: 800, colorDepth: 32 },
      devicePixelRatio: 2,
      maxTouchPoints:  10,
      hardwareConcurrency: 8,
      deviceMemory:    6,
      connection:      { effectiveType: '4g', downlink: 12, rtt: 70 },
      fonts:           ['Roboto', 'Noto Sans', 'Arial', 'Sans-serif'],
      voices:          ['Google US English'],
      gpu:             { vendor: 'ARM', renderer: 'Mali-G68 MC4' },
      os:              'Android',
      osVersion:       '14',
      browser:         'Chrome',
      browserVersion:  '134',
      model:           'SM-A546B',
      clientHints: {
        brands:          [
          { brand: 'Chromium', version: '134' },
          { brand: 'Google Chrome', version: '134' },
          { brand: 'Not.A/Brand', version: '99' },
        ],
        mobile:          true,
        platform:        'Android',
        platformVersion: '14',
        architecture:    'arm',
        bitness:         '64',
        model:           'SM-A546B',
      },
      orientation: { type: 'portrait-primary', angle: 0 },
      battery:     { level: 0.78, charging: false, chargingTime: Infinity, dischargingTime: 32400 },
      audioParams: { sampleRate: 44100, maxChannelCount: 2 },
      webglParams: {
        vendor:   'ARM',
        renderer: 'Mali-G68 MC4',
        version:  'WebGL 2.0 (OpenGL ES 3.0)',
      },
    },

    // ── 7. Google Pixel 9 Pro ─────────────────────────────────────────────
    {
      name:            'Google Pixel 9 Pro',
      userAgent:       'Mozilla/5.0 (Linux; Android 15; Pixel 9 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.7103.60 Mobile Safari/537.36',
      platform:        'Linux armv8l',
      vendor:          'Google Inc.',
      productSub:      '20030107',
      screen:          { width: 412, height: 915, colorDepth: 32 },
      devicePixelRatio: 2.625,
      maxTouchPoints:  10,
      hardwareConcurrency: 9,
      deviceMemory:    12,
      connection:      { effectiveType: '4g', downlink: 30, rtt: 35 },
      fonts:           ['Roboto', 'Google Sans', 'Noto Sans', 'Arial'],
      voices:          ['Google US English', 'Google UK English Male'],
      gpu:             { vendor: 'Google', renderer: 'Mali-G715' },
      os:              'Android',
      osVersion:       '15',
      browser:         'Chrome',
      browserVersion:  '136',
      model:           'Pixel 9 Pro',
      clientHints: {
        brands:          [
          { brand: 'Chromium', version: '136' },
          { brand: 'Google Chrome', version: '136' },
          { brand: 'Not.A/Brand', version: '99' },
        ],
        mobile:          true,
        platform:        'Android',
        platformVersion: '15',
        architecture:    'arm',
        bitness:         '64',
        model:           'Pixel 9 Pro',
      },
      orientation: { type: 'portrait-primary', angle: 0 },
      battery:     { level: 0.88, charging: false, chargingTime: Infinity, dischargingTime: 25200 },
      audioParams: { sampleRate: 48000, maxChannelCount: 2 },
      webglParams: {
        vendor:   'Google',
        renderer: 'Immortalis-G715',
        version:  'WebGL 2.0 (OpenGL ES 3.1)',
      },
    },

    // ── 8. Google Pixel 8 ─────────────────────────────────────────────────
    {
      name:            'Google Pixel 8',
      userAgent:       'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.6998.166 Mobile Safari/537.36',
      platform:        'Linux armv8l',
      vendor:          'Google Inc.',
      productSub:      '20030107',
      screen:          { width: 393, height: 851, colorDepth: 32 },
      devicePixelRatio: 2.75,
      maxTouchPoints:  10,
      hardwareConcurrency: 8,
      deviceMemory:    8,
      connection:      { effectiveType: '4g', downlink: 20, rtt: 50 },
      fonts:           ['Roboto', 'Google Sans', 'Noto Sans', 'Arial'],
      voices:          ['Google US English', 'Google UK English Female'],
      gpu:             { vendor: 'Google', renderer: 'Immortalis-G715' },
      os:              'Android',
      osVersion:       '14',
      browser:         'Chrome',
      browserVersion:  '134',
      model:           'Pixel 8',
      clientHints: {
        brands:          [
          { brand: 'Chromium', version: '134' },
          { brand: 'Google Chrome', version: '134' },
          { brand: 'Not.A/Brand', version: '99' },
        ],
        mobile:          true,
        platform:        'Android',
        platformVersion: '14',
        architecture:    'arm',
        bitness:         '64',
        model:           'Pixel 8',
      },
      orientation: { type: 'portrait-primary', angle: 0 },
      battery:     { level: 0.62, charging: false, chargingTime: Infinity, dischargingTime: 19800 },
      audioParams: { sampleRate: 48000, maxChannelCount: 2 },
      webglParams: {
        vendor:   'Google',
        renderer: 'Immortalis-G715',
        version:  'WebGL 2.0 (OpenGL ES 3.1)',
      },
    },

    // ── 9. Xiaomi 14 ──────────────────────────────────────────────────────
    {
      name:            'Xiaomi 14',
      userAgent:       'Mozilla/5.0 (Linux; Android 14; 23127PN0CG) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.7049.111 Mobile Safari/537.36',
      platform:        'Linux armv8l',
      vendor:          'Google Inc.',
      productSub:      '20030107',
      screen:          { width: 393, height: 851, colorDepth: 32 },
      devicePixelRatio: 3,
      maxTouchPoints:  10,
      hardwareConcurrency: 8,
      deviceMemory:    12,
      connection:      { effectiveType: '4g', downlink: 28, rtt: 38 },
      fonts:           ['Roboto', 'MiSans', 'Noto Sans', 'Arial'],
      voices:          ['Google US English', 'Google 普通话（中国大陆）'],
      gpu:             { vendor: 'Qualcomm', renderer: 'Adreno (TM) 750' },
      os:              'Android',
      osVersion:       '14',
      browser:         'Chrome',
      browserVersion:  '135',
      model:           '23127PN0CG',
      clientHints: {
        brands:          [
          { brand: 'Chromium', version: '135' },
          { brand: 'Google Chrome', version: '135' },
          { brand: 'Not.A/Brand', version: '99' },
        ],
        mobile:          true,
        platform:        'Android',
        platformVersion: '14',
        architecture:    'arm',
        bitness:         '64',
        model:           '23127PN0CG',
      },
      orientation: { type: 'portrait-primary', angle: 0 },
      battery:     { level: 0.95, charging: true, chargingTime: 1800, dischargingTime: Infinity },
      audioParams: { sampleRate: 48000, maxChannelCount: 2 },
      webglParams: {
        vendor:   'Qualcomm',
        renderer: 'Adreno (TM) 750',
        version:  'WebGL 2.0 (OpenGL ES 3.1)',
      },
    },

    // ── 10. OnePlus 12 ────────────────────────────────────────────────────
    {
      name:            'OnePlus 12',
      userAgent:       'Mozilla/5.0 (Linux; Android 14; CPH2581) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.6998.166 Mobile Safari/537.36',
      platform:        'Linux armv8l',
      vendor:          'Google Inc.',
      productSub:      '20030107',
      screen:          { width: 412, height: 919, colorDepth: 32 },
      devicePixelRatio: 3,
      maxTouchPoints:  10,
      hardwareConcurrency: 8,
      deviceMemory:    12,
      connection:      { effectiveType: '4g', downlink: 24, rtt: 42 },
      fonts:           ['Roboto', 'OnePlus Sans', 'Noto Sans', 'Arial'],
      voices:          ['Google US English'],
      gpu:             { vendor: 'Qualcomm', renderer: 'Adreno (TM) 750' },
      os:              'Android',
      osVersion:       '14',
      browser:         'Chrome',
      browserVersion:  '134',
      model:           'CPH2581',
      clientHints: {
        brands:          [
          { brand: 'Chromium', version: '134' },
          { brand: 'Google Chrome', version: '134' },
          { brand: 'Not.A/Brand', version: '99' },
        ],
        mobile:          true,
        platform:        'Android',
        platformVersion: '14',
        architecture:    'arm',
        bitness:         '64',
        model:           'CPH2581',
      },
      orientation: { type: 'portrait-primary', angle: 0 },
      battery:     { level: 0.74, charging: false, chargingTime: Infinity, dischargingTime: 24000 },
      audioParams: { sampleRate: 48000, maxChannelCount: 2 },
      webglParams: {
        vendor:   'Qualcomm',
        renderer: 'Adreno (TM) 750',
        version:  'WebGL 2.0 (OpenGL ES 3.1)',
      },
    },

    // ── 11. iPad Pro 12.9" M4 ─────────────────────────────────────────────
    {
      name:            'iPad Pro 12.9" M4',
      userAgent:       'Mozilla/5.0 (iPad; CPU OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1',
      platform:        'iPad',
      vendor:          'Apple Computer, Inc.',
      productSub:      '20030107',
      screen:          { width: 1024, height: 1366, colorDepth: 32 },
      devicePixelRatio: 2,
      maxTouchPoints:  5,
      hardwareConcurrency: 10,
      deviceMemory:    8,
      connection:      { effectiveType: '4g', downlink: 50, rtt: 30 },
      fonts:           ['San Francisco', 'Helvetica Neue', 'Arial', 'Times New Roman', 'Gill Sans'],
      voices:          ['Samantha', 'Alex', 'Siri Nicky'],
      gpu:             { vendor: 'Apple', renderer: 'Apple GPU' },
      os:              'iPadOS',
      osVersion:       '18.2',
      browser:         'Safari',
      browserVersion:  '18.2',
      model:           'iPad16,3',
      clientHints: {
        brands:          [{ brand: 'Not/A)Brand', version: '8' }, { brand: 'Safari', version: '18' }],
        mobile:          false,
        platform:        'macOS',
        platformVersion: '18.2.0',
        architecture:    'arm',
        bitness:         '64',
        model:           '',
      },
      orientation: { type: 'landscape-primary', angle: 90 },
      battery:     { level: 0.93, charging: true, chargingTime: 2400, dischargingTime: Infinity },
      audioParams: { sampleRate: 48000, maxChannelCount: 2 },
      webglParams: {
        vendor:   'Apple',
        renderer: 'Apple GPU',
        version:  'WebGL 2.0 (OpenGL ES 3.0 Metal - 71.6.3)',
      },
    },

    // ── 12. iPad Air M2 ───────────────────────────────────────────────────
    {
      name:            'iPad Air M2',
      userAgent:       'Mozilla/5.0 (iPad; CPU OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
      platform:        'iPad',
      vendor:          'Apple Computer, Inc.',
      productSub:      '20030107',
      screen:          { width: 820, height: 1180, colorDepth: 32 },
      devicePixelRatio: 2,
      maxTouchPoints:  5,
      hardwareConcurrency: 8,
      deviceMemory:    8,
      connection:      { effectiveType: '4g', downlink: 40, rtt: 35 },
      fonts:           ['San Francisco', 'Helvetica Neue', 'Arial', 'Times New Roman'],
      voices:          ['Samantha', 'Alex'],
      gpu:             { vendor: 'Apple', renderer: 'Apple GPU' },
      os:              'iPadOS',
      osVersion:       '17.6',
      browser:         'Safari',
      browserVersion:  '17.6',
      model:           'iPad14,3',
      clientHints: {
        brands:          [{ brand: 'Not/A)Brand', version: '8' }, { brand: 'Safari', version: '17' }],
        mobile:          false,
        platform:        'macOS',
        platformVersion: '17.6.0',
        architecture:    'arm',
        bitness:         '64',
        model:           '',
      },
      orientation: { type: 'landscape-primary', angle: 90 },
      battery:     { level: 0.68, charging: false, chargingTime: Infinity, dischargingTime: 36000 },
      audioParams: { sampleRate: 44100, maxChannelCount: 2 },
      webglParams: {
        vendor:   'Apple',
        renderer: 'Apple GPU',
        version:  'WebGL 2.0 (OpenGL ES 3.0 Metal - 68.3.4)',
      },
    },

    // ── 13. Samsung Galaxy Tab S9 Ultra ───────────────────────────────────
    {
      name:            'Samsung Galaxy Tab S9 Ultra',
      userAgent:       'Mozilla/5.0 (Linux; Android 14; SM-X916B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.7049.111 Safari/537.36',
      platform:        'Linux armv8l',
      vendor:          'Google Inc.',
      productSub:      '20030107',
      screen:          { width: 1600, height: 2560, colorDepth: 32 },
      devicePixelRatio: 1.875,
      maxTouchPoints:  10,
      hardwareConcurrency: 12,
      deviceMemory:    12,
      connection:      { effectiveType: '4g', downlink: 35, rtt: 30 },
      fonts:           ['Roboto', 'Samsung One', 'Noto Sans', 'Arial'],
      voices:          ['Google US English', 'Google UK English Female'],
      gpu:             { vendor: 'Qualcomm', renderer: 'Adreno (TM) 740' },
      os:              'Android',
      osVersion:       '14',
      browser:         'Chrome',
      browserVersion:  '135',
      model:           'SM-X916B',
      clientHints: {
        brands:          [
          { brand: 'Chromium', version: '135' },
          { brand: 'Google Chrome', version: '135' },
          { brand: 'Not.A/Brand', version: '99' },
        ],
        mobile:          false,
        platform:        'Android',
        platformVersion: '14',
        architecture:    'arm',
        bitness:         '64',
        model:           'SM-X916B',
      },
      orientation: { type: 'landscape-primary', angle: 90 },
      battery:     { level: 0.85, charging: false, chargingTime: Infinity, dischargingTime: 43200 },
      audioParams: { sampleRate: 48000, maxChannelCount: 2 },
      webglParams: {
        vendor:   'Qualcomm',
        renderer: 'Adreno (TM) 740',
        version:  'WebGL 2.0 (OpenGL ES 3.1)',
      },
    },
  ],

  // ─── Profile Accessors ────────────────────────────────────────────────────

  /**
   * Return a device profile by name (string) or index (number).
   * @param {string|number} nameOrIndex
   * @returns {object|null}
   */
  getProfile(nameOrIndex) {
    if (typeof nameOrIndex === 'number') {
      return this.DEVICE_PROFILES[nameOrIndex] || null;
    }
    return this.DEVICE_PROFILES.find(p => p.name === nameOrIndex) || null;
  },

  /**
   * Return a randomly-selected profile, weighted toward iPhone/Samsung (≈60%).
   * @param {{ random: () => number }} [rng]  Must expose a .random() method returning [0,1).
   * @returns {object}
   */
  getRandomProfile(rng) {
    const rand = rng ? () => rng.random() : Math.random;

    // Indices 0-4 are iPhones + S24 Ultra + S23 (popular flagships) — higher weight
    const weighted = [];
    this.DEVICE_PROFILES.forEach((p, i) => {
      const isApple   = p.os === 'iOS' || p.os === 'iPadOS';
      const isSamsung = p.name.includes('Samsung');
      const repeats   = (isApple || isSamsung) ? 3 : 1;
      for (let r = 0; r < repeats; r++) weighted.push(i);
    });

    const idx = weighted[Math.floor(rand() * weighted.length)];
    return this.DEVICE_PROFILES[idx];
  },

  // ─── Sensor Event Emulation ───────────────────────────────────────────────

  /**
   * Inject periodic DeviceOrientationEvent dispatches on window.
   * @param {Window} win
   * @param {{ random: () => number }} [rng]
   */
  applyDeviceOrientation(win, rng) {
    const rand  = rng ? () => rng.random() : Math.random;
    let alpha   = rand() * 360;
    let beta    = rand() * 5;           // 0–5 degrees (phone near flat)
    let gamma   = (rand() - 0.5) * 6;  // -3 to +3

    const dispatch = () => {
      // Add tiny sensor noise each tick
      alpha = (alpha + (rand() - 0.5) * 0.5 + 360) % 360;
      beta  = Math.max(0, Math.min(5,  beta  + (rand() - 0.5) * 0.2));
      gamma = Math.max(-3, Math.min(3, gamma + (rand() - 0.5) * 0.2));

      try {
        const evt = new DeviceOrientationEvent('deviceorientation', {
          alpha,
          beta,
          gamma,
          absolute: false,
          bubbles: false,
          cancelable: false,
        });
        win.dispatchEvent(evt);
      } catch (_) {
        // DeviceOrientationEvent constructor may not exist on all platforms
      }
    };

    const intervalId = setInterval(dispatch, 200 + rand() * 100);

    // Expose cleanup handle
    win.__pp_orientation_interval__ = intervalId;
  },

  /**
   * Inject periodic DeviceMotionEvent dispatches on window.
   * @param {Window} win
   * @param {{ random: () => number }} [rng]
   */
  applyDeviceMotion(win, rng) {
    const rand = rng ? () => rng.random() : Math.random;

    // Base gravity vector (phone held upright, Y ≈ 9.8 m/s²)
    let accX = 0, accY = 9.807, accZ = 0;
    let rotAlpha = 0, rotBeta = 0, rotGamma = 0;

    const dispatch = () => {
      accX     += (rand() - 0.5) * 0.05;
      accY      = 9.79 + rand() * 0.03;
      accZ     += (rand() - 0.5) * 0.05;
      rotAlpha += (rand() - 0.5) * 0.5;
      rotBeta  += (rand() - 0.5) * 0.3;
      rotGamma += (rand() - 0.5) * 0.2;

      try {
        const evt = new DeviceMotionEvent('devicemotion', {
          acceleration: { x: accX, y: accY - 9.807, z: accZ },
          accelerationIncludingGravity: { x: accX, y: accY, z: accZ },
          rotationRate: { alpha: rotAlpha, beta: rotBeta, gamma: rotGamma },
          interval: 16,
          bubbles: false,
          cancelable: false,
        });
        win.dispatchEvent(evt);
      } catch (_) {
        // DeviceMotionEvent constructor not available on all platforms
      }
    };

    const intervalId = setInterval(dispatch, 16 + Math.floor(rand() * 4));
    win.__pp_motion_interval__ = intervalId;
  },

  // ─── API Overrides ────────────────────────────────────────────────────────

  /**
   * Override navigator.vibrate so it silently succeeds (no real vibration).
   * @param {Navigator} nav
   */
  emulateVibration(nav) {
    try {
      Object.defineProperty(nav, 'vibrate', {
        value:        () => true,
        writable:     false,
        configurable: true,
        enumerable:   true,
      });
    } catch (_) {
      // Already locked by the browser
    }
  },

  /**
   * Ensure window.TouchEvent and window.Touch constructors exist so that
   * touch-detection code (e.g. Modernizr) works correctly in desktop Chrome.
   * @param {Window} win
   */
  emulateTouchConstructors(win) {
    if (!win.TouchEvent) {
      try {
        // Minimal stub — real construction on desktop is blocked by the browser
        // but existence check (typeof window.TouchEvent !== 'undefined') passes.
        win.TouchEvent = class TouchEvent extends UIEvent {
          constructor(type, init = {}) {
            super(type, init);
          }
        };
      } catch (_) { /* ignore */ }
    }

    if (!win.Touch) {
      try {
        win.Touch = class Touch {
          constructor(init = {}) {
            Object.assign(this, init);
          }
        };
      } catch (_) { /* ignore */ }
    }
  },
};

if (typeof window !== 'undefined') window.__pp_mobile_profiles__ = MobileEmulation;
if (typeof self   !== 'undefined') self.MobileEmulation = MobileEmulation;
