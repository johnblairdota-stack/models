import { play } from './_rc_inv.mjs';
import { reunion } from '../../src/party/reunion.js';
const r = play({castSeed:711, worldSeed:1370});
const nm=Object.fromEntries(r.s.state.players.map(p=>[p.id,p.name||p.id])); const N_=id=>nm[id]||id;
const R=reunion(r.log,r.ctx);
const D={'win.W1':'Production was cleared out','win.W2':'the crew lit the last camera','win.W3':'the feed had taken enough of them','win.W4':'Production drew level','win.W5':'the season ran out of episodes','last death':'the last death of the season'};
console.log('=== WHAT THE TELEVISION PRINTS TODAY, castSeed 711 ===\n');
console.log(r.s.state.outcome);
console.log('Episode '+R.decisive.episode+' decided it — '+(D[R.decisive.because]||'the episode that mattered')+'\n');
for(const a of R.awards) console.log('  '+a.award.padEnd(15)+N_(a.winner).padEnd(10)+a.why.toUpperCase());
console.log('');
for(const p of R.rollCall){let s='  '+N_(p.id).padEnd(10)+p.role.padEnd(16);
  if(p.believedTheyWere&&p.believedTheyWere!==p.role)s+='believed '+p.believedTheyWere+' ';
  s+=p.finalClaim?'claimed "'+p.finalClaim+'" ':'claimed nothing ';
  if(p.death)s+=p.death.by==='TAKEN'?'taken ':'evicted by '+N_(p.death.executioner)+' ';
  console.log(s+'  '+p.alignment.toUpperCase());}
console.log('\n  [chat, unmixed]: '+R.chat.length+' lines');
