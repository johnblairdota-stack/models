/**
 * VERIFY — item 4 (stun accrual must not chain-stun forever) and item 5 (per-weapon cooldown).
 *
 * Item 4 reproduces the play-critic's own measurement: point-blank against the hunter with the
 * nailgun, holding the left mouse button, was survivable for 27 s against a 9 s baseline for
 * not shooting at all. Both halves are re-run here with real input, and the pass condition is
 * NOT "shooting stops working" — it is that shooting still buys time and still runs out.
 *
 * Item 5 counts the shots the weapon system actually receives while the trigger is held down,
 * for three gadgets whose cooldowns differ by a factor of eleven. A flat 0.14 s would make all
 * three fire at the same rate, which is exactly the bug.
 */
import { WEAPON_COOLDOWN } from '../../src/game/rules.js';

const install = (page) => page.evaluate(() => {
  const e = window.__rrr.engine;
  window.__c = { shots: 0, detaches: [], stun: [] };
  const w = e.weapons;
  if (!w.__wrapped) {
    const orig = w.fire.bind(w);
    w.fire = (...a) => { window.__c.shots++; return orig(...a); };
    w.__wrapped = true;
  }
  e.player.rig.onChange((_r, what) => {
    if (what?.kind === 'detach') window.__c.detaches.push(+e.elapsed.toFixed(2));
  });
  let acc = 0;
  e.onUpdate((dt) => {
    acc += dt;
    if (acc < 0.25) return;
    acc = 0;
    const h = e.hunter;
    window.__c.stun.push({ t: +e.elapsed.toFixed(2), stun: +(h.stun ?? 0).toFixed(0),
      resist: +(h.stunResist ?? 0).toFixed(2), lock: +(h._breakLock ?? 0).toFixed(2),
      chain: h._breakChain ?? 0, st: h.state });
  });
  return true;
});

/**
 * Both actors placed at point blank, full body, hunter aware and committed.
 *
 * ⚠️ The pair comes from `room.anchor('duel.player'/'duel.hunter')`, never from coordinates in
 * this file. It used to hardcode `(-1.6, 0, 7.0)` and `7.0 - gap`, which are points in the
 * one-room map — a hardcoded pair does not throw when the floor plan changes, it buries both
 * bodies in a wall and reports a confident number about nothing. The anchors guarantee the two
 * are in ONE space with a clear line between them, which is what this beat measures: a 6 m gap
 * across a dividing wall would measure the wall, not the fight.
 */
const arena = (page, gap = 6.0) => page.evaluate((g) => {
  const e = window.__rrr.engine, p = e.player, h = e.hunter;
  for (const s of ['shoulderR', 'shoulderL', 'hipL', 'hipR']) {
    if (p.rig.occupant(s) === 'empty') {
      const kind = s.startsWith('shoulder') ? 'arm' : 'leg';
      const it = e.limbField.items.find((i) => i.inWorld && i.socketKind === kind);
      if (it) p.rig.attach(s, it);
    }
  }
  if (p.rig.occupant('shoulderL') !== 'gadget') p.rig.fitGadget('shoulderL', 'nailgun');
  const r = e.room, P = r.anchor('duel.player'), H = r.anchor('duel.hunter');
  const dir = H.clone().sub(P).setY(0).normalize();
  const at = P.clone().addScaledVector(dir, g);
  p.pos.copy(P); p.vel.set(0, 0, 0); p.shock = 0;
  // the player is aimed straight down the line, so the hunter comes down the barrel
  // `cam.yaw` is what actually reaches `player.update` in the live loop, so both must move or
  // the camera silently reasserts the old heading on the next frame.
  p.facing = Math.atan2(dir.x, dir.z); p.aimYaw = p.facing;
  if (e.cam) e.cam.yaw = p.aimYaw;
  h.root.position.copy(at); h.vel.set(0, 0, 0);
  h.facing = Math.atan2(-dir.x, -dir.z); h.awareness = 1; h.state = 'PURSUE'; h.target = null;
  h.stun = 0; h.stunResist = 0; h._breakLock = 0; h._breakChain = 0;
  h._swing = 0;
  window.__c.shots = 0; window.__c.detaches.length = 0; window.__c.stun.length = 0;
  return { t: +e.elapsed.toFixed(2), arms: p.rig.caps.arms, legs: p.rig.caps.legs,
    weapon: p.rig.activeWeapon, gap: +P.distanceTo(at).toFixed(2),
    blocked: r.blocksSight(h.eye, P.clone().setY(1.0)) };
}, gap);

export default async function feelC({ page, note, pass, fail, skip, shot, waitFor }) {
  if (!await install(page)) { skip('probe installed', 'engine not reachable'); return; }

  // ---------------------------------------------------------------- item 4, baseline
  let a = await arena(page);
  note(`baseline arena at t=${a.t}: ${JSON.stringify(a)}`);
  const t0 = a.t;
  await waitFor(() => (window.__c.detaches.length ? true : null), { timeout: 26000, every: 100 });
  const base = await page.evaluate((s) => ({ n: window.__c.detaches.length, first: window.__c.detaches[0], now: +window.__rrr.engine.elapsed.toFixed(2) }), t0);
  const baseTime = base.first != null ? +(base.first - t0).toFixed(2) : null;
  note(`NOT SHOOTING: first limb lost after ${baseTime ?? '>26'} s`);

  // ---------------------------------------------------------------- item 4, holding LMB
  a = await arena(page);
  const t1 = a.t;
  await page.mouse.move(640, 360);
  const alive = await page.evaluate(() => !document.querySelector('#rrr-death'));
  if (!alive) { skip('shooting buys time but runs out', 'a death overlay is up'); }
  else {
    await page.mouse.down();
    const got = await waitFor(() => (window.__c.detaches.length ? true : null), { timeout: 30000, every: 100 });
    const shootTime = await page.evaluate((s) => {
      const c = window.__c;
      return { first: c.detaches[0] ?? null, n: c.detaches.length, shots: c.shots,
        now: +window.__rrr.engine.elapsed.toFixed(2) };
    }, t1);
    await shot('c1-holding-lmb');
    await page.mouse.up();
    const survived = shootTime.first != null ? +(shootTime.first - t1).toFixed(2) : null;
    const window_s = +(shootTime.now - t1).toFixed(2);
    note(`HOLDING LMB: ${shootTime.shots} shots fired; first limb lost after ${survived ?? `>${window_s}`} s`);
    const st = await page.evaluate(() => window.__c.stun);
    const peakResist = Math.max(...st.map((r) => r.resist));
    const maxChain = Math.max(...st.map((r) => r.chain));
    const maxStun = Math.max(...st.map((r) => r.stun));
    note(`stagger economy: peak stunResist ${peakResist}, break chain reached ${maxChain}, peak stun ${maxStun} (cap 235, break 190)`);
    note(`hunter state trace: ${[...new Set(st.map((r) => r.st))].join(' ')}`);

    if (survived == null) {
      fail('shooting buys time but runs out', `still un-hit after ${window_s} s of continuous fire — the chain-stun is not fixed`);
    } else if (survived <= 20) {
      pass('shooting buys time but runs out', `${survived} s while firing vs ${baseTime ?? '>26'} s not firing (critic measured 27 s vs 9 s)`);
    } else {
      fail('shooting buys time but runs out', `${survived} s while firing — still close to the 27 s the critic measured`);
    }
    if (baseTime != null && survived != null && survived > baseTime) {
      pass('shooting is still worth doing', `${survived} s vs ${baseTime} s`);
    } else if (survived != null && baseTime != null) {
      fail('shooting is still worth doing', `${survived} s vs ${baseTime} s — shooting bought nothing`);
    }
  }

  // ---------------------------------------------------------------- item 5, cooldowns
  // Park the hunter, then hold the trigger for a fixed window with each gadget and count the
  // shots the weapon system actually receives.
  await page.evaluate(() => {
    const e = window.__rrr.engine, h = e.hunter;
    h.candidates = []; h.awareness = 0; h.state = 'PATROL';
    h.root.position.copy(e.room.spawn.hunter);
  });
  const rates = {};
  for (const g of ['nailgun', 'ball', 'oil', 'grapple']) {
    const ready = await page.evaluate((name) => {
      const p = window.__rrr.engine.player;
      if (p.rig.occupant('shoulderL') !== 'empty') p.rig.detach('shoulderL');
      const r = p.rig.fitGadget('shoulderL', name);
      p._fireCd = 0;
      window.__c.shots = 0;
      return r.ok && p.rig.activeWeapon === name;
    }, g);
    if (!ready) { note(`could not fit ${g}`); continue; }
    await page.waitForTimeout(250);
    await page.evaluate(() => { window.__c.shots = 0; });
    await page.mouse.down();
    await page.waitForTimeout(4000);
    await page.mouse.up();
    const n = await page.evaluate(() => window.__c.shots);
    rates[g] = { shots: n, rate: +(n / 4).toFixed(2), expected: +(1 / WEAPON_COOLDOWN[g]).toFixed(2) };
    await page.waitForTimeout(200);
  }
  note(`shots/second while the trigger is held: ${Object.entries(rates).map(([k, v]) => `${k} ${v.rate}/s (cooldown says ${v.expected}/s)`).join(' · ')}`);

  const bad = Object.entries(rates).filter(([k, v]) => Math.abs(v.rate - v.expected) > Math.max(0.6, v.expected * 0.25));
  if (!Object.keys(rates).length) skip('fire rate matches WEAPON_COOLDOWN', 'no gadget could be fitted');
  else if (!bad.length) pass('fire rate matches WEAPON_COOLDOWN', Object.entries(rates).map(([k, v]) => `${k} ${v.rate}/${v.expected}`).join(' '));
  else fail('fire rate matches WEAPON_COOLDOWN', bad.map(([k, v]) => `${k} fired ${v.rate}/s, table says ${v.expected}/s`).join('; '));

  const { writeFile } = await import('node:fs/promises');
  await writeFile('progress/diag-stun.json', JSON.stringify(await page.evaluate(() => window.__c)));
  note('raw stagger trace -> progress/diag-stun.json');
}
