/**
 * Shared Meshy smash-prop fit. Smash lab, `?furnline=1`, and mansion catalog dress
 * must agree on size — `targetH` / `maxSpan` are the fitted metres, not AABB-only.
 *
 * John / playtest follow-up 2026-08-23: `dressCatalogFurniture` used to park the raw
 * `gltf.scene` and only stamp `maxSpan` on the collider. Props read as toys (or giants)
 * next to UNIT-4H. This is the one scaler.
 */

import * as THREE from 'three';
import { FURN_FIT_BOOST } from './furn-catalog.js';

export { FURN_FIT_BOOST };

function measure(scene) {
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  const size = new THREE.Vector3();
  box.getSize(size);
  return { box, size };
}

/** Meshy rugs are a disc in local XY (thin Z). Pin them to the floor. */
function layFlat(scene) {
  scene.rotation.set(-Math.PI / 2, 0, 0);
  scene.updateMatrixWorld(true);
  const { size } = measure(scene);
  if (size.y <= size.x && size.y <= size.z) return;
  scene.rotation.set(0, 0, Math.PI / 2);
  scene.updateMatrixWorld(true);
}

/**
 * Scale + ground `scene` so a wrapper origin is floor centre (or liftY on the wrapper).
 * Same arithmetic the smash lab used; `boost` defaults to the lab's 1.55.
 *
 * @returns {{ w:number, h:number, d:number }}
 */
export function fitCatalogProp(scene, spec, { boost = FURN_FIT_BOOST } = {}) {
  if (spec?.thin) layFlat(scene);
  let { box, size } = measure(scene);
  const span = Math.max(size.x, size.z, 1e-4);
  const sH = spec?.targetH ? spec.targetH / Math.max(size.y, 1e-4) : Infinity;
  const sW = spec?.maxSpan ? spec.maxSpan / span : Infinity;
  let s = Number.isFinite(Math.min(sH, sW)) ? Math.min(sH, sW) : 1;
  if (!spec?.thin) s *= boost;
  scene.scale.multiplyScalar(s);
  ({ box, size } = measure(scene));
  scene.position.x += -(box.min.x + box.max.x) * 0.5;
  scene.position.z += -(box.min.z + box.max.z) * 0.5;
  scene.position.y += -box.min.y;
  ({ size } = measure(scene));
  return { w: size.x, h: size.y, d: size.z };
}
