/**
 * TEMP PROBE — foot pitch / heel / toe / sole height at the SIX STROBE PHASES exactly.
 *
 * `footskate.mjs --roll` buckets a live trace into 20 bins; the strobe renders six exact
 * phases via `sampleGait`. Those are different samples of the same curve, and the round-5
 * claim ("11.7 deg at 2 mm at phase 4/6") was made about the strobe's phase, so this
 * reproduces the strobe's own call.
 *
 *   node harness/_tmp_strobe_pitch.mjs limp
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

function build(args) {
  const unit = buildUnit4H({ height: 1.7, materials: {} });
  const model = new THREE.Group();
  model.add(unit.root);
  const parent = new THREE.Group();
  parent.add(model);
  for (const side of ['L', 'R']) {
    if (args.legs && args.legs[side] === false) {
      unit.limbs['leg' + side]?.removeFromParent();
      for (const nm of ['hip', 'knee', 'ankle']) unit.joints[nm + side] = new THREE.Group();
    }
  }
  return { unit, model, parent };
}

for (const key of (process.argv[2] ? [process.argv[2]] : ['limp', 'run', 'walk'])) {
  const args = STROBE[key];
  for (const plant of [true, false]) {
    // the hull landmarks, taken the way footskate.mjs --roll takes them
    const probe = build(args);
    const g = new Gait(probe.unit, { plant });
    const hull = g._P?.hull ?? [];
    let ylow = Infinity;
    for (const p of hull) if (p[1] < ylow) ylow = p[1];
    const flat = hull.filter((p) => p[1] <= ylow + 0.005);
    const toeP = flat.reduce((a, b) => (b[0] > a[0] ? b : a));
    const heelP = flat.reduce((a, b) => (b[0] < a[0] ? b : a));
    const toe = new THREE.Vector3(0, toeP[1], toeP[0]);
    const heel = new THREE.Vector3(0, heelP[1], heelP[0]);

    console.log(`\n=== ${key.toUpperCase()}  plant ${plant ? 'ON ' : 'OFF'} — at the six strobe phases ===`);
    console.log('  panel  phase    side   pitch(deg)   toe(mm)   heel(mm)   sole-lowest(mm)');
    for (let i = 0; i < 6; i++) {
      const phase = i / 6;
      const r = build(args);
      const s = sampleGait(r.unit, { ...args, phase, plant, ground: true });
      r.unit.setPose(s.pose);
      r.model.position.set(s.offset.x, s.offset.y, s.offset.z ?? 0);
      r.model.rotation.set(s.offset.pitch, s.offset.yaw, s.offset.roll);
      r.parent.updateMatrixWorld(true);
      const parts = [];
      for (const side of ['L', 'R']) {
        const j = r.unit.joints['ankle' + side];
        if (!j?.parent) continue;
        const m = j.matrixWorld;
        const t = toe.clone().applyMatrix4(m), h = heel.clone().applyMatrix4(m);
        const fwd = new THREE.Vector3(m.elements[8], m.elements[9], m.elements[10]).normalize();
        const pitch = Math.atan2(-fwd.y, Math.hypot(fwd.x, fwd.z)) * 180 / Math.PI;
        // lowest actual vertex of this foot
        let lo = Infinity;
        const v = new THREE.Vector3();
        j.updateMatrixWorld(true);
        j.traverse((o) => {
          if (!o.isMesh || !o.geometry?.attributes?.position || !o.visible) return;
          const a = o.geometry.attributes.position;
          for (let k = 0; k < a.count; k++) {
            v.fromBufferAttribute(a, k).applyMatrix4(o.matrixWorld);
            if (v.y < lo) lo = v.y;
          }
        });
        parts.push(`${side}  ${pitch.toFixed(1).padStart(8)}   ${(t.y * 1000).toFixed(1).padStart(7)}` +
          `   ${(h.y * 1000).toFixed(1).padStart(8)}   ${(lo * 1000).toFixed(1).padStart(9)}`);
      }
      console.log(`  ${String(i + 1).padStart(2)}(i=${i})  ${phase.toFixed(3)}   ` +
        parts.join('\n                        '));
    }
  }
}
