#!/usr/bin/env node
/**
 * `localise-1`'s BYTE-IDENTITY GATE for the room-local refactor of `src/game/spaces.js`.
 *
 *   node harness/evidence/_loc1_golden.mjs --write <file>    record the module's whole surface
 *   node harness/evidence/_loc1_golden.mjs --check <file>    compare it, leaf by leaf, with Object.is
 *
 * WHY THIS AND NOT PIXELS. The refactor expresses every room in its own local frame and then
 * places it back where it already was, so the deliverable is a NO-OP: `SPACES` must come out of
 * `roomsFromPlan()` with the same doubles it was authored with. That is a stronger and cheaper
 * proof than a render diff — if the module's exported surface is bit-identical then no consumer
 * can observe the change at all — and a render diff is the confirmation, not the proof.
 *
 * ⚠️ `Object.is`, NOT `===`, and the difference is load bearing: `-0` and `0` compare equal
 * under `===` and are different doubles. A placement transform is exactly the kind of code that
 * turns `0` into `-0` (`0 * -1`), and `Math.atan2`/`Math.sign` read the sign of zero.
 *
 * ⚠️ JSON round-trips doubles exactly (`JSON.stringify` emits the shortest round-tripping
 * decimal), so the recorded file is not a lossy approximation of the golden values.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import * as S from '../../src/game/spaces.js';

function surface() {
  return {
    WALL_T: S.WALL_T, DOOR_H: S.DOOR_H,
    PANEL_W: S.PANEL_W, PANEL_H: S.PANEL_H, PANEL_CY: S.PANEL_CY,
    SPACES: S.SPACES,
    INNER_WALLS: S.INNER_WALLS,
    PORTALS: S.PORTALS,
    PANELS: S.PANELS,
    CONNECTORS: S.CONNECTORS,
    EXIT_SITES: S.EXIT_SITES.map((s) => s.id),
    PATROL_ROUTE: S.PATROL_ROUTE,
    SPAWN: S.SPAWN,
    ANCHORS: S.ANCHORS,
    exports: Object.keys(S).sort(),
  };
}

/** Every leaf, as `path -> value`, so a diff names the field rather than the object. */
function flatten(v, at = '', out = new Map()) {
  if (v === null || typeof v !== 'object') { out.set(at, v); return out; }
  if (Array.isArray(v)) {
    out.set(`${at}.length`, v.length);
    v.forEach((x, i) => flatten(x, `${at}[${i}]`, out));
    return out;
  }
  const keys = Object.keys(v).sort();
  out.set(`${at}{}`, keys.join(','));
  for (const k of keys) flatten(v[k], at ? `${at}.${k}` : k, out);
  return out;
}

const argv = process.argv.slice(2);
const mode = argv[0];
const file = argv[1];
if (!file || (mode !== '--write' && mode !== '--check')) {
  console.error('usage: _loc1_golden.mjs --write|--check <file>');
  process.exit(2);
}

if (mode === '--write') {
  writeFileSync(file, JSON.stringify(surface(), null, 1));
  const n = flatten(surface()).size;
  console.log(`wrote ${file} — ${n} leaves`);
  process.exit(0);
}

/**
 * ⚠️ **THE EXPORT LIST IS COMPARED SEPARATELY AND ADDITIONS ARE ALLOWED, DELETIONS ARE NOT.**
 * The refactor deliberately ADDS handles a generator needs (`ROOMS`, `HOUSE_PLAN`, `placeRoom`,
 * `roomsFromPlan`, `rotYOf`). Folding those into the leaf diff would bury the one claim that
 * matters — that no VALUE moved — under an index shift in a string array. Removing an export is
 * still a hard failure, because that is a consumer breaking.
 */
const goldenRaw = JSON.parse(readFileSync(file, 'utf8'));
const liveRaw = surface();
const oldExports = goldenRaw.exports ?? [];
const newExports = liveRaw.exports ?? [];
delete goldenRaw.exports; delete liveRaw.exports;
const added = newExports.filter((n) => !oldExports.includes(n));
const removed = oldExports.filter((n) => !newExports.includes(n));

const want = flatten(goldenRaw);
const have = flatten(liveRaw);
const bad = [];
for (const n of removed) bad.push([`exports:${n}`, 'present', '<REMOVED>']);
for (const [k, v] of want) if (!Object.is(v, have.get(k))) bad.push([k, v, have.get(k)]);
for (const k of have.keys()) if (!want.has(k)) bad.push([k, '<absent>', have.get(k)]);

console.log(`${want.size} golden leaves · ${have.size} live leaves · ${bad.length} differing`);
console.log(`exports: ${newExports.length} names · added [${added.join(', ') || 'none'}] · removed [${removed.join(', ') || 'none'}]`);
for (const [k, a, b] of bad.slice(0, 40)) console.log(`  ${k}: golden ${JSON.stringify(a)} -> now ${JSON.stringify(b)}`);
if (bad.length) { console.log('BYTE-IDENTICAL: NO'); process.exit(1); }
console.log('BYTE-IDENTICAL: YES — every exported leaf is Object.is-equal to the golden');
