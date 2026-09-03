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

import { tallyCasting, refuse, seededPick, describeCastTiebreaks, historyFromCastEvents, previewCastTiebreaks, shouldArmCastSend, CAST_BACKSTOP_MS, castLockoutId, deadIdsFromPublic, livingFromPublic } from '../src/party/ballot.js';
import { heldHit, standingTally, tallyVote, NO_ONE } from '../src/party/vote.js';
import { hitHoldReady, EPISODE_ORDER } from '../src/party/phases.js';
import { TICK_ORDER } from '../src/party/win.js';
import { SHOW_BEATS } from '../src/party/show.js';
import { CUE_KINDS } from '../src/party/follow.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

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

// ---------------------------------------------------------------- B9 · TV copy of the existing chain
{
  t('B9 · describeCastTiebreaks names fewer-expeditions → lastEp → seededPick',
    describeCastTiebreaks(['runner:expeditions', 'guide:staleness', 'runner:seeded']).join(' | ')
      === 'Runner: fewer expeditions | Guide: longest since last walk | Runner: seeded pick');
  t('B9b · unknown codes stay off the board — no second system',
    describeCastTiebreaks(['runner:revote', 'guide:coin']).length === 0
      && describeCastTiebreaks([]).length === 0);
}

// ---------------------------------------------------------------- B10 · history from the public log
{
  const { history, lastPair } = historyFromCastEvents([
    { type: 'cast.ballot', data: { episode: 1, runner: 'p1', guide: 'p2', tiebreaks: ['runner:seeded'] } },
    { type: 'cast.pair', data: { runner: 'p1', guide: 'p2' } },
    { type: 'cast.ballot', data: { episode: 2, runner: 'p3', guide: 'p1' } },
  ]);
  t('B10 · historyFromCastEvents counts expeditions once per ballot, not again on cast.pair',
    history.p1.expeditions === 2 && history.p1.lastEp === 2
      && history.p2.expeditions === 1 && history.p2.lastEp === 1
      && lastPair.runner === 'p3' && lastPair.guide === 'p1');
}

// ---------------------------------------------------------------- B11 · preview is tallyCasting
{
  const living = ids(4);
  const ballots = [
    { voter: 'p1', runner: 'p1', guide: 'p4' }, { voter: 'p2', runner: 'p2', guide: 'p4' },
    { voter: 'p3', runner: 'p1', guide: 'p4' }, { voter: 'p4', runner: 'p2', guide: 'p3' },
  ];
  const direct = tallyCasting({ ballots, living, history: flat(living), lastPair: NO_LOCK, ep: 5, matchSeed: 1 });
  const preview = previewCastTiebreaks({ ballots, living, events: [], ep: 5, matchSeed: 1 });
  t('B11 · previewCastTiebreaks is the same chain, not a second resolver',
    JSON.stringify(preview) === JSON.stringify(direct.tiebreaks));
  t('B11b · empty ballots preview nothing — no invented pair',
    previewCastTiebreaks({ ballots: [], living, events: [], ep: 1, matchSeed: 1 }).length === 0);
  t('B11c · a missing world seed does not invent a house pick',
    previewCastTiebreaks({ ballots, living, events: [], ep: 5, matchSeed: null }).length === 0);
}

// ---------------------------------------------------------------- B12 · 3·2·1 arm: all-in or 20s, never the first ballot alone
{
  const living = ids(3);
  const one = [{ voter: 'p1', runner: 'p2', guide: 'p3' }];
  const two = [...one, { voter: 'p2', runner: 'p3', guide: 'p1' }];
  const all = [...two, { voter: 'p3', runner: 'p1', guide: 'p2' }];
  t('B12 · empty never arms — no invented pair',
    shouldArmCastSend({ livingIds: living, votes: [], firstBallotAt: 1, now: 1 + CAST_BACKSTOP_MS }) === false);
  t('B12b · the first ballot does not arm while others are still picking',
    shouldArmCastSend({ livingIds: living, votes: one, firstBallotAt: 1000, now: 1000 }) === false
      && shouldArmCastSend({ livingIds: living, votes: two, firstBallotAt: 1000, now: 5000 }) === false);
  t('B12c · every living phone balloted → arm now',
    shouldArmCastSend({ livingIds: living, votes: all, firstBallotAt: 1000, now: 1000 }) === true);
  t('B12d · ~20s after the first ballot, a partial tally still arms',
    CAST_BACKSTOP_MS === 20000
      && shouldArmCastSend({ livingIds: living, votes: one, firstBallotAt: 1000, now: 1000 + CAST_BACKSTOP_MS }) === true);
  t('B12e · empty at the backstop still refuses — empty-never-invent',
    shouldArmCastSend({ livingIds: living, votes: [], firstBallotAt: 1, now: 1 + CAST_BACKSTOP_MS * 4 }) === false);
}

// ---------------------------------------------------------------- B13 · one-way lock helper matches tallyCasting
{
  t('B13 · lockout is one-way and void below four alive',
    castLockoutId({ runner: 'p1', guide: 'p2' }, 6, 'runner') === 'p1'
      && castLockoutId({ runner: 'p1', guide: 'p2' }, 6, 'guide') === 'p2'
      && castLockoutId({ runner: 'p1', guide: 'p2' }, 3, 'runner') == null
      && castLockoutId({ runner: 'p1', guide: 'p2' }, 6, 'swap') == null);
}

// ---------------------------------------------------------------- B14 · dead phones are not the backstop
{
  /*
   * John, sofa, 29 Aug, episode 2 / N=8. Ada was executed in episode 1. CASTING
   * stuck on "PHONES ARE PICKING" because all eight phones — including Ada —
   * were asked to lock a runner. Living majority / all-living-sent must arm
   * 3·2·1. Ada's empty ballot is not the denominator.
   */
  const seated = ids(8);
  const players = seated.map((id, i) => ({ id, alive: id !== 'p8' }));
  const events = [{ type: 'player.executed', data: { id: 'p8' } }];
  const living = livingFromPublic({ ids: seated, players, events });
  const dead = deadIdsFromPublic({ players, events });
  t('B14 · episode-2 living excludes the executed seat',
    living.length === 7 && !living.includes('p8') && dead.has('p8'));
  t('B14b · events alone still drop them when the frame is stale',
    livingFromPublic({
      ids: seated,
      players: seated.map((id) => ({ id, alive: true })),
      events,
    }).length === 7);
  t('B14c · player.taken is the same door as player.executed',
    livingFromPublic({
      ids: seated,
      players: [],
      events: [{ type: 'player.taken', data: { id: 'p8' } }],
    }).join(',') === living.join(','));
  const seven = living.map((v, i) => ({
    voter: v, runner: living[(i + 1) % 7], guide: living[(i + 2) % 7],
  }));
  t('B14d · 7 living ballots arm 3·2·1 — a dead phone is not required',
    shouldArmCastSend({ livingIds: living, votes: seven, firstBallotAt: 1000, now: 1000 }) === true);
  t('B14e · counting the corpse as living is what stalls "PHONES ARE PICKING"',
    shouldArmCastSend({ livingIds: seated, votes: seven, firstBallotAt: 1000, now: 1000 }) === false);
}

{
  const ROOT = dirname(fileURLToPath(import.meta.url));
  const hostSrc = readFileSync(join(ROOT, '..', 'src/views/party-host.js'), 'utf8').replace(/\r\n/g, '\n');
  const lookSrc = readFileSync(join(ROOT, '..', 'src/party/look.js'), 'utf8').replace(/\r\n/g, '\n');
  t('B15 · a ballot during casting patches vote popups — it does not paint() the run frame',
    /m\.t === 'ballots'/.test(hostSrc)
    && /function paintVotePopups/.test(hostSrc)
    && /ui\.beat === 'casting'/.test(hostSrc)
    && /paintVotePopups\(\)/.test(hostSrc)
    && /paintCastLamps\(\)/.test(hostSrc)
    && !/class="cast-overlay"/.test(hostSrc)
    && !/\.cast-overlay \{[^}]*26%/.test(lookSrc)
    && /data-cast-votes/.test(hostSrc),
    'fade like emotes · no 26% column');
  const hostCode = hostSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const boardFn = hostSrc.slice(hostSrc.indexOf('function castBoard'));
  const boardCode = boardFn.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  t('B17 · CAST9-class READ YOUR CARD / READING / BALLOT IN plate is red',
    !/Read your card/i.test(hostCode)
    && !/'ballot in'/.test(hostCode)
    && !/"ballot in"/.test(hostCode)
    && !/'reading'/.test(boardCode)
    && !/class="cast-overlay"/.test(hostSrc)
    && /function paintVotePopups/.test(hostSrc)
    && /m\.t === 'ballots'/.test(hostSrc)
    && /ui\.beat === 'casting'/.test(hostSrc)
    && /return;/.test(hostSrc.slice(hostSrc.indexOf("if (m.t === 'ballots')"), hostSrc.indexOf("if (m.t === 'ballots')") + 520)),
    'hog plate gone · ballot does not paint()');
}

{
  /*
   * CAST8 Vote→HIT: driver fell:nobody / lynched:null while TV/Reunion said OUT.
   * H379: standing Gus, sent 4, thresh 5 of 5, tally empty. Hold until they agree.
   * Do not invent a SHOW beat. W5 stays gone. 2g1e last vote stays.
   */
  const hostSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src/views/party-host.js'), 'utf8').replace(/\r\n/g, '\n');
  const winSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src/party/win.js'), 'utf8').replace(/\r\n/g, '\n');
  t('B16 · CAST8-class driver no-eviction vs chrome OUT is not a held HIT',
    heldHit({ executed: null }, { executed: 'Ada' }) === null
    && heldHit({ executed: null }, { executed: null })?.hit === false
    && heldHit({ executed: 'Fox' }, { executed: 'Fox' })?.hit === true
    && hitHoldReady({ executed: null }, { executed: 'Eli' }) === false
    && hitHoldReady({ executed: null }, { executed: null }) === true
    && /function airedHit/.test(hostSrc)
    && /whoSub: !held\?\.held \? 'counting'/.test(hostSrc)
    && /airedHit\(client\)/.test(hostSrc),
    'OUT only after held HIT');

  const standing = [{ nominator: 'p1', target: 'gus' }];
  const empty = standingTally({ counts: {} }, standing);
  const piled = standingTally({ counts: { gus: 4 } }, standing);
  t('B16b · empty tally with a living standing pile is red — H379 class',
    empty.gus === 0
    && Object.keys(empty).length === 1
    && piled.gus === 4
    && /standingTally\(result, standingIds\)/.test(hostSrc)
    && /standing\.length && !Object\.keys\(r\.counts/.test(hostSrc),
    'pile always prints a count; empty wire counts are not a HIT');

  const five = ['ada', 'ben', 'cy', 'eli', 'gus'];
  const box = Object.fromEntries(five.map((id, i) => [id, i < 4 ? 'gus' : NO_ONE]));
  const result = tallyVote({ living: five, nominations: standing }, box);
  t('B16c · honour standing names + printed threshold — do not invent a miss',
    result.counts.gus === 4
    && result.threshold === 3
    && result.executed === 'gus'
    && result.counts.gus * 2 > five.length,
    `Gus ${result.counts.gus} of ${five.length} · thresh ${result.threshold} · ${result.executed}`);

  t('B16d · no new SHOW beat or CUE_KIND; W5 stays gone; TICK_ORDER is W1 W3 W2 W4',
    TICK_ORDER.join(' ') === 'W1 W3 W2 W4'
    && !TICK_ORDER.includes('W5')
    && !/fire\('W5'/.test(winSrc)
    && SHOW_BEATS.join(',') === 'lobby,casting,expedition,recap,debrief,reckoning,vote,execution,verdict,reunion'
    && !EPISODE_ORDER.includes('HIT')
    && CUE_KINDS.join(',') === 'intros,run,move,shot,idle,noms,pair,execute,pin',
    `${TICK_ORDER.join(' ')} · ${SHOW_BEATS.length} beats`);
}

console.log(`\ncast-ballot: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
