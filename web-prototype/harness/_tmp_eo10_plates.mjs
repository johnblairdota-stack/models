// scratch: boot room.ballroom, screenshot, and report the screen rect of each end plate.
import { chromium } from 'playwright';
import net from 'node:net';
import { writeFileSync } from 'node:fs';

const PORT = 5178;
const OUT = process.argv[2] ?? 'C:/Users/John/AppData/Local/Temp/claude/C--Users-John-Documents-Run-Robot-Run-web-prototype/5302cea7-8124-49db-b4fe-f14ded483e05/scratchpad/ballroom.png';
const EXTRA = process.argv[3] ?? '';

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
await page.goto(`http://127.0.0.1:${PORT}/?view=room.ballroom&capture=1${EXTRA}`, { waitUntil: 'load', timeout: 45000 });
await page.waitForFunction(() => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1', null, { timeout: 180000 });
await page.evaluate((n) => window.__rrr.settle(n), 16);

const rects = await page.evaluate(() => {
  const e = window.__rrr.engine, cam = e.camera;
  const W = 1920, H = 1080;
  const out = {};
  for (const m of (e.endPlates ?? [])) {
    m.geometry.computeBoundingBox();
    const bb = m.geometry.boundingBox;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const sx of [bb.min.x, bb.max.x]) for (const sy of [bb.min.y, bb.max.y]) for (const sz of [bb.min.z, bb.max.z]) {
      const v = new (window.THREE ?? m.geometry.constructor) ; // placeholder
      const p = { x: sx, y: sy, z: sz };
      // manual projection: world -> clip
      const wp = [p.x, p.y, p.z, 1];
      const mw = m.matrixWorld.elements;
      const w2 = [
        mw[0] * wp[0] + mw[4] * wp[1] + mw[8] * wp[2] + mw[12],
        mw[1] * wp[0] + mw[5] * wp[1] + mw[9] * wp[2] + mw[13],
        mw[2] * wp[0] + mw[6] * wp[1] + mw[10] * wp[2] + mw[14], 1];
      const vm = cam.matrixWorldInverse.elements, pm = cam.projectionMatrix.elements;
      const vv = [
        vm[0] * w2[0] + vm[4] * w2[1] + vm[8] * w2[2] + vm[12],
        vm[1] * w2[0] + vm[5] * w2[1] + vm[9] * w2[2] + vm[13],
        vm[2] * w2[0] + vm[6] * w2[1] + vm[10] * w2[2] + vm[14], 1];
      const cc = [
        pm[0] * vv[0] + pm[4] * vv[1] + pm[8] * vv[2] + pm[12] * vv[3],
        pm[1] * vv[0] + pm[5] * vv[1] + pm[9] * vv[2] + pm[13] * vv[3],
        pm[2] * vv[0] + pm[6] * vv[1] + pm[10] * vv[2] + pm[14] * vv[3],
        pm[3] * vv[0] + pm[7] * vv[1] + pm[11] * vv[2] + pm[15] * vv[3]];
      const sxp = (cc[0] / cc[3] * 0.5 + 0.5) * W;
      const syp = (1 - (cc[1] / cc[3] * 0.5 + 0.5)) * H;
      x0 = Math.min(x0, sxp); x1 = Math.max(x1, sxp);
      y0 = Math.min(y0, syp); y1 = Math.max(y1, syp);
    }
    out[m.name] = {
      x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0),
      distM: +cam.position.distanceTo(m.getWorldPosition(new m.position.constructor())).toFixed(2),
      planarPatched: m.material.userData.planarPatched ?? null,
      wobble: m.material.userData.planarUniforms?.uEoWobble?.value ?? null,
      rtW: m.material.userData.planarUniforms?.uEoMap?.value?.image?.width ?? null,
      rtH: m.material.userData.planarUniforms?.uEoMap?.value?.image?.height ?? null,
    };
  }
  return out;
});

const buf = await page.screenshot({ clip: { x: 0, y: 0, width: 1920, height: 1080 } });
writeFileSync(OUT, buf);
console.log(JSON.stringify(rects, null, 2));
console.log('wrote', OUT, buf.length, 'bytes');
await browser.close();
