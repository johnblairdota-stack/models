import * as THREE from 'three';
import { studio } from './_studio.js';
import { damask } from '../materials/surfaces/wallpaper.js';
import { marbleFloor } from '../materials/surfaces/marble.js';

/**
 * Silk damask wallpaper, three colourways, judged as it actually hangs: a full-height
 * papered wall meeting the floor at a skirting, a smaller return panel at a grazing angle
 * so the sheen inversion is visible, and a torn-back sample patch over the skirting showing
 * the water staining and tide line. Per `BUILD_GUIDE.md` §4b — see that section for why
 * these composition rules are non-negotiable: a previous slice landed every shader change
 * correctly and still scored WEAK 48 because the wall floated, the frame was cropped, and
 * the specular clipped to white.
 *
 * A mid-grey cyc, not the art-sheet near-white — see mat-marble.js for the reasoning. The
 * ground here is deep sanguine red; against a near-white backdrop the reflection would
 * swamp the albedo before it ever reached the render.
 */
export default async function view() {
  const engine = await studio({
    bg: 0x4e535a,
    envIntensity: 0.62,
    cameraPos: [0.30, 1.42, 4.35],
    target: [0.25, 1.25, -0.30],
    fov: 38,
  });

  // Raking key so the weave, the sheen inversion and the tide line all actually catch
  // light — straight-on light flattens silk to a flat colour swatch.
  engine.lights.key.position.set(-3.3, 2.5, 2.0);
  engine.lights.key.intensity = 3.2;
  engine.lights.fill.intensity = 1.3;
  engine.lights.rim.intensity = 1.6;

  // ---- the floor: Carrara-and-Nero chequer, the salon floor these walls actually hang
  // over (refs/_sheets/hitman.png) — and, practically, light enough to read as a floor
  // against the near-black area above the cyc, which a dark board floor was not.
  const floorMat = marbleFloor({ repeat: [2, 2] });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  engine.scene.add(floor);

  const skirtingMat = new THREE.MeshStandardMaterial({
    color: 0xe4ddc9, roughness: 0.55, metalness: 0.0,
  });

  // ---- HERO SPECIMEN: the papered wall, full frame height, meeting the floor at a
  // skirting board — it must not float, and it must not be cropped (§4b rules 1 and 2).
  const WALL_W = 2.0, WALL_H = 2.7, WALL_Z = -1.0;
  const wallMat = damask({ colourway: 'sanguine', damp: 0.62, fade: 0.55, grime: 0.55 });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(WALL_W, WALL_H), wallMat);
  wall.position.set(0, WALL_H / 2, WALL_Z);
  wall.receiveShadow = true;
  engine.scene.add(wall);

  const skirting = new THREE.Mesh(new THREE.BoxGeometry(WALL_W + 0.02, 0.16, 0.04), skirtingMat);
  skirting.position.set(0, 0.08, WALL_Z + 0.021);
  skirting.castShadow = skirting.receiveShadow = true;
  engine.scene.add(skirting);

  // ---- SECOND, SMALLER PANEL at a grazing angle — a return wall forming the corner of a
  // room, angled steeply to the camera so the raking key crosses the weave edge-on and the
  // sheen inversion (the whole point of the material) is actually visible. Second colourway.
  const PANEL_W = 1.0, PANEL_H = 1.9;
  const panelMat = damask({
    colourway: 'sage', repeatX: 1.7, repeatY: 3.2, damp: 0.4, fade: 0.4, grime: 0.4,
  });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(PANEL_W, PANEL_H), panelMat);
  panel.position.set(1.30, PANEL_H / 2, 0.05);
  panel.rotation.y = 1.18; // steep, near edge-on to the camera — grazing, not flat-on
  panel.receiveShadow = true;
  engine.scene.add(panel);

  const panelSkirting = new THREE.Mesh(new THREE.BoxGeometry(PANEL_W + 0.02, 0.16, 0.04), skirtingMat);
  panelSkirting.position.copy(panel.position);
  panelSkirting.position.y = 0.08;
  panelSkirting.rotation.y = panel.rotation.y;
  panelSkirting.castShadow = panelSkirting.receiveShadow = true;
  engine.scene.add(panelSkirting);

  // ---- PATCH: a sample torn back to show the water staining and the tide line, mounted
  // directly above the skirting where the damp actually rises from — third colourway.
  const PATCH_W = 0.50, PATCH_H = 0.58;
  const patchMat = damask({
    colourway: 'oyster', repeatX: 1.1, repeatY: 1.0,
    damp: 0.95, fade: 0.1, grime: 0.25, chairRailY: 0.85,
  });
  const patch = new THREE.Mesh(new THREE.PlaneGeometry(PATCH_W, PATCH_H), patchMat);
  patch.position.set(0.62, 0.16 + PATCH_H / 2, WALL_Z + 0.008);
  patch.receiveShadow = true;
  engine.scene.add(patch);

  // ---- chrome ball, to prove the environment is doing real work
  const cb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 48, 32),
    new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.045 }));
  cb.position.set(-0.75, 0.12, 0.95);
  cb.castShadow = true;
  engine.scene.add(cb);

  engine.finalizeScene();
  engine.markReady();
  engine.start();
  return engine;
}
