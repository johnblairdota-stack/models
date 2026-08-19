// critic-h3-r21: mint-cap / eye colour probe. Finds mint by hue selection, then re-samples the
// WHOLE cap bbox (green and non-green alike) so the answer is not biased by the selector.
import { chromium } from 'playwright';
import path from 'node:path';
import { readFile } from 'node:fs/promises';

const [, , imgPath, mode] = process.argv;
const abs = path.isAbsolute(imgPath) ? imgPath : path.resolve(imgPath);
const buf = await readFile(abs);
const dataURL = `data:image/png;base64,${buf.toString('base64')}`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
const out = await page.evaluate(async ({ dataURL, mode }) => {
  const im = new Image(); im.src = dataURL; await im.decode();
  const W = im.naturalWidth, H = im.naturalHeight;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(im, 0, 0);
  const d = g.getImageData(0, 0, W, H).data;
  const px = (x, y) => { const i = ((y|0) * W + (x|0)) * 4; return [d[i], d[i + 1], d[i + 2]]; };
  const L = ([r, gg, b]) => 0.2126 * r + 0.7152 * gg + 0.0722 * b;

  // 1. mint selection: green is max channel by a clear margin, mid luma
  const mint = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = px(x, y);
    if (p[1] > p[0] + 6 && p[1] >= p[2] && L(p) > 40 && L(p) < 235) mint.push([x, y, ...p]);
  }
  // cluster by 2D grid to find the biggest cap blobs
  const cellSz = Math.round(W / 60);
  const bins = new Map();
  for (const m of mint) { const k = `${(m[0] / cellSz) | 0},${(m[1] / cellSz) | 0}`; bins.set(k, (bins.get(k) || 0) + 1); }
  const top = [...bins.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const caps = [];
  for (const [k, n] of top) {
    const [gx, gy] = k.split(',').map(Number);
    const cx = Math.round((gx + 0.5) * cellSz), cy = Math.round((gy + 0.5) * cellSz);
    if (caps.some(q => Math.hypot(q.cx - cx, q.cy - cy) < cellSz * 2.5)) continue;
    caps.push({ cx, cy, n });
  }
  const rep = [];
  for (const cap of caps.slice(0, 3)) {
    const R = Math.round(cellSz * 1.2);
    const all = [], sel = [];
    for (let y = Math.max(0, cap.cy - R); y < Math.min(H, cap.cy + R); y++)
      for (let x = Math.max(0, cap.cx - R); x < Math.min(W, cap.cx + R); x++) {
        const p = px(x, y); all.push(p);
        if (p[1] > p[0] + 6 && p[1] >= p[2]) sel.push(p);
      }
    const mean = (a) => [0, 1, 2].map(i => a.reduce((s, p) => s + p[i], 0) / a.length);
    const lums = all.map(L).sort((a, b) => a - b);
    const mA = mean(all), mS = sel.length ? mean(sel) : [0, 0, 0];
    // local background: median luma of a ring well outside the cap
    const ring = [];
    for (let a = 0; a < 360; a += 3) { const rr = R * 3.2; const x = Math.round(cap.cx + rr * Math.cos(a * Math.PI / 180)), y = Math.round(cap.cy + rr * Math.sin(a * Math.PI / 180)); if (x > 0 && y > 0 && x < W && y < H) ring.push(L(px(x, y))); }
    ring.sort((a, b) => a - b);
    // crack evidence: fraction of cap pixels notably darker than the cap median, and how
    // many dark runs cross the cap (a cracked cap has thin dark lines through it)
    const capMed = lums[lums.length >> 1];
    let darkFrac = 0; for (const l of lums) if (l < capMed - 22) darkFrac++;
    rep.push({
      cx: cap.cx, cy: cap.cy, n: cap.n, R,
      meanAll: mA.map(v => Math.round(v)), meanMint: mS.map(v => Math.round(v)),
      gMinusR_all: +(mA[1] - mA[0]).toFixed(1), gMinusR_mint: +(mS[1] - mS[0]).toFixed(1),
      capLuma: +capMed.toFixed(1), spread: +(lums[Math.floor(lums.length * 0.97)] - lums[Math.floor(lums.length * 0.03)]).toFixed(0),
      p05: +lums[Math.floor(lums.length * 0.05)].toFixed(0), p95: +lums[Math.floor(lums.length * 0.95)].toFixed(0),
      bgLuma: +(ring[ring.length >> 1] || 0).toFixed(1),
      capOverBg: +(capMed / (ring[ring.length >> 1] || 1)).toFixed(3),
      darkFrac: +(darkFrac / lums.length).toFixed(3),
    });
  }
  // 2. red-eye probe: strongly red pixels
  const reds = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const p = px(x, y); if (p[0] > p[1] + 30 && p[0] > p[2] + 30 && p[0] > 70) reds.push([x, y, ...p]); }
  // 3. blue/cyan emissive probe
  const blues = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const p = px(x, y); if (p[2] > p[0] + 22 && p[2] > 60) blues.push([x, y, ...p]); }
  const summar = (arr) => {
    if (!arr.length) return { n: 0 };
    const mean = [0, 1, 2].map(i => Math.round(arr.reduce((s, p) => s + p[i + 2], 0) / arr.length));
    const ys = arr.map(a => a[1]).sort((a, b) => a - b), xs = arr.map(a => a[0]).sort((a, b) => a - b);
    return { n: arr.length, mean, yMed: ys[ys.length >> 1], yMedFrac: +(ys[ys.length >> 1] / H).toFixed(3), xMedFrac: +(xs[xs.length >> 1] / W).toFixed(3), yMinFrac: +(ys[0] / H).toFixed(3) };
  };
  // 4. global tone: luma histogram of the figure-ish (non-background) darkest tail
  const allL = []; for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) allL.push(L(px(x, y)));
  allL.sort((a, b) => a - b);
  const q = (f) => Math.round(allL[Math.floor(allL.length * f)]);
  return { W, H, caps: rep, reds: summar(reds), blues: summar(blues), tone: { p01: q(0.01), p05: q(0.05), p10: q(0.10), p25: q(0.25), p50: q(0.50), p75: q(0.75), p95: q(0.95) } };
}, { dataURL, mode });
console.log(path.basename(abs), `${out.W}x${out.H}`);
for (const c of out.caps) console.log('  CAP@', c.cx, c.cy, 'n=' + c.n, 'meanAll', c.meanAll.join(','), 'g-r(all)', c.gMinusR_all, '| meanMint', c.meanMint.join(','), 'g-r(mint)', c.gMinusR_mint, '| capLuma', c.capLuma, 'bg', c.bgLuma, 'cap/bg', c.capOverBg, 'spread', c.spread, 'p05-p95', c.p05 + '-' + c.p95, 'darkFrac', c.darkFrac);
console.log('  RED px  ', JSON.stringify(out.reds));
console.log('  BLUE px ', JSON.stringify(out.blues));
console.log('  TONE    ', JSON.stringify(out.tone));
await browser.close();
