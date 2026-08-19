#!/usr/bin/env node
/**
 * ESTATE-SPIKE-1 — a parked before/after PAIR of the game's gallery, same camera both times.
 *
 * The perf answer is only half of John's go/no-go; the other half is whether the port actually
 * moves the picture. Both frames are taken from the SAME anchor with the SAME yaw in the SAME
 * browser session, so the only difference is the arm.
 *
 *   node harness/_spike1_shot.mjs --out <dir> --anchor gallery.mid --yaw 1.5708
 *
 * ⚠️ Captures lie (HANDOFF): the file size and a non-empty frame are checked and printed, and
 * the parked position is asserted, because a screenshot of a boot splash is still a PNG.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { stat, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const PORT = +opt('port', 5422);
const OUT = opt('out', path.join(ROOT, 'progress'));
const ANCHOR = opt('anchor', 'gallery.mid');
const YAW = +opt('yaw', Math.PI / 2);
const ARMS = opt('arms', 'off:,all:estate=all\\,resident').split(',,');

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
    if (Date.now() - t0 > 60000) process.exit(3);
    await new Promise((r) => setTimeout(r, 250));
  }
}
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.routeWebSocket((u) => u.hostname === '127.0.0.1' && u.port === String(PORT), () => {});
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).split('\n')[0].slice(0, 160)));

for (const spec of ARMS) {
  const i = spec.indexOf(':');
  const name = spec.slice(0, i), qs = spec.slice(i + 1).replace(/\\,/g, ',');
  await page.goto(`http://127.0.0.1:${PORT}/?view=game.play&capture=1&quality=medium${qs ? '&' + qs : ''}`,
    { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1',
    null, { timeout: 300000 });
  const at = await page.evaluate(async ({ anchor, yaw }) => {
    const e = window.__rrr.engine, room = e.room;
    if (e.director && !e.director.__parked) {
      e.director.__parked = true;
      e.director.step = () => ({ move: { x: 0, y: 0 }, look: null, run: false, fire: false,
        aimYaw: e.cam?.yaw ?? 0, aimPitch: e.cam?.pitch ?? 0 });
    }
    const a = room.anchor(anchor);
    const snap = () => {
      e.player.pos.copy(a); e.player.vel.set(0, 0, 0); e.player.facing = yaw; e.player.aimYaw = yaw;
      if (e.cam) { e.cam.yaw = yaw; e.cam.pitch = 0; e.cam._first = true; }
      // out of the shot: this is a picture of the ROOM
      if (e.hunter) { e.hunter.root.position.set(a.x + 300, 0, a.z + 300); e.hunter.state = 'PATROL'; e.hunter.awareness = 0; e.hunter.target = null; }
    };
    snap();
    window.__rrr.freeRun(true);
    for (let k = 0; k < 4; k++) { await new Promise((r) => setTimeout(r, 200)); snap(); }
    await new Promise((r) => setTimeout(r, 200));
    e.endPerf();
    await window.__rrr.settle(8);
    const c = e.camera.position;
    return { cam: [+c.x.toFixed(2), +c.y.toFixed(2), +c.z.toFixed(2)],
      space: room.spaceAt(e.player.pos)?.id ?? null, calls: e.renderer.info.render.calls };
  }, { anchor: ANCHOR, yaw: YAW });
  const file = path.join(OUT, `spike1-${ANCHOR.replace('.', '-')}-${name}.png`);
  await page.screenshot({ path: file });
  const st = await stat(file);
  console.log(`${name.padEnd(6)} -> ${file}  ${(st.size / 1024) | 0} KB  parked in ${at.space} cam ${at.cam}  calls ${at.calls}`);
}
if (errs.length) console.log('page errors:', [...new Set(errs)].slice(0, 4));
await browser.close();
if (child) child.kill();
process.exit(0);
