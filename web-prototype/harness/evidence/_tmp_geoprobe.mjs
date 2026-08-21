/**
 * Scratch probe: boot a built view and ask whether a seam ribbon is actually VISIBLE —
 * i.e. whether a ray from the camera to a ribbon vertex reaches it, or hits the shell first.
 *   node harness/evidence/_tmp_geoprobe.mjs --view char.turnaround --joint j.hipL --y -0.20
 * RUN `npx vite build` FIRST — this serves dist/, not the working tree.
 *
 * ROUND 35 — `--pick` MODE, the inverse question. The probe above starts from a mesh and asks
 * "can the camera see it"; that is the right question when a part is suspected MISSING. When a
 * part is suspected EXTRA — an unclaimed mark on screen that nobody will own — the useful
 * question runs the other way: given these SCREEN PIXELS, which mesh is drawing them?
 *
 *   node harness/evidence/_tmp_geoprobe.mjs --pick --view mat.robot --px 1792,455 --px 1770,520
 *   node harness/evidence/_tmp_geoprobe.mjs --pick --view mat.robot --grid 1540,330,340,290,20
 *
 * `--px` picks single points (capture-space pixels on the 1920x1080 shot); `--grid x,y,w,h,n`
 * rasterises an n-wide ownership map and prints it as a legend plus an ASCII picture, which is
 * what identifies a mark whose owner is not guessable. Both go through the SAME camera the
 * capture used, so a hit here is the mesh that painted that pixel.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const opts = (n) => argv.reduce((a, v, i) => (v === `--${n}` ? [...a, argv[i + 1]] : a), []);
const has = (n) => argv.includes(`--${n}`);
const VIEW = opt('view', 'char.turnaround');
const JOINT = opt('joint', 'j.hipL');
const YQ = Number(opt('y', '-0.20'));
const PICK = has('pick');
const PX = opts('px').map((s) => s.split(',').map(Number));
const GRID = opt('grid', null);
const SHOTW = Number(opt('shotw', '1920'));
const SHOTH = Number(opt('shoth', '1080'));
const PORT = 5198;

const srv = spawn(process.execPath, ['harness/serve.mjs', '--port', String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1800));
const browser = await chromium.launch({ args: ['--use-angle=default', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message ?? e)));
await page.goto(`http://127.0.0.1:${PORT}/?view=${encodeURIComponent(VIEW)}&capture=1&quality=medium`,
  { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(
  () => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1',
  null, { timeout: 180000 });
await page.evaluate(() => window.__rrr.settle(4));

if (PICK) {
  const res = await page.evaluate(({ PX, GRID, SHOTW, SHOTH }) => {
    const eng = window.__rrr.engine;
    const cam = eng.camera;
    // THREE is not on window, but every Vector3 in the scene carries its own constructor, and
    // `unproject` is all the maths that cannot be written by hand here.
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

    // Möller–Trumbore over a whole mesh, indexed or not, with a bounding-sphere reject first.
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
      const near = new V3((px / SHOTW) * 2 - 1, -(py / SHOTH) * 2 + 1, -1).unproject(cam);
      const far = new V3((px / SHOTW) * 2 - 1, -(py / SHOTH) * 2 + 1, 1).unproject(cam);
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
      return {
        name: bestM.name || '(unnamed)',
        parent: bestM.parent?.name || '',
        mat: bestM.material?.name || '',
        dist: +bestD.toFixed(4),
      };
    };

    const out = { points: [], grid: null };
    for (const [x, y] of PX) out.points.push({ px: [x, y], hit: pick(x, y) });

    if (GRID) {
      const [gx, gy, gw, gh, gn] = GRID.split(',').map(Number);
      const cell = gw / gn, rows = Math.max(1, Math.round(gh / cell));
      const key = new Map(), rowsOut = [];
      const glyphs = '.123456789abcdefghijklmnopqrstuvwxyz';
      for (let r = 0; r < rows; r++) {
        let line = '';
        for (let c = 0; c < gn; c++) {
          const h = pick(gx + (c + 0.5) * cell, gy + (r + 0.5) * cell);
          const id = h ? `${h.name}|${h.mat}` : '(bg)';
          if (!key.has(id)) key.set(id, glyphs[Math.min(glyphs.length - 1, key.size)]);
          line += key.get(id);
        }
        rowsOut.push(line);
      }
      out.grid = { legend: [...key].map(([k, v]) => `${v} = ${k}`), rows: rowsOut, cell: +cell.toFixed(2) };
    }
    return out;
  }, { PX, GRID, SHOTW, SHOTH });

  for (const p of res.points) console.log(`px ${p.px.join(',')} ->`, JSON.stringify(p.hit));
  if (res.grid) {
    console.log(`\ngrid cell = ${res.grid.cell} px`);
    for (const l of res.grid.legend) console.log('  ' + l);
    console.log('');
    for (const r of res.grid.rows) console.log('  ' + r);
  }
  if (errs.length) console.log('page errors:', errs.slice(0, 3));
  await browser.close();
  srv.kill();
  process.exit(0);
}

const out = await page.evaluate(({ JOINT, YQ }) => {
  const eng = window.__rrr.engine;
  const meshes = [];
  eng.scene.traverse((o) => { if (o.isMesh && (o.parent?.name || '') === JOINT) meshes.push(o); });
  if (!meshes.length) return { error: 'no meshes under ' + JOINT };
  const gap = meshes.find((m) => (m.material?.name || '').includes('gap'));
  if (!gap) return { error: 'no gap mesh', names: meshes.map((m) => m.material?.name) };

  // Möller–Trumbore, plain arrays.
  const hitDist = (mesh, ox, oy, oz, dx, dy, dz) => {
    const g = mesh.geometry, p = g.attributes.position.array, idx = g.index.array;
    let best = Infinity;
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
      const e1x = p[b] - p[a], e1y = p[b + 1] - p[a + 1], e1z = p[b + 2] - p[a + 2];
      const e2x = p[c] - p[a], e2y = p[c + 1] - p[a + 1], e2z = p[c + 2] - p[a + 2];
      const hx = dy * e2z - dz * e2y, hy = dz * e2x - dx * e2z, hz = dx * e2y - dy * e2x;
      const det = e1x * hx + e1y * hy + e1z * hz;
      if (Math.abs(det) < 1e-12) continue;
      const inv = 1 / det;
      const sx = ox - p[a], sy = oy - p[a + 1], sz = oz - p[a + 2];
      const u = (sx * hx + sy * hy + sz * hz) * inv;
      if (u < 0 || u > 1) continue;
      const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
      const v = (dx * qx + dy * qy + dz * qz) * inv;
      if (v < 0 || u + v > 1) continue;
      const tt = (e2x * qx + e2y * qy + e2z * qz) * inv;
      if (tt > 1e-6 && tt < best) best = tt;
    }
    return best;
  };

  const p = gap.geometry.attributes.position;
  const picks = [];
  for (let i = 0; i < p.count && picks.length < 8; i++) {
    if (Math.abs(p.getY(i) - YQ) > 0.006) continue;
    picks.push({ i, x: p.getX(i), y: p.getY(i), z: p.getZ(i) });
  }
  const cam = eng.camera;
  const rows = picks.map((q) => {
    const wp = gap.localToWorld(gap.position.clone().set(q.x, q.y, q.z));
    const dir = wp.clone().sub(cam.position).normalize();
    const per = meshes.map((m) => {
      const inv = m.matrixWorld.clone().invert();
      const o = cam.position.clone().applyMatrix4(inv);
      const tip = cam.position.clone().add(dir).applyMatrix4(inv);
      const d = tip.clone().sub(o);
      const len = d.length(); d.multiplyScalar(1 / len);
      const t = hitDist(m, o.x, o.y, o.z, d.x, d.y, d.z);
      return { mat: (m.material?.name || '').slice(0, 20), d: t === Infinity ? null : +(t / len).toFixed(5) };
    });
    return {
      local: { x: +q.x.toFixed(4), y: +q.y.toFixed(4), z: +q.z.toFixed(4) },
      distToVert: +cam.position.distanceTo(wp).toFixed(5),
      per,
    };
  });
  return { joint: JOINT, rows };
}, { JOINT, YQ });

console.log(JSON.stringify(out, null, 1));
if (errs.length) console.log('page errors:', errs.slice(0, 3));
await browser.close();
srv.kill();
process.exit(0);
