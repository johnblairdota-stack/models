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
 * 🚨 THE SERVER NEVER BROADCASTS ONE BUFFER. `relay.js` forwards every frame to every peer,
 * which is correct for a two-player game and **fatal for a hidden-role one**. There is no
 * code path in this file that sends the same buffer to two connections.
 *
 * Two outbound kinds, and they are not the same rule:
 *   · `t:state` / `t:event` — through `project()` or `visibleTo()` for THAT socket.
 *   · `t:lobby` / `t:ballots` / `t:show` — a closed public side-channel. Occupancy, published
 *     names, casting votes, show beat. Not the entitlement matrix. `fanoutViolations()` is
 *     the freeze: a later `role` / `alignment` / `cover` / `claim` / `hunter` / `deal` on
 *     one of these fails a gate (and throws here) rather than shipping silently.
 *     Public cosmetics (`shell`, `accent`) are on the allow-list; they are not a hole.
 */

import http from 'node:http';
import crypto from 'node:crypto';
import { createRoom } from '../../src/party/room.js';
import { WARM_STAGES, moveViolations, warmPct, worldViolations } from '../../src/party/follow.js';
import { isShowBeat, missionEndsRun, recapAfterMs } from '../../src/party/show.js';

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
  /*
   * 🚨 **A FRESH castSeed PER ROOM, AND THE CONSTANT IT REPLACES WAS THE SECOND HALF OF JOHN'S
   * "the role cards are only giving me continuity".**
   *
   * `startServer` defaults `castSeed = 1` and every room took it, so `dealCast` produced the
   * IDENTICAL shuffle on every night this server has ever hosted. Seat 0 drew the same card in
   * January and in August. `dealCast` shuffles properly; it was being asked the same question
   * every time.
   *
   * `net/party/server.js` L62 already mints one per room on the PartyKit side — this is that line,
   * brought across, and the two transports now agree. It stays a per-ROOM value rather than a
   * per-deal one so a reconnecting phone still resumes into the cast it was dealt.
   *
   * ⚠️ An explicitly passed `castSeed` still wins, because every party gate passes one and a
   * deal that cannot be reproduced cannot be gated (`cast.js`'s own header).
   */
  const castSeed = opts.castSeed ?? ((Math.random() * 0x7fffffff) | 0);
  const game = createRoom({
    count: opts.count, castSeed, worldSeed: opts.worldSeed,
    send: (id, frame) => outbox(id, { t: 'state', frame }),
    emit: (id, ev) => outbox(id, { t: 'event', ev }),
  });
  r = { code, game, conns, seatsTaken: new Set(), tvTaken: false, ballots: new Map(), show: 'lobby', showClock: null };
  rooms.set(code, r);
  return r;
}

function clearShowClock(room) {
  if (room.showClock) {
    clearTimeout(room.showClock);
    room.showClock = null;
  }
}

/** Persist + fan the beat so a refreshed TV resumes here, not on host-tab RAM. */
function setShow(room, beat) {
  if (!isShowBeat(beat)) return;
  room.show = beat;
  fanout(room, { t: 'show', beat: room.show });
}

/**
 * Pair locked / playEpisode started — every client including the TV enters the run.
 *
 * ⚠️ **THE TIMER IS A BACKSTOP AND NO LONGER THE THING THAT ENDS THE RUN.** `src/party/show.js`
 * carries the argument and the playtest note behind it; what matters here is that the run's real
 * end is `endRunOnMission` below, fired by the TV's own world report, and this clock exists only
 * so a room whose TV tab died cannot sit on the expedition beat all evening.
 */
function startShowClock(room) {
  clearShowClock(room);
  setShow(room, 'expedition');
  const wait = recapAfterMs();
  room.showClock = setTimeout(() => {
    room.showClock = null;
    if (room.show === 'expedition') setShow(room, 'recap');
  }, wait);
  room.showClock.unref?.();
}

/**
 * 🎬 **THE RUN ENDS BECAUSE THE MISSION ENDED — the one clear end the night has.**
 *
 * `src/game/follow-bed.js` `missionTick` walks `seek -> return -> done`: the gallery painting has
 * to be struck by a swing aimed at it, and then the runner has to be back inside the ballroom.
 * Only `done` lands here (`missionEndsRun`), so breaking the painting does not cut the show while
 * the runner is still walking home, and smashing a box does not cut it at all.
 *
 * Idempotent on purpose — the TV reports twice a second and will keep reporting `done` — so the
 * beat is set once and the guard is `room.show === 'expedition'` rather than a flag somebody has
 * to remember to clear between episodes.
 */
function endRunOnMission(room, mission) {
  if (!missionEndsRun(mission?.phase)) return;
  if (room.show !== 'expedition') return;
  clearShowClock(room);
  setShow(room, 'recap');
}

/**
 * Bind an incoming connection to a socket id.
 *
 * 🚨 A RECONNECT IS BOUND BY TOKEN, NEVER BY ORDER OF ARRIVAL. Binding by arrival means a phone
 * that drops during CASTING comes back as somebody else and is handed their role. The token is
 * minted once per seat and is the only thing that reclaims it.
 *
 * 🚨 THE HOST ASKS FOR THE TV. Without `wantTV`, phones fill first (same as before — the TV
 * socket is last in `createRoom`'s list). With it, this connection is the spectator or nothing;
 * a host that failed over to a robot seat would be playing, and the TV would be empty.
 */
function lookupToken(room, token) {
  if (!token) return null;
  for (const [id, c] of room.conns) {
    if (c.token !== token) continue;
    const s = room.game.sockets.find((x) => x.id === id);
    return { id, token, resumed: true, isTV: !!s?.isTV };
  }
  for (const s of room.game.sockets) {
    if (s.token === token) return { id: s.id, token, resumed: true, isTV: !!s.isTV };
  }
  return null;
}

export function bindConnection(room, { token, wantTV = false }) {
  const found = lookupToken(room, token);
  if (found) {
    // A phone token must not become the TV, and a TV token must not sit as a robot.
    if (wantTV !== found.isTV) return { mismatch: wantTV ? 'phone-token-as-tv' : 'tv-token-as-phone' };
    return found;
  }
  if (wantTV) {
    const tv = room.game.sockets.find((s) => s.isTV);
    if (!tv || room.tvTaken) return null;
    const fresh = crypto.randomBytes(8).toString('hex');
    tv.token = fresh;
    room.tvTaken = true;
    return { id: tv.id, token: fresh, resumed: false, isTV: true };
  }
  // Phones fill first. The last free socket may still be the TV — party-sockets seats
  // nine connections with no host flag, and the ninth is the spectator.
  for (const s of room.game.sockets) {
    if (s.isTV) { if (room.tvTaken) continue; }
    else if (room.seatsTaken.has(s.id)) continue;
    const fresh = crypto.randomBytes(8).toString('hex');
    s.token = fresh;
    if (s.isTV) room.tvTaken = true; else room.seatsTaken.add(s.id);
    return { id: s.id, token: fresh, resumed: false, isTV: !!s.isTV };
  }
  return null;                                   // room full
}

/** Closed keys for the public side-channel. A field not on this list is a violation. */
export const FANOUT_KEYS = {
  lobby: ['t', 'code', 'phase', 'episode', 'seats'],
  lobbySeat: ['id', 'playerId', 'isTV', 'name', 'seat', 'joined', 'connected', 'shell', 'accent'],
  ballots: ['t', 'votes'],
  ballotVote: ['voter', 'runner', 'guide'],
  show: ['t', 'beat'],
  /*
   * 🔥 How far along the TV's mansion bake is. Public, because it is the ROOM's wait, not the
   * TV's: `docs/slices/task-prime-time-lobby-warm-night.md` §3.4, and John's playtest note that
   * the load had "no loading indicator". A percentage and one of five stage words is the whole
   * payload — there is no room, no seed and no cast on it, so there is nothing here to filter.
   */
  warm: ['t', 'pct', 'stage'],
};
export const FANOUT_FORBIDDEN = ['role', 'alignment', 'cover', 'claim', 'castSeed', 'you', 'teammates', 'flyover', 'hunter', 'deal'];

function extraKeys(obj, allowed, path, out) {
  if (!obj || typeof obj !== 'object') return;
  for (const k of Object.keys(obj)) {
    if (FANOUT_FORBIDDEN.includes(k)) out.push(`${path}.${k}`);
    else if (!allowed.includes(k)) out.push(`${path}.${k}`);
  }
}

/** Empty = closed schema holds. Used by the gate so a later role field fails closed. */
export function fanoutViolations(msg) {
  const bad = [];
  if (!msg || typeof msg !== 'object') return ['<empty>'];
  if (msg.t === 'lobby') {
    extraKeys(msg, FANOUT_KEYS.lobby, 'lobby', bad);
    for (let i = 0; i < (msg.seats || []).length; i++) extraKeys(msg.seats[i], FANOUT_KEYS.lobbySeat, `lobby.seats[${i}]`, bad);
  } else if (msg.t === 'ballots') {
    extraKeys(msg, FANOUT_KEYS.ballots, 'ballots', bad);
    for (let i = 0; i < (msg.votes || []).length; i++) extraKeys(msg.votes[i], FANOUT_KEYS.ballotVote, `ballots.votes[${i}]`, bad);
  } else if (msg.t === 'show') {
    extraKeys(msg, FANOUT_KEYS.show, 'show', bad);
  } else if (msg.t === 'warm') {
    extraKeys(msg, FANOUT_KEYS.warm, 'warm', bad);
  } else {
    bad.push(`t:${msg.t}`);
  }
  return bad;
}

/** Occupancy + published names. No roles, no alignment, no deal. */
export function lobbySnapshot(room) {
  return {
    t: 'lobby',
    code: room.code,
    phase: room.game.state.phase,
    episode: room.game.state.episode,
    seats: room.game.sockets.map((s) => {
      const player = s.playerId ? room.game.state.players.find((p) => p.id === s.playerId) : null;
      const joined = s.isTV ? room.tvTaken : room.seatsTaken.has(s.id);
      return {
        id: s.id,
        playerId: s.playerId,
        isTV: !!s.isTV,
        name: player?.name ?? (s.isTV ? 'TV' : s.id),
        seat: player?.seat ?? null,
        joined,
        connected: room.conns.has(s.id),
        shell: player?.shell ?? null,
        accent: player?.accent ?? null,
      };
    }),
  };
}

/** Per-socket write. The same object may be public; the buffer is never shared. */
function push(room, id, msg) {
  const c = room.conns.get(id);
  if (c && !c.sock.destroyed) c.sock.write(encodeFrame(JSON.stringify(msg)));
}

function fanout(room, msg) {
  const bad = fanoutViolations(msg);
  if (bad.length) throw new Error(`fanout closed schema: ${bad.join(', ')}`);
  for (const id of room.conns.keys()) push(room, id, msg);
}

// ---------------------------------------------------------------- server
export function startServer({ port = 5181, count = 8, castSeed = null, worldSeed = 1, code = 'test' } = {}) {
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
    const seatParam = (url.searchParams.get('seat') || '').toLowerCase();
    const hostFlag = url.searchParams.get('host');
    // Spectator flag. Not `role` — that word is the hidden deal.
    const wantTV = seatParam === 'tv' || hostFlag === '1' || hostFlag === 'true';
    const bound = bindConnection(room, {
      token: url.searchParams.get('token'),
      wantTV,
    });

    if (!bound || bound.mismatch) {
      sock.write(encodeFrame(JSON.stringify({
        t: 'full', capacity: CAPACITY, reason: bound?.mismatch || 'full',
      })));
      return sock.end();
    }
    room.conns.set(bound.id, { sock, token: bound.token });
    const self = room.game.sockets.find((x) => x.id === bound.id);
    const player = self?.playerId ? room.game.state.players.find((p) => p.id === self.playerId) : null;
    // Welcome names THIS socket. It is not a snapshot of anyone else.
    sock.write(encodeFrame(JSON.stringify({
      t: 'welcome',
      id: bound.id,
      token: bound.token,
      resumed: bound.resumed,
      isTV: !!self?.isTV,
      playerId: self?.playerId ?? null,
      seat: player?.seat ?? null,
      name: player?.name ?? null,
      /**
       * 🚨 **`worldSeed` ON THE WELCOME, AND IT IS HERE TO CLOSE A RACE THAT BUILT TWO DIFFERENT
       * MANSIONS IN ONE ROOM.**
       *
       * `PartyNightClient.connect()` resolves on THIS message, and `views/party-host.js` paints on
       * every message — so the TV's first paint happens with `client.frame` still null. That paint
       * mounts the night-long mansion slot, whose `src` is assigned exactly once and never again
       * (deliberately: reassigning it is a reload and a 9 MB refetch). So the TV was baking
       * `seed=0` while every phone derived its guide map from `frame.worldSeed`, which
       * `startServer` defaults to 1 — a different floor plan, different rooms, different doors.
       * `src/party/mansion.js`'s header forbids exactly that disagreement and the TV was the one
       * breaking it.
       *
       * It is public by a decision that predates this file: `net/party/entitle.js` L47 gives
       * `worldSeed` the `all` audience, and the frame has always carried it. Putting it one
       * message earlier costs nothing and means the first paint can build the right URL rather
       * than having to be told to wait.
       */
      worldSeed: room.game.state.worldSeed,
    })));

    // 🚨 A RESUMING SOCKET IS CAUGHT UP THROUGH THE SAME FILTER, NOT WITH A FULL SNAPSHOT.
    // `net/server.mjs`'s `welcome` hands every joiner every peer's state (L335-336) — the
    // classic leak, and the one `phone-drop` P2 exists to refuse.
    // A late first-join uses the same replay: entitled events only.
    if (self) {
      for (const ev of room.game.replayFor(self)) {
        sock.write(encodeFrame(JSON.stringify({ t: 'event', ev, replay: true })));
      }
      room.game.syncOne(bound.id);
    }
    push(room, bound.id, { t: 'show', beat: room.show });
    fanout(room, lobbySnapshot(room));

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
        handleClient(room, bound, self, msg);
      }
    });
    sock.on('close', () => { room.conns.delete(bound.id); fanout(room, lobbySnapshot(room)); });
    sock.on('error', () => { room.conns.delete(bound.id); fanout(room, lobbySnapshot(room)); });
  });

  server.listen(port);
  return {
    server,
    rooms,
    close: () => {
      for (const room of rooms.values()) clearShowClock(room);
      return new Promise((r) => server.close(r));
    },
  };
}

/** Joined phone player ids. Empty deal slots are not seated. */
export function seatedPlayerIds(room) {
  return room.game.sockets
    .filter((s) => !s.isTV && room.seatsTaken.has(s.id) && s.playerId)
    .map((s) => s.playerId);
}

function handleClient(room, bound, self, msg) {
  const isTV = !!self?.isTV;
  if (msg.t === 'name' && self && !isTV) {
    room.game.setName(self.playerId, msg.name);
    room.game.syncAll();
    fanout(room, lobbySnapshot(room));
    return;
  }
  if (msg.t === 'look' && self && !isTV) {
    room.game.setLook(self.playerId, { shell: msg.shell, accent: msg.accent });
    fanout(room, lobbySnapshot(room));
    return;
  }
  if (msg.t === 'ballot' && self && !isTV && self.playerId) {
    const seated = new Set(seatedPlayerIds(room));
    const runner = seated.has(msg.runner) ? msg.runner : null;
    const guide = seated.has(msg.guide) ? msg.guide : null;
    if (runner && guide && runner !== guide) {
      room.ballots.set(self.playerId, { voter: self.playerId, runner, guide });
      fanout(room, { t: 'ballots', votes: [...room.ballots.values()] });
    }
    return;
  }
  /*
   * 🔥 THE WARM — the TV telling the room how far along its bake is.
   *
   * TV-only, because the TV is the only socket that has a mansion in it. It is fanned to
   * everybody rather than kept on the host screen because the wait belongs to the room: a phone
   * that has just typed its name wants to know the night is loading, not wonder whether the host
   * has wandered off. `stage` is validated against `WARM_STAGES` so a typo reads as 0% rather than
   * as a bar that sticks at an arbitrary place forever.
   */
  if (msg.t === 'warm' && isTV) {
    const stage = WARM_STAGES.includes(msg.stage) ? msg.stage : WARM_STAGES[0];
    room.warm = { stage, pct: warmPct(stage) };
    fanout(room, { t: 'warm', stage, pct: room.warm.pct });
    return;
  }

  /*
   * 🕹️ THE PAD — the runner's thumbs, relayed to the one screen that has a body to move.
   *
   * ⚠️ DIRECTED TO THE TV, NEVER FANNED. This is not squeamishness about the data (a stick vector
   * says nothing the TV is not already showing everybody); it is that a 20 Hz message multiplied
   * by every socket in the room is eight times the traffic for seven sockets that would throw it
   * away. `fanout()` is for facts the room shares; this is a control input with one consumer.
   *
   * The sender is checked against `pair.runner`, so a phone that is not running cannot drive the
   * body — the ballot is what grants control, not the willingness to send.
   */
  if (msg.t === 'move' && self && !isTV && self.playerId) {
    if (room.game.state.pair?.runner !== self.playerId) return;
    if (moveViolations(msg).length) return;
    const out = {
      t: 'move', x: +msg.x || 0, y: +msg.y || 0,
      run: !!msg.run, swing: !!msg.swing, act: msg.act ?? 0,
    };
    for (const s of room.game.sockets) if (s.isTV) push(room, s.id, out);
    return;
  }

  /*
   * 🌍 THE WORLD REPORT — the TV saying where the bodies are, so the server can decide who is
   * told.
   *
   * 🚨 THE TV IS THE WORLD AUTHORITY AND THAT IS A STATEMENT ABOUT THIS PROTOTYPE, NOT A DESIGN
   * IDEAL. `playEpisode` has never simulated an expedition — it resolves a whole episode
   * synchronously — and the mansion exists only inside the follow slot. So the only process that
   * knows where the runner is standing is the one rendering him. The server's job here is the one
   * it is actually good at: taking a fact and deciding, per socket, who may have it.
   *
   * `worldViolations` is what stops this from becoming a general-purpose pipe into the frame. A
   * report may carry rooms, coordinates and a mission phase. It is structurally incapable of
   * carrying a role.
   */
  if (msg.t === 'world' && isTV) {
    if (worldViolations(msg).length) return;
    room.game.setWorld({ runner: msg.runner, hunter: msg.hunter, mission: msg.mission });
    endRunOnMission(room, msg.mission);
    return;
  }

  if (msg.t === 'show' && typeof msg.beat === 'string') {
    // Host workaround ("Watch the run") and N14 pacing. Not the product clock.
    if (msg.beat !== 'expedition') clearShowClock(room);
    setShow(room, msg.beat);
    return;
  }
  // start / episode stay callable from any socket so party-sockets (which drives
  // phone-0) keeps working. The host view is the only UI that sends them.
  if (msg.t === 'start') {
    room.game.start();
    // 🚨 THE DRAW IS PART OF STARTING THE NIGHT, NOT PART OF THE FIRST EXPEDITION. Every joined
    // phone gets its own `role.card` here, through `emit`, so it is holding a card before the
    // first ballot rather than after the pair has locked. Nothing about this reaches the TV:
    // `role.card` is SELF and `production.panel` is EVIL, and the deal itself is SEALED.
    // 🚨 THE SEATED IDS, NOT THE CAPACITY. See `dealRoles`' header — dealing an eight-player bag
    // to a two-phone table is what handed John the same card every night.
    room.game.dealRoles(seatedPlayerIds(room));
    fanout(room, lobbySnapshot(room));
  }
  if (msg.t === 'casting') {
    clearShowClock(room);
    room.game.beginCasting();
    setShow(room, 'casting');
  }
  if (msg.t === 'episode') {
    const seated = seatedPlayerIds(room);
    const votes = [...room.ballots.values()].filter((v) =>
      seated.includes(v.runner) && seated.includes(v.guide) && v.runner !== v.guide);
    const unused = room.game.state.players.length - seated.length;
    // Empty chairs in the deal must not invent a pair. Gates that fill every seat still synthesize.
    if (!votes.length && unused > 0) return;
    room.game.playEpisode({
      ...(msg.opts || {}),
      ...(votes.length ? { ballots: votes } : {}),
      ...(seated.length ? { living: seated } : {}),
    });
    // Durable show: expedition now, recap when the mission says so. Do not pin CASTING.
    startShowClock(room);
    fanout(room, lobbySnapshot(room));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const port = +(argv[argv.indexOf('--port') + 1] || 5181);
  startServer({ port });
  console.log(`prime time room server on ws://localhost:${port}`);
  console.log(`  host:  http://localhost:5178/?view=party.host`);
  console.log(`  phone: http://localhost:5178/?view=party.phone&room=test`);
  console.log(`  (npm run dev in another terminal — Vite is the page, this is the room)`);
}
