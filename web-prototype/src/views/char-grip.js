import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { studio, labels } from './_studio.js';
import { unit4hMaterials, brandReady } from '../materials/surfaces/robot.js';
import { fitCamera } from './hunter-stage.js';
import { buildSledgeProp } from '../game/sledge.js';
import {
  createMeshAvatar, mountInHand, haftDistance, gripDeg, measureGrip,
  GRIP_MOUNT, GRIP_SHIPPED, GRIP_ALONG_HAFT, GRIP_BASELINE, SWINGS,
} from '../characters/mesh-avatar.js';

/**
 * GRIP BENCH — five rolls of the sledgehammer in the RightHand fist, one frame.
 *
 * Product play (`mesh-avatar.mountProp`) hangs the hammer with `mountInHand` at
 * GRIP_MOUNT (roll/tilt/yaw + palm/reach/depth + alongHaft). This view calls that
 * SAME function, five times, with the shipped ROLL in the centre and two steps either
 * side; tilt/yaw and the metre offsets stay locked. A restale in product is a restale
 * here.
 *
 *   ?view=char.grip
 *   ?anim=Heavy_Hammer_Swing     clip to freeze (default)
 *   ?phase=0.85                  0..1 of the clip; default is that clip's SWINGS.contact
 *   ?names=0                     hide the degree labels
 *
 * `window.__grip` is the paste-ready readout. The pickup baselines (off the wrist,
 * up the shaft, shaft angle) are measured from the SCENE so they cannot drift from
 * what expedition play prints. `harness/_grip_shot.mjs` asserts them.
 *
 * The five deltas are a roll A/B around John's lock, not a substitute for it. 2.37 is
 * the retired single-roll primitive and is NOT on this row.
 */

const H = 1.7;
const DELTAS = [-0.50, -0.25, 0, 0.25, 0.50];
const GAP = 1.35;

function paramNum(params, name, fallback) {
  const v = params?.get?.(name);
  const n = v === null || v === undefined ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clipOf(source, name) {
  const direct = source.actions?.[name]?.getClip?.();
  if (direct) return direct;
  for (const a of Object.values(source.actions || {})) {
    const c = a?.getClip?.();
    if (c?.name === name) return c;
  }
  return null;
}

function bonesOf(root) {
  const bones = {};
  root.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  return bones;
}

function worldPos(obj) {
  obj.updateWorldMatrix(true, false);
  return new THREE.Vector3().setFromMatrixPosition(obj.matrixWorld);
}

function round3(n) {
  return n == null ? null : +n.toFixed(4);
}

export default async function view(args = {}) {
  const params = args.params;
  const anim = params?.get?.('anim') || 'Heavy_Hammer_Swing';
  const swing = SWINGS.find((w) => w.clip === anim);
  const phase = paramNum(params, 'phase', swing?.contact ?? 0);
  const showNames = (params?.get?.('names') ?? '1') !== '0';
  const mount = {
    roll: paramNum(params, 'grip', GRIP_MOUNT.roll),
    tilt: paramNum(params, 'tilt', GRIP_MOUNT.tilt),
    yaw: paramNum(params, 'yaw', GRIP_MOUNT.yaw),
    palm: paramNum(params, 'palm', GRIP_MOUNT.palm),
    reach: paramNum(params, 'reach', GRIP_MOUNT.reach),
    depth: paramNum(params, 'depth', GRIP_MOUNT.depth),
    alongHaft: paramNum(params, 'griplen', GRIP_MOUNT.alongHaft),
  };

  const engine = await studio({
    cameraPos: [0, H * 0.72, H * 4.6],
    target: [0, H * 0.55, 0],
    fov: 28,
    bg: 0xf2f2f2,
    envIntensity: 1.4,
    contrast: 1.0,
    lightContrast: 1.0,
  });

  const mats = unit4hMaterials();
  const source = await engine.work(createMeshAvatar({ height: H, materials: mats }));
  const clip = clipOf(source, anim);
  if (!clip) {
    throw new Error(`char.grip: no clip "${anim}". Actions: ${Object.keys(source.actions || {}).join(', ')}`);
  }
  const clipDur = clip.duration || 1;
  const time = THREE.MathUtils.clamp(phase, 0, 1) * clipDur;

  /*
   * Five clones, not five loads. The GLB is 9 MB; `createMeshAvatar` already paid for it.
   * Each clone gets its own mixer so scrubbing one station cannot advance another, and its
   * own sledge so five rolls are five props, not one prop reparented between frames.
   */
  const stations = [];
  const x0 = -((DELTAS.length - 1) * GAP) / 2;

  for (let i = 0; i < DELTAS.length; i++) {
    const roll = +(mount.roll + DELTAS[i]).toFixed(4);
    const rig = cloneSkinned(source.root);
    rig.position.x = x0 + i * GAP;
    engine.scene.add(rig);

    const mixer = new THREE.AnimationMixer(rig);
    const action = mixer.clipAction(clip);
    action.enabled = true;
    action.paused = true;
    action.time = time;
    action.play();
    mixer.update(0);

    const bones = bonesOf(rig);
    const hand = bones.RightHand;
    if (!hand) throw new Error('char.grip: clone has no RightHand');

    const prop = buildSledgeProp(H);
    const placed = mountInHand(prop.root, { bone: hand, height: H, ...mount, roll });
    if (!placed) throw new Error(`char.grip: mountInHand failed at roll ${roll}`);
    if (prop.root.parent?.name !== 'RightHand') {
      throw new Error(`char.grip: prop parent is "${prop.root.parent?.name}", not RightHand`);
    }

    const left = bones.LeftHand;
    const offHandM = left ? haftDistance(prop.root, worldPos(left)) : null;
    const driveM = haftDistance(prop.root, worldPos(hand));
    const pickup = measureGrip(prop.root, hand);

    stations.push({
      i,
      delta: DELTAS[i],
      roll,
      rollDeg: gripDeg(roll),
      tilt: mount.tilt,
      yaw: mount.yaw,
      palm: mount.palm,
      reach: mount.reach,
      depth: mount.depth,
      alongHaft: mount.alongHaft,
      shipped: Math.abs(DELTAS[i]) < 1e-9,
      parent: prop.root.parent.name,
      offHandM: offHandM == null ? null : +offHandM.toFixed(4),
      driveHandM: driveM == null ? null : +driveM.toFixed(4),
      offWristM: round3(pickup.offWristM),
      upShaftM: round3(pickup.upShaftM),
      shaftAngleDeg: pickup.shaftAngleDeg == null ? null : +pickup.shaftAngleDeg.toFixed(2),
      root: rig,
      prop: prop.root,
    });
  }

  source.root.visible = false;

  fitCamera(engine, stations.map((s) => s.root), 28, 0.42, 0.12, 1.28);

  if (showNames) {
    const step = 100 / (stations.length + 1);
    labels(stations.map((s, i) => ({
      text: s.shipped
        ? `SHIPPED  off ${ (s.offWristM * 100).toFixed(1) } cm  up ${ (s.upShaftM * 100).toFixed(1) } cm  ${s.shaftAngleDeg} deg`
        : `${s.roll} rad  ${s.rollDeg} deg`,
      x: step * (i + 1),
      y: 92,
      font: s.shipped
        ? '700 13px/1.2 ui-sans-serif,system-ui,sans-serif'
        : '600 12px/1.2 ui-sans-serif,system-ui,sans-serif',
    })));
  }

  const centre = stations.find((s) => s.shipped) ?? stations[2];
  window.__grip = {
    anim,
    phase,
    shipped: {
      ...GRIP_MOUNT,
      rollDeg: gripDeg(GRIP_SHIPPED),
      baseline: { ...GRIP_BASELINE },
    },
    live: {
      roll: centre.roll,
      rollDeg: centre.rollDeg,
      tilt: centre.tilt,
      yaw: centre.yaw,
      palm: centre.palm,
      reach: centre.reach,
      depth: centre.depth,
      alongHaft: centre.alongHaft,
      offHandM: centre.offHandM,
      driveHandM: centre.driveHandM,
      offWristM: centre.offWristM,
      upShaftM: centre.upShaftM,
      shaftAngleDeg: centre.shaftAngleDeg,
    },
    swingsPaste: SWINGS.map((w) =>
      `{ clip: '${w.clip}', grip: ${GRIP_SHIPPED}, contact: ${w.contact},  /* ${gripDeg(GRIP_SHIPPED)} deg */ }`).join('\n'),
    product: Object.fromEntries(SWINGS.map((w) => [w.clip, { grip: w.grip, contact: w.contact }])),
    stations: stations.map((s) => ({
      i: s.i, delta: s.delta, roll: s.roll, rollDeg: s.rollDeg,
      tilt: s.tilt, yaw: s.yaw, palm: s.palm, reach: s.reach, depth: s.depth,
      alongHaft: s.alongHaft, shipped: s.shipped, parent: s.parent,
      offHandM: s.offHandM, driveHandM: s.driveHandM,
      offWristM: s.offWristM, upShaftM: s.upShaftM, shaftAngleDeg: s.shaftAngleDeg,
    })),
  };
  console.log(`[char.grip] anim=${anim} phase=${phase} mount roll=${GRIP_MOUNT.roll} `
    + `tilt=${GRIP_MOUNT.tilt} yaw=${GRIP_MOUNT.yaw} griplen=${GRIP_ALONG_HAFT} `
    + `offWrist=${centre.offWristM} m  upShaft=${centre.upShaftM} m  `
    + `shaftAngle=${centre.shaftAngleDeg} deg`);
  console.log('[char.grip] paste\n' + window.__grip.swingsPaste);

  await brandReady();
  engine.markReady();
  engine.start();
  return engine;
}
