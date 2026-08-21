/**
 * Find the teal breach in a frame and crop a square around it, with a margin, so the crop is a
 * NO-CONTEXT view of the hole. Usage:
 *   node harness/evidence/_tmp_holecrop.mjs <src.png> <out.png> [pad=1.35] [max=520]
 * Prints the bbox it found so two frames can be checked for the same framing.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const [src, out, padS, maxS] = process.argv.slice(2);
const pad = +(padS ?? 1.35);
const max = +(maxS ?? 520);
const b = fs.readFileSync(src).toString('base64');
const br = await chromium.launch();
const pg = await br.newPage();
const r = await pg.evaluate(async ([b64, PAD, MAX]) => {
  const bin = atob(b64); const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const bmp = await createImageBitmap(new Blob([arr], { type: 'image/png' }));
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, 0, 0);
  const d = g.getImageData(0, 0, bmp.width, bmp.height).data;
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, n = 0;
  for (let y = 0; y < bmp.height; y++) {
    for (let x = 0; x < bmp.width; x++) {
      const o = (y * bmp.width + x) * 4;
      const R = d[o], G = d[o + 1], B = d[o + 2];
      if (B >= 34 && B > R * 1.55 && G > R * 1.20) {
        n++;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (n < 40) return { w: bmp.width, h: bmp.height, n, teal: null, png: null };
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  let side = Math.max(x1 - x0, y1 - y0) * PAD;
  side = Math.min(side, bmp.width, bmp.height);
  let X = Math.round(cx - side / 2), Y = Math.round(cy - side / 2);
  X = Math.max(0, Math.min(X, bmp.width - side));
  Y = Math.max(0, Math.min(Y, bmp.height - side));
  const S = Math.round(side);
  const outS = Math.min(MAX, S);
  const oc = new OffscreenCanvas(outS, outS);
  oc.getContext('2d').drawImage(bmp, X, Y, S, S, 0, 0, outS, outS);
  const blob = await oc.convertToBlob({ type: 'image/png' });
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = ''; for (const v of buf) s += String.fromCharCode(v);
  return {
    w: bmp.width, h: bmp.height, n,
    teal: [x0, y0, x1, y1], crop: [X, Y, S, outS], png: btoa(s),
  };
}, [b, pad, max]);
if (r.png) fs.writeFileSync(out, Buffer.from(r.png, 'base64'));
await br.close();
console.log(JSON.stringify({ src, ...r, png: undefined }));
