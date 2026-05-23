const fs=require('fs');

// Tabs in options
const html=fs.readFileSync('options/options.html','utf8');
const tabBtns=html.match(/data-tab="[^"]+"/g) || [];
console.log('Options tabs found:', tabBtns);

// Popup actions
const popup=fs.readFileSync('popup/popup.js','utf8');
const actions=popup.match(/action:\s*'[^']+'/g) || [];
console.log('\nPopup sendMessage actions:', actions);

// Alarm handler section in SW
const sw=fs.readFileSync('background/service-worker.js','utf8');
const alarmIdx=sw.indexOf('onAlarm.addListener');
if(alarmIdx>-1) console.log('\nAlarm handler:\n', sw.substring(alarmIdx, alarmIdx+500));

// CS first 80 lines
const cs=fs.readFileSync('content/content-script.js','utf8');
console.log('\n--- content-script.js (first 80 lines) ---');
cs.split('\n').slice(0,80).forEach((l,i)=>console.log((i+1)+': '+l));

// Inject mobile lines
const inject=fs.readFileSync('inject/main-world-inject.js','utf8');
const lines=inject.split('\n');
console.log('\n--- Inject mobile-related lines ---');
lines.forEach((l,i)=>{ if(l.toLowerCase().includes('mobile')||l.includes('__pp_mobile')||l.includes('MobileEmulation')) console.log((i+1)+': '+l); });
