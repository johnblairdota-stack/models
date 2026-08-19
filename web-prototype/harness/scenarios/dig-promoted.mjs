/**
 * THE ONE THING `instancing-1` SAID A SEGMENTING ROUND MUST RE-MEASURE: **THERE IS NO DEMOTION.**
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/dig-promoted.mjs \
 *        --port 5248 --q "seed=s4&dig=1"
 *   ... --q "seed=s4"        # the control arm: the same stations with no dig table at all
 *
 * HANDOFF, in as many words: *"A panel that has taken damage keeps its own stack for the rest of
 * the round... That is bounded by residency today and by the fact that a run can only damage a
 * handful of panels — but **dig makes deep digging routine and could put a dozen promoted
 * segments in one room.** Re-run `inst-census.mjs` after the first segmented build and decide
 * then."*
 *
 * `dig-feel.mjs` measures ONE dig and reports 4 promoted of 58, which is a comfortable number and
 * an unrepresentative one. This is the worst case, driven deliberately: park at every station,
 * read the calls with the whole house pristine, then drive **every segment on both service walls
 * to the barrier** — 18 faces, then all 36 — and read the same stations again. Nothing about a
 * real run has to cooperate; the question is what the renderer does when a room is full of
 * promoted panels, and the answer is a number rather than a hope.
 *
 * ⚠️ IT PARKS THE **PLAYER**, NOT THE CAMERA, AND SETTLES 40 FRAMES — `eo2-calls.mjs`'s reasons:
 * residency is driven from the player's viewpoint, and the HOLD hysteresis is 0.25 s so a short
 * settle measures the previous station's row.
 */

const STATIONS = (process.env.STATIONS ?? [
  'gallery.west', 'gallery.mid', 'gallery.east',
  'study_w.north', 'study_w.south', 'service.mid',
  'study_e.north', 'study_e.south',
  'ballroom.north', 'ballroom.centre', 'ballroom.south',
  'chapel.centre',
].join(',')).split(',').filter(Boolean);

export default async function digPromoted({ page, note, pass, fail, skip }) {
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
    return { ...e.room.digCensus(), panels: e.room.panels.length, mode: e.room.wallMode };
  });
  note(`?dig=${head.on ? 1 : 0} · ?walls=${head.mode} · ${head.panels} panels`
    + ` (${head.segments} segments, ${head.barriers} brick slabs)`);

  /**
   * Drive the service-side (or all) segment faces straight to the terminal stage.
   *
   * ⚠️ **`onBreak` IS SUPPRESSED WHILE IT RUNS, AND WITHOUT THAT THIS PROBE MEASURES DEBRIS.**
   * Driving 36 faces through four stages fires 144 `debris.burst` + `dust.burst` calls on ONE
   * frame. Both systems are parented to the SCENE, not to a space, so residency never hides
   * them and they add draw calls at every station in the house — measured: `chapel.centre`,
   * which cannot see a single segment, moved 384 -> 394. Attributing that to panels would be a
   * lie in the expensive direction. The FX cost of a real dig is a separate, real question
   * (`dig.md` §6 already warns that every particle here must be instanced from the start) and
   * this is not the instrument for it.
   */
  const promote = (which) => page.evaluate((which) => {
    const e = window.__rrr.engine;
    const seg = e.room.panels.filter((p) => p.spec?.dig
      && (which === 'all' || p.spec.side === 'a'));
    const saved = seg.map((p) => p.onBreak);
    for (const p of seg) p.onBreak = null;
    for (const p of seg) for (let i = 0; i < 8; i++) p.damage(1e5, { weapon: 'nailgun' });
    seg.forEach((p, i) => { p.onBreak = saved[i]; });
    const c = e.room.panelCensus();
    return { driven: seg.length, promoted: c.panels - c.pristine, spent: c.spent, panels: c.panels };
  }, which);

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
        const c = e.room.panelCensus();
        return {
          calls: e.renderer.info.render.calls, tris: e.renderer.info.render.triangles,
          ownMeshes: c.ownMeshes, visiblePanels: c.visiblePanels,
          instDraw: c.instanced ? c.instanced.drawing : 0,
          spaces: e.room.visibleSpaces(),
        };
      });
      rows.push({ name, ...r });
    }
    const worst = rows.reduce((a, b) => (b.calls > a.calls ? b : a));
    note(`${label}: worst ${worst.name} ${worst.calls} calls · `
      + rows.map((x) => `${x.name} ${x.calls}`).join(' · '));
    note(`${' '.repeat(label.length)}  panel own-meshes drawn at each: `
      + rows.map((x) => `${x.ownMeshes}`).join('/') + `  (instanced draws ${rows.map((x) => x.instDraw).join('/')})`);
    return { rows, worst };
  };

  const pristine = await sweep('PRISTINE ');
  if (!head.on) {
    skip('the promoted worst case is bounded', 'this build is `?dig=0` — the control arm has no segments');
    pass('a station sweep was taken', `${pristine.rows.length} stations, worst ${pristine.worst.name} `
      + `${pristine.worst.calls} calls — this is the CONTROL for the dig arm`);
    return;
  }

  const half = await promote('a');
  note(`drove ${half.driven} segment faces (the service side of both walls) to the barrier `
    + `-> ${half.promoted} of ${half.panels} panels promoted`);
  const halfSweep = await sweep('HALF DUG ');

  const all = await promote('all');
  note(`drove all ${all.driven} segment faces to the barrier -> ${all.promoted} of ${all.panels} promoted`);
  const allSweep = await sweep('ALL DUG  ');

  /**
   * ⚠️ THE ABLATION, AND IT IS THE ONLY REASON THE SAVING CAN BE ATTRIBUTED. `room.setDemote()`
   * flips the spent instances off inside this same page, at these same stations, with the same
   * 37 panels in the same state. The `OFF` arm below IS the build `instancing-1` handed over —
   * a promoted panel drawing its own five meshes for the rest of the round — so the two rows
   * are a before/after taken one after the other rather than on two days.
   */
  const wasOn = await page.evaluate(() => window.__rrr.engine.room.setDemote(false));
  const noDemote = await sweep('NO DEMOTE');
  await page.evaluate(() => window.__rrr.engine.room.setDemote(true));
  const backOn = await sweep('DEMOTE ON');

  const d1 = halfSweep.worst.calls - pristine.worst.calls;
  const d2 = allSweep.worst.calls - pristine.worst.calls;
  note(`WORST STATION, same build, four states: ${pristine.worst.calls} pristine -> `
    + `${halfSweep.worst.calls} (+${d1}) with ${half.promoted} promoted -> `
    + `${allSweep.worst.calls} (+${d2}) with ${all.promoted} promoted`);
  note(`DEMOTION A/B at ${noDemote.worst.name}, one page, same 37 spent panels: `
    + `demote OFF ${noDemote.worst.calls} -> ON ${backOn.worst.calls} `
    + `(${backOn.worst.calls - noDemote.worst.calls})`);
  (wasOn === false)
    ? pass('demotion has its own ablation and it is reachable', 'room.setDemote(false) took effect')
    : fail('demotion has its own ablation and it is reachable', `setDemote(false) returned ${wasOn}`);

  noDemote.worst.calls > backOn.worst.calls
    ? pass('demotion is what removes the promoted cost',
      `${noDemote.worst.calls} with the spent instances off against ${backOn.worst.calls} with them on, `
      + `same page, same stations, same 37 spent panels`)
    : fail('demotion is what removes the promoted cost',
      `off ${noDemote.worst.calls} vs on ${backOn.worst.calls} — no separable saving`);

  // The gate `eo2-calls.mjs` uses.
  backOn.worst.calls <= 625
    ? pass('the promoted worst case still fits the draw-call budget',
      `every segment in the house at the barrier: worst ${backOn.worst.name} `
      + `${backOn.worst.calls}/625 (+${backOn.worst.calls - pristine.worst.calls} over pristine), `
      + `${all.promoted} panels promoted`)
    : fail('the promoted worst case still fits the draw-call budget',
      `worst ${backOn.worst.name} ${backOn.worst.calls}/625 with ${all.promoted} promoted`);

  /**
   * 🕳️ **THE STATE THE HOUSE-WIDE UNLOCK CREATES, WHICH IS A WORSE WORST CASE THAN THE ABOVE.**
   *
   * Everything up to here drives 36 segments to `barrier`, where `wall.js` `spent` demotes them
   * because they can never open. The unlock puts all 36 on a table that ENDS AT `open` — so the
   * `!canOpen()` clause that made demotion possible is gone from every one of them at once, and
   * without `demoteOpen` this is where the 792 comes back with no switch. Measured rather than
   * argued, because "it should still be spent" is exactly the kind of claim that is wrong.
   */
  const unlocked = await page.evaluate(() => {
    const e = window.__rrr.engine;
    const seg = e.room.panels.filter((p) => p.spec?.dig);
    const saved = seg.map((p) => p.onBreak);
    for (const p of seg) p.onBreak = null;                 // see `promote`: this is not an FX probe
    e.room.unlockBarrier();
    for (const p of seg) p.state.setStage(p.state.defs.length - 1);
    seg.forEach((p, i) => { p.onBreak = saved[i]; });
    const c = e.room.panelCensus();
    const d = e.room.digCensus();
    return { promoted: c.panels - c.pristine, spent: c.spent, open: d.open, canOpen: d.linkCount };
  });
  const unSweep = await sweep('UNLOCKED ');
  note(`after the house-wide unlock: ${unlocked.open}/${all.driven} segments are holes, `
    + `${unlocked.canOpen} can open, ${unlocked.spent} still demoted`);
  (unlocked.spent >= all.driven && unSweep.worst.calls <= 625)
    ? pass('the unlocked house is not a worse worst case than the barrier',
      `all ${unlocked.open} segments open and ${unlocked.spent} of them still drawn from the shared `
      + `spent instances (\`demoteOpen\`): worst ${unSweep.worst.name} ${unSweep.worst.calls}/625, `
      + `against ${backOn.worst.calls} at the barrier and ${pristine.worst.calls} pristine`)
    : fail('the unlocked house is not a worse worst case than the barrier',
      `${unlocked.spent} spent of ${all.driven} open · worst ${unSweep.worst.name} ${unSweep.worst.calls}/625`);
}
