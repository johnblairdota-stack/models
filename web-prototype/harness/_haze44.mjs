// haze-44: IS THE BRIGHT HALF OF THIS ROOM COLD BECAUSE THE HAZE IS?
//
// Round 44's class split found the sharpest statement anyone has made about this frame:
//
//     decile 9        cool pixels    their mean r-b    share of the band's (r-b)
//     bar                 0.2%           -10.5                 -0.1%
//     here               37.7%           -18.7                -72.8%
//
// More than a third of this room's ninth decile is cold light, and the bar's ninth decile is
// cold nowhere. That is not a chroma-ladder abstraction any more, it is a statement about what
// is lighting the bright surfaces — and `GRADES.ballroom` cools them on purpose: round 18 set
// `hazeColor` to [0.046, 0.056, 0.072] to fight an amber shade that the SAME round also fixed at
// the source with `bakeDust`. Two corrections for one defect is one correction too many, and
// haze is depth-weighted, so it lands hardest exactly where deciles 7-9 live.
//
// ⚠ THE GRADE IS SNAPSHOT AND RESTORED PER VARIANT — `setGrade` MERGES, and round 18 lost four
// rows of a sweep to a variant that set `haze: 0` and left it set for every row after it.
//
//   node harness/_haze44.mjs --cams overlook,eye.win --out DIR
import { chromium } from 'playwright';
import net from 'node:net';
import { writeFileSync, mkdirSync } from 'node:fs';
const PORT = 5178;
const argv = process.argv.slice(2);
const opt = (n, d = null) => (argv.indexOf('--' + n) >= 0 ? argv[argv.indexOf('--' + n) + 1] : d);
const OUT = opt('out') || 'out';
const CAMS = (opt('cams') || 'overlook').split(',');
/**
 * ⚠ **THE FIRST CUT OF THIS TABLE BUNDLED TWO CHANGES AND PRICED NEITHER.** It set
 * `haze: 0.042` on every variant — the GAME's value. `GRADES.ballroom` ships **0.026**, so
 * every row was a 62% haze increase as well as a hue change, and the median luminance fell
 * 49.3 -> 40.7 on the row that was supposed to be the neutral control. This project's own rule,
 * written down two rounds ago: a change that looks like a trade is usually two changes bundled
 * together — separate them before pricing it. Amount is held at the shipped value on every hue
 * arm, and gets one arm of its own.
 */
const HAZE0 = 0.026;
const VARIANTS = [
  { id: 'base' },
  { id: 'hue-neutral', haze: HAZE0, hazeColor: [0.058, 0.058, 0.058] },
  { id: 'hue-warm', haze: HAZE0, hazeColor: [0.072, 0.058, 0.042] },
  { id: 'hue-warmer', haze: HAZE0, hazeColor: [0.086, 0.060, 0.034] },
  { id: 'amount-1p6x', haze: 0.042, hazeColor: [0.046, 0.056, 0.072] },
  { id: 'both', haze: 0.042, hazeColor: [0.072, 0.058, 0.042] },
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
  await page.evaluate(() => window.__rrr.settle(8));
  for (const v of VARIANTS) {
    await page.evaluate((v) => {
      const g = window.__rrr.engine.pipeline.grade;
      if (!window.__haze44) {
        window.__haze44 = { haze: g.haze, hazeColor: (g.hazeColor ?? []).slice() };
      }
      const b = window.__haze44;
      window.__rrr.setGrade(v.haze == null
        ? { haze: b.haze, hazeColor: b.hazeColor.slice() }
        : { haze: v.haze, hazeColor: v.hazeColor.slice() });
      window.__rrr.redraw();
    }, v);
    const buf = await page.locator('canvas').first().screenshot();
    const f = `${OUT}/_haze44-${cam.replace(/\./g, '_')}-${v.id}.png`;
    writeFileSync(f, buf);
    console.log(`  ${cam} ${v.id} -> ${f}`);
  }
  await page.evaluate(() => {
    const b = window.__haze44;
    if (b) window.__rrr.setGrade({ haze: b.haze, hazeColor: b.hazeColor.slice() });
  });
}
await browser.close();
