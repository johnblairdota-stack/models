/**
 * Blank smash-lab world: floor, four walls, furniture colliders, raycast + collide.
 * Duck-types the Player `world` API used by `_swingCast` / ThirdPersonCamera.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FurnProp, furnBox, FURN_HP } from '../destruction/furnprop.js';
import { makeFurnHandlers } from '../destruction/furn-fx.js';
import { FurnVoxelBody } from '../destruction/furn-voxels.js';
import { FURN_SMASH_ASSETS } from './furn-catalog.js';
import { FURN_FIT_BOOST, fitCatalogProp } from './furn-fit.js';

export const LAB = {
  x0: -26, x1: 26, z0: -11, z1: 11, y0: 0, y1: 7.5,
  floorY: 0,
  spacing: 3.6,
  rowZ: 3.6,
  cols: 12,
  /** Extra uniform scale after targetH/maxSpan — Meshy native chairs read as toys next to UNIT-4H. */
  boost: FURN_FIT_BOOST,
};

const HIT_H = 1.25;
const WALL_T = 0.35;

const _inv = new THREE.Vector3();
function rayBox(o, d, b) {
  _inv.set(1 / (d.x || 1e-9), 1 / (d.y || 1e-9), 1 / (d.z || 1e-9));
  let t0 = (b.min.x - o.x) * _inv.x, t1 = (b.max.x - o.x) * _inv.x;
  let tmin = Math.min(t0, t1), tmax = Math.max(t0, t1);
  t0 = (b.min.y - o.y) * _inv.y; t1 = (b.max.y - o.y) * _inv.y;
  tmin = Math.max(tmin, Math.min(t0, t1)); tmax = Math.min(tmax, Math.max(t0, t1));
  t0 = (b.min.z - o.z) * _inv.z; t1 = (b.max.z - o.z) * _inv.z;
  tmin = Math.max(tmin, Math.min(t0, t1)); tmax = Math.min(tmax, Math.max(t0, t1));
  if (tmax < Math.max(tmin, 0)) return null;
  return tmin >= 0 ? tmin : tmax;
}

function boxNormal(b, o, d, t) {
  const p = o.clone().addScaledVector(d, t);
  const e = 1e-3;
  if (Math.abs(p.x - b.min.x) < e) return new THREE.Vector3(-1, 0, 0);
  if (Math.abs(p.x - b.max.x) < e) return new THREE.Vector3(1, 0, 0);
  if (Math.abs(p.y - b.min.y) < e) return new THREE.Vector3(0, -1, 0);
  if (Math.abs(p.y - b.max.y) < e) return new THREE.Vector3(0, 1, 0);
  if (Math.abs(p.z - b.min.z) < e) return new THREE.Vector3(0, 0, -1);
  return new THREE.Vector3(0, 0, 1);
}

function fitProp(scene, spec) {
  return fitCatalogProp(scene, spec, { boost: LAB.boost });
}

function dressCameraMaterial(mat) {
  if (!mat) return mat;
  const m = mat.clone();
  m.side = THREE.DoubleSide;
  m.emissiveMap = null;
  m.metalnessMap = null;
  m.emissive.setRGB(0.18, 0.16, 0.14);
  m.emissiveIntensity = 0.7;
  m.metalness = Math.min(m.metalness ?? 0.12, 0.12);
  m.roughness = Math.max(m.roughness ?? 0.55, 0.45);
  m.envMapIntensity = 0.75;
  m.needsUpdate = true;
  return m;
}

function slotPos(i) {
  const col = i % LAB.cols;
  const row = Math.floor(i / LAB.cols);
  const startX = -((LAB.cols - 1) * LAB.spacing) * 0.5;
  return {
    x: startX + col * LAB.spacing,
    z: row === 0 ? LAB.rowZ : -LAB.rowZ,
  };
}

function wallBoxes() {
  const { x0, x1, z0, z1, y0, y1 } = LAB;
  const h = y1 - y0;
  return [
    furnBox((x0 + x1) * 0.5, y0, z0 - WALL_T * 0.5, x1 - x0 + WALL_T * 2, h, WALL_T),
    furnBox((x0 + x1) * 0.5, y0, z1 + WALL_T * 0.5, x1 - x0 + WALL_T * 2, h, WALL_T),
    furnBox(x0 - WALL_T * 0.5, y0, (z0 + z1) * 0.5, WALL_T, h, z1 - z0 + WALL_T * 2),
    furnBox(x1 + WALL_T * 0.5, y0, (z0 + z1) * 0.5, WALL_T, h, z1 - z0 + WALL_T * 2),
  ];
}

function resolveAabb(pos, r, boxes) {
  const p = pos.clone();
  for (let n = 0; n < 4; n++) {
    for (const b of boxes) {
      if (p.x + r <= b.min.x || p.x - r >= b.max.x) continue;
      if (p.z + r <= b.min.z || p.z - r >= b.max.z) continue;
      if (p.y + 1.2 <= b.min.y || p.y >= b.max.y) continue;
      const dxL = (p.x + r) - b.min.x;
      const dxR = b.max.x - (p.x - r);
      const dzN = (p.z + r) - b.min.z;
      const dzF = b.max.z - (p.z - r);
      const m = Math.min(dxL, dxR, dzN, dzF);
      if (m === dxL) p.x = b.min.x - r;
      else if (m === dxR) p.x = b.max.x + r;
      else if (m === dzN) p.z = b.min.z - r;
      else p.z = b.max.z + r;
    }
  }
  p.x = Math.min(LAB.x1 - r, Math.max(LAB.x0 + r, p.x));
  p.z = Math.min(LAB.z1 - r, Math.max(LAB.z0 + r, p.z));
  return p;
}

/**
 * Build the empty room mesh + smash world.
 * @returns {Promise<object>} lab world hung on engine.room
 */
export async function buildSmashLab(scene, { debris, dust } = {}) {
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x7a756c, roughness: 0.92, metalness: 0.02,
  });
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x9a958c, roughness: 0.9, metalness: 0.02,
  });
  const ceilMat = new THREE.MeshStandardMaterial({
    color: 0xddd8ce, roughness: 0.95, metalness: 0,
  });

  const root = new THREE.Group();
  root.name = 'smashLab';
  const fw = LAB.x1 - LAB.x0;
  const fd = LAB.z1 - LAB.z0;
  const floor = new THREE.Mesh(new THREE.BoxGeometry(fw, 0.08, fd), floorMat);
  floor.position.set(0, -0.04, 0);
  floor.receiveShadow = true;
  root.add(floor);
  const mkWall = (w, h, d, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    m.position.set(x, y, z);
    root.add(m);
  };
  const hh = LAB.y1;
  mkWall(fw + WALL_T * 2, hh, WALL_T, 0, hh * 0.5, LAB.z0 - WALL_T * 0.5);
  mkWall(fw + WALL_T * 2, hh, WALL_T, 0, hh * 0.5, LAB.z1 + WALL_T * 0.5);
  mkWall(WALL_T, hh, fd + WALL_T * 2, LAB.x0 - WALL_T * 0.5, hh * 0.5, 0);
  mkWall(WALL_T, hh, fd + WALL_T * 2, LAB.x1 + WALL_T * 0.5, hh * 0.5, 0);
  const ceil = new THREE.Mesh(new THREE.BoxGeometry(fw, 0.08, fd), ceilMat);
  ceil.position.set(0, LAB.y1, 0);
  root.add(ceil);
  scene.add(root);

  const walls = wallBoxes();
  const furnProps = [];
  const colliders = [...walls];
  const space = { id: 'lab', colliders, panels: [], root };

  function dropFurn(fp) {
    if (!fp || fp._colDropped) return;
    const i = colliders.indexOf(fp.box);
    if (i >= 0) colliders.splice(i, 1);
    fp._colDropped = true;
  }

  function registerFurn(fp) {
    if (!fp?.box) return fp;
    fp.box._furn = fp;
    fp.box._space = space;
    if (!colliders.includes(fp.box)) colliders.push(fp.box);
    fp._colDropped = false;
    const prev = fp.onBreak;
    fp.onBreak = (prop, info) => {
      dropFurn(prop);
      prev?.(prop, info);
    };
    furnProps.push(fp);
    return fp;
  }

  function collide(pos, radius) {
    const live = colliders.filter((b) => {
      if (b._furn && !b._furn.blocksMove) return false;
      if (b._furn?.kind === 'rug') return false;
      if (b._furn && (b.max.y - b.min.y) < 0.15) return false;
      return true;
    });
    return resolveAabb(pos, radius, live);
  }

  function castRay(origin, dir, maxDist = 60) {
    let best = null;
    for (const b of colliders) {
      const rb = b._furn?.hitBox ?? b;
      const h = rayBox(origin, dir, rb);
      if (h == null || h < 0 || h > maxDist) continue;
      if (!best || h < best.distance) {
        best = {
          distance: h,
          panel: null,
          furn: b._furn ?? null,
          partId: b._furnPart ?? null,
          point: origin.clone().addScaledVector(dir, h),
          normal: boxNormal(rb, origin, dir, h),
        };
      }
    }
    return best;
  }

  const handlers = makeFurnHandlers({ debris, dust });
  const { onBreak, onStage } = handlers;
  const loader = new GLTFLoader();
  const missing = [];
  let placed = 0;

  for (let i = 0; i < FURN_SMASH_ASSETS.length; i++) {
    const spec = FURN_SMASH_ASSETS[i];
    const url = `/models/furn/${spec.file}`;
    let gltf;
    try {
      gltf = await loader.loadAsync(url);
    } catch (err) {
      missing.push(spec.id);
      console.warn(`[furn.smash] missing ${url}`, err?.message || err);
      continue;
    }
    const wrap = new THREE.Group();
    wrap.name = `smash.${spec.id}`;
    wrap.add(gltf.scene);
    wrap.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
      if (spec.kind === 'camera' && o.material) {
        if (Array.isArray(o.material)) o.material = o.material.map(dressCameraMaterial);
        else o.material = dressCameraMaterial(o.material);
      } else if (spec.thin && o.material) {
        o.material.side = THREE.DoubleSide;
        o.material.needsUpdate = true;
      }
    });
    const dim = fitProp(gltf.scene, spec);
    wrap.userData.meshDim = dim;
    const slot = slotPos(i);
    const lift = spec.liftY ?? 0;
    wrap.position.set(slot.x, lift, slot.z);
    space.root.add(wrap);

    const boxY = spec.thin ? 0 : 0;
    const boxH = spec.thin ? 0.45 : Math.max(dim.h + lift, HIT_H);
    const box = furnBox(slot.x, boxY, slot.z, Math.max(dim.w, 0.35), boxH, Math.max(dim.d, 0.35));
    const fp = registerFurn(new FurnProp({
      id: `smash.${spec.id}`,
      spaceId: 'lab',
      box,
      mesh: wrap,
      kind: spec.kind,
      health: spec.health ?? FURN_HP[spec.kind] ?? 1.2,
      onBreak,
      onStage,
    }));
    fp.voxels = null;
    const voxMode = spec.vox ?? (spec.thin || spec.kind === 'camera' ? 'off'
      : spec.kind === 'crate' ? 'shell' : 'solid');
    if (voxMode !== 'off') {
      fp.voxels = new FurnVoxelBody({
        prop: fp, root: wrap, debris, dust,
        floorY: LAB.floorY,
        hang: (spec.liftY ?? 0) >= 1,
        mode: voxMode,
      });
    }
    const meshBox = new THREE.Box3().setFromObject(wrap);
    fp.box.copy(meshBox);
    if (spec.thin) {
      fp.box.min.y = 0;
      fp.box.max.y = Math.max(0.45, meshBox.max.y);
      if (fp.hitBox) fp.hitBox.copy(fp.box);
    }
    placed++;
  }

  const lab = {
    floorY: LAB.floorY,
    furnProps,
    registerFurn,
    collide,
    castRay,
    spaces: [space],
    root,
    missing,
    placed,
    slotPos,
    update(dt) {
      for (const fp of furnProps) fp.update?.(dt);
    },
  };
  return lab;
}
