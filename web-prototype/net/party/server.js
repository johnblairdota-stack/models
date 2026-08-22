/**
 * ☁️ **THE PARTYKIT ADAPTER.**
 *
 * D11: the party mode runs on Cloudflare PartyKit. This file is the whole of that decision's
 * surface area — everything below it is `createRoom`, which knows nothing about transports.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 THIS FILE IS NOT COVERED BY A GATE, AND THAT IS STATED RATHER THAN IMPLIED.
 * ---------------------------------------------------------------------------------------------
 * `party-sockets` exercises `net/party/local.mjs` — real WebSockets, real handshake, real
 * reconnect — because a PartyKit deploy cannot run in CI here. Both files are thin wrappers over
 * the SAME room module, so the game logic under test is the game logic PartyKit runs. **What is
 * untested is this adapter's seam**: `onConnect`'s parameter shape, how PartyKit hands over the
 * connection URL, and hibernation. Verify those against PartyKit's own docs before first deploy;
 * do not take the shapes below on trust from a file written without one.
 *
 * ⚠️ ONE PROPERTY MATTERS MORE THAN THE API DETAILS AND IT IS PRESERVED HERE: **there is no
 * broadcast.** `room.broadcast(...)` is the obvious PartyKit primitive and it is exactly wrong
 * for a hidden-role game. Every send below addresses one connection, having been through
 * `project()` or `visibleTo()` for that connection.
 */

import { createRoom } from '../../src/party/room.js';

/** @typedef {{ id:string, send(msg:string):void, close():void }} Conn */

export default class PrimeTimeRoom {
  constructor(party) {
    this.party = party;
    this.conns = new Map();          // socketId -> Conn
    this.tokens = new Map();         // token -> socketId
    this.game = null;
  }

  /** Address exactly one connection. The only way anything leaves this class. */
  #to(socketId, msg) {
    const c = this.conns.get(socketId);
    if (c) c.send(JSON.stringify(msg));
  }

  #ensureGame({ count, castSeed, worldSeed }) {
    if (this.game) return;
    this.game = createRoom({
      count, castSeed, worldSeed,
      send: (id, frame) => this.#to(id, { t: 'state', frame }),
      emit: (id, ev) => this.#to(id, { t: 'event', ev }),
    });
  }

  /**
   * @param {Conn} conn
   * @param {{request: Request}} ctx
   */
  onConnect(conn, ctx) {
    const url = new URL(ctx.request.url);
    const token = url.searchParams.get('token');
    this.#ensureGame({
      count: +(url.searchParams.get('count') || 8),
      // 🚨 castSeed IS MINTED HERE AND NEVER LEAVES. It is not derived from the room name, not
      // from the world seed, and not sent in any frame. See `src/party/cast.js`'s header for why
      // reusing `run.js`'s "derive it from one integer" doctrine would publish the cast.
      castSeed: (Math.random() * 0x7fffffff) | 0,
      worldSeed: +(url.searchParams.get('world') || 1),
    });

    const resumed = token && this.tokens.has(token) ? this.tokens.get(token) : null;
    const seat = resumed || this.#freeSeat();
    if (!seat) { conn.send(JSON.stringify({ t: 'full' })); conn.close(); return; }

    const fresh = resumed ? token : crypto.randomUUID();
    this.tokens.set(fresh, seat);
    this.conns.set(seat, conn);
    // `worldSeed` rides the welcome for `net/party/local.mjs`'s reason — the TV mounts its
    // night-long mansion on the first paint, which happens before the first `state` arrives, and a
    // TV that guesses the seed bakes a different house from the one the phones' maps draw.
    this.#to(seat, {
      t: 'welcome', id: seat, token: fresh, resumed: !!resumed,
      worldSeed: this.game.state.worldSeed,
    });

    // Catch a resuming socket up through the SAME filter, never with a full snapshot —
    // `net/server.mjs` L335-336 is the leak this refuses.
    if (resumed) {
      const sock = this.game.sockets.find((s) => s.id === seat);
      for (const ev of this.game.replayFor(sock)) this.#to(seat, { t: 'event', ev, replay: true });
    }
  }

  #freeSeat() {
    for (const s of this.game.sockets) if (!this.conns.has(s.id)) return s.id;
    return null;
  }

  onMessage(raw, conn) {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    const seat = [...this.conns.entries()].find(([, c]) => c === conn)?.[0];
    if (!seat) return;
    // The draw belongs to the night start, not to the first expedition — same as `local.mjs`,
    // for the same reason: a phone must hold its card before it votes a runner in.
    if (msg.t === 'start') { this.game.start(); this.game.dealRoles(); }
    if (msg.t === 'episode') this.game.playEpisode(msg.opts || {});
  }

  onClose(conn) {
    for (const [id, c] of this.conns) if (c === conn) this.conns.delete(id);
  }
}
