#!/usr/bin/env node
/**
 * _gendress1-look.mjs — WHAT DOES THE DRESSED GENERATED ROOM COST, AND WHAT DOES IT LOOK LIKE?
 *
 * `gendress-1`, 2026-08-15. The browser half of the gate; `_gendress1-fit.mjs` is the headless
 * half (32 arms, the three controls, and the "does the order resolve" question).
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_gendress1-look.mjs \
 *        --port 5530 --q "plan=gen&planseed=0&planrooms=6"
 *   GENDRESS_TAG=off node harness/playtest.mjs … --q "plan=gen&planseed=0&planrooms=6&gendress=0"
 *   GENDRESS_TAG=authored node harness/playtest.mjs … --q "seed=s4"       the REFERENCE frames
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 WHY THE DRAW-CALL NUMBER IS TAKEN THE WAY IT IS
 * ---------------------------------------------------------------------------------------------
 * HANDOFF, corrected 2026-08-11: draw-call counts are deterministic ACROSS AGENTS and **not
 * across a walk** — `ballroom.centre` read 423 / 461 / 479 on one build, seed and station,
 * because state accumulates along a multi-station walk. So the BUDGET assertion below is the
 * worst station of one walk (which is the shape `eo2-calls` and `_genlight1-rig` C3b both use,
 * and it can only over-read), and the BEFORE/AFTER attribution is NOT taken from two walks at
 * all: it is the per-space VISIBLE MESH census, which is a count of objects in the graph and
 * cannot drift with accumulated state.
 *
 * ⚠️ **AND `?gendress=0` CANNOT BE FLIPPED IN PLACE, WHICH IS STATED RATHER THAN FUDGED.**
 * `spaces.js` reads it at module scope and the dressing is baked into merged geometry at build
 * time, so there is no in-session arm — unlike `_genlight1-rig`'s C1, which could overwrite a
 * light. The honest instrument for the price is therefore the headless per-room mesh delta in
 * `_gendress1-fit.mjs` (same seed, same room count, one process each), quoted in the report;
 * this file's job is the ABSOLUTE budget on the arm we ship, and the pictures.
 *
 * 🚨 CONTROLS THAT MUST FAIL, ON EVERY RUN.
 *   L1  IS THIS EVEN A DRESSED HOUSE? Read off `engine.room.estate.orders` — a BUILD fact — and
 *       SKIP loudly if it is empty, rather than reporting a comfortable budget for a house with
 *       nothing in it. Five instruments this campaign reported a zero that meant "I failed to
 *       look".
 *   L2  UNRESOLVABLE STATION. Parked 500 m out, `spaceAt` must return null and the station must
 *       be excluded from both tallies rather than counted as a cheap one.
 *   L3  A PHOTOGRAPHED STATION MUST HAVE THE ORDER IN FRONT OF IT. Every gallery/ballroom/study
 *       frame is taken in a space whose `orderPlan` is non-null — otherwise the picture is of a
 *       bare box and would be filed as "the dressing looks like nothing".
 *
 * ⚠️ **ON THE `?gendress=0` ARM, L1 SKIPS AND L3 FAILS, AND THAT IS THE ARM WORKING.** Measured
 * 2026-08-15, seed 0 / `planrooms=6`: dressed **10 passed · 0 failed**, undressed **8 passed ·
 * 1 failed · 1 skipped**. If the off arm ever comes back all-green, the dressing is not reaching
 * the build and every budget number in this file is a number for the wrong house.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 WHAT IT MEASURED — 2026-08-15, and THE TERM TO WATCH IS TRIANGLES, NOT DRAW CALLS
 * ---------------------------------------------------------------------------------------------
 * Every pair below is the same seed, same room count, same 12–13 stations, `?gendress=0` against
 * the shipped arm.
 *
 *   arm                              worst calls        worst triangles
 *   seed 0 · planrooms=3 (DEFAULT)   570 -> 579 /625    282k -> 306k /900k
 *   seed 0 · planrooms=6             510 -> 520 /625    312k -> 518k /900k
 *   seed 4 · planrooms=6 (turned)    254 -> 255 /625    327k -> **821k** /900k
 *   AUTHORED `seed=s4` (eo2-calls)   427 -> 427 /625    604k -> 604k /900k   (a NO-OP, as designed)
 *
 * · **Draw calls cost +8 to +11 for the whole house**, at every station and both room counts —
 *   the orders' new material keys (gilt/wood/clere, cstone/dark, drape) are 3–5 merged meshes per
 *   dressed room and everything else rides in a bucket the room already drew. `pilasters` and the
 *   colonnade are **+0**: they go into the `mould` bin the cornice band already opens.
 * · 🚨 **TRIANGLES ARE THE REAL BILL: up to +494k, and seed 4 lands at 91% of the budget.** That
 *   is a `planrooms=6` figure (the non-default arm); the shipped `planrooms=3` default peaks at
 *   306k. **Anyone raising `planrooms` should re-run this file before believing the budget.**
 */

const MIN_PHOTO_W = 4.0;      // narrower than this and the third-person boom is inside a wall

export default async function look({ page, snap, pass, fail, skip, note, SHOTDIR }) {
  const { writeFile, mkdir } = await import('node:fs/promises');
  const path = await import('node:path');
  const { hold, release } = await import('../still.mjs');
  const TAG = process.env.GENDRESS_TAG ?? 'on';

  const frames = () => page.evaluate(() => window.__rrr?.frames?.() ?? 0);
  const step = async (n = 3) => {
    const f0 = await frames();
    for (let i = 0; i < 200; i++) {
      await page.waitForTimeout(40);
      const f = await frames();
      if (f - f0 >= n) return f - f0;
    }
    return -1;
  };
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(300);

  // ---- L1: the house, read off the BUILD ------------------------------------------------------
  const head = await page.evaluate(() => {
    const e = window.__rrr.engine;
    return {
      orders: e.room.estate?.orders ?? {},
      estateOn: !!e.room.estate?.on,
      spaces: e.room.spaces.map((s) => ({
        id: s.id, name: s.name, x0: s.x0, x1: s.x1, z0: s.z0, z1: s.z1, storey: s.storey,
        roomType: s.roomType ?? null, turns: s.turns ?? 0,
        order: s.order ?? null, hasPlan: !!s.orderPlan,
        planLen: s.orderPlan?.len ?? null, planWid: s.orderPlan?.wid ?? null,
        columns: s.columns ? (s.columns.pts?.length ?? s.columns.xs?.length ?? 0) : 0,
      })),
    };
  });
  const dressed = head.spaces.filter((s) => s.hasPlan);
  note(`${head.spaces.length} spaces · ${Object.keys(head.orders).length} carry a RESOLVED order`
    + ` (${Object.values(head.orders).join(', ') || 'none'})`
    + ` · ${head.spaces.filter((s) => s.columns).length} carry a colonnade`);
  for (const s of dressed) {
    note(`  ${s.id.padEnd(14)} ${String(s.order).padEnd(9)} turns ${s.turns}`
      + ` · footprint ${(s.x1 - s.x0).toFixed(2)} x ${(s.z1 - s.z0).toFixed(2)}`
      + ` · order solved for ${s.planLen != null ? `${s.planLen.toFixed(2)} x ${s.planWid.toFixed(2)}` : 'n/a'}`
      + `${s.columns ? ` · ${s.columns} piers` : ''}`);
  }

  const park = async (x, z) => {
    await page.evaluate(([px, pz]) => {
      const e = window.__rrr.engine;
      e.player.pos.set(px, e.room.floorY, pz);
      e.player.vel.set(0, 0, 0);
      e.cam._first = true;
      return true;
    }, [x, z]);
    await step(40);
  };
  const resolved = () => page.evaluate(() => {
    const e = window.__rrr.engine;
    const s = e.room.spaceAt(e.camera.position) ?? e.room.spaceAt(e.player.pos);
    return s ? s.id : null;
  });

  // ---- the walk: calls and triangles at every station ------------------------------------------
  const rows = [];
  for (const s of head.spaces) {
    await park((s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2);
    const id = await resolved();
    if (id !== s.id) { rows.push({ s, status: 'UNRESOLVED', got: id }); continue; }
    const c = await page.evaluate(() => {
      const e = window.__rrr.engine;
      let visMeshes = 0, resident = 0;
      e.scene.traverse((o) => { if (o.isMesh && o.visible) visMeshes++; });
      for (const sp of e.room.spaces) if (sp.root.visible) resident++;
      return { calls: e.renderer.info.render.calls, tris: e.renderer.info.render.triangles,
        visMeshes, resident };
    });
    rows.push({ s, status: 'ok', ...c });
  }
  for (const r of rows) {
    if (r.status !== 'ok') { note(`  ${r.s.id.padEnd(14)} UNRESOLVED (spaceAt gave ${r.got ?? 'null'}) — excluded`); continue; }
    note(`  ${r.s.id.padEnd(14)} calls ${String(r.calls).padStart(4)} · tris ${String(r.tris).padStart(7)}`
      + ` · visible meshes ${String(r.visMeshes).padStart(4)} · resident ${r.resident}`);
  }

  const seen = rows.filter((r) => r.status === 'ok');
  if (!seen.length) { fail('a station could be resolved', 'every station was UNRESOLVED'); return; }

  if (!Object.keys(head.orders).length) {
    skip('L1 CONTROL the house under test is DRESSED',
      `estate.orders is empty (estate ${head.estateOn ? 'on' : 'OFF'}) — every number below would be a`
      + ' comfortable zero meaning "I failed to look". Expected on the ?gendress=0 arm.');
  } else {
    pass('L1 CONTROL the house under test is DRESSED',
      `${Object.keys(head.orders).length} orders resolved and emitted, read off engine.room.estate.orders`);
  }

  // ---- L2: the unresolvable station -----------------------------------------------------------
  await park(500, 500);
  const outside = await resolved();
  outside === null
    ? pass('L2 CONTROL an unresolvable station reports UNRESOLVED', 'parked 500 m out: spaceAt() -> null')
    : fail('L2 CONTROL an unresolvable station reports UNRESOLVED', `spaceAt() returned "${outside}"`);

  // ---- the budget, on the arm we ship ----------------------------------------------------------
  const worst = seen.reduce((a, b) => (b.calls > a.calls ? b : a));
  const worstT = seen.reduce((a, b) => (b.tris > a.tris ? b : a));
  worst.calls <= 625 && worstT.tris <= 900000
    ? pass('the dressed generated house fits the budget',
      `worst ${worst.s.id} ${worst.calls}/625 calls · worst ${worstT.s.id} ${worstT.tris}/900k tris`
      + ` over ${seen.length} stations`)
    : fail('the dressed generated house fits the budget',
      `worst ${worst.s.id} ${worst.calls}/625 calls · worst ${worstT.s.id} ${worstT.tris}/900k tris`);

  // ---- L3 + the frames John judges -------------------------------------------------------------
  await mkdir(SHOTDIR, { recursive: true });
  // one station per ROOM TYPE, because the deliverable is "a generated room of each type against
  // the authored room of the same type" — not N frames of whichever rooms came first.
  const byType = new Map();
  for (const r of seen) {
    const t = r.s.roomType ?? (r.s.order ?? null) ?? (/^c\d+\./.test(r.s.id) ? 'corridor' : 'authored');
    if (!byType.has(t) && Math.min(r.s.x1 - r.s.x0, r.s.z1 - r.s.z0) >= MIN_PHOTO_W) byType.set(t, r);
  }
  const narrow = seen.filter((r) => Math.min(r.s.x1 - r.s.x0, r.s.z1 - r.s.z0) < MIN_PHOTO_W);
  if (narrow.length) {
    note(`not photographed — short extent under ${MIN_PHOTO_W} m, the boom would be inside a wall: `
      + narrow.map((r) => `${r.s.id} (${Math.min(r.s.x1 - r.s.x0, r.s.z1 - r.s.z0).toFixed(2)} m)`).join(', '));
  }

  const written = [];
  for (const [type, r] of byType) {
    const s = r.s;
    await park((s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2);
    await hold(page);
    await page.waitForTimeout(200);
    const buf = await snap(`gendress-${s.id}`);
    await release(page);
    if (!buf) { note(`(no frame for ${s.id})`); continue; }
    const p = path.join(SHOTDIR, `gendress1.${TAG}.${type}.${s.id}.png`);
    await writeFile(p, buf);
    written.push({ p, type, id: s.id, kb: buf.length / 1024, order: s.hasPlan });
    note(`frame ${p} (${(buf.length / 1024).toFixed(0)} KB) · ${s.hasPlan ? `order ${s.order}` : 'NO ORDER'}`);
  }
  written.length
    ? pass('frames written for grading', `${written.length} room types — grade with harness/grade.mjs`)
    : fail('frames written for grading', 'no capture came back');

  // L3 — a photographed station of a type that HAS an order must have had it in front of it.
  const shouldHaveOrder = written.filter((w) => ['gallery', 'ballroom', 'study'].includes(w.type));
  const withOrder = shouldHaveOrder.filter((w) => w.order).length;
  if (!shouldHaveOrder.length) {
    skip('L3 CONTROL every photographed order room had its order built',
      'no gallery/ballroom/study was photographed on this arm');
  } else {
    withOrder === shouldHaveOrder.length
      ? pass('L3 CONTROL every photographed order room had its order built',
        `${withOrder}/${shouldHaveOrder.length} — the frame is of the dressing, not of a bare box`)
      : fail('L3 CONTROL every photographed order room had its order built',
        `${withOrder}/${shouldHaveOrder.length} frames were taken in a room with no orderPlan`);
  }
}
