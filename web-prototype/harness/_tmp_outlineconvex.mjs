/**
 * 🎯 **IS THE TEAL A CONVEX BLOB — MEASURED ON THE DELIVERED IMAGE, NOT ON THE FIELD.**
 *
 * `harness/_tmp_lobeshape.mjs` scores the depth field; this scores the PNG a critic actually
 * looks at, with the same two numbers, so a claim about the field can be checked against the
 * render rather than assumed to survive it.
 *
 *   convexity  area(teal) / area(convex hull).  1.000 = a convex blob.
 *   notchPx    the deepest bay: the furthest a non-teal pixel inside the hull gets from the
 *              hull's own boundary. Across a bay's mouth the hull edge IS the chord, so this is
 *              "how far does the surviving white poke into the teal", in pixels.
 *
 * ⚠️ Pixels are not metres and the two are NOT comparable across frames at different distances —
 * `mPerPx` is printed from the teal bbox so a reader can convert, and it is the only honest way
 * to compare two shots.
 *
 *   node harness/_tmp_outlineconvex.mjs <png> [...]
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const br = await chromium.launch();
const pg = await br.newPage();
for (const src of process.argv.slice(2)) {
  const b64 = fs.readFileSync(src).toString('base64');
  const r = await pg.evaluate(async (b) => {
    const bin = atob(b); const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const bmp = await createImageBitmap(new Blob([arr], { type: 'image/png' }));
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(bmp, 0, 0);
    const W = bmp.width, H = bmp.height;
    const d = g.getImageData(0, 0, W, H).data;
    const teal = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const R = d[i * 4], G = d[i * 4 + 1], B = d[i * 4 + 2];
      // the same classifier `chunk-thick.mjs` and `_tmp_holecrop.mjs` use, unchanged
      if (B >= 34 && B > R * 1.55 && G > R * 1.20) teal[i] = 1;
    }
    // largest connected component
    const lab = new Int32Array(W * H).fill(-1);
    let best = -1, bestN = 0, comp = 0; const st = [];
    for (let i = 0; i < teal.length; i++) {
      if (!teal[i] || lab[i] >= 0) continue;
      let n = 0; st.length = 0; st.push(i); lab[i] = comp;
      while (st.length) {
        const p = st.pop(); n++;
        const px = p % W, py = (p / W) | 0;
        if (px > 0 && teal[p - 1] && lab[p - 1] < 0) { lab[p - 1] = comp; st.push(p - 1); }
        if (px < W - 1 && teal[p + 1] && lab[p + 1] < 0) { lab[p + 1] = comp; st.push(p + 1); }
        if (py > 0 && teal[p - W] && lab[p - W] < 0) { lab[p - W] = comp; st.push(p - W); }
        if (py < H - 1 && teal[p + W] && lab[p + W] < 0) { lab[p + W] = comp; st.push(p + W); }
      }
      if (n > bestN) { bestN = n; best = comp; }
      comp++;
    }
    if (bestN < 500) return { error: 'no teal region', bestN };
    const pts = [];
    let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
    for (let i = 0; i < lab.length; i++) {
      if (lab[i] !== best) continue;
      const px = i % W, py = (i / W) | 0;
      pts.push([px, py]);
      if (px < x0) x0 = px; if (px > x1) x1 = px;
      if (py < y0) y0 = py; if (py > y1) y1 = py;
    }
    // ⚠️ a region that runs off the frame has no outline to judge on that side; say so.
    const clipped = x0 <= 1 || y0 <= 1 || x1 >= W - 2 || y1 >= H - 2;
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const s = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const lo = [], up = [];
    for (const p of s) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (let i = s.length - 1; i >= 0; i--) { const p = s[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    const hull = lo.slice(0, -1).concat(up.slice(0, -1));
    let ha = 0;
    for (let i = 0; i < hull.length; i++) { const p = hull[i], q = hull[(i + 1) % hull.length]; ha += p[0] * q[1] - q[0] * p[1]; }
    ha = Math.abs(ha) / 2;
    const inHull = (x, y) => { for (let i = 0; i < hull.length; i++) { const p = hull[i], q = hull[(i + 1) % hull.length]; if ((q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]) < -1e-9) return false; } return true; };
    const dEdge = (x, y) => {
      let m = Infinity;
      for (let i = 0; i < hull.length; i++) {
        const p = hull[i], q = hull[(i + 1) % hull.length];
        const vx = q[0] - p[0], vy = q[1] - p[1];
        const L2 = vx * vx + vy * vy || 1e-9;
        let t = ((x - p[0]) * vx + (y - p[1]) * vy) / L2;
        t = Math.max(0, Math.min(1, t));
        const ex = x - (p[0] + t * vx), ey = y - (p[1] + t * vy);
        const dd = Math.hypot(ex, ey);
        if (dd < m) m = dd;
      }
      return m;
    };
    /**
     * 🚨 **ISLANDS — round 4's rank-1 defect, counted rather than eyeballed.** Non-teal blobs
     * wholly SURROUNDED by teal read as *"an aerial photo of a lagoon with small islands"* and
     * that verdict cost a whole round. A hard plate that never got dug is exactly such a blob, so
     * anything that displaces the brush has to be checked for them.
     */
    const seen = new Uint8Array(W * H);
    let islands = 0, islandPx = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i0 = y * W + x;
        if (lab[i0] === best || seen[i0]) continue;
        let n = 0, touchesOutside = false;
        st.length = 0; st.push(i0); seen[i0] = 1;
        while (st.length) {
          const p = st.pop(); n++;
          const px = p % W, py = (p / W) | 0;
          if (px < x0 || px > x1 || py < y0 || py > y1) { touchesOutside = true; continue; }
          for (const q of [p - 1, p + 1, p - W, p + W]) {
            if (q < 0 || q >= W * H) { touchesOutside = true; continue; }
            if (lab[q] === best || seen[q]) continue;
            seen[q] = 1; st.push(q);
          }
        }
        if (!touchesOutside && n >= 40) { islands++; islandPx += n; }
      }
    }
    let notch = 0, bay = 0;
    for (let y = y0; y <= y1; y += 2) {
      for (let x = x0; x <= x1; x += 2) {
        if (lab[y * W + x] === best) continue;
        if (!inHull(x, y)) continue;
        const dd = dEdge(x, y);
        if (dd > 3) bay += 4;
        if (dd > notch) notch = dd;
      }
    }
    return {
      w: W, h: H, tealPx: bestN, bbox: [x0, y0, x1, y1], clipped,
      convexity: +(bestN / ha).toFixed(4), notchPx: +notch.toFixed(1), islands, islandPx,
      bayPx: bay, hullPx: Math.round(ha),
    };
  }, b64);
  console.log(src.split(/[\\/]/).pop().padEnd(46), JSON.stringify(r));
}
await br.close();
