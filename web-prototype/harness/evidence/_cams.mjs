import { ROOMS, ROOMS_PER_CAM, cameraRoster, coveredRooms, coverageFraction, camerasLive, ESTABLISHING_CAMS } from '../../src/party/coverage.js';
import { WIN_TARGETS, camerasNeeded } from '../../src/party/win.js';
import { EPISODE_CAP } from '../../src/party/phases.js';
console.log('ROOMS', ROOMS.length, 'ROOMS_PER_CAM', ROOMS_PER_CAM, '-> cameras that exist:', cameraRoster(12345).length);
console.log('EPISODE_CAP', EPISODE_CAP);
console.log('\ncount | cameraTarget | lights needed | live cams at target | cams that exist | coverage at each light');
for (const n of [4,5,6,7,8]) {
  const tgt = WIN_TARGETS[n].cameraTarget;
  const cov = [];
  for (let lit=0; lit<=tgt; lit++) cov.push(`${lit}:${(coverageFraction(12345, camerasLive(lit))*100).toFixed(0)}%`);
  console.log(`  ${n}   |      ${tgt}       |      ${tgt}       |        ${camerasLive(tgt)}         |       ${cameraRoster(12345).length}        | ${cov.join(' ')}`);
}
console.log('\nfirst light at which coverage saturates (per seed sample):');
for (const ws of [1,2,3,999,123456]) {
  let sat=null;
  for(let lit=0; lit<=5; lit++) if (coverageFraction(ws, camerasLive(lit))===1 && sat===null) sat=lit;
  console.log(`  worldSeed ${ws}: 100% coverage from light ${sat} onward; lights bought after that: ${WIN_TARGETS[8].cameraTarget - sat}`);
}
console.log('\nis the 8-player target even reachable in 5 episodes? target', WIN_TARGETS[8].cameraTarget, 'of', EPISODE_CAP, 'episodes');
