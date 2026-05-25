// PhantomPrint — Seeded PRNG (xoshiro128**)
// Provides deterministic pseudo-random sequences for session-consistent fingerprint spoofing
// This file is loaded in the main world via <script> tag

var PhantomPRNG = (function() {
  'use strict';

  class PRNG {
    constructor(seed) {
      this.state = new Uint32Array(4);
      this.initSeed(seed || Date.now());
    }

    // Initialize state from a numeric or string seed
    initSeed(s) {
      if (typeof s === 'string') s = PRNG.hashString(s);
      s = s >>> 0;
      for (let i = 0; i < 4; i++) {
        s += 0x9e3779b9;
        let t = s ^ (s >>> 16);
        t = Math.imul(t, 0x21f0aaad);
        t ^= t >>> 15;
        t = Math.imul(t, 0x735a2d97);
        t ^= t >>> 15;
        this.state[i] = t >>> 0;
      }
    }

    // xoshiro128** core
    _next() {
      const s = this.state;
      const result = (Math.imul(s[1] * 5, 1 << 7 | 1) >>> 0);
      const t = s[1] << 9;
      s[2] ^= s[0];
      s[3] ^= s[1];
      s[1] ^= s[2];
      s[0] ^= s[3];
      s[2] ^= t;
      s[3] = (s[3] << 11 | s[3] >>> 21) >>> 0;
      return result;
    }

    // Returns float in [0, 1)
    random() {
      return this._next() / 4294967296;
    }

    // Returns integer in [min, max] inclusive
    randomInt(min, max) {
      min = Math.ceil(min);
      max = Math.floor(max);
      return min + Math.floor(this.random() * (max - min + 1));
    }

    // Returns random element from array
    randomChoice(arr) {
      if (!arr || arr.length === 0) return undefined;
      return arr[Math.floor(this.random() * arr.length)];
    }

    // Returns small float noise in [-magnitude, +magnitude]
    randomNoise(magnitude) {
      return (this.random() - 0.5) * 2 * magnitude;
    }

    // Returns hex string of given length
    randomHex(length) {
      let result = '';
      const chars = '0123456789abcdef';
      for (let i = 0; i < length; i++) {
        result += chars[Math.floor(this.random() * 16)];
      }
      return result;
    }

    // Returns boolean with given probability (default 0.5)
    randomBool(probability) {
      return this.random() < (probability !== undefined ? probability : 0.5);
    }

    // Gaussian-distributed random number (Box-Muller)
    randomGaussian(mean, stddev) {
      mean = mean || 0;
      stddev = stddev || 1;
      const u1 = this.random();
      const u2 = this.random();
      const z = Math.sqrt(-2 * Math.log(u1 || 1e-10)) * Math.cos(2 * Math.PI * u2);
      return mean + z * stddev;
    }

    // Shuffle array in place (Fisher-Yates)
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }

    // Pick N random elements from array without replacement
    sample(arr, n) {
      const shuffled = this.shuffle(arr);
      return shuffled.slice(0, Math.min(n, arr.length));
    }

    // Create a sub-PRNG with a derived seed for isolated sequences
    derive(label) {
      return new PRNG(PRNG.hashString(this.state[0] + ':' + label));
    }

    // FNV-1a hash: string → uint32
    static hashString(str) {
      str = String(str);
      let h = 0x811c9dc5;
      for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
      }
      return h >>> 0;
    }

    // Deterministic hash for element consistency (same input → same output)
    hashForElement(identifier) {
      const h = PRNG.hashString(this.state[0] + ':' + identifier);
      return (h >>> 0) / 4294967296;
    }
  }

  return PRNG;
})();
