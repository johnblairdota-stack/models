import * as THREE from 'three';
import { studio, labels, setEnvResponse } from './_studio.js';
import { buildUnit4H } from '../characters/unit4h.js';
import { unit4hMaterials, applyUnit4HEnv, brandReady } from '../materials/surfaces/robot.js';

/**
 * Reproduces the framing of Dev Art 1785277053522 so the two images can be compared
 * directly: four robots in a row — front, left profile, 3/4 front, back — on a near-white
 * cyc under the sheet's soft studio key. Same order, same spacing.
 */
/**
 * KNEE FLEX PROBE — `--extra "knee=a,b,c,d"`, one angle in radians per figure, left to
 * right. Absent, this is a no-op and the sheet renders byte-identically.
 *
 * It exists because the leg is a lofted shell bridged by a hub at the knee, and the way
 * that construction fails is invisible in every static view: it renders perfectly at zero
 * flex and only tears, or eats itself, once the joint is actually driven. `char.locomotion`
 * does bend these knees, but it freezes each station at one phase and frames the whole
 * body, so it cannot settle a question about the joint at a CHOSEN angle.
 *
 *   node harness/shoot.mjs --view char.turnaround --extra "knee=0,0.7,1.4,2.0"
 *
 * 2.0 rad is not arbitrary: it is the peak `src/game/locomotion.js` asks for in the run
 * cycle (0.16 + 1.75 + 0.62), i.e. the worst case the game ever produces.
 */
export default async function view(args = {}) {
  const H = 1.7;
  // The empty-string guard is not defensive padding. `Number('')` is 0, not NaN, so
  // ''.split(',').map(Number).filter(Number.isFinite) returns [0] — a probe that is ALWAYS
  // on, at zero flex, silently turning all four figures to profile on every ordinary
  // capture. It cost a full regression pass before the review PNG gave it away.
  const kneeArg = args.params?.get('knee') ?? '';
  const kneeProbe = kneeArg ? kneeArg.split(',').map(Number).filter((v) => Number.isFinite(v)) : [];
  /*
   * CHANGE 3 (round 32) — A LONGER LENS, and it is a MEASUREMENT fix as much as a look fix.
   *
   * `measure.mjs` reports the front figure's arm daylight as 0.060 H on one side and 0.028 H on
   * the other, and flags it: "asymmetry 0.016 H mean L/R <-- CHECK, pose is symmetric". The
   * model IS symmetric and so is the pose. The asymmetry is the CAMERA: at fov 30 from
   * z = 3.05 H, figure 1 sits 1.53 world units off the axis, i.e. 16.4 degrees, so one arm is
   * seen across the torso and the other away from it. Two rounds have now been asked to find a
   * geometric cause for that and there is not one.
   *
   * The sheet's four figures show very little perspective divergence — each one's own head is
   * nearly centred over its own body — so a long lens is also closer to the art. z 3.05 -> 6.20
   * with fov 30 -> 15 holds the subject's on-screen size to within 0.1% (2*6.20*tan(7.5) =
   * 1.632 H against 2*3.05*tan(15) = 1.634 H) and halves the off-axis angle to 8.2 degrees.
   */
  const engine = await studio({
    cameraPos: [0, H * 0.52, H * 6.20],
    target: [0, H * 0.50, 0],
    fov: 15,
    bg: 0xf2f2f2,
    envIntensity: 1.4,
    shadowExtent: H * 1.35,
    // CHANGE 1 (round 22) — opt into the high-contrast studio env. See _studio.js:
    // buildStudioEnv gains dark flag panels and a darker room shell/floor bounce only when
    // contrast > 0, and every other caller still gets the byte-identical default env.
    contrast: 1.0,
    // CHANGE 2 (round 26) — opt into the high-contrast KEY:FILL ratio. See _studio.js.
    lightContrast: 1.0,
  });

  // one material set shared by all four — four bakes would be four times the VRAM
  const mats = unit4hMaterials();

  // CHANGE 2 (round 26), the half that does the work. `lightContrast` on its own measured
  // as NO visible change, and the ablation says why: at envIntensity 1.4 the white shells
  // were taking 62% of their light from the IBL and only 38% from the three lights, so the
  // rig could not create range whatever it was set to. But dropping the SCENE env fixed the
  // shells and took `mats.chrome` — metal, no diffuse term, no other light source — from a
  // median luminance of 48 to 6. One knob could not serve both.
  //
  // `setEnvResponse` is what makes there be more than one knob; see the note on it in
  // _studio.js for why `material.envMapIntensity` has never worked here. The diffuse-bound
  // families give up the ambient they cannot use; the metal keeps all of it.
  //
  //   effective env multiplier      before   after
  //   shell (metalness 0)            1.40     0.44
  //   gap   (only ever in a recess)  1.40     0.30
  //   chrome / mint / face           1.40     1.40   (untouched)
  /*
   * ROUND 32, SECOND PASS — all three of this file's environment knobs in one call.
   *
   * `applyUnit4HEnv` is the material file's own table (`UNIT4H_ENV`), made live. It replaces two
   * hand-written `setEnvResponse` calls here and adds the THIRD, which had never been made:
   * `mintCap()` has argued since round 26 for a quiet 0.55 because a near-white studio
   * environment at full strength lays a broad white lobe over the cap and desaturates it — and
   * that number has been inert the whole time. Measured on the round-32 capture the cap read
   * rgb(180,193,189) against the sheet's rgb(97,147,141): the signature colour was gone.
   */
  applyUnit4HEnv(setEnvResponse, engine, mats);

  /*
   * CHANGE 4 (round 32) — the chrome finally gets its own knob, and the table above was WRONG.
   *
   * That table claims `shell` runs at 0.44 and `gap` at 0.30 "after". Neither is true: the only
   * call is the one above, and it sets gap to 0.10. Shell, chrome, mint and face have all been
   * running at the scene's 1.40. The comment described an intent, not the code, and it has sat
   * here through two rounds of people reasoning from it.
   *
   * MEASURED, on the round-31 capture against the sheet, in 0-255 luminance:
   *
   *                       sheet          this render
   *   white shell, chest   181            131
   *   chrome, upper arm    119 (p95 235)   ~90 (p95 ~150)
   *
   * A metal has no diffuse term — it is only what it reflects — and this view deliberately opts
   * into a high-contrast environment with dark flag panels, which is exactly what a broad
   * chrome tube finds. So the structural metal renders as charcoal and the character reads
   * white-and-charcoal where the sheet reads white-and-silver. That single tonal error is
   * plausibly a bigger blind-test tell than any missing seam.
   *
   * 2.10 is `chromeSatin`'s own long-argued 2.4 minus a little, and it is the value that file
   * has been asking for since round 22 without ever reaching the shader. The shells stay on the
   * scene knob: they have a diffuse floor, so raising the env for them flattens the range that
   * `lightContrast` exists to create.
   *
   * ...and 2.10 was NOT enough on its own, because the defect it was aimed at is a spread rather
   * than a level: the same material measured 120 on the arm tubes and 216 on the abdomen against
   * the sheet's 190 and 131. The chrome's own base ROUGHNESS carries that half of the fix — see
   * the note in `CHROME_SURFACE`. The value here is unchanged and now lives in `UNIT4H_ENV`.
   */

  // yaw per view, matching the sheet left to right
  const poses = [
    { yaw: 0, label: 'FRONT' },
    { yaw: Math.PI * 0.5, label: 'LEFT' },
    { yaw: -Math.PI * 0.28, label: '3/4' },
    { yaw: Math.PI, label: 'BACK' },
  ];

  const spacing = H * 0.60;
  const units = [];
  poses.forEach((p, i) => {
    const u = buildUnit4H({ height: H, materials: mats });
    u.root.position.x = (i - (poses.length - 1) / 2) * spacing;
    // With the probe on, every figure turns to the left profile — a bent knee is judged in
    // silhouette and a front view of one tells you nothing.
    u.root.rotation.y = kneeProbe.length ? Math.PI * 0.5 : p.yaw;
    // The sheet's rest stance: arms hanging straight, hands clearly visible beside the
    // thighs, feet a little apart.
    //
    // SIGN CONVENTION: a limb hangs down -Y, so a POSITIVE Z rotation swings it toward
    // -X, i.e. across the body. The previous values were positive on the left and
    // negative on the right, which folded both forearms over the abdomen and buried the
    // hands. Away from the body is negative on the left, positive on the right.
    /*
     * ROUND 32 — the shoulder abduction comes down with `armOut`, and the hips are LEFT ALONE.
     *
     * The round's brief carried "stance -36.8% at 0.285 H — the sheet's feet are planted wide"
     * as its item 3. That number does not survive measuring the reference to its own soles:
     * the shared `--band` was truncating the sheet's feet, so the row printed as 0.285 H was
     * sampling the sheet at 0.322 H — up where its HANDS still are, which is why the sheet
     * looked 0.43 H wide there. Measured correctly this rig is **+12.6% at 0.285 H**, i.e. the
     * stance is already slightly WIDER than the art's, and widening it further would have made
     * the piece worse. The hip values below are unchanged for that reason.
     *
     * The shoulders do come in: 0.085 -> 0.052 rad, worth ~0.014 H per side at the hand, on top
     * of `armOut` 0.195 -> 0.085 in `unit4h.js`. Together that is the ~0.040 H per side the
     * corrected table asks for at 0.415 H.
     */
    const pose = {
      shoulderL: [0, 0, -0.052],
      shoulderR: [0, 0, 0.052],
      elbowL: [0.05, 0, -0.02],
      elbowR: [0.05, 0, 0.02],
      hipL: [0, 0, -0.030],
      hipR: [0, 0, 0.030],
    };
    if (kneeProbe.length) {
      const k = kneeProbe[Math.min(i, kneeProbe.length - 1)];
      pose.kneeL = [k, 0, 0];
      pose.kneeR = [k, 0, 0];
      pose.hipL = [k * 0.45, 0, -0.030];
      pose.hipR = [k * 0.45, 0, 0.030];
    }
    u.setPose(pose);
    engine.scene.add(u.root);
    units.push(u);
  });

  labels([
    { text: 'CHARACTER TURNAROUND SHEET — UNIT-4H', x: 50, y: 6, font: '600 17px/1.2 ui-sans-serif, system-ui, sans-serif' },
    ...poses.map((p, i) => ({
      text: p.label, x: 50 + (i - 1.5) * 16.2, y: 92,
      font: '600 11px/1.2 ui-monospace, Menlo, monospace', color: '#6a7178',
    })),
  ]);

  engine.finalizeScene();
  // ROUND 35 — MUST come before `markReady`. `brandDecal`'s texture loads asynchronously and,
  // until it decodes, the chest mark used to paint as a SOLID NAVY BAR (an undecoded map
  // samples black, and the shader keys black to full ink). Caught byte-comparing two captures
  // of one build: they differed by 0.266% of pixels, and the difference was the wordmark drawn
  // correctly in one and as a filled rectangle in the other. The shader now discards until
  // ready, so the worst case is a MISSING mark; awaiting the decode here removes that too.
  await brandReady();
  engine.markReady();
  engine.start();
  engine.units = units;
  return engine;
}
