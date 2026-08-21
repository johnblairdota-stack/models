/**
 * estate-owner-11: sweep one planar-reflection uniform in a SINGLE boot and capture the plate
 * crop at each value. One browser, one baked reflection target, one settled frame per value —
 * so nothing but the knob changes between the images, unlike a per-value re-launch.
 *
 *   node harness/evidence/_tmp_eo11_knob.mjs uEoWobble 0.030,0.015,0.006,0
 *   node harness/evidence/_tmp_eo11_knob.mjs uEoSharp 0,0.35,0.55,0.9
 */
import { chromium } from 'playwright';
import net from 'node:net';
import { writeFileSync } from 'node:fs';

const PORT = 5178;
const KNOB = process.argv[2] ?? 'uEoWobble';
const VALUES = (process.argv[3] ?? '0.03,0').split(',').map(Number);
const MODE = process.argv[4] ?? 'sharp';
const DIR = process.argv[5] ?? 'C:/Users/John/AppData/Local/Temp/claude';

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
await page.goto(`http://127.0.0.1:${PORT}/?view=room.ballroom&capture=1&mirrorfilter=${MODE}`,
  { waitUntil: 'load', timeout: 45000 });
await page.waitForFunction(() => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1', null, { timeout: 240000 });
await page.evaluate((n) => window.__rrr.settle(n), 16);

const RECTS = { l: [945, 515, 95, 172], r: [1482, 428, 210, 268] };
for (const v of VALUES) {
  const applied = await page.evaluate(({ knob, v }) => {
    const e = window.__rrr.engine;
    let n = 0;
    for (const m of e.endPlates) {
      const u = m.material.userData.planarUniforms;
      if (u && u[knob]) { u[knob].value = v; n++; }
    }
    return n;
  }, { knob: KNOB, v });
  if (!applied) { console.error(`knob ${KNOB} not present on any plate — nothing measured`); break; }
  await page.evaluate((n) => window.__rrr.settle(n), 4);
  for (const [tag, r] of Object.entries(RECTS)) {
    const buf = await page.screenshot({ clip: { x: r[0], y: r[1], width: r[2], height: r[3] } });
    const f = `${DIR}/eo11-knob-${KNOB}-${String(v).replace('.', 'p')}-${tag}.png`;
    writeFileSync(f, buf);
    console.log(`${KNOB}=${v} plate ${tag} (${applied} plates) -> ${f}`);
  }
}
await browser.close();
