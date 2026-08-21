#!/usr/bin/env node
/**
 * 📺 **THE SHOW — M3, the faceless social game. A television, eight phones, no mansion.**
 *
 *   npm run party:show            then open the printed URL on the TV
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT IS HERE AND WHAT IS DELIBERATELY NOT
 * ---------------------------------------------------------------------------------------------
 * Everything the mode IS: the circle, the shooting clock, the casting ballot, the expedition
 * call, the reckoning, the aired vote, the sledgehammer, the verdict and the Reunion roll call.
 * **Not** the mansion — the expedition is two taps and a coverage-gated hunter mark rather than a
 * robot in a corridor. That is the whole point of M3: the social game has to be worth playing
 * before the renderer is worth writing, and if it is not, no amount of Three.js rescues it.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 THIS PROCESS IS THE ONLY THING THAT KNOWS WHO IS WHAT.
 * ---------------------------------------------------------------------------------------------
 * `session.js` hands every frame to `project()` before it reaches this file, and every event
 * through `visibleTo`. There is no code path below that sends the same buffer to two sockets, no
 * broadcast helper, and no snapshot on reconnect — a resuming phone is caught up through
 * `replayFor`, which is the same filter applied to history. `net/server.mjs` L114-120 and L335-336
 * are the two bugs in this repo's own past that shape those three sentences.
 *
 * ⚠️ `/report` WITHHOLDS THE GAME LOG **AND BOTH SEEDS** UNTIL THE REUNION, AND THAT IS NOT
 * PARANOIA. Anyone on the wifi can GET it, including the eight people playing — the cheat is to
 * read the address off the television and add five characters. Until the show ends it serves
 * connection health only; the sealed stream is served once there is nothing left to spoil.
 *
 * ⚠️ **`?role=sim` AND `?role=tv` ARE A LEASE, NOT A QUERY STRING.** `rrr-netplay.md` §3 is
 * explicit — *"`hostKey` is generated on the TV and burned into the QR; a phone cannot claim the
 * lease"* — and §8, *"Exactly one lease holder. A second `hello{hostKey}` supersedes."* The same
 * document condemns `net/server.mjs` L298-306's unauthenticated `debug` command as something that
 * *"must not survive contact with a phone"*; a privileged role granted on five characters of URL
 * is that command with a different name. See `grant()` for what a claim now has to carry.
 *
 * ⚠️ ZERO DEPENDENCIES, NO BUILD STEP. Same reason as `spike.mjs`: this repo ships no
 * `node_modules` and a party server you cannot start at a party does not get started.
 */

import crypto from 'node:crypto';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeCode, MAX_PHONES } from './local.mjs';
import {
  createLobby, note, send, seatJoin, seatDrop, freezeRoster, roster, report,
  lanAddress, wsAccept, readFrames,
} from './lobby.mjs';
import { createSession, LOBBY } from '../../src/party/session.js';
import { PHASE } from '../../src/party/phases.js';
import { COMPOSITION } from '../../src/party/cast.js';
import { camerasLive } from '../../src/party/coverage.js';
import { reunion } from '../../src/party/reunion.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const page = (f) => readFileSync(join(HERE, f), 'utf8');

/** How often the clock is looked at. Nothing depends on the interval — `tick` takes the time. */
export const TICK_MS = 250;

/**
 * 🚨 **HOW LONG A CHAIR MAY SAY NOTHING BEFORE THE ROOM STOPS COUNTING IT.**
 *
 * `s.live` was cleared by `seatDrop` and by nothing else, and `seatDrop` fires on socket close. A
 * battery death, a phone dropped into a bag, a walk out of range: none of those send a FIN. There
 * was no keepalive, no `lastPong` and no timeout anywhere in this process — `rtt` was pushed and
 * read only by `report()` — so a phone that answered no pings at all stayed `live: true` with
 * `drops: 0` and was counted by `begin()`, dealt a role, and put into a vote threshold that then
 * needed every remaining real voter. Node's default TCP keepalive is two hours; the show is 33
 * minutes. **The server was already sending the evidence four times a second and throwing it
 * away.**
 *
 * ⚠️ SIX SECONDS, AND THE DOC'S NUMBER IS NOT THE RIGHT ONE HERE. `rrr-netplay.md` §8 says three
 * missed beats of a 5 s heartbeat; this server's beat is `TICK_MS`, so the same rule literally
 * applied would be 750 ms and would call a phone dead for backgrounding itself for a moment. Six
 * seconds is twenty-four missed beats — long enough that no foreground phone reaches it, short
 * enough that the host pressing START twenty seconds later is counting the room and not the guest
 * list. A seat that goes quiet is marked away, not dropped: its token still buys the chair back,
 * and one frame from it — a pong will do — brings it straight back onto the rail.
 */
export const AWAY_MS = 6000;

export const MIN_PLAYERS = Math.min(...Object.keys(COMPOSITION).map(Number));

/** Seat 0 is `p1`. `cast.js` numbers players from one and seats from zero; this is the only bridge. */
export const playerIdOf = (seatNo) => `p${seatNo + 1}`;
export const seatNoOf = (playerId) => Number(playerId.slice(1)) - 1;

/**
 * 🚨 **THE SEEDS ARE 32 RANDOM BITS EACH, AND THE ARITHMETIC THEY REPLACED WAS THE SECOND HALF OF
 * A LEAK THE GATE ON `/report` COULD NOT CLOSE ON ITS OWN.**
 *
 * They were `seedFrom(code, 'cast'|'world', stamp, count)`. Every one of those four inputs is
 * public or nearly so: `code` is on the television in 60pt, `count` is in every roster frame, and
 * `stamp` was `Date.now()` at `begin()` — which `/report`'s own `durationMs` pins to a window a
 * few thousand milliseconds wide, because it is `Date.now() - lobby.startedAt` evaluated one
 * statement later. So the *health* half of the report — "the half nobody has to hide" — was a
 * search key for the half that is the whole game. Held out on unseen games, filtering candidates
 * with nothing but the attacker's own card and the publicly-announced wings names **both traitors
 * 80.4% of the time at eight players after two episodes, and 84% at five**, against a 4.8% chance
 * baseline. Withholding the seed field while leaving the derivation in place fixes none of that:
 * the seed was never the secret, the arithmetic was.
 *
 * `rng` in `cast.js` does `seed >>> 0`, so 32 bits is the entire entropy the deal can consume and
 * four random bytes is the whole of it. What changes is that those 32 bits are now unguessable
 * rather than a hash of four printed values, which is what collapses the search above to chance.
 *
 * ⚠️ REPLAYABILITY IS NOT LOST, IT MOVED. The seeds still come home in `/report` — after the
 * Reunion, in the same breath as the log, behind the gate that already exists for exactly this
 * question. A game is replayed from the report rather than from four values printed at the start.
 */
export const randomSeed = () => crypto.randomBytes(4).readUInt32BE(0);

/**
 * FNV-1a over the printed values — **the derivation above, kept for `party-surface`'s control and
 * called by nothing in this process.**
 *
 * ⚠️ EXPORTED FOR THE GATE AND FOR NOBODY ELSE, in the shape `session.js` states for `hash`/`pick`:
 * the gate has to run the actual recovery attack against a control built from this file, and a
 * gate that re-implemented the derivation would be measuring its own copy rather than the code
 * that shipped. `party-surface` W3 asserts on the source that no caller in `net/party` or
 * `src/party` reaches it — the D8 property, so nobody can innocently seed a show with it again.
 */
export function seedFrom(...parts) {
  let h = 0x811c9dc5 >>> 0;
  const s = parts.join(':');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/**
 * ⚠️ `stamp` NO LONGER REACHES ANYTHING. It was the third input to the seed derivation and is kept
 * only because every caller in `harness/` passes it and because the control `party-surface` builds
 * out of this file has to compile against the same signature to reproduce the old arithmetic.
 * Nothing below reads it.
 */
export function startShow({ port = 5183, code = makeCode(), stamp = Date.now(), hostKey = null,
  awayMs = AWAY_MS } = {}) {
  const lobby = createLobby(code);
  let show = null;                       // { session, castSeed, worldSeed, startedAt }
  let simSock = null;                    // the mansion, when one is attached

  /**
   * 🚨 **THE LEASE. TWO PRIVILEGED ROLES, ONE KEY, AND A PHONE CANNOT CLAIM EITHER.**
   *
   * `?role=sim` and `?role=tv` used to be granted on the query string alone, with no key anywhere
   * in the process. Measured, from an unauthenticated socket: `role=sim` was sent the brief
   * carrying `worldSeed`, **was** the mansion — one `{t:'expedition', outcome:'taken'}` and the
   * runner died — and could set `sim.hunter.room`, which `sightForGuide()` and `hunterHere` read,
   * so it could lie to the guide's flyover and grade the episode. `role=tv` took `lobby.tv` from
   * the real television, which then went silent with **nothing on screen to explain it** (§6.5
   * forbids a spinner or an error card there, and a healthy socket says nothing), and unlocked
   * `start` and `skip`: the whole clock. Both could also send `{t:'join'}` on the same socket, so
   * one connection was a seated player *and* the house.
   *
   * The rule, from `rrr-netplay.md` §3/§8:
   *
   *   · a claim carrying `?key=<hostKey>` is granted, always — that is the lease holder returning,
   *     or the television's own 3D frame, which is handed the key by the page that mounts it;
   *   · a claim carrying no key, or the wrong one, is granted **only while the lease is still
   *     open** — and taking it closes the lease and hands that socket the key;
   *   · every later claim without the key is refused with a reason and the socket is closed.
   *
   * ⚠️ THE TRUST ANCHOR IS THE ROOM, AND IT IS WORTH NAMING RATHER THAN PRETENDING OTHERWISE.
   * The lease opens to whoever claims first because the address a phone would have to type is
   * *printed by the television* — nobody has it until the TV is already up. That is the same
   * anchor the doc's QR has, expressed in this transport. A host who wants no trust-on-first-use
   * at all passes `hostKey` (`--key` on the command line, printed in the banner): the lease starts
   * closed and every claim, including the first, has to carry it.
   *
   * ⚠️ THE KEY IS NEVER IN AN HTTP BODY. `/` serves the television page to anyone who asks — a
   * phone that types the address gets it — so a key baked into that page would be no key at all.
   * It reaches exactly one socket, the one whose claim was granted.
   */
  const lease = { key: hostKey || crypto.randomBytes(16).toString('hex'), open: !hostKey };
  const grant = (role, key) => {
    if (key === lease.key) return role;
    if (!lease.open) return null;
    lease.open = false;
    return role;
  };
  /** §8: *"the old TV goes to a 'this game moved' screen"*. It is told; it does not just stop. */
  const displace = (old, sock, what) => {
    if (!old || old === sock) return;
    send(old, { t: 'moved', why: 'this show moved to another screen' });
    note(lobby, `${what}.superseded`);
    old.end();
  };

/**
 * 🚨 THE SIMULATOR'S BRIEF IS FOUR FIELDS, AND THE SHORTNESS IS THE POINT. A wing, a camera
 * count, a world seed and an episode number. No roster, no seats, no alignment — a 3D client
 * that never receives an identity cannot leak one however it is written, and this is the only
 * message it is ever sent.
 */
  const briefFor = (session) => ({
    t: 'brief',
    wing: session.state.expedition.room,
    // The number of cameras actually watching rooms, which is what a renderer needs — not the
    // scoreboard's count of what the crew has earned. `coverage.js` owns the difference.
    cameras: camerasLive(session.state.cameras.unlocked),
    worldSeed: session.state.worldSeed,
    episode: session.state.episode,
  });

  // ---------------------------------------------------------------- delivery
  const sockFor = (socketId) => (socketId === 'tv' ? lobby.tv : lobby.seats.get(socketId)?.sock);
  const deliver = (socketId, msg) => send(sockFor(socketId), msg);

  /**
   * 🚨 **THE CAMERA COUNT, WHILE THE HOUSE IS RUNNING, AND NOTHING WAS SENDING IT.**
   *
   * `src/views/expedition.js` has a handler for `{t:'cams', unlocked}` — it is what moves
   * `camerasUnlocked`, which drives the guide's coverage, the Director's cutaway budget and the
   * feed's own camera roster mid-expedition. Nothing in this process, or anywhere else, ever sent
   * that message: the view took its camera count from the query string at load and it never
   * changed again for the rest of the show. A handler nothing feeds reads as coverage and is dead
   * code, which is the second half of what `wire-parity` P1b exists to catch.
   *
   * ⚠️ IT SENDS `camerasLive`, NOT `cameras.unlocked`, AND THE DIFFERENCE IS A WHOLE CAMERA.
   * `coverage.js` keeps the two apart on purpose: the scoreboard counts what the crew has EARNED,
   * from zero, and the house needs the number actually watching rooms — which includes the
   * establishing camera. `briefFor` already sends the live number under `cameras`; this sends the
   * same number under the name the view reads it by.
   */
  let lastCams = null;
  const pushCams = (session, { force = false } = {}) => {
    if (!simSock || !session) return;
    const live = camerasLive(session.state.cameras.unlocked);
    if (!force && live === lastCams) return;
    lastCams = live;
    send(simSock, { t: 'cams', unlocked: live });
  };

  const pushRoster = () => {
    const r = roster(lobby);
    send(lobby.tv, { t: 'roster', players: r, capacity: MAX_PHONES, started: !!show });
    for (const s of lobby.seats.values()) send(s.sock, { t: 'roster', players: r, you: s.seat, started: !!show });
  };

  /**
   * 🚨 THE SHOW IS CAST FROM WHO IS IN THE ROOM, NOT FROM WHO EVER OPENED THE PAGE. This counted
   * `lobby.seats.size`, which includes the seats `seatDrop` marks dead and keeps for reclaim — so
   * eight joins and three closed browsers dealt eight roles, some to nobody, and set the execution
   * threshold at 5 of the 5 people still present. Unanimity, for ever. `freezeRoster` states the
   * window and does the renumbering; the check runs on the live count BEFORE anything is evicted,
   * so a host who presses START too early is told the number and loses nobody's chair.
   */
  function begin(now) {
    if (show) return { ok: false, why: 'already shooting' };
    const present = [...lobby.seats.values()].filter((s) => s.live).length;
    if (!COMPOSITION[present]) return { ok: false, why: `${present} players — the deck runs ${MIN_PLAYERS}-${MAX_PHONES}` };
    const frozen = freezeRoster(lobby);
    const count = lobby.seats.size;
    // 🚨 A RENUMBERED SEAT HAS TO BE TOLD. The phone stores its seat index from `seated` and finds
    // itself in every later roster by it; a phone still holding seat 5 after the roster closed up
    // to seven reads somebody else's name, colour and ping off the rail.
    for (const st of lobby.seats.values()) {
      send(st.sock, {
        t: 'seated', seat: st.seat, name: st.name, colour: st.colour, token: st.token,
        playerId: playerIdOf(st.seat), started: true,
      });
    }
    if (frozen.dropped.length) note(lobby, 'roster.frozen', { kept: frozen.kept, evicted: frozen.dropped.length });
    // 🚨 RANDOM, NOT DERIVED — see `randomSeed` above for the 80.4% that says why. Never sent,
    // because `cast.js`'s header is unambiguous that a client holding `castSeed` can deal the
    // whole table itself; and now not reconstructible either, which is the half a gate on the
    // wire cannot reach.
    const castSeed = randomSeed();
    const worldSeed = randomSeed();
    const names = [...lobby.seats.values()].sort((a, b) => a.seat - b.seat).map((s) => s.name);
    const session = createSession({
      count, castSeed, worldSeed, names,
      send: (id, frame) => deliver(id, { t: 'state', frame }),
      emit: (id, ev) => deliver(id, { t: 'event', ev }),
    });
    show = { session, castSeed, worldSeed, startedAt: now };
    /**
     * 🚨 **THE SECOND COPY. The seeds were written into the event log here, and `report()` returns
     * `lobby.events` RAW — so gating the `show.castSeed` field alone left the same two integers in
     * the same response, four lines further down.** The log is the deliverable; it does not get to
     * carry the one value that is not allowed out. The count is what an event log needs.
     */
    note(lobby, 'show.started', { count });
    session.start(now);
    return { ok: true };
  }

  // ---------------------------------------------------------------- http
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(page('show-tv.html'));
    }
    if (url.pathname === '/p') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(page('show-phone.html'));
    }
    /**
     * 🚨 **ONE GATE, AND EVERYTHING THAT SPOILS THE SHOW IS BEHIND IT.**
     *
     * The seeds sat OUTSIDE the `over` check while the log sat inside it — the notice reading
     * *"the game log is served after the Reunion"* was printed four lines under the two integers
     * it was written to protect. `dealCast({count, castSeed})` is every role, both alignments, the
     * Production roster and the Glitched's cover, and `count` is in every roster frame; a critic
     * got an exact match on the first try. `pick(6, worldSeed, 'hunter', ep)` is every episode's
     * Hunter room, available before episode one is cast. No devtools, no socket: the address off
     * the television, plus `/report`.
     *
     * ⚠️ THE SEALED STREAM IS SERVED ONLY ONCE THERE IS NOTHING LEFT TO SPOIL. Anyone on the
     * wifi can fetch this, the eight people playing included. What is served while the show is on
     * the air is connection health and the phase — nothing a player could not read off the
     * television — and `party-surface` walks the whole response to say so.
     */
    if (url.pathname === '/report') {
      const over = show && show.session.state.phase === PHASE.REUNION;
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(report(lobby, {
        show: show ? {
          phase: show.session.state.phase,
          episode: show.session.state.episode,
          outcome: show.session.state.outcome,
          // The seeds come home with the log and never before it — one gate, one moment.
          ...(over ? { castSeed: show.castSeed, worldSeed: show.worldSeed } : {}),
        } : null,
        log: over ? show.session.log.all() : undefined,
        withheld: show && !over ? 'the game log and the seeds are served after the Reunion' : undefined,
      }), null, 2));
    }
    res.writeHead(404); res.end('no');
  });

  // ---------------------------------------------------------------- sockets
  server.on('upgrade', (req, sock) => {
    const key = req.headers['sec-websocket-key'];
    if (!key) return sock.destroy();
    wsAccept(sock, key);

    const q = new URL(req.url, 'http://x').searchParams;
    const wants = q.get('role') === 'tv' ? 'tv' : q.get('role') === 'sim' ? 'sim' : null;
    const role = wants ? grant(wants, q.get('key')) : null;
    if (wants && !role) {
      // A refusal a phone can read, and a line in the report so the host can see it happened.
      note(lobby, 'lease.refused', { role: wants });
      send(sock, { t: 'denied', why: 'this show already has a television' });
      return sock.end();
    }
    const isTV = role === 'tv';
    const isSim = role === 'sim';
    const privileged = isTV || isSim;
    let seat = null;

    /**
     * 🚨 **THE CHAIR'S AUTHORITY IS ITS CURRENT SOCKET, NOT THE ONE THIS CLOSURE STARTED WITH.**
     *
     * `seatJoin` hands a chair back by token, and it does that by rebinding `existing.sock` — so
     * the connection that used to hold it is still here, still holding `seat` in this closure, and
     * `act` read `playerIdOf(seat.seat)` out of it and never asked whether the chair was still
     * this socket's. A phone that lost its seat to a token kept casting ballots, publishing claims
     * and driving, and the server recorded them under the seat's player id.
     *
     * `seatDrop`'s own `seat.sock !== sock` guard already stops the mirror image of this — an old
     * socket closing and taking the new holder's chair down with it — and is left alone. This is
     * the same question asked on the way in.
     */
    const holds = () => !!seat && seat.sock === sock;

    if (isSim) {
      displace(simSock, sock, 'sim');
      simSock = sock;
      lastCams = null;
      note(lobby, 'sim.connected');
      /**
       * ⚠️ NOTHING IS SENT BACK TO ACKNOWLEDGE THE GRANT, AND THAT IS ON PURPOSE. `rrr-netplay.md`
       * §3 has the room reply `lease{granted, resumeSpec}` — but on this transport the mansion is
       * the frame `show-tv.html` mounts, and it is handed the key by the page that mounts it. A
       * `{t:'lease'}` frame would be an envelope with no reader, which is the exact shape
       * `wire-parity` P1/P5 exist to reject: it went red on this line the day it was written.
       * The simulator is told the wing and the camera count and NOTHING about who anyone is.
       */
      if (show) { send(sock, briefFor(show.session)); pushCams(show.session, { force: true }); }
    }

    if (isTV) {
      displace(lobby.tv, sock, 'tv');
      lobby.tv = sock;
      note(lobby, 'tv.connected');
      // 🚨 THE KEY RIDES THE FIRST FRAME OF THE GRANTED SOCKET AND GOES NOWHERE ELSE. The page
      // keeps it, presents it on every reconnect, and hands it to the mansion frame it mounts —
      // which is how the 3D half claims the sim role without anybody typing anything.
      send(sock, { t: 'hello', code: lobby.code, url: `http://${lanAddress()}:${port}/p`, capacity: MAX_PHONES, hostKey: lease.key });
      pushRoster();
      if (show) catchUp('tv', sock);
    }

    /**
     * 🚨 A RESUMING SOCKET IS CAUGHT UP THROUGH THE SAME FILTER, NEVER WITH A SNAPSHOT. This is
     * `net/server.mjs` L335-336's bug — `welcome` handing every joiner every peer's state — and
     * it is the one a hidden-role game cannot survive.
     */
    function catchUp(socketId, s) {
      const sess = show.session;
      const sk = sess.sockets.find((x) => x.id === socketId);
      if (!sk) return;
      for (const ev of sess.replayFor(sk)) send(s, { t: 'event', ev, replay: true });
      // One current frame, re-projected for this socket exactly as a live one would be.
      sess.refresh(socketId);
    }

    readFrames(sock, (m) => {
      const now = Date.now();

      /**
       * 🚨 ANY FRAME IS PROOF OF LIFE, NOT JUST A PONG — and a phone that comes back does not have
       * to wait for the next sweep to be a player again. `AWAY_MS`'s header has the rest.
       */
      if (holds()) {
        seat.lastSeen = now;
        if (!seat.live) {
          seat.live = true;
          note(lobby, 'seat.returned', { seat: seat.seat, name: seat.name });
          pushRoster();
        }
      }

      if (m.t === 'join' && !privileged) {
        /**
         * 🚨 A LATECOMER IS REFUSED WITH A REASON, NOT SEATED INTO A SHOW THAT HAS NO CARD FOR
         * THEM. Seating them is what used to happen and it is the worse of the two answers: the
         * cast was dealt for N players, so there is no `p(N+1)` — `catchUp` finds no session
         * socket and returns silently, the phone never receives a frame at all, and every tap
         * comes back `not in this show`. A black screen and eight refusals is not a smaller bug
         * than a closed door, it is the same bug with the sign taken down. Re-dealing to fit them
         * in would change everybody else's role mid-episode, which is not a thing a show does.
         *
         * ⚠️ THE TOKEN CHECK COMES FIRST, ALWAYS. A phone that locked and came back is not a
         * latecomer — it owns a chair with a role on it, and `seatJoin` is the one rule that
         * hands it back.
         */
        /**
         * 🚨 **ONE SOCKET, ONE CHAIR, AND THE SECOND ASK IS REFUSED RATHER THAN SEATED.**
         *
         * There was no "you already hold a seat" check at all. Four `{t:'join'}` down one
         * connection seated four players and delivered four `you` panels to one screen — one of
         * them a Production panel naming a real human as a teammate. A single extra chair knows
         * both traitors 24.9% of the time; two chairs 46.4%; four chairs 79.0%.
         *
         * ⚠️ AND IT IS ALSO WHAT MAKES `bye()` CORRECT. `seat` is one binding in this closure, so
         * a socket that could hold four chairs dropped only the LAST of them on close and left
         * the rest `live: true` behind a dead connection — phantom players, dealt cards, counted
         * in a threshold that then needed every real voter in the room. A critic reached seven
         * phantom-inclusive players and 4 of 4 real voters, unanimity, in four messages, with the
         * server answering `{"ok":true}` each time. That is precisely what `freezeRoster`'s own
         * header exists to prevent, arrived at from the other side. With one chair per socket the
         * closure cannot be wrong about which chair it holds.
         */
        if (seat) {
          send(sock, { t: 'refused', why: 'this phone already has a chair', was: 'join' });
          return;
        }
        const mine = m.token && [...lobby.seats.values()].find((st) => st.token === m.token);
        if (show && !mine) {
          note(lobby, 'seat.refused', { name: (m.name || '').slice(0, 14), reason: 'already rolling' });
          send(sock, { t: 'late', why: 'the show has already started' });
          return sock.end();
        }
        const r = seatJoin(lobby, m, sock);
        if (r.full) { send(sock, { t: 'full', capacity: MAX_PHONES }); return sock.end(); }
        seat = r.seat;
        send(sock, {
          t: 'seated', seat: seat.seat, name: seat.name, colour: seat.colour, token: seat.token,
          playerId: playerIdOf(seat.seat), started: !!show,
        });
        pushRoster();
        if (show) catchUp(seat.id, sock);
        return;
      }

      if (m.t === 'pong' && holds() && typeof m.at === 'number') {
        seat.rtt.push(now - m.at);
        if (seat.rtt.length > 200) seat.rtt.shift();
        return;
      }

      if (m.t === 'rename' && holds() && !show) { seat.name = (m.name || seat.name).slice(0, 14); pushRoster(); return; }

      // ---- the host's two buttons, and they are the TV's alone.
      if (m.t === 'start' && isTV) {
        const r = begin(now);
        send(sock, { t: 'notice', ok: r.ok, why: r.why || 'rolling' });
        pushRoster();
        return;
      }
      if (m.t === 'skip' && isTV && show) { show.session.skip(now); return; }

      /**
       * 🛰️ THE MANSION'S REPORT, AND THE ONE PLACE IT IS ALLOWED IN.
       *
       * `role=sim` is the television's 3D half — `src/views/expedition.js` — and it is the only
       * connection permitted to move a robot. It is NOT a player: it has no seat, no token and no
       * `you` block, and `session.simReport` takes positions and an outcome from it and nothing
       * else. Roles never travel this way, in either direction.
       */
      /**
       * ⚠️ `sock === simSock`, NOT `isSim || isTV`. The old guard asked what class of socket this
       * was rather than whether it is the house that is *currently* attached, so a superseded or
       * orphaned mansion could still end an expedition — and the television, which holds no
       * positions at all, could report them.
       */
      if ((m.t === 'sim' || m.t === 'expedition') && sock === simSock && show) {
        show.session.simReport(m);
        return;
      }

      // ---- a tap from a phone
      /**
       * ⚠️ AND IT IS TOLD, ONCE, RATHER THAN TAPPING INTO A VOID. Same reason the refusal below
       * goes back to the phone that sent it: a controller that silently ignores you is a
       * controller people stop trusting halfway through the evening. A phone that has been
       * superseded needs to know that is what happened.
       */
      if ((m.t === 'act' || m.t === 'drive') && seat && !holds()) {
        send(sock, { t: 'refused', why: 'this chair is on another phone', was: m.t });
        return;
      }

      /**
       * 🎮 THE RUNNER'S STICK. Relayed to the simulator, never applied here — the server has no
       * physics and must not pretend to. It checks one thing, which is the thing that matters:
       * that the phone sending it is THIS episode's runner.
       */
      if (m.t === 'drive' && holds() && show) {
        const st = show.session.state;
        if (st.phase !== PHASE.EXPEDITION) return;
        if (playerIdOf(seat.seat) !== st.pair.runner) {
          send(sock, { t: 'refused', why: 'you are not the runner', was: 'drive' });
          return;
        }
        send(simSock, { t: 'drive', heading: m.heading, detent: m.detent });
        return;
      }

      if (m.t === 'act' && holds() && show) {
        const r = show.session.input(playerIdOf(seat.seat), m.msg || {});
        // ⚠️ A REFUSAL GOES BACK TO THE PHONE THAT SENT IT. A controller that silently ignores you
        // is a controller people stop trusting halfway through the evening.
        if (!r.ok) send(sock, { t: 'refused', why: r.why, was: m.msg?.t });
      }
    });

    /** The `=== sock` guards are what stop a socket that was SUPERSEDED from clearing its
     *  replacement on the way out — `displace` closes the old one, and its `close` fires after the
     *  new one is already installed. */
    const bye = () => {
      if (isTV && lobby.tv === sock) { lobby.tv = null; note(lobby, 'tv.dropped'); }
      if (isSim && simSock === sock) { simSock = null; note(lobby, 'sim.dropped'); }
      if (seatDrop(lobby, seat, sock)) pushRoster();
    };
    sock.on('close', bye);
    sock.on('error', bye);
  });

  // ---------------------------------------------------------------- the clock
  let lastPhase = null;
  const beat = setInterval(() => {
    const now = Date.now();
    // Every chair with a socket still open, not just the ones currently counted — a seat that has
    // gone quiet has to be able to answer, or being marked away would be a one-way door.
    for (const s of lobby.seats.values()) send(s.sock, { t: 'ping', at: now });
    let wentQuiet = false;
    for (const s of lobby.seats.values()) {
      if (s.live && now - s.lastSeen > awayMs) {
        s.live = false;
        note(lobby, 'seat.silent', { seat: s.seat, name: s.name, quietMs: now - s.lastSeen });
        wentQuiet = true;
      }
    }
    if (wentQuiet) pushRoster();
    if (!show) return;
    show.session.tick(now);
    // A camera lit mid-show has to reach the house that is drawing it — see `pushCams`.
    pushCams(show.session);
    // The countdown is rendered from `clock.endsAt`, which every frame already carries, so no
    // extra traffic is needed to make it move. This only pushes when the phase itself changes.
    const st = show.session.state;
    if (st.phase !== lastPhase) {
      lastPhase = st.phase;
      if (st.phase === PHASE.EXPEDITION) { send(simSock, briefFor(show.session)); pushCams(show.session, { force: true }); }
      if (st.phase === PHASE.REUNION) {
        // 🚨 THE REUNION IS THE SAME REPLAY WITH THE FILTER OFF. `log.reunion()` IS `log.all()`,
        // and this is the first moment anything unfiltered has left this process.
        const align = Object.fromEntries(show.session.truth().seats.map((s) => [s.id, s.alignment]));
        const special = reunion(show.session.log.all(), { alignmentOf: (id) => align[id] });
        send(lobby.tv, { t: 'reunion', special, outcome: st.outcome });
        for (const s of lobby.seats.values()) send(s.sock, { t: 'reunion', special, outcome: st.outcome });
        note(lobby, 'show.ended', { outcome: st.outcome, episodes: st.episode - 1 });
      }
    }
  }, TICK_MS);

  server.listen(port, '0.0.0.0');
  return {
    server, lobby, port,
    // In-process callers — the harness, and `storyboard.mjs` — hold the lease by holding the key.
    hostKey: lease.key,
    sessionNow: () => show && show.session,
    begin,
    close: () => { clearInterval(beat); return new Promise((r) => server.close(r)); },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const port = +(argv[argv.indexOf('--port') + 1] || 5183);
  // `--key` closes the lease before anybody connects: every claim, the television's included, has
  // to carry it. Without it the lease opens to the first claimant, which on this transport is the
  // screen that prints the address in the first place.
  const s = startShow({ port, hostKey: argv.includes('--key') ? argv[argv.indexOf('--key') + 1] : null });
  const line = (l, v) => console.log(`  │  ${l.padEnd(8)}${v}`.padEnd(46) + '│');
  console.log(`\n  ┌─────────────────────────────────────────────┐`);
  line('TV', `http://${lanAddress()}:${port}`);
  line('PHONES', `http://${lanAddress()}:${port}/p`);
  line('CODE', s.lobby.code.toUpperCase());
  console.log(`  └─────────────────────────────────────────────┘\n`);
  // The television claims the lease by being the first thing open — it is the screen that prints
  // the address, so nothing else can be. This is for the other case: a second screen taking over,
  // or a host who started with `--key`. It is the host's own terminal and it goes nowhere else.
  console.log(`  Television key  ${s.hostKey}`);
  console.log(`  ${MIN_PLAYERS}-${MAX_PHONES} phones. Everyone joins, then press START on the TV.`);
  console.log(`  Talk out loud. Tap only to cast, call, nominate and vote.\n`);
}
