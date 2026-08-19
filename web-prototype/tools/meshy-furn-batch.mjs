/**
 * Batch Text→3D for smashable mansion furniture via Meshy.
 *
 * Requires env MESHY_API_KEY. Does not write the key to disk.
 *
 * Usage:
 *   node tools/meshy-furn-batch.mjs              # preview → refine → download all
 *   node tools/meshy-furn-batch.mjs --preview-only
 *   node tools/meshy-furn-batch.mjs --resume      # continue from assets/raw/meshy_furn/tasks.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets', 'raw', 'meshy_furn');
const TASKS = path.join(OUT, 'tasks.json');
const API = 'https://api.meshy.ai/openapi/v2/text-to-3d';

const KEY = process.env.MESHY_API_KEY;
if (!KEY) {
  console.error('Set MESHY_API_KEY');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
};

/** Style shared by every prop — period mansion, not modern / plastic. */
const STYLE =
  'Victorian mansion period furniture, dark walnut wood, subtle gilt accents, ' +
  'game-ready prop, clean silhouette, three-quarter view friendly, no people, ' +
  'no modern plastic, no IKEA, single object on ground plane';

/**
 * Background prop budget ~4k; hero props higher (contract ≤15k).
 * smart-topology meshy-t2: target_polycount 100–15000.
 */
const ASSETS = [
  {
    id: 'chair',
    file: 'rrr_prop_chair_v1.glb',
    poly: 8000,
    prompt:
      `${STYLE}. Ornate ballroom side chair: cabriole front legs, sabre rear legs, ` +
      `pierced splat back, cresting rail, upholstered seat, height about 1.05 m.`,
    texture:
      'Dark polished walnut, gold leaf trim on legs and crest, dusty cream velvet seat.',
  },
  {
    id: 'desk',
    file: 'rrr_prop_desk_v1.glb',
    poly: 10000,
    prompt:
      `${STYLE}. Heavy study writing desk with drawers, leather inset top, turned legs, ` +
      `width about 1.6 m, height about 0.78 m.`,
    texture:
      'Dark walnut carcass, worn green leather writing surface, brass drawer pulls.',
  },
  {
    id: 'console',
    file: 'rrr_prop_console_v1.glb',
    poly: 8000,
    prompt:
      `${STYLE}. Narrow wall console table with marble-look top slab, gilt apron, ` +
      `cabriole legs, width about 1.4 m.`,
    texture:
      'Walnut base with gilt carved apron, pale marble top, aged mansion look.',
  },
  {
    id: 'crate',
    file: 'rrr_prop_crate_v1.glb',
    poly: 4000,
    prompt:
      `${STYLE}. Wooden shipping crate with cross battens, rough timber, about 0.8 m cube.`,
    texture: 'Raw weathered pine boards, iron nails, dust and scuffs.',
  },
  {
    id: 'cam-wall',
    file: 'rrr_prop_cam-wall_v1.glb',
    poly: 4000,
    prompt:
      `${STYLE}. Small wall-mounted CCTV security camera with short bracket arm, ` +
      `boxy camera head, matte black metal, about 0.25 m long.`,
    texture: 'Matte black metal housing, dark lens glass, subtle wear.',
  },
  {
    id: 'cam-tripod',
    file: 'rrr_prop_cam-tripod_v1.glb',
    poly: 6000,
    prompt:
      `${STYLE}. Floor tripod with three splayed legs and a boxy video camera on top, ` +
      `total height about 1.4 m, readable fallen-camera silhouette.`,
    texture: 'Black metal tripod legs, dark grey camera body, glass lens.',
  },
  {
    id: 'fireplace',
    file: 'rrr_prop_fireplace_v1.glb',
    poly: 12000,
    prompt:
      `${STYLE}. Ornate study chimneypiece and mantel with carved surround, ` +
      `firebox opening, width about 2.0 m, height about 1.8 m.`,
    texture:
      'Carved dark wood mantel, pale stone surround, soot in the firebox.',
  },
  {
    id: 'chandelier',
    file: 'rrr_prop_chandelier_v1.glb',
    poly: 15000,
    prompt:
      `${STYLE}. Hanging ballroom chandelier with brass arms, candle cups or bulbs, ` +
      `crystal drops, diameter about 1.2 m, hanging from a short chain.`,
    texture:
      'Aged brass arms, cloudy crystal drops, warm metal, dusty mansion chandelier.',
  },
];

const previewOnly = process.argv.includes('--preview-only');
const resume = process.argv.includes('--resume');

fs.mkdirSync(OUT, { recursive: true });

function loadState() {
  if (resume && fs.existsSync(TASKS)) {
    return JSON.parse(fs.readFileSync(TASKS, 'utf8'));
  }
  return { assets: {} };
}

function saveState(state) {
  fs.writeFileSync(TASKS, JSON.stringify(state, null, 2));
}

async function post(body) {
  const res = await fetch(API, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`POST ${res.status}: ${text.slice(0, 500)}`);
  }
  return data;
}

async function get(id) {
  const res = await fetch(`${API}/${id}`, { headers });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`GET ${id} ${res.status}: ${text.slice(0, 500)}`);
  }
  return data;
}

async function poll(id, label) {
  for (;;) {
    const task = await get(id);
    const st = task.status;
    const prog = task.progress ?? '?';
    process.stdout.write(`\r  ${label} ${id.slice(0, 8)}… ${st} ${prog}%   `);
    if (st === 'SUCCEEDED') {
      process.stdout.write('\n');
      return task;
    }
    if (st === 'FAILED' || st === 'CANCELED') {
      process.stdout.write('\n');
      throw new Error(`${label} ${id} ${st}: ${JSON.stringify(task.task_error || task)}`);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
}

async function downloadGlb(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return buf.length;
}

async function main() {
  const state = loadState();
  console.log(`Out: ${OUT}`);
  console.log(`Assets: ${ASSETS.length} · previewOnly=${previewOnly} · resume=${resume}`);

  for (const asset of ASSETS) {
    const slot = (state.assets[asset.id] ??= { id: asset.id, file: asset.file });
    console.log(`\n=== ${asset.id} ===`);

    if (!slot.previewId) {
      const created = await post({
        mode: 'preview',
        prompt: asset.prompt,
        model_type: 'smart-topology',
        ai_model: 'meshy-t2',
        target_polycount: asset.poly,
        auto_size: true,
        origin_at: 'bottom',
        target_formats: ['glb'],
        moderation: true,
      });
      slot.previewId = created.result;
      saveState(state);
      console.log(`  preview queued ${slot.previewId}`);
    }

    if (!slot.previewDone) {
      const preview = await poll(slot.previewId, 'preview');
      slot.previewDone = true;
      slot.previewThumb = preview.thumbnail_url || null;
      saveState(state);
    }

    if (previewOnly) continue;

    if (!slot.refineId) {
      const created = await post({
        mode: 'refine',
        preview_task_id: slot.previewId,
        enable_pbr: true,
        texture_resolution: '2k',
        texture_prompt: asset.texture,
        target_formats: ['glb'],
        moderation: true,
      });
      slot.refineId = created.result;
      saveState(state);
      console.log(`  refine queued ${slot.refineId}`);
    }

    if (!slot.refineDone) {
      const refined = await poll(slot.refineId, 'refine');
      slot.refineDone = true;
      slot.modelUrl = refined.model_urls?.glb || null;
      slot.thumb = refined.thumbnail_url || null;
      saveState(state);
    }

    const dest = path.join(OUT, asset.file);
    if (slot.modelUrl && (!fs.existsSync(dest) || !slot.downloaded)) {
      const n = await downloadGlb(slot.modelUrl, dest);
      slot.downloaded = true;
      slot.bytes = n;
      saveState(state);
      console.log(`  wrote ${asset.file} (${n} bytes)`);
    } else if (fs.existsSync(dest)) {
      console.log(`  already have ${asset.file}`);
    }
  }

  console.log('\nDone. State:', TASKS);
}

main().catch((err) => {
  console.error('\nFATAL:', err.message || err);
  process.exit(1);
});
