import { play, POLICIES } from './_mr8_full.mjs';
const WINGS = ['gallery','ballroom','study_w','study_e','service','chapel'];
const SEEDS = [1,2,3,5,7,11,13,17,19,23];
console.log('=== C. per-wing, per-detent, hunter ON, fixed steering, 10 seeds ===');
console.log('wing      policy    lit/held/taken   median-t(lit)   mean minSep   commits  breaches');
for (const w of WINGS) {
  for (const pn of ['CREEP','WALK','RUN','ladder']) {
    const rs = SEEDS.map((s) => play({ wing: w, seed: s, policy: POLICIES[pn] }));
    const n = (k) => rs.filter(r=>r.outcome===k).length;
    const lits = rs.filter(r=>r.outcome==='lit').map(r=>r.t).sort((a,b)=>a-b);
    const med = lits.length ? lits[Math.floor(lits.length/2)] : null;
    const sep = (rs.reduce((a,r)=>a+Math.min(r.minSep,99),0)/rs.length).toFixed(1);
    const com = rs.reduce((a,r)=>a+r.ev.commit,0), br = rs.reduce((a,r)=>a+r.ev.bang,0), th = rs.reduce((a,r)=>a+r.ev.through,0);
    console.log(`${w.padEnd(9)} ${pn.padEnd(8)} ${String(n('lit')).padStart(3)}/${String(n('held')).padStart(3)}/${String(n('taken')).padStart(3)}    ${String(med ?? '-').padStart(8)}s      ${sep.padStart(6)}       ${String(com).padStart(3)}      bang=${br} through=${th}`);
  }
}
