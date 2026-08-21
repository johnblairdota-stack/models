#!/usr/bin/env node
/**
 * BONE-LOCAL FRAME PROBE — the measurement behind `aBoneLocal` / `aBoneId`.
 *
 *   node harness/evidence/_fd1_frames.mjs
 *
 * Loads `player_unwrapped.glb` in NODE (no browser, no GPU — the whole computation is CPU
 * arithmetic on bind data) and answers the three questions `docs/design/player-fine-detail-plan.md`
 * says the attribute cannot be trusted without:
 *
 *   1. does the frame reproduce three.js's OWN skinning?     (the formula control)
 *   2. is a forearm vertex inside the forearm's own length?  (the plan's stated control)
 *   3. how many vertices are genuinely ambiguous?            (the dominant-bone risk)
 *
 * plus the per-bone axis, DERIVED parent-to-child, never assumed.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const H = 1.7;

const buf = readFileSync(path.join(ROOT, 'public/models/anim/player_unwrapped.glb'));
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const gltf = await new Promise((res, rej) => new GLTFLoader().parse(ab, '', res, rej));
const rig = gltf.scene;

// Same normalisation as mesh-avatar.js, so the metres reported here are the metres it ships.
rig.updateWorldMatrix(true, true);
const b0 = new THREE.Box3().setFromObject(rig);
rig.scale.setScalar(H / (b0.max.y - b0.min.y));
rig.updateWorldMatrix(true, true);
const b1 = new THREE.Box3().setFromObject(rig);
rig.position.set(0, -b1.min.y, 0);
rig.updateWorldMatrix(true, true);

let body = null;
rig.traverse((o) => { if (o.isSkinnedMesh && !body) body = o; });
const sk = body.skeleton;
const g = body.geometry;
const pos = g.attributes.position;
const si = g.attributes.skinIndex;
const sw = g.attributes.skinWeight;

const idxOf = new Map(sk.bones.map((b, i) => [b.name, i]));
const uniScale = (m) => {
  const s = new THREE.Vector3();
  new THREE.Matrix4().copy(m).decompose(new THREE.Vector3(), new THREE.Quaternion(), s);
  return (s.x + s.y + s.z) / 3;
};

// ---------------------------------------------------------------- 1. the formula control
{
  const tmp = new THREE.Vector3();
  let worst = 0;
  for (let k = 0; k < 800; k++) {
    const i = Math.floor(k * pos.count / 800);
    const truth = new THREE.Vector3().fromBufferAttribute(pos, i);
    body.applyBoneTransform(i, truth);
    truth.applyMatrix4(body.matrixWorld);
    const base = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(body.bindMatrix);
    const mine = new THREE.Vector3();
    for (let c = 0; c < 4; c++) {
      const w = sw.getComponent(i, c);
      if (!w) continue;
      const bi = si.getComponent(i, c);
      mine.addScaledVector(tmp.copy(base).applyMatrix4(sk.boneInverses[bi])
        .applyMatrix4(sk.bones[bi].matrixWorld), w);
    }
    worst = Math.max(worst, mine.distanceTo(truth));
  }
  console.log(`CONTROL A  frame vs three.js own skinning: max err ${worst.toExponential(2)} m over 800 verts`);
  // The control's control: the SAME loop with the bind-pose inverse left out must blow up.
  let worstBad = 0;
  for (let k = 0; k < 200; k++) {
    const i = Math.floor(k * pos.count / 200);
    const truth = new THREE.Vector3().fromBufferAttribute(pos, i);
    body.applyBoneTransform(i, truth);
    truth.applyMatrix4(body.matrixWorld);
    const base = new THREE.Vector3().fromBufferAttribute(pos, i);
    const bad = new THREE.Vector3();
    for (let c = 0; c < 4; c++) {
      const w = sw.getComponent(i, c);
      if (!w) continue;
      bad.addScaledVector(tmp.copy(base).applyMatrix4(sk.bones[si.getComponent(i, c)].matrixWorld), w);
    }
    worstBad = Math.max(worstBad, bad.distanceTo(truth));
  }
  console.log(`           its control (boneInverses omitted):  max err ${worstBad.toFixed(3)} m  <- must be large`);
}

// ---------------------------------------------------------------- 2. per-bone axis + length
/** Bone-local position of another bone's origin, in METRES of the finished character. */
const originInFrame = (bi, other) => {
  const s = uniScale(sk.bones[bi].matrixWorld);
  const p = new THREE.Vector3().setFromMatrixPosition(sk.bones[other].matrixWorld);
  // world -> bone local, then back to world SCALE so the number is metres
  return p.applyMatrix4(new THREE.Matrix4().copy(sk.bones[bi].matrixWorld).invert()).multiplyScalar(s);
};

const boneChildren = sk.bones.map(() => []);
sk.bones.forEach((b, i) => {
  if (b.parent && idxOf.has(b.parent.name)) boneChildren[idxOf.get(b.parent.name)].push(i);
});

const frames = sk.bones.map((b, i) => {
  const kids = boneChildren[i];
  let axis = new THREE.Vector3();
  let len = 0;
  let src;
  if (kids.length === 1) {
    axis = originInFrame(i, kids[0]);
    len = axis.length();
    src = `child:${sk.bones[kids[0]].name}`;
  } else if (kids.length > 1) {
    for (const k of kids) axis.add(originInFrame(i, k).normalize());
    len = kids.reduce((a, k) => a + originInFrame(i, k).length(), 0) / kids.length;
    src = `mean of ${kids.length}`;
  } else if (b.parent && idxOf.has(b.parent.name)) {
    // A LEAF still gets a parent-to-child axis — it just IS the child.
    const pi = idxOf.get(b.parent.name);
    axis = originInFrame(i, i).sub(originInFrame(i, pi));
    len = axis.length();
    src = `fromParent:${b.parent.name}`;
  } else { axis.set(0, 1, 0); src = 'root(none)'; }
  if (axis.lengthSq() > 1e-12) axis.normalize(); else { axis.set(0, 1, 0); src += '(degenerate)'; }
  return { i, name: b.name, axis, len, src, kids: kids.length };
});

console.log('\nBONE FRAMES — axis DERIVED parent-to-child, expressed in the bone\'s OWN local frame');
console.log('name             len(m)   local axis                 world axis of local +Y        source');
for (const f of frames) {
  const worldY = new THREE.Vector3(0, 1, 0)
    .applyQuaternion(sk.bones[f.i].getWorldQuaternion(new THREE.Quaternion()));
  console.log(
    f.name.padEnd(16),
    f.len.toFixed(4).padStart(7),
    `(${f.axis.toArray().map((v) => v.toFixed(3).padStart(6)).join(',')})`,
    ` (${worldY.toArray().map((v) => v.toFixed(3).padStart(6)).join(',')})`,
    ' ', f.src);
}

// ---------------------------------------------------------------- 3. the attribute + controls
const dom = new Int32Array(pos.count);
const local = new Float32Array(pos.count * 3);
const amb = new Uint8Array(pos.count);
const AMB = 0.15;
const tmp = new THREE.Vector3();
const pairCount = new Map();
for (let i = 0; i < pos.count; i++) {
  let w0 = -1; let w1 = -1; let b0i = 0; let b1i = 0;
  for (let c = 0; c < 4; c++) {
    const w = sw.getComponent(i, c);
    const b = si.getComponent(i, c);
    if (w > w0) { w1 = w0; b1i = b0i; w0 = w; b0i = b; }
    else if (w > w1) { w1 = w; b1i = b; }
  }
  dom[i] = b0i;
  if (w1 > 0 && (w0 - w1) <= AMB * w0) {
    amb[i] = 1;
    const key = [sk.bones[b0i].name, sk.bones[b1i].name].sort().join(' / ');
    pairCount.set(key, (pairCount.get(key) ?? 0) + 1);
  }
  const s = uniScale(sk.bones[b0i].matrixWorld);
  tmp.fromBufferAttribute(pos, i).applyMatrix4(body.bindMatrix)
    .applyMatrix4(sk.boneInverses[b0i]).multiplyScalar(s);
  local[i * 3] = tmp.x; local[i * 3 + 1] = tmp.y; local[i * 3 + 2] = tmp.z;
}

const ambN = amb.reduce((a, v) => a + v, 0);
console.log(`\nAMBIGUOUS VERTICES  ${ambN} of ${pos.count} = ${(100 * ambN / pos.count).toFixed(2)}% ` +
  `(top two weights within ${AMB * 100}%)`);
for (const [k, v] of [...pairCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  console.log(`   ${String(v).padStart(5)}  ${k}`);
}
for (const t of [0.02, 0.05, 0.10, 0.15, 0.25, 0.40]) {
  let n = 0;
  for (let i = 0; i < pos.count; i++) {
    let w0 = -1; let w1 = -1;
    for (let c = 0; c < 4; c++) { const w = sw.getComponent(i, c); if (w > w0) { w1 = w0; w0 = w; } else if (w > w1) w1 = w; }
    if (w1 > 0 && (w0 - w1) <= t * w0) n++;
  }
  console.log(`   threshold ${String(t * 100).padStart(3)}%  ->  ${n} (${(100 * n / pos.count).toFixed(2)}%)`);
}

console.log('\nPER-BONE |aBoneLocal| AGAINST THAT BONE\'S OWN LENGTH');
console.log('bone             n     len(m)   max|L|   p99|L|   max/len  p99/len');
for (const f of frames) {
  const rows = [];
  for (let i = 0; i < pos.count; i++) {
    if (dom[i] !== f.i) continue;
    rows.push(Math.hypot(local[i * 3], local[i * 3 + 1], local[i * 3 + 2]));
  }
  if (rows.length < 20) continue;
  rows.sort((a, b) => a - b);
  const mx = rows[rows.length - 1];
  const p99 = rows[Math.floor(rows.length * 0.99)];
  console.log(f.name.padEnd(16), String(rows.length).padStart(5), f.len.toFixed(4).padStart(8),
    mx.toFixed(4).padStart(8), p99.toFixed(4).padStart(8),
    (mx / f.len).toFixed(3).padStart(9), (p99 / f.len).toFixed(3).padStart(8));
}

console.log('\nAXIAL SPAN — dot(aBoneLocal, derived axis), the quantity every "3 cm below the elbow"');
console.log('detail is arithmetic on. lo should be near 0 (the joint) and hi near the bone length.');
console.log('bone             len(m)      lo       hi   hi/len   radial p99');
for (const f of frames) {
  let lo = Infinity; let hi = -Infinity; const rad = [];
  let n = 0;
  for (let i = 0; i < pos.count; i++) {
    if (dom[i] !== f.i) continue;
    n++;
    const v = tmp.set(local[i * 3], local[i * 3 + 1], local[i * 3 + 2]);
    const d = v.dot(f.axis);
    lo = Math.min(lo, d); hi = Math.max(hi, d);
    rad.push(Math.sqrt(Math.max(0, v.lengthSq() - d * d)));
  }
  if (n < 20) continue;
  rad.sort((a, b) => a - b);
  console.log(f.name.padEnd(16), f.len.toFixed(4).padStart(6), lo.toFixed(4).padStart(8),
    hi.toFixed(4).padStart(8), (hi / f.len).toFixed(3).padStart(8),
    rad[Math.floor(rad.length * 0.99)].toFixed(4).padStart(12));
}

// CONTROL B, and its own control: the forearm test run against the WRONG bone's frame.
for (const armName of ['LeftForeArm', 'RightForeArm']) {
  const fi = idxOf.get(armName);
  const f = frames[fi];
  const wrong = idxOf.get(armName.replace('ForeArm', 'Arm'));   // the UPPER arm's frame
  let mx = 0; let mxWrong = 0; let n = 0;
  for (let i = 0; i < pos.count; i++) {
    if (dom[i] !== fi) continue;
    n++;
    mx = Math.max(mx, Math.hypot(local[i * 3], local[i * 3 + 1], local[i * 3 + 2]));
    const s = uniScale(sk.bones[wrong].matrixWorld);
    const v = tmp.fromBufferAttribute(pos, i).applyMatrix4(body.bindMatrix)
      .applyMatrix4(sk.boneInverses[wrong]).multiplyScalar(s);
    mxWrong = Math.max(mxWrong, v.length());
  }
  console.log(`\nCONTROL B  ${armName}: ${n} verts, bone length ${f.len.toFixed(4)} m, ` +
    `max|aBoneLocal| ${mx.toFixed(4)} m  ratio ${(mx / f.len).toFixed(3)}`);
  console.log(`           its control (same verts in the UPPER ARM's frame): max ${mxWrong.toFixed(4)} m ` +
    `ratio ${(mxWrong / f.len).toFixed(3)}  <- must exceed 1`);
}
