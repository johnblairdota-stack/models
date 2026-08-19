import { AO_UNIFORMS } from '../post/pipeline.js';
import { UNIT4H_COLORS } from './surfaces/robot.js';

/**
 * ===========================================================================================
 * FLAT-ALBEDO ("UNLIT") RENDER MODE          toggle: ?unlit=1 — absent = OFF, byte-identical
 * ===========================================================================================
 *
 * WHAT THIS IS FOR. Meshy bakes the texture of a new model from a reference image. If that
 * reference has our studio key light, its specular highlights and its contact shadows painted
 * into it, the model comes back with the lighting BAKED INTO ITS ALBEDO and is unusable. So
 * John needs a picture of the character that is design and nothing else: no key, no fill, no
 * rim, no environment, no specular, no shadow, no AO.
 *
 * ⚠️ THE OBVIOUS IMPLEMENTATION IS WRONG AND IT THROWS THE WHOLE CHARACTER AWAY.
 *
 * The tempting version is "swap every material for a MeshBasicMaterial carrying its own map".
 * On this character that produces a plain near-white body, because MOST OF THE DESIGN IS NOT
 * IN THE BAKED TEXTURES. The body is ONE mesh with ONE primitive and ZERO material slots; the
 * chrome upper arms and waist, the dark neck, the rubber soles, the mint caps, the joint
 * creases at elbow/knee/ankle/hip/shoulder, the chrome end caps, the calf panels, the waist
 * flexion ridges, the wrist rings and the panel-seam network are all written PER FRAGMENT at
 * render time by the shader injection in `surfaces/robot.js`, driven by skin weights and the
 * `aBoneEnd` attribute. A material swap discards every one of them.
 *
 * WHAT THIS DOES INSTEAD: KEEP EVERY MASK, DROP ONLY THE LIGHTING. By the time three reaches
 * `<opaque_fragment>`, `RRW_BODY` has already run and `diffuseColor.rgb` carries the finished
 * design as flat colour — the absolute chrome tint on chrome regions, the darkened albedo in
 * every crease, the dark and rubber families, the panel multiplies. All this does is write
 * that straight to `outgoingLight`, which is exactly the seam `?weather=debug` uses and for
 * exactly the same reason: it is the last point at which `outgoingLight` exists and
 * `diffuseColor` is still live.
 *
 * ⚠️ WRITING TO `outgoingLight` IS NOT ENOUGH ON ITS OWN — THE POST CHAIN GRADES IT. That is
 * why `?weather=debug3` bands its readout instead of printing greyscale: `post/shaders.js`'s
 * composite runs haze -> exposure -> **ACES** -> lift/gamma/gain -> saturation -> contrast ->
 * toe -> vignette -> grain -> dither, and ACES is applied UNCONDITIONALLY, in every grade,
 * including `studio`. A "flat" render that goes through it is not flat. The `studio` preset
 * also carries vignette 0.14 (so the corners of the figure are darker than its middle), a
 * bloom pass, and a CAS sharpen that rings at the silhouette.
 *
 * So the caller must ALSO bypass the composite. `Engine.renderRaw()` already exists for this —
 * it draws the scene straight to the canvas — and because `renderer.toneMapping` is
 * `NoToneMapping` (the pipeline owns tonemapping, not three), the ONLY transform left between
 * `outgoingLight` and the PNG is three's own linear -> sRGB encode. That makes the delivered
 * pixel the authored sRGB colour EXACTLY, with no residual grade error to quote.
 * `assertPostBypassed()` below is the check that this actually happened.
 *
 * TRAPS THIS CODE IS WRITTEN AROUND
 *  - A `String.replace` that matches nothing returns the string unchanged and throws nothing,
 *    so both replacements are ASSERTED (`unlitPatch`).
 *  - `patchForScreenAO` ASSIGNS `customProgramCacheKey` rather than composing it, so anything
 *    set there is discarded. The discriminator therefore rides in `material.defines`, which is
 *    hashed into the program key before `customProgramCacheKey` and which nothing rewrites.
 *    Same reasoning, same channel, as `RRR_WEATHER` in `surfaces/robot.js`.
 *  - A uniform used in the fragment shader but declared only in the vertex shader compiles to
 *    nothing and three then drops the draw silently. `uUnlitEmissive` is declared into the
 *    FRAGMENT header, on the same `void main() {` seam `patchForScreenAO` uses.
 *  - ORDER MATTERS AND IS NOT LEFT TO CHANCE. This patch must land AFTER `RRW_OPAQUE`
 *    (`outgoingLight *= 1.0 - rrwSeamOcc;`) or the seam grooves come back as occlusion on top
 *    of the flat colour. Chaining the previous `onBeforeCompile` FIRST and replacing after it
 *    guarantees our insertion sits closest to the include, i.e. last. The seam-occlusion
 *    variant is then an explicit opt-in rather than an accident of registration order.
 *  - NO BACKTICKS anywhere inside these template literals.
 */

/** `?unlit=1` turns the whole mode on. Absent or 0 = off, and off is an exact revert. */
export function unlitEnabled(params) {
  const v = params?.get?.('unlit');
  return v != null && v !== '' && v !== '0';
}

/**
 * `?unlitocc=1` puts the panel-seam grooves back as OCCLUSION.
 *
 * The network is design, but `rrwSeamOcc` is applied as `outgoingLight *= 1 - rrwSeamOcc`,
 * i.e. as shading. In a flat render that is a judgement call rather than a fact, so both are
 * reachable and John picks. Default 0 = the grooves survive only through the albedo darkening
 * that `RRW_BODY` already wrote into `diffuseColor`, which is the part that is unambiguously
 * paint.
 */
export function unlitSeamOcc(params) {
  const v = params?.get?.('unlitocc');
  return v != null && v !== '' && v !== '0';
}

/**
 * `?unlitemis=` scales the emissive term. DEFAULT 0 — emission is light, so it is excluded.
 *
 * ⚠️ THIS DEFAULT WAS 1 AND A PICTURE CHANGED IT. The argument for keeping emission was that
 * `surfaces/robot.js` says the face glow is "not paint, so it belongs in the emissive; a second
 * copy in the albedo would be paint", which reads as "drop the emissive and the face disappears".
 * Shot at 1 / 0.35 / 0, THE FACE IS PLAINLY THERE AT 0 — the eyes and the mouth are in the
 * albedo as well, and what the emissive actually adds is a bloom over the whole visor that lifts
 * the glass off its authored #2659A0 toward a pale teal. The same is true of the mint caps'
 * emissive floor: at 0 they land on #66CCB4 exactly, and above 0 they do not.
 *
 * So at 0 nothing of the design is lost and two more surfaces deliver their authored hex, while
 * anything above 0 puts a glow — which is emitted LIGHT — into a reference whose entire purpose
 * is to contain none. `?unlitemis=1` restores the old behaviour for looking at.
 */
export function unlitEmissive(params) {
  const raw = params?.get?.('unlitemis');
  if (raw === null || raw === undefined || raw === '') return 0.0;
  const v = Number(raw);
  return Number.isFinite(v) ? v : 0.0;
}

/** Shared so every patched material reads one value; set by `setUnlitEmissive`. */
export const UNLIT_UNIFORMS = {
  uUnlitEmissive: { value: 1.0 },
};

export function setUnlitEmissive(v) { UNLIT_UNIFORMS.uUnlitEmissive.value = v; }

/*
 * ⚠️ THE ONE TRANSFER FUNCTION, AND GETTING IT WRONG IS WHY THE FIRST CUT WAS 5% TOO LIGHT.
 *
 * `diffuseColor.rgb` does NOT hold a linear colour. This project's baker documents its albedo
 * slot as "sRGB — author the hex you want", and it means it literally: `C.shell` is
 * `[0.969, 0.939, 0.799]`, which is #F7EFCC divided by 255, stored and shaded as if those were
 * linear numbers. The lit look was tuned end-to-end around that convention, so it is not a bug
 * to fix — but it does mean the numbers in `diffuseColor` are sRGB, while three's
 * `<colorspace_fragment>` applies the sRGB OETF to whatever we hand it on the way to the canvas.
 *
 * Written naively, the authored value is therefore encoded TWICE. Measured on the first
 * unlit capture: the chest delivered #FBF8E7, which decodes to (0.964, 0.939, 0.797) — i.e. it
 * came back as `encode(C.shell)` rather than as `C.shell`, about 5 levels light on red and 27
 * on blue. Undoing the OETF here means the encode on the way out lands the DELIVERED PIXEL on
 * the AUTHORED HEX exactly, which is the only claim worth making about a colour reference.
 *
 * The emissive is added AFTER the conversion because `material.emissive` genuinely is linear
 * (`surfaces/robot.js` sets it through `rrwLinear()`), so the two live in different spaces and
 * must not be mixed before this line.
 */
const UNLIT_GLSL = /* glsl */ `
  // FLAT ALBEDO. diffuseColor already carries every render-time mask; see this file's header.
  vec3 rrrFlat;
  #if defined(RRR_UNLIT_SEAMOCC) && defined(RRR_WEATHER)
    rrrFlat = diffuseColor.rgb * (1.0 - rrwSeamOcc);
  #else
    rrrFlat = diffuseColor.rgb;
  #endif
  // sRGB -> linear, so three's output encode returns the authored value unchanged.
  rrrFlat = clamp(rrrFlat, 0.0, 1.0);
  outgoingLight = mix(rrrFlat / 12.92,
                      pow((rrrFlat + 0.055) / 1.055, vec3(2.4)),
                      step(vec3(0.04045), rrrFlat));
  outgoingLight += totalEmissiveRadiance * uUnlitEmissive;
`;

/** Replace two seams and PROVE both replacements happened. */
function unlitPatch(src) {
  for (const anchor of ['void main() {', '#include <opaque_fragment>']) {
    if (src.indexOf(anchor) === -1) {
      throw new Error(`unlit: anchor "${anchor}" not found in the fragment shader — the patch `
        + 'matched NOTHING and would have failed silently, rendering a fully lit frame that '
        + 'looks like a result. three.js chunk names have changed.');
    }
  }
  return src
    .replace('void main() {', 'uniform float uUnlitEmissive;\nvoid main() {')
    .replace('#include <opaque_fragment>', `${UNLIT_GLSL}\n#include <opaque_fragment>`);
}

const _patched = new WeakSet();

/**
 * Make one material render its albedo flat.
 *
 * Same guard as `patchForScreenAO`: only lit materials have `outgoingLight` to overwrite, and
 * a MeshBasicMaterial is already flat.
 */
export function patchForUnlit(material, opts = {}) {
  if (!material || _patched.has(material)) return material;
  if (!('roughness' in material) && !('shininess' in material)) return material;
  _patched.add(material);

  const seamOcc = !!opts.seamOcc;
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = function (shader, renderer) {
    // FIRST, deliberately — see the ORDER trap in this file's header. Everything the robot's
    // own injection does must already be in the string before we overwrite outgoingLight.
    if (prev) prev.call(this, shader, renderer);
    shader.uniforms.uUnlitEmissive = UNLIT_UNIFORMS.uUnlitEmissive;
    shader.fragmentShader = unlitPatch(shader.fragmentShader);
  };
  // Rides in `defines` because `patchForScreenAO` assigns `customProgramCacheKey` outright.
  material.defines = {
    ...(material.defines ?? {}),
    RRR_UNLIT: 1,
    ...(seamOcc ? { RRR_UNLIT_SEAMOCC: 1 } : {}),
  };
  material.needsUpdate = true;
  return material;
}

/**
 * Walk a scene graph and flatten every lit material found.
 *
 * ⚠️ CALL THIS AFTER `engine.finalizeScene()`. `finalizeScene` runs `patchForScreenAO`, which
 * chains onto `onBeforeCompile`; running after it is what puts our replacement last in the
 * chain and therefore last in the shader string.
 */
export function patchSceneForUnlit(root, opts = {}) {
  let n = 0;
  root.traverse((o) => {
    if (!o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) { if (patchForUnlit(m, opts) && _patched.has(m)) n++; }
  });
  return n;
}

/**
 * PUT THE CHROME FAMILY BACK ON ITS AUTHORED HEX.        `?unlitchrome=0` is the ablation
 *
 * ⚠️ THE CHROME TINT IS THE ONE COLOUR ON THIS CHARACTER THAT IS STORED PRE-LINEARISED, and it
 * makes chrome the only family that does NOT deliver its authored hex in a flat pass. Everything
 * else follows the baker's convention — `C.shell` and `C.gap` are sRGB triples and both come out
 * of the unlit pass EXACTLY — but `uRRWChrTint` is built as `rrwLinear(o.chrTint ?? C.chrome)`,
 * so what reaches `diffuseColor` at `RRW_BODY` line "mix(diffuseColor.rgb, uRRWChrTint, ...)" is
 * already a linear triple sitting in a slot the rest of the pipeline treats as sRGB.
 *
 * MEASURED, and predicted to the byte before it was measured. `mesh-animated.js` passes
 * `chrWarm: 0.045`, so the tint is (0.770, 0.745, 0.716) and `rrwLinear` takes it to
 * (0.554, 0.515, 0.471) = **#8D8378**, which is exactly what the first unlit capture delivered
 * on the upper-arm chrome core at three separate patches. Against the authored **#B9BEC2** that
 * is **-44 / -59 / -74**, and the error is not only level: R-B goes from -9 (cool metal) to +21
 * (warm putty), so the signature chrome arms and waist change character entirely.
 *
 * That would be a bad thing to hand a texture bake, so for this pass the uniform is set to the
 * sRGB triple directly, which both undoes the linearisation and drops the `dlcwarm` skew that
 * only exists to tune a LIT metal's hue. Uniform-only and per-boot: no material is rebuilt, no
 * other view is touched, and `?unlitchrome=0` reproduces the deviation above exactly.
 */
export function normaliseChromeTint(root) {
  const c = UNIT4H_COLORS.chrome;
  let n = 0;
  root.traverse((o) => {
    if (!o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      const u = m?.userData?.weathering?.uRRWChrTint;
      if (u && u.value && typeof u.value.set === 'function') { u.value.set(c[0], c[1], c[2]); n++; }
    }
  });
  return n;
}

/**
 * Redirect the engine's render call past the whole post stack.
 *
 * This is the half of the mode that makes the delivered pixel equal the authored one. It is
 * deliberately a redirect of `pipeline.render` rather than an edit to `core/engine.js`: the
 * engine already exposes `renderRaw()` for the silhouette mode, the substitution is confined
 * to the one boot that asked for `?unlit=1`, and no shared file changes.
 */
export function bypassPostChain(engine, opts = {}) {
  if (engine.__unlitBypassed) return engine;
  engine.__unlitBypassed = true;

  /*
   * ⚠️ THE BACKGROUND CLEAR IS NOT COLOUR-MANAGED ON THIS BUILD, AND IT IS MEASURED, NOT GUESSED.
   *
   * `_studio.js` sets `scene.background = new Color(bg).convertSRGBToLinear()`, which is right
   * for a chain that encodes on output. This one does not: with `?bg=808080` the delivered
   * background measured #373737 = 55, and 55/255 = 0.216 is exactly
   * `SRGBToLinear(0.502)` — i.e. the raw stored value reached `gl.clearColor` with no encode,
   * while OBJECTS did get the OETF (the same capture's chest came back double-encoded). Two
   * different paths, so they need two different corrections.
   *
   * Storing the UNCONVERTED sRGB fraction therefore delivers the authored hex exactly. This
   * matters beyond tidiness: the background is the one colour in the frame whose authored value
   * is unarguable, so it is the free end-to-end check on the whole colour path, and anything
   * that later masks the figure out of these PNGs needs it to be the flat value it asked for.
   */
  if (opts.bg != null && engine.scene.background?.setHex) {
    engine.scene.background.setHex(opts.bg);
  }

  /*
   * WRAP THE COMPOSITE BEFORE REPLACING THE RENDER CALL, because "did the grade run?" has to be
   * measured at the grade rather than inferred from the thing that was supposed to skip it.
   * `composite` is the pass that applies ACES and the whole lift/gamma/gain/vignette/grain
   * chain, so one boolean set from inside it is the honest answer.
   */
  const comp = engine.pipeline.composite;
  if (comp && typeof comp.render === 'function') {
    const inner = comp.render.bind(comp);
    comp.render = (...a) => { engine.__unlitCompositeRan = true; return inner(...a); };
  }
  if (!globalThis.__UNLIT_CONTROL_NO_BYPASS) engine.pipeline.render = () => engine.renderRaw();

  /*
   * 🚨 AND THE AO BUFFER HAS TO BE SILENCED EXPLICITLY — THIS WAS A REAL DEFECT, NOT A TIDY-UP.
   *
   * `AO_UNIFORMS.uAOEnabled` is raised to 1 in `Pipeline.setSize()`, which runs from the Engine
   * CONSTRUCTOR, not in `Pipeline.render()`. So under the bypass the flag sat at 1 while the AO
   * pass never ran again: `patchForScreenAO` kept multiplying indirect light by a stale
   * `tScreenAO`, and — the part that actually matters here — `RRW_BODY` kept pooling cavity
   * grime into the ALBEDO from that same never-updated buffer, which lands in `diffuseColor`
   * and therefore straight into the flat render. Forcing both the uniform and the pipeline's
   * own flag off is what makes "no screen-space AO" true rather than merely intended.
   */
  if (!globalThis.__UNLIT_CONTROL_NO_AOOFF) {
    AO_UNIFORMS.uAOEnabled.value = 0;
    engine.pipeline.aoEnabled = false;   // or the next setSize() raises it again
  }

  // Shadow maps are pure lighting and must not reach the figure or the ground.
  engine.renderer.shadowMap.enabled = false;
  for (const l of Object.values(engine.lights ?? {})) { if (l) l.castShadow = false; }
  // The cyc is a lit, shadow-receiving backdrop; hiding it leaves the flat clear colour, which
  // is the only background that cannot carry a gradient or a contact shadow.
  if (engine.cyc) engine.cyc.visible = false;
  return engine;
}

/**
 * THE GUARD, AND IT HAS A CONTROL THAT HAS BEEN WATCHED FAIL.
 *
 * Everything above can be in place and the capture can still come back graded, because the
 * bypass is a runtime substitution and a substitution that did not take produces a picture that
 * still looks like a robot — flat-ish, plausible, wrong. So this asserts on the two things that
 * can actually be measured rather than on the thing that was supposed to happen:
 *
 *   1. THE COMPOSITE NEVER RAN. Measured inside the composite pass itself, which is where ACES
 *      and the grade live. This is the direct statement.
 *   2. THE AO BUFFER IS INERT. `RRW_BODY` pools cavity grime into the ALBEDO whenever this is
 *      live, so it would reach the flat render even though the light multiply would not.
 *
 * ⚠️ AN EARLIER VERSION OF THIS GUARD ASSERTED (2) ALONE AND JUSTIFIED IT WITH "only
 * Pipeline.render() ever raises uAOEnabled". THAT IS FALSE — `Pipeline.setSize()` raises it,
 * from the Engine constructor. The guard fired on the first real boot and the flag turned out
 * to be genuinely stuck at 1 with the AO pass never running, which is the defect now fixed in
 * `bypassPostChain`. Recorded because the wrong reason produced the right outcome only by luck.
 *
 * CONTROLS, both watched fail before shipping:
 *   - remove the `pipeline.render` line from `bypassPostChain` -> (1) throws, composite ran.
 *   - remove the `uAOEnabled` line              -> (2) throws, uAOEnabled reads 1.
 *
 * ⚠️ AND IT MUST BE CALLED ON A LATER FRAME. Both flags start in the passing state, so calling
 * this before any frame has rendered passes without testing anything.
 */
export function assertPostBypassed(engine) {
  if (!engine.__unlitBypassed) {
    throw new Error('unlit: bypassPostChain() was never called — the composite would tonemap '
      + 'and grade the flat colour, and the capture would look flat without being flat.');
  }
  if (engine.__unlitCompositeRan) {
    throw new Error('unlit: the COMPOSITE PASS RAN. ACES, the lift/gamma/gain grade, the '
      + 'vignette and the grain have all been applied, so this frame is not flat and no pixel '
      + 'in it is the authored colour. The pipeline.render substitution did not take.');
  }
  if (AO_UNIFORMS.uAOEnabled.value !== 0) {
    throw new Error('unlit: the screen-space AO buffer is LIVE (uAOEnabled = '
      + `${AO_UNIFORMS.uAOEnabled.value}) while the AO pass is not running, so tScreenAO is `
      + 'stale. RRW_BODY pools cavity grime into the albedo from it, which puts occlusion into '
      + 'a render whose whole purpose is not to have any.');
  }
  return true;
}
