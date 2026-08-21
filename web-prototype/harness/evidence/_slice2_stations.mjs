#!/usr/bin/env node
/**
 * critic-slice-2 — multi-station tour of the PLAYABLE slice (real player camera, default
 * ?estate=port), one browser session, one boot. Visits named anchors and shoots each.
 *
 *   node harness/evidence/_slice2_stations.mjs --port 5199 --out <dir>
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const PORT = +opt('port', 5199);
const OUT = opt('out', path.join(ROOT, 'progress'));
const QS = opt('qs', 'estate=port');

const STATIONS = [
  { anchor: 'ballroom.east', yaw: -Math.PI / 2, pitch: 0.08, tag: 'ballroom-east-window' },
  { anchor: 'ballroom.east', yaw: Math.PI / 2, pitch: 0.08, tag: 'ballroom-east-mirror' },
  { anchor: 'ballroom.centre', yaw: -Math.PI / 2, pitch: 0.1, tag: 'ballroom-centre-window' },
];

const portOpen = (p) => new Promise((res) => {
  const s = net.connect(p, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); }); s.on('error', () => res(false));
});
let child = null;
if (!(await portOpen(PORT))) {
  child = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'),
    '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  const t0 = Date.now();
  while (!(await portOpen(PORT))) {
    if (Date.now() - t0 > 60000) { console.error('vite did not come up'); process.exit(3); }
    await new Promise((r) => setTimeout(r, 250));
  }
}
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.route('**/@vite/client', (r) => r.fulfill({
  status: 200, contentType: 'text/javascript',
  body: 'export function createHotContext(){return {on(){},send(){},accept(){},dispose(){},prune(){},invalidate(){}}}\nexport function injectQuery(u){return u}\nexport function removeStyle(){}\nexport function updateStyle(){}\n',
}));
await page.routeWebSocket((u) => u.hostname === '127.0.0.1' && u.port === String(PORT), () => {});

const t0 = Date.now();
await page.goto(`http://127.0.0.1:${PORT}/?view=game.play&capture=1&quality=medium&${QS}`,
  { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(
  () => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1',
  null, { timeout: 300000 });
console.log(`ready in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

const info = await page.evaluate(() => {
  const e = window.__rrr.engine;
  return { estate: e.room.estate ? { on: e.room.estate.on, order: e.room.estate.order,
    study: e.room.estate.study, orders: e.room.estate.orders } : null,
    storey: e.room.spaces.find((q) => q.id === 'ballroom')?.storey ?? null };
});
console.log('estate mode:', JSON.stringify(info));

for (const st of STATIONS) {
  const res = await page.evaluate(async ({ anchor, yaw, pitch }) => {
    const e = window.__rrr.engine, room = e.room;
    if (e.director && !e.director.__parked) {
      e.director.__parked = true;
      e.director.step = () => ({ move: { x: 0, y: 0 }, look: null, run: false, fire: false,
        aimYaw: e.cam?.yaw ?? 0, aimPitch: e.cam?.pitch ?? 0 });
    }
    window.__rrr.freeRun?.(true);
    const a = room.anchor(anchor);
    if (!a) return { ok: false };
    e.player.pos.copy(a); e.player.vel.set(0, 0, 0);
    e.player.facing = yaw; e.player.aimYaw = yaw;
    if (e.cam) { e.cam.yaw = yaw; e.cam.pitch = pitch; e.cam._first = true; }
    if (e.hunter) { e.hunter.root.position.set(a.x + 300, 0, a.z + 300); e.hunter.state = 'PATROL'; e.hunter.awareness = 0; e.hunter.target = null; }
    for (let k = 0; k < 4; k++) { await new Promise((r) => setTimeout(r, 120)); e.player.pos.copy(a); if (e.cam) { e.cam.yaw = yaw; e.cam.pitch = pitch; } }
    await window.__rrr.settle?.(8);
    return { ok: true, calls: e.renderer.info.render.calls, space: room.spaceAt(e.player.pos)?.id ?? null };
  }, st);
  const file = path.join(OUT, `slice2-${st.tag}.png`);
  await page.screenshot({ path: file });
  console.log(`${st.tag} (${st.anchor}) -> ${res.ok ? `space=${res.space} calls=${res.calls}` : 'NO ANCHOR'} -> ${path.basename(file)}`);
}

await browser.close();
if (child) child.kill();
process.exit(0);
