import { createSession, CALL, MOVE_CHOICE } from '../src/party/session.js';
import { project, entitled, audienceFor, ownerOf } from '../net/party/entitle.js';
import { PHASE } from '../src/party/phases.js';

const paths = (o, pre='', out=[]) => {
  if (o === null || typeof o !== 'object') { out.push(pre); return out; }
  if (Array.isArray(o)) { if (!o.length) { out.push(pre+'[]'); return out; } for (const v of o) paths(v, pre+'[]', out); return out; }
  const ks = Object.keys(o); if (!ks.length) { out.push(pre); return out; }
  for (const k of ks) paths(o[k], pre ? `${pre}.${k}` : k, out); return out;
};
const ctxOf = (k) => ({ playerId: k.playerId, alignment: k.alignment, isTV: k.isTV, seatRole: k.seatRole });

const s = createSession({ count: 8, castSeed: 5, worldSeed: 35, send: () => {} });
let now = 0; s.start(now);
const byPhase = new Map();
for (let i = 0; i < 400 && s.state.phase !== PHASE.REUNION; i++) {
  if (!byPhase.has(s.state.phase)) byPhase.set(s.state.phase, s.sockets.map(k => ({ k, full: s.unprojected(k.id) })));
  const alive = s.state.players.filter(p => p.alive).map(p => p.id);
  switch (s.state.phase) {
    case PHASE.CASTING: for (let j = 0; j < alive.length; j++) s.input(alive[j], { t:'cast', runner: alive[(j+1)%alive.length], guide: alive[(j+2)%alive.length] }); break;
    case PHASE.EXPEDITION: s.input(s.state.pair.guide, { t:'call', call: CALL.CLEAR }); s.input(s.state.pair.runner, { t:'move', move: MOVE_CHOICE.GO }); break;
    case PHASE.RECKONING: if (!s.state.nominations.length) s.input(alive[0], { t:'nominate', target: alive[1] }); break;
    case PHASE.VOTE: for (const id of alive) s.input(id, { t:'vote', choice: alive[1] }); break;
    default: break;
  }
  now += 5000; s.tick(now);
}
const dead = s.state.players.filter(p => !p.alive).map(p => p.id);
console.log('dead by the end:', dead.join(',') || 'none');

let bad = [];
for (const [ph, panels] of byPhase) {
  const phones = panels.filter(x => !x.k.isTV);
  const tv = panels.find(x => x.k.isTV);
  // 1. TV frame carries no `you`
  if (tv && tv.full.you !== undefined) bad.push(`${ph}: TV frame has you`);
  // 2. every phone's you.id is its own
  for (const p of phones) {
    if (!p.full.you) { bad.push(`${ph}: ${p.k.playerId} has NO you panel`); continue; }
    if (p.full.you.id !== p.k.playerId) bad.push(`${ph}: ${p.k.playerId} panel owned by ${p.full.you.id}`);
  }
  // 3. mutations of the frame — id absent / null / another player's / you as array / you as string
  const me = phones[0], them = phones.find(x => x.k.alignment !== me.k.alignment) || phones[1];
  const evilPair = phones.filter(x => x.k.alignment === 'evil');
  const variants = [
    ['you.id DELETED', (f) => { const y = { ...f.you }; delete y.id; return { ...f, you: y }; }],
    ['you.id = null', (f) => ({ ...f, you: { ...f.you, id: null } })],
    ['you.id = another player', (f) => ({ ...f, you: { ...f.you, id: them.k.playerId } })],
    ['whole panel spliced from another player', (f) => ({ ...f, you: them.full.you })],
    ['you = []', (f) => ({ ...f, you: [] })],
    ['you = "p3"', (f) => ({ ...f, you: 'p3' })],
    ['you.id = 0 (falsy)', (f) => ({ ...f, you: { ...f.you, id: 0 } })],
  ];
  for (const [label, mut] of variants) {
    const out = project(mut(me.full), ctxOf(me.k));
    const kept = out.frame.you ? paths(out.frame.you).map(x => 'you.' + x) : [];
    const selfKept = kept.filter(x => audienceFor(x) === 'self');
    const evilKept = kept.filter(x => audienceFor(x) === 'evil');
    if (selfKept.length || evilKept.length) {
      console.log(`  ${ph} · ${label.padEnd(42)} kept self[${selfKept.join(',')}] evil[${evilKept.join(',')}] unrowed=${out.unrowed.join(',')}`);
    }
  }
  // 4. an evil phone handed ANOTHER evil phone's panel — the declared exception
  if (evilPair.length >= 2) {
    const [a, b] = evilPair;
    const out = project({ ...a.full, you: b.full.you }, ctxOf(a.k)).frame;
    const kept = out.you ? paths(out.you).map(x => 'you.' + x) : [];
    if (kept.length) console.log(`  ${ph} · evil<-evil splice kept ${kept.join(', ')}`);
  }
  // 5. a GOOD phone handed an evil panel
  const good = phones.find(x => x.k.alignment !== 'evil');
  if (good && evilPair.length) {
    const out = project({ ...good.full, you: evilPair[0].full.you }, ctxOf(good.k)).frame;
    const kept = out.you ? paths(out.you).map(x => 'you.' + x) : [];
    if (kept.length) console.log(`  ${ph} · good<-evil splice kept ${kept.join(', ')}`);
  }
  // 6. the TV handed a phone's panel
  if (tv) {
    const out = project({ ...tv.full, you: phones[0].full.you }, ctxOf(tv.k)).frame;
    const kept = out.you ? paths(out.you).map(x => 'you.' + x) : [];
    if (kept.length) console.log(`  ${ph} · TV<-phone splice kept ${kept.join(', ')}`);
  }
}
console.log('\nstructural failures:', bad.length ? bad.join(' | ') : 'none');

// 7. a dead player's own frame after execution
{
  const panels = s.sockets.map(k => ({ k, full: s.unprojected(k.id) }));
  for (const p of panels.filter(x => !x.k.isTV)) {
    const alivep = s.state.players.find(q => q.id === p.k.playerId);
    const out = project(p.full, ctxOf(p.k)).frame;
    if (!out.you) console.log(`  FINAL: ${p.k.playerId} (alive=${alivep.alive}) lost its panel entirely`);
  }
  console.log('final phase:', s.state.phase, '· unrowed seen this session:', JSON.stringify(s.state.unrowed ?? null));
}
