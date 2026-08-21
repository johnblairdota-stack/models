#!/usr/bin/env node
/** _t4_map — what `mapRooms` actually returns. Throwaway probe; reads only. */
import { SPACES } from '../../src/game/spaces.js';
import { mapRooms } from '../../src/game/director-rig.js';
import { ROOMS } from '../../src/party/coverage.js';
console.log('engine spaces (id → display name):');
for (const s of SPACES) console.log(`   ${String(s.id).padEnd(9)} name="${s.name}"`);
const m = mapRooms(SPACES);
console.log('\nmapRooms():');
let wrong = 0;
for (const r of ROOMS) {
  const hit = m[r];
  const ok = hit && hit.id === r;
  if (!ok) wrong++;
  console.log(`   party ${r.padEnd(9)} → engine ${String(hit && hit.id).padEnd(9)} ${ok ? '' : '  ← WRONG ROOM'}`);
}
console.log(`\n${wrong} of ${ROOMS.length} rooms map to a space that is not themselves.`);
