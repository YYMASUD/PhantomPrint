# PhantomPrint v5.0

**Advanced Browser Fingerprint Protection Extension** for Chrome, Edge, and Chromium-based browsers.

PhantomPrint spoofs every major browser fingerprinting vector with realistic, internally-consistent profiles — making your browser appear as a completely different device to tracking scripts, analytics, and fingerprinting services.

---

## ✨ What's New in v5.0

- **WebGPU Spoofing** — Spoof `navigator.gpu` adapter info, device, architecture, and vendor
- **Geolocation Spoofing** — Return coordinates derived from the profile's timezone
- **CSS Media Query Spoofing** — Spoof `prefers-color-scheme`, `pointer`, `hover`, `color-gamut`, `dynamic-range`, and more
- **Permissions API Spoofing** — Spoof `navigator.permissions.query()` results per device type
- **Keyboard Layout API Spoofing** — Spoof `navigator.keyboard.getLayoutMap()` per language
- **Built-in Tracker Blocker** — Block analytics, ads, fingerprinting scripts, session replay tools, and cryptominers via `declarativeNetRequest`
- **Proxy Manager** — Configure HTTP/HTTPS/SOCKS4/SOCKS5 proxies directly from the options page
- **Profile Sessions** — Save and restore named fingerprint configurations
- **Fingerprint History** — Track which profile was used on each domain
- **Redesigned UI** — New dark-themed popup with inline notifications (no more `alert()`), module grid, and stats card
- **Redesigned Options Page** — 9-tab sidebar layout: Profile, Modules, Tracker Blocker, Proxy, Timezone, Whitelist, Sessions, History, Advanced
- **Smart Auto-Rotate** — Rotate fingerprint on timer, on new tab, or manually
- **Client Hints Sync** — `Sec-CH-UA`, `Sec-CH-UA-Mobile`, `Sec-CH-UA-Platform` headers always match the spoofed UA

---

## 🛡️ Spoofing Coverage

| Category | APIs Spoofed |
|---|---|
| **Navigator** | `userAgent`, `platform`, `hardwareConcurrency`, `deviceMemory`, `languages`, `language`, `maxTouchPoints`, `vendor`, `doNotTrack`, `cookieEnabled`, `onLine`, `pdfViewerEnabled` |
| **Screen** | `width`, `height`, `availWidth`, `availHeight`, `colorDepth`, `pixelDepth`, `devicePixelRatio`, `orientation.type`, `orientation.angle` |
| **Canvas 2D** | `toDataURL()`, `toBlob()`, `getImageData()` — deterministic per-seed noise |
| **WebGL / WebGL2** | `RENDERER`, `VENDOR`, all parameters, extensions, shader precision, `readPixels()` |
| **WebGPU** | `navigator.gpu.requestAdapter()`, adapter info (vendor, architecture, device) |
| **Audio** | `AudioContext` fingerprint, `baseLatency`, `outputLatency`, `sampleRate`, `AnalyserNode` data |
| **Fonts** | `document.fonts`, CSS font probing — OS-matched font list |
| **WebRTC** | ICE candidate IP leak prevention, `RTCPeerConnection` spoofing |
| **Geolocation** | `getCurrentPosition()`, `watchPosition()` — coordinates from timezone |
| **Timezone** | `Intl.DateTimeFormat`, `Date.getTimezoneOffset()`, `Date.prototype.toString()` |
| **Battery** | `navigator.getBattery()` — charging state, level, timing |
| **Speech** | `speechSynthesis.getVoices()` — OS-matched voice count |
| **Media Devices** | `enumerateDevices()` — camera/mic/speaker counts |
| **Timing** | `performance.now()`, `Date.now()` — sub-millisecond noise |
| **Storage** | `navigator.storage.estimate()` — quota and usage |
| **Input Events** | Mouse/touch coordinate noise |
| **Permissions** | `navigator.permissions.query()` — per device type |
| **Keyboard** | `navigator.keyboard.getLayoutMap()` — per language |
| **CSS Media** | `matchMedia()` — color scheme, pointer, hover, gamut, contrast |
| **Network Info** | `navigator.connection` type, `onchange` suppression |
| **HTTP Headers** | `User-Agent`, `Accept-Language`, `Sec-CH-UA*`, `DNT`, `Sec-GPC` |
| **Client Hints** | `navigator.userAgentData` brands, platform, mobile, architecture |
| **Element Rects** | `getBoundingClientRect()`, `getClientRects()` — sub-pixel noise |

---

## 🚀 Installation

### From Source (Developer Mode)

1. Clone or download this repository
2. Open Chrome/Edge and go to `chrome://extensions/`
3. Enable **Developer mode** (top right toggle)
4. Click **Load unpacked** and select the `PhantomPrint` folder
5. The extension icon will appear in your toolbar

### Firefox

Use `manifest.firefox.json` (rename to `manifest.json`) and load as a temporary extension via `about:debugging`.

---

## 📖 Usage

### Popup
- **Master toggle** — Enable/disable all protection
- **Profile card** — Shows current OS, GPU, screen, cores, RAM, timezone
- **Module grid** — Toggle individual spoofing modules on/off
- **🎲 New Profile** — Generate a new random fingerprint
- **🚫 Whitelist Site** — Disable spoofing for the current domain
- **📜 History** — View recent domain activity inline

### Options Page (`⚙️ Options`)

| Tab | Features |
|---|---|
| **🎭 Profile** | View current profile details, generate new profiles, set preset (Windows/macOS/Linux/Android), noise level, auto-rotate, test sites |
| **🛡️ Modules** | Enable/disable each spoofing module individually with descriptions |
| **🚫 Tracker Blocker** | Toggle block lists: EasyPrivacy, Peter Lowe, Fingerprinting Scripts, Session Replay, Cryptominers, Social Widgets |
| **🌐 Proxy** | Add HTTP/HTTPS/SOCKS4/SOCKS5 proxies, connect/disconnect, manage saved proxies |
| **🕐 Timezone** | Auto/IP/Profile/Custom timezone modes, IP location detection |
| **📋 Whitelist** | Add/remove domains from the spoofing whitelist |
| **💾 Sessions** | Save named fingerprint configurations, load/delete sessions |
| **📜 History** | View per-domain fingerprint history (last 100 entries) |
| **⚙️ Advanced** | Debug mode, export/import all settings, reset to defaults |

---

## 🔧 Profile Presets

| Preset | Description |
|---|---|
| **Random** | Any OS — Windows, macOS, Linux, or Android |
| **Windows Desktop** | Windows 10/11 with NVIDIA/AMD/Intel GPU |
| **macOS Desktop** | macOS with Apple Silicon (M1/M2/M3) or Intel |
| **Linux Desktop** | Linux x86_64 with Mesa/Intel GPU |
| **Android Mobile** | Android 14/15 with Adreno/Mali GPU |
| **Any Mobile** | Random mobile device |

---

## 🚫 Tracker Blocker Lists

| List | Blocks |
|---|---|
| **EasyPrivacy** | Google Analytics, Facebook Pixel, Mixpanel, Amplitude, Hotjar, FullStory, Clarity, Sentry, New Relic |
| **Peter Lowe's** | Amazon Ads, Criteo, AppNexus, OpenX, Taboola, Outbrain, ShareThis, TradeDoubler |
| **Fingerprinting** | FingerprintJS, iovation, ThreatMetrix, Signifyd, Sardine, Kount, Sift, Castle |
| **Session Replay** | Hotjar, FullStory, Mouseflow, LogRocket, Smartlook, Inspectlet, Glassbox, ContentSquare |
| **Cryptominers** | CoinHive, JSECoin, CryptoLoot, Minero, WebMR |
| **Social Widgets** | Twitter widgets, Pinterest, LinkedIn, VK, Disqus *(may break social features)* |

---

## 🏗️ Architecture

```
PhantomPrint/
├── manifest.json              # MV3 manifest
├── background/
│   └── service-worker.js      # Profile generation, message routing, header rules, tracker blocker
├── content/
│   └── content.js             # Injects config + spoof scripts at document_start
├── inject/
│   ├── inject.js              # Core spoofing (navigator, canvas, webgl, audio, fonts, webrtc...)
│   ├── webgpu-spoof.js        # WebGPU API spoofing
│   └── extra-spoof.js         # Geolocation, matchMedia, Permissions, Keyboard, Network
├── popup/                     # Extension popup UI
├── options/                   # Full options page (9 tabs)
├── onboarding/                # First-run onboarding
├── core/
│   ├── profile-generator.js   # Advanced profile generation engine
│   ├── consistency-engine.js  # Cross-property consistency validation
│   └── prng.js                # Seeded PRNG
├── data/                      # GPU database, UA database, font lists, timezone data
└── modules/                   # Additional feature modules
```

### How Spoofing Works

1. **Service Worker** generates a fingerprint profile and stores it in `chrome.storage.local`
2. **Content Script** reads the profile at `document_start` and injects a `<script>` config element
3. **Inject Scripts** run in the **MAIN world** (same JS context as the page), intercepting API calls before any page code runs
4. **Header Rules** via `declarativeNetRequest` modify HTTP request headers (UA, Accept-Language, Client Hints)
5. All spoofed values are **internally consistent** — the GPU matches the OS, fonts match the OS, timezone matches the language, etc.

---

## 🧪 Testing Your Protection

Use these sites to verify PhantomPrint is working:

- [BrowserLeaks](https://browserleaks.com/canvas) — Canvas, WebGL, Navigator
- [AmIUnique](https://amiunique.org/fingerprint) — Full fingerprint uniqueness
- [Cover Your Tracks (EFF)](https://coveryourtracks.eff.org/) — Tracker protection
- [PixelScan](https://pixelscan.net/) — Consistency checks
- [CreepJS](https://abrahamjuliot.github.io/creepjs/) — Advanced fingerprint analysis
- [FingerprintJS Demo](https://fingerprintjs.github.io/fingerprintjs/) — Commercial fingerprinting

---

## ⚠️ Limitations

- **Service workers** cannot be fingerprinted by content scripts (by design)
- Some sites use **server-side fingerprinting** (TLS, HTTP/2 fingerprints) which cannot be spoofed by a browser extension
- **Firefox** has some API differences; use `manifest.firefox.json`
- Spoofing is applied **per page load** — already-loaded pages need a reload

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 🤝 Contributing

Pull requests welcome! Please open an issue first to discuss major changes.

**GitHub:** https://github.com/cnmasud/PhantomPrint
