#!/usr/bin/env node
/** THROWAWAY — how the Reunion's beats land across many games. */
import { createSession, CALL, MOVE_CHOICE } from '../../src/party/session.js';
import { PHASE } from '../../src/party/phases.js';
import { reunion } from '../../src/party/reunion.js';

function play(castSeed, worldSeed, seedRnd) {
  const S = createSession({ count: 8, castSeed, worldSeed, send: () => {} });
  const truth = S.truth();
  let now = 1000; const step = () => { now += 1; S.skip(now); };
  S.start(now);
  let rnd = seedRnd >>> 0;
  const R = () => { rnd = (rnd * 1664525 + 1013904223) >>> 0; return rnd / 4294967296; };
  for (let ep = 1; ep <= 6; ep++) {
    if (S.state.phase === PHASE.PREMIERE) step();
    if (S.state.phase !== PHASE.CASTING) break;
    const alive = S.state.players.filter((p) => p.alive).map((p) => p.id);
    for (const id of alive) {
      const a = alive[Math.floor(R() * alive.length)];
      let b = alive[Math.floor(R() * alive.length)];
      if (b === a) b = alive[(alive.indexOf(a) + 1) % alive.length];
      S.input(id, { t: 'cast', runner: a, guide: b });
    }
    step();
    S.input(S.state.pair.guide, { t: 'call', call: R() < 0.75 ? CALL.CLEAR : CALL.HOLD });
    S.input(S.state.pair.runner, { t: 'move', move: R() < 0.8 ? MOVE_CHOICE.GO : MOVE_CHOICE.WAIT });
    step(); step();
    const al2 = S.state.players.filter((p) => p.alive).map((p) => p.id);
    const claimer = al2[Math.floor(R() * al2.length)];
    S.input(claimer, { t: 'claim', claim: 'Camera Op' });
    step();
    if (S.state.phase === PHASE.RECKONING) {
      const a3 = S.state.players.filter((p) => p.alive).map((p) => p.id);
      const nomr = a3[Math.floor(R() * a3.length)];
      let tgt = a3[Math.floor(R() * a3.length)];
      if (tgt === nomr) tgt = a3[(a3.indexOf(tgt) + 1) % a3.length];
      S.input(nomr, { t: 'nominate', target: tgt });
      step();
      for (const id of S.state.players.filter((p) => p.alive).map((p) => p.id)) {
        S.input(id, { t: 'vote', choice: R() < 0.7 ? tgt : 'NO_ONE' });
      }
      step(); step(); step();
    }
    if (S.state.phase === PHASE.REUNION) break;
  }
  const alignOf = (id) => (truth.seats.find((s) => s.id === id) || {}).alignment;
  return { S, truth, R: reunion(S.log.all(), { alignmentOf: alignOf }) };
}

let n = 0, chatEmpty = 0, believedShown = 0, collide = 0, awardTotal = 0, markMissing = 0, coldBlood = 0, reached = 0;
const awardCount = {};
for (let s = 1; s <= 300; s++) {
  const { S, R } = play(s * 1013, s * 31, s * 7);
  if (S.state.phase !== PHASE.REUNION) continue;
  reached++; n++;
  if (R.chat.length === 0) chatEmpty++;
  if (R.rollCall.some((p) => p.believedTheyWere && p.believedTheyWere !== p.role)) believedShown++;
  const names = R.awards.map((a) => a.award);
  for (const a of names) awardCount[a] = (awardCount[a] || 0) + 1;
  awardTotal += names.length;
  const mt = R.awards.find((a) => a.award === 'Most Trusted');
  const da = R.awards.find((a) => a.award === 'Dead Air');
  if (mt && da && mt.winner === da.winner) collide++;
  if (!names.includes('The Mark')) markMissing++;
  if (names.includes('Cold Blood')) coldBlood++;
}
console.log(`games reaching the Reunion: ${reached}/300`);
console.log(`Beat 4 (chat) empty:            ${chatEmpty}/${n}  (${(chatEmpty/n*100).toFixed(0)}%)`);
console.log(`Beat 1 shows a "believed" line: ${believedShown}/${n}  (${(believedShown/n*100).toFixed(0)}%)`);
console.log(`avg awards per Reunion:         ${(awardTotal/n).toFixed(2)}`);
console.log(`award frequency:`, awardCount);
console.log(`Most Trusted === Dead Air:      ${collide}/${n}  (${(collide/n*100).toFixed(0)}%)  <-- same player wins "most trusted" and "did nothing"`);
console.log(`Cold Blood granted:             ${coldBlood}/${n}`);
