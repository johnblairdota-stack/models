#!/usr/bin/env node
/**
 * Authoritative game server.
 *
 *   node net/server.mjs [--port 5180]
 *
 * The replication model is lifted from `RunRobotRun/README.md` ("Networking") and mapped
 * onto WebSocket:
 *
 *   UE concept                        here
 *   ────────────────────────────────  ──────────────────────────────────────────────────
 *   server-authoritative mutators     WallState/HunterState are constructed with
 *                                     authority:true only inside this process. Clients
 *                                     hold authority:false copies that refuse to mutate.
 *   CurrentStage via RepNotify        `wall` messages carry stage only. A joiner gets a
 *                                     full `welcome` snapshot, so it silently lands in
 *                                     the correct state — the README's late-joiner case.
 *   StageHealth NOT replicated        never leaves this process. Clients have no use for
 *                                     it and it would leak how close a wall is to opening.
 *   unreliable cosmetic multicast     `fx` messages. WebSocket is reliable and ordered, so
 *                                     these cannot literally drop — instead they are
 *                                     DESIGNED to be droppable: nothing derives state from
 *                                     an `fx`, and a client that ignores every one still
 *                                     converges. That preserves the property that matters.
 *   DORM_Initial dormancy             walls are only broadcast on change, never ticked.
 *
 * Player movement is client-predicted and relayed: the server does not simulate robot
 * locomotion, it owns the things that must not be forgeable — wall stages, limb loss,
 * absorption, and hunter growth.
 */

import { WebSocketServer } from 'ws';
import { WallField, STAGE_DEFS } from '../src/destruction/wall.js';
// The SAME rules module the browser imports. `src/game/rules.js` imports nothing, exactly
// so it can be loaded here in bare node — which is what stops the server's idea of how
// much damage a nail does from drifting away from the client's.
import {
  WEAPON_DAMAGE, WEAPON_COOLDOWN, ALL_GADGETS, ARM_GADGETS, SOCKETS, SOCKET_KIND,
  hunterStageFor, HUNTER_SPEED,
} from '../src/game/rules.js';

const argv = process.argv.slice(2);
const PORT = +(argv[argv.indexOf('--port') + 1] || process.env.PORT || 5180);
const TICK_HZ = 20;
// Grace on top of WEAPON_COOLDOWN so ordinary network/timer jitter can't shave a legitimate
// shot off. Small on purpose: it's a jitter allowance, not a second, looser rate limit.
const COOLDOWN_GRACE_MS = 50;

// ---------------------------------------------------------------- world
const walls = new WallField({ authority: true });
// A demo field; the real layout comes from the level once the estate kit lands.
for (let x = 0; x < 6; x++) for (let y = 0; y < 3; y++) walls.add(`w.${x}.${y}`);

/** Hunter: authoritative, grows by absorbing parts from fallen players. */
const hunter = {
  stage: 1,            // 1..3, mirrors the Dev Art progression sheet
  absorbed: 0,         // parts taken
  pos: [0, 0, -8],
  yaw: 0,
  target: null,
  /** Absorbing enough parts pushes the hunter up a stage. Server only. */
  absorb(part) {
    this.absorbed++;
    const before = this.stage;
    // 3 parts -> stage 2, 7 -> stage 3. Tuned to the 3-stage art, not arbitrary — and the
    // thresholds live in rules.js so the client's HunterAI grows at the same counts.
    this.stage = hunterStageFor(this.absorbed);
    return { grew: this.stage !== before, from: before, to: this.stage, part };
  },
};

/**
 * DROPPED LIMBS ARE SERVER OBJECTS.
 *
 * A limb on the floor is loot, and loot that the client owns is loot the client can
 * duplicate. So every detached limb gets an id here and stays here until someone is
 * authorised to take it. The rule that makes the whole economy work — you may fit a limb
 * you found on someone else's corpse — is enforced in exactly one place: `takeLimb`.
 *
 * @type {Map<string, {id:string, kind:'arm'|'leg'|'gadget', socketKind:'arm'|'leg', gadget:string|null, from:string, pos:number[]}>}
 */
const ground = new Map();

/** @type {Map<string, {id:string, ws:WebSocket, name:string, pos:number[], yaw:number, limbs:object, alive:boolean}>} */
const players = new Map();
let nextId = 1;

/** A player's four limbs ARE their HP and their inventory. */
function freshLimbs() {
  return {
    armL: { attached: true, gadget: null },
    armR: { attached: true, gadget: null },
    legL: { attached: true, gadget: null },
    legR: { attached: true, gadget: null },
  };
}

const GADGETS = ALL_GADGETS;

/**
 * Damage is a property of the WEAPON, and the server decides what a player is holding.
 *
 * The client tells us *which* limb it fired, never how much damage to deal. The numbers
 * themselves come from `src/game/rules.js`, which the browser imports too — an earlier
 * version kept a second copy here, and two copies of a balance table is one copy too many.
 */


// ---------------------------------------------------------------- wire
function send(ws, type, data) {
  if (ws.readyState !== 1) return;
  ws.send(JSON.stringify({ t: type, ...data }));
}
function broadcast(type, data, exceptId = null) {
  const msg = JSON.stringify({ t: type, ...data });
  for (const p of players.values()) {
    if (p.id === exceptId) continue;
    if (p.ws.readyState === 1) p.ws.send(msg);
  }
}

/** Walls announce themselves on change only — no ticking, no polling. */
walls.onAnyStageChange((w, stage, info) => {
  // authoritative state: stage only
  broadcast('wall', { id: w.id, stage });
  // cosmetics, droppable by design
  broadcast('fx', { kind: 'wallBreak', id: w.id, stage, from: info.from, hit: info.hit ?? null });
});

// ---------------------------------------------------------------- messages
function onMessage(p, raw) {
  let m;
  try { m = JSON.parse(raw); } catch { return; }
  if (!m || typeof m.t !== 'string') return;

  switch (m.t) {
    // ---- client-predicted movement, relayed
    case 'move': {
      if (!p.alive) return;
      if (!Array.isArray(m.pos) || m.pos.length !== 3 || !m.pos.every(Number.isFinite)) return;
      p.pos = m.pos;
      p.yaw = Number.isFinite(m.yaw) ? m.yaw : p.yaw;
      broadcast('peer', { id: p.id, pos: p.pos, yaw: p.yaw }, p.id);
      return;
    }

    // ---- damage a wall. Authoritative: the client names the weapon, the server sets
    // the number, and it verifies the player actually has that weapon fitted.
    case 'shoot': {
      if (!p.alive) return;
      const w = walls.get(m.wall);
      if (!w) return;

      const weapon = typeof m.weapon === 'string' ? m.weapon : 'fist';
      const dmg = WEAPON_DAMAGE[weapon];
      if (!dmg) return;

      // Default-deny: a weapon only passes if a branch below explicitly grants it. The old
      // shape was a chain of gates with no else-reject, so anything that matched none of
      // them (i.e. every WEAPON_DAMAGE entry not named here) fell through to "granted" —
      // that is how `limbClub` and `hunterSlam` got applied ungated. `hunterSlam` is the
      // hunter NPC's own attack (see hunter-ai.js) and has no branch at all here, so it can
      // never be granted from a player socket.
      let allowed = false;
      if (GADGETS.includes(weapon)) {
        // A gadget can only be fired from a limb that is attached and actually carries it.
        allowed = Object.values(p.limbs).some((l) => l.attached && l.gadget === weapon);
      } else if (weapon === 'fist') {
        allowed = p.limbs.armL.attached || p.limbs.armR.attached;
      } else if (weapon === 'limbClub') {
        // Swinging a limb carried in a fist (LimbRig.pickUp/swing in src/game/limbs.js).
        // `p.carrying` is this server's mirror of the client's `rig.held`: set by `takeLimb`
        // when the drop is taken with no socket, cleared by `dropLimb`. No carried limb, no
        // club — this is the real gate `limbClub` needs, not a ban.
        allowed = !!p.carrying;
      }
      if (!allowed) return;

      // Per-player, per-weapon rate limit. WEAPON_COOLDOWN is the same table the client
      // reads (src/game/player.js's `_fireCd` is 0.55s for fist and 0.72s for limbClub —
      // exactly these values), so an honest client already self-paces to this; the grace
      // above only covers jitter, it does not relax the limit.
      const now = Date.now();
      const cooldownMs = (WEAPON_COOLDOWN[weapon] ?? 0) * 1000;
      const lastShot = p.lastShot[weapon] ?? 0;
      if (now - lastShot < cooldownMs - COOLDOWN_GRACE_MS) return;
      p.lastShot[weapon] = now;

      w.applyDamage(dmg, m.hit ?? null);   // broadcasts via the listener above
      return;
    }

    // ---- a limb comes off. This is the HP system, so the server owns it.
    case 'loseLimb': {
      if (!p.alive) return;
      const limb = p.limbs[m.limb];
      if (!limb || !limb.attached) return;
      limb.attached = false;
      const remaining = Object.values(p.limbs).filter((l) => l.attached).length;
      // a detached limb becomes a world object: pickup, weapon, or hunter food
      const dropId = `limb.${p.id}.${m.limb}.${Date.now().toString(36)}`;
      // the limb becomes a world object the SERVER owns, so it can be taken exactly once
      ground.set(dropId, {
        id: dropId,
        kind: limb.gadget ? 'gadget' : (m.limb.startsWith('leg') ? 'leg' : 'arm'),
        socketKind: m.limb.startsWith('leg') ? 'leg' : 'arm',
        gadget: limb.gadget ?? null,
        from: p.id,
        pos: p.pos.slice(),
      });
      limb.gadget = null;
      broadcast('limb', { player: p.id, limb: m.limb, attached: false, dropId, remaining });

      if (remaining === 0) {
        p.alive = false;
        broadcast('down', { id: p.id });
        // the hunter takes a part and may grow — this is the core escalation loop
        const g = hunter.absorb({ from: p.id, limb: m.limb });
        broadcast('hunter', { stage: hunter.stage, absorbed: hunter.absorbed });
        if (g.grew) broadcast('fx', { kind: 'hunterGrew', from: g.from, to: g.to });
      }
      return;
    }

    // ---- reattach a limb, or fit a gadget limb in its place
    case 'attachLimb': {
      if (!p.alive) return;
      const limb = p.limbs[m.limb];
      if (!limb || limb.attached) return;
      const gadget = GADGETS.includes(m.gadget) ? m.gadget : null;
      limb.attached = true;
      limb.gadget = gadget;
      broadcast('limb', {
        player: p.id, limb: m.limb, attached: true, gadget,
        remaining: Object.values(p.limbs).filter((l) => l.attached).length,
      });
      return;
    }

    // ---- take a limb off the floor. THE SCAVENGING RULE, and the only place it lives.
    // A limb is not owned by whoever dropped it: any player may fit any limb, provided an
    // arm goes in a shoulder and a leg goes in a hip. The item leaves the ground before
    // anything else happens, so two players racing for the same leg cannot both get it.
    case 'takeLimb': {
      if (!p.alive) return;
      const item = ground.get(m.dropId);
      if (!item) return;
      const socket = typeof m.socket === 'string' ? m.socket : null;
      if (socket) {
        if (!SOCKETS.includes(socket)) return;
        if (SOCKET_KIND[socket] !== item.socketKind) return;
        const limbId = { shoulderL: 'armL', shoulderR: 'armR', hipL: 'legL', hipR: 'legR' }[socket];
        const slot = p.limbs[limbId];
        if (!slot || slot.attached) return;
        ground.delete(m.dropId);
        slot.attached = true;
        slot.gadget = item.gadget;
        broadcast('limbTaken', { dropId: m.dropId, by: p.id, socket, gadget: item.gadget, from: item.from });
        broadcast('limb', {
          player: p.id, limb: limbId, attached: true, gadget: item.gadget,
          scavengedFrom: item.from === p.id ? null : item.from,
          remaining: Object.values(p.limbs).filter((l) => l.attached).length,
        });
      } else {
        // carried in a fist rather than fitted, so it needs a hand that is free and is not
        // already holding a gun
        const hands = Object.entries(p.limbs)
          .filter(([k, l]) => k.startsWith('arm') && l.attached && !l.gadget).length;
        if (hands - (p.carrying ? 1 : 0) <= 0) return;
        ground.delete(m.dropId);
        p.carrying = item;
        broadcast('limbTaken', { dropId: m.dropId, by: p.id, socket: null, carried: true });
      }
      return;
    }

    // ---- throw down whatever is in your fist; it becomes a world object again
    case 'dropLimb': {
      if (!p.carrying) return;
      const item = p.carrying;
      p.carrying = null;
      item.pos = p.pos.slice();
      ground.set(item.id, item);
      broadcast('limbDropped', { dropId: item.id, by: p.id, pos: item.pos });
      return;
    }

    case 'respawn': {
      p.alive = true;
      p.limbs = freshLimbs();
      p.carrying = null;
      broadcast('respawn', { id: p.id, limbs: p.limbs });
      return;
    }

    // ---- debug harness, mirroring the UE console commands
    case 'debug': {
      if (m.cmd === 'damage') { walls.get(m.wall)?.applyDamage(+m.amount || 0, m.hit ?? null); }
      else if (m.cmd === 'resetWalls') { walls.resetAll(); broadcast('snapshotWalls', { walls: walls.snapshot() }); }
      else if (m.cmd === 'setStage') { walls.get(m.wall)?.setStage(m.stage); }
      else if (m.cmd === 'hunterStage') {
        hunter.stage = clamp(m.stage | 0, 1, 3);
        broadcast('hunter', { stage: hunter.stage, absorbed: hunter.absorbed });
      }
      return;
    }

    case 'ping': send(p.ws, 'pong', { at: m.at }); return;
  }
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

// ---------------------------------------------------------------- lifecycle
const wss = new WebSocketServer({ port: PORT });

wss.on('connection', (ws) => {
  const id = 'p' + (nextId++);
  const p = {
    id, ws, name: id, pos: [0, 0, 0], yaw: 0, limbs: freshLimbs(), alive: true, carrying: null,
    lastShot: {},   // weapon name -> Date.now() of last accepted shot, for cooldown enforcement
  };
  players.set(id, p);

  // The full authoritative snapshot. This one message is what makes a late joiner correct.
  send(ws, 'welcome', {
    you: id,
    tickHz: TICK_HZ,
    stageDefs: STAGE_DEFS.map(({ stage, name }) => ({ stage, name })),
    walls: walls.snapshot(),
    // the loot on the floor is authoritative state too: a late joiner that cannot see it
    // would walk past a leg it is allowed to fit
    ground: [...ground.values()],
    hunter: { stage: hunter.stage, absorbed: hunter.absorbed, pos: hunter.pos, yaw: hunter.yaw },
    peers: [...players.values()].filter((q) => q.id !== id)
      .map((q) => ({ id: q.id, pos: q.pos, yaw: q.yaw, limbs: q.limbs, alive: q.alive })),
  });

  broadcast('join', { id, pos: p.pos, yaw: p.yaw, limbs: p.limbs }, id);

  ws.on('message', (raw) => { try { onMessage(p, raw); } catch (e) { console.error('msg error', e.message); } });
  ws.on('close', () => {
    // `takeLimb` (no socket) moves a dropped item into `p.carrying` — it stops being a
    // `ground` object so it can't be duplicated, but that also means it is nowhere at all
    // once this player entry is gone. Put it back exactly like `dropLimb` does, using the
    // same broadcast the rest of the protocol already uses for "an item just landed on the
    // floor", so connected clients pick it up in their `ground` map without a new message
    // type. Fitted (socketed) limbs are not carried items and are not touched here — they
    // simply leave with the player, same as before.
    if (p.carrying) {
      const item = p.carrying;
      item.pos = p.pos.slice();
      ground.set(item.id, item);
      broadcast('limbDropped', { dropId: item.id, by: p.id, pos: item.pos });
    }
    players.delete(id);
    broadcast('leave', { id });
  });
  ws.on('error', () => {});
});

// hunter movement: server-driven, so it cannot be spoofed and every client agrees
let last = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = (now - last) / 1000;
  last = now;

  // chase the nearest living player
  let best = null, bestD = Infinity;
  for (const q of players.values()) {
    if (!q.alive) continue;
    const d = dist2(q.pos, hunter.pos);
    if (d < bestD) { bestD = d; best = q; }
  }
  hunter.target = best?.id ?? null;
  if (best) {
    const speed = HUNTER_SPEED[hunter.stage] ?? HUNTER_SPEED[1];
    const dx = best.pos[0] - hunter.pos[0], dz = best.pos[2] - hunter.pos[2];
    const len = Math.hypot(dx, dz) || 1;
    if (len > 1.2) {
      hunter.pos[0] += (dx / len) * speed * dt;
      hunter.pos[2] += (dz / len) * speed * dt;
    }
    hunter.yaw = Math.atan2(dx, dz);
  }
  broadcast('hunterPos', { pos: hunter.pos, yaw: hunter.yaw, target: hunter.target });
}, 1000 / TICK_HZ);

function dist2(a, b) { return (a[0] - b[0]) ** 2 + (a[2] - b[2]) ** 2; }

console.log(`Run Robot Run server on ws://127.0.0.1:${PORT}  (${walls.walls.size} wall panels, ${TICK_HZ} Hz)`);
