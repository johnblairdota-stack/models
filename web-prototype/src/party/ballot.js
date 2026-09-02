/**
 * 🗳️ **CASTING — two taps, and who you refused to send is the cheapest deduction fuel there is.**
 *
 * `docs/design/rrr-social-round.md` §2. The task and the wing are announced BEFORE anyone is
 * picked, so casting is an argument about a specific job rather than a popularity contest.
 *
 * 🚨 EVERY TIE RESOLVES DETERMINISTICALLY AND PUBLICLY. Nothing is ever re-run and nothing waits
 * on a human — a party game that stalls on a tie has stalled eight people in a lounge.
 *
 * ⚠️ **A CONTRADICTION IN THE SPEC, IMPLEMENTED THE WAY THE DESIGN MEANS RATHER THAN THE WAY IT
 * READS.** §2 gives tiebreak 2 as *"fewer rounds since last expedition — i.e. take the staler
 * player"*. Those are opposites: fewer rounds since you last went makes you FRESHER. Tiebreak 1
 * is "fewer expeditions this game", which spreads the load, so tiebreak 2 must spread it too —
 * **the staler player, the one who went longest ago, wins the tie.** `cast-ballot` B4 asserts
 * that reading. Reported, not silently fixed.
 *
 * No THREE, no DOM.
 */

/** Deterministic pick, no Math.random — `run.js`'s determinism discipline. */
export function seededPick(seed, salt, list) {
  let h = 0x811c9dc5 >>> 0;
  const s = `${seed}:${salt}`;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return list[h % list.length];
}

export const STANDING = { RUNNER: 'runner', GUIDE: 'guide' };

/**
 * @param {object} o
 * @param {Array<{voter:string, runner:string|null, guide:string|null}>} o.ballots
 * @param {string[]} o.living
 * @param {Record<string,{expeditions:number, lastEp:number|null}>} o.history
 * @param {{runner:string|null, guide:string|null}} o.lastPair   rotation lockout
 * @param {number} o.ep
 * @param {number} o.matchSeed
 * @returns {{runner:string, guide:string, tiebreaks:string[], lockoutVoid:boolean}}
 */
export function tallyCasting({ ballots, living, history, lastPair, ep, matchSeed }) {
  const runnerScore = Object.fromEntries(living.map((id) => [id, 0]));
  const guideScore = Object.fromEntries(living.map((id) => [id, 0]));
  for (const b of ballots) {
    if (b.runner && runnerScore[b.runner] !== undefined) runnerScore[b.runner]++;
    if (b.guide && guideScore[b.guide] !== undefined) guideScore[b.guide]++;
  }

  // 🚨 THE LOCKOUT IS VOID BELOW FOUR ALIVE, so it can never make casting impossible.
  const lockoutVoid = living.length < 4;
  const barred = (slot, id) => !lockoutVoid && lastPair && lastPair[slot] === id;

  const tiebreaks = [];
  const best = (scores, pool, slot) => {
    const top = Math.max(...pool.map((id) => scores[id]));
    const tied = pool.filter((id) => scores[id] === top);
    if (tied.length === 1) return tied[0];
    // (1) fewer expeditions this game
    const fewest = Math.min(...tied.map((id) => history[id]?.expeditions ?? 0));
    let cut = tied.filter((id) => (history[id]?.expeditions ?? 0) === fewest);
    if (cut.length === 1) { tiebreaks.push(`${slot}:expeditions`); return cut[0]; }
    // (2) the STALER player — longest since they last went. null lastEp = never been.
    const staleness = (id) => (history[id]?.lastEp == null ? Infinity : ep - history[id].lastEp);
    const stalest = Math.max(...cut.map(staleness));
    cut = cut.filter((id) => staleness(id) === stalest);
    if (cut.length === 1) { tiebreaks.push(`${slot}:staleness`); return cut[0]; }
    // (3) seeded, public, reproducible
    tiebreaks.push(`${slot}:seeded`);
    return seededPick(matchSeed, `cast:${ep}:${slot}`, cut.slice().sort());
  };

  const runnerPool = living.filter((id) => !barred(STANDING.RUNNER, id));
  const runner = best(runnerScore, runnerPool.length ? runnerPool : living, STANDING.RUNNER);

  // If one player tops both, they take RUNNER and the guide chair falls to the next score.
  const guidePool = living.filter((id) => id !== runner && !barred(STANDING.GUIDE, id));
  const guide = best(guideScore, guidePool.length ? guidePool : living.filter((id) => id !== runner), STANDING.GUIDE);

  return { runner, guide, tiebreaks, lockoutVoid };
}

/**
 * Same one-way lock `tallyCasting` uses. Last runner may not run; last guide may
 * not guide; they may swap. Void below four alive. Display-only on the phone —
 * the tally is still the authority if a ballot names a barred chair.
 */
export function castLockoutId(lastPair, livingCount, slot) {
  if (!lastPair || livingCount < 4) return null;
  if (slot !== STANDING.RUNNER && slot !== STANDING.GUIDE) return null;
  return lastPair[slot] || null;
}

/**
 * TV 3·2·1 arms when every living phone has a ballot, or ~20s after the first
 * one lands. Empty lists never arm — that is empty-never-invent, not a stall
 * that synthesizes a pair.
 */
export const CAST_BACKSTOP_MS = 20000;

/**
 * Who is out of the show, from public facts only — `alive:false` on the frame
 * and `player.executed` / `player.taken` in the log. Alignment stays off.
 * Episode-2 casting must not wait on a dead phone.
 */
export function deadIdsFromPublic({ players = [], events = [] } = {}) {
  const dead = new Set();
  for (const p of players || []) {
    if (p && p.alive === false && p.id) dead.add(String(p.id));
  }
  for (const e of events || []) {
    const t = e?.type;
    if (t !== 'player.executed' && t !== 'player.taken') continue;
    const id = e.data?.id;
    if (id) dead.add(String(id));
  }
  return dead;
}

/** Seat ids still in the living ballot. Dead do not need to lock a pick. */
export function livingFromPublic({ ids = [], players = [], events = [] } = {}) {
  const dead = deadIdsFromPublic({ players, events });
  return (ids || []).map((id) => (id == null ? '' : String(id))).filter((id) => id && !dead.has(id));
}

export function shouldArmCastSend({ livingIds, votes, firstBallotAt, now = Date.now() } = {}) {
  const ballots = Array.isArray(votes) ? votes : [];
  if (!ballots.length) return false;
  const living = (Array.isArray(livingIds) ? livingIds : []).filter(Boolean);
  if (living.length) {
    const voters = new Set(ballots.map((v) => v.voter).filter(Boolean));
    if (living.every((id) => voters.has(id))) return true;
  }
  if (!firstBallotAt) return false;
  return (Number(now) - Number(firstBallotAt)) >= CAST_BACKSTOP_MS;
}

/**
 * TV copy for the chain `tallyCasting` already ran. Not a second resolver.
 * fewer-expeditions → lastEp (staleness) → seededPick.
 */
export const TIEBREAK_WHY = {
  expeditions: 'fewer expeditions',
  staleness: 'longest since last walk',
  seeded: 'seeded pick',
};

export function describeCastTiebreaks(tiebreaks) {
  return (tiebreaks || []).map((code) => {
    const [slot, how] = String(code).split(':');
    if (!slot || !how) return '';
    const who = slot === STANDING.GUIDE ? 'Guide' : 'Runner';
    const why = TIEBREAK_WHY[how];
    return why ? `${who}: ${why}` : '';
  }).filter(Boolean);
}

/**
 * Rebuild the public history already written on `cast.ballot`. Display-only —
 * `playEpisode` is still the only caller that locks a pair.
 */
export function historyFromCastEvents(events) {
  const history = {};
  let lastPair = { runner: null, guide: null };
  for (const e of events || []) {
    if (e?.type !== 'cast.ballot') continue;
    const d = e.data || {};
    for (const id of [d.runner, d.guide]) {
      if (!id) continue;
      const row = history[id] || (history[id] = { expeditions: 0, lastEp: null });
      row.expeditions += 1;
      if (d.episode != null) row.lastEp = d.episode;
    }
    lastPair = { runner: d.runner ?? null, guide: d.guide ?? null };
  }
  return { history, lastPair };
}

/**
 * What the current ballots would resolve to, using the same `tallyCasting` the
 * room will run at send-them-in. Returns only the public reason codes.
 */
export function previewCastTiebreaks({ ballots, living, events, ep, matchSeed }) {
  if (!Array.isArray(ballots) || !ballots.length) return [];
  if (!Array.isArray(living) || living.length < 2) return [];
  if (matchSeed == null || matchSeed === '') return [];
  if (!Number.isFinite(Number(matchSeed))) return [];
  const seated = new Set(living);
  const votes = ballots.filter((v) => v && seated.has(v.runner) && seated.has(v.guide) && v.runner !== v.guide);
  if (!votes.length) return [];
  const { history, lastPair } = historyFromCastEvents(events);
  return tallyCasting({
    ballots: votes, living, history, lastPair,
    ep: Number(ep) || 1, matchSeed: Number(matchSeed) | 0,
  }).tiebreaks || [];
}

/**
 * REFUSE THE CHAIR — once per game, public, attributed, permanent.
 *
 * The veto re-pointed: a statement about a job you were given rather than about somebody else's
 * pick, and a lovely thing for a good player to do at exactly the wrong moment.
 */
export function refuse({ slot, refuser, ballots, living, history, lastPair, ep, matchSeed }) {
  const pool = living.filter((id) => id !== refuser);
  const again = tallyCasting({
    ballots: ballots.map((b) => ({ ...b, [slot]: b[slot] === refuser ? null : b[slot] })),
    living: pool, history, lastPair, ep, matchSeed,
  });
  return { slot, refuser, replacement: again[slot] };
}
