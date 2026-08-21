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
 * 🚨 EVERY AWARD CARRIES `querySeq[]`, THE SEQUENCE NUMBERS THAT EARNED IT — AND THEY MUST BE THE
 * ENTRIES THE CLAIM IS MADE OF. `Dead Air` used to cite `[log[0].seq]`, the deal, for a claim
 * about how often somebody spoke; `Best Liar` cited the deal too. Both resolved, so
 * `reunion-truth` U3 was green on a log containing nothing but the deal, granting *"Best Liar —
 * never once nominated"* over a game that had not been played. U3 now asserts the citation is
 * **evidence**: every cited entry is of a type that could bear on the award, and deleting the
 * cited entries changes the award's own number. A citation that cannot fail is not a citation.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 BEAT 2 IS THE ONE THE ROOM ACTUALLY WANTED, AND THE PAYLOAD DID NOT HAVE IT.
 * ---------------------------------------------------------------------------------------------
 * The table spends 375 seconds a game — 75 s × 5 DEBRIEFs — on one question: *did the guide lie?*
 * Measured over 170 games / 782 episodes the guide is **wrong in 39.6% of calls**, good guides
 * 40.3% and evil guides 37.4%, which is exactly why the room can never settle it: being wrong is
 * not evidence of lying. The Reunion is the only place that can settle it, and its payload was
 * four keys — `rollCall`, `decisive`, `awards`, `chat` — with the word "guide" in none of them.
 *
 * The join was already sealed, already free, and already in hand: `call.said{by, said, episode}`
 * ⋈ `hunter.placed{room, episode}` ⋈ `expedition.announced{room, episode}`. No new event, no
 * schema change, no wire change. `guideLedger` performs it, and `The Liar in the Ear` — the award
 * §7.1 specifies and nothing implemented — puts a name on the worst of it.
 *
 * No THREE, no DOM.
 */

import { EVIL, GOOD } from './cast.js';
import { SCRIPT } from './roles.js';
import { NO_ONE } from './vote.js';
import { VIS } from './events.js';
import { PHASE, SECONDS } from './phases.js';

/**
 * The guide's two words. **This is a mirror of `session.js`'s `CALL` and must stay identical to
 * it** — `reunion-truth` U5c pins the two together by importing both, so drift is a red gate
 * rather than a ledger that quietly grades every call as right. It is mirrored rather than
 * imported because `session.js` pulls in `net/party/entitle.js`, and the Reunion has no business
 * dragging the transport layer into its import graph to learn two strings.
 */
export const CALL = { CLEAR: 'CLEAR', HOLD: 'HOLD' };

const byType = (log, type) => log.filter((e) => e.type === type);
const uniq = (xs) => [...new Set(xs)];
const sortNum = (xs) => uniq(xs).sort((a, b) => a - b);

/** Ground truth, straight out of the sealed deal. */
export function dealtFrom(log) {
  const e = log.find((x) => x.type === 'cast.deal');
  return e ? e.data.seats : [];
}

/** A role's display name. The screen is television; `focusPuller` is an identifier. */
export const roleName = (roleId) => (SCRIPT[roleId] ? SCRIPT[roleId].name : null);

/**
 * 🚨 **BEAT 2 — THE LEDGER. THE JOIN NOTHING PERFORMED, OVER THREE FACTS ALREADY IN THE LOG.**
 *
 * `docs/design/rrr-social-round.md` §7 beat 2 is the Director's Cut: *"every lie the broadcast
 * told is now annotated"*. This is the annotation, and it is a fold, not a report:
 *
 *   `expedition.announced` (PUBLIC) gives the target · `call.said` (SEALED) gives the word and
 *   whose mouth it came out of · `hunter.placed` (SEALED) gives where the Hunter actually was.
 *
 * ⚠️ **`misled` IS `session.js`'s OWN EXPRESSION, NOT A RESTATEMENT OF IT.** `resolveExpedition`
 * grades the call as
 *
 *   `const hunterHere = (sim ? sim.hunter.room : hunterRoom) === state.expedition.room;`
 *   `const misled = (said === CALL.CLEAR && hunterHere) || (said === CALL.HOLD && !hunterHere);`
 *
 * and the first line is the trap. **With a mansion attached the server grades against the room
 * the HOUSE reported, not the room `hunter.placed` recorded** — the seeded placement is written
 * on entry to EXPEDITION, before any `simReport` has arrived, and is never corrected. A ledger
 * that read `hunter.placed` alone would therefore disagree with the show on exactly the games
 * that had a house behind them.
 *
 * The graded room is in the log anyway, once, per episode: `resolveExpedition` emits the PROWL
 * noise at `room: sim ? sim.hunter.room : hunterRoom` — the same expression, in the same
 * function, at the same moment. So the ledger takes the room off the PROWL row when there is one
 * and falls back to `hunter.placed` when the log has been truncated before it. Measured across
 * 551 episodes of stub play and against wired episodes in the gate, `misled` derived here agrees
 * with the `task.miss{kind:'call'}` the session recorded **551/551** — and `reunion-truth` U5
 * asserts that agreement episode by episode rather than trusting this paragraph.
 *
 * ⚠️ ONE FOLD, PREFIX-SAFE. `SKIP TO REUNION` is a shipping feature (bible §11.1) and §5.2's
 * fourth invariant is *"every query must tolerate a truncated log"*. An episode cut off between
 * `hunter.placed` and `expedition.ended` still produces its row, with `outcome: null`.
 */
export function guideLedger(log) {
  const target = new Map();       // episode -> the wing the show announced, and its seq
  const said = new Map();         // episode -> what the guide said, and its seq
  const rows = [];
  let open = null;

  const close = (row, ended) => {
    const graded = row.graded;
    const t = target.get(row.episode);
    const call = said.get(row.episode) || null;
    const hunterHere = graded != null && graded === (t ? t.room : null);
    rows.push({
      episode: row.episode,
      guide: call ? call.by : null,
      said: call ? call.said : null,
      target: t ? t.room : null,
      hunterRoom: graded,
      misled: call ? ((call.said === CALL.CLEAR && hunterHere) || (call.said === CALL.HOLD && !hunterHere)) : null,
      move: ended ? ended.move : null,
      outcome: ended ? ended.outcome : null,
      // The ledger evidences itself for the same reason every award does: the Director's Cut has
      // to be able to cut to the frames, and a row nobody can cut to is a row nobody can dispute.
      // `prowlSeq` is in here because it is the row's real authority on where the Hunter was —
      // `hunter.placed` is the seeded guess and the house can have overruled it. A citation that
      // omits it is a citation you cannot rebuild the verdict from.
      querySeq: sortNum([t ? t.seq : null, call ? call.seq : null, row.seq, row.prowlSeq ?? null,
        ended ? ended.seq : null].filter((s) => s != null)),
    });
  };

  for (const e of log) {
    const d = e.data || {};
    if (e.type === 'expedition.announced') target.set(d.episode, { room: d.room, seq: e.seq });
    else if (e.type === 'call.said') said.set(d.episode, { by: d.by, said: d.said, seq: e.seq });
    else if (e.type === 'hunter.placed') open = { episode: d.episode, graded: d.room, seq: e.seq, prowl: false };
    else if (e.type === 'noise.emitted' && open && !open.prowl && d.sourceType === 'PROWL') {
      // The room the server graded against, verbatim — `null` included, which is what a house
      // that reported no room produces and what `hunterHere` compares against there too.
      open.graded = d.room ?? null; open.prowl = true; open.prowlSeq = e.seq;
    } else if (e.type === 'expedition.ended') {
      if (open) { close(open, { outcome: d.outcome, move: d.move, seq: e.seq }); open = null; }
    }
  }
  if (open) close(open, null);    // SKIP TO REUNION, mid-expedition
  return rows;
}

/**
 * BEAT 1 — the roll call. True role beside final claim, with the Glitched's cover named for the
 * first time. Everything here was written during play; nothing is computed now that could not
 * have been computed then.
 *
 * ⚠️ `role` STAYS THE IDENTIFIER AND `roleName` IS WHAT GOES ON TELEVISION. The screen was
 * rendering `focusPuller`, `methodActor`, `glitched` — and, on the single most emotional line in
 * the design, *"believed focusPuller"*. `roles.js`'s `SCRIPT` has carried `{name: 'The Method
 * Actor'}` since it was written and nothing imported it. Both fields ship: `reunion-truth` U1
 * reconciles the identifier against ground truth, the television prints the name.
 *
 * ⚠️ `weight` IS §5.1's *editorial salience*, AND IT IS ON THE PLATE BECAUSE IT IS NOT IN THE
 * ENVELOPE. `docs/design/rrr-social-round.md` §5.1 specs `weight: 0..3` on every event and
 * `events.js` has no such field, so the Director and the recap have nothing to select on. That
 * file has an owner and is not touched here; this is the Reunion's own copy of the idea, and it
 * is what lets `revealPlan` play Beat 1 the way the bible asks for it — *"Slow. Let the room
 * shout."*
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
  return dealt.map((s) => {
    const believed = s.cover ?? null;
    return {
      id: s.id, seat: s.seat,
      role: s.role, roleName: roleName(s.role), alignment: s.alignment,
      // Named for the first time: they believed this all game and were never told.
      believedTheyWere: believed,
      believedName: believed ? roleName(believed) : null,
      finalClaim: claims.get(s.id) ?? null,
      death: deaths.get(s.id) ?? null,
      // 0 nobody shouts · 1 they died · 2 Production · 3 they were never who they thought.
      weight: believed && believed !== s.role ? 3 : s.alignment === EVIL ? 2 : deaths.has(s.id) ? 1 : 0,
    };
  });
}

/**
 * BEAT 2's anchor — the decisive episode. The one containing the win, else the last one that took
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

/**
 * BEAT 3 — the awards. Each returns `{award, winner, sharedWith, value, why, whyRefs, tiebreak,
 * querySeq}` or nothing when the log holds no evidence, which is honest rather than empty.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 **THE AWARDS WERE DECIDED BY SEAT ORDER AND THE SCREEN DID NOT SAY SO.**
 * ---------------------------------------------------------------------------------------------
 * Measured over 170 games, **Most Trusted has a tie at the top in 61% of them** — and every one
 * of those was resolved by `Array.prototype.sort` being stable over deal order, i.e. *the lowest
 * seat number wins*. §7.1 specifies the tiebreak — most `cast.pair` appearances — and it was
 * dropped; the events exist, five per game. `top()` implements it, and it takes Most Trusted's
 * unresolved-tie rate from 61% to 25%.
 *
 * ⚠️ THE REMAINING 25% ARE **SHARED**, NOT SILENTLY BROKEN. Two robots the record cannot separate
 * are two names on the plate. That is a better television moment than a coin flip and it is the
 * only honest one: `reunion-truth` U8 asserts that no award has a winner drawn from a tied set
 * without either a stated tiebreak or a stated share, which makes "decided by seat order"
 * unrepresentable rather than merely absent.
 *
 * ⚠️ AND NO PROSE STRING HERE CONTAINS A PLAYER ID. `why` carries `{0}`-style slots and `whyRefs`
 * carries the ids; the renderer substitutes display names it already has on the frame. Cold Blood
 * printed *"swung the sledgehammer on p8, their own"* on television. U7 asserts the absence.
 */
export function awards(log, { alignmentOf }) {
  const dealt = dealtFrom(log);
  const ids = dealt.map((s) => s.id);
  if (!ids.length) return [];

  const noms = byType(log, 'nom.made');
  const votes = byType(log, 'vote.cast');
  const noise = byType(log, 'noise.emitted');
  const pairs = byType(log, 'cast.pair');
  const ends = byType(log, 'expedition.ended');
  const claimSets = byType(log, 'player.claim_set');
  const out = [];

  const good = ids.filter((id) => alignmentOf(id) === GOOD);
  const evil = ids.filter((id) => alignmentOf(id) === EVIL);
  const seqsWhere = (list, pred) => list.filter(pred).map((e) => e.seq);

  const pairSeqs = (id) => seqsWhere(pairs, (e) => e.data.runner === id || e.data.guide === id);
  const pairCount = (id) => pairSeqs(id).length;

  /**
   * §7.1's tiebreak, applied to every award that can tie rather than to the one it was written
   * beside. Returns the winner, the number the award is made of, anyone it is shared with, the
   * sentence explaining how the tie was handled, and the seqs that back the tiebreak itself.
   */
  function top(pool, score, dir) {
    if (!pool.length) return null;
    const val = new Map(pool.map((id) => [id, score(id)]));
    const vals = [...val.values()];
    const best = dir > 0 ? Math.max(...vals) : Math.min(...vals);
    const tied = pool.filter((id) => val.get(id) === best);
    if (tied.length === 1) return { winner: tied[0], value: best, sharedWith: [], tiebreak: null, tieSeqs: [] };
    const most = Math.max(...tied.map(pairCount));
    const still = tied.filter((id) => pairCount(id) === most);
    if (still.length === 1) {
      return {
        winner: still[0], value: best, sharedWith: [],
        tiebreak: `a ${tied.length}-way tie, broken on §7.1's count of expeditions cast: ${most}`,
        tieSeqs: pairSeqs(still[0]),
      };
    }
    return {
      winner: still[0], value: best, sharedWith: still.slice(1),
      tiebreak: `a ${still.length}-way tie that ${most} expedition${most === 1 ? '' : 's'} each could not separate, so they share it`,
      tieSeqs: still.flatMap(pairSeqs),
    };
  }

  const grant = (award, r, why, whyRefs, querySeq) => {
    if (!r || r.winner == null) return null;
    const cited = sortNum([...querySeq, ...r.tieSeqs]);
    if (!cited.length) return null;
    const a = {
      award, winner: r.winner, sharedWith: r.sharedWith, value: r.value,
      why, whyRefs, tiebreak: r.tiebreak, querySeq: cited,
    };
    out.push(a);
    return a;
  };

  // ---- Most Trusted — the good player the room never pointed at.
  //
  // 🚨 ITS EVIDENCE IS AN ABSENCE, AND THE FIRST VERSION COULD THEREFORE NEVER GRANT IT. Pointing
  // `querySeq` at "the events naming this player" is empty precisely when they win, so the award
  // silently never appeared. The proof is the OTHER direction: here is every accusation in the
  // game, and none of them is you. So the query is the whole record, and the TV cuts through it.
  if (good.length && (noms.length || votes.length)) {
    const score = (id) => noms.filter((e) => e.data.target === id).length
      + votes.filter((e) => e.data.choice === id).length;
    const r = top(good, score, -1);
    if (r) {
      grant('Most Trusted', r,
        `${r.value} of ${noms.length + votes.length} accusations and votes in the whole game landed on them`,
        [], [...noms, ...votes].map((e) => e.seq));
    }
  }

  // ---- The Mark — the good player the room voted for most.
  if (good.length && votes.length) {
    const n = (id) => votes.filter((e) => e.data.choice === id).length;
    const r = top(good, n, 1);
    if (r && r.value > 0) {
      grant('The Mark', r, `${r.value} votes, and good the whole time`, [],
        seqsWhere(votes, (e) => e.data.choice === r.winner || r.sharedWith.includes(e.data.choice)));
    }
  }

  // ---- Best Liar — §7.1: evil maximising (episodes alive) − (times accused).
  //
  // ⚠️ THE SHIPPED VERSION WAS "FEWEST NOMINATIONS", WHICH IS THE SPEC WITH ITS FIRST TERM
  // DELETED, AND THE TERM IS WHAT MAKES IT AN AWARD. Without it a traitor taken in episode one
  // scores a perfect zero accusations and beats a traitor who survived the whole season being
  // shouted at twice. It also ties: 38% of games against 16% with the term restored, measured.
  if (evil.length && ends.length) {
    const deathSeq = (id) => {
      const e = log.find((x) => (x.type === 'player.taken' || x.type === 'player.executed') && x.data.id === id);
      return e ? e.seq : Infinity;
    };
    const alive = (id) => ends.filter((e) => e.seq <= deathSeq(id));
    const accused = (id) => noms.filter((e) => e.data.target === id);
    const r = top(evil, (id) => alive(id).length - accused(id).length, 1);
    if (r) {
      const n = accused(r.winner).length;
      grant('Best Liar', r,
        `${alive(r.winner).length} episodes on Production, and the room pointed at them ${n === 0 ? 'not once' : n === 1 ? 'once' : `${n} times`}`,
        // ⚠️ THE CITATION IS THE WHOLE SEASON AND EVERY DEATH ON PRODUCTION, NOT JUST THIS
        // ROBOT'S. The claim is comparative — *survived longest while least accused* — so a
        // citation that named only the winner's episodes could not be re-derived from: on that
        // cut of the log the other traitor's episode count collapses too and a different name
        // comes out. `reunion-truth` U3's sufficiency direction found that; nothing else would.
        [], [...noms.map((e) => e.seq), ...ends.map((e) => e.seq),
          ...log.filter((x) => (x.type === 'player.taken' || x.type === 'player.executed')
            && evil.includes(x.data.id)).map((x) => x.seq)]);
    }
  }

  // ---- The Liar in the Ear — §7.1, and the reason Beat 2 exists.
  //
  // 🚨 THE ONE AWARD THAT ANSWERS THE QUESTION THE ROOM SPENDS 375 SECONDS A GAME ON. §7.1
  // specifies it — *"guide maximising the count of guide.call{value:'CLEAR'} followed by
  // hunter.arrival in that room"* — and nothing implemented it, so the guide never appeared
  // anywhere in the Reunion at all. It says nothing about intent, and it must not: 39.6% of all
  // calls are wrong and an honest guide with no camera is guessing. What it says is what
  // happened, with a name and a count, which is the only thing the room could never establish.
  {
    const rows = guideLedger(log).filter((x) => x.guide && x.said === CALL.CLEAR && x.misled);
    const guides = uniq(rows.map((x) => x.guide));
    const r = top(guides, (id) => rows.filter((x) => x.guide === id).length, 1);
    if (r && r.value > 0) {
      grant('The Liar in the Ear', r,
        `said CLEAR into the room the Hunter was standing in${r.value === 1 ? '' : `, ${r.value} times`}`,
        [], rows.filter((x) => x.guide === r.winner || r.sharedWith.includes(x.guide)).flatMap((x) => x.querySeq));
    }
  }

  // ---- Loudest Robot — §7.1's query, with the pool it is actually drawn from said out loud.
  //
  // ⚠️ THE SPEC'S QUERY IS RIGHT AND ITS POOL IS STRUCTURALLY SMALL, SO THE POOL IS ON THE PLATE.
  // Measured over 170 games the winner was cast as runner in **81%** of them — not because
  // runners are loud but because `emitNoise` only ever attributes SPRINT (the runner's own
  // throttle) and MISS (a guide whose call was wrong). PROWL is nobody's by design and there is
  // no third attributed source, so three or four seats a game cannot be heard at all. Hiding that
  // makes the award look like a judgement; printing it makes it a fact about the house.
  //
  // ⚠️ AND IT NO LONGER PRINTS `1.00 TOTAL LOUDNESS`. That is a physics scalar — the runner's
  // throttle as a fraction of `MOVE.run` — and nobody in a lounge can interpret it. The sentence
  // is counts now; the scalar stays in `value`, where the gate reads it and the television
  // does not.
  {
    const named = noise.filter((e) => e.data.causedBy != null);
    const pool = ids.filter((id) => named.some((e) => e.data.causedBy === id));
    const loud = (id) => named.filter((e) => e.data.causedBy === id).reduce((a, e) => a + (e.data.loud || 0), 0);
    const r = top(pool, loud, 1);
    if (r && r.value > 0) {
      const mine = named.filter((e) => e.data.causedBy === r.winner).length;
      grant('Loudest Robot', r,
        `${mine} of the ${named.length} sounds the house could put a name to were theirs — and it could only name ${pool.length} of ${ids.length} robots all season`,
        [], seqsWhere(named, (e) => e.data.causedBy === r.winner || r.sharedWith.includes(e.data.causedBy)));
    }
  }

  // ---- Cold Blood — an evil player who swung on a teammate, on television.
  {
    const bussings = log.filter((e) => e.type === 'player.executed'
      && alignmentOf(e.data.id) === EVIL && alignmentOf(e.data.executioner) === EVIL);
    if (bussings.length) {
      const swingers = uniq(bussings.map((e) => e.data.executioner));
      const r = top(swingers, (id) => bussings.filter((e) => e.data.executioner === id).length, 1);
      const victim = bussings.find((e) => e.data.executioner === r.winner).data.id;
      grant('Cold Blood', r, 'swung the sledgehammer on {0}, their own', [victim],
        bussings.filter((e) => e.data.executioner === r.winner).map((e) => e.seq));
    }
  }

  // ---- Dead Air — rebuilt, because the shipped one was a death detector.
  //
  // ---------------------------------------------------------------------------------------------
  // 🚨 **IT MEASURED WHO GOT KILLED AND CALLED IT WHO WAS QUIET, AND IT WAS ALSO UNDERCOUNTING.**
  // ---------------------------------------------------------------------------------------------
  // Two separate defects, both measured over 170 games:
  //
  //   1. `acted()` matched six field names — `id, actor, nominator, voter, runner, guide` — and
  //      the log also attributes players through `target`, `choice`, `causedBy`, `by` and
  //      `executioner`. Per player it undercounted by **40–70%**, unevenly, so the ranking it
  //      produced was not the ranking of anything.
  //   2. Far worse: *"fewest events of any kind"* is dominated by **when you stopped having
  //      events at all**. Its winner had already died in **74%** of games and was the *first*
  //      death in **44%**. It was a participation ribbon pinned on a corpse.
  //
  // Widening `acted()` alone leaves 41% / 25% — better, still a death detector. So it is rebuilt
  // on **turnout**: of the chances the show actually handed you, how many did you use. Measured
  // on the same 170 games, the rebuilt award's winner had died in **7%** and was the first death
  // in **1%**.
  //
  // ⚠️ ONE CHANCE, ONE ROW, AND THAT IS WHY NOMINATIONS ARE NOT IN THE NUMERATOR. `resolveVote`
  // writes a `vote.cast` for **every living player at every ballot**, `NO_ONE` included, so the
  // log carries the denominator and the numerator of the same fraction. `nom.made` has no such
  // row — nobody is recorded as having declined to nominate, and there is no episode on the event
  // to build a window from — so counting nominations as turnout without counting the chances to
  // nominate produced rates above 1.0 and an award that could never be granted. It is the
  // nameplate plus the ballots, both one for one, and nothing else.
  //
  // ⚠️ AND THE POOL IS THE ROBOTS WHO WERE HANDED *EVERY* CHANCE. You cannot be accused of dead
  // air in a season you were not present for, and a ratio over two ballots is not a measurement.
  //
  // ⚠️ IT IS THE CONSOLATION PRIZE, SO IT CANNOT ALSO BE A PODIUM. The critic saw one game print
  // `Loudest Robot — Robot 3` and `Dead Air — Robot 3` on the same screen, for a runner who
  // sprinted, died, and sat out three episodes. Dead Air is granted last and skips anyone already
  // holding something; `reunion-truth` U8b asserts the screen never contradicts itself, and its
  // control shows 10 of 12 matches colliding without the exclusion.
  //
  // ⚠️ AND ITS `why` NO LONGER READS *"THE CONSOLATION PRIZE, AND THE DESIGN'S OWN WARNING
  // LIGHT"*. That is the design document's self-criticism, and it was rendering at a party.
  {
    const ballots = (id) => votes.filter((e) => e.data.voter === id);
    const nameplate = (id) => claimSets.filter((e) => e.data.id === id).slice(0, 1);
    const chances = (id) => 1 + ballots(id).length;
    const usedSeqs = (id) => sortNum([
      ...nameplate(id).map((e) => e.seq),
      ...seqsWhere(votes, (e) => e.data.voter === id && e.data.choice !== NO_ONE && e.data.choice != null),
    ]);
    const held = new Set(out.flatMap((a) => [a.winner, ...a.sharedWith]));
    const most = Math.max(0, ...ids.map(chances));
    const pool = ids.filter((id) => chances(id) === most && !held.has(id));
    const r = top(pool, (id) => usedSeqs(id).length / chances(id), -1);
    // ⚠️ AND NOT GRANTED TO A ROOM THAT HAD NO DEAD AIR IN IT. A table where every robot used
    // every chance has a minimum rate of 1.0, and the plate would read "used 7 of the 7 chances
    // the show handed them — nobody used fewer", which is a compliment with a scowl on it.
    if (r && most > 2 && r.value < 1) {
      const n = usedSeqs(r.winner).length;
      grant('Dead Air', { ...r, value: n },
        `used ${n} of the ${most} chances the show handed them — nobody in the room used fewer`,
        [], [...usedSeqs(r.winner), ...ballots(r.winner).map((e) => e.seq)]);
    }
  }

  return out;
}

/**
 * 🚨 **BEAT ORDER — 1842 BYTES, RENDERED AT ONCE, READABLE IN EIGHT SECONDS, UNDER A 240-SECOND
 * COUNTDOWN THAT TURNS RED AT TEN.**
 *
 * The bible's §11.1 writes Beat 1 as *"one at a time, each nameplate flips … Slow. Let the room
 * shout."* The payload arrived in one message and the screen printed all of it, so the room got
 * four minutes to look at a finished page. §5.1's `weight: 0..3` — *"editorial salience. The
 * recap and the Director both select on this"* — is the field that was supposed to drive the
 * pacing and **it is not in `events.js`'s envelope**. That file has another owner and is not
 * touched here; this is reported instead, and the Reunion carries its own order.
 *
 * `cues` is a flat play-list of `"<beat>:<index>"` strings covering every disclosable item in the
 * payload exactly once. A renderer holds a cursor and reveals `cues[0..k]`; it needs no knowledge
 * of what any beat contains. Beat 1 plays in ascending salience so the shouting escalates —
 * plain crew first, the dead, Production, and last the robot who was never who they thought they
 * were. Beat 2 plays in episode order, because it is a story. Then the awards, then the chat.
 *
 * `holdMs` is the REUNION budget divided by the cue count, floored at a second and a half.
 */
export function revealPlan(special) {
  const cues = [];
  special.rollCall
    .map((p, i) => ({ i, w: p.weight }))
    .sort((a, b) => a.w - b.w || a.i - b.i)
    .forEach((x) => cues.push(`roll:${x.i}`));
  special.ledger.forEach((_, i) => cues.push(`ledger:${i}`));
  special.awards.forEach((_, i) => cues.push(`award:${i}`));
  if (special.chat.length) cues.push('chat:0');
  const budget = SECONDS[PHASE.REUNION] * 1000;
  return { cues, holdMs: cues.length ? Math.max(1500, Math.floor(budget / cues.length)) : budget };
}

/** The whole special, in order. */
export function reunion(log, ctx) {
  const special = {
    rollCall: rollCall(log),
    decisive: decisiveEpisode(log),
    ledger: guideLedger(log),
    awards: awards(log, ctx),
    chat: chatUnmixed(log),
  };
  special.reveal = revealPlan(special);
  return special;
}

/**
 * ---------------------------------------------------------------------------------------------
 * 🚨 **THE LEAK DICTIONARY — AND IT USED TO BE THE ROLE DICTIONARY WEARING THE NAME.**
 * ---------------------------------------------------------------------------------------------
 * Every value the Reunion discloses that no socket was entitled to during play. `reunion-truth`
 * U2 sweeps every socket stream against it, which is a strictly stronger source than a
 * hand-written scanner: a future feature that adds a reveal is checked the same day.
 *
 * That claim held for exactly one shape of reveal. The set was four role identifiers and the
 * strings `good`/`evil`, and U2's sweep was `"role":"TOK"|"alignment":"TOK"` — role-shaped, so a
 * reveal that is not a role name was invisible to it. Beat 2 discloses **rooms**, and on the day
 * that shipped the architecture's central claim — *"a leak and a missing Reunion reveal become
 * the same bug, found by the same gate"* — would have quietly stopped being true. U2's sweep is
 * value-shape-agnostic now, and this set has the rooms in it.
 *
 * ⚠️ **AND IT SUBTRACTS WHAT THE SHOW ALREADY SAID OUT LOUD, WHICH IS NOT OPTIONAL ONCE ROOMS ARE
 * IN THE DICTIONARY.** The Hunter's room is sealed; the *expedition's* room is announced PUBLIC
 * every episode, and when the Hunter is standing in it — 16.2% of episodes — they are the same
 * string. A dictionary that did not subtract would report the show's own announcement as a leak
 * and U2 would be red on a sixth of all games, which is how a gate gets skipped. The subtraction
 * is computed from the log's own `vis`, so it needs no list to maintain.
 *
 * ⚠️ ONE TYPE IS EXCLUDED FROM THE SUBTRACTION AND IT IS THE OLD REGEX'S CARVE-OUT, MOVED TO
 * WHERE IT BELONGS. `player.claim_set` is PUBLIC and carries whatever a player typed on their
 * nameplate. A claim is a public *assertion*, not a disclosure — someone claiming "The Method
 * Actor" must not delete the real Method Actor from the dictionary.
 *
 * ⚠️ WHAT IS DELIBERATELY NOT IN HERE: the two call words. `CLEAR` and `HOLD` are disclosed by
 * Beat 2, and the matrix entitles every episode's guide to their own — §6.9 rows `call.said` to
 * `guide`. Six sockets a season legitimately hold the identical string, so at token level the
 * two are indistinguishable and a sweep for them would be a false red rather than a check. U2b
 * asserts that this exemption, and every other, is *stated* rather than merely absent.
 */
const ASSERTION_TYPES = ['player.claim_set'];

export function revealSet(log, ctx) {
  const r = reunion(log, ctx);
  const tokens = new Set();
  for (const p of r.rollCall) {
    tokens.add(p.role);
    tokens.add(p.alignment);
    if (p.roleName) tokens.add(p.roleName);
    if (p.believedTheyWere) tokens.add(p.believedTheyWere);
    if (p.believedName) tokens.add(p.believedName);
  }
  for (const row of r.ledger) if (row.hunterRoom) tokens.add(row.hunterRoom);

  const strip = (v) => {
    if (typeof v === 'string') tokens.delete(v);
    else if (Array.isArray(v)) v.forEach(strip);
    else if (v && typeof v === 'object') Object.values(v).forEach(strip);
  };
  for (const e of log) {
    if (e.vis !== VIS.PUBLIC || ASSERTION_TYPES.includes(e.type)) continue;
    strip(e.data);
  }
  tokens.delete(null); tokens.delete(undefined);
  return tokens;
}
