/**
 * PhantomPrint — Onboarding Wizard
 * 3-step setup flow for new users.
 */
'use strict';

(function() {
  let selectedLevel = 'balanced'; // default
  const steps = document.querySelectorAll('.step');
  const dots = document.querySelectorAll('.dot');

  function showStep(n) {
    steps.forEach(s => s.classList.remove('active'));
    dots.forEach(d => d.classList.remove('active'));
    const step = document.getElementById('step' + n);
    if (step) step.classList.add('active');
    const dot = document.querySelector(`.dot[data-step="${n}"]`);
    if (dot) dot.classList.add('active');
  }

  // Step navigation
  document.getElementById('toStep2').addEventListener('click', () => showStep(2));
  document.getElementById('backToStep1').addEventListener('click', () => showStep(1));
  document.getElementById('toStep3').addEventListener('click', async () => {
    await applyLevel(selectedLevel);
    showStep(3);
  });

  // Level card selection
  document.querySelectorAll('.level-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.level-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedLevel = card.dataset.level;
    });
  });

  // Pre-select recommended
  const recommended = document.querySelector('.level-card.recommended');
  if (recommended) recommended.classList.add('selected');

  // Apply protection level
  async function applyLevel(level) {
    const categories = {};
    const allCats = ['canvas','webgl','audio','webrtc','fonts','timezone','behavior','headers','storage','proxy'];

    if (level === 'quick') {
      // Only core 4
      ['canvas','webgl','audio','headers'].forEach(k => categories[k] = true);
      ['webrtc','fonts','timezone','behavior','storage','proxy'].forEach(k => categories[k] = false);
    } else {
      // Balanced and Maximum: all core on
      allCats.forEach(k => categories[k] = true);
    }

    // Send to service worker
    try {
      await chrome.runtime.sendMessage({ action: 'setState', data: { categories, enabled: true } });

      // Module toggles
      if (level === 'maximum') {
        await chrome.storage.local.set({
          pp_tracker_enabled: true,
          pp_replay_enabled: true,
          pp_link_cleaner_enabled: true,
          pp_referrer_mode: 'smart',
          pp_net_privacy_enabled: true
        });
        // Enable blocking modules
        await chrome.runtime.sendMessage({ action: 'trackerInit' });
        await chrome.runtime.sendMessage({ action: 'replayEnable' });
        await chrome.runtime.sendMessage({ action: 'linkCleanerEnable' });
        await chrome.runtime.sendMessage({ action: 'referrerSetMode', data: { mode: 'smart' } });
      } else if (level === 'balanced') {
        await chrome.storage.local.set({
          pp_tracker_enabled: true,
          pp_replay_enabled: false,
          pp_link_cleaner_enabled: true,
          pp_referrer_mode: 'off',
          pp_net_privacy_enabled: true
        });
        await chrome.runtime.sendMessage({ action: 'trackerInit' });
        await chrome.runtime.sendMessage({ action: 'linkCleanerEnable' });
      } else {
        await chrome.storage.local.set({
          pp_tracker_enabled: false,
          pp_replay_enabled: false,
          pp_link_cleaner_enabled: false,
          pp_referrer_mode: 'off',
          pp_net_privacy_enabled: false
        });
      }
    } catch (e) {
      console.error('Onboarding: Failed to apply settings', e);
    }
  }

  // Done buttons
  document.getElementById('openTest').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('test/fingerprint-test.html') });
    window.close();
  });

  document.getElementById('openDashboard').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });
})();
