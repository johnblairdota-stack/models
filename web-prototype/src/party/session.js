/**
 * 🎬 **THE SESSION — the game loop, live, on a clock, driven by eight thumbs.**
 *
 * `docs/design/rrr-social-round.md`. This is M3: the faceless social game. The circle, the
 * phases, the casting ballot, the expedition, the reckoning, the vote and the sledgehammer —
 * everything the mode is, except the mansion.
 *
 * ---------------------------------------------------------------------------------------------
 * ⚠️ WHY THIS EXISTS ALONGSIDE `room.js`, WHICH ALSO PLAYS EPISODES
 * ---------------------------------------------------------------------------------------------
 * `room.js` says it in its own header: *"This is DELIBERATELY the smallest room that exercises
 * every audience in the matrix. It is not the game loop."* It takes ballots and votes as
 * ARGUMENTS and plays an episode to completion in microseconds, which is what lets `party-sim`
 * run a thousand matches and what lets `party-isolation` assert a filter without a browser.
 *
 * A room full of people cannot be passed as an argument. So this file is the other half: the
 * same modules, arranged around a clock, with humans supplying what the script used to.
 * **Neither is a copy of the other** — every rule they share (`ballot.js`, `vote.js`, `win.js`,
 * `cast.js`, `phases.js`) is imported by both and implemented by neither.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 TIME IS AN ARGUMENT. THERE IS NO `setInterval` IN THIS FILE AND THERE MUST NEVER BE.
 * ---------------------------------------------------------------------------------------------
 * `tick(nowMs)` is called by whoever owns a clock — the server every 250ms, or a gate in a tight
 * loop stepping a fake one. A session that scheduled its own timers could only be tested by
 * waiting out a real forty-minute show, which means it would be tested once, by hand, badly.
 * Every deadline here is an absolute millisecond stamp compared against the argument.
 *
 * No THREE, no DOM, no timers. Browser, bare node and a worker alike.
 */

import { dealCast, viewFor, EVIL } from './cast.js';
import { project } from '../../net/party/entitle.js';
import { makeEvent, VIS } from './events.js';
import { createLog, visibleTo } from './log.js';
import { ROOMS, hunterVisibleToGuide } from './coverage.js';
import { guideSight } from './darkrun.js';
import { applyTake, resolveContact, MODE, PLATE } from './taken.js';
import { tallyCasting } from './ballot.js';
import { tallyVote, executioner, nominate as proposeNomination, reckoningClosed, NO_ONE } from './vote.js';
import { foldWin, OUTCOME } from './win.js';
import { PHASE, SECONDS, orderFor, reckoningSeconds, EPISODE_CAP } from './phases.js';

export const LOBBY = 'LOBBY';

/** What a phone may send, and when. Anything else is refused with a reason the phone can show. */
export const INPUT = ['cast', 'claim', 'call', 'move', 'nominate', 'vote'];

/** The expedition's two answers, and the two the pair give. */
export const CALL = { CLEAR: 'CLEAR', HOLD: 'HOLD' };
export const MOVE_CHOICE = { GO: 'GO', WAIT: 'WAIT' };

/** Deterministic, seeded, no `Math.random` — `run.js`'s discipline, restated nowhere. */
function hash(...parts) {
  let h = 0x811c9dc5 >>> 0;
  const s = parts.join(':');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/**
 * ⚠️ THE GUIDE'S TILT IS THE SHIPPED ONE. 62° is `views/game.js`'s flyover elevation, and at the
 * 4.80m storey it hides 2.55m of floor behind every wall — which is exactly where a stationary
 * Hunter stands. It is not a difficulty knob; changing it changes how often an HONEST guide is
 * wrong, which is the number T3 bands.
 */
export const GUIDE_TILT_DEG = 62;
export const STOREY_H = 4.80;

/**
 * @param {object} o
 * @param {number} o.count
 * @param {number} o.castSeed        NEVER transmitted. cast.js's header.
 * @param {number} o.worldSeed
 * @param {string[]} [o.names]       from the lobby, seat-indexed
 * @param {(socketId:string, frame:object)=>void} o.send
 * @param {(socketId:string, event:object)=>void} [o.emit]
 */
export function createSession({ count, castSeed, worldSeed, names = [], send, emit = null }) {
  const deal = dealCast({ count, castSeed });
  const sockets = deal.seats.map((s) => ({
    id: `phone-${s.seat}`, playerId: s.id, isTV: false,
    alignment: s.alignment, seatRole: null,
  }));
  sockets.push({ id: 'tv', playerId: null, isTV: true, alignment: null, seatRole: null });
  const socketOf = new Map(sockets.map((s) => [s.playerId, s]));

  const log = createLog();
  const state = {
    phase: LOBBY, tick: 0, episode: 1, worldSeed,
    players: deal.seats.map((s) => ({
      id: s.id, seat: s.seat, name: (names[s.seat] || `Robot ${s.seat + 1}`).slice(0, 14),
      // 🚨 `taken` IS PRESENT AND FALSE FROM FRAME ONE, NEVER ADDED ON DEATH. `applyTake` returns
      // it only on the victim, and rowing it that way turned `party-isolation` I7 red on the
      // first run: *"a frame that grows a field the moment somebody dies has announced something
      // about them"*. The announcement here is harmless — who was taken is already a PUBLIC event
      // — but the SHAPE rule is what catches the ones that are not, so the data changed and the
      // gate did not.
      alive: true, taken: false, claim: null, plate: PLATE.UNDECLARED,
    })),
    pair: { runner: null, guide: null },
    lastPair: { runner: null, guide: null },
    history: Object.fromEntries(deal.seats.map((s) => [s.id, { expeditions: 0, lastEp: null }])),
    nominations: [],
    tally: null,
    call: { by: null, said: null },
    expedition: { room: null, outcome: null },
    outcome: null,
    cameras: { unlocked: 1, needed: deal.cameras },
    incident: { alarms: 0 },
    clock: { seconds: 0, endsAt: 0 },
  };

  // Per-phase input buckets. Cleared on every transition, so a stale tap can never carry over.
  let pending = { cast: new Map(), votes: new Map(), acted: new Set() };
  /** The Hunter's room. Seeded, never rowed in the matrix, never sent to anyone. */
  let hunterRoom = null;
  let takenThisEpisode = [];
  let queue = [];                        // phases still to run in this episode
  let episodeOpen = false;               // see `advance` — episode 1 has no VERDICT to hang this on

  const living = () => state.players.filter((p) => p.alive).map((p) => p.id);

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

  function fullFor(sock) {
    const base = {
      phase: state.phase, tick: state.tick, episode: state.episode, worldSeed: state.worldSeed,
      clock: { ...state.clock },
      players: state.players.map((p) => ({ ...p })),
      pair: { ...state.pair },
      cameras: { ...state.cameras },
      incident: { ...state.incident },
      nominations: state.nominations.map((n) => ({ ...n })),
      call: { ...state.call },
      expedition: { ...state.expedition },
    };
    if (state.tally) base.tally = { counts: { ...state.tally.counts }, threshold: state.tally.threshold, executed: state.tally.executed };
    if (!sock.isTV) {
      base.you = { ...viewFor(deal, sock.playerId).you, acted: pending.acted.has(sock.playerId) };
    }
    // 🚨 S3. The Hunter is on the guide's map only where a live camera watches AND the wall does
    // not hide it. Two independent honest-error sources, compounded — `darkrun.js`'s header.
    if (sock.seatRole === 'guide' && state.phase === PHASE.EXPEDITION) {
      base.flyover = sightForGuide();
    }
    return base;
  }

  /** What the guide's screen shows, and the only place the Hunter's room can escape into a frame. */
  function sightForGuide() {
    const covered = hunterVisibleToGuide({ worldSeed, unlocked: state.cameras.unlocked, hunterRoom });
    // The Hunter's distance from the nearest wall, seeded per episode. In the mansion this is
    // geometry; here it is the same distribution over the same blind strip.
    const wallDistance = (hash(worldSeed, 'wall', state.episode) % 800) / 100;   // 0.00 – 7.99 m
    const sight = guideSight({ covered, wallDistance, tiltDeg: GUIDE_TILT_DEG, storeyH: STOREY_H });
    const marks = [{ x: 1.5, z: -2.0, kind: 'you' }];
    if (sight.seen) marks.push({ x: 7.0, z: 3.0, kind: 'hunter' });
    return { hunter: sight.seen, room: sight.seen ? hunterRoom : null, marks };
  }

  const ctxFor = (sock) => ({
    playerId: sock.playerId, alignment: sock.alignment, isTV: sock.isTV,
    seatRole: sock.seatRole, ownerId: sock.playerId,
  });

  /** Send one socket the frame it is entitled to right now. The only place `send` is called. */
  function pushTo(sock) {
    const { frame, unrowed } = project(fullFor(sock), ctxFor(sock));
    // ⚠️ AN UNROWED FIELD IS A BUG THAT MUST BE LOUD IN DEVELOPMENT. Deny-by-default already
    // dropped it, so nothing leaked — but silence here is how a field stays unrowed for six
    // months and its author never states an audience. `entitle.js`'s header: the rot is the point.
    if (unrowed.length) state.unrowed = [...new Set([...(state.unrowed || []), ...unrowed])];
    send(sock.id, frame);
  }

  function broadcast() { for (const sock of sockets) pushTo(sock); }

  // ---------------------------------------------------------------- the clock
  function enter(phase, seconds, now) {
    state.phase = phase;
    state.tick += 1;
    state.clock = { seconds, endsAt: now + seconds * 1000 };
    pending = { cast: new Map(), votes: new Map(), acted: new Set() };
    record(makeEvent(`phase.${phase}`, VIS.PUBLIC, { episode: state.episode, seconds }));
    onEnter[phase]?.(now);
    broadcast();
  }

  /**
   * 🚨 EVERY PHASE HAS AN ANSWER FOR "NOBODY TAPPED", AND IT IS NEVER "WAIT LONGER". Eight people
   * in a lounge include at least one whose phone is face-down on a sofa arm. A phase that needs a
   * tap to end has stalled the party; every `onExit` below resolves from whatever it has.
   */
  const onEnter = {
    /**
     * 🚨 THE WING IS ANNOUNCED BEFORE ANYONE IS CAST, AND THAT IS §2's RULE RATHER THAN A DETAIL:
     * *"the task and the wing are announced BEFORE anyone is picked, so casting is an argument
     * about a specific job rather than a popularity contest."* Setting it on entry to EXPEDITION
     * instead — which is where it was until a browser render showed the phone asking who should
     * go "into the house" — turns every casting debate into a personality contest.
     */
    [PHASE.CASTING]: () => {
      state.expedition = { room: ROOMS[hash(worldSeed, 'target', state.episode) % ROOMS.length], outcome: null };
      state.call = { by: null, said: null };
      record(makeEvent('expedition.announced', VIS.PUBLIC, { room: state.expedition.room, episode: state.episode }));
    },
    [PHASE.EXPEDITION]: () => {
      // Seeded per episode so a replay of the same match is the same match. The Hunter is placed
      // only now — the wing is public from CASTING, but where the Hunter stands never is.
      hunterRoom = ROOMS[hash(worldSeed, 'hunter', state.episode) % ROOMS.length];
      const target = state.expedition.room;
      state.call = { by: state.pair.guide, said: null };
      record(makeEvent('expedition.begun', VIS.PUBLIC, {
        runner: state.pair.runner, guide: state.pair.guide, room: target, episode: state.episode,
      }));
      // Attribution exists from the first episode and is sealed until the Reunion.
      record(makeEvent('hunter.placed', VIS.SEALED, { room: hunterRoom, episode: state.episode }));
    },
    [PHASE.RECKONING]: () => { state.nominations = []; state.tally = null; },
  };

  const onExit = {
    [PHASE.CASTING]: () => resolveCasting(),
    [PHASE.EXPEDITION]: () => resolveExpedition(),
    [PHASE.VOTE]: () => resolveVote(),
    // 🚨 NOTHING HANGS OFF `VERDICT`, AND THAT IS DELIBERATE — IT IS WHERE THIS FIRST WENT WRONG.
    // The win check and the episode counter lived here until a smoke run sat in episode 1 for
    // four hundred ticks: `orderFor(1)` has no VERDICT, because the premiere skips the reckoning
    // and everything after it, so the counter that ended an episode was never reached and the
    // show shot episode one forever. Closing an episode is a property of the QUEUE emptying, not
    // of any phase being played — see `closeEpisode`.
  };

  /** Has the current phase got everything it can use? Then it ends early — a party has no patience. */
  function closedEarly() {
    const alive = living();
    switch (state.phase) {
      case PHASE.CASTING:
        return alive.every((id) => pending.cast.has(id));
      case PHASE.EXPEDITION:
        return state.call.said != null && pending.acted.has(state.pair.runner);
      case PHASE.RECKONING:
        return reckoningClosed({ living: alive, nominations: state.nominations });
      case PHASE.VOTE:
        return alive.every((id) => pending.votes.has(id));
      default:
        return false;
    }
  }

  function advance(now) {
    onExit[state.phase]?.(now);
    if (!queue.length) {
      if (episodeOpen) { closeEpisode(); episodeOpen = false; }
      // The episode is over. Either the show is renewed and we shoot another, or it ends.
      if (state.outcome && state.outcome !== OUTCOME.RENEWED) return enter(PHASE.REUNION, SECONDS[PHASE.REUNION], now);
      if (state.episode > EPISODE_CAP) { state.outcome = OUTCOME.CANCELLED; return enter(PHASE.REUNION, SECONDS[PHASE.REUNION], now); }
      queue = orderFor(state.episode).slice();
      episodeOpen = true;
      state.tally = null;
    }
    const next = queue.shift();
    // EXECUTION is skipped outright when the vote executed nobody, rather than held for 20s on a
    // screen reading "nothing happens".
    if (next === PHASE.EXECUTION && !(state.tally && state.tally.executed)) return advance(now);
    const seconds = next === PHASE.RECKONING
      ? reckoningSeconds(state.nominations.length)
      : SECONDS[next];
    enter(next, seconds, now);
  }

  // ---------------------------------------------------------------- resolutions
  function resolveCasting() {
    const alive = living();
    // 🚨 A PHONE THAT NEVER TAPPED STILL CASTS A BALLOT, AND IT IS AN ABSTENTION RATHER THAN A
    // DEFAULT PICK. `tallyCasting` ignores null slots, so silence lowers no one's score — the
    // alternative (auto-voting for a neighbour) would let a dead battery decide who runs.
    const ballots = alive.map((id) => ({ voter: id, ...(pending.cast.get(id) || { runner: null, guide: null }) }));
    const cast = tallyCasting({
      ballots, living: alive, history: state.history,
      lastPair: state.lastPair, ep: state.episode, matchSeed: worldSeed,
    });
    state.pair = { runner: cast.runner, guide: cast.guide };
    for (const id of [cast.runner, cast.guide]) {
      state.history[id].expeditions++; state.history[id].lastEp = state.episode;
    }
    for (const s of sockets) {
      s.seatRole = s.playerId === cast.runner ? 'runner' : s.playerId === cast.guide ? 'guide' : null;
    }
    record(makeEvent('cast.ballot', VIS.PUBLIC, {
      episode: state.episode, runner: cast.runner, guide: cast.guide,
      tiebreaks: cast.tiebreaks, abstained: ballots.filter((b) => !b.runner && !b.guide).length,
    }));
    record(makeEvent('cast.pair', VIS.PUBLIC, { runner: cast.runner, guide: cast.guide }));
  }

  /**
   * 🚨 THE WHOLE MODE, IN ONE RESOLUTION. The guide says CLEAR or HOLD; the runner goes or waits.
   * A guide with no camera on the Hunter's room is GUESSING, and a guess is wrong half the time —
   * which is what makes a lie indistinguishable from an honest mistake and is the reason the
   * camera objective feeds the information system rather than sitting beside it.
   *
   * ⚠️ WAITING IS SAFE AND COSTS THE CAMERA. Without that, HOLD is strictly worse than GO and the
   * guide's word buys nothing; with it, a lying guide who says HOLD all game is starving the good
   * team of sight without ever being caught in a death.
   */
  function resolveExpedition() {
    const said = state.call.said;
    const move = pending.acted.has(state.pair.runner) ? pending.moveChoice : MOVE_CHOICE.WAIT;
    const hunterHere = hunterRoom === state.expedition.room;
    let outcome;

    if (move !== MOVE_CHOICE.GO) {
      outcome = 'held';
    } else if (hunterHere) {
      outcome = 'taken';
    } else {
      outcome = 'lit';
      state.cameras.unlocked += 1;
      record(makeEvent('run.camera_lit', VIS.PUBLIC, { camera: state.cameras.unlocked, episode: state.episode }));
    }
    state.expedition.outcome = outcome;

    // The call was wrong if it pointed the runner at the Hunter, or away from a clear room.
    const misled = (said === CALL.CLEAR && hunterHere) || (said === CALL.HOLD && !hunterHere);
    if (misled) {
      // T5: the failure event names a room and a loudness. It never names the culprit — the
      // closed schema in `events.js` makes that a construction error rather than a code review.
      record(makeEvent('task.miss', VIS.PUBLIC, {
        kind: 'call', room: state.expedition.room, phaseTick: state.tick, loudness: 0.62,
      }));
      state.incident.alarms += 1;
      // Attribution, sealed, in the same stream — so the Reunion needs no second source.
      record(makeEvent('noise.emitted', VIS.SEALED, {
        causedBy: state.pair.guide, loud: 0.62, room: state.expedition.room,
      }));
    }

    takenThisEpisode = [];
    if (outcome === 'taken') {
      const victim = state.players.find((p) => p.id === state.pair.runner);
      // S2. Contact is terminal in party mode and the limb count is not consulted.
      const r = resolveContact({ mode: MODE.PARTY, occupiedSockets: 0 });
      if (r.outcome === 'taken') {
        const { player, events } = applyTake(victim);
        Object.assign(victim, player);
        takenThisEpisode.push(victim.id);
        for (const e of events) record(makeEvent(e.type, e.vis, e.data));
      }
    }
    record(makeEvent('expedition.ended', VIS.PUBLIC, {
      outcome, said, move, room: state.expedition.room, episode: state.episode,
    }));
  }

  function resolveVote() {
    const alive = living();
    const votes = Object.fromEntries(alive.map((id) => [id, pending.votes.get(id) || NO_ONE]));
    const result = tallyVote({ living: alive, nominations: state.nominations }, votes);
    state.tally = result;
    // §4: the full vote record is AIRED, attributed. Who you voted for is the cheapest deduction
    // fuel in the game and hiding it would buy nothing.
    for (const [voter, choice] of Object.entries(votes)) {
      record(makeEvent('vote.cast', VIS.PUBLIC, { voter, choice }));
    }
    record(makeEvent('vote.tallied', VIS.PUBLIC, {
      counts: result.counts, executed: result.executed, threshold: result.threshold, abstained: result.abstained,
    }));
    if (result.executed) {
      const victim = state.players.find((p) => p.id === result.executed);
      const swinger = executioner({ living: alive, nominations: state.nominations }, result.executed, takenThisEpisode);
      const { player, events } = applyTake(victim);
      Object.assign(victim, player);
      record(makeEvent('player.executed', VIS.PUBLIC, { id: victim.id, seat: victim.seat, executioner: swinger }));
      for (const e of events.filter((x) => x.type !== 'player.taken')) record(makeEvent(e.type, e.vis, e.data));
    }
  }

  /** Fold the win machine over the log and roll the counter. Once per episode, premiere included. */
  function closeEpisode() {
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

  // ---------------------------------------------------------------- input
  /**
   * One tap from one phone. Returns `{ok}` or `{ok:false, why}` — the phone shows the reason
   * rather than the tap vanishing, because a controller that silently ignores you is a
   * controller people stop trusting halfway through the evening.
   */
  function input(playerId, msg) {
    const p = state.players.find((x) => x.id === playerId);
    if (!p) return { ok: false, why: 'not in this show' };
    // 🚨 THE DEAD DO NOT ACT — INCLUDING PUBLISHING A CLAIM, WHICH THIS LET THROUGH AT FIRST.
    // `taken.js`'s `afterlife()` is unambiguous: chat only, no vote, no mansion. A claim is a
    // game action with a plate on the table, not speech; letting an evicted player lay one would
    // hand the dead a move in a game they are out of.
    if (!p.alive) return { ok: false, why: 'evicted players do not act' };
    const alive = living();

    switch (msg.t) {
      case 'cast': {
        if (state.phase !== PHASE.CASTING) return { ok: false, why: 'casting is closed' };
        const r = alive.includes(msg.runner) ? msg.runner : null;
        const g = alive.includes(msg.guide) && msg.guide !== msg.runner ? msg.guide : null;
        pending.cast.set(playerId, { runner: r, guide: g });
        if (r && g) pending.acted.add(playerId);
        broadcast();
        return { ok: true };
      }
      case 'claim': {
        // 🚨 A CLAIM IS PUBLISHED, AND PUBLISHING IS ONE-WAY. `players[].claim` is rowed `all`
        // precisely because only published claims reach it; a draft lives on the evil panel and
        // nowhere else. Letting a claim be retracted would make the plate meaningless.
        if (p.plate === PLATE.PUBLISHED) return { ok: false, why: 'a published claim stands' };
        if (typeof msg.claim !== 'string' || !msg.claim) return { ok: false, why: 'no claim given' };
        p.claim = msg.claim.slice(0, 24);
        p.plate = PLATE.PUBLISHED;
        record(makeEvent('player.claim_set', VIS.PUBLIC, { id: playerId, claim: p.claim }));
        broadcast();
        return { ok: true };
      }
      case 'call': {
        if (state.phase !== PHASE.EXPEDITION) return { ok: false, why: 'not on an expedition' };
        if (playerId !== state.pair.guide) return { ok: false, why: 'only the guide calls it' };
        if (state.call.said) return { ok: false, why: 'you have already called it' };
        if (msg.call !== CALL.CLEAR && msg.call !== CALL.HOLD) return { ok: false, why: 'CLEAR or HOLD' };
        state.call.said = msg.call;
        pending.acted.add(playerId);
        // The table hears the guide speak; the log records what they said, publicly and
        // attributably. DEBRIEF has nothing to chew on otherwise.
        record(makeEvent('call.made', VIS.PUBLIC, { by: playerId, said: msg.call, episode: state.episode }));
        broadcast();
        return { ok: true };
      }
      case 'move': {
        if (state.phase !== PHASE.EXPEDITION) return { ok: false, why: 'not on an expedition' };
        if (playerId !== state.pair.runner) return { ok: false, why: 'only the runner moves' };
        if (!state.call.said) return { ok: false, why: 'wait for your guide' };
        if (msg.move !== MOVE_CHOICE.GO && msg.move !== MOVE_CHOICE.WAIT) return { ok: false, why: 'GO or WAIT' };
        pending.moveChoice = msg.move;
        pending.acted.add(playerId);
        broadcast();
        return { ok: true };
      }
      case 'nominate': {
        if (state.phase !== PHASE.RECKONING) return { ok: false, why: 'the reckoning is closed' };
        const n = proposeNomination({ living: alive, nominations: state.nominations }, playerId, msg.target);
        if (!n.ok) return n;
        state.nominations.push(n.nomination);
        pending.acted.add(playerId);
        record(makeEvent('nom.made', VIS.PUBLIC, n.nomination));
        // Every nomination buys the table 15 more seconds to argue, capped at 90.
        state.clock.seconds = reckoningSeconds(state.nominations.length);
        broadcast();
        return { ok: true };
      }
      case 'vote': {
        if (state.phase !== PHASE.VOTE) return { ok: false, why: 'the vote is closed' };
        const standing = state.nominations.map((n) => n.target);
        if (msg.choice !== NO_ONE && !standing.includes(msg.choice)) return { ok: false, why: 'not on the block' };
        // ⚠️ A VOTE MAY BE CHANGED UNTIL THE PHASE CLOSES AND IS NOT AIRED UNTIL THEN. Airing it
        // live would make the last voter decisive and turn a simultaneous ballot into a queue.
        pending.votes.set(playerId, msg.choice);
        pending.acted.add(playerId);
        broadcast();
        return { ok: true };
      }
      default:
        return { ok: false, why: `unknown input "${msg.t}"` };
    }
  }

  return {
    sockets, deal, log, state,
    replayFor: (sock) => log.replayFor({ playerId: sock.playerId, alignment: sock.alignment, isTV: sock.isTV }),

    /**
     * Re-send the current frame to one socket, or to all of them.
     *
     * 🚨 THIS IS A RE-PROJECTION, NOT A SNAPSHOT, AND THE DIFFERENCE IS THE WHOLE GAME. A phone
     * that reconnects mid-episode is handed exactly what a phone that never left would be holding
     * — same `project()`, same ctx, same matrix. `net/server.mjs` L335-336 hands a joiner every
     * peer's state instead, which is the bug this signature exists to make hard to write.
     */
    refresh(socketId = null) {
      if (socketId == null) return broadcast();
      const sock = sockets.find((s) => s.id === socketId);
      if (sock) pushTo(sock);
    },
    socketFor: (playerId) => socketOf.get(playerId),
    input,

    /** Open the show. PREMIERE deals the cards and gives everyone time to read them. */
    start(now) {
      if (state.phase !== LOBBY) return { ok: false, why: 'already started' };
      record(makeEvent('cast.deal', VIS.SEALED, {
        seats: deal.seats.map((s) => ({ id: s.id, role: s.role, alignment: s.alignment, cover: s.cover ?? null })),
      }));
      for (const s of deal.seats) {
        // The card shows what the player BELIEVES, derived from `viewFor` rather than restated —
        // the Glitched must not be told they are the Glitched. `reunion-truth` U2 caught that once.
        record({ ...makeEvent('role.card', VIS.SELF, { role: viewFor(deal, s.id).you.role }), for: s.id });
        if (s.alignment === EVIL) {
          record({
            ...makeEvent('production.panel', VIS.EVIL, {
              teammates: deal.seats.filter((o) => o.alignment === EVIL && o.id !== s.id).map((o) => ({ id: o.id, role: o.role })),
            }), for: s.id,
          });
        }
      }
      queue = [];
      enter(PHASE.PREMIERE, SECONDS[PHASE.PREMIERE], now);
      return { ok: true };
    },

    /**
     * Advance the clock. Idempotent for a `now` that has not passed a deadline, so the server may
     * call it as often as it likes.
     */
    tick(now) {
      if (state.phase === LOBBY || state.phase === PHASE.REUNION) return false;
      if (now >= state.clock.endsAt || closedEarly()) { advance(now); return true; }
      return false;
    },

    /** The host's skip. Only ever shortens a phase — it can never resolve one differently. */
    skip(now) {
      if (state.phase === LOBBY || state.phase === PHASE.REUNION) return { ok: false, why: 'nothing to skip' };
      advance(now);
      return { ok: true };
    },

    secondsLeft: (now) => Math.max(0, Math.ceil((state.clock.endsAt - now) / 1000)),
    /** Ground truth. Belongs to the gate and the Reunion. Never to a socket. */
    truth: () => ({ seats: deal.seats.map((s) => ({ ...s })), evil: deal.evil.slice(), castSeed, hunterRoom }),
  };
}
