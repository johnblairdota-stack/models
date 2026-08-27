// pt-match-43: THE SAME CAMERA, IN THE SAME ROOM, IN TWO VIEWS.
//
// John: "I want it to be exactly that this ballroom we have worked on so if the light needs to
// be 34 then do that." Round 42 proved the two views build the same room and hand it the same
// light TABLE. It did NOT prove the two views RENDER the same, and it could not: the numbers it
// compared were whole-frame medians of two different pictures — a third-person game shot and a
// drifting TV camera — so "median 34.5 here, 18.1 there" was comparing SUBJECTS, not lighting.
//
// This puts the camera at the same place in the room in both views, points it the same way,
// renders, and compares. If the ballroom that plays is the ballroom we built, the two frames
// are the same frame.
//
//   node harness/_ptmatch43.mjs "<query>" <label> [--at N] [--settle N] [--eye u,v,h] [--look u,v,h]
//
// eye/look are FRACTIONS of the ballroom's own bounding box (u along x, v along z, h up from
// the floor), so the same pair of numbers means the same physical spot in a 27 m authored room
// and in whatever rect the generator happened to hand the party.
import { chromium } from 'playwright';
import fs from 'node:fs';
import net from 'node:net';
const PORT = 5178;
const args = process.argv.slice(2);
const Q = args[0], LABEL = args[1];
const flag = (n, d) => { const i = args.indexOf('--' + n); return i < 0 ? d : args[i + 1]; };
const SETTLE = Number(flag('settle', 12));
const AT = flag('at', null);
const triple = (s, d) => (s ? s.split(',').map(Number) : d);
const EYE = triple(flag('eye', null), [0.88, 0.50, 0.180]);
const LOOK = triple(flag('look', null), [0.05, 0.50, 0.290]);
const OUT = flag('out', `out/_ptmatch43-${LABEL}.png`);
const FLIP = args.includes('--flip');
const NOCHROME = args.includes('--nochrome');
const WAIT_IN = flag('wait-in', null);      // advance until the VIEW's own camera stands here
const WAIT_MAX = Number(flag('wait-max', 12));
const portOpen = (p) => new Promise((r) => {
  const s = net.connect(p, '127.0.0.1');
  s.on('connect', () => { s.destroy(); r(true); }); s.on('error', () => r(false));
});
if (!(await portOpen(PORT))) { console.error('vite not running on 5178'); process.exit(3); }
const b = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.log('[E]', String(e).slice(0, 200)));
// WARNINGS ARE NOT NOISE HERE. `room.anchor()` warns and returns null for a name it does not
// have, and `?spawn=ballroom` is such a name — the anchors are `ballroom.centre`,
// `ballroom.north`, `ballroom.east`. A capture with a mistyped spawn still renders, still
// writes a PNG, and is a picture of a different room. Round 43 caught exactly that here.
page.on('console', (m) => { if (/warn|error/.test(m.type())) console.log('[' + m.type() + ']', m.text().slice(0, 160)); });
await page.routeWebSocket((u) => u.port === String(PORT), () => {});
const url = `http://127.0.0.1:${PORT}/?${Q}${AT ? `&at=${AT}` : ''}`;
await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1',
  null, { timeout: 600000 });
await page.evaluate((n) => window.__rrr.settle(n), SETTLE);
/**
 * ⚠ **WAIT UNTIL THE VIEW'S OWN CAMERA IS STANDING IN THE ROOM.**
 *
 * `game.js` L3230 follows `room.spaceAt(engine.camera.position) ?? room.spaceAt(player.pos)`,
 * and `party-follow` does the same one file over. Both mean the light rig is a function of
 * where THE VIEW's camera is, not of where this harness later points a camera — so a frame
 * rendered while the view was standing in the gallery is a picture of the ballroom lit by the
 * gallery's table (#dce8ff at 265), whatever the ballroom's own table says.
 *
 * That is not a hypothetical: round 43's first matched capture came back with the key at
 * 260.7 #dce8ff — the gallery's entry, to three figures — while `spaces.js` had the ballroom
 * at 360 #ffdcb4 all along.
 */
if (WAIT_IN) {
  const re = new RegExp(WAIT_IN, 'i');
  let where = null, tries = 0;
  for (; tries < WAIT_MAX; tries++) {
    where = await page.evaluate((pat) => {
      const e = window.__rrr.engine;
      // ⚠ GEOMETRY, NOT `spaceAt`. `game.play` hangs the room off the engine and `party.follow`
      // does not — its room lives on the bed — so a probe that only asks `engine.room.spaceAt`
      // reports "(nowhere)" for every frame of the one view this harness exists to measure.
      // The rects are reachable either way, and a point-in-rect test needs nothing else.
      // ⚠ AND THE ROOM IS NOT ALWAYS ON THE ENGINE. `game.play` hangs it there; `party.follow`
      // hangs it on `window.__rrrFollow` instead (`views/party-follow.js` L198), so the obvious
      // `engine.room.spaces` comes back EMPTY in the one view this harness exists to measure —
      // which is what "NO-RECTS:0 spaces" was, and what round 42's browser-side party light
      // table quietly was too.
      const rm = window.__rrrFollow?.room ?? e.room ?? null;
      const byId = rm?.spaceAt?.(e.camera.position)?.id;
      if (byId) return byId;
      const spaces = rm?.spaces ?? [];
      const p = e.camera.position;
      const hit = spaces.find((s) => s.x0 != null
        && p.x >= s.x0 && p.x <= s.x1 && p.z >= s.z0 && p.z <= s.z1);
      if (hit) return String(hit.id);
      const named = spaces.filter((s) => new RegExp(pat, 'i').test(String(s.id)));
      // ⚠ NOT a string containing the room's own name. The caller tests this value against the
      // same regex, so a helpful "(outside; r0.ballroom is at ...)" would MATCH and the loop
      // would break claiming the camera had arrived somewhere it is not.
      return named.length ? `OUTSIDE:target[${named[0].x0.toFixed(1)},${named[0].x1.toFixed(1)}]`
        + `x[${named[0].z0.toFixed(1)},${named[0].z1.toFixed(1)}] `
        + `cam(${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}) of ${spaces.length} spaces`
        : `NO-RECTS:${spaces.length} spaces`;
    }, WAIT_IN);
    console.log(`   [wait-in] probe ${tries}: camera in ${where ?? '(nowhere / no room API)'}`);
    if (where && re.test(where)) break;
    // ⚠ FOUR FRAMES, NOT TWENTY. Under SwiftShader a frame of the generated house costs ~1.5 s,
    // so a 20-frame probe repeated 60 times is half an hour and the whole budget — which is how
    // round 43's first party capture died with the browser closed under it and nothing written.
    await page.evaluate(() => window.__rrr.settle(4));
  }
  if (!(where && re.test(where))) {
    console.error(`camera never entered /${WAIT_IN}/ in ${WAIT_MAX} tries (last: ${where})`);
    await b.close(); process.exit(4);
  }
  // and then let the rig ARRIVE. `follow` is an exponential lerp on position and a snap on
  // colour; 60 frames at 0.35 is convergence to well under a part in a thousand.
  await page.evaluate(() => window.__rrr.settle(40));
  console.log(`   [wait-in] view's camera reached ${where} after ${tries} probes`);
}
const info = await page.evaluate(({ eye, look, flip }) => {
  const e = window.__rrr.engine;
  // ⚠ THE RECT COMES FROM THE PLAN, NOT FROM A BOUNDING BOX. The first cut of this harness took
  // the ballroom's mesh bbox and got 31.8 x 18.2 against an authored 27.2 x 15.3 — because the
  // bbox swallows a doorway's reveal, the exterior spill card and anything else parented into
  // the space. Two views whose bboxes are composed differently do not put a "0.86 along" camera
  // in the same physical place, which is the entire point of this measurement.
  const spaces = window.__rrrFollow?.room?.spaces ?? e.room?.spaces ?? [];
  const sp = spaces.find((x) => /ballroom/i.test(String(x.id ?? x.name ?? '')));
  if (!sp || sp.x0 == null) return { err: 'no ballroom rect in engine.room.spaces', ids: spaces.map((x) => x.id) };
  const W = sp.x1 - sp.x0, D = sp.z1 - sp.z0, H = sp.storey ?? 9.6;
  const cx = (sp.x0 + sp.x1) / 2, cz = (sp.z0 + sp.z1) / 2;
  // u runs along the room's LONG axis, v across it. The generated ballroom comes out 15.3 x 27.2
  // where the authored one is 27.2 x 15.3 — the same room, laid the other way round — so a
  // camera specified in WORLD x/z would be looking at a wall in one view and down the room in
  // the other.
  const longX = W >= D;
  const halfU = (longX ? W : D) / 2, halfV = (longX ? D : W) / 2;
  const f = flip ? -1 : 1;
  const at = (t) => {
    const u = (t[0] * 2 - 1) * halfU * f, v = (t[1] * 2 - 1) * halfV, y = t[2] * H;
    return longX ? [cx + u, y, cz + v] : [cx + v, y, cz + u];
  };
  // ⚠ WHOSE LIGHTING IS THIS, ACTUALLY? `game.js` line 3230 follows the space the CAMERA is in
  // (`room.spaceAt(engine.camera.position) ?? room.spaceAt(player.pos)`), and this harness moves
  // the camera AFTER the last step, so the lights on the frame it writes belong to wherever the
  // view's own camera was standing. Report it, or the picture is unattributable.
  const before = {
    cam: [e.camera.position.x, e.camera.position.y, e.camera.position.z].map((v) => +v.toFixed(2)),
    camSpace: (window.__rrrFollow?.room ?? e.room)?.spaceAt?.(e.camera.position)?.id ?? null,
  };
  const P = at(eye), T = at(look);
  const cam = e.camera;
  cam.position.set(P[0], P[1], P[2]);
  cam.up.set(0, 1, 0);
  cam.lookAt(T[0], T[1], T[2]);
  cam.fov = 55; cam.aspect = e.renderer.domElement.width / e.renderer.domElement.height;
  cam.near = 0.1; cam.far = 400;
  cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
  window.__rrr.redraw();
  const g = e.pipeline?.grade ?? {};
  const lights = [];
  e.scene.traverse((n) => { if (n.isLight && n.intensity > 0.01)
    lights.push(`${n.type}:${n.intensity.toFixed(1)}:#${n.color.getHexString()}`); });
  return {
    rect: [sp.x0, sp.x1, sp.z0, sp.z1].map((v) => +v.toFixed(2)),
    size: [+W.toFixed(2), +H.toFixed(2), +D.toFixed(2)], longX,
    eye: P.map((v) => +v.toFixed(2)), target: T.map((v) => +v.toFixed(2)),
    exposure: g.exposure, sat: g.saturation, haze: g.haze,
    lights: lights.sort(),
    sim: window.__rrr.simState(), before,
  };
}, { eye: EYE, look: LOOK, flip: FLIP });
if (info.err) { console.error(info.err, JSON.stringify(info.ids ?? [])); await b.close(); process.exit(2); }
/**
 * ⚠ **AN ELEMENT SCREENSHOT IS A SCREENSHOT OF THE PAGE, CLIPPED — NOT OF THE CANVAS.** Anything
 * the view lays OVER the canvas comes with it: `game.play`'s HUD, and `party.follow`'s broadcast
 * chrome, whose letterbox alone painted two black bands across the party frame and dragged its
 * luminance ladder down against a game frame that had no such bands. Two pictures compared for
 * LEVEL must not differ by how much furniture each one's DOM puts on top.
 */
if (NOCHROME) {
  await page.evaluate(() => {
    // and the canvas is not always a direct child of body — hide only what does not CONTAIN it,
    // or the one thing worth photographing goes with the chrome.
    const cv = document.querySelector('canvas');
    for (const el of document.body.children) {
      if (el !== cv && !el.contains(cv)) el.style.display = 'none';
    }
  });
  await page.evaluate(() => window.__rrr.redraw());
}
fs.mkdirSync('out', { recursive: true });
const buf = await page.locator('canvas').first().screenshot();
fs.writeFileSync(OUT, buf);
console.log(`\n== ${LABEL}  ${url}`);
console.log(`   ballroom rect ${JSON.stringify(info.rect)}  size ${JSON.stringify(info.size)}  longAxis ${info.longX ? 'x' : 'z'}${FLIP ? '  (flipped)' : ''}`);
console.log(`   eye ${JSON.stringify(info.eye)} -> ${JSON.stringify(info.target)}   sim ${JSON.stringify(info.sim)}`);
console.log(`   view's own camera was at ${JSON.stringify(info.before.cam)} in space ${info.before.camSpace} <- THIS is whose lights are on`);
console.log(`   grade exposure ${info.exposure} sat ${info.sat} haze ${info.haze}`);
console.log(`   lights (${info.lights.length}) ${info.lights.join('  ')}`);
console.log(`   wrote ${OUT}`);
await b.close();
