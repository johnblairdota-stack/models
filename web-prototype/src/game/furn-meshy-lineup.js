/**
 * Meshy GLB smash lineup — `?furnline=1`.
 * See `docs/slices/task-meshy-furn-lineup.md`.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FurnProp, furnBox, FURN_HP } from '../destruction/furnprop.js';
import { makeFurnHandlers } from '../destruction/furn-fx.js';

export const MESHY_LINEUP = [
  { id: 'rug-circle', file: 'rrr_prop_rug-circle_v1.glb', kind: 'rug', maxSpan: 6.0, thin: true },
  { id: 'wingback', file: 'rrr_prop_wingback_v1.glb', kind: 'chair', maxSpan: 1.8 },
  { id: 'settee', file: 'rrr_prop_settee_v1.glb', kind: 'chair', maxSpan: 1.8 },
  { id: 'sideboard', file: 'rrr_prop_sideboard_v1.glb', kind: 'desk', maxSpan: 1.8 },
  { id: 'bookcase', file: 'rrr_prop_bookcase_v1.glb', kind: 'desk', maxSpan: 1.8 },
  { id: 'grand-piano', file: 'rrr_prop_grand-piano_v1.glb', kind: 'desk', maxSpan: 1.8, health: 3.2 },
  { id: 'armor', file: 'rrr_prop_armor_v1.glb', kind: 'urn', maxSpan: 1.8, health: 2.0 },
  { id: 'pedestal-bust', file: 'rrr_prop_pedestal-bust_v1.glb', kind: 'urn', maxSpan: 1.8, health: 1.5 },
  { id: 'table-round', file: 'rrr_prop_table-round_v1.glb', kind: 'console', maxSpan: 1.8 },
  { id: 'chaise', file: 'rrr_prop_chaise_v1.glb', kind: 'chair', maxSpan: 1.8 },
  { id: 'gramophone', file: 'rrr_prop_gramophone_v1.glb', kind: 'giltbox', maxSpan: 1.8 },
  { id: 'torchiere', file: 'rrr_prop_torchiere_v1.glb', kind: 'giltbox', maxSpan: 1.8 },
  { id: 'card-table', file: 'rrr_prop_card-table_v1.glb', kind: 'console', maxSpan: 1.8 },
  { id: 'hall-stand', file: 'rrr_prop_hall-stand_v1.glb', kind: 'desk', maxSpan: 1.8 },
  { id: 'vitrine', file: 'rrr_prop_vitrine_v1.glb', kind: 'desk', maxSpan: 1.8 },
  { id: 'ottoman', file: 'rrr_prop_ottoman_v1.glb', kind: 'chair', maxSpan: 1.8 },
];

const SPACING = 2.4;
const HIT_H = 1.25;

function furnlineEnabled() {
  try {
    return new URLSearchParams(location.search).get('furnline') === '1';
  } catch {
    return false;
  }
}

/** Scale + ground the inner scene so wrapper origin is floor centre. */
function normalizeScene(scene, maxSpan) {
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  const size = new THREE.Vector3();
  box.getSize(size);
  const span = Math.max(size.x, size.z, 1e-4);
  const s = Math.min(1, maxSpan / span);
  scene.scale.multiplyScalar(s);
  scene.updateMatrixWorld(true);
  box.setFromObject(scene);
  scene.position.x += -(box.min.x + box.max.x) * 0.5;
  scene.position.z += -(box.min.z + box.max.z) * 0.5;
  scene.position.y += -box.min.y;
  scene.updateMatrixWorld(true);
  box.setFromObject(scene);
  const out = new THREE.Vector3();
  box.getSize(out);
  return { w: out.x, h: out.y, d: out.z };
}

/**
 * Load Meshy lineup into the ballroom as smashable FurnProps.
 * @returns {Promise<{ placed: number, missing: string[], props: object[] }>}
 */
export async function dressMeshyLineup(room, { debris, dust } = {}) {
  if (!furnlineEnabled() || !room?.registerFurn) {
    return { placed: 0, missing: [], props: [] };
  }
  const sp = room.spaces.find((s) => s.id === 'ballroom')
    || room.spaces.find((s) => s.order === 'ballroom');
  if (!sp) return { placed: 0, missing: ['ballroom'], props: [] };

  const handlers = makeFurnHandlers({ debris, dust });
  const { onBreak, onStage } = handlers;
  const loader = new GLTFLoader();
  const anchor = room.anchor?.('ballroom.centre') ?? { x: sp.cx, z: sp.cz };
  const startX = (anchor.x ?? sp.cx) - 2;
  const rowZ = (anchor.z ?? sp.cz) + 4;

  const missing = [];
  const props = [];
  let placed = 0;

  for (let i = 0; i < MESHY_LINEUP.length; i++) {
    const spec = MESHY_LINEUP[i];
    const url = `/models/furn/${spec.file}`;
    let gltf;
    try {
      gltf = await loader.loadAsync(url);
    } catch (err) {
      missing.push(spec.id);
      console.warn(`[furnline] missing ${url}`, err?.message || err);
      continue;
    }
    const root = new THREE.Group();
    root.name = `lineup.${spec.id}`;
    root.add(gltf.scene);
    const dim = normalizeScene(gltf.scene, spec.maxSpan ?? 1.8);
    const cx = startX + i * SPACING;
    const cz = rowZ;
    root.position.set(cx, 0, cz);
    sp.root.add(root);

    const boxH = spec.thin ? 0.08 : Math.max(dim.h, HIT_H);
    const box = furnBox(cx, 0, cz, Math.max(dim.w, 0.4), boxH, Math.max(dim.d, 0.4));
    const fp = room.registerFurn(new FurnProp({
      id: `lineup.${spec.id}`,
      spaceId: sp.id,
      box,
      mesh: root,
      kind: spec.kind,
      health: spec.health ?? FURN_HP[spec.kind] ?? 1.2,
      onBreak,
      onStage,
    }));
    if (fp) {
      props.push(fp);
      placed++;
    }
  }

  return { placed, missing, props };
}

export function armFurnLineDemo(engine, room, player, cam) {
  if (engine.capture) return false;
  if (!furnlineEnabled()) return false;
  const at = room.anchor?.('ballroom.centre');
  if (!at) return false;
  player.pos.copy(at);
  player.pos.z += 1.2;
  player.pos.x -= 2;
  player.vel.set(0, 0, 0);
  room.collide?.(player.pos, 0.42);
  // Face +Z toward the row.
  player.facing = 0;
  player.aimYaw = 0;
  player.aimPitch = -0.06;
  cam.yaw = 0;
  player.sledge.owned = true;
  player.sledge.equip();
  engine.__furnLine = true;
  return true;
}
