/**
 * castSeed and worldSeed always differ in bit 0 — the same FNV parity signature that made the
 * Hunter unable to enter the wing. This asks whether it can matter: castSeed feeds mulberry32
 * via `rng()`, not `pick()`, so the question is whether the deal inherits the structure.
 */
import { seedFrom } from '../../net/party/show.mjs';
import { dealCast } from '../../src/party/cast.js';
const N = 20000, roles = new Map(), firstEvil = new Map();
let bit0differ = 0;
for (let i = 0; i < N; i++) {
  const cast = seedFrom('AB' + i, 'w', i, 8), world = seedFrom('AB' + i, 'w', i + 1, 8);
  if (((cast ^ world) & 1) === 1) bit0differ++;
  const d = dealCast({ count: 8, castSeed: cast });
  const seats = d.seats ?? d;
  const r0 = (seats[0] && (seats[0].role ?? seats[0].card)) ?? '?';
  roles.set(r0, (roles.get(r0) || 0) + 1);
  const ev = seats.findIndex((s) => (s.alignment ?? s.side) === 'evil');
  firstEvil.set(ev, (firstEvil.get(ev) || 0) + 1);
}
console.log(`castSeed ^ worldSeed bit0 == 1 : ${bit0differ}/${N}`);
console.log('\nseat-1 role distribution over', N, 'deals:');
for (const [k, v] of [...roles].sort((a, b) => b[1] - a[1])) console.log(`  ${String(k).padEnd(14)} ${(v / N * 100).toFixed(2)}%`);
console.log('\nindex of the first evil seat (uniform would be flat-ish over 0..7):');
for (const [k, v] of [...firstEvil].sort((a, b) => a[0] - b[0])) console.log(`  seat ${k}: ${(v / N * 100).toFixed(2)}%`);
