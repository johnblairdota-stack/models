// estate-owner-15: sweep the ballroom vestibule material's colour live, sampling both a fixed
// point through the arch AND the full-frame gate stats (median/toe/top chroma), matching
// grade.mjs's own construction. Mirrors _eo15_drape_sweep.mjs.
import { chromium } from 'playwright';
import net from 'node:net';
import { writeFileSync } from 'node:fs';

const PORT = 5178;
const argv = process.argv.slice(2);
const OUT = 'C:/Users/John/AppData/Local/Temp/claude/C--Users-John-Documents-Run-Robot-Run-web-prototype/5302cea7-8124-49db-b4fe-f14ded483e05/scratchpad';
const SPECS = argv.filter((a) => a.includes(':'));

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
await page.waitForFunction(() => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1', null, { timeout: 300000 });
await page.evaluate((n) => window.__rrr.settle(n), 16);

const found = await page.evaluate(() => {
  const e = window.__rrr.engine;
  const m = e.scene.getObjectByName('kit:vest');
  return m ? { found: true, color: m.material.color.getHexString(), rough: m.material.roughness } : { found: false };
});
console.log('vest mesh:', found);
if (!found.found) { console.error('kit:vest not found in scene'); process.exit(4); }

console.log('label              samples @(1250,350)(1300,400)(1350,450)(1400,380)              top     median  toe');
for (const spec of SPECS) {
  const i = spec.indexOf(':');
  const label = spec.slice(0, i);
  const patch = JSON.parse(spec.slice(i + 1));
  await page.evaluate((p) => {
    const e = window.__rrr.engine;
    const m = e.scene.getObjectByName('kit:vest');
    if (p.color != null) m.material.color.setHex(p.color);
    if (p.rough != null) m.material.roughness = p.rough;
    m.material.needsUpdate = true;
    if (p.drapeColor != null) {
      const dm = e.scene.getObjectByName('kit:drape');
      dm.material.color.setHex(p.drapeColor);
      dm.material.needsUpdate = true;
    }
    if (p.grade) window.__rrr.setGrade(p.grade);
  }, patch);
  await page.evaluate((n) => window.__rrr.settle(n), 5);
  const buf = await page.screenshot();
  writeFileSync(`${OUT}/vest-${label}.png`, buf);

  const r = await page.evaluate(() => {
    const cv = document.querySelector('canvas');
    const c2 = document.createElement('canvas');
    c2.width = cv.width; c2.height = cv.height;
    const cx = c2.getContext('2d', { willReadFrequently: true });
    cx.drawImage(cv, 0, 0);
    const pts = [[1250, 350], [1300, 400], [1350, 450], [1400, 380]];
    const samples = pts.map(([x, y]) => Array.from(cx.getImageData(x, y, 1, 1).data.slice(0, 3)));

    const W = cv.width, H = cv.height;
    const all = cx.getImageData(0, 0, W, H).data;
    const px = [];
    for (let y = 0; y < H; y += 2) {
      for (let x = 0; x < W; x += 2) {
        const idx = (y * W + x) * 4;
        const L = 0.2126 * all[idx] + 0.7152 * all[idx + 1] + 0.0722 * all[idx + 2];
        px.push({ L, r: all[idx], b: all[idx + 2] });
      }
    }
    px.sort((a, b) => a.L - b.L);
    const dec = (k) => {
      const lo = Math.floor(px.length * k / 10), hi = Math.floor(px.length * (k + 1) / 10);
      let L = 0, r2 = 0, b2 = 0;
      for (let j = lo; j < hi; j++) { L += px[j].L; r2 += px[j].r; b2 += px[j].b; }
      const c = hi - lo;
      return { L: L / c, chroma: (r2 / c - b2 / c) / Math.max(0.5, L / c) };
    };
    return { samples, top: dec(9).chroma, median: px[px.length >> 1].L, toe: dec(0).L };
  });
  console.log(label.padEnd(18) + JSON.stringify(r.samples).padEnd(52)
    + '  ' + r.top.toFixed(3) + '  ' + r.median.toFixed(1) + '  ' + r.toe.toFixed(1));
}
await browser.close();
