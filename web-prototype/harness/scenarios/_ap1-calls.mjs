/**
 * 🧮 **WHAT DID THE TWO-SIDED FIX COST IN DRAW CALLS?** — the exact delta, in one page.
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_ap1-calls.mjs \
 *        --port 5468 --q "seed=s4"
 *
 * ⚠️ **NOT TWO `eo2-calls` RUNS.** The draw-call budget is already breached by the ported 9.6 m
 * ballroom (676-841 against 625) and that overrun belongs to someone else, so the only number
 * worth reporting is MINE — which means the two arms have to share a page, a station and a
 * residency set. Flipping `material.side` back to `FrontSide` live is a complete revert of this
 * change and touches nothing else, so the difference between the two reads is the whole of it.
 *
 * The expectation is ZERO and it is not a guess: backface culling is a per-PRIMITIVE test
 * (`gl.cullFace`), so the same meshes are submitted either way. It is measured anyway, because
 * this project's rule is that an unsourced number is wrong until it is re-measured.
 */
const STATIONS = ['ballroom.south', 'ballroom.centre', 'ballroom.north', 'service.mid', 'study_e.south'];

export default async function ap1calls({ page, note, pass, fail, skip }) {
  const settle = async (f = 30) => { for (let i = 0; i < f; i++) await page.waitForTimeout(40); };

  const setSide = (side) => page.evaluate((s) => {
    const e = window.__rrr.engine;
    let n = 0;
    for (const p of e.room.panels) {
      if (p.field) continue;
      for (const m of p.mats.slice(0, 4)) { if (!m) continue; m.side = s; m.needsUpdate = true; n++; }
    }
    const fm = e.room.panelInstances?.faceMaterial;
    if (fm) { fm.side = s; fm.needsUpdate = true; n++; }
    return n;
  }, side);

  const park = (st) => page.evaluate((name) => {
    const e = window.__rrr.engine;
    const [space, where] = String(name).split('.');
    const s = e.room.spaces.find((x) => x.id === space);
    if (!s) return null;
    const at = { north: [s.cx, s.z0 + (s.z1 - s.z0) * 0.2], south: [s.cx, s.z0 + (s.z1 - s.z0) * 0.8],
      east: [s.x0 + (s.x1 - s.x0) * 0.8, s.cz], west: [s.x0 + (s.x1 - s.x0) * 0.2, s.cz],
      mid: [s.cx, s.cz], centre: [s.cx, s.cz] }[where] ?? [s.cx, s.cz];
    e.player.pos.set(at[0], e.room.floorY, at[1]);
    e.player.vel.set(0, 0, 0);
    e.player.facing = 0;
    if (e.cam) { e.cam.yaw = 0; e.cam.pitch = 0; e.cam._first = true; }
    return { space: e.room.spaceAt(e.player.pos)?.id ?? null };
  }, st);

  const read = () => page.evaluate(() => {
    const e = window.__rrr.engine;
    const r = e.renderer.info.render;
    return { calls: r.calls, tris: r.triangles };
  });

  const THREE_FRONT = 0, THREE_DOUBLE = 2;
  const rows = [];
  for (const st of STATIONS) {
    const p = await park(st);
    if (!p) { note(`${st}: no such space`); continue; }
    await settle(35);
    // read each arm twice, alternating, so a drifting scene shows up as spread rather than delta
    await setSide(THREE_DOUBLE); await settle(8); const d1 = await read();
    await setSide(THREE_FRONT); await settle(8); const f1 = await read();
    await setSide(THREE_DOUBLE); await settle(8); const d2 = await read();
    await setSide(THREE_FRONT); await settle(8); const f2 = await read();
    await setSide(THREE_DOUBLE);
    rows.push({ st, d: [d1.calls, d2.calls], f: [f1.calls, f2.calls], tris: [d1.tris, f1.tris] });
    note(`${st.padEnd(17)} DoubleSide ${d1.calls}/${d2.calls} calls · FrontSide (reverted) ${f1.calls}/${f2.calls} `
      + `· tris ${d1.tris} vs ${f1.tris}`);
  }
  if (!rows.length) { skip('the draw-call delta', 'no station parked'); return; }
  const worstDelta = rows.reduce((m, r) => Math.max(m,
    Math.abs(Math.min(...r.d) - Math.min(...r.f)), Math.abs(Math.max(...r.d) - Math.max(...r.f))), 0);
  const spread = rows.reduce((m, r) => Math.max(m, Math.abs(r.d[0] - r.d[1]), Math.abs(r.f[0] - r.f[1])), 0);
  note(`worst |delta| across ${rows.length} stations: ${worstDelta} calls; same-arm repeat spread ${spread} calls`);
  if (worstDelta <= Math.max(2, spread)) {
    pass('the two-sided fix costs no draw calls',
      `worst |delta| ${worstDelta} across ${rows.length} stations, inside the ${spread}-call same-arm repeat spread`);
  } else {
    fail('the two-sided fix costs no draw calls', `worst |delta| ${worstDelta} calls against a ${spread}-call spread`);
  }
}
