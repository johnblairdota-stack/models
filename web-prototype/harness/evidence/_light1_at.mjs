#!/usr/bin/env node
/** Park at a station and dump every light AS IT IS THERE — the rig lerps, so a dump taken at
 *  ready is a dump of the wrong room. Also picks the mesh under a screen pixel. */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const PORT = +opt('port', 5461);
const ANCHOR = opt('anchor', 'study_w.south');
const YAW = (+opt('yaw', 180)) * Math.PI / 180;
const PICKS = (opt('picks', '') || '').split(',').filter(Boolean).map((s) => s.split('x').map(Number));

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
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.route('**/@vite/client', (r) => r.fulfill({
  status: 200, contentType: 'text/javascript',
  body: 'export function createHotContext(){return {on(){},send(){},accept(){},dispose(){},prune(){},invalidate(){}}}\nexport function injectQuery(u){return u}\nexport function removeStyle(){}\nexport function updateStyle(){}\n',
}));
await page.routeWebSocket((u) => u.hostname === '127.0.0.1' && u.port === String(PORT), () => {});
await page.goto(`http://127.0.0.1:${PORT}/?view=game.play&capture=1&quality=medium${opt('q') ? '&' + opt('q') : ''}`,
  { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => document.body.dataset.rrrReady === '1', null, { timeout: 300000 });

const out = await page.evaluate(async ({ anchor, yaw, picks }) => {
  const e = window.__rrr.engine, room = e.room;
  if (e.director && !e.director.__parked) {
    e.director.__parked = true;
    e.director.step = () => ({ move: { x: 0, y: 0 }, look: null, run: false, fire: false,
      aimYaw: e.cam?.yaw ?? 0, aimPitch: e.cam?.pitch ?? 0 });
  }
  window.__rrr.freeRun(true);
  const a = room.anchor(anchor);
  const snap = () => {
    e.player.pos.copy(a); e.player.vel.set(0, 0, 0);
    e.player.facing = yaw; e.player.aimYaw = yaw;
    if (e.cam) { e.cam.yaw = yaw; e.cam.pitch = 0; e.cam._first = true; }
    if (e.hunter) { e.hunter.root.position.set(a.x + 300, 0, a.z + 300); e.hunter.state = 'PATROL'; }
  };
  snap();
  for (let k = 0; k < 8; k++) { await new Promise((r) => setTimeout(r, 150)); snap(); }
  await window.__rrr.settle(8);
  const r2 = (v) => +v.toFixed(2);
  const lights = [];
  e.scene.traverse((o) => {
    if (!o.isLight || o.isHemisphereLight) return;
    if ((o.intensity ?? 0) < 0.05) return;
    const p = o.getWorldPosition(new o.position.constructor());
    lights.push(`${o.type} ${o.name || '-'} [${r2(p.x)},${r2(p.y)},${r2(p.z)}] i=${r2(o.intensity)} ` +
      `d=${r2(o.distance ?? 0)} decay=${o.decay ?? '-'} #${o.color.getHexString()}` +
      (o.target ? ` -> [${r2(o.target.position.x)},${r2(o.target.position.y)},${r2(o.target.position.z)}]` : '') +
      (o.angle != null ? ` angle=${r2(o.angle)}` : ''));
  });
  // camera->pixel raycast, the `_tmp_geoprobe --pick` idea inline
  const THREE = e.THREE ?? window.THREE;
  const hits = [];
  if (THREE && picks.length) {
    const rc = new THREE.Raycaster();
    for (const [px, py] of picks) {
      const ndc = new THREE.Vector2((px / window.innerWidth) * 2 - 1, -(py / window.innerHeight) * 2 + 1);
      rc.setFromCamera(ndc, e.camera);
      const h = rc.intersectObject(e.scene, true).filter((x) => x.object.visible)[0];
      hits.push(h ? `${px}x${py}: ${h.object.name || h.object.type} at ${r2(h.distance)} m  ` +
        `world [${r2(h.point.x)},${r2(h.point.y)},${r2(h.point.z)}]` : `${px}x${py}: nothing`);
    }
  }
  return { space: room.spaceAt(e.player.pos)?.id, lights, hits, hasTHREE: !!THREE };
}, { anchor: ANCHOR, yaw: YAW, picks: PICKS });

console.log(`parked in ${out.space} at ${ANCHOR} yaw ${opt('yaw', 180)}deg`);
for (const l of out.lights) console.log('  ' + l);
if (out.hits.length) { console.log('  PICKS'); for (const h of out.hits) console.log('   ' + h); }
if (!out.hasTHREE && PICKS.length) console.log('  (no THREE handle exposed — picks skipped)');
await browser.close();
if (child) child.kill();
process.exit(0);
