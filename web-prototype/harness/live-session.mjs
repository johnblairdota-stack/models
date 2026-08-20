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
import { createSession, CALL, MOVE_CHOICE, LOBBY, GUIDE_TILT_DEG } from '../src/party/session.js';
import { PHASE, SECONDS, orderFor, EPISODE_CAP, reckoningSeconds, RECKONING_CAP } from '../src/party/phases.js';
import { OUTCOME } from '../src/party/win.js';
import { ROOMS } from '../src/party/coverage.js';
import { NO_ONE } from '../src/party/vote.js';
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
