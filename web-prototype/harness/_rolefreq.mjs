#!/usr/bin/env node
/** THROWAWAY — how often each card appears at each count, and what Glitched covers. */
import { dealCast, ROLES } from '../src/party/cast.js';
const N = 4000;
for (const count of [4,5,6,7,8]) {
  const freq = {};
  for (let s = 1; s <= N; s++) {
    const d = dealCast({ count, castSeed: s * 7919 });
    for (const seat of d.seats) freq[seat.role] = (freq[seat.role] || 0) + 1;
  }
  const rows = Object.keys(ROLES).map((r) => `${r}:${((freq[r]||0)/N*100).toFixed(0)}%`);
  console.log(`${count}p  ${rows.join('  ')}`);
}
console.log('\n=== Glitched cover distribution at 8p ===');
const cov = {};
let g = 0;
for (let s = 1; s <= N; s++) {
  const d = dealCast({ count: 8, castSeed: s * 7919 });
  const gl = d.seats.find((x) => x.role === 'glitched');
  if (gl) { g++; cov[gl.cover] = (cov[gl.cover]||0)+1; }
}
console.log(`glitched dealt in ${(g/N*100).toFixed(1)}% of 8p games; covers:`, cov);
