// PhantomPrint Consistency Audit
// Checks all spoofed values for mismatches that CreepJS/PixelScan would detect
// Run: node audit-consistency.js

const fs = require('fs');
const path = require('path');

const profiles = require('./data/device-profiles.json');
let errors = 0;
let warnings = 0;

function error(msg, profile, idx) {
  errors++;
  console.error(`  [ERROR] Profile #${idx}: ${msg}`);
}

function warn(msg, profile, idx) {
  warnings++;
  if (warnings <= 30) console.warn(`  [WARN] Profile #${idx}: ${msg}`);
}

console.log('=== PhantomPrint Consistency Audit ===');
console.log(`Auditing ${profiles.length} device profiles...\n`);

profiles.forEach((p, idx) => {
  // === Rule 1: UA must contain correct browser token ===
  if (p.browser === 'Chrome' && !p.userAgent.includes('Chrome/') && !p.userAgent.includes('CriOS/')) error('UA missing Chrome/ or CriOS/ token', p, idx);
  if (p.browser === 'Firefox' && !p.userAgent.includes('Firefox/')) error('UA missing Firefox/ token', p, idx);
  if (p.browser === 'Safari' && !p.userAgent.includes('Safari/')) error('UA missing Safari/ token', p, idx);
  if (p.browser === 'Edge' && !p.userAgent.includes('Edg/')) error('UA missing Edg/ token', p, idx);

  // === Rule 2: UA must contain correct OS token ===
  if (p.os === 'Windows' && !p.userAgent.includes('Windows NT')) error('UA missing Windows NT for Windows OS', p, idx);
  if (p.os === 'macOS' && !p.userAgent.includes('Macintosh') && !p.userAgent.includes('Mac OS X')) error('UA missing Mac token for macOS', p, idx);
  if (p.os === 'Linux' && !p.mobile && !p.userAgent.includes('Linux') && !p.userAgent.includes('X11')) error('UA missing Linux token', p, idx);
  if (p.os === 'Android' && !p.userAgent.includes('Android')) error('UA missing Android token', p, idx);
  if (p.os === 'iOS' && !p.userAgent.includes('iPhone') && !p.userAgent.includes('iPad')) error('UA missing iPhone/iPad token for iOS', p, idx);

  // === Rule 3: Platform must match OS ===
  if (p.os === 'Windows' && p.platform !== 'Win32') error(`Platform "${p.platform}" doesn't match Windows`, p, idx);
  if (p.os === 'macOS' && p.platform !== 'MacIntel') error(`Platform "${p.platform}" doesn't match macOS`, p, idx);
  if (p.os === 'Linux' && !p.mobile && !p.platform.includes('Linux')) error(`Platform "${p.platform}" doesn't match Linux`, p, idx);

  // === Rule 4: Vendor must match browser ===
  if (p.browser === 'Chrome' && p.vendor !== 'Google Inc.') error(`Vendor "${p.vendor}" wrong for Chrome`, p, idx);
  if (p.browser === 'Edge' && p.vendor !== 'Google Inc.') error(`Vendor "${p.vendor}" wrong for Edge`, p, idx);
  if (p.browser === 'Firefox' && p.vendor !== '') error(`Vendor "${p.vendor}" should be empty for Firefox`, p, idx);
  if (p.browser === 'Safari' && p.vendor !== 'Apple Computer, Inc.') error(`Vendor "${p.vendor}" wrong for Safari`, p, idx);

  // === Rule 5: productSub must match browser family ===
  if ((p.browser === 'Chrome' || p.browser === 'Edge' || p.browser === 'Safari') && p.productSub !== '20030107') error(`productSub wrong for ${p.browser}`, p, idx);
  if (p.browser === 'Firefox' && p.productSub !== '20100101') error('productSub wrong for Firefox', p, idx);

  // === Rule 6: GPU must match OS (no D3D11 on Linux/Android, no Metal on Windows) ===
  if (p.gpu && p.os === 'Linux' && p.gpu.includes('Direct3D11')) error('D3D11 GPU on Linux - impossible', p, idx);
  if (p.gpu && p.os === 'Android' && p.gpu.includes('Direct3D11')) error('D3D11 GPU on Android - impossible', p, idx);
  if (p.gpu && p.os === 'Windows' && p.gpu.includes('Metal')) error('Metal GPU on Windows - impossible', p, idx);
  if (p.gpu && p.os === 'Windows' && p.gpu.includes('Apple M')) error('Apple GPU on Windows - impossible', p, idx);
  if (p.gpu && p.os === 'Linux' && p.gpu.includes('Apple M')) error('Apple GPU on Linux - impossible', p, idx);

  // === Rule 7: Touch points must match device type ===
  if (!p.mobile && p.touchPoints > 0) warn('Desktop with touch points > 0 (uncommon)', p, idx);
  if (p.mobile && p.touchPoints === 0) error('Mobile with 0 touch points', p, idx);

  // === Rule 8: DPR must be realistic for OS ===
  if (p.os === 'macOS' && p.dpr !== 2) warn('macOS with DPR != 2 (non-Retina Mac is rare)', p, idx);
  if (p.mobile && p.dpr < 2) warn('Mobile with DPR < 2 (uncommon)', p, idx);

  // === Rule 9: Screen dimensions must be realistic ===
  if (!p.mobile && p.screen.width < 1024) warn('Desktop with screen width < 1024', p, idx);
  if (p.mobile && !p.tablet && p.screen.width > 500) warn('Mobile with screen width > 500', p, idx);
  if (p.screen.availHeight > p.screen.height) error('availHeight > height', p, idx);
  if (p.screen.availWidth > p.screen.width) error('availWidth > width', p, idx);

  // === Rule 10: colorDepth and pixelDepth must match ===
  if (p.screen.colorDepth !== p.screen.pixelDepth) error('colorDepth != pixelDepth', p, idx);

  // === Rule 11: Memory must be standard value ===
  const validMem = [0.25, 0.5, 1, 2, 4, 6, 8, 16, 32, 36, 64];
  if (!validMem.includes(p.memory)) error(`Non-standard memory value: ${p.memory}`, p, idx);

  // === Rule 12: hardwareConcurrency should be even ===
  if (p.cores % 2 !== 0) warn(`Odd core count: ${p.cores}`, p, idx);

  // === Rule 13: Browser version format ===
  if ((p.browser === 'Chrome' || p.browser === 'Edge') && !p.browserVersion.match(/^\d+\.\d+\.\d+\.\d+$/)) {
    error(`Invalid Chrome/Edge version format: ${p.browserVersion}`, p, idx);
  }
  if (p.browser === 'Firefox' && !p.browserVersion.match(/^\d+\.\d+$/)) {
    error(`Invalid Firefox version format: ${p.browserVersion}`, p, idx);
  }

  // === Rule 14: iOS Safari must use WebKit 605.1.15 ===
  if (p.os === 'iOS' && p.browser === 'Safari' && !p.userAgent.includes('605.1.15')) {
    error('iOS Safari UA missing WebKit 605.1.15', p, idx);
  }

  // === Rule 15: appVersion must be consistent ===
  if (p.browser !== 'Firefox' && !p.appVersion.includes('5.0')) {
    warn('appVersion should start with 5.0 for non-Firefox', p, idx);
  }

  // === Rule 16: arch must match OS ===
  if ((p.os === 'Android' || p.os === 'iOS') && p.arch !== 'arm') error(`${p.os} should have arm arch`, p, idx);
  if (p.os === 'Windows' && p.arch !== 'x86') warn('Windows with non-x86 arch', p, idx);
  if (p.os === 'Linux' && !p.mobile && p.arch !== 'x86') warn('Desktop Linux with non-x86 arch', p, idx);

  // === Rule 17: iOS Chrome uses CriOS, not Chrome ===
  if (p.os === 'iOS' && p.browser === 'Chrome' && !p.userAgent.includes('CriOS')) {
    error('iOS Chrome must use CriOS token', p, idx);
  }

  // === Rule 18: iPad UA must use iPad, not iPhone ===
  if (p.tablet && p.platform === 'iPad' && p.userAgent.includes('iPhone')) {
    warn('iPad platform but UA says iPhone', p, idx);
  }
});

console.log(`\n=== Audit Complete ===`);
console.log(`Errors: ${errors}`);
console.log(`Warnings: ${warnings}`);
console.log(`Profiles audited: ${profiles.length}`);

if (errors > 0) {
  console.log('\nFIXES NEEDED - running auto-fix...');
  let fixed = 0;

  profiles.forEach((p, idx) => {
    // Fix mobile devices with 0 touch points
    if (p.mobile && p.touchPoints === 0) { p.touchPoints = 5; fixed++; }
    // Fix macOS DPR
    if (p.os === 'macOS' && p.dpr !== 2) { p.dpr = 2; fixed++; }
  });

  if (fixed > 0) {
    fs.writeFileSync(path.join(__dirname, 'data', 'device-profiles.json'), JSON.stringify(profiles, null, 1));
    console.log(`Auto-fixed ${fixed} issues. Re-run audit to verify.`);
  }
}

if (errors === 0) {
  console.log('\n✓ All profiles pass consistency checks!');
}
