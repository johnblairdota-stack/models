/**
 * _jellie_crit — scratch. Design-critic experiments against the PURE rules in src/party/link.js.
 * Not a gate. Delete freely.
 */
import {
  freshLinks, requestLink, acceptLink, declineLink, unlink, linkBlock, linkedIds,
  whisperAudience, mergeName, LINK_REQUEST_MS,
} from '../src/party/link.js';

const line = (s) => console.log(s);
const IDS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
const NAMES = {
  p1: 'John', p2: 'Ellie', p3: 'Ozz', p4: 'Mara',
  p5: 'Bex', p6: 'Sam', p7: 'Ivy', p8: 'Zoe',
};
const opts = (living = IDS) => ({ living, beat: 'debrief', names: NAMES, now: 0 });

line('\n=== 1 · CAN ONE PLAYER FAN OUT REQUESTS TO EVERYBODY AT ONCE? ===');
{
  let L = freshLinks();
  for (const to of IDS.slice(1)) L = requestLink(L, 'p1', to, opts());
  line(`  p1 outgoing pending: ${L.pending.filter((r) => r.from === 'p1').length} of 7`);
  line(`  linkBlock(p1 -> p3) after already asking p2: ${linkBlock(L, 'p1', 'p3', opts()) ?? 'ALLOWED'}`);
  // now three of them accept, one after another
  let acc = 0;
  for (const to of ['p2', 'p3', 'p4']) {
    const before = L.pairs.length;
    L = acceptLink(L, 'p1', to, opts());
    if (L.pairs.length > before) acc++;
  }
  line(`  accepts that landed: ${acc} (pairs now ${L.pairs.length}: ${L.pairs.map((p) => p.name)})`);
  line(`  -> fan-out is a SERVER-legal move; only the phone sheet hides it.`);
}

line('\n=== 2 · PAIR-TO-DENY. Evil burns a strong good player s channel. ===');
{
  let L = freshLinks();
  L = requestLink(L, 'p8', 'p1', opts());          // evil p8 grabs the Camera Op p1 first
  L = acceptLink(L, 'p8', 'p1', opts());
  line(`  ${L.pairs[0].name} formed. p1 is now locked for the beat.`);
  line(`  p2 tries to reach p1: ${linkBlock(L, 'p2', 'p1', opts())}`);
  line(`  p1 can escape by tapping Disconnect, then must re-ask and wait ${LINK_REQUEST_MS / 1000}s.`);
  const L2 = unlink(L, 'p1');
  line(`  after p1 disconnects, pairs=${L2.pairs.length}. Cost to evil: one tap. Cost to p1: the whole exchange.`);
}

line('\n=== 3 · WHO IS LEFT OUT AT 8, AND HOW LOUD IS IT? ===');
{
  let L = freshLinks();
  const grabs = [['p1', 'p2'], ['p3', 'p4'], ['p5', 'p6']];
  for (const [a, b] of grabs) { L = requestLink(L, a, b, opts()); L = acceptLink(L, a, b, opts()); }
  const linked = linkedIds(L);
  const alone = IDS.filter((i) => !linked.has(i));
  line(`  pairs on the TV: ${L.pairs.map((p) => p.name).join(' · ')}`);
  line(`  unpaired: ${alone.map((i) => NAMES[i]).join(', ')} (${alone.length})`);
  // odd living count -> exactly one person can never pair
  for (const n of [5, 7]) {
    const living = IDS.slice(0, n);
    line(`  at ${n} living, max pairs = ${Math.floor(n / 2)}, guaranteed stranded = ${n % 2}`);
  }
}

line('\n=== 4 · REFUSAL: what does the room learn? ===');
{
  let L = freshLinks();
  L = requestLink(L, 'p1', 'p2', opts());
  line(`  pending public shape: ${JSON.stringify(L.pending)}`);
  L = declineLink(L, 'p1', 'p2');
  line(`  after decline: pending=${L.pending.length} pairs=${L.pairs.length}`);
  line(`  -> nothing survives a refusal. The room only ever sees the request while it stands.`);
  line(`  -> and a request that LAPSES is indistinguishable from one that was refused.`);
}

line('\n=== 5 · THE MERGE, over a real party name set ===');
{
  const roster = ['John', 'Ellie', 'Ozz', 'Mara', 'Bex', 'Sam', 'Ivy', 'Zoe',
    'Dave', 'Kat', 'Ash', 'Tom', 'Nina', 'Raj', 'Bo', 'Lu'];
  const out = [];
  for (let i = 0; i < roster.length; i++) {
    for (let j = 0; j < roster.length; j++) {
      if (i === j) continue;
      out.push(`${roster[i]}+${roster[j]}=${mergeName(roster[i], roster[j])}`);
    }
  }
  line(`  ${out.length} merges. A sample:`);
  for (let k = 0; k < out.length; k += 37) line(`    ${out[k]}`);
  // how many are "boring" — a bare 2-letter initial fallback, or a head-join
  const short = out.filter((s) => s.split('=')[1].length <= 3);
  line(`  merges 3 chars or shorter: ${short.length}/${out.length} -> ${short.slice(0, 12).join(' ')}`);
}

line('\n=== 6 · SERIAL PAIRING inside one beat: how many people can p1 talk to? ===');
{
  let L = freshLinks();
  let partners = 0;
  for (const to of ['p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8']) {
    L = requestLink(L, 'p1', to, opts());
    L = acceptLink(L, 'p1', to, opts());
    if (whisperAudience(L, 'p1').length === 2) partners++;
    L = unlink(L, 'p1');            // p1 taps Disconnect and moves on
  }
  line(`  p1 held ${partners} separate private channels in one Debrief, serially.`);
  line(`  -> "one link at a time" is not "one link per beat". A 5-minute Debrief is ~7 slots.`);
}
