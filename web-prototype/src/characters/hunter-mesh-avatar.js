import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * The Meshy stage-3 hunter body — OPT-IN, behind `?hunterm=1`. `PLAY.bat` stays procedural.
 *
 * WHAT THIS IS. John's Meshy stage-3 pack: each file is a full character + one clip.
 * `walking.glb` is the skinned body; running / attack / double-combo donate AnimationClips
 * that `bindClipToRig` rewrites onto that skeleton by bone name (prefix remap). A track
 * that resolves to no bone THROWS — it does not fade a limb out silently.
 *
 * THE GLBs ARE NOT IN GIT. They are large (~30 MB) and stay gitignored. Copy them into
 * `public/models/anim/hunter/` from the Documents pack:
 *   `C:\Users\John\Documents\Run Robot Run\web-prototype\public\models\anim\hunter\`
 * Need at least walking.glb, running.glb, attack.glb, double-combo-attack.glb.
 * Load failure names that path rather than standing the Lumi Bot in as a fake hunter.
 *
 * MATERIALS STAY AS THEY ARRIVE. The pack is textured in Meshy. Do NOT overwrite with
 * `shellWhite` or the hunter grime ramp — those dressed the textureless Lumi stand-in.
 *
 * GAME OWNS ROOT XZ. Every clip keys hip translation. The AI slides the root; a clip
 * that also walks the hips would double-move the body. Hip X and Z are FLATTENED to
 * their first frame at load (`stripRootXZ`); Y keeps the bob.
 *
 * CONTACT IS MEASURED, NOT GUESSED. `HUNTER_SWINGS` carries, per strike file, the moment
 * the leading fist arrives — FK over the raw GLB tracks at 240 Hz. The gate
 * `harness/hunter-door.mjs` re-derives these from the GLBs on every run (and SKIPS the
 * FK half honestly when the pack is not on disk). `cueStrike` lines the visual impact
 * up with the AI's damage frame; the AI's own clocks are untouched.
 *
 * FINDING, NOT A FIX. Extra arms were Meshy-auto-rigged as a biped. Skin weights on
 * grafted limbs may look wrong. No JS weight paint. Judge the silhouette in the
 * doorway (`hunter.animated`); do not invent a camera. Hunter stays a door.
 */

export const HUNTER_PACK_FROM =
  'C:\\Users\\John\\Documents\\Run Robot Run\\web-prototype\\public\\models\\anim\\hunter\\';

export const HUNTER_PACK = {
  base: '/models/anim/hunter',
  body: 'walking.glb',
  files: {
    walk: 'walking.glb',
    run: 'running.glb',
    attack: 'attack.glb',
    combo: 'double-combo-attack.glb',
  },
};

/**
 * Strike timing, MEASURED from the Meshy GLB tracks — see the header. `contact` is
 * seconds from clip start to the leading fist's arrival. Numbers are asserted against
 * a fresh FK pass by `harness/hunter-door.mjs` (tolerance 0.03 s).
 *
 * `duration`/`contact`/`hand` here are 0 / '?' until the pack is on disk and the gate
 * re-derives them (`node harness/hunter-door.mjs --write`). Lumi stand-in numbers
 * 1.050 / 1.504 are invalid for this pack and the gate refuses them.
 */
export const HUNTER_SWINGS = [
  { role: 'attack', clip: 'attack', file: 'attack.glb', duration: 2.833, contact: 1.100, hand: 'RightHand',
    peakHandSpeed: 55.3, measured: 'FK over GLB tracks at 240 Hz, harness/hunter-door.mjs, 2026-09-02' },
  { role: 'combo', clip: 'double-combo', file: 'double-combo-attack.glb', duration: 2.867, contact: 0.679, hand: 'RightHand',
    peakHandSpeed: 29.6, measured: 'FK over GLB tracks at 240 Hz, harness/hunter-door.mjs, 2026-09-02' },
];

const swingFor = (role) => HUNTER_SWINGS.find((s) => s.role === role);
const DEFAULT_H = 1.7;

const PACK_HINT = `Copy the Meshy hunter pack into public/models/anim/hunter/ `
  + `from ${HUNTER_PACK_FROM} `
  + `(walking.glb, running.glb, attack.glb, double-combo-attack.glb). `
  + `GLBs are gitignored; do not commit them.`;

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
 * A TRS track that binds to no bone THROWS.
 */
export function bindClipToRig(clip, bones, nameHint) {
  const next = clip.clone();
  next.name = nameHint ?? clip.name;
  let remapped = 0;
  const missing = [];
  const TRS = new Set(['position', 'quaternion', 'scale']);
  for (const track of next.tracks) {
    const { node, leaf, prop } = leafBone(track.name);
    if (bones[node]) continue;
    if (leaf && bones[leaf]) {
      track.name = `${leaf}.${prop}`;
      remapped++;
      continue;
    }
    const hit = Object.keys(bones).find((b) => b === leaf || node.endsWith(`.${b}`) || node.endsWith(`/${b}`)
      || (leaf && (leaf.endsWith(b) || b.endsWith(leaf))));
    if (hit) {
      track.name = `${hit}.${prop}`;
      remapped++;
    } else if (TRS.has(prop)) {
      missing.push(track.name);
    }
  }
  if (missing.length) {
    throw new Error(
      `hunter-mesh-avatar: clip "${next.name}" did not bind\n`
      + `  missing: ${missing.join(', ')}\n`
      + `  bones: ${Object.keys(bones).join(',')}`,
    );
  }
  return { clip: next, remapped, missing: 0, tracks: next.tracks.length };
}

/** Game owns root XZ: pin hip X/Z to frame 0, keep Y. In place, per clip, at load. */
export function stripRootXZ(clip) {
  for (const tr of clip.tracks) {
    if (!/hips\.position$/i.test(tr.name)) continue;
    const v = tr.values;
    for (let i = 0; i < v.length; i += 3) { v[i] = v[0]; v[i + 2] = v[2]; }
  }
  return clip;
}

/** Throwing bind check: every TRS track of every role clip must resolve to a bone by name. */
export function assertClipsBound(clips, skeleton) {
  const bones = {};
  for (const b of skeleton.bones) bones[b.name] = b;
  for (const [role, clip] of Object.entries(clips)) {
    if (!clip) throw new Error(`hunter-mesh-avatar: role ${role}: clip absent`);
    bindClipToRig(clip, bones, role);
  }
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
    o.frustumCulled = false; // skinned bounds are bind-pose bounds; see mesh-hunter.md trap 1
    if (o.isSkinnedMesh) skinned++;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) if (m?.map) baked++;
  });
  return { skinned, baked };
}

async function loadGltf(loader, url) {
  try {
    return await loader.loadAsync(url);
  } catch (err) {
    throw new Error(`hunter-mesh-avatar: failed to load ${url}. ${PACK_HINT} ${err?.message ?? err}`);
  }
}

export async function createHunterMeshAvatar(opts = {}) {
  const H = opts.height ?? DEFAULT_H;
  const base = opts.base ?? HUNTER_PACK.base;
  const bodyFile = HUNTER_PACK.body;
  const files = HUNTER_PACK.files;

  const unique = [...new Set([bodyFile, ...Object.values(files)])];
  const loader = new GLTFLoader();
  const loaded = new Map();
  await Promise.all(unique.map(async (file) => {
    loaded.set(file, await loadGltf(loader, `${base}/${file}`));
  }));

  const bodyGltf = loaded.get(bodyFile);
  if (!bodyGltf) throw new Error(`hunter-mesh-avatar: body ${bodyFile} did not load. ${PACK_HINT}`);
  const rig = bodyGltf.scene;
  const { bindHeight, scale } = standOnGround(rig, H, `${base}/${bodyFile}`);
  const { skinned, baked } = prepareMeshes(rig);
  if (!skinned) throw new Error('hunter-mesh-avatar: no SkinnedMesh — this is not a rigged file');
  if (baked === 0) {
    console.warn(`[hunter-mesh-avatar] ${bodyFile} has no baked colour map; leaving Meshy materials as they arrived`);
  }

  const group = new THREE.Group();
  group.name = 'hunter-mesh-avatar';
  group.add(rig);

  const bones = {};
  rig.traverse((o) => { if (o.isBone) bones[o.name] = o; });

  const mixer = new THREE.AnimationMixer(rig);
  const actions = {};
  const clips = {};
  const bindNotes = [];

  const takeClip = (file, key) => {
    const gltf = loaded.get(file);
    const src = gltf?.animations?.[0];
    if (!src) {
      throw new Error(`hunter-mesh-avatar: ${file} has no animation. `
        + `Available: ${(gltf?.animations ?? []).map((a) => a.name).join(', ') || '(none)'}. ${PACK_HINT}`);
    }
    const { clip, remapped, tracks } = bindClipToRig(src, bones, key);
    stripRootXZ(clip);
    clips[key] = clip;
    bindNotes.push({ key, file, src: src.name, remapped, tracks, duration: clip.duration });
    const a = mixer.clipAction(clip);
    a.enabled = true;
    a.setEffectiveWeight(key === 'walk' ? 1 : 0);
    a.play();
    actions[key] = a;
    return clip;
  };

  takeClip(files.walk, 'walk');
  takeClip(files.run, 'run');
  takeClip(files.attack, 'attack');
  takeClip(files.combo, 'combo');

  for (const role of ['attack', 'combo']) {
    actions[role].setLoop(THREE.LoopOnce, 1);
    actions[role].clampWhenFinished = false;
    actions[role].stop();
  }

  let strike = null; // { action, delay, offset } — pending cue, started when delay hits 0

  console.log(`[hunter-mesh-avatar] ${bodyFile}: ${skinned} skinned, ${baked} baked, `
    + `${Object.keys(bones).length} bones, scaled x${scale.toFixed(4)} `
    + `(bind ${bindHeight.toFixed(3)} m → ${H} m)`);
  for (const n of bindNotes) {
    console.log(`[hunter-mesh-avatar]   ${n.key}: ${n.file} "${n.src}" `
      + `${n.duration.toFixed(2)}s tracks=${n.tracks} remapped=${n.remapped}`);
  }

  const api = {
    group,
    mixer,
    clips,
    bindNotes,
    sourceFile: bodyFile,
    pending: [
      'extra-arm skin weights: Meshy biped auto-rig — grafted limbs will deform wrong; do not fake-paint in JS',
      'silhouette vs locked six-arm art (Dev Art 1785288883855) — judge in the doorway; hunter stays a door',
      'scan: baked clips cannot look where the AI looks; needs an additive neck override or a head-turn clip',
    ],

    /** Stage morphs are skipped. This body IS the stage-3 silhouette. Materials stay baked. */
    setStage(_s) { /* no-op: do not overwrite Meshy textures with the procedural grime ramp */ },

    /**
     * Line the fist up with the damage frame: the AI calls this THE MOMENT it sets a strike
     * clock of `windLeft` seconds. The clip starts so its measured `contact` lands exactly
     * when that clock hits zero — late start if the wind is long, mid-clip entry if short.
     */
    cueStrike(role, windLeft) {
      const s = swingFor(role) ?? swingFor('attack');
      const a = actions[s.role];
      if (!a) return;
      const contact = s.contact > 0 ? s.contact : Math.min(0.5, a.getClip().duration * 0.4);
      const lead = Math.max(0, windLeft ?? 0);
      if (contact <= lead) {
        strike = { action: a, delay: lead - contact, offset: 0 };
      } else {
        strike = { action: a, delay: 0, offset: contact - lead };
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
      const want = striking ? { walk: 0, run: 0 }
        : speed > 2.4 ? { walk: 0, run: 1 }
          : { walk: 1, run: 0 };
      for (const r of ['walk', 'run']) {
        const w = actions[r].getEffectiveWeight();
        actions[r].setEffectiveWeight(w + (want[r] - w) * Math.min(1, dt * 8));
      }
      const still = speed < 0.25;
      const rate = still ? 0.18 : 1;
      if (!striking) {
        actions.walk.setEffectiveTimeScale(rate);
        actions.run.setEffectiveTimeScale(rate);
      }
      mixer.update(dt);
    },

    dispose() {
      mixer.stopAllAction();
      rig.traverse((o) => { if (o.isMesh || o.isSkinnedMesh) o.geometry?.dispose?.(); });
    },
  };

  return api;
}
