#!/usr/bin/env node
/**
 * 🎭 **role-script — EVERY CARD IS SPENDABLE FROM A CHAIR, AND NO INFO ROLE IS AN ORACLE.**
 *
 *   node harness/role-script.mjs
 *
 * Two properties carry the script, and both are consequences of D9 rather than taste.
 *
 *   **S1, the Chair Rule.** Only a pair acts per episode, so at 8 players over 4 episodes about
 *   a third of the table never enters the mansion. An ability that needs the halls is dead
 *   weight for most of the game for most of the players — which is why the bible's original
 *   Season One script had to be rewritten rather than re-skinned.
 *
 *   **S6, the Outsiders.** Without them the Camera Op and the Focus Puller are oracles and the
 *   game solves itself. This file MEASURES that instead of asserting it: the poisoned-answer
 *   rate goes from 0% with no Outsider dealt to a real number with one, and a control shows the
 *   measurement can tell the difference.
 */

import { SCRIPT, SHAPE, SURFACE, resolveInformation, falsify, pairContainsProduction, spendableFromChair, outsiders, informers, STATIC_LAG_SECONDS } from '../src/party/roles.js';
import { ROLES, dealCast, viewFor, COMPOSITION, GOOD, EVIL } from '../src/party/cast.js';

let pass = 0, fail = 0;
const t = (n, c, d = '') => { if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); } else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); } return c; };

// ---------------------------------------------------------------- S0 · the two tables agree
{
  const a = Object.keys(ROLES).sort().join(',');
  const b = Object.keys(SCRIPT).sort().join(',');
  t('S0 arm · cast.js and roles.js describe exactly the same cards', a === b,
    a === b ? `${Object.keys(SCRIPT).length} roles` : `cast:[${a}] script:[${b}]`);
  const mismatch = Object.keys(SCRIPT).find((k) => SCRIPT[k].alignment !== ROLES[k].alignment);
  t('S0b · and agree on every alignment', !mismatch, mismatch || 'no drift');
}

// ---------------------------------------------------------------- S1 · the Chair Rule
{
  const abilities = Object.keys(SCRIPT).filter((k) => !SCRIPT[k].liabilityOnGuide);
  const bad = abilities.find((k) => !spendableFromChair(k));
  t('S1 · every ABILITY is spendable from a chair', !bad, bad || `${abilities.length} cards, none needs the halls`);
  t('S1b · and the shapes are only the three a no-night-phase design allows',
    Object.values(SCRIPT).every((s) => Object.values(SHAPE).includes(s.shape)),
    [...new Set(Object.values(SCRIPT).map((s) => s.shape))].join('/'));
}

// ---------------------------------------------------------------- S2 · the one exception
{
  const conditional = Object.keys(SCRIPT).filter((k) => SCRIPT[k].liabilityOnGuide);
  t('S2 · exactly one card is expedition-conditional, and it is a LIABILITY not an ability',
    conditional.length === 1 && conditional[0] === 'theStatic' && SCRIPT.theStatic.outsider,
    `${SCRIPT.theStatic.name}: ${STATIC_LAG_SECONDS}s of flyover lag when they guide — a cost, not a power looking for an opportunity`);
}

// ---------------------------------------------------------------- S3 · one Outsider per surface
{
  const o = outsiders();
  const surfaces = o.map((k) => SCRIPT[k].poisons);
  t('S3 · three Outsiders poisoning three distinct surfaces',
    o.length === 3 && new Set(surfaces).size === 3 && surfaces.every((s) => Object.values(SURFACE).includes(s)),
    o.map((k) => `${SCRIPT[k].name}→${SCRIPT[k].poisons}`).join(' · '));
  t('S3b · and two of the three are not told', outsiders().filter((k) => !SCRIPT[k].selfAware).length === 2,
    'the Method Actor knows; the Glitched and the Static do not');
}

// ---------------------------------------------------------------- S4 · the Glitched falsifies
{
  let bad = null;
  for (const role of informers()) {
    const kind = SCRIPT[role].answers;
    const cases = kind === 'boolean' ? [true, false] : kind === 'enum' ? ['sight', 'sound'] : [0, 1, 4, 7];
    for (const truth of cases) {
      const honest = resolveInformation({ role, truth, holderGlitched: false });
      const lied = resolveInformation({ role, truth, holderGlitched: true });
      if (honest.value !== truth || honest.poisoned) bad = `${role} poisoned an honest holder`;
      if (lied.value === truth) bad = bad || `${role} gave the Glitched the truth on ${truth}`;
      if (kind === 'enum' && !['sight', 'sound'].includes(lied.value)) bad = bad || `${role} returned an illegal value`;
      if (kind === 'number' && (lied.value < 0 || !Number.isFinite(lied.value))) bad = bad || `${role} returned an implausible number`;
    }
  }
  t('S4 · a Glitched holder is always told something false, and always something PLAUSIBLE', !bad,
    bad || 'a nonsense value would announce the poison; every falsification stays in the legal domain');
}

// ---------------------------------------------------------------- S5 · the Plant registers good
{
  const al = { p1: EVIL, p2: GOOD, p3: EVIL };
  t('S5 · Continuity sees Production in a pair', pairContainsProduction(['p1', 'p2'], al) === true);
  t('S5b · but not when that Production member is the Plant',
    pairContainsProduction(['p1', 'p2'], al, ['p1']) === false,
    'the honest answer is wrong, and the holder cannot tell');
  t('S5c · and the Plant does not launder a second evil',
    pairContainsProduction(['p1', 'p3'], al, ['p1']) === true, 'only the Plant registers good');
}

// ---------------------------------------------------------------- S6 · the cover, and the oracle
{
  // The Glitched's cover must never be a role somebody genuinely holds, or the clash resolves it.
  let clash = null, dealt = 0, withGlitched = 0;
  for (let s = 0; s < 3000; s++) {
    for (const count of [5, 6, 7, 8]) {
      const d = dealCast({ count, castSeed: s * 13 + count });
      dealt++;
      const g = d.seats.find((x) => x.role === 'glitched');
      if (!g) continue;
      withGlitched++;
      if (!g.cover) clash = clash || `${count}p seed ${s}: glitched has no cover`;
      if (!SCRIPT[g.cover]?.informs) clash = clash || `${count}p seed ${s}: cover ${g.cover} receives no information, so the Glitched poisons nothing`;
      if (viewFor(d, g.id).you.role !== g.cover) clash = clash || `${count}p seed ${s}: the Glitched's phone shows the truth`;
    }
  }
  t('S6 · the Glitched always believes they are a role that RECEIVES information', clash === null,
    clash || `${withGlitched} Glitched deals of ${dealt} — a cover with no info would poison nothing`);

  // The oracle measurement: what fraction of information seats are poisoned, with and without.
  const poisonRate = (count) => {
    let seats = 0, poisoned = 0;
    for (let s = 0; s < 4000; s++) {
      const d = dealCast({ count, castSeed: s * 7 + 1 });
      const info = d.seats.filter((x) => SCRIPT[x.role]?.informs);
      const g = d.seats.find((x) => x.role === 'glitched');
      seats += info.length + (g ? 1 : 0);
      if (g) poisoned += 1;
    }
    return poisoned / seats;
  };
  const r8 = poisonRate(8);
  t('S6b · with an Outsider dealt, a real share of information is poisoned', r8 > 0.15,
    `${(r8 * 100).toFixed(1)}% of information seats at 8 players are a Glitched — measured at 0.0% before the cover fix, see cast.js`);
  t('S6c · and with no Outsider slot at all, nothing is', COMPOSITION[4].outsider === 0 && poisonRate(4) === 0,
    '4 players deals no Outsider — which is why it is a tutorial count, not the game');
}

// ---------------------------------------------------------------- S7 · one line each
{
  const bad = Object.keys(SCRIPT).find((k) => !SCRIPT[k].line || SCRIPT[k].line.includes('\n') || SCRIPT[k].line.length > 150);
  t('S7 · every card is one line, readable off a nameplate', !bad,
    bad ? `${bad} is ${SCRIPT[bad].line.length} chars` : `longest ${Math.max(...Object.values(SCRIPT).map((s) => s.line.length))} chars`);
}

// ---------------------------------------------------------------- S8 · the controls
{
  t('S8a control · the falsifier genuinely changes every answer type',
    falsify('boolean', true) === false && falsify('enum', 'sight') === 'sound' && falsify('number', 4) !== 4);
  t('S8b control · a card that needed the halls would fail S1',
    !spendableFromChair('theStatic'), 'the Static is the check\'s own arm — it is the only thing S1 can see fail');
  t('S8c control · an info role with no Glitched present is an oracle',
    resolveInformation({ role: 'continuity', truth: true, holderGlitched: false }).value === true,
    'which is exactly what the Outsider slot exists to prevent');
}

console.log(`\nrole-script: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
