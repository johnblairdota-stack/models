/**
 * estate-owner-11: sweep grade fields in ONE boot and write a full frame per variant.
 * `engine.pipeline.grade` is live and `window.__rrr.setGrade(obj)` re-uploads it, so a whole
 * A/B/C of the colour grade costs one shader compile instead of three.
 *
 *   node harness/_tmp_eo11_grade.mjs room.ballroom "base:{}" "neutral:{\"shadowTint\":[1.0,1.0,1.0]}"
 *
 * Each argument is <label>:<JSON patch>. The patch is merged over the view's own grade.
 */
import { chromium } from 'playwright';
import net from 'node:net';
import { writeFileSync } from 'node:fs';

const PORT = 5178;
const VIEW = process.argv[2] ?? 'room.ballroom';
const SPECS = process.argv.slice(3);
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
await page.goto(`http://127.0.0.1:${PORT}/?view=${VIEW}&capture=1`, { waitUntil: 'load', timeout: 45000 });
await page.waitForFunction(() => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1', null, { timeout: 240000 });
await page.evaluate((n) => window.__rrr.settle(n), 16);

const base = await page.evaluate(() => JSON.parse(JSON.stringify(window.__rrr.engine.pipeline.grade)));
console.log('base grade:', JSON.stringify(base));

for (const spec of SPECS) {
  const i = spec.indexOf(':');
  const label = spec.slice(0, i);
  const patch = JSON.parse(spec.slice(i + 1));
  const applied = await page.evaluate(({ base, patch }) => {
    window.__rrr.setGrade({ ...base, ...patch });
    return JSON.stringify(window.__rrr.engine.pipeline.grade.shadowTint);
  }, { base, patch });
  await page.evaluate((n) => window.__rrr.settle(n), 4);
  const buf = await page.screenshot({ clip: { x: 0, y: 0, width: 1920, height: 1080 } });
  const f = `${DIR}/eo11-grade-${label}.png`;
  writeFileSync(f, buf);
  console.log(`${label.padEnd(12)} shadowTint ${applied} -> ${f} (${(buf.length / 1024).toFixed(0)} KB)`);
}
await browser.close();
