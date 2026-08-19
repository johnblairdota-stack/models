/**
 * THE ROOM — the party session, as a plain module with the transport injected.
 *
 * ⚠️ TRANSPORT-INJECTED ON PURPOSE, AND IT IS AN ARCHITECTURE CONSTRAINT, NOT A STYLE CHOICE.
 * `docs/design/rrr-gates.md` §1: if the room logic can only run inside a PartyKit worker, then
 * `party-sim` needs a thousand browsers and will never be run, and `party-isolation` needs a
 * live deploy to answer a question about a filter. Both then get skipped, which is how a
 * hidden-role game ships a leak. So the room takes `send(socketId, frame)` and knows nothing
 * about how it travels. PartyKit supplies the real one; the gates supply a recording one.
 *
 * Same construction as `src/game/run.js` L28-41 — no three.js, no DOM, no engine, so it runs
 * identically in a browser, in bare node, and in a worker.
 *
 * This is DELIBERATELY the smallest room that exercises every audience in the matrix. It is not
 * the game loop (`rrr-social-round.md` is), and it is not wired to the mansion. It exists so the
 * three tier-0 gates have something real to assert against before any party code ships.
 */

import { dealCast, viewFor, EVIL } from './cast.js';
import { project } from '../../net/party/entitle.js';
import { makeEvent, VIS } from './events.js';

export const PHASES = ['LOBBY', 'CASTING', 'EXPEDITION', 'DEBRIEF', 'VERDICT'];

/**
 * @param {object} opts
 * @param {number} opts.count          players
 * @param {number} opts.castSeed       NEVER transmitted. See cast.js's header.
 * @param {number} opts.worldSeed      public, exactly as today
 * @param {(socketId:string, frame:object)=>void} opts.send
 * @param {number} [opts.leak]         inject a known leak — the gate's controls, never shipped
 */
export function createRoom({ count, castSeed, worldSeed, send, leak = 0 }) {
  const deal = dealCast({ count, castSeed });
  const sockets = deal.seats.map((s) => ({
    id: `phone-${s.seat}`, playerId: s.id, isTV: false,
    alignment: s.alignment, seatRole: null,
  }));
  sockets.push({ id: 'tv', playerId: null, isTV: true, alignment: null, seatRole: null });

  const log = [];
  const state = {
    phase: 'LOBBY', tick: 0, episode: 1, worldSeed,
    players: deal.seats.map((s) => ({ id: s.id, seat: s.seat, name: `Robot ${s.seat + 1}`, alive: true, claim: null })),
    pair: { runner: null, guide: null },
    cameras: { unlocked: 0, needed: deal.cameras },
    incident: { alarms: 0 },
  };

  const record = (e) => { log.push(e); return e; };

  /** The full frame for a socket, before projection. `you` is that socket's own deal view. */
  function fullFor(sock) {
    const base = {
      phase: state.phase, tick: state.tick, episode: state.episode, worldSeed: state.worldSeed,
      players: state.players.map((p) => ({ ...p })),
      pair: { ...state.pair },
      cameras: { ...state.cameras },
      incident: { ...state.incident },
    };
    if (!sock.isTV) {
      const v = viewFor(deal, sock.playerId);
      base.you = v.you;
    }
    if (sock.seatRole === 'guide' && state.phase === 'EXPEDITION') {
      base.flyover = {
        hunter: true,
        marks: [{ x: 1.5, z: -2.0, kind: 'you' }, { x: 7.0, z: 3.0, kind: 'hunter' }],
      };
    }
    // ---- the four injected leaks. `harness/party-isolation.mjs` I9 requires each to turn
    // exactly one named assertion red; a control that stops failing means the gate is blind.
    // Leaks 1 and 3 are VALUE and ORDER leaks: they pass through the filter untouched, because
    // the key is rowed and the audience is satisfied. Those are the ones a matrix cannot catch,
    // and they are I3's and I4b's whole reason for existing.
    if (leak === 1) base.you = { ...(base.you || {}), role: deal.seats[0].role, alignment: deal.seats[0].alignment };
    if (leak === 3) base.players = base.players.slice().sort((a, b) => {
      const al = (id) => deal.seats.find((s) => s.id === id).alignment;
      return al(a.id).localeCompare(al(b.id));
    });
    return base;
  }

  function broadcast() {
    for (const sock of sockets) {
      const ctx = {
        playerId: sock.playerId, alignment: sock.alignment, isTV: sock.isTV,
        seatRole: sock.seatRole, ownerId: sock.playerId,
      };
      const { frame } = project(fullFor(sock), ctx);
      // 🚨 Leaks 2 and 4 attach AFTER the projection, because that is the shape a real leak
      // takes: nobody edits the matrix to allow a leak, they attach a field downstream of it.
      // (An earlier draft injected both upstream and deny-by-default silently swallowed them —
      // the controls passed, which is exactly the blindness I9 exists to refuse.)
      if (leak === 2) frame.evilRoster = deal.evil.slice();
      if (leak === 4 && sock.isTV && state.phase === 'EXPEDITION') {
        frame.flyover = { hunter: true, marks: [{ x: 1.5, z: -2.0, kind: 'you' }] };
      }
      send(sock.id, frame);
    }
  }

  function setPhase(p) {
    state.phase = p;
    state.tick += 1;
    record(makeEvent(`phase.${p}`, VIS.PUBLIC, {}));
    broadcast();
  }

  /** Play one scripted episode. Deterministic — the gates need two runs to agree exactly. */
  function playEpisode() {
    setPhase('CASTING');
    // A deterministic pick that does NOT consult alignment: seat 0 runs, seat 1 guides.
    const runner = state.players.find((p) => p.alive);
    const guide = state.players.find((p) => p.alive && p.id !== runner.id);
    state.pair = { runner: runner.id, guide: guide.id };
    for (const s of sockets) {
      s.seatRole = s.playerId === runner.id ? 'runner' : s.playerId === guide.id ? 'guide' : null;
    }
    record(makeEvent('cast.pair', VIS.PUBLIC, { runner: runner.id, guide: guide.id }));
    broadcast();

    setPhase('EXPEDITION');
    // One miss and one alarm, so party-anon A0's arm has a failure of each kind to look at.
    record(makeEvent('task.miss', VIS.PUBLIC, { kind: 'call', room: 'east', phaseTick: state.tick, loudness: 0.62 }));
    record(makeEvent('panel.alarm', VIS.PUBLIC, { kind: 'panel', room: 'east', phaseTick: state.tick, loudness: 1.25 }));
    state.incident.alarms += 2;
    state.cameras.unlocked += 1;
    broadcast();

    setPhase('DEBRIEF');
    setPhase('VERDICT');
    for (const s of sockets) s.seatRole = null;
    state.episode += 1;
  }

  return {
    sockets, deal, log, state,
    playEpisode,
    start() { setPhase('LOBBY'); },
    /** Ground truth. Belongs to the gate and the Reunion. Never to a socket. */
    truth: () => ({
      seats: deal.seats.map((s) => ({ ...s })),
      evil: deal.evil.slice(),
      castSeed,
    }),
  };
}
