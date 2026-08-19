/**
 * _maplabel1-score.mjs — DOES THE GENERATOR'S OWN PLACEMENT SCORE AGREE WITH JOHN?
 *
 * `harness/genspike.mjs` `placeRooms()` picks each room's position by
 *
 *     score = contact + via - lambdaWaste * max(0, waste) + snapped * ALIGN_BONUS * align
 *             + rng() * 1.5      // "seeded taste"
 *
 * and takes the argmax. Nothing exports that number, so this file READS IT OUT OF THE GENERATOR
 * rather than recomputing it:
 *
 *   1. read `genspike.mjs` as text,
 *   2. make TWO surgical textual insertions that record `best.score` and its four terms —
 *      **no arithmetic is changed, and both insertions are asserted to have landed**
 *      (HANDOFF: "assert the match landed" — a replace that matches nothing fails silently),
 *   3. write the patched copy to a temp file and import it.
 *
 * ⚠️ AN INSTRUMENT THAT RE-DERIVES THE THING IT MEASURES WILL AGREE WITH IT. The whole point of
 * patching the real file instead of reimplementing the formula is that a typo in a reimplemented
 * score would still produce a plausible correlation and nothing would go red.
 *
 * 🚨 THE CONTROLS, AND BOTH RUN ON EVERY RUN:
 *
 *   C1  EQUIVALENCE — the patched copy must produce `toJSON(buildPlan(seed))` BYTE-IDENTICAL to
 *       the unpatched module for all 40 labelled seeds. If the patch moved the rng stream, the
 *       scores would belong to plans John never saw.
 *   C2  C1 MUST BE ABLE TO FAIL — a third build of the same file with ONE extra `rng()` call
 *       inserted at the same site must make C1 go RED. If C2's arm comes back green, C1 cannot
 *       see a behaviour change and its green means nothing.
 *   C3  SHUFFLE — the score-vs-verdict AUC is recomputed on 2000 shuffles of the verdict column.
 *       The real AUC must sit outside that null distribution or there is no signal to report.
 *
 * Usage:  node harness/_maplabel1-score.mjs
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const GEN = path.join(ROOT, 'harness', 'genspike.mjs');
const LABELS = path.join(ROOT, 'tools', 'mapdesigner', 'labels.jsonl');

// ===========================================================================================
// the patcher
// ===========================================================================================

/** the two sites, quoted from genspike.mjs exactly as they are on disk */
const SITE_NOISE = '              + rng() * 1.5;';
const SITE_PUSH = '            cands.push({ r, score });';
const SITE_BEST = '    const best = cands[0];';

function patchSource(src, { sabotage = false } = {}) {
  const hits = { noise: 0, push: 0, best: 0, sab: 0 };
  let out = src;

  // 1. capture the "seeded taste" draw. An assignment expression evaluates to the assigned
  //    value, so the arithmetic of `score` is untouched and rng() is still called exactly once.
  if (out.includes(SITE_NOISE)) {
    hits.noise = 1;
    out = out.replace(SITE_NOISE, '              + (globalThis.__ML1_NOISE = rng() * 1.5);');
  }
  // 2. carry the terms on the candidate, and record the WINNER only.
  if (out.includes(SITE_PUSH)) {
    hits.push = 1;
    out = out.replace(SITE_PUSH,
      '            cands.push({ r, score, __ml1: { contact, via, waste: Math.max(0, waste), '
      + 'snapped, align, lambdaWaste, noise: globalThis.__ML1_NOISE } });');
  }
  if (out.includes(SITE_BEST)) {
    hits.best = 1;
    out = out.replace(SITE_BEST,
      '    const best = cands[0];\n'
      + '    if (globalThis.__ML1_REC) globalThis.__ML1_REC.push({ score: best.score, '
      + 'nCands: cands.length, ...best.__ml1 });');
  }
  // C2's arm: one extra draw from the same generator, which MUST change every plan downstream.
  if (sabotage) {
    if (out.includes(SITE_BEST)) { hits.sab = 1; out = out.replace(SITE_BEST, '    rng();\n' + SITE_BEST); }
  }
  return { out, hits };
}

async function loadPatched(tag, opts) {
  const src = fs.readFileSync(GEN, 'utf8');
  const { out, hits } = patchSource(src, opts);
  const need = opts && opts.sabotage ? ['noise', 'push', 'best', 'sab'] : ['noise', 'push', 'best'];
  const missed = need.filter((k) => !hits[k]);
  if (missed.length) {
    throw new Error(`PATCH DID NOT LAND at site(s): ${missed.join(', ')} — genspike.mjs has moved. `
      + 'This instrument must FAIL rather than report a score it did not read.');
  }
  const f = path.join(os.tmpdir(), `_ml1-genspike-${tag}-${process.pid}.mjs`);
  fs.writeFileSync(f, out);
  const mod = await import(pathToFileURL(f).href);
  return { mod, file: f };
}

// ===========================================================================================
// stats (shared with _maplabel1-labels.mjs by copy — 30 lines, no shared-module churn)
// ===========================================================================================

/** P(a random x from A ranks above a random x from B), ties = 0.5. 0.5 is chance. */
function auc(A, B) {
  let s = 0;
  for (const a of A) for (const b of B) s += a > b ? 1 : a < b ? 0 : 0.5;
  return s / (A.length * B.length);
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffled(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : 'n/a');

// ===========================================================================================
// run
// ===========================================================================================

const rows = fs.readFileSync(LABELS, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const out = [];
let fails = 0;
const check = (ok, name, detail) => {
  if (!ok) fails++;
  out.push(`${ok ? 'PASS' : 'FAIL'}  ${name}\n        ${detail}`);
  return ok;
};

const plain = await import(pathToFileURL(GEN).href);
const { mod: P, file: pf } = await loadPatched('rec', {});
const { mod: SAB, file: sf } = await loadPatched('sab', { sabotage: true });

// --- C1 / C2: the patched copy must be the same generator -----------------------------------
let same = 0, diff = 0, sabSame = 0, sabDiff = 0;
for (const r of rows) {
  const a = JSON.stringify(plain.toJSON(plain.buildPlan(r.seed, r.dials)));
  const b = JSON.stringify(P.toJSON(P.buildPlan(r.seed, r.dials)));
  const c = JSON.stringify(SAB.toJSON(SAB.buildPlan(r.seed, r.dials)));
  (a === b ? same++ : diff++);
  (a === c ? sabSame++ : sabDiff++);
}
check(diff === 0, 'C1 EQUIVALENCE — the instrumented generator is the generator',
  `${same}/${rows.length} plans byte-identical to unpatched genspike.mjs · ${diff} differ`);
check(sabDiff === rows.length, 'C2 CONTROL THAT MUST FAIL — C1 can see a behaviour change',
  `same file + ONE extra rng() draw ⇒ ${sabDiff}/${rows.length} plans differ (must be ${rows.length}). `
  + `If this read 0, C1's green would mean nothing.`);

// --- read the score out of the generator, for every labelled plan ---------------------------
const V = { good: 2, meh: 1, bad: 0 };
const recs = [];
for (const r of rows) {
  globalThis.__ML1_REC = [];
  // 🚨 the HAND-EDITED row is scored on the SEED IT CAME FROM, because placeRooms never ran on
  // his dragged rectangles — there is no placement score for a hand-authored layout, and
  // pretending there is would be the whole failure class this project keeps hitting.
  P.buildPlan(r.seed, r.dials);
  const steps = globalThis.__ML1_REC.slice();
  globalThis.__ML1_REC = null;
  const sum = steps.reduce((s, x) => s + x.score, 0);
  recs.push({
    seed: r.seed, verdict: r.verdict, y: V[r.verdict], handEdited: !!r.handEdited,
    nSteps: steps.length,
    score: sum,
    scoreMean: mean(steps.map((x) => x.score)),
    scoreMin: Math.min(...steps.map((x) => x.score)),
    contact: steps.reduce((s, x) => s + x.contact, 0),
    via: steps.reduce((s, x) => s + x.via, 0),
    wastePen: steps.reduce((s, x) => s + x.lambdaWaste * x.waste, 0),
    alignBonus: steps.reduce((s, x) => s + x.snapped * 6.0 * x.align, 0),
    noise: steps.reduce((s, x) => s + x.noise, 0),
    nCands: mean(steps.map((x) => x.nCands)),
  });
}
check(recs.every((x) => x.nSteps >= 4), 'the recorder saw every placement',
  `placements recorded per plan: ${[...new Set(recs.map((x) => x.nSteps))].sort().join('/')} `
  + `(placeRooms scores rooms 2..n, so n-1 per plan)`);

// --- does it agree with John? ----------------------------------------------------------------
// The hand-edited row is held out of every headline number and reported on its own.
const gen = recs.filter((x) => !x.handEdited);
const G = gen.filter((x) => x.verdict === 'good');
const B = gen.filter((x) => x.verdict === 'bad');
const M = gen.filter((x) => x.verdict === 'meh');

const TERMS = ['score', 'scoreMean', 'scoreMin', 'contact', 'via', 'wastePen', 'alignBonus', 'noise', 'nCands'];
const lines = [];
const rng = mulberry32(20260811);
for (const k of TERMS) {
  const a = auc(G.map((x) => x[k]), B.map((x) => x[k]));
  // C3 — the same statistic on 2000 shuffles of the verdict column
  const ys = gen.map((x) => x.verdict);
  const vals = gen.map((x) => x[k]);
  let ge = 0; const nulls = [];
  for (let i = 0; i < 2000; i++) {
    const sh = shuffled(ys, rng);
    const aa = auc(vals.filter((_, j) => sh[j] === 'good'), vals.filter((_, j) => sh[j] === 'bad'));
    nulls.push(Math.abs(aa - 0.5));
    if (Math.abs(aa - 0.5) >= Math.abs(a - 0.5) - 1e-12) ge++;
  }
  const p = (ge + 1) / 2001;
  nulls.sort((x, y) => x - y);
  lines.push({ k, auc: a, p, null95: nulls[Math.floor(0.95 * nulls.length)],
    gm: mean(G.map((x) => x[k])), bm: mean(B.map((x) => x[k])), mm: mean(M.map((x) => x[k])) });
}

const best = lines.reduce((x, y) => (Math.abs(y.auc - 0.5) > Math.abs(x.auc - 0.5) ? y : x));
check(true, 'C3 SHUFFLE CONTROL ran on every term',
  `2000 shuffles each; a term with no signal must land near AUC 0.50 with p ≳ 0.05. `
  + `Strongest term here: ${best.k} AUC ${f2(best.auc)}, p = ${best.p.toFixed(4)}`);

// the noise term is the built-in null: it is `rng()*1.5` and CANNOT know anything about taste.
const noiseRow = lines.find((x) => x.k === 'noise');
check(noiseRow.p > 0.05, 'C3b the score\'s own noise term separates nothing (built-in null)',
  `noise AUC ${f2(noiseRow.auc)}, p = ${noiseRow.p.toFixed(3)} — a seeded rng draw must not `
  + `predict John's verdict. If this ever goes red the whole pipeline is leaking labels.`);

// ===========================================================================================
// report
// ===========================================================================================
console.log('\n_maplabel1-score — the generator\'s placement score against John\'s 40 verdicts\n');
console.log(`  n = ${rows.length} rows · ${gen.length} generated (${G.length} good / ${M.length} meh / ${B.length} bad)`
  + ` · 1 hand-edited, held out\n`);
console.log('  TERM          AUC(good>bad)     p(shuffle)   null p95   mean good    mean meh    mean bad');
for (const l of lines) {
  console.log(`  ${l.k.padEnd(12)}  ${f2(l.auc).padStart(8)}      ${l.p.toFixed(4).padStart(8)}   `
    + `${l.null95.toFixed(3).padStart(7)}   ${f2(l.gm).padStart(9)}   ${f2(l.mm).padStart(9)}   ${f2(l.bm).padStart(9)}`);
}
const he = recs.find((x) => x.handEdited);
if (he) {
  console.log(`\n  HAND-EDITED seed ${he.seed} (verdict ${he.verdict}) — its SEED's placement score is `
    + `${f2(he.score)}; the score of the layout he actually dragged does not exist, because `
    + 'placeRooms() never ran on it.');
}
console.log('\n  per-plan table (seed, verdict, score, contact, noise share):');
for (const x of recs.slice().sort((a, b) => b.score - a.score)) {
  console.log(`    ${String(x.seed).padStart(6)}  ${x.verdict.padEnd(4)}  score ${f2(x.score).padStart(7)}`
    + `  contact ${f2(x.contact).padStart(6)}  noise ${f2(x.noise).padStart(5)}`
    + `  (${(100 * x.noise / x.score).toFixed(0)}% of score)${x.handEdited ? '  ⚠ hand-edited' : ''}`);
}

console.log('\n  CONTROLS');
for (const l of out) console.log('  ' + l);
try { fs.unlinkSync(pf); fs.unlinkSync(sf); } catch { /* temp files */ }
console.log(`\n  ${fails === 0 ? 'ALL CONTROLS GREEN' : `🚨 ${fails} CONTROL(S) RED — do not believe the numbers above`}\n`);
process.exit(fails === 0 ? 0 : 1);
