/**
 * THE `_apply()` / `setInstanced()` RACE — a bug that was in the SHIPPED build, priced.
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/wall-applyrace.mjs \
 *        --port 5251 --q "seed=s4"
 *
 * ⚠️ THIS IS NOT A DIG PROBE. It runs on the default `?dig=0` build and it exists because
 * `harness/scenarios/dig-promoted.mjs` measured a saving that could not be explained, and the
 * explanation turned out to be a defect in the arm the toggle is supposed to leave alone.
 *
 * THE MECHANISM. `DestructibleWall.setInstanced(true)` hides the panel's five meshes and then
 * early-outs on every later call, because `this.instanced` is already true. `_apply()` assigned
 * `layers[i].visible` UNCONDITIONALLY. So any `_apply()` after the panel went instanced turned
 * four layer planes back on, and **`PanelInstances.sync()` could not undo it**: the sync early-
 * outs on an unchanged (visible, pristine) signature, and even when it runs, `setInstanced(true)`
 * is a no-op on a panel that already believes it is instanced. The planes stayed on for the rest
 * of the round.
 *
 * ⚠️ AND `views/game.js` `applyExitPlan()` CALLS `_apply()` ON ALL FOURTEEN EXIT SITES AT BOOT,
 * which is why this was live rather than theoretical: the thirteen CHAINED sites are `pristine`
 * by the state machine's own definition (stage 0 at full `CHAINED_DEFS` health), so they are
 * instanced — and then immediately told to show their own layers again.
 *
 * WHAT THIS ASSERTS: that the failure is reproducible on demand, that `sync()` genuinely cannot
 * clear it, and what it costs in draw calls at the worst parked station. The fix is one line in
 * `wall.js` `_apply()`; this is the instrument that says the line was worth writing.
 */

const STATION = process.env.STATION ?? 'service.mid';

export default async function applyRace({ page, note, pass, fail }) {
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

  await page.evaluate((n) => {
    const e = window.__rrr.engine;
    const a = e.room.anchor(n);
    e.player.pos.set(a.x, e.room.floorY, a.z);
    e.player.vel.set(0, 0, 0);
    e.cam._first = true;
  }, STATION);
  await step(40);

  const read = () => page.evaluate(() => {
    const e = window.__rrr.engine;
    const c = e.room.panelCensus();
    return { calls: e.renderer.info.render.calls, ownMeshes: c.ownMeshes,
      instancedPanels: e.room.panels.filter((p) => p.instanced).length,
      pristine: c.pristine, panels: c.panels };
  });

  const clean = await read();
  note(`${STATION}, ${clean.panels} panels (${clean.pristine} pristine, `
    + `${clean.instancedPanels} drawn by the shared instance): ${clean.calls} calls, `
    + `${clean.ownMeshes} panel own-meshes on screen`);

  /**
   * Reproduce the pre-fix behaviour EXACTLY: the old `_apply()` ran the occlusion rule and
   * assigned `layers[i].visible` with no regard for `instanced`. That is these three lines,
   * applied to every panel the shared instance is currently drawing.
   */
  const broke = await page.evaluate(async () => {
    const e = window.__rrr.engine;
    const bm = await import('/src/materials/breakmask.js');
    let touched = 0;
    for (const p of e.room.panels) {
      if (!p.instanced) continue;
      let cut = 4;
      for (let i = 0; i < 4; i++) { if (bm.getBreak(p.mats[i]) <= 0) { cut = i; break; } }
      for (let i = 0; i < 4; i++) p.layers[i].visible = i <= cut;
      touched++;
    }
    return touched;
  });
  await step(6);
  const dirty = await read();
  note(`reproduced the old \`_apply()\` on ${broke} instanced panels: ${dirty.calls} calls `
    + `(+${dirty.calls - clean.calls}), ${dirty.ownMeshes} own-meshes (+${dirty.ownMeshes - clean.ownMeshes})`);

  // ⚠️ THE HALF THAT MAKES IT A BUG RATHER THAN A HICCUP: the system that owns this cannot see it.
  await page.evaluate(() => window.__rrr.engine.room.panelInstances?.sync(true));
  await step(6);
  const afterSync = await read();
  note(`after a FORCED \`instances.sync(true)\`: ${afterSync.calls} calls, `
    + `${afterSync.ownMeshes} own-meshes — sync cannot clear it, because `
    + `\`setInstanced(true)\` early-outs on a panel that already believes it is instanced`);

  // And the real repair, so the probe leaves the page in the state it found it.
  await page.evaluate(() => {
    for (const p of window.__rrr.engine.room.panels) {
      if (!p.instanced) continue;
      p.setInstanced(false); p.setInstanced(true);
    }
  });
  await step(6);
  const repaired = await read();
  note(`after a real re-instance: ${repaired.calls} calls, ${repaired.ownMeshes} own-meshes`);

  const cost = dirty.calls - clean.calls;
  cost > 0
    ? pass('the `_apply` race costs real draw calls on the DEFAULT build',
      `${broke} instanced panels showing their own layers again is +${cost} calls at ${STATION} `
      + `(${clean.calls} -> ${dirty.calls}) and +${dirty.ownMeshes - clean.ownMeshes} meshes`)
    : fail('the `_apply` race costs real draw calls on the DEFAULT build',
      `no measurable difference at ${STATION}`);

  afterSync.ownMeshes === dirty.ownMeshes
    ? pass('`PanelInstances.sync()` cannot repair it, which is why the fix belongs in `_apply`',
      `a forced sync left all ${dirty.ownMeshes} stray meshes on screen`)
    : fail('`PanelInstances.sync()` cannot repair it, which is why the fix belongs in `_apply`',
      `sync moved own-meshes ${dirty.ownMeshes} -> ${afterSync.ownMeshes}`);

  repaired.ownMeshes === clean.ownMeshes
    ? pass('the shipped build is in the repaired state, not the dirty one',
      `${clean.ownMeshes} own-meshes at boot and ${repaired.ownMeshes} after an explicit repair — `
      + `identical, so the fix in \`_apply\` is doing the work`)
    : fail('the shipped build is in the repaired state, not the dirty one',
      `boot ${clean.ownMeshes} vs repaired ${repaired.ownMeshes}`);
}
