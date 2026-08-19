// estate-owner-11 scratch: box-filter a PNG down to a target size, then nearest-upscale it,
// so "what a correctly filtered N-pixel plate could show" can be put beside "what the plate
// actually shows on screen". The gap between those two is the sampling loss.
//   node harness/_tmp_eo11_ideal.mjs <src> <dstW> <dstH> <out> [zoom=6]
import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
import os from 'node:os';

const [, , src, dw, dh, out, zs] = process.argv;
const url = pathToFileURL(path.resolve(src)).href;
const htmlPath = path.join(os.tmpdir(), '_tmp_eo11_ideal.html');
writeFileSync(htmlPath, `<!doctype html><html><body style="margin:0"><img id="im" src="${url}"></body></html>`);
const W = +dw, H = +dh, Z = +(zs || 6);

const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: { width: Math.min(W * Z, 4000), height: Math.min(H * Z, 4000) } });
await page.goto(pathToFileURL(htmlPath).href);
await page.waitForFunction(() => document.getElementById('im').complete);
const dataUrl = await page.evaluate(({ W, H, Z }) => {
  const img = document.getElementById('im');
  const a = document.createElement('canvas');
  a.width = W; a.height = H;
  const ax = a.getContext('2d');
  ax.imageSmoothingEnabled = true;
  ax.imageSmoothingQuality = 'high';
  ax.drawImage(img, 0, 0, W, H);
  const b = document.createElement('canvas');
  b.width = W * Z; b.height = H * Z;
  const bx = b.getContext('2d');
  bx.imageSmoothingEnabled = false;
  bx.drawImage(a, 0, 0, W * Z, H * Z);
  return b.toDataURL('image/png');
}, { W, H, Z });
writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
console.log('wrote', out, `${W}x${H} x${Z}`);
await browser.close();
