#!/usr/bin/env node
/**
 * 🚪 **CAN ONE SLAB CONTAIN A DOORWAY — the GEOMETRY half, and it measures METRES OF SOLID
 * MASONRY STANDING INSIDE AN APERTURE SPAN.**
 *
 *   node harness/_ap3-geom.mjs                 the tree as it is
 *   node harness/_ap3-geom.mjs --preview       …with `docs/slices/task-aperture-3.md`'s edits
 *   node harness/_ap3-geom.mjs --spans         print every offending box
 *
 * ---------------------------------------------------------------------------------------------
 * THE CLAIM, AND WHAT IT COST TO RE-DERIVE IT
 * ---------------------------------------------------------------------------------------------
 * `docs/agents-resume-2026-08-11.md` says *"`room.js` `buildWall` cannot handle a cut inside a
 * cut — do the wiring without fixing that and 3.04 m of solid masonry stands inside the slab.
 * `aperture-2`'s report has the three exact edits."* **That report does not exist on disk**;
 * `3.04`, "three edits" and "cut inside a cut" hit only `agents-resume` itself. This file is the
 * re-derivation, and it disagrees with the number: **2.960 m, not 3.04 m** (see A1).
 *
 * ---------------------------------------------------------------------------------------------
 * THE MECHANISM, IN TERMS OF THE WALK
 * ---------------------------------------------------------------------------------------------
 * `buildWall` sorts `o.cuts` by CENTRE (`(a, b) => a.u - b.u`) and then tests each cut's LEFT EDGE
 * against a running `cursor` that only ever advances to a cut's RIGHT edge
 * (`cursor = Math.max(cursor, c.u + c.w / 2)`). Those two orderings agree for as long as the cuts
 * are disjoint, and they are disjoint everywhere in the shipped house.
 *
 * Nest one cut inside another and they come apart. A 15.40 m slab cut centred at z −16.30 and a
 * 2.08 m doorway centred at −20.00 sort DOORWAY FIRST, because −20.00 < −16.30 — while the slab's
 * left edge, −24.00, is 3 m to the LEFT of the doorway's. So the walk reaches the doorway with
 * `cursor` still at the wall's start, sees a gap of 2.96 m in front of it, and fills that gap with
 * a **full-storey solid box plus a skirting board** — inside the very span the slab is supposed to
 * be. The slab cut, visited second, then finds its own left edge already behind the cursor and
 * emits no infill at all, so nothing anywhere throws or looks wrong from outside.
 *
 * Three separate artefacts fall out of it, and this file reports all three:
 *   1. **the infill** — 2.960 m × 4.80 m, floor to ceiling, with a collider. You dig the wall away
 *      and cannot walk through it.
 *   2. **the doubled lintels** — the doorway's lintel is emitted over the slab's lintel, 2.08 m ×
 *      2.12 m of coincident wall in one merged bin, twice per face.
 *   3. **a degenerate box** — `-16.3 + 7.7` is `-8.600000000000001`, so `cursor < o.u1` is true by
 *      one ULP at the end of the slab and the trailing branch emits a **zero-width full-height
 *      box and skirt**. This one is on `?slab=1` ALREADY, with or without any doorway.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 EVERY ASSERTION SHIPS A CONTROL THAT MUST FAIL, AND EVERY CONTROL RUNS ON EVERY RUN
 * ---------------------------------------------------------------------------------------------
 * The meter below reports "0.000 m" when a wall is clean. It would report exactly the same
 * "0.000 m" if it were pointed at the wrong plane, the wrong height band or an empty collider
 * list — the "result-shaped output instead of an error" that HANDOFF traces through sixteen
 * instrument failures. So:
 *
 *   **C1** points the SAME meter at the 2.08 m pier the shipped default arm really does stand
 *          between two dig spans, and requires ≥ 2.00 m back. A blind meter fails C1.
 *   **C2** points it at the dig faces on that same arm, where nothing stands, and requires 0.000.
 *          C1 and C2 together bracket it: one must be loud, the other silent.
 *   **C3** proves the A/B is a real switch — `buildTestRoom`'s own `o.panels` ablation carrying
 *          `PANELS_AUTHORED`, not a hand-edited table — by requiring the arms to DIFFER in the
 *          panels they built and in the width of the face they built.
 *   **C4** proves the census is not empty.
 *   **C5** proves the fabricated overhang row reached `buildWall` at all, by finding the lintel it
 *          cut. Without C5, A3's "no refusal was raised" could mean "nothing to refuse".
 *   **C6** points the SAME meter at the fabricated window on the arm where nothing contains it and
 *          requires the sill box to BE there. A "raised sill" fixture whose sill is secretly 0
 *          would pass A4 in silence; C6 is what makes A4 mean something.
 *   **C7** proves the 2.86 m row reached `buildWall`, the way C5 does for the 3.40 m one.
 *   **C8** proves A6's equality is not vacuous: a cut that does NOT nest must move both halves.
 *   **C9** SPLITS the mesh from the collider in memory and requires A6 to catch it on the geometry
 *          half alone. Without C9, A6 would pass on a build that had stopped emitting geometry.
 *
 * ⚠️ **NOTHING HERE RE-DERIVES `buildWall`.** Every number is read off `sp.colliders` and the
 * merged geometry of a house `_ap3-build.mjs` really built — see that file's header.
 *
 * ⚠️ **A1–A3 ARE RED ON THE TREE THIS FILE WAS WRITTEN AGAINST AND GREEN WHEN THE FIX LANDS.**
 * They assert the correct invariant, never the defect, so this file never inverts (contrast
 * `_pf1-diag.mjs`, which reports 2 failures on a good tree).
 *
 * ---------------------------------------------------------------------------------------------
 * 🧱 A6 — WHAT THE COLLIDER SET SAYS AND WHAT YOU CAN SEE, ASSERTED SEPARATELY (added by `ap3cover-1`)
 * ---------------------------------------------------------------------------------------------
 * A1/A2/A3 read `sp.colliders` and nothing else, while `_ap3-build.mjs`'s header claims *"the
 * collider set is the primary record and the geometry is the cross-check"*. **That cross-check was
 * never performed on any nesting arm.** It was dormant rather than wrong only because `box()`
 * emits mesh and collider in one call under one condition — a coupling that is incidental to the
 * implementation and was asserted by nothing, in a project whose most expensive recurring defect is
 * a wall you can see and walk through, or cannot see and bump into.
 *
 * A6 asserts the two halves independently, with no recorded baseline, by A/B-ing the arms against
 * each other: **`slabdoors`, `wired` and `slabwin` add cuts that all NEST, so neither the collider
 * set nor one byte of the merged `kit:wall` / `kit:skirt` position buffers may move from `slab`'s.**
 * `overhang` adds one that does not nest and must move both (C8), and C9 rebuilds `wired` with the
 * merged geometry suppressed and the colliders untouched — the split itself — and requires exactly
 * the geometry half to go red.
 *
 * ⚠️ **BOTH BUCKETS, DELIBERATELY**, for `_ap3-golden.mjs`'s reason: the skirting line has no
 * collider and the `solid()` line has no geometry, so one bucket alone proves only one half live.
 * ⚠️ **AND THE TWO HALVES ARE NOT EXPECTED TO MOVE BY THE SAME AMOUNT.** On `overhang` the collider
 * set gains 2 boxes and `kit:wall` gains 1: the study caps its walls at `wallTop` ≈ 3.33 m and a
 * refused 3.40 m lintel is clipped to nothing there, **geometry only, colliders full height** —
 * `room.js` says so at the `capY` call site. A6 therefore asserts *moved / not moved*, never a
 * count. Do not "tighten" it into an equality of deltas.
 *
 * ---------------------------------------------------------------------------------------------
 * ⚖️ THE LIMITS — WHAT THIS FILE DELIBERATELY DOES NOT GATE, AND WHY
 * ---------------------------------------------------------------------------------------------
 * 🚨 **A DOORWAY FLUSH WITH ITS HOST'S LEFT EDGE IS NOT GATED, AND THE TIEBREAK IT WOULD EXERCISE
 * IS NOT REACHABLE.** `buildWall`'s sort carries `|| (b.w - a.w)` so a container is visited before a
 * cut that shares its left edge. Two independent findings say a fixture for it would pin luck:
 *
 *   1. **No producer emits a flush aperture.** `harness/genspike.mjs` — *"the one packing algorithm
 *      in this project"* — gates a door on `canDoor: runMax >= L_DOOR`, `L_DOOR = CONNECTOR_W +
 *      2 * 0.20` = 2.48 m (*"a door needs the 2.08 aperture plus a jamb"*), and `slabLayout`
 *      CENTRES the aperture on its run. **The minimum jamb any generated plan can carry is
 *      therefore 0.20 m**, and `planSpanLayout` keeps the same 0.20 m at the ends of every span.
 *      Measured on the built house: the closest two cut left edges ever come on one wall is
 *      **1.140 m** (`?dig=bays`), **2.080 m** on `?doors=1`, and the shipped doorway's edge sits
 *      **2.960 m** inside the slab's.
 *   2. **The tiebreak only fires on EXACT IEEE-754 equality**, because `(a.left - b.left) || …`
 *      tests a double for zero — and that is MEASURED, not deduced. `_ap3-build.mjs`'s diagnostic
 *      `slabflush` arm authors the tie bit-exactly (`-22.96 - 1.04` and `-16.3 - 7.7` are both
 *      exactly `-24`) and the tiebreak carries it: **0.000 m of masonry inside the dig faces with
 *      it, 4.160 m and two refusals without.** `slabnudge` moves the same doorway **one ULP,
 *      4e-15 m**, and the SHIPPED tree fails it identically — **4.160 m with the tiebreak and
 *      without it.** A gate here would certify that an authored coordinate landed on a
 *      representable value, not that the walk orders containers first.
 *
 * **What would make it reachable:** a producer that places an aperture at a run end without a jamb
 * — `slabLayout`/`canDoor` admitting `clear === CONNECTOR_W` — or an authored `SLAB_DOORWAYS` row
 * at `at = lo + w/2`, which `dig.js`'s foot-of-file validator accepts today (`a0 >= lo - 1e-6`).
 * If either lands, the honest fix is a tolerance in the comparator, not a fixture here.
 *
 * ⚠️ **THE CONTAINMENT TEST'S `u` COMPARISONS ARE NOT EXERCISED AT A NEAR MISS EITHER**, for the
 * same 0.20 m reason: no producer can put an aperture edge within centimetres of its host's. **Its
 * `y` comparisons are** — the shipped head clearance is 0.12 m closed and **0.08 m open** — which
 * is why the `slabhead` fixture is a HEIGHT overshoot and A5 is stated in metres of head.
 *
 * ⚠️ **THE TRAILING INFILL'S `0.01` GUARD IS REPORTED, NOT PINNED.** The ULP it exists to swallow
 * is ~1e-15 (`-16.3 + 7.7` is `-8.600000000000001`), nine orders of magnitude below either 0.01 or
 * 1e-9, and no shape in the house or the generator distinguishes the two thresholds. A2 catches the
 * degenerate box at any sane guard; a fixture that separated 0.01 from 1e-9 would be teaching to
 * the test.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SENTINEL, WIN_RECT } from './_ap3-build.mjs';

const BUILD = fileURLToPath(new URL('./_ap3-build.mjs', import.meta.url));
const ROOM_JS = fileURLToPath(new URL('../src/game/room.js', import.meta.url));
const SHOW_SPANS = process.argv.includes('--spans');

/**
 * 🩹 **`--preview` APPLIES THE PLAN DOCUMENT ITSELF, PARSED — IT IS NOT A SECOND COPY OF IT.**
 *
 * `docs/slices/task-aperture-3.md` §4 states its three changes as `old_string` / `new_string`
 * fenced blocks, which is the form the builder pastes into `Edit`. This reads those blocks out of
 * the markdown and hands them to `_ap3-build.mjs` to apply to `room.js` in memory. So
 * `--preview` measures **the document a builder will follow**, comments and all, and the plan and
 * the number that justifies it cannot drift apart.
 *
 * 🚨 Anything unexpected THROWS rather than returning an empty patch: a preview that quietly
 * applied nothing would report the unpatched tree as the fixed one, which is the
 * "result-shaped output instead of an error" failure this whole harness exists to refuse.
 */
const PLAN = fileURLToPath(new URL('../docs/slices/task-aperture-3.md', import.meta.url));
const PLAN_RE = /`old_string`:\s*```js\n([\s\S]*?)\n```\s*`new_string`:\s*```js\n([\s\S]*?)\n```/g;

export function planPatch() {
  const md = readFileSync(PLAN, 'utf8').replace(/\r\n/g, '\n');
  const out = [];
  for (const m of md.matchAll(PLAN_RE)) out.push({ old: `${m[1]}\n`, neu: `${m[2]}\n` });
  if (out.length !== 3) {
    throw new Error(`_ap3-geom: expected 3 old/new pairs in ${PLAN}, parsed ${out.length}`);
  }
  return out;
}

/** The string the fix leaves in `room.js`. Its presence retires `--preview`. */
export const LANDED_MARK = 'overlapping cuts that do not nest';

let pass = 0; let fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}${detail ? `  — ${detail}` : ''}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? `  — ${detail}` : ''}`); }
};
const f3 = (v) => (Math.round(v * 1000) / 1000).toFixed(3);

// ---------------------------------------------------------------------------------------------
// the subject — one child process per arm, because the arm is frozen at module scope
// ---------------------------------------------------------------------------------------------
function census(armName, patch = null) {
  const env = { ...process.env };
  if (patch) env.AP3_PATCH = JSON.stringify(patch); else delete env.AP3_PATCH;
  const r = spawnSync(process.execPath, [BUILD, '--arm', armName],
    { env, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) {
    throw new Error(`_ap3-build --arm ${armName} exited ${r.status}\n${r.stderr}`);
  }
  const i = r.stdout.indexOf(SENTINEL);
  if (i < 0) throw new Error(`_ap3-build --arm ${armName} produced no census\n${r.stderr}`);
  return JSON.parse(r.stdout.slice(i + SENTINEL.length));
}

// ---------------------------------------------------------------------------------------------
// the meter — METRES OF SOLID MASONRY STANDING INSIDE A RECTANGLE OF WALL
// ---------------------------------------------------------------------------------------------
const EPS = 1e-4;                      // 0.1 mm: two boxes that merely touch do not overlap
const ov = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);

function unionLen(spans) {
  const s = [...spans].sort((a, b) => a[0] - b[0]);
  let total = 0; let cur = null;
  for (const [a, b] of s) {
    if (!cur || a > cur[1]) { if (cur) total += cur[1] - cur[0]; cur = [a, b]; }
    else cur[1] = Math.max(cur[1], b);
  }
  if (cur) total += cur[1] - cur[0];
  return total;
}

/**
 * @param rect {axis,lo,hi,y0,y1,n0,n1} — a patch of one wall face, in world metres.
 * @returns {{m:number, mFloor:number, spans:string[]}} the union of collider footprint inside it.
 */
function masonryIn(c, rect) {
  const all = []; const floor = []; const shown = [];
  for (const row of c.colliders) {
    const [space, x0, y0, z0, x1, y1, z1] = row;
    const uMin = rect.axis === 'x' ? x0 : z0;
    const uMax = rect.axis === 'x' ? x1 : z1;
    const nMin = rect.axis === 'x' ? z0 : x0;
    const nMax = rect.axis === 'x' ? z1 : x1;
    if (ov(nMin, nMax, rect.n0, rect.n1) <= EPS) continue;
    if (ov(y0, y1, rect.y0, rect.y1) <= EPS) continue;
    if (ov(uMin, uMax, rect.lo, rect.hi) <= EPS) continue;
    const seg = [Math.max(uMin, rect.lo), Math.min(uMax, rect.hi)];
    all.push(seg);
    if (y0 <= 0.01) floor.push(seg);
    shown.push(`${space} u[${f3(seg[0])},${f3(seg[1])}] y[${f3(y0)},${f3(y1)}]`);
  }
  return { m: unionLen(all), mFloor: unionLen(floor), spans: shown };
}

const faceRect = (f) => ({
  axis: f.axis, lo: f.lo, hi: f.hi, y0: f.y0, y1: f.y1,
  n0: Math.min(f.plane, f.edgeAt), n1: Math.max(f.plane, f.edgeAt),
});

const degenerate = (c) => c.colliders.filter(
  (r) => r[4] - r[1] < 0.01 || r[5] - r[2] < 0.01 || r[6] - r[3] < 0.01);

// ---------------------------------------------------------------------------------------------
// A6's two halves of the built surface — kept apart on purpose, see the header
// ---------------------------------------------------------------------------------------------
/** WHAT YOU BUMP INTO: one row per `buildWall` `box()` call, the only per-box record the merge spares. */
const colliderSig = (c) => JSON.stringify(c.colliders);

/**
 * WHAT YOU SEE: the merged buckets `buildWall` draws into, by vertex count, index count and a
 * SHA-256 of the raw bytes of the position buffer — `_ap3-golden.mjs`'s technique, pointed at the
 * arms the golden deliberately excludes. `wall` carries every infill, lintel and sill box; `skirt`
 * carries the skirting board the leading and trailing infill lay beside it.
 */
const WALL_BUCKETS = new Set(['kit:wall', 'kit:skirt']);
const wallGeoSig = (c) => JSON.stringify(
  c.meshes.filter((m) => WALL_BUCKETS.has(m[0])).map((m) => [m[0], m[2], m[3], m[4]]));

/**
 * 🚨 **C9'S ABLATION — A MESH/COLLIDER SPLIT, IN MEMORY, AND IT IS THE ONLY THING THAT PROVES A6
 * IS LOOKING AT GEOMETRY AT ALL.** `box()` emits the merged geometry and the `THREE.Box3` in one
 * call under one condition, so today they cannot diverge — which is exactly why an equality that
 * has quietly stopped reading one of them prints the same green as a correct build. This suppresses
 * the geometry and leaves every collider untouched: the wall you can walk into and cannot see.
 */
const SPLIT_ABLATION = [{ old: '      const geo = gh > 1e-4', neu: '      const geo = gh > 1e9' }];

// ---------------------------------------------------------------------------------------------
// the run
// ---------------------------------------------------------------------------------------------
function report(patch) {
  const A = {
    default: census('default', patch),
    slab: census('slab', patch),
    slabdoors: census('slabdoors', patch),
    wired: census('wired', patch),
    overhang: census('overhang', patch),
    slabhead: census('slabhead', patch),
    slabwin: census('slabwin', patch),
    winfree: census('winfree', patch),
  };

  console.log('\n🧱 C4 — CONTROL: the census is not empty (a blind run reads as a clean one)');
  for (const [k, c] of Object.entries(A)) {
    // ⚠️ `winfree` is `?dig=0` on purpose — it is the no-host half of C6 — so it has no dig faces
    // and must not be asked for any. Every other arm digs.
    const wantFaces = /dig=0/.test(c.search) ? 0 : 8;
    ok(`C4.${k} built a house`,
      c.colliders.length > 100 && c.meshes.length > 100 && c.faces.length >= wantFaces,
      `${c.colliders.length} colliders · ${c.meshes.length} meshes · ${c.faces.length} dig faces`);
  }

  console.log('\n🧱 C3 — CONTROL: the ablation is a real switch, not a hand-edited table');
  {
    const svc = (c) => c.panelIds.filter((id) => /^p\.svc_/.test(id));
    ok('C3.1 the wired arm carries the four passage-door connectors',
      svc(A.wired).length === 4, svc(A.wired).join(' ') || '(none)');
    ok('C3.2-CONTROL …and the same URL without the ablation carries none',
      svc(A.slabdoors).length === 0 && A.slabdoors.passageDoorsOn === false,
      `${svc(A.slabdoors).length} rows, PASSAGE_DOORS_ON=${A.slabdoors.passageDoorsOn}`);
    const wSlab = A.wired.faces.filter((f) => f.edge === 'svc_w').map((f) => f.w);
    const wDef = A.default.faces.filter((f) => f.edge === 'svc_w').map((f) => f.w);
    ok('C3.3 the slab arm really built ONE face per wall',
      wSlab.length === 2 && wSlab.every((w) => Math.abs(w - 15.40) < 1e-9),
      `svc_w faces ${wSlab.map(f3).join(' / ')} m`);
    ok('C3.4-CONTROL …and the default arm built the three authored spans',
      wDef.length === 6, `svc_w faces ${[...new Set(wDef)].map(f3).join(' / ')} m`);
  }

  console.log('\n🧱 C1/C2 — CONTROL: the meter is loud where masonry stands and silent where none does');
  {
    const a0 = A.default.faces.find((f) => f.id === 'f.svc_w.0.a');
    const a1 = A.default.faces.find((f) => f.id === 'f.svc_w.1.a');
    if (!a0 || !a1) {
      ok('C1 the meter can see the pier between two dig spans', false, 'faces not found');
    } else {
      // the authored 2.08 m pier the doorway used to stand in, taken from the two faces' own
      // edges rather than typed — DIG_EDGES leaves exactly this gap between spans 0 and 1
      const pier = { ...faceRect(a0), lo: Math.min(a0.hi, a1.lo), hi: Math.max(a0.hi, a1.lo) };
      const got = masonryIn(A.default, pier);
      ok('C1 the meter can see the pier between two dig spans (MUST be non-zero)',
        got.mFloor >= 2.00,
        `${f3(got.mFloor)} m floor-to-ceiling across a ${f3(pier.hi - pier.lo)} m gap`);
    }
    let worst = 0; let where = '';
    for (const f of A.default.faces) {
      const g = masonryIn(A.default, faceRect(f));
      if (g.m > worst) { worst = g.m; where = f.id; }
    }
    ok('C2-CONTROL …and reads 0.000 m inside every dig face on the same arm',
      worst <= EPS, `worst ${f3(worst)} m${where ? ` at ${where}` : ''}`);
  }

  console.log('\n🚪 A1 — NO SOLID MASONRY STANDS INSIDE AN APERTURE SPAN');
  for (const armName of ['slab', 'slabdoors', 'wired', 'slabwin']) {
    const c = A[armName];
    let total = 0; let floorTotal = 0; const detail = [];
    for (const f of c.faces) {
      const g = masonryIn(c, faceRect(f));
      if (g.m <= EPS) continue;
      total += g.m; floorTotal += g.mFloor;
      detail.push(`${f.id} ${f3(g.m)} m (${f3(g.mFloor)} m floor-to-ceiling)`);
      if (SHOW_SPANS) for (const s of g.spans) console.log(`        ${f.id}  ${s}`);
    }
    ok(`A1.${armName} — ${c.search}${c.wire ? ' + o.panels=PANELS_AUTHORED' : ''}`,
      total <= EPS,
      total <= EPS ? 'every dig face is hollow'
        : `${f3(total)} m over ${detail.length} faces · ${f3(floorTotal)} m of it floor-to-ceiling`
          + `\n        ${detail.join('\n        ')}`);
  }

  console.log('\n🚪 A2 — NO DEGENERATE BOX (a zero-width full-height wall and its skirting)');
  for (const armName of ['default', 'slab', 'slabdoors', 'wired', 'slabwin', 'winfree']) {
    const d = degenerate(A[armName]);
    ok(`A2.${armName}`, d.length === 0,
      d.length === 0 ? `0 of ${A[armName].colliders.length}`
        : `${d.length} of ${A[armName].colliders.length} · e.g. ${d[0][0]} at `
          + `${f3(d[0][1])},${f3(d[0][2])},${f3(d[0][3])}`);
  }

  console.log('\n🚪 A3 — A CUT THAT OVERLAPS WITHOUT NESTING IS REFUSED, NOT GUESSED AT');
  {
    const c = A.overhang;
    const tall = c.panelIds.includes('p.svc_w.tall');
    const lintel = c.colliders.some((r) => Math.abs(r[2] - 3.40) < 1e-6
      && Math.abs(r[6] - r[3] - 2.08) < 1e-6);
    ok('C5-CONTROL the fabricated 3.40 m opening really reached buildWall',
      tall && lintel, `panel=${tall} lintel-at-3.40=${lintel}`);
    const warned = c.warns.filter((w) => /buildWall/.test(w));
    ok('A3 …and buildWall refuses it out loud', warned.length > 0,
      warned.length ? warned[0].slice(0, 140) : 'no warning raised');
  }

  /**
   * 🪟 **A4 — THE OTHER HALF OF §4's SENTENCE.** The plan says a contained cut owes this walk
   * *"no lintel and no sill"*, and until this fixture existed only the LINTEL half was ever
   * exercised: every cut in every arm of the corpus is a floor-level doorway, so `c.y0 > 0.01` was
   * false for all of them, contained or not. A sill emitted under a contained window is a solid box
   * from the FLOOR to the sill standing inside an aperture span — `room.js`'s own "SEALED DOORWAY"
   * hazard, one storey lower.
   */
  console.log('\n🪟 A4 — A CONTAINED CUT WITH A RAISED SILL OWES THE WALK NO SILL BOX');
  {
    // the window's own rectangle, from `_ap3-build.mjs`'s row rather than retyped, taken from the
    // FLOOR to the sill — the exact patch of wall a sill box would fill and nothing else does
    const rect = (c) => ({
      axis: WIN_RECT.axis, lo: WIN_RECT.lo, hi: WIN_RECT.hi, y0: 0, y1: WIN_RECT.sill,
      n0: WIN_RECT.at - c.wallT / 2, n1: WIN_RECT.at + c.wallT / 2,
    });
    const free = masonryIn(A.winfree, rect(A.winfree));
    ok('C6-CONTROL the same window row with NO host really does emit its sill (MUST be non-zero)',
      free.mFloor >= 2.00,
      `${f3(free.mFloor)} m of masonry under a ${f3(WIN_RECT.sill)} m sill on ?dig=0`);
    const nest = masonryIn(A.slabwin, rect(A.slabwin));
    ok('A4.1 …and the same row nested in the slab emits none',
      nest.m <= EPS, `${f3(nest.m)} m under the sill`);
    ok('A4.2 …and not one byte of merged wall geometry moves for it',
      wallGeoSig(A.slabwin) === wallGeoSig(A.slab), 'kit:wall + kit:skirt vs the slab arm');
  }

  /**
   * 📏 **A5 — THE REFUSAL AT THE SCALE REAL DOORWAY GEOMETRY LIVES AT.** A3's fixture misses
   * containment by 0.60 m, which says nothing about a containment test whose tolerance has drifted
   * to centimetres — and centimetres is where this house's numbers are: a closed connector's head
   * clears the dig band by 0.12 m and an open doorway's by 0.08 m.
   */
  console.log('\n📏 A5 — A CUT THAT MISSES CONTAINMENT BY 0.060 m IS REFUSED, NOT ABSORBED');
  {
    const c = A.slabhead;
    ok('C7-CONTROL the fabricated 2.86 m opening really reached buildWall',
      c.panelIds.includes('p.svc_w.head'), `extra=${c.extra}`);
    const lintel = c.colliders.filter((r) => Math.abs(r[2] - 2.86) < 1e-6
      && Math.abs(r[6] - r[3] - 2.08) < 1e-6);
    ok('A5.1 …so it keeps its own lintel, standing on its own head at 2.860 m',
      lintel.length > 0, `${lintel.length} lintel boxes at y0 2.860`);
    const warned = c.warns.filter((w) => /buildWall/.test(w));
    ok('A5.2 …and buildWall refuses it out loud', warned.length > 0,
      warned.length ? warned[0].slice(0, 120) : 'no warning raised');
    ok('A5.3 …and the merged wall geometry moved with the collider',
      wallGeoSig(c) !== wallGeoSig(A.slab), 'kit:wall + kit:skirt vs the slab arm');
  }

  /** 🧱 **A6 — the mesh/collider cross-check, made live on the nesting arms.** See the header. */
  console.log('\n🧱 A6 — WHAT YOU SEE AND WHAT YOU BUMP INTO MOVE TOGETHER, OR NEITHER MOVES');
  {
    const base = A.slab;
    for (const armName of ['slabdoors', 'wired', 'slabwin']) {
      const c = A[armName];
      const sameC = colliderSig(c) === colliderSig(base);
      const sameG = wallGeoSig(c) === wallGeoSig(base);
      ok(`A6.${armName} — every cut it adds NESTS, so neither half moves`, sameC && sameG,
        `colliders ${sameC ? 'identical' : 'MOVED'} · kit:wall+kit:skirt ${sameG ? 'identical' : 'MOVED'}`);
    }
    const oc = colliderSig(A.overhang) !== colliderSig(base);
    const og = wallGeoSig(A.overhang) !== wallGeoSig(base);
    ok('C8-CONTROL …and a cut that does NOT nest moves BOTH halves', oc && og,
      `colliders ${oc ? 'moved' : 'IDENTICAL'} (${base.colliders.length} -> ${A.overhang.colliders.length})`
      + ` · geometry ${og ? 'moved' : 'IDENTICAL'}`);
    // ⚠️ the split is applied ON TOP of whatever `report()` is measuring, so `--preview` splits the
    // previewed tree rather than silently falling back to the shipped one
    const split = census('wired', [...(patch ?? []), ...SPLIT_ABLATION]);
    const keptC = colliderSig(split) === colliderSig(A.wired);
    const lostG = wallGeoSig(split) !== wallGeoSig(A.wired);
    ok('C9-CONTROL …and a MESH/COLLIDER SPLIT is caught by the geometry half alone', keptC && lostG,
      `colliders ${keptC ? 'unchanged' : 'ALSO MOVED — the ablation is not isolating the halves'}`
      + ` · geometry ${lostG ? 'went red' : 'DID NOT MOVE — A6 is not reading geometry'}`);
  }

  return { pass, fail };
}

// ⚠️ guarded, so `_ap3-golden.mjs` can import `planPatch` without running the whole suite
if (process.argv[1]?.replace(/\\/g, '/').endsWith('harness/_ap3-geom.mjs')) {
  console.log('═══ _ap3-geom — the geometry half of "a slab contains a doorway" ═══');
  report(null);

  if (process.argv.includes('--preview')) {
    console.log("\n═══ --preview: the same measurements with task-aperture-3.md's edits ═══");
    if (readFileSync(ROOM_JS, 'utf8').includes(LANDED_MARK)) {
      console.log('  ⏭️  the fix is already in the tree — this preview has retired.');
    } else {
      const before = { pass, fail };
      pass = 0; fail = 0;
      const r = report(planPatch());
      console.log(`\n  preview: ${r.pass} pass / ${r.fail} fail`);
      pass = before.pass; fail = before.fail;
    }
  }

  console.log(`\n═══ ${pass} pass / ${fail} fail ═══`);
  process.exit(fail ? 1 : 0);
}
