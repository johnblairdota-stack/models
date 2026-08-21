/** THROWAWAY — the real session, measured: blindness, call value, win rates under strategies. */
import { createSession, CALL, MOVE_CHOICE, pick, GUIDE_TILT_DEG, STOREY_H } from '../src/party/session.js';
import { PHASE } from '../src/party/phases.js';
import { ROOMS, hunterVisibleToGuide, camerasLive, coveredRooms } from '../src/party/coverage.js';
import { guideSight, blindStrip } from '../src/party/darkrun.js';
import { castBallot } from '../src/party/policy.js';

// --- A. what the guide actually sees, per episode, over the real draws
const strip = blindStrip(STOREY_H, GUIDE_TILT_DEG);
console.log(`blind strip = ${strip.toFixed(3)} m of an 8 m draw = ${(100*strip/8).toFixed(1)}% of wall distances\n`);

function guideView({ worldSeed, ep, lit }) {
  const hunterRoom = ROOMS[pick(ROOMS.length, worldSeed, 'hunter', ep)];
  const target = ROOMS[pick(ROOMS.length, worldSeed, 'target', ep)];
  const covered = hunterVisibleToGuide({ worldSeed, unlocked: camerasLive(lit), hunterRoom });
  const wallDistance = pick(800, worldSeed, 'wall', ep) / 100;
  const sight = guideSight({ covered, wallDistance, tiltDeg: GUIDE_TILT_DEG, storeyH: STOREY_H });
  return { seen: sight.seen, hunterRoom, target, danger: hunterRoom === target };
}
console.log('ep  lit  P(guide sees hunter)  P(blind)  P(hunter in target)  P(sees AND danger)  P(blind AND danger)');
for (let ep = 1; ep <= 5; ep++) {
  const lit = Math.min(ep - 1, 4);              // the modal good game: one camera per episode
  let seen=0, danger=0, sd=0, bd=0, n=0;
  for (let ws = 1; ws <= 40000; ws++) {
    const g = guideView({ worldSeed: ws, ep, lit }); n++;
    if (g.seen) seen++; if (g.danger) danger++;
    if (g.seen && g.danger) sd++; if (!g.seen && g.danger) bd++;
  }
  console.log(`${ep}   ${lit}    ${(100*seen/n).toFixed(1).padStart(5)}%              ${(100*(1-seen/n)).toFixed(1).padStart(5)}%     ${(100*danger/n).toFixed(1).padStart(5)}%            ${(100*sd/n).toFixed(1).padStart(5)}%             ${(100*bd/n).toFixed(1).padStart(5)}%`);
}

// --- B. strategy sweep on the real session
function game({ count, castSeed, worldSeed, guideCall, runnerObeys, evilHold }) {
  const s = createSession({ count, castSeed, worldSeed, send: () => {} });
  const evil = new Set(s.truth().evil);
  let now = 0; s.start(now); let seen = -1; let eps = 0, holds = 0, takes = 0;
  for (let i = 0; i < 4000; i++) {
    if (s.state.tick !== seen) {
      seen = s.state.tick;
      const alive = s.state.players.filter(p=>p.alive).map(p=>p.id);
      switch (s.state.phase) {
        case PHASE.CASTING:
          for (const id of alive) { const b = castBallot({ policy: evil.has(id)?'patient-evil':'naive-good', self:id, living:alive, history:s.state.history, seed:worldSeed, ep:s.state.episode }); s.input(id,{t:'cast',...b}); }
          break;
        case PHASE.EXPEDITION: {
          const g = s.state.pair.guide;
          // what the guide privately holds
          const fr = s.unprojected(s.sockets.find(x=>x.playerId===g).id);
          const sees = fr.flyover ? fr.flyover.hunter : false;
          const room = fr.flyover ? fr.flyover.room : null;
          let call;
          if (evil.has(g) && evilHold) call = CALL.HOLD;
          else if (guideCall === 'honest-optimal') call = (sees && room === s.state.expedition.room) ? CALL.HOLD : CALL.CLEAR;
          else if (guideCall === 'honest-coinflip') call = sees ? ((room === s.state.expedition.room) ? CALL.HOLD : CALL.CLEAR) : (pick(2, worldSeed, 'gg', s.state.episode) ? CALL.HOLD : CALL.CLEAR);
          else call = CALL.CLEAR;
          if (evil.has(g) && !evilHold && sees && room === s.state.expedition.room) call = CALL.CLEAR; // the murder
          s.input(g, { t:'call', call });
          const move = runnerObeys ? (call === CALL.HOLD ? MOVE_CHOICE.WAIT : MOVE_CHOICE.GO) : MOVE_CHOICE.GO;
          s.input(s.state.pair.runner, { t:'move', move });
          eps++; if (move===MOVE_CHOICE.WAIT) holds++;
          break;
        }
        case PHASE.RECKONING: break;      // no execution: isolate the expedition economy
        case PHASE.VOTE: break;
      }
    }
    now += 1000; s.tick(now);
    if (s.state.phase === PHASE.REUNION) break;
  }
  takes = s.state.players.filter(p=>p.taken).length;
  return { outcome: s.state.outcome, eps, holds, takes, cams: s.state.cameras.unlocked };
}

console.log('\n--- 8p, no executions, 600 seeds: does the guide\'s word matter? ---');
const N = 600;
for (const cfg of [
  { label:'guide always CLEAR, runner obeys',        guideCall:'always-clear', runnerObeys:true,  evilHold:false },
  { label:'guide honest-optimal, runner obeys',      guideCall:'honest-optimal', runnerObeys:true, evilHold:false },
  { label:'guide honest-coinflip, runner obeys',     guideCall:'honest-coinflip', runnerObeys:true, evilHold:false },
  { label:'runner IGNORES the guide, always GO',     guideCall:'honest-optimal', runnerObeys:false, evilHold:false },
  { label:'evil guides always HOLD, runner obeys',   guideCall:'honest-optimal', runnerObeys:true, evilHold:true },
]) {
  let fin=0, canc=0, holds=0, takes=0, eps=0, cams=0;
  for (let k=0;k<N;k++) {
    const r = game({ count:8, castSeed:2000+k, worldSeed:9000+k*7, ...cfg });
    if (r.outcome==='SEASON FINALE') fin++; else canc++;
    holds+=r.holds; takes+=r.takes; eps+=r.eps; cams+=r.cams;
  }
  console.log(`${cfg.label.padEnd(38)} good ${(100*fin/N).toFixed(1)}%  eps ${(eps/N).toFixed(2)}  holds ${(holds/N).toFixed(2)}  runnersTaken ${(takes/N).toFixed(2)}  cams ${(cams/N).toFixed(2)}`);
}
