// PhantomPrint Fingerprint Test Page
'use strict';

document.addEventListener('DOMContentLoaded', () => {
  runAllTests();
  document.getElementById('refreshBtn').addEventListener('click', runAllTests);
});

function runAllTests() {
  testNavigator();
  testScreen();
  testHardware();
  testWebGL();
  testCanvas();
  testAudio();
  testTimezone();
  testMedia();
  testFonts();
  testWebRTC();
  testTiming();
  testStorage();
  testMediaDevices();
  testGamepad();
  testKeyboard();
  testWebXR();
  testCSSMedia();
  testPerfTiming();
}

function createTable(id, rows) {
  const table = document.getElementById(id);
  table.innerHTML = rows.map(([key, value, status]) => {
    const cls = status === 'spoofed' ? 'spoofed' : status === 'blocked' ? 'blocked' : '';
    return `<tr class="${cls}"><td>${key}</td><td>${value}</td></tr>`;
  }).join('');
}

function testNavigator() {
  const rows = [
    ['userAgent', navigator.userAgent, 'spoofed'],
    ['appName', navigator.appName, 'spoofed'],
    ['appVersion', navigator.appVersion, 'spoofed'],
    ['platform', navigator.platform, 'spoofed'],
    ['vendor', navigator.vendor, 'spoofed'],
    ['vendorSub', navigator.vendorSub || '(empty)', 'spoofed'],
    ['product', navigator.product, 'spoofed'],
    ['productSub', navigator.productSub, 'spoofed'],
    ['language', navigator.language, 'spoofed'],
    ['languages', JSON.stringify(navigator.languages), 'spoofed'],
    ['cookieEnabled', String(navigator.cookieEnabled), ''],
    ['doNotTrack', String(navigator.doNotTrack), 'spoofed'],
    ['pdfViewerEnabled', String(navigator.pdfViewerEnabled), 'spoofed'],
    ['javaEnabled()', String(navigator.javaEnabled()), 'spoofed'],
    ['buildID', String(navigator.buildID), 'spoofed'],
    ['plugins.length', String(navigator.plugins.length), 'spoofed'],
    ['mimeTypes.length', String(navigator.mimeTypes.length), 'spoofed'],
  ];
  createTable('navigatorTable', rows);
}

function testScreen() {
  const rows = [
    ['screen.width', String(screen.width), 'spoofed'],
    ['screen.height', String(screen.height), 'spoofed'],
    ['screen.availWidth', String(screen.availWidth), 'spoofed'],
    ['screen.availHeight', String(screen.availHeight), 'spoofed'],
    ['screen.colorDepth', String(screen.colorDepth), 'spoofed'],
    ['screen.pixelDepth', String(screen.pixelDepth), 'spoofed'],
    ['devicePixelRatio', String(window.devicePixelRatio), 'spoofed'],
    ['innerWidth', String(window.innerWidth), 'spoofed'],
    ['innerHeight', String(window.innerHeight), 'spoofed'],
    ['outerWidth', String(window.outerWidth), 'spoofed'],
    ['outerHeight', String(window.outerHeight), 'spoofed'],
    ['orientation.type', screen.orientation ? screen.orientation.type : 'N/A', 'spoofed'],
    ['orientation.angle', screen.orientation ? String(screen.orientation.angle) : 'N/A', 'spoofed'],
    ['matchMedia(dark)', String(window.matchMedia('(prefers-color-scheme: dark)').matches), 'spoofed'],
    ['matchMedia(motion)', String(window.matchMedia('(prefers-reduced-motion: reduce)').matches), 'spoofed'],
  ];
  createTable('screenTable', rows);
}

function testHardware() {
  const rows = [
    ['hardwareConcurrency', String(navigator.hardwareConcurrency), 'spoofed'],
    ['deviceMemory', String(navigator.deviceMemory), 'spoofed'],
    ['maxTouchPoints', String(navigator.maxTouchPoints), 'spoofed'],
    ['ontouchstart', String('ontouchstart' in window), 'spoofed'],
    ['bluetooth', String(navigator.bluetooth), navigator.bluetooth === undefined ? 'blocked' : ''],
    ['usb', String(navigator.usb), navigator.usb === undefined ? 'blocked' : ''],
    ['hid', String(navigator.hid), navigator.hid === undefined ? 'blocked' : ''],
    ['serial', String(navigator.serial), navigator.serial === undefined ? 'blocked' : ''],
    ['connection.effectiveType', navigator.connection ? navigator.connection.effectiveType : 'blocked', 'spoofed'],
    ['connection.downlink', navigator.connection ? String(navigator.connection.downlink) : 'blocked', 'spoofed'],
    ['connection.rtt', navigator.connection ? String(navigator.connection.rtt) : 'blocked', 'spoofed'],
    ['history.length', String(window.history.length), 'spoofed'],
  ];

  // Battery
  if (navigator.getBattery) {
    navigator.getBattery().then(bat => {
      const batteryRows = [
        ['battery.level', String(bat.level), 'spoofed'],
        ['battery.charging', String(bat.charging), 'spoofed'],
      ];
      const table = document.getElementById('hardwareTable');
      batteryRows.forEach(([k, v]) => {
        table.innerHTML += `<tr class="spoofed"><td>${k}</td><td>${v}</td></tr>`;
      });
    }).catch(() => {});
  }

  createTable('hardwareTable', rows);
}

function testWebGL() {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
  if (!gl) {
    createTable('webglTable', [['WebGL', 'Not available', 'blocked']]);
    return;
  }

  const debugExt = gl.getExtension('WEBGL_debug_renderer_info');
  const vendor = debugExt ? gl.getParameter(debugExt.UNMASKED_VENDOR_WEBGL) : 'N/A';
  const renderer = debugExt ? gl.getParameter(debugExt.UNMASKED_RENDERER_WEBGL) : 'N/A';

  const rows = [
    ['Unmasked Vendor', vendor, 'spoofed'],
    ['Unmasked Renderer', renderer, 'spoofed'],
    ['MAX_TEXTURE_SIZE', String(gl.getParameter(gl.MAX_TEXTURE_SIZE)), 'spoofed'],
    ['MAX_VIEWPORT_DIMS', String(gl.getParameter(gl.MAX_VIEWPORT_DIMS)), 'spoofed'],
    ['MAX_RENDERBUFFER_SIZE', String(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)), 'spoofed'],
    ['MAX_VERTEX_ATTRIBS', String(gl.getParameter(gl.MAX_VERTEX_ATTRIBS)), 'spoofed'],
    ['MAX_VARYING_VECTORS', String(gl.getParameter(gl.MAX_VARYING_VECTORS)), 'spoofed'],
    ['DEPTH_BITS', String(gl.getParameter(gl.DEPTH_BITS)), 'spoofed'],
    ['STENCIL_BITS', String(gl.getParameter(gl.STENCIL_BITS)), 'spoofed'],
    ['ALIASED_LINE_WIDTH_RANGE', String(gl.getParameter(gl.ALIASED_LINE_WIDTH_RANGE)), 'spoofed'],
    ['Extensions', String(gl.getSupportedExtensions().length) + ' extensions', 'spoofed'],
  ];
  createTable('webglTable', rows);
}

function testCanvas() {
  const canvas = document.getElementById('testCanvas');
  const ctx = canvas.getContext('2d');

  // Draw fingerprint test pattern
  ctx.fillStyle = '#1a1a24';
  ctx.fillRect(0, 0, 280, 60);
  ctx.font = '14px Arial';
  ctx.fillStyle = '#7c3aed';
  ctx.fillText('PhantomPrint Canvas Test', 10, 25);
  ctx.font = '10px Georgia';
  ctx.fillStyle = '#06b6d4';
  ctx.fillText('abcdefghijklmnopqrstuvwxyz 0123456789', 10, 45);

  // Draw some shapes
  ctx.beginPath();
  ctx.arc(250, 30, 15, 0, Math.PI * 2);
  ctx.fillStyle = '#4ade80';
  ctx.fill();

  // Get hash
  const dataUrl = canvas.toDataURL();
  const hash = simpleHash(dataUrl);
  document.getElementById('canvasHash').textContent = hash;
}

function testAudio() {
  const rows = [];

  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    rows.push(['sampleRate', String(ctx.sampleRate), 'spoofed']);
    rows.push(['baseLatency', String(ctx.baseLatency), 'spoofed']);
    rows.push(['outputLatency', String(ctx.outputLatency), 'spoofed']);
    rows.push(['destination.maxChannelCount', String(ctx.destination.maxChannelCount), 'spoofed']);
    rows.push(['destination.channelCount', String(ctx.destination.channelCount), 'spoofed']);
    rows.push(['state', ctx.state, '']);
    ctx.close();
  } catch(e) {
    rows.push(['AudioContext', 'Error: ' + e.message, 'blocked']);
  }

  createTable('audioTable', rows);

  // Audio fingerprint test
  try {
    const offlineCtx = new OfflineAudioContext(1, 4096, 44100);
    const osc = offlineCtx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(10000, offlineCtx.currentTime);
    const comp = offlineCtx.createDynamicsCompressor();
    osc.connect(comp);
    comp.connect(offlineCtx.destination);
    osc.start(0);
    offlineCtx.startRendering().then(buffer => {
      const data = buffer.getChannelData(0);
      let sum = 0;
      for (let i = 4000; i < 4096; i++) sum += Math.abs(data[i]);
      document.getElementById('audioHash').textContent = sum.toFixed(10);
    }).catch(() => {});
  } catch(e) {
    document.getElementById('audioHash').textContent = 'Error';
  }
}

function testTimezone() {
  const rows = [
    ['getTimezoneOffset()', String(new Date().getTimezoneOffset()), 'spoofed'],
    ['Intl timezone', Intl.DateTimeFormat().resolvedOptions().timeZone, 'spoofed'],
    ['Intl locale', Intl.DateTimeFormat().resolvedOptions().locale, 'spoofed'],
    ['Date.now() (mod 10)', String(Date.now() % 10), 'spoofed'],
    ['performance.now() precision', performance.now().toString().split('.')[1]?.length + ' decimals', 'spoofed'],
    ['performance.timeOrigin', String(Math.floor(performance.timeOrigin)), 'spoofed'],
  ];
  createTable('timezoneTable', rows);
}

function testMedia() {
  const audio = document.createElement('audio');
  const rows = [
    ['canPlayType(video/mp4)', audio.canPlayType('video/mp4'), ''],
    ['canPlayType(video/webm)', audio.canPlayType('video/webm'), 'spoofed'],
    ['canPlayType(audio/ogg)', audio.canPlayType('audio/ogg'), 'spoofed'],
    ['canPlayType(audio/mpeg)', audio.canPlayType('audio/mpeg'), ''],
    ['speechSynthesis.getVoices()', '', ''],
  ];

  if (window.speechSynthesis) {
    const voices = speechSynthesis.getVoices();
    rows[4][1] = voices.length + ' voices: ' + voices.slice(0, 3).map(v => v.name).join(', ');
    rows[4][2] = 'spoofed';
  }

  createTable('mediaTable', rows);
}

function testFonts() {
  const container = document.getElementById('fontResults');
  const testFonts = [
    'Arial', 'Helvetica', 'Times New Roman', 'Courier New', 'Georgia', 'Verdana',
    'Trebuchet MS', 'Impact', 'Comic Sans MS', 'Segoe UI', 'Roboto', 'Calibri',
    'Consolas', 'Cambria', 'Helvetica Neue', 'Menlo', 'Monaco', 'Futura',
    'Liberation Sans', 'DejaVu Sans', 'Ubuntu', 'Noto Sans',
    'Papyrus', 'Wingdings', 'Symbol', 'Brush Script MT', 'Luminari'
  ];

  const baseline = document.createElement('span');
  baseline.style.cssText = 'font-family:monospace;font-size:72px;position:absolute;left:-9999px;top:-9999px';
  baseline.textContent = 'mmmmmmmmmmlli';
  document.body.appendChild(baseline);
  const baseWidth = baseline.offsetWidth;

  const results = testFonts.map(font => {
    const span = document.createElement('span');
    span.style.cssText = `font-family:'${font}',monospace;font-size:72px;position:absolute;left:-9999px;top:-9999px`;
    span.textContent = 'mmmmmmmmmmlli';
    document.body.appendChild(span);
    const detected = span.offsetWidth !== baseWidth;
    document.body.removeChild(span);
    return { font, detected };
  });

  document.body.removeChild(baseline);

  container.innerHTML = results.map(r =>
    `<span class="font-item ${r.detected ? 'detected' : 'not-detected'}">${r.font} ${r.detected ? '&#10003;' : '&#10007;'}</span>`
  ).join('');
}

function testWebRTC() {
  const rows = [
    ['RTCPeerConnection', typeof RTCPeerConnection !== 'undefined' ? 'Available' : 'Blocked', typeof RTCPeerConnection === 'undefined' ? 'blocked' : 'spoofed'],
  ];

  if (typeof RTCPeerConnection !== 'undefined') {
    try {
      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      pc.createDataChannel('test');
      pc.createOffer().then(offer => {
        pc.setLocalDescription(offer);
        // Check for IP leaks in SDP
        const hasLocalIP = /(?:10|172\.(?:1[6-9]|2\d|3[01])|192\.168)\.\d{1,3}\.\d{1,3}/.test(offer.sdp);
        rows.push(['Local IP in SDP', hasLocalIP ? 'LEAKED!' : 'Protected', hasLocalIP ? 'blocked' : 'spoofed']);
        createTable('webrtcTable', rows);
        pc.close();
      }).catch(() => {});
    } catch(e) {
      rows.push(['Error', e.message, '']);
    }
  }

  // Media devices
  if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
    navigator.mediaDevices.enumerateDevices().then(devices => {
      rows.push(['Media Devices', devices.length + ' devices', 'spoofed']);
      devices.forEach(d => {
        rows.push(['  ' + d.kind, d.deviceId.substring(0, 16) + '...', 'spoofed']);
      });
      createTable('webrtcTable', rows);
    }).catch(() => {});
  }

  createTable('webrtcTable', rows);
}

function testTiming() {
  const t1 = performance.now();
  const t2 = performance.now();
  const t3 = performance.now();

  const rows = [
    ['performance.now() #1', t1.toFixed(4), 'spoofed'],
    ['performance.now() #2', t2.toFixed(4), 'spoofed'],
    ['performance.now() #3', t3.toFixed(4), 'spoofed'],
    ['Resolution', ((t2 - t1) * 1000).toFixed(0) + ' μs', 'spoofed'],
    ['Date.now()', String(Date.now()), 'spoofed'],
    ['Date.now() mod 10', String(Date.now() % 10), Date.now() % 10 === 0 ? 'spoofed' : ''],
    ['timeOrigin', performance.timeOrigin.toFixed(2), 'spoofed'],
  ];

  if (performance.memory) {
    rows.push(['memory.jsHeapSizeLimit', String(performance.memory.jsHeapSizeLimit), 'spoofed']);
    rows.push(['memory.totalJSHeapSize', String(performance.memory.totalJSHeapSize), 'spoofed']);
  }

  createTable('timingTable', rows);
}

async function testStorage() {
  const rows = [];

  // Storage estimate
  if (navigator.storage && navigator.storage.estimate) {
    try {
      const est = await navigator.storage.estimate();
      rows.push(['storage.quota', formatBytes(est.quota), 'spoofed']);
      rows.push(['storage.usage', formatBytes(est.usage), 'spoofed']);
    } catch(e) {
      rows.push(['storage.estimate', 'Error', '']);
    }
  }

  // Permissions
  if (navigator.permissions) {
    try {
      const result = await navigator.permissions.query({ name: 'notifications' });
      rows.push(['permissions.notifications', result.state, 'spoofed']);
    } catch(e) {}
  }

  // requestFileSystem
  rows.push(['requestFileSystem', typeof window.requestFileSystem !== 'undefined' ? 'Available (spoofed)' : 'Not available', 'spoofed']);

  // IndexedDB
  if (window.indexedDB && window.indexedDB.databases) {
    try {
      const dbs = await window.indexedDB.databases();
      rows.push(['indexedDB.databases()', dbs.length + ' databases', 'spoofed']);
    } catch(e) {
      rows.push(['indexedDB.databases()', 'Blocked', 'blocked']);
    }
  }

  createTable('storageTable', rows);
}

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function formatBytes(bytes) {
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB';
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return bytes + ' B';
}

// =========================================================================
// NEW TEST: MediaDevices
// =========================================================================
async function testMediaDevices() {
  const rows = [];
  try {
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      const devices = await navigator.mediaDevices.enumerateDevices();
      rows.push(['Device count', String(devices.length), 'spoofed']);
      devices.forEach((d, i) => {
        rows.push([`Device ${i} (${d.kind})`, d.label || '(empty label)', d.label ? '' : 'blocked']);
        rows.push([`  deviceId`, d.deviceId ? d.deviceId.substring(0, 16) + '...' : '(empty)', 'spoofed']);
      });
    } else {
      rows.push(['mediaDevices', 'Not available', 'blocked']);
    }
  } catch (e) {
    rows.push(['Error', e.message, 'blocked']);
  }
  ensureTable('mediaDevicesTable', 'Media Devices');
  createTable('mediaDevicesTable', rows);
}

// =========================================================================
// NEW TEST: Gamepad
// =========================================================================
function testGamepad() {
  const rows = [];
  try {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : null;
    if (gamepads) {
      const connected = Array.from(gamepads).filter(Boolean);
      rows.push(['getGamepads()', `${connected.length} connected`, connected.length === 0 ? 'spoofed' : '']);
      connected.forEach((gp, i) => {
        rows.push([`Gamepad ${i}`, `${gp.id} (${gp.buttons.length} buttons)`, '']);
      });
    } else {
      rows.push(['getGamepads', 'null', 'blocked']);
    }
  } catch (e) {
    rows.push(['Error', e.message, 'blocked']);
  }
  ensureTable('gamepadTable', 'Gamepad API');
  createTable('gamepadTable', rows);
}

// =========================================================================
// NEW TEST: Keyboard Layout
// =========================================================================
async function testKeyboard() {
  const rows = [];
  try {
    if (navigator.keyboard && navigator.keyboard.getLayoutMap) {
      const layoutMap = await navigator.keyboard.getLayoutMap();
      rows.push(['getLayoutMap() size', String(layoutMap.size), layoutMap.size === 0 ? 'spoofed' : '']);
      if (layoutMap.size > 0) {
        let count = 0;
        layoutMap.forEach((v, k) => {
          if (count < 5) rows.push([`  Key "${k}"`, v, '']);
          count++;
        });
        if (count > 5) rows.push(['  ...', `(${count - 5} more)`, '']);
      }
    } else {
      rows.push(['keyboard API', 'Not available', '']);
    }
  } catch (e) {
    rows.push(['Error', e.message, 'blocked']);
  }
  ensureTable('keyboardTable', 'Keyboard Layout');
  createTable('keyboardTable', rows);
}

// =========================================================================
// NEW TEST: WebXR
// =========================================================================
async function testWebXR() {
  const rows = [];
  try {
    if (navigator.xr) {
      const vr = await navigator.xr.isSessionSupported('immersive-vr').catch(() => false);
      const ar = await navigator.xr.isSessionSupported('immersive-ar').catch(() => false);
      const inline = await navigator.xr.isSessionSupported('inline').catch(() => false);
      rows.push(['immersive-vr', String(vr), vr === false ? 'spoofed' : '']);
      rows.push(['immersive-ar', String(ar), ar === false ? 'spoofed' : '']);
      rows.push(['inline', String(inline), '']);
    } else {
      rows.push(['navigator.xr', 'undefined', 'spoofed']);
    }
  } catch (e) {
    rows.push(['Error', e.message, 'blocked']);
  }
  ensureTable('webxrTable', 'WebXR API');
  createTable('webxrTable', rows);
}

// =========================================================================
// NEW TEST: CSS Media Queries
// =========================================================================
function testCSSMedia() {
  const queries = [
    '(prefers-color-scheme: dark)',
    '(prefers-color-scheme: light)',
    '(prefers-reduced-motion: reduce)',
    '(prefers-contrast: high)',
    '(forced-colors: active)',
    '(pointer: coarse)',
    '(pointer: fine)',
    '(hover: hover)',
    '(hover: none)',
    '(any-pointer: coarse)',
    '(display-mode: standalone)',
    '(color-gamut: srgb)',
    '(color-gamut: p3)',
  ];
  const rows = queries.map(q => {
    const match = window.matchMedia(q).matches;
    return [q, String(match), ''];
  });
  ensureTable('cssMediaTable', 'CSS Media Queries');
  createTable('cssMediaTable', rows);
}

// =========================================================================
// NEW TEST: Performance Timing
// =========================================================================
function testPerfTiming() {
  const rows = [];
  // performance.now() precision
  const samples = [];
  for (let i = 0; i < 20; i++) samples.push(performance.now());
  const diffs = samples.slice(1).map((v, i) => v - samples[i]).filter(d => d > 0);
  const minDiff = diffs.length > 0 ? Math.min(...diffs) : 0;
  rows.push(['performance.now() precision', minDiff.toFixed(4) + ' ms', minDiff >= 0.05 ? 'spoofed' : '']);

  // Date.now() quantization
  const dateNowSamples = [];
  for (let i = 0; i < 20; i++) dateNowSamples.push(Date.now());
  const dateDiffs = dateNowSamples.slice(1).map((v, i) => v - dateNowSamples[i]).filter(d => d > 0);
  const minDateDiff = dateDiffs.length > 0 ? Math.min(...dateDiffs) : 0;
  rows.push(['Date.now() min step', minDateDiff + ' ms', minDateDiff >= 5 ? 'spoofed' : '']);

  // timeOrigin
  rows.push(['performance.timeOrigin', performance.timeOrigin.toFixed(2), 'spoofed']);

  // chrome.loadTimes
  if (window.chrome && window.chrome.loadTimes) {
    try {
      const lt = window.chrome.loadTimes();
      rows.push(['chrome.loadTimes().connectionInfo', lt.connectionInfo || '(none)', 'spoofed']);
      rows.push(['chrome.loadTimes().wasFetchedViaSpdy', String(lt.wasFetchedViaSpdy), 'spoofed']);
    } catch (e) {
      rows.push(['chrome.loadTimes', 'Error: ' + e.message, 'blocked']);
    }
  } else {
    rows.push(['chrome.loadTimes', 'Not available', '']);
  }

  // Notification.permission
  try {
    rows.push(['Notification.permission', Notification.permission, Notification.permission === 'default' ? 'spoofed' : '']);
  } catch(e) {
    rows.push(['Notification.permission', 'Error', 'blocked']);
  }

  // indexedDB.databases
  if (indexedDB.databases) {
    indexedDB.databases().then(dbs => {
      const el = document.querySelector('#perfTimingTable tr:last-child td:last-child');
      // update async
    }).catch(() => {});
    rows.push(['indexedDB.databases()', '(checking...)', 'spoofed']);
  }

  // ServiceWorker
  rows.push(['navigator.serviceWorker', typeof navigator.serviceWorker !== 'undefined' ? 'available' : 'undefined', '']);

  ensureTable('perfTimingTable', 'Performance & API Detection');
  createTable('perfTimingTable', rows);
}

// =========================================================================
// Helper: dynamically create test section if not in HTML
// =========================================================================
function ensureTable(tableId, title) {
  if (document.getElementById(tableId)) return;
  const container = document.querySelector('.test-grid') || document.querySelector('main') || document.body;
  const section = document.createElement('div');
  section.className = 'test-section glass-card';
  section.innerHTML = `<h3>${title}</h3><table class="test-table" id="${tableId}"></table>`;
  container.appendChild(section);
}
