#!/usr/bin/env node
/**
 * _genwalk1-rot.mjs — WHAT DOES FORBIDDING ROOM ROTATION COST THE GENERATOR?
 *
 * `genwalk-1`, 2026-08-11. Read-only: nothing in `src/` and nothing in `harness/genspike.mjs` is
 * touched. This file writes PATCHED COPIES of `genspike.mjs` into the scratchpad and imports them,
 * which is `maplabel-1`'s pattern and exists for one reason:
 *
 *   ⚠️ AN INSTRUMENT THAT RE-DERIVES THE THING IT MEASURES WILL AGREE WITH IT. A hand-rolled
 *   "no-rotation packer" would be a second packing algorithm, and the number it printed would be
 *   about that second algorithm. Every arm below is the SHIPPED `genspike.mjs` with ONE line
 *   textually replaced, so `selectRooms`, `placeRooms`, `planFromRooms` and `measure` are the
 *   same code in every arm.
 *
 * THE LINE, `genspike.mjs` selectRooms():   const rot = rng() < 0.5;
 *
 *   arm 0   unpatched — the shipped generator, imported directly.
 *   arm A   `const rot = (rng(), false);`  every room axis-aligned. The rng DRAW IS KEPT so the
 *           patch is one token; the stream still diverges downstream because `placeRooms` skips
 *           candidate faces on a geometry test, and that divergence is the arm, not an artefact.
 *   arm T   `const rot = (rng(), true);`   every room turned. Not a proposal — it is the other
 *           end of the dial, and it is what says whether arm A's numbers are about ROTATION or
 *           about VARIETY.
 *
 * 🚨 THREE CONTROLS, AND ALL THREE RUN ON EVERY RUN.
 *
 *   C1  IDENTITY RE-PATCH. `const rot = rng() < 0.5;` -> `const rot = (rng() < 0.5);` — a
 *       semantic no-op through the same copy-and-patch machinery. All 512 plan hashes MUST equal
 *       arm 0's. If C1 ever goes red, the harness is measuring its own patching and every number
 *       below is void.
 *   C2  STREAM SENSITIVITY. `const rot = false;` — drops the rng draw. It MUST differ from arm A
 *       on at least one seed. Without C2, "arm A == C1" could mean "my hash sees nothing".
 *   C3  GARBAGE DETECTOR, PACKING QUALITY. The ballroom's `w` is multiplied by 10 in the library.
 *       `fracInternalDiggable` MUST fall and void area MUST rise, or "arm A did not lose packing
 *       quality" is a sentence this harness could print about anything.
 *   C4  GARBAGE DETECTOR, CLOSURE. `L_DIG` 1.20 -> 40.0 and the door jamb 0.20 -> 40.0: no
 *       boundary is long enough to dig and none is long enough to hold a door. The CLOSURE gates
 *       (allReach / exitReach / hunterAll) MUST go red, or "plans still close" is unfalsifiable.
 *
 * 🚨 **C4 EXISTS BECAUSE C3 WAS NOT ENOUGH, AND THAT IS A RESULT ABOUT §1 OF `house-packing.md`,
 * NOT ABOUT THIS FILE.** C3 was written expecting a 272 m ballroom to break the gates. It does
 * not: allReach / exitReach / hunterAll / not-degenerate stay at **100.0% on all 512 seeds** with
 * a ballroom ten times too long, while `fracInternalDiggable` falls 0.928 -> 0.686 and void area
 * goes 5.5 -> 30.0 m2. The four closure gates are near-tautological under this algorithm — every
 * room is placed flush against an already-placed room and every leftover cell becomes corridor,
 * so the plan is connected by construction. **"The three solvability gates pass on 512/512 seeds"
 * is therefore weak evidence, and should not be quoted as if the generator had cleared a bar.**
 *
 * Usage:  node harness/evidence/_genwalk1-rot.mjs [--n 512]
 * Exit 0 iff all four controls behave. The ARMS never set the exit code — they are a
 * measurement, not a gate.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', 'genspike.mjs');
const TMP = join(HERE, '..', '..', 'tmp_critic', '_genwalk1');
mkdirSync(TMP, { recursive: true });

const N = +(process.argv[process.argv.indexOf('--n') + 1] || 512) || 512;
const text = readFileSync(SRC, 'utf8');

/** The one line every arm rewrites. Asserted present, because a silent no-match is the whole trap. */
const ROT_LINE = '    const rot = rng() < 0.5;';
if (!text.includes(ROT_LINE)) {
  console.error(`FATAL: the rotation line is not in genspike.mjs verbatim — the patch would be a no-op.`);
  process.exit(2);
}

let stamp = 0;
async function armFrom(name, patch) {
  const out = patch(text);
  if (out === text && name !== 'arm0') {
    console.error(`FATAL: patch "${name}" changed nothing.`);
    process.exit(2);
  }
  const p = join(TMP, `gs-${name}-${stamp++}.mjs`);
  writeFileSync(p, out, 'utf8');
  return import(pathToFileURL(p).href);
}

const hashOf = (G, seed) => {
  const plan = G.buildPlan(seed);
  const m = G.measure(plan);
  return { plan, m, h: createHash('sha1').update(JSON.stringify(G.toJSON(plan)) + '|' + JSON.stringify(m)).digest('hex') };
};

// ---------------------------------------------------------------------------------------------

const A0 = await import(pathToFileURL(SRC).href);                     // the shipped generator
const AA = await armFrom('noRot', (t) => t.replace(ROT_LINE, '    const rot = (rng(), false);'));
const AT = await armFrom('allRot', (t) => t.replace(ROT_LINE, '    const rot = (rng(), true);'));
const C1 = await armFrom('c1', (t) => t.replace(ROT_LINE, '    const rot = (rng() < 0.5);'));
const C2 = await armFrom('c2', (t) => t.replace(ROT_LINE, '    const rot = false;'));
const C3 = await armFrom('c3', (t) => t.replace(
  "{ type: 'ballroom', w: 27.20, d: 15.30, storey: 9.60, char: 'B' },",
  "{ type: 'ballroom', w: 272.00, d: 15.30, storey: 9.60, char: 'B' },"));
const C4 = await armFrom('c4', (t) => t
  .replace('const L_DIG = 1.20;', 'const L_DIG = 40.00;')
  .replace('const L_DOOR = CONNECTOR_W + 2 * 0.20;', 'const L_DOOR = CONNECTOR_W + 2 * 40.00;'));

const run = (G) => {
  const rows = [];
  for (let s = 0; s < N; s++) rows.push(hashOf(G, s));
  return rows;
};

const arms = {
  'arm 0  rotation ON (shipped)': run(A0),
  'arm A  rotation FORBIDDEN': run(AA),
  'arm T  every room TURNED': run(AT),
  'C3     garbage library': run(C3),
};
const c1 = run(C1);
const c2 = run(C2);
const c4 = run(C4);

// ---- report ---------------------------------------------------------------------------------

const q = (a, p) => { const b = a.slice().sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.max(0, Math.floor(p * (b.length - 1))))]; };
const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const col = (rows, f) => rows.map((r) => f(r.m));
const pct = (rows, f) => (100 * rows.filter((r) => f(r.m)).length / rows.length);

const METRICS = [
  ['rooms per plan',            (m) => m.nRooms,        2],
  ['corridors per plan',        (m) => m.nCorridors,    2],
  ['VOIDS per plan',            (m) => m.nVoids,        2],
  ['void area m2',              (m) => m.voidArea,      1],
  ['shared internal wall m',    (m) => m.sharedM,       1],
  ['diggable wall m',           (m) => m.diggableM,     1],
  ['fracInternalDiggable',      (m) => m.fracInternal,  4],
  ['envelope area m2',          (m) => m.envArea,       0],
  ['fill (rooms+corr)/env',     (m) => m.fill,          3],
  ['longest dig run m',         (m) => m.longestRun,    2],
  ['hopsToExit',                (m) => m.hopsToExit,    2],
  ['digsToExit',                (m) => m.digsToExit,    2],
  ['slivers (edges < 1.20 m)',  (m) => m.sliverEdges,   2],
  ['unspannable metres',        (m) => m.unspannableM,  2],
  /**
   * ⚠️ THE ONE COST NO METRIC ABOVE CAN SEE. `genspike.mjs` selectRooms(): rotation "is the only
   * reason a 27.20 m gallery can ever be a north-south spine". Forbid it and every long room lies
   * the same way, so the ENVELOPE should get systematically wider. `flat.aspect` is the
   * envelope's long:short ratio and `flat.depth` is the graph depth §7.1 calls flatness.
   */
  ['envelope aspect L:S',       (m) => m.aspect,          3],
  ['envelope LONG axis m',      (m) => m.flat.envLong,    1],
  ['envelope SHORT axis m',     (m) => m.flat.envShort,   1],
  ['long axis is X (0/1)',      (m) => (m.flat.longIsX ? 1 : 0), 3],
  ['graph depth',               (m) => m.depth,           2],
];
const GATES = [
  ['plan closes: allReach',     (m) => m.allReach],
  ['plan closes: exitReach',    (m) => m.exitReach],
  ['hunter reaches all',        (m) => m.hunterAll],
  ['every room on a corridor',  (m) => m.roomsOnCorridor],
  ['minWalk',                   (m) => m.minWalk],
  ['NOT degenerate',            (m) => !m.degenerate],
  ['no door overhang',          (m) => m.doorOverhang === 0],
  ['has an exit at all',        (m) => m.exitIdx >= 0],
  /**
   * ⚠️ REPORTED, NEVER GATED. `maplabel-1` (2026-08-11) tested `depth >= 3` against John's own 40
   * labels and it REJECTS HIS TASTE — AUC 0.383, pointing the wrong way, flagging 6 of his 16 GOOD
   * plans against 2 of his 12 BAD. So a fall in this column is a fact about the shape of the
   * envelope and NOT evidence that the arm is worse to play. It is here because it is the
   * arm's largest single movement and hiding it would be the dishonest thing.
   */
  ['NOT flat (depth >= 3)',     (m) => !m.isFlat],
];

const names = Object.keys(arms);
const pad = (s, n) => String(s).padEnd(n);
const num = (v, d, n = 9) => String(typeof v === 'number' ? v.toFixed(d) : v).padStart(n);

console.log(`\n_genwalk1-rot — ${N} seeds per arm, shipped dials (align .35 gap 2.2 waste .04 cut 30)\n`);
console.log(pad('metric (MEAN)', 26) + names.map((n) => num(n.split('  ')[0], 0, 12)).join(''));
for (const [label, f, d] of METRICS) {
  console.log(pad(label, 26) + names.map((n) => num(mean(col(arms[n], f)), d, 12)).join(''));
}
console.log('');
console.log(pad('metric (p05 / p50 / p95)', 26) + names.map((n) => num(n.split('  ')[0], 0, 24)).join(''));
for (const [label, f, d] of [METRICS[2], METRICS[5], METRICS[6], METRICS[0]]) {
  console.log(pad(label, 26) + names.map((n) => {
    const c = col(arms[n], f);
    return `${q(c, 0.05).toFixed(d)}/${q(c, 0.50).toFixed(d)}/${q(c, 0.95).toFixed(d)}`.padStart(24);
  }).join(''));
}
console.log('');
console.log(pad('GATE (% of seeds)', 26) + names.map((n) => num(n.split('  ')[0], 0, 12)).join(''));
for (const [label, f] of GATES) {
  console.log(pad(label, 26) + names.map((n) => num(pct(arms[n], f), 1, 12)).join(''));
}

// distinct-plan check: does forbidding rotation collapse the library into fewer shapes?
const shapes = (rows) => new Set(rows.map((r) => r.h)).size;
console.log('');
console.log(pad('distinct plan hashes', 26) + names.map((n) => num(shapes(arms[n]), 0, 12)).join(''));

// ---- controls -------------------------------------------------------------------------------

const a0 = arms[names[0]], aA = arms[names[1]], c3 = arms[names[3]];
const c1Same = c1.filter((r, i) => r.h === a0[i].h).length;
const c2Diff = c2.filter((r, i) => r.h !== aA[i].h).length;
const c3Frac = mean(col(c3, (m) => m.fracInternal));
const a0Frac = mean(col(a0, (m) => m.fracInternal));
const c3VoidA = mean(col(c3, (m) => m.voidArea));
const a0VoidA = mean(col(a0, (m) => m.voidArea));
const closes = (m) => m.allReach && m.exitReach && m.hunterAll && m.exitIdx >= 0;
const c4Fail = c4.filter((r) => !closes(r.m)).length;
const c3GateFail = c3.filter((r) => !closes(r.m)).length;

console.log('\nCONTROLS — all four run on every run\n');
const ok = [];
const line = (id, want, got, pass, why) => { ok.push(pass); console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${id}  ${why}\n           want ${want}, got ${got}`); };
line('C1 identity re-patch ', `${N}/${N} hashes == arm 0`, `${c1Same}/${N}`, c1Same === N,
  'a semantic no-op through the same machinery must reproduce arm 0 exactly');
line('C2 stream sensitivity', '> 0 seeds differ from arm A', `${c2Diff}/${N}`, c2Diff > 0,
  'dropping the rng draw must move the plan, or the hash sees nothing');
line('C3 quality detector  ', 'frac drops > 0.05 AND void area rises',
  `frac ${a0Frac.toFixed(4)} -> ${c3Frac.toFixed(4)}, void ${a0VoidA.toFixed(1)} -> ${c3VoidA.toFixed(1)} m2`,
  (a0Frac - c3Frac) > 0.05 && c3VoidA > a0VoidA,
  'a 272 m ballroom must visibly cost packing quality, or "arm A lost nothing" says nothing');
line('C4 closure detector  ', '> 0 seeds fail to close', `${c4Fail}/${N}`, c4Fail > 0,
  'undiggable + doorless must break allReach/exitReach/hunterAll, or "plans still close" is unfalsifiable');
console.log(`         note: C3 (272 m ballroom) breaks closure on ${c3GateFail}/${N} — the closure gates are near-tautological here.`);

const allOk = ok.every(Boolean);
console.log(`\n${allOk ? 'controls OK — the arm numbers above are readable' : 'CONTROLS RED — DO NOT READ THE ARMS'}\n`);
process.exit(allOk ? 0 : 1);
