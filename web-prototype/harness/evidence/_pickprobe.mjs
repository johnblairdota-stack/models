// throwaway adversarial probe against session.js's pick()
const hash = (...parts) => {
  let h = 0x811c9dc5 >>> 0;
  const s = parts.join(':');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
};
const pick = (n, ...parts) => (hash(...parts) >>> 8) % n;
const old  = (n, ...parts) => hash(...parts) % n;

// realistic worldSeeds: what show.mjs actually produces
const seeds = [];
for (let i = 0; i < 20000; i++) seeds.push(hash('abcd', 'world', 1700000000000 + i * 1000, 8));
const EPS = [1,2,3,4,5];
const N = 6;
const pctf = (x) => (x*100).toFixed(2)+'%';

console.log('=== 1. marginal collision wing vs hunter, many salt pairs, n=6 (ideal 16.67%)');
const salts = ['hunter','target','prowler','it','lurker','den','wing','room','A','B','x','yy','zzz','monster','beast'];
for (const s of ['hunter','prowler','it','lurker','den','beast']) {
  let c = 0, co = 0, tot = 0;
  for (const w of seeds) for (const ep of EPS) {
    tot++;
    if (pick(N,w,'target',ep) === pick(N,w,s,ep)) c++;
    if (old(N,w,'target',ep) === old(N,w,s,ep)) co++;
  }
  console.log(`  target/${s.padEnd(8)} new ${pctf(c/tot)}   old ${pctf(co/tot)}`);
}

console.log('\n=== 2. all salt pairs from a pool, n=6: min/max collision rate');
let worst = null, best = null;
for (let i=0;i<salts.length;i++) for (let j=i+1;j<salts.length;j++) {
  let c=0,tot=0;
  for (const w of seeds.slice(0,4000)) for (const ep of EPS) { tot++; if (pick(N,w,salts[i],ep)===pick(N,w,salts[j],ep)) c++; }
  const r=c/tot;
  if(!worst||r>worst.r) worst={a:salts[i],b:salts[j],r};
  if(!best||r<best.r) best={a:salts[i],b:salts[j],r};
}
console.log(`  worst ${worst.a}/${worst.b} ${pctf(worst.r)} · best ${best.a}/${best.b} ${pctf(best.r)}  (ideal 16.67%)`);

console.log('\n=== 3. marginal uniformity of pick over moduli in use');
for (const n of [2,3,4,6,800]) {
  const cnt = new Array(n).fill(0); let tot=0;
  for (const w of seeds) for (const ep of EPS) { cnt[pick(n,w,'target',ep)]++; tot++; }
  const exp = tot/n;
  const chi = cnt.reduce((a,c)=>a+(c-exp)**2/exp,0);
  console.log(`  n=${String(n).padEnd(4)} chi2=${chi.toFixed(1)} df=${n-1}  ${n<=6?cnt.join(','):'min '+Math.min(...cnt)+' max '+Math.max(...cnt)}`);
}

console.log('\n=== 4. CONSECUTIVE EPISODES, same salt: P(room_ep == room_ep+1), ideal 16.67%');
for (const s of ['target','hunter','wall','throttle','prowl']) {
  for (const n of [6]) {
    let same=0,tot=0;
    for (const w of seeds) for (let ep=1; ep<EPS.length; ep++) { tot++; if (pick(n,w,s,ep)===pick(n,w,s,ep+1)) same++; }
    console.log(`  salt=${s.padEnd(9)} n=${n} P(repeat)= ${pctf(same/tot)}`);
  }
}

console.log('\n=== 4b. same, but under the OLD draw for reference');
for (const s of ['target','hunter']) {
  let same=0,tot=0;
  for (const w of seeds) for (let ep=1; ep<EPS.length; ep++) { tot++; if (old(6,w,s,ep)===old(6,w,s,ep+1)) same++; }
  console.log(`  salt=${s.padEnd(9)} old P(repeat)= ${pctf(same/tot)}`);
}

console.log('\n=== 5. distinctness of the 5 wings within one game (ideal: all-5-distinct = 6*5*4*3*2/6^5 = 9.26%)');
for (const s of ['target','hunter']) {
  let allDistinct=0, tot=0, hist={};
  for (const w of seeds) {
    const set = new Set(EPS.map(ep=>pick(6,w,s,ep)));
    hist[set.size]=(hist[set.size]||0)+1;
    if (set.size===5) allDistinct++; tot++;
  }
  console.log(`  salt=${s} distinct-count histogram ${JSON.stringify(hist)} · all distinct ${pctf(allDistinct/tot)}`);
}
// what true uniform gives
{
  let h={}; const rnd=()=>Math.floor(Math.random()*6);
  for(let i=0;i<20000;i++){const st=new Set(EPS.map(()=>rnd()));h[st.size]=(h[st.size]||0)+1;}
  console.log(`  TRUE-RANDOM reference histogram ${JSON.stringify(h)}`);
}

console.log('\n=== 6. correlation of `here` across consecutive episodes');
{
  let a=0,b=0,ab=0,tot=0;
  for (const w of seeds) for (let ep=1; ep<EPS.length; ep++) {
    const h1 = pick(6,w,'target',ep)===pick(6,w,'hunter',ep);
    const h2 = pick(6,w,'target',ep+1)===pick(6,w,'hunter',ep+1);
    tot++; if(h1)a++; if(h2)b++; if(h1&&h2)ab++;
  }
  console.log(`  P(here_n)=${pctf(a/tot)} P(here_n+1)=${pctf(b/tot)} P(both)=${pctf(ab/tot)} vs product ${pctf((a/tot)*(b/tot))}`);
}

console.log('\n=== 7. ADJACENT SEEDS (worldSeed, worldSeed+1) — does the draw move?');
{
  const lin = []; for (let i=1;i<=20000;i++) lin.push(i);
  for (const s of ['target','hunter']) {
    let same=0,tot=0;
    for (let i=0;i<lin.length-1;i++) { tot++; if (pick(6,lin[i],s,1)===pick(6,lin[i+1],s,1)) same++; }
    console.log(`  consecutive integer seeds, salt=${s}: P(same wing)=${pctf(same/tot)} (ideal 16.67%)`);
  }
  // and with realistic hashed seeds
  let same=0,tot=0;
  for (let i=0;i<seeds.length-1;i++){tot++; if(pick(6,seeds[i],'target',1)===pick(6,seeds[i+1],'target',1))same++;}
  console.log(`  realistic hashed seeds: P(same wing)=${pctf(same/tot)}`);
}

console.log('\n=== 8. wall distance parity and value distribution (%800)');
{
  let odd=0,tot=0; const buckets=new Array(8).fill(0);
  for (const w of seeds) for (const ep of EPS) { const v=pick(800,w,'wall',ep); if(v&1)odd++; buckets[Math.floor(v/100)]++; tot++; }
  console.log(`  odd ${pctf(odd/tot)} · deciles ${buckets.map(b=>(b/tot*100).toFixed(1)).join(' ')}`);
  let oldOdd=0; for (const w of seeds) for (const ep of EPS) if (old(800,w,'wall',ep)&1) oldOdd++;
  console.log(`  OLD odd ${pctf(oldOdd/tot)}`);
}

console.log('\n=== 9. throttle: pick(3) and pick(2) share one hash — joint distribution');
{
  const j={};
  for (const w of seeds) for (const ep of EPS){const a=pick(3,w,'throttle',ep),b=pick(2,w,'throttle',ep);j[a+'/'+b]=(j[a+'/'+b]||0)+1;}
  console.log('  ', JSON.stringify(j));
}
