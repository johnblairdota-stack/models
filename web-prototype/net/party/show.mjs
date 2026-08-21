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
 * ⚠️ `/report` WITHHOLDS THE GAME LOG UNTIL THE REUNION, AND THAT IS NOT PARANOIA. Anyone on the
 * wifi can GET it, including the eight people playing. Until the show ends it serves connection
 * health only; the sealed stream is served once there is nothing left to spoil.
 *
 * ⚠️ ZERO DEPENDENCIES, NO BUILD STEP. Same reason as `spike.mjs`: this repo ships no
 * `node_modules` and a party server you cannot start at a party does not get started.
 */

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

export const MIN_PLAYERS = Math.min(...Object.keys(COMPOSITION).map(Number));

/** Seat 0 is `p1`. `cast.js` numbers players from one and seats from zero; this is the only bridge. */
export const playerIdOf = (seatNo) => `p${seatNo + 1}`;
export const seatNoOf = (playerId) => Number(playerId.slice(1)) - 1;

/** FNV-1a. The seeds are derived, printed and reported, so any game can be replayed exactly. */
export function seedFrom(...parts) {
  let h = 0x811c9dc5 >>> 0;
  const s = parts.join(':');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

export function startShow({ port = 5183, code = makeCode(), stamp = Date.now() } = {}) {
  const lobby = createLobby(code);
  let show = null;                       // { session, castSeed, worldSeed, startedAt }
  let simSock = null;                    // the mansion, when one is attached

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
    // 🚨 THE CAST SEED IS DERIVED, NEVER SENT, AND IS RECORDED IN THE REPORT. Derived so a game is
    // replayable from four printed values; never sent because `cast.js`'s header is unambiguous
    // that a client holding it can deal the whole table itself.
    const castSeed = seedFrom(code, 'cast', stamp, count);
    const worldSeed = seedFrom(code, 'world', stamp, count);
    const names = [...lobby.seats.values()].sort((a, b) => a.seat - b.seat).map((s) => s.name);
    const session = createSession({
      count, castSeed, worldSeed, names,
      send: (id, frame) => deliver(id, { t: 'state', frame }),
      emit: (id, ev) => deliver(id, { t: 'event', ev }),
    });
    show = { session, castSeed, worldSeed, startedAt: now };
    note(lobby, 'show.started', { count, castSeed, worldSeed });
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
    if (url.pathname === '/report') {
      const over = show && show.session.state.phase === PHASE.REUNION;
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(report(lobby, {
        show: show ? { castSeed: show.castSeed, worldSeed: show.worldSeed, phase: show.session.state.phase,
          episode: show.session.state.episode, outcome: show.session.state.outcome } : null,
        // ⚠️ THE SEALED STREAM IS SERVED ONLY ONCE THERE IS NOTHING LEFT TO SPOIL. Anyone on the
        // wifi can fetch this, the eight people playing included.
        log: over ? show.session.log.all() : undefined,
        withheld: show && !over ? 'the game log is served after the Reunion' : undefined,
      }), null, 2));
    }
    res.writeHead(404); res.end('no');
  });

  // ---------------------------------------------------------------- sockets
  server.on('upgrade', (req, sock) => {
    const key = req.headers['sec-websocket-key'];
    if (!key) return sock.destroy();
    wsAccept(sock, key);

    const role = new URL(req.url, 'http://x').searchParams.get('role');
    const isTV = role === 'tv';
    const isSim = role === 'sim';
    let seat = null;

    if (isSim) {
      simSock = sock;
      note(lobby, 'sim.connected');
      // The simulator is told the wing and the camera count and NOTHING about who anyone is.
      if (show) send(sock, briefFor(show.session));
    }

    if (isTV) {
      lobby.tv = sock;
      note(lobby, 'tv.connected');
      send(sock, { t: 'hello', code: lobby.code, url: `http://${lanAddress()}:${port}/p`, capacity: MAX_PHONES });
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

      if (m.t === 'join' && !isTV) {
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

      if (m.t === 'pong' && seat && typeof m.at === 'number') {
        seat.rtt.push(now - m.at);
        if (seat.rtt.length > 200) seat.rtt.shift();
        return;
      }

      if (m.t === 'rename' && seat && !show) { seat.name = (m.name || seat.name).slice(0, 14); pushRoster(); return; }

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
      if ((m.t === 'sim' || m.t === 'expedition') && (isSim || isTV) && show) {
        show.session.simReport(m);
        return;
      }

      // ---- a tap from a phone
      /**
       * 🎮 THE RUNNER'S STICK. Relayed to the simulator, never applied here — the server has no
       * physics and must not pretend to. It checks one thing, which is the thing that matters:
       * that the phone sending it is THIS episode's runner.
       */
      if (m.t === 'drive' && seat && show) {
        const st = show.session.state;
        if (st.phase !== PHASE.EXPEDITION) return;
        if (playerIdOf(seat.seat) !== st.pair.runner) {
          send(sock, { t: 'refused', why: 'you are not the runner', was: 'drive' });
          return;
        }
        send(simSock, { t: 'drive', heading: m.heading, detent: m.detent });
        return;
      }

      if (m.t === 'act' && seat && show) {
        const r = show.session.input(playerIdOf(seat.seat), m.msg || {});
        // ⚠️ A REFUSAL GOES BACK TO THE PHONE THAT SENT IT. A controller that silently ignores you
        // is a controller people stop trusting halfway through the evening.
        if (!r.ok) send(sock, { t: 'refused', why: r.why, was: m.msg?.t });
      }
    });

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
    for (const s of lobby.seats.values()) if (s.live) send(s.sock, { t: 'ping', at: now });
    if (!show) return;
    show.session.tick(now);
    // The countdown is rendered from `clock.endsAt`, which every frame already carries, so no
    // extra traffic is needed to make it move. This only pushes when the phase itself changes.
    const st = show.session.state;
    if (st.phase !== lastPhase) {
      lastPhase = st.phase;
      if (st.phase === PHASE.EXPEDITION) send(simSock, briefFor(show.session));
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
    sessionNow: () => show && show.session,
    begin,
    close: () => { clearInterval(beat); return new Promise((r) => server.close(r)); },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const port = +(argv[argv.indexOf('--port') + 1] || 5183);
  const s = startShow({ port });
  const line = (l, v) => console.log(`  │  ${l.padEnd(8)}${v}`.padEnd(46) + '│');
  console.log(`\n  ┌─────────────────────────────────────────────┐`);
  line('TV', `http://${lanAddress()}:${port}`);
  line('PHONES', `http://${lanAddress()}:${port}/p`);
  line('CODE', s.lobby.code.toUpperCase());
  console.log(`  └─────────────────────────────────────────────┘\n`);
  console.log(`  ${MIN_PLAYERS}-${MAX_PHONES} phones. Everyone joins, then press START on the TV.`);
  console.log(`  Talk out loud. Tap only to cast, call, nominate and vote.\n`);
}
