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
import { OUTCOME } from '../../src/party/win.js';
import { WARM_STAGES, moveViolations, warmPct, worldViolations } from '../../src/party/follow.js';
import {
  isShowBeat, missionEndsRun, recapAfterMs, nextShowBeat, holdMsFor, remainingMs,
  CASTING_BACKSTOP_MS,
  RUN_END, LATE_DEBRIEF_MS, EMPTY_RECKONING_EXTEND_CAP,
  isReadyBeat, readyNeeded, readyMet, READY_COUNTDOWN_MS,
} from '../../src/party/show.js';
import { reckoningSeconds } from '../../src/party/phases.js';
import { reactCheck } from '../../src/party/react.js';
import {
  freshLinks, pruneLinks, publicLinks, linkBlock, requestLink, acceptLink, declineLink, unlink,
  whisperAudience, whisperViolations, cleanWhisper, isLinkBeat, expirePending, expirePairs,
  finishPair,
} from '../../src/party/link.js';

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
  r = {
    code, game, conns, seatsTaken: new Set(), tvTaken: false, ballots: new Map(),
    show: 'lobby', showClock: null,
    // How the LAST live run ended — SMASHED / TIME, never invented. Cleared when a fresh
    // expedition starts; read by `recapBoard` so the recap card can post it. `show.js`'s `RUN_END`.
    runEnd: null,
    /** Epoch ms deadline for the current timed beat. Fanned as `show.until`. */
    showUntil: null,
    reckoningStartedAt: null,
    /** How many times an empty Reckoning window has been re-armed. Capped. */
    reckoningEmptyExtends: 0,
  };
  rooms.set(code, r);
  return r;
}

function clearShowClock(room) {
  if (room.showClock) {
    clearTimeout(room.showClock);
    room.showClock = null;
  }
}

/**
 * Persist + fan the beat so a refreshed TV resumes here, not on host-tab RAM.
 *
 * `end` is the recap outcome (`RUN_END`), passed only by the two calls below that actually end a
 * run. A fresh expedition clears whatever the last run's outcome was — the TV must not carry
 * yesterday's SMASHED into a recap for a run that has not happened yet.
 */
function showPayload(room) {
  return {
    t: 'show',
    beat: room.show,
    ...(room.runEnd ? { end: room.runEnd } : {}),
    ...(Number.isFinite(room.showUntil) ? { until: room.showUntil } : {}),
  };
}

/* =============================================================================================
 * ✋ READY — the room ending its own talk beat. Rule lives in `show.js`; this is the plumbing.
 *
 * ⚠️ **THE SET IS CLEARED ON EVERY BEAT CHANGE.** A thumb that meant "I am done talking about
 * the cellar" must not still mean "I am done" two beats later. `setShow` is the single door every
 * beat change goes through, including the host workaround and the casting backstop, which is why
 * the clear lives there and not in each `enter*Live`.
 * ============================================================================================= */

function readyState(room) {
  const living = livingSeatedIds(room);
  const set = room.ready || (room.ready = new Set());
  // A player who died, left their seat, or was evicted must stop counting toward the majority.
  for (const id of [...set]) if (!living.includes(id)) set.delete(id);
  return { count: set.size, living: living.length, need: readyNeeded(living.length) };
}

function fanoutReady(room) {
  const { count, need } = readyState(room);
  fanout(room, { t: 'ready', count, need });
}

function clearReady(room) {
  if (room.ready?.size) room.ready.clear();
  if (room.readyClock) { clearTimeout(room.readyClock); room.readyClock = null; }
}

/**
 * 👏 ONE TAP ON THE REACTION PAD. See `src/party/react.js` for the four decisions this enforces;
 * everything here is the plumbing of them.
 *
 * ⚠️ **A REFUSAL IS SILENT.** Every failing branch returns without sending anything, to the
 * tapper as well as to the room. A refusal receipt would be a signal in itself — "JOHN tried to
 * react" is information about a dead player or a player on cooldown, aired to eight phones, in
 * the one beat where reading the room is the game. The phone runs its own cooldown for feel; the
 * server's is the one that counts, and the two disagreeing is a UI bug, never a leak.
 *
 * Returns the reaction it aired, or null — gates assert on the return rather than on a socket.
 */
export function applyReact(room, playerId, raw, now = Date.now()) {
  if (!room || !playerId) return null;
  const last = room.reactAt || (room.reactAt = new Map());
  const check = reactCheck({
    reaction: raw,
    beat: room.show,
    alive: livingSeatedIds(room).includes(playerId),
    lastAt: last.get(playerId),
    now,
  });
  if (!check.ok) return null;
  last.set(playerId, now);
  /*
   * 🚨 THE PAYLOAD IS THE WHOLE PAYLOAD. No name, no shell, no accent — the TV already holds all
   * three on the lobby seat, and re-sending them here would put a second, unversioned copy of a
   * player's identity on a hot path that fires several times a second. `from` is the seat's
   * playerId, which is what every other public fanout already keys on.
   */
  fanout(room, { t: 'react', from: playerId, r: check.reaction, at: now });
  return check.reaction;
}

/**
 * One thumb, up or down. Returns the beat the room is on afterwards so gates can assert without
 * sitting through a countdown.
 *
 * A majority arms `READY_COUNTDOWN_MS` rather than ending instantly — see `show.js`. Dropping
 * back below the majority DISARMS it, because ready is a toggle and someone who thinks of one
 * more thing should be able to take it back.
 */
export function applyReady(room, playerId, on = true) {
  if (!room || !playerId) return null;
  if (!isReadyBeat(room.show)) return room.show;
  if (!livingSeatedIds(room).includes(playerId)) return room.show;

  const set = room.ready || (room.ready = new Set());
  if (on) set.add(playerId); else set.delete(playerId);

  const { count, living } = readyState(room);
  const met = readyMet(count, living);
  if (met && !room.readyClock) {
    room.readyClock = setTimeout(() => {
      room.readyClock = null;
      // Re-check on arrival: the room can fall below the majority while the countdown runs.
      const s = readyState(room);
      if (!readyMet(s.count, s.living) || !isReadyBeat(room.show)) return;
      progressShow(room);
    }, READY_COUNTDOWN_MS);
    room.readyClock.unref?.();
  } else if (!met && room.readyClock) {
    clearTimeout(room.readyClock);
    room.readyClock = null;
  }
  fanoutReady(room);
  return room.show;
}

/* =============================================================================================
 * 🍮 THE PAIR — "public that it happened, private what was said."
 *
 * Rules and name generation live in `src/party/link.js`; this is the transport. The one thing
 * that matters here and nowhere else:
 *
 * 🚨 **A WHISPER IS PUSHED TO EXACTLY TWO SOCKETS AND IS NEVER, EVER `fanout`ED.** It is the
 * first player-authored content in this codebase that some sockets may read and others may not.
 * `fanoutViolations` does not know the word `whisper` and MUST NOT learn it — a whisper is not a
 * broadcast with a filter on it, it is a different verb. `link-merge` L10-L13 assert exactly
 * that, by feeding a whisper to the fanout validator and requiring a refusal.
 * ============================================================================================= */

/**
 * ⚠️ **PRUNE AGAINST LIVE SOCKETS, NOT SEATED IDS — AND EXPIRE THE STALE REQUESTS.**
 *
 * Two holes an adversarial playtester proved, both here:
 *
 *  1. **The ghost pair.** `seatsTaken` is never cleared when a socket dies, so a player who
 *     yanked their cable was still "living and seated" and their partner stayed locked to
 *     nobody. Accept, destroy the socket, and the victim is held for the whole beat — and their
 *     only escape was Disconnect, which charged THEM the turn while the griefer, who never sent
 *     `unlink`, paid nothing and reconnected by token to do it again down the table.
 *  2. **`LINK_REQUEST_MS` was dead code.** `expirePending` was written, exported, documented —
 *     and never called. A request from someone who has walked away stood for the entire beat and
 *     could still be accepted into a pair with a phone that was not there.
 */
/** Test seam: the same prune the live paths run, so a gate can observe it without a socket. */
export function roomLinks(room) { return linksOf(room); }

function linksOf(room) {
  if (!room.links) room.links = freshLinks();
  const live = livingSeatedIds(room).filter((pid) => {
    const sid = socketIdFor(room, pid);
    return sid != null && room.conns.has(sid);
  });
  const now = Date.now();
  room.links = expirePairs(expirePending(pruneLinks(room.links, live), now), now);
  return room.links;
}

/* =============================================================================================
 * ⏱️ **THE PAIR CLOCK — the first timer this subsystem has ever had, and it was the hole.**
 *
 * `expirePending` and `expirePairs` are pure functions that only ran when `linksOf` was called,
 * and `linksOf` only ran when SOMEBODY ELSE sent a link message. A play critic measured the
 * consequence: a request stood unanswered for 26 seconds against a 20-second limit, because no
 * other traffic happened to arrive. The default no-input path — reach out to someone who is
 * mid-conversation and not looking at their phone — pinned the asker indefinitely with their
 * unanswered pass broadcast to the room.
 *
 * So the room gets a heartbeat while a link beat is running. One interval per room, cleared in
 * `clearLinks` and on every beat change, and it only fans out when something actually changed —
 * a timer that broadcasts every second would be the amplification hole all over again.
 * ============================================================================================= */
const LINK_TICK_MS = 1000;

function stopLinkClock(room) {
  if (room.linkClock) { clearInterval(room.linkClock); room.linkClock = null; }
}

function startLinkClock(room) {
  stopLinkClock(room);
  room.linkClock = setInterval(() => {
    if (!isLinkBeat(room.show)) { stopLinkClock(room); return; }
    const before = JSON.stringify(publicLinks(room.links || freshLinks()));
    linksOf(room);                                   // expires pending AND pairs
    if (JSON.stringify(publicLinks(room.links)) !== before) fanoutLinks(room);
  }, LINK_TICK_MS);
  room.linkClock.unref?.();
}

function fanoutLinks(room) {
  fanout(room, { t: 'links', ...publicLinks(linksOf(room)) });
}

function clearLinks(room) {
  room.links = freshLinks();
  stopLinkClock(room);
}

/** Socket id for a playerId, so a whisper can be addressed rather than broadcast. */
function socketIdFor(room, playerId) {
  const s = room.game.sockets.find((x) => !x.isTV && x.playerId === playerId);
  return s ? s.id : null;
}

export function applyLinkRequest(room, from, to) {
  if (!room || !from || !to) return null;
  const opts = { living: livingSeatedIds(room), beat: room.show, now: Date.now() };
  const why = linkBlock(linksOf(room), from, to, opts);
  if (why) return why;
  room.links = requestLink(room.links, from, to, opts);
  fanoutLinks(room);
  return null;
}

export function applyLinkAccept(room, from, to) {
  if (!room) return null;
  const names = {};
  for (const p of room.game.state.players) names[p.id] = p.name;
  const before = linksOf(room).pairs.length;
  room.links = acceptLink(room.links, from, to, { names, now: Date.now() });
  if (room.links.pairs.length === before) return 'nothing to accept';
  fanoutLinks(room);
  return null;
}

/*
 * 🚨 **A REFUSAL IS THE BEST TELEVISION THIS MECHANIC MAKES, AND IT USED TO BE SILENT.**
 * `declineLink` filtered the row out of `pending` and nothing else happened — from the room's
 * side a refusal was indistinguishable from a request that lapsed, and the refused player was
 * not told either. Being turned down in front of everybody is exactly the public cost that makes
 * reaching out a real decision, so it is broadcast.
 *
 * It rides ON the links fanout as a TRANSIENT rather than living in the links state, because it
 * is an event, not a fact: there is nothing for a reconnecting phone to catch up on.
 */
export function applyLinkDecline(room, from, to) {
  if (!room) return null;
  const had = (linksOf(room).pending || []).some((r) => r.from === from && r.to === to);
  room.links = declineLink(room.links, from, to);
  if (had) fanout(room, { t: 'links', ...publicLinks(room.links), refused: { from, to } });
  else fanoutLinks(room);
  return null;
}

export function applyUnlink(room, id) {
  if (!room) return null;
  room.links = unlink(linksOf(room), id);
  fanoutLinks(room);
  return null;
}

/**
 * ✅ One thumb on DONE. The pair only dissolves when both are in — see `finishPair`'s header for
 * why that matters, and why this is a different verb from `unlink` rather than a nicer one.
 */
export function applyFinish(room, id, on = true) {
  if (!room || !id) return null;
  room.links = finishPair(linksOf(room), id, on);
  fanoutLinks(room);
  return null;
}

/**
 * Route one whisper. Returns the socket ids it reached, so a gate can assert "exactly two" and
 * `party-sockets` can assert nobody else's socket saw a byte of it.
 */
export function applyWhisper(room, from, text) {
  if (!room || !from) return [];
  const clean = cleanWhisper(text);
  if (!clean) return [];
  const audience = whisperAudience(linksOf(room), from);
  if (!audience.length) return [];
  const msg = { t: 'whisper', from, text: clean, at: Date.now() };
  if (whisperViolations(msg).length) return [];
  const sent = [];
  for (const pid of audience) {
    const sid = socketIdFor(room, pid);
    if (sid) { push(room, sid, msg); sent.push(sid); }
  }
  return sent;
}

/** Test seam: fire the armed countdown now instead of waiting three seconds. */
export function readyCountdownNow(room) {
  if (!room?.readyClock) return null;
  clearTimeout(room.readyClock);
  room.readyClock = null;
  const s = readyState(room);
  if (!readyMet(s.count, s.living) || !isReadyBeat(room.show)) return room.show;
  return progressShow(room);
}

function setShow(room, beat, end = null) {
  if (!isShowBeat(beat)) return;
  clearReady(room);
  /*
   * 🍮 **A PAIR LASTS ONE BEAT.** Deliberate, and the most important rule in the mechanic after
   * privacy: a channel that survived into the vote would be a permanent private line between two
   * players, which is a different and much worse game. You get the Debrief, and then you are
   * back in the room with everyone else and have to decide whether to do it again in front of
   * them. Gate: `link-merge` L20.
   */
  if (room.show !== beat) clearLinks(room);
  room.show = beat;
  if (beat === 'expedition' || beat === 'lobby' || beat === 'casting') {
    if (beat === 'expedition') room.runEnd = null;
    room.showUntil = null;
    room.reckoningStartedAt = null;
  } else if (end) room.runEnd = end;
  fanout(room, showPayload(room));
  // Casting is the one beat with no visible deadline, so it gets an invisible one. Armed here
  // rather than in `enterNextCasting` so every path into casting is covered, including the
  // host's `t:'show'` workaround.
  if (beat === 'casting') startCastingClock(room);
  /*
   * ✋ **THE THRESHOLD HAS TO ARRIVE BEFORE THE FIRST TAP, OR THE BEAT DEADLOCKS.** `readyHtml`
   * on the phone draws nothing until it knows `need`, and `need` only ever arrived on a `ready`
   * fanout — which only fires when somebody taps. So the button did not exist until it had been
   * pressed. Found by driving a real phone through a real Debrief, not by any gate: every
   * assertion about the rule itself passed, because the rule was right and the plumbing never
   * ran. Gate: `party-night` N21h.
   */
  if (isReadyBeat(beat)) fanoutReady(room);
  // Same arrival problem as READY: the phone cannot draw a pair list it has never been sent.
  // The heartbeat runs only while a link beat does — see the pair clock block.
  if (isLinkBeat(beat)) { fanoutLinks(room); startLinkClock(room); } else stopLinkClock(room);
}

/** Valid cast ballots — seated, distinct, both roles filled. The ONE definition. */
function validCastBallots(room) {
  const seated = seatedPlayerIds(room);
  return [...room.ballots.values()].filter((v) =>
    seated.includes(v.runner) && seated.includes(v.guide) && v.runner !== v.guide);
}

/**
 * Resolve casting into a live expedition. The TV's `t:'episode'` and the server backstop both
 * come through here, so there is exactly one answer to "how does casting resolve".
 */
function runEpisodeFromBallots(room, votes, opts = {}) {
  const seated = seatedPlayerIds(room);
  room.game.playEpisode({
    ...opts,
    ballots: votes,
    ...(seated.length ? { living: seated } : {}),
    // Live night: mansion reports cameras/alarms — do not invent gate scaffold on the TV.
    scaffold: false,
  });
  // Durable show: expedition now, recap when the mission says so. Do not pin CASTING.
  startShowClock(room);
  fanout(room, lobbySnapshot(room));
}

function startCastingClock(room) {
  clearShowClock(room);
  room.showClock = setTimeout(() => {
    room.showClock = null;
    castingBackstop(room);
  }, CASTING_BACKSTOP_MS);
  room.showClock.unref?.();
}

/**
 * What the casting net does when it fires. Gates call it directly so they do not sit 45s.
 *
 * Zero valid ballots RE-ARMS and stays on casting — see `CASTING_BACKSTOP_MS`'s header. That is
 * a table that has not voted, not a room that is stuck, and empty never invents a pair.
 */
export function castingBackstop(room) {
  if (!room || room.show !== 'casting') return null;
  const votes = validCastBallots(room);
  if (!votes.length) {
    startCastingClock(room);
    return 'casting';
  }
  runEpisodeFromBallots(room, votes);
  return room.show;
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
    // The backstop firing means the mission never reached `done` — nobody smashed anything, the
    // clock ran out. That is TIME, not a made-up SMASHED.
    if (room.show === 'expedition') {
      setShow(room, 'recap', RUN_END.TIME);
      room.game.enterRecap?.();
      scheduleShowProgress(room);
    }
  }, wait);
  room.showClock.unref?.();
}

/**
 * Walk Recap → Debrief → Reckoning → Vote → Execution → Casting.
 *
 * Gates call this directly so they do not sit the shooting-schedule holds.
 * The timeouts call the same function.
 */
export function progressShow(room) {
  if (!room) return null;
  const next = nextShowBeat(room.show);
  if (!next) return room.show;
  if (next === 'debrief') {
    enterDebriefLive(room);
    return 'debrief';
  }
  if (next === 'reckoning') {
    enterReckoningLive(room);
    return 'reckoning';
  }
  if (next === 'vote') {
    enterVoteLive(room);
    return 'vote';
  }
  if (next === 'execution') {
    enterExecutionLive(room);
    return 'execution';
  }
  if (next === 'verdict') {
    enterVerdictLive(room);
    return 'verdict';
  }
  if (next === 'casting') {
    /* =========================================================================================
     * 🏁 **THE FIRST CONDITIONAL EDGE IN THE WHOLE WIRE — and the only thing that ever ends a
     * session.**
     *
     * Every other step in this chain is unconditional: a beat finishes and the next one starts.
     * `AFTER_RUN_NEXT.verdict` is 'casting' as the DEFAULT, and this is where the fold gets to
     * overrule it. Until now nothing did — `PRIME-TIME-STATE.md` §2 put it flatly: "Nothing ever
     * ends a session." `EPISODE_CAP` was a number in a table that no code enforced.
     *
     * RENEWED means play on. Anything else — FINALE, CANCELLED, ABANDONED — is the night over,
     * and the Reunion is the payoff D5 says the whole silent-death design is borrowing against.
     * ========================================================================================= */
    if (room.game?.outcome?.() && room.game.outcome() !== OUTCOME.RENEWED) {
      enterReunionLive(room);
      return 'reunion';
    }
    enterNextCasting(room);
    return 'casting';
  }
  return room.show;
}

function scheduleShowProgress(room, waitOpt = null) {
  const noms = room.game?.state?.nominations?.length ?? 0;
  const wait = Number.isFinite(waitOpt) ? waitOpt : holdMsFor(room.show, noms);
  if (!Number.isFinite(wait)) return;
  room.showUntil = Date.now() + wait;
  fanout(room, showPayload(room));
  clearShowClock(room);
  room.showClock = setTimeout(() => {
    room.showClock = null;
    expireShowHold(room);
  }, wait);
  room.showClock.unref?.();
}

/**
 * What the shooting-schedule timer does when it fires.
 *
 * 🚨 **AN EMPTY RECKONING MUST NOT SILENTLY DENY THE LYNCH.** John's playtest after #32:
 * Debrief said phones down, Reckoning lasted 45s with zero noms, and the clock walked
 * Vote → Execution → Casting. From the sofa that is "there was no way to nominate."
 *
 * `progressShow` is still the gate walk — tests call it to skip holds. This is only
 * the timeout path. With ≥1 standing nom the existing timer-to-vote stays.
 */
export function expireShowHold(room) {
  if (!room) return null;
  if (room.show === 'reckoning') {
    const n = room.game?.state?.nominations?.length ?? 0;
    if (n === 0) {
      const used = room.reckoningEmptyExtends || 0;
      if (used < EMPTY_RECKONING_EXTEND_CAP) {
        room.reckoningEmptyExtends = used + 1;
        room.reckoningStartedAt = Date.now();
        scheduleShowProgress(room, holdMsFor('reckoning', 0));
        return room.show;
      }
    }
  }
  return progressShow(room);
}

function isLateDebrief(room) {
  if (room.show !== 'debrief') return false;
  const left = remainingMs(room.showUntil);
  if (left == null) return true;
  return left <= LATE_DEBRIEF_MS;
}

/**
 * Live nominate. Reckoning is the designed window; late Debrief is the wake-up
 * so a face-down phone can name someone instead of missing a 45s clock.
 * First late-debrief tap enters Reckoning, then vote.js applies the nom.
 */
export function applyNominate(room, playerId, target) {
  if (!room || !playerId) return { ok: false, why: 'no player' };
  if (room.show === 'debrief') {
    if (!isLateDebrief(room)) return { ok: false, why: 'debrief is still talk' };
    enterReckoningLive(room);
  }
  if (room.show !== 'reckoning') return { ok: false, why: 'not reckoning' };
  const living = livingSeatedIds(room);
  const result = room.game.nominatePlayer(playerId, target, living.length ? living : null);
  if (!result.ok) return result;
  fanout(room, nomsPayload(room));
  if (result.closed) progressShow(room);
  else extendReckoning(room);
  return result;
}

function enterDebriefLive(room) {
  setShow(room, 'debrief');
  room.game.enterDebrief?.();
  scheduleShowProgress(room);
}

function enterReckoningLive(room) {
  const living = livingSeatedIds(room);
  // enterReckoning is the live path (clears standing, setPhase RECKONING, broadcast).
  // Payloads below are already stripped to FANOUT_KEYS — do not widen the allow-list
  // if something throws; fix the payload.
  room.game.enterReckoning(living);
  room.reckoningStartedAt = Date.now();
  room.reckoningEmptyExtends = 0;
  setShow(room, 'reckoning');
  fanout(room, nomsPayload(room));
  fanout(room, lynchPayload(room));
  scheduleShowProgress(room, holdMsFor('reckoning', 0));
}

function extendReckoning(room) {
  const n = room.game.state.nominations.length;
  const started = room.reckoningStartedAt || Date.now();
  const until = started + reckoningSeconds(n) * 1000;
  const left = until - Date.now();
  if (left <= 0) {
    progressShow(room);
    return;
  }
  room.showUntil = until;
  fanout(room, showPayload(room));
  clearShowClock(room);
  room.showClock = setTimeout(() => {
    room.showClock = null;
    progressShow(room);
  }, left);
  room.showClock.unref?.();
}

function enterVoteLive(room) {
  const living = livingSeatedIds(room);
  room.game.enterVote(living);
  setShow(room, 'vote');
  fanout(room, nomsPayload(room));
  fanout(room, lynchPayload(room));
  fanout(room, tallyPayload(room));
  scheduleShowProgress(room, holdMsFor('vote'));
}

function enterExecutionLive(room) {
  if (!room.game.state.voteResult) room.game.closeVote();
  room.game.enterExecution();
  setShow(room, 'execution');
  fanout(room, lynchPayload(room));
  scheduleShowProgress(room, holdMsFor('execution'));
}

/**
 * ⚖️ **THE VERDICT BEAT.** Same shape as `enterExecutionLive` above: put the room in the beat,
 * tell the phones, arm the hold.
 *
 * The fold itself is `room.game.enterVerdict()` and it lives in `src/party/room.js` on purpose —
 * see `foldVerdict`'s block there. A second copy of the win rule in this file is exactly the
 * drift `harness/episode-order.mjs` was written to catch.
 *
 * ⚠️ The payload PICKS fields off the fold and never spreads it. `foldWin` returns `fed`, and
 * the feed count is the one number `rrr-social-round.md` §4 keeps back until the Reunion.
 */
function enterVerdictLive(room) {
  const v = room.game.enterVerdict();
  setShow(room, 'verdict');
  fanout(room, {
    t: 'verdict',
    status: v.outcome,
    camerasLit: v.camerasLit,
    episode: v.episode,
  });
  scheduleShowProgress(room, holdMsFor('verdict'));
}

/**
 * 🎬 **THE REUNION.** Session-end, so it has no `AFTER_RUN_NEXT` entry and no hold: it is the
 * last thing that happens and nothing follows it. The clock is cleared rather than re-armed.
 */
function enterReunionLive(room) {
  clearShowClock(room);
  room.showUntil = null;
  setShow(room, 'reunion');
  fanout(room, { t: 'season', status: room.game.outcome() });
}

function enterNextCasting(room) {
  clearShowClock(room);
  room.ballots.clear();
  room.game.beginCasting();
  room.showUntil = null;
  room.reckoningStartedAt = null;
  room.reckoningEmptyExtends = 0;
  setShow(room, 'casting');
  fanout(room, { t: 'ballots', votes: [] });
  fanout(room, nomsPayload(room));
  fanout(room, lynchPayload(room));
  fanout(room, tallyPayload(room));
  fanout(room, lobbySnapshot(room));
}

function nomsPayload(room) {
  return {
    t: 'noms',
    standing: (room.game.state.nominations || []).map((n) => ({
      nominator: n.nominator, target: n.target,
    })),
  };
}

/**
 * 📊 How full the ballot box is. See `lynchProgress` in `src/party/room.js` for why this carries
 * a count and a threshold and never a name or a tally.
 */
function tallyPayload(room) {
  const p = room.game.lynchProgress?.() || { in: 0, living: 0, need: 0 };
  return { t: 'tally', in: p.in, living: p.living, need: p.need };
}

function lynchPayload(room) {
  const r = room.game.state.voteResult;
  if (!r) return { t: 'lynch', votes: [] };
  return {
    t: 'lynch',
    votes: Object.entries(r.votes || {}).map(([voter, choice]) => ({ voter, choice })),
    result: {
      executed: r.executed ?? null,
      counts: r.counts || {},
      threshold: r.threshold ?? 0,
      abstained: r.abstained ?? 0,
      executioner: r.executioner ?? null,
    },
  };
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
  setShow(room, 'recap', RUN_END.SMASHED);
  room.game.enterRecap?.();
  scheduleShowProgress(room);
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
  lobby: ['t', 'code', 'phase', 'episode', 'airingEpisode', 'seats'],
  lobbySeat: ['id', 'playerId', 'isTV', 'name', 'seat', 'joined', 'connected', 'shell', 'accent'],
  ballots: ['t', 'votes'],
  ballotVote: ['voter', 'runner', 'guide'],
  show: ['t', 'beat', 'end', 'until'],
  noms: ['t', 'standing'],
  nomRow: ['nominator', 'target'],
  lynch: ['t', 'votes', 'result'],
  lynchVote: ['voter', 'choice'],
  lynchResult: ['executed', 'counts', 'threshold', 'abstained', 'executioner'],
  /*
   * 🔥 How far along the TV's mansion bake is. Public, because it is the ROOM's wait, not the
   * TV's: `docs/slices/task-prime-time-lobby-warm-night.md` §3.4, and John's playtest note that
   * the load had "no loading indicator". A percentage and one of five stage words is the whole
   * payload — there is no room, no seed and no cast on it, so there is nothing here to filter.
   */
  warm: ['t', 'pct', 'stage'],
  /*
   * ✋ How many of the room have tapped READY, and how many it takes. A count and a threshold —
   * deliberately NOT a list of who. Naming the thumbs would turn "are we done talking" into a
   * public loyalty test, and it would leak a signal about who is coordinating with whom into the
   * one beat where reading the room is the entire game.
   */
  ready: ['t', 'count', 'need'],
  /*
   * 📊 How full the lynch ballot box is: a cardinality and the living majority it takes. There is
   * NO `who` and NO `counts` here — see `lynchProgress` in `src/party/room.js`. Listed so that a
   * later "while we are at it, put the tally on the wire" fails closed rather than airing the
   * result twenty-five seconds before the Execution does.
   */
  tally: ['t', 'in', 'living', 'need'],
  /*
   * 👏 One tap on the reaction pad. Attributed on purpose — an anonymous burst is weather, and
   * the point of the feature is that a boo is evidence with a name on it.
   *
   * ⚠️ **NO `name`, NO `shell`, NO `accent`, AND NEVER A `text`.** The TV already holds all three
   * on the lobby seat, so a copy here would be a second unversioned identity on a path that
   * fires several times a second. A free-text field would be a whisper channel with no pair, no
   * clock and no cap — which is the one thing the link system exists to prevent. Listed so that
   * a later "let them type a short one" fails closed instead of shipping.
   */
  react: ['t', 'from', 'r', 'at'],
  /* A voter's own receipt. PUSHED to one socket, never fanned — how the ballot is filling is
     aired at Execution and must not leak before it. Listed so the shape is still closed. */
  ballotOk: ['t', 'ok', 'choice', 'why'],
  /*
   * ⚖️ **THE VERDICT, AND THE LIST IS SHORT BECAUSE OF WHAT IS NOT ON IT.**
   *
   * `rrr-social-round.md` §4 draws the line and calls the precision "the whole of P6": the
   * status, the cameras and the episode are AIRED, attributed and permanent. Held back until the
   * Reunion: every alignment and role, which incidents had an evil cause, chat authorship — and
   * `fed`, the feed count, which `foldWin` returns right beside `camerasLit`.
   *
   * 🚨 That last one is why this row exists at all. The feed gauge is a deliberately lossy
   * proxy: evil losing a partner looks exactly like evil winning. Airing it would hand the room
   * a deduction the design spends the entire night denying it — so a later "we already have the
   * fold, just spread it" fails closed here instead of quietly ending the social game.
   */
  verdict: ['t', 'status', 'camerasLit', 'episode'],
  /*
   * 🎬 The season is over. One word, and it is the same word the Verdict plate just aired — the
   * Reunion's own reveals travel on their own payload, once the beat has actually started.
   */
  season: ['t', 'status'],
  /*
   * 🍮 WHO IS PAIRED, AND WHAT THEY ARE CALLED NOW. Public by design — the room watching JOHN
   * reach out to ELLIE is the entire point, and both names are already on the television.
   *
   * ⚠️ **THERE IS NO `text` HERE AND THERE MUST NEVER BE ONE.** The words are pushed to two
   * sockets by `applyWhisper` and are not a broadcast of any kind — `fanoutViolations` refuses
   * `t:'whisper'` outright rather than filtering it, which is why the `else` branch below is
   * load-bearing. Gate: `link-merge` L10-L13.
   */
  links: ['t', 'pending', 'pairs', 'used', 'refused'],
  /** Transient: who just turned whom down. An EVENT on the links fanout, not a stored fact. */
  linkRefused: ['from', 'to'],
  linkPend: ['from', 'to'],
  linkPair: ['a', 'b', 'name', 'at', 'done'],
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
  } else if (msg.t === 'noms') {
    extraKeys(msg, FANOUT_KEYS.noms, 'noms', bad);
    for (let i = 0; i < (msg.standing || []).length; i++) {
      extraKeys(msg.standing[i], FANOUT_KEYS.nomRow, `noms.standing[${i}]`, bad);
    }
  } else if (msg.t === 'lynch') {
    extraKeys(msg, FANOUT_KEYS.lynch, 'lynch', bad);
    for (let i = 0; i < (msg.votes || []).length; i++) {
      extraKeys(msg.votes[i], FANOUT_KEYS.lynchVote, `lynch.votes[${i}]`, bad);
    }
    if (msg.result) extraKeys(msg.result, FANOUT_KEYS.lynchResult, 'lynch.result', bad);
  } else if (msg.t === 'warm') {
    extraKeys(msg, FANOUT_KEYS.warm, 'warm', bad);
  } else if (msg.t === 'verdict') {
    extraKeys(msg, FANOUT_KEYS.verdict, 'verdict', bad);
  } else if (msg.t === 'season') {
    extraKeys(msg, FANOUT_KEYS.season, 'season', bad);
  } else if (msg.t === 'ballotOk') {
    extraKeys(msg, FANOUT_KEYS.ballotOk, 'ballotOk', bad);
  } else if (msg.t === 'ready') {
    extraKeys(msg, FANOUT_KEYS.ready, 'ready', bad);
  } else if (msg.t === 'tally') {
    extraKeys(msg, FANOUT_KEYS.tally, 'tally', bad);
  } else if (msg.t === 'react') {
    extraKeys(msg, FANOUT_KEYS.react, 'react', bad);
  } else if (msg.t === 'links') {
    extraKeys(msg, FANOUT_KEYS.links, 'links', bad);
    for (let i = 0; i < (msg.pending || []).length; i++) extraKeys(msg.pending[i], FANOUT_KEYS.linkPend, `links.pending[${i}]`, bad);
    for (let i = 0; i < (msg.pairs || []).length; i++) extraKeys(msg.pairs[i], FANOUT_KEYS.linkPair, `links.pairs[${i}]`, bad);
    if (msg.refused) extraKeys(msg.refused, FANOUT_KEYS.linkRefused, 'links.refused', bad);
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
    airingEpisode: room.game.state.airingEpisode,
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
    // A refreshed or resuming TV gets the outcome along with the beat, not just the word "recap" —
    // otherwise a reload during recap loses the SMASHED/TIME fact until the next run.
    push(room, bound.id, showPayload(room));
    if (room.show === 'reckoning' || room.show === 'vote' || room.show === 'execution') {
      push(room, bound.id, nomsPayload(room));
      push(room, bound.id, lynchPayload(room));
      // Same reason as the ready threshold below: a refreshed TV mid-Vote must not lose the
      // ballot count until the next ballot happens to land.
      push(room, bound.id, tallyPayload(room));
    }
    /*
     * ✋ **A PHONE THAT JOINS MID-TALK STILL NEEDS THE THRESHOLD.** `setShow` fans it on beat
     * entry, which covers everyone already in the room and nobody who arrives afterwards — and
     * "afterwards" includes every reconnect and every refresh, not just a latecomer. Without
     * this line that phone shows the READY copy and no READY button, which is the deadlock N21h
     * guards one door of. This is the other door. Gate: `party-night` N21i.
     */
    if (isReadyBeat(room.show)) {
      const rs = readyState(room);
      push(room, bound.id, { t: 'ready', count: rs.count, need: rs.need });
    }
    // Same door for the pairs. A reconnecting phone must come back to its own conversation, not
    // to a sheet that has forgotten it is in one.
    if (isLinkBeat(room.show)) {
      push(room, bound.id, { t: 'links', ...publicLinks(linksOf(room)) });
    }
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
        /*
         * 🚨 **ONE MALFORMED MESSAGE USED TO KILL THE WHOLE PROCESS — EVERY ROOM, EVERY PLAYER,
         * THE TELEVISION.** An adversarial playtester sent `{t:'whisper', text:{toString:'x'}}`
         * from an ordinary seated phone. `String(text)` on an object whose `toString` is not
         * callable throws `TypeError: Cannot convert object to primitive value`, nothing caught
         * it here, and node exited. They demonstrated it across rooms: a phone in one room
         * killed a game running in another. Six of ten crafted payloads did it, through
         * `whisper.text`, `link.to`, `link.accept`, `link.decline` and the pre-existing `name`.
         *
         * The JSON above is already untrusted input from a stranger's handset. Everything past
         * this line has to be treated the same way. A room that drops one bad message keeps
         * playing; a process that exits ends somebody's evening.
         */
        try {
          handleClient(room, bound, self, msg);
        } catch (e) {
          console.error(`[room ${room.code}] dropped a message from ${bound.id}: ${e?.message}`);
        }
      }
    });
    /*
     * ⚠️ **ONLY DELETE THE ENTRY IF IT IS STILL YOURS.** `room.conns.set(bound.id, …)` overwrites
     * on a token resume, so when the OLD socket then closes gracefully its handler deleted the
     * NEW one's entry — leaving a one-way zombie that can still send but receives nothing, looks
     * paired, and never sees a reply. Reproduced by resuming a token on a second socket and
     * closing the first; a duplicated tab does exactly that, because `sessionStorage` copies the
     * token. A hard destroy did not trigger it, which is why it survived.
     */
    const dropIfMine = () => {
      if (room.conns.get(bound.id)?.sock === sock) {
        room.conns.delete(bound.id);
        fanout(room, lobbySnapshot(room));
      }
    };
    sock.on('close', dropIfMine);
    sock.on('error', dropIfMine);
  });

  server.listen(port);
  return {
    server,
    rooms,
    close: () => {
      for (const room of rooms.values()) { clearShowClock(room); stopLinkClock(room); }
      return new Promise((r) => server.close(r));
    },
  };
}

/** Joined phone player ids. Empty deal slots are not seated. */
export function seatedPlayerIds(room) {
  const taken = room.seatsTaken || new Set();
  return room.game.sockets
    .filter((s) => !s.isTV && taken.has(s.id) && s.playerId)
    .map((s) => s.playerId);
}

/** Seated and still alive — the live lynching denominator, not the eight-chair deal. */
export function livingSeatedIds(room) {
  const seated = new Set(seatedPlayerIds(room));
  return room.game.state.players.filter((p) => p.alive && seated.has(p.id)).map((p) => p.id);
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
  if (msg.t === 'nominate' && self && !isTV && self.playerId) {
    applyNominate(room, self.playerId, msg.target);
    return;
  }
  /*
   * 🚨 **THE SERVER NEVER TOLD ANYONE THEIR VOTE LANDED, OR WHAT IT LANDED AS.**
   *
   * `castLynchVote` returns `{ok, choice, why}` and the result was thrown away. Three
   * consequences a play critic measured:
   *   · "Ballot in" was purely OPTIMISTIC local state, so a dropped message showed a confirmed
   *     ballot while the server held nothing.
   *   · A self-vote is silently coerced to NO ONE — correct, and completely invisible to the
   *     person who cast it. Her phone was byte-identical before and after.
   *   · Nobody could ever see what they had voted for.
   *
   * The receipt goes to ONE socket — the voter's. It is not a fanout: how the ballot is filling
   * is aired at Execution and must not leak before it.
   */
  if (msg.t === 'lynchVote' && self && !isTV && self.playerId) {
    if (room.show !== 'vote') return;
    const r = room.game.castLynchVote(self.playerId, msg.choice, livingSeatedIds(room)) || {};
    push(room, bound.id, {
      t: 'ballotOk',
      ok: r.ok !== false,
      choice: r.choice ?? msg.choice,
      ...(r.why ? { why: r.why } : {}),
    });
    // The count moves. The receipt above is the only message that names a choice.
    fanout(room, tallyPayload(room));
    return;
  }
  /*
   * 🚨 **THE DEAD DO NOT CHOOSE WHO GOES INTO THE MANSION.**
   *
   * This used `seatedPlayerIds`, which deliberately has NO alive filter — it is the occupancy
   * list, and `livingSeatedIds` is the one that means "still in the show". So an executed player
   * kept being served a casting sheet and kept casting a valid ballot. A play critic caught it
   * in episode 2 with a player evicted in episode 1: *"the dead help choose who goes into the
   * mansion."* They were correctly blocked from nominating and voting; casting was missed.
   *
   * Both ends of the ballot are filtered: the voter must be living, and so must the pair they
   * name — a ballot for a corpse is not a ballot either.
   */
  if (msg.t === 'ballot' && self && !isTV && self.playerId) {
    const seated = new Set(livingSeatedIds(room));
    if (!seated.has(self.playerId)) return;
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
      lookX: +msg.lookX || 0, lookY: +msg.lookY || 0,
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
    // Named, never spread — this is the boundary where the TV's report becomes room state, and
    // a spread would let a widened report add fields nobody entitled.
    room.game.setWorld({
      runner: msg.runner, hunter: msg.hunter, mission: msg.mission, view: msg.view,
    });
    endRunOnMission(room, msg.mission);
    return;
  }

  // ✋ One thumb. Phones only — the TV has no seat in the room and cannot vote to end a beat.
  if (msg.t === 'ready' && self && !isTV) {
    applyReady(room, self.playerId, msg.on !== false);
    return;
  }

  /*
   * 👏 Phones only — a television has no seat, and a broadcast truck that could boo the runner
   * is a camera crew with an opinion. Same reasoning as READY and the pair verbs above.
   */
  if (msg.t === 'react' && self && !isTV) {
    applyReact(room, self.playerId, msg.r);
    return;
  }

  /*
   * 🍮 PAIRING. Phones only, for the same reason as READY: the television holds no seat, and a
   * TV that could reach out to somebody would be a camera crew joining the conspiracy.
   */
  if (msg.t === 'link' && self && !isTV) {
    const me = self.playerId;
    if (msg.accept) applyLinkAccept(room, String(msg.accept), me);
    else if (msg.decline) applyLinkDecline(room, String(msg.decline), me);
    else if (msg.to) applyLinkRequest(room, me, String(msg.to));
    return;
  }
  if (msg.t === 'unlink' && self && !isTV) {
    applyUnlink(room, self.playerId);
    return;
  }
  // ✅ 'We are finished' — takes both, and is not the same verb as walking out. See finishPair.
  if (msg.t === 'finish' && self && !isTV) {
    applyFinish(room, self.playerId, msg.on !== false);
    return;
  }
  /*
   * 🔒 THE WORDS. Two sockets, addressed by id. Not a fanout with a filter — a different verb.
   * An unlinked socket shouting `whisper` reaches nobody: `whisperAudience` returns [] and the
   * loop below never runs. That is the fail-CLOSED direction, and it is the one that matters.
   */
  if (msg.t === 'whisper' && self && !isTV) {
    applyWhisper(room, self.playerId, msg.text);
    return;
  }

  /*
   * ⚠️ **isTV, AND IT WAS MISSING.** This branch is the host's 'Watch the run' workaround and
   * the gates' pacing seam, and it had no sender check — so ANY seated phone could send
   *  and drive the whole room's night. An adversarial playtester did
   * exactly that and wiped two live pairs mid-conversation, repeatably.  and 
   * already carried this guard; this one did not.
   */
  if (msg.t === 'show' && isTV && typeof msg.beat === 'string') {
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
    enterNextCasting(room);
  }
  if (msg.t === 'episode') {
    // Empty ballots never invent a pair, including at capacity (unused===0 / N=8).
    // playEpisode() with the ballots key omitted still synthesizes for gates/sim.
    const votes = validCastBallots(room);
    if (!votes.length) return;
    runEpisodeFromBallots(room, votes, msg.opts || {});
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
