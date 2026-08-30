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

import { COMPOSITION, dealCast, viewFor, EVIL } from './cast.js';
import { project } from '../../net/party/entitle.js';
import { makeEvent, VIS } from './events.js';
import { createLog, visibleTo } from './log.js';
import { hunterVisibleToGuide, ROOMS } from './coverage.js';
import { applyTake, resolveContact, MODE, PLATE } from './taken.js';
import { tallyCasting } from './ballot.js';
import { tallyVote, executioner, nominate, reckoningClosed, canLynchVote, assumedLynchVotes, nominatorLockedChoice, NO_ONE } from './vote.js';
import { foldWin, OUTCOME, WIN_TARGETS } from './win.js';
import { reunion } from './reunion.js';
import { PHASE, EPISODE_CAP } from './phases.js';
import { cleanLook } from './look.js';
import { STALE_MAX, intelFor } from './intel.js';
import { coverageRoomOf } from './mansion.js';
import { mapFeed } from './mapfeed.js';
import { missionFor } from './mission.js';
import { drillShotFor, FAIL_CHROME, JOB } from './jobs.js';

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
  /**
   * ⚠️ `let`, NOT `const`, AND ONLY `dealRoles` MAY REASSIGN IT — see its header.
   *
   * The room is constructed at CAPACITY, before anybody has joined, because the transport needs a
   * socket per seat to bind reconnect tokens to. That makes this first deal a placeholder: it is
   * for eight players when the night may turn out to be two.
   */
  let deal = dealCast({ count, castSeed });
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
    phase: 'LOBBY', tick: 0, episode: 1, airingEpisode: 1, worldSeed,
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
    lynchVotes: {},
    voteResult: null,
    execution: null,
    liveLiving: null,
    takenThisEpisode: [],
    outcome: null,
    // ⚠️ THE SHOW STARTS WITH ONE CAMERA LIVE, AND IT IS NOT A FREEBIE. At zero cameras the
    // guide's coverage is 0 and their honest error rate is 50% — a coin, not a game, and a
    // guide nobody can ever catch lying. One establishing camera puts episode one at 33%
    // coverage (deliberately above T3's band) and the broadcast has something to cut to on
    // frame one, which the Director needs anyway.
    cameras: { unlocked: 1, needed: deal.cameras, tool: null },
    /** Hall/floor from a finished drill. Revealed on the NEXT casting, not tonight's recap. */
    pendingTool: null,
    failChromeSent: false,
    incident: { alarms: 0 },
    /**
     * 🌍 **WHERE THE BODIES ARE, AS LAST REPORTED BY THE TV.**
     *
     * `docs/slices/task-prime-time-lobby-warm-night.md` §3.8. This module has never simulated an
     * expedition — `playEpisode` resolves a whole episode synchronously — and the mansion lives
     * inside the TV's follow slot, so the renderer is the only process that knows where anybody
     * is standing. `setWorld` is how that fact arrives; everything below decides who is told.
     *
     * ⚠️ **NOT PART OF ANY FRAME.** `state.world` is ground truth and is never spread into
     * `base`. It reaches a socket only through `intelFor`, which is where the good/evil asymmetry
     * is applied, and only ever as `you.intel`.
     */
    world: null,
    /** A hunter sighting up to `STALE_MAX` old — what a good player is allowed to be told. */
    worldStale: null,
    /** Monotonic, so the vague read can be sporadic without a clock or an RNG. */
    worldTick: 0,
  };

  /**
   * ⚠️ **`state.players` IS THE BROADCAST ROW, SO A FACT THAT IS NOT FOR THE WIRE DOES NOT GO ON
   * IT** — and `applyTake` returns one that is not.
   *
   * `fullFor` spreads these rows into `base.players` wholesale, so every key here is offered to
   * the entitlement matrix, and `taken: true` (`taken.js` L69) has no row. Deny-by-default was
   * therefore deleting it from every frame in silence — no leak, but no error either, and the
   * same silence a genuinely secret field would have got. Found by `party-isolation` I1c the hour
   * it was written, which is the argument for I1c.
   *
   * The take is already fully described by two rowed fields the room does publish — `alive:false`
   * and `plate: FACE_DOWN` — plus `player.taken` / `player.sealed` in the log, which is what the
   * Reunion reads. Nothing anywhere reads `state.players[].taken`. So it stays where it belongs:
   * on `applyTake`'s return, which `party-taken` asserts, and off the row that gets projected.
   */
  const landTake = (victim, player) => {
    const { taken, ...row } = player;
    Object.assign(victim, row);
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
      phase: state.phase, tick: state.tick, episode: state.episode, airingEpisode: state.airingEpisode, worldSeed: state.worldSeed,
      players: state.players.map((p) => ({ ...p })),
      pair: { ...state.pair },
      cameras: { ...state.cameras },
      incident: { ...state.incident },
    };
    if (!sock.isTV && deal.seats.some((s) => s.id === sock.playerId)) {
      const v = viewFor(deal, sock.playerId);
      base.you = v.you;
    } else if (!sock.isTV) {
      /*
       * A phone holding a seat the deal does not cover. That is the normal state of chairs 3..8
       * once `dealRoles` has re-dealt for the two people who actually turned up — `viewFor` throws
       * on an unknown id by design, so the absence is handled here rather than by loosening it.
       * No `you` means no role, which is the correct thing to tell a chair nobody is sitting in.
       */
    } else {
      // Host/TV is a spectator. `players[].claim` is a `phones` row, and it is stripped HERE as
      // well so a later matrix-row mistake cannot put a published nameplate on the shared screen
      // — DevTools on the host tab is not a nameplate. Belt and braces on purpose: the value
      // this used to carry was the Glitched's cover (see `playEpisode`), and the row was the only
      // thing standing between it and the television.
      base.players = base.players.map((p) => {
        const { claim, ...row } = p;
        return row;
      });
    }
    /*
     * 🔎 THE INTEL SPLIT. Good hears something vague and late; evil sees both bodies exactly and
     * simultaneously. The whole asymmetry is computed in `src/party/intel.js` and applied HERE,
     * before `project()` — a good player's frame does not contain an exact coordinate behind a
     * missing row, it does not contain one at all. See `net/party/entitle.js`'s `you.intel` block.
     *
     * The roll is derived from `worldTick` rather than `Math.random()` so two identical rooms
     * behave identically, which is what makes `party-isolation` and `party-sim` reproducible.
     */
    if (!sock.isTV && state.world && base.you) {
      const intel = intelFor({
        alignment: sock.alignment,
        world: state.world,
        stale: state.worldStale,
        cameras: state.cameras,
        roll: ((state.worldTick * 0x9e3779b1) >>> 0) / 0x100000000,
      });
      if (intel) base.you = { ...base.you, intel };
    }
    /*
     * THE RUNNER'S OWN ROOM — proprioception, not intel.
     *
     * Playcritique feel28: the guide shouts room names into a pad that never names the room
     * the runner is standing in, so co-op has no receiving end. This is the one word a body
     * already knows. It is NOT Word from the House (still stripped from this seat) and it is
     * NOT the map. you.here is runner-audience in entitle.js; everyone else is unchanged.
     */
    if (!sock.isTV && sock.seatRole === 'runner' && base.you && state.world?.runner?.room) {
      base.you = { ...base.you, here: state.world.runner.room };
    }
    /*
     * WHICH CAMERA THE SHOW IS ON — the same seat, the same reasoning, one field wider.
     *
     * The runner's controls change with the perspective: absolute under the plan-locked top-down,
     * camera-relative with a look stick on the ground. A pad that did not know which was live
     * would print the wrong instructions over the right sticks. Set separately from `here` so a
     * report that carries a view but no room still delivers it.
     */
    if (!sock.isTV && sock.seatRole === 'runner' && base.you && state.world?.view) {
      base.you = { ...base.you, view: state.world.view };
    }
    /*
     * 🗺️ **`|| state.world` — AND WITHOUT IT THE GUIDE'S NEW MAP IS A FLOOR PLAN WITH NO MARKS ON
     * IT, WHICH THE FIRST BROWSER PASS PHOTOGRAPHED.**
     *
     * `playEpisode` resolves an entire episode SYNCHRONOUSLY: by the time the show beat says
     * `expedition` and the TV is rendering a live run, `state.phase` has already walked to VERDICT
     * and this gate is shut. The stub clock and the phase machine have never agreed, and D13 got
     * away with it because nothing was reading `flyover`.
     *
     * A live world report is the honest signal that an expedition is actually happening — it only
     * exists while the TV is rendering one. Gates that never call `setWorld` leave `state.world`
     * null and see byte-identical behaviour, which is why `guide-coverage` and `party-isolation`
     * are unmoved by this.
     */
    if (sock.seatRole === 'guide' && (state.phase === 'EXPEDITION' || state.world)) {
      // 🚨 S3. The Hunter is on the map only where a live camera watches. `hunterMark.visible =
      // hs.inScene && !!hp` (views/game.js L2559) is the debug view this replaces.
      /*
       * 📹 **THE COVERAGE TEST IS ASKED ABOUT THE ROOM THE HUNTER IS ACTUALLY IN.**
       *
       * It used to be asked about `state.hunterRoom` — a stub initialised to `ROOMS[0]` and only
       * ever written by `playEpisode`'s optional argument — while the MARK below was already being
       * built from `state.world.hunter`. So the guide's sight was decided about one room and drawn
       * at another: with the stub sitting on `ballroom` the mark blinked on whenever a camera
       * happened to cover the ballroom, regardless of where the hunter had walked.
       *
       * `coverageRoomOf` is what makes the live id askable at all — `coverage.js`'s roster holds
       * bare names, so a generated `r2.study` is not in it and a passage is in it nowhere. See its
       * header for why a corridor is honestly uncovered rather than mapped to something.
       */
      const liveRoom = coverageRoomOf(state.world?.hunter?.room);
      /*
       * 📡 **TWO GUIDES, TWO FEEDS, AND THE SPLIT IS THE SAME ONE `intel.js` ALREADY MAKES.**
       *
       * John, guiding as the Producer on `0349ef6`: *"Production Feed said the hunter moved
       * Chapel → Gallery, but the red hunter dot on the guide map did not keep tracking."* Both
       * halves of that sentence were this block. The Production Feed line is `you.intel`, which
       * is exact and deliberately NOT gated on a camera (W7a); the map's mark was gated, so the
       * dot blinked out every time the hunter walked into an uncovered room while the line above
       * it kept naming rooms. One screen, two answers, and the wrong one was the picture.
       *
       * So the map now agrees with the feed rather than with the camera ladder:
       *
       *   evil  ·  continuous and exact, ungated. This adds NO information — the same position
       *            is already on this socket's wire as `you.intel.hunter.at` — it stops the two
       *            renderings of one fact from contradicting each other.
       *   good  ·  the camera ladder, exactly as before, AND `mapfeed.js`'s peek/jam cycle on
       *            top of it. A jammed frame carries no hunter mark at all, so the interference
       *            the phone draws is honest rather than cosmetic.
       */
      const feed = mapFeed({ alignment: sock.alignment, seconds: state.worldTick * 0.5 });
      const evilGuide = sock.alignment === EVIL;
      const covered = hunterVisibleToGuide({
        worldSeed: state.worldSeed,
        unlocked: state.cameras.unlocked,
        hunterRoom: state.world ? liveRoom : state.hunterRoom,
      });
      const seen = evilGuide ? true : (covered && !feed.jammed);
      /*
       * 🗺️ THE MARKS ARE THE REAL BODIES NOW, WHEN THE TV HAS REPORTED ANY — and they still travel
       * as `marks`, not as a richer `flyover.hunter`.
       *
       * ⚠️ `flyover.hunter` STAYS A BOOLEAN, deliberately. Widening it to `{x,z}` would introduce
       * `flyover.hunter.x` / `.z` as unrowed paths — `party-isolation` I1's exact failure — and
       * `guide-coverage` reads it as the "is the guide sighted this tick" signal it has always
       * been. `marks[].x` / `.z` / `.kind` already have `guide` rows, so the position rides the
       * channel that was built for it.
       */
      const w = state.world;
      const marks = [w?.runner
        ? { x: w.runner.x, z: w.runner.z, kind: 'you' }
        : { x: 1.5, z: -2.0, kind: 'you' }];
      if (seen) {
        marks.push(w?.hunter
          ? { x: w.hunter.x, z: w.hunter.z, kind: 'hunter' }
          : { x: 7.0, z: 3.0, kind: 'hunter' });
      }
      /*
       * ⚠️ `jam` IS ALWAYS PRESENT, INCLUDING AS `false`. `party-isolation` I7 asserts that no
       * survivor's frame CHANGES SHAPE across a take, and a field that only appears while the
       * feed is cut would change the guide's shape twice a cycle. A constant boolean says the
       * same thing without announcing anything by its presence.
       */
      base.flyover = { hunter: seen, jam: feed.jammed, marks };
    }
    // ---- the injected leaks. `harness/party-isolation.mjs` I9 requires each to turn exactly the
    // named set of assertions red; a control that stops failing means the gate is blind.
    // Leaks 1 and 3 are VALUE and ORDER leaks: they pass through the filter untouched, because
    // the key is rowed and the audience is satisfied. Those are the ones a matrix cannot catch,
    // and they are I3's and I4b's whole reason for existing.
    // Leak 5 lives in `playEpisode` rather than here, because the bug it reproduces was stateful:
    // it wrote `state.players[].claim` and a PUBLIC event, not a field on one frame.
    if (leak === 1) base.you = { ...(base.you || {}), role: deal.seats[0].role, alignment: deal.seats[0].alignment };
    /*
     * 🚨 LEAK 6 IS THE ONE THAT NEVER REACHES A FRAME, AND THAT IS THE POINT OF IT.
     *
     * `castSeed` has no matrix row, on purpose (`cast.js`'s header) — so `project` drops it and
     * pushes the path onto `unrowed`, and every socket's transcript is byte-identical to a clean
     * run. I1 walks what a socket ACTUALLY GOT, so I1 cannot see this: an unrowed field announces
     * itself as a silence. `unrowedSeen` below is what turns that silence into a red line, and
     * this is the control that proves it can go red.
     */
    if (leak === 6) base.castSeed = castSeed;
    if (leak === 3) base.players = base.players.slice().sort((a, b) => {
      const al = (id) => deal.seats.find((s) => s.id === id).alignment;
      return al(a.id).localeCompare(al(b.id));
    });
    return base;
  }

  /**
   * 📋 **EVERY FIELD THE MATRIX HAD NO ROW FOR — KEPT, BECAUSE `project` DROPS THEM IN SILENCE.**
   *
   * Deny-by-default is right and it is quiet. An unrowed path is deleted before it reaches a
   * socket, and `party-isolation` walks what a socket ACTUALLY GOT — so I1 is structurally unable
   * to see one. `project` has returned `unrowed` since it was written (`entitle.js` L211) and
   * every caller in this file threw it away, which meant a field added six months from now would
   * announce itself as an absence rather than as an error. That is the exact failure mode
   * `entitle.js`'s header says deny-by-default exists to prevent, half-built.
   *
   * PATHS ONLY, NEVER VALUES, AND A `Set` — this is a schema record about a room, it is not a
   * frame, it never goes near `send`, and it must not grow with the length of the night.
   */
  const unrowedSeen = new Set();

  /** Project for one socket and bank whatever the matrix had no row for. */
  function projectFor(sock) {
    const ctx = {
      playerId: sock.playerId, alignment: sock.alignment, isTV: sock.isTV,
      seatRole: sock.seatRole, ownerId: sock.playerId,
    };
    const { frame, unrowed } = project(fullFor(sock), ctx);
    for (const p of unrowed) unrowedSeen.add(p);
    return frame;
  }

  function broadcast() {
    for (const sock of sockets) {
      const frame = projectFor(sock);
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
   * Living ids for the live lynching clock. Transport passes seated phones so empty
   * Robot N chairs are not a vote. Gates omit it and use every alive player.
   */
  function episodeLiving() {
    if (Array.isArray(state.liveLiving) && state.liveLiving.length) {
      return state.liveLiving.filter((id) => state.players.some((p) => p.id === id && p.alive));
    }
    return state.players.filter((p) => p.alive).map((p) => p.id);
  }

  function closeVote() {
    const living = episodeLiving();
    const ballotBox = Object.fromEntries(living.map((id) => [id, state.lynchVotes[id] || NO_ONE]));
    const result = tallyVote({ living, nominations: state.nominations }, ballotBox);
    for (const [voter, choice] of Object.entries(ballotBox)) {
      record(makeEvent('vote.cast', VIS.PUBLIC, { voter, choice }));
    }
    record(makeEvent('vote.tallied', VIS.PUBLIC, { counts: result.counts, executed: result.executed }));
    let swinger = null;
    if (result.executed) {
      const victim = state.players.find((p) => p.id === result.executed);
      if (victim && victim.alive) {
        swinger = executioner(
          { living, nominations: state.nominations },
          result.executed,
          state.takenThisEpisode || [],
        );
        const { player, events } = applyTake(victim);
        landTake(victim, player);
        record(makeEvent('player.executed', VIS.PUBLIC, { id: victim.id, seat: victim.seat, executioner: swinger }));
        for (const e of events.filter((e) => e.type !== 'player.taken')) record(makeEvent(e.type, e.vis, e.data));
      }
    }
    state.voteResult = { ...result, votes: ballotBox, executioner: swinger };
    state.execution = result.executed
      ? { id: result.executed, executioner: swinger }
      : { id: null, executioner: null };
    broadcast();
    return state.voteResult;
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
  function dealRoles(seatedIds = null) {
    if (dealt) return false;
    dealt = true;

    /**
     * 🚨 **DEAL FOR WHO TURNED UP, NOT FOR THE CAPACITY — AND THIS IS THE THIRD AND LARGEST HALF
     * OF JOHN'S "the role cards are only giving me continuity".**
     *
     * `createRoom` is constructed with `count = 8` because the transport needs eight sockets to
     * bind tokens to, and the deal above was taking that literally. So a two-phone table was dealt
     * an EIGHT-player bag and the two people present were handed cards 0 and 1 of it —
     * `GUARANTEED[8]` leads with `continuity`, and with the server's constant `castSeed` (fixed
     * separately, in `net/party/local.mjs`) the shuffle landed the same way every night.
     *
     * Re-dealing here rather than at construction is what makes the count right, because THIS is
     * the first moment the room knows it: `start` is pressed once the chairs are full.
     *
     * ⚠️ **A GATE THAT CALLS `dealRoles()` WITH NO ARGUMENT GETS THE OLD BEHAVIOUR, BYTE FOR
     * BYTE.** Every party gate fills every seat and passes nothing, so `role-deal`, `role-script`,
     * `reunion-truth` and `party-isolation` are measuring exactly what they measured before.
     * `COMPOSITION` has no row below 2, so a lone phone keeps the capacity deal rather than
     * throwing at the one moment a host is watching.
     */
    const ids = Array.isArray(seatedIds) ? seatedIds.filter(Boolean) : null;
    if (ids && ids.length >= 2 && ids.length < count && COMPOSITION[ids.length]) {
      deal = dealCast({ count: ids.length, castSeed, playerIds: ids });
      const byId = new Map(deal.seats.map((s) => [s.id, s]));
      // The sockets carry alignment for `log.js`'s EVIL filter, so they have to follow the deal.
      // A chair nobody sat in is not GOOD, it is not playing: `null` keeps it out of every
      // audience rather than quietly adding it to the good side.
      for (const s of sockets) {
        if (s.isTV) continue;
        s.alignment = byId.get(s.playerId)?.alignment ?? null;
      }
      state.cameras.needed = deal.cameras;
    }

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
  function playEpisode({ takeRunner = false, hunterRoom = null, ballots = null, votes = null, nominations = null, living: livingOpt = null, scaffold = true } = {}) {
    const takeRunnerThisEpisode = takeRunner;
    if (hunterRoom) state.hunterRoom = hunterRoom;
    const allLiving = state.players.filter((p) => p.alive).map((p) => p.id);
    // Night passes the seated humans. Gates omit this and keep the full deal.
    const living = (Array.isArray(livingOpt) && livingOpt.length)
      ? livingOpt.filter((id) => allLiving.includes(id))
      : allLiving;
    // An explicit empty ballot list means wait — do not invent a pair from unused Robot N chairs.
    if (Array.isArray(ballots) && ballots.length === 0) return;

    /*
     * TV chrome airs this number. playEpisode bumps state.episode before the live
     * run, so frame.episode would say 2 on the first walk. Sibling of #18 VERDICT lie.
     */
    state.airingEpisode = state.episode;
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
    /*
     * LIVE NIGHT PASSES scaffold: false. The miss/alarm/camera-lit stubs exist so
     * party-anon gates and party-sim have a failure of each kind and a win path — they are
     * not events that happened in the house. On a live Send-them-in the TV was printing
     * CAMERAS 2/1 · ALARMS 2 before anyone swung (playcritique overnight post-#19). The
     * mansion reports real cameras and alarms; inventing them here is a lie on the shared
     * screen. Gates omit the flag and keep the scaffold (default true).
     */
    if (scaffold) {
      // One miss and one alarm, so party-anon A0's arm has a failure of each kind to look at.
      record(makeEvent('task.miss', VIS.PUBLIC, { kind: 'call', room: 'east', phaseTick: state.tick, loudness: 0.62 }));
      record(makeEvent('panel.alarm', VIS.PUBLIC, { kind: 'panel', room: 'east', phaseTick: state.tick, loudness: 1.25 }));
      // ATTRIBUTION EXISTS FROM THE FIRST EPISODE AND IS SEALED UNTIL THE REUNION.
      record(makeEvent('noise.emitted', VIS.SEALED, { causedBy: runner.id, loud: 1.25, room: 'east' }));
      record(makeEvent('noise.emitted', VIS.SEALED, { causedBy: guide.id, loud: 0.62, room: 'east' }));
      state.incident.alarms += 2;

      // Camera lights when the expedition SURVIVES — gate/sim path only.
      if (!takeRunnerThisEpisode) {
        state.cameras.unlocked += 1;
        record(makeEvent('run.camera_lit', VIS.PUBLIC, { camera: state.cameras.unlocked, episode: state.episode }));
      }
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
        landTake(victim, player);
        takenThisEpisode.push(victim.id);
        for (const e of events) record(makeEvent(e.type, e.vis, e.data));
      }
    }

    /*
     * ---------------------------------------------------------------------------------------
     * 🚨 **THE SERVER DOES NOT AUTHOR CLAIMS — AND WHEN IT DID, IT NAMED THE GLITCHED TO EVERY
     *    PHONE IN THE ROOM, ON EVERY LIVE EPISODE.**
     * ---------------------------------------------------------------------------------------
     * What stood here called itself a stub and was on the live wire. For every living player it
     * wrote a nameplate the player had never said out loud:
     *
     *     const claim = seat.cover ?? 'contestant';
     *     p.claim = claim;
     *     record(makeEvent('player.claim_set', VIS.PUBLIC, { id: p.id, claim }));
     *
     * `cast.js` L196-201 sets `seat.cover` on EXACTLY ONE seat — `if (seat.role !== 'glitched')
     * continue;`. So that loop published a column reading `contestant` for everybody and one
     * informing role name for one player, and `players[].claim` is a `phones` row
     * (`entitle.js` L103). Every phone could read the Glitched straight off its own screen:
     *
     *     castSeed  5 · glitched p2 → p2=cameraOp,    every other row contestant
     *     castSeed 17 · glitched p5 → p5=cameraOp
     *     castSeed 42 · glitched p3 → p3=focusPuller
     *
     * `roles.js` L19-24 is what that costs: without the Glitched *"the Camera Op and the Focus
     * Puller are oracles and the game solves itself."* Naming them also hands the room a second
     * player confirmed GOOD by inference, and `players[].alignment` is the matrix's loudest
     * absence — *"NO ROW. Nobody, ever, pre-REUNION."* `GUARANTEED[5]` and `[6]` both contain
     * `glitched` (`cast.js` L98-99), so at five and six players it fired every single game.
     *
     * ⚠️ **IT WAS NEVER BEHIND `scaffold`.** The `if (scaffold)` block above opens at the miss/
     * alarm stubs and closes before the take; this loop sat outside it, so `scaffold: false` —
     * the flag whose own comment reads LIVE NIGHT PASSES `scaffold: false` — did not turn it
     * off. The word "stub" in the comment, in `log.js`'s filter and in the matrix row was doing
     * all the reassuring while the code ran on the real night.
     *
     * A claim is something a PLAYER does — the Method Actor's nameplate, `roles.js` L82 — and
     * until that verb exists the honest number of claims on any wire is zero. So:
     *
     *   · `players[].claim` STAYS in the frame, as `null`. I7 asserts that no survivor's frame
     *     changes shape, and a field that appears the moment somebody publishes would change it;
     *     present-and-null says the same thing without announcing anything by its presence.
     *   · `players[].claim` KEEPS its `phones` row. The row is right; what was wrong was who
     *     wrote the value.
     *   · `reunion.js`'s `finalClaim` now reads `null` for everybody, which is the truth —
     *     nobody claimed anything — rather than a cover its holder never uttered. `rollCall`
     *     already names the cover under `believedTheyWere`, from the SEALED deal, so the Reunion
     *     loses nothing it is entitled to.
     *
     * Gates: `party-isolation` I3b (provenance — a claim the driver did not publish is a leak,
     * asserted against the DRIVER'S record and never against the server's own event) and I3c
     * (the three seeds above, replayed as a live-night room). Control: `leak: 5` restores exactly
     * the loop that was here, and both go red.
     */
    if (leak === 5) {
      for (const p of state.players.filter((x) => x.alive)) {
        // ⚠️ `state.players` IS THE CAPACITY AND `deal.seats` MAY NOT BE — once `dealRoles`
        // re-deals for the phones that actually joined, chairs 3..8 exist as players and hold
        // no card, and this lookup used to throw mid-episode. Kept so the control reproduces
        // the shipped loop exactly rather than a tidied-up version of it.
        const seat = deal.seats.find((s) => s.id === p.id);
        if (!seat) continue;
        const claim = seat.cover ?? 'contestant';
        p.claim = claim;
        record(makeEvent('player.claim_set', VIS.PUBLIC, { id: p.id, claim }));
      }
    }

    setPhase('RECAP');
    setPhase('DEBRIEF');

    // ---- RECKONING / VOTE / EXECUTION, on EVERY episode including the premiere.
    // The skip that used to sit here disagreed with the live SHOW clock, which never had one.
    // `phases.js` `orderFor` carries the decision and the 105s it costs the night.
    {
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
        landTake(victim, player);
        record(makeEvent('player.executed', VIS.PUBLIC, { id: victim.id, seat: victim.seat, executioner: swinger }));
        for (const e of events.filter((e) => e.type !== 'player.taken')) record(makeEvent(e.type, e.vis, e.data));
      }
      setPhase('VERDICT');
    }

    // ---- the win machine, folded over the log we just wrote
    foldVerdict();

    state.lastPair = { ...state.pair };
    for (const s of sockets) s.seatRole = null;
    state.episode += 1;
  }

  /* =============================================================================================
   * ⚖️ **THE EPISODE'S VERDICT — ONE COPY, TWO CALLERS.**
   *
   * This was six lines buried at the end of `playEpisode`, which is the OFFLINE machine only
   * gates run. The live wire never folded the win at all: `enterExecution()` set the phase and
   * stopped, so no live night has ever had an outcome, and `state.outcome` stayed null forever.
   *
   * ⚠️ **EXTRACTED, NOT COPIED, AND THAT IS THE WHOLE POINT.** `harness/episode-order.mjs` exists
   * because the designed order and the live wire once disagreed while both halves were gated as
   * correct. Growing a second copy of the win rule in `net/party/local.mjs` is the same mistake
   * one layer down — the two would drift, and each would have a gate saying it was right.
   *
   * `EPISODE_CAP` is enforced here and nowhere else: a RENEWED at the cap is a CANCELLED,
   * because a season that runs out of episodes without lighting its cameras is one Production won.
   * ============================================================================================= */
  function foldVerdict() {
    const align = Object.fromEntries(deal.seats.map((s) => [s.id, s.alignment]));
    const w = foldWin(log.all(), { count, alignmentOf: (id) => align[id] });
    /*
     * 🚨 **`airingEpisode`, NOT `episode` — AND THIS IS THE SECOND HALF OF THE DOUBLE-BUMP BUG.**
     *
     * The two callers reach this line at different moments in the episode. Offline, `playEpisode`
     * folds and THEN does `state.episode += 1`, so `state.episode` is the episode that just aired.
     * Live, `playEpisode` has already returned — bump included — before the Verdict beat starts,
     * so `state.episode` is the episode being SET UP. Comparing that to `EPISODE_CAP` ended a live
     * season one episode early: `party-night` N17n drove a real room and it stopped after four of
     * five, while `win-machine` W10c drove the offline one and it stopped after five. Two machines
     * disagreeing while both had a gate calling them correct is precisely what `episode-order`
     * exists for, one layer up.
     *
     * `state.airingEpisode` is the episode ON THE AIR and is set by both paths at the top of the
     * episode, so it means the same thing in both. Offline it is identical to `state.episode`
     * here, so nothing about the gates' existing behaviour moves.
     */
    const aired = state.airingEpisode ?? state.episode;
    state.outcome = w.outcome === OUTCOME.RENEWED && aired >= EPISODE_CAP ? OUTCOME.CANCELLED : w.outcome;
    /*
     * 🚨 `fed` IS SEALED AND MUST STAY SEALED. `win.checked` is VIS.SEALED and carries it;
     * `verdict.aired` is VIS.PUBLIC and does not. `rrr-social-round.md` §4: the feed gauge is a
     * deliberately lossy proxy, and evil losing a partner looks exactly like evil winning — so
     * airing the number would hand the room a deduction the design spent a whole beat denying it.
     * Anything reading `foldWin`'s result for a payload must pick fields, never spread it.
     */
    record(makeEvent('win.checked', VIS.SEALED, { outcome: state.outcome, rule: w.rule, camerasLit: w.camerasLit, fed: w.fed }));
    record(makeEvent('verdict.aired', VIS.PUBLIC, {
      status: state.outcome, camerasLit: w.camerasLit, alarms: state.incident.alarms,
    }));
    /*
     * 📷 **THE TARGET TRAVELS WITH THE COUNT.** `foldWin` decides W2 against
     * `WIN_TARGETS[n].cameraTarget`. Chrome `needed` is `COMPOSITION[n].cameras`.
     * At eight those used to be 4 and 3; 30 Aug locked them both at 4.
     * The plate still reports THIS fold's `need`, never a second table.
     */
    return {
      outcome: state.outcome, rule: w.rule,
      camerasLit: w.camerasLit, need: WIN_TARGETS[count]?.cameraTarget ?? null,
      episode: aired,
    };
  }

  /**
   * Job landed (`mission.return`). Public camera unlock. Recap reads
   * `run.camera_lit`. Live nights never hit the playEpisode scaffold.
   * Smash always returns on a hit. Drill only returns when the mount finished
   * — a dark mount never enters return, so it never lights.
   */
  function lightCameraFromJob(job) {
    state.cameras.unlocked += 1;
    record(makeEvent('run.camera_lit', VIS.PUBLIC, {
      camera: state.cameras.unlocked,
      episode: state.airingEpisode ?? state.episode,
      job: job ?? null,
    }));
  }

  function revealPendingTool() {
    if (!state.pendingTool) return;
    state.cameras.tool = state.pendingTool;
    record(makeEvent('run.cam_tool', VIS.PUBLIC, { shot: state.pendingTool }));
    state.pendingTool = null;
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
    /**
     * Host-driven / show-clock: open CASTING and wait for phone ballots.
     *
     * ⚠️ **CLEARS THE LAST PAIR.** `playEpisode` leaves `state.pair` set so a recap card can
     * still name who walked. The next ballot is a new nomination — if the pair stays, phones
     * paint "Locked." and the host treats a historic `cast.pair` as already sent. Episode 2
     * never starts.
     */
    beginCasting() {
      // Next ballot is for state.episode (already bumped after the last playEpisode).
      state.airingEpisode = state.episode;
      state.pair = { runner: null, guide: null };
      state.liveLiving = null;
      state.lynchVotes = {};
      state.failChromeSent = false;
      revealPendingTool();
      for (const s of sockets) {
        if (s.isTV) continue;
        s.seatRole = null;
      }
      setPhase('CASTING');
    },
    /** Live clock: Recap has aired; seated talk. `playEpisode` already walked this for gates. */
    enterDebrief() {
      setPhase('DEBRIEF');
    },
    /** Live clock: mission just finished. Show beat is recap; phase matches. */
    enterRecap() {
      setPhase('RECAP');
    },
    episodeLiving,
    /**
     * Live SHOW clock: open Reckoning. Clears standing noms for this episode.
     * `playEpisode` still owns the premiere skip; this is the TV/phone path.
     */
    enterReckoning(livingOpt = null) {
      state.nominations = [];
      state.lynchVotes = {};
      state.voteResult = null;
      state.execution = null;
      state.liveLiving = Array.isArray(livingOpt) && livingOpt.length ? livingOpt.slice() : null;
      setPhase('RECKONING');
    },
    /**
     * One public nomination. `vote.js` is the rule; this is the room applying it.
     * @returns {{ok:boolean, why?:string, nomination?:object, closed?:boolean}}
     */
    nominatePlayer(nominator, target, livingOpt = null) {
      if (state.phase !== 'RECKONING') return { ok: false, why: 'not reckoning' };
      if (livingOpt && Array.isArray(livingOpt)) state.liveLiving = livingOpt.slice();
      const living = episodeLiving();
      const result = nominate({ living, nominations: state.nominations }, nominator, target);
      if (!result.ok) return result;
      state.nominations.push(result.nomination);
      record(makeEvent('nom.made', VIS.PUBLIC, result.nomination));
      broadcast();
      return {
        ok: true,
        nomination: result.nomination,
        closed: reckoningClosed({ living, nominations: state.nominations }),
      };
    },
    enterVote(livingOpt = null) {
      if (livingOpt && Array.isArray(livingOpt)) state.liveLiving = livingOpt.slice();
      const living = episodeLiving();
      // Nominators are already on the record for their target — they do not vote again.
      state.lynchVotes = assumedLynchVotes(state.nominations, living);
      setPhase('VOTE');
    },
    /**
     * One simultaneous ballot. Choice is a standing nominee or NO_ONE.
     * Self-vote is illegal (John 2026-08-24): coerce to NO_ONE so a malicious
     * client cannot record a vote for themselves. Votes stay on the room until
     * `closeVote` airs them (design §4).
     *
     * A nominator of a standing target is locked to that target and cannot
     * recast — `assumedLynchVotes` already wrote it on `enterVote`.
     */
    castLynchVote(voter, choice, livingOpt = null) {
      if (state.phase !== 'VOTE') return { ok: false, why: 'not vote' };
      if (livingOpt && Array.isArray(livingOpt)) state.liveLiving = livingOpt.slice();
      const living = episodeLiving();
      if (!living.includes(voter)) return { ok: false, why: 'not living' };
      const locked = nominatorLockedChoice(state.nominations, voter);
      if (locked) {
        state.lynchVotes[voter] = locked;
        if (choice !== locked) return { ok: false, why: 'nominator vote locked', choice: locked };
        return { ok: true, choice: locked, locked: true };
      }
      const standing = state.nominations.map((n) => n.target);
      const allowed = canLynchVote(voter, choice, standing);
      const pick = (allowed.ok && choice !== NO_ONE) ? choice : NO_ONE;
      state.lynchVotes[voter] = pick;
      return allowed.ok
        ? { ok: true, choice: pick }
        : { ok: true, choice: pick, why: allowed.why };
    },
    /**
     * 📊 **HOW FULL THE BALLOT BOX IS — A COUNT AND A THRESHOLD, NEVER A NAME.**
     *
     * The deadest stretch in the night was a Vote with every ballot already in and twenty-two
     * seconds still on the clock, on a television that said nothing about either. Casting already
     * arms a 3·2·1 when the last ballot lands and Debrief already shows "0 of 5 ready"; the lynch
     * ballot was the one that showed neither.
     *
     * ⚠️ **NO `who` AND NO `counts`.** Who has voted is a live read on the room, and what they
     * voted for is aired at the Execution twenty-five seconds later — either one on the wire
     * during the Vote would hand the room the result early and turn the last ballot into a
     * formality. `in` is a cardinality of the ballot box, nothing more. Same reasoning, and the
     * same shape, as `FANOUT_KEYS.ready`.
     *
     * Nominators are pre-filled by `assumedLynchVotes` on `enterVote`, so they are counted in
     * from the first frame — which is correct: their nomination IS their ballot and they are not
     * asked again.
     */
    lynchProgress() {
      const living = episodeLiving();
      const cast = living.filter((id) => state.lynchVotes[id] !== undefined).length;
      return { in: cast, living: living.length, need: Math.floor(living.length / 2) + 1 };
    },
    closeVote,
    enterExecution() {
      if (!state.voteResult) closeVote();
      setPhase('EXECUTION');
    },
    /**
     * ⚖️ **THE LIVE VERDICT BEAT — a RE-FOLD, and deliberately nothing else.**
     *
     * ⚠️ I first wrote this to bump `state.episode`, reasoning that the live wire never called
     * `playEpisode` so nothing counted episodes. **That was wrong and `party-night` N17h caught
     * it**: `runEpisodeFromBallots` in `net/party/local.mjs` calls `playEpisode` when casting
     * resolves, so the bump — and `lastPair`, and clearing `seatRole` — already happen there.
     * Doing them again here counted every episode twice.
     *
     * So this folds and airs, full stop. Re-folding is not redundant: `playEpisode` runs at
     * CASTING time, over a log that does not yet contain the expedition, the nominations or the
     * execution. By the time the verdict beat is reached the log has all three, and `foldWin` is
     * a pure fold over the whole log — so the second answer is the true one.
     *
     * ⚠️ **KNOWN WART, STATED RATHER THAN HIDDEN.** That means a live episode records
     * `win.checked` / `verdict.aired` twice: once early and stale, once complete. The fix is to
     * stop `playEpisode` folding when the live wire is driving, which means teaching it that it
     * is not the whole episode — a bigger change than this beat, and its own slice.
     *
     * Returns what the TV needs to air. `fed` is deliberately not in it — see `foldVerdict`.
     */
    enterVerdict() {
      setPhase('VERDICT');
      return foldVerdict();
    },
    /* ===========================================================================================
     * 🛑 **THE HOST CALLS THE NIGHT — the one control that ends a session by hand.**
     *
     * `win.js` W6 has anticipated this since the fold was written: `host.skip` fires ABANDONED,
     * and until now **nothing in the codebase had ever emitted the event**. A rule with no
     * emitter is a rule nobody has ever seen run.
     *
     * 🚨 **THE SKIP IS RECORDED BEFORE THE PHASE, AND THE ORDER IS THE WHOLE CORRECTNESS.**
     * `foldWin` resolves by LOG ORDER and breaks on the first rule that fires — so writing
     * `phase.VERDICT` first would let W5 (RENEWED at the cap is a CANCELLED) beat the host's own
     * call by one sequence number, and a night the host abandoned would be recorded as a win for
     * Production. Skip first; then the phase; then fold.
     *
     * ⚠️ **AN ALREADY-DECIDED SEASON IS NOT OVERWRITTEN, AND THAT IS NOT A BUG.** If a rule fired
     * earlier in the log it is earlier in the log, and the fold keeps it: the host pressing SKIP
     * after the cameras came up does not take the win away from the cast. What the skip
     * guarantees is that the night ENDS, not that nobody won it.
     *
     * ABANDONED is public: `rrr-social-round.md` gives no side the win, so there is nothing to
     * conceal about it. The alignments it stops short of are still the Reunion's to reveal.
     * =========================================================================================== */
    skipToReunion() {
      record(makeEvent('host.skip', VIS.PUBLIC, { episode: state.episode }));
      setPhase('VERDICT');
      return foldVerdict();
    },
    /** The session's outcome so far, or null while it is still RENEWED. */
    outcome: () => state.outcome,
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
     * 🌍 **THE TV REPORTS THE WORLD. THE ROOM DECIDES WHO IS TOLD.**
     *
     * Called from the transport on a `{ t:'world' }` from the TV socket, at about 2 Hz. It writes
     * ground truth into `state.world`, ages the good players' sighting, appends a mission event
     * when the mission moves, and broadcasts. `net/party/local.mjs` has already run
     * `worldViolations`, so this can only ever receive rooms, coordinates and a mission phase.
     *
     * ⚠️ **THE STALE SIGHTING IS HELD HERE, NOT ON THE PHONE.** A client-side delay is a
     * suggestion — the fresh value would still be on the wire. `worldStale` is only refreshed once
     * `STALE_MAX` has elapsed, so the vague read is genuinely old by the time it is projected.
     * `age` is in ticks-of-report scaled to seconds at the caller's 2 Hz; it is approximate on
     * purpose, because a precise age is itself information.
     *
     * @returns {boolean} true when the mission phase changed, so the transport can act on it
     */
    setWorld({ runner = null, hunter = null, mission = null, view = null } = {}) {
      const wasPhase = state.world?.mission?.phase ?? 'none';
      state.worldTick += 1;
      state.world = { runner, hunter, mission, view };

      /*
       * ⚠️ **RE-ASSERT THE SEAT ROLES, BECAUSE `playEpisode` CLEARS THEM BEFORE THE RUN IS OVER.**
       *
       * Its last two lines are `state.episode++` and clearing every `seatRole` — correct for a
       * function that models a whole episode as one synchronous call, and wrong now that the run
       * is a live thing happening afterwards on the TV. Without this the guide loses the `guide`
       * audience the moment the pair is locked, and the map they were just handed goes blank.
       *
       * Derived from `state.pair`, which is public and is what the phones are already rendering
       * from, so this cannot invent a crew member the room has not seen elected.
       */
      for (const s of sockets) {
        if (s.isTV || !s.playerId) continue;
        if (s.playerId === state.pair?.runner) s.seatRole = 'runner';
        else if (s.playerId === state.pair?.guide) s.seatRole = 'guide';
        else s.seatRole = null;
      }

      const ageSeconds = 0.5;                       // the TV reports twice a second
      if (hunter?.room) {
        const prev = state.worldStale;
        const aged = (prev?.age ?? STALE_MAX) + ageSeconds;
        state.worldStale = aged >= STALE_MAX
          ? { ...hunter, age: 0 }
          : { ...prev, age: aged };
      }

      const phase = mission?.phase ?? 'none';
      const moved = phase !== wasPhase;
      if (moved && phase !== 'none') {
        /*
         * 🚨 PUBLIC, AND CARRYING NO ATTRIBUTION. `party-anon` A4's rule applies to a mission
         * beat exactly as it does to a failure: the room may know the painting broke, and may not
         * be told anything about who was standing where when it did. The room id is the ROOM, and
         * the pair is already public on `pair`.
         */
        record(makeEvent(`mission.${phase}`, VIS.PUBLIC, { room: mission?.room ?? null }));
        /*
         * Job landed. Recap CAM LIT reads `run.camera_lit` from the vis log.
         * Live Send-them-in never emitted it (scaffold-only in playEpisode), so
         * every execute recap printed CAM DARK after cameras 1/3. party-loop.md:
         * cameras unlock as the goods' public reward when the task lands; a
         * take leaves that terminal dark. `return` is the smash or a finished
         * mount. `done` is home. A drill that never mounted never returns.
         */
        if (phase === 'return') {
          const spec = missionFor(state.airingEpisode ?? state.episode);
          const job = mission?.job === JOB.DRILL || mission?.job === JOB.SMASH
            ? mission.job
            : spec.job;
          lightCameraFromJob(job);
          if (job === JOB.DRILL) {
            state.pendingTool = drillShotFor(state.worldSeed, state.airingEpisode ?? state.episode);
          }
        }
        if (phase === 'done') {
          const nail = mission?.emptyNail;
          if (nail === 'left' || nail === 'right') {
            record(makeEvent('run.wall_still', VIS.PUBLIC, { emptyNail: nail, job: JOB.SMASH }));
          }
          setPhase('RECAP');
        }
      }
      if (mission?.heard && !state.failChromeSent) {
        state.failChromeSent = true;
        record(makeEvent('run.fail_chrome', VIS.PUBLIC, { line: FAIL_CHROME.take }));
      }
      broadcast();
      return moved;
    },
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
      send(sock.id, projectFor(sock));
    },
    /**
     * Field paths this room built that the entitlement matrix had no row for. Empty on a healthy
     * room. Belongs to the gate — `party-isolation` I1c — and to nobody else: it is the only way
     * a silently-dropped field can be seen from outside `project`. See `unrowedSeen`.
     */
    unrowed: () => [...unrowedSeen],
    /* ===========================================================================================
     * 🏆 **THE REUNION SPECIAL, COMPUTED — the room's whole night, read back off its own log.**
     *
     * `src/party/reunion.js` has been written, complete and fully exercised by
     * `harness/reunion-truth.mjs` since long before anything called it: six exported queries and
     * no product caller. This is the caller.
     *
     * 🚨 **THERE IS NO SECOND REVEAL PIPELINE, AND THIS IS THE LINE THAT KEEPS THAT TRUE.** It
     * passes `log.all()` — the same stream the live filter reads — so a leak and a missing reveal
     * are the same bug, and the only way to add something to the Reunion is to write the event
     * during play. A hand-assembled reveal payload would let the two drift for a month.
     *
     * ⚠️ **IT DOES NOT CHECK THE PHASE, AND IT MUST NOT.** Deciding when the reveal is allowed is
     * the transport's job (`enterReunionLive`), and putting a second guard here would make the
     * real one look optional. This is a query; the room decides when to ask it.
     * =========================================================================================== */
    reunionSpecial() {
      const align = Object.fromEntries(deal.seats.map((s) => [s.id, s.alignment]));
      return reunion(log.all(), { alignmentOf: (id) => align[id] });
    },
    /** Ground truth. Belongs to the gate and the Reunion. Never to a socket. */
    truth: () => ({
      seats: deal.seats.map((s) => ({ ...s })),
      evil: deal.evil.slice(),
      castSeed,
    }),
  };
}
