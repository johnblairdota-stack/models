// critic-hsheet-r7: per-figure palette breakdown for hunter.sheet.
// Splits each figure's pixels into MINT (green-dominant), EYE (red/blue emissive), and SHELL,
// then reports shell warmth (r-b), shell brightness percentiles, and mint colour+cleanliness.
// Usage: node _tmp_r7_palette.mjs <img.png> [label]
import { toDataURL, openCanvasPage } from './imglib.mjs';

const [, , src, label] = process.argv;
const BOX = [
  { n: 'player', x0: 230, x1: 315, y0: 526, y1: 770 },
  { n: 'stage1', x0: 353, x1: 548, y0: 479, y1: 791 },
  { n: 'stage2', x0: 591, x1: 936, y0: 401, y1: 821 },
  { n: 'stage3', x0: 1029, x1: 1883, y0: 232, y1: 892 },
];

const { browser, page } = await openCanvasPage();
const url = await toDataURL(src);
const rows = await page.evaluate(async ({ url, BOX }) => {
  const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  const W = im.width, H = im.height;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(im, 0, 0);
  const D = cx.getImageData(0, 0, W, H).data;
  const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

  // Background model: the cyc is smooth + near-neutral + bright. Use a gradient test so the
  // radial hotspot is not mistaken for a figure (documented trap on this view).
  const grad = (x, y) => {
    const i = (y * W + x) * 4, iu = ((y - 1) * W + x) * 4, il = (y * W + x - 1) * 4;
    return Math.abs(lum(D[i], D[i + 1], D[i + 2]) - lum(D[iu], D[iu + 1], D[iu + 2]))
         + Math.abs(lum(D[i], D[i + 1], D[i + 2]) - lum(D[il], D[il + 1], D[il + 2]));
  };

  const out = [];
  for (const b of BOX) {
    const mint = [], shell = [], eye = [];
    // per-figure background luma estimate = brightest 2% inside the box (the cyc showing through)
    for (let y = b.y0; y <= b.y1; y++) {
      for (let x = b.x0; x <= b.x1; x++) {
        const i = (y * W + x) * 4;
        const r = D[i], g = D[i + 1], bl = D[i + 2];
        const L = lum(r, g, bl);
        // skip backdrop: bright, neutral, and locally smooth
        const chroma = Math.max(r, g, bl) - Math.min(r, g, bl);
        if (L > 168 && chroma < 10 && grad(x, y) < 6) continue;
        if (L > 200 && chroma < 14) continue; // hot cyc
        if (r > 120 && r - g > 45 && r - bl > 45) { eye.push([r, g, bl, L]); continue; }
        if (bl > 120 && bl - r > 35) { eye.push([r, g, bl, L]); continue; }
        if (g > r + 8 && g > bl + 4 && chroma > 12) { mint.push([r, g, bl, L]); continue; }
        shell.push([r, g, bl, L]);
      }
    }
    const stat = (arr) => {
      if (!arr.length) return null;
      const n = arr.length;
      const mr = arr.reduce((a, p) => a + p[0], 0) / n;
      const mg = arr.reduce((a, p) => a + p[1], 0) / n;
      const mb = arr.reduce((a, p) => a + p[2], 0) / n;
      const Ls = arr.map((p) => p[3]).sort((x, y) => x - y);
      const pc = (q) => Ls[Math.min(n - 1, Math.floor(q * n))];
      return { n, r: +mr.toFixed(1), g: +mg.toFixed(1), b: +mb.toFixed(1), rb: +(mr - mb).toFixed(1),
               sat: +(Math.max(mr, mg, mb) - Math.min(mr, mg, mb)).toFixed(1),
               p10: +pc(0.10).toFixed(1), p50: +pc(0.50).toFixed(1), p90: +pc(0.90).toFixed(1), p99: +pc(0.99).toFixed(1) };
    };
    // shell warmth measured on the BRIGHTEST shell decile = the least-sooted paint
    const shellSorted = shell.slice().sort((p, q) => q[3] - p[3]);
    const cleanest = shellSorted.slice(0, Math.max(1, Math.floor(shell.length * 0.10)));
    out.push({ name: b.n, shell: stat(shell), cleanShell: stat(cleanest), mint: stat(mint), eye: stat(eye),
               mintFrac: +(mint.length / (mint.length + shell.length)).toFixed(4) });
  }
  return out;
}, { url, BOX });

console.log('=== ' + (label || src) + ' ===');
for (const r of rows) {
  console.log(`\n${r.name}  (mint ${(r.mintFrac * 100).toFixed(1)}% of body)`);
  if (r.shell) console.log(`  SHELL all      rgb(${r.shell.r},${r.shell.g},${r.shell.b})  r-b ${r.shell.rb}  luma p10/50/90 ${r.shell.p10}/${r.shell.p50}/${r.shell.p90}  n=${r.shell.n}`);
  if (r.cleanShell) console.log(`  SHELL cleanest rgb(${r.cleanShell.r},${r.cleanShell.g},${r.cleanShell.b})  r-b ${r.cleanShell.rb}  luma p50 ${r.cleanShell.p50}`);
  if (r.mint) console.log(`  MINT           rgb(${r.mint.r},${r.mint.g},${r.mint.b})  sat ${r.mint.sat}  luma p10/50/90 ${r.mint.p10}/${r.mint.p50}/${r.mint.p90}  n=${r.mint.n}`);
  if (r.eye) console.log(`  EYE            rgb(${r.eye.r},${r.eye.g},${r.eye.b})  n=${r.eye.n}`);
}
await browser.close();
