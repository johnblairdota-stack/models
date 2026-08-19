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
 * ⚠️ NO QR YET. A byte-mode QR encoder with error correction is ~200 lines and the spike's
 * question is not "can people scan". The TV shows a large URL and a four-character code; typing
 * it once is a known, measurable cost, and it is included in the join-time number below rather
 * than hidden. QR lands with the real lobby.
 */

import http from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import { encodeFrame, decodeFrame, makeCode, MAX_PHONES, CAPACITY } from './local.mjs';
import crypto from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const page = (f) => readFileSync(join(HERE, f), 'utf8');

/** The address to put on the television. A phone cannot reach `localhost`. */
export function lanAddress() {
  for (const list of Object.values(networkInterfaces())) {
    for (const ni of list ?? []) {
      if (ni.family === 'IPv4' && !ni.internal) return ni.address;
    }
  }
  return '127.0.0.1';
}

/**
 * One lobby. Holds only what the spike measures — there is no game state here by design.
 */
export function createLobby(code) {
  return {
    code,
    seats: new Map(),       // seatId -> { id, seat, name, colour, token, joinedAt, rtt, drops, live }
    tv: null,
    startedAt: Date.now(),
    events: [],             // the record the spike exists to produce
  };
}

/**
 * ⏱ D13's REVERT CONDITION, AS A NUMBER. The design bible says phone-rendered first person comes
 * back as an option if cold boot-to-playable clears 8s on the worst phone in the room. That is a
 * measurement nobody has ever taken, so the spike takes it: the phone reports its OWN
 * `navigationStart → seated` span, because the server-side clock cannot see page load at all.
 */
export const BOOT_BUDGET_MS = 8000;

const COLOURS = ['#e4483a', '#3aa0e4', '#4cc27a', '#e0b23c', '#a765d8', '#e07ab4', '#48c9c0', '#d9dde3'];

export function startSpike({ port = 5182, code = makeCode() } = {}) {
  const lobby = createLobby(code);
  const log = (type, data) => { lobby.events.push({ t: Date.now() - lobby.startedAt, type, ...data }); };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/' ) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(page('tv.html'));
    }
    if (url.pathname === '/p') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(page('phone.html'));
    }
    if (url.pathname === '/report') {
      // 🚨 THE SPIKE'S DELIVERABLE. Whatever else happens at the party, this is what comes home.
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({
        code: lobby.code,
        durationMs: Date.now() - lobby.startedAt,
        bootBudgetMs: BOOT_BUDGET_MS,
        worstBootMs: worstBoot(lobby),          // ⚖️ the one number D13 is decided on
        seatsOverBudget: [...lobby.seats.values()].filter((s) => s.bootMs > BOOT_BUDGET_MS).map((s) => s.seat),
        seats: [...lobby.seats.values()].map((s) => ({
          seat: s.seat, name: s.name, live: s.live, drops: s.drops,
          joinMs: s.joinedAt - lobby.startedAt, bootMs: s.bootMs, ua: s.ua,
          rtt: s.rtt.length ? { n: s.rtt.length, median: median(s.rtt), p95: pct(s.rtt, 0.95), max: Math.max(...s.rtt) } : null,
        })),
        events: lobby.events,
      }, null, 2));
    }
    res.writeHead(404); res.end('no');
  });

  const send = (sock, msg) => { if (sock && !sock.destroyed) sock.write(encodeFrame(JSON.stringify(msg))); };
  const roster = () => [...lobby.seats.values()]
    .sort((a, b) => a.seat - b.seat)
    .map((s) => ({ seat: s.seat, name: s.name, colour: s.colour, live: s.live, drops: s.drops,
      bootMs: s.bootMs, rtt: s.rtt.length ? median(s.rtt) : null }));
  const pushRoster = () => {
    const r = roster();
    send(lobby.tv, { t: 'roster', players: r, capacity: MAX_PHONES });
    for (const s of lobby.seats.values()) send(s.sock, { t: 'roster', players: r, you: s.seat });
  };

  server.on('upgrade', (req, sock) => {
    const key = req.headers['sec-websocket-key'];
    if (!key) return sock.destroy();
    const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
      + `Sec-WebSocket-Accept: ${accept}\r\n\r\n`);
    sock.setNoDelay(true);

    const url = new URL(req.url, 'http://x');
    const isTV = url.searchParams.get('role') === 'tv';
    let seat = null;

    if (isTV) {
      lobby.tv = sock;
      log('tv.connected', {});
      send(sock, { t: 'hello', code: lobby.code, url: `http://${lanAddress()}:${port}/p` });
      pushRoster();
    }

    let buf = Buffer.alloc(0);
    sock.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      let f;
      while ((f = decodeFrame(buf))) {
        buf = buf.subarray(f.consumed);
        if (f.opcode === 8) { sock.end(); return; }
        if (f.opcode !== 1) continue;
        let m; try { m = JSON.parse(f.payload.toString('utf8')); } catch { continue; }

        if (m.t === 'join' && !isTV) {
          // 🚨 RECLAIM BY TOKEN, NEVER BY ORDER OF ARRIVAL. A phone that locks during the lobby
          // and comes back must be the same player — binding by arrival hands them somebody
          // else's seat, which in the real game hands them somebody else's role.
          const existing = m.token && [...lobby.seats.values()].find((s) => s.token === m.token);
          if (existing) {
            seat = existing;
            seat.sock = sock; seat.live = true; seat.drops++;
            // 🚨 `bootMs` IS NOT OVERWRITTEN ON RESUME. A reconnect reuses a warm cache and would
            // report a flattering 300ms; the number D13 turns on is the COLD one, taken once.
            log('seat.resumed', { seat: seat.seat, name: seat.name, ms: Date.now() - lobby.startedAt });
          } else {
            if (lobby.seats.size >= MAX_PHONES) {
              // 📋 A REFUSAL IS LOGGED, NOT JUST SENT. "Someone couldn't get in" is the single
              // hardest party complaint to reconstruct afterwards from an unhappy guest.
              log('seat.refused', { name: (m.name || '').slice(0, 14), reason: 'full' });
              send(sock, { t: 'full', capacity: MAX_PHONES });
              return sock.end();
            }
            const n = lobby.seats.size;
            seat = {
              id: `phone-${n}`, seat: n, sock, live: true, drops: 0, rtt: [],
              name: (m.name || `Robot ${n + 1}`).slice(0, 14),
              colour: COLOURS[n % COLOURS.length],
              token: crypto.randomBytes(8).toString('hex'),
              joinedAt: Date.now(),
              bootMs: Number.isFinite(m.boot) ? Math.round(m.boot) : null,
              ua: typeof m.ua === 'string' ? m.ua.slice(0, 120) : null,
            };
            lobby.seats.set(seat.id, seat);
            log('seat.joined', { seat: seat.seat, name: seat.name, ms: seat.joinedAt - lobby.startedAt,
              bootMs: seat.bootMs, slow: seat.bootMs != null && seat.bootMs > BOOT_BUDGET_MS });
          }
          send(sock, { t: 'seated', seat: seat.seat, name: seat.name, colour: seat.colour, token: seat.token });
          pushRoster();
        }

        if (m.t === 'pong' && seat && typeof m.at === 'number') {
          const rtt = Date.now() - m.at;
          seat.rtt.push(rtt);
          if (seat.rtt.length > 200) seat.rtt.shift();
        }
        if (m.t === 'rename' && seat) { seat.name = (m.name || seat.name).slice(0, 14); pushRoster(); }
      }
    });

    const bye = () => {
      if (isTV && lobby.tv === sock) { lobby.tv = null; log('tv.dropped', {}); }
      if (seat && seat.sock === sock) { seat.live = false; log('seat.dropped', { seat: seat.seat, name: seat.name }); pushRoster(); }
    };
    sock.on('close', bye);
    sock.on('error', bye);
  });

  // ⏱ One ping a second per socket. This is the whole RTT instrument, and it is also what
  // reveals a phone that has gone quiet without closing — the common case when a screen locks.
  const beat = setInterval(() => {
    const at = Date.now();
    for (const s of lobby.seats.values()) if (s.live) send(s.sock, { t: 'ping', at });
    if (lobby.tv) send(lobby.tv, { t: 'roster', players: roster(), capacity: MAX_PHONES });
  }, 1000);

  server.listen(port, '0.0.0.0');
  return { server, lobby, port, close: () => { clearInterval(beat); return new Promise((r) => server.close(r)); } };
}

/** The worst phone in the room, which is the only phone D13 cares about. */
export const worstBoot = (lobby) => {
  const b = [...lobby.seats.values()].map((s) => s.bootMs).filter((x) => Number.isFinite(x));
  return b.length ? Math.max(...b) : null;
};

const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };

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
