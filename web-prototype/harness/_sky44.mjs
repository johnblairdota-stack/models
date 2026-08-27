// sky-44: THE BRIGHTEST NEUTRAL BLOCK IN THE FRAME IS THE SKY BEHIND THE WINDOWS.
//
// `_coolmask44 … neutralcool` at decile 7 and above paints 18.3% of the frame, and the largest
// solid block of it is the four windows. `room-ballroom.js` builds that as an unlit HDR card,
// `skyMat.color.setRGB(2.60, 2.66, 2.80)` — r/b 0.929. The reference's own top decile carries
// (r-b)/L 0.09 and this room's carries 0.002 at `overlook`, so the bar's brightest pixels are
// WARMER than this room's, not cooler, and the gate's 0.14 ceiling has the whole gap in hand.
//
// ⚠ EVERY VARIANT HOLDS THE CARD'S LUMINANCE. A sky tint that also changed the amount would move
// the window's exposure, the bloom threshold and the room's own fill in one number — the third
// time this round that trap has had to be designed out rather than noticed afterwards.
//
//   node harness/_sky44.mjs --cams overlook,eye.win --out DIR
import { chromium } from 'playwright';
import net from 'node:net';
import { writeFileSync, mkdirSync } from 'node:fs';
const PORT = 5178;
const argv = process.argv.slice(2);
const opt = (n, d = null) => (argv.indexOf('--' + n) >= 0 ? argv[argv.indexOf('--' + n) + 1] : d);
const OUT = opt('out') || 'out';
const CAMS = (opt('cams') || 'overlook').split(',');
const VARIANTS = [
  { id: 'base', tint: [1.00, 1.00, 1.00] },
  { id: 'neutral', tint: [1.04, 1.01, 0.96] },
  { id: 'warm-1', tint: [1.10, 1.00, 0.90] },
  { id: 'warm-2', tint: [1.18, 1.00, 0.84] },
  { id: 'warm-3', tint: [1.28, 1.00, 0.76] },
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
    const n = await page.evaluate((v) => {
      const e = window.__rrr.engine;
      // find it ONCE and remember the ORIGINAL colour — the sweep repaints it, so a search that
      // matches on the current value finds nothing after the first variant. Third time this
      // round; it is now the first thing every one of these harnesses does.
      if (!window.__sky44) {
        const hits = [];
        e.scene.traverse((o) => {
          const ms = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
          for (const m of ms) {
            if (m && m.isMeshBasicMaterial && Math.abs(m.color.r - 2.60) < 0.02
              && Math.abs(m.color.b - 2.80) < 0.02) hits.push({ m, r: m.color.r, g: m.color.g, b: m.color.b });
          }
        });
        window.__sky44 = hits;
      }
      const W = [0.2126, 0.7152, 0.0722];
      for (const h of window.__sky44) {
        const t = [h.r * v.tint[0], h.g * v.tint[1], h.b * v.tint[2]];
        const l0 = W[0] * h.r + W[1] * h.g + W[2] * h.b;
        const l1 = W[0] * t[0] + W[1] * t[1] + W[2] * t[2];
        const k = l1 > 1e-6 ? l0 / l1 : 1;
        h.m.color.setRGB(t[0] * k, t[1] * k, t[2] * k);
      }
      window.__rrr.redraw();
      return window.__sky44.length;
    }, v);
    const buf = await page.locator('canvas').first().screenshot();
    const f = `${OUT}/_sky44-${cam.replace(/\./g, '_')}-${v.id}.png`;
    writeFileSync(f, buf);
    console.log(`  ${cam} ${v.id} (${n} sky cards) -> ${f}`);
  }
  await page.evaluate(() => { for (const h of window.__sky44 ?? []) h.m.color.setRGB(h.r, h.g, h.b); });
}
await browser.close();
