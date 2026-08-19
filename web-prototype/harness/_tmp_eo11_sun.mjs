/**
 * estate-owner-11: sweep the ballroom's one daylight spot in a single boot and write a full
 * frame per value, so `grade.mjs` can be run on each without paying a cold compile per arm.
 *   node harness/_tmp_eo11_sun.mjs 300,380,460
 */
import { chromium } from 'playwright';
import net from 'node:net';
import { writeFileSync } from 'node:fs';

const PORT = 5178;
const VALUES = (process.argv[2] ?? '300,400').split(',').map(Number);
const DIR = 'C:/Users/John/AppData/Local/Temp/claude';

const portOpen = (p) => new Promise((res) => {
  const s = net.connect(p, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
});
if (!(await portOpen(PORT))) { console.error('vite not running on 5178'); process.exit(3); }

const browser = await chromium.launch({
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--disable-frame-rate-limit',
    '--force-device-scale-factor=1', '--hide-scrollbars'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.routeWebSocket((u) => u.hostname === '127.0.0.1' && u.port === String(PORT), () => {});
await page.goto(`http://127.0.0.1:${PORT}/?view=room.ballroom&capture=1`, { waitUntil: 'load', timeout: 45000 });
await page.waitForFunction(() => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1', null, { timeout: 240000 });
await page.evaluate((n) => window.__rrr.settle(n), 16);

const census = await page.evaluate(() => {
  const s = window.__rrr.engine.scene;
  const out = [];
  s.traverse((o) => { if (o.isSpotLight) out.push({ type: 'spot', i: o.intensity, angle: +o.angle.toFixed(3) }); });
  return out;
});
console.log('spots:', JSON.stringify(census));

for (const v of VALUES) {
  await page.evaluate((val) => {
    const s = window.__rrr.engine.scene;
    s.traverse((o) => { if (o.isSpotLight) o.intensity = val; });
  }, v);
  await page.evaluate((n) => window.__rrr.settle(n), 6);
  const buf = await page.screenshot({ clip: { x: 0, y: 0, width: 1920, height: 1080 } });
  const f = `${DIR}/eo11-sun-${v}.png`;
  writeFileSync(f, buf);
  console.log(`sun ${v} -> ${f}`);
}
await browser.close();
