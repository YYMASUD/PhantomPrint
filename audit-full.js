const fs = require('fs');
const path = require('path');
const issues = [];
const improvements = [];

// =========================================================================
// 1. Check manifest references vs actual files
// =========================================================================
const manifest = JSON.parse(fs.readFileSync('manifest.json','utf8'));
const allWar = (manifest.web_accessible_resources || []).flatMap(r => r.resources || []);
allWar.forEach(r => {
  if (!fs.existsSync(r)) issues.push({ sev:'HIGH', file:'manifest.json', type:'MISSING_FILE', msg: r + ' listed in web_accessible_resources but does not exist' });
});
(manifest.content_scripts || []).forEach(cs => {
  (cs.js || []).forEach(f => {
    if (!fs.existsSync(f)) issues.push({ sev:'HIGH', file:'manifest.json', type:'MISSING_CS', msg: f + ' listed in content_scripts but not found' });
  });
});
const swPath = manifest.background && manifest.background.service_worker;
if (swPath && !fs.existsSync(swPath)) issues.push({ sev:'HIGH', file:'manifest.json', type:'MISSING_SW', msg: 'Service worker file not found: ' + swPath });

// =========================================================================
// 2. Options dashboard - check new module tabs are present
// =========================================================================
const optHtml = fs.readFileSync('options/options.html','utf8').toLowerCase();
const optJs = fs.readFileSync('options/options.js','utf8').toLowerCase();

const requiredOptTabs = [
  ['cookie', 'Cookie Manager tab'],
  ['tracker', 'Tracker Blocker tab'],
  ['network', 'Network Interceptor tab'],
  ['security', 'Security tab'],
  ['sync', 'Cloud Sync tab'],
  ['import', 'Import/Export tab'],
  ['mobile', 'Mobile Emulation tab'],
  ['automation', 'RPA/Automation tab'],
  ['referrer', 'Referrer Control tab'],
  ['replay', 'Session Replay Prevention tab'],
  ['doh', 'DNS-over-HTTPS tab'],
];
requiredOptTabs.forEach(([keyword, label]) => {
  if (!optHtml.includes(keyword) && !optJs.includes(keyword)) {
    issues.push({ sev:'HIGH', file:'options/options.html+js', type:'MISSING_TAB', msg: label + ' missing from dashboard' });
  }
});

// =========================================================================
// 3. Popup - check new module access buttons
// =========================================================================
const popupHtml = fs.readFileSync('popup/popup.html','utf8').toLowerCase();
const popupJs = fs.readFileSync('popup/popup.js','utf8').toLowerCase();

const requiredPopupFeatures = [
  ['cookie', 'Cookie Manager shortcut'],
  ['tracker', 'Tracker Blocker toggle'],
  ['replay', 'Session Replay toggle'],
];
requiredPopupFeatures.forEach(([keyword, label]) => {
  if (!popupHtml.includes(keyword) && !popupJs.includes(keyword)) {
    improvements.push({ sev:'MED', file:'popup', type:'MISSING_FEATURE', msg: label + ' not accessible from popup' });
  }
});

// =========================================================================
// 4. Service worker - new module initialization on startup
// =========================================================================
const sw = fs.readFileSync('background/service-worker.js','utf8');
if (!sw.includes('trackerInit') && !sw.includes("'tracker-blocker'")) {
  issues.push({ sev:'MED', file:'background/service-worker.js', type:'MISSING_INIT', msg: 'Tracker blocker not initialized on extension startup' });
}
if (!sw.includes('pp_autolock')) {
  issues.push({ sev:'MED', file:'background/service-worker.js', type:'MISSING_ALARM', msg: "Auto-lock alarm 'pp_autolock' has no handler in onAlarm listener" });
}
if (!sw.includes('pp_clipboard_clear')) {
  issues.push({ sev:'LOW', file:'background/service-worker.js', type:'MISSING_ALARM', msg: "Clipboard clear alarm 'pp_clipboard_clear' not handled" });
}
if (!sw.includes('phantomprint_sync') && !sw.includes('autoSync')) {
  improvements.push({ sev:'LOW', file:'background/service-worker.js', type:'MISSING_ALARM', msg: 'Cloud sync auto-alarm not registered on startup' });
}
if (!sw.includes('linkCleanerEnable') && !sw.includes('link-cleaner')) {
  issues.push({ sev:'MED', file:'background/service-worker.js', type:'MISSING_INIT', msg: 'Link Cleaner not initialized on startup (DNR rules not applied)' });
}
if (!sw.includes('replayEnable') && !sw.includes('session-replay')) {
  issues.push({ sev:'MED', file:'background/service-worker.js', type:'MISSING_INIT', msg: 'Session Replay Prevention not initialized on startup' });
}

// =========================================================================
// 5. Inject script - mobile emulation integration
// =========================================================================
const inject = fs.readFileSync('inject/main-world-inject.js','utf8');
if (!inject.includes('mobile') && !inject.includes('Mobile') && !inject.includes('__pp_mobile')) {
  issues.push({ sev:'HIGH', file:'inject/main-world-inject.js', type:'MISSING_INTEGRATION', msg: 'Mobile emulation module not integrated: applyDeviceOrientation/applyDeviceMotion not called' });
}

// Check SDP scrubbing for WebRTC
if (!inject.includes('sdp') && !inject.includes('SDP')) {
  improvements.push({ sev:'MED', file:'inject/main-world-inject.js', type:'MISSING_FEATURE', msg: 'SDP scrubbing from webrtc-control module not applied in inject script' });
}

// =========================================================================
// 6. Content script - missing features
// =========================================================================
const cs = fs.readFileSync('content/content-script.js','utf8');
if (!cs.includes('replay') && !cs.includes('Replay')) {
  improvements.push({ sev:'MED', file:'content/content-script.js', type:'MISSING_INTEGRATION', msg: 'Session replay MutationObserver interception not in content script' });
}
if (!cs.includes('mobile') && !cs.includes('Mobile')) {
  issues.push({ sev:'HIGH', file:'content/content-script.js', type:'MISSING_INTEGRATION', msg: 'Mobile emulation module not activated by content script bridge' });
}
if (!cs.includes('linkCleaner') && !cs.includes('link-cleaner') && !cs.includes('tracking')) {
  improvements.push({ sev:'LOW', file:'content/content-script.js', type:'MISSING_FEATURE', msg: 'Link Cleaner notification (badge update) not in content script' });
}

// =========================================================================
// 7. Missing popup link to cookie manager UI
// =========================================================================
if (!popupHtml.includes('cookie-manager') && !popupJs.includes('cookie-manager') && !popupJs.includes('openCookieManager')) {
  issues.push({ sev:'MED', file:'popup/popup.js', type:'MISSING_LINK', msg: '"Open Cookie Manager" button not wired up (missing chrome.runtime.sendMessage openCookieManager)' });
}

// =========================================================================
// 8. Check modules for common issues
// =========================================================================
const moduleChecks = [
  ['modules/cookie-manager.js', ['getAllCookies', 'encryptExport', 'importCookiesNetscape']],
  ['modules/tracker-blocker.js', ['initialize', 'injectCosmeticFilters', 'BUILT_IN_DOMAINS']],
  ['modules/network-interceptor.js', ['exportHAR', 'enablePrivacyRules', 'PRIVACY_RULES']],
  ['modules/security.js', ['panicWipe', 'setMasterPassword', 'checkIntegrity']],
  ['modules/cloud-sync.js', ['encryptData', 'pushToSync', 'pullFromSync']],
  ['modules/mobile-emulation.js', ['DEVICE_PROFILES', 'applyDeviceOrientation', 'applyDeviceMotion']],
  ['modules/import-export.js', ['exportGoLogin', 'importGoLogin', 'exportMultilogin']],
  ['modules/doh-client.js', ['resolve', 'isCNAMETracker', 'runLeakTest']],
  ['modules/automation-rpa.js', ['runScript', 'saveScript', 'scheduleScript']],
  ['modules/performance.js', ['getCachedProfile', 'setCachedProfile', 'getPageScanScript']],
];
moduleChecks.forEach(([file, requiredMethods]) => {
  if (!fs.existsSync(file)) { issues.push({ sev:'HIGH', file, type:'MISSING_MODULE', msg: 'Module file does not exist!' }); return; }
  const code = fs.readFileSync(file,'utf8');
  requiredMethods.forEach(method => {
    if (!code.includes(method)) {
      issues.push({ sev:'MED', file, type:'MISSING_METHOD', msg: 'Required method/property not found: ' + method });
    }
  });
});

// =========================================================================
// 9. Check for TODO/FIXME in modules
// =========================================================================
const allFiles = [];
function walk(dir) {
  fs.readdirSync(dir).forEach(f => {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory() && !f.startsWith('.') && f !== 'node_modules') walk(p);
    else if (f.endsWith('.js') || f.endsWith('.html')) allFiles.push(p);
  });
}
walk('.');
allFiles.forEach(file => {
  const code = fs.readFileSync(file,'utf8');
  const lines = code.split('\n');
  lines.forEach((line, i) => {
    if (/\bTODO\b|\bFIXME\b|\bNOT IMPLEMENTED\b/i.test(line)) {
      improvements.push({ sev:'LOW', file: file.replace('.\\',''), line: i+1, type:'TODO', msg: line.trim().substring(0,90) });
    }
  });
});

// =========================================================================
// 10. Firefox manifest completeness check
// =========================================================================
const ffManifest = JSON.parse(fs.readFileSync('manifest.firefox.json','utf8'));
if (!ffManifest.browser_specific_settings || !ffManifest.browser_specific_settings.gecko) {
  issues.push({ sev:'MED', file:'manifest.firefox.json', type:'MISSING_GECKO_ID', msg: 'Missing gecko browser_specific_settings' });
}
// Firefox doesn't support proxy permission well in MV3
if ((ffManifest.permissions||[]).includes('proxy')) {
  improvements.push({ sev:'MED', file:'manifest.firefox.json', type:'FIREFOX_COMPAT', msg: 'proxy permission has limited support in Firefox MV3 - needs polyfill or notes' });
}

// =========================================================================
// 11. Check DNR rule ID conflicts
// =========================================================================
const ruleRanges = {
  'header-rules.json': [1, 100],
  'session-replay-prevention.js (DNR 2000-2099)': [2000, 2099],
  'link-cleaner.js (DNR 3000)': [3000, 3000],
  'referrer-control.js (DNR 3100-3103)': [3100, 3103],
  'webrtc-control.js (DNR 3200-3220)': [3200, 3220],
  'network-interceptor.js (DNR 4000-4999)': [4000, 4999],
  'tracker-blocker.js (DNR 5000-5999)': [5000, 5999],
};
console.log('DNR Rule ID Ranges (checking for conflicts):');
Object.entries(ruleRanges).forEach(([name, [start, end]]) => {
  console.log('  ' + name + ': ' + start + ' - ' + end);
});
// Check no overlaps
const ranges = Object.values(ruleRanges);
for (let i = 0; i < ranges.length; i++) {
  for (let j = i+1; j < ranges.length; j++) {
    const [a1,a2] = ranges[i], [b1,b2] = ranges[j];
    if (a1 <= b2 && b1 <= a2) {
      issues.push({ sev:'HIGH', file:'DNR rules', type:'RULE_CONFLICT', msg: 'Rule ID overlap: ' + JSON.stringify(ranges[i]) + ' vs ' + JSON.stringify(ranges[j]) });
    }
  }
}

// =========================================================================
// 12. Check popup score calculation
// =========================================================================
if (!popupJs.includes('protectionScore') && !popupJs.includes('score')) {
  improvements.push({ sev:'LOW', file:'popup/popup.js', type:'FEATURE', msg: 'Protection score not updated for new modules (tracker blocker, replay prevention etc.)' });
}

// =========================================================================
// OUTPUT
// =========================================================================
console.log('\n\n=== PHANTOMPRINT FULL AUDIT REPORT ===\n');
console.log('Total Issues:', issues.length);
console.log('Total Improvement Opportunities:', improvements.length);
console.log('');

const sevOrder = { HIGH:0, MED:1, LOW:2 };
const sorted = [...issues].sort((a,b) => sevOrder[a.sev]-sevOrder[b.sev]);

console.log('--- ISSUES (must fix) ---');
sorted.forEach((i, n) => {
  const sev = i.sev === 'HIGH' ? '🔴' : i.sev === 'MED' ? '🟡' : '🔵';
  console.log(sev + ' [' + i.type + '] ' + i.file + (i.line?' L'+i.line:'') + ': ' + i.msg);
});

console.log('\n--- IMPROVEMENT OPPORTUNITIES ---');
improvements.sort((a,b) => sevOrder[a.sev]-sevOrder[b.sev]).forEach((i, n) => {
  const sev = i.sev === 'HIGH' ? '🔴' : i.sev === 'MED' ? '🟡' : '🔵';
  console.log(sev + ' [' + i.type + '] ' + i.file + (i.line?' L'+i.line:'') + ': ' + i.msg);
});
