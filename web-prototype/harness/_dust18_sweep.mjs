// dust-18: the SHIPPING value of `?dust`, measured by BOOTING each candidate.
//
// ⚠ IT CANNOT BE A LIVE SWEEP AND THAT IS THE POINT OF A SEPARATE TOOL. `bakeDust` is applied
// in the BAKER, so it exists only in the texture; nothing on the material can move it after the
// bake. One page load per candidate, which is also what makes the numbers trustworthy — each is
// a real boot of the real value rather than an approximation of it.
//
//   node harness/_dust18_sweep.mjs --cam eye.door 0 0.35 0.55 0.75
import { chromium } from 'playwright';
import net from 'node:net';
import { writeFileSync, mkdirSync } from 'node:fs';

const PORT = 5178;
const argv = process.argv.slice(2);
const opt = (n, d = null) => (argv.indexOf('--' + n) >= 0 ? argv[argv.indexOf('--' + n) + 1] : d);
const CAM = opt('cam', 'eye.door');
const OUT = opt('out');
const VALS = argv.filter((a) => !a.startsWith('--') && !Number.isNaN(Number(a)));
const portOpen = (p) => new Promise((res) => {
  const s = net.connect(p, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
});
if (!(await portOpen(PORT))) { console.error('vite not running on 5178'); process.exit(3); }
if (OUT) mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--disable-frame-rate-limit',
    '--force-device-scale-factor=1', '--hide-scrollbars'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.routeWebSocket((u) => u.hostname === '127.0.0.1' && u.port === String(PORT), () => {});
for (const v of VALS) {
  await page.goto(`http://127.0.0.1:${PORT}/?view=room.ballroom&capture=1&cam=${encodeURIComponent(CAM)}&${opt('param', 'dust')}=${v}`,
    { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1',
    null, { timeout: 600000 });
  if (await page.evaluate(() => document.body.dataset.rrrError === '1')) { console.log(`dust ${v}\tERROR`); continue; }
  await page.evaluate((n) => window.__rrr.settle(n), 16);
  const buf = await page.screenshot({ type: 'png' });
  if (OUT) writeFileSync(`${OUT}/dust${v}.png`, buf);
  const r = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    const cv = document.createElement('canvas');
    cv.width = c.width; cv.height = c.height;
    const cx = cv.getContext('2d');
    cx.drawImage(c, 0, 0);
    const d = cx.getImageData(0, 0, cv.width, cv.height).data;
    const px = [];
    for (let i = 0; i < d.length; i += 4) {
      px.push([0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2], d[i], d[i + 1], d[i + 2]]);
    }
    px.sort((a, b) => a[0] - b[0]);
    const n = px.length, lad = [];
    for (let k = 0; k < 10; k++) {
      const s = px.slice(Math.floor(n * k / 10), Math.floor(n * (k + 1) / 10));
      const m = (j) => s.reduce((t, p) => t + p[j], 0) / s.length;
      lad.push(+((m(1) - m(3)) / m(0)).toFixed(2));
    }
    return { med: +px[Math.floor(n / 2)][0].toFixed(1), lad,
      calls: window.__rrr.engine.renderer.info.render.calls };
  });
  console.log(`dust ${String(v).padEnd(5)} med ${String(r.med).padStart(5)}  ${r.lad.map((x) => String(x.toFixed(2)).padStart(5)).join(' ')}  calls ${r.calls}`);
}
await browser.close();
