#!/usr/bin/env node
/**
 * WHAT THE KIT ACTUALLY DELIVERED, in metres, off the built character.
 *
 *   node harness/_kit8_delivered.mjs
 *
 * The visor was SIZED to 0.7835 of head width and John says it reads comedically small. Measuring
 * the art agrees with the target — `_kit7_artratio.mjs` puts the art at 0.78 across two colour
 * cuts — so the target is not the problem and the delivery is. This measures the delivered part
 * rather than the intended one.
 *
 * The suspect is CONFORMING. Projecting a flat plate outward from the head centre onto the skull
 * preserves each vertex's ANGLE, not its width. A plate standing proud of the face sits FURTHER
 * from the centre than the skull surface does, so its projection lands INSIDE its own outline and
 * the visor comes out narrower than it was built. The sizing happens before the projection, so
 * the number that was set is not the number that ships.
 *
 * Also dumps the mint caps and the arm bones' bind-pose axes, for the second complaint.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5178;
let child = null;
const alive = async () => {
  try { const r = await fetch(`http://localhost:${PORT}/`); return r.ok; } catch { return false; }
};
if (!(await alive())) {
  console.log('  starting vite…');
  child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'dev'],
    { cwd: ROOT, stdio: 'ignore', shell: true });
  const t0 = Date.now();
  while (!(await alive())) {
    if (Date.now() - t0 > 60000) { console.error('vite failed to start'); process.exit(3); }
    await new Promise((r) => setTimeout(r, 400));
  }
}

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });

const out = await page.evaluate(async () => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  const { GLTFLoader } = await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
  const { unit4hMaterials } = await import('/src/materials/surfaces/robot.js');
  const { attachIdentity } = await import('/src/characters/mesh-identity.js');
  const H = 1.7;
  const r4 = (x) => +x.toFixed(4);

  const gltf = await new GLTFLoader().loadAsync('/models/anim/Meshy_AI_Lumi_Bot_biped_Animation_Walking_withSkin.glb');
  const rig = gltf.scene;
  rig.updateWorldMatrix(true, true);
  const b0 = new THREE.Box3().setFromObject(rig);
  rig.scale.setScalar(H / (b0.max.y - b0.min.y));
  rig.updateWorldMatrix(true, true);
  const b1 = new THREE.Box3().setFromObject(rig);
  rig.position.set(0, -b1.min.y, 0);
  rig.updateWorldMatrix(true, true);

  // The body's own surface, sampled BEFORE the kit goes on, so kit parts cannot be hit.
  const body = [];
  rig.traverse((o) => { if (o.isSkinnedMesh || o.isMesh) body.push(o); });
  const sideHit = (y, z = 0) => {
    const ray = new THREE.Raycaster(new THREE.Vector3(3, y, z), new THREE.Vector3(-1, 0, 0));
    const h = ray.intersectObjects(body, true)[0];
    return h ? r4(h.point.x) : null;
  };

  const kit = attachIdentity(rig, unit4hMaterials({}), H);
  rig.updateWorldMatrix(true, true);

  const boxes = {};
  for (const n of ['faceplate', 'visorBezel', 'mintCapL', 'mintCapR', 'earL', 'wordmark']) {
    let o = null;
    rig.traverse((c) => { if (c.name === n) o = c; });
    if (!o) { boxes[n] = null; continue; }
    o.geometry.boundingBox = null;
    o.geometry.computeBoundingBox();
    /*
     * ⚠️ A SKINNED KIT PART MUST BE READ FROM ITS GEOMETRY, NOT VIA `setFromObject`. Its node
     * carries the body's 0.01 scale, and its geometry is already in bind-pose WORLD space, so
     * `setFromObject` multiplies the two and reports the shoulder caps at y 0.0118..0.0132 — the
     * right numbers, 100x too small. That is the same 0.01/100 trap `_kit1_probe.mjs` documents,
     * arriving through a new door the moment those parts stopped being props and became skin.
     */
    const b = o.isSkinnedMesh ? o.geometry.boundingBox.clone() : new THREE.Box3().setFromObject(o);
    boxes[n] = { min: b.min.toArray().map(r4), max: b.max.toArray().map(r4),
      size: b.getSize(new THREE.Vector3()).toArray().map(r4) };
  }

  // Arm bones: where they are, and which way their local axes point in the bind pose.
  const arms = {};
  for (const n of ['LeftShoulder', 'LeftArm', 'RightArm', 'LeftForeArm']) {
    let b = null;
    rig.traverse((o) => { if (o.name === n) b = o; });
    if (!b) continue;
    const p = b.getWorldPosition(new THREE.Vector3());
    const q = b.getWorldQuaternion(new THREE.Quaternion());
    arms[n] = {
      pos: p.toArray().map(r4),
      localYinWorld: new THREE.Vector3(0, 1, 0).applyQuaternion(q).toArray().map(r4),
      localXinWorld: new THREE.Vector3(1, 0, 0).applyQuaternion(q).toArray().map(r4),
    };
  }

  // The art puts the caps between 0.227 and 0.305 of figure height below the crown.
  const crown = new THREE.Box3().setFromObject(rig).max.y;
  const artCap = { top: r4(crown - 0.227 * H), bot: r4(crown - 0.305 * H) };
  const shoulderProfile = [];
  for (let y = artCap.bot - 0.04; y <= artCap.top + 0.06; y += 0.02) {
    shoulderProfile.push({ y: r4(y), halfW: sideHit(y) });
  }

  return { measured: kit.measured, boxes, arms, artCap, crown: r4(crown), shoulderProfile };
});

await browser.close();
if (child) child.kill();

const m = out.measured;
const H = 1.7;
console.log(`\n  head measured ${m.headW.toFixed(4)} m   visor TARGET ${m.visorW.toFixed(4)} m ` +
  `(${(m.visorW / m.headW).toFixed(4)} of head)`);

const fp = out.boxes.faceplate;
if (fp) {
  console.log(`  visor DELIVERED ${fp.size[0].toFixed(4)} x ${fp.size[1].toFixed(4)} m ` +
    `= ${(fp.size[0] / m.headW).toFixed(4)} of head` +
    `   -> shortfall ${((1 - fp.size[0] / m.visorW) * 100).toFixed(1)}%`);
  console.log(`  calibrated target 0.83 of skull; see ARTREF in mesh-identity.js. Delivered ${(fp.size[0] / m.headW).toFixed(3)}.`);
}
for (const [k, b] of Object.entries(out.boxes)) {
  if (!b) { console.log(`  ${k.padEnd(11)} MISSING`); continue; }
  console.log(`  ${k.padEnd(11)} y ${b.min[1].toFixed(4)}..${b.max[1].toFixed(4)}  ` +
    `x ${b.min[0].toFixed(4)}..${b.max[0].toFixed(4)}  size ${b.size.map((v) => v.toFixed(4)).join(' ')}`);
}

console.log(`\n  ARM BONE AXES (bind pose) — "localYinWorld" is where the part's +Y actually goes:`);
for (const [n, a] of Object.entries(out.arms)) {
  console.log(`    ${n.padEnd(13)} at ${a.pos.join(',')}   +Y -> ${a.localYinWorld.join(',')}   ` +
    `+X -> ${a.localXinWorld.join(',')}`);
}

console.log(`\n  ART puts the mint caps at y ${out.artCap.bot}..${out.artCap.top} ` +
  `(crown ${out.crown}, 0.227..0.305 H below it)`);
const mc = out.boxes.mintCapL;
if (mc) console.log(`  WE put them at    y ${mc.min[1].toFixed(4)}..${mc.max[1].toFixed(4)}  ` +
  `-> ${((mc.min[1] + mc.max[1]) / 2 - (out.artCap.bot + out.artCap.top) / 2).toFixed(4)} m off centre-to-centre`);

console.log('\n  BODY half-width through the art\'s cap band:');
for (const r of out.shoulderProfile) {
  console.log(`    y ${r.y.toFixed(3)}  halfW ${r.halfW === null ? '----' : r.halfW.toFixed(4)}`);
}
console.log('');
