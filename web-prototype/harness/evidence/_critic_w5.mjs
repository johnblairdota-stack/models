// PROBE: over the SHIPPED session, (a) does win rule W5 ever fire? (b) does a blind guide frame
// omit the hunter mark the way guide-coverage C3b asserts of room.js?
import { createSession, CALL, MOVE_CHOICE } from '../../src/party/session.js';
import { PHASE, EPISODE_CAP } from '../../src/party/phases.js';

function play(seed, callPolicy) {
  const tape = new Map();
  const s = createSession({ count: 8, castSeed: seed, worldSeed: seed * 7,
    send: (id, f) => { if (!tape.has(id)) tape.set(id, []); tape.get(id).push(f); } });
  let now = 0; s.start(now);
  for (let i = 0; i < 20000 && s.state.phase !== PHASE.REUNION; i++) {
    const alive = s.state.players.filter((p) => p.alive).map((p) => p.id);
    switch (s.state.phase) {
      case PHASE.CASTING:
        for (let k = 0; k < alive.length; k++) s.input(alive[k], { t:'cast', runner: alive[(k+1)%alive.length], guide: alive[(k+2)%alive.length] });
        break;
      case PHASE.EXPEDITION:
        s.input(s.state.pair.guide, { t:'call', call: callPolicy(s) });
        s.input(s.state.pair.runner, { t:'move', move: MOVE_CHOICE.GO });
        break;
      default: break;   // nobody nominates, nobody votes -> no executions
    }
    now += 1000; s.tick(now);
  }
  return { s, tape };
}

const rules = {};
let blindFrames = 0, blindWithNulledMark = 0, blindWithHunterMark = 0, sightedFrames = 0;
const flyKeys = new Set();
for (let seed = 1; seed <= 120; seed++) {
  for (const [name, pol] of [['CLEAR', () => CALL.CLEAR], ['HOLD', () => CALL.HOLD],
                             ['alt', (s) => (s.state.episode % 2 ? CALL.CLEAR : CALL.HOLD)]]) {
    const { s, tape } = play(seed, pol);
    const w = s.log.all().filter((e) => e.type === 'win.checked').slice(-1)[0];
    const key = `${w?.data.rule ?? 'none'} / ${s.state.outcome}`;
    rules[key] = (rules[key] || 0) + 1;
    for (const frames of tape.values()) for (const f of frames) {
      if (!f.flyover) continue;
      for (const k of Object.keys(f.flyover)) flyKeys.add(k);
      if (f.flyover.hunter === true) { sightedFrames++; continue; }
      blindFrames++;
      const marks = f.flyover.marks || [];
      if (marks.some((m) => m.kind === 'hunter')) blindWithHunterMark++;
      if ('room' in f.flyover && f.flyover.room === null) blindWithNulledMark++;
    }
  }
}
console.log('win rule / outcome over 360 shipped shows (no vote, so W5 is the only cap route):');
for (const k of Object.keys(rules).sort()) console.log('   ', k, '×', rules[k]);
console.log('\nEPISODE_CAP =', EPISODE_CAP);
console.log('\nflyover keys seen:', [...flyKeys].join(', '));
console.log('blind flyover frames:', blindFrames, ' of which carry a hunter mark:', blindWithHunterMark);
console.log('sighted flyover frames:', sightedFrames);
