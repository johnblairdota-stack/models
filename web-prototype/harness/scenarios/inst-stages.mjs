/**
 * THE OCCLUSION RULE, TESTED AT EVERY STAGE — because it is the only half of the instancing
 * change that could possibly alter a pixel.
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/inst-stages.mjs \
 *        --port 5236 --shots --q "seed=s4"
 *
 * Instancing moves a draw from a `Mesh` to an `InstancedMesh` with the same geometry, the same
 * material and the same transform — there is no room in that for a visual difference. The claim
 * that CAN be wrong is `wall.js`'s: *a layer whose break amount is exactly 0 is an opaque
 * occluder for every layer behind it, so those layers can be skipped.* That is an argument about
 * projective geometry and it has to be checked against the shader, at each of the five stages,
 * on a real panel.
 *
 * Method: park facing panels, FREEZE the simulation (`engine.freezeAt = engine.elapsed`, which
 * `_step` honours in the live loop — updaters stop and `uTime` stops, so the grain and the
 * breathing lights stop with them), drive every visible panel to a stage, and shoot the same
 * frozen frame in `legacy` (all four layers, always) and in `occlude`. A SAME-MODE control pair
 * is shot at every stage, because this view's own noise floor is the thing any difference has to
 * beat.
 *
 * ⚠️ A stage is forced with `setStage`, which needs authority; if the field is a client the
 * probe reports SKIP rather than silently measuring a wall that never moved.
 */

export default async function stages({ page, note, pass, fail, skip, shot }) {
  const frames = () => page.evaluate(() => window.__rrr?.frames?.() ?? 0);
  const step = async (n = 3) => {
    const f0 = await frames();
    for (let i = 0; i < 200; i++) {
      await page.waitForTimeout(35);
      const f = await frames();
      if (f - f0 >= n) return f - f0;
    }
    return -1;
  };
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(300);

  const ok = await page.evaluate(() => {
    const e = window.__rrr.engine;
    if (e.room.wallMode !== 'instanced') return `mode is ${e.room.wallMode}`;
    const a = e.room.anchor('service.mid');
    e.player.pos.set(a.x, e.room.floorY, a.z);
    e.player.vel.set(0, 0, 0);
    e.cam._first = true;
    return null;
  });
  if (ok) { fail('the build is the instanced arm', ok); return; }
  await step(45);

  const pin = await page.evaluate(() => {
    const e = window.__rrr.engine;
    e.opts.dynamicRes = false;
    e.pipeline.renderScale = 1.0;
    e.pipeline.setSize(e.pipeline.canvasWidth, e.pipeline.canvasHeight);
    e.freezeAt = e.elapsed;
    const on = e.room.panels.filter((p) => p.wantVisible && p.state.authority);
    return { visible: e.room.panels.filter((p) => p.wantVisible).length, authoritative: on.length,
      ids: on.map((p) => p.id) };
  });
  if (!pin.authoritative) {
    skip('the occlusion rule is pixel-neutral at every stage',
      `${pin.visible} panels on screen but none is authoritative, so no stage can be forced`);
    return;
  }
  note(`service.mid: ${pin.visible} panels on screen, ${pin.authoritative} of them authoritative`
    + ` — ${pin.ids.join(', ')}`);

  const setMode = (m) => page.evaluate((mm) => window.__rrr.engine.room.setWallMode(mm), m);
  const drive = (s) => page.evaluate((ss) => {
    const e = window.__rrr.engine;
    let moved = 0, layers = 0;
    for (const p of e.room.panels) {
      if (!p.wantVisible || !p.state.authority) continue;
      p.state.setStage(ss);
      p._anim = 0;                 // no collapse animation: this is a static comparison
      p._apply();
      moved++;
      layers += p.layers.filter((l) => l.visible).length;
    }
    e.room.panelInstances?.sync(true);
    return { moved, layers };
  }, s);

  const out = [];
  for (const s of [0, 1, 2, 3, 4]) {
    const d = await drive(s);
    await setMode('occlude');
    await step(3);
    const a1 = await shot(`instst.stage${s}.A-occlude-1`);
    await step(2);
    const a2 = await shot(`instst.stage${s}.A-occlude-2`);
    await setMode('legacy');
    await step(3);
    const b1 = await shot(`instst.stage${s}.B-legacy`);
    const drawn = await page.evaluate(() => {
      const e = window.__rrr.engine;
      let n = 0;
      for (const p of e.room.panels) if (p.wantVisible) n += p.layers.filter((l) => l.visible).length;
      return n;
    });
    await setMode('instanced');
    await step(2);
    out.push({ s, occludeLayers: d.layers, legacyLayers: drawn, moved: d.moved });
    note(`stage ${s}: ${d.moved} panels driven — layer planes drawn:`
      + ` occlude ${d.layers} vs legacy ${drawn}`);
  }
  out.length === 5
    ? pass('every stage was shot in both arms', out.map((r) => `s${r.s} ${r.occludeLayers}/${r.legacyLayers}`).join(' · '))
    : fail('every stage was shot in both arms', `${out.length} of 5`);
}
