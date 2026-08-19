// critic-hsheet-r7: blind A/B — art torso vs render torso, matched height, unlabelled.
import { toDataURL, openCanvasPage } from './imglib.mjs';
import { writeFileSync } from 'node:fs';

const ART = 'C:/Users/John/Documents/Run Robot Run/Dev Art/1785300149293.png';
const REN = 'progress/shots/hunter.sheet.png';
const out = process.argv[2];
const TH = 520;

// art 848x1264: STAGE 2 row ~y 480..820, STAGE 3 row ~y 900..1250
const PANELS = [
  { src: 'art', x0: 22,   x1: 232,  y0: 486,  y1: 830 },   // art stage2 front
  { src: 'ren', x0: 600,  x1: 940,  y0: 398,  y1: 828 },   // render stage2
  { src: 'art', x0: 14,   x1: 330,  y0: 906,  y1: 1246 },  // art stage3 front
  { src: 'ren', x0: 1029, x1: 1883, y0: 232,  y1: 892 },   // render stage3
];

const { browser, page } = await openCanvasPage();
const uArt = await toDataURL(ART), uRen = await toDataURL(REN);
const b64 = await page.evaluate(async ({ uArt, uRen, PANELS, TH }) => {
  const load = (u) => new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = u; });
  const A = await load(uArt), R = await load(uRen);
  const sc = PANELS.map((p) => {
    const w = p.x1 - p.x0, h = p.y1 - p.y0;
    return { ...p, w, h, dw: Math.round(w * (TH / h)), dh: TH };
  });
  const PAD = 12;
  const W = sc.reduce((a, s) => a + s.dw + PAD, PAD);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = TH + PAD * 2;
  const cx = cv.getContext('2d');
  cx.fillStyle = '#1a1c1e'; cx.fillRect(0, 0, W, cv.height);
  cx.imageSmoothingQuality = 'high';
  let x = PAD;
  for (const s of sc) {
    cx.drawImage(s.src === 'art' ? A : R, s.x0, s.y0, s.w, s.h, x, PAD, s.dw, s.dh);
    x += s.dw + PAD;
  }
  return cv.toDataURL('image/png').split(',')[1];
}, { uArt, uRen, PANELS, TH });
writeFileSync(out, Buffer.from(b64, 'base64'));
console.log('wrote', out, '(order: artS2 | renS2 | artS3 | renS3)');
await browser.close();
