#!/usr/bin/env node
/**
 * KIT PROBE — measure the GENERATED mesh's own head and chest, in bind pose.
 *
 *   node harness/_kit1_probe.mjs
 *
 * WHY. `mesh-identity.js` sizes every kit part off `ART.headW * H` — the head width the ART has,
 * as a fraction of figure height (0.174). That is the right number for the ART. It is NOT
 * necessarily the head the GENERATED mesh actually has, and if the generated skull is wider then
 * an ear disc sized at 45% of the art's head reads small ON THAT SKULL. The handoff's open hate
 * "the ear discs read smaller than the art's" is exactly that shape of bug, so measure the real
 * skull before touching a single constant.
 *
 * Method: a vertex belongs to a bone if that bone carries more than half its skin weight. That is
 * a real partition — every vertex lands in exactly one bucket — so the boxes cannot double-count.
 *
 * ⚠️ BIND POSE ONLY. The rig is loaded, scaled and grounded exactly as `mesh-animated.js` does it,
 * and NO animation is applied. A skinned box measured mid-stride depends on the frame you sampled.
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

  const H = 1.7;
  const url = '/models/anim/Meshy_AI_Lumi_Bot_biped_Animation_Walking_withSkin.glb';
  const gltf = await new GLTFLoader().loadAsync(url);
  const rig = gltf.scene;

  // Identical normalisation to mesh-animated.js, or nothing below is comparable to what renders.
  rig.updateWorldMatrix(true, true);
  const b0 = new THREE.Box3().setFromObject(rig);
  const s = H / (b0.max.y - b0.min.y);
  rig.scale.setScalar(s);
  rig.updateWorldMatrix(true, true);
  const b1 = new THREE.Box3().setFromObject(rig);
  rig.position.set(0, -b1.min.y, 0);
  rig.updateWorldMatrix(true, true);

  const bones = [];
  rig.traverse((o) => { if (o.isBone) bones.push(o.name); });

  /*
   * Box of the vertices a named bone owns (>50% of their weight), in the GEOMETRY's own space.
   *
   * ⚠️ DO NOT APPLY `matrixWorld`, AND DO NOT RUN THE SKINNING. Both were tried and both are
   * wrong for this asset, in ways worth recording because each printed a confident wrong table:
   *
   *   position x matrixWorld  -> a 3 mm head. The SkinnedMesh node carries scale 0.01 under a
   *                              parent carrying 100; the pair nets to identity, so applying only
   *                              the mesh's half shrinks everything by 100.
   *   applyBoneTransform      -> a 0 mm head. `Skeleton.update()` fills `boneMatrices` and it only
   *                              runs at RENDER time; nothing here renders, so the palette is
   *                              still the constructor's zero-filled array and every vertex
   *                              collapses onto the origin. Calling `update()` by hand does not
   *                              save it either — bone and bind matrices then compose to ~1e-5.
   *
   * The raw attribute is ALREADY bind-pose world space, and two independent measurements say so:
   * `geometry.boundingBox` is x +/-0.366, y 0 -> 1.700, z +/-0.166 — a grounded 1.7 m figure — and
   * the raycast grid below, fired in SCENE space, finds the chest front at z 0.166, the same
   * number. That agreement is the control; `assertGeometryIsWorld` re-checks it every run.
   */
  const boneBox = (want) => {
    const box = new THREE.Box3();
    let n = 0;
    rig.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      const idx = o.skeleton.bones.findIndex((b) => b.name === want);
      if (idx < 0) return;
      const pos = o.geometry.attributes.position;
      const si = o.geometry.attributes.skinIndex;
      const sw = o.geometry.attributes.skinWeight;
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        let w = 0;
        for (const c of ['X', 'Y', 'Z', 'W']) {
          if (si[`get${c}`](i) === idx) w += sw[`get${c}`](i);
        }
        if (w <= 0.5) continue;
        v.fromBufferAttribute(pos, i);
        box.expandByPoint(v);
        n++;
      }
    });
    if (!n) return null;
    const c = box.getCenter(new THREE.Vector3());
    const d = box.getSize(new THREE.Vector3());
    const r = (x) => +x.toFixed(4);
    return { n, center: [r(c.x), r(c.y), r(c.z)], size: [r(d.x), r(d.y), r(d.z)],
      min: [r(box.min.x), r(box.min.y), r(box.min.z)], max: [r(box.max.x), r(box.max.y), r(box.max.z)] };
  };

  /*
   * The chest's FRONT SURFACE, sampled by raycast rather than taken from a box — the wordmark has
   * to lie on the actual curved surface, and a box only knows the single frontmost point.
   * A grid of rays fired from well in front, straight back along -Z.
   */
  const meshes = [];
  rig.traverse((o) => { if (o.isSkinnedMesh || o.isMesh) meshes.push(o); });
  const ray = new THREE.Raycaster();
  ray.firstHitOnly = false;
  const surf = [];
  for (const yf of [0.60, 0.64, 0.68, 0.72, 0.76]) {
    const row = [];
    for (const xf of [-0.10, -0.05, 0, 0.05, 0.10]) {
      ray.set(new THREE.Vector3(xf * H, yf * H, H), new THREE.Vector3(0, 0, -1));
      const hit = ray.intersectObjects(meshes, true)[0];
      row.push(hit ? +hit.point.z.toFixed(4) : null);
    }
    surf.push({ y: +(yf * H).toFixed(3), yf, z: row });
  }

  /*
   * THE CONTROL FOR "geometry space == world space". Compare the geometry's own box against the
   * scene box three.js computes for the whole rig. If a future re-export changes the 0.01/100
   * pair, these diverge and every measurement below is silently off by that factor.
   */
  let geomBox = new THREE.Box3();
  rig.traverse((o) => {
    if (!o.isSkinnedMesh && !o.isMesh) return;
    o.geometry.computeBoundingBox();
    geomBox = geomBox.union(o.geometry.boundingBox);
  });

  const full = new THREE.Box3().setFromObject(rig);
  return {
    geomBox: { min: geomBox.min.toArray().map((v) => +v.toFixed(4)),
      max: geomBox.max.toArray().map((v) => +v.toFixed(4)) },
    sceneBox: { min: full.min.toArray().map((v) => +v.toFixed(4)),
      max: full.max.toArray().map((v) => +v.toFixed(4)) },
    bones,
    height: +(full.max.y - full.min.y).toFixed(4),
    scale: +s.toFixed(4),
    head: boneBox('Head'),
    neck: boneBox('neck'),
    spine02: boneBox('Spine02'),
    spine01: boneBox('Spine01'),
    spine: boneBox('Spine'),
    leftArm: boneBox('LeftArm'),
    surf,
  };
});

await browser.close();
if (child) child.kill();

const H = 1.7;
console.log(`\n  rig height ${out.height} m (scaled x${out.scale})`);
console.log(`  bones (${out.bones.length}): ${out.bones.join(' ')}\n`);

/* CONTROL 1 — geometry space must be world space, or every box below is off by 100x. */
{
  const g = out.geomBox, s = out.sceneBox;
  const off = Math.max(...[0, 1, 2].map((i) =>
    Math.max(Math.abs(g.min[i] - s.min[i]), Math.abs(g.max[i] - s.max[i]))));
  console.log(`  CONTROL geometry box ${g.min.join(',')} .. ${g.max.join(',')}`);
  console.log(`  CONTROL scene    box ${s.min.join(',')} .. ${s.max.join(',')}   max diff ${off.toFixed(4)} m`);
  if (off > 0.01) {
    console.error(`\n  FAILED — geometry space is NOT world space (off by ${off.toFixed(4)} m). ` +
      `The exporter's scale pair changed; measuring raw positions is no longer valid.\n`);
    process.exit(1);
  }
  console.log('');
}

const row = (name, b) => {
  if (!b) { console.log(`    ${name.padEnd(9)} — no vertices own this bone`); return; }
  console.log(`    ${name.padEnd(9)} n=${String(b.n).padStart(5)}  ` +
    `size ${b.size.map((v) => v.toFixed(3)).join(' × ')}  ` +
    `centre ${b.center.map((v) => v.toFixed(3)).join(',')}  ` +
    `widthOfH ${(b.size[0] / H).toFixed(4)}`);
};
console.log('  BONE-OWNED BOXES (world metres, x=width y=height z=depth):');
for (const k of ['head', 'neck', 'spine02', 'spine01', 'spine', 'leftArm']) row(k, out[k]);

/*
 * THE CONTROL. These buckets partition the mesh, so together they must span a real character:
 * the head's crown has to reach near 1.7 m and the head has to be a decent fraction of a metre
 * wide. The first run of this probe printed 0.003 m for every box and this check is what would
 * have caught it without needing to notice by eye.
 */
if (!out.head || out.head.max[1] < H * 0.85 || out.head.size[0] < 0.05) {
  console.error(`\n  FAILED — the head box is not a head: crown ${out.head?.max?.[1]} m, ` +
    `width ${out.head?.size?.[0]} m on a ${H} m figure. Skinning was not applied.\n`);
  process.exit(1);
}

console.log(`\n  ART assumes head width = 0.174 H = ${(0.174 * H).toFixed(4)} m`);
if (out.head) {
  const real = out.head.size[0];
  console.log(`  MESH head width         = ${(real / H).toFixed(4)} H = ${real.toFixed(4)} m` +
    `   ratio real/art = ${(real / (0.174 * H)).toFixed(3)}`);
}

console.log('\n  CHEST FRONT SURFACE, z of first hit firing -Z (null = missed):');
for (const r of out.surf) {
  console.log(`    y=${r.y.toFixed(3)} (${r.yf.toFixed(2)} H)  ` +
    r.z.map((v) => (v === null ? '  ----' : v.toFixed(3).padStart(6))).join(' '));
}
console.log('    x =        -0.170 -0.085  0.000  0.085  0.170\n');
