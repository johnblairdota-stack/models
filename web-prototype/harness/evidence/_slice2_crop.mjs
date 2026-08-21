#!/usr/bin/env node
/** Crop+zoom a region of a PNG for close inspection. --img in --out out --rect x,y,w,h --zoom n */
import { toDataURL, openCanvasPage } from '../imglib.mjs';
import { writeFile } from 'node:fs/promises';
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const IMG = opt('img'); const OUT = opt('out'); const RECT = opt('rect', '0,0,400,300').split(',').map(Number);
const ZOOM = +opt('zoom', 3);
const SMOOTH = opt('smooth', '0') === '1';
const [x, y, w, h] = RECT;
const { browser, page } = await openCanvasPage();
const durl = await toDataURL(IMG);
const out = await page.evaluate(async ({ durl, x, y, w, h, zoom, smooth }) => {
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = durl; });
  const c = document.createElement('canvas');
  c.width = w * zoom; c.height = h * zoom;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = !!smooth;
  if (smooth) ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, x, y, w, h, 0, 0, w * zoom, h * zoom);
  return c.toDataURL('image/png');
}, { durl, x, y, w, h, zoom: ZOOM, smooth: SMOOTH });
const buf = Buffer.from(out.split(',')[1], 'base64');
await writeFile(OUT, buf);
console.log('wrote', OUT);
await browser.close();
