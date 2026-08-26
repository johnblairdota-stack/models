// red-area-26: how much of the frame is saturated red, in both pictures. The decile mask says
// this room's deciles 1-3 are dominated by the drapes and the cornice bands; the bar carries
// the same drapes at the same colour and still reads 0.40 at decile 2, so the question is how
// much of the frame each one's velvet actually covers.
import { openCanvasPage, toDataURL } from './imglib.mjs';
const imgs = process.argv.slice(2);
const { browser, page } = await openCanvasPage();
for (const img of imgs) {
  const durl = await toDataURL(img);
  const r = await page.evaluate(async (durl) => {
    const im = new Image(); im.src = durl; await im.decode();
    const cv = document.createElement('canvas');
    cv.width = im.naturalWidth; cv.height = im.naturalHeight;
    cv.getContext('2d').drawImage(im, 0, 0);
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let red = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      const R = d[i], G = d[i + 1], B = d[i + 2];
      n++;
      const L = 0.2126 * R + 0.7152 * G + 0.0722 * B;
      // saturated red: red well clear of both others, and both others close together
      if (L > 4 && R > G * 1.7 && R > B * 1.7 && Math.abs(G - B) < 0.35 * R) red++;
    }
    return +(100 * red / n).toFixed(2);
  }, durl);
  console.log(`  ${img.split('/').pop().padEnd(24)} ${r}% saturated red`);
}
await browser.close();
