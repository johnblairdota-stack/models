/**
 * THE RUN — the state machine that gives the game a shape.
 *
 * `docs/design/escape.md` §10.1. Everything the win condition needs hangs off this, which is
 * why it comes first and why it lives in its own module rather than in `views/game.js`.
 *
 *     EXPLORE  ->  WINDDOWN  ->  DETONATION  ->  RESULTS
 *
 * WHAT IS BUILT THIS ROUND AND WHAT IS NOT, stated at the top so nobody quotes this file as
 * evidence that the endgame exists:
 *
 *   BUILT   the phases, the transitions between them, the run clock, the seeded per-run choice
 *           of the live exit and its lock, the per-player time-to-escape score, and the
 *           results board.
 *   NOT     the wind-down PRESENTATION (§10.4: countdown HUD, hunter promotion, the audience
 *           sweep) and the detonation PRESENTATION (§10.5: the cascade of stage transitions,
 *           the whiteout). The states they hang off are here, with the transitions wired, so
 *           they drop in as new listeners on `onPhase` and need no change to this file.
 *
 * ⚠️ `BOMB_SECONDS` IS AN UNMEASURED HYPOTHESIS AND MUST BE TREATED AS WRONG. `escape.md` §7
 * says so in as many words: the patrol lap is ~185 s and a cross-house sprint is on the order
 * of 20 s, and the honest procedure is to drive escapes from the far corner in
 * `harness/playtest.mjs` and pick the value where a skilled run makes it and a panicked one
 * does not. Nothing in this project has measured it. It is a constant here so that the
 * measurement has one place to land, NOT because 90 is a decision.
 *
 * ---------------------------------------------------------------------------
 * SERVER-SHAPED, DELIBERATELY, EVEN THOUGH `src/net/client.js` IS NOT WIRED YET.
 *
 * Same construction as `src/destruction/wall.js`, which is the piece of this project that has
 * survived contact with a real server:
 *
 *   · NO three.js, no DOM, no engine. It runs identically in a browser, in node and on
 *     `net/server.mjs`, which is what makes it testable without a GPU.
 *   · every mutator early-outs without `authority`. A client physically cannot start the
 *     wind-down; it can only be told that one started.
 *   · `syncPhase()` / `applySnapshot()` are the client paths, and they emit through the SAME
 *     listener set as the authoritative path, so presentation code has exactly one route to
 *     follow and a late joiner lands in the right state silently.
 *   · the wire form is small and derived: phase, clock, seed, and who is out and when.
 *     `exitId` is NOT sent, because it is a pure function of the seed — see below.
 *
 * ⚠️ THE SELECTION IS A PURE FUNCTION OF THE SEED AND THAT IS THE WHOLE POINT.
 * `escape.md` §6: "Two clients disagreeing about which exit is real is the worst desync this
 * game could have." So the exit is never transmitted and never negotiated — both ends derive
 * it from one integer with `chooseExit()`, which uses no `Math.random`, no `Date`, no float
 * accumulation and no iteration order that depends on anything but the pool array. Give it the
 * same seed and the same pool and it cannot disagree with itself.
 */

/** The four phases, in order. `PHASE_ORDER` is the only place the ordering is written down. */
export const PHASE = {
  EXPLORE: 'EXPLORE',
  WINDDOWN: 'WINDDOWN',
  DETONATION: 'DETONATION',
  RESULTS: 'RESULTS',
};
export const PHASE_ORDER = [PHASE.EXPLORE, PHASE.WINDDOWN, PHASE.DETONATION, PHASE.RESULTS];

/**
 * ⚠️ UNMEASURED. See the header. 90 is `escape.md` §7's own starting hypothesis and it says
 * "assume 90 is wrong until it is measured".
 */
export const BOMB_SECONDS = 90;

/**
 * How long the house takes to come apart once the timer expires. Authored, not measured —
 * and nothing renders it yet (§10.5). It exists so DETONATION is a real phase with a real
 * exit rather than an instantaneous relabelling of RESULTS.
 */
export const DETONATION_SECONDS = 3.5;

/**
 * THE LOCK — `escape.md` §6.3, "the cheapest variety in the design".
 *
 * The same site poses a different problem from run to run, at zero geometry cost, by starting
 * the live exit's panel at a different stage of the wall table. Nothing new is invented: these
 * are stage entries that already exist and are already tuned.
 *
 * ⚠️ THE STAGE TABLE THE LIVE EXIT USES IS **`EXIT_DEFS`** IN `src/game/spaces.js`, NOT
 * `STAGE_DEFS`. It is the same five stages with the same flags and much larger healths, and it
 * exists because an ordinary breach and the way out of the house are two different verbs that
 * happened to share one number. See that table's own comment for the measurements.
 *
 *   boarded  stage 0. The full chew, every stage: the longest and loudest job in the house.
 *   plaster  stage 1. The oil gun's stated speciality ("burns through plaster fast", 52
 *            damage) — the run where the right tool cuts the work down.
 *   beams    stage 3. The ONE stage where `blocksSight` and `blocksShots` are false while
 *            `blocksMove` is still true. You can see out and shoot out and you still cannot
 *            leave, and it is the most expensive single stage in the table. `escape.md` §1
 *            calls this the design's best beat.
 *
 * ⚠️ THE DOCSTRING THIS REPLACES WAS OUT BY ~8× AND `play-critic-7` MEASURED IT. It said
 * "about 10 nail-gun SECONDS per stage" where the code gave about 10 nail-gun ROUNDS per
 * stage — 1.3 s at the nail gun's 0.13 s cooldown. **The beam stage, the design's
 * self-declared best beat, lasted 1.3 seconds.** No number is quoted here any more on purpose:
 * healths live in one table and a second copy of them in prose is exactly how that error
 * survived a round of review.
 *
 * `startStage` is an index into the stage table. Nothing here knows what those stages contain;
 * that is `src/destruction/wall.js`'s and `spaces.js`'s business and it must stay there.
 */
export const LOCKS = [
  { id: 'boarded', startStage: 0, tell: 'boards nailed over it from the outside' },
  { id: 'plaster', startStage: 1, tell: 'fresh mortar, newer than the wall around it' },
  { id: 'beams', startStage: 3, tell: 'daylight in the seam between the studs' },
];

// ---------------------------------------------------------------------------
// Seeded selection — pure, and the one thing in this file that must never drift
// ---------------------------------------------------------------------------

/**
 * FNV-1a over the string form. Deliberately a STRING hash rather than integer arithmetic on
 * the seed: it means adjacent seeds (1, 2, 3 — which is exactly what a test sweep and a
 * lobby counter both produce) land in unrelated places, and it means the salt that separates
 * "which exit" from "which lock" is part of the same operation instead of a second ad-hoc
 * mixing step.
 */
export function hash32(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * One mulberry32 step. Copied rather than imported from `core/engine.js` ON PURPOSE — that
 * module pulls in three.js and the whole renderer, and this file has to run on a server and
 * in a bare node test. Eight lines of arithmetic is a cheaper dependency than a GPU.
 */
function mulberry32(a) {
  a |= 0;
  a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** A stable 0..1 for a (seed, salt) pair. No state, no sequence, no order dependence. */
export function seedRand(seed, salt) { return mulberry32(hash32(`${seed}|${salt}`)); }

/** Pick one element of `list` for this (seed, salt). Empty list -> null, never a throw. */
export function seededPick(seed, salt, list) {
  if (!list || !list.length) return null;
  return list[Math.min(list.length - 1, Math.floor(seedRand(seed, salt) * list.length))];
}

/**
 * THE RUN PLAN: which site is live this run, and what is holding it shut.
 *
 * `sites` is a list of site ids — plain strings, in the order the floor-plan table declares
 * them. It is the caller's job to hand over the same pool on both ends; that is a much easier
 * contract to keep than replicating the choice, because the pool is authored content that
 * ships with the build.
 *
 * ⚠️ ORDER MATTERS AND THAT IS BY DESIGN. Reordering `PANELS` changes which exit a given seed
 * selects. That is acceptable — a build change may change what seed 7 means — and it is NOT
 * the same hazard as renumbering the ids, which would break the wire protocol. Deriving the
 * choice from the id STRINGS instead would be stable across reordering but would silently
 * re-roll every site the moment a designer renamed one, which is the more likely edit.
 */
export function chooseExit(seed, sites) {
  const pool = (sites ?? []).slice();
  const exitId = seededPick(seed, 'exit', pool);
  const lock = seededPick(seed, 'lock', LOCKS) ?? LOCKS[0];
  return { exitId, lock, pool };
}

// ---------------------------------------------------------------------------

/**
 * One run's authoritative state.
 *
 * @param {object} o
 * @param {string|number} o.seed          the run seed. The server owns it; everyone derives.
 * @param {boolean} [o.authority=false]   only the server mutates
 * @param {string[]} [o.sites]            the exit-site pool, as ids
 * @param {number} [o.bombSeconds]        see BOMB_SECONDS — unmeasured
 */
export class RunState {
  constructor(o = {}) {
    this.seed = o.seed ?? 0;
    this.authority = !!o.authority;
    this.sites = (o.sites ?? []).slice();
    this.bombSeconds = o.bombSeconds ?? BOMB_SECONDS;
    this.detonationSeconds = o.detonationSeconds ?? DETONATION_SECONDS;

    const plan = chooseExit(this.seed, this.sites);
    this.exitId = plan.exitId;
    this.lock = plan.lock;

    this.phase = PHASE.EXPLORE;
    /** Seconds since the run started ticking. The score's only input — see `escape()`. */
    this.t = 0;
    /** null outside WINDDOWN. Counts down; nothing renders it yet (§10.4). */
    this.bombLeft = null;
    this._detLeft = 0;

    /** id -> { id, out, at, down } */
    this.players = new Map();

    this._onPhase = new Set();
    this._onEscape = new Set();
  }

  // ---- queries -----------------------------------------------------------

  /** Is this site the live one this run? Everything else in the pool is chained. */
  isLiveExit(id) { return id === this.exitId; }
  /** 'live' | 'chained' | null (not a site at all). */
  siteState(id) {
    if (!this.sites.includes(id)) return null;
    return id === this.exitId ? 'live' : 'chained';
  }
  get over() { return this.phase === PHASE.RESULTS; }
  get running() { return this.phase === PHASE.EXPLORE || this.phase === PHASE.WINDDOWN; }

  /** Anyone still inside who could still get out. */
  stillInside() {
    let n = 0;
    for (const p of this.players.values()) if (!p.out && !p.down) n++;
    return n;
  }

  /**
   * THE SCOREBOARD. `escape.md` §9: time from run start to reaching the escape point, per
   * player, lower is better; survivors are ranked, the dead are not. Deliberately no bonus
   * for limbs kept, damage dealt or teammates saved — time alone is honest and shippable, and
   * the moment it proves to reward something dull it gets revisited with a measurement.
   */
  results() {
    const out = [...this.players.values()].filter((p) => p.out)
      .sort((a, b) => a.at - b.at)
      .map((p, i) => ({ id: p.id, rank: i + 1, seconds: p.at, first: i === 0 }));
    const lost = [...this.players.values()].filter((p) => !p.out)
      .map((p) => ({ id: p.id, rank: null, seconds: null, down: !!p.down }));
    return { phase: this.phase, seed: this.seed, exitId: this.exitId, lock: this.lock.id,
      escaped: out, lost, elapsed: this.t };
  }

  // ---- listeners ---------------------------------------------------------

  onPhase(fn) { this._onPhase.add(fn); return () => this._onPhase.delete(fn); }
  onEscape(fn) { this._onEscape.add(fn); return () => this._onEscape.delete(fn); }

  // ---- mutators (authority only, exactly like WallState) ------------------

  addPlayer(id) {
    const p = { id, out: false, at: null, down: false };
    this.players.set(id, p);
    return p;
  }

  /**
   * Advance the run clock. The ONLY clock the score reads, and it is fed from the engine's
   * `dt` rather than from `performance.now()` for the same reason `flee-survival.mjs` had to
   * stop using `page.waitForTimeout`: `Engine._liveLoop` clamps `dt` to 0.1 s, so wall-clock
   * time and game time diverge under load, and a score measured in wall-clock seconds would
   * punish a player for a shader compile.
   */
  tick(dt) {
    if (!this.authority) return this.phase;
    if (!Number.isFinite(dt) || dt <= 0) return this.phase;
    if (this.phase === PHASE.RESULTS) return this.phase;

    this.t += dt;

    if (this.phase === PHASE.WINDDOWN) {
      this.bombLeft = Math.max(0, (this.bombLeft ?? this.bombSeconds) - dt);
      if (this.bombLeft <= 0) this._setPhase(PHASE.DETONATION, { reason: 'timer' });
    } else if (this.phase === PHASE.DETONATION) {
      this._detLeft -= dt;
      if (this._detLeft <= 0) this._setPhase(PHASE.RESULTS, { reason: 'detonated' });
    }
    return this.phase;
  }

  /**
   * A player reached the outside.
   *
   * ⚠️ THE FIRST ESCAPE IS THE MOST HOSTILE ACT IN THE GAME AND THIS IS THE LINE THAT MAKES IT
   * ONE (`escape.md` §5). Getting out first is simultaneously the best score and the thing
   * that starts the clock killing everyone still inside. It costs one branch.
   */
  escape(id, at = this.t) {
    if (!this.authority) return null;
    if (this.phase === PHASE.RESULTS) return null;
    const p = this.players.get(id) ?? this.addPlayer(id);
    if (p.out) return null;
    p.out = true;
    p.at = at;
    p.down = false;
    const first = [...this.players.values()].filter((q) => q.out).length === 1;
    const rec = { id, at, first };

    // ⚠️ THE PHASE MOVES **BEFORE** THE EVENT FIRES, AND THAT ORDER IS THE WHOLE POINT.
    //
    // It used to be the other way round, and `play-critic-7` found what that cost: every
    // `onEscape` listener ran while `this.phase` was still EXPLORE, so `buildEscapeWatch`'s
    // stranded line — *"N still inside. You started the clock."*, which is `escape.md` §5's
    // best line and the moment the player learns that winning is the most hostile act in the
    // game — was gated on `phase === WINDDOWN` and **could never print.** The consequence was
    // computed one statement after it was announced.
    //
    // An escape is not a fact about a player, it is a fact about the RUN: whoever is told
    // about it must be told the state it produced, not the state it replaced. `rec` carries
    // `first`, which is captured above and is unaffected by the reorder.
    if (first && this.phase === PHASE.EXPLORE) {
      // Nobody left to save means there is nothing for a wind-down to be about. Single player
      // takes this branch every time, which is why WINDDOWN needs a second registered player
      // to be reachable — see `harness/scenarios/escape.mjs` E10, which proves it.
      if (this.stillInside() > 0) this._setPhase(PHASE.WINDDOWN, { by: id, escape: rec });
      else this._setPhase(PHASE.RESULTS, { by: id, reason: 'last one out', escape: rec });
    } else if (this.phase === PHASE.WINDDOWN && this.stillInside() === 0) {
      this._setPhase(PHASE.RESULTS, { by: id, reason: 'house empty', escape: rec });
    }
    for (const fn of this._onEscape) fn(rec, this);
    return rec;
  }

  /** Fully dismembered. Not a score — `results()` ranks survivors and does not rank the dead. */
  down(id) {
    if (!this.authority) return false;
    const p = this.players.get(id) ?? this.addPlayer(id);
    if (p.out || p.down) return false;
    p.down = true;
    if (this.phase === PHASE.EXPLORE && this.stillInside() === 0 && !this.anyOut()) {
      this._setPhase(PHASE.RESULTS, { reason: 'everyone taken' });
    } else if (this.phase === PHASE.WINDDOWN && this.stillInside() === 0) {
      this._setPhase(PHASE.RESULTS, { reason: 'house empty' });
    }
    return true;
  }

  anyOut() { return [...this.players.values()].some((p) => p.out); }

  /** End it now, whatever phase it is in. Used by a host abort and by `reset()`. */
  finish(info = {}) {
    if (!this.authority) return false;
    if (this.phase === PHASE.RESULTS) return false;
    this._setPhase(PHASE.RESULTS, info);
    return true;
  }

  /**
   * Back to the top of a fresh run. Re-derives the plan from `seed`, so passing a NEW seed
   * here is how a lobby reshuffles the house between rounds — which is the shape §6 asks for
   * ("the answer changes every run") without any of this file knowing what a round is.
   */
  reset(seed = this.seed) {
    if (!this.authority) return false;
    this.seed = seed;
    const plan = chooseExit(this.seed, this.sites);
    this.exitId = plan.exitId;
    this.lock = plan.lock;
    this.t = 0;
    this.bombLeft = null;
    this._detLeft = 0;
    for (const p of this.players.values()) { p.out = false; p.at = null; p.down = false; }
    const from = this.phase;
    this.phase = PHASE.EXPLORE;
    if (from !== PHASE.EXPLORE) this._emitPhase(from, { reason: 'reset' });
    return true;
  }

  // ---- client path -------------------------------------------------------

  /**
   * The server said the run is now in `phase`. Emits through the same listener set as the
   * authoritative path — see the header. A client that has never seen the EXPLORE phase lands
   * correctly in WINDDOWN with one call.
   */
  syncPhase(phase, info = {}) {
    if (!PHASE_ORDER.includes(phase)) return false;
    if (phase === this.phase) return false;
    const from = this.phase;
    this.phase = phase;
    if (phase === PHASE.WINDDOWN) this.bombLeft = info.bombLeft ?? this.bombSeconds;
    if (phase === PHASE.DETONATION) this._detLeft = info.detLeft ?? this.detonationSeconds;
    this._emitPhase(from, { ...info, authoritative: false });
    return true;
  }

  /** Wire form. `exitId` is derived, not sent — see the header. */
  serialize() {
    return {
      seed: this.seed, phase: this.phase, t: +this.t.toFixed(3),
      bombLeft: this.bombLeft == null ? null : +this.bombLeft.toFixed(3),
      players: [...this.players.values()].map((p) => ({ id: p.id, out: p.out, at: p.at, down: p.down })),
    };
  }

  applySnapshot(s) {
    if (!s) return false;
    if (s.seed != null && s.seed !== this.seed) {
      this.seed = s.seed;
      const plan = chooseExit(this.seed, this.sites);
      this.exitId = plan.exitId;
      this.lock = plan.lock;
    }
    this.t = s.t ?? this.t;
    for (const r of s.players ?? []) {
      const p = this.players.get(r.id) ?? this.addPlayer(r.id);
      p.out = !!r.out; p.at = r.at ?? null; p.down = !!r.down;
    }
    if (s.phase) this.syncPhase(s.phase, { bombLeft: s.bombLeft });
    else if (s.bombLeft != null) this.bombLeft = s.bombLeft;
    return true;
  }

  // ---- internals ---------------------------------------------------------

  _setPhase(phase, info = {}) {
    if (phase === this.phase) return;
    const from = this.phase;
    this.phase = phase;
    if (phase === PHASE.WINDDOWN) this.bombLeft = this.bombSeconds;
    if (phase === PHASE.DETONATION) this._detLeft = this.detonationSeconds;
    this._emitPhase(from, { ...info, authoritative: true });
  }

  _emitPhase(from, info) {
    for (const fn of this._onPhase) fn(this.phase, from, info, this);
  }
}
