// hi-lo-44: THE SHAPE OF THE TOP END, WHICH THE DECILE LADDER SUMMARISES AWAY.
//
// The two ladders agree decile for decile until the last two: the reference's ninth and tenth
// deciles sit at L 102.9 and 217.6 where this room's sit at 96.3 and 176.8. A 41-count gap in
// the brightest tenth is not a grade offset — the medians are 49.7 and 49.3 — it is a different
// distribution up there, and (r-b)/L in that band follows whatever it is made of. This prints
// the tail so the difference can be named.
//
//   node harness/_hilo44.mjs <imgA> <imgB> ...
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
    const cuts = [140, 170, 200, 220, 240, 250, 254];
    const cnt = cuts.map(() => 0), rb = cuts.map(() => 0);
    for (let i = 0, j = 0; j < n; j++, i += 4) {
      const L = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      for (let k = 0; k < cuts.length; k++) if (L >= cuts[k]) { cnt[k]++; rb[k] += d[i] - d[i + 2]; }
    }
    return { cuts, pct: cnt.map((c) => 100 * c / n), rb: rb.map((v, k) => (cnt[k] ? v / cnt[k] : 0)) };
  }, durl);
  console.log(`\n${img}`);
  console.log('   L >=      ' + r.cuts.map((c) => String(c).padStart(7)).join(''));
  console.log('   % frame   ' + r.pct.map((p) => p.toFixed(2).padStart(7)).join(''));
  console.log('   mean r-b  ' + r.rb.map((v) => v.toFixed(1).padStart(7)).join(''));
}
await browser.close();
