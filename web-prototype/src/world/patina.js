import * as THREE from 'three';

/**
 * PATINA — the dirt layer, shared by the ballroom showcase and the playable ballroom.
 *
 * Extracted from `views/room-ballroom.js` (round 17) when the game's room was brought up to
 * match it. It was written there and it is unchanged here; what follows is why it is shaped
 * the way it is, because every line of it is a correction to something that was tried first.
 *
 * ⚠️ A MULTIPLY, NOT AN ADDITIVE — AND THIS PROJECT HAS ALREADY PAID TO LEARN IT. The light
 * pools in the ballroom were additive until round 3, and an additive decal over a
 * black-and-white chequer lifts the black tiles as hard as the white ones, so the pattern
 * dissolves inside the decal and its own rectangle becomes a visible seam. Dirt has exactly
 * the same job in reverse: it must SCALE what is under it, so a gilt moulding under grime
 * stays gilt and a pale wall stays pale, both a stop down. The factor is exactly 1.0 outside
 * the band for the same reason.
 *
 * ⚠️ THREE FREQUENCIES, BECAUSE ONE IS A GRADIENT AND A GRADIENT IS NOT DIRT:
 *   · the vertical rise from the floor (or fall from a sill, via `flip`)
 *   · a two-octave horizontal wander, so no two metres of skirting are alike
 *   · a corner term that doubles it in the last metre of each run — which is the specific
 *     thing `CRITIC_GUIDE.md` asks for, and what a viewer reads as "nobody sweeps in here"
 *
 * ⚠️ AND `macro`, WHICH IS A DIFFERENT JOB IN THE SAME SHADER. Detail at one frequency is the
 * guide's second named failure, and the ballroom had geometry detail (panels, mouldings) and
 * fine detail (craquelure, grain) with nothing in between. `macro` runs two octaves of value
 * noise at 1-4 m over the WHOLE plane rather than only inside the band's falloff, smoothstepped
 * so most of the wall is untouched and the stains are the exception — damp that came through
 * once and dried, a patch that was washed, a run from a leak.
 */
const GRIME_FRAG = /* glsl */ `
    precision highp float;
    uniform vec3  uTint;
    uniform float uStrength;
    uniform float uCorner;
    uniform float uFlip;
    uniform float uMacro;
    uniform vec2  uMacroScale;
    varying vec2 vUv;
    // ---- MACRO PATINA (round 17, fifth pass) ------------------------------------------
    // The blind pair against refs/bf1/bf1-ballroom-01.png comes down to this and it is the
    // guide's second named failure, "only one detail frequency". This room now has detail at
    // the GEOMETRY frequency (panels, mouldings, boards, folds) and at the FINE frequency
    // (craquelure, grain, plaster tooth) and nothing in between. The reference's walls are
    // not uniform fields with clean gilt lines on them — every bay carries metre-scale
    // blotching: damp that came through once and dried, a patch that was washed, a run from
    // a leak. That is the frequency a viewer reads as "this surface has a history".
    //
    // Two octaves of value noise at 1-4 m, multiplied, at very low contrast. It has to be a
    // MULTIPLY for the same reason the skirting grime and the light pools are — a patina
    // scales what is under it, so gilt stays gilt and plaster stays plaster, both a little
    // down where the stain sits.
    float h21g(vec2 p){
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }
    float vnG(vec2 p){
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(h21g(i), h21g(i + vec2(1.0, 0.0)), f.x),
                 mix(h21g(i + vec2(0.0, 1.0)), h21g(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    void main(){
      // up the wall from the skirting, or DOWN from a sill — uFlip is which. Under-sill
      // staining is the same phenomenon upside down (water and dust come off a ledge and run)
      // and the guide names it in the same breath as the floor line.
      float y = mix(vUv.y, 1.0 - vUv.y, uFlip);
      float g = pow(max(0.0, 1.0 - y), 2.4);
      // along the wall: a slow wander, two octaves, so the band is never even
      float w = 0.70
        + 0.20 * sin(vUv.x * 11.0 + 0.7)
        + 0.10 * sin(vUv.x * 41.0 + 2.3);
      // and the corners, where a floor never gets swept
      float c = 1.0 + uCorner * (smoothstep(0.16, 0.0, vUv.x) + smoothstep(0.84, 1.0, vUv.x));
      float a = clamp(g * w * c * uStrength, 0.0, 1.0);
      // the patina runs over the WHOLE plane, not just the band's falloff
      vec2 mp = vUv * uMacroScale;
      float m = vnG(mp) * 0.62 + vnG(mp * 2.7 + 11.3) * 0.38;
      // biased so most of the wall is untouched and the stains are the exception
      a = clamp(a + uMacro * smoothstep(0.42, 0.92, m), 0.0, 1.0);
      gl_FragColor = vec4(mix(vec3(1.0), uTint, a), 1.0);
    }`;

const GRIME_VERT = 'varying vec2 vUv;\nvoid main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';

/**
 * One grime/patina quad.
 *
 * @param o.w,o.h      plane size in metres
 * @param o.tint       what the multiply pulls toward — cool and slightly green by default,
 *                     because a room whose bounce is warm needs dirt that is not, or it reads
 *                     as a lighting change rather than as dirt
 * @param o.strength   the band's own falloff strength (0 for a pure patina plane)
 * @param o.flip       0 = rises from the floor, 1 = falls from a sill
 * @param o.corner     how much the last metre of each run doubles up
 * @param o.macro      the full-plane patina term
 * @param o.scale      metres per macro-noise cell (3.2 is what the ballroom ships)
 */
export function grimeBand(o = {}) {
  const w = o.w ?? 4, h = o.h ?? 1.15;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.ShaderMaterial({
    vertexShader: GRIME_VERT,
    fragmentShader: GRIME_FRAG,
    uniforms: {
      uTint: { value: new THREE.Color(o.tint ?? 0x8e9088) },
      uStrength: { value: o.strength ?? 0.5 },
      uCorner: { value: o.corner ?? 1.15 },
      uFlip: { value: o.flip ?? 0 },
      uMacro: { value: o.macro ?? 0 },
      uMacroScale: { value: new THREE.Vector2(w / (o.scale ?? 3.2), h / (o.scale ?? 3.2)) },
    },
    transparent: true,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor,
    blendEquationAlpha: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    depthWrite: false, depthTest: true, side: THREE.DoubleSide, toneMapped: true,
  }));
  m.name = 'grime';
  m.castShadow = false;
  m.receiveShadow = false;
  return m;
}
