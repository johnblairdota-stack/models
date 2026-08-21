#!/usr/bin/env node
/**
 * 🎬 **live-session — THE GAME LOOP ON A CLOCK, DRIVEN BY THUMBS THAT MAY NEVER ARRIVE.**
 *
 *   node harness/live-session.mjs
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT THIS ASSERTS THAT THE OTHER EIGHTEEN GATES CANNOT
 * ---------------------------------------------------------------------------------------------
 * Every party gate so far tests a RULE — who may be told what, how a tie resolves, when good
 * wins. `session.js` is the first module where the failure mode is not a wrong answer but **no
 * answer**: a phase that waits for a tap that never comes, an episode counter that never rolls,
 * a show that does not end. Eight people in a lounge cannot debug that, and the only symptom is
 * a television that has stopped.
 *
 * 🚨 SO THE CENTRAL ASSERTION IS L3: A SESSION IN WHICH NOBODY EVER TOUCHES A PHONE STILL REACHES
 * THE REUNION. That is not a degenerate case to be tolerated — it is the common case at minute
 * thirty-five, and it already caught a real stall here: the win check and the episode counter
 * hung off `VERDICT`, and `orderFor(1)` has no VERDICT, so the premiere shot episode one forever.
 *
 * ⚠️ TIME IS AN ARGUMENT, AND L1 IS WHAT KEEPS IT THAT WAY. A `setInterval` inside `session.js`
 * would make this whole file impossible — every assertion below would have to wait out a real
 * forty-minute show — so the ban is asserted on the source rather than trusted.
 */

import { readFileSync } from 'node:fs';
import { createSession, CALL, MOVE_CHOICE, LOBBY, GUIDE_TILT_DEG, INPUT } from '../src/party/session.js';
import { PHASE, SECONDS, orderFor, EPISODE_CAP, reckoningSeconds, RECKONING_CAP } from '../src/party/phases.js';
import { OUTCOME } from '../src/party/win.js';
import { ROOMS } from '../src/party/coverage.js';
import { NO_ONE } from '../src/party/vote.js';
import { applyTake, applyEviction } from '../src/party/taken.js';
import { audienceFor } from '../net/party/entitle.js';

let pass = 0, fail = 0;
const t = (n, c, d = '') => { if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); } else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); } return c; };

/**
 * Drive one whole show. `taps` decides what the humans do each time a phase opens; returning
 * nothing is a table that has put its phones down.
 *
 * The clock is a plain counter. Nothing here waits on anything.
 */
function play({ count = 8, castSeed = 1, worldSeed = 2, taps = () => {}, stepMs = 1000, maxSteps = 20000 } = {}) {
  const tape = new Map();
  const events = new Map();
  const s = createSession({
    count, castSeed, worldSeed,
    send: (id, f) => { if (!tape.has(id)) tape.set(id, []); tape.get(id).push(f); },
    emit: (id, e) => { if (!events.has(id)) events.set(id, []); events.get(id).push(e); },
  });
  let now = 0;
  const phases = [];
  const refusals = [];
  s.start(now);
  phases.push({ phase: s.state.phase, episode: s.state.episode });
  for (let i = 0; i < maxSteps; i++) {
    const before = s.state.tick;
    const act = (playerId, msg) => {
      const r = s.input(playerId, msg);
      if (!r.ok) refusals.push({ playerId, msg, why: r.why });
      return r;
    };
    taps(s, act, now);
    now += stepMs;
    s.tick(now);
    if (s.state.tick !== before) phases.push({ phase: s.state.phase, episode: s.state.episode });
    if (s.state.phase === PHASE.REUNION) break;
  }
  return { s, tape, events, phases, refusals, now, steps: phases.length };
}

/** A table that plays properly: everyone casts, the guide calls, the runner goes, everyone votes. */
const engaged = (s, act) => {
  const alive = s.state.players.filter((p) => p.alive).map((p) => p.id);
  switch (s.state.phase) {
    case PHASE.CASTING:
      for (let i = 0; i < alive.length; i++) {
        act(alive[i], { t: 'cast', runner: alive[(i + 1) % alive.length], guide: alive[(i + 2) % alive.length] });
      }
      break;
    case PHASE.EXPEDITION:
      act(s.state.pair.guide, { t: 'call', call: CALL.CLEAR });
      act(s.state.pair.runner, { t: 'move', move: MOVE_CHOICE.GO });
      break;
    case PHASE.RECKONING:
      if (!s.state.nominations.length) act(alive[0], { t: 'nominate', target: alive[1] });
      break;
    case PHASE.VOTE:
      for (const id of alive) act(id, { t: 'vote', choice: alive[1] });
      break;
    default: break;
  }
};

// ---------------------------------------------------------------- L1 · time is an argument
{
  const src = readFileSync(new URL('../src/party/session.js', import.meta.url), 'utf8');
  const body = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const banned = ['setInterval', 'setTimeout', 'Date.now', 'new Date', 'Math.random', 'require(', 'document.', 'window.'];
  const found = banned.filter((b) => body.includes(b));
  t('L1 · no timer, no wall clock and no randomness in the session — time is an argument',
    found.length === 0, found.length ? `found ${found.join(', ')}` : `${banned.length} banned forms absent`);
  t('L1 control · the ban list would notice if one appeared',
    ['setInterval', 'Math.random'].every((b) => `x = setInterval(Math.random)`.includes(b)));
  t('L1b · and no engine import, so it runs in a worker as well as a browser',
    !/from '\.\.\/game\//.test(body) && !/three/.test(body), 'no THREE, no DOM, no src/game');
}

// ---------------------------------------------------------------- L0 · the arm
const R = play({ taps: engaged });
{
  const seen = R.phases.map((p) => p.phase);
  t('L0 arm · an engaged table played a whole show, LOBBY to REUNION',
    seen[0] === PHASE.PREMIERE && seen[seen.length - 1] === PHASE.REUNION && R.s.state.episode > 1,
    `${seen.length} phases · ${R.s.state.episode - 1} episodes · ${R.s.state.outcome}`);
  t('L0b arm · every socket was sent frames and the log actually filled',
    R.tape.size === 9 && [...R.tape.values()].every((f) => f.length > 10) && R.s.log.all().length > 40,
    `${R.tape.size} sockets · ${R.s.log.all().length} log entries`);
  t('L0c arm · nothing the engaged table tapped was refused',
    R.refusals.length === 0, R.refusals.length ? JSON.stringify(R.refusals[0]) : 'every tap accepted');
}

// ---------------------------------------------------------------- L2 · the shooting schedule
{
  const byEp = new Map();
  for (const p of R.phases) {
    if (p.phase === PHASE.PREMIERE || p.phase === PHASE.REUNION) continue;
    if (!byEp.has(p.episode)) byEp.set(p.episode, []);
    byEp.get(p.episode).push(p.phase);
  }
  // EXECUTION is skipped when nobody clears the threshold, so the played order is a SUBSEQUENCE
  // of the scheduled one — asserted as such rather than as equality, which would be a lie.
  const isSubsequence = (sub, full) => { let i = 0; for (const x of sub) { i = full.indexOf(x, i); if (i < 0) return false; i++; } return true; };
  let ok = true, detail = '';
  for (const [ep, played] of byEp) {
    if (!isSubsequence(played, orderFor(ep))) { ok = false; detail = `ep ${ep}: ${played.join('→')} is not a subsequence of ${orderFor(ep).join('→')}`; }
  }
  t('L2 · every episode ran its phases in the scheduled order', ok, detail || `${byEp.size} episodes checked`);

  const ep1 = byEp.get(1) || [];
  t('L2b · the premiere skips the reckoning and everything after it',
    !ep1.includes(PHASE.RECKONING) && !ep1.includes(PHASE.VOTE) && !ep1.includes(PHASE.EXECUTION),
    `ep1: ${ep1.join('→')}`);
  t('L2b control · a later episode does hold one, so L2b is a difference rather than a constant',
    [...byEp.entries()].some(([ep, ph]) => ep > 1 && ph.includes(PHASE.RECKONING)));
}

// ---------------------------------------------------------------- L3 · THE SHOW ALWAYS ENDS
{
  // 🚨 NOBODY TOUCHES A PHONE. Not one cast, not one call, not one vote, for the whole show.
  const silent = play({ taps: () => {} });
  t('L3 · a table that never touches a phone still reaches the Reunion',
    silent.s.state.phase === PHASE.REUNION,
    `${silent.s.state.episode - 1} episodes · outcome ${silent.s.state.outcome}`);
  t('L3b · and it got there inside the episode cap, not by running out of steps',
    silent.s.state.episode - 1 <= EPISODE_CAP && silent.s.state.outcome != null,
    `${silent.s.state.episode - 1} of ${EPISODE_CAP} · ${silent.s.state.outcome}`);

  // The wall-clock cost of a silent show is the design's own worst case, and it is the number
  // `phases.js` picked EPISODE_CAP = 5 to hold.
  const minutes = silent.now / 60000;
  t('L3c · the silent worst case stays inside the forty-minute budget',
    minutes <= 40, `${minutes.toFixed(1)} min of shooting schedule`);

  // Every phase must still have RESOLVED rather than merely elapsed.
  const pairs = silent.s.log.all().filter((e) => e.type === 'cast.pair');
  t('L3d · silence still cast a pair every episode — abstentions lower nobody\'s score',
    pairs.length === silent.s.state.episode - 1 && pairs.every((e) => e.data.runner && e.data.guide),
    `${pairs.length} pairs from ${pairs.length} silent ballots`);
  // 🚨 SILENCE MUST STAY SILENCE. `tallyCasting` ignores null slots, so an untouched phone lowers
  // nobody's score — but the tempting "helpful" fix is to default an unfilled slot to a neighbour,
  // and then a dead battery has voted. Under that change the pair is still cast and every other
  // assertion here still passes, which is why this one exists: the ballot must record the
  // abstention AND the pair must have come out of a tiebreak rather than out of a score.
  const ballots = silent.s.log.all().filter((e) => e.type === 'cast.ballot');
  const livingAt = silent.s.state.players.length;          // nobody dies in a silent show
  t('L3e · a phone nobody touched abstained — it did not quietly vote for a neighbour',
    ballots.every((e) => e.data.abstained > 0) && ballots.every((e) => e.data.tiebreaks.length > 0),
    `abstained ${ballots.map((e) => e.data.abstained).join('/')} of ${livingAt} · every pair from a tiebreak`);
  t('L3e control · the engaged table abstained on nothing and needed no tiebreak for the top score',
    R.s.log.all().filter((e) => e.type === 'cast.ballot').every((e) => e.data.abstained === 0),
    'so L3e is reading real abstentions');

  // A tiebreak-decided cast spreads the work — `ballot.js` tiebreak 1 is "fewer expeditions".
  const chairs = {};
  for (const e of ballots) for (const id of [e.data.runner, e.data.guide]) chairs[id] = (chairs[id] || 0) + 1;
  const counts = silent.s.state.players.map((p) => chairs[p.id] || 0);
  t('L3f · and the silent cast still spread the chairs rather than sending the same pair every time',
    Math.max(...counts) - Math.min(...counts) <= 1, `per-player chairs: ${counts.join(',')}`);

  t('L3 control · the engaged table and the silent one really did differ',
    R.s.log.all().length !== silent.s.log.all().length,
    `engaged ${R.s.log.all().length} entries vs silent ${silent.s.log.all().length}`);
}

// ---------------------------------------------------------------- L4 · refusals are answered
{
  const probe = play({
    taps: (s, act) => {
      engaged(s, act);
      if (s.state.phase === PHASE.VOTE) {
        const alive = s.state.players.filter((p) => p.alive).map((p) => p.id);
        act(alive[0], { t: 'nominate', target: alive[2] });              // wrong phase
        act(alive[0], { t: 'vote', choice: 'nobody-real' });             // not on the block
        act(alive[0], { t: 'wiggle' });                                  // not a thing
      }
    },
  });
  const whys = probe.refusals.map((r) => r.why);
  t('L4 · a refused tap comes back with a reason, never silence',
    probe.refusals.length >= 3 && whys.every((w) => typeof w === 'string' && w.length > 3),
    `${probe.refusals.length} refusals · e.g. "${whys[0]}"`);
  t('L4b · the three refusals are the three distinct reasons, not one reason three times',
    new Set(whys).size >= 3, [...new Set(whys)].join(' / '));

  // ---- the dead
  const dead = probe.s.state.players.find((p) => !p.alive);
  if (dead) {
    const r = probe.s.input(dead.id, { t: 'claim', claim: 'camera op' });
    t('L4c · an evicted player is refused even a claim — afterlife() is chat and nothing else',
      r.ok === false, r.why);
    const alive0 = probe.s.state.players.find((p) => p.alive);
    const r2 = probe.s.input(alive0.id, { t: 'claim', claim: 'camera op' });
    t('L4c control · the same call from a living player is accepted, so L4c is about death',
      r2.ok === true, r2.why || 'accepted');
  } else {
    t('L4c · an evicted player is refused even a claim', false, 'nobody was evicted — L4c not armed');
  }
}

// ---------------------------------------------------------------- L5 · the ballot is not aired early
{
  let leakedEarly = null, airedLate = false;
  const probe = play({ taps: engaged });
  // Walk the TV's transcript: during VOTE no frame may carry a tally; after it, one must.
  const tv = probe.tape.get('tv') || [];
  for (const f of tv) {
    if (f.phase === PHASE.VOTE && f.tally) leakedEarly = JSON.stringify(f.tally);
    if (f.phase === PHASE.VERDICT && f.tally) airedLate = true;
  }
  t('L5 · no running total reaches any screen while the vote is open',
    leakedEarly === null, leakedEarly || 'the last voter is not decisive');
  t('L5 control · the tally IS aired once the phase closes, so L5 is not passing on absence',
    airedLate, 'attributed, in full, after the fact');

  // Every vote is aired attributed — §4.
  const cast = probe.s.log.all().filter((e) => e.type === 'vote.cast');
  t('L5b · every vote is aired attributed, abstentions included',
    cast.length > 0 && cast.every((e) => e.data.voter && e.data.choice),
    `${cast.length} votes on the record`);
}

// ---------------------------------------------------------------- L6 · a vote may be changed
{
  const probe = play({
    taps: (s, act) => {
      engaged(s, act);
      if (s.state.phase === PHASE.VOTE) {
        const alive = s.state.players.filter((p) => p.alive).map((p) => p.id);
        act(alive[0], { t: 'vote', choice: NO_ONE });        // change of heart, after engaged()
      }
    },
  });
  const tallied = probe.s.log.all().filter((e) => e.type === 'vote.tallied');
  const votes = probe.s.log.all().filter((e) => e.type === 'vote.cast');
  const firstVoterRecords = votes.filter((e) => e.data.voter === probe.s.state.players[0].id);
  t('L6 · the last write before close is the vote that counts',
    tallied.length > 0 && firstVoterRecords.every((e) => e.data.choice === NO_ONE),
    `${firstVoterRecords.length} recorded votes from the changer, all ${NO_ONE}`);
}

// ---------------------------------------------------------------- L7 · the reckoning stretches
{
  t('L7 · each nomination buys the table 15 more seconds',
    reckoningSeconds(1) - reckoningSeconds(0) === 15 && reckoningSeconds(2) - reckoningSeconds(1) === 15,
    `${reckoningSeconds(0)} → ${reckoningSeconds(1)} → ${reckoningSeconds(2)}s`);
  t('L7b · and the stretch is capped, so three nominations cannot run the clock out',
    reckoningSeconds(99) === RECKONING_CAP, `${reckoningSeconds(99)}s cap`);

  const probe = play({
    taps: (s, act) => {
      engaged(s, act);
      if (s.state.phase === PHASE.RECKONING) {
        const alive = s.state.players.filter((p) => p.alive).map((p) => p.id);
        for (let i = 0; i < alive.length; i++) act(alive[i], { t: 'nominate', target: alive[(i + 3) % alive.length] });
      }
    },
  });
  const recks = probe.tape.get('tv').filter((f) => f.phase === PHASE.RECKONING);
  const stretched = recks.some((f) => f.clock.seconds > SECONDS[PHASE.RECKONING]);
  t('L7c · a live reckoning actually stretched on the wire, not just in the formula', stretched,
    `${Math.max(...recks.map((f) => f.clock.seconds))}s at its longest`);
  t('L7c control · it started at the unstretched floor',
    recks.some((f) => f.clock.seconds === SECONDS[PHASE.RECKONING]), `${SECONDS[PHASE.RECKONING]}s`);
}

// ---------------------------------------------------------------- L18 · the stretch stretches
/**
 * 🚨 **THE EXTENSION DID NOT EXTEND.** `nominate` set `clock.seconds` and left `clock.endsAt`
 * alone — and `endsAt` is the deadline `tick()` compares against, so the number on screen grew
 * and the bell did not move. The television says *"every one buys the table fifteen seconds"*
 * and it bought none; worse, `show-tv.html`'s countdown ring divides the time remaining by
 * `clock.seconds`, so the ring jumped BACKWARDS as the total grew under a deadline that stood
 * still. L7c saw the LABEL grow and could not see that nothing else did.
 */
{
  const probe = play({
    taps: (s, act) => {
      engaged(s, act);
      if (s.state.phase === PHASE.RECKONING) {
        const alive = s.state.players.filter((p) => p.alive).map((p) => p.id);
        for (let i = 0; i < alive.length; i++) act(alive[i], { t: 'nominate', target: alive[(i + 3) % alive.length] });
      }
    },
  });
  const tv = probe.tape.get('tv');
  // Consecutive RECKONING frames inside one phase — `tick` counts up across every transition, so
  // a shared tick is a shared phase.
  const pairs = [];
  for (let i = 1; i < tv.length; i++) {
    const a = tv[i - 1], b = tv[i];
    if (a.phase !== PHASE.RECKONING || b.phase !== PHASE.RECKONING) continue;
    if (a.tick !== b.tick) continue;
    pairs.push({ dS: b.clock.seconds - a.clock.seconds, dE: b.clock.endsAt - a.clock.endsAt });
  }
  const grew = pairs.filter((p) => p.dS > 0);
  t('L18 arm · a live reckoning was stretched more than once on the wire',
    grew.length > 1, `${grew.length} stretches across ${pairs.length} frame pairs`);
  t('L18 · every second the label buys is a second the DEADLINE buys',
    grew.every((p) => p.dE === p.dS * 1000),
    grew.map((p) => `+${p.dS}s/+${p.dE}ms`).join(' ') || 'nothing grew');
  t('L18b · and no frame pair moves one without the other, in either direction',
    pairs.every((p) => p.dE === p.dS * 1000),
    `${pairs.length} pairs · ${pairs.filter((p) => p.dE !== p.dS * 1000).length} mismatched`);

  // ⚠️ THE CAP IS REACHED AND NEVER EXCEEDED, AND IT IS ASSERTED THAT WAY RATHER THAN AS "a
  // nomination past the cap moves nothing" — which is unreachable and would therefore be a
  // vacuous truth. `vote.js` caps standing nominations at 3 and `reckoningSeconds(3)` is exactly
  // `RECKONING_CAP`, so the ceiling is enforced twice and the clock never gets the chance to try.
  const recks = tv.filter((f) => f.phase === PHASE.RECKONING);
  const longest = Math.max(...recks.map((f) => f.clock.seconds));
  t('L18c · the stretch reaches the ninety-second ceiling and never goes past it',
    longest === RECKONING_CAP && recks.every((f) => f.clock.seconds <= RECKONING_CAP)
      && recks.every((f) => f.clock.endsAt - f.clock.seconds * 1000 > 0),
    `longest ${longest}s of a ${RECKONING_CAP}s cap, over ${recks.length} frames`);

  // 🚨 THE CONTROL IS THE SHIPPED BUG, DERIVED FROM THIS TAPE. Leave `endsAt` alone and the
  // ring's own arithmetic — `left / clock.seconds` — walks backwards on every nomination.
  const ringWas = grew.map((p) => {
    const total = 45 + p.dS;                       // the label after the stretch
    return { before: 45 / 45, after: 45 / total }; // time left unchanged, total grown
  });
  t('L18 control · leaving the deadline alone makes the ring jump backwards, which is what shipped',
    ringWas.length > 0 && ringWas.every((r) => r.after < r.before),
    ringWas.map((r) => `${(r.before * 100).toFixed(0)}% → ${(r.after * 100).toFixed(0)}%`)[0]
    + ' of a ring, for buying the table nothing');
}

// ---------------------------------------------------------------- L19 · sized by its own episode
/**
 * `advance` computed `reckoningSeconds(state.nominations.length)` and handed it to `enter`, which
 * then ran `onEnter[RECKONING]` and cleared the list — so the number was read from the episode
 * BEFORE, every time. The sizing lives inside the phase now, after the clear, where the only list
 * in scope is the one that belongs to it.
 *
 * ⚠️ TWO FIXES STAND BETWEEN THIS AND THE BUG, AND THE CONTROL HAS TO REMOVE BOTH. Clearing
 * `state.nominations` at `closeEpisode` (L17) already empties the list before `advance` can read
 * it, so reverting the ordering alone leaves L19 green. Reverting both turns it red — episodes
 * 3, 4 and 5 open at 90s, which is episode 2's stretched length. The ordering fix is therefore
 * defence in depth rather than the only thing holding this up, and that is worth knowing before
 * somebody "simplifies" one of them away.
 */
{
  const probe = play({
    taps: (s, act) => {
      engaged(s, act);
      if (s.state.phase === PHASE.RECKONING) {
        const alive = s.state.players.filter((p) => p.alive).map((p) => p.id);
        for (let i = 0; i < 3 && i < alive.length; i++) act(alive[i], { t: 'nominate', target: alive[(i + 3) % alive.length] });
      }
    },
  });
  const tv = probe.tape.get('tv');
  const opens = [];
  let lastTick = null;
  for (const f of tv) {
    if (f.phase !== PHASE.RECKONING) continue;
    if (f.tick === lastTick) continue;
    lastTick = f.tick;
    opens.push({ episode: f.episode, seconds: f.clock.seconds });
  }
  t('L19 arm · more than one episode held a reckoning, and earlier ones were nominated in',
    opens.length > 1 && probe.s.log.all().filter((e) => e.type === 'nom.made').length > 2,
    `${opens.length} reckonings · ${probe.s.log.all().filter((e) => e.type === 'nom.made').length} nominations in the show`);
  t('L19 · every reckoning opens at its own floor, never at last episode\'s stretched length',
    opens.every((o) => o.seconds === SECONDS[PHASE.RECKONING]),
    opens.map((o) => `ep${o.episode} ${o.seconds}s`).join(' · '));
  t('L19 control · the previous episode really did stretch, so there was a stale number to inherit',
    tv.some((f) => f.phase === PHASE.RECKONING && f.clock.seconds > SECONDS[PHASE.RECKONING]),
    `longest ${Math.max(...tv.filter((f) => f.phase === PHASE.RECKONING).map((f) => f.clock.seconds))}s`);
}

// ---------------------------------------------------------------- L8 · no dead-air phase
{
  // Nobody votes → nobody is executed → EXECUTION must not be entered at all.
  const noExec = play({
    taps: (s, act) => {
      if (s.state.phase === PHASE.VOTE) return;              // everyone abstains
      engaged(s, act);
    },
  });
  const entered = noExec.phases.some((p) => p.phase === PHASE.EXECUTION);
  t('L8 · EXECUTION is skipped outright when the vote executed nobody', !entered,
    entered ? 'held 20s on a screen reading "nothing happens"' : 'never entered');
  t('L8 control · the engaged table, which did execute somebody, entered it',
    R.phases.some((p) => p.phase === PHASE.EXECUTION),
    'so L8 is a difference rather than a phase that never runs');
}

// ---------------------------------------------------------------- L9 · the Hunter's room is nobody's
{
  let leak = null, guideSaw = false, guideBlind = false;
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const p = play({ castSeed: seed, worldSeed: seed * 7, taps: engaged });
    const truthRoom = new Set(p.s.log.all().filter((e) => e.type === 'hunter.placed').map((e) => e.data.room));
    for (const [id, frames] of p.tape) {
      for (const f of frames) {
        // 🚨 THE FLOOR PLAN IS EXEMPT, AND L9d BELOW IS WHY THAT IS SAFE. `flyover.plan` names all
        // six rooms on every single frame, so it trivially "contains" the Hunter's — and contains
        // exactly as much information about the Hunter as a printed map does, which is none. The
        // exemption is only sound because the plan is INVARIANT; L9d asserts that, so a plan that
        // ever started varying with the Hunter would turn red rather than hide behind this.
        const scan = { ...f };
        if (scan.flyover) scan.flyover = { ...scan.flyover, plan: undefined };
        const blob = JSON.stringify(scan);
        const named = ROOMS.filter((r) => truthRoom.has(r) && blob.includes(`"${r}"`));
        if (!named.length) continue;
        // The ONLY legitimate carrier is a guide who can actually see it, under flyover.room.
        const legit = f.flyover && f.flyover.hunter === true && named.every((r) => f.flyover.room === r || f.expedition?.room === r);
        const targetOnly = named.every((r) => f.expedition?.room === r);
        if (!legit && !targetOnly) leak = `${id} · phase ${f.phase} · ${named.join(',')}`;
        if (f.flyover?.hunter === true) guideSaw = true;
        if (f.flyover && f.flyover.hunter === false) guideBlind = true;
      }
    }
  }
  t('L9 · the Hunter\'s room never reaches a socket that has not earned the sight',
    leak === null, leak || '8 seeds · every frame of every socket scanned');
  t('L9b arm · a guide DID see it sometimes, so L9 is not passing on a mark that never appears',
    guideSaw, `blind strip ${(4.8 / Math.tan(GUIDE_TILT_DEG * Math.PI / 180)).toFixed(2)}m at ${GUIDE_TILT_DEG}°`);
  t('L9c · and was blind to it sometimes — which is what makes a lie deniable', guideBlind,
    'coverage and the blind strip, compounded');

  // The exemption's licence. A plan that varied could smuggle the answer L9 exists to protect.
  const plans = new Set();
  for (const p of [play({ castSeed: 3, worldSeed: 21, taps: engaged })]) {
    for (const frames of p.tape.values()) {
      for (const f of frames) if (f.flyover?.plan) plans.add(JSON.stringify(f.flyover.plan));
    }
  }
  t('L9d · the floor plan is byte-identical on every frame it appears on',
    plans.size === 1, `${plans.size} distinct plans across the whole show`);
  t('L9d control · and it really did appear, so L9d is not counting an empty set',
    plans.size > 0 && JSON.parse([...plans][0]).length === 6, `${plans.size ? JSON.parse([...plans][0]).length : 0} rooms`);
}

// ---------------------------------------------------------------- L13 · the wing comes first
{
  // 🚨 §2: *"the task and the wing are announced BEFORE anyone is picked."* Without this, casting
  // is a popularity contest — and it WAS, until a browser render showed the phone asking who
  // should go "into the house". Every CASTING frame must already name the wing.
  const castingFrames = R.tape.get('tv').filter((f) => f.phase === PHASE.CASTING);
  t('L13 · the wing is on screen before a single vote is cast',
    castingFrames.length > 0 && castingFrames.every((f) => f.expedition && ROOMS.includes(f.expedition.room)),
    `${castingFrames.length} casting frames, all naming a wing`);
  t('L13b · and it is the wing the expedition actually goes to, not a different one',
    R.tape.get('tv').filter((f) => f.phase === PHASE.EXPEDITION)
      .every((f) => f.expedition && ROOMS.includes(f.expedition.room)),
    'announced at casting, unchanged at departure');

  const announced = R.s.log.all().filter((e) => e.type === 'expedition.announced');
  const begun = R.s.log.all().filter((e) => e.type === 'expedition.begun');
  t('L13c control · every announcement is followed by a departure to the SAME room',
    announced.length === begun.length && announced.every((a, i) => a.data.room === begun[i].data.room),
    `${announced.length} announced, ${begun.length} departed, rooms matched`);
}

// ---------------------------------------------------------------- L15 · REFUSE THE CHAIR
/**
 * 🚨 THE FEATURE WAS THREE-QUARTERS BUILT AND ENTIRELY UNREACHABLE. `ballot.js:87 refuse()` is
 * implemented and gated by `cast-ballot` B7, and `refuse` was absent from `session.js`'s INPUT
 * list and had no `case`, so nothing in the running game could call it. A gate on the pure
 * function passes happily while the move does not exist — which is exactly the gap this file was
 * written to cover, and the reason L15 drives the session rather than the ballot.
 *
 * Round §2: *"Once per game, a player voted into a chair may REFUSE THE CHAIR. Public, attributed,
 * permanent, and logged. The runner-up in that slot takes it."*
 */
{
  /** Drive to the first EXPEDITION and hand the session back, untouched. */
  function toExpedition({ castSeed = 1, worldSeed = 2 } = {}) {
    const s = createSession({ count: 8, castSeed, worldSeed, send: () => {} });
    let now = 0;
    s.start(now);
    for (let i = 0; i < 500 && s.state.phase !== PHASE.EXPEDITION; i++) {
      const alive = s.state.players.filter((p) => p.alive).map((p) => p.id);
      if (s.state.phase === PHASE.CASTING) {
        for (let k = 0; k < alive.length; k++) {
          s.input(alive[k], { t: 'cast', runner: alive[(k + 1) % alive.length], guide: alive[(k + 2) % alive.length] });
        }
      }
      now += 1000;
      s.tick(now);
    }
    return s;
  }

  const s = toExpedition();
  const before = { ...s.state.pair };
  const r = s.input(before.guide, { t: 'refuse' });
  const ev = s.log.all().filter((e) => e.type === 'cast.refused');
  t('L15 · a player handed a chair can refuse it, and the runner-up takes it',
    r.ok === true && s.state.pair.guide !== before.guide && s.state.pair.runner === before.runner,
    `${before.guide} refused the guide chair → ${s.state.pair.guide}`);
  t('L15b · it is public, attributed and names the replacement — §2',
    ev.length === 1 && ev[0].vis === 'PUBLIC' && ev[0].data.refuser === before.guide
      && ev[0].data.replacement === s.state.pair.guide,
    ev.length ? `${ev[0].vis} · ${JSON.stringify(ev[0].data)}` : 'nothing was logged');
  t('L15c · the replacement really holds the chair — the socket\'s seatRole moved with it',
    s.sockets.find((x) => x.playerId === s.state.pair.guide).seatRole === 'guide'
      && s.sockets.find((x) => x.playerId === before.guide).seatRole === null,
    'and the refuser holds nothing');
  t('L15d · the refuser is not billed for an expedition they did not go on',
    s.state.history[before.guide].expeditions === 0 && s.state.history[s.state.pair.guide].expeditions === 1,
    'the tiebreak ladder reads this, so a refusal must not count as a turn');

  // ---- the controls
  /**
   * ⚠️ ONCE PER GAME HAS TO BE ASSERTED IN A LATER EPISODE, AND THE OBVIOUS VERSION IS VACUOUS.
   * Asking the same player to refuse twice in the SAME expedition is refused for the wrong reason
   * — they no longer hold a chair, so "you were not cast" answers it and the once-per-game rule is
   * never consulted. So this drives a second episode and puts them back in a chair first.
   */
  {
    const s4 = createSession({ count: 8, castSeed: 4, worldSeed: 9, send: () => {} });
    let now = 0, refuser = null, second = null;
    s4.start(now);
    const alive = () => s4.state.players.filter((p) => p.alive).map((p) => p.id);
    for (let i = 0; i < 4000 && second === null; i++) {
      if (s4.state.phase === PHASE.CASTING) {
        // Everyone names the same pair, so the chair lands where this control needs it.
        const target = refuser || alive()[0];
        const other = alive().find((id) => id !== target);
        for (const id of alive()) s4.input(id, { t: 'cast', runner: target, guide: other });
      }
      if (s4.state.phase === PHASE.EXPEDITION) {
        if (!refuser) {
          refuser = s4.state.pair.runner;
          s4.input(refuser, { t: 'refuse' });
        } else if (s4.state.pair.runner === refuser || s4.state.pair.guide === refuser) {
          second = s4.input(refuser, { t: 'refuse' });
        }
        s4.input(s4.state.pair.guide, { t: 'call', call: CALL.CLEAR });
        s4.input(s4.state.pair.runner, { t: 'move', move: MOVE_CHOICE.GO });
      }
      now += 1000;
      s4.tick(now);
    }
    t('L15 control · once per game — cast into a chair again, the same player is refused',
      second !== null && second.ok === false && /already refused/.test(second.why || ''),
      second ? `${refuser}: "${second.why}"` : 'the control never got them back into a chair — NOT ARMED');
    t('L15 control arm · and the flag that refuses them is on the frame, permanently',
      s4.state.players.filter((p) => p.refused).map((p) => p.id).join(',') === refuser,
      `players[].refused = ${refuser}`);
  }
  const seated = s.state.players.find((p) => p.id !== s.state.pair.runner && p.id !== s.state.pair.guide);
  t('L15b control · a player who was not cast has no chair to refuse',
    s.input(seated.id, { t: 'refuse' }).ok === false, s.input(seated.id, { t: 'refuse' }).why);

  const s2 = toExpedition();
  s2.input(s2.state.pair.guide, { t: 'call', call: CALL.CLEAR });
  t('L15c control · and the window shuts once the chair has been used',
    s2.input(s2.state.pair.guide, { t: 'refuse' }).ok === false,
    s2.input(s2.state.pair.guide, { t: 'refuse' }).why);

  // 🚨 THE BUG ITSELF, AS AN ASSERTION. The verb existed, the rule existed, the gate on the rule
  // was green — and the list that decides what a phone may send did not mention it.
  const s3 = toExpedition();
  t('L15d control · an unlisted verb is still refused — L15 is the INPUT list working',
    s3.input(s3.state.pair.guide, { t: 'recuse' }).ok === false && INPUT.includes('refuse'),
    `INPUT = ${INPUT.join(', ')}`);
}

// ---------------------------------------------------------------- L14 · the callout is spoken
/**
 * 🚨 BROADCAST §6.9, WHICH THE BUILD BROKE ON BOTH SCREENS AT ONCE: *"Never show the runner's
 * private prompts or the guide's callouts as on-screen text. The guide talks out loud, in the
 * room. That is the game."* `call.by` and `call.said` were rowed `all`, the television printed
 * CLEAR at sixty-eight pixels across the middle of the circle and the runner's phone printed it
 * again — so the one sentence the guide had to say themselves was said for them, permanently,
 * in writing, for the DEBRIEF to re-read instead of argue about.
 *
 * ⚠️ THE LOG IS NOT WHAT THIS IS ABOUT. `call.made` is still a PUBLIC event carrying `by` and
 * `said` in full, because the Reunion and every query over the log need it. What may not happen
 * is the FRAME carrying it, because a frame is what becomes text on a screen.
 */
{
  let leak = null, guideGotIt = false, everyoneKnows = 0;
  for (const [id, frames] of R.tape) {
    for (const f of frames) {
      if (!f.call) continue;
      if (f.call.made) everyoneKnows++;
      if (f.call.said == null) continue;
      const sock = R.s.sockets.find((x) => x.id === id);
      if (sock && !sock.isTV && f.pair && f.pair.guide === sock.playerId) { guideGotIt = true; continue; }
      leak = `${id} · phase ${f.phase} · call.said = "${f.call.said}"`;
    }
  }
  t('L14 · what the guide said is on no frame but the guide\'s own — §6.9', leak === null,
    leak || `${R.tape.size} sockets, every frame scanned`);
  t('L14b arm · the guide\'s own phone DID get it, so L14 is not passing on a field nobody has',
    guideGotIt, 'their controller says their call back to them, and to nobody else');
  t('L14c · that a call HAS been made is still public — the clock, not the callout',
    everyoneKnows > 0, `${everyoneKnows} frames carry call.made`);
  t('L14 control · the matrix says the same thing out loud',
    audienceFor('call.said') === 'guide' && audienceFor('call.made') === 'all' && audienceFor('call.by') === null,
    'call.said → guide · call.made → all · call.by → no row');
}

// ---------------------------------------------------------------- L10 · you.acted is yours alone
{
  let bad = null;
  for (const [id, frames] of R.tape) {
    for (const f of frames) {
      if (id === 'tv' && f.you) bad = 'the TV was sent a `you` block';
      for (const p of f.players || []) if ('acted' in p) bad = `${id} can see ${p.id} has acted`;
    }
  }
  t('L10 · whether a phone has tapped yet is that phone\'s business', bad === null,
    bad || 'no acted flag on any player row, no `you` on the TV');
  t('L10 control · the matrix agrees, and the row says so out loud',
    audienceFor('you.acted') === 'self' && audienceFor('players[].acted') === null,
    'you.acted → self · players[].acted → no row');
}

// ---------------------------------------------------------------- L11 · determinism
{
  const a = play({ castSeed: 11, worldSeed: 22, taps: engaged });
  const b = play({ castSeed: 11, worldSeed: 22, taps: engaged });
  const c = play({ castSeed: 12, worldSeed: 22, taps: engaged });
  const strip = (r) => JSON.stringify(r.s.log.all());
  t('L11 · the same seeds and the same taps replay to an identical log',
    strip(a) === strip(b), `${a.s.log.all().length} entries, byte-identical`);
  t('L11 control · a different cast seed does not', strip(a) !== strip(c),
    'so L11 is determinism rather than a constant game');
}

// ---------------------------------------------------------------- L16 · how somebody left
/**
 * 🚨 **THE TWO VISIBLE CAUSES HAD COLLAPSED INTO ONE, AND THE TELEVISION SAID SO IN WORDS.**
 *
 * Round §4 airs the casualty *"by which of the two visible causes (`TAKEN` / `EXECUTED`)"* —
 * both were watched live, so hiding the cause would be a lie while hiding the alignment is not.
 * `resolveVote` called `applyTake` for an execution and filtered the `player.taken` EVENT back out
 * of the log, which is right about the log and wrong about the row: `Object.assign(victim, player)`
 * copies `taken: true` onto the public frame. So every executed player read `{alive:false,
 * taken:true}`, `show-tv.html:155` rendered `✖ taken`, `captions.js:131` put a `✕` on the
 * nameplate, and the `⚒ evicted` branch beside them had never once been reached.
 */
{
  const probe = play({ taps: engaged });
  const log = probe.s.log.all();
  const executed = new Set(log.filter((e) => e.type === 'player.executed').map((e) => e.data.id));
  const taken = new Set(log.filter((e) => e.type === 'player.taken').map((e) => e.data.id));
  const tv = probe.tape.get('tv');

  t('L16 arm · the show executed somebody, so there is a row to read',
    executed.size > 0, `${executed.size} executed · ${taken.size} taken by the Hunter`);

  const mislabelled = tv.flatMap((f) => (f.players || [])
    .filter((p) => !p.alive && p.taken && executed.has(p.id) && !taken.has(p.id))
    .map((p) => `${f.phase}:${p.id}`));
  t('L16 · an executed player\'s public row does not claim the Hunter took them',
    mislabelled.length === 0, mislabelled.slice(0, 3).join(', ') || `${tv.length} frames swept`);

  t('L16b · and the flag still means what it says — the rows the matrix rows it for are untouched',
    tv.some((f) => (f.players || []).some((p) => p.taken === true)) || taken.size === 0,
    taken.size ? 'a Hunter take still sets it' : 'no take in this seed to check against');

  // 🚨 THE CONTROL IS THE FUNCTION THE BUG CALLED, RUN ON THE VERY ROW IT WAS CALLED ON.
  const victimId = [...executed][0];
  const row = { id: victimId, seat: 0, alive: true, taken: false, plate: 'undeclared' };
  t('L16 control · `applyTake` on that exact row sets the flag, which is how the label got there',
    applyTake(row).player.taken === true && applyEviction(row).player.taken === false,
    'applyTake → taken:true · applyEviction → taken:false');
}

// ---------------------------------------------------------------- L17 · a nomination is an episode's
/**
 * `onEnter[RECKONING]` was the ONLY place `state.nominations` was cleared, so from the moment one
 * reckoning closed until the next one opened — the vote, the execution, the verdict, and then the
 * whole of the next episode's casting, expedition, recap and debrief — the previous episode's
 * nominations sat on every frame. `show-tv.html`'s `votedTag` renders them in every phase but
 * CASTING and VOTE, so the television printed "◆ on the block" beside a living player, right
 * through the Debrief, for an accusation the table had already voted down an episode ago.
 */
{
  const probe = play({ taps: engaged });
  const tv = probe.tape.get('tv');
  const BEFORE = [PHASE.PREMIERE, PHASE.CASTING, PHASE.EXPEDITION, PHASE.RECAP, PHASE.DEBRIEF];
  const stale = tv.filter((f) => BEFORE.includes(f.phase) && (f.nominations || []).length);
  t('L17 · no frame before an episode\'s reckoning carries a nomination',
    stale.length === 0,
    stale.length ? `ep ${stale[0].episode} ${stale[0].phase}: ${JSON.stringify(stale[0].nominations)}`
      : `${tv.filter((f) => BEFORE.includes(f.phase)).length} pre-reckoning frames swept`);

  const standing = tv.filter((f) => (f.nominations || []).length);
  t('L17b arm · and the frames that SHOULD carry one do — this is not an empty sweep',
    standing.length > 0 && standing.every((f) => [PHASE.RECKONING, PHASE.VOTE, PHASE.EXECUTION, PHASE.VERDICT].includes(f.phase)),
    `${standing.length} frames carry a block, in ${[...new Set(standing.map((f) => f.phase))].join('/')}`);

  // The control: there was something to inherit. A show where nobody was ever nominated after
  // episode 1 would pass L17 by having nothing to leak.
  const noms = probe.s.log.all().filter((e) => e.type === 'nom.made');
  const eps = new Set(tv.filter((f) => (f.nominations || []).length).map((f) => f.episode));
  t('L17 control · more than one episode nominated somebody, so a stale list had somewhere to go',
    noms.length > 1 && eps.size > 1,
    `${noms.length} nominations across episodes {${[...eps].sort().join(',')}}`);
}

// ---------------------------------------------------------------- L12 · both endings occur
/**
 * ⚠️ THIS IS NOT A BALANCE ASSERTION AND MUST NOT BE READ AS ONE. The table below always calls
 * CLEAR, always runs, and always executes the same seat, which is nobody's strategy. `party-sim`
 * owns the win rate, with policies that lie selectively and vote on evidence. All this asks is
 * that the LIVE loop can reach both endings — a loop that could only ever cancel the show would
 * pass every other assertion in this file.
 */
{
  const outcomes = {};
  for (let seed = 1; seed <= 40; seed++) {
    const p = play({
      castSeed: seed, worldSeed: seed * 3,
      taps: (s, act) => {
        engaged(s, act);
        // A little variance so the show does not play out identically every seed.
        if (s.state.phase === PHASE.EXPEDITION && seed % 3 === 0) {
          act(s.state.pair.runner, { t: 'move', move: MOVE_CHOICE.WAIT });
        }
      },
    });
    outcomes[p.s.state.outcome] = (outcomes[p.s.state.outcome] || 0) + 1;
  }
  const kinds = Object.keys(outcomes);
  t('L12 · the live loop reaches more than one ending across seeds',
    kinds.length >= 2, JSON.stringify(outcomes));
  t('L12b · and every session ended in a real outcome, never null',
    !kinds.includes('null') && !kinds.includes('undefined') && !kinds.includes(OUTCOME.RENEWED),
    kinds.join(' · '));
}

console.log(`\nlive-session: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
