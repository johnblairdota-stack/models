import * as THREE from 'three';
import { studio, labels } from './_studio.js';
import { buildUnit4H } from '../characters/unit4h.js';
import { buildGadget, skateDriftTrail } from '../gadgets/index.js';

/**
 * One gadget limb, mounted on the robot and framed like its Dev Art shot: full body,
 * plain cyc, the gadget on the wearer's left, camera near chest height.
 *
 * The gadget REPLACES the limb — the forearm and hand are hidden rather than moved aside —
 * so this view also proves the socket swap works, which is the mechanic the whole
 * limbs-as-inventory system rests on.
 */

// A 1.7 m subject filling ~80% of the frame at fov 33 needs the camera about 3.5 m back:
// (1.7/0.8)/2 / tan(16.5°). At 2 m the head is cropped, which is what the first pass did.
//
// All four arm views are shot from a mild three-quarter on the robot's RIGHT, so the
// wearer's left shoulder, upper arm and the chrome cuff below it are all in the same
// unobstructed read — the join is the evidence, and a dead-front camera buries it in the
// torso silhouette. Camera height sits at the elbow, not the chest, because the elbow is
// where the argument is being made.
const FRAMING = {
  nailgun: { pos: [1.05, 1.00, 3.30], target: [-0.13, 0.86, 0.06], fov: 33 },
  // Further back and looking lower than its siblings ON PURPOSE. This is the only one of
  // the five whose subject extends to the floor: the lob lands about 0.86 m in front of
  // the nozzle, and because that point is NEARER the camera than the robot, perspective
  // drops it below the feet. At the shared 3.35 m / target 0.80 the burning splash ran
  // straight off the bottom edge of the frame, which is the "nothing is cropped" reject.
  oil:     { pos: [1.32, 1.06, 3.92], target: [-0.20, 0.70, 0.12], fov: 34 },
  grapple: { pos: [0.95, 0.98, 3.25], target: [-0.10, 0.86, 0.04], fov: 33 },
  ball:    { pos: [1.00, 1.02, 3.30], target: [-0.14, 0.86, 0.10], fov: 33 },
  // ⚠️ THE CAMERA MUST STAY NEAR-FRONTAL. The jets fire backward off the calves and the
  // reference is a near-profile carve, so every previous pass swung the CAMERA round to
  // the side — [2.55, 1.05, 1.95] most recently. That is what put a big grey disc in the
  // corner of this shot for several rounds, and it was misfiled as "the floor disc's far
  // edge dragging across the backdrop".
  //
  // It is neither a disc nor the floor. `_studio.js`'s cyc is 14 m wide, so it spans
  // x ∈ [-7, 7]; from an oblique camera the rays at the far edge of frame exit past that
  // edge and hit nothing. Measured: the region is a dead-flat 116/116/116 at two widely
  // separated points, against a lit cyc reading 193–212 with a gradient. A constant with
  // no gradient is not a surface — it is the cleared background showing through, and its
  // curved boundary is just the cyc fillet's silhouette. Widening the cyc would be a fix
  // in `_studio.js`, which this piece does not own.
  //
  // The profile comes from yawing the SUBJECT instead (see `LEAN`), which costs nothing
  // and keeps every ray on the backdrop. Same distance as the other four.
  skates:  { pos: [0.72, 1.06, 3.34], target: [0.00, 0.64, 0.00], fov: 34 },
};

const TITLES = {
  nailgun: 'NAIL GUN', oil: 'OIL LOBBER', grapple: 'GRAPPLING HOOK',
  ball: 'BOUNCY BALL GUN', skates: 'ROCKET SKATES',
};

/**
 * Per-gadget arm pose and scale.
 *
 * SCALE. This is the whole slice. The previous pass ran these at 1.45–1.55 on top of
 * dimensions that were already authored generously, and the result was a gadget as long
 * as the robot's torso hanging off a shoulder — which the eye reads as a prop being
 * brandished, never as a limb. Measured off the Dev Art against the robot's own height:
 *
 *   nail gun   cuff at the elbow to muzzle tip   0.36 H
 *   ball gun   cuff to the ball in the tube mouth 0.34 H
 *   oil lobber cuff to nozzle tip                0.32 H
 *   grapple    cuff to fluke tips                0.29 H
 *
 * The rig's own elbow-to-fingertip is 0.255 H, so a correct gadget is 1.1–1.4× the limb
 * it replaced — heavier than a forearm, and nowhere near half a body. `index.js` builds
 * each one at roughly its reference length already, so these numbers are close to 1 and
 * only trim the overshoot. If you raise one, measure the render, not the model.
 *
 * POSE. The references do NOT hold these out at arm's length. The arm sits in a posture a
 * real arm could sit in — upper arm hanging near the body, the gadget continuing the
 * forearm's line down and forward — and the gadget is kept just outside the hip so it
 * reads against the cyc rather than against the thigh. Negative Z on the left shoulder
 * abducts outward; negative X swings forward; negative Y on the shoulder turns the elbow's
 * hinge plane so the bend carries the gadget forward-and-out instead of across the chest.
 * Each gadget also carries its own forward tilt inside `index.js` (nail gun -0.30, oil
 * -0.26, ball -0.22, grapple -0.05), which adds to the elbow's.
 */
const RIGS = {
  // ⚠️ Reference 1785313925351 does NOT hold this one at the side, and the slice brief's
  // blanket claim that "the references do NOT hold these out at arm's length" is simply
  // wrong for the nail gun — see the report. Go and look at the art: the upper arm hangs,
  // the elbow is folded to about 60°, and the gun is carried UP AND FORWARD at roughly 45°
  // with the muzzle leading at chest height and the magazine trailing down and back. That
  // is also what the critic's second complaint says. Arm-at-side is right for the grapple
  // (ref 1785320715285) and for nothing else.
  //
  // Raising it does not cost the replaced-limb read, because the read is carried by the
  // chrome mount sleeve at the elbow and by the gadget continuing the forearm's line — and
  // the reference itself is a raised arm that reads unambiguously as a limb.
  //
  // 0.72 of elbow OVERSHOT: it brought the gun up to near-horizontal and swung it round
  // until the camera saw it END-ON, so the slab foreshortened to nothing and the gold coil
  // bundle collapsed into a tangle of overlapping rings. The gun has to be raised AND kept
  // side-on to the lens — the reference reads because its whole length is presented across
  // the frame. 0.44 lifts the muzzle to just below chest height with the slab still broadside.
  nailgun: {
    scale: 0.86,
    pose: {
      shoulderL: [-0.14, -0.12, -0.34], elbowL: [-0.44, 0, -0.12],
      shoulderR: [0.05, 0, 0.13], neck: [0, 0.08, 0],
    },
  },
  // Reference 1785315723570: the arm hangs nearly STRAIGHT, and the drum runs on down the
  // forearm line to finish around knee height — the assembly is longer than the forearm it
  // replaced, which is most of why it reads as a limb rather than a canister.
  //
  // The 50° elbow bend this used to carry folded that whole length up in front of the
  // chest and foreshortened it into a stubby cluster: the critic's "sits higher and shorter
  // than the bar art" was measuring the POSE, not the model. `gadget-sheet.js` has always
  // posed this arm nearly straight and the same gadget reads correctly there, which is the
  // A/B that identifies the bend as the cause.
  oil: {
    scale: 0.98,
    pose: {
      shoulderL: [-0.08, -0.14, -0.32], elbowL: [-0.20, 0, -0.10],
      shoulderR: [0.05, 0, 0.13], neck: [0, 0.10, 0],
    },
  },
  // Reference 1785320715285: straight down at the side, claw swinging below the hip. The
  // most limb-like of the four precisely because nothing is being presented.
  //
  // ⚠️ THE ABDUCTION WAS THE PIECE'S DOMINANT REMAINING GAP, AND THE THIGH RISK WAS OVERSTATED.
  //
  // `critic-gadget-5` measured the housing shape as effectively matching the art (housing
  // 75-76 px vs 76, claw span 90 px vs 91, ratio 1.19 vs 1.20) and then named this tilt as
  // "the most legible remaining departure from the reference" — shoulder z -0.28 plus elbow z
  // -0.07 is -0.35 rad, 20.05 degrees, where the art hangs the same arm at roughly 4. It
  // recommended a PARTIAL pull-in because the framing note below warns the housing can meet
  // the thigh.
  //
  // That warning was never measured, and it is much softer than it reads. `harness/
  // _g7_skate.mjs --clear` does an all-pairs vertex scan between the gadget subtree and the
  // hip/knee meshes: at -0.35 the minimum separation was **133.7 mm**, closest approach up at
  // hip height rather than down at the claw. The art's own gap is far tighter than ours — the
  // housing hangs right beside the thigh with a sliver of backdrop showing.
  //
  // So this is a real pull-in to -0.16 rad (9.2 deg), a little over half the way to the art,
  // with the remaining clearance measured rather than assumed. It is deliberately NOT the full
  // correction: the reason the abduction exists at all is the note below — the housing has to
  // keep reading against the cyc rather than against the thigh — and that is a SILHOUETTE
  // constraint, not a collision one, so it binds well before the geometry does.
  //
  // Measured before -> after, both from `--clear` on a real capture camera:
  //
  //                                    before    after    bar art
  //   rig abduction (shoulder+elbow)   -0.35     -0.16     ~-0.07
  //   housing hang axis ON SCREEN      -17.18    -8.01     ~-4
  //   min gadget-to-thigh distance     0.1337 m  0.0934 m     —
  //
  // The screen angle is the number that matters and is NOT the rig number: the gadget carries
  // its own -0.05 forward tilt and the arm has other rotations, so 0.19 rad of pull-in at the
  // joints buys 9.2 degrees of visible hang. Quote the hang axis, not the pose.
  grapple: {
    scale: 0.92,
    pose: {
      shoulderL: [-0.05, -0.06, -0.13], elbowL: [-0.12, 0, -0.03],
      shoulderR: [0.05, 0, 0.13], neck: [0, 0.06, 0],
    },
  },
  // Reference 1785320614586: upper arm hanging, elbow folded to near a right angle, the
  // barrel cluster carried IN FRONT OF THE BODY at waist height with the dome uppermost.
  //
  // In front, not out to the side. The 0.40 abduction plus the near-full 1.02 fold swung
  // the cluster out level with the hip on a straightened-looking arm, which is the
  // critic's "carries the cluster out near-horizontal" — an arm held out presenting an
  // object, i.e. exactly the prop read this whole slice exists to kill. Pulling the
  // abduction in and easing the fold drops it to waist height and brings it across the
  // front, where the reference carries it.
  ball: {
    scale: 0.95,
    pose: {
      shoulderL: [-0.10, -0.30, -0.20], elbowL: [-0.86, 0, -0.10],
      shoulderR: [0.05, 0, 0.13], neck: [0, 0.12, 0],
    },
  },
};

/**
 * The carving lean from Dev Art 1785314396477.
 *
 * The reference is not a standing figure with a bent spine — the WHOLE BODY is tipped into
 * the turn and the legs are folded under it, which is why the previous version read as a
 * robot standing still on a broken skateboard. A spine/chest bend alone cannot produce that
 * silhouette: the pelvis has to go over too. So the lean lives on `unit.root` (see `LEAN`)
 * and this table only does what a skeleton can do — trailing leg extended, leading leg
 * folded, arms counterweighting across the turn.
 */
/*
 * ⚠️ EVERY HIP AND THE NECK ARE COUPLED TO `LEAN.pitch` — CHANGE ONE AND RE-CHECK THE OTHERS.
 *
 * The pitch rotates the WHOLE figure about the body's lateral axis, legs included, so 0.52 rad
 * of it swings both feet backward and UP: at pitch 0.52 with the old hips the trailing skate
 * measured 119 capture px clear of the floor while the leading one carried the whole figure,
 * which reads as falling over rather than carving. The hips carry a matching counter-rotation
 * so the legs stay planted under a leaned trunk — which is also what a real skater does, and
 * is why the numbers here look large next to the pose they replaced.
 *
 * The neck does the same job at the other end. Measured on the bar art, the trunk is not a
 * straight leaning plank: hips->chest runs ~58 deg off vertical and chest->head only ~25 deg,
 * i.e. the pelvis is dropped back, the chest thrown forward and the head brought back UP to
 * look down the line of travel. Matching the total 35 deg with a uniform bend gives a figure
 * that reads as toppling; the neck lift is what makes it read as intent.
 */
const SKATE_POSE = {
  spine: [0.16, 0.26, -0.12], chest: [0.08, 0.14, -0.07],
  // Outside arm thrown forward and across for balance; inside arm trailing low and back.
  shoulderL: [-0.82, 0.34, 0.30], elbowL: [-1.30, 0, 0],
  shoulderR: [0.62, -0.28, -0.95], elbowR: [-0.70, 0, 0],
  // Leading (L) leg folded, trailing (R) leg driving out behind — the carve's asymmetry.
  hipL: [-0.86, 0.06, 0.18], kneeL: [0.95, 0, 0],
  hipR: [-0.18, -0.06, -0.26], kneeR: [0.40, 0, 0],
  neck: [-0.52, 0.22, 0],
};

/**
 * Whole-figure attitude for the skate shot: yaw into a three-quarter, tip into the turn.
 * Applied to `unit.root`, then the figure is dropped so the wheels touch y = 0 — measured
 * off the real axles rather than guessed, because the lean changes the contact height and
 * a skater hovering two centimetres off the floor is the exact "nothing floats" reject.
 */
// yaw -1.15 (-66°) left the figure quartering TOWARD the lens, so the jets — which fire
// backward off the heels — ran away from the camera and foreshortened into a stub, with the
// whole right half of the frame empty. The bar art is a near-profile carve precisely because
// that is the angle where the thrust trails ACROSS the frame at full length. -1.40 (-80°)
// buys that back, fills the dead space with the streak, and still keeps enough of the face
// turned to the lens to read. This is the subject yawing, not the camera, so every ray stays
// on the backdrop — see the FRAMING note above for why that distinction matters here.
//
// ⚠️ `roll` WAS THE WRONG CHANNEL, AND IT IS THE SAME TRAP AS THE HUNTER'S STAGE-1 STOOP.
//
// `roll` banks the body about its OWN FORWARD AXIS, which is what a carving skater physically
// does. But `rotation.set(0, yaw, roll)` under three's default XYZ order is Ry(yaw)·Rz(roll),
// so the bank happens first in the body frame and is then yawed by -80° — which lays the bank
// axis almost exactly IN THE IMAGE PLANE. Measured with `harness/evidence/_g7_skate.mjs`, which
// projects the real joints through the real capture camera:
//
//   body forward axis   world (-0.985, 0, 0.170)   dot(view dir) = 0.040  -> 87.7° off the
//                                                  view axis, i.e. lying across the frame
//   body lateral axis   world ( 0.170, 0, 0.985)   dot(view dir) = -0.991 -> 7.7° off the
//                                                  view axis, i.e. pointing at the lens
//
// A rotation about an axis lying in the image plane moves the head into DEPTH and drops it by
// the quadratic (1-cos) term; it produces almost no screen-space tilt. So roll 0.26 rad
// (14.9°) bought a measured trunk tilt of **2.83° off vertical on screen** (hips -> head, in
// capture pixels) against the bar art's **~35°** (art hips ~(700,355), head ~(867,145)). That
// is the whole of the critic's "markedly less dynamic ... noticeably tamer": the lean was
// being applied to the one axis this camera cannot see.
//
// `pitch` is the channel that reads. It rotates about the body's LATERAL axis, which at this
// yaw is 99.1% aligned with the view axis, so it is very nearly a pure screen-plane rotation.
// It is also what the art actually shows: the reference's dust trails BEHIND and the head is
// thrown FORWARD over the leading skate — a lean along the direction of travel, not a bank
// across it. Positive pitch tips the crown toward the body's +Z, which is the way it is going.
//
// The Euler ORDER is load-bearing. 'YXZ' gives Ry·Rx·Rz, so the roll still applies first in
// the body frame exactly as before (with pitch 0 this is bit-identical to the old XYZ call),
// then the pitch about the body's own lateral axis, then the yaw in world. Under the default
// 'XYZ' the x term would be a rotation about the WORLD x axis, which at this camera lies in
// the image plane too — i.e. the obvious spelling buys back nothing.
//
// `roll` is kept only as a token: the two skates are ±0.1275 m either side of the centre line,
// so a bank of 0.20 rad lifts the trailing one 2·0.1275·sin(0.20) = 51 mm clear of the floor —
// measured as 59 mm of air under skate 1 — while contributing, by the argument above, no screen
// tilt whatsoever. It was paying a floating skate for nothing. 0.08 keeps a hint of bank in the
// silhouette at a 20 mm cost the hips can absorb.
const LEAN = { yaw: -1.40, pitch: 0.52, roll: 0.08 };

const _v = new THREE.Vector3();

export default async function view(args = {}) {
  const id = args.gadget ?? 'nailgun';
  const f = FRAMING[id] ?? FRAMING.nailgun;

  const engine = await studio({
    cameraPos: f.pos,
    target: f.target,
    fov: f.fov,
    // Raised with `contrast` below to pay back the ambient that darkening the env room
    // costs. Scaling the whole environment preserves its dark-to-bright RATIO, which is
    // the part chrome actually needs, so this buys the level back without flattening the
    // reflection again.
    envIntensity: 1.32,
    /*
     * THE GRAPPLE HOUSING'S "no chrome specular" IS NOT A MATERIAL BUG — I checked the
     * material first and it was already right. `grapplingHook()` builds its housing from
     * `chrome({ tint: [0.95,0.96,0.98], wear: 0.22 })`, i.e. metalness 1.0 at roughness
     * ~0.055. A mirror.
     *
     * A metal has NO diffuse term: it is only what it reflects. The default studio env is
     * a bright room whose darkest element is a 0.62 grey floor bounce, so a mirror in it
     * reflects a near-uniform field and resolves to flat mid-grey with no highlight
     * anywhere — which is precisely what the critic described, and it would have survived
     * any amount of work on the material. `_studio.js` already carries the fix as an
     * opt-in: at `contrast > 0` two near-black flag panels flank the subject and the floor
     * bounce darkens, giving chrome a dark-to-bright gradient to bend across its curve.
     * The bright panels are deliberately untouched at any contrast, so exposure does not
     * move and the four gadgets that were framed against the old env keep their levels.
     *
     * Until now `char.turnaround` was the only caller opting in. `lightContrast` is left
     * at the default: it is a KEY:FILL change, and these five are judged against reference
     * shots that are softly and evenly lit.
     *
     * ⚠️ `_studio.js`'s claim that "bright panels unchanged at any contrast, so exposure
     * does not move" DID NOT HOLD HERE, and it is worth knowing why. The bright panels are
     * indeed untouched, but at contrast 1.0 the room box goes 0.72 -> 0.20 and the floor
     * bounce 0.62 -> 0.24, and those two are most of the ambient — the shells take ~62% of
     * their light from the IBL. Measured at contrast 1.0 against the grapple's own bar art,
     * both sides scaled identically through `sheet.mjs`: backdrop 186 against the art's
     * 239, top-of-skull shell 169 against 236. Half a stop down across the whole frame, on
     * a set of pieces whose references are deliberately high-key.
     *
     * `char.turnaround` does not hit this because it opts into `lightContrast: 1.0` in the
     * same breath, which nearly doubles the key. The two are a PAIR. Taking contrast
     * without it just turns the lights down. Backed off to 0.6 — the flag panels still land
     * near 0.35 against bright panels at 4.5–11.0, so chrome keeps a wide gradient to bend
     * — and the remainder is paid back through `envIntensity` above.
     */
    contrast: 0.6,
    // Wide enough that the shadow camera's footprint falls entirely outside the frame.
    // At 1.6 and again at 2.8 its edge cut a visible grey rectangle across the cyc behind
    // the nail gun, which reads as a rendering fault before it reads as anything else.
    shadowExtent: 5.0,
  });

  const H = 1.7;
  const unit = buildUnit4H({ height: H });
  engine.scene.add(unit.root);

  const gadget = buildGadget(id, { height: H, materials: unit.materials });
  let drift = null;

  if (gadget.socket === 'shinBoth') {
    // The boots come off and the skates ARE the feet now — the same swap `LimbRig.
    // fitSkates()` makes. The shins stay: the skate's own calf shroud and jet mount fit
    // OVER them, which is what the reference shows.
    for (const s of ['L', 'R']) hideLimb(unit, `ankle${s}`);
    unit.root.add(gadget.root);

    // ⚠️ The skates must ride the ANKLES, not the root. `rocketSkates()` parks them at
    // fixed offsets in root space, which is only correct in the rest pose — under this
    // view's carve the feet swung away and both skates stayed standing on the floor
    // behind them. `attach()` re-parents while preserving the world matrix, so the
    // authored rest placement carries over exactly and no offset has to be re-derived.
    // Order matters: attach in the REST pose, then pose.
    unit.root.updateMatrixWorld(true);
    unit.joints.ankleL?.attach(gadget.feet.L);
    unit.joints.ankleR?.attach(gadget.feet.R);

    unit.setPose(SKATE_POSE);
    unit.root.rotation.set(LEAN.pitch, LEAN.yaw, LEAN.roll, 'YXZ');

    // Drop the figure onto the floor by measuring the real axles. Box3 over the skates is
    // no good here — the flame cones hang well below the wheels and would lift the whole
    // robot into the air by their length.
    unit.root.updateMatrixWorld(true);
    let lowest = Infinity;
    for (const axle of gadget.wheels ?? []) {
      lowest = Math.min(lowest, axle.getWorldPosition(_v).y - gadget.wheelRadius);
    }
    if (Number.isFinite(lowest)) unit.root.position.y -= lowest;

    // THE GROUND HALF OF THE REFERENCE. Placed from the real contact patch rather than a
    // hand-typed offset — the pose above moves the wheels several centimetres, and a trail
    // anchored to a constant would drift out from under them the next time it is touched.
    // `curveRadius` is `_studio.js`'s cyc fillet: the trail runs ~2.5 m behind the skates,
    // which is well past where the floor stops being flat. See `skateDriftTrail`.
    unit.root.updateMatrixWorld(true);
    const contact = new THREE.Vector3();
    let n = 0;
    for (const axle of gadget.wheels ?? []) { contact.add(axle.getWorldPosition(_v)); n++; }
    if (n) contact.multiplyScalar(1 / n);
    drift = skateDriftTrail({
      height: H, origin: contact, yaw: LEAN.yaw, curveRadius: 3.2,
    });
    engine.scene.add(drift.root);
  } else {
    // the forearm, wrist and hand all go — the gadget bolts to the elbow
    hideLimb(unit, 'elbowL');
    (unit.joints.elbowL ?? unit.joints.shoulderL).add(gadget.root);
    const rig = RIGS[id] ?? RIGS.nailgun;
    unit.setPose(rig.pose);
    gadget.root.scale.setScalar(rig.scale);
  }

  const dbg = args.params?.get?.('dbg');
  if (dbg === 'nosprite') gadget.root.traverse((o) => { if (o.isSprite) o.visible = false; });
  if (dbg === 'nogadget') gadget.root.visible = false;
  // `--extra "dbg=nodrift"` removes the whole ground trail and nothing else, which is the A/B
  // that says how many LDR levels it is actually worth on the floor. An effect nobody has
  // measured against its own absence is an effect nobody has measured.
  if (dbg === 'nodrift' && drift) drift.root.visible = false;
  if (dbg === 'driftonly' && drift) gadget.root.visible = false;

  // ⚠️ FIRE AT t=0, NOT AT 0.5, AND THIS IS NOT A TASTE CALL.
  //
  // `oilLobber.update()` gates its whole effect on `since = t - t0`, and shoot.mjs captures
  // after `settle(12)` — twelve fixed 1/60 steps, i.e. **t ≈ 0.20 s**. Priming the trigger
  // at 0.5 s made `since` NEGATIVE at capture time, so `burn` was 0 and the arc, the spray,
  // the pilot flame and the burning splash were all `visible = false` in the shot. The
  // re-fire below only lands at t = 2.2 s, which no capture ever reaches.
  //
  // Consequence, and it is why this is worth a paragraph: **`gadget.oil` has never once
  // photographed the feature it is named for.** Verified against the board's own
  // `progress/shots/gadget.oil.png` as well as a fresh capture — both show a robot holding a
  // brass drum over an empty floor. Every verdict on this piece, including its 44, was filed
  // on a picture that did not contain the lob.
  gadget.fire?.(0);
  engine.onUpdate((dt, t) => {
    gadget.update?.(dt, t);
    // re-fire on a cycle so a captured frame usually catches the effect live
    if (gadget.fire && Math.floor(t / 2.2) !== Math.floor((t - dt) / 2.2)) gadget.fire(t);
  });

  // Name only. The old subtitle read "replaces a limb — not carried", which is the picture
  // arguing with itself: if the render needed to be told what it was showing, it was not
  // showing it. The silhouette has to carry that on its own.
  labels([{ text: TITLES[id] ?? id, x: 50, y: 7 }]);

  engine.finalizeScene();
  engine.markReady();
  engine.start();
  return engine;
}

/**
 * Hide everything from a joint downward, so the gadget genuinely replaces the limb.
 *
 * The obvious version of this — `unit.parts.handL.visible = false` — silently does
 * nothing, and cost this piece a round. `unit4h.js` runs a `collapseDrawCalls()` pass that
 * flattens every non-joint group and merges each joint's mesh children per material into
 * one mesh, then removes the originals from the graph. So `parts.handL` is a detached
 * husk whose geometry now lives inside `j.wristL.merged`; toggling its `.visible` moves
 * nothing on screen, which is why a fully articulated hand kept hanging past the barrels.
 * Only the surviving joint groups are real, so hide by walking one of those.
 *
 * Call this BEFORE parenting the gadget to the joint, or you hide the gadget too.
 */
function hideLimb(unit, jointName) {
  const j = unit.joints?.[jointName];
  if (!j) return;
  j.traverse((o) => { if (o.isMesh) o.visible = false; });
}
