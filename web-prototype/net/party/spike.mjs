#!/usr/bin/env node
/**
 * 📡 **THE JOIN SPIKE — nine connections, a real lounge, real phones.**
 *
 *   node net/party/spike.mjs            then open http://<your-lan-ip>:5182 on the TV
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 THIS IS A QUESTION, NOT A FEATURE, AND THE SCOPE IS DELIBERATELY LOBBY-ONLY.
 * ---------------------------------------------------------------------------------------------
 * Everything downstream of it — the circle, the Director, the mansion — assumes eight phones and
 * a TV can hold a connection for forty minutes on hardware nobody controls. **Nothing has ever
 * tested that.** So this carries no game logic at all: joining, naming, staying connected, and
 * coming back. If it cannot do those four things in your lounge, no amount of `room.js` helps.
 *
 * It answers, with numbers rather than impressions:
 *   · how long from opening the URL to being seated, on the WORST phone in the room
 *   · what the round-trip time actually is over domestic wifi, per phone, over time
 *   · how often a backgrounded or locked phone drops, and whether it comes back to its own seat
 *   · whether nine simultaneous sockets are boring or interesting
 *
 * ⚠️ NO BUILD STEP AND NO DEPENDENCIES, ON PURPOSE. `npm run build` needs `vite` and this repo
 * ships no `node_modules`; a spike you cannot start at a party is a spike that does not happen.
 * Plain `node:http`, the RFC6455 framing from `local.mjs`, and two static pages.
 *
 * ⚠️ THE SEATS, TOKENS AND REPORT LIVE IN `lobby.mjs`, SHARED WITH `show.mjs`. There is exactly
 * one token-reclaim rule on this project and a second copy would be a copy that drifts — see
 * that file's header. What is left here is the measurement: the ping beat and the two pages.
 *
 * ⚠️ NO QR YET. A byte-mode QR encoder with error correction is ~200 lines and the spike's
 * question is not "can people scan". The TV shows a large URL and a four-character code; typing
 * it once is a known, measurable cost, and it is included in the join-time number below rather
 * than hidden. QR lands with the real lobby.
 */

import http from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeCode, MAX_PHONES, CAPACITY } from './local.mjs';
import {
  createLobby, note, send, seatJoin, seatDrop, roster, report,
  lanAddress, wsAccept, readFrames, BOOT_BUDGET_MS,
} from './lobby.mjs';

export { lanAddress, createLobby, BOOT_BUDGET_MS };

const HERE = dirname(fileURLToPath(import.meta.url));
const page = (f) => readFileSync(join(HERE, f), 'utf8');

export function startSpike({ port = 5182, code = makeCode() } = {}) {
  const lobby = createLobby(code);

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(page('tv.html'));
    }
    if (url.pathname === '/p') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(page('phone.html'));
    }
    if (url.pathname === '/report') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(report(lobby), null, 2));
    }
    res.writeHead(404); res.end('no');
  });

  const pushRoster = () => {
    const r = roster(lobby);
    send(lobby.tv, { t: 'roster', players: r, capacity: MAX_PHONES });
    for (const s of lobby.seats.values()) send(s.sock, { t: 'roster', players: r, you: s.seat });
  };

  server.on('upgrade', (req, sock) => {
    const key = req.headers['sec-websocket-key'];
    if (!key) return sock.destroy();
    wsAccept(sock, key);

    const isTV = new URL(req.url, 'http://x').searchParams.get('role') === 'tv';
    let seat = null;

    if (isTV) {
      lobby.tv = sock;
      note(lobby, 'tv.connected');
      send(sock, { t: 'hello', code: lobby.code, url: `http://${lanAddress()}:${port}/p` });
      pushRoster();
    }

    readFrames(sock, (m) => {
      if (m.t === 'join' && !isTV) {
        const r = seatJoin(lobby, m, sock);
        if (r.full) { send(sock, { t: 'full', capacity: MAX_PHONES }); return sock.end(); }
        seat = r.seat;
        send(sock, { t: 'seated', seat: seat.seat, name: seat.name, colour: seat.colour, token: seat.token });
        pushRoster();
      }
      if (m.t === 'pong' && seat && typeof m.at === 'number') {
        seat.rtt.push(Date.now() - m.at);
        if (seat.rtt.length > 200) seat.rtt.shift();
      }
      if (m.t === 'rename' && seat) { seat.name = (m.name || seat.name).slice(0, 14); pushRoster(); }
    });

    const bye = () => {
      if (isTV && lobby.tv === sock) { lobby.tv = null; note(lobby, 'tv.dropped'); }
      if (seatDrop(lobby, seat, sock)) pushRoster();
    };
    sock.on('close', bye);
    sock.on('error', bye);
  });

  // ⏱ One ping a second per socket. This is the whole RTT instrument, and it is also what reveals
  // a phone that has gone quiet without closing — the common case when a screen locks.
  const beat = setInterval(() => {
    const at = Date.now();
    for (const s of lobby.seats.values()) if (s.live) send(s.sock, { t: 'ping', at });
    if (lobby.tv) send(lobby.tv, { t: 'roster', players: roster(lobby), capacity: MAX_PHONES });
  }, 1000);

  server.listen(port, '0.0.0.0');
  return { server, lobby, port, close: () => { clearInterval(beat); return new Promise((r) => server.close(r)); } };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const port = +(argv[argv.indexOf('--port') + 1] || 5182);
  const s = startSpike({ port });
  console.log(`\n  ┌─────────────────────────────────────────────┐`);
  console.log(`  │  TV      http://${lanAddress()}:${port}`.padEnd(46) + '│');
  console.log(`  │  PHONES  http://${lanAddress()}:${port}/p`.padEnd(46) + '│');
  console.log(`  │  CODE    ${s.lobby.code.toUpperCase()}`.padEnd(46) + '│');
  console.log(`  │  REPORT  http://${lanAddress()}:${port}/report`.padEnd(46) + '│');
  console.log(`  └─────────────────────────────────────────────┘\n`);
  console.log(`  ${CAPACITY} connections max (${MAX_PHONES} phones + the TV).`);
  console.log(`  When you're done: open /report and save it. That is the spike's deliverable.\n`);
}
