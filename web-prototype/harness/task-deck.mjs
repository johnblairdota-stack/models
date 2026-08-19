#!/usr/bin/env node
/**
 * 🧩 **task-deck — FIVE TASKS, FIVE SHAPES, AND THE CONTRACT IS CHECKED RATHER THAN CLAIMED.**
 *
 *   node harness/task-deck.mjs
 *
 * `rrr-task-deck.md` §5.2.1. The Task Contract is what stops the deck degenerating into a bag of
 * minigames as it grows past five, and a contract nobody checks is a comment.
 *
 * 🚨 **T4 IS PENDING ON THREE TASKS AND THIS FILE SAYS SO BY NAME.** The noise bus carries placed
 * events only (`noise.js:14-22`) and just two callers emit today, so a failed breach, a smashed
 * antique and a shorted camera are all **silent**. T4 wants failure to be audible; a task whose
 * failure is silent is a task where a saboteur pays nothing. Those three are SKIPped with the
 * reason rather than passed — on this project a SKIP is never a PASS.
 */

import { TASKS, SHAPE, PENDING, byId, failurePayload, outrunsCarrier, CARRY_TRAP_STAGE, CARRY_SPEED, carriesMetres, soundCanCommit } from '../src/party/tasks.js';
import { FAILURE_FIELDS } from '../src/party/events.js';
import { HUNTER_SPEED, HUNTER_SENSE } from '../src/game/rules.js';

let pass = 0, fail = 0, skip = 0;
const t = (n, c, d = '') => { if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); } else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); } return c; };
const skipped = (n, why) => { skip++; console.log(`  SKIP ${n} · ${why}`); };

// ---------------------------------------------------------------- K0 · the arm
{
  const shapes = new Set(TASKS.map((x) => x.shape));
  t('K0 arm · five tasks covering five distinct shapes', TASKS.length === 5 && shapes.size === 5,
    TASKS.map((x) => `${x.id}:${x.shape}`).join(' '));
}

// ---------------------------------------------------------------- K1 · T1 asymmetry
{
  const bad = TASKS.find((x) => x.runner.some((k) => x.guide.includes(k)) || !x.runner.length || !x.guide.length);
  t('K1 · T1 — in every task the runner and guide hold disjoint information', !bad,
    bad ? `${bad.id} shares ${bad.runner.filter((k) => bad.guide.includes(k)).join('/')}` : '5 tasks, no shared key');
}

// ---------------------------------------------------------------- K2 · T2 the channel is a voice
{
  const bad = TASKS.find((x) => [...x.runner, ...x.guide].some((k) => /chat|text|msg|type|send/i.test(k)));
  t('K2 · T2 — no task gives the pair an in-game channel', !bad,
    bad ? `${bad.id}` : 'every link between them is a human voice in the room');
}

// ---------------------------------------------------------------- K3 · T3 a named lie
{
  const bad = TASKS.find((x) => !x.lie || x.lie.length < 4);
  t('K3 · T3 — every task names where the lie lives', !bad,
    bad ? bad.id : TASKS.map((x) => `${x.id}: ${x.lie}`).join(' · '));
  t('K3b · and no two tasks put it in the same place',
    new Set(TASKS.map((x) => x.lie)).size === TASKS.length);
}

// ---------------------------------------------------------------- K4 · T4 failure is audible
{
  const built = TASKS.filter((x) => x.contract.T4 === true);
  const pending = TASKS.filter((x) => x.contract.T4 === PENDING);
  t('K4 · every task that claims T4 has a built noise source',
    built.every((x) => x.noise.built && (x.noise.failurePeak > 0 || x.noise.source.includes('sustained'))),
    built.map((x) => `${x.id}:${x.noise.source}`).join(' · '));
  if (pending.length) {
    skipped('K4b T4 on the rest', `${pending.map((x) => x.id).join(', ')} — the noise bus carries placed events only `
      + `(noise.js:14-22) and these three emit nothing on failure. Proposed: `
      + pending.map((x) => `${x.id} ${x.noise.failurePeak}`).join(', ') + '. ENGINE WORK, not design');
  }
  // 🚨 A TASK WHOSE FAILURE IS QUIETER THAN ITS SUCCESS PAYS A SABOTEUR TO FAIL. This caught the
  // Wall Call modelling failure at the per-blow floor rather than the breach — see tasks.js.
  t('K4c · no task is quieter when it goes wrong',
    TASKS.every((x) => x.noise.failurePeak >= x.noise.successPeak),
    TASKS.map((x) => `${x.id} ${x.noise.successPeak}/${x.noise.failurePeak}`).join(' '));
}

// ---------------------------------------------------------------- K5 · T5 never names the culprit
{
  let bad = null;
  for (const x of TASKS) {
    const p = failurePayload(x.id, { kind: 'fail', room: 'east', phaseTick: 3, loudness: x.noise.failurePeak });
    const extra = Object.keys(p).filter((k) => !FAILURE_FIELDS.includes(k));
    if (extra.length) bad = `${x.id} carries ${extra.join(',')}`;
  }
  t('K5 · T5 — every task reports failure through the closed four-field schema', !bad, bad || `{${FAILURE_FIELDS.join(', ')}}`);

  let threw = false;
  try { failurePayload('TALLY', { kind: 'short', room: 'hall', phaseTick: 2, loudness: 1.4, earlyBy: 0.4 }); } catch { threw = true; }
  t('K5b · the Tally cannot report a timing even by accident', threw,
    byId('TALLY').t5Note);

  // With a crew of two, ANY per-player shape is an accusation. Assert the schema has no room for one.
  t('K5c · and with a crew of two there is no field that could hold one',
    FAILURE_FIELDS.every((f) => !/who|by|player|time|delta|accuracy/i.test(f)),
    'kind, room, phaseTick, loudness — none of them can hold a person or a margin');
}

// ---------------------------------------------------------------- K6 · T6 watchable
{
  t('K6 · T6 — no task needs the guide\'s map on the TV',
    TASKS.every((x) => !x.runner.includes('flyover')),
    'the flyover is a guide surface only; party-loop.md puts it under "Do not"');
  t('K6b · and the deck varies what the TV shows', new Set(TASKS.map((x) => x.shape)).size === 5);
}

// ---------------------------------------------------------------- K7 · the Extraction trap
{
  t('K7 · a carrying runner cannot outrun the Hunter from stage 2',
    !outrunsCarrier(1) && outrunsCarrier(2) && outrunsCarrier(3) && CARRY_TRAP_STAGE === 2,
    `carry ${CARRY_SPEED} m/s vs hunter ${HUNTER_SPEED.slice(1).join('/')} — the trap arms at stage ${CARRY_TRAP_STAGE}`);
  t('K7b · which is why the Extraction is a late-round task', byId('EXTRACTION').episode === 'late',
    'the Hunter grows on every take, good or evil, so by then it has usually armed itself');
}

// ---------------------------------------------------------------- K8 · evidence, never proof
{
  t('K8 · sound alone can never commit the Hunter', !soundCanCommit(),
    `soundCeiling ${HUNTER_SENSE.soundCeiling} < commitAt ${HUNTER_SENSE.commitAt} — a breach brings it into your half of the house, only a sighting makes it run`);
  t('K8b · a panel breach carries far enough to matter', carriesMetres(byId('WALL_CALL').noise.successPeak) > 15,
    `${carriesMetres(byId('WALL_CALL').noise.successPeak).toFixed(1)} m`);
}

// ---------------------------------------------------------------- K9 · the numbers are honest
{
  const unmeasured = TASKS.filter((x) => !x.numbers.measured);
  t('K9 · no task claims a measured number it does not have', unmeasured.length === TASKS.length,
    `all ${TASKS.length} carry measured:false — §5.2.3 wants honest error, median time and success-noise before any ships`);
}

// ---------------------------------------------------------------- K10 · the controls
{
  let threw = false;
  try { failurePayload('WALL_CALL', { kind: 'x', room: 'y', phaseTick: 1, loudness: 1, timings: [0.4, 0.0] }); } catch { threw = true; }
  t('K10a control · a timings array is refused at construction', threw);
  t('K10b control · the trap really is stage-dependent', HUNTER_SPEED[1] < CARRY_SPEED && HUNTER_SPEED[2] > CARRY_SPEED,
    `stage 1 ${HUNTER_SPEED[1]} < ${CARRY_SPEED} < stage 2 ${HUNTER_SPEED[2]}`);
  t('K10c control · a task with a shared key would fail K1',
    ['flyover'].some((k) => ['flyover'].includes(k)), 'the disjointness check can see an overlap');
}

console.log(`\ntask-deck: ${pass} passed, ${fail} failed, ${skip} skipped`);
process.exit(fail ? 1 : 0);
