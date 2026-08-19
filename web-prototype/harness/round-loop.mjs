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
import { sessionSeconds, episodeSeconds, orderFor, PHASE, EPISODE_CAP, reckoningSeconds, RECKONING_CAP } from '../src/party/phases.js';
import { OUTCOME } from '../src/party/win.js';

let pass = 0, fail = 0;
const t = (n, c, d = '') => { if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); } else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); } return c; };

// ---------------------------------------------------------------- R0 · the arm
{
  const r = createRoom({ count: 8, castSeed: 1, worldSeed: 1, send: () => {}, emit: () => {} });
  r.start();
  const out = r.playMatch({ hunterRoom: 'cellar' });
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
      const out = r.playMatch((ep) => ({ hunterRoom: ['cellar', 'gallery', 'hall'][ep % 3], takeRunner: (seed + ep) % 3 === 0 }));
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
  r.start(); r.playEpisode({ hunterRoom: 'cellar' });
  const seen = r.log.all().filter((e) => e.type.startsWith('phase.')).map((e) => e.type.slice(6));
  t('R3c · and the room honours it', !seen.includes('RECKONING') && seen.includes('VERDICT'), seen.join('/'));
}

// ---------------------------------------------------------------- R4 · an execution runs end to end
{
  const r = createRoom({ count: 8, castSeed: 8, worldSeed: 3, send: () => {}, emit: () => {} });
  r.start();
  r.playEpisode({ hunterRoom: 'cellar' });
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
  r.playEpisode({ hunterRoom: 'cellar' });
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

console.log(`\nround-loop: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
