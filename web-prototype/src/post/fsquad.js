import * as THREE from 'three';

/** Shared fullscreen-triangle plumbing for every post pass. One geometry, one camera. */

const GEO = new THREE.BufferGeometry();
GEO.setAttribute('position', new THREE.BufferAttribute(
  new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
GEO.setAttribute('uv', new THREE.BufferAttribute(
  new Float32Array([0, 0, 2, 0, 0, 2]), 2));

const CAM = new THREE.Camera();

export const FS_VERT = /* glsl */ `
precision highp float;
in vec3 position;
in vec2 uv;
out vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export class FullScreenPass {
  constructor(fragmentShader, uniforms = {}, opts = {}) {
    this.material = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: FS_VERT,
      fragmentShader,
      uniforms,
      depthTest: false,
      depthWrite: false,
      ...opts,
    });
    this.scene = new THREE.Scene();
    this.mesh = new THREE.Mesh(GEO, this.material);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }
  get uniforms() { return this.material.uniforms; }
  set(name, value) { if (this.material.uniforms[name]) this.material.uniforms[name].value = value; }
  render(renderer, target = null) {
    renderer.setRenderTarget(target);
    renderer.render(this.scene, CAM);
  }
  dispose() { this.material.dispose(); }
}

export function rt(w, h, opts = {}) {
  return new THREE.WebGLRenderTarget(Math.max(1, w | 0), Math.max(1, h | 0), {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
    colorSpace: THREE.NoColorSpace,
    ...opts,
  });
}
