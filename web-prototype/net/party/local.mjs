#!/usr/bin/env node
/**
 * 🛰️ **THE LOCAL ROOM SERVER — the same room module, over real WebSockets, with no dependency.**
 *
 *   node net/party/local.mjs [--port 5181]
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THIS EXISTS ALONGSIDE `server.js`
 * ---------------------------------------------------------------------------------------------
 * D11 puts the party mode on Cloudflare PartyKit. `net/party/server.js` is that adapter, and it
 * cannot be exercised on a machine with no deploy. Both files are thin wrappers over the SAME
 * `createRoom` — the architecture constraint from `rrr-gates.md` §1 exists exactly so this is
 * possible: *"the room logic must be a plain module importable in bare node, transport
 * injected; without that, `party-sim` needs 1000 browsers and will never be run."*
 *
 * So the transport is tested here, on real sockets, and the room logic tested here is the room
 * logic PartyKit runs. What is NOT covered by any gate is the adapter seam itself, and that is
 * stated rather than implied — see `server.js`'s header.
 *
 * ⚠️ ZERO DEPENDENCIES, AND NOT FOR PURITY. `ws` is in `package.json` but this repo ships no
 * `node_modules`, and a gate that needs an install is a gate that gets skipped. Minimal RFC6455
 * over `node:http`, the same shape as `cuddle-wars-3d/server/relay.js`, which has survived
 * contact with a real party.
 *
 * 🚨 THE SERVER NEVER BROADCASTS. `relay.js` forwards every frame to every peer in the room,
 * which is correct for a two-player game and **fatal for a hidden-role one**. Here every byte a
 * socket receives has been through `project()` or `visibleTo()` for THAT socket. There is no
 * code path in this file that sends the same buffer to two connections.
 */

import http from 'node:http';
import crypto from 'node:crypto';
import { createRoom } from '../../src/party/room.js';

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
export const MAX_PHONES = 8;
export const CAPACITY = MAX_PHONES + 1;          // + the TV

// ---------------------------------------------------------------- RFC6455, the little of it we need
function accept(key) {
  return crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
}
export function encodeFrame(payload, opcode = 1) {
  const body = Buffer.from(payload);
  const n = body.length;
  let head;
  if (n < 126) { head = Buffer.alloc(2); head[1] = n; }
  else if (n < 65536) { head = Buffer.alloc(4); head[1] = 126; head.writeUInt16BE(n, 2); }
  else { head = Buffer.alloc(10); head[1] = 127; head.writeBigUInt64BE(BigInt(n), 2); }
  head[0] = 0x80 | opcode;
  return Buffer.concat([head, body]);
}
export function decodeFrame(buf) {
  if (buf.length < 2) return null;
  const opcode = buf[0] & 0x0f;
  const masked = (buf[1] & 0x80) !== 0;
  let len = buf[1] & 0x7f;
  let off = 2;
  if (len === 126) { if (buf.length < 4) return null; len = buf.readUInt16BE(2); off = 4; }
  else if (len === 127) { if (buf.length < 10) return null; len = Number(buf.readBigUInt64BE(2)); off = 10; }
  let mask = null;
  if (masked) { if (buf.length < off + 4) return null; mask = buf.subarray(off, off + 4); off += 4; }
  if (buf.length < off + len) return null;
  const body = Buffer.from(buf.subarray(off, off + len));
  if (mask) for (let i = 0; i < body.length; i++) body[i] ^= mask[i % 4];
  return { opcode, payload: body, consumed: off + len };
}

// ---------------------------------------------------------------- rooms
const rooms = new Map();

/** A short code from an alphabet with no i/l/o/0/1 — `cuddle-wars-3d/src/studio/net.js`'s rule. */
export function makeCode(rand = Math.random) {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += abc[Math.floor(rand() * abc.length)];
  return s;
}

function getRoom(code, opts) {
  let r = rooms.get(code);
  if (r) return r;
  const conns = new Map();                       // socketId -> { sock, token }
  const outbox = (id, msg) => {
    const c = conns.get(id);
    if (c && !c.sock.destroyed) c.sock.write(encodeFrame(JSON.stringify(msg)));
  };
  const game = createRoom({
    count: opts.count, castSeed: opts.castSeed, worldSeed: opts.worldSeed,
    send: (id, frame) => outbox(id, { t: 'state', frame }),
    emit: (id, ev) => outbox(id, { t: 'event', ev }),
  });
  r = { code, game, conns, seatsTaken: new Set(), tvTaken: false };
  rooms.set(code, r);
  return r;
}

/**
 * Bind an incoming connection to a socket id.
 *
 * 🚨 A RECONNECT IS BOUND BY TOKEN, NEVER BY ORDER OF ARRIVAL. Binding by arrival means a phone
 * that drops during CASTING comes back as somebody else and is handed their role. The token is
 * minted once per seat and is the only thing that reclaims it.
 */
export function bindConnection(room, { token }) {
  if (token) {
    for (const [id, c] of room.conns) if (c.token === token) return { id, token, resumed: true };
    for (const s of room.game.sockets) {
      if (s.token === token) return { id: s.id, token, resumed: true };
    }
  }
  for (const s of room.game.sockets) {
    if (s.isTV) { if (room.tvTaken) continue; }
    else if (room.seatsTaken.has(s.id)) continue;
    const fresh = crypto.randomBytes(8).toString('hex');
    s.token = fresh;
    if (s.isTV) room.tvTaken = true; else room.seatsTaken.add(s.id);
    return { id: s.id, token: fresh, resumed: false };
  }
  return null;                                   // room full
}

// ---------------------------------------------------------------- server
export function startServer({ port = 5181, count = 8, castSeed = 1, worldSeed = 1, code = 'test' } = {}) {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('prime time room server — send a WebSocket\n');
  });

  server.on('upgrade', (req, sock) => {
    const key = req.headers['sec-websocket-key'];
    if (!key) return sock.destroy();
    sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
      + `Sec-WebSocket-Accept: ${accept(key)}\r\n\r\n`);
    sock.setNoDelay(true);

    const url = new URL(req.url, 'http://x');
    const room = getRoom(url.searchParams.get('room') || code, { count, castSeed, worldSeed });
    const bound = bindConnection(room, { token: url.searchParams.get('token') });

    if (!bound) {
      sock.write(encodeFrame(JSON.stringify({ t: 'full', capacity: CAPACITY })));
      return sock.end();
    }
    room.conns.set(bound.id, { sock, token: bound.token });
    sock.write(encodeFrame(JSON.stringify({ t: 'welcome', id: bound.id, token: bound.token, resumed: bound.resumed })));

    // 🚨 A RESUMING SOCKET IS CAUGHT UP THROUGH THE SAME FILTER, NOT WITH A FULL SNAPSHOT.
    // `net/server.mjs`'s `welcome` hands every joiner every peer's state (L335-336) — the
    // classic leak, and the one `phone-drop` P2 exists to refuse.
    if (bound.resumed) {
      const s = room.game.sockets.find((x) => x.id === bound.id);
      for (const ev of room.game.replayFor(s)) {
        sock.write(encodeFrame(JSON.stringify({ t: 'event', ev, replay: true })));
      }
    }

    let buf = Buffer.alloc(0);
    sock.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      let f;
      while ((f = decodeFrame(buf))) {
        buf = buf.subarray(f.consumed);
        if (f.opcode === 8) { sock.end(); return; }
        if (f.opcode === 9) { sock.write(encodeFrame(f.payload, 10)); continue; }
        if (f.opcode !== 1) continue;
        let msg; try { msg = JSON.parse(f.payload.toString('utf8')); } catch { continue; }
        if (msg.t === 'start') { room.game.start(); }
        if (msg.t === 'episode') { room.game.playEpisode(msg.opts || {}); }
      }
    });
    sock.on('close', () => room.conns.delete(bound.id));
    sock.on('error', () => room.conns.delete(bound.id));
  });

  server.listen(port);
  return { server, rooms, close: () => new Promise((r) => server.close(r)) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const port = +(argv[argv.indexOf('--port') + 1] || 5181);
  startServer({ port });
  console.log(`prime time room server on ws://localhost:${port}/?room=test`);
}
