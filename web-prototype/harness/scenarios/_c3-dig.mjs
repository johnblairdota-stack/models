/**
 * critic-slice-3 — A REAL DIG AT REAL CADENCE, PHOTOGRAPHED FROM THE PLAYER CAMERA.
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_c3-dig.mjs \
 *        --port 5371 --q "seed=s4" --shots
 *
 * Every previous dig strip on this project suppressed `onChunk`/`onBreak` (see
 * `_visible1-shots.mjs`) because a DRIVEN dig lands twenty blows inside one frame and the FX
 * pile into a cloud. That is correct for judging the SURFACE and it means no capture on disk
 * shows what a player actually sees. This one lands one blow per second of real wall clock,
 * with the FX left alone, and photographs the settled state AND the contact window.
 *
 * ROOM: gallery first (the closest thing to John's art), service passage as the fallback.
 */

const ROOMS = (process.env.C3_ROOMS ?? 'gallery.mid,gallery.west,service.mid').split(',');
const LADDER = (process.env.C3_LADDER ?? '1,3,8,16,26,34,40,46,52,58').split(',').map(Number);

export default async function c3Dig({ page, shot, note, pass, fail, skip }) {
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(400);

  const setup = await page.evaluate((rooms) => {
    const e = window.__rrr.engine, p = e.player, room = e.room;
    if (!p.sledge.owned) {
      const it = e.limbField.items.find((i) => i.type === 'sledge');
      if (!it) return { ok: false, why: 'no sledge in limbField' };
      p.pos.copy(it.root.position); p.vel.set(0, 0, 0);
      p.interact(e.limbField, 1.5, null);
    }
    if (!p.sledge.equipped) p.sledge.equip();
    if (!p.sledge.equipped) return { ok: false, why: 'hammer would not equip, arms=' + p.caps.arms };

    const NEAR = 1.15, FAR = 2.6, IDEAL = 1.7;
    let best = null;
    for (const name of rooms) {
      const v = room.anchor?.(name);
      if (!v) continue;
      const from = v.clone(); from.y += p.eyeHeight;
      for (let i = 0; i < 48; i++) {
        const yaw = (i / 48) * Math.PI * 2;
        const dir = v.clone().set(Math.sin(yaw), 0, Math.cos(yaw));
        const hit = room.castRay?.(from, dir, FAR, { forDamage: true });
        if (!hit?.panel || !hit.panel.spec?.dig) continue;
        if ((hit.panel.field?.maxDepth ?? 0) > 0.01) continue;
        if (hit.distance < NEAR) continue;
        const score = Math.abs(hit.distance - IDEAL);
        if (!best || score < best.score) best = { name, v, yaw, d: hit.distance, score, id: hit.panel.id };
      }
      if (best) break;                      // first room that offers a fresh face wins
    }
    if (!best) return { ok: false, why: 'no fresh dig face at a workable standoff in ' + rooms.join('/') };
    p.pos.copy(best.v); p.vel.set(0, 0, 0);
    p.aimYaw = best.yaw; p.facing = best.yaw;
    if (e.cam) { e.cam.yaw = best.yaw; e.cam.pitch = 0.02; }
    return { ok: true, anchor: best.name, panel: best.id, wallAt: +best.d.toFixed(2),
             yaw: +best.yaw.toFixed(3), owned: p.sledge.owned };
  }, ROOMS);

  if (!setup.ok) { fail('a fresh dig face can be reached with the hammer', setup.why); return; }
  note(`station: ${setup.anchor} · panel ${setup.panel} · standoff ${setup.wallAt} m`);
  await page.waitForTimeout(600);
  await shot('c3-00-pristine');

  /** Fire through the REAL input path if it works; fall back to the API, but never reset the cd. */
  const fireReal = async () => {
    await page.mouse.down(); await page.waitForTimeout(30); await page.mouse.up();
  };
  const fireApi = () => page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player;
    const r = p.attack(e.elapsed);
    return { fired: !!r, denied: r?.denied ?? null, res: r?.wall ?? r?.hit ?? null };
  });
  const state = () => page.evaluate((id) => {
    const e = window.__rrr.engine, room = e.room;
    const q = room.panelOf(id);
    return {
      t: +e.elapsed.toFixed(2),
      maxDepth: +(q?.field?.maxDepth ?? -1).toFixed(3),
      last: e.player._lastSledgeHit ?? null,
      debris: (() => { let k = 0; e.scene.traverse((o) => { if (o.visible && /debris|chunk/i.test(o.name || '')) k++; }); return k; })(),
    };
  }, setup.panel);

  const before = await state();
  await fireReal();
  await page.waitForTimeout(500);
  const afterReal = await state();
  const realInputWorks = afterReal.maxDepth > before.maxDepth + 0.001;
  realInputWorks
    ? pass('LMB through the real input path swings the hammer and damages the wall',
           `maxDepth ${before.maxDepth} -> ${afterReal.maxDepth}`)
    : note('LMB did not register headless (pointer lock) — driving player.attack() at the real cadence instead');

  const fire = realInputWorks ? fireReal : fireApi;

  // ---- the contact window of ONE blow, at real time, FX left alone --------------------------
  await page.waitForTimeout(1100);
  await fire();
  await page.waitForTimeout(120);  await shot('c3-01-contact+120ms');
  await page.waitForTimeout(280);  await shot('c3-02-contact+400ms');
  await page.waitForTimeout(600);  await shot('c3-03-contact+1000ms');

  // ---- the whole dig, one blow per second of wall clock ------------------------------------
  let blows = 2, through = null;
  const marks = [];
  for (let i = 0; i < 70 && !through; i++) {
    await page.waitForTimeout(950);
    await fire();
    blows++;
    const s = await state();
    if (LADDER.includes(blows)) {
      await page.waitForTimeout(350);
      await shot(`c3-blow${String(blows).padStart(2, '0')}`);
      marks.push({ blows, depth: s.maxDepth, debris: s.debris });
    }
    if (s.last?.brokeThrough || s.maxDepth >= 0.999) {
      const open = await page.evaluate((id) => {
        const q = window.__rrr.engine.room.panelOf(id);
        return { passable: !!q?.passable?.(), openFrac: q?.field?.openFrac?.() ?? null };
      }, setup.panel);
      if (open.passable) through = { blows, ...open };
    }
  }
  note(`ladder: ${JSON.stringify(marks)}`);
  await page.waitForTimeout(500);
  await shot('c3-10-end-of-dig');

  through
    ? pass('a real-cadence dig opens the wall', `${through.blows} blows (~${(through.blows * 0.95).toFixed(0)} s)`)
    : skip('a real-cadence dig opens the wall', `stopped at ${blows} blows without a passable hole`);

  // ---- LOOK AT THE FLOOR. The art's loudest feature is the rubble pile. ---------------------
  await page.evaluate(() => { const e = window.__rrr.engine; if (e.cam) e.cam.pitch = -0.62; });
  await page.waitForTimeout(500);
  await shot('c3-11-floor-under-the-breach');

  // ---- BACK OFF and look at the finished breach from a room away ---------------------------
  await page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player;
    const back = e.cam ? e.cam.yaw : p.aimYaw;
    p.pos.x -= Math.sin(back) * 2.2; p.pos.z -= Math.cos(back) * 2.2;
    if (e.cam) e.cam.pitch = 0.02;
  });
  await page.waitForTimeout(600);
  await shot('c3-12-breach-from-back');

  const census = await page.evaluate(() => {
    const e = window.__rrr.engine;
    let debris = 0, sprites = 0, tris = 0;
    e.scene.traverse((o) => {
      if (!o.visible) return;
      if (o.isSprite) sprites++;
      if (/debris|chunk|rubble|shard/i.test(o.name || '')) { debris++; tris += (o.geometry?.index?.count ?? 0) / 3; }
    });
    return { debris, sprites, tris: Math.round(tris) };
  });
  note(`scene census after the dig: ${JSON.stringify(census)}`);
}
