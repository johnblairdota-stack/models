#!/usr/bin/env node
/**
 * 🔎 PROBE — THE MANSION IS BRIEFED AND THE MANSION IS NOT LISTENING.
 *
 * `show-wire` X10 asserts the brief is SENT and pins its exact key set. Nothing on this project
 * asserts that anything READS it. This drives the real `startShow` server over real sockets,
 * collects every message the server actually sends the `role=sim` connection, and then runs the
 * SHIPPED consumer — the literal bytes of `sock.onmessage` lifted out of `src/views/expedition.js`
 * — over that stream.
 */
import { readFileSync } from 'node:fs';
import { startShow } from '../../net/party/show.mjs';
import { PHASE } from '../../src/party/phases.js';

const PORT = 5311;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function open(q = '') {
  return new Promise((res) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/${q}`);
    const msgs = [];
    const box = { ws, msgs, send: (o) => ws.send(JSON.stringify(o)), close: () => { try { ws.close(); } catch {} } };
    ws.onmessage = (e) => msgs.push(JSON.parse(e.data));
    ws.onopen = () => res(box);
    setTimeout(() => res(box), 1500);
  });
}

// ---------------------------------------------------------------- 1. the shipped consumer
const VIEW = readFileSync(new URL('../../src/views/expedition.js', import.meta.url), 'utf8');
const m = VIEW.match(/sock\.onmessage = \(e\) => \{([\s\S]*?)\n {4}\};/);
if (!m) { console.log('could not lift sock.onmessage out of views/expedition.js'); process.exit(1); }
const HANDLER_BODY = m[1];
console.log('=== src/views/expedition.js — the sim client\'s ENTIRE message handler, verbatim ===');
console.log(HANDLER_BODY.split('\n').filter((l) => /m\.t ===/.test(l)).map((l) => '   ' + l.trim()).join('\n'));
const handled = [...HANDLER_BODY.matchAll(/m\.t === '([a-z]+)'/g)].map((x) => x[1]);
console.log('\nmessage types the shipped mansion handles:', JSON.stringify([...new Set(handled)]));

// Run the real handler bytes. Only `heading`, `detent`, `DETENT`, `camerasUnlocked` are in scope.
const DETENT = [{}, {}, {}, {}];
const runHandler = new Function('e', 'state', `
  const { DETENT } = state;
  let heading = state.heading, detent = state.detent, camerasUnlocked = state.camerasUnlocked;
  ${HANDLER_BODY}
  return { heading, detent, camerasUnlocked };
`);

// ---------------------------------------------------------------- 2. the real server
const srv = startShow({ port: PORT, code: 'prob', stamp: 1700000000009 });
await sleep(120);
const tv = await open('?role=tv');
const phones = [];
for (let i = 0; i < 5; i++) { const p = await open(); p.send({ t: 'join', name: `R${i}`, token: null, boot: 400 }); phones.push(p); }
await sleep(200);
const sim = await open('?role=sim');
await sleep(120);
tv.send({ t: 'start' });
await sleep(250);

// Play four episodes by skipping phases, so the server briefs a fresh wing each time.
const sess = srv.sessionNow();
const serverWings = [];
for (let i = 0; i < 40 && sess.state.phase !== PHASE.REUNION; i++) {
  if (sess.state.phase === PHASE.EXPEDITION) serverWings.push([sess.state.episode, sess.state.expedition.room, sess.state.cameras.unlocked]);
  sess.skip(Date.now());
  await sleep(90);
}
await sleep(200);

// ---------------------------------------------------------------- 3. what the mansion was sent
const toSim = sim.msgs;
console.log('\n=== every message the SERVER sent the role=sim socket over a whole show ===');
console.log('types:', JSON.stringify([...new Set(toSim.map((x) => x.t))]));
for (const b of toSim.filter((x) => x.t === 'brief')) console.log('   brief →', JSON.stringify(b));

console.log('\n=== the server\'s own view of each episode ===');
for (const [ep, wing, cams] of serverWings) console.log(`   ep${ep}: wing=${wing} camerasUnlocked=${cams}`);

// ---------------------------------------------------------------- 4. feed them to the real handler
// The view's startup values (src/views/expedition.js:178, :190) when no query string is given.
let st = { DETENT, heading: 0, detent: 0, camerasUnlocked: Math.max(1, +(null ?? 1)) };
const startWing = 'gallery';   // views/expedition.js:190 — `qs.get('wing') ... : 'gallery'`
for (const msg of toSim) st = { ...st, ...runHandler({ data: JSON.stringify(msg) }, st) };

console.log('\n=== after replaying the WHOLE server→sim stream through the shipped handler ===');
console.log('   mansion wing            :', startWing, '(views/expedition.js:190 — `const wing`, bound once from the URL, never reassigned)');
console.log('   mansion camerasUnlocked :', st.camerasUnlocked, '(started at 1)');
console.log('\n   server briefed wings    :', toSim.filter((x) => x.t === 'brief').map((b) => b.wing).join(', '));
console.log('   server briefed cameras  :', toSim.filter((x) => x.t === 'brief').map((b) => b.cameras).join(', '));

const wingAgree = toSim.filter((x) => x.t === 'brief').every((b) => b.wing === startWing);
console.log(`\n   >>> DIVERGENCE: ${wingAgree ? 'none this run' : 'the house is in "' + startWing + '" while the show is in ' + [...new Set(toSim.filter((x)=>x.t==='brief').map((b)=>b.wing))].join('/')}`);
console.log(`   >>> the handler's only live-update branch is \`m.t === 'cams'\`; the server sent ${toSim.filter((x) => x.t === 'cams').length} such messages.`);
console.log(`   >>> the brief's camera field is named \`cameras\`; the handler reads \`m.unlocked\`.`);

// ---------------------------------------------------------------- 5. and the server ignores the house's room
console.log('\n=== the other end of the same seam ===');
console.log('   views/expedition.js:432 sends  { t: "expedition", outcome, room: wing }');
const sr = String(readFileSync(new URL('../../src/party/session.js', import.meta.url), 'utf8'));
const intake = sr.match(/if \(msg\.t === 'expedition'[\s\S]{0,180}/)[0].split('\n').slice(0, 4);
console.log('   src/party/session.js simReport reads:');
for (const l of intake) console.log('     ' + l.trim());

for (const p of phones) p.close();
tv.close(); sim.close();
process.exit(0);
