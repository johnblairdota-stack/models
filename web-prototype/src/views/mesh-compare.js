import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { studio, labels } from './_studio.js';
import { buildUnit4H } from '../characters/unit4h.js';
import { unit4hMaterials, brandReady } from '../materials/surfaces/robot.js';
import { fitCamera } from './hunter-stage.js';

/**
 * THE DECISION VIEW — the conditioned generated mesh beside the procedural player.
 *
 * This exists to answer ONE question John asked and nobody can answer from numbers: is a
 * generated-and-conditioned mesh actually better than the hand-built `buildUnit4H`? Both
 * figures stand on one ground line, at one scale, under one lighting rig, because that is the
 * only way the comparison means anything — the whole reason `hunter.sheet` exists is that a
 * ramp cannot be judged from separate captures, and neither can this.
 *
 * LEFT is the procedural player. RIGHT is the mesh. No labels in the frame on purpose:
 * `rrr-critique`'s identification gate needs a picture that does not answer its own question,
 * and John should be able to look at this cold and say which one he wants.
 *
 * ⚠️ THE MESH IS DELIBERATELY GIVEN THE PROJECT'S OWN SHELL MATERIAL, not whatever the
 * generator shipped. Plan Step 6: strip the baked textures and re-material from the shared
 * palette. Comparing a photogrammetry-ish baked texture against a GPU-baked procedural surface
 * would be comparing lighting, not geometry, and geometry is the question. (This asset arrived
 * with no materials at all — shape-only generation — so there is nothing to strip.)
 */
export default async function view(args = {}) {
  const H = 1.7;
  const engine = await studio({
    cameraPos: [0, H * 0.55, H * 2.6],
    target: [0, H * 0.5, 0],
    fov: 32,
    bg: 0xeeeeee,
    envIntensity: 1.0,
    shadowExtent: H * 1.6,
  });

  const mats = unit4hMaterials({});

  // --- LEFT: the procedural player, exactly as every other view builds it
  const player = buildUnit4H({ height: H });
  player.setPose({
    shoulderL: [0, 0, 0.13], shoulderR: [0, 0, -0.13],
    elbowL: [0.10, 0, 0.05], elbowR: [0.10, 0, -0.05],
  });
  player.root.position.set(-0.55, 0, 0);
  engine.scene.add(player.root);

  // --- RIGHT: the conditioned GLB
  const url = args.params?.get?.('mesh') ?? '/models/rrr_char_player_v1.glb';
  const gltf = await new GLTFLoader().loadAsync(url);
  const mesh = gltf.scene;

  /*
   * The conditioning script already put this at 1.7 m with its origin between the feet on the
   * ground, so nothing here rescales or re-origins it — if it needed that, the script failed
   * and this view should show it failing rather than paper over it. Position is the only thing
   * set, and only to stand it beside the player.
   */
  mesh.position.set(0.55, 0, 0);

  /*
   * `?parts=1` paints each split part a different hue. This is a DIAGNOSTIC frame, not a beauty
   * one: the whole question about a Blender-side split is "did it cut in sensible places", and
   * one flat shell material makes a perfect split and a catastrophic one look identical. Hue is
   * derived from the part name so a given joint keeps its colour between runs — a part that
   * changes colour has changed OWNER, which is the thing worth noticing.
   */
  const showParts = (args.params?.get?.('parts') ?? '0') !== '0';
  const partNames = [];
  mesh.traverse((o) => {
    if (!o.isMesh) return;
    partNames.push(o.name);
    if (showParts) {
      let h = 0;
      for (let i = 0; i < o.name.length; i++) h = (h * 31 + o.name.charCodeAt(i)) >>> 0;
      o.material = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL((h % 360) / 360, 0.58, 0.55),
        roughness: 0.55, metalness: 0.0,
      });
    } else {
      o.material = mats.shell;
    }
    o.castShadow = true;
    o.receiveShadow = true;
  });
  engine.scene.add(mesh);
  if (partNames.length > 1) console.log(`[mesh-compare] ${partNames.length} parts: ${partNames.join(', ')}`);

  // Report what actually arrived, so a silent load failure cannot masquerade as a thin robot.
  let tris = 0;
  mesh.traverse((o) => { if (o.isMesh && o.geometry?.index) tris += o.geometry.index.count / 3; });
  const box = new THREE.Box3().setFromObject(mesh);
  const mh = box.max.y - box.min.y;
  console.log(`[mesh-compare] ${url} — ${tris.toLocaleString()} tris, height ${mh.toFixed(3)}m, base y ${box.min.y.toFixed(4)}`);
  if (tris === 0) throw new Error(`mesh-compare: ${url} loaded but contains no triangles`);

  fitCamera(engine, [player.root, mesh], 32, 18 * Math.PI / 180, 0.10, 1.06);

  if ((args.params?.get?.('label') ?? '1') !== '0') {
    labels([
      { text: 'PROCEDURAL  ·  GENERATED', x: 50, y: 6,
        font: '600 15px/1.2 ui-sans-serif, system-ui, sans-serif' },
      { text: `buildUnit4H  vs  ${url.split('/').pop()}  ·  ${tris.toLocaleString()} tris`,
        x: 50, y: 10.5, font: '500 11px/1.2 ui-monospace, Menlo, monospace', color: '#6a7178' },
    ]);
  }

  engine.finalizeScene();
  await brandReady();
  engine.markReady();
  engine.start();
  return engine;
}
