#!/usr/bin/env node
/**
 * The shared scoreboard. Builder and critic agents both write here; the progress page
 * reads it. One JSON file, written atomically, because a dozen agents touch it.
 *
 *   node harness/status.mjs init
 *   node harness/status.mjs get <id>
 *   node harness/status.mjs list
 *   node harness/status.mjs set <id> --round 3 --score 72 --verdict REJECT \
 *        --hates "veins read as zebra stripes" --hates "grout has no depth" \
 *        --wins "slab-to-slab variation is convincing" --owner critic-marble
 *   node harness/status.mjs blind <id> --guess "lath" --correct true
 *   node harness/status.mjs note "free text for the log"
 *
 * verdict is one of:  NOT_BUILT | BUILDING | REJECT | WEAK | PASS | WOWED
 * Only WOWED closes a piece, and only a critic may set it.
 */

import { readFile, writeFile, rename, mkdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'progress/status.json');
const LOCK = FILE + '.lock';

const VERDICTS = ['NOT_BUILT', 'BUILDING', 'REJECT', 'WEAK', 'PASS', 'WOWED'];
const VERDICT_PCT = { NOT_BUILT: 0, BUILDING: 12, REJECT: 30, WEAK: 58, PASS: 82, WOWED: 100 };

const argv = process.argv.slice(2);
const cmd = argv[0];

function opt(name, def = null) {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[i + 1] : def;
}
function optAll(name) {
  const out = [];
  for (let i = 0; i < argv.length; i++) if (argv[i] === '--' + name && argv[i + 1] !== undefined) out.push(argv[i + 1]);
  return out;
}

async function viewRegistry() {
  const src = await readFile(path.join(ROOT, 'src/views.js'), 'utf8');
  const out = [];
  const re = /\{\s*id:\s*'([^']+)',\s*group:\s*'([^']+)',\s*title:\s*'([^']*)',\s*bar:\s*'([^']*)'/g;
  let m;
  while ((m = re.exec(src))) out.push({ id: m[1], group: m[2], title: m[3], bar: m[4] });
  return out;
}

async function load() {
  if (!existsSync(FILE)) return null;
  for (let i = 0; i < 30; i++) {
    try { return JSON.parse(await readFile(FILE, 'utf8')); }
    catch { await new Promise((r) => setTimeout(r, 60)); }
  }
  throw new Error('could not read status.json');
}

async function save(data) {
  await mkdir(path.dirname(FILE), { recursive: true });
  data.updatedAt = new Date().toISOString();
  const body = JSON.stringify(data, null, 2);
  // crude but effective cross-process guard: write to a unique temp then rename
  const tmp = FILE + '.' + process.pid + '.tmp';
  await writeFile(tmp, body);
  for (let i = 0; i < 20; i++) {
    try { await rename(tmp, FILE); return; }
    catch { await new Promise((r) => setTimeout(r, 50)); }
  }

  // ⚠️ THE RETRY LOOP ABOVE TREATED A PERMANENT FAILURE AS A TRANSIENT ONE, AND THE BOARD
  // SILENTLY STOPPED ACCEPTING WRITES FOR HOURS BECAUSE OF IT.
  //
  // On Windows, renaming ONTO an existing file fails with EPERM if any process holds that file
  // open without FILE_SHARE_DELETE — an editor, an indexer, an antivirus scan, another agent
  // mid-read. That is not a race that clears in 2 seconds; it stays until the handle closes, so
  // 40 retries fail exactly as fast as 1 does and then throw. Reproduced by the lead: renaming
  // the temp to any OTHER name succeeded, `openSync(r+)` on the target succeeded, and only the
  // replace-rename failed — which is the precise signature of a held handle, not a permissions
  // problem. Measured cost: `progress/status.json` went unwritten from 10:21 onward while agents
  // believed they were filing verdicts, and one round's grapple entry was lost outright.
  //
  // In-place write is the fallback because it is the operation that still works. It gives up
  // atomicity, which is survivable HERE and nowhere else: `load()` already retries a failed
  // parse 40 times at 60 ms, so a reader that catches a torn file simply reads it again.
  await writeFile(FILE, body);
  await unlink(tmp).catch(() => {});
}

async function init(force = false) {
  const reg = await viewRegistry();
  let data = force ? null : await load();
  data ??= { startedAt: new Date().toISOString(), round: 0, log: [], pieces: {} };
  data.pieces ??= {};
  for (const v of reg) {
    data.pieces[v.id] ??= {
      id: v.id, group: v.group, title: v.title, bar: v.bar,
      verdict: 'NOT_BUILT', score: 0, round: 0,
      hates: [], wins: [], blind: null, perf: null,
      owner: null, shot: `shots/${v.id}.png`, updatedAt: null,
    };
    // keep registry metadata fresh
    Object.assign(data.pieces[v.id], { group: v.group, title: v.title, bar: v.bar });
  }
  // drop pieces no longer in the registry
  for (const k of Object.keys(data.pieces)) if (!reg.find((v) => v.id === k)) delete data.pieces[k];
  await save(data);
  return data;
}

function pct(p) {
  if (p.score) return Math.max(0, Math.min(100, +p.score));
  return VERDICT_PCT[p.verdict] ?? 0;
}

switch (cmd) {
  case 'init': {
    const d = await init(argv.includes('--force'));
    console.log(`status.json ready — ${Object.keys(d.pieces).length} pieces`);
    break;
  }

  case 'set': {
    const id = argv[1];
    const data = (await load()) ?? (await init());
    const p = data.pieces[id];
    if (!p) { console.error(`unknown piece "${id}". run: node harness/status.mjs list`); process.exit(2); }

    const verdict = opt('verdict');
    if (verdict) {
      if (!VERDICTS.includes(verdict)) { console.error(`verdict must be one of ${VERDICTS.join('|')}`); process.exit(2); }
      p.verdict = verdict;
    }
    if (opt('round') !== null) p.round = +opt('round');
    if (opt('score') !== null) p.score = +opt('score');
    if (opt('owner')) p.owner = opt('owner');
    if (opt('shot')) p.shot = opt('shot');
    if (opt('summary')) p.summary = opt('summary');

    // clear first, so `--clear-hates --hates "x"` means "replace the list with x"
    if (argv.includes('--clear-hates')) p.hates = [];
    const hates = optAll('hates');
    if (hates.length) p.hates = hates;
    const wins = optAll('wins');
    if (wins.length) p.wins = wins;

    if (opt('perf')) { try { p.perf = JSON.parse(await readFile(opt('perf'), 'utf8')); } catch (e) { console.error('perf read failed:', e.message); } }

    p.updatedAt = new Date().toISOString();
    p.history ??= [];
    p.history.push({ at: p.updatedAt, round: p.round, verdict: p.verdict, score: p.score, hates: p.hates.length });
    if (p.history.length > 40) p.history = p.history.slice(-40);

    data.round = Math.max(data.round ?? 0, p.round ?? 0);
    data.log ??= [];
    data.log.unshift({ at: p.updatedAt, id, verdict: p.verdict, score: p.score, round: p.round, by: p.owner ?? null });
    if (data.log.length > 250) data.log.length = 250;
    await save(data);
    console.log(`${id}  r${p.round}  ${p.verdict}  ${pct(p)}%  (${p.hates.length} open complaints)`);
    break;
  }

  case 'blind': {
    const id = argv[1];
    const data = await load();
    const p = data.pieces[id];
    if (!p) { console.error('unknown piece'); process.exit(2); }
    p.blind = {
      guess: opt('guess'),
      correct: opt('correct') === 'true',
      at: new Date().toISOString(),
      by: opt('owner') ?? null,
    };
    p.updatedAt = p.blind.at;
    await save(data);
    console.log(`${id} blind test: guessed "${p.blind.guess}" — ${p.blind.correct ? 'CORRECT' : 'WRONG'}`);
    break;
  }

  case 'note': {
    const data = await load();
    data.log ??= [];
    data.log.unshift({ at: new Date().toISOString(), note: argv.slice(1).join(' ') });
    await save(data);
    console.log('noted');
    break;
  }

  case 'get': {
    const data = await load();
    const p = data?.pieces?.[argv[1]];
    if (!p) { console.error('unknown piece'); process.exit(2); }
    console.log(JSON.stringify(p, null, 2));
    break;
  }

  case 'list': {
    const data = (await load()) ?? (await init());
    const ps = Object.values(data.pieces);
    const byGroup = {};
    for (const p of ps) (byGroup[p.group] ??= []).push(p);
    for (const [g, arr] of Object.entries(byGroup)) {
      console.log(`\n${g.toUpperCase()}`);
      for (const p of arr) {
        const bar = '█'.repeat(Math.round(pct(p) / 5)).padEnd(20, '·');
        console.log(`  ${p.id.padEnd(18)} ${bar} ${String(pct(p)).padStart(3)}%  r${String(p.round).padStart(2)} ${p.verdict.padEnd(9)}` +
          (p.hates?.length ? ` ${p.hates.length} open` : ''));
      }
    }
    const done = ps.filter((p) => p.verdict === 'WOWED').length;
    console.log(`\n${done}/${ps.length} WOWED · round ${data.round}`);
    break;
  }

  case 'summary': {
    const data = await load();
    const ps = Object.values(data.pieces);
    console.log(JSON.stringify({
      round: data.round,
      total: ps.length,
      wowed: ps.filter((p) => p.verdict === 'WOWED').length,
      pass: ps.filter((p) => p.verdict === 'PASS').length,
      open: ps.filter((p) => !['WOWED'].includes(p.verdict)).map((p) => p.id),
    }, null, 2));
    break;
  }

  default:
    console.log(`usage:
  node harness/status.mjs init [--force]
  node harness/status.mjs list
  node harness/status.mjs get <id>
  node harness/status.mjs summary
  node harness/status.mjs set <id> [--round N] [--score 0-100] [--verdict ${VERDICTS.join('|')}]
                                   [--hates "..."]... [--wins "..."]... [--clear-hates]
                                   [--owner name] [--summary "..."] [--perf path.json]
  node harness/status.mjs blind <id> --guess "..." --correct true|false
  node harness/status.mjs note "..."`);
    process.exit(cmd ? 2 : 0);
}
