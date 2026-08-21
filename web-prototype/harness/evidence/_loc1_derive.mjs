// `localise-1` scratch: print each SPACES row's footprint and dressing in its OWN frame, and
// prove the round trip — `snap(centre + local) === the shipped world double` — before editing.
import { SPACES } from '../../src/game/spaces.js';

const snap = (v) => Math.round(v * 1e9) / 1e9;
const bad = [];
function loc(w, c, what) {
  const v = +(w - c).toFixed(2);
  if (!Object.is(snap(c + v), w)) bad.push({ what, w, c, v, got: snap(c + v) });
  return v;
}
const f = (n) => n.toFixed(2);

for (const s of SPACES) {
  const cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2;
  const w = +(s.x1 - s.x0).toFixed(2), d = +(s.z1 - s.z0).toFixed(2);
  const ok = Object.is(snap(cx - w / 2), s.x0) && Object.is(snap(cx + w / 2), s.x1)
    && Object.is(snap(cz - d / 2), s.z0) && Object.is(snap(cz + d / 2), s.z1);
  console.log(`\n// ---- ${s.id}  at [${f(cx)}, 0, ${f(cz)}]  size ${f(w)} x ${f(d)} x ${s.storey}  footprint ${ok ? 'EXACT' : 'FAILED'}`);
  const P = (p, tag) => `[${f(loc(p[0], cx, `${s.id}.${tag}.x`))}, ${f(p[1])}, ${f(loc(p[2], cz, `${s.id}.${tag}.z`))}]`;
  for (const which of ['lights', 'lightsBox']) {
    const L = s[which];
    if (!L) continue;
    console.log(`${which}:`);
    if (L.key) console.log(`  key: pos ${P(L.key.pos, which + '.key.pos')}, at ${P(L.key.at, which + '.key.at')}`);
    (L.warm ?? []).forEach((x, i) => console.log(`  warm[${i}]: pos ${P(x.pos, `${which}.warm${i}`)}`));
    if (L.cool) console.log(`  cool: pos ${P(L.cool.pos, which + '.cool')}`);
  }
  if (s.columns) console.log(`columns: z ${f(loc(s.columns.z, cz, 'col.z'))}  xs [${s.columns.xs.map((x, i) => f(loc(x, cx, `col.x${i}`))).join(', ')}]`);
}
console.log(`\n${bad.length} values fail the snap round trip`);
for (const b of bad) console.log('  ', b);

// ---------------------------------------------------------------------------------------------
// 🚨 DOES THE TRANSFORM ACTUALLY ROTATE, OR IS IT A TRANSLATION WITH DEAD CODE IN IT?
// HANDOFF's rule: a test that has only ever run against the working case is not evidence. Every
// slot in `HOUSE_PLAN` is `turns: 0`, so the rotation arm of `placeRoom` is NEVER exercised by
// the shipped build and a byte-identical `SPACES` proves nothing about it. This drives all four
// quarter turns against the closed form and fails loudly.
// ---------------------------------------------------------------------------------------------
const { ROOMS, placeRoom, rotYOf } = await import('../../src/game/spaces.js');
{
  const q = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const fails = [];
  const at = [12.34, 0, -5.67];
  for (const room of Object.keys(ROOMS)) {
    const def = ROOMS[room];
    for (let turns = 0; turns < 4; turns++) {
      const slot = { id: 't', name: 'T', room, at, turns, lights: def.lights, lightsBox: def.lightsBox };
      let row;
      try { row = placeRoom(slot); } catch (e) {
        if (turns % 2 === 1 && def.columns) continue;   // documented: columns cannot turn
        fails.push(`${room}@${turns}: ${e.message}`); continue;
      }
      const [c, s] = q[turns];
      const odd = s !== 0;
      const wantW = odd ? def.d : def.w, wantD = odd ? def.w : def.d;
      if (Math.abs((row.x1 - row.x0) - wantW) > 1e-9 || Math.abs((row.z1 - row.z0) - wantD) > 1e-9) {
        fails.push(`${room}@${turns}: footprint ${(row.x1 - row.x0).toFixed(2)} x ${(row.z1 - row.z0).toFixed(2)} want ${wantW} x ${wantD}`);
      }
      const L = def.lights?.key; const P = row.lights?.key?.pos;
      if (L && P) {
        const wx = at[0] + c * L.pos[0] + s * L.pos[2];
        const wz = at[2] - s * L.pos[0] + c * L.pos[2];
        if (Math.abs(P[0] - wx) > 1e-9 || Math.abs(P[2] - wz) > 1e-9) {
          fails.push(`${room}@${turns}: key at ${P[0]},${P[2]} want ${wx.toFixed(4)},${wz.toFixed(4)}`);
        }
        if (turns === 1 && Math.abs(P[0] - (at[0] + L.pos[0])) < 1e-9 && Math.abs(L.pos[0]) > 0.5) {
          fails.push(`${room}@1: local +X still landed on world +X — the turn did nothing`);
        }
      }
      if (Math.abs(rotYOf(turns) - turns * Math.PI / 2) > 1e-15) fails.push(`rotYOf(${turns}) wrong`);
    }
  }
  console.log(`\nROTATION SELF-TEST: ${fails.length ? 'FAILED' : 'PASSED'} — 5 room types x 4 quarter turns`);
  for (const f of fails) console.log('  ', f);
  if (fails.length) process.exitCode = 1;
}
