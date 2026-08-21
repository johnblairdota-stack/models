#!/usr/bin/env node
/** THROWAWAY CRITIC PROBE — narrate a whole show: per phase, per person, what they hold and may do. */
import { createSession, CALL, MOVE_CHOICE, INPUT } from '../src/party/session.js';
import { PHASE } from '../src/party/phases.js';
import { project } from '../net/party/entitle.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const COUNT = +arg('--count', 8);
const CAST = +arg('--cast', 7);
const WORLD = +arg('--world', 11);
const POOL = ['Vic','Sam','Jo','Kit','Roo','Ali','Mo','Ben'];
const NAMES = POOL.slice(0, COUNT);

const frames = new Map(), events = new Map();
const s = createSession({
  count: COUNT, castSeed: CAST, worldSeed: WORLD, names: NAMES,
  send: (id, f) => frames.set(id, f),
  emit: (id, e) => { if (!events.has(id)) events.set(id, []); events.get(id).push(e); },
});
const nameOf = Object.fromEntries(s.state.players.map((p) => [p.id, p.name]));
const truth = s.truth();
const align = Object.fromEntries(truth.seats.map(t => [t.id, t.alignment]));
const roleOf = Object.fromEntries(truth.seats.map(t => [t.id, t.role]));

console.log('=== GROUND TRUTH ===');
for (const t of truth.seats) console.log(`  ${nameOf[t.id].padEnd(5)} ${t.id}  ${t.role.padEnd(13)} ${t.alignment}${t.cover ? '  (believes: ' + t.cover + ')' : ''}`);
console.log(`  cameras needed: ${s.state.cameras.needed}   worldSeed=${WORLD} castSeed=${CAST}`);

// what inputs would be accepted right now for this player, probed non-destructively where possible
function legal(pid) {
  const st = s.state, p = st.players.find(x => x.id === pid);
  if (!p.alive) return ['(dead: nothing)'];
  const out = [];
  if (st.phase === PHASE.CASTING) out.push('cast');
  if (st.phase === PHASE.EXPEDITION) {
    if (pid === st.pair.guide && !st.call.said) out.push('call(CLEAR|HOLD)');
    if (pid === st.pair.runner && st.call.said) out.push('move(GO|WAIT)');
    if ((pid === st.pair.guide || pid === st.pair.runner) && !p.refused) out.push('refuse');
  }
  if (st.phase === PHASE.RECKONING) out.push('nominate');
  if (st.phase === PHASE.VOTE && st.nominations.length) out.push('vote');
  if (p.plate !== 'published') out.push('claim');
  return out.length ? out : ['(nothing)'];
}

const seen = new Map();
function dump(label) {
  const st = s.state;
  console.log(`\n##### ${label} — ep${st.episode} ${st.phase} (${st.clock.seconds}s) cams ${st.cameras.unlocked}/${st.cameras.needed} alarms ${st.incident.alarms} pair r=${nameOf[st.pair.runner]||'-'} g=${nameOf[st.pair.guide]||'-'} room=${st.expedition.room||'-'}`);
  for (const sock of s.sockets) {
    if (sock.isTV) continue;
    const f = frames.get(sock.id); if (!f) continue;
    const who = nameOf[sock.playerId];
    const evs = events.get(sock.id) || [];
    const from = seen.get(sock.id) || 0;
    const fresh = evs.slice(from).map(e => `${e.type}${e.data && Object.keys(e.data).length ? JSON.stringify(e.data) : ''}`);
    seen.set(sock.id, evs.length);
    const { frame } = project(f, { playerId: sock.playerId, alignment: sock.alignment, isTV: false, seatRole: sock.seatRole });
    const priv = [];
    if (frame.you) priv.push(`role=${frame.you.role}`);
    if (frame.you?.teammates) priv.push(`teammates=${frame.you.teammates.map(t=>nameOf[t.id]+':'+t.role).join(',')}`);
    if (frame.flyover) priv.push(`FLYOVER hunter=${frame.flyover.hunter} room=${frame.flyover.room}`);
    if (frame.call) priv.push(`call=${JSON.stringify(frame.call)}`);
    console.log(`  ${who.padEnd(5)}${sock.seatRole?'['+sock.seatRole+']':'      '} ${align[sock.playerId]==='evil'?'EVIL':'good'} | can: ${legal(sock.playerId).join(',')} | ${priv.join(' ')}`);
    if (fresh.length) console.log(`         got: ${fresh.join(' ')}`);
  }
}

let now = 0, lastTick = -1;
s.start(now); dump('START');
const alive = () => s.state.players.filter(p => p.alive).map(p => p.id);

for (let i = 0; i < 6000 && s.state.phase !== PHASE.REUNION; i++) {
  if (s.state.tick !== lastTick) {
    lastTick = s.state.tick;
    const ph = s.state.phase, a = alive();
    if (ph === PHASE.CASTING) {
      for (let k = 0; k < a.length; k++) {
        const r = a[(k + s.state.episode) % a.length];
        let g = a[(k + s.state.episode + 3) % a.length];
        if (g === r) g = a[(k + 1) % a.length];
        s.input(a[k], { t: 'cast', runner: r, guide: g });
      }
    } else if (ph === PHASE.EXPEDITION) {
      // guide: honest — say CLEAR iff flyover shows no hunter in the target room (i.e. guess when blind)
      const gs = s.socketFor(s.state.pair.guide);
      const gf = s.unprojected(gs.id);
      const fly = gf.flyover;
      const targetRoom = s.state.expedition.room;
      let call;
      if (fly && fly.hunter) call = (fly.room === targetRoom) ? CALL.HOLD : CALL.CLEAR;
      else call = (i % 2 === 0) ? CALL.CLEAR : CALL.HOLD;   // blind: a coin
      s.input(s.state.pair.guide, { t: 'call', call });
      dump(`ep${s.state.episode} ${ph} (after call)`);
      s.input(s.state.pair.runner, { t: 'move', move: call === CALL.CLEAR ? MOVE_CHOICE.GO : MOVE_CHOICE.WAIT });
    } else if (ph === PHASE.RECKONING) {
      s.input(a[0], { t: 'nominate', target: a[(1 + s.state.episode) % a.length] });
    } else if (ph === PHASE.VOTE) {
      const target = s.state.nominations[0]?.target;
      for (const id of a) s.input(id, { t: 'vote', choice: target && id !== target ? target : 'NO_ONE' });
    }
    dump(`ep${s.state.episode} ${ph}`);
  }
  now += 1000; s.tick(now);
}
dump('REUNION');
console.log(`\nOUTCOME: ${s.state.outcome}  cameras ${s.state.cameras.unlocked}/${s.state.cameras.needed}  alarms ${s.state.incident.alarms}`);
console.log('chairs:', Object.entries(s.state.history).map(([id,h])=>`${nameOf[id]}=${h.expeditions}`).join(' '));
