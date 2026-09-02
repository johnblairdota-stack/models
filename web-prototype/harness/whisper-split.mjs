#!/usr/bin/env node
/**
 * 🔒 **whisper-split — THREE SCREENS, ONE SECOND. THE WORDS ARE ON EXACTLY ONE OF THEM.**
 *
 *   node harness/whisper-split.mjs
 *
 * ---------------------------------------------------------------------------------------------
 * 🪜 WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------------
 * `docs/design/COUCH-PLAN.md`, Rung 3 (CLUE COMES HOME), whisper half:
 *
 *   > Two players pair in public. The words stay on two phones forever; the room sees only the
 *   > shape (who asked, who said yes, how long). **Proof is three screens from one second:
 *   > partner pad shows the words, a third pad shows nothing, the TV shows nothing.**
 *
 * Every piece of that was already argued, designed and half-guarded, and NOTHING had ever taken
 * the photograph. `link-merge` L10-L14 prove the privacy STRUCTURALLY — `whisperAudience` returns
 * two ids, `fanoutViolations` refuses the verb `whisper` outright, the pair route pushes to socket
 * ids. Those are the right assertions and they are about the wire. They say nothing at all about
 * what is on a SCREEN, and a screen is what a player in a living room actually reads.
 *
 * The gap that leaves is not theoretical. Both chromes are template literals inside a browser
 * view, so the only way anybody had ever checked "the partner pad shows the words and the third
 * pad does not" was to open six tabs and look. Blind play never covered it — `CRITIC-blind-play`
 * has 18 episodes and not one whisper in them.
 *
 * ---------------------------------------------------------------------------------------------
 * 📸 WHAT THIS GATE ACTUALLY DOES — a real server, real sockets, one frozen second
 * ---------------------------------------------------------------------------------------------
 * No mock, no fake links object, no source grep standing in for behaviour:
 *
 *   1. `startServer` on port 5347. One television (`&host=1`) and EIGHT handsets, the couch shape.
 *   2. Deal, cast, and walk into DEBRIEF through the real beat door (`BEAT_DOOR.debrief`), which
 *      is the only beat pairing is legal in (`LINK_BEATS`, `link-merge` L60).
 *   3. Two handsets take the names John and Ellie and pair over the wire. They become JELLIE.
 *   4. John types one line and sends it. **T0 is that instant.**
 *   5. One second later everything freezes. Each of the nine sockets is rendered as the screen its
 *      owner is looking at, from ONLY the frames that reached it inside `[T0, T0+1000]`.
 *
 * The screens are rendered by the SHIPPED chrome, not by a copy of it: `whisperLines` is what
 * `party-phone.js`'s `whisperListHtml` calls, and `pairShape` is what `party-host.js`'s
 * `pairBoard` calls. That is why both halves were lifted into `src/party/link.js` — a chrome
 * locked inside a view closure can only be quoted from a browser, and this is a node gate.
 *
 * ---------------------------------------------------------------------------------------------
 * ⚠️ THE TWO WAYS A GATE LIKE THIS PASSES FOR THE WRONG REASON, AND WHAT STOPS EACH
 * ---------------------------------------------------------------------------------------------
 *   **"Nothing leaked because nothing happened."** A whisper that never landed leaks nowhere.
 *   WS0 is the arm: nine live sockets, a real pair, the beat is debrief, and the send reached
 *   EXACTLY two sockets. If any of that is false the run is not evidence of anything.
 *
 *   **"The scanner stopped matching."** Every "0 hits" row below is worth exactly as much as the
 *   needle is. WS4b is the ablation: the same scanner, same needle, run over the SENDER's stream,
 *   where the words provably are. It must hit. If somebody re-words the secret, changes the
 *   encoding, or breaks the capture, WS4b goes red first and names the instrument instead of
 *   letting six silent zeroes read as a clean bill of health. Same lesson as `nom-receipt` NR9c.
 *
 * ---------------------------------------------------------------------------------------------
 * 🧱 WALLS THIS LEANS ON (owned elsewhere, re-fired here because the claim rests on them)
 * ---------------------------------------------------------------------------------------------
 *   `link-merge` L10-L14  a whisper is NOT a fanout; L11 forces the refusal
 *   `party-isolation` I1c  a wire field with no matrix row is a red line
 *   `party-sockets` S4     no socket receives another socket's private event
 *
 * ---------------------------------------------------------------------------------------------
 * 🩸 FIRED AGAINST A DELIBERATELY BROKEN ARM, 2026-08-31 — `applyWhisper`'s two-id loop replaced
 * by `for (const sid of room.conns.keys())`, i.e. the words pushed to every socket in the room:
 *
 *     20 passed, 3 failed
 *     THIRD PAD    Robot 5   <p class="whisper">ADA CALLED THE LEFT WALL AND THE NAIL WAS EMPTY</p>
 *     WS2  FAIL  1 whisper frames on an eight-player table
 *     WS3  FAIL  THE WORDS ARE IN THE TV STREAM · the TV was sent a whisper frame
 *     WS4  FAIL  9/9 streams carry it: TV + John + Ellie + Robot 3 … Robot 8
 *
 * WS0-WS0e, WS1, WS4b and WS4d stayed GREEN in that arm. That is deliberate and it is what makes
 * the failure readable: the arms say the night really happened, the control says the scanner
 * really works, and the three red rows say exactly which screens are carrying words they must not.
 * ============================================================================================= */

import {
  startServer, livingSeatedIds, fanoutViolations, roomLinks,
} from '../net/party/local.mjs';
import {
  whisperLines, pairShape, shapeLeaks, pairOf, mergeName, WHISPER_KEEP, SHAPE_KEYS, PAIR_MS,
  isLinkBeat, LINK_BEATS, publicLinks, whisperAudience,
} from '../src/party/link.js';
import { readFile } from 'node:fs/promises';

const PORT = 5347;                    // 5343 is `link-merge`'s crash arm; nothing else is near.
const PHONES = 8;                     // the couch shape: eight handsets and one television
const WINDOW_MS = 1000;               // "one second", and the whole point of the file

/**
 * 🔑 THE SECRET. Deliberately written the way a real accusation is — this is the Rung 3 sentence,
 * a runner quoting the twin-painting job at their partner.
 *
 * ⚠️ **NO `< > & " '` IN IT, ON PURPOSE.** The phone escapes with `esc()` before it renders, so a
 * secret containing HTML-special characters would make the rendered quote below differ from the
 * raw needle and the two halves of this gate would be measuring different strings. Plain text
 * means `esc` is the identity here and the quote IS the pad's own line, character for character.
 */
const SECRET = 'ADA CALLED THE LEFT WALL AND THE NAIL WAS EMPTY';

/**
 * 🔇 THE DECOY. An UNPAIRED handset shouting `whisper` at the server in the same second.
 *
 * This is the fail-closed direction fired for real. `link-merge` L10b asserts it against the pure
 * rules — `whisperAudience` returns `[]` for someone who is not in a pair — and the dangerous bug
 * is the other default, an empty audience read as "no filter", i.e. everybody. That bug cannot be
 * seen from the rules; it lives in whatever loops over the audience. So a ninth phone types a
 * sentence nobody asked for and it must land on ZERO screens, its own included.
 */
const DECOY = 'I AM NOT IN A PAIR AND THIS SHOULD REACH NOBODY';

let pass = 0, fail = 0;
const t = (n, c, d = '') => {
  if (c) { pass++; console.log(`  ok   ${n}${d ? ` · ${d}` : ''}`); }
  else { fail++; console.log(`  FAIL ${n}${d ? ` · ${d}` : ''}`); }
  return !!c;
};
const say = (s) => console.log(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('\nwhisper-split — three screens, one second, and the words are on one of them\n');

/* =============================================================================================
 * THE HANDSET. Every frame is kept with the millisecond it arrived AND its raw text, because the
 * two halves of this gate ask different questions of it: the chrome is rendered from the parsed
 * messages, and the leak scan is run over the bytes. A parse that silently dropped a field would
 * hide a leak from the first question; the second one cannot be fooled that way.
 * ============================================================================================= */
function open(url) {
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    const frames = [];
    const box = {
      ws, frames, welcome: null,
      send: (o) => ws.send(JSON.stringify(o)),
      close: () => ws.close(),
      /** Frames that had arrived by `until` — this is what "one second" means. */
      upTo: (until) => frames.filter((f) => f.at <= until),
      raw: () => frames.map((f) => f.raw).join('\n'),
    };
    ws.onmessage = (e) => {
      const raw = String(e.data);
      let msg = null; try { msg = JSON.parse(raw); } catch { /* keep the bytes anyway */ }
      frames.push({ at: Date.now(), raw, msg });
      if (msg && (msg.t === 'welcome' || msg.t === 'full')) { box.welcome = msg; resolve(box); }
    };
    ws.onerror = () => resolve(box);
    setTimeout(() => resolve(box), 1500);
  });
}

/* =============================================================================================
 * THE SCREENS. Both call the shipped chrome. Neither re-implements it.
 * ============================================================================================= */

/** The phone's `esc`, and the SECRET is chosen so it never has to do anything. See its note. */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * ONE PAD'S WHISPER LOG, exactly as `party-phone.js` builds and renders it.
 *
 * The accumulate step is `party-phone.js:195` (`if (m.t === 'whisper') state.whispers.push(...)`)
 * and the render step is `whisperListHtml`, which is `whisperLines` plus `esc`. A pad that was
 * never sent a whisper frame produces the empty string, which is the third pad's whole screen.
 */
function padWhisperScreen(box, until) {
  const me = box.welcome?.playerId;
  const whispers = box.upTo(until)
    .filter((f) => f.msg?.t === 'whisper')
    .map((f) => ({ from: f.msg.from, text: f.msg.text, at: f.msg.at }));
  const html = whisperLines(whispers, me).map((w) =>
    `<p class="whisper${w.mine ? ' me' : ''}">${esc(w.text)}</p>`).join('');
  return { whispers, html, lines: whisperLines(whispers, me) };
}

/**
 * THE TELEVISION'S CONNECTIONS BOARD, from the last `t:'links'` fanout it was sent.
 *
 * `pairBoard`'s inputs are `client.links`, the lobby names and `ui.refusals` — and `client.links`
 * is verbatim the payload captured here. That matters more than it looks: the television cannot
 * print a word it was never sent, so rendering the board from the captured fanout is not an
 * approximation of the TV screen, it is a complete account of what that screen is able to say.
 */
function tvBoardScreen(box, until, names) {
  const linkFrames = box.upTo(until).filter((f) => f.msg?.t === 'links');
  const links = linkFrames.length ? linkFrames[linkFrames.length - 1].msg : null;
  const who = (id) => names[id] || 'Someone';
  const rows = (links?.pairs || []).map((p) => {
    const s = pairShape(p, until);
    const done = s.doneA && s.doneB ? ' · done'
      : (s.doneA || s.doneB) ? ` · ${who(s.doneA ? p.a : p.b)} is done` : '';
    return { s, line: `${s.name} — ${who(p.a)} + ${who(p.b)} — held ${s.heldSec}s${done}` };
  });
  const waiting = (links?.pending || []).map((r) => `${who(r.from)} — reaching out to ${who(r.to)}`);
  return { links, rows, waiting, payload: linkFrames.length ? linkFrames[linkFrames.length - 1].raw : '' };
}

/** Does this socket's whole received stream contain the words, anywhere, in any frame? */
const leaked = (box) => box.raw().includes(SECRET);

/* =============================================================================================
 * THE NIGHT.
 * ============================================================================================= */
const srv = startServer({ port: PORT, count: 8, castSeed: 17, worldSeed: 4, code: 'wsp' });
await sleep(140);

const base = `ws://localhost:${PORT}/?room=wsp`;
const tv = await open(`${base}&host=1`);
const phones = [];
for (let i = 0; i < PHONES; i++) phones.push(await open(base));
await sleep(120);

/*
 * Names first, so the merge is the one John asked for by name (`link-merge` L1). A board reading
 * JELLIE is also the strongest possible evidence for WS3b: it is a word neither player typed and
 * neither player is called, so it can only have come off the public pair.
 */
phones[0].send({ t: 'name', name: 'John' });
phones[1].send({ t: 'name', name: 'Ellie' });
for (let i = 2; i < PHONES; i++) phones[i].send({ t: 'name', name: `Robot ${i + 1}` });
await sleep(90);

tv.send({ t: 'start' });
await sleep(70);
tv.send({ t: 'casting' });
await sleep(90);
// The real door, not a repaint — `show-beat` is the gate that this is a transition.
tv.send({ t: 'show', beat: 'debrief' });
await sleep(140);

const room = srv.rooms.get('wsp');
const JOHN = phones[0].welcome?.playerId;
const ELLIE = phones[1].welcome?.playerId;
const THIRD_I = 4;                                  // an ordinary seated handset, in the room
const third = phones[THIRD_I];

const names = {};
for (const p of room.game.state.players) names[p.id] = p.name;

phones[0].send({ t: 'link', to: ELLIE });
await sleep(110);
phones[1].send({ t: 'link', accept: JOHN });
await sleep(140);

const pair = pairOf(roomLinks(room), JOHN);

/* ------------------------------------------------------------------ T0. One line goes out. */
const T0 = Date.now();
const audience = whisperAudience(roomLinks(room), JOHN);   // the server's own rule, before the send
const noAudience = whisperAudience(roomLinks(room), third.welcome?.playerId);
phones[0].send({ t: 'whisper', text: SECRET });     // John, to Ellie, over the real wire
third.send({ t: 'whisper', text: DECOY });          // and an unpaired pad shouting into the void
await sleep(WINDOW_MS);
const T1 = T0 + WINDOW_MS;                          // 🧊 the frozen second

/* =============================================================================================
 * WS0 · THE ARM. Everything below is worthless if the night did not happen.
 * ============================================================================================= */
{
  const live = livingSeatedIds(room);
  t('WS0 arm · nine live sockets, eight of them seated handsets',
    tv.welcome != null && phones.every((p) => p.welcome?.playerId) && live.length === PHONES,
    `${live.length} seated + 1 television`);
  t('WS0b arm · the room is in DEBRIEF, the one beat a pair is legal in',
    room.show === 'debrief' && isLinkBeat(room.show) && LINK_BEATS.join(',') === 'debrief',
    `beat=${room.show}`);
  t('WS0c arm · John and Ellie are really paired, and the room calls them JELLIE',
    !!pair && pair.name === mergeName('John', 'Ellie') && pair.name === 'JELLIE',
    pair ? `${names[pair.a]} + ${names[pair.b]} = ${pair.name}` : 'no pair');
  /*
   * The route RESOLVES to somewhere. A whisper that went nowhere would satisfy every privacy row
   * in this file and prove nothing at all — this is the row that stops that. Read off the server's
   * own rule BEFORE the send, so it is not the same measurement WS4 makes on the nine streams.
   */
  t('WS0d arm · the server\'s route for John resolves to exactly the two in the pair',
    audience.length === 2 && audience.includes(JOHN) && audience.includes(ELLIE),
    `audience = ${audience.map((id) => names[id]).join(' + ') || 'nobody'}`);
  t('WS0e arm · and to NOBODY for the unpaired pad that is about to shout — not to everybody',
    noAudience.length === 0,
    `${names[third.welcome?.playerId]} is in no pair; audience = ${noAudience.length}`);
}

/* =============================================================================================
 * WS1-WS3 · THE PHOTOGRAPH. Three screens, quoted, from the same second.
 * ============================================================================================= */
const partner = padWhisperScreen(phones[1], T1);
const outsider = padWhisperScreen(third, T1);
const tvScreen = tvBoardScreen(tv, T1, names);

say('');
say(`  ── ONE SECOND, FROZEN AT T0+${WINDOW_MS}ms ─────────────────────────────────`);
say(`  PARTNER PAD  ${names[ELLIE]}   ${partner.html || '(nothing)'}`);
say(`  THIRD PAD    ${names[third.welcome?.playerId]}   ${outsider.html || '(nothing)'}`);
say(`  TELEVISION   ${tvScreen.rows.map((r) => r.line).join(' | ') || '(no connections)'}`);
say('  ────────────────────────────────────────────────────────────────────');
say('');

{
  const want = `<p class="whisper">${SECRET}</p>`;
  t('WS1 · THE PARTNER PAD HAS THE WORDS — rendered by the pad\'s own chrome',
    partner.html === want && partner.lines.length === 1 && partner.lines[0].text === SECRET,
    partner.html || '(nothing)');
  /*
   * ⚠️ AND IT IS NOT MARKED AS THEIR OWN. `whisperLines` sets `mine` off `from`, which is how the
   * pad styles the two sides of the conversation apart. Ellie reading her own line back as if she
   * had typed it would be a different and quieter bug, invisible to any leak check.
   */
  t('WS1b · and the pad knows it came from the OTHER half of the pair',
    partner.lines[0]?.mine === false,
    `from=${partner.whispers[0]?.from === JOHN ? 'John' : '?'} · rendered without .me`);
}

{
  t('WS2 · A THIRD PAD SHOWS NOTHING — not a blank bubble, not a redaction, nothing',
    outsider.html === '' && outsider.lines.length === 0 && outsider.whispers.length === 0,
    `${outsider.whispers.length} whisper frames on an eight-player table`);
  /*
   * The third pad is a LIVE pad in the same beat, not a socket that fell over. Without this the
   * row above could be satisfied by a phone that had simply stopped receiving anything.
   */
  const heard = third.upTo(T1).length;
  t('WS2b · while that same pad is wide awake in the same beat',
    heard > 0 && third.upTo(T1).some((f) => f.msg?.t === 'links'),
    `${heard} frames received, links fanout among them`);
}

{
  /*
   * ⚠️ THREE SEPARATE REASONS, NAMED SEPARATELY IN THE DETAIL. The first version printed one
   * cheerful summary line whatever failed, so a television carrying the words reported
   * "0 whispers, no text key" underneath a red row — a gate that describes the wrong world while
   * failing is a gate somebody edits until it agrees with whatever shipped.
   */
  const tvBytes = tv.raw();
  const tvWhy = [
    tvBytes.includes(SECRET) ? 'THE WORDS ARE IN THE TV STREAM' : null,
    tv.frames.some((f) => f.msg?.t === 'whisper') ? 'the TV was sent a whisper frame' : null,
    /"text"/.test(tvScreen.payload) ? 'the links payload grew a text key' : null,
  ].filter(Boolean);
  t('WS3 · THE TELEVISION SHOWS NOTHING OF WHAT WAS SAID',
    tvWhy.length === 0,
    tvWhy.length ? tvWhy.join(' · ')
      : `${tv.frames.length} frames to the TV, 0 whispers, no text key on the links payload`);

  /*
   * 🍮 WS3b IS THE OTHER HALF OF THE MECHANIC AND IT IS NOT A PRIVACY ROW. A television that
   * showed nothing at all would pass WS3 and would have deleted the game: the room is supposed to
   * watch John reach out to Ellie and see them become JELLIE. The shape is three facts —
   * `COUCH-PLAN.md` Fun: *"who asked, who said yes, how long they held, who tapped DONE early."*
   * "How long" is the one that was missing until this rung; see `pairBoard`.
   */
  const row = tvScreen.rows[0];
  t('WS3b · but it DOES show the shape — who asked, who said yes, and how long they have held',
    !!row && row.line.includes('JELLIE') && row.line.includes('John') && row.line.includes('Ellie')
      && /held \d+s/.test(row.line) && row.s.heldSec >= 1,
    row ? row.line : '(no connections board)');
  t('WS3c · and the order still says who reached out first',
    row?.s.a === JOHN && row?.s.b === ELLIE && tvScreen.rows.length === 1,
    'John asked; Ellie said yes');
}

/* =============================================================================================
 * WS4 · THE BYTES. The whole run, not just the frozen second — a leak that arrives late is still
 * a leak, and this is the row a fanout regression trips.
 * ============================================================================================= */
{
  const streams = [
    ['TV', tv],
    ...phones.map((p, i) => [`${names[p.welcome?.playerId] || `phone${i}`}`, p]),
  ];
  const hits = streams.filter(([, b]) => leaked(b)).map(([n]) => n);
  t('WS4 · the words are in exactly TWO of the nine streams, and they are the pair',
    hits.length === 2 && hits.includes('John') && hits.includes('Ellie'),
    `${hits.length}/9 streams carry it: ${hits.join(' + ')}`);

  /*
   * 🔬 WS4b · THE ABLATION. Six of the rows above are "0 hits", and a zero is only worth what the
   * needle is worth. This fires the SAME scanner at a stream the words are provably in. If it
   * comes back empty the instrument is broken, and this row says so instead of letting the whole
   * file pass as a clean bill of health. `nom-receipt` NR9c is the same idea one layer down.
   */
  t('WS4b control · the same scanner, fired where the words really are, HITS',
    leaked(phones[0]) && phones[0].raw().split(SECRET).length - 1 >= 1,
    `the sender's own stream carries it ${phones[0].raw().split(SECRET).length - 1}×`);

  /*
   * 🔇 WS4d · THE DECOY, FIRED FOR REAL. An unpaired handset sent a sentence in the same second.
   * `whisperAudience` returns `[]` for it (WS0e), and the failure this catches is the one that
   * rule cannot see: an empty audience treated downstream as "no filter". Zero of nine streams —
   * and note that includes the sender's OWN, because the server addresses the pair by id rather
   * than echoing to whoever asked.
   */
  const decoyHits = streams.filter(([, b]) => b.raw().includes(DECOY)).map(([n]) => n);
  t('WS4d · an UNPAIRED pad shouting a whisper reaches nobody at all — not everybody',
    decoyHits.length === 0,
    `0/9 streams carry the decoy${decoyHits.length ? `: ${decoyHits.join(' ')}` : ''}`);

  /*
   * 🗄️ WS4c · "FOREVER" MEANS THE SERVER DOES NOT KEEP THEM EITHER. `applyWhisper` builds the
   * message, pushes it to two socket ids and lets it go — nothing is written to the game state,
   * the links state, or the room. A whisper that survived in a season log would reach the Reunion,
   * a replay, and every gate that reads a night's JSON.
   */
  const kept = JSON.stringify({ state: room.game.state, links: room.links, show: room.show });
  t('WS4c · the SERVER does not keep the words either — nothing in state, links or the room',
    !kept.includes(SECRET) && !/whisper/i.test(JSON.stringify(publicLinks(room.links))),
    `${kept.length} chars of server state scanned`);
}

/* =============================================================================================
 * WS5 · THE STRUCTURE. Behaviour above; here is why it cannot come back by accident.
 * ============================================================================================= */
{
  /*
   * The wall this whole file stands on, re-fired: `t:'whisper'` is not a narrowed broadcast, it is
   * a verb the fanout validator does not know. `link-merge` L11 owns it; if it ever goes green
   * while this goes red, the two files disagree and that is worth knowing here.
   */
  const w = { t: 'whisper', from: JOHN, text: SECRET, at: T0 };
  t('WS5 wall · the fanout validator still refuses a whisper outright (link-merge L11)',
    fanoutViolations(w).length > 0,
    fanoutViolations(w).join(','));

  /*
   * 🚫 WS5b · THE TV HALF'S OWN CLOSED SCHEMA. `pairShape` is what the television prints, and the
   * obvious future mistake is somebody adding "and the last line said…" to the connections board
   * because the data is right there on the pad. `shapeLeaks` refuses any key that is not one of
   * `SHAPE_KEYS`, and refuses a `name` that is not a generated merge — the merged word is the one
   * string on that board and it is machine-made, never typed.
   */
  const shape = pairShape(pair, T1);
  t('WS5b · the public shape carries ids and numbers, and its schema refuses a text field',
    shapeLeaks(shape).length === 0
      && shapeLeaks({ ...shape, text: SECRET }).length > 0
      && shapeLeaks({ ...shape, said: 'hi' }).length > 0
      && shapeLeaks({ ...shape, name: SECRET }).length > 0,
    `keys: ${SHAPE_KEYS.join(' ')}`);

  t('WS5c · and the two clocks come off one public `at`, counting opposite ways',
    shape.heldSec + Math.floor((shape.secs * 1000) / 1000) <= PAIR_MS / 1000
      && shape.secs > 0 && shape.heldSec >= 1,
    `held ${shape.heldSec}s · ${shape.secs}s left of ${PAIR_MS / 1000}s`);
}

/* =============================================================================================
 * WS6 · THE QUOTE IS THE SHIPPED CHROME. The screens above were rendered by `whisperLines` and
 * `pairShape`; these rows are the proof that the two views call the same two functions, so the
 * photograph is of the product rather than of the harness.
 * ============================================================================================= */
{
  const phone = await readFile(new URL('../src/views/party-phone.js', import.meta.url), 'utf8');
  const host = await readFile(new URL('../src/views/party-host.js', import.meta.url), 'utf8');

  t('WS6 · the PAD renders its private half through `whisperLines`',
    /whisperLines\(state\.whispers, meId\(\)\)/.test(phone)
      && /class="whisper\$\{w\.mine \? ' me' : ''\}"/.test(phone)
      && /whisperLines/.test(phone.slice(0, phone.indexOf('\n\n', phone.indexOf('party/link.js')))),
    `kept to the last ${WHISPER_KEEP} lines, in the pad's own closure`);

  t('WS6b · the TELEVISION renders its public half through `pairShape`, and prints how long',
    /pairShape\(p, Date\.now\(\)\)/.test(host)
      && /held \$\{s\.heldSec\}s/.test(host)
      && /data-pair-held/.test(host),
    'the third fact of the shape is on the board');

  /*
   * ⚠️ IN PLACE, NEVER THROUGH `paint()`. `party-host.js`'s `paint()` rebuilds `root.innerHTML`,
   * and a held-timer that repainted would strobe the whole television four times a second through
   * a five-minute Debrief. Same rule the pad's `[data-pair-clock]` already lives by, and the same
   * rule the react strip learned the hard way (`react-pad` R42c).
   */
  const tickFrom = host.indexOf('function startClockTick');
  const tick = tickFrom >= 0 ? host.slice(tickFrom, host.indexOf('\n  }', tickFrom)) : '';
  t('WS6c · and the held-timer is written IN PLACE on the existing tick, not by a repaint',
    tick.length > 0 && /data-pair-held/.test(tick) && /el\.textContent = `held/.test(tick),
    `${tick.length} chars of startClockTick scanned`);

  /*
   * 🚫 WS6d · THE PAD'S HALF MUST NOT REACH THE TELEVISION'S FILE. This is the cheap structural
   * version of WS3, and it is the one that catches a well-meaning future edit: the moment
   * `party-host.js` imports `whisperLines`, somebody is about to put words on the big screen.
   */
  t('WS6d · `party-host.js` cannot even read a whisper — it never imports the private half',
    !/whisperLines/.test(host) && !/state\.whispers/.test(host) && !/'whisper'/.test(host),
    'the TV file has no way to render a word a player typed');
}

/* ------------------------------------------------------------------------------- shut it down */
for (const c of [tv, ...phones]) c.close();
await Promise.race([srv.close(), new Promise((r) => setTimeout(r, 3000))]);

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
