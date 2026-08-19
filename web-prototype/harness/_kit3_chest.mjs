#!/usr/bin/env node
/**
 * KIT PROBE 3 — the generated chest's CROSS-SECTION, so the wordmark can be sized and seated.
 *
 *   node harness/_kit3_chest.mjs
 *
 * `_kit2_surfaces.mjs` measured torso half-width by firing a ray in from the side, and that
 * number is CONTAMINATED: this character stands in an A-pose, so a side ray hits the ARM long
 * before it reaches the chest. It reported half-widths of 0.29-0.33 m against a chest whose front
 * face is only 0.16 m deep — an obvious tell, and the reason this probe exists.
 *
 * Firing from the FRONT and sweeping x gives the real cross-section. The chest edge shows up as
 * the x where the surface either falls away sharply or jumps FORWARD onto the arm, and both are
 * visible in the table rather than assumed.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5178;
const log = (...a) => console.log(' ', ...a);
let child = null;
const alive = async () => {
  try { const r = await fetch(`http://localhost:${PORT}/`); return r.ok; } catch { return false; }
};
if (!(await alive())) {
  log('starting vite…');
  child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'dev'],
    { cwd: ROOT, stdio: 'ignore', shell: true });
  const t0 = Date.now();
  while (!(await alive())) {
    if (Date.now() - t0 > 60000) { console.error('vite failed to start'); process.exit(3); }
    await new Promise((r) => setTimeout(r, 400));
  }
}
log(`vite up on ${PORT}`);

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('  page error:', e.message));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });

const out = await page.evaluate(async () => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  const { GLTFLoader } = await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
  const { buildUnit4H } = await import('/src/characters/unit4h.js');
  const H = 1.7;
  const r4 = (x) => +x.toFixed(4);

  const sweep = (meshes, ys, xs) => ys.map((y) => ({
    y: r4(y),
    z: xs.map((x) => {
      const ray = new THREE.Raycaster(new THREE.Vector3(x, y, 2), new THREE.Vector3(0, 0, -1));
      const h = ray.intersectObjects(meshes, true)[0];
      // The NORMAL matters as much as the depth: a face turned more than 60 deg from the camera
      // cannot carry a legible mark, and that — not the silhouette — is the real edge of the chest.
      if (!h) return null;
      const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : null;
      return { z: r4(h.point.z), nz: n ? r4(n.z) : null, obj: h.object.name || '?' };
    }),
  }));

  const xs = [];
  for (let x = -0.24; x <= 0.2401; x += 0.02) xs.push(+x.toFixed(3));

  // --- generated
  const gltf = await new GLTFLoader().loadAsync('/models/anim/Meshy_AI_Lumi_Bot_biped_Animation_Walking_withSkin.glb');
  const rig = gltf.scene;
  rig.updateWorldMatrix(true, true);
  const b0 = new THREE.Box3().setFromObject(rig);
  rig.scale.setScalar(H / (b0.max.y - b0.min.y));
  rig.updateWorldMatrix(true, true);
  const b1 = new THREE.Box3().setFromObject(rig);
  rig.position.set(0, -b1.min.y, 0);
  rig.updateWorldMatrix(true, true);
  const gMeshes = [];
  rig.traverse((o) => { if (o.isSkinnedMesh || o.isMesh) gMeshes.push(o); });

  // --- procedural donor, swept identically, as the reference cross-section
  const unit = buildUnit4H({ height: H });
  unit.root.updateWorldMatrix(true, true);
  const ub = new THREE.Box3().setFromObject(unit.root);
  unit.root.position.y = -ub.min.y;
  unit.root.updateWorldMatrix(true, true);
  const uMeshes = [];
  unit.root.traverse((o) => { if (o.isMesh) uMeshes.push(o); });

  const ys = [1.16, 1.20, 1.2427, 1.28];
  return { xs, gen: sweep(gMeshes, ys, xs), don: sweep(uMeshes, [1.2427], xs) };
});

await browser.close();
if (child) child.kill();

const cell = (c) => (c === null ? '  --- ' : `${c.z.toFixed(3)}`.padStart(6));
const ncell = (c) => (c === null ? '  --- ' : `${c.nz.toFixed(2)}`.padStart(6));

const table = (name, rows, xs) => {
  console.log(`\n  ===== ${name} — front-hit z, sweeping x =====`);
  console.log('     x:  ' + xs.map((x) => x.toFixed(2).padStart(6)).join(''));
  for (const r of rows) console.log(`  y=${r.y.toFixed(3)}` + r.z.map(cell).join(''));
  console.log(`\n  ===== ${name} — surface normal z (1.00 = facing camera) =====`);
  console.log('     x:  ' + xs.map((x) => x.toFixed(2).padStart(6)).join(''));
  for (const r of rows) console.log(`  y=${r.y.toFixed(3)}` + r.z.map(ncell).join(''));
};

table('GENERATED', out.gen, out.xs);
table('PROCEDURAL DONOR (decal height 1.2427)', out.don, out.xs);

// Where does the donor's own 0.2992 m decal actually stop? +/-0.1496.
console.log('\n  The donor decal spans x -0.1496 .. +0.1496 at y 1.2427.');
console.log('  Read the donor row at those columns, then find the generated x with the same normal.\n');
