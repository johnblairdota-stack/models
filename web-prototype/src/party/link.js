/**
 * link — TWO ROBOTS BECOME ONE NAME, AND GET A CHANNEL NOBODY ELSE CAN READ.
 *
 * John's design, 2026-08-25: *"during the debrief players can... find a hybrid combination name
 * and the tag changes colour. they are connected by their phone and can text back and forth to
 * eachother to communicate via text in a room full of people secretly. like a secret... John and
 * Ellie can become Jellie which sounds like Jelly."*
 *
 * ============================================================================================
 * 🚨 THE WHOLE MECHANIC IS "PUBLIC THAT IT HAPPENED, PRIVATE WHAT WAS SAID."
 * ============================================================================================
 * That split is the design, not an implementation detail, and it is what makes this a social
 * deception mechanic instead of a chat window:
 *
 *   PUBLIC   the request, the pair, the merged name, the colour. On the television, where the
 *            whole room watches JOHN reach out to ELLIE and sees them become JELLIE. Crossing
 *            the room to whisper is a move everybody gets to see you make.
 *   PRIVATE  the words. They go to two sockets and are never fanned, never logged to the shared
 *            event log, and `whisperViolations` refuses to let them near a broadcast.
 *
 * Nothing here does any I/O. The transport is `net/party/local.mjs`, the sheets are
 * `views/party-phone.js`, the tags are `characters/chest-nameplate.js`. Keeping the RULES pure
 * is what lets `harness/link-merge.mjs` hammer the name generator over thousands of pairs and
 * assert the privacy shape without a socket.
 */

import { NAME_CAP } from '../characters/chest-nameplate.js';

/**
 * 🚨 **DEBRIEF ONLY. RECKONING WAS CUT ON 2026-08-26, JOHN'S CALL, AFTER TWO CRITICS.**
 *
 * It was originally both beats because that is what `show.js` READY_BEATS happened to be — not
 * because anyone argued a private channel belonged in the nomination beat. Three reasons it went:
 *
 *  1. **The phone sheet was dangerous.** Reckoning stacked the nominate list directly on top of
 *     the reach-out list: two adjacent controls, the SAME names, ~150px apart, near-identical
 *     styling — one meaning *"I accuse you of murder"* and one meaning *"let's talk secretly."*
 *     A play critic confirmed it hands-on. No gate would ever have caught that mis-tap, and it
 *     is on the most consequential action in the game.
 *  2. **The decision beat should be public.** Blood on the Clocktower puts the whispering in the
 *     day and the nomination in the open, and that ordering is load-bearing. A private channel
 *     during Reckoning turns nominations into pre-arranged blocks with no public trace — and
 *     this game has already locked *"nominating is voting"*, so it would be a whipped vote
 *     agreed in a cell.
 *  3. **It did not even fit.** Reckoning is 45s base; `LINK_REQUEST_MS` is 20s. A pair could
 *     legally form with fifteen seconds left, and `clearLinks` fires on the debrief→reckoning
 *     boundary, so you had to re-establish from scratch inside those 45 seconds anyway.
 *
 * What it buys is a rhythm the night did not have: **Debrief is where you make private moves,
 * Reckoning is where you live with them in front of everybody.**
 *
 * To put it back, add 'reckoning' here — and fix the stacked-list problem first.
 */
export const LINK_BEATS = ['debrief'];

/**
 * 🚨 **TWO CONVERSATIONS AT A TIME, FOR THE WHOLE ROOM.**
 *
 * With eight players, four pairs formed within seconds and eight people went heads-down for a
 * five-minute beat whose instruction line says "Talk." Both critics reached this independently:
 * *"the feature competes with the beat it lives in."*
 *
 * And it ate its own premise. The public cost — the room saw who you talked to — is inversely
 * proportional to how many people pair. Four simultaneous pairs means everybody is guilty, so
 * the cost is zero, so everybody pairs. Scarcity is what makes two members of Production pairing
 * up *conspicuous* instead of camouflaged.
 *
 * It also fixes the television: three pairs rendered as a ribbon of overlapping identical green
 * words that nobody could match to anybody.
 *
 * ⚠️ Enforced in `linkBlock` AND in `acceptLink` — three pending requests must not all be able
 * to accept into a third pair. Gate: `link-merge` L60-L62.
 */
export const MAX_PAIRS = 2;

/**
 * 🚨 **A CONVERSATION HAS A CLOCK, AND WITHOUT ONE THE CAP IS A LOCKOUT.**
 *
 * Capping the room at two pairs fixed the silent-table problem and created a worse one, which a
 * play critic named exactly: *"the first two couples to move win the mechanic for five minutes,
 * everyone else gets a screen that says ROOM IS FULL five times."* Nothing ever ended a pair —
 * `expirePending` covered requests and nothing covered pairs — and `unlink` charges the person
 * who lets go, so the dominant play was to pair in the first ten seconds and never release. At
 * eight players that is half the table watching four motionless robots for five minutes.
 *
 * The arithmetic this number is chosen from: 8 players ÷ 2 slots × 90s ≈ everyone gets a turn
 * inside a 300s Debrief. Short enough to force the compression that makes a whisper interesting,
 * long enough to say something real.
 *
 * ⚠️ **BOTH PLAYERS ARE SPENT WHEN THE CLOCK RUNS OUT**, not just one. Expiry is nobody's fault
 * and nobody's choice, so it cannot be a punishment — it is simply your turn having happened.
 * That is different from `unlink`, where the person who WALKED OUT pays and the person walked
 * out on does not.
 */
export const PAIR_MS = 90000;

/** Pairs whose clock has run out. Both halves are marked spent — the turn HAPPENED. */
export function expirePairs(links, now) {
  const live = [];
  const done = [];
  for (const p of links?.pairs || []) {
    if (now - (p.at || 0) >= PAIR_MS) done.push(p); else live.push(p);
  }
  if (!done.length) return links;
  const used = new Set(links.used || []);
  for (const p of done) { used.add(p.a); used.add(p.b); }
  return { ...links, pairs: live, used: [...used] };
}

/** Milliseconds left on a pair, or null when it is not on a clock. Drives both countdowns. */
export function pairRemaining(pair, now) {
  if (!pair?.at) return null;
  return Math.max(0, PAIR_MS - (now - pair.at));
}

/* =============================================================================================
 * ✅ **DONE — ENDING IT EARLY, TOGETHER, WITHOUT ANYONE BEING PUNISHED FOR IT.**
 *
 * John, 2026-08-26: *"the connected pair need a way to end the connection early."*
 *
 * There WAS an exit — `unlink` — but it is built as *"I am walking out on you"*: it spends the
 * leaver's turn, tells the other person "They disconnected", and is deliberately one-sided. That
 * is the right shape for abandoning somebody, and exactly the wrong shape for two people who
 * have finished. So the only way to release a slot cost you something, which means nobody ever
 * did it, which means a pair that finished in twenty seconds sat on one of the room's two slots
 * for the remaining seventy.
 *
 * DONE is the other verb. Either half taps it; when BOTH have, the pair dissolves immediately
 * and the slot goes back to the room.
 *
 * ⚠️ **BOTH ARE SPENT, AND THAT IS NOT A PENALTY.** It is the same rule as the clock running
 * out: your conversation happened. Ending early is not a way to buy a second one — it is a way
 * to give the room its slot back, and the reward for it is social, not mechanical: two people
 * who stay paired for the full ninety seconds are conspicuous, and two who finish early stop
 * being watched.
 *
 * ⚠️ **IT TAKES BOTH.** One tap alone must not end it, or DONE becomes a politer Disconnect
 * with none of its cost — and a partner mid-sentence would be cut off by someone who simply got
 * bored. If they will not agree, `unlink` is still there and still costs you your turn.
 * ============================================================================================= */

/** Has this player said they are finished? */
export function isDone(pair, id) {
  return (pair?.done || []).includes(id);
}

/** Both halves have said so. */
export function bothDone(pair) {
  return !!pair && isDone(pair, pair.a) && isDone(pair, pair.b);
}

/**
 * One thumb on DONE. Returns a new state; the pair only dissolves once both are in.
 * `on: false` takes it back — someone who thinks of one more thing should be able to.
 */
export function finishPair(links, id, on = true) {
  const p = pairOf(links, id);
  if (!p) return links;
  const done = new Set(p.done || []);
  if (on) done.add(id); else done.delete(id);
  const next = { ...p, done: [...done] };
  if (!bothDone(next)) {
    return { ...links, pairs: (links.pairs || []).map((x) => (x === p ? next : x)) };
  }
  // Agreed. The slot goes back to the room, and both turns are counted as taken.
  return {
    pending: (links.pending || []).filter((r) => r.from !== p.a && r.to !== p.a && r.from !== p.b && r.to !== p.b),
    pairs: (links.pairs || []).filter((x) => x !== p),
    used: [...new Set([...(links.used || []), p.a, p.b])],
  };
}

export function isLinkBeat(beat) {
  return LINK_BEATS.includes(String(beat || ''));
}

/** How long a request stands before it lapses. Long enough to notice on the TV, short enough
 *  that a declined-by-silence request does not block the pair for the whole beat. */
export const LINK_REQUEST_MS = 20000;

/** The linked pair's plate colour — deliberately NOT the ordinary tag blue. */
export const LINK_INK = '#1F7A3D';
export const LINK_CHROME = '#8FD9A8';

const VOWELS = 'AEIOUY';

/**
 * 🚫 MERGES THAT MUST NOT LAND ON A TELEVISION IN SOMEONE'S LIVING ROOM.
 *
 * The generator takes A's onset and B's tail, so it WILL occasionally build a real word out of
 * two innocent names — nobody typed it and nobody chose it, it just appeared over a friend's
 * head on the big screen. A blocked result falls through to the next step of the cascade, which
 * always produces something, so there is no failure path.
 *
 * ⚠️ **DELIBERATELY SHORT, AND DELIBERATELY NOT A RUDE-WORD FILTER.** `Sam + Bex = SEX` is left
 * IN: this is an adults-at-a-party game and that is the kind of accident the table wants. What
 * is here is the small set that would land badly on someone rather than land funny. It is a
 * blunt instrument against ACCIDENTS — a table that wants an offensive merge can just type
 * offensive names, and no list here fixes that.
 *
 * John's call if this is wrong in either direction; it is one array.
 */
export const MERGE_BLOCK = ['FAG', 'COON', 'SPIC', 'KIKE', 'PAKI', 'CUNT', 'NIGG', 'RAPE'];

const blocked = (s) => MERGE_BLOCK.some((w) => s.includes(w));

/** Uppercase letters and digits only. A name is `NAME_CAP` on the wire but may arrive dirty. */
function clean(name) {
  return String(name ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

const firstVowel = (s) => { for (let i = 0; i < s.length; i++) if (VOWELS.includes(s[i])) return i; return -1; };

/**
 * 🍮 JOHN + ELLIE = JELLIE.
 *
 * The rule that produces it: **A's onset (everything before its first vowel) + B from B's first
 * vowel.** `JOHN` -> `J`, `ELLIE` -> `ELLIE`, so `JELLIE`. That is the classic portmanteau seam
 * and it is what makes the good ones land.
 *
 * ⚠️ **IT IS ORDER-DEPENDENT, AND THAT IS THE FEATURE.** The player who reached out goes first,
 * so the name carries who made the move. `merge('John','Ellie')` is JELLIE; the other way round
 * is ELLOHN. Both are legitimate; the room can hear which way it went.
 *
 * ⚠️ **EVERY BRANCH BELOW EXISTS BECAUSE A REAL TABLE CAN REACH IT.** Duplicate names are
 * explicitly allowed in this game, names may be pure digits (`ROBOT 6`), may start with a vowel
 * (`OZZ`, so there is no onset at all), and may have no vowel whatsoever (`BX`). A generator
 * that throws, returns empty, or hands back one of its own inputs would put an unreadable or
 * lying tag over somebody's head. The cascade is ordered cheapest-first and the last step cannot
 * fail. `harness/link-merge.mjs` L1-L6 asserts the properties rather than the outputs.
 */
export function mergeName(a, b) {
  const A = clean(a);
  const B = clean(b);
  if (!A && !B) return 'PAIR';
  if (!A) return B.slice(0, NAME_CAP);
  if (!B) return A.slice(0, NAME_CAP);

  const cap = (s) => s.slice(0, NAME_CAP);
  /*
   * ⚠️ **THREE IS THE FLOOR, AND IT IS A DECISION RATHER THAN A DEFAULT.** John, 2026-08-26,
   * asked directly: *"3 letter is fine."*
   *
   * A play critic measured 24.4% of merges coming back at three characters and called them
   * typos — KAM, JEX, TIZ, BAM, NOE. Raising the floor to four was tried and MEASURED WORSE: it
   * rejects the good short ones along with the bad. `John + Zoe` is JOE at three and JOOE at
   * four; `John + Kim` is JIM and becomes JOIM. A rule that turns JIM into JOIM to avoid JEX is
   * not an improvement, and the critic's own list contains NOE, which is a name.
   *
   * The vowel-seam fix below was the systematic third of the problem and was unambiguous; this
   * half was taste, so it went to the person whose taste it is. `link-merge` L72c pins the short
   * ones that must survive, so raising this number fails a gate rather than a playtest.
   */
  /*
   * 🚨 **COMPARE AGAINST THE CAPPED NAMES — THE GUARD LEAKED THROUGH `NAME_CAP`.**
   *
   * `s !== A` compared the merge to the FULL typed name, but what a player actually wears is
   * `A.slice(0, NAME_CAP)`. So for any name longer than eight characters the merge could equal
   * that player's own PLATE while differing from their name, and the identity guard waved it
   * through. A play critic found four:
   *
   *   Bo + Bartholomew          -> BARTHOLO   (and Bartholomew's solo plate is BARTHOLO)
   *   Mary-Kate 3 + MAXIMILIAN  -> MAXIMILI   (ditto)
   *   Christopher + Christopher -> CHRISTOP
   *
   * Bo pairs with Bartholomew and the television shows Bartholomew's own name, in green, over
   * two heads. That is exactly the lying plate L4 exists to prevent, escaping through the cap.
   */
  const ok = (s) => s.length >= 3 && s !== cap(A) && s !== cap(B) && !blocked(s);

  // 1 · the good seam: A's onset + B from its first vowel.
  const av = firstVowel(A);
  const bv = firstVowel(B);
  if (av > 0 && bv >= 0) {
    const out = cap(A.slice(0, av) + B.slice(bv));
    if (ok(out)) return out;
  }
  /*
   * 2 · A STARTS WITH A VOWEL, so it has no onset to donate.
   *
   * 🚨 **THIS BRANCH WAS 100% NOISE AND IT IS A THIRD OF ALL PAIRS.** A play critic measured 870
   * ordered pairs across 30 common party names: EVERY merge with a vowel-initial requester opened
   * on a two-vowel cluster — `Ellie+John=EOHN`, `Ozz+Mara=OARA`, `Ivy+Alex=IALEX`,
   * `Anna+Liz=AIZ`. Unpronounceable, systematically, not by luck.
   *
   * The fix is to keep A up to and including the CONSONANT RUN after its first vowel run, so the
   * seam lands on a consonant the way a real portmanteau does: `ELLIE -> ELL` + `OHN` = ELLOHN,
   * `OZZ -> OZZ` + `ARA` = OZZARA, `IVY -> IV` + `ALEX` = IVALEX, `ANNA -> ANN` + `IZ` = ANNIZ.
   */
  if (av === 0 && bv >= 0) {
    let i = 0;
    while (i < A.length && VOWELS.includes(A[i])) i++;      // past the opening vowel run
    while (i < A.length && !VOWELS.includes(A[i])) i++;      // and past the consonants after it
    const out = cap(A.slice(0, Math.max(1, i)) + B.slice(bv));
    if (ok(out)) return out;
  }
  // 3 · halves. Covers "no vowel anywhere" and anything the seams made degenerate.
  {
    const out = cap(A.slice(0, Math.ceil(A.length / 2)) + B.slice(Math.floor(B.length / 2)));
    if (ok(out)) return out;
  }
  // 4 · heads. The duplicate-name case: ROBOT6 + ROBOT6 -> ROBROB, which is at least honestly
  //     two of the same person rather than a tag that reads like one of them.
  {
    const out = cap(A.slice(0, 3) + B.slice(0, 3));
    if (ok(out)) return out;
  }
  // 5 · cannot fail. Two initials and a bridge, or the raw join if even that collides.
  const last = cap(`${A[0]}${B[0]}`);
  return last.length >= 2 ? last : cap(A + B) || 'PAIR';
}

/** A stable id for a pair regardless of who asked. Used to dedupe, never shown. */
export function pairKey(a, b) {
  return [String(a), String(b)].sort().join('|');
}

/* ============================================================================================
 * THE STATE MACHINE. `links` is `{ pending: [{from,to,at}], pairs: [{a,b,name,at}] }`.
 * Every function is pure: it takes the state and returns a NEW state, so the server can hold
 * one object per room and the gate can drive the whole mechanic with no sockets at all.
 * ============================================================================================ */

export function freshLinks() {
  return { pending: [], pairs: [], used: [] };
}

/* =============================================================================================
 * 🚨 ONE PAIR PER PLAYER PER BEAT — and `used` is what makes the one-link rule mean anything.
 *
 * The one-link-at-a-time rule was supposed to stop a popular player accumulating partners. It
 * only ever stopped SIMULTANEOUS accumulation. A play critic performed the hole in the shipped
 * UI: **John dropped Ellie mid-conversation and was paired with Ivy seconds later.** Against the
 * pure rules they ran one player through SEVEN separate private channels inside one Debrief.
 *
 * That hands the strongest position in any social deception game — the information hub, the one
 * person who has spoken privately to everybody — to whoever taps fastest. It is also the exact
 * opposite of the mechanic's premise: a hub's pairings are so numerous that "the room saw who
 * you talked to" stops being information at all.
 *
 * So Disconnect ends your turn. You get one conversation per talk beat, and choosing WHO is the
 * decision the mechanic is made of. `clearLinks` on the beat change resets it, which is why this
 * lives in the links state rather than on the player.
 * ============================================================================================= */

/** Everyone who has already had their pairing this beat, whether or not it is still open. */
export function usedIds(links) {
  return new Set(links?.used || []);
}

/** Everyone currently in a pair. One link each — see `requestLink`. */
export function linkedIds(links) {
  const out = new Set();
  for (const p of links?.pairs || []) { out.add(p.a); out.add(p.b); }
  return out;
}

export function pairOf(links, id) {
  return (links?.pairs || []).find((p) => p.a === id || p.b === id) || null;
}

export function partnerOf(links, id) {
  const p = pairOf(links, id);
  if (!p) return null;
  return p.a === id ? p.b : p.a;
}

/**
 * Why a request is refused. Returned as a STRING so the phone can say it rather than a tap
 * that silently does nothing — the cast padlock learned that lesson already (`castRowBlock`).
 */
export const LINK_BLOCK_WHY = {
  self: 'You cannot connect with yourself.',
  dead: 'They are out of the show.',
  busy: 'They are already connected to someone.',
  mine: 'You are already connected. Disconnect first.',
  beat: 'You can only connect while the room is talking.',
  already: 'You have already reached out to them.',
  outgoing: 'You are already waiting on someone.',
  crowded: 'Two conversations are already going. Wait for one to end.',
  spent: 'You have had your conversation this round.',
  theirs: 'They have had their conversation this round.',
};

export function linkBlock(links, from, to, { living = [], beat = 'debrief' } = {}) {
  if (!isLinkBeat(beat)) return 'beat';
  if (from === to) return 'self';
  if (!living.includes(from) || !living.includes(to)) return 'dead';
  /*
   * ⚠️ **THE ROOM-WIDE CAP IS CHECKED LAST, AND THE ORDER IS THE WHOLE POINT.**
   *
   * It used to be first, so it answered for everybody: on one player's sheet John and Ellie (in
   * a pair), Ozz and Mara (in a pair) and Sam — who was completely free — ALL read "ROOM IS
   * FULL". A player who had spent their turn was told *"wait for one to end"*, which will never
   * help them. One undifferentiated NO over five rows, and three of the five were lies.
   *
   * Per-person truth first: busy, spent, theirs, already, outgoing. The cap is what is left when
   * nothing about the two of you is in the way — and then it is true.
   */
  const linked = linkedIds(links);
  if (linked.has(from)) return 'mine';
  if (linked.has(to)) return 'busy';
  // One conversation each per beat. See the  block header — Disconnect ends your turn.
  const spent = usedIds(links);
  if (spent.has(from)) return 'spent';
  if (spent.has(to)) return 'theirs';
  if ((links.pending || []).some((r) => r.from === from && r.to === to)) return 'already';
  /*
   * ⚠️ **ONE OUTGOING REQUEST AT A TIME.** The phone only ever offers one, so this was invisible
   * — until an adversarial playtester used a crafted client to hold FIVE simultaneous requests
   * and prompt five phones at once with "John reached out to you". The server, not the sheet,
   * has to be the thing that says no; and each request is its own broadcast to the whole room.
   */
  if ((links.pending || []).some((r) => r.from === from)) return 'outgoing';
  // Last, so it is only ever said when it is the actual reason. See the note above.
  if ((links.pairs || []).length >= MAX_PAIRS) return 'crowded';
  return null;
}

/**
 * 🚨 **TWO PEOPLE REACHING FOR EACH OTHER MUST NOT DEADLOCK.**
 *
 * A play critic had both phones tap at the same instant. John's read *"Ellie reached out to you.
 * You would become EOHN."* Ellie's read *"John reached out to you. You would become JELLIE."*
 * Neither was told they had also asked, so both sat waiting on a CONNECT button for the other —
 * and the room's name for the pair became a race between two thumbs.
 *
 * Wanting the same thing is agreement. A crossing request PAIRS THEM, and the earlier request
 * wins the name, so the person who reached out first still leads it — which is the rule
 * `mergeName`'s order already encodes.
 */
export function requestLink(links, from, to, opts = {}) {
  const crossing = (links.pending || []).find((r) => r.from === to && r.to === from);
  if (crossing) return acceptLink(links, crossing.from, crossing.to, opts);
  if (linkBlock(links, from, to, opts)) return links;
  return { ...links, pending: [...links.pending, { from, to, at: opts.now ?? 0 }] };
}

/**
 * Accepting. `to` is the person who was asked — only they can accept, which is why the argument
 * order here is (links, requester, accepter) and not a single id.
 *
 * ⚠️ Accepting DROPS every other request either of them is part of. Two people mid-conversation
 * must not still be showing as reachable, and a stale request that resolves later would pull
 * somebody out of a pair they are already in.
 */
export function acceptLink(links, from, to, opts = {}) {
  const req = (links.pending || []).find((r) => r.from === from && r.to === to);
  if (!req) return links;
  if (linkedIds(links).has(from) || linkedIds(links).has(to)) return links;
  // ⚠️ THE CAP IS CHECKED HERE TOO.  only guards the REQUEST; three requests raised
  // while the room was empty could otherwise all be accepted into a third and fourth pair.
  if ((links.pairs || []).length >= MAX_PAIRS) return links;
  const names = opts.names || {};
  const pair = { a: from, b: to, name: mergeName(names[from], names[to]), at: opts.now ?? 0, done: [] };
  return {
    pending: (links.pending || []).filter((r) =>
      r.from !== from && r.to !== from && r.from !== to && r.to !== to),
    pairs: [...links.pairs, pair],
    /*
     * 🚨 **CARRYING `used` THROUGH IS NOT TIDINESS — LEAVING IT OUT DELETED THE RULE.** This
     * function returned a fresh object without it, so `links.used` became `undefined` on EVERY
     * accept anywhere in the room. An adversarial playtester proved the consequence with six
     * real phones: John spent his turn, his sheet correctly greyed everyone out — and the moment
     * an unrelated couple connected, every name went live again and he ran a second private
     * channel. On an eight-player table where pairs form constantly it is unbounded, which is
     * the exact hub exploit `used` was added to close.
     *
     * Every reducer in this file has to carry the whole state forward. There is no partial
     * update that is safe here.
     */
    used: [...(links.used || [])],
  };
}

/** A refusal costs NEITHER of them their turn — nothing happened, so nothing is spent. */
export function declineLink(links, from, to) {
  return { ...links, pending: (links.pending || []).filter((r) => !(r.from === from && r.to === to)) };
}

/**
 * Either half may break it, and a death or an eviction breaks it too.
 *
 * 🚨 **THE PERSON WHO WALKS OUT SPENDS THEIR TURN. THE PERSON WALKED OUT ON GETS THEIRS BACK.**
 *
 * The first version of this rule marked BOTH players spent the moment a pair formed, which
 * closed the hub exploit and created a nastier one in its place. The critic's own screenshot
 * shows why: after the hub dumped Ellie, her sheet was six greyed `· BUSY` names and one live
 * one — *"the hub player's discards get left to pair with each other by process of elimination."*
 * Marking her spent as well would have left her with none, punished for a choice that was not
 * hers, on a beat she can do nothing else with.
 *
 * Charging only the DISCONNECTOR closes the hub just as hard — the hub burns its own turn on the
 * very first disconnect and can never pair again — while making dumping somebody purely
 * self-harming. It is bounded even under collusion: N friends dumping one player to feed them N
 * channels costs N turns to buy one, and every pairing is on the television while they do it.
 *
 * ⚠️ `used` SURVIVES the unlink. That is the entire point of it.
 */
export function unlink(links, id) {
  const wasPaired = !!pairOf(links, id);
  return {
    pending: (links.pending || []).filter((r) => r.from !== id && r.to !== id),
    pairs: (links.pairs || []).filter((p) => p.a !== id && p.b !== id),
    used: wasPaired ? [...new Set([...(links.used || []), id])] : [...(links.used || [])],
  };
}

/** Drop anything involving someone who is no longer living and seated. */
export function pruneLinks(links, living) {
  const alive = new Set(living);
  return {
    pending: (links.pending || []).filter((r) => alive.has(r.from) && alive.has(r.to)),
    pairs: (links.pairs || []).filter((p) => alive.has(p.a) && alive.has(p.b)),
    used: (links.used || []).filter((id) => alive.has(id)),
  };
}

/** Requests that have stood too long. */
export function expirePending(links, now) {
  return { ...links, pending: (links.pending || []).filter((r) => now - (r.at || 0) < LINK_REQUEST_MS) };
}

/* ============================================================================================
 * 🔒 THE PRIVACY SHAPE.
 *
 * A whisper is the first message in this codebase that carries PLAYER-AUTHORED CONTENT to some
 * sockets and not others. Everything else public is public and everything else secret is a role.
 * So it gets its own closed schema and its own refusal, in the same style as `fanoutViolations`
 * and `cueViolations`, and for the same reason: the failure mode is silent and total. A whisper
 * that reaches the TV is not a glitch, it is the end of the game.
 *
 * `whisperViolations` is what the gate inverts. `harness/link-merge.mjs` L10-L13 assert a
 * whisper is refused by the FANOUT validator outright — it is not a legal broadcast of any kind
 * — and that the pair route carries exactly two recipients.
 * ============================================================================================ */

export const WHISPER_KEYS = ['t', 'from', 'text', 'at'];
export const WHISPER_MAX = 140;

/**
 * 🚨 **REFUSE A NON-STRING; DO NOT COERCE ONE.**
 *
 * `String(text)` looks harmless and is not. An adversarial playtester sent
 * `{t:'whisper', text:{toString:'x'}}` from an ordinary seated phone: an object whose `toString`
 * is not callable throws `TypeError: Cannot convert object to primitive value`, which was
 * uncaught in the socket handler and **killed the whole node process — every room, every player,
 * the television.** Proven across rooms.
 *
 * The dispatch loop is now wrapped too (belt and braces, `local.mjs`), but a cleaner that can
 * throw on hostile input is a landmine wherever else it gets called. A message this cannot
 * understand is not a message.
 */
export function cleanWhisper(text) {
  if (typeof text !== 'string') return '';
  return text.replace(/\s+/g, ' ').trim().slice(0, WHISPER_MAX);
}

export function whisperViolations(msg) {
  const bad = [];
  if (!msg || typeof msg !== 'object') return ['<empty>'];
  if (msg.t !== 'whisper') bad.push(`t:${msg.t}`);
  for (const k of Object.keys(msg)) if (!WHISPER_KEYS.includes(k)) bad.push(`whisper.${k}`);
  if (typeof msg.text !== 'string') bad.push('whisper.text:<not a string>');
  else if (msg.text.length > WHISPER_MAX) bad.push(`whisper.text:${msg.text.length}>${WHISPER_MAX}`);
  return bad;
}

/**
 * The ONLY definition of who may read a whisper: the two ids in the pair, and nobody else.
 * Returns `[]` when the sender is not in a pair, so an unlinked socket shouting `whisper` at the
 * server reaches nobody rather than reaching everybody.
 */
export function whisperAudience(links, from) {
  const p = pairOf(links, from);
  if (!p) return [];
  return [p.a, p.b];
}

/** What the room may know: who is paired, and what they are called now. Never the words. */
export function publicLinks(links) {
  return {
    pending: (links?.pending || []).map((r) => ({ from: r.from, to: r.to })),
    // `at` rides along so BOTH screens can draw the countdown. A pair that evaporates
    // mid-sentence with no warning reads as a crash — see PAIR_MS.
    //  is public: the room may see a pair wrapping up, which is good television and
    // says nothing about what was said. The partner needs it to know their tap was seen.
    pairs: (links?.pairs || []).map((p) => ({ a: p.a, b: p.b, name: p.name, at: p.at, done: [...(p.done || [])] })),
    // PUBLIC on purpose: the room watched every one of these pairings happen. The phone needs
    // it to grey out people who have had their conversation, instead of offering a tap that
    // the server will silently refuse.
    used: [...(links?.used || [])],
  };
}
