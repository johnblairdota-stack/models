import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HUNTER_STAGES } from './hunter.js';

/**
 * The Meshy-clip hunter body — OPT-IN, behind `?hunterm=1`. `PLAY.bat` stays procedural.
 *
 * WHAT THIS HONESTLY IS. The repo holds NO generated hunter mesh. The only rigged body in
 * `public/models/anim/` is the Lumi Bot biped (`char1`, 8,346 verts, 1.70 m, textureless),
 * which is the old player chassis that also serves as the project's clip library. This module
 * stands THAT body in the hunter's place, wearing the hunter's authored grime ramp and eyes,
 * driven by the pack's real clips. It is a stand-in for judging motion and contact timing —
 * it is NOT the locked stage-3 silhouette (six arms, rider torso, cracked mint caps; Dev Art
 * 1785288883855 / 1785300149293). Making that silhouette needs a new Meshy generation and
 * auto-rig; no JS weight paint can invent limbs the mesh does not have. The board in
 * `hunter-door/` carries that finding; do not quietly "fix" it here.
 *
 * WHY THE BODY COMES FROM THE WALKING GLB. Every per-clip export carries the same skinned
 * mesh; `Walking` is the smallest complete one, and the merged file carries the fifteen-clip
 * library. Same 24-joint Meshy auto-rig in both, verified by name on every load — a clip
 * with a track that resolves to no bone is a bind failure and THROWS, it does not fade out.
 *
 * GAME OWNS ROOT XZ. Every clip in the pack keys `Hips.translation`. The AI slides the root;
 * a clip that also walks the hips would double-move the body (the "feet moving from the
 * point" bug `_anim_check.mjs` measures). So hip X and Z are FLATTENED to their first frame
 * for every clip at load; Y keeps the bob.
 *
 * CONTACT IS MEASURED, NOT GUESSED. `HUNTER_SWINGS` below carries, per strike clip, the
 * moment the leading fist actually arrives — forward kinematics over the raw GLB tracks at
 * 240 Hz (peak leading-hand speed, then max horizontal reach from the hips). The gate
 * `harness/hunter-door.mjs` RE-DERIVES these numbers from the GLB on every run and fails on
 * drift, so the numbers cannot rot into placeholders. `cueStrike` uses them to line the
 * visual impact up with the AI's damage frame; the AI's own clocks are untouched.
 */

export const HUNTER_PACK = {
  base: '/models/anim',
  body: 'Meshy_AI_Lumi_Bot_biped_Animation_Walking_withSkin.glb',
  library: 'Meshy_AI_Lumi_Bot_biped_Meshy_AI_Meshy_Merged_Animations.glb',
  /**
   * Role -> clip name in the library. There is NO double-combo clip in the pack (fifteen
   * clips, listed in `public/models/anim/hunter/README.md`); `combo` is the follow-up
   * strike and maps to `Heavy_Hammer_Swing`, the pack's only other committed swing. If a
   * real Double Combo Attack export lands, point `combo` at it and re-measure.
   */
  roles: { idle: 'Alert', walk: 'Walking', run: 'Running', attack: 'Attack', combo: 'Heavy_Hammer_Swing', grow: 'Arise' },
};

/**
 * Strike timing, MEASURED from the GLB tracks — see the header. `contact` is seconds from
 * clip start to the leading fist's arrival. Numbers are asserted against a fresh FK pass by
 * `harness/hunter-door.mjs` (tolerance 0.03 s); edit them only from that gate's output.
 */
export const HUNTER_SWINGS = [
  { role: 'attack', clip: 'Attack', duration: 2.800, contact: 1.050, hand: 'RightHand',
    peakHandSpeed: 26.2, measured: 'FK over GLB tracks at 240 Hz, harness/hunter-door.mjs, 2026-09-02' },
  { role: 'combo', clip: 'Heavy_Hammer_Swing', duration: 1.833, contact: 1.504, hand: 'LeftHand',
    peakHandSpeed: 7.4, measured: 'FK over GLB tracks at 240 Hz, harness/hunter-door.mjs, 2026-09-02' },
];

const swingFor = (role) => HUNTER_SWINGS.find((s) => s.role === role);

/** Throwing bind check: every track of every role clip must resolve to a bone by name. */
export function assertClipsBound(clips, skeleton) {
  const bones = new Set(skeleton.bones.map((b) => b.name));
  const missing = [];
  for (const [role, clip] of Object.entries(clips)) {
    if (!clip) { missing.push(`${role}: clip absent from library`); continue; }
    for (const tr of clip.tracks) {
      const bone = tr.name.split('.')[0];
      if (!bones.has(bone)) missing.push(`${role}/${clip.name}: track ${tr.name} has no bone`);
    }
  }
  if (missing.length) {
    throw new Error(`hunter-mesh-avatar: clips did not bind\n  ${missing.join('\n  ')}\n  bones: ${[...bones].join(',')}`);
  }
}

/** Game owns root XZ: pin hip X/Z to frame 0, keep Y. In place, per clip, at load. */
export function stripRootXZ(clip) {
  for (const tr of clip.tracks) {
    if (!tr.name.endsWith('Hips.position')) continue;
    const v = tr.values;
    for (let i = 0; i < v.length; i += 3) { v[i] = v[0]; v[i + 2] = v[2]; }
  }
  return clip;
}

export async function createHunterMeshAvatar(opts = {}) {
  const base = opts.base ?? HUNTER_PACK.base;
  const loader = new GLTFLoader();
  const [bodyG, libG] = await Promise.all([
    loader.loadAsync(`${base}/${HUNTER_PACK.body}`),
    loader.loadAsync(`${base}/${HUNTER_PACK.library}`),
  ]);

  const group = new THREE.Group();
  group.name = 'hunter-mesh-avatar';
  const rigRoot = bodyG.scene;
  group.add(rigRoot);

  let skinned = null;
  rigRoot.traverse((o) => { if (o.isSkinnedMesh && !skinned) skinned = o; });
  if (!skinned) throw new Error('hunter-mesh-avatar: no skinned mesh in body GLB');

  // The pack body ships with NO material or textures (there is nothing baked to preserve —
  // checked in the GLB json). Dress it in the hunter's authored shell ramp instead.
  const stage = opts.stage ?? 1;
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.62, metalness: 0.35 });
  mat.name = 'hunter.meshShell';
  skinned.material = mat;
  skinned.frustumCulled = false; // skinned bounds are bind-pose bounds; see mesh-hunter.md trap 1

  // the slit eyes, off the rig's own head landmark, in the faceplate material name the AI's
  // eye drive already looks for on the procedural body
  const head = rigRoot.getObjectByName('Head');
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2418, toneMapped: false });
  eyeMat.name = 'hunter.faceplate';
  if (head) {
    for (const dx of [-0.045, 0.045]) {
      const eye = new THREE.Mesh(new THREE.PlaneGeometry(0.055, 0.014), eyeMat);
      eye.position.set(dx, 0.06, 0.11);
      head.add(eye);
    }
  }

  const clips = {};
  for (const [role, name] of Object.entries(HUNTER_PACK.roles)) {
    const clip = libG.animations.find((a) => a.name === name);
    clips[role] = clip ? stripRootXZ(clip) : null;
  }
  assertClipsBound(clips, skinned.skeleton);

  const mixer = new THREE.AnimationMixer(rigRoot);
  const actions = {};
  for (const [role, clip] of Object.entries(clips)) {
    actions[role] = mixer.clipAction(clip);
    actions[role].play();
    actions[role].setEffectiveWeight(role === 'idle' ? 1 : 0);
  }
  for (const role of ['attack', 'combo', 'grow']) {
    actions[role].setLoop(THREE.LoopOnce, 1);
    actions[role].clampWhenFinished = false;
    actions[role].stop();
  }

  let strike = null; // { role, delay } — pending cue, started when delay hits 0

  const api = {
    group,
    mixer,
    clips,
    pending: [
      'stage-3 six-arm body: NO generated hunter mesh exists in the repo; this is the Lumi Bot biped standing in',
      'rider torso (the absorbed player) at stage 3',
      'scan: baked clips cannot look where the AI looks; needs an additive neck override or a head-turn clip',
    ],

    setStage(s) {
      const def = HUNTER_STAGES[s] ?? HUNTER_STAGES[1];
      mat.color.setRGB(...(def.shell ?? [0.8, 0.8, 0.8]));
      group.scale.setScalar(def.scale ?? 1);
    },

    /**
     * Line the fist up with the damage frame: the AI calls this THE MOMENT it sets a strike
     * clock of `windLeft` seconds. The clip starts so its measured `contact` lands exactly
     * when that clock hits zero — late start if the wind is long, mid-clip entry if short.
     */
    cueStrike(role, windLeft) {
      const s = swingFor(role) ?? swingFor('attack');
      const a = actions[s.role];
      if (!a) return;
      const lead = Math.max(0, windLeft ?? 0);
      if (s.contact <= lead) {
        strike = { action: a, delay: lead - s.contact, offset: 0 };
      } else {
        strike = { action: a, delay: 0, offset: s.contact - lead };
      }
    },

    update(dt, o = {}) {
      const speed = o.speed ?? 0;
      const striking = strike || ['attack', 'combo'].some((r) => actions[r].isRunning());
      if (strike) {
        strike.delay -= dt;
        if (strike.delay <= 0) {
          strike.action.reset();
          strike.action.time = strike.offset;
          strike.action.setEffectiveWeight(1);
          strike.action.play();
          strike = null;
        }
      }
      // locomotion weights: a plain speed blend, damped so state flicker cannot pop a pose
      const want = striking ? { idle: 0, walk: 0, run: 0 }
        : speed > 2.4 ? { idle: 0, walk: 0, run: 1 }
          : speed > 0.25 ? { idle: 0, walk: 1, run: 0 }
            : { idle: 1, walk: 0, run: 0 };
      for (const r of ['idle', 'walk', 'run']) {
        const w = actions[r].getEffectiveWeight();
        actions[r].setEffectiveWeight(w + (want[r] - w) * Math.min(1, dt * 8));
      }
      mixer.update(dt);
    },

    dispose() {
      mixer.stopAllAction();
      skinned.geometry.dispose();
      mat.dispose();
      eyeMat.dispose();
    },
  };

  api.setStage(stage);
  return api;
}
