#!/usr/bin/env node
/**
 * `ballroom-fix-1` — one browser session, the PLAYABLE slice, parked at the ballroom stations
 * `critic-slice-2` used, with three things the tour script does not do:
 *
 *   1. A CAMERA -> PIXEL PICK, so a mark on screen is attributed to a NAMED mesh instead of
 *      guessed at. HANDOFF's dominant defect class is "it exists, something is in front of it";
 *      the corollary class is "the thing being fixed is not the thing on screen".
 *   2. AN AABB CENSUS, which answers the same question from the other end: what geometry is
 *      actually standing in this volume of the room.
 *   3. N REPEAT CAPTURES per station, because `room.ballroom` has a known 57-pixel two-state
 *      flicker and a single pair diffs to a false regression.
 *
 *   node harness/evidence/_ball1_probe.mjs --tag before --shots 1
 *   node harness/evidence/_ball1_probe.mjs --tag after  --picks 1
 *
 * ⚠️ Draw calls come from `renderer.info` (CPU-side, deterministic, GPU-exempt). GPU ms is NOT
 * measured here — use `perf-ab.mjs`.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { mkdir, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const has = (n) => argv.includes(`--${n}`);
const PORT = +opt('port', 5194);
const OUT = opt('out', path.join(ROOT, 'progress'));
const QS = opt('qs', 'estate=port');
const TAG = opt('tag', 'x');
const SHOTS = +opt('shots', 1);
const DO_PICKS = has('picks');
const ONLY = opt('only', null);

const HP = Math.PI / 2;
/**
 * THE YAW CONVENTION, MEASURED RATHER THAN ASSUMED. Parked at `ballroom.east` [11, -3] with
 * yaw +PI/2 the camera lands at x 7.91 — BEHIND the player on -x — so yaw +PI/2 faces +x. The
 * forward vector is `(sin yaw, 0, +cos yaw)`, i.e. **yaw 0 faces +Z (south)** and **yaw PI
 * faces -Z (north)**.
 */
const STATIONS = [
  {
    tag: 'east-mirror', anchor: 'ballroom.east', yaw: HP, pitch: 0.08,
    // the black slab the critic filed as the mirror, plus wall either side as controls
    px: [[640, 450], [640, 560], [640, 700], [520, 560], [780, 560], [700, 420],
      [300, 500], [1000, 500], [1500, 500], [900, 300], [640, 250]],
  },
  /**
   * ⚠️ **yaw PI, NOT 0 — AND THE FIRST VERSION OF THIS FILE HAD IT WRONG.** The three arched
   * doorways (D4/D5/D6) are in the -Z end wall, so yaw 0 photographs the OPPOSITE wall: the
   * near wall and the orangery doors. Nobody notices, because both walls are the same boiserie
   * and both have a black exit aperture in them. `_slice2_stations.mjs`'s three stations are
   * all correct for what they name — but none of them ever points at an archway, which is why
   * the sawtooth had to be judged off a 3x crop of a wall that was 27 m away.
   */
  {
    tag: 'centre-arch', anchor: 'ballroom.centre', yaw: Math.PI, pitch: 0.02,
    px: [[720, 520], [1200, 520], [960, 560]],
  },
  { tag: 'south-arch', anchor: 'ballroom.south', yaw: Math.PI, pitch: 0.02, px: [] },
  { tag: 'east-window', anchor: 'ballroom.east', yaw: -HP, pitch: 0.08, px: [] },
];

const AABBS = [
  ['mirror-wall-slab', 12.0, 0, -8.4, 14.6, 5.0, 7.1],
  ['end-wall-arches', -13.7, 0, -9.0, 13.7, 4.0, -7.4],
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
// ⚠️ STUB HMR — another agent's save reloads this page mid-measurement even on a private port.
await page.route('**/@vite/client', (r) => r.fulfill({
  status: 200, contentType: 'text/javascript',
  body: 'export function createHotContext(){return {on(){},send(){},accept(){},dispose(){},prune(){},invalidate(){}}}\nexport function injectQuery(u){return u}\nexport function removeStyle(){}\nexport function updateStyle(){}\n',
}));
await page.routeWebSocket((u) => u.hostname === '127.0.0.1' && u.port === String(PORT), () => {});
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).split('\n')[0].slice(0, 200)));
let navs = 0;
page.on('framenavigated', (f) => { if (f === page.mainFrame()) navs++; });

/**
 * `--arms "off:ballfix=0|on:"` — two builds in ONE browser. Two navigations, not two sessions:
 * the shader cache, the GPU state and the machine's load are shared, which is the difference
 * between a control pair and two anecdotes. Draw calls are deterministic either way.
 */
const ARMS = opt('arms', null);
const armList = ARMS ? ARMS.split('|').map((s) => { const i = s.indexOf(':'); return [s.slice(0, i), s.slice(i + 1)]; })
  : [[TAG, '']];

for (const [armTag, armQs] of armList) {
const ARMTAG = ARMS ? `${TAG}-${armTag}` : TAG;
const t0 = Date.now();
await page.goto(`http://127.0.0.1:${PORT}/?view=game.play&capture=1&quality=medium&${QS}${armQs ? `&${armQs}` : ''}`,
  { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(
  () => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1',
  null, { timeout: 300000 });
console.log(`\n=== ARM ${armTag} (${armQs || 'default'}) — ready in ${((Date.now() - t0) / 1000).toFixed(1)} s · navigations ${navs}`);

const info = await page.evaluate(() => {
  const e = window.__rrr.engine;
  const sp = e.room.spaces.find((q) => q.id === 'ballroom');
  const lights = { point: 0, spot: 0, hemi: 0, dir: 0 };
  e.scene.traverse((o) => {
    if (o.isPointLight) lights.point++;
    else if (o.isSpotLight) lights.spot++;
    else if (o.isHemisphereLight) lights.hemi++;
    else if (o.isDirectionalLight) lights.dir++;
  });
  return {
    estate: e.room.estate ?? null, storey: sp?.storey ?? null,
    lights, programs: e.renderer.info.programs?.length ?? null,
  };
});
console.log('build:', JSON.stringify(info));

// ---- AABB census: what geometry stands in this volume -----------------------
const census = await page.evaluate((boxes) => {
  const eng = window.__rrr.engine;
  const out = {};
  for (const [name, x0, y0, z0, x1, y1, z1] of boxes) {
    const rows = [];
    eng.scene.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry;
      if (!g) return;
      if (!g.boundingBox) g.computeBoundingBox();
      const bb = g.boundingBox.clone().applyMatrix4(o.matrixWorld);
      if (bb.max.x < x0 || bb.min.x > x1 || bb.max.y < y0 || bb.min.y > y1
        || bb.max.z < z0 || bb.min.z > z1) return;
      let vis = o.visible;
      for (let p = o.parent; p; p = p.parent) if (p.visible === false) vis = false;
      rows.push({
        name: o.name || '(unnamed)',
        parent: o.parent?.name || '',
        mat: o.material?.name || o.material?.type || '',
        col: o.material?.color ? `#${o.material.color.getHexString()}` : '',
        metal: o.material?.metalness ?? null,
        rough: o.material?.roughness ?? null,
        env: o.material?.envMap ? 'envMap' : '-',
        tris: (g.index ? g.index.count : g.attributes.position.count) / 3,
        vis,
        bb: [bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z].map((v) => +v.toFixed(2)),
      });
    });
    out[name] = rows;
  }
  return out;
}, AABBS);
for (const [k, rows] of Object.entries(census)) {
  console.log(`\n--- AABB ${k}: ${rows.length} meshes ---`);
  for (const r of rows.slice(0, 40)) {
    console.log(`  ${r.vis ? ' ' : 'H'} ${r.name.padEnd(26)} par=${r.parent.padEnd(16)} mat=${String(r.mat).padEnd(18)} col=${r.col} m=${r.metal} r=${r.rough} ${r.env} tris=${r.tris} bb=${JSON.stringify(r.bb)}`);
  }
  if (rows.length > 40) console.log(`  ... +${rows.length - 40} more`);
}

const results = [];
for (const st of STATIONS) {
  if (ONLY && !ONLY.split(',').includes(st.tag)) continue;
  const park = await page.evaluate(async ({ anchor, yaw, pitch }) => {
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
    return {
      ok: true, calls: e.renderer.info.render.calls, tris: e.renderer.info.render.triangles,
      space: room.spaceAt(e.player.pos)?.id ?? null,
      campos: e.camera.position.toArray().map((v) => +v.toFixed(2)),
    };
  }, st);

  const files = [];
  for (let s = 0; s < SHOTS; s++) {
    if (s > 0) await page.evaluate(() => window.__rrr.settle?.(6));
    const f = path.join(OUT, `ball1-${ARMTAG}-${st.tag}${SHOTS > 1 ? `-${s + 1}` : ''}.png`);
    await page.screenshot({ path: f });
    files.push(f);
  }
  const sizes = await Promise.all(files.map(async (f) => (await stat(f)).size));
  console.log(`\n[${st.tag}] ${park.ok ? `space=${park.space} calls=${park.calls} tris=${park.tris} cam=${JSON.stringify(park.campos)}` : 'NO ANCHOR'}`);
  console.log(`         -> ${files.map((f, i) => `${path.basename(f)} (${sizes[i]}B)`).join(' · ')}`);
  results.push({ tag: st.tag, ...park, files });

  if (has('panel') && st.tag === 'east-mirror') {
    // WHAT IS ACTUALLY DRAWN AT THE `x.ballroom.terrace_e` EXIT SITE, while parked and resident.
    const pan = await page.evaluate(() => {
      const e = window.__rrr.engine;
      const out = [];
      e.scene.traverse((o) => {
        if (!/terrace_e|pier-mirror/.test(o.name || '') && !/terrace_e/.test(o.parent?.name || '')) return;
        let vis = o.visible;
        for (let p = o.parent; p; p = p.parent) if (p.visible === false) vis = false;
        out.push({
          name: o.name || '(unnamed)', type: o.type, own: o.visible, chain: vis,
          parent: o.parent?.name || '', frustum: o.frustumCulled,
          mat: o.material?.name || o.material?.type || '',
        });
      });
      const p = e.room.panels?.find?.((q) => q.spec?.id === 'x.ballroom.terrace_e') ?? null;
      return { objs: out, panel: p ? { instanced: p.instanced, wantVisible: p.wantVisible, stage: p.state?.stage, rootVis: p.root?.visible } : null };
    });
    console.log('   panel state:', JSON.stringify(pan.panel));
    for (const o of pan.objs) console.log(`   obj ${o.name.padEnd(32)} ${o.type.padEnd(14)} own=${o.own} chain=${o.chain} par=${o.parent}`);
  }

  if (has('ablate') && st.tag === 'east-mirror') {
    /**
     * WHY IS THE `x.ballroom.terrace_e` PANEL BLACK? Four arms, same session, same camera, so
     * the attribution is a same-config pair rather than a story. Each is restored afterwards.
     */
    const arms = [
      ['noshadow', () => { const e = window.__rrr.engine; e.__sm = e.renderer.shadowMap.enabled; e.renderer.shadowMap.enabled = false; e.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; }); }],
      ['keyx4', () => { const e = window.__rrr.engine; e.scene.traverse((o) => { if (o.isSpotLight) { o.userData.__i = o.intensity; o.intensity *= 4; } }); }],
      ['hemix4', () => { const e = window.__rrr.engine; e.scene.traverse((o) => { if (o.isHemisphereLight) { o.userData.__i = o.intensity; o.intensity *= 4; } }); }],
      ['pointx4', () => { const e = window.__rrr.engine; e.scene.traverse((o) => { if (o.isPointLight) { o.userData.__i = o.intensity; o.intensity *= 4; } }); }],
    ];
    const restore = () => { const e = window.__rrr.engine; if (e.__sm !== undefined) e.renderer.shadowMap.enabled = e.__sm; e.scene.traverse((o) => { if (o.userData?.__i !== undefined) { o.intensity = o.userData.__i; delete o.userData.__i; } }); e.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; }); };
    for (const [name, fn] of arms) {
      await page.evaluate(`(${fn.toString()})()`);
      await page.evaluate(() => window.__rrr.settle?.(8));
      const f = path.join(OUT, `ball1-${ARMTAG}-abl-${name}.png`);
      await page.screenshot({ path: f });
      console.log(`   ablate ${name} -> ${path.basename(f)}`);
      await page.evaluate(`(${restore.toString()})()`);
      await page.evaluate(() => window.__rrr.settle?.(6));
    }
    const f0 = path.join(OUT, `ball1-${ARMTAG}-abl-base.png`);
    await page.screenshot({ path: f0 });
    console.log(`   ablate base     -> ${path.basename(f0)}`);
  }

  if (DO_PICKS && st.px?.length) {
    const picks = await page.evaluate(({ PX, W, H }) => {
      const eng = window.__rrr.engine;
      const cam = eng.camera;
      const V3 = cam.position.constructor;
      const meshes = [];
      eng.scene.traverse((o) => {
        if (!o.isMesh || o.visible === false) return;
        let vis = true;
        for (let p = o; p; p = p.parent) if (p.visible === false) vis = false;
        if (!vis) return;
        if (!o.geometry?.boundingSphere) o.geometry?.computeBoundingSphere?.();
        meshes.push(o);
      });
      const hit = (mesh, o, d) => {
        const g = mesh.geometry, pa = g.attributes.position;
        const bs = g.boundingSphere;
        if (bs) {
          const cx = bs.center.x - o.x, cy = bs.center.y - o.y, cz = bs.center.z - o.z;
          const t = cx * d.x + cy * d.y + cz * d.z;
          const dx = cx - t * d.x, dy = cy - t * d.y, dz = cz - t * d.z;
          if (dx * dx + dy * dy + dz * dz > bs.radius * bs.radius) return Infinity;
        }
        const p = pa.array;
        const idx = g.index ? g.index.array : null;
        const n = idx ? idx.length : pa.count;
        let best = Infinity;
        for (let t3 = 0; t3 < n; t3 += 3) {
          const a = (idx ? idx[t3] : t3) * 3;
          const b = (idx ? idx[t3 + 1] : t3 + 1) * 3;
          const c = (idx ? idx[t3 + 2] : t3 + 2) * 3;
          const e1x = p[b] - p[a], e1y = p[b + 1] - p[a + 1], e1z = p[b + 2] - p[a + 2];
          const e2x = p[c] - p[a], e2y = p[c + 1] - p[a + 1], e2z = p[c + 2] - p[a + 2];
          const hx = d.y * e2z - d.z * e2y, hy = d.z * e2x - d.x * e2z, hz = d.x * e2y - d.y * e2x;
          const det = e1x * hx + e1y * hy + e1z * hz;
          if (Math.abs(det) < 1e-14) continue;
          const inv = 1 / det;
          const sx = o.x - p[a], sy = o.y - p[a + 1], sz = o.z - p[a + 2];
          const u = (sx * hx + sy * hy + sz * hz) * inv;
          if (u < 0 || u > 1) continue;
          const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
          const v = (d.x * qx + d.y * qy + d.z * qz) * inv;
          if (v < 0 || u + v > 1) continue;
          const tt = (e2x * qx + e2y * qy + e2z * qz) * inv;
          if (tt > 1e-6 && tt < best) best = tt;
        }
        return best;
      };
      const pick = (px, py) => {
        const near = new V3((px / W) * 2 - 1, -(py / H) * 2 + 1, -1).unproject(cam);
        const far = new V3((px / W) * 2 - 1, -(py / H) * 2 + 1, 1).unproject(cam);
        const dirW = far.clone().sub(near).normalize();
        let bestD = Infinity, bestM = null;
        for (const m of meshes) {
          const inv = m.matrixWorld.clone().invert();
          const o = cam.position.clone().applyMatrix4(inv);
          const tip = cam.position.clone().add(dirW).applyMatrix4(inv);
          const d = tip.sub(o);
          const len = d.length();
          if (len < 1e-12) continue;
          d.multiplyScalar(1 / len);
          const t = hit(m, o, d) / len;
          if (t < bestD) { bestD = t; bestM = m; }
        }
        if (!bestM) return null;
        const w = cam.position.clone().add(dirW.multiplyScalar(bestD));
        return {
          name: bestM.name || '(unnamed)', parent: bestM.parent?.name || '',
          mat: bestM.material?.name || bestM.material?.type || '',
          col: bestM.material?.color ? `#${bestM.material.color.getHexString()}` : '',
          metal: bestM.material?.metalness ?? null, rough: bestM.material?.roughness ?? null,
          env: bestM.material?.envMap ? 'envMap' : '-',
          dist: +bestD.toFixed(3), world: w.toArray().map((v) => +v.toFixed(2)),
        };
      };
      return PX.map(([x, y]) => ({ px: [x, y], hit: pick(x, y) }));
    }, { PX: st.px, W: 1920, H: 1080 });
    for (const p of picks) {
      const h = p.hit;
      console.log(`   pick ${String(p.px).padEnd(10)} -> ${h ? `${h.name.padEnd(22)} par=${h.parent.padEnd(14)} mat=${String(h.mat).padEnd(16)} col=${h.col} m=${h.metal} r=${h.rough} ${h.env} d=${h.dist} at ${JSON.stringify(h.world)}` : 'MISS'}`);
    }
  }
}

await writeFile(path.join(OUT, `ball1-${ARMTAG}.json`),
  JSON.stringify({ tag: ARMTAG, qs: `${QS}&${armQs}`, info, census, results, errs, navs }, null, 1));
}

if (errs.length) console.log('\npage errors:', errs.slice(0, 6));
console.log(`\nnavigations: ${navs} (${armList.length} arm(s), so ${armList.length} is correct)`);
await browser.close();
if (child) child.kill();
process.exit(0);
