/**
 * Loose estate furniture — desks / consoles / crates / urns / candelabra / paintings /
 * fireplace / boarded panels / RRR cameras / service+chapel fill.
 * `docs/slices/task-furn-destruct.md`, `docs/slices/task-furn-fill.md`
 *
 * Builds standalone (non-GeoBin-merged) meshes so each can be a `FurnProp`. Order emit skips
 * merged dressing / portraits / chimneypiece when `furnDressEnabled()` so we do not double-draw.
 *
 * ⚠️ Hit AABBs use height ≥ 1.25 m for desk-height pieces. The player eye is ~1.54 m; a 0.76 m
 * desk AABB lets every level swing clear it (same defect Phase A measured on chairs).
 */

import * as THREE from 'three';
import { GeoBin } from '../world/kit.js';
import {
  desk, deskClutter, consoleTable, packingCrate, chairGeometry,
  urnOnPedestal, fireplace, portraitWall, giltCasket, boardedPanel,
  trestle, dustSheet, paperScatter, rrrCamera, galleryBench, chapelPew,
} from '../world/props.js';
import { candelabra as makeCandelabra } from '../lighting/practicals.js';
import { FurnProp, furnBox, FURN_HP } from '../destruction/furnprop.js';
import { FurnPart, FurnAssembly, FurnCladding, partBoxWorld } from '../destruction/furn-parts.js';
import { makeFurnHandlers } from '../destruction/furn-fx.js';
import { dressCatalogFurniture } from './furn-layout.js';

const HIT_H = 1.25; // minimum collider height so a sledge ray from eye height can connect

function furnMats(room) {
  const m = room.materials ?? {};
  const wall = m.wall;
  const gilt = m.gilt ?? wall;
  const floor = m.floor ?? wall;
  const estate = m.estate ?? {};
  return {
    wood: wall, trim: wall, gilt, marble: floor, marbleTop: floor,
    crate: wall, timber: wall, dark: m.dark ?? wall, batten: wall,
    stone: m.cstone ?? estate.stone ?? floor ?? wall,
    soot: m.dark ?? estate.soot ?? wall,
    stoneGround: m.skirt ?? estate.stoneGround ?? m.cstone ?? floor ?? wall,
    portrait: estate.portrait ?? wall,
    brass: estate.brass ?? gilt,
  };
}

/**
 * Run a props.js bin-filler at the origin, then return a Group of merged meshes plus size.
 * `fill(bin, group)` may add extra meshes (portrait canvases) onto `group` directly.
 */
function bakeProp(fill, materials) {
  const bin = new GeoBin();
  const group = new THREE.Group();
  const size = fill(bin, group) ?? {};
  for (const mesh of bin.build(materials)) group.add(mesh);
  return { group, size };
}

function registerGroup(room, {
  id, spaceId, group, cx, cy = 0, cz, w, d, h, kind, onBreak, onStage, rotY = 0,
  hideBandsOnBattered = null, health = null,
}) {
  group.position.set(cx, cy, cz);
  if (rotY) group.rotation.y = rotY;
  const sp = room.spaces.find((s) => s.id === spaceId);
  if (!sp) return null;
  sp.root.add(group);
  const boxH = Math.max(h ?? HIT_H, HIT_H);
  const c = Math.abs(Math.cos(rotY)), s = Math.abs(Math.sin(rotY));
  const aw = (w ?? 1) * c + (d ?? 1) * s;
  const ad = (w ?? 1) * s + (d ?? 1) * c;
  const box = furnBox(cx, cy, cz, aw, boxH, ad);
  return room.registerFurn(new FurnProp({
    id, spaceId, box, mesh: group, kind,
    health: health ?? FURN_HP[kind],
    onBreak, onStage, hideBandsOnBattered,
  }));
}

function clampInRoom(sp, x, z, margin = 1.6) {
  return {
    x: Math.min(sp.x1 - margin, Math.max(sp.x0 + margin, x)),
    z: Math.min(sp.z1 - margin, Math.max(sp.z0 + margin, z)),
  };
}

/** Desk + clutter + side chair for one study. */
function dressStudy(sp, room, materials, handlers, rng) {
  const { onBreak, onStage, onChip } = handlers;
  const hw = sp.orderPlan?.hearthWorld;
  let dx = 1.35;
  if (hw && Number.isFinite(hw.x)) dx = hw.x > sp.cx ? -1.55 : 1.55;
  const raw = clampInRoom(sp, sp.cx + dx, sp.cz + sp.d * 0.18);
  const rotY = Math.PI;

  const { group: deskG, size } = bakeProp((bin) => {
    const dim = desk(bin, {
      x: 0, y: 0, z: 0, rotY: 0, w: 1.42, d: 0.68,
      keys: { wood: 'wood', gilt: 'gilt' },
    });
    deskClutter(bin, {
      x: -0.12, y: (dim?.h ?? 0.76) + 0.002, z: -0.05, rotY: 0, rng,
      keys: { wood: 'wood', gilt: 'gilt', dark: 'dark' },
    });
    return dim;
  }, materials);
  registerGroup(room, {
    id: `${sp.id}.desk.0`, spaceId: sp.id, group: deskG,
    cx: raw.x, cz: raw.z, rotY,
    // Slightly fat AABB so desk wins mid-aim over a far side chair.
    w: (size.w ?? 1.42) * 1.12, d: (size.d ?? 0.68) * 1.2, h: size.h ?? 0.76,
    kind: 'desk', onBreak, onStage,
  });

  const chairGeo = chairGeometry({});
  const chairMat = materials.gilt ?? materials.wood;
  const chairMesh = new THREE.Mesh(chairGeo, chairMat);
  chairMesh.castShadow = true; chairMesh.receiveShadow = true;
  const chairGroup = new THREE.Group();
  chairGroup.add(chairMesh);
  // Desk chair off the centreline so sledge aimed at the desk mid does not steal the chair first.
  const cpos = clampInRoom(sp, raw.x + (dx > 0 ? -1.75 : 1.75), raw.z + 0.35, 1.2);
  registerGroup(room, {
    id: `${sp.id}.chair.desk`, spaceId: sp.id, group: chairGroup,
    cx: cpos.x, cz: cpos.z, rotY: rotY + (dx > 0 ? 0.4 : -0.4),
    w: 0.50, d: 0.55, h: 1.55,
    kind: 'chair', onBreak, onStage,
  });

  // Second desk or console on the opposite free side of the hearth (density wave).
  const side = dx > 0 ? -1 : 1;
  const raw2 = clampInRoom(sp, sp.cx + side * 2.4, sp.cz - sp.d * 0.12, 1.8);
  if (Math.hypot(raw2.x - raw.x, raw2.z - raw.z) > 2.8) {
    const useDesk = rng() > 0.45;
    if (useDesk) {
      const { group: d2, size: s2 } = bakeProp((bin) => desk(bin, {
        x: 0, y: 0, z: 0, rotY: 0, w: 1.28, d: 0.62,
        keys: { wood: 'wood', gilt: 'gilt' },
      }), materials);
      registerGroup(room, {
        id: `${sp.id}.desk.1`, spaceId: sp.id, group: d2,
        cx: raw2.x, cz: raw2.z, rotY: 0,
        w: s2.w ?? 1.28, d: s2.d ?? 0.62, h: s2.h ?? 0.76,
        kind: 'desk', onBreak, onStage,
      });
    } else {
      const { group: c2, size: s2 } = bakeProp((bin) => {
        consoleTable(bin, {
          x: 0, y: 0, z: 0, rotY: 0, w: 1.15, d: 0.42, h: 0.82,
          keys: { wood: 'wood', gilt: 'gilt', marble: 'marbleTop' },
        });
        return { w: 1.15, d: 0.42, h: 0.82 };
      }, materials);
      registerGroup(room, {
        id: `${sp.id}.console.1`, spaceId: sp.id, group: c2,
        cx: raw2.x, cz: raw2.z, rotY: Math.PI / 2,
        w: s2.w ?? 1.15, d: s2.d ?? 0.42, h: s2.h ?? 0.82,
        kind: 'console', onBreak, onStage,
      });
    }
    const wallChair = new THREE.Group();
    const wg = new THREE.Mesh(chairGeometry({}), materials.gilt ?? materials.wood);
    wg.castShadow = true; wg.receiveShadow = true;
    wallChair.add(wg);
    const wpos = clampInRoom(sp, raw2.x + side * 0.1, raw2.z + 1.05, 1.2);
    registerGroup(room, {
      id: `${sp.id}.chair.wall`, spaceId: sp.id, group: wallChair,
      cx: wpos.x, cz: wpos.z, rotY: Math.PI,
      w: 0.50, d: 0.55, h: 1.55,
      kind: 'chair', onBreak, onStage,
    });
  }

  // Soft fill — urn or giltbox if space allows.
  if (rng() > 0.35) {
    const soft = clampInRoom(sp, sp.cx - side * 3.2, sp.z0 + 1.4, 1.5);
    if (rng() > 0.5) {
      const { group: ug, size: us } = bakeProp((bin) => urnOnPedestal(bin, {
        x: 0, y: 0, z: 0, h: 1.15, keys: { stone: 'stone', gilt: 'gilt' },
      }), materials);
      registerGroup(room, {
        id: `${sp.id}.urn.soft`, spaceId: sp.id, group: ug,
        cx: soft.x, cz: soft.z, rotY: 0,
        w: 0.5, d: 0.5, h: us.h ?? 1.65,
        kind: 'urn', onBreak, onStage,
      });
    } else {
      const { group: bg, size: bs } = bakeProp((bin) => giltCasket(bin, {
        x: 0, y: 0, z: 0, keys: { gilt: 'gilt', dark: 'dark' },
      }), materials);
      registerGroup(room, {
        id: `${sp.id}.giltbox.soft`, spaceId: sp.id, group: bg,
        cx: soft.x, cz: soft.z, rotY: 0.2,
        w: bs.w ?? 0.4, d: bs.d ?? 0.28, h: Math.max(bs.h ?? 0.25, HIT_H),
        kind: 'giltbox', onBreak, onStage,
      });
    }
  }

  // Chimneypiece as wall-like cladding (DamageField) — never walkable through the building.
  const ch = sp.orderPlan?.chimney;
  if (ch && Number.isFinite(ch.x)) {
    const { group: fpG, size: fpSize } = bakeProp((bin) => {
      const built = fireplace(bin, {
        x: 0, y: 0, z: 0, rotY: 0,
        keys: { stone: 'stone', soot: 'soot', dark: 'dark', ground: 'stoneGround' },
        openW: ch.openW, openH: ch.openH, jambW: ch.jambW, proj: ch.proj,
        overH: ch.overH, fieldInset: ch.fieldInset, cartoucheScale: ch.cartoucheScale,
      });
      return {
        w: built.totalW + 0.2,
        d: (ch.proj ?? 0.34) + 0.35,
        h: built.overTop ?? 4.2,
        totalW: built.totalW,
        overTop: built.overTop,
      };
    }, materials);
    const cx = ch.x, cy = ch.y ?? 0, cz = ch.z ?? sp.z0 + 0.16;
    const rotYf = ch.rotY ?? 0;
    fpG.position.set(cx, cy, cz);
    fpG.rotation.y = rotYf;
    const space = room.spaces.find((s) => s.id === sp.id);
    space?.root.add(fpG);

    const width = fpSize.totalW ?? fpSize.w ?? 2.4;
    const height = Math.min(fpSize.overTop ?? fpSize.h ?? 4.0, 4.2);
    const proj = ch.proj ?? 0.34;
    // Face sits on the room side of the chimneypiece (local +Z after rotY).
    const facing = new THREE.Vector3(Math.sin(rotYf), 0, Math.cos(rotYf));
    const right = new THREE.Vector3(Math.cos(rotYf), 0, -Math.sin(rotYf));
    const up = new THREE.Vector3(0, 1, 0);
    const origin = new THREE.Vector3(cx, cy, cz)
      .addScaledVector(facing, proj * 0.15)
      .addScaledVector(right, -width / 2);
    const box = furnBox(cx, cy, cz, width + 0.15, Math.max(height, HIT_H), proj + 0.45);
    room.registerFurn(new FurnCladding({
      id: `${sp.id}.fireplace.0`,
      spaceId: sp.id,
      mesh: fpG,
      box,
      face: { origin, right, up, width, height, normal: facing.clone() },
      onChip, onBreak, onStage,
    }));
  }
}

function dressBallroomExtras(sp, room, materials, handlers, rng) {
  const { onBreak, onStage, onPartBreak } = handlers;
  const consoles = [
    { x: sp.x0 + 0.52, z: sp.cz - 3.2, rotY: Math.PI / 2 },
    { x: sp.x1 - 0.52, z: sp.cz + 3.2, rotY: -Math.PI / 2 },
  ];
  let i = 0;
  for (const c of consoles) {
    const { group, size } = bakeProp((bin) => {
      consoleTable(bin, {
        x: 0, y: 0, z: 0, rotY: 0, w: 1.25, d: 0.44, h: 0.82,
        keys: { wood: 'wood', gilt: 'gilt', marble: 'marbleTop' },
      });
      return { w: 1.25, d: 0.44, h: 0.82 };
    }, materials);
    registerGroup(room, {
      id: `${sp.id}.console.${i++}`, spaceId: sp.id, group,
      cx: c.x, cz: c.z, rotY: c.rotY,
      w: size.w ?? 1.25, d: size.d ?? 0.44, h: size.h ?? 0.82,
      kind: 'console', onBreak, onStage,
    });
  }

  // Parted packing-case stack — body vs battens smash differently.
  const cratePos = clampInRoom(sp, sp.cx - 9.2, sp.cz - 5.4, 2.0);
  const crateRoot = new THREE.Group();
  const crateParts = [];
  let y = 0;
  const nStack = 3;
  for (let i = 0; i < nStack; i++) {
    const bin = new GeoBin();
    packingCrate(bin, {
      x: 0, y: 0, z: 0, rotY: 0.15 * (i - 1),
      keys: { body: 'body', batten: 'batten' },
    });
    const layer = new THREE.Group();
    layer.position.y = y;
    const built = bin.build({ body: materials.crate, batten: materials.crate });
    let bodyMesh = null, batMesh = null;
    for (const m of built) {
      layer.add(m);
      if (String(m.name).includes('batten')) batMesh = m;
      else bodyMesh = m;
    }
    crateRoot.add(layer);
    const h = 0.58;
    if (bodyMesh) {
      crateParts.push(new FurnPart({
        id: `crate.body.${i}`, role: 'body', mesh: bodyMesh,
        box: partBoxWorld(cratePos.x, cratePos.y ?? 0, cratePos.z, 0.4, {
          x: 0, y, z: 0, w: 1.2, h, d: 0.9,
        }),
      }));
    }
    if (batMesh) {
      crateParts.push(new FurnPart({
        id: `crate.batten.${i}`, role: 'batten', mesh: batMesh,
        box: partBoxWorld(cratePos.x, cratePos.y ?? 0, cratePos.z, 0.4, {
          x: 0, y: y + h * 0.35, z: 0.35, w: 1.15, h: h * 0.55, d: 0.2,
        }),
      }));
    }
    y += h;
  }
  crateRoot.position.set(cratePos.x, 0, cratePos.z);
  crateRoot.rotation.y = 0.4;
  const spCrate = room.spaces.find((s) => s.id === sp.id);
  spCrate?.root.add(crateRoot);
  room.registerFurn(new FurnAssembly({
    id: `${sp.id}.crate.0`, spaceId: sp.id, kind: 'crate',
    root: crateRoot, parts: crateParts,
    onBreak, onStage, onPartBreak, onHit: handlers.onHit, legsToCollapse: 99,
  }));

  // Corner urns (order dressing skipped when furn is on).
  const urns = sp.orderPlan?.urns ?? [];
  let ui = 0;
  for (const u of urns) {
    const [ux, uz] = Array.isArray(u) ? u : [u.x, u.z];
    const { group, size } = bakeProp((bin) => urnOnPedestal(bin, {
      x: 0, y: 0, z: 0, h: 1.35, keys: { stone: 'stone', gilt: 'gilt' },
    }), materials);
    registerGroup(room, {
      id: `${sp.id}.urn.${ui++}`, spaceId: sp.id, group,
      cx: ux, cz: uz, rotY: 0,
      w: 0.55, d: 0.55, h: size.h ?? 1.85,
      kind: 'urn', onBreak, onStage,
    });
  }

  // Standing candelabra (rig skips when furn is on).
  const cds = sp.orderPlan?.furnCandelabra ?? [];
  let ci = 0;
  for (const c of cds) {
    const brass = materials.brass ?? materials.gilt;
    const group = makeCandelabra({
      brass, merge: true, light: false, h: 1.55, arms: 6, phase: (c.x ?? 0) + (c.z ?? 0),
    });
    registerGroup(room, {
      id: `${sp.id}.candelabra.${ci++}`, spaceId: sp.id, group,
      cx: c.x, cz: c.z, rotY: 0,
      w: 0.55, d: 0.55, h: 1.75,
      kind: 'candelabra', onBreak, onStage,
    });
  }

  // Small gilt casket against the near wall — the "golden box" read from play screenshots.
  const boxPos = clampInRoom(sp, sp.cx + 4.2, sp.z1 - 1.1, 1.4);
  const { group: boxG, size: boxSize } = bakeProp((bin) => giltCasket(bin, {
    x: 0, y: 0, z: 0, keys: { gilt: 'gilt', dark: 'dark' },
  }), materials);
  registerGroup(room, {
    id: `${sp.id}.giltbox.0`, spaceId: sp.id, group: boxG,
    cx: boxPos.x, cz: boxPos.z, rotY: 0.35,
    w: boxSize.w ?? 0.4, d: boxSize.d ?? 0.28, h: Math.max(boxSize.h ?? 0.25, 1.25),
    kind: 'giltbox', onBreak, onStage,
  });

  // Depot fill — extra crate stacks, trestles, dust sheets, paper (clear of chair ring r≈3.4).
  const depotSites = [
    { x: sp.cx + 9.0, z: sp.cz + 4.8, rotY: -0.3 },
    { x: sp.cx - 8.5, z: sp.cz + 5.2, rotY: 0.5 },
    { x: sp.cx + 7.5, z: sp.cz - 5.6, rotY: 0.2 },
  ];
  let si = 1;
  for (const site of depotSites) {
    const p = clampInRoom(sp, site.x, site.z, 2.2);
    if (Math.hypot(p.x - sp.cx, p.z - sp.cz) < 5.2) continue;
    const n = 2 + Math.floor(rng() * 2);
    placeCrateStack(room, sp, materials, handlers, `${sp.id}.crate.${si++}`, p, n, site.rotY);
  }

  const trestleSites = [
    { x: sp.cx - 10.2, z: sp.cz - 2.0, rotY: 0.35, len: 2.3 },
    { x: sp.cx + 10.0, z: sp.cz + 1.5, rotY: -0.55, len: 2.0 },
  ];
  let ti = 0;
  for (const t of trestleSites) {
    const p = clampInRoom(sp, t.x, t.z, 2.0);
    if (Math.hypot(p.x - sp.cx, p.z - sp.cz) < 5.0) continue;
    const { group, size } = bakeProp((bin) => {
      trestle(bin, {
        x: 0, y: 0, z: 0, rotY: 0, len: t.len,
        keys: { timber: 'crate' },
      });
      return { w: t.len, d: 0.35, h: 0.78 };
    }, materials);
    registerGroup(room, {
      id: `${sp.id}.trestle.${ti++}`, spaceId: sp.id, group,
      cx: p.x, cz: p.z, rotY: t.rotY,
      w: size.w ?? t.len, d: size.d ?? 0.35, h: size.h ?? 0.78,
      kind: 'trestle', onBreak, onStage,
    });
  }

  const sheetMat = materials.crate?.clone?.() ?? materials.wood;
  if (sheetMat?.color) sheetMat.color = sheetMat.color.clone().multiplyScalar(0.92);
  const moundPos = clampInRoom(sp, sp.cx + 5.5, sp.cz + 5.8, 2.2);
  if (Math.hypot(moundPos.x - sp.cx, moundPos.z - sp.cz) >= 5.0) {
    const mesh = dustSheet({
      w: 1.8, d: 1.1, h: 1.05, shape: 'mound', material: sheetMat, rng,
    });
    const g = new THREE.Group();
    g.add(mesh);
    registerGroup(room, {
      id: `${sp.id}.mound.0`, spaceId: sp.id, group: g,
      cx: moundPos.x, cz: moundPos.z, rotY: rng() * 1.2,
      w: 1.9, d: 1.2, h: 1.15,
      kind: 'mound', onBreak, onStage,
    });
  }

  const paperMat = materials.marbleTop ?? materials.floor ?? materials.wood;
  const paper = paperScatter({
    count: 28, material: paperMat, rng,
    clusters: [[0, 0, 2.5], [1.8, -1.2, 1.8]],
  });
  paper.position.set(sp.cx - 6.5, 0, sp.cz + 4.5);
  room.spaces.find((s) => s.id === sp.id)?.root.add(paper);
}

/** Shared parted crate stack helper. */
function placeCrateStack(room, sp, materials, handlers, id, pos, nStack, rotY = 0.4) {
  const { onBreak, onStage, onPartBreak, onHit } = handlers;
  const crateRoot = new THREE.Group();
  const crateParts = [];
  let y = 0;
  for (let i = 0; i < nStack; i++) {
    const bin = new GeoBin();
    packingCrate(bin, {
      x: 0, y: 0, z: 0, rotY: 0.12 * (i - 1),
      keys: { body: 'body', batten: 'batten' },
    });
    const layer = new THREE.Group();
    layer.position.y = y;
    const built = bin.build({ body: materials.crate, batten: materials.crate });
    let bodyMesh = null, batMesh = null;
    for (const m of built) {
      layer.add(m);
      if (String(m.name).includes('batten')) batMesh = m;
      else bodyMesh = m;
    }
    crateRoot.add(layer);
    const h = 0.58;
    if (bodyMesh) {
      crateParts.push(new FurnPart({
        id: `${id}.body.${i}`, role: 'body', mesh: bodyMesh,
        box: partBoxWorld(pos.x, 0, pos.z, 0.4, { x: 0, y, z: 0, w: 1.2, h, d: 0.9 }),
      }));
    }
    if (batMesh) {
      crateParts.push(new FurnPart({
        id: `${id}.batten.${i}`, role: 'batten', mesh: batMesh,
        box: partBoxWorld(pos.x, 0, pos.z, 0.4, {
          x: 0, y: y + h * 0.35, z: 0.35, w: 1.15, h: h * 0.55, d: 0.2,
        }),
      }));
    }
    y += h;
  }
  crateRoot.position.set(pos.x, 0, pos.z);
  crateRoot.rotation.y = rotY;
  room.spaces.find((s) => s.id === sp.id)?.root.add(crateRoot);
  room.registerFurn(new FurnAssembly({
    id, spaceId: sp.id, kind: 'crate',
    root: crateRoot, parts: crateParts,
    onBreak, onStage, onPartBreak, onHit, legsToCollapse: 99,
  }));
}

function dressGallery(sp, room, materials, handlers) {
  const { onBreak, onStage } = handlers;
  const z = sp.z1 - 0.52;
  const x = sp.cx;
  const { group, size } = bakeProp((bin) => {
    consoleTable(bin, {
      x: 0, y: 0, z: 0, rotY: 0, w: 1.35, d: 0.44, h: 0.82,
      keys: { wood: 'wood', gilt: 'gilt', marble: 'marbleTop' },
    });
    return { w: 1.35, d: 0.44, h: 0.82 };
  }, materials);
  registerGroup(room, {
    id: `${sp.id}.console.0`, spaceId: sp.id, group,
    cx: x, cz: z, rotY: Math.PI,
    w: size.w ?? 1.35, d: size.d ?? 0.44, h: size.h ?? 0.82,
    kind: 'console', onBreak, onStage,
  });

  const urns = sp.orderPlan?.furnUrns ?? [];
  let ui = 0;
  for (const u of urns) {
    const { group: ug, size: us } = bakeProp((bin) => urnOnPedestal(bin, {
      x: 0, y: 0, z: 0, h: 1.25, keys: { stone: 'stone', gilt: 'gilt' },
    }), materials);
    registerGroup(room, {
      id: `${sp.id}.urn.${ui++}`, spaceId: sp.id, group: ug,
      cx: u.x, cz: u.z, rotY: 0,
      w: 0.55, d: 0.55, h: us.h ?? 1.75,
      kind: 'urn', onBreak, onStage,
    });
  }

  const cds = sp.orderPlan?.furnCandelabra ?? [];
  let ci = 0;
  for (const c of cds) {
    const brass = materials.brass ?? materials.gilt;
    const cg = makeCandelabra({
      brass, merge: true, light: false, h: 1.5, arms: 6, phase: 1.1 + ci,
    });
    registerGroup(room, {
      id: `${sp.id}.candelabra.${ci++}`, spaceId: sp.id, group: cg,
      cx: c.x, cz: c.z, rotY: 0,
      w: 0.55, d: 0.55, h: 1.7,
      kind: 'candelabra', onBreak, onStage,
    });
  }

  // Individual gallery paintings (order portraits skipped when furn is on).
  const portraits = sp.orderPlan?.furnPortraits ?? [];
  let pi = 0;
  for (const it of portraits) {
    const { group: pg } = bakeProp((bin, g) => {
      const canvas = portraitWall(bin, {
        x: 0, y: 0, z: 0, rotY: 0,
        material: materials.portrait,
        items: [{ x: 0, y: 0, w: it.w, h: it.h, cell: it.cell ?? 0 }],
        keys: { frame: 'gilt' },
      });
      if (canvas) g.add(canvas);
      return { w: it.w + 0.2, d: 0.18, h: it.h + 0.2 };
    }, materials);
    // Portrait centres are already at world height; group origin is canvas centre → lower cy.
    const halfH = (it.h ?? 1.6) / 2;
    registerGroup(room, {
      id: `${sp.id}.painting.${pi++}`, spaceId: sp.id, group: pg,
      cx: it.x, cy: it.y - halfH, cz: it.z, rotY: it.rotY ?? 0,
      w: (it.w ?? 1.2) + 0.25, d: 0.35, h: Math.max((it.h ?? 1.6) + 0.2, HIT_H),
      kind: 'painting', onBreak, onStage,
    });
  }

  // One boarded panel as smashable décor (gallery motif from play screenshots).
  const boardZ = sp.cz + (sp.d ?? 8) * 0.18;
  const boardX = sp.x0 + 0.28;
  const { group: bg, size: bs } = bakeProp((bin) => boardedPanel(bin, {
    x: 0, y: 0, z: 0, w: 1.55, h: 2.15,
    keys: { timber: 'timber', dark: 'dark', iron: 'dark' },
  }), materials);
  registerGroup(room, {
    id: `${sp.id}.boarded.0`, spaceId: sp.id, group: bg,
    cx: boardX, cy: 0.15, cz: boardZ, rotY: Math.PI / 2,
    w: bs.w ?? 1.55, d: bs.d ?? 0.2, h: bs.h ?? 2.15,
    kind: 'boarded', onBreak, onStage,
  });

  // Second console on the opposite long wall + gallery bench.
  const { group: c2, size: cs2 } = bakeProp((bin) => {
    consoleTable(bin, {
      x: 0, y: 0, z: 0, rotY: 0, w: 1.25, d: 0.42, h: 0.82,
      keys: { wood: 'wood', gilt: 'gilt', marble: 'marbleTop' },
    });
    return { w: 1.25, d: 0.42, h: 0.82 };
  }, materials);
  registerGroup(room, {
    id: `${sp.id}.console.1`, spaceId: sp.id, group: c2,
    cx: sp.cx - 4.5, cz: sp.z0 + 0.52, rotY: 0,
    w: cs2.w ?? 1.25, d: cs2.d ?? 0.42, h: cs2.h ?? 0.82,
    kind: 'console', onBreak, onStage,
  });

  const { group: benchG, size: benchS } = bakeProp((bin) => galleryBench(bin, {
    x: 0, y: 0, z: 0, w: 2.15,
    keys: { wood: 'wood' },
  }), materials);
  registerGroup(room, {
    id: `${sp.id}.bench.0`, spaceId: sp.id, group: benchG,
    cx: sp.cx + 5.2, cz: sp.z0 + 0.55, rotY: 0,
    w: benchS.w ?? 2.15, d: benchS.d ?? 0.48, h: benchS.h ?? 0.85,
    kind: 'bench', onBreak, onStage,
  });
}

/** Service passage — depot props along the walls; centre lane kept clear (~3.4 m corridor). */
function dressService(sp, room, materials, handlers, rng) {
  const { onBreak, onStage } = handlers;
  const inset = 0.95; // off centre toward a long wall
  const wallX = sp.cx + (rng() > 0.5 ? inset : -inset);

  placeCrateStack(room, sp, materials, handlers, `${sp.id}.crate.0`,
    { x: wallX, z: sp.cz - 4.2 }, 2, 0.2);
  placeCrateStack(room, sp, materials, handlers, `${sp.id}.crate.1`,
    { x: wallX, z: sp.cz + 3.8 }, 2 + Math.floor(rng() * 2), -0.15);

  const { group: tg, size: ts } = bakeProp((bin) => {
    trestle(bin, { x: 0, y: 0, z: 0, len: 1.85, keys: { timber: 'crate' } });
    return { w: 1.85, d: 0.35, h: 0.78 };
  }, materials);
  registerGroup(room, {
    id: `${sp.id}.trestle.0`, spaceId: sp.id, group: tg,
    cx: wallX, cz: sp.cz - 1.0, rotY: Math.PI / 2,
    w: ts.w ?? 1.85, d: ts.d ?? 0.35, h: ts.h ?? 0.78,
    kind: 'trestle', onBreak, onStage,
  });

  const sheetMat = materials.crate?.clone?.() ?? materials.wood;
  const mesh = dustSheet({
    w: 1.4, d: 0.85, h: 0.95, shape: 'chair', material: sheetMat, rng,
  });
  const sg = new THREE.Group();
  sg.add(mesh);
  registerGroup(room, {
    id: `${sp.id}.mound.0`, spaceId: sp.id, group: sg,
    cx: wallX, cz: sp.cz + 1.6, rotY: 0.4,
    w: 1.5, d: 0.95, h: 1.05,
    kind: 'mound', onBreak, onStage,
  });

  const { group: bg, size: bs } = bakeProp((bin) => boardedPanel(bin, {
    x: 0, y: 0, z: 0, w: 1.35, h: 2.0,
    keys: { timber: 'timber', dark: 'dark', iron: 'dark' },
  }), materials);
  registerGroup(room, {
    id: `${sp.id}.boarded.0`, spaceId: sp.id, group: bg,
    cx: wallX > sp.cx ? sp.x1 - 0.22 : sp.x0 + 0.22,
    cy: 0.1, cz: sp.cz + 5.5,
    rotY: wallX > sp.cx ? -Math.PI / 2 : Math.PI / 2,
    w: bs.w ?? 1.35, d: bs.d ?? 0.2, h: bs.h ?? 2.0,
    kind: 'boarded', onBreak, onStage,
  });

  const paperMat = materials.marbleTop ?? materials.floor ?? materials.wood;
  const paper = paperScatter({
    count: 16, material: paperMat, rng,
    clusters: [[0, 0, 1.6]],
  });
  paper.position.set(wallX * 0.3 + sp.cx * 0.7, 0, sp.cz);
  room.spaces.find((s) => s.id === sp.id)?.root.add(paper);
}

/** Chapel — sparse soft fill + pew. */
function dressChapel(sp, room, materials, handlers, rng) {
  const { onBreak, onStage } = handlers;

  const brass = materials.brass ?? materials.gilt;
  const cg = makeCandelabra({
    brass, merge: true, light: false, h: 1.45, arms: 5, seed: 7.1,
  });
  registerGroup(room, {
    id: `${sp.id}.candelabra.0`, spaceId: sp.id, group: cg,
    cx: sp.cx - 1.6, cz: sp.cz + 0.8, rotY: 0,
    w: 0.5, d: 0.5, h: 1.65,
    kind: 'candelabra', onBreak, onStage,
  });

  const { group: ug, size: us } = bakeProp((bin) => urnOnPedestal(bin, {
    x: 0, y: 0, z: 0, h: 1.2, keys: { stone: 'stone', gilt: 'gilt' },
  }), materials);
  registerGroup(room, {
    id: `${sp.id}.urn.0`, spaceId: sp.id, group: ug,
    cx: sp.cx + 1.7, cz: sp.cz - 1.4, rotY: 0,
    w: 0.5, d: 0.5, h: us.h ?? 1.7,
    kind: 'urn', onBreak, onStage,
  });

  const { group: boxG, size: boxS } = bakeProp((bin) => giltCasket(bin, {
    x: 0, y: 0, z: 0, keys: { gilt: 'gilt', dark: 'dark' },
  }), materials);
  registerGroup(room, {
    id: `${sp.id}.giltbox.0`, spaceId: sp.id, group: boxG,
    cx: sp.cx, cz: sp.cz - 2.2, rotY: 0.15,
    w: boxS.w ?? 0.4, d: boxS.d ?? 0.28, h: Math.max(boxS.h ?? 0.25, HIT_H),
    kind: 'giltbox', onBreak, onStage,
  });

  const { group: pewG, size: pewS } = bakeProp((bin) => chapelPew(bin, {
    x: 0, y: 0, z: 0, w: 2.4,
    keys: { wood: 'wood' },
  }), materials);
  registerGroup(room, {
    id: `${sp.id}.pew.0`, spaceId: sp.id, group: pewG,
    cx: sp.cx, cz: sp.cz + 0.4, rotY: Math.PI,
    w: pewS.w ?? 2.4, d: pewS.d ?? 0.52, h: pewS.h ?? 1.05,
    kind: 'pew', onBreak, onStage,
  });
}

/**
 * Place one RRR camera FurnProp. Wall cams use cy as floor of AABB near mount height.
 * Returns catalog entry for engine.__rrrCams.
 */
function placeCamera(room, materials, handlers, site, cams) {
  const { onBreak, onStage } = handlers;
  const live = !!site.live;
  const mount = site.mount ?? 'wall';
  const { group, size } = bakeProp((bin) => rrrCamera(bin, {
    x: 0, y: 0, z: 0, mount, live,
    keys: { body: 'dark', lens: 'dark', brass: 'gilt' },
  }), materials);

  const tally = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 0.03, 0.04),
    new THREE.MeshStandardMaterial({
      color: 0x222222,
      emissive: live ? 0xff1a1a : 0x000000,
      emissiveIntensity: live ? 2.2 : 0,
      roughness: 0.4,
      metalness: 0.3,
    }),
  );
  const tloc = size.tally ?? [0.12, 0.1, -0.16];
  tally.position.set(tloc[0], tloc[1], tloc[2]);
  tally.name = 'tally';
  group.add(tally);
  group.userData.live = live;
  group.userData.tally = tally;

  const id = site.id;
  const wrapBreak = (prop, info) => {
    const entry = cams.find((c) => c.id === id);
    if (entry) { entry.live = false; entry.smashed = true; }
    if (tally.material) {
      tally.material.emissive.setHex(0x000000);
      tally.material.emissiveIntensity = 0;
    }
    onBreak?.(prop, info);
  };

  let cy = 0, h = size.h ?? 1.5;
  if (mount === 'wall') {
    const mountY = site.y ?? 1.55;
    // Fat slab into the room so sledge arc jitter still connects (r4/r5 ~1/4).
    h = 1.85;
    cy = mountY - 1.35;
  } else {
    // Fat footprint so floor-aim sledge connects (playcritique r1 miss).
    h = Math.max(size.h ?? 1.5, 1.55);
  }

  // Wall cams: pull collider centre into the room so the panel face cannot steal the ray.
  let cx = site.x, cz = site.z;
  if (mount === 'wall') {
    const rot = site.rotY ?? 0;
    const into = 0.55;
    cx += Math.sin(rot) * into;
    cz += Math.cos(rot) * into;
  }

  const fp = registerGroup(room, {
    id, spaceId: site.spaceId, group,
    cx, cy, cz, rotY: site.rotY ?? 0,
    w: mount === 'tripod' ? 1.15 : 1.45,
    d: mount === 'tripod' ? 1.15 : 1.55,
    h,
    kind: 'camera', onBreak: wrapBreak, onStage,
    health: FURN_HP.camera,
  });
  if (mount === 'wall' && group) {
    group.position.y = site.y ?? 1.55;
  }
  if (fp) {
    fp.mount = mount;
    if (group) group.userData.mount = mount;
  }

  cams.push({
    id, spaceId: site.spaceId, live, smashed: false,
    mount, x: site.x, y: site.y ?? (mount === 'wall' ? 1.55 : 0), z: site.z,
  });
  return fp;
}

/**
 * Strategic RRR camera sites (~12–18). Aims lens into the room / down the corridor.
 */
function dressCameras(room, materials, handlers) {
  const cams = [];
  const byId = (id) => room.spaces.find((s) => s.id === id);
  const WALL_Y = 1.55;

  const gallery = byId('gallery');
  if (gallery) {
    const g = gallery;
    // Ends looking down the long axis + mid-bay each long wall.
    placeCamera(room, materials, handlers, {
      id: 'cam.gallery.w', spaceId: g.id, mount: 'wall',
      x: g.x0 + 0.22, y: WALL_Y, z: g.cz, rotY: Math.PI / 2,
    }, cams);
    placeCamera(room, materials, handlers, {
      id: 'cam.gallery.e', spaceId: g.id, mount: 'wall',
      x: g.x1 - 0.22, y: WALL_Y, z: g.cz, rotY: -Math.PI / 2,
    }, cams);
    placeCamera(room, materials, handlers, {
      id: 'cam.gallery.n', spaceId: g.id, mount: 'wall',
      x: g.cx, y: WALL_Y, z: g.z0 + 0.22, rotY: 0,
    }, cams);
    placeCamera(room, materials, handlers, {
      id: 'cam.gallery.s', spaceId: g.id, mount: 'wall',
      x: g.cx + 3.5, y: WALL_Y, z: g.z1 - 0.22, rotY: Math.PI,
    }, cams);
  }

  const service = byId('service');
  if (service) {
    const s = service;
    placeCamera(room, materials, handlers, {
      id: 'cam.service.n', spaceId: s.id, mount: 'wall',
      x: s.cx, y: WALL_Y, z: s.z0 + 0.2, rotY: 0,
    }, cams);
    placeCamera(room, materials, handlers, {
      id: 'cam.service.s', spaceId: s.id, mount: 'wall',
      x: s.cx, y: WALL_Y, z: s.z1 - 0.2, rotY: Math.PI,
    }, cams);
  }

  const ballroom = byId('ballroom');
  if (ballroom) {
    const b = ballroom;
    // Tripod overlooking chair circle; two wall cams toward door / terrace sides.
    placeCamera(room, materials, handlers, {
      id: 'cam.ballroom.tripod', spaceId: b.id, mount: 'tripod',
      // Clear of depot mound at (+5.5,+5.8) — playcritique r2 stole hits.
      x: b.cx - 5.4, y: 0, z: b.cz + 4.2, rotY: 2.2,
    }, cams);
    placeCamera(room, materials, handlers, {
      id: 'cam.ballroom.n', spaceId: b.id, mount: 'wall',
      x: b.cx, y: WALL_Y, z: b.z0 + 0.25, rotY: 0,
    }, cams);
    placeCamera(room, materials, handlers, {
      id: 'cam.ballroom.arch', spaceId: b.id, mount: 'wall',
      x: b.x1 - 0.25, y: WALL_Y, z: b.cz - 2.5, rotY: -Math.PI / 2,
    }, cams);
  }

  for (const id of ['study_w', 'study_e']) {
    const st = byId(id);
    if (!st) continue;
    // Desk side + gallery-facing wall (north for both studies typically).
    placeCamera(room, materials, handlers, {
      id: `cam.${id}`, spaceId: st.id, mount: 'wall',
      x: st.cx + (id === 'study_w' ? 2.2 : -2.2),
      y: WALL_Y, z: st.z0 + 0.22, rotY: 0,
    }, cams);
  }

  const chapel = byId('chapel');
  if (chapel) {
    const c = chapel;
    placeCamera(room, materials, handlers, {
      id: 'cam.chapel.entry', spaceId: c.id, mount: 'wall',
      x: c.cx, y: WALL_Y, z: c.z1 - 0.22, rotY: Math.PI,
    }, cams);
    placeCamera(room, materials, handlers, {
      id: 'cam.chapel.altar', spaceId: c.id, mount: 'wall',
      x: c.cx, y: WALL_Y, z: c.z0 + 0.22, rotY: 0,
    }, cams);
  }

  // Interior connector mouths — gallery↔ballroom approaches via study/service if free.
  const mouths = [];
  if (gallery && ballroom) {
    mouths.push({
      id: 'cam.mouth.gallery.ball', spaceId: gallery.id, mount: 'wall',
      x: gallery.cx - 6.0, y: WALL_Y, z: gallery.z1 - 0.22, rotY: Math.PI,
    });
  }
  if (byId('study_w') && gallery) {
    mouths.push({
      id: 'cam.mouth.study_w', spaceId: 'study_w', mount: 'wall',
      x: byId('study_w').cx, y: WALL_Y, z: byId('study_w').z0 + 0.22, rotY: 0,
    });
  }
  if (byId('study_e') && gallery) {
    mouths.push({
      id: 'cam.mouth.study_e', spaceId: 'study_e', mount: 'wall',
      x: byId('study_e').cx, y: WALL_Y, z: byId('study_e').z0 + 0.22, rotY: 0,
    });
  }
  // Cap at 16 house-wide typical: base ~14, add up to 2 mouths if under 16.
  for (const m of mouths) {
    if (cams.length >= 16) break;
    if (cams.some((c) => c.id === m.id)) continue;
    // Skip if too close to an existing camera in the same space.
    const near = cams.some((c) => c.spaceId === m.spaceId
      && Math.hypot(c.x - m.x, c.z - m.z) < 2.5);
    if (near) continue;
    placeCamera(room, materials, handlers, m, cams);
  }

  return cams;
}

const EMPTY_DRESS = {
  studies: 0, ballroom: 0, gallery: 0, service: 0, chapel: 0,
  cameras: 0, counts: {}, cams: [],
  catalog: { placed: 0, missing: [], props: [] },
};

/**
 * Dress studies, ballroom extras, gallery, service, chapel, house cameras, and the smash
 * catalog (armor / lounges / piano / chandeliers).
 *
 * 🪑 **THIS IS THE PLACER HOOK** (`docs/slices/task-procedural-mansion-layout.md` Change 5).
 * Catalog ids live in `furn-layout.js`; they load from here so `game.js` / `follow-bed.js`
 * do not invent a second dresser. Missing GLBs skip (`catalog.missing`), never throw.
 * Early-return paths still attempt the catalog — a room that cannot take a procedural desk
 * can still take a knight if `registerFurn` exists.
 *
 * @returns {Promise<{ studies, ballroom, gallery, service, chapel, cameras, counts, cams, catalog }>}
 */
export async function dressLooseFurniture(room, { debris, dust, rng } = {}) {
  const out = {
    studies: 0, ballroom: 0, gallery: 0, service: 0, chapel: 0,
    cameras: 0, counts: {}, cams: [],
    catalog: EMPTY_DRESS.catalog,
  };
  if (!room?.registerFurn) return out;

  if (room.materials) {
    const materials = furnMats(room);
    if (materials.wood) {
      const handlers = makeFurnHandlers({ debris, dust });
      const seedRng = rng ?? (() => 0.5);

      for (const sp of room.spaces) {
        if (sp.order === 'study' && sp.orderPlan) {
          dressStudy(sp, room, materials, handlers, seedRng);
          out.studies++;
        } else if (sp.order === 'ballroom' && sp.orderPlan) {
          dressBallroomExtras(sp, room, materials, handlers, seedRng);
          out.ballroom++;
        } else if (sp.order === 'gallery' && sp.orderPlan) {
          dressGallery(sp, room, materials, handlers);
          out.gallery++;
        } else if (sp.id === 'service') {
          dressService(sp, room, materials, handlers, seedRng);
          out.service++;
        } else if (sp.id === 'chapel') {
          dressChapel(sp, room, materials, handlers, seedRng);
          out.chapel++;
        }
      }

      out.cams = dressCameras(room, materials, handlers);
      out.cameras = out.cams.length;

      const counts = {
        urn: 0, candelabra: 0, painting: 0, fireplace: 0, boarded: 0, giltbox: 0,
        camera: 0, trestle: 0, bench: 0, pew: 0, mound: 0, crate: 0, desk: 0, console: 0,
      };
      for (const fp of room.furnProps ?? []) {
        if (counts[fp.kind] != null) counts[fp.kind]++;
      }
      out.counts = counts;
    }
  }

  try {
    out.catalog = await dressCatalogFurniture(room, { debris, dust });
  } catch (e) {
    console.warn('[furn-dress] catalog furniture skipped —', e?.message ?? e);
    out.catalog = { placed: 0, missing: [], props: [], error: e?.message ?? String(e) };
  }
  return out;
}
