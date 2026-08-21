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
 * THE FIVE SEAMS
 * ---------------------------------------------------------------------------------------------
 *   show -> sim        `show.mjs`'s `briefFor` and `{t:'drive'}`   ->  `views/expedition.js`'s
 *                                                                     `sock.onmessage`
 *   sim -> show        `views/expedition.js`'s `send()`            ->  `session.js`'s `simReport`
 *   session -> log     `session.js` / `room.js` `record()`         ->  `win.js`'s `foldWin`,
 *                                                                     `reunion.js`
 *   session -> frame   `session.js` `fullFor` + `project()`        ->  `show-tv.html`,
 *                                                                     `show-phone.html`
 *   show -> the room   `show.mjs`'s eleven envelope types          ->  `show-tv.html` and
 *                                                                     `show-phone.html`'s
 *                                                                     `ws.onmessage`
 *
 * The fifth was not one of the four for four commits, and it is the seam every player is looking
 * at: `{t:'state'|'roster'|'seated'|'reunion'|'event'|'hello'|'refused'|'notice'|'full'|'late'
 * |'ping'}`. `P4` walks `frame`, which is the payload of exactly ONE of those eleven; the
 * envelope around all of them and the other ten were unasserted anywhere in this suite. Adding it
 * named six fields this process sends that neither page has ever opened. See P5.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 **AND THE EXTRACTORS THEMSELVES HAD THE BUG CLASS THEY WERE BUILT TO STOP. SEE `P0 arm b`.**
 * ---------------------------------------------------------------------------------------------
 * `readsOf` matched `<name>.<field>` and followed `fn(name)`. A DESTRUCTURING pattern yields
 * neither, so `const { unlocked } = m` produced an empty read set — and every field-parity
 * assertion below is a loop over that set. Empty set, empty loop, green gate, nothing compared.
 * That is verbatim what this file's own header calls *"a field-parity assertion green because it
 * had nothing to check"*, sitting in the file that names it. Two real product defects were
 * demonstrated through the hole with all twenty-eight gates green. The fix is `P0 arm b` and
 * `P0 arm c`, which are assertions about the SCAN rather than patches for two syntaxes.
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
import { audienceFor } from '../net/party/entitle.js';
import { createRoom } from '../src/party/room.js';
import { PHASE } from '../src/party/phases.js';
import { ROOMS } from '../src/party/coverage.js';

let pass = 0, fail = 0;
const t = (n, c, d = '') => { if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); } else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); } return c; };

/**
 * 🚨 **EVERY BINDING FORM NO EXTRACTOR BELOW COULD RESOLVE, COLLECTED RATHER THAN DROPPED.**
 * `P0 arm c` requires this list to be empty, and that is the half of the W1 fix that generalises:
 * a scanner that cannot read a construct must say so, because the alternative — an empty read set
 * flowing into a field-parity loop — is a green assertion with nothing behind it.
 */
const PARSE_TROUBLE = [];

/**
 * 🚨 **EVERY WATCHED BRANCH THAT YIELDED NO FIELD AT ALL.** A `{t:'x'}` handler that this file
 * can find but cannot see a single read inside is not a handler that reads nothing — it is a
 * scan that failed, and every field-parity loop downstream of it iterates over an empty set and
 * prints `ok`. `P0 arm b` requires this list to hold only the branches named in `READS_NOTHING`.
 */
const BLIND = [];

/**
 * ⚠️ **THE BRANCHES THAT GENUINELY TOUCH NOTHING BUT THE TYPE, NAMED RATHER THAN TOLERATED.**
 * A message can legitimately be a bare signal — its arrival is the whole content — and that is
 * not the same fact as a scanner that could not read it. Each entry is keyed
 * `<consumer> {t:'<type>'}` exactly as `BLIND` records it, argued, and armed by `P0 arm b arm`:
 * an entry that starts reading a field goes red, so this cannot become somewhere to hide a
 * fourth parse failure.
 */
const READS_NOTHING = new Map([
  ["show-phone.html's {t:'full'} branch reads no field off `m` at all",
    'the door is shut and the button says so — `capacity` rides along and the phone asks it nothing'],
]);

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

/**
 * Every `<name>.<field>` read off a value, following it through the local calls it is handed to
 * AND through the bindings it is destructured into.
 *
 * 🚨 A HANDLER THAT SAYS `if (m.t === 'brief') arm(m)` READS EVERY FIELD `arm` READS, AND A SCAN
 * THAT STOPPED AT THE BRANCH WOULD REPORT THAT IT READS NONE — which is a field-parity assertion
 * passing because it found nothing to check. `views/expedition.js` hands the brief to `arm(b)`,
 * which hands it to `readBrief(b)`, which is where `b.wing`, `b.cameras`, `b.episode` and
 * `b.worldSeed` actually are. Two hops, so the follow goes three deep and stops.
 *
 * 🚨 **AND THE SAME HOLE WAS STILL OPEN ONE SYNTAX OVER.** `const { unlocked } = m` matches
 * neither `m.<field>` nor `fn(m)`, so a branch written that way produced an EMPTY read set and
 * every field-parity loop below iterated over nothing and reported `ok`. That is not a variant of
 * the bug this file exists to stop; it IS the bug, in the file built to stop it — the gate's own
 * header names *"a field-parity assertion green because it had nothing to check"* as the shape.
 * Two halves of the fix, and the second one is the one that generalises:
 *
 *   · `patternReads` resolves the destructuring forms this tree uses, so the reads are COUNTED.
 *   · `PARSE_TROUBLE` and the zero-yield rule at P0 make a set this scanner could not fill a
 *     FAILURE rather than a pass — which holds for `m['unlocked']`, `{...m}`, `Object.entries(m)`
 *     and every other form nobody has written yet, because it does not depend on recognising one.
 */
function readsOf(text, name, scope, depth = 3, seen = new Set(), where = '?') {
  const out = new Set();
  for (const m of scope.matchAll(new RegExp(`\\b${name}\\.([A-Za-z_$][\\w$]*)`, 'g'))) out.add(m[1]);
  for (const p of patternReads(scope, name, scope, where)) out.add(p);
  if (depth <= 0) return out;
  for (const call of scope.matchAll(new RegExp(`\\b([A-Za-z_$][\\w$]*)\\(\\s*${name}\\s*[,)]`, 'g'))) {
    const fn = call[1];
    if (seen.has(fn) || /^(if|for|while|switch|return|typeof|Number|String|Boolean|Math|JSON|Object|Array)$/.test(fn)) continue;
    seen.add(fn);
    const def = text.match(new RegExp(`(?:function\\s+${fn}\\s*\\(|const\\s+${fn}\\s*=\\s*(?:async\\s*)?\\()`));
    if (!def) continue;
    const open = text.indexOf('(', def.index + def[0].length - 1);
    const params = balancedParen(text, open);
    if (params == null) continue;
    const first = (topLevelParts(params)[0] || '').replace(/\s*=[\s\S]*$/, '').trim();
    const bodyAt = text.indexOf('{', open + params.length);
    const body = balanced(text, bodyAt);
    if (body == null) continue;
    // ⚠️ A DESTRUCTURED PARAMETER IS A READ LIST, NOT AN UNPARSEABLE NAME. `readBrief({ wing,
    // cameras })` names four fields in its own signature; the old scanner required the first
    // parameter to be a bare identifier and returned silently when it was not.
    if (first.startsWith('{')) {
      const inner = balanced(first, 0);
      if (inner == null) { PARSE_TROUBLE.push(`${where}: \`${fn}\`'s destructured parameter did not brace-match`); continue; }
      for (const p of patternPaths(inner, '', (local) => subReads(body, local), `${where} -> ${fn}()`)) out.add(p);
      continue;
    }
    if (!/^[A-Za-z_$][\w$]*$/.test(first)) {
      PARSE_TROUBLE.push(`${where}: \`${fn}\` is handed \`${name}\` and its first parameter \`${first}\` is a form this scanner cannot follow`);
      continue;
    }
    for (const f of readsOf(text, first, body, depth - 1, seen, `${where} -> ${fn}()`)) out.add(f);
  }
  return out;
}

/** `body` split on its top-level commas, string- and bracket-aware. */
function topLevelParts(body) {
  const out = [];
  let depth = 0, start = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === "'" || c === '"' || c === '`') { i = skipString(body, i); continue; }
    if (c === '{' || c === '[' || c === '(') { depth++; continue; }
    if (c === '}' || c === ']' || c === ')') { depth--; continue; }
    if (c === ',' && depth === 0) { out.push(body.slice(start, i)); start = i + 1; }
  }
  out.push(body.slice(start));
  return out.map((x) => x.trim()).filter(Boolean);
}

/** The index of the first `ch` at bracket depth 0 in `s`, or -1. */
function topLevelIndex(s, ch) {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "'" || c === '"' || c === '`') { i = skipString(s, i); continue; }
    if (c === '{' || c === '[' || c === '(') { depth++; continue; }
    if (c === '}' || c === ']' || c === ')') { depth--; continue; }
    if (depth === 0 && c === ch) return i;
  }
  return -1;
}

/** The index of the bracket closing the one at `at`, or -1. */
function matchEnd(text, at) {
  const open = text[at];
  const close = { '{': '}', '[': ']', '(': ')' }[open];
  if (!close) return -1;
  let depth = 0;
  for (let i = at; i < text.length; i++) {
    const c = text[i];
    if (c === "'" || c === '"' || c === '`') { i = skipString(text, i); continue; }
    if (c === open) depth++;
    else if (c === close) { depth--; if (!depth) return i; }
  }
  return -1;
}

/**
 * One object-destructuring pattern body, resolved into the paths it reads under `prefix`.
 * `{ a, b: c, d = 1, e: { f } }` reads `a`, `b`, `d` and `e.f`; the local name `c` is handed to
 * `sub(c)` so what `c` is then read FOR lands as `b.<that>`.
 *
 * ⚠️ ANYTHING THIS CANNOT NAME GOES INTO `PARSE_TROUBLE` AND NOWHERE ELSE. A computed key
 * (`{ [k]: v }`) genuinely cannot be resolved from the text, and the honest answer to that is a
 * red gate and a human, not an empty set that reads as agreement.
 */
function patternPaths(body, prefix, sub, where) {
  const out = new Set();
  for (const p of topLevelParts(body)) {
    if (p.startsWith('...')) {
      // A rest element reads whatever is left, so it claims no field — but it IS a read, and the
      // zero-yield rule must not mistake it for a parse failure.
      out.add(prefix ? `${prefix}.*` : '*');
      continue;
    }
    const eq = topLevelIndex(p, '=');
    const colon = topLevelIndex(p, ':');
    let key = null, val = null;
    if (colon < 0 || (eq >= 0 && eq < colon)) {
      const m = /^([A-Za-z_$][\w$]*)\s*(?:=|$)/.exec(p);
      if (!m) { PARSE_TROUBLE.push(`${where}: cannot name the binding \`${p}\``); continue; }
      key = m[1]; val = m[1];
    } else {
      key = p.slice(0, colon).trim();
      val = p.slice(colon + 1).trim();
      if (!/^[A-Za-z_$][\w$]*$/.test(key)) { PARSE_TROUBLE.push(`${where}: cannot name the key of \`${p}\``); continue; }
    }
    const path = prefix ? `${prefix}.${key}` : key;
    out.add(path);
    if (val.startsWith('{')) {
      const inner = balanced(val, 0);
      if (inner == null) { PARSE_TROUBLE.push(`${where}: nested pattern \`${p}\` did not brace-match`); continue; }
      for (const q of patternPaths(inner, path, sub, where)) out.add(q);
      continue;
    }
    const m = /^([A-Za-z_$][\w$]*)\s*(?:=|$)/.exec(val);
    if (!m) { PARSE_TROUBLE.push(`${where}: cannot name the local of \`${p}\``); continue; }
    if (sub) for (const suffix of sub(m[1])) out.add(path + suffix);
  }
  return out;
}

/**
 * Every `.a.b` chain read off `local` in `block`, as suffixes.
 *
 * ⚠️ THREE FORMS, BECAUSE THE PAGES USE THREE. A bare `inc.alarms`, an optional `inc?.alarms`,
 * and — the one that cost a control a red — a defaulted `(inc || {}).alarms`, which is how both
 * HTML pages read every nullable branch of the frame. A scanner that only knew the first would
 * have resolved the pattern, found the alias used nowhere, and gone quietly back to an empty set.
 */
function subReads(block, local) {
  const out = new Set();
  const chain = '((?:\\??\\.[A-Za-z_$][\\w$]*)+)';
  const norm = (c) => c.replace(/\?/g, '');
  for (const u of block.matchAll(new RegExp(`\\b${local}${chain}`, 'g'))) out.add(norm(u[1]));
  for (const u of block.matchAll(new RegExp(`\\(\\s*${local}\\s*(?:\\|\\||\\?\\?)[^()]*\\)${chain}`, 'g'))) out.add(norm(u[1]));
  return out;
}

/**
 * 🚨 **EVERY DESTRUCTURING PATTERN IN `scope` INITIALISED FROM `root`, RESOLVED — AND EVERY ONE
 * THAT COULD NOT BE, REPORTED.** This is the whole of the W1 fix's first half. `const { unlocked
 * } = m` is a read of `m.unlocked`; `const { incident: inc } = frame` followed by `inc.alarms` is
 * a read of `frame.incident.alarms`; `const { you } = frame.seat` is a read of `frame.seat.you`.
 *
 * The last loop is the half that cannot be evaded: every `<pattern> = root` in the scope whose
 * bracket this function did not itself resolve — an assignment with no declarator, an array
 * pattern, anything — is pushed to `PARSE_TROUBLE`. A pattern bound off a watched value is either
 * understood or it is a red gate. It is never a silence.
 */
function patternReads(text, root, scope, where) {
  const out = new Set();
  const resolvedEnd = new Set();
  for (const d of scope.matchAll(/\b(?:const|let|var)\s*(?=[{[])/g)) {
    const at = d.index + d[0].length;
    const end = matchEnd(scope, at);
    if (end < 0) continue;
    const after = scope.slice(end + 1);
    const eq = /^\s*=\s*/.exec(after);
    if (!eq) continue;
    const init = after.slice(eq[0].length).replace(/^[(\s]+/, '');
    const rm = /^([A-Za-z_$][\w$]*)((?:\.[A-Za-z_$][\w$]*)*)/.exec(init);
    if (!rm || rm[1] !== root) continue;
    resolvedEnd.add(end);
    if (scope[at] === '[') {
      PARSE_TROUBLE.push(`${where}: \`${root}\` is destructured by position — an array pattern names no fields`);
      continue;
    }
    const body = balanced(scope, at);
    if (body == null) { PARSE_TROUBLE.push(`${where}: a pattern bound from \`${root}\` did not brace-match`); continue; }
    // The locals are live from the declaration to the end of the block that holds it.
    const [start, block] = enclosingBlock(scope, at);
    const from = Math.max(0, at - start);
    const live = block.slice(from);
    const prefix = rm[2] ? rm[2].slice(1) : '';
    for (const p of patternPaths(body, prefix, (local) => subReads(live, local), where)) out.add(p);
  }
  for (const u of scope.matchAll(new RegExp(`[}\\]]\\s*=\\s*\\(?\\s*${root}\\b`, 'g'))) {
    if (resolvedEnd.has(u.index)) continue;
    PARSE_TROUBLE.push(`${where}: \`${scope.slice(Math.max(0, u.index - 60), u.index + 20).split('\\n').pop().trim()}\` binds a pattern off \`${root}\` and this scanner did not resolve it`);
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
    for (const f of readsOf(EXPED, 'm', chunk, 3, new Set(), `expedition.js {t:'${ty}'}`)) if (f !== 't') out.get(ty).add(f);
    if (!out.get(ty).size) BLIND.push(`views/expedition.js's {t:'${ty}'} branch reads no field off \`m\` at all`);
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
    // ⚠️ AND THE SAME VALUE TAKEN APART RATHER THAN INDEXED. `const { runner } = msg` reads
    // `msg.runner`; the chain regex above sees nothing at all in it.
    for (const f of patternReads(chunk, 'msg', chunk, `session.js simReport {t:'${ty}'}`)) if (f !== 't') out.get(ty).add(f);
    if (!out.get(ty).size) BLIND.push(`session.js's simReport {t:'${ty}'} branch reads no field off \`msg\` at all`);
  }
  return out;
})();

/**
 * 🚨 **THE ARM THAT WAS ONLY HALF AN ARM, AND THE HALF THAT WAS MISSING IS THE ONE THAT MATTERED.**
 *
 * `P0 arm` asserted that every seam's BRANCHES were found. It never asserted that a branch
 * yielded a FIELD — and every field-parity assertion below is a loop over the read set, so a
 * branch with an empty set is an assertion with an empty body. Two real product defects were
 * demonstrated against the shipped tree, each fully green across all twenty-eight gates:
 *
 *   · `show.mjs` sending `{t:'cams', lit}` while `expedition.js` reads `const { unlocked } = m`.
 *     That is the exact bug `pushCams` was landed to fix, restored by hand: the live camera count
 *     never reaches the running house again, and the guide's coverage, the Director's cutaway
 *     budget and the feed's camera roster all freeze at the query-string default.
 *   · `show-tv.html` reading `const { incident: inc } = frame` and then `inc.<wrong name>`, which
 *     pins the Incidents counter at 0 for the whole season.
 *
 * Both were invisible for one reason: the read set was empty, so P1c and P4 compared nothing
 * against nothing. The three arms below are the fix, and they are ordered from most specific to
 * most general on purpose — the last one does not depend on recognising any syntax at all, so it
 * still holds for the form nobody has written yet.
 */
{
  t('P0 arm · every seam was actually parsed — a green below is not an empty set meeting an empty set',
    showToSim.size >= 2 && simToShow.size >= 2 && simHandles && simHandles.size >= 1 && showHandles && showHandles.size >= 2,
    `show->sim ${[...showToSim.keys()].join(',')} · sim->show ${[...simToShow.keys()].join(',')}`
    + ` · expedition handles ${[...simHandles.keys()].join(',')} · simReport handles ${[...showHandles.keys()].join(',')}`);

  // ⚠️ THE OTHER TWO HALVES OF THIS ARM ARE ASSERTED AT `P0 arm b`/`P0 arm c`, BELOW P5. They are
  // properties of the WHOLE scan — every branch on every seam, every pattern in every file — and
  // an arm placed here would only have covered the two seams parsed above it, which is the same
  // partial-coverage mistake in a smaller size.
}

// =============================================================================================
// P1 · show -> sim
// =============================================================================================
/**
 * ⚠️ **THIS SEAM CARRIED A NAMED EXEMPTION FOR EXACTLY ONE COMMIT AND THE ARM RETIRED IT.**
 * `{t:'brief'}` was sent by `show.mjs`, pinned by `show-wire` X10, and handled by nothing — the
 * view took the wing, the seed, the episode and the camera count off its own query string. It was
 * listed here with its argument and an arm that went red the moment either end moved. The
 * television build then taught `views/expedition.js` to read the brief, the arm went red on the
 * next run, and the entry came out. That is what a list with an arm on it is for: the exemption
 * could not outlive the disagreement it described.
 *
 * The other half was closed in `show.mjs`: `{t:'cams'}` was a handler with no producer anywhere
 * in the tree, so a camera lit mid-show never reached the house drawing it. See `pushCams`.
 */
{
  const emits = setOf(showToSim.keys()), reads = setOf(simHandles.keys());
  const deadTraffic = only(emits, reads);
  const deadHandler = only(reads, emits);
  t('P1 · every message `show.mjs` sends the mansion is one `views/expedition.js` handles',
    deadTraffic.length === 0,
    deadTraffic.length ? `sent and never handled: ${deadTraffic.map((x) => `{t:'${x}'}`).join(', ')}` : `${[...emits].join(', ')}`);
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
 * `worldSeed` used to sit on this list on run.js's precedent — public so a show could be replayed
 * from four printed values, read from `/report` rather than off a screen. It is off the frame
 * entirely now, and the entry is gone, because P4b's arm refused to let the exemption outlive it.
 *
 * 🚨 AND THE EXEMPTION WAS THE WRONG SHAPE, NOT JUST STALE. "On the wire, rendered nowhere" is a
 * safe category for `tick` and was not one for a SEED. `pick(6, worldSeed, 'hunter', episode)` is
 * the Hunter's room and `episode` is rowed `all`, so two public fields COMPUTED a sealed one —
 * measured at 100% reconstruction against a 16.7% baseline by `party-isolation` I11's control.
 * A field nobody renders is not harmless when it is an input to a draw. Anything added here that
 * seeds anything belongs in the entitlement matrix's audience argument, not in this list.
 */
const ON_THE_WIRE_UNRENDERED = new Map([
  ['tick', 'the phase counter — frame identity for the isolation and reconnect gates, never a pixel'],
]);

/**
 * P4c's exemptions, at leaf depth. Two kinds, and the difference is stated rather than blurred:
 * a leaf the walker cannot SEE being read, and a leaf that genuinely is not read.
 */
const DARK_LEAVES = new Map([
  // Walker limitation, verified by hand. `show-phone.html`'s guide view does
  // `const g = frame.flyover || {}` inside the closure `mount()` returns, and `framePathsRead`'s
  // alias pass is scoped to the DECLARING BLOCK — deliberately, because a file-wide scan
  // mis-attributed `c` between `frame.call` and `frame.cameras` on the television. A nested
  // closure defeats it. Both are rendered: `g.hunter` sets the reading's colour and `g.room` is
  // printed through `ROOM_LABEL`.
  ['flyover.hunter', 'read as `g.hunter` in a nested closure the block-scoped alias pass cannot follow'],
  ['flyover.room', 'read as `g.room` in the same closure, printed through ROOM_LABEL'],
  // NOT a walker limitation — genuinely unread, and recorded rather than deleted. The phone
  // learns its seat from the `seated` envelope, which arrives before its first frame, so the
  // frame's copy is surplus. It comes from `viewFor`, which the Reunion shares, so removing it
  // here is a change to a function with another caller rather than a row deletion.
  ['you.seat', 'surplus — the phone takes its seat from the `seated` envelope, never from a frame'],
]);

/** Property names that belong to JavaScript rather than to the frame — see P4's loop. */
const BUILTIN = /\.(length|map|filter|find|findIndex|some|every|slice|join|forEach|sort|concat|indexOf|includes|reduce|push|reverse|flat|flatMap|keys|values|entries|toFixed|toString|padStart|padEnd|split|trim|replace|charAt|at)$/;

/** Direct `frame.a.b` chains plus one level of aliasing — `const you = frame.you || {}` then `you.x`. */
function framePathsRead(file) {
  const b = strip(src(file));
  const out = new Set();
  for (const m of b.matchAll(/\bframe((?:\.[A-Za-z_$][\w$]*)+)/g)) out.add(m[1].slice(1));
  // ⚠️ `(frame.incident || {}).alarms` — THE GUARD IDIOM, and the bare chain regex above stops at
  // the closing paren, so it yields `incident` and loses `alarms`. Both pages use this shape
  // constantly (`wing()`, every `<dt>Incidents</dt>`, the whole flyover), and P4c reported nine
  // correctly-rendered leaves as dark until it was taught this. It is one more chain form, not a
  // parser: `(frame.a.b || …).c` is `a.b.c`.
  for (const m of b.matchAll(/\(\s*frame((?:\.[A-Za-z_$][\w$]*)+)\s*\|\|[^)]*\)\s*\.([A-Za-z_$][\w$]*)/g)) {
    out.add(m[1].slice(1) + '.' + m[2]);
  }
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
  /**
   * 🚨 AND THE FRAME TAKEN APART RATHER THAN INDEXED. `const { incident: inc } = frame` matched
   * neither loop above — not `frame.<chain>`, not `const alias = …frame.<chain>` — so a page
   * written that way read the frame for NOTHING as far as P4 was concerned, and P4 walked an
   * empty set and printed `ok`. A television reading `inc.<a name no projection carries>` pins
   * the Incidents counter at 0 for the whole season, fully green. `patternReads` resolves the
   * pattern; `P0 arm c` catches the one it cannot.
   */
  for (const q of patternReads(b, 'frame', b, file)) out.add(q);
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
  /**
   * 🚨 **P4b COMPARES TOP-LEVEL KEYS, AND A NESTED FIELD IS INVISIBLE TO IT.** `readAnywhere` is
   * built from `p.split('.')[0]`, so once a page reads ANY path under `you`, every future field
   * added under `you` counts as rendered whether or not a pixel exists for it.
   *
   * Found by shipping one. `you.readings[]` — Continuity's dossier, the first private information
   * in the game that is not the role card — reached real phone frames and appeared on no screen,
   * and this gate stayed green because `you.roleName` was already read. `expedition.guideSaw` and
   * `expedition.hunterHere` went under `expedition` the same way and would have gone the same
   * distance if their television card had been forgotten.
   *
   * That is the session's own rule turned on the gate: P4b polices a real property, but the thing
   * it measures is a coarser object than the thing at risk. So P4c asks the same question at leaf
   * depth, where the frame actually gets added to.
   *
   * ⚠️ **WHAT P4c PROVES IS THAT A PATH IS MENTIONED, NOT THAT A PIXEL APPEARS.** Measured:
   * deleting the `record()` CALL from the television's execution card leaves P4c green, because
   * the function is still in the file and still names `frame.tally`. Deleting the function turns
   * it red at four leaves. So P4c catches a field nothing anywhere reads — which is the bug it
   * was built for, and the bug it actually found — and does NOT catch a field read only by dead
   * code. Stated here rather than left for someone to discover the hard way; a page-level render
   * assertion is a different instrument and `harness/scenarios/` is where it would live.
   *
   * ⚠️ **PREFIX COVERAGE IS ALLOWED ONLY ACROSS AN ARRAY HOP, AND THE CONTROL IS WHAT FORCED
   * THAT.** The first draft counted a leaf as read whenever any read path was a prefix of it.
   * `show-phone.html` opens with `const you = (frame && frame.you) || {}`, so `you` is itself a
   * read path — and a plain prefix rule then covers every field under `you` that will ever exist,
   * which is P4b's blindness rebuilt one level down. P4c passed and its control failed, which is
   * the control doing precisely the job it is here for.
   *
   * A page reads `frame.players` and then `p.name` inside a `.map()`, and no static walker this
   * file is willing to hand-roll recovers `players[].name` from that. THAT is the case worth
   * conceding, and it is identifiable: the unfollowable step is the array hop. So a prefix counts
   * only when the leaf crosses a `[]` at or after the prefix boundary. `you.readings[].episode`
   * is covered by a page reading `you.readings`; `you.anythingElse` is not covered by a page
   * reading `you`.
   */
  {
    const segs = (x) => x.split('.').filter(Boolean);
    const bare = (x) => x.replace(/\[\]$/, '');
    const readSegs = [...new Set(PAGES.flatMap(([, file]) => [...framePathsRead(file)]))]
      .filter(Boolean).map((r) => segs(r).map(bare));
    const covered = (leaf) => {
      const L = segs(leaf);
      const Lb = L.map(bare);
      return readSegs.some((r) => {
        if (r.length > L.length) return false;
        for (let i = 0; i < r.length; i++) if (r[i] !== Lb[i]) return false;
        if (r.length === L.length) return true;                 // exact
        // A strict prefix counts when the walker was stopped by a hop it cannot follow: an array
        // (`players[].name` read as `p.name` inside a `.map()`), or a DYNAMIC MAP. The matrix is
        // the authority on which segments are dynamic — `tally.counts.*` is a row, so `counts`
        // holds one key per player and no static walker recovers `tally.counts.p2` from a page
        // that iterates it. Asking `audienceFor` rather than pattern-matching the name means a
        // future map is covered the moment somebody writes its row, and never before.
        if (L.slice(r.length - 1).some((seg) => seg.endsWith('[]'))) return true;
        return audienceFor(L.slice(0, r.length + 1).join('.').replace(/[^.]+$/, '*')) !== null;
      });
    };
    const wireLeaves = [...new Set([...tv, ...phone])];
    const dark = wireLeaves.filter((l) => !covered(l))
      .filter((l) => !ON_THE_WIRE_UNRENDERED.has(l.split('.')[0]))
      .filter((l) => !DARK_LEAVES.has(l));
    t('P4c · and no LEAF on a real frame is dark — nested fields are checked, not just top keys',
      dark.length === 0,
      dark.length ? `on the wire, read by neither page: ${dark.join(', ')}`
        : `${wireLeaves.length} leaf paths on real frames, every one reachable from a page read`);
    // The same refusal P4b's arm makes: an exemption that has quietly become wrong is worse than
    // no exemption, because it is a hole with a reassuring comment on it.
    const staleLeaves = [...DARK_LEAVES.keys()]
      .filter((l) => covered(l) || !wireLeaves.includes(l));
    t('P4c arm · every leaf exemption is still on the wire and still unread — none has gone stale',
      staleLeaves.length === 0,
      staleLeaves.length ? `now rendered or gone from the wire, delete the entry: ${staleLeaves.join(', ')}`
        : `${DARK_LEAVES.size} entries, each with a reason, all live`);

    t('P4c control · the leaf walker tells a read leaf from an unread one, and does not let a bare `you` cover the world',
      covered('you.roleName') && covered('you.readings[].episode')
      && !covered('you.__nothing_reads_this__') && !covered('expedition.__invented__'),
      'exact match yes · across an array hop yes · an invented sibling under an aliased parent NO');
  }

  const stale = [...ON_THE_WIRE_UNRENDERED.keys()].filter((k) => !unrendered.includes(k));
  t('P4b arm · and every entry on that list is still genuinely unrendered',
    stale.length === 0, stale.length ? `now rendered, delete the entry: ${stale.join(', ')}` : `${ON_THE_WIRE_UNRENDERED.size} entries, all live`);
}

// =============================================================================================
// P5 · show -> the phones and the television
// =============================================================================================
/**
 * 🚨 **THE FIFTH SEAM, AND IT WAS NOT ONE OF THE FOUR.** Everything above watches the mansion and
 * the log. The envelope this process speaks to the two HTML pages —
 * `{t:'state'|'roster'|'seated'|'reunion'|'event'|'hello'|'refused'|'notice'|'full'|'late'|'ping'}`
 * — had no parity assertion anywhere in this suite, and it is the seam every player is looking at.
 * `P4` walks `frame`, which is the payload of exactly one of those eleven; the other ten and the
 * envelope around all of them were unchecked. Adding it named three dead fields on the first run.
 *
 * ⚠️ **THE TWO PAGES ARE TAKEN AS ONE CONSUMER, AND THAT IS A DELIBERATE WEAKENING.** `roster` is
 * sent to the television with `capacity` and to a phone with `you`; deciding statically which
 * socket a given `send(sock, …)` reaches would need the flow analysis this file has argued twice
 * it is not going to hand-roll. The union is sound in the direction that matters — a field READ
 * by either page and sent by nobody is still a bug, and that is the M4 shape — and it is weaker
 * in the other, where a field only the television is sent counts as read if the phone reads it.
 * That weakness is recorded here rather than papered over.
 *
 * ⚠️ **A BRANCH THAT KEEPS THE WHOLE ENVELOPE READS ALL OF IT.** `show-phone.html`'s `seated`
 * branch does `seat = m` and reads `seat.seat` from module scope for the rest of the show. Those
 * reads are real and are not inside the branch, so the branch is marked opaque and excluded from
 * P5d rather than being allowed to report four live fields as dead.
 */
const TV_PAGE = strip(src('net/party/show-tv.html'));
const PHONE_PAGE = strip(src('net/party/show-phone.html'));

/** Every literal envelope this process hands a phone or the television — never the mansion's. */
const showToRoom = (() => {
  const out = new Map();
  const merge = (m) => { for (const [ty, fs] of m) { if (!out.has(ty)) out.set(ty, new Set()); for (const f of fs) out.get(ty).add(f); } };
  merge(literalMessages(SHOW, /\bsend\((?!simSock\b)[^,{]*,\s*\{/g));
  merge(literalMessages(SHOW, /\bdeliver\([^,{]*,\s*\{/g));
  return out;
})();

/** What one page's `ws.onmessage` branches on and reads off the envelope. */
function pageHandles(text, label) {
  const m = text.match(/ws\.onmessage\s*=\s*\([^)]*\)\s*=>\s*\{/);
  const body = m ? balanced(text, m.index + m[0].length - 1) : null;
  if (!body) return null;
  const types = [...body.matchAll(/\bm\.t === '([^']+)'/g)].map((x) => x[1]);
  const out = new Map();
  for (const ty of types) {
    const at = body.indexOf(`m.t === '${ty}'`);
    const next = types.map((o) => body.indexOf(`m.t === '${o}'`)).filter((i) => i > at);
    const chunk = body.slice(at, next.length ? Math.min(...next) : body.length);
    const fields = new Set();
    for (const f of readsOf(text, 'm', chunk, 3, new Set(), `${label} {t:'${ty}'}`)) if (f !== 't') fields.add(f);
    // `seat = m` / `const x = m` — the envelope is kept whole and read from somewhere else.
    const opaque = /(?:^|[^.\w$])(?:const\s+|let\s+|var\s+)?[A-Za-z_$][\w$]*\s*=\s*m\s*[;,)]/.test(chunk);
    if (!fields.size && !opaque) BLIND.push(`${label}'s {t:'${ty}'} branch reads no field off \`m\` at all`);
    out.set(ty, { fields, opaque });
  }
  return out;
}
const tvHandles = pageHandles(TV_PAGE, 'show-tv.html');
const phoneHandles = pageHandles(PHONE_PAGE, 'show-phone.html');

/**
 * ⚠️ **THE FIELDS THIS PROCESS PUTS IN AN ENVELOPE AND NEITHER PAGE EVER OPENS, NAMED.** Every one
 * of these was found by adding this seam; none of them was known before. Three were named by the
 * critic that asked for the seam, three more fell out of the same scan. `show-phone.html` is not
 * this author's file, so two of them are a message to its author rather than a fix — which is
 * exactly what a parity gate is for.
 */
const ENVELOPE_UNREAD = new Map([
  ['hello.capacity', 'the television is told the room size and renders the code, the URL and the seats it has — never the ceiling'],
  ['roster.capacity', 'same number, same screen, same silence — a lobby that said `3/8` would read it'],
  ['roster.you', 'a phone learns its seat from `{t:\'seated\'}` and keeps it; the copy on every roster is never looked at'],
  ['full.capacity', 'the button says `Room is full` and never says how full — `show-phone.html`, another author'],
  ['refused.was', 'the phone prints `why` and drops WHAT was refused, so a stale tap and a wrong-phase tap read identically — `show-phone.html`, another author'],
  ['event.replay', '`catchUp` marks a replayed event so a page could avoid re-animating history; neither page distinguishes one'],
]);

{
  const sent = setOf(showToRoom.keys());
  const handled = setOf([...(tvHandles ? tvHandles.keys() : []), ...(phoneHandles ? phoneHandles.keys() : [])]);

  t('P5 arm · both pages were parsed and the envelope was extracted from the shipped `show.mjs`',
    showToRoom.size >= 8 && tvHandles && tvHandles.size >= 4 && phoneHandles && phoneHandles.size >= 5,
    `show.mjs sends ${showToRoom.size} envelope types · television handles ${tvHandles && tvHandles.size} · phone handles ${phoneHandles && phoneHandles.size}`);

  const deadTraffic = only(sent, handled);
  t('P5 · every envelope `show.mjs` sends the room is one a page handles',
    deadTraffic.length === 0,
    deadTraffic.length ? `sent and never handled: ${deadTraffic.map((x) => `{t:'${x}'}`).join(', ')}` : `${[...sent].join(', ')}`);
  const deadHandler = only(handled, sent);
  t('P5b · and every envelope a page handles is one this process sends',
    deadHandler.length === 0,
    deadHandler.length ? `handled and never sent: ${deadHandler.map((x) => `{t:'${x}'}`).join(', ')}` : `${[...handled].join(', ')}`);

  /**
   * 🚨 THIS IS THE ASSERTION M4 AND M5 WOULD HAVE FAILED IF THIS SEAM HAD EXISTED. A page reading
   * a field under a name the envelope does not carry — by chain or by pattern, it is the same
   * read now — is the whole bug class, one seam over.
   */
  const gaps = [];
  for (const [page, hs] of [['show-tv.html', tvHandles], ['show-phone.html', phoneHandles]]) {
    for (const [ty, { fields }] of hs) {
      const got = showToRoom.get(ty);
      if (!got) continue;                        // P5b's business
      for (const f of fields) {
        if (f === '*' || got.has(f)) continue;
        const head = f.split('.')[0];
        if (got.has(head) && !f.includes('.')) continue;
        if (got.has(head) && ![...got].some((g) => g.startsWith(head + '.'))) continue;
        gaps.push(`${page} reads \`${ty}.${f}\` and this process sends {t:'${ty}'} with [${[...got].join(', ')}]`);
      }
    }
  }
  t('P5c · and every field a page reads off an envelope is a field that envelope carries',
    gaps.length === 0, gaps[0] || 'no field is read under a name it is not sent under');

  const unread = [];
  for (const [ty, got] of showToRoom) {
    const readers = [tvHandles.get(ty), phoneHandles.get(ty)].filter(Boolean);
    if (readers.some((r) => r.opaque)) continue;             // the envelope is kept whole
    const want = new Set(readers.flatMap((r) => [...r.fields]));
    for (const f of got) {
      if (want.has(f) || want.has('*')) continue;
      if ([...want].some((w) => w.startsWith(f + '.'))) continue;
      unread.push(`${ty}.${f}`);
    }
  }
  const surprises = unread.filter((x) => !ENVELOPE_UNREAD.has(x));
  t('P5d · and nothing new is put in an envelope neither page opens',
    surprises.length === 0,
    surprises.length ? `sent and dropped: ${surprises.join(', ')}`
      : `${unread.length} known-unread fields, each named with a reason: ${unread.join(', ')}`);
  const stale = [...ENVELOPE_UNREAD.keys()].filter((x) => !unread.includes(x));
  t('P5d arm · and every entry on that list is still genuinely unread — the list cannot become cover',
    stale.length === 0, stale.length ? `now read, delete the entry: ${stale.join(', ')}` : `${ENVELOPE_UNREAD.size} entries, all live`);
}
// =============================================================================================
// P0 arm, closed · the two invariants that hold across every seam above
// =============================================================================================
/**
 * 🚨 **THIS IS THE W1 FIX, AND IT IS TWO ASSERTIONS RATHER THAN TWO PATTERNS.**
 *
 * `readsOf` matched `<name>.<field>` and followed `fn(name)` three deep. A DESTRUCTURING pattern
 * yields neither, so a branch written `const { unlocked } = m` produced an empty read set, and
 * every field-parity loop in this file iterates over the read set — an empty one is a loop body
 * that never runs and an assertion that prints `ok` having compared nothing. Two real product
 * defects were demonstrated on the shipped tree that way, both fully green across all gates:
 * `{t:'cams', lit}` against `const { unlocked } = m` (the live camera count stops reaching the
 * running house — `pushCams`'s bug, restored), and `const { incident: inc } = frame` on the
 * television (the Incidents counter pinned at 0 for the season).
 *
 * `patternReads` now resolves those patterns, and P9.5/P9.6 prove it on mutated source. But
 * resolving two patterns is fixing two patterns. **These two arms are the class**, and neither
 * of them depends on recognising any syntax:
 *
 *   `P0 arm b`  a branch that yields NO field is a parse failure, not a pass. It holds for
 *               `m['unlocked']`, `{...m}`, `Object.entries(m)`, `structuredClone(m)` and every
 *               form nobody has written yet, because it tests the OUTPUT of the scan.
 *   `P0 arm c`  a binding off a watched value that this file could not turn into names is
 *               reported and goes red. It holds for the forms that DO yield something and yield
 *               the wrong thing.
 *
 * The alternative considered and rejected was a real parse. Node bundles no AST parser; `new
 * Function` validates syntax and returns no tree, and `Function.prototype.toString` returns the
 * source it was given. Vendoring a parser puts a dependency in a gate whose whole argument is
 * that it reads shipped source with no build step, and hand-rolling one is thousands of lines to
 * make an extractor complete — when completeness is not what was missing. What was missing was
 * the admission of incompleteness. A scanner that says "I read nothing here" and is believed is
 * the bug; a scanner that says "I read nothing here" and goes red is a gate. The structural
 * helpers below (`balanced`, `matchEnd`, `topLevelParts`, `topLevelIndex`) are already a
 * bracket-matching tokeniser over the grammar these seams actually use, which is the right size.
 */
{
  const blind = BLIND.filter((b) => !READS_NOTHING.has(b));
  const branches = simHandles.size + showHandles.size + tvHandles.size + phoneHandles.size;
  t('P0 arm b · every watched branch on every seam yielded at least one field — an empty read set is a parse failure, not a pass',
    blind.length === 0,
    blind.length ? blind.join(' · ')
      : `${branches} branches across five seams, ${BLIND.length} of them named as reading nothing`);
  const talkative = [...READS_NOTHING.keys()].filter((k) => !BLIND.includes(k));
  t('P0 arm b arm · and every branch named as reading nothing still reads nothing',
    talkative.length === 0,
    talkative.length ? `now reads a field — delete the entry and let the parity loops have it: ${talkative.join(' · ')}`
      : `${READS_NOTHING.size} entries, all live`);

  t('P0 arm c · and no binding off a watched value went unresolved — a pattern this file cannot read is a red gate, never a silence',
    PARSE_TROUBLE.length === 0,
    PARSE_TROUBLE.length ? PARSE_TROUBLE.join(' · ')
      : 'every destructure, alias and handed-off parameter on all five seams resolved to names');
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
  const wantsBrief = simHandles.get('brief') || new Set();
  const wouldMiss = [...wantsBrief].filter((f) => !renamedBrief.has(f));
  t('P9.1 control · rename the brief\'s field to `unlocked` and P1c goes red — the house still reads `cameras`',
    wantsBrief.size > 0 && wouldMiss.includes('cameras'),
    `the house reads [${[...wantsBrief].join(', ')}]; the renamed brief sends [${[...renamedBrief].join(', ')}]`
    + ` — missing ${wouldMiss.join(', ')}`);

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

  // ---- P1c / P0 arm b: M4 — the shipped `{t:'cams'}` seam, renamed on one side and
  //      destructured on the other. Fully green across all twenty-eight gates before W1.
  const M4_SHOW = SHOW.replace("send(simSock, { t: 'cams', unlocked: live });", "send(simSock, { t: 'cams', lit: live });");
  const M4_EXPED = EXPED.replace(
    "if (m.t === 'cams' && Number.isInteger(m.unlocked)) camerasUnlocked = Math.max(1, m.unlocked);",
    "if (m.t === 'cams') { const { unlocked } = m; if (Number.isInteger(unlocked)) camerasUnlocked = Math.max(1, unlocked); }");
  t('P9 arm e · the M4 edit landed on both halves of the shipped text',
    M4_SHOW !== SHOW && M4_EXPED !== EXPED, "`unlocked: live` -> `lit: live`, and `m.unlocked` -> `const { unlocked } = m`");
  const m4Sent = (literalMessages(M4_SHOW, /send\(simSock,\s*\{/g).get('cams') || new Set());
  const m4Chunk = (() => {
    const mm = M4_EXPED.match(/sock\.onmessage\s*=\s*\([^)]*\)\s*=>\s*\{/);
    const body = balanced(M4_EXPED, mm.index + mm[0].length - 1);
    const at = body.indexOf("m.t === 'cams'");
    return body.slice(at);
  })();
  const m4Read = readsOf(M4_EXPED, 'm', m4Chunk, 3, new Set(), 'control M4');
  t('P9.5 control · destructure the `cams` branch and rename the field, and P1c goes red — the live camera count stops reaching the house',
    m4Read.has('unlocked') && !m4Sent.has('unlocked'),
    `the house reads [${[...m4Read].filter((f) => f !== 't').join(', ')}] out of a destructuring pattern; the renamed message sends [${[...m4Sent].join(', ')}]`);
  // The half that matters more than the rename: the OLD extractor saw nothing in that branch.
  const m4Blind = new Set([...m4Chunk.matchAll(/\bm\.([A-Za-z_$][\w$]*)/g)].map((x) => x[1]).filter((f) => f !== 't'));
  t('P9.5b control · and the pre-W1 extractor — `m.<field>` plus `fn(m)` — read ZERO fields out of that same branch',
    m4Blind.size === 0 && m4Read.size > 0,
    `chain-and-call scan: {${[...m4Blind].join(', ')}} · binding-aware scan: {${[...m4Read].filter((f) => f !== 't').join(', ')}}`
    + ' — an empty set is what made P1c green over a restored Fatal');

  // ---- P4 / P0 arm b: M5 — the same hole on the frame side of the wire.
  const TV_RAW = strip(src('net/party/show-tv.html'));
  const M5_TV = TV_RAW.replace("$('alarms').textContent = (frame.incident || {}).alarms || 0;",
    "const { incident: inc } = frame;\n    $('alarms').textContent = (inc || {}).alarmsThisSeason || 0;");
  t('P9 arm f · the M5 edit landed on the shipped television', M5_TV !== TV_RAW,
    "`(frame.incident || {}).alarms` -> `const { incident: inc } = frame` then `inc.alarmsThisSeason`");
  const m5Old = new Set([...M5_TV.matchAll(/\bframe((?:\.[A-Za-z_$][\w$]*)+)/g)].map((x) => x[1].slice(1)));
  const m5New = new Set([...m5Old, ...patternReads(M5_TV, 'frame', M5_TV, 'control M5')]);
  t('P9.6 control · destructure the frame on the television and P4 goes red — `incident.alarmsThisSeason` is on no projection',
    m5New.has('incident.alarmsThisSeason') && !m5Old.has('incident.alarmsThisSeason'),
    'the chain scan saw the alias and nothing under it; the binding-aware scan resolves `inc.alarmsThisSeason` to `frame.incident.alarmsThisSeason`');

  // ---- P0 arm c: a pattern the resolver cannot name must be REPORTED, never dropped.
  const before = PARSE_TROUBLE.length;
  const M7 = EXPED.replace("if (m.t === 'brief') arm(m);", "if (m.t === 'brief') { const { [pickField()]: v } = m; arm(v); }");
  t('P9 arm g · the computed-key edit landed on the shipped text', M7 !== EXPED, '`arm(m)` -> `const { [pickField()]: v } = m`');
  readsOf(M7, 'm', M7.slice(M7.indexOf("m.t === 'brief'")), 1, new Set(), 'control M7');
  const raised = PARSE_TROUBLE.slice(before);
  t('P9.7 control · bind a computed key off the envelope and P0 arm c goes red — an unreadable pattern is reported, not dropped',
    raised.length > 0, raised[0] || 'nothing was raised, which is the whole failure mode');
  PARSE_TROUBLE.length = before;   // the control's own noise is not the shipped tree's
}

console.log(`\nwire-parity: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
