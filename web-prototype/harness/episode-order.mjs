#!/usr/bin/env node
/**
 * 🎬 **episode-order — THE TWO MACHINES RUN THE SAME NIGHT.**
 *
 *   node harness/episode-order.mjs
 *
 * There are two descriptions of an episode in this codebase and they are both load-bearing:
 * `phases.js` `orderFor` (what `playEpisode` walks, and what every budget number is computed
 * from) and `show.js` `AFTER_RUN_NEXT` (what the live SHOW clock walks for a real room). **They
 * disagreed about the premiere from the day the live clock was written until 2026-08-25** —
 * `orderFor` skipped Reckoning on episode 1, the wire never did — and nothing failed, because
 * each half had its own gate asserting its own behaviour was correct (`round-loop` R3,
 * `party-night` N17c against N17d). A table saw whichever half it happened to be driven by.
 *
 * That is the bug class this gate exists for. It does not assert an order; it asserts the two
 * machines AGREE, deriving the expected walk from `orderFor` so it follows any future change to
 * the running order and fails only when the halves drift apart again.
 *
 * ✅ **`WIRE_MISSING` IS EMPTY AS OF 2026-08-28, AND E2b IS NO LONGER VACUOUS.** This header used
 * to carry a standing instruction — *"the day Verdict grows a wire beat, delete it from that
 * list"* — because `VERDICT` was a designed phase that `show.js` had no beat for and the TV rail
 * drew as a label that never lit. That day came: `SHOW_BEATS` carries `verdict`, `AFTER_RUN_NEXT`
 * walks `execution → verdict → casting`, and `net/party/local.mjs` `enterVerdictLive` airs it. So
 * every beat `orderFor` designs is now on the wire, and E2 compares the two machines with no
 * exclusion list between them at all.
 *
 * ⚠️ **KEEP THE LIST, EMPTY.** It is the honest way to stage a designed beat ahead of its wire,
 * and E2b's detail line prints it. Adding a name back is allowed; leaving one there quietly is
 * the thing this gate exists to prevent.
 *
 * ⚠️ **`REUNION` IS NOT MISSING — IT IS NOT AN EPISODE BEAT.** It is not in `EPISODE_ORDER`, so
 * it is out of E2's scope by construction. The session-end edge into it (RENEWED plays on,
 * anything else ends the night) is gated by `party-night` N17h and N17j, which drive both sides.
 */

import { nextShowBeat, SHOW_BEATS, RUNDOWN_BEATS } from '../src/party/show.js';
import { PHASE, orderFor, premiere, episodeSeconds, sessionSeconds, EPISODE_CAP } from '../src/party/phases.js';
import { createRoom } from '../src/party/room.js';

let pass = 0, fail = 0;
const t = (n, c, d = '') => { if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); } else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); } return c; };

/** Designed beats the live wire does not have yet. Shrinking this list is progress. */
const WIRE_MISSING = [];
/** Beats the after-run chain does not cover because the run itself does. */
const NOT_AFTER_RUN = [PHASE.CASTING, PHASE.EXPEDITION];

// ---------------------------------------------------------------- E1 · no episode is special
{
  const first = orderFor(1).join();
  let bad = null;
  for (let ep = 2; ep <= 12; ep++) if (orderFor(ep).join() !== first) { bad = ep; break; }
  t('E1 · orderFor returns the same running order for every episode', bad === null,
    bad ? `ep ${bad} differs` : `${orderFor(1).length} phases, ep 1–12`);
  t('E1b · and the premiere costs exactly what an ordinary episode costs',
    episodeSeconds(1) === episodeSeconds(2), `${episodeSeconds(1)}s vs ${episodeSeconds(2)}s`);
  t('E1c · `premiere` still names the premiere, it just no longer gates the order',
    premiere(1) === true && premiere(2) === false);
}

// ---------------------------------------------------------------- E2 · the halves agree
{
  const designed = orderFor(1)
    .filter((p) => !NOT_AFTER_RUN.includes(p) && !WIRE_MISSING.includes(p))
    .map((p) => String(p).toLowerCase());

  const walk = (ep) => {
    const seen = [];
    let beat = 'recap';
    for (let i = 0; i < 16; i++) {
      seen.push(beat);
      const next = nextShowBeat(beat, ep);
      if (!next || next === 'casting') break;
      beat = next;
    }
    return seen;
  };

  let bad = null;
  for (let ep = 1; ep <= 8; ep++) {
    const live = walk(ep).join();
    if (live !== designed.join()) { bad = `ep${ep}: wire [${live}] vs orderFor [${designed.join()}]`; break; }
  }
  t('E2 · the live wire visits exactly the beats orderFor designs, on every episode',
    bad === null, bad || `ep 1–8 agree on [${designed.join()}]`);

  t('E2b · every designed beat is either on the wire or named in WIRE_MISSING',
    orderFor(1).every((p) => NOT_AFTER_RUN.includes(p) || WIRE_MISSING.includes(p)
      || SHOW_BEATS.includes(String(p).toLowerCase())),
    `missing: ${WIRE_MISSING.join(',') || 'none'}`);

  t('E2c · and the TV rail only advertises beats that are designed',
    RUNDOWN_BEATS.filter((b) => b !== 'lobby')
      .every((b) => orderFor(1).map((p) => String(p).toLowerCase()).includes(b)));
}

// ---------------------------------------------------------------- E3 · the wire has no premiere case
{
  let leaked = null;
  for (const beat of [...SHOW_BEATS, 'expedition']) {
    if (nextShowBeat(beat, 1) !== nextShowBeat(beat, 7)) { leaked = beat; break; }
  }
  t('E3 · no beat on the wire branches on the episode number', leaked === null, leaked || 'clean');
}

// ---------------------------------------------------------------- E4 · a real premiere reaches the vote
{
  const r = createRoom({ count: 8, castSeed: 4, worldSeed: 4, send: () => {}, emit: () => {} });
  r.start();
  r.playEpisode({ hunterRoom: 'cellar' });
  const seen = r.log.all().filter((e) => e.type.startsWith('phase.')).map((e) => e.type.slice(6));
  t('E4 · playEpisode on episode 1 reaches RECKONING, VOTE and VERDICT',
    seen.includes('RECKONING') && seen.includes('VOTE') && seen.includes('VERDICT'), seen.join('/'));
}

// ---------------------------------------------------------------- E6 · both machines count alike
/* =================================================================================================
 * 🔢 **HOW MANY EPISODES A SEASON LASTS — and the two machines had different answers.**
 *
 * E2 above compares the two descriptions of ONE episode. This compares their answer to the
 * question one layer up, which they were free to disagree about until 2026-08-28 and did:
 * `foldVerdict` measured `EPISODE_CAP` against `state.episode`, and `playEpisode` bumps that
 * before the LIVE verdict beat is reached but after the OFFLINE one. A real room stopped after
 * four of five episodes; the offline machine stopped after five. Both had a green gate.
 *
 * The fix was `state.airingEpisode` — the episode ON THE AIR, set by both paths at the top of the
 * episode, so it means the same thing in both. This asserts the property rather than the fix: a
 * season that decides nothing runs exactly `EPISODE_CAP` episodes, counted the way a viewer would.
 * The live half is `party-night` N17n, which drives a real socket room to the same number.
 * ================================================================================================= */
{
  const quiet = createRoom({ count: 8, castSeed: 77, worldSeed: 7, send: () => {}, emit: () => {} });
  quiet.start();
  let aired = 0;
  for (let i = 0; i < EPISODE_CAP + 4; i++) {
    if (quiet.outcome() && quiet.outcome() !== 'RENEWED') break;
    quiet.playEpisode({ scaffold: false, hunterRoom: 'cellar' });
    aired++;
  }
  t('E6 · a season that decides nothing airs exactly EPISODE_CAP episodes and then stops',
    aired === EPISODE_CAP && quiet.outcome() === 'CANCELLED',
    `${aired} aired, cap ${EPISODE_CAP}, ended ${quiet.outcome()}`);
  t('E6b · and the aired number is what the verdict reports — not the one being set up',
    quiet.log.all().filter((e) => e.type === 'verdict.aired').length === EPISODE_CAP
      && quiet.state.airingEpisode === EPISODE_CAP,
    `airing ${quiet.state.airingEpisode}, episode ${quiet.state.episode}`);
}

// ---------------------------------------------------------------- E5 · the decision still fits the window
/*
 * Keeping the premiere vote cost 105s, and this is the assertion that said it was affordable.
 *
 * ⚠️ **IT FIRED EXACTLY AS DESIGNED ON 2026-08-25 AND THE ANSWER WAS "YES, SPEND IT".** Debrief
 * went 75s -> 300s, which took the absolute worst case to 56.1 min, and E5 was the first gate to
 * go red — which is the whole reason it exists. John took the trade knowingly: Debrief is a
 * CEILING now, ended by a majority tapping READY (`party-night` N21), and 600 simulated matches
 * showed the night cannot be shortened by cutting episodes instead (only 7.3% of games finish by
 * episode 3; an eight-player table averages 4.98).
 *
 * So the threshold moved to sixty minutes and the forty-minute claim moved to `round-loop` R2c,
 * where it is asserted against the night a real table PLAYS rather than the one it could
 * theoretically suffer. **This is still the assertion that fails first if a beat's duration
 * grows** — that job is unchanged, only the number moved, and it must not be quietly widened
 * again without the same kind of argument.
 */
{
  const worst = sessionSeconds(EPISODE_CAP, 3) / 60;
  t('E5 · the worst case still stops inside an hour with the premiere voting', worst < 60,
    `${worst.toFixed(1)} min at ${EPISODE_CAP} episodes, three noms each · `
    + 'the 40-minute claim now lives in round-loop R2c, measured on a table that taps READY');
}

console.log(`\nepisode-order: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
