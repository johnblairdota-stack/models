import { seededPick } from '../../src/party/ballot.js';
const N=200000;
// serial across episodes for a 2-cut and a 3-cut
for (const L of [['a','b'],['a','b','c'],['a','b','c','d']]) {
  for (const slot of ['runner','guide']) {
    const h=new Array(L.length).fill(0); let same=0;
    for(let s=1;s<=N;s++){
      const x=L.indexOf(seededPick(s,`cast:2:${slot}`,L));
      const y=L.indexOf(seededPick(s,`cast:3:${slot}`,L));
      h[x]++; if(x===y) same++;
    }
    console.log(`${slot} len=${L.length} marginal=${h.map(c=>(c/N*100).toFixed(2)+'%').join(' ')} ep-repeat=${(same/N*100).toFixed(2)}% ideal=${(100/L.length).toFixed(2)}%`);
  }
  // cross-slot agreement, same ep, same cut
  let agree=0;
  for(let s=1;s<=N;s++) if(seededPick(s,'cast:2:runner',L)===seededPick(s,'cast:2:guide',L)) agree++;
  console.log(`  cross-slot same-cut agreement len=${L.length}: ${(agree/N*100).toFixed(2)}% ideal ${(100/L.length).toFixed(2)}%`);
}
