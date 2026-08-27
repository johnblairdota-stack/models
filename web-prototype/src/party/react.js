/**
 * 👏 **THE REACTION PAD — the six people who are not in the mansion.**
 *
 * The pad has existed since the first build and reached nothing. Four buttons printed a word on
 * the tapper's own screen and stopped there: the TV never saw it, the room never saw it, and for
 * the sixty to ninety seconds of every Expedition, six of eight players held a dead remote. The
 * round-4 critic filed it twice — **D3** for the wiring and **S4** for the reason to bother — and
 * it has been banked ever since.
 *
 * This module is the rules half, deliberately with no DOM and no socket in it, so
 * `harness/react-pad.mjs` can hold the whole thing to account in bare node.
 *
 * Four decisions are pinned here, because each one has a cheaper wrong answer:
 *
 * 1. **A reaction is PUBLIC and it is ATTRIBUTED.** The payload names who sent it. An anonymous
 *    burst is just weather; the entire value of the feature is that a boo is evidence — *who
 *    booed when she found the safe?* — and evidence has to have a name on it.
 * 2. **The dead do not react.** They are already blocked from casting (L92), nominating and
 *    voting, and for the same reason: an executed player with a live channel to the living can
 *    signal what they learned on the way out. A reaction is a low-bandwidth channel, not a
 *    harmless one — four symbols on demand is plenty to run a code with.
 * 3. **Expedition only, for now.** The banked finding is about dead air during the run. Opening
 *    reactions across the talk beats would put a second, cheaper channel next to the pair system
 *    — one with no cost, no clock and no cap — and that is a design change, not a wiring one.
 *    `REACT_BEATS` is the one-line widening if John wants it.
 * 4. **A cooldown, server-side.** Unlimited taps turn the strip into mush and hand the loudest
 *    thumb the whole screen; one-per-beat makes people hoard it and reach for it never. 2.5 s is
 *    roughly twenty-four reactions across a sixty-second run per player, and at a full table it
 *    caps the room at about three on screen per second, which is the most the strip can hold.
 *    It is enforced on the SERVER because a cooldown that lives on the phone is a suggestion.
 */

/** The closed set. Same shape of promise as `SHELLS` / `ACCENTS` — a phone cannot smuggle one. */
export const REACTIONS = ['CLAP', 'BOO', 'SUS', 'SHOCK'];

/** Which beats accept a reaction. See decision 3 above before widening this. */
export const REACT_BEATS = ['expedition'];

/** Per-player, server-enforced. See decision 4. */
export const REACT_COOLDOWN_MS = 2500;

/** How long one stays on the TV, and how many may share the strip. */
export const REACT_HOLD_MS = 2600;
export const REACT_MAX_ON_AIR = 6;

/** The face each reaction wears — the `mood` names in `look.js`. */
export const REACT_MOOD = { CLAP: 'clap', BOO: 'boo', SUS: 'sus', SHOCK: 'shock' };

/** Closed-set validation. Returns the canonical reaction or null — never the caller's string. */
export function cleanReaction(raw) {
  if (typeof raw !== 'string') return null;
  const up = raw.toUpperCase();
  return REACTIONS.includes(up) ? up : null;
}

export const isReactBeat = (beat) => REACT_BEATS.includes(String(beat ?? ''));

/**
 * The whole gate on one tap, as data rather than as control flow, so the harness can enumerate
 * every refusal without a server. `why` is never shown to the room — a refused reaction is
 * silent by design, because a public "JOHN tried to react" is itself a signal.
 */
export function reactCheck({ reaction, beat, alive, lastAt, now }) {
  const r = cleanReaction(reaction);
  if (!r) return { ok: false, why: 'unknown' };
  if (!isReactBeat(beat)) return { ok: false, why: 'beat' };
  if (!alive) return { ok: false, why: 'dead' };
  if (typeof lastAt === 'number' && now - lastAt < REACT_COOLDOWN_MS) {
    return { ok: false, why: 'cooling', readyIn: REACT_COOLDOWN_MS - (now - lastAt) };
  }
  return { ok: true, reaction: r };
}

/**
 * What the TV should have on screen at `now`, newest first and capped.
 *
 * ⚠️ **ONE ROW PER PLAYER.** Without the dedupe a player on the cooldown boundary can hold two
 * slots of a six-slot strip, and at a full table two fast thumbs push everyone else off the air.
 * Keeping only each player's latest is also what makes a reaction read as a STATE the person is
 * in rather than as a stream of events scrolling past.
 */
export function onAir(events, now) {
  const seen = new Set();
  const out = [];
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (!e || now - e.at >= REACT_HOLD_MS) continue;
    if (seen.has(e.from)) continue;
    seen.add(e.from);
    out.push(e);
    if (out.length >= REACT_MAX_ON_AIR) break;
  }
  return out;
}
