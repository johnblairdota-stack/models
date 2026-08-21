#!/usr/bin/env node
/** THROWAWAY — measure chairs, sight, decisions, seed-leak across many seeded games. */
import { createSession, CALL, MOVE_CHOICE, pick } from '../../src/party/session.js';
import { PHASE } from '../../src/party/phases.js';
import { ROOMS, coveredRooms, camerasLive } from '../../src/party/coverage.js';
import { guideSight, blindStrip } from '../../src/party/darkrun.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const COUNT = +arg('--count', 8);
const N = +arg('--games', 400);
const MODE = arg('--mode', 'mixed');    // guide policy

const POOL = ['Vic','Sam','Jo','Kit','Roo','Ali','Mo','Ben'];

function play({ count, castSeed, worldSeed, guidePolicy }) {
  const frames = new Map();
  const s = createSession({ count, castSeed, worldSeed, names: POOL.slice(0, count),
    send: (id, f) => frames.set(id, f) });
  const truth = s.truth();
  const align = Object.fromEntries(truth.seats.map(t => [t.id, t.alignment]));
  const decisions = Object.fromEntries(truth.seats.map(t => [t.id, 0]));
  const sightLog = [];      // {ep, lit, seen, correctCall, wasEvilGuide}
  const seedLeak = [];      // {ep, predictedHunterRoom, actualHunterRoom}
  let now = 0, lastTick = -1;
  s.start(now);
  const alive = () => s.state.players.filter(p => p.alive).map(p => p.id);
  for (let i = 0; i < 8000 && s.state.phase !== PHASE.REUNION; i++) {
    if (s.state.tick !== lastTick) {
      lastTick = s.state.tick;
      const ph = s.state.phase, a = alive();
      if (ph === PHASE.CASTING) {
        for (let k = 0; k < a.length; k++) {
          const r = a[(k + s.state.episode * 3 + worldSeed) % a.length];
          let g = a[(k + s.state.episode + 3) % a.length];
          if (g === r) g = a[(k + 1) % a.length];
          s.input(a[k], { t: 'cast', runner: r, guide: g }); decisions[a[k]]++;
        }
      } else if (ph === PHASE.EXPEDITION) {
        const gid = s.state.pair.guide, rid = s.state.pair.runner;
        const gf = s.unprojected(s.socketFor(gid).id);
        const fly = gf.flyover;
        const target = s.state.expedition.room;
        // ground truth of hunter room (stub path): recompute the same way session does
        const actualHunter = ROOMS[pick(ROOMS.length, worldSeed, 'hunter', s.state.episode)];
        seedLeak.push({ ep: s.state.episode, predicted: actualHunter, target,
          lit: s.state.cameras.unlocked, seen: !!(fly && fly.hunter) });
        const hunterHere = actualHunter === target;
        let call;
        const evilGuide = align[gid] === 'evil';
        if (evilGuide && guidePolicy !== 'honest') {
          // evil: if it knows the hunter is in the target, say CLEAR (murder); else HOLD (starve)
          call = (fly && fly.hunter && fly.room === target) ? CALL.CLEAR : CALL.HOLD;
        } else if (fly && fly.hunter) {
          call = (fly.room === target) ? CALL.HOLD : CALL.CLEAR;
        } else {
          call = (pick(2, worldSeed, 'coin', s.state.episode) === 0) ? CALL.CLEAR : CALL.HOLD;
        }
        s.input(gid, { t: 'call', call }); decisions[gid]++;
        const mv = call === CALL.CLEAR ? MOVE_CHOICE.GO : MOVE_CHOICE.WAIT;
        s.input(rid, { t: 'move', move: mv }); decisions[rid]++;
        sightLog.push({ ep: s.state.episode, lit: s.state.cameras.unlocked,
          seen: !!(fly && fly.hunter), hunterHere, call, evilGuide,
          misled: (call === CALL.CLEAR && hunterHere) || (call === CALL.HOLD && !hunterHere) });
      } else if (ph === PHASE.RECKONING) {
        // one nomination from a rotating accuser
        const acc = a[(worldSeed + s.state.episode) % a.length];
        let tgt = a[(worldSeed + s.state.episode + 2) % a.length];
        if (tgt === acc) tgt = a[(a.indexOf(acc)+1)%a.length];
        const r = s.input(acc, { t: 'nominate', target: tgt }); if (r.ok) decisions[acc]++;
      } else if (ph === PHASE.VOTE) {
        const target = s.state.nominations[0]?.target;
        for (const id of a) { s.input(id, { t: 'vote', choice: target && id !== target ? target : 'NO_ONE' }); decisions[id]++; }
      }
    }
    now += 1000; s.tick(now);
  }
  return { s, truth, align, decisions, sightLog, seedLeak,
    chairs: Object.fromEntries(Object.entries(s.state.history).map(([id,h])=>[id,h.expeditions])),
    outcome: s.state.outcome, episodes: s.state.episode - 1, cams: s.state.cameras.unlocked };
}

// ---------- run the sweep
const chairHist = new Map();      // chairs -> count of player-games
let players = 0, zeroChair = 0;
const decHist = [];
const byEp = new Map();           // ep -> {n, seen, misled, litSum}
const outcomes = new Map();
let games = 0;
for (let g = 0; g < N; g++) {
  const r = play({ count: COUNT, castSeed: 1000 + g * 7, worldSeed: 1 + g * 13, guidePolicy: MODE });
  games++;
  outcomes.set(r.outcome, (outcomes.get(r.outcome) || 0) + 1);
  for (const [id, c] of Object.entries(r.chairs)) {
    players++; if (c === 0) zeroChair++;
    chairHist.set(c, (chairHist.get(c) || 0) + 1);
  }
  for (const d of Object.values(r.decisions)) decHist.push(d);
  for (const e of r.sightLog) {
    if (!byEp.has(e.ep)) byEp.set(e.ep, { n: 0, seen: 0, misled: 0, litSum: 0 });
    const b = byEp.get(e.ep); b.n++; b.seen += e.seen ? 1 : 0; b.misled += e.misled ? 1 : 0; b.litSum += e.lit;
  }
}
console.log(`\n=== ${COUNT} players, ${games} games, guide policy=${MODE} ===`);
console.log('OUTCOMES:', [...outcomes].map(([k,v])=>`${k} ${(100*v/games).toFixed(1)}%`).join('  '));
console.log(`\nCHAIRS per player over a whole game (${players} player-games):`);
const maxC = Math.max(...chairHist.keys());
for (let c = 0; c <= maxC; c++) {
  const n = chairHist.get(c) || 0;
  console.log(`  ${c} chairs: ${String(n).padStart(6)}  ${(100*n/players).toFixed(1).padStart(5)}%  ${'#'.repeat(Math.round(60*n/players))}`);
}
console.log(`  NEVER SAT IN A CHAIR: ${(100*zeroChair/players).toFixed(1)}% of player-games`);

decHist.sort((a,b)=>a-b);
const q = (p) => decHist[Math.floor(p*(decHist.length-1))];
console.log(`\nTAPS per player per game: min ${decHist[0]} p25 ${q(.25)} median ${q(.5)} p75 ${q(.75)} max ${decHist[decHist.length-1]} mean ${(decHist.reduce((a,b)=>a+b,0)/decHist.length).toFixed(1)}`);

console.log('\nGUIDE SIGHT & HONEST ERROR by episode:');
for (const [ep, b] of [...byEp].sort((a,b)=>a[0]-b[0])) {
  console.log(`  ep${ep}: n=${String(b.n).padStart(4)} avgLit=${(b.litSum/b.n).toFixed(2)}  guide SAW hunter ${(100*b.seen/b.n).toFixed(1)}%  blind ${(100*(1-b.seen/b.n)).toFixed(1)}%  call wrong ${(100*b.misled/b.n).toFixed(1)}%`);
}
