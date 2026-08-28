import * as THREE from 'three';
import {
  wallRun, windowBay, archedOpening, cofferedCeiling, cove, ceilingRose,
  pilaster, balustrade, extrudeProfile, corniceProfile, worldUV,
} from './kit.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { pierGlass, urnOnPedestal, consoleTable } from './props.js';
import { FramedBin } from './gallery-order.js';

/**
 * THE BALLROOM'S ARCHITECTURAL ORDER — ONE SOURCE OF TRUTH.
 *
 * John, 2026-08-08: *"I just want the game to progress from the assets we made for the 3 rooms
 * we had in the art and that way its set up to reach for the art bar instead of progressing in
 * the original slice rooms."*
 *
 * Third of the three, and the one that was recorded as impossible three rounds running.
 * `estate-spike-1` filed it — *"The BALLROOM is not close: game 27.2 x 15.3 x **7.20** against a
 * showcase **two-storey 9.6 m** with a musicians' gallery... Porting it is a floor-plan change,
 * not a port"* — and `estate-1` and `estate-2` both repeated it verbatim as still open.
 *
 * ---------------------------------------------------------------------------
 * 🚨 THE CONSTRAINT DOES NOT EXIST, AND JOHN IS THE ONE WHO ASKED THE RIGHT QUESTION
 *
 * *"if the eventual use is procedural rooms that we dig between and find the way out through
 * the interconnect does it matter how tall the ballroom is? can we add the ballroom at the size
 * it is?"* — and every part of that checks out in code:
 *
 *   · **`DIG_H = 2.80`** (`src/game/dig.js`). The destructible band is a fixed strip from the
 *     floor to 2.80 m and that file says outright that *"the masonry above 2.80 is ordinary
 *     wall"*. **A 9.6 m room digs identically to a 7.2 m one**, hole for hole.
 *   · **`PASS_H = { robot: 1.70, hunter: 2.40 }`** (`src/game/rules.js`). Both are far below the
 *     band. No ceiling height in this house reaches a gameplay height.
 *   · Everything in `src/game/room.js` that reads `.storey` is PARAMETRIC — the wall boxes, the
 *     colliders, the ceiling slab, the space AABB, the hunter's full-height breach. Raising the
 *     number builds a taller room; nothing branches on it.
 *   · `docs/design/procedural-map.md` settles the future case: rooms are modules whose
 *     CONNECTORS must agree on clear width and height. **The connectors match. The rooms need
 *     not**, and a double-height ballroom beside 4.8 m rooms is what a grand house IS.
 *
 * So `spaces.js` raises `ballroom.storey` 7.20 -> **9.60** and this file ports the order UNCUT:
 * the two-storey window register, the musicians' gallery at 5.2, the full-height pilaster order,
 * the coved and coffered ceiling. Cutting the upper order to fit a 7.2 m box would have thrown
 * away the exact thing that earns `room.ballroom` its PASS 85.
 *
 * ---------------------------------------------------------------------------
 * THE MAPPING IS 1:1 AND THERE IS NO ROTATION, WHICH IS WHY IT IS THE CHEAPEST OF THE THREE
 *
 *   showcase (`views/room-ballroom.js`)          game (`spaces.js` `ballroom`)
 *   window wall   x -13        16.0 m            xmin  x -13.60      15.30 m   exterior
 *   mirror wall   x +13        16.0 m            xmax  x +13.60      15.30 m   exterior
 *   end wall      z  -8        26.0 m            zmin  z  -8.30      27.20 m   D4 / D5 / D6
 *   near wall     z  +8        26.0 m            zmax  z  +7.00      27.20 m   exterior
 *
 * The gallery needed a `rotY` because its long axis ran the other way; this one needs no `base`
 * at all, exactly like the study — and `wallRun`'s four orientations here are the same four
 * `room.js` `buildWall` already uses for `xmin`/`xmax`/`zmin`/`zmax`. **And the showcase's single
 * arched opening in the end wall lands on the game's THREE doorways in that same wall**: the
 * game's version of that motif is three arches instead of one, which is a better room and not a
 * compromise.
 *
 * ---------------------------------------------------------------------------
 * HOW IT STAYS BIT-IDENTICAL FOR `views/room-ballroom.js` (PASS 85, the project high)
 *
 * The same three properties that made the gallery and the study work, and each is load-bearing:
 *
 *   1. **Every dimension is a PARAMETER in the caller's own coordinates**, and the showcase
 *      passes the literals it already had (`h 9.6`, `split 4.8`, `galleryY 5.2`, windows
 *      `w 2.05 / sill 1.05 / h 4.35` at 4.2 m from z -6.4, bays 8/6/8/8, the arch at
 *      `w 5.2 / h 5.2 / spring 2.6`). Nothing is scaled from a ratio for a caller that has a
 *      history: a few millimetres is exactly the size of change a grade gate notices and nobody
 *      can explain a round later.
 *   2. **A `FramedBin` PROXY renames buckets** — imported from `gallery-order.js`, one proxy for
 *      all three orders — so `wallRun`, `windowBay`, `archedOpening`, `cove`, `cofferedCeiling`,
 *      `ceilingRose`, `pilaster`, `balustrade`, `pierGlass`, `urnOnPedestal` and `consoleTable`
 *      are not touched. Every one of them is shared with a piece this slice must not regress.
 *   3. **Emission ORDER is preserved phase for phase.** `GeoBin` merges a bucket in insertion
 *      order, so keeping the order keeps the merged buffer layout as well as the picture. The
 *      showcase interleaves two things this file does not own — its five-band vestibule (whose
 *      material keys are built per `?cam=`) and the `?depot=` packing cases — so it makes THREE
 *      calls and they land in the gaps, which is the trick `estate-1` used for the gallery's
 *      far-end arch and stair.
 *
 * ⚠️ **WHAT DELIBERATELY DOES NOT TRAVEL, AND WHY (each is a decision, not an omission):**
 *   · **THE REFLECTION — BUT NOT THE MIRRORS THEMSELVES ANY MORE** (revised `ballroom-fix-1`,
 *     2026-08-09). `pierGlass` returns a plate the showcase feeds a real PLANAR REFLECTION —
 *     one extra scene render per plate, at build time, into a 576x1024 target — and the game
 *     still has no budget for that pass. `estate-3` concluded from that that the game should
 *     take no plates at all, which left the mirror wall as flat boiserie.
 *     🚨 **THIS PARAGRAPH USED TO SAY `views/game.js` NEVER SETS `scene.environment` — "measured,
 *     not read" — AND IT WAS FALSE.** It does. `views/game.js` and `views/party-follow.js` both
 *     build through `_studio.js` `estate()`, which sets `scene.environment` unconditionally and
 *     runs `scene.environmentIntensity` at 3.20; the live page reports `{hasEnv: true,
 *     intensity: 3.2}`. So a metalness-1.0 plate would NOT have rendered black here, and the
 *     claim that it would was the documented premise of a material decision in `room.js`.
 *     Corrected 2026-08-28 (`ballroom-defects-1`), in both files at once, because a false
 *     premise repeated in two places is how it survived three rounds.
 *     The game still takes the plate as a **dielectric**: `room.js` scales the baked metalness
 *     map down and tints the silvering to the wall's own DELIVERED value (see the long note
 *     there, and `harness/ballroom-luma.mjs`), which is what a dead mirror in a shut-up house is
 *     anyway — but that is now a look decision rather than a workaround for a black rectangle. The gilt surround and cresting are what say "pier glass"; the
 *     glass says "old". `parts.mirrors` + `mirrorPlates` are both opt-in, so the showcase's
 *     call is unchanged.
 *   · **THE VESTIBULE AND THE DEPOT.** The first is a `?cam=`-conditioned five-band material
 *     experiment for an anteroom the game's floor plan does not have (it has three doorways
 *     there instead). The second is loose furniture with no colliders, which a robot and a 2.4 m
 *     hunter walk through — the same call `estate-2` made about the study's desks, for the same
 *     reason.
 *   · **THE FLOOR.** The showcase lays a marble chequer plane and a parquet field over it as
 *     SCENE meshes, not bin buckets. `room.js` already draws this room's floor.
 */

const HALF_PI = Math.PI / 2;

// ---------------------------------------------------------------------------
// The plan: every number the order needs, with no THREE in it.
// ---------------------------------------------------------------------------

/**
 * Resolve the ballroom's dimensions into the positions the order stands on.
 *
 * Separated from the geometry for the same reason `galleryPlan` and `studyPlan` are: `room.js`
 * needs the window openings BEFORE it builds a wall (they are holes in it, in BOTH height
 * bands), and `views/game.js` needs the chandelier and sconce anchors AFTER, to hang the
 * practicals on. Two consumers, one arithmetic.
 *
 * @param o.x0,o.x1   the window wall is at x0, the mirror wall at x1
 * @param o.z0,o.z1   the arched end wall is at z0, the near wall at z1
 * @param o.h         storey height — 9.60 in both callers, which is the whole point
 * @param o.split     where the lower storey stops and the upper one starts (4.80)
 * @param o.galleryY  the musicians' gallery deck height (5.20)
 * @param o.win       { w, sill, h, spacing, n, z0 }
 * @param o.winZ      explicit window centres, for a caller with connectors to dodge
 * @param o.arches    [{ x, w, h, spring, t, spandrelSteps }] in the end wall
 * @param o.cuts      { window, mirror, end, near } — extra openings in WORLD coordinates on
 *                    each wall's own axis, so `wallRun` does not draw a raised panel across a
 *                    doorway. See the note on `clashes` below.
 */
export function ballroomPlan(o = {}) {
  const x0 = o.x0 ?? -13, x1 = o.x1 ?? 13;
  const z0 = o.z0 ?? -8, z1 = o.z1 ?? 8;
  const h = o.h ?? 9.6;
  const split = o.split ?? 4.8;
  const galleryY = o.galleryY ?? 5.2;
  const wallLen = z1 - z0;                 // the two SHORT walls (window / mirror)
  const endLen = x1 - x0;                  // the two LONG walls (arched end / near)

  const win = { w: 2.05, sill: 1.05, h: 4.35, spacing: 4.2, n: 5, z0: z0 + 1.6, ...(o.win ?? {}) };
  /**
   * ⚠️ **THE WINDOW RHYTHM IS PASSED IN WHEN THE CALLER HAS CONNECTORS AND DERIVED WHEN IT DOES
   * NOT.** The showcase's five centres deliberately run off the end of its own 16 m wall — the
   * fifth lands at z 10.4, `wallRun`'s own `openings.filter` drops it, and the wall therefore
   * has FOUR holes while a fifth bay is emitted outside the room where nothing sees it. That is
   * history, it is in the scored frame, and re-deriving it would move four windows by a few
   * millimetres. The game passes its own centres, chosen from the spans its exit panel leaves.
   */
  const winZ = o.winZ ?? Array.from({ length: win.n }, (_, i) => win.z0 + i * win.spacing);
  const winHead = win.sill + win.h;
  const winSpring = win.sill + win.h - win.w / 2;

  const bays = { window: 8, mirror: 6, end: 8, near: 8, ...(o.bays ?? {}) };
  const upper = {
    corniceH: 0.95, corniceProj: 0.55,
    fieldLo: 1.35, fieldHi: h - split - 0.95, ...(o.upper ?? {}),
  };

  const arches = o.arches ?? [{ x: (x0 + x1) / 2, w: 5.2, h: 5.2, spring: 2.6 }];

  /**
   * ⚠️ **THE FOUR RUN COORDINATES, AND THEY ARE EASY TO GET BACKWARDS.** `wallRun`'s local +x
   * runs the direction `rotY` turns it: `+PI/2` toward -Z, `-PI/2` toward +Z, `0` toward +X,
   * `PI` toward -X. `toU` inverts each one so a caller can hand over openings in WORLD
   * coordinates and get them cut in the right place — the same convention `studyPlan` uses, and
   * the reason both callers can pass their own connector list without doing this arithmetic.
   */
  const walls = {
    window: { id: 'window', side: 'xmin', axis: 'x', at: x0, rotY: HALF_PI, length: wallLen, toU: (u) => z1 - u },
    mirror: { id: 'mirror', side: 'xmax', axis: 'x', at: x1, rotY: -HALF_PI, length: wallLen, toU: (u) => u - z0 },
    end: { id: 'end', side: 'zmin', axis: 'z', at: z0, rotY: 0, length: endLen, toU: (u) => u - x0 },
    near: { id: 'near', side: 'zmax', axis: 'z', at: z1, rotY: Math.PI, length: endLen, toU: (u) => x1 - u },
  };
  /** an extra opening `{u, w, y0, y1}` in world coordinates -> this wall's run coordinate */
  const toOpening = (wall, c) => {
    const a = wall.toU(c.u - c.w / 2), b = wall.toU(c.u + c.w / 2);
    return { x0: Math.min(a, b), x1: Math.max(a, b), y0: c.y0 ?? 0, y1: c.y1 ?? h };
  };
  const cuts = o.cuts ?? {};
  const extra = {};
  for (const k of Object.keys(walls)) {
    extra[k] = (cuts[k] ?? []).map((c) => toOpening(walls[k], c));
  }

  const pierZ = o.pierZ ?? Array.from({ length: bays.mirror + 1 },
    (_, i) => z1 - (i * wallLen) / bays.mirror);
  const nearX = o.nearX ?? Array.from({ length: bays.near + 1 },
    (_, i) => x0 + (i * endLen) / bays.near);

  return {
    x0, x1, z0, z1, h, split, galleryY, wallLen, endLen,
    win, winZ, winHead, winSpring, bays, upper, arches, pierZ, nearX, walls, extra,
    /** the run coordinate on the window wall — the showcase's own `winLocal` */
    winLocal: winZ.map((wz) => walls.window.toU(wz)),
    brackets: o.brackets ?? 7,
    deckD: o.deckD ?? 2.30,
    deckLen: o.deckLen ?? (wallLen - 1.0),
    deckZ: o.deckZ ?? (z0 + z1) / 2,
    urns: o.urns ?? [[-2.9, -6.1], [2.9, -6.1], [-9.4, -6.9], [9.4, -6.9]],
    consoles: o.consoles ?? [],
    ceiling: {
      cellsX: 7, cellsZ: 4, beam: 0.32, drop: 0.34, inset: 2.3, cove: 1.15,
      x: 0, z: 0, y: h, roseZ: [-4.0, 0, 4.0], roseX: [0], roseR: 1.05, friezeY: h - 1.62,
      ...(o.ceiling ?? {}),
    },
    /**
     * The openings the CALLER has to cut in its own wall, in the TWO height bands, as
     * `{ u, w, y0, y1 }` in the window wall's world coordinate (z). `room.js` feeds `lower`
     * into `buildWall`'s connector walk and `upper` into its band walk.
     *
     * 🚨 **THEY ARE TWO LISTS AND THEY MUST STAY TWO LISTS.** A window here is 5.40 m tall and
     * crosses the 4.80 split, so one sorted walk over both bands would emit a solid box from the
     * floor to a sill across anything else in that wall — `estate-1`'s "SEALED DOORWAY" hazard,
     * which throws nothing and from outside simply looks like a wall. Two walks over two
     * disjoint height bands cannot produce it.
     */
    openings: {
      lower: winZ.map((z) => ({ u: z, w: win.w, y0: win.sill, y1: split })),
      upper: winZ.map((z) => ({ u: z, w: win.w, y0: split, y1: winHead + 0.04 })),
    },
    /** Anchors the practical rig hangs on, so a fixture cannot drift off its architecture. */
    sconceZ: o.sconceZ ?? [],
    chandelierZ: o.chandelierZ ?? [z0 + wallLen * 0.25, (z0 + z1) / 2, z1 - wallLen * 0.25],
  };
}

// ---------------------------------------------------------------------------
// The spandrel fill
// ---------------------------------------------------------------------------

/**
 * 🚨 **THE SPANDREL IS A CURVE NOW, NOT A STAIRCASE — AND IT COSTS THE SAME TRIANGLES**
 * (`ballroom-fix-1`, 2026-08-09).
 *
 * `estate-3` closed a real hole with this: `buildWall` cuts a RECTANGLE and an arch springing
 * inside it leaves two corners open into the neighbouring room, so something has to fill them.
 * What it filled them with was a **stack of axis-aligned boxes**, which is a staircase, and
 * `critic-slice-2` confirmed the sawtooth on smoothed 3x crops at 8 m. `estate-3` had already
 * raised the count once (6 -> 10) for exactly this reason and the extra steps did not close it,
 * because **more steps is the wrong axis**: a stepped approximation of a circle keeps its
 * corners no matter how small they get, and at 10 steps over a 0.95 m radius each riser is
 * still 95 mm — six screen pixels at this station.
 *
 * ⚠️ **AND THE OLD FILL WAS SYSTEMATICALLY UNDERSIZED, WHICH IS HALF OF WHY IT READ SO HARD.**
 * It evaluated `half(y)` at the BOTTOM of each step and used that width for the whole step, so
 * every box was inscribed under the arc rather than circumscribed over it — leaving a sliver of
 * the original hole open at the top of each riser. The silhouette therefore alternated masonry,
 * background, masonry, background all the way up: a comb, not just a stair.
 *
 * So the fill is now ONE extruded polygon per side whose inner edge IS the arc, sampled at
 * `spandrelSteps` segments. The silhouette is exact to within the segment chord (at 28 segments
 * over a 0.95 m radius that is 3 mm, i.e. under a fifth of a pixel here), and the triangle count
 * is unchanged — an N-segment spandrel triangulates to about the same count as N boxes did,
 * because a box is twelve triangles and a segment is four.
 *
 * ⚠️ `spandrelSteps` KEEPS ITS NAME AND ITS DEFAULT OF 0. The showcase never passes it, emits
 * nothing here, and stays byte-identical; only the meaning of a nonzero value changed, from
 * "risers" to "arc segments", and the caller that passes it was raised to suit in the same
 * commit.
 */
function spandrel(B, a, t, z0) {
  const segs = a.spandrelSteps ?? 0;
  if (segs <= 0) return;
  const ar = a.w / 2;
  if (ar <= 0.004) return;
  const zFront = z0 + (a.inset ?? 0.005);
  /**
   * ⚠️ `spandrelLegacy` — `estate-3`'S BOX STACK, VERBATIM, KEPT SO THE DEFECT CAN BE PUT BACK.
   * `room.js` `?ballfix=0` selects it. Nothing else may use it: it is the instrument, not a
   * fallback, and the comb it produces is the thing this function exists to delete.
   */
  if (a.spandrelLegacy) {
    const dy = ar / segs;
    for (let j = 0; j < segs; j++) {
      const y0 = a.spring + j * dy;
      const half = Math.sqrt(Math.max(0, ar * ar - (y0 - a.spring) * (y0 - a.spring)));
      const fill = ar - half;
      if (fill <= 0.004) continue;
      for (const s of [-1, 1]) {
        B.box('wall', fill + 0.01, dy + 0.004, t,
          a.x + s * (ar - fill / 2), y0 + dy / 2, zFront - t / 2, 0.6);
      }
    }
    return;
  }
  const top = Math.max(a.spring + ar, a.h ?? 0);
  /**
   * 🚨 **TWO BIASES, AND THEY GO IN OPPOSITE DIRECTIONS ON PURPOSE.**
   *   · `LAP` 12 mm OUTWARD on the three straight edges. Those edges coincide with the sides
   *     and head of the rectangle `buildWall` cut, and a fill that stops exactly on them leaves
   *     a hairline of background at every float rounding. Lapping INTO the surrounding masonry
   *     is interpenetration, which is invisible, not co-planarity, which fights.
   *   · `TUCK` 10 mm INWARD on the arc. `archedOpening` draws its archivolt on that same
   *     circle; an inner edge on it to the millimetre z-fights along the whole curve. Tucking
   *     the fill under the trim hides the join and can only ever add masonry, never re-open
   *     the hole.
   */
  const LAP = 0.012, TUCK = 0.010;
  const r = Math.max(0.001, ar - TUCK);
  for (const s of [-1, 1]) {
    const shape = new THREE.Shape();
    shape.moveTo(s * (ar + LAP), a.spring - LAP);      // outer, at the springing
    shape.lineTo(s * (ar + LAP), top + LAP);           // outer, at the head
    shape.lineTo(0, top + LAP);                        // the crown
    // ...and back down the ARC to the springing, which is the edge that was a staircase
    for (let j = 0; j <= segs; j++) {
      const phi = (j / segs) * (Math.PI / 2);
      shape.lineTo(s * r * Math.sin(phi), a.spring + r * Math.cos(phi));
    }
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, steps: 1 });
    B.add('wall', geo, new THREE.Matrix4().makeTranslation(a.x, 0, zFront - t), 0.6);
    geo.dispose();
  }
}

// ---------------------------------------------------------------------------
// The drapery
// ---------------------------------------------------------------------------

/**
 * 🎭 **A HUNG CLOTH WITH FOLDS IN IT — the geometry half of the curtain complaint.**
 *
 * The three drape boxes below this are `B.box('drape', ...)` three times, and the room's own
 * note at the `castShadow` carve-out (`room.js`) already worked out the first half of why they
 * read as cardboard and shipped it: nothing in the order cast a shadow, so a box beside a
 * window had nothing on it to read as a fold. That landed. **It was not enough**, and the
 * number says by how much.
 *
 * 🚨 **MEASURED, ON THE DELIVERED PIXELS OF BOTH ROOMS, AT THE SAME TWO STATIONS.** Take every
 * pixel of a drape (`R > 45 && R > 1.9G && R > 1.9B`, so the mask is the cloth and not the wall
 * behind it) and read the INTERNAL value range it carries, `(p90 - p10) / median` — a figure
 * that does not care that the asset is daylit and the game is not, because it is the cloth
 * measured against itself:
 *
 *     station   asset   game (boxes)   ratio
 *     win       2.33       0.815        2.9x
 *     corner    1.485      0.532        2.8x
 *
 * The asset's drape carries nearly three times the value structure of ours out of geometry that
 * is, per `room.js`, **bit-identical** — because the asset is raked by a sun and the game is a
 * night room lit flat. There is no sun to port (settled: `docs/handoff/ballroom-next.md`), so
 * the only lever left that puts value INSIDE the cloth is the cloth's own normals. Hence folds.
 *
 * ⚠️ **AND IT IS A CLOSED SOLID, NOT A SHEET.** `mats.drape` is an ordinary `FrontSide`
 * standard material, so a lofted sheet would vanish edge-on and show nothing from behind — and
 * this bucket is the ONE bucket in the order that casts, so a single-sided cloth would also
 * throw a shadow with holes in it. Rings of `front points 0..nx` + `back points nx..0` close
 * the loop for free and the side faces fall out of the wrap.
 *
 * Built in the window wall's own frame — **+x out of the wall into the room, +y up, +z along
 * the wall** — because that wall is axis-aligned at `x0` and the caller places with a plain
 * translation, exactly as the three boxes did.
 *
 * @param o.w        extent along the wall
 * @param o.yTop     head
 * @param o.yBot     hem, before any scallop
 * @param o.back     x of the face lying against the wall
 * @param o.depth    mean projection of the front face out of `back`
 * @param o.folds    how many folds across `w`
 * @param o.scallop  hem dip, for a shaped pelmet; 0 for a straight-hemmed leg
 * @param o.scallops how many arcs the scalloped hem is cut into
 */
function drapeCloth(o) {
  const w = o.w, yTop = o.yTop, yBot = o.yBot;
  const back = o.back ?? 0, depth = o.depth ?? 0.20;
  const folds = o.folds ?? 4, scallop = o.scallop ?? 0, scallops = o.scallops ?? 1;
  const nx = o.nx ?? Math.max(16, folds * 9);
  const ny = o.ny ?? 5;
  const N = 2 * (nx + 1);
  const pos = new Float32Array((ny + 1) * N * 3);
  const idx = [];
  /*
   * The fold: 0 in the gather, 1 at the crown, and it DEEPENS toward the hem, which is what a
   * hung cloth does and what stops the panel reading as a corrugated sheet.
   *
   * ⚠️ **THE 0.62 EXPONENT IS NOT DECORATION.** A plain cosine is symmetric, so the gathers are
   * as wide as the crowns and the panel reads as sheet metal; raising it broadens the crown and
   * pinches the gather, which is where a hung cloth actually puts its dark line. Measured on
   * the delivered cloth at `win`, the exponent plus the sample rate below took the internal
   * spread from 1.16 to the figure in this function's header.
   */
  const fold = (u) => (0.5 - 0.5 * Math.cos(u * Math.PI * 2 * folds)) ** 0.62;
  const set = (k, x, y, z) => { pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z; };
  for (let j = 0; j <= ny; j++) {
    const v = j / ny;
    for (let i = 0; i <= nx; i++) {
      const u = i / nx;
      const z = (u - 0.5) * w;
      const dip = scallop > 0 ? Math.sin(Math.PI * ((u * scallops) % 1)) ** 0.62 : 0;
      const y = yTop + ((yBot - scallop * dip) - yTop) * v;
      const xf = back + depth * (0.30 + 0.70 * fold(u)) * (0.74 + 0.44 * v);
      set(j * N + i, xf, y, z);
      set(j * N + (N - 1 - i), back, y, z);
    }
  }
  for (let j = 0; j < ny; j++) {
    for (let k = 0; k < N; k++) {
      const a = j * N + k, b = j * N + ((k + 1) % N);
      const c = (j + 1) * N + k, d = (j + 1) * N + ((k + 1) % N);
      idx.push(a, c, b, b, c, d);
    }
  }
  /* Caps. The winding is derived rather than guessed: for the head, (back_i, front_i+1, front_i)
   * and (back_i, back_i+1, front_i+1) both cross to +y. The hem takes the reverse. */
  for (let i = 0; i < nx; i++) {
    const f0 = i, f1 = i + 1, b0 = N - 1 - i, b1 = N - 2 - i;
    idx.push(b0, f1, f0, b0, b1, f1);
    const o2 = ny * N;
    idx.push(o2 + b0, o2 + f0, o2 + f1, o2 + b0, o2 + f1, o2 + b1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------
// The order itself
// ---------------------------------------------------------------------------

/**
 * Emit the ballroom order into `bin`.
 *
 * @param o.plan    a `ballroomPlan()` result (or the arguments for one)
 * @param o.remap   { kitKey: callerKey } bucket renaming, or null
 * @param o.parts   which phases to emit; every one defaults ON, and the callers gate them
 * @param o.solid   `wallRun` builds the wall itself (showcase) or joinery only (the game,
 *                  whose wall boxes already exist with every connector cut out of them)
 * @param o.mirrors { pier: [...], plates: [...] } for `parts.mirrors`
 * @param o.mirrorPlates  return the glass plates (merged, in `meshes`) instead of discarding
 *                  them, using `o.material.mirror`. Default OFF — see PHASE F.
 * @param o.material { baluster, mirror } materials the order cannot bake for itself
 * @returns { plan, meshes, instanced } — objects the caller must parent itself
 */
export function ballroomOrder(bin, o = {}) {
  const P = o.plan ?? ballroomPlan(o);
  const B = new FramedBin(bin, o.base ?? null, o.remap ?? null);
  const parts = {
    windowWall: true, mirrorWall: true, endWall: true, nearWall: true,
    ceiling: true, mirrors: true, dressing: true, balustrade: true,
    ...(o.parts ?? {}),
  };
  const {
    x0, x1, z0, z1, h, split, galleryY, wallLen, endLen,
    win, winZ, winLocal, winHead, winSpring, bays, upper, extra,
  } = P;
  const meshes = [];
  let instanced = null;

  // The showcase's own key table, verbatim. `mould`/`cornice`/`skirt`/`trim` all land in `gilt`,
  // which is why this room's joinery reads as gilding rather than as paint.
  const K = o.keys ?? { wall: 'wall', mould: 'gilt', cornice: 'gilt', skirt: 'gilt', trim: 'gilt', leaf: 'wall' };
  const SOLID = o.solid ?? true;
  /* ===========================================================================================
   * 🪵 **RAISED PANELS — OPT-IN, BECAUSE THE SUNK ONES HAVE NEVER RENDERED ANYWHERE.**
   *
   * John, comparing the two rooms: *"there are textures on all the walls that look slightly
   * indented with a big square that isn't in the game."* Measured, the panelling in THIS room
   * sits between z -0.12 and -0.048 — entirely inside a 0.30 m wall slab. It is buried in the
   * showcase exactly as it is buried in the game; the showcase's own header describes an
   * ambition rather than a picture, and a 3x crop of its render shows no panel fields at all.
   *
   * `wallRun` already ships the cure and says so at its own `raised` flag: the field goes PROUD
   * (+0.048) instead of sunk. It is also **204 vertices a bay against the sunk path's 300** and
   * lands in the same two buckets, so it is fewer vertices and zero new draw calls.
   *
   * ⚠️ **DEFAULT OFF, AND THAT IS LOAD-BEARING.** `views/room-ballroom.js` is pinned by a
   * pixel-diff and by a grade gate with 0.3 of headroom. Turning this on for the showcase is a
   * defensible change but it is a DIFFERENT one, needing a re-shoot and a new gate figure.
   * =========================================================================================== */
  const raisedPanels = o.raisedPanels === true;
  /* ===========================================================================================
   * 🎭 **FOLDED DRAPERY — OPT-IN, DEFAULT OFF, AND THE DEFAULT IS THE PIN.**
   *
   * `views/room-ballroom.js` is held by a pixel-diff gate AND a darkest-decile grade gate
   * running 7.7 against a ceiling of 8.0. `docs/handoff/ballroom-next.md` records that fold
   * geometry was tried in that view once and REVERTED because a 12 mm displacement cost 0.35 of
   * that 0.3 of headroom. So this replaces the three boxes only for a caller that asks, and a
   * caller that does not ask gets `B.box` three times, in the same order, verbatim.
   *
   * Shape of the payload: `{ pelmetFolds, pelmetDepth, scallop, scallops, legFolds, legDepth }`,
   * every one defaulted in the emitter, so `drapeFolds: {}` is the whole opt-in.
   * =========================================================================================== */
  const drapeFolds = o.drapeFolds ?? null;
  /* ===========================================================================================
   * 🪵 **THE PANEL BOLECTION — OPT-IN, DEFAULT OFF, FOR THE SAME REASON AND WITH A SHARPER EDGE
   * TO IT: THE SHOWCASE'S PANELS ARE NOT VISIBLE AT ALL.**
   *
   * `raisedPanels` above records it: the sunk path puts the field at `z -reveal` (-0.11) and its
   * bolection at -0.09, INSIDE a 0.30 m wall slab that runs 0 to -0.30. The showcase takes that
   * path, so `views/room-ballroom.js` has no panel relief in its frame whatever this flag does —
   * and a 4x crop of `progress/compare/*.asset.png` at any station shows plain plaster where the
   * critique reports a bead. Default off keeps the pin honest all the same: the flag adds a
   * mitred frame per panel, and a merged bucket that gains geometry is a merged bucket whose
   * buffer layout has moved.
   *
   * Payload is `wallRun`'s: `{ w, d }`, defaulted there. See that flag's own note for the
   * measured scanline that produced 75 mm.
   * =========================================================================================== */
  const panelMould = o.panelMould ?? null;
  const panelRise = o.panelRise;
  const panelBevel = o.panelBevel;
  const uvWall = o.uvWall ?? 2.4;
  /**
   * ⚠️ **THE LOWER RUN'S SKIRTING IS THE CALLER'S AND THE UPPER RUN'S IS NOT.** Two skirtings in
   * one room is a z-fight, and `room.js` `buildWall` already emits this room's skirting per wall
   * SEGMENT, where it knows about the openings. But the upper run's "skirting" is the band at the
   * 4.80 storey break, 4.8 m up a wall the game draws as one box — nothing else puts anything
   * there, and it is half of what makes two storeys read as two.
   */
  const skirtLo = o.skirtLower ?? true;
  const skirtHi = o.skirtUpper ?? true;
  /**
   * 🚨 **THE DADO RAIL IS A SINGLE CONTINUOUS EXTRUSION AND OPENINGS DO NOT CUT IT.** `wallRun`
   * clash-skips the dado PANELS against `openings` but the RAIL is one `extrudeProfile` over the
   * whole run, so in the showcase it crosses a 5.2 m arch and in the game it crossed all three
   * doorways — a gilt bar at 0.92 m straight across a hole the player walks through, which reads
   * as a barrier rather than as joinery. It is the kit's own behaviour and `wallRun` is shared
   * with five other pieces, so it is not fixed there; the wall that has open doorways in it
   * simply does not take a dado. Per wall, defaulting ON, so the showcase is untouched.
   */
  const dadoOn = { window: true, mirror: true, end: true, near: true, ...(o.dado ?? {}) };
  /**
   * ⚠️ **OPENINGS ARE PASSED EVEN WHEN `solid` IS FALSE, AND THAT IS NOT AN OVERSIGHT.**
   * `wallRun` uses them for two independent things: cutting the wall SLAB (which the game does
   * not want, because `buildWall` already did it) and `clashes()`, which is what stops a raised
   * and fielded panel being drawn straight across a doorway. `kit.js`'s own note records that
   * bug costing `light.dark` a whole critique round. Dropping the list with the slab would
   * reintroduce it in the one room in the house with three doors in one wall.
   */
  const ops = (list, key) => [...list, ...(extra[key] ?? [])];

  /* =============================================================================================
   * PHASE A0 · 🏛️ THE MARBLE BORDER — a ring, not the showcase's two-plane sandwich.
   *
   * John: *"the edges of the floor of the room have large marble tiles in the asset but in the
   * game the flooring is the same diamond pattern everywhere."*
   *
   * The showcase lays a full-extent chequer plane and drops a parquet field on top of it, inset
   * 2.2 m — so the marble you see is simply the part not covered. That shape does not transfer:
   * the game's floor is already a full-extent box emitted by `room.js`'s generic per-space
   * builder, so a second full plane underneath would be paying for a surface nothing can see.
   * A RING over the existing floor's rim is the same picture for four slabs and one draw call.
   *
   * ⚠️ **THE UVs ARE AUTHORED IN ROOM-LOCAL SPACE, NOT WORLD-PROJECTED.** `GeoBin.add` applies
   * the matrix and THEN projects, so a generated ballroom sitting at an arbitrary world position
   * would get an arbitrary chequer phase and half-squares against the wall. `worldUV` is called
   * here on the untranslated geometry and `uv: null` tells the bin to keep it, which pins the
   * chequer to the room's own corner at every seed.
   *
   * ⚠️ **NOT IN THE `parts` DEFAULTS, DELIBERATELY.** Every entry there defaults ON and
   * `views/room-ballroom.js` makes four `ballroomOrder` calls that whitelist by turning phases
   * OFF — a new default-on phase would fire in all four and build four floors. Requiring the
   * `o.floor` payload, which the showcase never passes, is what keeps the showcase untouched.
   * ============================================================================================= */
  if (o.floor) {
    const f = o.floor;
    const bd = f.border;
    const y = f.y ?? 0.004;
    const strip = (sx, sz, w, d) => {
      const g = new THREE.PlaneGeometry(w, d);
      g.rotateX(-Math.PI / 2);
      // Room-local UVs first, so the chequer phase is the room's corner rather than the world's.
      g.translate(sx - f.x0, 0, sz - f.z0);
      worldUV(g, f.tile);
      g.translate(f.x0, y, f.z0);
      B.add('marbleFloor', g, new THREE.Matrix4(), null);
    };
    const W = f.x1 - f.x0, D = f.z1 - f.z0;
    strip(f.x0 + W / 2, f.z0 + bd / 2, W, bd);                       // z-min edge
    strip(f.x0 + W / 2, f.z1 - bd / 2, W, bd);                       // z-max edge
    strip(f.x0 + bd / 2, f.z0 + D / 2, bd, D - bd * 2);              // x-min edge
    strip(f.x1 - bd / 2, f.z0 + D / 2, bd, D - bd * 2);              // x-max edge
  }

  // ---- PHASE A: the window wall, two storeys, with the window order in it --
  /**
   * ⚠️ **THE WINDOW ORDER IS THE PIECE'S WHOLE REASON FOR EXISTING AND IT IS TWO STOREYS.**
   * `room-ballroom.js`'s own header, item 2: *"DOUBLE HEIGHT, and the eye must be able to
   * measure it. The window order runs the full 9.6 m — two storeys of the kit stacked exactly."*
   * The lower run carries each opening from its sill to the split; the upper run carries the
   * REST of it plus a panelled attic above. Nothing here scales.
   */
  if (parts.windowWall) {
    wallRun(B, {
      x: x0, z: z1, length: wallLen, height: split, bays: bays.window, rotY: HALF_PI,
      keys: K, uvWall, raised: raisedPanels, panelMould, panelRise, panelBevel, giltPanel: true, reveal: 0.11,
      cornice: false, solid: SOLID, skirt: skirtLo, dado: dadoOn.window,
      openings: ops(winLocal.map((zl) => ({ x0: zl - win.w / 2, x1: zl + win.w / 2, y0: win.sill, y1: split })), 'window'),
    });
    wallRun(B, {
      x: x0, z: z1, length: wallLen, height: h - split, y0: split, bays: bays.window, rotY: HALF_PI,
      keys: K, uvWall, raised: raisedPanels, panelMould, panelRise, panelBevel, dado: false, giltPanel: true, reveal: 0.11,
      corniceH: upper.corniceH, corniceProj: upper.corniceProj,
      fieldLo: upper.fieldLo, fieldHi: upper.fieldHi, solid: SOLID, skirt: skirtHi,
      openings: winLocal.map((zl) => ({ x0: zl - win.w / 2, x1: zl + win.w / 2, y0: 0, y1: winHead - split })),
    });
    for (const wz of winZ) {
      windowBay(B, {
        x: x0 + 0.005, y: 0, z: wz, rotY: HALF_PI, t: o.wallT,
        w: win.w, h: win.h, sill: win.sill, spring: winSpring,
        keys: { reveal: 'wintrim', trim: 'wintrim', stone: 'wintrim', glass: 'glass', lead: 'gilt' },
        mullions: 2, transoms: 5,
      });
      // pilasters flanking every window, running the full double height
      for (const s of [-1, 1]) {
        pilaster(B, {
          x: x0 + 0.14, y: 0.34, z: wz + s * (win.w / 2 + 0.62), rotY: HALF_PI,
          h: h - 1.55, w: 0.72, proj: 0.16, flutes: 7,
          keys: { shaft: 'wall', cap: 'gilt' },
        });
      }
      // a crimson drape swagged over each window head, and its two side panels
      if (drapeFolds) {
        /*
         * 🎭 **THE FOLDED CURTAIN — SAME ENVELOPE, DIFFERENT NORMALS.** Every number here is
         * read off the three boxes it replaces so the silhouette does not move: the pelmet's
         * head stays at `winHead + 0.225` and its deepest scallop lands on the box's own
         * `winHead - 0.925`; each leg keeps the box's 0.55 m width, its 0.18-0.38 m projection
         * and its `sill + 0.02h .. sill + 0.82h` drop. What changes is that the cloth now has a
         * front face whose normal sweeps through every fold, and a hem that is cut rather than
         * sawn — see `drapeCloth`, and the two measured spreads in its header.
         */
        const D = drapeFolds;
        const pel = drapeCloth({
          w: win.w + 0.95, yTop: winHead + 0.225, yBot: winHead - 0.69,
          back: 0.17, depth: D.pelmetDepth ?? 0.22, folds: D.pelmetFolds ?? 9,
          scallop: D.scallop ?? 0.235, scallops: D.scallops ?? 5, ny: 4,
        });
        B.add('drape', pel, new THREE.Matrix4().makeTranslation(x0, 0, wz), 0.8);
        pel.dispose();
        for (const s of [-1, 1]) {
          const leg = drapeCloth({
            w: 0.55, yTop: win.sill + win.h * 0.82, yBot: win.sill + win.h * 0.02,
            back: 0.18, depth: D.legDepth ?? 0.22, folds: D.legFolds ?? 5, ny: 6,
          });
          B.add('drape', leg, new THREE.Matrix4().makeTranslation(x0, 0, wz + s * (win.w / 2 + 0.24)), 0.8);
          leg.dispose();
        }
      } else {
        B.box('drape', 0.14, 1.15, win.w + 0.95, x0 + 0.24, winHead - 0.35, wz, 0.8);
        for (const s of [-1, 1]) {
          B.box('drape', 0.20, win.h * 0.80, 0.55, x0 + 0.28, win.sill + win.h * 0.42,
            wz + s * (win.w / 2 + 0.24), 0.8);
        }
      }
    }
  }

  // ---- PHASE B: the mirror wall and the musicians' gallery over it ---------
  /**
   * ⚠️ **THE GALLERY IS THE HORIZONTAL THE HEIGHT IS MEASURED AGAINST**, which is the other half
   * of the file header's item 2. A 9.6 m wall with nothing crossing it reads as one tall wall,
   * not as two storeys; a cantilevered deck at 5.2 on carved brackets is what turns the number
   * into something the eye can count. It is also the one part of this order that had no home in
   * a 7.2 m room, and it is the reason the storey went up rather than the order coming down.
   */
  if (parts.mirrorWall) {
    wallRun(B, {
      x: x1, z: z0, length: wallLen, height: split, bays: bays.mirror, rotY: -HALF_PI,
      keys: K, uvWall, raised: raisedPanels, panelMould, panelRise, panelBevel, giltPanel: true, cornice: false, reveal: 0.11,
      solid: SOLID, skirt: skirtLo, dado: dadoOn.mirror, openings: ops([], 'mirror'),
    });
    wallRun(B, {
      x: x1, z: z0, length: wallLen, height: h - split, y0: split, bays: bays.mirror, rotY: -HALF_PI,
      keys: K, uvWall, raised: raisedPanels, panelMould, panelRise, panelBevel, dado: false, giltPanel: true, reveal: 0.11,
      corniceH: upper.corniceH, corniceProj: upper.corniceProj,
      fieldLo: upper.fieldLo, fieldHi: upper.fieldHi, solid: SOLID, skirt: skirtHi,
    });
    // two pilasters on every pier, so the wall carries a vertical rhythm instead of reading as
    // one long grey plane — the lower stops under the deck, the upper stands on it
    for (const zz of P.pierZ) {
      pilaster(B, {
        x: x1 - 0.14, y: 0.34, z: zz, rotY: -HALF_PI,
        h: galleryY - 1.10, w: 0.62, proj: 0.15, flutes: 6,
        keys: { shaft: 'wall', cap: 'gilt' },
      });
      pilaster(B, {
        x: x1 - 0.14, y: galleryY + 0.30, z: zz, rotY: -HALF_PI,
        h: h - galleryY - 1.35, w: 0.52, proj: 0.13, flutes: 5,
        keys: { shaft: 'wall', cap: 'gilt' },
      });
    }
    // the deck itself: a cantilevered balcony on carved brackets
    const dl = P.deckLen, dz = P.deckZ;
    B.box('gilt', P.deckD, 0.22, dl, x1 - 1.15, galleryY, dz, 1.0);
    B.box('wall', P.deckD, 0.55, dl, x1 - 1.15, galleryY - 0.38, dz, 1.4);
    B.add('gilt', extrudeProfile(corniceProfile(0.42, 0.30), dl, { x0: -dl / 2 }),
      new THREE.Matrix4().makeTranslation(x1 - 2.28, galleryY - 0.62, dz)
        .multiply(new THREE.Matrix4().makeRotationY(-HALF_PI)));
    // ⚠ THE BRACKETS SPAN THE WALL, NOT THE DECK — `wallLen`, not `deckLen`. They are 0.9 m in
    // from each corner while the deck itself is 0.5 m in, so the outermost bracket sits under
    // the deck rather than at its lip. Carried verbatim; deriving it from `deckLen` moves seven
    // boxes by 0.17 m and there is no reason to.
    for (let i = 0; i < P.brackets; i++) {
      const bz = z0 + 0.9 + i * ((wallLen - 1.8) / (P.brackets - 1));
      B.box('gilt', 1.9, 0.60, 0.24, x1 - 1.05, galleryY - 0.95, bz, 0.5);
    }
  }

  // ---- PHASE C: the end wall, and the arched opening(s) through it ---------
  /**
   * 🆕 **THE SHOWCASE HAS ONE ARCH HERE AND THE GAME HAS THREE, BECAUSE THE GAME HAS THREE DOORS
   * HERE.** `spaces.js` puts D4, D5 and D6 in the ballroom's north wall at x -8.60 / 0 / +8.60 —
   * the hub's whole floor-plan identity, and the reason `room.js` records residency peaking at
   * 4. `archedOpening` is exactly the motif for a hole in a wall of this order, and three of
   * them over the doors that already exist is the same architecture answering the same question
   * one room along. The showcase passes its own single 5.2 m arch and is unchanged.
   *
   * ⚠️ **THE SPANDRELS ARE THE GAME'S, AND WITHOUT THEM THE ARCH IS TWO HOLES IN THE WALL.**
   * `buildWall` cuts a RECTANGLE (a doorway is 1.90 x 2.72); an arch springing inside it leaves
   * the two corners above the springing line open into the wall band. `archedOpening` has no
   * spandrel fill of its own — the showcase never needed one, because its opening is cut to the
   * arch by `wallRun`. `spandrelSteps` is opt-in, defaults OFF, and emits nothing for a caller
   * that does not ask, which is what keeps the showcase byte-identical.
   */
  if (parts.endWall) {
    wallRun(B, {
      x: x0, z: z0, length: endLen, height: split, bays: bays.end,
      keys: K, uvWall, raised: raisedPanels, panelMould, panelRise, panelBevel, giltPanel: true, cornice: false, solid: SOLID, skirt: skirtLo,
      dado: dadoOn.end,
      openings: ops(P.arches.map((a) => ({
        x0: a.x - x0 - a.w / 2, x1: a.x - x0 + a.w / 2, y0: 0, y1: a.h,
      })), 'end'),
    });
    wallRun(B, {
      x: x0, z: z0, length: endLen, height: h - split, y0: split, bays: bays.end,
      keys: K, uvWall, raised: raisedPanels, panelMould, panelRise, panelBevel, dado: false, giltPanel: true, solid: SOLID, skirt: skirtHi,
      corniceH: upper.corniceH, corniceProj: upper.corniceProj,
      fieldLo: upper.fieldLo, fieldHi: upper.fieldHi,
      openings: P.arches.map((a) => ({
        x0: a.x - x0 - a.w / 2, x1: a.x - x0 + a.w / 2, y0: 0, y1: a.h - split,
      })).filter((p) => p.y1 > 0),
    });
    for (const a of P.arches) {
      const t = a.t ?? 0.30;
      archedOpening(B, {
        x: a.x, y: 0, z: z0 + (a.inset ?? 0.005), w: a.w, h: a.h, spring: a.spring, t,
        // Per-arch trim, defaulting to the gilt every existing caller gets. A wide BLIND arch
        // wants stone instead: gilt is a metal with no diffuse term, so on a dim wall a gilt
        // moulding with nothing to reflect renders dark and the arch does not read at all.
        keys: { wall: 'wall', trim: a.trim ?? 'gilt' },
        /*
         * ⚠️ **FORWARDED, DEFAULTING TO UNDEFINED — `archedOpening` picks its own 0.15/0.055 when
         * nothing is passed, so every existing caller is untouched.** It matters for a wide arch:
         * a 150 mm moulding is 16% of a 1.90 m doorway and reads as a door case, but only 3% of a
         * 5.20 m one, where it reads as a pencil line round a hole. The moulding has to grow with
         * the arch or the arch does not read as architecture.
         */
        archivolt: a.archivolt,
      });
      spandrel(B, a, t, z0);
    }
  }

  // ---- PHASE D: the near wall, the same two storeys and the same order -----
  // ⚠ `estate-owner-13` found this wall was HALF A WALL and only the r10 camera hid it: it
  // stopped at 4.8 and the 4.8 m above was open to the void, with the cove and coffers ending in
  // mid-air. It is built to the same parameters as the wall it faces, and that has to survive
  // the extraction — an overlook framing puts 5-10% of the picture on it.
  if (parts.nearWall) {
    wallRun(B, {
      x: x1, z: z1, length: endLen, height: split, bays: bays.near, rotY: Math.PI,
      keys: K, uvWall, raised: raisedPanels, panelMould, panelRise, panelBevel, giltPanel: true, cornice: false, solid: SOLID, skirt: skirtLo,
      dado: dadoOn.near, openings: ops([], 'near'),
    });
    wallRun(B, {
      x: x1, z: z1, length: endLen, height: h - split, y0: split, bays: bays.near, rotY: Math.PI,
      keys: K, uvWall, raised: raisedPanels, panelMould, panelRise, panelBevel, dado: false, giltPanel: true, solid: SOLID, skirt: skirtHi,
      corniceH: upper.corniceH, corniceProj: upper.corniceProj,
      fieldLo: upper.fieldLo, fieldHi: upper.fieldHi,
    });
    for (const px of P.nearX) {
      pilaster(B, {
        x: px, y: 0.34, z: z1 - 0.14, rotY: Math.PI,
        h: h - 1.55, w: 0.66, proj: 0.15, flutes: 6,
        keys: { shaft: 'wall', cap: 'gilt' },
      });
    }
  }

  // ---- PHASE E: the ceiling ------------------------------------------------
  // A cove, a 7 x 4 coffer grid, three roses and a gilt anthemion frieze all the way round.
  // The top third of every frame in this room, and at 9.6 m it is what says the room is double
  // height even when neither the windows nor the gallery are in shot.
  if (parts.ceiling) {
    const C = P.ceiling;
    /**
     * ⚠️ **`cove` IS THE ONE KIT BUILDER WITH NO `x`/`z`, AND THE GAME'S BALLROOM IS NOT
     * CENTRED ON THE ORIGIN** (`cz = -0.65`). Rather than add a parameter to a file five other
     * views build from, the offset goes into a SECOND `FramedBin` — which is the whole reason
     * the proxy exists. With `C.x` and `C.z` both 0 this is `B` itself, by reference, so the
     * showcase's emission is unchanged down to the object identity.
     */
    const CB = (C.x || C.z)
      ? new FramedBin(bin, new THREE.Matrix4().makeTranslation(C.x, 0, C.z), o.remap ?? null)
      : B;
    cove(CB, { w: endLen, d: wallLen, y: C.y, r: C.cove, key: 'ceil' });
    cofferedCeiling(B, {
      w: endLen - C.inset, d: wallLen - C.inset, cellsX: C.cellsX, cellsZ: C.cellsZ,
      y: C.y, beam: C.beam, drop: C.drop, x: C.x, z: C.z,
      keys: { pan: 'ceil', beam: 'gilt', boss: 'gilt' },
    });
    for (const cz of C.roseZ) {
      for (const cx of C.roseX) ceilingRose(B, { r: C.roseR, y: C.y - 0.34, x: cx, z: cz, key: 'gilt' });
    }
    for (const [len, rotYv, px, pz] of [
      [endLen, 0, C.x, z0 + 0.14], [endLen, Math.PI, C.x, z1 - 0.14],
      [wallLen, HALF_PI, x0 + 0.14, C.z], [wallLen, -HALF_PI, x1 - 0.14, C.z],
    ]) {
      const g = new THREE.BoxGeometry(len, 0.46, 0.06);
      const m = new THREE.Matrix4().makeRotationY(rotYv)
        .premultiply(new THREE.Matrix4().makeTranslation(px, C.friezeY, pz));
      B.add('frieze', g, m, null);
      g.dispose();
    }
  }

  // ---- PHASE F: the pier glasses -------------------------------------------
  /**
   * ⚠ **THE DEFAULT IS STILL "SURROUND ONLY", AND THAT IS WHAT KEEPS THE SHOWCASE IDENTICAL.**
   * `room-ballroom.js` builds its own plates afterwards, against a planar reflection target, so
   * it wants the gilt surround in the bin and the plate thrown away. `mirrorPlates` is the
   * OPT-IN that changes that, and with it absent this block does exactly what it did before —
   * same call, same arguments, same discard.
   *
   * 🆕 **THE GAME OPTS IN, WITH ITS OWN MATERIAL AND ONE MERGED MESH** (`ballroom-fix-1`).
   * Four coplanar plates sharing one material are one draw call if they are one mesh and four
   * if they are not, which is the same arithmetic `room-ballroom.js` does for its own pier
   * plates in its own file.
   */
  if (parts.mirrors && o.mirrors) {
    const plates = [];
    for (const m of [...(o.mirrors.pier ?? []), ...(o.mirrors.plates ?? [])]) {
      const plate = pierGlass(B, {
        x: m.x, y: m.y, z: m.z, rotY: m.rotY ?? 0, w: m.w, h: m.h, rake: m.rake ?? 0,
        material: o.mirrorPlates ? (o.material?.mirror ?? undefined) : undefined,
      });
      if (o.mirrorPlates && plate) plates.push(plate);
    }
    if (plates.length) {
      const geos = plates.map((p) => { p.updateMatrix(); return p.geometry.clone().applyMatrix4(p.matrix); });
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      for (const p of plates) p.geometry.dispose();
      if (merged) {
        merged.computeBoundingSphere();
        const mesh = new THREE.Mesh(merged, plates[0].material);
        mesh.name = 'pier-mirrors';
        meshes.push(mesh);
      }
    }
  }

  // ---- PHASE G: dressing ---------------------------------------------------
  // `critic-estate-9`: *"the far corners and the wall opposite the windows are large stretches of
  // unbroken flat gilt-striped wall"*. Urns on the outer piers and console tables against the
  // walls, so the deepest part of the room has something to measure the depth against.
  if (parts.dressing) {
    for (const [ux, uz] of P.urns) {
      urnOnPedestal(B, { x: ux, y: 0, z: uz, h: 1.35, keys: { stone: 'stone', gilt: 'gilt' } });
    }
    for (const c of P.consoles) {
      consoleTable(B, {
        x: c.x, y: 0, z: c.z, rotY: c.rotY ?? 0, w: c.w ?? 1.55,
        keys: { wood: 'wall', gilt: 'gilt', marble: 'marbleTop' },
      });
    }
  }

  // ---- PHASE H: the balustrade on the musicians' gallery -------------------
  // The plinth and handrail go into the shared bin (they merge with the gilt and stone buckets,
  // no extra draw call); the balusters come back as ONE InstancedMesh.
  if (parts.balustrade) {
    const dl = P.deckLen, dz = P.deckZ;
    const bal = balustrade(B, {
      from: [x1 - 2.28, galleryY + 0.11, dz - dl / 2 + (o.balInset ?? 0.1)],
      to: [x1 - 2.28, galleryY + 0.11, dz + dl / 2 - (o.balInset ?? 0.1)],
      railH: 0.98, pitch: o.balPitch ?? 0.30, segs: 8,
      material: o.material?.baluster ?? null,
      keys: { rail: 'gilt', base: 'stone' },
    });
    instanced = bal.instanced;
  }

  return { plan: P, meshes, instanced };
}
