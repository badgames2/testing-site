'use strict';

const canvas = document.getElementsByTagName('canvas')[0];
canvas.width = canvas.clientWidth;
canvas.height = canvas.clientHeight;

let config = {
  TEXTURE_DOWNSAMPLE: 1,
  DENSITY_DISSIPATION: 0.95, // Slightly lower to keep density longer
  VELOCITY_DISSIPATION: 0.98, // Slightly lower for smoother motion
  PRESSURE_DISSIPATION: 0.8,
  PRESSURE_ITERATIONS: 25,
  CURL: 28,
  SPLAT_RADIUS: 0.00065 // Keep the radius unchanged
};

let pointers = [];
let splatStack = [];
let targetX = 0;
let targetY = 0;
const ease = 0.1; // Easing factor for smoothing

const { gl, ext } = getWebGLContext(canvas);

function getWebGLContext(canvas) {
  const params = { alpha: false, depth: false, stencil: false, antialias: false };

  let gl = canvas.getContext('webgl2', params);
  const isWebGL2 = !!gl;
  if (!isWebGL2)
    gl = canvas.getContext('webgl', params) || canvas.getContext('experimental-webgl', params);

  let halfFloat;
  let supportLinearFiltering;
  if (isWebGL2) {
    gl.getExtension('EXT_color_buffer_float');
    supportLinearFiltering = gl.getExtension('OES_texture_float_linear');
  } else {
    halfFloat = gl.getExtension('OES_texture_half_float');
    supportLinearFiltering = gl.getExtension('OES_texture_half_float_linear');
  }

  gl.clearColor(0.0, 0.0, 0.0, 1.0);

  const halfFloatTexType = isWebGL2 ? gl.HALF_FLOAT : halfFloat.HALF_FLOAT_OES;
  let formatRGBA;
  let formatRG;
  let formatR;

  if (isWebGL2) {
    formatRGBA = getSupportedFormat(gl, gl.RGBA16F, gl.RGBA, halfFloatTexType);
    formatRG = getSupportedFormat(gl, gl.RG16F, gl.RG, halfFloatTexType);
    formatR = getSupportedFormat(gl, gl.R16F, gl.RED, halfFloatTexType);
  } else {
    formatRGBA = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
    formatRG = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
    formatR = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
  }

  return {
    gl,
    ext: {
      formatRGBA,
      formatRG,
      formatR,
      halfFloatTexType,
      supportLinearFiltering
    }
  };
}

function getSupportedFormat(gl, internalFormat, format, type) {
  if (!supportRenderTextureFormat(gl, internalFormat, format, type)) {
    switch (internalFormat) {
      case gl.R16F:
        return getSupportedFormat(gl, gl.RG16F, gl.RG, type);
      case gl.RG16F:
        return getSupportedFormat(gl, gl.RGBA16F, gl.RGBA, type);
      default:
        return null;
    }
  }

  return {
    internalFormat,
    format
  };
}

function supportRenderTextureFormat(gl, internalFormat, format, type) {
  let texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);

  let fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status != gl.FRAMEBUFFER _COMPLETE_)
    return false;
  return true;
}

function pointerPrototype() {
  this.id = -1;
  this.x = 0;
  this.y = 0;
  this.dx = 0;
  this.dy = 0;
  this.color = [1, 1, 1]; // Default color
  this.moved = false;
}

function initPointers() {
  canvas.addEventListener('pointerdown', (event) => {
    const pointer = new pointerPrototype();
    pointer.id = event.pointerId;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.color = [Math.random(), Math.random(), Math.random()]; // Random color for each pointer
    pointers.push(pointer);
  });

  canvas.addEventListener('pointermove', (event) => {
    const pointer = pointers.find(p => p.id === event.pointerId);
    if (pointer) {
      pointer.dx = event.clientX - pointer.x;
      pointer.dy = event.clientY - pointer.y;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.moved = true;
    }
    // Update target position for smoothing
    targetX += (event.clientX - targetX) * ease;
    targetY += (event.clientY - targetY) * ease;
  });

  canvas.addEventListener('pointerup', (event) => {
    pointers = pointers.filter(p => p.id !== event.pointerId);
  });
}

function update() {
  resizeCanvas();

  const dt = Math.min((Date.now() - lastTime) / 1000, 0.016);
  lastTime = Date.now();

  gl.viewport(0, 0, textureWidth, textureHeight);

  if (splatStack.length > 0) {
    multipleSplats(splatStack.pop());
  }

  // Advection for velocity
  advectionProgram.bind();
  gl.uniform2f(advectionProgram.uniforms.texelSize, 1.0 / textureWidth, 1.0 / textureHeight);
  gl.uniform1i(advectionProgram.uniforms.uVelocity, velocity.read[2]);
  gl.uniform1i(advectionProgram.uniforms.uSource, velocity.read[2]);
  gl.uniform1f(advectionProgram.uniforms.dt, dt);
  gl.uniform1f(advectionProgram.uniforms.dissipation, config.VELOCITY_DISSIPATION);
  blit(velocity.write[1]);
  velocity.swap();

  // Advection for density
  gl.uniform1i(advectionProgram.uniforms.uVelocity, velocity.read[2]);
  gl.uniform1i(advectionProgram.uniforms.uSource, density.read[2]);
  gl.uniform1f(advectionProgram.uniforms.dissipation, config.DENSITY_DISSIPATION);
  blit(density.write[1]);
  density.swap();

  // Process pointers for splats
  pointers.forEach(pointer => {
    if (pointer.moved) {
      splat(pointer.x, pointer.y, pointer.dx, pointer.dy, pointer.color);
      pointer.moved = false;
    }
  });

  // Use smoothed target positions for splatting
  splat(targetX, targetY, 0, 0, [1, 1, 1]); // Example color for splat

  requestAnimationFrame(update);
}

function splat(x, y, dx, dy, color) {
  const brightnessAdjustment = -0.5354; // Decrease brightness
  const saturationFactor = 5; // Increase saturation

  const adjustedColor = [
    Math.max(0.0, color[0] + brightnessAdjustment),
    Math.max(0.0, color[1] + brightnessAdjustment),
    Math.max(0.0, color[2] + brightnessAdjustment)
  ];

  const luminance = 0.2126 * adjustedColor[0] + 0.7152 * adjustedColor[1] + 0.0722 * adjustedColor[2];
  const saturation = [
    Math.min(1.0, luminance + (adjustedColor[0] - luminance) * saturationFactor),
    Math.min(1.0, luminance + (adjustedColor[1] - luminance) * saturationFactor),
    Math.min(1.0, luminance + (adjustedColor[2] - luminance) * saturationFactor)
  ];
  
  // Apply to velocity
  splatProgram.bind();
  gl.uniform1i(splatProgram.uniforms.uTarget, velocity.read[2]);
  gl.uniform1f(splatProgram.uniforms.aspectRatio, canvas.width / canvas.height);
  gl.uniform2f(splatProgram.uniforms.point, x / canvas.width, 1.0 - y / canvas.height);
  gl.uniform3f(splatProgram.uniforms.color, dx, -dy, 1.0);
    gl.uniform1f(splatProgram.uniforms.radius, config.SPLAT_RADIUS);
    blit(velocity.write[1]);
    velocity.swap();

    // Apply to density
    gl.uniform1i(splatProgram.uniforms.uTarget, density.read[2]);
    gl.uniform3f(splatProgram.uniforms.color, finalColor[0] * 0.3, finalColor[1] * 0.3, finalColor[2] * 0.3);
    blit(density.write[1]);
    density.swap();
}

function multipleSplats(amount) {
  for (let i = 0; i < amount; i++) {
    const color = [Math.random() * 10, Math.random() * 10, Math.random() * 10];
    const x = canvas.width * Math.random();
    const y = canvas.height * Math.random();
    const dx = 1000 * (Math.random() - 0.5);
    const dy = 1000 * (Math.random() - 0.5);
    splat(x, y, dx, dy, color);
  }

}

// Initialize pointers and start the update loop
initPointers();
update();
