/**
 * NOISE — ONE CHANNEL, BUILT ONCE, BECAUSE TWO MECHANICS NEED IT.
 *
 * John, 2026-08-10, on the hunter getting into a sealed room:
 *   *"the chained doors are a way the hunter can enter the room prior to the player opening the
 *   interconnect … the hunter is much stronger and bangs away at the doors to scare the players
 *   and eventually break its way in. If the players don't move out of the room this can be the
 *   timer."*
 * and, on what starts it:
 *   *"I want the NOISE option, but I want to be clear. It's the hunter who is coming around and
 *   banging on the chained doors."*
 *
 * Separately he decided that **ploughing through debris costs NOISE rather than speed**. So two
 * live mechanics want the same thing and neither of them is "the hunter hears the player's body",
 * which `HunterAI._sense` already does. What was missing is an event that has **a position of its
 * own, independent of any body** — a sound made *at a place*: a hammer blow into a wall, a slab
 * coming down, a chunk of debris kicked across a floor.
 *
 * THE WHOLE API IS TWO SENTENCES, deliberately:
 *   · something emits a noise event with a POSITION and a LOUDNESS  -> `emit(pos, loudness, kind)`
 *   · something asks what the loudest recent noise was and where    -> `loudest()`
 * Everything else here is bookkeeping for those two.
 *
 * ⚠️ **LOUDNESS IS IN GUNSHOTS, NOT IN DECIBELS, AND THAT IS A CONTRACT WITH `hearNoise`.**
 * `HunterAI.hearNoise` refuses at `d > HUNTER_SENSE.hearRange * strength`, so a loudness of 1.0
 * means "carries 14 m" and 3.4 means "carries the length of the house". `spaces.js`'s
 * `BREACH_NOISE` (`panel: 1.25`, `exit: 3.4`) is already written in those units and is the
 * calibration point — do not invent a second scale here.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * 🚨 **THE DETERMINISM DECISION, STATED: NOISE IS LOCAL, NOT AUTHORITATIVE.**
 *
 * The dig replays from its hit list, so anything that can change what a replay produces has to
 * be authoritative. Noise is not, and the argument is the same one that settled debris:
 *
 *   1. **Nothing downstream of a noise event can change the world's state.** A noise moves the
 *      HUNTER — its `lastKnown`, its state, where it walks. It never touches `DamageField`, never
 *      touches a panel's stage, never touches passability, never touches the seed. Replay the same
 *      hit list and you get the same wall, the same channel, the same `pathPortals` answer.
 *   2. **The emitter side IS deterministic, and cheaply so.** Every `emit()` below is a pure
 *      function of its arguments — no `Math.random`, no `performance.now`, no wall clock. Time
 *      advances only through `update(dt)`, which the view drives from the same clamped `dt` the
 *      rest of the sim uses. So two clients fed the same events in the same order see the same
 *      bus. What is NOT guaranteed is that they were fed the same events, because a client only
 *      emits for work it did itself.
 *   3. **A client that misses a noise ends up with the hunter somewhere else, not with a
 *      different wall.** That is the definition of local: divergence is bounded to a thing the
 *      authority already owns and already replicates by other means.
 *
 * The practical consequence, and it is the one a scenario has to know: **`escape.mjs` and
 * `mechanics.mjs` are unaffected by this file existing** — neither replays a hunter path — while
 * anything that asserts *where the hunter walked* must drive the bus explicitly rather than
 * assume it. `harness/scenarios/bang-door.mjs` does exactly that.
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * What made the sound. The bus does not branch on this — it is carried so a listener can
 * (the audio layer wants to know a door bang from a hammer blow) and so a census reads.
 */
export const NOISE_KIND = {
  /** a hammer into a wall, or a wall coming apart under one */
  dig: 'dig',
  /** a panel crossing a stage — `spaces.js` `BREACH_NOISE` sets the loudness */
  breach: 'breach',
  /** debris shoved out of the way. NOT BUILT HERE — `debris-*` owns the emitter. */
  debris: 'debris',
  /** a thrown ball, or anything else deliberately made to be heard somewhere else */
  decoy: 'decoy',
  /** the hunter's own work on a door, so the AI can be made deaf to itself */
  door: 'door',
  /**
   * an electrical short — the party mode's Tally failing. Added rather than reusing `dig`
   * because the audio layer would otherwise play a hammer for a camera shorting out. Purely
   * additive: `kind` is read in exactly two places in this file, an ignore-list test (L177) and
   * a per-kind census (L198), and nothing anywhere switches on it exhaustively.
   */
  short: 'short',
};

/**
 * Seconds a noise stays "recent".
 *
 * Sized against the thing that has to hear it: `HunterAI` polls once a frame, so anything above
 * a frame is enough for delivery — but `loudest()` is also the answer to *"what is going on right
 * now"*, and a dig is a blow about every 0.95 s (`rules.js` `WEAPON_COOLDOWN.sledge`). Shorter
 * than that and a steady dig reads as silence between blows; this holds one blow's worth of
 * evidence across the gap to the next, and no longer.
 */
export const NOISE_LIFE = 2.4;

/** Below this a noise is not worth carrying — `HUNTER_SENSE.hearFloor` is 0.03. */
export const NOISE_FLOOR = 0.03;

/**
 * A noise event's loudness DECAYS while it is on the bus, so "the loudest recent noise" prefers a
 * fresh quiet sound over a stale loud one. Linear rather than exponential: the point is a hard
 * expiry a listener can reason about, not a tail.
 */
function currentLoudness(ev, now, life) {
  const age = now - ev.t;
  if (age >= life) return 0;
  return ev.loudness * (1 - age / life);
}

export class NoiseBus {
  constructor({ life = NOISE_LIFE, floor = NOISE_FLOOR, max = 24 } = {}) {
    this.life = life;
    this.floor = floor;
    /** Hard cap on live events, so a pathological emitter cannot grow this without bound. */
    this.max = max;
    /** Bus time, advanced only by `update(dt)`. Never `performance.now()` — see the header. */
    this.now = 0;
    /** Monotonic. A listener consumes an event by remembering its `seq`; see `HunterAI._noiseStep`. */
    this.seq = 0;
    this.events = [];
    this._listeners = new Set();
  }

  /**
   * SOMETHING WAS LOUD, HERE.
   *
   * @param {{x:number,y:number,z:number}} pos  where the sound happened — copied, not retained
   * @param {number} loudness  in gunshots: 1.0 carries `HUNTER_SENSE.hearRange`. See the header.
   * @param {string} kind      one of `NOISE_KIND`; free-form, the bus does not branch on it
   * @returns {object|null} the event, or null if it was under the floor
   */
  emit(pos, loudness = 1, kind = NOISE_KIND.dig) {
    if (!pos || !(loudness > this.floor)) return null;
    const ev = {
      seq: ++this.seq,
      t: this.now,
      kind,
      loudness,
      // A PLAIN TRIPLE, NOT A Vector3, and not the caller's object either. Callers hand us
      // `panel.root.position` and scratch vectors constantly; retaining one would make the
      // recorded position of a two-second-old noise track whatever that object does next.
      x: pos.x, y: pos.y ?? 0, z: pos.z,
    };
    this.events.push(ev);
    if (this.events.length > this.max) this.events.shift();
    for (const fn of this._listeners) fn(ev, this);
    return ev;
  }

  /** Push delivery, for a listener that would rather not poll. `emit` order is the call order. */
  onNoise(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }

  /**
   * Advance and expire. Driven from the view's clamped `dt` — see the determinism note.
   * ⚠️ Expiry happens HERE and nowhere else, so `loudest()` is a pure read and can be called
   * from a probe without moving the bus on.
   */
  update(dt) {
    this.now += dt;
    if (!this.events.length) return;
    const cut = this.now - this.life;
    let i = 0;
    while (i < this.events.length && this.events[i].t <= cut) i++;
    if (i) this.events.splice(0, i);
  }

  /**
   * 🔊 **WHAT WAS THE LOUDEST RECENT NOISE, AND WHERE.** The whole reason this file exists.
   *
   * @param {object} [o]
   * @param {string|string[]} [o.ignoreKind] kinds to skip — the hunter is deaf to its own door work
   * @param {number} [o.sinceSeq] only consider events emitted AFTER this sequence number.
   *   ⚠️ **A POLLING LISTENER NEEDS THIS AND IT IS NOT AN OPTIMISATION.** Without it, a listener
   *   that remembers "I already handled seq 5" and then asks for the loudest gets seq 5 again for
   *   as long as it stays the loudest thing on the bus — so a quieter event emitted at seq 6 is
   *   never delivered at all, it is merely masked. A dig would eventually get through as the old
   *   event decayed; a single quiet noise behind a loud one would simply be lost.
   * @returns {{seq,t,kind,loudness,x,y,z,age,heard}|null} `heard` is the DECAYED loudness, which
   *          is the number a listener should range-check against; `loudness` is what was emitted.
   */
  loudest(o = null) {
    const ignore = o?.ignoreKind == null ? null
      : (Array.isArray(o.ignoreKind) ? o.ignoreKind : [o.ignoreKind]);
    const since = o?.sinceSeq ?? -Infinity;
    let best = null, bestV = this.floor;
    for (const ev of this.events) {
      if (ev.seq <= since) continue;
      if (ignore && ignore.includes(ev.kind)) continue;
      const v = currentLoudness(ev, this.now, this.life);
      if (v > bestV) { bestV = v; best = ev; }
    }
    if (!best) return null;
    return { ...best, age: this.now - best.t, heard: bestV };
  }

  /** Everything still live, loudest first. For a probe and for the HUD, not for the AI. */
  recent() {
    return this.events
      .map((ev) => ({ ...ev, age: this.now - ev.t, heard: currentLoudness(ev, this.now, this.life) }))
      .filter((ev) => ev.heard > this.floor)
      .sort((a, b) => b.heard - a.heard);
  }

  /** ⚠️ A round boundary. Without this the first frame of a new round hears the last one's dig. */
  clear() { this.events.length = 0; }

  census() {
    const byKind = {};
    for (const ev of this.events) byKind[ev.kind] = (byKind[ev.kind] ?? 0) + 1;
    return { now: +this.now.toFixed(3), live: this.events.length, emitted: this.seq, byKind };
  }
}
