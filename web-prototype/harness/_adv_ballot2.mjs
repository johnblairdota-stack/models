import { tallyCasting, seededPick } from '../src/party/ballot.js';
// how often does the seeded tiebreak fire, with realistic "everyone votes for someone" ballots?
const ids=(n)=>Array.from({length:n},(_,i)=>`p${i+1}`);
let seeded=0, tot=0;
const living=ids(8);
for(let seed=1;seed<=20000;seed++){
  const history=Object.fromEntries(living.map(id=>[id,{expeditions:0,lastEp:null}]));
  // ep1: every player names the next player round-robin => everyone gets exactly 1 vote => 8-way tie
  const ballots=living.map((v,i)=>({voter:v,runner:living[(i+1)%8],guide:living[(i+2)%8]}));
  const r=tallyCasting({ballots,living,history,lastPair:{runner:null,guide:null},ep:1,matchSeed:seed});
  tot++; if(r.tiebreaks.some(x=>x.includes('seeded'))) seeded++;
}
console.log(`round-robin ep1 8-way tie: seeded tiebreak fired ${seeded}/${tot}`);
// even-length cut: how the index behaves across episodes
for(const L of [2,4,6,8]){
  const list=ids(L); let never=0;
  for(let s=1;s<=100000;s++){
    const a=list.indexOf(seededPick(s,`cast:1:runner`,list));
    const b=list.indexOf(seededPick(s,`cast:2:runner`,list));
    if(a===b) never++;
  }
  console.log(`cut length ${L}: ep1->ep2 repeat ${(never/1000).toFixed(2)}% (ideal ${(100/L).toFixed(2)}%)`);
}
// and: does index parity strictly alternate?
const list=ids(8); let flips=0;
for(let s=1;s<=100000;s++){
  const a=list.indexOf(seededPick(s,`cast:4:runner`,list))%2;
  const b=list.indexOf(seededPick(s,`cast:5:runner`,list))%2;
  if(a!==b) flips++;
}
console.log(`len 8 ep4->ep5 seat-parity flips: ${(flips/1000).toFixed(2)}% (ideal 50%)`);
