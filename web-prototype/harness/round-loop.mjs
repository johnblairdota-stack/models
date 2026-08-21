#!/usr/bin/env node
/**
 * 🎬 **round-loop — A MATCH ALWAYS ENDS, AND IT ENDS INSIDE A GAMES NIGHT.**
 *
 *   node harness/round-loop.mjs
 *
 * The two properties that no unit gate can see, because both are about the whole shape:
 *
 *   **It terminates.** A social deception game that can run forever is a game that ends when
 *   somebody's lift arrives. `EPISODE_CAP` plus W5 is the belt and braces; R1 runs hundreds of
 *   matches across every player count and every take pattern and requires every one to stop.
 *
 *   **It fits.** `rrr-social-round.md` §1 budgets 27:05 / 32:40 / 38:15 for 4/5/6 episodes, and
 *   `EPISODE_CAP = 6` is chosen precisely to keep the worst case under forty minutes. R2 asserts
 *   the arithmetic still says so, because a phase whose length drifts by fifteen seconds is
 *   invisible until it has cost four minutes.
 */

import { createRoom } from '../src/party/room.js';
import { createSession, CALL, MOVE_CHOICE } from '../src/party/session.js';
import { foldWin } from '../src/party/win.js';
import { sessionSeconds, episodeSeconds, orderFor, PHASE, EPISODE_CAP, reckoningSeconds, RECKONING_CAP } from '../src/party/phases.js';
import { OUTCOME } from '../src/party/win.js';
import { ROOMS } from '../src/party/coverage.js';

let pass = 0, fail = 0;
const t = (n, c, d = '') => { if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); } else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); } return c; };

// ---------------------------------------------------------------- R0 · the arm
{
  const r = createRoom({ count: 8, castSeed: 1, worldSeed: 1, send: () => {}, emit: () => {} });
  r.start();
  const out = r.playMatch({ hunterRoom: ROOMS[5] });
  const phases = new Set(r.log.all().filter((e) => e.type.startsWith('phase.')).map((e) => e.type.slice(6)));
  t('R0 arm · a match runs every phase and reaches a verdict',
    !!out && phases.has('CASTING') && phases.has('EXPEDITION') && phases.has('VERDICT'),
    `${out} · ${[...phases].join('/')}`);
}

// ---------------------------------------------------------------- R1 · it always terminates
{
  let bad = null, ran = 0;
  const outcomes = {};
  for (let count = 4; count <= 8 && !bad; count++) {
    for (let seed = 0; seed < 60; seed++) {
      const r = createRoom({ count, castSeed: seed * 17 + count, worldSeed: seed + 1, send: () => {}, emit: () => {} });
      r.start();
      const out = r.playMatch((ep) => ({ hunterRoom: [ROOMS[5], ROOMS[1], ROOMS[4]][ep % 3], takeRunner: (seed + ep) % 3 === 0 }));
      ran++;
      outcomes[out] = (outcomes[out] || 0) + 1;
      if (!out || out === OUTCOME.RENEWED) bad = `count=${count} seed=${seed} ended on ${out}`;
      if (r.state.episode - 1 > EPISODE_CAP) bad = `count=${count} seed=${seed} ran ${r.state.episode - 1} episodes`;
    }
  }
  t('R1 · every match terminates within the episode cap', bad === null,
    bad || `${ran} matches · ${Object.entries(outcomes).map(([k, v]) => `${k}:${v}`).join(' ')}`);
}

// ---------------------------------------------------------------- R2 · the session budget
{
  const mins = (n) => sessionSeconds(n) / 60;
  t('R2 · 4/5/6 episodes land on the budgeted 27:05 / 32:40 / 38:15',
    Math.abs(sessionSeconds(4) - 1625) < 1 && Math.abs(sessionSeconds(5) - 1960) < 1 && Math.abs(sessionSeconds(6) - 2295) < 1,
    `${mins(4).toFixed(1)} / ${mins(5).toFixed(1)} / ${mins(6).toFixed(1)} min`);
  const worst = sessionSeconds(EPISODE_CAP, 3) / 60;
  t('R2b · the base case fits the window at the episode cap', mins(EPISODE_CAP) <= 40,
    `${mins(EPISODE_CAP).toFixed(1)} min base at ${EPISODE_CAP} episodes`);
  t('R2c · THE WORST CASE fits it too — three nominations every episode', worst < 40,
    `${worst.toFixed(1)} min · this is the assertion that caught the 42.0 min bug at EPISODE_CAP 6, `
    + `so it asserts the worst case and not the comfortable one`);
  t('R2d · the reckoning is capped', reckoningSeconds(99) === RECKONING_CAP, `${reckoningSeconds(99)}s`);
}

// ---------------------------------------------------------------- R3 · the premiere is different
{
  t('R3 · episode 1 skips the reckoning and everything after it',
    !orderFor(1).includes(PHASE.RECKONING) && orderFor(2).includes(PHASE.RECKONING),
    `ep1 ${orderFor(1).length} phases, ep2 ${orderFor(2).length}`);
  t('R3b · and it is shorter for it', episodeSeconds(1) < episodeSeconds(2),
    `${episodeSeconds(1)}s vs ${episodeSeconds(2)}s`);

  const r = createRoom({ count: 8, castSeed: 2, worldSeed: 2, send: () => {}, emit: () => {} });
  r.start(); r.playEpisode({ hunterRoom: ROOMS[5] });
  const seen = r.log.all().filter((e) => e.type.startsWith('phase.')).map((e) => e.type.slice(6));
  t('R3c · and the room honours it', !seen.includes('RECKONING') && seen.includes('VERDICT'), seen.join('/'));
}

// ---------------------------------------------------------------- R4 · an execution runs end to end
{
  const r = createRoom({ count: 8, castSeed: 8, worldSeed: 3, send: () => {}, emit: () => {} });
  r.start();
  r.playEpisode({ hunterRoom: ROOMS[5] });
  const living = r.state.players.filter((p) => p.alive).map((p) => p.id);
  const target = living[2], accuser = living[0];
  r.playEpisode({
    hunterRoom: 'gallery',
    nominations: [{ nominator: accuser, target }],
    votes: Object.fromEntries(living.map((id) => [id, target])),
  });
  const exec = r.log.all().find((e) => e.type === 'player.executed');
  t('R4 · a unanimous vote executes, and the nominator swings',
    exec && exec.data.id === target && exec.data.executioner === accuser,
    exec ? `${exec.data.executioner} swung on ${exec.data.id}` : 'no execution');
  t('R4b · the execution event carries no alignment', exec && !/good|evil/.test(JSON.stringify(exec.data)));
  const plate = r.state.players.find((p) => p.id === target).plate;
  t('R4c · the plate is face-down', plate === 'face-down', plate);
}

// ---------------------------------------------------------------- R5 · the control
{
  const r = createRoom({ count: 8, castSeed: 8, worldSeed: 3, send: () => {}, emit: () => {} });
  r.start();
  r.playEpisode({ hunterRoom: ROOMS[5] });
  const living = r.state.players.filter((p) => p.alive).map((p) => p.id);
  const target = living[2];
  // Exactly half the living vote — one short of a strict majority.
  const half = living.slice(0, Math.floor(living.length / 2));
  r.playEpisode({
    hunterRoom: 'gallery',
    nominations: [{ nominator: living[0], target }],
    votes: Object.fromEntries(living.map((id) => [id, half.includes(id) ? target : 'NO_ONE'])),
  });
  t('R5 control · exactly half the living is not enough to execute',
    !r.log.all().some((e) => e.type === 'player.executed'),
    `${half.length} of ${living.length} voted — abstaining protects the accused`);
}

// ---------------------------------------------------------------- R6 · the show stops shooting
/**
 * 🚨 **THE SHOW KEPT SHOOTING AFTER IT WAS OVER, AND VOTED SOMEBODY OUT WHILE IT DID.** `foldWin`
 * decides on the winning camera, an EXPEDITION event; `closeEpisode` runs only when the phase
 * queue empties, four phases later. The reckoning, the vote and the execution in between were
 * held in a game that already had a result — and cost a living player their seat for it.
 *
 * Measured before the fix, 600 games at 5, 6 and 8 players: **52.0% of games killed somebody
 * after the result was locked**, 312 of 1791 deaths. After: 0 of 1479, and the 312 are the whole
 * of the difference. (`docs/rrr-open-findings.md` recorded 71.3% from `party-sim`'s policies.
 * This driver is cruder and the two numbers are not the same measurement; both are large.)
 *
 * 🚨 **THIS GATE DRIVES `createSession`, NOT `createRoom`.** Everything above it in this file
 * drives the room, which `room.js`'s own header calls "deliberately the smallest room that
 * exercises every audience in the matrix… not the game loop" — it has no `PHASE.EXPEDITION` and
 * no `PHASE.RECAP` at all. The property below is about phases the room does not have, so it is
 * asserted against the module that has them. That the loop gate and the loop live in different
 * modules is worth somebody's attention; it is not this assertion's to fix.
 */
{
  const drive = (seed, count) => {
    let s = null, locked = null, lateDeaths = 0, earlyDeaths = 0, dropped = 0;
    s = createSession({ count, castSeed: seed, worldSeed: seed * 7, send: () => {} });
    s.start(0);
    const align = Object.fromEntries(s.deal.seats.map((x) => [x.id, x.alignment]));
    let now = 0;
    for (let i = 0; i < 3000 && s.state.phase !== PHASE.REUNION; i++) {
      const alive = s.state.players.filter((p) => p.alive).map((p) => p.id);
      switch (s.state.phase) {
        case PHASE.CASTING:
          for (let k = 0; k < alive.length; k++)
            s.input(alive[k], { t: 'cast', runner: alive[(k + 1) % alive.length], guide: alive[(k + 2) % alive.length] });
          break;
        case PHASE.EXPEDITION:
          s.input(s.state.pair.guide, { t: 'call', call: i % 2 ? CALL.CLEAR : CALL.HOLD });
          s.input(s.state.pair.runner, { t: 'move', move: MOVE_CHOICE.GO });
          break;
        case PHASE.RECKONING:
          if (!s.state.nominations.length) s.input(alive[0], { t: 'nominate', target: alive[1] });
          break;
        case PHASE.VOTE:
          for (const id of alive) s.input(id, { t: 'vote', choice: alive[1] }); break;
        default: break;
      }
      const before = s.state.players.filter((p) => !p.alive).length;
      now += 5000; s.tick(now);
      const after = s.state.players.filter((p) => !p.alive).length;
      if (after > before) { if (locked !== null) lateDeaths++; else earlyDeaths++; }
      if (locked === null) {
        const w = foldWin(s.log.all(), { count, alignmentOf: (id) => align[id] });
        if (w.outcome && w.outcome !== OUTCOME.RENEWED) locked = i;
      }
    }
    dropped = s.log.all().filter((e) => e.type === 'show.settled')
      .reduce((a, e) => a + (e.data ? e.data.dropped || 0 : 0), 0);
    return { locked: locked !== null, lateDeaths, earlyDeaths, dropped };
  };

  const runs = [];
  for (const count of [5, 6, 8]) for (let seed = 1; seed <= 40; seed++) runs.push(drive(seed, count));
  const lockedRuns = runs.filter((r) => r.locked);
  const late = runs.reduce((a, r) => a + r.lateDeaths, 0);
  const early = runs.reduce((a, r) => a + r.earlyDeaths, 0);
  const droppedTotal = runs.reduce((a, r) => a + r.dropped, 0);

  t('R6 arm · a seeded sweep of real shows ran, and games actually reached a locked result',
    runs.length >= 100 && lockedRuns.length > 0,
    `${runs.length} shows at 5/6/8 players · ${lockedRuns.length} reached a settled result`);

  t('R6 · nobody is executed after the result is locked',
    late === 0, `${late} deaths after the lock, ${early} before it`);

  // 🚨 TWO CONTROLS, BECAUSE A ZERO CAN MEAN TWO THINGS. One that counts nothing and one that
  // fires on nothing look identical from up here.
  t('R6 control · the same counter DOES count deaths before the lock — R6\'s zero is not blindness',
    early > 100, `${early} pre-lock deaths counted by the identical comparison`);
  t('R6 control · and the truncation is doing work rather than being a no-op R6 satisfies for free',
    droppedTotal > 0 && lockedRuns.length > 0,
    `${droppedTotal} decision phases dropped across ${lockedRuns.length} settled shows`);
}

console.log(`\nround-loop: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
