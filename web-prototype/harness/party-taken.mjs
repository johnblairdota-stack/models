#!/usr/bin/env node
/**
 * 🩸 **party-taken — CONTACT WITH THE HUNTER ENDS YOU, AND THE SURVIVAL MODE IS UNTOUCHED.**
 *
 *   node harness/party-taken.mjs
 *
 * Showstopper **S2**. `hunter-ai.js` `_attack` L1100-1117 takes a LIMB, and at L1109
 *
 *     if (!socket) return;
 *
 * so a player with four limbs gone is **invulnerable** — the party loop's central event cannot
 * happen, and not because nobody wrote it: because the method structurally returns first.
 * `limbs-1` is explicit that this is correct for survival (*"never the second part, so `down` is
 * unreachable"*); a setback economy is the design there. The party mode needs an ending.
 *
 * 🚨 T2 IS THE ASSERTION THAT PROTECTS THE OTHER MODE. One engine, two rulesets. If a change to
 * the party rule ever moves the survival answer, T2 goes red before a `mechanics` run does.
 */

import { resolveContact, applyTake, afterlife, MODE, PLATE } from '../src/party/taken.js';
import { createRoom } from '../src/party/room.js';

let pass = 0, fail = 0;
const t = (n, c, d = '') => { if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); } else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); } return c; };

// ---------------------------------------------------------------- T0 · the arm
{
  const tape = {};
  const r = createRoom({ count: 8, castSeed: 3, worldSeed: 5, send: (id, f) => { (tape[id] = tape[id] || []).push(f); } });
  r.start(); r.playEpisode({ takeRunner: true });
  const last = tape['phone-2'].slice(-1)[0];
  const dead = last.players.filter((p) => !p.alive);
  t('T0 arm · a take actually happens in a real room', dead.length === 1, `${dead.length} taken`);
}

// ---------------------------------------------------------------- T1 · terminal, and limb-blind
t('T1 · party contact is terminal', resolveContact({ mode: MODE.PARTY, occupiedSockets: 4 }).outcome === 'taken');
t('T1b · party contact does not consult the limb count',
  [0, 1, 2, 3, 4].every((n) => resolveContact({ mode: MODE.PARTY, occupiedSockets: n }).outcome === 'taken'),
  'taken at 0,1,2,3,4 occupied sockets');

// ---------------------------------------------------------------- T2 · survival is untouched
t('T2 · survival still takes a limb while one remains',
  resolveContact({ mode: MODE.SURVIVAL, occupiedSockets: 3 }).outcome === 'limb');
t('T2b · survival still early-outs with nothing to take (hunter-ai.js L1109)',
  resolveContact({ mode: MODE.SURVIVAL, occupiedSockets: 0 }).outcome === 'none');

// ---------------------------------------------------------------- T3 · the L1109 hole is closed
t('T3 · a four-limbs-gone player is still takeable in party mode',
  resolveContact({ mode: MODE.PARTY, occupiedSockets: 0 }).outcome === 'taken',
  'the exact case the survival rule returns early on');

// ---------------------------------------------------------------- T4 · the take reveals nothing
{
  const { player, events } = applyTake({ id: 'p3', seat: 2, alive: true, claim: null, plate: PLATE.UNDECLARED, alignment: 'evil' });
  const publicEvents = events.filter((e) => e.vis !== 'SEALED');
  const blob = JSON.stringify(publicEvents);
  t('T4 · no public take event carries an alignment', !/good|evil/.test(blob), blob);
  t('T4b · the plate goes face-down', player.plate === PLATE.FACE_DOWN);
  t('T4c · exactly one event is SEALED for the Reunion', events.filter((e) => e.vis === 'SEALED').length === 1);
}

// ---------------------------------------------------------------- T5 · the afterlife is C1
{
  const a = afterlife();
  t('T5 · taken players get chat and nothing else (C1 + party-loop.md "Do not")',
    a.canChat && !a.canVote && !a.canDriveRobot && !a.seesMansion, JSON.stringify(a));
}

// ---------------------------------------------------------------- T6 · the controls
{
  const partyIgnoresLimbs = new Set([0, 4].map((n) => resolveContact({ mode: MODE.PARTY, occupiedSockets: n }).outcome)).size === 1;
  const survivalUsesLimbs = new Set([0, 4].map((n) => resolveContact({ mode: MODE.SURVIVAL, occupiedSockets: n }).outcome)).size === 2;
  t('T6a control · the two modes genuinely differ', partyIgnoresLimbs && survivalUsesLimbs,
    'party is limb-blind, survival is limb-driven — a rule that behaved the same in both would pass T1 and T2 vacuously');

  const leaky = { ...applyTake({ id: 'p3', seat: 2, alive: true, alignment: 'evil' }) };
  leaky.events = leaky.events.map((e) => (e.vis === 'SEALED' ? { ...e, vis: 'PUBLIC' } : e));
  t('T6b control · publishing the sealed event turns T4 red',
    /p3/.test(JSON.stringify(leaky.events.filter((e) => e.vis !== 'SEALED'))));
}

console.log(`\nparty-taken: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
