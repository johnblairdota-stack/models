/**
 * 📊 **HONEST SCOREKEEPER — the board prints the SERVER's answers, never a driver's wish.**
 *
 * Couch Plan Rung 1. DUSK6 episode 2 looked like the board lied (Fox 4 / Gus 4 on the TV
 * against a season log that wanted 5–3). The count was never broken. A nominator's vote is
 * locked (`room.js` `nominator vote locked`); real phones have no recast buttons. The SIM
 * wrote what it *meant* to send into a `votesSent` column and ignored `ballotOk`. The
 * television printed `t:'lynch'`. This file is the logger that cannot make that mistake:
 * it records `ballotOk` receipts and the `t:'lynch'` fanout, and it prints those.
 *
 * No THREE, no DOM. The TV and the pads format HTML from this; `vote-table` asserts the
 * same strings.
 */

import { acceptLynchVotes, assumedLynchVotes, NO_ONE, tallyVote } from './vote.js';

/** Living-majority line already on the wire as `t:'tally'.need` / `.living`. */
export function clearsLine({ need, living } = {}) {
  const n = Number(need) | 0;
  const m = Number(living) | 0;
  if (!m) return '';
  return `${n} of ${m} clears`;
}

const NOBODY = new Set([NO_ONE, 'NOBODY', 'NO ONE', 'nobody', '']);

function asVoteList(votes) {
  if (!votes) return [];
  if (Array.isArray(votes)) {
    return votes
      .filter((v) => v && v.voter)
      .map((v) => ({ voter: String(v.voter), choice: v.choice }));
  }
  return Object.entries(votes).map(([voter, choice]) => ({ voter, choice }));
}

function nameOf(names, id, fallback) {
  if (id == null) return fallback || '';
  if (typeof names === 'function') return names(id) || fallback || id;
  if (names && typeof names === 'object' && names[id] != null && names[id] !== '') return String(names[id]);
  return fallback || String(id);
}

/**
 * Rows the board may print. Living voters only. No NOBODY / NO_ONE row. No dead row.
 * A nominator locked to their standing target reads `Cy → Fox · nominated.`
 *
 * @param {{
 *   votes: Array<{voter:string, choice:string}>|Record<string,string>,
 *   noms?: Array<{nominator:string, target:string}>,
 *   living?: string[],
 *   dead?: string[],
 *   names?: Record<string,string>|((id:string)=>string),
 * }} opts
 */
export function lynchBoardRows({ votes, noms = [], living = null, dead = [], names = null } = {}) {
  const live = living ? new Set(living.map(String)) : null;
  const deadSet = new Set((dead || []).map(String));
  const locked = new Map((noms || []).filter((n) => n?.nominator && n?.target).map((n) => [String(n.nominator), String(n.target)]));
  const rows = [];
  for (const v of asVoteList(votes)) {
    const voter = String(v.voter);
    if (deadSet.has(voter)) continue;
    if (live && !live.has(voter)) continue;
    const choice = v.choice == null ? '' : String(v.choice);
    if (NOBODY.has(choice)) continue;
    const nominated = locked.get(voter) === choice;
    const who = nameOf(names, voter, voter);
    const whom = nameOf(names, choice, choice);
    rows.push({
      voter,
      choice,
      nominated,
      text: nominated ? `${who} → ${whom} · nominated.` : `${who} → ${whom}`,
    });
  }
  return rows;
}

/**
 * Count standing nominees from accepted ballots. Dead and NOBODY never appear.
 */
export function lynchBoardCounts({ votes, noms = [], living = null, dead = [] } = {}) {
  const live = living ? living.map(String) : asVoteList(votes).map((v) => v.voter);
  const deadSet = new Set((dead || []).map(String));
  const livingIds = live.filter((id) => !deadSet.has(id));
  const standing = (noms || []).map((n) => n.target).filter(Boolean);
  const box = {};
  for (const v of asVoteList(votes)) {
    if (deadSet.has(String(v.voter))) continue;
    if (living && !living.map(String).includes(String(v.voter))) continue;
    box[v.voter] = v.choice;
  }
  const r = tallyVote({ living: livingIds, nominations: (noms || []).filter((n) => standing.includes(n.target)) }, box);
  const counts = {};
  for (const id of standing) {
    if (deadSet.has(String(id))) continue;
    counts[id] = r.counts[id] || 0;
  }
  return counts;
}

/**
 * Reconstruct the ballot box the SERVER accepted.
 *
 * `t:'lynch'` is the aired record. `ballotOk` receipts name what was recorded for
 * the voter who tapped (or was refused). Nominators may never send — their lock is
 * in `noms`. A `votesSent` / wish column is ignored even if present.
 */
export function acceptedFromServer({ ballotOk = [], lynch = null, noms = [], living = [], dead = [] } = {}) {
  const live = (living || []).map(String).filter((id) => !(dead || []).map(String).includes(id));
  const fromLynch = {};
  for (const v of asVoteList(lynch?.votes)) fromLynch[v.voter] = v.choice;
  const fromReceipts = {};
  for (const r of ballotOk || []) {
    if (!r || r.voter == null) continue;
    if (r.choice != null && r.choice !== '') fromReceipts[String(r.voter)] = r.choice;
  }
  const locked = assumedLynchVotes(noms, live);
  const wish = {};
  const box = acceptLynchVotes(
    { living: live, nominations: noms || [] },
    { ...wish, ...fromLynch, ...fromReceipts, ...locked },
  );
  return box;
}

/**
 * One episode's printed board, from the SERVER's answers only.
 * `votesSent` on the record is not read.
 */
export function printLynchBoard({
  ballotOk = [], lynch = null, noms = [], living = [], dead = [], names = null, tally = null,
} = {}) {
  const box = acceptedFromServer({ ballotOk, lynch, noms, living, dead });
  const votes = Object.entries(box).map(([voter, choice]) => ({ voter, choice }));
  const rows = lynchBoardRows({ votes, noms, living, dead, names });
  const counts = lynchBoardCounts({ votes, noms, living, dead });
  const need = tally?.need != null ? tally.need : (living?.length ? Math.floor(living.length / 2) + 1 : 0);
  const line = clearsLine({ need, living: living?.length || 0 });
  return { counts, rows, line, box };
}

/**
 * Season JSON the logger is allowed to write. Driver wish (`votesSent`) is dropped
 * even if a caller hands it in — that is the DUSK6 hole.
 */
export function seasonEpisodeRecord({
  episode, living, noms, ballotOk, lynch, tally, names,
} = {}) {
  return {
    episode: episode | 0,
    living: (living || []).slice(),
    noms: (noms || []).map((n) => ({ nominator: n.nominator, target: n.target })),
    ballotOk: (ballotOk || []).map((r) => ({
      voter: r.voter, ok: r.ok !== false, choice: r.choice, why: r.why || '',
    })),
    lynch: lynch ? {
      votes: asVoteList(lynch.votes),
      result: lynch.result ? {
        executed: lynch.result.executed ?? null,
        counts: { ...(lynch.result.counts || {}) },
        threshold: lynch.result.threshold ?? 0,
        abstained: lynch.result.abstained ?? 0,
        executioner: lynch.result.executioner ?? null,
      } : null,
    } : { votes: [], result: null },
    tally: tally ? { in: tally.in | 0, living: tally.living | 0, need: tally.need | 0 } : null,
    names: names && typeof names === 'object' ? { ...names } : null,
  };
}

/** True when the printed board matches ballotOk + t:'lynch' for one episode record. */
export function seasonEpisodeAgrees(ep) {
  if (!ep) return { ok: false, why: 'no episode' };
  const printed = printLynchBoard(ep);
  const fromLynch = printLynchBoard({
    lynch: ep.lynch, noms: ep.noms, living: ep.living, dead: ep.dead, names: ep.names, tally: ep.tally,
  });
  const fromReceipts = printLynchBoard({
    ballotOk: ep.ballotOk, noms: ep.noms, living: ep.living, dead: ep.dead, names: ep.names, tally: ep.tally,
    lynch: { votes: [] },
  });
  const countsEq = JSON.stringify(printed.counts) === JSON.stringify(fromLynch.counts);
  const rowsEq = printed.rows.map((r) => r.text).join('\n') === fromLynch.rows.map((r) => r.text).join('\n');
  if (!countsEq || !rowsEq) {
    return { ok: false, why: 'board ≠ t:lynch', printed, fromLynch };
  }
  // Receipts cover whoever tapped. Nominators may have none; their lock is in noms.
  // Every receipt's choice must match the printed box.
  for (const r of ep.ballotOk || []) {
    if (!r?.voter) continue;
    if (printed.box[r.voter] !== r.choice) {
      return { ok: false, why: `ballotOk ${r.voter} ${r.choice} ≠ board ${printed.box[r.voter]}` };
    }
  }
  // Receipt-only reconstruction must not contradict the aired fanout for overlapping voters.
  for (const row of fromReceipts.rows) {
    if (printed.box[row.voter] !== row.choice) {
      return { ok: false, why: `receipt ${row.voter} drifted from lynch` };
    }
  }
  if (printed.rows.some((r) => /nobody|no one|no_one/i.test(r.text) && !r.nominated)) {
    return { ok: false, why: 'NOBODY row' };
  }
  return { ok: true, printed };
}
