/**
 * Local / part-based furniture destruction — `docs/slices/task-furn-local.md`.
 *
 * FurnAssembly  — chairs, crates: damage the part the ray hits; different debris physics.
 * FurnCladding  — fireplace: DamageField on the face (wall-like), never walkable / never dig unlock.
 */

import * as THREE from 'three';
import { DamageField } from './damagefield.js';
import { FURN_STAGE, furnBox } from './furnprop.js';

const _v = new THREE.Vector3();
const _c = new THREE.Vector3();

/** Per-part smash profile. */
export const PART_PHYS = {
  leg: {
    hp: 0.55,
    debris: [['timber', 4], ['lath', 2]],
    speed: 4.2, eject: 1.05, spinScale: 1.6, lift: 0.15,
  },
  seat: {
    hp: 1.1,
    debris: [['timber', 6], ['lath', 3]],
    speed: 2.6, eject: 0.55, spinScale: 0.9, lift: 0.55,
  },
  back: {
    hp: 0.85,
    debris: [['timber', 5], ['lath', 4]],
    speed: 3.2, eject: 0.8, spinScale: 1.25, lift: 0.35,
  },
  body: {
    hp: 1.4,
    debris: [['timber', 8], ['lath', 5]],
    speed: 2.8, eject: 0.65, spinScale: 1.0, lift: 0.4,
  },
  batten: {
    hp: 0.45,
    debris: [['lath', 5], ['timber', 2]],
    speed: 3.8, eject: 0.95, spinScale: 1.5, lift: 0.25,
  },
  lid: {
    hp: 0.7,
    debris: [['timber', 4], ['lath', 3]],
    speed: 3.0, eject: 0.7, spinScale: 1.2, lift: 0.6,
  },
};

/**
 * One smashable sub-piece of a FurnAssembly.
 * @param {object} o
 * @param {string} o.id
 * @param {string} o.role   key of PART_PHYS
 * @param {THREE.Object3D} o.mesh
 * @param {THREE.Box3} o.box  world AABB; tagged `_furn` / `_furnPart` by the assembly
 */
export class FurnPart {
  constructor(o = {}) {
    this.id = o.id ?? 'part';
    this.role = o.role ?? 'body';
    this.mesh = o.mesh ?? null;
    this.box = o.box;
    this.alive = true;
    const phys = PART_PHYS[this.role] ?? PART_PHYS.body;
    this.hp = o.hp ?? phys.hp;
    this.maxHp = this.hp;
    this.phys = phys;
  }

  get isGone() { return !this.alive; }

  applyDamage(power) {
    if (!this.alive || power <= 0) return { removed: 0, broke: false };
    const take = Math.min(this.hp, power);
    this.hp -= take;
    if (this.hp <= 1e-6) {
      this.hp = 0;
      this.alive = false;
      return { removed: take, broke: true };
    }
    return { removed: take, broke: false };
  }

  hide() {
    if (this.mesh) this.mesh.visible = false;
  }

  show() {
    if (this.mesh) this.mesh.visible = true;
    this.alive = true;
    this.hp = this.maxHp;
  }
}

/**
 * Multi-part prop. `applyHit` damages the aimed part; cascade when structure fails.
 */
export class FurnAssembly {
  /**
   * @param {object} o
   * @param {string} o.id
   * @param {string} o.spaceId
   * @param {string} [o.kind='chair']
   * @param {THREE.Object3D} o.root
   * @param {FurnPart[]} o.parts
   * @param {function} [o.onPartBreak]
   * @param {function} [o.onBreak]
   * @param {function} [o.onStage]
   * @param {number} [o.legsToCollapse=3]
   */
  constructor(o = {}) {
    this.id = o.id ?? 'assembly';
    this.spaceId = o.spaceId ?? '';
    this.kind = o.kind ?? 'chair';
    this.root = o.root ?? null;
    this.mesh = o.root ?? null; // FurnProp-compatible
    this.parts = o.parts ?? [];
    this.onPartBreak = o.onPartBreak ?? null;
    this.onBreak = o.onBreak ?? null;
    this.onStage = o.onStage ?? null;
    this.onHit = o.onHit ?? null;
    this.legsToCollapse = o.legsToCollapse ?? 3;
    this.stage = FURN_STAGE.INTACT;
    this._colDropped = false;
    this._lastHit = null;
    this._shatterScheduled = false;
    this._hideTimers = [];

    // Union box for probes / fallback cast
    this.box = new THREE.Box3();
    this._rebuildUnion();
    for (const p of this.parts) {
      if (p.box) {
        p.box._furn = this;
        p.box._furnPart = p.id;
      }
    }
  }

  get partBoxes() { return this.parts.filter((p) => p.alive && p.box).map((p) => p.box); }
  get isShattered() { return this.stage >= FURN_STAGE.SHATTERED; }
  get blocksMove() { return !this.isShattered; }
  get isDamageable() { return !this.isShattered; }
  get name() {
    if (this.isShattered) return 'shattered';
    const n = this.parts.filter((p) => !p.alive).length;
    if (n === 0) return 'intact';
    return n >= 2 ? 'battered' : 'scuffed';
  }

  _rebuildUnion() {
    this.box.makeEmpty();
    let any = false;
    for (const p of this.parts) {
      if (!p.alive || !p.box) continue;
      this.box.union(p.box);
      any = true;
    }
    if (!any && this.root) {
      this.box.setFromObject(this.root);
    }
    this.box._furn = this;
  }

  partById(id) {
    return this.parts.find((p) => p.id === id) ?? null;
  }

  nearestPart(point) {
    let best = null, bestD = Infinity;
    for (const p of this.parts) {
      if (!p.alive || !p.box) continue;
      p.box.getCenter(_c);
      const d = _c.distanceToSquared(point);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  /**
   * @returns wall-shaped result for audio / player
   */
  applyHit(point, power, opts = null) {
    const empty = {
      changed: false, from: this.stage, to: this.stage, removed: 0,
      brokeThrough: false, depthAt: this.isShattered ? 1 : 0.2,
      stage: this.stage, barrier: false, blocked: false, partId: null,
    };
    if (this.isShattered || !Number.isFinite(power) || power <= 0) {
      return { ...empty, blocked: true, depthAt: 1 };
    }

    const part = (opts?.partId && this.partById(opts.partId))
      || (point && this.nearestPart(point));
    if (!part || !part.alive) return { ...empty, blocked: true };

    const from = this.stage;
    const { removed, broke } = part.applyDamage(power);
    if (removed > 0 && !broke) this.onHit?.(this, { point, part, removed, broke });
    let cascade = false;
    if (broke) {
      // Collider goes now; mesh holds a wounded silhouette ~0.4 s (playcritique).
      part.alive = false;
      this._tintPart(part, 0);
      this.onPartBreak?.(this, part, { point, normal: opts?.normal });
      cascade = this._checkCollapse();
      if (cascade) {
        this.stage = Math.max(this.stage, FURN_STAGE.BATTERED);
        this._scheduleShatter(point, opts?.normal, 450);
      } else {
        this._schedulePartHide(part, 400);
        this.stage = Math.max(this.stage, FURN_STAGE.SCUFFED);
      }
    } else {
      // Scuff tint on the struck mesh
      this._tintPart(part, part.hp / part.maxHp);
      this.stage = Math.max(this.stage, FURN_STAGE.SCUFFED);
    }

    this._rebuildUnion();
    const to = this.stage;
    const depthAt = this.isShattered ? 1
      : broke ? 0.7
        : 0.25 + 0.45 * (1 - part.hp / part.maxHp);

    const res = {
      changed: removed > 0 || to !== from,
      from, to, removed,
      brokeThrough: to >= FURN_STAGE.SHATTERED && from < FURN_STAGE.SHATTERED,
      depthAt, stage: to, barrier: false, blocked: false,
      partId: part.id, partRole: part.role, partBroke: broke,
    };
    this._lastHit = { point: point?.clone?.() ?? point, power, res };
    if (to !== from) this.onStage?.(this, to, { from, point, part });
    return res;
  }

  _schedulePartHide(part, ms) {
    const t = setTimeout(() => {
      if (!this.isShattered) part.hide();
    }, ms);
    this._hideTimers.push(t);
  }

  _scheduleShatter(point, normal, ms) {
    if (this._shatterScheduled || this.isShattered) return;
    this._shatterScheduled = true;
    const t = setTimeout(() => {
      this._shatterAll(point, normal);
    }, ms);
    this._hideTimers.push(t);
  }

  _tintPart(part, health01) {
    const mesh = part.mesh;
    if (!mesh?.material?.color) return;
    if (!mesh.userData._furnBaseColor) {
      mesh.userData._furnBaseColor = mesh.material.color.clone();
      mesh.material = mesh.material.clone();
    }
    const t = Math.max(0.35, health01);
    mesh.material.color.copy(mesh.userData._furnBaseColor).multiplyScalar(0.45 + 0.55 * t);
  }

  _checkCollapse() {
    const legsGone = this.parts.filter((p) => p.role === 'leg' && !p.alive).length;
    const seatGone = this.parts.some((p) => p.role === 'seat' && !p.alive);
    if (seatGone) return true;
    if (legsGone >= this.legsToCollapse) return true;
    if (this.kind === 'crate') {
      const bodies = this.parts.filter((p) => p.role === 'body');
      return bodies.length > 0 && bodies.every((p) => !p.alive);
    }
    return false;
  }

  _shatterAll(point, normal) {
    if (this.isShattered) return;
    for (const p of this.parts) {
      if (p.alive) {
        p.alive = false;
        p.hp = 0;
        this.onPartBreak?.(this, p, { point, normal, cascade: true });
      } else if (p.mesh?.visible !== false) {
        // Already-wounded parts still visible: pay a cascade chunk so the heap fills.
        this.onPartBreak?.(this, p, { point, normal, cascade: true, woundPay: true });
      }
      p.hide();
    }
    this.stage = FURN_STAGE.SHATTERED;
    if (this.root) this.root.visible = false;
    this.onBreak?.(this, {
      point: point?.clone?.() ?? this.box.getCenter(new THREE.Vector3()),
      normal: normal?.clone?.() ?? new THREE.Vector3(0, 1, 0),
      dir: normal ?? new THREE.Vector3(0, 1, 0),
    });
  }

  reset() {
    for (const t of this._hideTimers ?? []) clearTimeout(t);
    this._hideTimers = [];
    this._shatterScheduled = false;
    this.stage = FURN_STAGE.INTACT;
    if (this.root) this.root.visible = true;
    for (const p of this.parts) {
      p.show();
      if (p.mesh?.userData._furnBaseColor && p.mesh.material?.color) {
        p.mesh.material.color.copy(p.mesh.userData._furnBaseColor);
      }
    }
    this._rebuildUnion();
    this._lastHit = null;
  }
}

/**
 * Chimney / fireplace cladding — wall-like DamageField, never walkable through the building.
 */
export class FurnCladding {
  /**
   * @param {object} o
   * @param {string} o.id
   * @param {string} o.spaceId
   * @param {THREE.Object3D} o.mesh   fireplace group (local origin at base centre)
   * @param {THREE.Box3} o.box        world hit volume (kept forever for movement block)
   * @param {object} o.face           { origin, right, up, width, height, normal } in world
   * @param {function} [o.onChip]     (prop, info) each blow — debris
   * @param {function} [o.onBreak]
   * @param {function} [o.onStage]
   */
  constructor(o = {}) {
    this.id = o.id ?? 'cladding';
    this.spaceId = o.spaceId ?? '';
    this.kind = 'fireplace';
    this.mesh = o.mesh ?? null;
    this.box = o.box;
    this.face = o.face;
    this.onChip = o.onChip ?? null;
    this.onBreak = o.onBreak ?? null;
    this.onStage = o.onStage ?? null;
    this._colDropped = false; // never drop — building fabric
    this.stage = FURN_STAGE.INTACT;
    this._lastHit = null;

    const w = o.face?.width ?? 2.5;
    const h = o.face?.height ?? 3.8;
    this.field = new DamageField({ width: w, height: h, cell: 0.12 });
    if (this.field.barrier) this.field.barrier.fill(1);

    this._childLocal = [];
    if (this.mesh) {
      this.mesh.traverse((obj) => {
        if (obj.isMesh) this._childLocal.push({ mesh: obj });
      });
    }
  }

  get isShattered() { return this.stage >= FURN_STAGE.SHATTERED; }
  get blocksMove() { return true; } // always — attached to building
  get isDamageable() { return true; } // can keep chipping even when visually gutted
  get name() {
    if (this.stage >= FURN_STAGE.SHATTERED) return 'shattered';
    if (this.stage >= FURN_STAGE.BATTERED) return 'battered';
    if (this.stage >= FURN_STAGE.SCUFFED) return 'scuffed';
    return 'intact';
  }

  /** Map world point → face UV. */
  worldToUV(point) {
    const f = this.face;
    if (!f || !point) return { u: 0.5, v: 0.5 };
    _v.copy(point).sub(f.origin);
    const u = THREE.MathUtils.clamp(_v.dot(f.right) / f.width, 0, 1);
    const v = THREE.MathUtils.clamp(_v.dot(f.up) / f.height, 0, 1);
    return { u, v };
  }

  applyHit(point, power) {
    const { u, v } = this.worldToUV(point);
    const fres = this.field.applyHit(u, v, power);
    this._syncMeshes();

    const from = this.stage;
    const d = fres.depthAt ?? this.field.depthAt(u, v);
    if (d > 0.15) this.stage = Math.max(this.stage, FURN_STAGE.SCUFFED);
    if (d > 0.55) this.stage = Math.max(this.stage, FURN_STAGE.BATTERED);
    // "Shattered" look when most of the cladding is gone — collider STAYS.
    const gone = this._fractionGone();
    if (gone > 0.72) this.stage = Math.max(this.stage, FURN_STAGE.SHATTERED);

    const res = {
      changed: (fres.removed ?? 0) > 0,
      from, to: this.stage,
      removed: fres.removed ?? 0,
      // Never a dig breakthrough — building fabric.
      brokeThrough: false,
      depthAt: d,
      stage: this.stage,
      barrier: true,
      blocked: (fres.removed ?? 0) < 1e-6,
      cladding: true,
    };
    this._lastHit = { point: point?.clone?.() ?? point, power, res };
    this.onChip?.(this, { point, u, v, fres, normal: this.face?.normal });
    if (this.stage !== from) {
      this.onStage?.(this, this.stage, { from, point });
      if (this.stage >= FURN_STAGE.SHATTERED && from < FURN_STAGE.SHATTERED) {
        this.onBreak?.(this, {
          point: point?.clone?.() ?? this.box.getCenter(new THREE.Vector3()),
          normal: this.face?.normal?.clone?.() ?? new THREE.Vector3(0, 0, 1),
          dir: this.face?.normal ?? new THREE.Vector3(0, 0, 1),
        });
      }
    }
    return res;
  }

  _fractionGone() {
    if (!this._childLocal.length) return 0;
    let n = 0, gone = 0;
    for (const c of this._childLocal) {
      n++;
      if (!c.mesh.visible) gone++;
    }
    return n ? gone / n : 0;
  }

  _syncMeshes() {
    const f = this.face;
    if (!f || !this.mesh) return;
    this.mesh.updateWorldMatrix(true, true);
    for (const c of this._childLocal) {
      if (!c.mesh.geometry) continue;
      if (!c.mesh.geometry.boundingBox) c.mesh.geometry.computeBoundingBox();
      c.mesh.geometry.boundingBox.getCenter(_c);
      c.mesh.localToWorld(_c);
      _v.copy(_c).sub(f.origin);
      const u = THREE.MathUtils.clamp(_v.dot(f.right) / f.width, 0, 1);
      const v = THREE.MathUtils.clamp(_v.dot(f.up) / f.height, 0, 1);
      const depth = this.field.depthAt(u, v);
      c.mesh.visible = depth < 0.72;
    }
  }

  reset() {
    this.stage = FURN_STAGE.INTACT;
    this.field = new DamageField({
      width: this.face?.width ?? 2.5,
      height: this.face?.height ?? 3.8,
      cell: 0.12,
    });
    if (this.field.barrier) this.field.barrier.fill(1);
    for (const c of this._childLocal) c.mesh.visible = true;
    this._lastHit = null;
  }
}

/** Build a world AABB for a part centred in local prop space, then yawed. */
export function partBoxWorld(cx, cy, cz, rotY, local) {
  const { x, y, z, w, h, d } = local;
  const c = Math.cos(rotY), s = Math.sin(rotY);
  const wx = cx + x * c + z * s;
  const wz = cz - x * s + z * c;
  const aw = Math.abs(w * c) + Math.abs(d * s);
  const ad = Math.abs(w * s) + Math.abs(d * c);
  return furnBox(wx, cy + y, wz, aw, h, ad);
}
