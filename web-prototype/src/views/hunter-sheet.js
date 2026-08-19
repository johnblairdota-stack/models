import * as THREE from 'three';
import { studio } from './_studio.js';
import { buildHunter } from '../characters/hunter.js';
import { buildUnit4H } from '../characters/unit4h.js';
import { brandReady } from '../materials/surfaces/robot.js';
import { fitCamera } from './hunter-stage.js';

/**
 * THE PROGRESSION SHEET — the whole ramp in one frame, on one ground line, at one scale.
 *
 * This piece was the last `NOT_BUILT` in the hunter group, and it was admitted rather than
 * stubbed for a long time on the correct principle that a stub with a score is worse than an
 * honest zero. What it has to be, though, is not a re-rendering of `Dev Art/1785300149293.png`.
 * That sheet is a three-row TURNAROUND — four camera angles of three states, eleven figures —
 * and the four hunter views that already exist are exactly the per-state pages a turnaround
 * decomposes into. Rebuilding them side by side would cost roughly 2,000 draw calls to say
 * nothing that is not already on the board.
 *
 * What no existing view can say is whether the RAMP works: whether each step is visibly past
 * the last, in one image, without the reader holding two captures in their head. That is what
 * this group has actually been failing on for its whole history — "all three read as the same
 * upright biped", `hunter.1`'s midpoint ruling, the grime ordering that measured FLAT between
 * stages 2 and 3 — and each of those was found or missed depending on whether anyone could see
 * two stages at once. So this is a four-up comparison:
 *
 *     BASELINE (the clean player)  ->  STAGE 1  ->  STAGE 2  ->  STAGE 3
 *
 * following `wall.sheet`'s construction, which is this project's precedent for a sheet: every
 * specimen in ONE scene, one light rig, one camera, one ground plane, so no part of the
 * comparison is an artefact of how the pictures were taken.
 *
 * THREE THINGS THAT MAKE THE COMPARISON FAIR, each easy to get wrong:
 *
 *  1. ONE CAMERA, and deliberately NOT the flat front elevation the art sheet uses. A forward
 *     lean is displaced along the view axis in a front elevation, so a straight-on sheet shows
 *     the posture ramp — the ramp's most important channel, and the one `critic-hunter-2` ruled
 *     on — at its very weakest. 20 degrees of yaw is enough to read a stoop and close enough to
 *     the art's front row to hold against it. `hunter-stage.js` shoots 26; this is inside that
 *     family on purpose, so a stage read here and the same stage on its own page agree.
 *  2. RELATIVE HEIGHT IS THE DESIGN, so nothing is normalised. All four stand on y = 0 under
 *     one perspective camera, which means x1.35 / x1.90 / x2.60 arrive as the picture's own
 *     arithmetic instead of as a caption.
 *  3. NO LABELS. `wall.sheet`: "a caption on a comparison sheet destroys the thing the sheet is
 *     for". `rrr-critique`'s identification gate needs a frame that does not answer its own
 *     question, and every other hunter view is captioned already.
 *
 * SPACING IS MEASURED, NOT TYPED. A stage-3 hunter with its arms fanned is over twice as wide
 * as a stage-1, so a fixed pitch either overlaps the big end or strands the small one. Each
 * figure is measured after it is posed and set against the running edge of the one before it.
 */
export default async function view(args = {}) {
  const FOV = 26;

  const engine = await studio({
    cameraPos: [0, 2.0, 9.0],
    target: [0, 1.6, 0],
    fov: FOV,
    bg: 0xeeeeee,
    envIntensity: 1.0,
    shadowExtent: 7.5,
  });

  const specimens = [];

  // BASELINE: the same clean unit4h that stands beside every other hunter view, in the same
  // relaxed pose, so this row's control and those views' control are the same control.
  const player = buildUnit4H({ height: 1.7 });
  player.setPose({
    shoulderL: [0, 0, 0.13], shoulderR: [0, 0, -0.13],
    elbowL: [0.10, 0, 0.05], elbowR: [0.10, 0, -0.05],
  });
  ground(player.root, [player.joints.ankleL, player.joints.ankleR]);
  specimens.push(player.root);

  for (const stage of [1, 2, 3]) specimens.push(buildHunter({ stage }).root);

  /*
   * Place left to right against measured widths. `Box3.setFromObject` after
   * `updateWorldMatrix` is the only honest source for a stage-3 hunter's footprint — it is set
   * by four grafted arms whose reach depends on `armScale`, the MIN_TIP clamp and the roll of
   * the day, none of which a constant in this file could track.
   */
  let cursor = 0;
  const GAP = 0.34;
  for (const root of specimens) {
    engine.scene.add(root);
    root.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(root);
    root.position.x += cursor - box.min.x;
    cursor += (box.max.x - box.min.x) + GAP;
  }
  // Recentre the row on the origin so the camera solve is symmetric.
  const shift = (cursor - GAP) * 0.5;
  for (const root of specimens) root.position.x -= shift;

  /*
   * ⚠️ MARGIN BELOW 1, AND IT IS NOT A FUDGE. `fitCamera` solves the distance from the eight
   * bounding-box CORNERS, and for each it adds `v·dir` — the corner's depth along the view
   * axis — to the lateral requirement. That is exactly right for a single subject, where the
   * nearest corner really does need the extra room. On a wide, shallow ROW it double-counts:
   * the corner that sets the lateral extent is at one end of the row, and the corner that is
   * nearest the camera is a different one, so the sum of the two is a distance no single
   * corner needs. Measured on the capture at margin 1.02 the row filled 79% of frame width
   * with 45% of the height empty. 0.86 took it to 90% — and put the stage-3 hunter's outermost
   * hand at x = 1918 of 1920, i.e. ON the edge. The row does not centre the way the solve
   * assumes: at 20 degrees of yaw the +x end of the row is also the end NEAREST the camera, so
   * it is magnified relative to the box centre and drifts right. 0.94 fills ~85% of the width
   * with real margin on both sides, and "nothing is cropped" outranks "nothing is wasted".
   */
  fitCamera(engine, specimens, FOV, 20 * Math.PI / 180, 0.10, 0.94);

  engine.finalizeScene();
  // All four carry the 4Humanity mark, and an undecoded decal map samples as FULL INK — see
  // the note in hunter-stage.js. Without this await the sheet can photograph four navy plates.
  await brandReady();
  engine.markReady();
  engine.start();
  return engine;
}

/** Drop `obj` so the lowest point of `parts` sits on y = 0. Nothing floats. */
function ground(obj, parts) {
  obj.updateWorldMatrix(true, true);
  const box = new THREE.Box3();
  for (const p of parts) box.expandByObject(p);
  if (!box.isEmpty()) obj.position.y -= box.min.y;
  obj.updateWorldMatrix(true, true);
}
