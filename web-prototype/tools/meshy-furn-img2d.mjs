/**
 * Meshy Image→3D for the 16 new mansion concepts in assets/concept/furn/.
 * Requires MESHY_API_KEY. Does not write the key to disk.
 *
 *   node tools/meshy-furn-img2d.mjs
 *   node tools/meshy-furn-img2d.mjs --resume
 *   node tools/meshy-furn-img2d.mjs --only=rug-circle,wingback
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONCEPT = path.join(ROOT, 'assets', 'concept', 'furn');
const OUT = path.join(ROOT, 'assets', 'raw', 'meshy_furn');
const PUBLIC = path.join(ROOT, 'public', 'models', 'furn');
const TASKS = path.join(OUT, 'img2d-tasks.json');
const API = 'https://api.meshy.ai/openapi/v1/image-to-3d';

const KEY = process.env.MESHY_API_KEY;
if (!KEY) {
  console.error('Set MESHY_API_KEY');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
};

/** Original 8 concept smash-set, then the 16 later pieces. */
const ASSETS = [
  { id: 'chair', concept: 'rrr_prop_chair_v1_concept.png', file: 'rrr_prop_chair_v1.glb', poly: 8000 },
  { id: 'desk', concept: 'rrr_prop_desk_v1_concept.png', file: 'rrr_prop_desk_v1.glb', poly: 10000 },
  { id: 'console', concept: 'rrr_prop_console_v1_concept.png', file: 'rrr_prop_console_v1.glb', poly: 8000 },
  { id: 'crate', concept: 'rrr_prop_crate_v1_concept.png', file: 'rrr_prop_crate_v1.glb', poly: 4000 },
  { id: 'cam-wall', concept: 'rrr_prop_cam-wall_v1_concept.png', file: 'rrr_prop_cam-wall_v1.glb', poly: 4000 },
  { id: 'cam-tripod', concept: 'rrr_prop_cam-tripod_v1_concept.png', file: 'rrr_prop_cam-tripod_v1.glb', poly: 6000 },
  { id: 'fireplace', concept: 'rrr_prop_fireplace_v1_concept.png', file: 'rrr_prop_fireplace_v1.glb', poly: 12000 },
  { id: 'chandelier', concept: 'rrr_prop_chandelier_v1_concept.png', file: 'rrr_prop_chandelier_v1.glb', poly: 15000 },
  { id: 'rug-circle', concept: 'rrr_prop_rug-circle_v1_concept.png', file: 'rrr_prop_rug-circle_v1.glb', poly: 4000 },
  { id: 'wingback', concept: 'rrr_prop_wingback_v1_concept.png', file: 'rrr_prop_wingback_v1.glb', poly: 8000 },
  { id: 'settee', concept: 'rrr_prop_settee_v1_concept.png', file: 'rrr_prop_settee_v1.glb', poly: 8000 },
  { id: 'sideboard', concept: 'rrr_prop_sideboard_v1_concept.png', file: 'rrr_prop_sideboard_v1.glb', poly: 10000 },
  { id: 'bookcase', concept: 'rrr_prop_bookcase_v1_concept.png', file: 'rrr_prop_bookcase_v1.glb', poly: 10000 },
  { id: 'grand-piano', concept: 'rrr_prop_grand-piano_v1_concept.png', file: 'rrr_prop_grand-piano_v1.glb', poly: 12000 },
  { id: 'armor', concept: 'rrr_prop_armor_v1_concept.png', file: 'rrr_prop_armor_v1.glb', poly: 10000 },
  { id: 'pedestal-bust', concept: 'rrr_prop_pedestal-bust_v1_concept.png', file: 'rrr_prop_pedestal-bust_v1.glb', poly: 8000 },
  { id: 'table-round', concept: 'rrr_prop_table-round_v1_concept.png', file: 'rrr_prop_table-round_v1.glb', poly: 6000 },
  { id: 'chaise', concept: 'rrr_prop_chaise_v1_concept.png', file: 'rrr_prop_chaise_v1.glb', poly: 8000 },
  { id: 'gramophone', concept: 'rrr_prop_gramophone_v1_concept.png', file: 'rrr_prop_gramophone_v1.glb', poly: 8000 },
  { id: 'torchiere', concept: 'rrr_prop_torchiere_v1_concept.png', file: 'rrr_prop_torchiere_v1.glb', poly: 4000 },
  { id: 'card-table', concept: 'rrr_prop_card-table_v1_concept.png', file: 'rrr_prop_card-table_v1.glb', poly: 6000 },
  { id: 'hall-stand', concept: 'rrr_prop_hall-stand_v1_concept.png', file: 'rrr_prop_hall-stand_v1.glb', poly: 8000 },
  { id: 'vitrine', concept: 'rrr_prop_vitrine_v1_concept.png', file: 'rrr_prop_vitrine_v1.glb', poly: 10000 },
  { id: 'ottoman', concept: 'rrr_prop_ottoman_v1_concept.png', file: 'rrr_prop_ottoman_v1.glb', poly: 4000 },
];

const resume = process.argv.includes('--resume');
const onlyArg = process.argv.find((a) => a.startsWith('--only='))?.slice(7)
  || (process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null);
const only = onlyArg ? new Set(onlyArg.split(',').map((s) => s.trim()).filter(Boolean)) : null;

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(PUBLIC, { recursive: true });

function loadState() {
  if (fs.existsSync(TASKS)) return JSON.parse(fs.readFileSync(TASKS, 'utf8'));
  return { assets: {} };
}

function saveState(state) {
  fs.writeFileSync(TASKS, JSON.stringify(state, null, 2));
}

function dataUri(pngPath) {
  const buf = fs.readFileSync(pngPath);
  return `data:image/png;base64,${buf.toString('base64')}`;
}

async function post(body) {
  const res = await fetch(API, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`POST ${res.status}: ${text.slice(0, 600)}`);
  return JSON.parse(text);
}

async function get(id) {
  const res = await fetch(`${API}/${id}`, { headers });
  const text = await res.text();
  if (!res.ok) throw new Error(`GET ${id} ${res.status}: ${text.slice(0, 600)}`);
  return JSON.parse(text);
}

async function poll(id) {
  for (;;) {
    const task = await get(id);
    const st = task.status;
    process.stdout.write(`\r  ${id.slice(0, 8)}… ${st} ${task.progress ?? '?'}%   `);
    if (st === 'SUCCEEDED') {
      process.stdout.write('\n');
      return task;
    }
    if (st === 'FAILED' || st === 'CANCELED') {
      process.stdout.write('\n');
      throw new Error(`${id} ${st}: ${JSON.stringify(task.task_error || task)}`);
    }
    await new Promise((r) => setTimeout(r, 8000));
  }
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return buf.length;
}

async function main() {
  const state = loadState();
  const list = ASSETS.filter((a) => !only || only.has(a.id));
  console.log(`Out: ${OUT}`);
  console.log(`Public: ${PUBLIC}`);
  console.log(`Jobs: ${list.length} · resume=${resume}`);

  for (const asset of list) {
    const conceptPath = path.join(CONCEPT, asset.concept);
    if (!fs.existsSync(conceptPath)) {
      throw new Error(`missing concept ${conceptPath}`);
    }
    const slot = (state.assets[asset.id] ??= { id: asset.id, file: asset.file });
    console.log(`\n=== ${asset.id} ===`);

    if (!slot.taskId) {
      const created = await post({
        image_url: dataUri(conceptPath),
        model_type: 'smart-topology',
        ai_model: 'meshy-t2',
        target_polycount: asset.poly,
        should_texture: true,
        enable_pbr: true,
        texture_resolution: '2k',
        auto_size: true,
        origin_at: 'bottom',
        target_formats: ['glb'],
        moderation: true,
      });
      slot.taskId = created.result;
      saveState(state);
      console.log(`  queued ${slot.taskId}`);
    }

    if (!slot.done) {
      const task = await poll(slot.taskId);
      slot.done = true;
      slot.modelUrl = task.model_urls?.glb || null;
      slot.thumb = task.thumbnail_url || null;
      saveState(state);
    }

    const rawDest = path.join(OUT, asset.file);
    const pubDest = path.join(PUBLIC, asset.file);
    if (slot.modelUrl && (!fs.existsSync(rawDest) || !slot.downloaded)) {
      const n = await download(slot.modelUrl, rawDest);
      fs.copyFileSync(rawDest, pubDest);
      slot.downloaded = true;
      slot.bytes = n;
      saveState(state);
      console.log(`  wrote ${asset.file} (${n} bytes) + public copy`);
    } else if (fs.existsSync(rawDest)) {
      if (!fs.existsSync(pubDest)) fs.copyFileSync(rawDest, pubDest);
      console.log(`  already have ${asset.file}`);
    }
  }

  console.log('\nAll done.');
}

main().catch((err) => {
  console.error('\nFATAL:', err.message || err);
  process.exit(1);
});
