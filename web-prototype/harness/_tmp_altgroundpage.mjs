/**
 * TEMPORARY (motion-3-build): the same "which part owns the lowest visible point" question as
 * `_tmp_altground.mjs`, but IN THE PAGE, because the rocket skates need the GPU baker and
 * cannot be built headless. Delete when the round closes.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';

const PORT = 5204;
const free = (p) => new Promise((res) => {
  const s = net.createServer();
  s.once('error', () => res(false));
  s.once('listening', () => s.close(() => res(true)));
  s.listen(p, '127.0.0.1');
});
if (!(await free(PORT))) { console.error('port busy'); process.exit(1); }
const vite = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm',
  ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
  { cwd: process.cwd(), shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
vite.stdout.on('data', () => {});
for (let i = 0; i < 120; i++) {
  await new Promise((r) => setTimeout(r, 500));
  if (!(await free(PORT))) break;
}
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('console', (m) => { if (m.type() === 'error') console.log('PAGE ERR', m.text()); });
await page.goto(`http://127.0.0.1:${PORT}/?view=char.locomotion&capture=1&set=alt`);
await page.waitForFunction(() => window.__rrr?.ready === true, { timeout: 180000 });
await page.evaluate(() => window.__rrr.settle(20));

const out = await page.evaluate(() => {
  const e = window.__rrr.engine;
  const vis = (o) => { for (let n = o; n; n = n.parent) if (!n.visible) return false; return true; };
  const stations = [];
  for (const stand of e.scene.children) {
    if (!stand.isGroup || !stand.children.length) continue;
    const model = stand.children.find((c) => c.isGroup && c.children.some((k) => k.name === 'UNIT-4H'));
    if (!model) continue;
    const root = model.children.find((k) => k.name === 'UNIT-4H');
    const per = new Map();
    root.traverse((o) => {
      if (!o.isMesh || !o.geometry?.attributes?.position) return;
      const drawn = vis(o);
      const a = o.geometry.attributes.position;
      let lo = Infinity;
      const v = { x: 0, y: 0, z: 0 };
      const m = o.matrixWorld.elements;
      for (let i = 0; i < a.count; i++) {
        const x = a.getX(i), y = a.getY(i), z = a.getZ(i);
        const wy = m[1] * x + m[5] * y + m[9] * z + m[13];
        if (wy < lo) lo = wy;
      }
      let nm = o.name || '';
      for (let n = o; n && !nm; n = n.parent) nm = n.name || '';
      const key = (nm || '(unnamed)') + (drawn ? '' : ' [hidden]');
      if (!per.has(key) || lo < per.get(key)) per.set(key, lo);
    });
    stations.push({
      x: +stand.position.x.toFixed(2),
      parts: [...per.entries()].sort((a, b) => a[1] - b[1]).slice(0, 6)
        .map(([n, y]) => `${(y * 1000).toFixed(0).padStart(6)} mm  ${n}`),
    });
  }
  return stations;
});
for (const s of out) {
  console.log(`\n# station at x ${s.x}`);
  for (const p of s.parts) console.log('   ' + p);
}
await browser.close();
vite.kill();
process.exit(0);
