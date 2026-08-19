import * as THREE from 'three';
import { studio, labels } from './_studio.js';
import { buildHunter } from '../characters/hunter.js';
import { buildUnit4H } from '../characters/unit4h.js';
import { brandReady } from '../materials/surfaces/robot.js';
import { fitCamera } from './hunter-stage.js';

/**
 * ABSORB — the game's core idea in one image.
 *
 * The bar on the board is not an art sheet, it is a sentence: "must read as the hunter taking
 * the part onto itself." So this view is composed around a single causal chain that has to be
 * legible without a caption:
 *
 *     a player robot, one arm gone   ->   that arm, in the air, ball-end first
 *                                    ->   the empty port on the hunter's shoulder
 *
 * Three things carry it, and each is a deliberate choice rather than dressing:
 *
 * 1. THE ARM IS AIMED AT THE PORT, NOT NEAR IT. Its position and orientation are solved from
 *    the port's own world transform (`tornSocket`, built by `hunter.js`) rather than typed in,
 *    so the two cannot drift apart when the socket moves — and this round moved it four times.
 *    It sits ON the port axis, shoulder-ball leading, tilted off-axis just enough to read as
 *    travelling rather than as a rod bolted on.
 *
 * 2. THE PORT IS LIT FROM INSIDE. A small red point light at the mouth throws the hunter's own
 *    colour onto the underside of the incoming arm and up its own bore wall. That is the one
 *    cue that says the hole is DOING something rather than just being empty, and it is the same
 *    light `HunterAI._setFlare` already fires on a real absorb, so the still is a frame of the
 *    mechanic and not an illustration of it.
 *
 * 3. THE DONOR IS IN FRAME AND VISIBLY MAIMED. Without it, an arm in the air beside a monster
 *    is ambiguous — it could be an attack, a throw, or debris. With a player robot recoiling
 *    with a bare shoulder, there is only one reading left. It doubles as the scale reference
 *    the other four hunter views use, so the composition stays a family member.
 *
 * STAGE 2 is the right stage for this. Stage 1 has no port; stage 3 is already finished growing
 * and its six arms crowd the frame. Stage 2 is the one that visibly still has room.
 *
 * GROUND, not cyc. `rrr-pipeline`: judge dark or specular subjects on a mid-grey ground, never
 * the white cyc. Stage 2 measures 0.74 of the clean player's luminance and the port interior is
 * near-black — on the art-sheet white the whole subject reads as a silhouette and the one thing
 * that has to be legible, the value gradient inside the bore, flattens to a dot.
 */
export default async function view(args = {}) {
  const STAGE = 2;
  const FOV = 34;

  const engine = await studio({
    fov: FOV,
    bg: 0xa2a8ae,
    envIntensity: 1.0,
    shadowExtent: 4.2,
  });

  const hunter = buildHunter({ stage: STAGE });
  engine.scene.add(hunter.root);
  const H = hunter.height;

  // ---- the donor: a player robot that has just lost its right arm.
  const player = buildUnit4H({ height: 1.7 });
  const lostArm = player.detach('armR');
  /*
   * RECOIL, not a T-pose. The pose is doing narrative work: weight back on the rear leg, torso
   * turned away, the surviving arm thrown up across the body. A figure standing at attention
   * next to its own severed arm reads as a parts diagram.
   */
  player.setPose({
    spine: [-0.16, 0.22, 0.10], chest: [-0.10, 0.14, 0.06],
    neck: [0.10, -0.30, 0], head: [0.06, -0.16, 0],
    shoulderL: [-0.95, 0, 0.44], elbowL: [1.25, 0, 0.10], wristL: [0.20, 0, 0],
    hipL: [-0.34, 0, -0.14], kneeL: [0.52, 0, 0], ankleL: [-0.18, 0, 0.07],
    hipR: [0.22, 0, 0.12], kneeR: [0.18, 0, 0], ankleR: [-0.40, 0, -0.06],
  });
  engine.scene.add(player.root);
  player.root.position.set(-1.42, 0, 0.72);
  /*
   * ⚠️ THE WOUND WAS FACING AWAY FROM THE CAMERA. `critic-hunter-2` called the stump
   * "under-sold"; a 5x crop shows it worse than that — at yaw +0.62 the bare shoulder is on the
   * FAR side of the torso and all that reaches the lens is a sliver of mint cap past the ribs.
   * The whole third leg of the causal chain ("the donor is visibly maimed") was being carried
   * by a few pixels. Rotation about Y by -0.62 sends the severed side's local +X to world
   * (0.81, 0, 0.58), i.e. toward the camera AND toward the hunter, which is also the correct
   * story: the arm left from the side the hunter is standing on. Nothing about the recoil pose
   * changes — it is authored in the body's own frame.
   */
  player.root.rotation.y = -0.62;
  ground(player.root, [player.joints.ankleL, player.joints.ankleR]);
  buildStump(player.sockets.shoulderR, engine);

  /*
   * ---- solve the arm's flight from the PORT, not from taste.
   *
   * `tornSocket`'s local +Y is the bore axis (it is a lathe). Taking its world quaternion gives
   * the direction the mouth faces; the arm is then placed along that ray and turned so its own
   * hanging axis (local -Y, shoulder at the origin, hand at the far end) points back OUT of the
   * port — i.e. the ball goes in first, which is the only way round that reads as fitting.
   */
  hunter.root.updateWorldMatrix(true, true);
  const port = hunter.root.getObjectByName('tornSocket');
  const portPos = new THREE.Vector3();
  const axis = new THREE.Vector3(0, 1, 0);
  if (port) {
    port.getWorldPosition(portPos);
    axis.applyQuaternion(port.getWorldQuaternion(new THREE.Quaternion())).normalize();
  } else {
    // A view must not silently compose itself around a part that is not there.
    console.warn('[hunter.absorb] tornSocket not found — the arm cannot be aimed at the port');
    portPos.set(0, H * 0.72, 0);
  }

  engine.scene.add(lostArm);
  /*
   * 0.170 -> 0.44 H. At the old reach the arm sat against the hunter's own head, at player
   * scale beside a x1.90 body, and read as an aerial or a chip of debris stuck to the skull —
   * there was no travel in the picture because there was no distance left to travel. Out at
   * 0.44 H it is in open sky off the shoulder with clear background behind it, which is the
   * precondition for a trail meaning anything.
   */
  const REACH = H * 0.35;                        // how far out along the axis the ball sits
  lostArm.position.copy(portPos).addScaledVector(axis, REACH);
  lostArm.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), axis);
  // …then break the symmetry. Perfectly on-axis it reads as an installed part; a little off
  // reads as one still moving. Pushed further this round — see buildTrail: a limb in flight
  // TUMBLES, and an object whose long axis is exactly the axis it travels along is the one
  // orientation that photographs as "parked".
  lostArm.rotateOnAxis(new THREE.Vector3(1, 0, 0), 0.88);
  lostArm.rotateOnAxis(new THREE.Vector3(0, 0, 1), -0.62);
  lostArm.scale.setScalar(1.0);

  const trail = buildTrail(engine, lostArm.position, axis, H);

  /*
   * ---- the pull light.
   *
   * ⚠️ `critic-hunter-2`'s highest-value single note on this piece: "the port's red glow bleeds
   * across the ENTIRE front of the hunter's body ... it reads as the whole robot is sunburned
   * rather than there is a glowing wound on its shoulder", and it works against the shot by
   * pulling the eye off the port. The arithmetic says exactly why. `distance` was H * 0.55 =
   * 1.78 m on a body 3.23 m tall whose shoulder sits about 2.4 m up — so the cutoff radius
   * reached the thighs, and everything between was inside a red 1/d^2 falloff. It was never a
   * colour problem; it was a radius problem.
   *
   * H * 0.19 = 0.61 m stops at the pectoral. Intensity goes UP to keep the mouth hot, because
   * the fix must not make the port dimmer — it must make everything else stop being lit.
   */
  const pull = new THREE.PointLight(0xff3a24, 3.6, H * 0.19, 2);
  pull.position.copy(portPos).addScaledVector(axis, H * 0.02);
  engine.scene.add(pull);

  /*
   * THE PORT ITSELF NOW EMITS, which is what lets the light above be that tight. A point light
   * small enough not to wash the torso is also small enough to leave the bore reading as a
   * plain dark hole from any distance; making the bore's own material emissive puts the source
   * IN the opening instead of in front of it, costs no light and no draw call, and cannot
   * spill onto anything because emission does not travel. `socketBore`'s material is built
   * per-hunter inside `buildTornSocket`, so this is not shared state.
   */
  const boreMesh = hunter.root.getObjectByName('socketBore');
  if (boreMesh) {
    // ⚠️ 1.45 blew the bore to a flat orange disc — a lamp, not a hole with something lit deep
    // inside it. The whole point of the port is a VALUE GRADIENT (see buildTornSocket); an
    // emissive strong enough to clip destroys the gradient it was added to reveal.
    boreMesh.material.emissive = new THREE.Color(0xff2b12);
    boreMesh.material.emissiveIntensity = 0.5;
  } else {
    console.warn('[hunter.absorb] socketBore not found — the port will not glow from inside');
  }

  // A second, much weaker one at the arm's ball end, so the part reads as lit BY the port from
  // the correct side even where the bore itself is occluded by the rim. Tight for the same
  // reason as the pull: out here it is the only thing in frame, so it needs no reach at all.
  const spill = new THREE.PointLight(0xff5a34, 0.9, H * 0.13, 2);
  spill.position.copy(lostArm.position).addScaledVector(axis, -H * 0.02);
  engine.scene.add(spill);

  // The TRAIL is in the fit list. It was not, and the first capture clipped its far end on the
  // top edge — "nothing is cropped" applies to the thing that carries the motion read as much
  // as to the figures, and a streak that runs off the frame reads as a frame error.
  fitCamera(engine, [hunter.root, player.root, lostArm, trail], FOV, 30 * Math.PI / 180, 0.14, 1.06);
  /*
   * The cyc has to cover the FRAME, and `fitCamera`'s own sizing does not guarantee that here.
   * It scales the backdrop by `dist / 3.2`, which was tuned for the hunter-stage views' 26
   * degrees of yaw and near-white ground; at this yaw and this ground colour the camera sees
   * PAST its edge and the top-left corner of the capture renders `scene.background` directly —
   * a hard dark disc that looks like a lens artefact and is really the end of the backdrop.
   * A capture with an unexplained black shape in it will be judged on the shape.
   */
  /*
   * ⚠️ X AND Y ONLY. A uniform scale here is worse than the artefact it fixes: `cycGeometry`'s
   * profile runs FORWARD along Z as a flat floor before it curves up, so scaling Z drags that
   * floor out past the subject — the backdrop then passes BETWEEN the camera and the figures,
   * and since its material is `DoubleSide` and near-white, the lower half of both robots
   * rendered washed out and semi-transparent. It reads as a broken alpha blend, not as a
   * backdrop in the wrong place, which is the kind of artefact that gets diagnosed as a
   * material bug for a round. Widen and heighten; never lengthen.
   */
  if (engine.cyc) { engine.cyc.scale.x *= 2.4; engine.cyc.scale.y *= 2.4; }

  labels([
    { text: 'ABSORB', x: 50, y: 6, font: '600 16px/1.2 ui-sans-serif, system-ui, sans-serif',
      color: '#eceff2' },
    { text: 'the hunter takes the part onto itself  ·  stage 2  ·  the port is where it goes',
      x: 50, y: 11, font: '500 11px/1.2 ui-monospace, Menlo, monospace', color: '#aab2ba' },
  ]);

  engine.hunter = hunter;
  engine.finalizeScene();
  await brandReady();          // the donor carries the wordmark — see hunter-stage.js
  engine.markReady();
  engine.start();
  return engine;
}

/**
 * ============ THE MOTION CUE ============
 *
 * `critic-hunter-2`: "the flying arm has no motion cue — no blur, no trail, no wobble — so in
 * a static frame without the caption text it could as easily read as a floating prop or a
 * physics glitch (an object stuck mid-air) as it does a limb in flight toward a socket."
 *
 * Three cues, because one of them alone is ambiguous and each fails in a different way:
 *
 *  1. a COMET, widest at the object and tapering to nothing behind it. This is the one that
 *     says "fast". It is deliberately NOT drawn between the arm and the port: a glow in that
 *     gap is a tractor beam, which is a different (and wrong) mechanic — the hunter pulls
 *     nothing, it opens a hole and the part arrives.
 *  2. SPEED LINES — thin, straight, parallel to the flight axis, offset around it. A comet on
 *     its own can be read as an exhaust; a comet plus straight parallel streaks is the visual
 *     grammar of a thing that has been thrown.
 *  3. DEBRIS chipped off the shoulder, tumbling along the same line at slightly different
 *     rates. Solid, unlit-looking metal, so it is legible against the additive glow, and it
 *     doubles as the "no debris" half of the same critic's complaint about the wound.
 *
 * Everything here is additive and `depthWrite: false` so nothing can occlude the arm it is
 * meant to be describing, and everything is deterministic — no `Math.random` in a render.
 */
function buildTrail(engine, at, axis, H) {
  const grp = new THREE.Group();
  grp.name = 'absorb.trail';
  grp.position.copy(at);
  /*
   * ⚠️ DIRECTION, AND THE FIRST VERSION HAD IT BACKWARDS IN BOTH SENSES. The arm travels along
   * -axis (into the port), so its wake is at +axis, AWAY from the port. Built the other way it
   * is not a wake at all, it is a beam — and the capture showed the second, worse consequence:
   * the streak ran straight across the hunter's face on its way to the shoulder, putting the
   * brightest new element in the frame on top of the one feature the piece cannot afford to
   * obscure. Pointing it correctly also puts it in empty sky, where a soft additive shape can
   * actually be read.
   */
  grp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.clone());
  engine.scene.add(grp);

  const glow = (color, opacity) => new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, depthWrite: false, vertexColors: true,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });

  /**
   * Fade a geometry to BLACK along +Y. Under additive blending black IS transparent, so this
   * is a soft end without an alpha channel and without a texture — which matters, because the
   * hard-edged triangle the first pass drew read as a paper ribbon rather than as a smear.
   * A gradient the renderer interpolates is the only soft edge available in flat geometry.
   */
  const fade = (geo, y0, y1) => {
    const p = geo.attributes.position;
    const c = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const t = THREE.MathUtils.clamp((p.getY(i) - y0) / (y1 - y0), 0, 1);
      const v = (1 - t) * (1 - t);
      c[i * 3] = v; c[i * 3 + 1] = v; c[i * 3 + 2] = v;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return geo;
  };

  // 1 — the comet. A cone tapers to a point at +Y, so it is placed base-at-the-arm; the fade
  // does the rest. Narrower than the first pass by half: a wide additive cone is a spotlight.
  const cometLen = H * 0.34;
  const cone = new THREE.Mesh(
    fade(new THREE.ConeGeometry(H * 0.016, cometLen, 16, 6, true)
      .translate(0, cometLen * 0.5, 0), 0, cometLen),
    glow(0xff8a52, 0.42));
  grp.add(cone);

  // 2 — speed lines. Four, unequal, so they read as motion rather than as a fan.
  const line = [
    [0.011, 0.30, 0.55, 0.34], [-0.016, 0.46, 0.42, 0.26],
    [0.022, 0.16, 0.30, 0.30], [-0.008, 0.56, 0.24, 0.20],
  ];
  for (const [off, len, phase, op] of line) {
    const L = H * len;
    const m = new THREE.Mesh(
      fade(new THREE.CylinderGeometry(H * 0.0020, H * 0.0007, L, 6, 6)
        .translate(0, L * 0.5 + H * 0.02, 0), 0, L),
      glow(0xffb488, op));
    m.position.set(Math.cos(phase * 9.0) * H * off, 0, Math.sin(phase * 9.0) * H * off);
    grp.add(m);
  }

  // 3 — debris chipped off the shoulder, tumbling along the same line. Three, not five: the
  // first pass rendered as small black squares against the sky and read as dirt on the lens.
  // Lower metalness so they actually catch the key instead of mirroring the dark backdrop.
  const chip = new THREE.MeshStandardMaterial({ color: 0xa8aaad, roughness: 0.5, metalness: 0.35 });
  chip.name = 'absorb.debris';
  const bits = [[0.11, 0.016, 0.4, 0.9], [0.24, 0.012, 1.7, 0.3], [0.39, 0.009, 2.6, 2.1]];
  for (const [along, size, a, roll] of bits) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(H * size, H * size * 0.42, H * size * 0.7), chip);
    b.castShadow = false;
    b.position.set(Math.cos(a * 5.0) * H * 0.030, H * along, Math.sin(a * 5.0) * H * 0.030);
    b.rotation.set(roll, a, roll * 0.6);
    grp.add(b);
  }
  return grp;
}

/**
 * ============ THE WOUND ============
 *
 * `critic-hunter-2`: "the player's amputation stump is under-sold: mint cap plus a small grey
 * stub peg, no exposed wire, spark, or scorch to sell that this just happened violently. The
 * wound end deserves at least as much detail as the object flying away from it."
 *
 * Built INTO the empty shoulder socket, so every part of it is anchored to the body at the
 * exact point the limb left from and none of it can float — the failure mode that has already
 * cost this project a round twice (`buildFaceCracks`' flat plate, `buildTornSocket`'s rim
 * shards). Roots buried inside the shoulder shell is not a defect here: a torn cable IS a
 * thing whose root you cannot see.
 *
 * The spark is one bead plus one very small point light, and the light's radius is smaller
 * than the shoulder — the whole lesson of the port's own glow, applied before it is filed.
 */
function buildStump(socket, engine) {
  if (!socket) { console.warn('[hunter.absorb] no shoulderR socket — no stump dressing'); return; }
  const P = 1.7;                                   // donor is a 1.7 m player
  const w = (f) => f * P;
  /*
   * ⚠️ OUTBOARD IS NOT ALWAYS +X, AND ASSUMING IT WAS PUT THE WHOLE WOUND ON THE STERNUM.
   * `unit4h` mirrors the two shoulder sockets about the chest's centreline, so which sign is
   * "away from the body" depends on the side. The first pass hard-coded +X and a 5x crop shows
   * exactly what that produced: a small brown tangle in the middle of the chest, with the
   * shoulder itself untouched. Read the sign off the socket instead — it is the one place the
   * answer is stored — so this stays correct if the rig is ever re-mirrored.
   */
  const sgn = Math.sign(socket.position.x) || 1;
  const g = new THREE.Group();
  g.name = 'absorb.stump';
  socket.add(g);

  // The torn ball housing: what is left of the joint, standing proud of the shell so the eye
  // has something to land on. Without it the wound is a hole you cannot see into and the
  // dressing below reads as damage to the TORSO rather than as an amputation.
  const bare = new THREE.MeshStandardMaterial({ color: 0x6e7276, roughness: 0.55, metalness: 0.8 });
  bare.name = 'absorb.stumpMetal';
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(w(0.030), w(0.034), w(0.020), 20), bare);
  collar.rotation.z = Math.PI * 0.5;
  collar.position.x = sgn * w(0.028);
  g.add(collar);

  // scorch: a shallow dark cup capping the housing, opening outboard — the burnt cavity the
  // limb left. Seated ON the collar rather than at the joint centre, which is buried in shell.
  const soot = new THREE.MeshStandardMaterial({ color: 0x14100e, roughness: 0.95, metalness: 0.1 });
  soot.name = 'absorb.scorch';
  const cup = new THREE.Mesh(
    new THREE.SphereGeometry(w(0.029), 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), soot);
  cup.rotation.z = sgn * Math.PI * 0.5;            // open outboard, along the socket's own axis
  cup.scale.set(0.5, 1, 1);
  cup.position.x = sgn * w(0.036);
  g.add(cup);

  // severed cable: dark rubber, one copper conductor. Long enough to hang — the first pass was
  // short enough that the whole bundle read as a smudge.
  const dark = new THREE.MeshStandardMaterial({ color: 0x16130f, roughness: 0.9, metalness: 0.05 });
  const cu = new THREE.MeshStandardMaterial({ color: 0x8a5228, roughness: 0.45, metalness: 0.75 });
  dark.name = 'absorb.wireDark'; cu.name = 'absorb.wireCu';
  const wires = [
    [0.9, 0.055, -0.085, 0.020, false], [-0.4, 0.070, -0.062, -0.014, false],
    [2.1, 0.048, -0.100, -0.026, true], [1.4, 0.078, -0.048, 0.030, false],
    [3.0, 0.060, -0.118, 0.008, false],
  ];
  for (const [a, out, drop, side, copper] of wires) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(sgn * w(0.024), 0, 0),
      new THREE.Vector3(sgn * w(out * 0.7), w(drop * 0.20), w(side * 0.5)),
      new THREE.Vector3(sgn * w(out), w(drop * 0.62), w(side)),
      new THREE.Vector3(sgn * w(out * 0.72 + Math.cos(a) * 0.014), w(drop), w(side * 1.6)),
    ]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 12, w(0.0030), 5, false),
      copper ? cu : dark));
  }

  /*
   * The spark, and only one — two reads as a sparkler. ⚠️ ITS LIGHT IS THE SAME TRAP THE PORT
   * JUST FAILED: at w(0.16) = 0.27 m on a 1.7 m body the flash washed the whole chest cream
   * and buried the wound in its own glow. w(0.055) = 0.09 m keeps it inside the shoulder.
   */
  const hot = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
  hot.name = 'absorb.spark';
  const bead = new THREE.Mesh(new THREE.SphereGeometry(w(0.0050), 10, 8), hot);
  bead.position.set(sgn * w(0.040), w(-0.016), w(0.006));
  g.add(bead);
  const flash = new THREE.PointLight(0xffb060, 0.30, w(0.055), 2);
  flash.position.copy(bead.position);
  g.add(flash);
}

/** Drop `obj` so the lowest point of `parts` sits on y = 0. Nothing floats. */
function ground(obj, parts) {
  obj.updateWorldMatrix(true, true);
  const box = new THREE.Box3();
  for (const p of parts) box.expandByObject(p);
  if (!box.isEmpty()) obj.position.y -= box.min.y;
  obj.updateWorldMatrix(true, true);
}
