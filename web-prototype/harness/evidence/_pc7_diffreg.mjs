/**
 * PC7 scratch: how different are two frames INSIDE one rectangle, and where.
 * Usage: node harness/evidence/_pc7_diffreg.mjs A.png B.png x y w h
 * Prints per-row means for both plus the signed delta, and the brightest pixel in each.
 * ⚠️ Region, not frame — HANDOFF: whole-frame diffs on this view have a noise floor of
 * mean|d| 12.2 from the idle robot and the animated grain, larger than the signal.
 */
import { openCanvasPage, resolveImg, toDataURL } from '../imglib.mjs';

const [, , fa, fb, xs, ys, ws, hs] = process.argv;
const R = { x: +xs, y: +ys, w: +ws, h: +hs };
const { page, browser } = await openCanvasPage();
const grab = async (f) => {
  const url = await toDataURL(resolveImg(f));
  return page.evaluate(async ([url, R]) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(R.x, R.y, R.w, R.h).data;
    const rows = [];
    let maxL = -1, maxAt = null, sum = 0, n = 0;
    for (let j = 0; j < R.h; j++) {
      let s = 0;
      for (let i = 0; i < R.w; i++) {
        const k = (j * R.w + i) * 4;
        const L = 0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2];
        s += L; sum += L; n++;
        if (L > maxL) { maxL = L; maxAt = [R.x + i, R.y + j, d[k], d[k + 1], d[k + 2]]; }
      }
      rows.push(s / R.w);
    }
    return { rows, maxL: +maxL.toFixed(1), maxAt, mean: +(sum / n).toFixed(2) };
  }, [url, R]);
};
const A = await grab(fa), B = await grab(fb);
await browser.close();

console.log(`A ${fa.split(/[\\/]/).pop()}  mean ${A.mean}  brightest L${A.maxL} at ${A.maxAt.slice(0, 2)} rgb ${A.maxAt.slice(2)}`);
console.log(`B ${fb.split(/[\\/]/).pop()}  mean ${B.mean}  brightest L${B.maxL} at ${B.maxAt.slice(0, 2)} rgb ${B.maxAt.slice(2)}`);
console.log('row  A      B      A-B');
for (let j = 0; j < R.h; j += Math.max(1, Math.round(R.h / 24))) {
  console.log(String(R.y + j).padStart(4),
    A.rows[j].toFixed(1).padStart(6), B.rows[j].toFixed(1).padStart(6),
    (A.rows[j] - B.rows[j]).toFixed(1).padStart(6));
}
