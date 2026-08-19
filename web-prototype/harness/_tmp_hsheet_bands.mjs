// Critic tool: per-figure vertical-band profile of grime + posture metrics + eye hue,
// on the 4-figure hunter.sheet. Segmentation is gradient-flood (see _tmp_hsheet_seg.mjs)
// because the cyc has a radial hotspot that defeats level thresholding, and because
// measure.mjs merges adjacent figures on this view.
//
// Bands are NORMALISED per figure (0 = feet, 1 = top of head), so band k on the player and
// band k on stage 3 are the same part of the body — an apples-to-apples grime comparison
// that no hand-placed crop can be accused of cherry-picking.
//
// Usage: node _tmp_hsheet_bands.mjs <weatherOn> <weatherOff>
import { toDataURL, openCanvasPage } from './imglib.mjs';

const [, , imgA, imgB] = process.argv;
const { browser, page } = await openCanvasPage();
const urlA = await toDataURL(imgA);
const urlB = await toDataURL(imgB);

const out = await page.evaluate(async ({ urlA, urlB }) => {
  const load = (u) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = u; });
  const imA = await load(urlA), imB = await load(urlB);
  const W = imA.width, H = imA.height;
  const grab = (im) => {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(im, 0, 0); return cx.getImageData(0, 0, W, H).data;
  };
  const A = grab(imA), B = grab(imB);
  const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const L = new Float32Array(W * H), C = new Float32Array(W * H);
  for (let i = 0, p = 0; p < W * H; p++, i += 4) {
    L[p] = lum(A[i], A[i + 1], A[i + 2]);
    C[p] = Math.abs(A[i] - A[i + 1]) + Math.abs(A[i + 1] - A[i + 2]);
  }
  const G = new Float32Array(W * H);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const p = y * W + x;
    const gx = -L[p - W - 1] - 2 * L[p - 1] - L[p + W - 1] + L[p - W + 1] + 2 * L[p + 1] + L[p + W + 1];
    const gy = -L[p - W - 1] - 2 * L[p - W] - L[p - W + 1] + L[p + W - 1] + 2 * L[p + W] + L[p + W + 1];
    G[p] = Math.abs(gx) + Math.abs(gy);
  }
  const blocked = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p++) blocked[p] = (G[p] > 14 || C[p] > 12) ? 1 : 0;
  const seen = new Uint8Array(W * H); const st = [];
  for (let x = 0; x < W; x++) { st.push(x); st.push((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { st.push(y * W); st.push(y * W + W - 1); }
  while (st.length) {
    const p = st.pop();
    if (p < 0 || p >= W * H || seen[p] || blocked[p]) continue;
    seen[p] = 1; const x = p % W;
    if (x > 0) st.push(p - 1); if (x < W - 1) st.push(p + 1);
    if (p >= W) st.push(p - W); if (p < W * (H - 1)) st.push(p + W);
  }
  const fg = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p++) fg[p] = seen[p] ? 0 : 1;
  const lab = new Int32Array(W * H).fill(-1); const comps = [];
  for (let p0 = 0; p0 < W * H; p0++) {
    if (!fg[p0] || lab[p0] !== -1) continue;
    const id = comps.length; let n = 0; const s2 = [p0]; lab[p0] = id;
    while (s2.length) {
      const p = s2.pop(); n++; const x = p % W;
      const nb = [];
      if (x > 0) nb.push(p - 1); if (x < W - 1) nb.push(p + 1);
      if (p >= W) nb.push(p - W); if (p < W * (H - 1)) nb.push(p + W);
      for (const q of nb) if (fg[q] && lab[q] === -1) { lab[q] = id; s2.push(q); }
    }
    comps.push({ id, n });
  }
  const keep = new Uint8Array(comps.length);
  for (const c of comps) if (c.n > 400) keep[c.id] = 1;
  const ok = (p) => fg[p] && lab[p] >= 0 && keep[lab[p]];
  const colCount = new Int32Array(W);
  for (let p = 0; p < W * H; p++) if (ok(p)) colCount[p % W]++;
  const groups = []; let x = 0;
  while (x < W) {
    if (colCount[x] < 6) { x++; continue; }
    let x0 = x, x1 = x, gap = 0;
    while (x < W && gap <= 8) { if (colCount[x] >= 6) { x1 = x; gap = 0; } else gap++; x++; }
    if (x1 - x0 > 20) groups.push([x0, x1]);
  }

  const NB = 8;
  const figs = groups.map(([gx0, gx1]) => {
    let minY = H, maxY = -1;
    for (let y = 0; y < H; y++) for (let xx = gx0; xx <= gx1; xx++) {
      const p = y * W + xx; if (!ok(p)) continue;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    const hgt = maxY - minY + 1;
    const bands = Array.from({ length: NB }, () => ({ n: 0, chg: 0, brown: 0, lsum: 0, dark: 0 }));
    // posture accumulators
    let headSx = 0, headN = 0, feetSx = 0, feetN = 0;
    let eyeBest = null;
    for (let y = minY; y <= maxY; y++) {
      const frac = (maxY - y) / hgt;             // 0 at feet, 1 at head
      const bi = Math.min(NB - 1, Math.floor(frac * NB));
      for (let xx = gx0; xx <= gx1; xx++) {
        const p = y * W + xx; if (!ok(p)) continue;
        const i = p * 4;
        const r = A[i], g = A[i + 1], b = A[i + 2];
        const bd = bands[bi];
        bd.n++;
        const d2 = Math.abs(r - B[i]) + Math.abs(g - B[i + 1]) + Math.abs(b - B[i + 2]);
        if (d2 > 24) bd.chg++;
        if (r > b + 12 && L[p] < 195) bd.brown++;
        bd.lsum += L[p];
        if (L[p] < 120) bd.dark++;
        if (frac > 0.88) { headSx += xx; headN++; }
        if (frac < 0.06) { feetSx += xx; feetN++; }
        // glowing eye candidate: strongly saturated AND bright
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        const sat = mx - mn;
        if (frac > 0.70 && sat > 60 && mx > 90) {
          if (!eyeBest) eyeBest = { rs: 0, gs: 0, bs: 0, n: 0 };
          eyeBest.rs += r; eyeBest.gs += g; eyeBest.bs += b; eyeBest.n++;
        }
      }
    }
    const lean = headN && feetN ? ((headSx / headN) - (feetSx / feetN)) / hgt : null;
    let eye = null;
    if (eyeBest && eyeBest.n > 12) {
      const r = eyeBest.rs / eyeBest.n, g = eyeBest.gs / eyeBest.n, b = eyeBest.bs / eyeBest.n;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      let h = 0;
      if (mx !== mn) {
        if (mx === r) h = 60 * (((g - b) / (mx - mn)) % 6);
        else if (mx === g) h = 60 * ((b - r) / (mx - mn) + 2);
        else h = 60 * ((r - g) / (mx - mn) + 4);
      }
      if (h < 0) h += 360;
      eye = { r: Math.round(r), g: Math.round(g), b: Math.round(b), hue: Math.round(h), px: eyeBest.n };
    }
    return {
      gx0, gx1, top: minY, bottom: maxY, hgt, lean: lean === null ? null : +lean.toFixed(4), eye,
      bands: bands.map((d) => ({
        n: d.n,
        chgPct: d.n ? +(100 * d.chg / d.n).toFixed(1) : null,
        brownPct: d.n ? +(100 * d.brown / d.n).toFixed(1) : null,
        meanL: d.n ? +(d.lsum / d.n).toFixed(0) : null,
        darkPct: d.n ? +(100 * d.dark / d.n).toFixed(1) : null,
      })),
    };
  });
  return { figs };
}, { urlA, urlB });

const names = ['PLAYER', 'STAGE 1', 'STAGE 2', 'STAGE 3'];
console.log('WEATHER-DELTA %% of pixels changed when weathering is OFF, by normalised body band');
console.log('band 8 = top of head ... band 1 = feet\n');
const hdr = ['band'].concat(out.figs.map((_, i) => (names[i] || `fig${i + 1}`).padStart(9)));
console.log(hdr.join(' | '));
for (let k = 7; k >= 0; k--) {
  const row = [`  ${k + 1} `].concat(out.figs.map((f) => String(f.bands[k].chgPct ?? '-').padStart(9)));
  console.log(row.join(' | '));
}
console.log('\nBROWN (rust/soot hue) %% by band');
console.log(hdr.join(' | '));
for (let k = 7; k >= 0; k--) {
  const row = [`  ${k + 1} `].concat(out.figs.map((f) => String(f.bands[k].brownPct ?? '-').padStart(9)));
  console.log(row.join(' | '));
}
console.log('\nMEAN LUMA by band');
console.log(hdr.join(' | '));
for (let k = 7; k >= 0; k--) {
  const row = [`  ${k + 1} `].concat(out.figs.map((f) => String(f.bands[k].meanL ?? '-').padStart(9)));
  console.log(row.join(' | '));
}
console.log('\nPOSTURE / EYE');
out.figs.forEach((f, i) => {
  console.log(`  ${(names[i] || i).padEnd(8)} height ${String(f.hgt).padStart(4)}px  lean(head-vs-feet)/H = ${f.lean}   eye ${f.eye ? `rgb(${f.eye.r},${f.eye.g},${f.eye.b}) hue ${f.eye.hue}deg  (${f.eye.px}px)` : 'none found'}`);
});
await browser.close();
