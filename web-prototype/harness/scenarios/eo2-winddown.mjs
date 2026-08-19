/**
 * EO2 — YOU CAN BE KILLED BEHIND A SCREEN THAT SAYS YOU WON.
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/eo2-winddown.mjs \
 *        --port 5207 --shots --q "seed=s0"
 *
 * `play-critic-7`, with a second player registered: escaping enters WINDDOWN and the
 * "OUT OF THE HOUSE / AGAIN" modal went up anyway, killed pointer lock and hid the HUD. The
 * critic then walked 17 m into the yard with the bomb at 85.9 s and **had its right arm torn
 * off at 2.6 m, entirely behind a victory modal.** The hunter following you out is John's
 * decision (`escape.md` §5, §8), so being outside is not being safe.
 *
 * And `RunState.escape()` emitted `_onEscape` BEFORE `_setPhase(WINDDOWN)`, so
 * `buildEscapeWatch`'s stranded line — *"N still inside. You started the clock."* — was gated
 * on a phase that had not been set yet and **could never print**.
 *
 * Six assertions, and three of them are the negative form on purpose: a screen that is absent
 * is exactly as hard to photograph as one that is present, and "no modal" is the fix.
 */
export default async function winddown({ page, note, pass, fail, skip, shot }) {
  const frames = () => page.evaluate(() => window.__rrr?.frames?.() ?? 0);
  const step = async (n = 3) => {
    const f0 = await frames();
    for (let i = 0; i < 120; i++) {
      await page.waitForTimeout(45);
      const f = await frames();
      if (f - f0 >= n) return f - f0;
    }
    return -1;
  };
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(400);
  const lock0 = await page.evaluate(() => document.pointerLockElement != null);
  note(`pointer lock before the escape: ${lock0 ? 'GRANTED' : 'DENIED — the lock assertions below will SKIP'}`);

  // ---- a second player, so the first escape lands in WINDDOWN rather than RESULTS ---------
  const set = await page.evaluate(() => {
    const e = window.__rrr.engine, run = e.run;
    run.addPlayer('p2');
    run.addPlayer('p3');
    const x = e.exits.find((q) => run.isLiveExit(q.site.id));
    // open the live exit outright: this scenario is about what the UI does at the moment of
    // the escape, and `eo2-siege.mjs` owns how long getting there costs.
    x.panel.state.setStage(4);
    const n = x.panel.normal, p = x.panel.root.position;
    return { site: x.site.id, name: x.site.name, phase: run.phase, inside: run.stillInside(),
      out: [p.x + n.x * x.outSign * 3.4, p.z + n.z * x.outSign * 3.4] };
  });
  note(`live site ${set.site} (${set.name}) forced open · ${set.inside} players inside · phase ${set.phase}`);

  // ---- walk out. `outThrough` is driven by the real update loop, not called directly. -----
  await page.evaluate(([x, z]) => {
    const e = window.__rrr.engine;
    e.player.pos.set(x, e.room.floorY, z);
    e.player.vel.set(0, 0, 0);
    e.cam._first = true;              // the boom LERPs through geometry — HANDOFF
  }, set.out);
  await step(8);

  const after = await page.evaluate(() => {
    const e = window.__rrr.engine, run = e.run;
    const hud = document.querySelector('.rrr-hud');
    return {
      phase: run.phase, escaped: run.results().escaped.length, inside: run.stillInside(),
      bombLeft: run.bombLeft == null ? null : +run.bombLeft.toFixed(1),
      modal: !!document.getElementById('rrr-escape'),
      locked: document.pointerLockElement != null,
      hudOpacity: hud ? getComputedStyle(hud).opacity : null,
      msg: e.gameHud?._msgState?.() ?? null,
    };
  });
  note(`after stepping out: phase ${after.phase} · escaped ${after.escaped} · ${after.inside} still inside`
    + ` · bomb ${after.bombLeft} · modal ${after.modal} · pointer lock ${after.locked}`
    + ` · HUD opacity ${after.hudOpacity}`);
  note(`HUD slot: ${JSON.stringify(after.msg)}`);

  if (after.escaped < 1) { fail('stepping out of the hole is an escape', JSON.stringify(after)); return; }
  after.phase === 'WINDDOWN'
    ? pass('a first escape with players inside opens WINDDOWN', `bomb ${after.bombLeft} s`)
    : fail('a first escape with players inside opens WINDDOWN', `phase ${after.phase}`);

  after.modal
    ? fail('no victory modal while the run is still running',
      'the "OUT OF THE HOUSE" screen is up during WINDDOWN — the bomb is ticking and the hunter can follow you out')
    : pass('no victory modal while the run is still running', 'nothing claims the win while the bomb runs');

  if (!lock0) skip('pointer lock survives the escape', 'the lock was never granted in this rig');
  else if (after.locked) pass('pointer lock survives the escape', 'you can still look while the run continues');
  else fail('pointer lock survives the escape', 'exitPointerLock() ran — mouse-look is dead in the yard');

  (+after.hudOpacity > 0.5)
    ? pass('the HUD survives the escape', `opacity ${after.hudOpacity}`)
    : fail('the HUD survives the escape', `opacity ${after.hudOpacity} — setHidden(true) ran`);

  // ---- THE LINE. `escape.md` §5's best line, which could not print before this round. -----
  const printed = await page.evaluate(() => {
    const m = window.__rrr.engine.gameHud?._msgState?.();
    const all = [m?.text, ...(m?.queue ?? []).map((q) => q.text)].filter(Boolean);
    return all;
  });
  note(`HUD lines live at this instant: ${JSON.stringify(printed)}`);
  const strandedLine = printed.find((t) => /STILL INSIDE/i.test(t) && /STARTED THE CLOCK/i.test(t));
  strandedLine
    ? pass('the stranded line prints', `"${strandedLine}"`)
    : fail('the stranded line prints', `no "N STILL INSIDE — YOU STARTED THE CLOCK" in ${JSON.stringify(printed)}`);

  await step(6);
  await shot('eo2-out-but-not-safe');

  // ---- and the modal DOES arrive once the run is actually over ---------------------------
  const ended = await page.evaluate(() => {
    const e = window.__rrr.engine;
    e.run.finish({ reason: 'scenario' });          // the host-abort path; same _setPhase
    const w = document.getElementById('rrr-escape');
    return { phase: e.run.phase, modal: !!w,
      text: w?.innerText?.replace(/\s+/g, ' ').slice(0, 320) ?? null,
      locked: document.pointerLockElement != null };
  });
  note(`after the run ends: phase ${ended.phase} · modal ${ended.modal} · lock ${ended.locked}`);
  if (ended.text) note(`win screen: "${ended.text}"`);
  ended.modal
    ? pass('the victory modal arrives when the run is over', ended.text?.slice(0, 90) ?? '')
    : fail('the victory modal arrives when the run is over', 'no #rrr-escape overlay at RESULTS');
  /(still inside)/i.test(ended.text ?? '') && /(started the clock)/i.test(ended.text ?? '')
    ? pass('the modal carries the stranded line too',
      'the count is captured at the escape, not read after the run emptied the house')
    : fail('the modal carries the stranded line too', `not in "${ended.text}"`);

  await step(4);
  await shot('eo2-results-modal');
}
