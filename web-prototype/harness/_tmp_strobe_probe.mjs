/**
 * TEMP PROBE — what is actually at each of the six strobe phases, in world millimetres.
 *
 * Reproduces `src/views/char-locomotion.js` EXACTLY: same `sampleGait` call, same station
 * construction (leg subtree REMOVED + joints replaced by empty Groups for the missing side),
 * same `place()` (model.position = offset.x/y/z, model.rotation = pitch/yaw/roll), stand at
 * y = 0. Then measures real mesh vertices in world space.
 *
 *   node harness/_tmp_strobe_probe.mjs
 */
import * as THREE from 'three';
import { buildUnit4H } from '../src/characters/unit4h.js';
import { sampleGait, Gait } from '../src/game/locomotion.js';
import { MOVE } from '../src/game/rules.js';

const STROBE = {
  walk: { gait: 'walk', speed: MOVE.walk },
  run: { gait: 'walk', speed: MOVE.run, run: true },
  limp: { gait: 'limp', speed: MOVE.walk * MOVE.limpScale, legs: { L: false, R: true } },
};

const _v = new THREE.Vector3();

/** lowest world-space vertex under `node`, over VISIBLE meshes only */
function lowest(node) {
  let lo = Infinity, at = null;
  node.updateMatrixWorld(true);
  node.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    for (let n = o; n && n !== node.parent; n = n.parent) if (!n.visible) return;
    const a = o.geometry.attributes.position;
    for (let i = 0; i < a.count; i++) {
      _v.fromBufferAttribute(a, i).applyMatrix4(o.matrixWorld);
      if (_v.y < lo) { lo = _v.y; at = _v.clone(); }
    }
  });
  return { y: lo, at };
}

function station(key, phase, plant) {
  const args = STROBE[key];
  const unit = buildUnit4H({ height: 1.7, materials: {} });
  const model = new THREE.Group();
  model.add(unit.root);
  const stand = new THREE.Group();
  stand.position.set(0, 0, 0.55);
  stand.rotation.y = 1.24;
  stand.add(model);
  // the view removes the missing leg's subtree BEFORE constructing the Gait
  for (const side of ['L', 'R']) {
    if (args.legs && args.legs[side] === false) {
      unit.limbs['leg' + side]?.removeFromParent();
      for (const nm of ['hip', 'knee', 'ankle']) unit.joints[nm + side] = new THREE.Group();
    }
  }
  const s = sampleGait(unit, { ...args, phase, plant, ground: true });
  unit.setPose(s.pose);
  const o = s.offset;
  model.position.set(o.x, o.y, o.z ?? 0);
  model.rotation.set(o.pitch, o.yaw, o.roll);
  stand.updateMatrixWorld(true);

  const whole = lowest(stand);
  const feet = {};
  for (const side of ['L', 'R']) {
    const j = unit.joints['ankle' + side];
    if (!j || !j.parent) { feet[side] = null; continue; }
    const l = lowest(j);
    feet[side] = Number.isFinite(l.y) ? l.y : null;
  }
  // which side is in stance, per _footPath's own u
  const g = new Gait(unit, { plant });
  return { whole: whole.y, feet, offset: o };
}

const gaitsWanted = process.argv[2] ? [process.argv[2]] : ['walk', 'run', 'limp'];
for (const key of gaitsWanted) {
  console.log(`\n=== ${key.toUpperCase()} — lowest world y in mm at the six strobe phases ===`);
  console.log('  panel  phase   plant   lowest(all)   footL      footR      off.y');
  for (let i = 0; i < 6; i++) {
    const phase = i / 6;
    for (const plant of [true, false]) {
      const r = station(key, phase, plant);
      const f = (v) => (v === null ? '    --  ' : (v * 1000).toFixed(1).padStart(8));
      console.log(
        `  ${String(i + 1).padStart(2)}(i=${i})  ${phase.toFixed(3)}  ` +
        `${plant ? ' ON' : 'OFF'}  ${(r.whole * 1000).toFixed(1).padStart(9)}  ` +
        `${f(r.feet.L)}  ${f(r.feet.R)}  ${(r.offset.y * 1000).toFixed(1).padStart(8)}`);
    }
  }
}
