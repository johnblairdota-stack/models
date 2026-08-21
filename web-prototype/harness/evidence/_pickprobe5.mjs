const hash=(...p)=>{let h=0x811c9dc5>>>0;const s=p.join(':');for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0;}return h>>>0;};
const pick=(n,...p)=>(hash(...p)>>>8)%n;
// a proper avalanche finalizer on top of the SAME FNV and the SAME key order
const mix=(h)=>{h=Math.imul(h^(h>>>16),0x85ebca6b)>>>0;h=Math.imul(h^(h>>>13),0xc2b2ae35)>>>0;return (h^(h>>>16))>>>0;};
const pickFix=(n,...p)=>mix(hash(...p))%n;
const pctf=x=>(x*100).toFixed(2)+'%';
const mk=i=>hash('sd',i,'world');
const N=1000000;

console.log('=== literal counts of each delta, wing, ep2->3 and ep4->5, N='+N);
for(const ep of [2,4]){
  const d=new Array(6).fill(0);
  for(let i=0;i<N;i++){const ws=mk(i);d[(((pick(6,ws,'target',ep+1)-pick(6,ws,'target',ep))%6)+6)%6]++;}
  console.log(`  ep${ep}->${ep+1} counts: ${d.join(' ')}   (uniform would be ${N/6} each)`);
}
console.log('\n=== with a murmur3 finalizer applied to the same FNV, same key order');
for(const ep of [1,2,3,4]){
  const d=new Array(6).fill(0);
  for(let i=0;i<N/4;i++){const ws=mk(i);d[(((pickFix(6,ws,'target',ep+1)-pickFix(6,ws,'target',ep))%6)+6)%6]++;}
  console.log(`  ep${ep}->${ep+1}  `+d.map(x=>pctf(x/(N/4))).join(' '));
}
console.log('\n=== here|here with the finalizer');
for(let ep=1;ep<=4;ep++){
  let a=0,ab=0,na=0,nb=0;
  for(let i=0;i<N/2;i++){const ws=mk(i);
    const h1=pickFix(6,ws,'target',ep)===pickFix(6,ws,'hunter',ep);
    const h2=pickFix(6,ws,'target',ep+1)===pickFix(6,ws,'hunter',ep+1);
    if(h1){a++;if(h2)ab++;}else{na++;if(h2)nb++;}}
  console.log(`  ep${ep}->${ep+1}: P(here'|here)=${pctf(ab/a)} · P(here'|!here)=${pctf(nb/na)}`);
}
console.log('\n=== sealed-room leak with the finalizer, held out');
{
  const NTR=400000,NTE=200000; const tr=new Map();
  for(let i=0;i<NTR;i++){const ws=mk(i);const key=[1,2,3,4,5].map(e=>pickFix(6,ws,'target',e)).join('');
    if(!tr.has(key))tr.set(key,new Array(6).fill(0)); tr.get(key)[pickFix(6,ws,'hunter',1)]++;}
  const g=new Map(); for(const[k,v]of tr){let b=0;for(let j=1;j<6;j++)if(v[j]>v[b])b=j;g.set(k,b);}
  let hit=0,tot=0;
  for(let i=NTR;i<NTR+NTE;i++){const ws=mk(i);const key=[1,2,3,4,5].map(e=>pickFix(6,ws,'target',e)).join('');
    if(!g.has(key))continue;tot++;if(g.get(key)===pickFix(6,ws,'hunter',1))hit++;}
  console.log(`  FINALIZER: ${pctf(hit/tot)} on ${tot} unseen games (chance 16.67%; shipped was 32.4%)`);
}
console.log('\n=== would hunter-draw D1 (10%-25% band) go red on ANY of these? ');
for(const [nm,f] of [['shipped',pick],['finalizer',pickFix]]){
  let c=0,tot=0;
  for(let i=0;i<200000;i++){const ws=mk(i);for(let ep=1;ep<=5;ep++){tot++;if(f(6,ws,'target',ep)===f(6,ws,'hunter',ep))c++;}}
  console.log(`  ${nm}: marginal collision ${pctf(c/tot)} — D1 band is 10..25%, so D1 is green either way`);
}
