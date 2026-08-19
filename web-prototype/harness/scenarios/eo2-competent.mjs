/**
 * EO2 — CAN A COMPETENT PLAYER STILL ESCAPE, NOW THAT THE EXIT IS A SIEGE?
 *
 *   SEED=s4 node harness/playtest.mjs --view game.play \
 *        --script harness/scenarios/eo2-competent.mjs --port 5208 --shots --q "seed=s4"
 *
 * This is the question the siege change has to answer, and it cannot be answered by
 * `eo2-siege.mjs`, which measures the JOB with the player nailed to the floor. **A siege nobody
 * survives is worse than a siege that ends in two seconds.**
 *
 * `escape.md` §4 states the loop the change is supposed to create, so the driver plays exactly
 * that loop and nothing cleverer:
 *
 *     go to the exit -> work -> THE NOISE BRINGS IT -> break contact -> come back -> finish -> run
 *
 * ⚠️ BREAKING CONTACT IS THE COMPETENCE BEING TESTED, and `flee-survival.mjs` already measured
 * that it works: on the commit, all four limbs kept at 7.2 m clear; through a route the hunter
 * loses contact entirely at t = 6.9 s. Standing still in the identical staging costs three limbs
 * in 8.1 s. So a driver that stands still is not measuring the game, it is measuring a mistake.
 *
 * ⚠️ THE AIM SELF-TEST IS NOT OPTIONAL AND IT IS COPIED FROM `pc7-play.mjs` ON PURPOSE.
 * `ThirdPersonCamera.dirAt()` is `(-sin, -cos)` and reads like a look vector; it is the BOOM
 * vector, and `player.aimDir` is `(+sin, +cos)`. A driver built on the wrong one walked the
 * house convincingly and fired 340 bursts at a wall it was facing away from, then reported that
 * the exit could not be opened by playing. This one refuses to run if `aimDir` does not end up
 * pointing where it meant.
 */

const RETREAT_AT = +(process.env.RETREAT_AT ?? 9.0);   // metres: back off inside this
const RESUME_AT = +(process.env.RESUME_AT ?? 16.0);    // metres: go back to work outside this
const BUDGET = +(process.env.BUDGET ?? 260);           // game seconds before we call it lost

export default async function competent({ page, note, pass, fail, skip, shot }) {
  const frames = () => page.evaluate(() => window.__rrr?.frames?.() ?? 0);
  const step = async (n = 3) => {
    const f0 = await frames();
    for (let i = 0; i < 120; i++) {
      await page.waitForTimeout(40);
      const f = await frames();
      if (f - f0 >= n) return f - f0;
    }
    return -1;
  };
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(400);

  const lookBy = (dx, dy = 0) => page.evaluate(([dx, dy]) => {
    window.dispatchEvent(new MouseEvent('mousemove', { movementX: dx, movementY: dy, bubbles: true }));
  }, [dx, dy]);
  const y0 = await page.evaluate(() => window.__rrr.engine.cam.yaw);
  for (let i = 0; i < 10; i++) await lookBy(20);
  await step(2);
  const y1 = await page.evaluate(() => window.__rrr.engine.cam.yaw);
  const perPx = (y1 - y0) / 200;
  if (!(Math.abs(perPx) > 1e-5)) { fail('mouse look drives the camera', 'yaw did not move'); return; }

  const read = () => page.evaluate(() => {
    const e = window.__rrr.engine, run = e.run, p = e.player;
    const x = e.exits.find((q) => run.isLiveExit(q.site.id));
    const sp = e.room.spaceAt(p.pos);
    return {
      x: +p.pos.x.toFixed(2), z: +p.pos.z.toFixed(2), yaw: +e.cam.yaw.toFixed(4),
      pitch: +e.cam.pitch.toFixed(4), space: sp?.id ?? null,
      t: +run.t.toFixed(2), phase: run.phase,
      limbs: ['shoulderR', 'shoulderL', 'hipR', 'hipL'].filter((s) => p.rig.occupant(s) !== 'empty').length,
      gun: p.rig.occupant('shoulderR') === 'gadget' || p.rig.occupant('shoulderL') === 'gadget',
      stage: x.panel.state.stage, hp: Math.round(x.panel.state.stageHealth ?? 0),
      blocks: x.panel.blocksMovement(),
      hState: e.hunter.state, hCommit: !!e.hunter.committed,
      hD: +Math.hypot(e.hunter.root.position.x - p.pos.x, e.hunter.root.position.z - p.pos.z).toFixed(1),
    };
  });

  const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  const yawTo = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);
  const turnTo = async (want, cur) => {
    const d = wrap(want - cur);
    if (Math.abs(d) < 0.02) return;
    await lookBy(Math.round(Math.max(-500, Math.min(500, d / perPx))));
  };
  async function faceAt(tx, tz, tries = 26) {
    for (let k = 0; k < tries; k++) {
      const q = await read();
      const dyaw = wrap(yawTo(q.x, q.z, tx, tz) - q.yaw);
      const dpitch = -q.pitch;
      if (Math.abs(dyaw) < 0.025 && Math.abs(dpitch) < 0.02) break;
      await lookBy(Math.round(Math.max(-500, Math.min(500, dyaw / perPx))),
        Math.round(Math.max(-500, Math.min(500, dpitch / perPx))));
      await step(2);
    }
  }

  // ---- the self-test. Refuse to run if the driver cannot aim. -----------------------------
  {
    const dots = [];
    for (const [dx, dz] of [[6, 0], [0, 6], [-6, 0], [0, -6]]) {
      const s0 = await read();
      await faceAt(s0.x + dx, s0.z + dz, 30);
      const got = await page.evaluate(() => {
        const a = window.__rrr.engine.player.aimDir;
        const L = Math.hypot(a.x, a.z) || 1; return [a.x / L, a.z / L];
      });
      dots.push(got[0] * (dx / 6) + got[1] * (dz / 6));
    }
    const worst = Math.min(...dots);
    note(`aim self-test: worst aimDir dot ${worst.toFixed(3)}`);
    if (!(worst > 0.995)) { fail('the driver can actually aim where it means to', `${worst.toFixed(3)}`); return; }
  }

  const held = new Set();
  const hold = async (code, on) => {
    if (on && !held.has(code)) { held.add(code); await page.keyboard.down(code); }
    if (!on && held.has(code)) { held.delete(code); await page.keyboard.up(code); }
  };
  const allOff = async () => { for (const c of [...held]) await hold(c, false); await page.mouse.up(); };

  const routeTo = (tx, tz, toSpace) => page.evaluate(([tx, tz, toSpace]) => {
    const e = window.__rrr.engine, room = e.room;
    const from = room.spaceAt(e.player.pos)?.id;
    const to = toSpace ?? room.spaceAt({ x: tx, y: 0, z: tz })?.id;
    if (!from || !to || from === to) return { from, to, hops: [] };
    return { from, to, hops: room.pathPortals(from, to, 0.9)
      .map((p) => ({ x: +p.centre.x.toFixed(2), z: +p.centre.z.toFixed(2), id: p.id })) };
  }, [tx, tz, toSpace]);

  async function walkTo(tx, tz, { tol = 1.0, budget = 240, run = true } = {}) {
    let stuckAt = null, stuck = 0, st = await read();
    for (let i = 0; i < budget; i++) {
      st = await read();
      const d = Math.hypot(tx - st.x, tz - st.z);
      if (d <= tol) break;
      await turnTo(yawTo(st.x, st.z, tx, tz), st.yaw);
      await hold('KeyW', true);
      await hold('ShiftLeft', run && d > 3);
      if (stuckAt && Math.hypot(st.x - stuckAt.x, st.z - stuckAt.z) < 0.12) stuck++; else stuck = 0;
      stuckAt = { x: st.x, z: st.z };
      if (stuck > 14) { await hold('KeyW', false); await hold('KeyD', true); await step(8); await hold('KeyD', false); stuck = 0; }
      await step(2);
    }
    await hold('KeyW', false); await hold('ShiftLeft', false);
    return read();
  }

  async function travel(tx, tz, toSpace, label) {
    const r = await routeTo(tx, tz, toSpace);
    note(`route ${label}: ${r.from} -> ${r.to} via ${r.hops.map((h) => h.id).join(' > ') || '(same room)'}`);
    for (const h of r.hops) await walkTo(h.x, h.z, { tol: 0.7, budget: 260 });
    return walkTo(tx, tz, { tol: 1.0, budget: 300 });
  }

  const site = await page.evaluate(() => {
    const e = window.__rrr.engine, run = e.run;
    const x = e.exits.find((q) => run.isLiveExit(q.site.id));
    return { id: x.site.id, name: x.site.name, room: x.site.a, lock: run.lock.id,
      x: +x.panel.root.position.x.toFixed(2), z: +x.panel.root.position.z.toFixed(2),
      nx: +x.panel.normal.x.toFixed(3), nz: +x.panel.normal.z.toFixed(3), outSign: x.outSign };
  });
  const inS = -site.outSign;
  note(`seed live site ${site.id} (${site.name}) in ${site.room}, lock ${site.lock}`);

  // Where to break contact TO: the far end of the house from the exit, by the game's own graph.
  const refuge = await page.evaluate((room) => {
    const e = window.__rrr.engine;
    const names = e.room.anchorNames();
    let best = null;
    for (const n of names) {
      const a = e.room.anchor(n);
      if (!a) continue;
      const sp = e.room.spaceAt(a);
      if (!sp || sp.id === room) continue;
      const d = Math.hypot(a.x - e.player.pos.x, a.z - e.player.pos.z);
      if (!best || d > best.d) best = { n, x: +a.x.toFixed(2), z: +a.z.toFixed(2), sp: sp.id, d };
    }
    return best;
  }, site.room);
  note(`refuge for breaking contact: ${refuge?.n} in ${refuge?.sp}`);

  const t0 = (await read()).t;
  const standX = site.x + site.nx * inS * 2.6, standZ = site.z + site.nz * inS * 2.6;
  await travel(standX, standZ, site.room, 'the live exit');
  const tArrive = (await read()).t;
  note(`arrived at t=${tArrive.toFixed(1)} s`);

  const log = [];
  let trips = 0, retreats = 0, worst = 4, lost = false, tick = 0;
  await page.mouse.up();
  for (;;) {
    const st = await read();
    if (!st.blocks) break;
    if (st.t - t0 > BUDGET) { note('budget exhausted'); break; }
    if (st.limbs === 0) { lost = true; break; }
    // ⚠️ NO GUN, NO SIEGE. A nail-gun arm torn off leaves `limbs > 0` and a fist with 1.15 m of
    // reach, so the loop would happily "work" at a wall 2.6 m away for the rest of the budget
    // and report the exit as unopenable. The first run of this file did exactly that: it stood
    // there for 240 game-seconds with the panel at full health and called it a design failure.
    if (!st.gun) { log.push(`t=${st.t.toFixed(1)} LOST THE GUN ARM — nothing left to open it with`); break; }
    worst = Math.min(worst, st.limbs);

    // ⚠️ AND SAY WHERE THE BODY IS. The same run could not be diagnosed from its own output
    // because nothing logged the station: a driver that walks back to the wrong room and fires
    // into a corridor is indistinguishable from a wall that will not break.
    if (tick++ % 25 === 0) {
      const dWall = Math.hypot(site.x - st.x, site.z - st.z);
      log.push(`t=${st.t.toFixed(1)} at (${st.x},${st.z}) in ${st.space} · ${dWall.toFixed(1)} m from the panel`
        + ` · stage ${st.stage} hp ${st.hp} · hunter ${st.hState} ${st.hD} m`);
    }

    if (st.hD < RETREAT_AT || st.hCommit) {
      // BREAK CONTACT. Run for the refuge, wait until it has lost you, come back.
      retreats++;
      log.push(`t=${st.t.toFixed(1)} RETREAT at ${st.hD} m (${st.hState}), stage ${st.stage} hp ${st.hp}, limbs ${st.limbs}`);
      await page.mouse.up();
      await travel(refuge.x, refuge.z, refuge.sp, `refuge #${retreats}`);
      for (let i = 0; i < 200; i++) {
        const q = await read();
        if (q.limbs === 0) { lost = true; break; }
        if (q.hD > RESUME_AT && !q.hCommit && (q.hState === 'PATROL' || q.hState === 'SEARCH')) break;
        // keep moving away rather than standing in the open
        await turnTo(yawTo(q.x, q.z, refuge.x + (q.x - refuge.x) * 2, refuge.z + (q.z - refuge.z) * 2), q.yaw);
        await hold('KeyW', true); await hold('ShiftLeft', true);
        await step(3);
      }
      await hold('KeyW', false); await hold('ShiftLeft', false);
      if (lost) break;
      const q = await read();
      log.push(`t=${q.t.toFixed(1)} contact broken at ${q.hD} m (${q.hState}) — going back`);
      trips++;
      // ⚠️ VERIFY THE ARRIVAL. `walkTo` gives up on a budget and returns silently, so a stalled
      // return leaves the body in another room aiming at a wall that is not the exit — and the
      // work loop below cannot tell the difference.
      for (let a = 0; a < 3; a++) {
        const w = await travel(standX, standZ, site.room, `back to work #${trips}.${a + 1}`);
        if (Math.hypot(standX - w.x, standZ - w.z) < 2.2) break;
        log.push(`t=${w.t.toFixed(1)} return stalled ${Math.hypot(standX - w.x, standZ - w.z).toFixed(1)} m short — retrying`);
      }
      await faceAt(site.x, site.z);
      continue;
    }

    // WORK. Re-aim every burst: recoil, the boom and the body all drift.
    //
    // ⚠️ AND LEVEL THE PITCH, NOT JUST THE YAW. `ThirdPersonCamera`'s constructor default is
    // -0.13 rad and `player.aimDir` is what the weapon traces along, so a driver that only ever
    // corrects yaw fires permanently into the floor — the failure is silent, the shots land on
    // the floor collider, and the wall reads as indestructible.
    const want = yawTo(st.x, st.z, site.x, site.z);
    if (Math.abs(wrap(want - st.yaw)) > 0.05 || Math.abs(st.pitch) > 0.05) {
      await lookBy(Math.round(Math.max(-500, Math.min(500, wrap(want - st.yaw) / perPx))),
        Math.round(Math.max(-500, Math.min(500, -st.pitch / perPx))));
    }
    await page.mouse.down();
    await step(6);
  }
  await allOff();

  const opened = await read();
  note(`work log: ${log.join(' | ') || '(never had to break contact)'}`);
  note(`stage ${opened.stage} · blocks ${opened.blocks} · limbs ${opened.limbs} (worst ${worst})`
    + ` · ${retreats} retreats · t=${opened.t.toFixed(1)} s`);
  await shot('eo2-competent-opened');

  if (opened.blocks) {
    fail('a competent player can still open the exit',
      `still shut at stage ${opened.stage} after ${(opened.t - t0).toFixed(1)} s`
      + `${lost ? ' — torn apart' : ''} (${retreats} retreats)`);
    await allOff();
    return;
  }
  pass('a competent player can still open the exit',
    `open at t=${opened.t.toFixed(1)} s after ${retreats} retreat(s), ${opened.limbs}/4 limbs left`);

  // ---- and out ---------------------------------------------------------------------------
  for (const goal of [[site.x + site.nx * site.outSign * 0.2, site.z + site.nz * site.outSign * 0.2],
    [site.x + site.nx * site.outSign * 4.0, site.z + site.nz * site.outSign * 4.0]]) {
    for (let i = 0; i < 160; i++) {
      const st = await read();
      if (st.phase !== 'EXPLORE') break;
      if (Math.hypot(goal[0] - st.x, goal[1] - st.z) < 0.6) break;
      await turnTo(yawTo(st.x, st.z, goal[0], goal[1]), st.yaw);
      await hold('KeyW', true);
      await step(2);
    }
    await hold('KeyW', false);
  }
  await allOff();
  await step(6);
  const res = await page.evaluate(() => window.__rrr.engine.run.results());
  const end = await read();
  note(`ended phase ${end.phase} · results ${JSON.stringify(res)}`);
  await shot('eo2-competent-out');
  res.escaped.length
    ? pass('a competent player can still ESCAPE', `t=${res.escaped[0].seconds.toFixed(2)} s`
      + ` (walk ${(tArrive - t0).toFixed(1)} s · siege ${(opened.t - tArrive).toFixed(1)} s`
      + ` · ${retreats} retreats · ${end.limbs}/4 limbs)`)
    : fail('a competent player can still ESCAPE', `phase ${end.phase}, nobody out`);
}
