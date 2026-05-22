// PhantomPrint Media Capabilities & Speech Spoofing
// Spoofs media codec support, speech synthesis voices, and EME
const MediaSpoof = (() => {
  'use strict';

  function apply(profile, config, prng) {
    if (!config.enabled) return;

    function makeNative(fn, name) {
      const s = `function ${name || fn.name || ''}() { [native code] }`;
      Object.defineProperty(fn, 'toString', { value: () => s, writable: false, configurable: true });
      return fn;
    }

    // Common codec support based on browser profile
    const codecSupport = getCodecSupport(profile);

    // Override MediaCapabilities API
    if (navigator.mediaCapabilities) {
      const origDecodingInfo = navigator.mediaCapabilities.decodingInfo;
      navigator.mediaCapabilities.decodingInfo = makeNative(function decodingInfo(config) {
        return origDecodingInfo.call(navigator.mediaCapabilities, config).then(result => {
          // Return consistent results - always supported for common codecs
          const codec = config.video ? config.video.contentType : config.audio ? config.audio.contentType : '';
          const isCommon = isCommonCodec(codec, profile);
          return {
            supported: isCommon ? true : result.supported,
            smooth: isCommon ? true : result.smooth,
            powerEfficient: isCommon ? true : result.powerEfficient,
            configuration: config
          };
        });
      }, 'decodingInfo');

      if (navigator.mediaCapabilities.encodingInfo) {
        const origEncodingInfo = navigator.mediaCapabilities.encodingInfo;
        navigator.mediaCapabilities.encodingInfo = makeNative(function encodingInfo(config) {
          return origEncodingInfo.call(navigator.mediaCapabilities, config).then(result => {
            return {
              supported: result.supported,
              smooth: result.smooth,
              powerEfficient: result.powerEfficient,
              configuration: config
            };
          });
        }, 'encodingInfo');
      }
    }

    // Override HTMLMediaElement.canPlayType()
    const origCanPlayType = HTMLMediaElement.prototype.canPlayType;
    HTMLMediaElement.prototype.canPlayType = makeNative(function canPlayType(type) {
      const overridden = getCanPlayTypeResult(type, profile);
      if (overridden !== null) return overridden;
      return origCanPlayType.call(this, type);
    }, 'canPlayType');

    // Override MediaRecorder.isTypeSupported
    if (window.MediaRecorder && MediaRecorder.isTypeSupported) {
      const origMRSupported = MediaRecorder.isTypeSupported;
      MediaRecorder.isTypeSupported = makeNative(function isTypeSupported(type) {
        const result = codecSupport.recorder.includes(type.split(';')[0]);
        return result !== undefined ? result : origMRSupported(type);
      }, 'isTypeSupported');
    }

    // Override MediaSource.isTypeSupported
    if (window.MediaSource && MediaSource.isTypeSupported) {
      const origMSSupported = MediaSource.isTypeSupported;
      MediaSource.isTypeSupported = makeNative(function isTypeSupported(type) {
        return origMSSupported(type); // Keep original but ensure consistency
      }, 'isTypeSupported');
    }

    // Override speechSynthesis.getVoices()
    if (window.speechSynthesis) {
      const spoofedVoices = profile.voices.map((v, i) => ({
        name: v.name,
        lang: v.lang,
        localService: v.localService !== undefined ? v.localService : true,
        default: v.default || i === 0,
        voiceURI: v.name
      }));

      speechSynthesis.getVoices = makeNative(function getVoices() {
        return spoofedVoices;
      }, 'getVoices');

      // Override onvoiceschanged to fire with our spoofed list
      Object.defineProperty(speechSynthesis, 'onvoiceschanged', {
        get: function() { return null; },
        set: function(cb) {
          if (typeof cb === 'function') {
            setTimeout(() => cb(new Event('voiceschanged')), 50);
          }
        },
        configurable: true, enumerable: true
      });
    }

    // Block SpeechRecognition if needed
    if (config.blockSpeechRecognition) {
      window.SpeechRecognition = undefined;
      window.webkitSpeechRecognition = undefined;
    }

    // EME (Encrypted Media Extensions) spoofing
    if (navigator.requestMediaKeySystemAccess) {
      const origRequestMKSA = navigator.requestMediaKeySystemAccess.bind(navigator);
      navigator.requestMediaKeySystemAccess = makeNative(function requestMediaKeySystemAccess(keySystem, supportedConfigurations) {
        // Allow common key systems, block exotic ones
        const allowedKeySystems = ['com.widevine.alpha', 'org.w3.clearkey'];
        if (profile.browser === 'Safari') {
          allowedKeySystems.push('com.apple.fps.1_0', 'com.apple.fps');
        }
        if (!allowedKeySystems.some(ks => keySystem.startsWith(ks))) {
          return Promise.reject(new DOMException('Key system not supported', 'NotSupportedError'));
        }
        return origRequestMKSA(keySystem, supportedConfigurations);
      }, 'requestMediaKeySystemAccess');
    }

    // Login detection prevention - override img/iframe load detection
    blockLoginDetection(profile, makeNative);
  }

  function getCodecSupport(profile) {
    const browser = profile.browser;
    const common = {
      video: ['video/mp4', 'video/webm', 'video/ogg'],
      audio: ['audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/flac'],
      recorder: ['video/webm', 'audio/webm', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8']
    };

    if (browser === 'Safari') {
      common.video = ['video/mp4'];
      common.recorder = [];
    }

    return common;
  }

  function isCommonCodec(contentType, profile) {
    if (!contentType) return true;
    const type = contentType.split(';')[0].trim();
    const commonTypes = ['video/mp4', 'video/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm'];
    return commonTypes.includes(type);
  }

  function getCanPlayTypeResult(type, profile) {
    const mimeType = type.split(';')[0].trim();
    const browser = profile.browser;

    const results = {
      'video/mp4': 'probably',
      'video/webm': browser === 'Safari' ? '' : 'probably',
      'video/ogg': browser === 'Safari' ? '' : 'probably',
      'audio/mp4': 'probably',
      'audio/mpeg': 'probably',
      'audio/ogg': browser === 'Safari' ? '' : 'probably',
      'audio/wav': 'probably',
      'audio/webm': browser === 'Safari' ? '' : 'probably',
      'audio/flac': 'probably',
      'video/mp4; codecs="avc1.42E01E"': 'probably',
      'video/mp4; codecs="avc1.42E01E, mp4a.40.2"': 'probably',
      'video/webm; codecs="vp8"': browser === 'Safari' ? '' : 'probably',
      'video/webm; codecs="vp9"': browser === 'Safari' ? '' : 'probably',
      'video/webm; codecs="vp8, vorbis"': browser === 'Safari' ? '' : 'probably',
      'audio/ogg; codecs="vorbis"': browser === 'Safari' ? '' : 'probably',
      'audio/ogg; codecs="opus"': browser === 'Safari' ? '' : 'probably'
    };

    // Check for exact match first
    if (results[type] !== undefined) return results[type];
    if (results[mimeType] !== undefined) return results[mimeType];
    return null; // Let original handle it
  }

  function blockLoginDetection(profile, makeNative) {
    // Social login detection typically uses image/iframe loads to known URLs
    // We intercept these by blocking requests to known detection endpoints
    const loginDetectionDomains = [
      'accounts.google.com/CheckCookie',
      'www.facebook.com/login/status',
      'twitter.com/login/status',
      'login.live.com/login.srf',
      'www.linkedin.com/uas/login-cap'
    ];

    // Override Image constructor to intercept login detection
    const OrigImage = window.Image;
    window.Image = makeNative(function Image(width, height) {
      const img = new OrigImage(width, height);
      const origSrcDesc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
      if (origSrcDesc) {
        const origSet = origSrcDesc.set;
        Object.defineProperty(img, 'src', {
          set: function(url) {
            if (url && loginDetectionDomains.some(d => url.includes(d))) {
              // Simulate load failure for login detection URLs
              setTimeout(() => {
                if (img.onerror) img.onerror(new Event('error'));
              }, 10);
              return;
            }
            origSet.call(img, url);
          },
          get: function() { return origSrcDesc.get.call(img); },
          configurable: true, enumerable: true
        });
      }
      return img;
    }, 'Image');
    window.Image.prototype = OrigImage.prototype;
  }

  return { apply };
})();
