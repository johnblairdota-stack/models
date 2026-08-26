// warm-find-27: FIND THE COORDINATES OF THE WARM PIXELS IN A DECILE RANGE, by scanning.
//
// Round 18's decile mask showed deciles 1-3 are the drapes plus warm bands, and then three
// consecutive attempts to measure "the band" by reading coordinates off a downscaled crop
// landed on a pilaster, a chandelier chain and a stack of crates. Estimating rects by eye does
// not work at this point and there is no reason to keep doing it: the pixels can be found.
//
// Reports the warmest cells of a coarse grid, restricted to the decile range and EXCLUDING
// red-dominant pixels so the drapes (already ruled out by colour and by area) do not win.
//   node harness/_warmfind27.mjs <img> <fromDecile> <toDecile>
import { openCanvasPage, toDataURL } from './imglib.mjs';
const [img, d0, d1] = process.argv.slice(2);
const { browser, page } = await openCanvasPage();
const durl = await toDataURL(img);
const out = await page.evaluate(async ({ durl, d0, d1 }) => {
  const im = new Image(); im.src = durl; await im.decode();
  const cv = document.createElement('canvas');
  cv.width = im.naturalWidth; cv.height = im.naturalHeight;
  cv.getContext('2d').drawImage(im, 0, 0);
  const W = cv.width, H = cv.height;
  const d = cv.getContext('2d').getImageData(0, 0, W, H).data;
  const L = new Float32Array(W * H);
  for (let p = 0; p < W * H; p++) {
    const i = p * 4;
    L[p] = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  }
  const s = Float32Array.from(L).sort();
  const lo = s[Math.floor(s.length * (d0 / 10))], hi = s[Math.floor(s.length * (d1 / 10))];
  const GX = 32, GY = 18, cw = Math.floor(W / GX), ch = Math.floor(H / GY);
  const cells = [];
  for (let gy = 0; gy < GY; gy++) {
    for (let gx = 0; gx < GX; gx++) {
      let rb = 0, n = 0, lsum = 0;
      for (let y = gy * ch; y < (gy + 1) * ch; y++) {
        for (let x = gx * cw; x < (gx + 1) * cw; x++) {
          const p = y * W + x, i = p * 4;
          if (L[p] < lo || L[p] > hi) continue;
          const R = d[i], G = d[i + 1], B = d[i + 2];
          // exclude red-dominant pixels: the drapes are already ruled out and would win this
          if (R > G * 1.7 && R > B * 1.7) continue;
          rb += R - B; lsum += L[p]; n++;
        }
      }
      if (n > cw * ch * 0.25) {
        cells.push({ x: gx * cw + (cw >> 1), y: gy * ch + (ch >> 1), rb: rb / n, L: lsum / n, n });
      }
    }
  }
  cells.sort((a, b) => b.rb - a.rb);
  return cells.slice(0, 8).map((c) => ({ x: c.x, y: c.y, rb: +c.rb.toFixed(1), L: +c.L.toFixed(1), n: c.n }));
}, { durl, d0: Number(d0), d1: Number(d1) });
console.log(`warmest non-red cells in deciles ${d0}-${d1}:`);
for (const c of out) console.log(`  (${c.x},${c.y})  r-b ${String(c.rb).padStart(6)}  L ${String(c.L).padStart(5)}  ${c.n} px`);
await browser.close();
