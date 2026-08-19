/** John: walls one-sided / rooms going black while walking. Is the player's space resident? */
export default async function wallSides({ page, note, pass, fail, shot }) {
  const probe = (anchor, yaw) => page.evaluate(({ anchor, yaw }) => {
    const e = window.__rrr.engine, p = e.player, room = e.room;
    const a = room.anchor(anchor);
    if (!a) return { ok: false, why: `no anchor ${anchor}` };
    p.pos.copy(a); p.vel.set(0, 0, 0); p.aimYaw = yaw;
    if (e.cam) { e.cam.yaw = yaw; e.cam.pitch = 0; }
    return { ok: true };
  }, { anchor, yaw });

  const read = () => page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player, room = e.room;
    const mine = room.spaceAt(p.pos);
    const camS = room.spaceAt(e.camera.position);
    return {
      playerSpace: mine?.id ?? null,
      playerSpaceVisible: mine ? !!mine.visible : null,
      cameraSpace: camS?.id ?? null,
      visibleCount: room.visibleSpaces(),
    };
  });

  let bad = 0;
  for (const [anchor, yaw, label] of [
    ['study_w.north', Math.PI, 'study_w facing gallery'],
    ['gallery.west', 0, 'gallery facing study_w'],
    ['ballroom.north', Math.PI, 'ballroom facing north'],
    ['gallery.mid', Math.PI / 2, 'gallery mid facing east'],
    ['chapel.centre', 0, 'chapel'],
    ['service.mid', 0, 'service passage'],
  ]) {
    await probe(anchor, yaw);
    await page.waitForTimeout(800);
    const r = await read();
    note(`${label}: ${JSON.stringify(r)}`);
    await shot(`ws-${anchor.replace(/\./g, '_')}`);
    if (r.playerSpaceVisible === false) bad++;
  }

  if (bad === 0) pass("the player's own space is always resident", 'checked 6 positions');
  else fail("the player's own space is always resident", `${bad}/6 positions hid the room the player stands in`);
}
