/**
 * VERIFY — item 3, "give the hunter a perceivable approach".
 *
 * Five controlled beats — silent, walking, stopping, sprinting, firing — each starting from a
 * known geometry, because the first attempt at this scenario was destroyed by the hunter
 * finding and dismembering the player during the 30 s boot wait and the death overlay eating
 * the next mouse click. (That is itself a result worth recording: before this change the
 * hunter woke by luck; after it, it hunts during the loading screen.)
 *
 * The player is parked at the `hide.player` anchor, deliberately OFF any doorway sightline, and
 * the hunter on the far side of a wall at `hide.hunter`. So every acquisition in beats 1-4 is
 * hearing, by construction.
 *
 * ⚠️ COORDINATES COME FROM `room.anchor()`, NEVER FROM THIS FILE. This scenario used to hardcode
 * `[-6.5, 6.0]` and a hunter at `(-6.5, -6.0)`, which were points in the one-room map. A
 * hardcoded pair does not throw when the floor plan changes — it puts both bodies inside a wall,
 * produces entirely plausible numbers and reports PASS on a measurement of nothing. That is the
 * instrument-failure class this project keeps hitting, so the map answers for itself.
 *
 * The number that matters is the WINDOW: seconds from the first ALERT (it stops, it turns, its
 * eye lights) to the first PURSUE/ATTACK. Before this change the window was zero by
 * construction, because `_sense` assigned PURSUE inline the instant any gate passed.
 */

export default async function feelB({ page, note, pass, fail, skip, shot, waitFor }) {
  const ok = await page.evaluate(() => {
    const e = window.__rrr?.engine;
    if (!e?.hunter || !e?.player) return false;
    const h = e.hunter, p = e.player, room = e.room;
    window.__b = { rows: [], events: [] };
    let last = h.state, acc = 0;
    e.onUpdate((dt, t) => {
      acc += dt;
      const dxz = Math.hypot(h.root.position.x - p.root.position.x, h.root.position.z - p.root.position.z);
      const blocked = room.blocksSight(h.eye, p.root.position.clone().setY(1.0));
      if (h.state !== last) {
        window.__b.events.push({ t: +t.toFixed(2), from: last, to: h.state, dxz: +dxz.toFixed(2),
          aw: +h.awareness.toFixed(2), noise: +p.noise.toFixed(2), blocked, threat: +h.threat.toFixed(2) });
        last = h.state;
      }
      if (acc >= 0.25) {
        acc = 0;
        window.__b.rows.push({ t: +t.toFixed(2), st: h.state, dxz: +dxz.toFixed(2),
          aw: +h.awareness.toFixed(2), noise: +p.noise.toFixed(2), threat: +h.threat.toFixed(2),
          flare: +h.flare.intensity.toFixed(2), saw: h.sawThisFrame, heard: h.heardThisFrame, blocked });
      }
    });
    return true;
  });
  if (!ok) { skip('approach probe installed', 'engine.hunter/player not reachable'); return; }

  const anchors = await page.evaluate(() => {
    const r = window.__rrr.engine.room;
    const v = (n) => { const a = r.anchor(n); return a ? [+a.x.toFixed(2), +a.z.toFixed(2)] : null; };
    return { hp: v('hide.player'), hh: v('hide.hunter'), lp: v('los.player'), lh: v('los.hunter') };
  });
  note(`anchors: hide.player ${JSON.stringify(anchors.hp)} · hide.hunter ${JSON.stringify(anchors.hh)}`
    + ` · los.player ${JSON.stringify(anchors.lp)} · los.hunter ${JSON.stringify(anchors.lh)}`);
  if (!anchors.hp || !anchors.hh) { skip('anchors resolve', 'room.anchor() returned null for hide.*'); return; }

  /**
   * Whole body back on, both actors at a known place, hunter blank.
   * `d` is how far along the hide.player -> hide.hunter line to put the hunter, in metres, so
   * the beats stay comparable whatever the floor plan is.
   */
  const reset = (d = 12.0) => page.evaluate((dd) => {
    const e = window.__rrr.engine, p = e.player, h = e.hunter, r = e.room;
    for (const s of ['shoulderR', 'shoulderL', 'hipL', 'hipR']) {
      if (p.rig.occupant(s) === 'empty') {
        const kind = s.startsWith('shoulder') ? 'arm' : 'leg';
        const it = e.limbField.items.find((i) => i.inWorld && i.socketKind === kind);
        if (it) p.rig.attach(s, it);
      }
    }
    const P = r.anchor('hide.player'), H = r.anchor('hide.hunter');
    const dir = H.clone().sub(P).setY(0).normalize();
    const at = P.clone().addScaledVector(dir, dd);
    p.pos.copy(P); p.vel.set(0, 0, 0); p.shock = 0; p._noiseSpike = 0; p.noise = 0;
    // deterministic heading: W walks toward the hunter's side of the wall, whatever the map is
    p.facing = Math.atan2(dir.x, dir.z); p.aimYaw = p.facing;
    h.root.position.copy(at); h.vel.set(0, 0, 0);
    h.state = 'PATROL'; h.awareness = 0; h.target = null; h.contact = 99; h.flare.intensity = 0;
    const dead = document.querySelector('#rrr-death');
    return { arms: p.rig.caps.arms, legs: p.rig.caps.legs, deathOverlay: !!dead,
      dxz: +Math.hypot(at.x - P.x, at.z - P.z).toFixed(2),
      blocked: r.blocksSight(h.eye, P.clone().setY(1.0)) };
  }, d);

  const mark = async (label) => {
    const s = await page.evaluate(() => {
      const e = window.__rrr.engine, h = e.hunter, p = e.player;
      return { st: h.state, aw: +h.awareness.toFixed(2), threat: +h.threat.toFixed(2),
        noise: +p.noise.toFixed(2), flare: +h.flare.intensity.toFixed(2),
        blocked: e.room.blocksSight(h.eye, p.root.position.clone().setY(1.0)),
        dxz: +Math.hypot(h.root.position.x - p.root.position.x, h.root.position.z - p.root.position.z).toFixed(2) };
    });
    note(`${label.padEnd(30)} state=${String(s.st).padEnd(7)} aware=${String(s.aw).padEnd(4)} threat=${String(s.threat).padEnd(4)} noise=${String(s.noise).padEnd(4)} flare=${String(s.flare).padEnd(5)} dxz=${String(s.dxz).padEnd(5)} losBlocked=${s.blocked}`);
    return s;
  };

  // ---- 1. SILENT ------------------------------------------------------------------------
  const r0 = await reset(12.0);
  note(`reset: ${JSON.stringify(r0)}`);
  await page.waitForTimeout(7000);
  const silent = await mark('stood still 7 s @ 12 m');
  if (silent.st === 'PATROL' && silent.aw < 0.05) pass('standing still is silent', `PATROL, awareness ${silent.aw}, LOS blocked`);
  else fail('standing still is silent', `state=${silent.st} awareness=${silent.aw} losBlocked=${silent.blocked}`);

  // ---- 2. WALKING — heard only from close (hearRange * noise, walking is about half) ------
  // Sampled MID-STRIDE. The first version of this beat marked after 4 s of W, by which point
  // the player had run out of hall, been standing against the divider for 1.6 s and was
  // silent again — so it measured a stationary robot and reported "walking is not heard".
  await reset(8.0);
  await page.waitForTimeout(400);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1700);
  const walk = await mark('walking (mid-stride)');
  await page.keyboard.up('KeyW');
  if (walk.noise > 0.3 && walk.noise < 0.7) pass('walking is half-volume', `noise ${walk.noise}`);
  else fail('walking is half-volume', `noise ${walk.noise} — expected about 0.49`);

  // ---- 3. STOPPING — doing nothing must be able to break contact --------------------------
  await page.waitForTimeout(5500);
  const stopped = await mark('stopped 5.5 s');
  if (walk.aw > stopped.aw && stopped.noise === 0) pass('stopping bleeds awareness off', `${walk.aw} -> ${stopped.aw}, noise 0`);
  else if (walk.aw < 0.05) skip('stopping bleeds awareness off', 'walking never registered, nothing to bleed');
  else fail('stopping bleeds awareness off', `${walk.aw} -> ${stopped.aw} noise ${stopped.noise}`);

  // ---- 4. SPRINTING — loud, and the beat the whole item is about --------------------------
  await reset(12.0);
  await page.waitForTimeout(500);
  await page.keyboard.down('ShiftLeft'); await page.keyboard.down('KeyW');
  const caught = await waitFor(() => {
    const h = window.__rrr.engine.hunter;
    return (h.state === 'ALERT') ? { st: h.state, flare: +h.flare.intensity.toFixed(2) } : null;
  }, { timeout: 9000, every: 60 });
  if (caught) { await shot('b1-alert-moment'); note(`caught it in ALERT, eye flare ${caught.flare}`); }
  else note('never caught a frame in ALERT (it may have passed through faster than the poll)');
  const sprint = await mark('sprinting (mid-stride)');
  await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft');
  await shot('b2-after-sprint');
  if (sprint.aw > 0.15) pass('sprinting is heard through the wall', `awareness ${sprint.aw} at ${sprint.dxz} m, sightBlocked=${sprint.blocked}`);
  else fail('sprinting is heard through the wall', `awareness only ${sprint.aw}`);

  // ---- 5. FIRING — the loudest thing a small robot can do ---------------------------------
  await reset(10.0);
  await page.waitForTimeout(600);
  const noDeath = await page.evaluate(() => !document.querySelector('#rrr-death'));
  if (!noDeath) { skip('firing is heard', 'a death overlay is up; a click would restart the page'); }
  else {
    await page.mouse.move(640, 360);
    await page.mouse.down();
    await page.waitForTimeout(1600);
    const fired = await mark('firing (trigger still held)');
    await page.mouse.up();
    await shot('b3-after-firing');
    if (fired.aw > 0.15) pass('firing is heard', `awareness ${fired.aw} at ${fired.dxz} m, sightBlocked=${fired.blocked}`);
    else fail('firing is heard', `awareness only ${fired.aw} at ${fired.dxz} m`);
  }

  // ---- 6. THE WARNING WINDOW ---------------------------------------------------------------
  // Now on the doorway sightline, which is the only opening in the divider, so the hunter can
  // eventually SEE — and only sight can push awareness past `soundCeiling` to commit. The
  // number a player feels is not ALERT->PURSUE, it is ALERT->it reaches me.
  const t6 = await page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player, h = e.hunter;
    for (const s of ['shoulderR', 'shoulderL', 'hipL', 'hipR']) {
      if (p.rig.occupant(s) === 'empty') {
        const kind = s.startsWith('shoulder') ? 'arm' : 'leg';
        const it = e.limbField.items.find((i) => i.inWorld && i.socketKind === kind);
        if (it) p.rig.attach(s, it);
      }
    }
    const r = e.room, P = r.anchor('los.player'), H = r.anchor('los.hunter');
    p.pos.copy(P); p.vel.set(0, 0, 0);
    const toH = H.clone().sub(P).setY(0).normalize();
    p.facing = Math.atan2(toH.x, toH.z); p.aimYaw = p.facing;
    h.root.position.copy(H); h.vel.set(0, 0, 0);
    h.facing = Math.atan2(-toH.x, -toH.z);
    h.state = 'PATROL'; h.awareness = 0; h.target = null; h.contact = 99;
    window.__b.mark6 = e.elapsed;
    return { t: +e.elapsed.toFixed(2), dxz: +P.distanceTo(H).toFixed(2),
      blocked: r.blocksSight(h.eye, P.clone().setY(1.0)) };
  });
  note(`beat 6 starts at t=${t6.t}s: player on the los.* sightline at ${t6.dxz} m, hunter unaware, sightBlocked=${t6.blocked}`);
  await page.keyboard.down('ShiftLeft'); await page.keyboard.down('KeyW');
  await page.waitForTimeout(2600);
  await page.keyboard.up('KeyW');
  await page.keyboard.up('ShiftLeft');
  // now stand still and let it work. This is the actual horror beat under test.
  //
  // ⚠️ THE WINDOW HAS TO OUTLAST THE BEAT OR THE PROBE MEASURES THE WRONG QUANTITY. At 26 s
  // this timed out with the hunter at 2.91 m against a `reach` of 2.05 — about one second
  // short of the ATTACK it was waiting for — and the assertion below then fell back to
  // ALERT->PURSUE and compared 0.88 s against a threshold calibrated for ALERT->ATTACK.
  // Two different quantities, one number, a confident FAIL on a game that was working.
  // `_patrol`'s figure-of-eight only points the hunter's nose north when `cos(0.21 t)` is
  // near zero, i.e. every ~15 s, so acquisition alone can eat 20 s of the window before the
  // 10 s of travel even starts. 45 s covers both with margin.
  const reached = await waitFor(() => {
    const h = window.__rrr.engine.hunter;
    return h.state === 'ATTACK' ? +window.__rrr.engine.elapsed.toFixed(2) : null;
  }, { timeout: 45000, every: 120 });
  await mark(reached ? 'it reached the player' : 'it never reached the player');
  await shot('b4-window-end');

  const b = await page.evaluate(() => window.__b);
  note(`state changes: ${b.events.map((e) => `${e.t}s ${e.from}->${e.to} @${e.dxz}m aw${e.aw} n${e.noise}${e.blocked ? ' [blind]' : ''}`).join(' | ')}`);

  const after6 = b.events.filter((e) => e.t >= b.mark6);
  const alert6 = after6.find((e) => e.to === 'ALERT' || e.to === 'STALK');
  const commit6 = after6.find((e) => e.to === 'PURSUE');
  const attack6 = after6.find((e) => e.to === 'ATTACK');
  if (!alert6) {
    fail('there is a something-is-coming phase', 'the hunter never left PATROL in beat 6');
  } else {
    const toCommit = commit6 ? +(commit6.t - alert6.t).toFixed(2) : null;
    const toReach = attack6 ? +(attack6.t - alert6.t).toFixed(2) : null;
    note(`WARNING WINDOW — first ${alert6.to} at ${alert6.t}s / ${alert6.dxz} m`
      + (commit6 ? ` · PURSUE at ${commit6.t}s / ${commit6.dxz} m (+${toCommit}s)` : ' · never committed')
      + (attack6 ? ` · ATTACK at ${attack6.t}s / ${attack6.dxz} m (+${toReach}s)` : ' · never reached the player'));
    const w = toReach ?? toCommit;
    if (w != null && w >= 2.0) pass('there is a something-is-coming phase', `${w} s of warning before it ${attack6 ? 'reached' : 'committed to'} the player`);
    else if (w == null) pass('there is a something-is-coming phase', `entered ${alert6.to} at ${alert6.dxz} m and never closed`);
    else fail('there is a something-is-coming phase', `only ${w} s of warning`);
  }

  const throughWall = b.rows.filter((r) => r.heard && r.blocked).length;
  const heardAt = b.rows.filter((r) => r.heard).map((r) => r.dxz);
  note(`frames where it HEARD the player with sight blocked: ${throughWall}` +
    (heardAt.length ? `; heard between ${Math.min(...heardAt).toFixed(2)} and ${Math.max(...heardAt).toFixed(2)} m` : ''));
  if (throughWall > 0) pass('hearing works through a wall', `${throughWall} sampled frames`);
  else fail('hearing works through a wall', 'never heard the player while sight was blocked');

  const flareOn = b.rows.filter((r) => r.flare > 0.5).length;
  note(`frames with the eye flare lit: ${flareOn} of ${b.rows.length}`);
  if (flareOn > 0) pass('the eye is an in-world tell', `${flareOn} sampled frames lit`);
  else fail('the eye is an in-world tell', 'the flare never lit');

  const tmax = Math.max(...b.rows.map((r) => r.threat)), tmin = Math.min(...b.rows.map((r) => r.threat));
  note(`HUD threat channel ranged ${tmin} .. ${tmax}`);
  if (tmax - tmin > 0.25) pass('threat channel has range', `${tmin} .. ${tmax}`);
  else fail('threat channel has range', `${tmin} .. ${tmax} — too flat to feel`);

  const { writeFile } = await import('node:fs/promises');
  await writeFile('progress/diag-approach.json', JSON.stringify(b));
  note('raw rows -> progress/diag-approach.json');
}
