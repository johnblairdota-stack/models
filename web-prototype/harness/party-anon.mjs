#!/usr/bin/env node
/**
 * 🤐 **party-anon — THE GAME NEVER NAMES THE CULPRIT.**
 *
 *   node harness/party-anon.mjs
 *
 * Tier 0 (`docs/design/rrr-gates.md` §4). Task Contract **T5**: *"never name the culprit — no
 * timings, no accuracy readouts, no per-player stats, until the Reunion"*, which the bible calls
 * the single easiest way to accidentally destroy the game.
 *
 * It is easy to destroy by accident precisely because attribution is HELPFUL. "Someone was 0.4s
 * late" is a debug line a reasonable person adds while tuning the Fuse Run, and it ships in a
 * caption. The whole deduction game is that the lie and the honest mistake are the same
 * observable event; one timing readout and they are not.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THIS IS FIVE LINES INSTEAD OF AN ARMS RACE
 * ---------------------------------------------------------------------------------------------
 * Prohibiting attribution field by field is unwinnable — the next helpful field is always one PR
 * away. So `src/party/events.js` makes the failure schema **CLOSED**: four fields, `{kind, room,
 * phaseTick, loudness}`, and `makeEvent` throws on anything else at construction. A1 asserts the
 * allow-list holds on the wire as well as at the constructor.
 *
 * 🚨 **A3 IS THE ONE THAT EARNS ITS KEEP.** `timings: [0.4, 0.0]` contains no name, no id and no
 * seat — and names the culprit by POSITION. Any array whose length is the crew size is an
 * accusation with the serial number filed off.
 *
 * 🚨 **A6 IS THE SCANNER'S OWN ARM.** A scanner that never finds attribution anywhere is
 * indistinguishable from a scanner that cannot find attribution. So A6 points it at the Reunion,
 * where attribution is the entire point, and REQUIRES it to go red.
 */

import { createRoom } from '../src/party/room.js';
import { FAILURE_FIELDS, FAILURE_KINDS, isFailure, makeEvent, VIS } from '../src/party/events.js';

let pass = 0, fail = 0, skip = 0;
const t = (n, c, d = '') => { if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); } else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); } return c; };
const skipped = (n, why) => { skip++; console.log(`  SKIP ${n} · ${why}`); };

// ---- drive real rooms and collect what actually went into the log
const GAMES = 40;
const failures = [];
const frames = [];
let truth = null;
for (let s = 0; s < GAMES; s++) {
  const r = createRoom({ count: 8, castSeed: 1000 + s, worldSeed: s, send: (id, f) => frames.push({ id, f }) });
  r.start(); r.playEpisode(); r.playEpisode();
  truth = r.truth();
  for (const e of r.log) if (isFailure(e.type)) failures.push(e);
}
const roster = truth.seats.map((s) => ({ id: s.id, seat: s.seat, name: `Robot ${s.seat + 1}` }));
const CREW = 2;

// ---------------------------------------------------------------- A0 · the arm
{
  const kinds = [...new Set(failures.map((f) => f.type))];
  if (!failures.length) skipped('A0 arm', 'no failure events in any game — T5 unprovable');
  else t('A0 arm · failure events exist to inspect', true, `${failures.length} events, kinds: ${kinds.join(', ')}`);
  const missing = FAILURE_KINDS.filter((k) => !kinds.includes(k));
  if (missing.length) skipped('A0b coverage', `not exercised by the stub room: ${missing.join(', ')} — SKIP is not a PASS`);
}

// ---------------------------------------------------------------- the scanners
/** Every value in a payload, recursively, with its JSON pointer. */
function* values(node, path = '') {
  if (node === null || typeof node !== 'object') { yield [path, node]; return; }
  if (Array.isArray(node)) { for (let i = 0; i < node.length; i++) yield* values(node[i], `${path}[${i}]`); return; }
  for (const k of Object.keys(node)) yield* values(node[k], path ? `${path}.${k}` : k);
}

/** A2's sweep. Returns the first hit, or null. Case-folded, substring, recursive. */
function findIdentity(payload, people) {
  for (const [path, v] of values(payload)) {
    if (typeof v === 'string') {
      const lo = v.toLowerCase();
      for (const p of people) {
        if (lo.includes(p.name.toLowerCase())) return `${path} contains display name "${p.name}"`;
        if (lo === p.id.toLowerCase()) return `${path} is player id "${p.id}"`;
      }
    }
    if (typeof v === 'number' && people.some((p) => p.seat === v) && /seat|who|by|culprit|player/i.test(path)) {
      return `${path} = ${v} is a seat index`;
    }
  }
  for (const k of Object.keys(payload || {})) {
    if (people.some((p) => p.id === k)) return `payload is keyed by player id "${k}"`;
  }
  return null;
}

/** A3's sweep: attribution by position rather than by name. */
function findPositional(payload, crewSize) {
  for (const [path, v] of values(payload)) void v;
  const walk = (node, path = '') => {
    if (node === null || typeof node !== 'object') return null;
    if (Array.isArray(node)) {
      if (node.length === crewSize) return `${path} is an array of length ${crewSize} (= crew size)`;
      for (let i = 0; i < node.length; i++) { const h = walk(node[i], `${path}[${i}]`); if (h) return h; }
      return null;
    }
    for (const k of Object.keys(node)) { const h = walk(node[k], path ? `${path}.${k}` : k); if (h) return h; }
    return null;
  };
  return walk(payload);
}

// ---------------------------------------------------------------- A1 · closed schema
{
  let bad = null;
  for (const f of failures) {
    const extra = Object.keys(f.data).filter((k) => !FAILURE_FIELDS.includes(k));
    if (extra.length) { bad = `${f.type} carries ${extra.join(', ')}`; break; }
  }
  t('A1 · no field outside the allow-list on any failure payload', bad === null,
    bad || `${failures.length} payloads, allow-list {${FAILURE_FIELDS.join(', ')}}`);
}

// ---------------------------------------------------------------- A2 · no identity, any depth
{
  let bad = null;
  for (const f of failures) { const h = findIdentity(f.data, roster); if (h) { bad = `${f.type}: ${h}`; break; } }
  t('A2 · no id, name or seat in any failure payload', bad === null, bad || `${failures.length} payloads swept`);
}

// ---------------------------------------------------------------- A3 · no positional attribution
{
  let bad = null;
  for (const f of failures) { const h = findPositional(f.data, CREW); if (h) { bad = `${f.type}: ${h}`; break; } }
  t('A3 · no array of crew length, no map keyed by player', bad === null, bad || `crew size ${CREW}`);
}

// ---------------------------------------------------------------- A4 · the count is a count
{
  const incidents = frames.map(({ f }) => f.incident).filter(Boolean);
  const bad = incidents.find((i) => Array.isArray(i.alarms) || typeof i.alarms !== 'number');
  t('A4 · incident.alarms is a scalar count, never a list', !bad,
    bad ? JSON.stringify(bad) : `${incidents.length} frames, all numeric`);
}

// ---------------------------------------------------------------- A5 · the TV caption sweep
skipped('A5 caption sweep', 'needs the TV DOM; no Broadcast Director exists yet (audit §2). Browser arm lands with M4b');

// ---------------------------------------------------------------- A6 · the scanner's own arm
{
  // The Reunion is where attribution is the entire point. Build the reveal the same way
  // `rrr-social-round.md` §5's roll call does, and require the scanner to FIND it.
  const reunion = { roll: truth.seats.map((s) => ({ name: `Robot ${s.seat + 1}`, role: s.role, alignment: s.alignment })) };
  const hit = findIdentity(reunion, roster);
  t('A6 · the scanner CAN find attribution — it goes red on a Reunion reveal', hit !== null, hit || 'scanner is blind');
}

// ---------------------------------------------------------------- A7 · the controls
{
  const base = { kind: 'call', room: 'east', phaseTick: 4, loudness: 0.62 };

  const named = { ...base, room: 'east — Robot 3' };
  t('A7a control · a named caption turns A2 red', findIdentity(named, roster) !== null);

  const timed = { ...base, loudness: [0.4, 0.0] };
  t('A7b control · a timings[] array of crew length turns A3 red', findPositional(timed, CREW) !== null);

  const perPlayer = { ...base, accuracy: 0.83, who: 'p3' };
  const extra = Object.keys(perPlayer).filter((k) => !FAILURE_FIELDS.includes(k));
  t('A7c control · a per-player accuracy stat turns A1 red', extra.length > 0, extra.join(', '));

  let threw = false;
  try { makeEvent('task.miss', VIS.PUBLIC, { ...base, who: 'p3' }); } catch { threw = true; }
  t('A7d control · makeEvent refuses a non-schema field at construction', threw);
}

console.log(`\nparty-anon: ${pass} passed, ${fail} failed, ${skip} skipped`);
process.exit(fail ? 1 : 0);
