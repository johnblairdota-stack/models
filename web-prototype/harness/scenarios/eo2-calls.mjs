/**
 * EO2 — WHAT DID FOURTEEN EXIT SITES COST, in draw calls and triangles?
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/eo2-calls.mjs \
 *        --port 5209 --q "seed=s4"                  # the shipped pool (14)
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/eo2-calls.mjs \
 *        --port 5209 --q "seed=s4&exits=4"          # the pool as it shipped before this round
 *
 * ⚠️ THIS IS A SCENE CENSUS AT PARKED STATIONS, NOT A `perf-spaces` ROW, and the difference is
 * HANDOFF's: `perf-spaces` draw-call counts are a single-frame snapshot of a moving Director and
 * swung **91–1356 on one build**, so they cannot answer "did geometry appear". Parking the
 * player, letting residency settle and reading `renderer.info.render` can, and it contends with
 * nothing on the GPU — no timer queries are opened, so this is exempt from the perf lock.
 *
 * ⚠️ AND IT PARKS THE **PLAYER**, NOT THE CAMERA. Residency is driven from BOTH viewpoints with
 * the player as the authority (`views/game.js` `_views`); moving only the camera resolves the
 * wrong space and hides the room the body is standing in — the exact bug that produced "two lit
 * robots in a void" in John's own playthrough.
 */

const STATIONS = (process.env.STATIONS ?? [
  'gallery.west', 'gallery.mid', 'gallery.east',
  'study_w.north', 'study_w.south', 'service.mid',
  'study_e.north', 'study_e.south',
  'ballroom.north', 'ballroom.centre', 'ballroom.south',
  'chapel.centre',
].join(',')).split(',').filter(Boolean);

export default async function calls({ page, note, pass, fail }) {
  const frames = () => page.evaluate(() => window.__rrr?.frames?.() ?? 0);
  const step = async (n = 3) => {
    const f0 = await frames();
    for (let i = 0; i < 120; i++) {
      await page.waitForTimeout(40);
      const f = await frames();
      if (f - f0 >= n) return f - f0;
    }
    return -1;
  };
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(300);

  const head = await page.evaluate(() => {
    const e = window.__rrr.engine;
    return { pool: e.exits.length, panels: e.room.panels.length,
      live: e.run.exitId, lock: e.run.lock.id, seed: String(e.run.seed) };
  });
  note(`seed "${head.seed}" · ${head.pool} exit sites in the pool · ${head.panels} panels in the house`
    + ` · live ${head.live} (${head.lock})`);

  const rows = [];
  for (const name of STATIONS) {
    const ok = await page.evaluate((n) => {
      const e = window.__rrr.engine;
      const a = e.room.anchor(n);
      if (!a) return false;
      e.player.pos.set(a.x, e.room.floorY, a.z);
      e.player.vel.set(0, 0, 0);
      e.cam._first = true;         // the boom LERPs through geometry — snap it, do not fly it
      return true;
    }, name);
    if (!ok) { note(`no anchor named ${name}`); continue; }
    // Residency has 0.25 s of HOLD hysteresis, so a room the last station could see is still
    // resident for a quarter of a second. Settle well past it or the count is the last row's.
    await step(40);
    const r = await page.evaluate(() => {
      const e = window.__rrr.engine;
      const info = e.renderer.info.render;
      let meshes = 0, tris = 0, exitMeshes = 0;
      e.scene.traverse((o) => {
        if (!o.isMesh || !o.visible) return;
        let p = o.parent, seen = true;
        while (p) { if (!p.visible) { seen = false; break; } p = p.parent; }
        if (!seen) return;
        meshes++;
        tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
        if (/^wall\.x\.|^exterior\./.test(o.name) || /\bx\.[a-z_]+\.[a-z_]+\.layer/.test(o.name)) exitMeshes++;
      });
      return { calls: info.calls, tris: info.triangles, meshes, sceneTris: Math.round(tris),
        exitMeshes, spaces: e.room.visibleSpaces() };
    });
    rows.push({ name, ...r });
    note(`${name.padEnd(16)} calls ${String(r.calls).padStart(4)} · tris ${String(r.tris).padStart(7)}`
      + ` · visible meshes ${String(r.meshes).padStart(4)} · resident spaces ${r.spaces}`);
  }

  if (!rows.length) { fail('a census was taken', 'no station could be parked'); return; }
  const worst = rows.reduce((a, b) => (b.calls > a.calls ? b : a));
  note(`WORST STATION: ${worst.name} — ${worst.calls} calls / ${worst.tris} tris`
    + ` against the 625 / 900k room budget`);
  worst.calls <= 625 && worst.tris <= 900000
    ? pass('the house still fits the draw-call budget',
      `worst ${worst.name} ${worst.calls}/625 calls, ${worst.tris}/900k tris`)
    : fail('the house still fits the draw-call budget',
      `worst ${worst.name} ${worst.calls} calls / ${worst.tris} tris`);
}
