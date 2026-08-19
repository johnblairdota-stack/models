import * as THREE from 'three';
import { studio, roundedBox } from './_studio.js';
import {
  plasterWall, plasterCeiling, plasterOrnament, plasterRose, plasterBreak, plasterKeyBack,
  corniceSection,
} from '../materials/surfaces/plaster.js';
import { walnutBoards } from '../materials/surfaces/walnut.js';

/**
 * Lime plaster and cast ornamental plasterwork, judged on the shapes the estate actually
 * uses them on AND on the thing the material exists for — coming off the wall.
 *
 * WHY THE FRAME IS BUILT THIS WAY
 *
 * The piece has to read at 2 m and at 20 cm, and detail authored at one frequency is a named
 * recurring failure on this project. One camera cannot serve both distances by zooming, and
 * one texture cannot serve both by magnifying: a 2.4 m tile at 1024 is 2.34 mm per texel, so
 * at arm's length its finest octave is four screen pixels wide and the wall goes glassy. So
 * the frame carries the material on TWO SETS OF GEOMETRY AT TWO TEXEL DENSITIES —
 *
 *   the wall, ceiling and cornice at 3.3 m, on the 2.4 m tile   -> 2.34 mm/texel
 *   fallen fragments at about 1.5 m, on a 0.6 m near tile       -> 0.29 mm/texel
 *
 * — and the near fragments are large in frame on purpose. That is also how the game will
 * have to do it, so the split is not a trick for the showcase.
 *
 * A mid-grey ground rather than the art-sheet near-white — see mat-marble.js for the
 * reasoning. Plaster is a pale, near-white material, so against a white cyc there is nothing
 * in frame darker than the specimen and the trowel relief has no contrast to read against.
 *
 * The key is deliberately LOW AND RAKING. Plaster's whole signal is a few millimetres of
 * undulation; light from anywhere near the surface normal flattens it completely and the
 * wall reads as grey paint, which is exactly the failure this piece exists to avoid.
 */

// ---------------------------------------------------------------------------------------
// Deterministic noise. NOT Math.random: capture is deterministic here (fixed timestep,
// seeded RNG) and a view that shuffles its own debris between runs makes every before/after
// comparison worthless.
// ---------------------------------------------------------------------------------------
function h11(n) { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); }
function h21(x, y, s) {
  const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453;
  return v - Math.floor(v);
}
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = h21(xi, yi, s), b = h21(xi + 1, yi, s);
  const c = h21(xi, yi + 1, s), d = h21(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm2(x, y, s, oct = 4) {
  let t = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { t += vnoise(x * f, y * f, s + i * 17) * amp; amp *= 0.5; f *= 2; }
  return t;
}

/**
 * THE SAME TRAP AS `fbmT` IN GLSL, AND IT BIT AGAIN ON THE JS SIDE.
 *
 * `fbm2` never divides by the sum of its amplitudes, so at 3 octaves it returns 0 to 0.875
 * with a mean near 0.44, and — like every fbm — its distribution is a narrow bell, not a
 * uniform spread. Code written as `(fbm2(...) - 0.5) * A` therefore gets a signal whose
 * typical excursion is about a SIXTH of A, not half of A, and which is biased negative.
 *
 * That is exactly why the round-2 fragment relief rendered as nothing: 11 mm of authored
 * face relief arrived as about 2 mm of biased wobble, which at a 150 mm wavelength is a
 * three degree slope, and three degrees on a matt surface is invisible. It is the same
 * class of failure as the `fbmT` gate at 0.9 that never fires — authored detail silently
 * scaled into nonexistence — and the fix is the same shape: normalise, then STRETCH.
 *
 * Returns roughly -1..1 with a usable spread. The existing calls to `fbm2` in this file
 * (the break field, the wall tint) were tuned against the raw function and are left alone.
 */
function fbmS(x, y, s, oct = 3, k = 2.4) {
  const norm = 1 - 0.5 ** oct;
  return Math.max(-1, Math.min(1, (fbm2(x, y, s, oct) / norm - 0.5) * 2 * k));
}
const sstep = (a, b, x) => { const u = Math.max(0, Math.min(1, (x - a) / (b - a))); return u * u * (3 - 2 * u); };

// ---------------------------------------------------------------------------------------
// THE BROKEN SLAB
//
// A plaster coat is a SLAB, roughly 20 mm of it, and every believable break shows that
// thickness end-on. An alpha-cut plane cannot: it gives a ragged outline with no section
// behind it, which reads as torn paper, and a critic on the wall group named the failure
// exactly — "a clean line where the photo has a ragged crumbling lip".
//
// So this builds real geometry. A grid over the panel, a break field sampled per vertex,
// cells kept only where all four corners still have plaster, and a RIM quad dropped down the
// thickness on every edge where a kept cell meets a hole. The rim carries `plasterBreak` and
// the front carries the finished face, so the tonal step between finish and core happens on
// two materials meeting at a real edge rather than in one texture pretending.
//
// THE CONTOUR IS INTERPOLATED, NOT SNAPPED TO CELLS. This is the round-2 fix for the
// staircased silhouette, and it is a change of method rather than of resolution.
//
// The first version kept or dropped WHOLE CELLS: a cell survived only if all four of its
// corners still had plaster. That quantises the break contour onto the lattice, so however
// ragged the field is the edge can only ever be a run of axis-aligned steps one cell long,
// and jittering the lattice by a third of a cell is not enough to hide it — a critic
// confirmed the staircase at all four boundary points. Halving the cell halves the step and
// quadruples the triangle count, which is paying twice for a defect that never goes away.
//
// Now each cell is split into two triangles and each triangle is CLIPPED against the field
// with linear interpolation along its edges (Sutherland-Hodgman against present > 0). The
// contour vertex therefore lands where the field actually crosses zero, to sub-millimetre
// precision, and only its DIRECTION is quantised — it turns once per cell instead of
// stepping once per cell. Same triangle budget, curved edge.
//
// Clipping TRIANGLES rather than quads is deliberate: the ambiguous marching-squares saddle
// (two diagonally opposite corners inside) has no correct quad answer and produces a bridge
// across the middle of the cell. Two triangles resolve it by construction.
// ---------------------------------------------------------------------------------------
// THE COAT IS 45 mm, NOT 28. A critic read the round-2 break edge as "a thin torn membrane,
// not the thick aggregate-filled cross-section both the photo references and the locked art
// show", and the honest answer is that 28 mm was thin for the job in two separate ways.
//
// Physically it is defensible but mean: a three-coat lime job on riven lath is a 10-15 mm
// render pushed through the gaps, a 10-15 mm float coat and a 3-5 mm setting coat, so 30-45
// mm of total build is the normal range and the references are plainly at the top of it —
// in lath-mcminnville-oregon the white section round the hole measures about 3.5% of the
// hole's width, and on this hole that is 75 mm of apparent band.
//
// Geometrically it was worse than it looked, because a rim's VISIBLE width is not its
// thickness. The rim runs from the front contour back to the undercut, so what the camera
// sees across it is T*sin(obliquity) + undercut*cos(obliquity). At round 2's 9.8 degrees and
// a 13 mm undercut that came to 17.6 mm, of which the 28 mm of thickness contributed 4.8.
// The camera move to 25.5 degrees and 45 mm of coat with a 21 mm undercut take it to 38 mm —
// ten pixels of lit fractured section round the whole contour instead of four.
const SLAB_T = 0.045;          // render, float and set on lath, plus the keys behind it
const BREAK_TILE = 0.55;       // world size of one uv tile of the break material

/**
 * @param {object} o
 * @param {number} o.x0,o.y0,o.w,o.h   panel rect in the slab's own plane
 * @param {number} o.cell              target cell size
 * @param {(x:number,y:number)=>number} o.present  > 0 where plaster remains
 * @param {number} o.seed
 * @param {boolean} o.back             emit a back face too (fragments need one; a wall does not)
 * @param {(x:number,y:number)=>[number,number]} o.uv  front-face uv
 * @param {(x:number,y:number)=>[number,number,number]} [o.tint] front-face vertex colour
 * @param {number} [o.thick]           slab thickness; defaults to SLAB_T
 * @param {(x:number,y:number)=>number} [o.zFront]  front-face relief, +z out of the face
 * @param {(x:number,y:number)=>number} [o.zBack]   back-face relief, measured from -thick
 * @param {number} [o.rimTile]         world size of one uv tile on rim + back
 */
function brokenSlab(o) {
  const nx = Math.max(2, Math.round(o.w / o.cell));
  const ny = Math.max(2, Math.round(o.h / o.cell));
  const dx = o.w / nx, dy = o.h / ny;
  const J = 0.34;
  const T = o.thick ?? SLAB_T;
  const RT = o.rimTile ?? BREAK_TILE;
  const zf = o.zFront || (() => 0);
  const zb = o.zBack || (() => 0);

  // The lattice is still jittered. It no longer has to carry the whole burden of breaking up
  // the axis alignment, but an unjittered lattice still makes the CONTOUR DIRECTIONS repeat
  // on a grid, which reads as faint diagonal banding along the edge.
  const px = [], py = [], fv = [];
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      const edge = (i === 0 || j === 0 || i === nx || j === ny) ? 0 : 1;
      const x = o.x0 + i * dx + (h21(i, j, o.seed) - 0.5) * dx * J * 2 * edge;
      const y = o.y0 + j * dy + (h21(i, j, o.seed + 9) - 0.5) * dy * J * 2 * edge;
      px.push(x); py.push(y); fv.push(o.present(x, y));
    }
  }
  const at = (i, j) => j * (nx + 1) + i;

  const front = { pos: [], uv: [], col: [], idx: [] };
  const rim = { pos: [], uv: [], idx: [] };
  const back = { pos: [], uv: [], idx: [] };

  const pushFan = (sink, poly, z, uvOf, reversed, withCol) => {
    const b0 = sink.pos.length / 3;
    for (const p of poly) {
      sink.pos.push(p[0], p[1], z(p[0], p[1]));
      const [u, v] = uvOf(p[0], p[1]);
      sink.uv.push(u, v);
      if (withCol) {
        const t = o.tint ? o.tint(p[0], p[1]) : [1, 1, 1];
        sink.col.push(t[0], t[1], t[2]);
      }
    }
    for (let k = 1; k < poly.length - 1; k++) {
      if (reversed) sink.idx.push(b0, b0 + k + 1, b0 + k);
      else sink.idx.push(b0, b0 + k, b0 + k + 1);
    }
  };

  // ---- the rim: the fractured section, hung off the interpolated contour
  //
  // THE LIP IS UNDERCUT, and that is what makes it visible at all. A rim dropped straight
  // back from the contour is a surface whose normal lies IN the wall plane, so from in front
  // of the wall you see it edge-on: on the far side of the hole it is one pixel wide and on
  // the near side it is hidden completely. The first version did exactly that and 28 mm of
  // carefully authored fractured section rendered as a pale hairline.
  //
  // Real broken plaster undercuts — the brittle finish coat survives as an overhanging lip
  // while the soft core behind it crumbles further back, which is the single most repeated
  // observation in refs/lath ("It crumbles, undercuts, and leaves a thin lip").
  //
  // WINDING IS LOAD-BEARING AND FAILS SILENTLY. Each contour segment A -> B comes out of the
  // clip with the surviving plaster on its LEFT, so the outward normal is (dy, -dx). Emitting
  // the quad as A, A+n (back), B+n (back), B puts the face normal along +n AND +z, i.e.
  // tilted out of the hole and toward the room, which is what a real undercut lip does. Emit
  // it in the other order and the cross product's z term flips, the whole strip faces away
  // from the camera and is backface-culled — and computeVertexNormals() shades whatever
  // winding it is given, so nothing about the geometry looks wrong. That exact bug shipped
  // once here; it was findable only by sampling pixel colour across the hole boundary, where
  // the render went straight from wall tint to near-black lath with no rim tone at all.
  const V = T / RT;
  // The cell used to cap the undercut at half a cell, which on a 26 mm cell held it to 13 mm
  // however thick the coat got — so raising SLAB_T alone would have bought nothing on the
  // near side of the hole, where the undercut and not the thickness is what the camera sees.
  // 0.85 of a cell lets 45 mm of coat carry its own 55% undercut. Adjacent rim quads can now
  // cross each other on a tight concave corner of the contour; that renders as a chunkier
  // lip, which is the thing being asked for, so it is left.
  const cap = (o.undercut ?? 1) * Math.min(T * 0.55, Math.min(dx, dy) * 0.85);
  const addRim = (A, B) => {
    const ex = B[0] - A[0], ey = B[1] - A[1];
    const L = Math.hypot(ex, ey);
    if (L < 1e-7) return;
    const ox = ey / L, oy = -ex / L;
    const u0 = cap * (0.35 + h21(Math.round(A[0] * 40), Math.round(A[1] * 40), o.seed + 3));
    const u1 = cap * (0.35 + h21(Math.round(B[0] * 40), Math.round(B[1] * 40), o.seed + 3));
    const n0 = rim.pos.length / 3;
    rim.pos.push(
      A[0], A[1], zf(A[0], A[1]),
      A[0] + ox * u0, A[1] + oy * u0, -T - zb(A[0], A[1]),
      B[0] + ox * u1, B[1] + oy * u1, -T - zb(B[0], B[1]),
      B[0], B[1], zf(B[0], B[1]));
    // u along the dominant axis of the segment, so neighbouring segments agree at the vertex
    // they share and the aggregate does not slide along the lip
    const along = Math.abs(ex) >= Math.abs(ey) ? 0 : 1;
    const ua = (along === 0 ? A[0] : A[1]) / RT;
    const ub = (along === 0 ? B[0] : B[1]) / RT;
    rim.uv.push(ua, 0, ua, V, ub, V, ub, 0);
    rim.idx.push(n0, n0 + 1, n0 + 2, n0, n0 + 2, n0 + 3);
  };

  const frontUV = (x, y) => o.uv(x, y);
  const backUV = o.uvBack || ((x, y) => [x / RT, y / RT]);

  // clip one CCW triangle against present > 0
  const tri = [null, null, null];
  const emit = () => {
    const out = [], cross = [];
    for (let k = 0; k < 3; k++) {
      const a = tri[k], b = tri[(k + 1) % 3];
      const ain = a[2] > 0, bin = b[2] > 0;
      if (ain) { out.push(a); cross.push(false); }
      if (ain !== bin) {
        const t = a[2] / (a[2] - b[2]);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 0]);
        cross.push(true);
      }
    }
    if (out.length < 3) return;
    pushFan(front, out, zf, frontUV, false, true);
    if (o.back) pushFan(back, out, (x, y) => -T - zb(x, y), backUV, true, false);
    for (let i = 0; i < out.length; i++) {
      const j = (i + 1) % out.length;
      if (cross[i] && cross[j]) { addRim(out[i], out[j]); break; }
    }
  };

  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
      const P = (k) => [px[k], py[k], fv[k]];
      tri[0] = P(a); tri[1] = P(b); tri[2] = P(c); emit();
      tri[0] = P(a); tri[1] = P(c); tri[2] = P(d); emit();
    }
  }
  return { front, rim, back };
}

function toGeometry(part, withColour) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(part.pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(part.uv, 2));
  if (withColour) g.setAttribute('color', new THREE.Float32BufferAttribute(part.col, 3));
  g.setIndex(part.idx);
  g.computeVertexNormals();
  return g;
}

/** append `part` into `sink`, transformed by `m` */
function appendTransformed(sink, part, m, nm) {
  const base = sink.pos.length / 3;
  const v = new THREE.Vector3();
  for (let i = 0; i < part.pos.length; i += 3) {
    v.set(part.pos[i], part.pos[i + 1], part.pos[i + 2]).applyMatrix4(m);
    sink.pos.push(v.x, v.y, v.z);
  }
  for (const u of part.uv) sink.uv.push(u);
  for (const k of part.idx) sink.idx.push(base + k);
  // vertex colour, if the source has it and the sink wants it. An unset colour attribute is
  // not "no tint", it is BLACK, so this is all-or-nothing per sink.
  if (sink.col && part.col) for (const c of part.col) sink.col.push(c);
  void nm;
}

// ---------------------------------------------------------------------------------------

export default async function view(args = {}) {
  // The calibration sphere is OPT-IN. It is a genuine instrument — it is the only thing in
  // frame that is neither pale nor matt, so it is how you check the IBL is doing real work —
  // but a chrome ball sitting on the floor of a Georgian room is an unmistakable test-render
  // tell, and a critic named it as actively damaging the blind read of the whole scene. So it
  // lives behind `--extra "cal=1"` and the delivered frame does not contain it.
  const showCal = (args.params?.get?.('cal') ?? '0') !== '0';

  // `--extra "cam=r2"` puts the ROUND-2 CAMERA back in front of the round-3 geometry. It is
  // the only honest way to show what the obliquity buys: rendering the old build against the
  // new one compares two different walls, and the question on the table is specifically
  // whether the protruding laths displace against the cavity or foreshorten into it. Same
  // laths, same splay, same protrusion, 9.8 degrees against 29.5.
  const camR2 = (args.params?.get?.('cam') ?? '') === 'r2';

  // `--extra "flat=1"` suppresses EVERY out-of-plane offset in the break — the courses, the
  // splinters and the free boards below all collapse into the cavity plane, keeping their
  // colours, their lengths and their in-plane angles. Differencing it against the delivered
  // frame isolates exactly what depth contributes, and it is the acceptance test this round
  // was set: it is not enough for the frame to LOOK three-dimensional, the difference has to
  // be there in pixels. It stays wired up permanently and it is meant to be run against.
  //
  // Note what "flat" does to a free board, because that is the whole design: a board that
  // leans out of the cavity and lies across the surviving plaster is, when flattened, BEHIND
  // that plaster and clipped away entirely, along with its contact shadow. So the delta is
  // not a few splinter tips any more — it is every board that crosses the hole's silhouette,
  // plus every shadow those boards throw on the lit wall.
  const flatLath = (args.params?.get?.('flat') ?? '0') !== '0';

  const engine = await studio({
    // NO CYC. `studio()`'s backdrop is a floor that curves up into a wall, and the curve
    // LEAVES y = 0 at about z = 0 and is already 0.3 m high by z = -1.35. This view builds
    // its own room at z = -1.35, so the cyc was rising THROUGH it: it occluded the bottom
    // of the hero wall, the skirting and 1.3 m of floor with a near-black band across the
    // whole width of frame — a third of the picture. Diagnosed by dumping every mesh's
    // world bounding box, after the shape of the thing wrongly suggested a shadow (it
    // survives key.castShadow = false) and then screen-space AO (it survives ao=0).
    // A view that builds an interior does not want a backdrop; it wants its own walls.
    cyc: false,
    bg: 0x4e535a,
    envIntensity: 0.62,

    // ---- OBLIQUITY IS NOT THE LEVER, AND THIS IS THE ROUND-4 CORRECTION -----------------
    //
    // Rounds 2 and 3 both bet the piece on the camera. Round 2 authored 160 mm of lath
    // protrusion at 9.8 degrees off the wall normal and a critic reported nothing projected.
    // Round 3 concluded the fault was obliquity, orbited to 29.5 degrees, took protrusion to
    // 260 mm — and its own `flat=1` A/B came back near pixel-identical. Two techniques, three
    // rounds, one symptom. The header used to argue the second bet in detail; that argument
    // is deleted rather than softened, because it was wrong, and here is why.
    //
    // THE PROJECTION ARITHMETIC. Put the camera at azimuth `a` and elevation `e` off the wall
    // normal, no roll. Work out where the two directions that matter LAND IN THE IMAGE:
    //
    //   the wall normal (the direction protrusion moves things)   ->  (-sin a, -cos a sin e)
    //   world +x (the direction a lath course RUNS)               ->  ( cos a, -sin a sin e)
    //
    // Their 2D cross product is exactly `sin e`. So the displacement a protruding lath gets
    // ACROSS ITS OWN AXIS — the only component that can change a silhouette made of parallel
    // bars — is sin(e)/|L| per unit of protrusion, and it does not contain `a` at all except
    // through the foreshortening in |L|. At e = 0 it is ZERO AT EVERY AZIMUTH: a horizontal
    // board pushed out of a wall, seen from a camera level with it, slides along its own
    // length and the picture does not change. Orbiting sideways cannot fix that, which is
    // why 3.3x more obliquity bought a 1.3x pixel delta and not a 3.3x one.
    //
    // Measured against the lath pitch (62 mm), for a 220 mm proud end:
    //
    //   in-plane angle of the board      0 deg    45 deg   70 deg   90 deg
    //   round-3 camera, courses crossed  0.37     1.10     1.58     1.75
    //   this camera,    courses crossed  0.57     0.93     1.48     1.70
    //
    // The first column is the whole of rounds 2 and 3. Under half a course of crossing is
    // under half a lath width, which is the definition of invisible.
    //
    // AND `e` CANNOT BE BOUGHT. Getting e to 25 degrees needs 1.2 m of height difference at
    // this standoff, in a room 2.60 m tall. Every arrangement that reaches it loses either
    // the floor (camera high: the near floor drops out of the bottom of frame, so the debris
    // compresses into a band at the wall base — which is already a critic complaint) or the
    // cornice and ceiling (camera low, looking up). The vertical span the frame must cover to
    // hold both is atan(h/D_near) + atan((2.60 - h)/D_wall), and at any h that gives a useful
    // `e` that sum is past 80 degrees. There is no camera here. There is only construction.
    //
    // SO THE CAMERA IS NOW A COMPOSITION DECISION AND NOTHING ELSE, and it makes exactly
    // three changes, each checked by arithmetic before rendering:
    //
    //   * IN 0.29 m and up 0.06, fov held at 62. The break goes from 40% to 54% of frame
    //     width, which is where the locked art puts it. That also shrinks the bare wall on
    //     the left that a critic called a dead third.
    //   * obliquity 29.5 -> 28.4 deg. Slightly LESS, and deliberately: the right-hand frame
    //     edge lands at x = 6.34 on the wall, inside the existing 9.40 m run, so the wall
    //     mesh does not have to grow. Obliquity was buying almost nothing (see above) and it
    //     was the thing forcing the wall wider.
    //   * FRAMING CONSTRAINTS, all re-checked at (0.02, 0.84, 1.02) -> (1.00, 1.12, -1.35):
    //       cornice 2.30-2.60 m subtends +31.6 to +36.6 deg; top of frame is +37.2 deg.
    //       floor enters at 1.82 m horizontal; the nearest debris is at 1.95 m.
    //       left edge lands at x = -1.06, inside WALL_X = -1.80.
    //       moire: wall 28.4 deg off normal (1.14:1), nearest floor 24.8 deg (2.4:1). The
    //       round-1 disaster was 9 deg off the PLANE, i.e. 6.4:1.
    //
    // The inside corner stays out of frame, as in round 3, and for the same reason.
    cameraPos: args.cameraPos ?? (camR2 ? [1.05, 0.72, 1.90] : [0.02, 0.84, 1.02]),
    target: args.target ?? (camR2 ? [0.55, 0.62, -1.35] : [1.00, 1.12, -1.35]),
    fov: args.fov ?? (camR2 ? 70 : 62),
    shadowExtent: 4.2,
  });

  // ---- lighting ------------------------------------------------------------------------
  // A low raking key from the left. At 24 degrees of elevation it still clears the front
  // edge of the ceiling, so the whole wall is lit, and every trowel sweep throws a shadow
  // the length of itself.
  engine.lights.key.position.set(-5.0, 2.35, 2.9);
  engine.lights.key.intensity = 2.55;
  engine.lights.key.shadow.camera.far = 26;
  engine.lights.key.shadow.camera.updateProjectionMatrix();

  // The studio default is a 1024 shadow map, and this view widens the ortho box to 4.2 to
  // cover a room, so one shadow texel lands 8.2 mm apart on the floor — coarse enough to
  // stipple the debris and the near boards. Four times the texels, with the bias sized
  // against a 28 mm slab rather than against the robot the default was tuned for.
  //
  // NOT A CURE FOR THE FRAGMENT BANDING — see the note on `cell` in the debris block. This
  // was tried as a fix for it, measured, and did not remove it; it is kept only because it
  // genuinely improves the floor. Recording that here because a comment claiming a fix that
  // was disproved is worse than no comment.
  engine.lights.key.shadow.mapSize.set(2048, 2048);
  engine.lights.key.shadow.normalBias = 0.030;
  engine.lights.key.shadow.bias = -0.0004;

  // The fill is the ONLY light the return wall can see. Its face looks along +x, so nothing
  // on the key's side of the room can reach it, and at the studio default it rendered as a
  // black void filling a third of the frame.
  //
  // AND IT WAS WHAT MADE THE PLASTER COLD. `studio()` ships the fill at 0xdfeaff — a
  // deliberate sky-blue bounce, right for a white cyc and a chrome robot. This view runs it
  // at 1.55, nearly two thirds of the key, and it is the ONLY light on the return wall. So
  // the return wall measured R-B 2.8 and the hero wall 9-13, against 18-46 everywhere in the
  // locked art. Half the fix is the albedo (see plasterWall's tint) and half is here: an
  // interior fill is light that has bounced off a cream wall and a timber floor, so it is
  // warm, not blue. Measured after: hero wall R-B 15 on the tint alone, 30+ with this.
  engine.lights.fill.color.setHex(0xffe9d2);
  engine.lights.fill.position.set(4.8, 1.35, 3.1);
  engine.lights.fill.intensity = 1.55;
  engine.lights.rim.color.setHex(0xfff0e0);
  engine.lights.rim.intensity = 0.65;
  // The key is the last few points of the colour fix. With the tint and the fill corrected
  // the wall measured R-B 23 lit and 30 in the half-shadow against the locked art's 18-46;
  // the SHADOWED readings already sat on the art's R/B ratio of 1.24-1.30 and only the
  // brightest lit patch was still short, at 1.15, because that is the region the key owns.
  engine.lights.key.color.setHex(0xffefd6);

  // BOUNCE OFF THE FLOOR. Nothing on a ceiling faces the sky, so a ceiling and the soffits
  // of a cornice are lit almost entirely by what comes back up off the floor. Without this
  // the whole top third of the frame is a black band and the ornament — the thing this view
  // exists to show — is invisible.
  // 1.15 -> 1.45 in round 3. The break rim now has 45 mm of coat and a 21 mm undercut behind
  // it, and round the TOP of the hole that section faces downward — away from a key raking
  // at 22 degrees — so the thickness the round-3 slab bought was arriving as a band of
  // shadow rather than as a band of material. Floor bounce is the only light in the rig that
  // reaches a downward-facing surface, and it is also what the reference photographs are
  // lighting their white sections with.
  const bounce = new THREE.DirectionalLight(0xf6ecdb, 1.45);
  bounce.position.set(1.1, -1.6, 2.6);
  engine.scene.add(bounce);

  // ---- dimensions ----------------------------------------------------------------------
  const CEIL = 2.60;         // ceiling height
  const WALL_Z = -1.35;      // the plaster FACE of the back wall
  const WALL_X = -1.80;      // the return wall plane
  const WALL_W = 9.40;       // back wall, x from WALL_X to WALL_X + WALL_W
  const ROOM_D = 5.20;       // how far the return wall and the ceiling come forward
  const BAND = 0.30;         // cornice band height
  const PROJ = 0.332;        // scale on the section's normalised projection -> 0.22 m out

  // ---- materials -----------------------------------------------------------------------
  // The wall is authored for a ~2.4 m tile, so 9.4 m of wall wants 4 repeats across and
  // exactly one up: the grime is a gradient from v = 0 and repeating it vertically would
  // put a dirt line halfway up the wall.
  const wallMat = plasterWall({ repeat: [4.0, 1] });

  // A SECOND BAKE, NOT A RE-REPEAT. `MaterialBaker.reRepeat()` clones the material's
  // textures, and every map here is a RENDER TARGET texture: three.js tracks a render
  // target's GL texture on the texture's own properties, so a clone finds none, falls into
  // the ordinary upload path, and uploads `image` — which for a render target is
  // `{width, height, depth}` with no pixel data. The clone is therefore ALL BLACK. It does
  // not warn and it does not throw. This is what made the return wall a black void, and
  // `wall-transition.js:115` builds its floor the same way — REPORTED, not fixed here.
  const returnMat = plasterWall({ repeat: [ROOM_D / 2.36, 1] });

  const ceilMat = plasterCeiling({ repeat: [4.0, 1.1] });
  const corniceMat = plasterOrnament({ units: 6, dentils: 2 });
  const roseMat = plasterRose();

  // THE NEAR-FIELD FACE.
  //
  // ROUND 1 GOT THE ARITHMETIC WRONG HERE and the header repeated the wrong number. It said
  // the fragments carried "a 0.55 m break tile -> 0.54 mm/texel", but only their RIMS and
  // BACKS did: their finished FACES were mapped on the wall's 2.4 m tile, and 2.4 m at 2048
  // is 1.17 mm per texel. At the metre-odd the nearest fragment sits from the camera that is
  // about a texel and a half per screen pixel, so the 4.4 mm horsehair spanned under four
  // texels and arrived on screen as a smudge. The critic's verdict — "flat white low-poly
  // blobs with no resolvable detail despite running the hair-capable fracture material" —
  // was measuring exactly that: the material genuinely is hair-capable, and the mapping was
  // throwing the hair away before it reached the screen.
  //
  // `zoom: 4` re-authors the SAME shader onto a 0.6 m tile with every feature the same size
  // in millimetres (see uZoom in plaster.js), so at 2048 this is 0.29 mm per texel — four
  // times the density for the same memory — and a fibre is fifteen texels wide.
  //
  // A LUMP ON THE FLOOR IS NOT A CLEAN WALL LYING DOWN. A fallen piece is FILTHY: it carried
  // its own dust down with it, it has been ground against the boards, and it is lit from a
  // direction its face was never finished for. Darker and dirtier than the wall, crazing up,
  // hair up (it is the near read and it is the thing the piece is named for), and no gravity
  // grime — a fragment has no floor line of its own.
  const NEAR_TILE = 0.60;                 // world size of one closeMat tile, = 2.4 / zoom
  //
  // DIRTIER AGAIN IN ROUND 3, and the measurement is why the fix is what it is. A critic
  // called the debris "a shade too pale/clean, styrofoam-like", which sounds like a hue
  // problem and is not one: probed on the round-2 frame the fallen slab measured R-B 27.3
  // against the wall's 24.5-28.2, i.e. already squarely in the wall's own warmth family.
  // What it measured too high on was VALUE against its surroundings — median luminance 118
  // sitting on a floor at 46, so the pieces read as bright objects lying on dark wood rather
  // than as lumps of the wall they fell out of. Styrofoam is a value cue, not a hue cue.
  // So the tint comes down 12% and out 25% in warmth, and the per-piece spread below widens
  // rather than shifts — a spill whose pieces are all the same value is the other half of
  // the same complaint.
  const closeMat = plasterWall({
    size: 2048, zoom: 4, grime: 0, soil: 1.0, crazing: 1.0, hair: 1.15,
    burnish: 0.30, repeat: [1, 1],
    // DOWN 14% AGAIN IN ROUND 4. Round 3's re-tone was measured and legitimate — the pieces
    // sit at R-B 31-32 against a wall at 25-30, squarely in its warmth family — but the
    // luminance it landed on, 85-92 over boards at 23-48, is still twice the value of the
    // floor they lie on, and that is the half of the complaint the hue fix could not reach.
    tint: [0.389, 0.351, 0.282],
  });
  closeMat.vertexColors = true;

  const breakMat = plasterBreak({ tint: [0.700, 0.664, 0.590] });
  // FRACTURED SECTION, NOT KEYED BACK. What is left in the gap after the face comes off is
  // the STUB of a key, snapped roughly level with the back of the coat — so the surface
  // facing the room is a fracture. Round 2 gave it `plasterKeyBack`, whose height field
  // draws bead ridges at a lath pitch, so every key carried a miniature set of keys across
  // it: at 26 px per bead that rendered as fine vertical striping and made the beads read as
  // ribbed plastic. Same tint, right surface.
  const keyMat = plasterBreak({ voids: 0.55, dust: 0.35, tint: [0.612, 0.582, 0.522] });

  // The same two, re-authored for the near field. zoom 2 puts the aggregate tile at 275 mm,
  // i.e. 0.27 mm per texel at size 1024 — twice the density of the wall's rim for no extra
  // memory, which is what lets a 1.6 mm sand grain and a hair end survive to the screen on a
  // fragment a metre away.
  const NEAR_BREAK_TILE = 0.275;
  const breakNear = plasterBreak({ zoom: 2, dust: 0.85, tint: [0.578, 0.540, 0.462] });
  const keyNear = plasterKeyBack({ zoom: 2, dust: 0.55, tint: [0.548, 0.512, 0.436] });
  keyNear.vertexColors = true;

  // A boarded floor rather than the marble: this is a plastered, timber-skirted room, not
  // the marble hall, and marbleFloor costs 39 s of shader compile on its own, which puts
  // the whole view past the harness's ready timeout.
  // WEAR CUT FROM 0.75. At 0.75 on a 2.6 repeat the walnut's wear field put 40-50 mm dimples
  // across the middle of the floor — under a key raking at 24 degrees they read as a wet,
  // pockmarked patch directly under the debris this view exists to be judged on, and the
  // eye goes to them before it goes to the plaster. Not this slice's material, so the change
  // is made HERE at the call rather than in walnut.js, where other views want the wear.
  // NOT THIS SLICE'S MATERIAL, AND THE SEED IS THE ONLY HANDLE THIS CALL SITE HAS. A critic
  // measured one near board carrying a diagonal specular streak at luminance 47 against 23-43
  // on its neighbours, and correctly filed it against walnut rather than against plaster.
  // Which board is pale is a property of walnut's per-board tone field; this view cannot dial
  // it, but it CAN move which board lands under the key's specular lobe. 7.2 -> 3.4 with the
  // repeat coarsened one notch, checked by probing the near boards after. If the streak
  // survives a re-seed it is walnut.js's to fix and is reported, not patched here.
  const floorMat = walnutBoards({
    boardsX: 7, segLen: 3, wear: 0.0, grime: 0.58, seed: 3.4,
    size: 1024, repeat: [2.7, 2.7],
  });
  // walnutBoards ships clearcoat 0.35, which is right for a polished hall floor and wrong
  // under a key raking at 24 degrees: the coat threw a broad wet-looking specular across the
  // near boards, directly under the fragments this view exists to be read on. Turned down
  // HERE rather than in walnut.js — the floor is not this slice's material and other views
  // want the polish. Tuned, not removed: a boarded floor still has some sheen.
  floorMat.clearcoat = 0.0;
  floorMat.clearcoatRoughness = 0.6;
  // AND HALVE THE NORMAL. The pockmarked wet-looking patch across the middle of the floor
  // is not the wear field — setting `wear` to 0 left it untouched. It is the board grain's
  // own relief showing up inside the key's specular lobe, which only sweeps one region of a
  // 16 m floor, so it reads as a localised defect rather than as texture. Damping the normal
  // keeps the grain everywhere it was and takes the sparkle out of the one place it hurt.
  // 0.45 -> 0.26 in round 3. The orbited camera looks further ALONG the boards, so more of
  // the near floor sits inside the key's specular lobe than it did square-on: probed, one
  // board measured p50 60 against 18 on its neighbours, which reads as a wet stain rather
  // than as timber. `seed` is also moved, because which board is pale is a property of the
  // walnut shader's per-board tone field and not something this view can dial.
  floorMat.normalScale.set(0.26, 0.26);
  const skirtMat = walnutBoards({
    boardsX: 1, segLen: 1, jointW: 0.005, wear: 0.25, grime: 0.55,
    size: 512, repeat: [11, 1],
  });

  // ---- floor ---------------------------------------------------------------------------
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  engine.scene.add(floor);

  // ---- the break field -------------------------------------------------------------------
  // One hole with an irregular outline and a crumbling margin, in wall coordinates.
  //
  // THREE SCALES, because a break has three. The low harmonics give the hole a shape you
  // could describe (it is wider than it is tall and it sags to the left); the 40 cm lobes
  // are whole patches that let go together; the 4 cm term is the crumb. Drop any one and it
  // fails in a nameable way — no harmonics and it is a circle, no lobes and it is a circle
  // with a fuzzy edge, no crumb and it is a clean line, which is the exact reject cue.
  // BIGGER THAN ROUND 1, AND THAT IS PART OF THE CAVITY FIX RATHER THAN A SEPARATE CHANGE.
  // At HR 0.72 the hole spanned about 15% of a 1280-wide review frame, which puts a 25 mm
  // lath on FIVE PIXELS. Nothing three-dimensional can read at five pixels: splinters,
  // tilt, key beads and the black behind them all average together, and what survives is
  // exactly what the critic saw — alternating light and dark rows. Both references put the
  // break far larger in frame than that (the locked art gives it half the picture), so the
  // honest fix is the one the references already show, and it costs no camera move: a lath
  // now lands on 9-11 pixels and the keys on 6-8.
  // HR IS UP 12% AND THE SQUASH WITH IT, WHICH IS A CAMERA CORRECTION RATHER THAN A TASTE
  // CHANGE. The wall is now seen 25.5 degrees off its normal, so every horizontal dimension
  // on it is foreshortened by cos(25.5) = 0.90. Left alone, the hole would have lost a tenth
  // of its width in frame purely as a side effect of the move that made the laths read.
  // 0.98 -> 1.10 with the squash 1.22 -> 1.30 restores the apparent width to within half a
  // percent of round 2's and leaves the height 5% larger.
  // HR 1.10 -> 1.22 in round 4. The camera came in 0.29 m, which enlarges the break on its
  // own; the radius goes with it so the courses stay at the same pixel pitch (a lath face is
  // 11-12 px either way) while the break covers 54% of frame width instead of 40%, which is
  // where the locked art puts it. Top of the hole reaches y = 2.16 against the cornice at
  // 2.30 and the bottom y = 0.28 against the skirting bead at 0.185, so it still opens into
  // wall at both ends rather than running out of the panel.
  const HX = 1.30, HY = 1.16, HR = 1.34;
  function wallPresent(x, y) {
    const dx = x - HX, dy = (y - HY) * 1.30;
    const r = Math.hypot(dx, dy);
    const a = Math.atan2(dy, dx);
    const rad = HR * (1 + 0.24 * Math.sin(a * 2 + 0.7)
                        + 0.15 * Math.sin(a * 3 - 1.9)
                        + 0.09 * Math.sin(a * 5 + 2.6));
    let f = r - rad;
    f += (fbm2(x * 2.4, y * 2.4, 11) - 0.5) * 0.62;    // 40 cm lobes
    f += (fbm2(x * 8.5, y * 8.5, 23) - 0.5) * 0.17;    // 12 cm
    f += (fbm2(x * 27.0, y * 27.0, 37) - 0.5) * 0.055; // 4 cm crumb
    return f;
  }

  // MACRO VARIATION ON THE GEOMETRY, NOT IN THE TILE — this is the anti-tiling measure.
  // The wall is 5.2 m of a 2.36 m tile, so anything with a strong signature inside the tile
  // shows up twice. Vertex colour is tied to the mesh and physically cannot repeat, so the
  // whole 5 m frequency band — damp rising off the floor, age soiling, the bloom of dirt
  // around the break — lives here and the texture is left carrying only what is smaller
  // than itself. It costs no texture memory and no draw call.
  function wallTint(x, y) {
    const damp = Math.max(0, 1 - y / 1.05) * (0.45 + 0.55 * fbm2(x * 0.9, y * 0.6, 5, 3));
    const age = fbm2(x * 0.42, y * 0.42, 71, 3);
    const halo = Math.max(0, 1 - Math.hypot(x - HX, (y - HY) * 1.1) / 1.45);
    // where the finish coat has spalled off, the coarse coat behind it is greyer and a good
    // deal darker — that tonal STEP is what makes the patch read as a missing layer rather
    // than as a smudge, and it is the same cue the fragments use on their own faces
    const sp = Math.min(1, wallSpall(x, y) / 0.0230);
    const k = (1.0 + (age - 0.5) * 0.30 - damp * 0.16 - halo * halo * 0.10) * (1 - sp * 0.42);
    // the coarse coat behind the finish is a browner, sandier material, so it warms as it
    // darkens — the opposite of the damp, which cools
    return [k, k * (1 - damp * 0.035 + sp * 0.020), k * (1 - damp * 0.075 + sp * 0.052)];
  }

  // ---- THE WALL IS NOT A BACKDROP, AND FOR THREE ROUNDS IT WAS ONE -----------------------
  //
  // A critic called the left third "bare, uneventful lit wall with nothing in it beyond faint
  // cracks", and that is generous — the same is true of everything in frame that is not the
  // hole. The wall mesh had a tint field and no RELIEF field at all, so 9.4 m of plaster was
  // geometrically a plane, and a plane under a key raking at 27 degrees returns one tone.
  // Every scrap of surface interest was coming from a 2.4 m texture tile at 2.34 mm/texel,
  // which at this distance is close to the pixel and averages away.
  //
  // What a wall next to a breach actually has, and what the locked art shows all round its
  // break, is SPALL: patches where the thin hard finish coat has let go and left the coarse
  // coat standing 5-9 mm lower behind a sharp lip. A sharp lip is the point. Smooth
  // undulation on a matt near-white surface is invisible at any amplitude, because there is
  // no edge for the eye to catch; a 7 mm step under a 27 degree key throws a hard line of
  // shadow 14 mm wide, and a line of shadow is a thing you can see. It is the same argument
  // the fragments' own `spallF` makes further down, applied where it was needed more.
  //
  // Placed deliberately, not scattered: four patches in the bare left field, two below the
  // break where the coat is loosest, one high right. The cell is 26 mm, so a 0.25 m patch is
  // ten cells across and its lip lands on a real edge rather than being averaged out.
  const SPALL_W = [
    // AND THERE ARE THREE OF THEM, NOT SEVEN. Scattered across the whole 9.4 m the patches
    // read as a skin condition — irregular pale blotches at random over an otherwise clean
    // wall, which is not a thing plaster does and not a thing the locked art shows. A coat
    // lets go where it has already been disturbed, so spall belongs against the breach and
    // along the cracks running out of it, and nowhere else. Three, all touching the hole.
    // cx     cy     rx     ry    depth   seed
    [-0.05, 1.52, 0.34, 0.26, 0.030, 2.1],
    [0.30, 0.56, 0.30, 0.24, 0.026, 5.3],
    [2.72, 1.34, 0.26, 0.32, 0.027, 21.3],
  ];
  function wallSpall(x, y) {
    let m = 0;
    for (const [cx, cy, rx, ry, d, sd] of SPALL_W) {
      const u = Math.hypot((x - cx) / rx, (y - cy) / ry);
      // a ragged margin, so the patch is not an ellipse with a bevel
      const e = 1 + (fbm2(x * 5.5 + sd, y * 5.5, 60 + sd, 3) - 0.5) * 0.85;
      // THE MARGIN HAS TO BE ONE CELL WIDE, NOT SIX. The first pass ramped the depth over
      // 0.16 of the patch radius, which on a 0.30 m patch is 48 mm — nearly two cells of the
      // 26 mm lattice — so the "step" arrived as a gentle ramp and the patch rendered as a
      // soft grey smudge that reads as a damp stain, not as missing material. A spall is a
      // flake: the finish coat is 4 mm thick and it lets go along a crack, so the edge is
      // vertical. Ramping over 0.045 of the radius puts the whole fall inside one cell, which
      // is the finest step this lattice can carry, and it is enough — under a key raking at
      // 27 deg an 11 mm wall casts a 21 mm line of shadow, which is 6 px here.
      m = Math.max(m, sstep(e, e - 0.045, u) * d);
    }
    return m;
  }
  // AND 11 mm WAS STILL THE WRONG QUANTITY. At that depth the patches rendered as pale
  // blotches with a soft margin — damp stains, which is what a shallow dish in a matt pale
  // surface always looks like, and worse than nothing because a stain is a texture defect.
  // The tonal step is what identifies missing material and 11 mm of the 45 mm build does not
  // produce one. These are now 23-30 mm deep: the finish AND the float coat gone, coarse
  // brown render standing at the back, which is what the locked art shows all round its
  // break and around every crack in it.
  function wallRelief(x, y) {
    // the float coat was laid by hand and is never true; 3 mm at half-metre wavelength
    return fbmS(x * 1.9, y * 1.9, 223, 3) * 0.0030
         + fbmS(x * 6.5, y * 6.5, 227, 2) * 0.0011
         - wallSpall(x, y);
  }

  // ---- the hero wall, as a broken slab ----------------------------------------------------
  {
    const s = brokenSlab({
      x0: WALL_X, y0: 0, w: WALL_W, h: CEIL, cell: 0.026, seed: 3.0,
      present: wallPresent, back: false,
      uv: (x, y) => [(x - WALL_X) / WALL_W, y / CEIL],
      tint: wallTint,
      zFront: wallRelief,
    });
    const face = new THREE.Mesh(toGeometry(s.front, true), wallMat);
    face.position.z = WALL_Z;
    face.castShadow = face.receiveShadow = true;
    wallMat.vertexColors = true;
    engine.scene.add(face);

    const lip = new THREE.Mesh(toGeometry(s.rim, false), breakMat);
    lip.position.z = WALL_Z;
    lip.castShadow = lip.receiveShadow = true;
    engine.scene.add(lip);
  }

  // ---- what is behind the plaster --------------------------------------------------------
  //
  // ROUND 2 REBUILD. The first version put a flat keyed PLANE behind a row of evenly spaced
  // rounded boxes and a critic read the result exactly as it deserved: "a flat barcode —
  // regular alternating brown/black horizontal bands". It was a fair description of the
  // construction. Everything was on one pitch, every lath was the same colour and thickness,
  // every lath ran the full width or was cut off square, and the keys — the detail the
  // reference index calls "the single detail that makes exposed lath read as real rather
  // than as a wooden slat wall" — were a normal map on a plane 58 mm behind an occluder,
  // which is to say invisible.
  //
  // What the references actually show, all four of them (the locked art most of all, and
  // lath-mcminnville-oregon, lath-straw-lime-closeup, lath-clay-plaster-ceiling):
  //
  //   * the pitch is IRREGULAR and so is everything else — thickness, depth, cupping, tilt
  //   * laths are MISSING, in ones and twos, leaving a wide dark slot with nothing in it
  //   * broken ends SPLINTER. They are never square. In the locked art the splinters are the
  //     dominant silhouette of the whole lath field — long tapered spikes pointing out of
  //     the wall, and they are the reason it reads as violence rather than as joinery
  //   * the KEYS are three-dimensional and they are what breaks the banding: pale lumps
  //     squeezed through the gap and slumped over the back of the lath, present along part
  //     of a gap and absent along the rest
  //   * a stud, and behind everything a cavity that goes properly black
  //
  // So the barcode is attacked on all five counts at once, and the keys in particular are
  // now real lofted geometry sitting IN the gaps where the light can find them.
  //
  // ONE THING FROM THE FIRST VERSION IS KEPT AND IS STILL TRUE: darkness here has to live in
  // the ALBEDO. Three of the four lights in this view cast no shadow and the IBL casts none,
  // so a cavity is lit exactly as brightly as the room and nothing goes dark by being inside
  // something. That is why the cavity back is painted near-black rather than left to fall
  // off — which is honest anyway, since the inside of a wall has been collecting soot since
  // it was closed up.
  {
    const CAV_Z = WALL_Z - SLAB_T;          // the plane the laths sit against
    keyMat.vertexColors = true;

    // ---- the cavity itself: near-black, and deep enough to be a space rather than a backing
    const voidMat = new THREE.MeshStandardMaterial({
      color: 0x0d0b09, roughness: 0.97, metalness: 0.0,
    });
    const voidPlane = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 3.6), voidMat);
    voidPlane.position.set(HX, HY, CAV_Z - 0.26);
    engine.scene.add(voidPlane);

    // ---- studs. Coarser, greyer, squared timber, and vertical — the one element in the
    // cavity running the other way, which is most of what stops a lath field reading as a
    // stripe pattern. refs/lath-tower-of-london shows how different the two read.
    const studMat = new THREE.MeshStandardMaterial({
      color: 0x554637, roughness: 0.93, metalness: 0.0,
    });
    for (const sx of [HX - 0.86, HX + 0.63]) {
      const st = new THREE.Mesh(roundedBox(0.095, 2.55, 0.075, 0.004, 1), studMat);
      st.position.set(sx, CEIL / 2, CAV_Z - 0.075);
      st.castShadow = st.receiveShadow = true;
      engine.scene.add(st);
    }

    // ---- LATH.
    //
    // Built as its own geometry rather than as a rounded box, because the ENDS are the whole
    // point. A riven lath does not snap square; it fails along the grain and leaves a taper
    // with two or three splinters still attached, and those splinters are what the locked
    // art's break edge is made of.
    //
    // The bar is swept as a rectangular section along x with a per-station scale, so a
    // broken end can thin out over the last few centimetres, and the splinters are separate
    // slivers pushed past it. All of it merges into ONE geometry per side, so the whole lath
    // field costs two draw calls, not thirty.
    const lathParts = { pos: [], nrm: [], col: [] };
    // PER-VERTEX COLOUR, NOT PER-TRIANGLE, and the difference is visible from across the
    // room. With one colour for all three vertices the shading below lands as flat quads, so
    // a board with weathering bands along it renders as a row of hard-edged rectangular
    // blocks — segments of a strap rather than grain in a board. Interpolating between the
    // two stations a quad spans costs nothing and turns the same signal into a gradient.
    const pushTri = (a, b, c, ca, cb, cc) => {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx2 = uy * vz - uz * vy, ny2 = uz * vx - ux * vz, nz2 = ux * vy - uy * vx;
      const L = Math.hypot(nx2, ny2, nz2) || 1;
      nx2 /= L; ny2 /= L; nz2 /= L;
      const cs2 = [ca, cb || ca, cc || ca];
      const ps = [a, b, c];
      for (let i = 0; i < 3; i++) {
        const p = ps[i], q = cs2[i];
        lathParts.pos.push(p[0], p[1], p[2]);
        lathParts.nrm.push(nx2, ny2, nz2);
        lathParts.col.push(q[0], q[1], q[2]);
      }
    };
    /**
     * A swept rectangular bar: stations are [x, halfH, halfD, yOff, zOff, roll].
     *
     * ROLL EXISTS BECAUSE EVERY LATH WAS LIT THE SAME. Riven lath is a flat bar and all of
     * them face the room, so with one key at 22 degrees every face in the field returned
     * within a few percent of the same irradiance and the ONLY thing separating one course
     * from the next was its albedo. That is a texture, not a field of objects, and it is a
     * third of why the round-2 cavity read as a printed pattern.
     *
     * A board that has been torn off its nails does not stay square: it twists about its own
     * length, hardest at the broken end. Rolling the section by up to 46 degrees over the
     * last 380 mm turns the face away from the key at one end and into it at the other, so
     * neighbouring laths now differ by real shading and show their edges. It costs nothing —
     * same vertex count, same draw call.
     */
    //
    // `m`, when given, is a world transform applied to every station point. It is what lets
    // the free boards below be swept in their own local frame — a straight bar along +x —
    // and then placed at any angle in the wall plane and any angle out of it, without a
    // second sweep implementation. Normals are recomputed per triangle from the TRANSFORMED
    // corners in pushTri, so no separate normal matrix is needed.
    //
    // `shade` is an optional per-station, per-face multiplier on the colour. A lath that is
    // one flat tone from end to end is a ribbon whatever else is done to it, and a flat tone
    // is a real part of why the cavity reads as a printed pattern: this geometry carries no
    // texture at all, so every scrap of surface variation it has must come from here.
    const _sv = new THREE.Vector3();
    const sweep = (stations, col, m, shade) => {
      const ring = (s) => {
        const [x, hh, hd, yo, zo, ro] = s;
        const c = Math.cos(ro || 0), si = Math.sin(ro || 0);
        const pt = (dy, dz) => {
          const p = [x, yo + dy * c - dz * si, zo + dy * si + dz * c];
          if (!m) return p;
          _sv.set(p[0], p[1], p[2]).applyMatrix4(m);
          return [_sv.x, _sv.y, _sv.z];
        };
        return [pt(-hh, -hd), pt(hh, -hd), pt(hh, hd), pt(-hh, hd)];
      };
      const tint = (i, k) => {
        if (!shade) return col;
        const f = shade(i / (stations.length - 1), k);
        return [col[0] * f, col[1] * f, col[2] * f];
      };
      let prev = ring(stations[0]);
      // cap the first ring
      pushTri(prev[0], prev[2], prev[1], tint(0, 0)); pushTri(prev[0], prev[3], prev[2], tint(0, 0));
      for (let i = 1; i < stations.length; i++) {
        const cur = ring(stations[i]);
        for (let k = 0; k < 4; k++) {
          const k2 = (k + 1) % 4;
          const cp = tint(i - 1, k), cc = tint(i, k);
          pushTri(prev[k], cur[k], cur[k2], cp, cc, cc);
          pushTri(prev[k], cur[k2], prev[k2], cp, cc, cp);
        }
        prev = cur;
      }
      const cN = tint(stations.length - 1, 0);
      pushTri(prev[0], prev[1], prev[2], cN); pushTri(prev[0], prev[2], prev[3], cN);
    };

    // Weathering bands along a board, and the four faces of its section. See the call site.
    const FACE_K = [0.60, 1.16, 1.00, 0.52];   // back, top, front(room), bottom
    const lathShade = (seed) => (t, k) => {
      const g = (Math.sin(t * 11.3 + seed * 1.7) * 0.50
              + Math.sin(t * 27.1 + seed * 3.9) * 0.28
              + Math.sin(t * 4.3 + seed * 6.1) * 0.62) / 1.40;
      return FACE_K[k] * (0.86 + 0.38 * g);
    };

    // Y IS ACCUMULATED, NOT INDEXED. `y = HY + k * pitch` is what made the barcode: it is a
    // comb, and no amount of per-lath jitter afterwards can hide a constant pitch because
    // the eye reads the AVERAGE spacing. Walking y upward by a randomised gap instead means
    // the pitch itself is the random variable, and two laths can genuinely end up nearly
    // touching or 60 mm apart.
    // AND THE PITCH IS COARSER, BY 1.7x. A critic measured the round-2 field at "2-3x denser
    // and more uniform than the reference photographs", and that was two separate errors
    // reading as one.
    //
    // The uniformity was already being attacked (accumulated y, missing laths, colour
    // spread) and the DENSITY was not being attacked at all. Round 2 ran a 17-31 mm face on
    // a 4-21 mm gap: a 36 mm mean pitch, which is a fine gypsum-era lath, and on a 1.6 m hole
    // that is 45 courses. Both references are coarser and the locked art is coarser still —
    // its laths are riven boards, wide, uneven and chunky, and its hole carries about 20 of
    // them, not 45. Measured off lath-mcminnville-oregon the lath face is about a quarter of
    // the pitch-to-hole ratio ours had.
    //
    // 30-56 mm faces on 8-34 mm gaps is a 62 mm mean pitch — hand-riven lath, which is what
    // a Georgian estate has — and it puts about 20 courses across the hole with the lath
    // face at 11 screen pixels rather than 5.8. Below about 8 px a lath cannot show its own
    // splinters, its tilt, or the black either side of it, so everything averages into a
    // row: that pixel count is the actual subject of the complaint.
    const laths = [];
    let y = 0.06;
    for (let k = 0; k < 64 && y < CEIL - 0.10; k++) {
      const th = 0.030 + h11(k * 6.1 + 0.4) * 0.026;              // 30-56 mm face
      const dep = 0.009 + h11(k * 2.9 + 5.2) * 0.008;             // 9-17 mm thick
      const gap = 0.008 + h11(k * 3.3 + 1.1) * 0.026;             // 8-34 mm key gap
      const yc = y + th / 2;
      y += th + gap;
      if (yc < 0.16 || yc > CEIL - 0.18) continue;
      // 22% of laths are simply gone — pulled out with the plaster. A missing lath leaves a
      // slot two or three times the normal gap, which is the single strongest cue that the
      // spacing is not a pattern.
      if (h11(k * 9.7 + 3.1) < 0.22) continue;
      laths.push({ k, yc, th, dep });
    }

    for (const L of laths) {
      const { k, yc, th, dep } = L;
      // colour drift plank to plank: some laths are pale sapwood, some are near-black with
      // age and damp. One tone for all of them is half of why the field banded.
      // Warm mid-brown, and the SPREAD matters more than the mean: in
      // lath-mcminnville-oregon the laths inside the hole run from a bright sunlit ochre to
      // near-black in two courses, and it is that spread — not the average — that stops the
      // field being a texture. Riven softwood also darkens hard where damp has tracked down
      // a stud, so the low end is meant to be nearly black.
      // BRIGHTER AND GREYER THAN ROUND 3, measured against the locked art rather than
      // guessed. In the art the lath field is the LIGHT thing in the break — bleached, dusty,
      // sunlit boards with black between them — and this build had it the other way round:
      // dark saturated wood against a black cavity, so the whole hole read as one dark mass
      // with pale key blobs floating in it, which is most of what a blind reader is
      // describing when they call it a printed pattern. The spread stays (it is a recorded
      // win); the whole range moves up and desaturates.
      const warm = 0.56 + h11(k * 1.7 + 8.3) * 0.98;
      const col = [0.545 * warm, 0.432 * warm, 0.302 * warm];
      // DEPTH SPREAD x4. Round 2 held every lath within 8 mm of the same plane, which is a
      // fourth way of saying "barcode": with no depth spread there is no parallax between
      // courses, none of them occludes another, and the field is a printed pattern however
      // much its colour and spacing vary. A wall that has lost its plaster has laths still
      // nailed tight, laths sprung off the stud and laths hanging on one nail 30 mm proud of
      // the rest, and 30 mm at this camera is 8 px of relative shift between neighbours.
      const zc = CAV_Z - 0.006 - dep / 2 - h11(k * 7.3) * 0.032;
      // cupping and sag: a lath that has lost its plaster bows
      const tilt = (h11(k * 4.3 + 2.2) - 0.5) * 0.055;
      const sag = (h11(k * 5.9 + 6.6) - 0.5) * 0.020;

      // Where this lath is still whole, and where it has been broken away.
      //
      // TWO INDEPENDENT DRAWS, NOT ONE. Round 2 tested `broke < 0.42` for the left end and
      // `broke > 0.58` for the right against the SAME sample, so the two conditions were
      // mutually exclusive and NOT ONE LATH IN THE WALL WAS BROKEN AT BOTH ENDS. That
      // removes the whole population the references are full of: short floating stubs of
      // lath with black on either side of them, which are most of what makes a broken cage
      // look shattered rather than slotted. It is a one-character class of bug and it cost
      // the field its most identifying member.
      // and the end can land PAST the contour. The hole's mean radius is 1.10 m, so a break
      // that always landed inside 1.10 could never put a lath in front of the surviving
      // plaster — and a splayed lath crossing the intact wall is the locked art's clearest
      // single statement that the cage is in the room rather than behind a window.
      //
      // BUT A LATH BEHIND INTACT PLASTER CANNOT BREAK, AND THIS LOOP LET IT.
      //
      // The lath field is built across the whole 2.6 m of wall, not just the hole, because
      // the hole's contour is a noise field and there is no cheap rectangle that contains
      // it. Every course therefore got a break test — including courses half a metre BELOW
      // the hole, entirely covered by sound plaster. Those broke, bent up to 260 mm into the
      // room, and pushed their splinter fans out through the finish coat: rendered, two
      // gold-brown fans were hovering over blank wall above the skirting, and at this size
      // they read unmistakably as insects stuck to the paint. It is a physical impossibility
      // that looked like a shader artefact.
      //
      // The gate is CLAMP, NOT REJECT, and that distinction is worth a render. Rejecting any
      // break whose point fell outside the contour also threw away most of the breaks that
      // wanted to happen AT the contour — the proposed x is uniform over 1.4 m against a
      // hole radius that varies 0.57-1.63 m, so on a narrow course most draws land outside —
      // and the frame came back with the splayed fan gone. Clamping keeps every course that
      // crosses the hole broken, and puts the break where a real breach puts it: at the lip,
      // with the deeper ones surviving as deep ones.
      //
      // The row is scanned for its own contour crossing rather than assumed from HR, because
      // the contour is three octaves of noise on a lobed ellipse and has no closed form.
      const rowCross = (dir) => {
        for (let i = 1; i <= 110; i++) {
          const xn = HX + dir * i * 0.02;
          if (wallPresent(xn, yc) > 0) return xn;
        }
        return HX + dir * 2.2;
      };
      const openRow = wallPresent(HX, yc) < 0;
      const xL = openRow ? rowCross(-1) : 0;
      const xR = openRow ? rowCross(1) : 0;
      const xaP = HX - (0.18 + h11(k * 5.1) * 1.42);
      const xbP = HX + (0.16 + h11(k * 8.1) * 1.46);
      const brk = (s) => h11(k * 3.7 + 1.3 + s) < 0.62;
      const bL = openRow && brk(0);
      const bR = openRow && brk(17.9);
      const xa = bL ? Math.max(xaP, xL - 0.14) : HX - 1.85;
      const xb = bR ? Math.min(xbP, xR + 0.14) : HX + 1.85;
      const brokenL = xa > HX - 1.8, brokenR = xb < HX + 1.8;

      // ---- LATHS THAT COME OUT OF THE WALL.
      //
      // This is the biggest single thing the round-1 cavity was missing and the reason it
      // could never read as anything but a pattern: EVERY lath lived inside the wall plane.
      // A field of parallel bars all at the same depth behind a hole is a barcode by
      // construction — there is no parallax between them, none of them occludes the plaster
      // face, and not one of them casts a shadow onto anything the eye can use as a
      // reference. Look at the locked art and the dominant silhouette of the whole break is
      // the opposite: snapped laths sticking OUT past the plaster, bent forward, throwing
      // shadows across the intact wall around the hole. That is what makes it read as
      // violence done to a structure rather than as a slotted panel.
      //
      // So a third of the broken ends now bend forward through the wall plane over their
      // last 200-300 mm, up to 90 mm proud of the finish coat. They cast, the wall receives,
      // and the shadows are the depth cue that no amount of colour variation was buying.
      //
      // TWO ANGLES, NOT ONE, AND THE SECOND ONE IS THE FIX.
      //
      // Round 2 bent broken ends out of the wall along +z only, up to 160 mm, and a critic
      // reported that nothing in the frame projected. At 9.8 degrees off the wall normal
      // 160 mm of +z displaces a tip 28 mm sideways, which was under the width of the lath
      // itself, so the protrusion had almost no LATERAL signature to read.
      //
      // MEASURED, AND THE MEASUREMENT CORRECTS THE STORY. `--extra "flat=1"` renders the
      // identical scene with every lath and splinter held in the wall plane, so differencing
      // it against a protruded frame isolates what protrusion contributes. At the round-3
      // camera it moves 1.29% of the frame's pixels and lifts 1.7% of the cavity's area out
      // of black; at the round-2 camera, 0.98% and 1.4%. That is a ratio of 1.3, not the 3.3
      // the tangents predict — because DEPTH ORDER IS NOT PROJECTION. A lath in front of the
      // coat occludes it at any angle, and that half of the read was working in round 2.
      // What obliquity actually buys is the 3.3x on lateral displacement, the parallax
      // between courses at different depths (32 mm of depth spread goes from 1.3 px to
      // 5.5 px of relative shift) and 1.4x on the rim's visible thickness. Worth having, and
      // worth not overclaiming: the biggest single change in this round is the in-plane
      // splay below, which needed no camera move at all.
      //
      // So, the two angles, and the second one is the fix:
      //
      //   `out`    protrusion along +z, into the room. Now up to 260 mm on 68% of broken
      //            ends, and it is what makes a lath OCCLUDE its neighbours and throw a
      //            shadow across the plaster. At 25.5 degrees it is also worth 124 mm of
      //            real lateral silhouette shift.
      //   `swing`  the end's angle IN THE PICTURE PLANE, +-0.55 rad. A comb is a set of
      //            parallel bars; the locked art's break is a set of spikes radiating at
      //            every angle from 0 to about 60 degrees, crossing each other and crossing
      //            the plaster. Swing is worth up to 210 mm of tip displacement — 55 px —
      //            AT ANY CAMERA ANGLE, because it happens entirely in the plane the camera
      //            is looking at. It is the single largest silhouette change in this round
      //            and it needed no camera move at all.
      //
      // With the key raking at 22 degrees from the left and the camera now on the left too,
      // a proud lath is seen on its LIT side against a black cavity and throws its shadow
      // away to the right across the plaster — so the protrusion reads twice.
      const bendOut = (end) => (!flatLath && h11(k * 12.3 + end * 3.9) < 0.68
        ? 0.055 + h11(k * 15.1 + end * 2.7) * 0.205 : 0);
      const outL = brokenL ? bendOut(0) : 0;
      const outR = brokenR ? bendOut(1) : 0;
      const swing = (end) => (h11(k * 41.3 + end * 5.3) - 0.5) * 1.35;
      const swL = brokenL ? swing(0) : 0;
      const swR = brokenR ? swing(1) : 0;
      const twist = (end) => (h11(k * 47.1 + end * 8.7) - 0.5) * 1.6;
      const twL = brokenL ? twist(0) : 0;
      const twR = brokenR ? twist(1) : 0;
      const REACH = 0.38;                       // how far back along the lath the bend runs

      const st = [];
      const N = 30;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const x = xa + (xb - xa) * t;
        // taper the last 60 mm of a broken end away to nothing, irregularly
        let sc = 1;
        if (brokenL) sc = Math.min(sc, Math.min(1, (x - xa) / (0.045 + h11(k * 2.1) * 0.04)));
        if (brokenR) sc = Math.min(sc, Math.min(1, (xb - x) / (0.045 + h11(k * 2.7) * 0.04)));
        sc = 0.14 + 0.86 * sc * (0.86 + 0.28 * h11(k * 11.0 + i * 3.1));
        // quadratic bend, so the lath leaves the wall plane smoothly instead of kinking
        const uL = Math.max(0, 1 - (x - xa) / REACH);
        const uR = Math.max(0, 1 - (xb - x) / REACH);
        const out = outL * uL * uL + outR * uR * uR;
        // The in-plane swing integrates the same quadratic, so a station a third of the way
        // out has turned a ninth of the way — the lath LEAVES straight and curls, which is
        // how a nailed board fails, rather than hinging at a point.
        const rise = (swL * uL * uL + swR * uR * uR) * REACH;
        // a lath that has lost its fixing DROOPS as well as bending out — it is hanging off
        // one nail, and a set of parallel bars that all bend the same way is a louvre
        st.push([x, th * 0.5 * sc, dep * 0.5 * (0.55 + 0.45 * sc),
          yc + Math.sin((x - xa) * 2.1) * sag + (x - HX) * tilt
            + rise + out * (h11(k * 21.7) - 0.72) * 0.55,
          zc + out,
          twL * uL * uL + twR * uR * uR]);
      }
      // WEATHERING ALONG THE BOARD AND ACROSS ITS FACES. The lath mesh carries no texture at
      // all — one merged geometry, one untextured MeshStandardMaterial, vertex colour only —
      // so until this round every lath was a single flat tone from end to end. A flat tone
      // over a 60 px bar IS a printed ribbon; no amount of per-lath colour spread fixes it,
      // because the eye reads the surface, not the population. Two free signals:
      //   ALONG the board, three incommensurate sine bands = damp streaks and sun-bleaching
      //   ACROSS it, the four faces of the section differ by construction — the room-facing
      //   face is weathered pale, the top face catches the raking key, the underside and the
      //   cavity-facing back are in permanent shade.
      // Face order out of `ring` is [back(-z), top(+y), front(+z), bottom(-y)].
      sweep(st, col, null, lathShade(k));

      // SPLINTERS — the silhouette of the whole break in the locked art, and a fan rather
      // than a fringe.
      //
      // Round 2 gave each broken end two or three, up to 185 mm, deflected 40 mm in y and
      // 85 mm in z. Every one of them therefore left the lath along the lath's own axis and
      // came back to within a couple of degrees of it, so what they added was a slightly
      // frayed end rather than a spray. The locked art's spikes leave the wood at every
      // angle up to about 60 degrees and are as long as a hand — they are the reason the
      // break reads as violence rather than as joinery.
      //
      // So each end now grows 3-6 of them at up to 330 mm, each with its OWN in-plane angle,
      // and they start from the real tip of the swung, protruded lath rather than from the
      // lath's unbent centreline. (Round 2 started them at `yc` and `zc + out`, i.e. at
      // where the lath would have been if it had not moved; with the bigger protrusion and
      // the new swing that would have left every splinter floating in the cavity, detached
      // from the wood it is supposed to be torn from.)
      //
      // ROUND 4 CUTS THIS BACK HARD, and the reason is worth recording because it is the
      // exact opposite of the round-3 note above. Three to six spikes per end at up to 330 mm
      // and 2-6 mm across is not a splintered board — at this camera it is a stalk. Rendered
      // with the free-board fan in the same frame the difference was unmistakable: the fan
      // read as broken wood and these read as WHEAT, a pale straw fringe standing off every
      // course. The reference photographs have splinters attached to a taper, a few
      // centimetres long and as thick as the board is deep. Fewer, shorter, thicker.
      const splinter = (x0, dir, zBase, yBase) => {
        const n = 1 + Math.floor(h11(k * 13.1 + x0) * 2.4);
        for (let s = 0; s < n; s++) {
          const len = 0.030 + h11(k * 17.3 + s * 4.1) * 0.095;
          const w = 0.0026 + h11(k * 19.7 + s * 2.3) * 0.0052;
          const yo = yBase + (h11(k * 23.1 + s * 5.7) - 0.5) * th * 0.85;
          const zo = zBase + (h11(k * 29.3 + s * 3.3) - 0.5) * dep * 0.9;
          // its own angle in the picture plane, and its own lift out of the wall
          const fan = (h11(k * 43.9 + s * 6.1) - 0.5) * 1.45;
          const outz = flatLath ? 0 : (0.10 + h11(k * 31.1 + s * 7.1) * 0.90) * 0.145;
          const sp = [];
          for (let i = 0; i <= 4; i++) {
            const t = i / 4;
            sp.push([x0 + dir * len * t * Math.cos(fan * t),
              w * (1 - t * 0.94), w * (1 - t * 0.94),
              yo + len * Math.sin(fan * t) * t,
              zo + outz * t * t]);
          }
          sweep(sp, [col[0] * 1.30, col[1] * 1.26, col[2] * 1.18]);
        }
      };
      // AND ONLY WHERE THE END IS ACTUALLY VISIBLE. A splinter lifts out of the wall by up to
      // 145 mm on its own, so on a lath whose broken end stopped BEHIND surviving plaster —
      // which the longer reach above now allows — the lath stayed hidden and its splinters
      // came forward through the finish coat anyway. Rendered, that is two or three gold
      // spikes stuck to a blank stretch of wall half a metre from the hole with nothing
      // attached to them; they read as insects. Draw them only if the end is inside the hole
      // or already proud of the coat.
      const endShows = (s) => wallPresent(s[0], s[3]) < 0 || s[4] + dep * 0.5 > WALL_Z;
      if (brokenL && endShows(st[0])) splinter(st[0][0], -1, st[0][4], st[0][3]);
      if (brokenR && endShows(st[N])) splinter(st[N][0], 1, st[N][4], st[N][3]);
    }

    // ---- THE OTHER SIDE OF THE WALL ------------------------------------------------------
    //
    // A partition is lathed on BOTH faces. Everything above builds the near leaf and then
    // paints the space behind it flat near-black, so through every gap in the lath field the
    // eye finds one uniform tone at one unknowable distance — and a row of lit bars in front
    // of a single flat tone is a barcode by construction, whatever the bars do. That is the
    // half of "reads as a flat printed pattern" that the free boards do not touch: they fix
    // what is in front of the plane, and this fixes the fact that there was no space behind
    // it. In the locked art you can see past the near laths to darker structure at a
    // different depth, and that parallax is most of why its break reads as a cavity rather
    // than as a black shape.
    //
    // So: the far leaf, 105 mm back (a stud is 100 mm), on its own pitch so the two fields
    // never line up, and dark — it faces away from every light in the rig and is seen edge-on
    // through a slot. Four stations and no splinters, because nothing here is ever seen
    // whole; it exists to be a depth, not a detail. About 30k triangles and no draw call, on
    // the merged mesh with everything else.
    {
      let yb = 0.02 + h11(91.3) * 0.05;
      for (let k = 0; k < 64 && yb < CEIL - 0.06; k++) {
        const th = 0.028 + h11(k * 5.7 + 61.1) * 0.030;
        const gap = 0.010 + h11(k * 4.1 + 67.3) * 0.030;
        const yc = yb + th / 2;
        yb += th + gap;
        if (h11(k * 8.3 + 71.9) < 0.18) continue;
        const zc = CAV_Z - 0.105 - h11(k * 3.7 + 73.1) * 0.018;
        const dim = 0.30 + h11(k * 6.7 + 79.3) * 0.16;
        const col = [0.545 * dim, 0.432 * dim, 0.302 * dim];
        const st2 = [];
        for (let i = 0; i <= 4; i++) {
          const x = HX - 2.0 + i * 1.0;
          st2.push([x, th * 0.5, 0.006, yc + Math.sin(x * 1.7 + k) * 0.010, zc, 0]);
        }
        sweep(st2, col, null, lathShade(k + 50));
      }
    }

    // ---- and a pipe, which is the one vertical thing in the art's cavity that is not timber
    // and the reason its breach reads as the inside of a BUILDING. Lead, dulled green-grey,
    // running the full height behind the near leaf so it is crossed by every course.
    {
      const pipe = new THREE.Mesh(
        new THREE.CylinderGeometry(0.017, 0.017, CEIL - 0.05, 10, 1),
        new THREE.MeshStandardMaterial({ color: 0x2f3830, roughness: 0.62, metalness: 0.55 }));
      pipe.position.set(HX + 0.19, CEIL / 2, CAV_Z - 0.062);
      pipe.rotation.z = 0.018;
      pipe.castShadow = pipe.receiveShadow = true;
      engine.scene.add(pipe);
    }

    // =====================================================================================
    // FREE BOARDS — the round-4 rebuild, and the reason this round is not round 3 again.
    //
    // WHAT WAS ACTUALLY WRONG. Every board in the frame, for three rounds, was a COURSE: a
    // horizontal bar nailed across the studs, allowed to bend forward at a broken end. The
    // header above works out what that construction can and cannot show — a horizontal board
    // pushed out of a wall, seen from a camera roughly level with it, slides along its own
    // axis in the image and the picture does not change. Two rounds took the protrusion from
    // 160 mm to 260 mm inside that construction and the frame did not move.
    //
    // WHAT THE LOCKED ART ACTUALLY SHOWS, looked at properly. Its break is not a comb with
    // bent ends. Its foreground is a handful of boards that have STOPPED BEING COURSES:
    //
    //   * boards snapped off their nails and swung far out of horizontal — some near
    //     vertical — so they cross five or ten courses at once and cannot be read as part
    //     of the pattern
    //   * boards leaning out of the cavity and lying ACROSS the surviving plaster, so their
    //     silhouette is dark wood over lit wall rather than dark wood over black hole
    //   * boards pointing more or less at the lens, seen as a short foreshortened stub with
    //     its end grain toward you
    //   * boards that came out of the wall altogether and are propped against it or bridging
    //     down to the floor
    //
    // Every one of those beats the projection problem for a different reason. A board at 70
    // deg in the wall plane gets 4x the across-axis displacement of a course from the same
    // protrusion (0.41 against 0.10 per mm — see the header table). A board lying over the
    // PLASTER reads at 100%, because the pixels it covers were pale and are now dark, and
    // the pixels its shadow covers were pale and are now half as bright. A board crossing
    // the contour is the one thing the whole piece has never had: a silhouette that says the
    // cage is in the room and not behind a window.
    //
    // THE CONTACT SHADOWS ARE HALF THE VALUE AND THEY ARE FREE. The key rakes in at 27.5 deg
    // above the wall, so a board standing 250 mm proud throws its shadow 476 mm down-right
    // across the lit plaster. That shadow is a third of a hole-width long, it is unambiguous
    // depth information, and it cannot exist without protrusion — which is exactly why it is
    // the acceptance test's best evidence and not just its best-looking part.
    //
    // UNDER `flat=1` every one of these collapses into the cavity plane: the pitch goes to
    // zero and so does the standoff, so each board keeps its length, its colour and its
    // in-plane angle and loses only its depth. The ones lying over the plaster end up BEHIND
    // it and are clipped; the shadows go. That is the honest A/B, and it is a large one.
    // =====================================================================================
    {
      // ax, ay  the end still in the wall, in wall coordinates
      // dep     how far behind the cavity plane that end sits; NEGATIVE = already in the room
      // len     board length
      // tilt    angle in the wall plane, degrees, + = the free end rises
      // pitch   angle out of the wall plane, degrees, + = the free end comes toward the room
      // hw, hd  half-width and half-depth of the riven section
      // tone    colour multiplier; a board that has been out in the light is paler
      //
      // THE MIX MATTERS AND THE FIRST ATTEMPT GOT IT BACKWARDS. That version was ten LONG
      // spars, 0.8-1.8 m each, and rendered it read as a handful of sticks leaned against a
      // wall — the boards were so long that each one crossed most of the frame, so they
      // stopped being part of the break and became furniture in front of it. Look again at
      // what the art is mostly made of: the dominant population is SHORT PROUD LATH ENDS,
      // dozens of them, 150-400 mm of board jutting past the plaster edge in a fan, with two
      // or three genuinely long boards among them. So the long ones come down to four, and
      // the fan is generated below.
      const FREE = [
        // ax     ay    dep    len   tilt   pitch   hw     hd     tone  seed
        [1.62, 1.80, 0.06, 0.98, -30, 15, 0.026, 0.0085, 1.16, 3.1], // spar over the right rim
        [0.78, 0.62, 0.05, 1.24, 72, 15, 0.023, 0.0080, 0.92, 7.7], // the riser: 12 courses at once
        [0.52, 1.02, 0.03, 1.18, -52, 32, 0.029, 0.0105, 1.05, 11.3], // bridges the hole to the floor
        [1.42, 1.12, 0.05, 0.46, 197, 55, 0.026, 0.0095, 1.22, 19.1], // pointing at the lens
        [0.16, 0.74, -0.26, 0.66, -58, 20, 0.030, 0.0110, 1.24, 31.9], // propped on intact wall, left
      ];

      // ---- THE FAN. Short lath ends jutting past the break contour, which is the locked
      // art's single most repeated shape and the one the piece has never had. Each one is
      // anchored inside the contour, crosses it in front of the finish coat, and finishes
      // 60-260 mm clear of the lit plaster and 90-300 mm proud of it — so it covers pale
      // pixels with dark wood and drops a hard contact shadow beside itself.
      //
      // IT IS A ROW SET, NOT A STARBURST, and the first attempt got that wrong in a way that
      // is obvious once rendered and not before. That version walked a ray outward at 34
      // evenly spaced ANGLES round the hole and pointed each board along its own radius, so
      // boards at the top pointed up, boards at the bottom pointed down, and the break came
      // back as a bird's nest — a radially symmetric burst of sticks with the hole somewhere
      // behind it. Nothing in a real wall does that. A lath is nailed HORIZONTALLY across the
      // studs; the only place a lath end can exist is where the breach has cut a course, so
      // proud ends occur at the LEFT AND RIGHT FLANKS of the hole and point left and right.
      // The top and bottom of a breach have almost none, which is exactly what the reference
      // shows: its top margin is thick crusty coat, not spikes.
      //
      // So this walks the same rows the lath field walks, finds where each row crosses the
      // contour (the contour is three octaves of noise on a lobed ellipse and has no closed
      // form, so it is scanned), and hangs a broken end off it. Which flank, and whether at
      // all, is drawn per row.
      const NF = 17;
      for (let i = 0; i < NF; i++) {
        const fy = HY + ((i / (NF - 1)) * 2 - 1) * 1.02 * (HR / 1.30)
                 + (h11(i * 2.3) - 0.5) * 0.055;
        if (fy < 0.26 || fy > CEIL - 0.32) continue;
        if (wallPresent(HX, fy) > 0) continue;              // the breach misses this row
        for (const side of [-1, 1]) {
          if (h11(i * 19.3 + (side + 2) * 7.7) < 0.32) continue;   // not every flank
          let xc = null;
          for (let s = 1; s <= 130; s++) {
            const xn = HX + side * s * 0.02;
            if (wallPresent(xn, fy) > 0) { xc = xn; break; }
          }
          if (xc === null) continue;
          const q = i * 3.1 + (side + 2) * 11.9;
          // HOW FAR INSIDE THE LIP THE ANCHOR SITS IS A GATE, and getting it wrong cost a
          // render. With the anchor only 50 mm inside and a shallow pitch, a board spends its
          // first third BEHIND the surviving plaster, then emerges through the finish coat —
          // so what draws is the outer half of a board with nothing attached to it, a tan
          // sliver floating on blank wall. That is the "insects stuck to the paint" failure
          // recorded further up this file, arrived at from the other direction. Two
          // conditions fix it: the anchor goes at least 200 mm inside the contour so a real
          // length of board is seen against the black cavity first, and the board must be
          // proud of the finish coat BY THE TIME IT REACHES THE LIP.
          const back = 0.20 + h11(q * 1.7) * 0.42;
          const ax = xc - side * back;
          const tiltD = (side > 0 ? 0 : 180) + (h11(q * 2.9) - 0.5) * 62 * side;
          const len = back + 0.09 + h11(q * 3.7) * 0.36;
          const dep = 0.004 + h11(q * 5.3) * 0.026;
          const need = (SLAB_T + dep + 0.010) / back;    // rise/run to clear the coat at the lip
          const pitchD = Math.atan(Math.max(need, 0.16 + h11(q * 7.1) * 0.52)) * 180 / Math.PI;
          if (pitchD > 58) continue;                     // would stand out of the wall, not off it
          FREE.push([ax, fy + (h11(q * 8.9) - 0.5) * 0.05, dep, len, tiltD, pitchD,
            0.017 + h11(q * 11.3) * 0.015, 0.0055 + h11(q * 13.1) * 0.006,
            0.78 + h11(q * 15.7) * 0.62, 40 + q]);
        }
      }

      for (const [ax, ay, dep, len, tiltD, pitchD, hw, hd, tone, sd] of FREE) {
        // `flat` removes the two depth terms and nothing else. A board with dep < 0 is
        // already out in the room, so flattening it puts it back in the cavity plane, where
        // the surviving plaster hides it — which is the point.
        const pitch = flatLath ? 0 : pitchD * Math.PI / 180;
        const z0 = CAV_Z - (flatLath ? 0.004 : dep);
        const tilt = tiltD * Math.PI / 180;
        const m = new THREE.Matrix4().makeTranslation(ax, ay, z0)
          .multiply(new THREE.Matrix4().makeRotationZ(tilt))
          .multiply(new THREE.Matrix4().makeRotationY(-pitch));

        // Riven, not sawn: the section wanders, the board cups, and the free end tapers to a
        // chisel over the last 70-110 mm rather than stopping square. A square end is the
        // single loudest "this is a box" cue on a board this size in frame.
        // Grey-brown weathered softwood, not new pine. The first pass ran the same warm
        // 0.55/0.405/0.250 the buried courses use and, out in the key where these boards
        // live, that came back a strong orange — the reference's exposed lath is bleached and
        // dusty, a good deal greyer than the wood still inside the wall.
        const warm = 0.66 + h11(sd * 1.7) * 0.46;
        const col = [0.500 * warm * tone, 0.412 * warm * tone, 0.298 * warm * tone];
        // A RIVEN BOARD DOES NOT END IN A POINT. The first pass tapered both ends over
        // 70-110 mm and every board rendered as a leaf — a lens with two spikes on it, which
        // is what the taper produces when it runs over a fifth of the length at each end. A
        // lath splits along the grain and SNAPS across it, so the end is a short ragged wedge
        // that keeps most of its width, and the buried end is not tapered at all because it
        // is still in the wall.
        const taper = 0.030 + h11(sd * 2.3) * 0.032;
        const NB = 22;
        const stb = [];
        for (let i = 0; i <= NB; i++) {
          const t = i / NB;
          const x = len * t;
          let sc = 0.34 + 0.66 * Math.min(1, (len - x) / taper);
          sc *= 0.86 + 0.28 * h11(sd * 3.1 + i * 2.7);       // riven, so the edge wanders
          // cup and sag along the length, and a slow twist — a board off its nails does both
          const bow = Math.sin(t * Math.PI) * (h11(sd * 5.3) - 0.45) * 0.055;
          stb.push([x, hw * sc, hd * (0.6 + 0.4 * sc), bow,
            Math.sin(t * 3.7 + sd) * 0.006, (h11(sd * 7.1) - 0.5) * 1.1 * t]);
        }
        sweep(stb, col, m, lathShade(sd));

        // splinters off the chisel end, in the board's own frame so they inherit the pose
        const ns = 1 + Math.floor(h11(sd * 4.7) * 2.6);
        for (let s = 0; s < ns; s++) {
          const sl = 0.030 + h11(sd * 6.1 + s * 3.3) * 0.075;
          const w = 0.0030 + h11(sd * 8.3 + s * 1.9) * 0.0050;
          const yo = (h11(sd * 9.7 + s * 5.1) - 0.5) * hw * 1.7;
          const zo = (h11(sd * 11.9 + s * 2.9) - 0.5) * hd * 1.6;
          const fan = (h11(sd * 13.1 + s * 4.3) - 0.5) * 1.3;
          const sp = [];
          for (let i = 0; i <= 4; i++) {
            const t = i / 4;
            sp.push([len - taper * 0.4 + sl * t * Math.cos(fan * t),
              w * (1 - t * 0.95), w * (1 - t * 0.95),
              yo + sl * Math.sin(fan * t) * t, zo]);
          }
          sweep(sp, [col[0] * 1.24, col[1] * 1.20, col[2] * 1.12], m);
        }
      }
    }

    {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(lathParts.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(lathParts.nrm, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(lathParts.col, 3));
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
        color: 0xffffff, vertexColors: true, roughness: 0.90, metalness: 0.0,
      }));
      m.castShadow = m.receiveShadow = true;
      engine.scene.add(m);
    }

    // ---- THE KEYS.
    //
    // This is the detail the whole cavity exists to show, and the reason the first version
    // failed is that it was a texture on a plane behind an occluder. A key is a THREE-
    // DIMENSIONAL thing: the plasterer pushed the coat hard enough that it extruded through
    // the 4-20 mm gap between two laths and flopped over the back, and when the face broke
    // off, that sausage of plaster stayed hanging in the gap.
    //
    // So each gap gets a lofted half-round bead that fills the slot, bulges INTO the cavity
    // and slumps downward over the lath below — and, critically, its fullness varies along
    // the run and drops to nothing over long stretches, because the pressure did. A key that
    // ran evenly along every gap would be a barcode with rounded bars.
    //
    // Pale, and mapped on the same break tile as the rest of the plaster in the piece, so a
    // critic reading it sees the SAME material squeezed through a gap rather than a third
    // substance invented for the cavity.
    {
      const kp = { pos: [], uv: [], idx: [], col: [] };
      const addKeyRun = (y0, y1, xs, xe, seed) => {
        const runTone = 0.78 + h11(seed * 4.3 + 1.9) * 0.50;
        const NX = Math.max(6, Math.round((xe - xs) / 0.016));
        const NA = 4;
        const rows = [];
        for (let i = 0; i <= NX; i++) {
          const x = xs + (xe - xs) * (i / NX);
          // pressure along the run: patchy, and absent more often than present
          // LONG COHERENT RUNS, TAPERED AT BOTH ENDS. At 5.6 cycles per metre the pressure
          // field turned on and off every 90 mm, so the run was chopped into stubs and each
          // stub's `live` gate cut it off square — the render came back with a scatter of
          // flat grey rectangles hanging in the gaps, which reads as tape stuck to the lath.
          // A plasterer works a wall in long passes, so the pressure varies over half a
          // metre or more, and the ends of a key thin out rather than stopping.
          // COVERAGE IS THE WHOLE BALANCE HERE and it has failed in both directions. Too
          // patchy and the runs get chopped into stubs whose `live` gate cuts them off
          // square, which renders as flat grey rectangles taped to the lath. Too generous —
          // f * 1.5 + 0.62, which put a key in 95% of every gap — and the cavity fills with
          // one pale material, the laths disappear behind it and the hole becomes a
          // different uniform surface instead of a barcode. About half the length of about
          // half the gaps is what the photographs show.
          // TWO SCALES OF PRESSURE, BECAUSE A KEY HAS TO BE A BLOB.
          //
          // A critic looked for these at every crop distance and reported that "plaster-key
          // beads do not read as distinct blobs at any distance". Round 2 modulated the run
          // on ONE band at 2.6 cycles/m — a 380 mm wavelength — so where a key existed it
          // existed continuously for most of a metre, tapering at each end. That is a fillet
          // running along the gap, and a fillet is exactly as much of a stripe as the gap it
          // fills: it cannot break a barcode because it IS one.
          //
          // What the photographs show is a run of separate lumps 80-250 mm long with bare
          // gap between them, because the plasterer's pressure varied at the scale of a
          // trowel stroke on top of the scale of a pass. So a 7.5 cycles/m band is added,
          // and the sum is stretched so it crosses zero often: about half the length of
          // about half the gaps carries a key, in pieces.
          const fLow = fbmS(x * 2.2 + seed, seed * 0.7, 131, 3);
          const fMid = fbmS(x * 7.5 + seed * 2.3, seed * 1.9, 133, 2);
          const full = Math.max(0, Math.min(1.0, (fLow * 1.15 + fMid * 0.85) - 0.40));
          // THE BEAD BULGES TOWARD THE ROOM, NOT AWAY FROM IT, and getting that backwards
          // is worth a paragraph because the first attempt did and it cost a render. The
          // plaster was squeezed BACKWARD through the gap, so the instinct is to bow the
          // surface away from the camera — which builds a concave dish recessed inside the
          // slot, facing nothing, lit by nothing, and indistinguishable from the black
          // cavity. What is actually LEFT after the face breaks off is the stub of that
          // extrusion, fractured roughly level with the back of the coat and mushroomed over
          // the lath either side of the gap. So it stands PROUD, and standing proud is the
          // entire reason it catches the raking key and reads as a pale blob instead of as
          // more shadow.
          // LUMPY ALONG ITS LENGTH, AND HANGING IN PLACES. A key of constant section is a
          // length of pipe; what the photographs show is a sausage that swelled where the
          // plasterer leant on it and sagged into a drip where it had somewhere to go. The
          // 60 mm lump term is what gives it that, and the hang is what the critic is asking
          // for with "dangling plaster keys" — in places the slump reaches 34 mm, well below
          // the lath it squeezed past.
          const lump = 0.55 + 0.75 * (fbmS(x * 16 + seed * 3, seed, 137, 2) * 0.5 + 0.5);
          // 26 mm proud, and hanging 26 mm rather than 42. The proud figure is set by what it
          // has to clear: the front face of the nearest lath is 6-38 mm in front of the key's
          // base, so 26 mm puts a full key level with or past most of the wood beside it and
          // it occludes rather than sitting flush in a slot.
          //
          // THE SLUMP WAS THE ONE THAT WENT WRONG. It was taken to 65 mm on the argument that
          // exceeding the 62 mm lath pitch would make a key cross the course below and break
          // the row. It does — by covering it. Rendered, the cavity came back as a stack of
          // pale ribbons about 110 mm tall (a 46 mm bead plus 65 mm of hang) on a 62 mm
          // pitch, i.e. the keys tiled over the lath field and inverted the barcode instead
          // of breaking it. A key has to be SMALLER than the thing it interrupts.
          const bulge = Math.min(1, full) * lump * (0.009 + h21(i, seed, 3) * 0.017);
          const hang = Math.max(0, fbmS(x * 3.7 + seed * 5, seed * 1.3, 139, 2));
          const slump = Math.min(1, full) * (0.006 + hang * hang * 0.020);
          // THE HEIGHT HAS TO TAPER WITH THE PRESSURE, AND IT DID NOT.
          //
          // `full` scaled the bulge and the slump but NOT `hh`, so wherever the pressure
          // field was weak the bead still spanned the whole gap in y while standing zero mm
          // proud — a flat ribbon lying in the plane of the slot, with the `live` gate
          // chopping each end off square. Rendered, that is a scatter of flat pale
          // rectangles with hard square ends stuck along the lath, which is precisely the
          // "tape stuck to the lath" failure recorded two paragraphs above and thought to be
          // fixed. It was fixed for the PRESSURE FIELD and never for the section.
          //
          // Scaling the half-height by the same factor makes a key taper to nothing in all
          // three dimensions at once, which is what turns a ribbon into a lump.
          const grow = Math.min(1, full * 1.7);
          const row = [];
          for (let a = 0; a <= NA; a++) {
            const th2 = (a / NA) * Math.PI;
            // 1.45 x the gap. Round 2 used 1.15, which mushrooms over the back of the lath
            // but stops short of its FRONT face — so from in front of the wall the key was
            // exactly as wide as the slot it filled and its outline was the slot's outline.
            // A blob has to be wider than its hole to read as a blob.
            const yc2 = (y0 + y1) * 0.5, hh = (y1 - y0) * 0.5 * 1.35 * grow;
            row.push([
              x,
              yc2 + hh * Math.cos(th2) - slump * (1 - Math.cos(th2)) * 0.5,
              CAV_Z - 0.002 + bulge * Math.sin(th2),
            ]);
          }
          // and nothing is generated where the plaster face still covers it — a key behind
          // an intact wall is invisible geometry, and at 40 gaps across 2 m that is most of
          // what this loop would otherwise emit
          rows.push({ row, live: grow > 0.05 && wallPresent(x, (y0 + y1) * 0.5) < 0.03 });
        }
        for (let i = 0; i < NX; i++) {
          if (!rows[i].live || !rows[i + 1].live) continue;
          for (let a = 0; a < NA; a++) {
            const base = kp.pos.length / 3;
            const q = [rows[i].row[a], rows[i].row[a + 1],
              rows[i + 1].row[a + 1], rows[i + 1].row[a]];
            for (const p of q) {
              kp.pos.push(p[0], p[1], p[2]);
              kp.uv.push(p[0] / BREAK_TILE, p[1] / BREAK_TILE);
              // the deepest part of the key never saw daylight and is filthy
              // PALE, and warm. The reference index's four separated values put plaster as
              // the lightest thing in a broken wall and the cavity as the darkest; a key
              // that comes out mid-grey has swapped itself for the lath.
              // BRIGHTER THAN THE WOOD BY A CLEAR MARGIN. Three of the four lights here cast
              // no shadow and the IBL casts none, so nothing inside the cavity goes dark by
              // being inside it — tone in there has to be authored. Round 2's 0.66-1.10 on a
              // 0.61 tint put the key at 0.40-0.67 albedo against laths running 0.25-0.53:
              // overlapping ranges, so a key landed on a pale lath was invisible. 0.85-1.35
              // puts it at 0.52-0.83, clear of every lath in the field.
              // AND THEN TOO FAR THE OTHER WAY. That reasoning is right and the number it
              // produced was not: 0.85-1.35 on a 0.61 tint puts a key at 0.52-0.83 albedo,
              // which under this rig renders near-white — and cropped in close the cavity
              // read as a field of pale ceramic capsules with the lath somewhere behind
              // them, the keys having become the loudest thing in the break instead of a
              // detail in it. In the reference photographs a key is a dirty grey-white lump
              // a little lighter than the wood beside it, never a highlight. It also has to
              // stop being uniform: `runTone` gives each gap its own value, so a run can be
              // filthy while the next one along is fresh-broken.
              const lit = (0.56 + 0.34 * Math.sin((a / NA) * Math.PI)) * runTone;
              kp.col.push(lit, lit * 0.97, lit * 0.93);
            }
            kp.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
          }
        }
      };
      for (let i = 0; i + 1 < laths.length; i++) {
        const a = laths[i], b = laths[i + 1];
        const y0 = a.yc + a.th / 2, y1 = b.yc - b.th / 2;
        if (y1 - y0 < 0.002) continue;
        // A KEY CANNOT EXIST IN A SLOT WIDER THAN A KEY GAP, and this loop was quietly
        // putting one in every slot in the wall. `laths` has 22% of its courses removed, so
        // consecutive entries are often 100-160 mm apart — and this ran addKeyRun across
        // that whole span, filling the exact slots that are supposed to be the black holes
        // in the field with a slab of pale plaster 1.45 times as tall again. Rendered, the
        // cavity came back as a stack of white ribbons with the lath lost behind them: the
        // barcode inverted rather than broken.
        //
        // Physically the gate is obvious once stated. Plaster keys because it is forced
        // through a gap narrow enough to grip; past about 40 mm it simply falls through into
        // the cavity, which is why the references show bare lath edges and blackness in the
        // wide slots and beads only in the tight ones.
        if (y1 - y0 > 0.042) continue;
        addKeyRun(y0, y1, HX - 1.75, HX + 1.75, i * 1.31 + 2.0);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(kp.pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(kp.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(kp.col, 3));
      g.setIndex(kp.idx);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, keyMat);
      m.castShadow = m.receiveShadow = true;
      engine.scene.add(m);
    }

    // ---- plaster still clinging to the front of the laths at the margin of the break.
    // In the locked art the top of the lath field is thick with crusty coat that has not let
    // go yet, and it is what stops the transition from wall to lath being a single hard
    // contour. Instanced lumps, one draw call, clustered on the inside of the break edge.
    //
    // ROUND 4: THEY WERE NEVER ON SCREEN. Every one of these was placed at `CAV_Z + 0.004`,
    // which is 41 mm BEHIND the wall's finished face, and they are 9-35 mm across — so the
    // entire population lived inside the cavity, hidden behind the very lip it was supposed
    // to be crumbling off. Three rounds of tuning their size, tone and band went into
    // geometry that could not be seen. That is the fourth instance in this file of authored
    // detail scaled or placed into nonexistence, and like the others it was not findable by
    // reading the code — the numbers all look reasonable until you write down where the wall
    // face is.
    //
    // Now they STRADDLE the face: from 18 mm behind it to 26 mm proud, in a band running 60
    // mm outside the contour to 190 mm inside, and half again as large. Proud is the whole
    // point — a flake lying in the wall plane is part of the wall, and a flake standing 20 mm
    // off it under a key raking at 27 deg throws a 39 mm shadow and becomes an object. They
    // are still FLAT (0.30 of their width in thickness) because the recorded failure in the
    // other direction is real: run them fat and the hole gets a ring of grey boulders round
    // it, which was once the worst thing in the frame.
    //
    // Under `flat=1` the proud offset goes with everything else — see the note on the free
    // boards. The A/B has to isolate depth, not depth-plus-whatever-else-changed.
    {
      const NC = 300;
      // SUBDIVISION 0, NOT 1, AND THAT IS A SHAPE DECISION RATHER THAN A BUDGET ONE. A
      // once-subdivided icosahedron flattened to a plate is a smooth DISC, and a disc reads
      // as a pebble however thin it is — which is what the first pass off the wall face gave:
      // a ring of pale eggs. The 20-face solid flattens into an angular fractured plate with
      // straight edges and corners, which is what a sheet of lime plaster snaps into, and it
      // costs a third of the triangles.
      const gc = new THREE.IcosahedronGeometry(1, 0);
      const cl = new THREE.InstancedMesh(gc, breakMat, NC);
      const mtx2 = new THREE.Matrix4();
      const q2 = new THREE.Quaternion();
      const e2 = new THREE.Euler();
      let n = 0;
      for (let i = 0; i < 2600 && n < NC; i++) {
        const ax = HX + (h11(i * 2.7 + 0.3) - 0.5) * 3.8;
        const ay = HY + (h11(i * 4.9 + 1.7) - 0.5) * 3.4;
        const f = wallPresent(ax, ay);
        // HUGGING THE CONTOUR, not scattered through the cavity. The first pass allowed
        // these anywhere from 75 to 260 mm inside the hole and at up to 55 mm across, and
        // they read as a handful of grey pebbles floating in a black void — objects in the
        // hole rather than the last of the coat refusing to come off the lath. A 20-90 mm
        // band immediately inside the contour, flatter, smaller and warmer, puts them where
        // the photographs put them: welded to the lip.
        // STRADDLING the contour, from 25 mm outside it to 110 mm inside. In the locked art
        // the top of the break is a thick crusty fringe of coat that has not let go yet, and
        // it laps OVER the surviving plaster as well as hanging on the lath behind — a band
        // that stops dead at the contour reads as a cut line with decoration on one side.
        // STRADDLING the contour, and FLAT. In the locked art the top of the break is a
        // crusty fringe of coat that has not let go yet, lapping over the surviving plaster
        // as well as hanging on the lath behind — a band that stops dead at the contour
        // reads as a cut line with decoration on one side.
        //
        // BUT IT IS A LIP, NOT A ROCKERY. The pass before this one ran them to 64 mm with a
        // half-depth of 32 mm and pushed them 16 mm proud of the finish coat, and they
        // rendered as a ring of grey boulders glued round the hole — the single worst thing
        // in that frame. Crumbling plaster is thin, it is the same pale warm material as the
        // wall it came off, and it lies IN the plane rather than on top of it.
        if (f > 0.052 || f < -0.115) continue;
        // A FLAKE IS A PLATE, NOT A PEBBLE, and the first pass off the wall face proved it.
        // An icosahedron scaled (1.9, 1.2, 0.30) is a flattened BALL: rendered proud of the
        // wall in a band round the contour it came back as a string of pale eggs glued round
        // the hole — the "ring of grey boulders" failure this comment already warns about,
        // reproduced by making them visible for the first time rather than by making them
        // bigger. Broken lime plaster spalls in SHEETS a few millimetres thick and a hand
        // across. 0.13 of the width in thickness and half again as wide is a plate, and
        // plates overlap each other into a crust instead of beading along the lip.
        const sc = 0.016 + h11(i * 8.3) * h11(i * 3.7) * 0.052;
        e2.set((h11(i * 2.2) - 0.5) * 0.42, (h11(i * 4.4) - 0.5) * 0.42, h11(i * 6.6) * 3.1);
        q2.setFromEuler(e2);
        // deepest inside the hole they hang off the back of the lath; out over the surviving
        // coat they are the last crust still stuck to the wall, so the proud offset falls off
        // with distance inside rather than being uniform
        const prd = flatLath ? 0
          : (0.024 - 0.019 * Math.min(1, Math.max(0, -f / 0.115))) * (0.45 + h11(i * 9.9));
        mtx2.compose(
          new THREE.Vector3(ax, ay, WALL_Z - 0.014 + prd),
          q2, new THREE.Vector3(sc * 2.6, sc * 1.65, sc * 0.13));
        cl.setMatrixAt(n, mtx2);
        // AND IT IS THE SAME WALL, so it cannot be brighter than the wall. At 0.78-1.20 on
        // breakMat's 0.70 tint every flake outshone the finish coat it came off and the lip
        // read as a decoration applied to the hole. Crust is the wall, dustier.
        const d = 0.54 + h11(i * 13.7) * 0.34;
        cl.setColorAt(n, new THREE.Color(d, d * 0.968, d * 0.918));
        n++;
      }
      cl.count = n;
      cl.instanceMatrix.needsUpdate = true;
      if (cl.instanceColor) cl.instanceColor.needsUpdate = true;
      cl.castShadow = cl.receiveShadow = true;
      engine.scene.add(cl);
    }
  }

  // ---- the two walls, meeting in an inside corner -------------------------------------------
  const side = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_D, CEIL), returnMat);
  side.position.set(WALL_X, CEIL / 2, WALL_Z + ROOM_D / 2);
  side.rotation.y = Math.PI / 2;
  side.receiveShadow = true;
  engine.scene.add(side);

  // ---- ceiling --------------------------------------------------------------------------
  // It runs forward past the top of frame on purpose: a ceiling that ends inside the frame
  // reads as a floating slab, and there is nothing above it to explain the edge.
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(WALL_W, ROOM_D + 0.9), ceilMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(WALL_X + WALL_W / 2, CEIL, WALL_Z + (ROOM_D + 0.9) / 2);
  ceil.receiveShadow = true;
  engine.scene.add(ceil);

  // ---- skirting -------------------------------------------------------------------------
  // NOTHING FLOATS: the wall does not simply intersect the floor, it is stopped by a board
  // with a bead on it, which is what the junction looks like in a real room and what gives
  // the wall a contact line and a shadow.
  const addSkirting = (len, x, z, ry) => {
    const g = new THREE.Group();
    const boardH = 0.155, boardD = 0.026;
    const boardMesh = new THREE.Mesh(roundedBox(len, boardH, boardD, 0.005, 2), skirtMat);
    boardMesh.position.set(0, boardH / 2, boardD / 2);
    boardMesh.castShadow = boardMesh.receiveShadow = true;
    g.add(boardMesh);
    const bead = new THREE.Mesh(roundedBox(len, 0.030, 0.040, 0.013, 3), skirtMat);
    bead.position.set(0, boardH + 0.012, boardD / 2 + 0.004);
    bead.castShadow = bead.receiveShadow = true;
    g.add(bead);
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    engine.scene.add(g);
  };
  addSkirting(WALL_W, WALL_X + WALL_W / 2, WALL_Z, 0);
  addSkirting(ROOM_D, WALL_X, WALL_Z + ROOM_D / 2, Math.PI / 2);

  // ---- the cornice -----------------------------------------------------------------------
  // Swept from the SAME section the ornament shader is authored against, so the eggs, the
  // dentils and the bead-and-reel land on the members they belong to. The texture carries
  // only the enrichment; the geometry carries the profile.
  const SECTION = corniceSection(56);
  const TILE_W = 0.36;      // world width of one uv tile of the ornament

  function corniceRun(length) {
    const n = SECTION.length;
    const pos = [], uvs = [], idx = [];
    for (let i = 0; i < n; i++) {
      const [d, t] = SECTION[i];
      for (let j = 0; j < 2; j++) {
        pos.push(j === 0 ? -length / 2 : length / 2, t * BAND, d * PROJ);
        uvs.push(j === 0 ? 0 : length / TILE_W, t);
      }
    }
    for (let i = 0; i < n - 1; i++) {
      const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d2 = (i + 1) * 2 + 1;
      idx.push(a, b, c, b, d2, c);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }

  const addCornice = (length, x, z, ry, casts) => {
    const m = new THREE.Mesh(corniceRun(length), corniceMat);
    m.position.set(x, CEIL - BAND, z);
    m.rotation.y = ry;
    m.castShadow = casts;
    m.receiveShadow = true;
    engine.scene.add(m);
    return m;
  };
  // both runs are carried through to the corner so they mitre into each other
  addCornice(WALL_W, WALL_X + WALL_W / 2, WALL_Z, 0, true);
  // The return run does NOT cast. Under a key raking from the left it threw a five-metre
  // diagonal band right across the middle of the hero wall — physically correct, and it
  // destroyed the only surface this piece exists to be judged on.
  addCornice(ROOM_D, WALL_X, WALL_Z + ROOM_D / 2, Math.PI / 2, false);

  // ---- the ceiling rose --------------------------------------------------------------------
  // A flat disc would read as a decal, so it carries a couple of centimetres of real dome.
  // Everything else — the acanthus, the beads, the egg-and-dart, the hook hole — is 40 mm of
  // relief across 700 mm and is honestly carried by the normal map.
  const ROSE_R = 0.45;
  const roseGeo = new THREE.CircleGeometry(ROSE_R, 128);
  {
    const p = roseGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const r = Math.hypot(p.getX(i), p.getY(i)) / ROSE_R;
      p.setZ(i, 0.026 * (1 - r * r));      // local +z becomes world -y once rotated: it hangs
    }
    roseGeo.computeVertexNormals();
  }
  const rose = new THREE.Mesh(roseGeo, roseMat);
  rose.rotation.x = Math.PI / 2;
  rose.position.set(0.55, CEIL - 0.002, -0.30);
  rose.receiveShadow = true;
  engine.scene.add(rose);

  // ---- what fell out of the hole -------------------------------------------------------------
  // DEBRIS OBEYS GRAVITY: every photograph in refs/lath with a hole in it has crumbs, dust
  // and fallen lumps on the floor directly below. These are also the piece's 20 cm read —
  // they are the nearest thing to camera and they carry the 0.55 m break tile, so the
  // aggregate, the voids and the hair ends resolve at half a millimetre per texel.
  //
  // One of them lies FACE DOWN. That is not variety for its own sake: the back of a plaster
  // coat is the keyed side, and the keys are the detail that says this came off a lathed
  // wall rather than out of a bag.
  {
    const faceS = { pos: [], uv: [], idx: [], col: [] };
    const rimS = { pos: [], uv: [], idx: [] };
    const backS = { pos: [], uv: [], idx: [], col: [] };

    // ---- what a fallen chunk is actually SHAPED like ------------------------------------
    //
    // Round 1 built every fragment as a flat plate of constant 28 mm and a critic called
    // them "flat white low-poly blobs". Both halves of that are geometry, not shading: a
    // constant-thickness plate has exactly two parallel faces, so whichever one you can see
    // is a single flat tone whatever is painted on it, and the only shape information in the
    // whole object is its outline.
    //
    // A real lump off a lime wall is not a plate. The finish coat is thin and fairly true,
    // but the coarse coat behind it was thrown on by hand and varies by ten millimetres over
    // a hand's width; the fracture wanders through the thickness, so a chunk is wedge-shaped
    // and its face is gently domed; and the BACK is not flat at all, it carries the keys.
    // So three functions do the work that a constant thickness was failing to do:
    //
    //   faceRelief  a few millimetres of dome and drift on the finished face, which is what
    //               turns one flat tone into a form the raking key can model
    //   keyRelief   the key beads on the back, as REAL RIDGES, at the 39 mm lath pitch
    //   per-piece   thickness from 22 to 46 mm, so the section band round the rim varies
    //
    // The key beads are geometry rather than the normal map here for the same reason they
    // are geometry in the cavity: a 10 mm bead seen at a grazing angle from a metre away
    // needs to break the SILHOUETTE of the piece, and a normal map cannot do that.
    // AND THE FRAGMENT'S RIDGES HAVE TO BE THE WALL'S OWN PITCH. These beads were authored
    // at 39 mm against a cavity whose lath pitch is now 62 mm, and a chunk whose keys do not
    // match the wall it fell out of is an internal contradiction a close look will find —
    // the two are visible in the same frame. Coarser, jittered per piece, and a taller bead
    // to suit the wider pitch. The comb-ridging itself is a round-2 win and is not being
    // removed, only re-pitched.
    const KEY_PITCH = 0.058;
    // SPALL is what actually gives the face its form, and it is a STEP, not a wobble.
    // Smooth noise on a matt near-white surface at a metre is close to invisible whatever
    // its amplitude — there is no edge for the eye to catch. What a fallen chunk really has
    // is patches where the thin hard finish coat has flaked off and left the coarse coat
    // standing 3-5 mm lower, with a sharp lip round each patch. A sharp lip throws a line of
    // shadow under a raking key, and a line of shadow is a thing you can see.
    const spallF = (x, y, n) => sstep(0.02, 0.20, fbmS(x * 7.5 + n * 3, y * 7.5 + n * 7, 151, 3));
    const faceRelief = (x, y, n) => (
      fbmS(x * 5.5 + n * 5, y * 5.5 + n * 3, 157, 3) * 0.0075     // the hand-thrown coarse coat
      + fbmS(x * 19 + n, y * 19, 167, 2) * 0.0022
      - spallF(x, y, n) * 0.0045                                  // flaked-off finish
    );
    const keyRelief = (x, y, n) => {
      const pitch = KEY_PITCH * (0.84 + h11(n * 3.3 + 2.7) * 0.34);
      const t = (((y / pitch) % 1) + 1) % 1;
      // pressure varied along the run, exactly as in the cavity — a chunk whose every bead
      // is the same height is a radiator, not a piece of plaster
      const full = Math.max(0, Math.min(1, fbmS(x * 7 + n * 4, y * 3, 173, 3) * 1.6 + 0.45));
      const w = Math.max(0, 1 - Math.abs(t - 0.16) / 0.19);
      return Math.sin(Math.PI * 0.5 * w) * w * full * 0.019;
    };

    // A FLAT CHIP READS AS PAPER. The first version laid every piece face-up on the boards
    // and they came out as pale pancakes: from above you see only the finished face, the
    // 28 mm section is edge-on and invisible, and the keyed back is against the floor where
    // nothing can see it. Half of what this material has to prove was pointing at the
    // floorboards. So the pieces are LEANED — tipped up out of the floor plane by 25 to 70
    // degrees, propped on each other and on the skirting the way a slab that slid down a
    // wall actually comes to rest — and the two nearest the camera are turned so one shows
    // its fractured section and the other shows its keys.
    //
    // x, z, half-size, spin about y, lean (rad), roll (rad), y lift, faceDown, thickness
    //
    // LEAN IS A BUDGET, NOT A FREE PARAMETER. Tipped past about 35 degrees a piece lying on
    // the floor reads as a blade: the camera is low, so a steeply propped slab is seen
    // almost edge-on and the finished face — the thing carrying the near read — turns away
    // and contributes a white sliver.
    //
    // THE ONE EXCEPTION IS THE HERO, and it is the piece's answer to "nothing in frame is
    // closer than 1.2 m". The camera cannot come forward: at fov 70 from y 0.72 the floor
    // does not enter frame until 0.97 m along the view axis, and the header above records a
    // real fight between the cornice at 2.6 m, that floor distance and a moire regression
    // that came from viewing the boards at 9 degrees. So instead of moving the camera, the
    // subject stands UP into the near field — a 0.47 m slab tipped 58 degrees and propped on
    // a chunk, the way a piece that came off the wall actually comes to rest. Its base is at
    // the bottom edge of frame about 1.2 m out and its top is 1.0 m from the lens; it is a
    // quarter of frame height on a 0.27 mm/texel bake.
    //
    // AND IT IS TURNED KEYED-SIDE OUT. The first attempt at this stood the same slab up with
    // its FINISHED FACE to the camera, and the render was unreadable: at this camera the
    // face ended up within 29 degrees of square-on, so no thickness showed, no silhouette
    // cue showed, and a flat-lit flat face with a blobby outline against a floor is
    // indistinguishable from a puddle lying ON that floor. Which is exactly what it looked
    // like. Facing the KEYED BACK out fixes both halves at once: the 39 mm beads are real
    // geometry, so they break the silhouette and self-shadow instead of relying on tone, and
    // they are the single most identifying thing a piece of lath-and-plaster owns. The
    // finished face is not lost — the piece two along is face-up at 1.35 m.
    //
    // RE-CHOREOGRAPHED FOR THE ORBITED CAMERA, and the arithmetic is worth keeping because
    // it is what stops a debris field from being half off the edge of the frame. From
    // (-0.10, 0.78, 1.25) at fov 62 the frame's half-angles are 31 deg vertical and 46.9 deg
    // horizontal about a forward bearing 20.1 deg right of -z, so a piece is in frame if its
    // bearing from the camera is between -26.8 and +67.0 deg, and its BASE is in frame only
    // if it is more than 0.78/tan(25.4) = 1.64 m away horizontally. Round 2's hero at
    // (1.62, 1.00) is at bearing 76 deg from this camera — well off the right edge — and
    // four of the eleven were inside the near gate. Every row below is checked against both,
    // and the hero is deliberately parked at 41 deg (about 60% of the way to the right edge)
    // rather than as close to it as the gate allows: a foreground object that touches the
    // frame edge reads as a crop, not as a foreground object.
    // The spill also runs LEFT rather than straight out from the breach. That is a framing
    // decision with a physical justification rather than the other way round: a coat that
    // lets go of a wall slides down it and fans, and at this camera the ground under the
    // hole itself is 2.6 m away and near the right edge, while the near-left quadrant of the
    // frame was a bare metre and a half of empty boards.
    //
    // RE-CHOREOGRAPHED AGAIN FOR THE ROUND-4 CAMERA, and this time to answer a complaint
    // rather than to follow one. A critic measured "a pale, uniformly-toned debris mound
    // hugging the entire bottom edge — it reads as a distinct light band before the eye
    // reaches the hole". Two things made that band: the spill ran along the wall so every
    // piece sat at nearly the same distance and therefore the same height in frame, and it
    // was bunched into the middle-right, so the lower LEFT quadrant was bare boards while
    // the lower centre was solid rubble.
    //
    // So the spill now runs TOWARD THE CAMERA rather than along the wall — which is also what
    // a coat sliding off a wall does — and the hero moves to the near left. From
    // (0.02, 0.84, 1.02) at fov 62 the frame's half-angles are 31 deg vertical and 46.9 deg
    // horizontal about a bearing 22.5 deg right of -z, so a piece is in frame between
    // bearings -24.4 and +69.4 deg and its BASE is in frame only past 0.84/tan(24.8) = 1.82 m
    // horizontally. Every row is checked against both; the bearings now run -3.7 to +60.8 deg
    // and the distances 1.84 to 2.73 m, so the pieces stack in DEPTH up the lower third
    // instead of lining up along its edge.
    const PIECES = [
      // The hero's spin is not a free number: with `down` and this lean the keyed face's
      // world azimuth IS `spin`, so it has to equal the bearing from the piece back to the
      // camera — atan2(0.12, 1.87) = 0.064 rad from here — or the near read turns edge-on.
      [-0.10, -0.85, 0.290, 0.064, 0.820, 0.14, 0.195, true, 0.048], // HERO, standing, keys out
      [0.16, -1.00, 0.150, 1.10, 0.20, 0.06, 0.018, true, 0.034],  // its prop, keyed side up
      [0.52, -0.75, 0.235, 0.52, 0.22, 0.10, 0.024, false, 0.038],
      [0.95, -0.88, 0.215, 1.95, 0.30, -0.20, 0.026, true, 0.032], // KEYED BACK to camera
      [1.62, -0.52, 0.180, -0.85, 0.46, 0.16, 0.040, false, 0.028],
      [1.22, -0.45, 0.200, 1.70, 0.24, -0.09, 0.024, true, 0.034],
      [0.34, -0.95, 0.155, 0.35, 0.58, 0.18, 0.038, false, 0.026],
      [2.05, -0.72, 0.145, -2.40, 0.34, 0.05, 0.026, false, 0.030],
      [1.80, -1.05, 0.165, 1.15, 0.18, -0.12, 0.020, true, 0.032],
      [0.70, -1.15, 0.125, -0.40, 0.44, 0.08, 0.028, false, 0.024],
      [2.35, -0.28, 0.120, 0.80, 0.52, -0.05, 0.030, false, 0.026],
    ];
    // HORSEHAIR ON THREE PIECES, NOT ONE. A critic confirmed the fibres are real geometry
    // and then said the thing that matters: on one slab out of eleven it is a detail you can
    // be shown, not a property of the material. Same technique, same honest limit (see the
    // block below), on the hero and on the two other large pieces in the near half of the
    // spill — the ones whose fracture edge is close enough to the lens for a 2 mm strand to
    // darken a pixel.
    const HAIRED = new Set([0, 2, 3]);
    PIECES.forEach((p, n) => {
      const [fx, fz, size, spin, lean, roll, lift, down, thick] = p;
      const hero = n === 0;
      const s = brokenSlab({
        // NO UNDERCUT ON A FRAGMENT. That setting exists because of one defect that took
        // five renders to name: the fragments came out covered in regular parallel
        // corrugation that looks exactly like normal-map aliasing. It is not. Ruled out,
        // each by a single render: the albedo and roughness maps, the normal map, shadow
        // acne, screen AO, and the break field punching interior holes. Dropping the RIM
        // mesh removed them. The rim is a section hanging off a ragged contour; a fragment
        // is seen from ABOVE at about 30 degrees, where that section PROJECTS ACROSS THE
        // FACE as a band, and a ragged outline has dozens of concave excursions, so dozens
        // of those bands overlap the face and comb it. From above the rim reads without an
        // undercut, so it gets none.
        //
        // THE CELL IS NOW FINE, NOT COARSE, and that is a round-2 change that only became
        // safe once the contour stopped being quantised. Round 1 coarsened the cell to 24 mm
        // to keep the outline's excursion COUNT down, because with whole-cell keep/drop the
        // only lever on contour roughness was cell size. Marching squares decouples the two:
        // the excursions come from the field, so the top crumble octave is cut instead (see
        // present below) and the cell is free to go down to 9 mm — which it has to, because
        // a 39 mm key bead needs four samples across it to exist at all.
        x0: -size, y0: -size, w: size * 2, h: size * 2,
        cell: hero ? 0.0065 : (size > 0.19 ? 0.009 : 0.013),
        seed: 40 + n * 7,
        back: true, undercut: 0, thick,
        rimTile: NEAR_BREAK_TILE,
        zFront: (x, y) => faceRelief(x, y, n),
        zBack: (x, y) => keyRelief(x, y, n),
        // a blob with a ragged margin. The top octave is HALVED against round 1: at a 9 mm
        // cell the old 0.20 amplitude at a 30 mm wavelength resolved into a saw edge and
        // brought the rim comb back, and a real fallen chunk has a mostly conchoidal edge
        // with crumb on it rather than a fringe.
        present: (x, y) => {
          const a = Math.atan2(y, x);
          const rad = size * (0.74 + 0.16 * Math.sin(a * 2 + n)
                                   + 0.10 * Math.sin(a * 3 - n * 1.7));
          let f = rad - Math.hypot(x, y);
          f += (fbm2(x * 9 + n * 3, y * 9, 61) - 0.5) * size * 0.55;
          f += (fbm2(x * 26 + n, y * 26, 83) - 0.5) * size * 0.10;
          return f;
        },
        // NEAR_TILE, not the wall's 2.4 m — this is the mapping half of the density fix.
        // Offset per piece so no two sample the same patch of the map.
        uv: (x, y) => [(x + fx * 1.7) / NEAR_TILE + n * 0.37,
          (y + fz) / NEAR_TILE + n * 0.53],
        uvBack: (x, y) => [(x + fx) / NEAR_BREAK_TILE + n * 0.31,
          (y + fz) / NEAR_BREAK_TILE + n * 0.19],
        // PER-PIECE AND WITHIN-PIECE TONE. Nine chunks at one albedo is what made a spill of
        // rubble read as one moulded prop; and a chunk is dirtiest where it has been ground
        // against the boards, which is its own low edge.
        tint: (x, y) => {
          // spalled patches show the coarse coat: darker, greyer, and it is that tonal step
          // between finish and core that makes the eye read "this was solid and it snapped"
          const sp = spallF(x, y, n);
          // GROUND-IN DIRT AT THE LOW EDGE. Every piece is dirtiest where it has been
          // dragged across the boards, and a chunk with one filthy edge reads as something
          // that fell; a chunk of one tone reads as something that was moulded. `y` here is
          // the slab's own coordinate, which after the lean is roughly its downhill axis.
          const ground = Math.max(0, Math.min(1, 0.55 - y / (size * 1.6)));
          const g2 = Math.max(0.10, 0.84 + 0.34 * fbmS(x * 3.4 + n * 9, y * 3.4, 191, 3)
                    + 0.16 * fbmS(x * 11 + n * 3, y * 11, 197, 2)
                    + (h11(n * 4.7 + 1.1) - 0.5) * 0.46)
                    * (1 - sp * 0.24) * (1 - ground * 0.30);
          return [g2, g2 * (1 - sp * 0.02), g2 * (0.955 - sp * 0.02)];
        },
      });
      const m = new THREE.Matrix4()
        .makeTranslation(fx, lift, fz)
        .multiply(new THREE.Matrix4().makeRotationY(spin))
        .multiply(new THREE.Matrix4().makeRotationX((down ? Math.PI / 2 : -Math.PI / 2) + lean))
        .multiply(new THREE.Matrix4().makeRotationZ(roll));
      appendTransformed(faceS, s.front, m);
      appendTransformed(rimS, s.rim, m);
      appendTransformed(backS, s.back, m);

      // ---- HORSEHAIR AT THE FRACTURE, as geometry, on the three largest near pieces.
      //
      // This is the honest limit of what this camera can show, and it is worth stating
      // plainly: a real plasterer's hair is 0.1-0.2 mm, the break map already draws it at
      // 1.2 mm because anything finer aliases away at bake time, and at the 1.1 m the
      // nearest thing in frame sits from the lens one screen pixel covers 1.5 mm. So an
      // individual fibre painted on a SURFACE cannot be resolved here at any texel density
      // — which is why the critic could verify the hair at texture level and never see it.
      //
      // What does resolve at sub-pixel width is a fibre against a DARK BACKGROUND, because
      // then it is an antialiasing problem rather than a sampling one: a 2 mm strand over
      // dark boards still darkens its pixel. So the fibres are put where they physically
      // belong anyway — pulled out of the matrix by the fracture, standing off the broken
      // edge and crossing the silhouette. A fracture pulls hair OUT rather than cutting it,
      // which is precisely the property that distinguishes historic lime from gypsum.
      if (HAIRED.has(n)) {
        const hp = { pos: [], nrm: [] };
        const rp = s.rim.pos;
        const quads = rp.length / 12;
        const v3 = new THREE.Vector3();
        for (let qi = 0; qi < quads; qi += 3) {
          const b = qi * 12;
          const ax = rp[b], ay = rp[b + 1], az = rp[b + 2];
          const bx = rp[b + 9], by = rp[b + 10], bz = rp[b + 11];
          const ex = bx - ax, ey = by - ay;
          const L = Math.hypot(ex, ey);
          if (L < 1e-6) continue;
          if (h11(qi * 2.3 + 0.7) > 0.42) continue;             // 42% of the lip is haired
          // outward in the slab plane, plus a lift out of the fracture face
          const ox = ey / L, oy = -ex / L;
          // THE ARITHMETIC THIS ROUND HAS TO SATISFY, since the claim has now failed twice.
          // The hero sits 1.87 m from the lens; at fov 62 over 1080 rows that is 2.08 mm per
          // screen pixel. A real plasterer's hair is 0.1-0.2 mm and CANNOT be drawn here by
          // any means — not at any texel density, because the limit is the screen and not the
          // texture, which is exactly why a critic could verify it in the bake and never see
          // it in the frame. Two rounds of "it is there at 6x zoom" were true and useless.
          //
          // What CAN be resolved is a strand 3-6 mm across, which is 1.4-2.9 px: enough to
          // darken its own pixel against a dark background, which is why these live on the
          // fracture lip crossing the silhouette and not on a face. That is not a single
          // hair, it is a TUFT — several fibres pulled out of the matrix together and matted
          // with lime, which is what actually stands off a broken lime edge and is honest at
          // this scale. Longer too: 18-70 mm, so a tuft spans 9-34 px and reads as a fibrous
          // fringe rather than as a speck. Anything finer than this is below the resolving
          // power of this frame and is stated here rather than claimed again.
          const len = 0.018 + h11(qi * 5.1) * 0.052;
          const bend = (h11(qi * 7.7) - 0.5) * 1.5;
          const rad = 0.0016 + h11(qi * 3.9) * 0.0014;
          const path = [];
          for (let t = 0; t <= 4; t++) {
            const u = t / 4;
            path.push([
              ax + ox * len * u - ey / L * len * bend * u * u,
              ay + oy * len * u + ex / L * len * bend * u * u,
              az - (thick * 0.5) * u + Math.sin(u * 2.2) * len * 0.30,
            ]);
          }
          // a three-sided prism, tapering to a point
          for (let t = 0; t < 4; t++) {
            const r0 = rad * (1 - t / 4) ** 0.7, r1 = rad * (1 - (t + 1) / 4) ** 0.7;
            for (let k = 0; k < 3; k++) {
              const a0 = (k / 3) * Math.PI * 2, a1 = ((k + 1) / 3) * Math.PI * 2;
              const P = (p, ang, r) => [p[0] + Math.cos(ang) * r, p[1] + Math.sin(ang) * r, p[2]];
              const q0 = P(path[t], a0, r0), q1 = P(path[t], a1, r0);
              const q2 = P(path[t + 1], a1, r1), q3 = P(path[t + 1], a0, r1);
              for (const tri2 of [[q0, q1, q2], [q0, q2, q3]]) {
                v3.set(0, 0, 0);
                for (const p of tri2) hp.pos.push(p[0], p[1], p[2]);
                const ux = tri2[1][0] - tri2[0][0], uy = tri2[1][1] - tri2[0][1], uz = tri2[1][2] - tri2[0][2];
                const wx = tri2[2][0] - tri2[0][0], wy = tri2[2][1] - tri2[0][1], wz = tri2[2][2] - tri2[0][2];
                let nx3 = uy * wz - uz * wy, ny3 = uz * wx - ux * wz, nz3 = ux * wy - uy * wx;
                const NL = Math.hypot(nx3, ny3, nz3) || 1;
                nx3 /= NL; ny3 /= NL; nz3 /= NL;
                for (let z = 0; z < 3; z++) hp.nrm.push(nx3, ny3, nz3);
              }
            }
          }
        }
        const hg = new THREE.BufferGeometry();
        hg.setAttribute('position', new THREE.Float32BufferAttribute(hp.pos, 3));
        hg.setAttribute('normal', new THREE.Float32BufferAttribute(hp.nrm, 3));
        hg.applyMatrix4(m);
        const hm = new THREE.Mesh(hg, new THREE.MeshStandardMaterial({
          // keratin in a chalky matrix: darker and far smoother than the plaster round it,
          // which is the whole reason a fibre catches a highlight
          color: 0x6d5f4a, roughness: 0.42, metalness: 0.0, side: THREE.DoubleSide,
        }));
        hm.castShadow = true;
        engine.scene.add(hm);
      }
    });

    const mk = (part, mat, white) => {
      const g = toGeometry(part, !!(part.col && part.col.length) && !white);
      // keyNear carries vertex colours, so everything using it has to supply its own — an
      // unset colour attribute is not "no tint", it is black.
      if (white) {
        // THE KEYED BACK IS THE HERO'S VISIBLE FACE, so its tone carries most of the
        // "styrofoam" complaint on its own. Round 2 tinted it from `h11(i * 0.017)` — a hash
        // of the VERTEX INDEX, which is white noise per vertex with no spatial structure at
        // all. On a 6.5 mm cell that is high-frequency speckle: it widens the histogram
        // (which is why the numbers looked fine) and contributes nothing the eye can read as
        // dirt, because dirt is blotchy at the scale of a hand and speckle is not blotchy at
        // any scale. These positions are already in WORLD space, so the field can be spatial
        // and the grit can key off real height above the boards.
        const p = g.attributes.position;
        const n = p.count;
        const c = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          const wx = p.getX(i), wy = p.getY(i), wz = p.getZ(i);
          const mot = fbmS(wx * 4.2, wz * 4.2 + wy * 2.1, 211, 3, 1.7);
          const grit = Math.max(0, Math.min(1, 1.0 - wy * 5.5));
          const v = (0.66 + 0.24 * mot) * (1 - grit * 0.28);
          c[i * 3] = v; c[i * 3 + 1] = v * 0.985; c[i * 3 + 2] = v * 0.950;
        }
        g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      }
      const mesh = new THREE.Mesh(g, mat);
      mesh.castShadow = true;
      // A 30 mm slab has nothing meaningful to catch its own shadow on, and leaving it as a
      // receiver only buys stipple from the crumbs scattered over it. The HERO is the
      // exception: it stands 0.4 m up, so the pieces around it genuinely shade it.
      mesh.receiveShadow = false;
      engine.scene.add(mesh);
      return mesh;
    };
    mk(faceS, closeMat, false).receiveShadow = true;
    mk(rimS, breakNear, false);
    mk(backS, keyNear, true);

    // ---- the dust sheet -------------------------------------------------------------------
    // Every photograph in refs/lath with a hole in it has DUST below it, not just lumps:
    // lath-mcminnville-oregon's stair is grey with it. Round 1 had lumps and pebbles on bare
    // polished boards, which reads as someone tipped a bucket out rather than as a wall
    // failing. This is the same brokenSlab used at 3 mm thick with a very soft outline — an
    // opaque irregular film rather than a transparent decal, because a hard-edged circle of
    // alpha is a worse artefact than no dust at all.
    {
      const sheets = [
        [HX - 0.35, WALL_Z + 0.55, 0.95, 0.62, 7.0],
        [HX + 0.85, WALL_Z + 0.40, 0.52, 0.34, 19.0],
        [HX - 1.05, WALL_Z + 0.34, 0.46, 0.30, 31.0],
        // two more running OUT toward the camera rather than along the wall, so the fallen
        // pieces are lying IN dust rather than on clean boards a metre from where it stopped,
        // and so the spill does not draw a horizontal line across the bottom of frame
        [HX - 0.95, WALL_Z + 1.05, 0.60, 0.44, 43.0],
        [HX - 1.45, WALL_Z + 0.62, 0.44, 0.52, 57.0],
      ];
      const dustS = { pos: [], uv: [], idx: [], col: [] };
      for (const [cx, cz, rw, rh, sd] of sheets) {
        const s = brokenSlab({
          x0: -rw, y0: -rh, w: rw * 2, h: rh * 2, cell: 0.030, seed: sd,
          back: false, undercut: 0, thick: 0.0035, rimTile: NEAR_BREAK_TILE,
          present: (x, y) => {
            let f = 1 - Math.hypot(x / rw, y / rh);
            f += fbmS(x * 3.2 + sd, y * 3.2, 97, 4) * 0.55;
            f += fbmS(x * 11 + sd, y * 11, 113, 3) * 0.26;
            // and a crumb octave on the outline. Round 2 stopped at 11 cycles/m, so every
            // spill had a smooth continuous margin — which on a pale sheet against dark
            // boards is the outline of a puddle. Dust does not have a smooth margin.
            f += fbmS(x * 34 + sd, y * 34, 119, 2) * 0.075;
            return f;
          },
          // A DUST SPILL IS NOT A SHEET OF PAPER. Flat, it renders as spilled emulsion: one
          // tone, one normal, a puddle. It is really a loose heap a few millimetres deep,
          // dragged into ridges and thinning to nothing at the edges, so it gets both a
          // relief and a tint that fades out with the same field the outline uses.
          zFront: (x, y) => (
            fbmS(x * 9 + sd, y * 9, 141, 3) * 0.0035
            + fbmS(x * 26 + sd, y * 26, 149, 2) * 0.0014
          ) * Math.min(1, Math.max(0, 1.15 - Math.hypot(x / rw, y / rh))),
          uv: (x, y) => [(x + cx) / NEAR_TILE + sd * 0.11, (y + cz) / NEAR_TILE + sd * 0.07],
          // AND IT IS DARKER. Lime dust that has been walked through is not the colour of
          // the wall it came off; round 2's spill probed at median luminance 121 on boards
          // at 46, which is the brightest thing in the lower half of the frame and reads as
          // spilled emulsion. Down a third at the centre, with the mottle band widened so
          // the sheet has structure rather than a single graded tone.
          // AND A VERTEX COLOUR IS A MULTIPLIER, NOT A LEVEL — CLAMP IT. The first attempt at
          // this darkened the base to 0.50 and kept two signed mottle bands and an edge
          // falloff on top, which at the low tail of both bands reaches -0.24. Negative
          // vertex colour is not "very dark", it is a multiplier that the interpolator
          // carries across the triangle, and the spill rendered with soot-black holes torn
          // through it — a scorch mark rather than dust. Round 2 had the same unclamped
          // expression and got away with it only because its 0.72 base kept the sum positive.
          // Nothing warns; the geometry, the material and the uv are all correct.
          // and the clamp has to be a FLOOR ON THE MATERIAL, not a guard against NaN. Clamped
          // at 0.10 the black holes simply became 0.045-albedo holes and still rendered as
          // soot. Probed, the sheet came back at p05 18 / p50 29 against boards at 18 — dust
          // darker than the walnut it is lying on, which is not a thing lime dust can be.
          // The band amplitudes come down with the base so the expression's own low tail
          // lands near the floor value rather than under it.
          // AND A THIRD DOWN AGAIN IN ROUND 4, because the complaint survived the round-3
          // fix and the measurement says why. Round 3 got the HUE right — the spill probes
          // R-B 31-32 against a wall at 25-30, so it is properly in the wall's warmth family
          // — and left the VALUE at median luminance 85-92 over boards at 23-48. A pale layer
          // is a pale layer whatever its hue: at twice the value of everything under it the
          // eye reads a separate object lying on the floor rather than the floor being dirty.
          // Lime dust trodden into an oak floor is barely lighter than the oak.
          tint: (x, y) => {
            // ...AND NOT PAST THE FLOOR, WHICH THE FIRST ATTEMPT AT THIS DID. A base of 0.35
            // with the edge falloff still on top put the middle of every spill under the
            // walnut it lies on and the render came back with a sooty grey smear across the
            // boards — the same failure recorded two paragraphs up, reached by overcorrecting
            // rather than by forgetting to clamp. Probed: boards run 22-46, so the spill is
            // aimed at 55-70 — lighter than the floor, nowhere near the 85-92 it was.
            const d = Math.max(0.22, 0.425 + 0.15 * fbmS(x * 4.5 + sd, y * 4.5, 127, 3)
                    + 0.08 * fbmS(x * 15 + sd, y * 15, 131, 2)
                    - 0.085 * Math.min(1, Math.hypot(x / rw, y / rh)));
            return [d, d * 0.985, d * 0.950];
          },
        });
        const m = new THREE.Matrix4().makeTranslation(cx, 0.0035, cz)
          .multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
        appendTransformed(dustS, s.front, m);
      }
      const dm = new THREE.Mesh(toGeometry(dustS, true), closeMat);
      dm.receiveShadow = true;
      engine.scene.add(dm);
    }

    // ---- crumbs ----------------------------------------------------------------------------
    // A hole with clean floor under it is the tell. One instanced draw call.
    //
    // TIGHTER AND SMALLER THAN ROUND 1. They were spread over a 2.6 m radius at up to 48 mm,
    // which put evenly sized grey pebbles across the whole floor including the far corners —
    // gravel scattered on a parquet, not a wall that came down in one place. A real spill is
    // a dense cone directly under the breach whose size distribution is heavily weighted to
    // the small: hundreds of crumbs, a handful of lumps.
    const crumbGeo = new THREE.IcosahedronGeometry(1, 0);
    const N = 130;
    const crumbs = new THREE.InstancedMesh(crumbGeo, breakNear, N);
    const mtx = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    for (let i = 0; i < N; i++) {
      const t = h11(i * 1.7);
      const spread = 0.22 + t * t * 1.45;
      const ang = h11(i * 3.1) * Math.PI * 2;
      const x = HX + Math.cos(ang) * spread * 1.30 + (h11(i * 5.3) - 0.5) * 0.22;
      const z = WALL_Z + 0.09 + Math.abs(Math.sin(ang)) * spread * 0.95;
      // A CRUMB MUST BE BIGGER THAN THE SHADOW TEXEL THAT DRAWS IT. The pockmarked patch on
      // the floorboards that survived turning the walnut's wear off and halving its normal
      // is neither: it is these. The shadow map is 2048 over a 4.2 m ortho box, so one texel
      // lands 4.1 mm apart, and a 5 mm crumb is one texel across — it cannot resolve, so it
      // scatters a soft blotch two or three times its own size while itself being under a
      // screen pixel at 2.5 m. Hundreds of those read as dimples in the wood rather than as
      // rubble. Squared rather than cubed, off an 11 mm floor, so every crumb is at least
      // three shadow texels and the thing casting the shadow is visible.
      const u = h11(i * 7.9);
      const sc = 0.011 + u * u * 0.032;
      e.set(h11(i * 2.2) * 3.1, h11(i * 4.4) * 3.1, h11(i * 6.6) * 3.1);
      q.setFromEuler(e);
      mtx.compose(new THREE.Vector3(x, sc * 0.55, z), q,
        new THREE.Vector3(sc, sc * 0.62, sc * (0.7 + h11(i * 9.1) * 0.6)));
      crumbs.setMatrixAt(i, mtx);
      // ONE TONE FOR EVERY CRUMB IS THE TELL. A spill of identical white pebbles reads as
      // scattered props; a real one runs from clean fracture to floor-dirty, because the
      // pieces landed at different times and have been trodden on differently.
      const dirt = 0.26 + h11(i * 13.7) * 0.52;
      crumbs.setColorAt(i, new THREE.Color(dirt, dirt * 0.975, dirt * 0.930));
    }
    crumbs.instanceMatrix.needsUpdate = true;
    if (crumbs.instanceColor) crumbs.instanceColor.needsUpdate = true;
    crumbs.castShadow = crumbs.receiveShadow = true;
    engine.scene.add(crumbs);
  }

  // ---- calibration sphere, OPT-IN --------------------------------------------------------
  // It proves the environment is doing real work and it is the only thing in frame that is
  // neither pale nor matt, so it stays available — but a chrome ball on the floor of a
  // Georgian room is a CG-test-render tell, and a critic named it as damaging the blind read
  // of the whole scene. `--extra "cal=1"` to get it back.
  if (showCal) {
    const cb = new THREE.Mesh(new THREE.SphereGeometry(0.115, 48, 32),
      new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.04 }));
    cb.position.set(2.62, 0.115, 0.14);
    cb.castShadow = cb.receiveShadow = true;
    engine.scene.add(cb);
  }

  engine.finalizeScene();
  engine.markReady();
  engine.start();
  return engine;
}
