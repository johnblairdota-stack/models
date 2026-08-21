/** THROWAWAY — chairs per player across many seeded 8p games, under several table behaviours. */
import { createSession, CALL, MOVE_CHOICE } from '../src/party/session.js';
import { PHASE } from '../src/party/phases.js';
import { castBallot, chance } from '../src/party/policy.js';

function run({ count, castSeed, worldSeed, style }) {
  const chairs = new Map();
  const s = createSession({ count, castSeed, worldSeed, send: () => {}, });
  let now = 0; s.start(now); let seen = -1; let eps = 0;
  const seatLog = [];
  for (let i = 0; i < 6000; i++) {
    if (s.state.tick !== seen) {
      seen = s.state.tick;
      const alive = s.state.players.filter(p=>p.alive).map(p=>p.id);
      if (s.state.phase === PHASE.CASTING) {
        for (const id of alive) {
          let b;
          if (style === 'spread') b = castBallot({ policy:'naive-good', self:id, living:alive, history:s.state.history, seed:worldSeed, ep:s.state.episode });
          else if (style === 'random') {
            const o = alive.filter(x=>x!==id);
            const r = o[Math.floor(chance(worldSeed, `r${s.state.episode}${id}`)*o.length)];
            const g = o.filter(x=>x!==r)[Math.floor(chance(worldSeed, `g${s.state.episode}${id}`)*(o.length-1))];
            b = { runner:r, guide:g };
          } else { // 'popular' — the table converges on two favourites
            b = { runner: alive[0], guide: alive[1] };
          }
          s.input(id, { t:'cast', runner:b.runner, guide:b.guide });
        }
      } else if (s.state.phase === PHASE.EXPEDITION) {
        s.input(s.state.pair.guide, { t:'call', call: CALL.CLEAR });
        s.input(s.state.pair.runner, { t:'move', move: MOVE_CHOICE.GO });
      } else if (s.state.phase === PHASE.RECKONING) {
        // one nomination from a rotating accuser
        const a = alive[s.state.episode % alive.length]; const tgt = alive.find(x=>x!==a);
        s.input(a, { t:'nominate', target: tgt });
      } else if (s.state.phase === PHASE.VOTE) {
        // half the table votes for the nominee -> usually no execution at 8, execution later
        const st = s.state.nominations.map(n=>n.target);
        if (st.length) for (const id of alive) s.input(id, { t:'vote', choice: st[0] });
      }
      if (s.state.phase === PHASE.EXPEDITION) {
        chairs.set(s.state.pair.runner, (chairs.get(s.state.pair.runner)||0)+1);
        chairs.set(s.state.pair.guide, (chairs.get(s.state.pair.guide)||0)+1);
        seatLog.push([s.state.episode, s.state.pair.runner, s.state.pair.guide]);
        eps++;
      }
    }
    now += 1000; s.tick(now);
    if (s.state.phase === PHASE.REUNION) break;
  }
  const all = s.state.players.map(p=>p.id);
  return { chairs: all.map(id=>chairs.get(id)||0), eps, outcome: s.state.outcome, seatLog };
}

const N = 400;
for (const style of ['spread','random','popular']) {
  for (const count of [8,5,4]) {
    const hist = new Map(); let zeros=0, tot=0, epsTot=0; const outcomes = new Map();
    for (let k=0;k<N;k++) {
      const r = run({ count, castSeed: 1000+k, worldSeed: 7000+k*3, style });
      for (const c of r.chairs) { hist.set(c,(hist.get(c)||0)+1); tot++; if(c===0) zeros++; }
      epsTot += r.eps; outcomes.set(r.outcome,(outcomes.get(r.outcome)||0)+1);
    }
    const h = [...hist.entries()].sort((a,b)=>a[0]-b[0]).map(([k,v])=>`${k}:${(100*v/tot).toFixed(1)}%`).join('  ');
    console.log(`${style.padEnd(8)} ${count}p  eps/game ${(epsTot/N).toFixed(2)}  neverSat ${(100*zeros/tot).toFixed(1)}%  chairs ${h}   ${[...outcomes].map(([k,v])=>k+'='+v).join(' ')}`);
  }
}
