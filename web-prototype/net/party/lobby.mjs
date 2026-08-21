/**
 * 🪑 **THE LOBBY — seats, names, tokens and the coming-back, shared by every server that has one.**
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 THERE IS EXACTLY ONE TOKEN-RECLAIM RULE ON THIS PROJECT, AND IT LIVES HERE.
 * ---------------------------------------------------------------------------------------------
 * `spike.mjs` measures a lounge; `show.mjs` runs the game. Both need eight seats, both need a
 * phone that locked to come back as ITSELF, and a second copy of that rule is a copy that drifts.
 * In the lobby a token buys a seat. In the show the same token buys **a seat with a role on it** —
 * so a returning player handed the wrong one has been handed somebody else's alignment, and the
 * evening is over without an error being thrown anywhere.
 *
 * `harness/join-spike.mjs` covers this file through `spike.mjs`, including the case that actually
 * catches a careless bind: TWO phones away at once, coming back out of order.
 *
 * ⚠️ ZERO DEPENDENCIES AND NO BUILD STEP, for the reason `spike.mjs` gives — this repo ships no
 * `node_modules` and a party server you cannot start at a party does not get started.
 */

import crypto from 'node:crypto';
import { networkInterfaces } from 'node:os';
import { encodeFrame, decodeFrame, MAX_PHONES, CAPACITY } from './local.mjs';

export { MAX_PHONES, CAPACITY };

/** Eight seats, eight colours a television can tell apart from three metres. */
export const COLOURS = ['#e4483a', '#3aa0e4', '#4cc27a', '#e0b23c', '#a765d8', '#e07ab4', '#48c9c0', '#d9dde3'];

/**
 * ⏱ D13's REVERT CONDITION, AS A NUMBER. The design bible says phone-rendered first person comes
 * back as an option if cold boot-to-playable clears 8s on the worst phone in the room. The phone
 * reports its OWN `navigationStart → seated` span, because the server clock cannot see page load.
 */
export const BOOT_BUDGET_MS = 8000;

/** The address to put on the television. A phone cannot reach `localhost`. */
export function lanAddress() {
  for (const list of Object.values(networkInterfaces())) {
    for (const ni of list ?? []) {
      if (ni.family === 'IPv4' && !ni.internal) return ni.address;
    }
  }
  return '127.0.0.1';
}

export function createLobby(code) {
  return { code, seats: new Map(), tv: null, startedAt: Date.now(), events: [] };
}

export const note = (lobby, type, data = {}) => {
  lobby.events.push({ t: Date.now() - lobby.startedAt, type, ...data });
};

export const send = (sock, msg) => {
  if (sock && !sock.destroyed) sock.write(encodeFrame(JSON.stringify(msg)));
};

/**
 * Seat a phone, or give it back the seat it already had.
 *
 * 🚨 RECLAIM BY TOKEN, NEVER BY ORDER OF ARRIVAL, AND THE CHECK COMES BEFORE THE CAP. A player
 * whose screen locked would otherwise be told the party is full while their own seat sits empty.
 */
export function seatJoin(lobby, m, sock) {
  const existing = m.token && [...lobby.seats.values()].find((s) => s.token === m.token);
  if (existing) {
    existing.sock = sock;
    existing.live = true;
    existing.drops++;
    // `bootMs` is NOT overwritten: a reconnect reuses a warm cache and would report a flattering
    // number, and the figure D13 turns on is the COLD one, taken once.
    note(lobby, 'seat.resumed', { seat: existing.seat, name: existing.name });
    return { seat: existing, resumed: true };
  }
  if (lobby.seats.size >= MAX_PHONES) {
    note(lobby, 'seat.refused', { name: (m.name || '').slice(0, 14), reason: 'full' });
    return { full: true };
  }
  const n = lobby.seats.size;
  const seat = {
    id: `phone-${n}`, seat: n, sock, live: true, drops: 0, rtt: [],
    name: (m.name || `Robot ${n + 1}`).slice(0, 14),
    colour: COLOURS[n % COLOURS.length],
    token: crypto.randomBytes(8).toString('hex'),
    joinedAt: Date.now(),
    bootMs: Number.isFinite(m.boot) ? Math.round(m.boot) : null,
    ua: typeof m.ua === 'string' ? m.ua.slice(0, 120) : null,
  };
  lobby.seats.set(seat.id, seat);
  note(lobby, 'seat.joined', {
    seat: seat.seat, name: seat.name, ms: seat.joinedAt - lobby.startedAt,
    bootMs: seat.bootMs, slow: seat.bootMs != null && seat.bootMs > BOOT_BUDGET_MS,
  });
  return { seat, resumed: false };
}

export function seatDrop(lobby, seat, sock) {
  if (!seat || seat.sock !== sock) return false;
  seat.live = false;
  note(lobby, 'seat.dropped', { seat: seat.seat, name: seat.name });
  return true;
}

/**
 * 🚨 **THE ROSTER IS FROZEN ONCE, AT THE BELL, AND THE SEATS ARE RENUMBERED. THE ALTERNATIVE WAS
 * DEALING ROLES TO PHONES THAT HAD GONE HOME.**
 *
 * `seatDrop` above marks a seat dead and KEEPS it, which is exactly right while the lobby is a
 * lobby: the token still buys the chair back, so a phone whose screen locked returns as itself.
 * But the count that starts the show was `lobby.seats.size`, which counts the dead ones. Eight
 * people join, three close the browser, and the show deals **eight** roles — some of them to
 * absent phones — while the execution threshold becomes `floor(8/2)+1 = 5` of the 5 people
 * actually in the room. That is unanimity, for ever, in a game whose entire third act is a vote.
 * The television meanwhile prints the LIVE count, so the screen and the session disagreed about
 * how many people were playing.
 *
 * ⚠️ RENUMBERING IS NOT TIDINESS. `show.mjs`'s `playerIdOf(seat)` is the ONLY bridge between a
 * chair and a dealt role, and `cast.js` deals seats `0..count-1`. Leave a hole at seat 2 of 8 and
 * seat 7 maps to a `p8` the deal never made — so the seats have to be dense or the bridge is a
 * lie. Names, tokens, colours and boot times travel with their owner; only the index moves.
 *
 * ⚠️ AND THE WINDOW IS THE RULE, STATED: a phone that is away **at the moment the host presses
 * START** has lost its chair, and one that drops at any point **after** it keeps the chair and
 * reclaims it by token exactly as before. There is no third answer that is honest. Holding a
 * chair open for somebody who might come back means starting a show whose vote cannot resolve;
 * re-dealing when they return means changing everybody's role mid-episode. The show is a
 * broadcast — it goes out with whoever is in the studio when the light comes on.
 *
 * @returns {{kept:number, dropped:Array<{seat:number,name:string}>}}
 */
export function freezeRoster(lobby) {
  const present = [...lobby.seats.values()].sort((a, b) => a.seat - b.seat).filter((s) => s.live);
  const gone = [...lobby.seats.values()].filter((s) => !s.live).map((s) => ({ seat: s.seat, name: s.name }));
  lobby.seats.clear();
  present.forEach((s, i) => {
    s.seat = i;
    s.id = `phone-${i}`;
    lobby.seats.set(s.id, s);
  });
  for (const g of gone) note(lobby, 'seat.evicted', { seat: g.seat, name: g.name, reason: 'not in the room at the bell' });
  return { kept: present.length, dropped: gone };
}

/**
 * 🚨 WHAT THE TELEVISION IS SENT, AND NOTHING ELSE. Built field by field rather than spread from
 * the seat record — a `...s` here would put every token on a screen eight people photograph, and
 * `join-spike` J9 exists because that is a one-character mistake.
 */
export const roster = (lobby) => [...lobby.seats.values()]
  .sort((a, b) => a.seat - b.seat)
  .map((s) => ({
    seat: s.seat, name: s.name, colour: s.colour, live: s.live, drops: s.drops,
    bootMs: s.bootMs, rtt: s.rtt.length ? median(s.rtt) : null,
  }));

/** The deliverable. Whatever else happens at the party, this is what comes home. */
export function report(lobby, extra = {}) {
  const boots = [...lobby.seats.values()].map((s) => s.bootMs).filter((x) => Number.isFinite(x));
  return {
    code: lobby.code,
    durationMs: Date.now() - lobby.startedAt,
    bootBudgetMs: BOOT_BUDGET_MS,
    worstBootMs: boots.length ? Math.max(...boots) : null,
    seatsOverBudget: [...lobby.seats.values()].filter((s) => s.bootMs > BOOT_BUDGET_MS).map((s) => s.seat),
    ...extra,
    seats: [...lobby.seats.values()].map((s) => ({
      seat: s.seat, name: s.name, live: s.live, drops: s.drops,
      joinMs: s.joinedAt - lobby.startedAt, bootMs: s.bootMs, ua: s.ua,
      rtt: s.rtt.length ? { n: s.rtt.length, median: median(s.rtt), p95: pct(s.rtt, 0.95), max: Math.max(...s.rtt) } : null,
    })),
    events: lobby.events,
  };
}

export const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
export const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };

// ---------------------------------------------------------------- the socket plumbing
export function wsAccept(sock, key) {
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
    + `Sec-WebSocket-Accept: ${accept}\r\n\r\n`);
  sock.setNoDelay(true);
}

/** Read length-prefixed text frames off a socket and hand each parsed message to `onJSON`. */
export function readFrames(sock, onJSON) {
  let buf = Buffer.alloc(0);
  sock.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    let f;
    while ((f = decodeFrame(buf))) {
      buf = buf.subarray(f.consumed);
      if (f.opcode === 8) { sock.end(); return; }
      if (f.opcode !== 1) continue;
      let m; try { m = JSON.parse(f.payload.toString('utf8')); } catch { continue; }
      onJSON(m);
    }
  });
}
