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
import { cleanLook } from './look.js';

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
    players: deal.seats.map((s) => ({
      id: s.id, seat: s.seat, name: `Robot ${s.seat + 1}`, alive: true,
      shell: null, accent: null,
      claim: null, plate: PLATE.UNDECLARED,
    })),
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
    } else {
      // Host/TV is a spectator. `playEpisode` writes covers into `players[].claim` so the
      // Reunion has a finalClaim; that field is phones-only. Strip it here too so a later
      // matrix-row mistake cannot put covers on the TV frame.
      base.players = base.players.map((p) => {
        const { claim, ...row } = p;
        return row;
      });
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

  /**
   * 🚨 THE DRAW IS ITS OWN MOMENT, AND IT HAPPENS BEFORE THE FIRST EXPEDITION.
   *
   * This used to live inside `playEpisode` behind `if (state.episode === 1)`, which put the whole
   * deal AFTER the pair had already locked: the phone had voted a runner in without ever having
   * been told what it was playing for, and the card landed on a screen that had moved on. The
   * transport now calls this when the night starts, so every joined phone has its card before the
   * first ballot. `playEpisode` still calls it, so a gate that only plays episodes is unchanged.
   *
   * Idempotent, and that is the whole contract: the deal is written ONCE. `viewFor` is derived
   * from `dealCast`, so a second call would append a second identical card and a phone would
   * animate a deal it already had.
   *
   * @returns {boolean} true if this call wrote the deal
   */
  let dealt = false;
  function dealRoles() {
    if (dealt) return false;
    dealt = true;
    // The deal itself is written once, SEALED. The Reunion is the same replay with the filter
    // off, so this is what makes the roll call complete without a second reveal pipeline.
    record(makeEvent('cast.deal', VIS.SEALED, {
      // `cover` is here so the Reunion can say "and you believed you were the Camera Op all
      // game" without a second source. Sealed with everything else until then.
      seats: deal.seats.map((s) => ({ id: s.id, role: s.role, alignment: s.alignment, cover: s.cover ?? null })),
    }));
    for (const s of deal.seats) {
      // 🚨 THE ROLE CARD SHOWS WHAT THE PLAYER BELIEVES, NOT WHAT IS TRUE, AND THIS LINE READ
      // `s.role` UNTIL `reunion-truth` U2 CAUGHT IT.
      //
      // The state channel had it right — `viewFor` has always sent the cover — and the event
      // channel sent ground truth, so the Glitched's own phone received a card reading
      // "glitched". The one card whose entire text is *"you are not told this"* was telling
      // them, on episode one, in writing. Two channels is exactly the shape of bug that
      // invites: one of them was correct the whole time.
      //
      // It is derived from `viewFor` now rather than restated, so there is one answer to
      // "what does this player believe they are".
      record({ ...makeEvent('role.card', VIS.SELF, { role: viewFor(deal, s.id).you.role }), for: s.id });
      if (s.alignment === EVIL) {
        record({
          ...makeEvent('production.panel', VIS.EVIL, {
            teammates: deal.seats.filter((o) => o.alignment === EVIL && o.id !== s.id).map((o) => ({ id: o.id, role: o.role })),
          }), for: s.id,
        });
      }
    }
    return true;
  }

  /** Play one scripted episode. Deterministic — the gates need two runs to agree exactly. */
  function playEpisode({ takeRunner = false, hunterRoom = null, ballots = null, votes = null, nominations = null, living: livingOpt = null } = {}) {
    const takeRunnerThisEpisode = takeRunner;
    if (hunterRoom) state.hunterRoom = hunterRoom;
    const allLiving = state.players.filter((p) => p.alive).map((p) => p.id);
    // Night passes the seated humans. Gates omit this and keep the full deal.
    const living = (Array.isArray(livingOpt) && livingOpt.length)
      ? livingOpt.filter((id) => allLiving.includes(id))
      : allLiving;
    // An explicit empty ballot list means wait — do not invent a pair from unused Robot N chairs.
    if (Array.isArray(ballots) && ballots.length === 0) return;
    setPhase('CASTING');
    // 🚨 THE PAIR COMES OUT OF A BALLOT, NOT A SEAT INDEX. `ballot.js` resolves every tie
    // deterministically and publicly, so casting never stalls and never waits on a human.
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
    record(makeEvent('cast.ballot', VIS.PUBLIC, { episode: state.episode, runner: runner.id, guide: guide.id, tiebreaks: cast.tiebreaks }));
    for (const s of sockets) {
      s.seatRole = s.playerId === runner.id ? 'runner' : s.playerId === guide.id ? 'guide' : null;
    }
    record(makeEvent('cast.pair', VIS.PUBLIC, { runner: runner.id, guide: guide.id }));
    // A night start has already drawn. A gate that only plays episodes draws here, exactly where
    // it always did — the call is idempotent, so which of the two ran is not a behaviour.
    dealRoles();
    broadcast();

    setPhase('EXPEDITION');
    // One miss and one alarm, so party-anon A0's arm has a failure of each kind to look at.
    record(makeEvent('task.miss', VIS.PUBLIC, { kind: 'call', room: 'east', phaseTick: state.tick, loudness: 0.62 }));
    record(makeEvent('panel.alarm', VIS.PUBLIC, { kind: 'panel', room: 'east', phaseTick: state.tick, loudness: 1.25 }));
    // 🚨 ATTRIBUTION EXISTS FROM THE FIRST EPISODE AND IS SEALED UNTIL THE REUNION. The public
    // record is a COUNT (T5, `incident.alarms`); `causedBy` lives here, in the same stream,
    // visible to nobody. This is the one-mechanism claim paying off: the Reunion needs no second
    // source for "Loudest Robot", and the live filter needs no special case to withhold it.
    record(makeEvent('noise.emitted', VIS.SEALED, { causedBy: runner.id, loud: 1.25, room: 'east' }));
    record(makeEvent('noise.emitted', VIS.SEALED, { causedBy: guide.id, loud: 0.62, room: 'east' }));
    state.incident.alarms += 2;

    // 🚨 THE OBJECTIVE HAS TO REACH THE LOG OR GOOD CANNOT WIN. `win.js` W2 counts
    // `run.camera_lit` entries; this stub incremented `cameras.unlocked` and emitted nothing, so
    // the camera win path was unreachable and good could only ever win by executing every member
    // of Production. `party-sim` S1 read that as an 8-19% good win rate across every player
    // count, which looked like a balance problem and was a missing event.
    //
    // A camera lights when the expedition SURVIVES. Being taken costs the terminal as well as
    // the runner — `party-loop.md`: *"the terminal stays dark"*.
    if (!takeRunnerThisEpisode) {
      state.cameras.unlocked += 1;
      record(makeEvent('run.camera_lit', VIS.PUBLIC, { camera: state.cameras.unlocked, episode: state.episode }));
    }
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

    // Claims are published from a phone at any time; the stub sets one per episode so the roll
    // call has a `finalClaim` to put beside the truth.
    for (const p of state.players.filter((x) => x.alive)) {
      const claim = deal.seats.find((s) => s.id === p.id).cover ?? 'contestant';
      p.claim = claim;
      record(makeEvent('player.claim_set', VIS.PUBLIC, { id: p.id, claim }));
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
      // §4: the full vote record is AIRED, attributed. Who you voted for is the cheapest
      // deduction fuel in the game and hiding it would buy nothing.
      for (const [voter, choice] of Object.entries(ballotBox)) {
        record(makeEvent('vote.cast', VIS.PUBLIC, { voter, choice }));
      }
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
    /**
     * Draw the cast. Called at night start so every joined phone holds a card before the first
     * ballot; called again by `playEpisode` and then a no-op. Returns true only for the call that
     * actually wrote the deal, so a transport can tell whether it has a deal to announce.
     */
    dealRoles,
    /** Has the cast been drawn? A phone with no card is a phone that has not been dealt to. */
    isDealt: () => dealt,
    /** Host-driven: open CASTING and wait for phone ballots. `playEpisode` still starts here too. */
    beginCasting() { setPhase('CASTING'); },
    /**
     * Published nameplate. 12 chars, same cap as the phone spec's cheap join. Does not broadcast —
     * the transport decides when a frame or lobby snapshot should follow.
     */
    setName(playerId, name) {
      const p = state.players.find((x) => x.id === playerId);
      if (!p) return null;
      const clean = String(name ?? '').replace(/[^\w \-.'’]/g, '').trim().slice(0, 12);
      if (clean) p.name = clean;
      return p.name;
    },
    /** Push the current projected frame to every socket — names are public. */
    syncAll() { broadcast(); },
    /**
     * Published face colours. Closed palette — unknown hex is ignored.
     * Does not broadcast; the transport fans the lobby snapshot.
     */
    setLook(playerId, look) {
      const p = state.players.find((x) => x.id === playerId);
      if (!p) return null;
      const clean = cleanLook(look);
      if (!clean) return { shell: p.shell, accent: p.accent };
      p.shell = clean.shell;
      p.accent = clean.accent;
      return clean;
    },
    /** Push the current projected frame to one socket — a late joiner, not a broadcast. */
    syncOne(socketId) {
      const sock = sockets.find((s) => s.id === socketId);
      if (!sock) return;
      const ctx = {
        playerId: sock.playerId, alignment: sock.alignment, isTV: sock.isTV,
        seatRole: sock.seatRole, ownerId: sock.playerId,
      };
      const { frame } = project(fullFor(sock), ctx);
      send(sock.id, frame);
    },
    /** Ground truth. Belongs to the gate and the Reunion. Never to a socket. */
    truth: () => ({
      seats: deal.seats.map((s) => ({ ...s })),
      evil: deal.evil.slice(),
      castSeed,
    }),
  };
}
