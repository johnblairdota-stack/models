/**
 * `localise-1` — ONE FRAME PER ROOM, PINNED HARD ENOUGH TO COMPARE ACROSS TWO SESSIONS.
 *
 *   LOC1_DIR=<dir> LOC1_TAG=<a|b> node harness/playtest.mjs --view game.play \
 *     --script harness/scenarios/_loc1-stations.mjs --port 5431 --q "seed=s4&quality=high"
 *
 * The room-local refactor of `spaces.js` is a deliberate NO-OP, so the standard it is held to is
 * BYTE-IDENTICAL rather than "inside the same-config noise floor" — HANDOFF's usual rule is
 * suspended here on purpose, because the change is constructed to change nothing.
 *
 * ⚠️ **THE FLOOR HAS TO BE MEASURED, NOT ASSUMED, AND IT IS A CROSS-SESSION FLOOR.**
 * `harness/still.mjs` pins the four terms that make two captures inside ONE page differ. This
 * compares two captures in two different PROCESSES, which is a strictly harder problem: the
 * canonical `renderScale` a session lands on, the sim time elapsed when a station is reached,
 * and every integrated pose depend on how fast the machine was that minute. So this probe:
 *
 *   · pins `renderScale` to 1.0 BEFORE the first `hold()`, so every session shares one scale
 *     (`still.mjs`'s own warning: all holds in a session must share one canonical scale — this
 *     extends it to all sessions in a comparison);
 *   · hides the MESHES of the player and the hunter and leaves their LIGHTS alone, which is
 *     `calls-1`'s residency trick used for a different reason: both bodies carry integrated,
 *     time-driven poses, and `numPointLights` must not move (it is in three's program cache key);
 *   · parks the player, settles with the sim RUNNING, and only then holds — `still.mjs`'s trap 1,
 *     which put a station's panel at x = -2556 under a table of confident zeros.
 *
 * Run it TWICE on the unchanged tree first. Those two runs are the same-config floor AND the
 * baseline; if the floor is not zero the instrument cannot answer the question and says so.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const STATIONS = [
  ['gallery.west', 90], ['gallery.mid', 90], ['gallery.east', 270],
  ['study_w.south', 0], ['study_w.north', 180], ['study_w.south', 90],
  ['service.mid', 0], ['service.mid', 90],
  ['study_e.south', 0], ['study_e.north', 180],
  ['ballroom.south', 0], ['ballroom.centre', 0], ['ballroom.north', 180],
  ['chapel.centre', 0], ['chapel.centre', 180],
];

export default async function loc1Stations({ page, note, pass, fail, skip }) {
  const DIR = process.env.LOC1_DIR;
  const TAG = process.env.LOC1_TAG || 'a';
  if (!DIR) { skip('LOC1_DIR is set', 'no output directory'); return; }
  mkdirSync(DIR, { recursive: true });
  const wait = async (n) => { for (let i = 0; i < n; i++) await page.waitForTimeout(40); };

  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await wait(8);

  // ---- pin the render scale for the WHOLE session, before anything holds ------------------
  const pinned = await page.evaluate(() => {
    const e = window.__rrr?.engine;
    if (!e) return null;
    e.opts.dynamicRes = false;
    if (Math.abs(e.pipeline.renderScale - 1) > 1e-9) {
      e.pipeline.renderScale = 1;
      e.pipeline.setSize(e.pipeline.canvasWidth, e.pipeline.canvasHeight);
    }
    return { scale: e.pipeline.renderScale, w: e.pipeline.canvasWidth, h: e.pipeline.canvasHeight,
      tier: e.opts.quality ?? e.quality ?? null };
  });
  if (!pinned) { skip('the engine is reachable', 'window.__rrr.engine missing'); return; }
  note(`renderScale pinned to ${pinned.scale} at ${pinned.w}x${pinned.h} · tier ${pinned.tier}`);

  // ---- hide the two bodies' MESHES, keep their LIGHTS --------------------------------------
  const hidden = await page.evaluate(() => {
    const e = window.__rrr.engine;
    let n = 0, lights = 0;
    for (const root of [e.player?.root, e.player?.rig?.root, e.hunter?.root, e.hunter?.rig?.root]) {
      if (!root || !root.traverse) continue;
      root.traverse((o) => {
        if (o.isLight) { lights++; return; }
        if (o.isMesh || o.isPoints || o.isSprite || o.isLine) { o.visible = false; n++; }
      });
    }
    const counts = { point: 0, spot: 0 };
    e.scene.traverseVisible((o) => { if (o.isPointLight) counts.point++; if (o.isSpotLight) counts.spot++; });
    return { n, lights, ...counts };
  });
  note(`hid ${hidden.n} body meshes, left ${hidden.lights} body lights alone`
    + ` · visible point ${hidden.point} spot ${hidden.spot}`);

  const { hold, release } = await import('../still.mjs');

  const park = (name, yawDeg) => page.evaluate(([n, deg]) => {
    const e = window.__rrr.engine;
    const a = e.room.anchor(n);
    if (!a) return null;
    e.player.pos.set(a.x, e.room.floorY, a.z);
    e.player.vel.set(0, 0, 0);
    e.player.facing = deg * Math.PI / 180;
    if (e.cam) { e.cam.yaw = e.player.facing; e.cam.pitch = 0; e.cam._first = true; }
    return { space: e.room.spaceAt(e.player.pos)?.id ?? null };
  }, [name, yawDeg]);

  const census = () => page.evaluate(() => {
    const e = window.__rrr.engine;
    const r = e.renderer.info.render;
    let point = 0, spot = 0, dir = 0, hemi = 0;
    e.scene.traverseVisible((o) => {
      if (o.isPointLight) point++; else if (o.isSpotLight) spot++;
      else if (o.isDirectionalLight) dir++; else if (o.isHemisphereLight) hemi++;
    });
    return { calls: r.calls, tris: r.triangles, programs: e.renderer.info.programs?.length ?? -1,
      point, spot, dir, hemi, scale: +e.pipeline.renderScale.toFixed(4) };
  });

  const rows = [];
  let shots = 0;
  for (const [name, yaw] of STATIONS) {
    const at = await park(name, yaw);
    if (!at) { note(`anchor "${name}" missing — skipped`); continue; }
    await wait(45);                       // arrive with the sim RUNNING
    const pin = await hold(page);
    await wait(4);
    const buf = await page.screenshot({ timeout: 90000 });
    const c = await census();
    await release(page);
    const key = `${name}@${yaw}`.replace(/[^a-z0-9_.@]/gi, '_');
    if (buf) { writeFileSync(path.join(DIR, `${TAG}.${key}.png`), buf); shots++; }
    rows.push({ key, space: at.space, ...c });
    note(`${key.padEnd(22)} space ${String(at.space).padEnd(9)} calls ${String(c.calls).padStart(4)}`
      + ` tris ${String(c.tris).padStart(7)} programs ${String(c.programs).padStart(4)}`
      + ` lights p${c.point}/s${c.spot}/d${c.dir}/h${c.hemi} scale ${c.scale}`
      + ` ${pin?.pinned ? '' : '(HOLD FAILED)'}`);
  }

  const worstCalls = rows.reduce((a, b) => (b.calls > a.calls ? b : a), rows[0]);
  const progs = rows.map((r) => r.programs);
  const lightKeys = [...new Set(rows.map((r) => `${r.point}`))].sort();
  writeFileSync(path.join(DIR, `${TAG}.census.json`), JSON.stringify({ pinned, hidden, rows }, null, 1));
  note(`WORST DRAW CALLS ${worstCalls.calls} at ${worstCalls.key} (budget 625)`);
  note(`PROGRAMS ${progs[0]} -> ${progs[progs.length - 1]} (+${progs[progs.length - 1] - progs[0]} over the walk)`);
  note(`POINT-LIGHT COUNTS SEEN: {${lightKeys.join(',')}}`);
  if (shots === STATIONS.length) pass('a frame per station', `${shots} captures in ${DIR}`);
  else fail('a frame per station', `${shots} of ${STATIONS.length}`);
}
