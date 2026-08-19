/**
 * 🧹 **IS THE FLOOR CLEAN WHEN THE PLAYER ARRIVES?** — the live-view half of `_debris3-warmup.mjs`.
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_debris4-warmfloor.mjs \
 *        --port 5383 --q "seed=s4"
 *
 * `_debris3-warmup.mjs` drives `DebrisSystem` in isolation and proves the loading-screen priming
 * burst leaves **72 resting pieces, exactly 12 in every one of the six rooms**. It cannot see the
 * fix, because the fix is not in `DebrisSystem` — it is `debris.clear()` in `views/game.js`'s
 * warm-up teardown. **A source read is not evidence the fix reaches the screen**, so this boots
 * the real view and counts what is actually on the floor before the player has swung once.
 *
 * ⚠️ **THE READ IS TAKEN BEFORE THE GATE IS CLICKED.** `engine.start()` does not run until then,
 * so nothing has integrated and the census is exactly the state `markReady()` handed over. It is
 * also read a second time after 2 s of live loop, because a piece still in the air at ready would
 * come to rest afterwards and a ready-only check would call that clean.
 *
 * ⚠️ **`dust` IS DELIBERATELY NOT CHECKED FOR PERSISTENCE** — a puff expires inside `dust.update`,
 * so the warm-up haze is gone a few seconds into play and there is no pile to inherit. It is
 * REPORTED so a later round can tell "no dust" from "dust not measured".
 *
 * Validated by reintroduction: with `?warmsweep=0` (which skips the teardown's `debris.clear()`)
 * this must FAIL. A check that has only ever run against working code is not evidence.
 */

export default async function debris4WarmFloor({ page, note, pass, fail, skip }) {
  // ---- 1. the census at ready, BEFORE the gate is clicked and before anything integrates ----
  const atReady = await page.evaluate(() => {
    const e = window.__rrr?.engine;
    if (!e) return { ok: false, why: 'no engine' };
    if (!e.debris) return { ok: false, why: 'engine.debris is not exposed on this build' };
    const d = e.debris;
    const rooms = (e.room?.spaces ?? []).map((s) => {
      const cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2;
      let n = 0;
      for (const k in d.pools) {
        const p = d.pools[k];
        for (let i = 0; i < p.per; i++) {
          if (!p.alive[i] || !p.rest[i]) continue;
          if (Math.hypot(p.px[i] - cx, p.pz[i] - cz) < 5) n++;
        }
      }
      return [s.id, n];
    });
    const byKind = {};
    let live = 0;
    for (const k in d.pools) {
      const p = d.pools[k];
      byKind[k] = p.liveCount;
      live += p.liveCount;
    }
    return {
      ok: true,
      rest: d.restCount,
      live,
      byKind,
      pileDepth: +d.pileDepth.toFixed(4),
      pileCells: d.pile.size,
      counts: Object.fromEntries(Object.entries(d.pools).map(([k, p]) => [k, p.mesh.count])),
      visible: Object.fromEntries(Object.entries(d.pools).map(([k, p]) => [k, !!p.mesh.visible])),
      rooms,
      warmup: e.warmupStats ? { programs: e.warmupStats.programs, lap: e.warmupStats.lap } : null,
      dustLive: e.dust?.liveCount ?? null,
      sweep: new URLSearchParams(location.search).get('warmsweep'),
    };
  });

  if (!atReady.ok) { fail('the debris system is reachable at ready', atReady.why); return; }

  note(`at ready: rest ${atReady.rest} · live ${atReady.live} · pile ${atReady.pileDepth} m over `
    + `${atReady.pileCells} cells · dust live ${atReady.dustLive}`);
  note(`per-room resting (5 m of each space centre): ${atReady.rooms.map(([id, n]) => `${id} ${n}`).join(', ')}`);
  note(`pool mesh.count ${JSON.stringify(atReady.counts)} · visible ${JSON.stringify(atReady.visible)}`);
  if (atReady.warmup) note(`warm-up ran: programs ${atReady.warmup.programs.before} -> ${atReady.warmup.programs.after}, lap ${atReady.warmup.lap}`);
  else note('⚠️ no warmupStats — the warm-up block did not run (capture mode?), so this run cannot see the defect');

  const arm = atReady.sweep === '0' ? 'REINTRODUCED (?warmsweep=0)' : 'SHIPPED';
  note(`arm: ${arm}`);

  // The whole point. The warm-up primes 3 x 5 x 6 = 90 pieces; 72 of them rest. If the teardown
  // swept the floor, every one of these is zero.
  const expectFail = atReady.sweep === '0';

  const cleanAtReady = atReady.rest === 0 && atReady.live === 0 && atReady.pileCells === 0;
  if (expectFail) {
    if (cleanAtReady) fail('positive control: with ?warmsweep=0 the floor MUST be dirty', 'it is clean, so this check cannot detect the defect it was written for');
    else pass(`positive control fires: ?warmsweep=0 leaves ${atReady.rest} resting / ${atReady.live} live across ${atReady.pileCells} pile cells`);
  } else {
    if (atReady.rest !== 0) fail('no warm-up debris is resting when the player arrives', `${atReady.rest} pieces resting: ${JSON.stringify(atReady.byKind)}`);
    else pass('no warm-up debris is resting when the player arrives');

    if (atReady.live !== 0) fail('no warm-up debris is alive at all when the player arrives', `${atReady.live} live pieces would land during play`);
    else pass('no warm-up debris is alive at all when the player arrives');

    if (atReady.pileCells !== 0) fail('the pile height field is empty at ready', `${atReady.pileCells} cells, deepest ${atReady.pileDepth} m`);
    else pass('the pile height field is empty at ready');

    const dirty = atReady.rooms.filter(([, n]) => n > 0);
    if (dirty.length) fail('every room is clean at ready', `${dirty.length} room(s) hold rubble: ${dirty.map(([id, n]) => `${id} ${n}`).join(', ')}`);
    else pass(`every room is clean at ready (${atReady.rooms.length} spaces checked)`);

    // An idle pool must not pay a draw call — the constructor's own claim, re-checked here
    // because `clear()` is what has to restore it.
    const shown = Object.entries(atReady.visible).filter(([, v]) => v).map(([k]) => k);
    if (shown.length) fail('every debris pool is invisible on a clean floor', `still visible: ${shown.join(', ')} — that is ${shown.length} draw call(s) for nothing`);
    else pass('every debris pool is invisible on a clean floor (0 draw calls)');
  }

  // ---- 2. start the loop and let anything still in the air land ----
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(2500);

  const after = await page.evaluate(() => {
    const d = window.__rrr.engine.debris;
    return {
      rest: d.restCount,
      live: (() => { let n = 0; for (const k in d.pools) n += d.pools[k].liveCount; return n; })(),
      pileCells: d.pile.size,
      pileDepth: +d.pileDepth.toFixed(4),
      dustLive: window.__rrr.engine.dust?.liveCount ?? null,
    };
  });
  note(`after 2.5 s of live loop: rest ${after.rest} · live ${after.live} · pile ${after.pileDepth} m over ${after.pileCells} cells · dust live ${after.dustLive}`);

  if (!expectFail) {
    if (after.rest !== 0 || after.pileCells !== 0) {
      fail('the floor is still clean once the loop has run', `${after.rest} resting across ${after.pileCells} pile cells — something in the air at ready came down`);
    } else {
      pass('the floor is still clean once the loop has run (nothing was in the air at ready)');
    }
  }
}
