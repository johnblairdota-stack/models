// critic-estate-9: nearest-neighbor upscale two PNGs 6x so tiny plate crops can be inspected
// pixel-for-pixel without a resize filter adding its own blur.
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';

/*
 * builder-face added the optional per-image SCALE (5th/6th args, both defaulting to 6, so every
 * existing 4-arg caller is unchanged). It exists because comparing a crop of the 1024 px art
 * against a crop of a 1920 px render at the SAME zoom compares two different magnifications of
 * the face — the art's visor is 113 px across and the render's is 80, so a flat 6x makes the art
 * look 41% bigger and every judgement about stroke weight is then a judgement about the crop.
 * Matched scale means scaleArt / scaleRender = renderVisorPx / artVisorPx.
 */
const [inA, outA, inB, outB, sA, sB] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage();

async function upscale(inPath, outPath, scale = 6) {
  const buf = await readFile(inPath);
  const dataUrl = `data:image/png;base64,${buf.toString('base64')}`;
  const out = await page.evaluate(async ({ url, SCALE }) => {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * SCALE); c.height = Math.round(img.height * SCALE);
    const cx = c.getContext('2d'); cx.imageSmoothingEnabled = false;
    cx.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  }, { url: dataUrl, SCALE: scale });
  const b64 = out.split(',')[1];
  await writeFile(outPath, Buffer.from(b64, 'base64'));
}

await upscale(inA, outA, sA ? Number(sA) : 6);
await upscale(inB, outB, sB ? Number(sB) : 6);
await browser.close();
console.log('done');
