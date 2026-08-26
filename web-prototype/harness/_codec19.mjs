// codec-19: HOW MUCH OF THE BAR'S LOW LOCAL CONTRAST IS THE BAR, AND HOW MUCH IS THE CODEC.
//
// Every "local contrast" comparison this round has made puts a raw render next to
// `refs/bf1/bf1-ballroom-01.png`, which despite its name is a WebP — a lossy screengrab of a
// shipped game. Lossy codecs spend their bits on edges and throw away exactly the low-amplitude
// high-frequency texture this measurement is built to detect, so some part of every gap
// attributed to "our floor is busier" is the reference having been compressed and ours not.
//
// This re-encodes OUR OWN frame through the same kind of codec and re-measures it. Whatever the
// number moves by is the codec's share, and it is not a defect in the room.
//   node harness/_codec19.mjs <img> x,y,w,h [quality]
import { openCanvasPage, toDataURL } from './imglib.mjs';

const [img, rect, q] = process.argv.slice(2);
const Q = Number(q ?? 0.82);
const { browser, page } = await openCanvasPage();
const durl = await toDataURL(img);
const out = await page.evaluate(async ({ durl, rect, Q }) => {
  const [rx, ry, rw, rh] = rect.split(',').map(Number);
  const im = new Image(); im.src = durl; await im.decode();
  const cv = document.createElement('canvas');
  cv.width = im.naturalWidth; cv.height = im.naturalHeight;
  cv.getContext('2d').drawImage(im, 0, 0);

  const ladder = (canvas) => {
    const d = canvas.getContext('2d').getImageData(rx, ry, rw, rh).data;
    const L = new Float32Array(rw * rh);
    let mean = 0;
    for (let p = 0; p < rw * rh; p++) {
      const i = p * 4;
      L[p] = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      mean += L[p];
    }
    mean /= rw * rh;
    const at = (win) => {
      let acc = 0, k = 0;
      for (let y = 0; y + win <= rh; y += win) {
        for (let x = 0; x + win <= rw; x += win) {
          let m = 0, m2 = 0;
          for (let j = 0; j < win; j++) for (let i2 = 0; i2 < win; i2++) {
            const v = L[(y + j) * rw + x + i2]; m += v; m2 += v * v;
          }
          const n = win * win; m /= n;
          acc += Math.sqrt(Math.max(0, m2 / n - m * m)); k++;
        }
      }
      return k ? +(100 * (acc / k) / mean).toFixed(1) : 0;
    };
    return { mean: +mean.toFixed(1), w4: at(4), w10: at(10), w24: at(24), w48: at(48) };
  };

  const before = ladder(cv);
  // round-trip through the lossy codec the reference is stored in
  const wq = cv.toDataURL('image/webp', Q);
  const im2 = new Image(); im2.src = wq; await im2.decode();
  const cv2 = document.createElement('canvas');
  cv2.width = cv.width; cv2.height = cv.height;
  cv2.getContext('2d').drawImage(im2, 0, 0);
  const after = ladder(cv2);
  return { before, after, isWebp: wq.startsWith('data:image/webp') };
}, { durl, rect, Q });
if (!out.isWebp) console.log('  ⚠ this browser did not encode webp — numbers below are a PNG round trip and mean nothing');
const f = (r) => `mean ${String(r.mean).padStart(5)}   4px ${String(r.w4).padStart(5)}   10px ${String(r.w10).padStart(5)}   24px ${String(r.w24).padStart(5)}   48px ${String(r.w48).padStart(5)}`;
console.log(`  raw          ${f(out.before)}`);
console.log(`  webp q${Q}   ${f(out.after)}`);
await browser.close();
