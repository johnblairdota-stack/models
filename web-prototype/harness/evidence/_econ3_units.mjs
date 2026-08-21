#!/usr/bin/env node
/** _econ3_units — throwaway. Unit-level checks on the camera economy and the W5 episode counter. */
import { foldWin, WIN_TARGETS, OUTCOME } from '../../src/party/win.js';
import { COMPOSITION } from '../../src/party/cast.js';
import { EPISODE_CAP } from '../../src/party/phases.js';
import { cameraRoster, coveredRooms, coverageFraction, ROOMS, ROOMS_PER_CAM } from '../../src/party/coverage.js';
import { createRoom } from '../../src/party/room.js';

console.log('PROBE _econ3_units\n');

console.log('=== U1. cameraTarget (win.js) vs COMPOSITION.cameras (cast.js) vs roster size ===');
console.log('  count │ WIN_TARGETS.cameraTarget │ COMPOSITION.cameras │ cameras in roster │ unlocked needed to win');
for (const c of [4,5,6,7,8]) {
  console.log(`  ${String(c).padStart(5)} │ ${String(WIN_TARGETS[c].cameraTarget).padStart(24)} │ ${String(COMPOSITION[c].cameras).padStart(19)} │ ${String(cameraRoster(1).length).padStart(17)} │ ${String(WIN_TARGETS[c].cameraTarget + 1).padStart(22)}`);
}
console.log('  (unlocked starts at 1 and each camera_lit event is +1, so the win needs unlocked = cameraTarget+1)');
console.log('  is COMPOSITION.cameras / state.cameras.needed read by any win rule? grep says: see below\n');

console.log('=== U2. coverage saturates at unlocked >= roster size, over 200 world seeds ===');
let allSame = true;
for (let ws = 1; ws <= 200; ws++) {
  for (let u = 3; u <= 6; u++) if (coverageFraction(ws, u) !== 1) allSame = false;
  if (coverageFraction(ws, 2) !== 4/6 || coverageFraction(ws, 1) !== 2/6) allSame = false;
}
console.log(`  every world seed: unlocked 1 -> 33%, 2 -> 67%, >=3 -> 100% : ${allSame}`);
console.log(`  ROOMS=${ROOMS.length} ROOMS_PER_CAM=${ROOMS_PER_CAM} -> ${ROOMS.length/ROOMS_PER_CAM} cameras`);
console.log(`  coverage.js:27 claims "at 4-6 players two cameras win and coverage caps at 4 of 6 rooms".`);
console.log(`  measured: at 4-6 players the win needs ${WIN_TARGETS[4].cameraTarget}/${WIN_TARGETS[5].cameraTarget}/${WIN_TARGETS[6].cameraTarget} camera_lit events`);
console.log(`  = unlocked ${WIN_TARGETS[4].cameraTarget+1}/${WIN_TARGETS[5].cameraTarget+1}/${WIN_TARGETS[6].cameraTarget+1}, and coverage is 100% from unlocked 3. Claim is FALSE.\n`);

console.log('=== U3. the win machine\'s episode counter, room.js log vs session.js-shaped log ===');
const r = createRoom({ count: 8, castSeed: 5, worldSeed: 5, send: () => {}, emit: () => {} });
r.start();
r.playMatch({ takeRunner: true, hunterRoom: ROOMS[0] });   // every expedition fails -> no cameras ever
const align = Object.fromEntries(r.deal.seats.map((s) => [s.id, s.alignment]));
const f = foldWin(r.log.all(), { count: 8, alignmentOf: (id) => align[id] });
const casts = r.log.all().filter((e) => e.type === 'phase.CASTING');
console.log(`  room.js played ${r.state.episode - 1} episodes; log has ${casts.length} phase.CASTING events`);
console.log(`  phase.CASTING data payload: ${JSON.stringify(casts[0]?.data)}   <- no 'episode' field`);
console.log(`  foldWin says episode = ${f.episode}, rule = ${f.rule}, outcome = ${f.outcome}`);
console.log(`  room.js state.outcome = ${r.state.outcome}  (set by room.js:295, not by the win machine)`);

// the same log, but with phase events carrying an episode number the way session.js:280 writes them
const patched = r.log.all().map((e) => {
  if (!e.type.startsWith('phase.')) return e;
  const n = r.log.all().filter((x) => x.type === 'phase.CASTING' && x.seq <= e.seq).length || 1;
  return { ...e, data: { ...e.data, episode: n } };
});
const f2 = foldWin(patched, { count: 8, alignmentOf: (id) => align[id] });
console.log(`  same log with episode numbers attached: episode = ${f2.episode}, rule = ${f2.rule}, outcome = ${f2.outcome}`);
console.log(`  => W5 is reachable ONLY when phase events carry .episode. room.js never writes it.\n`);

console.log('=== U4. the shortest possible good win, and the longest ===');
for (const c of [4,5,6,7,8]) {
  const need = WIN_TARGETS[c].cameraTarget;
  console.log(`  ${c}p: good needs ${need} consecutive surviving expeditions out of ${EPISODE_CAP} episodes `
    + `-> at most ${EPISODE_CAP - need} failed expeditions allowed in the whole game`);
}
