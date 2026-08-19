/** attachments.md step 4 — oil is AREA DENIAL: a pool that burns and hurts what stands in it. */
export default async function oilFire({ page, note, pass, fail, shot }) {
  const read = () => page.evaluate(() => {
    const e = window.__rrr.engine, h = e.hunter, p = e.player;
    return {
      fires: e.weapons.fires.length,
      hunterStun: +(h.stun ?? 0).toFixed(1),
      hunterPos: [+h.root.position.x.toFixed(2), +h.root.position.z.toFixed(2)],
      playerLegs: p.rig.caps.legs, playerArms: p.rig.caps.arms,
      weapon: p.rig.activeWeapon,
    };
  });

  await page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player, h = e.hunter, room = e.room;
    const a = room.anchor('ballroom.centre');
    p.pos.copy(a); p.vel.set(0, 0, 0); p.aimYaw = 0;
    h.root.position.set(a.x, 0, a.z - 6);
    h.vel?.set?.(0, 0, 0); h.state = 'PATROL'; h.awareness = 0; h.stun = 0;
    for (const s of ['shoulderL', 'shoulderR']) if (p.rig.occupant(s) !== 'empty') p.rig.detach(s);
    p.rig.fitGadget?.('shoulderR', 'oil');
  });
  // Count real damage applications rather than trusting a downstream value.
  await page.evaluate(() => {
    const h = window.__rrr.engine.hunter;
    window.__oilHits = 0;
    const orig = h.stagger.bind(h);
    h.stagger = (...a) => { window.__oilHits++; return orig(...a); };
  });
  await page.waitForTimeout(900);
  const before = await read();
  note(`before: ${JSON.stringify(before)}`);
  if (before.weapon !== 'oil') { fail('the oil gun is fitted', `weapon=${before.weapon}`); return; }
  before.fires === 0 ? pass('no fires before firing') : fail('no fires before firing', `${before.fires}`);

  // Fire at the floor between player and hunter.
  const shotAt = await page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player;
    const d = { x: 0, y: -0.28, z: -1 };
    const dir = new p.aimDir.constructor(d.x, d.y, d.z).normalize();
    const out = e.weapons.fire('oil', p.eye.clone(), dir, performance.now() / 1000, { ignore: p.rig });
    return out?.point ? [+out.point.x.toFixed(2), +out.point.z.toFixed(2)] : null;
  });
  await page.waitForTimeout(500);
  const lit = await read();
  note(`oil landed at ${JSON.stringify(shotAt)} -> fires=${lit.fires}`);
  await shot('oil0-pool');
  lit.fires > 0 ? pass('oil leaves a burning pool', `${lit.fires} fire(s)`)
                : fail('oil leaves a burning pool', 'no fire created');

  // Walk the HUNTER into it and confirm it takes damage (stagger) while standing there.
  await page.evaluate(() => {
    const e = window.__rrr.engine, h = e.hunter;
    const f = e.weapons.fires[0];
    if (f) { h.root.position.set(f.pos.x, 0, f.pos.z); h.stun = 0; }
  });
  await page.waitForTimeout(1500);
  const hits = await page.evaluate(() => window.__oilHits ?? 0);
  note(`damage ticks applied while standing in the pool: ${hits}`);
  await shot('oil1-hunter-burning');
  // ⚠️ ASSERT THE DAMAGE PATH, NOT `stun`. The first version watched `stun` and failed: the
  // fire adds ~8.7 stun/s while stun DECAYS at 55/s, so it can never accumulate — the check
  // was measuring a value engineered to fall faster than the fire can raise it. Worth knowing
  // for any future "does X hurt the hunter" test.
  hits > 0
    ? pass('standing in the fire hurts the hunter', `${hits} damage tick(s)`)
    : fail('standing in the fire hurts the hunter', 'no damage was applied');

  // And it must BURN OUT rather than deny the room forever.
  await page.evaluate(() => { const e = window.__rrr.engine; e.hunter.root.position.z += 30; });
  await page.waitForTimeout(6400);
  const out = await read();
  note(`after the burn window: fires=${out.fires}`);
  await shot('oil2-burnt-out');
  out.fires === 0 ? pass('the pool burns out', 'fires cleared')
                  : fail('the pool burns out', `${out.fires} still burning`);
}
