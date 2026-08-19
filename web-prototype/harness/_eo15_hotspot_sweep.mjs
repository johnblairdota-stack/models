// estate-owner-15: sweep bloom / spot-intensity variants on room.ballroom in ONE boot and dump
// crops of the sun hotspot for each, plus top-decile chroma + a local-contrast stat on the
// hotspot region itself (std/mean over 8px blocks — measures whether the mullion grid survives).
// Mirrors the pattern in harness/_eo12_gradesweep.mjs (shares the live :5178 vite server).
import { chromium } from 'playwright';
import net from 'node:net';
import { writeFileSync } from 'node:fs';

const PORT = 5178;
const argv = process.argv.slice(2);
const OUT = 'C:/Users/John/AppData/Local/Temp/claude/C--Users-John-Documents-Run-Robot-Run-web-prototype/5302cea7-8124-49db-b4fe-f14ded483e05/scratchpad';
const SPECS = argv.filter((a) => a.includes(':'));

// hotspot crop region, full 1920x1080 frame (from visual inspection of the default capture)
const HS = { x: 150, y: 480, w: 620, h: 380 };

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
await page.waitForFunction(() => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1', null, { timeout: 300000 });
await page.evaluate((n) => window.__rrr.settle(n), 16);

const base = await page.evaluate(() => {
  const e = window.__rrr.engine, s = e.scene;
  const spots = [];
  s.traverse((o) => { if (o.isSpotLight) spots.push(o); });
  e.__L = { spots };
  e.__S = { spotI: spots.map((l) => l.intensity) };
  return JSON.parse(JSON.stringify(e.pipeline.grade));
});

console.log('label              topChroma  medianL  toeL  black%  clip%   hsStd/mean  hsMeanL');

for (const spec of SPECS) {
  const i = spec.indexOf(':');
  const label = spec.slice(0, i);
  const patch = JSON.parse(spec.slice(i + 1));
  await page.evaluate(({ b, p }) => {
    const e = window.__rrr.engine, s = e.scene, L = e.__L, S = e.__S;
    L.spots.forEach((l, k) => { l.intensity = S.spotI[k] * (p.__sunx ?? 1); });
    const g = { ...b, ...p };
    delete g.__sunx;
    window.__rrr.setGrade(g);
  }, { b: base, p: patch });
  await page.evaluate((n) => window.__rrr.settle(n), 5);
  const buf = await page.screenshot();
  writeFileSync(`${OUT}/sweep-${label}.png`, buf);
  const url = `data:image/png;base64,${buf.toString('base64')}`;

  const r = await page.evaluate(async ({ url, hs }) => {
    const img = new Image(); img.src = url; await img.decode();
    const cv = document.createElement('canvas');
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(img, 0, 0);
    const W = cv.width, H = cv.height;
    const all = cx.getImageData(0, 0, W, H).data;

    const lum = new Float64Array(W * H);
    const px = [];
    let black = 0, clip = 0, n = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = (y * W + x) * 4;
        const L = 0.2126 * all[idx] + 0.7152 * all[idx + 1] + 0.0722 * all[idx + 2];
        lum[y * W + x] = L;
        if ((y & 1) === 0 && (x & 1) === 0) {
          px.push({ L, r: all[idx], b: all[idx + 2] });
          if (L <= 2.6) black++;
          if (L >= 250) clip++;
          n++;
        }
      }
    }
    px.sort((a, b) => a.L - b.L);
    const dec = (k) => {
      const lo = Math.floor(px.length * k / 10), hi = Math.floor(px.length * (k + 1) / 10);
      let L = 0, r2 = 0, b2 = 0;
      for (let j = lo; j < hi; j++) { L += px[j].L; r2 += px[j].r; b2 += px[j].b; }
      const c = hi - lo;
      return { L: L / c, chroma: (r2 / c - b2 / c) / Math.max(0.5, L / c) };
    };
    const out = { top: dec(9).chroma, median: px[px.length >> 1].L, toe: dec(0).L,
      black: black / n * 100, clip: clip / n * 100 };

    // local-contrast stat on the hotspot region: std/mean over 8x8 blocks (small enough to
    // catch a mullion-scale feature, unlike the 32px macro blocks used elsewhere)
    const blocks = [];
    for (let by = 0; by + 8 <= hs.h; by += 8) {
      for (let bx = 0; bx + 8 <= hs.w; bx += 8) {
        let s = 0;
        for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) s += lum[(hs.y + by + y) * W + (hs.x + bx + x)];
        blocks.push(s / 64);
      }
    }
    let m = 0; for (const v of blocks) m += v; m /= blocks.length;
    let v2 = 0; for (const v of blocks) v2 += (v - m) * (v - m);
    out.hsStd = Math.sqrt(v2 / blocks.length);
    out.hsMean = m;
    return out;
  }, { url, hs: HS });

  console.log(label.padEnd(18)
    + r.top.toFixed(3).padStart(9)
    + r.median.toFixed(1).padStart(9)
    + r.toe.toFixed(1).padStart(6)
    + r.black.toFixed(1).padStart(7)
    + r.clip.toFixed(2).padStart(7) + '   '
    + (r.hsStd / Math.max(1, r.hsMean)).toFixed(4).padStart(10)
    + r.hsMean.toFixed(1).padStart(9));
}
await browser.close();
