// PhantomPrint WebGL Fingerprinting Protection
// Spoofs WebGL parameters, renderer info, and adds noise to readPixels
const WebGLSpoof = (() => {
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

    const params = profile.webglParams;
    const gpuVendor = profile.gpuVendor;
    const gpuRenderer = profile.gpu;

    // WebGL parameter map - constants to spoofed values
    const paramOverrides = {
      // Vendor/Renderer via debug extension handled separately
      3379: params.maxTextureSize,           // MAX_TEXTURE_SIZE
      3386: new Int32Array(params.maxViewportDims), // MAX_VIEWPORT_DIMS
      34024: params.maxRenderbufferSize,     // MAX_RENDERBUFFER_SIZE
      34921: params.maxVertexAttribs,        // MAX_VERTEX_ATTRIBS
      36347: params.maxVertexUniformVectors, // MAX_VERTEX_UNIFORM_VECTORS
      36349: params.maxFragmentUniformVectors, // MAX_FRAGMENT_UNIFORM_VECTORS
      36348: params.maxVaryingVectors,       // MAX_VARYING_VECTORS
      35661: params.maxCombinedTextureUnits, // MAX_COMBINED_TEXTURE_IMAGE_UNITS
      34076: params.maxCubeMapTextureSize,   // MAX_CUBE_MAP_TEXTURE_SIZE
      36063: params.depthBits,              // DEPTH_BITS
      36064: params.stencilBits,            // STENCIL_BITS
      36183: params.samples,                // SAMPLES
      3410: params.redBits,                 // RED_BITS
      3411: params.greenBits,               // GREEN_BITS
      3412: params.blueBits,                // BLUE_BITS
      3413: params.alphaBits,               // ALPHA_BITS
      // WebGL2 additional params
      32883: params.max3dTextureSize,        // MAX_3D_TEXTURE_SIZE
      35071: params.maxArrayTextureLayers,   // MAX_ARRAY_TEXTURE_LAYERS
      34852: params.maxDrawBuffers,          // MAX_DRAW_BUFFERS
      36063: params.maxColorAttachments,     // MAX_COLOR_ATTACHMENTS (same const reused)
      36183: params.maxSamples               // MAX_SAMPLES
    };

    // Float32Array params
    const floatParamOverrides = {
      33901: new Float32Array(params.aliasedLineWidthRange),   // ALIASED_LINE_WIDTH_RANGE
      33902: new Float32Array(params.aliasedPointSizeRange)    // ALIASED_POINT_SIZE_RANGE
    };

    // BUG FIX: Merge all getParameter overrides into ONE per context type.
    // Previously getParameter was overridden twice for WebGL1, causing the second
    // override to call origGetParam (the first override) which called itself → recursion.

    // Override getParameter for WebGLRenderingContext (single, final override)
    const origGetParam = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = makeNative(function getParameter(pname) {
      if (pname === 0x9245) return gpuVendor;      // UNMASKED_VENDOR_WEBGL
      if (pname === 0x9246) return gpuRenderer;     // UNMASKED_RENDERER_WEBGL
      if (paramOverrides[pname] !== undefined) return paramOverrides[pname];
      if (floatParamOverrides[pname] !== undefined) return floatParamOverrides[pname];
      return origGetParam.call(this, pname);
    }, 'getParameter');

    // Override getExtension to intercept WEBGL_debug_renderer_info
    const origGetExtension = WebGLRenderingContext.prototype.getExtension;
    WebGLRenderingContext.prototype.getExtension = makeNative(function getExtension(name) {
      if (name === 'WEBGL_debug_renderer_info') {
        return {
          UNMASKED_VENDOR_WEBGL: 0x9245,
          UNMASKED_RENDERER_WEBGL: 0x9246
        };
      }
      return origGetExtension.call(this, name);
    }, 'getExtension');

    // Override for WebGL2 if available (single, final override)
    if (typeof WebGL2RenderingContext !== 'undefined') {
      const origGetParam2 = WebGL2RenderingContext.prototype.getParameter;
      WebGL2RenderingContext.prototype.getParameter = makeNative(function getParameter(pname) {
        if (pname === 0x9245) return gpuVendor;
        if (pname === 0x9246) return gpuRenderer;
        if (paramOverrides[pname] !== undefined) return paramOverrides[pname];
        if (floatParamOverrides[pname] !== undefined) return floatParamOverrides[pname];
        return origGetParam2.call(this, pname);
      }, 'getParameter');

      const origGetExtension2 = WebGL2RenderingContext.prototype.getExtension;
      WebGL2RenderingContext.prototype.getExtension = makeNative(function getExtension(name) {
        if (name === 'WEBGL_debug_renderer_info') {
          return {
            UNMASKED_VENDOR_WEBGL: 0x9245,
            UNMASKED_RENDERER_WEBGL: 0x9246
          };
        }
        return origGetExtension2.call(this, name);
      }, 'getExtension');
    }

    // Override getSupportedExtensions
    const commonExtensions = [
      'ANGLE_instanced_arrays', 'EXT_blend_minmax', 'EXT_color_buffer_half_float',
      'EXT_float_blend', 'EXT_frag_depth', 'EXT_shader_texture_lod',
      'EXT_texture_compression_bptc', 'EXT_texture_compression_rgtc',
      'EXT_texture_filter_anisotropic', 'EXT_sRGB', 'OES_element_index_uint',
      'OES_fbo_render_mipmap', 'OES_standard_derivatives', 'OES_texture_float',
      'OES_texture_float_linear', 'OES_texture_half_float', 'OES_texture_half_float_linear',
      'OES_vertex_array_object', 'WEBGL_color_buffer_float', 'WEBGL_compressed_texture_s3tc',
      'WEBGL_compressed_texture_s3tc_srgb', 'WEBGL_debug_renderer_info',
      'WEBGL_debug_shaders', 'WEBGL_depth_texture', 'WEBGL_draw_buffers',
      'WEBGL_lose_context', 'WEBGL_multi_draw'
    ];

    const origGetSupportedExt = WebGLRenderingContext.prototype.getSupportedExtensions;
    WebGLRenderingContext.prototype.getSupportedExtensions = makeNative(function getSupportedExtensions() {
      return [...commonExtensions];
    }, 'getSupportedExtensions');

    if (typeof WebGL2RenderingContext !== 'undefined') {
      const webgl2Extensions = [
        ...commonExtensions,
        'EXT_color_buffer_float', 'EXT_conservative_depth', 'EXT_disjoint_timer_query_webgl2',
        'OES_draw_buffers_indexed', 'WEBGL_clip_cull_distance',
        'WEBGL_draw_instanced_base_vertex_base_instance', 'WEBGL_multi_draw_instanced_base_vertex_base_instance',
        'WEBGL_provoking_vertex'
      ];
      WebGL2RenderingContext.prototype.getSupportedExtensions = makeNative(function getSupportedExtensions() {
        return [...webgl2Extensions];
      }, 'getSupportedExtensions');
    }

    // Override getShaderPrecisionFormat
    const origGetShaderPrecision = WebGLRenderingContext.prototype.getShaderPrecisionFormat;
    WebGLRenderingContext.prototype.getShaderPrecisionFormat = makeNative(function getShaderPrecisionFormat(shaderType, precisionType) {
      const result = origGetShaderPrecision.call(this, shaderType, precisionType);
      if (!result) return result;
      // Return consistent precision values
      const fakeResult = {
        rangeMin: result.rangeMin,
        rangeMax: result.rangeMax,
        precision: result.precision
      };
      // Standardize to common values
      if (precisionType === 0x8DF0) { // LOW_FLOAT
        fakeResult.rangeMin = 127;
        fakeResult.rangeMax = 127;
        fakeResult.precision = 23;
      } else if (precisionType === 0x8DF1) { // MEDIUM_FLOAT
        fakeResult.rangeMin = 127;
        fakeResult.rangeMax = 127;
        fakeResult.precision = 23;
      } else if (precisionType === 0x8DF2) { // HIGH_FLOAT
        fakeResult.rangeMin = 127;
        fakeResult.rangeMax = 127;
        fakeResult.precision = 23;
      } else if (precisionType === 0x8DF3) { // LOW_INT
        fakeResult.rangeMin = 24;
        fakeResult.rangeMax = 24;
        fakeResult.precision = 0;
      } else if (precisionType === 0x8DF4) { // MEDIUM_INT
        fakeResult.rangeMin = 24;
        fakeResult.rangeMax = 24;
        fakeResult.precision = 0;
      } else if (precisionType === 0x8DF5) { // HIGH_INT
        fakeResult.rangeMin = 24;
        fakeResult.rangeMax = 24;
        fakeResult.precision = 0;
      }
      return fakeResult;
    }, 'getShaderPrecisionFormat');

    if (typeof WebGL2RenderingContext !== 'undefined') {
      WebGL2RenderingContext.prototype.getShaderPrecisionFormat = makeNative(function getShaderPrecisionFormat(shaderType, precisionType) {
        return WebGLRenderingContext.prototype.getShaderPrecisionFormat.call(this, shaderType, precisionType);
      }, 'getShaderPrecisionFormat');
    }

    // Override readPixels to add noise
    const origReadPixels = WebGLRenderingContext.prototype.readPixels;
    WebGLRenderingContext.prototype.readPixels = makeNative(function readPixels(x, y, width, height, format, type, pixels) {
      origReadPixels.call(this, x, y, width, height, format, type, pixels);
      if (pixels && pixels.length && width <= 500 && height <= 200) {
        // Add subtle noise to a few pixel values
        const step = Math.max(4, Math.floor(pixels.length / 50));
        for (let i = 0; i < pixels.length; i += step) {
          const ch = Math.floor(rng.next() * 3);
          if (i + ch < pixels.length) {
            const noise = rng.next() > 0.5 ? 1 : -1;
            pixels[i + ch] = Math.max(0, Math.min(255, pixels[i + ch] + noise));
          }
        }
      }
    }, 'readPixels');

    if (typeof WebGL2RenderingContext !== 'undefined') {
      const origReadPixels2 = WebGL2RenderingContext.prototype.readPixels;
      WebGL2RenderingContext.prototype.readPixels = makeNative(function readPixels() {
        origReadPixels2.apply(this, arguments);
        const pixels = arguments[6];
        if (pixels && pixels.length && arguments[2] <= 500 && arguments[3] <= 200) {
          const step = Math.max(4, Math.floor(pixels.length / 50));
          for (let i = 0; i < pixels.length; i += step) {
            const ch = Math.floor(rng.next() * 3);
            if (i + ch < pixels.length) {
              pixels[i + ch] = Math.max(0, Math.min(255, pixels[i + ch] + (rng.next() > 0.5 ? 1 : -1)));
            }
          }
        }
      }, 'readPixels');
    }
  }

  return { apply };
})();
