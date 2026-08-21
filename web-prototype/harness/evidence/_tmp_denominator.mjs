/**
 * TEMPORARY (motion-3-build): is the plant-OFF hip acceleration — the DENOMINATOR of the
 * "cost of planting" ratio — just A*omega^2 of a pure cosine? If so the ratio says nothing
 * about smoothness; it says how big an amplitude the unplanted gait happened to author.
 * Delete when the round closes.
 */
import { artifacts } from '../footskate.mjs';
import { MOVE } from '../../src/game/rules.js';

const H = 1.7;
const BATTERY = [
  ['walk 2.55', { gait: 'walk', speed: MOVE.walk }],
  ['walk 1.40', { gait: 'walk', speed: 1.4 }],
  ['walk 3.40', { gait: 'walk', speed: 3.4 }],
  ['run 5.20', { gait: 'walk', speed: MOVE.run, run: true }],
  ['run 4.20', { gait: 'walk', speed: 4.2, run: true }],
  ['turn @4.26', { gait: 'walk', speed: MOVE.run * 0.82, run: true, turn: -3.0 }],
  ['limp 1.12', { gait: 'limp', speed: MOVE.walk * MOVE.limpScale, legs: { L: false, R: true } }],
];

/** Reproduce, from the authored constants alone, what `_walk`/`_run`/`_limp` write to hipX. */
function analytic(o) {
  const sp = o.speed;
  const running = o.gait === 'walk' && (o.run || sp > MOVE.walk * 1.18);
  const m = Math.min(1, sp / (running ? MOVE.run : MOVE.walk) * 1.4);
  let stride, freqScale = 1, A;
  if (o.gait === 'limp') {
    stride = H * 0.34; freqScale = 1.25;
    A = 0.34 * m * 0.6;                       // _limp: -0.34*m*cos(f*TAU)*0.6 - 0.10
  } else {
    stride = H * (0.44 + Math.min(sp / MOVE.run, 1) * 0.52);
    A = running ? 0.82 * m : 0.50 * m;        // _run / _walk hip swing amplitude
  }
  const T = (stride / freqScale) / sp;        // seconds per cycle
  const w = 2 * Math.PI / T;
  return { A, T, peak: A * w * w };
}

console.log('# plant-OFF peak hip acceleration: measured vs A*omega^2 of a pure cosine');
console.log('# gait          A(rad)   T(s)   predicted   measured@3840   err');
for (const [label, o] of BATTERY) {
  const a = analytic(o);
  const meas = artifacts({ ...o, plant: false, hz: 3840, seconds: 4 }).maxHipAcc;
  console.log(label.padEnd(14) +
    a.A.toFixed(3).padStart(7) + a.T.toFixed(3).padStart(8) +
    a.peak.toFixed(1).padStart(12) + meas.toFixed(1).padStart(16) +
    `   ${((meas / a.peak - 1) * 100).toFixed(1)}%`);
}
