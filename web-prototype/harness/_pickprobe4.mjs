const hash=(...p)=>{let h=0x811c9dc5>>>0;const s=p.join(':');for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0;}return h>>>0;};
const pick=(n,...p)=>(hash(...p)>>>8)%n;
const pick2=(n,ws,salt,ep)=>(hash(ws,ep,salt)>>>8)%n;   // episode not last in the key
const pctf=x=>(x*100).toFixed(2)+'%';
const N=500000;
const mk=i=>hash('sd',i,'world');   // uniform 32-bit worldSeeds, as show.mjs produces

console.log('=== per-transition delta distribution, wing (n=6), '+N+' seeds each');
for(let ep=1;ep<=4;ep++){
  const d=new Array(6).fill(0);
  for(let i=0;i<N;i++){const ws=mk(i);d[(((pick(6,ws,'target',ep+1)-pick(6,ws,'target',ep))%6)+6)%6]++;}
  console.log(`  ep${ep}->${ep+1}  `+d.map((x,j)=>`Δ${j}:${pctf(x/N)}`).join('  '));
}
console.log('=== the same draw with the episode NOT last in the key (control for the root cause)');
for(let ep=1;ep<=4;ep++){
  const d=new Array(6).fill(0);
  for(let i=0;i<N;i++){const ws=mk(i);d[(((pick2(6,ws,'target',ep+1)-pick2(6,ws,'target',ep))%6)+6)%6]++;}
  console.log(`  ep${ep}->${ep+1}  `+d.map((x,j)=>`Δ${j}:${pctf(x/N)}`).join('  '));
}
console.log('\n=== leak control: (seed,ep,salt) ordering, held out');
{
  const NTR=400000,NTE=200000;
  const tr=new Map();
  for(let i=0;i<NTR;i++){const ws=mk(i);const key=[1,2,3,4,5].map(e=>pick2(6,ws,'target',e)).join('');
    if(!tr.has(key))tr.set(key,new Array(6).fill(0)); tr.get(key)[pick2(6,ws,'hunter',1)]++;}
  const g=new Map(); for(const[k,v]of tr){let b=0;for(let j=1;j<6;j++)if(v[j]>v[b])b=j;g.set(k,b);}
  let hit=0,tot=0;
  for(let i=NTR;i<NTR+NTE;i++){const ws=mk(i);const key=[1,2,3,4,5].map(e=>pick2(6,ws,'target',e)).join('');
    if(!g.has(key))continue;tot++;if(g.get(key)===pick2(6,ws,'hunter',1))hit++;}
  console.log(`  CONTROL (seed,ep,salt): ${pctf(hit/tot)} on ${tot} unseen games (chance 16.67%)`);
}
console.log('\n=== the same leak with the SHIPPED ordering, held out, for the record');
{
  const NTR=400000,NTE=200000;
  const tr=new Map();
  for(let i=0;i<NTR;i++){const ws=mk(i);const key=[1,2,3,4,5].map(e=>pick(6,ws,'target',e)).join('');
    if(!tr.has(key))tr.set(key,new Array(6).fill(0)); tr.get(key)[pick(6,ws,'hunter',1)]++;}
  const g=new Map(); for(const[k,v]of tr){let b=0;for(let j=1;j<6;j++)if(v[j]>v[b])b=j;g.set(k,b);}
  let hit=0,tot=0;
  for(let i=NTR;i<NTR+NTE;i++){const ws=mk(i);const key=[1,2,3,4,5].map(e=>pick(6,ws,'target',e)).join('');
    if(!g.has(key))continue;tot++;if(g.get(key)===pick(6,ws,'hunter',1))hit++;}
  console.log(`  SHIPPED (seed,salt,ep): ${pctf(hit/tot)} on ${tot} unseen games`);
}
console.log('\n=== here|here per transition, uniform seeds');
for(let ep=1;ep<=4;ep++){
  let a=0,ab=0,na=0,nb=0;
  for(let i=0;i<N;i++){const ws=mk(i);
    const h1=pick(6,ws,'target',ep)===pick(6,ws,'hunter',ep);
    const h2=pick(6,ws,'target',ep+1)===pick(6,ws,'hunter',ep+1);
    if(h1){a++;if(h2)ab++;}else{na++;if(h2)nb++;}}
  console.log(`  ep${ep}->${ep+1}: P(here'|here)=${pctf(ab/a)} n=${a} · P(here'|!here)=${pctf(nb/na)}`);
}
console.log('\n=== and the same numbers under the control ordering');
for(let ep=1;ep<=4;ep++){
  let a=0,ab=0,na=0,nb=0;
  for(let i=0;i<N;i++){const ws=mk(i);
    const h1=pick2(6,ws,'target',ep)===pick2(6,ws,'hunter',ep);
    const h2=pick2(6,ws,'target',ep+1)===pick2(6,ws,'hunter',ep+1);
    if(h1){a++;if(h2)ab++;}else{na++;if(h2)nb++;}}
  console.log(`  ep${ep}->${ep+1}: P(here'|here)=${pctf(ab/a)} · P(here'|!here)=${pctf(nb/na)}`);
}
