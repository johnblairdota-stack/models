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

export const STANDING_CAP = 3;
export const NO_ONE = 'NO_ONE';
export const SHOWRUNNER = 'SHOWRUNNER';

/** @typedef {{nominator:string, target:string}} Nomination */

/** May `nominator` nominate at all? Living, and once per episode. The dead never nominate (C1). */
export function canNominate(state, nominator) {
  if (!state.living.includes(nominator)) return { ok: false, why: 'not living' };
  if (state.nominations.some((n) => n.nominator === nominator)) return { ok: false, why: 'already nominated this episode' };
  if (state.nominations.length >= STANDING_CAP) return { ok: false, why: 'standing-nomination cap reached' };
  return { ok: true };
}

/** May `target` be nominated? Living, at most once per episode, never themselves. */
export function canBeNominated(state, nominator, target) {
  if (!state.living.includes(target)) return { ok: false, why: 'not living' };
  if (target === nominator) return { ok: false, why: 'no self-nomination' };
  if (state.nominations.some((n) => n.target === target)) return { ok: false, why: 'already nominated this episode' };
  return { ok: true };
}

export function nominate(state, nominator, target) {
  const a = canNominate(state, nominator);
  if (!a.ok) return { ok: false, why: a.why };
  const b = canBeNominated(state, nominator, target);
  if (!b.ok) return { ok: false, why: b.why };
  return { ok: true, nomination: { nominator, target } };
}

/** `RECKONING` closes early once every living player has spent their nomination. */
export const reckoningClosed = (state) =>
  state.nominations.length >= STANDING_CAP ||
  state.living.every((id) => state.nominations.some((n) => n.nominator === id));

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
