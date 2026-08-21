#!/usr/bin/env node
/**
 * ESTATE-1 — the before/after pair for the gallery order port, in ONE browser session.
 *
 * Answers three things the perf tool cannot, and answers them from the BUILD rather than from
 * the query string that was typed:
 *
 *   1. DRAW CALLS AND TRIANGLES at `gallery.mid`, at every yaw, so the comparison is not a
 *      coin toss about which direction the camera happened to face. `renderer.info.render` is a
 *      CPU-side counter three increments as it submits, so this contends with nothing on the
 *      GPU and is safe beside another agent — HANDOFF's "draw-call counts are deterministic
 *      and exempt".
 *   2. THE SCENE LIGHT CENSUS BY TYPE, because the whole light argument is about a count.
 *   3. A PICTURE, from the real player camera at a parked station, same camera both arms.
 *
 * ⚠️ Captures lie: file size and the parked space are printed for every shot, and the arm is
 * asserted out of `room.estate` / `engine.__estateRig` rather than assumed.
 *
 *   node harness/evidence/_estate1_probe.mjs --out progress --anchor gallery.mid
 *   node harness/evidence/_estate1_probe.mjs --arms "off:,port:estate=port"
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { stat, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const PORT = +opt('port', 5451);
const OUT = opt('out', path.join(ROOT, 'progress'));
const ANCHOR = opt('anchor', 'ballroom.centre');
const SPACE = opt('space', 'ballroom');
const SHOT_YAW = +opt('yaw', Math.PI / 2);
const YAWS = +opt('yaws', 8);
const PITCH = +opt('pitch', 0);
const ARMS = opt('arms', 'noball:estate=port,noballroom|ball:estate=port').split('|');

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
// ⚠️ STUB HMR. A vite dev server watches the WHOLE project, so another agent's save reloads
// this page mid-measurement even on a private port (HANDOFF, found by audio-3).
await page.route('**/@vite/client', (r) => r.fulfill({
  status: 200, contentType: 'text/javascript',
  body: 'export function createHotContext(){return {on(){},send(){},accept(){},dispose(){},prune(){},invalidate(){}}}\nexport function injectQuery(u){return u}\nexport function removeStyle(){}\nexport function updateStyle(){}\n',
}));
await page.routeWebSocket((u) => u.hostname === '127.0.0.1' && u.port === String(PORT), () => {});
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).split('\n')[0].slice(0, 200)));
let navs = 0;
page.on('framenavigated', (f) => { if (f === page.mainFrame()) navs++; });

const rows = [];
for (const spec of ARMS) {
  const i = spec.indexOf(':');
  const name = spec.slice(0, i), qs = spec.slice(i + 1);
  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${PORT}/?view=game.play&capture=1&quality=medium${qs ? '&' + qs : ''}`,
    { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(
    () => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1',
    null, { timeout: 300000 });
  const readyMs = Date.now() - t0;

  const res = await page.evaluate(async ({ anchor, yaws, shotYaw, spaceId, pitch }) => {
    const e = window.__rrr.engine, room = e.room;
    if (e.director && !e.director.__parked) {
      e.director.__parked = true;
      e.director.step = () => ({ move: { x: 0, y: 0 }, look: null, run: false, fire: false,
        aimYaw: e.cam?.yaw ?? 0, aimPitch: e.cam?.pitch ?? 0 });
    }
    const a = room.anchor(anchor);
    const snap = (yaw, pit = 0) => {
      e.player.pos.copy(a); e.player.vel.set(0, 0, 0);
      e.player.facing = yaw; e.player.aimYaw = yaw;
      if (e.cam) { e.cam.yaw = yaw; e.cam.pitch = pit; e.cam._first = true; }
      // out of the shot and out of the count: this is a picture of the ROOM
      if (e.hunter) {
        e.hunter.root.position.set(a.x + 300, 0, a.z + 300);
        e.hunter.state = 'PATROL'; e.hunter.awareness = 0; e.hunter.target = null;
      }
    };
    window.__rrr.freeRun(true);
    const per = [];
    for (let i = 0; i < yaws; i++) {
      const yaw = (i / yaws) * Math.PI * 2;
      snap(yaw);
      for (let k = 0; k < 3; k++) { await new Promise((r) => setTimeout(r, 90)); snap(yaw); }
      await window.__rrr.settle(4);
      per.push({ yaw: +(yaw * 57.2958).toFixed(0),
        calls: e.renderer.info.render.calls, tris: e.renderer.info.render.triangles });
    }
    snap(shotYaw, pitch);
    for (let k = 0; k < 4; k++) { await new Promise((r) => setTimeout(r, 150)); snap(shotYaw, pitch); }
    e.endPerf();
    await window.__rrr.settle(8);

    let point = 0, spot = 0, dir = 0, hemi = 0;
    e.scene.traverse((o) => {
      if (o.isPointLight) point++; else if (o.isSpotLight) spot++;
      else if (o.isDirectionalLight) dir++; else if (o.isHemisphereLight) hemi++;
    });
    const gal = room.spaces.find((s) => s.id === spaceId);
    let galMeshes = 0;
    gal?.root.traverse((o) => { if (o.isMesh) galMeshes++; });
    const c = e.camera.position;
    return {
      per, lights: { point, spot, dir, hemi },
      shot: { calls: e.renderer.info.render.calls, tris: e.renderer.info.render.triangles },
      cam: [+c.x.toFixed(2), +c.y.toFixed(2), +c.z.toFixed(2)],
      space: room.spaceAt(e.player.pos)?.id ?? null,
      estate: room.estate ? { on: room.estate.on, order: room.estate.order, study: room.estate.study,
        surfaces: room.estate.surfaces, orders: room.estate.orders } : null,
      rig: e.__estateRig ?? null,
      studyRig: e.__studyRig ?? null,
      ballRig: e.__ballroomRig ?? null,
      storey: room.spaces.find((q) => q.id === 'ballroom')?.storey ?? null,
      galMeshes,
      programs: e.renderer.info.programs?.length ?? 0,
    };
  }, { anchor: ANCHOR, yaws: YAWS, shotYaw: SHOT_YAW, spaceId: SPACE, pitch: PITCH });

  const file = path.join(OUT, `estate3-${ANCHOR.replace('.', '-')}${PITCH ? '-up' : ''}-${name}.png`);
  await page.screenshot({ path: file });
  const st = await stat(file);
  rows.push({ name, ...res, file, kb: (st.size / 1024) | 0, readyMs });

  console.log(`\n=== ${name} ${qs ? `(${qs})` : '(shipped default)'} — ready ${(readyMs / 1000).toFixed(1)} s`);
  console.log(`  parked in ${res.space}  cam ${res.cam}  ->  ${path.basename(file)}  ${(st.size / 1024) | 0} KB`);
  console.log(`  calls by yaw: ${res.per.map((p) => `${p.yaw}deg ${p.calls}`).join('  ')}`);
  console.log(`  max calls ${Math.max(...res.per.map((p) => p.calls))}   ` +
    `max tris ${(Math.max(...res.per.map((p) => p.tris)) / 1000) | 0}k   programs ${res.programs}`);
  console.log(`  lights: point ${res.lights.point}  spot ${res.lights.spot}  dir ${res.lights.dir}  hemi ${res.lights.hemi}`);
  console.log(`  space meshes ${res.galMeshes}   estate ${JSON.stringify(res.estate)}`);
  if (res.rig) console.log(`  gallery rig ${JSON.stringify(res.rig)}`);
  if (res.studyRig) console.log(`  study rig ${JSON.stringify(res.studyRig)}`);
  if (res.ballRig) console.log(`  ballroom rig ${JSON.stringify(res.ballRig)}`);
  console.log(`  ballroom storey ${res.storey}`);
}

if (rows.length === 2) {
  const [a, b] = rows;
  const mx = (r) => Math.max(...r.per.map((p) => p.calls));
  const mt = (r) => Math.max(...r.per.map((p) => p.tris));
  console.log(`\n=== DELTA (${b.name} - ${a.name}) at ${ANCHOR}`);
  console.log(`  max draw calls  ${mx(a)} -> ${mx(b)}   (${mx(b) - mx(a) >= 0 ? '+' : ''}${mx(b) - mx(a)})   ceiling 625`);
  console.log(`  max triangles   ${(mt(a) / 1000) | 0}k -> ${(mt(b) / 1000) | 0}k   ceiling 900k`);
  console.log(`  point lights    ${a.lights.point} -> ${b.lights.point}`);
  console.log(`  spot lights     ${a.lights.spot} -> ${b.lights.spot}`);
  console.log(`  gallery meshes  ${a.galMeshes} -> ${b.galMeshes}`);
  console.log(`  ready           ${(a.readyMs / 1000).toFixed(1)} s -> ${(b.readyMs / 1000).toFixed(1)} s`);
}
console.log(`\nnavigations: ${navs} (expect ${ARMS.length}; more means HMR interfered)`);
if (errs.length) console.log('page errors:', [...new Set(errs)].slice(0, 6));
await browser.close();
if (child) child.kill();
process.exit(0);
