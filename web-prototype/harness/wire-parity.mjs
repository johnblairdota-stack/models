#!/usr/bin/env node
/**
 * 🔌 **wire-parity — WHAT ONE SIDE SENDS IS WHAT THE OTHER SIDE READS, AT EVERY SEAM.**
 *
 *   node harness/wire-parity.mjs
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 **A MODEL MAY STAND IN FOR SOMETHING THAT DOES NOT EXIST YET. IT MAY NEVER STAND IN FOR
 * SOMETHING THAT DOES.**
 * ---------------------------------------------------------------------------------------------
 * That is the rule this suite was missing, and it is why this file exists. Four separate Fatal
 * bugs have now survived a fully green suite, every one of them because a gate measured a model
 * or a hand-built artefact instead of the code:
 *
 *   · `party-sim` runs its OWN six-room expedition, so a parity-locked wing — the Hunter could
 *     never be in the room the runner walked into, at any seed, ever — was invisible to it.
 *   · `win.js` consumes `phase.CASTING`'s `episode`; `room.js` emitted `phase.CASTING` with `{}`,
 *     so the win machine's episode counter read 1 for ever over that room's logs and W5 could not
 *     fire. `win-machine` passed W5 by hand-constructing a payload the engine has never produced.
 *   · `show.mjs` emits `{t:'brief'}` to the sim socket; `views/expedition.js` handles only
 *     `drive` and `cams`; nothing emits `cams`; and the brief's field is `cameras` while the
 *     handler reads `m.unlocked`. Both ends were tested, separately, and both were green.
 *   · `shot-solver`'s browser sweep renders a hand-written frame missing 19 paths the real frame
 *     carries.
 *
 * Every one is the same shape: **two halves of a seam, each asserted against its own idea of the
 * other half.** So this gate never asks what a side is supposed to send. It reads what the
 * producer ACTUALLY emits — by running it where it can be run, and by reading its source where it
 * cannot — and what the consumer ACTUALLY reads, and requires the two sets to agree in both
 * directions. An extra on either side is a bug: a message nobody handles is dead traffic, and a
 * handler nothing feeds is dead code that reads as coverage.
 *
 * ---------------------------------------------------------------------------------------------
 * THE FOUR SEAMS
 * ---------------------------------------------------------------------------------------------
 *   show -> sim        `show.mjs`'s `briefFor` and `{t:'drive'}`   ->  `views/expedition.js`'s
 *                                                                     `sock.onmessage`
 *   sim -> show        `views/expedition.js`'s `send()`            ->  `session.js`'s `simReport`
 *   session -> log     `session.js` / `room.js` `record()`         ->  `win.js`'s `foldWin`,
 *                                                                     `reunion.js`
 *   session -> frame   `session.js` `fullFor` + `project()`        ->  `show-tv.html`,
 *                                                                     `show-phone.html`
 *
 * ⚠️ **`src/views/expedition.js`, `net/party/show-tv.html` AND `net/party/show-phone.html` ARE
 * READ HERE AND NEVER WRITTEN.** They belong to the television build. If this gate goes red
 * against one of them that is a correct result and a message to their author, not a licence for
 * this file's author to edit them.
 *
 * ⚠️ **WHERE A DIRECTION IS EXEMPTED, THE EXEMPTION IS A NAMED LIST WITH A REASON AND AN ARM THAT
 * KEEPS IT HONEST.** Two of the eight directions have legitimate slack — a consumer written ahead
 * of its producer, and a frame field that is on the wire for a reason other than a screen. Both
 * are enumerated below, each entry argued, and each list is armed: if an entry stops being true
 * the arm goes red, so the list cannot quietly grow into cover.
 *
 * ⚠️ SEAM 3 IS ASSERTED IN ONE DIRECTION ON PURPOSE AND THIS IS THE ARGUMENT. `log.reunion()` IS
 * `log.all()` — the Reunion replays the entire stream — so *every* event has a consumer by
 * construction and "emitted but never read" is not a statement that can fail. The direction that
 * can, and did, is consumer -> producer: a rule that reads a type nobody writes, or a field one
 * producer of that type omits.
 */

import { readFileSync } from 'node:fs';
import { createSession, CALL, MOVE_CHOICE } from '../src/party/session.js';
import { createRoom } from '../src/party/room.js';
import { PHASE } from '../src/party/phases.js';
import { ROOMS } from '../src/party/coverage.js';

let pass = 0, fail = 0;
const t = (n, c, d = '') => { if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); } else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); } return c; };

const src = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
/** Comments are prose about the wire, not the wire. Every scan below runs on stripped source. */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
const only = (a, b) => [...a].filter((x) => !b.has(x));
const setOf = (xs) => new Set(xs);

// =============================================================================================
// the extractors
// =============================================================================================

/**
 * Every `t:` value and every field of the object literals a producer hands to a socket.
 * Returned as `Map<type, Set<fieldPath>>`, with nested one level (`runner.x`) because that is the
 * depth the seams actually use and the depth `simReport` reads at.
 */
function literalMessages(text, callRe) {
  const out = new Map();
  for (const m of text.matchAll(callRe)) {
    const body = balanced(text, m.index + m[0].lastIndexOf('{'));
    if (body == null) continue;
    const type = (body.match(/\bt:\s*'([^']+)'/) || [])[1];
    if (!type) continue;
    const fields = new Set();
    for (const [, key, rest] of topLevelPairs(body)) {
      fields.add(key);
      if (rest.trim().startsWith('{')) {
        const inner = balanced(rest, rest.indexOf('{'));
        if (inner != null) for (const [, k2] of topLevelPairs(inner)) fields.add(`${key}.${k2}`);
      }
    }
    fields.delete('t');
    if (!out.has(type)) out.set(type, new Set());
    for (const f of fields) out.get(type).add(f);
  }
  return out;
}

/** The text inside the braces starting at `at`, brace-matched, string-aware enough for this tree. */
function balanced(text, at) {
  if (text[at] !== '{') return null;
  let depth = 0;
  for (let i = at; i < text.length; i++) {
    const c = text[i];
    if (c === "'" || c === '"' || c === '`') { i = skipString(text, i); continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (!depth) return text.slice(at + 1, i); }
  }
  return null;
}
function skipString(text, at) {
  const q = text[at];
  for (let i = at + 1; i < text.length; i++) {
    if (text[i] === '\\') { i++; continue; }
    if (text[i] === q) return i;
  }
  return text.length;
}

/**
 * The innermost `{ ... }` block containing index `i`, as `[start, body]`. Scoping an alias to its
 * own block is what keeps `const c = frame.call` in one render function from colouring
 * `const c = frame.cameras` in the next one — which it did, and which produced a phantom
 * `frame.call.unlocked` that no page has ever read.
 */
function enclosingBlock(text, i) {
  const stack = [];
  for (let k = 0; k < i; k++) {
    const c = text[k];
    if (c === "'" || c === '"' || c === '`') { k = skipString(text, k); continue; }
    if (c === '{') stack.push(k);
    else if (c === '}') stack.pop();
  }
  if (!stack.length) return [0, text];
  const at = stack[stack.length - 1];
  const body = balanced(text, at);
  return body == null ? [0, text] : [at + 1, body];
}

/**
 * The scope a `<var>.type === '<type>'` test governs.
 *
 * ⚠️ THE SCOPE IS THE STATEMENT OR THE CALLBACK, NEVER A WINDOW OF CHARACTERS. A first draft read
 * 400 characters past each test and attributed a field three lines below it to the wrong event —
 * a false positive that would have had to be widened away, and a gate whose band gets widened to
 * make it green is the failure mode this entire file is about. The innermost parentheses around
 * the test are its scope, unless they are an `if`/`while`/`for` condition, in which case the
 * statement that condition guards is.
 */
function testScope(text, i) {
  const stack = [];
  for (let k = 0; k < i; k++) {
    const c = text[k];
    if (c === "'" || c === '"' || c === '`') { k = skipString(text, k); continue; }
    if (c === '(') stack.push(k);
    else if (c === ')') stack.pop();
  }
  if (stack.length) {
    const at = stack[stack.length - 1];
    const before = text.slice(0, at).replace(/\s+$/, '');
    if (!/\b(if|while|for|switch)$/.test(before)) {
      const group = balancedParen(text, at);
      if (group != null) return group;
    }
  }
  const lineEnd = text.indexOf('\n', i);
  const line = text.slice(text.lastIndexOf('\n', i) + 1, lineEnd < 0 ? text.length : lineEnd);
  if (/\{\s*$/.test(line)) {
    const body = balanced(text, text.indexOf('{', i));
    if (body != null) return line + body;
  }
  return line;
}

/** `balanced`, for parentheses. */
function balancedParen(text, at) {
  if (text[at] !== '(') return null;
  let depth = 0;
  for (let i = at; i < text.length; i++) {
    const c = text[i];
    if (c === "'" || c === '"' || c === '`') { i = skipString(text, i); continue; }
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (!depth) return text.slice(at + 1, i); }
  }
  return null;
}

/** `[whole, key, restOfValue]` for each key at depth 0 of an object-literal body. */
function* topLevelPairs(body) {
  let depth = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === "'" || c === '"' || c === '`') { i = skipString(body, i); continue; }
    if (c === '{' || c === '[' || c === '(') { depth++; continue; }
    if (c === '}' || c === ']' || c === ')') { depth--; continue; }
    if (depth !== 0) continue;
    const m = /^([A-Za-z_$][\w$]*)\s*(:|,|\s*$)/.exec(body.slice(i));
    if (!m) continue;
    const before = body.slice(0, i).replace(/\s+$/, '');
    if (before && !/[,{]$/.test(before)) continue;
    if (m[2] === ':') { yield [m[0], m[1], body.slice(i + m[0].length)]; }
    else { yield [m[0], m[1], '']; }               // shorthand — `clock,`
    i += m[1].length;
  }
}

/** Every leaf path of an object, arrays normalised to `[]`. Same shape as entitle.js's walker. */
function leafPaths(o, pre = '', out = new Set()) {
  if (o === null || typeof o !== 'object') { out.add(pre); return out; }
  if (Array.isArray(o)) {
    if (!o.length) { out.add(pre + '[]'); return out; }
    for (const v of o) leafPaths(v, pre + '[]', out);
    return out;
  }
  const ks = Object.keys(o);
  if (!ks.length) { out.add(pre); return out; }
  for (const k of ks) leafPaths(o[k], pre ? `${pre}.${k}` : k, out);
  return out;
}

/**
 * Run a whole show and record what it actually emitted: per event type, the fields present on
 * EVERY emission of it. `always` is the honest set — a field one emission omits is a field a
 * consumer cannot rely on, which is exactly the `phase.CASTING` bug.
 */
function emittedBy(log) {
  const m = new Map();
  for (const e of log) {
    const f = Object.keys(e.data || {});
    if (!m.has(e.type)) { m.set(e.type, { always: new Set(f), n: 0 }); }
    const r = m.get(e.type);
    r.n++;
    for (const k of [...r.always]) if (!f.includes(k)) r.always.delete(k);
  }
  return m;
}

/** Drive one real show to the Reunion, tapping every phone in every phase. */
function playShow({ castSeed, worldSeed, onFrame = null }) {
  const s = createSession({ count: 8, castSeed, worldSeed, send: onFrame || (() => {}) });
  let now = 0;
  s.start(now);
  for (let i = 0; i < 4000 && s.state.phase !== PHASE.REUNION; i++) {
    const alive = s.state.players.filter((p) => p.alive).map((p) => p.id);
    switch (s.state.phase) {
      case PHASE.CASTING:
        for (let k = 0; k < alive.length; k++) {
          s.input(alive[k], { t: 'cast', runner: alive[(k + 1) % alive.length], guide: alive[(k + 2) % alive.length] });
        }
        break;
      case PHASE.EXPEDITION:
        s.input(s.state.pair.guide, { t: 'call', call: i % 2 ? CALL.CLEAR : CALL.HOLD });
        s.input(s.state.pair.runner, { t: 'move', move: MOVE_CHOICE.GO });
        break;
      case PHASE.DEBRIEF:
        for (const id of alive) s.input(id, { t: 'claim', claim: 'FIXER' });
        break;
      case PHASE.RECKONING:
        if (!s.state.nominations.length) s.input(alive[0], { t: 'nominate', target: alive[1] });
        break;
      case PHASE.VOTE:
        for (const id of alive) s.input(id, { t: 'vote', choice: alive[1] });
        break;
      default: break;
    }
    now += 5000;
    s.tick(now);
  }
  return s;
}

// =============================================================================================
// P0 · the arm — every extractor found something, so a green below is not an empty set
// =============================================================================================
const SHOW = strip(src('net/party/show.mjs'));
const EXPED = strip(src('src/views/expedition.js'));
const SESSION = strip(src('src/party/session.js'));

/** show -> sim: every `send(simSock, ...)`, and the `briefFor` literal one of them names. */
const showToSim = (() => {
  const out = literalMessages(SHOW, /send\(simSock,\s*\{/g);
  const brief = SHOW.match(/const briefFor = \(session\) => \(\s*\{/);
  if (brief && /send\(simSock, briefFor\(/.test(SHOW)) {
    const body = balanced(SHOW, brief.index + brief[0].lastIndexOf('{'));
    const type = (body.match(/\bt:\s*'([^']+)'/) || [])[1];
    if (type) out.set(type, setOf([...topLevelPairs(body)].map(([, k]) => k).filter((k) => k !== 't')));
  }
  return out;
})();

/** sim -> show: every `send({...})` in the expedition view. */
const simToShow = literalMessages(EXPED, /\bsend\(\s*\{/g);

/** What `sock.onmessage` in the expedition view actually branches on and reads. */
const simHandles = (() => {
  const m = EXPED.match(/sock\.onmessage\s*=\s*\([^)]*\)\s*=>\s*\{/);
  const body = m ? balanced(EXPED, m.index + m[0].length - 1) : null;
  if (!body) return null;
  const types = [...body.matchAll(/\bm\.t === '([^']+)'/g)].map((x) => x[1]);
  const out = new Map(types.map((x) => [x, new Set()]));
  // Fields are attributed to the branch they sit in — one `if (m.t === 'x' ...) { ... }` each.
  for (const ty of types) {
    const at = body.indexOf(`m.t === '${ty}'`);
    const next = types.map((o) => body.indexOf(`m.t === '${o}'`)).filter((i) => i > at);
    const chunk = body.slice(at, next.length ? Math.min(...next) : body.length);
    for (const f of chunk.matchAll(/\bm\.([A-Za-z_$][\w$]*)/g)) if (f[1] !== 't') out.get(ty).add(f[1]);
  }
  return out;
})();

/** What `simReport` branches on and reads. */
const showHandles = (() => {
  const m = SESSION.match(/simReport\(msg = \{\}\) \{/);
  const body = m ? balanced(SESSION, m.index + m[0].length - 1) : null;
  if (!body) return null;
  const types = [...body.matchAll(/msg\.t === '([^']+)'/g)].map((x) => x[1]);
  const out = new Map(types.map((x) => [x, new Set()]));
  for (const ty of types) {
    const at = body.indexOf(`msg.t === '${ty}'`);
    const next = types.map((o) => body.indexOf(`msg.t === '${o}'`)).filter((i) => i > at);
    const chunk = body.slice(at, next.length ? Math.min(...next) : body.length);
    for (const f of chunk.matchAll(/\bmsg\.([A-Za-z_$][\w$]*)(?:\.([A-Za-z_$][\w$]*))?/g)) {
      if (f[1] === 't') continue;
      out.get(ty).add(f[2] ? `${f[1]}.${f[2]}` : f[1]);
    }
  }
  return out;
})();

{
  t('P0 arm · every seam was actually parsed — a green below is not an empty set meeting an empty set',
    showToSim.size >= 2 && simToShow.size >= 2 && simHandles && simHandles.size >= 1 && showHandles && showHandles.size >= 2,
    `show->sim ${[...showToSim.keys()].join(',')} · sim->show ${[...simToShow.keys()].join(',')}`
    + ` · expedition handles ${[...simHandles.keys()].join(',')} · simReport handles ${[...showHandles.keys()].join(',')}`);
}

// =============================================================================================
// P1 · show -> sim
// =============================================================================================
/**
 * 🚨 **A MESSAGE SENT INTO THE HOUSE THAT THE HOUSE DOES NOT HANDLE — REPORTED, NOT TOLERATED.**
 *
 *   brief   `show.mjs` sends `{t:'brief', wing, cameras, worldSeed, episode}` when the sim socket
 *           connects and again when EXPEDITION opens, and `show-wire` X10 pins its exact shape.
 *           `src/views/expedition.js` has no `brief` branch: it takes the wing, the seed, the
 *           episode and the camera count from its own query string at load
 *           (`qs.get('wing')`, `qs.get('seed')`, `qs.get('ep')`, `qs.get('cams')`), so the brief
 *           is redundant traffic that arrives and is dropped.
 *
 *           **This is a live disagreement between two files and neither end is this gate's to
 *           settle.** `views/expedition.js` and `show-wire.mjs` belong to the television build.
 *           Either the view starts reading the brief — at which point it stops being a query
 *           string away from a stale wing on reconnect — or `show.mjs` stops sending it and X10
 *           goes with it. P1 arm below goes red the moment either happens, so this entry cannot
 *           outlive the disagreement it describes.
 *
 * The other half of the same seam has been closed rather than listed: `{t:'cams'}` was a handler
 * with no producer anywhere in the tree, and its producer is in `show.mjs`, which is this
 * author's to write. See `pushCams` there.
 */
const AWAITING_A_CONSUMER = new Map([
  ['brief', 'views/expedition.js reads wing, seed, episode and cameras off its query string instead; show-wire X10 pins the message. One of the two has to move and neither is this file\'s'],
]);
{
  const emits = setOf(showToSim.keys()), reads = setOf(simHandles.keys());
  const deadTraffic = only(emits, reads).filter((x) => !AWAITING_A_CONSUMER.has(x));
  const deadHandler = only(reads, emits);
  t('P1 · every message `show.mjs` sends the mansion is one `views/expedition.js` handles',
    deadTraffic.length === 0,
    deadTraffic.length ? `sent and never handled: ${deadTraffic.map((x) => `{t:'${x}'}`).join(', ')}`
      : `${[...emits].join(', ')} — ${[...AWAITING_A_CONSUMER.keys()].join(', ')} named above and still unhandled`);
  const settled = [...AWAITING_A_CONSUMER.keys()].filter((x) => reads.has(x) || !emits.has(x));
  t('P1 arm · and the one message named as unhandled is still both sent and unhandled',
    settled.length === 0,
    settled.length ? `resolved — delete the entry and let P1 assert it: ${settled.join(', ')}`
      : `{t:'brief'} is sent by show.mjs and handled by nothing`);
  t('P1b · and every message the mansion handles is one something sends',
    deadHandler.length === 0,
    deadHandler.length ? `handled and never sent: ${deadHandler.map((x) => `{t:'${x}'}`).join(', ')}` : `${[...reads].join(', ')}`);
  const fieldGaps = [];
  for (const [ty, want] of simHandles) {
    const got = showToSim.get(ty);
    if (!got) continue;                       // P1b's business
    for (const f of want) if (!got.has(f)) fieldGaps.push(`{t:'${ty}'} is read for \`${f}\` and sent with [${[...got].join(', ')}]`);
  }
  t('P1c · and every field the mansion reads off one is a field that message carries',
    fieldGaps.length === 0, fieldGaps[0] || 'no field is read under a name it is not sent under');
}

// =============================================================================================
// P2 · sim -> show
// =============================================================================================
/**
 * ⚠️ THE THREE FIELDS THE SERVER IS SENT AND DOES NOT READ, NAMED RATHER THAN TOLERATED. Each is
 * in `src/views/expedition.js`, which this gate may not edit, so each is listed here with what it
 * would take to close it. P2d arms the list: an entry that stops being unread goes red, so this
 * cannot become a place to hide a fourth.
 *
 *   sim.clock          the mansion's own countdown. `session.js` runs the shooting clock and
 *                      `tick(now)` is the only thing that may move it, so a clock arriving from a
 *                      client is deliberately ignored rather than trusted.
 *   sim.hunter.state   the Hunter's AI state (`hs`). `simReport`'s header is explicit that the
 *                      television is authoritative about WHERE a robot is and knows nothing about
 *                      WHAT one is; a behaviour label is on the wrong side of that line.
 *   expedition.room    the wing, echoed back. The server announced it in CASTING and has it in
 *                      `state.expedition.room`; taking the client's copy would let the screen
 *                      re-grade the episode against a room the table never voted on.
 */
const SENT_AND_UNREAD = new Map([
  ['sim.clock', 'the server owns the shooting clock; `tick(now)` is its only mover'],
  ['sim.hunter.state', 'a behaviour label is an identity fact, and the TV is not authoritative about those'],
  ['expedition.room', 'the wing is the server\'s; taking the client\'s copy would let the screen re-grade the episode'],
]);
{
  const emits = setOf(simToShow.keys()), reads = setOf(showHandles.keys());
  t('P2 · every report the mansion sends is one `simReport` accepts', only(emits, reads).length === 0,
    only(emits, reads).length ? `sent and never accepted: ${only(emits, reads).join(', ')}` : `${[...emits].join(', ')}`);
  t('P2b · and every report `simReport` accepts is one the mansion sends', only(reads, emits).length === 0,
    only(reads, emits).length ? `accepted and never sent: ${only(reads, emits).join(', ')}` : `${[...reads].join(', ')}`);

  const gaps = [];
  for (const [ty, want] of showHandles) {
    const got = simToShow.get(ty);
    if (!got) continue;
    for (const f of want) {
      if (got.has(f)) continue;
      const head = f.split('.')[0];
      // `msg.hunter` read whole is satisfied by a producer that sends `hunter` as an opaque
      // object. `msg.runner.zone` is NOT satisfied by `runner` being sent when the producer
      // enumerates `runner.x`, `runner.z`, `runner.room` and `runner.noise` beside it — that is a
      // read of a field that is not there, which is the bug this line exists for.
      const enumerated = [...got].some((g) => g.startsWith(head + '.'));
      if (got.has(head) && !(f.includes('.') && enumerated)) continue;
      gaps.push(`{t:'${ty}'} is read for \`${f}\` and sent with [${[...got].join(', ')}]`);
    }
  }
  t('P2c · and every field `simReport` reads is a field the mansion sends under that name',
    gaps.length === 0, gaps[0] || 'no field is read under a name it is not sent under');

  const unread = [];
  for (const [ty, got] of simToShow) {
    const want = showHandles.get(ty) || new Set();
    for (const f of got) {
      if (want.has(f)) continue;
      if ([...want].some((w) => w.startsWith(f + '.'))) continue;   // `hunter` is read as `hunter.x`
      unread.push(`${ty}.${f}`);
    }
  }
  const surprises = unread.filter((x) => !SENT_AND_UNREAD.has(x));
  t('P2d · nothing new is sent to a server that does not read it',
    surprises.length === 0,
    surprises.length ? `sent and dropped: ${surprises.join(', ')}`
      : `${unread.length} known-unread fields, each named with a reason: ${unread.join(', ')}`);
  const stale = [...SENT_AND_UNREAD.keys()].filter((x) => !unread.includes(x));
  t('P2d arm · and every entry on that list is still genuinely unread — the list cannot become cover',
    stale.length === 0, stale.length ? `no longer unread, delete the entry: ${stale.join(', ')}` : `${SENT_AND_UNREAD.size} entries, all live`);
}

// =============================================================================================
// P3 · session / room -> log -> win, reunion
// =============================================================================================
/**
 * ⚠️ CONSUMERS WRITTEN AHEAD OF THEIR PRODUCERS, NAMED. These are the one case the opening rule
 * allows: *a model may stand in for something that does not exist yet.* A rule that reads an
 * event nothing writes is not a lie about the code — it is a rule waiting for a feature. It IS a
 * lie the moment the feature lands and the shapes disagree, which is what P3b is for, and it is a
 * lie about COVERAGE the moment a gate proves the rule by writing the event by hand.
 *
 *   host.skip      `win.js` W6 -> ABANDONED. `session.js`'s `skip(now)` is the host SHORTENING a
 *                  phase and says so in its own header — *"it can never resolve one
 *                  differently"* — so it is deliberately not this event. Nothing abandons a show
 *                  yet. `win-machine` W6 hand-writes `{type:'host.skip'}`, which is exactly the
 *                  artefact this gate's header names: it proves the reducer, not the seam.
 *   chat.posted    `reunion.js`'s BEAT 4 unmixes the chat. There is no chat on any wire yet.
 */
const AWAITING_A_PRODUCER = new Map([
  ['host.skip', 'win.js W6 (ABANDONED). No host action emits it — session.skip() only shortens a phase'],
  ['chat.posted', 'reunion.js BEAT 4 (chatUnmixed). There is no chat system yet'],
]);

/** What `win.js` and `reunion.js` read, per event type. Their source is the only honest source. */
function consumesFrom(file) {
  const b = strip(src(file));
  const out = new Map();
  const add = (ty, f) => { if (!out.has(ty)) out.set(ty, new Set()); if (f) out.get(ty).add(f); };
  for (const m of b.matchAll(/\b([A-Za-z_$][\w$]*)\.type\s*===\s*'([^']+)'/g)) {
    const [, v, ty] = m;
    add(ty, null);
    for (const f of testScope(b, m.index).matchAll(new RegExp(`\\b${v}\\.data\\??\\.([A-Za-z_$][\\w$]*)`, 'g'))) add(ty, f[1]);
  }
  /**
   * `byType(log, 'x')` — `reunion.js`'s own helper. Two forms: bound to a name and used later, or
   * consumed on the spot. The bound form is followed through its NAME rather than through
   * proximity, so `noms` and `votes` cannot lend each other fields.
   */
  for (const m of b.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*byType\(log, '([^']+)'\)/g)) {
    const [, alias, ty] = m;
    add(ty, null);
    const [, block] = enclosingBlock(b, m.index);
    for (const use of block.matchAll(new RegExp(`\\b${alias}\\.[A-Za-z_$][\\w$]*\\(`, 'g'))) {
      const args = balancedParen(block, use.index + use[0].length - 1);
      if (args == null) continue;
      for (const f of args.matchAll(/\b[A-Za-z_$][\w$]*\.data\??\.([A-Za-z_$][\w$]*)/g)) add(ty, f[1]);
    }
  }
  for (const m of b.matchAll(/byType\(log, '([^']+)'\)(?!\s*;)/g)) {
    const ty = m[1];
    add(ty, null);
    for (const f of testScope(b, m.index).matchAll(/\b[A-Za-z_$][\w$]*\.data\??\.([A-Za-z_$][\w$]*)/g)) add(ty, f[1]);
  }
  return out;
}

{
  // Two producers, both run for real, both driven to a take, an execution and a verdict.
  const sess = emittedBy(playShow({ castSeed: 3, worldSeed: 21 }).log.all());
  for (const seed of [4, 5, 6, 7, 8, 9]) {
    const more = emittedBy(playShow({ castSeed: seed, worldSeed: seed * 11 }).log.all());
    for (const [ty, r] of more) {
      if (!sess.has(ty)) sess.set(ty, r);
      else { const cur = sess.get(ty); cur.n += r.n; for (const k of [...cur.always]) if (!r.always.has(k)) cur.always.delete(k); }
    }
  }
  const room = createRoom({ count: 8, castSeed: 5, worldSeed: 15, send: () => {} });
  const ALL = Array.from({ length: 8 }, (_, i) => `p${i + 1}`);
  room.start();
  room.playEpisode({ hunterRoom: ROOMS[5] });
  room.playEpisode({ hunterRoom: 'gallery', takeRunner: true });
  // The room has to be driven to an EXECUTION as well as to a take, or `player.executed` — which
  // both consumers read — is a type this gate never sees either producer emit.
  room.playEpisode({
    hunterRoom: 'gallery',
    nominations: [{ nominator: 'p1', target: 'p3' }],
    votes: Object.fromEntries(ALL.map((id) => [id, 'p3'])),
  });
  room.playMatch({ hunterRoom: 'gallery' });
  const rm = emittedBy(room.log.all());

  const PRODUCERS = [['session.js', sess], ['room.js', rm]];
  const CONSUMERS = [['win.js', consumesFrom('src/party/win.js')], ['reunion.js', consumesFrom('src/party/reunion.js')]];

  t('P3 arm · both producers were driven for real and both consumers were parsed',
    sess.size > 20 && rm.size > 15 && CONSUMERS.every(([, c]) => c.size > 3)
      && sess.has('player.taken') && sess.has('player.executed') && rm.has('player.executed'),
    `session emits ${sess.size} types · room emits ${rm.size} · win reads ${CONSUMERS[0][1].size} · reunion reads ${CONSUMERS[1][1].size}`);

  const orphans = [];
  for (const [cname, c] of CONSUMERS) {
    for (const ty of c.keys()) {
      if (AWAITING_A_PRODUCER.has(ty)) continue;
      if (!PRODUCERS.some(([, p]) => p.has(ty))) orphans.push(`${cname} reads \`${ty}\`, which nothing records`);
    }
  }
  t('P3 · every event type the win machine and the Reunion read is one something actually records',
    orphans.length === 0, orphans[0] || `${[...new Set(CONSUMERS.flatMap(([, c]) => [...c.keys()]))].length} types, all produced or named`);

  const arrived = [...AWAITING_A_PRODUCER.keys()].filter((ty) => PRODUCERS.some(([, p]) => p.has(ty)));
  t('P3 arm b · and every type on the awaiting-a-producer list is still genuinely unproduced',
    arrived.length === 0,
    arrived.length ? `now produced — take it off the list and let P3b assert its shape: ${arrived.join(', ')}`
      : [...AWAITING_A_PRODUCER.keys()].join(', ') + ' — consumers waiting on features, not on bugs');

  /**
   * 🚨 THE ASSERTION THAT `phase.CASTING` FAILED. A field is only readable if EVERY producer of
   * that type puts it on EVERY emission. `room.js` recorded `phase.CASTING` with `{}` while
   * `win.js` read `e.data?.episode` off it, so the episode counter stuck at 1 and W5 was dead
   * over that room's logs — silently, because `?.` turns a missing field into a default.
   */
  const holes = [];
  for (const [cname, c] of CONSUMERS) {
    for (const [ty, fields] of c) {
      for (const [pname, p] of PRODUCERS) {
        const r = p.get(ty);
        if (!r) continue;
        for (const f of fields) if (!r.always.has(f)) holes.push(`${cname} reads \`${ty}.${f}\`; ${pname} emits it as [${[...r.always].join(', ')}]`);
      }
    }
  }
  t('P3b · and every field they read is on EVERY emission of that type, from EVERY producer of it',
    holes.length === 0, holes[0] || `${PRODUCERS.length} producers x ${CONSUMERS.length} consumers, field by field`);
}

// =============================================================================================
// P4 · session -> frame -> the two pages
// =============================================================================================
/**
 * ⚠️ TWO FRAME FIELDS THAT REACH NO SCREEN, NAMED. The frame is one object serving two pages, so
 * "the phone does not read `cameras`" is not a defect — the television does. These two reach
 * neither, and both are deliberate:
 *
 *   tick        the phase counter. It is what makes two frames distinguishable when nothing else
 *               changed, which is what `party-isolation` I4's byte-identical comparison and every
 *               reconnect test lean on. Nothing renders it and nothing should.
 *   worldSeed   public exactly as today (`run.js` L43-48) so a game can be replayed from four
 *               printed values. `show.mjs`'s `/report` is where it is meant to be read.
 */
const ON_THE_WIRE_UNRENDERED = new Map([
  ['tick', 'the phase counter — frame identity for the isolation and reconnect gates, never a pixel'],
  ['worldSeed', 'public by run.js L43-48 so a show can be replayed; read from /report, not from a screen'],
]);

/** Property names that belong to JavaScript rather than to the frame — see P4's loop. */
const BUILTIN = /\.(length|map|filter|find|findIndex|some|every|slice|join|forEach|sort|concat|indexOf|includes|reduce|push|reverse|flat|flatMap|keys|values|entries|toFixed|toString|padStart|padEnd|split|trim|replace|charAt|at)$/;

/** Direct `frame.a.b` chains plus one level of aliasing — `const you = frame.you || {}` then `you.x`. */
function framePathsRead(file) {
  const b = strip(src(file));
  const out = new Set();
  for (const m of b.matchAll(/\bframe((?:\.[A-Za-z_$][\w$]*)+)/g)) out.add(m[1].slice(1));
  for (const m of b.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*[^;\n]*?\bframe((?:\.[A-Za-z_$][\w$]*)+)/g)) {
    const [, alias, chain] = m;
    const base = chain.slice(1);
    out.add(base);
    // ⚠️ SCOPED TO THE DECLARING BLOCK. `show-tv.html` names an alias `c` for `frame.call` in one
    // render function and for `frame.cameras` in four others; a file-wide scan reported that the
    // television reads `frame.call.unlocked`, which nothing has ever sent.
    const [start, block] = enclosingBlock(b, m.index);
    // ⚠️ AND DROPPED ENTIRELY IF THE NAME IS ALSO A CALLBACK PARAMETER IN THAT BLOCK. `const p =
    // frame.phase` sits four lines above `.find((p) => p.id === ...)`, and following the alias
    // through a shadow reported that the phone reads `frame.phase.id`. An ambiguous alias is not
    // followed; the direct `frame.x.y` reads above are unaffected, so the loss is coverage of a
    // one-letter alias rather than of a field.
    if (new RegExp(`\\(\\s*${alias}\\s*[,)]`).test(block)) continue;
    for (const u of block.matchAll(new RegExp(`\\b${alias}((?:\\.[A-Za-z_$][\\w$]*)+)`, 'g'))) {
      if (start + u.index < m.index) continue;
      out.add(base + u[1]);
    }
  }
  return out;
}

{
  const tv = new Set(), phone = new Set(), tvTop = new Set(), phoneTop = new Set();
  for (const seed of [1, 2, 3]) {
    playShow({
      castSeed: seed, worldSeed: seed * 9,
      onFrame: (id, f) => {
        const [P, T] = id === 'tv' ? [tv, tvTop] : [phone, phoneTop];
        for (const p of leafPaths(f)) P.add(p);
        for (const k of Object.keys(f)) T.add(k);
      },
    });
  }
  const PAGES = [
    ['show-tv.html', 'net/party/show-tv.html', tv, tvTop],
    ['show-phone.html', 'net/party/show-phone.html', phone, phoneTop],
  ];

  t('P4 arm · real projected frames were captured for both socket classes, from the shipped `project()`',
    tv.size > 20 && phone.size > 30 && tvTop.size > 8 && phoneTop.size > 8,
    `television ${tv.size} leaf paths / ${tvTop.size} keys · phone ${phone.size} / ${phoneTop.size}`);

  const missing = [];
  for (const [name, file, leaves, top] of PAGES) {
    const readPaths = framePathsRead(file);
    t(`P4 arm · ${name} was parsed and reads the frame`, readPaths.size > 5, `${readPaths.size} frame paths read`);
    for (const raw of readPaths) {
      // A page reads `frame.players.length` and `frame.players.map(...)`. The last segment of a
      // chain that names a JavaScript built-in is a use of the value, not a field of the frame.
      const p = BUILTIN.test(raw) ? raw.replace(/\.[A-Za-z_$][\w$]*$/, '') : raw;
      if (!p) continue;
      if (top.has(p)) continue;
      if (leaves.has(p)) continue;
      // `players` is read as `players[].name` once the page has an element in hand.
      if ([...leaves].some((x) => x === p || x.startsWith(p + '.') || x.startsWith(p + '[]'))) continue;
      const arr = p.replace(/\.([A-Za-z_$][\w$]*)$/, '[].$1');
      if (leaves.has(arr)) continue;
      missing.push(`${name} reads \`frame.${raw}\`, which no frame of its socket class carries`);
    }
  }
  t('P4 · every frame path either page reads is one the shipped projection puts on that page\'s frames',
    missing.length === 0, missing[0] || `${PAGES.length} pages walked against real projections`);

  const readAnywhere = new Set(PAGES.flatMap(([, file]) => [...framePathsRead(file)].map((p) => p.split('.')[0])));
  const unrendered = [...new Set([...tvTop, ...phoneTop])].filter((k) => !readAnywhere.has(k));
  const surprises = unrendered.filter((k) => !ON_THE_WIRE_UNRENDERED.has(k));
  t('P4b · and nothing new is projected onto a frame that neither screen reads',
    surprises.length === 0,
    surprises.length ? `on the wire, rendered nowhere: ${surprises.join(', ')}`
      : `${unrendered.length} known-unrendered keys, each named with a reason: ${unrendered.join(', ')}`);
  const stale = [...ON_THE_WIRE_UNRENDERED.keys()].filter((k) => !unrendered.includes(k));
  t('P4b arm · and every entry on that list is still genuinely unrendered',
    stale.length === 0, stale.length ? `now rendered, delete the entry: ${stale.join(', ')}` : `${ON_THE_WIRE_UNRENDERED.size} entries, all live`);
}

// =============================================================================================
// P9 · the controls — every detector, fed the shipped text with one edit applied
// =============================================================================================
/**
 * 🚨 EVERY CONTROL BELOW MUTATES REAL SOURCE. None of them runs a detector over a string this
 * file wrote: a regex tested against a literal beside it proves that the literal matches the
 * regex and nothing about the code. Each mutation is the edit a real author would make, each is
 * applied to the shipped text, and each is preceded by an arm asserting the edit actually landed
 * — because a mutation that silently stopped applying is a control that silently stopped
 * controlling.
 */
{
  // ---- P1/P1b/P1c: rename the field the brief sends
  const briefRenamed = SHOW.replace(/(\bcameras:\s*camerasLive)/, 'unlocked: camerasLive');
  t('P9 arm a · the brief-field rename landed on the shipped text', briefRenamed !== SHOW, '`cameras:` -> `unlocked:`');
  const renamedBrief = (() => {
    const m = briefRenamed.match(/const briefFor = \(session\) => \(\s*\{/);
    const body = balanced(briefRenamed, m.index + m[0].lastIndexOf('{'));
    return setOf([...topLevelPairs(body)].map(([, k]) => k).filter((k) => k !== 't'));
  })();
  t('P9.1 control · rename the brief\'s field and the extractor sees a different set — the scan is reading the wire',
    !renamedBrief.has('cameras') && renamedBrief.has('unlocked'),
    `[${[...renamedBrief].join(', ')}] instead of [${[...(showToSim.get('brief') || [])].join(', ')}]`);

  // ---- P2c: make `simReport` read a field the mansion does not send
  const greedy = SESSION.replace('room: msg.runner.room ?? null', 'room: msg.runner.zone ?? null');
  t('P9 arm b · the simReport rename landed on the shipped text', greedy !== SESSION, '`msg.runner.room` -> `msg.runner.zone`');
  const greedyHandles = (() => {
    const m = greedy.match(/simReport\(msg = \{\}\) \{/);
    const body = balanced(greedy, m.index + m[0].length - 1);
    const at = body.indexOf("msg.t === 'sim'");
    const end = body.indexOf("msg.t === 'expedition'");
    const chunk = body.slice(at, end > at ? end : body.length);
    const out = new Set();
    for (const f of chunk.matchAll(/\bmsg\.([A-Za-z_$][\w$]*)(?:\.([A-Za-z_$][\w$]*))?/g)) {
      if (f[1] === 't') continue;
      out.add(f[2] ? `${f[1]}.${f[2]}` : f[1]);
    }
    return out;
  })();
  const sent = simToShow.get('sim') || new Set();
  t('P9.2 control · have `simReport` read `runner.zone` and P2c goes red — the field is not on the wire',
    greedyHandles.has('runner.zone') && !sent.has('runner.zone'),
    `simReport would read [runner.zone], the mansion sends [${[...sent].filter((f) => f.startsWith('runner')).join(', ')}]`);

  // ---- P3b: take `episode` back off room.js's phase events, which is the shipped bug
  const roomSrc = src('src/party/room.js');
  const stripped = roomSrc.replace('record(makeEvent(`phase.${p}`, VIS.PUBLIC, { episode: state.episode }));',
    'record(makeEvent(`phase.${p}`, VIS.PUBLIC, {}));');
  t('P9 arm c · the room.js payload edit landed on the shipped text', stripped !== roomSrc, '`{ episode }` -> `{}`');
  // Run the mutated room for real, through a data: module, so the control measures behaviour.
  const roomUrl = new URL('../src/party/room.js', import.meta.url);
  const absolute = stripped.replace(/from '(\.[^']*)'/g, (m0, rel) => `from '${new URL(rel, roomUrl).href}'`);
  const mod = 'data:text/javascript;base64,' + Buffer.from(absolute).toString('base64');
  const bugged = await import(mod);
  const br = bugged.createRoom({ count: 8, castSeed: 5, worldSeed: 15, send: () => {} });
  br.start();
  br.playEpisode({ hunterRoom: ROOMS[5] });
  br.playMatch({ hunterRoom: 'gallery' });
  const buggedEmits = emittedBy(br.log.all());
  const winReads = consumesFrom('src/party/win.js');
  const wouldBreak = [...(winReads.get('phase.CASTING') || [])]
    .filter((f) => !(buggedEmits.get('phase.CASTING')?.always.has(f)));
  t('P9.3 control · restore `phase.${p}` with an empty payload, run the room for real, and P3b goes red',
    wouldBreak.length > 0 && buggedEmits.has('phase.CASTING'),
    `win.js reads \`phase.CASTING.${wouldBreak.join(', ')}\`; the mutated room emits it `
    + `${buggedEmits.get('phase.CASTING')?.n} times with [${[...(buggedEmits.get('phase.CASTING')?.always || [])].join(', ')}]`);

  // ---- P4: have a page read a frame path the projection does not carry
  const tvSrc = strip(src('net/party/show-tv.html'));
  const bentTv = tvSrc.replace(/\bframe\.cameras\b/, 'frame.camerasLive');
  t('P9 arm d · the page-read edit landed on the shipped text', bentTv !== tvSrc, '`frame.cameras` -> `frame.camerasLive`');
  const bentReads = new Set([...bentTv.matchAll(/\bframe((?:\.[A-Za-z_$][\w$]*)+)/g)].map((m) => m[1].slice(1)));
  t('P9.4 control · point a page at `frame.camerasLive` and P4 goes red — no projection carries it',
    bentReads.has('camerasLive'),
    'the detector reads the page\'s own text, so a renamed field is a renamed read');
}

console.log(`\nwire-parity: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
