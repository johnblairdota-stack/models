// scratch: drive the main camera to end-mirror.l's mirror camera, then hide each scene
// child in turn and report which one owns the pixels of the grey mass. A raycast would
// need THREE in the page; hiding is instrument-free and cannot be fooled by a bad grid.
import { chromium } from 'playwright';
import net from 'node:net';

const PORT = 5178;
const PLATE = process.argv[2] ?? 'end-mirror.l';
const PROBES = JSON.parse(process.argv[3] ?? '[[1400,800],[1700,500],[900,950],[1250,300]]');

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

await page.evaluate((nm) => {
  const e = window.__rrr.engine, cam = e.camera;
  const m = e.endPlates.find((x) => x.name === nm);
  const mc = m.userData.mirrorCamera;
  for (const q of e.endPlates) q.visible = false;
  cam.position.copy(mc.position); cam.quaternion.copy(mc.quaternion);
  cam.fov = mc.fov; cam.aspect = mc.aspect; cam.near = mc.near; cam.far = mc.far;
  cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
  window.__probe = {
    read(pts) {
      const src = e.renderer.domElement;
      const cv = document.createElement('canvas'); cv.width = src.width; cv.height = src.height;
      cv.getContext('2d').drawImage(src, 0, 0);
      const ctx = cv.getContext('2d');
      return pts.map(([x, y]) => { const d = ctx.getImageData(x, y, 1, 1).data; return [d[0], d[1], d[2]]; });
    },
  };
}, PLATE);

await page.evaluate((n) => window.__rrr.settle(n), 6);
const base = await page.evaluate((pts) => window.__probe.read(pts), PROBES);
console.log('baseline', JSON.stringify(base));

const names = await page.evaluate(() => {
  const S = window.__rrr.engine.scene;
  return S.children.map((c, i) => `${i}:${c.name || c.type}`);
});

for (let i = 0; i < names.length; i++) {
  const vis = await page.evaluate((i) => {
    const c = window.__rrr.engine.scene.children[i];
    if (!c.visible) return false;
    c.visible = false; return true;
  }, i);
  if (!vis) continue;
  await page.evaluate((n) => window.__rrr.settle(n), 3);
  const now = await page.evaluate((pts) => window.__probe.read(pts), PROBES);
  const changed = now.map((c, k) => Math.abs(c[0] - base[k][0]) + Math.abs(c[1] - base[k][1]) + Math.abs(c[2] - base[k][2]));
  if (changed.some((d) => d > 12)) console.log(`  ${names[i].padEnd(28)} delta ${JSON.stringify(changed)}  now ${JSON.stringify(now)}`);
  await page.evaluate((i) => { window.__rrr.engine.scene.children[i].visible = true; }, i);
}

await browser.close();
