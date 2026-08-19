/**
 * 🚪 `doorlook-1`'s LINE-UP — four doors, the same crop, the same standoff, no labels.
 *
 * The deliverable John asked for: *"a capture of an exterior chained door and an interior
 * breachable one side by side that John cannot tell them apart."* Two of these four are
 * UNDAMAGEABLE exterior sites on the edge of the map and two are interior panels the hunter can
 * batter through. The key is printed to stdout, not drawn on the image, because a labelled
 * line-up is not an identification test.
 *
 *   node harness/_dl1-lineup.mjs
 *
 * Sources are the frames `_dl1-doors.mjs` already wrote, all parked square at 3.2 m with the
 * body hidden, so the crop rect is the same rect in every one of them.
 */
import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOT = (n) => path.join(ROOT, 'progress/playtest', n);

/** [file, what it really is] — the ORDER on the sheet is deliberately not kind-sorted. */
const PANE = [
  ['game.play.dl1-chained-stair.png', 'x.study_e.stair — PERIMETER, chained, cannot be forced'],
  ['game.play.dl1-breach-galw.png', 'p.gal_w — interior, breachable, the hunter batters this one'],
  ['game.play.dl1-chained-galn.png', 'x.gallery.north_w — PERIMETER, chained, cannot be forced'],
  ['game.play.dl1-breach-chapel.png', 'p.chapel — interior, breachable, the hunter batters this one'],
];
const RECT = [548, 232, 250, 282];      // the aperture, in every one of these frames
const SCALE = 2;
const OUT = SHOT('_dl1-lineup.png');

for (const [f] of PANE) {
  // 🚨 CAPTURES LIE — a missing source silently draws nothing and the sheet still writes.
  if (!existsSync(SHOT(f))) { console.error(`MISSING ${SHOT(f)} — run _dl1-doors.mjs --shots first`); process.exit(1); }
}
const html = path.join(os.tmpdir(), '_dl1_lineup.html');
writeFileSync(html, `<!doctype html><html><body style="margin:0">${
  PANE.map(([f], i) => `<img id="i${i}" src="${pathToFileURL(SHOT(f)).href}">`).join('')
}</body></html>`);

const W = RECT[2] * SCALE, H = RECT[3] * SCALE, GAP = 10;
const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: { width: W * 4 + GAP * 5, height: H + GAP * 2 } });
await page.goto(pathToFileURL(html).href);
await page.waitForFunction((n) => [...Array(n).keys()].every((i) => document.getElementById('i' + i).complete), PANE.length);

const dataUrl = await page.evaluate(({ n, R, W, H, GAP }) => {
  const cv = document.createElement('canvas');
  cv.width = W * n + GAP * (n + 1); cv.height = H + GAP * 2;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#101215'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.imageSmoothingEnabled = false;
  for (let i = 0; i < n; i++) {
    ctx.drawImage(document.getElementById('i' + i), R[0], R[1], R[2], R[3], GAP + i * (W + GAP), GAP, W, H);
    ctx.fillStyle = '#e8e8e8'; ctx.font = '20px monospace';
    ctx.fillText(String.fromCharCode(65 + i), GAP + i * (W + GAP) + 8, GAP + 26);
  }
  return cv.toDataURL('image/png');
}, { n: PANE.length, R: RECT, W, H, GAP });

writeFileSync(OUT, Buffer.from(dataUrl.split(',')[1], 'base64'));
await browser.close();
console.log(`wrote ${OUT}`);
console.log('KEY (not drawn on the sheet):');
PANE.forEach(([, what], i) => console.log(`  ${String.fromCharCode(65 + i)}  ${what}`));
