// Critic tool: hunch metric for the 4 figures on hunter.sheet.
// Horizontal head-vs-feet offset is a weak proxy for "hunch" (it confuses a wide stance for a
// stoop). The cue that actually reads as a hunch is the BACK/SHOULDER MASS RISING ABOVE THE
// HEAD. So: find the head's column band (columns holding the topmost slice of the figure),
// then find the topmost body pixel OUTSIDE that band. If the back tops out above the head,
// the figure is stooped; if the head is the highest point, it is upright.
// Usage: node _tmp_hsheet_hunch.mjs <img>
import { toDataURL, openCanvasPage } from './imglib.mjs';

const { browser, page } = await openCanvasPage();
const url = await toDataURL(process.argv[2]);
const out = await page.evaluate(async (url) => {
  const im = await new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = url; });
  const W = im.width, H = im.height;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(im, 0, 0);
  const A = cx.getImageData(0, 0, W, H).data;
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
      const p = s2.pop(); n++; const x = p % W; const nb = [];
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
  return groups.map(([gx0, gx1]) => {
    let minY = H, maxY = -1;
    const colTop = new Int32Array(W).fill(-1);
    for (let y = 0; y < H; y++) for (let xx = gx0; xx <= gx1; xx++) {
      const p = y * W + xx; if (!ok(p)) continue;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (colTop[xx] === -1) colTop[xx] = y;
    }
    const hgt = maxY - minY + 1;
    // head band: columns whose top is within the topmost 8% of the figure
    const headCut = minY + hgt * 0.08;
    let hx0 = W, hx1 = -1;
    for (let xx = gx0; xx <= gx1; xx++) if (colTop[xx] !== -1 && colTop[xx] <= headCut) { if (xx < hx0) hx0 = xx; if (xx > hx1) hx1 = xx; }
    // topmost body pixel outside the head columns = the back / shoulder line
    let backTop = H;
    for (let xx = gx0; xx <= gx1; xx++) {
      if (xx >= hx0 && xx <= hx1) continue;
      if (colTop[xx] !== -1 && colTop[xx] < backTop) backTop = colTop[xx];
    }
    // width of the figure at the head's own height band, vs max width
    let maxW = 0, maxWy = 0;
    for (let y = minY; y <= maxY; y++) {
      let n = 0;
      for (let xx = gx0; xx <= gx1; xx++) if (ok(y * W + xx)) n++;
      if (n > maxW) { maxW = n; maxWy = y; }
    }
    return {
      gx0, gx1, hgt, top: minY, bottom: maxY,
      headCols: [hx0, hx1], headW: hx1 - hx0 + 1,
      backTop, backAboveHead: +(((minY - backTop) / hgt) * -1).toFixed(4),
      headAboveBack: +(((backTop - minY) / hgt)).toFixed(4),
      widestRowFromTop: +(((maxWy - minY) / hgt).toFixed(4)), maxW,
    };
  });
}, url);
const names = ['PLAYER', 'STAGE 1', 'STAGE 2', 'STAGE 3'];
console.log('HUNCH — how far the head clears the back/shoulder line, as a fraction of figure height.');
console.log('large positive = head well above the back (UPRIGHT).  near zero / negative = back level with or above head (STOOPED).\n');
out.forEach((f, i) => {
  console.log(`  ${(names[i] || i).padEnd(8)} H=${String(f.hgt).padStart(4)}  headAboveBack ${String(f.headAboveBack).padStart(8)}   headCols ${f.headCols[0]}..${f.headCols[1]} (w ${f.headW})   widestRow at ${f.widestRowFromTop} from top (w ${f.maxW})`);
});
await browser.close();
