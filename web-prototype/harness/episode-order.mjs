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
 * ⚠️ **E2 EXCLUDES `VERDICT` ON PURPOSE AND THAT IS A KNOWN GAP, NOT A CONVENIENCE.** The wire
 * has no `verdict` beat — `show.js` says so itself, and `RUNDOWN_BEATS` shows it on the TV rail
 * as a label that never lights. `WIRE_MISSING` below names it. **The day Verdict grows a wire
 * beat, delete it from that list** and E2b will stop passing vacuously.
 */

import { nextShowBeat, SHOW_BEATS, RUNDOWN_BEATS } from '../src/party/show.js';
import { PHASE, orderFor, premiere, episodeSeconds, sessionSeconds, EPISODE_CAP } from '../src/party/phases.js';
import { createRoom } from '../src/party/room.js';

let pass = 0, fail = 0;
const t = (n, c, d = '') => { if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); } else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); } return c; };

/** Designed beats the live wire does not have yet. Shrinking this list is progress. */
const WIRE_MISSING = [PHASE.VERDICT];
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

// ---------------------------------------------------------------- E5 · the decision still fits the window
{
  // Keeping the premiere vote cost 105s. This is the assertion that says it was affordable, and
  // the one that will fail first if any beat's duration grows.
  const worst = sessionSeconds(EPISODE_CAP, 3) / 60;
  t('E5 · the worst case still fits forty minutes with the premiere voting', worst < 40,
    `${worst.toFixed(1)} min at ${EPISODE_CAP} episodes, three noms each`);
}

console.log(`\nepisode-order: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
