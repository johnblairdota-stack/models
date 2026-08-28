/**
 * link-merge — JELLIE. Two robots become one name, and get a channel nobody else can read.
 *
 *   node harness/link-merge.mjs
 *
 * John's design, 2026-08-25: *"during the debrief players can... find a hybrid combination name
 * and the tag changes colour. they are connected by their phone and can text back and forth to
 * eachother to communicate via text in a room full of people secretly."*
 *
 * =============================================================================================
 * 🔒 L10-L14 ARE THE ONES THAT MATTER. EVERYTHING ELSE IS A NAME GENERATOR.
 * =============================================================================================
 * A whisper is the first PLAYER-AUTHORED CONTENT in this codebase that some sockets may read and
 * others may not. Every other secret is a role — a value the server knows and filters. This is
 * text a human typed, and the failure mode is not a glitch: a whisper that reaches the television
 * is the end of the game, in front of everybody, with no way to un-see it.
 *
 * So the privacy is asserted STRUCTURALLY rather than behaviourally. `t:'whisper'` is not a
 * broadcast with a filter on it — `fanoutViolations` refuses the word outright, so there is no
 * code path where a whisper is "a fanout that happens to be narrowed". L11 is the control on
 * that: it feeds a whisper to the fanout validator and requires a refusal.
 *
 * The rest (L1-L6) hammer `mergeName` across every pair of a realistic name pool plus the nasty
 * ones — duplicate names (explicitly allowed in this game), digit-only names, vowel-initial
 * names with no onset, names with no vowel at all. The generator must never throw, never return
 * empty, never exceed the tag's `NAME_CAP`, and never hand back one of its own inputs, because
 * every one of those puts an unreadable or LYING plate over somebody's head on a television.
 */

import {
  mergeName, MERGE_BLOCK, freshLinks, requestLink, acceptLink, declineLink, unlink, linkBlock,
  pairOf, partnerOf, linkedIds, pruneLinks, whisperAudience, whisperViolations, cleanWhisper,
  publicLinks, isLinkBeat, LINK_BEATS, WHISPER_MAX, LINK_INK, usedIds, MAX_PAIRS, LINK_BLOCK_WHY,
  PAIR_MS, expirePairs, pairRemaining, finishPair, isDone, bothDone, NAME_CAP,
} from '../src/party/link.js';
import { fanoutViolations, FANOUT_KEYS, applyLinkRequest, applyLinkAccept, roomLinks as linksOfRoom } from '../net/party/local.mjs';
import { cueViolations } from '../src/party/follow.js';
import { createRoom } from '../src/party/room.js';
import { readFile } from 'node:fs/promises';

let pass = 0, fail = 0;
const t = (n, c, d = '') => {
  if (c) { pass++; console.log(`  ok   ${n}${d ? ` · ${d}` : ''}`); }
  else { fail++; console.log(`  FAIL ${n}${d ? ` · ${d}` : ''}`); }
  return c;
};

console.log('\nlink-merge — JELLIE, and the channel nobody else can read\n');

// ---------------------------------------------------------------- L1 · the name John asked for
{
  t('L1 · John + Ellie is JELLIE', mergeName('John', 'Ellie') === 'JELLIE', mergeName('John', 'Ellie'));
  t('L1b · and the order carries who reached out — it is not symmetric',
    mergeName('Ellie', 'John') !== mergeName('John', 'Ellie'),
    `${mergeName('John', 'Ellie')} vs ${mergeName('Ellie', 'John')}`);
  t('L1c · the seam is A-onset + B-from-its-first-vowel, so the good ones land',
    mergeName('Mara', 'Ellie') === 'MELLIE' && mergeName('Bex', 'Ozz') === 'BOZZ'
      && mergeName('Sam', 'Ivy') === 'SIVY',
    `${mergeName('Mara', 'Ellie')} / ${mergeName('Bex', 'Ozz')} / ${mergeName('Sam', 'Ivy')}`);
}

// ---------------------------------------------------------------- L2-L6 · it cannot misbehave
{
  /*
   * The pool is deliberately hostile. `Robot 6` is the stock name an unnamed seat gets, so two
   * of them in one room is the DEFAULT case, not an edge case. `Ozz` has no onset. `Bx` has no
   * vowel. `''` is a phone that joined without typing anything.
   */
  const pool = ['John', 'Ellie', 'Ozz', 'Mara', 'Bex', 'Robot 6', 'Robot 2', 'Al', 'Bx', 'Zoe',
    'Ivy', 'Sam', '', '   ', '12345678', 'AAAAAAAAAA', 'Zz', 'O', 'a b c', '!!!'];
  let bad = null, n = 0, longest = '';
  for (const a of pool) {
    for (const b of pool) {
      let out;
      try { out = mergeName(a, b); } catch (e) { bad = `threw on ${JSON.stringify([a, b])}: ${e.message}`; break; }
      n++;
      if (typeof out !== 'string' || !out.length) { bad = `empty on ${JSON.stringify([a, b])}`; break; }
      if (out.length > NAME_CAP) { bad = `${out.length} chars on ${JSON.stringify([a, b])}`; break; }
      if (out !== out.toUpperCase()) { bad = `not upper on ${JSON.stringify([a, b])}`; break; }
      if (out.length > longest.length) longest = out;
    }
    if (bad) break;
  }
  t('L2 · every pair of a hostile name pool produces a usable plate', bad === null,
    bad || `${n} pairs · longest "${longest}" (cap ${NAME_CAP})`);

  t('L3 · it is deterministic — the same pair is the same name every time',
    mergeName('John', 'Ellie') === mergeName('John', 'Ellie')
      && mergeName('Robot 6', 'Robot 2') === mergeName('Robot 6', 'Robot 2'));

  /*
   * L4 is the LYING PLATE. If the merge equals one of its inputs, the television shows two
   * robots both wearing what looks like one player's own name — which reads as a bug or, worse,
   * as that player having been renamed. The cascade in `mergeName` exists for this.
   */
  let liar = null;
  for (const a of pool) for (const b of pool) {
    const A = a.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const B = b.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!A || !B) continue;                       // one empty name legitimately returns the other
    const out = mergeName(a, b);
    if (out === A || out === B) { liar = `${a}+${b} -> ${out}`; break; }
  }
  t('L4 · a merge never comes back as one of its own inputs — no plate lies about who it is',
    liar === null, liar || 'checked every pair');

  t('L5 · duplicate names still merge to something honest — the default room is Robot N',
    mergeName('Robot 6', 'Robot 6') !== 'ROBOT6' && mergeName('Robot 6', 'Robot 6').length >= 3,
    mergeName('Robot 6', 'Robot 6'));

  /*
   * L6 · the blocklist. The generator builds words nobody typed out of two innocent names, and
   * a blocked result must fall THROUGH to the next cascade step rather than fail. The control is
   * the second half: a name engineered to hit the list must come back with something else.
   */
  const hits = [];
  for (const a of pool) for (const b of pool) {
    const out = mergeName(a, b);
    if (MERGE_BLOCK.some((w) => out.includes(w))) hits.push(`${a}+${b}=${out}`);
  }
  const forced = mergeName('Cu', 'Unt');
  t('L6 · nothing on the block list can reach a plate, and a blocked seam falls through',
    hits.length === 0 && !MERGE_BLOCK.some((w) => forced.includes(w)) && forced.length >= 2,
    `0 hits over the pool · a forced collision yields "${forced}"`);
}

// ---------------------------------------------------------------- L7-L9 · the pairing rules
{
  const living = ['p1', 'p2', 'p3', 'p4'];
  const names = { p1: 'John', p2: 'Ellie', p3: 'Ozz', p4: 'Mara' };
  const opts = { living, beat: 'debrief', names };
  let L = freshLinks();

  t('L7 · you cannot reach out to yourself, to the dead, or outside a talk beat',
    linkBlock(L, 'p1', 'p1', opts) === 'self'
      && linkBlock(L, 'p1', 'pX', opts) === 'dead'
      && linkBlock(L, 'p1', 'p2', { ...opts, beat: 'vote' }) === 'beat'
      && !isLinkBeat('vote') && !isLinkBeat('casting'));   // the beat LIST is L60's job now

  L = requestLink(L, 'p1', 'p2', opts);
  t('L7b · a request is pending and nobody is paired yet',
    L.pending.length === 1 && L.pairs.length === 0 && linkedIds(L).size === 0);

  L = acceptLink(L, 'p1', 'p2', opts);
  t('L8 · accepting merges them, and the pair carries the name',
    L.pairs.length === 1 && L.pairs[0].name === 'JELLIE'
      && partnerOf(L, 'p1') === 'p2' && partnerOf(L, 'p2') === 'p1',
    JSON.stringify(L.pairs[0]));

  /*
   * L8b is the rule that keeps this a two-person secret. Without it a popular player accumulates
   * partners and the "private channel" becomes a group chat with extra steps — and the merged
   * plate stops meaning anything, because one robot would be wearing three names.
   */
  t('L8b · ONE link each — a paired player cannot be reached and cannot reach out',
    linkBlock(L, 'p3', 'p1', opts) === 'busy' && linkBlock(L, 'p1', 'p3', opts) === 'mine');

  const before = JSON.stringify(L);
  const sneak = acceptLink(requestLink(L, 'p3', 'p4', opts), 'p3', 'p1', opts);
  t('L8c · and an accept that would double-book somebody changes nothing',
    JSON.stringify(unlink(sneak, 'p3')) === before || !pairOf(sneak, 'p1') || partnerOf(sneak, 'p1') === 'p2');

  t('L9 · either half may break it, and a death breaks it',
    unlink(L, 'p2').pairs.length === 0
      && pruneLinks(L, ['p1', 'p3', 'p4']).pairs.length === 0);

  t('L9b · declining clears the request without pairing anyone',
    declineLink(requestLink(freshLinks(), 'p1', 'p2', opts), 'p1', 'p2').pending.length === 0);

  /*
   * 🚨 L9c · THE SERIAL HUB. A play critic performed this in the shipped UI: John dropped Ellie
   * mid-conversation and was paired with Ivy seconds later, and against the pure rules they ran
   * ONE PLAYER THROUGH SEVEN private channels inside a single Debrief.
   *
   * The one-link rule (L8b) only ever stopped SIMULTANEOUS pairing. Serial re-pairing hands the
   * strongest seat in any social deception game — the person who has spoken privately to
   * everybody — to whoever taps fastest, and it destroys the mechanic's own premise: a hub's
   * pairings are so numerous that "the room saw who you talked to" stops being information.
   *
   * Disconnect now ends your turn. `used` survives `unlink`, which is the entire point of it.
   */
  const dropped = unlink(L, 'p1');
  t('L9c · Disconnect ENDS YOUR TURN — no serial re-pairing through the whole table',
    linkBlock(dropped, 'p1', 'p3', opts) === 'spent'
      && linkBlock(dropped, 'p3', 'p1', opts) === 'theirs'
      && linkBlock(dropped, 'p3', 'p4', opts) === null,
    'p1 is spent; p3 and p4 still have their conversation');

  /*
   * 🚨 L9c2 IS THE FAIRNESS HALF, and the first version of this rule got it wrong. Marking both
   * players spent when the pair FORMED closed the hub and punished its victims: the critic's
   * screenshot showed a dumped player left with six greyed names and one live one. Being walked
   * out on is not a choice you made. Charging only the disconnector closes the hub just as hard
   * and makes dumping somebody purely self-harming.
   */
  t('L9c2 · but the person walked out ON keeps theirs — being dumped is not a choice you made',
    linkBlock(dropped, 'p2', 'p3', opts) === null
      && linkBlock(dropped, 'p3', 'p2', opts) === null,
    'p2 was dumped and can still find someone else');

  // The critic's own reproduction, run as an assertion: seven serial pairings must be impossible.
  let hub = freshLinks(); let got = 0;
  const many = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
  const manyOpts = { living: many, beat: 'debrief', names: Object.fromEntries(many.map((p) => [p, p])) };
  for (const other of many.slice(1)) {
    hub = acceptLink(requestLink(hub, 'p1', other, manyOpts), 'p1', other, manyOpts);
    if (pairOf(hub, 'p1')) got++;
    hub = unlink(hub, 'p1');
  }
  t('L9d · and the hub run that reached SEVEN channels now reaches exactly one', got === 1,
    `${got} private channels for one player in one Debrief`);

  t('L9e · a refusal costs neither of them their turn — nothing happened',
    usedIds(declineLink(requestLink(freshLinks(), 'p1', 'p2', opts), 'p1', 'p2')).size === 0);
}

// ---------------------------------------------------------------- L10-L14 · THE PRIVACY
{
  const living = ['p1', 'p2', 'p3'];
  const opts = { living, beat: 'debrief', names: { p1: 'John', p2: 'Ellie', p3: 'Ozz' } };
  const L = acceptLink(requestLink(freshLinks(), 'p1', 'p2', opts), 'p1', 'p2', opts);

  t('L10 · a whisper reaches EXACTLY the two in the pair',
    whisperAudience(L, 'p1').sort().join(',') === 'p1,p2'
      && whisperAudience(L, 'p2').sort().join(',') === 'p1,p2');

  /*
   * 🚨 L10b IS THE FAIL-CLOSED DIRECTION AND IT IS THE MOST IMPORTANT LINE IN THIS FILE.
   * An unlinked socket shouting `whisper` at the server must reach NOBODY. The dangerous bug is
   * the other default — an empty audience treated as "no filter", i.e. everyone.
   */
  t('L10b · and an UNLINKED player\'s whisper reaches nobody at all — not everybody',
    whisperAudience(L, 'p3').length === 0 && whisperAudience(freshLinks(), 'p1').length === 0);

  /*
   * L11 · the structural one. `t:'whisper'` is not a narrowed broadcast, it is a different verb,
   * and the fanout validator must not know the word. If someone ever adds `whisper` to
   * `FANOUT_KEYS` this goes red — which is the entire point of writing it this way round.
   */
  const w = { t: 'whisper', from: 'p1', text: 'meet me after', at: 1 };
  t('L11 · the FANOUT validator refuses a whisper outright — it is not a broadcast of any kind',
    fanoutViolations(w).length > 0 && !Object.keys(FANOUT_KEYS).includes('whisper'),
    fanoutViolations(w).join(','));

  t('L11b · while the whisper\'s own schema accepts it, and refuses anything extra',
    whisperViolations(w).length === 0
      && whisperViolations({ ...w, to: 'p2' }).length > 0
      && whisperViolations({ ...w, role: 'evil' }).length > 0);

  t('L11c · over-long text is refused rather than truncated silently on the wire',
    whisperViolations({ ...w, text: 'x'.repeat(WHISPER_MAX + 1) }).length > 0
      && cleanWhisper('  a\n\nb  ').length === 3
      && cleanWhisper('y'.repeat(999)).length === WHISPER_MAX);

  /*
   * L12 · what the ROOM is allowed to know. The pair and the merged name are public on purpose —
   * that is the mechanic. The words are not in the shape at all.
   */
  const pub = publicLinks(L);
  const flat = JSON.stringify(pub);
  t('L12 · the public shape carries who and what-they-are-called, and no text key anywhere',
    pub.pairs[0].name === 'JELLIE' && !/text|whisper|said|msg/i.test(flat),
    flat);
  t('L12b · and it survives the fanout schema, so the TV may legally be told',
    fanoutViolations({ t: 'links', ...pub }).length === 0
      && fanoutViolations({ t: 'links', ...pub, pairs: [{ ...pub.pairs[0], text: 'hi' }] }).length > 0);

  /*
   * L13 · the mansion cue. The plate over a robot's head is drawn inside the follow iframe, so
   * the merged name has to cross the cue channel — the one door `cueViolations` guards. A `text`
   * on a pair cue must be a violation for the same reason a `role` on an intros cue is.
   */
  t('L13 · the pair CUE carries the merged name and refuses anything else',
    cueViolations({ kind: 'pair', pairs: [{ a: 'p1', b: 'p2', name: 'JELLIE' }] }).length === 0
      && cueViolations({ kind: 'pair', pairs: [{ a: 'p1', b: 'p2', name: 'X', text: 'hi' }] }).length > 0
      && cueViolations({ kind: 'pair', pairs: [{ a: 'p1', b: 'p2', name: 'X', role: 'evil' }] }).length > 0);
}

// ---------------------------------------------------------------- L20 · a pair lasts one beat
{
  const src = await readFile(new URL('../net/party/local.mjs', import.meta.url), 'utf8');
  /*
   * A channel that survived into the vote would be a permanent private line between two players,
   * which is a different and much worse game. `setShow` is the single door every beat change
   * goes through, which is why the clear lives there.
   */
  t('L20 · the server clears every pair on a beat change, so a channel cannot outlive its beat',
    /if \(room\.show !== beat\) clearLinks\(room\);/.test(src)
      && /function clearLinks/.test(src));
  /*
   * ⚠️ MATCH THE CALL, NOT THE LINE'S SHAPE. This pinned a one-line `if`, and adding the pair
   * clock legitimately turned it into a block — the gate went red on a brace while the behaviour
   * was strictly better. A gate that breaks on punctuation gets edited until it agrees with
   * whatever shipped, which is the opposite of what it is for.
   */
  t('L20b · and a phone arriving mid-beat is told the pairs, like it is told the READY threshold',
    /isLinkBeat\(beat\)[^\n]*fanoutLinks\(room\)/.test(src)
      && /push\(room, bound\.id, \{ t: 'links'/.test(src));
  /*
   * ⚠️ SCOPED TO `applyWhisper`'s BODY, not the whole file. The first version grepped the file
   * for `fanout(room, msg)` and went red on `function fanout(room, msg) {` — the helper's own
   * declaration. A whole-file grep for a common call shape cannot tell a definition from a use,
   * and a gate that cries wolf on correct code gets edited until it agrees with whatever shipped.
   */
  const wFrom = src.indexOf('export function applyWhisper');
  const wBody = wFrom >= 0 ? src.slice(wFrom, src.indexOf('\n}', wFrom)) : '';
  t('L20c · applyWhisper pushes to socket ids and never calls fanout at all',
    wBody.length > 0
      && /push\(room, sid, msg\)/.test(wBody)
      && !/fanout\s*\(/.test(wBody),
    `${wBody.length} chars of applyWhisper scanned`);

  const phone = await readFile(new URL('../src/views/party-phone.js', import.meta.url), 'utf8');
  t('L21 · the phone keeps whispers in its own closure, never on the shared client object',
    /state\.whispers\.push/.test(phone)
      && !/client\.whispers/.test(phone) && !/this\.whispers/.test(phone));

  /*
   * L21c · WHO YOU CAN ACTUALLY REACH OUT TO. Found by opening the sheet on a three-player
   * table: it offered ROBOT 4 through ROBOT 8 — five chairs nobody is sitting in. The nominate
   * sheet solved this long ago (`party-night` N1a7, "never an empty Robot N chair") and the fix
   * is to reuse that ONE definition rather than grow a second list that drifts from it.
   */
  const linkFrom = phone.indexOf('function linkHtml');
  const linkBody = linkFrom >= 0 ? phone.slice(linkFrom, phone.indexOf('\n  }', linkFrom)) : '';
  t('L21c · the reach-out list is joined humans, not eight chairs',
    linkBody.length > 0 && /nominationPlayers\(/.test(linkBody),
    `${linkBody.length} chars of linkHtml scanned`);
  const client = await readFile(new URL('../src/party/night-client.js', import.meta.url), 'utf8');
  /*
   * ⚠️ MATCH THE FIELD, NOT ITS EXACT INITIALISER. The first version pinned the literal
   * `{ pending: [], pairs: [] }` and went red the day `used` was added to it — a gate failing
   * because a neighbouring key appeared is a gate that gets edited to agree with whatever
   * shipped. What matters is that `links` exists on the shared client and `whispers` never does.
   */
  t('L21b · and the shared client stores links but has no whisper field to leak',
    /this\.links = \{ pending: \[\]/.test(client)
      && !/this\.whispers/.test(client));

  const plate = await readFile(new URL('../src/characters/chest-nameplate.js', import.meta.url), 'utf8');
  t('L22 · a live tag can be repainted to the merged name, in the pair colour, without leaking a texture',
    /export function setNameTagLabel/.test(plate)
      && /old\.dispose\?\.\(\)/.test(plate)
      && LINK_INK === '#1F7A3D');
  t('L22b · the plate and the merge share one NAME_CAP, and neither imports THREE for it',
    NAME_CAP === 8
      && /export const NAME_CAP = 8/.test(plate)
      && !/from '\.\.\/characters\/chest-nameplate\.js'/.test(
        await readFile(new URL('../src/party/link.js', import.meta.url), 'utf8')));
}

/* =============================================================================================
 * L30+ · WHAT A HOSTILE PLAYTESTER PROVED, TURNED INTO ASSERTIONS.
 *
 * Every one of these was DEMONSTRATED against the shipped build, not imagined. They found
 * nothing in the privacy category (fifteen socket probes and a six-phone browser run), and
 * everything below instead.
 * ============================================================================================= */
{
  const src = await readFile(new URL('../net/party/local.mjs', import.meta.url), 'utf8');

  /*
   * 🚨 L30 IS THE WORST BUG ANYONE FOUND TODAY. `{t:'whisper', text:{toString:'x'}}` from an
   * ordinary seated phone threw an uncaught TypeError out of the socket handler and KILLED THE
   * NODE PROCESS — every room, every player, the television. Proven across rooms: a phone in one
   * room ended a game running in another. Six of ten crafted payloads did it.
   */
  const dispatch = src.slice(src.indexOf("let msg; try { msg = JSON.parse"), src.indexOf('sock.on(\'close\''));
  t('L30 · one malformed message cannot kill the process — the dispatch is wrapped',
    /try \{[\s\S]*handleClient\(room, bound, self, msg\);[\s\S]*\} catch/.test(dispatch),
    'a stranger\'s handset is untrusted input all the way down');

  t('L30b · and the string cleaners refuse a non-string instead of coercing it',
    cleanWhisper({ toString: 'x' }) === '' && cleanWhisper(null) === '' && cleanWhisper(7) === '',
    'cleanWhisper survives the exact payload that crashed the server');

  /*
   * L31 · the beat belongs to the television. Any seated phone could send `{t:'show'}` and drive
   * the whole room's night; the playtester wiped two live private conversations mid-sentence
   * with it, repeatably. `warm` and `world` already had this guard. This one did not.
   */
  t('L31 · only the TV may drive the show beat',
    /if \(msg\.t === 'show' && isTV && typeof msg\.beat === 'string'\)/.test(src));

  /*
   * L32 · a request from someone who walked away used to stand for the whole beat and could
   * still be accepted into a pair with a phone that was not there. `expirePending` was written,
   * exported, documented — and never called by anything.
   */
  t('L32 · LINK_REQUEST_MS is actually enforced — stale requests lapse',
    /expirePending\(pruneLinks\(/.test(src) && /expirePending/.test(src.slice(0, src.indexOf('const WS_GUID'))),
    'expirePending is imported AND called');

  /*
   * L33 · the ghost pair. `seatsTaken` is never cleared on disconnect, so a griefer who accepted
   * and then yanked their cable held their victim for the whole beat — and the victim's only
   * escape charged THEM the turn while the griefer paid nothing and reconnected by token.
   */
  t('L33 · a pair is pruned against LIVE SOCKETS, not merely seated ids',
    /room\.conns\.has\(sid\)/.test(src) && /linksOf/.test(src));

  /*
   * L34 · a token resume overwrote `room.conns`, and the OLD socket's close handler then deleted
   * the NEW entry — a one-way zombie that could still send but received nothing, looked paired,
   * and never saw a reply. A duplicated tab does exactly this.
   */
  t('L34 · a closing socket only drops its own connection entry',
    /room\.conns\.get\(bound\.id\)\?\.sock === sock/.test(src));
}
{
  const living = ['p1', 'p2', 'p3', 'p4', 'p5'];
  const opts = { living, beat: 'debrief', names: Object.fromEntries(living.map((p) => [p, p])) };

  /*
   * 🚨 L35 · THE REGRESSION I SHIPPED AND THEY CAUGHT. `acceptLink` returned a fresh object
   * without `used`, so ANY pair forming anywhere in the room wiped the spent list and every
   * greyed-out name went live again. With six real phones they ran a second private channel
   * through it. Every reducer has to carry the whole state forward.
   */
  let L = acceptLink(requestLink(freshLinks(), 'p1', 'p2', opts), 'p1', 'p2', opts);
  L = unlink(L, 'p1');
  const beforeOthers = linkBlock(L, 'p1', 'p3', opts);
  L = acceptLink(requestLink(L, 'p3', 'p4', opts), 'p3', 'p4', opts);
  t('L35 · an unrelated pair forming does not wipe the spent list',
    beforeOthers === 'spent' && linkBlock(L, 'p1', 'p5', opts) === 'spent',
    'p1 stays spent while p3+p4 connect');

  /*
   * L36 · one outgoing request at a time. The phone only ever offers one, so a crafted client
   * held FIVE at once and prompted five phones with "John reached out to you" — each one its own
   * broadcast to the whole room. The sheet is not the thing allowed to say no.
   */
  const many = requestLink(freshLinks(), 'p1', 'p2', opts);
  t('L36 · one outgoing request at a time, enforced by the rules not the sheet',
    linkBlock(many, 'p1', 'p3', opts) === 'outgoing'
      && linkBlock(many, 'p1', 'p2', opts) === 'already'
      && linkBlock(many, 'p3', 'p4', opts) === null);
}
{
  const phone = await readFile(new URL('../src/views/party-phone.js', import.meta.url), 'utf8');
  /*
   * L37 · the merge is attacker-steered — the requester controls their own name AND picks the
   * target, and `MERGE_BLOCK` cannot catch a clever one. The prompt showed only WHO was asking
   * while the plate lands over both heads, and leaving now costs the victim their turn.
   */
  t('L37 · the accept prompt shows the merged name, so you consent to the plate not just the person',
    /You would become/.test(phone) && /mergeName\(playerName\(players, r\.from\), myName\)/.test(phone));
}

/* =============================================================================================
 * 🚨 L40 · THE CRASH, FIRED FOR REAL.
 *
 * L30 greps for the try/catch. This one opens a real server, sends the EXACT payloads that
 * killed the process, and requires it to still be serving afterwards. A source grep proves the
 * shape of a fix; only firing the bullet proves the fix.
 * ============================================================================================= */
{
  const { startServer } = await import('../net/party/local.mjs');
  const PORT = 5343;
  const srv = startServer({ port: PORT, count: 8, castSeed: 5, worldSeed: 5, code: 'crash' });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const open = () => new Promise((res) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/?room=crash`);
    const box = { ws, id: null, send: (o) => ws.send(JSON.stringify(o)) };
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.t === 'welcome') { box.id = m.playerId; res(box); } };
    setTimeout(() => res(box), 2000);
  });
  await sleep(150);
  const a = await open();
  const b2 = await open();
  await sleep(150);

  // An object whose `toString` is not callable. `String(x)` on it throws.
  const BOMB = { toString: 'x' };
  const payloads = [
    { t: 'whisper', text: BOMB },
    { t: 'link', to: BOMB },
    { t: 'link', accept: BOMB },
    { t: 'link', decline: BOMB },
    { t: 'name', name: BOMB },
    { t: 'whisper', text: { toString: null } },
    { t: 'link', to: { valueOf: 'y', toString: 'x' } },
  ];
  const quiet = console.error;
  console.error = () => {};                       // the drops are expected and are the point
  for (const p of payloads) { a.send(p); await sleep(60); }
  await sleep(300);
  console.error = quiet;

  const after = await open();
  t('L40 · the server survives every payload that used to kill the process, and keeps serving',
    after.id != null && srv.server.listening,
    `${payloads.length} crash payloads fired; still accepting connections`);

  /* =========================================================================================
   * 🚨 L41 · ACCEPT-THEN-YANK-THE-CABLE, fired for real.
   *
   * The griefer accepts a pair and destroys their socket. `seatsTaken` is never cleared on
   * disconnect, so the dead player counted as "living and seated" and the victim stayed locked
   * to nobody for the whole beat. Their only escape was Disconnect — which charged THEM the turn
   * while the griefer, who never sent `unlink`, paid nothing and reconnected by token to do it
   * again to the next person.
   *
   * Two properties, and the second is the one that makes it fair: the survivor is RELEASED, and
   * the survivor is NOT CHARGED, because they did not walk out on anybody.
   * ========================================================================================= */
  const room = srv.rooms.get('crash');
  const g = await open();                          // the griefer
  const v = await open();                          // the victim
  await sleep(200);
  room.show = 'debrief';
  applyLinkRequest(room, g.id, v.id);
  applyLinkAccept(room, g.id, v.id);
  await sleep(100);
  const pairedFirst = !!pairOf(room.links, v.id);
  g.ws.close();                                    // the cable comes out
  await sleep(400);
  const stillHeld = !!pairOf(linksOfRoom(room), v.id);
  const victimCharged = usedIds(room.links).has(v.id);
  t('L41 · a partner whose socket dies releases their victim, and does not cost them their turn',
    pairedFirst && !stillHeld && !victimCharged,
    `paired=${pairedFirst} → held=${stillHeld} · victim charged=${victimCharged}`);
  v.ws.close();
  /* ⚠️ CLOSE EVERY SOCKET.  does not resolve while one is still open, and the
   * first version left an unnamed second connection behind — the gate hung forever instead of
   * failing, which is worse than failing. The race is also capped below. */
  for (const c of [a, b2, after]) c.ws.close();
  await Promise.race([srv.close(), new Promise((r) => setTimeout(r, 3000))]);
}

/* =============================================================================================
 * L50+ · WHAT THE PLAY CRITIC FELT. These are the notes about whether it is any GOOD, as
 * opposed to whether it is correct — and its verdict was the sharpest of the three:
 *
 *   *"Not yet, and the reason is simple: nothing happens."*
 * ============================================================================================= */
{
  const living = ['p1', 'p2', 'p3'];
  const opts = { living, beat: 'debrief', names: { p1: 'John', p2: 'Ellie', p3: 'Ozz' } };

  /*
   * 🚨 L50 · MUTUAL REACH-OUT USED TO DEADLOCK. Both tapped in the same instant; each phone said
   * the OTHER had reached out, neither was told they had also asked, and both sat waiting on a
   * CONNECT button for the other. The room's name for the pair became a race between two thumbs.
   * Wanting the same thing is agreement.
   */
  const crossed = requestLink(requestLink(freshLinks(), 'p1', 'p2', opts), 'p2', 'p1', opts);
  t('L50 · two people reaching for each other PAIR, they do not deadlock',
    crossed.pairs.length === 1 && crossed.pending.length === 0,
    JSON.stringify(crossed.pairs[0] || null));
  t('L50b · and the one who asked FIRST leads the name, so the order still means something',
    crossed.pairs[0]?.name === mergeName('John', 'Ellie'),
    `${crossed.pairs[0]?.name} (John asked first)`);
}
{
  const plate = await readFile(new URL('../src/characters/chest-nameplate.js', import.meta.url), 'utf8');
  /*
   * 🚨 L51 IS THE HEADLINE NOTE. The critic photographed the television 93ms after the accept and
   * both plates were ALREADY green and settled — no tween, no scale, no flash, no sound. John
   * asked for *"an animation of them becoming connected"*; none of it shipped, and without it
   * the critic's verdict was that the whole thing reduces to a DM.
   */
  t('L51 · the merge gets stage time — the plate pops rather than swapping instantly',
    /export const MERGE_POP_MS/.test(plate)
      && /sprite\.userData\.popAt = Date\.now\(\)/.test(plate)
      && /mergePop\(sprite\)/.test(plate));
  t('L51b · and the pop rides the existing per-frame hook — no new clock to leak',
    /distK\(sprite, camera\) \* mergePop\(sprite\)/.test(plate)
      && !/setInterval/.test(plate) && !/requestAnimationFrame/.test(plate));

  const phone = await readFile(new URL('../src/views/party-phone.js', import.meta.url), 'utf8');
  /*
   * L52 · THE BUZZ WAS ON THE WRONG PHONE. Instrumented through a whole invite, the invitee's
   * handset showed `navigator.vibrate` 0 calls, audio 0, `document.title` 0 changes — while the
   * SENDER, already looking at their screen, got a haptic. In a real room the invitee's phone is
   * face-down on a knee.
   */
  t('L52 · the person being ASKED is the one interrupted',
    /wants a word/.test(phone) && /state\.wasAsked/.test(phone) && /document\.title = `\$\{who\} → you`/.test(phone));

  /*
   * L53 · 410 characters went in, 139 came out, cut mid-word, with no warning to either side —
   * on the one channel whose entire purpose is a careful accusation.
   */
  t('L53 · the whisper field says how much room is left, and stops at the wire limit',
    /maxlength="\$\{WHISPER_MAX\}"/.test(phone) && /data-charcount/.test(phone));

  /*
   * L54 · DISCONNECT was unlabelled, one fat thumb under the big orange SEND, and spending it
   * costs your conversation for the whole beat. The critic hit it and only then found every name
   * had gone grey.
   */
  t('L54 · Disconnect says what it costs before you press it',
    /Disconnect · ends your turn/.test(phone) && /ghost wide danger/.test(phone));

  const host = await readFile(new URL('../src/views/party-host.js', import.meta.url), 'utf8');
  /*
   * L55 · "4 of 3 ready · ending…". A counter that exceeds its own threshold reads as a bug to
   * anyone who can count, on the one line telling the room what is about to happen.
   */
  t('L55 · the ready counter cannot exceed its own threshold on either screen',
    /Math\.min\(n\.count, n\.need\)/.test(phone) && /Math\.min\(r\.count, r\.need\)/.test(host));
}
{
  const play = await readFile(new URL('./jellie-play.mjs', import.meta.url), 'utf8');
  /*
   * 🚨 L56 · THE INSTRUMENT ITSELF WAS LYING, AND THIS IS THE MOST IMPORTANT ASSERTION IN THE
   * BLOCK. `jellie-play` skipped Casting with the dev key — and the seated circle is PLACED
   * during Casting. So every screenshot it took of "the room watching a pair form" was a
   * photograph of an empty ballroom with no robots, no chairs and no name tags. Two separate
   * critics drew conclusions from those frames before anyone noticed.
   *
   * An instrument that quietly photographs the wrong thing is worse than no instrument.
   */
  t('L56 · the play harness PLAYS casting rather than skipping it — the circle is seated first',
    /const playCasting = async/.test(play)
      && /DO NOT `\]` PAST CASTING/.test(play)
      && play.indexOf('await playCasting();') < play.indexOf("beat: 'DEBRIEF'") + play.length);
}

/* =============================================================================================
 * L60+ · JOHN'S TWO CALLS, 2026-08-26, after all three critics: cut Reckoning, cap pairs at two.
 * ============================================================================================= */
{
  /*
   * 🚨 L60 · RECKONING IS OUT. The phone stacked the nominate list directly on the reach-out
   * list — the SAME names, ~150px apart, one meaning "I accuse you" and one meaning "let's talk
   * secretly." A play critic confirmed the mis-tap hands-on, and no gate could ever have seen it.
   * The rhythm it buys: Debrief is where you make private moves, Reckoning is where you live
   * with them in front of everybody.
   */
  t('L60 · pairing is Debrief ONLY — the nomination beat stays public',
    LINK_BEATS.join(',') === 'debrief'
      && isLinkBeat('debrief') && !isLinkBeat('reckoning')
      && !isLinkBeat('vote') && !isLinkBeat('casting'),
    LINK_BEATS.join(','));

  /*
   * 🚨 L61 · TWO CONVERSATIONS, ROOM-WIDE. At eight players four pairs formed within seconds and
   * the whole table went heads-down during a beat whose instruction line says "Talk." Worse, the
   * mechanic ate its own premise: the public cost of pairing is inversely proportional to how
   * many people pair, so at four pairs nobody is conspicuous and everybody does it.
   */
  const many = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
  const mo = { living: many, beat: 'debrief', names: Object.fromEntries(many.map((p) => [p, p])), now: 1 };
  let R = freshLinks();
  R = acceptLink(requestLink(R, 'p1', 'p2', mo), 'p1', 'p2', mo);
  R = acceptLink(requestLink(R, 'p3', 'p4', mo), 'p3', 'p4', mo);
  t('L61 · two pairs are allowed and a third is refused, by name',
    R.pairs.length === MAX_PAIRS && linkBlock(R, 'p5', 'p6', mo) === 'crowded',
    `${R.pairs.length} pairs · a third reaches out and is told "${LINK_BLOCK_WHY.crowded}"`);

  /*
   * L62 is the one that matters structurally. `linkBlock` only guards the REQUEST. Three requests
   * raised while the room was still empty could otherwise ALL be accepted afterwards, walking
   * straight past the cap — so `acceptLink` re-checks.
   */
  let S = freshLinks();
  S = requestLink(S, 'p1', 'p2', mo);
  S = requestLink(S, 'p3', 'p4', mo);
  S = requestLink(S, 'p5', 'p6', mo);
  S = acceptLink(S, 'p1', 'p2', mo);
  S = acceptLink(S, 'p3', 'p4', mo);
  S = acceptLink(S, 'p5', 'p6', mo);           // must be refused — the room is already full
  t('L62 · three requests raised before the cap filled cannot all resolve past it',
    S.pairs.length === MAX_PAIRS,
    `${S.pairs.length} pairs from 3 accepted requests`);

  // And a freed slot must be usable again, or the cap is a one-shot rather than a limit.
  const freed = unlink(S, 'p1');
  /* ⚠️ 'already', NOT null — p5's original request is STILL STANDING from before the cap
   * filled, which is correct and was what the first version of this assertion forgot. What
   * matters is that the refusal is no longer 'crowded': the freed slot is really free. */
  t('L62b · and when a pair ends, the slot opens again',
    linkBlock(freed, 'p5', 'p6', mo) !== 'crowded'
      && linkBlock(freed, 'p7', 'p8', mo) === null,
    'p1 disconnected; a fresh pair may now form');

  const phone = await readFile(new URL('../src/views/party-phone.js', import.meta.url), 'utf8');
  const host = await readFile(new URL('../src/views/party-host.js', import.meta.url), 'utf8');
  t('L63 · both screens SAY the room is full rather than offering a dead tap',
    /crowded: ' · room is full'/.test(phone)
      && /Two conversations are already going/.test(phone)
      && /the room is full/.test(host),
    'scarcity nobody can see is a refusal that looks like a bug');
}

/* =============================================================================================
 * L70+ · ROUND THREE. A play critic played the capped build and found the cap had turned into a
 * lockout, the Reckoning hazard had come BACK through the UI, and a third of every merge was
 * systematically unpronounceable.
 * ============================================================================================= */
{
  const many = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
  const mo = { living: many, beat: 'debrief', names: Object.fromEntries(many.map((p) => [p, p])), now: 1000 };

  /*
   * 🚨 L70 · THE PAIR CLOCK. Nothing ever ended a pair, and `unlink` charges whoever lets go —
   * so the dominant play was to pair in the first ten seconds and never release, and the other
   * six players got a screen reading ROOM IS FULL for five minutes. Expiry marks BOTH halves
   * spent, because it is nobody's choice and therefore cannot be a punishment.
   */
  let P = acceptLink(requestLink(freshLinks(), 'p1', 'p2', mo), 'p1', 'p2', mo);
  t('L70 · a fresh pair is on a clock and is not spent yet',
    P.pairs.length === 1 && usedIds(P).size === 0
      && pairRemaining(P.pairs[0], 1000) === PAIR_MS,
    `${PAIR_MS / 1000}s on the clock`);
  const mid = expirePairs(P, 1000 + PAIR_MS - 1);
  t('L70b · it survives right up to the last millisecond', mid.pairs.length === 1);
  const done = expirePairs(P, 1000 + PAIR_MS);
  t('L70c · and when the clock runs out the slot frees and BOTH halves are spent',
    done.pairs.length === 0 && usedIds(done).has('p1') && usedIds(done).has('p2')
      && linkBlock(done, 'p3', 'p4', mo) === null,
    'the room rotates instead of locking');

  /*
   * 🚨 L71 · "ROOM IS FULL" WAS STAMPED ON PEOPLE IT WAS NOT TRUE OF. The cap was checked before
   * every per-person reason, so a sheet showed ROOM IS FULL against players who were in a pair,
   * against a player who had spent their turn (for whom it will never come free), and against a
   * completely free player. One undifferentiated NO, three of five rows a lie.
   */
  let F = acceptLink(requestLink(freshLinks(), 'p1', 'p2', mo), 'p1', 'p2', mo);
  F = acceptLink(requestLink(F, 'p3', 'p4', mo), 'p3', 'p4', mo);
  F = unlink(F, 'p5');                                   // p5 has done nothing
  t('L71 · with the room full, each row still says what is true of THAT person',
    linkBlock(F, 'p5', 'p1', mo) === 'busy'
      && linkBlock(F, 'p5', 'p6', mo) === 'crowded'
      && linkBlock(F, 'p1', 'p6', mo) === 'mine',
    'busy / crowded / mine — not "crowded" three times');
  /*
   * ⚠️ p5 spends their turn BEFORE the room fills. With two pairs already live the cap blocks
   * the setup itself — which is the rule working correctly, and which made the first version of
   * this assertion a no-op that passed for the wrong reason.
   */
  let S2 = acceptLink(requestLink(freshLinks(), 'p5', 'p6', mo), 'p5', 'p6', mo);
  S2 = unlink(S2, 'p5');
  t('L71b · and someone who has SPENT their turn is told that, not "wait for one to end"',
    linkBlock(S2, 'p5', 'p7', mo) === 'spent');
}
{
  /*
   * 🚨 L72 · THE VOWEL SEAM. Measured over 870 ordered pairs: EVERY merge with a vowel-initial
   * requester opened on a two-vowel cluster — EOHN, OARA, IALEX, AIZ. Not luck, one branch, and
   * a third of all pairs at a normal name set.
   */
  const pool = ['John', 'Ellie', 'Ozz', 'Mara', 'Bex', 'Sam', 'Ivy', 'Zoe', 'Anna', 'Liz',
    'Alex', 'Kim', 'Tom', 'Dev', 'Nia', 'Raj', 'Ada', 'Eve', 'Uma', 'Ian'];
  const V = 'AEIOUY';
  /*
   * ⚠️ **THE SEAM MUST NOT CREATE A VOWEL CLUSTER — IT CANNOT UNDO ONE THAT WAS ALREADY THERE.**
   * `IAN` opens on two vowels because that is how the name is spelled, so `IAN + JOHN = IANOHN`
   * is the branch working, not failing. The first version of this assertion did not make that
   * distinction and reported a correct merge as a defect. What is being asserted is that the
   * GENERATOR does not manufacture the cluster.
   */
  const twoVowelOpen = (w) => V.includes(w[0]) && V.includes(w[1]);
  const bad = [];
  for (const a of pool) for (const b of pool) {
    if (a === b) continue;
    const A = a.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (twoVowelOpen(A)) continue;                  // the name itself opens that way
    const m = mergeName(a, b);
    if (twoVowelOpen(m)) bad.push(`${a}+${b}=${m}`);
  }
  t('L72 · the seam never MANUFACTURES a two-vowel opening',
    bad.length === 0, bad.length ? bad.slice(0, 6).join(' ') : `${pool.length * (pool.length - 1)} ordered pairs clean`);
  /*
   * 🚨 L72c PINS A TASTE CALL SO IT CANNOT DRIFT. John, 2026-08-26: *"3 letter is fine."*
   *
   * A play critic wanted three-character merges gone as typos. Raising the floor to four was
   * tried and measured worse — it takes JOE and JIM with it — so the question went to the person
   * whose taste it is. These four are what a floor of four would destroy; if someone raises that
   * number again, this fails first and names the decision instead of quietly reverting it.
   */
  t('L72c · three-letter merges are KEPT — John\'s call, and these are what a higher floor costs',
    mergeName('John', 'Zoe') === 'JOE'
      && mergeName('John', 'Kim') === 'JIM'
      && mergeName('John', 'Sam') === 'JAM'
      && mergeName('John', 'Bex') === 'JEX',
    'JOE · JIM · JAM · JEX');

  t('L72b · and the ones worth keeping still come out right',
    mergeName('John', 'Ellie') === 'JELLIE'
      && mergeName('Ellie', 'John') === 'ELLOHN'
      && mergeName('Ozz', 'Mara') === 'OZZARA'
      && mergeName('Ivy', 'Alex') === 'IVALEX',
    'JELLIE · ELLOHN · OZZARA · IVALEX');
}
{
  const phone = await readFile(new URL('../src/views/party-phone.js', import.meta.url), 'utf8');
  const host = await readFile(new URL('../src/views/party-host.js', import.meta.url), 'utf8');
  const play = await readFile(new URL('./jellie-play.mjs', import.meta.url), 'utf8');

  /*
   * 🚨 L73 · THE RECKONING HAZARD CAME BACK. Cutting 'reckoning' from LINK_BEATS killed the rules
   * and left `linkHtml` rendering in the reckoning branch AND under the late-Debrief nominate
   * window — so the phone showed three accusation buttons and, 260px below, the same three names
   * in a green box that did nothing. Worse than before the cut: the dead list teaches the player
   * the phone is stuck, and then they tap the live one.
   */
  /*
   * ⚠️ ANCHOR ON THE RENDER BRANCH, not the first mention of the word. `beat === 'reckoning'`
   * appears earlier in the file in a beat-change guard, so slicing from its first occurrence cut
   * a window that contained neither branch — the assertion was measuring the wrong 200 lines.
   */
  const from = phone.indexOf("} else if (beat === 'reckoning') {");
  const to = phone.indexOf("} else if (beat === 'vote') {");
  const reckBranch = from >= 0 && to > from ? phone.slice(from, to) : '';
  t('L73 · the pair sheet never renders beside a nominate list',
    reckBranch.length > 0
      && /paintNominate\(/.test(reckBranch)
      && !/linkHtml\(/.test(reckBranch)
      && /if \(!debriefNominateOpen\(c\)\) body \+= linkHtml/.test(phone),
    `${reckBranch.length} chars of the Reckoning branch scanned`);

  /*
   * L74 · THE READY COUNT WAS THE FALLBACK. `linkKicker(names, readyKicker(...))` showed the ready
   * line only when NOTHING was happening — so the beat's own end condition vanished from the
   * television the instant anybody reached out.
   */
  /*
   * ⚠️ **THE COUNT IS NOW AN ELEMENT, NOT A KICKER ARGUMENT — the stronger form of L74.** It was
   * a string `readyKicker` folded into the kicker, which is what made it replaceable in the
   * first place; it is now `state`, its own slot in the band, which nothing else is passed into.
   * (And it left the kicker entirely: printing the count in both would have been one fact twice
   * in two sizes — see `party-warm` W37c for the same defect on the Execution.)
   */
  t('L74 · the ready count is its own element, not a fallback that link activity hides',
    /state: readyState\(\)/.test(host)
      && /function readyState/.test(host)
      && /aside: pairBoard\(/.test(host)
      && !/kicker: readyKicker\(/.test(host),
    'pairs on the side board; the count has its own slot');
  t('L74b · and the Debrief lower-third no longer names the expedition runner',
    /who: 'The circle',\s*\r?\n\s*whoSub: 'live · debrief'/.test(host),
    'the biggest thing in the band was about the wrong beat');
  t('L74c · the pair board carries BOTH real names, which the merged plate erases',
    /function pairBoard/.test(host) && /\$\{who\(p\.a\)\} \+ \$\{who\(p\.b\)\}/.test(host));

  /*
   * 🚨 L75 · THE INSTRUMENT. It spawned vite, where the phone dies with a phantom
   * `linkBlock is not defined` and the accept never lands. TWO critics hit it; one nearly filed
   * "the feature is completely broken" against a build where the same accept takes 57ms.
   */
  t('L75 · the play harness serves dist and refuses to run without a build',
    /harness\/serve\.mjs/.test(play)
      && !/vite\/bin\/vite\.js/.test(play)
      && /no dist\/index\.html/.test(play),
    'an instrument that hands a critic a phantom is worse than no instrument');

  t('L76 · the whisper counter resets when the field is cleared',
    /cc\.textContent = WHISPER_MAX \+ ' left'/.test(phone));
  t('L76b · and the pair countdown is on the phone, so an expiring pair is not a crash',
    /data-pair-clock/.test(phone) && /pairRemaining\(mine, Date\.now\(\)\)/.test(phone));
}
{
  const src = await readFile(new URL('../net/party/local.mjs', import.meta.url), 'utf8');
  /*
   * L77 · Both expiries were pure functions nobody called on a clock — a request stood 26s
   * against a 20s limit because no other traffic arrived. The room needed a heartbeat, and it
   * must only broadcast when something actually changed.
   */
  t('L77 · the room has a link heartbeat, and it only fans out on a real change',
    /function startLinkClock/.test(src)
      && /expirePairs\(expirePending\(/.test(src)
      && /!== before\) fanoutLinks\(room\)/.test(src));
  t('L77b · and it is torn down on the beat change, on clearLinks, and on server close',
    (src.match(/stopLinkClock\(room\)/g) || []).length >= 4);
}

/* =============================================================================================
 * L80+ · DONE. John, 2026-08-26: *"the connected pair need a way to end the connection early."*
 *
 * There was an exit — `unlink` — but it is the "I am walking out on you" verb: it spends the
 * leaver's turn. So releasing a slot cost you something, so nobody did it, so a pair that
 * finished in twenty seconds held one of the room's two slots for the other seventy.
 * ============================================================================================= */
{
  const many = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
  const mo = { living: many, beat: 'debrief', names: Object.fromEntries(many.map((p) => [p, p])), now: 1000 };
  const pairUp = (L, a, b) => acceptLink(requestLink(L, a, b, mo), a, b, mo);

  let D = pairUp(freshLinks(), 'p1', 'p2');

  /*
   * 🚨 L80 IS THE RULE THAT MAKES IT DIFFERENT FROM DISCONNECT. One thumb must NOT end it — or
   * DONE is just a politer `unlink` with none of its cost, and somebody who got bored cuts off a
   * partner who is mid-sentence.
   */
  const one = finishPair(D, 'p1');
  t('L80 · one thumb on DONE does not end it — the pair stands and the other half is told',
    one.pairs.length === 1 && isDone(one.pairs[0], 'p1') && !isDone(one.pairs[0], 'p2')
      && !bothDone(one.pairs[0]),
    'their partner sees it and has to agree');

  t('L80b · and it can be taken back — someone who thinks of one more thing is not trapped',
    finishPair(one, 'p1', false).pairs.length === 1
      && !isDone(finishPair(one, 'p1', false).pairs[0], 'p1'));

  const both = finishPair(one, 'p2');
  t('L80c · both thumbs END it, and the slot goes straight back to the room',
    both.pairs.length === 0 && linkBlock(both, 'p3', 'p4', mo) === null,
    'a pair that finishes early hands its slot over');

  /*
   * L80d · SPENT, BUT NOT PUNISHED. Both turns are counted — the conversation happened — which
   * is the same rule as the clock running out. Ending early must not be a way to buy a SECOND
   * conversation, or it becomes the dominant move rather than the generous one.
   */
  t('L80d · both are spent, exactly as if the clock had run out — not a way to buy a second turn',
    usedIds(both).has('p1') && usedIds(both).has('p2')
      && linkBlock(both, 'p1', 'p3', mo) === 'spent'
      && linkBlock(both, 'p3', 'p2', mo) === 'theirs');

  t('L80e · DONE on somebody who is not in a pair changes nothing',
    JSON.stringify(finishPair(D, 'p5')) === JSON.stringify(D));

  /*
   * L80f · the two verbs stay different. `unlink` charges ONLY the leaver and frees the other;
   * `finishPair` charges both and is refused unless both agree. Collapsing them would lose the
   * distinction between abandoning somebody and finishing with them.
   */
  const walked = unlink(D, 'p1');
  t('L80f · DONE and Disconnect remain different verbs',
    usedIds(walked).has('p1') && !usedIds(walked).has('p2')
      && usedIds(both).has('p1') && usedIds(both).has('p2'),
    'walking out charges one; finishing charges both');

  const phone = await readFile(new URL('../src/views/party-phone.js', import.meta.url), 'utf8');
  t('L80g · the phone offers DONE, names the waiting state, and keeps Disconnect separate',
    /id="finish"/.test(phone)
      && /Waiting for them…/.test(phone)
      && /They are done · finish/.test(phone)
      && /Disconnect · ends your turn/.test(phone));
}

/* =============================================================================================
 * L90+ · ROUND FOUR. A critic played three full nights with EIGHT phones and judged the TV and
 * the handsets together at every beat. These are the defects it demonstrated.
 * ============================================================================================= */
{
  /*
   * 🚨 L90 · THE MERGE GUARD LEAKED THROUGH THE NAME CAP. `ok()` compared the candidate to the
   * FULL typed name, but a player wears `slice(0, NAME_CAP)` — so for any name over eight
   * characters the merge could equal that player's own PLATE. Bo pairs with Bartholomew and the
   * television shows BARTHOLO, in green, over both their heads.
   */
  const long = ['Bartholomew', 'MAXIMILIAN', 'Christopher', 'Alexandria', 'Bo', 'Mary-Kate 3'];
  const capOf = (n) => n.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, NAME_CAP);
  const liars = [];
  for (const a of long) for (const b of long) {
    const m = mergeName(a, b);
    if (m === capOf(a) || m === capOf(b)) liars.push(`${a}+${b}=${m}`);
  }
  t('L90 · a merge never equals either player\'s own PLATE, not just their typed name',
    liars.length === 0, liars.slice(0, 4).join(' ') || `${long.length ** 2} long-name pairs clean`);
}
{
  const phone = await readFile(new URL('../src/views/party-phone.js', import.meta.url), 'utf8');
  const host = await readFile(new URL('../src/views/party-host.js', import.meta.url), 'utf8');
  const src = await readFile(new URL('../net/party/local.mjs', import.meta.url), 'utf8');
  const room = await readFile(new URL('../src/party/room.js', import.meta.url), 'utf8');

  /*
   * 🚨 L91 · EVERY PHONE PRINTED A RAW SOCKET ID AT THE MOMENT OF THE EXECUTION. The sheet was
   * handed `nominees`, which `nominationPlayers` filters by `alive` — so the person being
   * executed was already gone from it and `playerName` fell through to the id. Eight phones read
   * **"p7 is out."** while the TV correctly read "MARY-KATE 3 IS OUT."
   */
  t('L91 · the execution sheet names the dead from a list that still contains them',
    /body \+= paintExecution\(players, c\);/.test(phone)
      && !/paintExecution\(nominees/.test(phone));

  /*
   * 🚨 L92 · THE DEAD WERE STILL CASTING. `seatedPlayerIds` is occupancy and has no alive
   * filter by design; `livingSeatedIds` is the one that means "still in the show". An executed
   * player kept being served a casting sheet and kept casting a VALID ballot — the dead helped
   * choose who went into the mansion. They were already blocked from nominating and voting.
   */
  /*
   * ⚠️ SLICE FORWARD FROM THE BRANCH, not between two landmarks. The first version ran from the
   * `ballot` handler to the `lynchVote` one — and `lynchVote` sits EARLIER in the file, so the
   * slice was empty and the assertion failed on nothing. A window built from two `indexOf`s is
   * only a window if you know which comes first.
   */
  const bAt = src.indexOf("msg.t === 'ballot'");
  const ballotBranch = bAt >= 0 ? src.slice(bAt, bAt + 900) : '';
  t('L92 · the dead do not cast — both the voter and the pair they name must be living',
    /livingSeatedIds\(room\)/.test(ballotBranch)
      && /if \(!seated\.has\(self\.playerId\)\) return;/.test(ballotBranch),
    'casting was the one ballot that had no living check');

  /*
   * L93 · A MUTUAL 'DONE' SAID "They disconnected." DONE was built so that ending early costs
   * nothing socially; the copy then charged it anyway, on all four exit paths including the
   * 90-second clock, which is nobody's choice at all.
   */
  t('L93 · finishing together does not read as being walked out on',
    /state\.wasDone \? 'Finished\. Slot back to the room\.' : 'They disconnected\.'/.test(phone));

  /*
   * L94 · THE TV TOLD THE ROOM TO NOMINATE DURING THE VOTE. `nomBoard`'s empty state was the
   * Reckoning's instruction and it rendered on the Vote beat too, where it is impossible. The
   * first fix gated that copy on the beat.
   *
   * ⚠️ **THE COPY IS NOW GONE ENTIRELY, WHICH IS THE STRONGER FORM OF THE SAME GUARANTEE.** An
   * empty board reserved `.talk-side` — a fifth of the television — to print one grey sentence
   * that the kicker under the picture was already saying, so `nomBoard` returns '' when it has
   * no rows and the ballroom takes the width back (`party-warm` W37b). A board that draws
   * nothing when empty cannot ask for a nomination on any beat, correct or otherwise, so this
   * gate now asserts the absence rather than the beat check. `beat` stays in the signature: the
   * Vote and Execution still pass it and it still selects the row styling.
   */
  t('L94 · an empty nomination board draws nothing at all, on every beat',
    /function nomBoard\(standing, names, lobby, beat\)/.test(host)
      && /if \(!rows\) return '';/.test(host)
      && !/Waiting on phones — nominate\./.test(host));

  /*
   * L95 · THE NOMINEE'S BALLOT PROMISED A CHOICE SHE DID NOT HAVE. "Pick one standing nominee,
   * or NO ONE" was printed to the person ON TRIAL, whose only button is NO ONE, and to a table
   * where nobody had been nominated at all.
   */
  t('L95 · the ballot copy matches the buttons actually on the sheet',
    /You are the one on trial/.test(phone)
      && /Nobody was named\. NO ONE is the only ballot\./.test(phone)
      && /standing\.filter\(\(n\) => n\.target !== me\.playerId\)/.test(phone));

  /*
   * 🚨 L96 · NO VOTE WAS EVER ACKNOWLEDGED. `castLynchVote` returns `{ok, choice, why}` and the
   * result was discarded, so "Ballot in" was optimistic local state — a dropped message showed a
   * confirmed ballot over an empty server — and the self-vote coercion to NO ONE was completely
   * invisible to the person who cast it.
   *
   * ⚠️ The receipt is PUSHED to the voter's own socket. It is not a fanout: how the ballot is
   * filling is aired at Execution and must not leak a second before it.
   */
  t('L96 · the server sends the voter a receipt saying what it actually recorded',
    /t: 'ballotOk'/.test(src) && /push\(room, bound\.id, \{\s*\r?\n?\s*t: 'ballotOk'/.test(src)
      && !/fanout\(room, \{ t: 'ballotOk'/.test(src));
  t('L96b · and the phone reports the RECORDED choice, not the tapped one',
    /const b = c\.myBallot;/.test(phone) && /The room recorded/.test(phone)
      && /class="receipt/.test(phone)
      && /this\.myBallot/.test(await readFile(new URL('../src/party/night-client.js', import.meta.url), 'utf8')));

  /* ==========================================================================================
   * ROUND 5 · THE BALLOT COUNT ON THE TELEVISION — and the reason it is only a count.
   *
   * The Vote was the deadest stretch in the night: every ballot in, twenty-two seconds still on
   * the clock, and nothing on the shared screen saying either thing. Casting arms a visible 3·2·1
   * when the last ballot lands and the talk beats print "0 of 5 ready"; the lynch ballot printed
   * neither.
   *
   * ⚠️ **THIS IS THE MOST DANGEROUS FANOUT IN THE GAME AND IT IS ONE LINE FROM BEING A LEAK.**
   * `room.game.state.lynchVotes` is right there, and `{...state.lynchVotes}` on this message would
   * hand the whole room the result twenty-five seconds before the Execution airs it. L100b fires
   * the widened payload at `fanoutViolations` so the closed schema is proven to refuse it rather
   * than assumed to.
   * ========================================================================================== */
  t('L100 · the Vote count is on the wire, and it is a cardinality and a threshold',
    /t: 'tally'/.test(src)
      && /tally: \['t', 'in', 'living', 'need'\]/.test(src)
      && /lynchProgress\(\)/.test(room)
      && fanoutViolations({ t: 'tally', in: 5, living: 8, need: 5 }).length === 0);

  t('L100b control · a tally that carried the votes or the counts is REFUSED, not filtered',
    fanoutViolations({ t: 'tally', in: 5, living: 8, need: 5, votes: [{ voter: 'p1', choice: 'p2' }] }).length > 0
      && fanoutViolations({ t: 'tally', in: 5, living: 8, need: 5, counts: { p2: 3 } }).length > 0
      && fanoutViolations({ t: 'tally', in: 5, living: 8, need: 5, who: ['p1'] }).length > 0
      && fanoutViolations({ t: 'tally', in: 5, living: 8, need: 5, role: 'Producer' }).length > 0);

  /*
   * The count has to survive a refresh. `setShow` fans it on beat entry, which covers everyone
   * already in the room and nobody who arrives after — and "after" includes every reconnect. This
   * is the exact bug that ate three sessions on the READY threshold (N21i).
   */
  t('L100c · a TV that refreshes mid-Vote is pushed the count, not left blank until the next ballot',
    /push\(room, bound\.id, tallyPayload\(room\)\)/.test(src)
      && /fanout\(room, tallyPayload\(room\)\)/.test(src));

  /* And it moves on every ballot, or the board is a still frame that lies for twenty seconds. */
  t('L100d · every ballot moves the count',
    /fanout\(room, tallyPayload\(room\)\);\s*\r?\n\s*return;/.test(src));

  /*
   * 📊 The count itself. Nominators are pre-filled by `assumedLynchVotes` on `enterVote` — their
   * nomination IS their ballot and they are never asked again, so counting them in from the first
   * frame is correct, not a bug. The threshold is the same living majority `tallyVote` uses.
   */
  {
    const g = createRoom({ count: 8, send: () => {} });
    g.beginCasting?.();
    const living = g.state.players.filter((p) => p.alive).map((p) => p.id);
    g.enterReckoning(living);
    g.nominatePlayer(living[0], living[1], living);
    g.enterVote(living);
    const p0 = g.lynchProgress();
    g.castLynchVote(living[2], living[1], living);
    const p1 = g.lynchProgress();
    t('L100e · the nominator is counted in from the first frame; a ballot adds exactly one',
      p0.living === 8 && p0.need === 5 && p0.in === 1 && p1.in === 2,
      `${p0.in} -> ${p1.in} of ${p0.living}, needs ${p0.need}`);
    t('L100f control · the count never exceeds the living and never counts the dead',
      g.lynchProgress().in <= g.lynchProgress().living);
  }
}

console.log(`\nlink-merge: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
