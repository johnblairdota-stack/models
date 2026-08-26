// prime-time-1: what is actually in the playable ballroom's scene graph.
// The game's capture spawn is the gallery, so `shoot.mjs --view game.play` had never
// photographed this room — and a change to it comes back as a byte-identical image, which
// reads as "no effect" rather than "not in shot". This counts the meshes instead of guessing.
import { chromium } from 'playwright';
import net from 'node:net';
const PORT = 5178;
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const SPAWN = opt('spawn', 'ballroom.centre');
const portOpen = (p) => new Promise((res) => { const s = net.connect(p, '127.0.0.1'); s.on('connect', () => { s.destroy(); res(true); }); s.on('error', () => res(false)); });
if (!(await portOpen(PORT))) { console.error('vite not running on 5178'); process.exit(3); }
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--force-device-scale-factor=1', '--hide-scrollbars'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.routeWebSocket((u) => u.hostname === '127.0.0.1' && u.port === String(PORT), () => {});
await page.goto(`http://127.0.0.1:${PORT}/?view=game.play&capture=1&spawn=${SPAWN}`, { waitUntil: 'load', timeout: 90000 });
await page.waitForFunction(() => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1', null, { timeout: 600000 });
await page.evaluate((n) => window.__rrr.settle(n), 12);
const out = await page.evaluate(() => {
  const e = window.__rrr.engine;
  const names = {};
  let grime = 0, tris = 0;
  e.scene.traverse((o) => {
    if (!o.isMesh && !o.isInstancedMesh) return;
    const n = o.name || '(unnamed)';
    names[n] = (names[n] || 0) + 1;
    if (n === 'grime') grime++;
    const g = o.geometry;
    if (g?.index) tris += g.index.count / 3; else if (g?.attributes?.position) tris += g.attributes.position.count / 3;
  });
  // per-bucket triangles: the question "are the raised panels reaching this room" is a
  // triangle-count question, not a squint-at-the-wall question. A wall with fielded panels
  // carries an order of magnitude more geometry than a wall without.
  const per = {};
  e.scene.traverse((o) => {
    if (!o.isMesh && !o.isInstancedMesh) return;
    const n = o.name || '(unnamed)';
    const g = o.geometry;
    const t = g?.index ? g.index.count / 3 : (g?.attributes?.position ? g.attributes.position.count / 3 : 0);
    per[n] = (per[n] || 0) + t;
  });
  const kit = Object.keys(names).filter((n) => n.startsWith('kit:')).sort()
    .map((n) => `${n}=${Math.round(per[n])}t`);
  return { grime, kit, tris: Math.round(tris), total: Object.values(names).reduce((a, b) => a + b, 0) };
});
console.log('grime/patina quads :', out.grime, '(expected 8: four walls x band+patina)');
console.log('kit buckets        :', out.kit.join(', ') || '(none)');
console.log('meshes / triangles :', out.total, '/', out.tris);
await browser.close();
