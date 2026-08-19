/** attachments.md step 4 — skates carry a CONTACT slam. Damage is carried, not aimed. */
export default async function skateSlam({ page, note, pass, fail, shot }) {
  await page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player, h = e.hunter, room = e.room;
    const a = room.anchor('gallery.mid');
    p.pos.copy(a); p.vel.set(0, 0, 0); p.aimYaw = Math.PI / 2;
    p.facing = Math.PI / 2;   // skates steer by `facing`, not `aimYaw` — +x is sin=1,cos=0
    h.root.position.set(a.x + 10, 0, a.z);
    h.state = 'PATROL'; h.awareness = 0; h.stun = 0; h.vel?.set?.(0, 0, 0);
    for (const s of ['hipL', 'hipR']) if (p.rig.occupant(s) !== 'empty') { /* keep legs */ }
    p.rig.fitSkates?.();
    window.__slams = 0;
    const orig = h.stagger.bind(h);
    h.stagger = (...args) => { window.__slams++; window.__slamDmg = args[0]; return orig(...args); };
  });
  await page.waitForTimeout(900);

  const s0 = await page.evaluate(() => {
    const p = window.__rrr.engine.player;
    return { gait: p.caps.gait, speed: +p.speed.toFixed(2) };
  });
  note(`gait after fitting skates: ${s0.gait}`);
  if (s0.gait !== 'skate') { fail('skates change the gait', `gait=${s0.gait}`); return; }
  pass('skates change the gait', s0.gait);

  // Build up speed straight at the hunter.
  await page.keyboard.down('KeyW');
  let top = 0;
  for (let i = 0; i < 26; i++) {
    const r = await page.evaluate(() => {
      const e = window.__rrr.engine, p = e.player, h = e.hunter;
      return {
        sp: +p.speed.toFixed(2),
        d: +Math.hypot(h.root.position.x - p.pos.x, h.root.position.z - p.pos.z).toFixed(2),
        slams: window.__slams,
      };
    });
    top = Math.max(top, r.sp);
    if (r.slams > 0) { note(`slam at ${r.d} m, speed ${r.sp}`); break; }
    await page.waitForTimeout(90);
  }
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(300);
  await shot('sk0-after-charge');

  const out = await page.evaluate(() => ({
    slams: window.__slams, dmg: window.__slamDmg,
    speed: +window.__rrr.engine.player.speed.toFixed(2),
  }));
  note(`top speed ${top}, slams ${out.slams}, damage ${out.dmg}`);
  top > 6.0 ? pass('skates exceed running speed', `${top} m/s vs run 5.2`)
            : fail('skates exceed running speed', `${top} m/s`);
  out.slams > 0 ? pass('charging into the hunter slams it', `${out.slams} hit(s) for ${out.dmg}`)
                : fail('charging into the hunter slams it', 'no slam registered');
}
