/** _rc_facts — the sealed facts that exist and are shown to nobody. Probe. */
import { play } from './_rc_inv.mjs';
const N = Number(process.argv[2]||170);
const runs=[]; for(let i=0;i<N;i++) runs.push(play({castSeed:100+i*13,worldSeed:7+i*29}));
let taken=0, exe=0, sealedEv=0, games=0;
const outcomes=new Map(), rules=new Map();
for(const r of runs){games++;
  taken+=r.log.filter(e=>e.type==='player.taken').length;
  exe+=r.log.filter(e=>e.type==='player.executed').length;
  sealedEv+=r.log.filter(e=>e.type==='player.sealed').length;
  const o=r.s.state.outcome; outcomes.set(o,(outcomes.get(o)||0)+1);
  const w=r.log.filter(e=>e.type==='win.checked').pop(); rules.set(w.data.rule,(rules.get(w.data.rule)||0)+1);
}
console.log(`=== ${N} games ===`);
console.log('  deaths: taken', taken, '· executed', exe, '· player.sealed written', sealedEv, '(= taken+executed, read by nothing)');
console.log('  outcomes:', [...outcomes].map(([k,v])=>`${k} ${v}`).join(' · '));
console.log('  win rules:', [...rules].map(([k,v])=>`${k||'—'} ${v}`).join(' · '));

const r0=runs[0];
console.log('\n=== win.checked, all five, from ONE game — SEALED, and read only for `.rule` ===');
for (const e of r0.log.filter(e=>e.type==='win.checked')) console.log('   seq'+String(e.seq).padStart(4), JSON.stringify(e.data));
console.log('\n  `fed` is the FEED COUNT — round §4 names it the headline sealed fact:');
console.log('  "Evil\'s actual progress is the number of good players the Hunter has taken. The public');
console.log('   gauge is the hunter\'s stage... a deliberately lossy proxy." It is in the log, five times');
console.log('   a game, and the Reunion never reads it.');

console.log('\n=== the executioner: who swung, per game ===');
for (const e of r0.log.filter(e=>e.type==='player.executed')) console.log('  ', JSON.stringify(e.data));
let selfEvil=0, evilOnEvil=0, goodOnGood=0, tot=0;
for(const r of runs) for(const e of r.log.filter(e=>e.type==='player.executed')){
  const a=r.ctx.alignmentOf; tot++;
  if(a(e.data.executioner)==='evil'&&a(e.data.id)==='evil') evilOnEvil++;
  if(a(e.data.executioner)==='good'&&a(e.data.id)==='good') goodOnGood++;
}
console.log(`  ${tot} executions: ${evilOnEvil} evil-on-evil (Cold Blood), ${goodOnGood} good-on-good, rest crossed the line.`);
console.log('  the roll call shows WHO swung. It never shows that the room killed its own —');
console.log('  the single most quotable fact at the table, and one boolean away.');
