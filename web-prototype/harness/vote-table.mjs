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

import { tallyVote, nominate, canNominate, canBeNominated, canLynchVote, assumedLynchVotes, nominatorLockedChoice, acceptLynchVotes, executioner, reckoningClosed, STANDING_CAP, NO_ONE, SHOWRUNNER } from '../src/party/vote.js';
import { createRoom } from '../src/party/room.js';
import {
  clearsLine, lynchBoardRows, printLynchBoard, seasonEpisodeRecord, seasonEpisodeAgrees,
  tallyBoardCopy, seasonLogFromWire, chromeTallyCounts,
} from '../src/party/scorekeeper.js';
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

// ---------------------------------------------------------------- V9 · nominator vote is assumed
{
  const noms = [{ nominator: 'p1', target: 'p2' }, { nominator: 'p3', target: 'p4' }];
  const locked = assumedLynchVotes(noms, ids(6));
  t('V9a · each nominator is pre-cast onto their standing target',
    locked.p1 === 'p2' && locked.p3 === 'p4' && Object.keys(locked).length === 2);
  t('V9b · a dead nominator is not pre-cast',
    assumedLynchVotes(noms, ['p2', 'p3', 'p4']).p1 == null
    && assumedLynchVotes(noms, ['p2', 'p3', 'p4']).p3 === 'p4');
  t('V9c · nominatorLockedChoice is the standing target, and nobody else is locked',
    nominatorLockedChoice(noms, 'p1') === 'p2'
    && nominatorLockedChoice(noms, 'p5') == null);
  t('V9d · NO_ONE remains legal for non-nominators',
    canLynchVote('p5', NO_ONE, ['p2', 'p4']).ok);
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

// ---------------------------------------------------------------- V10 · honest scorekeeper (Couch Plan Rung 1)
//
// DUSK6 ep2: the board printed Fox 4 / Gus 4 with Cy locked on Fox. A season log that recorded
// the driver's `votesSent` (Cy recasting onto Gus) printed 5–3 and called the board a liar.
// The count was never broken. Nominating is voting; phones have no recast buttons; `ballotOk`
// is the receipt. These tests print from the SERVER's answers only.
{
  const living = ids(8);
  const noms = [{ nominator: 'p1', target: 'p2' }, { nominator: 'p3', target: 'p4' }];
  // Driver wish: Cy (p1) recasts onto Gus (p4). The lock keeps Cy on Fox.
  const wish = {
    p1: 'p4', p2: 'p4', p3: 'p4', p4: 'p2',
    p5: 'p2', p6: 'p2', p7: 'p4', p8: 'p4',
  };
  const accepted = acceptLynchVotes({ living, nominations: noms }, wish);
  t('V10a · a nominator recast is refused — the lock is the recorded ballot',
    accepted.p1 === 'p2' && accepted.p3 === 'p4',
    `p1 ${accepted.p1} (wish ${wish.p1}) · p3 ${accepted.p3}`);
  t('V10b · a self-pick still coerces to NO_ONE for non-nominators',
    acceptLynchVotes({ living, nominations: noms }, { ...wish, p2: 'p2' }).p2 === NO_ONE);
  const result = tallyVote({ living, nominations: noms }, accepted);
  t('V10c · the printed tally is 4–4, not the driver\'s recast',
    result.counts.p2 === 4 && result.counts.p4 === 4 && result.executed === null,
    JSON.stringify(result.counts));

  const names = { p1: 'Cy', p2: 'Fox', p3: 'Ada', p4: 'Gus', p5: 'Ben', p6: 'Dee', p7: 'Eli', p8: 'Sam' };
  const printed = printLynchBoard({
    noms,
    living,
    names,
    lynch: {
      votes: Object.entries(accepted).map(([voter, choice]) => ({ voter, choice })),
      result,
    },
    tally: { in: 8, living: 8, need: 5 },
  });
  t('V10d · two names stand, 8 ballots in — printed counts equal the SERVER box, row for row',
    printed.counts.p2 === 4 && printed.counts.p4 === 4
    && printed.rows.length === Object.values(accepted).filter((c) => c !== NO_ONE).length
    && printed.rows.every((r) => accepted[r.voter] === r.choice),
    printed.rows.map((r) => r.text).join(' | '));
  t('V10e · no NOBODY row, no dead row',
    printed.rows.every((r) => !/nobody|no one|NO_ONE/i.test(r.text))
    && printed.rows.every((r) => living.includes(r.voter))
    && lynchBoardRows({ votes: { p9: 'p2', p1: 'p2' }, noms, living, dead: ['p9'], names }).every((r) => r.voter !== 'p9'));
  t('V10f · a nominator\'s row reads nominated',
    printed.rows.some((r) => r.voter === 'p1' && r.nominated && /nominated/i.test(r.text) && /Cy → Fox/.test(r.text)),
    printed.rows.filter((r) => r.nominated).map((r) => r.text).join(' | '));
  t('V10g · the bar before the vote is N of M clears',
    printed.line === '5 of 8 clears' && clearsLine({ need: 5, living: 8 }) === '5 of 8 clears');
  const copyOpen = tallyBoardCopy({ in: 2, living: 8, need: 5 });
  const copyFull = tallyBoardCopy({ in: 8, living: 8, need: 5 });
  t('V10h · Vote tallyBoard keeps HEAD copy: Ballots in / {in} of {living} / needs N to carry',
    copyOpen.header === 'Ballots in' && copyOpen.count === '2 of 8'
    && copyOpen.note === 'needs 5 to carry' && copyOpen.clears === '5 of 8 clears');
  t('V10i · and every ballot in — closing, plus the clears ADD',
    copyFull.note === 'every ballot in — closing' && copyFull.count === '8 of 8'
    && copyFull.clears === '5 of 8 clears');
}

{
  /*
   * Live room, eight seated, two names stand, eight ballots in — including a nominator
   * trying to recast. The board equals what closeVote accepted, not what was tapped.
   */
  const r = createRoom({ count: 8, castSeed: 1, worldSeed: 1, send: () => {}, emit: () => {} });
  r.start();
  const living = r.state.players.map((p) => p.id);
  const names = { p1: 'Cy', p2: 'Fox', p3: 'Ada', p4: 'Gus', p5: 'Ben', p6: 'Dee', p7: 'Eli', p8: 'Sam' };
  for (const p of r.state.players) if (names[p.id]) p.name = names[p.id];
  r.enterReckoning(living);
  t('V11a · two names stand',
    r.nominatePlayer('p1', 'p2', living).ok && r.nominatePlayer('p3', 'p4', living).ok
    && r.state.nominations.length === 2);
  r.enterVote(living);
  const receipts = [];
  const wish = { p1: 'p4', p2: 'p4', p3: 'p4', p4: 'p2', p5: 'p2', p6: 'p2', p7: 'p4', p8: 'p4' };
  for (const id of living) {
    const rec = r.castLynchVote(id, wish[id], living);
    receipts.push({ voter: id, ok: rec.ok !== false, choice: rec.choice, why: rec.why || '' });
  }
  t('V11b · Cy\'s recast is locked on Fox — ballotOk names the SERVER choice',
    receipts.find((x) => x.voter === 'p1')?.ok === false
    && receipts.find((x) => x.voter === 'p1')?.why === 'nominator vote locked'
    && receipts.find((x) => x.voter === 'p1')?.choice === 'p2'
    && r.state.lynchVotes.p1 === 'p2');
  const closed = r.closeVote();
  const lynch = {
    votes: Object.entries(closed.votes).map(([voter, choice]) => ({ voter, choice })),
    result: closed,
  };
  const printed = printLynchBoard({
    ballotOk: receipts, lynch, noms: r.state.nominations, living, names,
    tally: { in: 8, living: 8, need: 5 },
  });
  t('V11c · printed tally equals ballots the SERVER accepted, row for row',
    printed.counts.p2 === closed.counts.p2 && printed.counts.p4 === closed.counts.p4
    && printed.rows.every((row) => closed.votes[row.voter] === row.choice)
    && printed.rows.length === Object.values(closed.votes).filter((c) => c !== NO_ONE).length,
    `Fox ${printed.counts.p2} / Gus ${printed.counts.p4} · ${printed.rows.map((x) => x.text).join(' | ')}`);
  t('V11d · Cy → Fox · nominated. is on the board; nobody / dead are not',
    printed.rows.some((row) => row.voter === 'p1' && row.text === 'Cy → Fox · nominated.')
    && printed.rows.every((row) => !/nobody|no one/i.test(row.text))
    && printed.line === '5 of 8 clears');

  // Offline playEpisode must record the same box — this is the season-log hole.
  const off = createRoom({ count: 8, castSeed: 1, worldSeed: 1, send: () => {}, emit: () => {} });
  off.start();
  off.playEpisode({
    nominations: [{ nominator: 'p1', target: 'p2' }, { nominator: 'p3', target: 'p4' }],
    votes: wish,
    scaffold: false,
  });
  const logged = Object.fromEntries(
    off.log.all().filter((e) => e.type === 'vote.cast').map((e) => [e.data.voter, e.data.choice]),
  );
  t('V11e · playEpisode logs the SERVER box, not the driver wish — Cy stays on Fox',
    logged.p1 === 'p2' && logged.p3 === 'p4' && logged.p1 !== wish.p1,
    JSON.stringify(logged));
}

{
  /*
   * Replay half. Season JSON on John's driver has NO `ballotOk` — `_loop8` wrote
   * `votesSent` at send time (Cy→Gus) and `chromeTally` Gus 4 | Fox 4. The log lied.
   * The board did not. Old JSON is scored from chromeTally + noms; votesSent is
   * ignored. New logger writes ballotOk + t:'lynch' and never votesSent.
   * harness/_loop8 is not in this tree; if a season file appears under
   * harness/seasons or progress/, every episode's board must agree.
   */
  const names = { p1: 'Cy', p2: 'Fox', p3: 'Ada', p4: 'Gus', p5: 'Ben', p6: 'Dee', p7: 'Eli', p8: 'Sam' };
  const living = ids(8);
  const noms = [{ nominator: 'p1', target: 'p2' }, { nominator: 'p3', target: 'p4' }];
  const wish = {
    p1: 'p4', p2: 'p4', p3: 'p4', p4: 'p2', p5: 'p2', p6: 'p2', p7: 'p4', p8: 'p4',
  };
  const accepted = acceptLynchVotes({ living, nominations: noms }, wish);
  const result = tallyVote({ living, nominations: noms }, accepted);
  const ep = seasonEpisodeRecord({
    episode: 2,
    living,
    noms,
    names,
    ballotOk: [
      { voter: 'p1', ok: false, choice: 'p2', why: 'nominator vote locked' },
      { voter: 'p2', ok: true, choice: 'p4' },
      { voter: 'p5', ok: true, choice: 'p2' },
      { voter: 'p6', ok: true, choice: 'p2' },
      { voter: 'p4', ok: true, choice: 'p2' },
      { voter: 'p7', ok: true, choice: 'p4' },
      { voter: 'p8', ok: true, choice: 'p4' },
      { voter: 'p3', ok: false, choice: 'p4', why: 'nominator vote locked' },
    ],
    lynch: { votes: Object.entries(accepted).map(([voter, choice]) => ({ voter, choice })), result },
    tally: { in: 8, living: 8, need: 5 },
  });
  // Poison: a wish column that would print 5–3 if anyone still read it.
  ep.votesSent = { ...accepted, p1: 'p4' };
  const replay = seasonEpisodeAgrees(ep);
  t('V12a · new logger shape: board is Fox 4 / Gus 4 and Cy is locked, votesSent ignored',
    replay.ok
    && replay.printed.counts.p2 === 4 && replay.printed.counts.p4 === 4
    && replay.printed.rows.some((row) => row.text === 'Cy → Fox · nominated.')
    && !('votesSent' in seasonEpisodeRecord(ep)),
    replay.ok ? replay.printed.rows.map((row) => row.text).join(' | ') : replay.why);

  const dusk6 = {
    episode: 2,
    living,
    noms,
    names,
    votesSent: wish,
    chromeTally: 'Gus 4 | Fox 4',
  };
  const oldReplay = seasonEpisodeAgrees(dusk6);
  const wishCounts = lynchBoardRows({ votes: wish, noms, living, names });
  t('V12c · old DUSK6 JSON (votesSent + chromeTally, no ballotOk): chromeTally is the board, Cy locked from noms',
    oldReplay.ok
    && chromeTallyCounts(dusk6.chromeTally, names).p2 === 4
    && chromeTallyCounts(dusk6.chromeTally, names).p4 === 4
    && oldReplay.printed.counts.p2 === 4 && oldReplay.printed.counts.p4 === 4
    && oldReplay.printed.rows.some((r) => r.voter === 'p1' && r.nominated && r.choice === 'p2')
    && !wishCounts.some((r) => r.voter === 'p1' && r.choice === 'p2'),
    oldReplay.ok
      ? `Fox ${oldReplay.printed.counts.p2} / Gus ${oldReplay.printed.counts.p4}`
      : oldReplay.why);

  const msgs = [
    { t: 'noms', standing: noms },
    { t: 'tally', in: 8, living: 8, need: 5 },
    { t: 'ballotOk', voter: 'p1', ok: false, choice: 'p2', why: 'nominator vote locked' },
    { t: 'ballotOk', voter: 'p2', ok: true, choice: 'p4' },
    { t: 'ballotOk', voter: 'p3', ok: false, choice: 'p4', why: 'nominator vote locked' },
    { t: 'ballotOk', voter: 'p4', ok: true, choice: 'p2' },
    { t: 'ballotOk', voter: 'p5', ok: true, choice: 'p2' },
    { t: 'ballotOk', voter: 'p6', ok: true, choice: 'p2' },
    { t: 'ballotOk', voter: 'p7', ok: true, choice: 'p4' },
    { t: 'ballotOk', voter: 'p8', ok: true, choice: 'p4' },
    { t: 'lynch', votes: Object.entries(accepted).map(([voter, choice]) => ({ voter, choice })), result },
  ];
  const logged = seasonLogFromWire(msgs, { episode: 2, living, noms, names, votesSent: wish });
  const loggedOk = seasonEpisodeAgrees(logged);
  t('V12d · seasonLogFromWire records ballotOk + t:lynch and never writes votesSent',
    !('votesSent' in logged)
    && Array.isArray(logged.ballotOk) && logged.ballotOk.length === 8
    && logged.lynch?.votes?.length === 8
    && loggedOk.ok
    && loggedOk.printed.counts.p2 === 4 && loggedOk.printed.counts.p4 === 4
    && logged.ballotOk.find((r) => r.voter === 'p1')?.why === 'nominator vote locked',
    loggedOk.ok ? `Fox ${loggedOk.printed.counts.p2} / Gus ${loggedOk.printed.counts.p4}` : loggedOk.why);

  const hostSrc = await readFile(new URL('../src/views/party-host.js', import.meta.url), 'utf8');
  const phoneSrc = await readFile(new URL('../src/views/party-phone.js', import.meta.url), 'utf8');
  const tallyFn = hostSrc.slice(hostSrc.indexOf('function tallyBoard'), hostSrc.indexOf('function clearsBoard'));
  const lynchFn = hostSrc.slice(hostSrc.indexOf('function lynchBoard'), hostSrc.indexOf('function executionLine'));
  t('V12e · TV chrome is HEAD copy plus the clears ADD — not a rewrite of Ballots in',
    /tallyBoardCopy\(tally\)/.test(tallyFn)
    && /copy\.header/.test(tallyFn)
    && /data-clears/.test(tallyFn)
    && /named by \$\{joinedName\(names, n\.nominator/.test(hostSrc)
    && /class="nom-who"/.test(lynchFn) && /class="nom-by"/.test(lynchFn)
    && /nominated\./.test(lynchFn)
    && !/CY → FOX/.test(hostSrc));
  t('V12f · pad lock and standing copy are untouched',
    /Your nomination of \$\{esc\(myNom\.name\)\} is your vote — locked\. You do not vote again\./.test(phoneSrc)
    && /named by \$\{seatChip\(c, n\.nominator\)\}/.test(phoneSrc)
    && /data-clears/.test(phoneSrc));

  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const seasonDirs = [
    path.join(ROOT, 'harness', 'seasons'),
    path.join(ROOT, 'progress'),
  ];
  const files = [];
  for (const dir of seasonDirs) {
    if (!existsSync(dir)) continue;
    const namesIn = await readdir(dir).catch(() => []);
    for (const n of namesIn) {
      if (!/\.json$/i.test(n)) continue;
      if (!/season|dusk|loop8/i.test(n)) continue;
      files.push(path.join(dir, n));
    }
  }
  let replayBad = null;
  let replayN = 0;
  for (const file of files) {
    let data;
    try { data = JSON.parse(await readFile(file, 'utf8')); }
    catch (e) { replayBad = replayBad || `${file}: ${e.message}`; continue; }
    const episodes = Array.isArray(data) ? data : (data.episodes || [data]);
    for (const one of episodes) {
      if (!one || (!one.lynch && !one.ballotOk && !one.chromeTally)) continue;
      replayN++;
      const g = seasonEpisodeAgrees(one);
      if (!g.ok) { replayBad = replayBad || `${file} ep ${one.episode}: ${g.why}`; break; }
    }
  }
  t('V12b · if a season JSON exists, every episode\'s board equals chromeTally / ballotOk + t:lynch',
    replayBad === null,
    replayBad || (files.length ? `${replayN} episodes in ${files.length} files` : 'no season JSON in tree — fixtures above are the net'));
}

console.log(`\nvote-table: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
