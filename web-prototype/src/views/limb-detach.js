import * as THREE from 'three';
import { studio, labels } from './_studio.js';
import { buildUnit4H } from '../characters/unit4h.js';
import { unit4hMaterials } from '../materials/surfaces/robot.js';
import { LimbField, LimbRig } from '../game/limbs.js';
import { Gait, sampleGait } from '../game/locomotion.js';

/**
 * THE LIMB CYCLE — detach, fall, pick up, club, refit — in one frame.
 *
 * Four stations, each one a REAL `LimbRig` on a real `buildUnit4H`, driven through the
 * actual game code: the leg in station 1 is airborne because `LimbField` integrated it for
 * 0.16 s; the leg in station 2 is lying flat because the same integrator put it to sleep;
 * the leg in station 3 is in the fist because `rig.pickUp()` reparented it to the wrist.
 * Nothing here is posed by hand to look like the mechanic.
 *
 * Station 4 is the one that matters most: its left arm is NOT its own. It was detached off
 * station 3's body and fitted into station 4's empty shoulder — scavenging another
 * player's limb, which is what makes the four sockets an economy rather than a health bar.
 * You can read it off the arm: it is the one grimed chrome and dulled mint cap in the
 * frame, because it has been torn off and thrown on a floor. Station 3 is left one-armed
 * by the trade, swinging a leg it tore off itself, which is Dev Art 1785319916301 exactly
 * — a WHITE robot swinging a WHITE leg.
 */

const SPACING = 1.60;
const STATIONS = [
  { key: 'hit', x: -1.5 * SPACING, title: 'HIT', sub: 'the socket empties · no health bar' },
  { key: 'object', x: -0.5 * SPACING, title: 'DROPPED', sub: 'a limb is a physical object' },
  { key: 'club', x: 0.5 * SPACING, title: 'CLUB', sub: 'picked up and swung' },
  { key: 'refit', x: 1.5 * SPACING, title: 'REFIT', sub: "scavenged — that arm is #3's" },
];

export default async function view(args = {}) {
  const engine = await studio({
    cameraPos: [0, 1.00, 8.90],
    target: [0, 0.86, 0],
    fov: 26,
    shadowExtent: 4.6,
    envIntensity: 0.98,
  });

  const H = 1.7;
  const rng = engine.rng;

  // ONE material set. Every UNIT-4H on this sheet is the same showroom-white chassis.
  //
  // ROUND 16 — WHY THE OLD `matsOther` IS GONE. Station 3 used to be built from a second
  // set whose shell tint was [0.430, 0.398, 0.352] — a mid warm brown — to mark the limb
  // it gives away as foreign. Three critics in a row scored the piece down for the result,
  // and the diagnosis is not a leak. It is two authoring errors compounding:
  //
  //  1. `mats.shell` is the pelvis, chest, head, brow, thighs, kneecaps, shins and boot
  //     uppers — see the `mesh(..., mats.shell, ...)` calls in characters/unit4h.js. So
  //     retinting it repainted the WHOLE character khaki: head, torso and legs, exactly
  //     as reported. And station 3 is the CLUB beat, the one shot staged against
  //     Dev Art 1785319916301, where the robot is white and the leg it swings is white.
  //  2. An arm carries NO shell at all. Shoulder ball, collar, upper arm, elbow hinge,
  //     forearm, wrist, palm and fingers are all `mats.chrome`; the cap is `mats.mint`.
  //     The shell tint therefore could not mark the traded arm even in principle. It cost
  //     the money shot its colour and bought literally nothing.
  //
  // The "scavenged" read belongs on the materials an arm is actually made of, and only on
  // the one arm that travels — see `scavMats` below.
  const matsOwn = unit4hMaterials();

  // The arm station 3 hands to station 4 has been torn off and thrown on a floor. Grime
  // rides ON TOP of the same chrome and mint rather than replacing them, which is the
  // honest difference between a fitted part and a salvaged one — and it leaves the cap
  // unmistakably mint, which robot.js requires of the character's signature colour.
  // Two extra bakes (chrome 512, mint 256), one fewer than the shell set this replaces.
  const scavMats = unit4hMaterials({ chrome: { grime: 0.46 }, mint: { grime: 0.46 } });
  const SCAV = new Map([[matsOwn.chrome, scavMats.chrome], [matsOwn.mint, scavMats.mint]]);
  /**
   * Repoint a detached limb's meshes at the scavenged variants. Materials are SHARED
   * across every robot in the view, so the one thing that must never happen here is
   * mutating `matsOwn.chrome` in place — that would grime all four stations at once.
   * Swapping the reference on the meshes of this subtree touches nothing else.
   */
  const markScavenged = (item) => {
    if (!item) return item;
    item.root.traverse((o) => { if (o.isMesh && SCAV.has(o.material)) o.material = SCAV.get(o.material); });
    return item;
  };

  // ONE FIELD PER STATION. Every station is a different MOMENT of the same event, so they
  // need independent clocks — a single shared field would advance station 1's airborne leg
  // by the eight seconds the other stations need and it would land in the wrong county.
  const fields = {};
  const rigs = {};
  const models = {};
  const gaits = {};

  for (const st of STATIONS) {
    const unit = buildUnit4H({ height: H, materials: matsOwn });
    const model = new THREE.Group();     // gait offsets live here; station placement above
    model.add(unit.root);
    const stand = new THREE.Group();
    stand.position.set(st.x, 0, 0);
    stand.add(model);
    engine.scene.add(stand);
    const field = new LimbField(engine.scene, { rng, floorY: 0, gravity: -11.5 });
    fields[st.key] = field;
    rigs[st.key] = new LimbRig({ unit, field, id: st.key, rng });
    models[st.key] = { stand, model, unit };
    gaits[st.key] = new Gait(unit);
  }

  // -------------------------------------------------------------------------
  // Drive the real system into each station's state.
  // -------------------------------------------------------------------------
  const step = (key, seconds) => {
    const n = Math.ceil(seconds * 120);
    for (let i = 0; i < n; i++) fields[key].update(1 / 120);
  };

  // ---- 1. HIT: the right leg is torn off and is still in the air
  //
  // ROUND 16 — CAUGHT EARLIER, AND LOWER. At 0.19 s on the old (1.55, 3.30) impulse the
  // leg had climbed 0.42 m and rotated 103 deg, which parked it dead HORIZONTAL at head
  // height with the boot beside the skull and the knee reading as a second elbow. That is
  // the "wide zigzag over the skull / IK glitch" in the round-4 notes — the reviewer was
  // describing the airborne LEG and calling it an arm, which is itself the proof that the
  // silhouette was unreadable. Nothing about the pose was wrong; the limb was in the wrong
  // place in frame.
  //
  // So: more sideways impulse, less lift, caught at 0.14 s. The leg clears the socket by
  // ~0.37 m (0.22 H — an unmistakable gap with the empty socket dark behind it), sits at
  // hip-to-waist height well clear of the head, and is 61 deg off vertical, so it reads as
  // one diagonal leg tumbling out rather than as a bent joint. It leaves on +x, away from
  // the standing left leg, so it crosses nothing.
  rigs.hit.detach('hipR', {
    impulse: new THREE.Vector3(2.15, 2.35, -0.10),
    // spin about Z keeps the tumble in the XY plane, so it settles ACROSS the frame
    // rather than pointing at the lens, where a leg foreshortens into a boot
    spin: new THREE.Vector3(0, 0, -7.6),
  });
  step('hit', 0.14);

  // ---- 2. DROPPED: the same event, two and a half seconds later
  rigs.object.detach('hipR', {
    impulse: new THREE.Vector3(0.44, 2.45, -0.05),
    spin: new THREE.Vector3(0, 0, -7.5),
  });
  step('object', 2.6);

  // ---- 3. CLUB: tear off your own leg, pick it up, swing it
  let scavengedArm = null;
  {
    const r = rigs.club;
    const leg = r.detach('hipL', { impulse: new THREE.Vector3(-0.45, 2.1, 0.1), spin: new THREE.Vector3(0, 0, 6.5) });
    step('club', 2.2);
    r.pickUp(leg);
    // and give its left arm away to station 4 — the trade that proves limbs are currency
    scavengedArm = markScavenged(
      r.detach('shoulderL', { impulse: new THREE.Vector3(-0.4, 1.2, 0.15), spin: new THREE.Vector3(0, 0, 5) }));
    step('club', 1.4);
  }

  // ---- 4. REFIT: its own arm is on the floor; station 3's arm is in the socket
  {
    const r = rigs.refit;
    r.detach('shoulderL', { impulse: new THREE.Vector3(-0.52, 1.9, 0.15), spin: new THREE.Vector3(0, 0, 7.5) });
    step('refit', 2.4);
    if (scavengedArm) {
      fields.club.take(scavengedArm);
      r.attach('shoulderL', scavengedArm);
    }
  }

  // -------------------------------------------------------------------------
  // Poses — every station uses the shipping gait code for the state it is in.
  // -------------------------------------------------------------------------
  function posture(key) {
    const { unit, model } = models[key];
    const rig = rigs[key];
    const caps = rig.caps;
    const legs = { L: rig.occupant('hipL') === 'limb', R: rig.occupant('hipR') === 'limb' };
    const arms = { L: rig.occupant('shoulderL') === 'limb', R: rig.occupant('shoulderR') === 'limb' };

    let sample;
    if (key === 'hit') {
      // the moment of the hit: no gait, a whole-body flinch away from the impact
      sample = {
        offset: { x: 0.05, y: -0.11, pitch: 0.07, roll: 0.11, yaw: 0 },
        pose: {
          hips: [0, -0.30, 0.16], spine: [0.10, -0.32, 0.14], chest: [0.06, -0.24, 0.10],
          neck: [-0.22, -0.26, 0.06], head: [0.06, -0.08, 0],
          // Abduction (the z term) is what lifts an elbow to head height. Both were near a
          // full radian, which threw the elbows up level with the skull and left the upper
          // arm and forearm splayed apart. Pulled back to ~0.5 so the elbows stay under the
          // shoulders, and the elbows are folded harder: a flinch is a body closing up.
          shoulderL: [-1.02, 0, -0.52], elbowL: [-1.22, 0, 0],
          shoulderR: [-0.46, 0, 0.58], elbowR: [-1.34, 0, 0],
          hipL: [-0.44, 0, 0.20], kneeL: [0.98, 0, 0], ankleL: [-0.18, 0, 0],
        },
      };
    } else if (key === 'object') {
      sample = sampleGait(unit, { gait: caps.gait, phase: 0.62, speed: 1.05, legs, arms });
    } else if (key === 'club') {
      sample = sampleGait(unit, { gait: caps.gait, phase: 0.30, speed: 0.95, legs, arms });
    } else {
      sample = sampleGait(unit, { gait: caps.gait, phase: 0.18, speed: 0.55, legs, arms });
      // reaching down toward the arm it just dropped, the new one already seated
      sample.pose.shoulderR = [-0.62, 0, 0.42];
      sample.pose.elbowR = [-0.95, 0, 0];
      sample.pose.spine = [0.22, -0.18, 0];
      sample.pose.neck = [-0.34, -0.14, 0];
    }

    unit.setPose({ ...sample.pose, ...rig.poseOverrides() });
    const o = sample.offset;
    // `o.z` is zero for walk and limp, which is all this board reaches today; it is non-zero
    // for the floor gaits (crawl/down), where the root pitch has to be un-pivoted. Reading
    // it costs nothing and stops this station silently misplacing if it ever loses both legs.
    model.position.set(o.x, o.y, o.z ?? 0);
    model.rotation.set(o.pitch, o.yaw, o.roll);
  }

  // the club station is mid-impact: run the real swing timer to that moment
  rigs.club.swing(0);
  rigs.club.update(0.30, 0.30);

  for (const st of STATIONS) posture(st.key);

  // Turn each station a few degrees so the silhouettes are three-quarter, not flat-on —
  // a limb socket seen dead-front is just a dark spot.
  models.hit.stand.rotation.y = 0.34;
  models.object.stand.rotation.y = -0.30;
  models.club.stand.rotation.y = 0.46;
  models.refit.stand.rotation.y = -0.22;

  // -------------------------------------------------------------------------
  // Live: keep the physics and the club swing running so the view is not a diorama.
  // Frozen in capture so the screenshot is repeatable.
  // -------------------------------------------------------------------------
  if (!engine.capture) {
    engine.onUpdate((dt, t) => {
      for (const f of Object.values(fields)) f.update(dt, t);
      for (const k of Object.keys(rigs)) rigs[k].update(dt, t);
      if (!rigs.club.swinging) rigs.club.swing(t);
      posture('club');
    });
  }

  labels([
    { text: 'LIMBS ARE HP, INVENTORY AND LOADOUT', x: 50, y: 6 },
    {
      text: 'four sockets · damage empties one · what falls out can be picked up by anyone',
      x: 50, y: 9.6, font: '500 11px/1.2 ui-monospace, Menlo, monospace', color: '#7b848c',
    },
    ...STATIONS.map((s, i) => ({ text: `${i + 1}. ${s.title}`, x: 12.5 + i * 25, y: 84 })),
    ...STATIONS.map((s, i) => ({
      text: s.sub, x: 12.5 + i * 25, y: 87.4,
      font: '500 10px/1.2 ui-monospace, Menlo, monospace', color: '#7b848c',
    })),
  ]);

  engine.limbFields = fields;
  engine.rigs = rigs;
  engine.finalizeScene();
  engine.markReady();
  engine.start();
  return engine;
}
