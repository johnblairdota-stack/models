/** attachments.md step 4 — the grapple PULLS: escape on a surface, haul the hunter on a body. */
export default async function grapplePull({ page, note, pass, fail, shot }) {
  const read = () => page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player, h = e.hunter;
    return {
      playerPos: [+p.pos.x.toFixed(2), +p.pos.z.toFixed(2)],
      hunterPos: [+h.root.position.x.toFixed(2), +h.root.position.z.toFixed(2)],
      pulling: !!p._pull,
      weapon: p.rig.activeWeapon,
    };
  });

  await page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player, h = e.hunter, room = e.room;
    const a = room.anchor('gallery.mid');
    p.pos.copy(a); p.vel.set(0, 0, 0); p.aimYaw = Math.PI / 2;   // face along the gallery
    h.root.position.set(a.x + 40, 0, a.z);                        // hunter far away
    h.state = 'PATROL'; h.awareness = 0;
    for (const s of ['shoulderL', 'shoulderR']) if (p.rig.occupant(s) !== 'empty') p.rig.detach(s);
    p.rig.fitGadget?.('shoulderR', 'grapple');
  });
  await page.waitForTimeout(900);
  const before = await read();
  note(`before: ${JSON.stringify(before)}`);
  if (before.weapon !== 'grapple') { fail('the grapple is fitted', `weapon=${before.weapon}`); return; }
  await shot('gp0-before');

  // Fire down the gallery at a far wall — the anchor should haul the player toward it.
  await page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player;
    const dir = new p.aimDir.constructor(1, 0, 0).normalize();
    e.weapons.fire('grapple', p.eye.clone(), dir, performance.now() / 1000, { ignore: p.rig, shooter: p });
  });
  await page.waitForTimeout(120);
  const during = await read();
  note(`right after firing: pulling=${during.pulling}`);
  during.pulling ? pass('a grapple hit starts a pull', 'player._pull is live')
                 : fail('a grapple hit starts a pull', 'no pull began');

  await page.waitForTimeout(1800);
  const after = await read();
  const moved = Math.hypot(after.playerPos[0] - before.playerPos[0], after.playerPos[1] - before.playerPos[1]);
  note(`player travelled ${moved.toFixed(2)} m  ${JSON.stringify(before.playerPos)} -> ${JSON.stringify(after.playerPos)}`);
  await shot('gp1-after-pull');
  moved > 2.5 ? pass('the grapple hauls the player to the anchor', `${moved.toFixed(1)} m`)
              : fail('the grapple hauls the player to the anchor', `moved only ${moved.toFixed(2)} m`);

  after.pulling === false ? pass('the pull releases on arrival', 'not still pulling')
                          : fail('the pull releases on arrival', 'still pulling after 1.8 s');

  // Fired at the HUNTER it hauls the hunter instead.
  // ⚠️ RESET TO THE MIDDLE FIRST. The pull above moved the player 12.6 m east, so putting the
  // hunter another 8 m east lands it PAST the gallery's end wall and the trace hits the wall
  // instead of the body — the second test would then fail on the first test's success.
  await page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player, h = e.hunter, room = e.room;
    const a = room.anchor('gallery.mid');
    p._pull = null; p.pos.copy(a); p.vel.set(0, 0, 0);
    h.root.position.set(a.x + 8, 0, a.z);
    h.state = 'PATROL'; h.stun = 0; h.vel?.set?.(0, 0, 0);
  });
  await page.waitForTimeout(500);
  const hb = await read();
  await page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player, h = e.hunter;
    const to = h.root.position.clone().sub(p.eye); to.y = 0;
    const dir = to.normalize();
    e.weapons.fire('grapple', p.eye.clone(), dir, performance.now() / 1000, { ignore: p.rig, shooter: p });
  });
  await page.waitForTimeout(400);
  const ha = await read();
  const hMoved = Math.hypot(ha.hunterPos[0] - hb.hunterPos[0], ha.hunterPos[1] - hb.hunterPos[1]);
  const dBefore = Math.hypot(hb.hunterPos[0] - hb.playerPos[0], hb.hunterPos[1] - hb.playerPos[1]);
  const dAfter = Math.hypot(ha.hunterPos[0] - ha.playerPos[0], ha.hunterPos[1] - ha.playerPos[1]);
  note(`hunter moved ${hMoved.toFixed(2)} m; distance to player ${dBefore.toFixed(2)} -> ${dAfter.toFixed(2)}`);
  await shot('gp2-hunter-hauled');
  (hMoved > 0.5 && dAfter < dBefore)
    ? pass('fired at the hunter it hauls the hunter closer', `${dBefore.toFixed(1)} -> ${dAfter.toFixed(1)} m`)
    : fail('fired at the hunter it hauls the hunter closer', `moved ${hMoved.toFixed(2)} m, ${dBefore.toFixed(1)} -> ${dAfter.toFixed(1)} m`);
}
