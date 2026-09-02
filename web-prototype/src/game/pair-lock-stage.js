/**
 * pair-lock-stage — THE CIRCLE PERFORMS THE PAIR LOCK, in bare node.
 *
 * Same shape as `accusation-stage.js`: a keyed little machine, THREE-free, so
 * `harness/pair-lock-stage.mjs` (and `gates:party`) can import it without pulling
 * THREE. `.github/workflows/gates.yml` never `npm install`s. The bed still owns
 * the picture (`setPairLock` / the stands).
 *
 * ⚠️ NO THREE, NO DOM, NO ENGINE.
 *
 * After runner and guide lock (3·2·1 or the 20s ballot backstop), this scene plays
 * ON Casting before `setShow('expedition')`. It is not a SHOW beat — accusation is
 * not one either. Do not add `sendoff` to `SHOW_BEATS`.
 *
 * ---------------------------------------------------------------------------------------------
 * 🪑 **THE SEAT LOCK STAYS ON.** sitLock stays on. Same argument as accusation-stage:
 * `player.js` L451 / L644. The clip does the travelling (`Sit_to_Stand_Transition_M` under a
 * pinned root). Do not walk them to the mansion door — that is the expedition.
 *
 * Reactors: **none.** Who gasps is a leak surface on Reckoning; a sendoff gasp would be
 * the same leak with no accusation to justify it. Only the two named chairs move.
 */

/** Beat times, seconds from the moment a NEW pair lock lands. */
export const PAIR = Object.freeze({
  STAND_RUNNER: 0.00,
  STAND_GUIDE: 0.40,
  SETTLE: 2.00,
  /** Cross-fade handed to `playSeated`. One beat must not snap into the next. */
  FADE: 0.25,
});

/** Wall-clock the live hop waits before pinning expedition. SETTLE + FADE. */
export const PAIR_LOCK_MS = Math.round((PAIR.SETTLE + PAIR.FADE) * 1000);

export function pairLockMs() {
  return PAIR_LOCK_MS;
}

export const PAIR_CLIPS = Object.freeze({
  stand: 'Sit_to_Stand_Transition_M',
});

/** `runner>guide`, the identity of one sendoff. A re-cue of the same pair is a no-op. */
export function pairKey(row) {
  const runner = String(row?.runner ?? '');
  const guide = String(row?.guide ?? '');
  return `${runner}>${guide}`;
}

/** Normalize a pair-lock row. Empty ids are off — this scene never invents a pair. */
export function pairRows(pairs) {
  const out = [];
  const seen = new Set();
  for (const p of pairs || []) {
    if (p == null) continue;
    const runner = String(p.runner ?? '').trim();
    const guide = String(p.guide ?? '').trim();
    if (!runner || !guide || runner === guide) continue;
    const key = pairKey({ runner, guide });
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, runner, guide });
  }
  return out;
}

/**
 * One sendoff as DATA: `[{ at, seat, clip, hold, role }]`, sorted by time. Pure and
 * THREE-free so `harness/pair-lock-stage.mjs` can assert the running order without a
 * browser — same discipline as `accusation-stage.js`.
 *
 * No reactors. No flinch. Runner stands at 0, guide at 0.40, settle/hold at 2.00.
 * Finished = last beat + FADE.
 */
export function planPairLock({ runnerSeat = null, guideSeat = null } = {}) {
  const beats = [];
  const hasRunner = Number.isFinite(runnerSeat);
  const hasGuide = Number.isFinite(guideSeat);
  if (hasRunner) {
    beats.push({
      at: PAIR.STAND_RUNNER, seat: runnerSeat | 0, clip: PAIR_CLIPS.stand, hold: true, role: 'runner',
    });
  }
  if (hasGuide) {
    beats.push({
      at: PAIR.STAND_GUIDE, seat: guideSeat | 0, clip: PAIR_CLIPS.stand, hold: true, role: 'guide',
    });
  }
  if (hasRunner || hasGuide) {
    beats.push({
      at: PAIR.SETTLE, seat: hasRunner ? (runnerSeat | 0) : (guideSeat | 0),
      clip: PAIR_CLIPS.stand, hold: true, role: 'settle',
    });
  }
  beats.sort((a, b) => a.at - b.at);
  return beats;
}

/**
 * The staging machine. Pure — no THREE, no avatars, no clock of its own. The bed hands it
 * hooks and drives it a frame at a time; the harness hands it recorders. The live hop in
 * `net/party/local.mjs` waits `PAIR_LOCK_MS` rather than polling this; `finished` is the
 * same number, so a gate that drives the machine and a gate that drives the hop agree.
 *
 * @param {object} o
 * @param {(id:string)=>number|null} o.seatOf   public id -> chair index, null if not in the circle
 * @param {number} o.seatCount
 * @param {(seat:number, clip:string, hold:boolean)=>boolean} o.play  true iff the clip took
 * @param {(seat:number)=>void} o.rest          put this chair back on the plain seated idle
 */
export function createPairLockStage({ seatOf, seatCount = 0, play, rest } = {}) {
  const staged = new Map();
  const held = new Map();
  let cues = [];
  let elapsed = 0;
  void seatCount;

  const seatFor = (id) => {
    if (id == null) return null;
    const s = seatOf?.(id);
    return Number.isFinite(s) && s >= 0 ? (s | 0) : null;
  };

  function fire(c) {
    const ok = play?.(c.seat, c.clip, c.hold) === true;
    if (ok && c.hold) held.set(c.seat, { clip: c.clip, key: c.key });
  }

  return {
    /** The live pair. Idempotent: only APPEARING keys stage. */
    set(pairs) {
      const rows = pairRows(pairs);
      const next = new Map(rows.map((r) => [r.key, r]));

      for (const key of [...staged.keys()]) {
        if (next.has(key)) continue;
        staged.delete(key);
        cues = cues.filter((c) => c.key !== key);
      }

      for (const [key, row] of next) {
        if (staged.has(key)) continue;
        staged.set(key, row);
        elapsed = 0;
        const runnerSeat = seatFor(row.runner);
        const guideSeat = seatFor(row.guide);
        if (runnerSeat == null && guideSeat == null) continue;
        for (const b of planPairLock({ runnerSeat, guideSeat })) {
          cues.push({ left: b.at, key, seat: b.seat, clip: b.clip, hold: b.hold, role: b.role });
        }
      }

      const liveSeats = new Set();
      for (const row of staged.values()) {
        const a = seatFor(row.runner); if (a != null) liveSeats.add(a);
        const b = seatFor(row.guide); if (b != null) liveSeats.add(b);
      }
      for (const seat of [...held.keys()]) {
        if (liveSeats.has(seat)) continue;
        held.delete(seat);
        rest?.(seat);
      }

      if (!staged.size) elapsed = 0;
      return rows.length;
    },

    step(dt) {
      if (staged.size) elapsed += (dt || 0);
      if (!cues.length) return 0;
      const keep = [];
      const due = [];
      for (const c of cues) {
        c.left -= (dt || 0);
        if (c.left > 0) keep.push(c);
        else due.push(c);
      }
      cues = keep;
      due.sort((a, b) => a.left - b.left);
      for (const c of due) fire(c);
      return due.length;
    },

    reapply() {
      let n = 0;
      for (const [seat, row] of held) {
        if (play?.(seat, row.clip, true) === true) n++;
      }
      return n;
    },

    /**
     * The sendoff is finished when every scheduled beat has fired AND wall time has
     * reached SETTLE+FADE. Pending-empty at 0.40s is not done — the stands are still
     * holding. The live hop waits this same number; it does not skip.
     */
    finished() {
      return staged.size > 0 && cues.length === 0 && elapsed + 1e-9 >= PAIR.SETTLE + PAIR.FADE;
    },

    pending: () => cues.length,
    keys: () => [...staged.keys()],
    performing: () => [...held.entries()].map(([seat, row]) => ({ seat, clip: row.clip })),
    elapsed: () => elapsed,
  };
}
