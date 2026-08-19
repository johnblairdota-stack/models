/**
 * 🔨 **THE EIGHT BLOWS JOHN DESCRIBED — `genexit-1`, 2026-08-15. The picture deliverable for B.**
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_genexit1-chew.mjs \
 *        --port 5523 --shots --q "plan=gen&planseed=3&seed=s0"
 *
 * ⚠️ `--q`, NEVER `--extra`. `seed=s0` is the `boarded` lock: the live exit starts at stage 0,
 * looks exactly like its decoys, and takes 8 landed sledge blows to cross its first stage. That
 * is the run John was in and the eight blows he gave up inside.
 *
 * ---------------------------------------------------------------------------------------------
 * 🎯 **IT IS AN IN-PLACE A/B ACROSS THE ARM, IN ONE PAGE, AT ONE STATION — WHICH IS THE ONLY
 * FORM THIS PROJECT ACCEPTS.**
 * ---------------------------------------------------------------------------------------------
 *     setChew(false) -> 8 blows -> frames      the wall as it shipped this morning
 *     resetRound()                             the plan is restored (`escape.mjs` E11 gates that)
 *     setChew(true)  -> 8 blows -> frames      the wall with B
 *
 * `?chew=0` is the same arm from the URL. Two page loads would not be comparable — `still.mjs`
 * cannot pin how much sim time had elapsed on arrival, and the same build gave 0 of 15 identical
 * parked frames across two processes.
 *
 * ⚠️ **THE NUMBER IS `uBreak`, NOT PIXELS, AND THAT IS A CORRECTION OF MY OWN INSTRUMENT.**
 * `_genexit1-tell.mjs`'s whole-frame pixel column had a clean 0/0/0/0 same-config floor and was
 * still junk: `hold()` empties `engine._updaters`, which freezes the room's breathing lights at
 * whatever phase they are in, so two held frames of an unchanged wall differed across the WHOLE
 * SCREEN — a decoy taking zero damage read 2 802 px>2 after one blow and 787 460 after three.
 * `escape.md` already said so: *"whole-frame diffs are useless here; measure the strip, not the
 * frame."* The four floats in `material.userData.breakUniforms.uBreak` ARE a scalar panel's
 * damage and no light can move them. **The frames here are for John's eye; the assertion is on
 * the floats.**
 */

const BLOWS = +(process.env.BLOWS ?? 8);
const STANDOFF = +(process.env.STANDOFF ?? 2.0);

export default async function genexit1chew(ctx) {
  const { page, note, pass, fail, skip, shot } = ctx;
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

  const armable = await page.evaluate(async () => {
    try {
      const m = await import('/src/game/wall.js');
      if (typeof m.setChew !== 'function') return { ok: false, why: 'wall.js does not export setChew' };
      window.__gxw = m;
      return { ok: true, arm: m.chewArm() };
    } catch (err) { return { ok: false, why: String(err) }; }
  });
  if (!armable.ok) { fail('the build carries the chew arm', armable.why); return; }
  note(`wall.js chew arm at boot: ${armable.arm}`);

  const head = await page.evaluate(() => {
    const e = window.__rrr.engine;
    return { live: e.run.exitId, lock: e.run.lock.id, start: e.run.lock.startStage };
  });
  note(`live ${head.live} · lock "${head.lock}" (starts at stage ${head.start})`);

  /**
   * ⚠️ **CALL THIS AFTER EVERY `resetRound()`, NOT ONCE.** `resetRound()` strips the body back to
   * its loadout and re-spawns the world prop, so the hammer is no longer in the robot's hands —
   * and a hammer-less arm produces **0 of 8 landed blows**, which is exactly what the first cut of
   * this file reported for arm B while arm A had worked perfectly. It reads like the fix doing
   * nothing and it is the driver having disarmed itself.
   */
  const grab = () => page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player;
    if (p.sledge.equipped) return { found: true, equipped: true, power: +(p.digPower ?? 0).toFixed(3) };
    const it = e.limbField?.items?.find((i) => i.type === 'sledge');
    if (!it) {
      // owned but stowed is recoverable without the prop; genuinely lost is not
      if (p.sledge.owned) { p._toggleSledge(); return { found: true, equipped: p.sledge.equipped, redrawn: true }; }
      return { found: false };
    }
    p.pos.copy(it.root.position); p.vel.set(0, 0, 0);
    p.interact(e.limbField, 1.5, null);
    return { found: true, equipped: p.sledge.equipped, power: +(p.digPower ?? 0).toFixed(3) };
  });
  const got = await grab();
  if (!got.equipped) { fail('the driver is carrying the shipped hammer', JSON.stringify(got)); return; }

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
  const read = (id) => page.evaluate((pid) => {
    const p = window.__rrr.engine.room.panels.find((q) => q.id === pid);
    return { stage: p.state.stage, hp: +p.state.stageHealth.toFixed(1),
      uBreak: p.mats.slice(0, 4).map((m) => +(m.userData?.breakUniforms?.uBreak?.value ?? -1).toFixed(6)) };
  }, id);
  const cooldown = async () => {
    const t0 = await page.evaluate(() => window.__rrr.engine.run.t);
    for (let i = 0; i < 80; i++) {
      await step(3);
      const t = await page.evaluate(() => window.__rrr.engine.run.t);
      if (t - t0 >= 1.05) return;
    }
  };
  const swing = async () => {
    await page.evaluate(() => { window.__gxc = { hit: window.__rrr.engine.player._lastSledgeHit }; });
    await cooldown();
    await page.mouse.down(); await page.waitForTimeout(40); await page.mouse.up();
    for (let i = 0; i < 60; i++) {
      await step(2);
      const c = await page.evaluate(() => {
        const h = window.__rrr.engine.player._lastSledgeHit;
        if (!h || h === window.__gxc.hit) return null;
        window.__gxc.hit = h;
        return { hadPanel: !!h.hadPanel, removed: +(h.res?.removed ?? 0).toFixed(4) };
      });
      if (c) return c;
    }
    return null;
  };

  /** One arm: 8 blows, a held frame after each, and the floats after each. */
  const runArm = async (on, tag) => {
    await page.evaluate((v) => window.__gxw.setChew(v), on);
    const armed = await grab();
    if (!armed.equipped) { note(`ARM ${tag}: the hammer is not in hand (${JSON.stringify(armed)})`); return null; }
    await park(head.live, STANDOFF);
    await quiet(); await step(200);
    const rows = [];
    rows.push({ k: 0, ...(await read(head.live)) });
    await park(head.live, STANDOFF); await quiet(); await step(6);
    await shot(`genexit1-chew-${tag}-blow0`);
    for (let k = 1; k <= BLOWS; k++) {
      const c = await swing();
      await step(40);
      const st = await read(head.live);
      rows.push({ k, c, ...st });
      // re-park so every frame in the strip is the SAME camera — the swing's kick moves the boom
      // and without this the strip is a picture of the camera, not of the wall.
      await park(head.live, STANDOFF); await quiet(); await step(8);
      await shot(`genexit1-chew-${tag}-blow${k}`);
    }
    return rows;
  };

  // ---- arm A: the wall as it shipped this morning
  const A = await runArm(false, 'A-chew0-FROZEN');
  if (!A) { fail('the two arms both ran', 'arm A never armed the hammer'); return; }
  note(`ARM A (chew OFF, as shipped): ${A.map((r) => `${r.stage}:${r.hp}`).join(' ')}`);
  note(`ARM A uBreak[stage]: ${A.map((r) => r.uBreak[Math.min(3, r.stage)]).join(' ')}`);

  // ---- restore the plan and run the same eight blows with B
  const reset = await page.evaluate(() => {
    const e = window.__rrr.engine;
    e.resetRound();
    const p = e.room.panels.find((q) => q.id === e.run.exitId);
    return { stage: p.state.stage, hp: +p.state.stageHealth.toFixed(1), exitId: e.run.exitId };
  });
  await step(40);
  note(`resetRound: ${reset.exitId} back at stage ${reset.stage} hp ${reset.hp}`);
  if (reset.stage !== head.start) {
    skip('the two arms start from the same wall', `reset left stage ${reset.stage}, wanted ${head.start}`);
    return;
  }
  const B = await runArm(true, 'B-chew1-FIXED');
  if (!B) { fail('the two arms both ran', 'arm B never armed the hammer after resetRound'); return; }
  note(`ARM B (chew ON, the fix):    ${B.map((r) => `${r.stage}:${r.hp}`).join(' ')}`);
  note(`ARM B uBreak[stage]: ${B.map((r) => r.uBreak[Math.min(3, r.stage)]).join(' ')}`);

  // =========================================================================
  // THE ASSERTIONS — on the floats, not on the pixels
  // =========================================================================
  const landedA = A.slice(1).filter((r) => r.c && r.c.removed > 0).length;
  const landedB = B.slice(1).filter((r) => r.c && r.c.removed > 0).length;
  note(`blows that landed: arm A ${landedA}/${BLOWS} · arm B ${landedB}/${BLOWS}`);

  // the two arms must take the SAME health off — B is a picture change, not a pacing change,
  // and this is the line that proves John's boundary was respected.
  const hpA = A[A.length - 1].hp, hpB = B[B.length - 1].hp;
  const stA = A[A.length - 1].stage, stB = B[B.length - 1].stage;
  (landedA === landedB && hpA === hpB && stA === stB)
    ? pass('B changes the picture and not the pacing',
      `both arms: ${landedA} landed blows, stage ${stA}, ${hpA} hp left — identical`)
    : fail('B changes the picture and not the pacing',
      `A: ${landedA} landed, stage ${stA}, ${hpA} hp · B: ${landedB} landed, stage ${stB}, ${hpB} hp`);

  // within the first stage, arm A must be flat and arm B must climb
  const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  const movesIn = (rows) => rows.slice(2).filter((r, i) => r.stage === rows[i + 1].stage
    && !same(rows[i + 1].uBreak, r.uBreak)).length;
  const mA = movesIn(A), mB = movesIn(B);
  const within = A.slice(2).filter((r, i) => r.stage === A[i + 1].stage).length;
  note(`within-stage blows that moved the picture: arm A ${mA}/${within} · arm B ${mB}/${within}`);
  if (!within) skip('the fix is what moved the picture', 'no within-stage blows to compare');
  else if (mA > 0) {
    fail('the fix is what moved the picture',
      `arm A (chew OFF) already moved the picture ${mA} times — the ablation is not ablating`);
  } else if (mB * 2 <= within) {
    fail('the fix is what moved the picture',
      `arm B moved it only ${mB}/${within} times`);
  } else {
    pass('the fix is what moved the picture',
      `chew OFF: ${mA}/${within} within-stage blows changed the face. chew ON: ${mB}/${within}. `
      + `Same health, same stage, same blow count.`);
  }
  note('frames: progress/playtest/game.play.genexit1-chew-{A-chew0-FROZEN,B-chew1-FIXED}-blow0..' + BLOWS + '.png');
}
