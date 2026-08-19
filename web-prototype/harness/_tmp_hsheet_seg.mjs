// Critic tool: segment the FOUR figures in hunter.sheet, report per-figure geometry + grime.
//
// TWO TOOLING TRAPS THIS AVOIDS, both of which produced wrong numbers on this view:
//  1. measure.mjs pairs figures BY POSITION and MERGES adjacent ones — it reports 2 figures
//     for this 4-figure view while printing a full plausible table. Nothing here uses it.
//  2. Level-thresholding against a background model fails: the studio cyc carries a large
//     smooth RADIAL HOTSPOT behind the figures (plus a ~16-level horizontal vignette), so
//     "deviation from background" fires on a huge elliptical blob of empty backdrop.
//     Instead we segment on LOCAL GRADIENT: the backdrop is smooth everywhere including the
//     hotspot and the soft contact shadows, the figures have hard edges. Flood-fill the smooth
//     region inward from the frame border; whatever is not reached is a figure.
//
// Usage: node _tmp_hsheet_seg.mjs <imgWeatherOn> [imgWeatherOff] [maskOut.png]
import { toDataURL, openCanvasPage } from './imglib.mjs';
import { writeFileSync } from 'node:fs';

const [, , imgA, imgB, maskOut] = process.argv;
const { browser, page } = await openCanvasPage();
const urlA = await toDataURL(imgA);
const urlB = imgB ? await toDataURL(imgB) : null;

const out = await page.evaluate(async ({ urlA, urlB }) => {
  const load = (u) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = u; });
  const imA = await load(urlA);
  const W = imA.width, H = imA.height;
  const grab = (im) => {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(im, 0, 0);
    return cx.getImageData(0, 0, W, H).data;
  };
  const A = grab(imA);
  const B = urlB ? grab(await load(urlB)) : null;

  const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const L = new Float32Array(W * H);
  const C = new Float32Array(W * H); // chroma — catches mint/red/blue against neutral cyc
  for (let i = 0, p = 0; p < W * H; p++, i += 4) {
    L[p] = lum(A[i], A[i + 1], A[i + 2]);
    C[p] = Math.abs(A[i] - A[i + 1]) + Math.abs(A[i + 1] - A[i + 2]);
  }

  // Sobel gradient magnitude on luma.
  const G = new Float32Array(W * H);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const p = y * W + x;
    const gx = -L[p - W - 1] - 2 * L[p - 1] - L[p + W - 1] + L[p - W + 1] + 2 * L[p + 1] + L[p + W + 1];
    const gy = -L[p - W - 1] - 2 * L[p - W] - L[p - W + 1] + L[p + W - 1] + 2 * L[p + W] + L[p + W + 1];
    G[p] = Math.abs(gx) + Math.abs(gy);
  }

  const GT = 14;      // gradient threshold: backdrop hotspot/vignette/shadow are all far below
  const CT = 12;      // chroma threshold: coloured body pixels are never backdrop
  const blocked = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p++) blocked[p] = (G[p] > GT || C[p] > CT) ? 1 : 0;

  // Flood the smooth backdrop inward from the frame border.
  const seen = new Uint8Array(W * H);
  const stack = [];
  for (let x = 0; x < W; x++) { stack.push(x); stack.push((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { stack.push(y * W); stack.push(y * W + W - 1); }
  while (stack.length) {
    const p = stack.pop();
    if (p < 0 || p >= W * H || seen[p] || blocked[p]) continue;
    seen[p] = 1;
    const x = p % W;
    if (x > 0) stack.push(p - 1);
    if (x < W - 1) stack.push(p + 1);
    if (p >= W) stack.push(p - W);
    if (p < W * (H - 1)) stack.push(p + W);
  }
  // figure mask = everything the backdrop flood could not reach
  const fg = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p++) fg[p] = seen[p] ? 0 : 1;

  // Connected components; drop specks.
  const lab = new Int32Array(W * H).fill(-1);
  const comps = [];
  for (let p0 = 0; p0 < W * H; p0++) {
    if (!fg[p0] || lab[p0] !== -1) continue;
    const id = comps.length;
    let n = 0, minX = W, maxX = -1, minY = H, maxY = -1;
    const st = [p0]; lab[p0] = id;
    while (st.length) {
      const p = st.pop(); n++;
      const x = p % W, y = (p / W) | 0;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      const nb = [];
      if (x > 0) nb.push(p - 1);
      if (x < W - 1) nb.push(p + 1);
      if (p >= W) nb.push(p - W);
      if (p < W * (H - 1)) nb.push(p + W);
      for (const q of nb) if (fg[q] && lab[q] === -1) { lab[q] = id; st.push(q); }
    }
    comps.push({ id, n, minX, maxX, minY, maxY });
  }
  comps.sort((a, b2) => b2.n - a.n);
  const big = comps.filter((c) => c.n > 400);

  // Group surviving components into figures by column overlap.
  const keep = new Uint8Array(comps.length);
  for (const c of big) keep[c.id] = 1;
  const colCount = new Int32Array(W);
  for (let p = 0; p < W * H; p++) if (fg[p] && lab[p] >= 0 && keep[lab[p]]) colCount[p % W]++;
  const occ = new Uint8Array(W);
  for (let x = 0; x < W; x++) occ[x] = colCount[x] >= 6 ? 1 : 0;
  const GAP = 8;
  const groups = [];
  let x = 0;
  while (x < W) {
    if (!occ[x]) { x++; continue; }
    let x0 = x, x1 = x, gap = 0;
    while (x < W && gap <= GAP) { if (occ[x]) { x1 = x; gap = 0; } else gap++; x++; }
    if (x1 - x0 > 20) groups.push({ gx0: x0, gx1: x1 });
  }

  const figs = groups.map((g) => {
    let minY = H, maxY = -1, bx0 = W, bx1 = -1, count = 0, lsum = 0, l2 = 0;
    let dark = 0, veryDark = 0, brown = 0, changed = 0;
    const perRow = new Int32Array(H);
    for (let y = 0; y < H; y++) for (let xx = g.gx0; xx <= g.gx1; xx++) {
      const p = y * W + xx;
      if (!fg[p] || lab[p] < 0 || !keep[lab[p]]) continue;
      const i = p * 4;
      const r = A[i], gg = A[i + 1], b = A[i + 2];
      count++; perRow[y]++;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (xx < bx0) bx0 = xx; if (xx > bx1) bx1 = xx;
      const Lv = L[p];
      lsum += Lv; l2 += Lv * Lv;
      if (Lv < 150) dark++;
      if (Lv < 110) veryDark++;
      if (r > b + 12 && Lv < 195) brown++;
      if (B) {
        const d2 = Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]);
        if (d2 > 24) changed++;
      }
    }
    const mean = lsum / count;
    // widest row (shoulder-ish) and the row where mass peaks
    let topSolid = -1;
    for (let y = minY; y <= maxY; y++) if (perRow[y] > 4) { topSolid = y; break; }
    return {
      ...g, bx0, bx1, top: minY, bottom: maxY, topSolid,
      heightPx: maxY - minY + 1, widthPx: bx1 - bx0 + 1, bodyPx: count,
      meanLuma: +mean.toFixed(1), sdLuma: +Math.sqrt(l2 / count - mean * mean).toFixed(1),
      darkFrac: +(dark / count).toFixed(4), veryDarkFrac: +(veryDark / count).toFixed(4),
      brownFrac: +(brown / count).toFixed(4),
      weatherChangedFrac: B ? +(changed / count).toFixed(4) : null,
    };
  });

  const mv = document.createElement('canvas'); mv.width = W; mv.height = H;
  const mc = mv.getContext('2d');
  const idata = mc.createImageData(W, H);
  for (let p = 0; p < W * H; p++) {
    const i = p * 4;
    const on = fg[p] && lab[p] >= 0 && keep[lab[p]];
    idata.data[i] = on ? 255 : 18; idata.data[i + 1] = on ? 45 : 18; idata.data[i + 2] = on ? 45 : 18; idata.data[i + 3] = 255;
  }
  for (const g of groups) for (let y = 0; y < H; y++) for (const xx of [g.gx0, g.gx1]) {
    const i = (y * W + xx) * 4; idata.data[i] = 0; idata.data[i + 1] = 255; idata.data[i + 2] = 90;
  }
  mc.putImageData(idata, 0, 0);
  return { W, H, figs, nComps: comps.length, nBig: big.length, mask: mv.toDataURL('image/png') };
}, { urlA, urlB });

console.log(`image ${imgA}   ${out.W}x${out.H}   components ${out.nComps} (kept ${out.nBig})`);
console.log(`FIGURES FOUND: ${out.figs.length}`);
const b = out.figs[0];
for (const [n, f] of out.figs.entries()) {
  console.log(`\n figure ${n + 1}   cols ${f.gx0}..${f.gx1}   bbox x ${f.bx0}..${f.bx1}`);
  console.log(`   HEIGHT ${f.heightPx}px  = x${(f.heightPx / b.heightPx).toFixed(3)} of fig1    top y=${f.top}  bottom y=${f.bottom}`);
  console.log(`   width  ${f.widthPx}px  = x${(f.widthPx / b.widthPx).toFixed(3)}    bodyPx ${f.bodyPx}  = x${(f.bodyPx / b.bodyPx).toFixed(2)}`);
  console.log(`   luma mean ${f.meanLuma}  sd ${f.sdLuma}   darkFrac ${f.darkFrac}  veryDark ${f.veryDarkFrac}  brown ${f.brownFrac}`);
  if (f.weatherChangedFrac !== null) console.log(`   *** WEATHER A/B: ${(f.weatherChangedFrac * 100).toFixed(2)}% of body pixels change when weathering is OFF`);
}
if (maskOut) {
  writeFileSync(maskOut, Buffer.from(out.mask.split(',')[1], 'base64'));
  console.log(`\nmask -> ${maskOut}`);
}
await browser.close();
