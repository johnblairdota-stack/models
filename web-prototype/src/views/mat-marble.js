import * as THREE from 'three';
import { studio, specimenRig, roundedBox } from './_studio.js';
import { marbleFloor, marbleSlab, marbleDark } from '../materials/surfaces/marble.js';

export default async function view() {
  // A mid-grey cyc, not the art-sheet near-white. Polished stone is mostly specular, and
  // against a white backdrop the reflection swamps the albedo — you end up tuning a
  // material you cannot actually see. The Dev Art sheets are near-white because they are
  // sheets of a *robot*; stone has to be judged with something in the frame darker than it.
  const engine = await studio({
    bg: 0x4e535a,
    envIntensity: 0.62,
    cameraPos: [0.15, 1.35, 3.05],
    target: [0.05, 0.52, 0],
    fov: 36,
  });

  const floorMat = marbleFloor({ repeat: [2, 2] });
  const slabMat = marbleSlab();
  const darkMat = marbleDark();

  // the floor, at the angle you actually see it in game
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  engine.scene.add(floor);

  // a polished slab standing up: grazing angle, shows the normal map honestly
  const slab = new THREE.Mesh(roundedBox(1.25, 1.0, 0.075, 0.008, 2), slabMat);
  slab.position.set(-0.72, 0.5, -0.2);
  slab.rotation.y = 0.42;
  slab.castShadow = slab.receiveShadow = true;
  engine.scene.add(slab);

  // sphere in the dark stone: proves the BRDF
  const sph = new THREE.Mesh(new THREE.SphereGeometry(0.3, 96, 64), darkMat);
  sph.position.set(0.62, 0.3, 0.25);
  sph.castShadow = sph.receiveShadow = true;
  engine.scene.add(sph);

  // a stair nosing in the dark stone: shows the material on a real architectural profile
  const step = new THREE.Mesh(roundedBox(1.5, 0.17, 0.5, 0.014, 2), darkMat);
  step.position.set(0.75, 0.085, -0.95);
  step.castShadow = step.receiveShadow = true;
  engine.scene.add(step);

  // chrome ball to show the environment is real
  const cb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 48, 32),
    new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.04 }));
  cb.position.set(-0.05, 0.12, 0.85);
  cb.castShadow = true;
  engine.scene.add(cb);

  engine.finalizeScene();
  engine.markReady();
  engine.start();
  return engine;
}
