// eye-sweep-17: mean RGB/L of a rectangle of an image. Round 14 solved this room's parquet
// albedo by matching a shaded-floor patch of the render to one of the bar at meanL 36.2; round
// 17 moved the fill up 3.5x, so that match has to be re-read rather than assumed.
//   node harness/_eye17_rect.mjs --img a.png --rect 200,760,500,140 --img b.png --rect ...
import { toDataURL, openCanvasPage } from './imglib.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const jobs = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--img') jobs.push({ img: argv[++i], rects: [] });
  if (argv[i] === '--rect') jobs[jobs.length - 1].rects.push(argv[++i].split(',').map(Number));
}
const { page, browser } = await openCanvasPage();
for (const j of jobs) {
  const abs = path.isAbsolute(j.img) ? j.img : path.join(ROOT, j.img);
  const url = await toDataURL(abs);
  const r = await page.evaluate(async ({ u, rects }) => {
    const im = new Image(); im.src = u; await im.decode();
    const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0);
    return rects.map(([rx, ry, rw, rh]) => {
      const d = x.getImageData(rx, ry, rw, rh).data;
      let R = 0, G = 0, B = 0; const n = d.length / 4;
      for (let i = 0; i < d.length; i += 4) { R += d[i]; G += d[i + 1]; B += d[i + 2]; }
      R /= n; G /= n; B /= n;
      return { R, G, B, L: 0.2126 * R + 0.7152 * G + 0.0722 * B, sat: (Math.max(R, G, B) - Math.min(R, G, B)) };
    });
  }, { u: url, rects: j.rects });
  r.forEach((v, i) => console.log(`${path.basename(j.img).padEnd(24)} rect${i} `
    + `rgb ${v.R.toFixed(1)},${v.G.toFixed(1)},${v.B.toFixed(1)}  L ${v.L.toFixed(1)}  chroma ${v.sat.toFixed(1)}`));
}
await browser.close();
