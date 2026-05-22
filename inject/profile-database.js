// PhantomPrint Profile Database - Manages loading and selecting device profiles
const ProfileDatabase = (() => {
  'use strict';

  // Embedded subset of device profiles for use in MAIN world (cannot fetch from extension)
  const BUILTIN_PROFILES = [
    {"id":"win-chrome-1","os":"Windows","osVersion":"10.0","browser":"Chrome","browserVersion":"120.0.0.0","platform":"Win32","vendor":"Google Inc.","vendorSub":"","product":"Gecko","productSub":"20030107","userAgent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36","appName":"Netscape","appVersion":"5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36","screen":{"width":1920,"height":1080},"dpr":1,"gpu":"ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)","gpuVendor":"Google Inc. (NVIDIA)","memory":16,"cores":8,"touchPoints":0,"arch":"x86","bitness":"64","mobile":false},
    {"id":"win-chrome-2","os":"Windows","osVersion":"10.0","browser":"Chrome","browserVersion":"121.0.0.0","platform":"Win32","vendor":"Google Inc.","vendorSub":"","product":"Gecko","productSub":"20030107","userAgent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36","appName":"Netscape","appVersion":"5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36","screen":{"width":1366,"height":768},"dpr":1,"gpu":"ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)","gpuVendor":"Google Inc. (Intel)","memory":8,"cores":4,"touchPoints":0,"arch":"x86","bitness":"64","mobile":false},
    {"id":"win-firefox-1","os":"Windows","osVersion":"10.0","browser":"Firefox","browserVersion":"121.0","platform":"Win32","vendor":"","vendorSub":"","product":"Gecko","productSub":"20100101","userAgent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0","appName":"Netscape","appVersion":"5.0 (Windows)","screen":{"width":1920,"height":1080},"dpr":1,"gpu":"ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)","gpuVendor":"Google Inc. (NVIDIA)","memory":8,"cores":8,"touchPoints":0,"arch":"x86","bitness":"64","mobile":false},
    {"id":"mac-chrome-1","os":"macOS","osVersion":"14.2","browser":"Chrome","browserVersion":"120.0.0.0","platform":"MacIntel","vendor":"Google Inc.","vendorSub":"","product":"Gecko","productSub":"20030107","userAgent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36","appName":"Netscape","appVersion":"5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36","screen":{"width":1440,"height":900},"dpr":2,"gpu":"ANGLE (Apple, Apple M1 Pro, OpenGL 4.1)","gpuVendor":"Google Inc. (Apple)","memory":16,"cores":8,"touchPoints":0,"arch":"arm","bitness":"64","mobile":false},
    {"id":"mac-safari-1","os":"macOS","osVersion":"14.2","browser":"Safari","browserVersion":"17.2","platform":"MacIntel","vendor":"Apple Computer, Inc.","vendorSub":"","product":"Gecko","productSub":"20030107","userAgent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15","appName":"Netscape","appVersion":"5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15","screen":{"width":1440,"height":900},"dpr":2,"gpu":"Apple GPU","gpuVendor":"Apple Inc.","memory":8,"cores":8,"touchPoints":0,"arch":"arm","bitness":"64","mobile":false},
    {"id":"linux-chrome-1","os":"Linux","osVersion":"6.5","browser":"Chrome","browserVersion":"120.0.0.0","platform":"Linux x86_64","vendor":"Google Inc.","vendorSub":"","product":"Gecko","productSub":"20030107","userAgent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36","appName":"Netscape","appVersion":"5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36","screen":{"width":1920,"height":1080},"dpr":1,"gpu":"ANGLE (Mesa, Mesa Intel(R) UHD Graphics 630 (CFL GT2), OpenGL 4.6)","gpuVendor":"Google Inc. (Mesa)","memory":16,"cores":8,"touchPoints":0,"arch":"x86","bitness":"64","mobile":false},
    {"id":"linux-firefox-1","os":"Linux","osVersion":"6.5","browser":"Firefox","browserVersion":"121.0","platform":"Linux x86_64","vendor":"","vendorSub":"","product":"Gecko","productSub":"20100101","userAgent":"Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0","appName":"Netscape","appVersion":"5.0 (X11)","screen":{"width":1920,"height":1080},"dpr":1,"gpu":"Mesa Intel(R) UHD Graphics 630 (CFL GT2)","gpuVendor":"Intel","memory":8,"cores":4,"touchPoints":0,"arch":"x86","bitness":"64","mobile":false},
    {"id":"android-chrome-1","os":"Android","osVersion":"14","browser":"Chrome","browserVersion":"120.0.0.0","platform":"Linux armv8l","vendor":"Google Inc.","vendorSub":"","product":"Gecko","productSub":"20030107","userAgent":"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36","appName":"Netscape","appVersion":"5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36","screen":{"width":393,"height":851},"dpr":2.75,"gpu":"Qualcomm Adreno 740","gpuVendor":"Qualcomm","memory":8,"cores":8,"touchPoints":5,"arch":"arm","bitness":"64","mobile":true,"model":"Pixel 8"},
    {"id":"ios-safari-1","os":"iOS","osVersion":"17.2","browser":"Safari","browserVersion":"17.2","platform":"iPhone","vendor":"Apple Computer, Inc.","vendorSub":"","product":"Gecko","productSub":"20030107","userAgent":"Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1","appName":"Netscape","appVersion":"5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1","screen":{"width":390,"height":844},"dpr":3,"gpu":"Apple GPU","gpuVendor":"Apple Inc.","memory":4,"cores":6,"touchPoints":5,"arch":"arm","bitness":"64","mobile":true,"model":"iPhone"},
    {"id":"win-edge-1","os":"Windows","osVersion":"10.0","browser":"Edge","browserVersion":"120.0.0.0","platform":"Win32","vendor":"Google Inc.","vendorSub":"","product":"Gecko","productSub":"20030107","userAgent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0","appName":"Netscape","appVersion":"5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0","screen":{"width":1920,"height":1080},"dpr":1,"gpu":"ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 SUPER Direct3D11 vs_5_0 ps_5_0, D3D11)","gpuVendor":"Google Inc. (NVIDIA)","memory":16,"cores":8,"touchPoints":0,"arch":"x86","bitness":"64","mobile":false}
  ];

  // Named preset profiles for quick selection
  const PRESETS = {
    'Windows Chrome User': 'win-chrome-1',
    'Mac Safari User': 'mac-safari-1',
    'Linux Firefox User': 'linux-firefox-1',
    'Android Mobile User': 'android-chrome-1',
    'iPhone Safari User': 'ios-safari-1'
  };

  function getProfiles() {
    return BUILTIN_PROFILES;
  }

  function getPresets() {
    return PRESETS;
  }

  function getProfileById(id) {
    return BUILTIN_PROFILES.find(p => p.id === id) || null;
  }

  function getProfilesByOS(os) {
    return BUILTIN_PROFILES.filter(p => p.os === os);
  }

  function getProfilesByBrowser(browser) {
    return BUILTIN_PROFILES.filter(p => p.browser === browser);
  }

  return { getProfiles, getPresets, getProfileById, getProfilesByOS, getProfilesByBrowser, BUILTIN_PROFILES };
})();
