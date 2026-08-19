/**
 * Furniture break / hit FX — debris, dust, and material audio.
 * Callers wire `makeFurnHandlers(debris, dust)` once and pass onBreak / onStage / onPartBreak.
 *
 * Teardown bar (`task-furn-feel-r2`): part break pays ONE sized `debris.chunk`, not only crumbs.
 */

import * as THREE from 'three';
import { FURN_STAGE } from './furnprop.js';
import { PART_PHYS } from './furn-parts.js';
import * as audioMod from '../audio/audio.js';

const _n = new THREE.Vector3(0, 1, 0);
const _side = new THREE.Vector3();

const PROFILE = {
  chair: { debris: [['timber', 7], ['lath', 5]], dust: 18, audio: 'wood' },
  desk: { debris: [['timber', 9], ['lath', 6]], dust: 22, audio: 'wood' },
  console: { debris: [['timber', 8], ['lath', 5], ['plaster', 3]], dust: 20, audio: 'wood' },
  crate: { debris: [['timber', 10], ['lath', 7]], dust: 24, audio: 'wood' },
  mound: { debris: [['timber', 6], ['lath', 4], ['plaster', 4]], dust: 20, audio: 'wood' },
  urn: { debris: [['plaster', 14], ['slab', 4]], dust: 28, audio: 'ceramic' },
  candelabra: { debris: [['timber', 4], ['lath', 3], ['plaster', 2]], dust: 16, audio: 'brass' },
  painting: { debris: [['lath', 6], ['timber', 3], ['plaster', 4]], dust: 18, audio: 'canvas' },
  fireplace: { debris: [['slab', 8], ['plaster', 16], ['timber', 2]], dust: 36, audio: 'stone' },
  giltbox: { debris: [['timber', 4], ['lath', 3]], dust: 12, audio: 'brass' },
  boarded: { debris: [['timber', 12], ['lath', 8]], dust: 26, audio: 'wood' },
  camera: { debris: [['timber', 2], ['lath', 1], ['plaster', 2]], dust: 6, audio: 'brass' },
  trestle: { debris: [['timber', 8], ['lath', 5]], dust: 18, audio: 'wood' },
  bench: { debris: [['timber', 9], ['lath', 5]], dust: 20, audio: 'wood' },
  pew: { debris: [['timber', 10], ['lath', 6]], dust: 22, audio: 'wood' },
  rug: { debris: [['lath', 8], ['timber', 3]], dust: 14, audio: 'canvas' },
};

/** Teardown-sized plate for a named part role — size/tumble, not voxels. */
const PART_CHUNK = {
  leg: { kind: 'timber', w: 0.10, h: 0.55, t: 0.10 },
  seat: { kind: 'timber', w: 0.58, h: 0.16, t: 0.50 },
  back: { kind: 'timber', w: 0.55, h: 0.85, t: 0.09 },
  body: { kind: 'timber', w: 0.90, h: 0.50, t: 0.70 },
  batten: { kind: 'timber', w: 0.90, h: 0.12, t: 0.08 },
  lid: { kind: 'timber', w: 0.40, h: 0.08, t: 0.28 },
};

function profile(kind) {
  return PROFILE[kind] ?? PROFILE.chair;
}

function burstDebris(debris, at, list, scale = 1, o = {}) {
  if (!debris || !at) return;
  const normal = o.normal ?? _n;
  for (const [kind, count] of list) {
    const n = Math.max(1, Math.round(count * scale));
    debris.burst(kind, at, n, {
      speed: o.speed ?? (2.8 + scale * 1.4),
      normal,
      eject: o.eject ?? (0.75 + scale * 0.15),
      spinScale: o.spinScale ?? (1.15 + scale * 0.2),
    });
  }
}

function burstDust(dust, at, count) {
  if (!dust || !at || count <= 0) return;
  dust.burst(at, count, { speed: 2.2, life: 0.85, size: 0.22, rise: 0.7 });
}

function payChunk(debris, at, role, normal, cascade) {
  if (!debris?.chunk || !at) return;
  const spec = PART_CHUNK[role] ?? { kind: 'timber', w: 0.35, h: 0.28, t: 0.12 };
  const n = normal?.clone?.() ?? (normal
    ? new THREE.Vector3(normal.x ?? 0, normal.y ?? 0, normal.z ?? 1)
    : _n.clone());
  if (n.y > 0.85) n.set(0.35, 0.2, 0.9).normalize();
  const opts = {
    w: spec.w, h: spec.h, t: spec.t,
    normal: n,
    spread: cascade ? 0.85 : 0.55,
    hold: cascade ? 0.02 : 0.06,
    spinScale: cascade ? 1.4 : 1.2,
  };
  debris.chunk(spec.kind, at, opts);
  // Cascade: second offset plate so the heap has structure, not one chip under the toes.
  if (cascade && (role === 'seat' || role === 'back' || role === 'body' || role === 'batten')) {
    const at2 = at.clone();
    at2.x += (Math.random() - 0.5) * 0.55;
    at2.z += (Math.random() - 0.5) * 0.55;
    at2.y += 0.08;
    debris.chunk(spec.kind, at2, {
      ...opts,
      w: spec.w * 0.85, h: spec.h * 0.9, t: spec.t * 0.9,
      spread: 0.95,
      hold: 0.04,
    });
  }
}

/**
 * @param {{ debris?: object, dust?: object }} ctx
 */
export function makeFurnHandlers(ctx = {}) {
  const { debris, dust } = ctx;

  const onPartBreak = (prop, part, info) => {
    const phys = part.phys ?? PART_PHYS[part.role] ?? PART_PHYS.body;
    const at = info?.point ?? part.box?.getCenter(new THREE.Vector3());
    if (at) dust?.flash?.(at, info?.cascade ? 0.55 : 1.1, 0.18);
    if (part.role === 'leg') {
      _side.set(1, phys.lift ?? 0.15, 0).normalize();
      if (info?.normal) {
        _side.crossVectors(info.normal, _n);
        if (_side.lengthSq() < 1e-6) _side.set(1, 0, 0);
        _side.y = phys.lift ?? 0.15;
        _side.normalize();
      }
    } else {
      _side.copy(info?.normal ?? _n);
      _side.y = Math.max(_side.y, phys.lift ?? 0.4);
      _side.normalize();
    }
    payChunk(debris, at, part.role, _side, !!info?.cascade);
    // Near-zero crumbs — plates own the read (Teardown: dust behind slabs).
    burstDebris(debris, at, phys.debris, info?.cascade ? 0.06 : 0.08, {
      normal: _side,
      speed: phys.speed * 0.85,
      eject: phys.eject,
      spinScale: phys.spinScale,
    });
    burstDust(dust, at, info?.cascade ? 4 : 7);
    audioMod.playFurnBreak?.('wood', { final: !info?.cascade, kind: prop.kind, part: part.role });
  };

  const onBreak = (prop, info) => {
    if (info?.voxel) {
      const p = profile(prop.kind);
      audioMod.playFurnBreak?.(p.audio, { final: true, kind: prop.kind });
      return;
    }
    const p = profile(prop.kind);
    const at = info?.point;
    const cam = prop.kind === 'camera';
    // Tip path: collider already dropped; skip FX until tipSilent is cleared on second call.
    if (cam && info?.tipSilent) return;
    if (at) dust?.flash?.(at, cam ? 0.45 : 1.2, cam ? 0.1 : 0.2);
    const nrm = info?.normal ?? _n;
    if (!prop.parts?.length || prop.kind === 'fireplace') {
      if (prop.kind !== 'fireplace' && debris?.chunk && at) {
        const box = prop.box;
        const w = box ? Math.max(0.2, box.max.x - box.min.x) * 0.55 : 0.45;
        const h = box ? Math.max(0.15, Math.min(0.9, box.max.y - box.min.y) * 0.45) : 0.35;
        const t = box ? Math.max(0.08, box.max.z - box.min.z) * 0.45 : 0.2;
        debris.chunk(prop.kind === 'urn' ? 'slab' : 'timber', at, {
          w, h, t, normal: nrm, spread: 0.4, hold: 0.04,
        });
      }
      burstDebris(debris, at, p.debris, prop.kind === 'fireplace' ? 1.2 : (cam ? 0.12 : 0.35), {
        normal: nrm,
      });
      burstDust(dust, at, cam ? Math.round(p.dust * 0.25) : p.dust);
    } else {
      burstDust(dust, at, Math.round(p.dust * 0.5));
    }
    audioMod.playFurnBreak?.(p.audio, { final: true, kind: prop.kind });
  };

  const onStage = (prop, stage, info) => {
    if (stage >= FURN_STAGE.SHATTERED) return;
    if (prop.parts?.length) return;
    const p = profile(prop.kind);
    const at = info?.point;
    const cam = prop.kind === 'camera';
    if (at) dust?.flash?.(at, cam ? 0.35 : 0.85, cam ? 0.08 : 0.16);
    const frac = stage === FURN_STAGE.BATTERED ? 0.45 : 0.22;
    burstDebris(debris, at, p.debris, cam ? frac * 0.35 : frac);
    burstDust(dust, at, Math.round(p.dust * frac * (cam ? 0.3 : 1)));
    audioMod.playFurnBreak?.(p.audio, { final: false, stage, kind: prop.kind });
  };

  const onChip = (prop, info) => {
    const at = info?.point;
    if (at) dust?.flash?.(at, 1.0, 0.18);
    const removed = info?.fres?.removed ?? 0.1;
    const n = Math.min(10, 2 + Math.round(removed * 18));
    burstDebris(debris, at, [['slab', Math.max(1, Math.round(n * 0.35))], ['plaster', n]], 1, {
      normal: info?.normal ?? _n,
      speed: 3.4,
      eject: 0.85,
    });
    burstDust(dust, at, Math.min(28, 6 + Math.round(removed * 40)));
  };

  const onHit = (prop, info) => {
    const at = info?.point;
    if (at) dust?.flash?.(at, info?.broke ? 1.0 : 0.7, 0.14);
  };

  return { onBreak, onStage, onPartBreak, onChip, onHit };
}
