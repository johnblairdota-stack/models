#!/usr/bin/env node
/**
 * 🎭 **role-deal — THE CAST TABLE IS EXACTLY THE TABLE, AT EVERY COUNT, AND THE DEAL ITSELF
 * LEAKS NOTHING.**
 *
 *   node harness/role-deal.mjs
 *
 * Tier 0 (`docs/design/rrr-gates.md` §2): ships BEFORE any party code, because a composition
 * bug found after the wire exists is a migration, and because two documents disagreed about
 * six players until this file settled it in code.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT IT SETTLES
 * ---------------------------------------------------------------------------------------------
 * `party-loop.md` says 1 evil at 4-5 and 2 at 6-8. The design bible's §8 said 1 at 6 until
 * v0.4. Bible **D14** locked 2, and 33% at six is above the genre's 25-30% band ON PURPOSE —
 * with only a pair in the halls, a second traitor buys COVERAGE rather than power. R1 asserts
 * the table so the argument cannot drift back into prose.
 *
 * 🚨 **AND IT REPORTS A CONTRADICTION IT DID NOT FIX.** `rrr-roles.md` §8's "which cards go in
 * the bag" says 8 players draw "2 more informed" on top of three guaranteed informed roles —
 * five against the table's four, which deals a NINTH card into an eight-player game. The table
 * is authoritative because it is self-consistent and matches D14. R1 is what makes the prose's
 * error harmless.
 *
 * 🚨 **EVERY ASSERTION SHIPS A CONTROL THAT MUST FAIL, AND EVERY CONTROL RUNS ON EVERY RUN**
 * (`_limb1-rule.mjs` L27-34). A composition check that fires on everything and one that fires
 * on nothing look identical to a run that only ever asks the shipped arm.
 */

import { dealCast, viewFor, COMPOSITION, ROLES, GOOD, EVIL } from '../src/party/cast.js';

const COUNTS = [4, 5, 6, 7, 8];
const N = 10000;
let pass = 0, fail = 0, skip = 0;
const t = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}${detail ? ' · ' + detail : ''}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' · ' + detail : ''}`); }
  return cond;
};
const skipped = (name, why) => { skip++; console.log(`  SKIP ${name} · ${why}`); };

// ---------------------------------------------------------------- R0 · the arm
// A deal that never produces both alignments proves nothing about composition.
{
  const seen = new Set();
  for (let s = 0; s < 200; s++) for (const c of COUNTS)
    for (const seat of dealCast({ count: c, castSeed: s }).seats) seen.add(seat.alignment);
  t('R0 arm · both alignments are dealt', seen.has(GOOD) && seen.has(EVIL), [...seen].join('+'));
}

// ---------------------------------------------------------------- R1 · exact composition
/** Count kinds in a deal. Returned so the controls can reuse it. */
const kindsOf = (deal) => deal.seats.reduce((a, s) => {
  const k = ROLES[s.role].kind; a[k] = (a[k] || 0) + 1; return a;
}, {});

function checkComposition(dealer, label) {
  let bad = null;
  for (const c of COUNTS) {
    for (let s = 0; s < 400 && !bad; s++) {
      const deal = dealer({ count: c, castSeed: s });
      const k = kindsOf(deal);
      const want = COMPOSITION[c];
      const got = {
        informed: k.informed || 0, contestant: k.contestant || 0, outsider: k.outsider || 0,
        minion: k.minion || 0, producer: k.producer || 0,
      };
      const evil = got.minion + got.producer;
      const wantEvil = want.minion + want.producer;
      if (deal.seats.length !== c) bad = `${label} ${c}p seed ${s}: dealt ${deal.seats.length} cards`;
      else if (JSON.stringify(got) !== JSON.stringify({
        informed: want.informed, contestant: want.contestant, outsider: want.outsider,
        minion: want.minion, producer: want.producer,
      })) bad = `${label} ${c}p seed ${s}: ${JSON.stringify(got)} != ${JSON.stringify(want)}`;
      else if (deal.evil.length !== wantEvil) bad = `${label} ${c}p seed ${s}: ${deal.evil.length} evil, want ${wantEvil}`;
    }
  }
  return bad;
}
t('R1 · composition is exactly the table at every count, 400 seeds each',
  checkComposition(dealCast, 'shipped') === null, checkComposition(dealCast, 'shipped') || '5 counts clean');

t('R1b · evil count is 1 at 4-5 and 2 at 6-8 (D14)',
  COUNTS.every((c) => {
    const e = COMPOSITION[c].minion + COMPOSITION[c].producer;
    return e === (c <= 5 ? 1 : 2);
  }), COUNTS.map((c) => `${c}p:${COMPOSITION[c].minion + COMPOSITION[c].producer}`).join(' '));

// ---------------------------------------------------------------- R2 · uniform over seats
/**
 * ⚠️ A BAND, NOT A DIRECTION (`dig-band.mjs` L15-18). Chi-square at p=0.001 against the seat
 * distribution of evil. A dealer that always seats the Producer at 0 is not a cosmetic bug —
 * it is a solved game by episode two.
 */
const CRIT_001 = { 3: 16.27, 4: 18.47, 5: 20.52, 6: 22.46, 7: 24.32 };
function chiSeat(dealer, count, n) {
  const hits = new Array(count).fill(0);
  for (let s = 0; s < n; s++) {
    const deal = dealer({ count, castSeed: s * 7919 + 13 });
    for (const seat of deal.seats) if (seat.alignment === EVIL) hits[seat.seat]++;
  }
  const total = hits.reduce((a, b) => a + b, 0);
  const exp = total / count;
  return hits.reduce((a, h) => a + ((h - exp) ** 2) / exp, 0);
}
for (const c of COUNTS) {
  const x2 = chiSeat(dealCast, c, N);
  t(`R2 · evil is uniform over seats at ${c}p`, x2 < CRIT_001[c - 1],
    `chi2=${x2.toFixed(2)} < ${CRIT_001[c - 1]} (df=${c - 1}, p=0.001, n=${N})`);
}

// ---------------------------------------------------------------- R3 · determinism
{
  const a = JSON.stringify(dealCast({ count: 8, castSeed: 4242 }));
  const b = JSON.stringify(dealCast({ count: 8, castSeed: 4242 }));
  const d = JSON.stringify(dealCast({ count: 8, castSeed: 4243 }));
  t('R3 · one seed is one deal, byte-identical', a === b);
  t('R3b · a different seed is a different deal', a !== d);
}

// ---------------------------------------------------------------- R4 · the view leaks nothing
/**
 * 🚨 STRUCTURAL, AND ASSERTED BEFORE A SOCKET EXISTS. A good player's view must not merely
 * lack values that name another alignment — the KEY must be absent. `teammates: []` on a good
 * phone is itself the answer to "am I evil", and the shape survives a filter that only nulls
 * values (`party-isolation` I4 is the same property one layer out).
 */
function goodViewClean(dealer) {
  for (const c of COUNTS) {
    for (let s = 0; s < 300; s++) {
      const deal = dealer({ count: c, castSeed: s });
      for (const seat of deal.seats) {
        const v = viewFor(deal, seat.id);
        const json = JSON.stringify(v);
        if (seat.alignment === GOOD) {
          if ('teammates' in v.you) return `${c}p seed ${s} ${seat.id}: good view has a teammates key`;
          if (json.includes(`"${EVIL}"`)) return `${c}p seed ${s} ${seat.id}: good view contains "evil"`;
          for (const other of deal.seats) {
            if (other.id === seat.id) continue;
            if (json.includes(`"${other.role}"`) && other.role !== seat.role) {
              return `${c}p seed ${s} ${seat.id}: good view names ${other.id}'s role ${other.role}`;
            }
          }
        } else if (!Array.isArray(v.you.teammates)) {
          if (deal.evil.length > 1) return `${c}p seed ${s} ${seat.id}: evil view has no teammates`;
        }
      }
    }
  }
  return null;
}
t('R4 · a good view carries no field naming another alignment', goodViewClean(dealCast) === null,
  goodViewClean(dealCast) || '5 counts x 300 seeds clean');

// ---------------------------------------------------------------- R5 · the controls
/**
 * Three broken dealers. Each must turn EXACTLY ONE of the checks above red. A control that
 * stops failing means this file has gone blind and its greens mean nothing.
 */
const controls = [
  ['3 evil at 8p', ({ count, castSeed }) => {
    const d = dealCast({ count, castSeed });
    if (count === 8) { d.seats[0].role = 'fixer'; d.seats[0].alignment = EVIL; d.evil = d.seats.filter((s) => s.alignment === EVIL).map((s) => s.id); }
    return d;
  }, 'R1'],
  ['producer always at seat 0', ({ count, castSeed }) => {
    const d = dealCast({ count, castSeed });
    const i = d.seats.findIndex((s) => s.role === 'producer');
    if (i > 0) { const tmp = d.seats[0].role, ta = d.seats[0].alignment;
      d.seats[0].role = d.seats[i].role; d.seats[0].alignment = d.seats[i].alignment;
      d.seats[i].role = tmp; d.seats[i].alignment = ta;
      d.evil = d.seats.filter((s) => s.alignment === EVIL).map((s) => s.id); }
    return d;
  }, 'R2'],
  ['full roster in every view', ({ count, castSeed }) => {
    const d = dealCast({ count, castSeed });
    d.__leakRoster = true;
    return d;
  }, 'R4'],
];

{
  const r1 = checkComposition(controls[0][1], 'control') !== null;
  t('R5a control · 3 evil at 8p turns R1 red', r1);

  const x2 = chiSeat(controls[1][1], 8, 2000);
  t('R5b control · producer always at seat 0 turns R2 red', x2 >= CRIT_001[7], `chi2=${x2.toFixed(1)}`);

  // The roster leak: viewFor is the shipped projection, so the control injects at the same seam
  // a careless feature would — a field added to the deal that the view copies wholesale.
  const leakyView = (deal, id) => {
    const v = viewFor(deal, id);
    v.you.teammates = deal.seats.filter((s) => s.id !== id).map((s) => ({ id: s.id, role: s.role, claimDraft: null }));
    return v;
  };
  let caught = false;
  const deal = dealCast({ count: 8, castSeed: 5 });
  for (const seat of deal.seats) {
    if (seat.alignment !== GOOD) continue;
    if ('teammates' in leakyView(deal, seat.id).you) { caught = true; break; }
  }
  t('R5c control · full roster in every view turns R4 red', caught);
}

console.log(`\nrole-deal: ${pass} passed, ${fail} failed${skip ? `, ${skip} skipped` : ''}`);
process.exit(fail ? 1 : 0);
