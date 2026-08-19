/**
 * ⏱️ **THE SHOOTING SCHEDULE.** `docs/design/rrr-social-round.md` §1.
 *
 * The show never leaves the air. These are not a day/night cycle — good and evil can act from a
 * phone at any time — they are the beats of a live broadcast, which is what gives the round a
 * shape without ever taking anyone's agency away.
 *
 * ⚠️ EXTENDS `run.js`'s PHASE, DOES NOT REPLACE IT. `src/game/run.js` already owns
 * EXPLORE/WINDDOWN/DETONATION/RESULTS for the survival mode, with authority-gated mutators and
 * `syncPhase`/`applySnapshot`. **It needs zero edits for D12**: the bomb is structurally
 * unreachable from here because `WINDDOWN` is entered only from `escape()` (run.js L312-317) and
 * the party mode exits through `finish()` (run.js L342). Verified, not assumed.
 *
 * No THREE, no DOM.
 */

export const PHASE = {
  PREMIERE:   'PREMIERE',
  CASTING:    'CASTING',
  EXPEDITION: 'EXPEDITION',
  RECAP:      'RECAP',
  DEBRIEF:    'DEBRIEF',
  RECKONING:  'RECKONING',
  VOTE:       'VOTE',
  EXECUTION:  'EXECUTION',
  VERDICT:    'VERDICT',
  REUNION:    'REUNION',
};

/** Seconds. `RECKONING` is a floor; see `reckoningSeconds`. */
export const SECONDS = {
  [PHASE.PREMIERE]: 150,
  [PHASE.CASTING]: 45,
  [PHASE.EXPEDITION]: 90,
  [PHASE.RECAP]: 20,
  [PHASE.DEBRIEF]: 75,
  [PHASE.RECKONING]: 45,
  [PHASE.VOTE]: 25,
  [PHASE.EXECUTION]: 20,
  [PHASE.VERDICT]: 15,
  [PHASE.REUNION]: 240,
};

/** The order an ordinary episode runs in. */
export const EPISODE_ORDER = [
  PHASE.CASTING, PHASE.EXPEDITION, PHASE.RECAP, PHASE.DEBRIEF,
  PHASE.RECKONING, PHASE.VOTE, PHASE.EXECUTION, PHASE.VERDICT,
];

/**
 * 🚨 EPISODE 1 SKIPS THE RECKONING AND EVERYTHING AFTER IT. Nobody has anything to go on in the
 * premiere, and an eviction decided on nothing is the fastest way to teach a table that the vote
 * is arbitrary. Episode 1's job is to teach the loop.
 */
export const premiere = (ep) => ep === 1;
export const orderFor = (ep) => (premiere(ep) ? EPISODE_ORDER.slice(0, 4) : EPISODE_ORDER);

/** `RECKONING` gains 15s per nomination, hard cap 90s. */
export const RECKONING_PER_NOM = 15;
export const RECKONING_CAP = 90;
export const reckoningSeconds = (noms) =>
  Math.min(RECKONING_CAP, SECONDS[PHASE.RECKONING] + RECKONING_PER_NOM * noms);

/** What keeps the worst case inside forty minutes. */
export const EPISODE_CAP = 5;

export const episodeSeconds = (ep, noms = 0) =>
  orderFor(ep).reduce((a, p) => a + (p === PHASE.RECKONING ? reckoningSeconds(noms) : SECONDS[p]), 0);

/** Whole-session budget, premiere + N episodes + Reunion. */
export function sessionSeconds(episodes, noms = 0) {
  let s = SECONDS[PHASE.PREMIERE] + SECONDS[PHASE.REUNION];
  for (let ep = 1; ep <= episodes; ep++) s += episodeSeconds(ep, noms);
  return s;
}
