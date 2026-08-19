// critic-h3-r21 scratch: independent silhouette measurement with swept crops + mask control.
// Usage: node harness/_r21_meas.mjs <img> <cropX0,cropY0,cropX1,cropY1 fractional> [maskOut.png]
import { chromium } from 'playwright';
import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';

const [, , imgPath, cropStr, maskOut] = process.argv;
const [cx0, cy0, cx1, cy1] = cropStr.split(',').map(Number);
const abs = path.isAbsolute(imgPath) ? imgPath : path.resolve(imgPath);
const buf = await readFile(abs);
const dataURL = `data:image/png;base64,${buf.toString('base64')}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
const TTv = Number(process.env.TT || 14);
const out = await page.evaluate(async ({ dataURL, cx0, cy0, cx1, cy1, TT }) => {
  const im = new Image();
  im.src = dataURL;
  await im.decode();
  const W = im.naturalWidth, H = im.naturalHeight;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(im, 0, 0);
  const d = g.getImageData(0, 0, W, H).data;
  const lum = (i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  const sat = (i) => { const r = d[i], gg = d[i + 1], b = d[i + 2]; const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b); return mx === 0 ? 0 : (mx - mn) / mx; };

  // Background model: robust 2D quadratic fit of luma (cyc = smooth vignette/gradient).
  // Coarse grid of cell medians, then IRLS so figure cells (outliers) are downweighted out.
  const GX = 64, GY = 40, cells = [];
  for (let gy = 0; gy < GY; gy++) for (let gx = 0; gx < GX; gx++) {
    const xs = Math.floor(gx / GX * W), xe = Math.floor((gx + 1) / GX * W);
    const ys = Math.floor(gy / GY * H), ye = Math.floor((gy + 1) / GY * H);
    const s = [];
    for (let y = ys; y < ye; y += 3) for (let x = xs; x < xe; x += 3) s.push(lum((y * W + x) * 4));
    s.sort((a, b) => a - b);
    cells.push({ u: (xs + xe) / 2 / W, v: (ys + ye) / 2 / H, L: s[s.length >> 1] });
  }
  // No shape assumption: normalized-convolution inpainting on the coarse grid.
  // Cells that deviate from the smoothed surface are figure -> weight 0 -> background
  // diffuses in from the surrounding backdrop. Handles any smooth cyc or photo vignette.
  const L0 = Float32Array.from(cells.map(c2 => c2.L));
  let wgt = new Float32Array(GX * GY).fill(1);
  let sm = Float32Array.from(L0);
  const SIG = 5.0, RAD = 15;
  const kern = []; for (let k = -RAD; k <= RAD; k++) kern.push(Math.exp(-0.5 * (k / SIG) ** 2));
  const blur = (src, w) => { // separable weighted gaussian -> returns {v,w}
    const t = new Float32Array(GX * GY), tw = new Float32Array(GX * GY);
    for (let y = 0; y < GY; y++) for (let x = 0; x < GX; x++) {
      let a = 0, b = 0;
      for (let k = -RAD; k <= RAD; k++) { const xx = x + k; if (xx < 0 || xx >= GX) continue; const i = y * GX + xx; a += kern[k + RAD] * w[i] * src[i]; b += kern[k + RAD] * w[i]; }
      t[y * GX + x] = a; tw[y * GX + x] = b;
    }
    const o = new Float32Array(GX * GY), ow = new Float32Array(GX * GY);
    for (let y = 0; y < GY; y++) for (let x = 0; x < GX; x++) {
      let a = 0, b = 0;
      for (let k = -RAD; k <= RAD; k++) { const yy = y + k; if (yy < 0 || yy >= GY) continue; const i = yy * GX + x; a += kern[k + RAD] * t[i]; b += kern[k + RAD] * tw[i]; }
      o[y * GX + x] = b > 1e-6 ? a / b : 0; ow[y * GX + x] = b;
    }
    return { v: o, w: ow };
  };
  for (let iter = 0; iter < 10; iter++) {
    const r = blur(L0, wgt); sm = r.v;
    const nw = new Float32Array(GX * GY);
    for (let i = 0; i < GX * GY; i++) {
      const res = L0[i] - sm[i];
      // backdrop cells sit ON the surface; robot cells sit off it (either sign)
      nw[i] = 1 / (1 + Math.pow(Math.abs(res) / 4, 4));
    }
    wgt = nw;
  }
  const BG = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const gx = Math.min(GX - 1.001, Math.max(0, x / W * GX - 0.5)), gy = Math.min(GY - 1.001, Math.max(0, y / H * GY - 0.5));
    const x0 = gx | 0, y0 = gy | 0, fx = gx - x0, fy = gy - y0;
    const a = sm[y0 * GX + x0], b2 = sm[y0 * GX + x0 + 1], c3 = sm[(y0 + 1) * GX + x0], dd = sm[(y0 + 1) * GX + x0 + 1];
    BG[y * W + x] = a * (1 - fx) * (1 - fy) + b2 * fx * (1 - fy) + c3 * (1 - fx) * fy + dd * fx * fy;
  }

  const X0 = Math.round(cx0 * W), X1 = Math.round(cx1 * W), Y0 = Math.round(cy0 * H), Y1 = Math.round(cy1 * H);
  const cw = X1 - X0, ch = Y1 - Y0;
  const mask = new Uint8Array(cw * ch);
  for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) {
    const i = (y * W + x) * 4;
    const dl = Math.abs(lum(i) - BG[y*W+x]);
    if (dl > TT || sat(i) > 0.13) mask[(y - Y0) * cw + (x - X0)] = 1;
  }
  // largest connected component (4-way), iterative
  const lab = new Int32Array(cw * ch).fill(-1);
  let best = -1, bestN = 0, nl = 0;
  const st = new Int32Array(cw * ch);
  for (let p = 0; p < cw * ch; p++) {
    if (!mask[p] || lab[p] >= 0) continue;
    let sp = 0, n = 0; st[sp++] = p; lab[p] = nl;
    while (sp) {
      const q = st[--sp]; n++;
      const qx = q % cw, qy = (q / cw) | 0;
      if (qx > 0 && mask[q - 1] && lab[q - 1] < 0) { lab[q - 1] = nl; st[sp++] = q - 1; }
      if (qx < cw - 1 && mask[q + 1] && lab[q + 1] < 0) { lab[q + 1] = nl; st[sp++] = q + 1; }
      if (qy > 0 && mask[q - cw] && lab[q - cw] < 0) { lab[q - cw] = nl; st[sp++] = q - cw; }
      if (qy < ch - 1 && mask[q + cw] && lab[q + cw] < 0) { lab[q + cw] = nl; st[sp++] = q + cw; }
    }
    if (n > bestN) { bestN = n; best = nl; }
    nl++;
  }
  const fig = new Uint8Array(cw * ch);
  for (let p = 0; p < cw * ch; p++) if (lab[p] === best) fig[p] = 1;

  // bbox
  let bx0 = 1e9, bx1 = -1, by0 = 1e9, by1 = -1;
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) if (fig[y * cw + x]) {
    if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
  }
  const FH = by1 - by0 + 1;

  // width profile + interior daylight, per row, t = (y-by0)/FH
  const rows = [];
  for (let y = by0; y <= by1; y++) {
    let l = -1, r = -1, fill = 0, runs = 0, prev = 0;
    const gaps = [];
    let gapStart = -1;
    for (let x = 0; x < cw; x++) {
      const v = fig[y * cw + x];
      if (v) { if (l < 0) l = x; r = x; fill++; if (!prev) runs++; if (gapStart >= 0) { gaps.push(x - gapStart); gapStart = -1; } }
      else if (l >= 0) { if (gapStart < 0) gapStart = x; }
      prev = v;
    }
    const span = r - l + 1;
    rows.push({ t: (y - by0) / (FH - 1), span, fill, runs, daylight: span - fill, gaps });
  }
  // FIGURE-ONLY tone by height decile, normalised by the fitted backdrop level.
  const tone = [];
  for (let k = 0; k < 10; k++) {
    const ys = by0 + Math.floor(k / 10 * FH), ye = by0 + Math.floor((k + 1) / 10 * FH);
    const v = [], bgv = [];
    for (let y = ys; y < ye; y++) for (let x = 0; x < cw; x++) if (fig[y * cw + x]) {
      const i = ((y + Y0) * W + (x + X0)) * 4; v.push(lum(i)); bgv.push(BG[(y + Y0) * W + (x + X0)]);
    }
    if (!v.length) { tone.push(null); continue; }
    v.sort((a, b) => a - b);
    const bgm = bgv.sort((a, b) => a - b)[bgv.length >> 1];
    tone.push({ k, n: v.length, p10: Math.round(v[(v.length * 0.1) | 0]), p50: Math.round(v[v.length >> 1]),
      p90: Math.round(v[(v.length * 0.9) | 0]), bg: Math.round(bgm),
      relP50: +(v[v.length >> 1] / bgm).toFixed(3), contrast: Math.round(v[(v.length * 0.9) | 0] - v[(v.length * 0.1) | 0]) });
  }
  // coarse ASCII occupancy of the WHOLE image (pre-CC mask over full frame) for layout sanity
  const AW = 78, AH = 30;
  const art = [];
  for (let ay = 0; ay < AH; ay++) {
    let line = '';
    for (let ax = 0; ax < AW; ax++) {
      let hit = 0, tot = 0;
      const xs = Math.floor(ax / AW * W), xe = Math.floor((ax + 1) / AW * W);
      const ys = Math.floor(ay / AH * H), ye = Math.floor((ay + 1) / AH * H);
      for (let y = ys; y < ye; y += 2) for (let x = xs; x < xe; x += 2) {
        tot++; const i = (y * W + x) * 4;
        if (Math.abs(lum(i) - BG[y*W+x]) > 14 || sat(i) > 0.13) hit++;
      }
      const f = tot ? hit / tot : 0;
      line += f > 0.6 ? '#' : f > 0.25 ? '+' : f > 0.05 ? '.' : ' ';
    }
    art.push(line);
  }
  return { W, H, cw, ch, bx0, bx1, by0, by1, FH, rows, figCount: bestN, nComp: nl, art, tone };
}, { dataURL, cx0, cy0, cx1, cy1, TT: TTv });

// summary
const R = out.rows;
const at = (t) => { const i = Math.min(R.length - 1, Math.max(0, Math.round(t * (R.length - 1)))); return R[i]; };
const H = out.FH;
const maxSpan = Math.max(...R.map(r => r.span));
const maxAt = R[R.map(r => r.span).indexOf(maxSpan)].t;
console.log(`img=${path.basename(abs)} crop=[${cropStr}]  imgWH=${out.W}x${out.H} comps=${out.nComp}`);
console.log(`  figure bbox x[${out.bx0}..${out.bx1}] y[${out.by0}..${out.by1}]  H=${H}px  W=${out.bx1 - out.bx0 + 1}px`);
console.log(`  MAX SPAN / H = ${(maxSpan / H).toFixed(4)}  at t=${maxAt.toFixed(3)}`);
for (const t of [0.10, 0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80, 0.90]) {
  const r = at(t);
  console.log(`  t=${t.toFixed(2)} span/H=${(r.span / H).toFixed(4)} fill/H=${(r.fill / H).toFixed(4)} daylight/H=${(r.daylight / H).toFixed(4)} dayFrac=${(r.daylight / r.span).toFixed(3)} runs=${r.runs}`);
}
// arm band aggregate t in [0.28,0.72]
const band = R.filter(r => r.t >= 0.28 && r.t <= 0.72);
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
console.log(`  ARM BAND t0.28-0.72: median span/H=${med(band.map(r => r.span / H)).toFixed(4)} median dayFrac=${med(band.map(r => r.daylight / r.span)).toFixed(3)} median runs=${med(band.map(r => r.runs))} maxRuns=${Math.max(...band.map(r => r.runs))}`);
const allGaps = band.flatMap(r => r.gaps.map(g => g / H)).filter(g => g > 0.004);
allGaps.sort((a, b) => a - b);
console.log(`  interior gaps in band (>0.004H): n=${allGaps.length} median=${(med(allGaps) || 0).toFixed(4)}H p90=${(allGaps[Math.floor(allGaps.length * 0.9)] || 0).toFixed(4)}H max=${(allGaps[allGaps.length - 1] || 0).toFixed(4)}H`);
out.tone.filter(Boolean).forEach(o=>console.log(`  TONE decile${o.k} p10=${o.p10} p50=${o.p50} p90=${o.p90} bg=${o.bg} p50/bg=${o.relP50} contrast=${o.contrast}`));
if (process.env.ART) out.art.forEach((l,i)=>console.log(String(i).padStart(2)+"|"+l+"|"));
await browser.close();
