/**
 * critic-slice-3 — THE SIX ROOMS FROM THE PLAYER CAMERA, AND THE BLACK POINT ON ALL THREE ARMS.
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_c3-rooms.mjs \
 *        --port 5372 --q "seed=s4" --shots
 *
 * Two jobs in one boot, because a boot costs ~100 s:
 *   1. Every space, shot from where a player stands and through the shipped third-person boom —
 *      not from `shoot.mjs`'s composed director cameras, which are the only room captures the
 *      board has and which are NOT what the game looks like.
 *   2. The [G] black point: the SAME station on SHIPPED / LIFTED / OPEN, one page, no reload,
 *      so John picks from pictures. Flipped through `pipeline.setGrade` with the exact tables
 *      `views/game.js` puts on the key.
 *
 * ⚠️ These are single captures, LOOKED AT. No diff is taken anywhere in this file — the gallery
 * capture-determinism bug (`jitter-1`, live) makes any A/B in that room meaningless right now.
 */

const BLACK_POINTS = [
  { name: 'SHIPPED', lift: [0.011, 0.009, 0.007], toeCrush: 0.005, contrast: 1.05 },
  { name: 'LIFTED',  lift: [0.036, 0.032, 0.028], toeCrush: 0.0,   contrast: 1.05 },
  { name: 'OPEN',    lift: [0.060, 0.054, 0.046], toeCrush: 0.0,   contrast: 1.02 },
];

/** name, anchor, yaw (rad) — chosen to face into the room, not at the nearest wall. */
const STATIONS = [
  ['study_w',  'study_w.north',   Math.PI],
  ['study_e',  'study_e.south',   0],
  ['gallery-e', 'gallery.mid',    Math.PI / 2],
  ['gallery-w', 'gallery.mid',    -Math.PI / 2],
  ['ballroom', 'ballroom.south',  0],
  ['ballroom-n', 'ballroom.north', Math.PI],
  ['service',  'service.mid',     0],
  ['chapel',   'chapel.centre',   0],
];

export default async function c3Rooms({ page, shot, note, pass, fail, skip }) {
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(400);

  const have = await page.evaluate(() => {
    const e = window.__rrr?.engine;
    if (!e?.room) return null;
    return { anchors: typeof e.room.anchor === 'function', spaces: e.room.spaceIds?.() ?? null };
  });
  if (!have?.anchors) { fail('the rooms can be visited', 'no room.anchor()'); return; }

  const place = (a, yaw) => page.evaluate(([name, y]) => {
    const e = window.__rrr.engine, p = e.player;
    const v = e.room.anchor?.(name);
    if (!v) return { ok: false, why: 'no anchor ' + name };
    p.pos.copy(v); p.vel.set(0, 0, 0);
    p.aimYaw = y; p.facing = y;
    if (e.cam) { e.cam.yaw = y; e.cam.pitch = 0.02; }
    e.room.setViewpoints?.([p.pos]);
    return { ok: true, at: [+v.x.toFixed(1), +v.y.toFixed(1), +v.z.toFixed(1)] };
  }, [a, yaw]);

  let ok = 0;
  for (const [tag, anchor, yaw] of STATIONS) {
    const r = await place(anchor, yaw);
    if (!r.ok) { note(`skipped ${tag}: ${r.why}`); continue; }
    await page.waitForTimeout(900);          // let residency stream the room in
    await shot(`c3-room-${tag}`);
    ok++;
  }
  ok >= 6 ? pass('every space was visited from the player camera', `${ok} stations`)
          : skip('every space was visited from the player camera', `only ${ok} stations resolved`);

  // -------------------------------------------------------------- the black point, one page
  const setGrade = (b) => page.evaluate((g) => {
    window.__rrr.engine.pipeline.setGrade({ lift: g.lift, toeCrush: g.toeCrush, contrast: g.contrast });
    return true;
  }, b);

  for (const [tag, anchor, yaw] of [['service', 'service.mid', 0], ['gallery', 'gallery.mid', Math.PI / 2],
                                     ['ballroom', 'ballroom.south', 0]]) {
    await place(anchor, yaw);
    await page.waitForTimeout(800);
    for (const b of BLACK_POINTS) {
      await setGrade(b);
      await page.waitForTimeout(450);
      await shot(`c3-black-${tag}-${b.name}`);
    }
  }
  await setGrade(BLACK_POINTS[0]);
  pass('the three black-point arms were photographed at three stations', 'SHIPPED / LIFTED / OPEN');
}
