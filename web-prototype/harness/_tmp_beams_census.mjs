/**
 * ITEM 1 VERIFICATION — exterior.census() on a `beams` seed, at t=0 and after first damage.
 * Throwaway — delete after the round.
 */
export default async function beamsCensus({ page, note, pass, fail }) {
  const head = await page.evaluate(() => {
    const e = window.__rrr.engine;
    return { seed: String(e.run.seed), live: e.run.exitId, lock: e.run.lock.id,
      startStage: e.run.lock.startStage };
  });
  note(`seed "${head.seed}" -> live ${head.live}, lock "${head.lock}" (startStage ${head.startStage})`);
  if (head.lock !== 'beams') { fail('this seed is a beams-lock seed', `lock is "${head.lock}"`); return; }

  const c0 = await page.evaluate(() => window.__rrr.engine.exterior.census());
  const row0 = c0.yards.find((y) => y.live);
  note(`t=0 census for ${row0?.id}: ${JSON.stringify(row0)}`);
  (row0 && row0.exposed === false && row0.yardVisible === false && row0.tellVisible === false)
    ? pass('exposed/yardVisible/tellVisible are all false at t=0 on an untouched beams panel', JSON.stringify(row0))
    : fail('exposed/yardVisible/tellVisible are all false at t=0 on an untouched beams panel', JSON.stringify(row0));

  // Deal ONE round of damage — not enough to cross a stage — and re-check.
  await page.evaluate(() => {
    const e = window.__rrr.engine;
    const x = e.exits.find((q) => e.run.isLiveExit(q.site.id));
    const before = x.panel.state.stageHealth;
    x.panel.state.applyDamage(5);
    return { before, after: x.panel.state.stageHealth };
  });
  // let a few frames run so `update()` recomputes exposed/lit
  const f0 = await page.evaluate(() => window.__rrr.frames());
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(30);
    const f = await page.evaluate(() => window.__rrr.frames());
    if (f - f0 >= 3) break;
  }

  const c1 = await page.evaluate(() => {
    const e = window.__rrr.engine;
    const x = e.exits.find((q) => e.run.isLiveExit(q.site.id));
    return { stage: x.panel.state.stage, stageHealth: x.panel.state.stageHealth,
      census: window.__rrr.engine.exterior.census() };
  });
  const row1 = c1.census.yards.find((y) => y.live);
  note(`after 1 round of damage (stage still ${c1.stage}, hp ${c1.stageHealth}): ${JSON.stringify(row1)}`);
  row1 && row1.exposed === true
    ? pass('exposed flips true after the panel takes its first damage this run', JSON.stringify(row1))
    : fail('exposed flips true after the panel takes its first damage this run', JSON.stringify(row1));
}
