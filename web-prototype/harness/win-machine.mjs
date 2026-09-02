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

import { foldWin, WIN_TARGETS, OUTCOME, TICK_ORDER, outcomeLine } from '../src/party/win.js';
import { EPISODE_CAP } from '../src/party/phases.js';
import { createRoom } from '../src/party/room.js';

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

// ---------------------------------------------------------------- W10 · a session actually ends
/* =================================================================================================
 * 🏁 **THE ASSERTION THAT COULD NOT BE WRITTEN UNTIL 2026-08-28 — a session TERMINATES.**
 *
 * Every rule above was gated against a hand-built log, which proves the fold and proves nothing
 * about the game: `PRIME-TIME-STATE.md` §2 said it flatly — *"Nothing ever ends a session."*
 * `EPISODE_CAP` was a number in a table no code enforced, `foldWin`'s only caller was the offline
 * `playEpisode`, and W6 had no emitter. So this is the missing half: drive real rooms and assert
 * they stop.
 *
 * ⚠️ **THE CONTROL IS THE INTERESTING ARM.** A machine that always ends is not the property —
 * `playMatch`'s own `while` would satisfy "it terminates" by hanging up on episode 1. What has to
 * hold is that it ends for a REASON the fold names, and never on RENEWED. 2g1e at the cap is
 * RENEWED on purpose (the last vote); that extra episode is not a hang.
 * ============================================================================================== */
{
  let unended = null, noRule = null;
  const rules = new Set();
  for (const seed of [3, 5, 7, 9, 11, 13, 17, 19]) {
    const r = createRoom({ count: 8, castSeed: seed * 7, worldSeed: seed, send: () => {}, emit: () => {} });
    r.start();
    r.playMatch({ hunterRoom: 'cellar' });
    const out = r.state.outcome;
    if (!out || out === OUTCOME.RENEWED) { unended = `seed ${seed} finished on ${out}`; break; }
    const checked = r.log.all().filter((e) => e.type === 'win.checked').at(-1);
    if (!checked?.data?.rule && out !== OUTCOME.CANCELLED) noRule = noRule || `seed ${seed}: ${out} with no rule`;
    if (checked?.data?.rule) rules.add(checked.data.rule);
    /*
     * Last vote may air EPISODE_CAP+1. That extra episode is the ending, not a hang.
     * A seed that never stops at all is still a hang — R2e is the live time backstop.
     */
    if (r.state.episode > EPISODE_CAP + 8) { unended = `seed ${seed} ran past the last-vote room to ${r.state.episode}`; break; }
  }
  t('W10 · every match ends on an outcome that is not RENEWED',
    unended === null, unended || `8 seeds · rules seen: ${[...rules].join(',') || 'cap only'}`);
  t('W10b · and each ending names the rule that caused it', noRule === null, noRule || 'all attributed');

  /*
   * The cap is the backstop and `foldVerdict` is the only place it is enforced: a season that runs
   * out of episodes without lighting its cameras is one Production won. Asserted here as the
   * TERMINATION guarantee — with no rule firing at all, the night still has to stop.
   */
  const quiet = createRoom({ count: 8, castSeed: 4242, worldSeed: 42, send: () => {}, emit: () => {} });
  quiet.start();
  for (let i = 0; i < EPISODE_CAP + 3; i++) {
    if (quiet.state.outcome && quiet.state.outcome !== OUTCOME.RENEWED) break;
    quiet.playEpisode({ scaffold: false, hunterRoom: 'cellar' });
  }
  t('W10c · a night where nothing happens still ends at EPISODE_CAP, and evil takes it',
    quiet.state.outcome === OUTCOME.CANCELLED && quiet.state.episode > EPISODE_CAP,
    `${quiet.state.outcome} after ${quiet.state.episode - 1} episodes, cap ${EPISODE_CAP}`);
  t('W10d · and the last aired verdict is CANCELLED — never RENEWED at the cap (H278)',
    quiet.log.all().filter((e) => e.type === 'verdict.aired').at(-1)?.data?.status === OUTCOME.CANCELLED
      && quiet.log.all().filter((e) => e.type === 'win.checked').at(-1)?.data?.rule === 'W5',
    JSON.stringify(quiet.log.all().filter((e) => e.type === 'verdict.aired').at(-1)?.data));
}

// ---------------------------------------------------------------- W11 · H278 · cap miss is never RENEWED
{
  const dusk = foldWin(mk([DEAL, { type: 'phase.VERDICT', data: {} }]), {
    count: 8, alignmentOf: align8, aired: EPISODE_CAP,
  });
  t('W11 · at the cap with 0 of 4 cameras the fold is CANCELLED, never RENEWED',
    dusk.outcome === OUTCOME.CANCELLED && dusk.rule === 'W5' && dusk.camerasLit === 0,
    `${dusk.outcome} · ${dusk.rule} · ${dusk.camerasLit} cam`);
  t('W11b · chrome for that fold is Production, not "the season continues"',
    outcomeLine(dusk.outcome).includes('Production wins')
      && !outcomeLine(dusk.outcome).includes('continues'));

  const short = fold([
    DEAL,
    ...Array(WIN_TARGETS[8].cameraTarget - 1).fill({ type: 'run.camera_lit' }),
    { type: 'phase.VERDICT', data: { episode: EPISODE_CAP } },
  ]);
  t('W11c · one camera short at the cap is still a miss — CANCELLED',
    short.outcome === OUTCOME.CANCELLED && short.rule === 'W5' && short.camerasLit === 3,
    `${short.camerasLit} lit · ${short.outcome}`);

  const mid = fold([DEAL, { type: 'phase.VERDICT', data: { episode: 2 } }]);
  t('W11d control · before the cap, 0 cameras is still RENEWED',
    mid.outcome === OUTCOME.RENEWED && mid.rule === null);
}

// ---------------------------------------------------------------- W12 · 2g1e at the cap is the last vote, not W5
/* =================================================================================================
 * CAST7 / John 2026-09-03. Two goods and one evil, cameras 0/4, the cap fired W5 and the
 * room never voted for Dee. 2g1e is RENEWED. Execute the remaining evil → W1. Execute a
 * good → W4. 3g1e at the cap is still W5 — do not invent a 3v1 skip. W4 `>=` is unchanged.
 * ============================================================================================== */
{
  /*
   * Kill 1 evil then 4 goods by execute (not take) so W3's feed target cannot fire.
   * After p8: 6g 1e. After four goods: 2g 1e. W4's `1 >= 2` stays false.
   */
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
  t('W12 · 8p deal → 2g1e at EPISODE_CAP cameras 0 → RENEWED, not W5',
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
  t('W12c · the H278 tail agrees — 2g1e at the cap is still RENEWED',
    twoOneTail.outcome === OUTCOME.RENEWED && twoOneTail.rule === null
    && twoOneTail.livingGood === 2 && twoOneTail.livingEvil === 1,
    `${twoOneTail.outcome} · ${twoOneTail.rule}`);

  const killEvil = fold([...LAST_VOTE, { type: 'player.executed', data: { id: 'p7' } }]);
  t('W12d · last vote executes the remaining evil → W1 FINALE',
    killEvil.rule === 'W1' && killEvil.outcome === OUTCOME.FINALE
    && killEvil.livingEvil === 0);

  const killGood = fold([...LAST_VOTE, { type: 'player.executed', data: { id: 'p5' } }]);
  t('W12e · last vote executes a good → W4 CANCELLED (parity)',
    killGood.rule === 'W4' && killGood.outcome === OUTCOME.CANCELLED
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
  t('W12f control · 3g1e at cap 0 cameras is still W5 — do not invent a 3v1 skip',
    threeOne.livingGood === 3 && threeOne.livingEvil === 1
    && threeOne.rule === 'W5' && threeOne.outcome === OUTCOME.CANCELLED,
    `${threeOne.livingGood}g ${threeOne.livingEvil}e · ${threeOne.rule}`);
}

console.log(`\nwin-machine: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
