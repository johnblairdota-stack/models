/** Crop and 3x upscale a region for close inspection. Usage: node _critic6_zoom.mjs <src> <out> x,y,w,h [scale=3] */
import { chromium } from 'playwright';
import fs from 'node:fs';
const [src, out, rect, scaleS] = process.argv.slice(2);
const [x, y, w, h] = rect.split(',').map(Number);
const scale = +(scaleS ?? 3);
const b = fs.readFileSync(src).toString('base64');
const br = await chromium.launch();
const pg = await br.newPage();
const png = await pg.evaluate(async ([b64, X, Y, W, H, S]) => {
  const bin = atob(b64); const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const bmp = await createImageBitmap(new Blob([arr], { type: 'image/png' }));
  const oc = new OffscreenCanvas(W * S, H * S);
  const g = oc.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(bmp, X, Y, W, H, 0, 0, W * S, H * S);
  const blob = await oc.convertToBlob({ type: 'image/png' });
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = ''; for (const v of buf) s += String.fromCharCode(v);
  return btoa(s);
}, [b, x, y, w, h, scale]);
fs.writeFileSync(out, Buffer.from(png, 'base64'));
await br.close();
console.log('wrote', out);
