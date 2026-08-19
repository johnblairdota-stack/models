/**
 * _maplabel1-labels.mjs — WHAT DO JOHN'S 40 VERDICTS ACTUALLY SEPARATE ON?
 *
 * `tools/mapdesigner/labels.jsonl` carries, per plan he judged, the verdict and the 28-field
 * `features` vector as it stood ON THE SCREEN HE LOOKED AT. This file reads those features; it
 * does NOT recompute them (⚠️ an instrument that re-derives the thing it measures will agree with
 * it). A separate check confirms the recorded vector still reproduces from the seed, so a
 * generator change since he labelled would be caught rather than absorbed.
 *
 * The statistic is AUC — P(a random GOOD scores above a random BAD), ties 0.5, chance = 0.50.
 * It is rank-based, so it does not care about units, outliers or non-linearity, and at n = 15/12
 * it is about the only thing that is honest.
 *
 * 🚨 THE CONTROLS, ALL OF WHICH RUN ON EVERY RUN:
 *
 *   N1  THREE PLANTED NULL COLUMNS that CANNOT know anything about taste — a seeded rng draw,
 *       the row's position in the session, and the seed number itself. If any of these lands in
 *       the "significant" band, the pipeline is leaking labels or the p-values are wrong.
 *       ⚠️ The session-order column is not purely a null: if it fires, it means his standard
 *       DRIFTED over the twelve minutes, which is a finding about the labels, not a bug.
 *   N2  FAMILY-WISE SHUFFLE — the whole 28-feature sweep is re-run on 5000 shuffles of the
 *       verdict column and the MAX |AUC − 0.5| over all features is collected. With 28 features
 *       and n = 27 in the good/bad contrast, a single per-feature p < 0.05 is expected by chance;
 *       the only defensible claim is "beats the shuffled MAX". **This arm is the whole point: if
 *       the real best feature does not clear the shuffled 95th percentile, there is no separation
 *       to report and this file must say so rather than printing a ranked table that looks like
 *       one.**
 *   N3  A GATE MUST BE VALIDATED AGAINST WHAT IT MUST NOT FLAG (HANDOFF: "a false positive in a
 *       gate is worse than the bug it was written for"). Every proposed gate below is scored
 *       against John's 16 GOOD plans, and its false-positive count on them is printed FIRST.
 *
 * Usage:  node harness/_maplabel1-labels.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LABELS = path.join(ROOT, 'tools', 'mapdesigner', 'labels.jsonl');
const GEN = pathToFileURL(path.join(ROOT, 'harness', 'genspike.mjs')).href;
const { buildPlan, planFromRooms, measure, LIBRARY } = await import(GEN);

/**
 * 🐞 A REAL DEFECT IN THE LABEL WRITER, FOUND BY THE PROVENANCE CHECK BELOW AND FIXED IN
 * `app.js` FOR EVERY FUTURE ROW. `pushLabel()` stored each room as `{type, rot, x0..z1}` and
 * dropped `storey`/`char`. `planFromRooms` sets `y1: r.storey`, so on a HAND-EDITED row the
 * y-range came back `undefined`, every dig-band overlap test went NaN, and the rebuilt plan had
 * ZERO diggable edges — `digsToExit -1`, all 7 rooms dead ends. The geometry was fine
 * (`sharedM` identical to 2 dp); only the reconstruction was broken.
 *
 * Row 88889 is already written that way, so it is repaired HERE, from `LIBRARY` by room type,
 * rather than by rewriting John's data file. With `storey`/`char` restored the row reproduces
 * its recorded feature vector EXACTLY, which is what proves the diagnosis.
 */
function hydrate(rooms) {
  return rooms.map((r) => {
    const l = LIBRARY.find((x) => x.type === r.type);
    return { storey: l ? l.storey : 4.80, char: l ? l.char : '?', ...r };
  });
}

const rows = fs.readFileSync(LABELS, 'utf8').trim().split('\n').map((l) => JSON.parse(l));

// ===========================================================================================
// stats
// ===========================================================================================
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
function shuffle(a, rng) {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}
function rank(v) {
  const idx = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(v.length);
  let i = 0;
  while (i < idx.length) {
    let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
    i = j + 1;
  }
  return r;
}
function spearman(x, y) {
  const rx = rank(x), ry = rank(y);
  const mx = rx.reduce((s, a) => s + a, 0) / rx.length, my = ry.reduce((s, a) => s + a, 0) / ry.length;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < rx.length; i++) { num += (rx[i] - mx) * (ry[i] - my); dx += (rx[i] - mx) ** 2; dy += (ry[i] - my) ** 2; }
  return dx && dy ? num / Math.sqrt(dx * dy) : 0;
}
const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : ' n/a ');

// ===========================================================================================
// build the table — features exactly as recorded, plus three planted nulls
// ===========================================================================================
const rngNull = mulberry32(1234567);
const FEATS = Object.keys(rows[0].features);
const V = { good: 2, meh: 1, bad: 0 };
const data = rows.map((r, i) => {
  const f = { ...r.features };
  for (const k of FEATS) if (typeof f[k] !== 'number') f[k] = 0;
  f.__nullRng = rngNull();                  // N1 — cannot know anything
  f.__nullOrder = i;                        // N1 — position in the session (drift detector)
  f.__nullSeed = Number(r.seed) || 0;       // N1 — the seed itself
  return { seed: r.seed, verdict: r.verdict, y: V[r.verdict], handEdited: !!r.handEdited, f, at: r.at };
});
const COLS = [...FEATS, '__nullRng', '__nullOrder', '__nullSeed'];

const out = [];
let fails = 0;
const check = (ok, name, detail) => { if (!ok) fails++; out.push(`${ok ? 'PASS' : 'FAIL'}  ${name}\n        ${detail}`); };

// --- provenance: does the recorded vector still come out of the generator? -------------------
function reproduce(r, { stripStorey = false } = {}) {
  const p = r.handEdited
    ? planFromRooms(r.seed, stripStorey ? r.rooms.map((x) => ({ ...x })) : hydrate(r.rooms),
      { ...r.dials, normalise: false })
    : buildPlan(r.seed, r.dials);
  const m = measure(p);
  const now = {
    depth: m.flat.depth, depthMean: m.flat.depthMean, nRooms: m.nRooms, nVoids: m.nVoids,
    sliverEdges: m.sliverEdges, deadEndRooms: m.deadEndRooms, digsToExit: m.digsToExit,
    hopsToExit: m.hopsToExit, corridorNetworks: m.corrNets,
    longestSightline: m.difficulty.longestSightline, sharedM: +m.sharedM.toFixed(2),
  };
  return Object.keys(now).filter((k) => Math.abs(now[k] - r.features[k]) > 1e-6);
}
let repro = 0; const moved = [];
for (const r of rows) { const bad = reproduce(r); if (bad.length) moved.push(`${r.seed}:${bad.join(',')}`); else repro++; }
check(moved.length === 0, 'PROVENANCE — the plan he judged is still the plan the seed makes',
  `${repro}/${rows.length} rows reproduce their recorded features exactly`
  + (moved.length ? ` · MOVED: ${moved.slice(0, 5).join(' ')}` : '')
  + ' · genspike.mjs changed on the labelling day (canDoor), so this is not free');

// 🚨 THE CONTROL THAT MUST FAIL — the provenance check has to be ABLE to see a broken rebuild.
// Rebuild the hand-edited row the way `pushLabel()` actually recorded it (no `storey`), which is
// the defect diagnosed above. If this comes back clean, PROVENANCE's green means nothing.
const he = rows.find((r) => r.handEdited);
const heBroken = he ? reproduce(he, { stripStorey: true }) : ['no hand-edited row'];
check(heBroken.length > 0, 'CTL — PROVENANCE can fail (rebuild the hand-edited row without `storey`)',
  `stripped rebuild differs on: ${heBroken.join(', ')} — this arm MUST be non-empty`);

// --- the contrast ------------------------------------------------------------------------------
// The hand-edited row is EXCLUDED from every headline number: it is the only row whose rectangles
// he chose himself, so it is not a sample of the generator's output at all.
const gen = data.filter((d) => !d.handEdited);
const G = gen.filter((d) => d.verdict === 'good');
const B = gen.filter((d) => d.verdict === 'bad');
const ALLG = data.filter((d) => d.verdict === 'good');   // 16, incl. the hand-edited one

const rng = mulberry32(20260811);
const NSH = 20000;

// real statistics
const stat = COLS.map((k) => ({
  k,
  auc: auc(G.map((d) => d.f[k]), B.map((d) => d.f[k])),
  rho: spearman(gen.map((d) => d.f[k]), gen.map((d) => d.y)),
  gm: mean(G.map((d) => d.f[k])), bm: mean(B.map((d) => d.f[k])),
  mm: mean(gen.filter((d) => d.verdict === 'meh').map((d) => d.f[k])),
}));

// N2 — one shuffled sweep at a time; collect both the per-feature null and the FAMILY MAX
const perFeatGE = Object.fromEntries(COLS.map((k) => [k, 0]));
const familyMax = [];
let famGE = 0;
const realBestAbs = Math.max(...stat.filter((s) => !s.k.startsWith('__')).map((s) => Math.abs(s.auc - 0.5)));
const ys = gen.map((d) => d.verdict);
for (let s = 0; s < NSH; s++) {
  const sh = shuffle(ys, rng);
  const gi = [], bi = [];
  for (let i = 0; i < sh.length; i++) { if (sh[i] === 'good') gi.push(i); else if (sh[i] === 'bad') bi.push(i); }
  let mx = 0;
  for (const k of COLS) {
    const a = auc(gi.map((i) => gen[i].f[k]), bi.map((i) => gen[i].f[k]));
    const d = Math.abs(a - 0.5);
    // the family MAX is taken over the REAL features only, so the planted nulls cannot inflate it
    if (!k.startsWith('__') && d > mx) mx = d;
    const real = Math.abs(stat.find((x) => x.k === k).auc - 0.5);
    if (d >= real - 1e-12) perFeatGE[k]++;
  }
  familyMax.push(mx);
  if (mx >= realBestAbs - 1e-12) famGE++;
}
familyMax.sort((a, b) => a - b);
const fam95 = familyMax[Math.floor(0.95 * NSH)];
const fam50 = familyMax[Math.floor(0.50 * NSH)];
const famP = (famGE + 1) / (NSH + 1);
for (const s of stat) s.p = (perFeatGE[s.k] + 1) / (NSH + 1);
stat.sort((a, b) => Math.abs(b.auc - 0.5) - Math.abs(a.auc - 0.5));

const realFeats = stat.filter((s) => !s.k.startsWith('__'));
const nulls = stat.filter((s) => s.k.startsWith('__'));
const bestReal = realFeats[0];

// --- N1 -----------------------------------------------------------------------------------------
for (const nl of nulls) {
  const name = { __nullRng: 'a seeded rng draw', __nullOrder: 'position in the session', __nullSeed: 'the seed number' }[nl.k];
  check(nl.p > 0.05, `N1 planted null "${name}" separates nothing`,
    `AUC ${f3(nl.auc)} · p = ${nl.p.toFixed(4)}`
    + (nl.k === '__nullOrder' ? ' — ⚠️ if this ever fires it is DRIFT in his standard, not a code bug' : ''));
}
// --- N2 -----------------------------------------------------------------------------------------
const beatsFamily = famP <= 0.05;
check(true, 'N2 FAMILY-WISE SHUFFLE ran (this arm decides whether there is anything to report)',
  `best real feature ${bestReal.k} |AUC−0.5| = ${Math.abs(bestReal.auc - 0.5).toFixed(3)} · `
  + `shuffled MAX over ${realFeats.length} real features: median ${fam50.toFixed(3)}, p95 ${fam95.toFixed(3)} `
  + `· family-wise p = ${famP.toFixed(4)} ⇒ ${beatsFamily ? 'CLEARS the null' : 'DOES NOT clear the null'}`);

// --- how fragile is the top feature at n = 27? jackknife, one row dropped at a time ------------
{
  const k = bestReal.k;
  const jk = [];
  for (let i = 0; i < gen.length; i++) {
    const g2 = G.filter((d) => d !== gen[i]).map((d) => d.f[k]);
    const b2 = B.filter((d) => d !== gen[i]).map((d) => d.f[k]);
    if (g2.length && b2.length) jk.push(auc(g2, b2));
  }
  jk.sort((a, b) => a - b);
  out.push(`      JACKKNIFE  ${k}: dropping any ONE of the ${gen.length} rows moves AUC to `
    + `[${f3(jk[0])}, ${f3(jk[jk.length - 1])}] (point estimate ${f3(bestReal.auc)}).`);
}

// --- is the top feature just envelope size in disguise? -----------------------------------------
{
  const conf = ['nRooms', 'nCorridors', 'envX', 'envZ', 'sharedM', 'depth', 'depthMean'];
  const a = gen.map((d) => d.f[bestReal.k]);
  out.push('      CONFOUNDS  Spearman of ' + bestReal.k + ' against: '
    + conf.map((c) => `${c} ${f3(spearman(a, gen.map((d) => d.f[c])))}`).join(' · '));
}

// ===========================================================================================
// report
// ===========================================================================================
console.log('\n_maplabel1-labels — what John\'s verdicts separate on\n');
console.log(`  ${rows.length} rows · ${gen.length} generated (${G.length} good / `
  + `${gen.filter((d) => d.verdict === 'meh').length} meh / ${B.length} bad) · 1 hand-edited, held out`);
const ts = data.map((d) => new Date(d.at).getTime()).sort((a, b) => a - b);
console.log(`  labelled in one ${((ts[ts.length - 1] - ts[0]) / 60000).toFixed(0)}-minute sitting, `
  + `median ${((ts[ts.length - 1] - ts[0]) / 1000 / (ts.length - 1)).toFixed(1)} s per plan\n`);

console.log('  FEATURE                    AUC     p      good      meh       bad     rho(ordinal)');
for (const s of stat) {
  const flag = s.k.startsWith('__') ? '  ← planted null' : (Math.abs(s.auc - 0.5) > fam95 ? '  ← clears family null' : '');
  console.log(`  ${s.k.padEnd(24)} ${f3(s.auc)}  ${s.p.toFixed(3)}  ${f3(s.gm).padStart(8)} `
    + `${f3(s.mm).padStart(8)} ${f3(s.bm).padStart(8)}   ${f3(s.rho).padStart(6)}${flag}`);
}

// --- the top feature, and the flat-plan detector, as raw contingency tables --------------------
function contingency(k) {
  const vals = [...new Set(data.map((d) => d.f[k]))].sort((a, b) => a - b);
  console.log(`\n  ${k} × verdict (all ${data.length} rows, hand-edited included and marked):`);
  console.log('    value ' + vals.map((v) => String(v).padStart(7)).join(''));
  for (const v of ['good', 'meh', 'bad']) {
    console.log(`    ${v.padEnd(6)}` + vals.map((x) => String(data.filter((d) => d.verdict === v && d.f[k] === x).length).padStart(7)).join(''));
  }
}
contingency('hopsToExit');
contingency('digsToExit');
contingency('depth');

/**
 * 🎯 THE SECOND CONTRAST, AND IT IS NOT AN AFTERTHOUGHT. The good-vs-bad axis is not the only
 * axis in a three-way verdict. The `depth` table above is plainly NON-MONOTONIC — his MEH pile
 * sits at depth 2 while GOOD and BAD are both mostly depth 3 — which no good-vs-bad statistic can
 * see. So the whole sweep is re-run on MEH vs (GOOD + BAD), with its own family-wise shuffle.
 * `house-packing.md` §7.1 predicts flat plans are the WORST failure; if they are instead the
 * FORGETTABLE one, that is a different fix and a different scoring term.
 */
{
  const isMeh = (d) => d.verdict === 'meh';
  const A = gen.filter(isMeh), Bq = gen.filter((d) => !isMeh(d));
  const st2 = COLS.map((k) => ({ k, auc: auc(A.map((d) => d.f[k]), Bq.map((d) => d.f[k])) }));
  const rng2 = mulberry32(778899);
  const ys2 = gen.map((d) => d.verdict === 'meh');
  const realBest2 = Math.max(...st2.filter((s) => !s.k.startsWith('__')).map((s) => Math.abs(s.auc - 0.5)));
  const perGE = Object.fromEntries(COLS.map((k) => [k, 0]));
  let fam2 = 0;
  for (let s = 0; s < NSH; s++) {
    const sh = shuffle(ys2, rng2);
    const ai = [], bi = [];
    for (let i = 0; i < sh.length; i++) (sh[i] ? ai : bi).push(i);
    let mx = 0;
    for (const k of COLS) {
      const a = Math.abs(auc(ai.map((i) => gen[i].f[k]), bi.map((i) => gen[i].f[k])) - 0.5);
      if (!k.startsWith('__') && a > mx) mx = a;
      if (a >= Math.abs(st2.find((x) => x.k === k).auc - 0.5) - 1e-12) perGE[k]++;
    }
    if (mx >= realBest2 - 1e-12) fam2++;
  }
  st2.sort((a, b) => Math.abs(b.auc - 0.5) - Math.abs(a.auc - 0.5));
  const famP2 = (fam2 + 1) / (NSH + 1);
  console.log('\n  MEH vs (GOOD+BAD) — the axis a good-vs-bad statistic cannot see. Top 6:');
  for (const s of st2.slice(0, 6)) {
    console.log(`    ${s.k.padEnd(24)} AUC ${f3(s.auc)}  p ${((perGE[s.k] + 1) / (NSH + 1)).toFixed(3)}`
      + (s.k.startsWith('__') ? '  ← planted null' : ''));
  }
  check(true, 'N2b FAMILY-WISE SHUFFLE on the MEH contrast',
    `best ${st2.find((s) => !s.k.startsWith('__')).k} |AUC−0.5| ${realBest2.toFixed(3)} · `
    + `family-wise p = ${famP2.toFixed(4)} ⇒ ${famP2 <= 0.05 ? 'CLEARS the null' : 'DOES NOT clear the null'}`);
}

// ===========================================================================================
// N3 — candidate gates, scored FIRST against the plans they must NOT flag
// ===========================================================================================
console.log('\n  CANDIDATE GATES — false positives on his GOOD plans come first, because that is\n'
  + '  the number that decides whether a gate may ship (HANDOFF: a false positive in a gate is\n'
  + '  worse than the bug it was written for).\n');
const GATES = [
  // genspike's OWN gate, `measure().minWalk` — house-packing.md §7.4, never validated against taste
  ['NOT minWalk (digs<2 AND hops<3)', (f) => !(f.digsToExit >= 2 || f.hopsToExit >= 3)],
  ['hopsToExit ≤ 2', (f) => f.hopsToExit <= 2],
  ['flat: depth ≤ 2', (f) => f.depth <= 2],
  ['shallow: depthMean < 1.8', (f) => f.depthMean < 1.8],
  ['min-walk: digsToExit < 1', (f) => f.digsToExit < 1],
  ['any void', (f) => f.nVoids > 0],
  ['any sliver boundary', (f) => f.sliverEdges > 0],
  ['≥ 2 dead-end rooms', (f) => f.deadEndRooms >= 2],
  ['fragmented: corridorNetworks ≥ 2', (f) => f.corridorNetworks >= 2],
  ['long sightline > 25 m', (f) => f.longestSightline > 25],
  ['zero-dig pocket > 40%', (f) => f.zeroDigPocketFrac > 0.40],
  ['envelope aspect > 2.0', (f) => f.aspect > 2.0],
];
console.log('  GATE                              flags GOOD   flags MEH   flags BAD   verdict');
for (const [name, fn] of GATES) {
  const fg = ALLG.filter((d) => fn(d.f)).length;
  const fm = data.filter((d) => d.verdict === 'meh' && fn(d.f)).length;
  const fb = data.filter((d) => d.verdict === 'bad' && fn(d.f)).length;
  const nb = data.filter((d) => d.verdict === 'bad').length;
  const verdict = fg === 0 && fb > 0 ? 'usable' : fg > fb ? 'INVERTED — flags more good than bad' : 'unusable at n=40';
  console.log(`  ${name.padEnd(32)} ${String(fg).padStart(6)}/${ALLG.length}  ${String(fm).padStart(8)}   `
    + `${String(fb).padStart(8)}/${nb}   ${verdict}`);
}

/**
 * 🎯 WHAT WOULD MORE LABELS BUY? — the number Task 3 needs, and it is measurable rather than
 * guessable. This is a BOOTSTRAP POWER CURVE for ONE PRE-REGISTERED feature (`hopsToExit`,
 * one-tailed), at John's own 15:12:12 good/meh/bad mix, at the effect size his 40 labels actually
 * show. Read it as "if his taste really is this, how often would a fresh batch of N labels prove
 * it" — NOT as a promise about a critic with several free parameters, which pays a multiplicity
 * cost on top (the family-wise critical value below is the size of that cost at n = 27).
 *
 * ⚠️ It bootstraps the OBSERVED distribution, so it inherits every bias in these 40 rows. If his
 * verdicts track the route because the tool DRAWS the route, this curve says how fast that would
 * be confirmed, not whether it is taste.
 */
{
  const K = 'hopsToExit';
  const gv = G.map((d) => d.f[K]), bv = B.map((d) => d.f[K]);
  const prng = mulberry32(31337);
  const draw = (pool, k) => Array.from({ length: k }, () => pool[Math.floor(prng() * pool.length)]);
  console.log(`\n  POWER — bootstrap on ${K} at the observed effect (AUC ${f3(bestReal.auc)}),`
    + ' one pre-registered feature, one-tailed α = 0.05:');
  console.log('    labels   good/bad   critical AUC   power');
  let crit27 = NaN;
  for (const N of [27, 40, 60, 80, 120, 200]) {
    const ng = Math.max(3, Math.round(N * 15 / 39)), nb = Math.max(3, Math.round(N * 12 / 39));
    // permutation critical value at this n, from a representative pooled column
    const pool = [...gv, ...bv];
    const crit = [];
    for (let i = 0; i < 2000; i++) {
      const s = draw(pool, ng + nb);
      crit.push(auc(s.slice(0, ng), s.slice(ng)));
    }
    crit.sort((a, b) => a - b);
    const c95 = crit[Math.floor(0.95 * crit.length)];
    if (N === 27) crit27 = c95;
    let hit = 0;
    for (let i = 0; i < 1000; i++) if (auc(draw(gv, ng), draw(bv, nb)) > c95) hit++;
    console.log(`    ${String(N).padStart(6)}   ${String(ng).padStart(4)}/${String(nb).padEnd(4)}  `
      + `${f3(c95).padStart(12)}   ${(100 * hit / 1000).toFixed(0)}%`);
  }
  console.log(`    MULTIPLICITY COST at n = 27: ONE pre-registered feature needs AUC > `
    + `${f3(crit27)}; letting the critic pick the best of all ${realFeats.length} raises the bar to `
    + `${f3(0.5 + fam95)}. The observed ${f3(bestReal.auc)} clears both, but only just — which is `
    + 'why the next batch must PRE-REGISTER the feature instead of re-searching for it.');
}

console.log('\n  CONTROLS');
for (const l of out) console.log('  ' + l);
console.log(`\n  ${fails === 0 ? 'ALL CONTROLS GREEN' : `🚨 ${fails} CONTROL(S) RED — do not believe the numbers above`}`);
console.log(`  HEADLINE: ${beatsFamily
  ? `${bestReal.k} clears the family-wise shuffle null (AUC ${f3(bestReal.auc)}).`
  : `NO feature clears the family-wise shuffle null. The ranked table above is what 28 features `
    + `on ${G.length} vs ${B.length} rows looks like when nothing is there.`}\n`);
process.exit(fails === 0 ? 0 : 1);
