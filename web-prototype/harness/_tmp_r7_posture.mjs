// critic-hsheet-r7: posture ramp. For each figure measure how far the HEAD rises above the
// SHOULDER line, normalised by figure height. A hunched machine tucks its head down between
// raised shoulders -> small/negative clearance. Upright -> large clearance.
// Shoulder line = first row (top-down) where the mask width reaches 55% of the figure's max
// TORSO width, where torso width is measured only over the central 60% of columns so that
// stage 3's six outstretched arms do not define it.
import { toDataURL, openCanvasPage } from './imglib.mjs';

const src = process.argv[2] || 'progress/shots/hunter.sheet.png';
const BOX = [
  { n: 'player', x0: 230, x1: 315, y0: 526, y1: 770 },
  { n: 'stage1', x0: 353, x1: 548, y0: 479, y1: 791 },
  { n: 'stage2', x0: 591, x1: 936, y0: 401, y1: 821 },
  { n: 'stage3', x0: 1029, x1: 1883, y0: 232, y1: 892 },
];
const { browser, page } = await openCanvasPage();
const url = await toDataURL(src);
const rows = await page.evaluate(async ({ url, BOX }) => {
  const im = await new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = url; });
  const W = im.width, H = im.height;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(im, 0, 0);
  const D = cx.getImageData(0, 0, W, H).data;
  const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const isBody = (x, y) => {
    const i = (y * W + x) * 4, r = D[i], g = D[i + 1], b = D[i + 2];
    const L = lum(r, g, b), ch = Math.max(r, g, b) - Math.min(r, g, b);
    if (L < 170) return true;              // anything clearly darker than cyc
    if (ch > 14) return true;              // mint / eyes / blue
    return false;
  };
  const out = [];
  for (const b of BOX) {
    const Hh = b.y1 - b.y0 + 1;
    const cw = [];   // full width per row
    const tw = [];   // central-60% width per row
    const cx0 = Math.round(b.x0 + (b.x1 - b.x0) * 0.20), cx1 = Math.round(b.x0 + (b.x1 - b.x0) * 0.80);
    for (let y = b.y0; y <= b.y1; y++) {
      let a = 0, t = 0;
      for (let x = b.x0; x <= b.x1; x++) if (isBody(x, y)) { a++; if (x >= cx0 && x <= cx1) t++; }
      cw.push(a); tw.push(t);
    }
    const maxT = Math.max(...tw.slice(0, Math.floor(Hh * 0.6)));
    let shoulderRow = 0;
    for (let i = 0; i < Hh; i++) if (tw[i] >= 0.55 * maxT) { shoulderRow = i; break; }
    // head top = first row with any body pixel
    let headTop = 0;
    for (let i = 0; i < Hh; i++) if (cw[i] > 0) { headTop = i; break; }
    out.push({ n: b.n, H: Hh, headTop, shoulderRow,
               clearance: +((shoulderRow - headTop) / Hh).toFixed(4), maxTorso: maxT });
  }
  return out;
}, { url, BOX });
console.log('figure    H    headTopRow  shoulderRow   HEAD CLEARANCE (fraction of figure H)');
for (const r of rows) console.log(`${r.n.padEnd(9)} ${String(r.H).padEnd(5)} ${String(r.headTop).padEnd(11)} ${String(r.shoulderRow).padEnd(13)} ${r.clearance}`);
await browser.close();
