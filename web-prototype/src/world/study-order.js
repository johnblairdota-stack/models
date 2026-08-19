import * as THREE from 'three';
import {
  wallRun, doorCase, windowBay, ceilingSlab, pilaster, extrudeProfile, corniceProfile,
} from './kit.js';
import { fireplace, tapestryHang } from './props.js';
import { FramedBin } from './gallery-order.js';

/**
 * THE STUDY'S ARCHITECTURAL ORDER — ONE SOURCE OF TRUTH.
 *
 * John, 2026-08-08: *"I just want the game to progress from the assets we made for the 3 rooms
 * we had in the art and that way its set up to reach for the art bar instead of progressing in
 * the original slice rooms."*
 *
 * `estate-1` did the gallery this way and proved the method by a pixel diff rather than by
 * assertion (`room.gallery` byte-identical, 0 of 2,073,600 pixels differing). This is the same
 * shape for the SECOND of John's three rooms: the panelled storey, the stone frieze above it,
 * the chimneypiece and its breast, the window bay, the panelling cornice, the pilasters, the
 * beamed ceiling and the tapestries, authored ONCE and emitted into whichever `GeoBin` the
 * caller owns. `views/room-study.js` and the playable `study_w` / `study_e` spaces build from
 * this file; neither is a hand copy of the other.
 *
 * ⚠️ **THE BALLROOM IS STILL NOT PORTABLE AND NOTHING HERE CHANGES THAT** — game storey 7.20
 * against a two-storey 9.6 m showcase with a musicians' gallery (`estate-spike-1`).
 *
 * ---------------------------------------------------------------------------
 * HOW IT STAYS BIT-IDENTICAL FOR `views/room-study.js` (score 65, must not regress)
 *
 * Three properties, exactly as `gallery-order.js` has them, and each one is load-bearing:
 *
 *   1. **Every dimension is a PARAMETER in the caller's own coordinates.** The showcase passes
 *      the literals it already had (`h 5.85`, `wallTop 3.60`, `doorCx -2.625`, the window's
 *      `sill 3.78 / w 1.72`, the chimney at `x 3.62`, bays 8/9/9). Nothing is derived from a
 *      ratio for a caller that has a history, because "a few millimetres" is exactly the size
 *      of change a grade gate notices and nobody can explain a round later.
 *   2. **A `FramedBin` PROXY applies the caller's frame and renames buckets**, so `wallRun`,
 *      `doorCase`, `windowBay`, `pilaster`, `ceilingSlab`, `fireplace` and `tapestryHang` are
 *      not touched. Five of those seven are shared with `room.ballroom`, `light.shaft`,
 *      `room.gallery` and `light.dark`, which this slice must not regress.
 *   3. **Emission ORDER is preserved phase for phase.** `GeoBin` merges a bucket in insertion
 *      order, so keeping the order keeps the merged buffer layout as well as the picture. The
 *      phases below are the showcase's own sequence (`room-study.js` lines 380-531); the game
 *      adds a FRONT wall and a second window, both of which are empty phases for the showcase
 *      and therefore emit nothing into its bin.
 *
 * ---------------------------------------------------------------------------
 * 🚨 THE ONE THING THAT DELIBERATELY DOES **NOT** TRAVEL: "THE WINDOW SITS ABOVE THE PANELLING"
 *
 * `room-study.js` puts its lancet in the stone storey ABOVE the panelled one, and its own
 * header explains for twenty lines that this is a FRAMING solve — the art wants the robot's
 * crown at ~79% of frame height AND the window fully in shot, and the only free variable left
 * was the storey height, so the room was lowered to 5.85 and the panelling to 3.60. That is a
 * property of a camera, not of a study.
 *
 * The game's storey is **4.80**, its doorways are **2.72** and its cornice band eats **0.46**,
 * which leaves the frieze between the panelling cap and the cornice about **0.65 m** tall. A
 * window that fitted in it would be under a metre square at the top of a wall — a clerestory,
 * which is the GALLERY's motif and not this one. So in the game the window is a real study
 * window in the PANELLED storey, sill 1.05 to head 3.28, and the stone frieze above it is
 * unbroken.
 *
 * ⚠️ That choice also removes the whole hazard class `room.js`'s own band note describes: with
 * the window entirely below the string course there is no opening in the upper band at all, so
 * the two height bands' cut lists stay genuinely disjoint and no walk can emit a floor-to-sill
 * box across a doorway. It is the safer build as well as the better-looking one.
 */

const HALF_PI = Math.PI / 2;

// ---------------------------------------------------------------------------
// The plan: every number the order needs, with no THREE in it.
// ---------------------------------------------------------------------------

/**
 * Resolve the study's dimensions into the walls, openings and anchors the order stands on.
 *
 * Separated from the geometry for the same reason `galleryPlan` is: `room.js` needs the wall
 * runs and the window opening BEFORE it builds a wall (the window is a hole in one), and
 * `views/game.js` needs the hearth and sconce anchors AFTER, to hang fixtures on. Two
 * consumers, one arithmetic.
 *
 * @param o.x0,o.x1     the wall the chimneypiece stands on runs along this axis
 * @param o.z0,o.z1     z0 is the CHIMNEY wall ("back"); z1 is open in the showcase
 * @param o.h           storey height
 * @param o.wallTop     top of the panelled storey. Omit to derive (see below).
 * @param o.walls       explicit wall descriptors; omit to derive the four (or three) faces
 * @param o.doors       [{wall, u, w, h, leaves, gilt}] in each wall's own run coordinate
 * @param o.windows     [{wall, u, sill, spring, w, mullions, transoms, t}]
 * @param o.chimney     {u, openW, openH, jambW, proj, overH, fieldInset, cartoucheScale}
 */
export function studyPlan(o = {}) {
  const x0 = o.x0 ?? -7, x1 = o.x1 ?? 7;
  const z0 = o.z0 ?? -7.2, z1 = o.z1 ?? 6.0;
  const h = o.h ?? 5.85;
  const wid = x1 - x0, dep = z1 - z0;

  /**
   * ⚠️ **THE DERIVED PANELLING TOP IS SOLVED AGAINST THE DOORWAY, NOT SCALED FROM THE
   * SHOWCASE.** The showcase's 3.60 in a 5.85 storey is 61.5%, and 61.5% of the game's 4.80 is
   * **2.95** — BELOW the game's own 2.72 m doorheads plus the 0.56 m of entablature `doorCase`
   * stacks on top of them. Panelling that stops under the door it surrounds is not a lower
   * proportion, it is a modelling error. So the derived form clears the tallest opening plus
   * its hood, and the RATIO is what gives way, because the door height is a fixed game
   * constant (`connectors.js` `DOORWAY_H`) and the storey is not negotiable either.
   */
  const wallTop = o.wallTop ?? Math.min(h - (o.corniceBandH ?? 0.46) - 0.95,
    (o.doorHead ?? 2.72) + 0.63);
  const corniceH = o.corniceH ?? 0.44;
  const corniceProj = o.corniceProj ?? 0.26;
  const fieldLo = o.fieldLo ?? 0.44;

  /**
   * The four faces, in the order the showcase emits them. `back` is the chimney wall; `left`
   * and `right` are the returns; `front` exists only for a room that is closed on all four
   * sides, i.e. the game. Each is a `wallRun` frame plus the run coordinate `u` maps onto.
   *
   * ⚠️ `wallRun`'s orientation convention is `kit.js`'s and it is easy to get backwards:
   * rotY +PI/2 runs toward -Z and faces +X; rotY -PI/2 runs toward +Z and faces -X; rotY PI
   * runs toward -X and faces -Z. `toU` inverts each one so a caller can hand over openings in
   * WORLD coordinates and get them cut in the right place.
   */
  const walls = o.walls ?? [
    { id: 'back', x: x0, z: z0, rotY: 0, length: wid, toU: (p) => p.x - x0 },
    { id: 'left', x: x0, z: z1, rotY: HALF_PI, length: dep, toU: (p) => z1 - p.z },
    { id: 'right', x: x1, z: z0, rotY: -HALF_PI, length: dep, toU: (p) => p.z - z0 },
    ...(o.closed ? [{ id: 'front', x: x1, z: z1, rotY: Math.PI, length: wid, toU: (p) => x1 - p.x }] : []),
  ];
  for (const w of walls) {
    w.bays ??= o.bays?.[w.id] ?? Math.max(1, Math.round(w.length / (o.bayTarget ?? 1.55)));
    w.openings ??= [];
    w.skip ??= o.skip?.[w.id] ?? [];
    w.uvWall ??= o.uvWall ?? 2.9;
  }

  return {
    x0, x1, z0, z1, h, wid, dep, wallTop, corniceH, corniceProj, fieldLo,
    walls,
    wallById: (id) => walls.find((w) => w.id === id) ?? null,
    doors: o.doors ?? [],
    windows: o.windows ?? [],
    chimney: o.chimney ?? null,
    pilasters: o.pilasters ?? [],
    beams: o.beams ?? null,
    tapestries: o.tapestries ?? [],
    upperStorey: o.upperStorey ?? false,
    ceiling: o.ceiling ?? null,
    /** Anchors the practical rig hangs on, so a fixture cannot drift off its architecture. */
    sconces: o.sconces ?? [],
    hearth: o.chimney ? { x: o.chimney.x ?? 0, y: 0.06, z: o.chimney.z ?? z0, rotY: o.chimney.rotY ?? 0 } : null,
  };
}

// ---------------------------------------------------------------------------
// The order itself
// ---------------------------------------------------------------------------

/**
 * Emit the study order into `bin`.
 *
 * @param o.plan      a `studyPlan()` result (or the arguments for one)
 * @param o.base      THREE.Matrix4 applied to everything, or null for "already in this frame"
 * @param o.remap     { kitKey: callerKey } bucket renaming, or null
 * @param o.material  { tapestry } — the one material this file needs by reference, because a
 *                    hanging is a Mesh with cloth normals and not a bin bucket
 * @param o.parts     which phases to emit; every one defaults ON
 * @returns { plan, meshes } — `meshes` are objects the caller must parent itself
 */
export function studyOrder(bin, o = {}) {
  const P = o.plan ?? studyPlan(o);
  const B = new FramedBin(bin, o.base ?? null, o.remap ?? null);
  const parts = {
    walls: true, upper: true, doors: true, windows: true, chimney: true,
    chimneyBreast: false,
    cornice: true, pilasters: true, ceiling: true, beams: true, hangings: true,
    ...(o.parts ?? {}),
  };
  const { x0, x1, z0, z1, h, wid, dep, wallTop, corniceH, corniceProj, fieldLo } = P;
  const meshes = [];

  const K = { wall: 'wood', mould: 'trim', cornice: 'trim', skirt: 'trim', leaf: 'trim', trim: 'trim' };
  const back = P.wallById('back');
  const rest = P.walls.filter((w) => w.id !== 'back');
  const doorsOn = (id) => P.doors.filter((d) => d.wall === id);
  const winsOn = (id) => P.windows.filter((w) => w.wall === id);

  /**
   * One panelled wall run. `solid` is the whole difference between the two callers: the
   * showcase's `wallRun` IS the wall, the game's wall boxes already exist (`room.js`
   * `buildWall`, with the doorways and dig segments already cut out of them), so there the run
   * emits joinery ONLY and stands on the wall that is already there.
   *
   * ⚠️ Same for `skirt`. Two skirtings in one room is a z-fight, and the game's own skirting is
   * emitted per wall segment by `buildWall`, which knows where the openings are.
   */
  const runWall = (w) => {
    wallRun(B, {
      x: w.x, z: w.z, rotY: w.rotY, length: w.length, height: wallTop, bays: w.bays,
      keys: K, uvWall: w.uvWall, skip: w.skip, raised: true, dado: false, fieldLo,
      cornice: w.cornice ?? false, skirt: o.skirt ?? true, solid: o.solid ?? true,
      openings: w.openings,
    });
  };

  // ---- PHASE A: the chimney wall, panelled -------------------------------
  if (parts.walls && back) runWall(back);

  // ---- PHASE B: the stone storey above it, with the lancet punched through -
  // Showcase only. In the game the two-storey split is `room.js`'s `capY` + `band`, because
  // there the wall it is splitting is the game's own and the colliders must stay full height.
  if (parts.upper && P.upperStorey && back) {
    wallRun(B, {
      x: back.x, z: back.z, rotY: back.rotY, length: back.length,
      height: h - wallTop, y0: wallTop,
      keys: { wall: 'stoneUp' }, uvWall: P.upperStorey.uvWall ?? 1.8,
      dado: false, cornice: false, skirt: false, fielded: false,
      openings: P.upperStorey.openings ?? [],
    });
  }

  // ---- PHASE C: the door cases on the chimney wall ------------------------
  if (parts.doors && back) for (const d of doorsOn('back')) emitDoor(B, K, d);

  // ---- PHASE D: the window bays on the chimney wall -----------------------
  if (parts.windows && back) for (const w of winsOn('back')) emitWindow(B, w);

  // ---- PHASE E: the chimneypiece and the breast the flue runs up ----------
  // Without the breast the overmantel is a picture frame hung on flat panelling; with it a
  // whole third of the room steps forward, which is what makes the art's chimneypiece read as
  // BUILT rather than as applied. It is also the thing the shaft has to graze.
  let breastW = 0;
  if (parts.chimney && P.chimney) {
    const c = P.chimney;
    const built = fireplace(B, {
      x: c.x, y: c.y ?? 0, z: c.z, rotY: c.rotY ?? 0,
      keys: { stone: 'stone', soot: 'soot', dark: 'dark', ground: 'stoneGround' },
      openW: c.openW, openH: c.openH, jambW: c.jambW, proj: c.proj,
      overH: c.overH, fieldInset: c.fieldInset, cartoucheScale: c.cartoucheScale,
    });
    breastW = built.totalW + (c.breastExtra ?? 0.34);
    B.box('stone', breastW, h - wallTop, c.breastD ?? 0.32,
      c.x, (wallTop + h) / 2, c.z, 1.4);
  } else if (parts.chimneyBreast && P.chimney) {
    // FurnProp owns the chimneypiece mesh; keep the breast so cornice die-in / wall mass stay.
    const c = P.chimney;
    const openW = c.openW ?? 1.55, jambW = c.jambW ?? 0.42;
    breastW = openW + 2 * jambW + (c.breastExtra ?? 0.34);
    B.box('stone', breastW, h - wallTop, c.breastD ?? 0.32,
      c.x, (wallTop + h) / 2, c.z, 1.4);
  }

  // ---- PHASE F: the chimney wall's cornice, in runs that die into the breast
  /**
   * ⚠️ **A REAL CORNICE STOPS AT A CHIMNEY BREAST**, and `critic-estate-5` filed the version
   * that did not: *"the mantel shelf/cornice crosses diagonally right through the cartouche
   * panel"*. The breast steps forward of the wall and carries its own capping cornice, so a
   * wall cornice running straight across it is not a staging accident — it is a piece of
   * joinery that could not exist.
   */
  if (parts.cornice && back) {
    const m0 = new THREE.Matrix4().makeTranslation(0, wallTop - 0.02, z0 + 0.02);
    const cx = P.chimney?.x ?? 0;
    const gap0 = breastW ? cx - breastW / 2 - 0.02 : x1;
    const gap1 = breastW ? cx + breastW / 2 + 0.02 : x1;
    const spans = breastW ? [[x0, gap0], [gap1, x1]] : [[x0, x1]];
    for (const [a, b] of spans) {
      if (b - a <= 0.02) continue;
      B.add('trim', extrudeProfile(corniceProfile(corniceH, corniceProj), b - a, { x0: a }), m0);
    }
  }

  // ---- PHASE G: the returns, panelled -------------------------------------
  if (parts.walls) for (const w of rest) runWall(w);

  // ---- PHASE H: the stone storey on the returns ---------------------------
  if (parts.upper && P.upperStorey) {
    for (const s of P.upperStorey.sides ?? []) {
      B.box('stoneUp', s.w, h - wallTop, s.d, s.x, (wallTop + h) / 2, s.z, s.uv ?? 1.8);
    }
  }

  // ---- PHASE I: the returns' cornices --------------------------------------
  if (parts.cornice) {
    for (const w of rest) {
      const m = new THREE.Matrix4().makeTranslation(w.x, wallTop - 0.02, w.z)
        .multiply(new THREE.Matrix4().makeRotationY(w.rotY))
        .multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.02));
      B.add('trim', extrudeProfile(corniceProfile(corniceH, corniceProj), w.length, { x0: 0 }), m);
    }
  }

  // ---- PHASE J: the door cases on the returns ------------------------------
  if (parts.doors) for (const w of rest) for (const d of doorsOn(w.id)) emitDoor(B, K, d);

  // ---- PHASE K: the window bays on the returns -----------------------------
  // Empty for the showcase (its one window is on the chimney wall), which is what keeps its
  // bin byte-identical while the game hangs two windows on its outside wall.
  if (parts.windows) for (const w of rest) for (const win of winsOn(w.id)) emitWindow(B, win);

  // ---- PHASE L: the pilasters flanking the chimney breast ------------------
  if (parts.pilasters) {
    for (const p of P.pilasters) {
      pilaster(B, {
        x: p.x, y: p.y ?? 0.34, z: p.z, rotY: p.rotY ?? 0,
        h: p.h ?? (wallTop - 0.86), w: p.w ?? 0.46, proj: p.proj ?? 0.11,
        keys: { shaft: 'wood', cap: 'trim' },
      });
    }
  }

  // ---- PHASE M: the ceiling slab ------------------------------------------
  // Off in the game: `room.js` already draws a ceiling box for every space, and a second slab
  // 20 mm under it is a z-fight, not a ceiling.
  if (parts.ceiling && P.ceiling) {
    const c = P.ceiling;
    ceilingSlab(B, 'ceil', wid + (c.over ?? 0.6), dep + (c.over ?? 0.6), c.y ?? h,
      (x0 + x1) / 2, (z0 + z1) / 2, c.uv ?? 2.6);
  }

  // ---- PHASE N: the beams --------------------------------------------------
  // The top sixth of every frame in this room. Dark, because a walnut room's ceiling is soot
  // and shadow and not white plaster — and dark enough to be a real black without being a void
  // (`estate-owner`'s round-5 measurement: the art's darkest decile still holds L 2.7).
  if (parts.beams && P.beams) {
    const b = P.beams;
    const span = b.span ?? wid;
    const n = b.n ?? 7;
    for (let i = 0; i < n; i++) {
      const bz = (b.z0 ?? (z0 + 0.9)) + i * ((b.z1 ?? (z1 - 0.9)) - (b.z0 ?? (z0 + 0.9))) / (n - 1);
      B.box('dark', span, b.h ?? 0.34, b.d ?? 0.30, (x0 + x1) / 2, (b.y ?? (h - 0.17)), bz, 0.9);
    }
    if (b.ridge !== false) {
      B.box('dark', b.ridgeW ?? 0.42, b.ridgeH ?? 0.42, b.ridgeLen ?? dep,
        (x0 + x1) / 2, b.ridgeY ?? (h - 0.21), (z0 + z1) / 2, 0.9);
    }
  }

  // ---- the hangings --------------------------------------------------------
  /**
   * Tapestries are placed where the LIGHT is, not where a decorator would put them: a tapestry
   * in the dark is a black rectangle, a tapestry catching the edge of a sconce is the only
   * saturated colour in a room of walnut and grey stone.
   *
   * ⚠️ They are MESHES, not bin buckets — `tapestryHang` lofts a sheet with a catenary top
   * edge and real fold normals, and welding that into the wall would flatten it. The showcase
   * takes them one at a time (four draw calls it has always paid); the game takes
   * `mergeHangings`, because three of them on one material is three draw calls it has not.
   */
  if (parts.hangings && P.tapestries.length && o.material?.tapestry) {
    const geos = [];
    for (const t of P.tapestries) {
      const m = tapestryHang({
        w: t.w, h: t.h, material: o.material.tapestry,
        folds: t.folds, amp: t.amp, sag: t.sag,
      });
      m.position.set(t.x, t.y, t.z);
      if (t.rotY) m.rotation.y = t.rotY;
      if (o.mergeHangings) {
        m.updateMatrix();
        geos.push(m.geometry.applyMatrix4(m.matrix));
      } else {
        meshes.push(m);
      }
    }
    if (o.mergeHangings && geos.length) {
      const merged = geos.length === 1 ? geos[0] : mergeTapestries(geos);
      if (merged) {
        merged.computeBoundingSphere();
        const one = new THREE.Mesh(merged, o.material.tapestry);
        one.name = 'tapestries';
        one.castShadow = true; one.receiveShadow = true;
        meshes.push(one);
      }
    }
  }

  /**
   * ⚠️ The hangings are built in the builder's own frame and returned as Meshes, not put in the
   * bin — so `base` has to be applied here or three tapestries hang in the middle of the
   * service passage. It is the one thing the proxy cannot catch, which is why it is stated.
   * (`gallery-order.js` learned this with twelve paintings.)
   */
  if (o.base) for (const m of meshes) m.applyMatrix4(o.base);

  return { plan: P, meshes };
}

// ---------------------------------------------------------------------------

function emitDoor(B, K, d) {
  doorCase(B, {
    x: d.x, y: d.y ?? 0, z: d.z, rotY: d.rotY ?? 0,
    w: d.w, h: d.h, leaves: d.leaves ?? 2, gilt: d.gilt ?? true, keys: K,
  });
}

/**
 * ⚠️ **`t` IS THE WALL THE BAY IS SET INTO AND GETTING IT WRONG BURIES THE GLASS.** `windowBay`
 * places its sheet at `-t * 0.55`, i.e. 55% of the way THROUGH the masonry, and defaults `t` to
 * `WALL_T` (0.30). The gallery port shipped its first build with arched openings containing a
 * dead dark pane because the boundary it was set into was a 0.15 SKIN; the study's windows are
 * on OUTSIDE walls, which the game draws at the full 0.30, so the default is right here — but
 * it is a parameter and not an assumption, because the next room's may not be.
 */
function emitWindow(B, w) {
  windowBay(B, {
    x: w.x, y: w.y ?? 0, z: w.z, rotY: w.rotY ?? 0, t: w.t,
    w: w.w, h: w.spring - w.sill, sill: w.sill, spring: w.spring,
    keys: { reveal: 'wintrim', trim: 'wintrim', stone: 'wintrim', glass: 'glass', lead: 'trim' },
    mullions: w.mullions ?? 1, transoms: w.transoms ?? 3,
    ...(w.spandrelSteps ? { spandrelSteps: w.spandrelSteps } : {}),
  });
}

/**
 * Merge without dragging `BufferGeometryUtils` into this module's static import graph twice —
 * `fixture-merge.js` already pulls it and `room.js` loads both lazily. Attribute sets are
 * identical by construction (every tapestry comes out of the same builder), so the plain
 * concatenation three provides is safe.
 */
function mergeTapestries(geos) {
  const total = geos.reduce((n, g) => n + g.attributes.position.count, 0);
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  const idx = [];
  let v = 0;
  for (const g of geos) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, v * 3);
    nor.set(g.attributes.normal.array, v * 3);
    uv.set(g.attributes.uv.array, v * 2);
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) idx.push(gi[i] + v);
    v += n;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  return out;
}
