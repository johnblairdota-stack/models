import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
const file = process.argv[2];
const buf = await readFile(file);
const url = `data:image/png;base64,${buf.toString('base64')}`;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 300, height: 200 } });
const out = await p.evaluate(async (url) => {
  const im = new Image(); im.src = url; await im.decode();
  const W = im.naturalWidth, H = im.naturalHeight;
  const c = new OffscreenCanvas(W, H); const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(im, 0, 0); const d = g.getImageData(0, 0, W, H).data;
  const L = (x, y) => { const i = (y * W + x) * 4; return 0.2126*d[i] + 0.7152*d[i+1] + 0.0722*d[i+2]; };
  const rows = [];
  for (let y = 0; y < H; y++) {
    // background estimate = median of outer 6% margins on this row
    const m = Math.max(3, Math.round(W * 0.06));
    const bg = [];
    for (let x = 0; x < m; x++) bg.push(L(x, y));
    for (let x = W - m; x < W; x++) bg.push(L(x, y));
    bg.sort((a, z) => a - z); const B = bg[bg.length >> 1];
    let n = 0, lo = -1, hi = -1;
    for (let x = 0; x < W; x++) { if (Math.abs(L(x, y) - B) > 8) { n++; if (lo < 0) lo = x; hi = x; } }
    rows.push([y, n, lo, hi, Math.round(B)]);
  }
  return { W, H, rows };
}, url);
await b.close();
console.log(`size ${out.W}x${out.H}`);
for (const [y, n, lo, hi, bg] of out.rows) {
  if (y % 1 === 0) console.log(`${String(y).padStart(4)}  n=${String(n).padStart(4)}  x ${String(lo).padStart(4)}..${String(hi).padStart(4)}  bg=${bg}`);
}
