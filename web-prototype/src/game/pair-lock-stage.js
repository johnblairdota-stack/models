/**
 * pair-lock-stage — THE CIRCLE PERFORMS THE PAIR LOCK, in bare node.
 *
 * Same shape as `accusation-stage.js`: a keyed little machine, THREE-free, so
 * `harness/pair-lock-stage.mjs` (and `gates:party`) can import it without pulling
 * THREE. `.github/workflows/gates.yml` never `npm install`s. The bed still owns
 * the picture (`setPairLock` / the walk / the pan).
 *
 * ⚠️ NO THREE, NO DOM, NO ENGINE.
 *
 * After runner and guide lock (3·2·1 or the 20s ballot backstop), this scene plays
 * ON Casting before `setShow('expedition')`. It is not a SHOW beat — accusation is
 * not one either. Do not add `sendoff` to `SHOW_BEATS`.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚶 **SITLOCK DROPS AT WALK, FOR THE TWO NAMED BODIES ONLY.** Same three beats execute
 * already uses (`intro-bed.js` `beginWalk`): collider out, copy pos off the sit attach
 * onto the stand-mark WHILE sitLock is still on, `playLoco()` then `sitLock = false`.
 * The other six stay pinned. They walk to the ring origin `(cx, cz)`, not a door.
 *
 * Reactors: **none.** Who gasps is a leak surface on Reckoning; a sendoff gasp would be
 * the same leak with no accusation to justify it. Only the two named chairs move.
 *
 * Spec camera (`sendoffCam`) is wreckCam's class: numbers here, bed applies, no CUE_KIND.
 */

/** Beat times, seconds from the moment a NEW pair lock lands. */
export const PAIR = Object.freeze({
  /** Both named bodies stand. Together is fine — the 0.40 stagger is dead. */
  RISE: 0.00,
  /** sitLock off (execute pattern). Loco toward ring origin. */
  WALK: 1.65,
  /** Both on the mark, facing the camera, arch behind. */
  ARRIVE: 4.00,
  /** 2s face-hold so the two visors read, then the slow sweep starts. */
  PAN: 6.00,
  /** Pan has covered them with the arch. They turn to face it. */
  TURN: 10.00,
  /** Facing the arch. Then FADE. */
  HOLD: 12.50,
  /** Cross-fade handed to `playSeated` / the rest. One beat must not snap into the next. */
  FADE: 0.25,
});

/** Wall-clock the live hop waits before pinning expedition. HOLD + FADE. */
export const PAIR_LOCK_MS = Math.round((PAIR.HOLD + PAIR.FADE) * 1000);

export function pairLockMs() {
  return PAIR_LOCK_MS;
}

export const PAIR_CLIPS = Object.freeze({
  /** Rise only, then loco. Not a held chair-stand. */
  stand: 'Sit_to_Stand_Transition_M',
});

/** Metres between the two bodies, tangent to the arch axis. */
export const PAIR_MARK = Object.freeze({
  GAP: 0.70,
});

/** Spec camera lock — visor look, standing eye, standoff, sweep. Not a crane. */
export const SENDOFF_CAM = Object.freeze({
  LOOK_Y: 1.16,
  EYE_Y: 1.42,
  DIST: 4.2,
  SWEEP: 0.90,
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

function smoothstep(k) {
  const t = Math.min(1, Math.max(0, Number(k) || 0));
  return t * t * (3 - 2 * t);
}

/**
 * Pan mix from elapsed seconds. 0 before / at PAN, 1 at / after TURN, smoothstep between.
 */
export function sendoffU(elapsed) {
  const t = Number(elapsed) || 0;
  if (t <= PAIR.PAN) return 0;
  if (t >= PAIR.TURN) return 1;
  return smoothstep((t - PAIR.PAN) / (PAIR.TURN - PAIR.PAN));
}

/**
 * The ballroom doorway the runner leaves by. The dress does not name an arch
 * (`D4`/`D5`/`D6` have ids, no `name`); pick the widest portal on the ballroom,
 * then the one nearest the ring origin — authored that's D5.
 */
export function pairArch({ portals = [], spaceId = '', cx = 0, cz = 0 } = {}) {
  const sid = String(spaceId || '');
  const hits = [];
  for (const p of portals || []) {
    if (p == null) continue;
    const a = String(p.a || '');
    const b = String(p.b || '');
    const onBall = a === 'ballroom' || b === 'ballroom'
      || (sid && (a === sid || b === sid));
    if (!onBall) continue;
    const x = Number.isFinite(p.x) ? p.x : (p.centre?.x ?? 0);
    const z = Number.isFinite(p.z) ? p.z : (p.centre?.z ?? 0);
    hits.push({
      x, z,
      id: p.id || null,
      named: !!(p.name),
      w: Number(p.w) || 0,
    });
  }
  if (!hits.length) {
    return { x: cx, z: cz - 1, id: null, named: false, w: 0 };
  }
  hits.sort((p, q) => {
    const dw = q.w - p.w;
    if (Math.abs(dw) > 1e-6) return dw;
    return Math.hypot(p.x - cx, p.z - cz) - Math.hypot(q.x - cx, q.z - cz);
  });
  return hits[0];
}

/**
 * GAP/2 either side of `(cx, cz)` on the tangent of the arch axis.
 * faceCam looks away from the arch (at the lens). faceArch looks at the arch.
 * Y is standing-on-floor, not chair height.
 */
export function pairMarks({ cx = 0, cz = 0, arch, floorY = 0 } = {}) {
  const ax = (arch?.x ?? cx) - cx;
  const az = (arch?.z ?? (cz - 1)) - cz;
  const len = Math.hypot(ax, az) || 1;
  const ux = ax / len;
  const uz = az / len;
  const tx = -uz;
  const tz = ux;
  const half = PAIR_MARK.GAP / 2;
  const faceCam = Math.atan2(-ux, -uz);
  const faceArch = Math.atan2(ux, uz);
  const y = Number(floorY) || 0;
  return {
    runner: { x: cx + tx * half, z: cz + tz * half, y, faceCam, faceArch },
    guide: { x: cx - tx * half, z: cz - tz * half, y, faceCam, faceArch },
  };
}

/**
 * Spec camera, wreckCam's class. THREE-free numbers; the bed applies them.
 *
 * look = midpoint of the two marks, visor height 1.16.
 * u = 0: eye opposite the arch, ~4.2 m from origin, eye Y 1.42. Pair faces the lens;
 *   arch behind them. Door-in-frame is this composition — they have not walked to it.
 * u = 1: eye has swept ~0.90 rad around the look-at so the arch covers the pair.
 *   Same eye Y. Not a crane (Y does not climb). Not chase. Not top.
 */
export function sendoffCam({ cx = 0, cz = 0, floorY = 0, arch, u = 0 } = {}) {
  const k = smoothstep(u);
  const marks = pairMarks({ cx, cz, arch, floorY });
  const look = {
    x: (marks.runner.x + marks.guide.x) * 0.5,
    y: floorY + SENDOFF_CAM.LOOK_Y,
    z: (marks.runner.z + marks.guide.z) * 0.5,
  };
  const ax = (arch?.x ?? cx) - cx;
  const az = (arch?.z ?? (cz - 1)) - cz;
  const len = Math.hypot(ax, az) || 1;
  const ux = ax / len;
  const uz = az / len;
  const a0 = Math.atan2(-ux, -uz);
  const ang = a0 + SENDOFF_CAM.SWEEP * k;
  const dist = SENDOFF_CAM.DIST;
  return {
    look,
    eye: {
      x: cx + Math.sin(ang) * dist,
      y: floorY + SENDOFF_CAM.EYE_Y,
      z: cz + Math.cos(ang) * dist,
    },
  };
}

/**
 * One sendoff as DATA: `[{ at, seat, clip, hold, role }]`, sorted by time. Pure and
 * THREE-free so `harness/pair-lock-stage.mjs` can assert the running order without a
 * browser — same discipline as `accusation-stage.js`.
 *
 * No reactors. No flinch. Both rise at 0, sitLock drops at WALK, HOLD is the last
 * scheduled beat. Finished = HOLD + FADE.
 */
export function planPairLock({ runnerSeat = null, guideSeat = null } = {}) {
  const beats = [];
  const hasRunner = Number.isFinite(runnerSeat);
  const hasGuide = Number.isFinite(guideSeat);
  if (hasRunner) {
    beats.push({
      at: PAIR.RISE, seat: runnerSeat | 0, clip: PAIR_CLIPS.stand, hold: true, role: 'runner',
    });
  }
  if (hasGuide) {
    beats.push({
      at: PAIR.RISE, seat: guideSeat | 0, clip: PAIR_CLIPS.stand, hold: true, role: 'guide',
    });
  }
  if (hasRunner) {
    beats.push({
      at: PAIR.WALK, seat: runnerSeat | 0, clip: null, hold: false, role: 'walk',
    });
  }
  if (hasGuide) {
    beats.push({
      at: PAIR.WALK, seat: guideSeat | 0, clip: null, hold: false, role: 'walk',
    });
  }
  if (hasRunner || hasGuide) {
    beats.push({
      at: PAIR.HOLD, seat: hasRunner ? (runnerSeat | 0) : (guideSeat | 0),
      clip: null, hold: false, role: 'hold',
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
 * @param {(seat:number)=>void} [o.dropSitLock] execute pattern, fired at WALK for the two named seats
 */
export function createPairLockStage({ seatOf, seatCount = 0, play, rest, dropSitLock } = {}) {
  const staged = new Map();
  const held = new Map();
  /** Seats in a live pair — walking ones have left `held`, but empty set still rest()s them. */
  const occupied = new Set();
  let cues = [];
  let elapsed = 0;
  void seatCount;

  const seatFor = (id) => {
    if (id == null) return null;
    const s = seatOf?.(id);
    return Number.isFinite(s) && s >= 0 ? (s | 0) : null;
  };

  function fire(c) {
    if (c.role === 'walk') {
      dropSitLock?.(c.seat);
      held.delete(c.seat);
      return;
    }
    if (c.role === 'hold' || c.clip == null) return;
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
      for (const seat of [...occupied]) {
        if (liveSeats.has(seat)) continue;
        occupied.delete(seat);
        held.delete(seat);
        rest?.(seat);
      }
      for (const seat of liveSeats) occupied.add(seat);

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
     * reached HOLD+FADE. Pending-empty at 1.65s is not done — they are still walking.
     * The live hop waits this same number; it does not skip.
     */
    finished() {
      return staged.size > 0 && cues.length === 0 && elapsed + 1e-9 >= PAIR.HOLD + PAIR.FADE;
    },

    pending: () => cues.length,
    keys: () => [...staged.keys()],
    performing: () => [...held.entries()].map(([seat, row]) => ({ seat, clip: row.clip })),
    elapsed: () => elapsed,
  };
}
