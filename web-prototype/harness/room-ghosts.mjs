/**
 * 👻 **room-ghosts — THE ROOM STOPS GHOSTING. Nobody's night ends on somebody else's screen.**
 *
 * `docs/design/COUCH-PLAN.md` Rung 4. Four blind nights (`docs/design/CRITIC-blind-play.md`,
 * 18 episodes) ended the same way every time, and the ledger line is worth quoting because this
 * whole file is the answer to it:
 *
 *   > *"the pads promised 'The Reunion is next' — no Reunion ever reached any of the 32 pad
 *   > records. The show ghosted the whole room at the end."*
 *
 * The Reunion is the payday. Everything the night spends eight people's attention on — who was
 * lying, what the cameras were for, whether the quiet one was Production — is settled there and
 * nowhere else. A season that does not deliver it has taken three hours and paid nothing.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 WHAT THIS FILE ADDS THAT THE EXISTING SUITE COULD NOT SAY
 * ---------------------------------------------------------------------------------------------
 * `party-night` N17m–N17m3 already assert the reveal's SHAPE, and they assert it on ONE phone
 * (`p1x`), by design — its header says so: *"It sweeps the PHONE, not the TV."* That is the right
 * gate for "the reveal is a closed message with a plate per seat". It is not a gate for **"it
 * reached EVERYBODY"**, which is a different claim about a different failure: eight sockets, and
 * the blind nights lost all of them at once. One-of-nine cannot see nine-of-nine.
 *
 * So this file is `whisper-split`'s method pointed at the other end of the night: a real server,
 * one television and eight handsets, and then **every screen in the room rendered from only the
 * frames that reached it.** The Rung-3 gate proved a thing must reach exactly two people. This
 * one proves a thing must reach exactly everybody, and the two failures are mirror images.
 *
 * ---------------------------------------------------------------------------------------------
 * 🍖 AND ONE THING THAT WAS NEVER BUILT AT ALL
 * ---------------------------------------------------------------------------------------------
 * COUCH-PLAN Rung 4 names what the payday owes: *"it reaches every pad: roles, the feed count,
 * `believedTheyWere`."* Two of those three shipped. **The feed count did not exist anywhere
 * downstream of the seal.** `rrr-social-round.md` §4 holds it back from the Verdict because the
 * gauge is a deliberately lossy proxy — evil losing a partner looks exactly like evil winning —
 * and `room.js` writes it `VIS.SEALED`, `enterVerdictLive` picks fields off the fold so it cannot
 * ride out, `FANOUT_KEYS.verdict` makes a slip a gate failure, and `party-night` N17h0b watches
 * the wire. Airtight. And then nothing opened it: `reunion()` returned four beats and none of
 * them was the number, `FANOUT_KEYS.reveal` had no row for it, and no screen in the codebase
 * could print one. **"Held back until the Reunion" was half a promise** — the season sealed it on
 * episode one and the credits rolled with it still sealed.
 *
 * That half is built here (`feedCount` in `src/party/reunion.js`, `reveal.feed` on the wire, a
 * ledger line on the pad and on the Director's Cut plate) and RG3 is what proves it arrived.
 *
 * ---------------------------------------------------------------------------------------------
 * 🗣️ THE THIRD ARM, AND WHY IT GUARDS SOMETHING THAT DOES NOT EXIST YET
 * ---------------------------------------------------------------------------------------------
 * *"Cy is clean. I will say that."* — **said by Cy**, on four nights out of four. A generated line
 * that names its own speaker is not a tell the couch has to read; it is a label, and it outed the
 * evils every single night.
 *
 * ⚠️ **The shipped tree authors no talk line at all, and RG5b is the row that says so.** The only
 * writers of `chat.posted` are the `harness/_loop8/drive-*.mjs` sim puppets, which are not the
 * product — same rule as *"the server does not author claims"* (2026-08-28), one level up: a
 * claim is a player verb, and so is a sentence. So `speakerNamed` is a **fail-closed guard placed
 * before the feature**, and RG5c fires it at the real blind-play line so the needle is known to
 * move. Writing it now costs one function; writing it after the first generated line ships costs
 * a night.
 *
 * ---------------------------------------------------------------------------------------------
 * Pure node. No THREE, no DOM, no browser. Port 5351 — `whisper-split` holds 5347 and
 * `link-merge`'s crash arm holds 5343; nothing else is near.
 */

import {
  startServer, livingSeatedIds, castingBackstop, fanoutViolations,
} from '../net/party/local.mjs';
import { createRoom } from '../src/party/room.js';
import { feedCount, selfNamingLines, speakerNamed } from '../src/party/reunion.js';
import { foldWin, WIN_TARGETS } from '../src/party/win.js';
import { CAST_BACKSTOP_MS, shouldArmCastSend, livingFromPublic } from '../src/party/ballot.js';
import { readFile } from 'node:fs/promises';

const PORT = 5351;
const PHONES = 8;
const KILLED = 6;        // the handset whose socket dies mid-casting, and never comes back

let pass = 0, fail = 0;
const t = (n, c, d = '') => {
  if (c) { pass++; console.log(`  ok   ${n}${d ? ` · ${d}` : ''}`); }
  else { fail++; console.log(`  FAIL ${n}${d ? ` · ${d}` : ''}`); }
  return !!c;
};
const say = (s) => console.log(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('\nroom-ghosts — the Reunion reaches everybody, and nobody hangs the room on the way\n');

/* =============================================================================================
 * THE HANDSET. Same shape as `whisper-split`'s: every frame kept with its raw bytes, because the
 * screens are rendered from the parsed messages and the leak sweeps are run over the text. A
 * parse that quietly dropped a field would hide a leak from the first question and not the second.
 * ============================================================================================= */
function open(url) {
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    const frames = [];
    const box = {
      ws, frames, welcome: null, dead: false,
      send: (o) => { try { ws.send(JSON.stringify(o)); } catch { /* a killed pad cannot send */ } },
      close: () => { box.dead = true; try { ws.close(); } catch { /* already gone */ } },
      of: (type) => frames.map((f) => f.msg).filter((m) => m?.t === type),
      last: (type) => box.of(type).at(-1) ?? null,
      raw: () => frames.map((f) => f.raw).join('\n'),
    };
    ws.onmessage = (e) => {
      const raw = String(e.data);
      let msg = null; try { msg = JSON.parse(raw); } catch { /* keep the bytes anyway */ }
      frames.push({ at: Date.now(), raw, msg });
      if (msg && (msg.t === 'welcome' || msg.t === 'full')) { box.welcome = msg; resolve(box); }
    };
    ws.onerror = () => resolve(box);
    setTimeout(() => resolve(box), 1500);
  });
}

/* =============================================================================================
 * THE SCREENS. Both are the SHIPPED chrome's own logic, transcribed only where a template
 * literal cannot be imported — and the two ledger lines are deliberately built the same way the
 * two views build them, from the same `reveal.feed`, so a disagreement between the couch and the
 * handsets would show up here as two different strings rather than as nothing.
 * ============================================================================================= */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const bar = (n, of) => (of == null ? String(n) : `${n} of ${of}`);

/** `paintReunion`'s ledger line — outside the `mine` guard, so a seatless pad prints it too. */
function padLedger(feed) {
  if (!feed) return '';
  return `The house ledger, unsealed: ${bar(feed.fed, feed.feedTarget)} fed to the Hunter · `
    + `${bar(feed.camerasLit, feed.cameraTarget)} cameras lit.`;
}

/** `reunionCentre`'s cut plate — the television's half of the same number. */
function tvLedger(feed) {
  if (!feed) return '';
  return `Unsealed: ${bar(feed.fed, feed.feedTarget)} fed to the Hunter · `
    + `${bar(feed.camerasLit, feed.cameraTarget)} cameras lit`;
}

/** `paintReunion`'s personal card, for one pad, from only what that pad was sent. */
function padCard(box) {
  const reveal = box.last('reveal');
  const me = box.welcome?.playerId;
  const mine = (reveal?.seats || []).find((s) => s.id === me) || null;
  return {
    reveal,
    mine,
    ledger: padLedger(reveal?.feed),
    line: mine
      ? `${esc(mine.role)} · ${mine.alignment === 'evil' ? 'Production' : 'The cast'}`
        + (mine.believedTheyWere && mine.believedTheyWere !== mine.role
          ? ` · believed they were the ${esc(mine.believedTheyWere)}` : '')
      : '(no card)',
  };
}

/* =============================================================================================
 * 🌙 THE NIGHT. One room, driven the way a sofa drives it — the TV's own buttons, over the wire.
 * ============================================================================================= */
const srv = startServer({ port: PORT, count: 8, castSeed: 23, worldSeed: 5, code: 'ghost' });
await sleep(140);

const base = `ws://localhost:${PORT}/?room=ghost`;
const tv = await open(`${base}&host=1`);
const phones = [];
for (let i = 0; i < PHONES; i++) phones.push(await open(base));
await sleep(120);

const NAMES = ['John', 'Ellie', 'Ada', 'Ben', 'Cy', 'Dee', 'Eli', 'Fox'];
phones.forEach((p, i) => p.send({ t: 'name', name: NAMES[i] }));
await sleep(110);

tv.send({ t: 'start' });
await sleep(90);
tv.send({ t: 'casting' });
await sleep(140);

const room = srv.rooms.get('ghost');
const names = {};
for (const p of room.game.state.players) names[p.id] = p.name;
const idOf = (n) => room.game.state.players.find((p) => p.name === n)?.id ?? null;

/* =============================================================================================
 * RG0 · THE ARM. Everything below is worthless if the night did not happen.
 * ============================================================================================= */
{
  const live = livingSeatedIds(room);
  t('RG0 arm · nine live sockets, eight of them seated handsets',
    tv.welcome != null && phones.every((p) => p.welcome?.playerId) && live.length === PHONES,
    `${live.length} seated + 1 television`);
  t('RG0b arm · the room is really in CASTING, with a deal behind it',
    room.show === 'casting' && room.game.truth().seats.length === PHONES,
    `beat=${room.show} · ${room.game.truth().seats.length} dealt`);
}

/* =============================================================================================
 * 💀 RG1 · A KILLED PHONE CANNOT HANG CASTING.
 *
 * The blind-play failure is a hang, not a crash: *"kill one phone during casting. Quote the board
 * 25 s later — red is 'PHONES ARE PICKING' forever."* Nobody sees an error; the room just stops,
 * with seven people holding a locked ballot and one dark handset on a sofa arm.
 *
 * ⚠️ **THE KILLED PHONE IS ALIVE IN THE SHOW.** That is the whole difficulty and the reason
 * `deadIdsFromPublic` cannot save you here: it reads `alive:false` and `player.executed` /
 * `player.taken`, and a dropped socket is NONE of those. The player is still in the cast, still
 * owed a ballot, and will never send one — so "wait for every living phone" waits forever, and
 * the only thing between the room and a dead evening is the backstop.
 *
 * Both halves are fired: the TV's `shouldArmCastSend` (chrome, `CAST_BACKSTOP_MS`) and the
 * server's `castingBackstop` (the one that actually resolves the beat — called directly, as its
 * own header invites, so this gate does not sit through 45 seconds).
 * ============================================================================================= */
const killedId = phones[KILLED].welcome?.playerId;
{
  phones[KILLED].close();
  await sleep(160);

  const firstAt = Date.now();
  phones.forEach((p, i) => {
    if (i === KILLED) return;
    p.send({ t: 'ballot', runner: idOf('Ada'), guide: idOf('Ben') });
  });
  await sleep(200);

  const living = livingSeatedIds(room);
  const votes = [...room.ballots.values()];

  /*
   * ⚠️ The second and third clauses are the difficulty stated as an assertion. The socket is gone
   * from `room.conns`, and the player is STILL in `livingSeatedIds` and STILL in the public
   * living list — `deadIdsFromPublic` reads `alive:false` / `player.executed` / `player.taken`
   * and a dropped socket is none of those. So "wait for every living phone" is not slow here, it
   * is unsatisfiable, and the backstop is the only thing left.
   */
  const publicLiving = livingFromPublic({
    ids: living, players: room.game.state.players, events: room.game.log.all(),
  });
  t('RG1 arm · the killed pad is gone from the room, and still ALIVE in the show',
    !room.conns.has(phones[KILLED].welcome?.id ?? '')
      && living.includes(killedId)
      && publicLiving.includes(killedId),
    `${names[killedId]} · socket gone · still counted living`);

  t('RG1b · seven of eight ballots are in, and the eighth never will be',
    votes.length === PHONES - 1 && !votes.some((v) => v.voter === killedId),
    `${votes.length}/${PHONES} ballots · missing ${names[killedId]}`);

  /*
   * The TV's own chrome, asked at two clock readings. The FIRST is the row that matters: a rule
   * of "everybody living has voted" is not merely slow here, it is never satisfiable, so without
   * the backstop the answer at every future instant is the same `false`.
   */
  const armNow = shouldArmCastSend({ livingIds: living, votes, firstBallotAt: firstAt, now: firstAt + 1 });
  const armLater = shouldArmCastSend({
    livingIds: living, votes, firstBallotAt: firstAt, now: firstAt + CAST_BACKSTOP_MS,
  });
  t('RG1c · the 3·2·1 does not arm on seven of eight the instant they land — the eighth is alive',
    armNow === false, 'arm at +1ms = false');
  t('RG1d · and it DOES arm at the backstop, which is the only thing that can ever fire',
    armLater === true, `arm at +${CAST_BACKSTOP_MS}ms = true`);

  /*
   * And the server's half, which is what actually moves the room. This is the same function the
   * 45s `CASTING_BACKSTOP_MS` timer calls; firing it directly is exactly what its header says
   * gates should do.
   */
  const after = castingBackstop(room);
  await sleep(200);
  const pair = room.game.state.pair || {};
  t('RG1e · the SERVER leaves casting with a real pair, seven ballots and one dark handset',
    after !== 'casting' && room.show !== 'casting'
      && pair.runner != null && pair.guide != null && pair.runner !== pair.guide,
    `beat=${room.show} · runner ${names[pair.runner] ?? '—'} · guide ${names[pair.guide] ?? '—'}`);
  t('RG1f · and the seven pads that are still holding a screen were told the room moved on',
    phones.filter((p, i) => i !== KILLED).every((p) => p.of('lobby').length > 0)
      && tv.of('lobby').length > 0,
    'lobby snapshot on every surviving screen');
}

/* =============================================================================================
 * 🎬 RG2 · THE REUNION REACHES EVERY LIVING PAD.
 *
 * The television's own two-tap control (`t:'skip'`, isTV — locked rule, `party-night` N17k). It
 * is the door a host actually uses to end a night, so it is the door this walks through.
 * ============================================================================================= */
tv.send({ t: 'skip' });
await sleep(320);

const alivePhones = phones.filter((_, i) => i !== KILLED);
const cards = alivePhones.map((p) => ({ p, c: padCard(p) }));
const tvReveal = tv.last('reveal');

say('');
say('  ── EVERY SCREEN IN THE ROOM, AFTER THE HOST ENDED THE NIGHT ─────────');
for (const { p, c } of cards) {
  say(`  PAD  ${String(names[p.welcome?.playerId] ?? '?').padEnd(6)} ${c.line}`);
}
say(`  PAD  ${String(names[killedId] ?? '?').padEnd(6)} (socket killed during casting — no screen)`);
say(`  TV          ${tvLedger(tvReveal?.feed) || '(no ledger)'}`);
say(`  LEDGER      ${cards[0]?.c.ledger || '(none)'}`);
say('  ────────────────────────────────────────────────────────────────────');
say('');

{
  const got = cards.filter(({ c }) => c.reveal != null);
  t('RG2 · EVERY pad still in the room holds the reveal — not one, not most',
    got.length === alivePhones.length && alivePhones.length === PHONES - 1,
    `${got.length}/${alivePhones.length} pads · blind nights: 0/32`);

  t('RG2b · the television has it too, and it is the same message',
    tvReveal != null && tvReveal.seats?.length === PHONES,
    `TV reveal · ${tvReveal?.seats?.length ?? 0} seats`);

  /*
   * 🚨 EVERY PAD GETS EVERY SEAT. The reveal is not a personalised sheet — the roll call turns
   * over all eight nameplates on all eight handsets, which is what makes it the payday rather
   * than eight private consolations. A per-pad reveal carrying only its own seat would satisfy
   * RG2 above and be a completely different feature.
   */
  const full = cards.length > 0 && cards.every(({ c }) => (c.reveal?.seats || []).length === PHONES
    && c.reveal.seats.every((s) => typeof s?.role === 'string' && typeof s.alignment === 'string'));
  t('RG2c · and each of them carries ALL eight plates, role and alignment on every one',
    full, `${PHONES} seats × ${got.length} pads`);

  t('RG2d · every pad can find its OWN card in the sheet it was sent',
    cards.every(({ c }) => c.mine != null),
    cards.map(({ p, c }) => `${names[p.welcome?.playerId]}=${c.mine?.role ?? '—'}`).join(' '));

  /*
   * `believedTheyWere` is the Glitched's cover, and it is the field `reunion-truth` U2 caught
   * missing once already: the role card a player held all night is the LIE, so a Reunion sheet
   * that read the card would tell them that lie one last time on the one screen whose whole job
   * is the truth. It must be present as a field on every plate — null is a fine value, absent is
   * not, because absent is how it silently stops being rendered.
   */
  const coverField = cards.length > 0 && cards.every(({ c }) => (c.reveal?.seats || []).length === PHONES
    && c.reveal.seats.every((s) => s && 'believedTheyWere' in s));
  t('RG2e · `believedTheyWere` is on every plate on every pad — the cover, not the card',
    coverField,
    `covers named: ${(tvReveal?.seats || []).filter((s) => s.believedTheyWere
      && s.believedTheyWere !== s.role).length}`);

  t('RG2f · and the reveal that arrived passes the closed fanout schema on every pad',
    cards.length > 0 && cards.every(({ c }) => c.reveal != null && fanoutViolations(c.reveal).length === 0),
    'no extra keys on any of the eight');
}

/* =============================================================================================
 * 🍖 RG3 · THE FEED COUNT, UNSEALED — the half of the promise that was never built.
 * ============================================================================================= */
{
  const feeds = cards.map(({ c }) => c.reveal?.feed ?? null);
  t('RG3 · every pad in the room is handed the feed count',
    feeds.every((f) => f && Number.isFinite(f.fed)),
    `${feeds.filter(Boolean).length}/${feeds.length} pads · fed=${feeds[0]?.fed}`);

  /*
   * ⚠️ Every row below reads through `?.` deliberately. Fired against a build with the feed row
   * removed, RG3 goes red and the next line USED to throw on `f.feedTarget` — which killed the
   * process and took RG4, RG5 and the three walls with it. A gate that stops reporting at its
   * first failure hides everything behind it, and the run that is most worth reading in full is
   * the broken one.
   */
  t('RG3b · with the bar it was judged against — the same `WIN_TARGETS` row the fold used',
    feeds.length > 0 && feeds.every((f) => f?.feedTarget === WIN_TARGETS[PHONES].feedTarget
      && f?.cameraTarget === WIN_TARGETS[PHONES].cameraTarget),
    `feed target ${WIN_TARGETS[PHONES].feedTarget} · camera target ${WIN_TARGETS[PHONES].cameraTarget}`);

  /*
   * The ledger prints for a pad with no seat too. There is no seatless pad in this room — every
   * handset was dealt in — so the claim is tested where it lives instead: the line is built from
   * `reveal.feed` alone and never touches `mine`, which is exactly why `padLedger` takes one
   * argument. A room fact behind a "did I get a card" guard is the ghosting this rung is named for.
   */
  t('RG3c · the pad ledger is a function of the ROOM fact only, so a seatless pad still gets it',
    padLedger(feeds[0]) !== '' && padLedger(null) === '',
    padLedger(feeds[0]));

  t('RG3d · and the television prints the same number — not a field with one renderer',
    tvLedger(tvReveal?.feed) !== ''
      && tvReveal?.feed?.fed === feeds[0]?.fed
      && tvReveal?.feed?.camerasLit === feeds[0]?.camerasLit,
    tvLedger(tvReveal?.feed) || '(nothing on the cut plate)');

  /*
   * 🚨 THE NUMBER IS RIGHT, NOT MERELY PRESENT. Folded independently, from the log, against the
   * same rule the season was judged by. A `feed` row that always read zero would pass every check
   * above it — and on a Hunter-off build it would read zero for the RIGHT answer, which is
   * precisely the shape of bug that survives a whole suite. RG4 below is the row that moves it.
   */
  const truth = foldWin(room.game.log.all(), {
    count: PHONES,
    alignmentOf: (id) => room.game.truth().seats.find((s) => s.id === id)?.alignment,
    aired: room.game.state.airingEpisode ?? room.game.state.episode,
  });
  t('RG3e · and it agrees with an independent fold of the same log',
    feeds[0] != null && feeds[0].fed === truth.fed && feeds[0].camerasLit === truth.camerasLit,
    `reveal fed=${feeds[0]?.fed} lit=${feeds[0]?.camerasLit} · fold fed=${truth.fed} lit=${truth.camerasLit}`);
}

/* =============================================================================================
 * 🔢 RG4 · THE NEEDLE MOVES. A season where the Hunter really was fed.
 *
 * Every count above is honest and every one of them is ZERO — the Hunter is off in this build, so
 * nothing feeds it, and a `feed` row hard-coded to `{fed: 0}` would have passed all of RG3. This
 * is the control: an offline room driven with `takeRunner`, where the true count is not zero, and
 * the Reunion's number has somewhere to be wrong.
 * ============================================================================================= */
{
  const off = createRoom({ count: 8, castSeed: 41, worldSeed: 2, send: () => {} });
  off.start();
  off.dealRoles();
  const align = Object.fromEntries(off.truth().seats.map((s) => [s.id, s.alignment]));
  let episodes = 0;
  for (let i = 0; i < 4; i++) { off.playEpisode({ takeRunner: true }); episodes++; }
  const log = off.log.all();
  const fold = foldWin(log, { count: 8, alignmentOf: (id) => align[id], aired: episodes });
  const special = off.reunionSpecial();

  t('RG4 arm · an offline season where the Hunter really took people',
    log.filter((e) => e.type === 'player.taken').length > 0,
    `${log.filter((e) => e.type === 'player.taken').length} taken over ${episodes} episodes`);

  t('RG4b · the Reunion reports a NON-ZERO feed count, and it is the fold\'s own number',
    special.feed != null && special.feed.fed > 0 && special.feed.fed === fold.fed,
    `reunion fed=${special.feed?.fed} · fold fed=${fold.fed}`);

  t('RG4c · the target beside it is the row the season was judged against',
    special.feed.feedTarget === WIN_TARGETS[8].feedTarget,
    `${special.feed.fed} of ${special.feed.feedTarget} fed`);

  /*
   * A log with no verdict in it has no feed count, and `feedCount` says so rather than saying
   * zero. Zero is a claim about a season that finished; null is the truth about one that did not.
   */
  const fresh = createRoom({ count: 8, castSeed: 9, worldSeed: 1, send: () => {} });
  fresh.start();
  fresh.dealRoles();
  t('RG4d control · a season that never reached a verdict reports NULL, not a confident zero',
    feedCount(fresh.log.all(), WIN_TARGETS[8]) === null,
    'no win.checked in the log');
}

/* =============================================================================================
 * 🗣️ RG5 · NO GENERATED LINE NAMES ITS OWN SPEAKER.
 * ============================================================================================= */
{
  const chat = tvReveal?.chat || [];
  const offenders = selfNamingLines(chat, (id) => names[id]);
  t('RG5 · nothing the show wrote this season named its own speaker',
    offenders.length === 0,
    `${chat.length} lines on the record · ${offenders.length} named themselves`);

  /*
   * 🚨 **THE HONEST ROW.** The count above is zero partly because the count of generated lines is
   * zero: nothing in `src/` or `net/` emits `chat.posted`, and the only writers in the tree are
   * the `_loop8` sim drivers. Saying that out loud is the difference between a gate that passes
   * and a gate that is understood — an unstated zero-of-zero reads as coverage it does not have.
   */
  const srcs = await Promise.all(['../src/party/room.js', '../net/party/local.mjs']
    .map((f) => readFile(new URL(f, import.meta.url), 'utf8')));
  t('RG5b · and the reason is that the SHIPPED tree authors no talk line at all',
    !srcs.some((s) => /record\(\s*makeEvent\(\s*'chat\.posted'/.test(s))
      && chat.filter((c) => c.generated).length === 0,
    'no `chat.posted` emitter in src/ or net/ — the guard lands before the feature');

  /*
   * The needle. Fired at the real sentence from the blind nights, and at the four ways it could
   * be got wrong: a substring inside a longer name, a substring inside an ordinary word, a
   * different speaker, and a HUMAN saying their own name — which is a bluff, not a bug, and
   * banning it would be the show editing a player.
   */
  const CY = 'Cy is clean. I will say that. I would rather be wrong about Cy than sit on Ada.';
  t('RG5c control · the guard fires on the exact line that outed the evils four nights running',
    speakerNamed(CY, 'Cy') === true, `"${CY.slice(0, 28)}…" said by Cy`);
  t('RG5c2 control · and not on a name that merely CONTAINS the speaker\'s',
    speakerNamed('Cynthia is clean.', 'Cy') === false
      && speakerNamed('I doubt the accuracy of that.', 'Cy') === false,
    'Cynthia · accuracy — both clean');
  /*
   * ⚠️ The speaker here is Dee, not Ada — the real line ENDS on Ada ("…than sit on Ada"), so
   * asking it about Ada is a true hit and would have made this control assert the opposite of
   * what it reads. Caught by the row going red on the first run, which is the argument for
   * writing the controls at all.
   */
  t('RG5c3 control · and not when somebody else says it',
    speakerNamed(CY, 'Dee') === false, 'Dee may quote Cy all night');
  t('RG5c4 · a HUMAN naming themselves is a bluff, not a bug — `generated` is the filter',
    selfNamingLines([{ seq: 1, author: 'p1', text: CY, generated: false }], () => 'Cy').length === 0
      && selfNamingLines([{ seq: 1, author: 'p1', text: CY, generated: true }], () => 'Cy').length === 1,
    'typed = allowed · generated = refused');
}

/* =============================================================================================
 * 🧱 RG6 · THE WALLS. The seal ran the whole season; opening one end must not open the other.
 * ============================================================================================= */
{
  /*
   * The Verdict is the beat this number spent the season hiding from, and this is the direction
   * that would end the social game: the feed gauge tells apart the two cases the whole design
   * works to keep identical.
   *
   * ⚠️ **FIRED AT THE SCHEMA, NOT SWEPT OVER THIS ROOM'S FRAMES.** The host ended this night with
   * SKIP TO REUNION, so no `enterVerdictLive` ran and there are zero verdict frames to sweep — a
   * sweep here would return "0 offenders" out of 0 and read exactly like coverage. The real
   * question is whether the wall still stands now that the other end is open, so the wall is
   * pushed on directly, with a verdict payload carrying both leaks.
   */
  const verdictSwept = cards.flatMap(({ p }) => p.of('verdict')).concat(tv.of('verdict'));
  const leakyVerdict = {
    t: 'verdict', status: 'CANCELLED', camerasLit: 0, need: 4, episode: 1,
    fed: 3, rule: 'W3',
  };
  const vBad = fanoutViolations(leakyVerdict);
  t('RG6 · the Verdict\'s wall still refuses BOTH the number and the rule that spells it out',
    vBad.includes('verdict.fed') && vBad.includes('verdict.rule')
      && verdictSwept.every((v) => !('fed' in v)),
    `${vBad.join(', ')} · (${verdictSwept.length} live verdict frames this night)`);

  /*
   * And nothing before the reveal, on any pad, in any frame. Written against the TRANSCRIPT in
   * order rather than against the server's intent — the same method as `party-night` N17m, for
   * the same reason: a `feed` sent one beat early passes every schema check in the file.
   */
  let early = 0;
  for (const p of alivePhones) {
    let seen = false;
    for (const f of p.frames) {
      if (f.msg?.t === 'reveal') { seen = true; continue; }
      if (!seen && f.raw.includes('"fed"')) early++;
    }
  }
  t('RG6b · and no frame on any pad mentioned it before the reveal arrived',
    early === 0, `${early} early mentions across ${alivePhones.length} transcripts`);

  /*
   * The closed schema, fired in the failing direction. `win.checked` carries `outcome` and `rule`
   * beside the number, and `rule` is the feed count wearing a costume — W3 IS "evil fed the Hunter
   * enough goods". A future "we already have the fold, just spread it" has to fail HERE.
   */
  const leaky = { ...(tvReveal || {}), t: 'reveal', feed: { ...(tvReveal?.feed || {}), rule: 'W3' } };
  t('RG6c · a `rule` smuggled onto the feed row is refused by the closed schema',
    fanoutViolations(leaky).some((b) => b.includes('reveal.feed')),
    fanoutViolations(leaky).join(', '));
  t('RG6d control · the shipped reveal itself is clean through the same validator',
    tvReveal != null && fanoutViolations(tvReveal).length === 0, 'no violations');
}

/* ------------------------------------------------------------------------------------ down */
tv.close();
for (const p of phones) p.close();
await sleep(120);
srv.close?.();

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
