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
import { ROOMS, hunterVisibleToGuide, camerasLive } from './coverage.js';
import { guideSight } from './darkrun.js';
import { HOUSE, WINGS } from './houseplan.js';
import { applyTake, applyEviction, resolveContact, MODE, PLATE } from './taken.js';
import { cardFor } from './roles.js';
import { tallyCasting, refuse as refuseChair } from './ballot.js';
import { tallyVote, executioner, nominate as proposeNomination, reckoningClosed, NO_ONE } from './vote.js';
import { foldWin, OUTCOME } from './win.js';
import { PHASE, SECONDS, orderFor, reckoningSeconds, EPISODE_CAP } from './phases.js';

export const LOBBY = 'LOBBY';

/** What a phone may send, and when. Anything else is refused with a reason the phone can show. */
/**
 * ⚠️ `refuse` WAS MISSING FROM THIS LIST AND THAT IS THE WHOLE OF WHY REFUSAL DID NOT EXIST.
 * `ballot.js:87 refuse()` has been implemented, gated (`cast-ballot` B7) and unreachable since it
 * was written: no `case 'refuse'` below, no row in this array, so the one move round §2 gives a
 * player who is handed a chair they do not want was a function nobody could call.
 */
export const INPUT = ['cast', 'claim', 'call', 'move', 'nominate', 'refuse', 'vote'];

/** The expedition's two answers, and the two the pair give. */
export const CALL = { CLEAR: 'CLEAR', HOLD: 'HOLD' };
export const MOVE_CHOICE = { GO: 'GO', WAIT: 'WAIT' };

/**
 * Deterministic, seeded, no `Math.random` — `run.js`'s discipline, restated nowhere.
 *
 * ⚠️ EXPORTED FOR THE GATE'S CONTROLS AND FOR NOTHING ELSE. `hunter-draw` has to rebuild the two
 * draws this file used to ship — `hash(...) % n` and `(hash(...) >>> 8) % n` — and run the live
 * predicates over them. Rebuilding the mixer as well would mean the control drifts the moment
 * anybody touches this function, and a control that no longer matches the code it is standing in
 * for is not a control. Only the part that no longer exists is rebuilt; the part that still
 * exists is imported. Nothing in `src/party` or `net/party` calls this — see D8.
 */
export function hash(...parts) {
  let h = 0x811c9dc5 >>> 0;
  const s = parts.join(':');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/**
 * 🚨 **EVERY SEEDED DRAW IN THIS FILE GOES THROUGH HERE. THE FINALIZER IS THE WHOLE REASON THE
 * FUNCTION EXISTS, AND `>>> 8` — WHICH IS WHAT USED TO BE HERE — WAS ONLY HALF OF IT.**
 *
 * FNV-1a's low bit is XOR-linear. The prime `0x01000193` is odd, so multiplication never touches
 * bit 0, and every step is `h ^= c` — which makes the final bit 0 a plain XOR of the basis bit
 * and the low bit of every character of the key. Two keys that share everything but the salt
 * therefore differ in bit 0 **iff** their salts differ in character parity, deterministically,
 * for every seed and every episode.
 *
 * The expedition drew its wing from `hash(worldSeed,'target',ep) % 6` and the Hunter's room from
 * `hash(worldSeed,'hunter',ep) % 6`. `'target'` and `'hunter'` have opposite character parity and
 * 6 is even, so index parity followed hash parity and **the two rooms could never be equal**:
 * measured, 0 collisions in 30,000 draws. `hunterHere` was a constant false, the take was dead
 * code, and `misled` collapsed to `said === HOLD` — a CLEAR call right 100% of the time in every
 * game ever played.
 *
 * ⚠️ **A DIFFERENT SALT IS NOT THE FIX AND MEASURING ONE IS HOW YOU FIND THAT OUT.** A salt with
 * the SAME parity as `'target'` collides ~33% — exactly double the ideal 16.7% — because bit 0 is
 * fully determined either way, so the effective room space is 3 rather than 6. Both failures are
 * the same failure.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 **AND `>>> 8` FIXED THE SALT AXIS AND LEFT THE EPISODE AXIS WIDE OPEN.**
 * ---------------------------------------------------------------------------------------------
 * `episode` is the LAST component of the key, so exactly one FNV round follows it:
 * `h = (h_prefix ^ digit) * PRIME`. Consecutive episodes therefore differ by a small multiple of
 * `PRIME` — a span of about 8 across a match — and a plain shift-and-divide inherits that whole,
 * because shifting off eight low bits does not destroy an additive offset in the high ones.
 *
 * Measured over 1,000,000 uniform seeds, the distribution of `wing(ep+1) - wing(ep) mod 6`:
 *
 * ```
 *   shipped `>>> 8`     29.02%  28.46%   7.03%   0.00%   7.04%  28.46%
 *   with the finalizer  16.65%  16.64%  16.72%  16.67%  16.68%  16.63%
 * ```
 *
 * The wing could **never** move by exactly three rooms — zero in a million — and it stood still or
 * moved by one 86% of the time. Downstream: the SEALED Hunter room was recoverable from the
 * PUBLIC wing sequence at 32.4% against a 16.7% baseline; `wall` was a 72%-sticky two-state
 * process rather than a per-episode coin, which is a direct attack on bible D13's premise that
 * nobody but the guide knows how much they could see; and `prowl`'s loudness never repeated
 * between consecutive episodes.
 *
 * So the hash is run through murmur3's finalizer — two multiply-xorshift rounds — before the
 * modulus. That is an avalanche step: it makes every output bit depend on every input bit, which
 * is exactly what turns `+k·PRIME` from a visible offset into noise. It costs four instructions
 * and it is the difference between a seeded draw and a seeded pattern.
 *
 * `pick` is the ONLY draw in this file — no caller reaches `hash` directly — so no salt and no key
 * ordering anybody adds later can bring either coupling back. `hunter-draw` D8 asserts that
 * single-entry property on the source; D9-D12 assert the serial axis on the exported function,
 * with the shipped `>>> 8` standing as their control.
 *
 * ⚠️ EXPORTED FOR THE GATE, AND FOR NOBODY ELSE. `hunter-draw` needs millions of draws to see a
 * distribution and cannot get them by playing millions of shows — but a gate that re-implemented
 * the draw would be measuring its own copy, which is the failure `wire-parity`'s header names.
 * D9's arm reconciles this export against wings read out of real `createSession` logs, so the
 * thing being measured is provably the thing that ships.
 *
 * @param {number} n     how many slots
 * @returns {number}     an index in `[0, n)`
 */
export const pick = (n, ...parts) => {
  let h = hash(...parts);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) % n;
};

/**
 * ⚠️ THE GUIDE'S TILT IS THE SHIPPED ONE. 62° is `views/game.js`'s flyover elevation, and at the
 * 4.80m storey it hides 2.55m of floor behind every wall — which is exactly where a stationary
 * Hunter stands. It is not a difficulty knob; changing it changes how often an HONEST guide is
 * wrong, which is the number T3 bands.
 */
export const GUIDE_TILT_DEG = 62;
export const STOREY_H = 4.80;

/**
 * 🚨 **THE INCIDENT COUNT IS PHYSICS, NOT A VERDICT ON THE GUIDE — AND IT WAS THE OTHER THING
 * ONCE, WHICH DELETED THE GAME.**
 *
 * `incident.alarms` used to increment in exactly one place: when the guide's call turned out to
 * be wrong. It is rowed `all` (`entitle.js`) and printed permanently in the corner of the
 * television, so the number WAS a public read-out of whether the guide had lied — or,
 * indistinguishably, been honestly wrong. Either way the deniable HOLD this file's own comment
 * calls uncatchable was catchable by arithmetic, from the sofa, by anyone watching the corner of
 * the screen. The anonymity gates could not see it: `events.js`'s closed schema and `party-anon`
 * A1-A4 check the SHAPE of attribution, and a perfectly anonymous number can still be a perfect
 * index of one player's honesty.
 *
 * So the counter counts what round §4 says it counts — *"over this episode's log: `noise.emitted`
 * with `loud ≥ INCIDENT_LOUD`"* — across every source that makes a noise: the runner's throttle,
 * the Hunter's own prowling, and the guide's blunder. A delta of 1 is now consistent with three
 * different histories and a delta of 2 with three more, which is the property `party-anon` A8
 * asserts and the property the mode is built on. Bible §5.6: *"a number, with no attribution ...
 * nobody knows which were malice."*
 *
 * ⚠️ THE SEALED ATTRIBUTION IS UNCHANGED AND MUST STAY THAT WAY. Every emission below still
 * records `causedBy` on a `VIS.SEALED` `noise.emitted`, in the same stream, so the Reunion's
 * *Loudest Robot* needs no second source. Public count, sealed cause — one mechanism.
 */
export const INCIDENT_LOUD = 0.60;

/** The guide's wrong call, in gunshots. `noiseplan.js`'s ruler: 0.62 carries 8.7 m. */
export const MISS_LOUD = 0.62;

/** STILL / CREEP / WALK / RUN, in `player.js`'s own units — `noise = speed / MOVE.run`. */
export const THROTTLE = Object.freeze([0, 0.17, 0.49, 1.00]);

/** The house on its own: four draws either side of the threshold, so the world is genuinely noisy. */
export const PROWL = Object.freeze([0.20, 0.45, 0.62, 1.10]);

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
      // `refused` is here from frame one and false, for the same reason `taken` is: a frame that
      // grows a field the moment somebody uses their once-per-game move has announced it twice.
      alive: true, taken: false, refused: false, claim: null, plate: PLATE.UNDECLARED,
    })),
    pair: { runner: null, guide: null },
    lastPair: { runner: null, guide: null },
    history: Object.fromEntries(deal.seats.map((s) => [s.id, { expeditions: 0, lastEp: null }])),
    nominations: [],
    tally: null,
    call: { by: null, said: null },
    expedition: { room: null, outcome: null },
    outcome: null,
    // 🚨 `unlocked` COUNTS WHAT THE CREW HAS LIT, FROM ZERO — the same thing `win.js` folds, so
    // the scoreboard and the win machine are reading one number. It was seeded at 1 (the
    // establishing camera) and compared against a target counted from 0, which is why the
    // television read 3/3 with every pip lit at episode two of a game that ran on to 5/3. The
    // establishing camera has not gone anywhere: it lives in `coverage.js`'s `camerasLive`,
    // where it belongs, because it is a coverage fact and not an objective one.
    cameras: { unlocked: 0, needed: deal.cameras },
    incident: { alarms: 0 },
    clock: { seconds: 0, endsAt: 0 },
  };

  // Per-phase input buckets. Cleared on every transition, so a stale tap can never carry over.
  let pending = { cast: new Map(), votes: new Map(), acted: new Set() };
  /** The Hunter's room. Never rowed in the matrix, never sent to anyone. */
  let hunterRoom = null;
  /**
   * 🛰️ WHAT THE TELEVISION IS SIMULATING, WHEN THERE IS ONE.
   *
   * Null means M3's stub — no mansion attached, the expedition resolves from a seeded room
   * comparison, and every gate that predates the wiring still runs. Non-null means a real robot
   * in a real house, and the numbers below are the only things this process takes from that
   * screen: positions, a room, a distance from a wall. **No verdict, and no identity.** The TV
   * is authoritative about where a robot is and knows nothing about what a robot is.
   */
  let sim = null;
  let reported = null;              // the outcome the house produced, if it has produced one
  // Whether the guide's flyover was actually showing them the Hunter at the instant they called
  // it. Snapshotted at the call, aired at RECAP, and null when no call was made. See
  // `onEnter[PHASE.RECAP]` for why this is a boolean and not the Hunter's room.
  let callSight = null;
  let takenThisEpisode = [];
  /**
   * This episode's ballots, kept so `refuse()` can re-tally the slot from the SAME votes rather
   * than from a fresh election. Deliberately not in `state`: a per-voter ballot list on a frame
   * would air the sealed half of §2 ("ballots are sealed until the bell") to every phone.
   */
  let lastBallots = [];
  /** What each chair's holder looked like BEFORE casting incremented them, so a refusal can undo it. */
  let castUndo = new Map();
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

  /**
   * One physical noise, on the record. The cause is SEALED and the COUNT is public — §4, and the
   * whole of T5 in one function. Every increment of `incident.alarms` in this file goes through
   * here, so no future caller can quietly make the counter mean something else again.
   */
  function emitNoise({ loud, room, causedBy = null, sourceType }) {
    record(makeEvent('noise.emitted', VIS.SEALED, { causedBy, loud, room, sourceType }));
    // §4 excludes `PICK` — the lock work itself is the job, and a job nobody can do quietly is
    // not deduction fuel. Everything else that clears the threshold is an incident.
    if (loud >= INCIDENT_LOUD && sourceType !== 'PICK') state.incident.alarms += 1;
  }

  function fullFor(sock) {
    const base = {
      phase: state.phase, tick: state.tick, episode: state.episode,
      clock: { ...state.clock },
      players: state.players.map((p) => ({ ...p })),
      pair: { ...state.pair },
      cameras: { ...state.cameras },
      incident: { ...state.incident },
      nominations: state.nominations.map((n) => ({ ...n })),
      // §6.9: whether the guide has spoken is public; WHAT they said is theirs and the room's,
      // out loud. `call.said` is rowed `guide`, so it survives projection onto one phone only.
      call: { made: state.call.said != null, said: state.call.said },
      expedition: { ...state.expedition, live: sim != null },
    };
    if (state.tally) base.tally = { counts: { ...state.tally.counts }, threshold: state.tally.threshold, executed: state.tally.executed };
    // 🚨 CONDITIONAL FOR THE SAME REASON `tally` IS. The attributed casting ballot is aired on
    // CLOSE — `resolveCasting` runs on EXIT from CASTING — so the field must not exist while the
    // ballot is being filled in, or the television is a live tally and the last voter is
    // decisive. Absence here, not a matrix row, is what enforces that: `ballots[].*` is rowed
    // `all`, and `expedition-wire` E11 reads real frames rather than trusting either.
    if (state.ballots && state.ballots.length) base.ballots = state.ballots.map((b) => ({ ...b }));
    if (!sock.isTV) {
      base.you = { ...viewFor(deal, sock.playerId).you, acted: pending.acted.has(sock.playerId), ...card(sock.playerId) };
    }
    // 🚨 S3. The Hunter is on the guide's map only where a live camera watches AND the wall does
    // not hide it. Two independent honest-error sources, compounded — `darkrun.js`'s header.
    if (sock.seatRole === 'guide' && state.phase === PHASE.EXPEDITION) {
      base.flyover = sightForGuide();
    }
    return base;
  }

  /**
   * 🚨 **WHAT THE ROLE CARD SAYS, AND IT USED TO SAY `focusPuller`.**
   *
   * `you.role` is an object key — `focusPuller`, `theStatic`, `methodActor` — and the phone
   * rendered it raw, so a player read a variable name off their own card. Meanwhile `roles.js`'s
   * `SCRIPT` has carried a display name and a one-line ability for every card since it was
   * written and was imported exactly once in the whole product tree, in `reunion.js`, where the
   * import was unused. No matrix row carried the line, so after reading their card a first-time
   * player knew their team and nothing else, and all seven good cards said the identical thing.
   *
   * ⚠️ IT IS DERIVED FROM `viewFor`'s ANSWER, NEVER FROM THE DEAL. The Glitched is dealt a COVER
   * and is *"not told this"* — so they get the cover's name and the cover's line, in full, and
   * nothing on their phone can tell them apart from the real thing. Reading `deal.seats` here
   * instead would be the two-channel bug `reunion-truth` U2 caught, rebuilt one field along.
   *
   * ⚠️ AND IT IS `self`, WHICH IS THE WHOLE OF WHY IT IS TWO ROWS RATHER THAN ONE. A line that
   * says *"each episode, learn whether the Hunter noticed the runner by sight or by sound"* names
   * a role as surely as the key does; on anyone else's frame it is an alignment tell.
   *
   * ⚠️ A CARD WHOSE HOLDER IS NOT `selfAware` CARRIES NO LINE — `roles.js`'s `cardFor` owns that
   * rule and says why. The Static's line is the one thing their card exists to withhold.
   *
   * ⚠️ THIS IS THE CARD SAYING WHAT THE ROLE ALREADY IS. Nothing here makes an ability fire.
   */
  function card(playerId) {
    const { name, line } = cardFor(viewFor(deal, playerId).you.role);
    return { roleName: name, roleLine: line };
  }

  /** What the guide's screen shows, and the only place the Hunter's room can escape into a frame. */
  function sightForGuide() {
    // 🚨 THE ROOM AND THE DISTANCE COME FROM THE HOUSE WHEN THERE IS ONE, AND THE VERDICT NEVER
    // DOES. `guideSight` is `darkrun.js`'s and stays the single authority on what a guide can
    // see; all the mansion supplies is geometry it is the only thing in a position to know.
    const room = sim ? sim.hunter.room : hunterRoom;
    const covered = hunterVisibleToGuide({ worldSeed, unlocked: camerasLive(state.cameras.unlocked), hunterRoom: room });
    const wallDistance = sim
      ? sim.hunter.wallDist
      // No mansion: the same distribution over the same blind strip, seeded per episode.
      : pick(800, worldSeed, 'wall', state.episode) / 100;
    const sight = guideSight({ covered, wallDistance, tiltDeg: GUIDE_TILT_DEG, storeyH: STOREY_H });
    const marks = sim
      ? [{ x: sim.runner.x, z: sim.runner.z, kind: 'you' }]
      : [{ x: 1.5, z: -2.0, kind: 'you' }];
    if (sight.seen) marks.push(sim ? { x: sim.hunter.x, z: sim.hunter.z, kind: 'hunter' } : { x: 7.0, z: 3.0, kind: 'hunter' });
    // The plan travels with the marks so the guide's phone needs no second fetch and no copy of
    // its own — one message, one source, and it arrives only for a socket entitled to marks.
    return { hunter: sight.seen, room: sight.seen ? room : null, marks, plan: HOUSE.map((r) => ({ ...r })) };
  }

  /**
   * ⚠️ NO `ownerId`, AND ITS ABSENCE IS THE POINT. This used to pass `ownerId: sock.playerId`,
   * which is the socket naming itself the owner of whatever it is handed — a tautology that made
   * `self` mean *"not the television"* and left the whole `you.*` block of the matrix inert.
   * `project()` reads the owner off the frame's own `you.id` now, so the data says whose panel it
   * is and this function cannot claim otherwise. `entitled`'s header has the full story.
   */
  const ctxFor = (sock) => ({
    playerId: sock.playerId, alignment: sock.alignment, isTV: sock.isTV, seatRole: sock.seatRole,
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
    /**
     * 🚨 **THE WING IS DRAWN FROM `WINGS`, NOT FROM `ROOMS`, AND THE DIFFERENCE IS ONE EPISODE IN
     * SIX.** `ROOMS` is every room in the house; the chapel is in it and has no open connector, so
     * a sixth of all expeditions announced an objective the runner cannot walk to — measured, 40
     * of 40 chapel runs ended `held` with the robot parked ~4 m short against the gallery wall,
     * and `resolveExpedition` graded every one of them as a hold the guide earned.
     *
     * ⚠️ `WINGS` IS DERIVED FROM THE HOUSE'S CONNECTIVITY BY SEARCH, NOT A LIST WITH THE CHAPEL
     * TAKEN OUT OF IT — see `houseplan.js`, and `wing-draw` W1/W2 for the pin to the built house.
     * A generated plan with a different dead end is answered by the same BFS.
     */
    [PHASE.CASTING]: () => {
      state.expedition = { room: WINGS[pick(WINGS.length, worldSeed, 'target', state.episode)], outcome: null };
      state.call = { by: null, said: null };
      state.ballots = [];               // last episode's slate is not this episode's
      record(makeEvent('expedition.announced', VIS.PUBLIC, { room: state.expedition.room, episode: state.episode }));
    },
    [PHASE.EXPEDITION]: () => {
      // Seeded per episode so a replay of the same match is the same match. The Hunter is placed
      // only now — the wing is public from CASTING, but where the Hunter stands never is.
      hunterRoom = ROOMS[pick(ROOMS.length, worldSeed, 'hunter', state.episode)];
      sim = null; reported = null;      // last episode's house is not this episode's
      callSight = null;                 // no call has been made yet this episode
      const target = state.expedition.room;
      state.call = { by: state.pair.guide, said: null };
      record(makeEvent('expedition.begun', VIS.PUBLIC, {
        runner: state.pair.runner, guide: state.pair.guide, room: target, episode: state.episode,
      }));
      // Attribution exists from the first episode and is sealed until the Reunion.
      record(makeEvent('hunter.placed', VIS.SEALED, { room: hunterRoom, episode: state.episode }));
    },
    /**
     * 🚨 **THE RECAP MAKES THE GUIDE ACCOUNTABLE WITHOUT MAKING THEM CONVICTABLE.** The vote was
     * measured at +2.1 percentage points over guessing (n = 14,064) and it does not improve
     * across episodes, because nothing a guide does is ever checked. A guide calls CLEAR, the
     * runner is taken, and the room has no way to tell an unlucky guide from a lying one — so it
     * votes on personality, which is a coin.
     *
     * Two booleans fix that, and they are chosen to be the two that make the guide's call
     * EVIDENCE rather than a verdict:
     *
     *   `guideSaw`    — was the flyover actually showing them the Hunter when they spoke?
     *   `hunterHere`  — was the Hunter in the wing the expedition entered?
     *
     * A guide who was blind and called it wrong is unlucky. A guide who could SEE and called it
     * wrong is doing something else. That distinction is the whole honest-error mechanic —
     * `GUIDE_TILT_DEG` 62° and its 2.55 m blind strip, `ghost()`'s decaying last-known — finally
     * made legible to the eight people who are supposed to argue about it.
     *
     * 🚨 **AND IT IS DELIBERATELY NOT `hunter.placed`.** `docs/rrr-open-findings.md` proposed
     * revealing that event at RECAP and called it "one `VIS` constant". It is not, twice over:
     *
     *   1. `hunter.placed` is recorded on ENTRY TO EXPEDITION. Re-rowing it `PUBLIC` publishes
     *      the Hunter's room BEFORE the ninety seconds run — the guide's entire job evaporates
     *      and the runner walks around one room. The reveal has to be a second event, which is
     *      the same shape `call.made`/`call.said` already uses a few lines down.
     *   2. The room is `pick(ROOMS.length, worldSeed, 'hunter', episode)`. Airing it for five
     *      episodes hands anyone with devtools five (episode → room) pairs to brute-force a
     *      32-bit `worldSeed` against, and with it every FUTURE placement. That is Fatal #5 —
     *      the `/report` castSeed leak — rebuilt one field along, and `party-isolation` I11
     *      exists precisely to catch this class. Two booleans leak 2 bits an episode instead of
     *      log2(6); the reveal is strictly less information than the finding asked for and
     *      strictly more than the room currently has.
     *
     * ⚠️ THE SEALED EVENT IS UNTOUCHED. `hunter.placed` still carries the room to the Reunion,
     * where `log.reunion()` is `log.all()` and everything comes out. This is a delayed partial
     * reveal, not a deletion — and not a second channel for the same fact, because a boolean
     * about sight is not the room.
     *
     * ⚠️ `guideSaw` IS null WHEN NO CALL WAS MADE, and that is not the same as `false`. A guide
     * who never spoke has nothing to be accountable for; printing "could not see" for them would
     * invent an alibi the game never gave them.
     */
    [PHASE.RECAP]: () => {
      state.expedition.guideSaw = callSight;
      state.expedition.hunterHere = hunterRoom != null && hunterRoom === state.expedition.room;
      record(makeEvent('recap.aired', VIS.PUBLIC, {
        episode: state.episode,
        guideSaw: state.expedition.guideSaw,
        hunterHere: state.expedition.hunterHere,
      }));
    },
    /**
     * 🚨 THE RECKONING SIZES ITSELF, AND IT USED TO BE SIZED BY THE PREVIOUS EPISODE. `advance`
     * computed `reckoningSeconds(state.nominations.length)` and passed it to `enter`, which then
     * ran this function and cleared the list — so the number was always read from the episode
     * before. It is set here, after the clear, where the only list in scope is this episode's
     * and is empty by definition. `SECONDS[RECKONING]` is `reckoningSeconds(0)`; the stretch is
     * bought a nomination at a time, in `input`.
     */
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
    // Every phase opens at its own floor. The reckoning's stretch is bought during the phase —
    // see `input`'s `nominate` — rather than predicted before it starts from a list that belongs
    // to the episode before.
    enter(next, SECONDS[next], now);
  }

  // ---------------------------------------------------------------- resolutions
  /** Point every socket's `seatRole` at the current pair. The only writer of that field. */
  function seatTheCrew() {
    for (const s of sockets) {
      s.seatRole = s.playerId === state.pair.runner ? 'runner'
        : s.playerId === state.pair.guide ? 'guide' : null;
    }
  }

  function resolveCasting() {
    const alive = living();
    // 🚨 A PHONE THAT NEVER TAPPED STILL CASTS A BALLOT, AND IT IS AN ABSTENTION RATHER THAN A
    // DEFAULT PICK. `tallyCasting` ignores null slots, so silence lowers no one's score — the
    // alternative (auto-voting for a neighbour) would let a dead battery decide who runs.
    const ballots = alive.map((id) => ({ voter: id, ...(pending.cast.get(id) || { runner: null, guide: null }) }));
    lastBallots = ballots;
    const cast = tallyCasting({
      ballots, living: alive, history: state.history,
      lastPair: state.lastPair, ep: state.episode, matchSeed: worldSeed,
    });
    state.pair = { runner: cast.runner, guide: cast.guide };
    castUndo = new Map();
    for (const id of [cast.runner, cast.guide]) {
      castUndo.set(id, { ...state.history[id] });
      state.history[id].expeditions++; state.history[id].lastEp = state.episode;
    }
    seatTheCrew();
    /**
     * 🚨 **THE BALLOT IS READ ALOUD, ATTRIBUTED, AND IT USED TO BE A HEADCOUNT.** This event
     * carried the WINNERS and an abstention tally — the outcome of a vote with the vote removed.
     * `rrr-paper-prototype.md` §2 writes the rule in its own words: *"Read every ballot aloud,
     * attributed."* It was specced, and what shipped was the result.
     *
     * That mattered most in episode 1, which `orderFor` stops after DEBRIEF: no reckoning, no
     * vote, no execution. Episode 1's job is to teach the loop, and it did that while producing
     * no evidence whatsoever — eight people spent 230 seconds and learned one outcome. Who you
     * sent, who you refused, and who put themselves forward to guide is a public record from the
     * first minute, and it is the only record episode 1 can leave behind.
     *
     * ⚠️ IT IS AIRED ON CLOSE, NEVER DURING — the same rule `tally` follows a few hundred lines
     * down. `resolveCasting` runs on EXIT from CASTING, so no phone can watch the ballot build
     * and no last voter is decisive.
     *
     * ⚠️ A NULL SLOT IS AN ABSTENTION AND STAYS DISTINGUISHABLE FROM A PICK. `abstained` is kept
     * as well as the ballots, because a room reading a list wants the count without doing
     * arithmetic, and because a phone with a dead battery should be visibly silent rather than
     * absent from the list.
     */
    record(makeEvent('cast.ballot', VIS.PUBLIC, {
      episode: state.episode, runner: cast.runner, guide: cast.guide,
      tiebreaks: cast.tiebreaks, abstained: ballots.filter((b) => !b.runner && !b.guide).length,
      ballots: ballots.map((b) => ({ voter: b.voter, runner: b.runner, guide: b.guide })),
    }));
    // The attributed record, on the frame, for the DEBRIEF to argue from. Cleared on the next
    // CASTING entry so the board never shows last episode's slate beside this episode's pair.
    state.ballots = ballots.map((b) => ({ voter: b.voter, runner: b.runner, guide: b.guide }));
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
    // 🚨 WHERE THE HUNTER WAS IS THE HOUSE'S ANSWER WHEN THERE IS A HOUSE. Without this the
    // server would grade the episode against a room it invented while the television showed
    // something else — and the DEBRIEF argument would be about a game nobody played.
    const hunterHere = (sim ? sim.hunter.room : hunterRoom) === state.expedition.room;
    let outcome;

    // A wired expedition is decided by what happened in the mansion: contact, the terminal, or
    // the clock. A stubbed one is decided by the room comparison M3 shipped.
    if (reported) {
      outcome = reported;
    } else if (move !== MOVE_CHOICE.GO) {
      outcome = 'held';
    } else if (hunterHere) {
      outcome = 'taken';
    } else {
      outcome = 'lit';
    }
    if (outcome === 'lit') {
      state.cameras.unlocked += 1;
      record(makeEvent('run.camera_lit', VIS.PUBLIC, { camera: state.cameras.unlocked, episode: state.episode }));
    }
    state.expedition.outcome = outcome;

    // ---- the noise bus. Three sources, and the counter cannot tell them apart. See INCIDENT_LOUD.
    //
    // 🚨 THE RUNNER'S OWN THROTTLE IS THE FIRST SOURCE, AND UNDER D13 IT IS THE ONLY MOVE AN EVIL
    // RUNNER HAS. `player.js:638` is `noise = speed / MOVE.run`, so RUN is 1.0 and an incident,
    // WALK is 0.49 and is not — choosing RUN while the Hunter is close is loud, on television, and
    // completely deniable as panic. With a mansion attached the number is the one the house
    // measured; without one the throttle was never on screen, so it is drawn from the same four
    // detents, seeded per episode.
    const runnerLoud = sim ? sim.runner.noise
      : move === MOVE_CHOICE.GO ? THROTTLE[1 + pick(3, worldSeed, 'throttle', state.episode)]
        : THROTTLE[pick(2, worldSeed, 'throttle', state.episode)];
    emitNoise({ loud: runnerLoud, room: state.expedition.room, causedBy: state.pair.runner, sourceType: 'SPRINT' });

    // 🚨 THE SECOND SOURCE IS NOBODY'S, AND THAT ROW IS MANDATORY. Bible §6.1 marks *idle
    // curiosity* "low, **random**", non-negotiable, and P5 says it plainly: *"if every incident
    // traced to a player, we'd have no game."* The Hunter wanders and investigates empty rooms on
    // its own schedule, and it is heard doing it.
    emitNoise({
      loud: PROWL[pick(PROWL.length, worldSeed, 'prowl', state.episode)],
      room: sim ? sim.hunter.room : hunterRoom, causedBy: null, sourceType: 'PROWL',
    });

    // The call was wrong if it pointed the runner at the Hunter, or away from a clear room.
    const misled = (said === CALL.CLEAR && hunterHere) || (said === CALL.HOLD && !hunterHere);
    if (misled) {
      // 🚨 SEALED, AND IT WAS PUBLIC, WHICH MADE THE COUNTER'S FIX COSMETIC. `task.miss` fires if
      // and only if the guide's call was wrong, so a PUBLIC one is the same lie detector as the
      // old single-source counter, one layer down and still on the wire — invisible on the
      // television and one devtools panel from the sofa. Nothing public is lost by sealing it:
      // a wrong CLEAR is already witnessed as `player.taken`, and a wrong HOLD is a room nobody
      // entered and nobody heard. T5: the failure event names a room and a loudness and never the
      // culprit — the closed schema in `events.js` keeps that a construction error.
      record(makeEvent('task.miss', VIS.SEALED, {
        kind: 'call', room: state.expedition.room, phaseTick: state.tick, loudness: MISS_LOUD,
      }));
      // Attribution, sealed, in the same stream — so the Reunion needs no second source.
      emitNoise({ loud: MISS_LOUD, room: state.expedition.room, causedBy: state.pair.guide, sourceType: 'MISS' });
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
    // ⚠️ NO `said` ON THIS ONE EITHER, AND IT WAS THE SAME LEAK ONE FUNCTION ALONG. Sealing
    // `call.said` at the moment the guide speaks buys nothing if the episode's closing PUBLIC
    // event repeats the word thirty seconds later. The outcome, the move and the room are what
    // the table witnessed; the callout is `call.said`, sealed, and the Reunion reads both.
    record(makeEvent('expedition.ended', VIS.PUBLIC, {
      outcome, move, room: state.expedition.room, episode: state.episode,
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
      // 🚨 AN EXECUTION IS NOT A TAKE. This called `applyTake` and filtered the `player.taken`
      // EVENT back out, which was right about the log and wrong about the row — the assign
      // copied `taken: true` onto the public frame, so every executed player rendered `✖ taken`
      // and the `⚒ evicted` branch beside it had never once been reached. `applyEviction` is the
      // same sealed half without the flag or the event. Round §4: the two visible causes are
      // TAKEN and EXECUTED, and *"both were witnessed live on TV"*.
      const { player, events } = applyEviction(victim);
      Object.assign(victim, player);
      record(makeEvent('player.executed', VIS.PUBLIC, { id: victim.id, seat: victim.seat, executioner: swinger }));
      for (const e of events) record(makeEvent(e.type, e.vis, e.data));
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
    // 🚨 A NOMINATION BELONGS TO ITS EPISODE AND DIES WITH IT. `onEnter[RECKONING]` was the ONLY
    // place this list was cleared, so from the moment one reckoning closed until the next one
    // opened — the vote, the execution, the verdict, and then the whole of the next episode's
    // casting, expedition, recap and debrief — the previous episode's nominations sat on the
    // frame. `show-tv.html`'s `votedTag` renders them in every phase but CASTING and VOTE, so the
    // television printed "◆ on the block" beside a living player, all the way through the Debrief,
    // for an accusation the table had already voted down an episode ago. Clearing it here means
    // the block is still on screen for the vote and the execution it belongs to, and gone before
    // the next episode opens.
    state.nominations = [];
    state.tally = null;
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
        // 🚨 SNAPSHOT, NOT A LATER READ. `sightForGuide()` is computed from the sim's CURRENT
        // state, so asking it at RECAP would answer "could the guide see the Hunter twenty
        // seconds after they committed" — which is a different question and the wrong one. The
        // fact the DEBRIEF needs is what the guide had in front of them at the instant they
        // spoke. `recap.aired` is the only reader.
        callSight = sightForGuide().hunter;
        /**
         * 🚨 **THE FACT IS PUBLIC AND THE WORD IS SEALED, AND IT USED TO BE ONE EVENT CARRYING
         * BOTH.** `entitle.js` took `call.said` off the FRAME on broadcast §6.9's authority —
         * *"the guide talks out loud, in the room. That is the game"* — and `record()` went on
         * emitting the raw stored event to every socket `visibleTo` accepts, so a PUBLIC
         * `call.made` put the exact word, with the guide's name on it, on all eight phones' event
         * wires. The sentence the guide was supposed to have to say themselves was still being
         * said for them, permanently, in writing, one devtools panel from the sofa.
         *
         * ⚠️ THIS FILE HAD ALREADY MADE THE OPPOSITE DECISION TWO FUNCTIONS AWAY AND THE TWO
         * COULD NOT BOTH BE RIGHT. `task.miss` was sealed on the argument that *"a PUBLIC one is
         * the same lie detector ... invisible on the television and one devtools panel from the
         * sofa"*. Identical risk, identical wire, opposite conclusion. The `task.miss` argument
         * is the correct one and this is it applied consistently.
         *
         * ⚠️ THE PUBLIC RECORD IS NOT LOST, WHICH IS WHY THIS IS TWO EVENTS RATHER THAN A
         * DELETION. That the guide has spoken, and who they are, is public and attributable — the
         * DEBRIEF needs a clock and a name to argue about, and both are here. What comes off the
         * wire is the CLEAR or the HOLD, which is the only part §6.9 protects.
         *
         * ⚠️ AND THE REUNION STILL HAS IT. `log.reunion()` is `log.all()` — the same stream with
         * the filter off — so a SEALED entry is a delayed reveal rather than a deleted one. The
         * two event names mirror the two matrix rows exactly: `call.made` is `all`, `call.said`
         * is one phone now and the whole room at the end.
         */
        record(makeEvent('call.made', VIS.PUBLIC, { by: playerId, episode: state.episode }));
        record(makeEvent('call.said', VIS.SEALED, { by: playerId, said: msg.call, episode: state.episode }));
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
      /**
       * 🚨 REFUSE THE CHAIR — round §2, and the one player move in this file that UNDOES a public
       * result rather than adding to one. *"Once per game, a player voted into a chair may REFUSE
       * THE CHAIR. Public, attributed, permanent, and logged. The runner-up in that slot takes
       * it."*
       *
       * ⚠️ THE REPLACEMENT COMES OUT OF THE SAME BALLOTS, NEVER OUT OF A SECOND ELECTION.
       * `ballot.js`'s `refuse()` re-tallies the slot with the refuser struck off, so the answer is
       * the runner-up the table already voted for — and a table that has to vote twice because
       * somebody said no has been stalled by one person, which is the thing §2 spends its whole
       * tiebreak ladder avoiding.
       *
       * ⚠️ THE WINDOW CLOSES WHEN YOU ACT. You may refuse after seeing your flyover — that is a
       * deniable, interesting play and §2 calls it *"a lovely thing for a good player to do at
       * exactly the wrong moment"* — but not after you have called it or moved, because then the
       * chair has already been used and refusing it is just erasing what you did with it.
       */
      case 'refuse': {
        if (state.phase !== PHASE.EXPEDITION) return { ok: false, why: 'no chair to refuse' };
        const slot = playerId === state.pair.runner ? 'runner'
          : playerId === state.pair.guide ? 'guide' : null;
        if (!slot) return { ok: false, why: 'you were not cast' };
        if (p.refused) return { ok: false, why: 'you have already refused a chair this game' };
        if (pending.acted.has(playerId)) return { ok: false, why: 'too late — you have already acted' };
        // The other chair's holder is out of the running: one player cannot take both.
        const other = slot === 'runner' ? state.pair.guide : state.pair.runner;
        const pool = alive.filter((id) => id !== other && id !== playerId);
        if (!pool.length) return { ok: false, why: 'nobody else can take it' };
        const r = refuseChair({
          slot, refuser: playerId,
          ballots: lastBallots, living: alive.filter((id) => id !== other),
          history: state.history, lastPair: state.lastPair, ep: state.episode, matchSeed: worldSeed,
        });
        if (!r.replacement) return { ok: false, why: 'nobody else can take it' };

        p.refused = true;
        // The refuser did not go; the replacement did. The history the tiebreak ladder reads has
        // to say so, or refusing a chair would count as having taken one — and `lastEp` is
        // RESTORED rather than decremented, because "how long since you last went" is not a
        // number you can arrive at by subtraction.
        if (castUndo.has(playerId)) state.history[playerId] = { ...castUndo.get(playerId) };
        castUndo.set(r.replacement, { ...state.history[r.replacement] });
        state.history[r.replacement].expeditions += 1;
        state.history[r.replacement].lastEp = state.episode;
        state.pair[slot] = r.replacement;
        if (slot === 'guide') state.call = { by: r.replacement, said: null };
        seatTheCrew();
        record(makeEvent('cast.refused', VIS.PUBLIC, {
          slot, refuser: playerId, replacement: r.replacement, episode: state.episode,
        }));
        record(makeEvent('cast.pair', VIS.PUBLIC, { runner: state.pair.runner, guide: state.pair.guide }));
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
        /**
         * 🚨 **EVERY NOMINATION BUYS THE TABLE FIFTEEN SECONDS, AND IT USED TO BUY NONE.** This
         * set `clock.seconds` and left `clock.endsAt` alone — and `endsAt` is the deadline
         * `tick()` compares against, so the number on screen grew and the bell did not move. The
         * television says *"every one buys the table fifteen seconds"* while the countdown runs
         * to the original moment, and `show-tv.html`'s ring, which divides the remaining time by
         * `clock.seconds`, visibly jumped BACKWARDS as the total grew under it.
         *
         * ⚠️ THE DEADLINE MOVES BY THE DIFFERENCE, NEVER BY A FRESH `now + seconds`, and that is
         * what keeps this file free of a clock. `input()` takes no time argument on purpose —
         * a tap is not a tick — so the extension is expressed as a delta against the deadline
         * already standing. It also makes the cap free: once `reckoningSeconds` saturates at
         * `RECKONING_CAP` the difference is zero and the bell does not move at all.
         */
        const was = state.clock.seconds;
        state.clock.seconds = reckoningSeconds(state.nominations.length);
        state.clock.endsAt += (state.clock.seconds - was) * 1000;
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
    /** The frame before the filter. Belongs to the gate — see `room.js`'s copy for why. */
    unprojected: (socketId) => {
      const sock = sockets.find((x) => x.id === socketId);
      return sock ? fullFor(sock) : null;
    },
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

    /**
     * 🛰️ THE TELEVISION'S REPORT. Accepted only during EXPEDITION, and only the fields named.
     *
     * ⚠️ THE OUTCOME IS RECORDED, NOT APPLIED. It is used when the phase closes, through the same
     * `resolveExpedition` that grades a stubbed one, so a house that reports early cannot skip
     * the call, the log entries or the win check.
     */
    simReport(msg = {}) {
      if (state.phase !== PHASE.EXPEDITION) return { ok: false, why: 'no expedition running' };
      if (msg.t === 'sim' && msg.runner && msg.hunter) {
        sim = {
          runner: { x: +msg.runner.x || 0, z: +msg.runner.z || 0, room: msg.runner.room ?? null, noise: +msg.runner.noise || 0 },
          hunter: { x: +msg.hunter.x || 0, z: +msg.hunter.z || 0, room: msg.hunter.room ?? null,
            wallDist: Number.isFinite(msg.hunter.wallDist) ? msg.hunter.wallDist : 99 },
        };
        // Only the guide's frame changes on a position tick, and only if they have the sight.
        const g = socketOf.get(state.pair.guide);
        if (g) pushTo(g);
        return { ok: true };
      }
      if (msg.t === 'expedition' && ['lit', 'taken', 'held'].includes(msg.outcome)) {
        reported = msg.outcome;
        return { ok: true };
      }
      return { ok: false, why: `unknown report "${msg.t}"` };
    },

    /** Is a real house driving this expedition, or is it the stub? Instruments ask; nobody else. */
    wired: () => sim != null,

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
