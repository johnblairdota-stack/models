// eye-sweep-18: RE-VALIDATE EVERY PLAYER-EYE ANGLE ON ONE BOOT.
//
// The floor changed after the last sweep was taken (the plain bond went back to the panel),
// so every frame on the board is stale. Seventeen separate `shoot.mjs` runs is seventeen
// browser launches; this is one, navigated per preset.
//
// ⚠ IT MUST BE A NAVIGATION AND NOT A CAMERA MOVE. `room-ballroom.js` fits its planar
// reflection cameras at BUILD time from the active preset, so moving the camera live gives a
// frame whose mirrors are aimed at where the last preset was looking. That is the whole reason
// the presets live in source instead of being `--campose` overrides.
//
//   node harness/_eye18_sweep.mjs --out DIR [--only eye.door,eye.win]
import { chromium } from 'playwright';
import net from 'node:net';
import { writeFileSync, mkdirSync } from 'node:fs';

const PORT = 5178;
const argv = process.argv.slice(2);
const opt = (n, d = null) => (argv.indexOf('--' + n) >= 0 ? argv[argv.indexOf('--' + n) + 1] : d);
const OUT = opt('out') || '.';
const ALL = ['overlook', 'eye.door', 'eye.win', 'eye.mirror', 'eye.up', 'eye.corner',
  'eye.corner.ne', 'eye.corner.se', 'eye.corner.sw', 'eye.walk', 'eye.floor', 'eye.arch',
  'eye.vest', 'eye.gallery', 'eye.under', 'eye.back', 'eye.down'];
const CAMS = opt('only') ? opt('only').split(',') : ALL;

const portOpen = (p) => new Promise((res) => {
  const s = net.connect(p, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
});
if (!(await portOpen(PORT))) { console.error('vite not running on 5178'); process.exit(3); }
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--disable-frame-rate-limit',
    '--force-device-scale-factor=1', '--hide-scrollbars'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
// HMR off: a source save mid-sweep would otherwise reload the tab under a screenshot.
await page.routeWebSocket((u) => u.hostname === '127.0.0.1' && u.port === String(PORT), () => {});

for (const cam of CAMS) {
  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${PORT}/?view=room.ballroom&capture=1&cam=${encodeURIComponent(cam)}`,
    { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1',
    null, { timeout: 600000 });
  const err = await page.evaluate(() => document.body.dataset.rrrError === '1');
  if (err) { console.log(`${cam}\tERROR`); continue; }
  await page.evaluate((n) => window.__rrr.settle(n), 16);
  const buf = await page.screenshot({ type: 'png' });
  writeFileSync(`${OUT}/${cam}.png`, buf);
  // the round's own gate numbers, on the framebuffer, per angle
  const stats = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    const cv = document.createElement('canvas');
    cv.width = c.width; cv.height = c.height;
    cv.getContext('2d').drawImage(c, 0, 0);
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    // ⚠ LUMINANCE AND CHROMA STAY PAIRED PER PIXEL. The top-decile chroma gate is the mean
    // chroma OF THE BRIGHTEST TENTH, so sorting the two arrays separately would pair the
    // brightest luminances with the highest chromas and report a number the frame does not
    // contain. One array of [L, chroma] pairs, sorted once, on L.
    const raw = [];
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      raw.push([l, l > 1 ? (r - b) / l : 0]);
    }
    raw.sort((a, b) => a[0] - b[0]);
    const n = raw.length;
    const L = raw.map((p) => p[0]);
    const top = raw.slice(Math.floor(n * 0.9));
    const dark = raw.slice(0, Math.floor(n * 0.1));
    const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
    return {
      median: +L[Math.floor(n / 2)].toFixed(1),
      topChroma: +mean(top.map((p) => p[1])).toFixed(3),
      darkL: +mean(dark.map((p) => p[0])).toFixed(1),
      clipped: +(100 * raw.filter((p) => p[0] > 250).length / n).toFixed(2),
      calls: window.__rrr.engine?.renderer?.info?.render?.calls ?? -1,
      tris: window.__rrr.engine?.renderer?.info?.render?.triangles ?? -1,
    };
  });
  console.log(`${cam}\tmedL ${stats.median}\ttopChroma ${stats.topChroma}\tdarkL ${stats.darkL}\tclip% ${stats.clipped}\tcalls ${stats.calls}\ttris ${stats.tris}\t(${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
await browser.close();
