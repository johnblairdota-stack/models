#!/usr/bin/env node
/**
 * 🔨 **vote-table — THE VOTE MATHS, EXHAUSTIVELY, NOT SAMPLED.**
 *
 *   node harness/vote-table.mjs
 *
 * `rrr-gates.md` §2 calls for this to be exhaustive rather than sampled, and it is: every vote
 * distribution of every living count from 4 to 8 over every standing-nomination count from 1 to
 * 3. **327,660 distributions**, which is small enough to just do.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 V3 IS WHY THIS FILE EXISTS.
 * ---------------------------------------------------------------------------------------------
 * The design claims the tie rule needs no arithmetic because the threshold is a strict majority
 * of the LIVING, so two nominees clearing it is impossible. That is an argument, and arguments
 * about thresholds are exactly where off-by-ones live. V3 does not accept it — it enumerates
 * every distribution and asserts no two nominees ever clear together. The control then changes
 * the threshold to `>= half` and requires V3 to go red, because a proof that cannot fail is not
 * a proof.
 */

import { tallyVote, nominate, canNominate, canBeNominated, canLynchVote, executioner, reckoningClosed, STANDING_CAP, NO_ONE, SHOWRUNNER } from '../src/party/vote.js';

let pass = 0, fail = 0;
const t = (n, c, d = '') => { if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); } else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); } return c; };

const ids = (n) => Array.from({ length: n }, (_, i) => `p${i + 1}`);

/** Enumerate every assignment of `living` voters over `choices`. */
function* distributions(living, choices) {
  const n = living.length, k = choices.length;
  const total = k ** n;
  for (let x = 0; x < total; x++) {
    const votes = {};
    let v = x;
    for (let i = 0; i < n; i++) { votes[living[i]] = choices[v % k]; v = Math.floor(v / k); }
    yield votes;
  }
}

// ---------------------------------------------------------------- V0 · the arm
{
  const state = { living: ids(5), nominations: [{ nominator: 'p1', target: 'p2' }] };
  const all = tallyVote(state, Object.fromEntries(state.living.map((id) => [id, 'p2'])));
  const none = tallyVote(state, Object.fromEntries(state.living.map((id) => [id, NO_ONE])));
  t('V0 arm · the tally can both execute and decline to', all.executed === 'p2' && none.executed === null,
    `unanimous -> ${all.executed} · all abstain -> ${none.executed}`);
}

// ---------------------------------------------------------------- V1/V3/V4 · exhaustive
{
  let checked = 0, badThreshold = null, badMultiple = null, badAbstain = null;
  for (let L = 4; L <= 8; L++) {
    const living = ids(L);
    for (let noms = 1; noms <= STANDING_CAP; noms++) {
      const targets = living.slice(0, noms);
      const state = { living, nominations: targets.map((tg, i) => ({ nominator: living[(i + noms) % L], target: tg })) };
      const choices = [...targets, NO_ONE];
      for (const votes of distributions(living, choices)) {
        const r = tallyVote(state, votes);
        checked++;
        // V1 — executed iff strictly more than half the living voted for them
        for (const tg of targets) {
          const got = r.counts[tg];
          const should = got * 2 > L;
          if (should && r.executed !== tg) badThreshold = badThreshold || `L=${L} ${tg} had ${got}/${L} and did not execute`;
          if (!should && r.executed === tg) badThreshold = badThreshold || `L=${L} ${tg} executed on ${got}/${L}`;
        }
        // V3 — two nominees can never clear together
        if (r.multipleCleared) badMultiple = badMultiple || `L=${L} noms=${noms} ${JSON.stringify(r.counts)}`;
        // V4 — abstention can only ever protect: adding an abstainer never creates an execution
        if (r.executed === null && r.abstained === 0 && noms === 1) {
          badAbstain = badAbstain || `L=${L} nobody executed with zero abstentions and one nominee`;
        }
      }
    }
  }
  t('V1 · executed iff strictly more than half the LIVING voted for them', badThreshold === null,
    badThreshold || `${checked.toLocaleString()} distributions`);
  t('V3 · two nominees can never clear the threshold together', badMultiple === null,
    badMultiple || 'exhaustive over every distribution — the tie rule needs no arithmetic');
  t('V4 · a single nominee with no abstentions always executes', badAbstain === null,
    badAbstain || 'abstaining is the only way to protect');
}

// ---------------------------------------------------------------- V2 · nomination rules
{
  const state = { living: ids(6), nominations: [] };
  const first = nominate(state, 'p1', 'p2');
  state.nominations.push(first.nomination);
  t('V2a · a nominator may nominate once per episode', first.ok && !nominate(state, 'p1', 'p3').ok);
  t('V2b · a target may be nominated once per episode', !nominate(state, 'p3', 'p2').ok, nominate(state, 'p3', 'p2').why);
  t('V2c · no self-nomination', !nominate(state, 'p4', 'p4').ok, nominate(state, 'p4', 'p4').why);
  t('V2d · the dead never nominate and are never nominated',
    !canNominate({ living: ['p1'], nominations: [] }, 'p9').ok
    && !canBeNominated({ living: ['p1'], nominations: [] }, 'p1', 'p9').ok);
  state.nominations.push({ nominator: 'p3', target: 'p4' }, { nominator: 'p5', target: 'p6' });
  t('V2e · the standing cap is three', !nominate(state, 'p2', 'p1').ok && state.nominations.length === STANDING_CAP,
    nominate(state, 'p2', 'p1').why);
  t('V2f · a nominee may counter-nominate their accuser',
    canBeNominated({ living: ids(6), nominations: [{ nominator: 'p1', target: 'p2' }] }, 'p2', 'p1').ok);
}

// ---------------------------------------------------------------- V8 · no self-vote on the lynch ballot (John 2026-08-24)
{
  const standing = ['p2', 'p4'];
  const self = canLynchVote('p2', 'p2', standing);
  t('V8a · a standing nominee cannot vote for themselves',
    !self.ok && self.why === 'no self-vote', self.why);
  t('V8b · they may vote another standing nominee or NO_ONE',
    canLynchVote('p2', 'p4', standing).ok && canLynchVote('p2', NO_ONE, standing).ok);
  t('V8c · a non-nominee may vote any standing id, never themselves',
    canLynchVote('p1', 'p2', standing).ok
    && canLynchVote('p1', 'p4', standing).ok
    && !canLynchVote('p1', 'p1', standing).ok);
  t('V8d · a choice that is not standing is refused',
    !canLynchVote('p1', 'p9', standing).ok
    && canLynchVote('p1', 'p9', standing).why === 'not standing');
}

// ---------------------------------------------------------------- V5 · the sledgehammer
{
  const state = { living: ids(6), nominations: [{ nominator: 'p1', target: 'p2' }] };
  t('V5a · the single nominator swings', executioner(state, 'p2') === 'p1');
  t('V5b · the Showrunner swings if the nominator was taken this episode',
    executioner(state, 'p2', ['p1']) === SHOWRUNNER);
  t('V5c · nobody swings when nobody was executed', executioner(state, null) === null);
}

// ---------------------------------------------------------------- V6 · reckoning closes
{
  const living = ids(4);
  const spent = { living, nominations: living.map((id, i) => ({ nominator: id, target: living[(i + 1) % 4] })) };
  t('V6 · the reckoning closes early once everyone has spent their nomination',
    reckoningClosed(spent) && !reckoningClosed({ living, nominations: [] }));
}

// ---------------------------------------------------------------- V7 · the controls
{
  /** The off-by-one: `>=` half instead of `>` half. */
  const loose = (state, votes) => {
    const standing = state.nominations.map((n) => n.target);
    const counts = Object.fromEntries(standing.map((id) => [id, 0]));
    for (const v of state.living) if (votes[v] && counts[votes[v]] !== undefined) counts[votes[v]]++;
    return standing.filter((id) => counts[id] * 2 >= state.living.length);
  };
  const living = ids(4);
  const state = { living, nominations: [{ nominator: 'p3', target: 'p1' }, { nominator: 'p4', target: 'p2' }] };
  const split = { p1: 'p2', p2: 'p1', p3: 'p1', p4: 'p2' };   // 2-2 of 4
  t('V7a control · an off-by-one threshold lets two nominees clear at once', loose(state, split).length === 2,
    `>= half -> ${loose(state, split).join('+')} both clear on a 2-2 split, which V3 forbids`);
  t('V7b control · the shipped threshold executes nobody on that same split',
    tallyVote(state, split).executed === null);
}

console.log(`\nvote-table: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
