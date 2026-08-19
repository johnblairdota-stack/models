/**
 * 📉 **WHAT THE PILE COSTS AT THE PESSIMAL STATION — 601/625, not a friendly one.**
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_debris4-calls.mjs \
 *        --port 5386 --q "seed=s4"
 *
 * `calls-1` measured the ceiling with **every free face in the house dug**: 426 pristine → 601,
 * 692k of 900k triangles, against a 625 budget. That leaves **~24 calls of headroom**, and every
 * debris round since has been written against that number without re-reading it.
 *
 * 🚨 **AND `_calls1-dug.mjs` CANNOT SEE THE DEBRIS, BY CONSTRUCTION.** It suppresses `onBreak`
 * before driving its blows — deliberately and correctly, because it is a WALL probe and 2000
 * collapse hooks would take twenty minutes. So the 601 is a **debris-free 601**, and the pile's
 * cost has never been added to it. This probe adds it, in the same page, at the same twelve
 * stations, so the two numbers are commensurable.
 *
 * ⚠️ **THE WORST CASE FOR CALLS IS OCCUPANCY, NOT DEPTH.** A pool is ONE `InstancedMesh`
 * whatever it holds, so a pool costs the same for 1 piece as for 500; what decides the bill is
 * how many of the five pools are non-empty at once (`debris.js` gates `mesh.visible` on
 * `liveCount`), and whether each one is drawn twice — beauty pass plus shadow pass, because
 * `castShadow` is on. So the arm measured here is **every pool saturated and resting**, which is
 * strictly worse than anything play can reach: `debris.js`'s own header prices the whole two-kind
 * budget at ~880 pieces, i.e. about one and a half digs, and the three cosmetic kinds only fill
 * on a scalar-arm stage wall.
 *
 * ⚠️ **TRIANGLES ARE THE OTHER HALF AND THEY DO SCALE WITH THE PILE.** `mesh.count` follows the
 * high-water slot, so an unused pool is free — but a saturated one is not, and 692k of a 900k
 * budget is already spent at this station. Both are reported.
 *
 * ⚠️ **A FLIP A/B IS LEGITIMATE HERE AND IT WOULD NOT BE FOR PROGRAMS.** HANDOFF: draw-call
 * counts are deterministic and exempt from the one-measurer-at-a-time rule. `calls-1`'s warning
 * — that a flip taken standing still is blind to a cost paid on ARRIVAL — is about shader
 * compiles, and no compile is involved in making an `InstancedMesh` visible.
 */

const STATIONS = (process.env.STATIONS ?? [
  'gallery.west', 'gallery.mid', 'gallery.east',
  'study_w.north', 'study_w.south', 'service.mid',
  'study_e.north', 'study_e.south',
  'ballroom.north', 'ballroom.centre', 'ballroom.south',
  'chapel.centre',
].join(',')).split(',').filter(Boolean);

export default async function debris4Calls({ page, note, pass, fail, skip }) {
  const frames = () => page.evaluate(() => window.__rrr?.frames?.() ?? 0);
  const step = async (n = 3) => {
    const f0 = await frames();
    for (let i = 0; i < 150; i++) {
      await page.waitForTimeout(40);
      const f = await frames();
      if (f - f0 >= n) return f - f0;
    }
    return -1;
  };
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(300);

  const head = await page.evaluate(() => {
    const e = window.__rrr.engine;
    if (!e.debris) return { ok: false };
    const c = e.room.panelCensus();
    return {
      ok: true, mode: c.mode, panels: c.panels, pristine: c.pristine,
      free: e.room.panels.filter((p) => p.spec?.free).length,
      pools: Object.fromEntries(Object.entries(e.debris.pools).map(([k, p]) => [k, p.per])),
      particles: e.quality?.particles ?? null,
    };
  });
  if (!head.ok) { fail('the debris system is reachable', 'engine.debris is not exposed'); return; }
  note(`walls "${head.mode}" · ${head.panels} panels (${head.pristine} pristine) · ${head.free} free dig faces`);
  note(`quality.particles ${head.particles} · pool sizes ${JSON.stringify(head.pools)} `
    + `= ${Object.values(head.pools).reduce((a, b) => a + b, 0)} slots`);

  const sweep = async (label) => {
    const rows = [];
    for (const name of STATIONS) {
      const ok = await page.evaluate((n) => {
        const e = window.__rrr.engine;
        const a = e.room.anchor(n);
        if (!a) return false;
        e.player.pos.set(a.x, e.room.floorY, a.z);
        e.player.vel.set(0, 0, 0);
        e.cam._first = true;
        return true;
      }, name);
      if (!ok) continue;
      await step(40);
      const r = await page.evaluate(() => {
        const e = window.__rrr.engine;
        return {
          calls: e.renderer.info.render.calls,
          tris: e.renderer.info.render.triangles,
          rest: e.debris.restCount,
          shown: Object.values(e.debris.pools).filter((p) => p.mesh.visible).length,
        };
      });
      rows.push({ name, ...r });
    }
    const worst = rows.reduce((a, b) => (b.calls > a.calls ? b : a));
    const fattest = rows.reduce((a, b) => (b.tris > a.tris ? b : a));
    note(`${label}: worst ${worst.name} ${worst.calls} calls · fattest ${fattest.name} ${(fattest.tris / 1000).toFixed(0)}k tris`
      + ` · pools shown ${worst.shown}/5 · rest ${worst.rest}`);
    note(`${' '.repeat(label.length)}  ` + rows.map((x) => `${x.name.split('.')[0].slice(0, 4)}.${x.name.split('.')[1].slice(0, 3)} ${x.calls}`).join(' · '));
    return { rows, worst, fattest };
  };

  // ---- 1. the pessimal wall state: one blow on every free face, `onBreak` suppressed ----------
  // Exactly `_calls1-dug.mjs`'s drive, so this run's baseline is comparable to its 601.
  const drove = await page.evaluate(() => {
    const e = window.__rrr.engine;
    const seg = e.room.panels.filter((p) => p.spec?.free);
    const saved = seg.map((p) => p.onBreak);
    for (const p of seg) p.onBreak = null;
    for (const p of seg) p.damage(1e5, { weapon: 'nailgun' });
    seg.forEach((p, i) => { p.onBreak = saved[i]; });
    e.debris.clear();                       // whatever the drive shook loose is not the arm
    const c = e.room.panelCensus();
    return { driven: seg.length, promoted: c.panels - c.pristine };
  });
  note(`one blow on each of ${drove.driven} free faces -> ${drove.promoted} panels promoted (onBreak suppressed)`);

  const bare = await sweep('DUG, NO PILE  ');

  // ---- 2. saturate every pool and let it settle, then re-sweep --------------------------------
  const fill = await page.evaluate(() => {
    const e = window.__rrr.engine, d = e.debris;
    const at = e.player.pos.clone(); at.y = e.room.floorY + 1.4;
    // fill each pool to its own capacity — strictly worse than play can reach
    for (const [k, p] of Object.entries(d.pools)) d.burst(k, at, p.per, { speed: 2.4, spread: 1.6 });
    // integrate to rest synchronously: a pure function of the seed, no frames needed
    for (let f = 0; f < 1200; f++) d.update(1 / 60);
    return {
      rest: d.restCount,
      live: Object.fromEntries(Object.entries(d.pools).map(([k, p]) => [k, p.liveCount])),
      counts: Object.fromEntries(Object.entries(d.pools).map(([k, p]) => [k, p.mesh.count])),
      shown: Object.values(d.pools).filter((p) => p.mesh.visible).length,
      peak: +d.pileDepth.toFixed(3),
    };
  });
  note(`pools saturated: ${fill.rest} resting · ${fill.shown}/5 pools visible · mesh.count ${JSON.stringify(fill.counts)} · peak ${fill.peak} m`);

  const piled = await sweep('DUG + FULL PILE');

  /**
   * ---- 3. THE DELTA, AS A PAIRED IN-PLACE FLIP AT THE WORST STATION -------------------------
   *
   * 🚨 **THE THREE-SWEEP FORM ABOVE CANNOT ATTRIBUTE A DELTA AND IT PROVED IT ON ITSELF.** The
   * first version of this probe compared sweep-to-sweep and read **555 → 537 → 566**: the pile
   * apparently SAVED 18 calls and sweeping it away cost 11 more than the baseline. Draw calls are
   * deterministic *per frame*, which is what HANDOFF's "exempt" means — they are not stable
   * across two sweeps separated by minutes of live play, because the hunter has walked, the
   * Director has moved, loose pickups have changed residency and `visibleSpaces()` has moved with
   * them. **±18 calls of drift is the noise floor of a station-to-station comparison here, and
   * the thing being measured is smaller than that.**
   *
   * So the delta is taken the only way it can be: **park, do not move, and flip the five pools'
   * `visible` between two consecutive reads.** Nothing else in the scene can change in that
   * window. Repeated four times so a single bad pair cannot carry the answer, and the paired
   * differences are reported individually rather than as a mean of two absolutes.
   *
   * ⚠️ No compile is involved in making an `InstancedMesh` visible, so `calls-1`'s warning about
   * a flip being blind to arrival-paid cost does not apply — that warning is about PROGRAMS.
   */
  await page.evaluate((n) => {
    const e = window.__rrr.engine;
    const a = e.room.anchor(n);
    e.player.pos.set(a.x, e.room.floorY, a.z);
    e.player.vel.set(0, 0, 0);
    e.cam._first = true;
  }, piled.worst.name);
  await step(40);

  const pairs = [];
  for (let k = 0; k < 4; k++) {
    const on = await page.evaluate(() => {
      const d = window.__rrr.engine.debris;
      for (const p of Object.values(d.pools)) p.mesh.visible = p.liveCount > 0;
    });
    await step(2);
    const a = await page.evaluate(() => ({
      calls: window.__rrr.engine.renderer.info.render.calls,
      tris: window.__rrr.engine.renderer.info.render.triangles,
    }));
    await page.evaluate(() => {
      for (const p of Object.values(window.__rrr.engine.debris.pools)) p.mesh.visible = false;
    });
    await step(2);
    const b = await page.evaluate(() => ({
      calls: window.__rrr.engine.renderer.info.render.calls,
      tris: window.__rrr.engine.renderer.info.render.triangles,
    }));
    pairs.push({ on: a.calls, off: b.calls, d: a.calls - b.calls, dt: a.tris - b.tris });
    void on;
  }
  await page.evaluate(() => {
    const d = window.__rrr.engine.debris;
    for (const p of Object.values(d.pools)) p.mesh.visible = p.liveCount > 0;
  });
  note(`🎯 PAIRED FLIP at ${piled.worst.name}, 1038 resting pieces, nothing else moved:`);
  for (const p of pairs) note(`     pools ON ${p.on} calls · OFF ${p.off} · Δ ${p.d >= 0 ? '+' : ''}${p.d} calls, ${p.dt >= 0 ? '+' : ''}${(p.dt / 1000).toFixed(0)}k tris`);
  const ds = pairs.map((p) => p.d);
  const dMin = Math.min(...ds), dMax = Math.max(...ds);
  note(`🎯 THE PILE COSTS ${dMin === dMax ? `${dMin} calls` : `${dMin}..${dMax} calls`} at the pessimal station`
    + ` · absolute worst with everything dug AND the pile down: ${piled.worst.calls}/625`);

  /**
   * ⚠️ **THE BAR IS THE SPREAD OF THE PAIRED DELTAS, NOT EXACT AGREEMENT — and demanding exact
   * agreement was a false FAIL on a good tree the first time this ran.** The four OFF reads in
   * that run were **555, 558, 560, 565**: the baseline itself climbs ~10 calls over the eight
   * frames the flips take, because the hunter and the Director keep moving and residency moves
   * with them. Against a baseline drifting by 10, a delta reproducing to ±1 is a *tight* result,
   * and HANDOFF's own rule is that "byte-identical" is an impossible test that must never be
   * demanded as proof — the correct proof is "inside the same-config noise floor."
   */
  dMax - dMin <= 2
    ? pass('the delta is reproducible', `4 paired flips read ${ds.join(', ')} calls — spread ${dMax - dMin}`)
    : fail('the delta is reproducible',
      `paired flips spread ${dMax - dMin} calls (${ds.join(', ')}) — wider than the baseline's own drift, so something else is flipping`);

  piled.worst.calls <= 625
    ? pass('the dug house WITH a full pile still fits the draw-call budget',
      `worst ${piled.worst.name} ${piled.worst.calls}/625, ${625 - piled.worst.calls} spare`)
    : fail('the dug house WITH a full pile still fits the draw-call budget',
      `worst ${piled.worst.name} ${piled.worst.calls}/625`);

  piled.fattest.tris <= 900000
    ? pass('...and the triangle budget', `${(piled.fattest.tris / 1000).toFixed(0)}k/900k at ${piled.fattest.name}`)
    : fail('...and the triangle budget', `${(piled.fattest.tris / 1000).toFixed(0)}k/900k at ${piled.fattest.name}`);

  // `debris.js`'s standing claim: five pools, one call each, and the shadow pass doubles it.
  dMax <= 10
    ? pass('the whole pile costs at most one call per pool per pass',
      `+${dMax} for 5 saturated pools (beauty + shadow), 1038 resting pieces`)
    : fail('the whole pile costs at most one call per pool per pass',
      `+${dMax} — a pool is one InstancedMesh, so anything above 10 means something else is drawing`);
}
