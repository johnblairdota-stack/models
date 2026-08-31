/**
 * 📊 **HONEST SCOREKEEPER — the board prints the SERVER's answers, never a driver's wish.**
 *
 * Couch Plan Rung 1. DUSK6 episode 2: Cy nominated Fox, `_loop8` wrote `votesSent` Cy→Gus
 * at send time, `chromeTally` was Gus 4 | Fox 4. The log lied. The board did not. Season
 * JSON on that driver has NO `ballotOk` — receipts are one-socket, and the SIM never
 * recorded them. This file is the logger that cannot make that mistake: it records
 * `ballotOk` (when a phone actually got one) and the `t:'lynch'` fanout, and it never
 * writes `votesSent` as the tally.
 *
 * TV chrome this module must not replace (HEAD 4da166e):
 *   tallyBoard  header `Ballots in` · count `{in} of {living}` ·
 *               note `needs ${need} to carry` / `every ballot in — closing`
 *   nameplate   `named by ${nominator}`
 * Pad chrome this module must not replace:
 *   `Your nomination of ${name} is your vote — locked. You do not vote again.`
 *   standing    `named by ${nominator}`
 *
 * What it ADDS: `N of M clears` from `t:'tally'.need` / `.living` (8 living → 5),
 * and a nominator lynch-row mark ` · nominated.`
 *
 * No THREE, no DOM.
 */

import { acceptLynchVotes, assumedLynchVotes, NO_ONE, tallyVote } from './vote.js';

/** Living-majority line already on the wire as `t:'tally'.need` / `.living`. */
export function clearsLine({ need, living } = {}) {
  const n = Number(need) | 0;
  const m = Number(living) | 0;
  if (!m) return '';
  return `${n} of ${m} clears`;
}

/**
 * The Vote tallyBoard copy at HEAD 4da166e, plus the clears line this rung adds.
 * Routing the TV through here means the PR changes real chrome rather than guessing it.
 */
export function tallyBoardCopy(tally) {
  const t = tally || null;
  if (!t || !t.living) return null;
  const living = t.living | 0;
  const inCount = Math.min(t.in | 0, living);
  const all = inCount >= living;
  const need = t.need | 0;
  return {
    header: 'Ballots in',
    inCount,
    living,
    count: `${inCount} of ${living}`,
    note: all ? 'every ballot in — closing' : `needs ${need} to carry`,
    clears: clearsLine({ need, living }),
    all,
    pct: Math.round((inCount / Math.max(1, living)) * 100),
  };
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
 * DUSK6 `_loop8` logged the TV board as `chromeTally` — `Gus 4 | Fox 4`, or
 * `{ Gus: 4, Fox: 4 }`, or ids. That column is the board. `votesSent` is not.
 */
export function chromeTallyCounts(chromeTally, names = null) {
  if (chromeTally == null || chromeTally === '') return null;
  const raw = {};
  if (typeof chromeTally === 'string') {
    for (const part of chromeTally.split('|')) {
      const m = String(part).trim().match(/^(.+?)\s+(\d+)\s*$/);
      if (m) raw[m[1].trim()] = Number(m[2]);
    }
  } else if (typeof chromeTally === 'object' && !Array.isArray(chromeTally)) {
    for (const [k, v] of Object.entries(chromeTally)) raw[k] = Number(v);
  } else {
    return null;
  }
  if (!Object.keys(raw).length) return null;
  const nameToId = {};
  if (names && typeof names === 'object') {
    for (const [id, n] of Object.entries(names)) {
      if (n != null && n !== '') nameToId[String(n)] = String(id);
    }
  }
  const out = {};
  for (const [k, n] of Object.entries(raw)) {
    out[nameToId[k] || k] = n;
  }
  return out;
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
      who,
      whom,
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

function hasServerVotes(ballotOk, lynch) {
  return asVoteList(lynch?.votes).length > 0 || (ballotOk || []).some((r) => r && r.voter != null);
}

/**
 * One episode's printed board, from the SERVER's answers only.
 * `votesSent` on the record is not read. Old DUSK6 JSON has no `ballotOk`; the
 * aired counts live in `chromeTally` and the nominator lock lives in `noms`.
 */
export function printLynchBoard({
  ballotOk = [], lynch = null, noms = [], living = [], dead = [], names = null, tally = null,
  chromeTally = null,
} = {}) {
  const box = acceptedFromServer({ ballotOk, lynch, noms, living, dead });
  const votes = Object.entries(box).map(([voter, choice]) => ({ voter, choice }));
  const rows = lynchBoardRows({ votes, noms, living, dead, names });
  let counts = lynchBoardCounts({ votes, noms, living, dead });
  if (!hasServerVotes(ballotOk, lynch)) {
    const chrome = chromeTallyCounts(chromeTally, names);
    if (chrome) counts = chrome;
  }
  const need = tally?.need != null ? tally.need : (living?.length ? Math.floor(living.length / 2) + 1 : 0);
  const line = clearsLine({ need, living: living?.length || 0 });
  const copy = tallyBoardCopy(tally || { in: living?.length || 0, living: living?.length || 0, need });
  return { counts, rows, line, box, copy };
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

/**
 * Logger the SIM is allowed to write. Walks wire messages (`ballotOk` receipts with
 * a driver-attached `voter`, plus `t:'lynch'` / `t:'tally'` / `t:'noms'`). A
 * `votesSent` bag on `meta` is dropped — that is the DUSK6 hole.
 */
export function seasonLogFromWire(msgs, meta = {}) {
  const ballotOk = [];
  let lynch = null;
  let tally = meta.tally || null;
  let noms = meta.noms || [];
  for (const m of msgs || []) {
    if (!m || typeof m !== 'object') continue;
    if (m.t === 'ballotOk') {
      ballotOk.push({
        voter: m.voter,
        ok: m.ok !== false,
        choice: m.choice,
        why: m.why || '',
      });
    } else if (m.t === 'lynch') {
      lynch = { votes: m.votes, result: m.result };
    } else if (m.t === 'tally') {
      tally = { in: m.in | 0, living: m.living | 0, need: m.need | 0 };
    } else if (m.t === 'noms') {
      noms = m.standing || noms;
    }
  }
  return seasonEpisodeRecord({
    episode: meta.episode,
    living: meta.living,
    noms,
    ballotOk,
    lynch,
    tally,
    names: meta.names,
  });
}

/** True when the printed board matches the SERVER's answers for one episode record. */
export function seasonEpisodeAgrees(ep) {
  if (!ep) return { ok: false, why: 'no episode' };
  // `votesSent` is the driver's wish. It is never the board.
  const printed = printLynchBoard({ ...ep, votesSent: undefined });
  const chrome = chromeTallyCounts(ep.chromeTally, ep.names);
  if (chrome) {
    for (const [id, n] of Object.entries(chrome)) {
      if ((printed.counts[id] || 0) !== n) {
        return { ok: false, why: `board ≠ chromeTally ${id}: ${printed.counts[id]} ≠ ${n}`, printed };
      }
    }
    for (const n of ep.noms || []) {
      const row = printed.rows.find((r) => r.voter === String(n.nominator));
      if (!row || !row.nominated || row.choice !== String(n.target)) {
        return { ok: false, why: `noms lock missing for ${n.nominator}`, printed };
      }
    }
  }

  const hasLynch = asVoteList(ep.lynch?.votes).length > 0 || !!ep.lynch?.result;
  if (hasLynch) {
    const fromLynch = printLynchBoard({
      lynch: ep.lynch, noms: ep.noms, living: ep.living, dead: ep.dead, names: ep.names, tally: ep.tally,
    });
    const countsEq = JSON.stringify(printed.counts) === JSON.stringify(fromLynch.counts);
    const rowsEq = printed.rows.map((r) => r.text).join('\n') === fromLynch.rows.map((r) => r.text).join('\n');
    if (!countsEq || !rowsEq) {
      return { ok: false, why: 'board ≠ t:lynch', printed, fromLynch };
    }
  } else if (!chrome && !(ep.ballotOk || []).length) {
    return { ok: false, why: 'no lynch, ballotOk, or chromeTally' };
  }

  const fromReceipts = printLynchBoard({
    ballotOk: ep.ballotOk, noms: ep.noms, living: ep.living, dead: ep.dead, names: ep.names, tally: ep.tally,
    lynch: { votes: [] },
  });
  // Receipts cover whoever tapped. Nominators may have none; their lock is in noms.
  for (const r of ep.ballotOk || []) {
    if (!r?.voter) continue;
    if (printed.box[r.voter] !== r.choice) {
      return { ok: false, why: `ballotOk ${r.voter} ${r.choice} ≠ board ${printed.box[r.voter]}` };
    }
  }
  for (const row of fromReceipts.rows) {
    if (hasLynch && printed.box[row.voter] !== row.choice) {
      return { ok: false, why: `receipt ${row.voter} drifted from lynch` };
    }
  }
  if (printed.rows.some((r) => /nobody|no one|no_one/i.test(r.text) && !r.nominated)) {
    return { ok: false, why: 'NOBODY row' };
  }
  return { ok: true, printed };
}
