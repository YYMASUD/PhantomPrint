// PhantomPrint WebRTC Fingerprinting Protection
// Prevents local IP leaking and spoofs media device enumeration
const WebRTCSpoof = (() => {
  'use strict';

  function apply(profile, config, prng) {
    if (!config.enabled) return;

    function makeNative(fn, name) {
      const s = `function ${name || fn.name || ''}() { [native code] }`;
      Object.defineProperty(fn, 'toString', { value: () => s, writable: false, configurable: true });
      return fn;
    }

    const mode = config.webrtcMode || 'ip_only'; // 'full_block' or 'ip_only'

    if (mode === 'full_block') {
      // Complete WebRTC removal
      try {
        Object.defineProperty(window, 'RTCPeerConnection', { value: undefined, writable: false, configurable: false });
        Object.defineProperty(window, 'webkitRTCPeerConnection', { value: undefined, writable: false, configurable: false });
        Object.defineProperty(window, 'mozRTCPeerConnection', { value: undefined, writable: false, configurable: false });
      } catch(e) {}
      return;
    }

    // IP-only mode: Allow WebRTC but strip local IP candidates
    const OrigRTCPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection;
    if (!OrigRTCPeerConnection) return;

    const origProto = OrigRTCPeerConnection.prototype;

    // Helper to sanitize ICE candidates
    function sanitizeCandidate(candidate) {
      if (!candidate || !candidate.candidate) return candidate;

      const sdp = candidate.candidate;

      // Check for local/private IPs
      const localIPRegex = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/g;
      const privateRanges = [
        /^10\./,
        /^172\.(1[6-9]|2\d|3[01])\./,
        /^192\.168\./,
        /^169\.254\./,
        /^fc00:/i,
        /^fd/i,
        /^fe80:/i
      ];

      const matches = sdp.match(localIPRegex);
      if (matches) {
        for (const ip of matches) {
          for (const range of privateRanges) {
            if (range.test(ip)) {
              // Replace private IP with mDNS placeholder
              return {
                ...candidate,
                candidate: sdp.replace(ip, '0.0.0.0'),
                address: '0.0.0.0'
              };
            }
          }
        }
      }

      // Strip srflx candidates (server reflexive - reveals public IP)
      if (sdp.includes(' srflx ')) {
        return null; // Discard this candidate
      }

      return candidate;
    }

    // Wrap RTCPeerConnection constructor
    const PhantomRTCPeerConnection = makeNative(function RTCPeerConnection(configuration, constraints) {
      // Force use of TURN only if configured
      if (config.forceTurn && configuration && configuration.iceServers) {
        configuration.iceTransportPolicy = 'relay';
      }

      const pc = new OrigRTCPeerConnection(configuration, constraints);

      // Intercept onicecandidate
      let userCallback = null;
      Object.defineProperty(pc, 'onicecandidate', {
        get: function() { return userCallback; },
        // BUG FIX: __lookupSetter__ is deprecated and throws in strict mode. Removed.
        set: function(cb) {
          userCallback = cb;
        },
        configurable: true, enumerable: true
      });

      // Override addEventListener for icecandidate
      const origAddEventListener = pc.addEventListener.bind(pc);
      const origRemoveEventListener = pc.removeEventListener.bind(pc);
      const iceCandidateListeners = new Map();

      pc.addEventListener = makeNative(function addEventListener(type, listener, options) {
        if (type === 'icecandidate') {
          const wrappedListener = function(event) {
            if (event.candidate) {
              const sanitized = sanitizeCandidate(event.candidate);
              if (sanitized === null) return; // Discard candidate
              const fakeEvent = new Event('icecandidate');
              Object.defineProperty(fakeEvent, 'candidate', { value: sanitized });
              listener.call(pc, fakeEvent);
            } else {
              listener.call(pc, event);
            }
          };
          iceCandidateListeners.set(listener, wrappedListener);
          origAddEventListener(type, wrappedListener, options);
        } else {
          origAddEventListener(type, listener, options);
        }
      }, 'addEventListener');

      pc.removeEventListener = makeNative(function removeEventListener(type, listener, options) {
        if (type === 'icecandidate' && iceCandidateListeners.has(listener)) {
          origRemoveEventListener(type, iceCandidateListeners.get(listener), options);
          iceCandidateListeners.delete(listener);
        } else {
          origRemoveEventListener(type, listener, options);
        }
      }, 'removeEventListener');

      // Intercept createOffer to optionally modify SDP
      const origCreateOffer = pc.createOffer.bind(pc);
      pc.createOffer = makeNative(function createOffer(options) {
        return origCreateOffer(options).then(function(offer) {
          // Optionally strip fingerprinting codec details
          if (config.stripSDP) {
            offer.sdp = sanitizeSDP(offer.sdp);
          }
          return offer;
        });
      }, 'createOffer');

      // Intercept createAnswer similarly
      const origCreateAnswer = pc.createAnswer.bind(pc);
      pc.createAnswer = makeNative(function createAnswer(options) {
        return origCreateAnswer(options).then(function(answer) {
          if (config.stripSDP) {
            answer.sdp = sanitizeSDP(answer.sdp);
          }
          return answer;
        });
      }, 'createAnswer');

      // Hook localDescription getter to sanitize candidates in SDP
      const origLocalDescGetter = Object.getOwnPropertyDescriptor(OrigRTCPeerConnection.prototype, 'localDescription');
      if (origLocalDescGetter && origLocalDescGetter.get) {
        Object.defineProperty(pc, 'localDescription', {
          get: function() {
            const desc = origLocalDescGetter.get.call(pc);
            if (desc && desc.sdp) {
              return { type: desc.type, sdp: sanitizeSDPIPs(desc.sdp) };
            }
            return desc;
          },
          configurable: true, enumerable: true
        });
      }

      return pc;
    }, 'RTCPeerConnection');

    // Copy static properties and prototype
    PhantomRTCPeerConnection.prototype = OrigRTCPeerConnection.prototype;
    PhantomRTCPeerConnection.generateCertificate = OrigRTCPeerConnection.generateCertificate;

    window.RTCPeerConnection = PhantomRTCPeerConnection;
    if (window.webkitRTCPeerConnection) {
      window.webkitRTCPeerConnection = PhantomRTCPeerConnection;
    }

    function sanitizeSDPIPs(sdp) {
      if (!sdp) return sdp;
      // Replace private IPs in SDP with 0.0.0.0
      return sdp.replace(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/g, function(match) {
        if (/^10\./.test(match) || /^172\.(1[6-9]|2\d|3[01])\./.test(match) || /^192\.168\./.test(match)) {
          return '0.0.0.0';
        }
        return match;
      });
    }

    function sanitizeSDP(sdp) {
      if (!sdp) return sdp;
      let lines = sdp.split('\r\n');
      // Remove some fingerprinting-prone attributes while keeping SDP valid
      lines = lines.filter(line => {
        // Keep all essential lines
        if (line.startsWith('a=extmap-allow-mixed')) return false;
        return true;
      });
      return sanitizeSDPIPs(lines.join('\r\n'));
    }
  }

  return { apply };
})();
