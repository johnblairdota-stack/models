/**
 * Procedural smashable furniture from `furn-catalog.js` ids only.
 *
 * `docs/slices/task-procedural-mansion-layout.md` Change 5 + Change 6. John, 2026-08-23:
 *   Playtest after PR #10: none of the furniture matched the 24 `rrr_prop_*` concept sheet.
 *   Diagnosis: LAYOUT_CATALOG_IDS only placed 6; GeoBin kit was still the visual majority.
 *
 *   knight (armor) + hall-stand + crate     → corridors / service
 *   chaise / settee / wingback / ottoman    → study (lounge)
 *   desk / bookcase / chair / fireplace / gramophone → study
 *   grand-piano + chandelier + rug-circle + card-table + torchiere + cam-tripod → ballroom
 *   console / vitrine / sideboard / pedestal-bust / cam-wall → gallery
 *   table-round → chapel (study fallback)
 *
 * ⚠️ **NO INVENTED GLBs.** Every `id` is a row in `FURN_SMASH_ASSETS`. The 24
 * `public/models/furn/rrr_prop_*.glb` files are in git as normal blobs. A 404 is still a
 * skip (`missing`), not a procedural fake. `bed.glb` / `tato.glb` are local-only and are
 * not in this table.
 *
 * Doorway clearance is `portal-clearance.js` — the shared helper. Do not invent a second one.
 *
 * The placement table is pure (no THREE) so `party-warm` can assert the ids. The loader is
 * optional and only runs in a browser that already has a room.
 *
 * ⚠️ **THE LIVE HOOK IS `dressLooseFurniture` IN `furn-dress.js`.** Callers (game.js Phase B,
 * follow-bed warm) go through that function. This file is the table + GLB loader it calls.
 */

import { FURN_SMASH_ASSETS, FURN_FIT_BOOST } from './furn-catalog.js';
import {
  blockedByOpenings,
  openingsFromRoom,
} from './portal-clearance.js';

export { openingsFromRoom } from './portal-clearance.js';

const BY_ID = new Map(FURN_SMASH_ASSETS.map((a) => [a.id, a]));

/** Every smash-catalog id. Anything else is a bug in the table. */
export const LAYOUT_CATALOG_IDS = FURN_SMASH_ASSETS.map((a) => a.id);

for (const id of LAYOUT_CATALOG_IDS) {
  if (!BY_ID.has(id)) throw new Error(`[furn-layout] ${id} is not in FURN_SMASH_ASSETS`);
}

/**
 * Preferred rooms per catalog id. Fallbacks keep a generated house (missing chapel / gallery)
 * from dropping the smash set. Documented in the slice; asserted by party-warm W14.
 */
export const CATALOG_ROOM_ASSIGN = {
  armor:          { rooms: ['service', 'corridor'], note: 'John: knight in corridors / service' },
  'hall-stand':   { rooms: ['service', 'corridor'], note: 'back-of-house coat rack' },
  crate:          { rooms: ['service', 'corridor'], note: 'depot crate, not a gallery table' },
  chaise:         { rooms: ['study'], note: 'John: lounge' },
  settee:         { rooms: ['study'], note: 'John: lounge' },
  wingback:       { rooms: ['study'], note: 'John: lounge' },
  ottoman:        { rooms: ['study'], note: 'John: lounge (with the seating group)' },
  desk:           { rooms: ['study'], note: 'writing desk' },
  bookcase:       { rooms: ['study'], note: 'tall case on a free wall' },
  chair:          { rooms: ['study'], note: 'desk / side chair' },
  fireplace:      { rooms: ['study'], note: 'against a wall, never a doorway' },
  gramophone:     { rooms: ['study'], note: 'parlour machine' },
  'grand-piano':  { rooms: ['ballroom'], note: 'John: ballroom' },
  chandelier:     { rooms: ['ballroom'], note: 'John: ballroom, hanging — two on the long axis' },
  'rug-circle':   { rooms: ['ballroom'], note: 'thin floor; chair-ring centre' },
  torchiere:      { rooms: ['ballroom', 'gallery'], note: 'standing lamp, wall-inboard' },
  'card-table':   { rooms: ['ballroom', 'study'], note: 'side table, clear of the chair ring' },
  console:        { rooms: ['gallery', 'ballroom'], note: 'long-wall table; playtest blocked D1' },
  vitrine:        { rooms: ['gallery', 'study'], note: 'display case' },
  sideboard:      { rooms: ['gallery', 'ballroom'], note: 'serving board on a long wall' },
  'pedestal-bust':{ rooms: ['gallery', 'chapel'], note: 'sculpture on a short wall' },
  'cam-wall':     { rooms: ['gallery', 'study'], note: 'catalog smash cam at kit dressCameras wall sites' },
  'table-round':  { rooms: ['chapel', 'study'], note: 'small centre table' },
  'cam-tripod':   { rooms: ['ballroom', 'service'], note: 'catalog smash cam at kit cam.ballroom.tripod' },
};

/** Vite serves `public/` at `/`. Same prefix `furn-smash-lab.js` already loads. */
export const CATALOG_URL_PREFIX = '/models/furn/';

export function catalogUrl(catalogId) {
  const spec = BY_ID.get(catalogId);
  return spec ? `${CATALOG_URL_PREFIX}${spec.file}` : null;
}

/**
 * Generated rows carry `roomType`. Authored `HOUSE_PLAN` rows from `placeRoom` carry `order`
 * (ballroom / study / gallery) and no `roomType`. Chapel / service have neither — chapel is
 * still a room (id), service is the authored passage a knight can stand in.
 */
export function spaceKind(s) {
  if (s?.roomType) return s.roomType;
  if (s?.order) return s.order;
  const id = s?.id ?? '';
  if (id === 'study_w' || id === 'study_e' || id.endsWith('.study')) return 'study';
  if (id === 'ballroom' || id.endsWith('.ballroom')) return 'ballroom';
  if (id === 'gallery' || id.endsWith('.gallery')) return 'gallery';
  if (id === 'chapel' || id.endsWith('.chapel')) return 'chapel';
  if (id === 'service' || id.endsWith('.service')) return 'service';
  return null;
}

function isCorridor(s) {
  const k = spaceKind(s);
  return !k || k === 'service';
}

function mid(s) {
  return { x: (s.x0 + s.x1) / 2, z: (s.z0 + s.z1) / 2 };
}

function halfSpan(spec) {
  return (spec?.maxSpan ?? 1.2) * 0.5;
}

/** Hanging lights do not block a doorway. Thin rugs barely do. */
export function walkHalf(spec) {
  if ((spec?.liftY ?? 0) >= 2.0) return 0;
  if (spec?.thin) return Math.min(0.28, halfSpan(spec) * 0.18);
  // Visual occupancy, not the catalog's pre-boost span. `fitCatalogProp` multiplies
  // non-thin meshes by `FURN_FIT_BOOST`; a keep-out that ignores it leaves a crate
  // (catalog maxSpan 0.63 after ×0.7 → ~0.98 m on the floor) filling a 1.90 m door.
  return halfSpan(spec) * FURN_FIT_BOOST;
}

function wallSlot(s, wall, t, inset) {
  const w = s.x1 - s.x0;
  const d = s.z1 - s.z0;
  const u = Math.min(0.88, Math.max(0.12, t));
  if (wall === 'n') return { x: s.x0 + w * u, z: s.z0 + inset, rotY: 0 };
  if (wall === 's') return { x: s.x0 + w * u, z: s.z1 - inset, rotY: Math.PI };
  if (wall === 'w') return { x: s.x0 + inset, z: s.z0 + d * u, rotY: Math.PI / 2 };
  return { x: s.x1 - inset, z: s.z0 + d * u, rotY: -Math.PI / 2 };
}

function inboardSlot(s, ox, oz, rotY) {
  const c = mid(s);
  return {
    x: c.x + ox * (s.x1 - s.x0),
    z: c.z + oz * (s.z1 - s.z0),
    rotY,
  };
}

function clampIn(s, x, z, margin) {
  return {
    x: Math.min(s.x1 - margin, Math.max(s.x0 + margin, x)),
    z: Math.min(s.z1 - margin, Math.max(s.z0 + margin, z)),
  };
}

function farEnough(x, z, placed, minDist) {
  for (const p of placed) {
    if (Math.hypot(p.x - x, p.z - z) < minDist) return false;
  }
  return true;
}

function roomsOfKind(spaces, kind) {
  if (kind === 'corridor') return spaces.filter(isCorridor);
  return spaces.filter((s) => spaceKind(s) === kind);
}

const TS = [0.22, 0.38, 0.50, 0.62, 0.78, 0.18, 0.82, 0.30, 0.70];
const WALLS_ALL = ['n', 's', 'e', 'w'];

/**
 * Recipes. `copies` is a cap, not a promise — a sliver corridor may take fewer knights.
 * `clearCentre` keeps floor props out of the ballroom chair ring (~r 5.2).
 */
const RECIPES = [
  { id: 'armor',           copies: 3, place: 'wall',    inset: 0.85, walls: ['w', 'e'] },
  { id: 'hall-stand',      copies: 1, place: 'wall',    inset: 0.75, walls: ['w', 'e'] },
  { id: 'crate',           copies: 1, place: 'wall',    inset: 0.95, walls: ['w', 'e'] },
  { id: 'wingback',        copies: 1, place: 'inboard', ox: -0.22, oz: 0.16, rotY: 0.35, pick: 0 },
  { id: 'settee',          copies: 1, place: 'inboard', ox: 0.22, oz: -0.14, rotY: Math.PI - 0.35, pick: 0 },
  { id: 'chaise',          copies: 1, place: 'inboard', ox: 0.00, oz: 0.28, rotY: Math.PI, pick: 0 },
  { id: 'ottoman',         copies: 1, place: 'inboard', ox: 0.06, oz: 0.06, rotY: 0.2, pick: 0 },
  { id: 'desk',            copies: 1, place: 'wall',    inset: 1.45, walls: ['e', 'w'], pick: 0 },
  { id: 'bookcase',        copies: 1, place: 'wall',    inset: 0.72, walls: ['w', 'e'], pick: 1 },
  { id: 'chair',           copies: 1, place: 'inboard', ox: -0.16, oz: 0.20, rotY: 0.55, pick: 0 },
  { id: 'fireplace',       copies: 1, place: 'wall',    inset: 0.55, walls: ['n', 's'], pick: 1 },
  { id: 'gramophone',      copies: 1, place: 'inboard', ox: 0.24, oz: -0.20, rotY: -0.45, pick: 1 },
  { id: 'grand-piano',     copies: 1, place: 'inboard', ox: 0.28, oz: 0.00, rotY: -0.4, clearCentre: 5.2 },
  { id: 'chandelier',      copies: 2, place: 'hang' },
  { id: 'rug-circle',      copies: 1, place: 'centre' },
  { id: 'torchiere',       copies: 1, place: 'wall',    inset: 0.70, walls: WALLS_ALL },
  { id: 'card-table',      copies: 1, place: 'inboard', ox: -0.30, oz: 0.24, rotY: 0.25, clearCentre: 5.2 },
  { id: 'console',         copies: 1, place: 'wall',    inset: 0.62, walls: ['n', 's'] },
  { id: 'vitrine',         copies: 1, place: 'wall',    inset: 0.62, walls: ['n', 's'] },
  { id: 'sideboard',       copies: 1, place: 'wall',    inset: 0.70, walls: ['s', 'n'] },
  { id: 'pedestal-bust',   copies: 1, place: 'wall',    inset: 0.80, walls: ['e', 'w'] },
  { id: 'cam-wall',        copies: 1, place: 'cam-wall' },
  { id: 'table-round',     copies: 1, place: 'inboard', ox: 0.00, oz: 0.00, rotY: 0.15 },
  { id: 'cam-tripod',      copies: 1, place: 'cam-tripod', clearCentre: 5.2 },
];

function pickSpaces(spaces, assign, pick) {
  const found = [];
  const seen = new Set();
  for (const kind of assign.rooms) {
    for (const s of roomsOfKind(spaces, kind)) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      found.push(s);
    }
  }
  if (!found.length) return [];
  if (pick == null) return found;
  return [found[Math.min(pick, found.length - 1)]];
}

function candidatesFor(recipe, space, spec) {
  const minDim = Math.min(space.x1 - space.x0, space.z1 - space.z0);
  if (minDim < 1.6 && recipe.place !== 'hang') return [];
  const half = Math.max(0.35, halfSpan(spec));
  const inset = Math.min(
    Math.max(recipe.inset ?? 0.8, half + 0.18),
    minDim * 0.38,
  );
  const out = [];
  if (recipe.place === 'hang') {
    const c = mid(space);
    const short = minDim;
    const span = Math.min(4.8, short * 0.28);
    out.push({ x: c.x, z: c.z - span, rotY: 0 });
    out.push({ x: c.x, z: c.z + span, rotY: 0 });
    return out;
  }
  if (recipe.place === 'centre') {
    const c = mid(space);
    out.push({ x: c.x, z: c.z, rotY: 0 });
    return out;
  }
  if (recipe.place === 'cam-wall') {
    // Same mouths `dressCameras` used for kit `rrrCamera` — catalog GLB, not GeoBin.
    const c = mid(space);
    out.push(
      { x: space.x0 + 0.22, z: c.z, rotY: Math.PI / 2 },
      { x: space.x1 - 0.22, z: c.z, rotY: -Math.PI / 2 },
      { x: c.x, z: space.z0 + 0.22, rotY: 0 },
      { x: c.x + Math.min(3.5, (space.x1 - space.x0) * 0.12), z: space.z1 - 0.22, rotY: Math.PI },
    );
    return out;
  }
  if (recipe.place === 'cam-tripod') {
    // Kit `cam.ballroom.tripod` at (cx-5.4, cz+4.2), then mirrors if that slot is blocked.
    const c = mid(space);
    out.push(
      { x: c.x - 5.4, z: c.z + 4.2, rotY: 2.2 },
      { x: c.x + 5.4, z: c.z + 4.2, rotY: -2.2 },
      { x: c.x - 5.4, z: c.z - 4.2, rotY: 0.8 },
    );
    return out;
  }
  if (recipe.place === 'inboard') {
    out.push(inboardSlot(space, recipe.ox ?? 0, recipe.oz ?? 0, recipe.rotY ?? 0));
    // Offsets if the first slot is a doorway or another prop.
    for (const [dx, dz] of [[0.12, 0], [-0.12, 0], [0, 0.12], [0, -0.12], [0.18, 0.10], [-0.18, -0.10]]) {
      out.push(inboardSlot(space, (recipe.ox ?? 0) + dx, (recipe.oz ?? 0) + dz, recipe.rotY ?? 0));
    }
    return out;
  }
  for (const wall of recipe.walls ?? WALLS_ALL) {
    for (const t of TS) out.push(wallSlot(space, wall, t, inset));
  }
  return out;
}

function accept(space, spec, slot, openings, placed, recipe) {
  const margin = Math.max(0.45, walkHalf(spec) * 0.35);
  const p = clampIn(space, slot.x, slot.z, margin);
  if (p.x <= space.x0 + 0.2 || p.x >= space.x1 - 0.2) return null;
  if (p.z <= space.z0 + 0.2 || p.z >= space.z1 - 0.2) return null;
  const half = walkHalf(spec);
  if (recipe.clearCentre) {
    const c = mid(space);
    if (Math.hypot(p.x - c.x, p.z - c.z) < recipe.clearCentre) return null;
  }
  if (blockedByOpenings(p.x, p.z, half, half, openings)) return null;
  const minDist = Math.max(1.35, halfSpan(spec) + 0.45);
  if (!farEnough(p.x, p.z, placed, minDist)) return null;
  return { x: p.x, z: p.z, rotY: slot.rotY ?? 0 };
}

/**
 * Normalise the second argument of `catalogPlacements`.
 *
 * PR #13's catalog table takes an openings array. PR #14's W18 (and the old
 * six-id table) passed `{ portals }`. One helper, both shapes — an object with
 * a `portals` key is not itself an opening.
 */
export function openingsArg(openingsOrOpts) {
  if (Array.isArray(openingsOrOpts)) return openingsOrOpts;
  if (!openingsOrOpts) return [];
  if (Array.isArray(openingsOrOpts.portals)) return openingsOrOpts.portals;
  if (Array.isArray(openingsOrOpts.openings)) return openingsOrOpts.openings;
  return [];
}

/**
 * @param {Array<{ id:string, roomType?:string, order?:string, x0:number, x1:number, z0:number, z1:number }>} spaces
 * @param {Array<{ x:number, z:number, w?:number, axis?:string }>|{ portals?:Array, openings?:Array }} [openings]
 * @returns {{ id:string, catalogId:string, spaceId:string, x:number, z:number, rotY:number }[]}
 */
export function catalogPlacements(spaces = [], openings = []) {
  openings = openingsArg(openings);
  const out = [];
  const used = new Set();

  for (const recipe of RECIPES) {
    const spec = BY_ID.get(recipe.id);
    const assign = CATALOG_ROOM_ASSIGN[recipe.id];
    if (!spec || !assign) continue;
    const targets = pickSpaces(spaces, assign, recipe.pick);
    let n = 0;
    const want = recipe.copies ?? 1;
    for (const space of targets) {
      if (n >= want) break;
      if (isCorridor(space) && Math.min(space.x1 - space.x0, space.z1 - space.z0) < 2.2
          && recipe.id === 'armor') {
        continue;
      }
      // One room may take several copies (two chandeliers, up to three knights).
      for (const slot of candidatesFor(recipe, space, spec)) {
        if (n >= want) break;
        const hit = accept(space, spec, slot, openings, out, recipe);
        if (!hit) continue;
        out.push({
          id: `${space.id}.${recipe.id}.${n}`,
          catalogId: recipe.id,
          spaceId: space.id,
          x: hit.x,
          z: hit.z,
          rotY: hit.rotY,
        });
        used.add(recipe.id);
        n++;
      }
    }
  }

  // Leftovers (preferred room missing, or every slot blocked): one more pass on any
  // non-sliver room, still under clearance. Never invent an id.
  for (const id of LAYOUT_CATALOG_IDS) {
    if (used.has(id)) continue;
    const spec = BY_ID.get(id);
    const assign = CATALOG_ROOM_ASSIGN[id];
    if (!spec || !assign) continue;
    const recipe = RECIPES.find((r) => r.id === id) ?? { id, place: 'inboard', ox: 0, oz: 0, rotY: 0 };
    const fallback = spaces.filter((s) => Math.min(s.x1 - s.x0, s.z1 - s.z0) >= 2.4);
    for (const space of fallback) {
      for (const slot of candidatesFor({ ...recipe, place: recipe.place ?? 'wall', walls: WALLS_ALL, inset: 0.9 }, space, spec)) {
        const hit = accept(space, spec, slot, openings, out, recipe);
        if (!hit) continue;
        out.push({
          id: `${space.id}.${id}.fb`,
          catalogId: id,
          spaceId: space.id,
          x: hit.x,
          z: hit.z,
          rotY: hit.rotY,
        });
        used.add(id);
        break;
      }
      if (used.has(id)) break;
    }
  }
  return out;
}

/**
 * True when every placement that can block a walk stays out of every opening.
 * Chandeliers (liftY ≥ 2) and missing specs are ignored.
 */
export function placementsClearOfOpenings(placements, openings = []) {
  for (const slot of placements) {
    const spec = BY_ID.get(slot.catalogId);
    const half = walkHalf(spec);
    if (!(half > 0)) continue;
    if (blockedByOpenings(slot.x, slot.z, half, half, openings)) return false;
  }
  return true;
}

/**
 * Load catalog GLBs into the built room. Missing files are collected, never thrown.
 * No-op in node (no THREE / no loader).
 *
 * @returns {Promise<{ placed:number, missing:string[], props:object[], cams:object[] }>}
 */
export async function dressCatalogFurniture(room, { debris, dust } = {}) {
  const empty = { placed: 0, missing: [], props: [], cams: [] };
  if (!room?.registerFurn || typeof document === 'undefined') return empty;
  const openings = openingsFromRoom(room);
  const placements = catalogPlacements(room.spaces ?? [], openings);
  if (!placements.length) return empty;

  const [{ GLTFLoader }, { FurnProp, furnBox, FURN_HP }, { makeFurnHandlers }, THREE, { fitCatalogProp }] = await Promise.all([
    import('three/examples/jsm/loaders/GLTFLoader.js'),
    import('../destruction/furnprop.js'),
    import('../destruction/furn-fx.js'),
    import('three'),
    import('./furn-fit.js'),
  ]);

  const handlers = makeFurnHandlers({ debris, dust });
  const loader = new GLTFLoader();
  const missing = [];
  const props = [];
  const cams = [];
  let placed = 0;

  for (const slot of placements) {
    const spec = BY_ID.get(slot.catalogId);
    if (!spec) { missing.push(slot.catalogId); continue; }
    const url = catalogUrl(slot.catalogId);
    let gltf;
    try {
      gltf = await loader.loadAsync(url);
    } catch {
      if (!missing.includes(spec.id)) missing.push(spec.id);
      continue;
    }
    const sp = room.spaces.find((s) => s.id === slot.spaceId);
    if (!sp) continue;
    // Wrapper holds world pose; `fitCatalogProp` scales + grounds the inner scene
    // (same fit as the smash lab — targetH / maxSpan are metres, not AABB-only).
    const root = new THREE.Group();
    root.name = slot.id;
    root.add(gltf.scene);
    const dim = fitCatalogProp(gltf.scene, spec);
    root.position.set(slot.x, spec.liftY ?? 0, slot.z);
    root.rotation.y = slot.rotY;
    sp.root.add(root);
    const boxH = spec.thin ? Math.max(dim.h, 0.08) : Math.max(dim.h, spec.targetH ?? 1.2, 1.25);
    const fp = room.registerFurn(new FurnProp({
      id: slot.id,
      spaceId: slot.spaceId,
      box: furnBox(
        slot.x, spec.liftY ?? 0, slot.z,
        Math.max(dim.w, 0.4), boxH, Math.max(dim.d, 0.4),
      ),
      mesh: root,
      kind: spec.kind,
      health: spec.health ?? FURN_HP[spec.kind],
      onBreak: handlers.onBreak,
      onStage: handlers.onStage,
    }));
    if (fp) { props.push(fp); placed++; }
    if (spec.kind === 'camera') {
      cams.push({
        id: slot.id,
        spaceId: slot.spaceId,
        live: false,
        smashed: false,
        mount: spec.id === 'cam-tripod' ? 'tripod' : 'wall',
        x: slot.x,
        y: spec.liftY ?? 0,
        z: slot.z,
      });
    }
  }
  return { placed, missing, props, cams };
}
