/**
 * PC7 — PLAY THE WIN CONDITION. Real WASD, real mouse-look, real trigger, real clock.
 *
 *   MODE=escape SEED=s0 node harness/playtest.mjs --view game.play \
 *        --script harness/scenarios/pc7-play.mjs --port 5197 --shots --q "seed=s0"
 *
 * `harness/scenarios/escape.mjs` proves the win condition EXISTS: it calls `weapons.fire()`
 * directly and teleports the body to the far side of the hole. That is the right instrument for
 * "is the rule correct". It is the wrong instrument for "can a person do this", because no key
 * is ever pressed and no distance is ever walked.
 *
 * This one presses the keys. Pointer lock IS granted in this rig (measured: 198 px of
 * `page.mouse.move` moved `cam.yaw` by exactly 0.5148 rad against a sensitivity of 0.0026), so
 * looking is the real desktop path and not a `cam.yaw` assignment.
 *
 * MODES
 *   escape   navigate to the live exit, chew it open with the trigger, walk out. Timed on the
 *            game's OWN clock (`run.t`), which is what the score reads.
 *   tour     walk to all four sites in turn and photograph each from a walking-pace station and
 *            from arm's length. The concealment evidence. Ground truth is printed LAST.
 */

const MODE = process.env.MODE ?? 'escape';
const TOUR_ORDER = (process.env.TOUR ?? '').split(',').filter(Boolean);

export default async function pc7({ page, note, pass, fail, skip, shot, waitFor }) {
  // ---- frame-accurate stepping (HANDOFF flee-survival trap #1: wall time is not game time)
  const frames = () => page.evaluate(() => window.__rrr?.frames?.() ?? 0);
  const step = async (n = 3) => {
    const f0 = await frames();
    for (let i = 0; i < 80; i++) {
      await page.waitForTimeout(50);
      const f = await frames();
      if (f - f0 >= n) return f - f0;
    }
    return -1;
  };

  const ok = await page.evaluate(() => !!(window.__rrr?.engine?.run && window.__rrr.engine.exits));
  if (!ok) { fail('the run is reachable', 'engine.run / engine.exits missing'); return; }

  // ---- pointer lock, and say so either way ------------------------------------------------
  await page.mouse.move(640, 360);
  await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(400);
  const lock = await page.evaluate(() => document.pointerLockElement != null);
  note(`pointer lock ${lock ? 'GRANTED — look is the real desktop path' : 'DENIED'}`);

  // ⚠️ LOOK IS DISPATCHED, NOT MOVED, AND THE FIRST VERSION OF THIS DRIVER WAS WRONG.
  // Under pointer lock the cursor does not move, but Playwright still computes `movementX` as
  // `target - lastTarget` — so when my synthetic pointer walked off the 1280 px viewport and I
  // "recentred" it to 640, that recentre WAS a 600 px look input. The camera span the player
  // 1.5 rad at random moments, and the first escape run walked into a corner of the chapel and
  // stayed there. It did not throw and the walk loop reported honest positions the whole time.
  // Dispatching the event the game's own listener reads removes the bookkeeping entirely, and
  // it is the same listener a real locked mouse feeds (`player.js` Input: window 'mousemove',
  // gated on `document.pointerLockElement === dom`).
  const lookBy = (dx, dy = 0) => page.evaluate(([dx, dy]) => {
    window.dispatchEvent(new MouseEvent('mousemove', { movementX: dx, movementY: dy, bubbles: true }));
  }, [dx, dy]);

  // Calibrate look: 200 px of mouse travel must move yaw by 200*0.0026 = 0.52 rad.
  const y0 = await page.evaluate(() => window.__rrr.engine.cam.yaw);
  for (let i = 0; i < 10; i++) await lookBy(20);
  await step(2);
  const y1 = await page.evaluate(() => window.__rrr.engine.cam.yaw);
  const perPx = (y1 - y0) / 200;
  note(`look calibration: 200 px -> ${(y1 - y0).toFixed(4)} rad (${perPx.toFixed(6)} rad/px)`);
  const LOOK_OK = Math.abs(perPx) > 1e-5;
  if (!LOOK_OK) { fail('mouse look drives the camera', 'yaw did not move; cannot play this the way a player does'); }
  else pass('mouse look drives the camera', `${perPx.toFixed(6)} rad/px`);

  // ---- one read of everything the driver needs, per tick -----------------------------------
  const readState = () => page.evaluate(() => {
    const e = window.__rrr.engine, run = e.run, p = e.player;
    const sp = e.room.spaceAt(p.pos);
    const x = e.exits.find((q) => run.isLiveExit(q.site.id));
    return {
      x: +p.pos.x.toFixed(3), z: +p.pos.z.toFixed(3),
      yaw: +e.cam.yaw.toFixed(4), aim: +p.aimYaw.toFixed(4),
      pitch: +e.cam.pitch.toFixed(4), aimPitch: +p.aimPitch.toFixed(4),
      space: sp?.id ?? null, place: sp?.name ?? null,
      speed: +(p.speed ?? 0).toFixed(2), gait: p.caps?.gait ?? null,
      limbs: ['shoulderR', 'shoulderL', 'hipR', 'hipL']
        .filter((s) => p.rig.occupant(s) !== 'empty').length,
      phase: run.phase, t: +run.t.toFixed(2),
      hState: e.hunter.state, hAware: +(e.hunter.awareness ?? 0).toFixed(2),
      hDist: +Math.hypot(e.hunter.root.position.x - p.pos.x, e.hunter.root.position.z - p.pos.z).toFixed(1),
      liveStage: x ? x.panel.state.stage : null,
      liveHp: x ? +(x.panel.state.stageHealth ?? 0).toFixed(0) : null,
      liveBlocks: x ? x.panel.blocksMovement() : null,
      hud: e.gameHud?._msgState?.()?.text ?? null,
      frames: window.__rrr.frames(),
    };
  });


  const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  /**
   * yaw that points forward at (tx,tz) from (x,z).
   *
   * ⚠️ MEASURED, NOT DERIVED, AND MY FIRST VERSION WAS 180 DEGREES OUT.
   * `ThirdPersonCamera.update`'s `dirAt()` is `(-sin yaw, -cos yaw)` and reads like the look
   * direction; it is the BOOM direction — the way from the pivot back to the lens. The player's
   * own `aimDir` is `(+sin yaw, +cos yaw)`. `harness/scenarios/pc7-conv.mjs` settles it by
   * holding W at three known yaws: at yaw 0 the body moves (0, +1), at PI/2 it moves (+1, 0),
   * and `camera.getWorldDirection` agrees with the body, not with `dirAt`.
   */
  const yawTo = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);

  const turnTo = async (want, cur) => {
    const d = wrap(want - cur);
    if (Math.abs(d) < 0.02) return;
    // `perPx` is the MEASURED signed rad-per-pixel (it is negative: cam.look does yaw -= dx*s),
    // so dividing by it carries the sign and I never have to remember which way the lens goes.
    const dx = Math.max(-500, Math.min(500, d / perPx));
    await lookBy(Math.round(dx));
  };
  /**
   * Face a world point and level the pitch, with the mouse. Returns the residual yaw error.
   * ⚠️ PITCH MATTERS AND IT IS NOT ZERO AT THE START. `ThirdPersonCamera`'s constructor default
   * is -0.13 and `views/game.js` sets only `cam.yaw` from the player, so a driver that never
   * touches dy aims permanently off the horizontal — and `player.aimDir` is what the WEAPON
   * traces along. Levelling it is one more mouse input, which is what a player does without
   * thinking about it.
   */
  async function faceAt(tx, tz, tries = 26) {
    let q = await readState();
    for (let k = 0; k < tries; k++) {
      q = await readState();
      const want = yawTo(q.x, q.z, tx, tz);
      const dyaw = wrap(want - q.yaw);
      const dpitch = -q.pitch;                       // level
      if (Math.abs(dyaw) < 0.025 && Math.abs(dpitch) < 0.02) break;
      // cam.look: yaw -= dx*s ; pitch -= dy*s. `perPx` carries the sign for both.
      await lookBy(Math.round(Math.max(-500, Math.min(500, dyaw / perPx))),
        Math.round(Math.max(-500, Math.min(500, dpitch / perPx))));
      await step(2);
    }
    q = await readState();
    return wrap(yawTo(q.x, q.z, tx, tz) - q.yaw);
  }

  // ---- VALIDATE THE DRIVER BEFORE TRUSTING A SINGLE RUN IT PRODUCES. -----------------------
  // The first two versions of this file both navigated the house convincingly and both aimed
  // 180 degrees out; the second fired 340 trigger bursts at a wall it was facing away from and
  // reported "the exit cannot be opened by playing". A driver that walks is not a driver that
  // aims. So: face four cardinal points and require `player.aimDir` — the vector the WEAPON
  // traces along — to end up pointing at each one.
  {
    const errs = [];
    for (const [dx, dz] of [[6, 0], [0, 6], [-6, 0], [0, -6]]) {
      const s0 = await readState();
      const res = await faceAt(s0.x + dx, s0.z + dz, 30);
      const got = await page.evaluate(() => {
        const a = window.__rrr.engine.player.aimDir;
        const L = Math.hypot(a.x, a.z) || 1;
        return [a.x / L, a.z / L, +Math.asin(a.y).toFixed(3)];
      });
      const want = [dx / 6, dz / 6];
      const dot = got[0] * want[0] + got[1] * want[1];
      errs.push(`(${want})->dot ${dot.toFixed(3)}/pitch ${got[2]}`);
    }
    const worst = Math.min(...errs.map((e) => +e.split('dot ')[1].split('/')[0]));
    note(`aim self-test: ${errs.join(' · ')}`);
    if (worst > 0.995) pass('the driver can actually aim where it means to', `worst aimDir dot ${worst.toFixed(3)}`);
    else { fail('the driver can actually aim where it means to', `worst aimDir dot ${worst.toFixed(3)}`); return; }
  }

  const held = new Set();
  const hold = async (code, on) => {
    if (on && !held.has(code)) { held.add(code); await page.keyboard.down(code); }
    if (!on && held.has(code)) { held.delete(code); await page.keyboard.up(code); }
  };
  const allOff = async () => { for (const c of [...held]) await hold(c, false); };

  const log = [];
  /**
   * Walk to (tx,tz), steering with the mouse and holding W. Returns the final state.
   * `budget` is in TICKS, not seconds — the engine clamps dt and a stalled frame must not
   * silently end the walk early.
   */
  async function walkTo(tx, tz, { tol = 1.1, budget = 220, run = true, label = '' } = {}) {
    let st = await readState();
    let stuckAt = null, stuck = 0;
    for (let i = 0; i < budget; i++) {
      st = await readState();
      const d = Math.hypot(tx - st.x, tz - st.z);
      if (d <= tol) { await hold('KeyW', false); await hold('ShiftLeft', false); return { st, d, reached: true }; }
      await turnTo(yawTo(st.x, st.z, tx, tz), st.yaw);
      await hold('KeyW', true);
      await hold('ShiftLeft', run && d > 3);
      // stuck detector — a wall push-out reads as zero progress with the key held
      if (stuckAt && Math.hypot(st.x - stuckAt.x, st.z - stuckAt.z) < 0.12) stuck++; else stuck = 0;
      stuckAt = { x: st.x, z: st.z };
      if (stuck > 14) {
        // sidestep, then carry on
        await hold('KeyW', false); await hold('KeyD', true);
        await step(8); await hold('KeyD', false); stuck = 0;
      }
      await step(2);
    }
    await hold('KeyW', false); await hold('ShiftLeft', false);
    const d = Math.hypot(tx - st.x, tz - st.z);
    log.push(`walkTo ${label} RAN OUT of budget at ${d.toFixed(1)} m`);
    return { st, d, reached: false };
  }

  /** Portal-aware route to a target point, using the game's own BFS. */
  const routeTo = (tx, tz, toSpace) => page.evaluate(([tx, tz, toSpace]) => {
    const e = window.__rrr.engine, room = e.room;
    const from = room.spaceAt(e.player.pos)?.id;
    const to = toSpace ?? room.spaceAt({ x: tx, y: 0, z: tz })?.id;
    if (!from || !to) return { err: `no space (from=${from} to=${to})` };
    const ps = from === to ? [] : room.pathPortals(from, to, 0.9);
    return {
      from, to,
      hops: ps.map((p) => ({ x: +p.centre.x.toFixed(2), z: +p.centre.z.toFixed(2), id: p.id, kind: p.kind })),
    };
  }, [tx, tz, toSpace]);

  async function travel(tx, tz, toSpace, label) {
    const r = await routeTo(tx, tz, toSpace);
    if (r.err) { note(`route ${label}: ${r.err}`); return null; }
    note(`route ${label}: ${r.from} -> ${r.to} via ${r.hops.map((h) => h.id).join(' > ') || '(same room)'}`);
    for (const h of r.hops) {
      // approach the doorway centre, then push through it
      const a = await walkTo(h.x, h.z, { tol: 0.7, budget: 260, label: h.id });
      if (!a.reached) note(`  stalled short of ${h.id} by ${a.d.toFixed(1)} m`);
    }
    return walkTo(tx, tz, { tol: 1.0, budget: 300, label });
  }

  // ---- ground truth, held back until the end for the tour ----------------------------------
  const truth = await page.evaluate(() => {
    const e = window.__rrr.engine, run = e.run;
    return {
      seed: String(run.seed), exitId: run.exitId, lock: run.lock.id, start: run.lock.startStage,
      sites: e.exits.map((x) => ({
        id: x.site.id, name: x.site.name, room: x.site.a, live: run.isLiveExit(x.site.id),
        x: +x.panel.root.position.x.toFixed(2), z: +x.panel.root.position.z.toFixed(2),
        nx: +x.panel.normal.x.toFixed(3), nz: +x.panel.normal.z.toFixed(3),
        outSign: x.outSign, halfW: +x.halfW.toFixed(2), stage: x.panel.state.stage,
      })),
    };
  });

  // ============================================================================ TOUR
  if (MODE === 'tour') {
    const order = TOUR_ORDER.length ? TOUR_ORDER : truth.sites.map((s) => s.id);
    for (const id of order) {
      const s = truth.sites.find((q) => q.id === id);
      if (!s) continue;
      const inS = -s.outSign;
      for (const d of (process.env.DISTS ?? '6.0,2.6').split(',').map(Number)) {
        const tx = s.x + s.nx * inS * d, tz = s.z + s.nz * inS * d;
        const r = await travel(tx, tz, s.room, `${id}@${d}m`);
        if (!r) continue;
        // face the wall, settle, shoot
        await faceAt(s.x, s.z);
        await step(14);
        await shot(`pc7-${truth.seed}-${id.replace(/\./g, '_')}-${d}m`);
        note(`shot ${id} at ${d} m — stood ${r.d.toFixed(1)} m from station, room ${(await readState()).place}`);
      }
    }
    note('--- GROUND TRUTH (read only after judging the pictures) ---');
    note(`seed "${truth.seed}" -> LIVE ${truth.exitId} · lock ${truth.lock}`);
    for (const s of truth.sites) note(`   ${s.id.padEnd(22)} ${s.live ? 'LIVE' : 'chained'} stage ${s.stage}`);
    pass('tour completed', `${order.length} sites photographed at 6.0 m and 2.6 m`);
    await allOff();
    return;
  }

  // ============================================================================ ESCAPE
  note(`seed "${truth.seed}" · live ${truth.exitId} · lock ${truth.lock} (stage ${truth.start})`);

  // MODE=yard: register a SECOND player so the first escape lands in WINDDOWN instead of
  // RESULTS. Single player is the only case anyone has driven, and in it `stillInside()` is 0
  // the moment you step out, so `run.escape` goes straight to RESULTS and the win overlay
  // covers the screen on the same frame you cross the plane — which means nobody has ever
  // STOOD in the yard. This is the supported multiplayer path (`run.js` addPlayer), not a hack
  // around the rule.
  if (MODE === 'yard') {
    await page.evaluate(() => window.__rrr.engine.run.addPlayer('p2'));
    note('registered a second player: the first escape should now open WINDDOWN, not RESULTS');
  }
  const site = truth.sites.find((s) => s.live);
  const inS = -site.outSign;

  const t0 = (await readState()).t;
  const wall0 = Date.now();
  note(`run clock at start of the drive: ${t0.toFixed(2)} s`);

  // 1. GET THERE
  const standX = site.x + site.nx * inS * 2.6, standZ = site.z + site.nz * inS * 2.6;
  const arrive = await travel(standX, standZ, site.room, 'the live exit');
  const tArrive = (await readState()).t;
  note(`arrived ${arrive?.d?.toFixed(1) ?? '?'} m from the station at t=${tArrive.toFixed(2)} s`);
  await shot(`pc7-${truth.seed}-arrived`);

  // 2. FACE IT
  await faceAt(site.x, site.z);
  await step(8);
  await shot(`pc7-${truth.seed}-facing-it`);

  // 3. OPEN IT — the trigger, held, like a player. Re-aim every burst because recoil, the
  //    boom and the body all drift, and a shot that misses the panel is not a shot at it.
  const stages = [];
  let firedTicks = 0, sawHunter = null;
  for (let i = 0; i < 340; i++) {
    const st = await readState();
    if (stages[stages.length - 1] !== st.liveStage) stages.push(st.liveStage);
    if (!st.liveBlocks) break;
    if (st.hState !== 'PATROL' && !sawHunter) {
      sawHunter = { t: st.t, state: st.hState, d: st.hDist };
      note(`the hunter reacted at t=${st.t.toFixed(1)} s — ${st.hState} at ${st.hDist} m (limbs ${st.limbs})`);
      await shot(`pc7-${truth.seed}-hunter-reacted`);
    }
    const want = yawTo(st.x, st.z, site.x, site.z);
    if (Math.abs(wrap(want - st.yaw)) > 0.05) await turnTo(want, st.yaw);
    await page.mouse.down();
    await step(4);
    await page.mouse.up();
    firedTicks++;
    if (i % 40 === 0) note(`  t=${st.t.toFixed(1)}s stage ${st.liveStage} hp ${st.liveHp} · hunter ${st.hState} ${st.hDist}m · limbs ${st.limbs}`);
  }
  await page.mouse.up();
  const stOpen = await readState();
  stages.push(stOpen.liveStage);
  note(`stages ${stages.join(' -> ')} in ${firedTicks} trigger bursts`);
  await shot(`pc7-${truth.seed}-opened`);

  if (stOpen.liveBlocks) {
    fail('the exit can be opened by playing', `still blocking at stage ${stOpen.liveStage} after ${firedTicks} bursts`);
    await allOff(); return;
  }
  pass('the exit can be opened by playing', `stages ${stages.join('->')} , open at t=${stOpen.t.toFixed(2)} s`);
  const tOpen = stOpen.t;

  // 4. LOOK AT IT before walking through — this is the payoff frame.
  await step(10);
  await shot(`pc7-${truth.seed}-the-way-out`);

  // 5. WALK OUT. Aimed at the APERTURE first, then straight on out — a body that steers at a
  //    point 3 m beyond the wall clips the jamb and slides along the outside of it.
  const outX = site.x + site.nx * site.outSign * 4.0, outZ = site.z + site.nz * site.outSign * 4.0;
  const trail = [];
  for (const goal of [[site.x + site.nx * site.outSign * 0.2, site.z + site.nz * site.outSign * 0.2],
    [outX, outZ]]) {
    for (let i = 0; i < 130; i++) {
      const st = await readState();
      trail.push(`${st.t.toFixed(1)}:${st.x},${st.z}/${st.space ?? 'OUT'}`);
      if (st.phase !== 'EXPLORE') break;
      if (Math.hypot(goal[0] - st.x, goal[1] - st.z) < 0.6) break;
      await turnTo(yawTo(st.x, st.z, goal[0], goal[1]), st.yaw);
      await hold('KeyW', true);
      await step(2);
    }
    await hold('KeyW', false);
  }
  note(`walk-out trail (every 8th): ${trail.filter((_, i) => i % 8 === 0).join(' ')}`);
  await allOff();
  await step(6);
  const stOut = await readState();
  await shot(`pc7-${truth.seed}-outside`);

  const res = await page.evaluate(() => {
    const e = window.__rrr.engine;
    return { r: e.run.results(), phase: e.run.phase, overlay: !!document.getElementById('rrr-escape'),
      overlayText: document.getElementById('rrr-escape')?.innerText?.replace(/\s+/g, ' ').slice(0, 300) ?? null };
  });
  const wallS = (Date.now() - wall0) / 1000;
  note(`ended in phase ${res.phase} · run clock ${stOut.t.toFixed(2)} s · wall clock ${wallS.toFixed(1)} s`);
  note(`results: ${JSON.stringify(res.r)}`);
  if (res.overlayText) note(`win screen: "${res.overlayText}"`);

  if (res.r.escaped.length) {
    pass('ESCAPED by playing', `t=${res.r.escaped[0].seconds.toFixed(2)} s on the game clock`
      + ` (walk ${(tArrive - t0).toFixed(1)} s · open ${(tOpen - tArrive).toFixed(1)} s · out ${(stOut.t - tOpen).toFixed(1)} s)`);
  } else {
    fail('ESCAPED by playing', `phase ${res.phase}, nobody out; last pos ${stOut.x},${stOut.z} space ${stOut.space}`);
  }
  res.overlay ? pass('a win screen appears', res.overlayText.slice(0, 90))
    : fail('a win screen appears', 'no #rrr-escape overlay in the document');

  // 6. WHAT DOES THE YARD LOOK LIKE — out, and then turned round.
  if (MODE === 'yard') {
    // ⚠️ THE WIN MODAL IS UP AND THE RUN IS NOT OVER. `buildEscapeWatch` fires on `onEscape`
    // regardless of phase, calls `document.exitPointerLock()` and hides the HUD — so in a
    // WINDDOWN (somebody still inside) the screen says you have won while the bomb ticks, the
    // hunter follows you out, and mouse-look is dead. Removing it here is the only way to SEE
    // the yard at all; that removal is itself the finding.
    const removed = await page.evaluate(() => {
      const w = document.getElementById('rrr-escape');
      w?.remove();
      window.__rrr.engine.gameHud?.setHidden?.(false);
      return !!w;
    });
    note(`win modal was ${removed ? 'up over a live WINDDOWN and has been removed to see the yard' : 'absent'}`);
    await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
    await step(4);
    const relocked = await page.evaluate(() => document.pointerLockElement != null);
    note(`pointer lock after the escape screen: ${relocked ? 're-acquired by clicking' : 'STILL GONE — cannot look'}`);
    // keep walking away from the house, which is what a player does next
    for (let i = 0; i < 70; i++) {
      const st = await readState();
      const goal = [site.x + site.nx * site.outSign * 11, site.z + site.nz * site.outSign * 11];
      if (Math.hypot(goal[0] - st.x, goal[1] - st.z) < 0.8) break;
      await turnTo(yawTo(st.x, st.z, goal[0], goal[1]), st.yaw);
      await hold('KeyW', true); await step(2);
    }
    await allOff();
    const y = await readState();
    note(`in the yard at ${y.x},${y.z} · space ${y.space ?? 'OUTSIDE'} · phase ${y.phase}`
      + ` · bombLeft ${await page.evaluate(() => window.__rrr.engine.run.bombLeft)}`
      + ` · hunter ${y.hState} ${y.hDist} m`);
  }
  await step(20);
  await shot(`pc7-${truth.seed}-yard-forward`);
  await faceAt(site.x, site.z, 30);
  await step(14);
  await shot(`pc7-${truth.seed}-yard-looking-back`);

  for (const l of log) note(l);
  await allOff();
}
