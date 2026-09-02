/**
 * accusation-stage — THE CIRCLE PERFORMS A NOMINATION, in bare node.
 *
 * Extracted from intro-bed.js so `harness/accusation-stage.mjs` (and the rest of
 * `gates:party`) can import the machine without pulling THREE. `.github/workflows/gates.yml`
 * never `npm install`s. The bed still re-exports every symbol and still owns the picture
 * (`setNominees` / `setExecute` / the walk).
 *
 * ⚠️ NO THREE, NO DOM, NO ENGINE.
 */

import { SEATED_REACTION_CLIPS } from './chair-seats.js';
import { SHOWRUNNER } from '../party/vote.js';

/* ═════════════════════════════════════════════════════════════════════════════════════════════
 * 🎭 THE ACCUSATION — the circle PERFORMS a nomination instead of growing an exclamation mark.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * A red `!` over a tag is a label. It tells you a fact you could already read off the TV board,
 * it appears with no motion, and eight seated bodies keep breathing through it as if nothing had
 * happened. The Reckoning is the beat the whole night points at and it currently has no picture.
 *
 * So the accuser STANDS UP, the accused FLINCHES, two or three of the others react, and the
 * accused settles into a held posture. Roughly four seconds, on the bodies that are already on
 * air, using clips already inside the seated GLB — no new geometry, no new bake, no cut.
 *
 * **The accuser's id is what makes this possible with no wire change.** `CUE_NOM_KEYS` is
 * `['nominator', 'target']` and both halves are already public (`follow.js` — the same pair
 * `FANOUT_KEYS.nomRow` fans to every socket), so the bed can point the camera-side performance at
 * a specific chair without asking the server for anything it does not already say out loud.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 **WHY THIS IS A LITTLE STATE MACHINE AND NOT FOUR `setTimeout`s IN `setNominees`.**
 * ---------------------------------------------------------------------------------------------
 * `setNominees` IS CALLED REPEATEDLY WITH THE SAME LIST. `party-host.js` `cueNominees` keys its
 * cue on `beat|targets`, so the identical standing list is re-sent the moment Reckoning becomes
 * Vote; the `noms` fanout underneath it re-sends on every tap by anybody. This is the exact
 * problem `setPairs` below solves for the merged plate, and it is worth reading that header: a
 * repaint per fanout is a leak, and a PERFORMANCE per fanout is eight robots twitching
 * continuously for the length of the Reckoning — the single most likely way this change fails.
 *
 * The answer is the same shape as `setPairs`': **derive, never remember an event.**
 *
 *   · A nomination is identified by `nominator>target`. Staging fires when a key APPEARS, once.
 *   · A key that is still there on the next call is not new, and schedules nothing.
 *   · A key that has GONE cancels its un-fired beats and restores anyone it left posed — and
 *     "who should be posed" is recomputed from the live list every call rather than remembered,
 *     so a withdrawn nomination cannot leave a robot standing for the rest of the night.
 *   · The plate skin is likewise re-derived from the live target set on every call.
 *
 * ---------------------------------------------------------------------------------------------
 * 🪑 **THE SEAT LOCK STAYS ON, INCLUDING FOR THE ROBOT WHO STANDS UP.**
 * ---------------------------------------------------------------------------------------------
 * The tempting move is to drop `body.sitLock` so the stand transition can carry the accuser out
 * of the chair. Do not. `player.js` L451 is explicit about what that costs: without the lock
 * `Player.collide` shoves a body occupying the chair AABB back to the stand-mark EVERY FRAME —
 * *"that is why they used to idle in front of the seat"* — and `player.js` L644 pins
 * `model.position/rotation` under the lock because the standing gait offset applied to a body
 * holding a seated clip *"shoves one twin into the cushion and leaves the other crouched in front
 * of the chair"*. Both of those are John's documented bug, and both come back the moment the lock
 * is released on a robot whose root is inside a solid chair.
 *
 * **And the lock is not in the way, because the clip does the travelling.** `chair-seats.js`
 * `SEATED_CLIPS_LEAVE_CHAIR` measures `Sit_to_Stand_Transition_M` off the GLB: hips 0.531 → 0.782
 * with 0.44 m of end-to-end travel, ending 0.35 m INWARD of the seated hips. Local +Z is inward
 * (the seat faces the circle centre), so under a pinned root the accuser rises and steps out to
 * open floor between their chair and the middle of the ring — a robot on its feet in front of its
 * chair, which is exactly the picture wanted, reached without any body ever asking `room.collide`
 * a question about a chair it is standing inside. That same header calls `hold: true` on this
 * clip *"parks a standing robot in front of a chair"* as a caveat; for the accuser it is the
 * feature.
 *
 * 🔨 **EXECUTION IS THE WALK THAT COMMENT NAMED.** John, room DUSK: the first nominator of
 * the executed player gets up, walks at them, and hits them with the sledge. That is this
 * file's `setExecute`. It does the three things the paragraph above said a walk would need,
 * and only to the swinger, and only for this beat:
 *
 *   1. drop THAT body's chair collider (`chairBoxes[seat]` out of `space.colliders`)
 *   2. copy `pos` onto the stand-mark `at` (`STAND_IN`) WHILE sitLock is still on
 *   3. `playLoco()` so the seated clip is gone, THEN `sitLock = false`
 *
 * Everyone else stays on Idle_M / `SIT_IN`. The hammer is the body's existing `SledgeRig`
 * plus the clone's now-wired `mountProp` / `playAttack` — not a second rig. The Showrunner
 * sentinel has no chair; the camera holds on the accused and nobody is invented.
 *
 * If the walk has not arrived by `EXECUTE.WALK_TIMEOUT` the swinger swings from the
 * stand-mark anyway — a held blow is still a picture, a sit-and-cut is not.
 * ═════════════════════════════════════════════════════════════════════════════════════════════ */

/** Beat times, seconds from the moment a NEW nomination lands. */
export const ACCUSE = Object.freeze({
  STAND: 0.00,
  FLINCH: 0.40,
  GASP: 0.80,
  /** Reactors are staggered so the circle gasps as a ripple, not as a chorus line. */
  GASP_STAGGER: 0.22,
  SETTLE: 2.00,
  /** Cross-fade handed to `playSeated`. One beat must not snap into the next. */
  FADE: 0.25,
});

/**
 * Clip names, all of them already inside `friendly_all38.glb` and all of them on `chair-seats.js`
 * `SEATED_REACTION_CLIPS` — which is the allow-list `playSeated` enforces, and which FILTERS the
 * two-way choices below rather than being trusted blind. A clip that is not there just makes
 * `playSeated` return false and that beat is a no-op — never a throw, never a T-pose.
 *
 * The stand is the M transition, not F: `chair-seats.js` measures M ending 0.35 m inward of the
 * seated hips against F's *"roughly over the root"*, and a robot that stands up without leaving
 * the chair is a robot standing inside its own seat (see the seat-lock note above).
 */
export const ACCUSE_CLIPS = Object.freeze({
  stand: 'Sit_to_Stand_Transition_M',
  flinch: 'Sit_Dodge',
  gasp: Object.freeze(['Sit_Shout_Hands_on_Mouth', 'Sit_Hands_on_Head_Lean_Back']),
  settle: Object.freeze(['Sit_on_Chair_Arms_Crossed', 'Sitting_Answering_Questions']),
});

/** The allow-list, defensively — an empty or absent one must not delete the performance. */
export function seatedReactionAllow() {
  return Array.isArray(SEATED_REACTION_CLIPS) && SEATED_REACTION_CLIPS.length
    ? SEATED_REACTION_CLIPS
    : null;
}

/**
 * Narrow a choice list to what `playSeated` will actually accept. An allow-list that filters
 * EVERYTHING out means it has been re-scoped to a clip family this file does not know about — in
 * that case keep the original list and let `playSeated`'s boolean be the judge, rather than
 * silently deleting the whole performance and leaving the Reckoning with a bare `!` again.
 */
export function pickAllowed(options) {
  const list = Array.isArray(options) && options.length ? options : [];
  const allow = seatedReactionAllow();
  if (!allow) return list;
  const kept = list.filter((c) => allow.includes(c));
  return kept.length ? kept : list;
}

/**
 * 🚨 **WHO GASPS IS A FUNCTION OF SEAT NUMBERS AND NOTHING ELSE — THIS IS A LEAK SURFACE.**
 *
 * Anything the circle does differently for different players is something the room can farm. If
 * the two robots who react were picked from a role list, from the deal, from the vote table, or
 * from any `rng` the server seeded with a secret, then "watch who gasps" becomes a free read on
 * hidden information, delivered on the biggest screen in the house, every single Reckoning.
 *
 * So the picks are derived from the ACCUSED'S and ACCUSER'S SEAT INDICES, which are printed on
 * the name tags and visible to everybody in the room. Same two chairs accused, same two chairs
 * react, every episode, for every player, regardless of who anyone is. The stride of 3 is only
 * there so the reactors are spread around the ring instead of being the accused's neighbours;
 * the sweep after it tops up when the stride collides (seat counts divisible by 3).
 */
export function reactorSeats(seatCount, accusedSeat, nominatorSeat) {
  const n = Math.max(0, seatCount | 0);
  if (!n) return [];
  const skip = new Set();
  if (Number.isFinite(accusedSeat)) skip.add(accusedSeat | 0);
  if (Number.isFinite(nominatorSeat)) skip.add(nominatorSeat | 0);
  const want = Math.min(3, Math.max(0, n - skip.size));
  const out = [];
  const start = (Number.isFinite(accusedSeat) ? accusedSeat | 0 : 0)
    + (Number.isFinite(nominatorSeat) ? nominatorSeat | 0 : 0) + 3;
  for (let i = 0; i < n && out.length < want; i++) {
    const s = (((start + i * 3) % n) + n) % n;
    if (skip.has(s) || out.includes(s)) continue;
    out.push(s);
  }
  for (let s = 0; s < n && out.length < want; s++) {
    if (skip.has(s) || out.includes(s)) continue;
    out.push(s);
  }
  return out;
}

/**
 * The accused's held posture. **Seat index only** — same reason as `reactorSeats`, and this one
 * is the sharper edge of the two: arms-crossed vs answering-questions reads as defiant vs
 * cooperative, so if the choice tracked a role the room would be handed a tell with a MEANING
 * attached rather than merely a pattern. Seat 3 is arms-crossed whoever is sitting in it.
 */
export function settleClip(accusedSeat, options) {
  const list = pickAllowed(options || ACCUSE_CLIPS.settle);
  if (!list.length) return null;
  const i = Number.isFinite(accusedSeat) ? accusedSeat | 0 : 0;
  return list[((i % list.length) + list.length) % list.length];
}

/** Reactor clip, likewise off the reacting seat's own index. */
export function gaspClip(seatIndex, options) {
  const list = pickAllowed(options || ACCUSE_CLIPS.gasp);
  if (!list.length) return null;
  const i = Number.isFinite(seatIndex) ? seatIndex | 0 : 0;
  return list[((i % list.length) + list.length) % list.length];
}

/**
 * One nomination as DATA: `[{ at, seat, clip, hold, role }]`, sorted by time. Pure and
 * THREE-free so `harness/accusation-stage.mjs` can assert the whole running order without a
 * browser — same discipline as `chair-seats.js`.
 */
export function planAccusation({ nominatorSeat = null, accusedSeat = null, seatCount = 0 } = {}) {
  const beats = [];
  const hasNom = Number.isFinite(nominatorSeat);
  const hasAcc = Number.isFinite(accusedSeat);
  if (hasNom) {
    beats.push({
      at: ACCUSE.STAND, seat: nominatorSeat | 0, clip: ACCUSE_CLIPS.stand, hold: true, role: 'nominator',
    });
  }
  if (hasAcc) {
    beats.push({
      at: ACCUSE.FLINCH, seat: accusedSeat | 0, clip: ACCUSE_CLIPS.flinch, hold: false, role: 'accused',
    });
    const seats = reactorSeats(seatCount, accusedSeat, nominatorSeat);
    seats.forEach((s, i) => {
      const clip = gaspClip(s);
      if (!clip) return;
      beats.push({
        at: ACCUSE.GASP + i * ACCUSE.GASP_STAGGER, seat: s, clip, hold: false, role: 'reactor',
      });
    });
    const held = settleClip(accusedSeat);
    if (held) {
      beats.push({ at: ACCUSE.SETTLE, seat: accusedSeat | 0, clip: held, hold: true, role: 'accused' });
    }
  }
  beats.sort((a, b) => a.at - b.at);
  return beats;
}

/**
 * How long a `nominator>target` performance lasts: last planned beat + fade.
 * Default plan is a full circle accusation (SETTLE 2.00 + FADE 0.25).
 * Sequential nom wait is this span, not a standing-count cap.
 */
export function accusationSpan(beats) {
  const list = Array.isArray(beats) && beats.length
    ? beats
    : planAccusation({ nominatorSeat: 0, accusedSeat: 1, seatCount: 8 });
  let last = 0;
  for (const b of list) {
    const at = Number(b?.at);
    if (Number.isFinite(at) && at > last) last = at;
  }
  return last + ACCUSE.FADE;
}

/** True once `elapsed` seconds have covered the last planned beat + fade. */
export function accusationFinished(elapsed, beats) {
  return Number(elapsed) >= accusationSpan(beats);
}

/**
 * 🔨 **WHO ACTS ON EXECUTION.** Pure, THREE-free, public ids only. The RULE is already
 * `vote.js` `executioner()` — first nominator of the executed player, or `SHOWRUNNER` if
 * that nominator was taken. This is the staging plan the TV plays: walk if there is a
 * body, hold on the accused if there is not. Empty ids are off.
 */
export const EXECUTE = Object.freeze({
  /** Sit_to_Stand_Transition_M is ~6.2 s authored; fit it into this so the walk starts. */
  RISE_DUR: 1.65,
  /** Metres from the accused's sit-root to stop and swing. Inside `WEAPON_RANGE.sledge`. */
  STRIKE: 1.15,
  /** If the inner-ring walk has not arrived, swing from the stand-mark anyway. */
  WALK_TIMEOUT: 8.0,
  FACE: 0.28,
});

export function planExecute({ executionerId = '', targetId = '' } = {}) {
  const executioner = String(executionerId || '');
  const target = String(targetId || '');
  const showrunner = executioner === SHOWRUNNER;
  const actor = (!executioner || showrunner) ? null : executioner;
  return {
    actor,
    target: target || null,
    walk: !!(actor && target && actor !== target),
    showrunner,
  };
}

/** `nominator>target`, the identity of one accusation. A second accuser is a second beat. */
export function nomKey(row) {
  const target = String(row?.target ?? row ?? '');
  const nominator = row?.nominator == null ? '' : String(row.nominator);
  return `${nominator}>${target}`;
}

/** Normalize a `standing` row off the wire. Tolerates a bare id, as `setNominees` always has. */
export function nomRows(standing) {
  const out = [];
  const seen = new Set();
  for (const n of standing || []) {
    if (n == null) continue;
    const target = String((typeof n === 'object' ? n.target : n) ?? '').trim();
    if (!target) continue;
    const nominator = (typeof n === 'object' && n.nominator != null) ? String(n.nominator) : null;
    const key = nomKey({ nominator, target });
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, nominator, target });
  }
  return out;
}

/**
 * 🎭 The staging machine. Pure — no THREE, no avatars, no clock of its own. The bed hands it
 * three hooks and drives it a frame at a time; the harness hands it recorders.
 *
 * @param {object} o
 * @param {(id:string)=>number|null} o.seatOf   public id -> chair index, null if not in the circle
 * @param {number} o.seatCount
 * @param {(seat:number, clip:string, hold:boolean)=>boolean} o.play  true iff the clip took
 * @param {(seat:number)=>void} o.rest          put this chair back on the plain seated idle
 * @param {(targets:Set<string>)=>void} o.mark  the live accused set, for the plate skin
 */
export function createAccusationStage({ seatOf, seatCount = 0, play, rest, mark } = {}) {
  /** key -> row. The live standing list, as of the last `set`. Never an event log. */
  const staged = new Map();
  /** seat -> { clip, key }. Only HELD poses; one-shots end on their own and need no restore. */
  const held = new Map();
  /** Un-fired beats. Each carries its key so a withdrawn nomination can cancel its own. */
  let cues = [];

  const seatFor = (id) => {
    if (id == null) return null;
    const s = seatOf?.(id);
    return Number.isFinite(s) && s >= 0 ? (s | 0) : null;
  };

  function fire(c) {
    const ok = play?.(c.seat, c.clip, c.hold) === true;
    // A hold is only remembered if it actually took. Recording a pose the body never adopted
    // would make `reapply` re-issue a clip that does not exist, forever.
    if (ok && c.hold) held.set(c.seat, { clip: c.clip, key: c.key });
  }

  return {
    /** The live standing list. Idempotent: only APPEARING keys stage. */
    set(standing) {
      const rows = nomRows(standing);
      const next = new Map(rows.map((r) => [r.key, r]));

      // ── gone: cancel un-fired beats so a withdrawal mid-stagger does not gasp anyway
      for (const key of [...staged.keys()]) {
        if (next.has(key)) continue;
        staged.delete(key);
        cues = cues.filter((c) => c.key !== key);
      }

      // ── new: schedule ONCE, on appearance
      for (const [key, row] of next) {
        if (staged.has(key)) continue;
        staged.set(key, row);
        const accusedSeat = seatFor(row.target);
        const nominatorSeat = seatFor(row.nominator);
        if (accusedSeat == null && nominatorSeat == null) continue;
        for (const b of planAccusation({ accusedSeat, nominatorSeat, seatCount })) {
          cues.push({ left: b.at, key, seat: b.seat, clip: b.clip, hold: b.hold, role: b.role });
        }
      }

      /*
       * ── restore, DERIVED. Who should be posed is recomputed from the live list; nobody's
       * history is consulted. This is `setPairs`' rule — the seat is the source of truth — and
       * it is what makes "the nomination was withdrawn" put the robot back down without any
       * withdrawal event ever being delivered.
       */
      const liveSeats = new Set();
      for (const row of staged.values()) {
        const a = seatFor(row.target); if (a != null) liveSeats.add(a);
        const b = seatFor(row.nominator); if (b != null) liveSeats.add(b);
      }
      for (const seat of [...held.keys()]) {
        if (liveSeats.has(seat)) continue;
        held.delete(seat);
        rest?.(seat);
      }

      mark?.(new Set([...staged.values()].map((r) => r.target)));
      return rows.length;
    },

    /** Drive the stagger. Returns how many beats fired this frame — the harness reads it. */
    step(dt) {
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

    /**
     * Re-issue the HELD poses only, with no delay and no one-shots.
     *
     * `parkSit` sweeps the whole circle back onto the seated idle from `setTalk`, `holdForRun`
     * and `releaseRun` — so a beat change while a nomination is live (Reckoning -> Vote is
     * exactly that) silently sat the accuser back down. Replaying the whole staging there would
     * re-gasp the circle on every beat, which is the twitch this file is trying to avoid, so
     * only the terminal poses come back. The bed's `play` hook skips a body already holding the
     * clip, so this is a no-op in the common case.
     */
    reapply() {
      let n = 0;
      for (const [seat, row] of held) {
        if (play?.(seat, row.clip, true) === true) n++;
      }
      return n;
    },

    /** Harness windows. */
    pending: () => cues.length,
    keys: () => [...staged.keys()],
    performing: () => [...held.entries()].map(([seat, row]) => ({ seat, clip: row.clip })),
  };
}
