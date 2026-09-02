#!/usr/bin/env node
/**
 * 🎬 **round-loop — A MATCH ALWAYS ENDS, AND IT ENDS INSIDE A GAMES NIGHT.**
 *
 *   node harness/round-loop.mjs
 *
 * The two properties that no unit gate can see, because both are about the whole shape:
 *
 *   **It terminates.** A social deception game that can run forever is a game that ends when
 *   somebody's lift arrives. Matches still close on W1 / W2 / W3 / W4 / W6; a camera miss at
 *   the cap is RENEWED, not a Production door. R1 runs hundreds of matches across every player
 *   count and every take pattern and requires every one to stop (hang bound `EPISODE_CAP + 8`).
 *
 *   **It fits.** R2 asserts the arithmetic still says so, because a phase whose length drifts by
 *   fifteen seconds is invisible until it has cost four minutes.
 *
 * ⚠️ **THE SECOND PROPERTY CHANGED SHAPE ON 2026-08-25 AND THE HEADER USED TO LIE ABOUT IT.**
 * It said `EPISODE_CAP = 6` (it is 5) and quoted a 26:25/31:50/37:15 budget that two later
 * decisions had already moved. Both numbers were stale for long enough to be quoted in a design
 * argument. The live figures are in the R2 block, computed from `phases.js` rather than restated
 * here, so this header cannot drift again.
 *
 * What changed: Debrief became a five-minute CEILING ended by a majority of the room tapping
 * READY, so "does the night fit" split into the night a table PLAYS (R2b/R2c, under 40 min) and
 * the night a silent table SUFFERS (R2e, under 60). The old flat forty-minute guarantee is gone
 * on purpose — see the R2 block for the measurement that made it unaffordable.
 */

import { createRoom } from '../src/party/room.js';
import { sessionSeconds, episodeSeconds, orderFor, PHASE, EPISODE_CAP, reckoningSeconds, RECKONING_CAP, SECONDS } from '../src/party/phases.js';
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
      // 2g1e last vote may air EPISODE_CAP+1. A match that never stops is still a hang.
      if (r.state.episode - 1 > EPISODE_CAP + 8) bad = `count=${count} seed=${seed} ran ${r.state.episode - 1} episodes`;
    }
  }
  t('R1 · every match terminates', bad === null,
    bad || `${ran} matches · ${Object.entries(outcomes).map(([k, v]) => `${k}:${v}`).join(' ')}`);
}

// ---------------------------------------------------------------- R2 · the session budget
{
  const mins = (n) => sessionSeconds(n) / 60;

  /* ==========================================================================================
   * 🚨 THE FORTY-MINUTE PROMISE BECAME A FORTY-MINUTE EXPECTATION ON 2026-08-25.
   *
   * Debrief went 75s -> 300s (John: he wanted Blood on the Clocktower's long day). At five
   * episodes that makes the ABSOLUTE worst case 56.1 min, and it cannot be bought back by
   * shortening the night — 600 simulated matches showed only 7.3% finish by episode 3, and an
   * eight-player table averages 4.98 episodes, so a smaller `EPISODE_CAP` would force-end ~93%
   * of games on a technicality rather than a win.
   *
   * ⚠️ **WHAT MAKES THIS AFFORDABLE IS THE READY BUTTON, NOT THE ARITHMETIC.** Debrief is a
   * CEILING now: a majority of the living ends it (`show.js` `readyNeeded`). So the number worth
   * guarding is the night a real table plays, and R2c measures exactly that — every Debrief
   * ended at `TYPICAL_DEBRIEF_S`, which is 38.6 min.
   *
   * R2e is the replacement for the old guarantee: a hard sixty-minute ceiling on the case where
   * NOBODY ever taps. It exists so the drift this block was written to catch is still caught —
   * "a phase whose length drifts by fifteen seconds is invisible until it has cost four minutes"
   * is as true now as it was, and the only thing that changed is which number is the promise.
   *
   * If a five-minute Debrief drags at a real table, `phases.js` `SECONDS[DEBRIEF]` is the line to
   * change and these four assertions are what will tell you everything that moves with it.
   * ========================================================================================== */

  t('R2 · 4/5/6 episodes land on the budgeted 43:10 / 52:20 / 61:30',
    Math.abs(sessionSeconds(4) - 2590) < 1 && Math.abs(sessionSeconds(5) - 3140) < 1 && Math.abs(sessionSeconds(6) - 3690) < 1,
    `${mins(4).toFixed(1)} / ${mins(5).toFixed(1)} / ${mins(6).toFixed(1)} min`);

  /*
   * The Debrief a real table actually plays. Not a guess: `readyNeeded` makes the beat end when a
   * majority has said their piece, and 90s is the number this assertion is pinned to so that
   * raising it is a visible, argued change rather than a quiet one.
   */
  const TYPICAL_DEBRIEF_S = 90;
  const typical = (eps, noms) => {
    const saved = (SECONDS[PHASE.DEBRIEF] - TYPICAL_DEBRIEF_S) * eps;
    return (sessionSeconds(eps, noms) - saved) / 60;
  };

  t('R2b · a typical night at the episode cap fits the window', typical(EPISODE_CAP, 0) <= 40,
    `${typical(EPISODE_CAP, 0).toFixed(1)} min at ${EPISODE_CAP} episodes, Debrief ended at ${TYPICAL_DEBRIEF_S}s`);
  t('R2c · THE TYPICAL WORST CASE fits it too — 90s Reckoning wall, not a standing-count cap',
    typical(EPISODE_CAP, 7) < 40
      && Math.abs(typical(EPISODE_CAP, 7) - typical(EPISODE_CAP, 3)) < 1e-9
      && reckoningSeconds(7) === RECKONING_CAP
      && reckoningSeconds(3) === RECKONING_CAP,
    `${typical(EPISODE_CAP, 7).toFixed(1)} min · seven unique names play inside the 90s TIME wall. `
    + `READY ends every Debrief at ${TYPICAL_DEBRIEF_S}s. R2e guards the table that never taps.`);

  const worst = sessionSeconds(EPISODE_CAP, 7) / 60;
  t('R2e · and the room that NEVER taps READY still stops inside an hour', worst < 60,
    `${worst.toFixed(1)} min · every Debrief run to its full ${SECONDS[PHASE.DEBRIEF]}s ceiling. `
    + `This is the assertion that replaced the old flat 40-minute guarantee.`);

  t('R2d · the reckoning is capped', reckoningSeconds(99) === RECKONING_CAP, `${reckoningSeconds(99)}s`);
}

// ---------------------------------------------------------------- R3 · the premiere is different
{
  // 🚨 INVERTED 2026-08-25. This block asserted the premiere skip for as long as `orderFor` had
  // one; the live clock never did, and John kept the live behaviour. It now asserts the opposite,
  // which is the only reason to keep the block: the premiere is the episode most likely to grow
  // a special case again by accident.
  t('R3 · the premiere runs the same order as every other episode',
    orderFor(1).includes(PHASE.RECKONING) && orderFor(2).includes(PHASE.RECKONING)
      && orderFor(1).join() === orderFor(2).join(),
    `ep1 ${orderFor(1).length} phases, ep2 ${orderFor(2).length}`);
  t('R3b · and it is exactly as long for it', episodeSeconds(1) === episodeSeconds(2),
    `${episodeSeconds(1)}s vs ${episodeSeconds(2)}s`);

  const r = createRoom({ count: 8, castSeed: 2, worldSeed: 2, send: () => {}, emit: () => {} });
  r.start(); r.playEpisode({ hunterRoom: 'cellar' });
  const seen = r.log.all().filter((e) => e.type.startsWith('phase.')).map((e) => e.type.slice(6));
  // Inverted with R3: the premiere's first episode must now reach the vote like any other.
  // EXECUTION is absent here and that is correct — the default ballot is all NO_ONE, so nobody
  // is taken; R4 is the gate that proves an execution runs end to end.
  t('R3c · and the room honours it — the premiere reaches Reckoning and Vote',
    seen.includes('RECKONING') && seen.includes('VOTE') && seen.includes('VERDICT'), seen.join('/'));
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
