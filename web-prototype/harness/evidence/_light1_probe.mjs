#!/usr/bin/env node
/**
 * ESTATE-LIGHT-1 — WHERE THE ARCHITECTURE ACTUALLY IS, AND WHERE THE LIGHTS ACTUALLY POINT.
 *
 * The per-space rig in `spaces.js` was aimed when every room was an empty box. Re-aiming it is
 * free, but only if the aim is derived from the BUILD rather than from arithmetic done in a
 * doc: `room.js` `studyOrderFor` resolves the chimney bay, the windows, the sconces and the
 * tapestries from each room's own cut list, so `study_w`'s chimney and `study_e`'s are at
 * different x and no hand calculation can be trusted to say where.
 *
 * So this dumps, out of the live build:
 *   · every space's order plan in WORLD coordinates (hearth, windows, sconces, tapestries,
 *     portraits, clerestory, arch)
 *   · every light in the scene by name, type, world position, intensity, distance
 *   · a capture from the real player camera at each named station, with its file size
 *
 *   node harness/evidence/_light1_probe.mjs --port 5461 --tag before
 *   node harness/evidence/_light1_probe.mjs --port 5461 --tag after --arms "box:aim=box|aimed:"
 *
 * ⚠️ Stations are `anchor@yawDeg`; yaw follows the game's own convention (`facing = atan2(dx,
 * dz)`, so 0 is +Z and 180 is -Z).
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { stat, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const PORT = +opt('port', 5461);
const OUT = opt('out', path.join(ROOT, 'progress'));
const TAG = opt('tag', 'probe');
const ARMS = opt('arms', 'a:').split('|');
const STATIONS = opt('stations', [
  'gallery.mid@90',        // down the east half of the 27 m vista
  'gallery.mid@270',       // and the west half, where the candelabra and the arch are
  'study_w.south@180',     // THE SPAWN FRAME — north up the room at the chimney wall
  'study_w.north@150',     // close on the chimneypiece
  'study_e.south@180',
].join(',')).split(',');
const DUMP = argv.includes('--dump');

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
// ⚠️ STUB HMR — a vite dev server watches the WHOLE project (HANDOFF, found by audio-3).
await page.route('**/@vite/client', (r) => r.fulfill({
  status: 200, contentType: 'text/javascript',
  body: 'export function createHotContext(){return {on(){},send(){},accept(){},dispose(){},prune(){},invalidate(){}}}\nexport function injectQuery(u){return u}\nexport function removeStyle(){}\nexport function updateStyle(){}\n',
}));
await page.routeWebSocket((u) => u.hostname === '127.0.0.1' && u.port === String(PORT), () => {});
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).split('\n')[0].slice(0, 200)));
let navs = 0;
page.on('framenavigated', (f) => { if (f === page.mainFrame()) navs++; });

const all = [];
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

  // ---- park the director once, for every station in this arm ----------------
  await page.evaluate(() => {
    const e = window.__rrr.engine;
    if (e.director && !e.director.__parked) {
      e.director.__parked = true;
      e.director.step = () => ({ move: { x: 0, y: 0 }, look: null, run: false, fire: false,
        aimYaw: e.cam?.yaw ?? 0, aimPitch: e.cam?.pitch ?? 0 });
    }
    window.__rrr.freeRun(true);
  });

  const geo = await page.evaluate(() => {
    const e = window.__rrr.engine, room = e.room;
    const r2 = (v) => (typeof v === 'number' ? +v.toFixed(2) : v);
    const spaces = room.spaces.map((sp) => {
      const P = sp.orderPlan;
      if (!P) return { id: sp.id, order: sp.order ?? null, plan: null };
      const out = { id: sp.id, order: sp.order, storey: sp.storey,
        box: [sp.x0, sp.x1, sp.z0, sp.z1].map(r2) };
      if (P.hearthWorld) out.hearth = { x: r2(P.hearthWorld.x), z: r2(P.hearthWorld.z) };
      if (P.chimney) out.chimney = { x: r2(P.chimney.x), z: r2(P.chimney.z),
        openH: r2(P.chimney.openH), overH: r2(P.chimney.overH), proj: r2(P.chimney.proj) };
      if (P.windowsWorld) out.windows = P.windowsWorld.map((w) => ({
        x: r2(w.x), z: r2(w.z), sill: r2(w.sill), head: r2(w.head), face: w.face, into: w.into }));
      if (P.sconces) out.sconces = P.sconces.map((s) => ({ x: r2(s.x), y: r2(s.y), z: r2(s.z) }));
      if (P.tapestries) out.tapestries = P.tapestries.map((s) => ({ x: r2(s.x), z: r2(s.z) }));
      if (P.wallTop != null) out.wallTop = r2(P.wallTop);
      if (P.beams) out.beamY = r2(P.beams.y);
      // gallery: the plan is in a LOCAL frame; bake to world through the space's own base
      if (sp.orderBase && P.portraits) {
        const V = window.THREE ?? null;
        const toW = (x, y, z) => {
          const m = sp.orderBase.elements;
          return [r2(m[0] * x + m[4] * y + m[8] * z + m[12]),
            r2(m[1] * x + m[5] * y + m[9] * z + m[13]),
            r2(m[2] * x + m[6] * y + m[10] * z + m[14])];
        };
        out.frame = 'local->world via orderBase';
        out.cl = { sill: r2(P.cl.sill), spring: r2(P.cl.spring), head: r2(P.cl.head), w: r2(P.cl.w) };
        out.fieldTop = r2(P.fieldTop);
        out.clWorld = P.clZ.map((z) => toW(0, 0, z));
        out.archWorld = toW(0, 0, P.archZ);
        out.portraitWorld = P.portraits.map((p) => ({ at: toW(0, p.y, p.x), h: r2(p.h), w: r2(p.w) }));
        out.sconceWorld = P.sconceZ.map((z) => toW(0, 0, z));
        void V;
      }
      return out;
    });
    const lights = [];
    e.scene.traverse((o) => {
      if (!o.isLight) return;
      const p = o.getWorldPosition(new o.position.constructor());
      lights.push({ name: o.name || '(unnamed)', type: o.type,
        pos: [r2(p.x), r2(p.y), r2(p.z)], i: r2(o.intensity), d: r2(o.distance ?? 0),
        colour: '#' + o.color.getHexString(),
        target: o.target ? [r2(o.target.position.x), r2(o.target.position.y), r2(o.target.position.z)] : null });
    });
    return { spaces, lights, anchors: room.anchorNames() };
  });

  // ---- one capture per station ---------------------------------------------
  const shots = [];
  for (const st of STATIONS) {
    const [anchor, degS] = st.split('@');
    const yaw = (+degS) * Math.PI / 180;
    const res = await page.evaluate(async ({ anchor, yaw }) => {
      const e = window.__rrr.engine, room = e.room;
      const a = room.anchor(anchor);
      if (!a) return { err: 'no anchor ' + anchor };
      const snap = () => {
        e.player.pos.copy(a); e.player.vel.set(0, 0, 0);
        e.player.facing = yaw; e.player.aimYaw = yaw;
        if (e.cam) { e.cam.yaw = yaw; e.cam.pitch = 0; e.cam._first = true; }
        if (e.hunter) {
          e.hunter.root.position.set(a.x + 300, 0, a.z + 300);
          e.hunter.state = 'PATROL'; e.hunter.awareness = 0; e.hunter.target = null;
        }
      };
      snap();
      for (let k = 0; k < 5; k++) { await new Promise((r) => setTimeout(r, 120)); snap(); }
      await window.__rrr.settle(6);
      const c = e.camera.position;
      return {
        cam: [+c.x.toFixed(2), +c.y.toFixed(2), +c.z.toFixed(2)],
        space: room.spaceAt(e.player.pos)?.id ?? null,
        calls: e.renderer.info.render.calls, tris: e.renderer.info.render.triangles,
      };
    }, { anchor, yaw });
    const file = path.join(OUT, `light1-${TAG}-${anchor.replace('.', '_')}-${degS}-${name}.png`);
    await page.screenshot({ path: file });
    const st2 = await stat(file);
    shots.push({ station: st, ...res, file, kb: (st2.size / 1024) | 0 });
    console.log(`  ${st.padEnd(22)} space ${String(res.space).padEnd(9)} cam ${res.cam}  ` +
      `calls ${res.calls}  ${(st2.size / 1024) | 0} KB  -> ${path.basename(file)}`);
  }

  console.log(`\n=== arm "${name}" ${qs ? `(${qs})` : '(default)'} — ready ${(readyMs / 1000).toFixed(1)} s`);
  console.log('  LIGHTS');
  for (const l of geo.lights) {
    console.log(`    ${l.type.padEnd(16)} ${l.name.padEnd(22)} at ${JSON.stringify(l.pos).padEnd(24)}` +
      ` i=${l.i} d=${l.d} ${l.colour}${l.target ? ` -> ${JSON.stringify(l.target)}` : ''}`);
  }
  if (DUMP) console.log('  PLANS\n' + JSON.stringify(geo.spaces, null, 2));
  all.push({ name, qs, readyMs, geo, shots });
}
await writeFile(path.join(OUT, `light1-${TAG}.json`), JSON.stringify(all, null, 2));
console.log(`\nnavigations: ${navs} (expect ${ARMS.length}; more means HMR interfered)`);
if (errs.length) console.log('page errors:', [...new Set(errs)].slice(0, 6));
await browser.close();
if (child) child.kill();
process.exit(0);
