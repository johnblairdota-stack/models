/**
 * 🎬 **THE BROADCAST DIRECTOR — what six of eight players actually experience.**
 *
 * `docs/design/rrr-broadcast.md`. Under D1 only a pair acts; everyone else watches television.
 * So the Director is not polish, it is the mode's primary interface, and the audit promoted it
 * from a later pass into the same slice as the task.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 THE DIRECTOR NEVER HAS ALIGNMENT IN SCOPE. THIS IS AN ARCHITECTURAL INVARIANT, NOT A HABIT.
 * ---------------------------------------------------------------------------------------------
 * If cutaway frequency correlates with who is evil, **the edit becomes an oracle and P1 dies** —
 * the whole design rests on the broadcast being an authored, deniable account rather than a
 * truth channel. The defence is not care: this module imports nothing that knows an alignment,
 * and the event struct it consumes has no alignment field. `director-cut` B2 walks the import
 * graph transitively and fails if one ever appears, and B2b runs a chi-square over airtime by
 * alignment so a leak through a side channel shows up as a number.
 *
 * ⚠️ SELECTION IS PURE; SOLVING IS NOT, AND THEY ARE SPLIT ON PURPOSE. Deciding WHICH shot airs
 * is arithmetic over an event bus and runs in bare node, which is why it can be gated at all.
 * Turning a chosen shot into `{eye, at, fov}` needs THREE and the live world, so it lives in the
 * renderer adapter. `hunter-ai.js`, `damagefield.js` and `spaces.js` all import THREE; if the
 * choice lived with them, `director-cut` would need a GPU and would never be run.
 *
 * ⚠️ ARBITRATION IS `hud.js`'s, VERBATIM IN BEHAVIOUR. `src/ui/hud.js:340` already solves this
 * exact problem one level down — ranked callouts, `MIN_HOLD`, `defer()` that restores an
 * interrupted item only if enough of it remains, a queue capped so a backlog is not noise. It
 * has survived contact with the game. Shots instead of captions; same algorithm.
 *
 * No THREE, no DOM.
 */

/** `rrr-broadcast.md` §1.2. **There is no alignment field and there never will be.** */
export const KIND = [
  'place', 'progress', 'blow', 'channel_open', 'terminal', 'cam_unlock',
  'noise', 'hunter_alert', 'hunter_commit', 'grab', 'taken', 'task_result',
];

/**
 * 🚨 RANK 4 IS THE ONE HARD GUARANTEE: never cut away from, never off-screen. Everything else in
 * this file is a preference; this is a contract, and `director-cut` B1 is what holds it.
 */
export const RANK = {
  place: 1, ambience: 1,
  blow: 2, progress: 2, noise: 2,
  hunter_alert: 3, hunter_commit: 3, channel_open: 3,
  terminal: 4, cam_unlock: 4, grab: 4, taken: 4, task_result: 4,
};
export const rankOf = (kind) => RANK[kind] ?? 1;

export const MIN_HOLD = 1.4;      // no cut before this, except a rank-4 pre-empt
export const MAX_HOLD = 6.0;      // a shot with nothing happening must re-solve
export const CUT_LEAD = 0.25;     // cut ON action, not after it
export const QUEUE_MAX = 3;       // hud.js's number: a longer backlog is noise
export const MIN_RESTORE = 0.75;  // hud.js: below this a deferred shot would only blink
export const TAU = 2.5;           // recency decay

/**
 * The shot library. Each entry is `{id, kind, needs}` plus an availability predicate over world
 * state — no geometry here, by the split described above.
 *
 * 🚨 THERE IS NO FLYOVER SHOT AND THERE MUST NEVER BE ONE. `party-loop.md` puts the guide's map
 * under *Do not* in its own words. B4 asserts the library by name so adding one fails a gate
 * rather than a playtest.
 */
export const SHOTS = [
  // `live: true` — this shot can show the mansion, so it can serve an event about the mansion.
  { id: 'BODYCAM',      live: true,  needs: () => true },
  { id: 'WORK',         live: true,  needs: (w) => !!w.subjectWorking },
  { id: 'STATIC',       live: true,  needs: (w) => w.camerasUnlocked > 0 && !!w.subjectInStaticFrustum },
  { id: 'STING',        live: true,  needs: (w) => w.camerasUnlocked > 0 && !!w.hunterInStaticFrustum },
  { id: 'SPLIT',        live: true,  needs: (w) => w.camerasUnlocked >= 4 && w.concurrentRank2Rooms >= 2 },
  // Seam fillers. They show the circle or a card, never the halls.
  { id: 'REACTION',     live: false, needs: () => true },
  { id: 'CONFESSIONAL', live: false, needs: (w) => w.cutawayBudget > 0 },
  { id: 'SPONSOR',      live: false, needs: (w) => w.deadAir >= 5 },
];

/**
 * 🚨 A SEAM FILLER CAN NEVER SERVE A RANK-3-OR-4 EVENT, AND THIS IS THE "NEVER OFF-SCREEN"
 * GUARANTEE ITSELF RATHER THAN A REFINEMENT OF IT.
 *
 * The first draft scored shots on rank alone and cut to a CONFESSIONAL bust on a `grab` — the
 * highest-rank event in the game — because a confessional was "available". A reaction shot
 * during a grab IS being off-screen; the guarantee is about what the audience can SEE, not about
 * which numbers the arbiter compared. So the pool is filtered by the event before it is scored.
 */
export const LIVE_RANK = 3;
/** The shots that can show the mansion, by id. Derived from the library, never restated. */
export const LIVE_IDS = new Set(SHOTS.filter((s) => s.live).map((s) => s.id));
export const poolFor = (rank, w) => SHOTS.filter((s) => s.needs(w) && (rank < LIVE_RANK || s.live));

/** `rrr-broadcast.md` §1.3, exactly. */
export function score(shot, ctx) {
  const recency = Math.exp(-(ctx.since ?? 999) / TAU);
  return shot.rank * 10
    + 4 * recency
    + 3 * (ctx.sameSubject ? 1 : 0)
    - 5 * (ctx.staleness ?? 0)
    - 8 * (ctx.occluded ? 1 : 0)
    - 6 * (ctx.repeatAngle ? 1 : 0);
}

/**
 * @param {{now?:number, world?:object}} [opts]
 */
export function createDirector({ world = {} } = {}) {
  let current = null;          // { shotId, subjectId, rank, startedAt, kind }
  let queue = [];
  const cuts = [];             // the airing record — every take, including the invisible ones
  const airtime = new Map();   // subjectId -> seconds
  const lastEventBySubject = new Map();
  const lastAiredShot = new Map();
  let lastEventAt = -Infinity;
  let lastWorld = {};

  /**
   * 🚨 **A CUT IS A CHANGE OF IMAGE. `cuts()` COUNTS TAKES, AND THE TWO NUMBERS WERE OUT BY FOUR.**
   *
   * `close()` fires on every `take()`, including BODYCAM→BODYCAM on the same subject — which
   * changes nothing on the screen. Measured over a wired 90 s expedition: `cadence()` reported
   * **23-25 cuts/min while the image changed 5.3-6.7 times a minute**, with one framing held for
   * **sixty-six to seventy-one seconds**. §1.3 wants 12-22 and sets `MAX_HOLD = 6.0` because *"a
   * locked wide is unwatchable"*, so the instrument was reporting the target as met on a
   * television that was, in fact, a security monitor. Tuning against it chases a number with no
   * relationship to the screen.
   *
   * So the visible record is kept beside the airing record: one segment per `shotId + subjectId`,
   * opened when the image changes and closed when it changes again. `cadence()` reads THIS.
   */
  const visible = [];          // { key, shotId, subjectId, startedAt, endedAt, dur }
  let seg = null;

  /**
   * §3's cutaway budget, counted. *"`cutaways = min(3, ceil(cameras / 2))` per expedition."* The
   * caller states the ceiling in `world.cutawayBudget`; this is how many have been spent, which is
   * the half nothing was tracking, and a budget nobody spends is not a budget.
   */
  let cutawaysUsed = 0;
  const budgetLeft = (w) => Math.max(0, (w?.cutawayBudget ?? world.cutawayBudget ?? 0) - cutawaysUsed);

  function air(shot, t) {
    const key = shot ? `${shot.shotId}/${shot.subjectId}` : null;
    if (seg && seg.key === key) return;          // same image: a take, not a cut
    if (seg) { seg.endedAt = t; seg.dur = Math.max(0, t - seg.startedAt); seg = null; }
    if (key == null) return;
    // ⚠️ THE BUDGET IS SPENT WHERE THE CARD REACHES THE SCREEN, WHICH IS HERE AND NOWHERE ELSE.
    // Counting it at the two call sites that CHOOSE one missed the third — a deferred card coming
    // back off the queue — and cards ran to 25% of the round against §3's 12%.
    if (!LIVE_IDS.has(shot.shotId)) cutawaysUsed++;
    seg = { key, shotId: shot.shotId, subjectId: shot.subjectId, startedAt: t, endedAt: null, dur: 0 };
    visible.push(seg);
  }

  /**
   * Leave the shot that is on air for another angle on the same subject — the gallery finding a
   * second way to look at them. Used when a shot has held past `MAX_HOLD` with nothing happening,
   * and when the solver refuses to frame the one that is up.
   *
   * ⚠️ IT REACHES FOR A CARD ONLY WHEN THERE IS GENUINELY NOTHING ELSE. A re-solve is not an
   * event: nothing has happened, so nothing has changed about who matters. At one unlocked camera
   * there IS only one angle, and §2 says so in its own words — *"one subject, forever … the seams
   * are held by lower thirds, confessional cutaways and chat. Deliberately thin."*
   */
  /**
   * ⚠️ AND THE QUEUE IS FILTERED ON THE WAY OUT, NOT ONLY ON THE WAY IN. A card can be queued
   * while the budget still has room and come back off the queue after it has run out — measured at
   * four cutaways against a budget of one, 18.2% of the round. `hud.js`'s arbiter has the same
   * shape and the same answer: what was worth queueing is re-checked when it is due.
   */
  const nextInQueue = () => {
    while (queue.length) {
      const q = queue.shift();
      if (LIVE_IDS.has(q.shotId) || budgetLeft(lastWorld) > 0) return q;
    }
    return null;
  };

  function away(t, w) {
    const held = current;
    const next = nextInQueue();
    if (next) { close(t); current = { ...next, startedAt: t }; lastAiredShot.set(next.shotId, t); air(current, t); return; }

    const world = { ...w, deadAir: Math.max(0, t - lastEventAt), cutawayBudget: budgetLeft(w) };
    const rank = Math.max(1, held.rank);
    const rank5 = (s) => score({ rank }, {
      since: t - (lastEventBySubject.get(held.subjectId) ?? t),
      sameSubject: true,
      staleness: (t - (lastAiredShot.get(s.id) ?? -20)) < 8 ? 1 : 0,
      occluded: s.id === 'STATIC' && !world.subjectInStaticFrustum,
      repeatAngle: (t - (lastAiredShot.get(s.id) ?? -20)) < 8,
    });
    const pool = poolFor(rank, world)
      .filter((s) => s.id !== held.shotId && (s.live || world.cutawayBudget > 0));
    const best = (list) => list.map((s) => ({ s, v: rank5(s) })).sort((a, b) => b.v - a.v)[0];

    /**
     * 🚨 **A CUTAWAY IS A CHOICE WITH A BUDGET, NOT WHAT HAPPENS WHEN A CAMERA IS BUSY.** The
     * first version of this scored cards alongside angles, and because the shot it was leaving
     * carried the repeat-angle penalty a CONFESSIONAL usually won: measured at **19-27 seconds of
     * cards in a 90 s expedition, up to 30% of the round**, against §3's *"≤ 12% of round airtime.
     * Over that it stops reading as an edit."* So a live angle always wins, the budget §3 states
     * — `min(3, ceil(cameras / 2))` — is counted rather than quoted, and when there is neither an
     * angle nor a cutaway left the shot simply continues. At one unlocked camera that is not a
     * failure, it is §2: *"one subject, forever … deliberately thin."*
     */
    const alt = best(pool.filter((s) => s.live)) || best(pool);
    if (!alt) { seg.startedAt = t; current.startedAt = t; return; }   // one camera, one angle
    close(t);
    current = { ...held, shotId: alt.s.id, rank: alt.s.live ? rank : 1, startedAt: t };
    lastAiredShot.set(current.shotId, t);
    air(current, t);
  }

  /** `hud.js:340` semantics: higher rank pre-empts and defers; equal waits out MIN_HOLD. */
  function take(candidate, t) {
    if (current) {
      const held = t - current.startedAt;
      if (candidate.rank > current.rank) {
        // defer, if enough of it remains to be worth restoring
        if (MAX_HOLD - held >= MIN_RESTORE) enqueue({ ...current, deferred: true });
      } else if (held < MIN_HOLD) {
        enqueue(candidate);
        return false;
      }
      close(t);
    }
    current = { ...candidate, startedAt: t };
    lastAiredShot.set(candidate.shotId, t);
    air(current, t);
    return true;
  }

  function enqueue(m) {
    // hud.js: a stale low-rank item is worse than none. Rank-4 items are never dropped.
    if (m.rank === 1) queue = queue.filter((q) => q.rank !== 1);
    queue.push(m);
    queue.sort((a, b) => b.rank - a.rank);
    // Never evict a rank-4: the one hard guarantee outranks the queue cap.
    while (queue.length > QUEUE_MAX) {
      const i = queue.map((q) => q.rank).lastIndexOf(Math.min(...queue.map((q) => q.rank)));
      if (queue[i].rank === 4) break;
      queue.splice(i, 1);
    }
  }

  function close(t) {
    if (!current) return;
    const dur = Math.max(0, t - current.startedAt);
    cuts.push({ ...current, endedAt: t, dur });
    airtime.set(current.subjectId, (airtime.get(current.subjectId) || 0) + dur);
    current = null;
  }

  return {
    /** Consume one bus event. Rank 4 pre-empts immediately, within CUT_LEAD of the boundary. */
    feed(e) {
      const rank = rankOf(e.kind);
      lastEventBySubject.set(e.subjectId, e.t);
      /**
       * ⚠️ `deadAir` IS "HOW LONG SINCE ANYTHING HAPPENED", MEASURED — NOT A COUNTER SOMEBODY
       * INCREMENTS. It was zeroed on the line ABOVE the one that built `w`, so SPONSOR's
       * `needs: w => w.deadAir >= 5` could never be true at the only moment it was ever asked;
       * and `tick()` added a flat 0.2 per call while the view calls it sixty times a second, so
       * five seconds of dead air arrived after 0.4 s of television. Both are the same mistake —
       * a clock kept by hand next to a clock that was already being passed in.
       */
      const deadAir = Number.isFinite(lastEventAt) ? Math.max(0, e.t - lastEventAt) : 0;
      lastEventAt = e.t;
      const w = { ...world, ...e.world, camerasUnlocked: e.camerasUnlocked ?? world.camerasUnlocked ?? 0, deadAir };
      lastWorld = w;
      // §3's budget is spent, not merely quoted — see `budgetLeft`.
      const pool = poolFor(rank, { ...w, cutawayBudget: budgetLeft(w) })
        .filter((s) => s.live || budgetLeft(w) > 0);
      const best = pool
        .map((s) => ({
          shotId: s.id, subjectId: e.subjectId, kind: e.kind, rank,
          s: score({ rank }, {
            since: 0,
            sameSubject: current?.subjectId === e.subjectId,
            staleness: Math.min(1, (e.t - (lastAiredShot.get(s.id) ?? -20)) < 8 ? 1 : 0),
            occluded: s.id === 'STATIC' && !w.subjectInStaticFrustum,
            repeatAngle: (e.t - (lastAiredShot.get(s.id) ?? -20)) < 8,
          }),
        }))
        .sort((a, b) => b.s - a.s)[0];
      if (!best) return null;
      const took = take(best, e.t);
      return { took, shotId: best.shotId, rank };
    },

    /**
     * Advance time. A shot with nothing happening must re-solve at MAX_HOLD.
     *
     * 🚨 **THE HOLD IS THE IMAGE'S, NOT THE TAKE'S, AND THAT ONE WORD IS THE SIXTY-SIX SECOND
     * FROZEN FRAME.** `take()` sets `startedAt = t` on every take, including the ones that change
     * nothing on screen — so a stream of BODYCAM→BODYCAM takes on the same subject reset the
     * MAX_HOLD clock for ever and it never fired. Measured on a wired expedition: one framing held
     * **66-71 seconds** of a 90-second segment while `cuts()` cheerfully reported 24/min. Timing
     * from the visible segment is the whole fix: §1.3's *"a shot with nothing happening must
     * re-solve"* is about the shot the audience can see.
     *
     * ⚠️ AND IT RE-SOLVES TO ANOTHER ANGLE ON THE SAME SUBJECT BEFORE IT REACHES FOR A CARD. A
     * re-solve is not an event — nothing has happened, so nothing has changed about who matters —
     * it is the gallery finding a second way to look at them. A card is what is left when there
     * is genuinely only one camera, which at one unlock is the honest answer (§2: *"one subject,
     * forever … deliberately thin"*).
     */
    tick(t, w = lastWorld) {
      if (!current || !seg) return;
      if (t - seg.startedAt < MAX_HOLD) return;
      away(t, w);
    },

    /**
     * 🚨 **THE SOLVER SAID NO AND NOBODY WAS LISTENING — 8-20% OF THE SEGMENT WAS A DEAD CAMERA.**
     *
     * `shots.js` documents its own return contract: *"`null` means this shot cannot be solved
     * right now — the arbiter must pick another. A solver that returned a pose anyway would point
     * a camera at a wall on live television."* Nothing ever picked another. The view kept the last
     * pose it had been given, so a STING chosen the frame before the Hunter stepped out of the
     * only unlocked frustum left a **frozen image** on screen — measured at 8.6-20.0% of frames
     * across six seeds, which is up to eighteen seconds of a ninety-second segment.
     *
     * This is the other half of that contract, and it deliberately ignores `MIN_HOLD`: an
     * unsolvable shot is not a short shot, it is not a picture at all.
     */
    refuse(t, w = lastWorld) { if (current) away(t, w); },

    end(t) { close(t); air(null, t); },
    current: () => current,
    cuts: () => cuts.slice(),
    /** Every change of IMAGE, in order. The record a person in the room could have counted. */
    visibleCuts: () => visible.map((v) => ({ ...v })),
    queue: () => queue.slice(),
    airtime: () => new Map(airtime),

    /**
     * §8/B3's cadence targets — **measured on the screen**, not on the arbiter's bookkeeping.
     * `takes` is kept beside it because the gap between the two is the instrument bug this file
     * shipped with, and a gap that reappears is worth seeing rather than worth hiding.
     */
    cadence() {
      const done = visible.filter((v) => v.endedAt !== null);
      if (!done.length) return { cutsPerMin: 0, median: 0, n: 0, takes: cuts.length, longestHold: 0 };
      const span = done[done.length - 1].endedAt - done[0].startedAt;
      const durs = done.map((v) => v.dur).sort((a, b) => a - b);
      return {
        cutsPerMin: span > 0 ? (done.length / span) * 60 : 0,
        median: durs[Math.floor(durs.length / 2)],
        n: done.length,
        takes: cuts.length,
        longestHold: durs[durs.length - 1],
      };
    },
  };
}
