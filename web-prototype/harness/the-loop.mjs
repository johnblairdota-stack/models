#!/usr/bin/env node
/**
 * 🔁 **THE LOOP — the playtest-critic loop's own gate.**
 *
 * The board (`web-prototype/the-loop/`, `npm run the-loop`, :5211) pitches one discipline: a
 * finding is not FILED until it is a hole a machine can check, and a loop is not DONE until its
 * record quotes chrome. This gate is the mechanical half of both sentences:
 *
 *  - Every hole in `the-loop/holes.json` carries all eight fields — id, episode, beat, tag,
 *    saw, expected, so, next — non-empty, ids unique. A missing field is a transcript wearing a
 *    JSON costume, which is exactly how five agents' findings died in August.
 *  - A loop with `status: "done"` must QUOTE CHROME — a non-empty list of non-empty strings,
 *    each one verbatim text photographed off a screen — and must record both live ports parked:
 *    5178 (vite dev) and 5181 (John's live room). The gate can only check the strings exist;
 *    that they are VERBATIM is the critic's oath, stated in the file's own `about`.
 *  - The protected records — dusk6, barn5, heat7, barn6 — are named in `protected` and the one
 *    backfilled loop record (dusk6) is still present. A loop appends; it never wipes.
 *  - The board itself exists, names this gate, carries the done rule, serves on 5211 and only
 *    5211 (5199 is The Desk's, 5205 the night board's, 5207/5209 other boards'), and this gate
 *    runs in the `gates:party` chain — a DONE claim outside the chain is the NC10 lesson.
 *
 * Controls, because a checker that cannot fail proves nothing (`night-coupling` NC10c's shape):
 * LP2b deletes each of the eight fields in turn and the checker must refuse every time; LP3c
 * feeds a done loop with no chrome and a done loop with 5181 unparked and both must be refused.
 *
 * Pure file-reading — this gate binds NO port, so it can never collide with a live room. All
 * source reads normalise CRLF→LF (`host-desync` H8's lesson: a bare \n pattern reddens on one
 * machine only).
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const t = (n, c, d = '') => { if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); } else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); } return c; };
const lf = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const HOLE_FIELDS = ['id', 'episode', 'beat', 'tag', 'saw', 'expected', 'so', 'next'];
const PARKED = [5178, 5181];
const PROTECTED = ['dusk6', 'barn5', 'heat7', 'barn6'];

/** A field is present when it exists and is not empty — the number 0 is a value, '' is not. */
const has = (v) => v !== undefined && v !== null && v !== '';

/** The rule, asked of data. Returns human-readable violations; [] is clean. */
function holeViolations(holes) {
  const bad = [];
  const seen = new Set();
  for (const h of holes ?? []) {
    for (const f of HOLE_FIELDS) if (!has(h[f])) bad.push(`hole ${h.id ?? '?'} lacks ${f}`);
    if (has(h.id)) { if (seen.has(h.id)) bad.push(`duplicate hole id ${h.id}`); seen.add(h.id); }
  }
  return bad;
}

/** DONE = quoted chrome + parked 5178/5181. An open loop owes neither yet. */
function loopViolations(loops) {
  const bad = [];
  for (const l of loops ?? []) {
    if (!has(l.id) || !has(l.status)) { bad.push(`a loop lacks id or status`); continue; }
    if (l.status !== 'done') continue;
    const chrome = Array.isArray(l.chrome) ? l.chrome.filter((c) => typeof c === 'string' && c.trim()) : [];
    if (chrome.length === 0) bad.push(`loop ${l.id} claims done without quoting chrome`);
    for (const p of PARKED) if (!(Array.isArray(l.parked) && l.parked.includes(p))) bad.push(`loop ${l.id} claims done without parking ${p}`);
  }
  return bad;
}

// ---------------------------------------------------------------- the shipped arm
let data = null, dataErr = '';
try { data = JSON.parse(lf(join(here, '../the-loop/holes.json'))); } catch (e) { dataErr = String(e); }

t('LP1 · the-loop/holes.json exists, parses, and holds loops[] and holes[]',
  !!data && Array.isArray(data.loops) && Array.isArray(data.holes),
  data ? `${data.loops?.length ?? 0} loops · ${data.holes?.length ?? 0} holes` : dataErr);

{
  const bad = data ? holeViolations(data.holes) : ['no data'];
  t('LP2 · every hole carries all eight fields, non-empty, ids unique',
    bad.length === 0, bad.join(' · ') || `${data.holes.length} holes clean`);
}

{
  // The control: delete each field in turn — the checker must refuse all eight, every time.
  const whole = { id: 'x', episode: 1, beat: 'vote', tag: 't', saw: 's', expected: 'e', so: 'o', next: 'n' };
  const refusedEach = HOLE_FIELDS.every((f) => {
    const cut = { ...whole }; delete cut[f];
    return holeViolations([cut]).some((v) => v.includes(`lacks ${f}`));
  });
  const acceptsWhole = holeViolations([whole]).length === 0;
  const refusesEmpty = holeViolations([{ ...whole, saw: '' }]).length > 0;
  const refusesDup = holeViolations([whole, { ...whole }]).some((v) => v.includes('duplicate'));
  t('LP2b control · the checker refuses each missing field, an empty field, and a duplicate id — and accepts a whole hole',
    refusedEach && acceptsWhole && refusesEmpty && refusesDup,
    `8 deletions refused ${refusedEach} · whole accepted ${acceptsWhole}`);
}

{
  const bad = data ? loopViolations(data.loops) : ['no data'];
  t('LP3 · no loop claims done without quoting chrome, and every done loop parked 5178 and 5181',
    bad.length === 0, bad.join(' · ') || `${data.loops.length} loops clean`);
}

{
  const mute = { id: 'bad1', status: 'done', chrome: [], parked: PARKED };
  const blank = { id: 'bad2', status: 'done', chrome: ['   '], parked: PARKED };
  const bounced = { id: 'bad3', status: 'done', chrome: ['REAL CHROME'], parked: [5178] };
  const honest = { id: 'ok1', status: 'open', chrome: [], parked: PARKED };
  t('LP3c control · the checker refuses done-with-no-chrome, done-with-blank-chrome, done-without-5181-parked — and accepts an open loop owing nothing',
    loopViolations([mute]).some((v) => v.includes('without quoting chrome'))
      && loopViolations([blank]).some((v) => v.includes('without quoting chrome'))
      && loopViolations([bounced]).some((v) => v.includes('parking 5181'))
      && loopViolations([honest]).length === 0,
    'all three red · open loop clean');
}

t('LP4 · the protected records are named and the backfilled dusk6 loop is still in the file — a loop appends, never wipes',
  !!data && PROTECTED.every((p) => (data.protected ?? []).includes(p))
    && (data.loops ?? []).some((l) => l.id === 'dusk6' && l.status === 'done'),
  `protected: ${(data?.protected ?? []).join(', ') || 'none'}`);

// ---------------------------------------------------------------- the board
{
  let html = '';
  try { html = lf(join(here, '../the-loop/index.html')); } catch { /* LP5 says so */ }
  t('LP5 · the board exists, reads holes.json, names this gate, and carries the done rule in words',
    html.includes("fetch('holes.json')") && html.includes('the-loop.mjs')
      && html.includes('5178') && html.includes('5181')
      && /quotes chrome/i.test(html) && !html.includes('data-verify="skip"'),
    html ? 'board clean' : 'the-loop/index.html missing');

  const pkg = JSON.parse(lf(join(here, '../package.json')));
  const script = (pkg.scripts ?? {})['the-loop'] ?? '';
  t('LP6 · npm run the-loop serves the-loop/ on 5211 and nowhere near a live or taken port',
    script.includes('--dir the-loop') && script.includes('--port 5211')
      && !/5199|5205|5207|5209|5178|5181/.test(script),
    script || 'the-loop script missing');

  // The collision this line buys back: `nom-receipt` bound 5211 for its test server, so a
  // running board killed that gate EADDRINUSE mid-chain (2026-09-02, seen live). The board's
  // port is the product decision; a gate's test port is bookkeeping, so the gate moved (5213).
  const squatters = readdirSync(here).filter((f) =>
    f.endsWith('.mjs') && f !== 'the-loop.mjs' && /PORT\s*=\s*5211\b/.test(lf(join(here, f))));
  t('LP6b · no harness gate binds the board\'s port — 5211 belongs to npm run the-loop alone',
    squatters.length === 0, squatters.join(', ') || 'harness scanned, no squatter');

  const chain = (pkg.scripts ?? {})['gates:party'] ?? '';
  t('LP7 · this gate runs in gates:party — a done claim outside the chain is the NC10 lesson',
    chain.includes('harness/the-loop.mjs'), chain ? 'in chain' : 'gates:party missing');
}

console.log(`\nthe-loop: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
