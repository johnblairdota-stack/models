/**
 * PC7 scratch: mean rgb/luma of named rectangles in one or more PNGs, printed side by side.
 * Usage: node harness/evidence/_pc7_strip.mjs "name=x,y,w,h" ... -- fileA.png fileB.png
 * Uses imglib's page so the file:// cache trap it documents is already handled.
 */
import { openCanvasPage, resolveImg, toDataURL } from '../imglib.mjs';

const argv = process.argv.slice(2);
const sep = argv.indexOf('--');
const regions = argv.slice(0, sep).map((s) => {
  const [name, r] = s.split('=');
  const [x, y, w, h] = r.split(',').map(Number);
  return { name, x, y, w, h };
});
const files = argv.slice(sep + 1);

const { page, browser } = await openCanvasPage();
const rows = [];
for (const f of files) {
  const url = await toDataURL(resolveImg(f));
  const vals = await page.evaluate(async ([url, regions]) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    return regions.map((g) => {
      const d = ctx.getImageData(g.x, g.y, g.w, g.h).data;
      let r = 0, gg = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; }
      r /= n; gg /= n; b /= n;
      return { name: g.name, r: +r.toFixed(1), g: +gg.toFixed(1), b: +b.toFixed(1),
        L: +(0.2126 * r + 0.7152 * gg + 0.0722 * b).toFixed(1), rb: +(r - b).toFixed(1) };
    });
  }, [url, regions]);
  rows.push({ f: f.split(/[\\/]/).pop(), vals });
}
await browser.close();

for (const g of regions.map((r) => r.name)) {
  const line = rows.map((row) => {
    const v = row.vals.find((q) => q.name === g);
    return `${row.f}: L ${String(v.L).padStart(6)} rgb ${v.r}/${v.g}/${v.b} r-b ${v.rb}`;
  });
  console.log(g.padEnd(14), line.join('   |   '));
}
