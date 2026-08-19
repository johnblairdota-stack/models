/**
 * PC7 — MEASURE THE CONVENTIONS instead of deriving them. Three sign conventions live in this
 * codebase (camera boom direction, player aimDir, strafe basis) and two of them are documented
 * with opposite signs. A driver built on the wrong one still walks — it just walks somewhere.
 */
export default async function conv({ page, note, pass, fail }) {
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
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(300);

  for (const yaw of [0, Math.PI / 2, Math.PI]) {
    const a = await page.evaluate((y) => {
      const e = window.__rrr.engine;
      e.cam.yaw = y; e.cam.pitch = 0; e.player.aimYaw = y; e.player.vel.set(0, 0, 0);
      e.player.pos.set(0, e.room.floorY, -21.5);   // gallery middle, open in both axes
      e.cam._first = true;
      return { x: e.player.pos.x, z: e.player.pos.z };
    }, yaw);
    await step(4);
    await page.keyboard.down('KeyW');
    await step(22);
    await page.keyboard.up('KeyW');
    await step(2);
    const b = await page.evaluate(() => {
      const e = window.__rrr.engine, c = e.camera;
      const d = new (e.player.pos.constructor)();
      c.getWorldDirection(d);
      return { x: e.player.pos.x, z: e.player.pos.z, yaw: e.cam.yaw,
        aim: [+e.player.aimDir.x.toFixed(3), +e.player.aimDir.z.toFixed(3)],
        camFwd: [+d.x.toFixed(3), +d.z.toFixed(3)] };
    });
    const dx = b.x - a.x, dz = b.z - a.z;
    const L = Math.hypot(dx, dz) || 1;
    note(`yaw ${yaw.toFixed(3)}: W moved (${(dx / L).toFixed(3)}, ${(dz / L).toFixed(3)}) `
      + `[${L.toFixed(2)} m] · aimDir (${b.aim}) · cameraForward (${b.camFwd}) `
      + `· (sin,cos)=(${Math.sin(yaw).toFixed(3)},${Math.cos(yaw).toFixed(3)})`);
  }
  pass('conventions measured');
}
