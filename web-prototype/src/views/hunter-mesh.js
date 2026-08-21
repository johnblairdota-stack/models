import * as THREE from 'three';
import { studio, labels } from './_studio.js';
import { createMeshHunterStage } from '../characters/mesh-hunter.js';
import { createMeshAvatar } from '../characters/mesh-avatar.js';
import { unit4hMaterials } from '../materials/surfaces/robot.js';
import { buildHunter } from '../characters/hunter.js';
import { fitCamera } from './hunter-stage.js';

/**
 * THE GENERATED HUNTER RAMP — the same four-up as `hunter.sheet`, on the generated bodies.
 *
 *     PLAYER (generated)  ->  STAGE 1  ->  STAGE 2  ->  STAGE 3
 *
 * `hunter.sheet` exists to answer "does the ramp escalate", and every ruling it has produced
 * describes the PROCEDURAL hunter next to the PROCEDURAL player. Since 2026-08-19 neither of
 * those is what the game renders: `?mesh=0` is the revert, so the player in `game.play` is
 * 15,864 triangles of generated robot. That makes the sheet's control a character the game no
 * longer contains, and it makes the one question this piece exists to answer unanswerable from
 * any existing capture — **does the generated hunter still read as the same chassis as the
 * generated player.** That is the whole horror of the design, and it is a comparison, so it
 * needs both bodies in one frame under one light rig.
 *
 * ⚠️ `?proc=1` PUTS THE PROCEDURAL STAGES IN THE SAME ROW, which is the A/B that decides whether
 * this pipeline is an improvement. Eight figures is a busy frame; it is a diagnostic, not the
 * default.
 *
 * Construction follows `hunter.sheet` deliberately — one scene, one light rig, one camera, one
 * ground plane, spacing measured from each figure's own box rather than typed — so a stage read
 * here and the same stage read there differ by the BODY and by nothing else.
 *
 * 🚨 **THE CAPTION IS NOT DECORATION HERE.** Until `tools/meshy-hunter-batch.mjs` has run, the
 * stage bodies do not exist and `mesh-hunter.js` stands the PLAYER'S body in for them. A viewer
 * who does not know that is looking at three copies of the player and grading the hunter. So the
 * provenance of every figure is drawn in the live view and printed to the console always.
 * `?label=0` removes it for a measurement crop — `measure.mjs` estimates the background per row
 * from the outer margins and a crop that catches one line of caption moves the detected crown.
 */
export default async function view(args = {}) {
  const FOV = 26;
  const params = args.params;

  const engine = await studio({
    cameraPos: [0, 2.0, 9.0],
    target: [0, 1.6, 0],
    fov: FOV,
    bg: 0xeeeeee,
    envIntensity: 1.0,
    shadowExtent: 7.5,
  });

  const mats = unit4hMaterials({});
  const specimens = [];
  const provenance = [];

  /*
   * THE CONTROL IS THE GAME'S OWN PLAYER, built through `createMeshAvatar` rather than by
   * loading the GLB here. Every other route drifts: this view would be dressing the body with
   * its own choice of materials and its own idea of the kit, and the thing being controlled for
   * is precisely "does the hunter look like what the game renders".
   */
  const avatar = await createMeshAvatar({ height: 1.7, materials: mats });
  specimens.push(avatar.root);
  provenance.push(`player ${avatar.sourceFile}`);
  engine.onUpdate((dt) => avatar.update(dt, { speed: 0, runAt: 2.6 }));

  const stages = [];
  for (const stage of [1, 2, 3]) {
    const h = await createMeshHunterStage({ stage });
    stages.push(h);
    specimens.push(h.root);
    provenance.push(`s${stage} ${h.sourceFile.split('/').pop()}${h.standIn ? ' STAND-IN' : ''}` +
      ` ${h.tris}t${h.hasRider ? ' +rider' : ''}`);
    // Standing still and listening — `idle` is `Alert`, which is the pose a hunter holds when it
    // has not seen you yet, and the one the sheet should be judged in.
    engine.onUpdate((dt) => h.update(dt, { speed: 0, runAt: 2.6 }));
  }

  // The procedural stages beside them, for the A/B that decides whether this is an improvement.
  if (params?.get?.('proc') === '1') {
    for (const stage of [1, 2, 3]) {
      const p = buildHunter({ stage });
      specimens.push(p.root);
      provenance.push(`s${stage} procedural`);
    }
  }

  /*
   * Placed left to right against MEASURED widths, as `hunter.sheet` does and for its reason: a
   * stage-3 figure carrying a rider is a different width from a stage-1, and a fixed pitch
   * either overlaps the wide end or strands the narrow one.
   *
   * ⚠️ MEASURE AFTER ONE MIXER STEP. A clip-driven body's bind pose is a T-POSE — arms straight
   * out, nearly a metre wider than the character ever renders — so a box taken before the first
   * `update` spaces the row for a figure that does not exist and leaves visible holes between
   * every pair. The step is 1/60 rather than 0: `Alert` at t=0 is still the first keyframe.
   */
  for (const h of stages) h.update(1 / 60, { speed: 0, runAt: 2.6 });
  avatar.update(1 / 60, { speed: 0, runAt: 2.6 });

  let cursor = 0;
  const GAP = 0.34;
  const boxes = new Map();
  for (const root of specimens) {
    engine.scene.add(root);
    const box = posedBox(root);
    root.position.x += cursor - box.min.x;
    cursor += (box.max.x - box.min.x) + GAP;
  }
  const shift = (cursor - GAP) * 0.5;
  for (const root of specimens) root.position.x -= shift;
  for (const root of specimens) boxes.set(root, posedBox(root));

  /*
   * `hunter.sheet` runs this solve at 0.86–0.94 because its row is wide and shallow and the
   * corner-sum double-counts depth. This row is FOUR figures, not eight, and the stage-3 one
   * carries a rider that sticks up and out past the body box the solve is used to — at 0.94 its
   * head was clipped by the right edge of the frame. 1.02 keeps margin on both sides, and
   * "nothing is cropped" outranks "nothing is wasted" (BUILD_GUIDE §4b).
   */
  fitCamera(engine, specimens, FOV, 20 * Math.PI / 180, 0.10, 1.08);

  /*
   * PUBLISHED FOR THE PROBE, and it is not a convenience.
   *
   * `harness/meshhunter-probe.mjs` grades the grime ramp as each figure's mean luminance against
   * the player's, which means it has to know which pixels belong to which figure. Segmenting the
   * frame blind — column runs with an empty gutter between them — is what `measure.mjs` does,
   * and its own header records the failure: at this row's spacing and yaw two figures MERGE, the
   * tool reports three where there are four, and it prints a full plausible table for the wrong
   * pairing. The first run of the probe hit exactly that.
   *
   * The scene knows the answer exactly. Handing over the roots lets the probe project each box
   * and measure inside it, so the measurement cannot be wrong about whose pixels it has.
   */
  if (typeof window !== 'undefined' && window.__rrr) {
    window.__rrr.meshHunter = {
      figures: specimens.map((root, i) => ({
        label: provenance[i] ?? `figure ${i}`,
        root,
        box: boxes.get(root),
        /*
         * ⚠️ THE RIDER IS EXCLUDED FROM THE GRIME MEASUREMENT, and it has to be.
         *
         * The ramp is graded on how filthy the HOST is, and stage 3's host is the darkest body
         * in the row — but it is also the only one carrying a near-clean stolen torso, which is
         * a third of the bright pixels in its band. Measured whole-figure, stage 3 came back
         * BRIGHTER than stage 2 (x0.729 against x0.718) off a host that is genuinely darker.
         * That is the rider's brightness, correctly rendered, wrongly attributed.
         *
         * It stays in the PICTURE — it is the stage's hero read — and it comes out of the
         * NUMBER.
         */
        exclude: stages.find((h) => h.root === root)?.riderRoot ?? null,
      })),
      stages,
    };
  }

  for (const line of provenance) console.log(`[hunter.mesh] ${line}`);
  const pending = stages.flatMap((h) => h.pending.map((p) => `s${h.stage} pending — ${p}`));
  for (const line of pending) console.warn(`[hunter.mesh] ${line}`);

  const wantLabel = params?.get?.('label') ?? (engine.capture ? '0' : '1');
  if (wantLabel !== '0') {
    /*
     * ⚠️ `labels` CENTRES EACH LINE ON ITS POINT and does not wrap. A first pass put four long
     * provenance strings at x = 22% and every one of them ran off the left edge of the frame —
     * the lines were in the capture, and their first thirty characters were not. Centred at 50%
     * and kept short is what fits; the full strings go to the console, which has no width.
     */
    const lines = stages.some((h) => h.standIn)
      ? ['⚠ STAGE BODIES NOT GENERATED — the player body is standing in', ...provenance]
      : provenance;
    labels(lines.map((text, i) => ({
      text, x: 50, y: 4 + i * 3.2, font: '600 12px/1.2 ui-monospace,monospace',
    })));
  }

  engine.finalizeScene();
  engine.markReady();
  engine.start();
  return engine;
}

/**
 * THE BOX A CLIP-DRIVEN BODY ACTUALLY OCCUPIES.
 *
 * 🚨 `Box3.setFromObject` IS WRONG ON A SKINNED MESH AND IT FAILS QUIETLY. It expands by the
 * GEOMETRY's bounding box put through the mesh's world matrix, and a skinned geometry's bounds
 * are its BIND POSE — a T-pose, arms straight out, close to a metre wider than this character
 * ever renders. Nothing throws; you get a plausible box for a pose that is not on screen.
 *
 * That cost two rounds of this view. It spaced the row for T-posed figures, which looked merely
 * generous, and then it made `harness/meshhunter-probe.mjs` grade the ramp inside boxes that
 * overlapped so heavily that stage 1 was measured on 9,991 pixels of its own outer half against
 * the player's 44,319 of whole body. The ramp read FLAT, and the bodies were fine.
 *
 * The skeleton is where the pose actually is, so the box is expanded over the BONES' world
 * positions and then grown by 0.10 m for the shell hanging off them — measured against the
 * rendered silhouette rather than guessed, and generous by a centimetre or two, which is the
 * safe direction for a spacing decision. The floor is asserted rather than measured: every body
 * in this row is grounded by construction.
 */
function posedBox(root) {
  root.updateWorldMatrix(true, true);
  const box = new THREE.Box3();
  const p = new THREE.Vector3();
  let bones = 0;
  root.traverse((o) => {
    if (!o.isBone) return;
    box.expandByPoint(p.setFromMatrixPosition(o.matrixWorld));
    bones++;
  });
  if (!bones) return new THREE.Box3().setFromObject(root);
  box.expandByScalar(0.10);
  box.min.y = 0;
  return box;
}
