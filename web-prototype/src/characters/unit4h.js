import * as THREE from 'three';
import { roundedBoxGeometry } from '../views/_studio.js';
import { unit4hMaterials, brandAspect } from '../materials/surfaces/robot.js';

/**
 * UNIT-4H — the player robot.
 *
 * Built from RIGID PARENTED PARTS, not skinned geometry. It is a visibly segmented
 * machine, so rigid parts are more faithful to the turnaround sheet than any skin, they
 * cost nothing to animate, and — the reason that matters most here — a limb is literally
 * a subtree you can reparent. Limb detachment is the game's whole inventory and HP system,
 * so `limbs.armL` etc. are designed to be `.removeFromParent()`d and dropped into the
 * world, or reattached, with no geometry surgery.
 *
 * EXPORT SHAPE — other systems depend on this, keep it stable:
 *
 *   const u = buildUnit4H({ height: 1.7 });
 *   u.root        THREE.Group, origin at the soles, +Z forward, +Y up
 *   u.joints      { hips, spine, chest, neck, head, shoulderL/R, elbowL/R, wristL/R,
 *                   hipL/R, kneeL/R, ankleL/R }  — rotate these, never the parts
 *   u.parts       { head, faceplate, chestShell, abdomen, pelvis, upperArmL, forearmL,
 *                   handL, thighL, shinL, bootL, ... } — the meshes
 *   u.limbs       { armL, armR, legL, legR } — detachable subtree roots (== shoulder/hip
 *                   joint groups). Each carries userData.limb = { id, socket, mass }
 *   u.sockets     { shoulderL/R, hipL/R } — where a limb reattaches; a gadget-limb or a
 *                   scavenged limb parents here
 *   u.setPose(p)  p = { jointName: [x,y,z] | THREE.Euler } in radians, missing = rest
 *   u.height      the height it was built at
 *   u.materials   the shared material set
 *   u.dispose()
 *
 * PROPORTIONS come from ART_MANIFEST.md, which records landmark fractions measured off
 * Dev Art 1785277053522. They are expressed as fractions of total height so the rig
 * scales, and they are the spec — do not "improve" them by eye.
 *
 * ROUND 12 NOTE — a prior pass on this file drifted several widths away from the manifest
 * ("was 0.135, the art's helmet is WIDER than it is tall" etc.) and those specific
 * rationalisations were wrong: they made the head read as a sphere (defect #1). That pass
 * is why the head is now a genuine rounded cube.
 *
 * ROUND 14 NOTE — SHOULDERS, MEASURED. The manifest's "shoulder-to-shoulder ≈ 0.245 of
 * height" is flagged unverified in the manifest itself, and it is WRONG. Measured off
 * Dev Art 1785277053522 with a hand-placed crop (the method the manifest asks for), the
 * front figure runs head-crown y=107 to sole y=721, so H = 614 px, and:
 *
 *   mint cap, per side   47 px wide x 56 px tall   = 0.0765 H x 0.0912 H
 *   cap outer to outer   230 px                    = 0.375 H   <-- the real shoulder width
 *   cap vertical span    y 242..297                = 0.780 H down to 0.691 H
 *   upper arm centre     ~102 px off centreline    = 0.167 H
 *   chest half width     ~69 px                    = 0.112 H
 *
 * So the art's shoulder silhouette is ~0.375 H, not 0.245 H. A previous pass narrowed
 * `shoulderSpan` to chase 0.245 and sized the mint cap down until it was smaller than the
 * chrome ball and the upper arm that it is supposed to hood — at which point the cap was
 * entirely INSIDE the arm and the character's signature colour rendered as zero mint
 * pixels. Both a critic and the lead then read the result as slimmer and lankier than the
 * art. The numbers above are what the sheet actually measures; judge changes here by eye
 * against the sheet, and do not re-narrow to hit 0.245.
 *
 * ROUND 30 NOTE — THE ARM PASS THE ROUND-14 NOTE ASKED FOR IS DONE. It read: "the sheet's
 * shoulder ball is at ~0.728 H and its elbow at ~0.544 H... this file is now at 0.790 H and
 * 0.670 H... closing the rest of the gap is arm-proportion work (elbow down, upper arm
 * lengthened, fingertips from 0.415 H to the sheet's ~0.35 H) and it belongs in its own
 * pass." Round 28 did the internal re-split; round 30 dropped the pivot. Now:
 *
 *                    shoulder   elbow    wrist    fingertip
 *   sheet              0.728    0.544    0.425      0.350
 *   round 27           0.790    0.670    0.515      0.415
 *   round 30           0.740    0.573    0.465      0.365
 *
 * WHAT IS STILL OPEN, and it is TORSO work rather than arm work — see the round-30 report.
 * `measure.mjs` puts the front figure 124% WIDE at 0.790 H, where the sheet has only a neck
 * and this file still has a near-full-width chest: `chestH` runs the shell up to 0.815 H
 * against the sheet's ~0.78 H shoulder line. That single band is the largest silhouette
 * error left on the piece and it dominates the IoU. Nothing in the arms can reach it.
 */

// landmark heights, as fractions of total height
const L = {
  headTop: 1.000,
  chin: 0.845,
  // The manifest says 0.815, which puts the shoulder pivot only 0.030 H below the chin —
  // above the top of the shoulder mass, which is impossible, and it perched the mint caps
  // up beside the neck. The sheet measures the ball at ~0.728 H. Moved partway, to 0.790:
  // `upperArmLen` below is shortened by exactly the same 0.025 H, so the elbow, wrist,
  // hand and every gadget/limb attach point stay at the world positions they had. Closing
  // the rest of the gap needs the elbow to come down too, which is arm-proportion work.
  /*
   * ROUND 30 — 0.790 -> 0.740, and this is the "own pass" the note below says it needs.
   *
   * The sheet's ball is at ~0.728 H. 0.790 was a compromise reached when the ELBOW could not
   * move; round 28 moved the elbow, so the only thing still holding the arm 0.062 H too high
   * was the pivot itself. Everything that hangs BELOW the pivot drops with it — elbow
   * 0.623 -> 0.573 H (sheet 0.544), wrist 0.515 -> 0.465 H (sheet 0.425), fingertip
   * 0.415 -> 0.365 H (sheet 0.350) — and everything that sits ON the shoulder is offset by
   * exactly +0.050 H inside the group so it does not move at all: ball -0.030 -> +0.020,
   * collar and cap -0.050 -> 0, boss -0.057 -> -0.007. The mint cap still measures
   * 0.798..0.682 H against the sheet's 0.780..0.691.
   *
   * TWO ITEMS CLOSE ON THIS ONE NUMBER, which is why it is worth the risk of a rig change.
   *   - Item 3, the upper-arm segment. The exposed chrome between the cap's lower edge
   *     (0.690 H) and the top of the elbow hub was 0.690 - 0.661 = 0.029 H. It is now
   *     0.690 - 0.611 = 0.079 H. Round 28 correctly re-split the arm and then had the gain
   *     eaten by the hub; the hub is not oversized (the plank shot's spool is ~1.3x its own
   *     forearm, ours is 1.24x) — the arm was simply mounted too high to have room.
   *   - Silhouette. `measure.mjs` had figure 1 at -44% against the sheet at 0.415 H and -39%
   *     at 0.285 H, and the sheet's WIDEST point is 0.415 H because that is where its hands
   *     are. Ours had its fingertips there, contributing nothing.
   *
   * The cap now sits centred ON the pivot, which is what the sheet draws and what makes the
   * -0.050 H offset inside the group unnecessary rather than merely compensated.
   */
  shoulder: 0.740,
  chestDecal: 0.755,
  waist: 0.655,
  hip: 0.545,
  fingertip: 0.415,
  // MEASURED, moved 0.285 -> 0.263. The knee PIVOT is the centre of the ringed disc in the
  // sheet's profile view (y=560.5 px, i.e. 0.261 H) and the centre of the kneecap plate in
  // the front view (0.259 H); 0.285 H is where the seam at the TOP of the knee band sits,
  // which is what the old value had latched onto. Nothing outside this file reads L, and
  // the ankle does not move — the thigh lengthens and the shin shortens by the same amount,
  // to the sheet's 0.282/0.208 split. It matters for the panel read: the old split gave a
  // stubby thigh with the knee mass too high, which reinforced the lobed look.
  knee: 0.263,
  ankle: 0.055,
  sole: 0.000,
};

// Widths / sizes, also fractions of total height.
const W = {
  // PIVOT spacing between the two shoulder joints, not the visible silhouette width.
  // The art's arms hang with their centres ~0.167 H off the centreline and the mint caps
  // hood them out to a 0.375 H total silhouette (see the ROUND 14 note above). Pivot at
  // +/-0.130 H puts the arm outer edge at 0.163 H and leaves the cap to carry the last
  // 0.025 H, which is what makes the cap read as hooding the arm rather than sitting
  // inside it. It also clears the thigh by a wider margin than the old 0.185 did:
  // thigh outer edge is pelvisW*0.5 + thighR = 0.127 H, arm inner edge is 0.116 H at the
  // shoulder and the hand hangs at 0.145 H, outboard of the leg as every Dev Art pose shows.
  shoulderSpan: 0.290,
  /*
   * ROUND 31 — 0.156 -> 0.172, and it is the LARGEST measured silhouette error on the sheet,
   * not a taste call. `measure.mjs` reports the raw width at H 0.845 as -59.8% / -59.9% /
   * -62.0% on figures 1-3, the worst number in the whole table and worse than anything the
   * arms or legs contribute. It is not an arm defect, which is how it has been read: at
   * 0.845 H the reference is still solid HEAD (width 0.151-0.163 H) and this rig is already
   * down to bare NECK (0.061 H). The reference's head runs crown 1.000 to jaw ~0.833 H;
   * ours ran 1.000 to 0.845 H and its bottom third is a sphere, so it has almost no width
   * left where the sheet still has its full jaw.
   *
   * The head grows DOWNWARD — `head.position.y` drops by exactly the growth — so the crown
   * stays where it is and nothing below the neck moves. Growing it upward instead would
   * lengthen the figure and shift every other landmark's H fraction by 1.4%.
   */
  headH: 0.172,     // manifest: "~0.155 tall"; the sheet measures ~0.167 and this rig's jaw is rounder
  headW: 0.152,     // manifest: "~0.135 wide" (taller than wide, not the reverse)
  headD: 0.150,     // not given explicitly; kept near-equal to headW/headH for a true dome (round 16)
  bootLen: 0.132,   // manifest: "≈0.115"; a hair over for the "big, soft, rounded" boots text
  // Round 31: 0.078 -> 0.064, with `soleH` split out of it. Measured on the sheet's profile
  // boot, normalised on H = 614 px: the whole boot is 0.080 H from the ground to its collar
  // and the dark sole band is 0.016 H of that. `buildBoot` grounds itself off `L.ankle`, so
  // these two now sum to the boot's real height instead of hanging off a hardcoded offset.
  bootH: 0.064,
  soleH: 0.016,
  bootW: 0.088,
  handLen: 0.075,   // manifest: "≈0.075 long"
  // ROUND 32: 0.232 -> 0.220, and it is bought back in `armOut` so the SILHOUETTE does not
  // move. `measure.mjs` reports the front figure's arm daylight covering 31% of the
  // 0.80..0.36 H band against the sheet's 75%, while the total width through that band is
  // within 1.5% — so the mass is right and the DISTRIBUTION is wrong: this chest fills the
  // space the sheet leaves as air between torso and arm. Narrowing the chest 0.006 H per side
  // and tilting the arm out by the same opens the gap for a net silhouette change of 0.001 H.
  chestW: 0.220,
  // ROUND 32: 0.142 -> 0.158. Measured on the sheet's profile figure by dumping the silhouette
  // span row by row (crown y 118, sole y 733, H = 615 px): the torso runs 0.177 H deep at
  // 0.75 H and 0.174 H at 0.65 H, against 0.144 / 0.129 here. The DEPTH was the deficit at
  // every height below the collar; `CHEST_P` in the build handles the shape, this is the scale.
  chestD: 0.158,
  waistW: 0.118,
  // PELVIS: two numbers, because they were one and the coupling was a trap. `pelvisW` is the
  // HIP PIVOT spacing — the leg sockets, the hip hubs and the bearing discs all hang off it, so
  // moving it moves the whole stance. `pelvisShellW` is the visible saddle block. The sheet's
  // pelvis is a broad plate over a narrow pivot spacing; sharing one constant meant widening the
  // shell to meet the new waist module would have splayed the legs with it, and the stance
  // already measures +8% wide.
  /*
   * ROUND 33 — 0.142 -> 0.120, and it is the largest single silhouette lever on the piece.
   *
   * `measure.mjs` gained a CROSS-SECTION row this round (mass | air | mass, from the same
   * per-row runs the daylight metric already used) because the daylight complaint could not be
   * acted on without one: total width was within a few percent of the sheet at every band while
   * the daylight covered 30% of the arm run against 75%, and an arm-tip-to-arm-tip number is
   * identical either way. Front figure, H fractions, render vs sheet:
   *
   *            render                             sheet
   *   0.655    0.069 [0.042] 0.278  (arm fused)   0.072 [0.015] 0.215 [0.015] 0.073
   *   0.600    0.084 [0.051] 0.293               0.067 [0.042] 0.189 [0.042] 0.067
   *   0.545    0.069 [0.018] 0.329               0.075 [0.055] 0.172 [0.054] 0.076
   *   0.480    0.056 [0.032] 0.330               0.063 [0.046] 0.228 [0.046] 0.063
   *
   * Solved for the middle mass on a symmetric figure that gives a torso of 0.167 / 0.158 /
   * 0.242 / 0.242 against the sheet's 0.215 / 0.189 / 0.172 / 0.228. So the CHEST is already
   * NARROWER than the art at the waist and it is the HIP BAND that is +41% — the arm has
   * nowhere to be except on top of it. Confirmed by direct crop at 4x (`215,420,300,160`
   * against `95,305,278,148`): the hip block measures 165 px on a 663 px figure = 0.249 H,
   * the sheet's 111 px on 615 = 0.181 H.
   *
   * TWO INDEPENDENT MEASUREMENTS PICK THE SAME NUMBER, which is why this is 0.022 and not a
   * guess. Moving the pivots in by 0.011 a side also narrows the STANCE by 0.022, and the
   * stance is over by almost exactly that: 0.246 against the sheet's 0.224 at 0.100 H and
   * 0.261 against 0.241 at 0.285 H. Both land on the sheet.
   *
   * Round 32's note here reads "the stance already measures +8% wide" and then leaves the hips
   * alone because its brief had asked to WIDEN them. The +8% was right and the conclusion was
   * half of one — it is evidence for narrowing, and nothing was done with it.
   */
  pelvisW: 0.120,
  pelvisShellW: 0.166,
  // HIP SIZES LIVE IN `HIP` BELOW. `hipDiscR` was 0.088 and is gone with the plate it sized;
  // leaving it here is the `W.bootH` trap (a constant that looks live and is not).
  // The sheet measures the upper arm at ~0.0265 H radius where it leaves the shoulder.
  // It matters here beyond the "slim limbs" brief: the mint cap has to be visibly WIDER
  // than the arm it hoods, so a fat upper arm eats the cap's silhouette from the inside.
  upperArmR: 0.029,
  forearmR: 0.031,
  // LEG SIZES LIVE IN `LEGP` BELOW, NOT HERE. `thighR` / `shinR` / `kneeDiscR` were removed
  // rather than left in place: a W entry nothing reads is exactly the `W.bootH` trap, where
  // three passes resized a part through a constant that was never wired to anything. The
  // thigh's outer edge, which the shoulder-span note above reasons against, is now
  // LEGP's 0.101 H width at the hip, i.e. 0.0505 H half-width against that note's 0.056.
};

/**
 * THE LEG PROFILE — one continuous curve for the whole limb, measured off
 * Dev Art 1785277053522, not authored per segment.
 *
 * Rows are [height fraction, full WIDTH, full DEPTH, z centre offset, corner radius as a
 * FRACTION of the section's smaller half-axis]. The first four are fractions of total
 * height. Measured by scanning the sheet row by row for the
 * silhouette edges: the front figure gives width, the left-profile figure gives depth and
 * the fore/aft drift of the centreline. Both figures were normalised on crown y=107 /
 * sole y=721, H = 614 px, the same landmarks the ROUND 14 shoulder note uses.
 *
 * Three things in here are worth not "improving" by eye:
 *
 *  - The limb is DEEPER than it is WIDE at every height (0.078-0.112 deep against
 *    0.060-0.101 wide). Building it round, or square in section, is part of what made the
 *    old rounded boxes read as pods.
 *  - The width is NOT monotonic. It narrows into the knee, holds through the knee band,
 *    narrows again just below it and then swells back out for the calf. That S is most of
 *    what makes the sheet's leg read as a shaped panel instead of a cone.
 *  - The centreline drifts BACKWARD below the knee, ~0.014 H at the calf. The shin does
 *    not sit on the thigh's axis on the sheet and it should not here.
 *
 * The corner-radius column is a FRACTION, not a length, because the limb has to stay the
 * same softness as it tapers. It sits near 0.56 the whole way down, which leaves a broad
 * flat front face inside a generous roll. Round 20 drove this the other way — 0.038 H down
 * to 0.014 H absolute, on the theory that a panel read comes from hard edges — and the
 * result is visible in `Dev Art/1785308800211.png`, the plank shot: the sheet's limb is a
 * SOFT tapered form whose panel read comes from scribed seams and a slow highlight, with
 * almost no hard facet anywhere on it. Hard-edging it is what turned each segment into a
 * box, and a stack of boxes is a stack of lobes.
 *
 * First and last rows are guards so the interpolator has neighbours at both ends.
 */
/*
 * ROUND 33 — THE TOP THREE ROWS TAPER INTO THE HIP. Widths 0.096/0.101/0.098 -> 0.084/0.089/
 * 0.097 and depths 0.106/0.112 -> 0.104/0.108.
 *
 * The old table had the leg at its WIDEST at the hip pivot and narrowing all the way down, so
 * the silhouette's widest leg point sat at 0.556 H. `measure.mjs` flags that directly —
 * `hips 0.434 at 0.556 vs ref 0.447 at 0.460  <-- LANDMARK MOVED` — and the sheet's own
 * cross-section says the same thing from the other side: it runs 0.172 H across at 0.545 and
 * 0.228 H at 0.480, i.e. the pelvis is NARROWER than the thighs under it and the leg swells
 * as it leaves the joint. Ours was flat at 0.242 through both.
 *
 * The floor on these numbers is structural, not aesthetic: the thigh has to CLOSE OVER the hip
 * hub, so its half-width at the pivot must exceed `HIP.hw` (0.042) and its half-depth must
 * exceed `HIP.hd` (0.050). 0.089 x 0.108 leaves 0.0045 and 0.004 H of closure. Anything
 * narrower has to shrink the bearing with it, and round 31 measured the bearing against the
 * sheet at 0.0635 H and got it right — that is not a trade worth taking.
 *
 * The depth change is the profile figure's, not the front's: figure 2 measures +15.0% at
 * 0.545 H, the worst depth error on the piece, against a hard-won -2.9% at 0.655 H that this
 * does not touch (0.655 H is chest, and `chestD` is unchanged).
 */
const LEGP = [
  [0.575, 0.084, 0.104, -0.007, 0.55],
  [0.545, 0.089, 0.108, -0.006, 0.55],   // hip pivot
  [0.470, 0.097, 0.109,  0.002, 0.55],
  [0.400, 0.095, 0.107,  0.007, 0.56],
  [0.340, 0.090, 0.102,  0.005, 0.57],
  [0.300, 0.086, 0.097,  0.003, 0.56],
  [0.263, 0.086, 0.094,  0.000, 0.56],   // knee pivot
  [0.230, 0.081, 0.095, -0.005, 0.56],
  [0.195, 0.083, 0.097, -0.010, 0.55],
  [0.160, 0.079, 0.094, -0.014, 0.55],
  [0.120, 0.070, 0.087, -0.014, 0.56],
  [0.090, 0.063, 0.081, -0.011, 0.58],
  [0.055, 0.060, 0.078, -0.009, 0.60],   // ankle pivot
  [0.030, 0.058, 0.076, -0.009, 0.60],
];

/**
 * THE KNEE HINGE, as a section in its own right.
 *
 * The first cut of this rebuild made the hub the limb's FULL knee section revolved, which
 * seals perfectly but renders as a collar taller than the limb is deep — a fourth lobe in
 * place of the three that were removed. Both references say the hinge is SMALLER than the
 * limb it interrupts: the turnaround's profile view puts the knee circle at 0.072 H against
 * a 0.094 H limb depth, and the plank shot shows a compact ribbed spool with the thigh and
 * the shin closing over it from above and below.
 *
 * So the limb TUCKS into this section over `tuck` either side of the pivot and the hub is
 * generated from it. Everything the seal depends on still holds — the hub is a body of
 * revolution about the bend axis and the limb's terminal ring IS its equator — but the knee
 * now sits slightly inside the limb's silhouette instead of standing proud of it.
 */
/*
 * ROUND 30 — SOLVED FROM THE NOTE ABOVE RATHER THAN TUNED, and the four numbers moved
 * together because they are one constraint, not four.
 *
 * WHAT WAS MEASURED, and it settles a reading two rounds got backwards. On the turnaround's
 * profile figure (crop `495,522,85,85` at 7x) the knee shows a THICK BLACK RING with the
 * limb's own surface still visible OUTSIDE it — so that ring is the disc assembly's outline,
 * not the barrel's silhouette, and it measures 42 source px on a 614 px figure = 0.068 H
 * across. `boltFace` puts its outline at `(hd - r) * 0.99`, so `hd` 0.040 with `r` 0.009 was
 * drawing that ring at 0.061 H: about 12% undersized, which is most of why the knee read as
 * "a separate small disc" beside a band rather than as one bearing.
 *
 * `hd` 0.0408 / `r` 0.0065 puts it at 0.0680 H exactly. `cz` -0.0037 then follows from the
 * OTHER thing the sheet shows and this file has recorded since round 23 — the knee circle is
 * flush with the rear silhouette — because the crowned barrel is 0.0433 H and the limb's rear
 * is at -0.047 H. The old -0.006 stood the barrel 0.0015 H PROUD of the limb's back.
 *
 * A 0.0348 / -0.010 pair was tried first, solving instead for the same note's "inset ~0.02 H
 * from the front". It renders a visibly undersized bearing — the two halves of that prose
 * description are not consistent with each other, and the pixel measurement is the one to
 * trust.
 *
 * ⚠ WHAT THIS DEPENDS ON: the barrel is 0.0074 H behind the limb's front line, so the
 * KNEECAP must be a full-width front shell rather than a narrow plate. Narrowing the cap
 * without also raising `hd` puts a plate over a barrel that falls away under it, and the
 * wedge under the overhang is the "rectangular vent slot" this round removed.
 */
const KNEE = { hw: 0.040, hd: 0.0408, cz: -0.0037, r: 0.0065, tuck: 0.042 };

/**
 * THE ELBOW HINGE — round 28, item 2: "it almost looks the same as the knee actually just
 * without the kneecap." The reference agrees; see `Dev Art/1785277053522.png`, the BACK
 * figure's right elbow, which is the clearest joint on the whole sheet: a rounded barrel
 * hub with a recessed concentric-ring disc and a dark bore on its side face, the upper arm
 * plugging into it from above and the forearm leaving it below. No cap plate anywhere.
 *
 * Same section-plus-`kneeHub` construction as the knee, so it inherits the property that
 * matters: a body of revolution about the BEND AXIS is invariant under that rotation, so
 * the joint seals at every elbow angle by construction rather than by tuning. `char.
 * locomotion` and the hunter both drive these past 2 rad.
 *
 * Sizes are measured off that back-view elbow, normalised on the sheet's H = 614 px:
 * barrel radius ~0.031 H against an arm radius of ~0.032 H at the joint — i.e. the hub is
 * only slightly proud of the limb, exactly as the knee's is. Taken to 0.036 H here because
 * this arm's chrome tube is slimmer than the sheet's; the ratio, not the absolute, is what
 * makes it read as a hinge instead of a bulge.
 *
 * ⚠ CEILING, and it is a hard one: `mountSleeve()` in `src/gadgets/index.js` is a cylinder
 * of radius 0.040 H that has to COVER this hub when a gadget replaces the forearm. Both
 * `hd` (radial) and `hw` (axial) must stay under that or a fitted nail gun leaves the elbow
 * poking out through its own cuff.
 */
const ELBOW = { hw: 0.032, hd: 0.036, r: 0.0085, recess: 0.0042 };

/**
 * THE HIP HINGE — round 28, items 4 and 5.
 *
 *   4: "The hip connectors are way too big. And at the wrong angle. They should sit in the
 *       socket of the robots leg at an angle that makes sense."
 *   5: "the top of the thigh should also taper off on the same angle as the hip connectors."
 *
 * WHAT WAS THERE. A `driveDisc` of radius 0.088 H — bigger than the whole thigh is wide —
 * bolted flat to the pelvis and canted `rotation.y = -0.62` (35 deg) toward the camera. The
 * cant was added purely so the disc would READ from the front view; it is a framing fix
 * applied to the object. At that size and angle the two discs render as dark horseshoes
 * hanging over the thighs, and there is nothing like them on any reference.
 *
 * THE ANGLE THAT MAKES SENSE, and it is not a matter of taste: a hip hub is the axis the
 * leg turns on, so it is a body of revolution about the LEG'S FLEXION AXIS. That is X, in
 * the hip joint's own frame — which means it inherits whatever the hip is rotated to and
 * needs no cant of its own, and it means the joint SEALS at every hip angle by construction,
 * exactly as `kneeHub` does at the knee. Zero is the correct number here; it is a derived
 * result, not a default.
 *
 * WHY IT IS SMALLER, and where the number comes from. It is measured against the leg it
 * drives rather than picked: the thigh's own section at the hip pivot is 0.101 x 0.112 H
 * (`LEGP`), so a hinge that the limb closes OVER — the relationship both references show,
 * and the one `KNEE` already encodes — has to sit inside that. 0.084 x 0.100 H is the same
 * inset the knee uses. The visible ring disc is 0.028 H in radius against the old 0.088 H.
 *
 * WHERE THE PARTS LIVE, and this is a draw-call decision as much as a mechanical one.
 * `collapseDrawCalls` emits one mesh per material per joint and every mesh costs FOUR draw
 * calls on this sheet (measured: 148 mesh instances, 600 calls). So:
 *   - the HUB is `mats.shell` inside `j.hip`, where it merges with the thigh: free, and it
 *     rotates with the leg, which is what makes the tuck seal.
 *   - the ring disc, its bore and its outline ring hang on `hips`, which already carries
 *     chrome and gap: also free. That is not a dodge — the drive hub's housing belongs to
 *     the PELVIS on the reference (`Dev Art/1785301780641.png` is a legless torso and the
 *     two hubs are still on it), and being centred on the flexion axis it is invariant under
 *     the only rotation that matters.
 *   - `socketR`/`recess` are sized so the disc still clears the socket wall at the widest
 *     hip abduction anything asks for (0.16 rad, `game/locomotion.js`): that swings the
 *     hub's end face 0.0064 H against a fixed disc, and the clearance is 0.008 H.
 * Net cost of items 4 and 5 together: zero draw calls.
 */
const HIP = {
  /*
   * ROUND 33 — 0.042 -> 0.038. This constant is the thigh's half-width AT THE PIVOT (the tuck
   * makes the window's terminal ring the hub's own section), so it is also the leg's
   * contribution to the silhouette at 0.545 H.
   *
   * ROUND 34 — 0.038 -> 0.030, AND THE BEARING THAT SAT ON THIS FACE IS GONE. Both halves of
   * that come out of one measurement, and the arithmetic is worth writing down because the
   * brief this round was given said the disc was "the main driver" of the overwidth and it is
   * only about half of it.
   *
   * `measure.mjs --refband 0.12,0.96`, figure 1's cross-section at 0.545 H, reads
   * `ref 0.075 [0.055] 0.172 [0.054] 0.076` — arm, daylight, BODY 0.172, daylight, arm. The
   * sheet's body at the hip pivot is 0.172 H and its own pelvis brief is essentially the whole
   * of it: the thigh NECKS IN to the brief's outline and never defines the silhouette. Ours was
   * built from three stacked terms, and each one is a fraction of H per side:
   *
   *     pelvisW/2   0.060   the hip PIVOT spacing — untouchable, the stance rides on it
   *   + HIP.hw      0.038   the hub's outer end face = the thigh's own half-width at the pivot
   *   + disc stack  0.008   boltFace's 0.014-thick disc, pushed a further 0.30*thick out, plus
   *                         a 0.0040 outline ring at faceR*0.99
   *   = 0.106 per side, i.e. 0.212 H — against the 0.214 the round-34 brief quotes and the
   *     0.172 the sheet measures.
   *
   * So deleting the bearing buys 0.016 H of the 0.040 H gap and `HIP.hw` has to find the rest.
   * 0.030 lands the band at 0.180 H (+4.7% on the sheet) against +23% before, and it is
   * ALSO what the sheet's own drawing asks for independently: with the brief at
   * `pelvisShellW` 0.166 H, a thigh that necks to 0.180 H at the pivot and swells back to
   * 0.220 H by 0.480 H reproduces the sheet's 0.172 -> 0.228 exactly, including the fact that
   * the widest point of the hip region is BELOW the pivot rather than at it.
   *
   * Nothing about the seal moves: the hip tuck makes the thigh's terminal ring the hub's own
   * section (`legRings`), so `hw` is by construction the same number in both, at every hip
   * angle. `hd` is untouched — the profile figure's hip depth is a separate axis and this
   * change does not claim it.
   */
  hw: 0.030,        // half-length along the bend axis
  hd: 0.050,        // barrel radius — the thigh's 0.056 H half-depth closes over it
  r: 0.011,
  /*
   * ROUND 33 — 0.006 -> -0.006, MOVED WITH `LEGP`'s top rows so the two still agree.
   *
   * `critic-robot-33`'s item 3 reads "hip disc ~40-50% elbow-occluded in left profile — the
   * sheet's same view shows its bearing". THE SECOND HALF OF THAT IS WRONG, and it is worth
   * saying plainly because the fix it implies is the opposite of the right one. Crop the
   * sheet's own left profile at the hip (`483,350,115,105` at 7x): there is exactly ONE bright
   * ringed bearing in that band and it is the ELBOW. The hip is a set of DARK CRESCENT
   * RECESSES under the pelvis with the forearm crossing them — the sheet's profile does not
   * show an unobstructed hip bearing either.
   *
   * The bearing itself is not in doubt: the plank shot (`1785308800211.png`, crop
   * `610,420,180,140` at 7x) draws it as a large ringed disc with a knurled rim in a deep
   * recess, which is what rounds 30 and 31 built. So the defect is neither the disc nor the
   * occlusion — it is that this rig puts TWO equally bright ringed bearings 0.0635 H apart in
   * the one view that sees both along their axes, and they read as a pair of goggles.
   *
   * Measured: elbow hub at (z 0.063, y 0.573) radius ~0.036; hip disc at (z 0.006, y 0.545)
   * radius 0.032. Centres 0.0635 H apart against a 0.068 H radius sum, so they overlap by
   * construction. Taking the hip axis 0.012 H back puts the centres 0.0745 H apart and they
   * separate. Back rather than forward because the sheet's own hip sits under the buttock, and
   * because the alternative — pushing the arm further forward — would worsen figure 2's depth,
   * which already measures +15.0% at this exact band.
   *
   * The silhouette does not move: the thigh's rear face goes from z -0.048 to -0.060 against a
   * buttock at -0.075, so it stays inside. The seal does not move either — the hip tuck makes
   * the thigh's terminal ring the hub's own section, `cz` included, so the two cannot disagree.
   */
  cz: -0.006,       // matches LEGP's centreline offset at the hip pivot
  /*
   * ROUND 34 — THE SOCKET IS A DISH, NOT A BORE (0.036 / 0.013 -> 0.022 / 0.0018), because
   * there is no longer a bearing to seat in it. Left at 0.013 deep with the disc gone, the
   * hub's outer end face carries an open 0.072 H cylindrical hole whose floor screen-space AO
   * would render as a black circle — i.e. the same round feature the sheet does not have,
   * drawn in the negative. A 0.0018 H dish keeps `kneeHub`'s profile non-degenerate and shades
   * as nothing at this scale.
   */
  socketR: 0.022,   // radius of the shallow dish in the outer end face
  recess: 0.0018,   // and its depth
  tuck: 0.070,      // how far down the thigh blends into the hub section (item 5)
};

/**
 * Sample LEGP at a height fraction. Cubic Hermite with Catmull-Rom tangents over the
 * table's own (non-uniform) spacing — linear interpolation puts a visible crease at every
 * row once the surface is smooth-shaded, which is precisely the kind of banding this
 * rebuild exists to remove.
 */
function legProfile(yf) {
  const n = LEGP.length;
  let i = 0;
  while (i < n - 2 && yf < LEGP[i + 1][0]) i++;     // table runs top -> bottom
  const A = LEGP[i], B = LEGP[i + 1];
  const P = LEGP[Math.max(0, i - 1)], Q = LEGP[Math.min(n - 1, i + 2)];
  const span = A[0] - B[0];
  const t = span > 1e-9 ? (A[0] - yf) / span : 0;
  const t2 = t * t, t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
  const out = { w: 0, d: 0, cz: 0, r: 0 };
  const keys = ['w', 'd', 'cz', 'r'];
  for (let c = 1; c <= 4; c++) {
    const mA = (B[c] - P[c]) / Math.max(1e-9, P[0] - B[0]) * span;
    const mB = (Q[c] - A[c]) / Math.max(1e-9, A[0] - Q[0]) * span;
    out[keys[c - 1]] = h00 * A[c] + h10 * mA + h01 * B[c] + h11 * mB;
  }
  return out;
}

// ---------------------------------------------------------------------------
// small geometry helpers
// ---------------------------------------------------------------------------

/**
 * THE BOOT'S SECTION OUTLINE, sampled as (point, OUTWARD NORMAL) pairs along an arc that
 * DELIBERATELY SKIPS THE UNDERSIDE — sole to sole, up one flank, over the instep, down the
 * other. It is the path a vamp seam takes on a real boot, and it exists as its own function
 * because the thing it replaces could not take that path at all.
 *
 * ROUND 35 — WHY THE `ExtrudeGeometry` "WELT RING" THAT LIVED HERE COULD NEVER HAVE WORKED.
 *
 * Round 34 replaced the boot's toe seam with `ExtrudeGeometry(roundedRectShape(...))` and
 * described the result as "a WELT RING ... extruded thin, so its rim stands the same amount
 * proud all the way round". `critic-robot-35` re-shot twice and found the razor-straight black
 * diagonal bar completely unchanged. Both halves of that are explained by two facts about the
 * construction, and neither is a parameter:
 *
 *   1. `roundedRectShape` returned a FILLED `Shape` — no hole. `ExtrudeGeometry` of a filled
 *      shape is a SOLID CARD, so there was never a ring in the file at all. This is the exact
 *      hazard `limbScribe` fifteen lines up already warns about in its own doc comment: "a cap
 *      here is a filled disc of the whole cross-section and would render as a dark plate
 *      straight across the limb". The boot had precisely that, and the warning did not reach it
 *      because the boot's seam was built from a different primitive.
 *   2. AND IT WOULD STILL HAVE BEEN A STRAIGHT BAR AS A TRUE RING. The mark's visible part is
 *      its rim, the rim is a closed planar loop, and a PLANE meets the boot's flat flank in a
 *      STRAIGHT LINE — always, at every tilt. Round 34 moved the tilt from -0.16 to +0.28 rad;
 *      that changes which way the straight line leans and nothing else. Straightness was a
 *      property of the geometry CLASS, so no amount of retuning inside that class could reach
 *      it, which is exactly why a detailed, sincere writeup and an unchanged render coexisted.
 *
 * IDENTIFIED BY PICK, NOT BY READING (`harness/evidence/_tmp_geoprobe.mjs --pick`, new this round): a
 * Moller-Trumbore cast from the view's own camera through the bar's pixels returns
 * `bootSeamR / unit4h.sole` at 3.684-3.704, and a 46-wide ownership raster over the whole boot
 * draws that mesh as a one-cell-wide straight diagonal from the collar into the sole. That
 * eliminated the other candidates by measurement rather than by argument — no stray `mats.gap`
 * ribbon, no AO or shadow artifact, no z-fight between the boot and sole shells, no bake seam.
 *
 * What the sheet actually draws (crop `565,655,55,70` at 16x, profile figure): a BROKEN
 * hairline that leaves the sole at 0.63 of the boot's length, leans forward about 18 deg, and
 * DIES OUT at 0.75 of the boot's height where the flank rolls over into the instep — it never
 * reaches the collar, and it never crosses the sole. `bottomCut` and the arc's own endpoints
 * are what give a ribbon built on this outline the same two properties for free.
 */
function bootSectionArc(hx, hy, r, N, cut = Math.PI / 3) {
  r = Math.min(r, Math.min(hx, hy) * 0.98);
  const ax = Math.max(1e-6, hx - r), ay = Math.max(1e-6, hy - r);
  const Q = Math.PI / 2, arcC = r * cut, arcQ = r * Q;
  // walk order: out of the bottom-right corner, up the +x flank, over the top, down -x, into
  // the bottom-left corner. Counter-clockwise in XY seen from +z.
  const Ls = [arcC, 2 * ay, arcQ, 2 * ax, arcQ, 2 * ay, arcC];
  const total = Ls.reduce((a, b) => a + b, 0);
  const out = [];
  for (let i = 0; i <= N; i++) {
    let d = (i / N) * total, k = 0;
    while (k < Ls.length - 1 && d > Ls[k]) { d -= Ls[k]; k++; }
    const u = Ls[k] > 1e-9 ? Math.min(1, d / Ls[k]) : 0;
    let x, y, nx, ny, t;
    switch (k) {
      case 0: t = -cut + u * cut; nx = Math.cos(t); ny = Math.sin(t); x = ax + r * nx; y = -ay + r * ny; break;
      case 1: nx = 1; ny = 0; x = hx; y = -ay + u * 2 * ay; break;
      case 2: t = u * Q; nx = Math.cos(t); ny = Math.sin(t); x = ax + r * nx; y = ay + r * ny; break;
      case 3: nx = 0; ny = 1; x = ax - u * 2 * ax; y = hy; break;
      case 4: t = Q + u * Q; nx = Math.cos(t); ny = Math.sin(t); x = -ax + r * nx; y = ay + r * ny; break;
      case 5: nx = -1; ny = 0; x = -hx; y = ay - u * 2 * ay; break;
      default: t = Math.PI + u * cut; nx = Math.cos(t); ny = Math.sin(t); x = -ax + r * nx; y = -ay + r * ny; break;
    }
    out.push({ x, y, nx, ny });
  }
  return out;
}

/** A tapered limb segment, capsule-capped so it reads as a machined part. */
function segment(rTop, rBot, len, radialSeg = 20) {
  const g = new THREE.CylinderGeometry(rTop, rBot, len, radialSeg, 1, false);
  g.translate(0, -len / 2, 0);   // origin at the top, hanging down
  return g;
}

/**
 * Concentric-ring drive disc — the hip and knee signature. Lathe profile, cheap.
 * The dark centre bore is a separate mesh added by the caller (`boreDisc`), so the profile
 * starts at a hub radius rather than at the axis: it needs an actual hole for that mesh to
 * show through. A profile that runs all the way in closes the hub over and the bore
 * disappears.
 *
 * RELIEF / PITCH IS THE WHOLE BALLGAME. This is the constraint that governs the shape, and
 * violating it is what made these discs render as a continuous spiral / nautilus volute
 * instead of stepped rings (diagnosed 2026-08; the earlier "deeper relief reads better"
 * instinct is exactly what caused it).
 *
 * A lathe cannot make a helix — the geometry here is always a true surface of revolution.
 * But viewed `a` degrees off its own axis, the visible surface of each groove migrates
 * radially by `relief * tan(a)` between the near and far side of the disc. When that
 * migration approaches one ring PITCH, the visible arc of ring N lines up with the visible
 * arc of ring N+1 on the opposite side, the arcs chain, and the eye reads one continuous
 * inward-curling groove. Measured on the old profile: relief 0.0711, pitch 0.0416, ratio
 * 1.71 — 0.30 pitch of migration at only 10 degrees off-axis, and 2.4 pitches at the ~54
 * degrees the front turnaround view actually sees the canted hip disc from. It spiralled at
 * every angle except dead-on.
 *
 * So: keep total axial relief WELL under half the ring pitch, give every ring a flat LAND
 * that occupies most of its pitch (the old profile's ridges were knife edges — two
 * coincident profile points — so there was no flat surface to hold still in projection),
 * and cut the grooves shallower than they are wide. Contrast comes from crisp narrow
 * grooves, not from depth.
 */
/*
 * ROUND 30 removed the `relief` parameter. It existed only for the EAR, to soften this
 * profile's grooves toward the sheet's bright annulus; the ear is now `earLens`, a different
 * shape entirely, and no caller passed anything but the default afterwards. A parameter
 * nothing reads is the `W.bootH` trap — it looks like a live knob and silently is not.
 */
function driveDisc(radius, thickness, rings = 3, seg = 40) {
  // SIGN CONVENTION (re-derived and verified numerically): LatheGeometry revolves
  // (x=radius, y=height) around Y, then rotateZ(90°) maps local X = -y. Mounted with
  // `d.position.x = s*offset` and `d.scale.x = s` (to mirror left/right), a profile point
  // at y=+Y lands at s*(-Y) in local X, i.e. at OUTWARD offset -Y once the s is divided
  // back out. So NEGATIVE y in the profile is what ends up pushed OUTWARD, away from the
  // body, on both sides. The previous comment here worked this out as +Y and was off by a
  // sign, so the profile it justified still buried its ring detail inboard.
  const pts = [];
  const hubR = radius * 0.28;              // open hole so the dark bore mesh still shows
  const step = (radius - hubR) / rings;    // ring pitch
  const cut  = step * 0.26;                // groove depth
  const gw   = step * 0.30;                // groove width
  const rise = step * 0.10;                // each land steps this much proud of its outer neighbour
  const face = (i) => -thickness * 0.5 - (rings - 1 - i) * rise;   // NEGATIVE y faces OUTWARD
  pts.push(new THREE.Vector2(hubR, thickness * 0.5));              // hub bore wall
  pts.push(new THREE.Vector2(hubR, face(0)));
  let r = hubR;
  for (let i = 0; i < rings; i++) {
    const r1 = r + step, f = face(i);
    pts.push(new THREE.Vector2(r1 - gw, f));                       // flat land — the ring itself
    pts.push(new THREE.Vector2(r1 - gw * 0.70, f + cut));          // groove wall
    pts.push(new THREE.Vector2(r1 - gw * 0.30, f + cut));          // groove floor
    pts.push(new THREE.Vector2(r1, i + 1 < rings ? face(i + 1) : f));
    r = r1;
  }
  pts.push(new THREE.Vector2(radius, face(rings - 1)));
  pts.push(new THREE.Vector2(radius, thickness * 0.5));            // real outer rim wall
  const g = new THREE.LatheGeometry(pts, seg);
  g.rotateZ(Math.PI / 2);   // face along +X
  return g;
}

/**
 * THE EAR LENS — round 30, item 4, and it is a DIFFERENT SHAPE from `driveDisc`, not a
 * retuning of one.
 *
 * Seven rounds have failed the profile view on this part and every attempt so far has
 * changed its SIZE or its relief. Measured, size was never the defect and the direction was
 * backwards: the sheet's ear (crop `495,118,85,85` at 7x) is 43.6 source px across on a
 * 614 px figure = 0.071 H, i.e. radius 0.0355 H, against this file's 0.032 H. The art's ear
 * is LARGER than ours and still recedes.
 *
 * What it is instead is a BEVELLED WASHER: one broad, near-flat, BRIGHT annulus rolling over
 * a chamfer into the shell, around a flat inner disc a hair below it, with exactly two thin
 * dark lines — one where it meets the shell and one round the inner disc. A `driveDisc` is
 * concentric GROOVES, and a groove facing inward against this studio's dark flag panels
 * reflects nothing else; three grooves of chrome is a black concentric target however
 * shallow the relief is set, which is the "dark bullseye" every critic since round 20 has
 * described. There is no relief value that turns grooves into an annulus.
 *
 * It is built in `mats.shell` for the same reason. That is a choice of which EXISTING
 * material a part uses, not a change to `robot.js`: `char-turnaround.js` records that
 * dropping the scene env took `mats.chrome` from a median luminance of 48 to 6, so every
 * chrome detail on this model now renders near-black, and the sheet's ear is the value of
 * the shell it sits in. The two scribe lines carry the part; the tone stops fighting the head.
 */
/*
 * ROUND 31 — THE ANNULUS WAS RIGHT AND THE CHAMFER WAS MISSING, and this is the first time
 * either side of it has been measured rather than argued.
 *
 * Sampled off `Dev Art/1785277053522.png`, profile figure, and off the round-30 render, in
 * 0-255 luminance (`harness/evidence/_probe_tmp.mjs`):
 *
 *                       sheet    round 30
 *   inner disc           187        180      <- agrees
 *   mid-radius band      125        190      <- INVERTED: ours is BRIGHTER than its own centre
 *   outer rim             99         91      <- a hairline in ours, a wide band in the sheet
 *
 * So the part is not too big and it is not too bright overall. It has no DARK in it except
 * two scribe lines, while the sheet's ear spends its OUTER THIRD OF RADIUS on a single wide
 * shadowed chamfer rolling back into the shell. That chamfer is the whole read: it is what
 * makes the sheet's ear a machined port instead of a pale plate, and its absence is why
 * eight rounds of critics have called ours "a large light disc" no matter what size it was.
 *
 * Radii measured off the sheet's own ear, as fractions of its radius:
 *   0.00 - 0.48   flat bright centre disc
 *   0.48 - 0.50   scribe
 *   0.50 - 0.67   bright annulus land
 *   0.67 - 1.00   the chamfer, falling back to the shell        <- this is what was missing
 *
 * The chamfer is deliberately STEEP rather than deep. Total axial relief across it is
 * 0.9 * thick = 0.012 H against a 0.030 H radius, and it is one continuous cone rather
 * than a ring stack, so the relief/pitch rule that governs `driveDisc` does not apply —
 * there are no rings to chain into a spiral, which is the failure mode a deep concentric
 * version of this part would walk straight into.
 */
/**
 * The LENS proper: the bright face of the port, out to `EAR.wall0`. Everything outboard of
 * that is `earBezel()` below, in a different material, because no arrangement of a white
 * dielectric produces the sheet's dark ring (see the note above).
 *
 * `thick` is how far the face stands PROUD of the shell, not a plate thickness. That is the
 * number two earlier cuts of this round got wrong: at 0.006 H spread over a 0.031 H radius
 * the face is an 11-degree slope, which on a near-white shell under a broad environment is
 * indistinguishable from the shell it sits on — the render showed a blank field with one
 * scribed circle in it, twice.
 */
const EAR = { scribe: 0.50, land: 0.70, wall0: 0.80, wall1: 0.99 };

function earLens(R, thick) {
  const t = thick;
  const pts = [
    new THREE.Vector2(0, -t),                         // flat bright centre disc
    new THREE.Vector2(R * 0.46, -t),
    new THREE.Vector2(R * EAR.scribe, -t * 0.84),     // the scribe step
    new THREE.Vector2(R * 0.56, -t * 0.94),
    new THREE.Vector2(R * EAR.land, -t * 0.96),       // annulus land, near flat -> bright
    new THREE.Vector2(R * EAR.wall0, -t * 0.80),      // roll off the top edge
  ];
  const g = new THREE.LatheGeometry(pts, 26);
  g.rotateZ(Math.PI / 2);   // face along +X, same convention as driveDisc
  return g;
}

/**
 * The BEZEL: the port's outer wall, from the lens's edge down past the shell surface. Steep
 * on purpose — a wall whose normal points radially outward turns away from a key that comes
 * from above and behind, so it reads as a band rather than as a gradient, and it self-shades
 * against the shell it lands on. It runs 0.4 * thick BELOW the shell so the join is buried
 * and cannot show a floating rim wherever the head's curvature falls away under it.
 */
function earBezel(R, thick) {
  const t = thick;
  const rows = [
    [EAR.wall0, -t * 0.80], [0.86, -t * 0.44], [0.92, t * 0.10], [EAR.wall1, t * 0.60],
  ];
  const geos = [];
  for (let i = 0; i < rows.length - 1; i++) {
    const [r0, y0] = rows[i], [r1, y1] = rows[i + 1];
    const g = new THREE.CylinderGeometry(R * r1, R * r0, Math.abs(y1 - y0), 30, 1, true);
    g.translate(0, (y0 + y1) * 0.5, 0);
    geos.push(g);
  }
  const g = mergeGeos(geos);
  // Same sign as earLens and driveDisc: rotateZ(+90) maps profile +y to local -X, so
  // NEGATIVE profile y is the outward direction. Getting this backwards is the exact bug
  // the round-15 note records against the old earDisc().
  g.rotateZ(Math.PI / 2);
  return g;
}

/** The dark centre bore at a drive disc's hub — gap material, not chrome. */
function boreDisc(radius, depth, seg = 18) {
  const g = new THREE.CylinderGeometry(radius, radius * 0.92, depth, seg);
  g.rotateZ(Math.PI / 2);   // face along +X, same convention as driveDisc
  return g;
}

/** Stacked thin rings — the elbow hinge and ankle stack. */
function ringStack(radius, count, gap, thick) {
  const geos = [];
  const total = count * (thick + gap) - gap;
  for (let i = 0; i < count; i++) {
    const r = radius * (i === 0 || i === count - 1 ? 0.9 : 1.0);
    const g = new THREE.CylinderGeometry(r, r, thick, 18);
    g.translate(0, -total / 2 + thick / 2 + i * (thick + gap), 0);
    geos.push(g);
  }
  return mergeGeos(geos);
}

/** Merge a list of geometries (same attribute layout) into one. */
function mergeGeos(geos) {
  let total = 0, idxTotal = 0;
  for (const g of geos) { total += g.attributes.position.count; idxTotal += g.index ? g.index.count : 0; }
  const pos = new Float32Array(total * 3);
  const nrm = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  const idx = new Uint32Array(idxTotal);
  let vo = 0, io = 0;
  for (const g of geos) {
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
    pos.set(p.array, vo * 3);
    if (n) nrm.set(n.array, vo * 3);
    if (u) uv.set(u.array, vo * 2);
    if (g.index) for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.array[i] + vo;
    vo += p.count; io += g.index ? g.index.count : 0;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

/** An ellipsoidal shell, scaled sphere — the shoulder cap and boot masses. */
function blob(rx, ry, rz, seg = 20) {
  const g = new THREE.SphereGeometry(1, seg, Math.max(8, seg >> 1));
  g.scale(rx, ry, rz);
  return g;
}

/**
 * Taper a geometry along Y: scale X and Z by a factor that ramps from `bottom` at the
 * lowest vertex to `top` at the highest. A rounded box cannot taper on its own, and an
 * untapered chest is what makes a torso read as a slab rather than a body — the art's
 * chest is broad at the shoulders and narrows hard into the waist. Also used to turn a
 * plain sphere into the shoulder cap's asymmetric teardrop.
 */
function taperY(geo, bottom, top) {
  geo.computeBoundingBox();
  const bb = geo.boundingBox, y0 = bb.min.y, y1 = bb.max.y, span = Math.max(y1 - y0, 1e-6);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) - y0) / span;
    const s = bottom + (top - bottom) * (t * t * (3 - 2 * t));   // smoothstep, not linear
    p.setX(i, p.getX(i) * s);
    p.setZ(i, p.getZ(i) * s);
  }
  p.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/**
 * Scale X and Z independently along Y by an arbitrary profile — the non-monotonic version
 * of `taperY`.
 *
 * ROUND 32. `taperY` interpolates ONE factor from bottom to top, so it can only ever make a
 * cone. Measured off the sheet's profile figure (crown y 118, sole y 733, H = 615 px, spans
 * read row by row) the torso is not a cone in either axis:
 *
 *   H fraction   0.80   0.75   0.70   0.65   0.60   0.55   0.50
 *   sheet depth  0.138  0.177  0.190  0.174  0.151  0.150  0.159
 *
 * It is a BARREL — narrow at the shoulder line, deepest through the lower chest and belly,
 * pinching only slightly at the waist. A single taper cannot express that, which is why the
 * chest has been simultaneously 30% too deep at 0.790 H and 29% too shallow at 0.655 H: one
 * number was being asked to serve both ends and it split the difference.
 *
 * `fn(t)` takes 0 at the geometry's lowest vertex and 1 at its highest and returns either a
 * single factor or `[sx, sz]`. The chest's own profile is a table (`CHEST_P`) so the decal and
 * the scribe lines can solve the same curve analytically rather than being fitted to it.
 */
function shapeY(geo, fn) {
  geo.computeBoundingBox();
  const bb = geo.boundingBox, y0 = bb.min.y, y1 = bb.max.y, span = Math.max(y1 - y0, 1e-6);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) - y0) / span;
    const s = fn(t);
    const sx = Array.isArray(s) ? s[0] : s, sz = Array.isArray(s) ? s[1] : s;
    p.setX(i, p.getX(i) * sx);
    p.setZ(i, p.getZ(i) * sz);
  }
  p.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/**
 * Sample a [t, a, b] table with a smoothstep between rows. Deliberately NOT a spline: the
 * chest's front-face solver has to reproduce this exactly, and a piecewise smoothstep is four
 * lines in both places, where a Catmull-Rom is a source of drift between them.
 */
function tableAt(rows, t) {
  let i = 0;
  while (i < rows.length - 2 && t > rows[i + 1][0]) i++;
  const A = rows[i], B = rows[i + 1];
  const span = Math.max(1e-9, B[0] - A[0]);
  const u = Math.min(1, Math.max(0, (t - A[0]) / span));
  const s = u * u * (3 - 2 * u);
  return [A[1] + (B[1] - A[1]) * s, A[2] + (B[2] - A[2]) * s];
}

/**
 * Shear X as a function of Y: `x += k * y`, about the geometry's own origin. This is what
 * makes the mint shoulder cap ASYMMETRIC. A tapered ellipsoid alone is a symmetric
 * teardrop with its apex dead centre; the art's cap leans its apex inboard toward the
 * neck while its lower flank bulges outboard over the arm, and a shear is exactly that
 * transform. Applied before the cap is positioned, so `y` is relative to the cap centre.
 */
function shearXByY(geo, k) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + k * p.getY(i));
  p.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/**
 * Bow a flat plate outward along Z, most at its centreline (x=0), tapering to zero at its
 * left/right edges. The back plate was a flat rounded rectangle that read as a missing
 * texture; this is the cheapest way to give it real curvature without lathe/cylinder trig.
 *
 * CURRENTLY UNREFERENCED. Round 28 item 6 deleted the back plate this was written for, and
 * the mark that replaced it is bowed by solving the chest shell's own surface instead —
 * exact, rather than an approximation of a curve. Kept because the sign convention below is
 * a lesson that cost a round, and because it is the right tool for any future plate laid on
 * a flat-ish shell. Do not treat its presence as evidence that anything still uses it.
 *
 * SIGN — `dir` is which way "outward" points for the part being bowed. It defaults to -1
 * because the first caller was the BACK plate, which faces -Z. **A part facing +Z (the
 * faceplate) must pass dir = +1.** Getting this wrong is not a subtle error: the wrong sign
 * pulls the plate's centreline INTO the shell and leaves only its left and right edges
 * proud, so a face renders as two disconnected crescents with a band of shell down the
 * middle and the emissive eyes/mouth vanish completely. That is exactly what round 18 did.
 */
function bendOutZ(geo, amount, dir = -1) {
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const halfW = Math.max(Math.abs(bb.max.x), Math.abs(bb.min.x), 1e-6);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = p.getX(i) / halfW;
    const bulge = amount * (1 - t * t);
    p.setZ(i, p.getZ(i) + dir * bulge);
  }
  p.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/**
 * Wrap a flat plate onto a cylinder whose axis is the X axis through the origin.
 *
 * The plate is authored flat and centred: +/-w/2 in X, +/-arc/2 in Y, its thickness in Z
 * about z=0. `R` is the radius its MID-surface ends up at, so the finished part hugs a
 * hub of radius R instead of sitting on it as a slab. This is what makes the kneecap a
 * flush panel in the knee's own surface rather than a proud lump bolted to the front —
 * the exact distinction `critic-robot-23` drew between the sheet and the old blob().
 *
 * `crown`/`crownAx` carry the host surface's own crown across into the plate. Without
 * them the plate is a plain cylinder laid on a crowned hub, so it sits nearly flush at the
 * centre and ~0.005 H proud at its left and right margins — which renders as two vertical
 * bars with a pinched waist between them, not a panel. That is not a subtle miss: it was
 * the first thing wrong with this part after the crown went in.
 */
function bendAroundX(geo, R, crown = 0, crownAx = 1) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    const z = p.getZ(i) + crownAt(x, crownAx, crown);
    const a = y / R, rr = R + z;
    p.setY(i, rr * Math.sin(a));
    p.setZ(i, rr * Math.cos(a));
  }
  p.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

// ---------------------------------------------------------------------------
// THE VISOR — a cap cut out of the head's OWN surface
// ---------------------------------------------------------------------------
/**
 * WHY THIS EXISTS. Rounds 15-25 built the visor as a flat rounded-box PLATE bolted to the
 * front of the helmet, and every profile check failed the same way: a plate that faces +Z
 * shows only its EDGE from the side, so the left-profile view got a blue sliver with its
 * own separate outline standing proud of the dome, and the chrome ear disc won the head by
 * default. Widening the plate, bowing it with `bendOutZ` and shrinking the ear were all
 * tried; none of them can work, because the defect is not the plate's size, it is that a
 * plate has an edge at all. On the sheet the blue screen is part of the helmet's surface —
 * its outer boundary IS the head's silhouette through the whole front third of the profile.
 *
 * WHAT REPLACES IT. A patch of the head's own surface, offset outward by `off`. The helmet
 * is `roundedBoxGeometry(headW, headH, headD, r)`, i.e. exactly the Minkowski sum of a box
 * of half-extents `box` and a ball of radius `R`; `headSurface()` below returns the point
 * and normal where a ray from the head centre leaves that solid, so a grid of rays through
 * an angular window produces a cap that is flush with the helmet by construction. It cannot
 * float, it cannot show an edge-on sliver, and its silhouette cannot disagree with the
 * head's, because it is the head's.
 *
 * The window is measured off `Dev Art/1785277053522.png`, both figures, normalised on the
 * head's own silhouette box:
 *   front view   blue width / head width      0.79  -> azimuth +/-50 deg (sin 50 = 0.77)
 *   front view   blue top    / head half-h   +0.61  -> elevation +36 deg
 *   profile view blue depth / head depth      0.17  -> (1 - cos 50) / 2 = 0.18   [agrees]
 * The two views were measured independently and the same 50 deg falls out of both, which is
 * the check that the window is right rather than merely plausible.
 *
 * UV. The face SDF (`FACE_SURFACE`) wants a 0..1 square with the eyes at +/-0.150 and the
 * mouth at -0.150, so UV is authored LINEAR IN ANGLE over a window `azFace`/`elFace` that
 * is deliberately allowed to differ from the cap's own. Two things constrain it:
 *
 *  - **azFace MUST EQUAL elFace.** Arc length per unit uv is R*2*azFace across and
 *    R*2*elFace down, so unequal windows stretch the texture. The first cut used 70/44 to
 *    put the eye CENTRES at the sheet's +/-21 deg, and the 1.6x horizontal stretch that
 *    bought turned the eyes into wide bars and flattened the smile — the mouth is a
 *    difference of two CIRCLES in uv, so an anisotropic map straightens it into a dash.
 *  - 54 deg is the scale. The SDF's eye pair spans uv 0.242..0.758, i.e. +/-0.516*azFace,
 *    and the sheet's spans +/-28.3 deg of head azimuth; 0.516 * 54 = 27.9. It also
 *    independently reproduces the old flat plate's on-screen face size (0.5 * fpW / R_eff
 *    = 53 deg), so nothing about the face's scale changes when the geometry does.
 *
 * The SDF's own eyes are wider and closer together than the sheet's — its position/size
 * ratio is 1.39 against the sheet's 3.0 — and no choice of window fixes both. That is a
 * face-texture question, not a geometry one; the window above splits the difference exactly
 * as the flat plate did, so this rebuild neither improves nor regresses it.
 *
 * u and v are clamped, so a cap wider than its face window gets the edge column — plain
 * glass — no matter what wrap mode the baked texture ends up with.
 */
function headSurface(box, R, d) {
  // sd of the rounded box along the ray; monotonic in t, so bisection is exact enough and
  // cannot pick the wrong root. Solving for the RAY rather than evaluating the support
  // function at a NORMAL is deliberate: the support form needs sign(n.x), which jumps by
  // 2*box.x across the face centreline and would cut a seam straight down the visor.
  const sd = (t) => {
    const mx = Math.max(Math.abs(t * d.x) - box.x, 0);
    const my = Math.max(Math.abs(t * d.y) - box.y, 0);
    const mz = Math.max(Math.abs(t * d.z) - box.z, 0);
    return Math.sqrt(mx * mx + my * my + mz * mz) - R;
  };
  let lo = 0, hi = box.x + box.y + box.z + R + 1;
  for (let i = 0; i < 44; i++) { const m = (lo + hi) * 0.5; if (sd(m) < 0) lo = m; else hi = m; }
  const t = (lo + hi) * 0.5;
  const p = new THREE.Vector3(d.x * t, d.y * t, d.z * t);
  const c = new THREE.Vector3(
    Math.min(Math.max(p.x, -box.x), box.x),
    Math.min(Math.max(p.y, -box.y), box.y),
    Math.min(Math.max(p.z, -box.z), box.z));
  const n = p.clone().sub(c).normalize();
  return { p, n };
}

/**
 * Build the cap. Polar grid in the angular window, so the outline is one ordered ring and
 * the rim skirt falls out of it; the outline itself is a SUPERELLIPSE of exponent `k`,
 * which is the sheet's rounded-rectangle screen rather than a lens or a coin.
 *
 * `skirt` sinks the rim's inner ring BELOW the helmet surface, so the boundary is a real
 * step that catches a highlight and the open back of the shell is buried where no ray can
 * reach it.
 */
function visorCap(box, R, o) {
  const { off, skirt, azMax, elMid, elHalf, k, azFace, elFace } = o;
  const azMid = o.azMid ?? 0;
  const NR = o.NR ?? 14, NA = o.NA ?? 64;
  const pos = [], uv = [], idx = [];

  const put = (u, v, offset) => {
    const az = azMid + u * azMax, el = elMid + v * elHalf;
    const ce = Math.cos(el);
    const { p, n } = headSurface(box, R,
      new THREE.Vector3(Math.sin(az) * ce, Math.sin(el), Math.cos(az) * ce));
    pos.push(p.x + n.x * offset, p.y + n.y * offset, p.z + n.z * offset);
    uv.push(
      0.5 + 0.5 * Math.min(1, Math.max(-1, (az - azMid) / azFace)),
      0.5 + 0.5 * Math.min(1, Math.max(-1, (el - elMid) / elFace)));
    return pos.length / 3 - 1;
  };

  // superellipse |u|^k + |v|^k = 1, parameterised so the ring closes exactly
  const rim = [];
  for (let j = 0; j < NA; j++) {
    const a = (j / NA) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    rim.push([Math.sign(ca) * Math.abs(ca) ** (2 / k), Math.sign(sa) * Math.abs(sa) ** (2 / k)]);
  }

  const pole = put(0, 0, off);
  const ring = [];
  for (let i = 1; i <= NR; i++) {
    const rho = i / NR, r = [];
    for (let j = 0; j < NA; j++) r.push(put(rho * rim[j][0], rho * rim[j][1], off));
    ring.push(r);
  }
  // WINDING, derived: +u is +x and +v is +y on the front of the head, so increasing the
  // superellipse angle is counter-clockwise seen from OUTSIDE, and a fan/quad wound in that
  // order is front-facing without a flip.
  for (let j = 0; j < NA; j++) idx.push(pole, ring[0][j], ring[0][(j + 1) % NA]);
  for (let i = 0; i < NR - 1; i++) {
    for (let j = 0; j < NA; j++) {
      const j1 = (j + 1) % NA;
      const a = ring[i][j], b = ring[i][j1], c = ring[i + 1][j], d = ring[i + 1][j1];
      idx.push(a, c, d, a, d, b);
    }
  }
  // rim skirt: the outer ring dropped to -skirt, i.e. sunk into the helmet
  const inner = [];
  for (let j = 0; j < NA; j++) inner.push(put(rim[j][0], rim[j][1], -skirt));
  const outer = ring[NR - 1];
  for (let j = 0; j < NA; j++) {
    const j1 = (j + 1) % NA;
    idx.push(outer[j], inner[j], inner[j1], outer[j], inner[j1], outer[j1]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** A mirrored transform inverts triangle winding; put it back or the part renders inside-out. */
function flipWinding(geo) {
  const idx = geo.index;
  if (!idx) return geo;
  const a = idx.array;
  for (let i = 0; i < a.length; i += 3) { const t = a[i]; a[i] = a[i + 2]; a[i + 2] = t; }
  idx.needsUpdate = true;
  return geo;
}

// ---------------------------------------------------------------------------
// LIMB LOFT — the leg is ONE swept surface, not a stack of primitives
// ---------------------------------------------------------------------------
/**
 * WHY THIS EXISTS. Rounds 18-22 built each leg as separate `roundedBoxGeometry` shells
 * for the thigh and the shin plus a `blob()` kneecap, and every critic through
 * `critic-robot-23` read the result as "three separate rounded lobes, not the sheet's
 * single tapered panel". That is not a tuning failure. A rounded box is a closed volume
 * with its OWN rounded cap at each end, so butting two of them together necessarily
 * produces two waists and three bulges; no amount of adjusting the radii removes a
 * feature that the primitive itself creates. The critic's conclusion — a structural limit
 * of unioned primitive lobes along a limb axis — is correct, so the construction changed.
 *
 * WHAT REPLACES IT. A profile loft. `legProfile()` is a single continuous curve for the
 * whole hip-to-ankle limb, measured off the sheet; `loftShell()` sweeps a rounded-rect
 * cross-section along it. The thigh and the shin are two WINDOWS onto that one curve, cut
 * at the knee, so their shared boundary ring is identical in position and in tangent —
 * there is no seam to bulge because there is no second primitive.
 *
 * HOW IT STILL BENDS. A single surface across a hinge would tear, so the cut at the knee
 * is bridged by `kneeHub()`: the knee section revolved about the bend axis. A body of
 * revolution about the axis it rotates around is INVARIANT under that rotation, so the
 * thigh/hub join is geometrically identical at every knee angle — the seal is a static
 * property, not something that has to survive animation. Because the hub's radius is the
 * limb's own half-depth at the knee, it meets the thigh above and the shin below with a
 * vertical tangent plane on both sides: G1-continuous, so it reads as a band in one
 * surface rather than as a fourth lobe. Its flat side faces are where the sheet's ringed
 * knee disc actually lives (side-facing, recessed), which is the second half of the same
 * critique.
 */

// Cross-section sampling. Fixed vertex count per ring so consecutive rings stitch into a
// strip; flat faces get their own subdivisions so they shade flat instead of being dragged
// into a curve by the corner arcs' averaged normals.
const SEC = { corner: 4, side: 3, face: 5 };
const SEC_N = 4 * SEC.corner + 2 * SEC.side + 2 * SEC.face;

/**
 * CROWN — how far the broad front and back faces bulge past their nominal depth, as a
 * fraction of that depth.
 *
 * A dead-flat face under this studio's three soft keys returns one uniform grey with a
 * hard edge where the corner roll starts, and the first render of this loft read as a
 * stack of soft boxes because of it. The sheet's leg carries a slow gradient right across
 * the front and a bright rolled edge at the margin, which is a crowned panel, not a flat
 * one. Quartic falloff, so the crown's slope is zero where it meets the corner arc and
 * there is no crease between them.
 *
 * `kneeHub` applies the SAME crown to its own profile. If it does not, the hub sits this
 * far inside the shell it is supposed to be flush with and a lip appears round the knee.
 */
const CROWN = 0.062;

/** Crowned face offset at |x| across a flat face of half-extent `ax`. */
function crownAt(x, ax, amt) {
  if (ax <= 1e-9) return 0;
  const q = 1 - Math.min(1, Math.abs(x / ax)) ** 2;
  return amt * q * q;
}

/**
 * One rounded-rectangle ring, written into `out` as [x0,z0, x1,z1, ...].
 * Ordered clockwise seen from +Y, starting on the front face at +X. Every run emits its
 * first point and omits its last, so the next run supplies it and the loop closes exactly.
 */
function section(hw, hd, r, out) {
  r = Math.min(r, Math.min(hw, hd) * 0.92);
  const ax = hw - r, az = hd - r, cr = hd * CROWN;
  let i = 0;
  const put = (x, z) => { out[i++] = x; out[i++] = z; };
  const arc = (cx, cz, a0, a1, n) => {
    for (let k = 0; k < n; k++) {
      const a = a0 + (a1 - a0) * (k / n);
      put(cx + r * Math.cos(a), cz + r * Math.sin(a));
    }
  };
  const line = (x0, z0, x1, z1, n) => {
    for (let k = 0; k < n; k++) put(x0 + (x1 - x0) * k / n, z0 + (z1 - z0) * k / n);
  };
  const faceRun = (x0, x1, sgn, n) => {
    for (let k = 0; k < n; k++) {
      const x = x0 + (x1 - x0) * (k / n);
      put(x, sgn * (hd + crownAt(x, ax, cr)));
    }
  };
  const Q = Math.PI / 2;
  arc(ax, az, Q, 0, SEC.corner);            // front-right corner
  line(hw, az, hw, -az, SEC.side);          // right flank
  arc(ax, -az, 0, -Q, SEC.corner);          // back-right corner
  faceRun(ax, -ax, -1, SEC.face);           // back face
  arc(-ax, -az, -Q, -Math.PI, SEC.corner);  // back-left corner
  line(-hw, -az, -hw, az, SEC.side);        // left flank
  arc(-ax, az, Math.PI, Q, SEC.corner);     // front-left corner
  faceRun(-ax, ax, +1, SEC.face);           // front face
  return out;
}

/**
 * Sweep `section` through a list of rings, TOP FIRST (descending y), and close both ends.
 *
 * Each ring is { y, hw, hd, r, cz }. Caps get their own copies of the rim vertices so a
 * cap's flat normal never smears into the wall's — the caps are hidden inside the pelvis
 * and the knee hub, but a wrong normal there is exactly the kind of thing that shows up as
 * a dark band on the silhouette edge.
 *
 * WINDING, derived not guessed: rings run clockwise seen from +Y and are listed top to
 * bottom, so [upper_k, lower_k, upper_k+1] is counter-clockwise seen from outside. There
 * is a numeric check for this in the tests below the build (`_checkOutward`).
 */
function loftShell(rings, opts = {}) {
  const caps = opts.caps !== false;
  const N = SEC_N, R = rings.length;
  const wallV = R * N;
  const total = wallV + (caps ? 2 * (N + 1) : 0);
  const pos = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  const buf = new Float32Array(N * 2);

  const yTop = rings[0].y, ySpan = Math.max(1e-6, yTop - rings[R - 1].y);
  for (let i = 0; i < R; i++) {
    const rg = rings[i];
    section(rg.hw, rg.hd, rg.r, buf);
    for (let k = 0; k < N; k++) {
      const o = (i * N + k) * 3;
      pos[o] = buf[k * 2];
      pos[o + 1] = rg.y;
      pos[o + 2] = buf[k * 2 + 1] + rg.cz;
      uv[(i * N + k) * 2] = k / N;
      uv[(i * N + k) * 2 + 1] = (yTop - rg.y) / ySpan;
    }
  }

  const idx = [];
  for (let i = 0; i < R - 1; i++) {
    for (let k = 0; k < N; k++) {
      const k1 = (k + 1) % N;
      const u = i * N + k, u1 = i * N + k1, l = (i + 1) * N + k, l1 = (i + 1) * N + k1;
      idx.push(u, l, u1, u1, l, l1);
    }
  }

  // caps: [centre, rim...] copied out of the first / last ring
  const cap = (ringIdx, base, up) => {
    const src = ringIdx * N;
    pos[base * 3] = 0; pos[base * 3 + 1] = rings[ringIdx].y; pos[base * 3 + 2] = rings[ringIdx].cz;
    uv[base * 2] = 0.5; uv[base * 2 + 1] = 0.5;
    for (let k = 0; k < N; k++) {
      const d = (base + 1 + k) * 3, s = (src + k) * 3;
      pos[d] = pos[s]; pos[d + 1] = pos[s + 1]; pos[d + 2] = pos[s + 2];
      uv[(base + 1 + k) * 2] = pos[s] ; uv[(base + 1 + k) * 2 + 1] = pos[s + 2];
    }
    for (let k = 0; k < N; k++) {
      const a = base + 1 + k, b = base + 1 + (k + 1) % N;
      if (up) idx.push(base, a, b); else idx.push(base, b, a);
    }
  };
  if (caps) {
    cap(0, wallV, true);
    cap(R - 1, wallV + N + 1, false);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/**
 * ===================== THE LIMB'S PANEL LINES — round 32, item 1 =====================
 *
 * "The sheet is dense with purposeful seams and screws; the render is toy-plastic outside the
 * joints." The torso got its lines in the first half of round 32; the LEGS had none at all,
 * and the legs are two fifths of the figure.
 *
 * MEASURED off `Dev Art/1785277053522.png`, front figure legs (crop `150,395,175,335` at 3x)
 * and back figure (crop `1080,230,215,510` at 2.4x). The inventory per leg is FOUR marks, and
 * that is the whole of it — this is an injection-moulded consumer product, and the material
 * file's opening note about restraint governs here as much as it does the surfaces:
 *
 *   1. one transverse break across the thigh a little above the knee band,
 *   2. one longitudinal seam down the thigh's outer face, hip to that break,
 *   3. one transverse break across the shin just under the knee,
 *   4. three short horizontal VENT slots low on the outer calf — the one piece of detail on
 *      the sheet's leg that is unmistakably a machined feature rather than a moulding line.
 *
 * Every one of them is a DARK HAIRLINE, never a groove of shell-coloured shell: white-on-white
 * shading cannot draw an edge at this scale. That is the same finding the knee outlines, the
 * boot's toe seam and the chest seams all rest on.
 *
 * BOTH helpers SOLVE THE SAME `legRings` TABLE THE SHELL IS LOFTED FROM, so a line sits on the
 * limb by construction rather than by coordinates fitted against a render — which is the guess
 * this file has lost more rounds to than any other.
 *
 * COST. The shin's marks are FREE: `j.knee` already carries `mats.gap` for the disc bores and
 * the kneecap scribe, so `collapseDrawCalls` folds them into a mesh that exists either way.
 * The thigh's cost ONE merged mesh per hip — `j.hip` carried only `mats.shell` — which is why
 * the thigh's inventory is kept to the two marks the sheet actually draws.
 */

/** Interpolate the ring table (sorted top to bottom) at a world height. */
function ringAt(rings, y) {
  let i = 0;
  while (i < rings.length - 2 && rings[i + 1].y > y) i++;
  const a = rings[i], b = rings[i + 1];
  const t = Math.min(1, Math.max(0, (a.y - y) / Math.max(1e-9, a.y - b.y)));
  const L = (k) => a[k] + (b[k] - a[k]) * t;
  return { y, hw: L('hw'), hd: L('hd'), r: L('r'), cz: L('cz') };
}

/**
 * A transverse scribe ring: a two-ring wall of the SAME section the shell has at that height,
 * standing `out` proud of it. No caps — a cap here is a filled disc of the whole cross-section
 * and would render as a dark plate straight across the limb.
 */
function limbScribe(rings, y, halfT, out) {
  const s = ringAt(rings, y);
  const mk = (yy) => ({ y: yy, hw: s.hw + out, hd: s.hd + out, r: s.r + out, cz: s.cz });
  return loftShell([mk(y + halfT), mk(y - halfT)], { caps: false });
}

/**
 * A longitudinal seam lying on the limb's broad FRONT (`zdir` +1) or BACK (-1) face.
 *
 * `xf` is a fraction of the face's own flat half-extent (`hw - r`), not of the half width, so
 * the seam stays on the flat and never climbs into the corner roll where it would foreshorten
 * to nothing. Z is taken through `crownAt` with the same arguments `section()` uses, so the
 * ribbon lies on the crowned face rather than cutting a chord across it.
 */
function limbStripe(rings, o) {
  const { xf, zdir = 1, halfW, out, yTop, yBot, N = 9 } = o;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const y = yTop + (yBot - yTop) * (i / N);
    const s = ringAt(rings, y);
    const ax = Math.max(1e-6, s.hw - s.r), cr = s.hd * CROWN;
    const cx = xf * ax;
    for (const sg of [-1, 1]) {
      const x = cx + sg * halfW;
      pos.push(x, y, s.cz + zdir * (s.hd + crownAt(x, ax, cr) + out));
      uv.push(i / N, 0.5 + sg * 0.5);
    }
  }
  /*
   * ROUND 34 — THE WINDING WAS INVERTED ON BOTH FACES, AND THAT IS WHY NEITHER LONGITUDINAL
   * SEAM HAS EVER DRAWN A PIXEL. This is the project's signature failure in its purest form:
   * the geometry is built, it is in the merged mesh, it is measurably PROUD of the shell, and
   * it is culled.
   *
   * MEASURED, not reasoned (`harness/evidence/_tmp_geoprobe.mjs`, a Moller-Trumbore cast from the view's
   * own camera to a ribbon vertex on figure 1's left thigh): the ribbon's outer edge sits at
   * 10.56674 from the camera against the shell's 10.56950 — 0.0028 world units IN FRONT, which
   * is `out` exactly. A horizontal luminance scan across that thigh (`harness/evidence/_tmp_scan.mjs`,
   * y = 600 on the 1080p capture) runs 182.1 181.7 181.0 179.8 178.2 straight through the four
   * pixels the ribbon covers: a monotone gradient, no dip of any size. Present, unoccluded,
   * invisible. The only thing left is culling.
   *
   * The rows run TOP TO BOTTOM and `a`/`b` are the -x/+x edge of a row, so for a +Z face seen
   * from +Z the counter-clockwise order is a -> c -> b (down the left edge, then up to the
   * right), which is the order `loftShell`'s own note derives for the same reason. The old code
   * had `a, b, c` there and `a, c, b` on the -Z face: both faces backwards, so every stripe this
   * function has ever produced faced INTO the limb. `computeVertexNormals` then dutifully
   * pointed the normals inward too, which is why nothing looked wrong in a debug normal view
   * either.
   *
   * This is one bug across two features: `critic-robot-34`'s item 2 reads the thigh seam as "a
   * faint dashed tick-line" against "the shin's hard dark hairline (same technique)". The shin's
   * does not read either — the same scan across the shin at 0.184 H is equally monotone. There
   * was no difference between them to find; both were culled.
   */
  for (let i = 0; i < N; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    if (zdir > 0) idx.push(a, c, b, b, c, d);
    else idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Panel groove: a square-floored channel cut into the loft itself, so a seam line costs
// zero extra meshes. Round 22 deleted the old seams because a separate `mats.gap` mesh per
// seam cost 8 draw calls per robot through collapseDrawCalls' one-mesh-per-material-per-
// joint grouping. Relief/width is 0.0032/0.011 = 0.29, comfortably under the 0.5 ceiling
// the hip-disc spiral diagnosis set for any stepped relief on this model.
// ROUND 32: 0.0024 -> 0.0034. The thigh's two breaks are the only panel lines on this model
// that cannot afford a `mats.gap` scribe (see the note in the thigh build), so the channel has
// to carry them on its own. Relief/width is now 0.0034/0.0072 = 0.47, still under the 0.5
// ceiling the hip-disc spiral diagnosis set for any stepped relief on this character.
const GROOVE_HW = 0.0036;   // half height, fraction of H
const GROOVE_D = 0.0034;    // radial inset

/**
 * Ring list for ONE WINDOW onto the leg profile, in the owning joint's local space
 * (y = 0 at `opts.origin`, defaulting to the top of the window).
 *
 * The thigh and the shin call this with adjacent windows, so the ring they share at the
 * knee is generated from the same `legProfile` sample by the same code. That is the whole
 * mechanism: continuity is not something the two parts are tuned into, it is something
 * they cannot avoid.
 */
function legRings(w, yTop, yBot, opts = {}) {
  const origin = opts.origin ?? yTop;
  const grooves = (opts.grooves ?? []).filter((g) => g > yBot + GROOVE_HW && g < yTop - GROOVE_HW);
  const knee = opts.knee ?? null;      // height fraction of the pivot this window ends at
  const hip = opts.hip ?? null;        // ditto at the top of the thigh (round 28, item 5)
  const rows = [];

  // Denser sampling where the section is changing fastest — through the knee tuck.
  const N = Math.max(8, Math.round((yTop - yBot) / 0.018));
  for (let i = 0; i <= N; i++) {
    let yf = yTop + (yBot - yTop) * (i / N);
    if (grooves.some((g) => Math.abs(yf - g) < GROOVE_HW * 1.2)) continue;
    rows.push({ yf });
  }
  if (knee !== null) {
    for (let k = 1; k <= 4; k++) {
      const d = KNEE.tuck * (k / 5) ** 1.35;
      rows.push({ yf: knee + (yTop > knee ? d : -d) });
    }
  }
  if (hip !== null) {
    for (let k = 1; k <= 4; k++) rows.push({ yf: hip - HIP.tuck * (k / 5) ** 1.35 });
  }
  for (const g of grooves) {
    rows.push({ yf: g + GROOVE_HW, keep: 1 }, { yf: g + GROOVE_HW * 0.42, inset: GROOVE_D, keep: 1 },
      { yf: g - GROOVE_HW * 0.42, inset: GROOVE_D, keep: 1 }, { yf: g - GROOVE_HW, keep: 1 });
  }
  rows.sort((a, b) => b.yf - a.yf);

  /**
   * DEDUPE NEAR-COINCIDENT RINGS. Four independent generators write into `rows` — regular
   * sampling, the knee tuck, the hip tuck and the groove walls — and nothing stops two of
   * them landing on the same height. Two rings 0.0002 H apart make a zero-area quad strip,
   * `computeVertexNormals` averages a meaningless normal across it, and the limb renders
   * with a hard crease line right round it. That is what the hip tuck produced on its first
   * render: its rows fell 0.0002 H and 0.0011 H from the regular sampling and drew two
   * bright rings across the upper thigh.
   *
   * The threshold is 0.0016 H, deliberately BELOW the groove profile's own tightest
   * spacing (0.0018 H), so a groove can never be collapsed by this; where a tuck row lands
   * inside a groove anyway, the groove row is the one kept.
   */
  const MIN_DY = 0.0016;
  const kept = [];
  for (const r of rows) {
    const prev = kept[kept.length - 1];
    if (!prev || prev.yf - r.yf >= MIN_DY) { kept.push(r); continue; }
    if (r.keep && !prev.keep) kept[kept.length - 1] = r;
  }
  rows.length = 0;
  rows.push(...kept);

  return rows.map((rr) => {
    const p = legProfile(rr.yf);
    const ins = rr.inset ?? 0;
    let hw = p.w * 0.5, hd = p.d * 0.5, cz = p.cz, r = Math.min(hw, hd) * p.r;

    // HIP TUCK — round 28, item 5: "the top of the thigh should also taper off on the same
    // angle as the hip connectors." Same mechanism as the knee tuck below, at the other end
    // of the window: the thigh's TOP ring is generated as the hip hub's own section, so the
    // taper is not matched to the connector by eye — it IS the connector's section, and the
    // seal at the hip is a static property in the same way the knee's is.
    //
    // This replaces a `dome` flag that grew a rounded shoulder 0.017 H above the pivot to
    // stop a raised knee opening the top of the thigh. The hub does that job now, and does
    // it better: a dome is only a cover, whereas a body of revolution about the bend axis
    // cannot open at all.
    if (hip !== null) {
      const t = Math.min(1, Math.abs(rr.yf - hip) / HIP.tuck);
      const s = 1 - (1 - t) ** 2;
      hw += (HIP.hw - hw) * (1 - s);
      hd += (HIP.hd - hd) * (1 - s);
      cz += (HIP.cz - cz) * (1 - s);
      r += (HIP.r - r) * (1 - s);
    }

    // KNEE TUCK — blend the natural section into the hinge section as the pivot is
    // approached, so the window's terminal ring IS the hub's equator. That equality is the
    // seal: it is checked by geometry, not by eye, and it is why a one-surface limb is
    // legal across a hinge at all.
    if (knee !== null) {
      const t = Math.min(1, Math.abs(rr.yf - knee) / KNEE.tuck);
      const s = 1 - (1 - t) ** 2;         // ease out of the hub, flat where they meet
      hw += (KNEE.hw - hw) * (1 - s);
      hd += (KNEE.hd - hd) * (1 - s);
      cz += (KNEE.cz - cz) * (1 - s);
      r += (KNEE.r - r) * (1 - s);
    }
    return {
      y: w(rr.yf - origin),
      hw: w(Math.max(0.004, hw - ins)),
      hd: w(Math.max(0.004, hd - ins)),
      r: w(Math.max(0.0025, r)),
      cz: w(cz),
    };
  });
}

/**
 * The knee hub: the limb's own knee cross-section revolved about the bend axis (X).
 *
 * Revolving a rounded rect of half-width `a`, half-depth `b`, corner radius `r` gives a
 * barrel of radius `b` across its middle that shoulders down to FLAT circular end faces of
 * radius `b - r`. Those end faces are not an artefact — they are where the sheet puts the
 * ringed knee disc, and `b - r` lands within a pixel or two of the disc radius measured off
 * the sheet, which is the strongest evidence that this is the construction the art itself
 * describes. `recess` sinks that face so the disc sits IN the hub, flush, instead of on it.
 *
 * The result is invariant under rotation about X, so it seals the thigh/shin cut at every
 * knee angle by construction. Nothing here may depend on x-asymmetry for that reason.
 */
function kneeHub(a, b, r, recess, rIn, radial = 26) {
  const ax = a - r, az = b - r, cr = b * CROWN, N = 5, M = 8;
  const V = (radius, height) => new THREE.Vector2(radius, height);
  const pts = [];
  // Traversed bottom-to-top in the lathe's own height axis, which is what makes
  // LatheGeometry's normals face outward — its normal is the profile tangent turned -90°.
  pts.push(V(0, -a + recess));                 // -X recess floor, on the axis
  pts.push(V(rIn, -a + recess));               // -X recess floor, out to its rim
  pts.push(V(rIn, -a));                        // -X recess wall
  pts.push(V(az, -a));                         // -X end face, out to the shoulder
  for (let k = 1; k <= N; k++) {               // shoulder up onto the barrel
    const dx = r * (1 - k / N);
    pts.push(V(az + Math.sqrt(Math.max(0, r * r - dx * dx)), -ax - dx));
  }
  for (let k = 1; k <= M; k++) {               // the barrel, carrying the section's crown
    const x = -ax + 2 * ax * (k / M);
    pts.push(V(b + crownAt(x, ax, cr), x));
  }
  for (let k = 1; k <= N; k++) {               // shoulder back down to the +X face
    const dx = r * (k / N);
    pts.push(V(az + Math.sqrt(Math.max(0, r * r - dx * dx)), ax + dx));
  }
  pts.push(V(rIn, a));                         // +X end face, in to the recess rim
  pts.push(V(rIn, a - recess));                // +X recess wall
  pts.push(V(0, a - recess));                  // +X recess floor, back to the axis
  const g = new THREE.LatheGeometry(pts, radial);
  g.rotateZ(Math.PI / 2);   // revolve axis Y -> X, same convention as driveDisc
  return g;
}

/**
 * THE KNURL — the half of the joint family a lathe cannot make.
 *
 * MEASURED, not described. `Dev Art/1785308800211.png` (the plank shot) shows the elbow and
 * the near knee at three times the turnaround's scale and with both joints BENT, so the
 * barrel that a rest pose hides is fully open. They are the same part: a spool whose
 * cylindrical face is covered in fine ribs running along the bend axis, with a raised land
 * at each end of the band and a ringed bolt disc on the end face beyond it. The turnaround's
 * back-figure elbow (crop `1230,345,75,70`) shows the same ribs at rest, as a band of short
 * dashes between the disc and the inboard end.
 *
 * ⚠ RELIEF / PITCH. Knurling is stepped detail seen off-axis, which is exactly the geometry
 * that made the hip discs read as a nautilus volute (see `driveDisc`). Pitch here is
 * 2*pi*b/ribs = 0.0173 H at the knee; the cut is 0.0026 H, a ratio of 0.15 against the 0.5
 * ceiling that diagnosis set. There is no angle at which these chain into a spiral.
 *
 * ⚠ THE LANDS SIT AT THE BARREL RADIUS AND THE GROOVES CUT INWARD, never the reverse. The
 * hub is the limb's own section revolved about the bend axis, and the limb's terminal ring
 * touches that surface at the front and back faces — so a knurl built as PROUD ribs would
 * stand outside the sealing body, and at the two angles where the ring touches, the limb
 * would poke through its own joint. Cutting inward can only ever open a 0.0026 H recess
 * between two co-material solids.
 *
 * Cost is the reason there are no circumferential grooves subdividing the band, which the
 * plank shot does show: rows are the expensive axis (every extra row is `ribs*4` quads,
 * drawn four times per frame on this sheet), and at the turnaround's scale a 0.004 H scribe
 * across the band is under two pixels.
 */
function knurlBand(a, b, r, opts = {}) {
  const ribs = opts.ribs ?? 16;
  const cut = opts.cut ?? b * 0.058;
  const span = opts.span ?? 0.80;      // fraction of the barrel's flat run the band covers
  const ax = Math.max(1e-6, a - r), cr = b * CROWN;
  const rad = (x) => b + crownAt(x, ax, cr);

  // Angular samples, four per rib: land start, land end, groove start, groove end. The two
  // duplicated angles are what keep the groove walls vertical instead of sinusoidal — a
  // cosine-modulated radius reads as a soft flute, not as a machined rib.
  const pitch = (Math.PI * 2) / ribs;
  const ang = [], deep = [];
  for (let i = 0; i < ribs; i++) {
    const a0 = i * pitch;
    ang.push(a0, a0 + pitch * 0.56, a0 + pitch * 0.60, a0 + pitch * 0.96);
    deep.push(0, 0, 1, 1);
  }
  const N = ang.length;

  // Rings along the axis: flush at both ends so the band blends into the barrel it is cut
  // into, full depth between.
  const xEnd = ax * span, lip = xEnd * 0.12;
  const rows = [{ x: -xEnd, d: 0 }, { x: -xEnd + lip, d: 1 }, { x: xEnd - lip, d: 1 }, { x: xEnd, d: 0 }];

  const pos = new Float32Array(rows.length * N * 3);
  const uv = new Float32Array(rows.length * N * 2);
  let p = 0, q = 0;
  for (const row of rows) {
    for (let i = 0; i < N; i++) {
      const rr = rad(row.x) - cut * row.d * deep[i];
      pos[p++] = row.x; pos[p++] = Math.cos(ang[i]) * rr; pos[p++] = Math.sin(ang[i]) * rr;
      uv[q++] = ang[i] / (Math.PI * 2); uv[q++] = (row.x / ax) * 0.5 + 0.5;
    }
  }
  // Winding checked numerically, not guessed: (A,B,C)+(A,C,D) with A=(row,i), B=(row,i+1),
  // C=(row+1,i+1), D=(row+1,i) gives outward normals; the other diagonal gives inward ones
  // and the band renders as a hole.
  const idx = new Uint32Array((rows.length - 1) * N * 6);
  let k = 0;
  for (let rIdx = 0; rIdx < rows.length - 1; rIdx++) {
    for (let i = 0; i < N; i++) {
      const i2 = (i + 1) % N;
      const A = rIdx * N + i, B = rIdx * N + i2, C = (rIdx + 1) * N + i2, D = (rIdx + 1) * N + i;
      idx[k++] = A; idx[k++] = B; idx[k++] = C;
      idx[k++] = A; idx[k++] = C; idx[k++] = D;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  // An UNINDEXED geometry here would be a silent failure, not a loud one: `mergeGeos` only
  // copies `g.index`, so collapseDrawCalls would merge this band's vertices and none of its
  // triangles, and the knurl would simply not exist in the render.
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  return g;
}

/**
 * THE BOLT FACE — the other half of the joint family, and the same three parts at all three
 * joints: a recessed ringed disc, a small dark bore at its hub, and a dark ring round its
 * rim. The ring is not decoration; on a white-on-white sheet the geometry shades too softly
 * to draw an edge, and every joint the references show has a crisp dark outline.
 *
 * `mats.gap` is already on all three joints (bores), so the outline rings are free —
 * collapseDrawCalls merges them into a mesh that exists either way.
 */
function boltFace(add, mkMesh, mats, w, o) {
  // `y` was added in round 34 for the boot's ankle bearing, which is the first caller whose
  // joint origin is not on the bearing's own axis. Every other caller omits it and is unchanged.
  const { faceR, x, y = 0, dir, z = 0, tag, thick, ringT, boreSeg = 12, discSeg = 22, rings = 2 } = o;
  const d = mkMesh(driveDisc(faceR * 0.94, thick, rings, discSeg), mats.chrome, `jointDisc${tag}`);
  d.scale.x = dir;   // mirroring, not cant — see driveDisc's sign-convention note
  d.position.set(x, y, z);
  add(d);
  // The bore must FILL `driveDisc`'s hub hole (`radius * 0.28`), not sit inside it. At 0.22
  // it left an annular gap that rendered as a dark ring round a dark plug — a bullseye where
  // the references have one small dark centre.
  const b = mkMesh(boreDisc(faceR * 0.94 * 0.29, thick * 1.15, boreSeg), mats.gap, `jointBore${tag}`);
  b.position.set(x + dir * thick * 0.20, y, z);
  add(b);
  const rg = new THREE.TorusGeometry(faceR * 0.99, ringT, 4, 20);
  rg.rotateY(Math.PI / 2);
  const rm = mkMesh(rg, mats.gap, `jointRing${tag}`);
  rm.position.set(x + dir * thick * 0.30, y, z);
  add(rm);
  return d;
}

/**
 * DRAW CALL COLLAPSE — run once, after the model is assembled.
 *
 * Built naively this robot is ~395 separate meshes. The whole-room budget is 300 draw
 * calls, so four players and a hunter could not coexist at any art quality; integrated
 * GPUs are call-bound long before they are shader-bound. Nothing about the silhouette
 * needs those meshes to be separate — only the *joints* have to move independently.
 *
 * So: flatten every group that is not a joint or a socket into its parent (baking its
 * transform), then merge each joint's direct mesh children per material into one mesh.
 * Construction code above stays readable and one-part-per-feature; the runtime cost
 * collapses by an order of magnitude.
 *
 * Meshes flagged userData.keepSeparate survive — the faceplate needs its own emissive
 * and the decal is a single plane that must not inherit a merged material.
 */
function collapseDrawCalls(root) {
  const isJoint = (o) => o.isGroup && (o.name.startsWith('j.') || o.name.startsWith('socket.'));

  // ---- pass 1: flatten non-joint groups upward, deepest first
  const groups = [];
  root.traverse((o) => { if (o.isGroup) groups.push(o); });
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    if (g === root || isJoint(g) || !g.parent) continue;
    g.updateMatrix();
    for (const c of [...g.children]) {
      c.updateMatrix();
      c.applyMatrix4(g.matrix);
      g.parent.add(c);
    }
    g.removeFromParent();
  }

  // ---- pass 2: merge each joint's direct mesh children, per material
  const hosts = [root];
  root.traverse((o) => { if (isJoint(o)) hosts.push(o); });
  let before = 0, after = 0;
  for (const g of hosts) {
    const byMat = new Map();
    const noShadow = new Set(), casts = new Set();
    for (const c of [...g.children]) {
      if (!c.isMesh) continue;
      before++;
      if (c.userData.keepSeparate) { after++; continue; }
      c.updateMatrix();
      const geo = c.geometry.clone().applyMatrix4(c.matrix);
      if (c.matrix.determinant() < 0) flipWinding(geo);
      if (!byMat.has(c.material)) byMat.set(c.material, []);
      byMat.get(c.material).push(geo);
      if (c.castShadow === false) noShadow.add(c.material);
      else casts.add(c.material);
      g.remove(c);
    }
    for (const [mat, geos] of byMat) {
      const merged = geos.length === 1 ? geos[0] : mergeGeos(geos);
      const m = new THREE.Mesh(merged, mat);
      /*
       * `castShadow = true` UNCONDITIONALLY WAS COSTING REAL BUDGET. Every scribed seam on this
       * model is a ribbon standing about a millimetre off the surface it lies on: it cannot cast
       * a shadow anything can see, and the construction code says so by setting
       * `castShadow = false`. The merge threw that away, so the round-32 leg seams arrived as
       * 48 draw calls across the four figures on this sheet instead of 8 — six passes each for
       * geometry that contributes to exactly one.
       *
       * A merged mesh keeps the flag only when EVERY child it swallowed was flagged off, so a
       * group that mixes real parts with scribes still casts. Nothing that used to cast stops.
       */
      m.castShadow = !(noShadow.has(mat) && !casts.has(mat));
      m.receiveShadow = true;
      m.name = `${g.name || 'root'}.merged`;
      g.add(m);
      after++;
    }
  }
  return { before, after };
}

// ---------------------------------------------------------------------------

export function buildUnit4H(opts = {}) {
  const H = opts.height ?? 1.7;
  const mats = opts.materials ?? unit4hMaterials(opts.materialOpts);
  const h = (f) => f * H;         // fraction -> world
  const w = (f) => f * H;

  const disposables = [];
  const mesh = (geo, mat, name) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true; m.receiveShadow = true;
    m.name = name;
    disposables.push(geo);
    return m;
  };

  const root = new THREE.Group();
  root.name = 'UNIT-4H';

  const parts = {};
  const joints = {};

  // ======================= TORSO =======================
  const hips = new THREE.Group(); hips.name = 'j.hips';
  hips.position.y = h(L.hip);
  root.add(hips);
  joints.hips = hips;

  // pelvis: white saddle block + chrome belt band
  //
  // ROUND 32 — 0.78 -> 0.62. The torso's three modules had drifted into the wrong split. On
  // the sheet the white pelvis runs ~0.50-0.60 H, the chrome waist band ~0.60-0.68 H and the
  // chest plate ~0.68-0.80 H; here the pelvis ran to 0.614 H and the chest started at 0.648 H,
  // which left the WAIST 0.034 H tall — a third of the sheet's — and is most of why it read as
  // a narrow cone rather than as a module.
  /*
   * ROUND 32, SECOND PASS — 0.62 -> 0.82, and it is the fix for the WAIST, not for the pelvis.
   *
   * Rendered, the three-band chrome abdomen read as a stack of four hard horizontals overhanging
   * the hips — a lampshade. The sheet's waist (front crop `115,215,190,240`) is ONE chrome band
   * immediately under the chest and then WHITE SHELL all the way down to the groin: the belly is
   * part of the pelvis module, not part of the waist module.
   *
   * Raising this factor moves that boundary without adding anything. `spine.position.y` is
   * `pelvisH * 0.80` and `abTop` is whatever is left up to `L.waist`, so a taller pelvis
   * automatically shortens the abdomen — 0.0554 H of three bands becomes 0.0378 H of one. Every
   * other part of the pelvis (belt, groin plate, hip channels) is already expressed in `pelvisH`
   * and follows. It costs nothing: both modules are one material and one merged mesh either way.
   *
   * The block is also SHAPED now rather than a plain box. The sheet's profile is 0.174-0.190 H
   * deep through the belly and this box was a constant 0.139 H, which is the other half of the
   * -41% at 0.655 H; the top of the pelvis now carries the barrel and narrows into the hips.
   */
  const pelvisH = h(L.waist - L.hip) * 0.82;
  const PELVIS_P = [
    [0.00, 0.99, 0.96],
    [0.35, 1.01, 1.04],
    [0.72, 0.96, 1.16],
    [1.00, 1.00, 1.22],
  ];
  parts.pelvis = mesh(
    shapeY(roundedBoxGeometry(w(W.pelvisShellW), pelvisH, w(W.chestD * 0.88), w(0.030), 4),
      (t) => tableAt(PELVIS_P, Math.min(1, Math.max(0, t)))),
    mats.shell, 'pelvis');
  parts.pelvis.position.y = pelvisH * 0.30;
  hips.add(parts.pelvis);

  parts.belt = mesh(roundedBoxGeometry(w(W.pelvisShellW * 1.01), h(0.014), w(W.chestD * 0.95), w(0.006), 2), mats.chrome, 'belt');
  parts.belt.position.y = pelvisH * 0.30 + pelvisH * 0.44;
  hips.add(parts.belt);

  /**
   * THE GROIN PLATE AND THE HIP CHANNELS — round 32, item 1, and the pelvis is where the
   * sheet's panel language is loudest.
   *
   * MEASURED off `Dev Art/1785277053522.png`, front figure, crop `160,395,130,120` at 7.5x.
   * The pelvis is not a saddle: it is a narrow V-shaped groin plate down the centreline with a
   * BLACK CRESCENT either side of it — the hip flexion channel — each with a bright rolled lip
   * on its upper edge where the pelvis shell overhangs it. Those two crescents are the darkest
   * thing on the whole front view and they are what makes the hip read as a joint rather than
   * as a seam between two white lumps. The back figure (crop `1090,190,190,300`) shows the same
   * pair, larger.
   *
   * FREE: `j.hips` already carries `mats.gap` for the hip bores and `mats.shell` for the
   * pelvis, so both parts merge into meshes that exist either way.
   */
  {
    const py = pelvisH * 0.30;
    /*
     * the V plate: a narrow wedge standing proud of the pelvis front, apex down.
     *
     * ITS Z HAS TO COME OFF THE PELVIS'S OWN PROFILE. It used to be pinned to the untapered
     * half depth, which was correct while the pelvis was a plain box; now that the block is
     * shaped (`PELVIS_P`, up to 1.22x at the belly) a constant z buries the plate's top half
     * inside the shell and leaves its bottom floating — the identical bug the chest decal had
     * in round 28, for the identical reason. Solved against the same table the block is built
     * from, so it cannot drift if that table is retuned.
     */
    const vTop = py + pelvisH * 0.14, vBot = py - pelvisH * 0.44;
    const pelvisFaceZ = (yLocal) => {
      const t = Math.min(1, Math.max(0, (yLocal - (py - pelvisH * 0.5)) / pelvisH));
      return w(W.chestD * 0.88) * 0.5 * tableAt(PELVIS_P, t)[1];
    };
    const vGeos = [];
    for (const dir of [1, -1]) {
      const g = roundedBoxGeometry(w(0.056), vTop - vBot, w(0.012), w(0.006), 2);
      shapeY(g, (t) => [0.26 + 0.74 * t * t, 1.0]);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        p.setZ(i, dir * (pelvisFaceZ((vTop + vBot) * 0.5 + p.getY(i)) - w(0.004)) + p.getZ(i) * dir);
      }
      p.needsUpdate = true;
      g.computeVertexNormals();
      g.translate(0, (vTop + vBot) * 0.5, 0);
      vGeos.push(g);
    }
    const vplate = mesh(mergeGeos(vGeos), mats.shell, 'groinPlate');
    hips.add(vplate);
    parts.groinPlate = vplate;

    /*
     * THE HIP CHANNEL. The first cut of this was four partial toruses aimed at the two
     * crescents by eye; three of them ended up buried inside the pelvis and the fourth rendered
     * as a stray dark hook on one flank. Placing a small shape against a curved surface by
     * coordinates is exactly the guess this file keeps losing rounds to.
     *
     * So it is derived instead: ONE dark band running right round the underside of the pelvis,
     * a hair narrower than the shell so the shell's own edge rolls over it. The thigh tops then
     * cut it themselves — each leg covers the middle of its own side and what is left showing
     * is a crescent at the front and one at the back, which is precisely the pair the sheet
     * draws, at whatever hip angle the leg happens to be at.
     */
    /*
     * ...AND IT MUST NOT CROSS THE CENTRELINE. Rendered, one band right round the underside put
     * a solid black BAR across the crotch, because between the two thighs there is nothing to
     * cut it — the legs only cover their own sides. On the sheet that area is the brightest part
     * of the pelvis: a white groin plate running down to the inner thigh, with the dark crescent
     * confined to the OUTER two thirds of each hip. So the band is two blocks that stop short of
     * the centre, and the crescent pair is still cut by the thighs exactly as before.
     */
    for (const dir of [1, -1]) {
      const x0 = W.pelvisShellW * 0.155, x1 = W.pelvisShellW * 0.520;
      const under = roundedBoxGeometry(
        w(x1 - x0), w(0.021), w(W.chestD * 0.88 * 1.00), w(0.008), 2);
      under.translate(dir * w((x0 + x1) * 0.5), py - pelvisH * 0.5 + w(0.008), 0);
      hips.add(mesh(under, mats.gap, `hipChannel${dir > 0 ? 'R' : 'L'}`));
    }
  }

  /*
   * ============================================================================
   * ROUND 34 — THE HIP BEARING IS DELETED. THE SHEET HAS NEVER HAD ONE.
   * ============================================================================
   *
   * Rounds 30 to 33 grew this joint into the elbow/knee bolt-face family: a three-ring
   * `driveDisc`, a dark bore, a 0.0040 H outline ring, a `knurlBand` rim and a gap SHADOW
   * torus behind it — five parts making a bright chrome bearing on each flank of the pelvis.
   * Every one of those rounds argued about its SIZE, its DEPTH or what was OCCLUDING it. None
   * of them checked whether the sheet draws a hip bearing at all.
   *
   * IT DOES NOT, IN ANY OF THE FOUR VIEWS. Crops at 5x of all four pelvises on
   * `Dev Art/1785277053522.png` — front `150,355,180,130`, left profile `470,355,170,130`,
   * three-quarter `760,360,200,140`, back `1090,360,200,140` — put the same thing in every
   * one: a smooth white brief, and where the thigh enters it a DEEP BLACK CRESCENT RECESS with
   * the shell rolling over its top edge. There is no ring, no bore, no chrome, no circular
   * feature of any kind at the hip. The one bright ringed bearing anywhere in that band on the
   * profile figure is the ELBOW, which round 33 established and which these crops confirm
   * again. The plank shot's big knurled disc — the evidence rounds 30/31 built from — is a
   * different joint on a different sheet, and it was read across.
   *
   * So the whole assembly goes, and with it the "goggles" the profile view showed: two equally
   * bright ringed bearings 0.07 H apart, which is what the pair actually looked like at 4x.
   *
   * WHAT CARRIES THE HIP NOW is what the sheet uses: the pelvis skirt OVERHANGING the thigh's
   * neck, and the dark channel under it. `HIP.hw` 0.038 -> 0.030 deepens that overhang from
   * 0.045 H to 0.053 H of step, and the channel below is unchanged — the thigh tops still cut
   * it into a crescent at the front and one at the back, which is the pair the sheet draws.
   * Nothing new is invented here on purpose: the last time a shape was aimed at those crescents
   * by coordinates, three of the four ended up buried inside the pelvis and the fourth rendered
   * as a stray dark hook (see THE HIP CHANNEL above).
   *
   * COST. Five meshes per hip x two hips x four figures, gone. `hips` still carries `mats.gap`
   * for the channels and the belt, and `mats.chrome` for the abdomen, so no material leaves the
   * joint and no merged mesh disappears — the saving is triangles, not draw calls.
   */

  // abdomen: three stacked chrome segments narrowing to the waist
  const spine = new THREE.Group(); spine.name = 'j.spine';
  spine.position.y = pelvisH * 0.30 + pelvisH * 0.5;
  hips.add(spine);
  joints.spine = spine;

  /**
   * THE WAIST — round 32, item 2, and the single worst number ever measured on this piece.
   *
   * WHAT IT WAS: three `CylinderGeometry` segments running from radius 0.071 H down to
   * 0.047 H and squashed to 0.80 in Z, i.e. a narrow chrome CONE 0.114 H deep at its widest
   * and 0.034 H tall. `measure.mjs` put the profile figure at -29.2% depth at 0.655 H against
   * the sheet (0.129 H against 0.182 H) — the worst single delta on the piece — and the front
   * view read it as a bobbin between two white blocks.
   *
   * WHAT THE SHEET HAS, measured three ways:
   *   - PROFILE (crop `480,190,150,290` at 4.5x, and a row-by-row span dump): the torso is a
   *     BARREL whose deepest point is the lower chest / belly at ~0.70 H, not the hip. Depth
   *     runs 0.138 / 0.177 / 0.190 / 0.174 / 0.151 at H 0.80 / 0.75 / 0.70 / 0.65 / 0.60.
   *   - FRONT (crop `115,215,190,240` at 4x): the waist module is about three quarters of the
   *     chest's width, not half, and its front carries a raised CHEVRON plate with a dark
   *     recess under the chest's lower edge.
   *   - BACK (crop `1090,190,190,300` at 3.6x): three nested chevron bands, each stepped in
   *     from the one below, pointing UP. That stack is the clearest single piece of panel
   *     language on the whole sheet.
   *
   * So it is built as three stacked rounded-box BANDS — wide, deep, and stepped — with the
   * front and back faces of the middle two pushed into a chevron. The recesses between the
   * bands are real geometry (0.0055 H of step), not painted lines: `j.spine` carries only
   * `mats.chrome`, so a `mats.gap` scribe here would cost a whole merged mesh per robot, and
   * a 0.0055 H step between two chrome bands under screen-space AO draws the same line for
   * nothing. Every band is one material, so the whole module is still ONE draw call.
   */
  const abTop = h(L.waist) - (h(L.hip) + spine.position.y);
  /*
   * ...AND THE FIRST CUT OF IT WAS WRONG IN AN INSTRUCTIVE WAY. The chevron was applied as a
   * Y lift on every vertex whose |z| passed a hard threshold. A rounded box's corner roll
   * crosses that threshold part way round, so the lift arrived as a STEP: each band grew a
   * pair of wings at its flanks and the waist rendered as a stack of flaring slats — a ribbed
   * hose, not a torso. Two fixes, both about continuity rather than amount:
   *   - the lift ramps in smoothly over |z| through a smoothstep instead of switching on, so
   *     it exists only on the broad front and back faces and dies inside the corner roll;
   *   - it is 0.18 of the band height, not 0.30, because the sheet's chevron is a shape drawn
   *     ON a plate, not a plate bent into an arrow.
   * The bands also shrink MONOTONICALLY downward now. Widening downward put a shelf over the
   * pelvis at every band edge, which is the same silhouette mistake in miniature.
   */
  /*
   * ...AND THE SECOND CUT WAS STILL A STACK OF TYRES. Butting the bands end to end leaves each
   * one showing its own top AND bottom roll, so three bands draw six edges and the waist reads
   * as an accordion. The sheet's bands SHINGLE: each plate's lower edge lies over the next
   * plate's face, so a break shows one edge, not two. The t ranges below therefore OVERLAP by
   * about a fifth of a band, and the width/depth steps between them are small (4% and 3%) so
   * the overlap reads as a shallow lap rather than as a ledge.
   */
  /*
   * ...AND THE THIRD CUT IS ABOUT THE STEPS, NOT THE SHAPE. Rendered, the second cut still read
   * from the profile as a radiator: four hard horizontals stacked in 0.055 H, each one throwing
   * its own AO line, on a sheet whose waist shows ONE soft break. The bands were stepping 4% in
   * width and 3-7% in depth over a 0.020 H run, which is a 1:1 slope — a fin, geometrically.
   *
   * The steps come down to ~1.5% each and the whole module goes DEEPER. The sheet's profile is
   * at its deepest between 0.65 and 0.70 H (0.182-0.190 H, measured row by row); this stack
   * topped out at 1.038 * `W.chestD` = 0.164 H and the chest above it started at 0.96 = 0.152 H,
   * so the torso pinched exactly where the art bulges. Depth is raised here and in the lower
   * rows of `CHEST_P`, and nowhere else: the hip a band below already measures +13% against the
   * sheet, so `W.chestD` — which the pelvis and the belt also read — is deliberately untouched.
   */
  /*
   * ...AND THE FOURTH CUT IS ONE BAND. Three of them, shingled or not, put three or four hard
   * horizontals into 0.055 H of a 1.7 m figure; at the turnaround's framing that is a line every
   * four pixels and the module read as a radiator. The sheet has ONE break here. The white belly
   * that used to be shared between the lowest band and the pelvis now belongs entirely to the
   * pelvis (see its note above), so this is a single chrome waist band under the chest — which
   * is what the front, back and profile figures all draw.
   */
  /*
   * ...and the band has to be NARROWER than both the things it sits between, or it is a tray.
   * Rendered at 0.862 * `W.chestW` (0.190 H) against a pelvis top of 0.156 H it overhung the
   * hips by 22% per side and read as a shelf bolted round the middle. The sheet's silhouette
   * through here is a genuine waist: the chest's lower edge is the widest point, the band steps
   * IN, and the pelvis flares back out at the hips. 0.760 puts it at 0.167 H, inside the chest's
   * 0.198 H bottom and a hair over the pelvis's own top.
   */
  const AB = [
    // [t at band bottom, t at band top, full width, full depth]
    [-0.30, 1.02, W.chestW * 0.715, W.chestD * 1.095],
  ];
  {
    const abGeos = [];
    for (const [t0, t1, bw, bd] of AB) {
      const segH = abTop * (t1 - t0);
      const g = roundedBoxGeometry(w(bw), segH, w(bd), w(0.013), 3);
      const p = g.attributes.position;
      const halfW = w(bw) * 0.5, halfD = w(bd) * 0.5;
      for (let i = 0; i < p.count; i++) {
        const q = 1 - Math.min(1, Math.abs(p.getX(i) / halfW)) ** 2;
        const u = Math.min(1, Math.max(0, (Math.abs(p.getZ(i)) / halfD - 0.50) / 0.38));
        p.setY(i, p.getY(i) + q * (u * u * (3 - 2 * u)) * segH * 0.07);
      }
      p.needsUpdate = true;
      g.computeVertexNormals();
      g.translate(0, abTop * (t0 + t1) * 0.5, 0);
      abGeos.push(g);
    }
    parts.abdomen = mesh(mergeGeos(abGeos), mats.chrome, 'abdomen');
    spine.add(parts.abdomen);
  }

  // chest
  const chest = new THREE.Group(); chest.name = 'j.chest';
  chest.position.y = abTop;
  spine.add(chest);
  joints.chest = chest;

  /**
   * THE CHEST IS A BARREL NOW, NOT A CONE — round 32, and it closes the largest silhouette
   * error left on the piece in BOTH views with one change.
   *
   * `measure.mjs` (with the reference measured to its own soles — see the `--refband` note in
   * that file, the old table was reading the sheet 0.03-0.04 H high near the feet) puts the
   * band at 0.790 H at **+35.5% front, +30.2% profile, +34.6% on the 3/4, +43.5% on the back**.
   * It is the same defect in all four and it is not the arms: at 0.790 H the sheet is down to
   * a narrow yoke and a neck (0.200 H across, 0.114 H deep) and this rig still had a
   * full-width chest slab with square top corners (0.271 H across, 0.148 H deep).
   *
   * `taperY(0.66, 1.02)` is the cause: one monotonic factor, widest at the TOP. The sheet's
   * chest is widest and deepest through its MIDDLE. `CHEST_P` is that profile, and both the
   * decal seating and the scribe lines below solve the same table, so nothing is fitted by eye
   * and nothing drifts if it is retuned.
   *
   *   t (0 = shell bottom)   0.00   0.20   0.46   0.74   1.00
   *   width scale            0.90   0.99   1.00   0.99   0.78
   *   depth scale            0.96   1.02   1.00   0.90   0.66
   *
   * Evaluated at the bands the table reports, with `W.chestD` taken 0.142 -> 0.158 (the sheet's
   * torso is deeper than this rig's at every height below the collar):
   *   0.790 H   width 0.205 (sheet 0.200) · depth 0.123 (sheet 0.114)   was 0.271 / 0.148
   *   0.755 H   depth 0.147 (sheet 0.156)
   *   0.658 H   depth 0.152, and the waist module below carries 0.164
   */
  const chestH = h(L.chin - L.waist) * 0.80;
  /*
   * ROUND 32, SECOND PASS — the DEPTH column's two lowest rows only.
   *
   * Row by row off the sheet's profile figure the torso is deepest at 0.70 H (0.190 H) and holds
   * 0.182 H at 0.655 H. This table put the chest's own bottom edge (0.658 H world) at
   * 0.96 * 0.158 = 0.152 H — 17% under — so the chest stepped IN to meet a waist module that was
   * itself too shallow, and the two errors compounded into the -41% the profile measures at
   * 0.655 H. The rows at t 0.46 and above are untouched: the profile measures within 1% at
   * 0.755 H and +7% at 0.790 H, and the widths are not in question anywhere.
   */
  const CHEST_P = [
    [0.00, 0.90, 1.03],
    [0.20, 0.99, 1.07],
    [0.46, 1.00, 1.00],
    [0.74, 0.99, 0.90],
    [1.00, 0.78, 0.66],
  ];
  const chestScale = (t) => tableAt(CHEST_P, Math.min(1, Math.max(0, t)));
  parts.chestShell = mesh(
    shapeY(roundedBoxGeometry(w(W.chestW), chestH, w(W.chestD), w(0.046), 6), chestScale),
    mats.shell, 'chestShell');
  parts.chestShell.position.y = chestH * 0.52;
  chest.add(parts.chestShell);

  /**
   * THE 4HUMANITY MARK — round 28, items 3 and 6.
   *
   *   3: "Company logo isn't on the centre of the chest and needs to be bigger."
   *   6: "There shouldn't be anything on the back like a box it should be again the
   *      company logo."
   *
   * ART_MANIFEST.md says the mark is on the wearer's LEFT PEC, and this file was built to
   * that. John's note overrides it — but they do not actually conflict, because the manifest
   * is wrong: measured off `Dev Art/1785277053522.png` with a hand-placed crop, the front
   * figure's mark spans x 480..740 in an 8x crop whose neck centreline is at 610, i.e. the
   * mark's own centre is at 610. It is ON the centreline on the sheet. The manifest is the
   * odd one out for a fourth time.
   *
   * ===================== IT IS NOW THE WORDMARK, NOT THE SPLIT HEAD =====================
   *
   * John, 2026-08-03: the chest and back marks become the 4Humanity TEXT wordmark
   * (`Dev Art/1785276265860.png`). The turnaround sheet still shows the split head; on this one
   * feature the direction outranks the sheet, and HANDOFF.md records that for critics.
   *
   * IT IS STILL CENTRED, and that is deliberate. The brief for this round asked for the
   * wearer's left pec, but round 28 above moved it to the centreline on John's own words and
   * MEASURED the sheet to confirm the sheet agrees; ART_MANIFEST's "left pec" was the error.
   * Nothing about the wordmark argues for reopening that — a 4.2:1 lockup offset onto one pec
   * would run its 'y' off the side of a 0.220 H chest. Centred is both the standing decision
   * and the only thing that fits.
   *
   * SIZE — this is the whole design problem, and it is a shape problem, not a taste one.
   * The split-head mark was 0.082 x 0.082 H. The wordmark's glyph box is 4.325:1, so matching
   * the old mark's HEIGHT would need 0.355 H of width against a chest that is 0.220 H wide.
   * It cannot be done, and the tension is real rather than a failure to try: a wordmark is a
   * wide object and this chest is a narrow one, so width is the binding constraint and height
   * is whatever falls out of it.
   *
   *   chest half-width here          0.110 H   (W.chestW 0.220, x scale ~1.0 at this height)
   *   flat band ends at              0.064 H   (W/2 - r); beyond that the corner rounds away
   *   chosen half-width              0.088 H   = 80% of the half-width
   *   -> width 0.176 H, height 0.0418 H, and the '4H' block itself 0.0395 H tall
   *
   * 80% leaves 0.022 H of clear shell beyond each end before the silhouette, which is what
   * makes it read as PRINTED ON the chest rather than as a strip applied across it, and it puts
   * the ends 0.024 H onto the corner round — enough curvature to sell the print, little enough
   * that the ends do not foreshorten into mush.
   *
   * FURNITURE. The yoke seam (0.775 of the shell) and the lower V (0.135) are nowhere near this
   * band. The PEC SIDE SEAMS ARE — they run 0.76 down to 0.54 and the mark spans 0.363..0.638,
   * so they share the mark's top third, and an earlier draft of this note wrongly claimed they
   * cleared it vertically. They clear it HORIZONTALLY instead, at every shared height, because
   * they sit at 0.80-0.86 of the half width and bow further out over exactly that stretch while
   * the mark's own top third is the '4H' block, which is inboard. Measured on the render at
   * 1080p, right side, row by row: the gap between the last ink column and the seam's dark core
   * runs 16 to 30 px against a 114 px mark, i.e. a minimum clearance of 14% of the mark's width.
   * That is the number to re-check if either the mark or the seams are ever resized.
   *
   * The honest cost: the '4H' ligature is 0.0395 H where the old emblem was 0.082 H, so the
   * mark's vertical presence is roughly halved even though it more than doubles in width. That
   * is what this logo is, and shrinking the type further to buy margin, or stacking it onto two
   * lines to buy height, would both damage the lockup — which is the one thing a logo cannot
   * survive. The back carries the same mark at the same size (see below).
   *
   * HEIGHT. Moved from 0.62 to 0.50 of the shell, i.e. the literal centre of the chest
   * panel (0.739 H world, against the sheet's 0.709 H). At 0.62 an 0.082 H mark reached
   * within 0.02 H of the neck yoke.
   *
   * SEATING — this was a real bug, not a change. `chestShell` is `taperY`ed 0.66 -> 1.02,
   * and taperY scales Z as well as X, so the shell's front face is not at the 0.071 H half
   * depth: it runs from 0.052 H at the bottom of the mark to 0.068 H at the top, an 11 deg
   * slope. The plane was pinned to the untapered depth, so it floated 0.007 H off the shell
   * at the top; a flat plane big enough for John's note would have buried its own top edge
   * 0.006 H INSIDE the chest. So both marks are BOWED onto the surface — every row of the
   * plane solves the same rounded-box-then-taper the shell itself is built from. Nothing is
   * fitted by eye and it cannot drift if the chest is retuned.
   *
   * ONE MESH, TWO PLANES. The back mark is merged into the same geometry rather than added
   * as a second mesh: `keepSeparate` meshes survive `collapseDrawCalls` individually, so a
   * separate back decal would cost a draw call per robot (x4 on this sheet) for a part that
   * is never visible at the same time as the front one. Rotating a plane by PI about Y is a
   * rotation, not a mirror, so the winding is untouched and no `flipWinding` is needed.
   */
  const decalW = h(0.176);
  const decalH = decalW / brandAspect('wordmark');
  const decalY = chestH * 0.50;
  const shellY0 = parts.chestShell.position.y;   // shell geometry origin in chest space

  /*
   * The shell's own front-face depth at a point, in the shell geometry's local frame: rounded
   * box first, then `shapeY`'s profile. Identical arithmetic to the two functions that built
   * it, so it stays correct if either is retuned.
   *
   * `xLocal` IS NEW AND THE WORDMARK IS WHY. `roundedBoxGeometry` clamps each vertex to the
   * inner half-extent box and pushes it out by `radius`, so the true front face is
   *     z = (D/2 - r) + sqrt(r^2 - dx^2 - dy^2)
   * and the old solver was the dx = 0 slice of it. That was sufficient for a 0.082 H square
   * mark, which lived entirely inside the chest's flat band (|x| < W/2 - r = 0.064 H). The
   * wordmark is 0.176 H wide, so its outer 0.024 H on each side lies ON the corner round,
   * where the face falls away 0.0068 H. Solved with dx = 0 the plane would have hung that far
   * off the shell at the '4' apex and the 'y' tail — the two ends of the mark — which is the
   * float this file has already fixed twice in the other axis.
   *
   * `xLocal` is the vertex's FINAL x; the rounded box is evaluated before `shapeY` scaled it,
   * so it is divided back out by the same width factor. dy stays in the expression even though
   * the wordmark never leaves the flat Y band (max |yLocal| 0.024 H against a flat of 0.030 H):
   * it costs nothing and it is what makes this the general solution rather than a second
   * special case waiting to be found by whoever moves the mark.
   */
  const chestFaceZ = (yLocal, xLocal = 0) => {
    const rad = w(0.046);
    const [sx, sz] = chestScale(0.5 + yLocal / chestH);
    const dy = Math.max(0, Math.abs(yLocal) - (chestH * 0.5 - rad));
    const dx = Math.max(0, Math.abs(xLocal / Math.max(sx, 1e-6)) - (w(W.chestW) * 0.5 - rad));
    const zBox = (w(W.chestD) * 0.5 - rad)
      + Math.sqrt(Math.max(0, rad * rad - dx * dx - dy * dy));
    return zBox * sz;
  };
  /** …and its half-width, for placing scribes that must stop short of the silhouette. */
  const chestFaceX = (yLocal) => {
    const rad = w(0.046), flat = chestH * 0.5 - rad;
    const dy = Math.max(0, Math.abs(yLocal) - flat);
    const xBox = (w(W.chestW) * 0.5 - rad) + Math.sqrt(Math.max(0, rad * rad - dy * dy));
    return xBox * chestScale(0.5 + yLocal / chestH)[0];
  };

  /*
   * TESSELLATION AND LIFT, both inherited from round 34's mat.robot finding rather than
   * re-guessed. That round proved the pale rectangle round a decal is the AO DEPTH PREPASS:
   * `scene.overrideMaterial = MeshDepthMaterial` throws away the discard, the transparency and
   * the polygonOffset, so the plane writes a SOLID quad in front of the shell and the AO kernel
   * finds a step at its border. The step scales with the lift, so the lift is the fix.
   *
   * 1 x 8 -> 32 x 8. The old plane had ONE segment across its width because it never left the
   * chest's flat band and did not need any. This one crosses both corner rounds, so its chordal
   * error in x is what now sets the floor under the lift: 32 segments over 0.176 H is a 0.0055 H
   * chord on a 0.046 H radius, sagitta 8.2e-5 H, and 9.6e-5 H measured along z at the steepest
   * point the mark reaches (31.4 deg round the corner).
   *
   * w(0.0014) -> w(0.0003). 0.0003 H clears that worst-case error by 3.1x with the plane still
   * effectively welded to the shell. It could not have been dropped this far before the solver
   * above learned about x: on the old dx = 0 solver the plane's ends stood 0.0068 H off the
   * corner round, and no lift constant can fix a plane that is solving the wrong surface.
   */
  const decalPlane = (dir) => {
    const g = new THREE.PlaneGeometry(decalW, decalH, 32, 8);
    if (dir < 0) g.rotateY(Math.PI);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const yLocal = decalY - shellY0 + p.getY(i);
      p.setZ(i, dir * (chestFaceZ(yLocal, p.getX(i)) + w(0.0003)));
    }
    p.needsUpdate = true;
    g.computeVertexNormals();
    return g;
  };
  parts.decal = mesh(mergeGeos([decalPlane(1), decalPlane(-1)]), mats.decal, 'decal');
  parts.decal.position.set(0, decalY, 0);
  parts.decal.castShadow = false;
  parts.decal.userData.keepSeparate = true;
  chest.add(parts.decal);

  /**
   * ===================== THE PANEL LINES — round 32, item 1 =====================
   *
   * "The sheet is dense with panel seams, screw heads and machined chrome; the render is
   * smooth toy-plastic outside the joint discs." Correct, and this is the first round that has
   * attempted it on the torso.
   *
   * WHAT THE SHEET'S DETAILING ACTUALLY IS, measured on four crops rather than described:
   *
   *   front torso  `115,215,190,240` @4x    back torso `1090,190,190,300` @3.6x
   *   profile      `480,190,150,290` @4.5x  pelvis     `160,395,130,120` @7.5x
   *
   *  1. Every break is a DARK HAIRLINE with a BRIGHT ROLLED LIP on the overlapping side. It is
   *     never a groove of shell-coloured shell — white-on-white shading cannot draw an edge at
   *     this scale, which is the same finding the knee outlines and the boot's toe seam rest on.
   *  2. The density is LOW and structural. On the whole front of the torso the sheet has: one
   *     yoke seam under the collar, one seam down each side of the pec, one lower-chest arc,
   *     and the waist/pelvis breaks. Six lines. Not greeble.
   *  3. SCREWS ARE RARE AND THEY SIT ON YOKES AND COLLARS, never in the middle of a panel.
   *     There are exactly two on the front chest — on the collar yoke, about 55% of the way out
   *     to each shoulder — one per upper arm on its outer face in the upper third, and the big
   *     light disc on each mint cap, which is a fastener at a different scale. That is the whole
   *     inventory on the front figure. Anything more and it stops being an injection-moulded
   *     consumer product, which the material file's own opening note is emphatic about.
   *  4. Lines FOLLOW THE FORM. The yoke seam is a shallow downward arc, not a straight rule.
   *
   * COST: ONE merged mesh per robot. `j.chest` carried `mats.shell` and the keepSeparate decal
   * and no `mats.gap`, so every line and screw here collapses into a single new gap mesh —
   * which is why they are all built into one geometry and why the flank seams are laid on the
   * FRONT surface rather than wrapped round the silhouette, where they would need a second
   * solver for a third of a line nobody can see at 2 m.
   */
  {
    const off = w(0.0011);   // proud of the shell, so it paints rather than z-fights
    const strips = [];

    /** A ribbon lying on the chest's front (dir +1) or back (dir -1) face. */
    const line = (dir, o) => {
      const { thick, N = 24 } = o;
      const pos = [], uv = [], idx = [];
      for (let i = 0; i <= N; i++) {
        const u = i / N;
        // `pt(u)` -> [x, y] on the ribbon's centreline, in chest-local space
        const [cx, cy] = o.pt(u);
        // ribbon runs perpendicular to its own tangent, in the XY plane
        const [nx, ny] = o.vertical ? [1, 0] : [0, 1];
        for (const s of [-1, 1]) {
          const px = cx + nx * s * thick * 0.5, py = cy + ny * s * thick * 0.5;
          pos.push(px, py, dir * (chestFaceZ(py - shellY0) + off));
          uv.push(u, 0.5 + s * 0.5);
        }
      }
      for (let i = 0; i < N; i++) {
        const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
        if (dir > 0) idx.push(a, c, b, b, c, d);
        else idx.push(a, b, c, b, d, c);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    };

    /** A screw head: a small dark disc sunk in the shell, with its own tiny slot. */
    const screw = (dir, x, y, r) => {
      const g = new THREE.CircleGeometry(r, 12);
      if (dir < 0) g.rotateY(Math.PI);
      g.translate(x, y, dir * (chestFaceZ(y - shellY0) + off * 0.5));
      return g;
    };

    const yBot = shellY0 - chestH * 0.5;
    // 1 — THE COLLAR YOKE SEAM, a shallow downward arc under the neck plate. 0.845 -> 0.775 of
    //     the shell: at 0.845 the seam and its two screws sat on the crown roll, where the
    //     surface has already turned away from camera, and they rendered as specks on the top
    //     edge rather than as fittings on a plate.
    const yokeY = yBot + chestH * 0.775;
    for (const dir of [1, -1]) {
      const hw = chestFaceX(yokeY - shellY0) * 0.82;
      const arcY = (x) => yokeY - (1 - (x / hw) ** 2) * chestH * 0.050;
      strips.push(line(dir, {
        thick: w(0.0021),
        pt: (u) => { const x = (u * 2 - 1) * hw; return [x, arcY(x)]; },
      }));
      // 2 — the two collar screws, at 55% of the yoke's half width, ABOVE the seam (measured
      //     off the sheet's front figure: they sit on the yoke plate, not on the pec).
      //     0.0052 -> 0.0034 H radius. Rendered at 0.0052 they are two black BLOBS on the
      //     collar; the sheet's are barely-there grey dots about 3 source px across on a
      //     615 px figure, i.e. 0.0025 H radius. Fasteners on a consumer product are not
      //     punctuation.
      for (const s of [-1, 1]) {
        const sx = s * hw * 0.55;
        strips.push(screw(dir, sx, arcY(sx) + chestH * 0.055, w(0.0026)));
      }
    }
    /*
     * 3 — the pec side seams. RENDERED AND CORRECTED: at 0.0034 H, running 0.74 -> 0.16 of the
     * shell, these four lines closed with the yoke arc above and the lower V below into a
     * hard-edged RECTANGLE drawn round the chest decal — the render's front view read as a
     * badge frame, which is not on the sheet at all. On the sheet the pec's outer break is the
     * faintest mark on the torso and it only exists over the upper half, where the plate rolls
     * away toward the armpit; below that the chest's own shading carries it. So: thinner, and
     * stopped well above the lower edge so the frame cannot close.
     */
    for (const dir of [1, -1]) {
      for (const s of [-1, 1]) {
        strips.push(line(dir, {
          thick: w(0.0018), vertical: true,
          pt: (u) => {
            const y = yBot + chestH * (0.76 - 0.22 * u);
            return [s * chestFaceX(y - shellY0) * (0.80 + 0.06 * Math.sin(u * Math.PI)), y];
          },
        }));
      }
    }
    // 4 — THE LOWER CHEST EDGE. On the sheet the chest plate finishes in a wide shallow V with
    //     the waist module stepping back under it; it is the strongest horizontal on the torso.
    const lowY = yBot + chestH * 0.135;
    for (const dir of [1, -1]) {
      const hw = chestFaceX(lowY - shellY0) * 0.93;
      /*
       * ALL FOUR WEIGHTS CAME DOWN AGAIN, and the reason is compositional rather than per-line.
       * Four marks of similar weight arranged round a rectangle read as a FRAME whatever each
       * one is doing individually, and the render's front view was a badge in a box. The sheet's
       * torso carries the same four breaks and none of them is heavier than the shading around
       * it. Yoke 0.0042 -> 0.0021, screws 0.0052 -> 0.0026, pecs 0.0034 -> 0.0018 and shortened,
       * lower edge 0.0040 -> 0.0021 across this round.
       */
      strips.push(line(dir, {
        thick: w(0.0021),
        pt: (u) => { const x = (u * 2 - 1) * hw; return [x, lowY - (1 - (x / hw) ** 2) * chestH * 0.085]; },
      }));
    }
    parts.chestSeams = mesh(mergeGeos(strips), mats.gap, 'chestSeams');
    parts.chestSeams.castShadow = false;
    chest.add(parts.chestSeams);
  }

  // ======================= HEAD =======================
  const neck = new THREE.Group(); neck.name = 'j.neck';
  // ROUND 32: 0.92 -> 1.01 of `chestH`. `chestH` itself came down (0.88 -> 0.80 of the
  // chin-to-waist run) so the chest could stop reaching the shoulder line, and the neck has to
  // hold its WORLD height or the whole figure shortens by 1.4% and every H-fraction in the
  // measurement table shifts under it. 1.01 puts the crown back at 0.9965 H, where it was.
  neck.position.y = chestH * 1.01;
  chest.add(neck);
  joints.neck = neck;

  parts.neckPost = mesh(segment(w(0.026), w(0.030), h(0.030), 16), mats.chrome, 'neckPost');
  parts.neckPost.position.y = h(0.030);
  neck.add(parts.neckPost);

  const head = new THREE.Group(); head.name = 'j.head';
  // ROUND 31: 0.030 -> 0.016. `W.headH` grew by 0.016 H and the joint drops by the same
  // amount, so the CROWN does not move and the head extends downward into the jaw the sheet
  // draws. The neck post is 0.030 H long from the neck joint, so it is now buried 0.014 H
  // inside the skull and shows the short thick neck the sheet has rather than a long stalk.
  head.position.y = h(0.016);
  neck.add(head);
  joints.head = head;

  /*
   * ROUND 31 — THE HELMET IS A ROUNDED CUBE AGAIN, and round 16's sphere is retracted.
   *
   * Round 16 set the corner radius to 90% of the half-min clamp, which with near-equal
   * W/H/D leaves a box of half-extents (0.0085, 0.0185, 0.0075) inside a ball of 0.0675 —
   * a sphere in all but name. Its stated reason was that a flat facet showed in profile.
   * Measured against the sheet that is the wrong trade twice over:
   *
   *   - the sheet's head is unmistakably a rounded CUBE. Its profile has a flat-ish jaw
   *     under the visor, a squared brow and a broad flat side face; a ball has none of
   *     those, which is most of why the profile check has failed eight rounds running.
   *   - a ball has no side face for the ear to sit in, so the ear had to be cantilevered on
   *     a boss, which is the "drum bolted to the skull" every critic since round 20 has
   *     described. A flat gives the lens a seat.
   *
   * 0.74 leaves half-extents (0.0205, 0.0305, 0.0195) — real flats, still soft. That also
   * squares the jaw, which is what recovers the width at H 0.845.
   */
  /*
   * ...BUT IT IS BUILT SQUARE AND THEN STRETCHED, which is not the same thing and the first
   * cut of this round got it wrong. `roundedBoxGeometry` takes ONE corner radius, so the
   * flattest face of a rounded box is always the one on its LONGEST axis. Feeding it the
   * head's real 0.152 x 0.172 x 0.150 gave half-extents (0.020, 0.030, 0.019): the biggest
   * flat was the CROWN, and it rendered as a toaster — a hard flat top where the sheet has
   * its roundest surface.
   *
   * So the box is built with Y equal to X, which puts the flats on the SIDES where the ear
   * seats and leaves the crown as pure fillet, and every head-surface geometry is then
   * scaled by `headSquash` in Y. The visor, brow, crown seam and vents all come off
   * `headSurface()`, so scaling them by the same factor keeps them exactly on the shell —
   * the property that made the surface-solver construction worth having in the first place.
   *
   * The stretch also lands on the right side of a known face defect. `visorCap` maps uv
   * linearly in ANGLE, so a 1.13 vertical stretch makes the face 13% taller; round 28
   * measured the sheet's eyes at h/w 1.15 against this rig's 0.80, so this moves toward the
   * sheet rather than away from it.
   */
  const headSquash = W.headH / W.headW;
  // 0.74 -> 0.82. 0.74 was over-corrected and rendered a rounded BRICK: with the box built
  // square in Y the flats land on the sides and the jaw, and at 0.74 those flats are
  // 0.041 H across, which is a third of the head. The sheet's profile is an egg with a
  // broad soft side, not a slab. 0.82 leaves a 0.026 H flat — enough to seat the ear and
  // square the jaw, not enough to show a facet in silhouette.
  const headHalfMin = Math.min(w(W.headW), w(W.headD)) * 0.5;
  const headR = headHalfMin * 0.78;
  const headBox = new THREE.Vector3(
    w(W.headW) * 0.5 - headR, w(W.headW) * 0.5 - headR, w(W.headD) * 0.5 - headR);
  /** Everything built on `headBox`/`headR` is in the unstretched frame; this lands it. */
  const headStretch = (geo) => { geo.scale(1, headSquash, 1); return geo; };
  const headGeo = headStretch(
    roundedBoxGeometry(w(W.headW), w(W.headW), w(W.headD), headR, 8));
  parts.head = mesh(headGeo, mats.shell, 'head');
  parts.head.position.y = w(W.headH) * 0.5;
  head.add(parts.head);

  // THE VISOR — see visorCap() above for the construction and for the measurements the
  // window comes from. It is a patch of the helmet's own surface, so it wraps because it
  // has no choice; the five rounds spent widening and bowing a flat plate could not have
  // worked. Everything below is the angular WINDOW, in radians.
  const VISOR = {
    // Re-solved against the render, not against the ideal sphere the first pass assumed:
    // the surface distance at 49 deg azimuth is 0.084 H, not the 0.076 H half-width, so the
    // cap projects WIDER than sin(azMax) predicts and 50 deg overshot the sheet's 0.82.
    azMax: THREE.MathUtils.degToRad(49),   // sheet: blue width / head width = 0.82
    elMid: THREE.MathUtils.degToRad(-10.6),
    elHalf: THREE.MathUtils.degToRad(49),  // +38.4 at the brow, -59.5 under the chin
    k: 3.4,                                // superellipse: the sheet's rounded-rect screen
    off: w(0.0040),                        // proud of the shell — the sheet's slight step
    skirt: w(0.0060),                      // rim sunk below it, so the step catches light
    // MUST STAY EQUAL — see the UV note on visorCap(). Unequal windows stretch the face.
    azFace: THREE.MathUtils.degToRad(54),
    elFace: THREE.MathUtils.degToRad(54),
  };
  parts.faceplate = mesh(headStretch(visorCap(headBox, headR, VISOR)), mats.face, 'faceplate');
  parts.faceplate.userData.keepSeparate = true;
  parts.faceplate.position.y = w(W.headH) * 0.5;
  head.add(parts.faceplate);

  // Brow ridge: the sheet's forehead cue is a shell panel ABOVE the screen with a seam
  // under it. It rides the dome on the same surface solver the visor does — the old
  // straight roundedBox laid across a sphere poked its ends out through the crown, which is
  // the same class of bug as the crown seam below.
  parts.brow = mesh(
    headStretch(visorCap(headBox, headR, {
      ...VISOR,
      // 9.5 -> 4.5: the sheet's forehead panel sits ON the top edge of the screen. At 9.5
      // it cleared the visor by a visible band of bare shell and read as a separate strip
      // stuck to the crown, which the taller head made worse rather than caused.
      elMid: VISOR.elMid + VISOR.elHalf + THREE.MathUtils.degToRad(4.5),
      elHalf: THREE.MathUtils.degToRad(7.0),
      azMax: THREE.MathUtils.degToRad(44),
      k: 2.6, off: w(0.0016), skirt: w(0.0040), NR: 6, NA: 40,
    })), mats.shell, 'brow');
  parts.brow.position.y = w(W.headH) * 0.5;
  head.add(parts.brow);

  /*
   * THE TWO BROW SCREWS — round 32, item 1, the head's share of it.
   *
   * The sheet's front figure puts exactly two fasteners on the forehead plate, one either side
   * of centre, and they are the only screws anywhere on the head. That is the same rule the
   * chest seams follow: screws sit on YOKES AND PLATES, never in the middle of a panel. They ride
   * the same surface solver the plate does, so they cannot float or sink however the head is
   * retuned, and `j.head` already carries `mats.gap` for the crown seam and the vents — free.
   */
  {
    const browEl = VISOR.elMid + VISOR.elHalf + THREE.MathUtils.degToRad(4.5);
    const sc = [];
    for (const s of [-1, 1]) {
      sc.push(headStretch(visorCap(headBox, headR, {
        ...VISOR,
        azMid: s * THREE.MathUtils.degToRad(21),
        azMax: THREE.MathUtils.degToRad(2.4),
        elMid: browEl, elHalf: THREE.MathUtils.degToRad(2.4),
        k: 2.0, off: w(0.0026), skirt: w(0.0010), NR: 2, NA: 10,
      })));
    }
    const bs = mesh(mergeGeos(sc), mats.gap, 'browScrews');
    bs.position.y = w(W.headH) * 0.5;
    bs.castShadow = false;
    head.add(bs);
  }

  // ear disc — rebuilt on a boss (round 15). The old earDisc() lathe profile ran its rings
  // to y = -0.038 and rotateZ(-PI/2) — the opposite sign from driveDisc's documented
  // convention — so the ringed face landed INSIDE the shell while only the hub sat proud;
  // its depths were also raw world numbers that never scaled with H. Carrying the hip
  // technique instead decouples ear size from head flatness entirely: a short chrome boss
  // sits flush on the head's flat side face, and a driveDisc ring is mounted on the boss's
  // OUTER face, well clear of the shell curvature, with a dark bore at the hub.
  for (const s of [-1, 1]) {
    const side = s < 0 ? 'L' : 'R';
    // SIZE IS NOT THE DEFECT — measured, the sheet's ear ring is 0.29 H in radius against
    // this 0.032, i.e. the art's ear is LARGER than ours. What made it dominate the profile
    // was that it stood 0.023 H proud of a 0.076 H half-width head — 30% of the head's own
    // radius, cantilevered on a boss — while the sheet's sits nearly flush in the shell.
    // Seating it takes the protrusion to 0.004 H (5%), which is what the front view of the
    // sheet shows: a chrome sliver at the silhouette edge, not a drum bolted to the skull.
    // ROUND 30: 0.032 -> 0.0355, the measured radius of the sheet's own ear (see `earLens`).
    // Growing it is not a contradiction of "it is too dark, not too big" — it is what that
    // finding implies. A bright annulus recedes at any size; the previous two rounds shrank
    // a dark one and bought a few points each time without ever closing the check.
    /*
     * ROUND 31 — SIZE AND PLACEMENT, both re-measured on the profile crop with the head's
     * own silhouette as the ruler, because "0.29 H in radius" in the note above is a typo
     * for 0.029 and the 0.0355 it justified overshot.
     *
     *                    ear diameter / head length      ear centre, from the back of the head
     *   sheet                    0.419                              0.473
     *   round 30                 0.484                              0.398
     *
     * So it is 16% too big and it sits 0.075 head-lengths too far BACK. Note the direction:
     * the standing brief for this round said the sheet's ear is pushed toward the crown and
     * the back, and it is not — measured, the sheet's ear is very close to the centre of the
     * head in both axes and OURS is the one sitting back of centre. It is also at the right
     * HEIGHT already (0.53 of head height from the jaw in both), which is worth recording:
     * two rounds have moved it vertically on an eyeball reading and had nothing to show.
     *
     * The boss survives but is now nearly redundant — the shell has a real flat side face
     * again (see the helmet note), so the lens has something to seat on and the boss is
     * 0.004 H of seat rather than 0.010 H of cantilever.
     */
    const bossR = w(0.0307);
    const bossThick = w(0.007);
    /*
     * A RAISED PORT, and -0.011 was tried first and is why this note exists: it seats the
     * lens so its centre disc is 0.0006 H proud, which is what a recessed port needs — and
     * the ear then VANISHED, because everything outboard of the centre disc (the annulus,
     * the whole bezel) is by construction BELOW the centre disc and therefore inside the
     * shell. There is no boolean here. A recess cannot be cut, only faked, and the fake is
     * to stand the port proud and let its own outer wall cast the ring.
     *
     * So the lens face stands 0.008 H proud of the shell's 0.076 H side flat and the bezel
     * is its outer wall, buried 0.003-0.009 H into the shell all the way round so no rim
     * can float where the head's curvature falls away. The round-15 complaint this looks
     * like ("a drum bolted to the skull") was 0.023 H on a boss — three times this, on an
     * ear that was also oversized and ringed with black.
     */
    const bossX = s * (w(W.headW) * 0.5 - w(0.006));
    const earY = w(W.headH) * 0.53;
    const earZ = w(0.008);

    // Boss in SHELL now, not chrome: it is the wall of the recess the lens sits in, so any
    // sliver of it that shows at the silhouette edge should be the head's value, not the
    // near-black chrome reads at in this env.
    const boss = mesh(new THREE.CylinderGeometry(bossR, bossR, bossThick, 20), mats.shell, `earBoss${side}`);
    boss.rotation.z = Math.PI / 2;
    boss.position.set(bossX, earY, earZ);
    head.add(boss);
    parts[`earBoss${side}`] = boss;

    const ringX = bossX + s * (bossThick * 0.5);
    // The lens is the BRIGHT half of the port: centre disc plus annulus land, both near
    // flat so they hold the shell's own value, which is what the sheet's 187 against a 159
    // shell says they should do. All the dark in the part is the bezel below.
    const earProud = w(0.0105);
    const ring = mesh(earLens(bossR, earProud), mats.shell, `ear${side}`);
    ring.position.set(ringX, earY, earZ);
    ring.scale.x = s;
    head.add(ring);
    parts[`ear${side}`] = ring;

    /*
     * THE BEZEL — the dark ring, and it is ANGLE, not material. Both were measured.
     *
     *   ear band            sheet   shell chamfer at 52 deg   chrome wall at 75 deg
     *   centre disc          187            182                       177
     *   annulus land         125            190                       169
     *   outer band            99            163                        32
     *
     * Shallow shell was far too bright; chrome at the same steep angle overshot to 32,
     * because `mats.chrome` has no diffuse term and a wall facing radially outward finds
     * this view's dark flag panels and nothing else — the same mechanism that made the old
     * grooved ear a black bullseye. So the wall keeps the 75 degrees, which is what makes
     * it a BAND rather than a gradient, and goes back to `mats.shell`, whose diffuse floor
     * holds it up. That also puts it back in a material `j.head` already carries, so the
     * one extra merged mesh per head this was going to cost is not spent.
     */
    const bezel = mesh(earBezel(bossR, earProud), mats.shell, `earBezel${side}`);
    bezel.position.set(ringX, earY, earZ);
    bezel.scale.x = s;
    head.add(bezel);
    parts[`earBezel${side}`] = bezel;

    // TWO SCRIBES, placed off the lens profile rather than guessed: one at `EAR.wall0`,
    // the lip where the bright land turns down into the bezel, and one at `EAR.scribe`,
    // the step between the centre disc and the annulus. Both sit at their own feature's
    // axial height — a scribe pinned to a flat offset floats off a profile that is not
    // flat. `mats.gap` is already on the head for the vents, so both are free.
    // Tube radius 0.0013 -> 0.0022 and 22 -> 32 tubular segments. At 0.0013 H the ring is a
    // 0.9 px tube on a 41 px circle at this framing and it rendered as a dotted line, not a
    // scribe: under about 1.5 px a dark line on a bright shell aliases into dashes. The
    // OUTER ring also moves from the top lip of the bezel to its foot, where the port meets
    // the shell — that contact line is the strongest single cue in the sheet's own ear and
    // the only one a near-white bezel cannot draw for itself.
    for (const [rr, tt, dx] of [
      [bossR * 0.965, 0.0022, 0.0105 * 0.12],
      [bossR * (EAR.scribe + 0.015), 0.0016, 0.0105 * 0.86],
    ]) {
      const sg = new THREE.TorusGeometry(rr, w(tt), 4, 32);
      sg.rotateY(Math.PI / 2);
      const sm = mesh(sg, mats.gap, `earScribe${side}${rr > bossR * 0.8 ? 'O' : 'I'}`);
      sm.position.set(ringX + s * w(dx), earY, earZ);
      head.add(sm);
    }

    // The hub PLUG is gone. `earLens` closes over the axis itself, so the flat inner disc is
    // part of the lens rather than a separate mesh sunk into a hole — which removes both the
    // dark ring the plug's step used to cast and one mesh per ear. Anything reading
    // `parts.earBore*` is reading a part that no longer exists on this model; nothing does.
  }

  // CROWN SEAM and VENTS — both were straight primitives laid ACROSS the dome, and both
  // showed it: the seam was a 0.90*headD bar in Z at y = 0.985*headH, so its two ends stood
  // clear of a shell that had already curved away under them and read in profile as a pair
  // of black fins sticking out of the crown; the louvres sat at z = -headD*0.5 exactly,
  // which is the shell's depth AT THE EQUATOR, so 0.031 H below it they hung in mid-air off
  // the back of the skull. Same bug as the flat faceplate, same fix — put them on the
  // surface solver. Neither is a new feature; they are the same two parts, seated.
  //
  // The seam runs front-to-back, which is a path in ELEVATION, so it is built in a frame
  // with Y and Z swapped (hence the permuted box) and rotated onto the crown afterwards.
  // rotateX(-90) maps the cap's forward +Z to +Y and its +Y to -Z, so positive built
  // elevation runs toward the BACK of the head — which is why the window is biased +20.
  const seamGeo = visorCap(
    new THREE.Vector3(headBox.x, headBox.z, headBox.y), headR, {
      /*
       * ROUND 33 — 1.9 deg -> 1.05 deg, and the elevation window runs further round the back.
       *
       * Cropped against the sheet's own back head (`1105,95,130,140` at 4x) this was the single
       * most overstated mark in the frame: a 2 px near-black stroke that starts and stops in the
       * middle of a clean dome. The sheet has NO ink on its crown at all. What it has is a broad
       * SHELL PANEL whose edge reads as a soft groove with a bright roll beside it, running from
       * the brow right over the crown and dying into the vents.
       *
       * So: half the width, and the window extended back (elMid 34->40, elHalf 24->28, i.e.
       * 12..68 deg instead of 10..58) so the line runs out into the vent field rather than
       * stopping mid-dome. It cannot go much thinner in RELIEF — round 32 measured `off` 0.0005
       * stippling because `headStretch` sinks part of every row back inside the shell — so the
       * dial-back is width and run, which is what the crop says is wrong with it.
       */
      azMax: THREE.MathUtils.degToRad(1.05), azFace: 1, elFace: 1, k: 8,
      /*
       * ROUND 32, SECOND PASS — the seam was STIPPLING and it was doing it over the FRONT of
       * the head. At `off` 0.0005 H (0.85 mm) it stood less proud of the shell than
       * `headStretch` then squashed it, so part of every row sank back inside and the crown
       * rendered as a broken dashed arc above the brow — one of the few things in the frame
       * that reads as a bug rather than as a design choice. And it should not be visible from
       * the front at all: elevation -12..+52 carried it forward over the forehead, where the
       * sheet's front figure has nothing but clean shell and the brow plate.
       */
      elMid: THREE.MathUtils.degToRad(40), elHalf: THREE.MathUtils.degToRad(28),
      off: w(0.0016), skirt: w(0.0030), NR: 3, NA: 40,
    });
  seamGeo.rotateX(-Math.PI / 2);
  headStretch(seamGeo);   // after the rotate, so the stretch is in head space, not seam space
  parts.crownSeam = mesh(seamGeo, mats.gap, 'crownSeam');
  parts.crownSeam.position.y = w(W.headH) * 0.5;
  head.add(parts.crownSeam);

  // rear vent louvres, seated on the back of the skull. Azimuth is measured from +Z, so
  // 197 deg is 17 deg round the back on the -X side, where they were.
  const ventGeos = [];
  for (let i = 0; i < 4; i++) {
    ventGeos.push(visorCap(headBox, headR, {
      azMid: THREE.MathUtils.degToRad(197), azMax: THREE.MathUtils.degToRad(12),
      elMid: THREE.MathUtils.degToRad(-23.5 - i * 6.5), elHalf: THREE.MathUtils.degToRad(1.9),
      k: 8, azFace: 1, elFace: 1,
      off: w(0.0004), skirt: w(0.0028), NR: 2, NA: 32,
    }));
  }
  parts.vents = mesh(headStretch(mergeGeos(ventGeos)), mats.gap, 'vents');
  parts.vents.position.y = w(W.headH) * 0.5;
  head.add(parts.vents);

  // ======================= ARMS =======================
  const sockets = {};
  const limbs = {};

  /**
   * ROUND 28, ITEM 1 — "the arms don't have the upper arm segment that the robot has."
   *
   * MEASURED DIAGNOSIS, because the part is not missing — `upperArm${side}` has always been
   * built. It had nowhere to be SEEN. The mint cap's lower edge sits at 0.690 H (the sheet's
   * is 0.691 H, so the cap is right) and the elbow was at 0.670 H, which leaves exactly
   * 0.020 H of chrome tube between them — about 13 px on the turnaround's own framing. The
   * sheet has 0.147 H there. Neither of the two causes the round proposed was the one: it is
   * not `uaTop` (moving the tube's start does not move the elbow) and it is not
   * `W.upperArmR` (a slimmer tube is still a tube). The arm's INTERNAL SPLIT was wrong.
   *
   * Total shoulder-to-fingertip is already right — 0.375 H here against the sheet's 0.378 H.
   * Only the joint inside it was misplaced: the sheet spends 48.7% of that run on the upper
   * arm and 31.5% on the forearm; this file spent 32% and 41%, i.e. the two were swapped.
   * So the total is held FIXED and re-split at the sheet's ratio, which moves the elbow down
   * 0.047 H and leaves the WRIST, the HAND and every gadget/limb attach point below it at
   * exactly the world positions they already had:
   *
   *              upper arm   forearm   elbow at   wrist at   fingertip
   *   sheet        0.184      0.119     0.544 H    0.425 H    0.350 H
   *   was          0.120      0.155     0.670 H    0.515 H    0.415 H
   *   now          0.167      0.108     0.623 H    0.515 H    0.415 H
   *
   * That leaves 0.067 H of bare chrome between cap and elbow — 44 px, a segment you can see.
   * The remaining gap to the sheet is the shoulder pivot, which is 0.062 H higher here than
   * the sheet's; moving it is torso work and is deliberately not attempted from the arms.
   *
   * NOTE for whoever touches `src/game/limbs.js`: `_armStub()` calls the upper arm
   * `height * 0.145`, which never matched this file's 0.120 and does not match 0.167 either.
   * It is only used to fake a shoulder when a socket is EMPTY, so it has never been visibly
   * wrong, but it is a second constant no code here has ever read.
   */
  const upperArmLen = h(0.167);
  const foreArmLen = h(0.108);

  for (const side of ['L', 'R']) {
    const s = side === 'L' ? -1 : 1;

    // socket sits at the shoulder pivot on the chest, at +/-0.130H (W.shoulderSpan * 0.5).
    // Pivot 0.130 + cap outward offset 0.014 + cap max half-width ~0.034 + shear ~0.011
    // puts the outer silhouette edge at ~0.189H per side, i.e. ~0.378H total, against the
    // 0.375H measured off the sheet. See the ROUND 14 note at the top of this file.
    /**
     * ROUND 30, ITEM 2 — the arm hangs FORWARD of the torso, and the Z here is the fix.
     *
     * The item is filed as "the profile forearm collapsed into the torso", diagnosed as a
     * side effect of round 28's elbow rebuild. It is not that, and `measure.mjs` says so: the
     * regression's stated evidence — figure 2 reporting NO DAYLIGHT between arm and torso —
     * cannot be evidence, because the tool reports NO DAYLIGHT for the REFERENCE figure 2 as
     * well. Its arm-gap test needs THREE masses in a row (arm, torso, arm) and a profile view
     * only ever has two, so the row is undefined for that figure in both images. See the
     * report for the full note.
     *
     * What is real, and is measurable, is the raw width profile. Through the band the arm
     * occupies, figure 2 ran -23.7% at 0.545 H and -48.7% at 0.655 H against the sheet while
     * being within 10% everywhere below the hand. The sheet's profile arm hangs clear of the
     * body's front line — from the elbow down it IS the front silhouette, and the elbow disc
     * is the frontmost point of the whole figure at that height. Ours hung on the torso's own
     * centreline in Z, so it added nothing to the profile at all: it was inside the abdomen's
     * footprint from shoulder to wrist.
     *
     * A rest ROTATION cannot carry it. `setPose` writes all three Euler axes whenever a
     * consumer names a joint, and `char-turnaround.js`, `char-locomotion.js` and the game all
     * name the shoulders — so any lean built into `rest` is overwritten on the first pose.
     * Link geometry survives every pose, so the lean is baked into the upper arm below
     * (`armLean`) instead.
     *
     * ⚠ IT IS NOT DONE BY MOVING THIS SOCKET, and that was tried first and rendered: a
     * +0.030 H socket offset carries the MINT CAP forward with it, and the cap is 0.116 H
     * deep, so it ended up projecting 0.087 H in front of a chest whose own front face is at
     * 0.062 H — a mushroom hanging off the front of the shoulder. The cap belongs on the
     * shoulder; only what hangs BELOW the shoulder should come forward.
     */
    const socket = new THREE.Group();
    socket.name = `socket.shoulder${side}`;
    socket.position.set(s * w(W.shoulderSpan * 0.5),
      h(L.shoulder) - (h(L.hip) + spine.position.y + chest.position.y), 0);
    chest.add(socket);
    sockets[`shoulder${side}`] = socket;

    // the limb subtree root — this is what detaches
    const shoulder = new THREE.Group();
    shoulder.name = `j.shoulder${side}`;
    shoulder.userData.limb = { id: `arm${side}`, socket: `shoulder${side}`, mass: 1.0, kind: 'arm' };
    socket.add(shoulder);
    joints[`shoulder${side}`] = shoulder;
    limbs[`arm${side}`] = shoulder;

    // CHROME BALL JOINT + RING COLLAR. The manifest is explicit that a chrome ball with a
    // visible ring collar must still read UNDER the mint cap, and the sheet's left-profile
    // view is where it does: the mint reads there as a big round dome sitting inside two
    // concentric chrome rings. So the ball is sized to be hooded by the cap on the top and
    // outboard sides while staying proud of it inboard, at the armpit, where the sheet
    // shows bare chrome between the cap and the chest.
    // Ball radius is bounded by the cap, not chosen freely: the cap narrows toward its apex,
    // so a ball wider than the cap's half-width at the ball's own height punches out through
    // the mint as a grey blob. At 0.021H it stays inside.
    const ballR = w(0.021);
    const ball = mesh(new THREE.SphereGeometry(ballR, 20, 14), mats.chrome, `shoulderBall${side}`);
    ball.position.y = w(0.020);   // round 30: +0.050 H, holding world height as L.shoulder dropped
    shoulder.add(ball);

    // Two collar rings, axis along X so they read as a ring collar around the cap dome in
    // the left-profile view, exactly as the sheet draws it.
    //
    // THEIR X MATTERS MORE THAN THEIR RADIUS. A ring's radius is its extent in Z as well as
    // Y, so a ring wider than the cap's Z half-extent pokes out through the FRONT of the
    // cap and paints a dark arc straight across the mint — two earlier attempts at this
    // did exactly that, once across the middle of the face and once across the top. So the
    // rings are pinned to the cap's INNER edge (d = 0.121H): there they emerge into the
    // armpit, which is where the sheet has a dark wedge between cap and chest anyway, and
    // they never cross the mint face.
    const collarGeos = [];
    for (const cr of [w(0.030), w(0.038)]) {
      const g = new THREE.TorusGeometry(cr, w(0.0040), 8, 26);
      g.rotateY(Math.PI / 2);
      g.translate(s * -w(0.024), 0, 0);   // round 30: +0.050 H, ditto
      collarGeos.push(g);
    }
    const collar = mesh(mergeGeos(collarGeos), mats.chrome, `shoulderCollar${side}`);
    shoulder.add(collar);

    // ======================= MINT CAP =======================
    // THE signature read of this character, and the thing a previous pass sized out of
    // existence: its rx was 0.022H while the chrome ball was 0.030H and the upper arm
    // 0.033H, so the "cap" was entirely INSIDE the two chrome parts it is supposed to hood
    // and the render contained zero mint pixels. The rule that prevents that regression
    // recurring: the cap's half-width must stay comfortably GREATER than
    // max(ballR, W.upperArmR), because a shell that hoods a thing is by definition bigger
    // than the thing.
    //
    // Shape, measured off the sheet (see the ROUND 14 note): from the front the cap is a
    // rounded fin — a soft apex at the top leaning inboard toward the neck, a long convex
    // outer flank, its widest point low, 0.0765H wide by 0.0912H tall. From the left
    // profile it is a broad round dome ~0.09H across sitting in the chrome collar. An
    // ellipsoid gives the profile dome; taperY narrows it toward the crown to make the
    // fin; shearXByY leans that apex inboard so it is asymmetric rather than a plain
    // teardrop. Deliberately NOT a sphere and NOT a flat pad.
    //
    // Placed LOW in the shoulder group (-0.050H) so the visible mass sits down over the
    // ball and the top of the upper arm. That is not cosmetic: the socket is at 0.790H
    // against the sheet's 0.728H, and dropping the cap within the group carries the rest of
    // the way without moving a joint. It lands the cap at 0.798..0.682H against the sheet's
    // 0.780..0.691H — close enough that the caps sit ON the shoulders instead of up beside
    // the neck, which is how they read when the socket was at 0.815H.
    // The taper/shear pair is what makes this a FIN and not an egg. A first attempt used a
    // gentle 0.62 taper and a 0.20 shear and read as a smooth rounded blob next to the
    // sheet's hard-edged shark fin. The sheet's silhouette is closer to a rounded right
    // triangle: a defined apex at the top leaning in toward the neck, a long convex flank
    // sweeping down and out, and its widest point low.
    // `taperY` smoothsteps across the WHOLE height, so a hard top taper thins the middle
    // too and costs the cap its mass — 1.06/0.44 gave a properly pointed apex on a cap that
    // had shrunk back to a modest patch. Widening the base and softening the taper keeps
    // the apex while restoring the bulk the sheet's pauldron actually has.
    // Final sizes measure 0.079-0.084 H wide by ~0.100 H tall per cap and put the shoulder
    // silhouette at ~0.394 H, against the sheet's 0.0765 / 0.0912 / 0.375. A few percent
    // over on purpose: the failure this pass exists to undo was an undersized cap, and both
    // a critic and the lead called the previous build too slim, so the safe side is heavy.
    /*
     * ROUND 32 — the cap drops 0.008 H inside the group and its ry comes down 0.050 -> 0.047.
     *
     * `measure.mjs` puts the front figure **+40% wide at 0.790 H** even after the chest was
     * rebuilt, and a per-row silhouette dump on the render says why: the width jumps from
     * 0.198 H to 0.326 H between two adjacent rows at y 346/354, i.e. at 0.784 H — the TOP OF
     * THE CAPS, not the chest. Centred on a 0.740 H pivot with ry 0.050 the cap crowned at
     * 0.790 H; the sheet's (round-14 measurement, unchanged) tops out at 0.780 H. Now
     * 0.740 - 0.008 + 0.047 = 0.779 H, with the bottom at 0.685 against the sheet's 0.691.
     */
    const capGeo = blob(w(0.0495), w(0.047), w(0.060), 28);
    taperY(capGeo, 1.00, 0.74);
    shearXByY(capGeo, -s * 0.18);
    const cap = mesh(capGeo, mats.mint, `mintCap${side}`);
    cap.position.set(s * w(0.004), -w(0.008), -w(0.001));
    shoulder.add(cap);
    parts[`mintCap${side}`] = cap;

    // The chrome boss the sheet draws on the cap's face, low and inboard of the arm axis.
    // Straddles the cap's front surface rather than floating in front of it — the cap is an
    // ellipsoid, so its Z falls away fast off the centreline and a boss placed at a flat
    // "front" depth ends up half-buried on one side and floating on the other.
    const boss = mesh(new THREE.CylinderGeometry(w(0.0110), w(0.0110), w(0.006), 18), mats.chrome, `capBoss${side}`);
    boss.rotation.x = Math.PI / 2;
    boss.position.set(s * -w(0.010), -w(0.007), w(0.030));   // round 30: +0.050 H, ditto
    shoulder.add(boss);

    // UPPER ARM. The chrome tube starts 0.048H BELOW the pivot rather than at it. This is
    // purely where the mesh begins — the joint, the elbow, the wrist and every gadget
    // attach point are untouched, because the segment is shortened by exactly the amount
    // it is dropped. The reason is the cap: a tube that starts at the pivot runs straight
    // up through the middle of the mint cap and clips it to a thin crescent, which is most
    // of why the previous pass' cap failed to read even before it was sized down. Starting
    // the tube under the cap lets the ball and the cap own the shoulder, and the chrome
    // emerges from beneath the hood exactly as the sheet draws it.
    // Taper softened from 1.15->0.82 to 1.12->1.00 now that the run is 0.119 H instead of
    // 0.072 H. The old ratio over the new length pinches the tube to 0.024 H at the elbow —
    // thinner than the forearm below it, which reads as a broken arm rather than a segment.
    // The sheet's upper arm is very nearly parallel with a slight swell into the joint.
    // 0.048 -> 0.012. That 0.048 H was the cap's own drop inside the group: with the cap
    // hanging below the pivot, a tube starting at the pivot ran up through it. The cap is
    // centred on the pivot now, so the tube emerges from under it starting almost at the
    // pivot and the shortening is no longer needed. `upperArmLen - uaTop` keeps the elbow,
    // the wrist and every gadget attach point where they are.
    const uaTop = w(0.006);
    /**
     * `armLean` — ITEM 2, and it is a property of the LINK, not of the pose.
     *
     * The sheet's profile arm leaves the shoulder angled forward about 12 degrees, so the
     * elbow ends up in front of the torso's own front line and the forearm and hand hang
     * clear of the body. Ours hung on the torso's Z centreline, which is why figure 2
     * measured -23.7% at 0.545 H and -48.7% at 0.655 H while being within 10% everywhere the
     * arm is not.
     *
     * 0.20 rad puts the elbow 0.0314 H forward at exactly the height it already had:
     * `upperArmLen` is preserved as the VERTICAL drop and the tube is lengthened by
     * 1/cos(lean) to reach the new corner, so the wrist, the hand and every gadget and limb
     * attach point stay at the world heights round 28 established. Nothing outside this file
     * has to know.
     */
    /**
     * `armFwd` — the second half of item 2, and it is applied to the ARM rather than to the
     * socket for the reason in the socket note: the cap must not travel.
     *
     * The lean alone is not enough, measured. Lean-only took figure 2's 0.655 H band from
     * -48.7% to -47.2%, because 0.655 H is ABOVE the elbow and a lean has barely opened by
     * then; the socket-offset version reached -42.0% there and lost it again to the mushroom
     * cap. Offsetting the tube and the elbow — but not the ball, the collar, the cap or the
     * boss — buys the same forward mass with the pauldron left on the shoulder. It is also
     * what the sheet draws: its chrome tube emerges from the cap's FRONT half, not from
     * under the middle of it.
     */
    /**
     * `armOut` — ROUND 31, DEFECT 3, and this is the first round the daylight has been
     * MEASURED rather than asserted.
     *
     * `measure.mjs` now reports the WIDTH of the arm/torso gap, not just whether one exists.
     * The boolean was never the defect and a round was lost to that: a hairline row is
     * enough to flip `armTop` from null to a number and make the report read as a pass.
     * The widths, front figure, in H fractions:
     *
     *                  median gap L / R      fraction of the 0.80..0.36 H band with daylight
     *   sheet             0.048 / 0.048                        70%
     *   round 30          0.024 / 0.025                        31%
     *
     * Half the gap, over less than half the run. The raw width profile agrees and says where
     * the mass has to come from: -13.3% at 0.415 H (where the sheet is WIDEST, because that
     * is where its hands are) and -14.6% at 0.545 H, against +9.4% at 0.755 H. So the arms
     * are too far IN from the elbow down and the shoulders are already slightly too wide —
     * which rules out `W.shoulderSpan`, because widening the pivot moves the shoulder line
     * with it.
     *
     * An outward tilt of the LINK moves everything below the pivot and nothing at it. Same
     * argument as `armLean` above, including why it cannot be a rest pose: `setPose` writes
     * all three Euler axes whenever a consumer names a joint, and three consumers name the
     * shoulders. tan(0.195) * 0.161 H = 0.032 H of outward travel at the elbow, which is
     * exactly the per-side deficit at 0.415 H and 0.545 H.
     *
     * `armFwd` is live again at 0.020 H, and it is what makes DEFECT 2 visible rather than
     * merely bigger. The hip bearing sits at 0.545 H, z 0.006 H; the elbow hub sits at
     * 0.573 H and, on lean alone, z 0.043 H with a 0.036 H radius — so in the LEFT PROFILE
     * view the elbow lands on top of the hip and hides about 60% of it. No amount of
     * enlarging the bearing fixes something that is behind another part. 0.020 H forward
     * takes the elbow's rear edge to z 0.027 H against the bearing's front edge at 0.038 H,
     * which clears all but the disc's top-front corner. It also adds the forward mass
     * figure 2 is short of (-15.6% at 0.545 H), and the round-30 note's objection does not
     * apply: this offsets the TUBE and the elbow, not the socket, so the mint cap does not
     * travel and cannot mushroom off the front of the shoulder.
     */
    /*
     * ROUND 32 — `armOut` 0.195 -> 0.085, and the number it was chasing was an instrument
     * artefact rather than a wrong estimate.
     *
     * Round 31 set 0.195 to close a -13.3% width deficit at 0.415 H. That reading came from a
     * table in which the REFERENCE was measured to a sole 32 px above its own feet (see the
     * `--refband` note in `harness/measure.mjs`), so "0.415 H" on the sheet side was sampling
     * 0.445 H — above the sheet's hands, where it is narrow. Re-measured against the reference's
     * true soles the same band is **+18.5% front, +30.4% back**: the arms were never short, and
     * round 31 pushed them 0.032 H per side further out from an already-wide start.
     *
     * 0.085 rad puts the elbow 0.0137 H outboard instead of 0.0318 H. Together with the
     * turnaround pose's shoulder-Z coming back (see `char-turnaround.js`) that is the ~0.040 H
     * per side the table asks for. The daylight is not paid for it: the sheet's median gap is
     * 0.047 H and the mean of this rig's two sides was already 0.044 H — what was wrong was the
     * ASYMMETRY (0.060 left against 0.028 right on a symmetric model), which is perspective on a
     * figure sitting 16 degrees off the camera axis, not geometry, and is fixed in the view.
     */
    /*
     * ============================================================================
     * ROUND 35 — `armFwd` 0.020 -> 0.004 AND `armLean` 0.26 -> 0.10. THIS IS THE "HIP BAND
     * TOO WIDE" DEFECT, AND IT IS NOT THE HIP. IT HAS NEVER BEEN THE HIP.
     * ============================================================================
     *
     * `critic-robot-35` measured the profile figure's hip peak at 0.192 H against the sheet's
     * 0.161, +19.2%, and round 34 had reported closing the same complaint by moving `HIP.hw`
     * and `pelvisW`. Re-measured this round: the critic's number REPRODUCES EXACTLY (0.192 vs
     * 0.161 at 0.584 H vs 0.492 H). Round 34's does not. Both facts have the same cause.
     *
     * `measure.mjs` reports `hips` as `peak(0.46, 0.60)` — the widest silhouette row in that
     * band. On FIGURE 2 the silhouette's width is the body's DEPTH, so that number lives on the
     * Z axis. `HIP.hw` and `pelvisW` are both LATERAL (X). Round 34's own note says so in as
     * many words — "hd is untouched, the profile figure's hip depth is a separate axis and this
     * change does not claim it" — and then reported a lateral result against the critic's
     * profile baseline as if they were one number. The lateral change did land: figure 1's hips
     * now measure 0.435 against the sheet's 0.447, i.e. -2.7%, from the +41% round 33 recorded.
     * Two correct measurements on two different axes, reported as one before/after pair.
     *
     * WHAT THE DEPTH OVERAGE ACTUALLY IS, from the new `--prof` curve dump rather than from the
     * single peak (figure 2, render vs sheet, width and signed front/back edges):
     *
     *        H     w      F      B   |  ref w   refF   refB
     *      0.50  0.157  0.091  0.066 |  0.161  0.077  0.084     -2.2%
     *      0.55  0.174  0.097  0.076 |  0.148  0.076  0.072    +17.5%
     *      0.58  0.190  0.106  0.084 |  0.151  0.079  0.072    +25.9%
     *      0.65  0.180  0.087  0.093 |  0.179  0.090  0.089     +0.6%
     *
     * It is NOT a uniform overage — outside 0.53..0.60 the profile is within a few percent or
     * NARROW. It is a bulge 0.07 H tall, and it is almost entirely on the FRONT edge: at 0.55 H
     * the front is +0.021 and the back is +0.004. A width-only reading cannot see that, which
     * is why the peak has been misattributed for two rounds.
     *
     * AND THE FRONT EDGE THERE IS NOT THE PELVIS. `_tmp_geoprobe.mjs --pick`, a 34-wide
     * ownership raster over that band, returns `j.elbowL.merged` / `j.elbowR.merged` and below
     * them `j.wristL/R.merged` as the front-most meshes on every row; `j.hips.merged` and
     * `j.hipL/R.merged` sit BEHIND them. The bulge is the ARM. Cross-checked against the sheet
     * at 1:1 (crop `450,95,210,645`): the sheet's profile arm hangs at the BACK of the figure —
     * elbow disc on the rear silhouette, body's belly defining the front — and ours hangs in
     * FRONT of the torso's own front line. That is the whole defect, and it is these two
     * constants.
     *
     * THEY WERE RIGHT WHEN THEY WERE WRITTEN. The notes above are round 30/31 work against a
     * figure 2 that measured -23.7% at 0.545 H and -48.7% at 0.655 H — genuinely short of
     * forward mass. Those deficits are closed (0.655 H now reads +0.6%) and the corrections
     * kept going: -24% became +26%. A constant that fixed a deficit has to be re-measured once
     * the deficit is gone, and neither was.
     *
     * `armFwd`'s SECOND justification is also dead, and it is worth saying so explicitly
     * because the note above still argues it: it was raised to 0.020 to stop the elbow hiding
     * the HIP BEARING. Round 34 deleted the hip bearing — the sheet has never had one. There is
     * nothing left at 0.545 H for the elbow to clear.
     *
     * THE ARITHMETIC. The elbow sits at `armFwd + tan(armLean) * uaRun` with `uaRun` 0.161 H,
     * so it was 0.020 + 0.0428 = 0.063 H forward, and with the hub's 0.036 H barrel its front
     * face landed at 0.099 H — against a pelvis whose own front face at that height is 0.078 H.
     * At 0.004 + 0.0162 = 0.020 H the front face is 0.056 H, i.e. INSIDE the body by 0.022 H,
     * and the profile's front edge becomes the torso's, which is what the sheet draws. The
     * predicted front edge at 0.58 H is then the pelvis's 0.078 against the sheet's 0.079.
     *
     * WHAT DOES NOT MOVE: `armOut` (0.115) is untouched, so the front figure's arm daylight —
     * a separate open complaint measured on the X axis — is unaffected. Nothing above the elbow
     * changes the silhouette either: at 0.655 H the upper arm was already inside the chest's
     * 0.079 H half-depth at both leans, which is why that row reads +0.6% before and after. The
     * ball, the collar rings, the mint cap and the boss are all offset from the SOCKET and were
     * never carried by `armFwd`, so the pauldron does not travel (the round-31 note's own
     * reason for putting the offset on the tube rather than the socket).
     */
    const armFwd = w(0.004);
    const armLean = 0.10;
    const armOut = 0.115;
    const uaRun = upperArmLen - uaTop;
    // One direction for both tilts. Built with y = -1 so that normalising it divides by the
    // vector's length and `uaLen = uaRun * len` restores the VERTICAL drop exactly: the
    // elbow, the wrist, the hand and every gadget attach point keep the world heights round
    // 30 established, and only their x and z move.
    const uaDir = new THREE.Vector3(s * Math.tan(armOut), -1, Math.tan(armLean));
    const uaLen = uaRun * uaDir.length();
    uaDir.normalize();
    const ua = mesh(segment(w(W.upperArmR * 1.12), w(W.upperArmR * 1.00), uaLen, 20), mats.chrome, `upperArm${side}`);
    ua.position.set(0, -uaTop, armFwd);
    // `segment` hangs from its own origin, so rotating the MESH pivots it about the tube's
    // top. A quaternion from -Y to `uaDir` carries both tilts at once; composing two Euler
    // rotations would apply the second in the frame the first left behind and put the elbow
    // somewhere neither angle asked for.
    ua.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), uaDir);
    shoulder.add(ua);
    parts[`upperArm${side}`] = ua;

    /**
     * THE UPPER ARM'S OWN DETAIL — round 32, item 1, the arm's share of it.
     *
     * The sheet's upper arm (crop `290,230,90,290` at 6x on the front figure; the profile and
     * back figures show the same) is not a bare tube. It carries exactly two marks: a COLLAR
     * BAND with a scribed ring about four fifths of the way down, where the tube plugs into the
     * elbow housing, and ONE SCREW HEAD on its outer face in the upper third. That is the whole
     * inventory — the sheet's arm detailing is two features on a 0.167 H run, and adding a third
     * would be the greeble the brief warns against.
     *
     * Both are `mats.chrome`, which `j.shoulder` already carries for the ball, the collar rings,
     * the cap boss and the tube itself, so they merge into an existing mesh. A `mats.gap` scribe
     * would have been crisper and would have cost a whole new merged mesh per shoulder — two per
     * robot, eight on this sheet — for two features that are three pixels wide at this framing.
     */
    {
      const detail = [];
      // collar band: a short step-up at 0.78 of the tube's run, so the shoulder end of the
      // elbow housing has something to butt against instead of the tube simply entering it.
      const cy = -uaRun * 0.78;
      const cg = new THREE.CylinderGeometry(w(W.upperArmR * 1.16), w(W.upperArmR * 1.10), w(0.013), 20);
      cg.translate(0, cy, 0);
      detail.push(cg);
      const rg = new THREE.TorusGeometry(w(W.upperArmR * 1.13), w(0.0022), 4, 20);
      rg.rotateX(Math.PI / 2);
      rg.translate(0, cy + w(0.0065), 0);
      detail.push(rg);
      // the screw: a small proud pad on the OUTER face, upper third of the tube
      const sc = new THREE.CylinderGeometry(w(0.0060), w(0.0060), w(0.0034), 12);
      sc.rotateZ(Math.PI / 2);
      sc.translate(s * w(W.upperArmR * 1.03), -uaRun * 0.30, 0);
      detail.push(sc);
      const dm = mesh(mergeGeos(detail), mats.chrome, `upperArmDetail${side}`);
      dm.position.copy(ua.position);
      dm.quaternion.copy(ua.quaternion);
      shoulder.add(dm);
    }

    // ---- ELBOW: the knee's joint, minus the kneecap (round 28, item 2) -----------
    // The `ringStack` this replaces was four stacked discs on a Z-rotated cylinder axis.
    // It was never a hinge: a stack of rings has no barrel, so the arm read as a corrugated
    // sleeve rather than as a joint, and at 0.042 H it was WIDER than the hub the sheet
    // draws. See the `ELBOW` note above for the construction and the measurements.
    const elbow = new THREE.Group();
    elbow.name = `j.elbow${side}`;
    // The tube's far end, by construction: `ua.position + uaDir * uaLen`. uaDir.y * uaLen is
    // exactly -uaRun, so this still lands at -upperArmLen in Y.
    elbow.position.set(uaDir.x * uaLen, -uaTop + uaDir.y * uaLen, armFwd + uaDir.z * uaLen);
    shoulder.add(elbow);
    joints[`elbow${side}`] = elbow;

    const ehA = w(ELBOW.hw), ehB = w(ELBOW.hd), ehR = w(ELBOW.r);
    const eFaceR = ehB - ehR;                  // the flat side face the ring disc sits in
    const eRecess = w(ELBOW.recess);
    // Radial/segment counts below are lower than the knee's on purpose. Every triangle here
    // is paid for four times (four render passes on this sheet, measured), and at 0.036 H
    // the hub is a 48 px circle on the turnaround's own framing, so 20 radial segments is
    // a 7.5 px chord — under the point where faceting is visible. At the knee's 26 the two
    // elbows alone cost 25k of the sheet's 900k triangle budget for nothing.
    const ehub = mesh(kneeHub(ehA, ehB, ehR, eRecess, eFaceR * 0.92, 20), mats.chrome, `elbowHub${side}`);
    elbow.add(ehub);
    parts[`elbowHub${side}`] = ehub;

    // THE KNURL (round 30, item 1). Same call as the knee's, with the same rib count — this
    // is the half of the joint family the elbow was missing, and it is why `critic-robot-29`
    // read the elbow as "a smooth dark bulbous hub" against the knee's banded ring. The band
    // cuts INWARD from the barrel, so its outermost surface is still the barrel's own
    // 0.0382 H and it cannot breach `mountSleeve()`'s 0.040 H cuff in `gadgets/index.js`.
    const eknurl = mesh(knurlBand(ehA, ehB, ehR, { ribs: 16 }), mats.chrome, `elbowKnurl${side}`);
    elbow.add(eknurl);

    // Ring disc + dark bore + outline ring on BOTH side faces, from the same `boltFace` the
    // knee and the hip use. `mats.gap` is new to this joint, so unlike the knee's it is not
    // free — it costs one merged mesh per elbow (see collapseDrawCalls).
    for (const d of [-1, 1]) {
      boltFace((m) => elbow.add(m), mesh, mats, w, {
        faceR: eFaceR, x: d * (ehA - eRecess * 0.55), dir: d,
        tag: `Elbow${side}${d < 0 ? 'i' : 'o'}`,
        thick: w(0.010), ringT: w(0.0030), discSeg: 20, boreSeg: 10,
      });
    }

    // forearm: tucked into the hub at the top (0.030 H against the hub's 0.036 H barrel, so
    // it leaves the joint rather than swelling out of it) and tapering to the wrist.
    const fa = mesh(segment(w(0.0300), w(W.forearmR * 0.72), foreArmLen, 20), mats.chrome, `forearm${side}`);
    elbow.add(fa);
    parts[`forearm${side}`] = fa;

    // squared wrist block with a dark inset panel on the outer face
    const wrist = new THREE.Group();
    wrist.name = `j.wrist${side}`;
    wrist.position.y = -foreArmLen;
    elbow.add(wrist);
    joints[`wrist${side}`] = wrist;

    const wb = mesh(roundedBoxGeometry(w(0.044), w(0.036), w(0.040), w(0.008), 2), mats.chrome, `wristBlock${side}`);
    wb.position.y = w(0.010);
    wrist.add(wb);
    const inset = mesh(roundedBoxGeometry(w(0.006), w(0.019), w(0.023), w(0.002), 1), mats.gap, `wristInset${side}`);
    inset.position.set(s * w(0.022), w(0.010), 0);
    wrist.add(inset);

    // hand: palm + four 3-segment fingers + opposed thumb
    const hand = buildHand(w, mats, s, mesh);
    hand.position.y = -w(0.008);
    wrist.add(hand);
    parts[`hand${side}`] = hand;
  }

  // ======================= LEGS =======================
  const thighLen = h(L.hip - L.knee);
  const shinLen = h(L.knee - L.ankle);

  for (const side of ['L', 'R']) {
    const s = side === 'L' ? -1 : 1;

    const socket = new THREE.Group();
    socket.name = `socket.hip${side}`;
    socket.position.set(s * w(W.pelvisW * 0.50), 0, 0);
    hips.add(socket);
    sockets[`hip${side}`] = socket;

    const hip = new THREE.Group();
    hip.name = `j.hip${side}`;
    hip.userData.limb = { id: `leg${side}`, socket: `hip${side}`, mass: 1.6, kind: 'leg' };
    socket.add(hip);
    joints[`hip${side}`] = hip;
    limbs[`leg${side}`] = hip;

    // ---- THIGH: the upper window onto the one leg profile ----------------------
    // No chrome inner tube any more. It existed to fill the gaps a stack of separate
    // rounded boxes left between itself; a closed lofted shell has none, so the tube was
    // pure cost — and dropping it takes the hip joint down to a single material, which is
    // where the draw calls for the knee's extra parts come from.
    // ROUND 32 — a second transverse groove at 0.452. The sheet's thigh (crop `120,430,190,320`
    // at 4x) carries TWO breaks, not one: a band just above the knee and a second across the
    // upper third where the thigh plate meets the hip housing. `legRings` cuts these into the
    // loft itself, so a second one costs four rings and no draw call.
    //
    // NOT ATTEMPTED, deliberately: the LONGITUDINAL seam down the thigh's outer face. It needs
    // a notch in `section()`'s flat face run, which means either enough extra samples to take
    // SEC_N from 32 to 46 (+44% on every leg ring) or a per-ring groove depth threaded through
    // `loftShell` so the notch can close inside the knee and hip tucks — the terminal ring is
    // the hub's equator by construction, and a notched ring would open a slot at the seal. At
    // this framing the sheet's own thigh seam is about one pixel wide. It is the right next
    // increment if a close-up view of a leg is ever built; it is not worth 44% of the leg here.
    const thighRings = legRings(w, L.hip, L.knee, { hip: L.hip, knee: L.knee });
    const thighGeo = loftShell(thighRings);
    const thigh = mesh(thighGeo, mats.shell, `thigh${side}`);
    hip.add(thigh);
    parts[`thigh${side}`] = thigh;

    /*
     * THE THIGH'S MARKS — round 33, and the round-32 compromise is REVERSED because it was
     * measured and it does not work.
     *
     * Round 32 could not afford a `mats.gap` mesh in `j.hip` (see the draw-call note below),
     * so it cut the two transverse breaks into the LOFT as shell-coloured channels and
     * deepened `GROOVE_D` 0.0024 -> 0.0034 to compensate. Cropped at 5x (`295,470,180,220` on
     * the 1080p capture) those channels ARE there and they render as two faint tonal steps
     * about four luminance values below the shell around them. Against the sheet's thigh
     * (crop `1085,390,150,180`), which carries a hard black hairline with a bright roll of
     * shell beside it, they are not a weaker version of the same mark — they are a different
     * mark. `critic-robot-33` read the result as bare smooth cylinders, correctly.
     *
     * The diagnosis is the one this file already writes down twice, at the knee outlines and
     * at the boot's toe seam: WHITE-ON-WHITE SHADING CANNOT DRAW AN EDGE AT THIS SCALE. A
     * groove's own walls are shell, its floor is shell, and the only thing that can darken it
     * is screen-space AO, whose radius is an order of magnitude larger than a 0.0034 H
     * channel. Deepening it further is not available either: relief/width is already 0.47
     * against the 0.5 ceiling the hip-disc spiral diagnosis set for stepped relief here.
     *
     * AND THE MARK THAT MATTERS WAS NEVER ONE OF THE TWO. Round 32 declined the LONGITUDINAL
     * seam as "the right next increment... not worth 44% of the leg", on the assumption it
     * needed a notch cut into `section()`. It does not: `limbStripe` already lays a ribbon on
     * a lofted limb's crowned face and the SHIN has used it since round 32. On the sheet's
     * back figure that longitudinal parting line is the boldest mark on the whole leg — it
     * runs nearly hip to knee on both broad faces — and the transverse break above the knee
     * is second. This build has both, plus the fainter upper break, all as `mats.gap`.
     *
     * THE DRAW CALL IS PAID FOR, not dodged. `collapseDrawCalls` emits one mesh per material
     * per joint, `j.hip` carried `mats.shell` alone, so this is one new merged mesh per hip —
     * eight across this sheet's four figures. `bootSeam` gives exactly eight back by moving
     * from `mats.gap` to `mats.sole`, which is already in `j.ankle` (see `buildBoot`). Net
     * zero, measured both ways with `harness/evidence/_calls_tmp.mjs`.
     *
     * `castShadow = false` for the same reason the shin's seams carry it: these ribbons stand
     * about a millimetre off the surface they lie on and cannot cast a shadow anything can
     * see. `collapseDrawCalls` honours the flag on a merged mesh only when every child it
     * swallowed was flagged off, and every child here is.
     */
    {
      const ty = (f) => w(f - L.hip);      // thigh window is built with origin = L.hip
      const det = [
        // The two transverse breaks the loft used to carry as grooves, at the same heights.
        limbScribe(thighRings, ty(0.301), w(0.0026), w(0.0012)),
        limbScribe(thighRings, ty(0.452), w(0.0020), w(0.0010)),
      ];
      // THE LONGITUDINAL SEAM, on BOTH broad faces — it is a moulding parting line, and a
      // parting line runs round the part. `xf` is a fraction of the flat face's own half
      // extent, so it stays on the flat and never climbs into the corner roll; 0.56 puts it
      // where the sheet draws it, a little outboard of centre on the visible face.
      for (const zdir of [1, -1]) {
        // Heavier than the shin's (0.0017 / 0.0011): the thigh is the widest panel on the leg
        // and the sheet's line on it is correspondingly the boldest mark the leg carries.
        det.push(limbStripe(thighRings, {
          xf: s * 0.56, zdir, halfW: w(0.0027), out: w(0.0017),
          yTop: ty(0.516), yBot: ty(0.298), N: 12,
        }));
      }
      const dm = mesh(mergeGeos(det), mats.gap, `thighSeams${side}`);
      dm.castShadow = false;
      hip.add(dm);
    }

    // The leg's half of the hip joint: the HIP section revolved about the bend axis, so it
    // is invariant under hip flexion and the thigh's terminal ring IS its equator. Same
    // construction and the same guarantee as `kneeHub` at the knee. `mats.shell` merges it
    // into the thigh's own mesh, so it costs nothing.
    const hhA = w(HIP.hw), hhB = w(HIP.hd), hhR = w(HIP.r);
    const hhub = mesh(kneeHub(hhA, hhB, hhR, w(HIP.recess), w(HIP.socketR), 20),
      mats.shell, `hipHub${side}`);
    hhub.position.z = w(HIP.cz);
    hip.add(hhub);
    parts[`hipHub${side}`] = hhub;

    // ---- KNEE -------------------------------------------------------------------
    const knee = new THREE.Group();
    knee.name = `j.knee${side}`;
    knee.position.y = -thighLen;
    hip.add(knee);
    joints[`knee${side}`] = knee;

    // The hub is the KNEE section (see `KNEE`) revolved about the bend axis. The thigh
    // above and the shin below both tuck into that same section, so all three meet with a
    // vertical tangent plane and no step, and the hub — a body of revolution about the axis
    // it turns on — is identical at every knee angle.
    const hubA = w(KNEE.hw), hubB = w(KNEE.hd), hubR = w(KNEE.r), hubZ = w(KNEE.cz);
    const faceR = hubB - hubR;                 // flat side face
    const recess = w(0.005);
    const hub = mesh(kneeHub(hubA, hubB, hubR, recess, faceR * 0.92), mats.shell, `kneeHub${side}`);
    hub.position.z = hubZ;
    knee.add(hub);
    parts[`kneeHub${side}`] = hub;

    // The ringed disc, on the SIDE faces where both references actually draw it, recessed
    // into the hub rather than perched on the front. `critic-robot-23` called the old one
    // "a generic equator-mounted hinge collar, front-facing only"; driveDisc already builds
    // facing +X, so round 20's `rotation.y = PI/2` was the thing turning it wrong.
    //
    // OUTLINES ARE THE HALF OF THIS THE GEOMETRY CANNOT DO. Side by side with the sheet,
    // the loft closed the silhouette problem and still read soft, because every edge on
    // the sheet's knee is a crisp DARK line — a black ring round the disc, a scribed
    // outline round the kneecap — and white-on-white shading has no way to produce one.
    // Round 22 deleted the old seam meshes because a `mats.gap` mesh cost 8 draw calls per
    // robot, but that arithmetic was for the HIP joint, which had no gap material. The knee
    // joint already carries `mats.gap` for the bores, so collapseDrawCalls merges anything
    // added here into a mesh that already exists: these outlines are free.
    for (const d of [-1, 1]) {
      boltFace((m) => knee.add(m), mesh, mats, w, {
        faceR, x: d * (hubA - recess * 0.55), dir: d, z: hubZ,
        tag: `Knee${side}${d < 0 ? 'i' : 'o'}`,
        // ringT 0.0024 -> 0.0042: the sheet's knee outline is a heavy black band, not a
        // hairline, and it is the single strongest mark on the whole leg.
        thick: w(0.012), ringT: w(0.0042), discSeg: 22, boreSeg: 14,
      });
    }

    // THE KNURL. The identical call the elbow makes — that is item 1's whole point, and it
    // is only legal because `KNEE.hd` now leaves the barrel 0.0013 H proud of the limb, so
    // there is an exposed cylindrical face for it to be cut into. `mats.shell` merges it
    // into the hub's own mesh, so it costs no draw call.
    const kknurl = mesh(knurlBand(hubA, hubB, hubR, { ribs: 16 }), mats.shell, `kneeKnurl${side}`);
    kknurl.position.z = hubZ;
    knee.add(kknurl);

    // KNEECAP — the FRONT OF THE LIMB at the knee, not a badge on the hinge.
    //
    // This is the piece the rebuild turns on. The hinge sits toward the BACK of the leg on
    // both references — the sheet's knee circle is flush with the rear silhouette and inset
    // ~0.02 H from the front — which leaves a wedge in front of it that something has to
    // fill, or the limb's front face steps back at the knee. On the sheet that wedge IS the
    // kneecap: a rounded-square plate whose outer face carries the thigh's front line
    // straight down into the shin's, with only a scribed outline to say it is a separate
    // part. Round 20's `blob()` did the opposite — a scaled sphere 0.029 H proud of a hub
    // that was already proud of the limb, i.e. a bump on a bump.
    //
    // It lives in the KNEE group, so it travels with the shin and the front of the joint
    // opens as a clean V under flexion, which is what a hinge does.
    /**
     * ROUND 30 — THE PLATE IS THE LIMB'S FULL WIDTH, and the outline is a line scribed ON it
     * rather than a larger plate BEHIND it. Both changes come from one finding.
     *
     * `critic-robot-29` read this joint as "a lighter banded ring with a rectangular vent
     * slot". The slot is real and it is not a part: it is the wedge between a narrow plate's
     * edge and the hub barrel rolling away underneath it, which screen-space AO fills solid.
     * Three attempts to close it by tuning were rendered and rejected — widening the plate to
     * 0.068 H (slot narrower, still a bar), standing it 0.003 H proud (worse: the plate's own
     * flanks became two heavier black bars), and ovalising it so the bar would become a
     * crescent (still a bar over most of its length). None could work, because the defect is
     * topological: a plate narrower than the limb ALWAYS leaves a receding surface beside it,
     * and AO always finds it.
     *
     * The sheet has no such surface. Its knee front is continuous — thigh line into kneecap
     * into shin line — with a scribed oval saying where one part ends and the next begins. So
     * the cap is now a piece of the LIMB'S OWN SURFACE: full width at the knee (0.086 H, from
     * `LEGP`), rolled at the flanks by a radius near the limb's own, face on the limb's front
     * line. Its edges land on the hub's end faces instead of hanging over the barrel, so
     * there is nothing left to shade. The bolt discs stay clear of it by construction — the
     * disc spans z -0.040..+0.020 H and the cap's flank only reaches down to z 0.030 H.
     *
     * `capT` 0.026 -> 0.040 buys nothing visible and is not a thicker part: it is the radius
     * clamp. `roundedBoxGeometry` caps the corner radius at half the SMALLEST dimension, so a
     * 0.026 H plate can never roll wider than 0.013 H however large a radius is passed. The
     * extra thickness is buried inside the hub.
     */
    const capT = w(0.040);
    const capBend = w(0.075);          // gentle: the sheet's kneecap is a plate, not a cup
    const capFront = w(0.0470);        // the limb's own front line at the knee (`LEGP`)
    const capW = 0.086, capH = 0.082, capR = 0.0195;
    const capPlate = (wide, tall, thick, front, rad) => {
      const g = roundedBoxGeometry(w(wide), w(tall), thick, w(rad), 4);
      bendAroundX(g, capBend, capFront * CROWN, w(wide * 0.5 - rad));
      g.translate(0, 0, front - thick * 0.5 - capBend);
      return g;
    };
    const kcap = mesh(capPlate(capW, capH, capT, capFront, capR), mats.shell, `kneeCap${side}`);
    knee.add(kcap);
    parts[`kneeCap${side}`] = kcap;

    /**
     * THE SCRIBED OVAL. A torus laid flat on the cap's front face and pushed through the
     * SAME `bendAroundX` with the SAME arguments the cap used, so it conforms by construction
     * rather than being fitted by eye — half the tube sits inside the shell and what shows is
     * a groove line. It replaces a second full `capPlate` (972 triangles) with 180, which is
     * where part of item 1's knurl budget came from, and it costs no draw call because the
     * knee already carries `mats.gap` for the bores.
     */
    const scribe = new THREE.TorusGeometry(w(0.0335), w(0.0026), 3, 30);
    scribe.scale(1, 1.14, 1);
    scribe.translate(0, 0, capT * 0.5);
    bendAroundX(scribe, capBend, capFront * CROWN, w(capW * 0.5 - capR));
    scribe.translate(0, 0, capFront - capT * 0.5 - capBend);
    knee.add(mesh(scribe, mats.gap, `kneeCapEdge${side}`));

    // ---- SHIN: the lower window onto the same profile ---------------------------
    const shinRings = legRings(w, L.knee, L.ankle,
      { origin: L.knee, knee: L.knee, grooves: [0.228, 0.108] });
    const shinGeo = loftShell(shinRings);
    const shinShell = mesh(shinGeo, mats.shell, `shin${side}`);
    knee.add(shinShell);
    parts[`shin${side}`] = shinShell;

    /*
     * THE SHIN'S MARKS — round 32, item 1, and these are FREE: `j.knee` already carries
     * `mats.gap` for the two disc bores, the two outline rings and the kneecap scribe, so
     * everything here folds into a merged mesh that exists either way.
     *
     * The three VENT SLOTS are the one detail on the sheet's leg that is unmistakably a
     * machined feature rather than a moulding line — clearest on the back figure (crop
     * `1080,230,215,510`), low on the outer calf, three short horizontal strokes stacked with
     * about their own height between them. They are modelled as thin slabs sunk into the back
     * face rather than as stripes, because a slot has a length and a hairline does not.
     */
    {
      const det = [
        limbScribe(shinRings, w(0.228 - L.knee), w(0.0026), w(0.0012)),
        limbStripe(shinRings, {
          xf: s * 0.58, zdir: 1, halfW: w(0.0017), out: w(0.0011),
          yTop: w(0.222 - L.knee), yBot: w(0.118 - L.knee),
        }),
      ];
      for (let k = 0; k < 3; k++) {
        const y = w(0.126 - L.knee) - w(0.0125) * k;
        const sec = ringAt(shinRings, y);
        const ax = Math.max(1e-6, sec.hw - sec.r), cr = sec.hd * CROWN;
        const cx = s * ax * 0.40;
        const g = roundedBoxGeometry(w(0.020), w(0.0038), w(0.0060), w(0.0014), 1);
        g.translate(cx, y, sec.cz - (sec.hd + crownAt(cx, ax, cr)) - w(0.0006));
        det.push(g);
      }
      const dm = mesh(mergeGeos(det), mats.gap, `shinSeams${side}`);
      dm.castShadow = false;
      knee.add(dm);
    }

    // ankle: a genuine chrome COLLAR band bridging shin and boot, plus a short ring stack
    // — the sheet draws a clear, deliberate transition here, not a sliver. Sized close to
    // the shin's own radius (not flared wider) so it reads as a collar, not a new patch of
    // exposed chrome.
    const ankle = new THREE.Group();
    ankle.name = `j.ankle${side}`;
    ankle.position.y = -shinLen;
    knee.add(ankle);
    joints[`ankle${side}`] = ankle;

    // Derived from the leg profile, not from a free W number: the collar must sit just
    // inside the shell it bridges, and the shell's size at the ankle now comes from LEGP.
    const ap = legProfile(L.ankle);
    const collarR = w(Math.min(ap.w, ap.d) * 0.5) * 0.90;
    /*
     * ROUND 33 — THE COLLAR WAS INSIDE THE BOOT. Found by building `mat.robot`'s boot specimen
     * out of `buildBoot()` for the first time and then looking at it at 4x.
     *
     * Arithmetic, all in the ANKLE's frame: `buildBoot` puts the sole's underside at -L.ankle
     * = -0.055 and stacks up soleH 0.016 then bootH 0.064, so the upper's top edge is at
     * +0.025 H. The collar sat at -0.002 with a half-height of 0.012, i.e. -0.014..+0.010 —
     * entirely below the boot's rim — and its radius was 0.027 against the upper's 0.044 half
     * width, so it was inside laterally as well. It has been drawing nothing at all.
     *
     * That is the sheet's most legible boot feature missing: crop `508,665,110,72` at 8x and
     * the mouth of the boot is a dark collar with the ankle bearing set into it, and the shin
     * enters through it. The `ringStack` under it was buried by the same arithmetic.
     *
     * Both now sit ON the rim rather than under it, and the collar is widened to 1.16x so it
     * stands proud of the shin (0.030 H half-width at the ankle) instead of vanishing inside
     * that instead. Nothing else moves: the boot, the sole and the standing height are all
     * derived from `L.ankle` and are untouched.
     */
    const ankleCollar = mesh(
      new THREE.CylinderGeometry(collarR * 1.16, collarR * 1.22, w(0.024), 20), mats.chrome, `ankleCollar${side}`);
    ankleCollar.position.y = w(0.026);
    ankle.add(ankleCollar);
    const astack = mesh(ringStack(collarR * 0.94, 3, w(0.0026), w(0.0068)), mats.chrome, `ankleStack${side}`);
    astack.position.y = w(0.008);
    ankle.add(astack);

    // BOOT: big, soft, rounded. White upper, upswept toe, distinct dark sole edge.
    // `L.ankle` is passed so the sole can GROUND itself; see the note on buildBoot.
    const boot = buildBoot(w, W, mats, mesh, side, L.ankle);
    ankle.add(boot);
    parts[`boot${side}`] = boot;
  }

  // ---------------------------------------------------------------------------
  const collapse = collapseDrawCalls(root);

  const rest = {};
  for (const [k, j] of Object.entries(joints)) rest[k] = j.rotation.clone();

  /**
   * Joints that setPose must leave alone.
   *
   * A detached limb keeps its joints — that is the whole point of the rigid-parts design,
   * the subtree survives being reparented. But `joints` still holds references to them, so
   * a naive setPose kept writing pose rotations into a severed arm every frame and snapped
   * it upright while it lay on the floor. Detachment then read as a rendering glitch
   * rather than as the game's core mechanic.
   *
   * Membership is "can I still walk up to root", computed once per detach/attach rather
   * than per frame, so posing stays a flat loop.
   */
  let poseSkip = new Set();
  function rebuildPoseSkip() {
    poseSkip = new Set();
    for (const [k, j] of Object.entries(joints)) {
      let o = j, reachesRoot = false;
      while (o) { if (o === root) { reachesRoot = true; break; } o = o.parent; }
      if (!reachesRoot) poseSkip.add(k);
    }
  }

  function setPose(pose = {}) {
    for (const [k, j] of Object.entries(joints)) {
      if (poseSkip.has(k)) continue;      // limb is off the body — not ours to pose
      const p = pose[k];
      if (!p) { j.rotation.copy(rest[k]); continue; }
      if (Array.isArray(p)) j.rotation.set(p[0], p[1], p[2]);
      else if (p.isEuler) j.rotation.copy(p);
      else if (typeof p === 'object') j.rotation.set(p.x ?? 0, p.y ?? 0, p.z ?? 0);
    }
  }

  /** Detach a limb: returns the subtree, now parentless, world transform preserved. */
  function detach(limbId) {
    const g = limbs[limbId];
    if (!g || !g.parent) return null;
    g.updateWorldMatrix(true, false);
    const m = g.matrixWorld.clone();
    g.removeFromParent();
    m.decompose(g.position, g.quaternion, g.scale);
    g.userData.limb.detached = true;
    rebuildPoseSkip();
    return g;
  }

  /** Reattach a limb subtree (or a gadget limb) into a socket. */
  function attach(socketName, group) {
    const sock = sockets[socketName];
    if (!sock) return false;
    group.position.set(0, 0, 0);
    group.quaternion.identity();
    group.scale.set(1, 1, 1);
    if (group.userData.limb) group.userData.limb.detached = false;
    sock.add(group);
    // A limb coming back on the body resumes being posed; a gadget limb has no joints in
    // this rig's map, so it is unaffected either way.
    rebuildPoseSkip();
    return true;
  }

  /** True if this limb is currently on the body. */
  function isAttached(limbId) {
    const g = limbs[limbId];
    return !!(g && g.parent && !g.userData.limb?.detached);
  }

  return {
    root, joints, parts, limbs, sockets, height: H, materials: mats,
    setPose, detach, attach, isAttached,
    /**
     * Recompute "which joints are off the body" against the CURRENT `joints` map.
     *
     * ⚠️ ADDED TO FIX A REAL BUG: a refitted limb never animated again. `attach()` rebuilds
     * the skip set itself, but `LimbRig.attach()` calls `unit.attach()` FIRST and only then
     * calls `rebindLimbJoints()` to repoint `joints.shoulderR` at the limb that just came
     * back. So the set was computed while those names still pointed at the old, parentless
     * groups — they stayed on the skip list, `setPose` skipped them forever, and the limb was
     * welded in its rest pose while every original limb swung normally. Reported from a real
     * playthrough as "newly attached limbs don't move like the original limbs".
     *
     * Anything that repoints `joints` must call this afterwards. Additive to the exported
     * shape, so the twelve modules importing `buildUnit4H` are unaffected.
     */
    refreshPoseSkip: rebuildPoseSkip,
    landmarks: L, widths: W, drawCalls: collapse,
    dispose() {
      for (const g of disposables) g.dispose();
      for (const m of Object.values(mats)) m.dispose?.();
    },
  };
}

/**
 * THE BOOT, ON ITS OWN — added round 33 for `mat.robot`, and the reason is a measured failure
 * rather than convenience.
 *
 * `mat.robot`'s boot specimen was three hand-written rounded boxes APPROXIMATING this part, and
 * `critic-robot-33` called it "a total failure — two stacked white capsules with a black bar".
 * Both things were true at once: `buildBoot` really does build a sole, a collar and a toe cap
 * (round 31 proved that after a critic said otherwise), and the swatch really did show none of
 * them — because the swatch was never the part. A material view that re-models its own specimen
 * can be wrong about the model in a way no amount of shader work will reach, and it cannot be
 * used to settle an argument about the thing it is supposed to be showing.
 *
 * So the specimen IS the part now, at whatever `W` and `L` currently say, scaled up for a
 * close look. Nothing about `buildUnit4H`'s exported shape changes.
 */
export function buildUnit4HBoot(opts = {}) {
  const H = opts.height ?? 1.7;
  const mats = opts.materials ?? unit4hMaterials(opts.materialOpts);
  const w = (f) => f * H;
  const geos = [];
  const mesh = (geo, mat, name) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true; m.receiveShadow = true;
    m.name = name;
    geos.push(geo);
    return m;
  };
  const boot = buildBoot(w, W, mats, mesh, opts.side ?? 'R', L.ankle);
  boot.userData.dispose = () => { for (const g of geos) g.dispose(); };
  // The ankle collar is built one level up, in the ankle joint, so a boot lifted out of the
  // rig on its own would be missing the transition the sheet draws most clearly. Same
  // construction and the same numbers as the leg's — derived from `LEGP`, not picked.
  const ap = legProfile(L.ankle);
  const collarR = w(Math.min(ap.w, ap.d) * 0.5) * 0.90;
  const collar = mesh(new THREE.CylinderGeometry(collarR * 1.16, collarR * 1.22, w(0.024), 20),
    mats.chrome, 'ankleCollar');
  collar.position.y = w(0.026);
  boot.add(collar);
  // A stub of the shin entering the collar. Without it the specimen shows a boot mouth with
  // nothing in it, which is a hole rather than a joint — and the transition is what this
  // specimen exists to show.
  const shinStub = mesh(new THREE.CylinderGeometry(w(ap.w * 0.48), w(ap.w * 0.50), w(0.070), 20),
    mats.shell, 'shinStub');
  shinStub.position.y = w(0.058);
  boot.add(shinStub);
  return boot;
}

// ---------------------------------------------------------------------------

function buildHand(w, mats, s, mesh) {
  const hand = new THREE.Group();
  hand.name = 'hand';

  const palm = mesh(roundedBoxGeometry(w(0.042), w(0.042), w(0.021), w(0.008), 2), mats.chrome, 'palm');
  palm.position.y = -w(0.021);
  hand.add(palm);

  // four fingers, each visibly 3-segmented, with dark knuckle gaps. Sized and spaced up
  // slightly from the first pass, which read as a mitt with a corrugated strip standing
  // in for knuckles rather than four distinguishable fingers.
  const fLen = [w(0.018), w(0.014), w(0.011)];
  for (let f = 0; f < 4; f++) {
    const col = new THREE.Group();
    col.position.set((f - 1.5) * w(0.0122), -w(0.042), w(0.002));
    col.rotation.x = 0.10 + f * 0.02;
    hand.add(col);
    let y = 0;
    for (let k = 0; k < 3; k++) {
      // SEGMENTS 2 -> 1, and this is a budget decision made with numbers rather than a
      // quality cut made by eye. `roundedBoxGeometry` tessellates as (2s+1)^2 quads per face,
      // so a phalanx cost 300 triangles at s=2 and costs 108 at s=1; twelve of them per hand,
      // two hands, four figures on this sheet and four render passes made the difference
      // 73,728 triangles of the 900,000 budget — 8% of the whole sheet, spent on parts that
      // subtend about three pixels each. That saving is what pays for item 1's knurl at four
      // joints. Measured before and after with a per-mesh census; the hands are unchanged in
      // silhouette at this framing. If a close-up view of a hand is ever built, raise it
      // there rather than here.
      const seg = mesh(roundedBoxGeometry(w(0.0098), fLen[k], w(0.0100), w(0.0036), 1), mats.chrome, `finger${f}_${k}`);
      seg.position.y = y - fLen[k] * 0.5;
      col.add(seg);
      y -= fLen[k];
      if (k < 2) {
        const gap = mesh(new THREE.CylinderGeometry(w(0.0049), w(0.0049), w(0.0104), 10), mats.gap, `knuckle${f}_${k}`);
        gap.rotation.z = Math.PI / 2;
        gap.position.y = y;
        col.add(gap);
        y -= w(0.0018);
      }
    }
  }

  // opposed thumb
  const th = new THREE.Group();
  th.position.set(s * w(0.021), -w(0.032), w(0.006));
  th.rotation.z = s * 0.85;
  th.rotation.x = -0.30;
  hand.add(th);
  let ty = 0;
  for (let k = 0; k < 2; k++) {
    const len = k === 0 ? w(0.018) : w(0.014);
    const seg = mesh(roundedBoxGeometry(w(0.0114), len, w(0.0114), w(0.0044), 2), mats.chrome, `thumb${k}`);
    seg.position.y = ty - len * 0.5;
    th.add(seg);
    ty -= len + w(0.0018);
  }

  return hand;
}

/**
 * THE BOOT — round 31, defect 4a: "a featureless blob; the art's boot has a sole, a collar
 * and a toe cap".
 *
 * IT HAD ALL THREE ALREADY. This is the project's dominant failure mode showing up again:
 * code that looks right, reviews fine and renders nothing. The parts were being built and
 * were invisible, for two separate reasons, and neither is a modelling question:
 *
 *  1. THE SOLE WAS UNDER THE FLOOR. `soleTopY` was a hardcoded -0.045 H in the ANKLE's
 *     frame, and the ankle sits at `L.ankle` = 0.055 H, so a 0.024 H sole ran from world
 *     0.010 H down to world -0.014 H. More than half of it was inside the cyc. The one
 *     thing on the boot that is not white was the thing buried in the floor — which is
 *     exactly the "boots have no sole" complaint, and no amount of restyling a sole that is
 *     underground can answer it. It is now DERIVED: the caller passes the ankle height and
 *     the sole's underside lands on world zero by construction, so it cannot drift again
 *     if `L.ankle` or `W.bootH` is retuned. That is the same fix the `W.bootH` trap needed.
 *  2. THE SOLE WAS NARROWER THAN THE BOOT. 0.060 H against a 0.088 H upper, so even the
 *     part above ground was tucked under an overhang and invisible from the front and from
 *     three quarters. The sheet's sole OVERHANGS the upper all the way round; that dark rim
 *     is most of what makes its boot read as a boot.
 *
 * Sizes measured off `Dev Art/1785277053522.png`, profile figure, normalised on H = 614 px:
 * the whole boot is 0.080 H from sole to collar and the dark sole band is 0.016 H of it.
 */
function buildBoot(w, W, mats, mesh, side, ankleY) {
  const boot = new THREE.Group();
  boot.name = `boot${side}`;

  const len = w(W.bootLen);
  const hgt = w(W.bootH);      // was hardcoded w(0.055) — W.bootH was never read
  const soleH = w(W.soleH);

  // white upper: a rounded mass, longer forward, toe slightly upswept. The ankle collar
  // now lives one level up (in the ankle joint, bridging shin and boot) so this starts
  // right where that collar ends instead of duplicating a second, smaller collar here.
  // Corner radius 0.024 -> 0.017: at 0.024 on an 0.088 x 0.064 x 0.132 box the fillets meet
  // in the middle of every face and the result is a bar of soap. The sheet's boot is soft
  // but it has a heel, an instep and a toe box, and none of those survive a radius that is
  // more than a third of the section.
  const upperGeo = roundedBoxGeometry(w(W.bootW), hgt, len, w(0.017), 4);   // was hardcoded w(0.056)
  {
    const p = upperGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i);
      const t = Math.max(0, z / (len * 0.5));
      p.setY(i, p.getY(i) + t * t * w(0.012));
    }
    upperGeo.computeVertexNormals();
  }
  // GROUNDED BY DERIVATION. The boot lives in the ANKLE's frame, and the ankle is at
  // `ankleY` above the floor, so the sole's underside is at -ankleY and everything else
  // stacks up from there. The previous version pinned this to a literal -0.045 H that had
  // been correct for one particular `W.bootH` and was silently wrong for every later one.
  const soleBottomY = -w(ankleY);
  const soleTopY = soleBottomY + soleH;
  const upperY = soleTopY + hgt * 0.5;
  const upper = mesh(upperGeo, mats.shell, 'bootUpper');
  upper.position.set(0, upperY, len * 0.20);
  boot.add(upper);

  // toe cap: a proud panel over the front third of the upper — reads as a separate moulded
  // part via its own highlight, not via colour (two-tone material is round 17 work, not
  // this pass). Follows the same upsweep curve as the upper underneath it, offset up by a
  // hair so it sits proud rather than z-fighting the surface it caps.
  // TOE CAP — 0.052 -> 0.90 * bootW. At 0.052 against an 0.088 H upper the cap was a strip
  // down the middle of the boot's back, narrower than the thing it caps; the sheet's toe
  // box is the full width of the boot with a scribed line where it meets the instep.
  const toeLen = len * 0.36;
  const toeGeo = roundedBoxGeometry(w(W.bootW * 0.90), hgt * 0.74, toeLen, w(0.014), 3);
  {
    const p = toeGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const t = Math.min(1, Math.max(0, (p.getZ(i) + toeLen * 0.5) / toeLen));
      p.setY(i, p.getY(i) + t * t * w(0.014));
    }
    toeGeo.computeVertexNormals();
  }
  const toeCap = mesh(toeGeo, mats.shell, `bootToe${side}`);
  toeCap.position.set(0, upperY + w(0.006), len * 0.52);
  boot.add(toeCap);

  // THE TOE SEAM. On a white-on-white sheet a moulding line between two parts of the same
  // material shades too softly to draw itself — the same reason every joint on this model
  // carries a dark outline. The sheet's boot has exactly this line, arcing over the
  // instep where the toe box meets the upper, and it is the clearest single cue that the
  // boot is a boot rather than a lump.
  /*
   * ROUND 33 — `mats.gap` -> `mats.sole`, and this is a DRAW-CALL trade, not a look change
   * that happened to be free.
   *
   * `mats.gap` was the ONLY use of that material in `j.ankle`, so it cost one merged mesh per
   * ankle — eight across the turnaround's four figures. `mats.sole` is already here for the
   * sole itself, so the seam merges into a mesh that exists either way and the eight come
   * back. That is exactly what pays for the thigh's seams (see the note at the thigh).
   *
   * The two darks are 0.165/0.180/0.192 against 0.130/0.140/0.150 — the sole is the DARKER of
   * the pair, so a seam drawn in it cannot read weaker than one drawn in gap on albedo. What
   * differs is env response: `UNIT4H_ENV` forces gap to 0.10 and left sole on the scene's
   * value, which for the turnaround is 1.40. `UNIT4H_ENV` now carries `sole: 0.22` so both
   * darks sit in the same range — and that is independently right for the sole itself, whose
   * dark band the sheet draws as the strongest value on the whole boot.
   */
  /*
   * ============================================================================
   * ROUND 34 — THIS IS THE "RAZOR-STRAIGHT BLACK DIAGONAL BAR", AND IT WAS THE OUTLINE
   * SHAPE, NOT THE MATERIAL, THE COLOUR OR THE PLACEMENT.
   * ============================================================================
   *
   * `critic-robot-34` on `mat.robot`: "an unclaimed hard-edged black diagonal bar cuts straight
   * from the ankle collar through the toe box into the sole — razor-straight, uniform width, no
   * cord/lace taper — present in neither reference... the single most visible thing on the
   * specimen at any zoom". Confirmed at 4x on the round-33 capture, and the code says exactly
   * why, in three numbers:
   *
   *   - the plate was `bootW * 1.05` x `hgt * 1.22`. 1.22 of the upper's height means it stood
   *     0.11 * hgt PROUD AT THE TOP (into the collar) and 0.11 * hgt BELOW THE BOTTOM (through
   *     the sole) — literally "from the ankle collar into the sole", by construction;
   *   - its corner radius was `w(0.0018)` against the upper's `w(0.017)`, i.e. a SHARP-cornered
   *     rectangle laid across a boot whose section is a rounded rect. `roundedBoxGeometry` could
   *     not have given it the right radius even if asked — it clamps radius to half the smallest
   *     dimension, and the plate is only 0.0050 H thick, so any radius over 0.0025 H is thrown
   *     away. That clamp is why a "welt" built as a thin roundedBox can never hug anything;
   *   - and it leaned the WRONG WAY. Measured on the sheet's profile boot (crop `505,680,150,60`
   *     at 8x): the toe stroke runs from the sole at 0.64 of the boot's length up to 0.75 at its
   *     top, i.e. the top leans FORWARD by ~0.32 rad. `rotation.x = -0.16` leans it back.
   *
   * So the mark is rebuilt as what the sheet actually draws: a WELT RING — the upper's own
   * section offset outward by a uniform 0.0032 H — extruded thin, so its rim stands the same
   * amount proud all the way round and dies into the sole at the bottom instead of cutting
   * through it. `ExtrudeGeometry` from a rounded-rect `Shape` is used precisely because the
   * corner radius is then independent of the thickness.
   *
   * IT ALSO RIDES THE TOE UPSWEEP. The ring's own vertices are put through the SAME
   * `t*t*w(0.012)` displacement the upper's are, in the upper's own frame, so a leaned ring
   * cannot dip under the surface where the toe lifts — which is what would otherwise turn a
   * continuous line into a dashed one at the apex. Same principle as `limbStripe` solving
   * `crownAt`: the mark is derived from the surface it lies on, not fitted against a render.
   */
  /*
   * ROUND 35 — REBUILT AS A RIBBON ON THE SURFACE. See `bootSectionArc` above for why the
   * round-34 plate could not be retuned into this and had to change geometry class.
   *
   * This is `limbScribe`'s idiom, which is the one this file already trusts for a transverse
   * mark: a band of the part's OWN section standing a little proud of it, with NO CAPS. The
   * differences from `limbScribe` are the two things a boot needs and a limb does not —
   *
   *   - it is an ARC, not a closed loop, so the mark has ENDS. Both die into the sole's top
   *     edge, which is what stops it crossing the sole; and because the arc rolls over the
   *     instep, the near-flank run FORESHORTENS AWAY at the top corner instead of running on
   *     into the ankle collar. Those are the sheet's two defining properties of this line and
   *     they now come from the path rather than from a fitted length;
   *   - it LEANS, `z = seamZ + LEAN * y`, so the mark is not planar. On the flat flank that is
   *     still a straight run — correctly, the sheet's lower half is straight too — but it
   *     curves through the corner roll, which is where the sheet's curves.
   *
   * NUMBERS, all measured off the profile boot (crop `565,655,55,70` at 16x, boot 49 px tall
   * on a 100 px footprint) rather than chosen:
   *
   *   LEAN 0.33     seam leaves the sole at 0.633 of boot length and reaches 0.745 at 0.75 H
   *                 of its height: dz/dy = 0.112 L / 0.70 H_boot = 0.33, i.e. 18.3 deg forward
   *   seamZ 0.40    midpoint 0.69 of the boot's length from the heel (round 34 read 0.70 and
   *                 placed the plate's CENTRE at 0.67; this is the same feature, re-derived
   *                 against the sole-to-sole span rather than the upper's)
   *   halfT 0.0017  the sheet's stroke is 1.5-2 px on a 49 px boot = 0.030-0.041 of the boot's
   *                 height; 0.0034 H total on an 0.080 H boot is 0.043. The old plate read
   *                 0.057 of boot height AND was solid black edge to edge.
   *
   * STAND-OFF 0.0032 -> 0.0016. The sheet draws a SCRIBED line, not a raised welt, and half the
   * old proudness is still comfortably clear of the shell: `roundedBoxGeometry` inscribes its
   * corner roll (chords lie INSIDE the true arc, so a ribbon on the true outline is above the
   * shell on every corner by construction), and the only place the shell can sit above its own
   * true surface is the toe upsweep, where linear interpolation of the convex `t*t` term lifts
   * it by at most 1.5e-4 H over a 9-division span. 0.0016 clears that by 10x.
   */
  const seamOut = w(0.0016);                   // stand-off — a scribe, not a welt
  const seamHalfT = w(0.0017);                 // half the stroke's width, along the boot's length
  const SEAM_LEAN = 0.33;                      // dz/dy — 18.3 deg forward, off the sheet
  const seamZ = len * 0.40;                    // 0.69 of the boot's length from the heel
  /*
   * ============================================================================
   * ROUND 38 — THE ROUND-35 RIBBON WAS A GIRDING RING, NOT A LOCAL HAIRLINE, AND
   * THAT IS WHY THE BAR SURVIVED THREE MORE ROUNDS UNCHANGED.
   * ============================================================================
   *
   * `critic-weather-1`, round 37, re-confirmed the razor-straight full-width bar. Picked by
   * `_tmp_geoprobe.mjs --pick --view mat.robot --grid ...`: the mark IS `bootSeamR` /
   * `unit4h.sole` — a real, correctly-wound, non-filled ribbon, not a round-34 relapse. So the
   * round-35 diagnosis (a `Shape` returning solid fill) does NOT apply here; this is a
   * different bug in the geometry the round-35 rewrite actually shipped.
   *
   * `bootSectionArc` was built to trace almost the ENTIRE cross-section perimeter (bottom
   * corner, all the way up one flank, across the top, down the other flank, bottom corner —
   * only the underside is cut). Feeding that whole loop into the ribbon builder below made a
   * mark that runs the boot's FULL height on its visible flank: the ownership grid put
   * `bootSeamR` immediately against `ankleCollar` at the top and bleeding into `bootSole` at
   * the bottom (rows 12-23 of a 11-27 boot span — essentially edge to edge), while the sheet's
   * own mark (crop `490,590,150,150` at 5x on the profile boot) leaves a plain gap below the
   * bearing (its top dash sits at H ~0.74 of the upper's height, not H ~0.93) AND a plain gap
   * above the sole (its last dash sits at H ~0.10, not touching down at H ~0.27 the way the old
   * code's shortfall still nearly did). The doc block above describes a mark that "dies out"
   * before either end; the code it was attached to never implemented that — the corner cut
   * only trims the underside, so both flanks always ran their FULL 2*ay.
   *
   * Fix: keep only the two flank runs (`nx = +-1, ny = 0` — cases 1 and 5 of the section walk,
   * which is exactly the two sides `limbScribe`-style ribbons are drawn on) and clip each to
   * the measured band, H in [0.10, 0.75] of the upper's own height — i.e. `y` in
   * `[-0.80*AY, 0.50*AY]`. The two clipped runs are built as SEPARATE strips (never bridged
   * across the excluded corner/top/corner), so there is no new chord cutting across the boot
   * the way naively re-filtering one flat array would have produced. Whichever flank the
   * camera actually sees on either boot (`R` or `L`) is decided by back-face culling exactly as
   * before — this only shortens what was already there, it does not choose a side.
   */
  const AY = (() => {
    const R = w(0.017), HX = w(W.bootW) * 0.5, HY = hgt * 0.5;
    return Math.max(1e-6, HY - Math.min(R, Math.min(HX, HY) * 0.98));
  })();
  const seamYLo = -0.80 * AY, seamYHi = 0.50 * AY;    // measured off the sheet, see note above
  const seamGeo = (() => {
    const arc = bootSectionArc(w(W.bootW) * 0.5, hgt * 0.5, w(0.017), 30, Math.PI / 3);
    // Split into the flank-only runs, clipped to the band, never bridging the gaps this opens.
    const runs = [];
    let cur = null;
    for (const q of arc) {
      const onFlank = q.ny === 0 && Math.abs(q.nx) === 1;
      const within = q.y >= seamYLo && q.y <= seamYHi;
      if (onFlank && within) { if (!cur) { cur = []; runs.push(cur); } cur.push(q); }
      else cur = null;
    }
    const pos = [], uv = [], idx = [];
    for (const run of runs) {
      const base = pos.length / 3;
      for (let i = 0; i < run.length; i++) {
        const q = run[i];
        const x = q.x + q.nx * seamOut, y = q.y + q.ny * seamOut;
        const zc = (seamZ - len * 0.20) + SEAM_LEAN * y;   // the UPPER's frame, where the upsweep lives
        for (const sg of [-1, 1]) {
          const z = zc + sg * seamHalfT;
          // the SAME upsweep the upper's own vertices get, so the mark cannot dip under the
          // surface where the toe lifts — `limbStripe` solving `crownAt`, one part over.
          const t = Math.max(0, z / (len * 0.5));
          pos.push(x, y + t * t * w(0.012), z);
          uv.push(i / Math.max(1, run.length - 1), 0.5 + sg * 0.5);
        }
      }
      // WINDING. Rows walk counter-clockwise in XY (up the +x flank, then leftward over the top)
      // and `a`/`b` are a row's -z/+z edge, so with tangent T and the band running along +z the
      // outward normal is T x zhat — which `a, c, b` delivers. Getting this backwards is what hid
      // BOTH longitudinal limb seams for every round before 34; it is checked here by pick, not
      // by eye (`_tmp_geoprobe.mjs --pick` returns `bootSeamR` on the mark's own pixels).
      for (let i = 0; i < run.length - 1; i++) {
        const a = base + i * 2, b = a + 1, c = a + 2, d = a + 3;
        idx.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  })();
  const seam = mesh(seamGeo, mats.sole, `bootSeam${side}`);
  seam.position.set(0, upperY, len * 0.20);
  seam.castShadow = false;
  boot.add(seam);

  // The dark rubber sole. It OVERHANGS the upper on all four sides — 1.03 x bootW against
  // the old 0.68 x, which is what was hiding it under its own boot — so the dark rim reads
  // from the front and the three-quarter as well as from the profile.
  const upperBottomY = upperY - hgt * 0.5;
  /*
   * ROUND 33 — THE SOLE GETS AN ARCH, and this is the difference between a sole and a slab.
   *
   * `critic-robot-33` called `mat.robot`'s boot "two stacked white capsules with a black bar",
   * and when the specimen was rebuilt from THIS function (rather than from the approximation the
   * view used to carry) the criticism survived intact: the part really does read as a pillow on
   * a black rectangle at close range. That is a `unit4h.js` finding, not a view finding.
   *
   * What the sheet's profile boot has that this did not (crop `508,665,110,72` at 8x): the dark
   * welt is THICK AT THE HEEL, ARCHES CLEAR OF THE GROUND under the instep, and comes back down
   * at the ball of the foot. That arch is the single strongest cue that the dark band is a sole
   * — a rectangle of the same colour in the same place reads as a plinth, which is exactly what
   * it was doing in the swatch.
   *
   * So the underside is lifted by a cosine bump over z -0.30..+0.20 of the length, leaving a
   * heel pad and a forefoot pad in contact. Only the BOTTOM face moves, so the sole's visible
   * top edge and its overhang are unchanged and nothing about the standing height moves — the
   * heel still lands on world zero by derivation. Toe curl 0.008 -> 0.016 H at the same time,
   * because the sheet's toe lifts clear of the ground and ours sat flat on it.
   */
  const soleGeo = roundedBoxGeometry(w(W.bootW * 1.03), soleH, len * 1.05, w(0.005), 2);
  {
    const p = soleGeo.attributes.position;
    const half = len * 0.5;
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i);
      let y = p.getY(i);
      if (y < 0) {
        const u = (z / half + 0.30) / 0.50;           // 0 at the heel pad, 1 at the forefoot pad
        if (u > 0 && u < 1) y += Math.sin(u * Math.PI) * soleH * 0.66;
      }
      const t = Math.max(0, z / half);
      p.setY(i, y + t * t * w(0.016));
    }
    soleGeo.computeVertexNormals();
  }
  const sole = mesh(soleGeo, mats.sole, 'bootSole');
  sole.position.set(0, upperBottomY - soleH * 0.5, len * 0.20);
  boot.add(sole);

  /*
   * ============================================================================
   * ROUND 34 — THE ANKLE BEARING. The sheet's boot HAS one even though its hip does not,
   * and that pairing is the whole point: this file spent four rounds putting a bearing where
   * the art has a recess while leaving the one place the art actually draws one bare.
   * ============================================================================
   *
   * MEASURED on the profile figure, crop `505,655,100,80` at 9x, on a 618 px figure — and it is
   * the largest single feature on the boot:
   *
   *   outline ring     35 src px  = 0.0566 H diameter   (the knee's is 0.068 H)
   *   bright disc face 30 src px  = 0.0486 H
   *   centre           0.61 of the boot's OWN height above the ground, so its top touches the
   *                    boot's rim and its bottom reaches 0.23 of the height — it fills the flank
   *
   * Both of those are DERIVED here rather than typed: the height is `0.61 * (soleH + hgt)` off
   * the sole's underside, so it cannot drift if `W.bootH` or `W.soleH` is retuned, which is the
   * trap this function already carries two warnings about. Longitudinally it sits at 0.21 of the
   * boot's length from the heel — over the ankle, which is what it is the bearing FOR.
   *
   * It lives in `buildBoot`, not beside the collar in `j.ankle`, so `buildUnit4HBoot` (the
   * `mat.robot` specimen) and the character get the same part from the same code. The collar is
   * still built by both callers separately; that duplication is pre-existing and this does not
   * add to it.
   *
   * DRAW CALLS: ZERO. `boltFace` wants `mats.gap` for the bore and the outline ring, and gap is
   * not otherwise in `j.ankle` — round 33 moved `bootSeam` off it precisely to get those eight
   * merged meshes back. So it is handed a `mats` whose `gap` slot is `mats.sole`, which is
   * already here for the sole and the seam. The two darks are 0.130/0.140/0.150 (sole) against
   * 0.165/0.180/0.192 (gap) with env 0.22 against 0.10 — the same range, by design.
   *
   * PROTRUSION IS BUDGETED, and the first cut of this round overspent it. At a 0.040 H housing
   * plane the dark cylinder's outer face sat 0.002 H OUTSIDE the boot's 0.044 H flank all the way
   * round, so the front figures grew a dark tab on the outside of each boot — a bearing seen
   * edge-on where the sheet's front boots are clean white. The housing now sits at 0.0355 H, i.e.
   * INSIDE the flank at the disc's own mid-height and proud only near its top and bottom where
   * the boot's shoulder has already rolled away, which is the only place it is needed. The
   * outermost part of the assembly is the outline ring at 0.0465 H: 0.0025 H proud per side
   * against 0.0049 H before. The sheet's bearing does stand proud — a bearing flush with its
   * housing has no dark line under its rim — but this is the one height where the silhouette is
   * already a solid blob and every millimetre is paid for in IoU.
   *
   * Z ALSO CAME FORWARD, `-0.08 len` -> `-0.03 len`. At 0.21 of the boot's length from the heel,
   * which is where the sheet puts it, a 0.030 H housing overhangs OUR heel, because this boot is
   * 0.139 H long against the sheet's measured 0.163 H and the bearing is the same size in both.
   * When two references disagree after normalisation, the one that keeps the part inside its own
   * silhouette wins.
   */
  {
    const darkMats = { ...mats, gap: mats.sole };
    const bearY = soleBottomY + (soleH + hgt) * 0.61;
    const bearZ = -len * 0.03;
    const faceR = w(0.0280);
    for (const d of [-1, 1]) {
      // The housing: a short dark cylinder the bearing is set into, so the ring has material
      // behind it where the boot's own shoulder has already rolled away. Without it the top of
      // the disc stands in front of nothing and reads as a sticker.
      // TESSELLATION IS BUDGETED TOO. Four bearings per robot at the knee's 22/14 segments took
      // this sheet from 880k triangles to 893k against a 900k ceiling — a 98.9% load on a piece
      // that is already the project's tightest. 16/10/14 costs ~3.4k back and is invisible at a
      // part that subtends 35 px on the turnaround; the knee and elbow keep their own counts,
      // because those are the joints a close-up view would ever be built for.
      const hs = mesh(new THREE.CylinderGeometry(faceR * 1.08, faceR * 1.08, w(0.012), 14),
        mats.sole, `ankleBearHousing${side}${d < 0 ? 'i' : 'o'}`);
      hs.rotation.z = Math.PI / 2;
      hs.position.set(d * w(0.0355), bearY, bearZ);
      boot.add(hs);
      boltFace((m) => boot.add(m), mesh, darkMats, w, {
        faceR, x: d * w(0.0415), y: bearY, dir: d, z: bearZ,
        tag: `Ankle${side}${d < 0 ? 'i' : 'o'}`,
        thick: w(0.008), ringT: w(0.0026), discSeg: 16, boreSeg: 10, rings: 3,
      });
    }
  }

  return boot;
}
