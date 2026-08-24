import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { attachIdentity, attachChestWordmark } from './mesh-identity.js';
import { shellWhite } from '../materials/surfaces/robot.js';

/**
 * THE GAME AVATAR — the generated, auto-rigged, skinned character driving the PLAYER in-game.
 *
 * `mesh.animated` proves the character renders and animates. This is the piece that puts it in
 * the game, and the whole design turns on one conflict that has to be resolved rather than
 * papered over:
 *
 *   THE GAME'S BODY IS POSED PROCEDURALLY. `Gait` writes joint angles, `LimbRig` detaches limbs
 *   at sockets, and `SledgeRig` solves a TWO-HANDED IK GRIP so both hands land on the hammer.
 *
 *   THE GENERATED CHARACTER IS ANIMATED BY BAKED CLIPS. A clip cannot know where the hammer is.
 *
 * Play the clips and the hands come off the hammer — and the hammer is the campaign's core verb,
 * so that is not a cosmetic loss. Pose the mesh entirely from `Gait` and the auto-rig's clips are
 * wasted, which is most of what makes the generated character better than the procedural one.
 *
 * ⚠️ AN EARLIER VERSION SPLIT THE BODY: clips for the legs and spine, and the procedural arms
 * RETARGETED on top so the IK grip survived. **John played it and rejected it** — "the arms are
 * not right ... also not right without the hammer, just walk around. I think we need to abandon
 * the old skellington." He is the judge, and he is right on the mechanism too: bolting one
 * skeleton's arms onto another skeleton's body leaves a seam at the shoulder that no amount of
 * retarget arithmetic removes, because the two solutions disagree about where the shoulder IS.
 *
 * SO THE CLIP DRIVES EVERYTHING, INCLUDING THE SWING. The Meshy `attack` clip is the
 * sledgehammer swing.
 *
 * That inverts how the hammer is held. It is no longer placed by an IK solve onto two solved
 * hands; it is PARENTED TO THE HAND BONE and goes wherever the clip takes it. Which is also why
 * the damage still lands correctly with no extra work: `SledgeRig.swingHit()` reads the prop's
 * real `matrixWorld` at contact, so the hit follows whatever the animation actually did.
 */

/**
 * ONE FILE, FIFTEEN CLIPS, AND A RE-UNWRAPPED BODY.
 *
 * This used to load four separate GLBs — four full copies of a 10,378-triangle character, three
 * of them downloaded purely for their animation tracks and then discarded. `player_unwrapped.glb`
 * is Meshy's merged export put through `tools/unwrap_player.py`, so it carries every clip AND the
 * cube-projected atlas the shell's panel seams need.
 *
 * Keys here are the STATE the game asks for; values are clip names inside that file.
 */
/*
 * ⚠️ THE BODY IS NAMED BY A CONSTANT AND `?player=` OVERRIDES IT, SO ANY A/B IS FREE.
 *
 * `player_norm30.glb` is `player_unwrapped.glb` with 1,318 SPURIOUS normal breaks merged — vertex
 * copies at one corner whose normals disagreed by less than 30 degrees, which shades exactly like
 * a polygon edge and is what two critics were counting as faceting. Nothing but the NORMAL
 * attribute differs: same 13,039 vertices, same 31,134 indices, same UV atlas, same skin, same 15
 * clips, proved by byte-diff. `tools/smooth_normals.py` is the tool and carries the argument.
 *
 *   ?player=player_unwrapped.glb    the pre-normal-merge original, for an exact A/B
 *   ?player=player_bf65.glb         the parked subdivided candidate
 *
 * ⚠️ `?player=` IS THIS MODULE'S OVERRIDE AND `src/views/mesh-animated.js` DOES NOT READ IT — that
 * view loads the GLB itself, from its own `?clip=` table, and never calls `createMeshAvatar`. A
 * sweep captured through `mesh.animated` with `?player=` renders ONE asset however many arms you
 * pass; four variants came back byte-identical before this was noticed. Use `?clip=` there.
 *
 * `player_bf65.glb` is the PARKED CANDIDATE: 41,512 triangles of a 60,000 budget from
 * `tools/subdivide_player.py` (modified Butterfly, crease 65), provably crack-free and skin
 * byte-identical for +0.06 ms GPU. It is UNSHIPPED for one reason — a sawtooth black band opens
 * across both hips, which is a real concavity in the source model that 10,378 triangles were too
 * crude to resolve, so no subdivision scheme avoids it. The remaining answer is a human closing
 * the skirt/thigh junction in Blender, after which the tool re-runs unchanged.
 *
 * 🚨 TWELVE MECHANISMS WERE PROPOSED FOR THAT BAND AND TWELVE WERE ELIMINATED BY CONTROL.
 * **`docs/handoff/player-pipeline.md` section 7 is that record** — it is not restated here, and it
 * is what stops the next agent re-walking the thread. Read it before proposing a thirteenth.
 */
/*
 * THE SHIP POINTER. `friendly_merged.glb` is the second generated character — Meshy's "Friendly
 * Robot", auto-rigged, textured, 15,864 tris — carrying the SAME fifteen clips the Lumi Bot used.
 *
 * The clips transfer because the two rigs are identical, and that was verified rather than
 * assumed: `tools/_rig_compare.py` reports all 24 bone names shared, with the same parent for
 * every one. `tools/merge_clips.py` rebuilds this file and refuses to write one if that ever
 * stops being true — copying actions between skeletons that merely have the same bone COUNT
 * produces a body that animates confidently and wrongly.
 *
 * `?player=player_norm30.glb` is the full revert to the Lumi Bot, which is still on disk with
 * every clip and remains the fallback if this body turns out worse in motion than it looks
 * standing still. `char.lineup` stands all three generations side by side.
 */
/*
 * 🚨 REVERTED TO THE LUMI BOT ON 2026-08-19. `friendly_merged.glb` DOES NOT ANIMATE CORRECTLY AND
 * MUST NOT SHIP UNTIL ITS CLIPS ARE REGENERATED.
 *
 * The body itself is good — geometry, baked texture, chrome panels, wordmark. What is wrong is
 * the animation, and it is wrong because of how it was built here: the 15 clips were COPIED from
 * the Lumi Bot on the strength of the two rigs sharing all 24 bone names and parents.
 *
 * That is not sufficient and `tools/_rig_compare.py` now says so. A rotation key is relative to
 * the bone's REST orientation, and these two rigs rest differently: `Hips` — the ROOT — points
 * **114.86 degrees** apart, and the thigh bones differ in length by **34%**. So every clip's root
 * rotation is applied about the wrong axis. John saw it immediately: "the feet are moving from
 * the point and the animation doesn't look like its on the same plane."
 *
 * ⚠️ A HIPS-HEIGHT RESCALE OF THE TRANSLATION TRACKS WAS TRIED AND DID NOT FIX IT (0.8494, from
 * hips 0.7195 vs 0.8471). Armature scales are identical (0.01 on both), so that is not it either.
 * The rest-pose difference is the mechanism; do not re-try the first two.
 *
 * `?player=friendly_merged.glb` still loads it for inspection, and `char.lineup` shows it beside
 * the others. THE FIX is to regenerate the clips ON the new rig from Meshy's preset library —
 * every name the game needs is in it. See `docs/handoff/player-pipeline.md`.
 */
/*
 * ✅ SHIPPED 2026-08-19 — `friendly_all38.glb`, AND THE CLIPS ARE ITS OWN THIS TIME.
 *
 * John, after watching the row: *"I love the rigging. Good work. lets ship that."*
 *
 * 38 clips regenerated on the Friendly Robot's own rig from Meshy's preset library, taken in two
 * downloads (Meshy caps one at 20) and joined by `tools/merge_clips.py`. The guard that convicted
 * the old file is the guard that clears this one: `tools/_rig_compare.py` against
 * `friendly_rigged.glb` reads **0.00 deg worst rest direction, 0.0% worst bone length**, against
 * the 114.86 deg that made `friendly_merged.glb` invalid.
 *
 * Measured, not assumed — `harness/_anim_check.mjs --clip fall`: `Walking` 2.3% ground break,
 * 5.0% drift, 8.9 deg tilt; `Running` and `Alert` the same order. The copied build read 4.3% and
 * pitched off the plane, which is what John saw.
 *
 * ⚠️ EVERY NAME IN `CLIPS` AND `SWINGS` BELOW SURVIVED THE REGENERATION UNCHANGED — `Alert`,
 * `Walking`, `Running`, `Axe_Breathe_and_Look_Around`, `Attack`, `Heavy_Hammer_Swing` are all
 * present under those exact spellings. The seated set is new and uses Meshy's own spellings
 * (`Sit_to_Stand_Transition_M`, not the Lumi Bot's).
 *
 * 🚨 THE TWO SWING CLIPS ARE STILL THE OLD FAULT AND REGENERATING THEM CHANGED NOTHING. Both are
 * ground chops: 29-36% drift and 35-41 deg of hips tilt on this rig exactly as on the Lumi Bot.
 * A real WALL swing has to come from Text-to-Motion. Until it does, `SWINGS` below is unchanged.
 *
 * ⚠️ `SWINGS[].grip` WAS SOLVED ON THE LUMI BOT'S HAND. This rig's `RightHand` rests 10.54 deg
 * away and is 4.9% shorter, so the haft's roll in the fist is the first thing to re-measure if
 * the hammer reads wrong in the hand. It is a labelled suspect, not a known fault.
 *
 * `?player=player_norm30.glb` is the full revert to the Lumi Bot, still on disk with its 15 clips.
 */
const PLAYER_BODY = 'friendly_all38.glb';

/**
 * TURN THE BAKED TEXTURE'S DARK GREY PANELS INTO CHROME.
 *
 * John, on the Friendly Robot: "fix the dark grey panels for chrome like the art". The art's
 * darks are not dark PAINT, they are polished metal reading dark because it is reflecting a dark
 * room — chest surround, forearms, thighs, shins. Meshy baked them as flat dark grey albedo,
 * which is why they read as plastic.
 *
 * The panels are not addressable by bone: they are shapes WITHIN the torso, the thigh and the
 * shin, so `uRRWFamW`'s per-bone family vector — the mechanism used for the Lumi Bot — cannot
 * select them. What does select them is the baked texture itself, where they are the only large
 * dark regions. So the mask is the map's own luminance.
 *
 * Per pixel: below `uChromeLo` the surface becomes metal (metalness up, roughness down, albedo
 * lifted to a neutral chrome tint so it can actually reflect); above `uChromeHi` it is untouched
 * white plate; between, it crossfades, so a panel EDGE does not turn into a hard jaggy line at
 * whatever threshold happened to be chosen.
 *
 * ⚠️ THE LIFT IS THE POINT AND IT IS COUNTER-INTUITIVE. A metal with a near-black albedo
 * reflects almost nothing and renders BLACKER than the paint it replaced — raising metalness
 * alone makes the panels worse, not better. Chrome is bright albedo plus low roughness.
 *
 * Knobs, all live: `?chromelo=` `?chromehi=` `?chromerough=` `?chromelift=`.
 * `?chrome=0` is the full revert — the baked texture renders exactly as Meshy shipped it.
 */
/**
 * Put the 4Humanity chest wordmark on a body that already has its own face and ears.
 *
 * John asked for the chest logo on the Friendly Robot. The full identity kit is the wrong tool
 * for it: that kit adds ear discs, a neck column, a faceplate, a visor bezel and mint shoulder
 * caps, and this body already carries all of those BAKED INTO ITS TEXTURE — running the kit
 * would sit real geometry on top of painted versions of the same features.
 *
 * `attachWordmark` is not exported from `mesh-identity.js`, and reaching in to export it would
 * mean duplicating the chest raycast setup it depends on. So the kit is run whole and then pruned
 * back to the one part wanted. The kit reports what it added, and every part it names is removed
 * except the wordmark.
 *
 * ⚠️ THE PRUNE IS ASSERTED, NOT ASSUMED. If the kit ever renames a part, a silent miss would
 * leave a duplicate ear floating by this robot's head; if it renames the wordmark, this returns
 * having added nothing while reporting success. Both are checked.
 */
/**
 * The 4Humanity chest wordmark for a body that already has a painted face, ears and caps.
 *
 * ⚠️ THIS WAS FIRST BUILT AS "run the whole identity kit, then delete the parts you did not
 * want", AND THAT DOES NOT WORK — the kit throws before it ever reaches the wordmark, on a
 * shoulder-cap ray that lands on this body's torso because the cap is sized for the Lumi Bot's
 * proportions. The assertion is right; the approach was wrong. `attachChestWordmark` in
 * `mesh-identity.js` carries the argument and the real implementation.
 */
export function attachWordmarkOnly(rig, mats, H) {
  return attachChestWordmark(rig, mats, H);
}

export function chromeDarkPanels(mat) {
  if (urlNum('chrome', 1) <= 0) return mat;
  if (mat.userData?.rrwChromed) return mat;      // materials are shared; inject once

  const lo = urlNum('chromelo', 0.26);
  const hi = urlNum('chromehi', 0.46);
  const rough = urlNum('chromerough', 0.18);
  const lift = urlNum('chromelift', 0.44);
  const sat = urlNum('chromesat', 0.055);

  mat.userData = { ...(mat.userData ?? {}), rrwChromed: true };
  mat.metalness = Math.max(mat.metalness ?? 0, 1.0);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uChromeLo = { value: lo };
    shader.uniforms.uChromeHi = { value: hi };
    shader.uniforms.uChromeRough = { value: rough };
    shader.uniforms.uChromeLift = { value: lift };
    shader.uniforms.uChromeSat = { value: sat };

    /*
     * ⚠️ EVERY GLSL LITERAL CLOSES ON ITS OWN LINE. `harness/lint-glsl.mjs` fails the build for
     * a backtick sitting on a line that also carries GLSL, and it is right to: that is how a
     * shader edit turns into a build break for whoever touches the file next.
     */
    const HEAD = `
      uniform float uChromeLo;
      uniform float uChromeHi;
      uniform float uChromeRough;
      uniform float uChromeLift;
      uniform float uChromeSat;
      float rrwChromeMask;
      void main() {
    `;
    /*
     * The mask is read off the SAMPLED map, after `<map_fragment>` has run, so it is the texel
     * actually being shaded rather than a second lookup that could drift from it.
     */
    /*
     * ⚠️ THE MASK IS GATED ON SATURATION AS WELL AS LUMINANCE, AND THAT IS WHAT SAVES THE FACE.
     *
     * A luminance-only mask took the BLUE FACE SCREEN with it — it is dark, so it chromed, and
     * the robot lost its eyes. The panels the art wants in chrome are NEUTRAL dark grey; the
     * face is blue and the shoulder caps are mint. So a texel only qualifies as chrome if it is
     * both dark AND close to grey, which leaves every coloured feature alone without needing to
     * know where any of them are in UV space.
     */
    const MASK = `
      #include <map_fragment>
      float rrwLum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
      float rrwMax = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b));
      float rrwMin = min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));
      float rrwSat = rrwMax - rrwMin;
      rrwChromeMask = (1.0 - smoothstep(uChromeLo, uChromeHi, rrwLum))
                    * (1.0 - smoothstep(uChromeSat, uChromeSat * 2.0, rrwSat));
      diffuseColor.rgb = mix(diffuseColor.rgb,
        vec3(uChromeLift * 1.02, uChromeLift, uChromeLift * 0.97), rrwChromeMask);
    `;
    // metalness and roughness are uniforms on this material, so they are overridden per pixel
    // AFTER their own chunks have assigned the flat values.
    const ROUGH = `
      #include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, uChromeRough, rrwChromeMask);
    `;
    const METAL = `
      #include <metalnessmap_fragment>
      metalnessFactor = mix(0.0, 1.0, rrwChromeMask);
    `;

    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', HEAD)
      .replace('#include <map_fragment>', MASK)
      .replace('#include <roughnessmap_fragment>', ROUGH)
      .replace('#include <metalnessmap_fragment>', METAL);
  };
  mat.needsUpdate = true;
  return mat;
}
const CLIP_FILE = (typeof location !== 'undefined'
  && new URLSearchParams(location.search).get('player')) || PLAYER_BODY;
const CLIPS = {
  idle: 'Alert',
  walk: 'Walking',
  run: 'Running',
  // The swing is not one clip — see SWINGS below.
  // Carrying the hammer changes the whole base set, not just the swing. `Alert` is a ready stance
  // with EMPTY hands, which is why a hammer in it read as one the character had forgotten about.
  // NOT `Axe_Stance` — despite the name it is a crouched, hand-on-the-ground landing pose, which
  // reads as a superhero touchdown rather than a robot standing holding a tool. Checked on a
  // render, not on the name.
  idleHold: 'Axe_Breathe_and_Look_Around',
  /*
   * ⚠️ `Walk_Turn_Left_with_Weapon` IS A TURN, NOT A WALK, AND IT SHIPPED. Measured on its own
   * Hips rotation track it drifts **-270.2 degrees** over 2.21 s — three quarters of a turn to the
   * left — against +0.3 for `Walking` and -0.1 for `Running`. John played it and reported
   * "sometimes when walking forward the model aims to the left"; it was not sometimes, it was
   * every time he walked carrying the hammer.
   *
   * I picked it off its NAME because it was the only forward-ish weapon walk in the set. There is
   * no straight walk-with-weapon clip, so this falls back to plain `Walking` — the hammer is
   * parented to the hand, so it is still carried, it just loses the weapon-specific arm pose.
   * A proper one is the next thing to fetch from Meshy. `assertInPlace` below is the guard.
   */
  walkHold: 'Walking',
};

/** Optional seated clips — present on `friendly_all38.glb`, absent on the Lumi fallback. */
const SIT_CLIPS = {
  sitIdleM: 'Chair_Sit_Idle_M',
  sitIdleF: 'Chair_Sit_Idle_F',
  sitDown: 'Stand_to_Sit_Transition_M',
};
/**
 * Chair_Sit_Idle_M spends ~6 of 10.7 s at Spine02 roll ~59° — a periodic lean
 * forward that John called odd. t=0 is the sit-back pose. Freeze these bones
 * at that frame; arms keep looping so the circle is not eight statues.
 */
const SIT_UPRIGHT_T = 0;
const SIT_LEAN_BONES = ['Hips', 'Spine02', 'Spine01', 'Spine'];

/**
 * Where the hammer sits in the hand — locked to John's 2026-08-24 grip-tool readout, not to
 * a single roll.
 *
 * PR #38 baked `GRIP_SHIPPED = 2.37` rad and `griplen` 0.205, then `mountInHand` ALIGNED the
 * haft to the forearm and rolled about that axis. That primitive puts the shaft THROUGH the
 * wrist (off-wrist 0). Recap CAM still read as a hand glued to the butt of the handle,
 * because a fist-frame mount is six numbers plus the along-haft slider, not one radian.
 *
 * The numbers below are the raw offsets John measured on the live pickup (grip tool sliders
 * + in-game readout). They are applied in the RightHand / fist frame:
 *
 *   rotation.order XYZ, rotation.set(roll, tilt, yaw)
 *   position.set(palm, reach, depth) metres
 *   then translateY(-alongHaft * height) along the now-rotated haft
 *
 * `alongHaft` 0.2059 is the slider unit (UI ~35 cm = 0.2059 * 1.7 m). Physical "up the shaft"
 * is 31.0 cm because the offsets live in the fist frame while the shaft is swung ~90 deg —
 * slider length is not shaft length. Guard the three pickup baselines, not the slider.
 *
 * `sledge.js` `GRIP_LO` / `GRIP_SEP` still place the decorative wraps on the prop. They are
 * not the live mount.
 */
export const GRIP_MOUNT = Object.freeze({
  roll: 5.2446,
  tilt: -1.5664,
  yaw: 0.5279,
  palm: 0.04662,
  reach: 0.12458,
  depth: -0.03953,
  alongHaft: 0.2059,
});
/**
 * In-game pickup baselines. `char.grip` / `harness/_grip_shot.mjs` assert these. A restale
 * of GRIP_MOUNT that does not move the hammer will still pass a roll-only check — these
 * three will not.
 *
 * Geometry vs John's one-decimal print: off-wrist 13.29 cm / 13.3 cm, up-shaft 31.01 cm /
 * 31.0 cm, shaft angle 89.75 deg / 89.8 deg (tilt -1.5664 rad). Epsilon in the harness is
 * that rounding, not a second guess.
 */
export const GRIP_BASELINE = Object.freeze({
  offWristM: 0.133,
  upShaftM: 0.310,
  shaftAngleDeg: 89.8,
});
/** Roll component of GRIP_MOUNT — what SWINGS[].grip still names. 2.37 is retired. */
export const GRIP_SHIPPED = GRIP_MOUNT.roll;
export const GRIP_ALONG_HAFT = GRIP_MOUNT.alongHaft;
/** @deprecated use GRIP_SHIPPED — kept so older critics that name the default still compile. */
export const GRIP_ROLL_DEFAULT = GRIP_SHIPPED;
/**
 * ===================== THE SWING SET =====================
 *
 * John: *"I want to have varied animations between the two and both of them should look correct."*
 * So the swing is a LIST, picked from at random, and every entry carries its own two numbers.
 *
 * ⚠️ BOTH NUMBERS ARE PROPERTIES OF THE CLIP, NOT OF THE HAMMER, WHICH IS WHY THEY CANNOT BE
 * SHARED:
 *
 *   `grip`     the ROLL of GRIP_MOUNT (fist-frame Euler x). Tilt/yaw/palm/reach/depth are the
 *              shared pickup lock, not per-clip. A per-clip restale of roll still turns the
 *              face; do not restale the other five offsets here.
 *
 *   `contact`  where in the clip the head actually arrives. `CONTACT_PHASE` 0.60 was derived for
 *              the retired procedural swing; `Heavy_Hammer_Swing` is still OVERHEAD at 0.60 and
 *              peaks at 0.833, so the wall was breaking ~160 ms before the hammer got there.
 *
 * ⚠️ A NEW ENTRY IS NOT DONE UNTIL BOTH ARE MEASURED ON IT. Copying another clip's numbers is
 * exactly the mistake that shipped a spade — `harness/scenarios/_critic-swingface1.mjs` and
 * `_critic-swingface2.mjs` are the instruments that solve them. Sharing `GRIP_MOUNT` is the
 * bench lock: both clips currently share one fist-frame mount, so they share the same roll.
 *
 * ⚠️ `Heavy_Hammer_Swing` IS A GROUND CHOP and is flagged: its head passes 27 cm BELOW the floor
 * and the robot ends bent double. It is kept because John asked for variety, but it is the weaker
 * of the two against a vertical wall and should be replaced when a real wall-swing exists.
 */
export const SWINGS = [
  /*
   * ⚠️ NEITHER OF THESE IS A WALL SWING, AND BOTH ARE MEASURED, NOT GUESSED AT. John asked for
   * variety with both looking correct; that is not deliverable from this clip set, and saying so
   * is more useful than tuning a chop until it stops looking like one.
   *
   *   Heavy_Hammer_Swing   head passes 0.27 m BELOW the floor, robot ends bent double
   *   Attack               head passes 0.37 m below the floor — a DEEPER chop — stops ~0.40 m
   *                        short of the wall, and contains a POSITIONAL DISCONTINUITY: the head
   *                        jumps ~0.8 m in a single 1/240 step at phase ~0.37. Peak "speed"
   *                        measures 67 m/s at 1/60 and 184 m/s at 1/240, and a difference
   *                        quotient that GROWS as the step shrinks is a teleport, not a fast
   *                        swing. Heavy converges properly to 33 m/s.
   *
   * The real fix is a purpose-made clip — Meshy's Text-to-Motion, asked for a horizontal swing
   * into a vertical wall at chest height. Until then this set is the best available, not good.
   *
   * ⚠️ `Attack`'s FACE ANGLE is still unsolved as a per-clip measurement (two runs failed their
   * own control because the clip teleports). The ROLL it carries is `GRIP_MOUNT.roll`, the
   * same lock `Heavy_Hammer_Swing` and `mountProp` use, so live play cannot pick Attack and
   * silently restale a different hammer than the bench.
   */
  { clip: 'Attack', grip: GRIP_SHIPPED, contact: 0.381,
    note: 'grip locked to GRIP_MOUNT.roll; contact measured; face-angle unsolved (clip teleports at p0.37); 0.37 m under floor' },
  { clip: 'Heavy_Hammer_Swing', grip: GRIP_SHIPPED, contact: 0.85,
    note: 'grip locked to GRIP_MOUNT.roll; contact measured; ground chop, 0.27 m under floor' },
];

/*
 * ⚠️ 2.37 WAS A SINGLE-ROLL LOCK AND IT DID NOT MATCH THE LIVE PICKUP.
 *
 * The 0.8 idle eyeball was a quarter-turn out at the strike (edge-on, a spade). PR #38 replaced
 * it with 2.37 (0.8 + pi/2) and aligned the haft to the forearm. That is the primitive Recap
 * CAM still judged as hand-on-butt: the shaft ran through the wrist. John's grip-tool lock
 * (GRIP_MOUNT) is the live mount — roll 5.2446 / tilt -1.5664 / yaw 0.5279 plus palm/reach/depth.
 * char.grip re-derives it if the clip or the body changes. Do not restale 2.37 here.
 */

/*
 * ⚠️ ADDRESS-BAR KNOBS OVERRIDE THE BENCH LOCK, they do not replace it. Defaults are
 * GRIP_MOUNT, so the address bar changes nothing unless it is used.
 *
 *   ?grip=5.2446     fist-frame Euler x, radians (GRIP_MOUNT.roll)
 *   ?tilt=-1.5664    fist-frame Euler y
 *   ?yaw=0.5279      fist-frame Euler z
 *   ?palm=0.04662    metres, fist x
 *   ?reach=0.12458   metres, fist y
 *   ?depth=-0.03953  metres, fist z
 *   ?griplen=0.2059  along-haft slider (fraction of height; UI ~35 cm, shaft ~31 cm)
 *   ?swingpick=0     force SWINGS[N] in playAttack instead of a random pick
 *
 */
const urlNum = (name, fallback) => {
  if (typeof location === 'undefined') return fallback;
  const v = new URLSearchParams(location.search).get(name);
  const n = v === null ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * Apply John's fist-frame lock to a prop already parented to the hand bone.
 *
 * ⚠️ NO FOREARM ALIGN. The #38 primitive (`align * rollY`) forced the shaft through the
 * wrist. These offsets are in the hand bone's own frame, matching the grip-tool sliders:
 * Object3D default XYZ Euler (x=roll, y=tilt, z=yaw), position metres (x=palm, y=reach,
 * z=depth), then slide along the rotated haft. `k` divides out the GLB's 0.01 bone scale
 * so metres in the lock stay metres in the world.
 */
export function applyGripLocal(obj, {
  k = 1,
  height = 1.7,
  roll = GRIP_MOUNT.roll,
  tilt = GRIP_MOUNT.tilt,
  yaw = GRIP_MOUNT.yaw,
  palm = GRIP_MOUNT.palm,
  reach = GRIP_MOUNT.reach,
  depth = GRIP_MOUNT.depth,
  alongHaft = GRIP_MOUNT.alongHaft,
} = {}) {
  obj.scale.setScalar(k);
  obj.rotation.order = 'XYZ';
  obj.rotation.set(roll, tilt, yaw);
  obj.position.set(palm * k, reach * k, depth * k);
  obj.translateY(-alongHaft * height * k);
}

/**
 * Hang a held prop off a hand bone. This is the ONE mount: product `mountProp` and the
 * `char.grip` bench both call it, so the live pickup cannot silently diverge from the sheet.
 *
 * @param {THREE.Object3D} obj
 * @param {object} opts
 * @param {THREE.Bone} opts.bone
 * @param {number} opts.height        character height in metres
 * @returns {object | null} k plus the applied offsets plus measureGrip()
 */
export function mountInHand(obj, {
  bone,
  height,
  roll = GRIP_MOUNT.roll,
  tilt = GRIP_MOUNT.tilt,
  yaw = GRIP_MOUNT.yaw,
  palm = GRIP_MOUNT.palm,
  reach = GRIP_MOUNT.reach,
  depth = GRIP_MOUNT.depth,
  alongHaft = GRIP_MOUNT.alongHaft,
} = {}) {
  if (!bone || !obj) return null;
  obj.removeFromParent();
  bone.updateWorldMatrix(true, false);

  const s = bone.getWorldScale(new THREE.Vector3());
  const k = 1 / (((s.x + s.y + s.z) / 3) || 1);

  bone.add(obj);
  applyGripLocal(obj, { k, height, roll, tilt, yaw, palm, reach, depth, alongHaft });

  obj.updateWorldMatrix(true, true);
  const size = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3()).length();
  if (size < height * 0.2) {
    throw new Error(`mesh-avatar: the mounted prop measures ${size.toFixed(4)} m on a ` +
      `${height} m character — the bone's own scale has not been divided out, so it is ` +
      'parented, visible and far too small to see.');
  }
  return { k, roll, tilt, yaw, palm, reach, depth, alongHaft, ...measureGrip(obj, bone) };
}

/**
 * Perpendicular distance from a world point to the prop's haft (local +Y through the origin).
 * The `char.grip` bench publishes this for the off-hand so a miss is a number, not a screenshot
 * argument. Zero means the point sits on the shaft.
 */
export function haftDistance(obj, worldPoint) {
  if (!obj || !worldPoint) return null;
  obj.updateWorldMatrix(true, false);
  const origin = new THREE.Vector3().setFromMatrixPosition(obj.matrixWorld);
  const axis = new THREE.Vector3().setFromMatrixColumn(obj.matrixWorld, 1);
  if (axis.lengthSq() < 1e-12) return null;
  axis.normalize();
  const to = worldPoint.clone().sub(origin);
  return to.addScaledVector(axis, -to.dot(axis)).length();
}

/**
 * In-game pickup readout — the three numbers John's grip tool prints, measured from the
 * SCENE so the bench cannot invent them. Pose-invariant while the prop is parented to
 * `bone` with a fixed local transform.
 *
 *   offWristM      wrist origin to the haft, metres (want 0.133)
 *   upShaftM       butt to the closest point on the haft to the wrist, metres (want 0.310)
 *   shaftAngleDeg  angle between the haft and the hand bone's +Y (want 89.8)
 */
export function measureGrip(obj, bone) {
  if (!obj || !bone) return { offWristM: null, upShaftM: null, shaftAngleDeg: null };
  obj.updateWorldMatrix(true, false);
  bone.updateWorldMatrix(true, false);
  const origin = new THREE.Vector3().setFromMatrixPosition(obj.matrixWorld);
  const shaft = new THREE.Vector3().setFromMatrixColumn(obj.matrixWorld, 1);
  if (shaft.lengthSq() < 1e-12) return { offWristM: null, upShaftM: null, shaftAngleDeg: null };
  shaft.normalize();
  const wrist = new THREE.Vector3().setFromMatrixPosition(bone.matrixWorld);
  const toWrist = wrist.clone().sub(origin);
  const upShaftM = toWrist.dot(shaft);
  const closest = origin.clone().addScaledVector(shaft, upShaftM);
  const offWristM = closest.distanceTo(wrist);
  const boneY = new THREE.Vector3().setFromMatrixColumn(bone.matrixWorld, 1);
  if (boneY.lengthSq() < 1e-12) {
    return { offWristM, upShaftM, shaftAngleDeg: null };
  }
  boneY.normalize();
  const shaftAngleDeg = THREE.MathUtils.radToDeg(
    Math.acos(THREE.MathUtils.clamp(Math.abs(shaft.dot(boneY)), -1, 1)));
  return { offWristM, upShaftM, shaftAngleDeg };
}

/** Degrees, one decimal — the paste-ready form `window.__grip` prints for SWINGS. */
export function gripDeg(rad) {
  return +(rad * 180 / Math.PI).toFixed(1);
}

/** URL overrides of GRIP_MOUNT. Missing params keep the lock. */
export function gripFromUrl() {
  return {
    roll: urlNum('grip', GRIP_MOUNT.roll),
    tilt: urlNum('tilt', GRIP_MOUNT.tilt),
    yaw: urlNum('yaw', GRIP_MOUNT.yaw),
    palm: urlNum('palm', GRIP_MOUNT.palm),
    reach: urlNum('reach', GRIP_MOUNT.reach),
    depth: urlNum('depth', GRIP_MOUNT.depth),
    alongHaft: urlNum('griplen', GRIP_MOUNT.alongHaft),
  };
}

/**
 * ===================== `aBoneLocal` / `aBoneId` — WHERE A VERTEX SITS INSIDE ITS OWN BONE =====
 *
 * `docs/design/player-material-spec.md` asks for detail that is FINER THAN A BONE: a dark ring
 * around the elbow actuator, two chrome rings at the wrist, a chrome panel on the back of the
 * calf, ventilation on the back of the head, ridges in the spine chrome. The mask that delivered
 * two-tone is driven by SKIN WEIGHTS, and a skin weight is per-bone — it can say "this is the
 * forearm" and can never say "a 2 cm band 3 cm below the elbow".
 *
 * The missing quantity is where the surface sits WITHIN its bone's own frame, and the whole point
 * is that it is STATIC. It does not change when the character animates, because that is the
 * definition of skinning. So it is computed once, on the CPU, at load — no per-frame cost, no
 * shader arithmetic, no second skinning solve:
 *
 *     aBoneLocal = boneInverses[dominantBone] * bindMatrix * vertexPosition   (× the bone's scale)
 *     aBoneId    = dominantBone
 *
 * ⚠️ `Skeleton.update()` FILLS `boneMatrices` AND ONLY RUNS AT RENDER TIME, so `boneMatrices` is
 * a zero-filled array in a load-time pass like this one. `boneInverses` is safe — it is BIND data,
 * written once when the skeleton was constructed — and it is the only thing here that is read.
 *
 * ⚠️ AND THE FRAME IS `bone.matrixWorld`, WHICH IS NOT OBVIOUS AND IS WHY IT IS MEASURED.
 * three.js's default `AttachedBindMode` recomputes `bindMatrixInverse` as the inverse of the
 * mesh's CURRENT `matrixWorld` on every `updateMatrixWorld`, so the model matrix cancels out of
 * the skinning chain entirely and what is left is
 *
 *     world = bone.matrixWorld * (boneInverses[b] * bindMatrix * position)
 *
 * i.e. the map from bone-local back to world metres is the bone's own world matrix. That matters
 * for UNITS: this asset's bones carry scale 0.01 (SkinnedMesh node 0.01 under an Armature at 100)
 * and its `boneInverses` carry 100, so a raw `boneInverses * position` is 100× the size of the
 * character. Multiplying by the bone's own world scale puts `aBoneLocal` in METRES OF THE
 * FINISHED CHARACTER, which is the unit a shader author writing "3 cm below the elbow" needs.
 *
 * `harness/_fd1_frames.mjs` is the control for all of that: it recomputes every vertex both ways
 * and compares against `SkinnedMesh.applyBoneTransform`, three.js's own skinning. Agreement is
 * 3.9e-7 m over 800 vertices; the same loop with `boneInverses` omitted misses by 0.285 m.
 */

/**
 * ⚠️ EVERY BONE'S AXIS IS DERIVED PARENT-TO-CHILD, NEVER FROM A CONVENTION. Assuming one has
 * already shipped a bug on this rig — `mesh-identity.js` records a shoulder cap pushed down the
 * bicep because someone read the arm bone's +Y as "up". Measured here, `LeftArm`'s local +Y points
 * (0.187, -0.969, -0.158) in world space: straight DOWN the limb.
 *
 * The convention happens to hold in BONE-LOCAL space for the limb chain — 14 of 24 bones report a
 * down-limb axis of exactly (0, 1, 0) — and it fails badly for the ones the spec cares about
 * most: `Hips` derives (-0.048, 0.208, -0.977), i.e. very nearly -Z, and `LeftHand`,
 * `LeftToeBase`, `Spine` and `Head` are all off-axis. Anything written against +Y would have been
 * right on the arms and silently wrong on the waist and the head.
 */
function boneAxisTable(skeleton) {
  const bones = skeleton.bones;
  const indexOf = new Map(bones.map((b, i) => [b.name, i]));
  const kidsOf = bones.map(() => []);
  bones.forEach((b, i) => {
    const p = b.parent && indexOf.get(b.parent.name);
    if (p !== undefined && p !== null && bones[p] === b.parent) kidsOf[p].push(i);
  });

  const uniformScale = (m) => {
    const s = new THREE.Vector3();
    m.decompose(new THREE.Vector3(), new THREE.Quaternion(), s);
    return (s.x + s.y + s.z) / 3 || 1;
  };
  const scales = bones.map((b) => uniformScale(b.matrixWorld.clone()));
  const inv = bones.map((b) => b.matrixWorld.clone().invert());
  /** Bone `j`'s origin expressed in bone `i`'s frame, in metres of the finished character. */
  const originIn = (i, j) => new THREE.Vector3()
    .setFromMatrixPosition(bones[j].matrixWorld)
    .applyMatrix4(inv[i])
    .multiplyScalar(scales[i]);

  return bones.map((b, i) => {
    const kids = kidsOf[i];
    const axis = new THREE.Vector3();
    let len = 0;
    let from;
    if (kids.length === 1) {
      axis.copy(originIn(i, kids[0]));
      len = axis.length();
      from = `child ${bones[kids[0]].name}`;
    } else if (kids.length > 1) {
      // A fork — Hips, Spine, Head. There is no single down-bone direction, so this is the mean
      // and it is FLAGGED rather than quietly served as if it were one.
      for (const k of kids) axis.add(originIn(i, k).normalize());
      len = kids.reduce((a, k) => a + originIn(i, k).length(), 0) / kids.length;
      from = `mean of ${kids.length} children`;
    } else if (b.parent && bones[indexOf.get(b.parent.name)] === b.parent) {
      // A LEAF still gets a parent-to-child axis. It simply IS the child.
      const p = indexOf.get(b.parent.name);
      axis.copy(originIn(i, i).sub(originIn(i, p)));
      len = axis.length();
      from = `parent ${b.parent.name}`;
    } else { axis.set(0, 1, 0); len = 0; from = 'root (no parent, no child)'; }
    const forked = kids.length > 1;
    if (axis.lengthSq() > 1e-12) axis.normalize(); else axis.set(0, 1, 0);
    return {
      id: i, name: b.name, axis: axis.toArray(), len, from, forked, scale: scales[i],
    };
  });
}

/**
 * How close the top two skin weights have to be before a vertex has no single bone frame.
 * NOT a tuning knob — it is the threshold the plan named, and the sweep across 2/5/10/15/25/40%
 * is reported in the summary so the next round can pick its own.
 */
const AMBIGUOUS_TOL = 0.15;

/**
 * THE CONTROL, and it is the one the plan says the attribute cannot be trusted without: a vertex
 * on the forearm must report a bone-local position no longer than the forearm itself. If the
 * frame is wrong, every detail built on it is wrong in the same invisible way — a ring drawn at
 * "3 cm below the elbow" simply lands somewhere else and still renders as a plausible ring.
 *
 * ⚠️ THE THRESHOLD IS 1.5 AND NOT 1.0, AND THE REASON IS GEOMETRY RATHER THAN SLACK. A vertex is
 * on the SURFACE, so at the wrist end it sits at (bone length) along the axis and (limb radius)
 * out from it: |aBoneLocal| = sqrt(len² + r²). Measured on this rig that is 1.022 (left) and
 * 0.995 (right) — the forearm's own 7 cm radius, not an error. The same vertices measured in the
 * UPPER ARM's frame — the nearest wrong answer, the one a sign slip or an off-by-one would
 * produce — come out at 2.164 and 2.140. The gap between 1.02 and 2.14 is what this guard is
 * separating, and 1.5 sits in the middle of it.
 */
const FOREARM_MAX_RATIO = 1.5;

/**
 * Compute and attach `aBoneLocal` / `aBoneId` (and the second-influence pair) on every skinned
 * mesh under `rig`. Returns the summary the next round consumes.
 *
 * Runs over the KIT PARTS too, not just the body. They bind to the same skeleton with the same
 * bind matrix (`mesh-identity.js` `skinToBody`), and they share materials with the body — the ear
 * disc and the visor bezel are both `mats.shell`. A shader reading an attribute that exists on
 * one mesh and not another gets an undefined value on the second, which WebGL serves as zero:
 * "distance along the bone is 0", i.e. every joint detail painted straight onto the kit.
 */
/*
 * ⚠️ EXPORTED BECAUSE `mesh.animated` DOES NOT COME THROUGH THIS FILE. That view loads the GLB
 * itself and calls `attachIdentity` directly, so the attributes are on the GAME avatar and NOT on
 * the view the fine detail will actually be judged in — the only one carrying `?azim=`. Wiring it
 * is one import and one call after that view's own `attachIdentity`, and it is left to the owner
 * of `src/views/mesh-animated.js` rather than reached into from here.
 */
export function attachBoneLocal(rig) {
  rig.updateWorldMatrix(true, true);
  const skins = [];
  rig.traverse((o) => { if (o.isSkinnedMesh && o.skeleton) skins.push(o); });
  if (!skins.length) throw new Error('mesh-avatar: no SkinnedMesh to compute aBoneLocal on');

  const skeleton = skins[0].skeleton;
  for (const m of skins) {
    if (m.skeleton !== skeleton) {
      throw new Error(`mesh-avatar: "${m.name}" binds a DIFFERENT skeleton from "${skins[0].name}", ` +
        'so one aBoneId means two different bones depending on which mesh a fragment came from.');
    }
  }

  const frames = boneAxisTable(skeleton);
  const inverses = skeleton.boneInverses;
  const tmp = new THREE.Vector3();

  // Per-bone stats, accumulated across every mesh so the control sees the whole forearm.
  const stat = frames.map(() => ({ n: 0, maxLen: 0, lo: Infinity, hi: -Infinity }));
  const ambTol = [0.02, 0.05, 0.10, AMBIGUOUS_TOL, 0.25, 0.40];
  const ambAt = ambTol.map(() => 0);
  const ambPairs = new Map();
  let ambiguous = 0;
  let total = 0;

  for (const mesh of skins) {
    const geo = mesh.geometry;
    const pos = geo.attributes.position;
    const si = geo.attributes.skinIndex;
    const sw = geo.attributes.skinWeight;
    if (!pos || !si || !sw) {
      throw new Error(`mesh-avatar: skinned mesh "${mesh.name}" carries no skinIndex/skinWeight, ` +
        'so it has no dominant bone and aBoneLocal cannot be computed for it.');
    }
    const bind = mesh.bindMatrix;
    const n = pos.count;
    const aLocal = new Float32Array(n * 3);
    const aId = new Float32Array(n);
    const aLocal2 = new Float32Array(n * 3);
    const aId2 = new Float32Array(n);
    const aBlend = new Float32Array(n);
    /*
     * ⚠️ `aBoneEnd` — THE ONE DERIVED QUANTITY THAT IS COMPUTED HERE RATHER THAN IN THE SHADER,
     * AND THE REASON IS NOT COST. It is `vec2(d, len - d)`: metres from this bone's PROXIMAL
     * joint along its own axis, and metres from its DISTAL one.
     *
     * Everything in it is static — `aBoneLocal` is bind-pose data and the axis is a property of
     * the bone — so a shader would have to carry a `vec4[64]` of axes to recompute per frame what
     * is knowable once. But the deciding argument is CONTINUITY, not arithmetic:
     *
     *   A ring at the elbow is drawn on vertices belonging to TWO bones. On the forearm it sits
     *   at d ~ 0 in the FOREARM's frame; on the upper arm at len - d ~ 0 in the UPPER ARM's. A
     *   varying carrying raw `d` would interpolate 0.01 against 0.28 across the boundary triangle
     *   and the ring would tear. Carrying the distance TO THE NEAREST END makes both ~0.01, so
     *   the varying is continuous across the joint the detail is drawn on.
     *
     * ✅ AND IT IS ITS OWN FAIL-SAFE. `x + y === len` by construction, so the sum is positive on
     * any real bone and EXACTLY ZERO on a mesh that never came through here (a missing attribute
     * reads as 0 in WebGL, not as an error). `robot.js` gates the whole feature on that sum, so
     * an unattached mesh draws no rings rather than drawing one at every fragment — which is what
     * a naive "distance is 0, so we are at the joint" test would have done to the procedural
     * robot and all three hunters.
     */
    const aEnd = new Float32Array(n * 2);

    for (let i = 0; i < n; i++) {
      let w0 = -1; let w1 = -1; let b0 = 0; let b1 = 0;
      for (let c = 0; c < 4; c++) {
        const w = sw.getComponent(i, c);
        const b = si.getComponent(i, c);
        if (w > w0) { w1 = w0; b1 = b0; w0 = w; b0 = b; } else if (w > w1) { w1 = w; b1 = b; }
      }
      if (w1 <= 0) { w1 = 0; b1 = b0; }
      if (b0 >= frames.length || b1 >= frames.length) {
        throw new Error(`mesh-avatar: "${mesh.name}" vertex ${i} names bone ${Math.max(b0, b1)} ` +
          `on a ${frames.length}-bone skeleton.`);
      }

      const write = (bi, out) => {
        tmp.fromBufferAttribute(pos, i).applyMatrix4(bind).applyMatrix4(inverses[bi])
          .multiplyScalar(frames[bi].scale);
        out[i * 3] = tmp.x; out[i * 3 + 1] = tmp.y; out[i * 3 + 2] = tmp.z;
        return tmp;
      };
      /*
       * ⚠️ THE STATS ARE TAKEN BEFORE THE SECOND INFLUENCE IS WRITTEN, and the ordering is load
       * bearing: `write` returns the shared scratch vector, so computing the second bone's local
       * position first silently replaces the first one's. Written the other way round this
       * measured every vertex against the WRONG bone and the forearm control below caught it —
       * ratio 1.69 against a 1.5 limit, on a build whose ear, clips and geometry were all fine.
       * The guard earning its keep on the first run is worth recording.
       */
      const local0 = write(b0, aLocal);
      aId[i] = b0;
      const s = stat[b0];
      s.n++;
      s.maxLen = Math.max(s.maxLen, local0.length());
      const d = local0.x * frames[b0].axis[0] + local0.y * frames[b0].axis[1]
        + local0.z * frames[b0].axis[2];
      s.lo = Math.min(s.lo, d); s.hi = Math.max(s.hi, d);
      // See aEnd's declaration. Signed on purpose: a vertex can sit BEHIND its bone's origin
      // (the shoulder cap over the top of the arm bone), and clamping that to 0 would put it in
      // the middle of the joint ring instead of outside it.
      aEnd[i * 2] = d;
      aEnd[i * 2 + 1] = frames[b0].len - d;

      write(b1, aLocal2);
      aId2[i] = b1;
      aBlend[i] = w0 + w1 > 0 ? w1 / (w0 + w1) : 0;

      total++;
      for (let t = 0; t < ambTol.length; t++) if (w1 > 0 && (w0 - w1) <= ambTol[t] * w0) ambAt[t]++;
      if (w1 > 0 && (w0 - w1) <= AMBIGUOUS_TOL * w0) {
        ambiguous++;
        const key = [frames[b0].name, frames[b1].name].sort().join(' / ');
        ambPairs.set(key, (ambPairs.get(key) ?? 0) + 1);
      }
    }

    geo.setAttribute('aBoneLocal', new THREE.BufferAttribute(aLocal, 3));
    // A PLAIN float, deliberately not a normalised integer: `robot.js` already records that an
    // exact == on a float that round-tripped through a normalised attribute is a coin flip on
    // some drivers, which is why its own bone test is a `step(abs(...), 0.4)`.
    geo.setAttribute('aBoneId', new THREE.BufferAttribute(aId, 1));
    geo.setAttribute('aBoneLocal2', new THREE.BufferAttribute(aLocal2, 3));
    geo.setAttribute('aBoneId2', new THREE.BufferAttribute(aId2, 1));
    geo.setAttribute('aBoneBlend', new THREE.BufferAttribute(aBlend, 1));
    geo.setAttribute('aBoneEnd', new THREE.BufferAttribute(aEnd, 2));
  }

  // ---- THE CONTROL. See FOREARM_MAX_RATIO above for why the number is 1.5 and not 1.
  const forearms = [];
  for (const name of ['LeftForeArm', 'RightForeArm']) {
    const f = frames.find((x) => x.name === name);
    if (!f) continue;
    const s = stat[f.id];
    if (!s.n || !(f.len > 0)) continue;
    const ratio = s.maxLen / f.len;
    forearms.push({ name, verts: s.n, len: f.len, maxLocal: s.maxLen, ratio, axialLo: s.lo, axialHi: s.hi });
    if (!(ratio < FOREARM_MAX_RATIO)) {
      throw new Error(`mesh-avatar: aBoneLocal on ${name} reaches ${s.maxLen.toFixed(4)} m from ` +
        `the joint on a bone that is only ${f.len.toFixed(4)} m long (ratio ${ratio.toFixed(3)}, ` +
        `limit ${FOREARM_MAX_RATIO}). The bone frame is wrong, so every detail placed by distance ` +
        'along a bone would land somewhere else and still render as a plausible detail.');
    }
  }
  if (!forearms.length) {
    throw new Error('mesh-avatar: neither LeftForeArm nor RightForeArm carries any vertices, so ' +
      'the aBoneLocal frame control could not run at all. An unverified frame is not a passing one.');
  }

  const bones = frames.map((f, i) => ({
    id: f.id,
    name: f.name,
    axis: f.axis.map((v) => +v.toFixed(4)),
    len: +f.len.toFixed(4),
    from: f.from,
    forked: f.forked,
    verts: stat[i].n,
    axial: stat[i].n ? [+stat[i].lo.toFixed(4), +stat[i].hi.toFixed(4)] : null,
  }));
  return {
    attributes: ['aBoneLocal', 'aBoneId', 'aBoneLocal2', 'aBoneId2', 'aBoneBlend', 'aBoneEnd'],
    units: 'metres of the finished character; origin at the bone joint',
    meshes: skins.map((m) => m.name),
    vertices: total,
    bones,
    forearms,
    ambiguous,
    ambiguousPct: +(100 * ambiguous / total).toFixed(2),
    ambiguousTol: AMBIGUOUS_TOL,
    ambiguousSweep: ambTol.map((t, i) => [t, ambAt[i], +(100 * ambAt[i] / total).toFixed(2)]),
    ambiguousPairs: [...ambPairs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14),
  };
}

/** Which mesh bones a socket owns, for hiding a limb that has been knocked off. */
const SOCKET_BONES = {
  shoulderL: ['LeftArm'],
  shoulderR: ['RightArm'],
  hipL: ['LeftUpLeg'],
  hipR: ['RightUpLeg'],
};

const BLEND = 0.18;

export async function createMeshAvatar(opts = {}) {
  const H = opts.height ?? 1.7;
  const mats = opts.materials;
  const base = opts.base ?? '/models/anim';

  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(`${base}/${CLIP_FILE}`);
  const rig = gltf.scene;
  const byName = new Map((gltf.animations ?? []).map((a) => [a.name, a]));
  const missing = [...Object.values(CLIPS), ...SWINGS.map((w) => w.clip)].filter((n) => !byName.has(n));
  if (missing.length) {
    throw new Error(`mesh-avatar: ${CLIP_FILE} is missing clips ${missing.join(', ')}. ` +
      `It carries: ${[...byName.keys()].join(', ') || '(none)'}`);
  }

  // Same normalisation as `mesh-animated.js`: measure the BIND box, scale to contract height,
  // drop the feet onto y=0. A skinned asset skips the conditioner (it would join the meshes and
  // destroy the binding), so this is where the contract gets applied.
  rig.updateWorldMatrix(true, true);
  const b0 = new THREE.Box3().setFromObject(rig);
  const h0 = b0.max.y - b0.min.y;
  if (!(h0 > 0)) throw new Error('mesh-avatar: the loaded character has zero height');
  rig.scale.setScalar(H / h0);
  rig.updateWorldMatrix(true, true);
  const b1 = new THREE.Box3().setFromObject(rig);
  rig.position.set(0, -b1.min.y, 0);
  rig.updateWorldMatrix(true, true);

  /*
   * THE PANEL-SEAM NETWORK, AND WHY IT ONCE HAD TO BE SWITCHED OFF ON THIS BODY.
   *
   * `robot.js` bakes the seams in UV SPACE — correct, because a world- or object-space pattern
   * swims across a skinned mesh as it walks. It reads as proper machined plating on the
   * procedural robot, which has an authored unwrap. This GLB does not: Meshy's atlas is **405
   * charts, median 14 cm across, at arbitrary orientations**, so each chart receives a line or
   * two at whatever angle it happens to carry and the result reads as CRAZED GLAZE — cracked
   * porcelain, not panelling. The measurements all passed while it did: seam density 13.0–14.6%
   * against the art's 12.1–13.6%, value spread 163–166 against ~159, and facet energy 17.9–18.7
   * against the art's 9–12 is the one column that caught it.
   *
   * ⚠️ PARTLY FIXED UPSTREAM, AND THIS COMMENT PREVIOUSLY OVERCLAIMED IT. `tools/unwrap_player.py`
   * does what it says — uv density spread 1.689 -> 1.094, so plate size is uniform across the body
   * and the pattern is axis-aligned instead of randomly angled. It did NOT fix the surface. A
   * critic re-measured the number that diagnosed the original defect:
   *
   *     facet energy   pre-unwrap 17.9-18.7   post-unwrap 17.6-19.2   art 8.3-12.3
   *
   * Unmoved. The failure changed appearance — crazed glaze became an axis-aligned graph-paper grid
   * stamped across a curved body — but it is the same defect. The UV-space statistic improved and
   * the IMAGE-space one did not, which is the whole lesson: the unwrap was necessary and was not
   * sufficient. Root cause is now believed to be the MESH: a curvature-driven cavity term running
   * on a 10,378-triangle faceted body fires at every triangle edge, giving 1-2 px dark speckle
   * where the art has 10-16 px plate channels.
   *
   * Seams are ON by default; `?meshseams=0` is the A/B back to the plain shell.
   */
  /*
   * ⚠️ THE BAKED PANEL GRID IS OFF ON THIS BODY BY JOHN'S CALL: "there are still lots of out of
   * place black lines all over the model."
   *
   * He is right and the reason is structural, not a tuning miss. The grid is drawn in UV SPACE, so
   * it is a regular lattice laid over a body whose actual plate boundaries are somewhere else
   * entirely. The cube-projection unwrap made the lattice AXIS-ALIGNED, which stopped it reading
   * as cracked glaze — but axis-aligned wrong lines are still wrong lines, and the last builder
   * round made them fewer, longer and wider, which made each surviving one MORE conspicuous.
   *
   * A procedural grid cannot know where this character's plates are. The reference gets its darks
   * from somewhere else: a SECOND, MUCH DARKER MATERIAL on the arms, waist and inner thighs, with
   * the white plates left nearly unbroken. That is the direction, not a finer grid.
   *
   * Everything else from that round SURVIVES this switch — the warm tint (R-B 0.1 -> 10.3 against
   * the art's 10.5-11.0), the cleaned head, and the fix for an albedo-clipping bug that was
   * painting a pure-black hole around the visor bezel.
   *
   * The PROCEDURAL robot keeps its seams: it has an authored unwrap and they read as plating
   * there. `?meshseams=1` puts them back on this body for an A/B.
   */
  const bodyShell = urlNum('meshseams', 0) > 0
    ? mats.shell
    : shellWhite({ seam: 0, size: 512 });

  /*
   * ⚠️ A BODY THAT ARRIVES WITH ITS OWN BAKED TEXTURE KEEPS IT.
   *
   * The line below used to overwrite EVERY body's material with the project's white shell
   * unconditionally, which was right while the only body was the Lumi Bot — that asset has one
   * primitive and zero material slots, so there was nothing to overwrite. The Friendly Robot
   * arrives textured, and it is textured that John looked at and approved. Overwriting it would
   * have shipped a robot he has never seen and quietly discarded the thing he chose.
   *
   * `?meshbaked=0` forces the old behaviour on any body, which is the A/B for "is the baked
   * texture actually better than our shell".
   */
  const keepBaked = urlNum('meshbaked', 1) > 0;

  let skinned = 0;
  let baked = 0;
  rig.traverse((o) => {
    if (!o.isMesh && !o.isSkinnedMesh) return;
    if (keepBaked && o.material?.map) {
      chromeDarkPanels(o.material);
      baked++;
    } else {
      o.material = bodyShell;
    }
    o.castShadow = true;
    o.receiveShadow = true;
    // A skinned bounding sphere is the BIND one, so a limb thrown wide by a clip gets culled and
    // the character loses an arm at certain camera angles.
    o.frustumCulled = false;
    if (o.isSkinnedMesh) skinned++;
  });
  if (!skinned) throw new Error('mesh-avatar: no SkinnedMesh — this is not a rigged file');
  if (keepBaked && baked === 0 && CLIP_FILE !== 'player_norm30.glb') {
    // Not fatal — the Lumi Bot legitimately has no map — but on a body that is supposed to be
    // textured this means the map did not load and the shell silently stood in for it.
    console.warn(`[mesh-avatar] ${CLIP_FILE} has no baked colour map; falling back to the shell`);
  }
  if (baked) console.log(`[mesh-avatar] kept baked texture on ${baked} mesh(es), dark panels -> chrome`);

  const identity = baked ? attachWordmarkOnly(rig, mats, H) : attachIdentity(rig, mats, H);

  /*
   * ⚠️ AFTER `attachIdentity`, AND BEFORE THE MIXER. Two orderings that both matter:
   *
   *   AFTER the kit, so the ear ring, the mint caps and the wordmark carry the attribute too.
   *   They share materials with the body, and a shader reading an attribute that one mesh lacks
   *   gets zero rather than an error — "distance along the bone is 0" on every kit part.
   *
   *   BEFORE the mixer, because `aBoneLocal` is measured in the BIND POSE and the first
   *   `mixer.update()` moves every bone. The values would still be self-consistent, but the
   *   FRAME table's axes and lengths would be a snapshot of whatever frame of `Alert` happened
   *   to be playing.
   */
  const boneLocal = attachBoneLocal(rig);

  const bones = {};
  rig.traverse((o) => { if (o.isBone) bones[o.name] = o; });

  const hips = bones.Hips;
  const hipsRest = hips ? hips.position.clone() : null;

  const mixer = new THREE.AnimationMixer(rig);
  const actions = {};
  const actionKeys = [...Object.keys(CLIPS), ...SWINGS.map((w) => w.clip)];
  const clipOf = (k) => byName.get(CLIPS[k] ?? k);
  actionKeys.forEach((n) => {
    const clip = clipOf(n);
    if (!clip) return;
    const a = mixer.clipAction(clip);
    a.enabled = true;
    a.setEffectiveWeight(n === 'idle' ? 1 : 0);
    a.play();
    actions[n] = a;
  });
  for (const [k, name] of Object.entries(SIT_CLIPS)) {
    const clip = byName.get(name);
    if (!clip) continue;
    const a = mixer.clipAction(clip);
    a.enabled = true;
    a.setEffectiveWeight(0);
    a.play();
    actions[k] = a;
  }
  if (!actions.idle) throw new Error('mesh-avatar: the idle clip carries no animation');

  let current = 'idle';
  let mounted = null;
  let mountScaleK = 1;
  let mountGrip = { ...GRIP_MOUNT };
  let activeSwing = SWINGS[0];
  /*
   * ⚠️ COLLAPSED BONES ARE RE-APPLIED EVERY FRAME, AFTER THE MIXER, AND THAT IS THE WHOLE POINT.
   * Setting a bone's scale once does nothing lasting: the clips carry scale tracks, so
   * `mixer.update()` writes over it on the very next frame and the limb pops straight back on.
   * John reported the mesh not changing when an arm came off — this is why.
   */
  const collapsed = new Set();

  /*
   * THE CONTROL FOR LOCOMOTION CLIPS. The game owns where the character is and which way it
   * faces; a clip that turns the body fights it, and the player walks forward while the robot
   * aims off to one side. Measured from the clip's own Hips quaternion track — first keyframe
   * against last — so it catches a turning clip at LOAD, by name, before anyone plays it.
   *
   * The swing is exempt: an attack is allowed to rotate the body, and it returns.
   */
  const yawDriftDeg = (clip) => {
    const track = clip.tracks.find((t) => /hips.quaternion$/i.test(t.name));
    if (!track || track.values.length < 8) return 0;
    const yawOf = (i) => {
      const [x, y, z, w] = [0, 1, 2, 3].map((k) => track.values[i * 4 + k]);
      return Math.atan2(2 * (w * y + x * z), 1 - 2 * (y * y + x * x)) * 180 / Math.PI;
    };
    let d = yawOf(track.values.length / 4 - 1) - yawOf(0);
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    return d;
  };
  for (const key of ['idle', 'walk', 'run', 'idleHold', 'walkHold']) {
    const drift = yawDriftDeg(byName.get(CLIPS[key]));
    if (Math.abs(drift) > 25) {
      throw new Error(`mesh-avatar: locomotion clip "${CLIPS[key]}" (${key}) turns the body ` +
        `${drift.toFixed(1)} deg over its length. The game owns facing; a turning clip makes the ` +
        `character walk forward while aiming sideways.`);
    }
  }

  for (const w of SWINGS) {
    if (!actions[w.clip]) throw new Error(`mesh-avatar: swing clip "${w.clip}" has no action`);
  }

  return {
    root: rig,
    bones,
    mixer,

    /**
     * WHICH FILE THIS ACTUALLY IS, and what came in it.
     *
     * Published because `?player=` exists: a probe that asserts on the shipped body must read the
     * body that LOADED, not the constant it expected to load. This file already records four
     * captures that came back byte-identical because a sweep set a parameter the view never read.
     */
    sourceFile: CLIP_FILE,
    clipNames: [...byName.keys()],

    /**
     * The fine-detail plumbing, for the shader round that consumes it.
     *
     *   boneLocal.bones[id]   { name, axis, len, from, forked, verts, axial }
     *                         `axis` is the DOWN-BONE direction in that bone's OWN local frame,
     *                         derived parent-to-child. `axial` is the [lo, hi] range of
     *                         dot(aBoneLocal, axis) actually observed on that bone's vertices —
     *                         so "3 cm below the elbow" is literally
     *                         `dot(aBoneLocal, axis) in [0.02, 0.04]` on LeftForeArm, whose
     *                         measured range is -0.003 .. 0.268 against a 0.266 m bone.
     *   boneLocal.ambiguous   vertices with no single frame — see the note on AMBIGUOUS_TOL.
     */
    boneLocal,
    /** What `attachIdentity` built and measured — the ear, the caps, the face, the wordmark. */
    identity,

    /** Which clip is playing, for a HUD or a test to assert on. */
    get clip() { return current; },

    /**
     * Hang a held prop off the hand bone via `mountInHand` — the same primitive `char.grip`
     * uses, so product play cannot silently restale the pickup lock.
     *
     * ⚠️ THIS REPLACES `SledgeRig`'s IK PLACEMENT RATHER THAN COMPETING WITH IT. The caller must
     * also stop the rig owning the transform (`sledge.ownsProp = false`), or the two write
     * `root.position` in different frames on alternate lines of the same tick and the hammer
     * jitters between a hand and a chest.
     */
    mountProp(obj, { hand = 'RightHand' } = {}) {
      const b = bones[hand];
      if (!b || !obj) return false;
      /*
       * Product play uses the SAME primitive as `char.grip`. Address-bar knobs override
       * GRIP_MOUNT for an A/B; absent, this is John's pickup lock.
       */
      const g = gripFromUrl();
      const placed = mountInHand(obj, { bone: b, height: H, ...g });
      if (!placed) return false;
      mountScaleK = placed.k;
      mountGrip = {
        roll: placed.roll, tilt: placed.tilt, yaw: placed.yaw,
        palm: placed.palm, reach: placed.reach, depth: placed.depth,
        alongHaft: placed.alongHaft,
      };
      mounted = obj;
      return true;
    },

    unmountProp() {
      if (mounted) { mounted.removeFromParent(); mounted = null; }
    },

    get propMounted() { return !!mounted; },

    /**
     * Rebuild the fist-frame Euler + offsets on the mounted prop. `roll` / `alongHaft` are
     * the historical two-arg form (playAttack restales roll per clip); omit them to keep
     * the current lock. Extra keys overlay GRIP_MOUNT.
     */
    setGrip(roll, alongHaft, extra = {}) {
      if (!mounted) return false;
      const g = {
        ...GRIP_MOUNT,
        ...mountGrip,
        roll: roll ?? urlNum('grip', activeSwing.grip),
        alongHaft: alongHaft ?? mountGrip.alongHaft ?? GRIP_MOUNT.alongHaft,
        ...extra,
      };
      applyGripLocal(mounted, { k: mountScaleK, height: H, ...g });
      mounted.updateWorldMatrix(true, true);
      mountGrip = g;
      return true;
    },

    /**
     * Start the swing. `dur` is the game's own swing length, and the clip is retimed to match it
     * so `CONTACT_PHASE` still lands where the hammer is actually at the wall — the damage and
     * the picture stay the same event rather than drifting apart.
     */
    /** Which swing is playing, and where its head arrives — the caller feeds this to SledgeRig. */
    get swing() { return activeSwing; },

    playAttack(dur) {
      /*
       * ⚠️ THE GRIP IS RE-APPLIED PER SWING, because it is a property of the CLIP. Picking a new
       * swing without re-rolling the hammer would put one clip's solved face angle on another
       * clip's arc — which is exactly how a 90-degree error ships without anyone touching a
       * constant.
       *
       * `?swingpick=N` forces SWINGS[N] so a harness can freeze Heavy vs Attack instead of
       * hoping the random pick landed on the clip it named.
       */
      const pick = urlNum('swingpick', -1);
      activeSwing = (pick >= 0 && pick < SWINGS.length)
        ? SWINGS[pick]
        : SWINGS[Math.floor(Math.random() * SWINGS.length)];
      this.setGrip(urlNum('grip', activeSwing.grip));
      const a = actions[activeSwing.clip];
      a.reset();
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
      a.enabled = true;
      const clipDur = a.getClip().duration;
      a.setEffectiveTimeScale(dur > 0 ? clipDur / dur : 1);
      a.setEffectiveWeight(1);
      a.play();
      current = activeSwing.clip;
    },

    /**
     * @param {number} dt      seconds
     * @param {object} state   { speed, runAt, swinging }
     */
    update(dt, state = {}) {
      const speed = state.speed ?? 0;
      const runAt = state.runAt ?? 2.6;

      /*
       * CLIP CHOICE IS A FUNCTION OF SPEED ALONE, and the thresholds are fractions of the run
       * speed the caller reports rather than absolute m/s — so retuning `MOVE` in `rules.js`
       * cannot silently leave the character running on the spot at a walk.
       *
       * The swing OVERRIDES it: mid-swing the character is swinging, whatever its feet are doing.
       */
      /*
       * ⚠️ STANDING STILL HOLDING A SLEDGEHAMMER HAS NO CLIP, AND THIS IS A STOPGAP THAT SAYS SO.
       *
       * John: "the way idle sledge holding position is weird. It doesn't match the grip you would
       * expect." He is right and there is nothing in the set that fixes it properly — `alert` is
       * a ready stance with EMPTY hands, so a hammer in it reads as a hammer someone forgot they
       * were carrying. The real fix is to GENERATE an idle-holding clip; that is a pipeline job,
       * not a code job, and it is named in the handoff as the next asset to make.
       *
       * Until then, hold a FRAME OF THE ATTACK CLIP instead: it is the one animation authored
       * around a two-handed swing, so its stance at least agrees with what the character is about
       * to do. `?ready=` scrubs which frame, because picking it is a taste call and John is the
       * one who can make it — scrub, find one, and it gets baked.
       */
      const holding = !!mounted;
      const still = speed < runAt * 0.10;
      const want = state.swinging ? activeSwing.clip
        : (still ? (holding ? 'idleHold' : 'idle')
          : (speed < runAt * 0.62 ? (holding ? 'walkHold' : 'walk') : 'run'));
      if (want !== current && actions[want]) current = want;

      for (const n of Object.keys(actions)) {
        const target = n === current ? 1 : 0;
        const w = actions[n].getEffectiveWeight();
        actions[n].setEffectiveWeight(w + (target - w) * Math.min(1, dt / BLEND));
      }
      /*
       * ⚠️ THE RUN CLIP IS PLAYED AT THE SPEED THE PLAYER IS ACTUALLY MOVING. A locomotion clip
       * played at its authored rate while the body travels at another is the classic foot skate,
       * and this project already owns a `footskate.mjs` because that class of defect is easy to
       * ship and hard to un-see. `1.0` at the clip's own reference speed, clamped so a crawl does
       * not stall the cycle to a slideshow.
       */
      const ref = current === 'run' ? runAt : runAt * 0.42;
      const rate = current === 'idle' ? 1 : THREE.MathUtils.clamp(speed / ref, 0.55, 1.65);
      // The attack is excluded: `playAttack()` set its rate to match the game's swing length, and
      // re-rating it to the player's walking speed would slide contact off the wall.
      const swingClips = new Set(SWINGS.map((w) => w.clip));
      for (const n of Object.keys(actions)) {
        if (!swingClips.has(n)) actions[n].setEffectiveTimeScale(rate);
      }
      /*
       * The held ready pose is a FROZEN frame, so the action is parked rather than played: rate 0
       * and the time written directly. Set once per frame because the mixer advances `time` from
       * whatever it was, and a rate of exactly 0 is not something to rely on staying exact.
       */
      /*
       * The frozen-attack-frame stopgap is GONE. It existed because nothing in the four-clip set
       * showed the character standing still holding a two-handed weapon — John's "the idle sledge
       * holding position is weird". `Axe_Stance` and `Walk_Turn_Left_with_Weapon` are that, so
       * the character now has a real held pose instead of a paused swing. `?ready=` is retired.
       */

      mixer.update(dt);

      /*
       * IN PLACE. The clips carry root translation; the GAME owns where the character is, and
       * two systems moving the same body fight. Y is left alone — that is the cycle's bob, which
       * is part of what makes the walk read as weight.
       */
      if (hips && hipsRest) { hips.position.x = hipsRest.x; hips.position.z = hipsRest.z; }

      // Missing limbs, re-asserted after the mixer has had its say. See `collapsed` above.
      for (const name of collapsed) bones[name]?.scale.setScalar(1e-4);
    },

    /**
     * Hide the mesh's own limb when the game detaches one. The flying limb itself is still the
     * procedural `LimbItem` — it is a separate object the moment it comes off, so nothing about
     * it needs the generated mesh.
     *
     * Scaling the bone to nothing rather than hiding a mesh, because the limb is SKINNED: there
     * is no separate object to hide, only vertices weighted to that bone. Collapsing the bone
     * pulls them into the joint and the limb disappears into the socket.
     */
    setLimbVisible(socket, visible) {
      for (const name of SOCKET_BONES[socket] ?? []) {
        if (!bones[name]) continue;
        if (visible) collapsed.delete(name); else collapsed.add(name);
      }
    },

    dispose() {
      mixer.stopAllAction();
      rig.traverse((o) => { if (o.isMesh || o.isSkinnedMesh) o.geometry?.dispose?.(); });
    },

    /**
     * Clips, exposed so `cloneMeshAvatar` can retarget them onto a skinned clone without a
     * second 9 MB fetch. The runner already paid for this file during the lobby bake.
     */
    actions,
  };
}

/**
 * 🎭 **A SECOND MESHY BODY THAT SHARES THE RUNNER'S FILE.**
 *
 * The intros need one robot per joined phone. Fetching `friendly_all38.glb` per seat would
 * be eight copies of a 9 MB download on the TV's already-warm context. `SkeletonUtils.clone`
 * copies the skeleton and the scene graph; the GLB's geometries stay SHARED with the source,
 * which is why `intro-bed.js` must not dispose them (see that file's `dispose`).
 *
 * Intros only need idle + walk. Attack / prop / limb collapse stay on the runner's original.
 * Materials are cloned before tinting so a red seat cannot recolour the runner.
 *
 * @param {object} source  a `createMeshAvatar()` result
 * @param {object} [opts]
 * @param {string} [opts.shell]   lobby shell hex
 * @param {string} [opts.accent]  lobby accent hex
 */
export function cloneMeshAvatar(source, opts = {}) {
  if (!source?.root || !source.actions?.idle || !source.actions?.walk) return null;
  const rig = cloneSkinned(source.root);
  rig.traverse((o) => {
    if (!o.isMesh && !o.isSkinnedMesh) return;
    o.userData.sharedGeo = true;
    o.frustumCulled = false;
    if (o.material) {
      o.material = Array.isArray(o.material)
        ? o.material.map((m) => m.clone())
        : o.material.clone();
    }
  });
  tintIntroRig(rig, opts.shell, opts.accent);

  const mixer = new THREE.AnimationMixer(rig);
  const idle = mixer.clipAction(source.actions.idle.getClip());
  const walk = mixer.clipAction(source.actions.walk.getClip());
  idle.enabled = true; walk.enabled = true;
  idle.setEffectiveWeight(1); walk.setEffectiveWeight(0);
  idle.play(); walk.play();

  const sitIdleM = source.actions.sitIdleM
    ? mixer.clipAction(source.actions.sitIdleM.getClip()) : null;
  const sitIdleF = source.actions.sitIdleF
    ? mixer.clipAction(source.actions.sitIdleF.getClip()) : null;
  const sitDown = source.actions.sitDown
    ? mixer.clipAction(source.actions.sitDown.getClip()) : null;
  for (const a of [sitIdleM, sitIdleF, sitDown]) {
    if (!a) continue;
    a.enabled = true;
    a.setEffectiveWeight(0);
    a.play();
  }

  const hips = (() => {
    let found = null;
    rig.traverse((o) => { if (o.isBone && o.name === 'Hips') found = o; });
    return found;
  })();
  const hipsRest = hips ? hips.position.clone() : null;
  const leanBones = [];
  rig.traverse((o) => {
    if (o.isBone && SIT_LEAN_BONES.includes(o.name)) leanBones.push(o);
  });
  const leanRest = leanBones.map((bone) => ({ bone, q: new THREE.Quaternion() }));
  let leanFrozen = false;

  let pose = 'loco';
  let sitClipName = null;
  let sitIdle = null;

  function captureLean() {
    for (const row of leanRest) row.q.copy(row.bone.quaternion);
    leanFrozen = true;
  }
  function applyLean() {
    if (!leanFrozen) return;
    for (const row of leanRest) row.bone.quaternion.copy(row.q);
  }

  return {
    root: rig,
    sourceFile: source.sourceFile,
    cloned: true,
    get clip() {
      if (pose === 'sit') return sitClipName || (sitIdle?.getClip?.().name ?? 'sit');
      return walk.getEffectiveWeight() > 0.5 ? 'walk' : 'idle';
    },
    get seated() { return pose === 'sit'; },
    get swing() { return null; },
    get propMounted() { return false; },
    mountProp() { return false; },
    unmountProp() {},
    playAttack() {},
    setLimbVisible() {},
    /**
     * Loop a seated idle. Every seat uses Chair_Sit_Idle_M (F tucks 0.56 m and
     * reads as sunk/through-back). Hips X is pinned to bind after the mixer so
     * the clip's sideways translate cannot walk them off the cushion; Y/Z stay
     * on the clip. Torso lean bones are frozen at SIT_UPRIGHT_T so the 10.7 s
     * Idle_M loop cannot periodically fold them forward. The stand-to-sit
     * transition is not played at the sit attach.
     */
    playSit({ seatIndex = 0, skipDown: _skipDown = false, phase = 0 } = {}) {
      sitIdle = sitIdleM || sitIdleF;
      if (!sitIdle) return false;
      pose = 'sit';
      sitClipName = sitIdle.getClip().name;
      const dur = Math.max(0.1, sitIdle.getClip().duration);
      idle.setEffectiveWeight(0);
      walk.setEffectiveWeight(0);
      if (sitIdleM && sitIdleM !== sitIdle) sitIdleM.setEffectiveWeight(0);
      if (sitIdleF && sitIdleF !== sitIdle) sitIdleF.setEffectiveWeight(0);
      /*
       * Always skip the stand-to-sit transition at the sit attach. Playing it here
       * starts the clip's STANDING frame inside the chair (legs through the seat) —
       * John's "crouching on the floor in front of / clipping through the chair".
       * Walk-in already showed them on their feet; occupying the seat is Idle_M.
       */
      if (sitDown) sitDown.setEffectiveWeight(0);
      sitIdle.setEffectiveWeight(1);
      sitIdle.time = SIT_UPRIGHT_T;
      mixer.update(0);
      captureLean();
      sitIdle.time = ((phase % dur) + dur) % dur;
      return true;
    },
    update(dt, state = {}) {
      if (pose === 'sit') {
        if (sitDown && sitIdle && sitDown.getEffectiveWeight() > 0.05) {
          const done = sitDown.time >= sitDown.getClip().duration - 0.08;
          if (done) {
            const w = sitDown.getEffectiveWeight();
            const next = Math.max(0, w - dt / 0.28);
            sitDown.setEffectiveWeight(next);
            sitIdle.setEffectiveWeight(1 - next);
            if (next <= 0.02) sitClipName = sitIdle.getClip().name;
          }
        }
        mixer.update(dt);
        // Clip writes a ~0.18 m sideways hips.x. Pin X to bind so both twins sit
        // on the cushion centre; leave Y/Z to Idle_M (the sit drop and hip-back).
        if (hips && hipsRest) hips.position.x = hipsRest.x;
        applyLean();
        return;
      }
      const speed = state.speed ?? 0;
      const runAt = state.runAt ?? 2.6;
      const still = speed < runAt * 0.10;
      const target = still ? 0 : 1;
      const w = walk.getEffectiveWeight();
      const next = w + (target - w) * Math.min(1, dt / 0.18);
      walk.setEffectiveWeight(next);
      idle.setEffectiveWeight(1 - next);
      const ref = runAt * 0.42;
      walk.setEffectiveTimeScale(THREE.MathUtils.clamp(speed / (ref || 1), 0.55, 1.65));
      mixer.update(dt);
      if (hips && hipsRest) { hips.position.x = hipsRest.x; hips.position.z = hipsRest.z; }
    },
    dispose() {
      mixer.stopAllAction();
      // Geometries are the runner's. Materials were cloned and are ours.
      rig.traverse((o) => {
        if (!o.isMesh && !o.isSkinnedMesh) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) m?.dispose?.();
      });
    },
  };
}

/** Wear the lobby colours on a cloned Meshy body without discarding the baked atlas. */
function tintIntroRig(rig, shellHex, accentHex) {
  const shell = shellHex ? new THREE.Color(shellHex) : null;
  const accent = accentHex ? new THREE.Color(accentHex) : null;
  rig.traverse((o) => {
    if (!o.isMesh && !o.isSkinnedMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m?.color) continue;
      const name = `${o.name || ''} ${m.name || ''}`;
      if (accent && /mint|cap|wedge|accent/i.test(name)) m.color.copy(accent);
      else if (shell) m.color.lerp(shell, 0.38);
    }
  });
}
