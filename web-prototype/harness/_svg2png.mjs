// Rasterise an SVG file to PNG through the harness's existing Playwright, so a Python diagnostic
// can produce a picture that an agent can actually READ. No image library is installed and none
// needs to be.
//
//   node harness/_svg2png.mjs in.svg out.png [scale]
//
// CONTROL: the page is asked for the SVG's own intrinsic width/height AFTER load and the shot is
// clipped to exactly that. If the file failed to parse, the <svg> element is absent and the script
// exits 2 rather than writing a blank canvas that would read as "the geometry is empty".
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import path from 'path';

const [inSvg, outPng, scaleArg] = process.argv.slice(2);
const scale = Number(scaleArg || 1);
const svg = readFileSync(inSvg, 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: scale });
await page.setContent(`<body style="margin:0">${svg}</body>`);
const box = await page.evaluate(() => {
  const el = document.querySelector('svg');
  if (!el) return null;
  return { w: +el.getAttribute('width'), h: +el.getAttribute('height') };
});
if (!box || !box.w || !box.h) {
  console.error(`no <svg> with width/height in ${inSvg} - refusing to write a blank png`);
  process.exit(2);
}
await page.setViewportSize({ width: Math.ceil(box.w), height: Math.ceil(box.h) });
await page.screenshot({ path: path.resolve(outPng) });
console.log(`${outPng}  ${box.w}x${box.h} @${scale}x`);
await browser.close();
