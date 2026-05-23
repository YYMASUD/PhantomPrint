/**
 * PhantomPrint — Seeded PRNG (xoshiro128**)
 * Deterministic pseudo-random number generator for consistent fingerprint generation.
 * Same seed always produces the same sequence — critical for per-site fingerprint stability.
 * @module core/prng
 */
'use strict';

class SeededPRNG {
  /**
   * @param {string|number} seed - Seed value (string will be hashed via MurmurHash3)
   */
  constructor(seed) {
    this.state = new Uint32Array(4);
    this.reseed(seed);
  }

  /**
   * MurmurHash3 (32-bit) — fast, high-quality hash for seeding
   * @param {string} key
   * @param {number} [seed=0]
   * @returns {number}
   */
  static murmurhash3(key, seed = 0) {
    let h = seed >>> 0;
    const len = key.length;
    let i = 0;
    while (i + 4 <= len) {
      let k = (key.charCodeAt(i) & 0xff) |
              ((key.charCodeAt(i + 1) & 0xff) << 8) |
              ((key.charCodeAt(i + 2) & 0xff) << 16) |
              ((key.charCodeAt(i + 3) & 0xff) << 24);
      k = Math.imul(k, 0xcc9e2d51);
      k = (k << 15) | (k >>> 17);
      k = Math.imul(k, 0x1b873593);
      h ^= k;
      h = (h << 13) | (h >>> 19);
      h = Math.imul(h, 5) + 0xe6546b64;
      i += 4;
    }
    let k = 0;
    switch (len & 3) {
      case 3: k ^= (key.charCodeAt(i + 2) & 0xff) << 16;
      case 2: k ^= (key.charCodeAt(i + 1) & 0xff) << 8;
      case 1: k ^= key.charCodeAt(i) & 0xff;
              k = Math.imul(k, 0xcc9e2d51);
              k = (k << 15) | (k >>> 17);
              k = Math.imul(k, 0x1b873593);
              h ^= k;
    }
    h ^= len;
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return h >>> 0;
  }

  /**
   * FNV-1a hash — secondary hash for seed mixing
   * @param {string} str
   * @returns {number}
   */
  static fnv1a(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  /**
   * Re-seed the PRNG with a new seed
   * @param {string|number} seed
   */
  reseed(seed) {
    const s = typeof seed === 'string' ? SeededPRNG.murmurhash3(seed) : seed >>> 0;
    // Initialize 4 state words using splitmix32
    let z = s;
    for (let i = 0; i < 4; i++) {
      z += 0x9e3779b9;
      let t = z ^ (z >>> 16);
      t = Math.imul(t, 0x21f0aaad);
      t ^= t >>> 15;
      t = Math.imul(t, 0x735a2d97);
      t ^= t >>> 15;
      this.state[i] = t >>> 0;
    }
    // Discard first 8 values to avoid seeding artifacts
    for (let i = 0; i < 8; i++) this.next();
  }

  /**
   * Generate next float in [0, 1)  — xoshiro128** algorithm
   * @returns {number}
   */
  next() {
    const s = this.state;
    const result = Math.imul(s[1] * 5, 1);
    const r = ((result << 7) | (result >>> 25)) * 9;
    const t = s[1] << 9;
    s[2] ^= s[0];
    s[3] ^= s[1];
    s[1] ^= s[2];
    s[0] ^= s[3];
    s[2] ^= t;
    s[3] = (s[3] << 11) | (s[3] >>> 21);
    return (r >>> 0) / 4294967296;
  }

  /**
   * Generate integer in [min, max] inclusive
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  nextInt(min, max) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /**
   * Generate float in [min, max)
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  nextFloat(min, max) {
    return this.next() * (max - min) + min;
  }

  /**
   * Pick random element from array
   * @param {Array} arr
   * @returns {*}
   */
  pick(arr) {
    if (!arr || arr.length === 0) return undefined;
    return arr[Math.floor(this.next() * arr.length)];
  }

  /**
   * Weighted random pick from {key: weight} object
   * @param {Object<string, number>} items
   * @returns {string}
   */
  weightedPick(items) {
    const entries = Object.entries(items).filter(([k]) => k !== 'other');
    if (entries.length === 0) return undefined;
    const total = entries.reduce((sum, [, w]) => sum + w, 0);
    let threshold = this.next() * total;
    for (const [key, weight] of entries) {
      threshold -= weight;
      if (threshold <= 0) return key;
    }
    return entries[entries.length - 1][0];
  }

  /**
   * Fisher-Yates shuffle (returns new array)
   * @param {Array} arr
   * @returns {Array}
   */
  shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /**
   * Generate random hex string of given length
   * @param {number} len
   * @returns {string}
   */
  generateHex(len) {
    let s = '';
    for (let i = 0; i < len; i++) s += Math.floor(this.next() * 16).toString(16);
    return s;
  }

  /**
   * Generate a deterministic RFC4122 v4-format UUID from PRNG bits
   * @returns {string} UUID in format xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
   */
  generateUUID() {
    const hex = this.generateHex(32);
    const y = (8 + (parseInt(hex[16], 16) & 3)).toString(16);
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-${y}${hex.slice(17,20)}-${hex.slice(20,32)}`;
  }

  /**
   * Generate boolean with given probability
   * @param {number} [probability=0.5]
   * @returns {boolean}
   */
  nextBool(probability = 0.5) {
    return this.next() < probability;
  }

  /**
   * Generate Gaussian-distributed random number (Box-Muller)
   * @param {number} [mean=0]
   * @param {number} [stddev=1]
   * @returns {number}
   */
  nextGaussian(mean = 0, stddev = 1) {
    const u1 = this.next();
    const u2 = this.next();
    const z = Math.sqrt(-2.0 * Math.log(u1 || 1e-10)) * Math.cos(2.0 * Math.PI * u2);
    return z * stddev + mean;
  }

  /**
   * Generate per-site seed for cross-site fingerprint isolation
   * @param {string} masterSeed - User's session seed
   * @param {string} domain - eTLD+1 or full hostname
   * @param {string} [profileId='default'] - Profile identifier
   * @returns {string} Deterministic seed string
   */
  static generateSiteSeed(masterSeed, domain, profileId = 'default') {
    // Extract eTLD+1 from domain
    const parts = domain.split('.');
    const etld1 = parts.length > 2 ? parts.slice(-2).join('.') : domain;
    return `${masterSeed}::${etld1}::${profileId}`;
  }

  /**
   * Create a forked PRNG with a derived seed (for sub-components)
   * @param {string} context - Context identifier (e.g., 'canvas', 'webgl', 'audio')
   * @returns {SeededPRNG}
   */
  fork(context) {
    const derivedSeed = SeededPRNG.murmurhash3(context, this.state[0]);
    return new SeededPRNG(derivedSeed);
  }
}

// Export for both module and global contexts
if (typeof globalThis !== 'undefined') globalThis.SeededPRNG = SeededPRNG;
if (typeof self !== 'undefined') self.SeededPRNG = SeededPRNG;
