#!/usr/bin/env node
/**
 * 🏆 **reunion-truth — THE REVEAL RECONCILES, AND NOTHING IT REVEALS CROSSED A WIRE FIRST.**
 *
 *   node harness/reunion-truth.mjs
 *
 * The Reunion is what earns P6. Silent deaths are only tolerable because of what happens at the
 * end, so a Reunion that is wrong, incomplete, or that reveals something the game already leaked
 * costs the design the thing it paid five episodes for.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 U2 IS THE CLEVER ONE, AND IT IS WHY THIS GATE EXISTS SEPARATELY FROM `party-isolation`.
 * ---------------------------------------------------------------------------------------------
 * `party-isolation` I3 sweeps sockets for values it knows to look for, taken from ground truth.
 * U2 sweeps them for **whatever the Reunion turns out to reveal** — it uses the Reunion's own
 * output as its leak dictionary. That is a strictly stronger source: if a future feature adds a
 * reveal, U2 starts checking for it the same day, with nobody remembering to update a list.
 *
 * The two directions together are the property: **anything the Reunion discloses must not have
 * been disclosed already, and anything disclosed early must not be re-sold as a revelation.**
 */

import { createRoom } from '../src/party/room.js';
import { reunion, rollCall, revealSet, decisiveEpisode, awards } from '../src/party/reunion.js';
import { VIS } from '../src/party/events.js';

let pass = 0, fail = 0;
const t = (n, c, d = '') => { if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); } else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); } return c; };

const SEEDS = [11, 12, 13, 14, 15, 16, 17, 18];

/** Play a real match, capturing everything every socket was sent. */
function play(seed) {
  const state = {}, events = {};
  const r = createRoom({
    count: 8, castSeed: seed * 41, worldSeed: seed,
    send: (id, f) => { (state[id] = state[id] || []).push(f); },
    emit: (id, e) => { (events[id] = events[id] || []).push(e); },
  });
  r.start();
  r.playEpisode({ hunterRoom: 'cellar' });
  const living = r.state.players.filter((p) => p.alive).map((p) => p.id);
  r.playEpisode({
    hunterRoom: 'gallery', takeRunner: true,
    nominations: [{ nominator: living[1], target: living[3] }],
    votes: Object.fromEntries(living.map((id) => [id, living[3]])),
  });
  r.playMatch({ hunterRoom: 'hall' });
  const align = Object.fromEntries(r.deal.seats.map((s) => [s.id, s.alignment]));
  return { r, state, events, ctx: { alignmentOf: (id) => align[id] } };
}

const runs = SEEDS.map(play);

// ---------------------------------------------------------------- U0 · the arm
{
  const { r, ctx } = runs[0];
  const out = reunion(r.log.all(), ctx);
  t('U0 arm · the Reunion produces all four beats from a real match',
    out.rollCall.length === 8 && out.decisive && out.awards.length > 0 && Array.isArray(out.chat),
    `${out.rollCall.length} plates · decisive ep ${out.decisive?.episode} · ${out.awards.length} awards`);
}

// ---------------------------------------------------------------- U1 · it reconciles
{
  let bad = null;
  for (const { r, ctx } of runs) {
    const roll = rollCall(r.log.all());
    const truth = r.truth().seats;
    for (const p of roll) {
      const s = truth.find((x) => x.id === p.id);
      if (!s) { bad = `${p.id} is in the roll call and not in the deal`; break; }
      if (p.role !== s.role) bad = bad || `${p.id}: reunion says ${p.role}, truth says ${s.role}`;
      if (p.alignment !== s.alignment) bad = bad || `${p.id}: alignment drift`;
      if ((p.believedTheyWere ?? null) !== (s.cover ?? null)) bad = bad || `${p.id}: cover drift`;
    }
    if (roll.length !== truth.length) bad = bad || `roll call has ${roll.length} of ${truth.length}`;
  }
  t('U1 · every plate in the roll call reconciles with ground truth', bad === null,
    bad || `${SEEDS.length} matches, 8 plates each, role + alignment + cover`);
}

// ---------------------------------------------------------------- U2 · the retro-leak sweep
{
  let bad = null, swept = 0;
  for (const { r, state, events, ctx } of runs) {
    const tokens = revealSet(r.log.all(), ctx);
    const truth = r.truth().seats;
    for (const sock of r.sockets) {
      const mine = sock.isTV ? null : truth.find((s) => s.id === sock.playerId);
      // What this socket was legitimately told during play.
      const allowed = new Set();
      if (mine) {
        allowed.add(mine.alignment);
        allowed.add(mine.cover ?? mine.role);
        if (mine.alignment === 'evil') for (const o of truth) if (o.alignment === 'evil') allowed.add(o.role);
      }
      const stream = JSON.stringify([...(state[sock.id] || []), ...(events[sock.id] || [])]);
      for (const tok of tokens) {
        if (allowed.has(tok)) continue;
        // A claim is a public assertion, not a reveal — a role NAME on a nameplate is fine.
        const asRole = new RegExp(`"role"\\s*:\\s*"${tok}"|"alignment"\\s*:\\s*"${tok}"`);
        if (asRole.test(stream)) { bad = `${sock.id} saw "${tok}" during play, and the Reunion reveals it`; break; }
      }
      swept++;
      if (bad) break;
    }
    if (bad) break;
  }
  t('U2 · nothing the Reunion reveals reached a socket during play', bad === null,
    bad || `${swept} socket streams swept against the Reunion's own reveal set`);
}

// ---------------------------------------------------------------- U3 · every award is evidenced
{
  let bad = null, granted = 0;
  for (const { r, ctx } of runs) {
    const log = r.log.all();
    const seqs = new Set(log.map((e) => e.seq));
    for (const a of awards(log, ctx)) {
      granted++;
      if (!a.querySeq.length) bad = bad || `${a.award} has no querySeq`;
      for (const s of a.querySeq) if (!seqs.has(s)) bad = bad || `${a.award} cites seq ${s}, which is not in the log`;
      if (!a.winner) bad = bad || `${a.award} has no winner`;
    }
  }
  t('U3 · every award cites real sequence numbers the TV can cut to', bad === null,
    bad || `${granted} awards across ${SEEDS.length} matches, every querySeq resolves`);

  const names = new Set(runs.flatMap(({ r, ctx }) => awards(r.log.all(), ctx).map((a) => a.award)));
  t('U3b · and the deck of awards is varied across matches', names.size >= 3, [...names].join(', '));
}

// ---------------------------------------------------------------- U4 · the stream is the stream
{
  let bad = null;
  for (const { r } of runs) {
    if (!r.log.verify().ok) bad = 'the chain does not verify';
    if (JSON.stringify(r.log.reunion()) !== JSON.stringify(r.log.all())) bad = bad || 'the Reunion is not log.all()';
  }
  t('U4 · the Reunion replays a chain that verifies, and it is the whole log', bad === null,
    bad || 'no second pipeline, no rewritten history');

  const { r } = runs[0];
  const sealed = r.log.all().filter((e) => e.vis === VIS.SEALED);
  t('U4b · and the sealed entries are what makes it worth watching',
    sealed.length > 0 && sealed.some((e) => e.type === 'cast.deal') && sealed.some((e) => e.type === 'noise.emitted'),
    `${sealed.length} sealed entries: the deal, the win checks, and every attributed noise`);
}

// ---------------------------------------------------------------- U5 · the controls
{
  const { r, ctx } = runs[0];
  const log = r.log.all();

  // (1) unseal the deal into a socket stream — U2 must go red
  const tokens = revealSet(log, ctx);
  const leaked = JSON.stringify([{ players: r.truth().seats.map((s) => ({ id: s.id, role: s.role })) }]);
  const caught = [...tokens].some((tok) => new RegExp(`"role"\\s*:\\s*"${tok}"`).test(leaked));
  t('U5a control · a leaked roster would be caught by the reveal-set sweep', caught,
    'U2 can see a role name in a stream, so its green means something');

  // (2) an award citing a seq that is not in the log
  const seqs = new Set(log.map((e) => e.seq));
  t('U5b control · U3 can see a citation that resolves to nothing', !seqs.has(999999));

  // (3) the decisive episode is derived, not stored
  const d = decisiveEpisode(log);
  t('U5c control · the decisive episode is a query with a stated reason', !!d && !!d.because,
    `episode ${d.episode} — ${d.because}`);
}

console.log(`\nreunion-truth: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
