import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { studio, labels } from './_studio.js';
import { buildUnit4H } from '../characters/unit4h.js';
import { unit4hMaterials, brandReady, shellWhite } from '../materials/surfaces/robot.js';
import { fitCamera } from './hunter-stage.js';
import { attachIdentity, attachChestWordmark } from '../characters/mesh-identity.js';
import { attachBoneLocal } from '../characters/mesh-avatar.js';
import {
  unlitEnabled, unlitSeamOcc, unlitEmissive, setUnlitEmissive,
  patchSceneForUnlit, bypassPostChain, assertPostBypassed, normaliseChromeTint,
} from '../materials/unlit.js';

/**
 * THE SKINNED PLAYER — a properly rigged generated character, animated.
 *
 * This replaces the rigid-part experiment entirely, and the reason is John's: borrowing
 * `unit4h`'s skeleton distorted a mesh with different proportions, and rigid parts CANNOT avoid
 * clipping at a rotating joint because nothing blends across the seam. Meshy's own auto-rig
 * fits a skeleton to THIS mesh and ships real skin weights (JOINTS_0 / WEIGHTS_0), so both
 * problems stop existing rather than being worked around.
 *
 * What arrives is 10,378 triangles — a SIXTH of the 60k hero budget — on a 24-joint humanoid
 * skeleton, with no materials at all, which is exactly the input plan Step 6 wants: strip
 * nothing, just apply the shared palette.
 *
 * ⚠️ SCALE AND GROUNDING HAPPEN HERE, NOT IN THE CONDITIONER. `tools/condition_asset.py` JOINS
 * meshes before it does anything else, and joining destroys a skin binding. A skinned asset
 * therefore skips conditioning and is normalised at load: measure the bind-pose box, scale to
 * the contract's 1.7 m, and drop the feet onto y=0. Same rules, different place to apply them.
 */
// Key -> filename. Whole filenames, not fragments: Meshy names a set download and a single
// download differently, so a shared prefix is a trap the moment you add one clip at a time.
const CLIPS = {
  walking: 'Meshy_AI_Lumi_Bot_biped_Animation_Walking_withSkin.glb',
  running: 'Meshy_AI_Lumi_Bot_biped_Animation_Running_withSkin.glb',
  run3: 'Meshy_AI_Lumi_Bot_biped_Animation_Run_03_withSkin.glb',
  alert: 'Meshy_AI_Lumi_Bot_biped_Animation_Alert_withSkin.glb',
  attack: 'Meshy_AI_Lumi_Bot_biped_Animation_Attack_withSkin.glb',
  arise: 'Meshy_AI_Lumi_Bot_biped_Animation_Arise_withSkin.glb',
  dance: 'Meshy_AI_Lumi_Bot_biped_Animation_All_Night_Dance_withSkin.glb',
  groove: 'Meshy_AI_Lumi_Bot_biped_Animation_You_Groove_withSkin.glb',
  cheer: 'Meshy_AI_Animation_Stand_Cheer_and_Sit_Down_withSkin.glb',
  /*
   * THE RE-UNWRAPPED BODY, carrying all 15 clips in one file. `tools/unwrap_player.py` replaced
   * Meshy's 405-chart atlas with a world-axis cube projection so the shell's baked panel grid
   * reads as plating rather than as cracked glaze. `?clip=merged&anim=Heavy_Hammer_Swing` picks
   * one of the 15 by name. This is the PRE-normal-merge asset; `n30` is what ships.
   */
  merged: 'player_unwrapped.glb',
  // Same geometry, an interpolated-normal build from 2026-08-15 that PREDATES
  // `tools/smooth_normals.py` and is not reproducible by it — which is the only reason it is still
  // here. Carries 4,388 normal breaks, WORSE than `merged`'s 2,328 despite the name.
  smooth: 'player_smooth.glb',
  /*
   * 🚨 THE SHIPPED BODY — `PLAYER_BODY` in `mesh-avatar.js`. `player_unwrapped.glb` with 1,318
   * spurious normal breaks merged at 30 deg (`tools/smooth_normals.py`); only NORMAL differs,
   * byte-diff proven. ⚠️ ON THIS VIEW THE A/B IS `?clip=`, NEVER `?player=` — this view picks its
   * file from THIS TABLE and has never read `?player=`, so a sweep written `clip=n30&player=X`
   * renders `n30` however many arms you pass. Four variants once came back byte-identical.
   */
  n30: 'player_norm30.glb',
  /*
   * The parked 41,512-tri modified-Butterfly subdivision (`tools/subdivide_player.py`), kept for
   * the day the source model is fixed. UNSHIPPED because a sawtooth black band opens across both
   * hips — a real concavity that 10,378 triangles were too crude to resolve, so no subdivision
   * scheme avoids it. Twelve mechanisms proposed, twelve eliminated by control: that record is
   * `docs/handoff/player-pipeline.md` section 7. Read it before proposing a thirteenth.
   */
  bf65: 'player_bf65.glb',
  /*
   * 🚨 NOT SHIPPED, AND ITS CLIPS ARE INVALID. `PLAYER_BODY` in `mesh-avatar.js` is back to
   * `player_norm30.glb`. Meshy's "Friendly Robot": 15,864 tris, its own baked texture,
   * auto-rigged. The fifteen clips in this file were COPIED off the Lumi Bot on the strength of
   * a `tools/_rig_compare.py` verdict that has since been corrected — the bone NAMES and parents
   * match, the REST ORIENTATIONS do not (Hips 114.86 deg apart), so every clip's root rotation
   * lands on the wrong axis. `?clip=friendly&anim=<name>` still drives it, as the bad half of
   * the comparison; `?clip=fwalk` below is the good half.
   *
   * ⚠️ THIS VIEW DRESSES NOTHING. It renders the body as it comes off disk, so the chrome-panel
   * treatment and the chest wordmark — both applied in `mesh-avatar.js`, i.e. in the GAME — are
   * absent here. That is what makes it the right view for judging DEFORMATION: nothing is added
   * on top that could hide a collapsing shoulder or a hip that pinches.
   */
  friendly: 'friendly_merged.glb',
  /*
   * 🚨 THE TWO CLIPS THAT ARE ALREADY ON THE FRIENDLY ROBOT'S OWN RIG, and they are the control
   * pair for the whole regeneration.
   *
   * `friendly_merged.glb` carries the Lumi Bot's 15 clips COPIED across two rigs whose Hips rest
   * 114.86 deg apart, which is why the figure pitches off the plane and its feet leave the spot.
   * These two came down from Meshy applied to the Friendly Robot itself — one clip each, named
   * `Armature|walking_man|baselayer` and `Armature|running|baselayer` — so they are what a
   * REGENERATED clip looks like. Measuring `fwalk` against `friendly`+`Walking` with
   * `harness/evidence/_anim_check.mjs` is the cheapest possible test of the regeneration plan: same body,
   * same motion, one authored on this rig and one copied onto it.
   */
  fwalk: 'friendly_walking.glb',
  frun: 'friendly_running.glb',
  /*
   * 🚨 THE REGENERATED SET — 20 CLIPS BUILT ON THE FRIENDLY ROBOT'S OWN RIG (2026-08-19).
   *
   * Downloaded from Meshy with `Rigged Character` ON, `All Added`, `Single file` ON, which exports
   * every added motion in one GLB. `tools/_rig_compare.py` against `friendly_rigged.glb` reads
   * **0.00 deg worst rest direction, 0.0% worst bone length** — the same rig, not a lookalike.
   * Compare that with the 114.86 deg that made `friendly_merged.glb` invalid.
   *
   * ⚠️ MESHY CAPS ONE DOWNLOAD AT **20 MOTIONS** ("only the 20 most recently added actions can be
   * downloaded", and the button is simply DISABLED at 21 — it does not truncate and it does not
   * explain). The seated set is therefore a second pass: re-add those 18, remove these 20, take a
   * second file, and join the two with `tools/merge_clips.py` — whose rig guard now passes because
   * both halves are the same rig.
   */
  fnative: 'friendly_native20.glb',
  /* The two downloads joined: 38 clips, the whole set the game and the party loop need. */
  fall: 'friendly_all38.glb',
};

export default async function view(args = {}) {
  const H = 1.7;
  /*
   * `?bg=ff00ff` exists for MEASUREMENT, not for looking at. The kit's dimensions are checked by
   * masking the figure out of a capture and comparing it against the art the same way, and the
   * studio's default is a pale grey SWEEP — a gradient, not a flat colour — so a "not background"
   * test against one sampled corner pixel selects the entire frame. `harness/evidence/_kit7_artratio.mjs`
   * printed a figure 1920 px wide on its first run for exactly that reason. A flat chroma makes
   * the mask exact, and the art is masked by alpha, so both sides are then unambiguous.
   */
  const bgArg = args.params?.get?.('bg');

  /*
   * ===================== `?unlit=1` — THE FLAT-ALBEDO REFERENCE PASS =====================
   *
   * A Meshy texture bake copies whatever lighting is in its reference image straight into the
   * new model's albedo, so a lit reference produces a model with our key light and our contact
   * shadows painted on. `?unlit=1` renders the design with no lighting in it at all. The whole
   * mechanism, and why the obvious material-swap version throws the character away, is in
   * `src/materials/unlit.js`. OFF by default and an exact revert when off.
   *
   *   ?unlit=1      flat albedo, no key/fill/rim/env/specular/shadow/AO, no tonemap, no grade
   *   ?unlitocc=1   put the panel-seam grooves back as OCCLUSION (default: albedo only)
   *   ?unlitemis=1  put the emissive glow back (default 0 — emission is light)
   *   ?bind=1       do not start the mixer — the rig stays in its BIND pose
   *
   * ⚠️ Pair it with `?solo=1`, or the rig sits at x = 0.75 with the procedural robot beside it.
   */
  const unlit = unlitEnabled(args.params);

  /*
   * ===================== THE LIGHTING ROUND — `?meshlight=0` IS THE EXACT REVERT ==============
   *
   * THE FINDING. The chrome's value spread was 12 points short of the art (151.5 against 163.9)
   * and the deficit was ENTIRELY at the dark end: p05 64.2 against 57.4, while p95 landed at
   * 215.7 against 221.3. A metal is only what it reflects, so a chrome region with no dark
   * pixels is a statement about the ROOM. This view ran `_studio.js`'s DEFAULT environment — a
   * white box with nothing dark anywhere in it — while `char.turnaround` and `mat.robot` had
   * opted into the high-contrast one since round 22.
   *
   * WHY IT COULD NOT SIMPLY BE SWITCHED ON, and this is the whole of the round. `contrast` drove
   * two independent things through one number:
   *
   *   the near-black FLAG panels   what a metal reflects to get a dark core   — wanted
   *   the room shell 0.72 -> 0.20  the DC term every white plate is lit by    — not wanted
   *   and floor bounce 0.62 -> 0.24
   *
   * Measured, raw `?meshcontrast=1` on the pre-round build: chrome spread 151.5 -> 168.4, and the
   * white forearm 188.8 -> 152.9 paying for it. A diffuse plate cannot tell a dark flag from a
   * dark room. `char.turnaround` paid that back with `lightContrast`, which is one lerp that
   * takes the key UP and the fill DOWN together — right for that view, which wanted to CREATE
   * range in its shells, wrong here, where the whites are signed off and want their LEVEL back
   * at the range they already have.
   *
   * SO THE TWO AXES COME APART (see CHANGE 6 in `_studio.js`) and this view runs the flags at
   * full strength with the dome held near its old brightness, then trims what is left with a
   * per-lamp gain that `lightContrast` cannot express.
   *
   * Every number below is swept in the round's report and every one has its own URL knob, so a
   * later round can re-sweep one without rebuilding the argument:
   *
   *   ?meshlight=0    THE REVERT. Byte-identical to the pre-round build at all four angles —
   *                   contrast falls back to the old `?meshcontrast=` diagnostic (default 0),
   *                   no `envRoom`, no `envPanels`, no `lightGain`, envIntensity 1.0, and the
   *                   shell's chrome constants back to `robot.js`'s own. Verified by pxdiff.
   *   ?meshflag=      the flag axis, near-black flanks + camera flag      (default 1.00)
   *   ?meshroom=      the dome axis, room shell + floor bounce            (default 0.00)
   *   ?meshpanels=    'broad' the original softboxes | 'streak' CHANGE 3  (default broad)
   *   ?meshkey=       key gain                                           (default 1.95)
   *   ?meshfill=      fill gain                                          (default 1.00)
   *   ?meshrim=       rim gain                                           (default 1.00)
   *   ?meshenv=       scene envIntensity                                 (default 0.85)
   *   ?meshcontrast=  UNCHANGED, and it still means what it meant: the RAW high-contrast room
   *                   with no payback at all. It is the control this paragraph is quoted
   *                   against, and it only applies when `?meshlight=0`.
   *
   * WHAT EACH ONE IS FOR, since four of them move the same pixels and the sweep is the argument:
   *
   *   meshroom  IS ALMOST PURE COST AND IS THEREFORE 0. Taking the dome from 0 to 1 bought the
   *             chrome 5.1 points of spread and cost the white forearm 17 levels. The FLAGS do
   *             the work; darkening the whole room is what made `?meshcontrast=1` unshippable.
   *   meshkey   pays the whites back at 4.6:1 against the chest — the chest faces the camera and
   *             the key is 40 degrees off it, the forearm is not. The RIM is dead at this angle
   *             (a 1.5x gain moved the forearm 0.1 of a level) and is left at 1.
   *   meshenv   comes DOWN to 0.85 and the key comes up to compensate. The chest feels the IBL
   *             about twice as hard as it feels the key, so the pair is the only way found to
   *             land the forearm on 188.8 AND hold the chest on 230 at the same time; on the key
   *             alone the chest sat 2.9 levels high.
   */
  const ML = (args.params?.get?.('meshlight') ?? '1') !== '0';
  /*
   * ⚠️ `Number(null)` IS 0, NOT NaN, AND THAT IS NOT A STYLE POINT — IT SHIPPED A BLACK FRAME.
   *
   * `URLSearchParams.get()` returns `null` for an absent parameter, and `Number(null) === 0`
   * passes `Number.isFinite`. The first cut of this helper was
   *
   *     const v = Number(args.params?.get?.(name));  return Number.isFinite(v) ? v : fallback;
   *
   * so on an ordinary URL — no knobs at all, i.e. every capture anyone would ever take — EVERY
   * default resolved to 0 instead of its fallback: envIntensity 0, key 0, fill 0, rim 0. The
   * capture came back with the cyc, the background and the whole body black and only the
   * faceplate visible, because that is the one surface with its own emission. It did not throw
   * and `shoot.mjs` reported `1/1 captured`.
   *
   * It survived the entire sweep because a sweep passes every parameter explicitly, so the
   * absent-parameter path is the ONE path a parameter study never exercises. `char-turnaround.js`
   * has the same scar written above its `knee` probe ("Number('') is 0, not NaN").
   *
   * The empty string is rejected too: `?meshkey=` is a typo, not a request for zero gain.
   */
  const knob = (name, fallback) => {
    const raw = args.params?.get?.(name);
    if (raw === null || raw === undefined || raw === '') return fallback;
    const v = Number(raw);
    return Number.isFinite(v) ? v : fallback;
  };
  const rawContrast = Number(args.params?.get?.('meshcontrast') ?? 0) || 0;

  /*
   * THE GUARD FOR THE PARAGRAPH ABOVE, and it is placed here rather than inside `knob` on
   * purpose: `knob` cannot tell a resolved 0 from a requested one, but this view can say that a
   * frame with no environment AND no key is never anything a caller wanted. It is the cheapest
   * possible statement of "the lighting exists", and it is the assertion the black frame would
   * have tripped instead of photographing.
   *
   * ⚠️ IT IS NOT A RANGE CHECK. `?meshenv=0&meshkey=0` is still a legal thing to ask for one
   * lamp at a time (`?meshrim=0` is how the rim was proven dead at this angle) — only ALL of the
   * light sources being zero at once is rejected, because that is the signature of a resolution
   * failure rather than of an experiment.
   */
  const gEnv = ML ? knob('meshenv', 0.85) : 1.0;
  const gKey = ML ? knob('meshkey', 1.95) : 1.0;
  const gFill = ML ? knob('meshfill', 1.00) : 1.0;
  const gRim = ML ? knob('meshrim', 1.00) : 1.0;
  if (!(gEnv > 0 || gKey > 0 || gFill > 0 || gRim > 0)) {
    throw new Error('mesh-animated: env, key, fill and rim all resolved to 0 — there is no light '
      + `in this scene (env ${gEnv}, key ${gKey}, fill ${gFill}, rim ${gRim}). This is what an `
      + 'absent-parameter resolution failure looks like; see the Number(null) block above.');
  }

  const engine = await studio({
    cameraPos: [0, H * 0.55, H * 2.6],
    target: [0, H * 0.5, 0],
    fov: 32,
    /*
     * MID-GREY FOR THE UNLIT PASS, not the usual near-white, and not by taste. The shell
     * delivers near-white and the neck, gaps and soles deliver near-black, so a white ground
     * loses the silhouette into the plates and a dark one loses the feet and neck. 0x808080 is
     * the furthest point from both, and being neutral it puts no colour cast into anything that
     * later segments the figure out of the frame. It is also a free fidelity check: the
     * background must arrive at exactly 128,128,128 or the colour path is not what we think.
     */
    bg: bgArg ? parseInt(bgArg, 16) : (unlit ? 0x808080 : 0xeeeeee),
    envIntensity: gEnv,
    shadowExtent: H * 1.8,
    contrast: ML ? knob('meshflag', 1.00) : rawContrast,
    envRoom: ML ? knob('meshroom', 0.00) : undefined,
    envPanels: ML ? (args.params?.get?.('meshpanels') ?? 'broad') : undefined,
    lightGain: ML ? { key: gKey, fill: gFill, rim: gRim } : undefined,
  });

  const mats = unit4hMaterials({});
  /*
   * ⚠️ `?meshseams=0` HAS TO BE HONOURED HERE TOO, AND IT WAS NOT. The flag lives in
   * `mesh-avatar.js`, which is the GAME's path; this view assigned `mats.shell` unconditionally.
   * A critic asked for the seams-on/seams-off A/B on this view, got two MD5-identical captures,
   * and correctly reported the switch as dead. A knob that silently does nothing is worse than
   * no knob: it makes a comparison look like it was run.
   */
  /*
   * THE CHROME CONSTANTS ARE NOW THIS VIEW'S OWN — see the block above `chrTint` in `robot.js`.
   *
   * `chrCon` 4.0 is a contrast curve applied to the radiance a chrome fragment gathered, and the
   * file says in its own comment that it exists BECAUSE this view had no dark environment: "a
   * metal is only what it reflects, so a chrome region with no dark pixels is a statement about
   * the ROOM". It is a stand-in for the room, so once the room arrives it double-counts —
   * measured on the new environment, 4.0 lands the upper arm at median 28.9 / p05 10.1, a
   * near-black tube against the art's 120.3 / 57.4. It goes to 1.0, which is OFF.
   *
   * Turning it off gives back the two things it was costing:
   *   - HUE. The curve crushes pixels toward black and a pixel pushed toward black loses chroma,
   *     which is why `DLCWARM` had been raised 0.05 -> 0.065 to chase the art's +9 R-B. With no
   *     crush the warmth is over-delivered at +19, and 0.045 puts it back on +9 exactly.
   *   - LEVEL. `chrEnv` 2.0 -> 2.95, which is the level the curve was suppressing, paid on the
   *     metal alone so the white plates never see it.
   *
   * Every other caller of `shellWhite()` — `mesh-avatar.js` for `game.play`, all three hunter
   * stages — passes none of these and keeps 2.0 / 4.0 / 0.065 unchanged.
   */
  const shell = (args.params?.get?.('meshseams') ?? '0') !== '0'
    ? mats.shell
    : shellWhite(ML
      ? { seam: 0, size: 512, chrEnv: 2.95, chrCon: 1.0, chrWarm: 0.045 }
      : { seam: 0, size: 512 });
  const which = args.params?.get?.('clip') ?? 'walking';
  /*
   * ⚠️ AN UNKNOWN `?clip=` KEY THROWS, AND IT USED TO FALL BACK TO `CLIPS.walking` SILENTLY.
   *
   * The fallback was written when every key in the table was live. 17 diagnostic bodies were
   * deleted on 2026-08-17 once the hip-band thread closed (`docs/handoff/player-pipeline.md`
   * section 7), and a stale `?clip=sub65r` from a copy-pasted command then rendered the MESHY
   * WALKING GLB — a different body, a different rig, no error, and a capture that looks like a
   * result. That is the same class of bug as the four byte-identical `?player=` captures. A
   * missing key is a typo or a dead asset; both want to fail at the top, loudly.
   */
  const file = CLIPS[which];
  if (!file) {
    throw new Error(`mesh-animated: no such ?clip=${which}. Valid keys: `
      + `${Object.keys(CLIPS).join(', ')}. Diagnostic bodies from the hip-band thread were `
      + 'deleted 2026-08-17 — see docs/handoff/player-pipeline.md section 7.');
  }
  const url = `/models/anim/${file}`;

  // ?solo=1 drops the procedural player and frames the generated mesh alone. The paired frame
  // is for COMPARING; a solo frame is for JUDGING, and fitting two figures whose arms swing
  // through an animation clips both of them at the edges.
  const solo = (args.params?.get?.('solo') ?? '0') !== '0';

  // --- LEFT: the procedural player, for scale and for comparison
  const player = buildUnit4H({ height: H });
  player.setPose({
    shoulderL: [0, 0, 0.13], shoulderR: [0, 0, -0.13],
    elbowL: [0.10, 0, 0.05], elbowR: [0.10, 0, -0.05],
  });
  player.root.position.set(-0.75, 0, 0);
  if (!solo) engine.scene.add(player.root);

  // --- RIGHT: the skinned generated character
  const gltf = await new GLTFLoader().loadAsync(url);
  const rig = gltf.scene;

  /*
   * Normalise against the BIND pose, before any animation is applied. Measuring a box while a
   * walk cycle is mid-stride gives a height that depends on which frame you happened to sample,
   * and every subsequent number inherits that.
   */
  rig.updateWorldMatrix(true, true);
  const b0 = new THREE.Box3().setFromObject(rig);
  const h0 = b0.max.y - b0.min.y;
  if (!(h0 > 0)) throw new Error(`mesh-animated: ${url} has zero height — load failed`);
  const s = H / h0;
  rig.scale.setScalar(s);
  rig.updateWorldMatrix(true, true);
  const b1 = new THREE.Box3().setFromObject(rig);
  rig.position.set(solo ? 0 : 0.75, -b1.min.y, 0);

  let skinned = 0, tris = 0;
  rig.traverse((o) => {
    if (!o.isMesh && !o.isSkinnedMesh) return;
    o.material = shell;
    o.castShadow = true;
    o.receiveShadow = true;
    // A skinned mesh's bounding sphere is computed from the BIND pose, so a limb thrown wide by
    // an animation gets frustum-culled and the character loses an arm at certain camera angles.
    o.frustumCulled = false;
    if (o.isSkinnedMesh) skinned++;
    if (o.geometry?.index) tris += o.geometry.index.count / 3;
  });
  if (!skinned) throw new Error(`mesh-animated: ${url} has no SkinnedMesh — this is not a rigged file`);
  engine.scene.add(rig);

  // --- IDENTITY KIT: face, neck, ear discs and mint caps, parented to BONES. Contract §6 gives
  // these to the rig, and a bone-parented prop rides the deformation without needing weights.
  // ?kit=0 turns it off, so the bare generated body stays inspectable in one keystroke.
  if ((args.params?.get?.('kit') ?? '1') !== '0') {
    /*
     * ⚠️ A TEXTURED BODY TAKES THE WORDMARK ONLY — the same rule `mesh-avatar.js` follows, and
     * for the same reason. The full kit sizes its shoulder caps to the Lumi Bot's proportions and
     * throws outright on the Friendly Robot ("shoulder cap ray ... hit 0.611 m from the arm
     * joint — that is the torso"). That assertion is correct and stays; what was wrong was
     * running the kit at all on a body that already has its face, ears and caps painted on.
     *
     * Missing this cost a whole run of `harness/evidence/_anim_check.mjs`: all six clips failed to load
     * with the identical error, and the probe reported "nothing measured" rather than anything
     * about the animation.
     */
    let textured = false;
    rig.traverse((o) => { if (o.isMesh && o.material?.map) textured = true; });
    const kit = textured ? attachChestWordmark(rig, mats, H) : attachIdentity(rig, mats, H);
    /*
     * ⚠️ THIS VIEW DOES NOT GO THROUGH `createMeshAvatar` — it loads the GLB and dresses it
     * itself — so anything the AVATAR adds has to be added here too or it is missing from the one
     * view that can shoot the reference angles. `aBoneLocal` / `aBoneId` are what every
     * fine-detail feature is indexed by (a ring 3 cm below the elbow is
     * `dot(aBoneLocal, axis) in [0.02, 0.04]`), so without this line the detail is invisible
     * exactly where John judges it, and visible only in the game.
     *
     * Called AFTER `attachIdentity`, deliberately: the kit adds three more skinned meshes — the
     * two mint caps and the wordmark — which share the body's material, and a kit part with a
     * zeroed attribute reads as bone 0 at the origin.
     */
    attachBoneLocal(rig);
    console.log(`[mesh-animated] identity kit: ${kit.added.join(', ')}`);
    // The kit's own derived numbers, printed so a claim about them can be checked against the
    // frame rather than taken on trust — every one of these used to be a constant.
    const m = kit.measured ?? {};
    const q = (v) => (typeof v === 'number' ? v.toFixed(4) : '—');
    console.log(`[mesh-identity] head measured ${q(m.headW)} m (${q(m.headOfH)} H) vs art ` +
      `${q(m.artHeadW)} m  ·  ear seat x ${q(m.seatX)} -> outer ${q(m.earOuterX)} at y ${q(m.earY)}`);
    console.log(`[mesh-identity] visor ${q(m.visorW)} m = ${q(m.visorOfHead)} of head ` +
      `(scale ${q(m.visorScale)}, was ${q(m.visorScaleWas)})  ·  bezel ${q(m.bezelW)} m`);
    console.log(`[mesh-identity] wordmark ${q(m.decalW)} x ${q(m.decalH)} m at y ${q(m.decalY)} ` +
      `on a front band of ${q(m.frontBandHalf)} m half-width`);
  }

  // --- animation, driven by the engine's own fixed timestep so capture stays deterministic
  const mixer = new THREE.AnimationMixer(rig);
  const wantAnim = args.params?.get?.('anim');
  const clip = wantAnim
    ? (gltf.animations ?? []).find((a) => a.name === wantAnim)
    : gltf.animations?.[0];
  if (!clip) {
    throw new Error(`mesh-animated: ${url} has no clip ${wantAnim ? `named "${wantAnim}"` : 'at all'}` +
      `. Available: ${(gltf.animations ?? []).map((a) => a.name).join(', ') || '(none)'}`);
  }
  /*
   * `?bind=1` LEAVES THE RIG IN ITS BIND POSE, and it is the pose a texture reference wants.
   *
   * Every clip in this file is a performance: `Alert` turns the head ~30 degrees and staggers
   * the stance, `Walking` and `Running` are mid-stride, and even the calmest frame of the
   * calmest clip has one arm forward of the other. A reference image for a texture bake wants
   * the limbs separated and the head square to camera, which is exactly what a bind pose is.
   * Not starting the mixer is the only way to reach it — `at=0` is frame 0 OF THE CLIP, which
   * is already a posed frame.
   */
  const bindPose = (args.params?.get?.('bind') ?? '0') !== '0';
  if (!bindPose) {
    const action = mixer.clipAction(clip);
    action.play();
    engine.onUpdate((dt) => mixer.update(dt));
    /*
     * PUBLISHED FOR `harness/evidence/_anim_check.mjs`, which scrubs the clip to fixed phases and reads
     * the SKINNED vertex positions back to look for a limb flung across the room by a bad
     * weight. Without a handle on the mixer a probe can only screenshot whatever frame it
     * happened to catch, and an auto-rig's failures are phase-specific — a shoulder that
     * collapses only at full reach does not show up in an arbitrary still.
     */
    let skinned = null;
    rig.traverse((o) => { if (o.isSkinnedMesh && !skinned) skinned = o; });
    window.__rrr.anim = { mixer, action, clip, skinned, rig };
  } else {
    console.log('[mesh-animated] ?bind=1 — mixer not started, rig held in its BIND pose');
  }

  console.log(`[mesh-animated] ${file}: ${tris.toLocaleString()} tris, ${skinned} skinned mesh(es), ` +
    `clip "${clip.name}" ${clip.duration.toFixed(2)}s, scaled x${s.toFixed(4)}`);

  /*
   * ===================== `?azim=` — SHOOT THE REFERENCE ANGLES =====================
   *
   * John, giving the material spec: *"when you compare current meshy model with the art make sure
   * you view it from all the same reference angles."*
   *
   * ⚠️ UNTIL THIS EXISTED THE RENDER COULD ONLY BE SHOT FROM THE FRONT, and that is not a
   * limitation anyone chose — it is two mechanisms colliding. `fitCamera` computes its own camera
   * AFTER `studio()` returns, so it overwrites `shoot.mjs --cam`/`?campose=`; and orbit is
   * hard-gated off in capture mode so a critic cannot turn the model by hand either. A swing
   * critic hit exactly this and reported that it could not reproduce the art's side and back
   * angles, so it judged a three-dimensional character off one elevation.
   *
   * The reference is already four views — `assets/mv/player/baseline_{front,side-left,side-right,
   * back}.png` — so the angles are not a guess:
   *
   *     ?azim=0     front        matches baseline_front
   *     ?azim=90    the model's LEFT side, camera on +X   matches baseline_side-left
   *     ?azim=-90   its right side                        matches baseline_side-right
   *     ?azim=180   back                                  matches baseline_back
   *
   * Applied AFTER `fitCamera`, deliberately: fitCamera picks the distance and height that frame
   * the figure, and this only rotates that solved position about the target. So the figure stays
   * the same size in every one of the four, which is the whole point of a matched comparison.
   */
  fitCamera(engine, solo ? [rig] : [player.root, rig], 32, solo ? 0 : 18 * Math.PI / 180, 0.10, 1.14);

  /*
   * ⚠️ TURN THE MODEL, NOT THE CAMERA, AND BOTH REASONS MATTER.
   *
   * 1. THE CYC IS IN THE WAY. `studio()` puts a curved backdrop at z = -3.2 (`engine.cyc`). The
   *    camera-orbit version of this put the camera at z = -3.564 for `azim=180` — outside the
   *    backdrop — and captured a flat grey wall with the figure hidden behind it. The camera was
   *    provably correct: (0, 1.206, -3.564) with the right quaternion. Nothing was wrong with the
   *    maths; the set was simply between the lens and the subject.
   *
   * 2. LIGHTING. Orbiting the camera moves the subject through a fixed key/fill/rim, so the four
   *    views would differ in lighting as well as in angle, and a "matched comparison" that changes
   *    two things at once is not one. Rotating the SUBJECT under fixed lights is what a real
   *    turnaround does, and it is what makes the four frames comparable to each other AND to the
   *    art sheet.
   *
   * Applied after `attachIdentity`, which neutralises and restores the rig's own rotation while it
   * measures — set it before that and the kit fits itself to a turned body.
   */
  const azimDeg = Number(args.params?.get?.('azim') ?? 0);
  if (Number.isFinite(azimDeg) && azimDeg !== 0) {
    rig.rotation.y += azimDeg * Math.PI / 180;
    rig.updateMatrixWorld(true);
    console.log(`[mesh-animated] azim ${azimDeg} deg — subject turned, camera and lights fixed`);
  }

  if ((args.params?.get?.('label') ?? '1') !== '0') {
    labels([
      { text: `PROCEDURAL  ·  GENERATED + AUTO-RIGGED  (${file.replace(/_/g, ' ')})`,
        x: 50, y: 6, font: '600 15px/1.2 ui-sans-serif, system-ui, sans-serif' },
      { text: `${tris.toLocaleString()} tris of a 60,000 budget  ·  skinned, ${clip.duration.toFixed(2)}s clip`,
        x: 50, y: 10.5, font: '500 11px/1.2 ui-monospace, Menlo, monospace', color: '#6a7178' },
    ]);
  }

  engine.finalizeScene();

  /*
   * AFTER `finalizeScene`, WHICH IS NOT A STYLE POINT. `finalizeScene` runs `patchForScreenAO`
   * over every material, and that chains onto `onBeforeCompile`; patching after it is what puts
   * the flat-albedo write LAST in the chain and therefore closest to `<opaque_fragment>` in the
   * shader string — i.e. after `RRW_OPAQUE`'s seam occlusion, which is the whole point.
   */
  if (unlit) {
    setUnlitEmissive(unlitEmissive(args.params));
    const occ = unlitSeamOcc(args.params);
    const n = patchSceneForUnlit(engine.scene, { seamOcc: occ });
    bypassPostChain(engine, { bg: bgArg ? parseInt(bgArg, 16) : 0x808080 });
    const nc = (args.params?.get?.('unlitchrome') ?? '1') !== '0'
      ? normaliseChromeTint(engine.scene) : 0;
    console.log(`[unlit] chrome tint normalised on ${nc} material(s)`);
    console.log(`[unlit] ${n} material(s) flattened, seamOcc ${occ ? 'ON' : 'off'}, `
      + `emissive x${unlitEmissive(args.params)} — post chain bypassed, cyc hidden, shadows off`);
    /*
     * THE GUARD RUNS ON A LATER FRAME ON PURPOSE. `uAOEnabled` starts at 0, so asserting it
     * here would pass without proving anything — a textbook bypass. Only `Pipeline.render()`
     * ever raises it, so checking once real frames have gone by is what makes it a measurement
     * of whether the post chain was actually skipped.
     */
    let checked = false;
    engine.onUpdate(() => {
      if (checked || engine.frame < 4) return;
      checked = true;
      assertPostBypassed(engine);
      console.log('[unlit] POST BYPASS VERIFIED at frame ' + engine.frame
        + ' — screen-space AO never ran, so nothing was tonemapped, graded or occluded');
    });
  }

  await brandReady();
  engine.markReady();
  engine.start();
  return engine;
}
