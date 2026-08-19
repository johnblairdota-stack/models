/** play-critic-4 #4: a choice and a catastrophe must not produce identical feedback. */
export default async function ejectVsWound({ page, note, pass, fail, shot }) {
  const hud = () => page.evaluate(() => {
    const e = window.__rrr.engine;
    const m = e.gameHud?._msgState?.() ?? null;
    return { msg: m?.text ?? null, rank: m?.rank ?? null, shock: +(e.player.shock ?? 0).toFixed(2) };
  });

  const reset = () => page.evaluate(async () => {
    const e = window.__rrr.engine, p = e.player;
    for (const s of ['shoulderL', 'shoulderR', 'hipL', 'hipR']) {
      if (p.rig.occupant(s) === 'empty') p.rig.refit?.(s);
    }
    p.shock = 0;
    await new Promise((r) => setTimeout(r, 400));
  });

  // 1. VOLUNTARY — the player takes their own arm off
  await reset();
  await page.waitForTimeout(600);
  await page.evaluate(() => { window.__rrr.engine.player.rig.detach('shoulderR', { voluntary: true }); });
  await page.waitForTimeout(260);
  const vol = await hud();
  note(`voluntary eject -> msg="${vol.msg}" rank=${vol.rank} shock=${vol.shock}`);
  await shot('evw0-voluntary');

  // 2. INVOLUNTARY — something takes it
  await reset();
  await page.waitForTimeout(900);
  await page.evaluate(() => { window.__rrr.engine.player.rig.detach('shoulderL'); });
  await page.waitForTimeout(260);
  const inv = await hud();
  note(`torn off       -> msg="${inv.msg}" rank=${inv.rank} shock=${inv.shock}`);
  await shot('evw1-involuntary');

  (vol.msg && inv.msg && vol.msg !== inv.msg)
    ? pass('the two read differently in the callout', `"${vol.msg}" vs "${inv.msg}"`)
    : fail('the two read differently in the callout', `both "${vol.msg}"`);

  (vol.rank !== inv.rank)
    ? pass('they take different priority', `${vol.rank} vs ${inv.rank}`)
    : fail('they take different priority', `both rank ${vol.rank}`);

  (vol.shock < inv.shock)
    ? pass('only being maimed shocks the camera', `${vol.shock} vs ${inv.shock}`)
    : fail('only being maimed shocks the camera', `voluntary ${vol.shock}, torn ${inv.shock}`);
}
