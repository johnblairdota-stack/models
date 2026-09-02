/**
 * 🔨 **NOMINATION, VOTE, EXECUTION.** `docs/design/rrr-social-round.md` §3.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 THE TIE RULE NEEDS NO ARITHMETIC, BECAUSE IT IS A PROPERTY OF THE THRESHOLD.
 * ---------------------------------------------------------------------------------------------
 * The threshold is **strictly more than half of the LIVING**, not half of votes cast. Two
 * consequences fall out of that one choice, and both are load-bearing:
 *
 *   · **At most one nominee can ever clear it.** Two players each holding more than half of the
 *     living is arithmetically impossible, so "what happens on a tie" is not a rule anyone has
 *     to write, remember or get wrong. `vote-table` V3 proves it exhaustively rather than
 *     trusting the argument.
 *   · **Abstaining protects the accused**, because the denominator does not shrink. That is a
 *     real choice with a real cost, and it is the reason a quiet table cannot execute anybody.
 *
 * ⚠️ THERE IS EXACTLY ONE NOMINATOR PER EXECUTED PLAYER, and that is also structural rather than
 * enforced: a player may be nominated at most once per episode, so the sledgehammer never has an
 * ambiguous owner. If that nominator was taken during the expedition, the Showrunner swings.
 *
 * No THREE, no DOM.
 */

export const NO_ONE = 'NO_ONE';
export const SHOWRUNNER = 'SHOWRUNNER';

/** In-flight sequential wait. Not `already nominated this episode` — phones must disambiguate. */
export const ACCUSATION_PLAYING = 'accusation playing';

/** @typedef {{nominator:string, target:string}} Nomination */

/** May `nominator` nominate at all? Living, and once per episode. The dead never nominate (C1). */
export function canNominate(state, nominator) {
  if (!state.living.includes(nominator)) return { ok: false, why: 'not living' };
  if (state.nominations.some((n) => n.nominator === nominator)) return { ok: false, why: 'already nominated this episode' };
  return { ok: true };
}

/** May `target` be nominated? Living, at most once per episode, never themselves. */
export function canBeNominated(state, nominator, target) {
  if (!state.living.includes(target)) return { ok: false, why: 'not living' };
  if (target === nominator) return { ok: false, why: 'no self-nomination' };
  if (state.nominations.some((n) => n.target === target)) return { ok: false, why: 'already nominated this episode' };
  return { ok: true };
}

/**
 * Sequential wait is on LANDING, not on `canNominate`. `playing` is the in-flight
 * `nominator>target` performance; refuse with a NEW why so a dump is not "you already nominated".
 *
 * @param {{living:string[], nominations:Nomination[]}} state
 * @param {string} nominator
 * @param {string} target
 * @param {{playing?:boolean}} [extra]
 */
export function nominate(state, nominator, target, extra = {}) {
  const a = canNominate(state, nominator);
  if (!a.ok) return { ok: false, why: a.why };
  const b = canBeNominated(state, nominator, target);
  if (!b.ok) return { ok: false, why: b.why };
  if (extra.playing) return { ok: false, why: ACCUSATION_PLAYING };
  return { ok: true, nomination: { nominator, target } };
}

/** Any living player who may still spend a nom on a legal unique target. */
export function canAnyoneNominate(state) {
  const living = state.living || [];
  const probe = { living, nominations: state.nominations || [] };
  return living.some((id) => (
    canNominate(probe, id).ok
    && living.some((t) => canBeNominated(probe, id, t).ok)
  ));
}

/**
 * Reckoning closes when nobody can still land a unique nom, or when the 90s TIME
 * wall has hit AFTER an in-flight accusation finished. No standing-count cap.
 *
 * @param {{living:string[], nominations:Nomination[]}} state
 * @param {{wallHit?:boolean, playing?:boolean}} [extra]
 */
export function reckoningClosed(state, extra = {}) {
  if (!canAnyoneNominate(state)) return true;
  if (extra.wallHit && !extra.playing) return true;
  return false;
}

/**
 * May `voter` pick `choice` on the lynch ballot?
 * Design §3: one standing nominee or `NO_ONE`. John (2026-08-24): no self-vote.
 *
 * @param {string} voter
 * @param {string} choice
 * @param {string[]} standing
 * @returns {{ok:boolean, why?:string}}
 */
export function canLynchVote(voter, choice, standing) {
  if (choice === voter) return { ok: false, why: 'no self-vote' };
  if (choice === NO_ONE) return { ok: true };
  if (!choice || !standing.includes(choice)) return { ok: false, why: 'not standing' };
  return { ok: true };
}

/**
 * A nominator's lynch ballot is their nomination. Pre-cast on Vote enter so they
 * cannot vote twice, and so a silent nominator still counts for their target.
 *
 * @param {Nomination[]} nominations
 * @param {string[]|null} [living]  if set, skip dead nominators / fallen targets
 * @returns {Record<string,string>}
 */
export function assumedLynchVotes(nominations, living = null) {
  const live = living ? new Set(living) : null;
  const votes = {};
  for (const n of nominations || []) {
    if (!n?.nominator || !n?.target) continue;
    if (live && !live.has(n.nominator)) continue;
    if (live && !live.has(n.target)) continue;
    votes[n.nominator] = n.target;
  }
  return votes;
}

/** The locked lynch choice for a nominator, or null if they did not name anyone standing. */
export function nominatorLockedChoice(nominations, voter) {
  const n = (nominations || []).find((x) => x.nominator === voter);
  return n?.target ?? null;
}

/**
 * What the SERVER would record for a ballot box — the live `enterVote` + `castLynchVote`
 * rules, applied in one pass so an offline driver cannot write a wish the phones could
 * not have cast.
 *
 * Nominators are locked to their standing target. Self-picks and illegal choices coerce
 * to NO_ONE, same as the live path. A missing living voter is NO_ONE (timeout / silent).
 * Dead ids in `votes` do not enter the box.
 *
 * @param {{living:string[], nominations:Nomination[]}} state
 * @param {Record<string,string>|null} [votes]
 * @returns {Record<string,string>}
 */
export function acceptLynchVotes(state, votes = null) {
  const living = state.living || [];
  const standing = (state.nominations || []).map((n) => n.target);
  const locked = assumedLynchVotes(state.nominations, living);
  const box = {};
  for (const id of living) {
    if (locked[id]) {
      box[id] = locked[id];
      continue;
    }
    const choice = votes && Object.prototype.hasOwnProperty.call(votes, id) ? votes[id] : NO_ONE;
    const allowed = canLynchVote(id, choice, standing);
    box[id] = (allowed.ok && choice !== NO_ONE) ? choice : NO_ONE;
  }
  return box;
}

/**
 * One simultaneous ballot. Non-voters and timeouts are `NO_ONE`.
 *
 * @param {{living:string[], nominations:Nomination[]}} state
 * @param {Record<string,string>} votes  voterId -> nomineeId | NO_ONE
 * @returns {{executed:string|null, counts:Record<string,number>, threshold:number, abstained:number}}
 */
export function tallyVote(state, votes) {
  const standing = state.nominations.map((n) => n.target);
  const counts = Object.fromEntries(standing.map((id) => [id, 0]));
  let abstained = 0;
  for (const voter of state.living) {
    const v = votes[voter];
    if (v && v !== NO_ONE && counts[v] !== undefined) counts[v]++;
    else abstained++;
  }
  // Strictly more than half of the LIVING. Integer form, no floats.
  const threshold = Math.floor(state.living.length / 2) + 1;
  const cleared = standing.filter((id) => counts[id] * 2 > state.living.length);
  return {
    executed: cleared.length === 1 ? cleared[0] : null,
    counts, threshold, abstained,
    // Recorded so a gate can assert the impossibility rather than assume it.
    multipleCleared: cleared.length > 1,
  };
}

/**
 * Who swings. Exactly one nominator exists by construction; if they were taken this episode the
 * Showrunner does it, and the log says so.
 */
export function executioner(state, executed, takenThisEpisode = []) {
  if (!executed) return null;
  const nom = state.nominations.find((n) => n.target === executed);
  if (!nom) return null;
  return takenThisEpisode.includes(nom.nominator) ? SHOWRUNNER : nom.nominator;
}
