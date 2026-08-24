import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { studio, labels } from './_studio.js';
import { unit4hMaterials, brandReady } from '../materials/surfaces/robot.js';
import { fitCamera } from './hunter-stage.js';
import { buildSledgeProp } from '../game/sledge.js';
import {
  createMeshAvatar, mountInHand, haftDistance, gripDeg,
  GRIP_SHIPPED, GRIP_ALONG_HAFT, SWINGS,
} from '../characters/mesh-avatar.js';

/**
 * GRIP BENCH — five rolls of the sledgehammer in the RightHand fist, one frame.
 *
 * Product play (`mesh-avatar.mountProp`) hangs the hammer with `mountInHand` at
 * `GRIP_SHIPPED` / `GRIP_ALONG_HAFT`. This view calls that SAME function, five times, with
 * the shipped roll in the centre and two steps either side. A restale in product is a
 * restale here; they cannot diverge without this sheet showing it.
 *
 *   ?view=char.grip
 *   ?anim=Heavy_Hammer_Swing     clip to freeze (default)
 *   ?phase=0.85                  0..1 of the clip; default is that clip's SWINGS.contact
 *   ?names=0                     hide the degree labels
 *
 * `window.__grip` is the paste-ready readout: roll in degrees for SWINGS, plus each
 * station's off-hand distance to the haft. `harness/_grip_shot.mjs` reads it.
 *
 * The five deltas are the documented +/-0.25 tolerance plus one step past it, so the sheet
 * shows both "still a hammer" and "starting to read as a stick" without inventing a sixth
 * mount. The old idle-eyeballed 0.8 is 1.57 rad (a quarter turn) away and is NOT on this
 * row — it is the defect this lock replaced.
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

export default async function view(args = {}) {
  const params = args.params;
  const anim = params?.get?.('anim') || 'Heavy_Hammer_Swing';
  const swing = SWINGS.find((w) => w.clip === anim);
  const phase = paramNum(params, 'phase', swing?.contact ?? 0);
  const showNames = (params?.get?.('names') ?? '1') !== '0';
  const alongHaft = paramNum(params, 'griplen', GRIP_ALONG_HAFT);
  const shippedRoll = paramNum(params, 'grip', GRIP_SHIPPED);

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
    const roll = +(shippedRoll + DELTAS[i]).toFixed(4);
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
    const placed = mountInHand(prop.root, { bone: hand, height: H, roll, alongHaft });
    if (!placed) throw new Error(`char.grip: mountInHand failed at roll ${roll}`);
    if (prop.root.parent?.name !== 'RightHand') {
      throw new Error(`char.grip: prop parent is "${prop.root.parent?.name}", not RightHand`);
    }

    const left = bones.LeftHand;
    const offHandM = left ? haftDistance(prop.root, worldPos(left)) : null;
    const driveM = haftDistance(prop.root, worldPos(hand));

    stations.push({
      i,
      delta: DELTAS[i],
      roll,
      rollDeg: gripDeg(roll),
      alongHaft,
      shipped: Math.abs(DELTAS[i]) < 1e-9,
      parent: prop.root.parent.name,
      offHandM: offHandM == null ? null : +offHandM.toFixed(4),
      driveHandM: driveM == null ? null : +driveM.toFixed(4),
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
        ? `SHIPPED  ${s.roll} rad  ${s.rollDeg} deg`
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
      roll: GRIP_SHIPPED,
      rollDeg: gripDeg(GRIP_SHIPPED),
      alongHaft: GRIP_ALONG_HAFT,
    },
    live: {
      roll: centre.roll,
      rollDeg: centre.rollDeg,
      alongHaft,
      offHandM: centre.offHandM,
      driveHandM: centre.driveHandM,
    },
    swingsPaste: SWINGS.map((w) =>
      `{ clip: '${w.clip}', grip: ${GRIP_SHIPPED}, contact: ${w.contact},  /* ${gripDeg(GRIP_SHIPPED)} deg */ }`).join('\n'),
    product: Object.fromEntries(SWINGS.map((w) => [w.clip, { grip: w.grip, contact: w.contact }])),
    stations: stations.map((s) => ({
      i: s.i, delta: s.delta, roll: s.roll, rollDeg: s.rollDeg, alongHaft: s.alongHaft,
      shipped: s.shipped, parent: s.parent, offHandM: s.offHandM, driveHandM: s.driveHandM,
    })),
  };
  console.log(`[char.grip] anim=${anim} phase=${phase} shipped=${GRIP_SHIPPED} `
    + `(${gripDeg(GRIP_SHIPPED)} deg) griplen=${GRIP_ALONG_HAFT} `
    + `offHand=${centre.offHandM} m  driveHand=${centre.driveHandM} m`);
  console.log('[char.grip] paste\n' + window.__grip.swingsPaste);

  await brandReady();
  engine.markReady();
  engine.start();
  return engine;
}
