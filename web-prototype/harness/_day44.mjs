// day-44: SWEEP THE DAYLIGHT BOX'S HUE. One navigation per value — the shell is BAKED.
//
// `ballroomEnv` goes through `roomEnv`, which bakes a PMREM and caches it by key, so unlike a
// grade term or a light colour this cannot be swept inside one boot. The key carries `day` for
// exactly the reason the baker's own header gives: an option outside the cache key is served
// the wrong bake, silently, and the sweep reports four pictures of the first value.
//
//   node harness/_day44.mjs --cams overlook,eye.door --values 0,0.5,1,1.5 --out DIR
import { chromium } from 'playwright';
import net from 'node:net';
import { writeFileSync, mkdirSync } from 'node:fs';
const PORT = 5178;
const argv = process.argv.slice(2);
const opt = (n, d = null) => (argv.indexOf('--' + n) >= 0 ? argv[argv.indexOf('--' + n) + 1] : d);
const OUT = opt('out') || 'out';
const CAMS = (opt('cams') || 'overlook').split(',');
const VALUES = (opt('values') || '0,0.5,1,1.5').split(',');
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
  for (const v of VALUES) {
    const t0 = Date.now();
    await page.goto(`http://127.0.0.1:${PORT}/?view=room.ballroom&capture=1&cam=${encodeURIComponent(cam)}&day=${v}`,
      { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1',
      null, { timeout: 900000 });
    await page.evaluate(() => window.__rrr.settle(12));
    const buf = await page.screenshot({ type: 'png' });
    const f = `${OUT}/_day44-${cam.replace(/\./g, '_')}-${String(v).replace('.', 'p')}.png`;
    writeFileSync(f, buf);
    console.log(`  ${cam} day=${v} -> ${f}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
}
await browser.close();
