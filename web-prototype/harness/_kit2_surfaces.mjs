#!/usr/bin/env node
/**
 * KIT PROBE 2 — the SURFACES the kit has to sit on, plus the proportions to copy.
 *
 *   node harness/_kit2_surfaces.mjs
 *
 * `_kit1_probe.mjs` established the generated skull is 0.258 m wide where `mesh-identity.js`
 * assumes the art's 0.296 m. That is the whole bug behind "the ear discs read smaller": the disc
 * is placed at +/-0.088 m from centre while the skull surface is at +/-0.129 m, so it is not small,
 * it is BURIED — only whatever pokes through the temple is visible at all.
 *
 * The fix is not a bigger number, it is a derived one. This probe supplies the three things the
 * kit needs and currently guesses:
 *
 *   1. WHERE THE SKULL SURFACE IS, by raycast, at the height the ear actually sits.
 *   2. WHERE THE CHEST SURFACE IS, front z and half-width, so the wordmark lies ON it.
 *   3. THE PROPORTIONS unit4h ALREADY SHIPS — decal width against chest width, visor width
 *      against head width. Those are signed-off numbers on a build John has already judged, so
 *      carrying the RATIO across is a measurement, not a new opinion.
 *
 * ⚠️ Raw geometry positions are bind-pose world space for this asset. `_kit1_probe.mjs` proves it
 * and re-checks it every run; this probe uses raycasts in scene space, which is independent of
 * that question anyway.
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
  const boxOf = (o) => {
    const b = new THREE.Box3().setFromObject(o);
    return { min: b.min.toArray().map(r4), max: b.max.toArray().map(r4),
      size: b.getSize(new THREE.Vector3()).toArray().map(r4),
      centre: b.getCenter(new THREE.Vector3()).toArray().map(r4) };
  };

  // ---------- A. THE PROCEDURAL DONOR — the proportions already signed off ----------
  const unit = buildUnit4H({ height: H });
  unit.root.position.set(0, 0, 0);
  unit.root.updateWorldMatrix(true, true);
  const ub = new THREE.Box3().setFromObject(unit.root);
  unit.root.position.y = -ub.min.y;
  unit.root.updateWorldMatrix(true, true);

  const donor = { decal: null, face: null, head: null, chestAtDecal: null };
  unit.root.traverse((o) => {
    if (!o.isMesh) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (o.name === 'decal' || m?.name === 'unit4h.decal') donor.decal = boxOf(o);
    if (o.name === 'faceplate' || m?.name === 'unit4h.faceplate') donor.face = boxOf(o);
    if (o.name === 'chestShell') donor.chestShell = boxOf(o);
    if (o.name === 'headShell' || o.name === 'head') donor.head = boxOf(o);
  });

  // The donor's own head width, measured the same way as the generated one: the widest the skull
  // gets, by raycast from the side across a band of heights around the visor.
  const uMeshes = [];
  unit.root.traverse((o) => { if (o.isMesh) uMeshes.push(o); });
  const ray = new THREE.Raycaster();
  const sideHit = (meshes, y, z = 0) => {
    ray.set(new THREE.Vector3(2, y, z), new THREE.Vector3(-1, 0, 0));
    const h = ray.intersectObjects(meshes, true)[0];
    return h ? r4(h.point.x) : null;
  };
  const frontHit = (meshes, x, y) => {
    ray.set(new THREE.Vector3(x, y, 2), new THREE.Vector3(0, 0, -1));
    const h = ray.intersectObjects(meshes, true)[0];
    return h ? r4(h.point.z) : null;
  };

  // donor chest half-width at the decal's own height — the denominator for the decal ratio
  if (donor.decal) donor.chestAtDecal = sideHit(uMeshes, donor.decal.centre[1], 0);
  // donor head half-width at the faceplate's own height — the denominator for the visor ratio
  if (donor.face) donor.headAtFace = sideHit(uMeshes, donor.face.centre[1], 0);

  // ---------- B. THE GENERATED MESH ----------
  const url = '/models/anim/Meshy_AI_Lumi_Bot_biped_Animation_Walking_withSkin.glb';
  const gltf = await new GLTFLoader().loadAsync(url);
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

  const boneWorld = {};
  rig.traverse((o) => {
    if (!o.isBone) return;
    const v = new THREE.Vector3();
    o.getWorldPosition(v);
    boneWorld[o.name] = v.toArray().map(r4);
    boneWorld[`${o.name}__scale`] = r4(o.getWorldScale(new THREE.Vector3()).x);
  });

  // Skull half-width and front depth over the head's height band (head box was y 1.396..1.700)
  const skull = [];
  for (let y = 1.40; y <= 1.70; y += 0.025) {
    skull.push({ y: r4(y), halfW: sideHit(gMeshes, y, 0), frontZ: frontHit(gMeshes, 0, y) });
  }

  // Torso half-width and front depth over the chest band
  const torso = [];
  for (let y = 1.00; y <= 1.36; y += 0.02) {
    torso.push({ y: r4(y), halfW: sideHit(gMeshes, y, 0), frontZ: frontHit(gMeshes, 0, y) });
  }

  return { donor, boneWorld, skull, torso, H };
});

await browser.close();
if (child) child.kill();

const H = out.H;
const f = (v) => (v === null || v === undefined ? '  ----' : v.toFixed(4).padStart(7));
const ofH = (v) => (v === null || v === undefined ? '-----' : (v / H).toFixed(4));

console.log('\n  ===== A. PROCEDURAL DONOR (unit4h, already signed off) =====');
for (const k of ['decal', 'face', 'chestShell', 'head']) {
  const b = out.donor[k];
  if (!b) { console.log(`    ${k.padEnd(11)} — not found`); continue; }
  console.log(`    ${k.padEnd(11)} size ${b.size.map(f).join(' ')}  centre ${b.centre.map(f).join(' ')}`);
}
if (out.donor.decal && out.donor.chestAtDecal) {
  const dw = out.donor.decal.size[0], cw = out.donor.chestAtDecal * 2;
  console.log(`\n    DECAL / CHEST WIDTH  ${dw.toFixed(4)} / ${cw.toFixed(4)} = ${(dw / cw).toFixed(4)}`);
  console.log(`    decal centre height  ${out.donor.decal.centre[1].toFixed(4)} m = ${ofH(out.donor.decal.centre[1])} H`);
  console.log(`    decal aspect w/h     ${(out.donor.decal.size[0] / out.donor.decal.size[1]).toFixed(4)}`);
}
if (out.donor.face && out.donor.headAtFace) {
  const fw = out.donor.face.size[0], hw = out.donor.headAtFace * 2;
  console.log(`\n    VISOR / HEAD WIDTH   ${fw.toFixed(4)} / ${hw.toFixed(4)} = ${(fw / hw).toFixed(4)}`);
  console.log(`    visor size           ${out.donor.face.size.map(f).join(' ')}`);
}

console.log('\n  ===== B. GENERATED MESH — bones =====');
for (const n of ['Head', 'neck', 'Spine', 'Spine01', 'Spine02', 'LeftArm', 'RightArm']) {
  if (!out.boneWorld[n]) continue;
  console.log(`    ${n.padEnd(8)} world ${out.boneWorld[n].map(f).join(' ')}  worldScale ${out.boneWorld[`${n}__scale`]}`);
}

console.log('\n  ===== B. GENERATED MESH — SKULL profile (raycast) =====');
console.log('      y        halfWidth   frontZ    halfW/H');
for (const r of out.skull) console.log(`    ${f(r.y)}  ${f(r.halfW)}  ${f(r.frontZ)}   ${ofH(r.halfW)}`);

console.log('\n  ===== B. GENERATED MESH — TORSO profile (raycast) =====');
console.log('      y        halfWidth   frontZ    halfW/H');
for (const r of out.torso) console.log(`    ${f(r.y)}  ${f(r.halfW)}  ${f(r.frontZ)}   ${ofH(r.halfW)}`);
console.log('');
