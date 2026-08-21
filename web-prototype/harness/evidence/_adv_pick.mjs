// throwaway: can a pick() pass hunter-draw D9/D9b/D10/D11 and still be exploitable?
import { pick, hash } from '../../src/party/session.js';

const SEEDS = 80000;
const EPS = [1,2,3,4,5,6];
const DRAWS = [
  ['wing', 6, 'target', 6, v=>v],
  ['hunter', 6, 'hunter', 6, v=>v],
  ['prowl', 4, 'prowl', 4, v=>v],
  ['throttleGO', 3, 'throttle', 3, v=>v],
  ['throttle2', 2, 'throttle', 2, v=>v],
  ['wall', 800, 'wall', 8, v=>Math.floor(v/100)],
];
const tableFor = (pk) => DRAWS.map(([,n,salt])=>{
  const col = new Array(SEEDS+2);
  for (let w=1; w<=SEEDS+1; w++){ const row=new Array(EPS.length+1);
    for (const e of EPS) row[e]=pk(n,w,salt,e); col[w]=row; }
  return col;
});
const tvFromUniform = h => { const tot=h.reduce((a,b)=>a+b,0)||1, e=1/h.length;
  return h.reduce((a,c)=>a+Math.abs(c/tot-e),0)/2; };
function deltaTable(tab){
  const out=[];
  for(let d=0;d<DRAWS.length;d++){ const [label,,,m,bucket]=DRAWS[d];
    for(let i=0;i<EPS.length-1;i++){ const [a,b]=[EPS[i],EPS[i+1]];
      for(const axis of ['episode','worldSeed']){ const h=new Array(m).fill(0);
        for(let w=1;w<=SEEDS;w++){ const from=bucket(tab[d][w][a]);
          const to = axis==='episode'?bucket(tab[d][w][b]):bucket(tab[d][w+1][a]);
          h[(to-from+m)%m]++; }
        out.push({label,step:axis==='episode'?`ep${a}->${b}`:`seed+1@ep${a}`,axis,tv:tvFromUniform(h),min:Math.min(...h)/SEEDS,m});}}}
  return out;
}
function sealedFromPublic(tab){
  const [W,H]=[tab[0],tab[1]]; const TRAIN=Math.floor(SEEDS*0.6);
  const key=(w,e)=>`${e}|${W[w][e-2]}|${W[w][e-1]}|${W[w][e]}`;
  const learnt=new Map();
  for(let w=1;w<=TRAIN;w++) for(let e=3;e<=EPS.length;e++){ const k=key(w,e);
    let c=learnt.get(k); if(!c) learnt.set(k,c=new Array(6).fill(0)); c[H[w][e]]++; }
  let hit=0,tot=0;
  for(let w=TRAIN+1;w<=SEEDS;w++) for(let e=3;e<=EPS.length;e++){ const c=learnt.get(key(w,e));
    let best=0; if(c) for(let i=1;i<6;i++) if(c[i]>c[best]) best=i;
    if(best===H[w][e]) hit++; tot++; }
  return {rate:hit/tot,tot};
}
function wallStickiness(tab){
  const W=tab[5]; const NEAR=255; let same=0,tot=0,near=0,seen=0;
  for(let w=1;w<=SEEDS;w++){ for(const e of EPS){ if(W[w][e]<NEAR) near++; seen++; }
    for(let i=0;i<EPS.length-1;i++){ if((W[w][EPS[i]]<NEAR)===(W[w][EPS[i+1]]<NEAR)) same++; tot++; } }
  const p=near/seen; return {same:same/tot,indep:p*p+(1-p)*(1-p),p};
}
// ---- the exploit measure the gate does NOT make: lag-2 (and lag-k) predictability
function lagRepeat(tab, d, lag){
  let same=0,tot=0;
  for(let w=1;w<=SEEDS;w++) for(let i=0;i+lag<EPS.length;i++){
    if(tab[d][w][EPS[i]]===tab[d][w][EPS[i+lag]]) same++; tot++; }
  return same/tot;
}
// ---- and: knowing the hunter room at ep e, how well do you guess it at e+2?
function hunterFromOwnPast(tab){
  const H=tab[1]; const TRAIN=Math.floor(SEEDS*0.6);
  const key=(w,e)=>`${e}|${H[w][e-2]}`;
  const learnt=new Map();
  for(let w=1;w<=TRAIN;w++) for(let e=3;e<=EPS.length;e++){ const k=key(w,e);
    let c=learnt.get(k); if(!c) learnt.set(k,c=new Array(6).fill(0)); c[H[w][e]]++; }
  let hit=0,tot=0;
  for(let w=TRAIN+1;w<=SEEDS;w++) for(let e=3;e<=EPS.length;e++){ const c=learnt.get(key(w,e));
    let best=0; if(c) for(let i=1;i<6;i++) if(c[i]>c[best]) best=i;
    if(best===H[w][e]) hit++; tot++; }
  return {rate:hit/tot,tot};
}

const TV_MAX=0.02, PREDICT_MAX=1/6+0.02, STICK_MAX=0.02;
function judge(name, pk){
  const tab=tableFor(pk);
  const dt=deltaTable(tab);
  const worst=dt.reduce((a,b)=>b.tv>a.tv?b:a);
  const sixes=dt.filter(r=>r.m===6&&r.axis==='episode');
  const leanest=sixes.reduce((a,b)=>b.min<a.min?b:a);
  const sp=sealedFromPublic(tab); const wk=wallStickiness(tab);
  const D9  = worst.tv<=TV_MAX;
  const D9b = leanest.min>0.10;
  const D10 = sp.rate<=PREDICT_MAX;
  const D11 = Math.abs(wk.same-wk.indep)<=STICK_MAX;
  console.log(`\n### ${name}`);
  console.log(`  D9  ${D9?'PASS':'FAIL'}  worst tv ${worst.tv.toFixed(4)} @ ${worst.label} ${worst.step}`);
  console.log(`  D9b ${D9b?'PASS':'FAIL'}  rarest offset ${(leanest.min*100).toFixed(2)}%`);
  console.log(`  D10 ${D10?'PASS':'FAIL'}  sealed-from-public ${(sp.rate*100).toFixed(2)}% (band ${(PREDICT_MAX*100).toFixed(2)}%)`);
  console.log(`  D11 ${D11?'PASS':'FAIL'}  wall same ${(wk.same*100).toFixed(2)}% vs indep ${(wk.indep*100).toFixed(2)}%`);
  console.log(`  -- UNMEASURED --`);
  for (const [di,dn] of [[0,'wing'],[1,'hunter'],[5,'wall(cm)']]) {
    console.log(`     ${dn}: lag1 repeat ${(lagRepeat(tab,di,1)*100).toFixed(2)}%  lag2 ${(lagRepeat(tab,di,2)*100).toFixed(2)}%  lag3 ${(lagRepeat(tab,di,3)*100).toFixed(2)}%`);
  }
  const hp=hunterFromOwnPast(tab);
  console.log(`     hunter room at ep e predicted from hunter room at ep e-2: ${(hp.rate*100).toFixed(2)}% (chance 16.67%)`);
  return {D9,D9b,D10,D11};
}

// 1. shipped
judge('SHIPPED pick', pick);
// 2. shipped >>> 8 (the known-bad control)
judge('CONTROL (hash>>>8)%n', (n,...p)=>(hash(...p)>>>8)%n);
// 3. the attack: period-2 in the episode component
const evil2 = (n,...parts)=>{ const p=parts.slice(); const ep=Number(p[p.length-1]);
  p[p.length-1] = 'P'+(ep%2); return pick(n,...p); };
judge('ATTACK A: episode folded to parity (period 2)', evil2);
// 4. weaker: only lag-2 sticky with probability q, via a coin on the seed
const mk = (q)=> (n,...parts)=>{ const p=parts.slice(); const ep=Number(p[p.length-1]);
  // with prob q, episodes e and e-2 share a key; otherwise independent
  const coin = pick(1000, 'stick', p[0], p[p.length-2], ep%2) < q*1000;
  if (coin) { p[p.length-1]='P'+(ep%2); return pick(n,...p); }
  return pick(n,...parts); };
judge('ATTACK B: lag-2 repeat 50% of the time', mk(0.5));
