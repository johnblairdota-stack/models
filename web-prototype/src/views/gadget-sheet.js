import * as THREE from 'three';
import { studio, labels } from './_studio.js';
import { buildUnit4H } from '../characters/unit4h.js';
import { unit4hMaterials } from '../materials/surfaces/robot.js';
import { buildGadget, GADGET_IDS } from '../gadgets/index.js';
import { LimbRig } from '../game/limbs.js';
import { sampleGait } from '../game/locomotion.js';
import { MOVE } from '../game/rules.js';

/**
 * ALL FIVE GADGET LIMBS — and what each one costs.
 *
 * Not a props shelf. Every one of these is fitted through `LimbRig.fitGadget()` /
 * `fitSkates()`, which is the same call the game makes, so each figure shows the real
 * trade: the four arm gadgets have BOLTED THEMSELVES INTO A SHOULDER SOCKET and the arm
 * that was there is gone. Rocket skates are the exception and the exception is in the
 * geometry — `buildGadget('skates')` mounts at ankle height on the robot's own legs, so
 * they are fitted OVER two legs rather than instead of them, and they cannot be worn at
 * all by a body that has lost one.
 *
 * The rig is shown one-armed on purpose. That is the point of the sheet.
 */

const ORDER = ['nailgun', 'oil', 'grapple', 'ball', 'skates'];
const TITLES = {
  nailgun: 'NAIL GUN', oil: 'OIL LOBBER', grapple: 'GRAPPLING HOOK',
  ball: 'BOUNCY BALL GUN', skates: 'ROCKET SKATES',
};
const COST = {
  nailgun: 'costs an arm', oil: 'costs an arm', grapple: 'costs an arm',
  ball: 'costs an arm', skates: 'needs both legs',
};

// Narrowed with the pull-in above. The five stands span 4 x SPACING and the outermost
// gadget adds roughly another 0.45 m per side, so at 6.40 m on a 31° lens the group needs
// to stay inside +-2.85 m or the end figures clip the frame edge — which is what 1.30 did.
const SPACING = 1.20;

export default async function view(args = {}) {
  /*
   * ⚠️ 8.60 m ON A 25° LENS PUT A HARD GREY BAND ACROSS THE BOTTOM OF THIS SHEET.
   *
   * `_studio.js`'s cyc only carries floor from z = +3.8 back; in front of that there is no
   * geometry, just the cleared background. From 8.60 m on a 25° lens the bottom ray of the
   * frame met y = 0 at z ≈ 4.4 — a metre in FRONT of where the floor starts — so the
   * nearest strip of every frame was background, and it read as a horizon line under the
   * figures. A cyc exists precisely so there is no horizon line.
   *
   * Coming in to 6.0 m and opening to 32° fixes it by geometry rather than by dressing:
   * with the axis near level the bottom ray now lands at z ≈ 3.0, comfortably on the
   * floor. It also nearly doubles the figures' area, which the old frame wasted on empty
   * headroom. Same defect as the corner artefact in `gadget.js`'s skate shot — if a studio
   * frame shows a flat, gradient-free patch, check whether the cyc reaches that far before
   * looking for anything subtler.
   */
  const engine = await studio({
    cameraPos: [0, 1.00, 6.40],
    target: [0, 0.88, 0],
    fov: 31,
    shadowExtent: 4.6,
    envIntensity: 0.98,
  });

  const H = 1.7;
  const mats = unit4hMaterials();      // one shared set: five robots, one bake
  const rigs = [];

  for (let i = 0; i < ORDER.length; i++) {
    const id = ORDER[i];
    const unit = buildUnit4H({ height: H, materials: mats });
    const stand = new THREE.Group();
    stand.position.set((i - (ORDER.length - 1) / 2) * SPACING, 0, 0);
    stand.rotation.y = 0.42 - i * 0.06;
    stand.add(unit.root);
    engine.scene.add(stand);

    const rig = new LimbRig({ unit, field: null, id, rng: engine.rng });

    if (id === 'skates') {
      rig.fitSkates();
      // `LimbRig.fitSkates()` adds the skates to `unit.root` at fixed offsets, so they only
      // line up while the legs are in the rest pose — pose the legs and both skates stay
      // standing on the floor where the feet used to be. Re-parent onto the ankles with
      // `attach()`, which preserves the world matrix so the authored placement carries over
      // untouched. See the note on `feet` in `gadgets/index.js`.
      unit.root.updateMatrixWorld(true);
      unit.joints.ankleL?.attach(rig.skates.feet.L);
      unit.joints.ankleR?.attach(rig.skates.feet.R);
      unit.setPose(SKATE_POSE);
    } else {
      // the arm goes; the gadget takes the socket
      rig.fitGadget('shoulderL', id, { dropDisplaced: false });
      const sample = sampleGait(unit, {
        gait: 'walk', phase: 0.24, speed: MOVE.walk * 0.5,
        arms: { L: false, R: true }, legs: { L: true, R: true },
      });
      unit.setPose({
        ...sample.pose,
        // hold the gadget out clear of the torso so its silhouette reads, the way the
        // reference shots stage them
        //
        // ⚠️ THIS POSE IS THE SHEET'S OWN AND DOES NOT INHERIT `RIGS` FROM `views/gadget.js`.
        // `critic-gadget-5` filed the grapple figure's ~20 deg outward arm tilt as a defect
        // this sheet carries "at reduced scale", and it is easy to assume fixing the standalone
        // piece fixes the sheet too. It does not: the standalone's abduction lives in
        // `RIGS.grapple`, this one is typed here, and it was -0.34 + -0.05 = -0.39 rad
        // (22.3 deg) — MORE outward than the standalone's -0.35 the critic measured.
        //
        // Pulled to -0.26 rad (14.9 deg) rather than to the standalone's -0.16: this frame has
        // five figures at 1.20 m centres, and the abduction is doing real work here keeping
        // each gadget's silhouette off its own torso at a quarter of the standalone's scale.
        // Verified on the capture that no gadget overlaps its wearer's body after the change.
        shoulderL: [0.05, 0, -0.22], elbowL: [-0.10, 0, -0.04],
        shoulderR: [0.18, 0, 0.16], elbowR: [-0.30, 0, 0],
        neck: [-0.04, 0.10, 0],
      });
    }
    rigs.push({ id, rig, unit, stand });
  }

  // Fire them all at t=0 so a capture catches every effect live. NOT at 0.4: shoot.mjs
  // captures after settle(12), i.e. t ~ 0.20 s, so a trigger primed at 0.4 leaves the oil
  // lobber's `since = t - t0` negative and its whole burn — arc, spray, pilot, splash —
  // invisible in the frame. Same defect and same fix as `views/gadget.js`; see the note
  // there for what it cost that piece.
  for (const r of rigs) r.rig.fireWeapon(r.id, 0);
  engine.onUpdate((dt, t) => {
    for (const r of rigs) {
      r.rig.update(dt, t);
      if (Math.floor(t / 2.2) !== Math.floor((t - dt) / 2.2)) r.rig.fireWeapon(r.id, t);
    }
  });
  // in capture the clock is frozen at boot, so tick the gadgets to a chosen moment
  if (engine.capture) for (const r of rigs) r.rig.update(0.18, 0.58);

  labels([
    { text: 'GADGET LIMBS — EACH ONE OCCUPIES A SOCKET', x: 50, y: 6 },
    {
      text: 'fitted through the same LimbRig call the game uses · the arm is gone, not stowed',
      x: 50, y: 9.6, font: '500 11px/1.2 ui-monospace, Menlo, monospace', color: '#7b848c',
    },
    ...ORDER.map((id, i) => ({ text: TITLES[id], x: 10 + i * 20, y: 84 })),
    ...ORDER.map((id, i) => ({
      text: COST[id], x: 10 + i * 20, y: 87.4,
      font: '500 10px/1.2 ui-monospace, Menlo, monospace', color: '#7b848c',
    })),
  ]);

  engine.rigs = rigs;
  engine.finalizeScene();
  engine.markReady();
  engine.start();
  return engine;
}

/** The carving lean from Dev Art 1785314396477. */
const SKATE_POSE = {
  spine: [0.14, 0.30, -0.18], chest: [0.06, 0.16, -0.10],
  shoulderL: [-0.80, 0.25, 0.60], elbowL: [-0.40, 0, 0],
  shoulderR: [0.60, -0.20, -0.90], elbowR: [-0.60, 0, 0],
  hipL: [-0.24, 0, 0.12], kneeL: [0.34, 0, 0],
  hipR: [0.20, 0, -0.14], kneeR: [0.46, 0, 0],
  neck: [-0.12, 0.16, 0],
};

export { GADGET_IDS };
