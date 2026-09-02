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
  [PHASE.RECAP]: 10,
  /**
   * 🚨 **A CEILING, NOT A WAIT.** 75 -> 300 on 2026-08-25, John's call: he wanted Blood on the
   * Clocktower's long day, where five minutes of argument is normal. The beat is ended by the
   * ROOM — a majority tapping READY (`show.js` `readyNeeded`) — and this number is only what
   * happens if nobody does.
   *
   * ⚠️ **IT COST THE FORTY-MINUTE PROMISE, AND THAT WAS THE DECISION.** `round-loop` R2c used to
   * assert the worst case stayed under forty minutes. At five episodes a 300s Debrief makes the
   * worst case 56.1 min, and it cannot be bought back by shortening the night: 600 simulated
   * matches showed only **7.3%** finish by episode 3 and an eight-player table averages **4.98**
   * episodes, so cutting `EPISODE_CAP` would force-end ~93% of games on a technicality.
   *
   * What replaced it: R2c now asserts the TYPICAL night — every Debrief ended at ~90s, which is
   * 38.6 min — and R2e asserts a hard sixty-minute ceiling so drift is still caught. The promise
   * is weaker on purpose. A table that never taps READY gets an hour.
   *
   * If long Debriefs turn out to drag at a real table, THIS is the line to change back, and
   * `round-loop` R2/R2c/R2e are the assertions that will tell you what moves with it.
   */
  [PHASE.DEBRIEF]: 300,
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
 * 🚨 **EVERY EPISODE RUNS THE FULL ORDER, PREMIERE INCLUDED.** John's call, 2026-08-25.
 *
 * This file used to stop episode 1 after Debrief, on the argument that nobody has anything to go
 * on in the premiere and an eviction decided on nothing teaches a table that the vote is
 * arbitrary. **The live SHOW clock never implemented that skip** — `show.js` walked
 * `debrief → reckoning` on every episode and `party-night` N17d gated it that way — so the two
 * machines disagreed for as long as both existed, and the premiere behaved differently depending
 * on whether you were reading `playEpisode` or watching a real room.
 *
 * Asked which was right, John kept the vote: *"I don't know why we would skip it."* The live
 * behaviour was already the shipped one, and a premiere that teaches the loop without ever
 * showing the vote teaches half of it.
 *
 * ⚠️ **The old argument is overruled, not refuted.** It is a table-feel question and it is
 * answered by playtesting a premiere, not by reading this file. If an episode-1 eviction turns
 * out to feel arbitrary at a real table, THIS is the line to change back — and `episode-order`
 * is the gate that will tell you everything that moves with it.
 *
 * **The number:** ep1 gains 105s (reckoning 45 + vote 25 + execution 20 + verdict 15). A 4/5/6
 * episode night goes 26:25 / 31:50 / 37:15 → **28:10 / 33:35 / 39:00**, and the worst case —
 * the 90s Reckoning TIME wall every episode at `EPISODE_CAP` (seven unique names still fit;
 * `reckoningSeconds(3)` and `reckoningSeconds(7)` are both the cap) — goes 34:50 → **37:20**,
 * still inside the forty minutes `round-loop` R2c guards. Instrument: `harness/round-loop.mjs` R2/R3.
 */
export const premiere = (ep) => ep === 1;

/**
 * The order every episode runs in. Takes no episode any more, and keeps the parameter position
 * so the existing `orderFor(ep)` call sites read the same. `premiere` survives as the predicate
 * for premiere COPY (the role card's first-night sheet), not for the running order.
 */
export const orderFor = () => EPISODE_ORDER;

/** `RECKONING` gains 15s per nomination, hard cap 90s. The cap is a TIME wall, not a count cap. */
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

/**
 * Vote → execution → verdict may not print OUT until driver and chrome share
 * HIT or no-HIT. Not a SHOW beat. W5 stays gone.
 *
 * @param {{executed?:string|null}|null} driver
 * @param {{executed?:string|null}|null} chrome
 */
export function hitHoldReady(driver, chrome) {
  if (!driver || !chrome) return false;
  if (!Object.prototype.hasOwnProperty.call(driver, 'executed')) return false;
  if (!Object.prototype.hasOwnProperty.call(chrome, 'executed')) return false;
  return String(driver.executed ?? '') === String(chrome.executed ?? '');
}
