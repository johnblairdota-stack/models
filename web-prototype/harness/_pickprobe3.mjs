const hash=(...p)=>{let h=0x811c9dc5>>>0;const s=p.join(':');for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0;}return h>>>0;};
const pick=(n,...p)=>(hash(...p)>>>8)%n;
const pctf=x=>(x*100).toFixed(2)+'%';

console.log('=== HARD CLAIM 1: (wing_{ep+1}-wing_ep) mod 6 is never 3');
{
  let n=0,three=0;
  for(let ws=0;ws<300000;ws++) for(let ep=1;ep<=4;ep++){
    n++; if((((pick(6,ws,'target',ep+1)-pick(6,ws,'target',ep))%6)+6)%6===3) three++;
  }
  console.log(`  raw integer seeds 0..299999: ${three} of ${n} transitions had delta 3`);
  // realistic hashed seeds
  n=0;three=0;
  for(let i=0;i<200000;i++){const ws=hash('zq',i,'world');for(let ep=1;ep<=4;ep++){n++;
    if((((pick(6,ws,'target',ep+1)-pick(6,ws,'target',ep))%6)+6)%6===3)three++;}}
  console.log(`  hashed seeds: ${three} of ${n}`);
}

console.log('\n=== HARD CLAIM 2: also true for the sealed hunter room, and for arbitrary salts');
for(const salt of ['hunter','target','wall','prowl','throttle','zzz','q']){
  let three=0,n=0;
  for(let i=0;i<100000;i++){const ws=hash('zq',i,'world');for(let ep=1;ep<=4;ep++){n++;
    if((((pick(6,ws,salt,ep+1)-pick(6,ws,salt,ep))%6)+6)%6===3)three++;}}
  console.log(`  salt=${salt.padEnd(9)} delta==3 in ${three}/${n}`);
}

console.log('\n=== HARD CLAIM 3: leak of the SEALED hunter room from the PUBLIC wing sequence (train/test holdout)');
{
  const mk=i=>hash('lk',i,'world');
  const train=new Map(); const NTR=400000, NTE=200000;
  for(let i=0;i<NTR;i++){const ws=mk(i);
    const key=[1,2,3,4,5].map(e=>pick(6,ws,'target',e)).join('');
    if(!train.has(key))train.set(key,new Array(6).fill(0));
    train.get(key)[pick(6,ws,'hunter',1)]++;}
  const guess=new Map();
  for(const[k,v]of train){let b=0;for(let j=1;j<6;j++)if(v[j]>v[b])b=j;guess.set(k,b);}
  let hit=0,tot=0,miss=0;
  for(let i=NTR;i<NTR+NTE;i++){const ws=mk(i);
    const key=[1,2,3,4,5].map(e=>pick(6,ws,'target',e)).join('');
    if(!guess.has(key)){miss++;continue;}
    tot++; if(guess.get(key)===pick(6,ws,'hunter',1))hit++;}
  console.log(`  HELD-OUT accuracy guessing sealed hunterRoom@ep1 from public wings: ${pctf(hit/tot)} on ${tot} unseen games (chance 16.67%), ${miss} keys unseen in training`);

  // control: same estimator, but with a properly-mixed draw (episode not last in the key)
  const tr2=new Map();
  const pick2=(n,ws,salt,ep)=>(hash(ws,ep,salt)>>>8)%n;
  for(let i=0;i<NTR;i++){const ws=mk(i);
    const key=[1,2,3,4,5].map(e=>pick2(6,ws,'target',e)).join('');
    if(!tr2.has(key))tr2.set(key,new Array(6).fill(0));
    tr2.get(key)[pick2(6,ws,'hunter',1)]++;}
  const g2=new Map(); for(const[k,v]of tr2){let b=0;for(let j=1;j<6;j++)if(v[j]>v[b])b=j;g2.set(k,b);}
  let h2=0,t2=0;
  for(let i=NTR;i<NTR+NTE;i++){const ws=mk(i);
    const key=[1,2,3,4,5].map(e=>pick2(6,ws,'target',e)).join('');
    if(!g2.has(key))continue; t2++; if(g2.get(k=key)===pick2(6,ws,'hunter',1))h2++;}
  console.log(`  CONTROL, key ordered (seed,ep,salt): ${pctf(h2/t2)} on ${t2} unseen games`);
}

console.log('\n=== HARD CLAIM 4: P(here at ep4 | here at ep3), held out, realistic seeds');
{
  let a=0,ab=0,na=0,nb=0;
  for(let i=0;i<400000;i++){const ws=hash('pl',i,'world');
    const h3=pick(6,ws,'target',3)===pick(6,ws,'hunter',3);
    const h4=pick(6,ws,'target',4)===pick(6,ws,'hunter',4);
    if(h3){a++;if(h4)ab++;}else{na++;if(h4)nb++;}}
  console.log(`  P(here@4 | here@3)  = ${pctf(ab/a)}   (n=${a})`);
  console.log(`  P(here@4 | !here@3) = ${pctf(nb/na)}  (n=${na})`);
}
