// prime-time-2: the order's panels are emitted into this room (kit:gilt 86.8k tris,
// kit:wall 6.3k) and the wall still photographs flat. Either they are behind the game's own
// wall slab or they are coplanar with it. A raycast says which, and at what distance.
import { chromium } from 'playwright';
import net from 'node:net';
const PORT = 5178;
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const SPAWN = opt('spawn', 'ballroom.north');
const FACE = opt('facing', '3.1416');
const PX = argv.reduce((a, v, i) => (v === '--px' ? [...a, argv[i + 1].split(',').map(Number)] : a), []);
const portOpen = (p) => new Promise((res) => { const s = net.connect(p, '127.0.0.1'); s.on('connect', () => { s.destroy(); res(true); }); s.on('error', () => res(false)); });
if (!(await portOpen(PORT))) { console.error('vite not running on 5178'); process.exit(3); }
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--force-device-scale-factor=1', '--hide-scrollbars'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.routeWebSocket((u) => u.hostname === '127.0.0.1' && u.port === String(PORT), () => {});
await page.goto(`http://127.0.0.1:${PORT}/?view=game.play&capture=1&spawn=${SPAWN}&facing=${FACE}`, { waitUntil: 'load', timeout: 90000 });
await page.waitForFunction(() => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1', null, { timeout: 600000 });
await page.evaluate((n) => window.__rrr.settle(n), 12);
const out = await page.evaluate(async (pts) => {
  const T = await import('/node_modules/three/build/three.module.js');
  const e = window.__rrr.engine;
  const rc = new T.Raycaster(); const v = new T.Vector2();
  return pts.map(([px, py]) => {
    v.set((px / 1920) * 2 - 1, -((py / 1080) * 2 - 1));
    rc.setFromCamera(v, e.camera);
    const hits = rc.intersectObject(e.scene, true)
      .filter((h) => h.object.visible && !h.object.isPoints && !/^(dust|glow|grime|light-shaft|light-pool)$/.test(h.object.name || ''));
    return { px, py, hits: hits.slice(0, 5).map((h) => `${h.object.name || h.object.type}@${h.distance.toFixed(3)}`) };
  });
}, PX.length ? PX : [[1100, 500]]);
for (const r of out) console.log(`(${r.px},${r.py})`.padEnd(14), r.hits.join('  |  '));
await browser.close();
