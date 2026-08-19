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
  const cuts = [];             // the airing record — what the gate reads
  const airtime = new Map();   // subjectId -> seconds
  const lastEventBySubject = new Map();
  const lastAiredShot = new Map();
  let deadAir = 0;


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
      deadAir = 0;
      const w = { ...world, ...e.world, camerasUnlocked: e.camerasUnlocked ?? world.camerasUnlocked ?? 0, deadAir };
      const pool = poolFor(rank, w);
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

    /** Advance time. A shot with nothing happening must re-solve at MAX_HOLD. */
    tick(t) {
      deadAir += 0.2;
      if (current && t - current.startedAt >= MAX_HOLD) {
        const held = current;
        close(t);
        const next = queue.shift();
        current = next ? { ...next, startedAt: t } : { ...held, shotId: 'REACTION', rank: 1, startedAt: t };
      }
    },

    end(t) { close(t); },
    current: () => current,
    cuts: () => cuts.slice(),
    queue: () => queue.slice(),
    airtime: () => new Map(airtime),

    /** Cuts per minute and the median shot length — §8/B3's cadence targets. */
    cadence() {
      if (!cuts.length) return { cutsPerMin: 0, median: 0, n: 0 };
      const span = cuts[cuts.length - 1].endedAt - cuts[0].startedAt;
      const durs = cuts.map((c) => c.dur).sort((a, b) => a - b);
      return {
        cutsPerMin: span > 0 ? (cuts.length / span) * 60 : 0,
        median: durs[Math.floor(durs.length / 2)],
        n: cuts.length,
      };
    },
  };
}
