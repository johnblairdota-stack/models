const hash = (...parts) => { let h=0x811c9dc5>>>0; const s=parts.join(':');
  for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0;} return h>>>0; };
const pick = (n,...p)=>(hash(...p)>>>8)%n;
const seeds=[]; for(let i=0;i<40000;i++) seeds.push(hash('abcd','world',1700000000000+i*1000,8));
const pctf=x=>(x*100).toFixed(2)+'%';

console.log('=== A. distribution of (wing_{ep+1} - wing_ep) mod 6, per transition (uniform = 16.67% each)');
for (let ep=1; ep<=4; ep++) {
  const d=new Array(6).fill(0);
  for(const w of seeds) d[((pick(6,w,'target',ep+1)-pick(6,w,'target',ep))%6+6)%6]++;
  console.log(`  ep${ep}->${ep+1}: `+d.map(x=>pctf(x/seeds.length)).join(' '));
}
console.log('=== A2. same for the SEALED hunter room');
for (let ep=1; ep<=4; ep++) {
  const d=new Array(6).fill(0);
  for(const w of seeds) d[((pick(6,w,'hunter',ep+1)-pick(6,w,'hunter',ep))%6+6)%6]++;
  console.log(`  ep${ep}->${ep+1}: `+d.map(x=>pctf(x/seeds.length)).join(' '));
}

console.log('\n=== B. predicting the NEXT wing from the two previous (public information)');
{
  // table: (w1,w2) -> distribution of w3
  const tab=new Map();
  for(const w of seeds){
    const a=pick(6,w,'target',1),b=pick(6,w,'target',2),c=pick(6,w,'target',3);
    const k=a+','+b; if(!tab.has(k))tab.set(k,new Array(6).fill(0)); tab.get(k)[c]++;
  }
  let hit=0,tot=0;
  for(const [,v] of tab){const s=v.reduce((x,y)=>x+y,0);hit+=Math.max(...v);tot+=s;}
  console.log(`  best-guess accuracy for ep3 given ep1,ep2 = ${pctf(hit/tot)} (chance 16.67%)`);
  // and from one previous only
  const t1=new Map();
  for(const w of seeds){const a=pick(6,w,'target',1),b=pick(6,w,'target',2);
    if(!t1.has(a))t1.set(a,new Array(6).fill(0)); t1.get(a)[b]++;}
  let h1=0,tt=0; for(const[,v]of t1){h1+=Math.max(...v);tt+=v.reduce((x,y)=>x+y,0);}
  console.log(`  best-guess accuracy for ep2 given ep1        = ${pctf(h1/tt)}`);
}

console.log('\n=== C. does the PUBLIC wing sequence leak the SEALED hunter room?');
{
  // Given full public wing sequence (w1..w5) as key, how well can you guess hunterRoom at ep1?
  const tab=new Map();
  for(const w of seeds){
    const key=[1,2,3,4,5].map(e=>pick(6,w,'target',e)).join('');
    if(!tab.has(key))tab.set(key,new Array(6).fill(0));
    tab.get(key)[pick(6,w,'hunter',1)]++;
  }
  let hit=0,tot=0,keys=0;
  for(const[,v]of tab){const s=v.reduce((x,y)=>x+y,0); if(s<20)continue; keys++; hit+=Math.max(...v); tot+=s;}
  console.log(`  guess hunterRoom@ep1 from the whole public wing sequence: ${pctf(hit/tot)} over ${keys} well-populated keys (chance 16.67%)`);
}

console.log('\n=== D. `here` conditional on last episode');
{
  for(let ep=1;ep<=4;ep++){
    let a=0,ab=0,nb=0,na=0;
    for(const w of seeds){
      const h1=pick(6,w,'target',ep)===pick(6,w,'hunter',ep);
      const h2=pick(6,w,'target',ep+1)===pick(6,w,'hunter',ep+1);
      if(h1){a++; if(h2)ab++;} else {na++; if(h2)nb++;}
    }
    console.log(`  ep${ep}: P(here_{n+1}|here_n)=${pctf(ab/a)}  P(here_{n+1}|!here_n)=${pctf(nb/na)}`);
  }
}

console.log('\n=== E. is the residual an artefact of trailing-digit episodes? test ep as 2-digit');
{
  let same=0,tot=0;
  for(const w of seeds) for(let ep=10;ep<14;ep++){tot++; if(pick(6,w,'target',ep)===pick(6,w,'target',ep+1))same++;}
  console.log(`  episodes 10..14: P(repeat)=${pctf(same/tot)}`);
  // salt-last ordering would fix it: hash(worldSeed, ep, salt)
  same=0;tot=0;
  for(const w of seeds) for(let ep=1;ep<5;ep++){tot++; if(pick(6,w,ep,'target')===pick(6,w,ep+1,'target'))same++;}
  console.log(`  key ordered (seed, ep, salt): P(repeat)=${pctf(same/tot)}`);
}
