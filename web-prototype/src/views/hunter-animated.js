import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { studio, labels } from './_studio.js';
import { fitCamera } from './hunter-stage.js';

/**
 * THE SKINNED MESHY HUNTER — stage-3 auto-rig, one clip at a time.
 *
 * Same job as the SOLO path of `mesh.animated`: load a Meshy-rigged GLB, stand it on the
 * ground at a contract height, play a clip, orbit. Different body, different clip table.
 * Do not overload `mesh.animated` — that table is the Lumi / Friendly player set, and a
 * stale `?clip=` there already once rendered the wrong robot with no error.
 *
 * ⚠️ MATERIALS STAY AS THEY ARRIVE. The hunter pack is textured in Meshy. This view does
 * not run the identity kit, the wordmark, or `shellWhite()` — those exist to dress a
 * material-less player body. Replacing a baked atlas with the procedural shell would throw
 * the texture away and look like a different asset.
 *
 * ⚠️ SCALE AND GROUNDING HAPPEN HERE. Same rule as `mesh.animated`: measure the BIND pose,
 * scale to height, drop the feet on y=0. The hunter is larger than the 1.7 m player;
 * default is 3.0 m (`?height=` overrides). Measuring mid-stride would make every later
 * number depend on which frame you happened to sample.
 */
const CLIPS = {
  walking: 'walking.glb',
  running: 'running.glb',
  frankenstein: 'frankenstein-walk.glb',
  orc: 'slow-orc-walk.glb',
  'jump-attack': 'jump-attack.glb',
  'left-slash': 'left-slash.glb',
  attack: 'attack.glb',
  'double-combo': 'double-combo-attack.glb',
};

const DEFAULT_H = 3.0;

function clipFile(which) {
  const file = CLIPS[which];
  if (!file) {
    throw new Error(`hunter-animated: no such ?clip=${which}. Valid keys: `
      + `${Object.keys(CLIPS).join(', ')}.`);
  }
  return file;
}

/**
 * `Number(null) === 0` and that shipped a black frame on `mesh.animated`. An absent
 * `?height=` must stay the default, not become a zero-metre hunter.
 */
function heightOf(params) {
  const raw = params?.get?.('height');
  if (raw === null || raw === undefined || raw === '') return DEFAULT_H;
  const v = Number(raw);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_H;
}

function standOnGround(rig, H, url) {
  rig.updateWorldMatrix(true, true);
  const b0 = new THREE.Box3().setFromObject(rig);
  const h0 = b0.max.y - b0.min.y;
  if (!(h0 > 0)) throw new Error(`hunter-animated: ${url} has zero height — load failed`);
  const s = H / h0;
  rig.scale.setScalar(s);
  rig.updateWorldMatrix(true, true);
  const b1 = new THREE.Box3().setFromObject(rig);
  rig.position.set(0, -b1.min.y, 0);
  return s;
}

function prepareMeshes(rig) {
  let skinned = 0;
  let tris = 0;
  rig.traverse((o) => {
    if (!o.isMesh && !o.isSkinnedMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    // Bind-pose bounds go stale the moment a limb swings out; culling then drops an arm.
    o.frustumCulled = false;
    if (o.isSkinnedMesh) skinned++;
    if (o.geometry?.index) tris += o.geometry.index.count / 3;
    else if (o.geometry?.attributes?.position) {
      tris += o.geometry.attributes.position.count / 3;
    }
  });
  return { skinned, tris: Math.round(tris) };
}

export default async function view(args = {}) {
  const params = args.params;
  const H = heightOf(params);
  const which = params?.get?.('clip') ?? 'walking';
  const file = clipFile(which);
  const url = `/models/anim/hunter/${file}`;

  const engine = await studio({
    cameraPos: [0, H * 0.55, H * 2.6],
    target: [0, H * 0.5, 0],
    fov: 32,
    bg: 0xeeeeee,
    envIntensity: 1.0,
    shadowExtent: H * 1.8,
  });

  const loader = new GLTFLoader();
  let gltf;
  try {
    gltf = await loader.loadAsync(url);
  } catch (err) {
    throw new Error(`hunter-animated: failed to load ${url}. `
      + 'Copy the Meshy hunter pack into public/models/anim/hunter/ '
      + `(from assets/hunter-meshy/03-rig and 04-anims). ${err?.message ?? err}`);
  }

  const rig = gltf.scene;
  const s = standOnGround(rig, H, url);
  const { skinned, tris } = prepareMeshes(rig);
  if (!skinned) {
    throw new Error(`hunter-animated: ${url} has no SkinnedMesh — this is not a rigged file`);
  }
  engine.scene.add(rig);

  const mixer = new THREE.AnimationMixer(rig);
  const wantAnim = params?.get?.('anim');
  const clip = wantAnim
    ? (gltf.animations ?? []).find((a) => a.name === wantAnim)
    : gltf.animations?.[0];
  if (!clip) {
    throw new Error(`hunter-animated: ${url} has no clip ${wantAnim ? `named "${wantAnim}"` : 'at all'}`
      + `. Available: ${(gltf.animations ?? []).map((a) => a.name).join(', ') || '(none)'}`);
  }

  /*
   * `?bind=1` leaves the rig in its BIND pose. `at=0` is frame 0 of the clip, which is
   * already a posed frame — not starting the mixer is the only way to reach bind.
   */
  const bindPose = (params?.get?.('bind') ?? '0') !== '0';
  if (!bindPose) {
    const action = mixer.clipAction(clip);
    action.play();
    engine.onUpdate((dt) => mixer.update(dt));
    let firstSkinned = null;
    rig.traverse((o) => { if (o.isSkinnedMesh && !firstSkinned) firstSkinned = o; });
    window.__rrr.anim = { mixer, action, clip, skinned: firstSkinned, rig };
  } else {
    console.log('[hunter-animated] ?bind=1 — mixer not started, rig held in its BIND pose');
  }

  console.log(`[hunter-animated] ${file}: ${tris.toLocaleString()} tris, ${skinned} skinned mesh(es), `
    + `clip "${clip.name}" ${clip.duration.toFixed(2)}s, scaled x${s.toFixed(4)} to ${H} m`);

  fitCamera(engine, [rig], 32, 0, 0.10, 1.14);

  const azimDeg = Number(params?.get?.('azim') ?? 0);
  if (Number.isFinite(azimDeg) && azimDeg !== 0) {
    rig.rotation.y += azimDeg * Math.PI / 180;
    rig.updateMatrixWorld(true);
    console.log(`[hunter-animated] azim ${azimDeg} deg — subject turned, camera and lights fixed`);
  }

  if ((params?.get?.('label') ?? '1') !== '0') {
    labels([
      { text: `MESHY HUNTER  ·  ${which.toUpperCase()}`,
        x: 50, y: 6, font: '600 15px/1.2 ui-sans-serif, system-ui, sans-serif' },
      { text: `${tris.toLocaleString()} tris  ·  skinned  ·  ${clip.duration.toFixed(2)}s  ·  ${H.toFixed(2)} m`,
        x: 50, y: 10.5, font: '500 11px/1.2 ui-monospace, Menlo, monospace', color: '#6a7178' },
    ]);
  }

  /*
   * Clip picker. Each hunter clip is its own GLB (Meshy exports them that way), so the
   * dropdown rewrites `?clip=` and reloads. That is the same switch as the address bar,
   * just clickable. `?ui=0` hides it so a capture is a clean frame.
   *
   * Arrow keys step the list; Esc is unused here (a reload-to-bind would fight orbit).
   * Address-bar equivalent: add `&clip=running` (or any key below).
   */
  if ((params?.get?.('ui') ?? '1') !== '0') attachClipPicker(which);

  engine.finalizeScene();
  engine.markReady();
  engine.start();
  return engine;
}

function attachClipPicker(current) {
  const keys = Object.keys(CLIPS);
  const bar = document.createElement('div');
  bar.style.cssText = `position:fixed;left:0;right:0;bottom:0;z-index:30;padding:7px 10px;
    display:flex;gap:9px;align-items:center;
    background:rgba(20,22,25,.88);font:12px/1.3 ui-monospace,Menlo,Consolas,monospace`;

  const tag = document.createElement('span');
  tag.textContent = 'hunter clips';
  tag.style.cssText = 'color:#8b949e;letter-spacing:.06em;white-space:nowrap';
  bar.appendChild(tag);

  const sel = document.createElement('select');
  sel.style.cssText = `flex:0 1 380px;padding:4px 6px;border:1px solid #30363d;border-radius:4px;
    background:#21262d;color:#c9d1d9;font:inherit;cursor:pointer`;
  for (const key of keys) {
    const o = document.createElement('option');
    o.value = key;
    o.textContent = `${key}  ·  ${CLIPS[key]}`;
    sel.appendChild(o);
  }
  sel.value = current;
  bar.appendChild(sel);

  const readout = document.createElement('span');
  readout.style.cssText = 'color:#8b949e;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
  readout.textContent = CLIPS[current] ?? '';
  bar.appendChild(readout);

  const go = (key) => {
    if (!CLIPS[key] || key === current) return;
    const next = new URL(location.href);
    next.searchParams.set('clip', key);
    location.assign(next.toString());
  };

  sel.onchange = () => go(sel.value);

  const step = (d) => {
    const i = keys.indexOf(sel.value);
    const next = keys[Math.min(keys.length - 1, Math.max(0, (i < 0 ? 0 : i) + d))];
    if (next) { sel.value = next; go(next); }
  };
  window.addEventListener('keydown', (e) => {
    if (e.target === sel) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { step(1); e.preventDefault(); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { step(-1); e.preventDefault(); }
  });

  const hint = document.createElement('span');
  hint.textContent = '← → step  ·  or type ?clip= in the address bar';
  hint.style.cssText = 'color:#484f58;margin-left:auto;white-space:nowrap';
  bar.appendChild(hint);

  document.body.appendChild(bar);
}
