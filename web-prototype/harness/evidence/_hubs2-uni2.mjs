/*
 * builder-hubs2c: THE TWO SHELL MATERIALS, SIDE BY SIDE.
 *
 * The kit shell renders the shoulder boss at (77,75,65); the BODY's shell renders the same
 * geometry at (161,157,145). Both are `shellWhite()` and both carry the same injection, so
 * whatever separates them is an OPTION. Dump every scalar/vector uniform of each and diff.
 *
 * ⚠️ THE URL BELOW STILL CARRIES ?fixinject=1. That knob existed only while mesh-identity.js
 * was handing the fixtures an un-injected clone; it was deleted with the workaround on
 * 2026-08-17, so the flag is now inert and these probes read the SHIPPING path.
 *
 * usage: node harness/evidence/_hubs2-uni2.mjs [port]
 */
import { chromium } from 'playwright';

const PORT = process.argv[2] ?? '5192';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(`http://localhost:${PORT}/?view=mesh.animated&capture=1&solo=1&clip=merged`
  + `&anim=Alert&label=0&azim=0&fixinject=1`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__rrr?.engine || window.__rrrError, null, { timeout: 180000 });
await page.evaluate(() => window.__rrr.settle(30));

const r = await page.evaluate(async () => {
  const e = window.__rrr.engine;
  let fix = null, body = null;
  e.scene.traverse((o) => {
    if (o.name === 'capFixtureFR') fix = o;
    if (o.isSkinnedMesh && !body) body = o;
  });
  const dump = (m) => {
    const u = m.userData.weathering || {};
    const o = {};
    for (const k of Object.keys(u)) {
      const v = u[k]?.value;
      if (typeof v === 'number') o[k] = v;
      else if (v && typeof v.x === 'number') o[k] = [v.x, v.y, v.z, v.w].filter(n => n !== undefined);
    }
    return o;
  };
  const a = dump(fix.material), b = dump(body.material);
  const diff = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) diff[k] = { kit: a[k], body: b[k] };
  }
  // uv density of each mesh, in metres of surface per uv unit — the quantity the seam network
  // derives its plate frequency from. Computed on the CPU from the first triangle of each.
  const mpu = (mesh) => {
    const g = mesh.geometry;
    const pos = g.attributes.position, uv = g.attributes.uv;
    if (!pos || !uv) return null;
    const idx = g.index;
    const i0 = idx ? idx.getX(0) : 0, i1 = idx ? idx.getX(1) : 1, i2 = idx ? idx.getX(2) : 2;
    const sc = mesh.getWorldScale(new (mesh.position.constructor)()).x;
    const d3 = (p, q) => Math.hypot(pos.getX(p) - pos.getX(q), pos.getY(p) - pos.getY(q),
      pos.getZ(p) - pos.getZ(q)) * sc;
    const d2 = (p, q) => Math.hypot(uv.getX(p) - uv.getX(q), uv.getY(p) - uv.getY(q));
    const r1 = d3(i0, i1) / Math.max(d2(i0, i1), 1e-9), r2 = d3(i1, i2) / Math.max(d2(i1, i2), 1e-9);
    return { mpu: +( (r1 + r2) / 2 ).toFixed(4), tris: (idx ? idx.count : pos.count) / 3 };
  };
  const parts = {};
  e.scene.traverse((o) => {
    if (o.isMesh && ['capFixtureFR', 'earDiscR', 'elbowActOR'].includes(o.name)) parts[o.name] = mpu(o);
  });
  parts.BODY = mpu(body);
  return { diff, kitPlate: a.uRRWSeamPlate, bodyPlate: b.uRRWSeamPlate, parts };
});

await browser.close();
console.log(JSON.stringify(r, null, 1));
