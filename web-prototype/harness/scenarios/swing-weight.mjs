/** Does the club swing move the BODY, not just the arm? Strobe the swing and measure. */
export default async function swingWeight({ page, note, pass, fail, shot }) {
  // Give the player a limb to hold.
  //
  // ⚠️ TAKE THE DETACHED LEG BY IDENTITY. This used to detach `hipR`, then separately search
  // `limbField.items.find(i => i.inWorld)` and teleport whatever came back first — and since
  // `sledge-2` seeded the world with four gadgets, the nailgun and the sledgehammer, "first in
  // array order" stopped being the leg. The probe teleported the HAMMER to the player, `E`
  // equipped it, `rig.held` stayed null, and this scenario reported
  // `picked up a limb to swing -> nothing held` as a FAIL.
  //
  // It has been red since `sledge-2` landed and was still red when `sledge-3` rebuilt the swing,
  // so the club's own regression gate was unavailable for the entire round that most needed it.
  // `sledge-check.mjs` hit the identical bug, fixed it in its own copy, wrote it down — and
  // nobody carried the fix here. Same class as the `mechanics.mjs` skip.
  //
  // ⚠️ THIS GATE MEASURES THE **CLUB**, NOT THE SLEDGEHAMMER. It should read ≈0.49 and must NOT
  // move when sledge work lands; the sledge's own body travel is `sledge-check.mjs`'s figure.
  const setup = await page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player;
    const leg = p.rig.detach('hipR');
    if (!leg) return { ok: false };
    leg.root.position.set(p.pos.x, e.room.floorY + 0.1, p.pos.z);
    const got = p.rig.pickUp ? p.rig.pickUp(leg) : null;
    return { ok: true, picked: !!got, label: p.rig.held?.label ?? null };
  });
  note(`setup: ${JSON.stringify(setup)}`);
  await page.waitForTimeout(400);
  const held = await page.evaluate(() => window.__rrr.engine.player.rig.held?.label ?? null);
  note(`held: ${held}`);
  if (!held) { fail('picked up a limb to swing', 'nothing held'); return; }
  await shot('sw0-carry');

  // sample body channels through a swing
  const sample = () => page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player;
    const o = p.gait.offset;
    return {
      ph: +(p.rig._swingPhase ?? -1).toFixed(2),
      yaw: +(o.yaw ?? 0).toFixed(4), pitch: +(o.pitch ?? 0).toFixed(4), roll: +(o.roll ?? 0).toFixed(4),
      x: +(o.x ?? 0).toFixed(4), z: +(o.z ?? 0).toFixed(4),
    };
  });

  const rest = await sample();
  await page.mouse.down(); await page.waitForTimeout(30); await page.mouse.up();
  const track = [];
  for (let i = 0; i < 14; i++) { track.push(await sample()); await page.waitForTimeout(60); }
  await shot('sw1-mid-swing');
  await page.waitForTimeout(700);
  await shot('sw2-recover');

  const span = (k) => {
    const vs = track.map((s) => s[k]).concat(rest[k]);
    return +(Math.max(...vs) - Math.min(...vs)).toFixed(4);
  };
  const moved = { yaw: span('yaw'), pitch: span('pitch'), roll: span('roll'), x: span('x'), z: span('z') };
  note(`rest: ${JSON.stringify(rest)}`);
  note(`body travel through the swing: ${JSON.stringify(moved)}`);
  note(`phases seen: ${track.map((s) => s.ph).join(' ')}`);

  const total = moved.yaw + moved.pitch + moved.roll + moved.x + moved.z;
  if (total > 0.02) pass('the swing moves the whole body', `summed body travel ${total.toFixed(4)}`);
  else fail('the swing moves the whole body', `body barely moved (${total.toFixed(4)}) — still an arm-only animation`);
}
