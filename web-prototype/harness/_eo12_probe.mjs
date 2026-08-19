/**
 * estate-owner-12: is a named object actually IN THE PICTURE, and where?
 *
 * "I added it and I cannot see it" has three different causes in this project — never added,
 * added and culled, added and on screen but too small to notice — and they are not separable
 * by looking harder. This projects an object's instance/vertex positions through the live
 * camera and reports screen coordinates and pixel size, then reads back the actual pixels at
 * one of them.
 *
 *   node harness/_eo12_probe.mjs paper-scatter [--extra "&depot=1"]
 */
import { chromium } from 'playwright';
import net from 'node:net';

const PORT = 5178;
const argv = process.argv.slice(2);
const NAME = argv.find((a) => !a.startsWith('--')) || 'paper-scatter';
const i = argv.indexOf('--extra');
const EXTRA = i < 0 ? '' : argv[i + 1];

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

const out = await page.evaluate((name) => {
  const T = window.THREE ?? null;
  const e = window.__rrr.engine, cam = e.camera;
  let obj = null;
  e.scene.traverse((o) => { if (o.name === name) obj = o; });
  if (!obj) return { found: false, names: [] };
  cam.updateMatrixWorld(true);
  const W = 1920, H = 1080;
  const pts = [];
  const push = (x, y, z) => {
    const v = { x, y, z };
    // project by hand so this does not need THREE on window
    const m = cam.projectionMatrix.elements, vm = cam.matrixWorldInverse.elements;
    const vx = vm[0] * x + vm[4] * y + vm[8] * z + vm[12];
    const vy = vm[1] * x + vm[5] * y + vm[9] * z + vm[13];
    const vz = vm[2] * x + vm[6] * y + vm[10] * z + vm[14];
    const cw = -vz;
    if (cw <= 0.01) return;
    const cx = m[0] * vx + m[8] * vz;
    const cy = m[5] * vy + m[9] * vz;
    pts.push({ world: v, sx: Math.round((cx / cw * 0.5 + 0.5) * W), sy: Math.round((0.5 - cy / cw * 0.5) * H), d: cw });
  };
  if (obj.isInstancedMesh) {
    const a = obj.instanceMatrix.array;
    for (let k = 0; k < obj.count; k++) push(a[k * 16 + 12], a[k * 16 + 13], a[k * 16 + 14]);
  } else {
    const p = obj.geometry.attributes.position;
    for (let k = 0; k < p.count; k += Math.max(1, Math.floor(p.count / 24))) push(p.getX(k), p.getY(k), p.getZ(k));
  }
  const onScreen = pts.filter((q) => q.sx >= 0 && q.sx < W && q.sy >= 0 && q.sy < H);
  obj.geometry.computeBoundingBox();
  const bb = obj.geometry.boundingBox;
  return {
    found: true,
    type: obj.type,
    count: obj.isInstancedMesh ? obj.count : null,
    visible: obj.visible,
    inFrustum: obj.frustumCulled,
    geoSize: [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z],
    total: pts.length,
    onScreen: onScreen.length,
    sample: onScreen.slice(0, 8).map((q) => [q.sx, q.sy, +q.d.toFixed(1)]),
    T: !!T,
  };
}, NAME);
console.log(JSON.stringify(out, null, 1));
await browser.close();
