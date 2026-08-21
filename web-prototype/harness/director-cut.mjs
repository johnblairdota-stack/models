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

/**
 * A synthetic expedition: `n` events over `secs`, deterministic.
 *
 * ⚠️ **IT IS TICKED ON A CLOCK, NOT ONLY WHEN SOMETHING HAPPENS.** The first version called
 * `tick()` once per event, so at eight events a minute the Director was asked to reconsider every
 * 7.5 seconds and `MAX_HOLD` could not fire between them — the gate could not have seen a locked
 * shot, which is the exact failure the wired build shipped. §1.3 evaluates the score every 0.2 s
 * and the view calls `tick` every frame; this is the slower of the two.
 *
 * ⚠️ AND THE CUTAWAY BUDGET IS §3's FORMULA RATHER THAN A 3. `min(3, ceil(cameras / 2))` at two
 * cameras is ONE, and a fixture that hands out three is a fixture that cannot fail B9.
 */
const TICK = 0.2;
function expedition({ seed = 1, secs = 90, perMin = 20, subjects = ['p1', 'p2'], cams = 2 } = {}) {
  let a = (seed * 2654435761) >>> 0;
  const rand = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
  const budget = Math.min(3, Math.ceil(cams / 2));
  const d = createDirector({ world: { camerasUnlocked: cams, cutawayBudget: budget } });
  const n = Math.round((perMin * secs) / 60);
  let time = 0;
  const fed = [];
  for (let i = 0; i < n; i++) {
    time += secs / n;
    const kind = rand() < 0.12 ? RANK4[Math.floor(rand() * RANK4.length)] : ALL_KINDS[Math.floor(rand() * 7)];
    fed.push({
      t: time, kind, subjectId: subjects[Math.floor(rand() * subjects.length)],
      camerasUnlocked: cams,
      world: { subjectInStaticFrustum: rand() < 0.6, hunterInStaticFrustum: rand() < 0.3, subjectWorking: rand() < 0.25, cutawayBudget: budget, concurrentRank2Rooms: rand() < 0.2 ? 2 : 1 },
    });
  }
  let ei = 0;
  for (let t = 0; t <= secs + 1e-9; t += TICK) {
    while (ei < fed.length && fed[ei].t <= t) d.feed(fed[ei++]);
    d.tick(t);
  }
  d.end(secs + 0.5);
  return { d, fed, secs, budget };
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
/**
 * ⚠️ MEASURED ON THE IMAGE, LIKE THE CADENCE, AND FOR THE SAME REASON. A take that puts the same
 * shot on the same subject back on air changes nothing a person can see, so a zero-second one is
 * not a shot being cut short — it is bookkeeping. Reading `cuts()` here reported a "0.00s BODYCAM"
 * on a screen that had been showing that BODYCAM for six seconds.
 */
{
  let bad = null;
  for (let s = 0; s < 100 && !bad; s++) {
    const { d } = expedition({ seed: s + 500 });
    const segs = d.visibleCuts().filter((v) => v.endedAt !== null);
    for (let i = 0; i < segs.length - 1; i++) {
      const c = segs[i], next = segs[i + 1];
      const rank = (id) => (d.cuts().find((x) => x.shotId === id) || {}).rank ?? 1;
      if (c.dur + 1e-9 < MIN_HOLD && rank(next.shotId) <= rank(c.shotId)) {
        bad = `${c.shotId} was on screen ${c.dur.toFixed(2)}s then yielded to equal-or-lower rank`;
      }
    }
  }
  t('B5 · an image is never cut short except by a higher rank', bad === null,
    bad || `MIN_HOLD ${MIN_HOLD}s respected across 100 expeditions`);
}

// ---------------------------------------------------------------- B7 · a cut is a change of image
/**
 * 🚨 **THE INSTRUMENT WAS COUNTING TAKES AND CALLING THEM CUTS, AND THE TWO WERE OUT BY FOUR.**
 *
 * On a wired 90 s expedition `cadence()` reported 23-25 cuts/min while the picture changed 5.3-6.7
 * times a minute, and one framing was held for **sixty-six to seventy-one seconds** — the target
 * read as met on a television that was a security monitor. Everything below is asserted on the
 * visible record, and B7a is the difference itself: a run of identical takes is ONE image.
 */
{
  // One camera and no cutaway left: BODYCAM is the only shot in the pool, so ten events are ten
  // takes of one image. That is the case `cuts()` counted as ten cuts.
  const d = createDirector({ world: { camerasUnlocked: 0, cutawayBudget: 0 } });
  for (let i = 0; i < 10; i++) d.feed({ t: i * 1.5, kind: 'noise', subjectId: 'p1', camerasUnlocked: 0, world: { cutawayBudget: 0 } });
  d.end(15);
  const takes = d.cuts().length, images = d.visibleCuts().length;
  t('B7a · ten takes of the same shot on the same subject are one image',
    images === 1 && takes >= 8, `${takes} takes recorded · ${images} change(s) of image`);
  t('B7a control · and the old instrument really would have called that ten cuts',
    d.cadence().takes === takes && d.cadence().n <= 1,
    `cadence().takes ${d.cadence().takes} vs cadence().n ${d.cadence().n} — the gap is the bug`);

  // A subject change IS a cut, even on the same shot: different person, different picture.
  const e = createDirector({ world: { camerasUnlocked: 0, cutawayBudget: 0 } });
  e.feed({ t: 0, kind: 'noise', subjectId: 'p1', camerasUnlocked: 0, world: { cutawayBudget: 0 } });
  e.feed({ t: 2, kind: 'noise', subjectId: 'p2', camerasUnlocked: 0, world: { cutawayBudget: 0 } });
  e.end(4);
  t('B7b · and the same shot on a different subject is a cut, because it is a different picture',
    e.visibleCuts().length === 2, e.visibleCuts().map((v) => v.key).join(' → '));
}

// ---------------------------------------------------------------- B8 · nothing is held past MAX_HOLD
/**
 * §1.3: *"`MAX_HOLD = 6.0 s` — a shot with nothing happening must re-solve; a locked wide is
 * unwatchable."* The clock ran from the last TAKE rather than from the last change of image, and
 * takes kept landing, so it never fired.
 */
{
  let worst = 0, worstAt = '';
  for (let s = 0; s < 100; s++) {
    const { d } = expedition({ seed: s + 900, perMin: 8, cams: 3 });
    for (const v of d.visibleCuts()) if (v.endedAt !== null && v.dur > worst) { worst = v.dur; worstAt = `${v.key} seed ${s + 900}`; }
  }
  t('B8 · no image is left on screen past MAX_HOLD when another angle exists',
    worst <= MAX_HOLD + 0.5, `longest hold ${worst.toFixed(2)}s (${worstAt}) against MAX_HOLD ${MAX_HOLD}s`);

  // The one case that is allowed to sit: one unlocked camera IS one angle — §2, "deliberately thin".
  const one = createDirector({ world: { camerasUnlocked: 0, cutawayBudget: 0 } });
  one.feed({ t: 0, kind: 'noise', subjectId: 'p1', camerasUnlocked: 0, world: {} });
  for (let i = 1; i < 100; i++) one.tick(i * 0.2);
  one.end(20);
  t('B8b · with one camera and no cutaway budget it holds rather than cutting to a card',
    one.visibleCuts().length === 1 && one.visibleCuts()[0].shotId === 'BODYCAM',
    `${one.visibleCuts().map((v) => v.key).join(' → ')} across 20 s — §2's "one subject, forever"`);
}

// ---------------------------------------------------------------- B9 · the cutaway budget is spent
/**
 * §3: *"`cutaways = min(3, ceil(cameras / 2))` per expedition, ≤ 12% of round airtime. Over that
 * it stops reading as an edit."* Nothing decremented it, so the re-solve path reached for a card
 * whenever the shot it was leaving carried the repeat-angle penalty: **19-27 seconds of cards in a
 * 90 s expedition, up to 30% of the round.**
 */
{
  const rows = [];
  for (let s = 0; s < 60; s++) {
    const { d } = expedition({ seed: s + 1300, perMin: 12, cams: 2 });
    const segs = d.visibleCuts().filter((v) => v.endedAt !== null);
    const cards = segs.filter((v) => !LIVE.includes(v.shotId));
    rows.push({ n: cards.length, secs: cards.reduce((a, v) => a + v.dur, 0), total: 90 });
  }
  const budget = expedition({ seed: 1, cams: 2 }).budget;
  const overCount = rows.filter((r) => r.n > budget);
  t('B9 · no expedition airs more cutaways than §3 budgets it',
    overCount.length === 0,
    overCount.length ? `${overCount.length}/60 over budget, worst ${Math.max(...rows.map((r) => r.n))}`
      : `≤ ${budget} cutaway(s) at two cameras, across 60 expeditions`);
  const share = Math.max(...rows.map((r) => r.secs / r.total));
  t('B9b · and cards never take more than §3\'s 12% of the round',
    share <= 0.12 + 1e-9, `worst ${(share * 100).toFixed(1)}% of airtime`);
  t('B9 control · the measurement can see card airtime at all, so B9b is not counting zero',
    rows.some((r) => r.n > 0), `${rows.filter((r) => r.n > 0).length}/60 expeditions aired one`);
}

// ---------------------------------------------------------------- B10 · a refused solve re-solves
/**
 * `shots.js`: *"`null` means this shot cannot be solved right now — the arbiter must pick another."*
 * Nothing ever picked another, and the view kept the last pose it was given: 8.6-20.0% of frames
 * were a frozen image.
 */
{
  const d = createDirector({ world: { camerasUnlocked: 3, cutawayBudget: 2 } });
  d.feed({ t: 0, kind: 'hunter_alert', subjectId: 'p1', camerasUnlocked: 3,
    world: { hunterInStaticFrustum: true, subjectInStaticFrustum: true, cutawayBudget: 2 } });
  const before = d.current().shotId;
  d.refuse(1.0);
  const after = d.current().shotId;
  t('B10 · a shot the solver refuses is replaced immediately, MIN_HOLD or not',
    after !== before && LIVE.includes(after), `${before} → ${after} at t=1.0s, before MIN_HOLD ${MIN_HOLD}s`);
  t('B10 control · and it is the refusal that moved it — the same director left alone does not',
    (() => {
      const e = createDirector({ world: { camerasUnlocked: 3, cutawayBudget: 2 } });
      e.feed({ t: 0, kind: 'hunter_alert', subjectId: 'p1', camerasUnlocked: 3,
        world: { hunterInStaticFrustum: true, subjectInStaticFrustum: true, cutawayBudget: 2 } });
      const was = e.current().shotId;
      e.tick(1.0);
      return e.current().shotId === was;
    })(), 'tick at the same instant holds it');
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
