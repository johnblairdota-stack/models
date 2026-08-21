/** _rc_u2 — is revealSet actually a general leak dictionary, or a role-shaped one? Probe. */
import { play } from './_rc_inv.mjs';
import { revealSet } from '../../src/party/reunion.js';
const r = play({castSeed:100,worldSeed:7});
const toks=[...revealSet(r.log,r.ctx)];
console.log('revealSet() today, in full:', JSON.stringify(toks));
console.log('  →', toks.length, 'tokens, every one a role name or the string good/evil.\n');
// U2's sweep, verbatim from reunion-truth.mjs:126
const sweep=(tok,stream)=>new RegExp(`"role"\\s*:\\s*"${tok}"|"alignment"\\s*:\\s*"${tok}"`).test(stream);
const tvStream=JSON.stringify(r.tape.get('tv')||[]);
console.log('If the guide ledger were added to the Reunion, revealSet would grow by room names');
console.log('and CLEAR/HOLD. Would U2 sweep for them?');
for(const tok of ['gallery','ballroom','CLEAR','HOLD']){
  const inStream=tvStream.includes('"'+tok+'"');
  console.log(`  "${tok}" is literally on the TV wire: ${String(inStream).padEnd(5)} · U2's regex finds it: ${sweep(tok,tvStream)}`);
}
console.log('\n→ U2 asks one question: "did a socket receive this token AS A role or alignment VALUE?"');
console.log('  A reveal that is not a role name is invisible to the sweep. The dictionary is general;');
console.log('  the LOOKUP is not. "a leak and a missing reveal are the same bug" holds for exactly');
console.log('  the one shape of reveal that exists today.');
