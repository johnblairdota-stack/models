import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * 🌙 WHAT IS OUTSIDE THE BALLROOM'S WINDOWS, AT NIGHT.
 *
 * John, playing `?view=party.follow`: *"there is depth outside the windows in the asset but
 * nothing going on outside in the primetime.bat."*
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 THE TWO FACTS THAT DECIDED THE SHAPE OF THIS FILE. BOTH WERE MEASURED, NOT ASSUMED.
 * ---------------------------------------------------------------------------------------------
 *
 * The obvious fix — "the game already has `src/game/exterior.js`, a whole walled yard per exit
 * site, just switch it on for the ballroom" — DOES NOT WORK HERE, for two independent reasons,
 * and both were checked in the running page rather than read off the source:
 *
 *  1. **`buildExterior` IS NEVER IMPORTED BY THE PARTY PATH.** `grep` for it in `src/` returns
 *     exactly one import, `src/views/game.js:19`, and `views/game.js` is not on the
 *     `?view=party.follow` chain at all (`views/party-follow.js` -> `game/follow-bed.js` ->
 *     `game/room.js` -> `world/ballroom-order.js`). There is no exterior instance in this view to
 *     enable, no `s.damaged` gate to relax and no yard resident-count to trip. The exterior's
 *     `x.ballroom.terrace_w` spec is real, but it is real in the OTHER view.
 *  2. **THE GLAZING IS OPAQUE, SO ANYTHING PUT BEHIND IT IS INVISIBLE.** The ballroom's window
 *     panes are `kit:clere`, and `clere` resolves to `mats.clearGlass` — a `MeshStandardMaterial`
 *     probed live as `transparent: false, opacity: 1, depthWrite: true, emissiveIntensity: 3.4`.
 *     That opaque emissive plane IS the "blank bright rectangle": it measures a flat ~L 220
 *     whatever is behind it, which is why the windows read as lit panels rather than as openings.
 *     A yard built behind it would have rendered and then been depth-rejected by the pane.
 *
 * So the fix is two halves and it needs both. This file is the backdrop; `game/room.js` swaps the
 * ballroom's `clere` for a dimmed, TRANSPARENT night glazing so the backdrop can be seen through
 * it. Either half alone is worth nothing — glass alone opens onto the `#05070b` void, backdrop
 * alone is hidden. `?ballnight=0` takes both away in one boot.
 *
 * ---------------------------------------------------------------------------------------------
 * ☁️ WHY A NIGHT EXTERIOR IS AFFORDABLE HERE, WHICH IS NOT THE ANSWER THE GRADE USUALLY GIVES
 * ---------------------------------------------------------------------------------------------
 * `lighting/ballroom-rig.js` records a HARD BLACK POINT: the composite does
 * `col = (col - 0.5) * uContrast + 0.5` before the toe, so a low enough value goes negative and
 * clamps to literal zero, and no light, hemisphere or ambient term recovers it. Solved through
 * the party grade's own numbers (`follow-bed.js:1014-1025` — exposure 1.85, contrast 1.05,
 * toeCrush 0.005) that floor sits at about **0.021 scene-linear**, and a naively authored dark
 * night sky lands under it. That is the trap this file was warned about.
 *
 * ⚠️ **THE HAZE IS THE WAY OUT, AND IT PULLS THE OPPOSITE WAY FROM THE CONTRAST.** The same
 * composite runs `col = mix(col, uHazeColor, 1 - exp(-linZ * uHazeAmount))` FIRST, with
 * `hazeColor [0.062, 0.055, 0.046]` and `hazeAmount 0.042`. That is a MIX, not a multiply, so it
 * does not darken a distant dark surface — it LIFTS it toward 0.062. At 22 m the mix is 0.60 and
 * at 46 m it is 0.855, so everything out here arrives with a floor of roughly 0.037-0.053 linear
 * before its own radiance is added: comfortably clear of the 0.021 black point by construction.
 *
 * The cost of that gift is that haze also COMPRESSES: at the sky's 46 m only 14.5% of an authored
 * difference survives. So this palette is authored with a WIDE spread and a small absolute range,
 * which is the opposite of how the daylight yard in `exterior.js` is authored (that one has to
 * divide back through the haze to survive at all). Do not copy numbers between the two files.
 *
 * ⚠️ **AND DEPTH IS A GRADIENT — ONE FLAT TONE CAN NEVER READ AS DEPTH.** That is
 * `room-ballroom.js`'s vestibule post-mortem, which spent two rounds discovering it: a plane
 * forced to PURE WHITE still read as a flat card, and the thing that finally worked was a stepped
 * value ramp. Every surface below is therefore either subdivided and painted with a real ramp
 * (the sky, the ground) or placed at a distinct depth so the haze ramps it (the gravel walk at
 * 2 m, the balustrade at 4 m, the hedge at 9 m, the treeline at 24-34 m, the lit wing at 32 m,
 * the sky at 46 m). Six depths, six values, which is what makes it read as outside rather than
 * as a painted blind.
 *
 * ---------------------------------------------------------------------------------------------
 * 📏 WHAT IT ACTUALLY MEASURES (900x600, seed 1, `?view=party.follow&still=1`, matched campose,
 *    the two `?ballnight` arms shot in the same session)
 * ---------------------------------------------------------------------------------------------
 * "Through the glass" below is not a hand-placed crop: it is every pixel where the two ARMS
 * differ by more than 40 L. The gilt glazing bars are the same object on both arms and barely
 * move, so the mask separates pane from bar out of the control pair itself.
 *
 *   station, 19 m back  ·  ON  min 4.1   p10 15.2  med 30.4  p90 71.3   max 206.6   spread 56.1
 *                          OFF min 52.7  p10 143.1 med 194.8 p90 226.1  max 249.0   spread 83.0
 *   4.2 m off the glass ·  ON  min 3.8   p10 31.3  med 60.2  p90 112.4  max 197.8   spread 81.0
 *                          OFF min 60.8  p10 182.6 med 222.7 p90 247.6  max 254.6   spread 65.0
 *
 * ⚠️ **READ THE `OFF` ROW BEFORE CHANGING ANYTHING HERE.** A median of 222 with a p10 of 182 is
 * not a window, it is a lamp: the old pane was brighter than every wall in the room and carried
 * no structure a viewer could read as distance. The `ON` row is dimmer ON PURPOSE — a night
 * window seen from a candlelit room IS darker than the room — and what makes it an opening is
 * the SPREAD and the fact that **zero of its pixels sit at literal black** (0.00% under L 1, on
 * both stations). Judge a change here on the spread and the floor, not on the median.
 *
 * ---------------------------------------------------------------------------------------------
 * THE BUDGET — MEASURED, NOT ASSERTED
 * ---------------------------------------------------------------------------------------------
 * ONE `MeshBasicMaterial` with per-vertex colour, everything merged into ONE mesh, no lights and
 * no GLSL — the same construction `exterior.js` uses and for the same reason.
 *
 * 🚨 **ONE MESH IS NOT ONE DRAW CALL, AND THE MEASUREMENT SAYS SO: +3.** At the ballroom window
 * station `renderer.info.render.calls` reads **145 with it and 142 without** (+15,512 triangles).
 * The extra two are the post pipeline drawing the scene again for its depth/AO pass — a cost any
 * geometry added to this view pays, and one that "it is a single merged mesh" does not avoid.
 * Stated as the measured number rather than the intended one, because the intended one was 1.
 *
 * ⚠️ The 614-of-625 draw-call ceiling quoted in `game/exterior.js` is **`views/game.js`'s** budget
 * and does not apply here: this view measures 145 calls at the same kind of station. Do not carry
 * that ceiling across — check this view's own number.
 *
 * ⚠️ **AND IT IS FREE FROM EVERY OTHER ROOM, WHICH WAS ALSO MEASURED.** Parked in the gallery
 * with the ballroom not resident, both arms read **106 calls and 249,422 triangles — a delta of
 * exactly zero.** That is `room.js`'s own residency toggle (`s.root.visible = s.visible`) doing
 * the work, which is the whole reason the mesh is parented to the SPACE rather than to the scene:
 * no new per-frame code, and nothing to get wrong.
 *
 * It registers NO colliders — it is scenery on the far side of a wall that already has its own
 * (the per-window glazing boxes in `ballroomOrderFor`'s `solids`).
 *
 * `frustumCulled` is left ON (unlike the exterior's yards, which switch it off because they are
 * placed in a panel's frame). This mesh is built in world coordinates under an identity root
 * (`sp.root` was probed at [0,0,0]), so its bounding box is correct and a camera facing the
 * mirror wall pays nothing for it.
 *
 * ---------------------------------------------------------------------------------------------
 * ⚠️ KNOWN AND DELIBERATELY NOT SOLVED
 * ---------------------------------------------------------------------------------------------
 * If a runner ever smashes through the ballroom's OWN window wall, they walk out into a backdrop
 * with no ground collider under it. That is not a regression — this view has no exterior module
 * at all, so before this file the same hole opened onto `scene.background` — but it is now a
 * hole that LOOKS walkable. Giving the terrace a floor is a `spaces.js`/collider change, not a
 * scenery one, and it was out of scope here.
 */

// ---------------------------------------------------------------------------
// The night palette. Linear radiance AT THE EYE, before the grade's haze lifts it.
// ---------------------------------------------------------------------------

/** Sky at the horizon — the last of the dusk, and the warmest thing up there. */
const SKY_HORIZON = [1.240, 1.310, 1.560];
/** Sky at the zenith — deep, and the top of the window is full of it. */
const SKY_ZENITH = [0.310, 0.400, 0.700];
/** The moon's disc, and the glow around it. The one specular-bright note outside. */
const MOON = [0.900, 0.910, 0.880];
const MOON_GLOW = [0.780, 0.840, 0.960];
/** Grass under a moon: almost no colour, and it is the ground's FALLOFF that carries the depth. */
const A_LAWN_NEAR = [0.290, 0.302, 0.274];
const A_LAWN_FAR = [0.205, 0.226, 0.262];
/** Cut stone, catching what spills out of the windows. The brightest built thing outside. */
const A_STONE = [0.530, 0.516, 0.472];
/** Clipped yew. The darkest mass in the near field. */
const A_HEDGE = [0.180, 0.218, 0.180];
/** The treeline. Darker than the sky it is drawn against, which is the whole job. */
const A_TREE = [0.152, 0.192, 0.181];
const A_TRUNK = [0.178, 0.167, 0.154];
/** A far wing of the house, and the warm squares in it. */
const A_WING = [0.205, 0.195, 0.205];
const A_LIT_WINDOW = [0.560, 0.420, 0.210];

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix3 = (a, b, t) => a + (b - a) * t;

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

/**
 * Boxes and quads with per-vertex colour, merged into one geometry.
 *
 * ⚠️ NOT `kit.js`'s `GeoBin`, and the reason is worth stating so nobody "simplifies" it back:
 * `GeoBin.add()` strips every attribute that is not position, normal or uv, which is exactly the
 * colour attribute this whole approach depends on. `exterior.js` carries its own `Paint` class
 * for the same reason; this is the compact night-only relative of it, kept local so the party
 * bundle does not pull in 2,400 lines of daylight yard for four quads and a treeline.
 */
class Paint {
  constructor() { this.parts = []; this.tris = 0; }

  /** @param shade (out3, nx, ny, nz, x, y, z) -> void, writing LINEAR values */
  _push(g, shade) {
    // `mergeGeometries` returns NULL rather than throwing on a mix of indexed and non-indexed
    // inputs, so an unindexed primitive would silently turn the whole backdrop into no mesh at
    // all. Everything used here is indexed, but a 1:1 index is cheap insurance if that changes.
    if (!g.index) {
      const n = g.attributes.position.count;
      const arr = n > 65535 ? new Uint32Array(n) : new Uint16Array(n);
      for (let i = 0; i < n; i++) arr[i] = i;
      g.setIndex(new THREE.BufferAttribute(arr, 1));
    }
    const pos = g.attributes.position, nrm = g.attributes.normal;
    const col = new Float32Array(pos.count * 3);
    const tmp = [0, 0, 0];
    for (let i = 0; i < pos.count; i++) {
      shade(tmp, nrm.getX(i), nrm.getY(i), nrm.getZ(i), pos.getX(i), pos.getY(i), pos.getZ(i));
      col[i * 3] = tmp[0]; col[i * 3 + 1] = tmp[1]; col[i * 3 + 2] = tmp[2];
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
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

  /** A horizontal quad at height `y`. `down` faces it at the ground, for a sky ceiling. */
  ground(x0, x1, z0, z1, y, shade, sx = 1, sz = sx, down = false) {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, sx, sz);
    g.rotateX(down ? Math.PI / 2 : -Math.PI / 2);
    g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
    this._push(g, shade);
    return this;
  }

  /**
   * A vertical quad in the z/y plane at a given x, facing back toward the house (+X).
   * The ballroom's window wall is the space's `xmin` face, so +X is "inward" for everything here.
   */
  wallZ(z0, z1, y0, y1, x, shade, sz = 8, sy = 8) {
    const g = new THREE.PlaneGeometry(z1 - z0, y1 - y0, sz, sy);
    g.rotateY(Math.PI / 2);
    g.translate(x, (y0 + y1) / 2, (z0 + z1) / 2);
    this._push(g, shade);
    return this;
  }

  /** A vertical quad in the x/y plane at a given z, facing `dir` (+1 = toward +Z). */
  wallX(x0, x1, y0, y1, z, dir, shade, sx = 8, sy = 8) {
    const g = new THREE.PlaneGeometry(x1 - x0, y1 - y0, sx, sy);
    if (dir < 0) g.rotateY(Math.PI);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, z);
    this._push(g, shade);
    return this;
  }

  build(mat, name) {
    const g = this.parts.length === 1 ? this.parts[0] : mergeGeometries(this.parts, false);
    if (!g) throw new Error('ballroom-night: mergeGeometries refused the set');
    g.computeBoundingBox();
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat);
    m.name = name;
    m.castShadow = false;
    m.receiveShadow = false;
    // Not `matrixAutoUpdate = false`: the space root may be moved by the generator, and a
    // backdrop that stops following its own room is a worse bug than one matrix update a frame.
    return m;
  }
}

/**
 * Build the night backdrop for one ballroom space.
 *
 * @param sp   the space — `x0/x1/z0/z1` in WORLD metres. The window wall is the `x0` face and
 *             everything here is built outward from it, at -X.
 * @param o.seed  so two ballrooms in one house do not get the same treeline. Optional.
 * @returns { mesh, tris } — add `mesh` to `sp.root`. No colliders, by design.
 */
export function buildBallroomNight(sp, o = {}) {
  const rnd = (() => {
    let s = ((o.seed ?? 1) * 9301 + 49297) % 233280;
    return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  })();

  const X0 = sp.x0;                    // the window wall, in world x
  const OUT = (d) => X0 - d;           // d metres outside it
  const Z0 = sp.z0 - 26, Z1 = sp.z1 + 26;   // wide enough that an oblique look through a
  const CZ = (sp.z0 + sp.z1) / 2;           // window never finds the edge of the world

  const SKY_D = 46;                    // the backdrop wall
  const P = new Paint();

  // ---- 1 · THE SKY -------------------------------------------------------
  //
  // The gradient is the single most load-bearing thing in this file. Through a window whose head
  // is at 5.40 m, most of what a standing camera sees is sky, and a sky painted one tone is a
  // blind, not a night. `k` is the vertical ramp; the moon adds a second, radial one so the
  // gradient is not merely a vertical wipe (which reads as a gradient, i.e. as a graphic).
  const MOON_Z = CZ - 17, MOON_Y = 19.5;
  const skyShade = (out, nx, ny, nz, x, y, z) => {
    const k = smoothstep(-4, 34, y);
    // a little cloud, thicker low down where the dusk still lights it from underneath
    const n = fbm(z * 0.030 + 5.1, y * 0.048 + 2.3, 3);
    const band = smoothstep(0.02, 0.30, k) * (1 - 0.70 * smoothstep(0.45, 1.0, k));
    const cover = smoothstep(0.505, 0.610, n) * band;
    const dm = Math.hypot(z - MOON_Z, (y - MOON_Y) * 1.15);
    const glow = Math.pow(1 - smoothstep(0, 20, dm), 2.2);
    const disc = 1 - smoothstep(0.85, 1.35, dm);
    for (let c = 0; c < 3; c++) {
      let v = mix3(SKY_HORIZON[c], SKY_ZENITH[c], k);
      v = mix3(v, SKY_HORIZON[c] * 1.22, cover);     // cloud, lit from below by the dusk
      v += MOON_GLOW[c] * glow * 0.55;
      v = mix3(v, MOON[c], disc);
      out[c] = v;
    }
  };
  // the backdrop, and two wings so a look along the wall does not run off the end of it
  P.wallZ(Z0, Z1, -8, 40, OUT(SKY_D), skyShade, 30, 26);
  P.wallX(OUT(SKY_D), OUT(10), -8, 40, Z0, +1, skyShade, 14, 20);
  P.wallX(OUT(SKY_D), OUT(10), -8, 40, Z1, -1, skyShade, 14, 20);
  // and a lid, so an upward look through the window head finds sky rather than the void
  P.ground(OUT(SKY_D), OUT(2), Z0, Z1, 40, (out, nx, ny, nz, x, y, z) => {
    skyShade(out, nx, ny, nz, x, 40, z);
  }, 12, 18, true);

  // ---- 2 · THE GROUND ----------------------------------------------------
  //
  // Subdivided 26 x 30 so the falloff is a real ramp across the quad rather than four corner
  // colours stretched over 44 m. The near band is the terrace, lit by what spills out of the
  // very windows the player is looking through, and it is what makes the ground read as
  // CONTINUOUS with the room instead of as a card hung outside it.
  const lawnShade = (out, nx, ny, nz, x, y, z) => {
    const d = X0 - x;                                  // metres out from the wall
    const t = smoothstep(1.0, 30.0, d);
    // the window spill: a soft pool under the wall, falling off fast
    const spill = Math.pow(1 - smoothstep(0.0, 13.0, d), 2.0) * 0.55;
    const mot = (fbm(x * 0.22, z * 0.22, 3) - 0.5) * 0.30;
    for (let c = 0; c < 3; c++) {
      out[c] = mix3(A_LAWN_NEAR[c], A_LAWN_FAR[c], t) * (1 + mot) + A_STONE[c] * spill * 0.30;
    }
  };
  P.ground(OUT(SKY_D - 2), OUT(0.35), Z0, Z1, -0.03, lawnShade, 26, 30);

  // the gravel walk right under the windows — a lighter strip, and the nearest thing outside,
  // so the eye has something at 2 m to measure the treeline at 22 m against
  P.ground(OUT(3.6), OUT(0.35), Z0, Z1, -0.02, (out, nx, ny, nz, x, y, z) => {
    const mot = (fbm(x * 0.9, z * 0.9, 2) - 0.5) * 0.34;
    for (let c = 0; c < 3; c++) out[c] = A_STONE[c] * 0.52 * (1 + mot);
  }, 4, 26);

  // ---- 3 · THE BALUSTRADE, at 4 m ----------------------------------------
  //
  // The near-field depth reference. It is the brightest built thing outside because it is the
  // only one close enough for the room's own light to reach, and a bright horizontal at 4 m in
  // front of a dark mass at 9 m in front of a treeline at 22 m is the whole illusion.
  const stoneShade = (mul) => (out, nx, ny, nz, x, y, z) => {
    // up-facing caps catch the sky, wall faces catch the window spill
    const up = ny * 0.5 + 0.5;
    const mot = (fbm(x * 1.4 + z * 0.3, y * 1.4, 2) - 0.5) * 0.16;
    for (let c = 0; c < 3; c++) {
      out[c] = A_STONE[c] * mul * (0.72 + 0.52 * up) * (1 + mot) + SKY_HORIZON[c] * up * 0.035;
    }
  };
  const BX = OUT(4.2);
  P.box(0.42, 0.34, Z1 - Z0, BX, 0.62, CZ, stoneShade(1.00));          // the coping
  P.box(0.30, 0.52, Z1 - Z0, BX, 0.26, CZ, stoneShade(0.62));          // the open rail below it
  for (let z = Z0 + 1.6; z < Z1; z += 3.4) {
    P.box(0.62, 1.02, 0.62, BX, 0.51, z, stoneShade(1.06));            // piers
    P.box(0.78, 0.16, 0.78, BX, 1.10, z, stoneShade(1.18));            // and their caps
  }

  // ---- 4 · THE HEDGE, at 9 m ---------------------------------------------
  //
  // The dark middle. Broken into bays with gaps so it is a parterre and not a fence, and each
  // bay is jittered in height — a hedge of one height at one value is a wall.
  const hedgeShade = (out, nx, ny, nz, x, y, z) => {
    const up = ny * 0.5 + 0.5;
    const mot = (fbm(x * 0.8 + z * 0.5, y * 1.1, 3) - 0.5) * 0.55;
    for (let c = 0; c < 3; c++) out[c] = A_HEDGE[c] * (0.70 + 0.62 * up) * (1 + mot);
  };
  for (let z = Z0 + 2; z < Z1 - 2; z += 5.2) {
    const h = 1.30 + rnd() * 0.40;
    P.box(1.05, h, 3.7 + rnd() * 0.7, OUT(9.0), h / 2, z + 0.4, hedgeShade);
  }
  // two urns on the walk, because a silhouette with an object in it has scale and one without
  // it is a texture
  for (const uz of [CZ - 6.2, CZ + 6.2]) {
    P.box(0.52, 0.30, 0.52, OUT(6.4), 0.15, uz, stoneShade(0.96));
    P.box(0.72, 0.62, 0.72, OUT(6.4), 0.61, uz, stoneShade(1.10));
  }

  // ---- 5 · THE TREELINE, at 20-28 m --------------------------------------
  //
  // Deliberately the DARKEST thing in the frame and deliberately drawn against the brightest
  // (the sky). Everything else out here is a value; this is the edge that makes the sky read as
  // distance rather than as a wall with a gradient painted on it.
  const treeShade = (out, nx, ny, nz, x, y, z) => {
    const up = ny * 0.5 + 0.5;
    const mot = (fbm(x * 0.5, (y + z) * 0.42, 3) - 0.5) * 0.60;
    // the crowns catch a little moonlight on top; the mass below stays black-green
    const moon = Math.pow(clamp01(up), 3.0) * smoothstep(4, 12, y) * 0.55;
    for (let c = 0; c < 3; c++) {
      out[c] = A_TREE[c] * (0.62 + 0.70 * up) * (1 + mot) + MOON_GLOW[c] * moon * 0.10;
    }
  };
  for (let z = Z0 + 1; z < Z1; z += 3.1 + rnd() * 1.5) {
    const d = 24 + rnd() * 10;
    const h = 5.0 + rnd() * 4.4;
    const w = 3.4 + rnd() * 2.8;
    P.box(w * 0.85, h * 0.62, w, OUT(d), h * 0.60, z, treeShade);       // the crown
    P.box(0.55, h * 0.42, 0.55, OUT(d), h * 0.21, z, (out, nx, ny, nz, xx, yy, zz) => {
      const mot = (fbm(xx * 1.1, yy * 1.1, 2) - 0.5) * 0.4;
      for (let c = 0; c < 3; c++) out[c] = A_TRUNK[c] * (1 + mot);
    });
  }

  // ---- 6 · A FAR WING OF THE HOUSE, at 32 m, WITH LIGHTS ON IN IT ---------
  //
  // ⚠️ THIS IS THE CHEAPEST THING IN THE FILE AND IT DOES THE MOST. Four warm rectangles at
  // 32 m say "this is an estate at night and there are other rooms in it" in a way that no
  // amount of planting does, and they give the crop a bright note that is NOT the sky — so the
  // value structure has a top end inside the silhouette rather than only above it.
  const wingShade = (out, nx, ny, nz, x, y, z) => {
    const up = ny * 0.5 + 0.5;
    for (let c = 0; c < 3; c++) out[c] = A_WING[c] * (0.70 + 0.60 * up);
  };
  const litShade = (out) => { for (let c = 0; c < 3; c++) out[c] = A_LIT_WINDOW[c]; };
  const WD = 32, WZ = CZ + 19;
  P.box(9.0, 11.5, 15.0, OUT(WD), 5.75, WZ, wingShade);                 // the block
  P.box(10.2, 1.1, 16.2, OUT(WD), 11.9, WZ, wingShade);                 // its parapet
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 2; j++) {
      // on the wing's +Z-facing... no: on the face that looks back at the ballroom, i.e. -X side
      P.box(0.10, 1.55, 0.95, OUT(WD) + 4.55, 3.4 + j * 3.9, WZ - 5.0 + i * 5.0, litShade);
    }
  }

  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true, fog: false, side: THREE.FrontSide, toneMapped: true,
  });
  mat.name = 'ballroom.night';
  const mesh = P.build(mat, `ballroom-night.${sp.id ?? 'ball'}`);
  return { mesh, tris: P.tris };
}
