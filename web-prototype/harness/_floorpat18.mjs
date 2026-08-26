// floorpat-18: HOW LOUD IS THE FLOOR'S PATTERN, in both pictures, by the same rule.
//
// Round 17 concluded "the bar's floor reads as a TONE and this one reads as PATTERN" and acted
// on it by trying to lay the oak plain, which never converged. Round 18 filed the residue as
// "closing this needs a floor surface BUILT to be plain" — i.e. as a piece of work rather than
// a parameter. Both of those assume the bar's floor has no pattern in it. Cropped and looked
// at, it plainly does: large faint squares with a diagonal inside them, at low contrast.
//
// So the question is not "pattern or tone", it is HOW MUCH CONTRAST and AT WHAT SIZE, and both
// are measurable. Local standard deviation over a sliding window, normalised by the patch mean,
// at several window sizes: small windows see the fine detail, large ones see the cell grid.
//   node harness/_floorpat18.mjs <img> x,y,w,h [<img> x,y,w,h ...]
import { openCanvasPage, toDataURL } from './imglib.mjs';

const args = process.argv.slice(2);
const { browser, page } = await openCanvasPage();
for (let i = 0; i < args.length; i += 2) {
  const img = args[i], rect = args[i + 1];
  const durl = await toDataURL(img);
  const r = await page.evaluate(async ({ durl, rect }) => {
    const [rx, ry, rw, rh] = rect.split(',').map(Number);
    const im = new Image(); im.src = durl; await im.decode();
    const cv = document.createElement('canvas');
    cv.width = im.naturalWidth; cv.height = im.naturalHeight;
    const cx = cv.getContext('2d'); cx.drawImage(im, 0, 0);
    const d = cx.getImageData(rx, ry, rw, rh).data;
    const L = new Float32Array(rw * rh);
    let mean = 0;
    for (let p = 0; p < rw * rh; p++) {
      const i2 = p * 4;
      L[p] = 0.2126 * d[i2] + 0.7152 * d[i2 + 1] + 0.0722 * d[i2 + 2];
      mean += L[p];
    }
    mean /= rw * rh;
    // ⚠ NORMALISED BY THE PATCH MEAN, or this compares brightness instead of pattern. A dark
    // floor and a bright one with identical relief would otherwise report different numbers.
    const at = (win) => {
      let acc = 0, k = 0;
      for (let y = 0; y + win <= rh; y += win) {
        for (let x = 0; x + win <= rw; x += win) {
          let m = 0, m2 = 0;
          for (let j = 0; j < win; j++) {
            for (let i3 = 0; i3 < win; i3++) {
              const v = L[(y + j) * rw + x + i3]; m += v; m2 += v * v;
            }
          }
          const n2 = win * win;
          m /= n2;
          acc += Math.sqrt(Math.max(0, m2 / n2 - m * m));
          k++;
        }
      }
      return k ? +(100 * (acc / k) / mean).toFixed(1) : 0;
    };
    return { mean: +mean.toFixed(1), w4: at(4), w10: at(10), w24: at(24), w48: at(48) };
  }, { durl, rect });
  console.log(`${img.split('/').pop().padEnd(22)} mean L ${String(r.mean).padStart(5)}   local contrast %  4px ${String(r.w4).padStart(5)}   10px ${String(r.w10).padStart(5)}   24px ${String(r.w24).padStart(5)}   48px ${String(r.w48).padStart(5)}`);
}
await browser.close();
