// PhantomPrint - WebGL Database Module (Source 4: WebGL Report)
// Provides realistic, OS-consistent GPU profiles with full WebGL parameters
'use strict';

const WebGLDatabase = (() => {
  let _data = null;

  function setData(data) { _data = data; }

  function weightedPick(items, rng) {
    if (!items || items.length === 0) return null;
    const totalWeight = items.reduce((sum, item) => sum + (item.weight || 0.01), 0);
    let roll = rng.next() * totalWeight;
    for (const item of items) {
      roll -= (item.weight || 0.01);
      if (roll <= 0) return item;
    }
    return items[items.length - 1];
  }

  // Get GPU profiles compatible with the given OS
  function getGPUsByOS(os) {
    if (!_data || !_data.profiles) return [];
    const osKey = os.toLowerCase();
    return _data.profiles.filter(p => p.os === osKey);
  }

  // Get GPU profiles for a specific OS and browser
  function getGPUsByOSAndBrowser(os, browser) {
    if (!_data || !_data.profiles) return [];
    const osKey = os.toLowerCase();
    const browserKey = browser.toLowerCase();
    return _data.profiles.filter(p => p.os === osKey && p.browser === browserKey);
  }

  // Get a specific GPU profile
  function getGPUProfile(os, browser, rng) {
    let pool = getGPUsByOSAndBrowser(os, browser);
    if (pool.length === 0) {
      // Fall back to OS-only match
      pool = getGPUsByOS(os);
    }
    if (pool.length === 0) {
      // Last resort: return a generic profile
      return getDefaultProfile(os, browser);
    }
    return rng ? weightedPick(pool, rng) : pool[0];
  }

  // Weighted random GPU selection for an OS
  function getWeightedRandomGPU(os, rng) {
    const pool = getGPUsByOS(os);
    if (pool.length === 0) return getDefaultProfile(os, 'chrome');
    return weightedPick(pool, rng);
  }

  // Validate that a GPU is realistic for the given OS
  function validateGPUConsistency(os, gpuRenderer) {
    if (!gpuRenderer) return false;
    const osKey = os.toLowerCase();
    const renderer = gpuRenderer.toLowerCase();

    // Apple GPUs only on macOS/iOS
    if ((renderer.includes('apple') || renderer.includes('metal')) &&
        osKey !== 'macos' && osKey !== 'ios') return false;
    // ANGLE/D3D11 only on Windows
    if (renderer.includes('d3d11') && osKey !== 'windows') return false;
    // Adreno/Mali only on Android
    if ((renderer.includes('adreno') || renderer.includes('mali')) &&
        osKey !== 'android') return false;
    // Mesa only on Linux
    if (renderer.includes('mesa') && osKey !== 'linux') return false;

    return true;
  }

  function getDefaultProfile(os, browser) {
    const osKey = os.toLowerCase();
    const defaults = {
      windows: {
        id: 'default_win', os: 'windows', browser: browser || 'chrome',
        gpu: 'NVIDIA GeForce GTX 1660 SUPER',
        vendor: 'Google Inc. (NVIDIA)',
        renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 SUPER Direct3D11 vs_5_0 ps_5_0, D3D11)',
        unmaskedVendor: 'Google Inc. (NVIDIA)',
        unmaskedRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 SUPER Direct3D11 vs_5_0 ps_5_0, D3D11)',
        webglVersion: 'WebGL 1.0 (OpenGL ES 2.0 Chromium)',
        webgl2Version: 'WebGL 2.0 (OpenGL ES 3.0 Chromium)',
        maxTextureSize: 16384, maxViewportDims: [32768, 32768],
        maxRenderbufferSize: 16384, maxVertexAttribs: 16,
        maxVertexUniformVectors: 4096, maxFragmentUniformVectors: 1024,
        maxVaryingVectors: 30, maxCombinedTextureUnits: 32,
        maxCubeMapTextureSize: 16384, maxAnisotropy: 16,
        aliasedLineWidthRange: [1, 1], aliasedPointSizeRange: [1, 1024],
        depthBits: 24, stencilBits: 8, maxSamples: 8,
        redBits: 8, greenBits: 8, blueBits: 8, alphaBits: 8, subpixelBits: 8,
        extensions: ['ANGLE_instanced_arrays','EXT_blend_minmax','EXT_color_buffer_half_float','EXT_float_blend','EXT_frag_depth','EXT_shader_texture_lod','EXT_texture_compression_bptc','EXT_texture_compression_rgtc','EXT_texture_filter_anisotropic','EXT_sRGB','OES_element_index_uint','OES_fbo_render_mipmap','OES_standard_derivatives','OES_texture_float','OES_texture_float_linear','OES_texture_half_float','OES_texture_half_float_linear','OES_vertex_array_object','WEBGL_color_buffer_float','WEBGL_compressed_texture_s3tc','WEBGL_compressed_texture_s3tc_srgb','WEBGL_debug_renderer_info','WEBGL_debug_shaders','WEBGL_depth_texture','WEBGL_draw_buffers','WEBGL_lose_context','WEBGL_multi_draw'],
        webgl2Extensions: ['EXT_color_buffer_float','EXT_color_buffer_half_float','EXT_float_blend','EXT_texture_compression_bptc','EXT_texture_compression_rgtc','EXT_texture_filter_anisotropic','EXT_texture_norm16','OES_draw_buffers_indexed','OES_texture_float_linear','WEBGL_compressed_texture_s3tc','WEBGL_compressed_texture_s3tc_srgb','WEBGL_debug_renderer_info','WEBGL_debug_shaders','WEBGL_lose_context','WEBGL_multi_draw'],
        shaderPrecision: {
          vertexShaderHighFloat: {rangeMin:127,rangeMax:127,precision:23},
          vertexShaderMediumFloat: {rangeMin:127,rangeMax:127,precision:23},
          vertexShaderLowFloat: {rangeMin:127,rangeMax:127,precision:23},
          fragmentShaderHighFloat: {rangeMin:127,rangeMax:127,precision:23},
          fragmentShaderMediumFloat: {rangeMin:127,rangeMax:127,precision:23},
          fragmentShaderLowFloat: {rangeMin:127,rangeMax:127,precision:23},
          vertexShaderHighInt: {rangeMin:31,rangeMax:30,precision:0},
          fragmentShaderHighInt: {rangeMin:31,rangeMax:30,precision:0}
        },
        webgl2Params: {
          max3dTextureSize: 16384, maxArrayTextureLayers: 2048,
          maxDrawBuffers: 8, maxColorAttachments: 8,
          maxUniformBufferBindings: 72, maxTransformFeedbackInterleavedComponents: 128
        },
        weight: 0.05
      },
      macos: {
        id: 'default_mac', os: 'macos', browser: browser || 'chrome',
        gpu: 'Apple M2', vendor: 'Google Inc. (Apple)',
        renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)',
        unmaskedVendor: 'Google Inc. (Apple)',
        unmaskedRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)',
        webglVersion: 'WebGL 1.0 (OpenGL ES 2.0 Chromium)',
        webgl2Version: 'WebGL 2.0 (OpenGL ES 3.0 Chromium)',
        maxTextureSize: 16384, maxViewportDims: [16384, 16384],
        maxRenderbufferSize: 16384, maxVertexAttribs: 16,
        maxVertexUniformVectors: 4096, maxFragmentUniformVectors: 1024,
        maxVaryingVectors: 31, maxCombinedTextureUnits: 32,
        maxCubeMapTextureSize: 16384, maxAnisotropy: 16,
        aliasedLineWidthRange: [1, 1], aliasedPointSizeRange: [1, 8192],
        depthBits: 24, stencilBits: 8, maxSamples: 4,
        redBits: 8, greenBits: 8, blueBits: 8, alphaBits: 8, subpixelBits: 8,
        extensions: ['ANGLE_instanced_arrays','EXT_blend_minmax','EXT_color_buffer_half_float','EXT_float_blend','EXT_frag_depth','EXT_shader_texture_lod','EXT_texture_filter_anisotropic','EXT_sRGB','OES_element_index_uint','OES_fbo_render_mipmap','OES_standard_derivatives','OES_texture_float','OES_texture_float_linear','OES_texture_half_float','OES_texture_half_float_linear','OES_vertex_array_object','WEBGL_color_buffer_float','WEBGL_debug_renderer_info','WEBGL_depth_texture','WEBGL_draw_buffers','WEBGL_lose_context','WEBGL_multi_draw'],
        webgl2Extensions: ['EXT_color_buffer_float','EXT_color_buffer_half_float','EXT_float_blend','EXT_texture_filter_anisotropic','OES_draw_buffers_indexed','OES_texture_float_linear','WEBGL_debug_renderer_info','WEBGL_lose_context','WEBGL_multi_draw'],
        shaderPrecision: {
          vertexShaderHighFloat: {rangeMin:127,rangeMax:127,precision:23},
          vertexShaderMediumFloat: {rangeMin:127,rangeMax:127,precision:23},
          vertexShaderLowFloat: {rangeMin:127,rangeMax:127,precision:23},
          fragmentShaderHighFloat: {rangeMin:127,rangeMax:127,precision:23},
          fragmentShaderMediumFloat: {rangeMin:127,rangeMax:127,precision:23},
          fragmentShaderLowFloat: {rangeMin:127,rangeMax:127,precision:23},
          vertexShaderHighInt: {rangeMin:31,rangeMax:30,precision:0},
          fragmentShaderHighInt: {rangeMin:31,rangeMax:30,precision:0}
        },
        webgl2Params: {
          max3dTextureSize: 16384, maxArrayTextureLayers: 2048,
          maxDrawBuffers: 8, maxColorAttachments: 8,
          maxUniformBufferBindings: 72, maxTransformFeedbackInterleavedComponents: 128
        },
        weight: 0.05
      }
    };
    return defaults[osKey] || defaults.windows;
  }

  return {
    setData,
    getGPUProfile,
    getWeightedRandomGPU,
    getGPUsByOS,
    getGPUsByOSAndBrowser,
    validateGPUConsistency,
    getDefaultProfile
  };
})();

if (typeof module !== 'undefined') module.exports = WebGLDatabase;
