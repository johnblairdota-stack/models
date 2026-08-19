/**
 * PC8 — shared driving rig for play-critic-8. Aim self-test, walk, look, shoot, read.
 *
 * Everything here is lifted from `pc7-play.mjs`'s validated pattern for one reason: two earlier
 * drivers on this piece walked the house convincingly while aiming 180 degrees out, because
 * `ThirdPersonCamera.dirAt()` is the BOOM vector `(-sin,-cos)` and `player.aimDir` is
 * `(+sin,+cos)`. Nothing in this file is trusted until `selfTest()` passes.
 */

export function rig({ page, note }) {
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

  const lookBy = (dx, dy = 0) => page.evaluate(([dx, dy]) => {
    window.dispatchEvent(new MouseEvent('mousemove', { movementX: dx, movementY: dy, bubbles: true }));
  }, [dx, dy]);

  const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  const yawTo = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);

  const readState = () => page.evaluate(() => {
    const e = window.__rrr.engine, run = e.run, p = e.player;
    const sp = e.room.spaceAt(p.pos);
    return {
      x: +p.pos.x.toFixed(3), z: +p.pos.z.toFixed(3),
      yaw: +e.cam.yaw.toFixed(4), pitch: +e.cam.pitch.toFixed(4),
      space: sp?.id ?? null, place: sp?.name ?? null,
      speed: +(p.speed ?? 0).toFixed(2),
      limbs: ['shoulderR', 'shoulderL', 'hipR', 'hipL'].filter((s) => p.rig.occupant(s) !== 'empty').length,
      phase: run.phase, t: +run.t.toFixed(2),
      hState: e.hunter.state, hAware: +(e.hunter.awareness ?? 0).toFixed(2),
      hStage: e.hunter.stage,
      hDist: +Math.hypot(e.hunter.root.position.x - p.pos.x, e.hunter.root.position.z - p.pos.z).toFixed(1),
      hud: e.gameHud?._msgState?.()?.text ?? null,
      frames: window.__rrr.frames(),
    };
  });

  let perPx = null;

  async function calibrate() {
    await page.mouse.move(640, 360);
    await page.mouse.down(); await page.mouse.up();
    await page.waitForTimeout(400);
    const lock = await page.evaluate(() => document.pointerLockElement != null);
    const y0 = await page.evaluate(() => window.__rrr.engine.cam.yaw);
    for (let i = 0; i < 10; i++) await lookBy(20);
    await step(2);
    const y1 = await page.evaluate(() => window.__rrr.engine.cam.yaw);
    perPx = (y1 - y0) / 200;
    note(`pointer lock ${lock ? 'GRANTED' : 'DENIED'} · look ${(y1 - y0).toFixed(4)} rad / 200 px = ${perPx.toFixed(6)} rad/px`);
    return { lock, perPx };
  }

  const turnTo = async (want, cur) => {
    const d = wrap(want - cur);
    if (Math.abs(d) < 0.02) return;
    await lookBy(Math.round(Math.max(-500, Math.min(500, d / perPx))));
  };

  async function faceAt(tx, tz, tries = 26, level = true) {
    let q = await readState();
    for (let k = 0; k < tries; k++) {
      q = await readState();
      const dyaw = wrap(yawTo(q.x, q.z, tx, tz) - q.yaw);
      const dpitch = level ? -q.pitch : 0;
      if (Math.abs(dyaw) < 0.025 && Math.abs(dpitch) < 0.02) break;
      await lookBy(Math.round(Math.max(-500, Math.min(500, dyaw / perPx))),
        Math.round(Math.max(-500, Math.min(500, dpitch / perPx))));
      await step(2);
    }
    q = await readState();
    return wrap(yawTo(q.x, q.z, tx, tz) - q.yaw);
  }

  /** Face four cardinal points and require `player.aimDir` — the WEAPON's vector — to agree. */
  async function selfTest() {
    const dots = [];
    for (const [dx, dz] of [[6, 0], [0, 6], [-6, 0], [0, -6]]) {
      const s0 = await readState();
      await faceAt(s0.x + dx, s0.z + dz, 30);
      const got = await page.evaluate(() => {
        const a = window.__rrr.engine.player.aimDir;
        const L = Math.hypot(a.x, a.z) || 1;
        return [a.x / L, a.z / L];
      });
      dots.push(got[0] * (dx / 6) + got[1] * (dz / 6));
    }
    const worst = Math.min(...dots);
    note(`aim self-test worst dot ${worst.toFixed(4)} (${dots.map((d) => d.toFixed(3)).join(' · ')})`);
    return worst;
  }

  const held = new Set();
  const hold = async (code, on) => {
    if (on && !held.has(code)) { held.add(code); await page.keyboard.down(code); }
    if (!on && held.has(code)) { held.delete(code); await page.keyboard.up(code); }
  };
  const allOff = async () => { for (const c of [...held]) await hold(c, false); try { await page.mouse.up(); } catch { /* not down */ } };

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
      if (stuckAt && Math.hypot(st.x - stuckAt.x, st.z - stuckAt.z) < 0.12) stuck++; else stuck = 0;
      stuckAt = { x: st.x, z: st.z };
      if (stuck > 14) {
        await hold('KeyW', false); await hold('KeyD', true);
        await step(8); await hold('KeyD', false); stuck = 0;
      }
      await step(2);
    }
    await hold('KeyW', false); await hold('ShiftLeft', false);
    return { st, d: Math.hypot(tx - st.x, tz - st.z), reached: false };
  }

  const routeTo = (tx, tz, toSpace) => page.evaluate(([tx, tz, toSpace]) => {
    const e = window.__rrr.engine, room = e.room;
    const from = room.spaceAt(e.player.pos)?.id;
    const to = toSpace ?? room.spaceAt({ x: tx, y: 0, z: tz })?.id;
    if (!from || !to) return { err: `no space (from=${from} to=${to})` };
    const ps = from === to ? [] : room.pathPortals(from, to, 0.9);
    return { from, to, hops: ps.map((p) => ({ x: +p.centre.x.toFixed(2), z: +p.centre.z.toFixed(2), id: p.id })) };
  }, [tx, tz, toSpace]);

  async function travel(tx, tz, toSpace, label) {
    const r = await routeTo(tx, tz, toSpace);
    if (r.err) { note(`route ${label}: ${r.err}`); return null; }
    for (const h of r.hops) await walkTo(h.x, h.z, { tol: 0.7, budget: 260, label: h.id });
    return walkTo(tx, tz, { tol: 1.0, budget: 300, label });
  }

  return { frames, step, lookBy, wrap, yawTo, readState, calibrate, turnTo, faceAt, selfTest,
    hold, allOff, walkTo, routeTo, travel, get perPx() { return perPx; } };
}

/** Every connector in the house as the WORLD sees it, plus what the player can see on it. */
export const readHouse = (page) => page.evaluate(() => {
  const e = window.__rrr.engine, run = e.run;
  const rows = e.room.panels.map((p) => {
    const c = e.connectorState?.(p.id) ?? null;
    const d = e.exterior?.dressingOf?.(p.id) ?? null;
    // ⚠️ outSign comes from the BUILD, never from my own guess about which way a normal points.
    const ex = e.exits.find((q) => q.site.id === p.id) ?? null;
    return {
      outSign: ex?.outSign ?? null,
      id: p.id,
      state: c?.state ?? '?',
      live: run.isLiveExit(p.id),
      stage: p.state.stage,
      hp: +(p.state.stageHealth ?? 0).toFixed(0),
      blocksSight: p.blocksSight(),
      blocksMove: p.blocksMovement(),
      x: +p.root.position.x.toFixed(2), z: +p.root.position.z.toFixed(2),
      nx: +p.normal.x.toFixed(3), nz: +p.normal.z.toFixed(3),
      dress: d,
    };
  });
  return { seed: String(run.seed), exitId: run.exitId, lock: run.lock.id, start: run.lock.startStage,
    tells: e.exterior?.tells ?? '?', census: e.exterior?.census?.() ?? null, rows };
});
