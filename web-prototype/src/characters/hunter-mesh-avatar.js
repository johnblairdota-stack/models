import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * THE GAME HUNTER MESH — Meshy stage-3, auto-rigged, skinned, driven by HunterAI.
 *
 * Same class of integration as `createMeshAvatar` for the player (`?mesh=1`). The viewer
 * (`hunter.animated`) proves the pack renders and each clip plays. This is the piece that
 * puts it in `game.play` behind `?hunterm=1`.
 *
 * ⚠️ OPT-IN, NOT THE DEFAULT. Extra-arm skin weights are a biped approximation, contact
 * phase is unmeasured, and existing playtests must stay on the procedural `buildHunter`.
 * `?hunterm=0` (or omitting the flag) is bit-identical to yesterday's hunter.
 *
 * ⚠️ MATERIALS STAY AS THEY ARRIVE. Do NOT overwrite with `shellWhite`. The hunter pack is
 * textured in Meshy; the identity kit / wordmark / chrome-panel rewrite exist to dress a
 * material-less player body.
 *
 * ⚠️ SCALE AND GROUNDING HAPPEN ON THE BIND POSE. Measuring mid-stride would make every
 * later number depend on which frame you happened to sample. Same rule as
 * `hunter-animated.js` and `createMeshAvatar`.
 *
 * ⚠️ THE GAME OWNS ROOT XZ. Clips carry hip translation; two systems moving the same body
 * fight. Y is left alone — that is the cycle's bob. Collapse any hidden bones AFTER the
 * mixer: clips carry scale tracks and will write a limb back on.
 *
 * Each Meshy export is a full character + one clip. `walking.glb` is the body+rig carrier;
 * running / attack / double-combo donate AnimationClips that are rewritten onto this
 * skeleton's bone names. frankenstein / orc / jump-attack / left-slash stay viewer-only.
 *
 * ⚠️ STAGE MORPHS ARE SKIPPED. This body IS the stage-3 silhouette. HunterAI still
 * advances stage for speed / radius / reach; the crush-and-unfold grow stays on the
 * hidden procedural rigs. Absorb still pulls a limb into the torso.
 *
 * ⚠️ ATTACK CONTACT IS UNMEASURED. Damage stays on HunterAI's existing `_wind` /
 * `_swing` / `_bangT` clocks. `SWINGS[].contact` is a labelled placeholder so a later
 * measurement can land without inventing a second timer. Do not copy the player's
 * solved numbers — they are properties of those clips, not of a swing.
 */

const BODY_FILE = 'walking.glb';

/**
 * State the AI asks for → filename under `/models/anim/hunter/`.
 * Values are files, not clip names: each GLB carries one animation, often named
 * something unhelpful (`Take 001`, `animation`). We rename after load.
 */
const CLIP_FILES = {
  walk: 'walking.glb',
  run: 'running.glb',
};

/**
 * Varied take/strike, same shape as the player's `SWINGS` list.
 *
 * `contact` is NOT used to fire damage yet — see the header. When someone measures
 * these clips (peak hand speed, or the frame the leading fist arrives), put the
 * number here and wire HunterAI to it. Until then the placeholder is 0.60, the
 * retired procedural swing's CONTACT_PHASE, and it is flagged so nobody trusts it.
 */
export const HUNTER_SWINGS = [
  {
    clip: 'attack',
    file: 'attack.glb',
    contact: 0.60,
    note: 'UNMEASURED placeholder — keep procedural ATTACK_WINDUP / ATTACK_CADENCE',
  },
  {
    clip: 'double-combo',
    file: 'double-combo-attack.glb',
    contact: 0.60,
    note: 'UNMEASURED placeholder — keep procedural ATTACK_WINDUP / ATTACK_CADENCE',
  },
];

const BLEND = 0.18;
const DEFAULT_H = 1.7;

const urlNum = (name, fallback) => {
  if (typeof location === 'undefined') return fallback;
  const v = new URLSearchParams(location.search).get(name);
  const n = v === null ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

function urlStr(name) {
  if (typeof location === 'undefined') return null;
  return new URLSearchParams(location.search).get(name);
}

function leafBone(trackName) {
  const i = trackName.lastIndexOf('.');
  const node = i < 0 ? trackName : trackName.slice(0, i);
  const prop = i < 0 ? '' : trackName.slice(i + 1);
  const leaf = node.includes('/') ? node.split('/').pop() : node.split('.').pop();
  return { node, leaf, prop };
}

/**
 * Rewrite a clip's tracks onto the carrier skeleton's bone names.
 *
 * Meshy writes a full character per file. Bone NAMES match (same auto-rig) but the
 * node path prefix often does not (`Armature.Hips` vs `walking_rig.Hips`). three.js
 * binds by the whole track name; a prefix miss is a clip that plays and does nothing.
 */
function bindClipToRig(clip, bones, nameHint) {
  const next = clip.clone();
  next.name = nameHint ?? clip.name;
  let remapped = 0;
  let missing = 0;
  for (const track of next.tracks) {
    const { node, leaf, prop } = leafBone(track.name);
    if (bones[node]) continue;
    if (leaf && bones[leaf]) {
      track.name = `${leaf}.${prop}`;
      remapped++;
      continue;
    }
    const hit = Object.keys(bones).find((b) => b === leaf || node.endsWith(`.${b}`) || node.endsWith(`/${b}`));
    if (hit) {
      track.name = `${hit}.${prop}`;
      remapped++;
    } else {
      missing++;
    }
  }
  return { clip: next, remapped, missing, tracks: next.tracks.length };
}

function findHips(bones) {
  const names = Object.keys(bones);
  const hit = names.find((n) => /hips$/i.test(n))
    || names.find((n) => /pelvis$/i.test(n))
    || names.find((n) => /(^|:)root$/i.test(n));
  return hit ? bones[hit] : null;
}

function yawDriftDeg(clip) {
  const track = clip.tracks.find((t) => /hips\.quaternion$/i.test(t.name)
    || /pelvis\.quaternion$/i.test(t.name));
  if (!track || track.values.length < 8) return 0;
  const yawOf = (i) => {
    const [x, y, z, w] = [0, 1, 2, 3].map((k) => track.values[i * 4 + k]);
    return Math.atan2(2 * (w * y + x * z), 1 - 2 * (y * y + x * x)) * 180 / Math.PI;
  };
  let d = yawOf(track.values.length / 4 - 1) - yawOf(0);
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

function standOnGround(rig, H, url) {
  rig.updateWorldMatrix(true, true);
  const b0 = new THREE.Box3().setFromObject(rig);
  const h0 = b0.max.y - b0.min.y;
  if (!(h0 > 0)) throw new Error(`hunter-mesh-avatar: ${url} has zero height — load failed`);
  rig.scale.setScalar(H / h0);
  rig.updateWorldMatrix(true, true);
  const b1 = new THREE.Box3().setFromObject(rig);
  rig.position.set(0, -b1.min.y, 0);
  rig.updateWorldMatrix(true, true);
  return { bindHeight: h0, scale: H / h0 };
}

function prepareMeshes(rig) {
  let skinned = 0;
  let baked = 0;
  rig.traverse((o) => {
    if (!o.isMesh && !o.isSkinnedMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    o.frustumCulled = false;
    if (o.isSkinnedMesh) skinned++;
    if (o.material?.map) baked++;
  });
  return { skinned, baked };
}

async function loadGltf(loader, url) {
  try {
    return await loader.loadAsync(url);
  } catch (err) {
    throw new Error(`hunter-mesh-avatar: failed to load ${url}. `
      + 'Copy the Meshy hunter pack into public/models/anim/hunter/ '
      + `(from assets/hunter-meshy/03-rig and 04-anims). ${err?.message ?? err}`);
  }
}

export async function createHunterMeshAvatar(opts = {}) {
  const H = opts.height ?? urlNum('hunterh', DEFAULT_H);
  const base = opts.base ?? '/models/anim/hunter';
  const bodyFile = urlStr('hunterbody') || BODY_FILE;

  const files = {
    walk: CLIP_FILES.walk,
    run: CLIP_FILES.run,
    ...Object.fromEntries(HUNTER_SWINGS.map((w) => [w.clip, w.file])),
  };
  // Body file is also the walk clip when they are the same GLB — load once.
  const unique = [...new Set([bodyFile, ...Object.values(files)])];
  const loader = new GLTFLoader();
  const loaded = new Map();
  await Promise.all(unique.map(async (file) => {
    loaded.set(file, await loadGltf(loader, `${base}/${file}`));
  }));

  const bodyGltf = loaded.get(bodyFile);
  if (!bodyGltf) throw new Error(`hunter-mesh-avatar: body ${bodyFile} did not load`);
  const rig = bodyGltf.scene;
  const { bindHeight, scale } = standOnGround(rig, H, `${base}/${bodyFile}`);
  const { skinned, baked } = prepareMeshes(rig);
  if (!skinned) throw new Error('hunter-mesh-avatar: no SkinnedMesh — this is not a rigged file');
  if (baked === 0) {
    console.warn(`[hunter-mesh-avatar] ${bodyFile} has no baked colour map; leaving Meshy materials as they arrived`);
  }

  const bones = {};
  rig.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  const hips = findHips(bones);
  const hipsRest = hips ? hips.position.clone() : null;

  const yawOff = urlNum('hunteryaw', 0) * Math.PI / 180;
  if (yawOff) rig.rotation.y = yawOff;

  const mixer = new THREE.AnimationMixer(rig);
  const actions = {};
  const clipNames = [];
  const bindNotes = [];

  const takeClip = (file, key) => {
    const gltf = loaded.get(file);
    const src = gltf?.animations?.[0];
    if (!src) {
      throw new Error(`hunter-mesh-avatar: ${file} has no animation. `
        + `Available: ${(gltf?.animations ?? []).map((a) => a.name).join(', ') || '(none)'}`);
    }
    const { clip, remapped, missing, tracks } = bindClipToRig(src, bones, key);
    clipNames.push(src.name);
    bindNotes.push({ key, file, src: src.name, remapped, missing, tracks, duration: clip.duration });
    const a = mixer.clipAction(clip);
    a.enabled = true;
    a.setEffectiveWeight(key === 'walk' ? 1 : 0);
    a.play();
    actions[key] = a;
    return clip;
  };

  const walkClip = takeClip(files.walk, 'walk');
  takeClip(files.run, 'run');
  for (const w of HUNTER_SWINGS) takeClip(w.file, w.clip);

  /*
   * A turning locomotion clip fights the AI's facing. The player path THROWS on >25 deg.
   * This pack is an unfinished art path — warn, do not take the game down. John can
   * still walk the halls and tell us the hunter aims off to one side.
   */
  for (const [key, clip] of [['walk', walkClip], ['run', actions.run?.getClip()]]) {
    if (!clip) continue;
    const drift = yawDriftDeg(clip);
    if (Math.abs(drift) > 25) {
      console.warn(`[hunter-mesh-avatar] locomotion clip "${key}" turns the body `
        + `${drift.toFixed(1)} deg over its length. The game owns facing.`);
    }
  }

  let current = 'walk';
  let activeSwing = HUNTER_SWINGS[0];
  let striking = false;
  const collapsed = new Set();

  const swingSet = new Set(HUNTER_SWINGS.map((w) => w.clip));

  console.log(`[hunter-mesh-avatar] ${bodyFile}: ${skinned} skinned, ${baked} baked, `
    + `${Object.keys(bones).length} bones, scaled x${scale.toFixed(4)} `
    + `(bind ${bindHeight.toFixed(3)} m → ${H} m)`);
  for (const n of bindNotes) {
    console.log(`[hunter-mesh-avatar]   ${n.key}: ${n.file} "${n.src}" `
      + `${n.duration.toFixed(2)}s tracks=${n.tracks} remapped=${n.remapped} missing=${n.missing}`);
  }

  return {
    root: rig,
    bones,
    mixer,
    sourceFile: bodyFile,
    clipNames,
    bindNotes,
    get clip() { return current; },
    get swing() { return activeSwing; },
    get striking() { return striking; },

    /**
     * Start a take/strike. `dur` is HunterAI's own windup / cadence / slam length;
     * the clip is retimed to match so the picture and the (still procedural) damage
     * stay the same event rather than drifting apart. Variety is a LIST, like the
     * player's SWINGS — pick at random among attack / double-combo.
     */
    playStrike(dur) {
      activeSwing = HUNTER_SWINGS[Math.floor(Math.random() * HUNTER_SWINGS.length)];
      const a = actions[activeSwing.clip];
      if (!a) return activeSwing;
      a.reset();
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
      a.enabled = true;
      const clipDur = a.getClip().duration;
      a.setEffectiveTimeScale(dur > 0 ? clipDur / dur : 1);
      a.setEffectiveWeight(1);
      a.play();
      current = activeSwing.clip;
      striking = true;
      return activeSwing;
    },

    /**
     * @param {number} dt
     * @param {object} state  { speed, runAt, striking }
     */
    update(dt, state = {}) {
      const speed = state.speed ?? 0;
      const runAt = state.runAt ?? 2.7;

      if (striking) {
        const a = actions[activeSwing.clip];
        if (!a || !a.isRunning()) striking = false;
      }
      const inStrike = striking || !!state.striking;

      const still = speed < runAt * 0.10;
      const want = inStrike ? activeSwing.clip
        : (speed < runAt * 0.62 ? 'walk' : 'run');
      if (want !== current && actions[want]) current = want;

      for (const n of Object.keys(actions)) {
        const target = n === current ? 1 : 0;
        const w = actions[n].getEffectiveWeight();
        actions[n].setEffectiveWeight(w + (target - w) * Math.min(1, dt / BLEND));
      }

      const ref = current === 'run' ? runAt : runAt * 0.42;
      const rate = still ? 0.18 : THREE.MathUtils.clamp(speed / Math.max(ref, 0.2), 0.55, 1.65);
      for (const n of Object.keys(actions)) {
        if (!swingSet.has(n)) actions[n].setEffectiveTimeScale(rate);
      }

      mixer.update(dt);

      if (hips && hipsRest) {
        hips.position.x = hipsRest.x;
        hips.position.z = hipsRest.z;
      }
      for (const name of collapsed) bones[name]?.scale.setScalar(1e-4);
    },

    setLimbVisible(socket, visible) {
      const SOCKET_BONES = {
        shoulderL: ['LeftArm'],
        shoulderR: ['RightHand', 'RightArm'],
        hipL: ['LeftUpLeg'],
        hipR: ['RightUpLeg'],
      };
      for (const name of SOCKET_BONES[socket] ?? []) {
        const hit = bones[name] || Object.values(bones).find((b) => b.name.endsWith(name));
        if (!hit) continue;
        if (visible) collapsed.delete(hit.name);
        else collapsed.add(hit.name);
      }
    },

    dispose() {
      mixer.stopAllAction();
      rig.traverse((o) => { if (o.isMesh || o.isSkinnedMesh) o.geometry?.dispose?.(); });
    },
  };
}
