#!/usr/bin/env node
/**
 * 🎬 **director-cut — THE EDIT IS NOT AN ORACLE, AND NOTHING THAT MATTERS HAPPENS OFF-SCREEN.**
 *
 *   node harness/director-cut.mjs
 *
 * Under D1 six of eight players experience the mode entirely through the broadcast, so the
 * Director is the primary interface. Two properties carry it, and neither can be left to care:
 *
 *   **B1 — rank 4 is never off-screen.** `terminal`, `cam_unlock`, `grab`, `taken`,
 *   `task_result`. The audience arguing about a round they did not see is the failure mode.
 *
 *   **B2 — the Director cannot see alignment.** If cutaway frequency correlates with who is
 *   evil, the edit becomes a truth channel and **P1 dies**. B2 walks the import graph
 *   transitively so the invariant is structural; B2b runs a chi-square over airtime by
 *   alignment so a leak through a side channel still shows up as a number.
 *
 * ⚠️ B3's CADENCE IS MEASURED AND REPORTED. Cuts per minute is a function of how dense the
 * event bus is, which nothing has measured on a real expedition yet — so B3 reports the curve
 * against event density and asserts only what is defensible today.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createDirector, SHOTS, RANK, rankOf, MIN_HOLD, MAX_HOLD, LIVE_RANK, poolFor } from '../src/party/director.js';

let pass = 0, fail = 0;
const t = (n, c, d = '') => { if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); } else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); } return c; };

const LIVE = SHOTS.filter((s) => s.live).map((s) => s.id);
const RANK4 = ['terminal', 'cam_unlock', 'grab', 'taken', 'task_result'];
const ALL_KINDS = ['place', 'blow', 'noise', 'progress', 'hunter_alert', 'hunter_commit', 'channel_open', ...RANK4];

/** A synthetic expedition: `n` events over `secs`, deterministic. */
function expedition({ seed = 1, secs = 90, perMin = 20, subjects = ['p1', 'p2'], cams = 2 } = {}) {
  let a = (seed * 2654435761) >>> 0;
  const rand = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
  const d = createDirector({ world: { camerasUnlocked: cams, cutawayBudget: 3 } });
  const n = Math.round((perMin * secs) / 60);
  let time = 0;
  const fed = [];
  for (let i = 0; i < n; i++) {
    time += secs / n;
    const kind = rand() < 0.12 ? RANK4[Math.floor(rand() * RANK4.length)] : ALL_KINDS[Math.floor(rand() * 7)];
    const e = {
      t: time, kind, subjectId: subjects[Math.floor(rand() * subjects.length)],
      camerasUnlocked: cams,
      world: { subjectInStaticFrustum: rand() < 0.6, hunterInStaticFrustum: rand() < 0.3, subjectWorking: rand() < 0.25, cutawayBudget: 3, concurrentRank2Rooms: rand() < 0.2 ? 2 : 1 },
    };
    fed.push(e);
    d.feed(e);
    d.tick(time);
  }
  d.end(time + 0.5);
  return { d, fed, secs };
}

// ---------------------------------------------------------------- B0 · the arm
{
  const { d } = expedition({ seed: 3 });
  const kinds = new Set(d.cuts().map((c) => c.kind));
  t('B0 arm · a synthetic expedition produces a varied edit',
    d.cuts().length > 10 && kinds.size >= 5 && new Set(d.cuts().map((c) => c.shotId)).size >= 3,
    `${d.cuts().length} shots · ${new Set(d.cuts().map((c) => c.shotId)).size} distinct`);
}

// ---------------------------------------------------------------- B1 · rank 4 never off-screen
{
  let bad = null, seen = 0;
  for (let s = 0; s < 200 && !bad; s++) {
    const { d } = expedition({ seed: s });
    for (const c of d.cuts()) {
      if (c.rank < 4) continue;
      seen++;
      if (!LIVE.includes(c.shotId)) bad = `${c.kind} aired on ${c.shotId}, which cannot show the mansion`;
    }
  }
  t('B1 · every rank-4 event airs on a shot that can show it', bad === null,
    bad || `${seen} rank-4 events across 200 expeditions, all on ${LIVE.join('/')}`);

  // and the structural half: the pool is filtered before scoring, at every rank
  const seamOnly = poolFor(4, { camerasUnlocked: 0, cutawayBudget: 3, deadAir: 9 }).map((s) => s.id);
  t('B1b · at rank 4 the seam fillers are not even candidates',
    seamOnly.every((id) => LIVE.includes(id)), `pool with no cameras: ${seamOnly.join('/') || '(empty)'}`);
}

// ---------------------------------------------------------------- B2 · alignment is out of scope
{
  /** Walk the import graph transitively from director.js. */
  const seenFiles = new Set();
  const walk = (file) => {
    if (seenFiles.has(file)) return;
    seenFiles.add(file);
    let src;
    try { src = readFileSync(file, 'utf8'); } catch { return; }
    for (const m of src.matchAll(/^\s*import\s+[^'"]*['"](\.[^'"]+)['"]/gm)) {
      walk(resolve(dirname(file), m[1]));
    }
  };
  const root = resolve('src/party/director.js');
  walk(root);

  const tainted = [...seenFiles].filter((f) => {
    if (f === root) return false;
    const src = readFileSync(f, 'utf8');
    return /\balignment\b|\bEVIL\b|dealCast|viewFor/.test(src);
  });
  t('B2 · no module reachable from the Director knows an alignment', tainted.length === 0,
    tainted.length ? tainted.map((f) => f.split('/').slice(-2).join('/')).join(', ')
      : `${seenFiles.size} file(s) in the graph — the Director imports nothing at all`);

  // ⚠️ STRIP COMMENTS PROPERLY BEFORE SCANNING FOR CODE. The first draft used a naive regex,
  // matched the word "alignment" in the header comment that EXPLAINS the invariant, and failed
  // the file for documenting itself. A scanner that cannot tell code from prose reports the
  // careful files and misses the careless ones.
  const code = readFileSync(root, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  t('B2b · and no alignment identifier appears anywhere in the Director\'s CODE',
    !/\balignment\b|\bisEvil\b|\bEVIL\b|\bteam\b/.test(code),
    'the event struct carries kind, subject, room and position — nothing else');
}

// ---------------------------------------------------------------- B2c · airtime is uncorrelated
{
  // Alignment is assigned OUTSIDE the Director, which cannot see it. If airtime correlated with
  // it, something would be leaking through a side channel. Chi-square at p=0.001, df=1.
  const evil = new Set(['p2']);
  let evilTime = 0, goodTime = 0;
  for (let s = 0; s < 400; s++) {
    const { d } = expedition({ seed: s, subjects: ['p1', 'p2'] });
    for (const [id, secs] of d.airtime()) (evil.has(id) ? (evilTime += secs) : (goodTime += secs));
  }
  const total = evilTime + goodTime, exp = total / 2;
  const chi2 = ((evilTime - exp) ** 2) / exp + ((goodTime - exp) ** 2) / exp;
  t('B2c · airtime does not correlate with alignment', chi2 < 10.83,
    `chi2=${chi2.toFixed(2)} < 10.83 (df=1, p=0.001) · evil ${evilTime.toFixed(0)}s vs good ${goodTime.toFixed(0)}s over 400 expeditions`);
}

// ---------------------------------------------------------------- B3 · cadence
{
  console.log('       events/min │ cuts/min │ median shot');
  const rows = [10, 15, 20, 25, 30].map((perMin) => {
    let cpm = 0, med = 0, n = 0;
    for (let s = 0; s < 40; s++) {
      const { d } = expedition({ seed: s, perMin });
      const c = d.cadence();
      cpm += c.cutsPerMin; med += c.median; n++;
    }
    return { perMin, cpm: cpm / n, med: med / n };
  });
  for (const r of rows) console.log(`       ${String(r.perMin).padStart(10)} │ ${r.cpm.toFixed(1).padStart(8)} │ ${r.med.toFixed(2)}s`);

  const inBand = rows.filter((r) => r.cpm >= 12 && r.cpm <= 22);
  t('B3 · there is an event density that produces television rather than a security monitor',
    inBand.length > 0,
    inBand.length ? `12-22 cuts/min at ${inBand.map((r) => r.perMin).join('/')} events/min — the bus must be tuned to that`
      : 'no density in 10-30 events/min lands in the 12-22 band');
  t('B3b · and no density produces a locked shot', rows.every((r) => r.cpm > 6),
    `slowest ${rows[0].cpm.toFixed(1)} cuts/min at ${rows[0].perMin} events/min`);
}

// ---------------------------------------------------------------- B4 · the flyover is not a shot
{
  t('B4 · there is no flyover shot in the library, by name',
    !SHOTS.some((s) => /fly|map|overhead|top/i.test(s.id)),
    `${SHOTS.map((s) => s.id).join(' ')} — party-loop.md puts the guide's map under "Do not"`);
}

// ---------------------------------------------------------------- B5 · MIN_HOLD
{
  let bad = null;
  for (let s = 0; s < 100 && !bad; s++) {
    const { d } = expedition({ seed: s + 500 });
    const cuts = d.cuts();
    for (let i = 0; i < cuts.length - 1; i++) {
      const c = cuts[i], next = cuts[i + 1];
      if (c.dur + 1e-9 < MIN_HOLD && next.rank <= c.rank) {
        bad = `${c.shotId} held ${c.dur.toFixed(2)}s then yielded to equal-or-lower rank ${next.rank}`;
      }
    }
  }
  t('B5 · a shot is never cut short except by a higher rank', bad === null,
    bad || `MIN_HOLD ${MIN_HOLD}s respected across 100 expeditions`);
}

// ---------------------------------------------------------------- B6 · the controls
{
  // (1) let seam fillers serve rank 4 — B1 must go red
  const leaky = SHOTS.filter((s) => s.needs({ camerasUnlocked: 0, cutawayBudget: 3, deadAir: 9 }));
  t('B6a control · without the live filter a rank-4 event could land on a seam filler',
    leaky.some((s) => !s.live), `unfiltered pool includes ${leaky.filter((s) => !s.live).map((s) => s.id).join('/')}`);

  // (2) an alignment-aware director would show a correlation the chi-square catches
  const biased = (() => {
    let evilTime = 0, goodTime = 0;
    for (let s = 0; s < 400; s++) {
      const { d } = expedition({ seed: s, subjects: ['p1', 'p2'] });
      for (const [id, secs] of d.airtime()) (id === 'p2' ? (evilTime += secs * 1.6) : (goodTime += secs));
    }
    const total = evilTime + goodTime, exp = total / 2;
    return ((evilTime - exp) ** 2) / exp + ((goodTime - exp) ** 2) / exp;
  })();
  t('B6b control · a director that favoured evil by 60% would fail B2c', biased >= 10.83,
    `chi2=${biased.toFixed(1)} — the test can see a bias, so its green means something`);

  t('B6c control · rank 4 really is the top of the table',
    Math.max(...Object.values(RANK)) === 4 && RANK4.every((k) => rankOf(k) === 4));
}

console.log(`\ndirector-cut: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
