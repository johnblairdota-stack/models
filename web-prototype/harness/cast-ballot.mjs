#!/usr/bin/env node
/**
 * 🗳️ **cast-ballot — CASTING RESOLVES DETERMINISTICALLY, ALWAYS, AND NEVER WAITS ON A HUMAN.**
 *
 *   node harness/cast-ballot.mjs
 *
 * `rrr-social-round.md` §2. A party game that stalls on a tie has stalled eight people in a
 * lounge, so B5 is the assertion that matters: over ten thousand random ballots, at every living
 * count, a pair comes out — every time, with no re-run and no prompt.
 *
 * ⚠️ **B4 ASSERTS A READING OF THE SPEC, NOT THE SPEC'S WORDS.** §2 gives tiebreak 2 as *"fewer
 * rounds since last expedition — i.e. take the staler player"*, and those are opposites: fewer
 * rounds since you went makes you fresher. Tiebreak 1 spreads load ("fewer expeditions"), so
 * tiebreak 2 must too. **The staler player wins.** Recorded here so the next reader finds the
 * decision rather than re-deriving it.
 */

import { tallyCasting, refuse, seededPick } from '../src/party/ballot.js';

let pass = 0, fail = 0;
const t = (n, c, d = '') => { if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); } else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); } return c; };
const ids = (n) => Array.from({ length: n }, (_, i) => `p${i + 1}`);
const flat = (living) => Object.fromEntries(living.map((id) => [id, { expeditions: 0, lastEp: null }]));
const NO_LOCK = { runner: null, guide: null };

// ---------------------------------------------------------------- B0 · the arm
{
  const living = ids(6);
  const r = tallyCasting({
    ballots: [{ voter: 'p1', runner: 'p2', guide: 'p3' }, { voter: 'p2', runner: 'p2', guide: 'p3' }],
    living, history: flat(living), lastPair: NO_LOCK, ep: 2, matchSeed: 1,
  });
  t('B0 arm · a clear ballot produces the obvious pair', r.runner === 'p2' && r.guide === 'p3', `${r.runner}/${r.guide}`);
}

// ---------------------------------------------------------------- B1 · the pair is always valid
{
  let bad = null, n = 0;
  for (let L = 4; L <= 8 && !bad; L++) {
    const living = ids(L);
    for (let s = 0; s < 2000; s++) {
      let a = (s * 2654435761 + L) >>> 0;
      const rand = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
      const ballots = living.map((v) => ({
        voter: v,
        runner: rand() < 0.1 ? null : living[Math.floor(rand() * L)],
        guide: rand() < 0.1 ? null : living[Math.floor(rand() * L)],
      }));
      const r = tallyCasting({ ballots, living, history: flat(living), lastPair: NO_LOCK, ep: 3, matchSeed: s });
      n++;
      if (!r.runner || !r.guide) bad = `L=${L} seed=${s} produced ${r.runner}/${r.guide}`;
      else if (r.runner === r.guide) bad = `L=${L} seed=${s} put one player in both chairs`;
      else if (!living.includes(r.runner) || !living.includes(r.guide)) bad = `L=${L} seed=${s} cast a non-living player`;
    }
  }
  t('B1 · a distinct living pair always comes out, with abstentions and total ties', bad === null,
    bad || `${n.toLocaleString()} random ballots across 5 counts`);
}

// ---------------------------------------------------------------- B2 · topping both takes runner
{
  const living = ids(5);
  const ballots = living.map((v) => ({ voter: v, runner: 'p4', guide: 'p4' }));
  const r = tallyCasting({ ballots, living, history: flat(living), lastPair: NO_LOCK, ep: 2, matchSeed: 3 });
  t('B2 · a player who tops both takes RUNNER, and the guide chair falls through',
    r.runner === 'p4' && r.guide !== 'p4', `${r.runner}/${r.guide}`);
}

// ---------------------------------------------------------------- B3 · rotation lockout
{
  const living = ids(6);
  const ballots = living.map((v) => ({ voter: v, runner: 'p1', guide: 'p2' }));
  const h = flat(living);
  const r = tallyCasting({ ballots, living, history: h, lastPair: { runner: 'p1', guide: 'p2' }, ep: 3, matchSeed: 4 });
  t('B3 · last episode\'s runner cannot run again and last episode\'s guide cannot guide',
    r.runner !== 'p1' && r.guide !== 'p2', `${r.runner}/${r.guide}`);

  const swap = tallyCasting({ ballots: living.map((v) => ({ voter: v, runner: 'p2', guide: 'p1' })), living, history: h, lastPair: { runner: 'p1', guide: 'p2' }, ep: 3, matchSeed: 4 });
  t('B3b · but they may swap chairs', swap.runner === 'p2' && swap.guide === 'p1', `${swap.runner}/${swap.guide}`);
}

// ---------------------------------------------------------------- B4 · the staleness reading
{
  const living = ids(4);
  const ballots = [
    { voter: 'p1', runner: 'p1', guide: 'p4' }, { voter: 'p2', runner: 'p2', guide: 'p4' },
    { voter: 'p3', runner: 'p1', guide: 'p4' }, { voter: 'p4', runner: 'p2', guide: 'p3' },
  ];
  // p1 and p2 tie 2-2 on runner, both with one expedition. p1 last went at ep 1, p2 at ep 4.
  const history = { p1: { expeditions: 1, lastEp: 1 }, p2: { expeditions: 1, lastEp: 4 }, p3: { expeditions: 0, lastEp: null }, p4: { expeditions: 0, lastEp: null } };
  const r = tallyCasting({ ballots, living, history, lastPair: NO_LOCK, ep: 5, matchSeed: 1 });
  t('B4 · the STALER player wins a tie — longest since they last went',
    r.runner === 'p1' && r.tiebreaks.includes('runner:staleness'),
    `p1 last ran ep1, p2 ep4, now ep5 -> ${r.runner}. The spec's "fewer rounds since" reads the other way; see the header`);
}

// ---------------------------------------------------------------- B5 · determinism
{
  const living = ids(7);
  const ballots = living.map((v) => ({ voter: v, runner: null, guide: null }));   // total tie, all abstain
  const a = tallyCasting({ ballots, living, history: flat(living), lastPair: NO_LOCK, ep: 4, matchSeed: 99 });
  const b = tallyCasting({ ballots, living, history: flat(living), lastPair: NO_LOCK, ep: 4, matchSeed: 99 });
  const c = tallyCasting({ ballots, living, history: flat(living), lastPair: NO_LOCK, ep: 4, matchSeed: 100 });
  t('B5 · a total tie still resolves, identically, on the same seed',
    JSON.stringify(a) === JSON.stringify(b) && a.tiebreaks.some((x) => x.endsWith('seeded')), `${a.runner}/${a.guide}`);
  t('B5b · and differently on a different seed', JSON.stringify(a) !== JSON.stringify(c), `${c.runner}/${c.guide}`);
}

// ---------------------------------------------------------------- B6 · the lockout can't deadlock
{
  const living = ids(3);
  const r = tallyCasting({
    ballots: living.map((v) => ({ voter: v, runner: 'p1', guide: 'p2' })),
    living, history: flat(living), lastPair: { runner: 'p1', guide: 'p2' }, ep: 5, matchSeed: 7,
  });
  t('B6 · below four alive the lockout goes void rather than making casting impossible',
    r.lockoutVoid && r.runner && r.guide && r.runner !== r.guide, `${r.runner}/${r.guide} lockoutVoid=${r.lockoutVoid}`);
}

// ---------------------------------------------------------------- B7 · refusal
{
  const living = ids(5);
  const ballots = [
    { voter: 'p1', runner: 'p2', guide: 'p3' }, { voter: 'p2', runner: 'p2', guide: 'p3' },
    { voter: 'p3', runner: 'p2', guide: 'p4' }, { voter: 'p4', runner: 'p5', guide: 'p3' },
    { voter: 'p5', runner: 'p5', guide: 'p4' },
  ];
  const first = tallyCasting({ ballots, living, history: flat(living), lastPair: NO_LOCK, ep: 2, matchSeed: 5 });
  const ref = refuse({ slot: 'runner', refuser: first.runner, ballots, living, history: flat(living), lastPair: NO_LOCK, ep: 2, matchSeed: 5 });
  t('B7 · REFUSE THE CHAIR hands the slot to the runner-up',
    ref.replacement && ref.replacement !== first.runner, `${first.runner} refused -> ${ref.replacement}`);
}

// ---------------------------------------------------------------- B8 · the controls
{
  const living = ids(4);
  const history = { p1: { expeditions: 1, lastEp: 1 }, p2: { expeditions: 1, lastEp: 4 }, p3: { expeditions: 0, lastEp: null }, p4: { expeditions: 0, lastEp: null } };
  const ballots = [
    { voter: 'p1', runner: 'p1', guide: 'p4' }, { voter: 'p2', runner: 'p2', guide: 'p4' },
    { voter: 'p3', runner: 'p1', guide: 'p4' }, { voter: 'p4', runner: 'p2', guide: 'p3' },
  ];
  const fresher = (() => {   // the spec's literal wording: fewer rounds since = fresher wins
    const stale = (id) => (history[id].lastEp == null ? Infinity : 5 - history[id].lastEp);
    return ['p1', 'p2'].sort((a, b) => stale(a) - stale(b))[0];
  })();
  t('B8a control · the two readings of tiebreak 2 genuinely disagree', fresher === 'p2',
    'the literal wording would cast p2; B4 casts p1. A gate that agreed either way would prove nothing');
  t('B8b control · seededPick is stable and spreads', seededPick(1, 'x', ['a', 'b', 'c']) === seededPick(1, 'x', ['a', 'b', 'c'])
    && new Set([0, 1, 2, 3, 4, 5].map((s) => seededPick(s, 'cast', ['a', 'b', 'c']))).size > 1);
}

console.log(`\ncast-ballot: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
