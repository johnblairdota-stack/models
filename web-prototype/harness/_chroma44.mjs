// chroma-44: THE TWO LADDERS, SIDE BY SIDE, FOR ANY PAIR OF IMAGES.
//
// Round 18's last open complaint is a SHAPE: *"the chroma ladder is a ramp where the bar's is
// flat."* Every sweep after that needs the same two rows printed the same way, or the round
// argues about numbers taken three different ways. This is that print.
//
// (r-b)/L per luminance decile — `grade.mjs`'s own chroma definition, applied to every decile
// rather than only the top one, which is the whole point: the gate looks at decile 10 and the
// defect lives at 2 and 3.
//
//   node harness/_chroma44.mjs <imgA> <imgB> ...
import { openCanvasPage, toDataURL } from './imglib.mjs';
const imgs = process.argv.slice(2);
const { browser, page } = await openCanvasPage();
for (const img of imgs) {
  const durl = await toDataURL(img);
  const r = await page.evaluate(async (durl) => {
    const im = new Image(); im.src = durl; await im.decode();
    const cv = document.createElement('canvas');
    cv.width = im.naturalWidth; cv.height = im.naturalHeight;
    const cx = cv.getContext('2d'); cx.drawImage(im, 0, 0);
    const d = cx.getImageData(0, 0, cv.width, cv.height).data;
    const n = d.length / 4;
    const L = new Float32Array(n), RB = new Float32Array(n);
    for (let i = 0, j = 0; j < n; j++, i += 4) {
      L[j] = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      RB[j] = d[i] - d[i + 2];
    }
    const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => L[a] - L[b]);
    const lad = [], chr = [];
    for (let k = 0; k < 10; k++) {
      const a = Math.floor(n * k / 10), b = Math.floor(n * (k + 1) / 10);
      let sl = 0, sc = 0;
      for (let i = a; i < b; i++) { sl += L[idx[i]]; sc += RB[idx[i]]; }
      const mL = sl / (b - a);
      lad.push(+mL.toFixed(1));
      chr.push(+(sc / (b - a) / Math.max(mL, 1e-3)).toFixed(2));
    }
    let med = L[idx[n >> 1]], black = 0;
    for (let i = 0; i < n; i++) if (L[i] < 2) black++;
    return { lad, chr, med: +med.toFixed(1), black: +(100 * black / n).toFixed(1), w: cv.width, h: cv.height };
  }, durl);
  console.log(`\n${img}  ${r.w}x${r.h}`);
  console.log(`  L      ${r.lad.map((v) => String(v).padStart(6)).join('')}   median ${r.med}  black ${r.black}%`);
  console.log(`  (r-b)/L${r.chr.map((v) => String(v).padStart(6)).join('')}`);
}
await browser.close();
