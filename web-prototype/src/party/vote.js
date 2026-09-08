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

/**
 * Standing names always have a printed count, including 0. Empty chromeTally
 * with a living pile is the H379 hole (CAST8 Gus standing, tally blank).
 *
 * @param {{counts?:Record<string,number>}|null} result
 * @param {Array<{target:string}|string>} standing
 * @returns {Record<string,number>}
 */
export function standingTally(result, standing) {
  const ids = (standing || []).map((s) => (typeof s === 'string' ? s : s?.target)).filter(Boolean);
  const counts = result?.counts || {};
  const out = {};
  for (const id of ids) out[id] = Number(counts[id] || 0);
  return out;
}

/**
 * Driver and TV share HIT or no-HIT. OUT is only legal after this returns a
 * hit. Do not invent a lynch the board did not print.
 *
 * @returns {{hit:boolean, executed:string|null}|null} null = not yet held
 */
export function heldHit(driver, chrome) {
  if (!driver || !chrome) return null;
  if (!Object.prototype.hasOwnProperty.call(driver, 'executed')) return null;
  if (!Object.prototype.hasOwnProperty.call(chrome, 'executed')) return null;
  const d = driver.executed ?? null;
  const c = chrome.executed ?? null;
  if (String(d ?? '') !== String(c ?? '')) return null;
  return { hit: !!d, executed: d };
}

/**
 * 🗺️ Route / job ballot. Not the lynch — a missing vote abstains, more votes wins,
 * and a tie locks the Lights / hall default. Invalid ids are ignored.
 *
 * @param {{living:string[], votes?:Record<string,string>, available?:Array<{id:string}>, tie?:string}} o
 */
export function tallyRouteVotes({ living = [], votes = {}, available = [], tie = 'lights' } = {}) {
  const ids = (available || []).map((a) => (typeof a === 'string' ? a : a?.id)).filter(Boolean);
  const counts = Object.fromEntries(ids.map((id) => [id, 0]));
  let abstained = 0;
  for (const id of living || []) {
    const v = votes?.[id];
    if (v && counts[v] !== undefined) counts[v] += 1;
    else abstained += 1;
  }
  let best = -1;
  let winners = [];
  for (const id of ids) {
    if (counts[id] > best) { best = counts[id]; winners = [id]; }
    else if (counts[id] === best) winners.push(id);
  }
  const fallback = ids.includes(tie) ? tie : (ids[0] || tie);
  let selected = fallback;
  if (best > 0 && winners.length === 1) selected = winners[0];
  else if (best > 0 && winners.length > 1) selected = winners.includes(tie) ? tie : winners[0];
  return {
    selected,
    counts,
    abstained,
    tied: best > 0 && winners.length > 1,
  };
}

/** May `voter` pick `jobId` on the private route ballot? */
export function canRouteVote(voter, jobId, living, available) {
  if (!living?.includes(voter)) return { ok: false, why: 'not living' };
  const ids = (available || []).map((a) => (typeof a === 'string' ? a : a?.id));
  if (!jobId || !ids.includes(jobId)) return { ok: false, why: 'not available' };
  return { ok: true };
}

/* =============================================================================================
 * KEEP / EXPEL — mid-night checkpoint, not a lynch and not a win fold.
 *
 * Strict majority of the LIVING must EXPEL, same threshold as `tallyVote`
 * (`counts * 2 > living.length`). Tie or KEEP majority keeps. No coinflip.
 * The nominee votes (KEEP/EXPEL is not a self-name on the lynch ballot).
 * ============================================================================================= */

export const KEEP = 'KEEP';
export const EXPEL = 'EXPEL';
export const EXPELLED = 'EXPELLED';

export function freshCheckpoint() {
  return {
    step: 'idle',
    nominee: null,
    nominator: null,
    votes: {},
    until: null,
    result: null,
    openedAt: null,
    livingIds: null,
  };
}

/** Living, not wrecked / assimilated, not already sitting out the next job. */
export function eligibleKeepExpel(players, expelled = []) {
  const out = new Set(expelled || []);
  return (players || [])
    .filter((p) => p && p.alive && p.id && !out.has(p.id))
    .map((p) => p.id);
}

export function canKeepExpelNominate(living, nominator, target, nominee = null) {
  if (nominee) return { ok: false, why: 'already nominated' };
  if (!living?.includes(nominator)) return { ok: false, why: 'not living' };
  if (!living?.includes(target)) return { ok: false, why: 'not living' };
  if (target === nominator) return { ok: false, why: 'no self-nomination' };
  return { ok: true };
}

export function nominateKeepExpel(living, nominator, target, nominee = null) {
  const allowed = canKeepExpelNominate(living, nominator, target, nominee);
  if (!allowed.ok) return allowed;
  return { ok: true, nomination: { nominator, target } };
}

export function canKeepExpelVote(voter, choice, living) {
  if (!living?.includes(voter)) return { ok: false, why: 'not living' };
  if (choice !== KEEP && choice !== EXPEL) return { ok: false, why: 'not a ballot' };
  return { ok: true };
}

/**
 * Strict majority of the LIVING must EXPEL. Abstain is not EXPEL, so it
 * protects — same living-denominator as `tallyVote`. Tie keeps.
 */
export function tallyKeepExpel({ living = [], votes = {}, nominee = null } = {}) {
  const ids = living || [];
  let expel = 0;
  let keep = 0;
  let abstained = 0;
  for (const id of ids) {
    const v = votes?.[id];
    if (v === EXPEL) expel += 1;
    else if (v === KEEP) keep += 1;
    else abstained += 1;
  }
  const threshold = Math.floor(ids.length / 2) + 1;
  const out = !!(nominee && expel * 2 > ids.length);
  return {
    result: out ? EXPELLED : KEEP,
    expelled: out,
    expel,
    keep,
    abstained,
    threshold,
    nominee: nominee || null,
  };
}

/**
 * Public checkpoint shape. Ballots stay off this object until the result
 * word — waiting is a count, never per-seat choices, never a side.
 */
export function projectCheckpoint(checkpoint, livingIds = []) {
  const living = Array.isArray(livingIds) ? livingIds.filter(Boolean) : [];
  const step = checkpoint?.step || 'idle';
  const votes = checkpoint?.votes || {};
  const voted = living.filter((id) => votes[id] === KEEP || votes[id] === EXPEL).length;
  const result = checkpoint?.result === EXPELLED || checkpoint?.result === KEEP
    ? checkpoint.result
    : null;
  return {
    open: step !== 'idle',
    step,
    nominee: checkpoint?.nominee || null,
    nominator: checkpoint?.nominator || null,
    until: checkpoint?.until ?? null,
    waiting: Math.max(0, living.length - voted),
    voted,
    living: living.length,
    result,
  };
}

function escKeep(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** TV checkpoint plate. Waiting count only — no per-seat KEEP/EXPEL. */
export function checkpointHostHtml(checkpoint, { names = {} } = {}) {
  const c = checkpoint || {};
  if (!c.open && c.step === 'idle') return '';
  const who = c.nominee ? (names[c.nominee] || c.nominee) : '';
  const step = c.step || 'idle';
  let line = 'Nominate one living robot.';
  if (step === 'defense') line = `${who || 'They'} speak.`;
  else if (step === 'ballot') line = `Waiting on ${c.waiting | 0}.`;
  else if (step === 'result') line = c.result === EXPELLED ? 'EXPELLED · sat out the next job.' : 'KEEP.';
  const nom = who
    ? `<p class="keep-who" data-keep-nominee="${escKeep(c.nominee)}">${escKeep(who)}</p>`
    : '<p class="keep-who" data-keep-nominee="">One name.</p>';
  const wait = step === 'ballot'
    ? `<p class="hint" data-keep-waiting>Waiting on ${c.waiting | 0}</p>`
    : '';
  const result = step === 'result'
    ? `<p class="keep-result" data-keep-result="${escKeep(c.result || KEEP)}">${c.result === EXPELLED ? 'EXPELLED' : 'KEEP'}</p>`
    : '';
  return `<section class="keep-expel" data-keep-expel data-step="${escKeep(step)}">
    <p class="keep-k">KEEP / EXPEL</p>
    ${nom}
    <p class="hint">${escKeep(line)}</p>
    ${wait}${result}
  </section>`;
}

/** Phone nominate / defense / private KEEP|EXPEL. No allegiance copy. */
export function checkpointPadHtml(checkpoint, you = {}, players = []) {
  const c = checkpoint || {};
  const me = you?.id;
  const step = c.step || 'idle';
  const nameOf = (id) => {
    const p = (players || []).find((x) => x.id === id);
    return p?.name || id || '';
  };
  if (step === 'nominate') {
    const others = (players || []).filter((p) => p.alive && p.id && p.id !== me && !p.expelled);
    const buttons = others.map((p) => (
      `<button type="button" class="btn wide" data-keep-nom="${escKeep(p.id)}">${escKeep(p.name || p.id)}</button>`
    )).join('');
    return `<div class="keep-pad" data-keep-pad>
      <h1>KEEP / EXPEL</h1>
      <p class="hint">Name one living robot. Then they speak.</p>
      <div class="pick-list">${buttons}</div>
    </div>`;
  }
  if (step === 'defense') {
    const mine = me && c.nominee === me;
    return `<div class="keep-pad" data-keep-pad>
      <h1>${mine ? 'Your defense.' : 'Defense.'}</h1>
      <p class="hint">${mine ? 'Speak. The table is listening.' : `${escKeep(nameOf(c.nominee))} speaks. Watch the TV.`}</p>
    </div>`;
  }
  if (step === 'ballot') {
    const pick = you?.keepExpel;
    const keepOn = pick === KEEP ? ' on' : '';
    const expelOn = pick === EXPEL ? ' on' : '';
    return `<div class="keep-pad" data-keep-pad>
      <h1>KEEP or EXPEL.</h1>
      <p class="hint">Private. The TV only sees how many are in.</p>
      <div class="pick-list">
        <button type="button" class="btn wide${keepOn}" data-keep-vote="${KEEP}">KEEP</button>
        <button type="button" class="btn wide${expelOn}" data-keep-vote="${EXPEL}">EXPEL</button>
      </div>
    </div>`;
  }
  if (step === 'result') {
    const word = c.result === EXPELLED ? 'EXPELLED' : 'KEEP';
    const mine = me && c.nominee === me;
    const ack = c.result === EXPELLED
      ? (mine ? 'You sit out the next job.' : `${escKeep(nameOf(c.nominee))} sits out the next job.`)
      : (mine ? 'You stay in.' : `${escKeep(nameOf(c.nominee))} stays in.`);
    return `<div class="keep-pad" data-keep-pad>
      <h1>${escKeep(word)}</h1>
      <p class="hint">${escKeep(ack)}</p>
    </div>`;
  }
  return '';
}

