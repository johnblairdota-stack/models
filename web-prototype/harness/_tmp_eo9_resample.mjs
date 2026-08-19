// estate-owner-9 scratch: down-sample a PNG to a target size, then nearest-neighbour zoom it,
// so a reference rendered at a convenient resolution can be compared at the size the plate
// ACTUALLY occupies on screen. Usage: node _tmp_eo9_resample.mjs <src> <w> <h> <zoom> <out>
import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
import os from 'node:os';

const [, , srcPath, ws, hs, zs, outPath] = process.argv;
const w = +ws, h = +hs, z = +zs;
const url = pathToFileURL(path.resolve(srcPath)).href;
const htmlPath = path.join(os.tmpdir(), '_tmp_eo9_resample.html');
writeFileSync(htmlPath, `<!doctype html><html><body style="margin:0"><img id="im" src="${url}"></body></html>`);

const browser = await chromium.launch({ args: ['--allow-file-access-from-files', '--disable-web-security'] });
const page = await browser.newPage({ viewport: { width: 400, height: 400 } });
await page.goto(pathToFileURL(htmlPath).href);
await page.waitForFunction(() => document.getElementById('im').complete);
const dataUrl = await page.evaluate(({ w, h, z }) => {
  const img = document.getElementById('im');
  const a = document.createElement('canvas');
  a.width = w; a.height = h;
  const ac = a.getContext('2d');
  ac.imageSmoothingEnabled = true; ac.imageSmoothingQuality = 'high';
  ac.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, 0, 0, w, h);
  const b = document.createElement('canvas');
  b.width = w * z; b.height = h * z;
  const bc = b.getContext('2d');
  bc.imageSmoothingEnabled = false;
  bc.drawImage(a, 0, 0, w, h, 0, 0, w * z, h * z);
  return b.toDataURL('image/png');
}, { w, h, z });
writeFileSync(outPath, Buffer.from(dataUrl.split(',')[1], 'base64'));
console.log(`wrote ${outPath}  ${w}x${h} -> ${w * z}x${h * z}`);
await browser.close();
