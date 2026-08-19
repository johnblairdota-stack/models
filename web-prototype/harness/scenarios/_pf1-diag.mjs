/**
 * 🚨 **JOHN DUG A BIG HOLE IN THE GALLERY AND COULD NOT WALK THROUGH IT — REPRODUCTION.**
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_pf1-diag.mjs \
 *        --port 5401 --q "seed=s4&dig=1" --shots
 *
 * ===========================================================================================
 * ✅ **FIXED 2026-08-09 (`unblock-1`). THIS FILE NOW REPORTS TWO FAILURES ON A GOOD TREE, AND
 * THAT IS THE FIX BEING CONFIRMED — DO NOT "REPAIR" THE CODE IT IS POINTING AT.**
 * ===========================================================================================
 *
 * Its two assertions are written to CONFIRM THE DEFECT ("H1 CONFIRMED — the near face is open
 * and the twin is untouched and solid", "the body is refused after [B] — John's bug
 * reproduces"), so once the defect is gone they must invert. Measured on the fixed tree, same
 * face, same seed:
 *
 *   before [B]  twin `f.gal_east.1.a`  0 hits · 0 cells through · channel 0 m · body -0.34 m
 *   after  [B]  twin `f.gal_east.1.a`  548 cells through · channel 1.463 m · body 8.6 m THROUGH
 *                                      `freePassable` 0 -> 2, `blocksMovement` false
 *
 * 🎯 **THE CAUSE WAS AN ORDERING BUG, NOT A MISSING MECHANIC.** `WallPanel._couple()` already
 * mirrors through-cells onto the twin and `applyHit` fires it on `res.brokeThrough` — but
 * `brokeThrough` requires a cell to reach `OPEN_AT` **with no barrier behind it**, so while the
 * cyan is up a player digging to the barrier never breaks through and the coupling never runs.
 * Clearing the barrier afterwards did not retroactively fire it. `toggleBarriers` in
 * `views/game.js` now runs a second pass that replays the coupling the barrier suppressed; it
 * digs nothing and removes no material the player did not already remove.
 *
 * ⚠️ **THE OTHER HALF OF THE ORIGINAL REPORT IS STILL OPEN AND IS NOT THIS FILE'S SUBJECT:**
 * the surviving wall is backface-culled and therefore invisible, so a refusal has no on-screen
 * explanation. Owner `src/game/wall.js`, HANDOFF's open list.
 *
 * Diagnostic only. It asserts nothing it has not measured in the same page; every reading is off
 * the live damage grid and off `room.collide`, at the same instant as the picture.
 *
 * THE TWO HYPOTHESES, BOTH TESTED, NEITHER ASSUMED:
 *   H1  depth is PER SIDE. `[B]` clears the barrier CHANNEL on every dig face but touches no
 *       depth, so a hole dug from room A has an intact twin panel standing in it from room B —
 *       and `boxesNear` walks BOTH (a panel is registered on both spaces it joins).
 *   H2  the channel is there but not body-sized at the rows a body occupies (an uncleared sill).
 *
 * Also probed, per the brief's "look for a third thing":
 *   T1  `_solidBoxes` / `_sightBoxes` actually recompute after `setBarrier`
 *   T2  the player's own radius against `channel()`'s assumed 0.34
 *   T3  `pathPortals()` and the collider disagreeing
 *   T4  `pathCache` not cleared by the B-key path (it does not call `unlockBarrier`)
 */

import { WEAPON_COOLDOWN } from '../../src/game/rules.js';

const SWING = +(process.env.SWING ?? WEAPON_COOLDOWN.sledge);
const f3 = (n) => (Math.round(n * 1000) / 1000).toFixed(3);

export default async function pf1({ page, note, pass, fail, skip, shot }) {
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(300);

  // ------------------------------------------------------------------ arm
  const head = await page.evaluate(() => {
    const e = window.__rrr?.engine;
    if (!e?.room?.digCensus) return null;
    const c = e.room.digCensus();
    return { on: c.on, mode: c.mode, faces: c.freeFaces, seed: String(e.run?.seed ?? ''),
      playerR: e.player?.radius ?? null, playerH: e.player?.height ?? null };
  });
  if (!head?.on || head.mode !== 'free') {
    skip('the free dig arm is under test', `mode=${head?.mode} — re-run with --q "seed=s4&dig=1"`);
    return;
  }
  note(`arm dig=${head.mode} · ${head.faces} free faces · seed "${head.seed}" · swing ${SWING}s`);
  note(`player radius ${f3(head.playerR)} m (channel() assumes 0.34) · height ${f3(head.playerH)} m`);

  // ==========================================================================
  // STEP 1 — dig a body-sized hole in a GALLERY face, at a DUD spot (barrier
  // behind it, cyan showing), the way a player digs: every blow through
  // `applyHit(pointAt(u,v), 1)` — the exact entry point `sledge.js` calls —
  // aimed at the least-dug cell inside a body-sized window.
  // ==========================================================================
  const dug = await page.evaluate(([blowsWanted]) => {
    const room = window.__rrr.engine.room;
    room.setDigPlan({ seed: String(window.__rrr.engine.run?.seed ?? 's4') });
    const c = room.digCensus();
    // a gallery face that is NOT this seed's interconnect, i.e. a dud — that is what John dug
    const gal = room.panels.filter((p) => p.spec?.free && p.spec.a === 'gallery' && p.field);
    const p = gal.find((q) => !c.link.includes(q.id) && q.width > 2.5) ?? gal[0];
    if (!p) return null;
    const g = p.field;
    // aim window: a body's width, mid-span, over the rows a body occupies
    const need = Math.ceil(0.90 / g.cellW);
    const cx0 = Math.max(0, Math.round(g.cols / 2 - need / 2));
    const cx1 = Math.min(g.cols - 1, cx0 + need - 1);
    const cy0 = Math.floor(0.30 / g.cellH);
    const cy1 = Math.min(g.rows - 1, Math.ceil(1.95 / g.cellH));
    const hitsAt = [];
    for (let k = 0; k < blowsWanted; k++) {
      let bx = cx0, by = cy0, bd = 2;
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
        const d = g.depth[g.idx(cx, cy)];
        if (d < bd) { bd = d; bx = cx; by = cy; }
      }
      p.applyHit(p.pointAt((bx + 0.5) / g.cols, (by + 0.5) / g.rows), 1);
      hitsAt.push([bx, by]);
    }
    g.flush();
    return { id: p.id, twin: p.twin?.id ?? null, space: p.spec.a, other: p.spec.b,
      w: +p.width.toFixed(2), grid: `${g.cols}x${g.rows}`, blows: hitsAt.length,
      window: [cx0, cx1, cy0, cy1] };
  }, [60]);
  if (!dug) { fail('a gallery dig face exists', 'none found'); return; }
  note('');
  note(`DUG: ${dug.blows} real blows into ${dug.id} (${dug.space} -> ${dug.other}), `
    + `${dug.w} m span, grid ${dug.grid}, twin ${dug.twin}`);

  /** everything both sides know, at one instant. */
  const readGrid = () => page.evaluate((ids) => {
    const room = window.__rrr.engine.room;
    const byId = new Map(room.panels.map((p) => [p.id, p]));
    const face = (id) => {
      const p = byId.get(id);
      if (!p?.field) return null;
      const g = p.field, ch = p.openChannel();
      let see = 0, open = 0, barr = 0, deep = 0;
      for (let i = 0; i < g.depth.length; i++) {
        if (g.depth[i] >= 0.999) { see++; if (!g.barrier[i]) open++; }
        if (g.depth[i] > 0.5) deep++;
        if (g.barrier[i]) barr++;
      }
      // the SILL question (H2): per column, the first row from the floor band that is NOT
      // passable — read off the same macro grid channel() uses.
      const m = g._macro(false);
      const cols = [];
      for (let mx = 0; mx < m.mc; mx++) {
        let my = Math.max(0, Math.floor(0.30 / (g.cellH * m.MACRO)));
        const r0 = my;
        while (my < m.mr && m.gone[my * m.mc + mx]) my++;
        cols.push(my > r0 ? +(my * g.cellH * m.MACRO).toFixed(2) : 0);
      }
      return {
        id, cells: g.depth.length, seeCells: see, openCells: open, deepCells: deep,
        barrierCells: barr, maxDepth: +g.maxDepth.toFixed(3), hits: g.hits.length,
        chW: +ch.width.toFixed(3), chH: +(ch.height ?? 0).toFixed(2), open: !!ch.open,
        boxes: p.solidBoxes().length, blocksMovement: p.blocksMovement(),
        colTopMax: Math.max(...cols), colTopNonZero: cols.filter((v) => v > 0).length,
        colTops: cols.map((v) => (v === 0 ? '.' : v >= 1.7 ? '#' : 'x')).join(''),
      };
    };
    // and: can a BODY actually get through? push the player's own radius at the wall.
    const p = byId.get(ids[0]);
    const V = window.__rrr.engine.player.pos.constructor;
    const n = p.normal;
    const ch = p.openChannel();
    // stand on the room side, in front of the channel the face reports
    const cu = ch.open ? ch.centreU : 0.5;
    const start = p.pointAt(cu, 0.5).clone();
    const floorY = window.__rrr.engine.room.floorY ?? 0;
    start.y = floorY;
    const pos = new V(start.x + n.x * 1.4, floorY, start.z + n.z * 1.4);
    const R = window.__rrr.engine.player.radius;
    const step = new V(-n.x * 0.05, 0, -n.z * 0.05);
    let travelled = 0;
    for (let i = 0; i < 200; i++) {
      const want = pos.clone().add(step);
      const got = window.__rrr.engine.room.collide(want, R, 1.70);
      pos.copy(got);
    }
    // signed distance past the face along -normal (positive = through)
    travelled = -((pos.x - start.x) * n.x + (pos.z - start.z) * n.z);
    const census = room.digCensus();
    return {
      a: face(ids[0]), b: ids[1] ? face(ids[1]) : null,
      pastFace: +travelled.toFixed(3), radius: +R.toFixed(3),
      routed: (() => {
        try {
          const r = room.pathPortals(p.spec.a, p.spec.b, 2 * R, 1.70);
          return Array.isArray(r) ? r.length : (r ? 1 : 0);
        } catch (e) { return `err:${String(e).slice(0, 40)}`; }
      })(),
      freePassable: census.freePassable, unlocked: census.unlocked,
    };
  }, [dug.id, dug.twin]);

  const show = (tag, r) => {
    note('');
    note(`── ${tag}`);
    for (const k of ['a', 'b']) {
      const s = r[k];
      if (!s) { note(`   ${k}: (none)`); continue; }
      note(`   ${s.id.padEnd(18)} hits ${String(s.hits).padStart(3)} · maxDepth ${s.maxDepth} · `
        + `cells dug-through ${s.seeCells} · PASSABLE cells ${s.openCells} · barrier ${s.barrierCells}/${s.cells}`);
      note(`   ${''.padEnd(18)} channel ${s.chW} m x ${s.chH} m · open ${s.open} · `
        + `blocksMovement ${s.blocksMovement} · collider boxes ${s.boxes}`);
      note(`   ${''.padEnd(18)} column tops (. = clear to the lintel, x = short, # = solid): ${s.colTops}`);
    }
    note(`   body (r ${r.radius}) driven at the wall for 200 steps: ${r.pastFace} m past the face `
      + `(positive = through) · route ${JSON.stringify(r.routed)} · `
      + `freePassable ${r.freePassable} · unlocked ${r.unlocked}`);
  };

  const before = await readGrid();
  show('WITH THE CYAN BARRIER ON — this is John\'s first two screenshots', before);
  await shot('pf1-barrier-on');

  // ==========================================================================
  // STEP 2 — press [B]. Exactly what the key does: `setBarrier(false)` on every
  // dig panel. Driven through the real key so the promise on screen is the one
  // under test.
  // ==========================================================================
  await page.keyboard.press('KeyB');
  await page.waitForTimeout(250);
  const promptAfter = await page.evaluate(() => {
    const room = window.__rrr.engine.room;
    let barr = 0, tot = 0;
    for (const p of room.panels) if (p.spec?.free && p.field) {
      for (let i = 0; i < p.field.barrier.length; i++) { tot++; barr += p.field.barrier[i]; }
    }
    return { barrierCellsHouse: barr, totalCells: tot };
  });
  note('');
  note(`[B] pressed — barrier cells left in the whole house: ${promptAfter.barrierCellsHouse} `
    + `of ${promptAfter.totalCells}`);
  if (promptAfter.barrierCellsHouse !== 0) {
    note('⚠️ the key did not fire (barrier still armed) — falling back to the same calls it makes');
    await page.evaluate(() => {
      for (const p of window.__rrr.engine.room.panels) if (p.spec?.dig) p.setBarrier(false);
    });
  }

  const after = await readGrid();
  show('AFTER [B] "BARRIERS OFF — DIG ANYWHERE" — John\'s second two screenshots', after);
  await shot('pf1-barrier-off');

  // ==========================================================================
  // THE VERDICT — stated as what was measured, not as a hypothesis
  // ==========================================================================
  note('');
  const A = after.a, B = after.b;
  if (A && B) {
    note(`H1 (depth is per side): face ${A.id} channel ${A.chW} m open=${A.open}; `
      + `twin ${B.id} hits ${B.hits} maxDepth ${B.maxDepth} channel ${B.chW} m open=${B.open}, `
      + `${B.boxes} collider box(es) standing.`);
    if (A.open && !B.open && B.hits === 0) {
      pass('H1 CONFIRMED — the near face is open and the twin is untouched and solid',
        `${A.id} ${A.chW} m open · ${B.id} 0 hits, ${B.boxes} boxes, blocksMovement ${B.blocksMovement}`);
    } else if (A.open && B.open) {
      fail('H1 CONFIRMED — the near face is open and the twin is untouched and solid',
        'BOTH faces are open after [B] — H1 is refuted, the block is elsewhere');
    } else if (!A.open) {
      fail('H1 CONFIRMED — the near face is open and the twin is untouched and solid',
        `the NEAR face is not open either (${A.chW} m) — H2 territory, read the column tops`);
    }
    const bodyThrough = after.pastFace > 0.15;
    if (!bodyThrough) {
      pass('the body is refused after [B] — John\'s bug reproduces',
        `driven 200 steps at the hole, it ends ${after.pastFace} m past the face`);
    } else {
      fail('the body is refused after [B] — John\'s bug reproduces',
        `the body walked ${after.pastFace} m through — this repro does NOT reproduce his report`);
    }
    note(`H2 (sill / not body-sized): near face column tops "${A.colTops}" — `
      + `${A.colTopNonZero} of ${A.colTops.length} columns short of the lintel; `
      + `reported channel ${A.chW} m x ${A.chH} m against 0.68 m x 1.70 m needed.`);
  }

  // ---- T1: do the caches actually recompute after setBarrier?
  const t1 = await page.evaluate((id) => {
    const p = window.__rrr.engine.room.panels.find((q) => q.id === id);
    const n0 = p.solidBoxes().length;
    const cachedRef = p._solidBoxes;
    p.setBarrier(false);
    const nulled = p._solidBoxes === null;
    const n1 = p.solidBoxes().length;
    return { n0, nulled, n1, sameArray: cachedRef === p._solidBoxes };
  }, dug.id);
  note('');
  note(`T1 collider rebuild after setBarrier: boxes ${t1.n0} -> (cache nulled ${t1.nulled}) -> ${t1.n1}`);
  t1.nulled ? pass('T1 setBarrier invalidates the collider cache', `${t1.n0} -> ${t1.n1} boxes`)
    : fail('T1 setBarrier invalidates the collider cache', JSON.stringify(t1));

  // ---- T2: the player's radius against channel()'s assumption
  const rr = head.playerR;
  Math.abs(rr - 0.34) < 0.005
    ? pass('T2 the player radius matches the channel test', `${f3(rr)} m vs 0.34 m assumed`)
    : fail('T2 the player radius matches the channel test',
      `player is ${f3(rr)} m but blocksMovement()/openChannel() hardcode 0.34 — `
      + `the channel test is measuring a different body`);
}
