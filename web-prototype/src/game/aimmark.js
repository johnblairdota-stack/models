import * as THREE from 'three';
import { BRUSH_R, OPEN_AT } from '../destruction/damagefield.js';

/**
 * 🎯 **THE DIG MARK — where the next blow lands, at the size it actually is.**
 *
 * John, after playtesting (2026-08-10): *"with how it is working it only makes sense to attack
 * the base of the wall near the ground but this is actually hard to target. the feel is that I
 * need to look far down and target the bottom of the wall but that's not intuitive to a new
 * player… we need to work on how we target and what that feels like."*
 *
 * The trap he named is a loop: `support.js` rewards an UNDERCUT, the third-person boom makes
 * looking down awkward, and a crater at chest height leaves a sill you cannot step over. So the
 * game rewards a thing it makes hard to do. **This does not change the skill — it makes the
 * existing skill visible.** He still aims; what is removed is the guessing.
 *
 * ---------------------------------------------------------------------------
 * 🚨 **IT IS HONEST ABOUT ITS OWN SIZE, AND THAT IS THE WHOLE DESIGN CONSTRAINT.**
 *
 * A crosshair-sized dot would LIE. `damagefield.js` `_add()` takes its whole brush disc through
 * the wall in one blow at the shipped base, and that disc is
 *
 *     R = BRUSH_R * (0.55 + 0.45 * min(1, power))          // 0.52 m at power >= 1
 *
 * i.e. **1.04 m across**. A player aiming a dot at a point would watch a metre either side of it
 * vanish, learn that the mark is decorative, and go back to guessing. So the ring IS that radius,
 * read off the FACE'S OWN brush (`field.brush.radius`, not a copy of the constant), and it
 * shrinks with `[` exactly as the brush does — 0.63 m across at x0.125, 0.69 at x0.25, 0.81 at
 * x0.5, 1.04 at x1 and above.
 *
 * ⚠️ **IT IS THE NOMINAL BRUSH, WHICH IS THE PART THAT ALWAYS GOES — AND THE REAL BLOW HAS AN
 * IRREGULAR FRINGE OUTSIDE IT.** Measured (`aim-mark.mjs` A2, one real blow on a pristine face at
 * the shipped base): the furthest cell to take **half** the peak increment is **0.628 m** out,
 * i.e. **1.256 m across** — 1.21x the ring — because `GRAIN` and `LOBE` displace the rim outward
 * per texel and a negative displacement pulls a cell beyond `R` back inside the brush. The ring
 * is deliberately the guaranteed disc rather than the outer envelope: **over-promising is the
 * lie that costs you a sill, under-promising costs a second blow.** A2 asserts both directions
 * separately for exactly that reason, and not as one symmetric percentage.
 *
 * ⚠️ **AND IT STOPS GROWING AT x1, WHICH IS ALSO HONEST.** `_add()`'s clamp is SPLIT: above 1 the
 * power deepens the deposit and does **not** widen the brush. `]` past x1 therefore moves nothing
 * about this ring, and the ring saying so is the correct behaviour, not a missing feature.
 *
 * ---------------------------------------------------------------------------
 * 🎯 **IT IS ON THE WALL, NOT ON THE SCREEN, AND IT FOLLOWS THE CRATER.**
 *
 * A reticle pinned to screen centre is a different (and much cheaper) object, and it is not this:
 * it cannot show a footprint in metres, it cannot sit in the hole you already dug, and it cannot
 * tell you that half of your next blow is going to land in fresh air. Every one of the ring's
 * `SEG` samples is placed with `panel.pointAt(u, v)` and then sunk into the crater by that
 * texel's own dig depth, so the ring bends into the bowl and its lowest point is genuinely the
 * lowest material the blow will touch. That lowest point is the thing John has to line up with
 * the floor, so it has to be a real position and not an approximation.
 *
 * ⚠️ **THE SINK IS ONLY APPLIED ON A FACE'S OWN FRONT SURFACE.** A ray that goes through your own
 * side's hole hits the TWIN, and a twin's `depth` is measured from ITS face, on the far side of
 * the 0.30 m band — sinking by it there would push the ring out of the wall toward the player
 * instead of into it. The twin's surface really is flat at the near plane, so the ring is flat
 * there too. `castRay` hands back the box face it hit, and the dot product with the panel's own
 * normal is what tells the two cases apart.
 *
 * ---------------------------------------------------------------------------
 * 🎨 **IT HAS TO READ ON THREE VERY DIFFERENT SURFACES**, because the dig tears through all three
 * of them: the ornate coat (dark, warm, high-frequency), the white shell underneath, and the cyan
 * structure. No single colour survives all three — a white ring dies on the shell, a dark ring
 * dies in the coat's shadowed relief. So the ring is a **sandwich**: a bright core with a dark
 * casing on both shoulders, the same trick a map contour and a rifle reticle use. Whichever way
 * the background goes, one of the two strokes is against it.
 *
 * ---------------------------------------------------------------------------
 * 🕸️ **MODE 2 FUSES IT WITH THE STRAIN TELL, AND `?mark=1` IS THE ABLATION.**
 *
 * `support.js` `strain()` already writes the damage texture's **A channel** where material is
 * past `nearFrac` (45%) of the collapse threshold, and `breakmask.js` draws it as crazing. That
 * is the tell for the taught skill — undercut a span and the storey comes down. Targeting and
 * that skill are the same question asked twice, so the ring reads the same byte (never writes it;
 * `breakmask.js` is not this slice's file) and carries two extra facts at no extra draw call:
 *
 *   · where the wall is **already gone**, the core fades out — that part of the blow is free air
 *     and will remove nothing. This is the direct answer to "what will this blow accomplish".
 *   · where the wall is **straining**, the core goes amber. Amber is used nowhere else in the
 *     dig's palette, so it cannot be confused with coat, shell or cyan.
 *
 * ⚠️ **WHETHER THAT IS ONE IDEA TOO MANY IS A LOOK CALL AND A BUILDER MUST NOT MAKE IT ALONE**,
 * which is why it is a mode and not a constant. `?mark=0` off · `?mark=1` plain ring · `?mark=2`
 * fused (the default in live play). My recommendation is 2: the two facts arrive on samples the
 * ring already had to take, and the alternative is a second affordance for a player to learn.
 *
 * ---------------------------------------------------------------------------
 * 📉 **ONE MESH, ONE MATERIAL, ONE DRAW CALL, AND IT IS NEVER REBUILT.** HANDOFF's budget rule is
 * that the unit is the MESH, not the material name (`calls-1`: one gadget prop is 39–205 calls
 * because it is 44–161 sub-meshes). This is a single indexed `BufferGeometry` whose positions and
 * colours are rewritten in place; hiding it is `visible = false`, which costs nothing.
 */

/** Angular samples round the ring. 64 is smooth at arm's length and 640 triangles. */
const SEG = 64;
/**
 * The five radial bands, as metres either side of the brush radius. Outer pair fade to alpha 0
 * so the stroke has no aliased edge against a busy coat.
 *
 *   -W2 .. -W1   dark, fading in
 *   -W1 .. -WC   dark
 *   -WC .. +WC   the bright core — this is the line the eye actually tracks
 *   +WC .. +W1   dark
 *   +W1 .. +W2   dark, fading out
 */
/**
 * ⚠️ **THE CASING IS WIDER THAN IT LOOKS LIKE IT SHOULD BE, AND THAT IS THE WHITE SHELL'S DOING.**
 * Measured (`aim-mark.mjs` A5, ON/OFF in one frozen page): at a 10 mm casing the ring moved
 * 0.302% of the frame at mean 58 luma on the ornate coat and only **0.13% at mean 28** once the
 * dig had reached the white shell — because on white the bright core contributes nothing and the
 * whole read is the two dark shoulders. Half the contrast on the surface you spend most of a dig
 * looking at is the wrong way round, so the ink got the extra millimetres rather than the core.
 */
/**
 * 🚨 **AND WIDENING IT AGAIN IS THE ONE THING THAT DOES NOT WORK — 10 → 16 mm ALREADY HAPPENED
 * AND IT STAYED WEAK.** `critic-dig-8` A/B'd `game.play.aimmark-shell-{ON,OFF}.png` at 3x and
 * ruled: *"shown ON alone I'd have called it a lighting gradient… it needs a hard thin dark
 * contour (ink only) on bright surfaces — area isn't the deficit."*
 *
 * 🎯 **SO NOT ONE MILLIMETRE OF FOOTPRINT IS ADDED. `W2` IS UNCHANGED AT 36 mm AND THE RING IS
 * THE SAME 72 mm ACROSS. WHAT CHANGES IS THAT THE OUTER 11 mm STOPS BEING A FADE.** `W1` moves
 * 25 → 33 mm, which converts eight of those millimetres from gradient into ink and leaves a 3 mm
 * feather — about ONE PIXEL of antialiasing at a dig's viewing distance, which is all the outer
 * edge ever needed. A stroke whose edge takes eleven millimetres to arrive **is** a lighting
 * gradient; the eye has nothing to lock onto. The stroke is now drawn, not implied.
 *
 * (The inner shoulders are untouched: the core is still 18 mm and the ink still starts at 9 mm.)
 */
const WC = 0.009, W1 = 0.033, W2 = 0.036;
const RINGS = [-W2, -W1, -WC, WC, W1, W2];
const FADE = [0, 1, 1, 1, 1, 0];
/** 1 where the vertex ring carries the bright core, 0 where it carries the dark casing. */
const CORE = [0, 0, 1, 1, 0, 0];

/**
 * 🚨 **AND ONE HALF OF THE PRESCRIPTION WAS TRIED, MEASURED AND REFUTED — SAID PLAINLY SO NOBODY
 * RE-DERIVES IT.**
 *
 * `critic-dig-8` B-ii's mechanism was *"on a bright surface the bright core contributes nothing,
 * so the whole read falls to the ink"*, and its prescription was **"ink only, no core"**. The
 * first half is wrong, and `aim-mark` A5 is what says so: dropping the core on bright samples
 * moved the white shell from **0.191% of frame at mean 29.2 luma to 0.154% at 23.6** — *less*
 * contrast, not more. The core was the LARGER of the two contributors there, because this
 * project's "white shell" does not render anywhere near white: it sits well below the core's
 * 0.94, so a bright stroke on it is a real luma step and not a no-op.
 *
 * ✅ **THE OTHER HALF — "a hard thin dark contour" — IS THE WHOLE FIX AND IT WORKS.** On the
 * coat, `W1` 25 → 33 mm moved the mark from **0.36% at 57.4 to 0.364% at 66.5**: identical area,
 * **+16% mean contrast**. That is the shape of the right change to this ring — the edge, not the
 * area, and not the core.
 *
 * So the ring keeps its sandwich on every surface and the depth read is spent on the one thing
 * it is unambiguously good for: **the ink goes to full alpha where the coat has torn off**, since
 * on the shell and the cyan there is no dark surround for it to bite against. `DAMAGE_BANDS[0]`
 * is the ornate skin and it tears over `[0.005, 0.155]`, so past 0.14 the texel under this sample
 * is shell or deeper.
 */
const BRIGHT_AT = 0.14;
/** Ink alpha. Full past the coat: there is no dark surround there for a 0.92 stroke to bite on. */
const INK_A = 0.92, INK_A_BRIGHT = 1.0;

/** How far off the surface the ring floats, in metres. Enough to clear z-fighting, not enough to see. */
const STANDOFF = 0.014;

/**
 * ⚠️ **NOT PURE BLACK.** HANDOFF: the grade applies `contrast` around a 0.5 pivot, so at 1.05
 * everything under colour 0.0238 is clamped to zero before display. A 0.0 casing would come out
 * of the pipe as the same value as every shadow in the room; 0.055 survives the clamp and still
 * reads as ink.
 */
const INK = new THREE.Color(0.055, 0.052, 0.050);
/** The core against coat and cyan. Kept off 1.0 so the bloom does not smear it. */
const LIT = new THREE.Color(0.94, 0.95, 0.96);
/** Straining material. Amber appears nowhere else in coat / shell / cyan. */
const HOT = new THREE.Color(1.00, 0.62, 0.16);
/** Already through — there is nothing here for the blow to take. */
const GONE_ALPHA = 0.16;

const _uv = { u: 0, v: 0, z: 0 };
const _p = new THREE.Vector3();
const _toEye = new THREE.Vector3();

export class AimMark {
  /**
   * @param {THREE.Object3D} parent  the scene. NEVER `room.trackLoose` — this belongs to the
   *   player's frame, exactly like the player's own body, and residency must have no opinion
   *   about it (`room.js` `trackLoose`: "Never the player or the hunter").
   * @param {object} [o]
   * @param {number} [o.mode=2]  0 off · 1 plain ring · 2 fused with the strain tell
   */
  constructor(parent, o = {}) {
    this.mode = o.mode ?? 2;
    this.radius = 0;
    this.panelId = null;

    const n = SEG * RINGS.length;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 4);
    const idx = [];
    for (let b = 0; b < RINGS.length - 1; b++) {
      for (let s = 0; s < SEG; s++) {
        const s1 = (s + 1) % SEG;
        const a = b * SEG + s, c = b * SEG + s1;
        const d = (b + 1) * SEG + s, e = (b + 1) * SEG + s1;
        idx.push(a, d, c, c, d, e);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 4));
    g.setIndex(idx);
    this.geo = g;
    this.mat = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false, depthTest: true,
      side: THREE.DoubleSide, toneMapped: false, fog: false,
    });
    this.mat.name = 'aim.mark';
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.name = 'aim.mark';
    // positions are rewritten every frame and the bounding sphere is never recomputed, so the
    // frustum test would be reading a stale volume. One small object; the test is worth nothing.
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    this.mesh.visible = false;
    this.mesh.matrixAutoUpdate = false;
    parent.add(this.mesh);
  }

  setMode(m) { this.mode = m | 0; if (!this.mode) this.mesh.visible = false; return this.mode; }

  /**
   * 🎯 THE FOOTPRINT OF ONE BLOW, IN METRES — the same arithmetic `_add()` uses and nothing else.
   * Reads the FACE'S brush so a face with a custom brush is drawn at its own size rather than at
   * the module constant's.
   */
  static footprint(field, power) {
    const r = field?.brush?.radius ?? BRUSH_R;
    return r * (0.55 + 0.45 * Math.min(1, Math.max(0, power)));
  }

  /**
   * Called once a frame with the live player. Everything it needs is already computed:
   * `player.workAim` is `_stepWorkAim`'s cast, which is byte-for-byte the ray
   * `_resolveSledgeHit` will damage with — see `Player._swingRay`. If these two ever came from
   * different rays the mark would be a picture of a wall the hammer does not hit.
   */
  update(player) {
    const aim = this.mode ? player?.workAim : null;
    const panel = aim?.panel ?? null;
    const field = panel?.field ?? null;
    // A scalar (stage-machine) panel has no brush and therefore no honest footprint to draw.
    if (!aim || !field) { this.mesh.visible = false; this.panelId = null; return false; }

    const power = player.nextBlowPower();
    const R = AimMark.footprint(field, power);
    this.radius = R;
    this.panelId = panel.id;

    panel.uvAt(aim.point, _uv);
    const cu = _uv.u, cv = _uv.v;
    const du = R / panel.width, dv = R / panel.height;

    // Which way is out of the wall, from here? `castRay` hands back the face of the box it hit,
    // so this is +normal on a face's own front surface and -normal when the ray came through your
    // own side's hole and landed on the twin's back. See the header.
    _toEye.copy(aim.normal);
    const own = _toEye.dot(panel.normal);
    const sgn = own >= 0 ? 1 : -1;
    // Only a face's OWN front surface recedes with its depth — see the header.
    const sink = own > 0.5 ? panel.bandThickness : 0;

    const nx = panel.normal.x * sgn, nz = panel.normal.z * sgn;
    const pos = this.geo.attributes.position.array;
    const col = this.geo.attributes.color.array;
    const fused = this.mode >= 2;
    const data = field.data;

    for (let s = 0; s < SEG; s++) {
      const a = (s / SEG) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const u = cu + du * ca, v = cv + dv * sa;

      // Outside the face is the wall it is cut into: solid, undug, unstrained.
      const off = u < 0 || u > 1 || v < 0 || v > 1;
      const depth = off ? 0 : field.depthAt(u, v);
      let strain = 0;
      if (fused && !off) {
        const cx = Math.min(field.cols - 1, Math.max(0, Math.floor(u * field.cols)));
        const cy = Math.min(field.rows - 1, Math.max(0, Math.floor(v * field.rows)));
        strain = data[field.idx(cx, cy) * 4 + 3] / 255;
      }
      const gone = depth >= OPEN_AT;
      // 🎨 Is the wall under this sample still wearing its coat? See BRIGHT_AT. Not gated on
      // `fused` — this is legibility, not a mode, so `?mark=1` gets it too.
      const bright = depth >= BRIGHT_AT;

      // the core's colour and weight at this angle
      let cr = LIT.r, cg = LIT.g, cb = LIT.b, ca4 = 1;
      // ⚠️ The core STAYS on a bright surface — "ink only, no core" was tried and measured and
      // it cost contrast rather than buying it. See BRIGHT_AT. The depth read is spent on the
      // ink's weight instead.
      const inkA = bright ? INK_A_BRIGHT : INK_A;
      if (fused) {
        if (strain > 0) {
          const k = Math.min(1, strain);
          cr = LIT.r + (HOT.r - LIT.r) * k;
          cg = LIT.g + (HOT.g - LIT.g) * k;
          cb = LIT.b + (HOT.b - LIT.b) * k;
        }
        if (gone) ca4 = GONE_ALPHA;
      }

      const back = sink * depth;
      for (let b = 0; b < RINGS.length; b++) {
        const rr = R + RINGS[b];
        const pu = cu + (rr / panel.width) * ca;
        const pv = cv + (rr / panel.height) * sa;
        panel.pointAt(pu, pv, _p);
        const o = STANDOFF - back;
        const i = (b * SEG + s) * 3;
        pos[i] = _p.x + nx * o;
        pos[i + 1] = _p.y;
        pos[i + 2] = _p.z + nz * o;
        const j = (b * SEG + s) * 4;
        const core = CORE[b];
        col[j] = core ? cr : INK.r;
        col[j + 1] = core ? cg : INK.g;
        col[j + 2] = core ? cb : INK.b;
        // The casing keeps its weight where the wall is gone: the OUTLINE of the footprint is
        // still true there, it is only the promise of work that is not.
        col[j + 3] = FADE[b] * (core ? ca4 : inkA);
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.mesh.visible = true;
    return true;
  }

  /** What a probe needs to assert the mark is where it says it is, without reading pixels. */
  census() {
    return {
      mode: this.mode, visible: this.mesh.visible, panel: this.panelId,
      radius: +this.radius.toFixed(4), diameter: +(this.radius * 2).toFixed(4),
      segs: SEG, tris: (RINGS.length - 1) * SEG * 2,
    };
  }

  dispose() {
    this.mesh.parent?.remove(this.mesh);
    this.geo.dispose();
    this.mat.dispose();
  }
}
