// eye-sweep-17: apply an arbitrary live patch and SAVE THE FRAME. Sampling four pixels kept
// producing contradictory readings (a black-albedo parquet reading 131); a picture settles it.
//   node harness/_eye17_shot.mjs --cam eye.floor --out DIR label:'{"pqBlack":true}' ...
import { chromium } from 'playwright';
import net from 'node:net';
import { writeFileSync } from 'node:fs';

const PORT = 5178;
const argv = process.argv.slice(2);
const CAM = argv.includes('--cam') ? argv[argv.indexOf('--cam') + 1] : 'eye.floor';
const OUT = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : '.';
const SPECS = argv.filter((a) => a.includes(':') && !a.startsWith('-'));
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
await page.goto(`http://127.0.0.1:${PORT}/?view=room.ballroom&capture=1&cam=${CAM}`, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1', null, { timeout: 600000 });
await page.evaluate((n) => window.__rrr.settle(n), 16);
await page.evaluate(() => {
  const e = window.__rrr.engine;
  window.__pq = e.floorParquet; window.__ch = e.floorReflect;
  window.__s = { pq: window.__pq.material.color.getHex(), ch: window.__ch.material.color.getHex() };
});
for (const spec of SPECS) {
  const i = spec.indexOf(':');
  const label = spec.slice(0, i);
  await page.evaluate((q) => {
    const pq = window.__pq, ch = window.__ch;
    pq.visible = q.pqHide ? false : true;
    ch.visible = q.chHide ? false : true;
    pq.material.color.setHex(q.pqBlack ? 0x000000 : (q.pqRed ? 0xff0000 : window.__s.pq));
    ch.material.color.setHex(q.chGreen ? 0x00ff00 : window.__s.ch);
    pq.material.needsUpdate = true; ch.material.needsUpdate = true;
    if (q.sun != null) { let s = null; window.__rrr.engine.scene.traverse((o) => { if (o.isSpotLight && !s) s = o; }); if (s) { if (window.__sun0 == null) window.__sun0 = s.intensity; s.intensity = window.__sun0 * q.sun; } }
  }, JSON.parse(spec.slice(i + 1)));
  await page.evaluate((n) => window.__rrr.settle(n), 6);
  writeFileSync(`${OUT}/why-${label}.png`, await page.screenshot());
  console.log('wrote', `${OUT}/why-${label}.png`);
}
await browser.close();
