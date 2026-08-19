// critic-hsheet-r7: rescale the four hunter.sheet figures to ONE height and tile them.
// Removes size as a confound so shell colour / dirt character / posture can be compared directly.
// Usage: node _tmp_r7_matched.mjs <src.png> <out.png> [targetH=560]
import { toDataURL, openCanvasPage } from './imglib.mjs';
import { writeFileSync } from 'node:fs';

const [, , src, out, thS, boxJson] = process.argv;
const TH = +(thS || 560);
// bboxes from _tmp_hsheet_seg.mjs on the 1920x1080 capture
const BOX = boxJson ? JSON.parse(boxJson) : [
  { n: 'player', x0: 230, x1: 315, y0: 526, y1: 770 },
  { n: 'stage1', x0: 353, x1: 548, y0: 479, y1: 791 },
  { n: 'stage2', x0: 591, x1: 936, y0: 401, y1: 821 },
  { n: 'stage3', x0: 1029, x1: 1883, y0: 232, y1: 892 },
];

const { browser, page } = await openCanvasPage();
const url = await toDataURL(src);
const b64 = await page.evaluate(async ({ url, BOX, TH }) => {
  const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  const scaled = BOX.map((b) => {
    const w = b.x1 - b.x0 + 1, h = b.y1 - b.y0 + 1;
    const s = TH / h;
    return { ...b, w, h, dw: Math.round(w * s), dh: TH };
  });
  const PAD = 14;
  const W = scaled.reduce((a, s) => a + s.dw + PAD, PAD);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = TH + PAD * 2;
  const cx = cv.getContext('2d');
  cx.fillStyle = '#202225'; cx.fillRect(0, 0, W, cv.height);
  cx.imageSmoothingQuality = 'high';
  let x = PAD;
  for (const s of scaled) {
    cx.drawImage(im, s.x0, s.y0, s.w, s.h, x, PAD, s.dw, s.dh);
    x += s.dw + PAD;
  }
  return cv.toDataURL('image/png').split(',')[1];
}, { url, BOX, TH });
writeFileSync(out, Buffer.from(b64, 'base64'));
console.log('wrote', out);
await browser.close();
