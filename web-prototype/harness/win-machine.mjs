#!/usr/bin/env node
/**
 * 🏁 **win-machine — ESCAPE / BLOCK FIRE; W1–W4 AND CAMERAS-AS-SCORE DO NOT.**
 *
 *   node harness/win-machine.mjs
 *
 * `party-loop.md` Win / fold locked 2026-09-08. `task-win-escape-night.md`.
 * Old W1 / W2 / W3 / W4 and 2g1e endings are red. Escape ≥1 good PASS.
 * No-good-escape saboteur PASS. Do not restore W5.
 */

import { foldWin, WIN_TARGETS, OUTCOME, TICK_ORDER, outcomeLine } from '../src/party/win.js';
import { EPISODE_CAP } from '../src/party/phases.js';
import { createRoom } from '../src/party/room.js';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const t = (n, c, d = '') => { if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); } else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); } return c; };

const seats8 = Array.from({ length: 8 }, (_, i) => ({ id: `p${i + 1}` }));
const EVIL8 = new Set(['p7', 'p8']);
const align8 = (id) => (EVIL8.has(id) ? 'evil' : 'good');
const mk = (evts) => evts.map((e, i) => ({ seq: i, data: {}, ...e }));
const DEAL = { type: 'cast.deal', data: { seats: seats8 } };
const fold = (evts, count = 8, alignmentOf = align8) => foldWin(mk(evts), { count, alignmentOf });
const winSrc = readFileSync(new URL('../src/party/win.js', import.meta.url), 'utf8');

// ---------------------------------------------------------------- W0 · the arm
{
  const quiet = fold([DEAL, { type: 'phase.VERDICT', data: { episode: 2 } }]);
  t('W0 arm · an uneventful episode renews rather than firing something', quiet.outcome === OUTCOME.RENEWED && quiet.rule === null,
    `${quiet.outcome} · livingGood=${quiet.livingGood} livingEvil=${quiet.livingEvil}`);
}

// ---------------------------------------------------------------- killed paths · W1–W4 / cameras / 2g1e must NOT fire
{
  const w1 = fold([DEAL, { type: 'player.executed', data: { id: 'p7' } }, { type: 'player.executed', data: { id: 'p8' } }]);
  t('W1-dead · clearing every saboteur does NOT end the night', w1.rule === null && w1.outcome === OUTCOME.RENEWED
    && w1.livingEvil === 0);

  const w2 = fold([DEAL, ...Array(WIN_TARGETS[8].cameraTarget).fill({ type: 'run.camera_lit' })]);
  t('W2-dead · lighting the camera target does NOT end the night', w2.rule === null && w2.outcome === OUTCOME.RENEWED,
    `${w2.camerasLit} of ${WIN_TARGETS[8].cameraTarget}`);

  const w3 = fold([DEAL, ...['p1', 'p2', 'p3'].map((id) => ({ type: 'player.taken', data: { id } }))]);
  t('W3-dead · feeding the Hunter does NOT end the night', w3.rule === null && w3.outcome === OUTCOME.RENEWED,
    `fed ${w3.fed}`);

  const w4 = fold([DEAL,
    { type: 'player.executed', data: { id: 'p1' } }, { type: 'player.executed', data: { id: 'p2' } },
    { type: 'player.executed', data: { id: 'p3' } }, { type: 'player.executed', data: { id: 'p4' } },
  ]);
  t('W4-dead · parity does NOT end the night', w4.rule === null && w4.outcome === OUTCOME.RENEWED,
    `${w4.livingEvil} evil vs ${w4.livingGood} good`);

  t('no-W-fire · win.js has no W1–W5 fire aliases',
    !/fire\('W1'/.test(winSrc) && !/fire\('W2'/.test(winSrc)
    && !/fire\('W3'/.test(winSrc) && !/fire\('W4'/.test(winSrc)
    && !/fire\('W5'/.test(winSrc) && !winSrc.includes("TICK_ORDER = ['W1'"));

  const capMiss = fold([DEAL, { type: 'phase.CASTING', data: { episode: EPISODE_CAP } }, { type: 'phase.VERDICT', data: {} }]);
  t('cap-miss · running out of episodes short of an escape does NOT fold (not W5)',
    capMiss.rule === null && capMiss.outcome === OUTCOME.RENEWED, `episode ${capMiss.episode} of ${EPISODE_CAP}`);
  t('cap-miss-b · chrome for that fold is The season continues, not Production wins',
    outcomeLine(capMiss.outcome).includes('The season continues')
    && !outcomeLine(capMiss.outcome).includes('Production wins'));

  const w6 = fold([DEAL, { type: 'host.skip' }, { type: 'escape.blocked' }]);
  t('W6 · SKIP TO REUNION abandons without handing anyone a win',
    w6.rule === 'W6' && w6.outcome === OUTCOME.ABANDONED);
}

// ---------------------------------------------------------------- ESCAPE / BLOCK
{
  const esc = fold([DEAL, { type: 'player.escaped', data: { id: 'p1' } }]);
  t('ESCAPE · ≥1 good escaped is FINALE', esc.rule === 'ESCAPE' && esc.outcome === OUTCOME.FINALE
    && esc.escapedGood === 1);
  t('ESCAPE-chrome · the cast gets out, not The cast wins from cameras',
    outcomeLine(esc.outcome).includes('gets out')
    && !outcomeLine(esc.outcome).includes('The cast wins'));

  const block = fold([DEAL, { type: 'escape.blocked' }]);
  t('BLOCK · no good escape is saboteurs hold', block.rule === 'BLOCK' && block.outcome === OUTCOME.CANCELLED
    && block.escapedGood === 0);
  t('BLOCK-chrome · saboteurs hold the house, not Production wins',
    outcomeLine(block.outcome).includes('Saboteurs hold the house')
    && !outcomeLine(block.outcome).includes('Production wins'));

  const evilOnly = fold([DEAL, { type: 'player.escaped', data: { id: 'p7' } }, { type: 'escape.blocked' }]);
  t('ESCAPE-evil · an evil crossing does not FINALE; the block still holds',
    evilOnly.rule === 'BLOCK' && evilOnly.outcome === OUTCOME.CANCELLED && evilOnly.escapedGood === 0);

  const both = fold([DEAL, { type: 'player.escaped', data: { id: 'p2' } }, { type: 'escape.blocked' }]);
  t('ESCAPE-then-block · log order: a good escape already ended it',
    both.rule === 'ESCAPE' && both.outcome === OUTCOME.FINALE);

  const sameTick = foldWin([
    { seq: 0, type: 'cast.deal', data: { seats: seats8 } },
    { seq: 1, type: 'player.escaped', data: { id: 'p1' } },
    { seq: 1, type: 'escape.blocked', data: {} },
  ], { count: 8, alignmentOf: align8 });
  t('same-tick · ESCAPE beats BLOCK when they share a seq',
    sameTick.rule === 'ESCAPE' && sameTick.outcome === OUTCOME.FINALE);

  const assim = fold([DEAL, { type: 'player.taken', data: { id: 'p1', kind: 'assimilated' } }]);
  t('ASSIM · hunter assimilation does not end the night',
    assim.rule === null && assim.outcome === OUTCOME.RENEWED && assim.fed === 1);

  const capturedThenEsc = fold([
    DEAL,
    { type: 'player.taken', data: { id: 'p1', kind: 'assimilated' } },
    { type: 'player.escaped', data: { id: 'p2' } },
  ]);
  t('SHARE · a captured good still shares a teammate escape (FINALE)',
    capturedThenEsc.rule === 'ESCAPE' && capturedThenEsc.outcome === OUTCOME.FINALE
    && capturedThenEsc.escapedGood === 1 && capturedThenEsc.fed === 1);

  const execThenEsc = fold([
    DEAL,
    { type: 'player.executed', data: { id: 'p3' } },
    { type: 'player.escaped', data: { id: 'p4' } },
  ]);
  t('SHARE-b · an executed good still shares a teammate escape',
    execThenEsc.rule === 'ESCAPE' && execThenEsc.outcome === OUTCOME.FINALE);

  const capturedThenBlock = fold([
    DEAL,
    { type: 'player.taken', data: { id: 'p1', kind: 'assimilated' } },
    { type: 'player.executed', data: { id: 'p2' } },
    { type: 'escape.blocked' },
  ]);
  t('SHARE-c · captured goods share the saboteur hold when nobody crosses',
    capturedThenBlock.rule === 'BLOCK' && capturedThenBlock.outcome === OUTCOME.CANCELLED
    && capturedThenBlock.escapedGood === 0);
}

// ---------------------------------------------------------------- W7 · log order IS precedence
{
  const escThenBlock = fold([DEAL,
    { type: 'player.escaped', data: { id: 'p1' } },
    { type: 'escape.blocked' },
  ]);
  const blockThenEsc = fold([DEAL,
    { type: 'escape.blocked' },
    { type: 'player.escaped', data: { id: 'p1' } },
  ]);
  t('W7 · swapping the order of the same two events swaps the winner',
    escThenBlock.outcome === OUTCOME.FINALE && blockThenEsc.outcome === OUTCOME.CANCELLED,
    `escape-first -> ${escThenBlock.rule} · block-first -> ${blockThenEsc.rule}`);
}

// ---------------------------------------------------------------- W8 · exactly once, and targets are ledger only
{
  const many = fold([DEAL,
    { type: 'player.escaped', data: { id: 'p1' } },
    { type: 'escape.blocked' },
    ...Array(4).fill({ type: 'run.camera_lit' }),
    { type: 'phase.VERDICT', data: {} },
  ]);
  t('W8 · the first predicate to go true ends the match and nothing after it counts',
    many.rule === 'ESCAPE' && many.atSeq === 1, `fired ${many.rule} at seq ${many.atSeq}`);

  t('W8b · the targets are the Reunion ledger, not a win fire', [4, 5, 6, 7, 8].every((n) => {
    const w = WIN_TARGETS[n];
    return w.cameraTarget === (n <= 5 ? 3 : 4) && w.feedTarget === (n <= 5 ? 2 : 3);
  }), [4, 5, 6, 7, 8].map((n) => `${n}p:${WIN_TARGETS[n].cameraTarget}cam/${WIN_TARGETS[n].feedTarget}fed`).join(' '));

  t('W8c · same-tick order is written in exactly one place', TICK_ORDER.join(',') === 'ESCAPE,BLOCK');
  t('W8c2 · win.js contains no cameras-short Production fire', !/fire\('W5'/.test(winSrc));
  t('HOLD · win.js does not implement KEEP/EXPEL or a guide/runner replacement',
    !/escape\.expel|player\.expelled|KEEP\/EXPEL/.test(winSrc)
    && /party-loop-win-fold-2026-09-08/.test(winSrc)
    && /task-hold-guide-runner-borrow-later/.test(winSrc));
}

// ---------------------------------------------------------------- W9 · the controls
{
  const oneShort = fold([DEAL, ...Array(WIN_TARGETS[8].cameraTarget - 1).fill({ type: 'run.camera_lit' })]);
  t('W9a control · cameras still do not end it one short — or at the target', oneShort.rule === null && oneShort.outcome === OUTCOME.RENEWED,
    `${oneShort.camerasLit} lit`);

  const oneTake = fold([DEAL, { type: 'player.taken', data: { id: 'p1' } }]);
  t('W9b control · one assimilation does NOT end it', oneTake.rule === null,
    `fed ${oneTake.fed}`);

  const evilFed = fold([DEAL, ...['p7', 'p8', 'p1'].map((id) => ({ type: 'player.taken', data: { id } }))]);
  t('W9c control · taking every evil still does not FINALE; fed counts goods only',
    evilFed.rule === null && evilFed.fed === 1 && evilFed.livingEvil === 0,
    `fed=${evilFed.fed}, livingEvil=${evilFed.livingEvil}`);
}

// ---------------------------------------------------------------- W10 · a session actually ends — on escape / block, not cameras
{
  let unended = null, noRule = null;
  const rules = new Set();
  for (const seed of [3, 4, 5, 6, 7, 8, 11, 13]) {
    const r = createRoom({ count: 8, castSeed: seed * 7, worldSeed: seed, send: () => {}, emit: () => {} });
    r.start();
    const goodId = r.deal.seats.find((s) => s.alignment === 'good')?.id;
    r.playMatch((ep) => ({
      hunterRoom: 'cellar',
      escaped: ep === 2 && seed % 2 === 1 ? [goodId] : null,
      blocked: ep >= EPISODE_CAP,
    }));
    const out = r.state.outcome;
    if (!out || out === OUTCOME.RENEWED) { unended = `seed ${seed} finished on ${out}`; break; }
    const checked = r.log.all().filter((e) => e.type === 'win.checked').at(-1);
    if (!checked?.data?.rule) noRule = noRule || `seed ${seed}: ${out} with no rule`;
    if (checked?.data?.rule) rules.add(checked.data.rule);
    if (r.state.episode > EPISODE_CAP + 8) { unended = `seed ${seed} ran past the hang bound to ${r.state.episode}`; break; }
  }
  t('W10 · every match ends on an outcome that is not RENEWED',
    unended === null, unended || `8 seeds · rules seen: ${[...rules].join(',') || 'none'}`);
  t('W10b · and each ending names ESCAPE or BLOCK',
    noRule === null && [...rules].every((x) => x === 'ESCAPE' || x === 'BLOCK'),
    noRule || [...rules].join(','));

  const quiet = createRoom({ count: 8, castSeed: 4242, worldSeed: 42, send: () => {}, emit: () => {} });
  quiet.start();
  for (let i = 0; i < EPISODE_CAP + 3; i++) {
    if (quiet.state.outcome && quiet.state.outcome !== OUTCOME.RENEWED) break;
    quiet.playEpisode({ scaffold: false, hunterRoom: 'cellar' });
  }
  t('W10c · a night where nothing happens stays RENEWED past the cap — cameras short is not a fold',
    quiet.state.outcome === OUTCOME.RENEWED && quiet.state.episode > EPISODE_CAP,
    `${quiet.state.outcome} after ${quiet.state.episode - 1} episodes, cap ${EPISODE_CAP}`);
  t('W10d · and the last aired verdict is RENEWED — chrome says the season continues',
    quiet.log.all().filter((e) => e.type === 'verdict.aired').at(-1)?.data?.status === OUTCOME.RENEWED
      && quiet.log.all().filter((e) => e.type === 'win.checked').at(-1)?.data?.rule == null
      && outcomeLine(OUTCOME.RENEWED).includes('The season continues'),
    JSON.stringify(quiet.log.all().filter((e) => e.type === 'verdict.aired').at(-1)?.data));
}

// ---------------------------------------------------------------- W11 · H278 overruled · cap miss is RENEWED
{
  const dusk = foldWin(mk([DEAL, { type: 'phase.VERDICT', data: {} }]), {
    count: 8, alignmentOf: align8, aired: EPISODE_CAP,
  });
  t('W11 · at the cap with 0 of 4 cameras the fold is RENEWED, never Production',
    dusk.outcome === OUTCOME.RENEWED && dusk.rule === null && dusk.camerasLit === 0,
    `${dusk.outcome} · ${dusk.rule} · ${dusk.camerasLit} cam`);
  t('W11b · chrome for that fold is The season continues, not Production wins',
    outcomeLine(dusk.outcome).includes('The season continues')
      && !outcomeLine(dusk.outcome).includes('Production wins'));

  const short = fold([
    DEAL,
    ...Array(WIN_TARGETS[8].cameraTarget - 1).fill({ type: 'run.camera_lit' }),
    { type: 'phase.VERDICT', data: { episode: EPISODE_CAP } },
  ]);
  t('W11c · one camera short at the cap is still a miss — and still RENEWED',
    short.outcome === OUTCOME.RENEWED && short.rule === null && short.camerasLit === 3,
    `${short.camerasLit} lit · ${short.outcome}`);

  const mid = fold([DEAL, { type: 'phase.VERDICT', data: { episode: 2 } }]);
  t('W11d control · before the cap, 0 cameras is still RENEWED',
    mid.outcome === OUTCOME.RENEWED && mid.rule === null);
}

// ---------------------------------------------------------------- W12 · 2g1e is not a last-vote ending
{
  const LAST_VOTE = [
    DEAL,
    { type: 'player.executed', data: { id: 'p8' } },
    { type: 'player.executed', data: { id: 'p1' } },
    { type: 'player.executed', data: { id: 'p2' } },
    { type: 'player.executed', data: { id: 'p3' } },
    { type: 'player.executed', data: { id: 'p4' } },
  ];

  const twoOne = fold([
    ...LAST_VOTE,
    { type: 'phase.VERDICT', data: { episode: EPISODE_CAP } },
  ]);
  t('W12 · 8p deal → 2g1e at EPISODE_CAP cameras 0 → RENEWED (not a last-vote ending)',
    twoOne.outcome === OUTCOME.RENEWED && twoOne.rule === null
    && twoOne.livingGood === 2 && twoOne.livingEvil === 1
    && twoOne.camerasLit === 0,
    `${twoOne.outcome} · ${twoOne.rule} · ${twoOne.livingGood}g ${twoOne.livingEvil}e`);
  t('W12b · chrome for that fold is The season continues, not Production wins',
    outcomeLine(twoOne.outcome).includes('The season continues')
    && !outcomeLine(twoOne.outcome).includes('Production wins'));

  const twoOneTail = foldWin(mk([...LAST_VOTE, { type: 'phase.VERDICT', data: {} }]), {
    count: 8, alignmentOf: align8, aired: EPISODE_CAP,
  });
  t('W12c · aired=cap agrees — 2g1e at the cap is still RENEWED',
    twoOneTail.outcome === OUTCOME.RENEWED && twoOneTail.rule === null
    && twoOneTail.livingGood === 2 && twoOneTail.livingEvil === 1,
    `${twoOneTail.outcome} · ${twoOneTail.rule}`);

  const killEvil = fold([...LAST_VOTE, { type: 'player.executed', data: { id: 'p7' } }]);
  t('W12d · last vote executes the remaining evil → still RENEWED (W1 is dead)',
    killEvil.rule === null && killEvil.outcome === OUTCOME.RENEWED
    && killEvil.livingEvil === 0);

  const killGood = fold([...LAST_VOTE, { type: 'player.executed', data: { id: 'p5' } }]);
  t('W12e · last vote executes a good → still RENEWED (W4 is dead)',
    killGood.rule === null && killGood.outcome === OUTCOME.RENEWED
    && killGood.livingGood === 1 && killGood.livingEvil === 1,
    `${killGood.livingEvil}e vs ${killGood.livingGood}g`);

  const threeOne = fold([
    DEAL,
    { type: 'player.executed', data: { id: 'p8' } },
    { type: 'player.executed', data: { id: 'p1' } },
    { type: 'player.executed', data: { id: 'p2' } },
    { type: 'player.executed', data: { id: 'p3' } },
    { type: 'phase.VERDICT', data: { episode: EPISODE_CAP } },
  ]);
  t('W12f · 3g1e at cap 0 cameras is RENEWED — do not ship 3v1-still-W5',
    threeOne.livingGood === 3 && threeOne.livingEvil === 1
    && threeOne.rule === null && threeOne.outcome === OUTCOME.RENEWED,
    `${threeOne.livingGood}g ${threeOne.livingEvil}e · ${threeOne.rule}`);
}

console.log(`\nwin-machine: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
