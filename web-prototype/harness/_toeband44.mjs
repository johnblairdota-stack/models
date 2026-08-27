// toe-band-44: SWEEP THE TOE WEIGHT'S SHAPE, NOT JUST ITS STRENGTH.
//
// The reference's chroma ladder is 0.79 / 0.40 / 0.38 / 0.40 — a spike in the darkest tenth and
// then flat. A desaturation weight that falls from black takes the most out of decile 1 and the
// least out of 2 and 3, which is the opposite of what that pair of ladders asks for: it landed
// decile 1 exactly and left decile 2 at 0.78 against 0.41. This sweeps (strength, lo, hi) so the
// weight can be a HUMP over deciles 2-3.
//
// ⚠ Every variant restores the three fields first — `setGrade` MERGES, and a sweep that leaves
// the previous row's `lo` set measures two changes and reports one.
//
//   node harness/_toeband44.mjs --cams overlook --out DIR
import { chromium } from 'playwright';
import net from 'node:net';
import { writeFileSync, mkdirSync } from 'node:fs';
const PORT = 5178;
const argv = process.argv.slice(2);
const opt = (n, d = null) => (argv.indexOf('--' + n) >= 0 ? argv[argv.indexOf('--' + n) + 1] : d);
const OUT = opt('out') || 'out';
const CAMS = (opt('cams') || 'overlook').split(',');
const VARIANTS = [
  { id: 'ship', sat: 0.35, lo: 0, hi: 0.20 },
  { id: 'n-a', sat: 0.65, lo: 0.125, hi: 0.175 },
  { id: 'n-b', sat: 0.80, lo: 0.125, hi: 0.175 },
  { id: 'n-c', sat: 0.65, lo: 0.135, hi: 0.185 },
  { id: 'n-d', sat: 0.80, lo: 0.115, hi: 0.165 },
  { id: 'n-e', sat: 1.00, lo: 0.130, hi: 0.170 },
];
const portOpen = (p) => new Promise((r) => {
  const s = net.connect(p, '127.0.0.1');
  s.on('connect', () => { s.destroy(); r(true); }); s.on('error', () => r(false));
});
if (!(await portOpen(PORT))) { console.error('vite not running on 5178'); process.exit(3); }
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (e) => console.log('[E]', String(e).slice(0, 200)));
await page.routeWebSocket((u) => u.port === String(PORT), () => {});
for (const cam of CAMS) {
  await page.goto(`http://127.0.0.1:${PORT}/?view=room.ballroom&capture=1&cam=${encodeURIComponent(cam)}`,
    { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1',
    null, { timeout: 900000 });
  await page.evaluate(() => window.__rrr.settle(10));
  for (const v of VARIANTS) {
    await page.evaluate((v) => {
      const g = window.__rrr.engine.pipeline.grade;
      if (!window.__toeband) {
        window.__toeband = { toeSat: g.toeSat ?? 0, toeSatLo: g.toeSatLo ?? 0, toeSatHi: g.toeSatHi ?? 0.2 };
      }
      window.__rrr.setGrade({ toeSat: v.sat, toeSatLo: v.lo, toeSatHi: v.hi });
      window.__rrr.redraw();
    }, v);
    const buf = await page.locator('canvas').first().screenshot();
    const f = `${OUT}/_toeband44-${cam.replace(/\./g, '_')}-${v.id}.png`;
    writeFileSync(f, buf);
    console.log(`  ${cam} ${v.id} sat ${v.sat} lo ${v.lo} hi ${v.hi} -> ${f}`);
  }
  await page.evaluate(() => window.__rrr.setGrade(window.__toeband));
}
await browser.close();
