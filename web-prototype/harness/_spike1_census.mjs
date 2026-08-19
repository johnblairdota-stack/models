#!/usr/bin/env node
/**
 * ESTATE-SPIKE-1 — SCENE CENSUS, no GPU timing at all.
 *
 * Answers "what does the showcase gallery contain that the game's gallery does not", in the
 * only three units that matter for the port: DRAW CALLS, TRIANGLES, and LIGHT COUNT BY TYPE.
 * `renderer.info.render` is a CPU-side counter three.js increments as it submits, so this
 * contends with nothing on the GPU and is safe to run while another agent works — HANDOFF's
 * "draw-call counts are deterministic and exempt" rule.
 *
 *   node harness/_spike1_census.mjs --view room.gallery
 *   node harness/_spike1_census.mjs --view game.play --spaces
 *
 * Spawns its OWN vite on a private port and stubs `/@vite/client`, so a concurrent agent's
 * save cannot reload the page mid-census.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const VIEW = opt('view', 'room.gallery');
const EXTRA = opt('extra', 'quality=medium');
const PORT = +opt('port', 5411);

const portOpen = (p) => new Promise((res) => {
  const s = net.connect(p, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
});

let child = null;
if (!(await portOpen(PORT))) {
  child = spawn(process.execPath,
    [path.join(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
    { cwd: ROOT, stdio: 'ignore' });
  const t0 = Date.now();
  while (!(await portOpen(PORT))) {
    if (Date.now() - t0 > 60000) throw new Error('vite did not come up');
    await new Promise((r) => setTimeout(r, 300));
  }
}

const browser = await chromium.launch({ args: ['--use-angle=default', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.route('**/@vite/client', (route) => route.fulfill({
  status: 200, contentType: 'application/javascript',
  body: `const noop = () => {};
export const createHotContext = () => ({ accept: noop, acceptExports: noop, dispose: noop,
  prune: noop, decline: noop, invalidate: noop, on: noop, off: noop, send: noop, data: {} });
export const updateStyle = () => {}; export const removeStyle = () => {};
export const injectQuery = (u) => u; export const ErrorOverlay = class {};`,
}));
let navs = 0;
page.on('framenavigated', (f) => { if (f === page.mainFrame()) navs++; });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message ?? e).slice(0, 200)));

await page.goto(`http://127.0.0.1:${PORT}/?view=${encodeURIComponent(VIEW)}&capture=1&${EXTRA}`,
  { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(
  () => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1',
  null, { timeout: 300000 });
await page.evaluate(() => window.__rrr.settle(10));

const out = await page.evaluate(() => {
  const eng = window.__rrr.engine;
  const r = eng.renderer.info;
  const lights = { point: 0, spot: 0, dir: 0, hemi: 0, rect: 0, amb: 0, shadow: 0 };
  const byName = new Map();
  let meshes = 0, visMeshes = 0, tris = 0, instanced = 0;
  eng.scene.traverse((o) => {
    if (o.isPointLight) lights.point++;
    else if (o.isSpotLight) lights.spot++;
    else if (o.isDirectionalLight) lights.dir++;
    else if (o.isHemisphereLight) lights.hemi++;
    else if (o.isRectAreaLight) lights.rect++;
    else if (o.isAmbientLight) lights.amb++;
    if (o.isLight && o.castShadow) lights.shadow++;
    if (!o.isMesh) return;
    meshes++;
    if (o.isInstancedMesh) instanced++;
    const t = (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3
      * (o.isInstancedMesh ? o.count : 1);
    tris += t;
    // walk up to the nearest named ancestor that looks like a space/group
    let p = o, chain = [];
    while (p && chain.length < 6) { if (p.name) chain.unshift(p.name); p = p.parent; }
    const k = chain.find((n) => n.startsWith('space.')) ?? (o.name || '(unnamed)');
    const e = byName.get(k) ?? { n: 0, tris: 0 };
    e.n++; e.tris += t; byName.set(k, e);
    if (o.visible) visMeshes++;
  });
  return {
    calls: r.render.calls, drawnTris: r.render.triangles,
    geometries: r.memory.geometries, textures: r.memory.textures,
    programs: eng.renderer.info.programs?.length ?? -1,
    meshes, visMeshes, sceneTris: tris, instanced, lights,
    groups: [...byName.entries()].map(([k, v]) => [k, v.n, v.tris]).sort((a, b) => b[2] - a[2]).slice(0, 26),
  };
});

console.log(`\n=== ${VIEW}  (${EXTRA})  navigations=${navs} ===`);
console.log(`draw calls      ${out.calls}`);
console.log(`triangles drawn ${(out.drawnTris / 1000).toFixed(1)}k   scene total ${(out.sceneTris / 1000).toFixed(1)}k`);
console.log(`meshes          ${out.meshes} (${out.visMeshes} visible, ${out.instanced} instanced)`);
console.log(`geometries ${out.geometries}  textures ${out.textures}  programs ${out.programs}`);
console.log(`LIGHTS  point ${out.lights.point}  spot ${out.lights.spot}  dir ${out.lights.dir}  hemi ${out.lights.hemi}  rectArea ${out.lights.rect}  ambient ${out.lights.amb}   shadow-casting ${out.lights.shadow}`);
if (argv.includes('--groups')) {
  console.log('top groups (name, meshes, tris):');
  for (const [k, n, t] of out.groups) console.log(`  ${String(t / 1000 | 0).padStart(6)}k  x${String(n).padStart(4)}  ${k}`);
}
if (errs.length) console.log('page errors:', errs.slice(0, 4));
await browser.close();
if (child) child.kill();
process.exit(0);
