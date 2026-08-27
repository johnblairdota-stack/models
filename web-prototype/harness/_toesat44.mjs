// toe-sat-44: SWEEP THE TOE DESATURATION, AT SEVERAL CAMERAS, ON AS FEW BOOTS AS POSSIBLE.
//
// ⚠ THE CAMERA IS A NAVIGATION AND THE GRADE IS NOT. `_eye18_sweep`'s header: the view fits its
// planar reflection cameras at BUILD time from the active preset, so a preset must be a page
// load. A grade term is a uniform and needs neither — so this navigates once per camera and
// sweeps every value inside that boot.
//
// ⚠ AND THE GRADE IS SNAPSHOT AND RESTORED PER VARIANT. `setGrade` MERGES. Round 18 lost four
// rows of a sweep to a variant that set `haze: 0` and left it set for everything after it.
//
//   node harness/_toesat44.mjs --cams overlook,eye.win --values 0,0.4,0.7 --out DIR [--field midWarm]
import { chromium } from 'playwright';
import net from 'node:net';
import { writeFileSync, mkdirSync } from 'node:fs';
const PORT = 5178;
const argv = process.argv.slice(2);
const opt = (n, d = null) => (argv.indexOf('--' + n) >= 0 ? argv[argv.indexOf('--' + n) + 1] : d);
const OUT = opt('out') || 'out';
const CAMS = (opt('cams') || 'overlook').split(',');
const VALUES = (opt('values') || '0,0.4,0.7').split(',').map(Number);
// which grade field to sweep — the mechanism is the same for any scalar the grade carries
const FIELD = opt('field') || 'toeSat';
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
  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${PORT}/?view=room.ballroom&capture=1&cam=${encodeURIComponent(cam)}`,
    { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1',
    null, { timeout: 900000 });
  await page.evaluate(() => window.__rrr.settle(8));
  for (const v of VALUES) {
    await page.evaluate(({ v, field }) => {
      const g = window.__rrr.engine.pipeline.grade;
      window.__toeSaved = window.__toeSaved ?? (g[field] ?? 0);
      window.__rrr.setGrade({ [field]: v });
      window.__rrr.redraw();
    }, { v, field: FIELD });
    const buf = await page.locator('canvas').first().screenshot();
    const f = `${OUT}/_toe44-${FIELD}-${cam.replace(/\./g, '_')}-${String(v).replace('.', 'p')}.png`;
    writeFileSync(f, buf);
    console.log(`  ${cam} ${FIELD} ${v} -> ${f}`);
  }
  await page.evaluate((field) => window.__rrr.setGrade({ [field]: window.__toeSaved ?? 0 }), FIELD);
  console.log(`  (${cam} done in ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}
await browser.close();
