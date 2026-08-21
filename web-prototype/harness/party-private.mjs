#!/usr/bin/env node
/**
 * 🤫 **party-private — HOW MUCH DOES ONE PHONE KNOW THAT THE PHONE NEXT TO IT DOES NOT?**
 *
 *   node harness/party-private.mjs
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 THE NUMBER THIS GATE WAS BUILT TO HOLD HAS MOVED ONCE. HERE IS WHAT IT WAS.
 * ---------------------------------------------------------------------------------------------
 * Every other gate in this suite asks whether a socket received something it should NOT have.
 * `party-isolation` is the whole of that question and is Tier 0 for good reason. **None of them
 * asks the opposite question**, and the opposite question is what the DEBRIEF is made of: *after
 * forty minutes of play, what does any given player hold that nobody else at the table holds?*
 *
 * When this file landed (`dacd4d9`), measured on the observed wire over complete games:
 *
 *     a player received ONE private log envelope in an entire game — their own role card —
 *     and a member of Production received TWO: their card, and their Production Panel.
 *
 * Six of eight phones went five episodes on a single sentence dealt in episode one, and the band
 * was `[1, 2]` on both servers. The Debrief was eight people reasoning about facts they already
 * all shared.
 *
 * **Then Continuity was made to fire.** `session.js`'s `fireContinuity()` runs at the end of
 * `resolveCasting()` — *"as a pair is announced"*, where a pair first exists — calls the shipped
 * `pairContainsProduction()` and `resolveInformation()`, and records `reading.taken`, `VIS.SELF`,
 * addressed with `for`. This gate went red on exactly the four assertions that carried the old
 * number — `P1b`, `P2`, `P2b`, `P5` — which is the whole reason it was committed before the fix
 * rather than after. The new measurement, same instrument, same method:
 *
 *     the holder of a Continuity card now receives SIX — one card and five readings, one per
 *     episode under `EPISODE_CAP` — and everybody else is exactly where they were.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 THE BAND IS NOW TWO BANDS, AND THAT IS STRUCTURAL RATHER THAN A CONCESSION
 * ---------------------------------------------------------------------------------------------
 * The room captures did not move at all. `src/party/room.js` has its own casting path, no
 * `PHASE.EXPEDITION`, no `PHASE.RECAP`, no `resolveExpedition` and no role that fires — its own
 * header says it is *"deliberately the smallest room that exercises every audience in the
 * matrix… it is not the game loop"*. That is correct and it must stay correct.
 *
 * ⚠️ **DO NOT "FIX" `room.js` TO MATCH THE GAME, AND DO NOT WIDEN THE BAND TO COVER BOTH.** A
 * single band of `[1, 6]` would be green on both servers today — and would stay green if
 * `fireContinuity()` were deleted tomorrow, because `1-2` is inside `[1, 6]`. A band that cannot
 * detect the removal of the thing it was widened for is not a band, it is a licence. So each
 * producer declares its own, each is tight, and `P2d` asserts that the session capture actually
 * EXCEEDS the room ceiling — which is the assertion that goes red the day the readings stop.
 *
 *     BAND.session  [1, 6]   `src/party/session.js` — the game. Card, Panel, five readings.
 *     BAND.room     [1, 2]   `src/party/room.js`    — the fixture. Card, Panel. Nothing fires.
 *
 * Which players are expected to sit on the floor is derived per producer by scanning that
 * producer's own source for the roles it actually calls `resolveInformation` with (`firingIn`),
 * so neither list is maintained by hand and the day the Camera Op lands, `P2b` says so.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 AND THE STATED DEPLOY TARGET RUNS THE FIXTURE. SEE `P8`.
 * ---------------------------------------------------------------------------------------------
 * `net/party/server.js` — the PartyKit adapter, D11's deploy target — imports `createRoom`, not
 * `createSession`. Its header's claim that *"both files are thin wrappers over the SAME room
 * module"* is true of `local.mjs` and `server.js` and says nothing about the game: on that
 * target there is no expedition, no recap, and now **no Continuity reading**. `P8` records which
 * room module the deploy target wraps and prints the band that therefore applies to it. It is a
 * RECORD, not a verdict — it passes whichever module is named, because choosing between them is
 * a much larger decision than this gate. It exists so the next person to read the two bands above
 * finds out, in the same breath, that one of them is what would actually ship.
 *
 * ---------------------------------------------------------------------------------------------
 * ⚠️ WHERE THE ORIGINAL CRITIQUE'S FIGURES LANDED, AND THE THREE PLACES THEY WERE WRONG
 * ---------------------------------------------------------------------------------------------
 * *"126 log entries, 116 of them PUBLIC, and every player receives exactly one private event in
 * the whole game — their own role card. Across 31 phase-frames × 8 phones the only non-`you`
 * difference anywhere is `call.said` on one phone."* The shape reproduced exactly; three
 * corrections, all made by this instrument, all still load-bearing:
 *
 *   · **126/116 is the WIRE UNION, not `log.all()`.** A complete five-episode eight-player show
 *     writes ~185 entries, ~28 of them `SEALED`, which reach nobody at all. 126 = 116 + 8 + 2 is
 *     precisely the set that reached at least one phone — the right set to have counted, and what
 *     `P1` counts. Only the episode count differed.
 *   · **It was never "exactly one" for everybody.** Production members get a second envelope:
 *     their own Panel, `VIS.EVIL` **and** addressed with `for`, so it reaches one phone rather
 *     than the faction (`log.js`'s `visibleTo` — *"the class says WHO MAY; `for` says WHO"*).
 *   · **`call.said` is not the only non-`you` frame difference.** The guide's flyover is a whole
 *     private frame surface — `flyover.hunter`, `flyover.room`, `flyover.marks[]` and the floor
 *     plan they are drawn on — rowed `guide` and observed on 11-90 frames of a single game.
 *     `P3` states the sentence that is actually true and is narrower than the one it replaces:
 *     **every byte on a frame that one phone holds and the others do not belongs to whoever is
 *     currently the guide.** `you.readings[]` is rowed `self` and lives inside `you`, so it does
 *     not touch that claim — the readings are an ENVELOPE story, not a frame story.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 WHAT IS MEASURED IS THE WIRE. NOT `log.all()`, NOT A MODEL OF THE MATRIX, NOT A HAND-BUILT
 * FRAME.
 * ---------------------------------------------------------------------------------------------
 * *"A model may stand in for something that does not exist yet. It may never stand in for
 * something that does"* — `wire-parity`'s header, and the rule this suite was rebuilt around
 * after four Fatal bugs survived a fully green run. Everything below is read off real WebSockets
 * served by the real servers in `net/party/`, after the real `project()` and the real
 * `visibleTo()` have run. The walkers are this file's own and share no code with the projection,
 * for the reason `entitle.js`'s header gives: a gate that reuses the filter to decide what should
 * have arrived learns nothing.
 *
 * **Two servers, because neither alone can answer the whole question.**
 *
 *   · `net/party/show.mjs` `startShow` → `createSession`. THE SHIPPED GAME. It **cannot be
 *     seeded** — `randomSeed()` is four random bytes per show, deliberately, and `party-surface`
 *     W1/W2 argues why at length (a derived seed named both traitors 80.4% of the time).
 *   · `net/party/local.mjs` `startServer` → `createRoom`. Takes `castSeed`/`worldSeed`, so `P4`'s
 *     seeded determinism can honestly be asserted there.
 *
 * ⚠️ **`P6b` NEEDS A DEAL THAT OCCURS 22.6% OF THE TIME, SO ITS SHOW IS FIXTURE-SELECTED, AND
 * THAT IS NOT THE SAME THING AS A CONTROL.** A control edits the behaviour under test so that it
 * must fail. A fixture-selected show edits only WHICH of the 2^32 deals is dealt: `randomSeed()`
 * → a literal, chosen by asking the shipped `dealCast` for a seed with two Continuity believers.
 * `createSession`, `fireContinuity`, `resolveInformation`, `falsify`, `project` and the socket
 * layer are the shipped code, unedited, running. `P6b arm` proves it: the mirrored source with
 * the named edits REVERSED is byte-identical to the file on disk, so nothing else moved.
 *
 * ---------------------------------------------------------------------------------------------
 * ⚠️ THE CONTROLS ARE RUNNING SERVERS BUILT OUT OF THE SHIPPED FILES
 * ---------------------------------------------------------------------------------------------
 * `mirror()` copies a named set of shipped files into a dot-prefixed tree that preserves their
 * relative layout, applies a named list of text edits, re-points only the imports that leave the
 * copied set, and **imports and runs the result**. Every control is therefore the real projection
 * and the real matrix over real sockets with one stated thing different — never a string this
 * file wrote about a server. That is `party-surface`'s `controlOf()` idiom; the mirror form is
 * needed because the edits have to reach modules that other modules import.
 *
 *   census control    `room.js` deals the card every episode instead of only in the premiere, AND
 *                     re-records `run.camera_lit` as a `SELF` reading addressed to that episode's
 *                     guide — a different phone each time.
 *   frame control     the matrix rows `pair.runner` to `runner` instead of `all`. A non-`you`
 *                     frame difference then exists that does NOT belong to the guide.
 *   no-fire control  the one call site of `fireContinuity()` comes out of `resolveCasting`. The
 *                     session census falls back to 1-2 — inside a single `[1, 6]` band, outside
 *                     the room ceiling — which is the empirical half of the two-band argument.
 *   falsify control   `roles.js`'s `falsify('boolean')` returns `truth` instead of `!truth`, on
 *                     the same fixture deal. The two dossiers then AGREE, and `P6b`'s
 *                     inverse-detector must say so rather than reporting a match anyway.
 *   deal control      `P7`'s overlap scan, asked about `producer` instead of an informing card,
 *                     finds an overlap in every game — so a scan that found none is looking.
 *   arm control       a real server, live, with nine real sockets on it, never told to roll.
 *
 * 🚨 **A SKIP IS NEVER A PASS.** `P0` exits non-zero on an empty capture. A census over a
 * transcript nobody filled is the most comfortable green in this repo, and it is the exact shape
 * that let five Fatal bugs through a suite that was entirely green.
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { startShow, playerIdOf } from '../net/party/show.mjs';
import { startServer as shippedRoomServer } from '../net/party/local.mjs';
import { dealCast, viewFor, EVIL } from '../src/party/cast.js';
import { SCRIPT, informers } from '../src/party/roles.js';
import { PHASE, EPISODE_CAP } from '../src/party/phases.js';
import { CALL, MOVE_CHOICE } from '../src/party/session.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const src = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/**
 * 🚨 **TWO BANDS, ONE PER PRODUCER, AND WHAT EACH END IS MADE OF.** `escape` E1's hard `4` passed
 * for a year and then failed on a generated house; a property that is a band gets a band. The
 * argument for there being TWO of them is in this file's header — read it before merging them.
 *
 *   session  FLOOR 1  one `role.card`, `VIS.SELF`, `for` its holder, dealt once in episode one.
 *                     That is still the entire private wire of a player holding no informing
 *                     card, all game, and it is six of eight at the flagship count.
 *            CEIL  6  one card plus five `reading.taken`, one per episode under `EPISODE_CAP`.
 *
 *   room     FLOOR 1  the same card.
 *            CEIL  2  the card plus one `production.panel` per member of Production. `room.js`
 *                     fires no role and must not be made to.
 *
 * ⚠️ **7 IS UNREACHABLE, AND `P7` PROVES IT RATHER THAN ASSUMING IT.** Card + Panel + readings
 * would be 7. `viewFor` returns `cover ?? role`; only the Glitched carries a cover; the Glitched
 * is GOOD; and every informing card in `SCRIPT` is GOOD. So no member of Production can ever
 * believe they hold an informing card. Measured over 10,000 deals across counts 4-8: max 6, and
 * not one Production believer.
 *
 * ⚠️ THE SESSION CEILING IS `1 + EPISODE_CAP`, DERIVED RATHER THAN TYPED, AND THAT IS DELIBERATE.
 * It is not the integer 6 that matters, it is the sentence *"one card plus one reading per
 * episode"*. A literal would go red the day somebody changed the cap for a reason that has nothing
 * to do with this gate, and would send its reader to the wrong file. `P7` re-derives the same
 * number from the shipped dealer, and `P2d`/`P2e` guard the direction that a derived ceiling
 * cannot: a ceiling that quietly stops being reached.
 *
 * ⚠️ **IF YOU ARE HERE BECAUSE `P2` WENT RED, THIS IS THE NUMBER YOU ARE REPLACING.** Raise a
 * CEILING only, and only by the readings the new card actually fires. A change that moves a FLOOR
 * gave every player something, which is a different and much larger claim — say so in the commit
 * body and put the measured number in it.
 */
const BAND = {
  session: { floor: 1, ceil: 1 + EPISODE_CAP },
  room: { floor: 1, ceil: 2 },
};

/** The kinds of private envelope each producer has ever put on a wire. `P1b` owns this. */
const SHIPPED_KINDS = {
  session: ['production.panel', 'reading.taken', 'role.card'],
  room: ['production.panel', 'role.card'],
};

/** The top-level frame keys under which a non-`you` per-phone difference is legitimate. `P3b`. */
const GUIDE_KEYS = ['call', 'flyover'];

/**
 * 🚨 **WHICH CARDS ACTUALLY FIRE, ASKED OF THE PRODUCER'S OWN SOURCE RATHER THAN LISTED HERE.**
 * `informers()` names three cards; exactly one of them has a caller. A hand-kept list would rot
 * silently and `P2b` would go red for the wrong reason on the day the Camera Op lands. A role
 * fires in a producer iff that producer names it in a `resolveInformation` call.
 *
 * ⚠️ IT FAILS LOUD RATHER THAN EMPTY. If a future caller passes a variable instead of a literal
 * this returns nothing, `P2b` expects everybody outside Production on the floor, and the gate goes
 * red with the scan's own count in the detail — which is the correct outcome for an instrument
 * that has stopped being able to measure.
 */
function firingIn(rel) {
  const text = src(rel);
  const found = [...text.matchAll(/resolveInformation\(\s*\{[\s\S]{0,160}?role:\s*'(\w+)'/g)].map((m) => m[1]);
  return [...new Set(found)].sort();
}
const FIRING = { session: firingIn('src/party/session.js'), room: firingIn('src/party/room.js') };

const PORT = {
  show8: 5271, show6: 5272, roomA: 5273, roomA2: 5274, roomB: 5275, room5: 5276,
  ctlCensus: 5277, ctlFrame: 5278, dead: 5279, fixture: 5280, ctlFalsify: 5281, ctlNoFire: 5282,
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
// the mirror
// =============================================================================================
const MIRROR_ROOM = ['net/party/entitle.js', 'src/party/room.js', 'net/party/local.mjs'];
const MIRROR_SHOW = ['src/party/roles.js', 'src/party/session.js', 'net/party/show.mjs'];

/**
 * A runnable copy of `files` with `edits` applied. The layout is preserved so imports WITHIN the
 * copied set still resolve to the copies; every other relative import is re-pointed at the real
 * tree, and `dirname(fileURLToPath(import.meta.url))` is pinned to the original's directory so a
 * server that serves files off disk still finds them. Nothing else about the files changes, and
 * `onlyEdits` proves it: reversing the named edits reproduces the file byte for byte.
 */
function mirror(name, files, edits) {
  const dir = join(HERE, `.private-ctl-${name}`);
  rmSync(dir, { recursive: true, force: true });
  const inside = new Set(files.map((f) => join(ROOT, f)));
  const missed = [];
  let changed = 0, onlyEdits = true;
  for (const rel of files) {
    const from = join(ROOT, rel);
    const original = readFileSync(from, 'utf8');
    let edited = original;
    for (const [a, b] of (edits[rel] || [])) {
      if (!edited.includes(a)) missed.push(`${rel}: ${a.trim().slice(0, 48)}`);
      else edited = edited.split(a).join(b);
    }
    if (edited !== original) changed += 1;
    // Reversing the edits must reproduce the file exactly — no stray rewrite, no lost byte.
    let back = edited;
    for (const [a, b] of (edits[rel] || [])) back = back.split(b).join(a);
    if (back !== original) onlyEdits = false;
    let out = edited.replace(/(\bfrom\s+')(\.[^']*)(')/g, (m, pre, spec, post) => {
      const abs = resolvePath(dirname(from), spec);
      return inside.has(abs) ? m : pre + pathToFileURL(abs).href + post;
    });
    out = out.split('dirname(fileURLToPath(import.meta.url))').join(JSON.stringify(dirname(from)));
    const to = join(dir, rel);
    mkdirSync(dirname(to), { recursive: true });
    writeFileSync(to, out);
  }
  return {
    name, dir, missed, onlyEdits,
    applied: missed.length === 0 && changed > 0,
    load: (entry) => import(pathToFileURL(join(dir, entry)).href),
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
 * Waiting keeps the objective unmet, so every capture runs to the FULL `EPISODE_CAP` — the longest
 * game the format can produce and therefore the most private traffic it can carry, which is what
 * puts the ceiling where `P2` reads it. Nobody is nominated and everybody abstains, so no seat is
 * lost, no reading is cut short by a death, and the census is over the whole table.
 *
 * `stopWhen(phones)` ends the drive early — used by `P6c`'s control, which has its answer as soon
 * as the first pair is announced and does not need to buy four more episodes to say it.
 */
async function captureShow(mod, port, code, count, { stopWhen = null, maxSteps = 80, producer = 'session' } = {}) {
  const show = mod.startShow({ port, code, stamp: 1700000000000 });
  const idOf = mod.playerIdOf || playerIdOf;
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
          runner: idOf(alive[(i + 1) % alive.length]),
          guide: idOf(alive[(i + 2) % alive.length]),
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

  let early = false;
  for (let i = 0; i < maxSteps; i++) {
    const s = show.sessionNow();
    if (!s || s.state.phase === PHASE.REUNION) break;
    if (stopWhen && stopWhen(phones)) { early = true; break; }
    await step();
    if (i === maxSteps - 1) early = true;
  }
  await sleep(early ? 80 : 220);

  const sess = show.sessionNow();
  const truth = sess ? sess.truth() : { seats: [], evil: [] };
  const cap = {
    label: `${early ? 'part' : 'show'}/${count}`, producer,
    phones: phones.map((p, i) => ({ id: `phone-${i}`, playerId: idOf(i), frames: p.frames(), events: p.events() })),
    tv: { frames: tv.frames(), events: tv.events() },
    seats: truth.seats, production: truth.evil.length,
    episodes: sess ? sess.state.episode - 1 : 0,
    outcome: sess ? sess.state.outcome : null,
    done: !!sess && (early || sess.state.phase === PHASE.REUNION),
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
async function captureRoom(mod, port, code, count, seed, tag = '') {
  const srv = mod.startServer({ port, count, castSeed: seed, worldSeed: seed * 3, code });
  await sleep(140);
  const conns = [];
  for (let i = 0; i < count + 1; i++) conns.push(await open(port, `?room=${code}`));
  await sleep(140);
  conns[0].send({ t: 'start' });
  await sleep(70);
  for (let ep = 0; ep < EPISODE_CAP; ep++) { conns[0].send({ t: 'episode', opts: {} }); await sleep(90); }
  await sleep(220);

  const room = srv.rooms.get(code);
  const truth = room ? room.game.truth() : { seats: [], evil: [] };
  const seatOf = new Map((room ? room.game.sockets : []).map((s) => [s.id, s.playerId]));
  const cap = {
    label: `room/${count}@${seed}${tag}`, producer: 'room',
    phones: conns
      .filter((c) => c.welcome && c.welcome.t === 'welcome' && c.welcome.id !== 'tv')
      .map((c) => ({ id: c.welcome.id, playerId: seatOf.get(c.welcome.id), frames: c.frames(), events: c.events() }))
      .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })),
    tv: (() => { const c = conns.find((x) => x.welcome && x.welcome.id === 'tv'); return { frames: c ? c.frames() : [], events: c ? c.events() : [] }; })(),
    seats: truth.seats, production: truth.evil.length,
    episodes: room ? room.game.state.episode - 1 : 0,
    outcome: room ? room.game.state.outcome : null,
    done: !!room && room.game.state.episode > EPISODE_CAP,
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

/** What a seat BELIEVES it holds. `viewFor` returns `cover ?? role`; the Glitched is never told. */
const believes = (seat) => seat.cover ?? seat.role;
/** The seats a producer will actually hand readings to, from ground truth and the source scan. */
const informedSeats = (cap) => cap.seats.filter((s) => FIRING[cap.producer].includes(believes(s)));

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
    atFloor: counts.filter((n) => n === BAND[cap.producer].floor).length,
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

/** Every `reading.taken` a phone was handed, oldest first, as `{episode, value}`. Off the wire. */
const dossier = (cap, playerId) => (cap.phones.find((p) => p.playerId === playerId) || { events: [] })
  .events.filter((e) => e.type === 'reading.taken')
  .map((e) => ({ episode: e.data.episode, value: e.data.value }))
  .sort((a, b) => a.episode - b.episode);

/**
 * THE FRAME CENSUS. Strip `you` — that panel is one player's by declaration, `party-isolation` I10
 * already owns it, and `you.readings[]` is rowed `self` inside it — then ask, frame by frame,
 * which phones hold a value the others do not.
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
const ctlCensus = mirror('census', MIRROR_ROOM, {
  'src/party/room.js': [
    // The card and the Panel dealt every episode, instead of only in the premiere.
    ['if (state.episode === 1) {', 'if (state.episode >= 1) {'],
    // And a PUBLIC event re-recorded as a private reading for THIS episode's guide — a different
    // phone each time.
    ["record(makeEvent('run.camera_lit', VIS.PUBLIC, { camera: state.cameras.unlocked, episode: state.episode }));",
      "record({ ...makeEvent('run.camera_lit', VIS.SELF, { camera: state.cameras.unlocked, episode: state.episode }), for: guide.id });"],
  ],
});
const ctlFrame = mirror('frame', MIRROR_ROOM, {
  'net/party/entitle.js': [["['pair.runner',              'all'],", "['pair.runner',              'runner'],"]],
});

/**
 * 🚨 THE FIXTURE SEED IS FOUND BY ASKING THE SHIPPED DEALER, NOT BY BEING REMEMBERED. A constant
 * written here would be a number that was true of `cast.js` on the day it was typed. This walks
 * seeds through the real `dealCast` and takes the first that deals TWO Continuity believers — a
 * true holder and a Glitched wearing the cover — which happens in 22.6% of eight-player deals.
 */
const FIXTURE = (() => {
  for (let seed = 1; seed <= 500; seed++) {
    const deal = dealCast({ count: 8, castSeed: seed });
    const bel = deal.seats.filter((s) => viewFor(deal, s.id).you.role === 'continuity');
    if (bel.length === 2) return { seed, believers: bel.map((s) => s.id) };
  }
  return null;
})();
const seedEdit = FIXTURE ? { 'net/party/show.mjs': [['const castSeed = randomSeed();', `const castSeed = ${FIXTURE.seed};`]] } : {};
const fixture = mirror('fixture', MIRROR_SHOW, seedEdit);
/**
 * `P2d`'s control, and the empirical half of this file's argument for two bands. It takes the one
 * call site of `fireContinuity()` out of `resolveCasting` and leaves everything else alone. The
 * session census then falls back to 1-2 — inside a hypothetical single band of [1, 6], and outside
 * `BAND.room`'s ceiling test, which is the whole reason `P2d` exists. It stops four steps in,
 * because a capture that shows the readings are gone has said everything it can say.
 */
const ctlNoFire = mirror('nofire', MIRROR_SHOW, {
  'src/party/session.js': [['    fireContinuity();', '    void fireContinuity;']],
});
const ctlFalsify = mirror('falsify', MIRROR_SHOW, {
  ...seedEdit,
  'src/party/roles.js': [["if (kind === 'boolean') return !truth;", "if (kind === 'boolean') return truth;"]],
});

const show8 = await captureShow({ startShow, playerIdOf }, PORT.show8, 'prv8', 8);
const show6 = await captureShow({ startShow, playerIdOf }, PORT.show6, 'prv6', 6);
const roomA = await captureRoom({ startServer: shippedRoomServer }, PORT.roomA, 'ra', 8, SEED_A);
const roomA2 = await captureRoom({ startServer: shippedRoomServer }, PORT.roomA2, 'ra2', 8, SEED_A, ' (again)');
const roomB = await captureRoom({ startServer: shippedRoomServer }, PORT.roomB, 'rb', 8, SEED_B);
const room5 = await captureRoom({ startServer: shippedRoomServer }, PORT.room5, 'r5', 5, SEED_A);
const SHIPPED = [show8, show6, roomA, room5];

// ---------------------------------------------------------------- P0 · the arm
{
  const bad = [...SHIPPED, roomA2, roomB].map((c) => [c.label, armed(c)]).filter(([, why]) => why);
  if (bad.length) {
    skipped('P0 arm', `${bad.map(([l, w]) => `${l}: ${w}`).join(' · ')} — a census over a wire nobody filled counts nothing and reports one each`);
    for (const m of [ctlCensus, ctlFrame, fixture, ctlFalsify, ctlNoFire]) m.rm();
    console.log(`\nparty-private: ${pass} passed, ${fail} failed, ${skip} skipped (NOT ARMED)`);
    process.exit(1);
  }
  t('P0 arm · six complete games on two real servers, every phone served frames and envelopes', true,
    [...SHIPPED, roomA2, roomB].map((c) => `${c.label} ${c.episodes}ep/${c.phones.length}ph/${c.phones[0].frames.length}fr/${c.phones[0].events.length}env`).join('  ·  '));
  t('P0b arm · and both producers name the cards they fire, read off their own source',
    FIRING.session.length > 0 && FIRING.session.every((r) => informers().includes(r)),
    `session fires [${FIRING.session.join(', ') || 'NOTHING — the scan found no resolveInformation caller'}] · room fires [${FIRING.room.join(', ') || 'nothing'}] · informers() offers [${informers().join(', ')}]`);
}

// ---------------------------------------------------------------- P0c · the arm's own control
{
  const srv = shippedRoomServer({ port: PORT.dead, count: 8, castSeed: SEED_A, worldSeed: 1, code: 'dead' });
  await sleep(140);
  const conns = [];
  for (let i = 0; i < 9; i++) conns.push(await open(PORT.dead, '?room=dead'));
  await sleep(220);
  const seated = conns.filter((c) => c.welcome && c.welcome.t === 'welcome').length;
  const idle = {
    label: 'room/never-rolled', producer: 'room', production: 2, episodes: 0, outcome: null, done: false, seats: [],
    phones: conns.filter((c) => c.welcome && c.welcome.id !== 'tv')
      .map((c) => ({ id: c.welcome.id, playerId: 'p?', frames: c.frames(), events: c.events() })),
  };
  const why = armed(idle);
  for (const c of conns) c.close();
  try { srv.close(); } catch { /* handles */ }
  t('P0c control · a live server with nine real sockets on it that was never told to roll is NOT armed',
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
  const wrong = SHIPPED.filter((c) => JSON.stringify(CENSUS.get(c.label).kinds) !== JSON.stringify(SHIPPED_KINDS[c.producer]));
  t('P1b · and the kinds of private envelope in a whole game are exactly what that producer writes',
    wrong.length === 0,
    wrong.length ? `${wrong[0].label} (${wrong[0].producer}): ${CENSUS.get(wrong[0].label).kinds.join(', ')} against ${SHIPPED_KINDS[wrong[0].producer].join(', ')}`
      : `session ${SHIPPED_KINDS.session.join('+')} · room ${SHIPPED_KINDS.room.join('+')} — the card and the Panel are dealt in episode one, and the readings are the only thing written to one phone after it`);
}

// ---------------------------------------------------------------- P2 · the two bands
{
  const out = SHIPPED.filter((c) => { const x = CENSUS.get(c.label), b = BAND[c.producer]; return x.min < b.floor || x.max > b.ceil; });
  t(`P2 · private envelopes per player per game are inside their producer's band — session [${BAND.session.floor}, ${BAND.session.ceil}], room [${BAND.room.floor}, ${BAND.room.ceil}]`,
    out.length === 0,
    out.length ? `${out[0].label} (${out[0].producer}) ran ${CENSUS.get(out[0].label).min}-${CENSUS.get(out[0].label).max} — READ THE BAND'S HEADER BEFORE RAISING IT`
      : SHIPPED.map((c) => `${c.label} ${CENSUS.get(c.label).min}-${CENSUS.get(c.label).max}`).join(' · '));
}
{
  const expected = (c) => {
    const ids = new Set([...c.seats.filter((s) => s.alignment === EVIL), ...informedSeats(c)].map((s) => s.id));
    return c.phones.length - ids.size;
  };
  const wrong = SHIPPED.filter((c) => CENSUS.get(c.label).atFloor !== expected(c));
  t('P2b · and the players on the floor are everybody outside Production and outside the informing cards',
    wrong.length === 0,
    wrong.length ? `${wrong[0].label}: ${CENSUS.get(wrong[0].label).atFloor} at the floor, ${expected(wrong[0])} expected (${wrong[0].production} in Production, ${informedSeats(wrong[0]).length} informed)`
      : SHIPPED.map((c) => `${CENSUS.get(c.label).atFloor}/${c.phones.length} on ${c.label}`).join(' · ')
        + ` still receive exactly one private envelope in the entire game`);
}
{
  const sessions = SHIPPED.filter((c) => c.producer === 'session');
  const flat = sessions.filter((c) => CENSUS.get(c.label).max <= BAND.room.ceil);
  t('P2d · the session capture EXCEEDS the room ceiling, so the two-band split is load-bearing',
    sessions.length > 0 && flat.length === 0,
    flat.length ? `${flat[0].label} peaked at ${CENSUS.get(flat[0].label).max} — the readings have stopped and a single wide band would not have noticed`
      : sessions.map((c) => `${c.label} peaks at ${CENSUS.get(c.label).max} against the room's ${BAND.room.ceil}`).join(' · '));
}

// ---------------------------------------------------------------- P2e · P2d's own control
{
  const cap = ctlNoFire.applied
    ? await captureShow(await ctlNoFire.load('net/party/show.mjs'), PORT.ctlNoFire, 'cnf', 8, { maxSteps: 4 })
    : null;
  const x = cap ? census(cap) : null;
  const believers = cap ? informedSeats(cap) : [];
  const readings = cap ? cap.phones.reduce((a2, p) => a2 + p.events.filter((e) => e.type === 'reading.taken').length, 0) : -1;
  t('P2e control arm · the one call site of fireContinuity() came out, only that, and the show still dealt',
    ctlNoFire.applied && ctlNoFire.onlyEdits && !!x && believers.length > 0 && readings === 0
      && x.rows.every((r) => r.kinds['role.card'] === 1),
    ctlNoFire.missed.length ? `edits missed: ${ctlNoFire.missed.join(' · ')}`
      : (x ? `${believers.length} believer(s) dealt, ${readings} readings written, ${x.rows.length} cards handed out` : 'the control never ran'));
  t('P2e control · with the readings gone the session census falls to the ROOM band, and P2d says so',
    !!x && x.max <= BAND.room.ceil && x.max <= BAND.session.ceil,
    x ? `${x.min}-${x.max} — inside a single [${BAND.session.floor}, ${BAND.session.ceil}] band, which is why there is not one`
      : 'no control census');
  ctlNoFire.rm();
}

// ---------------------------------------------------------------- P1c/P1d/P2c · the census control
const ctlCap = ctlCensus.applied ? await captureRoom(await ctlCensus.load('net/party/local.mjs'), PORT.ctlCensus, 'ctl', 8, SEED_A) : null;
const ctlX = ctlCap ? census(ctlCap) : null;
{
  const base = CENSUS.get(roomA.label);
  t('P1c/P1d/P2c control arm · both edits applied, only the edits, and the control played a whole game',
    ctlCensus.applied && ctlCensus.onlyEdits && !!ctlCap && armed(ctlCap) === null,
    ctlCensus.missed.length ? `edits missed: ${ctlCensus.missed.join(' · ')}`
      : (ctlCap ? `${ctlCap.episodes} episodes · ${ctlCap.phones.length} phones · reversing the edits reproduces room.js byte for byte` : 'the control never ran'));
  t('P1c control · every phone\'s private count moves, so the census counts rather than recites',
    !!ctlX && ctlX.rows.every((r, i) => r.private > base.rows[i].private),
    ctlX ? `${table(ctlX)}   (shipped: ${table(base)})` : 'no control census');
  t('P1d control · and `run.camera_lit` joins the kinds, so P1b\'s set is measured and not asserted',
    !!ctlX && ctlX.kinds.includes('run.camera_lit'),
    ctlX ? ctlX.kinds.join(', ') : 'no control census');
  t('P2c control · the same band check goes red on it, at the same seed and the same count',
    !!ctlX && (ctlX.min < BAND.room.floor || ctlX.max > BAND.room.ceil),
    ctlX ? `${ctlX.min}-${ctlX.max} against the room band [${BAND.room.floor}, ${BAND.room.ceil}]` : 'no control census');
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
  t('P3b · and they live under `call` and `flyover` only — the readings are an envelope, not a frame',
    arm && stray.length === 0,
    !arm ? 'a capture showed NO difference at all — the scan found nothing and would pass on anything'
      : stray.length ? `${stray[0].label} also differs under ${FRAMES.get(stray[0].label).topKeys.filter((k) => !GUIDE_KEYS.includes(k)).join(', ')}`
        : `you.readings[] is rowed self and rides inside \`you\` — ${SHIPPED.map((c) => `${c.label} ${FRAMES.get(c.label).topKeys.join('+')}`).join(' · ')}`);
}

// ---------------------------------------------------------------- P3c · the frame control
{
  const cap = ctlFrame.applied ? await captureRoom(await ctlFrame.load('net/party/local.mjs'), PORT.ctlFrame, 'ctf', 8, SEED_A) : null;
  const f = cap ? frameCensus(cap) : null;
  t('P3c control arm · the matrix edit applied, only the edit, and the control played a whole game',
    ctlFrame.applied && ctlFrame.onlyEdits && !!cap && armed(cap) === null,
    ctlFrame.missed.length ? `edits missed: ${ctlFrame.missed.join(' · ')}`
      : (cap ? `pair.runner rowed \`runner\` · ${cap.episodes} episodes` : 'the control never ran'));
  t('P3c control · one row moved from `all` to `runner`, and BOTH P3 and P3b go red on it',
    !!f && f.notGuide !== null && f.topKeys.some((k) => !GUIDE_KEYS.includes(k)),
    f ? `${f.notGuide || 'nobody but the guide ever differed — P3 is blind'} · keys ${f.topKeys.join('+')}` : 'no control frames');
  ctlFrame.rm();
}

// ---------------------------------------------------------------- P4 · seeded determinism
{
  // `canon` reads the ROWS, never the label, so the ' (again)' tag that keeps the two captures
  // apart in P0's arm cannot make P4 pass by making the two strings different.
  const a = canon(census(roomA)), a2 = canon(census(roomA2)), b = canon(census(roomB));
  t('P4 · the same seed deals the same census twice, byte for byte', a === a2,
    a === a2 ? `castSeed ${SEED_A}, two servers on two ports, ${a.length} bytes identical`
      : `castSeed ${SEED_A} disagreed with itself`);
  t('P4b control · a different seed does not, so P4 is comparing something that can differ',
    a !== b,
    a !== b ? `${SEED_A}: ${table(census(roomA))}  vs  ${SEED_B}: ${table(census(roomB))}`
      : 'TWO SEEDS PRODUCED THE IDENTICAL CENSUS — P4 is comparing constants');
}

// ---------------------------------------------------------------- P5 · the shape, per producer
/**
 * `show.mjs` randomises its seeds on every roll and there is no seam to pin them, so the shipped
 * show cannot answer `P4`. It answers something else: **within a producer the shape does not
 * depend on the deal or on the count.** Two counts each side, two independently-randomised deals
 * on the session side, and one set of per-player shapes within each.
 */
{
  const groups = ['session', 'room'].map((prod) => {
    const caps = SHIPPED.filter((c) => c.producer === prod);
    return { prod, caps, sets: caps.map((c) => [c.label, shapeSet(c)]) };
  });
  const odd = groups.flatMap((g) => g.sets.filter(([, s]) => s !== g.sets[0][1]).map(([l, s]) => `${l} is ${s} where ${g.sets[0][0]} is ${g.sets[0][1]}`));
  t('P5 · within each producer, every capture has the same set of per-player shapes',
    groups.every((g) => g.caps.length >= 2) && odd.length === 0,
    odd.length ? odd[0] : groups.map((g) => `${g.prod}: ${JSON.parse(g.sets[0][1]).join(' · ')}`).join('   ||   '));
  t('P5b control · the census control\'s shape set is a different set, so P5 is not a tautology',
    !!ctlCap && shapeSet(ctlCap) !== shapeSet(roomA),
    ctlCap ? `${JSON.parse(shapeSet(ctlCap)).join(' · ')} on the control` : 'the control never ran');
  ctlCensus.rm();
}

// ---------------------------------------------------------------- P6 · the readings, on the wire
{
  const sessions = SHIPPED.filter((c) => c.producer === 'session');
  const bad = [];
  for (const c of sessions) {
    const want = new Set(informedSeats(c).map((s) => s.id));
    for (const p of c.phones) {
      const n = p.events.filter((e) => e.type === 'reading.taken').length;
      if (want.has(p.playerId) && n !== c.episodes) bad.push(`${c.label} ${p.playerId} believes it holds an informing card and got ${n} readings across ${c.episodes} episodes`);
      if (!want.has(p.playerId) && n !== 0) bad.push(`${c.label} ${p.playerId} holds no informing card and got ${n} readings`);
    }
  }
  const holders = sessions.map((c) => `${c.label} ${informedSeats(c).map((s) => `${s.id}${s.cover ? ` (${s.role} wearing ${s.cover})` : ''}`).join(' + ')}`);
  t('P6 · a reading reaches every phone that BELIEVES it holds the card, once an episode, and no other phone ever',
    bad.length === 0 && sessions.every((c) => informedSeats(c).length > 0),
    bad.length ? bad[0] : holders.join(' · '));
}

// ---------------------------------------------------------------- P6b · the poisoned dossier
/**
 * 🚨 **THE FIRST TIME TWO PHONES IN THIS GAME HOLD CONTRADICTORY PRIVATE FACTS.** When the Glitched
 * is dealt a Continuity cover, two players believe they are Continuity, both are handed a reading
 * every episode, and neither is told anything is wrong. `falsify('boolean', truth)` returns
 * `!truth`, so the poisoned dossier is not merely unreliable — **it is the exact inverse of the
 * true one, on every single episode.** That is the asset the Debrief never had: two people can
 * state opposite facts, both honestly, and the table has to work out which card is lying to whom.
 */
const fixtureCap = (FIXTURE && fixture.applied)
  ? await captureShow(await fixture.load('net/party/show.mjs'), PORT.fixture, 'fix', 8)
  : null;
{
  const ok = !!fixtureCap && armed(fixtureCap) === null;
  const seats = fixtureCap ? informedSeats(fixtureCap) : [];
  t('P6b arm · a fixture-selected show dealt two Continuity believers, and only the seed was pinned',
    !!FIXTURE && fixture.applied && fixture.onlyEdits && ok && seats.length === 2,
    !FIXTURE ? 'no seed in 500 deals two believers — cast.js has changed'
      : `castSeed ${FIXTURE.seed} · ${seats.map((s) => `${s.id}=${s.role}${s.cover ? `/${s.cover}` : ''}`).join(' ')} · reversing the one edit reproduces show.mjs byte for byte`);

  const dossiers = seats.map((s) => ({ id: s.id, glitched: s.role === 'glitched', rows: dossier(fixtureCap, s.id) }));
  const inverse = dossiers.length === 2
    && dossiers[0].rows.length > 0
    && dossiers[0].rows.length === dossiers[1].rows.length
    && dossiers[0].rows.every((r, i) => r.episode === dossiers[1].rows[i].episode && r.value === !dossiers[1].rows[i].value);
  t('P6b · the two dossiers are the exact inverse of one another, on every episode',
    inverse,
    dossiers.length === 2
      ? dossiers.map((d) => `${d.id}${d.glitched ? ' (poisoned)' : ' (true)'} ${d.rows.map((r) => `e${r.episode}:${r.value}`).join(' ')}`).join('   vs   ')
      : `${dossiers.length} dossier(s) — nothing to compare`);
}

// ---------------------------------------------------------------- P6c · the falsify control
{
  const twoHaveRead = (phones) => phones.filter((p) => p.events().some((e) => e.type === 'reading.taken')).length >= 2;
  const cap = (FIXTURE && ctlFalsify.applied)
    ? await captureShow(await ctlFalsify.load('net/party/show.mjs'), PORT.ctlFalsify, 'ctq', 8, { stopWhen: twoHaveRead })
    : null;
  const seats = cap ? informedSeats(cap) : [];
  const rows = seats.map((s) => dossier(cap, s.id));
  const agree = rows.length === 2 && rows[0].length > 0 && rows[0].length === rows[1].length
    && rows[0].every((r, i) => r.value === rows[1][i].value);
  const inverse = rows.length === 2 && rows[0].length > 0
    && rows[0].every((r, i) => rows[1][i] && r.value === !rows[1][i].value);
  t('P6c control arm · the same fixture deal, `falsify` neutered, and both believers still read',
    ctlFalsify.applied && ctlFalsify.onlyEdits && rows.length === 2 && rows.every((r) => r.length > 0),
    ctlFalsify.missed.length ? `edits missed: ${ctlFalsify.missed.join(' · ')}`
      : `${seats.map((s) => s.id).join(' + ')} · ${rows.map((r) => r.length).join('/')} readings — the drive stops at the first announced pair, which is where this control has its answer`);
  t('P6c control · with `falsify` returning the truth the dossiers AGREE, and the inverse test says so',
    agree && !inverse,
    rows.length === 2 ? `${rows.map((r) => r.map((x) => `e${x.episode}:${x.value}`).join(' ')).join('   vs   ')} — ${agree ? 'identical' : 'not identical'}, inverse-detector says ${inverse}`
      : 'no control dossiers');
  ctlFalsify.rm();
  fixture.rm();
}

// ---------------------------------------------------------------- P7 · the ceiling is the deal's
/**
 * 🚨 **THE CEILING IS A PROPERTY OF `cast.js`, NOT OF THE FOUR GAMES WE HAPPENED TO CAPTURE.**
 * Card + Panel + five readings would be 7. It cannot happen: `viewFor` returns `cover ?? role`,
 * only the Glitched carries a cover, `SCRIPT.glitched.alignment` is GOOD, and every informing card
 * in `SCRIPT` is GOOD — so no member of Production can ever believe they hold one. This walks the
 * shipped dealer rather than reasoning about it.
 */
{
  const COUNTS = [4, 5, 6, 7, 8];
  const SEEDS = 400;
  const overlapFor = (roleIds) => {
    let games = 0, hits = 0, maxPrivate = 0, example = null;
    for (const count of COUNTS) {
      for (let seed = 1; seed <= SEEDS; seed++) {
        const deal = dealCast({ count, castSeed: seed });
        games += 1;
        for (const s of deal.seats) {
          const bel = viewFor(deal, s.id).you.role;
          const informed = roleIds.includes(bel);
          const priv = 1 + (s.alignment === EVIL ? 1 : 0) + (informed ? EPISODE_CAP : 0);
          if (priv > maxPrivate) maxPrivate = priv;
          if (informed && s.alignment === EVIL) { hits += 1; example = example || `${count}p seed ${seed}: ${s.id} is ${s.role}/${bel}`; }
        }
      }
    }
    return { games, hits, maxPrivate, example };
  };
  const real = overlapFor(FIRING.session);
  t(`P7 · over ${real.games} deals across counts ${COUNTS[0]}-${COUNTS[COUNTS.length - 1]}, no member of Production ever believes it holds a firing card`,
    real.hits === 0 && real.maxPrivate === BAND.session.ceil,
    real.hits ? `${real.hits} overlaps — ${real.example} — the session ceiling is ${real.maxPrivate}, not ${BAND.session.ceil}`
      : `max private per player is ${real.maxPrivate}, which is the band's ceiling · 1 card + ${EPISODE_CAP} readings, and 7 is unreachable`);
  const bogus = overlapFor(['producer']);
  t('P7 control · the same overlap scan, asked about `producer`, finds one in every game',
    bogus.hits >= bogus.games,
    bogus.hits ? `${bogus.hits} overlaps in ${bogus.games} deals — ${bogus.example}` : 'THE SCAN FOUND NOTHING — P7 is not looking');
}

/**
 * `P7` is the evidence; this is the cause. The sweep can only ever say *"it did not happen in 2000
 * deals"*; `SCRIPT` says why it cannot. If an EVIL informing card is ever written, this names the
 * row that did it rather than leaving a reader to infer it from a changed maximum.
 */
{
  const good = (r) => SCRIPT[r] && SCRIPT[r].alignment === 'good';
  const badInformer = informers().find((r) => !good(r));
  t('P7b · and the reason: every informing card in SCRIPT is GOOD, and so is the only card with a cover',
    !badInformer && good('glitched'),
    badInformer ? `${badInformer} informs and is ${SCRIPT[badInformer].alignment} — card + Panel + readings is now reachable`
      : `${informers().join(', ')} all good · glitched good · only the Glitched carries a cover (cast.js), so no Production member can believe it holds one`);
  t('P7b control · the same predicate is not simply true of every card',
    !good('producer') && !good('fixer'),
    'the Producer and the Fixer are EVIL, so P7b is reading alignment rather than returning true');
}

// ---------------------------------------------------------------- P8 · which room the deploy runs
/**
 * A RECORD, NOT A VERDICT. It passes whichever module `net/party/server.js` names, because
 * choosing between them is a much larger decision than this gate — see this file's header. What it
 * refuses is silence: the band that applies to the deploy target is printed next to the two bands
 * every run, so nobody reads `BAND.session` and assumes it is what ships.
 */
{
  const roomOf = (rel) => {
    const text = src(rel);
    const hits = ['createSession', 'createRoom'].filter((n) => new RegExp(`import\\s*\\{[^}]*\\b${n}\\b[^}]*\\}\\s*from`).test(text));
    return hits.length === 1 ? hits[0] : null;
  };
  const deploy = roomOf('net/party/server.js');
  const band = deploy === 'createSession' ? 'session' : 'room';
  t('P8 · the D11 deploy target names exactly one room module, and this is the band that applies to it',
    deploy !== null,
    deploy === null ? 'net/party/server.js names neither createRoom nor createSession, or both — the scan cannot say what ships'
      : `net/party/server.js wraps \`${deploy}\` → BAND.${band} [${BAND[band].floor}, ${BAND[band].ceil}]`
        + (deploy === 'createRoom'
          ? ' · the FIXTURE: no expedition, no recap, and NO CONTINUITY READING ships on the stated deploy target'
          : ''));
  t('P8 control · the same scan tells the two servers apart, so it is reading the import and not the filename',
    roomOf('net/party/show.mjs') === 'createSession' && roomOf('net/party/local.mjs') === 'createRoom',
    `show.mjs → ${roomOf('net/party/show.mjs')} · local.mjs → ${roomOf('net/party/local.mjs')}`);
}

// Every mirror is dot-prefixed, so `gates.mjs`'s manifest audit never sees one; they are removed
// here as well as at their use sites so an interrupted run leaves no tree behind.
for (const m of [ctlCensus, ctlFrame, fixture, ctlFalsify, ctlNoFire]) m.rm();

console.log(`\nparty-private: ${pass} passed, ${fail} failed${skip ? `, ${skip} skipped` : ''}`);
process.exit(fail ? 1 : 0);
