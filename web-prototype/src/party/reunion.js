/**
 * 🏆 **THE REUNION SPECIAL — every beat is a query, and that is the test of the schema.**
 *
 * `docs/design/rrr-social-round.md` §7. **If a beat cannot be written as a query over the log,
 * the schema is wrong, and this is where you find that out.** That is the whole reason the
 * Reunion was designed before the log rather than after it.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 THERE IS NO SECOND REVEAL PIPELINE. `log.reunion()` IS `log.all()`.
 * ---------------------------------------------------------------------------------------------
 * `party-log` L4 asserts that already. Everything here reads the same stream the live filter
 * read — so a leak and a missing reveal are the same bug, and the only way to add something to
 * the Reunion is to write the event during play. A hand-assembled reveal payload would let the
 * two drift for a month before anyone noticed.
 *
 * 🚨 EVERY AWARD CARRIES `querySeq[]`, THE SEQUENCE NUMBERS THAT EARNED IT. That single field is
 * the difference between a list of names and the bit people quote afterwards: the TV cuts
 * straight to the footage that proves it. It is also what makes `reunion-truth` U3 possible —
 * an award nobody can evidence is an award nobody should believe.
 *
 * No THREE, no DOM.
 */

import { EVIL, GOOD } from './cast.js';
import { SCRIPT } from './roles.js';

const byType = (log, type) => log.filter((e) => e.type === type);

/** Ground truth, straight out of the sealed deal. */
export function dealtFrom(log) {
  const e = log.find((x) => x.type === 'cast.deal');
  return e ? e.data.seats : [];
}

/**
 * BEAT 1 — the roll call. True role beside final claim, with the Glitched's cover named for the
 * first time. Everything here was written during play; nothing is computed now that could not
 * have been computed then.
 */
export function rollCall(log) {
  const dealt = dealtFrom(log);
  const claims = new Map();
  for (const e of byType(log, 'player.claim_set')) claims.set(e.data.id, e.data.claim);
  const deaths = new Map();
  for (const e of log) {
    if (e.type === 'player.taken') deaths.set(e.data.id, { by: 'TAKEN', seq: e.seq });
    if (e.type === 'player.executed') deaths.set(e.data.id, { by: 'EXECUTED', seq: e.seq, executioner: e.data.executioner });
  }
  return dealt.map((s) => ({
    id: s.id, seat: s.seat,
    role: s.role, alignment: s.alignment,
    // Named for the first time: they believed this all game and were never told.
    believedTheyWere: s.cover ?? null,
    finalClaim: claims.get(s.id) ?? null,
    death: deaths.get(s.id) ?? null,
  }));
}

/**
 * BEAT 2 — the decisive episode. The one containing the win, else the last one that took
 * somebody. Defined as a query so the show never has to be told which episode mattered.
 */
export function decisiveEpisode(log) {
  const win = log.find((e) => e.type === 'win.checked' && e.data.rule);
  const ep = (seq) => {
    let cur = 1;
    for (const e of log) { if (e.seq > seq) break; if (e.type === 'cast.ballot') cur = e.data.episode ?? cur; }
    return cur;
  };
  if (win) return { episode: ep(win.seq), because: `win.${win.data.rule}`, atSeq: win.seq };
  const deaths = log.filter((e) => e.type === 'player.taken' || e.type === 'player.executed');
  const last = deaths[deaths.length - 1];
  return last ? { episode: ep(last.seq), because: 'last death', atSeq: last.seq } : null;
}

/** BEAT 4 — the chat, recoloured. `generated` is unsealed here and nowhere else. */
export function chatUnmixed(log) {
  return byType(log, 'chat.posted').map((e) => ({
    seq: e.seq, text: e.data.text, author: e.data.author ?? null, generated: !!e.data.generated,
  }));
}

/* =================================================================================================
 * 🍖 **BEAT 0 — THE FEED COUNT, UNSEALED. The number the whole night was built around not saying.**
 *
 * `rrr-social-round.md` §4 lists what the Verdict may air and what it holds back, and the feed
 * count is on the second list: the gauge is a **deliberately lossy proxy**, because evil losing a
 * partner looks exactly like evil winning, and airing the number mid-season would hand the room a
 * deduction the design spends every episode denying it. `room.js` writes it as `win.checked`
 * (`VIS.SEALED`) and `enterVerdictLive` picks fields off the fold precisely so it cannot ride out.
 *
 * 🚨 **"HELD BACK UNTIL THE REUNION" IS A PROMISE WITH TWO HALVES, AND ONLY ONE WAS BUILT.** The
 * seal was airtight — `party-night` N17h0b, `party-warm` W47c/W47d and `FANOUT_KEYS.verdict` all
 * guard the way in. Nothing opened it at the other end: `reunion()` returned roll call, cut,
 * awards and chat, `FANOUT_KEYS.reveal` had no row for a feed count, and no screen in the
 * codebase could print one. The number was sealed on episode one and stayed sealed past the last
 * frame of the season. COUCH-PLAN Rung 4 names it in the payday — *"it reaches every pad: roles,
 * the feed count, `believedTheyWere`"* — and two of those three were shipped.
 *
 * Same shape as `chatUnmixed` above: this is a QUERY over the log that was already written during
 * play, not a second pipeline. `win.checked` is recorded on every verdict, so the LAST one is the
 * season's, and `camerasLit` rides along because the two numbers are the same sentence — the
 * Verdict aired the cameras all season and never the feed, and the Reunion is where the room
 * finally gets both halves of the scoreboard side by side.
 *
 * Returns `null` when the log holds no `win.checked` at all, which is honest rather than zero: a
 * season that never reached a verdict has no feed count, and printing `0` would be a claim.
 * Gate: `room-ghosts` RG3–RG3d.
 * ================================================================================================= */
export function feedCount(log, targets = null) {
  const checks = byType(log, 'win.checked');
  const last = checks[checks.length - 1];
  if (!last) return null;
  return {
    fed: Number(last.data.fed) || 0,
    feedTarget: targets?.feedTarget ?? null,
    camerasLit: Number(last.data.camerasLit) || 0,
    cameraTarget: targets?.cameraTarget ?? null,
  };
}

/* =================================================================================================
 * 🗣️ **NO GENERATED LINE MAY NAME ITS OWN SPEAKER.**
 *
 * Four blind nights ran on sim-authored talk and every one of them outed the evils the same way:
 * *"Cy is clean. I will say that."* — **said by Cy.** A player vouching for themselves in the
 * third person is not a tell the couch has to read; it is a label. COUCH-PLAN Rung 4 banks it.
 *
 * ⚠️ **THE SHIPPED TREE AUTHORS NO TALK LINE AT ALL, AND THAT IS THE FINDING.** `chat.posted` is
 * emitted by nothing in `src/` or `net/` — the only writers are the `harness/_loop8/drive-*.mjs`
 * sim puppets, which are not the product. That is the same rule as *"the server does not author
 * claims"* (2026-08-28), one level up: a claim is a player verb, and so is a sentence. So this is
 * a **fail-closed guard placed before the feature**, not a fix for a live bug — the day something
 * in the product starts generating a line, it passes through here or the gate goes red.
 *
 * Word-boundary matched and case-folded, so `CY` catches `Cy is clean` and does not catch
 * `Cynthia` or the middle of `accuracy`. A speaker with no name, or an empty line, is not a hit —
 * this refuses what it can prove, and returns `false` rather than guessing.
 * Gate: `room-ghosts` RG5–RG5c.
 * ================================================================================================= */
export function speakerNamed(text, speakerName) {
  const name = String(speakerName ?? '').trim();
  const line = String(text ?? '');
  if (!name || !line) return false;
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}\\p{N}])${esc}([^\\p{L}\\p{N}]|$)`, 'iu').test(line);
}

/**
 * Every generated line in a reveal's chat that names its own speaker. Empty is the shipped answer
 * and the one the gate asserts; a non-empty list is the names of the players the show outed.
 *
 * 🚨 **`generated` IS THE FILTER, AND ON PURPOSE.** A human typing their own name is a PLAY — the
 * bluff, the third-person joke, the deliberate over-vouch — and banning it would be the show
 * editing a player. This rule binds only what the show itself wrote.
 */
export function selfNamingLines(chat, nameOf) {
  const out = [];
  for (const c of chat || []) {
    if (!c?.generated) continue;
    const who = typeof nameOf === 'function' ? nameOf(c.author) : (nameOf || {})[c.author];
    if (speakerNamed(c.text, who)) out.push({ seq: c.seq, author: c.author, name: who, text: c.text });
  }
  return out;
}

/**
 * BEAT 3 — the awards. Each returns `{award, winner, querySeq, why}` or `null` when the log
 * holds no evidence, which is honest rather than empty: an award granted with no query behind it
 * is exactly the thing `querySeq` exists to make impossible.
 */
export function awards(log, { alignmentOf }) {
  const dealt = dealtFrom(log);
  const ids = dealt.map((s) => s.id);
  if (!ids.length) return [];

  const noms = byType(log, 'nom.made');
  const votes = byType(log, 'vote.cast');
  const noise = byType(log, 'noise.emitted');
  const out = [];

  const grant = (award, winner, querySeq, why) => {
    if (winner == null || !querySeq.length) return;
    out.push({ award, winner, querySeq, why });
  };

  const seqsWhere = (list, pred) => list.filter(pred).map((e) => e.seq);
  const good = ids.filter((id) => alignmentOf(id) === GOOD);
  const evil = ids.filter((id) => alignmentOf(id) === EVIL);

  // Most Trusted — fewest accusations and fewest votes against.
  //
  // 🚨 ITS EVIDENCE IS AN ABSENCE, AND THE FIRST VERSION COULD THEREFORE NEVER GRANT IT. Pointing
  // `querySeq` at "the events naming this player" is empty precisely when they win, so the award
  // silently never appeared. The proof is the OTHER direction: here is every accusation in the
  // game, and none of them is you. So the query is the whole record, and the TV cuts through it.
  if (good.length && (noms.length || votes.length)) {
    const score = (id) => noms.filter((e) => e.data.target === id).length
      + votes.filter((e) => e.data.choice === id).length;
    const best = good.slice().sort((a, b) => score(a) - score(b))[0];
    grant('Most Trusted', best, [...noms, ...votes].map((e) => e.seq),
      `${score(best)} of ${noms.length + votes.length} accusations and votes in the whole game landed on them`);
  }

  // The Mark — the good player the room voted for most.
  if (good.length && votes.length) {
    const n = (id) => votes.filter((e) => e.data.choice === id).length;
    const best = good.slice().sort((a, b) => n(b) - n(a))[0];
    if (n(best) > 0) grant('The Mark', best, seqsWhere(votes, (e) => e.data.choice === best),
      `${n(best)} votes, and good the whole time`);
  }

  // Best Liar — evil, and least accused.
  if (evil.length) {
    const n = (id) => noms.filter((e) => e.data.target === id).length;
    const best = evil.slice().sort((a, b) => n(a) - n(b))[0];
    grant('Best Liar', best,
      seqsWhere(noms, (e) => e.data.target === best).concat([log.find((e) => e.type === 'cast.deal').seq]),
      n(best) === 0 ? 'never once nominated' : `nominated only ${n(best)} time(s)`);
  }

  // Loudest Robot — most noise attributed. Attribution is SEALED during play; here it is not.
  if (noise.length) {
    const loud = (id) => noise.filter((e) => e.data.causedBy === id).reduce((a, e) => a + (e.data.loud || 0), 0);
    const best = ids.slice().sort((a, b) => loud(b) - loud(a))[0];
    if (loud(best) > 0) grant('Loudest Robot', best, seqsWhere(noise, (e) => e.data.causedBy === best),
      `${loud(best).toFixed(2)} total loudness`);
  }

  // Cold Blood — an evil player who swung on a teammate, on television.
  const bussed = log.find((e) => e.type === 'player.executed'
    && alignmentOf(e.data.id) === EVIL && alignmentOf(e.data.executioner) === EVIL);
  if (bussed) grant('Cold Blood', bussed.data.executioner, [bussed.seq],
    `swung the sledgehammer on ${bussed.data.id}, their own`);

  // Dead Air — fewest events of any kind. The direct read on whether quiet players are failing.
  {
    const acted = (id) => log.filter((e) => e.data && (e.data.id === id || e.data.actor === id
      || e.data.nominator === id || e.data.voter === id || e.data.runner === id || e.data.guide === id)).length;
    const best = ids.slice().sort((a, b) => acted(a) - acted(b))[0];
    grant('Dead Air', best, [log[0].seq],
      `${acted(best)} events all game — the consolation prize, and the design's own warning light`);
  }

  return out;
}

/**
 * The whole special, in order.
 *
 * `feed` is the season's ledger and is not one of the four staged beats — it is true for the whole
 * Reunion rather than for a moment inside it, which is why it has no `reunionBeatAt` slot. `ctx`
 * carries `targets` (a `WIN_TARGETS[n]` row) when the caller knows the table size; without it the
 * numbers still travel and the targets read null, because a count with no bar beside it is still
 * more than the room had.
 */
export function reunion(log, ctx) {
  return {
    rollCall: rollCall(log),
    decisive: decisiveEpisode(log),
    awards: awards(log, ctx),
    chat: chatUnmixed(log),
    feed: feedCount(log, ctx?.targets ?? null),
  };
}

/**
 * Every value the Reunion discloses, flattened. `reunion-truth` U2 uses this as its LEAK
 * DICTIONARY — a stronger source than ground truth, because it catches anything the Reunion
 * reveals that a hand-written scanner did not know to look for.
 */
export function revealSet(log, ctx) {
  const r = reunion(log, ctx);
  const tokens = new Set();
  for (const p of r.rollCall) {
    tokens.add(p.role);
    tokens.add(p.alignment);
    if (p.believedTheyWere) tokens.add(p.believedTheyWere);
  }
  return tokens;
}
