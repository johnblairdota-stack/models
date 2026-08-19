import { buildUnit4H } from '../src/characters/unit4h.js';
import { sampleGait } from '../src/game/locomotion.js';
import { MOVE } from '../src/game/rules.js';

const unit = buildUnit4H({ height: 1.7, materials: {} });
const R2D = 180 / Math.PI;

const turn = sampleGait(unit, {
  gait: 'walk', speed: MOVE.run * 0.82, run: true, turn: -3.0, phase: 0.12, plant: true,
});
console.log('TURN  roll=', (turn.offset.roll*R2D).toFixed(2), 'deg  pitch=', (turn.offset.pitch*R2D).toFixed(2), 'deg  yaw=', (turn.offset.yaw*R2D).toFixed(2));

const oneleg = sampleGait(unit, {
  gait: 'limp', speed: MOVE.walk * MOVE.limpScale, legs: { L: false, R: true }, phase: 0.20, plant: true,
});
console.log('ONE-LEG roll=', (oneleg.offset.roll*R2D).toFixed(2), 'deg  pitch=', (oneleg.offset.pitch*R2D).toFixed(2), 'deg  yaw=', (oneleg.offset.yaw*R2D).toFixed(2));

// scan phase 0..1 for oneleg to find min/max roll across the cycle, since a single sampled
// phase may not be the extremum the builder is quoting
let minRoll = Infinity, maxRoll = -Infinity, minP = 0, maxP = 0;
for (let p = 0; p < 1; p += 0.01) {
  const s = sampleGait(unit, {
    gait: 'limp', speed: MOVE.walk * MOVE.limpScale, legs: { L: false, R: true }, phase: p, plant: true,
  });
  const rd = s.offset.roll * R2D;
  if (rd < minRoll) { minRoll = rd; minP = p; }
  if (rd > maxRoll) { maxRoll = rd; maxP = p; }
}
console.log('ONE-LEG roll range over full cycle:', minRoll.toFixed(2), '@phase', minP.toFixed(2), '..', maxRoll.toFixed(2), '@phase', maxP.toFixed(2));

// also without plant, for comparison
const onelegNoPlant = sampleGait(unit, {
  gait: 'limp', speed: MOVE.walk * MOVE.limpScale, legs: { L: false, R: true }, phase: 0.20, plant: false,
});
console.log('ONE-LEG (plant=false) roll=', (onelegNoPlant.offset.roll*R2D).toFixed(2), 'deg  pitch=', (onelegNoPlant.offset.pitch*R2D).toFixed(2));
