/**
 * Procedural smashable furniture from `furn-catalog.js` ids only.
 *
 * `docs/slices/task-procedural-mansion-layout.md` Change 5. John, 2026-08-23:
 *   knight (armor) → corridors
 *   chaise / settee / wingback → study
 *   grand-piano + chandelier → ballroom
 *
 * ⚠️ **NO INVENTED GLBs.** Every `id` is a row in `FURN_SMASH_ASSETS`. A file that 404s is a
 * skip (`missing`), not a procedural fake wearing that id. `public/models/furn/` is empty in
 * the checkout this slice inventoried — the dress is written so the night picks the assets
 * up the moment they land, and is honest when they have not.
 *
 * The placement table is pure (no THREE) so `party-warm` can assert the ids. The loader is
 * optional and only runs in a browser that already has a room.
 */

import { FURN_SMASH_ASSETS } from './furn-catalog.js';

/** Catalog ids this slice is allowed to place. Anything else is a bug in the table. */
export const LAYOUT_CATALOG_IDS = [
  'armor', 'chaise', 'settee', 'wingback', 'grand-piano', 'chandelier',
];

const BY_ID = new Map(FURN_SMASH_ASSETS.map((a) => [a.id, a]));

for (const id of LAYOUT_CATALOG_IDS) {
  if (!BY_ID.has(id)) throw new Error(`[furn-layout] ${id} is not in FURN_SMASH_ASSETS`);
}

/**
 * @param {Array<{ id:string, roomType?:string, x0:number, x1:number, z0:number, z1:number }>} spaces
 * @returns {{ id:string, catalogId:string, spaceId:string, x:number, z:number, rotY:number }[]}
 */
export function catalogPlacements(spaces = []) {
  const out = [];
  const rooms = spaces.filter((s) => s.roomType);
  const corridors = spaces.filter((s) => !s.roomType);
  const mid = (s) => ({ x: (s.x0 + s.x1) / 2, z: (s.z0 + s.z1) / 2 });

  let armorN = 0;
  for (const s of corridors) {
    if (armorN >= 3) break;
    const w = s.x1 - s.x0, d = s.z1 - s.z0;
    if (Math.min(w, d) < 2.2) continue;          // a sliver cannot hold a knight
    const c = mid(s);
    const alongX = w >= d;
    out.push({
      id: `${s.id}.armor.${armorN}`,
      catalogId: 'armor',
      spaceId: s.id,
      x: alongX ? c.x : s.x0 + 0.85,
      z: alongX ? s.z0 + 0.85 : c.z,
      rotY: alongX ? 0 : Math.PI / 2,
    });
    armorN++;
  }

  const lounge = ['wingback', 'settee', 'chaise'];
  let li = 0;
  for (const s of rooms.filter((r) => r.roomType === 'study')) {
    const c = mid(s);
    const ids = lounge.slice(0, 2);
    ids.forEach((catalogId, i) => {
      const side = i === 0 ? -1 : 1;
      out.push({
        id: `${s.id}.${catalogId}`,
        catalogId,
        spaceId: s.id,
        x: c.x + side * Math.min(2.4, (s.x1 - s.x0) * 0.22),
        z: c.z + (i === 0 ? 1.1 : -1.1),
        rotY: i === 0 ? 0.35 : Math.PI - 0.35,
      });
      li++;
    });
  }
  // A house with one study still gets the third lounge piece in that study.
  const firstStudy = rooms.find((r) => r.roomType === 'study');
  if (firstStudy && li < 3) {
    const c = mid(firstStudy);
    out.push({
      id: `${firstStudy.id}.chaise`,
      catalogId: 'chaise',
      spaceId: firstStudy.id,
      x: c.x,
      z: c.z + Math.min(2.6, (firstStudy.z1 - firstStudy.z0) * 0.28),
      rotY: Math.PI,
    });
  }

  for (const s of rooms.filter((r) => r.roomType === 'ballroom')) {
    const c = mid(s);
    const short = Math.min(s.x1 - s.x0, s.z1 - s.z0);
    out.push({
      id: `${s.id}.grand-piano`,
      catalogId: 'grand-piano',
      spaceId: s.id,
      x: c.x + Math.min(5.2, (s.x1 - s.x0) * 0.28),
      z: c.z,
      rotY: -0.4,
    });
    // Two chandeliers on the long axis, clear of the (now empty) centre so chairs can land later.
    const span = Math.min(4.8, short * 0.28);
    for (const [k, sign] of [['a', -1], ['b', 1]]) {
      out.push({
        id: `${s.id}.chandelier.${k}`,
        catalogId: 'chandelier',
        spaceId: s.id,
        x: c.x,
        z: c.z + sign * span,
        rotY: 0,
      });
    }
  }
  return out;
}

/**
 * Load catalog GLBs into the built room. Missing files are collected, never thrown.
 * No-op in node (no THREE / no loader).
 *
 * @returns {Promise<{ placed:number, missing:string[], props:object[] }>}
 */
export async function dressCatalogFurniture(room, { debris, dust } = {}) {
  const empty = { placed: 0, missing: [], props: [] };
  if (!room?.registerFurn || typeof document === 'undefined') return empty;
  const placements = catalogPlacements(room.spaces ?? []);
  if (!placements.length) return empty;

  const [{ GLTFLoader }, { FurnProp, furnBox, FURN_HP }, { makeFurnHandlers }] = await Promise.all([
    import('three/examples/jsm/loaders/GLTFLoader.js'),
    import('../destruction/furnprop.js'),
    import('../destruction/furn-fx.js'),
  ]);

  const handlers = makeFurnHandlers({ debris, dust });
  const loader = new GLTFLoader();
  const missing = [];
  const props = [];
  let placed = 0;

  for (const slot of placements) {
    const spec = BY_ID.get(slot.catalogId);
    if (!spec) { missing.push(slot.catalogId); continue; }
    const url = `/models/furn/${spec.file}`;
    let gltf;
    try {
      gltf = await loader.loadAsync(url);
    } catch {
      if (!missing.includes(spec.id)) missing.push(spec.id);
      continue;
    }
    const sp = room.spaces.find((s) => s.id === slot.spaceId);
    if (!sp) continue;
    const root = gltf.scene;
    root.name = slot.id;
    root.position.set(slot.x, spec.liftY ?? 0, slot.z);
    root.rotation.y = slot.rotY;
    sp.root.add(root);
    const fp = room.registerFurn(new FurnProp({
      id: slot.id,
      spaceId: slot.spaceId,
      box: furnBox(slot.x, spec.liftY ?? 0, slot.z, spec.maxSpan ?? 1.2, spec.targetH ?? 1.2, spec.maxSpan ?? 1.2),
      mesh: root,
      kind: spec.kind,
      health: spec.health ?? FURN_HP[spec.kind],
      onBreak: handlers.onBreak,
      onStage: handlers.onStage,
    }));
    if (fp) { props.push(fp); placed++; }
  }
  return { placed, missing, props };
}
