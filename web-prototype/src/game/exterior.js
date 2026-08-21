import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { glowPatch, dustMotes } from '../lighting/volumetric.js';
import {
  CONNECTOR, CONNECTOR_W, CONNECTOR_H, connectorDressing, tellMode,
} from './connectors.js';
import { SEG_W, SEG_H } from './dig.js';
import { seedRand } from './run.js';

/**
 * THE OUTSIDE — daylight, the concealment tell, and somewhere to stand once you are out.
 *
 * `escape-owner-1` built the win condition and then photographed the thing that made it
 * meaningless: `progress/playtest/game.play.esc1b-the-way-out.png`. The way out was a black
 * rectangle. `castRay` straight out through an opened exit found nothing within 200 m and
 * `scene.background` is #05070b, so the reward for the longest, loudest push in the run was a
 * slightly darker rectangle in a dark wall. `escape.md` leans on "daylight in a seam" and
 * "freedom is visibly one board away" and neither was true.
 *
 * This module is the outside. It owns THREE things, in the order they matter:
 *
 *   1. DAYLIGHT THROUGH AN OPENED EXIT. A yard per exit site, resident only while that site
 *      actually exposes it.
 *   2. THE CONCEALMENT TELL. Every LIVE exit LEAKS — a seam of daylight at the joint, a
 *      draught carrying dust inward, and a patch of cold light on the floor inside. Every
 *      CHAINED exit is dead flat and carries human hardware: chain, padlock, hasp. That is
 *      the reading, and it is the same reading in every run and on every future map, which is
 *      what `escape.md` §6 asks for. The lock only changes the DRESSING on top of the leak.
 *   3. SOMEWHERE TO STAND. Each yard is a walled court or garden with real colliders, because
 *      the hunter can follow you out and the bomb clock starts when you leave.
 *
 * ---------------------------------------------------------------------------
 * THREE HARD RULES THIS FILE IS BUILT AROUND, ALL OF THEM SOMEONE ELSE'S MEASUREMENT.
 *
 * ⚠️ NO NEW LIGHT. EVER. `views/game.js` states it and `hunter-ai.js` paid for it:
 * `numPointLights` and friends are part of three.js's program cache key, so ONE added light
 * recompiles every material in the scene — a clean 1.28 ms capture became "execution context
 * destroyed" with a 2.5 s worst frame. So the outside is lit by BAKING: every yard surface is
 * a MeshBasicMaterial with per-vertex colour, and the sun, the sky dome and the ground bounce
 * are evaluated once, on the CPU, at build time. An unlit backdrop is also what the value
 * range demands — see the haze note below.
 *
 * ⚠️ NO NEW GLSL. Three bundle breaks in one week came from a backtick inside a shader
 * template literal (HANDOFF, and `harness/lint-glsl.mjs` now catches it). There is no shader
 * source in this file at all: the two effects that need one reuse `lighting/volumetric.js`'s
 * existing `glowPatch` and `dustMotes`, which already ship and are part of the highest-scoring
 * piece on the board. Everything else is a MeshBasicMaterial with per-vertex colour.
 *
 * ⚠️ THE INTERIOR GRADE IS NOT TOUCHED. `GRADE_PRESETS.estate` is critic-approved and the
 * whole effect is the CONTRAST between the house's blacks and the outside. Nothing here calls
 * `setGrade`, and the ablation (`?exterior=0`) exists so that claim can be checked rather than
 * asserted.
 *
 * ---------------------------------------------------------------------------
 * THE HAZE IS THE REASON THE YARD IS PAINTED RATHER THAN LIT, AND IT IS ARITHMETIC.
 *
 * `post/shaders.js` mixes every pixel toward `hazeColor` before the tonemap by
 * `f = 1 - exp(-linearZ * haze)`, and `game.play` runs `haze: 0.042` with a hazeColor of
 * [0.062, 0.055, 0.046] — a DARK grey. That is exactly right for a 27 m gallery and exactly
 * backwards for outdoors, where distance makes things LIGHTER. At 27 m only 32% of a surface's
 * own radiance survives. So a physically lit exterior would be dragged toward interior black
 * by the very grade that makes the interior good.
 *
 * Every yard surface is therefore authored as the radiance it should have AT THE EYE and then
 * divided back through the haze it is about to be seen through (`hazeGain` below). That is the
 * one place in this file where a number is chosen to defeat a downstream effect rather than to
 * describe a material, and it is deliberate: the alternative is arguing for a grade change on
 * a preset the estate critic has already approved.
 */

// ---------------------------------------------------------------------------
// The baked outdoor light
// ---------------------------------------------------------------------------

/** Linear radiance, at the eye, of the brightest thing outside. Everything scales off it. */
const SUN = [1.42, 1.22, 0.94];      // a low late sun, warm
const SKY = [0.46, 0.60, 0.86];      // the dome, cool
const BOUNCE = [0.34, 0.30, 0.21];   // what the ground throws back up under things

/**
 * What distance mixes TOWARD. See the aerial-perspective note on `bake()`.
 *
 * ⚠️ THIS IS NOT THE SAME THING AS THE GRADE'S HAZE AND IT PULLS THE OTHER WAY. `post/shaders.js`
 * mixes every pixel toward a DARK hazeColor, so in this engine distance makes things darker;
 * outdoors it makes them lighter and bluer. `hazeGain` below only undoes the darkening. Without
 * a positive aerial term the treeline, the boundary wall and the hedge all land on the same
 * value and the yard photographs as one flat card of green — which is exactly what
 * `progress/playtest/before-ext1/ext-in-the-yard.png` is a picture of.
 */
const AERIAL = [0.44, 0.52, 0.70];
function aerialK(z) { return 0.46 * (1 - Math.exp(-Math.max(0, z) * 0.020)); }

/** Must match `views/game.js`'s grade. Re-read it if that ever moves. */
const HAZE = 0.042;
/**
 * How far behind the aperture the eye typically is. A player reading the seam stands a few
 * metres back inside a dark room; the compensation is aimed at that station, not at a player
 * with their nose against the boards.
 */
const VIEW_BACK = 5.0;
/**
 * How much of the haze to undo. 1.0 would make distance completely free and the backdrop
 * would read as a flat sticker; 0 leaves the outside as dark as the room. 0.85 keeps aerial
 * recession visible while still clearing the interior by a wide margin.
 */
const HAZE_COMP = 0.85;

function hazeGain(z) {
  const e = Math.exp(-(Math.max(0, z) + VIEW_BACK) * HAZE);
  return Math.pow(1 / e, HAZE_COMP);
}

/**
 * One surface's radiance, baked. `n` is the surface normal in yard-local space, `albedo` is
 * a linear reflectance triple, `z` is the outward distance used for haze compensation, and
 * `sun` is 0..1 — how much of the DIRECT sun reaches this point.
 *
 * `toSun` is built per yard so the sun is always over the escaping player's shoulder: the
 * faces you see when you look out of the hole are the LIT faces. That is a composition
 * decision, not physics, and it is the difference between a vista and a silhouette soup.
 *
 * ⚠️ `sun` SCALES THE DIRECT TERM ONLY, WHICH IS THE WHOLE POINT OF HAVING IT. The old signature
 * had one `mul` that scaled everything, so "in shadow" meant "darker" rather than "lit by the
 * sky instead of by the sun" — and a shadow that is only darker has no colour in it. Sky-lit
 * shadow on grass comes out cool blue-green against a warm sunlit lawn, and that separation is
 * what makes the house's cast shadow read as a shadow rather than as a stain.
 */
function bake(out, n, albedo, z, toSun, mul = 1, sun = 1) {
  const nd = Math.max(0, n[0] * toSun[0] + n[1] * toSun[1] + n[2] * toSun[2]);
  const up = n[1] * 0.5 + 0.5;
  const g = hazeGain(z) * mul;
  const k = aerialK(z);
  for (let c = 0; c < 3; c++) {
    const lit = SUN[c] * nd * sun
      + SKY[c] * (0.30 + 0.70 * up)
      + BOUNCE[c] * (1 - up) * 0.6 * (0.30 + 0.70 * sun);
    out[c] = (albedo[c] * lit * (1 - k) + AERIAL[c] * k) * g;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Value noise, evaluated ONCE at build time. There is no shader in this file and there is not
// going to be one (see the header) — this exists so the ground can be mottled, the canopies
// lumpy and the sky clouded without a texture or a fragment program.
// ---------------------------------------------------------------------------

function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return (hash2(xi, yi) * (1 - u) + hash2(xi + 1, yi) * u) * (1 - v)
    + (hash2(xi, yi + 1) * (1 - u) + hash2(xi + 1, yi + 1) * u) * v;
}
function fbm(x, y, oct = 3) {
  let a = 0.5, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix3 = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------------------------------
// Geometry accumulator — merges everything into ONE draw call per yard
// ---------------------------------------------------------------------------

/**
 * Boxes and quads with per-vertex colour, merged.
 *
 * `kit.GeoBin` cannot be used here and the reason is worth stating so nobody "simplifies" it
 * back: its `add()` deletes every attribute that is not position, normal or uv, which is
 * exactly the colour attribute the whole baked-light idea depends on.
 */
class Paint {
  constructor(alpha = false) { this.parts = []; this.alpha = alpha; this.tris = 0; }

  /** @param shade (out3or4, nx, ny, nz, x, y, z) -> void, writing LINEAR values */
  _push(g, shade) {
    // ⚠️ `mergeGeometries` REFUSES A MIX OF INDEXED AND NON-INDEXED INPUTS and returns null
    // rather than throwing, so the whole yard would silently become no mesh at all. Box, plane,
    // cone, cylinder, circle and torus are indexed; `IcosahedronGeometry` (via PolyhedronGeometry)
    // is NOT — and the canopies are icosahedra. A 1:1 index costs one buffer and makes the set
    // uniform, which is cheaper than converting everything else to non-indexed.
    if (!g.index) {
      const n = g.attributes.position.count;
      const arr = n > 65535 ? new Uint32Array(n) : new Uint16Array(n);
      for (let i = 0; i < n; i++) arr[i] = i;
      g.setIndex(new THREE.BufferAttribute(arr, 1));
    }
    const pos = g.attributes.position, nrm = g.attributes.normal;
    const w = this.alpha ? 4 : 3;
    const col = new Float32Array(pos.count * w);
    const tmp = [0, 0, 0, 1];
    for (let i = 0; i < pos.count; i++) {
      tmp[3] = 1;
      shade(tmp, nrm.getX(i), nrm.getY(i), nrm.getZ(i), pos.getX(i), pos.getY(i), pos.getZ(i));
      for (let c = 0; c < w; c++) col[i * w + c] = tmp[c];
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, w));
    // merge wants one attribute set; box and plane both arrive with position/normal/uv
    for (const a of Object.keys(g.attributes)) {
      if (a !== 'position' && a !== 'normal' && a !== 'uv' && a !== 'color') g.deleteAttribute(a);
    }
    this.tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
    this.parts.push(g);
  }

  box(w, h, d, x, y, z, shade) {
    const g = new THREE.BoxGeometry(Math.max(w, 1e-3), Math.max(h, 1e-3), Math.max(d, 1e-3));
    g.translate(x, y, z);
    this._push(g, shade);
    return this;
  }

  /** A horizontal quad at height `y`, facing up (or down, for a sky ceiling). */
  ground(x0, x1, z0, z1, y, shade, sx = 1, sz = sx, down = false) {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, sx, sz);
    g.rotateX(down ? Math.PI / 2 : -Math.PI / 2);
    g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
    this._push(g, shade);
    return this;
  }

  /** A vertical quad facing back toward the house (-Z in yard space). */
  billboard(x0, x1, y0, y1, z, shade, sy = 4, sx = 1) {
    const g = new THREE.PlaneGeometry(x1 - x0, y1 - y0, sx, sy);
    g.rotateY(Math.PI);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, z);
    this._push(g, shade);
    return this;
  }

  /**
   * A vertical quad between two ground points, facing the side the winding puts it on. Used for
   * the sky's two forward wings, which is the whole reason the backdrop is no longer a single
   * card that stops existing 40 degrees off the axis.
   */
  panel(ax, az, bx, bz, y0, y1, shade, sx = 8, sy = 12) {
    const len = Math.hypot(bx - ax, bz - az) || 1e-3;
    const dx = (bx - ax) / len, dz = (bz - az) / len;
    const g = new THREE.PlaneGeometry(len, y1 - y0, sx, sy);
    // the face normal ends up at (dz, 0, -dx) — the RIGHT-hand perpendicular of a->b. Order the
    // two points so that points into the court.
    g.rotateY(Math.atan2(dz, -dx));
    g.translate((ax + bx) / 2, (y0 + y1) / 2, (az + bz) / 2);
    this._push(g, shade);
    return this;
  }

  /** Any geometry the caller has already sized, rotated and positioned in yard space. */
  geo(g, shade) { this._push(g, shade); return this; }

  build(material, name) {
    if (!this.parts.length) return null;
    const merged = this.parts.length === 1 ? this.parts[0] : mergeGeometries(this.parts, false);
    if (this.parts.length > 1) for (const g of this.parts) g.dispose();
    if (!merged) return null;
    merged.computeBoundingSphere();
    const m = new THREE.Mesh(merged, material);
    m.name = name;
    m.castShadow = false;
    m.receiveShadow = false;
    return m;
  }
}

// ---------------------------------------------------------------------------
// The yards
// ---------------------------------------------------------------------------

/**
 * Per-site footprint, in the YARD'S OWN FRAME: +z is outward through the hole, +x is the
 * panel's own lateral axis, y is height. `views/game.js` derives that frame from the panel,
 * so nothing here repeats a coordinate that `spaces.js` already owns.
 *
 * ⚠️ THE FOOTPRINTS OVERLAP IN WORLD SPACE AND THAT IS SAFE BY CONSTRUCTION, NOT BY LUCK.
 * The vestry court and the gallery's north ground both occupy the strip behind the gallery's
 * north wall. Only ONE site is live per run and only a live site can ever be opened
 * (`CHAINED_DEFS` is `damageable: false`), so at most one yard is ever resident — which
 * `update()` asserts rather than assumes. If §8's detonation ever drives every panel in the
 * house to `open`, this is the line that will need revisiting.
 *
 * The x limits are chosen against the floor plan so that nothing standing up in a yard can
 * intersect a room: `x.chapel.vestry` stops 0.15 m short of the gallery's north wall,
 * `x.gallery.boards` reaches east far enough to contain the chapel wing, and every ground
 * quad starts OUTSIDE the house footprint. That last one is not cosmetic — the floor slabs
 * stop at each space's clear extent, so there is a 0.30 m gap with no floor in EVERY doorway
 * in the house, and a ground plane run under the building would show through all of them as a
 * bright strip.
 */
const YARDS = {
  'x.chapel.vestry': {
    kind: 'court', x0: -7.60, x1: 1.35, depth: 22, sky: 20,
    // a walled service court between the chapel and the gallery's north face
    wallH: 3.1, trees: 5, hedges: false, piers: 2,
  },
  'x.study_w.servants': {
    kind: 'lawn', x0: -9.0, x1: 9.0, depth: 26, sky: 24,
    wallH: 1.35, trees: 11, hedges: true, piers: 2,
  },
  'x.ballroom.orangery': {
    kind: 'garden', x0: -19.0, x1: 19.0, depth: 30, sky: 27,
    wallH: 1.15, trees: 13, hedges: true, piers: 4,
  },
  'x.gallery.boards': {
    kind: 'north', x0: -18.0, x1: 16.5, depth: 22, sky: 21,
    wallH: 1.9, trees: 12, hedges: false, piers: 0,
  },

  // ---------------------------------------------------------------------------------------
  // POOL EXPANSION (2026-08-04) — ten more, to match `spaces.js`'s appended sites.
  //
  // ⚠️ `x0`/`x1` ARE IN THE YARD'S OWN FRAME AND THE FRAME IS DERIVED, SO THEY ARE NOT WORLD
  // COORDINATES AND THEIR SIGN FLIPS WITH `outSign`. Local +x is the panel's lateral axis
  // rotated by `panel.rotY + (outSign > 0 ? 0 : PI)`; for a west-facing wall that is world +Z,
  // for the east-facing mirror it is world −Z. Every range below is solved so the yard's own
  // facade slab lies ON the real facade rather than hanging in the air past a corner, and so
  // no ground quad or boundary wall is drawn over another part of the building:
  //
  //     site                      local [x0,x1]      the world strip it covers
  //     x.gallery.west            [-1.60,  9.00]     z -31.00 .. -20.40  (west facade)
  //     x.gallery.east            [-9.00,  1.60]     z -20.40 .. -31.00  (east facade)
  //     x.gallery.north_w         [-13.50, 2.20]     x   1.90 .. -13.80  (north, WEST of the
  //                                                  chapel wing, which starts at x 3.90)
  //     x.study_w.scullery        [-9.00,  9.00]     z -20.50 ..  -2.50
  //     x.study_e.icehouse        [-9.00,  9.00]     z  -9.00 .. -27.00
  //     x.study_e.stair           [-9.00,  9.00]     z  -2.50 .. -20.50
  //     x.ballroom.terrace_w      [-11.00, 11.00]    z -16.45 ..   5.55
  //     x.ballroom.terrace_e      [-11.00, 11.00]    z   5.55 .. -16.45
  //     x.ballroom.south_w        [-6.00, 15.00]     x -14.00 ..   7.00
  //     x.chapel.crypt            [-5.40,  1.60]     x  11.00 ..   4.00
  //
  // The house's west and east facades are CONTINUOUS from z −31.30 to +7.30 (gallery, study
  // and ballroom all sit on x = ∓13.60), which is why the flank yards can be wide. The north
  // face is not: the chapel wing projects to z −38.10 across x 3.90..11.30, so
  // `x.gallery.north_w` is bounded east of nothing and west of everything.
  //
  // ⚠️ ONE PRE-EXISTING OVERLAP IS LEFT ALONE AND REPORTED RATHER THAN QUIETLY FIXED:
  // `x.gallery.boards` above spans world x 13.2 .. −21.3, which runs its ground and boundary
  // wall straight over the chapel wing's footprint. It has been photographed and measured by
  // two agents in that state; narrowing it is a look change on someone else's judged frame.

  'x.gallery.west': {
    kind: 'court', x0: -1.60, x1: 9.00, depth: 20, sky: 19,
    wallH: 2.6, trees: 6, hedges: false, piers: 2,
  },
  'x.gallery.east': {
    kind: 'court', x0: -9.00, x1: 1.60, depth: 20, sky: 19,
    wallH: 2.6, trees: 6, hedges: false, piers: 2,
  },
  'x.gallery.north_w': {
    kind: 'north', x0: -13.50, x1: 2.20, depth: 22, sky: 21,
    wallH: 1.9, trees: 10, hedges: false, piers: 0,
  },
  'x.study_w.scullery': {
    kind: 'lawn', x0: -9.00, x1: 9.00, depth: 24, sky: 23,
    wallH: 1.5, trees: 10, hedges: true, piers: 2,
  },
  'x.study_e.icehouse': {
    kind: 'court', x0: -9.00, x1: 9.00, depth: 21, sky: 20,
    wallH: 2.9, trees: 7, hedges: false, piers: 2,
  },
  'x.study_e.stair': {
    kind: 'lawn', x0: -9.00, x1: 9.00, depth: 24, sky: 23,
    wallH: 1.35, trees: 10, hedges: true, piers: 2,
  },
  'x.ballroom.terrace_w': {
    kind: 'garden', x0: -11.00, x1: 11.00, depth: 28, sky: 26,
    wallH: 1.15, trees: 12, hedges: true, piers: 4,
  },
  'x.ballroom.terrace_e': {
    kind: 'garden', x0: -11.00, x1: 11.00, depth: 28, sky: 26,
    wallH: 1.15, trees: 12, hedges: true, piers: 4,
  },
  'x.ballroom.south_w': {
    kind: 'garden', x0: -6.00, x1: 15.00, depth: 30, sky: 27,
    wallH: 1.15, trees: 13, hedges: true, piers: 4,
  },
  'x.chapel.crypt': {
    kind: 'court', x0: -5.40, x1: 1.60, depth: 18, sky: 18,
    wallH: 3.4, trees: 4, hedges: false, piers: 2,
  },
};

/**
 * 🎯 task-plangen-1 §3 Change 7 — `YARDS` is keyed by exit-site id and `house-packing.md` §9.4b
 * calls it "world-authored per site", which is wrong for a generated pool: every new site opens
 * onto `scene.background` (a near-black void) without one. One default, known-clipping-accepted
 * per the slice: "a fixed +/-6 m lateral extent can clip a neighbouring wing on some seeds... do
 * not try to solve it."
 */
const DEFAULT_YARD = {
  kind: 'lawn', x0: -6.0, x1: 6.0, depth: 22, sky: 21,
  wallH: 1.35, trees: 8, hedges: true, piers: 2,
};

// ---------------------------------------------------------------------------
// 🏡 THE FALLBACK YARD IS AS WIDE AS THE WALL IT STANDS IN FRONT OF — `dressfix-1`, 2026-08-15
// ---------------------------------------------------------------------------

/**
 * 🚨 **A 12.0 m FACADE IN FRONT OF A 27.2 m WALL IS A SLAB STANDING IN A VOID, AND THAT IS WHAT
 * THE PLAYER IS LOOKING AT.**
 *
 * John, on a generated house: *"there is like an outside perimeter wall randomly I can get behind
 * it and it has the weird grey dark room beyond thing going on."*
 *
 * ⚠️ **WHAT WAS RULED OUT FIRST, WITH A NUMBER, BECAUSE THE BRIEF CALLED IT A COLLIDER QUESTION.**
 * `harness/scenarios/_dressfix1-behind.mjs` floods the XZ plane by DRIVING A BODY through
 * `room.collide(pos, 0.34, 1.70)` — one flood per room, unioned — on plan seeds 3, 7 and 12 and on
 * both door arms. **0 cells outside the envelope and 0 cells of walkable void inside it**, against
 * a ghost control that reaches **17 960 – 21 556** outside cells through the identical machinery,
 * and an OUT flood that shows the escaped body contained in **134–138 m²** of yard. **The generated
 * house is watertight to a walk and the yard's colliders hold.** So this is not a hole.
 *
 * 🎯 **IT IS THE FALLBACK YARD'S WIDTH.** `YARDS` is keyed by AUTHORED site id (`x.chapel.vestry`
 * …) and a generated site is `x.g0…`, so every generated yard is `DEFAULT_YARD` — a fixed
 * ±6.0 m box. `buildYard` then draws THIS YARD'S OWN FACADE across exactly that span, at
 * `PROUD` 0.21 m in front of the real wall. The house's real exterior wall is drawn by `room.js`
 * as each space's own INWARD-facing skin, so from outdoors it is invisible.
 * **Measured on `?plan=gen&planseed=3` (`_dressfix1-yard.mjs`): the yard's facade covers 12.0 m of
 * a 27.2 m face — 15.2 m of the house has nothing drawn in front of it at all**, and
 * `progress/playtest/game.play.dressfix1-yard-out-9m-lat-4.5-looking-back.png` is the picture: a
 * two-storey slab of house with windows and a door, ending in mid-air, black either side of it.
 *
 * **THE FIX: a fallback yard is as wide as the exterior wall run of the room its door is in.**
 * Measured in the YARD'S OWN LOCAL FRAME through `g.worldToLocal`, never by re-deriving the sign —
 * `YARDS`' own header records that `x0`/`x1` flip with `outSign` and that a hand-written sign here
 * *"does not throw; it builds the garden inside the house"*.
 *
 * ⚠️ **IT CAN ONLY GROW, NEVER SHRINK**, so no seed loses the yard it had, and it is capped at
 * `MAX_HALF` because the widest generated envelope measured is 50.9 m and the yard is one merged
 * mesh whose triangle count scales with its ground.
 *
 * ⚠️ **IT CANNOT CLIP A NEIGHBOURING WING, WHICH IS THE RISK `DEFAULT_YARD`'S OWN HEADER NAMES**
 * (*"a fixed ±6 m lateral extent can clip a neighbouring wing on some seeds… do not try to solve
 * it"*). The room's wall is ON the envelope edge and nothing in the house lies outside the
 * envelope, so a span bounded by that room's own rect is strictly INSIDE the ±6 m box's worst
 * case: the fixed box is the one that can overhang a corner.
 *
 * ⚠️ **IT ONLY WIDENS TO THE ROOM'S OWN RUN, NOT TO THE WHOLE FACE.** Where two rooms share one
 * envelope side, the neighbour's stretch is still bare. Reported, not solved: covering the whole
 * face would put one yard in front of a room that has no door onto it.
 *
 * **`?yardwide=0` restores the fixed ±6.0 m box.** It is a BUILD-time arm, not an in-place flip,
 * because the yard is baked geometry — the draw-call claim is instead structural and is asserted
 * from the census: a yard is ONE merged mesh with ONE material however wide it is.
 */
const YARD_MAX_HALF = 22.0;

function _yardWideUrl() {
  if (typeof location === 'undefined') return true;
  return new URLSearchParams(location.search).get('yardwide') !== '0';
}

/**
 * The lateral span, in the yard's own local frame, of the exterior wall run the door sits in.
 * `g` must already be positioned and parented — `worldToLocal` is what keeps the sign honest.
 */
function fallbackYard(exit, home, g, wide) {
  if (!wide || !home) return DEFAULT_YARD;
  const p = exit.panel;
  const xAxis = Math.abs(p.normal.x) > Math.abs(p.normal.z);
  const ends = xAxis
    ? [new THREE.Vector3(p.root.position.x, 0, home.z0), new THREE.Vector3(p.root.position.x, 0, home.z1)]
    : [new THREE.Vector3(home.x0, 0, p.root.position.z), new THREE.Vector3(home.x1, 0, p.root.position.z)];
  g.updateMatrixWorld(true);
  const xs = ends.map((v) => g.worldToLocal(v).x);
  const lo = Math.max(-YARD_MAX_HALF, Math.min(xs[0], xs[1]));
  const hi = Math.min(YARD_MAX_HALF, Math.max(xs[0], xs[1]));
  return {
    ...DEFAULT_YARD,
    x0: Math.min(DEFAULT_YARD.x0, lo),
    x1: Math.max(DEFAULT_YARD.x1, hi),
  };
}

/**
 * Albedos, linear. Late light on an unkempt estate.
 *
 * 🚨 `A_HOUSE` WAS 0.105 AND THAT ONE NUMBER IS MOST OF WHY THE FACADE PHOTOGRAPHED BLACK.
 * The sun is behind the house BY CONSTRUCTION (see `toSun`), so the facade never takes a direct
 * term at all — everything it has is sky and ground bounce. A 10% reflectance under sky alone
 * lands at ~0.046 linear against a sky billboard at ~1.0, i.e. a silhouette, which is what
 * `progress/playtest/before-ext1/ext-looking-back.png` is a photograph of: the whole top half of
 * the frame is pure black where a 9.6 m mansion is standing. Ashlar limestone is 0.4-0.6.
 */
const A_GRASS = [0.135, 0.205, 0.080];
const A_GRAVEL = [0.255, 0.240, 0.205];
const A_PAVE = [0.300, 0.290, 0.268];
const A_MOSS = [0.082, 0.112, 0.058];
const A_STONE = [0.430, 0.412, 0.372];
const A_HEDGE = [0.062, 0.092, 0.048];
const A_CANOPY = [0.072, 0.092, 0.050];
const A_CANOPY_HI = [0.105, 0.122, 0.062];
const A_TRUNK = [0.072, 0.060, 0.048];
const A_HOUSE = [0.455, 0.435, 0.395];
const A_TRIM = [0.560, 0.540, 0.498];
const A_ROOF = [0.150, 0.143, 0.150];
const A_GLASS = [0.028, 0.034, 0.046];
const A_IRON = [0.036, 0.036, 0.038];
const A_WATER = [0.050, 0.058, 0.072];
const A_FAR = [0.115, 0.135, 0.108];

/**
 * The sky backdrop, authored at the eye and then haze-compensated like everything else.
 *
 * ⚠️ THE TONEMAP DESATURATES WHATEVER IT COMPRESSES, so a sky authored bright enough to be the
 * brightest thing in the game comes out of the grade as pale grey however blue it went in. The
 * gradient is therefore steep and the zenith deeply saturated: the first pass had a horizon of
 * 1.06 and a zenith of 0.82 blue and photographed as flat overcast at every station.
 */
const SKY_HORIZON = [0.92, 0.96, 1.00];
const SKY_ZENITH = [0.15, 0.30, 0.74];
const CLOUD_LIT = [1.52, 1.48, 1.40];
const CLOUD_SHADE = [0.40, 0.45, 0.62];

/**
 * ONE YARD. Everything below goes into a SINGLE `Paint` bin and therefore into ONE mesh with ONE
 * material, so the whole outside — sky, house, planting, water, the lot — is **one draw call**.
 *
 * 🚨 THAT IS THE CONSTRAINT THIS WHOLE FUNCTION IS SHAPED BY, AND IT IS WHY IT CAN AFFORD TO BE
 * THIS DETAILED. `ballroom.centre` already measures 630 calls against a 625 ceiling and
 * `chapel.centre` 629-631 — two stations are over the line before this file adds anything. Draw
 * calls scale with MATERIAL KEYS, not with geometry, so a thousand extra boxes in the same bin
 * cost nothing and one extra material would cost a call at the one station that cannot pay it.
 * **Anything added here must go through `P`. Do not introduce a second material.**
 */
function buildYard(spec, site, panel, storey, rng) {
  // ---- the light rig ------------------------------------------------------
  //
  // The sun is over the escaping player's shoulder: -z is back toward the house, so a negative
  // z component points the light out through the hole and onto the faces you see. Two things
  // follow, and together they are the composition of the reveal:
  //
  //   · every face you look AT when you look out is a lit face, and the boundary wall's near
  //     side (n = -z, nd = 0.66) is the brightest built thing in the yard;
  //   · the house throws a real shadow into the near yard. You step out of a dark hole into
  //     cool shade, and the world turns warm eight or twelve metres ahead of you, on a hard
  //     diagonal with the chimneys notched into it. Depth by VALUE, which costs nothing,
  //     rather than by fog, which the grade is already spending the other way.
  const toSun = (() => {
    const v = [0.32, 0.68, -0.66];
    const l = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / l, v[1] / l, v[2] / l];
  })();

  const { x0, x1, depth, sky, wallH } = spec;
  const kind = spec.kind;
  const FACE = 0.15;          // the wall's outer face, in yard space
  const PROUD = FACE + 0.06;  // where this yard's own facade sits, always in front of it
  const W = x1 - x0;
  const CX = (x0 + x1) / 2;
  const hw = (site.w ?? panel.width) / 2;
  const ap0 = (panel.root.position.y ?? 0);
  const aptTop = ap0 + (site.h ?? panel.height) / 2;
  const apron = kind === 'garden' ? 4.8 : 3.8;
  const bz = Math.max(apron + 5.0, depth * 0.62);

  // The roofline, as a height profile. `sunAt3` traces back to it, so the chimneys punch two
  // fingers through the shadow's edge — which is the detail that makes it read as a building's
  // shadow rather than as a gradient somebody painted on the lawn.
  const RIDGE = storey + 3.06;
  const STACK = storey + 4.90;
  const stackX = [-0.62, 0.38].map((s) => x0 + W * (0.5 + s * 0.5));
  const houseTop = (xf) => {
    if (xf < x0 - 0.15 || xf > x1 + 0.15) return 0;
    for (const px of stackX) if (Math.abs(xf - px) < 0.55) return STACK;
    return RIDGE;
  };
  /**
   * 1 = full sun, 0 = in the house's own shadow. Traces from the point toward the sun to the
   * facade plane and asks whether the building is still in the way at that height.
   *
   * ⚠️ POINTS BEHIND THE FACADE PLANE take the second branch: the sun is behind the house, so
   * anything on the wall is in shadow by definition and only the roof and the stack tops clear
   * it. That is what gives the cornice line and the chimney caps their rim.
   */
  const sunAt3 = (gx, gy, gz) => {
    const s = (gz - PROUD) / -toSun[2];
    if (s <= 1e-4) return gy > houseTop(gx) - 0.30 ? 1 : 0;
    return smoothstep(0, 0.85, gy + toSun[1] * s - houseTop(gx + toSun[0] * s));
  };

  const P = new Paint(false);
  const c = [0, 0, 0];
  const shadeOf = (albedo, mul = 1, sunK = null) => (out, nx, ny, nz, x, y, z) => {
    bake(c, [nx, ny, nz], albedo, z, toSun, mul, sunK == null ? sunAt3(x, y, z) : sunK);
    out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
  };
  /** Anything nailed to the facade. The sun is behind the house; none of it is ever lit. */
  const wallShade = (albedo, mul = 1) => shadeOf(albedo, mul, 0);
  /** Anything clear of the roofline. */
  const skyLit = (albedo, mul = 1) => shadeOf(albedo, mul, 1);

  /**
   * How much of the sky dome a patch of GROUND can see. A 9.6 m facade two metres away takes a
   * large bite out of it, and the side walls take another.
   *
   * ⚠️ WITHOUT THIS THE APRON IS THE BRIGHTEST THING IN THE ESCAPE FRAME, which is the value
   * structure exactly upside down — `progress/playtest/before-ext1/ext-in-the-yard.png` is a
   * white slab of gravel under a duller sky. Sunlit ground is far enough out that this is 1.0
   * there, so it costs the reveal nothing and buys the whole foreground back.
   */
  const skyView = (x, z) => (0.46 + 0.54 * smoothstep(0.2, 11.0, z))
    * (0.76 + 0.24 * smoothstep(0.0, 6.0, Math.min(x - x0, x1 - x)));

  /** A lumpy mass. Jitter is a function of DIRECTION so the hull never splits open. */
  const blob = (cx, cy, cz, rx, ry, rz, detail, amp, seed, shade) => {
    const g = new THREE.IcosahedronGeometry(1, detail);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
      const k = 1 + amp * (vnoise(vx * 2.7 + seed, vy * 2.7 + vz * 1.7 - seed) - 0.5) * 2;
      p.setXYZ(i, vx * rx * k, vy * ry * k, vz * rz * k);
    }
    g.computeVertexNormals();
    g.translate(cx, cy, cz);
    P.geo(g, shade);
  };

  // =========================================================================
  // 1 - THE GROUND. An apron the door opens onto, and the park past it.
  // =========================================================================
  // The apron is the biggest single area in the escape frame (it fills the bottom third at the
  // station the player actually walks to) and it used to be the BRIGHTEST thing on screen —
  // a featureless white slab under a duller sky, i.e. the value structure upside down. It sits
  // wholly inside the house's shadow now, so it reads cool and quiet and hands the eye forward.
  P.ground(x0, x1, PROUD, PROUD + apron, -0.02, (out, nx, ny, nz, x, y, z) => {
    // ⚠️ THE NOISE PERIOD HAS TO BE SEVERAL SEGMENTS LONG. This is a per-VERTEX field on a
    // 1.3 m grid, so a 1.8 m feature aliases into speckle and photographs as a flat card with
    // dirt on it — the first pass did exactly that.
    const wear = 0.55 + 0.95 * fbm(x * 0.13, z * 0.34, 3);
    // moss and weed creeping in along the joints and out at the edges — a swept terrace reads
    // as a car park, and this house has not been swept in a long time
    const weed = smoothstep(0.56, 0.80, fbm(x * 0.16 + 5.1, z * 0.26 - 2.3, 2))
      * smoothstep(0.4, 2.6, Math.abs(x) - hw);
    const alb = [0, 0, 0];
    for (let ci = 0; ci < 3; ci++) {
      alb[ci] = mix3((kind === 'garden' ? A_PAVE : A_GRAVEL)[ci] * wear, A_MOSS[ci], weed);
    }
    bake(c, [nx, ny, nz], alb, z, toSun, skyView(x, z), sunAt3(x, y, z));
    out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
  }, 30, 12);

  // The lawn, with the gravel walk BAKED INTO IT rather than laid on top — a second quad in the
  // same plane is a z-fight waiting for a driver to lose, and a walk that is only a colour costs
  // nothing at all. It runs on the door's own axis, so the way out keeps going.
  const walkHalf = Math.max(hw + 0.55, 1.75);
  const lawnShade = (out, nx, ny, nz, x, y, z) => {
    const wob = (vnoise(z * 0.09, 4.2) - 0.5) * 1.5;
    const walk = kind === 'north' ? 0
      : (1 - smoothstep(walkHalf - 0.45, walkHalf + 0.75, Math.abs(x - wob)))
        * (1 - smoothstep(bz - 2.2, bz + 0.4, z));
    const patch = fbm(x * 0.11 + 2.7, z * 0.13 - 1.1, 3);
    const alb = [0, 0, 0];
    for (let ci = 0; ci < 3; ci++) {
      // unmown grass: two greens drifting into each other, then the walk over the top
      const grass = mix3(A_GRASS[ci], A_MOSS[ci] * 1.35, patch);
      alb[ci] = mix3(grass, A_GRAVEL[ci] * 0.92, walk);
    }
    bake(c, [nx, ny, nz], alb, z, toSun, skyView(x, z), sunAt3(x, y, z));
    out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
  };
  // ⚠️ TWO QUADS, AND THE SPLIT IS ABOUT THE SHADOW EDGE RATHER THAN ABOUT THE GRASS. The
  // house's cast shadow is baked into vertex colour, so its softness is the segment pitch: one
  // quad stretched over the whole 50 m park would put the edge across 1.4 m of lawn and it would
  // read as a gradient. The near quad is 0.7 m per segment; past the boundary wall there is no
  // shadow left to resolve and the far one can be coarse.
  P.ground(x0, x1, PROUD + apron, bz + 8, -0.03, lawnShade, 28, 30);
  P.ground(x0, x1, bz + 8, sky + 26, -0.035, lawnShade, 12, 8);

  // =========================================================================
  // 2 - THE HOUSE, FROM OUTSIDE. It has to be a MASS, and it has to be PALE.
  // =========================================================================
  // 6 cm proud of the real wall skin so it can never z-fight with it, and so the outside looks
  // the same whether or not the owning space happens to be resident.
  const facade = wallShade(A_HOUSE);
  const trim = wallShade(A_TRIM);
  P.box(Math.max(0.1, -hw - x0), storey, 0.06, (x0 + (-hw)) / 2, storey / 2, PROUD, facade);
  P.box(Math.max(0.1, x1 - hw), storey, 0.06, (hw + x1) / 2, storey / 2, PROUD, facade);
  P.box(hw * 2, storey - aptTop, 0.06, 0, (storey + aptTop) / 2, PROUD, facade);

  // A plinth, a string course and a pilaster order. `estate-1` added a whole architectural order
  // to the gallery for +11 calls by reusing buckets; this one is in the yard's single bucket and
  // costs zero. It is also the only thing that gives a 9.6 m wall any scale at all.
  //
  // ⚠️ ANY BAND THAT CROSSES THE APERTURE IS SPLIT AROUND IT. A continuous plinth is 0.85 m of
  // solid stone standing across the hole the player just spent 25 seconds making — the same
  // defect class as the mortar patch that survived three A/B pairs standing in the opened exit,
  // arriving from the other side of the wall.
  const apBot = ap0 - (site.h ?? panel.height) / 2;
  const band = (yc, h, d, zo, sh) => {
    if (yc + h / 2 > apBot - 0.05 && yc - h / 2 < aptTop + 0.05) {
      P.box(Math.max(0.1, -hw - x0), h, d, (x0 - hw) / 2, yc, PROUD + zo, sh);
      P.box(Math.max(0.1, x1 - hw), h, d, (hw + x1) / 2, yc, PROUD + zo, sh);
    } else {
      P.box(W, h, d, CX, yc, PROUD + zo, sh);
    }
  };
  band(0.42, 0.85, 0.22, 0.08, wallShade(A_TRIM, 0.92));
  const bandY = storey > 7.4 ? storey * 0.505 : storey * 0.78;
  band(bandY, 0.30, 0.17, 0.06, trim);

  // Bays on a 3.2 m pitch, skipping the aperture. Windows are the cheapest scale cue there is:
  // a blank wall could be two metres tall or twenty.
  const BAY = 3.2;
  const bays = [];
  for (let bx = Math.round(CX / BAY) * BAY; bx <= x1 - 1.3; bx += BAY) bays.push(bx);
  for (let bx = Math.round(CX / BAY) * BAY - BAY; bx >= x0 + 1.3; bx -= BAY) bays.push(bx);
  const rows = storey > 7.4 ? [[1.15, 3.55], [bandY + 0.55, bandY + 2.85]] : [[1.15, 3.45]];
  for (const bx of bays) {
    if (Math.abs(bx) < hw + 1.05) continue;
    if (Math.abs(bx + BAY / 2) > hw + 0.55) {                       // the pilaster between bays
      P.box(0.42, storey - 0.9, 0.13, bx + BAY / 2, (storey - 0.9) / 2 + 0.85, PROUD + 0.05,
        wallShade(A_HOUSE, 1.06));
    }
    for (const [wy0, wy1] of rows) {
      if (wy1 > storey - 0.7) continue;
      const wh = wy1 - wy0, wc = (wy0 + wy1) / 2;
      // reveal, glass, architrave, cill, glazing bars — nine boxes, 108 triangles, no calls
      P.box(1.34, wh + 0.14, 0.05, bx, wc, PROUD + 0.035, wallShade(A_TRIM, 0.72));
      P.geo(boxAt(1.18, wh, 0.04, bx, wc, PROUD + 0.055), (out, nx, ny, nz, x, y, z) => {
        // a pane is a mirror: the head sees sky, the cill sees the dark court and a black room
        const t = clamp01((y - wy0) / wh);
        const g = hazeGain(z);
        const refl = 0.028 + 0.235 * t * t * t;
        for (let ci = 0; ci < 3; ci++) out[ci] = (SKY_HORIZON[ci] * refl + A_GLASS[ci] * 0.6) * g;
      });
      P.box(1.46, 0.13, 0.10, bx, wy1 + 0.12, PROUD + 0.07, trim);
      P.box(1.52, 0.14, 0.19, bx, wy0 - 0.10, PROUD + 0.10, trim);
      P.box(0.055, wh, 0.055, bx, wc, PROUD + 0.085, trim);
      P.box(1.18, 0.05, 0.05, bx, wy0 + wh * 0.42, PROUD + 0.085, trim);
      P.box(1.18, 0.05, 0.05, bx, wy0 + wh * 0.76, PROUD + 0.085, trim);
    }
  }

  // End pavilions: the yard's facade is a 6 cm slab and past its last bay it was a sheet of
  // paper seen edge-on. A projecting mass at each end terminates it in a corner instead.
  for (const ex of [x0 + 1.1, x1 - 1.1]) {
    if (Math.abs(ex) < hw + 1.5) continue;   // never in front of the hole the player just made
    P.box(2.2, storey, 0.95, ex, storey / 2, PROUD + 0.45, wallShade(A_HOUSE, 1.04));
    P.box(2.5, 0.42, 1.20, ex, storey + 0.21, PROUD + 0.45, wallShade(A_TRIM, 1.0));
  }

  // Cornice, roof and stacks. These are the only parts of the building that clear the roofline,
  // so they are the only parts with a direct-sun term — a bright warm edge along the top of an
  // otherwise cool grey mass, which is what a building looks like backlit at four in the
  // afternoon and is the whole reason to keep the sun where it is.
  P.box(W, 0.52, 0.46, CX, storey + 0.24, PROUD + 0.16, skyLit(A_TRIM, 1.0));
  P.box(W - 0.6, 2.6, 1.5, CX, storey + 1.80, PROUD - 0.05, skyLit(A_ROOF));
  for (const px of stackX) {
    P.box(0.95, 2.05, 0.95, px, storey + 3.90, PROUD - 0.05, skyLit(A_ROOF, 1.10));
    P.box(1.22, 0.22, 1.22, px, storey + 5.02, PROUD - 0.05, skyLit(A_TRIM, 1.15));
  }

  // =========================================================================
  // 3 - THE THRESHOLD. What you are standing on the instant you are out.
  // =========================================================================
  P.box(hw * 2 + 1.5, 0.14, 1.15, 0, 0.05, PROUD + 0.60, wallShade(A_STONE, 1.02));
  P.box(hw * 2 + 2.4, 0.09, 0.55, 0, -0.01, PROUD + 1.42, wallShade(A_STONE, 0.96));
  for (let i = 0; i < (spec.piers ?? 0); i++) {
    const s = i % 2 === 0 ? -1 : 1;
    const row = Math.floor(i / 2);
    const px = s * (hw + 0.95 + row * 2.4);
    if (px < x0 + 0.6 || px > x1 - 0.6) continue;
    const pz = PROUD + 0.75 + row * 2.9;
    P.box(0.66, 1.42, 0.66, px, 0.71, pz, shadeOf(A_STONE));
    P.box(0.86, 0.17, 0.86, px, 1.50, pz, shadeOf(A_STONE, 1.08));
    // an urn on top: the difference between a bollard and an estate
    blob(px, 1.92, pz, 0.30, 0.34, 0.30, 0, 0.10, 3.1 + i, shadeOf(A_STONE, 1.04));
    P.box(0.30, 0.20, 0.30, px, 1.66, pz, shadeOf(A_STONE, 0.96));
  }

  // =========================================================================
  // 4 - THE ENCLOSURE. Two side walls and a boundary, with a gate on the axis.
  // =========================================================================
  // ⚠️ THE SIDE WALLS HAVE ALWAYS BEEN COLLIDERS WITH NO GEOMETRY. `solids` below registers two
  // of them and always has, so a body walking sideways out of this court has been stopping
  // against nothing since the module was wired in. They also happen to be the strongest
  // composition device available here: two walls converging on the boundary put perspective in
  // a frame that had none.
  const sideH = wallH + (kind === 'court' ? 0.0 : 0.55);
  for (const sx of [x0, x1]) {
    const inward = sx === x0 ? 1 : -1;
    P.box(0.55, sideH, bz + 1.4 - FACE, sx, sideH / 2, (FACE + bz + 1.4) / 2, shadeOf(A_STONE, 0.94));
    P.box(0.74, 0.16, bz + 1.4 - FACE, sx, sideH + 0.08, (FACE + bz + 1.4) / 2, shadeOf(A_STONE, 1.10));
    // ⚠️ THE BUTTRESSES STAND PROUD OF THE FACE, NOT CENTRED IN IT. A narrow court puts one of
    // these walls within a metre of the door, where its unlit face is a third of the escape
    // frame; centred piers project 12 cm and do nothing about that. Out here they cast their
    // own shade down the wall and give the slab a rhythm.
    for (let z = FACE + 1.15; z < bz + 1.0; z += 3.6) {
      P.box(0.92, sideH + 0.42, 0.85, sx + inward * 0.30, (sideH + 0.42) / 2, z, shadeOf(A_STONE, 1.02));
      P.box(1.10, 0.16, 1.02, sx + inward * 0.30, sideH + 0.50, z, shadeOf(A_STONE, 1.16));
    }
    if (kind === 'court' || kind === 'north') {
      // Ivy. The house has been empty long enough for people to board it up and stage a hunt.
      //
      // ⚠️ IT IS A SKIRT AT THE FOOT OF THE WALL, NOT A CURTAIN, AND THE FIRST VERSION WAS THE
      // CURTAIN. A court can be 8.95 m wide with the door 0.31 m from one side wall, so a
      // 3 m-tall mass on that wall sits a metre from the lens and takes a third of the escape
      // frame. Nothing within 3.5 m of the aperture, and never more than waist-high on the wall.
      for (let i = 0; i < 4; i++) {
        const z = FACE + 3.6 + i * (bz - 3.2) / 4 + vnoise(i * 3.7, sx) * 1.4;
        if (z > bz - 0.4) continue;
        const hgt = sideH * (0.30 + vnoise(z * 0.7, i) * 0.34);
        blob(sx + inward * 0.30, hgt * 0.52, z, 0.30, hgt * 0.52, 0.65 + vnoise(z, i * 2.1) * 0.65,
          0, 0.42, z + i, shadeOf(A_HEDGE, 0.88 + vnoise(z * 1.3, i) * 0.35));
      }
    }
  }

  const gateHalf = Math.min(1.9, W * 0.12);
  P.box(W, wallH, 0.46, CX, wallH / 2, bz, shadeOf(A_STONE, 0.94));
  P.box(W, 0.17, 0.64, CX, wallH + 0.085, bz, shadeOf(A_STONE, 1.14));
  {
    const n = Math.max(2, Math.round(W / 4.4));
    for (let i = 0; i <= n; i++) {
      const px = x0 + (W * i) / n;
      if (Math.abs(px) < gateHalf + 0.9) continue;
      P.box(0.70, wallH + 0.58, 0.70, px, (wallH + 0.58) / 2, bz, shadeOf(A_STONE, 1.02));
      P.box(0.90, 0.18, 0.90, px, wallH + 0.67, bz, shadeOf(A_STONE, 1.16));
    }
    // THE GATE. Two tall piers and a shut iron screen on the door's own axis. It is shut because
    // the boundary collider is a solid line and an open gate you cannot walk through is worse
    // than a shut one — and because a locked gate at the end of the walk is the right last note
    // for a house that was staged by people who boarded every door.
    const gh = wallH + 1.55;
    for (const s of [-1, 1]) {
      P.box(0.86, gh, 0.86, s * (gateHalf + 0.5), gh / 2, bz, shadeOf(A_STONE, 1.04));
      P.box(1.10, 0.22, 1.10, s * (gateHalf + 0.5), gh + 0.11, bz, shadeOf(A_STONE, 1.18));
      blob(s * (gateHalf + 0.5), gh + 0.55, bz, 0.32, 0.40, 0.32, 0, 0.12, 7.3 + s, shadeOf(A_STONE, 1.08));
    }
    const iron = shadeOf(A_IRON, 1.0);
    for (let i = 0; i <= 13; i++) {
      const px = -gateHalf + (2 * gateHalf * i) / 13;
      P.box(0.055, wallH + 0.75, 0.055, px, (wallH + 0.75) / 2, bz, iron);
    }
    P.box(gateHalf * 2, 0.075, 0.075, 0, wallH + 0.72, bz, iron);
    P.box(gateHalf * 2, 0.075, 0.075, 0, wallH * 0.52, bz, iron);
  }

  // =========================================================================
  // 5 - THE MIDDLE DISTANCE. Something between the door and the boundary.
  // =========================================================================
  if (spec.hedges) {
    // A clipped hedge is not one box. Ten plants with their own heights and a ragged top read
    // as a hedge; one extruded rectangle reads as a skip.
    for (const s of [-1, 1]) {
      const bx = s * (hw + 3.9);
      if (bx - 1.7 < x0 + 0.9 || bx + 1.7 > x1 - 0.9) continue;
      const hz = PROUD + apron + 3.0;
      for (let i = 0; i < 9; i++) {
        const px = bx - 1.6 + (3.2 * i) / 8;
        const hh = 1.15 + vnoise(px * 1.7, 9.1) * 0.80;
        const hd = 5.0 + vnoise(px * 0.8, 2.2) * 1.4;
        P.box(0.46, hh, hd, px, hh / 2, hz, shadeOf(A_HEDGE, 0.94 + vnoise(px * 2.9, 6.4) * 0.24));
        // a straight-topped extrusion is a skip, not a hedge: break the line with growth
        if (i % 2 === 0) {
          blob(px, hh + 0.10, hz + (vnoise(px, 3.3) - 0.5) * hd * 0.7,
            0.40, 0.30, 0.55, 0, 0.40, px * 3.1, shadeOf(A_HEDGE, 1.12));
        }
      }
      // topiary at the ends, which is what says "somebody used to look after this"
      for (const e of [-2.7, 2.7]) {
        blob(bx + e, 1.05, hz - 1.9, 0.62, 1.05, 0.62, 0, 0.16, bx + e, shadeOf(A_HEDGE, 1.05));
      }
    }
  }

  if (kind === 'garden') {
    // A basin, off the axis so nothing stands between the hole and the gate. Still water is a
    // MIRROR of the sky, so it is the second-brightest thing in the yard and the only bright
    // shape below the horizon — the eye goes to it, and then out.
    const bxq = CX + W * 0.235, bzq = PROUD + apron + 6.6, R = 2.5;
    const ring = new THREE.TorusGeometry(R, 0.30, 5, 18);
    ring.rotateX(Math.PI / 2);
    ring.translate(bxq, 0.30, bzq);
    P.geo(ring, shadeOf(A_STONE, 1.02));
    const water = new THREE.CircleGeometry(R - 0.06, 22);
    water.rotateX(-Math.PI / 2);
    water.translate(bxq, 0.24, bzq);
    P.geo(water, (out, nx, ny, nz, x, y, z) => {
      const g = hazeGain(z);
      const r = Math.hypot(x - bxq, z - bzq) / R;
      // the near lip mirrors the sky low down (near-white), the far lip the zenith
      const k = clamp01(0.18 + 0.62 * (1 - r) + 0.30 * (z - bzq) / R);
      for (let ci = 0; ci < 3; ci++) {
        out[ci] = (mix3(SKY_HORIZON[ci], SKY_ZENITH[ci], k) * 0.60 + A_WATER[ci]) * g;
      }
    });
    P.box(0.55, 1.30, 0.55, bxq, 0.65, bzq, shadeOf(A_STONE, 1.06));
    blob(bxq, 1.52, bzq, 0.42, 0.34, 0.42, 0, 0.10, 4.4, shadeOf(A_STONE, 1.10));
  }

  // =========================================================================
  // 6 - THE TREES. Silhouette, and three species so the line is not a comb.
  // =========================================================================
  // ⚠️ THE OLD TREES WERE 5.2-9.6 m TALL NEXT TO A 9.6 m HOUSE, out of three axis-aligned boxes
  // each. That is the "box-hedge trees" the critic named, and the height was half of it: a
  // mature park tree beside a two-storey mansion is 12-18 m, and reading SHORTER than the house
  // is what made the whole yard look like a model on a table.
  {
    const n = spec.trees ?? 8;
    const rowsZ = [
      [bz + 2.4, bz + 5.2, 1.00, 1],
      [bz + 6.0, Math.max(bz + 9.0, sky - 3.5), 0.86, 0],
      [sky - 1.5, sky + 3.5, 0.66, 0],
    ];
    for (let i = 0; i < n + 6; i++) {
      const band = i < n * 0.34 ? 0 : i < n * 0.75 ? 1 : 2;
      const [z0, z1, scale, det] = rowsZ[band];
      const px = x0 - 5 + (W + 10) * ((i * 0.6180339887) % 1) + (rng() - 0.5) * 3.0;
      const pz = z0 + rng() * Math.max(0.5, z1 - z0);
      const h = (10.5 + rng() * 7.5) * scale;
      const r = (2.4 + rng() * 1.7) * scale;
      const species = i % 7 === 3 ? 'spire' : i % 11 === 5 ? 'bare' : 'broad';
      const bark = shadeOf(A_TRUNK, 1 + rng() * 0.2);

      if (species === 'spire') {
        const trunk = new THREE.CylinderGeometry(0.10, 0.30, h * 0.24, 5);
        trunk.translate(px, h * 0.12, pz);
        P.geo(trunk, bark);
        for (let k = 0; k < 3; k++) {
          const cy = h * (0.22 + k * 0.27);
          const cr = r * (0.86 - k * 0.24);
          const cone = new THREE.ConeGeometry(cr, h * 0.40, 7, 1);
          cone.translate(px, cy + h * 0.20, pz);
          P.geo(cone, shadeOf(k === 2 ? A_CANOPY_HI : A_CANOPY, 0.92 + k * 0.14));
        }
      } else if (species === 'bare') {
        const trunk = new THREE.CylinderGeometry(0.14, 0.36, h * 0.62, 5);
        trunk.translate(px, h * 0.31, pz);
        P.geo(trunk, bark);
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2 + rng();
          const bl = h * (0.28 + rng() * 0.22);
          const g = new THREE.CylinderGeometry(0.05, 0.13, bl, 4);
          g.rotateZ(Math.cos(a) * 0.85);
          g.rotateX(Math.sin(a) * 0.85);
          g.translate(px + Math.cos(a) * bl * 0.30, h * 0.58 + bl * 0.36, pz + Math.sin(a) * bl * 0.30);
          P.geo(g, bark);
        }
      } else {
        const trunk = new THREE.CylinderGeometry(0.20, 0.44, h * 0.50, 5);
        trunk.translate(px, h * 0.25, pz);
        P.geo(trunk, bark);
        const cy = h * 0.68;
        blob(px, cy, pz, r, r * 0.86, r * 0.90, det, 0.34, px + pz, shadeOf(A_CANOPY));
        blob(px - r * 0.52, cy - r * 0.34, pz + r * 0.26, r * 0.66, r * 0.58, r * 0.62, 0, 0.34,
          px * 1.7 - pz, shadeOf(A_CANOPY, 0.88));
        // the spray that catches the sun over the top of the mass
        blob(px + r * 0.40, cy + r * 0.52, pz - r * 0.30, r * 0.62, r * 0.50, r * 0.58, 0, 0.34,
          px - pz * 2.1, shadeOf(A_CANOPY_HI, 1.18));
      }
    }
  }

  // =========================================================================
  // 7 - THE WORLD BEYOND THE TREES. The reason it is an estate and not a pen.
  // =========================================================================
  // A band of far woods and one landmark, both drowned in aerial perspective by `bake` because
  // their z is large. This is the layer that answers "is there anywhere to go" — and the
  // endgame is a bomb going off in the house behind you, so there had better be.
  for (let i = 0; i < 22; i++) {
    const px = x0 - 34 + (W + 68) * (i / 21) + (rng() - 0.5) * 6;
    const pz = sky + 3.5 + rng() * 10;
    const h = 7 + rng() * 9;
    blob(px, h * 0.55, pz, 4.4 + rng() * 3.4, h * 0.55, 3.0, 0, 0.30, px * 0.7 + i, shadeOf(A_FAR, 1.0));
  }
  {
    // A tower on the skyline. One shape, off-centre, and it does more for "this place is real"
    // than another dozen trees would.
    const tx = CX - W * 0.42 - 14, tz = sky + 16, th = 21;
    P.box(3.6, th, 3.6, tx, th / 2, tz, shadeOf(A_FAR, 1.30));
    P.box(4.4, 0.9, 4.4, tx, th + 0.45, tz, shadeOf(A_FAR, 1.45));
    const cap = new THREE.ConeGeometry(3.1, 4.6, 4);
    cap.rotateY(Math.PI / 4);
    cap.translate(tx, th + 3.2, tz);
    P.geo(cap, shadeOf(A_FAR, 1.15));
  }

  // =========================================================================
  // 8 - THE SKY. It is the brightest thing in the game and it is meant to be.
  // =========================================================================
  // ⚠️ IT USED TO BE ONE CARD AT THE BACK, AND THAT IS WHY TURNING ROUND IN THE YARD WAS A BLACK
  // VOID (`escape.md`: "somebody will have to solve the other 180 degrees"). It is now a back
  // panel, two forward wings, a ceiling, and a strip above the roofline — four more quads, no
  // material, no call. The strip sits 3 cm BEHIND the facade's outer skin and starts above the
  // roof mass, so it can never be seen from inside a room and can never occlude one.
  //
  // ⚠️ AND THE HAZE COMPENSATION TAKES THE REAL DISTANCE, NOT THE Z. The grade darkens by
  // distance from the EYE; using z alone under-compensated the top of the sky by a third, which
  // is a large part of why the backdrop photographed as flat grey rather than as a gradient.
  const skyShade = (up) => (out, nx, ny, nz, x, y, z) => {
    const k = up ? 1 : smoothstep(-2, 20, y);
    const g = hazeGain(Math.hypot(z, Math.max(0, y - 1.4)));
    const n = fbm(x * 0.042 + 11.3, (up ? z * 0.062 : y * 0.070) + 3.7, 3);
    // clouds sit in a band above the treeline and thin out toward the zenith
    const band = up ? 0.70 : smoothstep(0.02, 0.20, k) * (1 - 0.55 * smoothstep(0.55, 1.0, k));
    const cover = smoothstep(0.495, 0.560, n) * band;
    const litK = smoothstep(0.50, 0.70, n);
    for (let ci = 0; ci < 3; ci++) {
      const base = SKY_HORIZON[ci] * (1 - k) + SKY_ZENITH[ci] * k;
      out[ci] = mix3(base, mix3(CLOUD_SHADE[ci], CLOUD_LIT[ci], litK), cover) * g;
    }
  };
  const SB = sky + 24.0, SL = x0 - 30, SR = x1 + 30;
  P.billboard(SL, SR, -6.0, 34.0, SB, skyShade(false), 18, 44);
  P.panel(SL - 30, bz, SL, SB, -6.0, 34.0, skyShade(false), 12, 14);        // left wing
  P.panel(SR, SB, SR + 30, bz, -6.0, 34.0, skyShade(false), 12, 14);        // right wing
  P.ground(SL - 30, SR + 30, PROUD, SB, 34.0, skyShade(true), 22, 12, true); // the ceiling
  // ...and the strip above the roofline, facing OUT so it is there when you turn round. Note
  // the point order: `panel()`'s normal is the right-hand perpendicular of a->b.
  P.panel(SR, PROUD - 0.03, SL, PROUD - 0.03, storey + 2.2, 34.0, skyShade(false), 20, 6);

  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true, fog: false, side: THREE.FrontSide, toneMapped: true,
  });
  mat.name = 'exterior.yard';
  const mesh = P.build(mat, `exterior.yard.${site.id}`);
  mesh.frustumCulled = false;   // one merged mesh spanning the whole yard; the test is useless

  // ---- colliders, in yard space. Only the LIVE yard's are ever registered — see setPlan().
  const solids = [
    [x0 - 0.3, x0 + 0.3, bz - 40, bz + 2, sideH + 0.7],   // court sides, run back to the house
    [x1 - 0.3, x1 + 0.3, bz - 40, bz + 2, sideH + 0.7],
    [x0 - 1, x1 + 1, bz - 0.35, bz + 0.35, wallH + 0.7],  // the boundary wall
  ].map(([a, b, c0, c1, h]) => ({ x0: a, x1: b, z0: Math.max(FACE, c0), z1: c1, h }));
  if (kind === 'garden') {
    // the basin, so the one thing standing in the middle of the yard is not a hologram
    const bxq = CX + W * 0.235, bzq = PROUD + apron + 6.6;
    solids.push({ x0: bxq - 2.7, x1: bxq + 2.7, z0: bzq - 2.7, z1: bzq + 2.7, h: 0.7 });
  }

  return { mesh, solids, tris: P.tris };
}

/** A box already positioned, for the cases that need the geometry rather than the shortcut. */
function boxAt(w, h, d, x, y, z) {
  const g = new THREE.BoxGeometry(Math.max(w, 1e-3), Math.max(h, 1e-3), Math.max(d, 1e-3));
  g.translate(x, y, z);
  return g;
}

// ---------------------------------------------------------------------------
// The dressing — one set of hardware, on every closed connector in the house
// ---------------------------------------------------------------------------

/**
 * ⚠️ **THIS SECTION DELIBERATELY CONTRADICTS THE ROUND THAT BUILT IT, AND HERE IS WHY.**
 *
 * As shipped, the dressing MARKED the run's answer. A live exit leaked — a daylight seam, a
 * draught, a cold patch on the floor — measured at **+20.3 luma on the jamb strip in both of
 * the room's breathing phases**, cold against a deliberately warm-shadowed room. A chained
 * exit instead wore human hardware: chain, padlock, hasp. And an ordinary breachable panel
 * between two rooms wore **nothing at all**.
 *
 * Three states, three different looks, from across the room, before the player commits
 * anything. That is `play-critic-7`'s defect stated as geometry: *"the operative tell is
 * ELIMINATION, not EVIDENCE... nobody will ever say 'I should have seen that', because there is
 * nothing to see and nothing to miss."* You find the way out by counting padlocks, and having
 * counted, the seam confirms it.
 *
 * `docs/design/procedural-map.md` §2 forbids exactly this: *"a closed connector must give
 * NOTHING away. Same jamb, same architrave, same dressing, same sound. The moment a live exit
 * is distinguishable while closed, the whole idea collapses back into elimination."*
 *
 * So the dressing is now a property of the CONNECTOR, not of its state, and `?tells=` decides
 * which rule is in force (`connectors.js` `connectorDressing`):
 *
 *   blind   default. Seeded per (run seed, connector id). Chains, seams, boards and mortar
 *           appear on breachable panels, on chained sites and on the live exit alike, and a
 *           padlock stops being an answer. The cues are made UNRELIABLE rather than deleted,
 *           which is the option §2 names first and the one that keeps a measured, judged piece
 *           of work in the build instead of throwing it away on a builder's say-so.
 *   marked  the shipped rule, exactly: chain on the chained, seam and lock dressing on the live
 *           one. `harness/scenarios/exterior-look.mjs`'s +20.3 luma A/B still reproduces.
 *   off     nothing anywhere. The control arm, so "the dressing moved this number" can be
 *           answered instead of argued.
 *
 * ⚠️ **AND THE REVEAL IS PROTECTED.** The floor spill and the draught — the two cues that are
 * actual daylight rather than hardware — do not fire in `blind` while the panel still blocks
 * sight. They arrive at the BEAM stage, the last and most expensive one, where `blocksSight`
 * goes false. That is `procedural-map.md` §2's payoff and it needs no new mechanic: you commit,
 * you spend 15-25 s making the loudest noise in the game, and at the final stage you see
 * through the studs and learn what you bought. Lighting it earlier is what made it free.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ **INSTANCED, AND THE DRAW-CALL BUDGET IS THE REASON.** The worst parked station measures
 * **614 / 625** (`eo2-calls.mjs`, twelve stations). Spreading the dressing from 14 exit sites
 * to all 22 connectors as separate meshes costs one call per dressed panel per resident room,
 * and a bad seed could put a dozen of them on screen at once — which would blow the budget
 * silently and seed-dependently, i.e. in a way no single capture would ever reproduce.
 *
 * Four `InstancedMesh`es instead — chain, seam, boards, mortar — each carrying every connector
 * in the house. **Four draw calls, flat, whatever the seed does.** That is fewer than the up to
 * fifteen the per-site version could reach, so this section now costs LESS than the one it
 * replaces. Hiding an instance is a zero-scale matrix; the seam's per-stage fade rides on
 * `instanceColor`, which multiplies vColor.rgb and therefore scales an additive contribution
 * exactly as an opacity would.
 *
 * ⚠️ ONE GEOMETRY PER KIND, AUTHORED AT THE DEFAULT APERTURE AND SCALED PER INSTANCE. Every
 * connector in the house is `CONNECTOR_W` x `CONNECTOR_H` except the orangery doors (3.20 x
 * 3.40), which get a 1.54x lateral stretch rather than re-authored link spacing. Stated rather
 * than hidden: it is the one visible difference from the per-site version, it is on one site
 * out of fourteen, and it is not on the site any recorded measurement was taken at.
 *
 * ⚠️ AND EVERY KIND IS BUILT ON **BOTH FACES**. A breachable panel has a real room on each
 * side, so hardware on one face only would be a new tell of its own — walk round it and the
 * bare side tells you which way the connector was authored. The exit sites' outer copies sit
 * outside the house where nothing can see them until the wall is gone, at which point the
 * dressing is hidden anyway.
 */

/** The aperture every dressing geometry is authored at. Instances scale from here. */
const DRESS_W = CONNECTOR_W;
const DRESS_H = CONNECTOR_H;

/**
 * 🚨 **THE SEGMENT FAMILY — AND IT CLOSES A TELL THAT BROKE THE CORE PROMISE.**
 *
 * `?dig=1` puts 36 wall segments in the house and `views/game.js` used to filter every one of
 * them OUT of this dressing, for a reason that was true when it was written and stopped being
 * true the moment the interconnect landed: *"a dig segment is not a connector you gamble on — it
 * can never lead anywhere."* One of them now can. So the shipped panels wore boards and a chain
 * and the segments wore nothing, and **the one bay in the wall wearing hardware was the only bay
 * that went anywhere** — visible in `progress/playtest/game.play.dig-wall-pristine.png`.
 * `procedural-map.md` §2 forbids precisely that: *"a closed connector must give NOTHING away."*
 *
 * ⚠️ **AND IT IS NOT A COPY, BECAUSE THE GEOMETRY IS AUTHORED ONCE AND SCALED PER INSTANCE.**
 * Every kind below is built at `DRESS_W x DRESS_H` and each instance carries
 * `makeScale(w/DRESS_W, h/DRESS_H, 1)`. A segment is 1.14 x 1.80, so a padlock hung that way
 * comes out **0.55x wide and 0.67x tall** — a shrunken toy padlock on one bay and a full-size
 * one on the next is a *worse* tell than no padlock at all, because it is a tell that reads as a
 * bug. So the segments get their **own authored family** at their own aperture: same link box,
 * same board thickness, same hasp, spread across a smaller opening.
 *
 * ⚠️ **ONE FACE, NOT TWO.** The connector family builds every kind on both faces of the wall,
 * because a breachable panel has a real room on each side and a bare back face would be a tell
 * of its own. A segment is 0.075 m of finish with **brick behind it** — its back face is inside
 * masonry, where a chain would be invisible, unreachable and paying for itself every frame. The
 * far room gets hardware from its OWN segment (`d.<edge>.<i>.b`), which is the same two-sidedness
 * the panels already have.
 *
 * ⚠️ **AND THE Z OFFSETS ARE NOT THE SAME NUMBERS, BECAUSE THE TWO FAMILIES DO NOT SHARE AN
 * ORIGIN.** A shipped connector's origin is the CENTRE of the 0.30 m wall band, so its faces are
 * at ±0.15 and the hardware sits at ±0.17 — 0.02 proud. A dig segment's origin is its room's
 * inner wall FACE (`dig.js`: `at ± HALF_BAND`), so the same 0.02 standoff is z = +0.02. Copying
 * 0.17 across would have floated every chain 17 cm off the wall, which does not throw and looks
 * like a physics bug.
 */
const SEG_FAMILY = 'segment';
const CONN_FAMILY = 'connector';
/**
 * z of each face the hardware is built on, per family. See the note above.
 *
 * 🚪 ⚠️ **AND THE CHAIN MOVED OUT, FROM 0.02 PROUD TO 0.05.** It sat 2 mm in front of the boards
 * it hangs on (0.170 against a plank at 0.168 plus up to 0.007 of jitter, i.e. BEHIND the proud
 * planks), so it had no silhouette against them and no separation to shade — one flat rubbing of
 * ironmongery on timber, which is the other half of why it read as a dashed line. At 0.050 it
 * lies ON the boards. Nothing collides with any of this: `solidBoxes()` is the panel's, and
 * dressing is never in it.
 */
const FACE_Z = {
  [CONN_FAMILY]: { chain: [0.200, -0.200], flat: [0.168, -0.168], seam: [0.153, -0.153] },
  [SEG_FAMILY]: { chain: [0.032], flat: [0.018], seam: [0.003] },
};

/**
 * THE SEAM. A frame of additive light lying on the wall face around the aperture: bright
 * hairline at the joint, falling off over 13 cm onto the plaster.
 *
 * No shader: a `MeshBasicMaterial` with four-component vertex colour, additive. three.js sets
 * USE_COLOR_ALPHA from the colour attribute's itemSize, so the falloff is the alpha channel.
 */
function seamGeometry(colour, W = DRESS_W, H = DRESS_H, faces = FACE_Z[CONN_FAMILY].seam) {
  const P = new Paint(true);
  const BAND = 0.13;
  const CORE = 0.016;
  const hw = W / 2, hh = H / 2;

  const shade = (out, nx, ny, nz, x, y) => {
    const dx = Math.max(0, Math.abs(x) - hw);
    const dy = Math.max(0, Math.abs(y) - hh);
    const d = Math.hypot(dx, dy);
    const soft = Math.max(0, 1 - d / BAND);
    const a = Math.max(soft * soft * 0.55, d <= CORE ? 1 : 0);
    out[0] = colour[0]; out[1] = colour[1]; out[2] = colour[2];
    out[3] = a;
  };
  const strip = (cx, cy, sw, sh, sx, sy, z) => {
    const g = new THREE.PlaneGeometry(sw, sh, sx, sy);
    g.translate(cx, cy, z);
    P._push(g, shade);
  };
  // both faces of the wall — see the section note
  for (const z of faces) {
    strip(0, hh + BAND / 2, W + BAND * 2, BAND, 1, 8, z);
    strip(0, -hh - BAND / 2, W + BAND * 2, BAND, 1, 8, z);
    strip(-hw - BAND / 2, 0, BAND, H, 8, 1, z);
    strip(hw + BAND / 2, 0, BAND, H, 8, 1, z);
  }
  const merged = mergeGeometries(P.parts, false);
  for (const g of P.parts) g.dispose();
  merged.computeBoundingSphere();
  return merged;
}

/**
 * Chain, padlock and hasp — the human hardware that carries `escape.md` §2 without text.
 *
 * ⚠️ `hardware = false` (the SEGMENT family) draws the crossed runs ONLY. A dig-band span is up
 * to 5.72 m against the 1.14 m this geometry is authored at, so its instance stretch turned the
 * 0.20 m padlock into a ~1 m black slab and each corner hasp into a 1.1 m plate — the
 * unreadable blobs in `critic-slice-3`'s service-passage zebra (#6). The stretched RUNS survive
 * the stretch (long links read as steel banding); the compact hardware does not, and a padlock
 * on a wall band was never the narrative — the locked things are the DOORS, whose connector
 * family keeps every piece. `procedural-map.md` §2's "breachable/chained/exit look the same"
 * pool is the connector pool, so this leaks nothing about the exit.
 */
/**
 * 🚪 **THE TONES ARE VERTEX COLOURS, WHICH IS THE ONLY WAY A PADLOCK CAN BE BRIGHTER THAN A LINK
 * WITHOUT A SECOND MATERIAL.** `dark-3` picked ONE iron value for the whole assembly
 * (0x51565e, measured at L 41 in the service passage against a black-clamped L 4-10 before it),
 * and that value is preserved EXACTLY here — `LINK` is 1.00. What it could not do is separate
 * the parts: at one albedo the padlock is the same grey as the links it hangs from, so at three
 * metres in a dark room the whole thing reads as the "dashed X" `bang-1` photographed rather
 * than as a chain with a lock on it. A padlock is human-made and carries the whole premise
 * (`escape.md` §2), so it is the part that has to survive the room being dark.
 *
 * Vertex colour costs nothing: it is baked into the merged geometry, `instanceColor` is not
 * used on this mesh, and `mats.iron` gains `vertexColors` — one material, one program.
 */
const IRON_LINK = [1.00, 1.00, 1.00];
const IRON_HASP = [1.22, 1.22, 1.24];
const IRON_LOCK = [1.72, 1.74, 1.80];

/** Bake one flat vertex colour onto a geometry so `mergeGeometries` keeps a uniform attribute set. */
function tint(g, c) {
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) { col[v * 3] = c[0]; col[v * 3 + 1] = c[1]; col[v * 3 + 2] = c[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function chainGeometry(w = DRESS_W, h = DRESS_H, faces = FACE_Z[CONN_FAMILY].chain, hardware = true) {
  const parts = [];
  const push = (geo, x, y, zz, rot, c) => {
    if (rot) geo.rotateZ(rot);
    geo.translate(x, y, zz);
    parts.push(tint(geo, c));
  };
  for (const z of faces) {
    const inSign = Math.sign(z);
    // Two chain runs, crossed. A link is a flat box turned 90 degrees from its neighbour, which
    // is what makes a row of boxes read as a chain rather than as a dashed line.
    //
    // ⚠️ FEWER, BIGGER LINKS. It was 19 links of 0.115 x 0.055 over a 2.8 m diagonal: at the
    // 3.2 m a player stands to work on a door that is a 24-pixel dash with a 9-pixel gap, and
    // `bang-1` read the result as *"a dashed X"* — the correct description of what was drawn.
    // 17 links of 0.165 x 0.082 over the same diagonal is a 35-pixel link, and the pitch (0.176)
    // is SHORTER than the link, so consecutive links overlap the way a real chain's do. At the
    // first try (12 links, pitch 0.235) they did not touch and the result was still a row of
    // separate dashes — measured off the picture, not guessed: `_dl1-zoom-stair.png`.
    for (const dir of [1, -1]) {
      const ax = -w * 0.44 * dir, ay = -h * 0.40;
      const bx = w * 0.44 * dir, by = h * 0.40;
      const N = 16;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const x = ax + (bx - ax) * t;
        const y = ay + (by - ay) * t + Math.sin(t * Math.PI) * 0.06;
        const r = Math.atan2(by - ay, bx - ax) + (i % 2 ? Math.PI / 2 : 0);
        push(new THREE.BoxGeometry(0.165, 0.082, 0.048), x, y, z, r, IRON_LINK);
      }
    }
    // hasps at the four corners and a padlock hanging off the middle — connector family only
    if (hardware) {
      for (const [hx, hy] of [[-w * 0.46, -h * 0.42], [w * 0.46, h * 0.42], [w * 0.46, -h * 0.42], [-w * 0.46, h * 0.42]]) {
        push(new THREE.BoxGeometry(0.24, 0.24, 0.050), hx, hy, z - inSign * 0.005, 0, IRON_HASP);
        // a bolt through each plate: two tones on one plate is what makes it read as ironmongery
        push(new THREE.BoxGeometry(0.075, 0.075, 0.026), hx, hy, z - inSign * 0.040, 0, IRON_LOCK);
      }
      // 🔒 THE PADLOCK. Body, shackle and the staple it is locked through — three parts, because
      // a single box at one tone is a dark rectangle and this is the object the premise is made
      // of. It hangs BELOW the crossing so it is never lost inside the X.
      push(new THREE.BoxGeometry(0.26, 0.32, 0.110), 0.02, -0.20, z - inSign * 0.055, 0, IRON_LOCK);
      push(new THREE.BoxGeometry(0.175, 0.175, 0.052), 0.02, -0.01, z - inSign * 0.055, 0, IRON_LOCK);
      push(new THREE.BoxGeometry(0.085, 0.085, 0.030), 0.02, -0.20, z - inSign * 0.115, 0, IRON_HASP);
    }
  }
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  merged.computeBoundingSphere();
  return merged;
}

/**
 * Boards nailed over it from the outside. `run.js`'s `boarded` tell, as geometry.
 *
 * 🕳️ Per-plank jitter and per-plank vertex tone are `dark-3`'s half of the black-cut-out fix
 * (`critic-slice-3` #5): four identical coplanar boxes in one uniform colour read as a decal —
 * one specular streak ran unbroken across all four planks, which is a painted card, not four
 * pieces of lumber. The width/x/z/tilt jitter breaks the streak at each plank and the tone
 * spread (±14%, baked as vertex colours so it costs no material and no draw call) is the
 * board-to-board drift `walnut.js` argues every real board pile has. The z jitter is signed
 * with the face so a proud plank is proud on BOTH faces of a two-faced connector.
 */
const BOARD_TONES = [
  [1.05, 1.02, 0.96], [0.83, 0.81, 0.78], [1.14, 1.12, 1.07], [0.93, 0.89, 0.83],
  [1.00, 0.96, 0.90], [0.88, 0.86, 0.84],
];
/**
 * 🚪 **SIX PLANKS ACROSS 92% OF THE APERTURE, NOT FOUR ACROSS 68%, AND THE REASON IS THE THING
 * BEHIND THEM.** The panel a board is nailed to is a dark recessed slab, so every centimetre of
 * aperture the boards do not cover is a strip of the "flat black cut-out" `critic-slice-3` #5
 * ranked — at four planks over 0.68 H, a third of the hole was that strip, top and bottom, and it
 * framed the boards in exactly the black rectangle the boards were there to remove. Full-height
 * cover also gives the chain a LIGHT field to be a dark object against, which is what lets it
 * read in a room with no light in it: albedo contrast survives a dark room, shading does not.
 *
 * The two cleats are the other half. Six parallel stripes at one pitch read as a shutter or a
 * radiator; two vertical battens nailed across them read as somebody's hurry.
 */
function boardsGeometry(W = DRESS_W, H = DRESS_H, faces = FACE_Z[CONN_FAMILY].flat) {
  const parts = [];
  const N = 6;
  for (const z of faces) {
    for (let i = 0; i < N; i++) {
      const y = -H * 0.46 + (H * 0.92 * i) / (N - 1);
      const g = new THREE.BoxGeometry(W * (0.99 + ((i * 5) % 3) * 0.024), H * 0.155, 0.042);
      g.rotateZ((i % 2 ? 1 : -1) * (0.031 + ((i * 7) % 5) * 0.003));
      g.translate(((i % 3) - 1) * W * 0.012, y, z + Math.sign(z) * ((i % 2) ? 0.007 : -0.003));
      parts.push(tint(g, BOARD_TONES[i % BOARD_TONES.length]));
    }
    // two cleats, off-centre and off-vertical, nailed over the planks
    for (const [cx, tilt, k] of [[-W * 0.27, 0.038, 1], [W * 0.30, -0.026, 3]]) {
      const g = new THREE.BoxGeometry(W * 0.115, H * 0.90, 0.038);
      g.rotateZ(tilt);
      g.translate(cx, 0, z + Math.sign(z) * 0.013);
      parts.push(tint(g, BOARD_TONES[k]));
    }
  }
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  merged.computeBoundingSphere();
  return merged;
}

/**
 * A patch of newer render, standing 8 mm proud with a visible margin all round. `run.js`'s
 * `plaster` tell: it reads as a bay that does not match its neighbours, which is `escape.md`
 * §6's second tell and — now that it appears on connectors the run did not choose — a bay that
 * does not match its neighbours and does not mean anything either.
 */
function mortarGeometry(W = DRESS_W, H = DRESS_H, faces = FACE_Z[CONN_FAMILY].flat) {
  const parts = [];
  for (const z of faces) {
    const g = new THREE.BoxGeometry(W * 0.92, H * 0.88, 0.016);
    g.translate(0, 0, z);
    parts.push(g);
  }
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  merged.computeBoundingSphere();
  return merged;
}

/** The four kinds, in the order the instanced meshes are created. */
const DRESS_KINDS = ['chain', 'seam', 'boards', 'mortar'];

/** Which authored family a panel's hardware is built at. See `SEG_FAMILY`. */
function dressFamily(p) { return p.spec?.dig ? SEG_FAMILY : CONN_FAMILY; }

// ---------------------------------------------------------------------------
// 🚪 EVERY CLOSED DOOR IS CHAINED AND BOARDED — John, 2026-08-11
// ---------------------------------------------------------------------------

/**
 * 🚪 **THE RULE: A CLOSED CONNECTOR IS ALWAYS CHAINED AND ALWAYS BOARDED.**
 *
 * John: *"I want to keep the OG chained doors. they should be **visually the same as the ones
 * the hunter bashes on**, but the undamageable ones are on the edge of the map and don't open.
 * That way **players don't get a sense of direction from the lack of doors on the outside
 * walls**."*
 *
 * 🚨 **THAT IS A SEARCH-INTEGRITY REQUIREMENT, NOT DECORATION.** If the perimeter carried fewer
 * doors — or doors that looked like a different kind of object — the house would tell a player
 * which way is out before they had looked anywhere. The exterior chained doors exist to destroy
 * that tell, and they only do it if they read as the same furniture as the interior ones.
 *
 * ⚠️ **WHAT WAS WRONG, MEASURED RATHER THAN ASSERTED.** `connectorDressing`'s `blind` arm is a
 * per-cue coin flip (`DRESS_P` chain 0.50, boards 0.28, mortar 0.28), so over 512 seeds
 * **49.4% of closed connectors wore no chain and 22% wore nothing at all**
 * (`harness/evidence/_dl1-census.mjs`). `bang-1` announced "THE WEST GALLERY DOOR", walked to it, and
 * photographed *"a dark recessed panel with corner brackets and a dashed X: no chain, no
 * padlock"* — a mechanic named for chains, on a door with none.
 *
 * ⚠️ **AND THE COIN FLIP LEAKED NOTHING, WHICH IS WHY THIS IS AN OVERLAY AND NOT A RETUNE.**
 * `DRESS_P` is `connectors.js`'s and stays exactly as it is: `conn-1.mjs` C5/C6 and
 * `_tmp_seam_correlation.mjs` are written against those numbers and still pass. This function is
 * applied by `setPlan()` **on top of** `connectorDressing`, in `blind` only, and it takes the
 * result to a CONSTANT — which is the strongest possible form of "uncorrelated": a value that is
 * the same for every connector cannot correlate with state, with position, or with whether the
 * door can be forced.
 *
 * ⚠️ **VARIETY SURVIVES, IT JUST STOPPED BEING A VARIETY OF *LANGUAGE*.** `variant` is a seeded
 * index over `TIMBER` below, drawn from **(run seed, connector id) only** — the same two inputs
 * `connectorDressing` uses and, critically, not the state, not the room and not the wall. It
 * drives a per-instance tint on the boards, so two doors are different lumber and never different
 * objects. Zero extra meshes, zero extra materials, zero extra draw calls: `instanceColor`
 * multiplies the per-plank vertex tone that is already there.
 *
 * ⚠️ **MORTAR IS OFF ON DOORS AND THAT IS THE `critic-slice-3` #5 FIX, NOT A TASTE CALL.** The
 * mortar patch is an opaque slab across 92% x 88% of the aperture. On a door it is the "flat
 * black cut-out" the critic ranked (`p.gal_w` measured **L 21.4 with 69% of its own pixels under
 * L18**), and it is the same slab HANDOFF lists as an open defect for covering two apertures. A
 * patch of new render is a WALL treatment; it stays available to the dig band, where there is no
 * aperture behind it, with an albedo that no longer reads as a hole (see `mats.mortar`).
 *
 * ⚠️ **DIG BANDS ARE NOT DOORS AND THIS RULE DOES NOT TOUCH THEM.** `room.chainedDoorsOf` already
 * draws that line (*"a dig band is not a door"*). The 36 segments keep `connectorDressing`'s
 * distribution untouched, which is the property `views/game.js` protects: no segment is
 * distinguishable from its 35 neighbours, so the interconnect stays hidden.
 *
 * @param {object} d   `connectorDressing`'s answer for this connector
 * @param {string} id  connector id
 * @param {string|number} seed  the RUN seed
 */
export const DRESS_RULE = 'chained-and-boarded';

/**
 * The timber a boarded door is made of. Multiplies `mats.board`'s colour through `instanceColor`,
 * so it costs one float3 per connector and nothing per frame. Kept inside a narrow band on
 * purpose: it must read as "another door, different planks", never as another kind of object.
 */
export const TIMBER = [
  [1.00, 1.00, 1.00],   // deal — `dark-3`'s measured value, unchanged
  [0.88, 0.87, 0.86],   // weathered grey
  [1.10, 1.04, 0.94],   // fresh pine
  [0.94, 0.88, 0.80],   // dark oak
];

export function dressingRule(d, id, seed) {
  const v = Math.min(TIMBER.length - 1, Math.floor(seedRand(seed, `dress.timber|${id}`) * TIMBER.length));
  return { ...d, chain: true, boards: true, mortar: false, variant: v };
}

// ---------------------------------------------------------------------------
// 🧱 THE MORTAR PATCH COMES OFF THE DIG BAND — `mortar-1`, 2026-08-11
// ---------------------------------------------------------------------------

/**
 * 🚨 **A PATCH OF NEW RENDER IS A TREATMENT FOR A BRICKED-UP APERTURE. A DIG FACE IS NOT ONE, AND
 * THE SLAB WAS COVERING 81% OF IT.**
 *
 * ⚠️ **THE COUNT, MEASURED, BECAUSE THREE DOCUMENTS CARRIED THREE DIFFERENT ONES.** `HANDOFF.md`
 * files this defect as *"covers two apertures"*; `walls-perf.md` found it in front of DIG FACES;
 * `dressbin-1` reported *"8 of 28 free faces"*. `harness/scenarios/_mortar1-count.mjs` takes all
 * three with one instrument — the module's own plan AND an independent geometric census of every
 * `exterior.mortar` slab in the draw set, instances expanded, pushed into each panel's own frame:
 *
 *   · **dig faces: 10 of 28 on seed s4 and s1, 6 of 28 on s2/s7/s9.** It is a per-seed
 *     `Binomial(28, DRESS_P.mortar = 0.28)` draw, mean 7.84 — so *"8"* is the EXPECTATION and no
 *     house has ever had exactly it. Every one of the ten covers **81.0% of its face rectangle**
 *     (0.92 x 0.88 of the panel), standing **10 to 26 mm proud** of the face plane.
 *   · **exit apertures: 0 of 14, on all five seeds. HANDOFF'S TWO-APERTURE LINE IS STALE** —
 *     `dressingRule` (2026-08-11, the chained-and-boarded rule) already sets `mortar: false` on
 *     every connector in `blind`. That zero is a measurement of the BUILD and not of the probe:
 *     `setSegmentMortar`'s sibling `setDressRule(false)` brings **6 apertures + 2 interior
 *     connectors** straight back in the same page.
 *
 * 🎯 **WHY OFF, AND NOT INSET OR CONDITIONAL — the two alternatives were considered and are
 * worse, not merely unchosen.**
 *   · **INSET BEHIND THE FACE is wrong by construction.** `FACE_Z[SEG_FAMILY].flat` is ONE face,
 *     precisely because a segment's far side is inside masonry. An inset slab would be buried
 *     until the dig cut through it and would then surface INSIDE THE CRATER, which is where the
 *     white shell and the cyan structure live. That is a new defect in the campaign's own
 *     centrepiece.
 *   · **OMIT ONLY WHERE IT OCCLUDES degenerates to this.** The slab is authored at 0.92 x 0.88 of
 *     the panel and centred on it, so it occludes its own face on EVERY instance at EVERY seed —
 *     measured 81.0% on 10 of 10, with no spread. There is no "sometimes" for a test to find, and
 *     a runtime occlusion test would be a per-frame answer to a question fixed at authoring time.
 *
 * ⚠️ **IT COSTS NOTHING IN TELLS, AND THAT IS `dressingRule`'S OWN ARGUMENT REUSED.** Taking a cue
 * to a CONSTANT is the strongest possible form of "uncorrelated": a value that is the same for
 * every segment cannot correlate with the interconnect. `chain` and `boards` keep
 * `connectorDressing`'s distribution untouched on all 36 segments, which is the property
 * `views/game.js` protects — *"no segment is distinguishable from its 35 neighbours"*.
 *
 * ⚠️ **`marked` AND THE `plaster` LOCK ARE UNTOUCHED.** `setPlan` puts mortar on the live EXIT for
 * a `plaster` lock, and an exit is a CONNECTOR — `escape.md` §6's second tell still fires and
 * `exterior-look.mjs`'s measured arm still runs.
 *
 * **`?segmortar=1` is the complete revert**, and `setSegmentMortar()` is the same flip in place,
 * so the look and the draw-call A/B are both a paired flip inside ONE page — never two walks
 * (`dressbin-1`: the same station read 423/461/479 calls across a walk).
 */
function _segMortarUrl() {
  if (typeof location === 'undefined') return false;
  return new URLSearchParams(location.search).get('segmortar') === '1';
}

// ---------------------------------------------------------------------------
// 🚪 A DOOR IS A STANDARD SIZE — `dressfix-1`, 2026-08-15
// ---------------------------------------------------------------------------

/**
 * 🚨 **THE HARDWARE WAS STRETCHED TO ITS HOST PANEL, AND A HOST PANEL IS NOW A WHOLE WALL.**
 *
 * John, on a generated house: *"one of the screenshots had a big slab with a chain X across it. it
 * looks weird. **actual doors should be a standard size**."*
 *
 * ⚠️ **MEASURED ON THE PRE-FIX BUILD, `?plan=gen&planseed=3`, instances expanded through
 * `instanceMatrix` and read as a WORLD extent** (`harness/scenarios/_dressfix1-recon.mjs`) — not
 * divided out of the source:
 *
 *   · `exterior.dress.chain.segment` is authored **1.165 x 1.622 m** and was drawn **6.95 m wide**
 *     on `f.g10.0.b`, **6.64 m** on `f.g8.0.a/b`.
 *   · `exterior.dress.boards.segment` is authored **1.194 x 1.970 m** and was drawn **12.15 m
 *     wide x 3.06 m tall** on `f.g16.0.b`.
 *   · Those are only the faces RESIDENT at that station. The house's widest free faces are
 *     **27.20 m** (`f.g24.0.a`, `f.g25.0.a`, both wearing a chain in the plan), i.e. a chain
 *     authored at 1.14 m and stretched **23.9x** — a door-sized X across an entire wall.
 *
 * **THE CAUSE IS ONE LINE AND IT IS THE SAME LINE THE FILE ALREADY DOCUMENTS BITING THE OTHER
 * WAY.** `SEG_FAMILY`'s note above explains that a 1.14 x 1.80 bay measured against a 2.08 x 2.68
 * connector *"comes out 0.55x wide and 0.67x tall — a shrunken toy padlock"*, and gave the dig
 * bays their own authored family so the stretch would be 1.00. **`?dig=free` then put a second,
 * completely different population into that same family**: `freePanels()` emits ONE face per wall
 * (`w = hi - lo`, `h = DIG_H` 2.80), so the family whose whole purpose was "no stretch" acquired
 * members up to 23.9x its authored aperture.
 *
 * 🎯 **THE FIX: A FREE DIG FACE IS A WALL, NOT AN APERTURE, SO THE DOOR ON IT IS DRAWN AT THE
 * STANDARD DOOR SIZE AND NEVER SCALED.** `CONNECTOR_W x CONNECTOR_H` — 2.08 x 2.68 — centred on
 * the face, which is where the panel's own origin already is.
 *
 * ⚠️ **WHAT DELIBERATELY DID NOT CHANGE, AND EACH ONE WAS CHECKED RATHER THAN ASSUMED:**
 *   · **`?dig=bays`.** Its 36 bays are exactly `SEG_W x SEG_H`, so this family still authors at
 *     the bay aperture and every instance still scales 1.00 x 1.00. Byte-identical.
 *   · **THE FAMILY IS STILL CALLED `segment`** and there are still exactly two of them, so
 *     `exterior.dress.*.segment` still resolves and `dressMeshes` is still 8. `_dl1-doors.mjs`,
 *     `_mortar1-look.mjs` and `_pris1-who.mjs` all name those meshes; a third family would have
 *     broken three instruments belonging to other agents for no gain, since the two dig arms are
 *     mutually exclusive and can never both be in one build.
 *   · **`mortar-1`'s fix.** `deriveDressing`'s segment-mortar gate is keyed on
 *     `dressFamily(p) === SEG_FAMILY`, which is exactly the set that changed aperture, so it still
 *     covers every free face and `?segmortar=1` still reverts it.
 *   · **THE ORANGERY'S 1.54x LATERAL STRETCH IS UNTOUCHED AND IS REPORTED, NOT FIXED.** Its doors
 *     are 3.20 x 3.40 in the AUTHORED house and `buildDressing`'s note calls that *"a known,
 *     stated, judged compromise on one site of fourteen"*. It is a real door, at a real aperture,
 *     on a map John was not complaining about; taking the chain off its jambs would be an
 *     unmeasured look change to a shipped frame. **Left for whoever prices the split.**
 *   · **`hardware` stays false on the dig family.** The stated reason (*"its instance stretch
 *     turned the 0.20 m padlock into a ~1 m black slab"*) no longer applies now that the stretch
 *     is gone — so a padlock and four hasps could be turned on here for free. **That is a look
 *     change nobody asked for and it is not taken**; it is John's call, and `?dressscale=1`
 *     below is not the arm for it.
 *
 * **`?dressscale=1` puts the stretch back**, and `setDressFixed(false)` is the same flip in place,
 * so the draw-call A/B is a paired flip inside ONE page and never two walks (`dressbin-1`: the
 * same station read 423/461/479 calls across a walk).
 * ⚠️ **THE REVERT ARM IS THE DEFECT REPRODUCED, NOT THE PRE-FIX BUILD BYTE-FOR-BYTE.** Geometry is
 * authored once, at construction, so both arms share the door-sized geometry and the OFF arm
 * stretches THAT: a 27.20 m face reads **28.2 m** of chain instead of the pre-fix **27.8 m**,
 * because the pre-fix build stretched a 1.165 m geometry 23.9x and this one stretches a 2.154 m
 * geometry 13.1x. Both are "a chain across the entire wall"; the fixed arm is 2.15 m.
 */
function _dressScaleUrl() {
  if (typeof location === 'undefined') return false;
  return new URLSearchParams(location.search).get('dressscale') === '1';
}

/**
 * The aperture a family authors its geometry at.
 *
 * ⚠️ **IT IS A FUNCTION OF THE PANELS, NOT A CONSTANT, BECAUSE `segment` COVERS TWO DIG ARMS WITH
 * DIFFERENT APERTURES.** `?dig=bays` fills it with 1.14 x 1.80 bays; `?dig=free` fills it with
 * whole walls up to 27.20 m, which have no aperture at all. The two never coexist — `dig.js`
 * emits `digPanels()` or `freePanels()`, never both — so one family with a derived aperture is
 * honest, and it is what keeps the mesh names and the mesh count where every other instrument
 * expects them.
 */
function familyAperture(fam, panels) {
  if (fam === CONN_FAMILY) return [DRESS_W, DRESS_H];
  return panels.some((p) => p.spec?.free) ? [DRESS_W, DRESS_H] : [SEG_W, SEG_H];
}

/** A face with no aperture in it takes the door at its authored size. See the block above. */
function dressUnscaled(p) { return !!p.spec?.free; }

/**
 * Every connector's hardware, as four instanced meshes PER AUTHORED FAMILY.
 *
 * ⚠️ **THE DEFAULT BUILD IS UNCHANGED, DELIBERATELY.** With `?dig=0` there are no segments, so
 * exactly one family exists and this is the same four `InstancedMesh`es, at the same aperture,
 * with the same per-instance scale — including the orangery's 3.20 x 3.40 doors still taking a
 * 1.54x lateral stretch. **That stretch is a known, stated, judged compromise on one site of
 * fourteen and giving it its own family here would be an unmeasured change to the shipping
 * build, made as a side effect of a dig round.** It is grouped by FAMILY rather than by exact
 * aperture for that reason and no other; a round that owns the exterior can split it and price
 * it at the twelve stations.
 *
 * ⚠️ **A FAMILY WITH NOTHING SHOWN COSTS NOTHING** — `update()` drops `visible` to false, the
 * same rule `wallinstances.js` uses. So the second family is only ever paid for at a station
 * that can actually see a dressed segment, which is what makes the cost measurable rather than
 * flat: `?dig=1` adds up to 4 calls where a dressed segment is resident and 0 everywhere else.
 *
 * @param {DestructibleWall[]} panels  EVERY closed connector in the house, not just the sites
 * @param {THREE.Object3D} parent
 */
function buildDressing(panels, parent, mats, dayColour) {
  const n = Math.max(1, panels.length);
  const seamMat = new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, depthTest: true, side: THREE.DoubleSide, toneMapped: true,
  });
  seamMat.name = 'exterior.seam';
  const mat = { chain: mats.iron, seam: seamMat, boards: mats.board, mortar: mats.mortar };

  // Which families this build actually contains. Seed-independent: `spec.dig` is a property of
  // the BUILD (`?dig=`), never of the run plan, so the mesh count cannot move with the seed —
  // `wallinstances.js`'s header states why that property is load-bearing.
  const families = [...new Set(panels.map(dressFamily))];
  const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);
  const groups = new Map();

  for (const fam of families) {
    // 🚪 DERIVED FROM THE PANELS IN THIS FAMILY, NOT A CONSTANT — see `familyAperture`.
    const [W, H] = familyAperture(fam, panels.filter((p) => dressFamily(p) === fam));
    const fz = FACE_Z[fam];
    // ⚠️ **`hardware` WAS NEVER PASSED AND THE COMMENT ON `chainGeometry` SAID IT WAS.** The
    // segment family got the four corner hasps and the padlock too, and a dig span is up to
    // 5.72 m against the 1.14 m the geometry is authored at — so the instance stretch turned a
    // 0.20 m padlock into a ~1 m slab and each hasp into a 1.1 m plate. That is `critic-slice-3`
    // #6's unreadable blobs, still in the build, described accurately in a comment that nothing
    // implemented. The runs stretch fine (long links read as steel banding); the compact hardware
    // does not, and a padlock on a wall band was never the narrative.
    const geo = {
      chain: chainGeometry(W, H, fz.chain, fam === CONN_FAMILY),
      seam: seamGeometry(dayColour, W, H, fz.seam),
      boards: boardsGeometry(W, H, fz.flat),
      mortar: mortarGeometry(W, H, fz.flat),
    };
    const im = {};
    for (const k of DRESS_KINDS) {
      const m = new THREE.InstancedMesh(geo[k], mat[k], n);
      m.name = `exterior.dress.${k}${fam === CONN_FAMILY ? '' : `.${fam}`}`;
      m.castShadow = false;
      m.receiveShadow = k !== 'seam';
      // The instances are scattered across the whole house, so a bounding sphere around them is
      // the house — culling it would never fire and would cost a recompute per frame. One call.
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.count = n;
      if (k === 'seam' || k === 'boards') {
        // seam: per-instance brightness, so the seam can fade as the wall comes apart without an
        // opacity that would have to be per-material. instanceColor multiplies vColor.rgb, and
        // an additive contribution scales with rgb, so this IS the opacity.
        //
        // 🚪 boards: per-door TIMBER, and it is the whole of "variety survives". `mats.board`
        // already carries `vertexColors` for the per-plank tone spread, and `instanceColor`
        // multiplies that — so one door's lumber differs from the next's for the price of three
        // floats and no second mesh, no second material and no second draw call. The value comes
        // from `dressingRule`'s `variant`, which is seeded on (run seed, connector id) and
        // nothing else.
        m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3);
        m.instanceColor.setUsage(THREE.DynamicDrawUsage);
      }
      for (let i = 0; i < n; i++) m.setMatrixAt(i, HIDE);
      m.instanceMatrix.needsUpdate = true;
      m.visible = false;
      parent.add(m);
      im[k] = m;
    }
    groups.set(fam, { fam, im, geo, W, H });
  }

  // `shown` mirrors what is actually written into each instance matrix, so `update()` can skip
  // the upload on the ~every frame where nothing changed. A shadow copy rather than a read-back
  // because `getMatrixAt` allocates and decomposing it to ask "is this the zero one" is worse
  // than remembering. ONE array per kind across all families — a panel belongs to exactly one
  // family, so the slots never collide and `update()` stays a single pass over `panels`.
  const shown = {};
  for (const k of DRESS_KINDS) shown[k] = new Array(n).fill(false);
  const famOf = panels.map(dressFamily);
  return { groups, families, famOf, seamMat, HIDE, shown, seamK: new Array(n).fill(1) };
}

// ---------------------------------------------------------------------------

/**
/**
 * @param {object} o
 * @param {object} o.room       built mansion
 * @param {THREE.Scene} o.scene
 * @param {Array} o.exits       `views/game.js`'s resolved sites: {site, panel, outSign, halfW}
 * @param {Array} [o.panels]    EVERY closed connector in the house — `room.panels`. The
 *                              dressing spans all of them, because `procedural-map.md` §2 needs
 *                              breachable / chained / exit to look the same while closed and
 *                              the eight interior panels wore nothing at all. Defaults to the
 *                              exit sites, which reproduces the old scope.
 * @param {string} [o.tells]    'blind' (default) | 'marked' | 'off' — see the dressing section
 * @param {Function} [o.rng]    seeded, or the capture stops being reproducible
 * @param {DustSystem} [o.dust] unused; the draught is its own point cloud (see below)
 * @param {boolean} [o.enabled] false builds nothing at all — the ablation
 */
export function buildExterior(o = {}) {
  const { room, scene, exits } = o;
  const rng = o.rng ?? Math.random;
  const enabled = o.enabled !== false;
  const tells = tellMode(o.tells);

  const root = new THREE.Group();
  root.name = 'exterior';
  const solids = [];              // live-site colliders; room.js holds this array by reference

  if (!enabled || !exits?.length) {
    return {
      enabled: false, root, solids, tells,
      setPlan() {}, update() {}, warmup() {}, setVisible() {},
      census: () => ({ enabled: false, yards: [], visible: [] }),
      dressingOf: () => null,
    };
  }
  scene.add(root);

  /**
   * 🕳️ **THE HARDWARE'S VALUES ARE A MEASURED FIX, NOT A TASTE CALL** (`dark-3`, 2026-08-09;
   * `critic-slice-3` #5 and #6 were ONE disease). The boards/chain hung on every closed
   * connector rendered as flat black cut-outs — at `service.mid` the boards alone owned 32% of
   * the frame at mean L 7.4 with 92% of their own pixels under L18, which is why the passage
   * read as "hard black joist shadows" (`_dark2-who.mjs`: hiding the mesh, not any light,
   * removes them; `shadow.intensity = 0` moves the frame +0.01).
   *
   * ⚠️ **AND IT WAS NEVER "NOT LIT", SO NO LIGHT CHANGE COULD FIX IT.** Under a x4 hemisphere
   * the boards' own pixels moved +2.45 while the rest of the frame moved +15.70: the surface is
   * drawn, front-facing and shaded, but at the old albedos (board 0x3b3025, iron 0x2a2b2e —
   * ~3% linear luminance, ~20x darker than the plaster they hang on) their entire lit range
   * landed at L 4-10, at or under the grade's black point. The fix is the object's albedo.
   * `_dark3-ab.mjs` swept three candidate sets live in one held page: these values put the
   * hardware at L 41 in the passage (17% under L18) and L 88 in a lit study, while the REST of
   * the frame reads 76.7 on every arm — the change cannot touch anything but its own pixels.
   *
   * 🚪 **TWO CHANGES TO THAT SET, BOTH THE SAME ARITHMETIC ARGUMENT AS `dark-3`'S:**
   *
   *   · `iron` gains `vertexColors` and NOTHING ELSE. Its colour, roughness and metalness are the
   *     measured values, byte for byte; the attribute exists so `chainGeometry` can make the
   *     padlock 1.7x the links without a second material or a second draw call. Vertex colour
   *     multiplies the diffuse, so a link baked at 1.00 renders exactly what it rendered before.
   *   · `mortar` was **DARKER THAN THE WALL IT PATCHES**, which is backwards: 0x6a6357 is 0.146
   *     linear against plaster around 0.5, so a patch of "newer render" rendered as a hole and is
   *     visible as one in `progress/playtest/game.play.dl1-breach-chapel.png` — a pure black
   *     rectangle on a brown wall where the undressed frame has panelling. New render is LIGHTER
   *     than aged wall, not darker. 0xb0a494 is 0.38 linear, the same size of move `dark-3` made
   *     on the boards (0.045 -> 0.25) and for the same reason.
   */
  const mats = {
    iron: new THREE.MeshStandardMaterial({ color: 0x51565e, roughness: 0.45, metalness: 0.60, vertexColors: true }),
    board: new THREE.MeshStandardMaterial({ color: 0x94836a, roughness: 0.92, metalness: 0.0, vertexColors: true }),
    mortar: new THREE.MeshStandardMaterial({ color: 0xb0a494, roughness: 0.94, metalness: 0.0 }),
  };
  mats.iron.name = 'exterior.iron';
  mats.board.name = 'exterior.board';
  mats.mortar.name = 'exterior.mortar';

  /** Cold daylight, linear. Additive over a room whose walls sit near 0.03 — see the report. */
  const DAY = [0.62, 0.74, 0.95];

  // ---- the dressing, over EVERY closed connector -------------------------
  //
  // ⚠️ `o.panels`, NOT `exits`. That one argument is the whole of `procedural-map.md` §2's
  // second half: with the hardware confined to the fourteen exit sites, "does this wall have a
  // chain on it" separated a candidate from a plain wall before the padlock count even started.
  const panels = (o.panels?.length ? o.panels : exits.map((e) => e.panel));
  const dress = buildDressing(panels, root, mats, DAY);
  const dressIndex = new Map(panels.map((p, i) => [p.id, i]));
  /**
   * The instance transform for each panel, computed ONCE. Panels never move — the wall comes
   * apart in place — so recomputing a world matrix per frame would be 22 matrix multiplies to
   * arrive at the number we already have. `updateWorldMatrix(true, false)` walks up to the
   * scene, which is valid here because `views/game.js` adds `room.root` before it builds this.
   */
  const _scale = new THREE.Matrix4();
  /** 🚪 the fixed-door-size rule. `?dressscale=1` / `setDressFixed(false)` is the A/B arm. */
  let _fixedDress = !_dressScaleUrl();
  /**
   * 🚪 **RE-DERIVED, NOT COMPUTED ONCE, SO THE DOOR-SIZE FIX HAS AN IN-PLACE ARM.** Panels still
   * never move — this runs at build and again only when `setDressFixed()` flips — so `update()`
   * still reads a number it already has, which is the reason this table exists at all.
   *
   * ⚠️ SCALED AGAINST ITS OWN FAMILY'S AUTHORED APERTURE, NOT AGAINST `CONNECTOR_W/H`. That is
   * the entire point of the segment family: a 1.14 x 1.80 bay measured against 2.08 x 2.68
   * scales 0.55 x 0.67, which is what shrank the padlock. Measured against its own family it
   * is 1.00 x 1.00 and the hardware is the same physical size on every wall in the house.
   *
   * 🚪 …AND A FREE DIG FACE IS NOT SCALED AT ALL. It is a WALL, up to 27.20 m of it, with no
   * aperture in it — so the door is drawn at the size a door is. See the `dressfix-1` block.
   */
  const dressM = new Array(panels.length);
  function computeDressM() {
    for (let i = 0; i < panels.length; i++) {
      const p = panels[i];
      p.root.updateWorldMatrix(true, false);
      const g = dress.groups.get(dress.famOf[i]);
      if (_fixedDress && dressUnscaled(p)) { dressM[i] = p.root.matrixWorld.clone(); continue; }
      dressM[i] = p.root.matrixWorld.clone()
        .multiply(_scale.makeScale(p.width / g.W, p.height / g.H, 1));
    }
  }
  computeDressM();
  /** panel id -> {chain, seam, boards, mortar}. Re-derived by `setPlan`, read by `update`. */
  let dressPlan = new Map();
  const _col = new THREE.Color();

  /** 🏡 the fallback yard's width rule. `?yardwide=0` restores the fixed ±6.0 m box. */
  const _yardWide = _yardWideUrl();

  const sites = new Map();
  for (const e of exits) {
    const home = room.spaces.find((s) => s.id === e.site.a);
    const storey = home?.storey ?? 4.8;
    const w = e.site.w ?? e.panel.width;
    const h = e.site.h ?? e.panel.height;
    const inSign = -e.outSign;

    // The yard's frame: local +z is outward through the hole, local +x is the panel's lateral
    // axis. Derived from the panel and the DERIVED outSign, never authored — a hand-written
    // sign here is the fifth invisible number per site that `views/game.js` already refuses to
    // keep (a mirrored one does not throw; it builds the garden inside the house).
    const g = new THREE.Group();
    g.name = `exterior.${e.site.id}`;
    g.position.set(e.panel.root.position.x, 0, e.panel.root.position.z);
    g.rotation.y = e.panel.rotY + (e.outSign > 0 ? 0 : Math.PI);
    root.add(g);

    // 🏡 AUTHORED SITES ARE UNTOUCHED; a generated one gets a yard as wide as its own wall run.
    // Derived AFTER `g` is parented, because `fallbackYard` asks the group to convert the wall's
    // two world ends into yard-local x rather than repeating the sign rule. See its header.
    const spec = YARDS[e.site.id] ?? fallbackYard(e, home, g, _yardWide);

    const yard = buildYard(spec, e.site, e.panel, storey, rng);
    const yardGroup = new THREE.Group();
    yardGroup.name = `exterior.yard.${e.site.id}`;
    yardGroup.visible = false;
    yardGroup.add(yard.mesh);
    g.add(yardGroup);

    // ---- THE DAYLIGHT CUES, and they are the REVEAL rather than the tell -----------------
    //
    // ⚠️ THESE TWO ARE REAL LIGHT AND THEY ONLY EXIST WHERE THERE IS SOMETHING TO LET IN, so
    // unlike the hardware above they cannot be spread over ordinary connectors — there is no
    // daylight behind a wall between two studies. In `blind` they are therefore gated on
    // `!panel.blocksSight()`: nothing while the connector is closed, and then the whole thing
    // at the BEAM stage, which is `procedural-map.md` §2's payoff beat. In `marked` they keep
    // the shipped ramp, which is what made the live exit findable from across the room.
    const light = new THREE.Group();
    light.name = `exterior.light.${e.site.id}`;
    light.visible = false;
    e.panel.root.add(light);

    // The daylight that gets through, landing on the floor inside. One additive quad; there
    // is no light and there can never be one, so this IS the bounce.
    const spill = glowPatch({ color: 0xa8c8f0, strength: 0.0, pow: 1.9, size: Math.max(w * 2.6, 4.2) });
    spill.rotation.x = -Math.PI / 2;
    // in panel space: down to the floor and a little way into the room
    spill.position.set(0, -(e.panel.root.position.y ?? 1.34) + 0.02, inSign * Math.max(w * 0.75, 1.4));
    spill.name = 'exterior.spill';
    light.add(spill);

    // THE DRAUGHT. `escape.md` §6's own example — "a draught moving dust" — and the cheapest
    // honest one: a box of motes in the seam light, drifting. Reuses `light.shaft`'s dust,
    // which is part of the highest-scoring piece on the board.
    const draught = dustMotes({
      count: Math.max(24, Math.round(90 * (o.dustQuality ?? 1))),
      extent: new THREE.Vector3(w * 0.55, h * 0.45, 0.55),
      centre: new THREE.Vector3(0, 0, inSign * 0.55),
      rng, size: 26, drift: 0.55, color: 0xc9dcf4, intensity: 0.55,
    });
    draught.name = 'exterior.draught';
    light.add(draught);

    sites.set(e.site.id, {
      exit: e, spec, group: g, yardGroup, light, spill, draught,
      solids: yard.solids, tris: yard.tris, live: false, exposed: false,
      // `damaged`/`startStage` — see the ⚠️ note in `update()`. Reset every run by `setPlan()`.
      damaged: false, startStage: 0,
    });
  }

  // ---- the run plan ------------------------------------------------------
  let liveId = null;
  let _lock = 'boarded';
  let _seed = 0;
  let _conn = null;
  let _on = true;
  /** 🚪 the chained-and-boarded rule. `setDressRule(false)` is the in-place A/B arm, nothing else. */
  let _rule = true;
  /** 🧱 mortar on the DIG BAND — off, see `_segMortarUrl`. `?segmortar=1` / `setSegmentMortar()`. */
  let _segMortar = _segMortarUrl();
  /**
   * ⛓️ **THE CHAIN-DROP ARM AND THE ONE PIECE OF STATE IT NEEDS.** `?chaindrop=0` restores the old
   * gate; `setChainDrop()` is the in-place handle, for the same reason `setDressRule` is one.
   *
   * `_started` is (panel id -> the stage and health this panel began THIS RUN at), written by
   * `setPlan()` — the same place and the same reasoning as `s.startStage` for the sites, which is
   * already the only honest line between "this run" and "last run" in this file. It is needed
   * because a lock starts a live exit at stage 3, so `p.pristine` (stage 0 at full health) is
   * false there from frame one and would drop that door's chain before anybody touched it.
   */
  let _chainDrop = typeof location === 'undefined'
    ? true
    : new URLSearchParams(location.search).get('chaindrop') !== '0';
  const _started = new Map();
  /** Has this panel departed the (stage, health) it began the run at? Its own state, not a copy. */
  function _departed(p) {
    const s = _started.get(p.id);
    if (!s) return false;
    return p.state.stage !== s.stage || p.state.stageHealth < s.health;
  }
  const _b = new THREE.Box3();
  const _p = new THREE.Vector3();

  /**
   * The dressing, re-derived from (`_seed`, `tells`, `_conn`) alone.
   *
   * ⚠️ SPLIT OUT OF `setPlan` SO THE A/B CAN BE A **PAIRED IN-PLACE FLIP IN ONE PAGE**, which is
   * the only draw-call comparison this project accepts: `still.mjs` cannot pin how much sim time
   * had elapsed across two processes, and the same build gave 0 of 15 identical parked frames
   * over two page loads. `setDressRule()` calls this and nothing else — no yard, no collider, no
   * `s.damaged` reset — so the ONLY thing that differs between the arms is the hardware.
   */
  function deriveDressing() {
    // ⚠️ THE DRESSING IS DERIVED HERE AND ONLY HERE, AND IN `blind` IT NEVER READS THE STATE.
    // `connectorDressing` takes the state argument for `marked` only; passing it in both cases
    // keeps ONE call site, so a future edit cannot make `blind` state-dependent by accident
    // without deleting the argument that proves it is not.
    dressPlan = new Map();
    for (let i = 0; i < panels.length; i++) {
      const p = panels[i];
      const state = _conn?.get(p.id)?.state
        ?? (p.id === liveId ? CONNECTOR.EXIT : (sites.has(p.id) ? CONNECTOR.CHAINED : CONNECTOR.BREACHABLE));
      // `sites` is keyed by the 14 exit-candidate ids (`spec.b === 'outside'`, see `spaces.js`)
      // and never changes with the run — a physical fact about the connector, not a per-run
      // state — so it is exactly the `outside` `connectorDressing` needs to keep the daylight
      // seam off the 8 interior breachable panels.
      let d = connectorDressing(p.id, _seed, tells, state, sites.has(p.id));
      // `marked` put boards or mortar on the live exit according to the LOCK; `blind` draws
      // them from the same seeded distribution as everything else, so a boarded-up bay is a
      // boarded-up bay wherever it is.
      if (tells === 'marked') {
        d.boards = state === CONNECTOR.EXIT && _lock === 'boarded';
        d.mortar = state === CONNECTOR.EXIT && _lock === 'plaster';
      }
      // 🚪 **EVERY CLOSED DOOR IS CHAINED AND BOARDED** — see `dressingRule`. `blind` only, so
      // `marked` keeps `exterior-owner-2`'s measured +20.3 luma arm and `off` keeps the control;
      // and CONNECTORS only, because a dig band is not a door and its 36 members must go on
      // drawing from one distribution or the interconnect becomes findable by eye.
      const ruled = _rule && tells === 'blind' && dressFamily(p) === CONN_FAMILY;
      if (ruled) d = dressingRule(d, p.id, _seed);
      // 🧱 **AND THE MORTAR PATCH COMES OFF THE DIG BAND** — see the block above `_segMortarUrl`.
      // Applied to the SEGMENT family in every `tells` mode, because the reason is physical (there
      // is no bricked-up aperture behind a dig face, and the slab covers 81% of the room's own
      // coat) rather than a property of the blind/marked distinction. `marked` only ever puts
      // mortar on the live EXIT, which is a connector, so this cannot reach that arm.
      if (!_segMortar && dressFamily(p) === SEG_FAMILY && d.mortar) d = { ...d, mortar: false };
      // The per-door timber, uploaded once per plan rather than per frame. Written on BOTH arms
      // — a flip back to the raw coin toss has to restore 1.0, or the control arm carries this
      // arm's tint and the A/B is measuring two things.
      const g = dress.groups.get(dress.famOf[i]);
      const ic = g?.im.boards.instanceColor;
      if (ic) {
        const t = ruled ? (TIMBER[d.variant] ?? TIMBER[0]) : TIMBER[0];
        ic.setXYZ(i, t[0], t[1], t[2]);
        ic.needsUpdate = true;
      }
      dressPlan.set(p.id, d);
    }
  }

  /**
   * @param {object} plan
   * @param {string} plan.liveId
   * @param {string} plan.lock
   * @param {string|number} [plan.seed]        the RUN seed — the dressing is derived from it
   * @param {Map} [plan.connectors]            id -> resolved connector, from `connectors.js`
   */
  function setPlan(plan = {}) {
    liveId = plan.liveId ?? null;
    _lock = plan.lock ?? 'boarded';
    if (plan.seed != null) _seed = plan.seed;
    if (plan.connectors) _conn = plan.connectors;

    deriveDressing();

    // ⛓️ RESET EVERY RUN, EVERY CONNECTOR — the same decision as `s.damaged` below, for the same
    // reason: `setPlan()` is where "this run" begins, and a chain that stayed off because the
    // last round's player broke that door would be this round's answer handed over free.
    _started.clear();
    for (const p of panels) _started.set(p.id, { stage: p.state.stage, health: p.state.stageHealth });

    solids.length = 0;
    for (const [id, s] of sites) {
      s.live = id === liveId;
      // ⚠️ RESET EVERY RUN, EVERY SITE. `update()` will not expose a yard until its panel has
      // taken damage THIS run — see the note there — and the only honest place to draw the line
      // between "this run" and "last run" is here, where the plan itself is (re)applied.
      s.damaged = false;
      s.startStage = s.exit.panel.state.stage;
      if (!s.live) { s.light.visible = false; s.yardGroup.visible = false; s.exposed = false; continue; }
      // ONLY THE LIVE YARD REGISTERS COLLIDERS. The footprints overlap in world space (see
      // YARDS), so registering all fourteen would put an invisible garden wall across the court
      // the player actually escapes into.
      s.group.updateMatrixWorld(true);
      for (const b of s.solids) {
        _b.makeEmpty();
        for (const cx of [b.x0, b.x1]) {
          for (const cz of [b.z0, b.z1]) {
            _b.expandByPoint(_p.set(cx, 0, cz).applyMatrix4(s.group.matrixWorld));
          }
        }
        _b.min.y = -0.2; _b.max.y = b.h;
        solids.push(_b.clone());
      }
    }
    room.setExteriorSolids?.(solids);
  }

  // ---- residency ---------------------------------------------------------
  //
  // ⚠️ THE EXTERIOR IS RESIDENT ONLY WHILE AN EXIT ACTUALLY EXPOSES IT. This is the design,
  // not an optimisation: the worst parked station pays 614 draw calls against a 625 budget, and
  // a garden that draws from inside every room in the house would be a whole outdoors on the
  // bill in six rooms that cannot see it.
  //
  // Three conditions, and all three are needed:
  //   · the panel does not block sight — true at the BEAM stage and at OPEN, false below.
  //   · IT HAS TAKEN DAMAGE THIS RUN (`s.damaged`). A `beams` lock STARTS at stage 3, where
  //     `blocksSight` is already false — so `!faced` alone was true from the first frame, before
  //     the player had done anything: the yard, the tell and the answer were all free. This is
  //     NOT a `run.js` LOCKS change (an earlier claim that fixing it would invalidate the
  //     measured siege table was wrong): the wall's health and every stage timing are untouched,
  //     only WHEN THE YARD IS ALLOWED TO SHOW is. `s.damaged` is set the first time this run's
  //     panel departs its starting (stage, stageHealth) — one nail-gun round is enough — and it
  //     never resets except at the next `setPlan()`.
  //   · somebody can see it — the owning space is resident, or a viewpoint is outside and
  //     near this site, which is the escaped player standing in their own yard.
  const _m = new THREE.Matrix4();
  function update(dt, t, viewpoints) {
    // ---- 1. the hardware on every closed connector ------------------------
    //
    // ⚠️ ONE RULE, AND IT IS THE PHYSICAL ONE: anything fixed to the wall's face is gone when
    // the face is. `blocksSight()` is false from the beam stage on, which is exactly the stage
    // at which there is no face left to nail a board to. Until this rule existed, `setPlan`
    // turned the lock's dressing on and NOTHING EVER TURNED IT OFF — the `plaster` lock's
    // mortar patch, a solid slab across 92% x 88% of the aperture, was still standing in the
    // opened hole, and it was the whole of the "the way out is a dark rectangle" complaint.
    // Measured by hiding every visible mesh in the scene one at a time and reading
    // `pipeline.sceneRT` at the aperture centre: that one slab was the difference between HDR
    // 0.20/0.14/0.09 (the grade's `hazeColor`, which reads brown) and the yard's 0.71/0.64/0.56.
    //
    // ⚠️ AND IT RUNS FOR EVERY CONNECTOR, WHICH IS NOT DEAD CODE. `escape.md` §8's detonation
    // drives every panel in the house to `open`, and a padlock hanging in mid-air across a hole
    // the bomb made is the same defect arriving on the one frame nobody can re-shoot.
    const dirty = new Map();
    let seamDirty = false;
    const liveIn = new Map();
    for (const fam of dress.families) liveIn.set(fam, { chain: 0, seam: 0, boards: 0, mortar: 0 });
    for (let i = 0; i < panels.length; i++) {
      const p = panels[i];
      const d = dressPlan.get(p.id);
      const fam = dress.famOf[i];
      const g = dress.groups.get(fam);
      const live = liveIn.get(fam);
      // `p.root.visible` is set by `room.setViewpoints`, which `views/game.js` calls BEFORE
      // this — so residency is exact and a chain never hangs in an unbuilt room.
      /**
       * ⛓️ **THE CHAIN COMES OFF A DOOR THAT HAS ACTUALLY YIELDED — `genexit-1`, 2026-08-15,
       * approved by John as a look change.**
       *
       * `faced` alone keeps the hardware on until `blocksSight()` goes false, which is the BEAM
       * stage. Measured on a `boarded` live exit in a generated house
       * (`harness/scenarios/_genexit1-tell.mjs`): 8 landed sledge blows per stage, so the padlock
       * hangs on a door you are successfully breaking for **~22 of the ~29 blows it takes to
       * open**. Photographed at stage 2 after 16 blows — boards visibly chewed, rubble on the
       * floor, **chain X still intact across it**
       * (`progress/playtest/game.play.genexit1-LIVE-0-vs-16-blows.png`). A padlock is the game's
       * one statement that force does not work here; leaving it on the one door where force IS
       * working is the cue lying to the player, and it is exactly what John read as
       * *"3 chained doors … none seemed to take damage."*
       *
       * 🚫 **AND IT DOES NOT MAKE A CLOSED DOOR IDENTIFIABLE — `procedural-map.md` §2 STANDS.**
       * The gate is DAMAGE TAKEN THIS RUN, never state: an untouched exit, an untouched decoy and
       * an untouched breachable are byte-identical, which is the property the whole design rests
       * on. It is a post-commit reveal in the same class as `CHAINED FROM THE OUTSIDE` — you learn
       * it by swinging. And it is self-consistent by construction: a CHAINED connector is
       * `damageable: false`, so it can never depart its start state and its chain can never come
       * off, however long you beat on it. Measured: 16/16 blows refused, health byte-identical.
       *
       * ⚠️ **THE CHAIN ONLY. BOARDS, SEAM AND MORTAR ARE UNTOUCHED.** Timber nailed across a door
       * is material, and how material comes apart is the wall's job (`wall.js`'s progress term,
       * landed in the same slice). The chain is HARDWARE and it is a CLAIM. `?chaindrop=0`
       * restores the old gate for an in-place A/B; `census().chainDrop` reports the arm.
       *
       * ⚠️ **AND CONNECTORS ONLY — A DIG BAND IS NOT A DOOR.** `room.chainedDoorsOf` draws that
       * line in those words and `dressingRule` is already connector-only for it. The 36 segments
       * keep `connectorDressing`'s untouched distribution, which is the property `views/game.js`
       * protects: no segment may be distinguishable from its 35 neighbours, or the interconnect
       * becomes findable by eye. Without this clause the first blow of any dig would strip that
       * face's chain and mark where somebody had been working.
       */
      const worked = _chainDrop && fam === CONN_FAMILY && _started.has(p.id) && _departed(p);
      const faced = p.blocksSight() && p.root.visible && _on;
      const stage = p.state.stage;
      // 🚪 🚨 **THE DAYLIGHT SEAM IS THE ONLY THING IN THIS HOUSE THAT CAN APPEAR ON A PERIMETER
      // DOOR AND NEVER ON AN INTERIOR ONE, AND IT WAS BEING DRAWN ON CLOSED DOORS.**
      // `connectorDressing` gates `seam` on `spec.b === 'outside'` (correctly — daylight does not
      // leak through a partition between two dark rooms), so its population is 14 exterior sites
      // and **0 of the 4 interior panels, on every seed** (`_tmp_seam_correlation`, 0/4096). A
      // glowing hairline that only ever appears on an outside wall is a compass, and a compass is
      // the exact thing John's chained doors exist to deny: *"players don't get a sense of
      // direction from the lack of doors on the outside walls."*
      //
      // ⚠️ THIS IS NOT A NEW POLICY, IT IS THE ONE `connectors.js` ALREADY STATES AND THIS FILE
      // WAS NOT IMPLEMENTING: *"in `blind` the seam, the draught and the floor spill do not fire
      // at all while the panel still blocks sight. They arrive at the BEAM stage."* The draught
      // and the spill were gated on `!faced` below; the seam was gated on `stage <= 3`, which is
      // TRUE at stage 0. So the reveal beat was correct for two cues out of three and the third
      // was giving its answer away from the first frame. `marked` is untouched, so
      // `exterior-look.mjs`'s +20.3 luma A/B still runs and nothing measured is deleted.
      const seamOK = tells === 'marked' ? stage <= 3 : (stage <= 3 && !p.blocksSight());
      for (const k of DRESS_KINDS) {
        // ⛓️ `worked` reaches the CHAIN and nothing else — see its note above.
        const want = !!d?.[k] && (k === 'seam' ? (seamOK && p.root.visible && _on)
          : k === 'chain' ? (faced && !worked) : faced);
        if (want) live[k]++;
        const cur = dress.shown[k][i];
        if (want === cur) continue;
        dress.shown[k][i] = want;
        g.im[k].setMatrixAt(i, want ? dressM[i] : dress.HIDE);
        dirty.set(`${fam}|${k}`, true);
      }
      if (d?.seam && dress.shown.seam[i]) {
        // the seam fades as the wall comes apart: at beam there is a hole to look through and
        // a glowing outline of a hole is a decal, not light
        const k = stage <= 2 ? 1 : 0.35;
        if (dress.seamK[i] !== k) {
          dress.seamK[i] = k;
          g.im.seam.setColorAt(i, _col.setScalar(k));
          seamDirty = true;
        }
      }
    }
    for (const [fam, g] of dress.groups) {
      const live = liveIn.get(fam);
      for (const k of DRESS_KINDS) {
        if (dirty.get(`${fam}|${k}`)) g.im[k].instanceMatrix.needsUpdate = true;
        // ⚠️ A GROUP WITH NOTHING LIVE COSTS NOTHING — `wallinstances.js`'s rule, and the only
        // reason the second family is "up to 4 calls where a segment is dressed and on screen"
        // rather than "4 calls, always, everywhere". An `InstancedMesh` whose instances are all
        // zero-scale still SUBMITS a draw; only `visible = false` stops it.
        g.im[k].visible = live[k] > 0;
        if (seamDirty && k === 'seam' && g.im.seam.instanceColor) g.im.seam.instanceColor.needsUpdate = true;
      }
    }

    // ---- 2. the daylight, and the yard behind it --------------------------
    let visible = 0;
    for (const [, s] of sites) {
      if (!s.live) continue;
      const panel = s.exit.panel;
      const faced = panel.blocksSight();
      const home = room.spaces.find((sp) => sp.id === s.exit.site.a);
      const stage = panel.state.stage;

      // ⚠️ DAMAGE TAKEN THIS RUN — see the header note above this function. Sticky: once true
      // it stays true until the next `setPlan()`. A stage advance always qualifies; so does any
      // partial chew within the starting stage, which is what a `beams` lock needs (it never
      // advances past stage 3 before the panel opens).
      if (!s.damaged) {
        const full = panel.state.defs[stage]?.health ?? 0;
        if (stage !== s.startStage || panel.state.stageHealth < full) s.damaged = true;
      }

      // ⚠️ THE GATE THAT MAKES STEP 2 TRUE. In `marked` the spill and the draught ramp from
      // stage 0, which is what a player reads from across the room and what made the answer
      // free. In `blind` they do not exist until the wall stops blocking sight AND has taken
      // damage this run — so the information arrives at the beam stage, bought with 15-25 s of
      // the loudest noise in the game, which is exactly the trade `procedural-map.md` §2
      // describes, and never for free on an untouched `beams` panel.
      const lit = tells === 'marked' ? !!home?.visible
        : tells === 'off' ? false
          : (!faced && s.damaged && !!home?.visible);
      s.light.visible = lit && _on;
      if (lit) {
        const spillK = tells === 'marked'
          ? (stage <= 1 ? 0.06 : stage === 2 ? 0.12 : stage === 3 ? 0.45 : 0.85)
          : (stage === 3 ? 0.45 : 0.85);
        s.spill.material.uniforms.uStrength.value = spillK;
        s.draught.userData.setTime?.(t);
      }

      // ⚠️ SAME GATE, AND IT APPLIES IN EVERY TELLS MODE — this is not a concealment cue, it is
      // whether the yard is physically visible through the hole, so it cannot be mode-dependent
      // the way `lit` is.
      const exposed = !faced && s.damaged;
      let seen = !!home?.visible;
      if (!seen && viewpoints) {
        for (const vp of viewpoints) {
          if (room.spaceAt(vp.pos, 0)) continue;                   // inside a room: not us
          s.group.worldToLocal(_p.copy(vp.pos));
          if (_p.z > -1.0 && _p.z < s.spec.depth + 12) { seen = true; break; }
        }
      }
      s.exposed = exposed && seen;
      s.yardGroup.visible = s.exposed && _on;
      if (s.exposed) visible++;
    }
    // Stated as an invariant rather than trusted: YARDS' footprints overlap, and the whole
    // reason that is safe is that only one site can ever be open.
    if (visible > 1 && !update._warned) {
      update._warned = true;
      console.warn('[exterior] more than one yard resident — the footprints overlap');
    }
  }

  /**
   * Everything visible, for `views/game.js`'s compile warm-up. A yard whose materials were
   * never drawn compiles its programs on the frame the wall finally opens — which is the one
   * frame in the run where a stall is unforgivable. Same trap `precompileStages` exists for.
   *
   * ⚠️ THE INSTANCED DRESSING NEEDS ITS OWN WARM-UP AND IT IS NOT COVERED BY A GROUP TOGGLE:
   * an `InstancedMesh` whose instances are all zero-scale still submits a draw, but the driver
   * may skip the whole thing, so the programs are forced by giving instance 0 a real matrix
   * for the warm-up frames and taking it back afterwards. `update()` re-derives every instance
   * from the panels on the next frame, so nothing has to be restored by hand.
   */
  function warmup(on) {
    for (const [, s] of sites) {
      s.yardGroup.visible = on;
      s.light.visible = on;
    }
    // ⚠️ EVERY FAMILY, AND THE SLOT HAS TO BE ONE OF THAT FAMILY'S OWN MEMBERS. Warming slot 0
    // of the segment family with a connector's matrix would compile the programs (which is all
    // this is for) but would also leave a 2.08 m chain on a 1.14 m bay for the warm-up frames,
    // which is exactly the picture the capture harness sometimes photographs.
    for (const [fam, g] of dress.groups) {
      const slot = dress.famOf.indexOf(fam);
      if (slot < 0) continue;
      for (const k of DRESS_KINDS) {
        g.im[k].setMatrixAt(slot, on ? dressM[slot] : dress.HIDE);
        g.im[k].visible = !!on;
        dress.shown[k][slot] = !!on;
        g.im[k].instanceMatrix.needsUpdate = true;
      }
    }
  }

  /**
   * The whole module on or off for ONE frame — the A/B any look verdict on this piece needs.
   *
   * ⚠️ `root.visible = false` IS NOT THE ABLATION and quietly measures the wrong thing. The
   * yards hang off `root`, but the daylight cues are parented to the PANEL so they move and
   * hide with it — so a probe that toggles `root` leaves this module's own geometry sitting in
   * the aperture and reports "the exterior changes nothing". That is exactly how the mortar
   * patch went three A/B pairs without being noticed. (The dressing IS under `root` now that it
   * is instanced, but `_on` is honoured in `update()` as well, so both routes agree.)
   */
  function setVisible(on) {
    _on = !!on;
    root.visible = _on;
    for (const [, s] of sites) s.light.visible = _on && s.light.visible;
  }

  function census() {
    const rows = [];
    for (const [id, s] of sites) {
      rows.push({
        id, live: s.live, exposed: s.exposed, tris: s.tris,
        yardVisible: s.yardGroup.visible, tellVisible: s.light.visible,
      });
    }
    const dressed = {};
    for (const k of DRESS_KINDS) dressed[k] = dress.shown[k].filter(Boolean).length;
    // ⚠️ `dressCalls` IS WHAT IS ACTUALLY SUBMITTED THIS FRAME, NOT A CONSTANT. It used to be
    // `DRESS_KINDS.length` — right when there was one family that was always visible, and a lie
    // the moment a family can switch itself off. A census that reports a constant cannot be the
    // instrument a draw-call claim is made with.
    let dressCalls = 0;
    const perFamily = {};
    for (const [fam, g] of dress.groups) {
      const n = DRESS_KINDS.filter((k) => g.im[k].visible).length;
      perFamily[fam] = n;
      dressCalls += n;
    }
    return {
      enabled: true, tells, yards: rows, solids: solids.length,
      dressCalls, dressFamilies: dress.families, dressCallsBy: perFamily,
      dressMeshes: dress.families.length * DRESS_KINDS.length, dressedNow: dressed,
      dressRule: _rule ? DRESS_RULE : 'off',
      segMortar: _segMortar,
      /**
       * ⛓️ the chain-drop arm, and how many CONNECTORS have earned it this run.
       * ⚠️ **`chainDropped` IS NOT `dressedNow.chain`'s COMPLEMENT AND MUST NOT BE READ AS ONE.**
       * This counts doors that have taken damage; `dressedNow` counts what is on screen, which is
       * gated on RESIDENCY as well. A door in an unloaded room is in neither. An A/B on the draw
       * set has to be taken while standing in front of the door — see `_genexit1-tell.mjs` G4,
       * which measured 1-vs-1 from the wrong room before it was moved.
       */
      chainDrop: _chainDrop,
      chainDropped: panels.filter((p, i) => _chainDrop && dress.famOf[i] === CONN_FAMILY
        && _started.has(p.id) && _departed(p) && !!dressPlan.get(p.id)?.chain).length,
      /** 🚪 the fixed-door-size rule, and what each family actually authors its geometry at. */
      dressFixed: _fixedDress,
      dressAperture: Object.fromEntries([...dress.groups].map(([f, g]) => [f, [g.W, g.H]])),
      plan: [...dressPlan].map(([id, d]) => ({ id, ...d })),
    };
  }

  /** What hardware this connector is wearing this run. The probe surface `conn-1.mjs` reads. */
  function dressingOf(id) { return dressPlan.get(id) ?? null; }

  /**
   * 🚪 **THE CHAINED-AND-BOARDED RULE, ON OR OFF, IN PLACE.** The A/B arm and nothing else: it
   * re-derives the dressing from the same seed and the same plan, and `update()` picks the change
   * up on the next frame through the same `dress.shown` diff every other change goes through.
   *
   * ⚠️ IT DOES NOT TOUCH `s.damaged`, THE YARD, THE COLLIDERS OR THE RUN. `setPlan()` resets all
   * of those, so using `setPlan` as the flip would have made "the dressing costs N calls" a
   * measurement of a round reset. Returns the arm it is now on, so a probe can assert the flip
   * happened rather than assume it.
   */
  function setDressRule(on) { _rule = !!on; deriveDressing(); return _rule; }

  /**
   * 🧱 **MORTAR ON THE DIG BAND, ON OR OFF, IN PLACE** — the same shape as `setDressRule` and for
   * the same reason: an A/B that reloads the page is not comparable (`still.mjs` cannot pin how
   * much sim time had elapsed on arrival, and a walked draw-call total is not comparable either).
   * `true` restores the pre-fix build exactly, which is also what `?segmortar=1` does at boot.
   */
  function setSegmentMortar(on) { _segMortar = !!on; deriveDressing(); return _segMortar; }

  /**
   * 🚪 **A DOOR IS A STANDARD SIZE, ON OR OFF, IN PLACE** — the same shape as `setSegmentMortar`
   * and for the same reason. It re-derives `dressM` and rewrites the matrix of every instance
   * that is CURRENTLY SHOWN, so there is no hidden frame between the arms and the pair is
   * comparable on one held page. `false` is the defect reproduced — see the `dressfix-1` block
   * for why that is not the same thing as the pre-fix build byte-for-byte.
   */
  function setDressFixed(on) {
    _fixedDress = !!on;
    computeDressM();
    for (let i = 0; i < panels.length; i++) {
      const g = dress.groups.get(dress.famOf[i]);
      if (!g) continue;
      for (const k of DRESS_KINDS) {
        if (!dress.shown[k][i]) continue;
        g.im[k].setMatrixAt(i, dressM[i]);
        g.im[k].instanceMatrix.needsUpdate = true;
      }
    }
    return _fixedDress;
  }

  /**
   * ⛓️ **THE CHAIN-DROP ARM, FLIPPED IN PLACE.** Unlike the three above it needs no re-derivation:
   * `update()` recomputes `want` for every instance every frame off `_chainDrop`, so the next
   * frame carries the other arm and a held pair is exact. Nothing else in the dressing moves.
   */
  function setChainDrop(on) { _chainDrop = !!on; return _chainDrop; }

  return {
    enabled: true, root, solids, sites, tells,
    setPlan, update, warmup, setVisible, census, dressingOf, setDressRule, setSegmentMortar,
    setDressFixed, setChainDrop,
    get dressRule() { return _rule; },
    get segmentMortar() { return _segMortar; },
    get dressFixed() { return _fixedDress; },
    get chainDrop() { return _chainDrop; },
  };
}
