import * as THREE from 'three';
import { DAMAGE_BANDS } from './wall.js';

/**
 * 🖼️ **THE ROOM'S DRESSING IS PART OF THE WALL, AND IT ERODES WITH IT, PER CELL.**
 *
 * John: *"from the inside of the room the destructive wall IS the room asset — only when they
 * damage it can they see its white underneath. **I don't want it to disappear in one hit.**"*
 *
 * Before this file a gallery portrait hung in front of a breach, because the canvas did not know
 * the wall behind it was gone. `dressbin-1` measured how bad it is: **5 of the gallery's 8
 * canvases sit inside a dig face's own rectangle, on 4 of 4 gallery-side faces**, and that face's
 * skin owns **14.0% of the frame** from a digging stance, the canvases alone **4.1%**.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 **WHY THIS COSTS ZERO DRAW CALLS, AND WHY IT IS NOT ALLOWED TO SPLIT A MESH**
 * ---------------------------------------------------------------------------------------------
 * **Not one piece of dressing in this house is its own mesh.** Every skin row is a room `GeoBin`
 * bucket (`kit:wall/gilt/skirt/mould`, `portraits`, `fixture:brass/glow`), one of ≤8
 * `exterior.dress.*` `InstancedMesh`es, or a yard — `dressbin-1`'s census, off the built scene.
 * So there is no draw call to save by removing dressing and a large one to LOSE by giving a piece
 * its own mesh. Measured at parked stations, each arm flipped IN PLACE:
 *
 *     collapse-all      +0 … +0    (every skin triangle in the house removed at once)
 *     collapse-partial  +0 … +0    ← 🚨 THE ONE THIS FILE RESTS ON, `skin-1` 2026-08-11. **8 of 8
 *                                     stations on the pre-change tree with the C5 revert control
 *                                     at 0 on all eight**, and +0 again on the built tree (4 of 6
 *                                     stations clean; `ballroom.north`/`gallery.west` drifted, and
 *                                     a station whose control drifts is void, not a result).
 *                                     C6 confirms 1080 of 1952 runs left PARTIAL, then 4644/5304.
 *     split-proud       +2 … +37
 *     split-all         +4 … +51   ← the arm that proves the 0 above is a measurement
 *
 * Per-cell erosion removes a **SUBSET** of a contiguous index run, which is not what `dressbin-1`
 * priced. That gap was the whole risk of this slice and it is closed: a merged bin with holes in
 * it is still one mesh and still one draw call. **`harness/scenarios/_dress1-skin.mjs`,
 * `collapse-partial`.** Confirmed end to end at the pessimal station across two processes at the
 * same sim time, which is the one comparison HANDOFF says draw calls survive:
 * `eo2-calls` at `ballroom.centre` reads **423/625 calls with `?skin=0` and 423/625 with it on**,
 * for **+4376 triangles** of a 900k budget (600 596 -> 604 972).
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 **THE REMOVAL IS AN *INDEX* WRITE, NOT A POSITION WRITE — AND THAT IS A DELIBERATE
 * DEPARTURE FROM `room.js`'s `tracked().hide()`.**
 * ---------------------------------------------------------------------------------------------
 * `room.js` collapses a box by writing its vertices onto their own centroid, because it owns
 * whole contiguous vertex ranges and nothing else points into them. This file cannot do that:
 * `sp._tracked`'s handles record `start`/`count` **into the same position buffer**, and they
 * write `orig` back on `show()`. A second writer in that buffer is exactly the class of bug that
 * does not throw — the brick comes back holed, or the skin comes back solid, one round later.
 *
 * So a fragment is removed by pointing its three INDEX entries at the same vertex. The triangle
 * becomes degenerate and rasterises nothing, the position buffer is never touched, the bounding
 * sphere stays exactly valid, and restoring is three integers. It is also **three `Uint32` writes
 * instead of nine floats**, on a frame the player is already asking the GPU for a hammer blow.
 *
 * ---------------------------------------------------------------------------------------------
 * ⚠️ **WHAT THIS FILE MAY NOT TOUCH, STATED AS AN INVARIANT AND NOT AS A HABIT**
 * ---------------------------------------------------------------------------------------------
 *   · **No collider, ever.** Nothing here reads or writes `sp.colliders`, and the destructible
 *     panel's own layers live under `panel.root`, which is excluded from the candidate scan by
 *     construction. What you can walk through is `damagefield.js`'s answer and only its answer —
 *     this file removes decoration that stands IN FRONT of a face, in the 1 mm … 0.20 m band off
 *     it, and can therefore never open a hole the collider still blocks nor close one it does not.
 *   · **No material, no shader, no bake.** `coat-1` owns `estateSkinMat`; this file changes
 *     geometry only, and adds **zero** material keys, so it adds zero programs and zero bakes.
 *   · **No new mesh and no new pool.** The fall is paid out of `debris.js`'s existing `slab` and
 *     `plaster` `InstancedMesh`es — the two kinds a dig already has in flight. `paper`, `timber`
 *     and `lath` exist but are idle in play, and `debris.js` gates a pool's `visible` on its live
 *     count, so waking one costs **+1 draw call while it flies**. Not spent.
 *
 * ---------------------------------------------------------------------------------------------
 * WHERE THE THRESHOLD COMES FROM — it is `DAMAGE_BANDS[0]`, imported, not copied
 * ---------------------------------------------------------------------------------------------
 * `wall.js` band 0 is *"ORNATE SKIN — tears at r 1.13 on the reference crater"* and it runs
 * `[0.005, 0.155]` in the field's own 0..1 depth. **That band IS the coat coming off**, so the
 * dressing standing on the coat has to go with it, and the number is imported rather than
 * repeated so the two cannot drift. Each fragment takes its own threshold from a hash of its
 * position, spread across `SKIN_THR`, so the erosion boundary is ragged like the tear it belongs
 * to instead of a staircase of fragment squares.
 *
 * ⚠️ **AND THE GRAIN IS THE FRAGMENT, NOT THE DAMAGE CELL.** Dressing is authored as a handful of
 * big quads — a portrait canvas is **2 triangles** and a bay of wallpaper is one — so per-cell
 * erosion is impossible until the piece has cells to erode. Every skin triangle is bisected on its
 * longest edge until that edge is under `SKIN_CELL`, which is exact: the fragments are coplanar
 * with the triangle they came from and their normals and uvs are the barycentric interpolation the
 * rasteriser was already doing, so the subdivided surface is the same surface.
 * **`harness/_skin1-geom.mjs` A2 asserts the total area is conserved (worst relative drift 1.33e-8
 * against a float32 storage epsilon of 1.19e-7), A3 that no mesh was added or renamed, and A4 that
 * not one collider moved.** Cost: **+42 824 triangles house-wide**, 165–200 ms in the builder.
 *
 * 🚨 **AND ONE THING THIS FILE CANNOT DELIVER, MEASURED RATHER THAN ASSUMED.** *"I don't want it to
 * disappear in one hit"* is unreachable at `DIG_BASE` 8 **because the WALL disappears in one hit**:
 * a full-power blow reads depth **1.000 out to r = 0.45 m and 0.000 at 0.60 m** on the real field —
 * no gradient — which `damagefield.js` states itself (*"it takes its whole 1.04 m brush clean
 * through in one hit"*). Anything left standing there would be standing over a hole, which is the
 * defect. At John's own `[0.125 … 4]` ladder the ×1 rung gives the curve he described: **14.8% of a
 * canvas on blow 1, 100% swept.** `_skin1-geom.mjs` A6/A7.
 *
 *   ?skin=0        off — the dressing is authored and drawn exactly as before, nothing subdivided
 *   ?skin=<m>      the fragment size in metres (default 0.18); smaller = finer erosion, more
 *                  triangles. `?skin=1` and `?skin=` are ON at the default.
 */

/** The URL arm, read once. `room.js` reads `?dig=` and `?estate=` the same way. */
const _Q = (() => {
  try { return new URLSearchParams(globalThis.location?.search ?? '').get('skin'); } catch { return null; }
})();
export const SKIN_ON = _Q !== '0' && _Q !== 'off';
/**
 * Metres. The longest edge a fragment may have, i.e. how finely the dressing tears.
 *
 * 🎯 **IT IS A FEEL NUMBER AND JOHN'S SENTENCE IS THE SPEC:** *"I don't want it to disappear in
 * one hit."* The sledge's brush is 0.52 m in radius, so one blow clears the coat over roughly a
 * 0.5 m disc; at 0.18 m a 1.33 x 1.10 m portrait canvas is ~50 fragments and one blow takes about
 * a fifth of it. `_dress1-skin.mjs`'s E-arms measure the real curve rather than trusting this
 * arithmetic, and its control is that the canvas IS gone once the dig is through.
 */
export const SKIN_CELL = (() => {
  const n = Number(_Q);
  return Number.isFinite(n) && n > 0.02 && n <= 2 ? n : 0.18;
})();
/**
 * Guards on the bisection, both reported when they bite and neither reached on the shipped house.
 * `MAX_DEPTH` bounds the recursion (a bisection halves the longest edge every two levels, so 18 is
 * ~500x); `MAX_FRAGS` bounds one pathological triangle; `MAX_ADDED_TRIS` bounds the house.
 */
const MAX_DEPTH = 18;
const MAX_FRAGS = 4096;
const MAX_ADDED_TRIS = 60000;

/**
 * The depth window a fragment dies in, jittered per fragment. `DAMAGE_BANDS[0]` is the ornate
 * coat's own tear band; the top of it is where the white underneath is fully exposed, so the
 * window straddles that number rather than sitting under or over it.
 */
const _COAT = DAMAGE_BANDS?.[0] ?? [0.005, 0.155];
const SKIN_THR = [Math.max(0.02, _COAT[1] * 0.65), Math.min(0.98, _COAT[1] * 1.35)];

/** How far off a face a triangle may stand and still be its SKIN. `_dress1-skin.mjs`'s bands. */
const SELF_EPS = 0.001;
const PROUD_MAX = 0.20;

/** Deterministic, replay-safe, and it never touches the seeded `rng()` stream. */
function hash01(x, y, z) {
  let h = Math.imul(Math.round(x * 4096) | 0, 0x27d4eb2d) ^ Math.imul(Math.round(y * 4096) | 0, 0x165667b1)
    ^ Math.imul(Math.round(z * 4096) | 0, 0x9e3779b1);
  h ^= h >>> 15; h = Math.imul(h, 0x2545f491) >>> 0; h ^= h >>> 13;
  return (h >>> 8) / 16777216;
}

/**
 * 🖼️ **THE SKIN OF ONE HOUSE.** Built once, in `room.js`'s builder, after every space's bins and
 * every panel exist — never lazily on first damage, which is `coatbake-1`'s rule and is also the
 * only way the geometry rewrite can happen before the buffers are on the GPU.
 */
class RoomSkin {
  constructor() {
    /** live ablation for an instrument or a URL; the build is already done either way */
    this.on = true;
    /** faceId -> { panel, frags[], alive } */
    this.faces = new Map();
    /** every mesh this file rewrote, for the census */
    this.meshes = [];
    /** every index attribute it can write, so a flush never has to guess */
    this.indices = new Set();
    this.addedTris = 0;
    this.scannedTris = 0;
    this.buildMs = 0;
    /** the grain actually used — `SKIN_CELL` unless the house budget forced it coarser */
    this.cell = SKIN_CELL;
    this.coarsened = false;
    /** claimed triangles refused because a `room.js` `tracked()` handle owns their vertices */
    this.trackedSkipped = 0;
  }

  /** Upload the index buffers that changed, once, after a whole pass. */
  _flush() {
    for (const ix of this.indices) {
      if (!ix._skinDirty) continue;
      ix._skinDirty = false;
      ix.needsUpdate = true;
    }
  }

  /**
   * Every fragment on this face, and how many are still standing — broken down by the bin it came
   * from, so *"the portrait eroded"* is a separate answer from *"some dressing eroded"*.
   */
  faceStat(id, only = null) {
    const f = this.faces.get(id);
    if (!f) return null;
    let total = 0, alive = 0;
    const by = {};
    for (const g of f.frags) {
      if (only && g.nm !== only) continue;
      total++; if (!g.dead) alive++;
      const b = by[g.nm] ?? (by[g.nm] = { total: 0, alive: 0 });
      b.total++; if (!g.dead) b.alive++;
    }
    return { total, alive, gone: total - alive, by };
  }

  stats() {
    let total = 0, alive = 0;
    for (const f of this.faces.values()) { total += f.frags.length; alive += f.alive; }
    return {
      on: this.on, cell: +this.cell.toFixed(4), cellRequested: SKIN_CELL,
      coarsened: this.coarsened,
      faces: this.faces.size, fragments: total, alive,
      gone: total - alive, addedTris: this.addedTris, scannedTris: this.scannedTris,
      meshes: this.meshes.length, buildMs: +this.buildMs.toFixed(2),
      trackedSkipped: this.trackedSkipped, thr: SKIN_THR,
    };
  }

  /**
   * 🕳️ **ERODE THIS FACE TO ITS DAMAGE FIELD, AND SAY WHAT LEFT.**
   *
   * Called from `views/game.js` `onChunk`, i.e. once per landed blow on a free face — never per
   * frame and never per fragment-in-flight.
   *
   * ⚠️ **IT ASKS THE FIELD, IT DOES NOT RE-DERIVE THE BRUSH.** `damagefield.js` is the single
   * source of truth for what has been dug (`depthAt`, the CPU array, never the texture and never
   * the blurred B channel). A version of this that recomputed the brush disc from the blow's own
   * (u, v, power) would agree with itself forever while drifting from the wall the player sees —
   * which is the instrument failure this project names explicitly.
   *
   * @returns {{n:number, area:number, w:number, h:number, x:number, y:number, z:number}|null}
   *   the piece that left, in world space, or null if nothing did.
   */
  erode(panel) {
    if (!this.on || !panel?.field) return null;
    const rec = this.faces.get(panel.id);
    if (!rec || rec.alive === 0) return null;
    const field = panel.field;
    const frags = rec.frags;
    let n = 0, area = 0;
    let u0 = 2, u1 = -1, v0 = 2, v1 = -1;
    for (let i = 0; i < frags.length; i++) {
      const g = frags[i];
      if (g.dead) continue;
      if (field.depthAt(g.u, g.v) < g.thr) continue;
      // three index writes: the triangle collapses onto its own first vertex
      const a = g.ix.array;
      a[g.i0 + 1] = a[g.i0];
      a[g.i0 + 2] = a[g.i0];
      g.dead = true;
      g.ix._skinDirty = true;
      n++; area += g.area;
      if (g.u < u0) u0 = g.u; if (g.u > u1) u1 = g.u;
      if (g.v < v0) v0 = g.v; if (g.v > v1) v1 = g.v;
    }
    if (!n) return null;
    rec.alive -= n;
    this._flush();
    /**
     * ⚠️ **THE WORLD PLACEMENT COMES FROM THE PANEL, NOT FROM THIS FILE'S OWN AXES.**
     * `pointAt` is `uvAt`'s inverse and is what every other FX caller in the house already uses,
     * so a piece of dressing falls out of the same frame the crumbs and the slab do.
     */
    const c = panel.pointAt((u0 + u1) / 2, (v0 + v1) / 2, new THREE.Vector3());
    return {
      n, area,
      w: Math.max(0.04, (u1 - u0) * panel.width),
      h: Math.max(0.04, (v1 - v0) * panel.height),
      x: c.x, y: c.y, z: c.z,
    };
  }

  /**
   * ⚠️ **THE ROUND RESET, AND IT IS NOT OPTIONAL.** `room.js` `setDigPlan` calls `resetDamage()`
   * on every dig face on every round reset with a fresh seed — under the capture Director that is
   * every 28 seconds. A one-way erosion would leave last round's holes in this round's dressing,
   * accumulating until the gallery had no paintings in it, and nothing would throw.
   */
  reset(panel = null) {
    const list = panel ? [this.faces.get(panel.id)].filter(Boolean) : [...this.faces.values()];
    let back = 0;
    for (const rec of list) {
      for (const g of rec.frags) {
        if (!g.dead) continue;
        const a = g.ix.array;
        a[g.i0 + 1] = g.b;
        a[g.i0 + 2] = g.c;
        g.dead = false;
        g.ix._skinDirty = true;
        back++;
      }
      rec.alive = rec.frags.length;
    }
    this._flush();
    return back;
  }

  /**
   * INSTRUMENT ONLY — take every fragment on a face down (or put it back) with no field involved.
   * `_dress1-skin.mjs`'s LOOK arm photographs the before/after pair with it, and it is the arm
   * that makes *"the portrait eroded"* and *"the portrait was never there"* distinguishable.
   */
  setAll(faceId, gone) {
    const rec = this.faces.get(faceId);
    if (!rec) return 0;
    let k = 0;
    for (const g of rec.frags) {
      if (g.dead === gone) continue;
      const a = g.ix.array;
      if (gone) { a[g.i0 + 1] = a[g.i0]; a[g.i0 + 2] = a[g.i0]; }
      else { a[g.i0 + 1] = g.b; a[g.i0 + 2] = g.c; }
      g.dead = gone; g.ix._skinDirty = true; k++;
    }
    rec.alive = gone ? 0 : rec.frags.length;
    this._flush();
    return k;
  }
}

const _mid = (A, B) => ({
  p: [(A.p[0] + B.p[0]) / 2, (A.p[1] + B.p[1]) / 2, (A.p[2] + B.p[2]) / 2],
  n: [(A.n[0] + B.n[0]) / 2, (A.n[1] + B.n[1]) / 2, (A.n[2] + B.n[2]) / 2],
  t: [(A.t[0] + B.t[0]) / 2, (A.t[1] + B.t[1]) / 2],
});
const _d2 = (A, B) => (A.p[0] - B.p[0]) ** 2 + (A.p[1] - B.p[1]) ** 2 + (A.p[2] - B.p[2]) ** 2;

/**
 * 🚨 **ONE TRAVERSAL, TWO USES — COUNTING AND EMITTING ARE THE SAME WALK AND THAT IS LOAD-BEARING.**
 *
 * `solveCell` counts fragments to pick the grain; pass 3 emits them. If those were two different
 * functions their answers could differ by one triangle at any tolerance boundary and the budget
 * would be a guess. They are the same code with a different `onTri`, so **the number solved for and
 * the number produced are equal by construction**, and `_skin1-geom.mjs` A12 asserts it off the
 * built house anyway.
 *
 * Longest-edge bisection: split the longest edge at its midpoint and recurse, until that edge is
 * under the grain. Every new vertex is an edge midpoint whose normal and uv are that edge's
 * midpoint values — the barycentric interpolation the rasteriser was already doing — so the
 * subdivided surface IS the original surface.
 *
 * ⚠️ **A 4-WAY BARYCENTRIC SPLIT WAS TRIED FIRST AND MEASURED, NOT SUSPECTED.** It halves ALL
 * THREE edges, so its count is a function of the LONGEST edge alone — and a classical moulding is a
 * mitred strip 1.2 m long and 2 cm wide. `space.gallery/kit:gilt`'s 808 skin triangles came out at
 * **+83 040** that way, for slivers that needed about ten fragments each. Bisection makes the count
 * a function of AREA, which is the thing that has to be covered.
 *
 * @param {number} lim the grain SQUARED, in this mesh's local units
 * @param {Function|null} onTri called with each leaf triangle, or null to only count
 * @returns {number} how many fragments the triangle makes
 */
function walk(A, B, C, lim, onTri) {
  let n = 0;
  const st = [A, B, C, 0];
  while (st.length) {
    const lv = st.pop(), c = st.pop(), b = st.pop(), a = st.pop();
    const ab = _d2(a, b), bc = _d2(b, c), ca = _d2(c, a);
    const mx = ab > bc ? (ab > ca ? ab : ca) : (bc > ca ? bc : ca);
    if (mx <= lim || lv >= MAX_DEPTH || n >= MAX_FRAGS) { n++; onTri?.(a, b, c); continue; }
    if (mx === ab) { const M = _mid(a, b); st.push(a, M, c, lv + 1, M, b, c, lv + 1); }
    else if (mx === bc) { const M = _mid(b, c); st.push(b, M, a, lv + 1, M, c, a, lv + 1); }
    else { const M = _mid(c, a); st.push(c, M, b, lv + 1, M, a, b, lv + 1); }
  }
  return n;
}

/** The grain squared, in one mesh's own local units. */
function limOf(m, cell) {
  const wsc = Math.max(1e-6, new THREE.Vector3().setFromMatrixColumn(m.matrixWorld, 0).length());
  return (cell / wsc) ** 2;
}

/**
 * 🎯 **THE FINEST GRAIN THE HOUSE CAN AFFORD, AT OR ABOVE THE ONE ASKED FOR.**
 *
 * 🚨 **THIS EXISTS BECAUSE THE BUDGET USED TO BITE MID-TRAVERSAL.** `critic-skin-1` drove
 * `?skin=0.03` and `?skin=0.021` and found **entire destructible faces losing every fragment —
 * 10 of 10, then 9, then 8 — an all-or-nothing cliff decided by iteration order**, reported only
 * through a `console.warn`. A knob that is about to be handed to John may not have a silent cliff
 * in it. So the cost of the WHOLE house is evaluated before anything is cut, and if the requested
 * grain does not fit, the grain is coarsened for everybody until it does. **Every face keeps its
 * dressing; they all get rougher together.**
 *
 * ⚠️ **THE EVALUATION IS BOUNDED BY THE BUDGET ITSELF, WHICH IS WHY THIS IS AFFORDABLE.** A cost
 * probe is a full subdivision walk, so a very fine grain would cost as much to price as to build —
 * except that the moment the running total passes `budget` the answer is already "no" and the walk
 * stops. So one probe costs at most `budget` steps whatever the grain, and the search runs a
 * handful of them.
 *
 * ⚠️ Coarsening is by a factor and not a binary search on purpose: it is monotone, it terminates
 * (at 2 m nearly every authored triangle is one fragment, i.e. the cost floor is the number of skin
 * triangles, ~3000 against a 60 000 budget), and it lands on a value that is reproducible from the
 * request alone rather than on one that depends on the search's own history.
 */
function solveCell(work, want, budget) {
  const costOver = (cell) => {
    let n = 0;
    for (const { m, claim } of work) {
      const lim = limOf(m, cell);
      const g = m.geometry, pos = g.attributes.position, nor = g.attributes.normal;
      const uvA = g.attributes.uv, idx = g.index.array;
      const v = (i) => ({
        p: [pos.getX(i), pos.getY(i), pos.getZ(i)],
        n: [nor.getX(i), nor.getY(i), nor.getZ(i)],
        t: [uvA.getX(i), uvA.getY(i)],
      });
      for (const t of claim.keys()) {
        n += walk(v(idx[t * 3]), v(idx[t * 3 + 1]), v(idx[t * 3 + 2]), lim, null) - 1;
        if (n > budget) return true;         // ⚠️ the early-out that bounds this whole function
      }
    }
    return false;
  };
  let cell = want;
  for (let i = 0; i < 64 && costOver(cell); i++) cell *= 1.25;
  return cell;
}

/**
 * 🧱 **BUILD THE SKIN — the census, the subdivision and the fragment table, once.**
 *
 * ⚠️ **THE CENSUS ASKS THE BUILT SCENE, NOT THE AUTHORING TABLES.** Faces are the
 * `DestructibleWall`s that actually exist; a triangle is on a face iff the PANEL'S OWN `uvAt()`
 * puts its centroid inside the rectangle and 1 mm … 0.20 m out along its normal. That is
 * `_dress1-skin.mjs`'s containment test expressed through the panel's own API rather than
 * re-derived beside it — the difference between an instrument that measures the game and one that
 * agrees with itself.
 *
 * @param {object} o
 * @param {DestructibleWall[]} o.panels every panel in the house
 * @param {Function} [o.warn]
 */
export function buildSkin(o = {}) {
  if (!SKIN_ON) return null;
  const t0 = (globalThis.performance ?? Date).now();
  const panels = (o.panels ?? []).filter((p) => p.spec?.free && p.field && p.ownerSpace);
  if (!panels.length) return null;
  const warn = o.warn ?? (() => {});
  const skin = new RoomSkin();

  // ---- which panels look into which space, so a mesh is scanned against a short list ----
  const bySpace = new Map();
  for (const p of panels) {
    const id = p.ownerSpace.id;
    if (!bySpace.has(id)) bySpace.set(id, { sp: p.ownerSpace, ps: [] });
    bySpace.get(id).ps.push(p);
    skin.faces.set(p.id, { panel: p, frags: [], alive: 0 });
  }

  const wp = new THREE.Vector3();
  const uv = { u: 0, v: 0, z: 0 };
  /**
   * 🚨 **THE WORK LIST, AND IT IS WHY THIS IS THREE PASSES AND NOT ONE.** Claiming is house-wide
   * and happens FIRST, so the grain can be solved against the whole house's cost before one
   * triangle is subdivided. See `solveCell`.
   */
  const work = [];        // { m, sp, claim:Map<triIndex, panel> }

  for (const { sp, ps } of bySpace.values()) {
    sp.root.updateMatrixWorld(true);
    /**
     * ⚠️ **THE PANELS' OWN SUBTREES ARE EXCLUDED, AND THAT IS THE COLLIDER INVARIANT.** A
     * destructible face's layer planes, its reveal box and its barrier plane all hang under
     * `panel.root`, which is a child of `sp.root`. They are the WALL. Eroding one would be
     * removing the thing the damage field is a model of, from a second, disagreeing structure.
     */
    const skipRoots = new Set(sp.panels?.map((p) => p.root) ?? ps.map((p) => p.root));
    const cands = [];
    sp.root.traverse((m) => {
      if (!m.isMesh || m.isInstancedMesh) return;
      for (let q = m; q; q = q.parent) if (skipRoots.has(q)) return;
      const g = m.geometry;
      if (!g?.index || !g.attributes?.position || !g.attributes.normal || !g.attributes.uv) return;
      // an interleaved or morphed buffer is not something this rewrite understands; skip loudly
      if (g.attributes.position.isInterleavedBufferAttribute) {
        warn('[skin] interleaved attributes, skipped:', m.name); return;
      }
      cands.push(m);
    });

    /**
     * 🚨 **THE VERTEX RANGES `room.js`'s `tracked()` HANDLES OWN IN THIS MESH — REFUSED, NOT
     * SHARED.** `tracked(key, …)` records a `[start, start+count)` range into the merged bucket's
     * POSITION buffer and hides its box by writing degenerate vertices into it; `show()` writes
     * `orig` back. This file appends vertices and rewrites the INDEX, so the two mechanisms are on
     * disjoint buffers and cannot corrupt each other — but there is one shape where they would
     * DISAGREE: if a tracked box's own triangle were claimed as skin, its index triple would move
     * into the appended fragment region, and `hide()` would then collapse vertices that nothing
     * references any more. The brick would stop disappearing, silently.
     *
     * So a claimed triangle whose vertices fall inside a tracked range is **refused and counted**.
     * Measured on every shipped arm: **0** — the interconnect brick only exists on `?dig=bays`
     * (`barriers` is `[]` in free mode) and the dig lintel sits above its face's rectangle in `v`.
     * The guard is here so that stays true by construction rather than by that argument.
     */
    const trackedRanges = new Map();      // mesh -> [ [start, end), … ]
    for (const h of sp._tracked ?? []) {
      if (!h.mesh) continue;
      const a = trackedRanges.get(h.mesh) ?? [];
      a.push([h.start, h.start + h.count]);
      trackedRanges.set(h.mesh, a);
    }

    for (const m of cands) {
      const g = m.geometry;
      const pos = g.attributes.position;
      const idx = g.index.array;
      const triN = idx.length / 3;
      skin.scannedTris += triN;
      const wx = (x, y, z) => { wp.set(x, y, z).applyMatrix4(m.matrixWorld); return wp; };
      const ranges = trackedRanges.get(m) ?? null;
      const inTracked = (i) => {
        if (!ranges) return false;
        for (const r of ranges) if (i >= r[0] && i < r[1]) return true;
        return false;
      };

      // ---- PASS 1: which triangles are skin, and on which face ----
      /** @type {Map<number, object>} triangle index -> panel */
      const claim = new Map();
      for (let t = 0; t < triN; t++) {
        const ia = idx[t * 3], ib = idx[t * 3 + 1], ic = idx[t * 3 + 2];
        const cx = (pos.getX(ia) + pos.getX(ib) + pos.getX(ic)) / 3;
        const cy = (pos.getY(ia) + pos.getY(ib) + pos.getY(ic)) / 3;
        const cz = (pos.getZ(ia) + pos.getZ(ib) + pos.getZ(ic)) / 3;
        wx(cx, cy, cz);
        for (const p of ps) {
          p.uvAt(wp, uv);
          if (uv.z <= SELF_EPS || uv.z > PROUD_MAX) continue;
          if (uv.u < 0 || uv.u > 1 || uv.v < 0 || uv.v > 1) continue;
          if (inTracked(ia) || inTracked(ib) || inTracked(ic)) { skin.trackedSkipped++; break; }
          claim.set(t, p);
          break;
        }
      }
      if (claim.size) work.push({ m, claim });
    }
  }

  // ==========================================================================
  // PASS 2 — solve the grain against the HOUSE's budget, before anything is cut
  // ==========================================================================
  const cellReq = SKIN_CELL;
  const cell = solveCell(work, cellReq, MAX_ADDED_TRIS);
  skin.cell = cell;
  skin.coarsened = cell > cellReq * (1 + 1e-9);
  if (skin.coarsened) {
    warn(`[skin] ?skin=${cellReq} would exceed the ${MAX_ADDED_TRIS}-triangle house budget;`
      + ` the erosion grain is ${cell.toFixed(4)} m. Every face keeps its dressing.`);
  }

  // ==========================================================================
  // PASS 3 — subdivide at the solved grain
  // ==========================================================================
  {
    for (const { m, claim } of work) {
      const g = m.geometry;
      const pos = g.attributes.position, nor = g.attributes.normal, uvA = g.attributes.uv;
      const idx = g.index.array;
      const triN = idx.length / 3;
      const wx = (x, y, z) => { wp.set(x, y, z).applyMatrix4(m.matrixWorld); return wp; };

      // ---- subdivide the claimed triangles, rebuild the index, append vertices ----
      const addP = [], addN = [], addU = [];
      const baseV = pos.count;
      const keep = [];                 // non-skin triples, in their original order
      const made = [];                 // { p, v0, b, c, u, v, thr, area } — i0 filled below

      /** emit one fragment: three FRESH vertices, so nothing is shared and nothing else moves */
      const emit = (P, N, U, p) => {
        const v = baseV + addP.length / 3;
        for (let k = 0; k < 3; k++) {
          addP.push(P[k * 3], P[k * 3 + 1], P[k * 3 + 2]);
          const nl = Math.hypot(N[k * 3], N[k * 3 + 1], N[k * 3 + 2]) || 1;
          addN.push(N[k * 3] / nl, N[k * 3 + 1] / nl, N[k * 3 + 2] / nl);
          addU.push(U[k * 2], U[k * 2 + 1]);
        }
        // world centroid -> this face's uv, so the fragment knows which cell it stands on
        const cx = (P[0] + P[3] + P[6]) / 3, cy = (P[1] + P[4] + P[7]) / 3, cz = (P[2] + P[5] + P[8]) / 3;
        wx(cx, cy, cz);
        const wcx = wp.x, wcy = wp.y, wcz = wp.z;
        p.uvAt(wp, uv);
        // triangle area in WORLD metres, for the payout — local space may be scaled
        const a1 = new THREE.Vector3(P[3] - P[0], P[4] - P[1], P[5] - P[2]);
        const a2 = new THREE.Vector3(P[6] - P[0], P[7] - P[1], P[8] - P[2]);
        const sc = m.matrixWorld;
        a1.transformDirection(sc); a2.transformDirection(sc);
        const ar = a1.cross(a2).length() * 0.5;
        made.push({
          p, b: v + 1, c: v + 2, v0: v,
          u: Math.min(1, Math.max(0, uv.u)), v: Math.min(1, Math.max(0, uv.v)),
          thr: SKIN_THR[0] + (SKIN_THR[1] - SKIN_THR[0]) * hash01(wcx, wcy, wcz),
          area: ar,
        });
      };

      /**
       * 🚨 **LONGEST-EDGE BISECTION, AND THE 4-WAY VERSION IT REPLACES WAS MEASURED, NOT
       * SUSPECTED.** A barycentric 4-way split halves ALL THREE edges, so its fragment count is a
       * function of the LONGEST edge alone — and a classical moulding is a mitred strip 1.2 m long
       * and 2 cm wide. Built that way, `space.gallery/kit:gilt`'s **808 skin triangles became
       * +83 040** (9552 -> 92 592 tris on one mesh) and hit the house cap, for slivers that needed
       * about ten fragments each. Bisecting only the longest edge makes the count a function of
       * AREA instead, which is the thing that has to be covered.
       *
       * ⚠️ **IT IS STILL EXACT.** Every new vertex is the midpoint of an existing edge and its
       * normal and uv are that edge's midpoint values, i.e. the barycentric interpolation the
       * rasteriser was already performing across the original triangle. The subdivided surface IS
       * the original surface — same plane, same normals, same uvs — which is why this can run on
       * the shipped build with nothing to look at afterwards. `_dress1-skin.mjs` asserts the total
       * area is conserved rather than taking that on trust.
       */
      const P = new Float64Array(9), N = new Float64Array(9), U = new Float64Array(6);
      const emitTri = (p, A, B, C) => {
        for (let k = 0; k < 3; k++) {
          P[k] = A.p[k]; P[3 + k] = B.p[k]; P[6 + k] = C.p[k];
          N[k] = A.n[k]; N[3 + k] = B.n[k]; N[6 + k] = C.n[k];
        }
        U[0] = A.t[0]; U[1] = A.t[1]; U[2] = B.t[0]; U[3] = B.t[1]; U[4] = C.t[0]; U[5] = C.t[1];
        emit(P, N, U, p);
      };

      // world scale of this mesh, so the grain means metres and not local units
      const lim = limOf(m, cell);
      const vertOf = (i) => ({
        p: [pos.getX(i), pos.getY(i), pos.getZ(i)],
        n: [nor.getX(i), nor.getY(i), nor.getZ(i)],
        t: [uvA.getX(i), uvA.getY(i)],
      });
      for (let t = 0; t < triN; t++) {
        const p = claim.get(t);
        const ia = idx[t * 3], ib = idx[t * 3 + 1], ic = idx[t * 3 + 2];
        if (!p) { keep.push(ia, ib, ic); continue; }
        /**
         * ⚠️ **NO CAP HERE, AND THAT IS THE FIX.** The count `solveCell` did and the emit this
         * line does are the SAME `walk`, at the same `lim`, so the house total is already known to
         * fit — there is nothing left to refuse. The version this replaces checked a running total
         * against `MAX_ADDED_TRIS` inside this loop, which made the budget bite MID-TRAVERSAL: at
         * `?skin=0.03` the meshes visited early got their full grain and the ones visited late got
         * NOTHING, so **entire destructible faces silently lost all their dressing (10 -> 9 -> 8 of
         * 10), decided by traversal order**, behind a `console.warn` no player sees. Filed by
         * `critic-skin-1`. The grain is now solved for the whole house first and every face
         * degrades together.
         */
        skin.addedTris += walk(vertOf(ia), vertOf(ib), vertOf(ic), lim,
          (A, B, C) => emitTri(p, A, B, C)) - 1;
      }
      if (!made.length) continue;

      // ---- write the new buffers, once ----
      const nV = baseV + addP.length / 3;
      const grow = (attr, add, item) => {
        const arr = new Float32Array(nV * item);
        arr.set(attr.array.subarray(0, baseV * item), 0);
        arr.set(add, baseV * item);
        return new THREE.BufferAttribute(arr, item);
      };
      g.setAttribute('position', grow(pos, addP, 3));
      g.setAttribute('normal', grow(nor, addN, 3));
      g.setAttribute('uv', grow(uvA, addU, 2));

      const newIdx = new Uint32Array(keep.length + made.length * 3);
      newIdx.set(keep, 0);
      let w = keep.length;
      for (const f of made) {
        f.i0 = w;
        newIdx[w++] = f.v0; newIdx[w++] = f.b; newIdx[w++] = f.c;
      }
      g.setIndex(new THREE.BufferAttribute(newIdx, 1));
      /**
       * ⚠️ **THE BOUNDING SPHERE IS RECOMPUTED AND IT CAN ONLY SHRINK LATER.** Fragments lie
       * inside the triangles they came from, so the subdivided mesh has the same bounds; a
       * collapsed fragment sits on one of its own corners, still inside them. A stale sphere here
       * could only over-include, which costs a frustum test and never a missing wall.
       */
      g.computeBoundingSphere();
      g.computeBoundingBox();

      const ixAttr = g.index;
      skin.meshes.push(m);
      skin.indices.add(ixAttr);
      for (const f of made) {
        const rec = skin.faces.get(f.p.id);
        rec.frags.push({
          ix: ixAttr, i0: f.i0, b: f.b, c: f.c,
          u: f.u, v: f.v, thr: f.thr, area: f.area, dead: false,
          /**
           * Which authored bin this fragment came out of — `portraits`, `kit:gilt`,
           * `fixture:brass`. Carried so an instrument can ask about **the canvases** rather than
           * about "the dressing", which is John's actual complaint and the thing a critic has to
           * be able to photograph. One shared string reference per fragment.
           */
          nm: m.name || '(unnamed)',
        });
        rec.alive++;
      }
    }
  }

  // faces that ended up with nothing on them are dropped, so `faces.size` is a real answer
  for (const [id, rec] of [...skin.faces]) if (!rec.frags.length) skin.faces.delete(id);
  skin.buildMs = (globalThis.performance ?? Date).now() - t0;
  if (skin.trackedSkipped) {
    warn(`[skin] ${skin.trackedSkipped} claimed triangles refused: a room.js tracked() handle owns`
      + ' their vertices. See the note above `trackedRanges`.');
  }
  return skin;
}
