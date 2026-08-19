#!/usr/bin/env node
/**
 * 🧱 **THE WHOLE MANSION, BUILT IN NODE, ONE ARM PER PROCESS — the shared subject for
 * `_ap3-geom.mjs` and `_ap3-golden.mjs`.**
 *
 *   node harness/_ap3-build.mjs --arm wired          one JSON census on stdout, sentinel-prefixed
 *   node harness/_ap3-build.mjs --arm default --pretty
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS AT ALL
 * ---------------------------------------------------------------------------------------------
 * `_ap2-rule.mjs` proves the GRID half of "a slab contains a doorway" headless, against the
 * shipped `DamageField`. Nothing proves the GEOMETRY half, and the geometry half lives in
 * `room.js` `buildWall`, which is a closure inside `buildTestRoom` and cannot be imported.
 *
 * 🚨 **SO THIS ASKS THE BUILT HOUSE WHAT BOXES EXIST. It does not recompute what `buildWall`
 * should have emitted.** HANDOFF: *"an instrument that re-derives the thing it measures will
 * agree with it"* — two probes on this project inverted the code they were testing in closed form
 * and confirmed themselves. Every number downstream of this file comes off `sp.colliders` and off
 * the merged `BufferGeometry`, i.e. off the objects the game would collide against and draw.
 *
 * **Every `box()` in `buildWall` emits BOTH a merged-geometry box and a `THREE.Box3` collider, and
 * the merge destroys the box list while the collider list keeps it one row per call.** That is why
 * the collider set is the primary record here and the geometry is the cross-check.
 *
 * 🚨 **AND THE CROSS-CHECK IS ACTUALLY PERFORMED — `_ap3-geom.mjs` A6, added 2026-08-11.** That
 * sentence stood for a week while A1/A2/A3 read `sp.colliders` and nothing else on every nesting
 * arm; the two records could only agree because `box()` emits them under one condition, a coupling
 * nothing asserted. A6 compares them separately and C9 splits them to prove it can tell.
 *
 * ---------------------------------------------------------------------------------------------
 * HOW A GPU BUILD RUNS WITH NO GPU, AND WHY THAT IS NOT A SECOND COPY OF THE GAME
 * ---------------------------------------------------------------------------------------------
 * `buildTestRoom` needs exactly two things node does not have: a `MaterialBaker` (a `WebGLRenderer`
 * doing offscreen bakes) and a `location`. Both are supplied from OUTSIDE `src/`:
 *
 *   · `initBaker(stub)` — the stub answers the four renderer calls `MaterialBaker.bake` makes and
 *     returns lit texels so the bake's own black-albedo validator is satisfied. **No `src/` file is
 *     patched, mocked or copied**; the real `DestructibleWall`, the real `wallStageMaterials`, the
 *     real GeoBin merge and the real `spaces.js`/`dig.js` tables all run.
 *   · `globalThis.location` — set BEFORE the first `src/` import, because `dig.js` `SLAB`,
 *     `spaces.js` `PASSAGE_DOORS_ON` and `room.js`'s `?dig=`/`?estate=` reads are module-scope.
 *     **That is also why an arm is a PROCESS and not a function argument**: once `dig.js` is
 *     evaluated the arm is frozen for that process, and an in-process "second arm" would silently
 *     measure the first one twice.
 *
 * ⚠️ **`--arm wired` IS THE ONE THING HERE THAT IS NOT SHIPPED STATE, AND IT IS A REAL SWITCH
 * RATHER THAN A HAND-EDITED COPY.** `spaces.js` refuses `?slab=1&doors=1` its four `p.svc_*`
 * connector rows (`PASSAGE_DOORS_ON = DOORS_URL && !SLAB_ARM`), so on the shipped tree the slab
 * arm's doorways exist in the damage grid and in nothing else. `buildTestRoom`'s own documented
 * ablation hook — `o.panels`, *"it exists to be an ablation, not a feature"* — is handed
 * `PANELS_AUTHORED`, the array `spaces.js` filters, in its authored order. That is precisely the
 * table the wiring step produces, and it is the arm the geometry defect lives on.
 *
 * ⚠️ **THE FABRICATED ARMS ARE LABELLED AS FABRICATED AND EACH CARRIES ITS OWN REALNESS NOTE.**
 * `overhang`, `slabhead`, `slabwin` and `winfree` add one authored connector row each. They are the
 * only authored geometry in this file. **Read `FABRICATED` below before adding another:** a fixture
 * that is not a shape the house or the generator can produce turns a gate into a false positive,
 * *"worse than the bug it was written for — it blocks everyone and teaches people to bypass the
 * gate."*
 */
import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';

const HERE = new URL('.', import.meta.url);
const SRC = new URL('../src/', HERE);
const s = (p) => new URL(p, SRC).href;

/**
 * The arms. `search` is the query string the browser would carry; `wire` swaps the panel table
 * for `PANELS_AUTHORED` through `buildTestRoom`'s own `o.panels` ablation.
 */
export const ARMS = {
  default: { search: '', wire: false },
  doors: { search: '?doors=1', wire: false },
  bays: { search: '?dig=bays', wire: false },
  nodig: { search: '?dig=0', wire: false },
  noestate: { search: '?estate=off', wire: false },
  slab: { search: '?slab=1', wire: false },
  slabdoors: { search: '?slab=1&doors=1', wire: false },
  wired: { search: '?slab=1&doors=1', wire: true },
  overhang: { search: '?slab=1&doors=1', wire: true, overhang: true },
  /** a cut that misses containment by 0.06 m — `FABRICATED.head`. */
  slabhead: { search: '?slab=1&doors=1', wire: true, extra: 'head' },
  /** a WINDOW nested in the slab — `FABRICATED.win`. */
  slabwin: { search: '?slab=1&doors=1', wire: true, extra: 'win' },
  /** ⚠️ **THE SAME WINDOW ROW WITH NO SLAB TO CONTAIN IT** — `_ap3-geom.mjs` C6's other half. */
  winfree: { search: '?dig=0', wire: true, extra: 'win' },
  /**
   * ⚠️ **DIAGNOSTIC, NOT GATED — `_ap3-geom.mjs` censuses NEITHER of these, on purpose.** They are
   * the reproduction for the "flush aperture" limit in that file's header; see `FABRICATED.flush`.
   */
  slabflush: { search: '?slab=1&doors=1', wire: true, extra: 'flush' },
  slabnudge: { search: '?slab=1&doors=1', wire: true, extra: 'nudge' },
};

/** Arms whose cut lists are DISJOINT by construction — the golden's corpus. */
export const DISJOINT_ARMS = ['default', 'doors', 'bays', 'nodig', 'noestate'];

export const SENTINEL = 'AP3JSON ';

/**
 * 🚪 **AN APERTURE, STATED THE WAY `dig.js` STATES ONE, TURNED INTO THE CONNECTOR ROW `room.js`
 * BUILDS FROM — because those are the two halves the wiring step joins and nothing cross-checks.**
 *
 * `dig.js` `SLAB_DOORWAYS` speaks `{at, w, h, sill}` — *"an offset ALONG the wall, a clear width
 * and a clear height"*, where `h` is measured from the FLOOR and `sill` is the height of the sill
 * (*"0 is a doorway; a positive value is a WINDOW, and it costs nothing because the aperture is a
 * rectangle either way"*). `spaces.js` speaks `{w, h, cy}` and `connectors.js` `aperture()` turns
 * that into the `{y0, y1}` cut `buildWall` walks: `y0 = cy - h/2`, `y1 = cy + h/2`.
 *
 * 🚨 **THE TWO TABLES ARE DOCUMENTED TO BE THE SAME HOLE "TO THE CENTIMETRE" AND NOTHING CHECKS
 * THAT THEY ARE.** `dig.js`'s foot-of-file block validates `SLAB_DOORWAYS` against `SLAB_SPAN` and
 * never against `spaces.js`; it checks `d.w > 0 && d.h > 0` and that the doorway fits its span **in
 * `u` only** — there is no bound on `d.h` against `DIG_H` anywhere, and `apertureRects` silently
 * CLAMPS `v1` to 1. So a doorway taller than the band is accepted by the aperture interface and
 * quietly loses its head in the grid. Stating the fixtures below in `SLAB_DOORWAYS`'s own units and
 * converting here is what keeps that visible instead of burying it in a hand-typed `cy`.
 */
const apertureRow = (o) => ({
  id: o.id, state: 'breachable', name: o.name,
  a: 'service', b: 'study_w', x: -1.85, z: o.at, rotY: Math.PI / 2,
  w: o.w, h: o.h - (o.sill ?? 0), cy: ((o.sill ?? 0) + o.h) / 2,
});

/**
 * ⚠️ **THE FABRICATED ROWS, AND EACH ONE STATES HOW REAL IT IS.** All three sit on the `svc_w`
 * band at x −1.85, i.e. inside the 15.40 m slab that spans z −24.00 … −8.60 with its dig band at
 * y 0 … 2.80 (`dig.js` `SLAB_SPAN`, `DIG_H`).
 *
 * 🚨 **A FIXTURE IS ONLY WORTH ITS GATE IF THE SHAPE CAN OCCUR.** The realness note on each row is
 * the load-bearing part of this block — a gate built on a shape no producer can emit is a false
 * positive waiting to happen. **The shape this file deliberately does NOT fabricate is a doorway
 * FLUSH with a slab's left edge**: `harness/genspike.mjs` `canDoor` requires the run to be
 * `CONNECTOR_W + 2 * 0.20` = 2.48 m and `slabLayout` CENTRES the aperture on it, so the minimum
 * jamb any producer can emit is 0.20 m — and `buildWall`'s widest-first tiebreak is only reachable
 * on EXACT IEEE-754 equality of two left edges. See `_ap3-geom.mjs`'s header, "the limits".
 */
const FABRICATED = {
  /**
   * A 2.08 m opening whose clear height is 3.40 m — inside the slab in `u`, 0.60 m OUTSIDE it in
   * `y`. An overlap that does not nest: the one cut shape the walk cannot represent in any visit
   * order. **Nothing in the house or in `SLAB_DOORWAYS` produces a 3.40 m door**; this exists so
   * the refusal has something to refuse, at a scale no floor plan would ever author.
   */
  tall: apertureRow({
    id: 'p.svc_w.tall', name: 'FABRICATED — A TALL OPENING IN A SHORT BAND',
    at: -16.30, w: 2.08, h: 3.40, sill: 0,
  }),
  /**
   * 🚨 **THE SAME REFUSAL AT THE SCALE REAL DOORWAY GEOMETRY LIVES AT — 2.86 m in a 2.80 m band,
   * i.e. it misses containment by 0.060 m.** `tall` misses by 0.60 m and therefore says nothing
   * about a containment test whose tolerance has drifted to centimetres.
   *
   * **How real:** the shipped head clearance is **0.12 m** for a closed connector
   * (`CONNECTOR_H` 2.68 in `DIG_H` 2.80) and **0.08 m** for an open one (`DOORWAY_H` 2.72) — so a
   * 0.06 m overshoot is a smaller number than the margin the house already runs on, and it is one
   * authored digit. `connectors.js` `aperture()` takes `spec.h` verbatim (`spaces.js` already
   * authors an `h: 3.40` row), and `dig.js` bounds `d.h` nowhere. A doorway a few centimetres
   * taller than its band is the floor-plan mistake this branch exists to catch.
   */
  head: apertureRow({
    id: 'p.svc_w.head', name: 'FABRICATED — A DOORWAY 0.06 m TALLER THAN ITS BAND',
    at: -16.30, w: 2.08, h: 2.86, sill: 0,
  }),
  /**
   * 🪟 **A WINDOW NESTED IN THE SLAB — sill 1.10 m, head 2.30 m, wholly inside the 0 … 2.80 band
   * with 1.10 m under it and 0.50 m over it.** The only fixture in this harness with `y0 > 0.01`
   * inside a host.
   *
   * **How real:** `sill` is a first-class field of `dig.js`'s aperture table, documented in as many
   * words — *"0 is a doorway; a positive value is a WINDOW, and it costs nothing because the
   * aperture is a rectangle either way"* — and `connectors.js` `aperture()` already turns an
   * authored `cy` into a raised `y0`. `room.js` already walks raised-sill cuts through this exact
   * function: seven of them ship (the study's two lancets per room, the ballroom's three).
   * **What does not exist yet is the two together**, because `SLAB_DOORWAYS` reaches the damage
   * grid and `wallinstances.js` and never `room.js`'s cut list — and the wiring step this slice
   * unblocks is precisely what joins them.
   *
   * ⚠️ **AND THE TWO FILES DISAGREE ABOUT WHETHER THIS SHAPE IS WANTED.** `dig.js` says a window
   * in a dig face costs nothing; `room.js` (the study's window placement) says *"a stained-glass
   * lancet in a wall the player is meant to hammer through would be both a lie and a hole into the
   * service passage's own lighting"* and puts its windows on the exterior wall for that reason.
   * That is a design question for the lead. It is not a reason to leave the geometry unasserted:
   * whichever way it is settled, a contained cut owes this walk no sill, and a sill emitted under
   * one is a solid box from the floor to the window standing inside an aperture span.
   */
  win: apertureRow({
    id: 'p.svc_w.win', name: 'FABRICATED — A WINDOW INSIDE A SLAB',
    at: -16.30, w: 2.08, h: 2.30, sill: 1.10,
  }),
  /**
   * ⚠️ **DIAGNOSTIC, AND `_ap3-geom.mjs` DELIBERATELY DOES NOT GATE IT. This pair is the evidence
   * for that decision, kept runnable rather than argued.**
   *
   * `flush` is a 2.08 m doorway at `at = SLAB_SPAN[0] + w/2 = −22.96`, so its left edge is −24.00
   * — **bit-exactly** the slab's own (`-22.96 - 1.04` and `-16.3 - 7.7` are both exactly `-24`).
   * That is the one shape `buildWall`'s `|| (b.w - a.w)` widest-first tiebreak exists for, and it
   * really does depend on it: **0.000 m of masonry inside the dig faces with the tiebreak, 4.160 m
   * and two refusal warnings without it** (154 → 156 colliders).
   *
   * 🚨 **`nudge` IS THE SAME DOORWAY MOVED ONE ULP — 4e-15 m — AND THE SHIPPED TREE FAILS IT
   * IDENTICALLY, 4.160 m WITH THE TIEBREAK AND WITHOUT IT.** `(a.left - b.left) || (b.w - a.w)`
   * tests a double for zero, so the guard covers exact equality and nothing either side of it. A
   * gate built on `flush` would therefore certify that an authored coordinate happened to land on
   * a representable value, not that the walk orders containers first.
   *
   * **And no producer emits either shape.** `harness/genspike.mjs` gates a door on
   * `canDoor: runMax >= L_DOOR`, `L_DOOR = CONNECTOR_W + 2 * 0.20` (*"a door needs the 2.08
   * aperture plus a jamb"*), and `slabLayout` centres the aperture on its run — minimum jamb
   * 0.20 m. Measured on the built house, the closest two cut left edges ever come on one wall is
   * 1.140 m. **What would have to change:** `canDoor`/`slabLayout` admitting a jambless aperture at
   * a run end, or a `SLAB_DOORWAYS` row authored at `at = lo + w/2` — which `dig.js`'s foot-of-file
   * validator accepts today (`a0 >= lo - 1e-6`). If either lands, the fix is a tolerance in the
   * comparator and a fixture becomes worth building; until then it would be teaching to the test.
   */
  flush: apertureRow({
    id: 'p.svc_w.flush', name: 'FABRICATED — A JAMBLESS DOORWAY AT THE SLAB EDGE',
    at: -22.96, w: 2.08, h: 2.68, sill: 0,
  }),
  nudge: apertureRow({
    id: 'p.svc_w.nudge', name: 'FABRICATED — THE SAME, ONE ULP LEFT',
    at: -22.960000000000004, w: 2.08, h: 2.68, sill: 0,
  }),
};

/** The window's own rectangle, so `_ap3-geom.mjs` C6 can point a meter at it without retyping it. */
export const WIN_RECT = { axis: 'z', lo: -16.30 - 1.04, hi: -16.30 + 1.04, sill: 1.10, at: -1.85 };

function stubRenderer() {
  return {
    getRenderTarget: () => null,
    setRenderTarget: () => {},
    render: () => {},
    // `MaterialBaker.bake` reads four texels back and throws if all four are black — a real guard
    // against a GLSL compile failure. Answer it with a lit texel so the guard passes honestly.
    readRenderTargetPixels: (rt, x, y, w, h, buf) => {
      buf[0] = 200; buf[1] = 200; buf[2] = 200; if (buf.length > 3) buf[3] = 255;
    },
  };
}

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex').slice(0, 16);

/**
 * ⚠️ **`AP3_PATCH` — `_ap3-geom.mjs --preview` ONLY, AND IT IS NOT A SECOND COPY OF `room.js`.**
 *
 * A list of `{old, neu}` exact-text substitutions applied to `src/game/room.js` **in memory, at
 * load, in this child process**, so the plan in `docs/slices/task-aperture-3.md` can be measured
 * before a builder types it. Nothing is written to disk and every other module is the shipped one.
 *
 * 🚨 **A MISSING ANCHOR THROWS.** A preview that silently applied nothing would report the
 * unpatched tree as the fixed one — the exact "result-shaped output instead of an error" failure
 * this harness exists to refuse.
 */
function installPatch() {
  const raw = process.env.AP3_PATCH;
  if (!raw) return;
  const patch = JSON.parse(raw);
  const room = s('game/room.js');
  let applied = false;
  registerHooks({
    load(url, ctx, next) {
      const r = next(url, ctx);
      if (url !== room) return r;
      let src = r.source.toString();
      for (const p of patch) {
        if (!src.includes(p.old)) {
          throw new Error(`_ap3-build: AP3_PATCH anchor not found in room.js:\n${p.old}`);
        }
        src = src.replace(p.old, p.neu);
      }
      applied = true;
      return { ...r, source: src };
    },
  });
  process.on('exit', () => {
    if (!applied) {
      console.error('_ap3-build: AP3_PATCH was set and room.js never loaded through the hook');
      process.exitCode = 1;
    }
  });
}

export async function buildArm(name) {
  const arm = ARMS[name];
  if (!arm) throw new Error(`_ap3-build: unknown arm "${name}"`);

  installPatch();
  globalThis.location = { search: arm.search };

  const warns = [];
  const realWarn = console.warn;
  console.warn = (...a) => { warns.push(a.map(String).join(' ')); };

  const { initBaker } = await import(s('materials/baker.js'));
  initBaker(stubRenderer());

  const SP = await import(s('game/spaces.js'));
  const DG = await import(s('game/dig.js'));
  const CN = await import(s('game/connectors.js'));
  const RM = await import(s('game/room.js'));

  const extra = arm.overhang ? FABRICATED.tall : (arm.extra ? FABRICATED[arm.extra] : null);
  if (arm.extra && !extra) throw new Error(`_ap3-build: unknown fabricated row "${arm.extra}"`);
  let panels = null;
  if (arm.wire) panels = extra ? [...SP.PANELS_AUTHORED, extra] : SP.PANELS_AUTHORED;

  const room = await RM.buildTestRoom({ work: (p) => p }, panels ? { panels } : {});
  console.warn = realWarn;

  // ---- the collider set: one row per `solid()` call, i.e. one row per `buildWall` box ----
  const colliders = [];
  for (const sp of room.spaces) {
    for (const b of sp.colliders) {
      colliders.push([sp.id, b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z]);
    }
  }

  // ---- the merged geometry: the cross-check that a dropped collider dropped its box too ----
  const meshes = [];
  room.root.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry;
    const pa = g.attributes.position;
    meshes.push([
      o.name ?? '', o.material?.name ?? '', pa.count, g.index ? g.index.count : 0,
      sha(new Uint8Array(pa.array.buffer, pa.array.byteOffset, pa.array.byteLength)),
    ]);
  });

  // ---- the dig faces, as world rectangles, read off the panels the build actually made ----
  const edges = DG.digEdges();
  const faces = [];
  for (const p of room.panels) {
    const spec = p.spec;
    if (!spec?.free) continue;
    const e = edges.find((q) => q.id === spec.edge);
    const ap = CN.aperture(spec);
    const axis = CN.connectorAxis(spec);            // which axis the face's WIDTH runs along
    const u = axis === 'x' ? spec.x : spec.z;
    const plane = axis === 'x' ? spec.z : spec.x;   // the face's own surface, room side
    faces.push({
      id: spec.id, edge: spec.edge, seg: spec.seg, side: spec.side,
      axis, plane, edgeAt: e ? e.at : null, w: spec.w,
      lo: u - spec.w / 2, hi: u + spec.w / 2, y0: ap.y0, y1: ap.y1,
      apertures: spec.apertures ?? null,
    });
  }

  return {
    arm: name, search: arm.search, wire: !!arm.wire, overhang: !!arm.overhang,
    extra: extra ? extra.id : null,
    passageDoorsOn: SP.PASSAGE_DOORS_ON, slabArm: DG.slabArm(),
    wallT: SP.WALL_T, digH: DG.DIG_H,
    panelIds: room.panels.map((p) => p.spec.id),
    faces, colliders, meshes,
    warns: warns.filter((w) => !/Unable to serialize/.test(w)),
    patched: !!process.env.AP3_PATCH,
  };
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('harness/_ap3-build.mjs')) {
  const i = process.argv.indexOf('--arm');
  const name = i >= 0 ? process.argv[i + 1] : 'default';
  const out = await buildArm(name);
  if (process.argv.includes('--pretty')) console.log(JSON.stringify(out, null, 1));
  else process.stdout.write(SENTINEL + JSON.stringify(out) + '\n');
}
