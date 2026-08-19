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
import { createLog, visibleTo } from './log.js';
import { hunterVisibleToGuide, ROOMS } from './coverage.js';
import { applyTake, resolveContact, MODE, PLATE } from './taken.js';
import { tallyCasting } from './ballot.js';
import { tallyVote, executioner, NO_ONE } from './vote.js';
import { foldWin, OUTCOME } from './win.js';
import { PHASE, orderFor, EPISODE_CAP } from './phases.js';

export const PHASES = ['LOBBY', 'CASTING', 'EXPEDITION', 'DEBRIEF', 'VERDICT'];

/**
 * @param {object} opts
 * @param {number} opts.count          players
 * @param {number} opts.castSeed       NEVER transmitted. See cast.js's header.
 * @param {number} opts.worldSeed      public, exactly as today
 * @param {(socketId:string, frame:object)=>void} opts.send   STATE frames, governed by the matrix
 * @param {(socketId:string, event:object)=>void} [opts.emit]  EVENTS, governed by `vis`
 * @param {number} [opts.leak]         inject a known leak — the gate's controls, never shipped
 */
export function createRoom({ count, castSeed, worldSeed, send, emit = null, leak = 0 }) {
  const deal = dealCast({ count, castSeed });
  const sockets = deal.seats.map((s) => ({
    id: `phone-${s.seat}`, playerId: s.id, isTV: false,
    alignment: s.alignment, seatRole: null,
  }));
  sockets.push({ id: 'tv', playerId: null, isTV: true, alignment: null, seatRole: null });

  /**
   * ⚠️ TWO CHANNELS, TWO RULES, AND THEY ARE COMPLEMENTARY RATHER THAN DUPLICATIVE — worth being
   * precise about, because "one mechanism" is easy to overclaim. A STATE FRAME is a projection
   * of what is true now, and the entitlement matrix governs it field by field. An EVENT is a
   * fact about a moment, and `vis` governs it whole. What `vis` buys is the part that matters:
   * the live filter and the Reunion are the same replay, so a leak and a missing reveal are the
   * same bug.
   */
  const log = createLog();
  const state = {
    phase: 'LOBBY', tick: 0, episode: 1, worldSeed,
    players: deal.seats.map((s) => ({ id: s.id, seat: s.seat, name: `Robot ${s.seat + 1}`, alive: true, claim: null, plate: PLATE.UNDECLARED })),
    hunterRoom: ROOMS[0],
    pair: { runner: null, guide: null },
    lastPair: { runner: null, guide: null },
    history: Object.fromEntries(deal.seats.map((s) => [s.id, { expeditions: 0, lastEp: null }])),
    nominations: [],
    outcome: null,
    // ⚠️ THE SHOW STARTS WITH ONE CAMERA LIVE, AND IT IS NOT A FREEBIE. At zero cameras the
    // guide's coverage is 0 and their honest error rate is 50% — a coin, not a game, and a
    // guide nobody can ever catch lying. One establishing camera puts episode one at 33%
    // coverage (deliberately above T3's band) and the broadcast has something to cut to on
    // frame one, which the Director needs anyway.
    cameras: { unlocked: 1, needed: deal.cameras },
    incident: { alarms: 0 },
  };

  const record = (e) => {
    const stored = log.append(e);
    if (emit) {
      for (const sock of sockets) {
        const ctx = { playerId: sock.playerId, alignment: sock.alignment, isTV: sock.isTV };
        if (visibleTo(stored, ctx)) emit(sock.id, stored);
      }
    }
    return stored;
  };

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
      // 🚨 S3. The Hunter is on the map only where a live camera watches. `hunterMark.visible =
      // hs.inScene && !!hp` (views/game.js L2559) is the debug view this replaces.
      const seen = hunterVisibleToGuide({
        worldSeed: state.worldSeed, unlocked: state.cameras.unlocked, hunterRoom: state.hunterRoom,
      });
      const marks = [{ x: 1.5, z: -2.0, kind: 'you' }];
      if (seen) marks.push({ x: 7.0, z: 3.0, kind: 'hunter' });
      base.flyover = { hunter: seen, marks };
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
  function playEpisode({ takeRunner = false, hunterRoom = null, ballots = null, votes = null, nominations = null } = {}) {
    const takeRunnerThisEpisode = takeRunner;
    if (hunterRoom) state.hunterRoom = hunterRoom;
    setPhase('CASTING');
    // 🚨 THE PAIR COMES OUT OF A BALLOT, NOT A SEAT INDEX. `ballot.js` resolves every tie
    // deterministically and publicly, so casting never stalls and never waits on a human.
    const living = state.players.filter((p) => p.alive).map((p) => p.id);
    const cast = tallyCasting({
      ballots: ballots || living.map((v, i) => ({
        voter: v, runner: living[(i + 1) % living.length], guide: living[(i + 2) % living.length],
      })),
      living, history: state.history, lastPair: state.lastPair, ep: state.episode, worldSeed,
      matchSeed: worldSeed,
    });
    const runner = state.players.find((p) => p.id === cast.runner);
    const guide = state.players.find((p) => p.id === cast.guide);
    state.pair = { runner: runner.id, guide: guide.id };
    for (const id of [runner.id, guide.id]) {
      state.history[id].expeditions++; state.history[id].lastEp = state.episode;
    }
    record(makeEvent('cast.ballot', VIS.PUBLIC, { runner: runner.id, guide: guide.id, tiebreaks: cast.tiebreaks }));
    for (const s of sockets) {
      s.seatRole = s.playerId === runner.id ? 'runner' : s.playerId === guide.id ? 'guide' : null;
    }
    record(makeEvent('cast.pair', VIS.PUBLIC, { runner: runner.id, guide: guide.id }));
    // The deal itself is written once, SEALED. The Reunion is the same replay with the filter
    // off, so this is what makes the roll call complete without a second reveal pipeline.
    if (state.episode === 1) {
      record(makeEvent('cast.deal', VIS.SEALED, {
        seats: deal.seats.map((s) => ({ id: s.id, role: s.role, alignment: s.alignment })),
      }));
      for (const s of deal.seats) {
        record({ ...makeEvent('role.card', VIS.SELF, { role: s.role }), for: s.id });
        if (s.alignment === EVIL) {
          record({
            ...makeEvent('production.panel', VIS.EVIL, {
              teammates: deal.seats.filter((o) => o.alignment === EVIL && o.id !== s.id).map((o) => ({ id: o.id, role: o.role })),
            }), for: s.id,
          });
        }
      }
    }
    broadcast();

    setPhase('EXPEDITION');
    // One miss and one alarm, so party-anon A0's arm has a failure of each kind to look at.
    record(makeEvent('task.miss', VIS.PUBLIC, { kind: 'call', room: 'east', phaseTick: state.tick, loudness: 0.62 }));
    record(makeEvent('panel.alarm', VIS.PUBLIC, { kind: 'panel', room: 'east', phaseTick: state.tick, loudness: 1.25 }));
    state.incident.alarms += 2;
    state.cameras.unlocked += 1;
    broadcast();

    // 🚨 S2. Contact is terminal in party mode, and the limb count is not consulted. The rule
    // lives in taken.js; hunter-ai.js is untouched and subscribes nothing here.
    const takenThisEpisode = [];
    if (takeRunnerThisEpisode) {
      const victim = state.players.find((p) => p.id === state.pair.runner);
      const r = resolveContact({ mode: MODE.PARTY, occupiedSockets: 0 });
      if (r.outcome === 'taken') {
        const { player, events } = applyTake(victim);
        Object.assign(victim, player);
        takenThisEpisode.push(victim.id);
        for (const e of events) record(makeEvent(e.type, e.vis, e.data));
      }
    }

    setPhase('RECAP');
    setPhase('DEBRIEF');

    // ---- RECKONING / VOTE / EXECUTION. Episode 1 skips them: nobody has anything to go on,
    // and an eviction decided on nothing teaches a table that the vote is arbitrary.
    if (!orderFor(state.episode).includes(PHASE.RECKONING)) {
      setPhase('VERDICT');
    } else {
      setPhase('RECKONING');
      const living = state.players.filter((p) => p.alive).map((p) => p.id);
      state.nominations = (nominations || []).filter((n) => living.includes(n.nominator) && living.includes(n.target));
      for (const n of state.nominations) record(makeEvent('nom.made', VIS.PUBLIC, n));

      setPhase('VOTE');
      const ballotBox = votes || Object.fromEntries(living.map((id) => [id, NO_ONE]));
      const result = tallyVote({ living, nominations: state.nominations }, ballotBox);
      record(makeEvent('vote.tallied', VIS.PUBLIC, { counts: result.counts, executed: result.executed }));

      if (result.executed) {
        setPhase('EXECUTION');
        const victim = state.players.find((p) => p.id === result.executed);
        const swinger = executioner({ living, nominations: state.nominations }, result.executed, takenThisEpisode);
        const { player, events } = applyTake(victim);
        Object.assign(victim, player);
        record(makeEvent('player.executed', VIS.PUBLIC, { id: victim.id, seat: victim.seat, executioner: swinger }));
        for (const e of events.filter((e) => e.type !== 'player.taken')) record(makeEvent(e.type, e.vis, e.data));
      }
      setPhase('VERDICT');
    }

    // ---- the win machine, folded over the log we just wrote
    const align = Object.fromEntries(deal.seats.map((s) => [s.id, s.alignment]));
    const w = foldWin(log.all(), { count, alignmentOf: (id) => align[id] });
    state.outcome = w.outcome === OUTCOME.RENEWED && state.episode >= EPISODE_CAP ? OUTCOME.CANCELLED : w.outcome;
    record(makeEvent('win.checked', VIS.SEALED, { outcome: state.outcome, rule: w.rule, camerasLit: w.camerasLit, fed: w.fed }));
    record(makeEvent('verdict.aired', VIS.PUBLIC, {
      status: state.outcome, camerasLit: w.camerasLit, alarms: state.incident.alarms,
    }));

    state.lastPair = { ...state.pair };
    for (const s of sockets) s.seatRole = null;
    state.episode += 1;
  }

  return {
    sockets, deal, log, state,
    /** Mid-game replay for one socket — what a reconnecting phone is caught up with. */
    replayFor: (sock) => log.replayFor({ playerId: sock.playerId, alignment: sock.alignment, isTV: sock.isTV }),
    playEpisode,
    /** Run episodes until a win predicate fires or the cap is reached. Always terminates. */
    playMatch(opts = {}) {
      while (!state.outcome || state.outcome === OUTCOME.RENEWED) {
        if (state.episode > EPISODE_CAP) break;
        playEpisode(typeof opts === 'function' ? opts(state.episode) : opts);
      }
      return state.outcome;
    },
    start() { setPhase('LOBBY'); },
    /** Ground truth. Belongs to the gate and the Reunion. Never to a socket. */
    truth: () => ({
      seats: deal.seats.map((s) => ({ ...s })),
      evil: deal.evil.slice(),
      castSeed,
    }),
  };
}
