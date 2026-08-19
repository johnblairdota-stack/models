/**
 * 🧊 **IS AN EXIT DOOR'S FACE FROZEN BETWEEN STAGES? — `genexit-1`, 2026-08-15.**
 *
 *   BLOWS=24 node harness/playtest.mjs --view game.play \
 *     --script harness/scenarios/_genexit1-frozen.mjs --port 5535 \
 *     --q "plan=gen&planseed=3&seed=s0"
 *
 *   env  BLOWS=24     swings at the live exit
 *
 * ⚠️ `--q`, NEVER `--extra`. `seed=s0` is the `boarded` lock — start at stage 0 so several
 * crossings are reachable inside one run, which is what makes F3 a control and not a hope.
 *
 * ---------------------------------------------------------------------------------------------
 * 📋 WHAT IT MEASURED, 2026-08-15, sledgehammer at the shipped `digPower` 0.5
 * ---------------------------------------------------------------------------------------------
 *   uBreak per blow:  * = = = = = =  * = = = = = =  * = = = = = =  * = =
 *
 * **20 landed blows inside a stage moved the health 20 times and the PICTURE 0 times.** The four
 * `*` are blow 1 (the instancing promotion, excluded — see the note in the body) and the three
 * stage crossings, at blows 8, 15 and 22. So a player breaking the correct door sees the wall
 * change **once every seven blows** and nothing at all in between.
 *
 * 🎯 **AND THE PROGRESS TERM IS BUILT, CORRECT, AND NEVER CALLED — F5 IS THE PROOF.**
 * `WallPanel._apply()` computes `p = 1 - stageHealth / def.health` and hands it to
 * `applyStageBreaks`. Called BY HAND at 50% and then 98% of the same stage, the floats go
 * `[0.95,0.94,0.89,0.00404] -> [...,0.15] -> [...,0.294]`. Its only callers are the stage-change
 * listener, the constructor, `resetDamage()`, `recoat()` and the 0.55 s `_anim` window — **never
 * the damage path**. That is a one-line class of fix, and a different (much cheaper) finding than
 * "there is no progress term", which is why F5 exists.
 *
 * ⚠️ Both decoys: 6/6 blows landed, 6/6 refused, health and all four floats byte-identical.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT THIS ASKS THAT `_genexit1-tell.mjs` CANNOT
 * ---------------------------------------------------------------------------------------------
 * The ledger file measures the SCREEN, and a screen carries dust, debris and a camera. This asks
 * the wall's own shader what it is drawing: **`material.userData.breakUniforms.uBreak.value`, the
 * single float per layer that decides how much of that layer has broken away** (`breakmask.js`
 * — *"one float grows the hole"*). Four layers, four floats, and they are the entire picture of a
 * scalar panel's damage. Nothing here re-derives what should have happened: it reads the panel's
 * stage, the panel's health and the material's own uniform, before and after every real blow.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 THE CONTROLS. F2's claim is a claim that a number DOES NOT MOVE, which is the easiest kind
 * of claim to make by accident with a broken probe, so it ships with two ways to be wrong:
 * ---------------------------------------------------------------------------------------------
 *   F3  a STAGE CROSSING in the same run must move the same four floats. If it does not, the
 *       probe cannot read `uBreak` at all and F2 is void.
 *   F5  `panel._apply()` called by hand at mid-stage must ALSO move them — `_apply()` computes
 *       `p = 1 - stageHealth / def.health` and hands it to `applyStageBreaks`, so if the picture
 *       moves when it is called by hand and never moves when the player swings, the intra-stage
 *       progress term is BUILT, CORRECT AND NEVER DELIVERED. That is a different (and much
 *       cheaper) finding than "there is no progress term", and only this control separates them.
 */

const BLOWS = +(process.env.BLOWS ?? 24);
const STANDOFF = +(process.env.STANDOFF ?? 2.0);

export default async function genexit1frozen(ctx) {
  const { page, note, pass, fail, skip } = ctx;
  const frames = () => page.evaluate(() => window.__rrr?.frames?.() ?? 0);
  const step = async (n = 3) => {
    const f0 = await frames();
    for (let i = 0; i < 900; i++) {
      await page.waitForTimeout(35);
      const f = await frames();
      if (f - f0 >= n) return f - f0;
    }
    return -1;
  };

  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(400);

  const head = await page.evaluate(() => {
    const e = window.__rrr?.engine;
    if (!e?.run || !e.exits) return null;
    return { seed: String(e.run.seed), live: e.run.exitId, lock: e.run.lock.id,
      start: e.run.lock.startStage,
      sites: e.exits.map((x) => ({ id: x.site.id, live: e.run.isLiveExit(x.site.id) })) };
  });
  if (!head) { fail('the driver can reach the run state', 'engine.run missing'); return; }
  note(`seed "${head.seed}" · live ${head.live} · lock "${head.lock}" (starts at stage ${head.start})`);

  const grab = await page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player;
    const it = e.limbField?.items?.find((i) => i.type === 'sledge');
    if (!it) return { found: false };
    p.pos.copy(it.root.position); p.vel.set(0, 0, 0);
    p.interact(e.limbField, 1.5, null);
    return { found: true, equipped: p.sledge.equipped, power: +(p.digPower ?? 0).toFixed(3) };
  });
  if (!grab.equipped) { fail('the driver is carrying the shipped hammer', JSON.stringify(grab)); return; }
  pass('the driver is carrying the shipped hammer', `digPower ${grab.power}`);

  const quiet = () => page.evaluate(() => {
    const e = window.__rrr.engine, h = e.hunter;
    if (!h?.root) return false;
    let x = 0, z = 0;
    for (const s of e.room.spaces) { if (s.x1 > x) x = s.x1; if (s.z1 > z) z = s.z1; }
    h.root.position.set(x + 40, 0, z + 40); h.vel?.set?.(0, 0, 0);
    h.state = 'PATROL'; h.awareness = 0; h.root.visible = false;
    return true;
  });

  const park = (id, back) => page.evaluate(([pid, d]) => {
    const e = window.__rrr.engine, p = e.room.panels.find((q) => q.id === pid);
    if (!p) return { ok: false };
    const c = p.pointAt(0.5, 0.5), n = p.normal;
    let sign = 0;
    for (const s of [1, -1]) {
      if (e.room.spaceAt({ x: c.x + n.x * s * 1.2, y: 0, z: c.z + n.z * s * 1.2 }, 0)) { sign = s; break; }
    }
    if (!sign) sign = 1;
    e.player.pos.set(c.x + n.x * d * sign, e.room.floorY, c.z + n.z * d * sign);
    e.player.vel.set(0, 0, 0);
    const yaw = Math.atan2(-n.x * sign, -n.z * sign);
    e.player.facing = yaw; e.player.aimYaw = yaw;
    if (e.cam) { e.cam.yaw = yaw; e.cam.pitch = 0; e.cam._first = true; }
    e.room.setViewpoints?.([{ pos: e.player.pos, dir: { x: Math.sin(yaw), z: Math.cos(yaw) } }]);
    return { ok: true, space: e.room.spaceAt(e.player.pos)?.id ?? null };
  }, [id, back]);

  /** The panel's own truth AND the four floats its shader is actually drawing. */
  const read = (id) => page.evaluate((pid) => {
    const p = window.__rrr.engine.room.panels.find((q) => q.id === pid);
    return {
      stage: p.state.stage, hp: +p.state.stageHealth.toFixed(2),
      full: p.state.def?.health ?? null, anim: +(p._anim ?? 0).toFixed(3),
      // the shader's own number, per layer — `breakmask.js` setBreak/getBreak
      uBreak: p.mats.slice(0, 4).map((m) => +(m.userData?.breakUniforms?.uBreak?.value ?? -1).toFixed(6)),
    };
  }, id);

  const cooldown = async () => {
    const t0 = await page.evaluate(() => window.__rrr.engine.run.t);
    for (let i = 0; i < 80; i++) {
      await step(3);
      const t = await page.evaluate(() => window.__rrr.engine.run.t);
      if (t - t0 >= 1.05) return;
    }
  };
  const swing = async (id) => {
    await page.evaluate(() => { window.__gxf = { hit: window.__rrr.engine.player._lastSledgeHit }; });
    await cooldown();
    await page.mouse.down(); await page.waitForTimeout(40); await page.mouse.up();
    for (let i = 0; i < 60; i++) {
      await step(2);
      const c = await page.evaluate(() => {
        const h = window.__rrr.engine.player._lastSledgeHit;
        if (!h || h === window.__gxf.hit) return null;
        window.__gxf.hit = h;
        return { hadPanel: !!h.hadPanel, removed: +(h.res?.removed ?? 0).toFixed(4),
          blocked: !!h.res?.blocked };
      });
      if (c) return c;
    }
    return null;
  };

  const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

  for (const site of head.sites) {
    const label = site.live ? 'LIVE' : 'chained';
    const p = await park(site.id, STANDOFF);
    if (!p.ok) { note(`${site.id}: no panel`); continue; }
    await quiet(); await step(180);
    note(`--- ${label} ${site.id}: parked in ${p.space}`);

    const rows = [];
    let prev = await read(site.id);
    note(`  start: stage ${prev.stage} hp ${prev.hp}/${prev.full} uBreak ${JSON.stringify(prev.uBreak)}`);
    for (let k = 1; k <= (site.live ? BLOWS : 6); k++) {
      const c = await swing(site.id);
      // ⚠️ read AFTER the 0.55 s `_anim` would have run out, so a "changed" reading cannot be the
      // stage-change animation still in flight rather than the blow itself.
      await step(45);
      const now = await read(site.id);
      rows.push({ k, c, before: prev, after: now });
      prev = now;
      if (site.live && now.stage >= 4) { note(`  opened at blow ${k}`); break; }
    }

    const landed = rows.filter((r) => r.c && !r.c.blocked && r.c.removed > 0);
    const refused = rows.filter((r) => r.c && r.c.blocked);
    const missed = rows.filter((r) => !r.c);
    note(`  ${rows.length} swings · ${landed.length} took health · ${refused.length} refused · ${missed.length} never contacted`);
    note(`  per blow: ${rows.map((r) => `${r.after.stage}:${r.after.hp}`).join(' ')}`);
    note(`  uBreak per blow: ${rows.map((r) => (same(r.before.uBreak, r.after.uBreak) ? '=' : '*')).join(' ')}`
      + '   ( = unchanged, * moved )');

    const crossings = rows.filter((r) => r.after.stage !== r.before.stage);
    /**
     * ⚠️ **BLOW 1 IS THE PROMOTION AND IT MUST BE EXCLUDED, OR THIS CHECK GOES FALSE-GREEN.**
     * Measured: on the very first blow `uBreak` moves `[0,0,0,0] -> [0.042,0,0,0]` with NO stage
     * crossing, because `wallinstances.js` was drawing the panel out of the shared pristine
     * `InstancedMesh` and the first landed damage promotes it — `onPromote` runs `_apply()` once.
     * That is the instancing system waking up, not the wall reporting progress, and counting it
     * made the first cut of this file report *"the face changes as the health comes off — 1/21"*
     * as a PASS on the exact build where it does not.
     */
    const withinStage = rows.filter((r, i) => i > 0 && r.after.stage === r.before.stage
      && r.c && !r.c.blocked && r.c.removed > 0);
    const withinMovedHealth = withinStage.filter((r) => r.after.hp < r.before.hp);
    const withinMovedPicture = withinStage.filter((r) => !same(r.before.uBreak, r.after.uBreak));
    const promo = rows[0] && same(rows[0].before.uBreak, [0, 0, 0, 0]) && !same(rows[0].before.uBreak, rows[0].after.uBreak)
      && rows[0].after.stage === rows[0].before.stage;
    if (promo) note(`  blow 1 moved uBreak with no stage crossing — that is the INSTANCING PROMOTION `
      + `(${JSON.stringify(rows[0].before.uBreak)} -> ${JSON.stringify(rows[0].after.uBreak)}), excluded below`);

    if (!site.live) {
      const flat = rows.every((r) => same(r.before.uBreak, r.after.uBreak) && r.after.hp === r.before.hp);
      flat
        ? pass(`a chained decoy (${site.id}) is inert in both channels`,
          `${refused.length}/${rows.length} refused; health and all four uBreak floats byte-identical throughout`)
        : fail(`a chained decoy (${site.id}) is inert in both channels`, JSON.stringify(rows.map((r) => r.after)));
      continue;
    }

    // ---- F1 · the TRUTH moves on every landed blow
    (withinStage.length > 0 && withinMovedHealth.length === withinStage.length)
      ? pass('every landed blow takes health off the live exit',
        `${withinMovedHealth.length}/${withinStage.length} within-stage blows moved stageHealth`)
      : fail('every landed blow takes health off the live exit',
        `${withinMovedHealth.length}/${withinStage.length}`);

    // ---- F3 · THE CONTROL: a stage crossing must move the picture, or this probe is blind
    const crossMoved = crossings.filter((r) => !same(r.before.uBreak, r.after.uBreak));
    if (!crossings.length) {
      skip('a stage crossing moves the four uBreak floats',
        `no crossing in ${rows.length} blows — F2 below cannot be trusted, raise BLOWS`);
    } else if (crossMoved.length === crossings.length) {
      pass('a stage crossing moves the four uBreak floats',
        `${crossings.length} crossing(s), all moved: `
        + crossings.map((r) => `${JSON.stringify(r.before.uBreak)}->${JSON.stringify(r.after.uBreak)}`).join(' '));
    } else {
      fail('a stage crossing moves the four uBreak floats',
        `${crossMoved.length}/${crossings.length} — the probe cannot read the picture`);
    }

    // ---- F2 · and WITHIN a stage it does not
    //
    // The bar is "most of them", not "any of them": one stray frame that catches the 0.55 s
    // `_anim` tail of a crossing is not the wall reporting progress, and a check that a single
    // such frame can turn green is a check that cannot fail on the build it was written for.
    if (!crossings.length) skip('the face is frozen between stage crossings', 'no crossing = no control');
    else if (withinMovedPicture.length * 2 <= withinStage.length) {
      fail('the face changes as the health comes off',
        `${withinStage.length} landed blows inside a stage moved the health `
        + `${withinMovedHealth.length} times and the picture ${withinMovedPicture.length} — the `
        + `wall is byte-frozen between crossings, i.e. for ${Math.round(withinStage.length / Math.max(1, crossings.length))} `
        + 'blows at a time');
    } else {
      pass('the face changes as the health comes off',
        `${withinMovedPicture.length}/${withinStage.length} within-stage blows moved uBreak`);
    }

    /**
     * ---- F5 · **DOES THE DAMAGE PATH DELIVER WHAT `_apply()` WOULD?**
     *
     * ⚠️ **THIS CHECK WAS REWRITTEN WHEN THE FIX LANDED, AND THE OLD FORM COULD NOT HAVE GONE
     * GREEN.** It used to move the health by hand and require `_apply()` NOT to change the
     * picture — which is a test that the progress term does not exist. It was written as a
     * DIAGNOSTIC, to separate "there is no term" from "the term is never called", and it did its
     * job: `_apply()` by hand walked `uBreak[3]` 0.00404 -> 0.15 -> 0.294 while 20 real blows
     * moved it not at all. But it can only ever be red, before the fix and after, so keeping it
     * would have been a permanent false alarm.
     *
     * The question that survives the fix is the one that was always underneath: **after a real
     * blow, is the picture already what the panel's own state says it should be?** So: call
     * `_apply()` with NOTHING changed. If it moves anything, the damage path left the face stale.
     * Pre-fix that is red by construction (the face was frozen at the promotion's 0.042 while the
     * health had walked on); post-fix it must be a no-op.
     *
     * 🚨 **AND ITS CONTROL IS IN THE SAME CALL** — perturbing the health and calling `_apply()`
     * again MUST move the floats, or "calling it changed nothing" is a statement about a probe
     * that cannot see anything rather than about the wall.
     */
    const byHand = await page.evaluate((pid) => {
      const p = window.__rrr.engine.room.panels.find((q) => q.id === pid);
      const wasStage = p.state.stage, wasHp = p.state.stageHealth, wasAnim = p._anim;
      const g = () => p.mats.slice(0, 4).map((m) => +(m.userData?.breakUniforms?.uBreak?.value ?? -1).toFixed(6));
      const afterBlow = g();          // what the last real blow left on screen
      p._apply();                     // ask the panel to repaint itself from its own state
      const repaint = g();            // must be identical: the blow already did this
      // the control: move the health and repaint — this MUST differ, or the probe is blind
      p.state.stageHealth = p.state.def.health * 0.5;
      p._apply();
      const perturbed = g();
      p.state.stage = wasStage; p.state.stageHealth = wasHp; p._anim = wasAnim;
      p._apply();
      return { afterBlow, repaint, perturbed, restored: g() };
    }, site.id);
    note(`  after the last blow ${JSON.stringify(byHand.afterBlow)} · repainted from its own state `
      + `${JSON.stringify(byHand.repaint)} · health forced to 50% ${JSON.stringify(byHand.perturbed)}`);
    if (same(byHand.repaint, byHand.perturbed)) {
      fail('the damage path leaves the face already painted',
        'forcing the health to 50% and repainting changed NOTHING — this probe cannot see the '
        + 'picture, so the line below would prove nothing');
    } else if (!same(byHand.afterBlow, byHand.repaint)) {
      fail('the damage path leaves the face already painted',
        `repainting from the panel's own state moved it ${JSON.stringify(byHand.afterBlow)} -> `
        + `${JSON.stringify(byHand.repaint)} — the last real blow left the face stale`);
    } else {
      pass('the damage path leaves the face already painted',
        'repainting from the panel\'s own state is a no-op after a real blow, and forcing the '
        + `health to 50% still moves it (${JSON.stringify(byHand.perturbed)}) — so the blow, not `
        + 'this probe, is what put the progress on screen');
    }
  }
}
