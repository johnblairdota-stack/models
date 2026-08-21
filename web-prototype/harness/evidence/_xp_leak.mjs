#!/usr/bin/env node
/** THROWAWAY — can a player with only PUBLIC frame data compute the Hunter's room? */
import { createSession, CALL, MOVE_CHOICE, pick } from '../../src/party/session.js';
import { PHASE } from '../../src/party/phases.js';
import { ROOMS } from '../../src/party/coverage.js';
import { project } from '../../net/party/entitle.js';

let hits = 0, tries = 0, wallHits = 0;
for (let g = 0; g < 60; g++) {
  const frames = new Map();
  const s = createSession({ count: 8, castSeed: 500 + g, worldSeed: 3 + g * 17, names: ['A','B','C','D','E','F','G','H'],
    send: (id, f) => frames.set(id, f) });
  let now = 0, lastTick = -1;
  s.start(now);
  const alive = () => s.state.players.filter(p => p.alive).map(p => p.id);
  for (let i = 0; i < 8000 && s.state.phase !== PHASE.REUNION; i++) {
    if (s.state.tick !== lastTick) {
      lastTick = s.state.tick;
      const ph = s.state.phase, a = alive();
      if (ph === PHASE.CASTING) for (let k = 0; k < a.length; k++) s.input(a[k], { t: 'cast', runner: a[(k+1)%a.length], guide: a[(k+3)%a.length] });
      else if (ph === PHASE.EXPEDITION) {
        // ---- THE ATTACK: a spectator's own phone frame, projected, nothing else.
        const spectator = s.sockets.find(x => !x.isTV && !x.seatRole);
        const { frame } = project(s.unprojected(spectator.id), { playerId: spectator.playerId, alignment: spectator.alignment, isTV: false, seatRole: null });
        const ws = frame.worldSeed, ep = frame.episode;
        const guessHunter = ROOMS[pick(ROOMS.length, ws, 'hunter', ep)];
        const guessWall = pick(800, ws, 'wall', ep) / 100;
        const t = s.truth();
        tries++;
        if (guessHunter === t.hunterRoom) hits++;
        // also: is the target room predictable a phase early? (it is announced, so skip)
        if (Math.abs(guessWall - (pick(800, ws,'wall',ep)/100)) < 1e-9) wallHits++;
        s.input(s.state.pair.guide, { t: 'call', call: guessHunter === frame.expedition.room ? CALL.HOLD : CALL.CLEAR });
        s.input(s.state.pair.runner, { t: 'move', move: guessHunter === frame.expedition.room ? MOVE_CHOICE.WAIT : MOVE_CHOICE.GO });
      } else if (ph === PHASE.RECKONING) s.input(a[0], { t: 'nominate', target: a[1] });
      else if (ph === PHASE.VOTE) for (const id of a) s.input(id, { t: 'vote', choice: 'NO_ONE' });
    }
    now += 1000; s.tick(now);
  }
}
console.log(`Hunter's room predicted from PUBLIC frame fields alone: ${hits}/${tries} = ${(100*hits/tries).toFixed(1)}%  (chance = 16.7%)`);
console.log(`Guide's blind-strip wall distance likewise derivable: ${wallHits}/${tries}`);
