// Emit both arms' patched GLSL from a given breakmask module and sha1 it.
// The scalar arm is `wall.sheet` PASS 78's own path.
import { createHash } from 'node:crypto';
import * as THREE from 'three';

const mod = await import(process.argv[2]);
const { applyBreakMask } = mod;

// A stub shader carrying exactly the needles the patch looks for, in three's own order.
function stub() {
  return {
    uniforms: {},
    vertexShader: [
      '#include <common>', 'varying vec2 vMapUv;', 'void main() {',
      '  #include <uv_vertex>', '  #include <begin_vertex>', '  #include <project_vertex>', '}',
    ].join('\n'),
    fragmentShader: [
      '#include <common>', 'uniform vec3 diffuse;', 'void main() {',
      '  vec4 diffuseColor = vec4( diffuse, 1.0 );',
      '  #include <map_fragment>',
      '  #include <normal_fragment_maps>',
      '  #include <roughnessmap_fragment>',
      '  #include <metalnessmap_fragment>',
      '  #include <emissivemap_fragment>',
      '  gl_FragColor = diffuseColor;', '}',
    ].join('\n'),
  };
}

function emit(opts) {
  const m = new THREE.MeshStandardMaterial();
  applyBreakMask(m, opts);
  const s = stub();
  try { m.onBeforeCompile(s, {}); } catch (e) { return 'THREW: ' + e.message; }
  return s.vertexShader + '\n////\n' + s.fragmentShader;
}
const sha = (t) => createHash('sha1').update(t, 'utf8').digest('hex');

const tex = new THREE.Texture();
const arms = {
  scalar: { lipWidth: 0.055 },
  'scalar+field': { lipWidth: 0.062, field: tex, jag: 0.135, jagScale: [34, 17] },
  damage: { lipWidth: 0.062, damage: { texture: tex, band: [0.05, 0.42] } },
  'damage+secFloor': {
    lipWidth: 0.062, damage: { texture: tex, band: [0.42, 1.0] },
    secFloor: 7.0, core: 0.55, rimFloor: 2.5,
  },
};
for (const [k, o] of Object.entries(arms)) {
  const src = emit(o);
  console.log(k.padEnd(18), sha(src), String(src.length).padStart(7), 'chars');
}
