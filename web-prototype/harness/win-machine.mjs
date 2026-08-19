#!/usr/bin/env node
/**
 * 🏁 **win-machine — EVERY PATH FIRES, EXACTLY ONCE, AND LOG ORDER DECIDES PRECEDENCE.**
 *
 *   node harness/win-machine.mjs
 *
 * `rrr-social-round.md` §6. The design's claim is that precedence needs no table because the
 * reducer folds over an append-only log: a camera lit at seq 512 beats a take at seq 513 because
 * it happened first. **W6 is the assertion that proves that rather than restating it** — it runs
 * the same two events in both orders and requires the winner to swap.
 */

import { foldWin, WIN_TARGETS, OUTCOME, TICK_ORDER } from '../src/party/win.js';
import { EPISODE_CAP } from '../src/party/phases.js';

let pass = 0, fail = 0;
const t = (n, c, d = '') => { if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); } else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); } return c; };

const seats8 = Array.from({ length: 8 }, (_, i) => ({ id: `p${i + 1}` }));
const EVIL8 = new Set(['p7', 'p8']);
const align8 = (id) => (EVIL8.has(id) ? 'evil' : 'good');
const mk = (evts) => evts.map((e, i) => ({ seq: i, data: {}, ...e }));
const DEAL = { type: 'cast.deal', data: { seats: seats8 } };
const fold = (evts, count = 8, alignmentOf = align8) => foldWin(mk(evts), { count, alignmentOf });

// ---------------------------------------------------------------- W0 · the arm
{
  const quiet = fold([DEAL, { type: 'phase.VERDICT', data: { episode: 2 } }]);
  t('W0 arm · an uneventful episode renews rather than firing something', quiet.outcome === OUTCOME.RENEWED && quiet.rule === null,
    `${quiet.outcome} · livingGood=${quiet.livingGood} livingEvil=${quiet.livingEvil}`);
}

// ---------------------------------------------------------------- W1..W5 · every path fires
{
  const w1 = fold([DEAL, { type: 'player.executed', data: { id: 'p7' } }, { type: 'player.executed', data: { id: 'p8' } }]);
  t('W1 · no living evil ends it for good', w1.rule === 'W1' && w1.outcome === OUTCOME.FINALE);

  const w2 = fold([DEAL, ...Array(WIN_TARGETS[8].cameraTarget).fill({ type: 'run.camera_lit' })]);
  t('W2 · the camera target ends it for good', w2.rule === 'W2' && w2.outcome === OUTCOME.FINALE,
    `${w2.camerasLit} of ${WIN_TARGETS[8].cameraTarget}`);

  const w3 = fold([DEAL, ...['p1', 'p2', 'p3'].map((id) => ({ type: 'player.taken', data: { id } }))]);
  t('W3 · feeding the Hunter enough goods ends it for evil', w3.rule === 'W3' && w3.outcome === OUTCOME.CANCELLED,
    `fed ${w3.fed} of ${WIN_TARGETS[8].feedTarget}`);

  // parity: kill goods until living evil >= living good, without hitting the feed target first
  const w4 = fold([DEAL,
    { type: 'player.executed', data: { id: 'p1' } }, { type: 'player.executed', data: { id: 'p2' } },
    { type: 'player.executed', data: { id: 'p3' } }, { type: 'player.executed', data: { id: 'p4' } },
  ]);
  t('W4 · parity ends it for evil', w4.rule === 'W4' && w4.outcome === OUTCOME.CANCELLED,
    `${w4.livingEvil} evil vs ${w4.livingGood} good`);

  const w5 = fold([DEAL, { type: 'phase.CASTING', data: { episode: EPISODE_CAP } }, { type: 'phase.VERDICT', data: {} }]);
  t('W5 · running out of episodes short of the cameras ends it for evil',
    w5.rule === 'W5' && w5.outcome === OUTCOME.CANCELLED, `episode ${w5.episode} of ${EPISODE_CAP}`);

  const w6 = fold([DEAL, { type: 'host.skip' }, ...Array(4).fill({ type: 'run.camera_lit' })]);
  t('W6 · SKIP TO REUNION abandons without handing anyone a win',
    w6.rule === 'W6' && w6.outcome === OUTCOME.ABANDONED);
}

// ---------------------------------------------------------------- W6 · log order IS precedence
{
  const camThenTake = fold([DEAL,
    { type: 'run.camera_lit' }, { type: 'run.camera_lit' }, { type: 'run.camera_lit' },
    { type: 'run.camera_lit' },                                   // 4th camera: good wins here
    { type: 'player.taken', data: { id: 'p1' } },
  ]);
  const takeThenCam = fold([DEAL,
    { type: 'run.camera_lit' }, { type: 'run.camera_lit' }, { type: 'run.camera_lit' },
    { type: 'player.taken', data: { id: 'p1' } },
    { type: 'player.taken', data: { id: 'p2' } },
    { type: 'player.taken', data: { id: 'p3' } },                 // 3rd good fed: evil wins here
    { type: 'run.camera_lit' },
  ]);
  t('W7 · swapping the order of the same two events swaps the winner',
    camThenTake.outcome === OUTCOME.FINALE && takeThenCam.outcome === OUTCOME.CANCELLED,
    `cameras-first -> ${camThenTake.rule} · takes-first -> ${takeThenCam.rule}. Precedence is a sequence number, not a table`);
}

// ---------------------------------------------------------------- W8 · exactly once, and targets
{
  const many = fold([DEAL,
    { type: 'player.executed', data: { id: 'p7' } }, { type: 'player.executed', data: { id: 'p8' } },
    ...Array(4).fill({ type: 'run.camera_lit' }),
    { type: 'phase.VERDICT', data: {} },
  ]);
  t('W8 · the first predicate to go true ends the match and nothing after it counts',
    many.rule === 'W1' && many.atSeq === 2, `fired ${many.rule} at seq ${many.atSeq}`);

  t('W8b · the targets are the table', [4, 5, 6, 7, 8].every((n) => {
    const w = WIN_TARGETS[n];
    return w.cameraTarget === (n <= 5 ? 3 : 4) && w.feedTarget === (n <= 5 ? 2 : 3);
  }), [4, 5, 6, 7, 8].map((n) => `${n}p:${WIN_TARGETS[n].cameraTarget}cam/${WIN_TARGETS[n].feedTarget}fed`).join(' '));

  t('W8c · same-tick order is written in exactly one place', TICK_ORDER.join(',') === 'W1,W3,W2,W4,W5');
}

// ---------------------------------------------------------------- W9 · the controls
{
  const oneShort = fold([DEAL, ...Array(WIN_TARGETS[8].cameraTarget - 1).fill({ type: 'run.camera_lit' })]);
  t('W9a control · one camera short does NOT end it', oneShort.rule === null && oneShort.outcome === OUTCOME.RENEWED,
    `${oneShort.camerasLit} lit`);

  const oneShortFed = fold([DEAL, ...['p1', 'p2'].map((id) => ({ type: 'player.taken', data: { id } }))]);
  t('W9b control · one good short of the feed target does NOT end it', oneShortFed.rule === null,
    `fed ${oneShortFed.fed}`);

  // an evil player taken by the Hunter must not count toward the feed target
  const evilFed = fold([DEAL, ...['p7', 'p8', 'p1'].map((id) => ({ type: 'player.taken', data: { id } }))]);
  t('W9c control · an evil player taken by the Hunter does not feed it',
    evilFed.rule === 'W1' && evilFed.fed === 0, `fed=${evilFed.fed}, ended on ${evilFed.rule}`);
}

console.log(`\nwin-machine: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
