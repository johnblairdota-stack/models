/**
 * 📡 **THE MAP FEED — how long a GOOD guide is allowed to look at the hunter before the show
 * cuts them off, and why an EVIL one is never cut off at all.**
 *
 * John, after playing `0349ef6`:
 *
 *   *"When a good player is guide, the map may show the hunter briefly (few seconds), then the
 *   map feed is interrupted by static and spooky evil-robot effects… Evil guide keeps continuous
 *   exact runner+hunter without that interrupt."*
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 THE JAM IS A SERVER DECISION AND THE MARK IS GENUINELY OFF THE WIRE DURING IT.
 * ---------------------------------------------------------------------------------------------
 * The tempting shape is to keep sending the hunter and paint glyphs over it on the phone. That is
 * a screensaver, not a filter: the position is still in the devtools network tab, one
 * `JSON.parse` from a guide who wants it. `src/party/intel.js`'s header makes the same argument
 * about the good player's coarse read, and this is that argument applied to the map's marks —
 * `src/party/room.js` asks this function BEFORE it builds `flyover.marks`, so a jammed frame does
 * not contain a hunter for anything to hide.
 *
 * The phone is told `flyover.jam` so it can draw the interference honestly. That boolean is the
 * only thing the effect needs, and it is a `guide`-audience row like every other `flyover` field.
 *
 * ---------------------------------------------------------------------------------------------
 * ⚠️ WHY A CYCLE RATHER THAN A ONE-SHOT PEEK
 * ---------------------------------------------------------------------------------------------
 * "A few seconds then interrupted" read as a one-shot on the first pass, and a one-shot makes the
 * good guide's map dead furniture for the remaining twenty-odd seconds of every run — which is
 * the same complaint as D13's *"the map is yours"* over an empty screen, arriving by a different
 * door. A cycle keeps the map a thing worth watching: you get a window, you lose it, you get it
 * back, and the whole tension of the seat is remembering what you saw. `JAM_SECONDS` is
 * deliberately more than twice `PEEK_SECONDS` so the resting state is BLIND, which is the
 * direction a hidden-role game should fail in.
 *
 * ⚠️ **THE CLOCK IS THE TV'S REPORT COUNT, NOT `Date.now()`.** `room.js` drives this from
 * `state.worldTick × 0.5` (the TV reports twice a second), so two identical rooms behave
 * identically and `party-isolation` / `party-sim` stay reproducible. A wall clock here would make
 * every transcript comparison flaky.
 *
 * No THREE, no DOM — `harness/party-warm.mjs` walks it in bare node.
 */

import { EVIL } from './cast.js';

/** Seconds of clear map at the top of each cycle. John's "a few seconds". */
export const PEEK_SECONDS = 6;

/** Seconds of interference after it. "A stretch", and longer than the peek on purpose. */
export const JAM_SECONDS = 14;

export const FEED_CYCLE_SECONDS = PEEK_SECONDS + JAM_SECONDS;

/** What a phase means. `clear` is evil's permanent state; good alternates peek/jam. */
export const FEED_PHASES = ['clear', 'peek', 'jam'];

/**
 * Where in the cycle this guide's map is.
 *
 * @param {object} o
 * @param {string} [o.alignment]  the guide's own alignment. `'evil'` is never jammed.
 * @param {number} [o.seconds]    seconds since the night's first world report.
 * @returns {{phase:'clear'|'peek'|'jam', jammed:boolean, left:number}}
 *          `left` is seconds until the phase turns over; `0` for `clear`, which never does.
 */
export function mapFeed({ alignment, seconds = 0 } = {}) {
  /*
   * 🚨 NEVER JAMMED, AND FOR `intel.js` W7a's REASON RATHER THAN FOR FAIRNESS. Production's
   * exact read is already ungated — it is the steering instrument the role exists to hold — so a
   * jammed map would only mean the marks disagreed with the Production Feed line six pixels
   * above them, which is precisely the bug John reported from the other direction.
   */
  if (alignment === EVIL) return { phase: 'clear', jammed: false, left: 0 };
  const t = Number.isFinite(Number(seconds)) ? Number(seconds) : 0;
  const at = ((t % FEED_CYCLE_SECONDS) + FEED_CYCLE_SECONDS) % FEED_CYCLE_SECONDS;
  return at < PEEK_SECONDS
    ? { phase: 'peek', jammed: false, left: PEEK_SECONDS - at }
    : { phase: 'jam', jammed: true, left: FEED_CYCLE_SECONDS - at };
}
