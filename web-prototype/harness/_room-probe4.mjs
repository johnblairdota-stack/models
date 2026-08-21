#!/usr/bin/env node
/** _room-probe4 — CRITIC PROBE. The address, the room's geometry, the names, the flash rate. */
import { networkInterfaces } from 'node:os';
import { lanAddress, COLOURS } from '../net/party/lobby.mjs';
import { rateGate, roomGate, ROOM_SETTLE, NOISE_GAP } from '../src/views/expedition.js';
import { MIN_HOLD, MAX_HOLD, RANK } from '../src/party/director.js';

console.log('A · WHAT THE TELEVISION PRINTS AS THE JOIN ADDRESS');
console.log('  lanAddress() =', lanAddress());
console.log('  interfaces in the order the function walks them:');
for (const [nm, list] of Object.entries(networkInterfaces())) {
  for (const ni of list ?? []) if (ni.family === 'IPv4') console.log(`    ${nm.padEnd(12)} ${ni.address.padEnd(16)} internal=${ni.internal}`);
}
const url = `http://${lanAddress()}:5183/p`;
console.log('  URL a guest must type on a phone keyboard:', url, `(${url.length} chars,`,
  url.replace(/[^0-9]/g,'').length, 'of them digits → a keyboard mode switch each way)');

console.log('\nB · CONTRAST OF THE DIM INK, WHICH CARRIES CLAIM / TAG / FOOTER / FACTS');
const hexv=(h)=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
const lin=(c)=>{c/=255;return c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4;};
const lum=(h)=>{const[r,g,b]=hexv(h).map(lin);return 0.2126*r+0.7152*g+0.0722*b;};
const ratio=(a,b)=>{const[x,y]=[lum(a),lum(b)].sort((p,q)=>q-p);return (x+0.05)/(y+0.05);};
for (const [fg,bg,what] of [['#8b93a3','#141821','--dim on --panel (the rail: TAG, CLAIM)'],
  ['#8b93a3','#0b0d12','--dim on --bg (footer, .sub, .hint)'],
  ['#f2f4f8','#141821','--ink on --panel (the name)'],
  ['#e0b23c','#0b0d12','--warn on --bg (the room code, the crew tag)'],
  ['#4cc27a','#0b0d12','--live on --bg (a cast vote)'],
  ['#e4483a','#0b0d12','--gone on --bg (out)']]) {
  const r = ratio(fg,bg);
  console.log(`  ${r.toFixed(2).padStart(6)}:1  ${what}${r<4.5?'   ← under §4\'s 4.5':''}`);
}

console.log('\nC · ANGULAR SIZE ON A 55" 1080p PANEL (1218 mm wide → 0.634 mm/px)');
const MM = 1218/1920;
const rows = [['.seat .nm  name',33],['.seat .claim  public claim',24],['.seat .tag  RUNNER/GUIDE',20],
  ['.dot  seat NUMBER (the non-colour channel)',20],['.phase  phase name',56],['footer',17],['.facts dd',26]];
console.log('  size(px)  item'.padEnd(46) + '  3 m      5 m      8 m   (arcmin cap height)');
for (const [what,px] of rows) {
  const mm = px*MM;
  const at = (d) => (2*Math.atan(mm/(2*d*1000))*180/Math.PI*60);
  console.log(`  ${String(px).padStart(3)}px  ${what.padEnd(40)} ${at(3).toFixed(1).padStart(5)}  ${at(5).toFixed(1).padStart(7)}  ${at(8).toFixed(1).padStart(7)}${at(8)<10?'   ← below 10\' legibility floor at 8 m':''}`);
}
console.log('  (5 arcmin = the 20/20 threshold for a whole glyph; comfortable reading wants ≥ 16 arcmin)');

console.log('\nD · HOW OFTEN THE WHOLE SCREEN CAN CHANGE (photosensitivity)');
// A runner standing in a doorway at 60 Hz, spaceAt flipping every frame.
{
  const g = roomGate(ROOM_SETTLE);
  let relights = 0;
  for (let i=0;i<60*90;i++){ const t=i/60; if (g(i%2?'gallery':'ballroom', t)) relights++; }
  console.log(`  doorway straddle, 90 s at 60 Hz, alternating every frame → ${relights} lightRig.snapTo relights`);
  const g2 = roomGate(ROOM_SETTLE);
  let r2 = 0;
  // worst case the gate allows: hold each room exactly ROOM_SETTLE then flip.
  for (let i=0;i<60*90;i++){ const t=i/60; const room = Math.floor(t/ROOM_SETTLE)%2 ? 'gallery':'ballroom'; if (g2(room,t)) r2++; }
  console.log(`  worst case the gate permits (flip every ${ROOM_SETTLE}s) → ${r2} relights in 90 s = ${(r2/90).toFixed(2)} Hz`);
  console.log(`  director MIN_HOLD ${MIN_HOLD}s → hard ceiling of ${(1/MIN_HOLD).toFixed(2)} cuts/s`);
  console.log('  WCAG 2.3.1 / Harding general-flash threshold: 3 Hz. Both are under it.');
  const n = rateGate(NOISE_GAP);
  let noises=0; for(let i=0;i<60*90;i++) if (n(i/60,true)) noises++;
  console.log(`  noise bus, a runner holding RUN for the whole 90 s → ${noises} events (was 926-5398)`);
}

console.log('\nE · NAMES AFTER THE ROSTER FREEZES');
{
  const { createLobby, seatJoin, seatDrop, freezeRoster, roster } = await import('../net/party/lobby.mjs');
  const lob = createLobby('x');
  const socks = [];
  for (let i=0;i<8;i++){ const s={write(){},destroyed:false}; socks.push(s); seatJoin(lob,{name:''},s); }
  // three people close the browser before the bell
  for (const i of [1,3,5]) seatDrop(lob, [...lob.seats.values()].find(s=>s.seat===i), socks[i]);
  const fr = freezeRoster(lob);
  console.log('  8 joined with the name box left empty, 3 closed the tab, then START:');
  console.log('  seat → the name the TV prints:');
  for (const r of roster(lob)) console.log(`    dot reads "${r.seat+1}"   name reads "${r.name}"   colour ${r.colour}${(r.seat+1)!==Number(r.name.split(' ')[1])?'   ← DISAGREE':''}`);
  // duplicate names
  const lob2 = createLobby('y');
  for (const n of ['Sam','Sam','Sam']) seatJoin(lob2,{name:n},{write(){},destroyed:false});
  console.log('  three guests all type "Sam":', roster(lob2).map(r=>`${r.name}/${r.colour}`).join('  '),
    '→ colour is the only discriminator, and no gate rejects it');
}
