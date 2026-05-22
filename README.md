# PhantomPrint - Advanced Anti-Fingerprinting Browser Extension

PhantomPrint is a production-ready Manifest V3 browser extension that spoofs, randomizes, and protects against **all known browser fingerprinting techniques** across 20+ categories and 200+ parameters.

## Features

- **Complete Fingerprint Spoofing**: Navigator, Screen, Canvas, WebGL, Audio, WebRTC, Fonts, Timing, and more
- **Consistency Engine**: All spoofed values are internally consistent (OS ↔ UA ↔ GPU ↔ Fonts ↔ Screen)
- **Cross-Site Unlinkability**: Different fingerprint per domain using deterministic per-site seeding
- **Anti-Detection**: Spoofed functions return `[native code]`, proper prototype chains, non-configurable properties
- **Profile Management**: Save/load/import/export fingerprint profiles with 5 built-in presets
- **Whitelist System**: Disable spoofing for trusted sites
- **Modern UI**: Clean dashboard with category toggles, protection score, and statistics

## Supported Browsers

- Google Chrome (MV3)
- Microsoft Edge (MV3)
- Brave Browser (MV3)
- Firefox (with MV3 support)

## Installation

### Chrome / Edge / Brave

1. Open `chrome://extensions/` (or `edge://extensions/` or `brave://extensions/`)
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select the `PhantomPrint` folder
5. The extension icon will appear in your toolbar

### Firefox

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select the `manifest.json` file from the `PhantomPrint` folder

> **Note**: For Firefox, you may need to replace icon PNG files with actual images. The SVG icon is provided at `icons/icon.svg`.

## Usage

### Quick Start

1. Click the PhantomPrint icon in your toolbar
2. The extension is **active by default** with all categories enabled
3. Click **Randomize All** to generate a new fingerprint
4. Use category toggles to enable/disable specific protections

### Dashboard

- **Protection Score**: Shows percentage of categories enabled (0-100%)
- **Fingerprint Summary**: Current spoofed browser, OS, GPU, screen, timezone
- **Quick Categories**: Toggle individual protection modules

### Full Settings (Options Page)

Access via the gear icon or right-click → Options:

- **Categories**: Fine-grained control over 16 fingerprinting categories
- **Profiles**: Save/load/delete fingerprint profiles, import/export as JSON
- **Whitelist**: Add sites where spoofing should be disabled
- **Randomization**: Control when fingerprints change (per-page, per-session, hourly, manual)
- **Logs**: View which sites attempted fingerprinting

### Test Page

Click **Test Page** in the popup to open a built-in fingerprint verification page showing all current spoofed values side by side.

## Architecture

```
PhantomPrint/
├── manifest.json              # MV3 manifest with permissions
├── background/
│   └── service-worker.js      # State management, header rules, messaging
├── content/
│   └── content-script.js      # Bridge between extension and page context
├── inject/
│   ├── main-world-inject.js   # Core spoofing (runs BEFORE page scripts)
│   ├── prng.js                # Seeded PRNG (xoshiro128**)
│   ├── consistency-engine.js  # Profile generation with full consistency
│   ├── profile-database.js    # Built-in device profiles
│   ├── navigator-spoof.js     # Navigator/browser property spoofing
│   ├── screen-spoof.js        # Screen/display/matchMedia spoofing
│   ├── canvas-spoof.js        # Canvas fingerprint noise injection
│   ├── webgl-spoof.js         # WebGL parameter and renderer spoofing
│   ├── audio-spoof.js         # AudioContext fingerprint protection
│   ├── webrtc-spoof.js        # WebRTC IP leak prevention
│   ├── font-spoof.js          # Font enumeration restriction
│   ├── timing-spoof.js        # Timing precision reduction & timezone
│   ├── behavior-spoof.js      # Mouse/keyboard/scroll noise
│   ├── media-spoof.js         # Media capabilities & codec spoofing
│   └── storage-spoof.js       # Storage/privacy/incognito protection
├── popup/                     # Extension popup UI
├── options/                   # Full settings page
├── test/                      # Built-in fingerprint test page
├── data/                      # Device profiles, GPU, font, timezone databases
├── rules/                     # DeclarativeNetRequest header rules
├── lib/                       # MurmurHash3 library
└── icons/                     # Extension icons
```

## How It Works

### Deterministic Per-Site Fingerprinting

PhantomPrint uses a **seeded PRNG** (xoshiro128** algorithm) to generate deterministic fingerprints:

1. A **session seed** is generated on browser startup
2. For each site, the seed is combined with the domain name to create a **site-specific seed**
3. This seed drives all random choices (OS, browser, GPU, screen, etc.)
4. Same site + same session = same fingerprint (prevents detection via inconsistency)
5. Different sites = different fingerprints (prevents cross-site linking)

### Anti-Detection Measures

- Overridden functions return `function name() { [native code] }` via toString()
- Properties are defined with matching configurability/enumerability of originals
- Prototype chains are preserved
- Canvas noise is subtle (±1-2 pixel values) and deterministic
- WebGL returns realistic parameter combinations from real-world devices
- No suspicious empty arrays or blocked APIs (plugins, WebGL still "work")

### Consistency Rules

The Consistency Engine ensures:
- OS ↔ User-Agent ↔ Platform ↔ Client Hints match
- GPU ↔ WebGL vendor/renderer ↔ OS match (no Apple GPU on Windows)
- Screen ↔ Viewport ↔ DPR are realistic combinations
- Timezone ↔ Locale ↔ Language match geographically
- Touch ↔ Device type ↔ MaxTouchPoints ↔ Screen size match
- Font list ↔ OS (Windows fonts for Windows UA, etc.)
- Plugin list ↔ Browser (Chrome plugins for Chrome UA)
- All values consistent across iframes

## Categories Covered

| # | Category | Parameters |
|---|----------|-----------|
| 1 | Navigator & Browser | 16 |
| 2 | Screen & Display | 19 |
| 3 | Hardware | 10 |
| 4 | Network & Connection | 4 |
| 5 | Location & Timezone | 5 |
| 6 | Canvas Fingerprinting | 7 |
| 7 | WebGL Fingerprinting | 31 |
| 8 | AudioContext | 13 |
| 9 | WebRTC | 4 |
| 10 | Font Fingerprinting | 4 |
| 11 | Plugins & Extensions | 3 |
| 12 | Storage & Cookies | 6 |
| 13 | HTTP Headers | 18 |
| 14 | Behavior Tracking | 9 |
| 15 | Media Capabilities | 7 |
| 16 | Browser APIs | Feature detection consistency |
| 17 | CSS Features | matchMedia, CSS.supports |
| 18 | Privacy & Security | Incognito, permissions |
| 19 | Performance & Timing | 6 |
| 20 | Login Detection | 4 |

## Limitations

- **IP Address**: Cannot be spoofed at extension level. Use a VPN.
- **TLS Fingerprinting**: Limited control at extension level (JA3 hash)
- **Cross-origin iframes**: Cannot inject into cross-origin frames (browser security)
- **Web Workers**: SharedWorker/ServiceWorker spoofing has limitations

## License

MIT License

## Disclaimer

This extension is intended for **privacy protection** and **security research** purposes only. Users are responsible for complying with applicable laws and terms of service. Do not use this tool for fraud, impersonation, or any illegal activities.
