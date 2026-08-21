/** _rc_screen — what the television ACTUALLY prints at the Reunion. Probe. */
import { play } from './_rc_inv.mjs';
import { reunion } from '../../src/party/reunion.js';
const r = play({ castSeed: 100, worldSeed: 7 });
const R = reunion(r.log, r.ctx);
const names = Object.fromEntries(r.s.state.players.map((p)=>[p.id, p.name || p.id]));
const nameOf = (id)=> names[id] || '—';
const DECIDED_BY = {'win.W1':'Production was cleared out','win.W2':'the crew lit the last camera','win.W3':'the feed had taken enough of them','win.W4':'Production drew level','win.W5':'the season ran out of episodes','win.W6':'the host called time','last death':'the last death of the season'};
console.log('┌──────────────────────────────────────────────────────────────────────────────');
console.log('│ THE REUNION   (as show-tv.html renders it, verbatim text)');
console.log('├──────────────────────────────────────────────────────────────────────────────');
console.log('│ ' + (r.s.state.outcome || 'The Reunion'));
const d = R.decisive;
if (d) console.log('│ Episode ' + d.episode + ' decided it — ' + (DECIDED_BY[d.because] || 'the episode that mattered'));
console.log('│');
for (const a of R.awards) console.log('│ [AWARD] ' + a.award.padEnd(15) + nameOf(a.winner).padEnd(10) + ' ' + a.why.toUpperCase());
console.log('│');
for (const p of R.rollCall) {
  let s = '│ ' + nameOf(p.id).padEnd(10) + p.role.padEnd(16);
  if (p.believedTheyWere && p.believedTheyWere !== p.role) s += 'believed ' + p.believedTheyWere + ' ';
  s += p.finalClaim ? 'claimed "'+p.finalClaim+'" ' : 'claimed nothing ';
  if (p.death) s += (p.death.by === 'TAKEN' ? 'taken ' : 'evicted by ' + nameOf(p.death.executioner) + ' ');
  s += '  ' + p.alignment.toUpperCase();
  console.log(s);
}
console.log('│');
console.log('│ [BEAT 4 — the chat, unmixed]: ' + R.chat.length + ' lines');
console.log('└──────────────────────────────────────────────────────────────────────────────');
console.log('\nfull payload byte size:', JSON.stringify(R).length);
console.log('roll-call keys:', Object.keys(R.rollCall[0]).join(', '));
console.log('decisive:', JSON.stringify(R.decisive));
