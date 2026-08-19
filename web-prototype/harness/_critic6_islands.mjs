/**
 * Independent white-island detector: flood-fills every non-teal blob that lies fully inside the
 * teal field's bounding box. A blob that never touches the box boundary is floating debris
 * inside the hole, disconnected from the rim. Usage: node _critic6_islands.mjs <src.png>
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const [src] = process.argv.slice(2);
const b = fs.readFileSync(src).toString('base64');
const br = await chromium.launch();
const pg = await br.newPage();
const r = await pg.evaluate(async ([b64]) => {
  const bin = atob(b64); const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const bmp = await createImageBitmap(new Blob([arr], { type: 'image/png' }));
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, 0, 0);
  const d = g.getImageData(0, 0, bmp.width, bmp.height).data;
  const at = (x, y) => { const o = (y * bmp.width + x) * 4; return [d[o], d[o + 1], d[o + 2]]; };
  const isTeal = (p) => p[2] >= 34 && p[2] > p[0] * 1.55 && p[1] > p[0] * 1.20;

  const W = bmp.width, H = bmp.height;
  const teal = new Uint8Array(W * H);
  let tn = 0, x0 = W, x1 = -1, y0 = H, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (isTeal(at(x, y))) { teal[y * W + x] = 1; tn++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (tn < 40) return { tn: 0, islands: [] };

  const seen = new Uint8Array(W * H);
  const stack = new Int32Array(W * H);
  const found = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i0 = y * W + x;
      if (teal[i0] || seen[i0]) continue;
      let sp = 0, size = 0, edge = false, bx0 = x, bx1 = x, by0 = y, by1 = y;
      stack[sp++] = i0; seen[i0] = 1;
      while (sp > 0 && size < 400000) {
        const i = stack[--sp];
        const cy = (i / W) | 0, cx = i - cy * W;
        size++;
        if (cx < bx0) bx0 = cx; if (cx > bx1) bx1 = cx;
        if (cy < by0) by0 = cy; if (cy > by1) by1 = cy;
        if (cx <= x0 || cx >= x1 || cy <= y0 || cy >= y1) edge = true;
        const nb = [i - 1, i + 1, i - W, i + W];
        for (let k = 0; k < 4; k++) {
          const j = nb[k];
          if (j < 0 || j >= W * H || seen[j] || teal[j]) continue;
          const jy = (j / W) | 0, jx = j - jy * W;
          if (jx < x0 || jx > x1 || jy < y0 || jy > y1) { edge = true; continue; }
          seen[j] = 1; stack[sp++] = j;
        }
      }
      if (!edge && size >= 15) found.push({ size, bbox: [bx0, by0, bx1, by1], cx: Math.round((bx0 + bx1) / 2), cy: Math.round((by0 + by1) / 2) });
    }
  }
  found.sort((a, b2) => b2.size - a.size);
  return { tn, teal: [x0, y0, x1, y1], islands: found, totalPx: found.reduce((s, f) => s + f.size, 0) };
}, [b]);
await br.close();
console.log(JSON.stringify({ src, tealPx: r.tn, islandCount: r.islands.length, totalIslandPx: r.totalPx, pct: r.tn ? +(r.totalPx / r.tn * 100).toFixed(3) : 0, islands: r.islands.slice(0, 8) }, null, 2));
