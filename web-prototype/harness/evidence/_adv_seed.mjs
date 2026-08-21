import { seedFrom } from '../../net/party/show.mjs';
import { pick } from '../../src/party/session.js';
// 1. structure of seedFrom outputs across realistic stamps
const code='QZRT';
const seeds=[];
for(let i=0;i<200000;i++) seeds.push(seedFrom(code,'world',1755000000000+i,8));
// bit uniformity
const bits=new Array(32).fill(0);
for(const s of seeds) for(let b=0;b<32;b++) if((s>>>b)&1) bits[b]++;
console.log('seedFrom bit-1 frequency (should be ~0.5):');
console.log(bits.map((c,b)=>`b${b}:${(c/seeds.length).toFixed(3)}`).join(' '));
// distinctness
console.log('distinct seeds:', new Set(seeds).size, 'of', seeds.length);
// 2. castSeed vs worldSeed bit0 relation
let opp=0;
for(let i=0;i<20000;i++){const st=1755000000000+i*13;
  const c=seedFrom(code,'cast',st,8), w=seedFrom(code,'world',st,8);
  if(((c^w)&1)===1) opp++;}
console.log('castSeed/worldSeed differ in bit0:', opp, '/20000');
// 3. count axis: same code+stamp, vary count 5..8 -> are wings independent?
console.log('\nwing across player counts, same code+stamp (ep1):');
const tab=Array.from({length:6},()=>new Array(6).fill(0));
for(let i=0;i<200000;i++){const st=1755000000000+i*7;
  const w7=seedFrom(code,'world',st,7), w8=seedFrom(code,'world',st,8);
  tab[pick(6,w7,'target',1)][pick(6,w8,'target',1)]++;}
let tot=0;for(const r of tab)for(const v of r)tot+=v;
let x=0;const rs=tab.map(r=>r.reduce((a,b)=>a+b,0)),cs=tab[0].map((_,j)=>tab.reduce((a,r)=>a+r[j],0));
for(let i=0;i<6;i++)for(let j=0;j<6;j++){const e=rs[i]*cs[j]/tot;x+=(tab[i][j]-e)**2/e;}
console.log('chi2(count7 vs count8 wing)=',x.toFixed(1),'df=25');
