#!/usr/bin/env node
/**
 * 🎴 **_cast-table — TWO TABLES IN `cast.js` WERE WRITTEN APART AND THEY COLLIDE, AND FOUR CARDS
 * ARE UNREACHABLE AT SIX ROLE/COUNT PAIRS BECAUSE OF IT.**
 *
 * The Static and The Method Actor cannot be dealt at 5 or 6 players, The Plant cannot be dealt at
 * 6, and The Fixer cannot be dealt at 8 — 0 appearances in 40,000 deals each, across two unrelated
 * seed families, and structurally 0 rather than merely unobserved (C1b).
 *
 *   node harness/evidence/_cast-table.mjs        (~5 min: 300k deals + ~17.5k full matches)
 *
 * `src/party/cast.js` carries `COMPOSITION` (how many seats of each KIND at each count) and
 * `GUARANTEED` (which specific ROLES are forced in at each count). They were authored separately.
 * `dealCast`'s `pick()` fills a kind's slots with the guaranteed roles FIRST and then draws the
 * remainder — `draw(byKind(kind), guaranteed, want - guaranteed.length, rand)` — so when the
 * guarantee for a kind is as long as that kind's slot count, `want - guaranteed.length` is 0, the
 * draw is empty, and **every other role of that kind is not merely rare, it is impossible.**
 *
 * That is a structural property of the two tables, not a sampling result, and this file reports it
 * both ways: the exact count of appearances over a large seeded sweep (C1) AND the crowd-out
 * condition read straight off the shipped tables (C1b), because a "0 in 100,000" is a weaker claim
 * than "the pool the draw is given is empty".
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 THE REAL `dealCast` DEALS EVERY NUMBER BELOW. NOTHING HERE REIMPLEMENTS THE DRAW.
 * ---------------------------------------------------------------------------------------------
 * A model may stand in for something that does not exist yet; it may never stand in for something
 * that does. `dealCast`, `pick`, `draw`, `shuffle` and `rng` all exist, so all of them run here as
 * shipped. To ask what a DIFFERENT table would have dealt, this file reads `cast.js`'s own source,
 * substitutes **only the two table literals** by text, and evaluates the result as a module —
 * every line of the draw is byte-identical to the shipped one. `C0c` proves the machinery is
 * faithful by dealing 10,000 casts through an IDENTITY-patched copy and requiring them to match
 * the imported module's deals exactly, and `C0d` proves the patch actually takes effect.
 *
 * The same rewriter walks the whole import graph (a DAG — `cast → win → phases`, `room → cast`,
 * `session → cast`), rebuilding only the modules that transitively import `cast.js` and leaving
 * every other module pointing at the real file on disk.
 *
 * ---------------------------------------------------------------------------------------------
 * ⚠️ THE WIN RATES IN C4 ARE `party-sim`'s MODELLED GAME, NOT THE SHIPPED ONE. THE LABEL TRAVELS
 * ⚠️ WITH THE NUMBER.
 * ---------------------------------------------------------------------------------------------
 * C4 drives `playMatch` out of `harness/party-sim.mjs` itself — the file's source is read, cut at
 * its own `// ---- run the sweep` marker, and the prefix (every line of `resolveExpedition` and
 * `playMatch`, unaltered — `C4a` asserts the extracted text is a substring of the file on disk)
 * is evaluated as a module so the sweep below can be seeded and sized independently. It is
 * `party-sim`'s match model, not one invented here.
 *
 * But `party-sim.mjs:151` hands every seated evil player a Producer spike each episode via
 * `spikesThisEpisode()` (`policy.js:114`, fires at p=0.85), and **that ability does not exist in
 * the shipped game.** `noise.spike` is declared in `events.js` FAILURE_KINDS and emitted by
 * nothing: not `room.js`, not `session.js`, not `tasks.js`. `party-anon`'s A0b header says so
 * already, and `C5` re-derives it from the tree every run so this paragraph cannot outlive the
 * defect it describes. So C4's numbers describe a game where evil has a per-episode lever the
 * build does not give them. They are still the right comparison BETWEEN the three tables, because
 * all three run under the same modelled evil — and C4 runs every table a second time with the
 * spike disabled (`policy.js`'s 0.85 patched to 0 by the same source-substitution machinery) so
 * the comparison exists on both sides of the modelled ability.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 AND THE HEADLINE C4 FINDING IS ABOUT THE INSTRUMENT: IT CANNOT SEE THIS CHANGE, BY
 * 🚨 CONSTRUCTION, AND THAT IS PROVED HERE RATHER THAN INFERRED.
 * ---------------------------------------------------------------------------------------------
 * Nothing downstream of the deal branches on a role NAME. `room.js` puts `role` into per-player
 * frames and Reunion records and never reads it back; `win.js`, `vote.js`, `ballot.js`, `taken.js`
 * and `policy.js` know only `alignment`. Both candidates below move cards between GOOD roles and
 * change no alignment count anywhere (`C4b` asserts the evil-seat count distribution is identical,
 * per count, across all three tables). So the only way a candidate can move a win rate is by
 * shifting the rng stream and therefore which SEAT draws which card — noise, not effect.
 *
 * C4 therefore ships two references rather than a bare delta: a **reseed control** (the shipped
 * table over a disjoint seed block, which is the size of a difference that means nothing) and a
 * **liveness control** (one extra evil at 5 players, which is a change the sim genuinely reads and
 * which must move the number, or C4 is measuring nothing at all).
 *
 * ---------------------------------------------------------------------------------------------
 * SEEDS — stated so every number below reproduces.
 * ---------------------------------------------------------------------------------------------
 *   deals, family 1:  castSeed = s * 7919                for s = 1..20000, at each count 4-8
 *                     (the family `_rolefreq.mjs` already uses, extended 5x)
 *   deals, family 2:  castSeed = (s * 2246822519) >>> 0  for s = 1..20000, at each count 4-8
 *                     (a second, unrelated family — a "never dealt" claim on one family is a
 *                      claim about that family)
 *   matches, block 1: seed = 0..499 at each count, policies paired exactly as `party-sim` pairs
 *                     them (`s % 2 ? naive-good/aggressive-evil : cautious-good/patient-evil`)
 *   matches, block 2: seed = 5000..5499, same pairing — the reseed control
 *
 * ---------------------------------------------------------------------------------------------
 * THE THREE TABLES UNDER TEST
 * ---------------------------------------------------------------------------------------------
 *   BASELINE     `cast.js` as shipped.
 *   CANDIDATE A  guarantee a KIND, not a ROLE, wherever a kind's guarantee fills its slots:
 *                drop `glitched` from 5 and 6, `fixer` from 6, `plant` from 8. COMPOSITION
 *                untouched. The slot still exists; what fills it is drawn.
 *   CANDIDATE B  widen the outsider slot at 5 and 6 (1 -> 2), paying for it out of `informed`
 *                (3 -> 2). GUARANTEED untouched.
 *
 * ⚠️ CANDIDATE B MOVES THE COLLISION RATHER THAN REMOVING IT, AND C2 IS WHAT SHOWS THAT.
 * `GUARANTEED[6]` already forces two informed roles in. Take the informed slot count at 6 down to
 * 2 and the guarantee fills it exactly, so at six players B crowds out Camera Op, Focus Puller,
 * The Editor and Fan Favourite in the same way the shipped table crowds out The Static.
 *
 * ---------------------------------------------------------------------------------------------
 * ---------------------------------------------------------------------------------------------
 * WHAT IT MEASURED — 2026-08-21, the run this header is written against. 24 passed, 0 failed.
 * ---------------------------------------------------------------------------------------------
 * **C1, the shipped table.** The Static and The Method Actor: 0 appearances at 4p, 5p and 6p.
 * The Plant: 0 at 6p. The Fixer: 0 at 8p. 40,000 deals per role/count pair, two seed families,
 * and structurally 0 (C1b) — at 5p and 6p the outsider guarantee IS the outsider slot, at 6p the
 * minion guarantee IS the minion slot, at 8p likewise. 4p is a different cause with the same
 * symptom: `COMPOSITION[4].outsider` is 0, so no Outsider exists at four players at all.
 * `contestant` is also unreachable at 5p, 6p and 8p — those rows carry no contestant slot, and
 * the `while (bag.length < count)` filler never fires because every row already sums to its count.
 *
 * **C2, Candidate A.** Every crowded-out card comes back and none of the guarantees' purpose is
 * lost, because the SLOT stays: 5p Glitched/Static/Method 33.3/32.3/34.4%, 6p 33.2/33.5/33.4%,
 * 6p Fixer/Plant 50.8/49.2%, 8p Fixer/Plant 49.8/50.2%. Unreachable role/count pairs drop 16 → 10,
 * and all ten survivors are kinds with no slot at that count rather than collisions.
 *
 * **C2b, Candidate B.** Unreachable pairs stay at 16. It buys The Static and The Method Actor at
 * 5p and 6p (0% → ~50%) and pays with the informed bag at six players: Camera Op, Focus Puller,
 * The Editor and Fan Favourite all go 24.7/25.0/25.0/25.3% → **0%**. Six players keeps exactly one
 * informing card, Continuity, in every game. It moves the collision; it does not remove it.
 *
 * **C3, poison.** With the shipped table a Glitched is in 100% of 5p and 6p deals, so no reading at
 * those counts can be trusted and none of them can be doubted either — it is not a variable.
 * Candidate A takes that to 33.3% / 33.2%, i.e. **66.7% / 66.8% of 5p and 6p games would have
 * informers in play and no Glitched at all**, a clean readout. 7p and 8p are unchanged by either
 * candidate (66.7% / 32.8% no-Glitched today). The "informers and no outsider whatsoever" fraction
 * is 0% at every count 5-8 under all three tables and 100% at 4p under all three — the outsider
 * slot at 4 is what decides that, and neither candidate touches it.
 *
 * **C4, win rate — the instrument cannot see either candidate, and that is proved twice.**
 * Candidate B changes **not one outcome on any of 5,000 matches** (C4d): `draw()` shuffles the
 * whole remaining pool before slicing, so widening a slot consumes identical rng, and the extra
 * card is GOOD either way. Candidate A's largest movement is 3.4pp (6p, spike off, |t| = 1.83)
 * against a reseed control in which the SHIPPED table moves up to 7.0pp between seed blocks.
 * Everything is inside the noise. The liveness control moves 31.6pp (|t| = 13.2), so the
 * instrument is alive and is blind to this specific change by construction (C4c).
 *
 * 🚨 **AND ONE FINDING ABOUT `party-sim` ITSELF, WHICH IS NOT ABOUT THE CAST TABLE.** Turn off the
 * Producer spike — the lever `noise.spike` never fires in the shipped tree — and the good win rate
 * across 4-8 players goes from **57.8 / 64.6 / 35.2 / 39.0 / 36.4%** to **83.4 / 90.2 / 78.4 /
 * 82.0 / 78.8%**. `party-sim` S1's "no count is degenerate" band (25-75%) is cleared today only
 * because evil holds an ability the build does not implement; without it, four of five counts are
 * out the top of that band and S1 would go red. That belongs to `party-sim` and `policy.js`, not
 * to `cast.js`, and it is recorded here because this file is where it was measured.
 *
 * POISON — what it means here, and why the second fraction is the one to read.
 * ---------------------------------------------------------------------------------------------
 * Each Outsider poisons one surface (`roles.js` SURFACE): Glitched the phone, The Static the
 * halls, The Method Actor the room. Only the Glitched falsifies an information READING, and that
 * is asserted against the shipped `resolveInformation` rather than described (C3b): it returns
 * `poisoned:true` only when `holderGlitched`, for every informing role, and never otherwise.
 * So the two fractions reported per count are
 *      "no outsider at all, with informers in play"  — no surface is poisoned
 *      "no Glitched, with informers in play"         — no READING can be false
 * and the second is the one that decides whether a Camera Op's readout is proof.
 */

import { readFileSync } from 'node:fs';
import { dealCast, ROLES, COMPOSITION } from '../../src/party/cast.js';
import { resolveInformation, SCRIPT } from '../../src/party/roles.js';
import { OUTCOME } from '../../src/party/win.js';

let pass = 0, fail = 0, skipped = 0;
const t = (n, c, d = '') => { if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); } else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); } return c; };
const skip = (n, why) => { skipped++; console.log(`  SKIP ${n} · ${why}`); };
const done = (label) => { console.log(`\n_cast-table: ${pass} passed, ${fail} failed${skipped ? `, ${skipped} skipped` : ''}${label ? ` · ${label}` : ''}`); process.exit(fail ? 1 : 0); };

const COUNTS = [4, 5, 6, 7, 8];
const DEAL_SEEDS = 20000;
const MATCH_SEEDS = 500;
const BLOCK2 = 5000;
const pct = (x) => (x * 100).toFixed(1).padStart(5) + '%';

const HERE = import.meta.url;
const CAST_URL = new URL('../../src/party/cast.js', HERE).href;
const POLICY_URL = new URL('../../src/party/policy.js', HERE).href;
const SIM_URL = new URL('../party-sim.mjs', HERE).href;
const CAST_SRC = readFileSync(new URL(CAST_URL), 'utf8');
const POLICY_SRC = readFileSync(new URL(POLICY_URL), 'utf8');
const SIM_SRC = readFileSync(new URL(SIM_URL), 'utf8');

// ================================================================ the table rewriter
const COMP_RE = /export const COMPOSITION = \{[\s\S]*?\n\};/;
const GUAR_RE = /const GUARANTEED = \{[\s\S]*?\n\};/;
const SPIKE_RE = /(export const spikesThisEpisode[\s\S]{0,240}?<\s*)0\.85/;

const litComp = (c) => 'export const COMPOSITION = {\n'
  + COUNTS.map((n) => `  ${n}: ${JSON.stringify(c[n]).replace(/"/g, '').replace(/,/g, ', ').replace(/:/g, ': ')},`).join('\n')
  + '\n};';
const litGuar = (g) => 'const GUARANTEED = {\n'
  + COUNTS.map((n) => `  ${n}: ${JSON.stringify(g[n]).replace(/"/g, "'").replace(/,/g, ', ')},`).join('\n')
  + '\n};';

/** Parse the shipped GUARANTEED out of source — it is not exported, and C0b checks the parse. */
function parseGuaranteed(src) {
  const block = (src.match(GUAR_RE) || [])[0];
  if (!block) return null;
  const out = {};
  for (const m of block.matchAll(/^\s*(\d+):\s*\[([^\]]*)\],/gm)) {
    out[+m[1]] = m[2].split(',').map((x) => x.trim().replace(/^'|'$/g, '')).filter(Boolean);
  }
  return Object.keys(out).length ? out : null;
}

/** Substitute the two tables into `cast.js`'s own source. Everything else is untouched. */
const castSource = ({ comp, guar }) => CAST_SRC.replace(COMP_RE, litComp(comp)).replace(GUAR_RE, litGuar(guar));

// ================================================================ the module-graph rewriter
/**
 * Rewrite relative specifiers to absolute URLs, recursively, substituting source for any module
 * in `patch`. A module that neither is patched nor transitively imports a patched module is left
 * as its real `file:` URL, so only `cast → roles/room/session` are rebuilt and the data URLs stay
 * small. The graph is a DAG (verified by inspection of `src/party/*` imports), so this terminates.
 */
const SPEC = /(\bfrom\s*|\bimport\s*\(?\s*)(['"])(\.[^'"]*)\2/g;
function rewrite(src, base, patch, memo) {
  let touched = false;
  const parts = [];
  let last = 0;
  for (const m of src.matchAll(SPEC)) {
    const abs = new URL(m[3], base).href;
    const dep = build(abs, patch, memo);
    if (dep.touched) touched = true;
    parts.push(src.slice(last, m.index), `${m[1]}${m[2]}${dep.url}${m[2]}`);
    last = m.index + m[0].length;
  }
  parts.push(src.slice(last));
  return { text: parts.join(''), touched };
}
function build(url, patch, memo) {
  if (memo.has(url)) return memo.get(url);
  memo.set(url, { url, touched: false });                 // cycle guard; the graph has none
  const own = patch.get(url);
  const r = rewrite(own ?? readFileSync(new URL(url), 'utf8'), url, patch, memo);
  const touched = r.touched || own != null;
  const out = touched
    ? { url: 'data:text/javascript;base64,' + Buffer.from(r.text, 'utf8').toString('base64'), touched: true }
    : { url, touched: false };
  memo.set(url, out);
  return out;
}
const asModule = (src, base, patch) =>
  'data:text/javascript;base64,' + Buffer.from(rewrite(src, base, patch, new Map()).text, 'utf8').toString('base64');

/** A cast module built from a variant's tables. */
const castModule = (tables) => import(build(CAST_URL, new Map([[CAST_URL, castSource(tables)]]), new Map()).url);

// ================================================================ C0 · the arm
console.log('\n_cast-table · C0 — is there anything here to measure?\n');
const SHIPPED_GUAR = parseGuaranteed(CAST_SRC);
if (!COMP_RE.test(CAST_SRC) || !GUAR_RE.test(CAST_SRC) || !SHIPPED_GUAR) {
  skip('C0 arm', 'cast.js no longer exposes a COMPOSITION and a GUARANTEED object literal this file can substitute — '
    + 'the tables moved or changed shape, and every number below would be a measurement of the shipped table wearing a candidate\'s name');
  for (const n of ['C1', 'C1b', 'C2', 'C3', 'C4', 'C5']) skip(n, 'blocked by C0 arm');
  done('nothing measured');
}
t('C0a arm · the two tables are still literals in cast.js, and the shipped GUARANTEED parses',
  true, `COMPOSITION ${COUNTS.length} rows · GUARANTEED ${COUNTS.map((c) => `${c}:${(SHIPPED_GUAR[c] || []).length}`).join(' ')}`);

{
  // The parse is checked against the DEALS, not against itself: a guaranteed role appears in
  // every single deal at its count, and that is what "guaranteed" means.
  const bad = [];
  for (const c of COUNTS) for (const r of SHIPPED_GUAR[c] || []) {
    for (let s = 1; s <= 400; s++) {
      if (!dealCast({ count: c, castSeed: s * 7919 }).seats.some((x) => x.role === r)) { bad.push(`${c}p ${r}`); break; }
    }
  }
  t('C0b arm · the parsed GUARANTEED is the one the real dealCast honours — every parsed role in every deal at its count',
    bad.length === 0, bad.length ? bad.join(', ') : `${COUNTS.reduce((a, c) => a + SHIPPED_GUAR[c].length, 0)} role/count pairs over 400 deals each`);
}

const SHIPPED = { comp: COMPOSITION, guar: SHIPPED_GUAR };
const identity = await castModule(SHIPPED);
{
  // 🚨 THE FAITHFULNESS ARM. If the rewriter changes what the draw does, every candidate number
  // below is about the rewriter. Identity-patched: 10,000 deals, byte-identical to the import.
  let diff = 0, n = 0;
  for (const c of COUNTS) for (let s = 1; s <= 2000; s++) {
    const a = dealCast({ count: c, castSeed: s * 7919 });
    const b = identity.dealCast({ count: c, castSeed: s * 7919 });
    n++; if (JSON.stringify(a) !== JSON.stringify(b)) diff++;
  }
  t('C0c arm · an identity-patched copy of cast.js deals exactly what the shipped module deals',
    diff === 0, `${n.toLocaleString()} deals, ${diff} differing — the substitution touches the two tables and nothing in the draw`);

  // The control: mutate the real artefact (drop the 4-player guarantee) and the copies must part.
  const ctlGuar = { ...SHIPPED_GUAR, 4: [] };
  const ctl = await castModule({ comp: COMPOSITION, guar: ctlGuar });
  let moved = 0;
  for (let s = 1; s <= 2000; s++) {
    if (JSON.stringify(dealCast({ count: 4, castSeed: s * 7919 })) !== JSON.stringify(ctl.dealCast({ count: 4, castSeed: s * 7919 }))) moved++;
  }
  t('C0d control · and a patched table actually reaches the draw — drop GUARANTEED[4] and the deals part',
    moved > 0, `${moved} of 2,000 four-player deals differ once cameraOp stops being forced in`);
}

// ================================================================ measurement
/** Per-role appearance counts over both seed families, through a variant's real dealCast. */
async function sweepDeals(tables) {
  const mod = tables === SHIPPED ? { dealCast } : await castModule(tables);
  const out = {};
  for (const c of COUNTS) {
    const freq = {}, fam2 = {};
    let informerAndNoOutsider = 0, informerAndNoGlitched = 0, informers = 0, glitched = 0, outsider = 0;
    for (let s = 1; s <= DEAL_SEEDS; s++) {
      for (const [seedVal, bag] of [[s * 7919, freq], [(s * 2246822519) >>> 0, fam2]]) {
        const d = mod.dealCast({ count: c, castSeed: seedVal });
        const roles = d.seats.map((x) => x.role);
        for (const r of roles) bag[r] = (bag[r] || 0) + 1;
        if (bag !== freq) continue;                       // the fractions are family 1 only
        const hasInf = roles.some((r) => ROLES[r].informs);
        const hasOut = roles.some((r) => ROLES[r].kind === 'outsider');
        const hasGl = roles.includes('glitched');
        if (hasInf) informers++;
        if (hasGl) glitched++;
        if (hasOut) outsider++;
        if (hasInf && !hasOut) informerAndNoOutsider++;
        if (hasInf && !hasGl) informerAndNoGlitched++;
      }
    }
    out[c] = { freq, fam2, informerAndNoOutsider, informerAndNoGlitched, informers, glitched, outsider, n: DEAL_SEEDS };
  }
  return out;
}

/** Which roles a table makes IMPOSSIBLE, read off the tables rather than off a sample. */
function crowdedOut({ comp, guar }) {
  const out = {};
  for (const c of COUNTS) {
    const dead = [];
    for (const kind of ['informed', 'contestant', 'outsider', 'minion', 'producer']) {
      const slots = comp[c][kind];
      const forced = (guar[c] || []).filter((r) => ROLES[r].kind === kind);
      const others = Object.keys(ROLES).filter((r) => ROLES[r].kind === kind && !forced.includes(r));
      if (slots > 0 && forced.length >= slots && others.length) dead.push(...others);
      if (slots === 0) dead.push(...Object.keys(ROLES).filter((r) => ROLES[r].kind === kind));
    }
    out[c] = [...new Set(dead)];
  }
  return out;
}

const CAND_A = {
  comp: COMPOSITION,
  guar: { ...SHIPPED_GUAR,
    5: SHIPPED_GUAR[5].filter((r) => r !== 'glitched'),
    6: SHIPPED_GUAR[6].filter((r) => r !== 'glitched' && r !== 'fixer'),
    8: SHIPPED_GUAR[8].filter((r) => r !== 'plant') },
};
const CAND_B = {
  comp: { ...COMPOSITION,
    5: { ...COMPOSITION[5], informed: 2, outsider: 2 },
    6: { ...COMPOSITION[6], informed: 2, outsider: 2 } },
  guar: SHIPPED_GUAR,
};

const base = await sweepDeals(SHIPPED);
const a = await sweepDeals(CAND_A);
const b = await sweepDeals(CAND_B);
const VARIANTS = [['baseline', SHIPPED, base], ['cand-A', CAND_A, a], ['cand-B', CAND_B, b]];

// ================================================================ C1 · the baseline claim
console.log('\n_cast-table · C1 — per-role deal frequency under the shipped tables\n');
{
  const roles = Object.keys(ROLES);
  console.log(`       role           ${COUNTS.map((c) => `${c}p`.padStart(8)).join('')}`);
  for (const r of roles) {
    console.log(`       ${r.padEnd(14)} ${COUNTS.map((c) => pct((base[c].freq[r] || 0) / base[c].n)).join('')}`);
  }
  console.log('       (fraction of deals containing the role; a 100.0% is a guarantee, a 0.0% is a card that cannot be dealt)');

  const CLAIMS = [['theStatic', 4], ['theStatic', 5], ['theStatic', 6], ['methodActor', 4], ['methodActor', 5],
    ['methodActor', 6], ['plant', 6], ['fixer', 8]];
  const rows = CLAIMS.map(([r, c]) => ({ r, c, f1: base[c].freq[r] || 0, f2: base[c].fam2[r] || 0 }));
  for (const x of rows) console.log(`       ${x.r} @ ${x.c}p: ${x.f1} appearances in ${DEAL_SEEDS.toLocaleString()} deals (family 1), ${x.f2} in ${DEAL_SEEDS.toLocaleString()} (family 2)`);
  t('C1 · the never-dealt claim, measured exactly rather than believed',
    rows.every((x) => x.f1 === 0 && x.f2 === 0),
    rows.filter((x) => x.f1 || x.f2).map((x) => `${x.r}@${x.c}p appeared`).join(', ')
      || `8 role/count pairs, 0 appearances in ${(DEAL_SEEDS * 2).toLocaleString()} deals each across two unrelated seed families`);

  // theStatic/methodActor at 4 are outsider-slot-zero, which is a different cause from the
  // guarantee collision; C1b separates the two so the finding is not overstated.
  const dead = crowdedOut(SHIPPED);
  const byCollision = { 5: ['theStatic', 'methodActor'], 6: ['theStatic', 'methodActor', 'plant'], 8: ['fixer'] };
  const ok = Object.entries(byCollision).every(([c, rs]) => rs.every((r) => dead[c].includes(r)))
    && COMPOSITION[4].outsider === 0;
  t('C1b · and the cause is structural, not statistical — the guarantee fills the kind and the draw is handed an empty pool',
    ok, `5p/6p/8p: ${Object.entries(byCollision).map(([c, rs]) => `${c}p ${rs.join('+')}`).join(' · ')}`
      + ` · 4p has no outsider SLOT at all (COMPOSITION[4].outsider = 0), a different cause with the same symptom`);

  // The control mutates the real artefact: put the 5-player outsider guarantee back to nothing
  // and The Static becomes reachable — so C1 is measuring the table, not asserting a constant.
  const ctl = await castModule({ comp: COMPOSITION, guar: { ...SHIPPED_GUAR, 5: SHIPPED_GUAR[5].filter((r) => r !== 'glitched') } });
  let stat = 0;
  for (let s = 1; s <= 4000; s++) if (ctl.dealCast({ count: 5, castSeed: s * 7919 }).seats.some((x) => x.role === 'theStatic')) stat++;
  t('C1 control · drop `glitched` from GUARANTEED[5] and The Static is dealt — the zero is the table, not the instrument',
    stat > 0, `${stat} of 4,000 five-player deals contain The Static once the slot is drawn for instead of forced`);
}

// ================================================================ C2 · what the candidates restore
console.log('\n_cast-table · C2 — per-role frequency under each candidate\n');
{
  for (const [name, tables, sw] of VARIANTS) {
    console.log(`       ${name}`);
    for (const r of ['glitched', 'theStatic', 'methodActor', 'fixer', 'plant', 'cameraOp', 'focusPuller', 'continuity', 'editor', 'fanFavourite', 'stuntDouble']) {
      console.log(`         ${r.padEnd(13)} ${COUNTS.map((c) => pct((sw[c].freq[r] || 0) / sw[c].n)).join('')}`);
    }
    const dead = crowdedOut(tables);
    console.log(`         unreachable:  ${COUNTS.map((c) => `${c}p [${dead[c].join(' ')}]`).join('  ')}`);
  }

  const deadBase = crowdedOut(SHIPPED), deadA = crowdedOut(CAND_A), deadB = crowdedOut(CAND_B);
  const collides = (d) => COUNTS.reduce((acc, c) => acc + d[c].filter((r) => COMPOSITION[c][ROLES[r].kind] > 0).length, 0);
  const nA = COUNTS.reduce((acc, c) => acc + deadA[c].length, 0);
  const nB = COUNTS.reduce((acc, c) => acc + deadB[c].length, 0);
  const nBase = COUNTS.reduce((acc, c) => acc + deadBase[c].length, 0);
  t('C2 · Candidate A removes every guarantee/slot collision; the only unreachable cards left are kinds with no slot',
    COUNTS.every((c) => deadA[c].every((r) => COMPOSITION[c][ROLES[r].kind] === 0)),
    `unreachable role/count pairs: baseline ${nBase} · A ${nA} · B ${nB} (a kind with 0 slots is a table decision, not a collision)`);
  t('C2b · Candidate B does NOT — it moves the collision from the outsider bag at 5/6 into the informed bag at 6',
    deadB[6].includes('cameraOp') && deadB[6].includes('focusPuller') && !deadB[6].includes('theStatic'),
    `B @6p unreachable: [${deadB[6].join(' ')}] — informed drops to 2 and GUARANTEED[6] already forces 2 in, `
      + `so the four remaining informed cards are crowded out exactly as The Static is today`);

  // Control: hand C2's check the shipped table under the same code path and it must go red.
  t('C2 control · the same check against the shipped table fails, so C2 is reading the table it was given',
    !COUNTS.every((c) => deadBase[c].every((r) => COMPOSITION[c][ROLES[r].kind] === 0)),
    `baseline leaves ${collides(deadBase)} cards unreachable in kinds that do have slots`);
}

// ================================================================ C3 · poison
console.log('\n_cast-table · C3 — how often is there nothing to distrust?\n');
{
  console.log('       informers in play AND no outsider at all / AND no Glitched (family 1, ' + DEAL_SEEDS.toLocaleString() + ' deals per count)');
  console.log(`       table       ${COUNTS.map((c) => `${c}p`.padStart(17)).join('')}`);
  for (const [name, , sw] of VARIANTS) {
    console.log(`       ${name.padEnd(11)} ${COUNTS.map((c) => `${pct(sw[c].informerAndNoOutsider / sw[c].n)}/${pct(sw[c].informerAndNoGlitched / sw[c].n)}`.padStart(17)).join('')}`);
  }
  console.log(`       glitched present:`);
  for (const [name, , sw] of VARIANTS) console.log(`       ${name.padEnd(11)} ${COUNTS.map((c) => pct(sw[c].glitched / sw[c].n).padStart(17)).join('')}`);

  // C3b: the definition is the shipped module's, not this file's prose.
  const informing = Object.keys(SCRIPT).filter((r) => SCRIPT[r].informs);
  const honest = informing.every((r) => !resolveInformation({ role: r, truth: true, holderGlitched: false }).poisoned);
  const lied = informing.every((r) => resolveInformation({ role: r, truth: true, holderGlitched: true }).poisoned);
  t('C3b · only the Glitched falsifies a reading, per the shipped resolveInformation — so the second fraction is the one that matters',
    honest && lied && informing.length === 3, `${informing.join(', ')} · poisoned only when holderGlitched`);
  const nonInformer = ['editor', 'stuntDouble', 'fanFavourite'].every((r) => !resolveInformation({ role: r, truth: true, holderGlitched: true }).poisoned);
  t('C3b control · and a non-informing card is never poisoned even in the Glitched\'s hands', nonInformer,
    'editor / stuntDouble / fanFavourite return poisoned:false with holderGlitched true — the metric is about readings, not about cards');

  const noGl = (sw, c) => sw[c].informerAndNoGlitched / sw[c].n;
  t('C3 · the shipped table has a Glitched in every deal at 5 and 6, and Candidate A trades some of that certainty away',
    noGl(base, 5) === 0 && noGl(base, 6) === 0 && noGl(a, 5) > 0 && noGl(a, 6) > 0,
    `no-Glitched-with-informers: 5p ${pct(noGl(base, 5))}→${pct(noGl(a, 5))} · 6p ${pct(noGl(base, 6))}→${pct(noGl(a, 6))} `
      + `· 8p ${pct(noGl(base, 8))}→${pct(noGl(a, 8))} (unchanged by A; 8p never guaranteed one)`);

  // Control: a table with the outsider slot removed at 5 and 6 must drive both fractions to the
  // informer rate — proving the metric moves with the table rather than reporting a constant.
  const ctlT = { comp: { ...COMPOSITION, 5: { ...COMPOSITION[5], informed: 4, outsider: 0 }, 6: { ...COMPOSITION[6], informed: 4, outsider: 0 } },
    guar: { ...SHIPPED_GUAR, 5: ['cameraOp'], 6: ['continuity', 'stuntDouble', 'fixer'] } };
  const ctlMod = await castModule(ctlT);
  let inf = 0, none = 0;
  for (let s = 1; s <= 4000; s++) {
    const roles = ctlMod.dealCast({ count: 6, castSeed: s * 7919 }).seats.map((x) => x.role);
    const hasInf = roles.some((r) => ROLES[r].informs);
    if (hasInf) inf++;
    if (hasInf && !roles.some((r) => ROLES[r].kind === 'outsider')) none++;
  }
  t('C3 control · zero the outsider slot at 6 and the no-poison fraction goes to the informer rate',
    inf > 0 && none === inf, `${none}/${inf} of 4,000 six-player deals have informers and no outsider once the slot is gone`);
}

// ================================================================ C4 · win rate
console.log('\n_cast-table · C4 — win rate under `party-sim`\'s match model (NOT the shipped game; see header)\n');
const MARK = '// ---------------------------------------------------------------- run the sweep';
if (!SIM_SRC.includes(MARK)) {
  skip('C4', 'party-sim.mjs no longer carries its `run the sweep` marker, so playMatch cannot be lifted out of it unaltered — '
    + 'and inventing a match model here is the one thing this file may not do');
} else {
  const PREFIX = SIM_SRC.slice(0, SIM_SRC.indexOf(MARK));
  t('C4a arm · the match model is party-sim\'s own source, lifted whole and not retyped',
    SIM_SRC.includes(PREFIX) && /function playMatch\(/.test(PREFIX) && /function resolveExpedition\(/.test(PREFIX),
    `${PREFIX.split('\n').length} lines up to party-sim's own sweep marker, byte-identical substring of the file on disk`);

  const simModule = async (tables, { spike = true } = {}) => {
    const patch = new Map([[CAST_URL, castSource(tables)]]);
    if (!spike) patch.set(POLICY_URL, POLICY_SRC.replace(SPIKE_RE, '$10'));
    return import(asModule(PREFIX + '\nexport { playMatch };\n', SIM_URL, patch));
  };
  t('C4a2 arm · and the spike this file disables is the one policy.js actually fires',
    SPIKE_RE.test(POLICY_SRC), SPIKE_RE.test(POLICY_SRC)
      ? 'policy.js spikesThisEpisode fires at p=0.85; the spike-off arm rewrites that literal to 0'
      : 'policy.js no longer carries the 0.85 — the spike-off column below would be a copy of the spike-on one');

  const sweepMatches = async (tables, { spike = true, from = 0, counts = COUNTS } = {}) => {
    const { playMatch } = await simModule(tables, { spike });
    const out = {};
    for (const c of counts) {
      const wins = [];
      for (let i = 0; i < MATCH_SEEDS; i++) {
        const s = from + i;
        const r = playMatch({ count: c, seed: s, goodPolicy: s % 2 ? 'naive-good' : 'cautious-good', evilPolicy: s % 2 ? 'aggressive-evil' : 'patient-evil' });
        wins.push({ good: r.outcome === OUTCOME.FINALE ? 1 : 0, evil: r.evilSet.size });
      }
      out[c] = wins;
    }
    return out;
  };

  const rate = (w) => w.reduce((x, y) => x + y.good, 0) / w.length;
  const pairedSE = (x, y) => {
    const d = x.map((v, i) => v.good - y[i].good);
    const m = d.reduce((p, q) => p + q, 0) / d.length;
    const v = d.reduce((p, q) => p + (q - m) ** 2, 0) / (d.length - 1 || 1);
    return { mean: m, se: Math.sqrt(v / d.length) };
  };

  const on = { base: await sweepMatches(SHIPPED), a: await sweepMatches(CAND_A), b: await sweepMatches(CAND_B) };
  const reseed = await sweepMatches(SHIPPED, { from: BLOCK2 });
  const off = { base: await sweepMatches(SHIPPED, { spike: false }), a: await sweepMatches(CAND_A, { spike: false }), b: await sweepMatches(CAND_B, { spike: false }) };

  t('C4b arm · both candidates leave every alignment count untouched, per count — they move cards between GOOD roles only',
    COUNTS.every((c) => {
      const k = (w) => w[c].map((x) => x.evil).sort().join();
      return k(on.base) === k(on.a) && k(on.base) === k(on.b);
    }), 'evil-seat counts identical across all three tables at every count');

  /**
   * 🚨 AND THE STRUCTURAL HALF, WHICH IS THE ONE THAT EXPLAINS EVERY NUMBER IN THE TABLE BELOW.
   * A win rate can only respond to a role NAME if something reads one. Nothing does: the mechanics
   * modules carry no role identifier at all except `room.js`'s `cover ?? 'contestant'` default for
   * a published CLAIM, and no module reads a claim back. So the deal reaches the outcome through
   * `alignment` alone, and both candidates leave alignment alone.
   */
  const MECH = ['room.js', 'win.js', 'vote.js', 'ballot.js', 'taken.js', 'policy.js', 'coverage.js'];
  const ids = Object.keys(ROLES);
  const stray = [];
  for (const f of MECH) {
    const src = readFileSync(new URL(`../../src/party/${f}`, HERE), 'utf8');
    for (const id of ids) if (new RegExp(`'${id}'`).test(src) && !(f === 'room.js' && id === 'contestant')) stray.push(`${f}:${id}`);
  }
  const readsClaim = MECH.filter((f) => f !== 'room.js')
    .some((f) => /\bclaim\b/.test(readFileSync(new URL(`../../src/party/${f}`, HERE), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')));
  t('C4c arm · nothing between the deal and the outcome reads a role name, so C4 can only ever measure reseeding',
    stray.length === 0 && !readsClaim,
    stray.length ? `role ids now appear in ${stray.join(', ')} — a mechanic started reading a card, and C4's verdict must be re-argued`
      : `${MECH.join(' ')} carry no role identifier except room.js's cosmetic \`cover ?? 'contestant'\` claim default, which no module reads back`);
  t('C4c control · and the check would see one — room.js\'s one role literal is found when the exemption is lifted',
    /'contestant'/.test(readFileSync(new URL('../../src/party/room.js', HERE), 'utf8')),
    'room.js:275 `deal.seats.find(...).cover ?? \'contestant\'` — the single literal the arm exempts by name');

  for (const [label, set] of [['spike ON  (party-sim as it runs today — modelled evil lever)', on], ['spike OFF (the lever removed; closer to what ships)', off]]) {
    console.log(`\n       ${label}   n = ${MATCH_SEEDS} matches per count per table`);
    console.log('       count │ baseline │  cand-A  │  cand-B  │   A-base (paired ±1 se)   │   B-base (paired ±1 se)');
    for (const c of COUNTS) {
      const da = pairedSE(set.a[c], set.base[c]), db = pairedSE(set.b[c], set.base[c]);
      console.log(`       ${String(c).padStart(5)} │ ${pct(rate(set.base[c])).padStart(8)} │ ${pct(rate(set.a[c])).padStart(8)} │ ${pct(rate(set.b[c])).padStart(8)}`
        + ` │ ${(da.mean * 100 >= 0 ? '+' : '') + (da.mean * 100).toFixed(1)}pp ± ${(da.se * 100).toFixed(1)}`.padEnd(28)
        + `│ ${(db.mean * 100 >= 0 ? '+' : '') + (db.mean * 100).toFixed(1)}pp ± ${(db.se * 100).toFixed(1)}`);
    }
  }
  console.log(`\n       reseed control · the SHIPPED table over a disjoint seed block (${BLOCK2}..${BLOCK2 + MATCH_SEEDS - 1}), spike ON.`);
  console.log('       This is the size of a difference that means nothing at all.');
  console.log(`       ${COUNTS.map((c) => `${c}p ${(rate(on.base[c]) * 100).toFixed(1)}%→${(rate(reseed[c]) * 100).toFixed(1)}% (${((rate(reseed[c]) - rate(on.base[c])) * 100 >= 0 ? '+' : '') + ((rate(reseed[c]) - rate(on.base[c])) * 100).toFixed(1)}pp)`).join('  ')}`);

  const identicalB = COUNTS.every((c) => on.b[c].every((x, i) => x.good === on.base[c][i].good)
    && off.b[c].every((x, i) => x.good === off.base[c][i].good));
  t('C4d · Candidate B is not merely inside the noise — it changes NOT ONE outcome, on any seed, at any count',
    identicalB, `${(MATCH_SEEDS * COUNTS.length * 2).toLocaleString()} matches, zero differing. `
      + `\`draw()\` shuffles the whole remaining pool and then slices, so widening a slot consumes exactly as much rng as before; `
      + `the bag differs by one card, both cards are GOOD, and the sim reads only alignment. This is C4c made concrete`);

  const SE_LIMIT = 4;                       // 10 tests; a 4-sigma bar keeps a true zero green
  const worst = [];
  for (const [mode, set] of [['on', on], ['off', off]]) for (const c of COUNTS) {
    const d = pairedSE(set.a[c], set.base[c]);
    const tstat = d.se ? Math.abs(d.mean / d.se) : 0;
    worst.push({ mode, c, ...d, tstat });
  }
  worst.sort((x, y) => y.tstat - x.tstat);
  const maxNoise = Math.max(...COUNTS.map((c) => Math.abs(rate(reseed[c]) - rate(on.base[c]))));
  t(`C4 · Candidate A's win-rate movement is inside the noise — no count, in either spike mode, is ${SE_LIMIT} paired standard errors from zero`,
    worst[0].tstat < SE_LIMIT,
    `largest |t| = ${worst[0].tstat.toFixed(2)} at ${worst[0].c}p spike-${worst[0].mode} (${(worst[0].mean * 100).toFixed(1)}pp ± ${(worst[0].se * 100).toFixed(1)}) `
      + `· for scale, the SHIPPED table moves up to ${(maxNoise * 100).toFixed(1)}pp between seed blocks`);

  /**
   * 🚨 THE LIVENESS CONTROL. Without it, "no difference" and "no instrument" print the same line.
   * One extra evil at five players is a change `playMatch` genuinely reads (alignment, not role),
   * and it must move the number well outside the reseed band.
   */
  const live = await sweepMatches({ comp: { ...COMPOSITION, 5: { informed: 2, contestant: 0, outsider: 1, minion: 1, producer: 1 } }, guar: SHIPPED_GUAR }, { counts: [5] });
  const lv = pairedSE(live[5], on.base[5]);
  const lt = lv.se ? Math.abs(lv.mean / lv.se) : 0;
  t('C4 control · the win-rate instrument is alive — add one evil at 5p and it moves far outside the bar C4 just cleared',
    lt > SE_LIMIT, `5p good win ${pct(rate(on.base[5]))} → ${pct(rate(live[5]))} (${(lv.mean * 100).toFixed(1)}pp ± ${(lv.se * 100).toFixed(1)}, |t| = ${lt.toFixed(1)}) `
      + `· the sim can see an ALIGNMENT change and cannot see a ROLE change, which is exactly the C4c finding`);
}

// ================================================================ C5 · the caveat's own arm
console.log('\n_cast-table · C5 — the label on C4\'s numbers, re-derived from the tree\n');
{
  const files = ['../../src/party/room.js', '../../src/party/session.js', '../../src/party/tasks.js',
    '../../src/party/phases.js', '../../src/party/win.js', '../../src/party/taken.js', '../../src/party/roles.js',
    '../../src/party/reunion.js', '../../src/party/director.js', '../../net/party/entitle.js'];
  const hits = files.filter((f) => /noise\.spike/.test(readFileSync(new URL(f, HERE), 'utf8')));
  t('C5 · `noise.spike` is still emitted by nothing, so C4\'s spike-ON column is still a modelled ability',
    hits.length === 0, hits.length
      ? `an emitter landed in ${hits.join(', ')} — delete the caveat in this file's header and in party-anon A0b`
      : `declared in events.js FAILURE_KINDS, emitted in none of ${files.length} shipped modules — the header's label stands`);
  const declared = /'noise\.spike'/.test(readFileSync(new URL('../../src/party/events.js', HERE), 'utf8'));
  t('C5 control · and the kind is still declared, so C5 is looking for an emitter rather than at an absent string',
    declared, 'events.js FAILURE_KINDS carries `noise.spike`');
}

done(`${(DEAL_SEEDS * 2 * COUNTS.length * 3).toLocaleString()} deals + ${(MATCH_SEEDS * COUNTS.length * 7 + MATCH_SEEDS).toLocaleString()} matches`);
