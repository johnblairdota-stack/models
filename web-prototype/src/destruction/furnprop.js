/**
 * FURNPROP — collidable, sledge-destructible furniture.
 *
 * This is NOT a wall dig. Walls own a 2-D `DamageField` on planar faces. Furniture is a
 * volume with an AABB on `space.colliders` and discrete HP stages. See
 * `docs/slices/task-furn-destruct.md`.
 *
 * Stages (v2 — more readable damage before shatter):
 *   0 intact    blocksMove
 *   1 scuffed   blocksMove — darker tint, chip FX
 *   2 battered  blocksMove — darker still; optional band hide (shelf / overmantel)
 *   3 shattered no collider, mesh hidden, debris paid by the caller via onBreak
 *
 * `applyHit(point, power)` mirrors the wall panel call shape so `_resolveSledgeHit` branches
 * once. Power is the same units the sledge already uses (`SLEDGE_POWER` ≈ 1.0).
 */

import * as THREE from 'three';

export const FURN_STAGE = {
  INTACT: 0,
  SCUFFED: 1,
  BATTERED: 2,
  SHATTERED: 3,
};
export const FURN_STAGE_NAMES = ['intact', 'scuffed', 'battered', 'shattered'];

/** Total HP across the three damageable stages (0–2). Shatter at stage 3. */
export const FURN_HP = {
  chair: 1.2,
  desk: 2.4,
  console: 2.0,
  crate: 1.6,
  mound: 1.8,
  urn: 1.5,
  candelabra: 1.4,
  painting: 1.0,
  fireplace: 4.0,
  giltbox: 0.9,
  boarded: 1.8,
  camera: 1.0,
  trestle: 1.4,
  bench: 1.6,
  pew: 1.6,
  rug: 1.0,
};

const SCUFFED_TINT = new THREE.Color(0x8a7a68);
const BATTERED_TINT = new THREE.Color(0x5a4a3a);
const _hideScale = new THREE.Vector3(0, 0, 0);
const _one = new THREE.Color(1, 1, 1);
const _tipAxis = new THREE.Vector3();
const _tipQ = new THREE.Quaternion();

/**
 * @param {object} o
 * @param {string} o.id
 * @param {string} o.spaceId
 * @param {THREE.Box3} o.box          world AABB; tagged `box._furn = this` by the registrant
 * @param {THREE.Object3D} o.mesh     InstancedMesh or Mesh / Group
 * @param {number} [o.instanceIndex]  if mesh is InstancedMesh, which instance this is
 * @param {string} [o.kind='chair']
 * @param {number} [o.health]         total HP; defaults from FURN_HP[kind]
 * @param {function} [o.onBreak]      (prop, {point, normal, dir}) when entering shattered
 * @param {function} [o.onStage]      (prop, stage, info) on every stage change
 * @param {string[]} [o.hideBandsOnBattered]  userData.furnBand names to hide at battered
 */
export class FurnProp {
  constructor(o = {}) {
    this.id = o.id ?? 'furn';
    this.spaceId = o.spaceId ?? '';
    this.box = o.box;
    this.mesh = o.mesh ?? null;
    this.instanceIndex = o.instanceIndex ?? null;
    this.kind = o.kind ?? 'chair';
    this.onBreak = o.onBreak ?? null;
    this.onStage = o.onStage ?? null;
    this.hideBandsOnBattered = o.hideBandsOnBattered ?? null;

    const total = o.health ?? FURN_HP[this.kind] ?? 1.2;
    // Three equal damageable stages so intermediate looks read before shatter.
    const third = total / 3;
    this._stageHp = [third, third, third, 0];
    this.stage = FURN_STAGE.INTACT;
    this.stageHealth = this._stageHp[0];
    this._baseMatrix = null;
    this._baseColors = null;
    if (this.mesh?.isInstancedMesh && this.instanceIndex != null) {
      this._baseMatrix = new THREE.Matrix4();
      this.mesh.getMatrixAt(this.instanceIndex, this._baseMatrix);
      if (!this.mesh.instanceColor) {
        const n = this.mesh.count;
        this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3);
      }
    }
    /** Last hit readout for probes — plain fields, not events. */
    this._lastHit = null;
  }

  get name() { return FURN_STAGE_NAMES[this.stage] ?? 'unknown'; }
  get isShattered() { return this.stage >= FURN_STAGE.SHATTERED; }
  get blocksMove() { return this.stage < FURN_STAGE.SHATTERED; }
  get isDamageable() { return this.stage < FURN_STAGE.SHATTERED; }

  /**
   * Apply a sledge (or melee) blow. Safe to call when already shattered (no-op).
   * @returns {{ changed:boolean, from:number, to:number, removed:number,
   *   brokeThrough:boolean, depthAt:number, stage:number, barrier:boolean, blocked:boolean }}
   */
  applyHit(point, power) {
    const from = this.stage;
    const empty = {
      changed: false, from, to: from, removed: 0,
      brokeThrough: false, depthAt: this.isShattered ? 1 : 0,
      stage: from, barrier: false, blocked: false,
    };
    if (!Number.isFinite(power) || power <= 0) return empty;
    if (this.voxels) {
      const res = this.voxels.applyHit(point, power);
      this._lastHit = { point: point?.clone?.() ?? point, power, res };
      return res;
    }
    if (this.isShattered) return { ...empty, depthAt: 1, blocked: true };

    let remaining = power;
    let removed = 0;
    while (remaining > 0 && !this.isShattered) {
      const take = Math.min(remaining, this.stageHealth);
      this.stageHealth -= take;
      remaining -= take;
      removed += take;
      if (this.stageHealth <= 1e-6) {
        this.stageHealth = 0;
        this._advance(point);
      }
    }

    const to = this.stage;
    const brokeThrough = to >= FURN_STAGE.SHATTERED && from < FURN_STAGE.SHATTERED;
    const res = {
      changed: to !== from || removed > 0,
      from, to, removed,
      brokeThrough,
      depthAt: _depthAt(to),
      stage: to,
      barrier: false,
      blocked: false,
    };
    this._lastHit = { point: point?.clone?.() ?? point, power, res };
    return res;
  }

  _advance(point) {
    const from = this.stage;
    if (from >= FURN_STAGE.SHATTERED) return;
    this.stage = from + 1;
    this.stageHealth = this._stageHp[this.stage] ?? 0;

    this._applyStageLook();
    if (this.stage === FURN_STAGE.SHATTERED) this._shatter(point);

    this.onStage?.(this, this.stage, { from, point });
  }

  _applyStageLook() {
    const s = this.stage;
    if (this.mesh?.isInstancedMesh && this.instanceIndex != null && this.mesh.instanceColor) {
      const tint = s >= FURN_STAGE.BATTERED ? BATTERED_TINT
        : s >= FURN_STAGE.SCUFFED ? SCUFFED_TINT : _one;
      this.mesh.setColorAt(this.instanceIndex, tint);
      this.mesh.instanceColor.needsUpdate = true;
      return;
    }
    if (!this.mesh) return;

    this.mesh.traverse((o) => {
      if (!o.isMesh || !o.material?.color) return;
      if (!o.userData._furnBaseColor) {
        o.userData._furnBaseColor = o.material.color.clone();
        // Clone once so shared materials (gilt / wall) are not permanently stained.
        o.material = o.material.clone();
      }
      const base = o.userData._furnBaseColor;
      if (s >= FURN_STAGE.BATTERED) o.material.color.copy(base).multiply(BATTERED_TINT);
      else if (s >= FURN_STAGE.SCUFFED) o.material.color.copy(base).multiply(SCUFFED_TINT);
      else o.material.color.copy(base);

      const band = o.userData.furnBand;
      if (this.hideBandsOnBattered && s >= FURN_STAGE.BATTERED && s < FURN_STAGE.SHATTERED
          && band && this.hideBandsOnBattered.includes(band)) {
        o.visible = false;
      } else if (s < FURN_STAGE.SHATTERED) {
        o.visible = true;
      }
    });
  }

  _shatter(point) {
    // Tripod cameras tip over before vanishing (playcritique / task-furn-feel).
    if (this.kind === 'camera' && (this.mount === 'tripod' || this.mesh?.userData?.mount === 'tripod')
        && this.mesh && !this.mesh.isInstancedMesh) {
      this._tipOverThenBreak(point);
      return;
    }
    this._hideMesh();
    const normal = new THREE.Vector3(0, 1, 0);
    this.onBreak?.(this, {
      point: point?.clone?.() ?? this.box.getCenter(new THREE.Vector3()),
      normal,
      dir: normal,
    });
  }

  _tipOverThenBreak(point) {
    if (this._tipping) return;
    this._tipping = true;
    const mesh = this.mesh;
    if (!mesh || mesh.isInstancedMesh) {
      this._hideMesh();
      this.onBreak?.(this, {
        point: point?.clone?.() ?? this.box.getCenter(new THREE.Vector3()),
        normal: new THREE.Vector3(0, 1, 0),
        dir: new THREE.Vector3(0, 1, 0),
      });
      this._tipping = false;
      return;
    }
    const c = this.box.getCenter(new THREE.Vector3());
    const hit = point?.clone?.() ?? c;
    // Fall AWAY from the struck face so the body tips into open room (readable in 3rd person).
    // Tip-toward-player buried the silhouette under the robot boom.
    let tx = c.x - hit.x, tz = c.z - hit.z;
    const len = Math.hypot(tx, tz);
    if (len < 1e-4) { tx = 0; tz = 1; }
    else { tx /= len; tz /= len; }
    const ax = tz, az = -tx;
    this._tipBreakInfo = {
      point: hit,
      normal: new THREE.Vector3(0, 1, 0),
      dir: new THREE.Vector3(0, 1, 0),
    };
    // Collider only — FX after the held tip pose has been readable.
    this.onBreak?.(this, { ...this._tipBreakInfo, tipSilent: true });
    // Tip look boost: thin dark sticks vanish on dark floor; warm emissive + scale.
    mesh.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      if (!o.userData._tipSavedMat) {
        o.userData._tipSavedMat = o.material;
        o.material = o.material.clone();
      }
      if (o.material.emissive) {
        o.material.emissive.setHex(0xff4a1a);
        o.material.emissiveIntensity = 2.4;
      }
      if (o.material.color) o.material.color.setHex(0xe8c49a);
    });
    const tally = mesh.userData?.tally;
    if (tally?.material?.emissive) {
      tally.material.emissive.setHex(0xff1111);
      tally.material.emissiveIntensity = 4.5;
    }
    mesh.scale.setScalar(1.35);
    // Thick emissive leg bar — thin GeoBin sticks don't read when fallen; this is the silhouette.
    if (!mesh.userData._tipBar) {
      const barMat = new THREE.MeshStandardMaterial({
        color: 0xffc080,
        emissive: 0xff3a10,
        emissiveIntensity: 3.5,
        roughness: 0.55,
        metalness: 0.1,
      });
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.11, 1.45, 0.11), barMat);
      bar.position.set(0, 0.72, 0);
      bar.name = 'tipBar';
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.22, 0.4), barMat.clone());
      head.position.set(0, 1.42, 0.08);
      head.name = 'tipHead';
      bar.add(head);
      mesh.add(bar);
      mesh.userData._tipBar = bar;
    }
    mesh.userData._tipBar.visible = true;
    // World-space floor marker — stays readable even if the group tip is off-frame / dark.
    const fall = new THREE.Vector3(tx, 0, tz);
    if (!mesh.userData._tipFloor) {
      const floorMat = new THREE.MeshStandardMaterial({
        color: 0xffd0a0,
        emissive: 0xff2a08,
        emissiveIntensity: 4.0,
        roughness: 0.4,
        metalness: 0.05,
      });
      const floorBar = new THREE.Group();
      floorBar.name = 'tipFloor';
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 1.7), floorMat);
      leg.position.set(0, 0.09, 0);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.28, 0.48), floorMat.clone());
      head.position.set(0, 0.16, 0.95);
      floorBar.add(leg, head);
      mesh.userData._tipFloor = floorBar;
    }
    const floorBar = mesh.userData._tipFloor;
    const parent = mesh.parent ?? mesh;
    parent.updateWorldMatrix?.(true, false);
    const wp = new THREE.Vector3();
    mesh.getWorldPosition(wp);
    wp.x += fall.x * 0.75;
    wp.z += fall.z * 0.75;
    wp.y = 0.09;
    parent.worldToLocal(wp);
    floorBar.position.copy(wp);
    // Face along fall in parent space (approx — parent is usually unrotated room root).
    floorBar.rotation.set(0, Math.atan2(fall.x, fall.z), 0);
    floorBar.visible = true;
    if (floorBar.parent !== parent) parent.add(floorBar);
    this._tipAnim = {
      t: 0,
      tipDur: 0.35,
      holdDur: 1.15,
      ax, ay: 0, az,
      angle: Math.PI * 0.55,
      baseY: mesh.position.y,
      baseQuat: mesh.quaternion.clone(),
      baseScale: 1,
      paidFx: false,
    };
  }

  /** Tripod tip — called from `room.update`. */
  update(dt) {
    const a = this._tipAnim;
    if (!a || !this.mesh || dt <= 0) return;
    a.t += dt;
    const tipU = Math.min(1, a.t / a.tipDur);
    const e = 1 - (1 - tipU) * (1 - tipU);
    _tipAxis.set(a.ax, a.ay, a.az).normalize();
    _tipQ.setFromAxisAngle(_tipAxis, e * a.angle);
    this.mesh.quaternion.multiplyQuaternions(_tipQ, a.baseQuat);
    this.mesh.position.y = a.baseY * (1 - e * 0.22);
    this.mesh.visible = true;
    this.mesh.scale.setScalar(1.35);
    if (this.mesh.userData._tipBar) this.mesh.userData._tipBar.visible = true;
    if (a.t < a.holdDur) return;
    if (!a.paidFx) {
      a.paidFx = true;
      this.onBreak?.(this, this._tipBreakInfo ?? {
        point: this.box.getCenter(new THREE.Vector3()),
        normal: new THREE.Vector3(0, 1, 0),
        dir: new THREE.Vector3(0, 1, 0),
      });
    }
    this._restoreTipLook();
    this._hideMesh();
    this._tipAnim = null;
    this._tipBreakInfo = null;
    this._tipping = false;
  }

  _restoreTipLook() {
    const mesh = this.mesh;
    if (!mesh || mesh.isInstancedMesh) return;
    mesh.scale.setScalar(1);
    if (mesh.userData._tipBar) mesh.userData._tipBar.visible = false;
    if (mesh.userData._tipFloor) mesh.userData._tipFloor.visible = false;
    mesh.traverse((o) => {
      if (o.userData._tipSavedMat) {
        o.material = o.userData._tipSavedMat;
        delete o.userData._tipSavedMat;
      }
    });
  }

  _hideMesh() {
    if (this.mesh?.isInstancedMesh && this.instanceIndex != null) {
      const m = this._baseMatrix?.clone() ?? new THREE.Matrix4();
      m.scale(_hideScale);
      this.mesh.setMatrixAt(this.instanceIndex, m);
      this.mesh.instanceMatrix.needsUpdate = true;
    } else if (this.mesh) {
      this.mesh.visible = false;
    }
  }

  _showMesh() {
    if (this.mesh?.isInstancedMesh && this.instanceIndex != null && this._baseMatrix) {
      this.mesh.setMatrixAt(this.instanceIndex, this._baseMatrix);
      this.mesh.instanceMatrix.needsUpdate = true;
      if (this.mesh.instanceColor) {
        this.mesh.setColorAt(this.instanceIndex, _one);
        this.mesh.instanceColor.needsUpdate = true;
      }
    } else if (this.mesh) {
      this.mesh.visible = true;
      this.mesh.traverse((o) => {
        if (o.isMesh) o.visible = true;
        if (o.userData._furnBaseColor && o.material?.color) {
          o.material.color.copy(o.userData._furnBaseColor);
        }
      });
    }
  }

  /** Round reset — intact mesh, full HP, collider restored by room.registerFurn helpers. */
  reset() {
    this.stage = FURN_STAGE.INTACT;
    this.stageHealth = this._stageHp[0];
    this._showMesh();
    this._lastHit = null;
  }
}

function _depthAt(stage) {
  if (stage >= FURN_STAGE.SHATTERED) return 1;
  if (stage === FURN_STAGE.BATTERED) return 0.72;
  if (stage === FURN_STAGE.SCUFFED) return 0.38;
  return 0.12;
}

/**
 * Tag child meshes with `userData.furnBand` from local Y (bake at origin).
 * Used so fireplace can drop shelf / overmantel at battered before full shatter.
 */
export function tagFurnBands(root, { shelfY = 1.5, overY = 2.2 } = {}) {
  const c = new THREE.Vector3();
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    o.geometry.boundingBox.getCenter(c);
    if (c.y >= overY) o.userData.furnBand = 'over';
    else if (c.y >= shelfY) o.userData.furnBand = 'shelf';
    else o.userData.furnBand = 'base';
  });
}

/**
 * Build a world AABB centred on a floor-standing prop.
 * @returns {THREE.Box3}
 */
export function furnBox(cx, cy, cz, w, h, d) {
  return new THREE.Box3(
    new THREE.Vector3(cx - w / 2, cy, cz - d / 2),
    new THREE.Vector3(cx + w / 2, cy + h, cz + d / 2),
  );
}

/** URL gate shared by room emit + game dress. `?furn=0` ablates. */
export function furnDressEnabled() {
  if (typeof location === 'undefined') return true;
  return new URLSearchParams(location.search).get('furn') !== '0';
}
