#!/usr/bin/env node
/**
 * 🔒 **party-isolation — NO SOCKET EVER RECEIVES WHAT ITS PLAYER IS NOT ENTITLED TO.**
 *
 *   node harness/party-isolation.mjs            the shipped arm plus all six controls
 *   LEAK=5 node harness/party-isolation.mjs     one injected leak, for diagnosis
 *
 * Tier 0, and the only gate in `docs/design/rrr-gates.md` for which a red result blocks a merge
 * outright. **A phone that receives another player's role is a product-ending bug**, and it is
 * the one bug where a single missed field on a single frame in a single phase ends the game —
 * silently, in someone's lounge, with nothing thrown and nobody the wiser until the Reunion.
 * Every other gate here can be added late. This one cannot.
 *
 * `net/server.mjs` L18-19 already refuses to replicate `StageHealth` *"because it would leak how
 * close a wall is to opening"*. This is that discipline, made total and made mechanical.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 THE GATE SHARES THE TABLE AND NOT THE PROJECTION.
 * ---------------------------------------------------------------------------------------------
 * It reads `MATRIX`/`audienceFor` from `net/party/entitle.js` and walks the OBSERVED transcripts
 * with its own walker. If it reused `project()`, a bug in the filter would pass its own gate —
 * which is how sixteen instruments on this project produced result-shaped output instead of an
 * error (`_limb1-rule.mjs` L27-34). It asserts against what a socket ACTUALLY GOT, never
 * against what the server meant to send.
 *
 * ⚠️ I2 AND I3 ARE A PAIR AND NEITHER IS SUFFICIENT. `you.role` has a row and its audience is
 * `self`, so a frame that puts SOMEBODY ELSE'S role under `you.role` satisfies I2 completely —
 * right key, wrong value. That is control 1, and it is I3's job. I2 catches a wrong key; I3
 * catches the right key carrying a wrong value.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 I3b WAS CIRCULAR, AND THE FIELD IT WAS TRUSTED WITH CARRIED THE GLITCHED TO EVERY PHONE.
 * ---------------------------------------------------------------------------------------------
 * I3 steps over `players[].claim` on purpose — a published nameplate IS a role name in public,
 * and that is pillar P9 working rather than a leak. The whole weight of that exemption rested on
 * I3b, whose name promises *"every claim on the wire was published by its owner"*. It did not
 * test that. It accepted a claim as published if the log held a PUBLIC `player.claim_set` for it
 * — an event the SERVER manufactured itself, in the same loop that wrote the value. The server
 * published the claim, then cited its own publication as proof the owner had published it, and
 * this gate reported 20 passed / 0 failed including all four of its blindness controls.
 *
 * What got through: `room.js` `playEpisode` wrote `seat.cover ?? 'contestant'` onto every living
 * player, and `cast.js` sets `cover` on the Glitched and on nobody else. So every phone received
 * a column of `contestant` with exactly one informing role name in it, and that name was the
 * Glitched — on every live episode, and on every single game at five and six players. Found by
 * John against the real `scaffold: false` path, 2026-08-28.
 *
 * The fix here is the one that generalises: **provenance is asserted against the DRIVER'S record
 * of what it published, never against the server's record of what it did.** This file drives the
 * room and there is no claim verb to drive (`roles.js` L82 — the Method Actor's nameplate is the
 * one that is coming), so the set of owner-published claims is empty BY CONSTRUCTION and any
 * claim on any wire is a leak. When that verb lands, the driver that calls it fills `published`
 * and I3b keeps meaning what it says.
 *
 * I3c replays John's reproduction as a live-night room — `scaffold: false`, six players, his
 * three seeds — and asserts the shape of the bug rather than its cause: a claim column that
 * reads differently for one player than for the rest has fingerprinted somebody.
 */

import { readFileSync } from 'node:fs';
import { createRoom } from '../src/party/room.js';
import { audienceFor, entitled } from '../net/party/entitle.js';
import { liveRunShot } from '../src/party/follow.js';

const SEEDS = [11, 12, 13, 14, 15];
const COUNT = 8;

/**
 * 🚨 **THE REPRODUCTION RIG — SMALL, AND `scaffold: false`, WHICH IS THE HALF THAT MATTERED.**
 *
 * John's own reproduction, kept verbatim. Six players because `GUARANTEED[6]` contains `glitched`
 * so the fingerprint is present every game, and `scaffold: false` because that is the flag a LIVE
 * night passes — the leak sat outside the `if (scaffold)` block and the eight-player gate rig
 * above would have caught it either way, but only this rig proves the live path is clean.
 */
const LIVE_SEEDS = [5, 17, 42];
const LIVE_COUNT = 6;

// ---------------------------------------------------------------- the gate's own walker
/** Leaf key paths, arrays normalised to `[]`. Independent of `project()` by design. */
function paths(node, prefix = '', out = []) {
  if (node === null || typeof node !== 'object') { out.push(prefix); return out; }
  if (Array.isArray(node)) {
    if (!node.length) { out.push(prefix + '[]'); return out; }
    for (const v of node) paths(v, prefix + '[]', out);
    return out;
  }
  const ks = Object.keys(node);
  if (!ks.length) { out.push(prefix); return out; }
  for (const k of ks) paths(node[k], prefix ? `${prefix}.${k}` : k, out);
  return out;
}
/** Every leaf VALUE with its path. */
function* leaves(node, prefix = '') {
  if (node === null || typeof node !== 'object') { yield [prefix, node]; return; }
  if (Array.isArray(node)) { for (let i = 0; i < node.length; i++) yield* leaves(node[i], `${prefix}[${i}]`); return; }
  for (const k of Object.keys(node)) yield* leaves(node[k], prefix ? `${prefix}.${k}` : k);
}

/**
 * 🚨 **`published` IS THE DRIVER'S RECORD, AND IT IS WHAT MAKES I3b NON-CIRCULAR.**
 *
 * `${playerId}:${claim}` for every claim THIS FILE asked an owner's phone to publish. It is empty
 * because there is no claim verb to call yet (see the header) — so it is not a stub, it is the
 * true answer to "what did anybody publish tonight": nothing. The day `roles.js` L82's nameplate
 * grows a room method, the driver that calls it adds its pair here and I3b goes on meaning what
 * its name says. What it must NEVER be is derived from the room's own log.
 */
function drive(room) {
  return new Set();
}

/** Run every game for one leak setting and return the captured transcripts plus ground truth. */
function capture(leak) {
  const runs = [];
  for (const seed of SEEDS) {
    const tape = new Map();
    const room = createRoom({
      count: COUNT, castSeed: seed, worldSeed: seed * 3,
      send: (id, f) => { if (!tape.has(id)) tape.set(id, []); tape.get(id).push(f); },
      leak,
    });
    room.start();
    const published = drive(room);
    room.playEpisode({ hunterRoom: 'cellar' });
    // Episode two takes the runner, so I7 has a death to assert about.
    room.playEpisode({ hunterRoom: 'gallery', takeRunner: true });
    runs.push({
      seed, tape, truth: room.truth(), log: room.log.all(), published,
      unrowed: room.unrowed(), sockets: room.sockets.map((s) => ({ ...s })),
    });
  }
  return runs;
}

/** The live-night rig. Same shape as `capture`, one episode, no scaffold. See `LIVE_SEEDS`. */
function captureLive(leak) {
  const runs = [];
  for (const seed of LIVE_SEEDS) {
    const tape = new Map();
    const room = createRoom({
      count: LIVE_COUNT, castSeed: seed, worldSeed: seed * 3,
      send: (id, f) => { if (!tape.has(id)) tape.set(id, []); tape.get(id).push(f); },
      leak,
    });
    room.start();
    const published = drive(room);
    room.playEpisode({ hunterRoom: 'cellar', scaffold: false });
    runs.push({
      seed, tape, truth: room.truth(), log: room.log.all(), published,
      unrowed: room.unrowed(), sockets: room.sockets.map((s) => ({ ...s })),
    });
  }
  return runs;
}

/**
 * 🔒 **I3b + I3c — THE CLAIM CHANNEL, ASSERTED AGAINST THE DRIVER AND NOT AGAINST THE SERVER.**
 *
 * The old I3b asked the room's own log whether the room had published a claim, which is the
 * server vouching for itself (see this file's header). Both checks below take their authority
 * from `run.published` — what THIS FILE asked an owner to publish — so a value the server
 * invented has nowhere to hide.
 *
 * I3b · PROVENANCE, on both rigs and on both channels. A `players[].claim` on any frame, and a
 *       `player.claim_set` in any log, must name a pair the driver published. Zero were, so any
 *       claim at all is a leak — which is exactly right until a phone can publish one.
 *
 * I3c · THE FINGERPRINT, on the live rig only, and it is the reproduction rather than the cause.
 *       Claims the driver did not publish are the server's own writing, and the server writes
 *       from the deal. So if that column reads differently for one player than for the others,
 *       the difference came out of ground truth and the column has named somebody — which is
 *       precisely what `seat.cover ?? 'contestant'` did to the Glitched. Stated against the
 *       Glitched by name because that is the seat the shipped bug named, and armed on ground
 *       truth so a rig that stopped dealing one cannot pass by being vacuous.
 */
function claimSuite(all, live, ok, d) {
  for (const run of all) {
    for (const e of run.log) {
      if (e.type !== 'player.claim_set') continue;
      if (!run.published.has(`${e.data.id}:${e.data.claim}`)) {
        ok.I3b = false;
        d.I3b = d.I3b || `seed ${run.seed} · log · ${e.data.id}'s claim "${e.data.claim}" was published by the SERVER, not by its owner`;
      }
    }
    for (const sock of run.sockets) {
      const frames = run.tape.get(sock.id) || [];
      for (let fi = 0; fi < frames.length; fi++) {
        for (const pl of (frames[fi].players || [])) {
          if (pl.claim == null) continue;
          if (!run.published.has(`${pl.id}:${pl.claim}`)) {
            ok.I3b = false;
            d.I3b = d.I3b || `${sock.id} · frame ${fi} · ${pl.id}'s claim "${pl.claim}" was published by nobody — no owner ever said it`;
          }
        }
      }
    }
  }

  for (const run of live) {
    const g = run.truth.seats.find((s) => s.role === 'glitched');
    if (!g) {
      ok.I3c = false;
      d.I3c = d.I3c || `seed ${run.seed} · no Glitched was dealt — the reproduction rig is vacuous, not clean`;
      continue;
    }
    for (const sock of run.sockets) {
      if (sock.isTV) continue;
      const frames = run.tape.get(sock.id) || [];
      for (let fi = 0; fi < frames.length; fi++) {
        // Only the rows nobody published — a real published nameplate is allowed to differ.
        const col = (frames[fi].players || []).filter((p) => !run.published.has(`${p.id}:${p.claim}`));
        const theirs = col.find((p) => p.id === g.id);
        if (!theirs) continue;
        const odd = col.find((p) => p.id !== g.id && (p.claim ?? null) !== (theirs.claim ?? null));
        if (odd) {
          ok.I3c = false;
          d.I3c = d.I3c || `${sock.id} · seed ${run.seed} · frame ${fi} · ${g.id} (the Glitched) reads "${theirs.claim}" where ${odd.id} reads "${odd.claim}" — the claim column fingerprints the deal`;
        }
      }
    }
  }
}

/**
 * The assertion suite, as named booleans, so I9 can run it against a leaked room and require
 * that EXACTLY the named set flips.
 * Returns `{ I1, I1c, I2, I3, I3b, I3c, I4, I4b, I5, I6, I7, I8, detail }`.
 */
function suite(runs, live = []) {
  const d = {};
  const ok = { I1: true, I1c: true, I2: true, I3: true, I3b: true, I3c: true, I4: true, I4b: true, I5: true, I6: true, I7: true, I8: true };

  claimSuite([...runs, ...live], live, ok, d);
  for (const run of [...runs, ...live]) {
    for (const p of run.unrowed) {
      ok.I1c = false;
      d.I1c = d.I1c || `seed ${run.seed} · the room built "${p}" and the matrix dropped it in silence`;
    }
  }

  for (const run of runs) {
    const seatOf = new Map(run.truth.seats.map((s) => [s.id, s]));
    // A role name is usable as a fingerprint only if exactly one player holds it.
    const roleCount = {};
    for (const s of run.truth.seats) roleCount[s.role] = (roleCount[s.role] || 0) + 1;
    const uniqueRole = (r) => roleCount[r] === 1;

    for (const sock of run.sockets) {
      const frames = run.tape.get(sock.id) || [];
      const ctx = { playerId: sock.playerId, alignment: sock.alignment, isTV: sock.isTV, seatRole: sock.seatRole, ownerId: sock.playerId };
      const mine = sock.isTV ? null : seatOf.get(sock.playerId);
      const teammates = mine && mine.alignment === 'evil'
        ? run.truth.seats.filter((s) => s.alignment === 'evil' && s.id !== mine.id) : [];

      for (let fi = 0; fi < frames.length; fi++) {
        const f = frames[fi];

        // ---- I1 closed schema
        for (const p of paths(f)) {
          if (audienceFor(p) === null) {
            ok.I1 = false; d.I1 = d.I1 || `${sock.id} · frame ${fi} · ${p} · matrix has no row`;
          }
        }
        // ---- I2 the matrix holds
        for (const p of paths(f)) {
          const aud = audienceFor(p);
          // seatRole varies by phase; recompute from the frame's own pair, not the final state.
          const live = { ...ctx, seatRole: f.pair && f.pair.runner === sock.playerId ? 'runner'
            : f.pair && f.pair.guide === sock.playerId ? 'guide' : null };
          if (aud !== null && !entitled(aud, live)) {
            ok.I2 = false; d.I2 = d.I2 || `${sock.id} · frame ${fi} · ${p} · audience ${aud}`;
          }
        }
        // ---- I3 the semantic sweep: right key, wrong value
        for (const [p, v] of leaves(f)) {
          if (typeof v !== 'string') continue;
          // ⚠️ THE GLITCHED'S COVER IS A DELIBERATE DECEPTION, NOT A LEAK. Their own phone shows
          // a role ground truth assigns to somebody else, on purpose and by design (see
          // cast.js). Exempt it for THAT socket only — every other socket carrying it is still
          // a leak, and `p` must still be the holder's own `you.role`.
          if (mine && mine.cover && v === mine.cover && p.startsWith('you.role')) continue;
          // ⚠️ A PUBLISHED CLAIM IS A ROLE NAME ON A PUBLIC NAMEPLATE, AND THAT IS PILLAR P9
          // WORKING RATHER THAN A LEAK. The exemption is scoped to the `claim` field alone, and
          // `claimSuite`'s I3b is what stops it becoming a hole: every claim a socket sees must
          // be one THE DRIVER PUBLISHED, so a claim can never be inferred from ground truth.
          //
          // ⚠️ THIS `continue` IS WHY THE 2026-08-28 LEAK LIVED. The sweep stepped over the exact
          // field the server was writing covers into, trusting an I3b that vouched for the server
          // with the server's own event. The exemption is still correct — a nameplate is public —
          // and it is now backed by a check that takes its authority from outside the room.
          if (p.endsWith('.claim')) continue;
          for (const other of run.truth.seats) {
            if (mine && other.id === mine.id) continue;
            if (teammates.some((tm) => tm.id === other.id)) continue;   // I6's one exception
            if (v === other.role && uniqueRole(other.role) && (!mine || other.role !== mine.role)) {
              ok.I3 = false; d.I3 = d.I3 || `${sock.id} · frame ${fi} · ${p} = "${v}" is ${other.id}'s role`;
            }
          }
          if (v === 'evil' && (!mine || mine.alignment !== 'evil')) {
            ok.I3 = false; d.I3 = d.I3 || `${sock.id} · frame ${fi} · ${p} = "evil" on a good socket`;
          }
        }
        // ---- I3b / I3c live in `claimSuite`, because the claim channel is TWO channels — the
        // frame field and the PUBLIC event the Reunion reads — and a check that only walked
        // frames would leave `player.claim_set` unwatched.

        // ---- I4b players[] is in seat order, on every socket
        if (Array.isArray(f.players)) {
          const seats = f.players.map((p) => p.seat);
          if (seats.some((s, i) => s !== i)) {
            ok.I4b = false; d.I4b = d.I4b || `${sock.id} · frame ${fi} · players[] order ${seats.join(',')} is not seat order`;
          }
        }
        // ---- I8 the guide's map is for one phone
        if (f.flyover && sock.isTV) { ok.I8 = false; d.I8 = d.I8 || `TV received flyover at frame ${fi}`; }
      }
    }

    // ---- I4 shape parity across equally-entitled sockets
    // `you.*` is self-audience by design and legitimately differs; strip it, then sockets with
    // the same entitlement must be BYTE-IDENTICAL. This is the assertion that catches the leaks
    // nobody writes deliberately — an evil-only array whose length shows, a nullable present on
    // one phone and absent on another.
    //
    // ⚠️ THE BUCKET IS PER FRAME, NOT PER SOCKET, AND THE FIRST DRAFT GOT THIS WRONG. Grouping
    // by the socket's FINAL `seatRole` put the episode's guide in the same bucket as six seated
    // phones, so the guide's legitimate flyover read as a parity failure — I4 went red on a
    // clean tree and stayed red under every control, which made all four of I9's controls
    // unreadable. Entitlement is a property of a moment.
    const strip = (f) => { const { you, ...rest } = f; return JSON.stringify(rest); };
    const roleAt = (f, pid) => (f.pair && f.pair.runner === pid) ? 'runner'
      : (f.pair && f.pair.guide === pid) ? 'guide' : 'seated';
    const phones = run.sockets.filter((s) => !s.isTV);
    const nFrames = Math.max(...phones.map((s) => (run.tape.get(s.id) || []).length));
    for (const sock of phones) {
      const n = (run.tape.get(sock.id) || []).length;
      if (n !== nFrames) { ok.I5 = false; d.I5 = d.I5 || `${sock.id} got ${n} frames, peers got ${nFrames}`; }
    }
    for (let i = 0; i < nFrames; i++) {
      const buckets = new Map();
      for (const sock of phones) {
        const f = (run.tape.get(sock.id) || [])[i];
        if (!f) continue;
        const key = `${seatOf.get(sock.playerId).alignment}/${roleAt(f, sock.playerId)}`;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push([sock, f]);
      }
      for (const [key, members] of buckets) {
        if (members.length < 2) continue;
        const ref = strip(members[0][1]);
        for (const [sock, f] of members.slice(1)) {
          if (strip(f) !== ref) {
            ok.I4 = false;
            d.I4 = d.I4 || `${key} frame ${i}: ${sock.id} != ${members[0][0].id}`;
          }
        }
      }
    }

    // ---- I7 death reveals nothing
    // Two properties, and the second is the one people forget: the dead player's alignment must
    // not appear (P6), AND a survivor's frames must not CHANGE SHAPE across the take. A frame
    // that grows a field the moment somebody dies has announced something about them.
    {
      const takenAt = (() => {
        for (const sock of run.sockets) {
          const fr = run.tape.get(sock.id) || [];
          for (let i = 0; i < fr.length; i++) if ((fr[i].players || []).some((p) => p.alive === false)) return i;
        }
        return -1;
      })();
      if (takenAt < 0) { ok.I7 = false; d.I7 = d.I7 || 'no take occurred — I7 cannot be evaluated'; }
      else {
        const deadIds = new Set();
        for (const sock of run.sockets) {
          for (const f of (run.tape.get(sock.id) || [])) for (const p of (f.players || [])) if (p.alive === false) deadIds.add(p.id);
        }
        for (const id of deadIds) {
          const seat = seatOf.get(id);
          for (const sock of run.sockets) {
            if (sock.playerId === id) continue;                       // their own phone knows their own role
            const mine = sock.isTV ? null : seatOf.get(sock.playerId);
            const isTeammate = mine && mine.alignment === 'evil' && seat.alignment === 'evil';
            const fr = run.tape.get(sock.id) || [];
            for (let i = takenAt; i < fr.length; i++) {
              // ⚠️ SCAN EVERYTHING EXCEPT THE SOCKET'S OWN `you.role`. A Glitched holder's cover
              // can legitimately be the role a taken player held (see cast.js), and that is a
              // deception rather than a reveal. Stripping it here is safe because I3 still
              // polices `you.role` on every socket — leak 1 puts a foreign role there and I3
              // catches it — so nothing goes unwatched, it is only watched by the right check.
              const scan = { ...fr[i] };
              if (scan.you) scan.you = { ...scan.you, role: undefined };
              // Claims are public by design — see I3's note. Strip them here for the same reason.
              if (Array.isArray(scan.players)) scan.players = scan.players.map((p) => ({ ...p, claim: undefined }));
              const blob = JSON.stringify(scan);
              if (blob.includes(`"${seat.alignment}"`) && !(mine && mine.alignment === seat.alignment)) {
                ok.I7 = false; d.I7 = d.I7 || `${sock.id} frame ${i} carries the taken player's alignment`;
              }
              if (!isTeammate && roleCount[seat.role] === 1 && blob.includes(`"${seat.role}"`) && (!mine || mine.role !== seat.role)) {
                ok.I7 = false; d.I7 = d.I7 || `${sock.id} frame ${i} carries taken ${id}'s role "${seat.role}"`;
              }
            }
          }
        }
        // shape parity across the take, per socket
        const shape = (f) => { const { you, ...rest } = f; return paths(rest).sort().join('|'); };
        for (const sock of run.sockets) {
          const fr = run.tape.get(sock.id) || [];
          const before = new Set(fr.slice(0, takenAt).map(shape));
          for (let i = takenAt; i < fr.length; i++) {
            if (before.size && !before.has(shape(fr[i]))) {
              ok.I7 = false; d.I7 = d.I7 || `${sock.id} frame ${i} changed shape across the take`;
            }
          }
        }
      }
    }

    // ---- I6 the one exception is exactly one exception
    for (const sock of run.sockets) {
      if (sock.isTV) continue;
      const seat = seatOf.get(sock.playerId);
      const frames = run.tape.get(sock.id) || [];
      const sawTeam = frames.some((f) => f.you && Array.isArray(f.you.teammates));
      if (seat.alignment === 'evil' && !sawTeam) { ok.I6 = false; d.I6 = d.I6 || `${sock.id} is evil and never got teammates`; }
      if (seat.alignment !== 'evil' && sawTeam) { ok.I6 = false; d.I6 = d.I6 || `${sock.id} is good and got teammates`; }
      if (seat.alignment === 'evil') {
        for (const f of frames) {
          if (!f.you || !f.you.teammates) continue;
          const got = f.you.teammates.map((x) => x.id).sort().join(',');
          const want = run.truth.evil.filter((e) => e !== sock.playerId).sort().join(',');
          if (got !== want) { ok.I6 = false; d.I6 = d.I6 || `${sock.id} teammates [${got}] != truth [${want}]`; }
        }
      }
    }
  }
  return { ...ok, detail: d };
}

// ---------------------------------------------------------------- run
let pass = 0, fail = 0, skip = 0;
const t = (n, c, dd = '') => { if (c) { pass++; console.log(`  ok   ${n}${dd ? ' · ' + dd : ''}`); } else { fail++; console.log(`  FAIL ${n}${dd ? ' · ' + dd : ''}`); } return c; };
const skipped = (n, why) => { skip++; console.log(`  SKIP ${n} · ${why}`); };

const LEAK = +(process.env.LEAK || 0);
const runs = capture(LEAK);
const live = captureLive(LEAK);

// ---------------------------------------------------------------- I0 · the arm
{
  const r = runs[0];
  const nSock = r.sockets.length;
  const frames = [...r.tape.values()];
  const phases = new Set(frames[0].map((f) => f.phase));
  const enough = frames.every((a) => a.length >= 5);
  const armed = nSock === COUNT + 1 && r.truth.evil.length === 2 && phases.size >= 4 && enough;
  if (!armed) {
    skipped('I0 arm', `sockets=${nSock} evil=${r.truth.evil.length} phases=${[...phases].join('/')} — a room that never dealt a role trivially leaks no role`);
    console.log(`\nparty-isolation: ${pass} passed, ${fail} failed, ${skip} skipped (NOT ARMED)`);
    process.exit(1);
  }
  t('I0 arm · 9 sockets, roles dealt, every phase entered', true,
    `${nSock} sockets · ${r.truth.evil.length} evil · ${[...phases].join('/')} · ${frames[0].length} frames each`);
}

const R = suite(runs, live);
t('I1 · every key path on every frame has a matrix row', R.I1, R.detail.I1 || 'deny-by-default holds');
t('I1c · the matrix dropped nothing in silence — `unrowed` is empty on every room', R.I1c,
  R.detail.I1c
    || `${runs.length + live.length} rooms, no path built and then swallowed by deny-by-default`);
t('I1b · public cosmetics are rowed; hunter/deal/role on a player still have no row',
  audienceFor('players[].shell') === 'all'
    && audienceFor('players[].accent') === 'all'
    && audienceFor('players[].hunter') === null
    && audienceFor('players[].deal') === null
    && audienceFor('players[].role') === null
    && audienceFor('players[].alignment') === null,
  'a later secret field still fails I1');
/*
 * 🎥 **THE CAMERA THE SHOW IS ON IS THE RUNNER'S BUSINESS AND NOBODY ELSE'S.**
 *
 * I1/I2 already sweep every observed key path, but `you.view` only appears once a TV is actually
 * rendering a run and `playEpisode` never calls `setWorld` — so it would be rowed correctly and
 * never exercised. State the row directly, the same way I1b states the ones that must have none.
 *
 * `runner`, not `all`: it exists so the pad can match its labels to the live controls, and a
 * seated phone that knew the camera had been handed a fact about the house it did not earn.
 * `top`/`iso` also imply the roof is off, which is a spatial fact and the TV must never be told
 * anything it did not itself compute.
 */
t('I1c · the live camera is runner-audience — a seated phone and the TV are never told it',
  audienceFor('you.view') === 'runner'
    && entitled(audienceFor('you.view'), { seatRole: 'runner' })
    && !entitled(audienceFor('you.view'), { seatRole: 'guide' })
    && !entitled(audienceFor('you.view'), { seatRole: null }),
  'you.view · runner');
t('I2 · no key path reaches a socket its row does not entitle', R.I2, R.detail.I2 || `${SEEDS.length} seeds clean`);
t('I3 · semantic sweep — no ground-truth value in a non-entitled transcript', R.I3, R.detail.I3 || 'no foreign role or alignment observed');
t('I3b · every claim on the wire was published by its owner, never inferred', R.I3b,
  R.detail.I3b || 'no claim on either rig — the driver published none and neither did the server');
t('I3c · the live-night claim column fingerprints nobody (John\'s 5/17/42 reproduction)', R.I3c,
  R.detail.I3c || `${LIVE_SEEDS.length} live-night rooms at ${LIVE_COUNT}, the Glitched's row reads what every row reads`);
t('I4 · equally-entitled sockets are byte-identical (self-audience stripped)', R.I4, R.detail.I4 || 'shape parity holds');
t('I4b · players[] is in seat order, never alignment order', R.I4b, R.detail.I4b || 'ordering carries no signal');
t('I5 · identical frame counts across equally-entitled sockets', R.I5, R.detail.I5 || 'cardinality parity holds');
t('I6 · only evil sockets get teammates, and the set equals ground truth', R.I6, R.detail.I6 || 'the one exception is exactly one');
t('I7 · a take reveals nothing, and no survivor frame changes shape across it', R.I7,
  R.detail.I7 || 'alignment absent, role absent, shape unchanged');
t('I8 · the flyover reaches one phone and never the TV', R.I8, R.detail.I8 || 'party-loop.md "Do not" holds');

// ---- I10 · dual-stick TV chase does not punch a new hole in the matrix -----------------------
//
// The runner phone is a pad. It must not grow a mansion socket or a chase iframe. Look
// rides the existing move cue. Guide map / flyover stay where I8 put them.
{
  const phoneSrc = readFileSync(new URL('../src/views/party-phone.js', import.meta.url), 'utf8');
  t('I10 · a live run is chase-only — the operator lock is a follow-slot policy, not a new frame field',
    liveRunShot('run') === 'chase' && liveRunShot('warm') === null);
  t('I10a · the runner phone has no chase embed and still one party socket',
    !/warmUrl\(/.test(phoneSrc)
    && !/runner-chase-layer/.test(phoneSrc)
    && !/sendChaseCue/.test(phoneSrc)
    && /id="stick-look"/.test(phoneSrc)
    && (phoneSrc.match(/new PartyNightClient/g) || []).length === 1);
  t('I10b · the guide sheet still paints the map and never mounts a chase layer',
    /guideMapSvg\(/.test(phoneSrc)
    && /The map is yours/.test(phoneSrc)
    && /iAmGuide/.test(phoneSrc));
  t('I10c · flyover is still a guide-only matrix row — I8\'s rule did not move',
    audienceFor('flyover.jam') === 'guide'
    && audienceFor('flyover.marks[].kind') === 'guide'
    && audienceFor('flyover.marks[].x') === 'guide');
}

// ---------------------------------------------------------------- I9 · the controls
/**
 * 🚨 IF ANY CONTROL PASSES, THE GATE IS BLIND AND EXITS NON-ZERO. A filter that blocks
 * everything and a filter that blocks nothing look identical to a check that only ever runs the
 * shipped arm.
 *
 * ⚠️ THE EXPECTED SET IS NAMED PER CONTROL, NOT ASSUMED TO BE ONE, AND TWO CONTROLS TRIP TWO
 * ASSERTIONS BY DESIGN RATHER THAN BY DEFECT.
 *
 *   leak 1 -> I3 + I7. It broadcasts seat 0's role, and seat 0 is the runner episode two takes,
 *            so the same value is caught once by the general sweep and once by the post-death
 *            sweep. I7 IS a narrower I3 scoped to the dead; a leak about a dead player that
 *            tripped only one of them would mean the other had stopped working.
 *   leak 4 -> I2 + I8. The flyover ban is asserted twice on purpose — once as a matrix row whose
 *            audience is `guide`, once as its own named check — because `party-loop.md` puts it
 *            under *Do not* in its own words and `rrr-gates.md` §2 says of it *"also I8,
 *            asserted twice on purpose"*.
 *   leak 5 -> I3b + I3c. **THE SHIPPED BUG, PUT BACK.** It restores `playEpisode`'s
 *            `seat.cover ?? 'contestant'` loop verbatim, which is a leak the matrix cannot see:
 *            the key is rowed, the audience is `phones`, and every phone is a phone. Two names
 *            because the two checks are asking different questions — I3b that a claim had an
 *            author, I3c that the column names nobody — and a leak that reddened only one of
 *            them would mean the other had stopped working. **Under the old I3b this control
 *            went entirely green**, which is what it cost: the server's own `player.claim_set`
 *            was accepted as proof the owner had spoken.
 *   leak 6 -> I1c. The leak that never reaches a frame. `castSeed` has no row, so `project`
 *            deletes it and every transcript is byte-identical to a clean run — I1, which walks
 *            what a socket GOT, is structurally unable to see it. Only the room's `unrowed`
 *            record can, which is the whole argument for I1c existing.
 *
 * The gate is pinned to the EXACT set either way, so a control that goes broad — one leak
 * reddening five assertions because the suite has become noisy — still fails here.
 */
if (LEAK === 0) {
  const expect = { 1: ['I3', 'I7'], 2: ['I1'], 3: ['I4b'], 4: ['I2', 'I8'], 5: ['I3b', 'I3c'], 6: ['I1c'] };
  const names = ['I1', 'I1c', 'I2', 'I3', 'I3b', 'I3c', 'I4', 'I4b', 'I5', 'I6', 'I7', 'I8'];
  for (const n of [1, 2, 3, 4, 5, 6]) {
    const L = suite(capture(n), captureLive(n));
    const red = names.filter((k) => !L[k]);
    const want = expect[n];
    const okCtl = red.length === want.length && want.every((w) => red.includes(w));
    t(`I9.${n} control · leak ${n} turns exactly ${want.join('+')} red`, okCtl,
      red.length ? `red: ${red.join(', ')}` : 'NOTHING WENT RED — the gate is blind');
  }
}

console.log(`\nparty-isolation: ${pass} passed, ${fail} failed, ${skip} skipped`);
process.exit(fail ? 1 : 0);
