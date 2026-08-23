#!/usr/bin/env node
/**
 * _gendress1-fit.mjs — DOES A GENERATED ROOM WEAR THE AUTHORED ROOM'S DRESSING?
 *
 * `gendress-1`, 2026-08-15. The gate for `src/world/genplan.js`'s `roomType`/`turns`,
 * `src/game/spaces.js`'s `dressGenerated()` and `src/game/room.js`'s turned gallery order.
 *
 *   node harness/scenarios/_gendress1-fit.mjs                       the suite: 16 seeds + 3 controls
 *   node harness/scenarios/_gendress1-fit.mjs --worker --seed 7     one seed, JSON out
 *   node harness/scenarios/_gendress1-fit.mjs --worker --seed 7 --rooms 6
 *   node harness/scenarios/_gendress1-fit.mjs --worker --seed 7 --off        the `?gendress=0` arm
 *
 * Read-only against `src/`. Machinery forked from `_plangen1-boot.mjs` (which forked it from
 * `_genwalk1-build.mjs`): `node:module` `registerHooks` for the in-memory patches, a stub
 * renderer for the baker, `globalThis.location` set BEFORE the first `src/` import, and ONE
 * SUBPROCESS PER ARM — `spaces.js`'s `GEN` and `room.js`'s flags are module scope, computed once
 * at import, so N seeds need N processes and not one process re-importing a cached module.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 IT ASKS THE BUILT HOUSE, NOT THE TABLE THAT FED IT
 * ---------------------------------------------------------------------------------------------
 * HANDOFF: *"an instrument that re-derives the thing it measures will agree with it."* F3/F4/F5
 * read `room.estate.orders` and `sp.orderPlan` off the object `buildTestRoom()` returns — i.e.
 * the order that actually RESOLVED, imported and emitted geometry — never `spaces.js`'s row.
 * `room.js`'s own header is explicit about the difference: *"`sp.order` is a floor-plan FACT;
 * `sp.orderPlan` is a BUILD fact"*, and keying on the first is how `estate-2`'s ablation arm
 * shipped a marble floor into a build that was meant to have none.
 *
 * 🚨 EVERY ASSERTION SHIPS A CONTROL THAT MUST FAIL, ON EVERY RUN.
 *   C1  REFUSAL. `genplan.js` is patched in memory so every emitted room row is 0.05 m narrower
 *       than the library room it names. `dressGenerated()` must REFUSE all of them
 *       (`genDress.dressed === false`, `why: 'footprint'`) and the built house must report ZERO
 *       orders. This is the arm that makes F2's "16 of 16 dressed" mean something: without it a
 *       pass that dressed everything unconditionally would read identically.
 *   C2  THE OFF ARM. `?gendress=0` must produce rooms with no `order`, no `columns` and no
 *       `pilasters` and a house with zero orders. If the before and after arms read the same,
 *       every number in this file is measuring nothing.
 *   C3  REINTRODUCTION, of the one real code change. `room.js`'s `const alongX = …` is patched
 *       back to `true`, which is the pre-2026-08-15 build exactly (`len = x1 - x0`, `base =
 *       rotationY(PI/2)`, `capFor` on `!alongZ`). F4 must go RED: a turned gallery's order comes
 *       back solved for its 6.70 m axis instead of its 27.20 m one.
 *
 * ⚠️ THE SEEDS ARE RUN AT `planrooms=3` (the game's default) AND `planrooms=6` (the old house and
 * the whole `house-packing.md` corpus). A dressing rule that only holds at one room count is not
 * a rule, and the two counts genuinely re-roll the plan.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 THE TWO GATES THIS SLICE MOVED, ATTRIBUTED RATHER THAN LEFT FOR SOMEONE TO FIND
 * ---------------------------------------------------------------------------------------------
 * Both are ONE warning — `skin.js`'s grain coarsening — and both were verified against the
 * `?gendress=0` arm of the same gate, on the same tree, so the attribution is a difference and
 * not a memory:
 *
 *   `_plangen1-boot`  B1 "zero throws/warnings"   **16/16 -> 5/16**. B2/B3/B5/B6 still 16/16,
 *                     B4 still 14/16 (its own known sliver seeds).
 *   `_genslab1-dig`   "no throw, no warning"      **16/16 -> 5/16**. G1/G2/G3 still 16/16, and
 *                     **G4a 14/16 · G4b 12/16 · G4c 13/16 · G5 12/16 · C5 5/16 read IDENTICALLY
 *                     on both arms** — they are pre-existing on this tree and NOT this slice's.
 *                     ⚠️ Anything carrying "`_genslab1-dig` 16/16" as a keep-green line has the
 *                     wrong number and had it before 2026-08-15. **ZERO `overlapping cuts`** on
 *                     both arms, which is the property that line was really about.
 *
 * Reproduce the baseline with:
 *   sed 's|planseed=${seed}` };|planseed=${seed}\&gendress=0` };|' harness/scenarios/<gate>.mjs \
 *     > harness/scenarios/_tmp_off.mjs && node harness/scenarios/_tmp_off.mjs   (then delete it)
 */

import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = new URL('.', import.meta.url);
const SELF = fileURLToPath(import.meta.url);
const SRC = new URL('../../src/', HERE);
const s = (p) => new URL(p, SRC).href;

const N_SEEDS = 16;
/** The five library rooms, from `spaces.js` — restated so a drift in either is visible, not silent. */
const DRESSED_TYPES = new Set(['gallery', 'ballroom', 'study']);   // the three with an `order`

function stubRenderer() {
  return {
    getRenderTarget: () => null,
    setRenderTarget: () => {},
    render: () => {},
    readRenderTargetPixels: (rt, x, y, w, h, buf) => {
      buf[0] = 200; buf[1] = 200; buf[2] = 200; if (buf.length > 3) buf[3] = 255;
    },
  };
}

/**
 * An in-memory source patch, applied at load. `anchor` must be present VERBATIM or the control
 * throws — a control that silently stops applying is worse than no control, and this project has
 * paid for that twice (`_plangen1-boot`'s C1 note, `_ap2-rule`'s `.get('svc_w')`).
 */
function patchSource(url, anchor, replacement, label) {
  let applied = false;
  registerHooks({
    load(u, ctx, next) {
      const r = next(u, ctx);
      if (u !== url) return r;
      const src = r.source.toString();
      const idx = src.indexOf(anchor);
      if (idx < 0) {
        throw new Error(`_gendress1-fit: ${label} anchor not found verbatim — the source drifted under this control`);
      }
      applied = true;
      return { ...r, source: src.slice(0, idx) + replacement + src.slice(idx + anchor.length) };
    },
  });
  process.on('exit', () => {
    if (!applied) {
      console.error(`_gendress1-fit: ${label} patch was set and the target module never loaded through the hook`);
      process.exitCode = 1;
    }
  });
}

/** C1 — every generated room row 0.05 m narrower than the library room it names. */
function patchShrinkRooms() {
  patchSource(s('world/genplan.js'),
    "    roomType: region.type, turns: region.rot ? 1 : 0,\n",
    "    roomType: region.type, turns: region.rot ? 1 : 0, x1: c.x1 - 0.05,\n",
    'C1');
}

/** C3 — `room.js`'s gallery turn, reintroduced as the hardcoded quarter it used to be. */
function patchHardcodeTurn() {
  patchSource(s('game/room.js'),
    '    const alongX = (sp.x1 - sp.x0) >= (sp.z1 - sp.z0);',
    '    const alongX = true;',
    'C3');
}

async function runOnce({ seed, rooms, off, shrink, hardcode }) {
  if (shrink) patchShrinkRooms();
  if (hardcode) patchHardcodeTurn();
  globalThis.location = {
    search: `?plan=gen&planseed=${seed}&planrooms=${rooms}${off ? '&gendress=0' : ''}`,
  };

  const warns = [];
  const realWarn = console.warn;
  console.warn = (...a) => { warns.push(a.map(String).join(' ')); };

  const out = { seed, rooms, off: !!off, shrink: !!shrink, hardcode: !!hardcode };
  try {
    const { initBaker } = await import(s('materials/baker.js'));
    initBaker(stubRenderer());
    const SP = await import(s('game/spaces.js'));
    const RM = await import(s('game/room.js'));
    const room = await RM.buildTestRoom({ work: (p) => p }, {});
    console.warn = realWarn;
    out.threw = false;

    // ---- F1: the identity claim, re-measured from BOTH sources on every run -------------------
    // `SPACES` rows carry the generator's rect; `ROOMS` is the authored library. They are two
    // independent files and this compares them, rather than trusting either one's header.
    let roomRows = 0, fitFail = 0;
    const worstFit = [];
    for (const row of SP.SPACES) {
      if (!row.roomType) continue;
      roomRows++;
      const def = SP.ROOMS[row.roomType];
      if (!def) { fitFail++; continue; }
      const turned = ((row.turns | 0) % 4) % 2 === 1;
      const d = Math.max(
        Math.abs((row.x1 - row.x0) - (turned ? def.d : def.w)),
        Math.abs((row.z1 - row.z0) - (turned ? def.w : def.d)),
        Math.abs(row.storey - def.storey));
      if (d > 1e-6) { fitFail++; worstFit.push([row.id, +d.toFixed(4)]); }
    }
    out.roomRows = roomRows;
    out.f1FitFail = fitFail;
    out.worstFit = worstFit.slice(0, 3);

    // ---- F2: every room row is dressed, and says which way ------------------------------------
    const dressed = SP.SPACES.filter((r) => r.genDress?.dressed);
    const refused = SP.SPACES.filter((r) => r.roomType && !r.genDress?.dressed);
    out.f2Dressed = dressed.length;
    out.f2Refused = refused.length;
    out.refusedWhy = refused.map((r) => r.genDress?.why ?? 'no-genDress').slice(0, 4);
    out.turnedRooms = SP.SPACES.filter((r) => r.roomType && ((r.turns | 0) % 2) === 1).length;

    // ---- F3: the BUILT house's orders ---------------------------------------------------------
    // `room.estate.orders` is `{ spaceId: orderName }` for every space where the order RESOLVED
    // and emitted — a build fact, computed in `room.js` from `s.order && s.orderPlan`.
    const orders = room.estate?.orders ?? {};
    out.f3Orders = Object.keys(orders).length;
    out.f3Want = SP.SPACES.filter((r) => DRESSED_TYPES.has(r.roomType) && r.genDress?.dressed).length;
    out.orderNames = orders;

    // ---- F4: a gallery's order is solved for its LONG axis, turned or not ----------------------
    // Read off `sp.orderPlan`, i.e. the plan the geometry was emitted from. `galleryPlan` puts
    // the long extent on `len` in its own frame; the authored gallery is 27.20 x 6.70.
    const gal = room.spaces.filter((sp) => sp.order === 'gallery' && sp.orderPlan);
    out.f4Galleries = gal.length;
    out.f4Turned = gal.filter((sp) => ((sp.turns | 0) % 2) === 1).length;
    out.f4Bad = gal.filter((sp) => Math.abs(sp.orderPlan.len - 27.20) > 0.01
      || Math.abs(sp.orderPlan.wid - 6.70) > 0.01).length;
    out.f4Lens = gal.map((sp) => [sp.id, sp.turns | 0, +sp.orderPlan.len.toFixed(2), +sp.orderPlan.wid.toFixed(2)]);

    // ---- F5: the ballroom has NO centre colonnade (John 2026-08-23, PR A) ----------------------
    // gendress-1 required six piers on a turned ballroom. The lock deletes them: they sat in
    // the chair circle. The thing that CAN be read back is `sp.columns` (or its absence).
    const balls = room.spaces.filter((sp) => sp.roomType === 'ballroom');
    out.f5Ballrooms = balls.length;
    out.f5NoColumns = balls.filter((sp) => !sp.columns).length;
    out.f5Cols = balls.map((sp) => {
      const pts = sp.columns ? (sp.columns.pts ?? sp.columns.xs.map((x) => [x, sp.columns.z])) : [];
      const turned = ((sp.turns | 0) % 2) === 1;
      // every pier must sit inside the room, and the row must run down the room's LONG axis
      const inside = pts.every(([x, z]) => x > sp.x0 && x < sp.x1 && z > sp.z0 && z < sp.z1);
      const spanX = pts.length ? Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0])) : 0;
      const spanZ = pts.length ? Math.max(...pts.map((p) => p[1])) - Math.min(...pts.map((p) => p[1])) : 0;
      return [sp.id, sp.turns | 0, pts.length, inside, +(turned ? spanZ : spanX).toFixed(2),
        +(turned ? spanX : spanZ).toFixed(2)];
    });

    // ---- F6: the wall builder did not complain ------------------------------------------------
    out.f6Overlap = warns.filter((w) => /overlapping cuts/.test(w)).length;
    out.warnCount = warns.filter((w) => !/Unable to serialize/.test(w)).length;
    out.warns = warns.filter((w) => !/Unable to serialize/.test(w)).slice(0, 3);

    // ---- the price, per space: meshes and triangles under each space root ----------------------
    // A merged bin bucket is ONE mesh and therefore one draw call when the space is resident, so
    // this is the headless proxy for the draw-call bill. The authoritative number is the browser
    // flip at one parked station — see the report; this is what makes it cheap to run 32 arms.
    let meshes = 0, tris = 0;
    const per = [];
    for (const sp of room.spaces) {
      let m = 0, t = 0;
      sp.root.traverse((o) => {
        if (!o.isMesh || !o.geometry) return;
        m++;
        const g = o.geometry;
        t += (g.index ? g.index.count : (g.attributes.position?.count ?? 0)) / 3;
      });
      meshes += m; tris += t;
      if (sp.roomType) per.push([sp.id, sp.turns | 0, m, Math.round(t)]);
    }
    out.meshes = meshes; out.tris = Math.round(tris); out.perRoom = per;
    out.colliders = room.spaces.reduce((n, sp) => n + sp.colliders.length, 0);

    /**
     * 🚨 **THE ONE PRICE THAT IS NOT DRAW CALLS, AND IT IS THE ONLY THING IN THE TREE THIS
     * SLICE MOVED THAT WAS ALREADY GREEN.** `skin.js` claims every dressed triangle standing in
     * front of a dig face and subdivides it so the coat tears off in fragments; dressing a
     * generated room hands it far more to claim. Its house-wide `solveCell()` then COARSENS the
     * erosion grain until the whole house fits `MAX_ADDED_TRIS` (60 000) and warns.
     *
     * ⚠️ **IT DEGRADES BY COARSENING, NEVER BY DROPPING A FACE — and that distinction is the
     * whole reason this is reported rather than gated.** `_skin1-geom`'s A12/C8 pair exists for
     * exactly this: C8 reintroduces the pre-fix budget, which had an all-or-nothing cliff and
     * lost whole faces. F7 below asserts the surviving property (every dig face still has a
     * skin) and REPORTS the grain, because what grain is acceptable is a FEEL question — John's
     * spec is *"I don't want it to disappear in one hit"* — and not a number to bake into a
     * threshold before he has swung a hammer at it.
     */
    const sk = room.skin;
    out.skinCell = sk ? +sk.cell.toFixed(4) : null;
    out.skinCoarsened = sk ? !!sk.coarsened : null;
    out.skinFaces = sk ? sk.faces.size : 0;
    out.skinEmpty = sk ? [...sk.faces.values()].filter((f) => !f.frags.length).length : 0;
    out.skinFrags = sk ? [...sk.faces.values()].reduce((n, f) => n + f.frags.length, 0) : 0;
  } catch (e) {
    console.warn = realWarn;
    out.threw = true;
    out.error = String(e.message || e).slice(0, 300);
  }
  return out;
}

// =================================================================================================

const argv = process.argv.slice(2);
if (argv.includes('--worker')) {
  const num = (flag, d) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? Number(argv[i + 1]) : d;
  };
  const out = await runOnce({
    seed: num('--seed', 0), rooms: num('--rooms', 3),
    off: argv.includes('--off'), shrink: argv.includes('--shrink'),
    hardcode: argv.includes('--hardcode'),
  });
  console.log(JSON.stringify(out));
  process.exit(0);
}

// ---- orchestrator -------------------------------------------------------------------------------

function worker(args) {
  const r = spawnSync(process.execPath, [SELF, '--worker', ...args], { encoding: 'utf8' });
  const line = (r.stdout || '').trim().split('\n').pop();
  try { return JSON.parse(line); }
  catch { return { threw: true, error: `worker produced no JSON — stderr: ${(r.stderr || '').slice(0, 300)}` }; }
}

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log(`  FAIL  ${msg}`); } };

console.log('_gendress1-fit — a generated room in the authored room\'s clothes\n');

const rows = [];
for (const rooms of [3, 6]) {
  for (let seed = 0; seed < N_SEEDS; seed++) rows.push(worker(['--seed', String(seed), '--rooms', String(rooms)]));
}

let totalRooms = 0, totalDressed = 0, totalTurned = 0, totalOrders = 0, totalGal = 0, totalGalTurned = 0;
for (const r of rows) {
  const tag = `seed ${r.seed}/${r.rooms}r`;
  ok(!r.threw, `${tag}: build threw — ${r.error}`);
  if (r.threw) continue;
  totalRooms += r.roomRows; totalDressed += r.f2Dressed; totalTurned += r.turnedRooms;
  totalOrders += r.f3Orders; totalGal += r.f4Galleries; totalGalTurned += r.f4Turned;
  ok(r.f1FitFail === 0, `F1 ${tag}: ${r.f1FitFail} of ${r.roomRows} rooms are not the library room — ${JSON.stringify(r.worstFit)}`);
  ok(r.f2Refused === 0, `F2 ${tag}: ${r.f2Refused} room rows refused (${r.refusedWhy.join(',')})`);
  ok(r.f3Orders === r.f3Want, `F3 ${tag}: the BUILT house has ${r.f3Orders} orders, the table says ${r.f3Want}`);
  ok(r.f4Bad === 0, `F4 ${tag}: ${r.f4Bad} of ${r.f4Galleries} galleries solved for the wrong axis — ${JSON.stringify(r.f4Lens)}`);
  ok(r.f5NoColumns === r.f5Ballrooms,
    `F5 ${tag}: ${r.f5NoColumns} of ${r.f5Ballrooms} ballrooms have no centre colonnade`);
  for (const [id, turns, n] of r.f5Cols) {
    ok(n === 0, `F5 ${tag}: ${id} (turns ${turns}) still has ${n} piers`);
  }
  ok(r.f6Overlap === 0, `F6 ${tag}: ${r.f6Overlap} "overlapping cuts" warnings — ${JSON.stringify(r.warns)}`);
  ok(r.skinEmpty === 0, `F7 ${tag}: ${r.skinEmpty} of ${r.skinFaces} dig faces LOST their skin`
    + ' — the budget must coarsen the grain, never drop a face');
}

console.log(`  ${rows.length} arms · ${totalRooms} rooms, ${totalDressed} dressed, ${totalTurned} turned`
  + ` (${(100 * totalTurned / Math.max(1, totalRooms)).toFixed(0)}%) · ${totalOrders} orders in the built houses`
  + ` · ${totalGal} galleries, ${totalGalTurned} of them turned`);

const mesh3 = rows.filter((r) => r.rooms === 3 && !r.threw).map((r) => r.meshes);
const tris3 = rows.filter((r) => r.rooms === 3 && !r.threw).map((r) => r.tris);
const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
console.log(`  planrooms=3 · meshes median ${med(mesh3)} (${Math.min(...mesh3)}–${Math.max(...mesh3)})`
  + ` · tris median ${med(tris3)} (${Math.min(...tris3)}–${Math.max(...tris3)})`);

// ---- REPORTED, not gated: what the dressing costs the erosion grain -----------------------------
const skinned = rows.filter((r) => !r.threw && r.skinCell != null);
const coarse = skinned.filter((r) => r.skinCoarsened);
if (skinned.length) {
  const cells = coarse.map((r) => r.skinCell);
  console.log(`  🚨 SKIN GRAIN — ${coarse.length}/${skinned.length} arms coarsened past the requested 0.18 m`
    + `${cells.length ? ` (${Math.min(...cells)}–${Math.max(...cells)} m, i.e. up to ${(Math.max(...cells) / 0.18).toFixed(1)}x)` : ''}`
    + ` · ${skinned.reduce((n, r) => n + r.skinFrags, 0)} fragments over ${skinned.reduce((n, r) => n + r.skinFaces, 0)} dig faces`
    + `, 0 faces dropped. See the note above \`skinCell\` — REPORTED, John's feel call, lever is`
    + ' `MAX_ADDED_TRIS` in `src/game/skin.js` (not this slice\'s file).');
}

// ---- the three controls -------------------------------------------------------------------------
console.log('');

const c1 = worker(['--seed', '0', '--rooms', '3', '--shrink']);
ok(!c1.threw && c1.f2Dressed === 0 && c1.f2Refused > 0 && c1.refusedWhy.every((w) => w === 'footprint'),
  `C1: a 0.05 m mis-sized room must be REFUSED — dressed ${c1.f2Dressed}, refused ${c1.f2Refused} (${c1.refusedWhy.join(',')})${c1.threw ? ` threw: ${c1.error}` : ''}`);
ok(!c1.threw && c1.f3Orders === 0, `C1: the BUILT house must carry no order — ${c1.f3Orders}`);
console.log(`  C1 shrink   dressed ${c1.f2Dressed} · refused ${c1.f2Refused} (${[...new Set(c1.refusedWhy)].join(',')}) · orders ${c1.f3Orders}`);

const c2 = worker(['--seed', '0', '--rooms', '3', '--off']);
const base0 = rows.find((r) => r.seed === 0 && r.rooms === 3);
ok(!c2.threw && c2.f2Dressed === 0 && c2.f3Orders === 0,
  `C2: ?gendress=0 must dress nothing — dressed ${c2.f2Dressed}, orders ${c2.f3Orders}`);
ok(!c2.threw && !base0.threw && c2.meshes !== base0.meshes,
  `C2: the off arm must not build the same house — ${c2.meshes} meshes both arms`);
console.log(`  C2 off      meshes ${c2.meshes} vs ${base0.meshes} (${base0.meshes - c2.meshes >= 0 ? '+' : ''}${base0.meshes - c2.meshes})`
  + ` · tris ${c2.tris} vs ${base0.tris} (${base0.tris - c2.tris >= 0 ? '+' : ''}${base0.tris - c2.tris})`
  + ` · colliders ${c2.colliders} vs ${base0.colliders}`);

// C3 needs a seed whose gallery is TURNED, or it proves nothing — pick one off the measured rows.
const turnedSeed = rows.find((r) => !r.threw && r.rooms === 3 && r.f4Turned > 0);
if (!turnedSeed) {
  fail++;
  console.log('  FAIL  C3: no seed in the suite has a turned gallery — the reintroduction control cannot run');
} else {
  const c3 = worker(['--seed', String(turnedSeed.seed), '--rooms', '3', '--hardcode']);
  ok(!c3.threw && c3.f4Bad > 0,
    `C3: the hardcoded quarter turn must break a turned gallery on seed ${turnedSeed.seed} — f4Bad ${c3.f4Bad}${c3.threw ? ` threw: ${c3.error}` : ''}`);
  console.log(`  C3 hardcode seed ${turnedSeed.seed} · galleries ${c3.f4Galleries} (${c3.f4Turned} turned)`
    + ` · wrong axis ${c3.f4Bad} · ${JSON.stringify(c3.f4Lens)}`);
  console.log(`     shipped  seed ${turnedSeed.seed} · wrong axis ${turnedSeed.f4Bad} · ${JSON.stringify(turnedSeed.f4Lens)}`);
}

console.log(`\n  ${pass}/${fail}  (pass/fail)`);
process.exit(fail ? 1 : 0);
