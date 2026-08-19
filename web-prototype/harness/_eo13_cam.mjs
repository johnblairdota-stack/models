/**
 * estate-owner-13: WHAT IS THIS FRAME ACTUALLY POINTED AT?
 *
 * `critic-estate-10`'s #1 hate is a COMPOSITION hate — "our frame is ~45% ceiling, the bar
 * (refs/bf1/bf1-ballroom-01.png) is a high overlook that is mostly floor". Nobody had a number
 * for that, only an eyeball. This gives one, and it is a number about the CAMERA rather than
 * about pixels, so it cannot be confounded by lighting, grade or clutter:
 *
 *   for a subsampled grid of pixels, cast the pixel's ray out of the camera and ask which face
 *   of the room's own bounding box (x -13..13, y 0..9.6, z -8..8) it leaves through.
 *
 * FLOOR / CEILING / WALL are then exact fractions of the frame, independent of what is standing
 * in the way. Props sit on the floor and occupy floor-directed rays, which is the right
 * accounting: a crate is floor-zone content, not ceiling.
 *
 * It also boots the view ONCE and moves the camera live, so a dozen candidate framings cost one
 * cold shader compile instead of a dozen.
 *
 * ⚠ WHAT A LIVE-MOVED CAMERA CANNOT TELL YOU, stated so nobody files a look verdict from it:
 *   1. The floor's planar reflection AND both end plates are rendered ONCE at build time, fitted
 *      to the camera that existed then. Move the camera live and those three surfaces keep the
 *      OLD camera's reflection — visibly wrong, and wrong in the most-looked-at surface in the
 *      room. Use this to CHOOSE a framing; then hard-code it and re-capture with shoot.mjs.
 *   2. Volumetric shafts and pool decals are placed for the shipping camera.
 * The box fractions below are pure geometry and are NOT subject to either caveat.
 *
 *   node harness/_eo13_cam.mjs                       # the named cameras in CAMS
 *   node harness/_eo13_cam.mjs --shots               # ...and write a PNG per camera
 *   node harness/_eo13_cam.mjs --cams "try:11,6.6,6.4,-4.5,0.9,-3,62"
 */
import { chromium } from 'playwright';
import net from 'node:net';
import { writeFileSync } from 'node:fs';

const PORT = 5178;
const argv = process.argv.slice(2);
const opt = (n, d = null) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };
const SHOTS = argv.includes('--shots');
const OUT = opt('dir', 'C:/Users/John/AppData/Local/Temp/claude/C--Users-John-Documents-Run-Robot-Run-web-prototype/5302cea7-8124-49db-b4fe-f14ded483e05/scratchpad');
const EXTRA = opt('extra', '');

// name: [x, y, z, tx, ty, tz, fov]
const CAMS = {
  // the shipping r10 camera, verbatim from room-ballroom.js
  r10: [7.4, 1.62, 6.1, -5.2, 4.1, -6.4, 66],
};
for (const spec of (opt('cams') || '').split(';').filter(Boolean)) {
  const [name, nums] = spec.split(':');
  CAMS[name] = nums.split(',').map(Number);
}

const portOpen = (p) => new Promise((res) => {
  const s = net.connect(p, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
});
if (!(await portOpen(PORT))) { console.error('vite not running on 5178'); process.exit(3); }

const browser = await chromium.launch({
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--disable-frame-rate-limit',
    '--force-device-scale-factor=1', '--hide-scrollbars'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.routeWebSocket((u) => u.hostname === '127.0.0.1' && u.port === String(PORT), () => {});
await page.goto(`http://127.0.0.1:${PORT}/?view=room.ballroom&capture=1${EXTRA}`, { waitUntil: 'load', timeout: 45000 });
await page.waitForFunction(() => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1', null, { timeout: 300000 });
await page.evaluate((n) => window.__rrr.settle(n), 12);

console.log('cam        floor%  ceil%   wallWIN wallMIR wallEND wallNEAR  corners  pitch°  fov');
for (const [name, c] of Object.entries(CAMS)) {
  const stats = await page.evaluate((cam) => {
    const [x, y, z, tx, ty, tz, fov] = cam;
    const e = window.__rrr.engine, k = e.camera;
    k.position.set(x, y, z);
    k.fov = fov;
    k.updateProjectionMatrix();
    k.lookAt(tx, ty, tz);
    k.updateMatrixWorld(true);

    const R = { x0: -13, x1: 13, y0: 0, y1: 9.6, z0: -8, z1: 8 };
    const W = 1920, H = 1080, STEP = 4;
    const aspect = W / H;
    const th = Math.tan(fov * Math.PI / 360);
    const m = k.matrixWorld.elements;
    const bx = [m[0], m[1], m[2]], by = [m[4], m[5], m[6]], bz = [m[8], m[9], m[10]];
    const counts = { floor: 0, ceil: 0, win: 0, mir: 0, end: 0, near: 0, out: 0 };
    let n = 0;
    for (let py = 0; py < H; py += STEP) {
      for (let px = 0; px < W; px += STEP) {
        const ndcx = ((px + 0.5) / W) * 2 - 1;
        const ndcy = 1 - ((py + 0.5) / H) * 2;
        const cx = ndcx * th * aspect, cy = ndcy * th, cz = -1;
        const dx = bx[0] * cx + by[0] * cy + bz[0] * cz;
        const dy = bx[1] * cx + by[1] * cy + bz[1] * cz;
        const dz = bx[2] * cx + by[2] * cy + bz[2] * cz;
        // first exit face of the room box from a point inside it
        let best = Infinity, face = 'out';
        const hit = (t, f) => { if (t > 1e-6 && t < best) { best = t; face = f; } };
        if (dy < 0) hit((R.y0 - y) / dy, 'floor'); else if (dy > 0) hit((R.y1 - y) / dy, 'ceil');
        if (dx < 0) hit((R.x0 - x) / dx, 'win'); else if (dx > 0) hit((R.x1 - x) / dx, 'mir');
        if (dz < 0) hit((R.z0 - z) / dz, 'end'); else if (dz > 0) hit((R.z1 - z) / dz, 'near');
        counts[face]++; n++;
      }
    }
    // do the room's eight corners land in frame? (a crude "can you read the box" check)
    const pm = k.projectionMatrix.elements, vm = k.matrixWorldInverse.elements;
    let corners = 0;
    for (const X of [R.x0, R.x1]) for (const Y of [R.y0, R.y1]) for (const Z of [R.z0, R.z1]) {
      const vx = vm[0] * X + vm[4] * Y + vm[8] * Z + vm[12];
      const vy = vm[1] * X + vm[5] * Y + vm[9] * Z + vm[13];
      const vz = vm[2] * X + vm[6] * Y + vm[10] * Z + vm[14];
      const cw = -vz;
      if (cw <= 0.01) continue;
      const sx = ((pm[0] * vx + pm[8] * vz) / cw * 0.5 + 0.5) * W;
      const sy = (0.5 - (pm[5] * vy + pm[9] * vz) / cw * 0.5) * H;
      if (sx >= 0 && sx < W && sy >= 0 && sy < H) corners++;
    }
    const fwd = [tx - x, ty - y, tz - z];
    const fl = Math.hypot(fwd[0], fwd[1], fwd[2]);
    return {
      pct: Object.fromEntries(Object.entries(counts).map(([kk, v]) => [kk, +(100 * v / n).toFixed(1)])),
      corners,
      pitch: +(Math.asin(fwd[1] / fl) * 180 / Math.PI).toFixed(1),
    };
  }, c);

  if (SHOTS) {
    await page.evaluate((nn) => window.__rrr.settle(nn), 8);
    writeFileSync(`${OUT}/eo13-cam-${name}.png`, await page.screenshot());
  }
  const p = stats.pct;
  console.log(
    name.padEnd(10)
    + String(p.floor).padEnd(8) + String(p.ceil).padEnd(8)
    + String(p.win).padEnd(8) + String(p.mir).padEnd(8)
    + String(p.end).padEnd(8) + String(p.near).padEnd(10)
    + String(stats.corners).padEnd(9) + String(stats.pitch).padEnd(8) + c[6]);
}
await browser.close();
