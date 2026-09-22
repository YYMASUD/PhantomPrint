// PhantomPrint — WebGPU Spoofing Module
// Spoofs navigator.gpu (WebGPU API) to match the fingerprint profile
// Must run in MAIN world before any page scripts
(function() {
  "use strict";

  const CFG = window.__pp_cfg__;
  if (!CFG || !CFG.enabled) return;

  const P = CFG.profile;
  const MOD = CFG.modules || {};

  if (MOD.webgpu === false) return;
  if (!navigator.gpu) return;

  const _defineProperty = Object.defineProperty;
  const _call = Function.prototype.call;

  // Build fake adapter info from profile GPU
  const gpuRenderer = (P && P.gpu) ? (P.gpu.renderer || P.gpu || '') : '';
  const gpuVendor = (P && P.gpu) ? (P.gpu.vendor || P.gpuVendor || '') : '';

  // Map GPU renderer strings to WebGPU adapter descriptions
  function buildAdapterInfo() {
    let vendor = 'Google Inc.';
    let architecture = 'gen-12lp';
    let device = 'Intel(R) UHD Graphics 630';
    let description = '';

    if (gpuRenderer.includes('NVIDIA') || gpuRenderer.includes('GeForce') || gpuRenderer.includes('RTX') || gpuRenderer.includes('GTX')) {
      vendor = 'NVIDIA Corporation';
      if (gpuRenderer.includes('RTX 4090')) { device = 'NVIDIA GeForce RTX 4090'; architecture = 'ada'; }
      else if (gpuRenderer.includes('RTX 4080')) { device = 'NVIDIA GeForce RTX 4080'; architecture = 'ada'; }
      else if (gpuRenderer.includes('RTX 4070')) { device = 'NVIDIA GeForce RTX 4070'; architecture = 'ada'; }
      else if (gpuRenderer.includes('RTX 4060')) { device = 'NVIDIA GeForce RTX 4060'; architecture = 'ada'; }
      else if (gpuRenderer.includes('RTX 3090')) { device = 'NVIDIA GeForce RTX 3090'; architecture = 'ampere'; }
      else if (gpuRenderer.includes('RTX 3080')) { device = 'NVIDIA GeForce RTX 3080'; architecture = 'ampere'; }
      else if (gpuRenderer.includes('RTX 3070')) { device = 'NVIDIA GeForce RTX 3070'; architecture = 'ampere'; }
      else if (gpuRenderer.includes('RTX 3060')) { device = 'NVIDIA GeForce RTX 3060'; architecture = 'ampere'; }
      else if (gpuRenderer.includes('GTX 1660')) { device = 'NVIDIA GeForce GTX 1660 SUPER'; architecture = 'turing'; }
      else { device = 'NVIDIA GeForce RTX 3060'; architecture = 'ampere'; }
    } else if (gpuRenderer.includes('AMD') || gpuRenderer.includes('Radeon') || gpuRenderer.includes('RX')) {
      vendor = 'Advanced Micro Devices, Inc.';
      if (gpuRenderer.includes('RX 7900')) { device = 'AMD Radeon RX 7900 XTX'; architecture = 'rdna3'; }
      else if (gpuRenderer.includes('RX 7800')) { device = 'AMD Radeon RX 7800 XT'; architecture = 'rdna3'; }
      else if (gpuRenderer.includes('RX 7600')) { device = 'AMD Radeon RX 7600'; architecture = 'rdna3'; }
      else if (gpuRenderer.includes('RX 6800')) { device = 'AMD Radeon RX 6800 XT'; architecture = 'rdna2'; }
      else if (gpuRenderer.includes('RX 6700')) { device = 'AMD Radeon RX 6700 XT'; architecture = 'rdna2'; }
      else { device = 'AMD Radeon RX 6800 XT'; architecture = 'rdna2'; }
    } else if (gpuRenderer.includes('Apple') || gpuRenderer.includes('Metal')) {
      vendor = 'Apple';
      if (gpuRenderer.includes('M3')) { device = 'Apple M3'; architecture = 'apple-m3'; }
      else if (gpuRenderer.includes('M2')) { device = 'Apple M2'; architecture = 'apple-m2'; }
      else { device = 'Apple M1'; architecture = 'apple-m1'; }
    } else if (gpuRenderer.includes('Adreno')) {
      vendor = 'Qualcomm Technologies, Inc.';
      if (gpuRenderer.includes('750')) { device = 'Adreno (TM) 750'; architecture = 'adreno-750'; }
      else if (gpuRenderer.includes('740')) { device = 'Adreno (TM) 740'; architecture = 'adreno-740'; }
      else { device = 'Adreno (TM) 740'; architecture = 'adreno-740'; }
    } else if (gpuRenderer.includes('Mali')) {
      vendor = 'ARM';
      device = 'Mali-G715'; architecture = 'mali-g715';
    } else {
      // Intel fallback
      vendor = 'Intel Corporation';
      if (gpuRenderer.includes('Iris Xe')) { device = 'Intel(R) Iris(R) Xe Graphics'; architecture = 'gen-12'; }
      else if (gpuRenderer.includes('UHD 770')) { device = 'Intel(R) UHD Graphics 770'; architecture = 'gen-12'; }
      else { device = 'Intel(R) UHD Graphics 630'; architecture = 'gen-9'; }
    }

    return { vendor, architecture, device, description };
  }

  const adapterInfo = buildAdapterInfo();

  // Build fake GPUSupportedLimits
  const fakeLimits = {
    maxTextureDimension1D: 8192,
    maxTextureDimension2D: 8192,
    maxTextureDimension3D: 2048,
    maxTextureArrayLayers: 256,
    maxBindGroups: 4,
    maxBindGroupsPlusVertexBuffers: 24,
    maxBindingsPerBindGroup: 640,
    maxDynamicUniformBuffersPerPipelineLayout: 8,
    maxDynamicStorageBuffersPerPipelineLayout: 4,
    maxSampledTexturesPerShaderStage: 16,
    maxSamplersPerShaderStage: 16,
    maxStorageBuffersPerShaderStage: 8,
    maxStorageTexturesPerShaderStage: 4,
    maxUniformBuffersPerShaderStage: 12,
    maxUniformBufferBindingSize: 65536,
    maxStorageBufferBindingSize: 134217728,
    minUniformBufferOffsetAlignment: 256,
    minStorageBufferOffsetAlignment: 256,
    maxVertexBuffers: 8,
    maxBufferSize: 268435456,
    maxVertexAttributes: 16,
    maxVertexBufferArrayStride: 2048,
    maxInterStageShaderComponents: 60,
    maxInterStageShaderVariables: 16,
    maxColorAttachments: 8,
    maxColorAttachmentBytesPerSample: 32,
    maxComputeWorkgroupStorageSize: 16384,
    maxComputeInvocationsPerWorkgroup: 256,
    maxComputeWorkgroupSizeX: 256,
    maxComputeWorkgroupSizeY: 256,
    maxComputeWorkgroupSizeZ: 64,
    maxComputeWorkgroupsPerDimension: 65535
  };

  // Build fake GPUSupportedFeatures
  const fakeFeatures = new Set([
    'depth-clip-control',
    'depth32float-stencil8',
    'texture-compression-bc',
    'texture-compression-bc-sliced-3d',
    'indirect-first-instance',
    'shader-f16',
    'rg11b10ufloat-renderable',
    'bgra8unorm-storage',
    'float32-filterable'
  ]);

  // Create fake adapter
  const fakeAdapter = {
    name: adapterInfo.device,
    isFallbackAdapter: false,
    features: fakeFeatures,
    limits: fakeLimits,
    info: adapterInfo,
    requestDevice: function(descriptor) {
      return navigator.gpu.requestAdapter().then(function(realAdapter) {
        if (!realAdapter) return null;
        return realAdapter.requestDevice(descriptor).then(function(device) {
          return device;
        });
      }).catch(function() { return null; });
    },
    requestAdapterInfo: function() {
      return Promise.resolve(adapterInfo);
    }
  };

  // Override navigator.gpu.requestAdapter
  try {
    const origGPU = navigator.gpu;
    const origRequestAdapter = origGPU.requestAdapter.bind(origGPU);

    const fakeGPU = Object.create(Object.getPrototypeOf(origGPU));

    // Copy all properties
    for (const key of Object.getOwnPropertyNames(Object.getPrototypeOf(origGPU))) {
      try {
        const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(origGPU), key);
        if (desc) Object.defineProperty(fakeGPU, key, desc);
      } catch(e) {}
    }

    // Override requestAdapter
    fakeGPU.requestAdapter = function requestAdapter(options) {
      return origRequestAdapter(options).then(function(realAdapter) {
        if (!realAdapter) return null;

        // Wrap the real adapter to spoof info
        const wrappedAdapter = Object.create(Object.getPrototypeOf(realAdapter));

        // Copy real adapter methods
        const proto = Object.getPrototypeOf(realAdapter);
        const protoNames = Object.getOwnPropertyNames(proto);
        for (const key of protoNames) {
          try {
            const desc = Object.getOwnPropertyDescriptor(proto, key);
            if (desc) Object.defineProperty(wrappedAdapter, key, desc);
          } catch(e) {}
        }

        // Override requestAdapterInfo to return spoofed info
        wrappedAdapter.requestAdapterInfo = function() {
          return Promise.resolve(adapterInfo);
        };

        // Override info property if it exists
        try {
          Object.defineProperty(wrappedAdapter, 'info', {
            get: function() { return adapterInfo; },
            configurable: true
          });
        } catch(e) {}

        return wrappedAdapter;
      });
    };

    // Override getPreferredCanvasFormat (keep real value)
    fakeGPU.getPreferredCanvasFormat = origGPU.getPreferredCanvasFormat.bind(origGPU);
    fakeGPU.wgslLanguageFeatures = origGPU.wgslLanguageFeatures;

    _defineProperty(navigator, 'gpu', {
      get: function() { return fakeGPU; },
      configurable: true,
      enumerable: true
    });
  } catch(e) {}

})();
