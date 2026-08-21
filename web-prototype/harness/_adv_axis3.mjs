// throwaway probe: the THIRD axis of pick() — cross-draw within one episode
import { pick, hash } from '../src/party/session.js';
import { seedFrom } from '../net/party/show.mjs';

const N = 400000;
const chi2 = (tab, ra, rb) => {
  let tot = 0; for (const r of tab) for (const v of r) tot += v;
  const rows = tab.map(r => r.reduce((a,b)=>a+b,0));
  const cols = tab[0].map((_,j)=>tab.reduce((a,r)=>a+r[j],0));
  let x = 0;
  for (let i=0;i<ra;i++) for (let j=0;j<rb;j++){
    const e = rows[i]*cols[j]/tot; if (e>0) x += (tab[i][j]-e)**2/e;
  }
  return { chi2: x, df: (ra-1)*(rb-1), norm: x/((ra-1)*(rb-1)) };
};
// Cramer's V
const cv = (x, tot, ra, rb) => Math.sqrt(x/(tot*Math.min(ra-1,rb-1)));

const SALTS = [['target',6],['hunter',6],['prowl',4],['throttleGO',3],['throttle2',2],['wall',8]];
const draw = (name, n, ws, ep) => {
  if (name==='throttleGO') return pick(3, ws, 'throttle', ep);
  if (name==='throttle2') return pick(2, ws, 'throttle', ep);
  if (name==='wall') return Math.floor(pick(800, ws, 'wall', ep)/100);
  return pick(n, ws, name, ep);
};

for (const [seedLabel, mkSeed] of [
  ['small ints 1..N', (i)=>i+1],
  ['seedFrom(code,world,stamp,8)', (i)=>seedFrom('ABCD','world',1755000000000+i*937,8)],
]) {
  console.log(`\n===== worldSeed source: ${seedLabel} =====`);
  for (let a=0;a<SALTS.length;a++) for (let b=a+1;b<SALTS.length;b++){
    const [na,ma]=SALTS[a], [nb,mb]=SALTS[b];
    const tab = Array.from({length:ma},()=>new Array(mb).fill(0));
    for (let i=0;i<N;i++){
      const ws = mkSeed(i); const ep = 1 + (i % 6);
      tab[draw(na,ma,ws,ep)][draw(nb,mb,ws,ep)]++;
    }
    const r = chi2(tab, ma, mb);
    const v = cv(r.chi2, N, ma, mb);
    const flag = r.chi2 > r.df + 5*Math.sqrt(2*r.df) ? '  <<< SIGNIFICANT' : '';
    console.log(`  ${na} x ${nb}: chi2=${r.chi2.toFixed(1)} df=${r.df} V=${v.toFixed(5)}${flag}`);
  }
}
