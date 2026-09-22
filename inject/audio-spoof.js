// PhantomPrint AudioContext Fingerprinting Protection
// Adds deterministic noise to audio processing to prevent fingerprinting
const AudioSpoof = (() => {
  'use strict';

  let rng = null;

  function apply(profile, config, prng) {
    if (!config.enabled) return;
    rng = prng;

    function makeNative(fn, name) {
      const s = `function ${name || fn.name || ''}() { [native code] }`;
      Object.defineProperty(fn, 'toString', { value: () => s, writable: false, configurable: true });
      return fn;
    }

    const audioParams = profile.audioParams;

    // Override AudioContext constructor to spoof properties
    const OrigAudioContext = window.AudioContext || window.webkitAudioContext;
    if (!OrigAudioContext) return;

    const OrigOfflineAudioContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;

    // Patch AudioContext
    const origAudioContextProto = OrigAudioContext.prototype;

    // sampleRate MUST be intercepted at the prototype level.
    // It is a read-only property set at AudioContext construction time, but
    // installing a getter on BaseAudioContext.prototype overrides the instance value
    // that fingerprinters read. This is the only reliable interception point.
    const baseProto = typeof BaseAudioContext !== 'undefined'
      ? BaseAudioContext.prototype : origAudioContextProto;
    try {
      Object.defineProperty(baseProto, 'sampleRate', {
        get: makeNative(function() { return audioParams.sampleRate || 48000; }, 'get sampleRate'),
        configurable: true, enumerable: true
      });
    } catch(e) {}

    // Override baseLatency
    Object.defineProperty(origAudioContextProto, 'baseLatency', {
      get: makeNative(function() { return audioParams.baseLatency; }, 'get baseLatency'),
      configurable: true, enumerable: true
    });

    // Override outputLatency
    Object.defineProperty(origAudioContextProto, 'outputLatency', {
      get: makeNative(function() { return audioParams.outputLatency; }, 'get outputLatency'),
      configurable: true, enumerable: true
    });

    const origCreateOscillator = origAudioContextProto.createOscillator;
    const origCreateAnalyser = origAudioContextProto.createAnalyser;
    const origCreateGain = origAudioContextProto.createGain;

    // Intercept OfflineAudioContext.startRendering to add noise
    if (OrigOfflineAudioContext) {
      const origStartRendering = OrigOfflineAudioContext.prototype.startRendering;
      OrigOfflineAudioContext.prototype.startRendering = makeNative(function startRendering() {
        return origStartRendering.call(this).then(function(renderedBuffer) {
          // Add micro-noise to the rendered buffer
          for (let channel = 0; channel < renderedBuffer.numberOfChannels; channel++) {
            const data = renderedBuffer.getChannelData(channel);
            addNoiseToFloat32Array(data);
          }
          return renderedBuffer;
        });
      }, 'startRendering');
    }

    // Override AudioBuffer.prototype.getChannelData
    const origGetChannelData = AudioBuffer.prototype.getChannelData;
    const noisedBuffers = new WeakSet();

    AudioBuffer.prototype.getChannelData = makeNative(function getChannelData(channel) {
      const data = origGetChannelData.call(this, channel);
      // Only add noise once per buffer and only for small buffers (fingerprinting probes)
      if (!noisedBuffers.has(this) && this.length <= 44100 * 2) {
        noisedBuffers.add(this);
        addNoiseToFloat32Array(data);
      }
      return data;
    }, 'getChannelData');

    // Override copyFromChannel
    const origCopyFromChannel = AudioBuffer.prototype.copyFromChannel;
    if (origCopyFromChannel) {
      AudioBuffer.prototype.copyFromChannel = makeNative(function copyFromChannel(destination, channelNumber, startInChannel) {
        origCopyFromChannel.call(this, destination, channelNumber, startInChannel || 0);
        if (this.length <= 44100 * 2) {
          addNoiseToFloat32Array(destination);
        }
      }, 'copyFromChannel');
    }

    // Override AnalyserNode methods
    const origGetFloatFreq = AnalyserNode.prototype.getFloatFrequencyData;
    AnalyserNode.prototype.getFloatFrequencyData = makeNative(function getFloatFrequencyData(array) {
      origGetFloatFreq.call(this, array);
      addNoiseToFloat32Array(array, 0.001);
    }, 'getFloatFrequencyData');

    const origGetByteFreq = AnalyserNode.prototype.getByteFrequencyData;
    AnalyserNode.prototype.getByteFrequencyData = makeNative(function getByteFrequencyData(array) {
      origGetByteFreq.call(this, array);
      // Add ±1 noise to some byte values
      const step = Math.max(1, Math.floor(array.length / 20));
      for (let i = 0; i < array.length; i += step) {
        const noise = rng.next() > 0.5 ? 1 : -1;
        array[i] = Math.max(0, Math.min(255, array[i] + noise));
      }
    }, 'getByteFrequencyData');

    const origGetFloatTime = AnalyserNode.prototype.getFloatTimeDomainData;
    if (origGetFloatTime) {
      AnalyserNode.prototype.getFloatTimeDomainData = makeNative(function getFloatTimeDomainData(array) {
        origGetFloatTime.call(this, array);
        addNoiseToFloat32Array(array, 0.0001);
      }, 'getFloatTimeDomainData');
    }

    const origGetByteTime = AnalyserNode.prototype.getByteTimeDomainData;
    AnalyserNode.prototype.getByteTimeDomainData = makeNative(function getByteTimeDomainData(array) {
      origGetByteTime.call(this, array);
      const step = Math.max(1, Math.floor(array.length / 20));
      for (let i = 0; i < array.length; i += step) {
        array[i] = Math.max(0, Math.min(255, array[i] + (rng.next() > 0.5 ? 1 : -1)));
      }
    }, 'getByteTimeDomainData');

    // Spoof destination properties
    const origDestGetter = Object.getOwnPropertyDescriptor(AudioContext.prototype, 'destination') ||
      Object.getOwnPropertyDescriptor(BaseAudioContext.prototype, 'destination');

    if (origDestGetter && origDestGetter.get) {
      const origDestGet = origDestGetter.get;
      Object.defineProperty(BaseAudioContext.prototype, 'destination', {
        get: makeNative(function() {
          const dest = origDestGet.call(this);
          if (dest && !dest.__phantomPatched) {
            try {
              Object.defineProperty(dest, 'maxChannelCount', {
                get: () => audioParams.maxChannelCount,
                configurable: false, enumerable: true
              });
              Object.defineProperty(dest, 'channelCount', {
                get: () => audioParams.channelCount,
                set: () => {},
                configurable: false, enumerable: true
              });
              dest.__phantomPatched = true;
            } catch(e) {}
          }
          return dest;
        }, 'get destination'),
        configurable: false, enumerable: true
      });
    }
  }

  function addNoiseToFloat32Array(data, magnitude) {
    if (!data || !data.length) return;
    const mag = magnitude || 0.0001;
    const step = Math.max(1, Math.floor(data.length / 100));
    for (let i = 0; i < data.length; i += step) {
      data[i] += (rng.next() - 0.5) * mag * 2;
    }
  }

  return { apply };
})();
