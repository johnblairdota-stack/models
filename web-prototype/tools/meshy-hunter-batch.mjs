/**
 * THE HUNTER'S HALF OF THE MESHY PIPELINE — text→3D, then auto-rig, for all three stages.
 *
 * Requires env MESHY_API_KEY. Does not write the key to disk.
 *
 *   node tools/meshy-hunter-batch.mjs                 # preview → refine → rig → download
 *   node tools/meshy-hunter-batch.mjs --preview-only  # stop after the shape, before texturing
 *   node tools/meshy-hunter-batch.mjs --only s2       # one asset (id from the table below)
 *   node tools/meshy-hunter-batch.mjs --no-rig        # bodies only, skip auto-rigging
 *   node tools/meshy-hunter-batch.mjs --animate       # also attach clips (see ACTIONS)
 *   node tools/meshy-hunter-batch.mjs --resume        # continue from the state file
 *
 * ⚠️ EVERY STEP IS RESUMABLE AND NOTHING IS EVER RE-QUEUED. State lives in
 * `assets/raw/meshy_hunter/tasks.json`, keyed by asset id, and each phase is skipped when its
 * id is already recorded. Re-running after a crash costs nothing; re-running after a network
 * blip costs nothing. Meshy bills per task, so a tool that re-queues on restart is a tool that
 * quietly spends money — `tools/meshy-furn-batch.mjs` established this shape and it is copied
 * here deliberately rather than improved on.
 *
 * WHAT COMES OUT, and where it goes:
 *
 *   assets/raw/meshy_hunter/rrr_char_hunter-s1_v1.glb    the raw download, kept
 *   public/models/hunter/rrr_char_hunter-s1_v1.glb       what the game loads
 *
 * `src/characters/mesh-hunter.js` reads exactly those names out of `HUNTER_BODY_FILES` and
 * picks them up the moment they exist — no code change, no flag. Until then it says out loud
 * that it is standing the player's body in. Run `node harness/meshhunter-probe.mjs` afterwards:
 * it fails if a generated body is on disk and the loader did not take it.
 *
 * 🚨 THE PROMPTS BELOW ARE READ OFF THE LOCKED ART, NOT INVENTED HERE.
 * `ART_MANIFEST.md` #05 and #06 are the two hunter sheets and this file's job is to say what
 * they show, in words Meshy can act on. Where the manifest's own table and the art disagree the
 * art wins — that is recorded in the manifest itself, and it is why stage 1 below is described
 * as nearly clean with blue eyes rather than as the sooted red-eyed thing the table asserts.
 *
 * ⚠️ SCALE IS NOT IN THE PROMPT AND MUST NOT BE. `HUNTER_STAGES.scale` is 1.00 at every stage —
 * John's call, and `docs/handoff/mesh-pipeline.md` carries the measurement that settled it: the
 * art's stage-2 head is 58 px against the baseline's 59, i.e. THE SAME HEAD, while the
 * shoulders go 150 → 235. The hunter is not a bigger robot. It is the same robot, wider, with
 * more parts. So the prompts ask for width, mass and grafted limbs, and the loader normalises
 * every body to the contract height regardless of what comes back.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets', 'raw', 'meshy_hunter');
const PUBLIC = path.join(ROOT, 'public', 'models', 'hunter');
const TASKS = path.join(OUT, 'tasks.json');
const API = 'https://api.meshy.ai/openapi/v2/text-to-3d';
const RIG_API = 'https://api.meshy.ai/openapi/v1/rigging';
const ANIM_API = 'https://api.meshy.ai/openapi/v1/animations';

const KEY = process.env.MESHY_API_KEY;
if (!KEY) {
  console.error('Set MESHY_API_KEY. On Windows: set MESHY_API_KEY=... in the same shell.');
  process.exit(1);
}

const argv = process.argv.slice(2);
const has = (f) => argv.includes(`--${f}`);
const opt = (f) => {
  const i = argv.indexOf(`--${f}`);
  return i >= 0 ? argv[i + 1] : null;
};
const previewOnly = has('preview-only');
const noRig = has('no-rig');
const wantAnim = has('animate');
const only = opt('only');

const headers = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

/**
 * The house style, shared by every asset so three separately generated bodies belong to one
 * game. `docs/STYLE_CONTRACT.md` §2 is the palette and §4 the budget; the phrasing here is the
 * furniture batch's, pointed at a character.
 */
const STYLE =
  'stylised game character, clean readable silhouette, T-pose, arms out to the sides, ' +
  'symmetrical, full body including both feet, three-quarter friendly, plain background, ' +
  'flat even lighting, no baked shadows, no base, no pedestal, no weapons, no text';

/**
 * The chassis, in the words every stage shares. This is the sentence that has to make three
 * separate generations read as ONE character at three stages of corruption — and the family
 * resemblance to the PLAYER is the whole horror of the design, so it describes the player's
 * robot first and the damage second.
 */
const CHASSIS =
  'humanoid service robot, smooth white ceramic shell panels over dark chrome mechanical ' +
  'limbs, rounded-cube helmet head with a flush dark visor face, pale mint shoulder caps, ' +
  'segmented fingers, heavy boots';

const ASSETS = [
  {
    id: 's1',
    file: 'rrr_char_hunter-s1_v1.glb',
    poly: 15000,
    rig: true,
    prompt:
      `${STYLE}. ${CHASSIS}. This one is the SAME robot barely touched: upright, player-like ` +
      `proportions, shell almost clean with one faint smudge on the back plate, panel seams ` +
      `just beginning to darken. Nothing is missing and nothing is grafted on.`,
    texture:
      'Near-white ceramic shell, very light dulling at the panel seams, one faint dark smudge ' +
      'on the back, dark chrome limbs, pale mint shoulder caps, dark blue visor face.',
  },
  {
    id: 's2',
    file: 'rrr_char_hunter-s2_v1.glb',
    poly: 15000,
    rig: true,
    /*
     * ⚠️ THE OPEN SOCKET IS ASKED FOR AS A HOLE ABOVE THE SHOULDER, NOT AS A MISSING ARM.
     * `hunter.js` had this backwards and a critic went to the art to settle it: the STAGE 2 row
     * shows BOTH arms present, with a dark round port on the shoulder ABOVE the arm, front and
     * back. A prompt asking for a one-armed robot gets a one-armed robot, and it would be wrong.
     */
    prompt:
      `${STYLE}. ${CHASSIS}. This one is corrupted: hunched gorilla posture with a domed back ` +
      `and the head carried forward and low between wide, heavy shoulders, near-straight legs, ` +
      `mass moved into the shoulders and upper arms, long arms hanging past the knees. Both ` +
      `arms are present, and there is an EMPTY DARK ROUND SOCKET opening in the shell above ` +
      `the right shoulder, like a torn-out port. The back plate is split open along a spine ` +
      `channel. Soot-mottled panels, rust bleeding from the seams, a cracked visor.`,
    texture:
      'Soot-mottled off-white shell, rust bleeding from every panel seam, grimy mint shoulder ' +
      'caps, a cracked dark visor, the open shoulder socket black inside.',
  },
  {
    id: 's3',
    file: 'rrr_char_hunter-s3_v1.glb',
    poly: 15000,
    rig: true,
    /*
     * ⚠️ SIX ARMS AND TWO HEADS ARE ASKED FOR IN THE BODY, and the auto-rig will only bind the
     * two arms it recognises. That is expected and it is why this stage is the one to look at
     * first when it comes back: the extra pairs will ride the animated skeleton as dead weight,
     * which is what a graft IS, but if the rigger cannot find a biped inside this shape at all
     * the stage falls back and `--only s3` re-runs it alone against a reworded prompt.
     */
    prompt:
      `${STYLE}. ${CHASSIS}. This one is the monster: one broad hunched host body with SIX ` +
      `arms — one upper pair swept out and back, one middle pair, one heavier front pair ` +
      `planted forward like front legs — and widened hips over short, deeply bent rear legs. ` +
      `A SECOND SMALLER TORSO AND HEAD rides on its shoulders with its own arms folded up near ` +
      `its chin. Cracked shoulder caps with dark fracture lines, bundles of loose wire spilling ` +
      `from a split in the chest, welded scar plates over the shell.`,
    texture:
      'Filthy grey-brown shell under welded scar plates, cracked mint shoulder caps with dark ' +
      'fracture lines, bright multicoloured wire looms spilling from the chest seam, two dark ' +
      'cracked visors. The smaller riding torso is noticeably cleaner and whiter than its host.',
  },
];

/**
 * OPTIONAL, and off by default. The hunter borrows the player's 38 clips — the two rigs are
 * identical and `mesh-hunter.js` asserts it on every load — so paying for a second clip set buys
 * nothing unless a generated body needs motion the player's set does not carry.
 *
 * ⚠️ `action_id` VALUES ARE MESHY'S OWN AND ARE NOT GUESSED HERE. Fill them from the animation
 * library in the Meshy app (or its API reference) before running with `--animate`; the tool
 * refuses rather than queueing a task against an id nobody has checked.
 */
const ACTIONS = [
  // { name: 'Walking', action_id: null },
  // { name: 'Running', action_id: null },
  // { name: 'Alert',   action_id: null },
  // { name: 'Attack',  action_id: null },
];

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(PUBLIC, { recursive: true });

const loadState = () => {
  if (has('resume') || fs.existsSync(TASKS)) {
    try { return JSON.parse(fs.readFileSync(TASKS, 'utf8')); } catch { /* start fresh */ }
  }
  return { assets: {} };
};
const saveState = (s) => fs.writeFileSync(TASKS, JSON.stringify(s, null, 2));

async function post(url, body) {
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`POST ${url} ${res.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text);
}

async function get(url) {
  const res = await fetch(url, { headers });
  const text = await res.text();
  if (!res.ok) throw new Error(`GET ${url} ${res.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text);
}

async function poll(url, label) {
  for (;;) {
    const task = await get(url);
    const st = task.status;
    process.stdout.write(`\r  ${label} ${st} ${task.progress ?? '?'}%      `);
    if (st === 'SUCCEEDED') { process.stdout.write('\n'); return task; }
    if (st === 'FAILED' || st === 'CANCELED') {
      process.stdout.write('\n');
      throw new Error(`${label} ${st}: ${JSON.stringify(task.task_error ?? task).slice(0, 400)}`);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
}

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return buf.length;
}

/**
 * ⚠️ THE RIGGED FILE IS THE ONE THE GAME LOADS, NOT THE TEXTURED ONE.
 *
 * Auto-rigging returns a NEW glb — the same mesh with a skeleton and skin weights in it — and
 * an unrigged body is useless here: `mesh-hunter.js` throws `carries no SkinnedMesh` on one,
 * which is the correct behaviour and a confusing failure to debug from the other end. So the
 * copy into `public/` happens once, at the end, from whichever file is the most finished thing
 * this run produced.
 */
function publish(slot, asset) {
  const src = path.join(OUT, slot.rigged ? `rigged_${asset.file}` : asset.file);
  if (!fs.existsSync(src)) return null;
  const dest = path.join(PUBLIC, asset.file);
  fs.copyFileSync(src, dest);
  return dest;
}

async function main() {
  const state = loadState();
  const list = only ? ASSETS.filter((a) => a.id === only) : ASSETS;
  if (!list.length) {
    console.error(`--only ${only} matched nothing. Ids: ${ASSETS.map((a) => a.id).join(', ')}`);
    process.exit(2);
  }
  if (wantAnim && !ACTIONS.length) {
    console.error('--animate needs action ids. Fill ACTIONS in this file from Meshy\'s animation ' +
      'library first — this tool will not queue a task against an id nobody has checked.');
    process.exit(2);
  }
  console.log(`Out: ${OUT}\nPublish: ${PUBLIC}`);
  console.log(`Assets: ${list.length} · previewOnly=${previewOnly} · rig=${!noRig} · ` +
    `animate=${wantAnim}`);

  for (const asset of list) {
    const slot = (state.assets[asset.id] ??= { id: asset.id, file: asset.file });
    console.log(`\n=== ${asset.id} ===`);

    if (!slot.previewId) {
      const created = await post(API, {
        mode: 'preview',
        prompt: asset.prompt,
        // `smart-topology` is what the player's body and every shipped prop came out of, and it
        // is the one that returns a mesh with edge loops an auto-rig can bind to.
        model_type: 'smart-topology',
        ai_model: 'meshy-t2',
        target_polycount: asset.poly,
        // Height is normalised at load anyway (`mesh-hunter.js`), but the ORIGIN is not:
        // `STYLE_CONTRACT.md` §1 puts a character's origin between the feet on the ground.
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
      const t = await poll(`${API}/${slot.previewId}`, 'preview');
      slot.previewDone = true;
      slot.previewThumb = t.thumbnail_url ?? null;
      saveState(state);
      if (slot.previewThumb) console.log(`  look at it: ${slot.previewThumb}`);
    }
    if (previewOnly) continue;

    if (!slot.refineId) {
      const created = await post(API, {
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
      const t = await poll(`${API}/${slot.refineId}`, 'refine');
      slot.refineDone = true;
      slot.modelUrl = t.model_urls?.glb ?? null;
      slot.thumb = t.thumbnail_url ?? null;
      saveState(state);
    }

    const raw = path.join(OUT, asset.file);
    if (slot.modelUrl && !fs.existsSync(raw)) {
      console.log(`  wrote ${asset.file} (${await download(slot.modelUrl, raw)} bytes)`);
    }

    if (!noRig && asset.rig) {
      if (!slot.rigId) {
        const created = await post(RIG_API, {
          model_url: slot.modelUrl,
          // The contract's player height. The rigger uses it to place a humanoid skeleton at a
          // sane scale; the loader re-normalises afterwards, so this only has to be close.
          height_meters: 1.7,
        });
        slot.rigId = created.result;
        saveState(state);
        console.log(`  rig queued ${slot.rigId}`);
      }
      if (!slot.rigDone) {
        const t = await poll(`${RIG_API}/${slot.rigId}`, 'rig');
        slot.rigDone = true;
        slot.rigUrl = t.model_urls?.glb ?? t.result?.glb ?? null;
        saveState(state);
      }
      const rigged = path.join(OUT, `rigged_${asset.file}`);
      if (slot.rigUrl && !fs.existsSync(rigged)) {
        console.log(`  wrote rigged_${asset.file} (${await download(slot.rigUrl, rigged)} bytes)`);
      }
      slot.rigged = fs.existsSync(rigged);
      saveState(state);
    }

    if (wantAnim && slot.rigId) {
      slot.anims ??= {};
      for (const act of ACTIONS) {
        if (slot.anims[act.name]?.done) continue;
        const created = await post(ANIM_API, { rig_task_id: slot.rigId, action_id: act.action_id });
        const id = created.result;
        const t = await poll(`${ANIM_API}/${id}`, `anim ${act.name}`);
        const url = t.model_urls?.glb ?? null;
        slot.anims[act.name] = { id, done: true, url };
        saveState(state);
        if (url) {
          const f = `anim_${act.name}_${asset.file}`;
          console.log(`  wrote ${f} (${await download(url, path.join(OUT, f))} bytes)`);
        }
      }
    }

    const dest = publish(slot, asset);
    if (dest) console.log(`  published -> ${path.relative(ROOT, dest)}`);
    else console.log('  nothing to publish yet');
  }

  console.log(`\nDone. State: ${TASKS}`);
  console.log('Next:  node harness/meshhunter-probe.mjs');
  console.log('Then:  node harness/shoot.mjs --view hunter.mesh --review 1280');
}

main().catch((err) => {
  console.error('\nFATAL:', err.message ?? err);
  process.exit(1);
});
