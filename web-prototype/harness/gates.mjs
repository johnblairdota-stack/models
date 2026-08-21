#!/usr/bin/env node
/**
 * 🚦 **gates — EVERY GATE RUNS, EVERY RUN, AND THE SUITE PRINTS ONE NUMBER.**
 *
 *   node harness/gates.mjs                 all of them, four at a time
 *   node harness/gates.mjs shot-solver     one, by name
 *   node harness/gates.mjs --only show-wire --slow
 *   node harness/gates.mjs --serial        one at a time, for debugging
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 WHY THIS FILE EXISTS: A RED GATE USED TO BLACK OUT EVERY GATE BEHIND IT
 * ---------------------------------------------------------------------------------------------
 * `gates:party` was `node a && node b && …` over 31 files. `&&` stops at the first non-zero exit,
 * so the tail a reviewer reads — a confident `N passed, 1 failed` — was the tail of a suite that
 * had **stopped**, with no line anywhere saying how much never ran. Caught live three times in one
 * night: at chain position 27 it hid 54 assertions; at position 14 it would have hidden **601 of
 * 841 — 71% of the suite**; and once a single red assertion on a half-saved file stopped ten gates
 * dead. **Twice that put a wrong number into a review.** The size of the lie was a function of
 * where in an arbitrary ordering the failure happened to land, which is not a property anybody
 * chose.
 *
 * So: **spawn every gate, collect every exit code, exit 1 at the end if any failed.** Nothing here
 * short-circuits, ever. A red gate costs you its own output and nothing else.
 *
 * ---------------------------------------------------------------------------------------------
 * ⚠️ THE LIST IS HERE, ONCE, AND THE FILESYSTEM AUDITS IT
 * ---------------------------------------------------------------------------------------------
 * The old list was maintained twice — once as files in `harness/`, once as a chain in
 * `package.json` — and two gates landed one night as files with no chain entry and sat unrun
 * until somebody happened to notice. `GATES` below is the only list. `auditManifest()` walks
 * `harness/` and fails the run if a gate-shaped file is missing from it, because that defect is
 * exactly the one no human is reliably going to catch by reading.
 *
 * **Gate-shaped** is narrow on purpose: a **tracked**, top-level `.mjs` in `harness/`, not `_`- or
 * `.`-prefixed, whose source emits its own basename in the summary line every gate prints.
 * `harness/` also holds ~450 `_`-prefixed probes and a `scenarios/` tree, and tools like
 * `test-net.mjs` and `phone-hands.mjs` print `N passed, M failed` *without* a name in front — they
 * are instruments, not suite members. Naming yourself in your summary line is the opt-in.
 *
 * **Tracked** matters, and it is not a loophole. Several agents build in this tree at once, and an
 * uncommitted gate is somebody's open file — the other builders' own rule is that a gate joins the
 * runner when it has been watched to pass, not when it exists. The defect this audit exists for
 * was gates that *landed*, as commits, with no runner entry, and those are caught the moment they
 * are staged. If `git` cannot answer, every file counts, because failing loud beats failing open.
 *
 * ⚠️ **DO NOT REORDER `GATES` BY SPEED.** The order is dependency-of-understanding order: the
 * gates whose red should block a merge outright come first (`party-isolation` — a phone receiving
 * another player's role is a product-ending bug), and a reader working down the list meets the
 * cast table before the wire that carries it. Sorting by duration would save nothing — the pool
 * already fills — and would destroy the only thing the ordering says.
 *
 * ⚠️ **THIS FILE IS A LAUNCHER AND A TALLY. NO ASSERTION MAY EVER MOVE INTO IT.** The suite is
 * worth something because 27% of its lines are controls that must fail and 14% are arms that
 * refuse a vacuous green, and because each one sits next to the header that argues for it. The
 * moment a control's semantics live here instead of in the gate file that makes the case for it,
 * that property is gone and this becomes an ordinary test runner.
 *
 * ---------------------------------------------------------------------------------------------
 * PARALLELISM, AND THE BROWSER HAZARD IT COULD HAVE MADE WORSE
 * ---------------------------------------------------------------------------------------------
 * The gates are independent processes. Three of them are half the clock — `party-sim` 29.6 s,
 * `hunter-draw` 23.4 s, `shot-solver` 17.2 s — so a four-wide pool takes the suite from ~146 s to
 * ~44 s measured. Every server-spawning gate already binds a distinct hardcoded port
 * (`show-wire` 5195 · `join-spike` 5196 · `party-sockets` 5197 · `expedition-wire` 5243 ·
 * `shot-solver` 5188/5241/5242/5244) and **`shot-solver` is the only member that launches
 * Chromium** (CDP 9377 and 9378, sequentially, under a pid-scoped profile), so no two pool slots
 * can ever want the same port. Check that before adding a gate that binds anything.
 *
 * 🚨 **A KILLED GATE MUST NOT LEAVE A BROWSER ALIVE.** A run interrupted mid-flight used to leave
 * Chromium holding its CDP port; the *next* run then lost the bind while `/json/list` answered
 * cheerfully from the stale browser, and the failure looked like a bug in the gate. That cost one
 * agent twenty minutes today and `shot-solver`'s header records it costing a previous round.
 * Gates defend themselves with a per-run nonce; this runner's job is not to make it worse. Every
 * child is spawned `detached` into its own process group and killed with `process.kill(-pid)`, so
 * a timeout or a Ctrl-C takes the gate's grandchildren — the browser, the stub server — with it.
 *
 * Red gates print in full. Green gates print one line and their timing, because 31 green
 * transcripts is how the useful one gets missed. `--slow` prints the timing table.
 */

import { execFileSync, spawn } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * THE LIST. One array, one place. Dependency-of-understanding order — see the header before you
 * are tempted to sort it. Adding a gate file without adding it here fails the run.
 */
const GATES = [
  'role-deal', 'party-anon', 'party-isolation', 'party-taken', 'guide-coverage', 'party-log',
  'party-sockets', 'vote-table', 'cast-ballot', 'win-machine', 'round-loop', 'dark-run',
  'director-cut', 'task-deck', 'role-script', 'reunion-truth', 'party-noise', 'party-sim',
  'join-spike', 'live-session', 'show-wire', 'shot-solver', 'expedition-wire', 'premiere-stage',
  'hunter-draw', 'engine-take', 'wire-parity', 'door-hop', 'wing-draw', 'drivable-frame',
  'dead-import',
];

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
/** The line every gate ends on. Verified present in all 31. */
const SUMMARY = /^(\S+): (\d+) passed, (\d+) failed(?:, (\d+) skipped)?/;
const WIDTH = Math.max(...GATES.map((g) => g.length));
const POOL = Math.max(1, Number(process.env.RRR_GATE_POOL || 4));
const TIMEOUT = Math.max(1, Number(process.env.RRR_GATE_TIMEOUT || 420)) * 1000;

// ------------------------------------------------------------------ arguments
const argv = process.argv.slice(2);
const serial = argv.includes('--serial');
const slow = argv.includes('--slow');
const onlyAt = argv.indexOf('--only');
const only = onlyAt >= 0 ? argv[onlyAt + 1] : argv.find((a) => !a.startsWith('--'));

// ------------------------------------------------------------------ the manifest audit
/** A top-level, unprefixed `.mjs` that names itself in a `N passed, M failed` summary line. */
const looksLikeGate = (name) => {
  const src = readFileSync(join(HERE, `${name}.mjs`), 'utf8');
  return src.includes(`${name}: $`) && /\$\{\w+\} passed, \$\{\w+\} failed/.test(src);
};

/** Files git knows about, or `null` when git cannot answer — in which case nothing is excused. */
function tracked() {
  try {
    const out = execFileSync('git', ['ls-files', '-z', '--', 'harness'], { cwd: ROOT, encoding: 'utf8' });
    return new Set(out.split('\0').filter(Boolean).map((f) => f.replace(/^harness\//, '')));
  } catch { return null; }
}

function auditManifest() {
  const known = tracked();
  const found = readdirSync(HERE, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.mjs') && !e.name.startsWith('_') && !e.name.startsWith('.'))
    .filter((e) => !known || known.has(e.name))
    .map((e) => e.name.slice(0, -4))
    .filter((n) => n !== 'gates' && looksLikeGate(n));
  return {
    unlisted: found.filter((n) => !GATES.includes(n)),
    missing: GATES.filter((n) => !found.includes(n)),
  };
}

// ------------------------------------------------------------------ spawning
const live = new Set();
/** Kill the whole process group, so a gate's browser and stub server die with it. */
const reap = (child) => {
  try { process.kill(-child.pid, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch { /* gone */ } }
};
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { for (const c of live) reap(c); process.exit(130); });
}

function run(name) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn(process.execPath, [join(HERE, `${name}.mjs`)], {
      cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
    });
    live.add(child);
    let out = '';
    let killed = false;
    const soak = (b) => { out += b; };
    child.stdout.on('data', soak);
    child.stderr.on('data', soak);
    const timer = setTimeout(() => {
      killed = true;
      out += `\n[gates] ${name} exceeded ${TIMEOUT / 1000}s — its process group was killed\n`;
      reap(child);
    }, TIMEOUT);
    child.on('close', (code) => {
      clearTimeout(timer);
      live.delete(child);
      const line = out.split('\n').map((l) => l.trim()).reverse().find((l) => SUMMARY.test(l));
      const m = line ? line.match(SUMMARY) : null;
      resolve({
        name, out, line: m ? line : null, ms: Date.now() - t0,
        code: killed ? 124 : (code === null ? 1 : code),
        passed: m ? +m[2] : 0, failed: m ? +m[3] : 0, skipped: m && m[4] ? +m[4] : 0,
      });
    });
  });
}

// ------------------------------------------------------------------ reporting
const secs = (ms) => `${(ms / 1000).toFixed(1)} s`;

function report(r) {
  const red = r.code !== 0 || r.failed > 0 || !r.line;
  if (!red) {
    const tail = r.skipped ? `, ${r.skipped} skipped` : '';
    console.log(`  ok   ${r.name.padEnd(WIDTH)}  ${String(r.passed).padStart(3)} passed${tail}  ·  ${secs(r.ms)}`);
    return;
  }
  console.log(`\n${'─'.repeat(92)}\n  FAIL ${r.name}  ·  exit ${r.code}  ·  ${secs(r.ms)}${r.line ? '' : '  ·  NO SUMMARY LINE — it died before it could report'}\n${'─'.repeat(92)}`);
  console.log(r.out.trimEnd());
  console.log('─'.repeat(92));
}

/** Run `names` `width` at a time, reporting each as it lands. Nothing short-circuits. */
async function pool(names, width) {
  const done = new Map();
  let next = 0;
  const worker = async () => {
    while (next < names.length) {
      const name = names[next++];
      const r = await run(name);
      done.set(name, r);
      report(r);
    }
  };
  await Promise.all(Array.from({ length: Math.min(width, names.length) }, worker));
  return names.map((n) => done.get(n));
}

// ------------------------------------------------------------------ main
const audit = auditManifest();
let list = GATES;
if (only) {
  if (!GATES.includes(only)) {
    console.error(`gates: "${only}" is not in the list. Known gates:\n  ${GATES.join('\n  ')}`);
    process.exit(2);
  }
  list = [only];
}

const t0 = Date.now();
const width = serial ? 1 : Math.min(POOL, list.length);
console.log(`gates: ${list.length} gate${list.length === 1 ? '' : 's'}, ${width === 1 ? 'serial' : `${width} at a time`}\n`);
const results = await pool(list, width);
const wall = Date.now() - t0;

const total = results.reduce((a, r) => ({
  passed: a.passed + r.passed, failed: a.failed + r.failed, skipped: a.skipped + r.skipped,
  red: a.red + (r.code !== 0 || r.failed > 0 || !r.line ? 1 : 0),
}), { passed: 0, failed: 0, skipped: 0, red: 0 });

if (slow) {
  console.log('\n  timing, slowest first');
  for (const r of [...results].sort((a, b) => b.ms - a.ms)) {
    console.log(`  ${secs(r.ms).padStart(8)}  ${r.name}`);
  }
}

for (const n of audit.unlisted) {
  console.log(`\n🚨 gates: harness/${n}.mjs is committed, prints a gate summary line, and is NOT in GATES — it has been running nowhere. Add it to harness/gates.mjs.`);
}
for (const n of audit.missing) {
  console.log(`\n🚨 gates: GATES lists "${n}" and harness/${n}.mjs is not a gate on disk.`);
}

const skipTail = total.skipped ? ` · ${total.skipped} skipped` : ' · 0 skipped';
console.log(`\n${results.length} gate${results.length === 1 ? '' : 's'} · ${total.passed} passed · ${total.failed} failed${skipTail} · ${Math.round(wall / 1000)} s`);
if (total.red) console.log(`${total.red} gate${total.red === 1 ? '' : 's'} red: ${results.filter((r) => r.code !== 0 || r.failed > 0 || !r.line).map((r) => r.name).join(', ')}`);
process.exit(total.red || audit.unlisted.length || audit.missing.length ? 1 : 0);
