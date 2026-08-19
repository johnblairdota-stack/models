/**
 * critic-slice-3 — ROOMS, BLACK POINT, AND A GALLERY DIG, IN ONE BOOT.
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_c3-all.mjs \
 *        --port 5374 --q "seed=s4" --shots
 *
 * A boot is ~100 s, so the three questions share one. Order matters: the rooms and the black
 * point are read-only and run FIRST; the dig changes the world and runs last.
 *
 * ⚠️ Single captures, LOOKED AT. Nothing here diffs anything — `jitter-1` has a live
 * capture-determinism bug in the gallery and any A/B there is meaningless today.
 */

const BLACK_POINTS = [
  { name: 'SHIPPED', lift: [0.011, 0.009, 0.007], toeCrush: 0.005, contrast: 1.05 },
  { name: 'LIFTED',  lift: [0.036, 0.032, 0.028], toeCrush: 0.0,   contrast: 1.05 },
  { name: 'OPEN',    lift: [0.060, 0.054, 0.046], toeCrush: 0.0,   contrast: 1.02 },
];

const STATIONS = [
  ['study_w',    'study_w.north',  Math.PI],
  ['study_e',    'study_e.south',  0],
  ['gallery-e',  'gallery.mid',    Math.PI / 2],
  ['gallery-w',  'gallery.mid',    -Math.PI / 2],
  ['ballroom-s', 'ballroom.south', 0],
  ['ballroom-n', 'ballroom.north', Math.PI],
  ['service',    'service.mid',    0],
  ['chapel',     'chapel.centre',  0],
];

export default async function c3All({ page, shot, note, pass, fail, skip }) {
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(400);

  const place = (a, yaw) => page.evaluate(([name, y]) => {
    const e = window.__rrr.engine, p = e.player;
    const v = e.room.anchor?.(name);
    if (!v) return { ok: false, why: 'no anchor ' + name };
    p.pos.copy(v); p.vel.set(0, 0, 0);
    p.aimYaw = y; p.facing = y;
    if (e.cam) { e.cam.yaw = y; e.cam.pitch = 0.02; }
    return { ok: true };
  }, [a, yaw]);

  // ------------------------------------------------------------------ 1. the six spaces
  let ok = 0;
  for (const [tag, anchor, yaw] of STATIONS) {
    const r = await place(anchor, yaw);
    if (!r.ok) { note(`no anchor for ${tag} (${anchor})`); continue; }
    await page.waitForTimeout(1100);
    await shot(`c3-room-${tag}`);
    ok++;
  }
  ok >= 6 ? pass('every space photographed from the player camera', `${ok} stations`)
          : skip('every space photographed from the player camera', `${ok} stations resolved`);

  // ------------------------------------------------------------------ 2. the black point
  const setGrade = (g) => page.evaluate((b) => {
    window.__rrr.engine.pipeline.setGrade({ lift: b.lift, toeCrush: b.toeCrush, contrast: b.contrast });
    return true;
  }, g);
  for (const [tag, anchor, yaw] of [['service', 'service.mid', 0], ['gallery', 'gallery.mid', Math.PI / 2]]) {
    await place(anchor, yaw);
    await page.waitForTimeout(900);
    for (const b of BLACK_POINTS) {
      await setGrade(b);
      await page.waitForTimeout(500);
      await shot(`c3-black-${tag}-${b.name}`);
    }
  }
  await setGrade(BLACK_POINTS[0]);
  pass('SHIPPED / LIFTED / OPEN photographed at two stations', 'one page, no reload');

  // ------------------------------------------------------------------ 3. a gallery dig
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

    // cast FAR from the room anchors, then walk to a 1.7 m standoff from whatever we found.
    let best = null;
    for (const name of ['gallery.mid', 'gallery.west', 'gallery.east', 'gallery.north', 'gallery.south']) {
      const v = room.anchor?.(name);
      if (!v) continue;
      const from = v.clone(); from.y += p.eyeHeight;
      for (let i = 0; i < 96; i++) {
        const yaw = (i / 96) * Math.PI * 2;
        const dir = v.clone().set(Math.sin(yaw), 0, Math.cos(yaw));
        const hit = room.castRay?.(from, dir, 12, { forDamage: true });
        if (!hit?.panel || !hit.panel.spec?.dig) continue;
        if ((hit.panel.field?.maxDepth ?? 0) > 0.01) continue;
        if (!best || hit.distance < best.d) best = { name, v: v.clone(), yaw, d: hit.distance, id: hit.panel.id };
      }
      if (best) break;
    }
    if (!best) return { ok: false, why: 'no fresh dig face within 12 m of any gallery anchor' };
    const walk = Math.max(0, best.d - 1.7);
    p.pos.copy(best.v);
    p.pos.x += Math.sin(best.yaw) * walk; p.pos.z += Math.cos(best.yaw) * walk;
    p.vel.set(0, 0, 0);
    p.aimYaw = best.yaw; p.facing = best.yaw;
    if (e.cam) { e.cam.yaw = best.yaw; e.cam.pitch = 0.02; }
    return { ok: true, anchor: best.name, panel: best.id, wallWas: +best.d.toFixed(2), yaw: best.yaw };
  });
  if (!setup.ok) { fail('a fresh gallery dig face can be reached', setup.why); return; }
  note(`gallery station: ${setup.anchor} · panel ${setup.panel} · wall was ${setup.wallWas} m, walked to ~1.7 m`);
  await page.waitForTimeout(800);
  await shot('c3g-00-pristine');

  const probe = () => page.evaluate((id) => {
    const e = window.__rrr.engine, p = e.player, q = e.room.panelOf(id), h = e.hunter;
    const d = h?.pos ? Math.hypot(h.pos.x - p.pos.x, h.pos.z - p.pos.z) : null;
    return { t: +e.elapsed.toFixed(0), depth: +(q?.field?.maxDepth ?? -1).toFixed(2),
             arms: p.caps?.arms ?? null, hunter: d === null ? null : +d.toFixed(1),
             over: !!e.run?.over, eq: !!p.sledge?.equipped };
  }, setup.panel);

  const fire = async () => { await page.mouse.down(); await page.waitForTimeout(30); await page.mouse.up(); };
  const LADDER = [1, 5, 12, 22, 34, 46, 58];
  const log = []; let blows = 0, bottom = null;
  for (let i = 0; i < 60; i++) {
    await fire(); blows++;
    await page.waitForTimeout(920);
    const s = await probe(); log.push({ b: blows, ...s });
    if (!bottom && s.depth >= 0.999) bottom = blows;
    if (LADDER.includes(blows)) await shot(`c3g-blow${String(blows).padStart(2, '0')}`);
    if (s.over) { note(`RUN ENDED at blow ${blows}`); break; }
  }
  note('per-blow: ' + JSON.stringify(log.filter((r, i) => i % 4 === 0 || r.over)));
  bottom ? pass('the gallery face bottoms out', `depth 1.0 at blow ${bottom}`)
         : skip('the gallery face bottoms out', `${blows} blows, depth ${log.at(-1)?.depth}`);

  await page.evaluate((yaw) => {
    const e = window.__rrr.engine, p = e.player;
    p.pos.x -= Math.sin(yaw) * 2.4; p.pos.z -= Math.cos(yaw) * 2.4;
    p.aimYaw = yaw + 0.30; p.facing = yaw + 0.30;
    if (e.cam) { e.cam.yaw = yaw + 0.30; e.cam.pitch = -0.06; }
  }, setup.yaw);
  await page.waitForTimeout(800);
  await shot('c3g-90-breach-and-floor');
}
