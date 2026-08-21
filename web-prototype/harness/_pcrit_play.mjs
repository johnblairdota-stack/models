#!/usr/bin/env node
/** THROWAWAY CRITIC PROBE — play a whole show and dump what each of N people holds, per phase. */
import { createSession, CALL, MOVE_CHOICE } from '../src/party/session.js';
import { PHASE } from '../src/party/phases.js';
import { project } from '../net/party/entitle.js';
import { OUTCOME } from '../src/party/win.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const COUNT = +arg('--count', 8);
const CAST = +arg('--cast', 7);
const WORLD = +arg('--world', 11);
const NAMES = ['Vic','Sam','Jo','Kit','Roo','Ali','Mo','Ben'].slice(0, COUNT);

const frames = new Map();     // socketId -> latest frame
const events = new Map();     // socketId -> [events]
const s = createSession({
  count: COUNT, castSeed: CAST, worldSeed: WORLD, names: NAMES,
  send: (id, f) => frames.set(id, f),
  emit: (id, e) => { if (!events.has(id)) events.set(id, []); events.get(id).push(e); },
});
const nameOf = Object.fromEntries(s.state.players.map((p) => [p.id, p.name]));
const truth = s.truth();
console.log('=== GROUND TRUTH ===');
for (const t of truth.seats) console.log(`  ${nameOf[t.id].padEnd(5)} ${t.id}  ${t.role.padEnd(13)} ${t.alignment}${t.cover ? '  (believes: ' + t.cover + ')' : ''}`);
console.log(`  cameras needed: ${s.state.cameras.needed}`);

let now = 0;
const seen = new Map();  // socketId -> count of events already printed
const dump = (label) => {
  console.log(`\n----- ${label}  [ep ${s.state.episode} · ${s.state.phase} · ${s.state.clock.seconds}s] -----`);
  for (const sock of s.sockets) {
    const f = frames.get(sock.id);
    if (!f) continue;
    const key = sock.isTV ? 'TV' : nameOf[sock.playerId];
    const evs = (events.get(sock.id) || []);
    const from = seen.get(sock.id) || 0;
    const fresh = evs.slice(from).map((e) => `${e.type}${e.data && Object.keys(e.data).length ? '(' + JSON.stringify(e.data).slice(0, 90) + ')' : ''}`);
    seen.set(sock.id, evs.length);
    const { frame } = project(f, { playerId: sock.playerId, alignment: sock.alignment, isTV: sock.isTV, seatRole: sock.seatRole });
    console.log(`  ${key.padEnd(5)} ${sock.seatRole ? '[' + sock.seatRole + '] ' : ''}frame=${JSON.stringify(frame)}`);
    if (fresh.length) console.log(`        ev: ${fresh.join(' | ')}`);
  }
};

s.start(now);
dump('START');

// a script of taps: everyone casts, guide calls, runner moves, everyone nominates+votes
let step = 0;
let lastTick = -1;
const alive = () => s.state.players.filter((p) => p.alive).map((p) => p.id);
for (let i = 0; i < 4000 && s.state.phase !== PHASE.REUNION; i++) {
  if (s.state.tick !== lastTick) {
    lastTick = s.state.tick;
    const ph = s.state.phase;
    if (ph === PHASE.CASTING) {
      const a = alive();
      for (let k = 0; k < a.length; k++) {
        // people vote for whoever they think; use a rotating deterministic preference
        const r = a[(k + s.state.episode) % a.length];
        const g = a[(k + s.state.episode + 3) % a.length];
        s.input(a[k], { t: 'cast', runner: r, guide: g !== r ? g : a[(k + 1) % a.length] });
      }
    } else if (ph === PHASE.EXPEDITION) {
      s.input(s.state.pair.guide, { t: 'call', call: (s.state.episode % 2) ? CALL.CLEAR : CALL.CLEAR });
      s.input(s.state.pair.runner, { t: 'move', move: MOVE_CHOICE.GO });
    } else if (ph === PHASE.RECKONING) {
      const a = alive();
      // one nomination
      s.input(a[0], { t: 'nominate', target: a[(1 + s.state.episode) % a.length] });
    } else if (ph === PHASE.VOTE) {
      const a = alive();
      const target = s.state.nominations[0]?.target;
      for (const id of a) s.input(id, { t: 'vote', choice: target && id !== target ? target : 'NO_ONE' });
    }
    dump(`ep${s.state.episode} ${ph}`);
  }
  now += 1000;
  s.tick(now);
}
dump('REUNION');
console.log(`\nOUTCOME: ${s.state.outcome}  cameras ${s.state.cameras.unlocked}/${s.state.cameras.needed}  alarms ${s.state.incident.alarms}`);
console.log('history:', JSON.stringify(s.state.history));
