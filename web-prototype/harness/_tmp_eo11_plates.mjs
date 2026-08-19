// estate-owner-11 scratch: for each ballroom end plate, report
//   - the screen rect of its four corners through the LIVE camera
//   - the reflection target size, so RT-texels-per-screen-pixel can be computed
//   - the mirror camera's fov/aspect/position and the distance from the real camera
// Nothing here mutates the scene, so it can be run against any ?extra config.
//
// Usage: node harness/_tmp_eo11_plates.mjs ["&extra=..."]
import { chromium } from 'playwright';
import net from 'node:net';

const PORT = 5178;
const EXTRA = process.argv[2] ?? '';

const portOpen = (p) => new Promise((res) => {
  const s = net.connect(p, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
});
if (!(await portOpen(PORT))) { console.error('vite not running on 5178'); process.exit(3); }

const browser = await chromium.launch({
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization',
    '--disable-frame-rate-limit', '--force-device-scale-factor=1', '--hide-scrollbars'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.routeWebSocket((u) => u.hostname === '127.0.0.1' && u.port === String(PORT), () => {});
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('  [page]', m.text().slice(0, 200)); });
await page.goto(`http://127.0.0.1:${PORT}/?view=room.ballroom&capture=1${EXTRA}`, { waitUntil: 'load', timeout: 45000 });
await page.waitForFunction(() => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1', null, { timeout: 240000 });
await page.evaluate((n) => window.__rrr.settle(n), 16);

const out = await page.evaluate(() => {
  const e = window.__rrr.engine, cam = e.camera;
  // three is not on window; every Vector3 in the scene carries its own constructor.
  const V3 = cam.position.constructor;
  const W = 1920, H = 1080;
  const rows = [];
  for (const m of (e.endPlates ?? [])) {
    m.updateMatrixWorld(true);
    m.geometry.computeBoundingBox();
    const bb = m.geometry.boundingBox;
    const pts = [];
    for (const sx of [bb.min.x, bb.max.x]) {
      for (const sy of [bb.min.y, bb.max.y]) {
        for (const sz of [bb.min.z, bb.max.z]) {
          const v = new V3(sx, sy, sz).applyMatrix4(m.matrixWorld);
          pts.push(v);
        }
      }
    }
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    let cx = 0, cy = 0, cz = 0;
    for (const v of pts) {
      cx += v.x / pts.length; cy += v.y / pts.length; cz += v.z / pts.length;
      const p = v.clone().project(cam);
      const sx = (p.x * 0.5 + 0.5) * W, sy = (-p.y * 0.5 + 0.5) * H;
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx);
      y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    }
    const centre = new V3(cx, cy, cz);
    const rt = m.userData.mirrorRT;
    const mc = m.userData.mirrorCamera;
    rows.push({
      name: m.name,
      centre: [+cx.toFixed(3), +cy.toFixed(3), +cz.toFixed(3)],
      distFromCam: +cam.position.distanceTo(centre).toFixed(3),
      screen: [Math.round(x0), Math.round(y0), Math.round(x1 - x0), Math.round(y1 - y0)],
      screenPx: Math.round((x1 - x0) * (y1 - y0)),
      rt: rt ? [rt.width, rt.height] : null,
      mcam: mc ? { fov: +mc.fov.toFixed(3), aspect: +mc.aspect.toFixed(4), near: +mc.near.toFixed(3),
        pos: mc.position.toArray().map((v) => +v.toFixed(2)) } : null,
      planarPatched: m.material.userData.planarPatched ?? null,
      wobble: m.material.userData.planarUniforms?.uEoWobble?.value ?? null,
      matRough: m.material.roughness,
    });
  }
  return { rows, mirrorMode: e.mirrorMode, camPos: cam.position.toArray().map((v) => +v.toFixed(2)) };
});

console.log(JSON.stringify(out, null, 2));
for (const r of out.rows) {
  if (!r.rt) continue;
  const [sw, sh] = [r.screen[2], r.screen[3]];
  console.log(`${r.name}: screen ${sw}x${sh} px · RT ${r.rt[0]}x${r.rt[1]} · `
    + `RT texels per screen px ${(r.rt[0] / sw).toFixed(2)} x ${(r.rt[1] / sh).toFixed(2)} · dist ${r.distFromCam} m`);
}
await browser.close();
