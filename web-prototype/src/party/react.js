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
 * 4. **A debounce, server-side — not a budget.** John, live on DUSK: emotes must be spammable.
 *    Tapping again while one is still up spawns another; it is not ignored and it does not
 *    replace the last one. The number below is only long enough to stop one physical tap firing
 *    twice. The strip's own cap (`REACT_MAX_ON_AIR`) is what keeps a loud thumb from burying
 *    the picture. Enforced on the SERVER because a cooldown that lives on the phone is a
 *    suggestion.
 */

/** The closed set. Same shape of promise as `SHELLS` / `ACCENTS` — a phone cannot smuggle one. */
export const REACTIONS = ['CLAP', 'BOO', 'SUS', 'SHOCK'];

/** Which beats accept a reaction. See decision 3 above before widening this. */
export const REACT_BEATS = ['expedition'];

/** Per-player, server-enforced. See decision 4. Debounce, not a tap budget. */
export const REACT_COOLDOWN_MS = 180;

/**
 * How long one stays on the TV, and how many may share the picture.
 * Hold is ~3.8× the old 2600 ms pop — John: last 3–4× longer, and FLOAT UP, not stick.
 */
export const REACT_HOLD_MS = 10000;
export const REACT_MAX_ON_AIR = 12;

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
 * ⚠️ **SPAM IS THE FEATURE.** A second tap from the same player while the first is still up
 * MUST stay on air as its own chip. The old one-row-per-player dedupe was swallowing that —
 * `paintReactStrip` keyed `${from}:${r}`, so two claps from Mary never even rebuilt. Cap is
 * recency, not identity.
 */
export function onAir(events, now) {
  const out = [];
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (!e || now - e.at >= REACT_HOLD_MS) continue;
    out.push(e);
    if (out.length >= REACT_MAX_ON_AIR) break;
  }
  return out;
}

/**
 * Horizontal / vertical jitter so a second tap from the same player does not ride the first
 * chip's exact path up the picture. `n` is how many of that player's chips are already on
 * air (0 = first tap). Deterministic: a strip rebuild must not jump a chip that is mid-rise.
 */
export function spawnOffset(n) {
  const i = Math.max(0, n | 0);
  // Wider than the 56 px face so a second tap is a new lane, not a smear on the first.
  const ox = (i % 2 === 0 ? 1 : -1) * (44 + Math.floor(i / 2) * 38);
  const oy = (i * 17) % 48;
  return { ox, oy };
}
