/**
 * Headless gate for doorway-pick.js. A 5.72 x 2.80 clear face must open
 * in <= 6 blows (measured winner is 3).
 *   node harness/evidence/_taskrun_picker_unit.mjs
 */
import { DamageField, CELL } from '../../src/destruction/damagefield.js';
import { pickDoorwayHit, channelOpen } from '../../src/game/doorway-pick.js';

const g = new DamageField({ width: 5.72, height: 2.80, cell: CELL });
g.setBarrierEverywhere(false);

let blows = 0;
for (let i = 0; i < 12; i++) {
  const hit = pickDoorwayHit(g);
  if (!hit) break;
  g.applyHit(hit.u, hit.v, 1);
  blows++;
  if (channelOpen(g)) break;
}

const open = channelOpen(g);
const ok = open && blows > 0 && blows <= 6;
console.log(JSON.stringify({ open, blows, ok }));
if (!ok) process.exit(1);
