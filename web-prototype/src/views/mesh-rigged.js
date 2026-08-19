import * as THREE from 'three';
import { studio, labels } from './_studio.js';
import { buildUnit4H } from '../characters/unit4h.js';
import { unit4hMaterials, brandReady } from '../materials/surfaces/robot.js';
import { attachMeshShell, calibrateJoints, pushProud } from '../characters/mesh-shell.js';
import { fitCamera } from './hunter-stage.js';

/**
 * DOES THE GENERATED SHELL ACTUALLY POSE? — the test that decides whether the hybrid works.
 *
 * A static mesh standing next to a rig proves nothing; `mesh.compare` already showed that and it
 * looked fine while being, as far as this question goes, a statue. The hybrid only earns its
 * keep if the generated geometry MOVES WITH THE SKELETON. So both figures here are given the
 * SAME rig and the SAME non-trivial pose, and the only difference is which shell is hanging off
 * the joints.
 *
 * LEFT: procedural shell, posed. RIGHT: conditioned mesh shell, posed. If the right one stands
 * in bind pose while the left one moves, the mount is broken and this frame says so instantly.
 *
 * ⚠️ THE POSE IS APPLIED AFTER THE MOUNT, ON PURPOSE. The parts were cut against bind-pose joint
 * positions; attaching to an already-posed skeleton would bake that pose in permanently.
 */
/*
 * A-POSE. The earlier dramatic pose proved the shell FOLLOWS the skeleton, which was the
 * question then; it is the wrong frame for judging the asset, because a limb thrown across the
 * body hides the silhouette that this project judges characters on. A-pose is also what the
 * generator was asked for, so render and reference are directly comparable.
 * Arms roll out ~24 degrees from vertical; everything else is rest.
 */
const POSE = {
  shoulderL: [0, 0, 0.42], shoulderR: [0, 0, -0.42],
  elbowL: [0.05, 0, 0], elbowR: [0.05, 0, 0],
};

export default async function view(args = {}) {
  const H = 1.7;
  const engine = await studio({
    cameraPos: [0, H * 0.55, H * 2.6],
    target: [0, H * 0.5, 0],
    fov: 32,
    bg: 0xeeeeee,
    envIntensity: 1.0,
    shadowExtent: H * 1.6,
  });

  const mats = unit4hMaterials({});
  const url = args.params?.get?.('mesh') ?? '/models/rrr_char_player_v3.glb';
  const posed = (args.params?.get?.('pose') ?? '1') !== '0';

  // --- LEFT: procedural shell on the rig
  const a = buildUnit4H({ height: H });
  a.root.position.set(-0.6, 0, 0);
  engine.scene.add(a.root);

  // --- RIGHT: generated shell on an IDENTICAL rig
  const b = buildUnit4H({ height: H });
  engine.scene.add(b.root);
  // ⚠️ MOUNT AT THE ORIGIN, MOVE AFTERWARDS. attach() preserves world transform, so mounting on
  // an already-placed rig strands the shell at world zero. See the note in mesh-shell.js.
  b.root.position.set(0, 0, 0);
  // ⚠️ CALIBRATE BEFORE MOUNTING. Moves the hip/knee/ankle pivots onto the mesh's real limb
  // axes (the thigh splays ~4 degrees; the rig's bone is vertical). attach() preserves world
  // transform, so doing this first moves the PIVOT without moving the shell.
  const calibrated = calibrateJoints(b);
  b.root.updateWorldMatrix(true, true);            // bind pose must be current before mounting
  // Keep the rig's chrome mechanism visible so rotating seams stay covered — see mesh-shell.js.
  const keepMaterials = ['chrome', 'gap', 'sole', 'face', 'mint', 'decal'].map((k) => b.materials?.[k]).filter(Boolean);
  const res = await attachMeshShell(b, url, { material: mats.shell, hideOriginal: true, keepMaterials });
  // The generated chest is thicker than the procedural one, so the rig-owned brand decal ends
  // up inside it. Measure the shell surface and bring the decal forward — see pushProud().
  const shellParts = res.mounted.map((x) => x.obj);
  let decalMesh = null;
  b.root.traverse((o) => {
    if (!o.isMesh) return;
    const mm = Array.isArray(o.material) ? o.material[0] : o.material;
    if (mm && mm === b.materials?.decal) decalMesh = o;
  });
  const pushed = pushProud(b, shellParts, decalMesh);
  console.log(`[mesh-rigged] decal pushed proud by ${pushed.toFixed(4)} m`);
  b.root.position.set(0.6, 0, 0);

  // Pose BOTH, identically, only now.
  if (posed) {
    a.setPose(POSE);
    b.setPose(POSE);
  }

  a.root.updateWorldMatrix(true, true);
  b.root.updateWorldMatrix(true, true);

  /*
   * A mounted-but-not-following shell is the failure this view exists to catch, and it is not
   * always obvious by eye at one camera. So measure it: with a pose applied, the two rigs'
   * wrists must be in the same place, and the generated shell's bounding box must have MOVED
   * from where it sat in bind pose. Reported, not asserted — the picture is the verdict.
   */
  const wristA = new THREE.Vector3(); a.joints.wristL.getWorldPosition(wristA);
  const wristB = new THREE.Vector3(); b.joints.wristL.getWorldPosition(wristB);
  const box = new THREE.Box3().setFromObject(b.root);
  console.log();
  console.log(`[mesh-rigged] wristL  procedural ${wristA.toArray().map((v) => v.toFixed(3))}`);
  console.log(`[mesh-rigged] wristL  meshshell  ${wristB.toArray().map((v) => v.toFixed(3))}`);
  console.log(`[mesh-rigged] mesh bbox y ${box.min.y.toFixed(3)}..${box.max.y.toFixed(3)}`);

  fitCamera(engine, [a.root, b.root], 32, 20 * Math.PI / 180, 0.10, 1.06);

  if ((args.params?.get?.('label') ?? '1') !== '0') {
    labels([
      { text: posed ? 'SAME RIG, SAME POSE — procedural shell vs generated shell'
                    : 'SAME RIG, BIND POSE — procedural shell vs generated shell',
        x: 50, y: 6, font: '600 15px/1.2 ui-sans-serif, system-ui, sans-serif' },
      { text: `${res.mounted.length} parts mounted${res.orphans.length ? ` · ${res.orphans.length} ORPHANED` : ''}`,
        x: 50, y: 10.5, font: '500 11px/1.2 ui-monospace, Menlo, monospace', color: '#6a7178' },
    ]);
  }

  engine.finalizeScene();
  await brandReady();
  engine.markReady();
  engine.start();
  return engine;
}
