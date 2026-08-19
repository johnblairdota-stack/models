// scratch: render the ballroom THROUGH each end plate's own mirror camera, full frame, so
// what the plate reflects can be SEEN and named instead of squinted at across 71 px.
// The main camera is temporarily driven to the mirror camera's transform + projection, so
// the full graded pipeline runs and the image is directly comparable with the room capture.
import { chromium } from 'playwright';
import net from 'node:net';
import { writeFileSync } from 'node:fs';

const PORT = 5178;
const DIR = process.argv[2] ?? 'C:/Users/John/AppData/Local/Temp/claude/C--Users-John-Documents-Run-Robot-Run-web-prototype/5302cea7-8124-49db-b4fe-f14ded483e05/scratchpad';

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
await page.goto(`http://127.0.0.1:${PORT}/?view=room.ballroom&capture=1`, { waitUntil: 'load', timeout: 45000 });
await page.waitForFunction(() => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1', null, { timeout: 180000 });
await page.evaluate((n) => window.__rrr.settle(n), 12);

for (const name of ['end-mirror.l', 'end-mirror.r']) {
  const info = await page.evaluate((nm) => {
    const e = window.__rrr.engine, cam = e.camera;
    const m = e.endPlates.find((x) => x.name === nm);
    const mc = m.userData.mirrorCamera;
    if (!e.__savedCam) {
      e.__savedCam = { pos: cam.position.clone(), q: cam.quaternion.clone(), fov: cam.fov, aspect: cam.aspect, near: cam.near, far: cam.far };
    }
    for (const q of e.endPlates) q.visible = false;
    cam.position.copy(mc.position);
    cam.quaternion.copy(mc.quaternion);
    cam.fov = mc.fov; cam.aspect = mc.aspect; cam.near = mc.near; cam.far = mc.far;
    cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
    return { pos: cam.position.toArray().map((v) => +v.toFixed(2)), fov: +mc.fov.toFixed(2), aspect: +mc.aspect.toFixed(3), near: +mc.near.toFixed(2) };
  }, name);
  await page.evaluate((n) => window.__rrr.settle(n), 8);
  const buf = await page.screenshot({ clip: { x: 0, y: 0, width: 1920, height: 1080 } });
  const file = `${DIR}/mcam_${name.replace(/[^a-z0-9]/gi, '_')}.png`;
  writeFileSync(file, buf);
  console.log(name, JSON.stringify(info), '->', file, buf.length, 'bytes');
}

await page.evaluate(() => {
  const e = window.__rrr.engine, cam = e.camera, s = e.__savedCam;
  cam.position.copy(s.pos); cam.quaternion.copy(s.q);
  cam.fov = s.fov; cam.aspect = s.aspect; cam.near = s.near; cam.far = s.far;
  cam.updateProjectionMatrix();
  for (const q of e.endPlates) q.visible = true;
});

await browser.close();
