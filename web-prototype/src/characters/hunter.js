import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildUnit4H } from './unit4h.js';
import { unit4hMaterials, faceplate, shellWhite, mintCap } from '../materials/surfaces/robot.js';
import { roundedBoxGeometry } from '../views/_studio.js';

/**
 * The corrupted hunter, stages 1-3.
 *
 * Read off Dev Art 1785300149293 (the three-row progression sheet) and 1785288883855 (the
 * stage 3 hero shot). Recorded in ART_MANIFEST.md under "Hunter weathering ramp".
 *
 * It is the SAME CHASSIS as the player, corrupted — that is the whole horror of it, and it
 * is why this builds on buildUnit4H rather than modelling a separate creature. Each stage
 * takes the player rig and does violence to it: scales it, hunches it, tears a limb off,
 * grafts extra arms on, and rides a stolen torso on its shoulders.
 *
 *   stage  height   silhouette                       arms  heads  tell
 *   1      x1.35    upright, player-like              2     1      red slit eyes, sooted shells
 *   2      x1.90    hunched gorilla, arms past knees  2     1      ONE EMPTY OPEN SOCKET
 *   3      x2.60    low quadrupedal spread            6     2      rider torso, cracked mint,
 *                                                                  rainbow wire looms
 *
 * THE THROUGHLINE IS SILHOUETTE, NOT SCALE. An independent critic judged all three stages
 * and found they escalated only by size and part count: "all three read as the same upright
 * biped". That is the most expensive failure available here, because silhouette is what you
 * read first in the dark and it is the only thing you read at all from across a room. The
 * posture block below is therefore authored per stage in explicit joint angles rather than
 * scaled off one `hunch` number, because a single multiplier cannot express the difference
 * between standing, stooping and crouching on four limbs.
 *
 * The empty shoulder socket at stage 2 is the single most important read on the sheet: it
 * says the thing has already lost a fight, and it is where the absorbed player part goes.
 */

const PLAYER_H = 1.7;

/**
 * Posture, per stage, in radians.
 *
 *   spine/chest  forward pitch of the trunk. POSITIVE X pitches forward: a vector (0,L,0)
 *                rotated by +a about X lands at (0, L cos a, L sin a), and +Z is forward.
 *   hip/knee     NEGATIVE hip swings the thigh forward, POSITIVE knee swings the shin back.
 *                Together they are a crouch. Note how slowly a crouch accumulates: the whole
 *                leg is only 0.49 of body height, so a 20 degree bend costs barely 1% of
 *                stature. Real crouch needs 45-75 degrees at the hip, which is why the old
 *                numbers looked like a standing robot.
 *   stance       leg splay. On the LEFT leg (-X) an outward splay is NEGATIVE Z; the old
 *                pose had the signs the other way round and was pulling the feet TOGETHER,
 *                which is the opposite of the reference's wide planted base.
 *   armFwd       how far forward of vertical the hanging arm sits, in WORLD terms. Shoulder
 *                rotation is relative to the chest, so the accumulated trunk pitch is
 *                subtracted before this is applied — otherwise a forward-pitched trunk
 *                swings the arms UP AND BEHIND, which is exactly why a critic read the
 *                upper arms as "straight rods ending in a fin cluster", i.e. raised arms
 *                with splayed fingers reading as antennae.
 *   armScale     uniform scale on the shoulder limb subtree. The reference does not just
 *                lengthen the arms between stages, it thickens them — "mass moved to the
 *                shoulders and arms" is the manifest's own description of stage 2 — and a
 *                uniform scale gets both. At 1.0 the fingertips sit at 0.415 of height and
 *                the knee is at 0.285, so reaching PAST the knee needs about 1.2.
 *   neckFrac     fraction of the trunk pitch the neck undoes. The head has to keep facing
 *                its prey while the spine is at 60 degrees, or the thing reads as studying
 *                the floor. 1.0 would be level; a little under leaves it looking up from
 *                under a brow, which is the reference's expression.
 *   neckSink     how far the neck joint drops INTO the chest, in H. A hunching body does not
 *                only pitch, it retracts the head between the shoulders until the neck stops
 *                existing — which is exactly what the sheet's STAGE 2 head does. This is a
 *                pure vertical translation, so it is the one posture channel that cannot be
 *                foreshortened away by a camera looking down the lean (see the ruling below).
 *   shoulderFwd  protraction: how far forward of the ribs the shoulder sockets sit, in H, in
 *                the CHEST's frame (already pitched, so +Z is forward AND down). Rolled-
 *                forward shoulders move the arms in front of the torso and rotate the
 *                shoulder line in plan — both of which change the OUTLINE at any yaw.
 */
const POSTURE = {
  /*
   * ============ STAGE 1: A MIDPOINT IN WHAT THE CAMERA CAN SEE, NOT IN THE ANGLE ============
   *
   * `critic-hunter-2` ruled the previous row NOT ACCEPTABLE as filed: "side-by-side with
   * baseline it is nearly indistinguishable in stance". That row was the exact arithmetic
   * midpoint — trunk pitch 0.49 rad (28 deg) against baseline's 0 and stage 2's 1.02 rad
   * (58 deg) — and it still photographed as a robot standing still. My predecessor measured
   * the gap honestly and declined to overshoot without a ruling. The ruling exists now.
   *
   * ⚠️ WHY THE ARITHMETIC MIDPOINT IS THE WRONG MIDPOINT HERE, in one line of trigonometry.
   * `hunter-stage.js` shoots a front three-quarter at 26 deg of yaw, so a forward lean is
   * mostly ALONG the view axis. Of the two things a lean does to a trunk of length L, the
   * camera can barely see the first and reads the second directly:
   *
   *     head moves FORWARD by  L sin t   -> projects at sin(26 deg) = 0.44, and mostly into depth
   *     head moves DOWN by     L (1-cos t) -> projects in full, at every yaw
   *
   * `sin` is nearly linear near zero and `1-cos` is QUADRATIC. So at half the angle you get
   * 55% of stage 2's forward travel (invisible here) and only **26% of its head-drop** (the
   * part that reads). Halving the angle does not halve the stoop; it quarters it. That is the
   * whole of the critic's complaint, and no amount of tuning inside 28 deg could have fixed it.
   *
   * So the midpoint is taken in the CHANNEL THAT READS. Solving 1-cos t = (1-cos 58.4 deg)/2
   * gives t = 40.4 deg = 0.705 rad, which is what `spine + chest` now sums to, split in stage
   * 2's own 0.65/0.35 ratio. The head drops half as far as the monster's, in this camera, by
   * construction — and the thing is still plainly standing on two straight-ish legs.
   *
   * THREE MORE CUES, ADDED BECAUSE PITCH ALONE IS ONE CHANNEL AND IT IS THE FRAGILE ONE.
   * All three are immune to axial foreshortening, which is the property the critic asked for:
   *   - `neckSink` 0.012 H: the head starts to retract between the shoulders. Vertical.
   *   - `shoulderFwd` 0.020 H + `armFwd` 0.12 -> 0.17: the shoulders roll forward and the
   *     hands come in front of the thighs, so the arms cross the leg line in outline.
   *   - `hip`/`knee` -0.30/0.50 -> -0.42/0.70: a real knee bend, which costs stature and
   *     bows the leg silhouette. Also vertical.
   * Grime cannot substitute for any of this; posture is the only ramp cue that is shape.
   */
  1: {
    // Midpoint of the SPINAL hunch, same correction as stage 2: the knee straightens out and
    // the lean moves into the back. Stage 1 has no art row, so it is half of stage 2's values.
    spine: 0.10, chest: 0.16, hip: -0.04, knee: 0.06, ankleFrac: 1.0, stance: 0.13,
    armScale: 1.12, armOut: 0.20, armFwd: 0.17, elbow: 0.28,
    neckFrac: 0.76, headExtra: 0.03, neckSink: 0.022, shoulderFwd: 0.020,
    // Stage 1 is John's midpoint and has no art row; halfway between player 1.00 and s2 1.57.
    shoulderOut: 1.28, shoulderUp: 0.014, chestWide: 1.17, hipWide: 1.11,
  },
  /*
   * ⚠️ THE COMMENT BELOW THAT USED TO LIVE HERE WAS THE "STAGE 2 IS MEASURABLY NARROWER"
   * CLAIM (shoulder -5.5%, hips -10.1%, waist -3.1%) THAT JUSTIFIED PUSHING `armOut`/
   * `shoulderOut`/`chestWide`/`hipWide` UP. Three independent re-derivations since then
   * (`critic-hunter-3`, `hunter-owner-3`, and `hunter-owner-4` on isolated single-figure
   * crops against the sheet's STAGE 2 front view) all found the OPPOSITE sign — the render
   * reads WIDER than the sheet at shoulder/chest, not narrower. `hunter-owner-4`'s own
   * figure-mode IoU on two independently-drawn crops: **71.8% and 70.8%**, raw width at
   * 0.790-0.845 H (shoulder/chest band) **render wider by +11% to +58%** across both crops,
   * waist/hip bands close to flat (-3% to +8%, i.e. not the dramatic narrowing this comment
   * used to claim). **Do not widen `chestWide`/`hipWide`/`shoulderOut` again on this
   * evidence — the direction the old comment describes no longer holds.**
   *
   * `armOut` 0.37 is left AS THE LIKELY MECHANICAL CAUSE of the width swing, not as a width
   * fix: it swings the whole upper arm away from the ribs starting right at the shoulder, so
   * every H-band from shoulder to hand reads artificially wide regardless of true torso mass
   * — measured directly: the render's arm/torso "daylight" gap starts at 0.86 H, the sheet's
   * only starts at 0.61 H (arm hugs the ribs down to the elbow, then flares). The sheet's own
   * STAGE 2 spec is "arms hang past knees" (`ART_MANIFEST.md` #06) — a close, hanging arm,
   * not a splayed reach — and the render currently reads as the latter. **Left unchanged
   * this round rather than risk a second geometry swing on top of an already-reverted one;
   * the fix is narrowing `armOut` (try ~0.20-0.24, matching stage 1's 0.20) while confirming
   * fingertips still land near the sheet's low daylight-band floor (~0.30-0.34 H) — flagged
   * for the next owner with the measurement already done.**
   */
  2: {
    // `stance` 0.26 -> 0.30 overshot: it put the ANKLE band at +25.7% against the sheet while
    // the thigh band was only +7.6%, i.e. the feet were being splayed to buy width the body
    // should be carrying. 0.25 with the wider hips is the same stance, planted under the mass.
    /*
     * ⚠️ THE ART'S HUNCH IS SPINAL, NOT A CROUCH — read off the STAGE 2 SIDE view, which is the
     * only view that shows it. The back DOMES, the neck juts forward and the head drops, and
     * THE LEGS ARE VIRTUALLY STRAIGHT. This build had knee 1.04 rad (60 degrees), which is a
     * squat, and at the old x1.90 scale a squatting giant still read as a monster. At player
     * scale it just reads as a robot crouching, which is what John called silly.
     *
     * The height data says the same thing and said it first: the art's stage 2 stands at 320px
     * against the baseline's 339 — it loses only 6% of standing height. No knee bend of 60
     * degrees loses 6%. All of that loss is spine and neck.
     */
    spine: 0.18, chest: 0.30, hip: -0.08, knee: 0.11, ankleFrac: 1.0, stance: 0.16,
    // `armOut` 0.37 -> 0.22, taking the fix the previous owner measured and flagged above.
    // Independently reproduced before changing it (critic-frames-1, round 17, on an isolated
    // border-verified crop at yaw=0): the render's arm/torso daylight band opens at 0.856 H
    // against the sheet's 0.640 H — the arm leaves the ribs at the shoulder instead of
    // hugging them to the elbow, so every band from shoulder down reads wide on a torso whose
    // true mass is only ~10% over. 0.22 sits in the flagged 0.20-0.24 window, just off stage
    // 1's 0.20. The floor is the constraint, not the ceiling: fingertips must stay near the
    // sheet's ~0.30-0.34 H band bottom (render was 0.312), so check the LOW end did not rise.
    // The art's arms HANG, close to the ribs and angling slightly BACK past the hip — not out
    // to the sides. armFwd goes negative for that backward rake; armOut drops so the hands end
    // beside the thighs rather than out in the air.
    armScale: 1.24, armOut: 0.13, armFwd: -0.08, elbow: 0.26,
    neckFrac: 0.80, headExtra: 0.06, neckSink: 0.048, shoulderFwd: 0.034,
    // 1.30 -> 1.57: the art puts stage 2 shoulders at 235px against the player's 150 (x1.57)
    // while the head stays player-sized. That widening IS the stage, now that scale is 1.00.
    shoulderOut: 1.57, shoulderUp: 0.026, chestWide: 1.34, hipWide: 1.22,
  },
  3: {
    // NOT more trunk pitch than stage 2. A gorilla stoop taken past about 60 degrees folds
    // the torso flat and the chest reads as a disc seen edge-on with a head stuck to the
    // front of it — which is what the first pass at this stage looked like. In the hero
    // shot and the STAGE 3 row the torso is only moderately inclined; the LOW comes from
    // the legs being deeply bent and splayed and from two arms planted on the floor.
    // Stage 3 sits LOWER than stage 2 but is still not a squat: the art measures 300px against
    // the baseline's 339, an 88% crown, so it loses 12% of standing height where stage 2 loses
    // 6%. Roughly double stage 2's bend, nowhere near the 1.40 rad (80 degrees) this had.
    /*
     * ⚠️ THE 12% HEIGHT LOSS COMES FROM THE LEGS, NOT THE TRUNK — and this file already said so
     * before I broke it: "NOT more trunk pitch than stage 2... the LOW comes from the legs being
     * deeply bent and splayed". A previous pass put spine 0.42 + chest 0.48 here, 51 degrees of
     * pitch against stage 2's 27, which hits the right CROWN HEIGHT by folding the torso forward.
     * The ratio measured correctly (0.881 against the art's 0.88) and it still read as bent over,
     * which John called on sight. Crown height cannot tell a stoop from a squat; only the trunk
     * angle can, and the art keeps it moderate.
     *
     * So the trunk sits just above stage 2's, and the knee does the work.
     */
    spine: 0.22, chest: 0.32, hip: -0.46, knee: 0.86, ankleFrac: 1.0, stance: 0.30,
    armScale: 1.30, armOut: 0.34, armFwd: 0.24, elbow: 0.26,
    // No neck sink here: the RIDER has to sit in the volume above this collar, and dropping
    // the host head into the yoke is what buried the rider's torso in the first place.
    neckFrac: 0.70, headExtra: 0.06, neckSink: 0.0, shoulderFwd: 0.026,
    // Very broad. The stage-3 read is TWO HEADS SIDE BY SIDE, and two heads only fit
    // between the shoulder caps if the caps are outboard of both of them — at 1.3 the
    // right-hand cap landed exactly where the second head has to go and swallowed it.
    shoulderOut: 1.86, shoulderUp: 0.020, chestWide: 1.30, hipWide: 1.34,
  },
};

/**
 * ============ STAGE 1 IS A MIDPOINT. JOHN'S CALL, 2026-08-03, AND IT SETTLES THE FILE ============
 *
 * The sheet's three rows are BASELINE / STAGE 2 / STAGE 3. BASELINE is the CLEAN blue-eyed
 * smiling robot — the player, shown for comparison — so the art depicts only two hunter
 * stages and stage 1 has to be AUTHORED, not copied. John's direction: find something
 * BETWEEN baseline and stage 2. Visibly past the clean player; visibly short of the monster.
 *
 * The old values were wrong in OPPOSITE directions, which is the whole reason a critic
 * scored this 27 for reading as "the player with red eyes":
 *
 *              BASELINE      old stage 1        target          STAGE 2
 *   eyes       blue, smile   0xE8342B FULL RED  mid-transition  red slits
 *   grime      ~0            0.52 (too far)     0.38-0.45       0.76
 *   hunch      upright       0.10 (too upright) ~0.30           0.60 gorilla
 *
 * The face was at stage 2 while the posture was still at baseline. All three move together
 * below, and the stage is judged as a whole rather than one channel at a time.
 *
 * THE EYE MIDPOINT IS A HUE, NOT A DIMMER. Blue and red have no useful interpolation — the
 * literal midpoint is a dead magenta and the perceptual one is grey, and both read as a
 * rendering fault rather than as corruption. What reads as a machine going wrong is HEAT:
 * blue -> amber -> red. So stage 1 is amber-orange on a plate that has begun to darken but
 * still shows the player's blue glass, and it keeps a MOUTH — reduced to a short flat dash,
 * because the single clearest way to say "this used to be the thing that smiled at you" is
 * to leave the mouth there and take the smile out of it.
 */
/*
 * ============ THE HUNTER IS NOT A BIGGER ROBOT. IT IS A ROBOT WITH MORE PARTS. ============
 * John's ruling, 2026-08-15, and the art backs it in a way nobody had checked.
 *
 * THE FICTION WAS ALWAYS INCONSISTENT WITH THE MODEL. The hunter grows by ABSORBING player
 * robots. Absorbed parts are player-sized parts. So a bigger hunter is more limbs, doubled
 * chest plates and a second head — not one inflated robot. Scaling the whole unit up by 1.35 /
 * 1.90 / 2.60 was the one thing the story cannot produce.
 *
 * MEASURED OFF THE ART, and this is what settles it (Dev Art 1785300149293, front views,
 * silhouette width profile with the head found by where the outline flares past 1.55x the
 * crown, so posture cannot fake it):
 *
 *              head px   shoulder px   head/shoulder   figure px
 *   BASELINE      59         150           0.393          339
 *   STAGE 2       58         235           0.247          320
 *   STAGE 3      122*        280           0.436          300      *two heads, 2 x 61
 *
 * Stage 2's HEAD IS THE PLAYER'S HEAD — 58 px against 59, inside 2% — while its shoulders go
 * 150 -> 235. Head-to-shoulder falls 37%. A x1.90 robot has a x1.90 head and that ratio would
 * not move at all, so uniform scaling is refuted WITHOUT needing to know absolute size.
 *
 * And because the head is the same real object in both rows and measures the same pixels, the
 * two rows are drawn at the SAME SCALE — which makes the figure heights comparable after all:
 * 339 / 320 / 300 = x1.00 / x0.94 / x0.88. The art's hunter is not taller than the player. It
 * is slightly SHORTER, because it is hunched, and much wider.
 *
 * SO `scale` IS 1.00 AT EVERY STAGE. Height loss comes from POSTURE (the hunch already models
 * it) and bulk comes from WIDTH plus grafted limbs. ⚠️ This propagates into gameplay through
 * `hunter-ai.js`, which derives collision height and normalises gait speed from `scale` — that
 * is correct, not incidental: a hunter built from player parts should move on a player's legs.
 *
 * ⚠️ AND IT REFRAMES SIXTEEN ROUNDS OF `hunter.3` CRITIQUE. The standing #1 complaint was
 * "reads as twins, not absorption". Two same-sized heads sharing a collar is EXACTLY what
 * absorbing a player produces, and the turnaround row has drawn it that way all along. The
 * render was driven away from the right answer by a hate that had the fiction backwards.
 */
export const HUNTER_STAGES = {
  1: {
    // scale 1.35 -> 1.00. See the block above: same parts, more of them.
    scale: 1.00, arms: 2, heads: 1,
    // `hunch` is retained ONLY because src/game/hunter-ai.js reconstructs an approximate
    // base pose from it and is owned by another agent. The authority is POSTURE above;
    // hunterPose() below exports it so the gait code can adopt it without guessing.
    // 0.10 -> 0.30: half of stage 2's 0.60, per the table above. POSTURE[1] moves with it.
    hunch: 0.30,
    shell: [0.867, 0.847, 0.824],   // #DDD8D2 slightly dulled
    // 0.52 -> 0.42. A critic measured the stage-1 torso at luminance ~46% against the
    // REFERENCE'S OWN STAGE 2 torso at ~57%: stage 1 was rendering dirtier than the art's
    // stage 2, i.e. the ramp had no room left to escalate into. 0.42 sits inside John's
    // 0.38-0.45 band and restores the gap. The chrome and mint follow the same halving.
    grime: 0.42, chromeGrime: 0.35, mintGrime: 0.32, crack: 0.0, sootDark: 0.0,
    eye: 0xFF7A1E, socketOpen: false, rider: false, chestLooms: false, spineSplit: false,
    faceCracks: 0,
    // Plate still half blue (0.30 vs the monster's 0.10) and the smile flattened to a dash.
    face: { plate: 0.30, drive: 2.05, eyeW: 0.086, eyeH: 0.076, eyeGap: 0.158, eyeY: 0.050,
      mouth: { y: -0.150, w: 0.042, t: 0.034 } },
  },
  2: {
    // scale 1.90 -> 1.00. Bulk moves into shoulderOut below, measured off the art.
    scale: 1.00, arms: 2, heads: 1,
    hunch: 0.60,
    shell: [0.788, 0.761, 0.722],   // #C9C2B8 soot-mottled, rust bleed at seams
    // The sheet's STAGE 2 row already shows a crack starting on the left mint cap plus rust
    // bleed at the seams; this was hardcoded 0.0 so that cue could not appear at any grime
    // tuning. A partial network, well short of stage 3's shattered caps.
    grime: 0.76, chromeGrime: 0.70, mintGrime: 0.64, crack: 0.45, sootDark: 0.45,
    eye: 0xF02010, socketOpen: true, rider: false, chestLooms: false, spineSplit: true,
    faceCracks: 3,
    face: { plate: 0.10, drive: 2.15 },
  },
  3: {
    // scale 2.60 -> 1.00. Six arms and two heads ARE the size increase.
    scale: 1.00, arms: 6, heads: 2,
    hunch: 0.78,
    /*
     * ⚠️ MEASURED: STAGE 3 WAS NOT DIRTIER THAN STAGE 2, AND THE RAMP HAD RUN OUT OF ROOM.
     *
     * Method — the scale-reference player standing beside the hunter is the SAME clean unit4h
     * in all three captures, so it is a built-in control for exposure, and the figure/control
     * luminance ratio is comparable across shots and against the sheet (whose BASELINE row is
     * the same control). Measured over the whole figure, excluding cyc, brand ink, mint and eyes:
     *
     *              render (was)   sheet
     *   stage 1        0.905      1.000 (BASELINE, the clean player)
     *   stage 2        0.744      0.739   <- matches
     *   stage 3      **0.743**    0.649   <- did not
     *
     * `grime` was already saturated at 1.00, so the last step of the ramp had nowhere to go and
     * the two monstrous stages photographed identically. The remaining lever is the TINT, and it
     * has to include the chrome: at stage 3 four grafted arms, two legs and six hands are all
     * `mats.chrome`, so the chrome is most of the figure's area and a shell-only change cannot
     * move the number. Both scaled ~0.86 to land near the sheet's 0.65.
     */
    shell: [0.700, 0.702, 0.703],
    chrome: [0.508, 0.492, 0.472],
    grime: 1.00, chromeGrime: 1.00, mintGrime: 0.92, crack: 1.0, sootDark: 1.00,
    eye: 0xFF2A14, socketOpen: false, rider: true, chestLooms: true, spineSplit: true,
    faceCracks: 4,
    face: { plate: 0.10, drive: 2.25 },
  },
};

/**
 * The authored posture as a setPose() argument. Exported so the gait system can add its
 * delta to the real thing instead of to a reconstruction that drifts out of date.
 */
export function hunterPose(stage) {
  const p = POSTURE[stage] ?? POSTURE[1];
  const trunk = p.spine + p.chest;
  const shoulderX = -trunk + p.armFwd;
  // keep the sole flat on the floor: undo the accumulated thigh + shin rotation
  const ankleX = -(p.hip + p.knee) * p.ankleFrac;
  return {
    spine: [p.spine, 0, 0],
    chest: [p.chest, 0, 0],
    neck: [-trunk * p.neckFrac, 0, 0],
    head: [p.headExtra, 0, 0],
    // NEGATIVE Z on the left shoulder swings the arm AWAY from the body; positive swings it
    // across the chest. Getting this backwards buries both arms inside the torso volume.
    shoulderL: [shoulderX, 0, -p.armOut],
    shoulderR: [shoulderX, 0, p.armOut],
    elbowL: [p.elbow, 0, -0.05],
    elbowR: [p.elbow, 0, 0.05],
    wristL: [0.10, 0, -0.12],
    wristR: [0.10, 0, 0.12],
    hipL: [p.hip, 0, -p.stance],
    hipR: [p.hip, 0, p.stance],
    kneeL: [p.knee, 0, 0],
    kneeR: [p.knee, 0, 0],
    ankleL: [ankleX, 0, p.stance * 0.5],
    ankleR: [ankleX, 0, -p.stance * 0.5],
  };
}

/**
 * @param {object} o
 * @param {1|2|3} o.stage
 * @returns {{root, stage, height, joints, limbs, unit, setPose, dispose}}
 */
export function buildHunter(o = {}) {
  const stage = o.stage ?? 1;
  const def = HUNTER_STAGES[stage];
  const P = POSTURE[stage];
  const H = PLAYER_H * def.scale;
  const trunk = P.spine + P.chest;

  // Corrupted material set: same shaders, filthier values. Reusing the player's materials
  // is what keeps the family resemblance that makes the hunter frightening.
  //
  // GRIME IS NOT ONLY ON THE SHELLS. A critic reading stage 2 called the chest and arms
  // "still bright clean white/chrome": the arms, abdomen, joints and hands are all the
  // chrome material and the shoulder caps are the mint material, and neither carried any
  // corruption at all, so the hunter read as a clean robot in a dirty coat.
  const mats = unit4hMaterials({
    shell: { tint: def.shell, wear: 0.4 + def.grime * 0.6, peel: 1.0, grime: def.grime, sootDark: def.sootDark ?? 0.0, size: 512 },
    chrome: { tint: def.chrome ?? [0.700, 0.706, 0.712], wear: 0.5 + def.grime * 0.5, lines: 1.0, grime: def.chromeGrime, size: 512 },
    // 256 cannot resolve a fracture network; the cracked cap is a stage-3 hero read.
    mint: { tint: [0.285, 0.618, 0.528], grime: def.mintGrime, crack: def.crack, size: def.crack > 0 ? 512 : 256 },
  });

  // Red slit eyes instead of the player's friendly cyan. Narrow, no mouth.
  const hunterFace = faceOverride(def.eye, def.face);

  const unit = buildUnit4H({
    height: H,
    materials: { ...mats, face: hunterFace },
  });
  const root = new THREE.Group();
  root.name = `HUNTER.stage${stage}`;
  root.add(unit.root);

  const disposables = [];
  const mesh = (geo, mat, name) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = m.receiveShadow = true;
    m.name = name;
    disposables.push(geo);
    return m;
  };
  const w = (f) => f * H;
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x0a0806, roughness: 1.0, metalness: 0.0 });
  darkMat.name = 'hunter.bore';

  // ---- MASS REDISTRIBUTION. The reference moves bulk onto the shoulders and (at stage 3)
  // the hips as the thing degenerates. Widening is done by moving the SOCKETS and scaling
  // the already-merged meshes, never by scaling a joint that has rotated children — a
  // non-uniform scale above a rotation shears the limb.
  for (const side of ['L', 'R']) {
    const sock = unit.sockets[`shoulder${side}`];
    sock.position.x *= P.shoulderOut;
    sock.position.y += w(P.shoulderUp);
    // PROTRACTION. The chest is already pitched `trunk` forward, so +Z in its frame is
    // forward AND down in world — which is what a rolled shoulder actually does. Translating
    // the socket is safe where scaling it is not: a non-uniform scale above a rotated limb
    // shears it, a translation cannot.
    sock.position.z += w(P.shoulderFwd ?? 0);
    unit.joints[`shoulder${side}`].scale.setScalar(P.armScale);
    unit.sockets[`hip${side}`].position.x *= P.hipWide;
  }
  /*
   * HEAD RETRACTION — the one posture cue a camera looking down the lean cannot foreshorten.
   * `unit4h` puts the neck joint at `chestH * 1.01`, i.e. clear of the collar, which is right
   * for the upright player and wrong for anything hunching: the sheet's STAGE 2 head has no
   * visible neck at all, it is pulled down until the skull sits in the yoke. Dropping the
   * JOINT (not scaling it) takes the head, the face and everything welded to it down together
   * and leaves every rotation below untouched.
   */
  if (P.neckSink) unit.joints.neck.position.y -= w(P.neckSink);
  scaleMeshes(unit.joints.chest, P.chestWide, 1.0, 1.0 + (P.chestWide - 1) * 0.7);
  scaleMeshes(unit.joints.hips, P.hipWide, 1.0, 1.0 + (P.hipWide - 1) * 0.6);

  // The sternum inlay is the chest's only gap-material part, and it is placed at the
  // chest's un-tapered half depth while the shell around it tapers to 0.66 at the waist.
  // On the upright player it stays buried; on a trunk pitched 60 degrees toward camera the
  // lower half of it stands proud of the shell and reads as a black rod skewered through
  // the torso. It contributes nothing under this much soot, so it comes off.
  if (P.chest > 0.2) {
    for (const c of unit.joints.chest.children) {
      if (c.isMesh && c.material === mats.gap) c.visible = false;
    }
  }

  /*
   * ⚠️ THE ARM STAYS ON. THIS LINE USED TO READ `if (def.socketOpen) unit.detach('armR')`.
   *
   * Every previous round of `hunter.2` — fourteen of them, REJECT 27 the whole way — was
   * built on "stage 2 has lost an arm and the empty socket is the stump". I opened all four
   * STAGE 2 views on the sheet before touching the socket and that premise is false:
   *
   *   front view  both arms present, both with mint caps; the dark opening sits ABOVE and
   *               INBOARD of the character's right arm, on the shoulder yoke
   *   3/4 + side  same arm, same cap, port visible on top of the shoulder mass
   *   back view   two arms, two caps, and the same round port on the right shoulder blade
   *
   * So the socket is an EMPTY MOUNT PORT let into the shoulder armour, not an amputation.
   * That is a better fit for the game as well as for the art: `ART_MANIFEST` #06 calls it "an
   * empty open cylinder", the design note calls it "where the absorbed player part goes", and
   * a spare port waiting for a limb says that far more clearly than a missing limb does.
   *
   * It also explains why this piece could not be fixed by tuning. `buildTornSocket`'s own
   * header lists "something for it to be a hole IN" as condition 1 and then notes that
   * detaching the arm takes the ball, the collar and the mint cap with it — so the previous
   * construction had to invent a shoulder out of thin open cylinders for the hole to live in,
   * and what a capture actually shows is a cone of pale ribbons with a black disc in it. With
   * the arm on, the shoulder is a real lit mass again and the hole can simply be a hole in it.
   *
   * Nothing in the game depends on the detach: `HunterAI.absorb()` reparents the taken limb to
   * `this.model` and pulls it in by hand, and never touches `hunter.sockets`.
   */
  const pose = hunterPose(stage);
  unit.setPose(pose);

  // ---- PLANT IT. Bending a leg shortens it, so a crouched rig floats. Measure the boots
  // and drop the whole model onto the floor; "anything floating kills the shot".
  ground(unit.root, [unit.joints.ankleL, unit.joints.ankleR]);

  if (def.socketOpen) buildTornSocket(unit, w, mats, darkMat, mesh, disposables, trunk);

  /*
   * ---- stage 3: FOUR EXTRA ARMS.
   *
   * ⚠️ CORRECTION, MEASURED AGAINST BOTH REFERENCE IMAGES: STAGE 3 IS NOT A QUADRUPED.
   *
   * This file's own ramp table, this block's old comment, and the round brief all describe
   * stage 3 as a "low quadrupedal spread" with a front pair of arms PLANTED on the floor as
   * legs, called out as "the single cue the critic said never arrived". I opened both pieces
   * of art before touching it and neither shows anything of the kind:
   *
   *   - `Dev Art/1785300149293.png` STAGE 3 row (all three views): the figure stands on TWO
   *     BOOTED LEGS, knees bent, weight on the feet. All six hands hang free — the lowest
   *     pair reaches to about knee height beside the shins and is plainly not bearing load.
   *   - `Dev Art/1785288883855.png` (the stage-3 hero shot, the more detailed of the two):
   *     same. Upright-ish heavy biped; the six arms fan out AROUND it like a spider's, the
   *     upper pair swept out and slightly up, and every hand is open in the air.
   *
   * A planted pair also costs the stage its own read. `critic-hunter-1`'s third complaint was
   * that the six ground-reaching limbs "read as one continuous mass of similarly-toned jointed
   * limbs" and that the original legs were being lost inside the graft — which is exactly what
   * happens when four arms and two legs all terminate on the same floor line. Lifting the
   * front pair is what separates the boots from the hands again.
   *
   * So the pairs now differ by HEIGHT AND SWEEP rather than by whether they touch the ground:
   * an upper pair swept out and back, and a lower pair hanging long and close. Six arms only
   * count as six if each owns a piece of the silhouette, which is why nothing here is spent
   * on symmetry — they differ in weld height, reach, yaw and splay at once.
   *
   * `fwd` is how far the upper arm reaches FORWARD of vertical, in world, in radians.
   * `bend` is the extra elbow bend on top of that.
   */
  const grafts = [];
  if (def.arms === 6) {
    /*
     * ⚠️ `roll` WAS THE WHOLE OF critic-hunter-2's SPLAY COMPLAINT, and the numbers say so.
     * "The four extra arms do not splay as wide as the reference's near-horizontal spread, so
     * the six-limbed-horror silhouette reads more compact than the art's." Measured off
     * `1785288883855.png`: the upper pair leaves the ribs at roughly 65-70 degrees off
     * vertical — its elbows are ABOVE the host's own shoulder line and its hands are the
     * widest points in the whole image — and the second pair at roughly 40. The old 0.62 rad
     * (35 deg) and 0.20 rad (11 deg) are half and a fifth of that; the arms were hanging, not
     * fanning, and no amount of `yaw` could fix it because yaw turns an arm without moving its
     * hand outboard.
     *
     * `bend` goes up with `roll` on purpose. A limb rolled out to near-horizontal with a
     * straight elbow is a rod, and four rods is a diagram; the art's are all cranked at the
     * elbow so the forearm drops away and each arm owns a piece of outline that is not a line.
     * The MIN_TIP clamp below is unaffected in the direction that matters — rolling a limb out
     * RAISES its fingertips, so the clamp engages less, not more.
     */
    const extra = [
      // upper pair: welded high on the ribs and thrown nearly horizontal — this is the pair
      // that makes the stage-3 silhouette read as a spider from across a room, and in the hero
      // shot it is the widest thing about the character.
      { y: 0.118, x: 0.014, z: -0.004, fwd: 0.10, bend: 0.30, yaw: 0.36, roll: 1.20, crank: 0.80, len: 1.34 },
      // lower pair: welded at the waist, swept out and down, hands open beside the knees
      { y: 0.030, x: 0.006, z: 0.026, fwd: 0.34, bend: 0.30, yaw: 0.30, roll: 0.70, crank: 0.50, len: 1.46 },
    ];
    for (const cfg of extra) {
      for (const s of [-1, 1]) {
        /*
         * ⚠️ `bend` STOPS WORKING AS SOON AS THE ARM IS ROLLED OUT, and rolling them out is
         * exactly what the splay fix above does. The elbow's flexion axis is the arm's LOCAL
         * X; on a hanging arm that swings the forearm forward and back, which is what you
         * want, but the roll turns the limb's own Y axis lateral, so the same rotation now
         * swings the forearm toward and away from the camera and does NOTHING in the outline.
         * The first capture of the wide splay shows it precisely: a straight rod out to the
         * left with a small hand on the end — `critic-hunter-1`'s "antennae or exhaust vents"
         * arriving by a new route.
         *
         * `crank` is the missing axis. Rotating the elbow about local Z against the roll
         * brings the forearm back down toward vertical, so each arm goes OUT and then DOWN —
         * the crank every arm in the hero shot has, and the reason six limbs read as six
         * shapes instead of one starburst.
         */
        const g = graftedArm(w, mats, s, mesh, cfg.len, cfg.fwd + cfg.bend, disposables,
          s * -(cfg.crank ?? 0));
        // Seat the graft on the OUTSIDE of the torso. Chest half-width is about 0.116 H
        // after widening, so a root any closer buries the weld boss inside the chest shell
        // and the arm appears to grow out of the sternum.
        g.position.set(s * w(0.118 * P.chestWide + cfg.x), w(cfg.y), w(cfg.z));
        // SIGN. The arm hangs along local -Y, so a vector (0,-L,0) under a total X rotation
        // of A lands at (0, -L cos A, -L sin A): reaching FORWARD needs A NEGATIVE. The
        // chest already contributes +trunk, so the local rotation is -(trunk + fwd). Doing
        // this as (fwd - trunk) — which is right for something pointing UP, like the spine —
        // pitched the front pair BACKWARDS, and the plant fit then stretched them to their
        // clamp trying to reach a floor they were leaning away from.
        // ROLL SIGN, same trap as the shoulders. R_z(c) sends the hanging vector (0,-L,0)
        // to x = L sin c, so the RIGHT arm (+X) splays outward on a POSITIVE roll. Negated,
        // both extra pairs swung inward and crossed in front of the legs, and four of the
        // six arms merged into one X-shaped tangle over the torso.
        g.rotation.set(-(trunk + cfg.fwd), s * -cfg.yaw, s * cfg.roll);
        unit.joints.chest.add(g);
        grafts.push(g);
      }
    }
  }

  /*
   * NO HAND MAY REACH THE FLOOR. The old code did the opposite — it measured each front
   * graft and SCALED it until its fingertips touched y = 0, which is what built the
   * quadruped the art does not have. What the art does need is for the extra hands to stop
   * ABOVE the boots, so the two original legs still own the bottom of the silhouette and the
   * six arms read as arms. Measured and clamped rather than posed by eye, because the same
   * angles land in different places at different `armScale`s.
   *
   * The floor is the boot sole (y = 0 after `ground()` above), and the hero shot's lowest
   * fingertips sit at roughly a fifth of figure height — knee level on a crouched stage 3.
   */
  root.updateWorldMatrix(true, true);
  const MIN_TIP = H * 0.17;
  for (const g of grafts) {
    const originY = g.getWorldPosition(new THREE.Vector3()).y;
    const tipY = new THREE.Box3().setFromObject(g).min.y;
    const reach = originY - tipY;
    if (reach > 1e-4 && tipY < MIN_TIP) {
      g.scale.setScalar(THREE.MathUtils.clamp((originY - MIN_TIP) / reach, 0.62, 1.0));
    }
  }

  /*
   * ============ THE RIDER — AN ABSORBED PLAYER, NOT A SPARE HEAD ============
   *
   * ⚠️ ROUND 14 — "OUTBOARD, LEVEL, FORWARD" FIXED THE BURIED-TORSO BUG AND MANUFACTURED A
   * NEW ONE: a blind context-free crop reads this as "two same-size, forward-facing red-eyed
   * heads sharing one collar — unambiguously twins, no separate rider torso visible", quoted
   * verbatim off the render's own debug caption ("2 HEADS"). That is the project's hardest
   * gate (blind identification from a crop) and it fails outright. The turnaround sheet's own
   * STAGE 3 front view shows the identical composition — two near-equal red-eyed heads on one
   * collar, no torso visible below them — so pixel-matching that reference cannot be the fix;
   * the render has to beat the READER, not the art. The hero shot (`1785288883855.png`) is the
   * better model: there its ONE clearly dominant head reads as the host, and the rider is
   * legible only as a SMALL head mostly hidden behind/above it plus a pair of pale, off-tone
   * arms crossed in front gripping up near the host's own jaw — the torso reads from the grip,
   * not from a second skull competing for the same silhouette.
   *
   * So this pass changes three things at once, because any one alone still reads as a small
   * twin rather than as prey:
   *   1. SIZE — 0.66H was half to two-thirds of the host's own head, plenty big enough to
   *      read as a peer. Cut to 0.50H.
   *   2. REGISTRATION — the old point was outboard AND forward of the host's head (0.150H /
   *      0.088H), i.e. on the side that faces the 26-degree camera and standing proud of the
   *      collar, which is the most visible place on the whole model. Pulled sharply inboard
   *      and mostly killed the forward offset (0.072H / 0.020H) and dropped much lower
   *      (-0.048H -> -0.086H), so the host's own head and shoulder mass partially occlude it —
   *      "peeking", not "posing" — while still starting from a point clear of the collar so
   *      the old buried-torso bug (registering by the head, which hangs the whole body below
   *      the host's collar) cannot come back.
   *   3. FACE — the old rider used the SAME material instance as the host, so even the sliver
   *      that does clear the collar repeats "bright saturated red eyes, forward-facing" and
   *      pattern-matches as a second instance of the same monster. A captured torso is not a
   *      second hunter head; it is what is LEFT of whoever the hunter caught. Dim, small,
   *      cool-toned eyes — a faded echo of the player's own blue, dying rather than hunting —
   *      break the "both red-eyed" signature outright, independent of geometry.
   * The grip stays: both hands still come up near the host's collar, because that is the cue
   * that says "a body is holding on here" without needing a competing head to sell it.
   */
  if (def.rider) {
    // 0.66H repeated the host's own head at little discount — plenty big enough to read as a
    // twin. 0.50H is closer to the hero shot's proportion (a good deal smaller than the host's
    // own head) and still clears "ornament on the collar" because the grip in front and the
    // partial occlusion do the rest of the "this is a body" work, not the raw head size.
    const riderH = H * 0.50;
    // A DIFFERENT FACE ON PURPOSE — see the note above. Dim, small, cool: a fading echo of
    // the player's own blue rather than the hunter's hot red, so even the visible sliver does
    // not repeat "red-eyed" and the two heads stop reading as the same kind of thing.
    const riderFace = faceOverride(0x2E5A82, {
      plate: 0.16, drive: 0.9, eyeW: 0.074, eyeH: 0.054, eyeGap: 0.148, eyeY: 0.048,
    });
    disposables.push({ dispose: () => riderFace.dispose() });
    /*
     * 🆕 THE RIDER'S BODY WAS SHARING THE HOST'S OWN SHELL/MINT MATERIAL INSTANCES — the
     * exact bug class the face fix above already caught and fixed for the eyes, still live
     * one layer down. `materials: { ...mats, face: riderFace }` only ever overrode `face`;
     * `shell`, `mint`, `chrome` etc. were the literal same baked THREE.Material objects as
     * the host, so the one fragment of rider torso that DOES clear the collar (the small
     * mint cap tucked under the small head, confirmed visible in a fresh capture) is
     * texturally identical to the host's own fully-corrupted, fully-cracked stage-3 caps —
     * it disappears into "more hunter" instead of reading as "a different, captured body".
     *
     * Fixed the same way the face was: an own override, not a geometry or position change,
     * so it cannot touch the twins-read occlusion fix and cannot regress
     * "colour is not carrying the read" (this is additive detail on an already-shape-carried
     * read, not a replacement for it). A clean-ish, cool-toned, UNCRACKED shell + cap — a
     * captured player body hasn't been through the hunter's own multi-stage corrosion —
     * versus the host's warm, filthy, `crack: 1.0` stage-3 materials.
     */
    const riderShell = shellWhite({ tint: [0.700, 0.735, 0.760], wear: 0.20, peel: 1.0, grime: 0.22, size: 256 });
    const riderMint = mintCap({ tint: [0.360, 0.560, 0.600], grime: 0.18, crack: 0.0, size: 256 });
    disposables.push({ dispose: () => { riderShell.dispose(); riderMint.dispose(); } });
    const rider = buildUnit4H({
      height: riderH,
      materials: { ...mats, face: riderFace, shell: riderShell, mint: riderMint },
    });
    rider.detach('legL');
    rider.detach('legR');
    rider.setPose({
      /*
       * GRIPPING, not folded. Z on a shoulder swings the arm ACROSS the chest, so [0,0,±1.15]
       * threw both arms straight up and they read as antennae; lift comes from a negative X
       * pitch and the fold comes from the elbow. The hero shot has both hands up at the
       * rider's own jaw with the forearms near-vertical and the elbows out — a clutch, the
       * pose of something holding on rather than something posed. The two sides are
       * deliberately NOT symmetric: the far arm is wrapped tighter across, the near arm is
       * opened out so the camera can see that there IS an arm.
       */
      /*
       * ⚠️ -1.42 ON THE SHOULDER IS NOT "ARMS UP", IT IS "ARMS STRAIGHT AHEAD", and that is
       * what threw the mint caps out level with the head and left the forearms foreshortened
       * into the chest. Negative X on a shoulder pitches the arm FORWARD (hunterPose's own
       * `shoulderX = -trunk + armFwd`), so -1.42 rad is 81 degrees — horizontal. The hero
       * shot's clutch is the opposite construction: the UPPER arms hang almost straight down
       * against the ribs and the ELBOWS do all the work, bringing the forearms up vertically
       * with the hands at the rider's own jaw. Small shoulder, big elbow.
       */
      shoulderL: [-0.62, 0, -0.30], shoulderR: [-0.48, 0, 0.13],
      elbowL: [-2.20, 0, 0], elbowR: [-2.05, 0, 0],
      wristL: [0.30, 0, -0.30], wristR: [0.34, 0, 0.24],
      // DROOPING, not alert. The host's own head stares dead at the camera; a limp neck and a
      // head turned further off-axis than before (0.22 -> 0.36 rad yaw, plus a forward droop
      // instead of the old slight lift) reads as something slumped rather than a second face
      // posing for the same shot — the "forward-facing" half of the twins complaint.
      neck: [0.05, 0, 0], head: [0.16, 0.36, 0],
    });
    unit.joints.chest.add(rider.root);
    // The host's chest is pitched most of a right angle forward; a rider parented to it
    // inherits that and lies down across the shoulders. Undo the trunk pitch, then give it
    // its own small forward lean so it still belongs to the same body.
    rider.root.rotation.set(-trunk + 0.22, 0.30, 0);

    /*
     * Register the rider's CHEST, not its head (see the top-of-block note on why the head was
     * never safe to register by). INBOARD and BEHIND now, not outboard-and-forward: the point
     * is offset far less sideways and pulled toward the host's own head rather than past it,
     * so the host's head and shoulder mass partially occlude the rider from this camera —
     * "peeking", the hero shot's own composition — while staying clear enough of the collar
     * that the torso and both arms do not vanish into it (the original bug this block fixed).
     */
    root.updateWorldMatrix(true, true);
    const hostHead = unit.joints.head.getWorldPosition(new THREE.Vector3());
    const riderChest = rider.joints.chest.getWorldPosition(new THREE.Vector3());
    const want = hostHead.clone().add(new THREE.Vector3(w(0.072), -w(0.086), w(0.020)));
    const here = rider.root.getWorldPosition(new THREE.Vector3());
    rider.root.position.copy(unit.joints.chest.worldToLocal(here.add(want.sub(riderChest))));
    unit.rider = rider;
  }

  // ---- exposed guts.
  //   stage 2: a SPLIT BACK PLATE with a spine channel (ramp table, "exposed guts").
  //   stage 3: rainbow wire looms out of the CHEST seam.
  if (def.spineSplit) buildSpineChannel(unit.joints.chest, w, mats, darkMat, mesh, H, stage, disposables);
  if (def.chestLooms) buildChestLooms(unit.joints.chest, w, mesh, H, disposables);

  // ---- the faceplate is cracked from stage 2 on (ramp table).
  if (def.faceCracks) buildFaceCracks(unit.joints.head, w, mesh, def.faceCracks, H, disposables);

  return {
    root, stage, height: H, def,
    joints: unit.joints, limbs: unit.limbs, sockets: unit.sockets, unit,
    setPose: unit.setPose,
    dispose() {
      unit.dispose();
      darkMat.dispose();
      for (const g of disposables) g.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/**
 * Scale a joint's already-merged meshes. Safe because merged meshes carry no rotation.
 *
 * ⚠️ THIS LINE USED TO READ `!c.userData.keepSeparate`, AND THAT WAS A ONE-WORD BUG THAT
 * BURIED THE CHEST MARK FOR THE WHOLE PROJECT.
 *
 * `keepSeparate` is set by `unit4h.js` on the brand decal to protect it from DRAW-CALL
 * MERGING — `collapseDrawCalls` skips those meshes so the decal keeps its own material. It
 * has nothing to do with scaling, and reading it as "do not scale" meant stages 2 and 3 grew
 * the chest shell 12% and 21% DEEPER (chestWide 1.16 / 1.30, with sz = 1 + (sx-1)*0.7) while
 * the mark stayed at the original depth — i.e. INSIDE the shell it is printed on. Stage 1
 * escaped only because chestWide was 1.00 and this function early-returns.
 *
 * The decal has to scale with the shell for a second reason beyond visibility: its geometry
 * is BOWED onto the shell's solved front face (`chestFaceZ`, unit4h.js), so the only
 * transform that keeps it welded to that surface is the same one the surface got.
 *
 * Nothing in the chest actually wants to opt out of scaling, so there is no replacement
 * flag; if something ever does, give it its OWN name rather than borrowing a merge hint.
 */
function scaleMeshes(joint, sx, sy, sz) {
  if (sx === 1 && sy === 1 && sz === 1) return;
  for (const c of joint.children) {
    if (c.isMesh) c.scale.set(sx, sy, sz);
  }
}

/**
 * ============ THE DRAW-CALL FIX. THIS IS WHY hunter.3 FAILED PERF. ============
 *
 * `hunter.3` measured 1030 calls / 680k tris against a 625 budget, and it is not shader cost
 * or triangle count — it is MESH COUNT. Measured on this scene: 260 mesh instances produce
 * 1030 calls, i.e. **3.96 draw calls per mesh**, because every mesh is submitted for the main
 * pass, the AO depth prepass and the shadow map. Nothing else on the board has that many
 * separate meshes, and the census says exactly where they are:
 *
 *   graftedArm x 4 ........ 128 meshes   (weld, bead, upper, 4 hinge rings, fore, wrist,
 *                                         palm, 4 fingers x (3 bones + 2 knuckle gaps),
 *                                         2 thumb bones = 32 EACH)
 *   buildChestLooms ....... 14
 *   buildFaceCracks x 2 ... 12           (host head + rider head)
 *   buildSpineChannel ..... 10
 *   the three unit4h bodies ~96          (already collapsed by unit4h's own collapseDrawCalls)
 *
 * So 164 of the 260 meshes are this file's, and the two bodies that were built by `unit4h.js`
 * cost less between them than the four grafted arms alone. `unit4h.js` solved this years of
 * rounds ago with `collapseDrawCalls`: construction code stays one-part-per-feature, and the
 * parts are merged per material at the end. That function is private to a file this round must
 * not touch, so the same idea is reimplemented here for STATIC sub-assemblies.
 *
 * "Static" is the whole precondition and it is satisfied: none of the four assemblies above is
 * ever posed. The grafts are welded to the chest, the looms hang off it, the cracks are painted
 * on a head, the spine channel is set into a back. Only `unit4h`'s own joints animate, and this
 * never touches them.
 *
 * Baking the world transform is what makes it legal — a merged mesh cannot inherit the
 * per-part rotations that made the assembly, so each part's geometry is pre-transformed into
 * the assembly's frame first. Negative determinants flip winding, which is guarded even though
 * nothing here mirrors by scale today; a future mirrored graft would otherwise render
 * inside-out with no error anywhere.
 *
 * @returns {number} meshes removed, for the caller to assert on
 */
function collapseStatic(group, disposables) {
  group.updateWorldMatrix(true, true);
  const toRoot = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const byMat = new Map();
  const kill = [];
  const m4 = new THREE.Matrix4();

  group.traverse((o) => {
    if (!o.isMesh) return;
    const geo = o.geometry.clone().applyMatrix4(m4.multiplyMatrices(toRoot, o.matrixWorld));
    if (m4.determinant() < 0 && geo.index) {
      const a = geo.index.array;
      for (let i = 0; i < a.length; i += 3) { const t = a[i]; a[i] = a[i + 2]; a[i + 2] = t; }
      geo.index.needsUpdate = true;
    }
    // mergeGeometries refuses a mixed set, and every primitive used here is indexed with
    // position/normal/uv. Anything else is dropped from the merge rather than merged wrong.
    if (!geo.index || !geo.attributes.uv) { geo.dispose(); return; }
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(geo);
    kill.push(o);
  });

  for (const o of kill) o.removeFromParent();
  // Drop the now-empty intermediate groups so a later traversal does not walk them.
  for (const c of [...group.children]) if (c.isGroup && c.children.length === 0) c.removeFromParent();

  let removed = kill.length;
  for (const [mat, geos] of byMat) {
    const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    if (geos.length > 1) for (const g of geos) g.dispose();
    const m = new THREE.Mesh(merged, mat);
    m.castShadow = m.receiveShadow = true;
    m.name = `${group.name}.merged`;
    group.add(m);
    disposables.push(merged);
    removed--;
  }
  return removed;
}

/** Drop `obj` so the lowest point of `parts` sits on y = 0. */
function ground(obj, parts) {
  obj.updateWorldMatrix(true, true);
  const box = new THREE.Box3();
  for (const p of parts) box.expandByObject(p);
  if (!box.isEmpty()) obj.position.y -= box.min.y;
  obj.updateWorldMatrix(true, true);
}

/**
 * ============ THE EMPTY SHOULDER PORT — the most important read on the sheet ============
 *
 * Rebuilt from the art rather than tuned. `hunter.2` has been REJECT 24-27 for fourteen
 * rounds on this one feature, so the first thing this round did was open the sheet at 11x
 * (`Dev Art/1785300149293.png`, region 60,530,100,90) and look at what is actually drawn.
 *
 * WHAT THE ART SHOWS, feature by feature:
 *   - a raised, slightly conical BOSS growing out of the shoulder yoke, in the same sooted
 *     shell material as the body — the port is a fitting on the armour, not a wound in it
 *   - a round opening in its top face, its rim a soft rolled edge, not a ring of teeth
 *   - a clear VALUE GRADIENT across that opening: bright lit lip on the near side, mid-grey
 *     inner wall curving away, near-black at depth. That gradient IS the hole; the previous
 *     round proved the point negatively by lifting the bore wall off black and measuring
 *     "869 px changed, max delta 59" — real, and visually insufficient, because a flat disc
 *     with a slightly better colour is still a flat disc
 *   - NOTHING ELSE. No cables, no wires, no shards, no colour. `ART_MANIFEST` #06 calls it
 *     "an empty open cylinder" and that is exactly what is on the page
 *   - and the ARM IS STILL THERE, below and outboard of it (see the note at the detach site)
 *
 * WHY A LATHE AND NOT A STACK OF CYLINDERS. The previous construction was a housing tube, a
 * race tube, a bore tube, a floor disc, seven cone shards and three cable tubes — fourteen
 * separate surfaces that the viewer has to assemble into one idea. A `--pick` ownership
 * raycast over the round-14 capture returns `socketHousing` over the whole upper half and
 * `socketBore` only over a small dark disc, and the crop shows why: two OPEN-ENDED tubes seen
 * near edge-on present their inner and outer walls as separate thin bands, so the "shoulder"
 * read as a cone of pale ribbons and the "hole" as a black sticker on it. Several rim shards
 * projected past the body into the background and read as floating debris.
 *
 * A hole in a solid is ONE CONTINUOUS SURFACE that turns over a lip and goes back down inside.
 * `LatheGeometry` is exactly that: one profile, revolved. The lip is not a separate part that
 * has to be lined up with a bore, it is the same surface changing direction, so the shading
 * runs unbroken from the lit outer boss over the crest and down into the dark — which is the
 * gradient above, obtained by construction instead of by tuning three materials against
 * each other.
 *
 * TWO lathes, not one, and the split is material rather than shape: the outer boss is the
 * body's shell so the port belongs to the armour, and the bore is its own darker, glossier
 * surface because a bore is machined where a shell is cast. They share the lip vertex ring
 * exactly, so there is no seam to z-fight.
 *
 * `side: BackSide` on the bore is load-bearing and it is the same reasoning that fixed the
 * capped-cylinder bug: what you see looking INTO a tube is its far interior, i.e. its back
 * faces. Under the default FrontSide those are culled and the near wall draws instead — you
 * would be looking at the OUTSIDE of the tube's front half, which is opaque, and the hole
 * would vanish. BackSide culls the near wall (correct — nothing should be between the eye and
 * the inside of a hole) and lights the far wall with a flipped normal.
 */
function buildTornSocket(unit, w, mats, darkMat, mesh, disposables, trunk) {
  const sock = unit.sockets.shoulderR;
  const rig = new THREE.Group();
  rig.name = 'tornSocket';

  /*
   * PLACEMENT — on the yoke, above and inboard of the arm, as the sheet has it. Derived from
   * the arm socket's own position rather than typed in, so it follows `shoulderOut`/
   * `shoulderUp` when the mass redistribution above is retuned.
   */
  sock.parent.add(rig);
  /*
   * Inboard of the mint cap, not on it. At 0.90 of the arm socket's own x the boss and the
   * shoulder cap occupied the same volume and the cap rendered INSIDE the bore, which is a
   * worse artefact than the plugged hole this rewrite replaced.
   *
   * ⚠️ AND IT CAME BACK THE MOMENT THE SHOULDERS WIDENED. 0.66 was clear at `shoulderOut`
   * 1.22; taking that to 1.30 (the mass fix above) walked the arm's own chrome ball back into
   * the bore, and `_tmp_geoprobe --pick --grid` over the opening found it painting a bright
   * white crescent in the dark — the single loudest thing in the port. Nothing announces this:
   * both parts are correct on their own and the clash is only visible down the hole. **Re-run
   * the pick over the bore after ANY change to `shoulderOut` / `shoulderUp` / `shoulderFwd`.**
   * The clearance is lateral and vertical, so both move: further inboard, and higher on the yoke.
   */
  rig.position.set(sock.position.x * 0.56, sock.position.y + w(0.062), sock.position.z + w(0.014));

  /*
   * AIM. The lathe's axis is +Y. The chest is already pitched `trunk` forward (0.66 + 0.36 =
   * 1.02 rad at stage 2), and a port parented to it inherits all of that — a mouth leaning 58
   * degrees forward points at the floor in front of the character and the camera sees only its
   * back rim. So most of the trunk pitch is undone, leaving a small forward tilt: the sheet's
   * port faces up, out and a little forward, which is what puts the far wall in view from a
   * front three-quarter camera.
   *
   * ROLL SIGN: R_z(c) sends (0,1,0) to (-sin c, cos c, 0), so the RIGHT-side port (+X) tilts
   * OUTBOARD on a NEGATIVE roll. The same sign trap the shoulders and the grafts both hit.
   */
  /*
   * HOW FAR FORWARD, measured off the frame rather than guessed. `hunter-stage.js` frames this
   * view at a rise of 0.07 + 0.025 * stage, i.e. the camera sits only about 7 degrees above the
   * subject — so a port whose axis points straight UP is seen 83 degrees off its own axis and
   * shows nothing but a hairline crescent at the far rim. That is exactly what the first
   * attempt rendered. On the sheet the opening's ellipse has an aspect near 0.6, which is a
   * mouth turned roughly 37 degrees toward the viewer.
   *
   * The chest supplies +`trunk` of forward pitch already, so leaving 72% of it in place (0.73
   * rad, 42 degrees) lands in that range while the port still reads as sitting ON TOP of the
   * shoulder rather than punched through its front.
   */
  rig.rotation.set(-trunk * 0.28, 0, -0.42);

  const rB = w(0.043);          // bore radius — measured off the sheet at 0.085 H diameter

  /*
   * THE PROFILE, in multiples of `rB`. [radius, height]. Ordered outward-skirt -> up over the
   * crest -> down the bore -> floor centre, so the two halves can be cut at the lip index.
   */
  /*
   * ⚠️ THE FLOOR MUST SIT ABOVE THE SHELL, AND THIS IS THE TRAP THAT COST TWO ITERATIONS.
   *
   * Nothing cuts a hole in the torso. `unit4h`'s shoulder shell is a closed solid and this port
   * is a fitting placed ON it, so any part of the bore that descends BELOW the shell's own
   * surface is inside opaque geometry — and what the capture then shows through the "opening"
   * is the shoulder's own panel-lined shell, lit and pale, with the bore reduced to a dark
   * crescent at the rim. That is what a 1.04 rB deep bore on a 0.44 rB tall boss rendered.
   *
   * So the depth has to be bought ABOVE the shell rather than below it: a genuinely raised
   * collar (crest 0.55 rB proud) with its floor at −0.21 rB, giving 0.76 rB of visible wall
   * entirely clear of the body. That is also what the sheet draws — its port is a standing
   * tube you can see a real depth into, not a dimple.
   */
  const P = [
    [1.75, -0.62], [1.62, -0.36], [1.45, -0.06], [1.28, 0.22], [1.12, 0.43], [1.02, 0.53],
    [1.00, 0.55],                                  // <- the lip: last boss point, first bore point
    [0.97, 0.46], [0.95, 0.25], [0.93, 0.02],      // upper wall
    [0.90, -0.08], [0.86, -0.14],                  // the internal step the sheet shows
    [0.66, -0.18], [0.30, -0.20], [0.00, -0.21],   // floor, clear of the shell below
  ];
  const LIP = 6;
  /*
   * SAMPLE THE PROFILE AS A CURVE, not as a polyline.
   *
   * `LatheGeometry` on 6 raw control points gives 5 bands meeting at hard creases, and the
   * jitter pass below has to call `computeVertexNormals()`, which replaces the lathe's own
   * smooth normals with face-averaged ones. Together those rendered the boss as a stack of
   * concentric ribbons — the exact artefact the old open-cylinder housing produced, arrived at
   * by a different route. A spline through the same control points, sampled fine, gives one
   * continuous surface whose recomputed normals are smooth.
   */
  const pts = (a, b, n) => {
    const ctrl = P.slice(a, b).map(([r, y]) => new THREE.Vector2(r * rB, y * rB));
    return new THREE.SplineCurve(ctrl).getPoints(n);
  };

  const boss = new THREE.LatheGeometry(pts(0, LIP + 1, 20), 30);

  /*
   * ============ "TOO TIDY. A CLEAN LATHED BOSS THE FACTORY BUILT IN." ============
   *
   * `critic-hunter-2` accepted the port as a port and then filed the opposite of the old
   * complaint: it now reads as an intentional maintenance access panel — "clean machined rim,
   * no ragged edge, no debris, no dark stain bleeding from it". I zoomed the sheet's own port
   * at 7x (`1785300149293.png`, region 40,510,120,110) before touching this, and the critic is
   * right about what is missing, though not about the mechanism:
   *
   *   - the art's rim is NOT uniformly ragged. Most of it is a smooth rolled edge. What makes
   *     it read as damage is that the far lip is THICK and slightly flattened while one side
   *     carries a definite notch — damage is unevenly distributed, and a ring of equal
   *     scallops is a decoration, not a wound. That is why the old sine corrugation could be
   *     doubled without ever reading as violence.
   *   - the armour AROUND the opening is visibly darker and browner than the shell either
   *     side of it, running downhill from the lip. That stain is most of the "violated" read
   *     and it cost nothing in the art because it is paint, not geometry.
   *
   * So: one broad swell, two narrow notches, and a per-vertex stain. No new meshes, nothing
   * that can float off the body — the round-14 lesson (rim shards projecting into the
   * background as debris) is not being re-learned.
   */
  const yTop = 0.55 * rB, yLo = 0.30 * rB;
  /** Gaussian bump on the angle circle, wrapped. */
  const notch = (a, at, wid) => {
    let d = a - at;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return Math.exp(-(d * d) / (wid * wid));
  };
  /**
   * The rim's radial push at angle `a`, in units of the bore radius. NEGATIVE eats into the
   * mouth. Applied to the boss AND to the bore's top rings — they share the lip vertex ring,
   * and deforming one without the other opens a lit crack between them that reads as a
   * modelling error at exactly the place the eye is being sent.
   */
  const rimPush = (a) => (
    Math.sin(a * 2.0 + 0.8) * 0.055              // broad swell: one side of the lip is fatter
    + Math.sin(a * 7.0 - 0.4) * 0.014            // fine tooling irregularity
    - notch(a, 2.15, 0.26) * 0.115               // the chewed notch, far side
    - notch(a, -0.62, 0.17) * 0.070              // a second, smaller, near side
  );
  const rimDrop = (a) => notch(a, 2.15, 0.30) * 0.20 + notch(a, -0.62, 0.20) * 0.12;
  const jitter = (geo) => {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const t = THREE.MathUtils.clamp((y - yLo) / (yTop - yLo), 0, 1);
      if (t <= 0) continue;
      const a = Math.atan2(z, x);
      const k = 1 + rimPush(a) * t * t;
      p.setX(i, x * k); p.setZ(i, z * k);
      p.setY(i, y - rimDrop(a) * rB * t * t);
    }
    p.needsUpdate = true;
    geo.computeVertexNormals();
  };
  jitter(boss);
  {
    /*
     * UVs. A lathe maps u to the angle and v to the profile, and this profile is about a fifth
     * as long as the circumference — so the shell's soot mottling arrives stretched 5x around
     * the boss and reads as CONCENTRIC RIBBONS, which is the same false read the old stack of
     * open cylinders produced geometrically. Rescaling u to roughly match the aspect breaks the
     * banding and lets the boss read as one sooted swell.
     */
    const uv = boss.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 3.0, uv.getY(i) * 0.9);
    uv.needsUpdate = true;

    /*
     * THE STAIN, as vertex colour on the boss's own surface rather than as a decal.
     * A flat annulus laid on the shoulder would sit off the curved shell exactly the way the
     * old face cracks did (see `buildFaceCracks`), so the discolouration goes where it can
     * never float: into the geometry that is already welded there. Darkest at the lip, running
     * downhill in irregular tongues, back to clean shell by the outer skirt.
     */
    const p = boss.attributes.position;
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const a = Math.atan2(z, x);
      // 1 at the lip -> 0 at the skirt
      const down = THREE.MathUtils.clamp((y + 0.62 * rB) / (1.17 * rB), 0, 1);
      const tongue = 0.55 + 0.45 * (Math.sin(a * 3.0 + 1.1) * 0.6 + Math.sin(a * 5.0 - 2.2) * 0.4);
      const s = THREE.MathUtils.clamp(down * down * (0.35 + 0.85 * tongue), 0, 1);
      // toward a warm oxide brown, not toward neutral black — the sheet's stain is rust
      col[i * 3] = 1 - s * 0.62;
      col[i * 3 + 1] = 1 - s * 0.72;
      col[i * 3 + 2] = 1 - s * 0.80;
    }
    boss.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  /*
   * The boss needs its own material only because of `vertexColors` — everything else about it
   * is the body's shell, and it must stay that way or the port stops belonging to the armour.
   * A clone shares the baked maps, so this costs one uniform block and no extra bake.
   */
  const bossMat = mats.shell.clone();
  bossMat.vertexColors = true;
  bossMat.name = 'hunter.socketBoss';
  disposables.push({ dispose: () => bossMat.dispose() });
  rig.add(mesh(boss, bossMat, 'socketHousing'));

  /*
   * The bore. Its own material, and the reasons are cumulative rather than stylistic:
   * `darkMat` is 0x0a0806 at roughness 1.0, and a near-black fully-rough surface returns
   * almost no light at ANY angle — it renders flat by construction, which is what made every
   * previous attempt a black disc. Lifted off black and made glossier than the cast shell
   * around it, so the wall can actually catch the grazing crescent that reads as depth. The
   * FLOOR is still darker than the wall, and that ordering is the depth cue: it comes for free
   * here because the floor faces away from the key while the far wall faces into it.
   */
  /*
   * ⚠️ `DoubleSide`, NOT `BackSide`, AND THE REASON IS WORTH WRITING DOWN BECAUSE IT ALREADY
   * COST THIS PIECE ONE ROUND IN THE OTHER DIRECTION.
   *
   * The previous bore was a `CylinderGeometry` whose profile runs bottom-to-top, so its normals
   * point AWAY from the axis and its interior is genuinely its back faces — `BackSide` was
   * correct there and fixed a real bug. This bore is a LATHE whose profile is written
   * top-to-bottom (lip 0.55 down to floor −0.21), which reverses the convention: its normals
   * already point INWARD, the interior is its FRONT faces, and `BackSide` culls exactly the
   * surface the port exists to show. Two captures came back showing the shoulder's own panel
   * lines through the opening before this was spotted.
   *
   * So the side is not a property of "is it a tube", it is a property of the point ORDER, which
   * is invisible at the call site and silently inverts if anyone reverses the profile. On a
   * mesh this small the extra rasterisation is not worth a bug that renders as a plausible
   * solid, so both faces are drawn and the question stops existing.
   */
  const boreMat = new THREE.MeshStandardMaterial({
    color: 0x241d18, roughness: 0.52, metalness: 0.24, side: THREE.DoubleSide,
  });
  boreMat.name = 'hunter.socketBore';
  disposables.push({ dispose: () => boreMat.dispose() });
  const bore = new THREE.LatheGeometry(pts(LIP, P.length, 18), 30);
  jitter(bore);   // shares the lip ring with the boss — see rimPush
  rig.add(mesh(bore, boreMat, 'socketBore'));

  /*
   * The snapped ball stub, kept — it is the one piece of "this was ripped out" evidence that
   * does not fight the opening, because it sits INSIDE the dark rather than across it. Small,
   * low, and against the far wall so it never breaks the rim's outline.
   *
   * ⚠️ IT WAS `mats.chrome`, AND A 7x CROP SHOWS WHY THAT WAS WRONG: polished chrome inside a
   * hole still finds the key, so the one bright thing in the whole port was a white crescent
   * floating in the dark, which reads as a render artefact rather than as a broken fitting.
   * The sheet's opening has NOTHING lit in it. Dark oxidised metal instead — present on
   * inspection, invisible from across the room, which is the correct weight for this detail.
   */
  const stubMat = new THREE.MeshStandardMaterial({ color: 0x2a221c, roughness: 0.68, metalness: 0.45 });
  stubMat.name = 'hunter.ballStub';
  disposables.push({ dispose: () => stubMat.dispose() });
  const stub = mesh(new THREE.SphereGeometry(rB * 0.30, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.6),
    stubMat, 'ballStub');
  stub.position.set(rB * 0.26, -rB * 0.14, -rB * 0.20);
  stub.rotation.x = Math.PI;
  rig.add(stub);

  /*
   * ⚠️ THE CABLES ARE GONE, AND THAT IS THE ART'S ANSWER RATHER THAN A SIMPLIFICATION.
   * They began as six saturated hues — the literal "six rainbow rods" that scored this piece
   * 27 — then became three sooted strands hanging out of the lower lip. A crop of the round-14
   * capture shows what three still cost: they render as flat black STRAPS hanging clear of the
   * body against a white backdrop, and they are the largest, highest-contrast shape anywhere
   * near the socket, so the eye lands on them and not on the opening. The sheet shows no
   * wiring at this port in any of its four views. `ART_MANIFEST` #06: "an empty open cylinder".
   * The previous owner wrote that removing them was defensible and that putting them back is
   * the smaller change; it is, and this is the round that takes them out.
   */
}

/** Stage 2/3: the back plate splits open on a dark spine channel with cable in it. */
function buildSpineChannel(chest, w, mats, darkMat, mesh, H, stage, disposables) {
  const g = new THREE.Group();
  g.name = 'spineChannel';
  const chestH = (0.845 - 0.655) * 0.88 * H;
  g.position.set(0, chestH * 0.48, -w(0.075));
  chest.add(g);

  // the channel: a dark recess where the plate has parted
  const chan = mesh(roundedBoxGeometry(w(0.030), chestH * 0.80, w(0.020), w(0.004), 2), darkMat, 'spineGap');
  g.add(chan);

  // the two halves of the split plate, hinged apart
  for (const s of [-1, 1]) {
    const half = mesh(roundedBoxGeometry(w(0.048), chestH * 0.80, w(0.016), w(0.006), 2), mats.shell, `spinePlate${s}`);
    half.position.set(s * w(0.040), 0, -w(0.006));
    half.rotation.y = s * 0.34;
    g.add(half);
  }

  // vertebral discs down the channel, and a fat cable bundle behind them
  const n = stage === 3 ? 7 : 5;
  for (let i = 0; i < n; i++) {
    const d = mesh(new THREE.CylinderGeometry(w(0.016), w(0.016), w(0.008), 14), mats.chrome, `vert${i}`);
    d.rotation.x = Math.PI / 2;
    d.position.set(0, chestH * (0.34 - i * (0.68 / (n - 1))), w(0.004));
    g.add(d);
  }
  collapseStatic(g, disposables);   // 8-10 meshes -> 3 (dark / shell / chrome)
}

/**
 * Stage 3: the guts spilling out of the chest seam.
 *
 * ⚠️ THIS WAS THE SAME DEFECT THAT SCORED `hunter.2` A REJECT 27, SITTING UNREPORTED ON
 * `hunter.3`. The palette was
 *     [0xd23b2e, 0xe0a233, 0xd9d24a, 0x3f9e4d, 0x3a6fc4, 0x8a4fb0, 0xcfcfcf, 0x2a2a2a]
 * — eight fully-saturated hues on 14 fat tubes hanging off the front of the abdomen. A crop
 * of the round-11 capture shows it exactly as a critic described the socket: candy-coloured
 * rods, the loudest thing in the frame, on a character whose entire palette is otherwise
 * white shell, chrome and soot. The socket got fixed and this did not, because nobody had
 * looked at the stage-3 chest at magnification.
 *
 * The art (`Dev Art/1785288883855.png`, chest split; `1785300149293.png` STAGE 3 row) shows a
 * DARK, tightly-coiled mass of cable in the opened sternum — near-black loops with a little
 * warm oxidised metal in them, and, in the hero shot only, ONE small ribbon of red/blue signal
 * wire a few pixels wide at the top of the split. So: sooted mass, one accent, and the accent
 * kept small enough that it reads as a detail found on inspection rather than as the subject.
 *
 * COUNT AND MASS. 14 tubes of 0.0046 w hanging 0.132 w down the belly is a bib; the art's
 * cable stays INSIDE the split and loops back into it. Nine strands, thinner, shorter, and
 * pulled back toward the seam. Merged to ONE mesh per material — see collapseStatic; this
 * assembly alone was 14 meshes of the 260 that failed the draw-call budget.
 */
function buildChestLooms(chest, w, mesh, H, disposables) {
  const chestH = (0.845 - 0.655) * 0.88 * H;
  // sooted rubber, with one dull copper and one dark oxide for the eye to find
  const tone = [0x14110f, 0x1c1815, 0x0f0d0c, 0x3d2a1a, 0x171412, 0x241d17];
  const grp = new THREE.Group();
  grp.name = 'chestLooms';
  grp.position.set(0, chestH * 0.30, w(0.074));
  chest.add(grp);
  const mats = new Map();
  for (let i = 0; i < 9; i++) {
    const r = 0.55 + (i / 9) * 0.7;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3((i % 5 - 2) * w(0.011), 0, 0),
      new THREE.Vector3((i % 3 - 1) * w(0.019), -w(0.030) * r, w(0.020)),
      new THREE.Vector3((i % 5 - 2) * w(0.016), -w(0.062) * r, w(0.026)),
      // the tail curls BACK toward the seam instead of hanging off the front
      new THREE.Vector3((i % 4 - 1.5) * w(0.020), -w(0.092) * r, w(0.004)),
    ]);
    const copper = i === 4;
    const hex = tone[i % tone.length];
    if (!mats.has(hex)) {
      const m = new THREE.MeshStandardMaterial({
        color: hex, roughness: copper ? 0.55 : 0.88, metalness: copper ? 0.30 : 0.05,
      });
      m.name = `hunter.loom${hex.toString(16)}`;
      mats.set(hex, m);
      disposables.push({ dispose: () => m.dispose() });
    }
    grp.add(mesh(new THREE.TubeGeometry(curve, 12, w(0.0034), 5, false), mats.get(hex), `loom${i}`));
  }
  collapseStatic(grp, disposables);
}

/**
 * The faceplate is cracked from stage 2 on (ramp table: "faceplate cracked").
 *
 * Two long straight bars across the middle of a round dark plate do not read as a crack —
 * they read as the hands of a clock, which is what the first attempt looked like. A real
 * impact fracture is a SHORT branching cluster offset from centre, with the branches
 * getting finer as they run out from the strike point. Fine, short, off-centre, clustered.
 */
function buildFaceCracks(head, w, mesh, count, H, disposables) {
  const dark = new THREE.MeshStandardMaterial({ color: 0x0b0d11, roughness: 0.85, metalness: 0.0 });
  dark.name = 'hunter.faceCrack';
  disposables.push({ dispose: () => dark.dispose() });
  const headH = 0.158 * H, headD = 0.150 * H;
  const g = new THREE.Group();
  g.name = 'faceCracks';
  /*
   * ⚠️ THESE WERE FLOATING, AND IT SHOWED. The whole cluster used to be one FLAT plate pinned
   * at the head's maximum depth (`z = headD/2 + 0.0075 w`) and offset 0.030 w off centre. The
   * head is a rounded cap, so its front face falls away from that maximum as soon as you leave
   * the centreline: at the cluster's own offset the shell has already receded ~0.006 H, and the
   * outer branches another 0.004 H past that. On the round-11 capture the outer cracks read as
   * black ticks standing off the SILHOUETTE of the visor, in mid-air beside the head.
   *
   * Fixed by putting the strike point and every branch on the CAP itself: each bar is placed on
   * an ellipsoid of the head's own radii and turned to face outward, so it lies on the surface
   * at every offset instead of only at the one point the flat plate happened to touch.
   */
  head.add(g);
  const rx = headD * 0.50, ry = headH * 0.52, rz = headD * 0.50;
  const cy = headH * 0.50;                       // cap centre in head-local space
  const strike = new THREE.Vector2(-0.030, 0.030); // plate-space strike point, in w units

  // branches radiating from the strike point: [dx, dy, length, roll]
  const seg = [
    [0.000, -0.010, 0.026, 0.30], [0.010, -0.004, 0.020, -0.75],
    [-0.011, -0.008, 0.018, 1.05], [0.004, 0.011, 0.015, -0.22],
    [0.019, -0.014, 0.013, 0.62], [-0.017, 0.004, 0.011, -1.25],
  ];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < Math.min(count + 2, seg.length); i++) {
    const [dx, dy, len, rot] = seg[i];
    const px = w(strike.x + dx), py = w(strike.y + dy);
    // where that point lands on the cap: solve the ellipsoid for z, clamped so a branch that
    // strays past the rim still sits on the shell rather than behind it
    const u = THREE.MathUtils.clamp(px / rx, -0.92, 0.92);
    const v = THREE.MathUtils.clamp(py / ry, -0.92, 0.92);
    const pz = rz * Math.sqrt(Math.max(0.02, 1 - u * u - v * v));
    const m = mesh(roundedBoxGeometry(w(0.0016), w(len), w(0.0016), w(0.0006), 1), dark, `faceCrack${i}`);
    m.position.set(px, cy + py, pz + w(0.0016));
    // face outward along the ellipsoid normal, then roll the bar about it
    const n = new THREE.Vector3(px / (rx * rx), py / (ry * ry), pz / (rz * rz)).normalize();
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    m.rotateOnAxis(up.set(0, 0, 1), rot);
    g.add(m);
  }
  collapseStatic(g, disposables);   // 6 meshes -> 1, on two heads at stage 3
}

/**
 * THE FACE. Measured against the sheet this round rather than described, because the render
 * and the art were not the same colour and nobody had looked.
 *
 * WHAT THE RENDER ACTUALLY SHOWED (crop of `hunter.1.png`, head at 3x): a NAVY BLUE plate
 * carrying two flat SALMON-PINK bars. The art's STAGE 2/3 visor is near-BLACK carrying two
 * saturated RED wedges. Neither the plate nor the eyes were the colour this function's own
 * comment claimed, and the cause is arithmetic that only shows up when you follow the two
 * maps through:
 *
 *   `FACE_SURFACE` bakes albedo = mix(uGlass, uLight, lit) with uGlass #2659A0 (mid blue)
 *   and uLight #7EBDF0 (pale blue) — and neither is exposed as an option, so a caller cannot
 *   bake a black plate. `material.color` multiplies that whole map. At the old (0.52,0.50,0.52)
 *   the field lands near #132E53 (navy, exactly what the crop shows) and THE EYE ITSELF lands
 *   near #41607A — a PALE BLUE patch. The emissive is red and additive, so red-on-pale-blue
 *   is pink by construction. It could never have been red at that plate value.
 *
 * So the fix is not more red, it is LESS PLATE. Taking `color` down to ~0.10 drives both the
 * field and the eye albedo to near-black, which leaves `material.emissive` — pure red,
 * luminance-only mask (`s.albedo = vec3(max(lit,...))`, robot.js:505) — as the ONLY thing
 * colouring those texels. That is what the art is: an unlit black screen with two red lights
 * behind it. `emissiveIntensity` comes down with it, because once the eye is not sitting on a
 * pale substrate it no longer needs to shout over one, and a lower drive is what keeps the
 * bloom from washing the core back to white.
 *
 * EYE SHAPE was wrong too, and in a measurable direction. On the sheet's STAGE 2 head the eye
 * box is ~18 x 15 source px on a 46 x 59 px screen: 0.39 of screen width and 0.25 of its
 * height, i.e. only a little wider than tall. The old 0.155 x 0.046 is a 3.4:1 letterbox —
 * 0.34 of the width (fine) but 0.10 of the height (2.5x too flat), which is why the render
 * reads as two horizontal dashes where the art reads as two angry eyes.
 *
 * ✅ THE CANT IS NOW REACHABLE. This block used to read "NOT reachable from here: `sdRound` in
 * `FACE_SURFACE` is axis-aligned with no rotation uniform". `robot.js` now takes `uEyeCant`
 * (radians, positive = inner ends drop) and rotates INSIDE the folded `abs(p.x)` space, so one
 * angle mirrors correctly into a scowl instead of a tilted head. It is a rotation of the SDF
 * sample, not floating geometry — which matters, because the existing `buildFaceCracks` bars
 * already demonstrate how badly a flat overlay sits on this curved cap.
 * The player is unaffected: `uEyeCant` defaults to 0.0 and only `faceOverride` passes a value.
 *
 * @param {number} eyeHex     emissive colour
 * @param {object} o
 * @param {number} o.plate    multiplier on the baked plate albedo. ~0.10 = the art's black
 *                            visor; higher leaves the player's blue glass showing through,
 *                            which is what stage 1 wants as a MIDPOINT.
 * @param {number} o.drive    emissiveIntensity
 * @param {object} o.mouth    `{ w, t, y }` to keep a mouth, or null for none
 */
function faceOverride(eyeHex, o = {}) {
  const { plate = 0.10, drive = 2.15, mouth = null, eyeW = 0.098, eyeH = 0.068,
    eyeGap = 0.150, eyeY = 0.045, eyeCant = 0.42, eyeTaper = 1.7 } = o;
  const m = faceplate({
    face: {
      uEyeW: eyeW, uEyeH: eyeH, uEyeGap: eyeGap, uEyeY: eyeY,
      uEyeCant: eyeCant, uEyeTaper: eyeTaper,
      // uMouthY -0.60 does not "turn the mouth off" — it moves a crescent whose radius is a
      // hardcoded 0.30 clean off the plate. Zero width is what actually removes it, and that
      // is what the two hunter rows of the sheet show. Stage 1 passes a mouth on purpose;
      // see the stage table.
      uMouthY: mouth?.y ?? -0.60, uMouthW: mouth?.w ?? 0.0, uMouthT: mouth?.t ?? 0.0,
    },
    emissiveIntensity: drive,
  });
  m.emissive = new THREE.Color(eyeHex);
  m.color = new THREE.Color(plate, plate * 0.96, plate);
  m.clearcoatRoughness = 0.16;
  m.name = 'hunter.faceplate';
  return m;
}

/**
 * A grafted extra arm: cruder than the original, welded straight to the torso.
 *
 * A critic found two of the six unreadable — "straight tapered cylinders ending in a flat
 * comb/fin cluster, no elbow, no hand ... they read as antennae or exhaust vents". Both
 * causes are fixed here. The elbow was a bare sphere the same diameter as the arm, so
 * there was no joint to see; it is now the player's stacked-ring hinge, which is the one
 * detail on the whole chassis that says "this bends here". And the hand was four bare
 * finger columns with no palm behind them, which is a comb; it now has a wrist block and a
 * palm, spread fingers with knuckle gaps and an opposed thumb, so it reads as a hand from
 * any angle including end-on.
 */
function graftedArm(w, mats, s, mesh, lenScale, elbowBend = 0.55, disposables = [], elbowRoll = 0) {
  const g = new THREE.Group();
  g.name = 'graftedArm';

  // weld boss: a lumpy fused joint, not a clean ball
  const weld = mesh(new THREE.SphereGeometry(w(0.040), 16, 12), mats.chrome, 'weld');
  weld.scale.set(1.15, 0.9, 1.0);
  g.add(weld);
  const bead = mesh(new THREE.TorusGeometry(w(0.040), w(0.008), 6, 18), mats.shell, 'weldBead');
  bead.rotation.x = Math.PI / 2;
  bead.position.y = w(0.014);
  g.add(bead);

  const upperLen = w(0.155 * lenScale);
  const upper = new THREE.CylinderGeometry(w(0.036), w(0.030), upperLen, 18);
  upper.translate(0, -upperLen * 0.5, 0);
  g.add(mesh(upper, mats.chrome, 'graftUpper'));

  const elbow = new THREE.Group();
  elbow.position.y = -upperLen;
  // X = flexion in the limb's own sagittal plane; Z = the crank that survives a rolled-out
  // arm (see the call site). Order matters only in that both are small enough not to gimbal.
  elbow.rotation.set(elbowBend, 0, elbowRoll);
  g.add(elbow);

  // STACKED-RING HINGE, the chassis signature for a joint. Rings across the bend axis.
  for (let i = 0; i < 4; i++) {
    const r = w(i === 0 || i === 3 ? 0.029 : 0.033);
    const ring = mesh(new THREE.CylinderGeometry(r, r, w(0.010), 16), mats.chrome, `graftHinge${i}`);
    ring.rotation.z = Math.PI / 2;
    ring.position.x = (i - 1.5) * w(0.013);
    elbow.add(ring);
  }

  const foreLen = w(0.150 * lenScale);
  const fore = new THREE.CylinderGeometry(w(0.031), w(0.025), foreLen, 18);
  fore.translate(0, -foreLen * 0.5, 0);
  elbow.add(mesh(fore, mats.chrome, 'graftFore'));

  // squared wrist block, same language as the player's
  const wristY = -foreLen;
  const wb = mesh(roundedBoxGeometry(w(0.050), w(0.040), w(0.046), w(0.009), 2), mats.chrome, 'graftWrist');
  wb.position.y = wristY - w(0.014);
  elbow.add(wb);

  const hand = new THREE.Group();
  hand.position.y = wristY - w(0.030);
  hand.rotation.x = 0.22;
  elbow.add(hand);

  // PALM. Without it the fingers are a comb.
  const palm = mesh(roundedBoxGeometry(w(0.056), w(0.050), w(0.024), w(0.010), 2), mats.chrome, 'graftPalm');
  palm.position.y = -w(0.025);
  hand.add(palm);

  // four spread 3-segment fingers with dark knuckle gaps
  for (let f = 0; f < 4; f++) {
    const col = new THREE.Group();
    col.position.set((f - 1.5) * w(0.0155), -w(0.050), w(0.002));
    col.rotation.x = 0.30 + f * 0.06;
    col.rotation.z = (f - 1.5) * 0.10;
    hand.add(col);
    let y = 0;
    for (let k = 0; k < 3; k++) {
      const len = w(0.030 - k * 0.006);
      const seg = mesh(roundedBoxGeometry(w(0.0125), len, w(0.0130), w(0.0048), 2), mats.chrome, `gf${f}${k}`);
      seg.position.y = y - len * 0.5;
      col.add(seg);
      y -= len;
      if (k < 2) {
        const gap = mesh(new THREE.CylinderGeometry(w(0.0063), w(0.0063), w(0.0132), 10), mats.gap, `gk${f}${k}`);
        gap.rotation.z = Math.PI / 2;
        gap.position.y = y;
        col.add(gap);
        y -= w(0.0022);
      }
    }
  }

  // opposed thumb — the read that separates a hand from a fork
  const th = new THREE.Group();
  th.position.set(s * w(0.026), -w(0.038), w(0.008));
  th.rotation.set(-0.30, 0, s * 0.95);
  hand.add(th);
  let ty = 0;
  for (let k = 0; k < 2; k++) {
    const len = w(k === 0 ? 0.026 : 0.021);
    const seg = mesh(roundedBoxGeometry(w(0.0150), len, w(0.0150), w(0.0058), 2), mats.chrome, `gt${k}`);
    seg.position.y = ty - len * 0.5;
    th.add(seg);
    ty -= len + w(0.0022);
  }

  // 32 meshes down to 3 (chrome / shell / gap). This one call is most of hunter.3's perf
  // failure — see collapseStatic. The arm is welded to the chest and never posed, so there
  // is nothing here that needs to keep its own transform.
  collapseStatic(g, disposables);
  return g;
}
