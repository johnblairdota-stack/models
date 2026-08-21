/**
 * PROBE: run party-isolation's OWN suite (its walker, its predicates, verbatim) against the
 * frames `session.js` actually sends — the frames a phone in the lounge receives.
 * party-isolation only ever walks `room.js`.
 */
import { createSession, CALL, MOVE_CHOICE } from '../src/party/session.js';
import { PHASE } from '../src/party/phases.js';
import { audienceFor, entitled } from '../net/party/entitle.js';
import { SCRIPT } from '../src/party/roles.js';

const SEEDS = [11, 12, 13, 14, 15];
const COUNT = 8;

// --- party-isolation.mjs's walker, copied verbatim (lines 41-58)
function paths(node, prefix = '', out = []) {
  if (node === null || typeof node !== 'object') { out.push(prefix); return out; }
  if (Array.isArray(node)) {
    if (!node.length) { out.push(prefix + '[]'); return out; }
    for (const v of node) paths(v, prefix + '[]', out);
    return out;
  }
  const ks = Object.keys(node);
  if (!ks.length) { out.push(prefix); return out; }
  for (const k of ks) paths(node[k], prefix ? `${prefix}.${k}` : k, out);
  return out;
}
function* leaves(node, prefix = '') {
  if (node === null || typeof node !== 'object') { yield [prefix, node]; return; }
  if (Array.isArray(node)) { for (let i = 0; i < node.length; i++) yield* leaves(node[i], `${prefix}[${i}]`); return; }
  for (const k of Object.keys(node)) yield* leaves(node[k], prefix ? `${prefix}.${k}` : k);
}

function capture() {
  const runs = [];
  for (const seed of SEEDS) {
    const tape = new Map();
    const s = createSession({ count: COUNT, castSeed: seed, worldSeed: seed * 3,
      send: (id, f) => { if (!tape.has(id)) tape.set(id, []); tape.get(id).push(f); } });
    let now = 0; s.start(now);
    for (let i = 0; i < 20000 && s.state.phase !== PHASE.REUNION; i++) {
      const alive = s.state.players.filter((p) => p.alive).map((p) => p.id);
      switch (s.state.phase) {
        case PHASE.CASTING:
          for (let k = 0; k < alive.length; k++) s.input(alive[k], { t: 'cast', runner: alive[(k+1)%alive.length], guide: alive[(k+2)%alive.length] });
          break;
        case PHASE.EXPEDITION:
          s.input(s.state.pair.guide, { t: 'call', call: CALL.CLEAR });
          s.input(s.state.pair.runner, { t: 'move', move: MOVE_CHOICE.GO });
          break;
        case PHASE.RECKONING:
          if (!s.state.nominations.length) s.input(alive[0], { t: 'nominate', target: alive[1] });
          break;
        case PHASE.VOTE: for (const id of alive) s.input(id, { t: 'vote', choice: alive[1] }); break;
        default: break;
      }
      now += 1000; s.tick(now);
    }
    runs.push({ seed, tape, truth: s.truth(), log: s.log.all(), sockets: s.sockets.map((x) => ({ ...x })) });
  }
  return runs;
}

// --- party-isolation.mjs's suite(), copied for the checks that are frame-shape properties
function suite(runs) {
  const d = {};
  const ok = { I1: true, I2: true, I3: true, I3b: true, I4: true, I4b: true, I5: true, I6: true, I8: true };
  for (const run of runs) {
    const seatOf = new Map(run.truth.seats.map((s) => [s.id, s]));
    const roleCount = {};
    for (const s of run.truth.seats) roleCount[s.role] = (roleCount[s.role] || 0) + 1;
    const uniqueRole = (r) => roleCount[r] === 1;
    const wordsFor = (r) => [r, SCRIPT[r] && SCRIPT[r].name, SCRIPT[r] && SCRIPT[r].line].filter(Boolean);

    for (const sock of run.sockets) {
      const frames = run.tape.get(sock.id) || [];
      const ctx = { playerId: sock.playerId, alignment: sock.alignment, isTV: sock.isTV, seatRole: sock.seatRole, ownerId: sock.playerId };
      const mine = sock.isTV ? null : seatOf.get(sock.playerId);
      const teammates = mine && mine.alignment === 'evil' ? run.truth.seats.filter((s) => s.alignment === 'evil' && s.id !== mine.id) : [];
      for (let fi = 0; fi < frames.length; fi++) {
        const f = frames[fi];
        for (const p of paths(f)) if (audienceFor(p) === null) { ok.I1 = false; d.I1 = d.I1 || `${sock.id} · frame ${fi} · ${p} · matrix has no row`; }
        for (const p of paths(f)) {
          const aud = audienceFor(p);
          const live = { ...ctx, seatRole: f.pair && f.pair.runner === sock.playerId ? 'runner' : f.pair && f.pair.guide === sock.playerId ? 'guide' : null };
          if (aud !== null && !entitled(aud, live)) { ok.I2 = false; d.I2 = d.I2 || `${sock.id} · frame ${fi} · ${p} · audience ${aud}`; }
        }
        for (const [p, v] of leaves(f)) {
          if (typeof v !== 'string') continue;
          if (mine && mine.cover && wordsFor(mine.cover).includes(v) && p.startsWith('you.role')) continue;
          if (p.endsWith('.claim')) continue;
          for (const other of run.truth.seats) {
            if (mine && other.id === mine.id) continue;
            if (teammates.some((tm) => tm.id === other.id)) continue;
            if (wordsFor(other.role).includes(v) && uniqueRole(other.role) && (!mine || other.role !== mine.role)) {
              ok.I3 = false; d.I3 = d.I3 || `${sock.id} · frame ${fi} · ${p} = "${v}" is ${other.id}'s role`;
            }
          }
          if (v === 'evil' && (!mine || mine.alignment !== 'evil')) { ok.I3 = false; d.I3 = d.I3 || `${sock.id} · frame ${fi} · ${p} = "evil" on a good socket`; }
        }
        if (Array.isArray(f.players)) {
          for (const pl of f.players) {
            if (pl.claim == null) continue;
            const published = run.log.some((e) => e.type === 'player.claim_set' && e.vis === 'PUBLIC' && e.data.id === pl.id && e.data.claim === pl.claim);
            if (!published) { ok.I3b = false; d.I3b = d.I3b || `${sock.id} · frame ${fi} · ${pl.id}'s claim "${pl.claim}" was never published`; }
          }
          const seats = f.players.map((p) => p.seat);
          if (seats.some((s, i) => s !== i)) { ok.I4b = false; d.I4b = d.I4b || `${sock.id} · frame ${fi} · players[] order ${seats.join(',')}`; }
        }
        if (f.flyover && sock.isTV) { ok.I8 = false; d.I8 = d.I8 || `TV received flyover at frame ${fi}`; }
      }
    }

    const strip = (f) => { const { you, ...rest } = f; return JSON.stringify(rest); };
    const roleAt = (f, pid) => (f.pair && f.pair.runner === pid) ? 'runner' : (f.pair && f.pair.guide === pid) ? 'guide' : 'seated';
    const phones = run.sockets.filter((s) => !s.isTV);
    const nFrames = Math.max(...phones.map((s) => (run.tape.get(s.id) || []).length));
    for (const sock of phones) {
      const n = (run.tape.get(sock.id) || []).length;
      if (n !== nFrames) { ok.I5 = false; d.I5 = d.I5 || `${sock.id} got ${n} frames, peers got ${nFrames}`; }
    }
    for (let i = 0; i < nFrames; i++) {
      const buckets = new Map();
      for (const sock of phones) {
        const f = (run.tape.get(sock.id) || [])[i];
        if (!f) continue;
        const key = `${seatOf.get(sock.playerId).alignment}/${roleAt(f, sock.playerId)}`;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push([sock, f]);
      }
      for (const [key, members] of buckets) {
        if (members.length < 2) continue;
        const ref = strip(members[0][1]);
        for (const [sock, f] of members.slice(1)) if (strip(f) !== ref) { ok.I4 = false; d.I4 = d.I4 || `${key} frame ${i}: ${sock.id} != ${members[0][0].id}`; }
      }
    }
    for (const sock of run.sockets) {
      if (sock.isTV) continue;
      const seat = seatOf.get(sock.playerId);
      const frames = run.tape.get(sock.id) || [];
      const sawTeam = frames.some((f) => f.you && Array.isArray(f.you.teammates));
      if (seat.alignment === 'evil' && !sawTeam) { ok.I6 = false; d.I6 = d.I6 || `${sock.id} is evil and never got teammates`; }
      if (seat.alignment !== 'evil' && sawTeam) { ok.I6 = false; d.I6 = d.I6 || `${sock.id} is good and got teammates`; }
    }
  }
  return { ...ok, detail: d };
}

const R = suite(capture());
for (const k of ['I1','I2','I3','I3b','I4','I4b','I5','I6','I8']) {
  console.log(`${R[k] ? '  ok  ' : '  RED '} ${k}${R.detail[k] ? ' · ' + R.detail[k] : ''}`);
}
