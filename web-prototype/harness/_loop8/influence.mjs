// Loop-8 trust matrix. THREE-free. Scores start near 0 and move only
// on observed actions the driver actually saw (or sent through a pad).
// A whisper that exists only in talk.json is a sim hole — do not invent it.

export const START = 0.02;
export const NOM_REASON = -0.18;

const LIVING = (s) => s && s.alive !== false;

export function emptyMatrix(seats) {
  const living = seats.filter(LIVING).map((s) => s.id);
  const scores = {};
  for (const a of living) {
    scores[a] = {};
    for (const b of living) {
      if (a === b) continue;
      scores[a][b] = START;
    }
  }
  return {
    episode: 0,
    living,
    scores,
    moves: [],
    holes: [],
  };
}

export function livingIds(state) {
  return Object.keys(state.scores).filter((id) => state.scores[id]);
}

export function dropDead(state, deadId) {
  if (!deadId) return;
  delete state.scores[deadId];
  state.living = state.living.filter((id) => id !== deadId);
  for (const id of state.living) {
    if (state.scores[id]) delete state.scores[id][deadId];
  }
}

function clamp(n) {
  return Math.max(-1, Math.min(1, Math.round(n * 1000) / 1000));
}

/**
 * Move one directed score. `public: false` is pad-private (whisper received
 * on that phone, or a link the two phones actually sent). Goods never get
 * a private move they could not see.
 */
export function applyObserved(state, { from, to, delta, action, public: isPublic = true }) {
  if (!from || !to || from === to) return false;
  if (!state.scores[from] || state.scores[from][to] == null) return false;
  const before = state.scores[from][to];
  const after = clamp(before + delta);
  state.scores[from][to] = after;
  state.moves.push({
    from,
    to,
    delta,
    before,
    after,
    action,
    public: !!isPublic,
  });
  return true;
}

/** Both seats were the locked pair. */
export function onPaired(state, runnerId, guideId) {
  if (!runnerId || !guideId) return;
  applyObserved(state, { from: runnerId, to: guideId, delta: 0.35, action: 'paired-together' });
  applyObserved(state, { from: guideId, to: runnerId, delta: 0.35, action: 'paired-together' });
}

/** Recap plate is public chrome — every living seat sees who ran. */
export function onRecap(state, runnerId, guideId, taken) {
  for (const id of state.living) {
    if (runnerId && id !== runnerId) {
      applyObserved(state, {
        from: id,
        to: runnerId,
        delta: taken ? -0.28 : 0.12,
        action: taken ? 'recap-taken-runner' : 'recap-survived-runner',
      });
    }
    if (guideId && id !== guideId) {
      applyObserved(state, {
        from: id,
        to: guideId,
        delta: taken ? -0.22 : 0.1,
        action: taken ? 'recap-taken-guide' : 'recap-survived-guide',
      });
    }
  }
}

/** Public nom plate. Nominator spent their vote on the nominee. */
export function onNominated(state, nominatorId, nomineeId) {
  applyObserved(state, { from: nominatorId, to: nomineeId, delta: -0.42, action: 'nominated' });
  for (const id of state.living) {
    if (id === nominatorId || id === nomineeId) continue;
    applyObserved(state, { from: id, to: nomineeId, delta: -0.08, action: 'saw-nomination' });
  }
}

/** Public lynch. */
export function onVoted(state, voterId, targetId) {
  if (!targetId || targetId === 'NO ONE') return;
  applyObserved(state, { from: voterId, to: targetId, delta: -0.3, action: 'voted' });
}

/** Who the table took. Public. */
export function onTaken(state, runnerId, guideId) {
  onRecap(state, runnerId, guideId, true);
}

/**
 * Whisper that went through the phone pad (`#whisper-send`). Only the
 * sender and the named recipient move — goods who were not on that pad
 * do not get this delta.
 */
export function onWhisperSent(state, fromId, toId, aboutId, { accuse = true } = {}) {
  if (!fromId || !toId) {
    state.holes.push({ kind: 'whisper-no-target', from: fromId });
    return false;
  }
  applyObserved(state, {
    from: fromId,
    to: toId,
    delta: 0.12,
    action: 'whisper-sent',
    public: false,
  });
  applyObserved(state, {
    from: toId,
    to: fromId,
    delta: 0.1,
    action: 'whisper-received',
    public: false,
  });
  if (aboutId && aboutId !== fromId && aboutId !== toId) {
    const d = accuse ? -0.32 : 0.18;
    applyObserved(state, {
      from: fromId,
      to: aboutId,
      delta: d,
      action: accuse ? 'whisper-accuse' : 'whisper-vouch',
      public: false,
    });
    applyObserved(state, {
      from: toId,
      to: aboutId,
      delta: accuse ? -0.22 : 0.12,
      action: accuse ? 'whisper-heard-accuse' : 'whisper-heard-vouch',
      public: false,
    });
  }
  return true;
}

/** Connected-name ship that went through `[data-link]` + accept. */
export function onLinked(state, a, b) {
  if (!a || !b) return false;
  applyObserved(state, { from: a, to: b, delta: 0.45, action: 'ship-link', public: false });
  applyObserved(state, { from: b, to: a, delta: 0.45, action: 'ship-link', public: false });
  return true;
}

export function score(state, from, to) {
  return state.scores[from]?.[to] ?? 0;
}

/** Lowest trust among `candidates`. Null if none. */
export function lowest(state, from, candidates) {
  let best = null;
  let bestS = Infinity;
  for (const id of candidates) {
    if (id === from) continue;
    const s = score(state, from, id);
    if (s < bestS) {
      bestS = s;
      best = id;
    }
  }
  return best ? { id: best, score: bestS } : null;
}

/**
 * Nom pick. Explainable = some living other is at or under NOM_REASON.
 * No reason → return null and do not nom. A nom that still fires must
 * call `assertNomReason` so the hole is the tap, not the skip.
 */
export function pickNom(state, fromId, living) {
  const pick = lowest(state, fromId, living);
  if (!pick) return null;
  if (pick.score > NOM_REASON) return null;
  return pick.id;
}

/** Call after a real `[data-nom]` tap. Logs a hole if the matrix cannot explain it. */
export function assertNomReason(state, fromId, targetId) {
  if (!fromId || !targetId) {
    state.holes.push({ kind: 'nom-empty', from: fromId });
    return false;
  }
  const s = score(state, fromId, targetId);
  if (s > NOM_REASON) {
    state.holes.push({
      kind: 'nom-no-influence-reason',
      from: fromId,
      to: targetId,
      score: s,
    });
    return false;
  }
  return true;
}

/**
 * Lynch pick among nominees. Prefer the one this seat trusts least.
 * Voting a name this seat still trusts (> 0) is a hole.
 */
export function pickVote(state, fromId, nominees) {
  const pick = lowest(state, fromId, nominees);
  if (!pick) {
    state.holes.push({ kind: 'vote-empty', from: fromId });
    return 'NO ONE';
  }
  if (pick.score > 0) {
    state.holes.push({
      kind: 'vote-trusted',
      from: fromId,
      to: pick.id,
      score: pick.score,
    });
  }
  return pick.id;
}

export function snapshot(state, extra = {}) {
  return {
    episode: state.episode,
    living: [...state.living],
    scores: JSON.parse(JSON.stringify(state.scores)),
    moves: state.moves.map((m) => ({ ...m })),
    holes: state.holes.map((h) => ({ ...h })),
    ...extra,
  };
}
