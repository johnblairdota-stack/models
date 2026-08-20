#!/usr/bin/env node
/**
 * 📼 **party-log — THE REUNION IS THE SAME REPLAY WITH THE FILTER OFF.**
 *
 *   node harness/party-log.mjs
 *
 * The claim the whole spine rests on (`rrr-build-brief.md` §3): the live per-socket filter and
 * the Reunion are ONE mechanism, so **a leak and a missing reveal are the same bug**. This file
 * is what makes that a property rather than a slogan.
 *
 * 🚨 L4 IS THE ONE THAT WOULD CATCH A REAL REGRESSION. It is easy to write a Reunion that
 * assembles its own reveal payload — and then the Reunion is complete while the log is missing
 * something, or the log is right while the Reunion has drifted. L4 asserts the Reunion is
 * `log.all()` and nothing else, so the only way to add a reveal is to write the event.
 */

import { createRoom } from '../src/party/room.js';
import { visibleTo } from '../src/party/log.js';
import { VIS } from '../src/party/events.js';
import { ROOMS } from '../src/party/coverage.js';

let pass = 0, fail = 0;
const t = (n, c, d = '') => { if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); } else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); } return c; };

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const runs = SEEDS.map((seed) => {
  const seen = {};
  const r = createRoom({
    count: 8, castSeed: seed * 31, worldSeed: seed,
    send: () => {}, emit: (id, ev) => { (seen[id] = seen[id] || []).push(ev); },
  });
  r.start();
  r.playEpisode({ hunterRoom: ROOMS[5] });
  r.playEpisode({ hunterRoom: 'gallery', takeRunner: true });
  return { r, seen };
});

// ---------------------------------------------------------------- L0 · the arm
{
  const { r, seen } = runs[0];
  const all = r.log.all();
  const kinds = new Set(all.map((e) => e.vis));
  const armed = all.length > 10 && kinds.has(VIS.SEALED) && kinds.has(VIS.EVIL) && kinds.has(VIS.SELF) && kinds.has(VIS.PUBLIC);
  t('L0 arm · the log carries every visibility class', armed,
    `${all.length} entries · ${[...kinds].join('/')} · ${Object.keys(seen).length} sockets`);
}

// ---------------------------------------------------------------- L1 · SEALED reaches nobody
{
  let bad = null;
  for (const { r, seen } of runs) {
    const sealed = new Set(r.log.all().filter((e) => e.vis === VIS.SEALED).map((e) => e.seq));
    for (const [id, evs] of Object.entries(seen)) {
      const leaked = evs.find((e) => sealed.has(e.seq));
      if (leaked) { bad = `${id} received sealed ${leaked.type}`; break; }
    }
    if (bad) break;
  }
  t('L1 · no SEALED entry reaches any socket, including the TV', bad === null, bad || `${SEEDS.length} games`);
}

// ---------------------------------------------------------------- L2 · EVIL and SELF hold
{
  let bad = null;
  for (const { r, seen } of runs) {
    for (const sock of r.sockets) {
      const ctx = { playerId: sock.playerId, alignment: sock.alignment, isTV: sock.isTV };
      for (const e of (seen[sock.id] || [])) {
        if (!visibleTo(e, ctx)) { bad = `${sock.id} received ${e.type} (vis ${e.vis})`; break; }
      }
      // and the converse: everything it was entitled to, it got
      const want = r.log.all().filter((e) => visibleTo(e, ctx)).map((e) => e.seq).join(',');
      const got = (seen[sock.id] || []).map((e) => e.seq).join(',');
      if (want !== got) { bad = bad || `${sock.id} entitled to [${want}] but got [${got}]`; }
      if (bad) break;
    }
    if (bad) break;
  }
  t('L2 · every socket got exactly what vis entitles — no more, no less', bad === null, bad || 'both directions hold');
}

// ---------------------------------------------------------------- L3 · the chain
{
  const bad = runs.find(({ r }) => !r.log.verify().ok);
  t('L3 · the hash chain verifies on every game', !bad, bad ? JSON.stringify(bad.r.log.verify()) : `${SEEDS.length} chains intact`);
}

// ---------------------------------------------------------------- L4 · the Reunion IS the log
{
  const bad = runs.find(({ r }) => JSON.stringify(r.log.reunion()) !== JSON.stringify(r.log.all()));
  t('L4 · the Reunion is log.all() and nothing else', !bad,
    bad ? 'the Reunion has drifted from the log' : 'one stream, one reveal');

  // and it is strictly richer than any live view — otherwise sealing bought nothing
  const { r, seen } = runs[0];
  const best = Math.max(...Object.values(seen).map((a) => a.length));
  t('L4b · the Reunion reveals strictly more than the best-informed socket saw',
    r.log.reunion().length > best, `${r.log.reunion().length} entries vs ${best} seen live`);
}

// ---------------------------------------------------------------- L5 · the deal is in there
{
  const { r } = runs[0];
  const deal = r.log.all().find((e) => e.type === 'cast.deal');
  const truth = r.truth();
  const same = deal && JSON.stringify(deal.data.seats.map((s) => `${s.id}:${s.role}:${s.alignment}`).sort())
    === JSON.stringify(truth.seats.map((s) => `${s.id}:${s.role}:${s.alignment}`).sort());
  t('L5 · the sealed deal reconciles with ground truth', !!same,
    'the roll call needs no second source');
}

// ---------------------------------------------------------------- L6 · the controls
{
  const { r } = runs[0];
  const ctxGood = { playerId: r.sockets.find((s) => s.alignment === 'good').playerId, alignment: 'good', isTV: false };
  const ctxTV = { playerId: null, alignment: null, isTV: true };
  t('L6a control · unsealing the deal makes it visible to a good phone',
    visibleTo({ vis: VIS.PUBLIC }, ctxGood) && !visibleTo({ vis: VIS.SEALED }, ctxGood));
  t('L6b control · DIRECTOR reaches the TV and no phone',
    visibleTo({ vis: VIS.DIRECTOR }, ctxTV) && !visibleTo({ vis: VIS.DIRECTOR }, ctxGood));
  t('L6c control · an unknown visibility denies by default', !visibleTo({ vis: 'BROADCAST' }, ctxTV) && !visibleTo({ vis: 'BROADCAST' }, ctxGood));

  const tampered = r.log.all();
  const orig = tampered[2].data;
  tampered[2].data = { ...orig, tampered: true };
  const v = r.log.verify();
  tampered[2].data = orig;
  t('L6d control · editing a written entry breaks the chain', !v.ok, `detected at index ${v.at}`);
}

console.log(`\nparty-log: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
