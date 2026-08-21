import { chromium } from 'playwright';
import fs from 'node:fs';

const [src, xs, ys, xe, ye, out, scale] = process.argv.slice(2);
const pad = 40;
const x0 = Math.max(0, +xs - pad), y0 = Math.max(0, +ys - pad);
const x1 = +xe + pad, y1 = +ye + pad;
const b = fs.readFileSync(src).toString('base64');
const br = await chromium.launch();
const pg = await br.newPage();
const png = await pg.evaluate(async ([b64, x0, y0, x1, y1, sc]) => {
  const bin = atob(b64); const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const bmp = await createImageBitmap(new Blob([arr], { type: 'image/png' }));
  const w = x1 - x0, h = y1 - y0;
  const c = new OffscreenCanvas(w * sc, h * sc);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(bmp, x0, y0, w, h, 0, 0, w * sc, h * sc);
  const blob = await c.convertToBlob({ type: 'image/png' });
  const buf = await blob.arrayBuffer();
  let bin2 = '';
  const u8 = new Uint8Array(buf);
  for (let i = 0; i < u8.length; i++) bin2 += String.fromCharCode(u8[i]);
  return btoa(bin2);
}, [b, x0, y0, x1, y1, +scale || 4]);
fs.writeFileSync(out, Buffer.from(png, 'base64'));
console.log('wrote', out);
await br.close();
