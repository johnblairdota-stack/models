import { blindStrip, DETENT, noiseFor, audibleRange, SILENT_SPEED, silentCrossing } from '../../src/party/darkrun.js';
import { coverageFraction, camerasLive, expectedHonestErrorSeen, ROOMS, ROOMS_PER_CAM } from '../../src/party/coverage.js';
import { WIN_TARGETS } from '../../src/party/win.js';
import { MOVE, HUNTER_SPEED, HUNTER_SENSE } from '../../src/game/rules.js';

const strip = blindStrip(4.80, 62);
console.log('blind strip @4.80m,62deg =', strip.toFixed(4), '  (header says 2.55)');
const blind = strip / 8;
console.log('P(inside strip), wallDistance U[0,8) =', (blind*100).toFixed(3)+'%', '  (header says 31.9%)');
console.log('\nDETENTS — audible range:');
for (const d of DETENT) {
  const n = noiseFor(d.speed);
  console.log(`  ${d.name.padEnd(6)} speed ${d.speed.toFixed(2)}  noise ${n.toFixed(4)}  audible ${audibleRange(n).toFixed(3)} m`);
}
console.log('  header claim: CREEP "already audible at 2.42 m"');
console.log('  SILENT_SPEED =', SILENT_SPEED.toFixed(4), 'm/s; x90s =', silentCrossing(90).toFixed(2), 'm  (header says 14.04)');
console.log('  detents inside silent band (0, SILENT_SPEED):', DETENT.filter(d=>d.speed>0 && d.speed<SILENT_SPEED).map(d=>d.name));

console.log('\nCOVERAGE curve (avg over 400 seeds):');
for (let lit=0; lit<=4; lit++) {
  let c=0; for (let s=1;s<=400;s++) c += coverageFraction(s, camerasLive(lit));
  c/=400;
  console.log(`  lit ${lit} -> ${camerasLive(lit)} live · coverage ${(c*100).toFixed(1)}% · honest err ${(expectedHonestErrorSeen(c,blind)*100).toFixed(1)}%`);
}
console.log('  cameras that exist =', ROOMS.length/ROOMS_PER_CAM, '; WIN_TARGETS cameraTarget =', Object.fromEntries(Object.entries(WIN_TARGETS).map(([k,v])=>[k,v.cameraTarget])));
console.log('\nOUTRUN: MOVE.run', MOVE.run, 'vs HUNTER_SPEED', HUNTER_SPEED.slice(1));
console.log('limp top speed =', (MOVE.walk*MOVE.limpScale).toFixed(3), 'm/s  (expedition.js header says 1.12, "SLOWER than stage-1 Hunter at 2.05")');
