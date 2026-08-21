#!/usr/bin/env node
/**
 * 🤫 **party-private — HOW MUCH DOES ONE PHONE KNOW THAT THE PHONE NEXT TO IT DOES NOT?**
 *
 *   node harness/party-private.mjs
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 THIS GATE MEASURES A POVERTY, AND IT WAS COMMITTED **BEFORE** THE FIX THAT MOVES IT.
 * ---------------------------------------------------------------------------------------------
 * Every other gate in this suite asks whether a socket received something it should NOT have.
 * `party-isolation` is the whole of that question, made total and made mechanical, and it is
 * Tier 0 for good reason. **None of them asks the opposite question**, and the opposite question
 * is what the DEBRIEF is made of: *after forty minutes of play, what does any given player hold
 * that nobody else at the table holds?*
 *
 * Measured here, on the observed wire, over four complete games on both shipped servers:
 *
 *     a player receives ONE private log envelope in an entire game — their own role card —
 *     and a member of Production receives TWO: their card, and their Production Panel.
 *
 * Six of eight phones go five episodes on a single sentence dealt in episode one. The other ~150
 * envelopes on the wire are PUBLIC and byte-identical on every phone. The Debrief is eight people
 * reasoning about facts they all already share, and the only thing anyone can bring to it that
 * the table cannot is a memory of one card.
 *
 * That is a design finding, not a defect, and this file exists so that when it changes the change
 * is **evidence rather than an assertion**. The Continuity role is about to be made to fire an
 * automatic `SELF` reading each episode. When it lands `P2` goes red, and the number it prints on
 * its way down is the number that was true before the fix. **Do not pre-raise the band.**
 *
 * ---------------------------------------------------------------------------------------------
 * ⚠️ WHERE THE FINDING'S FIGURES LANDED, AND THE TWO PLACES THEY WERE WRONG
 * ---------------------------------------------------------------------------------------------
 * The critique that prompted this gate read *"126 log entries, 116 of them PUBLIC, and every
 * player receives exactly one private event in the whole game — their own role card. Across 31
 * phase-frames × 8 phones the only non-`you` difference anywhere is `call.said` on one phone."*
 * The shape reproduces exactly. Three corrections, all made by this instrument:
 *
 *   · **126/116 is the WIRE UNION, not `log.all()`.** A complete five-episode eight-player show
 *     writes ~183 entries, ~28 of them `SEALED`, which reach nobody at all. 126 = 116 PUBLIC + 8
 *     `role.card` + 2 `production.panel` is precisely the set that reached at least one phone —
 *     which is the right set to have counted, and is what `P1` counts. Only the episode count
 *     differs run to run.
 *   · **It is not "exactly one" for everybody.** The two Production members get a second private
 *     envelope: their own Panel, `VIS.EVIL` **and** addressed with `for`, so it reaches one phone
 *     rather than the faction (`log.js`'s `visibleTo` — *"the class says WHO MAY; `for` says
 *     WHO"*). The band is therefore `[1, 2]`, not `[1, 1]`, and `P2b` names how many players sit
 *     on the floor rather than letting "one each" stand as the summary.
 *   · **`call.said` is not the only non-`you` frame difference.** The guide's flyover is a whole
 *     private frame surface — `flyover.hunter`, `flyover.room`, `flyover.marks[]`, and the floor
 *     plan they are drawn on — rowed `guide` in the matrix and observed on 10-66 frames of a
 *     single game. `P3` states the correct sentence, which is narrower and sharper than the one it
 *     replaces: **every byte on a frame that one phone holds and the others do not belongs to
 *     whoever is currently the guide.** Nobody else, in any chair, at any moment, holds anything.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 WHAT IS MEASURED IS THE WIRE. NOT `log.all()`, NOT A MODEL OF THE MATRIX, NOT A HAND-BUILT
 * FRAME.
 * ---------------------------------------------------------------------------------------------
 * *"A model may stand in for something that does not exist yet. It may never stand in for
 * something that does"* — `wire-parity`'s header, and the rule this suite was rebuilt around after
 * four Fatal bugs survived a fully green run. Everything below is read off real WebSockets served
 * by the real servers in `net/party/`, after the real `project()` and the real `visibleTo()` have
 * run. The walkers are this file's own and share no code with the projection, for the reason
 * `entitle.js`'s header gives: a gate that reuses the filter to decide what should have arrived
 * learns nothing.
 *
 * **Two servers, because neither alone can answer the whole question.**
 *
 *   · `net/party/show.mjs` `startShow` → `createSession`. THE SHIPPED GAME: a premiere, five
 *     episodes, a Reunion, `call.said`, the floor plan. This is the game the finding is about and
 *     where the Continuity reading will land. It **cannot be seeded** — `randomSeed()` is four
 *     random bytes per show, deliberately, and `party-surface` W1/W2 is the gate that argues why
 *     (a derived seed named both traitors 80.4% of the time). So the show carries the census and
 *     the band, and `P4`'s determinism is asserted where a seed can honestly be set.
 *   · `net/party/local.mjs` `startServer` → `createRoom`, *"the smallest room that exercises every
 *     audience in the matrix"*. It takes `castSeed`/`worldSeed`, so `P4` lives here — and it is a
 *     second, independent producer of the same census.
 *
 * Both are real servers over real sockets. Running the census on both is not redundancy: a
 * property that holds on one room module and not the other is a finding about the module, and a
 * property that holds on both is a property of the design. `P5` is that claim, stated once.
 *
 * ---------------------------------------------------------------------------------------------
 * ⚠️ THE CONTROLS ARE RUNNING SERVERS BUILT OUT OF THE SHIPPED FILES
 * ---------------------------------------------------------------------------------------------
 * `mirror()` copies `net/party/entitle.js`, `src/party/room.js` and `net/party/local.mjs` into a
 * dot-prefixed tree that preserves their relative layout, applies a named list of text edits,
 * re-points only the imports that leave the copied set, and **imports and runs the result**. Every
 * control below is therefore the real projection and the real matrix, over real sockets, with one
 * stated thing different — never a string this file wrote about a server. That is
 * `party-surface`'s `controlOf()` idiom; the mirror form is needed here because the edits have to
 * reach `entitle.js`, which `room.js` imports and `local.mjs` reaches through it.
 *
 * Each control ships an ARM asserting its edits applied, because a control that silently fails to
 * apply proves nothing and reads green.
 *
 *   census control  `room.js` deals the card every episode instead of only in the premiere, AND
 *                   re-records `run.camera_lit` as a `SELF` reading addressed to that episode's
 *                   guide. That second edit is the shape of the Continuity fix — a per-episode
 *                   private reading, onto a phone that is not the same phone twice — so a census
 *                   that cannot see it will not see the fix either.
 *   frame control   the matrix rows `pair.runner` to `runner` instead of `all`. A non-`you` frame
 *                   difference then exists that does NOT belong to the guide, which is exactly the
 *                   claim `P3` makes, and it sits outside the two keys `P3b` allows.
 *   arm control     a real server, live, with nine real sockets on it, that was never told to
 *                   roll. Zero frames, zero envelopes — and `armed()` must say so.
 *
 * 🚨 **A SKIP IS NEVER A PASS.** `P0` exits non-zero on an empty capture. A census over a
 * transcript nobody filled is the most comfortable green in this repo, and it is the exact shape
 * that let five Fatal bugs through a suite that was entirely green: *"an assertion green because
 * it had nothing to check"*.
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { startShow, playerIdOf } from '../net/party/show.mjs';
import { startServer as shippedRoomServer } from '../net/party/local.mjs';
import { PHASE } from '../src/party/phases.js';
import { CALL, MOVE_CHOICE } from '../src/party/session.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

/**
 * 🚨 **THE BAND, AND WHAT ITS TWO ENDS ARE MADE OF.** `escape` E1's hard `4` passed for a year and
 * then failed on a generated house; a property that is a band gets a band.
 *
 *   FLOOR = 1   ONE `role.card`, `VIS.SELF`, `for` its holder, recorded once in episode one and
 *               never again. That is the entire private wire of a good player, all game.
 *   CEIL  = 2   the card, plus ONE `production.panel` for each member of Production — `VIS.EVIL`
 *               *and* addressed, so it reaches one phone and not the faction.
 *
 * ⚠️ **IF YOU ARE HERE BECAUSE `P2` WENT RED, THIS IS THE NUMBER YOU ARE REPLACING.** Raise the
 * CEILING only, and only by the number of readings the new role actually fires: the Continuity
 * reading, once an episode under a five-episode cap, takes ITS HOLDER to 1 + 5 = 6 (7 if that
 * holder is also in Production) and leaves everybody else exactly where they are. A change that
 * moves the FLOOR is a change that gave every player something, which is a different and much
 * larger claim — say so in the commit body and put the measured number in it.
 */
const BAND = { floor: 1, ceil: 2 };

/** The only kinds of private envelope the shipped game has ever put on a wire. `P1b` owns this. */
const SHIPPED_KINDS = ['production.panel', 'role.card'];

/** The top-level frame keys under which a non-`you` per-phone difference is legitimate. `P3b`. */
const GUIDE_KEYS = ['call', 'flyover'];

/**
 * ⚠️ NINE FIXED PORTS, AND `harness/gates.mjs`'s HEADER IS WHERE THE SUITE'S ALLOCATION LIVES.
 * Nothing else in the suite binds 5271-5279. Two people running the suite on the same box still
 * collide — that is the price of hardcoded ports, and it is stated there rather than here.
 */
const PORT = {
  show8: 5271, show6: 5272, roomA: 5273, roomA2: 5274, roomB: 5275, room5: 5276,
  ctlCensus: 5277, ctlFrame: 5278, dead: 5279,
};
const SEED_A = 41;
const SEED_B = 77;

let pass = 0, fail = 0, skip = 0;
const t = (n, c, d = '') => {
  if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); }
  else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); }
  return c;
};
const skipped = (n, why) => { skip++; console.log(`  SKIP ${n} · ${why}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// =============================================================================================
// the control mirror
// =============================================================================================
const MIRRORED = ['net/party/entitle.js', 'src/party/room.js', 'net/party/local.mjs'];
/**
 * A runnable copy of the three shipped files that make up the seeded server, with `edits` applied.
 * The layout is preserved so `local.mjs` → `room.js` → `entitle.js` still resolve to the COPIES;
 * every other relative import is re-pointed at the real tree, so nothing else about the files
 * changes. `missed` is non-empty when an edit did not apply, and each control arms on it.
 */
function mirror(name, edits) {
  const dir = join(HERE, `.private-ctl-${name}`);
  rmSync(dir, { recursive: true, force: true });
  const inside = new Set(MIRRORED.map((f) => join(ROOT, f)));
  const missed = [];
  let changed = 0;
  for (const rel of MIRRORED) {
    const from = join(ROOT, rel);
    const original = readFileSync(from, 'utf8');
    let src = original;
    for (const [a, b] of (edits[rel] || [])) {
      if (!src.includes(a)) missed.push(`${rel}: ${a.trim().slice(0, 48)}`);
      else src = src.split(a).join(b);
    }
    if (src !== original) changed += 1;
    src = src.replace(/(\bfrom\s+')(\.[^']*)(')/g, (m, pre, spec, post) => {
      const abs = resolvePath(dirname(from), spec);
      return inside.has(abs) ? m : pre + pathToFileURL(abs).href + post;
    });
    const to = join(dir, rel);
    mkdirSync(dirname(to), { recursive: true });
    writeFileSync(to, src);
  }
  return {
    name, dir, missed, applied: missed.length === 0 && changed > 0,
    load: () => import(pathToFileURL(join(dir, 'net/party/local.mjs')).href),
    rm: () => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* already gone */ } },
  };
}

// =============================================================================================
// sockets
// =============================================================================================
function open(port, query = '') {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/${query}`);
    const msgs = [];
    const box = {
      ws, msgs, welcome: null,
      send: (o) => { try { ws.send(JSON.stringify(o)); } catch { /* closed */ } },
      act: (msg) => box.send({ t: 'act', msg }),
      frames: () => msgs.filter((m) => m.t === 'state').map((m) => m.frame),
      events: () => msgs.filter((m) => m.t === 'event').map((m) => m.ev),
      close: () => { try { ws.close(); } catch { /* gone */ } },
    };
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      msgs.push(m);
      if (m.t === 'ping') box.send({ t: 'pong', at: m.at });
      if (m.t === 'welcome' || m.t === 'full') { box.welcome = m; resolve(box); }
    };
    ws.onopen = () => resolve(box);
    ws.onerror = () => resolve(box);
    setTimeout(() => resolve(box), 1500);
  });
}

// =============================================================================================
// the captures — real servers, real sockets, whole games
// =============================================================================================
/**
 * A complete show on `net/party/show.mjs`, driven the way `show-wire` drives one: everybody taps
 * sensibly and the host skips the clock, because a premiere is 150 real seconds and the skip runs
 * the same `advance()` a deadline does.
 *
 * ⚠️ THE RUNNER WAITS EVERY EPISODE, AND THAT IS A CHOICE ABOUT LENGTH RATHER THAN ABOUT PLAY.
 * A surviving expedition lights a camera and four lit cameras end the season at episode four.
 * Waiting keeps the objective unmet, so every capture runs to the FULL five-episode cap — the
 * longest game the format can produce and therefore the most private traffic it can carry. Nobody
 * is nominated and everybody abstains, so no seat is lost and the census is over the whole table
 * at the count it says.
 */
async function captureShow(port, code, count) {
  const show = startShow({ port, code, stamp: 1700000000000 });
  await sleep(140);
  const tv = await open(port, '?role=tv');
  await sleep(60);
  const phones = [];
  for (let i = 0; i < count; i++) {
    const p = await open(port);
    p.send({ t: 'join', name: `Robot ${i + 1}`, token: null, boot: 900 + i });
    phones.push(p);
  }
  await sleep(220);
  tv.send({ t: 'start' });
  await sleep(200);

  const step = async () => {
    const s = show.sessionNow();
    if (!s) return;
    const st = s.state;
    const alive = st.players.filter((p) => p.alive).map((p) => p.seat);
    if (st.phase === PHASE.PREMIERE) phones[alive[0]].act({ t: 'claim', claim: 'camera op' });
    if (st.phase === PHASE.CASTING) {
      for (const seat of alive) {
        const i = alive.indexOf(seat);
        phones[seat].act({
          t: 'cast',
          runner: playerIdOf(alive[(i + 1) % alive.length]),
          guide: playerIdOf(alive[(i + 2) % alive.length]),
        });
      }
    }
    if (st.phase === PHASE.EXPEDITION && st.pair.guide && st.pair.runner) {
      const g = Number(st.pair.guide.slice(1)) - 1, r = Number(st.pair.runner.slice(1)) - 1;
      phones[g].act({ t: 'call', call: CALL.CLEAR });
      await sleep(55);
      phones[r].act({ t: 'move', move: MOVE_CHOICE.WAIT });
    }
    if (st.phase === PHASE.VOTE) for (const seat of alive) phones[seat].act({ t: 'vote', choice: 'NO_ONE' });
    await sleep(60);
    tv.send({ t: 'skip' });
    await sleep(60);
  };

  for (let i = 0; i < 80 && show.sessionNow() && show.sessionNow().state.phase !== PHASE.REUNION; i++) await step();
  await sleep(220);

  const sess = show.sessionNow();
  const truth = sess ? sess.truth() : { seats: [], evil: [] };
  const cap = {
    label: `show/${count}`,
    phones: phones.map((p, i) => ({ id: `phone-${i}`, playerId: playerIdOf(i), frames: p.frames(), events: p.events() })),
    tv: { frames: tv.frames(), events: tv.events() },
    production: truth.evil.length,
    episodes: sess ? sess.state.episode - 1 : 0,
    outcome: sess ? sess.state.outcome : null,
    done: !!sess && sess.state.phase === PHASE.REUNION,
  };
  for (const p of phones) p.close();
  tv.close();
  try { show.close(); } catch { /* the server holds live handles */ }
  return cap;
}

/**
 * Five episodes on a seeded `net/party/local.mjs` server. `mod` is the shipped module or a mirror.
 *
 * ⚠️ A DISTINCT `room=` CODE PER CAPTURE, ALWAYS. `getRoom` caches by code in module scope and
 * ignores the options of every call after the first, so two captures sharing a code would be one
 * game measured twice under two seeds' names — and `P4` would be a determinism assertion that
 * could not fail.
 */
async function captureRoom(mod, port, code, count, seed) {
  const srv = mod.startServer({ port, count, castSeed: seed, worldSeed: seed * 3, code });
  await sleep(140);
  const conns = [];
  for (let i = 0; i < count + 1; i++) conns.push(await open(port, `?room=${code}`));
  await sleep(140);
  conns[0].send({ t: 'start' });
  await sleep(70);
  for (let ep = 0; ep < 5; ep++) { conns[0].send({ t: 'episode', opts: {} }); await sleep(90); }
  await sleep(220);

  const room = srv.rooms.get(code);
  const truth = room ? room.game.truth() : { seats: [], evil: [] };
  const seatOf = new Map((room ? room.game.sockets : []).map((s) => [s.id, s.playerId]));
  const cap = {
    label: `room/${count}@${seed}`,
    phones: conns
      .filter((c) => c.welcome && c.welcome.t === 'welcome' && c.welcome.id !== 'tv')
      .map((c) => ({ id: c.welcome.id, playerId: seatOf.get(c.welcome.id), frames: c.frames(), events: c.events() }))
      .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })),
    tv: (() => { const c = conns.find((x) => x.welcome && x.welcome.id === 'tv'); return { frames: c ? c.frames() : [], events: c ? c.events() : [] }; })(),
    production: truth.evil.length,
    episodes: room ? room.game.state.episode - 1 : 0,
    outcome: room ? room.game.state.outcome : null,
    done: !!room && room.game.state.episode > 5,
  };
  for (const c of conns) c.close();
  try { srv.close(); } catch { /* the server holds live handles */ }
  return cap;
}

// =============================================================================================
// the gate's own walkers — no `project()`, no `keyPaths()`, no `log.all()`
// =============================================================================================
/** Every leaf path/value pair. Array indices are kept, so a per-seat difference is locatable. */
function leaves(node, prefix = '', out = []) {
  if (node === null || typeof node !== 'object') { out.push([prefix, JSON.stringify(node)]); return out; }
  if (Array.isArray(node)) {
    if (!node.length) { out.push([`${prefix}[]`, '[]']); return out; }
    node.forEach((v, i) => leaves(v, `${prefix}[${i}]`, out));
    return out;
  }
  const ks = Object.keys(node);
  if (!ks.length) { out.push([prefix, '{}']); return out; }
  for (const k of ks) leaves(node[k], prefix ? `${prefix}.${k}` : k, out);
  return out;
}
const normalise = (p) => p.replace(/\[\d+\]/g, '[]');

/**
 * THE CENSUS. For each phone: how many log envelopes it was handed, how many of those at least one
 * other phone was NOT handed, and what kinds those were.
 *
 * 🚨 THE IDENTITY OF AN ENVELOPE IS ITS `seq` — the log's own sequence number, stamped by
 * `createLog().append` and carried onto the wire unchanged, so the same fact on two phones is the
 * same number on both. Nothing here consults the log: `seq` arrives inside the envelope, which is
 * the whole point. The television is excluded — it is not a player and has no Debrief to bring
 * anything to — but its totals are printed beside the table, because *"the television is the
 * adversary"* and how much of the wire it holds is worth reading.
 */
function census(cap) {
  const seen = cap.phones.map((p) => new Set(p.events.map((e) => e.seq)));
  const rows = cap.phones.map((p, i) => {
    const priv = p.events.filter((e) => seen.some((other, j) => j !== i && !other.has(e.seq)));
    const kinds = {};
    for (const e of priv) kinds[e.type] = (kinds[e.type] || 0) + 1;
    return { id: p.id, playerId: p.playerId, total: p.events.length, private: priv.length, kinds };
  });
  const counts = rows.map((r) => r.private);
  return {
    rows,
    kinds: [...new Set(rows.flatMap((r) => Object.keys(r.kinds)))].sort(),
    min: Math.min(...counts), max: Math.max(...counts),
    atFloor: counts.filter((n) => n === BAND.floor).length,
    union: new Set(seen.flatMap((s) => [...s])).size,
  };
}

/** A stable, comparable form of a census. `P4` compares two of these byte for byte. */
const canon = (c) => JSON.stringify(c.rows.map((r) => [r.playerId, r.private, Object.entries(r.kinds).sort()]));

/** One line per phone, so a human reading the run output learns what the critique learned. */
const table = (c) => c.rows
  .map((r) => `${r.playerId}:${r.private}${Object.keys(r.kinds).length ? `(${Object.entries(r.kinds).map(([k, n]) => (n > 1 ? `${k}×${n}` : k)).join('+')})` : ''}`)
  .join(' ');

/** The distinct per-player shapes in a census — `P5`'s subject. */
const shapeSet = (c) => JSON.stringify([...new Set(census(c).rows
  .map((r) => `${r.private}:${Object.keys(r.kinds).sort().join('+')}`))].sort());

/**
 * THE FRAME CENSUS. Strip `you` — that panel is one player's by declaration and `party-isolation`
 * I10 already owns it — then ask, frame by frame, which phones hold a value the others do not.
 *
 * `pair.guide` is rowed `all`, so every phone agrees on who the guide is. The modal stripped frame
 * is the consensus and an `offender` is a phone that departs from it.
 */
function frameCensus(cap) {
  const n = Math.min(...cap.phones.map((p) => p.frames.length));
  const paths = new Map();
  const offenders = new Map();
  let notGuide = null;
  for (let i = 0; i < n; i++) {
    const stripped = cap.phones.map((p) => { const { you, ...rest } = p.frames[i] || {}; return rest; });
    const maps = stripped.map((f) => new Map(leaves(f)));
    const keys = new Set(maps.flatMap((m) => [...m.keys()]));
    for (const k of keys) {
      const vals = maps.map((m) => (m.has(k) ? m.get(k) : '<absent>'));
      if (new Set(vals).size > 1) paths.set(normalise(k), (paths.get(normalise(k)) || 0) + 1);
    }
    const blobs = stripped.map((f) => JSON.stringify(f));
    const tally = {};
    for (const b of blobs) tally[b] = (tally[b] || 0) + 1;
    const modal = Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0];
    const guide = (stripped.find((f) => f.pair) || {}).pair?.guide ?? null;
    for (let j = 0; j < blobs.length; j++) {
      if (blobs[j] === modal) continue;
      const who = cap.phones[j].playerId;
      offenders.set(who, (offenders.get(who) || 0) + 1);
      if (who !== guide && notGuide === null) {
        notGuide = `${who} held a value alone on frame ${i} and the guide was ${guide ?? 'nobody'}`;
      }
    }
  }
  return {
    frames: n, paths, offenders, notGuide,
    topKeys: [...new Set([...paths.keys()].map((p) => p.split(/[.[]/)[0]))].sort(),
  };
}

/** Did this capture actually happen? `P0` refuses a vacuous green on the answer. */
function armed(cap) {
  if (!cap.phones.length) return 'no phone was served at all';
  if (!cap.done) return `the game did not finish — ${cap.episodes} episodes, outcome ${cap.outcome}`;
  for (const p of cap.phones) {
    if (!p.frames.length) return `${p.id} received zero state frames`;
    if (!p.events.length) return `${p.id} received zero log envelopes`;
    if (!p.playerId) return `${p.id} could not be resolved to a player`;
  }
  if (!cap.production) return 'nobody was dealt into Production, so there is no second private kind to find';
  return null;
}

// =============================================================================================
// run
// =============================================================================================
const ctlCensus = mirror('census', {
  'src/party/room.js': [
    // The card and the Panel dealt every episode, instead of only in the premiere.
    ['if (state.episode === 1) {', 'if (state.episode >= 1) {'],
    // And a PUBLIC event re-recorded as a private reading for THIS episode's guide — a different
    // phone each time. This is the shape of the Continuity fix.
    ["record(makeEvent('run.camera_lit', VIS.PUBLIC, { camera: state.cameras.unlocked, episode: state.episode }));",
      "record({ ...makeEvent('run.camera_lit', VIS.SELF, { camera: state.cameras.unlocked, episode: state.episode }), for: guide.id });"],
  ],
});
const ctlFrame = mirror('frame', {
  'net/party/entitle.js': [["['pair.runner',              'all'],", "['pair.runner',              'runner'],"]],
});

const show8 = await captureShow(PORT.show8, 'prv8', 8);
const show6 = await captureShow(PORT.show6, 'prv6', 6);
const roomA = await captureRoom({ startServer: shippedRoomServer }, PORT.roomA, 'ra', 8, SEED_A);
const roomA2 = await captureRoom({ startServer: shippedRoomServer }, PORT.roomA2, 'ra2', 8, SEED_A);
const roomB = await captureRoom({ startServer: shippedRoomServer }, PORT.roomB, 'rb', 8, SEED_B);
const room5 = await captureRoom({ startServer: shippedRoomServer }, PORT.room5, 'r5', 5, SEED_A);
const SHIPPED = [show8, show6, roomA, room5];

// ---------------------------------------------------------------- P0 · the arm
{
  const bad = [...SHIPPED, roomA2, roomB].map((c) => [c.label, armed(c)]).filter(([, why]) => why);
  if (bad.length) {
    skipped('P0 arm', `${bad.map(([l, w]) => `${l}: ${w}`).join(' · ')} — a census over a wire nobody filled counts nothing and reports one each`);
    ctlCensus.rm(); ctlFrame.rm();
    console.log(`\nparty-private: ${pass} passed, ${fail} failed, ${skip} skipped (NOT ARMED)`);
    process.exit(1);
  }
  t('P0 arm · six complete games on two real servers, every phone served frames and envelopes', true,
    [...SHIPPED, roomA2, roomB].map((c) => `${c.label} ${c.episodes}ep/${c.phones.length}ph/${c.phones[0].frames.length}fr/${c.phones[0].events.length}env`).join('  ·  '));
}

// ---------------------------------------------------------------- P0b · the arm's own control
{
  const srv = shippedRoomServer({ port: PORT.dead, count: 8, castSeed: SEED_A, worldSeed: 1, code: 'dead' });
  await sleep(140);
  const conns = [];
  for (let i = 0; i < 9; i++) conns.push(await open(PORT.dead, '?room=dead'));
  await sleep(220);
  const seated = conns.filter((c) => c.welcome && c.welcome.t === 'welcome').length;
  const idle = {
    label: 'room/never-rolled', production: 2, episodes: 0, outcome: null, done: false,
    phones: conns.filter((c) => c.welcome && c.welcome.id !== 'tv')
      .map((c) => ({ id: c.welcome.id, playerId: 'p?', frames: c.frames(), events: c.events() })),
  };
  const why = armed(idle);
  for (const c of conns) c.close();
  try { srv.close(); } catch { /* handles */ }
  t('P0b control · a live server with nine real sockets on it that was never told to roll is NOT armed',
    seated === 9 && why !== null,
    `${seated} sockets welcomed, ${idle.phones.reduce((a, p) => a + p.events.length, 0)} envelopes between them · armed() says: ${why || 'ARMED — P0 would pass on an empty capture'}`);
}

// ---------------------------------------------------------------- P1 · the census
const CENSUS = new Map(SHIPPED.map((c) => [c.label, census(c)]));
for (const c of SHIPPED) {
  const x = CENSUS.get(c.label);
  console.log(`       ${c.label.padEnd(12)} ${String(c.phones[0].events.length).padStart(3)} envelopes per phone · ${x.union} distinct on the wire · TV ${c.tv.events.length} · private: ${table(x)}`);
}
{
  const empty = SHIPPED.filter((c) => CENSUS.get(c.label).min === 0);
  t('P1 · every phone holds at least one envelope no other phone holds, on every capture',
    empty.length === 0,
    empty.length ? `${empty[0].label} has a phone with none`
      : SHIPPED.map((c) => `${c.label} ${CENSUS.get(c.label).min}-${CENSUS.get(c.label).max}`).join(' · '));
}
{
  const wrong = SHIPPED.filter((c) => JSON.stringify(CENSUS.get(c.label).kinds) !== JSON.stringify(SHIPPED_KINDS));
  t('P1b · and the ONLY kinds of private envelope in a whole game are the card and the Panel',
    wrong.length === 0,
    wrong.length ? `${wrong[0].label}: ${CENSUS.get(wrong[0].label).kinds.join(', ')}`
      : `${SHIPPED_KINDS.join(' + ')} — both dealt in episode one, and nothing private is written to anybody for the rest of the game`);
}

// ---------------------------------------------------------------- P2 · the band
{
  const out = SHIPPED.filter((c) => { const x = CENSUS.get(c.label); return x.min < BAND.floor || x.max > BAND.ceil; });
  t(`P2 · private envelopes per player per game are inside [${BAND.floor}, ${BAND.ceil}]`,
    out.length === 0,
    out.length ? `${out[0].label} ran ${CENSUS.get(out[0].label).min}-${CENSUS.get(out[0].label).max} — READ THE BAND'S HEADER BEFORE RAISING IT`
      : SHIPPED.map((c) => `${c.label} ${CENSUS.get(c.label).min}-${CENSUS.get(c.label).max}`).join(' · '));
}
{
  const wrong = SHIPPED.filter((c) => CENSUS.get(c.label).atFloor !== c.phones.length - c.production);
  t('P2b · and the players sitting exactly on the floor are everybody outside Production',
    wrong.length === 0,
    wrong.length ? `${wrong[0].label}: ${CENSUS.get(wrong[0].label).atFloor} at the floor, ${wrong[0].phones.length - wrong[0].production} expected`
      : `${SHIPPED.map((c) => `${CENSUS.get(c.label).atFloor}/${c.phones.length} on ${c.label}`).join(' · ')} receive exactly one private envelope in the entire game`);
}

// ---------------------------------------------------------------- P1c/P1d/P2c · the census control
const ctlCap = ctlCensus.applied ? await captureRoom(await ctlCensus.load(), PORT.ctlCensus, 'ctl', 8, SEED_A) : null;
const ctlX = ctlCap ? census(ctlCap) : null;
{
  const base = CENSUS.get(roomA.label);
  t('P1c/P1d/P2c control arm · both edits applied and the control server played a whole game',
    ctlCensus.applied && !!ctlCap && armed(ctlCap) === null,
    ctlCensus.missed.length ? `edits missed: ${ctlCensus.missed.join(' · ')}`
      : (ctlCap ? `${ctlCap.episodes} episodes · ${ctlCap.phones.length} phones · ${armed(ctlCap) || 'armed'}` : 'the control never ran'));
  t('P1c control · every phone\'s private count moves, so the census counts rather than recites',
    !!ctlX && ctlX.rows.every((r, i) => r.private > base.rows[i].private),
    ctlX ? `${table(ctlX)}   (shipped: ${table(base)})` : 'no control census');
  t('P1d control · and `run.camera_lit` joins the kinds, so P1b\'s set is measured and not asserted',
    !!ctlX && ctlX.kinds.includes('run.camera_lit'),
    ctlX ? ctlX.kinds.join(', ') : 'no control census');
  t('P2c control · the same band check goes red on it, at the same seed and the same count',
    !!ctlX && (ctlX.min < BAND.floor || ctlX.max > BAND.ceil),
    ctlX ? `${ctlX.min}-${ctlX.max} against [${BAND.floor}, ${BAND.ceil}]` : 'no control census');
}

// ---------------------------------------------------------------- P3 · the frames
const FRAMES = new Map(SHIPPED.map((c) => [c.label, frameCensus(c)]));
for (const c of SHIPPED) {
  const f = FRAMES.get(c.label);
  console.log(`       ${c.label.padEnd(12)} ${f.frames} frames × ${c.phones.length} phones · differing non-\`you\` paths: ${[...f.paths.entries()].map(([p, n]) => `${p}×${n}`).join(' ') || 'NONE'}`);
}
{
  const bad = SHIPPED.filter((c) => FRAMES.get(c.label).notGuide);
  t('P3 · every non-`you` frame difference belongs to that frame\'s guide, and to nobody else',
    bad.length === 0,
    bad.length ? `${bad[0].label}: ${FRAMES.get(bad[0].label).notGuide}`
      : SHIPPED.map((c) => `${c.label} ${FRAMES.get(c.label).offenders.size} phone(s) ever held a value alone`).join(' · '));
}
{
  const arm = SHIPPED.every((c) => FRAMES.get(c.label).paths.size > 0);
  const stray = SHIPPED.filter((c) => FRAMES.get(c.label).topKeys.some((k) => !GUIDE_KEYS.includes(k)));
  t('P3b · and they live under `call` and `flyover` only — the guide\'s callout and the guide\'s map',
    arm && stray.length === 0,
    !arm ? 'a capture showed NO difference at all — the scan found nothing and would pass on anything'
      : stray.length ? `${stray[0].label} also differs under ${FRAMES.get(stray[0].label).topKeys.filter((k) => !GUIDE_KEYS.includes(k)).join(', ')}`
        : `the critique reported call.said alone; the flyover is the other half — ${SHIPPED.map((c) => `${c.label} ${FRAMES.get(c.label).topKeys.join('+')}`).join(' · ')}`);
}

// ---------------------------------------------------------------- P3c · the frame control
{
  const cap = ctlFrame.applied ? await captureRoom(await ctlFrame.load(), PORT.ctlFrame, 'ctf', 8, SEED_A) : null;
  const f = cap ? frameCensus(cap) : null;
  t('P3c control arm · the matrix edit applied and the control server played a whole game',
    ctlFrame.applied && !!cap && armed(cap) === null,
    ctlFrame.missed.length ? `edits missed: ${ctlFrame.missed.join(' · ')}`
      : (cap ? `pair.runner rowed \`runner\` · ${cap.episodes} episodes · ${armed(cap) || 'armed'}` : 'the control never ran'));
  t('P3c control · one row moved from `all` to `runner`, and BOTH P3 and P3b go red on it',
    !!f && f.notGuide !== null && f.topKeys.some((k) => !GUIDE_KEYS.includes(k)),
    f ? `${f.notGuide || 'nobody but the guide ever differed — P3 is blind'} · keys ${f.topKeys.join('+')}` : 'no control frames');
  ctlFrame.rm();
}

// ---------------------------------------------------------------- P4 · seeded determinism
{
  const a = canon(census(roomA)), a2 = canon(census(roomA2)), b = canon(census(roomB));
  t('P4 · the same seed deals the same census twice, byte for byte', a === a2,
    a === a2 ? `castSeed ${SEED_A}, two servers on two ports, ${a.length} bytes identical`
      : `castSeed ${SEED_A} disagreed with itself`);
  t('P4b control · a different seed does not, so P4 is comparing something that can differ',
    a !== b,
    a !== b ? `${SEED_A}: ${table(census(roomA))}  vs  ${SEED_B}: ${table(census(roomB))}`
      : 'TWO SEEDS PRODUCED THE IDENTICAL CENSUS — P4 is comparing constants');
}

// ---------------------------------------------------------------- P5 · and the shape does not move
/**
 * `show.mjs` randomises its seeds on every roll and there is no seam to pin them, so the shipped
 * show cannot answer `P4`. It answers something else, and for this property the something else is
 * the stronger claim: **the poverty depends on neither the deal, nor the room module, nor the
 * count.** Four complete games, two servers, two independently-randomised deals and three player
 * counts produce one set of per-player shapes between them.
 */
{
  const shapes = SHIPPED.map((c) => [c.label, shapeSet(c)]);
  const ref = shapes[0][1];
  const odd = shapes.filter(([, s]) => s !== ref);
  t('P5 · four games, two servers, three counts — one set of per-player shapes between them',
    odd.length === 0,
    odd.length ? `${odd[0][0]} is ${odd[0][1]} where ${shapes[0][0]} is ${ref}`
      : `${JSON.parse(ref).join('   ·   ')} — and nothing else, anywhere`);
  t('P5b control · the census control\'s shape set is a different set, so P5 is not a tautology',
    !!ctlCap && shapeSet(ctlCap) !== ref,
    ctlCap ? `${JSON.parse(shapeSet(ctlCap)).join('   ·   ')} on the control` : 'the control never ran');
}
// Both mirrors are dot-prefixed, so `gates.mjs`'s manifest audit never sees them; they are
// removed here as well as at their use sites so an interrupted run leaves no tree behind.
ctlCensus.rm();
ctlFrame.rm();

console.log(`\nparty-private: ${pass} passed, ${fail} failed${skip ? `, ${skip} skipped` : ''}`);
process.exit(fail ? 1 : 0);
