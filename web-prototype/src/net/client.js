import { WallField } from '../destruction/wall.js';
import { SOCKETS, SOCKET_LIMB, LIMB_SOCKET } from '../game/rules.js';

/**
 * CLIENT SIDE OF THE AUTHORITATIVE SERVER.
 *
 * The split, straight out of `RunRobotRun/README.md` and mirrored in `net/server.mjs`:
 *
 *   AUTHORITATIVE, replicated, never predicted
 *     wall stages · which sockets are full and what is in them · which dropped limbs still
 *     exist and who took them · hunter stage and absorbed count
 *
 *   PREDICTED, relayed, corrected only when it drifts
 *     your own position and facing. You run your own `Player` at full rate and tell the
 *     server where you ended up; the server relays it to peers. Robot locomotion is not
 *     worth simulating twice and is not worth cheating at.
 *
 *   COSMETIC, droppable BY DESIGN
 *     `fx` messages: debris, dust, tracers, the hunter's growth flash. Nothing derives
 *     state from one. A client that ignores every `fx` still converges — that property is
 *     what makes them safe to send unreliably, and `harness/test-net.mjs` asserts it.
 *
 * The local `WallField` is constructed with `authority:false`, so every mutator on it
 * early-outs. A client physically cannot open a wall; it can only ask, and then be told.
 *
 * ---------------------------------------------------------------------------
 * USE
 *   const net = new NetClient({ url: 'ws://127.0.0.1:5180' });
 *   net.on('wall', ({ id, stage }) => room.panelsById[id]?.syncStage(stage));
 *   net.on('limb', (m) => applyRemoteLimb(m));
 *   await net.connect();
 *   net.move(player.pos, player.facing);          // every tick
 *   net.shoot('panel.1', 'nailgun', hitPoint);    // ASK. The server decides.
 *   net.loseLimb('legR');  net.takeLimb(dropId, 'hipR');  net.dropLimb();
 *
 * STATUS: complete and matched to the server's message set, but NOT yet wired into
 * `src/views/game.js`. game.play still runs offline with the client as its own authority
 * (`new WallField({ authority: true })`). Wiring it is one substitution — see
 * `bindRoom()` and `bindPlayer()` below — plus a second `Player` instance per peer.
 */

export class NetClient {
  constructor(o = {}) {
    this.url = o.url ?? `ws://${location.hostname}:5180`;
    this.walls = new WallField({ authority: false });   // refuses to mutate. On purpose.
    this.you = null;
    this.peers = new Map();      // id -> { id, pos, yaw, limbs, alive }
    this.ground = new Map();     // dropId -> item descriptor
    this.hunter = { stage: 1, absorbed: 0, pos: [0, 0, 0], yaw: 0, target: null };
    this.connected = false;
    this.rtt = 0;
    this._handlers = new Map();
    this._ws = null;
    this._sendAcc = 0;
    this.sendHz = o.sendHz ?? 20;
    this._lastSent = { pos: [NaN, NaN, NaN], yaw: NaN };
  }

  on(type, fn) {
    if (!this._handlers.has(type)) this._handlers.set(type, new Set());
    this._handlers.get(type).add(fn);
    return () => this._handlers.get(type).delete(fn);
  }
  _emit(type, m) { for (const fn of this._handlers.get(type) ?? []) fn(m, this); }

  connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this._ws = ws;
      ws.onopen = () => { this.connected = true; };
      ws.onerror = (e) => { if (!this.you) reject(e); };
      ws.onclose = () => { this.connected = false; this._emit('close', {}); };
      ws.onmessage = (ev) => {
        let m; try { m = JSON.parse(ev.data); } catch { return; }
        this._apply(m);
        if (m.t === 'welcome') resolve(this);
      };
    });
  }

  // ---- inbound -----------------------------------------------------------

  _apply(m) {
    switch (m.t) {
      case 'welcome': {
        this.you = m.you;
        this.tickHz = m.tickHz;
        // The one message that makes a late joiner correct. Nothing is replayed; the
        // snapshot IS the state, and every wall lands on its stage silently.
        for (const w of m.walls) { if (!this.walls.get(w.id)) this.walls.add(w.id); }
        this.walls.applySnapshot(m.walls);
        for (const g of m.ground ?? []) this.ground.set(g.id, g);
        for (const p of m.peers ?? []) this.peers.set(p.id, p);
        this.hunter = { ...this.hunter, ...m.hunter };
        break;
      }
      case 'wall': {
        // authoritative stage only — stageHealth deliberately never crosses the wire
        let w = this.walls.get(m.id);
        if (!w) w = this.walls.add(m.id);
        w.syncStage(m.stage);
        break;
      }
      case 'snapshotWalls': this.walls.applySnapshot(m.walls); break;
      case 'join': this.peers.set(m.id, { id: m.id, pos: m.pos, yaw: m.yaw, limbs: m.limbs, alive: true }); break;
      case 'leave': this.peers.delete(m.id); break;
      case 'peer': { const p = this.peers.get(m.id); if (p) { p.pos = m.pos; p.yaw = m.yaw; } break; }
      case 'limb': {
        const who = m.player === this.you ? null : this.peers.get(m.player);
        if (who?.limbs?.[m.limb]) { who.limbs[m.limb].attached = m.attached; who.limbs[m.limb].gadget = m.gadget ?? null; }
        if (m.dropId) this.ground.set(m.dropId, { id: m.dropId, from: m.player, socketKind: m.limb.startsWith('leg') ? 'leg' : 'arm' });
        break;
      }
      case 'limbTaken': this.ground.delete(m.dropId); break;
      case 'limbDropped': this.ground.set(m.dropId, { id: m.dropId, from: m.by, pos: m.pos }); break;
      case 'down': { const p = this.peers.get(m.id); if (p) p.alive = false; break; }
      case 'respawn': { const p = this.peers.get(m.id); if (p) { p.alive = true; p.limbs = m.limbs; } break; }
      case 'hunter': this.hunter.stage = m.stage; this.hunter.absorbed = m.absorbed; break;
      case 'hunterPos': this.hunter.pos = m.pos; this.hunter.yaw = m.yaw; this.hunter.target = m.target; break;
      case 'pong': this.rtt = performance.now() - m.at; break;
    }
    this._emit(m.t, m);
    this._emit('*', m);
  }

  // ---- outbound ----------------------------------------------------------

  _send(t, data) { if (this._ws?.readyState === 1) this._ws.send(JSON.stringify({ t, ...data })); }

  /**
   * Position, rate-limited and dropped when nothing changed. Movement is the only thing
   * sent continuously, so it is the only thing worth being careful about.
   */
  move(pos, yaw, dt = 0) {
    this._sendAcc += dt;
    if (this._sendAcc < 1 / this.sendHz) return;
    this._sendAcc = 0;
    const p = [+pos.x.toFixed(3), +pos.y.toFixed(3), +pos.z.toFixed(3)];
    const y = +yaw.toFixed(3);
    const l = this._lastSent;
    if (p[0] === l.pos[0] && p[1] === l.pos[1] && p[2] === l.pos[2] && y === l.yaw) return;
    this._lastSent = { pos: p, yaw: y };
    this._send('move', { pos: p, yaw: y });
  }

  /** ASK for wall damage. Never say how much — the server owns the number. */
  shoot(wallId, weapon, hit = null) { this._send('shoot', { wall: wallId, weapon, hit }); }

  loseLimb(limbId) { this._send('loseLimb', { limb: limbId }); }
  /** socket = null means "carry it in a fist" rather than "fit it". */
  takeLimb(dropId, socket = null) { this._send('takeLimb', { dropId, socket }); }
  dropLimb() { this._send('dropLimb', {}); }
  fitGadget(limbId, gadget) { this._send('attachLimb', { limb: limbId, gadget }); }
  respawn() { this._send('respawn', {}); }
  ping() { this._send('ping', { at: performance.now() }); }
  debug(cmd, args = {}) { this._send('debug', { cmd, ...args }); }

  close() { this._ws?.close(); }
}

// ---------------------------------------------------------------------------
// Integration helpers — the two substitutions that turn game.play multiplayer
// ---------------------------------------------------------------------------

/**
 * Point a room's destructible panels at the server instead of at themselves.
 *
 * Offline, `buildTestRoom` is handed a `WallField({authority:true})` and the client is its
 * own authority. Online, hand it nothing, call this, and every panel becomes a display of
 * a stage the server owns: local damage requests go out as `shoot`, and the panel only
 * changes when a `wall` message comes back.
 */
export function bindRoom(net, room) {
  const byId = new Map(room.panels.map((p) => [p.id, p]));
  room.panelsById = byId;
  net.on('wall', (m) => byId.get(m.id)?.syncStage(m.stage, m));
  // fire-and-forget cosmetics: a dropped one leaves the wall correct, only quieter
  net.on('fx', (m) => { if (m.kind === 'wallBreak') byId.get(m.id)?.onBreak?.(m.stage, m, byId.get(m.id)); });
  for (const p of room.panels) {
    if (!net.walls.get(p.id)) net.walls.add(p.id);
    p.damage = (amount, hit) => { net.shoot(p.id, hit?.weapon ?? 'fist', hit); return { changed: false }; };
  }
  return byId;
}

/**
 * Mirror a local `LimbRig` onto the server. The rig stays the presentation; the server
 * stays the truth. Local detach requests go up as `loseLimb`, and the authoritative reply
 * is what actually empties the socket on every client including this one.
 */
export function bindPlayer(net, player) {
  const rig = player.rig;
  const localDetach = rig.detach.bind(rig);
  rig.detach = (socket, opts) => { net.loseLimb(SOCKET_LIMB[socket]); return localDetach(socket, opts); };
  net.on('limb', (m) => {
    if (m.player !== net.you) return;
    const socket = LIMB_SOCKET[m.limb];
    if (!socket) return;
    if (!m.attached && rig.occupant(socket) !== 'empty') localDetach(socket, {});
  });
  return () => { rig.detach = localDetach; };
}

export { SOCKETS };
