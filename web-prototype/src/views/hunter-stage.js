import * as THREE from 'three';
import { studio, labels } from './_studio.js';
import { buildHunter, HUNTER_STAGES } from '../characters/hunter.js';
import { buildUnit4H } from '../characters/unit4h.js';
import { brandReady } from '../materials/surfaces/robot.js';

/**
 * One hunter stage, framed like the corresponding row of Dev Art 1785300149293, with a
 * player robot beside it for scale — the relative size IS the design, and a hunter shot
 * without a player next to it tells you nothing.
 *
 * FRAMING IS A JUDGEMENT TOOL, not decoration. The previous camera sat back far enough
 * that the hunter filled under half the frame height, and a critic asked to rule on soot
 * mottling, joint grime and a torn shoulder socket was being shown a 300-pixel figure. The
 * camera now FITS the subject: measure the assembled group and pull back exactly far
 * enough, so stage 1 and stage 3 both fill the frame despite a 2x difference in height.
 *
 * The yaw is a front three-quarter rather than a flat front, because the stage-2 and
 * stage-3 reads are a forward hunch and a torn socket on the character's right — neither
 * of which exists in a straight-on projection.
 *
 * ⚠️ THAT YAW IS RIGHT FOR JUDGING AND WRONG FOR MEASURING, AND FOR THIS PIECE'S WHOLE
 * HISTORY IT HAS BEEN BOTH. `hunter.2`'s standing hate is a silhouette IoU against the
 * STAGE 2 row of Dev Art 1785300149293 — a DEAD-ON FRONT view. Comparing a 26 degree
 * three-quarter silhouette to a 0 degree one has an error floor that no amount of
 * modelling can close, which is the most likely reason the same comparison has been
 * reported at 66.3%, 74.4%, 75.2% and 76.7% by four different measurements. `?yaw=0`
 * renders the MEASUREMENT frame; the default is unchanged, so every existing capture,
 * verdict and crop still describes the same picture it always did.
 */
export default async function view(args = {}) {
  const stage = args.stage ?? 1;
  // Degrees, because every caller is a URL — and a URL reaches a view through `args.params`,
  // NOT spread into `args` (main.js). Reading `args.yaw` here silently fell back to 26 and
  // the capture came back byte-identical to the default, which looks exactly like "the yaw
  // does not matter" instead of like "the flag is not wired". Caught by an explicit control.
  const yawRaw = args.params?.get?.('yaw');
  const yawDeg = yawRaw === undefined || yawRaw === null || yawRaw === '' ? 26 : Number(yawRaw);
  const def = HUNTER_STAGES[stage];
  const H = 1.7 * def.scale;
  const FOV = 30;

  const engine = await studio({
    cameraPos: [0, H * 0.5, H * 2.2],
    target: [0, H * 0.45, 0],
    fov: FOV,
    bg: 0xeeeeee,
    envIntensity: 1.0,
    shadowExtent: H * 1.4,
  });

  const hunter = buildHunter({ stage });
  engine.scene.add(hunter.root);

  // the player, for scale
  const player = buildUnit4H({ height: 1.7 });
  player.setPose({
    shoulderL: [0, 0, 0.13], shoulderR: [0, 0, -0.13],
    elbowL: [0.10, 0, 0.05], elbowR: [0.10, 0, -0.05],
  });
  engine.scene.add(player.root);

  // Stand the player clear of the hunter's own footprint — at stage 3 that footprint
  // includes two arms planted forward on the floor.
  hunter.root.updateWorldMatrix(true, true);
  const hb = new THREE.Box3().setFromObject(hunter.root);
  player.root.position.set(hb.min.x - 0.22 - 0.5 * 1.7 * 0.245, 0, H * 0.10);

  // A little more rise as the thing gets lower and wider, so the stage-3 footprint reads.
  fitCamera(engine, [hunter.root, player.root], FOV, yawDeg * Math.PI / 180, 0.07 + stage * 0.025, 1.02);

  /*
   * ⚠️ `?label=0` EXISTS BECAUSE THE CAPTION IS DIRECTLY ABOVE THE CROWN, with about 7px of
   * clearance at stage 2. `measure.mjs` estimates the background PER ROW from the outer
   * margins, so a crop that catches one row of caption text moves the detected crown and
   * every H-normalised number in the table shifts with it — silently, and in a way that
   * still prints a full plausible table. Two measurements in this piece's history were
   * thrown away to exactly that. A measurement crop wants no text in frame at all.
   */
  if ((args.params?.get?.('label') ?? '1') !== '0') labels([
    { text: `HUNTER — STAGE ${stage}`, x: 50, y: 6, font: '600 16px/1.2 ui-sans-serif, system-ui, sans-serif' },
    { text: `built from player-sized parts  ·  ${def.arms} arms  ·  ${def.heads} head${def.heads > 1 ? 's' : ''}`,
      x: 50, y: 11, font: '500 11px/1.2 ui-monospace, Menlo, monospace', color: '#6a7178' },
  ]);

  engine.hunter = hunter;
  engine.finalizeScene();
  /*
   * ⚠️ NOW LOAD-BEARING, AND IT WAS NOT BEFORE. `brandDecal` PRINTS from `public/brand/` and
   * `TextureLoader().load()` is async: an undecoded map samples opaque black, and the decal's
   * luminance keying turns black into FULL INK, so the unloaded state is the maximally-inked
   * one — a solid navy rectangle that reads as a design choice rather than a failure (HANDOFF,
   * "a capture-integrity bug that could have corrupted any verdict"). This view got away with
   * it only because `scaleMeshes`'s `keepSeparate` bug meant stages 2 and 3 showed no mark at
   * all. That bug is fixed this round and all three stages now carry the wordmark, so every
   * capture of this view is exposed to the race until this await is here.
   */
  await brandReady();
  engine.markReady();
  engine.start();
  return engine;
}

/** Pull the camera back exactly far enough to hold `objs`, at a given yaw and rise. */
export function fitCamera(engine, objs, fovDeg, yaw, rise, margin = 1.12) {
  const { camera } = engine;
  const box = new THREE.Box3();
  for (const o of objs) { o.updateWorldMatrix(true, true); box.expandByObject(o); }
  if (box.isEmpty()) return;

  const centre = box.getCenter(new THREE.Vector3());
  const vFov = (fovDeg * Math.PI) / 180;
  const aspect = camera.aspect || 16 / 9;
  const tv = Math.tan(vFov / 2);
  const th = tv * aspect;

  // EXACT FIT, from the eight box corners projected into the camera basis.
  //
  // Fitting on the axis-aligned box extents only works looking down an axis: at a 26 degree
  // yaw the subject's depth folds into screen width, and whatever is nearest the camera —
  // a stage-3 hunter's forward-planted arms — sits much closer than the centre distance and
  // blows past the frame edge. Fitting the bounding SPHERE fixes the cropping but is wildly
  // conservative once a second, distant object (the player, for scale) is in the box, and
  // leaves the subject a third of the frame.
  //
  // For a corner at offset v from the centre, the camera must sit at least
  //   v·dir + |v·up| / tan(vFov/2)      (and the same in the horizontal)
  // back along the view axis for that corner to land inside the frustum. The largest of
  // those over all eight corners is the tightest distance that cannot crop.
  const dir = new THREE.Vector3(Math.sin(yaw), rise, Math.cos(yaw)).normalize();
  const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, dir).normalize();

  let dist = 0;
  const v = new THREE.Vector3();
  for (let i = 0; i < 8; i++) {
    v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z)
      .sub(centre);
    const along = v.dot(dir);
    dist = Math.max(dist, along + Math.abs(v.dot(up)) / tv, along + Math.abs(v.dot(right)) / th);
  }
  dist *= margin;
  camera.position.copy(centre).addScaledVector(dir, dist);
  camera.lookAt(centre);
  engine.target?.copy(centre);
  if (engine.controls) { engine.controls.target.copy(centre); engine.controls.update(); }

  // The cyc is sized for a 4 m room; a fitted camera on a 4.4 m hunter ends up close
  // enough to its curve that the fold shows in frame as a grey blob. Push it back behind
  // the new camera distance so the backdrop stays the seamless white of the art sheets.
  if (engine.cyc) {
    engine.cyc.position.z = -Math.max(3.2, dist * 1.05);
    engine.cyc.scale.setScalar(Math.max(1, dist / 3.2));
  }
}
