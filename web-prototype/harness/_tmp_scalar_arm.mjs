/**
 * Is the SCALAR arm's emitted GLSL still free of every trace of the damage arm?
 * Pure node — no GPU, no browser, safe to run beside a playtest.
 */
import * as THREE from 'three';
import { applyBreakMask } from '../src/materials/breakmask.js';

const FRAG = `
uniform vec3 diffuse;
void main() {
	#include <map_fragment>
	#include <roughnessmap_fragment>
	#include <metalnessmap_fragment>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
}
`;
const VERT = `
void main() {
	gl_Position = vec4(0.0);
}
`;

function emit(opts) {
  const m = new THREE.MeshStandardMaterial();
  m.roughnessMap = new THREE.Texture();
  m.roughnessMap.image = { width: 1024, height: 1024 };
  applyBreakMask(m, opts);
  const shader = { uniforms: {}, fragmentShader: FRAG, vertexShader: VERT };
  m.onBeforeCompile(shader, null);
  return { shader, m };
}

const scalar = emit({ lipWidth: 0.07, jag: 0.13, jagScale: [110, 110] });
const dmgTex = new THREE.Texture();
const damage = emit({
  lipWidth: 0.07, jag: 0.13, jagScale: [110, 110],
  damage: { texture: dmgTex, band: [0.14, 0.5] },
  cutDepth: 0.036, faceSize: [5.72, 2.8], dmgStep: [0.033, 0.067],
});

const BANNED = ['tDamage', 'vDmgUv', 'vDmgView', 'vDmgT', 'uCut', 'uOrderLod', 'uOrderGain',
  'uDmgBand', 'uDmgStep', 'uFaceSize', '_rrrOrder', '_rrrBand', '_rrrFront', '_rrrGrad',
  '_bgDx', 'textureLod', 'textureGrad', '_cf', '_front', '_cut', 'inverse('];
const hitsF = BANNED.filter((b) => scalar.shader.fragmentShader.includes(b));
const hitsV = BANNED.filter((b) => scalar.shader.vertexShader.includes(b));

console.log('scalar fragment length', scalar.shader.fragmentShader.length);
console.log('scalar vertex unchanged:', scalar.shader.vertexShader === VERT);
console.log('scalar banned-token hits (fragment):', hitsF.length ? hitsF : 'none');
console.log('scalar banned-token hits (vertex):  ', hitsV.length ? hitsV : 'none');
console.log('scalar uniforms:', Object.keys(scalar.shader.uniforms).sort().join(' '));
console.log('scalar patch hits:', JSON.stringify(scalar.m.userData.breakPatch));
console.log('scalar defines:', JSON.stringify(scalar.m.defines));
console.log('scalar cache key:', scalar.m.customProgramCacheKey());
console.log('');
console.log('damage patch hits:', JSON.stringify(damage.m.userData.breakPatch));
console.log('damage defines:', JSON.stringify(damage.m.defines));
console.log('damage cache key:', damage.m.customProgramCacheKey());
console.log('damage uniforms:', Object.keys(damage.shader.uniforms).sort().join(' '));
console.log('damage vertex writes vDmgView:', damage.shader.vertexShader.includes('vDmgView ='));

// the scalar map body, spelled out, so a future edit that "tidies" it is caught here
const EXPECTED_SCALAR_HEAD = `
        float _order = 1.0;
        if (uUseOrmAlpha > 0.5) _order = texture2D(tBreakField, vMapUv).a;`;
console.log('scalar map body starts as before:',
  scalar.shader.fragmentShader.includes(EXPECTED_SCALAR_HEAD));
console.log('scalar still discards on uBreak:',
  scalar.shader.fragmentShader.includes('if (_order < uBreak) discard;'));

process.exit(hitsF.length || hitsV.length ? 1 : 0);
