// PhantomPrint v4.0 — Fingerprint Profile Generator
// Used by popup and options page to generate new profiles

const FingerprintGenerator = (function() {
  'use strict';

  // This module runs in extension context (popup/options)
  // It communicates with the background service worker

  async function generateProfile(preset) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { action: 'randomizeAll', preset: preset || 'Random' },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(response);
          }
        }
      );
    });
  }

  async function getState() {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'getState' }, (response) => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(response);
      });
    });
  }

  async function setState(data) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'setState', data }, (response) => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(response);
      });
    });
  }

  return { generateProfile, getState, setState };
})();

if (typeof module !== 'undefined') module.exports = FingerprintGenerator;
