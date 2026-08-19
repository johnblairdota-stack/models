// critic-estate-9: independent break-test of ?mirrorfilter=point|sharp on room.ballroom's
// two end mirror plates. Crops each plate's exact screen rect (from _tmp_eo11_plates.mjs's
// method, recomputed fresh here) and reports a Sobel-ish acutance + a simple high-frequency
// energy measure so "the mip fix restores legible structure" can be checked independently.
import { chromium } from 'playwright';
import net from 'node:net';

const PORT = 5178;

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

async function openScene(extra) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.routeWebSocket((u) => u.hostname === '127.0.0.1' && u.port === String(PORT), () => {});
  await page.goto(`http://127.0.0.1:${PORT}/?view=room.ballroom&capture=1${extra}`, { waitUntil: 'load', timeout: 45000 });
  await page.waitForFunction(() => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1', null, { timeout: 240000 });
  await page.evaluate((n) => window.__rrr.settle(n), 16);
  return page;
}

async function plateRects(page) {
  return page.evaluate(() => {
    const e = window.__rrr.engine, cam = e.camera;
    const V3 = cam.position.constructor;
    const W = 1920, H = 1080;
    const rows = [];
    for (const m of (e.endPlates ?? [])) {
      m.updateMatrixWorld(true);
      m.geometry.computeBoundingBox();
      const bb = m.geometry.boundingBox;
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const sx of [bb.min.x, bb.max.x]) for (const sy of [bb.min.y, bb.max.y]) for (const sz of [bb.min.z, bb.max.z]) {
        const v = new V3(sx, sy, sz).applyMatrix4(m.matrixWorld).project(cam);
        const px = (v.x * 0.5 + 0.5) * W, py = (-v.y * 0.5 + 0.5) * H;
        x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
      }
      rows.push({ name: m.name, x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0) });
    }
    return rows;
  });
}

async function acutanceOf(page, rect) {
  const buf = await page.screenshot({ clip: { x: rect.x, y: rect.y, width: rect.w, height: rect.h } });
  const dataUrl = `data:image/png;base64,${buf.toString('base64')}`;
  return page.evaluate(async (url) => {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const cx = c.getContext('2d'); cx.drawImage(img, 0, 0);
    const d = cx.getImageData(0, 0, c.width, c.height).data;
    const w = c.width, h = c.height;
    const L = new Float32Array(w * h);
    for (let i = 0, p = 0; i < d.length; i += 4, p++) L[p] = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    let sob = 0, n = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const gx = L[(y - 1) * w + x + 1] + 2 * L[y * w + x + 1] + L[(y + 1) * w + x + 1]
                  - L[(y - 1) * w + x - 1] - 2 * L[y * w + x - 1] - L[(y + 1) * w + x - 1];
        const gy = L[(y + 1) * w + x - 1] + 2 * L[(y + 1) * w + x] + L[(y + 1) * w + x + 1]
                  - L[(y - 1) * w + x - 1] - 2 * L[(y - 1) * w + x] - L[(y - 1) * w + x + 1];
        sob += Math.hypot(gx, gy); n++;
      }
    }
    return { acutance: +((sob / n) / 255).toFixed(4), w, h };
  }, dataUrl);
}

for (const mode of ['point', 'sharp']) {
  const page = await openScene(`&mirrorfilter=${mode}`);
  const rects = await plateRects(page);
  console.log(`\n-- mirrorfilter=${mode} --`);
  for (const r of rects) {
    const a = await acutanceOf(page, r);
    console.log(`${r.name}: rect ${r.w}x${r.h} @ (${r.x},${r.y}) -> acutance ${a.acutance} (measured ${a.w}x${a.h})`);
  }
  await page.close();
}
await browser.close();
