/**
 * _rc_inv — THE REUNION'S RAW MATERIAL. Drives complete games through the REAL session
 * (session.js, the one the show runs) and inventories every sealed fact by type.
 * Probe. Read-only against tracked files.
 */
import { createSession, CALL, MOVE_CHOICE } from '../../src/party/session.js';
import { PHASE } from '../../src/party/phases.js';
import { VIS } from '../../src/party/events.js';
import { reunion, awards, rollCall, decisiveEpisode, revealSet, chatUnmixed } from '../../src/party/reunion.js';

const R = (seed) => { let h = (seed * 2654435761) >>> 0; return () => (h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0) / 4294967296; };

export function play({ count = 8, castSeed = 1, worldSeed = 2, style = 'engaged' } = {}) {
  const tape = new Map(), events = new Map();
  const rnd = R(castSeed * 7919 + worldSeed);
  const s = createSession({
    count, castSeed, worldSeed,
    send: (id, f) => { if (!tape.has(id)) tape.set(id, []); tape.get(id).push(f); },
    emit: (id, e) => { if (!events.has(id)) events.set(id, []); events.get(id).push(e); },
  });
  const refusals = [];
  const act = (pid, msg) => { const r = s.input(pid, msg); if (!r.ok) refusals.push({ pid, msg, why: r.why }); return r; };
  const taps = () => {
    const alive = s.state.players.filter((p) => p.alive).map((p) => p.id);
    if (!alive.length) return;
    switch (s.state.phase) {
      case PHASE.PREMIERE:
        for (const id of alive) if (rnd() < 0.75) act(id, { t: 'claim', claim: ['Focus Puller','Gaffer','Boom Op','Grip','Script Sup'][Math.floor(rnd()*5)] });
        break;
      case PHASE.CASTING:
        for (let i = 0; i < alive.length; i++) {
          if (style === 'quiet' && i > 1) continue;
          const a = Math.floor(rnd() * alive.length), b = Math.floor(rnd() * alive.length);
          act(alive[i], { t: 'cast', runner: alive[a], guide: alive[(b + 1) % alive.length] });
        }
        break;
      case PHASE.EXPEDITION:
        if (s.state.call.said == null && s.state.pair.guide)
          act(s.state.pair.guide, { t: 'call', call: rnd() < 0.7 ? CALL.CLEAR : CALL.HOLD });
        if (s.state.pair.runner)
          act(s.state.pair.runner, { t: 'move', move: rnd() < 0.75 ? MOVE_CHOICE.GO : MOVE_CHOICE.WAIT });
        break;
      case PHASE.RECKONING: {
        const n = s.state.nominations.length;
        if (n < 2 && rnd() < 0.5 && alive.length > 2) {
          const a = Math.floor(rnd() * alive.length); let b = Math.floor(rnd() * alive.length);
          if (a === b) b = (b + 1) % alive.length;
          act(alive[a], { t: 'nominate', target: alive[b] });
        }
        break;
      }
      case PHASE.VOTE: {
        const targets = s.state.nominations.map((x) => x.target);
        for (const id of alive) if (style !== 'quiet' || rnd() < 0.5) {
          const c = targets.length ? targets[Math.floor(rnd() * targets.length)] : null;
          if (c) act(id, { t: 'vote', choice: c });
        }
        break;
      }
      default: break;
    }
  };
  let now = 0;
  s.start(now);
  for (let i = 0; i < 40000; i++) {
    taps();
    now += 500;
    s.tick(now);
    if (s.state.phase === PHASE.REUNION) break;
  }
  const align = Object.fromEntries(s.truth().seats.map((x) => [x.id, x.alignment]));
  return { s, tape, events, refusals, ctx: { alignmentOf: (id) => align[id] }, log: s.log.all() };
}

if (process.argv[1].endsWith('_rc_inv.mjs')) {
  const N = Number(process.argv[2] || 40);
  const runs = [];
  for (let i = 0; i < N; i++) runs.push(play({ castSeed: 100 + i * 13, worldSeed: 7 + i * 29 }));

  const one = runs[0];
  console.log(`=== ONE REAL GAME (castSeed 100, worldSeed 7) — ${one.log.length} entries, outcome ${one.s.state.outcome}, ${one.s.state.episode - 1} episodes\n`);
  const byVis = new Map();
  for (const e of one.log) {
    const k = e.vis + '  ' + e.type;
    byVis.set(k, (byVis.get(k) || 0) + 1);
  }
  console.log('--- every entry type, by visibility class ---');
  for (const [k, v] of [...byVis].sort()) console.log(`  ${String(v).padStart(4)}  ${k}`);

  console.log('\n--- SEALED ONLY: the entire raw material of the Reunion ---');
  const sealed = one.log.filter((e) => e.vis === VIS.SEALED);
  const st = new Map();
  for (const e of sealed) st.set(e.type, (st.get(e.type) || 0) + 1);
  for (const [k, v] of [...st].sort((a,b)=>b[1]-a[1])) console.log(`  ${String(v).padStart(4)}  ${k}   fields: {${Object.keys(sealed.find((e)=>e.type===k).data).join(', ')}}`);
  console.log(`  TOTAL sealed: ${sealed.length} of ${one.log.length} (${(100*sealed.length/one.log.length).toFixed(1)}%)`);

  // aggregate across N
  console.log(`\n=== ACROSS ${N} GAMES ===`);
  const agg = new Map(), aggAll = new Map();
  for (const r of runs) {
    for (const e of r.log) {
      aggAll.set(e.type, (aggAll.get(e.type) || 0) + 1);
      if (e.vis === VIS.SEALED) agg.set(e.type, (agg.get(e.type) || 0) + 1);
    }
  }
  const gamesWith = (type) => runs.filter((r) => r.log.some((e) => e.type === type)).length;
  console.log('sealed type          total   mean/game   games with ≥1');
  for (const [k, v] of [...agg].sort((a,b)=>b[1]-a[1]))
    console.log(`  ${k.padEnd(20)} ${String(v).padStart(5)}   ${(v/N).toFixed(2).padStart(7)}   ${gamesWith(k)}/${N}`);
  console.log('\nnon-sealed types present:', [...aggAll.keys()].filter((k)=>!agg.has(k)).sort().join(', '));
  console.log('\nSPEC types NEVER written:');
  const spec = ['chat.posted','chat.tips_set','sabotage.armed','sabotage.fired','cut.to','cut.away','award.granted','guide.ping','run.pose','death.recorded','player.claim_draft','host.skip_to_reunion','rig.collapse','noise.spike','task.timeout','cast.tally','run.room_entered','run.terminal_reached'];
  for (const k of spec) if (!aggAll.has(k)) console.log('  ' + k);
}
