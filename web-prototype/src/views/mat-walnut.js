import * as THREE from 'three';
import { studio } from './_studio.js';
import { walnutPanel, walnutBoards, walnutParquet } from '../materials/surfaces/walnut.js';

/**
 * Walnut panelling + gilt mouldings + real floors, judged together because the estate
 * never shows one without the others (Dev Art 1785319916301).
 *
 * A mid-grey cyc, not the art-sheet near-white — see mat-marble.js for the reasoning.
 * Dark polished wood and burnished gold are both mostly specular; against a near-white
 * backdrop the reflection swamps the albedo and there is nothing left to judge the
 * material against.
 */
export default async function view() {
  const engine = await studio({
    bg: 0x4e535a,
    envIntensity: 1.05,
    cameraPos: [0.15, 1.55, 3.9],
    target: [0.05, 0.75, 0],
    fov: 40,
  });

  // Raking key light so the moulding relief and the gilt both actually catch light —
  // straight-on light flattens a bevel and gold reads as a flat yellow band, not metal.
  engine.lights.key.position.set(-3.4, 3.1, 1.8);
  engine.lights.key.intensity = 4.4;
  engine.lights.fill.intensity = 2.0;
  engine.lights.rim.intensity = 2.2;

  // ---- the panelled wall section: fills most of the frame, gilt on the mouldings
  const wallMat = walnutPanel({
    panelsX: 2, panelsY: 2, stile: 0.13, bevel: 0.030, grime: 0.85,
    gilt: 1.0, size: 1024,
  });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.5), wallMat);
  wall.position.set(0, 1.25, -0.55);
  wall.receiveShadow = true;
  engine.scene.add(wall);

  // ---- the floor, at the angle you actually see it in game
  const floorMat = walnutBoards({ size: 1024, grime: 0.35 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  engine.scene.add(floor);

  // ---- a small parquet patch, its own specimen sitting on the boards
  const parquetMat = walnutParquet({ size: 1024, grime: 0.3 });
  const parquet = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.0), parquetMat);
  parquet.rotation.x = -Math.PI / 2;
  parquet.position.set(0.85, 0.004, 0.5);
  parquet.receiveShadow = true;
  engine.scene.add(parquet);

  // ---- chrome ball to prove the environment is doing real work
  const cb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 48, 32),
    new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.04 }));
  cb.position.set(-0.7, 0.12, 0.7);
  cb.castShadow = true;
  engine.scene.add(cb);

  engine.finalizeScene();
  engine.markReady();
  engine.start();
  return engine;
}
