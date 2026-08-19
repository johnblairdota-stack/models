#!/usr/bin/env node
/**
 * DUMP THE RIG'S BIND-POSE JOINT POSITIONS — the input the Blender splitter needs.
 *
 *   node harness/rig-joints.mjs                 -> assets/rig/unit4h_joints.json
 *
 * WHY THIS EXISTS. `docs/STYLE_CONTRACT.md` §6 says a generated shell part clips to exactly one
 * named joint, and John's ruling is to split the generated mesh in Blender rather than pay for
 * Meshy's Auto Split. Splitting by proximity needs to know WHERE the joints are — and that
 * lives in `buildUnit4H`, which is JavaScript running against three.js. Blender cannot ask it.
 *
 * So the seam is a FILE. This dumps the rig's bind pose once; `tools/condition_asset.py` reads
 * it and assigns every triangle to its nearest joint. Re-run it whenever `unit4h.js` changes
 * the skeleton, or the splitter will be cutting against a rig that no longer exists — the same
 * staleness trap that made every hunter verdict describe a frame nobody had rendered.
 *
 * ⚠️ POSITIONS ARE IN METRES, WORLD SPACE, AT A 1.7 m BIND POSE, ORIGIN BETWEEN THE FEET ON
 * THE GROUND. That matches what the conditioning script produces, which is the only reason the
 * two coordinate systems can be compared at all. It also matches glTF's Y-up convention, so no
 * axis swap is needed on either side.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5178;
const OUT = path.join(ROOT, 'assets', 'rig', 'unit4h_joints.json');

const log = (...a) => console.log(' ', ...a);

// Reuse a live dev server if one is already up — every concurrent agent shares :5178 on purpose.
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

const joints = await page.evaluate(async () => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  const { buildUnit4H } = await import('/src/characters/unit4h.js');

  const unit = buildUnit4H({ height: 1.7 });
  // BIND POSE, not a posed one: the splitter must cut against the rest shape the mesh was
  // generated in. Any pose here would move joints away from where the mesh's limbs actually are.
  unit.root.position.set(0, 0, 0);
  unit.root.updateWorldMatrix(true, true);

  // Drop the rig onto the ground plane the same way the conditioning script does, so both
  // coordinate systems agree on where y=0 is.
  const box = new THREE.Box3().setFromObject(unit.root);
  const lift = -box.min.y;
  unit.root.position.y = lift;
  unit.root.updateWorldMatrix(true, true);

  const out = {};
  const v = new THREE.Vector3();
  for (const [name, node] of Object.entries(unit.joints ?? {})) {
    if (!node?.getWorldPosition) continue;
    node.getWorldPosition(v);
    out[name] = [+v.x.toFixed(5), +v.y.toFixed(5), +v.z.toFixed(5)];
  }
  /*
   * THE FACEPLATE'S WORLD BOX, because the conditioning script has to cut an APERTURE in the
   * generated head for it. The generated shell is a closed surface, so the rig's face ends up
   * sealed inside it and the character has no eyes. Guessing the hole's position from the head
   * joint would be a guess; the faceplate is a real mesh with a real box, so measure it.
   */
  let face = null;
  unit.root.traverse((o) => {
    if (!o.isMesh) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (m?.name === 'unit4h.faceplate') {
      const bb = new THREE.Box3().setFromObject(o);
      const c = bb.getCenter(new THREE.Vector3());
      const s = bb.getSize(new THREE.Vector3());
      face = {
        center: [+c.x.toFixed(5), +c.y.toFixed(5), +c.z.toFixed(5)],
        size: [+s.x.toFixed(5), +s.y.toFixed(5), +s.z.toFixed(5)],
      };
    }
  });

  const b2 = new THREE.Box3().setFromObject(unit.root);
  return { joints: out, face, height: +(b2.max.y - b2.min.y).toFixed(5), baseY: +b2.min.y.toFixed(5) };
});

await browser.close();
if (child) child.kill();

const names = Object.keys(joints.joints);
if (!names.length) {
  console.error('\n  FAILED — the rig exposed no joints. buildUnit4H().joints was empty or missing.\n');
  process.exit(1);
}

mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({
  rig: 'unit4h',
  authoredHeight: joints.height,
  note: "World-space metres, bind pose, origin between the feet on the ground (y=0). Y-up, matches glTF.",
  face: joints.face,
  joints: joints.joints,
}, null, 2));

console.log(`\n  rig height ${joints.height} m, base y ${joints.baseY}`);
console.log(`  ${names.length} joints dumped -> ${path.relative(ROOT, OUT)}\n`);
for (const n of names.sort()) {
  const [x, y, z] = joints.joints[n];
  console.log(`    ${n.padEnd(11)} ${String(x).padStart(8)} ${String(y).padStart(8)} ${String(z).padStart(8)}`);
}
console.log('');
