// estate-owner-12: report natural pixel dimensions of any image the measurement tools accept.
// The PNG header read in node lied on refs/bf1/bf1-ballroom-01.png (a non-standard chunk
// layout), so this asks the decoder rather than the bytes.
import { toDataURL, openCanvasPage } from '../imglib.mjs';

const files = process.argv.slice(2);
const { browser, page } = await openCanvasPage();
for (const f of files) {
  const url = await toDataURL(f);
  const d = await page.evaluate(async (u) => {
    const img = new Image(); img.src = u; await img.decode();
    return [img.naturalWidth, img.naturalHeight];
  }, url);
  console.log(`${f}  ${d[0]}x${d[1]}`);
}
await browser.close();
