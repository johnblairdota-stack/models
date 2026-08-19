/**
 * THE LOG ENVELOPE — one append-only stream, and `vis` is the only thing that reads it.
 *
 * `docs/design/rrr-social-round.md` §4. Three things that were specced as separate systems are
 * one mechanism here, and the saving is not code size, it is the impossibility of them drifting:
 *
 *   the per-socket filter   = this stream with `vis` applied
 *   the Reunion             = THE SAME REPLAY WITH THE FILTER OFF
 *   `party-isolation`       = the same matrix, asserted against what a socket actually got
 *
 * A leak and a missing Reunion reveal become the same bug, found by the same gate.
 *
 * No THREE, no DOM.
 */

/** Who an event is for. `SEALED` is for nobody until the Reunion — the feed count, the deal. */
export const VIS = {
  PUBLIC:   'PUBLIC',
  CREW:     'CREW',
  EVIL:     'EVIL',
  SELF:     'SELF',      // carries `for: <playerId>`
  DIRECTOR: 'DIRECTOR',  // the broadcast's own bus; never leaves the TV
  SEALED:   'SEALED',
};

/**
 * 🚨 THE FAILURE-EVENT SCHEMA IS CLOSED, AND THAT IS WHAT MAKES T5 CHEAP TO ENFORCE.
 *
 * T5 is *"never name the culprit"*. Prohibiting attribution field by field is unwinnable — the
 * next helpful debug line is always one PR away, and `timings: [0.4, 0.0]` names the culprit by
 * POSITION without containing a name. Permitting exactly four fields is a five-line check.
 *
 * ⚠️ `loudness` IS A SCALAR AND MUST STAY ONE. As an array indexed by crew position it is an
 * accusation with the name filed off (`party-anon` A3).
 */
export const FAILURE_FIELDS = Object.freeze(['kind', 'room', 'phaseTick', 'loudness']);

/** Event types whose payload is failure-class and therefore closed. */
export const FAILURE_KINDS = Object.freeze([
  'task.miss',      // a call was wrong — the lie and the honest mistake, indistinguishable
  'task.timeout',
  'panel.alarm',
  'rig.collapse',   // the Fixer's carry-over, firing an episode after it was set
  'noise.spike',
]);

export const isFailure = (type) => FAILURE_KINDS.includes(type);

/** One event. `data` for a failure type is validated against the closed list at construction. */
export function makeEvent(type, vis, data = {}, extra = {}) {
  if (isFailure(type)) {
    const bad = Object.keys(data).filter((k) => !FAILURE_FIELDS.includes(k));
    if (bad.length) {
      throw new Error(`T5: failure event ${type} carries non-schema field(s): ${bad.join(', ')}`);
    }
  }
  return { type, vis, data, ...extra };
}
