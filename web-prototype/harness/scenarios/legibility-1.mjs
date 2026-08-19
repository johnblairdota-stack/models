/**
 * 🔎 legibility-1 — DIAGNOSIS ONLY. Read-only measurement scenario for the "is the destruction
 * legible at real play brightness" question. Does not touch src/. Confirms the quality tier the
 * session actually resolved to, and takes ONE capture with the REAL default third-person camera
 * (boom = player.js's own default 3.0 m, not the collapsed-boom photography rig other dig
 * scenarios use) so the frame is what a player's screen actually shows, not a studio crop.
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/legibility-1.mjs \
 *        --port 5777 --q "seed=s4&dig=1" --shots
 */
export default async function legibility1({ page, note, pass, fail, skip, shot, snap }) {
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(300);

  const frames = () => page.evaluate(() => window.__rrr?.frames?.() ?? 0);
  const step = async (n) => {
    const f0 = await frames();
    for (let i = 0; i < 400; i++) {
      await page.waitForTimeout(40);
      const f = await frames();
      if (f - f0 >= n) return f - f0;
    }
    return -1;
  };

  const head = await page.evaluate(() => {
    const e = window.__rrr?.engine;
    if (!e) return null;
    return {
      qualityName: e.qualityName,
      gpu: (() => { try { return e.renderer.getContext ? null : null; } catch { return null; } })(),
      digMode: e.room?.digCensus ? e.room.digCensus().mode : 'n/a',
      envIntensity: e.scene?.environmentIntensity ?? null,
      exposure: e.pipeline?.grade?.exposure ?? null,
      camDistance: e.cam?.distance ?? null,
    };
  });
  if (!head) { fail('the build is reachable', 'no engine'); return; }
  note(`quality tier resolved to "${head.qualityName}" · dig mode "${head.digMode}" · `
    + `scene.environmentIntensity ${head.envIntensity} · pipeline exposure ${head.exposure} · `
    + `default cam.distance ${head.camDistance}`);

  if (head.digMode !== 'free') {
    skip('a real play-station shot can be taken', `build is dig="${head.digMode}", need --q "dig=1"`);
    return;
  }

  const census = await page.evaluate(() => window.__rrr.engine.room.digCensus());
  const dud = census.free.find((f) => !f.link && f.side === 'a');
  if (!dud) { fail('a dud face exists to dig', 'digCensus().free had none'); return; }
  note(`digging ${dud.id} (a dud face — carries the full ornate/white/cyan stack)`);

  // freeze the hunter so a long settle does not end in a death screen (see chunk-thick.mjs's
  // own note on this — same failure mode would hit this scenario too)
  await page.evaluate(() => {
    const e = window.__rrr.engine;
    if (!e.hunter) return;
    e.hunter.update = () => {};
    e.hunter.vel?.set?.(0, 0, 0);
    if (e.room?.spawn?.hunter) e.hunter.root.position.copy(e.room.spawn.hunter);
    e.hunter.state = 'PATROL'; e.hunter.target = null; e.hunter.awareness = 0;
  });

  // drive a graded crater to the barrier, same shape chunk-thick.mjs uses, so the material
  // stack is on screen for the shot — this is generic room/panel API, not owned code.
  const CU = 0.46, CV = 0.44;
  await page.evaluate(([id, u0, v0]) => {
    const e = window.__rrr.engine;
    const p = e.room.panelOf(id);
    const W = p.width, H = p.height;
    const plan = [[0.00, 14, 1.00], [0.70, 8, 0.68], [1.10, 10, 0.32], [1.45, 10, 0.14]];
    for (const [radius, count, power] of plan) {
      if (radius <= 0) { for (let k = 0; k < count; k++) p.applyHit(p.pointAt(u0, v0), power); continue; }
      const rv = Math.min(radius, 1.05);
      for (let k = 0; k < count; k++) {
        const a = ((k + 0.5) / count) * Math.PI * 2;
        const u = Math.min(0.97, Math.max(0.03, u0 + Math.cos(a) * radius / W));
        const v = Math.min(0.94, Math.max(0.06, v0 + Math.sin(a) * rv / H));
        p.applyHit(p.pointAt(u, v), power);
      }
    }
  }, [dud.id, CU, CV]);
  await step(8);

  // ---- STATION A: the REAL default third-person camera, standing back naturally ----
  // No boom override, no hidden model. This is what a player's screen shows.
  const stationA = await page.evaluate(([id, u, v]) => {
    const e = window.__rrr.engine;
    const p = e.room.panelOf(id);
    const n = p.normal, c = p.pointAt(u, v);
    const standoff = 2.2; // a natural conversational distance from a wall you just holed
    e.player.pos.set(c.x + n.x * standoff, e.room.floorY, c.z + n.z * standoff);
    e.player.vel.set(0, 0, 0);
    const yaw = Math.atan2(-n.x, -n.z);
    e.player.facing = yaw; e.player.aimYaw = yaw;
    if (e.cam) { e.cam.yaw = yaw; e.cam.pitch = -0.08; e.cam._first = true; }
    // leave e.cam.distance at whatever ThirdPersonCamera's own default is — do NOT set it
    return { camDistance: e.cam?.distance ?? null, modelHidden: !!e.cam?.modelHidden };
  }, [dud.id, CU, CV]);
  await step(300);
  await shot('legibility-A-real-station-shipped-grade');
  note(`station A (real 3rd-person camera, cam.distance=${stationA.camDistance}, `
    + `modelHidden=${stationA.modelHidden}): shipped grade, no exposure change`);

  // ---- STATION B: same station, exposure GENUINELY lifted (game.play's shipped exposure is
  // already 1.85 — confirmed by reading src/views/game.js — so this goes well past it rather
  // than lifting "to" the value already shipped, which is what chunk-thick.mjs's thick-13
  // capture inadvertently did) ----
  const before = await page.evaluate(() => window.__rrr.engine.pipeline.grade?.exposure ?? -1);
  const after = await page.evaluate(() => {
    window.__rrr.engine.pipeline.setGrade({ exposure: 4.0 });
    return window.__rrr.engine.pipeline.grade.exposure;
  });
  note(`exposure genuinely lifted ${before} -> ${after} (composite uniform only, no light added)`);
  await step(200);
  await shot('legibility-B-real-station-exposure-4x');

  await page.evaluate(() => window.__rrr.engine.pipeline.setGrade({ exposure: 1.85 }));

  pass('legibility capture pair taken', `quality=${head.qualityName}, station A and B written to progress/playtest/`);
}
