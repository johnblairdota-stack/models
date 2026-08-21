import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { HUNTER_STAGES } from './hunter.js';
import { chromeDarkPanels } from './mesh-avatar.js';
import { patchForScreenAO } from '../post/pipeline.js';

/**
 * THE GENERATED HUNTER — the same pipeline that produced the player, pointed at the monster.
 *
 * `mesh-avatar.js` put a Meshy-generated, auto-rigged, skinned character under the PLAYER and
 * `?mesh=0` is now the revert. The hunter did not come with it, and that left the game in a
 * state the design cannot afford: **the horror of the hunter is that it is the player's own
 * chassis corrupted**, and as of 2026-08-19 the two are no longer the same chassis. The player
 * is 15,864 triangles of generated robot; the hunter is `buildUnit4H` with grime on it. Stand
 * them side by side (`hunter.mesh`) and they read as two different products.
 *
 * So this is the hunter's half of `mesh-avatar.js`, and it is deliberately a SEPARATE FILE
 * rather than an option on that one. They share a pipeline, not a problem:
 *
 *   the avatar        holds a two-handed sledgehammer, loses limbs to the hunter, is driven by
 *                     a player's input, and carries the 4Humanity identity kit
 *   the hunter        has three STAGES that swap under a grow transition, one of which has an
 *                     empty shoulder socket and one of which rides a stolen torso, and it is
 *                     driven by `HunterAI`'s state machine
 *
 * The one thing they must share is the RIG, and they do — see `CLIP_FILE` below.
 *
 * ⚠️ **THIS IS OPT-IN (`?meshhunter=1`) AND THAT IS NOT TIMIDITY.** `?mesh=` shipped opt-in for
 * as long as the generated body's clips were wrong, and the flip to on-by-default is recorded in
 * `game.js` as a decision with John's name on it. The same rule applies here twice over, because
 * every hunter verdict on the board (`hunter.2` r19 WEAK 70, `hunter.3` r21 WEAK 64) describes
 * the PROCEDURAL body. Defaulting this on would silently re-point 40 rounds of critique at a
 * character nobody has judged.
 */

/**
 * WHERE THE STAGE BODIES COME FROM, AND WHAT STANDS IN UNTIL THEY DO.
 *
 * `tools/meshy-hunter-batch.mjs` generates these three from the prompts in that file — text→3D
 * on `smart-topology`, then Meshy's auto-rig — and drops them in `public/models/hunter/`. Naming
 * is `STYLE_CONTRACT.md` §5.
 *
 * 🚨 **THE STAND-IN IS ANNOUNCED, NEVER SILENT.** A generated body that has not been generated
 * yet is the exact shape of the trap this project has already paid for twice: `game.js` shipped
 * "the new robot" for a whole round while a silent fallback rendered the old one, and four
 * `?player=` sweeps came back byte-identical because a view ignored the flag. So the resolver
 * below prints what it looked for and what it found, publishes `standIn` on the returned object,
 * `hunter.mesh` writes it in the caption, and `harness/_meshhunter_probe.mjs` fails if the
 * assertion and the reality disagree.
 *
 * The stand-in is the PLAYER'S OWN BODY, and that is the honest choice rather than a convenient
 * one: the fiction says the hunter is a corrupted player chassis, so a hunter wearing the
 * player's mesh with the stage's grime, tint and torn socket on it is the design's own claim
 * rendered literally. It is not the finished monster — it is the player's silhouette at every
 * stage, and stage 3's six arms are missing entirely — but it is a true picture of the family
 * resemblance, which is the thing the procedural hunter can no longer show.
 */
export const HUNTER_BODY_FILES = {
  1: ['hunter/rrr_char_hunter-s1_v1.glb'],
  2: ['hunter/rrr_char_hunter-s2_v1.glb'],
  3: ['hunter/rrr_char_hunter-s3_v1.glb'],
};

/** The player's generated body, used when a stage's own body has not been generated yet. */
const STAND_IN = 'anim/friendly_all38.glb';

/**
 * THE CLIP LIBRARY, AND WHY THE HUNTER DOES NOT NEED ITS OWN.
 *
 * Every Meshy auto-rig of a humanoid comes out with the SAME 26-node skeleton — `Hips`,
 * `Spine/01/02`, `neck`, `Head`, `head_end`, `headfront`, and the four limb chains. That is not
 * an assumption inherited from a comment; `docs/handoff/player-pipeline.md` verified it once by
 * playing the Lumi Bot's clips on the Friendly Robot, and `assertRigCompatible` below re-checks
 * it on every load, by name, and throws with both bone lists when it fails.
 *
 * So the hunter borrows the player's 38 clips instead of paying Meshy for its own set. If a
 * generated hunter body ever arrives carrying clips of its own — Meshy's animation API can
 * attach them at rig time, and `tools/meshy-hunter-batch.mjs --animate` asks for exactly this
 * set — those win, and the borrow never runs.
 */
const CLIP_FILE = 'anim/friendly_all38.glb';

/**
 * The hunter's clip vocabulary. Keys are the STATES this module is asked for; values are clip
 * names in `CLIP_FILE`.
 *
 * `Alert` for idle rather than a rest pose: a hunter standing still is not resting, it is
 * listening, and that is the frame the player has to be able to read across a dark room.
 *
 * `Attack` for the strike. The player's sledge swing uses `Heavy_Hammer_Swing` because it is
 * holding a two-handed hammer; the hunter's strike is a bare-armed grab for a limb, which is
 * what `Attack` is.
 */
const CLIPS = {
  idle: 'Alert',
  walk: 'Walking',
  run: 'Running',
  attack: 'Attack',
  /** The GROW transition. `Arise` is a body unfolding off the floor — it is the shot. */
  grow: 'Arise',
  /** The rider torso at stage 3: a stolen body folded up on the host's shoulders. */
  rider: 'Sit_on_Chair_Arms_Crossed',
};

/** Which mesh bones a socket owns, for hiding a limb. Same table as `mesh-avatar.js`. */
const SOCKET_BONES = {
  shoulderL: ['LeftArm'],
  shoulderR: ['RightArm'],
  hipL: ['LeftUpLeg'],
  hipR: ['RightUpLeg'],
};

/** Cross-fade seconds between clips, matching `mesh-avatar.js` so both bodies blend alike. */
const BLEND = 0.18;

const urlParam = (name) => (typeof location === 'undefined'
  ? null
  : new URLSearchParams(location.search).get(name));

const urlNum = (name, fallback) => {
  const v = urlParam(name);
  const n = v == null || v === '' ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * Does this file exist? A `HEAD` that 404s is the whole test.
 *
 * ⚠️ VITE'S DEV SERVER ANSWERS 200 WITH `index.html` FOR AN UNKNOWN PATH under its SPA fallback,
 * which would make every probe succeed and every stage load an HTML file as a GLB. The
 * content-type check is what makes the probe mean anything: a real GLB comes back as
 * `model/gltf-binary` or `application/octet-stream`, never as `text/html`.
 */
async function exists(url) {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    if (!res.ok) return false;
    const type = res.headers.get('content-type') ?? '';
    return !/text\/html/i.test(type);
  } catch {
    return false;
  }
}

/**
 * The bone-name contract between a body and a borrowed clip set.
 *
 * A three.js `AnimationClip` addresses bones by NAME. Play a clip whose tracks name bones the
 * body does not have and nothing throws — the mixer binds what it can and silently drops the
 * rest, so a body with a differently-named spine animates from the hips down and stands rigid
 * above it. That is a defect you can watch for a whole round without being able to name it, so
 * it is checked here instead: every bone the clip set addresses must exist on the body.
 */
function assertRigCompatible(bodyBones, clips, what) {
  const want = new Set();
  for (const clip of clips) {
    for (const track of clip.tracks) want.add(track.name.split('.')[0]);
  }
  const missing = [...want].filter((n) => !bodyBones[n]);
  if (missing.length) {
    throw new Error(`mesh-hunter: ${what} is not rig-compatible with ${CLIP_FILE}. ` +
      `The clips drive ${want.size} bones and this body is missing ${missing.length} of them ` +
      `(${missing.slice(0, 8).join(', ')}${missing.length > 8 ? '…' : ''}). ` +
      `The body carries: ${Object.keys(bodyBones).join(', ') || '(no bones at all)'}`);
  }
  return want.size;
}

/**
 * THE STAGE'S CORRUPTION, ON TOP OF THE PLAYER'S OWN SURFACE TREATMENT.
 *
 * The procedural hunter gets its ramp from `unit4hMaterials({ shell: { tint, grime, … } })` — it
 * owns its shaders, so it can be made filthy at the source. A generated body arrives with one
 * baked albedo and one material, and re-materialising it would throw away the texture John chose.
 * So the ramp is a MULTIPLY over that texture, and `HUNTER_STAGES[stage].shell` is the multiplier
 * — the same authored table the procedural body reads, so the two cannot drift apart.
 *
 * 🚨 TWO THINGS MAKE THIS A SHADER INJECTION RATHER THAN `material.color = tint`, AND BOTH WERE
 * MEASURED AFTER THE OBVIOUS VERSION SHIPPED A ROW OF FOUR IDENTICAL-LOOKING ROBOTS.
 *
 * 1. **`Material.clone()` DOES NOT COPY `onBeforeCompile`.** `mesh-avatar.js` runs
 *    `chromeDarkPanels` over the player's material, which sets `metalness = 1` and installs a
 *    shader that pulls it back to 0 per pixel everywhere the texture is not a dark neutral panel.
 *    `clone()` copies the 1 and drops the shader — so a cloned body renders FULLY METALLIC, which
 *    is a chrome robot with almost no diffuse for an albedo tint to act on. The probe read the
 *    three stages at x0.717 / x0.705 / x0.707 against tints of 0.867 / 0.788 / 0.700: the ramp
 *    was not compressed, it was barely connected. So the hunter re-installs the treatment, which
 *    it wants anyway — the same surface as the player is the family resemblance this whole piece
 *    is about.
 *
 * 2. **THE TINT HAS TO LAND AFTER THE CHROME MASK, NOT BEFORE IT.** That mask is
 *    `1 - smoothstep(lo, hi, luminance)` over the SAMPLED texel, and `material.color` multiplies
 *    the sample before it is read. Darkening a stage through `color` therefore pushes more of the
 *    white shell under the chrome threshold, and stage 3 would not get grimier — it would turn
 *    into a chrome robot, with the panel logic doing the opposite of what the grime asked for.
 *    Injected after `<color_fragment>`, the mask sees the clean texture and the grime multiplies
 *    what the mask produced.
 */
function applyGrime(material, rgb, key) {
  /*
   * ⚠️ CLEAR THE CHROME FLAG FIRST. `chromeDarkPanels` marks a material `userData.rrwChromed` so
   * it injects once, and `Material.clone()` DOES copy `userData` while dropping
   * `onBeforeCompile` — so a clone arrives claiming to have a treatment it no longer has, and
   * the function returns without re-installing it.
   */
  material.userData = { ...(material.userData ?? {}), rrwChromed: false };
  chromeDarkPanels(material);
  const chromeHook = material.onBeforeCompile;
  const g = urlNum('grimegamma', 2.2);
  const tint = new THREE.Color(rgb[0] ** g, rgb[1] ** g, rgb[2] ** g);

  material.onBeforeCompile = (shader, renderer) => {
    chromeHook.call(material, shader, renderer);
    shader.uniforms.uGrime = { value: tint };
    /*
     * ⚠️ EVERY GLSL LITERAL CLOSES ON ITS OWN LINE — `harness/lint-glsl.mjs` fails the build for
     * a backtick sharing a line with GLSL, and it is right to.
     */
    const DECL = `
      uniform vec3 uGrime;
      void main() {
    `;
    /*
     * ⚠️ ON THE OUTGOING RADIANCE, NOT ON THE ALBEDO — and this is the third place the grime has
     * been applied in this file, with a measurement behind each move.
     *
     * Multiplying `diffuseColor` is the textbook answer and it barely moved the picture: tints
     * of 0.867 / 0.788 / 0.700 rendered at x0.976 / x0.964 / x0.949 of the clean player. The
     * reason is what this body IS. `chromeDarkPanels` drives large parts of it metallic, and a
     * metal has no diffuse term for an albedo to tint — most of what the camera receives is
     * reflected environment, which an albedo multiply never touches.
     *
     * Soot does touch it. A filthy machine returns less of EVERYTHING — its reflections dull
     * with its diffuse — so the multiply belongs after the light has been gathered, which also
     * makes the authored number mean what it says: the ratio the sheet grades is the ratio in
     * the table.
     *
     * `uGrime` is raised to `?grimegamma=` (2.2 by default) because the multiply lands in LINEAR
     * light and the ratio is graded on the sRGB-encoded frame. Without it a 0.700 table entry
     * photographs at 0.700^(1/2.2) = 0.85 and the ramp reads half as steep as it was authored.
     */
    const TINT = `
      #include <opaque_fragment>
      gl_FragColor.rgb *= uGrime;
    `;
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', DECL)
      .replace('#include <opaque_fragment>', TINT);
  };

  /*
   * 🚨 THE AO PATCH RUNS AFTER THIS AND IT OVERWRITES `customProgramCacheKey`, WHICH IS WHY IT
   * IS CALLED HERE RATHER THAN LEFT TO `engine.finalizeScene()`.
   *
   * `patchForScreenAO` sets EVERY material's key to the constant `'rrr-ssao-v1'`, which is
   * right for its own purpose — one AO injection, one program, shared by the whole scene. It is
   * fatal here. three.js resolves a program by that key, so with every material claiming the
   * same key the first one compiled wins and every later material RENDERS THE FIRST ONE'S
   * SHADER. In this view the first is the player's, whose shader has no grime in it at all — so
   * three tinted hunters and a clean player all drew through the clean player's program and the
   * ramp measured 1.000 / 0.992 / 0.988 / 0.983 off tints of 0.867 / 0.788 / 0.700.
   *
   * Patching here, then claiming a distinct key, gets both: the AO wrapper is installed exactly
   * once (`patchForScreenAO` keeps its own WeakSet, so `finalizeScene` will not redo it), and
   * each stage compiles its own program. Three extra programs is nothing; three stages that
   * photograph identically has already cost this project rounds.
   */
  patchForScreenAO(material);
  material.customProgramCacheKey = () => `rrw-hunter-grime-${key}`;
  material.needsUpdate = true;
}

/**
 * THE EYES, AND THE ONE LANDMARK THAT MAKES THEM PLACEABLE.
 *
 * Red slit eyes are the hunter's single loudest tell — `ART_MANIFEST.md` names them on every
 * stage row — and a generated body cannot supply them: it has ONE material over the whole mesh,
 * so there is nothing to drive, and its face is painted into the albedo.
 *
 * `mesh-identity.js` solves the equivalent problem for the player by raycasting the skull and
 * conforming a plate to it, over 400 lines that encode the Lumi Bot's proportions and throw on
 * any other body ("shoulder cap ray hit 0.611 m from the arm joint — that is the torso"). None
 * of that survives contact with three differently-shaped hunters.
 *
 * The Meshy rig carries its own landmarks instead — a `headfront` bone in front of `Head` and a
 * `head_end` at the crown, neither of which is used anywhere else in this project. Between them
 * they give a face direction and a skull span, and everything below is a fraction of those, so
 * it lands on any body Meshy rigs rather than on this one.
 *
 * ⚠️ IT IS ASSERTED, because a landmark that has silently moved would put the eyes inside the
 * skull, and a face with no eyes is much harder to see than a number is.
 */
function attachSlitEyes(bones, def, H) {
  const head = bones.Head;
  const front = bones.headfront;
  const crown = bones.head_end;
  if (!head || !front || !crown) return null;

  for (const b of [head, front, crown]) b.updateWorldMatrix(true, false);
  const pHead = new THREE.Vector3().setFromMatrixPosition(head.matrixWorld);
  const pFront = new THREE.Vector3().setFromMatrixPosition(front.matrixWorld);
  const pCrown = new THREE.Vector3().setFromMatrixPosition(crown.matrixWorld);

  /*
   * ⚠️ `headfront` IS THE JAW, NOT THE EYE LINE — measured, after the first build put two red
   * bars under the chin.
   *
   * On the shipped rig, with the body normalised to 1.70 m: `Head` sits at y 1.394, `head_end`
   * (the crown) at 1.685, and `headfront` at 1.453 — i.e. only 0.059 up from the head joint
   * against a 0.291 skull, and 0.112 forward of it. It is a FACE-DIRECTION marker, which is all
   * this needs it for; the height has to come from the skull's own span.
   *
   * So: `up` is the head joint to the crown, `fwd` is the component of `headfront` across it,
   * and the slits go 0.58 of the way up the skull — where an eye line sits on a head whose
   * bottom third is jaw.
   */
  const up = pCrown.clone().sub(pHead);
  const skull = up.length();
  up.normalize();
  const toFront = pFront.clone().sub(pHead);
  const reach = toFront.length();
  const fwd = toFront.clone().addScaledVector(up, -toFront.dot(up));
  const face = fwd.length();
  fwd.normalize();
  const right = new THREE.Vector3().crossVectors(up, fwd).normalize();

  // A head is roughly 0.17 H tall and its face stands a few centimetres proud of the joint.
  // Outside these bands the landmarks are not what this code thinks they are, and the eyes would
  // land inside the skull — where nobody would see the defect, only the missing face.
  if (!(skull > 0.08 * H && skull < 0.30 * H) || !(face > 0.02 * H && face < 0.14 * H)) {
    throw new Error(`mesh-hunter: head landmarks are out of band on a ${H.toFixed(2)} m body — ` +
      `skull (Head→head_end) ${skull.toFixed(4)} m, face reach (across it, to headfront) ` +
      `${face.toFixed(4)} m. Expected 0.08–0.30 H and 0.02–0.14 H.`);
  }

  /*
   * ⚠️ SIZED AGAINST THE SKULL, NOT TYPED — the first pass used 0.052 H per slit at a 0.030 H
   * offset, which is a 0.19 m pair of bars on a 0.14 m head: they merged into one stripe and
   * hung out past the silhouette on both sides. A face is the thing a player reads first and
   * the thing this project has already shipped wrong once ("a character with no face").
   *
   * The measurement: `skull` (the head joint to the crown) is 0.291 m on the shipped rig and the
   * head is about 0.18 m across, so a slit pair has to fit inside 0.6 of `skull`. At 0.16 per
   * slit and 0.115 either side of centre the pair spans 0.39 of `skull` — 0.113 m of a 0.18 m
   * face, which reads as two eyes and stays inside the silhouette at every yaw the game shows.
   */
  const eyeW = 0.16 * skull;
  const eyeH = 0.035 * skull;
  const gap = 0.115 * skull;
  /*
   * 0.58 of the skull for the eye line, and the face reach pushed OUT rather than pulled back.
   *
   * ⚠️ 0.94 WAS TRIED FIRST, ON THE REASONING THAT A HEAD NARROWS ABOVE THE JAW THE MARKER SITS
   * ON. It does — and it also curves AWAY at the sides, so a slit offset from the centre line at
   * that depth sinks into the cheek and only the near one survives a three-quarter view. A face
   * with one eye is worse than a face with two that stand a millimetre proud of it.
   */
  const eyeAt = pHead.clone().addScaledVector(up, 0.58 * skull).addScaledVector(fwd, 1.06 * face);

  const mat = new THREE.MeshStandardMaterial({
    // Named for `HunterAI._setEyeDrive`, which finds the hunter's face material BY THIS NAME and
    // throbs its emissive with awareness. Matching the procedural hunter's name is what makes
    // the AI's alert channel work on this body with no change to the AI.
    name: 'hunter.faceplate',
    color: 0x120404,
    emissive: new THREE.Color(def.eye),
    emissiveIntensity: 2.9,
    roughness: 0.35,
    metalness: 0.0,
    toneMapped: true,
  });

  /*
   * ⚠️ AUTHORED IN WORLD METRES AND HANDED TO `Object3D.attach`, NOT `add`.
   *
   * A bone carries whatever scale the GLB was loaded with — 0.01 on this asset, under an
   * Armature at 100 — so a child parented with `add()` inherits it and a 9 cm slit renders as a
   * 0.9 mm one: present, parented, `visible === true`, and invisible on screen. That is the trap
   * `mesh-identity.js` divides out by hand at every part of the player's kit.
   *
   * `attach()` does the same arithmetic without the constant: it re-expresses the child's world
   * transform in the new parent's frame, so a quad built at world size stays at world size. The
   * quads are given a world position and orientation with no parent, which three.js reads as
   * their world matrix, and then re-homed onto the head bone.
   */
  const group = new THREE.Group();
  group.name = 'hunter.eyes';
  const geo = new THREE.PlaneGeometry(eyeW, eyeH);
  for (const side of [-1, 1]) {
    const q = new THREE.Mesh(geo, mat);
    q.position.copy(eyeAt)
      .add(right.clone().multiplyScalar(side * gap))
      .add(fwd.clone().multiplyScalar(0.004 * H));
    // Face the way the FACE does, not the way the bone happens to be built.
    q.lookAt(q.position.clone().add(fwd));
    q.updateMatrix();
    group.add(q);
  }
  head.attach(group);

  return { material: mat, group, skull, face, reach, eyeW, gap };
}

/**
 * Build one stage of the generated hunter.
 *
 * Returns an object shaped like `buildHunter()`'s where `HunterAI` touches it — `root`,
 * `dispose()` and a `setPose()` that is a deliberate no-op — plus `update(dt, state)`, which is
 * what actually drives it. See `hunter-ai.js` `_animate` for the branch.
 *
 * @param {object} o
 * @param {1|2|3} o.stage
 * @param {number} [o.height]  metres; defaults to the stage's own contract height
 * @param {string} [o.base]    URL prefix for model files
 */
export async function createMeshHunterStage(o = {}) {
  const stage = o.stage ?? 1;
  const def = HUNTER_STAGES[stage];
  if (!def) throw new Error(`mesh-hunter: there is no stage ${stage}`);
  const H = o.height ?? 1.7 * (def.scale ?? 1);
  const base = o.base ?? '/models';

  // `?hunterbody=` overrides the table for an A/B, exactly as `?player=` does for the avatar.
  const override = urlParam('hunterbody');
  const wanted = override ? [override] : (HUNTER_BODY_FILES[stage] ?? []);

  let file = null;
  for (const cand of wanted) {
    if (await exists(`${base}/${cand}`)) { file = cand; break; }
  }
  const standIn = !file;
  if (standIn) {
    file = STAND_IN;
    console.warn(`[mesh-hunter] stage ${stage}: none of [${wanted.join(', ') || '(none listed)'}] ` +
      `is on disk, so the PLAYER'S body (${STAND_IN}) is standing in. Run ` +
      `tools/meshy-hunter-batch.mjs to generate the real one.`);
  }

  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(`${base}/${file}`);
  const rig = gltf.scene;

  // Normalisation, same three steps as `mesh-avatar.js`: measure the bind box, scale to the
  // contract height, drop the feet onto y = 0. A skinned asset never goes through
  // `condition_asset.py` (it joins meshes, which destroys the binding), so this is the only
  // place the height contract is applied.
  rig.updateWorldMatrix(true, true);
  const b0 = new THREE.Box3().setFromObject(rig);
  const h0 = b0.max.y - b0.min.y;
  if (!(h0 > 0)) throw new Error(`mesh-hunter: ${file} measured zero height`);
  rig.scale.setScalar(H / h0);
  rig.updateWorldMatrix(true, true);
  const b1 = new THREE.Box3().setFromObject(rig);
  rig.position.set(0, -b1.min.y, 0);
  rig.updateWorldMatrix(true, true);

  const bones = {};
  rig.traverse((n) => { if (n.isBone) bones[n.name] = n; });

  let clips = gltf.animations ?? [];
  let clipSource = file;
  const needed = new Set(Object.values(CLIPS));
  const have = new Set(clips.map((c) => c.name));
  if ([...needed].some((n) => !have.has(n))) {
    const lib = await loader.loadAsync(`${base}/${CLIP_FILE}`);
    clips = lib.animations ?? [];
    clipSource = CLIP_FILE;
  }
  const byName = new Map(clips.map((c) => [c.name, c]));
  const missing = [...needed].filter((n) => !byName.has(n));
  if (missing.length) {
    throw new Error(`mesh-hunter: ${clipSource} is missing clips ${missing.join(', ')}. ` +
      `It carries: ${[...byName.keys()].join(', ') || '(none)'}`);
  }
  const drivenBones = assertRigCompatible(bones, [...needed].map((n) => byName.get(n)), file);

  let tris = 0;
  let skinned = 0;
  let maps = 0;
  const materials = new Set();
  rig.traverse((n) => {
    if (!n.isMesh && !n.isSkinnedMesh) return;
    if (n.isSkinnedMesh) skinned++;
    const idx = n.geometry?.index;
    tris += (idx ? idx.count : (n.geometry?.attributes?.position?.count ?? 0)) / 3;
    /*
     * ⚠️ CLONE BEFORE CORRUPTING, AND THE REASON IS NOT TIDINESS.
     *
     * `GLTFLoader` caches by URL, so the stand-in path hands this function the SAME material
     * instance the player's avatar is rendering with — and three stages share it with each
     * other. Tinting in place would make one filthy hunter turn the player and the other two
     * stages filthy at the same time, which reads as "the grime ramp does nothing".
     */
    const slots = Array.isArray(n.material) ? n.material : [n.material];
    const cloned = slots.map((m) => {
      if (!m) return m;
      const c = m.clone();
      materials.add(c);
      if (c.map) maps++;
      return c;
    });
    n.material = Array.isArray(n.material) ? cloned : cloned[0];
    n.castShadow = true;
    n.receiveShadow = true;
    // A skinned bounding sphere is the BIND one, so a limb thrown wide by a clip gets culled and
    // the character loses an arm at certain camera angles.
    n.frustumCulled = false;
  });
  if (!skinned) throw new Error(`mesh-hunter: ${file} carries no SkinnedMesh — it is not rigged`);
  if (!maps) {
    // The grime still ramps — it multiplies outgoing light, not albedo — but a body with no
    // baked texture has no soot mottling, no rust at the seams and no face, so it will read as
    // a uniformly dimmed white robot rather than as a corrupted one.
    console.warn(`[mesh-hunter] stage ${stage}: ${file} carries no baked colour map, so the ` +
      `stage's corruption is a flat dim rather than a surface.`);
  }
  if (urlNum('huntergrime', 1) > 0) for (const m of materials) applyGrime(m, def.shell, `s${stage}`);

  /*
   * ⚠️ THE SLIT EYES ARE OFF WHILE A STAND-IN IS STANDING IN, and that is a picture decision
   * with a measurement behind it, not a retreat.
   *
   * The placement is sound — measured on this rig, the pair lands at y 1.557 on a head spanning
   * 1.395 to 1.704, 3.4 cm proud of the face marker, straddling the centre line. What it lands
   * ON is the problem: the player's face is not a plate. It carries a painted blue visor and a
   * PROTRUDING dark lens dome, and the right-hand slit sits behind that dome and never shows,
   * so a body that already has eyes gains one red dash at the edge of its face and reads as an
   * artefact rather than as a tell.
   *
   * A generated hunter head has neither — its face is whatever the prompt asked for, and the
   * red slits are `ART_MANIFEST.md`'s loudest per-stage cue on every row. So they come on the
   * moment a real body loads. `?huntereyes=1` forces them on the stand-in for tuning, `=0` off.
   */
  const eyes = urlNum('huntereyes', standIn ? 0 : 1) > 0 ? attachSlitEyes(bones, def, H) : null;

  const mixer = new THREE.AnimationMixer(rig);
  const actions = {};
  for (const [state, name] of Object.entries(CLIPS)) {
    if (state === 'rider') continue;         // the rider runs on its own mixer, below
    const a = mixer.clipAction(byName.get(name));
    a.enabled = true;
    a.setEffectiveWeight(state === 'idle' ? 1 : 0);
    a.play();
    actions[state] = a;
  }

  /*
   * 🚨 THE STOLEN TORSO, AND WHY IT IS A SECOND COPY OF THE SAME ASSET.
   *
   * Stage 3's hero read is a smaller torso and head RIDING the host's shoulders with its arms
   * folded up near its chin — the absorbed player, still recognisable. `hunter.js` builds that
   * from a second `buildUnit4H`, which is the right answer when you own the geometry.
   *
   * Here the rider is a `SkeletonUtils.clone` of the body that is already loaded: same asset,
   * same baked texture, its own skeleton and its own mixer, folded up by `Sit_on_Chair_Arms_
   * Crossed` and parented to the host's chest. Same-asset is the point — a rider built out of
   * different geometry would be a different robot sitting on the hunter, and the sixteen rounds
   * of `hunter.3` critique that ruled "reads as twins, not absorption" say the family
   * resemblance is the read that decides this shot.
   *
   * ⚠️ `THREE.Object3D.clone()` DOES NOT WORK HERE. It copies a SkinnedMesh's reference to the
   * ORIGINAL skeleton, so the copy is driven by the host's bones and rides its own shoulders
   * inside its own chest. `SkeletonUtils.clone` rebuilds the bone graph, which is the whole
   * reason it exists.
   *
   * ⚠️ IT IS NOT THE SIX ARMS. Stage 3's other half — four grafted arms fanned around the torso —
   * is geometry no clip and no clone can supply, and it is the one piece of this character that
   * genuinely waits on generation. `tools/meshy-hunter-batch.mjs` asks for it as its own asset.
   * Until that lands, mesh stage 3 is a two-armed hunter carrying a rider, and it says so.
   */
  let rider = null;
  if (def.rider && urlNum('hunterrider', 1) > 0) {
    const host = bones.Spine02 ?? bones.Spine01 ?? bones.Spine ?? bones.neck;
    if (!host) {
      console.warn('[mesh-hunter] stage 3 wants a rider and the body has no spine bone to seat ' +
        'it on; skipping.');
    } else {
      /*
       * ⚠️ THE CLONE'S OWN TRANSFORM IS LEFT ALONE. `rig` carries the normalisation this
       * function applied — the scale that took the raw asset to `H`, and the lift that put its
       * feet on y = 0 — and the clone inherits both. Zeroing them "to start clean" puts the
       * rider back in raw asset units, which on this body is a hundredfold error.
       */
      const body = cloneSkinned(rig);
      /*
       * THE RIDER IS CLEANER THAN ITS HOST, AND THAT IS THE READ.
       *
       * `SkeletonUtils.clone` shares materials with its source, so without this the stolen torso
       * arrives wearing stage 3's filth and the two bodies photograph as one object. `hunter.js`
       * makes the same call in the same direction and with numbers close to these — its rider
       * shell is tinted [0.700, 0.735, 0.760] at grime 0.22 against a host at 1.00 — because a
       * body absorbed MOMENTS AGO has not had time to rot. The contrast is what says one of
       * these two was you.
       */
      const riderMats = new Set();
      body.traverse((n) => {
        if (!n.isMesh && !n.isSkinnedMesh) return;
        const slots = Array.isArray(n.material) ? n.material : [n.material];
        const cloned = slots.map((m) => {
          if (!m) return m;
          // The slit eyes rode along in the clone — `ART_MANIFEST.md` #05 says both heads carry
          // them at stage 3 — and they are SHARED with the host on purpose, so the AI's one
          // awareness throb lights both. Freshening them here would break that and paint the
          // eye plate white.
          if (m.name === 'hunter.faceplate') return m;
          const c = m.clone();
          // The clone dropped the host's injected shader with it (see `applyGrime`), so the
          // rider re-installs the treatment at its OWN tint — near-clean, a shade cooler than
          // white, against a host at 0.700.
          applyGrime(c, [0.88, 0.90, 0.92], `rider-s${stage}`);
          riderMats.add(c);
          return c;
        });
        n.material = Array.isArray(n.material) ? cloned : cloned[0];
        n.frustumCulled = false;
      });
      for (const m of riderMats) materials.add(m);
      const rMixer = new THREE.AnimationMixer(body);
      rMixer.clipAction(byName.get(CLIPS.rider)).play();
      // Settle onto the folded frame before anything is measured against it, or what is placed
      // is a T-pose that happens to be about to fold.
      rMixer.update(0.6);

      const holder = new THREE.Group();
      holder.name = 'hunter.rider';
      holder.add(body);

      /*
       * WORLD TRANSFORM FIRST, THEN `attach` — the same reason the eyes do it (see above): the
       * spine bone carries the GLB's own scale and `add()` would multiply it in.
       *
       * 0.50 is `hunter.js`'s own `riderH = H * 0.50`, so both hunters seat the same size of
       * stolen torso. The rider's origin is its ground plane, so seating it at 0.70 H puts a
       * folded body's mass across the host's shoulder line and its head just above the host's,
       * which is the reference's arrangement — one dominant host head with the rider's beside
       * and above it. `?ridery=` and `?riderz=` are the taste knobs, in fractions of H.
       */
      holder.scale.setScalar(0.50);
      holder.position.set(0, urlNum('ridery', 0.70) * H, urlNum('riderz', -0.06) * H);
      holder.updateMatrix();
      host.attach(holder);

      rider = { holder, body, mixer: rMixer };
    }
  }

  /** Bones collapsed to nothing because the limb they carry is gone. See `setLimbVisible`. */
  const collapsed = new Set();
  /*
   * STAGE 2'S EMPTY SOCKET, WHICH IS THE SHEET'S SINGLE MOST IMPORTANT READ: the thing has
   * already lost a fight, and the hole is where your limb goes.
   *
   * ⚠️ `hunter.js` LEARNED THIS THE EXPENSIVE WAY AND THE COMMENT IS WORTH CARRYING. It used to
   * detach the whole right arm; a critic went back to the art and found BOTH arms present in
   * every view, with the dark opening sitting ABOVE the shoulder. So `socketOpen` there builds a
   * torn PORT and keeps the arm.
   *
   * On a skinned body there is no port to build without geometry, and collapsing the arm bone
   * would re-commit the exact error that file backed out of. So stage 2 keeps both arms here
   * too, and the socket waits on the generated body — whose prompt asks for it in the mesh,
   * where it belongs.
   */

  let current = 'idle';
  let attack = 0;

  const root = new THREE.Group();
  root.name = `HUNTER.mesh.stage${stage}`;
  root.add(rig);

  return {
    root,
    rig,
    bones,
    mixer,
    stage,

    /** What actually loaded, for a probe that must not trust the table. */
    sourceFile: file,
    clipSource,
    standIn,
    clipNames: [...byName.keys()],
    drivenBones,
    tris: Math.round(tris),
    eyes,
    hasRider: !!rider,
    /** The rider's holder, so a measurement can tell the stolen torso from its host. */
    riderRoot: rider?.holder ?? null,
    /** Honest inventory of what this stage is still missing against the art. */
    pending: [
      ...(standIn ? ['body: generated stage mesh (running on the player body)'] : []),
      ...(def.socketOpen ? ['stage 2: the torn shoulder port is not in this mesh'] : []),
      ...(def.arms === 6 ? ['stage 3: four grafted arms are not in this mesh'] : []),
      ...(def.chestLooms ? ['stage 3: chest wire looms are not in this mesh'] : []),
    ],

    get clip() { return current; },

    /**
     * `HunterAI._animate` poses the procedural rig every frame through this name. On the mesh
     * path the clip owns the body — the same ruling `mesh-avatar.js` records for the player,
     * where John rejected a split rig with "I think we need to abandon the old skellington" —
     * so this exists to be harmlessly called, not to do anything.
     */
    setPose() {},

    /** One strike. Cross-fades to the attack clip and lets it run for `dur` seconds. */
    playAttack(dur = 0.45) {
      attack = Math.max(attack, dur);
      const a = actions.attack;
      if (!a) return;
      const clip = byName.get(CLIPS.attack);
      a.reset();
      a.setEffectiveTimeScale(clip.duration / Math.max(0.05, dur));
      a.play();
    },

    /**
     * @param {number} dt
     * @param {object} state  { speed, runAt, growing }
     */
    update(dt, state = {}) {
      const speed = state.speed ?? 0;
      const runAt = state.runAt ?? 2.6;
      if (attack > 0) attack -= dt;

      // Clip choice is a function of speed alone, as fractions of the run speed the caller
      // reports rather than absolute m/s — retuning the AI's speeds cannot leave the hunter
      // running on the spot at a walk. The strike and the growth override it.
      const want = state.growing ? 'grow'
        : attack > 0 ? 'attack'
          : speed < runAt * 0.10 ? 'idle'
            : speed < runAt * 0.62 ? 'walk' : 'run';
      if (want !== current && actions[want]) current = want;

      for (const n of Object.keys(actions)) {
        const target = n === current ? 1 : 0;
        const w = actions[n].getEffectiveWeight();
        actions[n].setEffectiveWeight(w + (target - w) * Math.min(1, dt / BLEND));
      }

      // The locomotion clips play at the speed the body is actually travelling, or the feet
      // skate — this project owns a `footskate.mjs` because that defect is easy to ship and hard
      // to un-see. The attack keeps the rate `playAttack` set, and the grow clip runs at 1.
      if (current === 'walk' || current === 'run') {
        const ref = current === 'run' ? runAt : runAt * 0.42;
        const rate = THREE.MathUtils.clamp(speed / ref, 0.55, 1.65);
        actions.walk.setEffectiveTimeScale(rate);
        actions.run.setEffectiveTimeScale(rate);
      }

      mixer.update(dt);
      rider?.mixer.update(dt);

      // IN PLACE. The clips carry root translation and the GAME owns where the hunter is; two
      // systems moving one body fight. Y is left alone — that is the cycle's bob.
      const hips = bones.Hips;
      if (hips) { hips.position.x = 0; hips.position.z = 0; }

      // Missing limbs, re-asserted after the mixer has had its say.
      for (const name of collapsed) bones[name]?.scale.setScalar(1e-4);
    },

    /** Same contract as the avatar's: collapse the bone, and the vertices go with it. */
    setLimbVisible(socket, visible) {
      for (const name of SOCKET_BONES[socket] ?? []) {
        if (!bones[name]) continue;
        if (visible) { collapsed.delete(name); bones[name].scale.setScalar(1); }
        else collapsed.add(name);
      }
    },

    dispose() {
      mixer.stopAllAction();
      rider?.mixer.stopAllAction();
      root.traverse((n) => { if (n.isMesh || n.isSkinnedMesh) n.geometry?.dispose?.(); });
      for (const m of materials) m.dispose();
      eyes?.material.dispose();
    },
  };
}

/**
 * All three stages, built together — what `HunterAI` asks for, since it keeps one rig per stage
 * alive and swaps them by visibility so a growth is a cut rather than a load.
 *
 * Loaded in PARALLEL and awaited together. Three sequential `loadAsync` calls of a 7 MB body is
 * most of a second of dead time on a cold cache, and the game already awaits this before the
 * first frame.
 */
export async function createMeshHunter(o = {}) {
  const stages = await Promise.all([1, 2, 3].map((stage) => createMeshHunterStage({ ...o, stage })));
  return { 1: stages[0], 2: stages[1], 3: stages[2] };
}
