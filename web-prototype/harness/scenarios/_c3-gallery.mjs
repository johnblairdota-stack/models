/**
 * critic-slice-3 — THE SAME DIG, IN THE GALLERY, WITH THE HUNTER AND THE RUN STATE LOGGED.
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_c3-gallery.mjs \
 *        --port 5373 --q "seed=s4" --shots
 *
 * Two things the service-passage run could not answer:
 *   1. The gallery is the room closest to John's art and the one where every dig face has a
 *      portrait over part of it. Judge the ornate-coat -> white -> cyan ramp THERE.
 *   2. In the service-passage run the player lost a leg and ended up in another room somewhere
 *      between blow 26 and blow 34, and the instrument did not record why. Log hunter distance,
 *      player health/limbs and run state on EVERY blow so the event is attributable.
 *
 * The last two shots deliberately move the camera off the boom — one 45 degrees to the side,
 * one from the far side of the room — because the shipped boom puts the robot's head in the
 * middle of the breach and that is itself a finding, not a reason to have no picture of the wall.
 */

const LADDER = [1, 4, 10, 18, 28, 38, 48, 60];

export default async function c3Gallery({ page, shot, note, pass, fail, skip }) {
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(400);

  const setup = await page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player, room = e.room;
    if (!p.sledge.owned) {
      const it = e.limbField.items.find((i) => i.type === 'sledge');
      if (!it) return { ok: false, why: 'no sledge in limbField' };
      p.pos.copy(it.root.position); p.vel.set(0, 0, 0);
      p.interact(e.limbField, 1.5, null);
    }
    if (!p.sledge.equipped) p.sledge.equip();
    if (!p.sledge.equipped) return { ok: false, why: 'hammer would not equip' };

    let best = null;
    for (const name of ['gallery.mid', 'gallery.west', 'gallery.east']) {
      const v = room.anchor?.(name);
      if (!v) continue;
      const from = v.clone(); from.y += p.eyeHeight;
      for (let i = 0; i < 64; i++) {
        const yaw = (i / 64) * Math.PI * 2;
        const dir = v.clone().set(Math.sin(yaw), 0, Math.cos(yaw));
        const hit = room.castRay?.(from, dir, 3.2, { forDamage: true });
        if (!hit?.panel || !hit.panel.spec?.dig) continue;
        if ((hit.panel.field?.maxDepth ?? 0) > 0.01) continue;
        if (hit.distance < 1.15) continue;
        const score = Math.abs(hit.distance - 1.8);
        if (!best || score < best.score) best = { name, v, yaw, d: hit.distance, score, id: hit.panel.id };
      }
    }
    if (!best) return { ok: false, why: 'no fresh gallery dig face at a workable standoff' };
    p.pos.copy(best.v); p.vel.set(0, 0, 0);
    p.aimYaw = best.yaw; p.facing = best.yaw;
    if (e.cam) { e.cam.yaw = best.yaw; e.cam.pitch = 0.02; }
    return { ok: true, anchor: best.name, panel: best.id, wallAt: +best.d.toFixed(2), yaw: best.yaw };
  });
  if (!setup.ok) { fail('a fresh gallery dig face can be reached', setup.why); return; }
  note(`station: ${setup.anchor} · panel ${setup.panel} · standoff ${setup.wallAt} m`);
  await page.waitForTimeout(700);
  await shot('c3g-00-pristine');

  const probe = () => page.evaluate((id) => {
    const e = window.__rrr.engine, p = e.player, room = e.room;
    const q = room.panelOf(id);
    const h = e.hunter;
    const d = h?.pos ? Math.hypot(h.pos.x - p.pos.x, h.pos.z - p.pos.z) : null;
    return {
      t: +e.elapsed.toFixed(1),
      depth: +(q?.field?.maxDepth ?? -1).toFixed(2),
      open: q?.field?.openCells ?? null,
      hp: p.hp ?? p.health ?? null,
      limbs: p.rig?.occupants ? Object.values(p.rig.occupants()).filter((x) => x !== 'empty').length : null,
      arms: p.caps?.arms ?? null,
      hunter: d === null ? null : +d.toFixed(1),
      over: !!e.run?.over, phase: e.run?.phase ?? null,
      pos: [+p.pos.x.toFixed(1), +p.pos.z.toFixed(1)],
      equipped: p.sledge?.equipped ?? null,
    };
  }, setup.panel);

  const fire = async () => { await page.mouse.down(); await page.waitForTimeout(30); await page.mouse.up(); };

  const log = [];
  let blows = 0, brokeAt = null;
  for (let i = 0; i < 62; i++) {
    await fire();
    blows++;
    await page.waitForTimeout(920);
    const s = await probe();
    log.push({ b: blows, ...s });
    if (!brokeAt && s.depth >= 0.999) brokeAt = blows;
    if (LADDER.includes(blows)) await shot(`c3g-blow${String(blows).padStart(2, '0')}`);
    if (s.over) { note(`RUN ENDED at blow ${blows}: ${JSON.stringify(s)}`); break; }
  }
  note('per-blow log: ' + JSON.stringify(log.filter((r, i) => i % 3 === 0 || r.over || r.hunter < 6)));
  brokeAt ? pass('the gallery face bottoms out', `depth 1.0 at blow ${brokeAt}`)
          : skip('the gallery face bottoms out', `stopped at ${blows} blows, depth never reached 1.0`);

  // the wall, seen from somewhere that is not directly behind the robot's head
  await page.evaluate((yaw) => {
    const e = window.__rrr.engine, p = e.player;
    const y = yaw + 0.85;
    p.pos.x -= Math.sin(y) * 1.1; p.pos.z -= Math.cos(y) * 1.1;
    p.aimYaw = yaw - 0.35; p.facing = yaw - 0.35;
    if (e.cam) { e.cam.yaw = yaw - 0.35; e.cam.pitch = 0.02; }
  }, setup.yaw);
  await page.waitForTimeout(700);
  await shot('c3g-90-breach-off-axis');

  await page.evaluate((yaw) => {
    const e = window.__rrr.engine, p = e.player;
    p.pos.x -= Math.sin(yaw) * 3.2; p.pos.z -= Math.cos(yaw) * 3.2;
    p.aimYaw = yaw; p.facing = yaw;
    if (e.cam) { e.cam.yaw = yaw; e.cam.pitch = -0.10; }
  }, setup.yaw);
  await page.waitForTimeout(700);
  await shot('c3g-91-breach-and-floor');
}
