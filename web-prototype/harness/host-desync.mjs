#!/usr/bin/env node
/**
 * 📺 **host-desync — A BEAT THE TELEVISION PAINTED ITSELF IS A CLAIM, AND SOMETHING HAS TO CHECK IT.**
 *
 *   node harness/host-desync.mjs
 *
 * ---------------------------------------------------------------------------------------------
 * 🩸 THE BUG THIS FILE IS THE MEMORY OF
 * ---------------------------------------------------------------------------------------------
 * `PRIME-TIME-STATE.md` §4 lists three TV/phone desync risks and closes the document by calling
 * this one *"the most likely to bite in a real session"*. It had been open since the 2026-08-25
 * audit with nothing guarding it:
 *
 *   > **Optimistic host beats.** `party-host.js` sets `ui.beat` locally before the server fans
 *   > out. If `t:'episode'` early-returns, the TV sits on *expedition* with `ui.locked=true`
 *   > while every phone stays on *casting*, with no recovery path.
 *
 * The server's refusal is SILENT — `net/party/local.mjs`, `if (!votes.length) return;`. No
 * `show`, no error, no fanout of any kind. Driven here against a real server and real sockets:
 *
 *     THE TELEVISION SAYS : EXPEDITION   (locked)
 *     EVERY PHONE WAS TOLD: CASTING
 *     THE SERVER IS IN    : casting
 *     fanouts to the TV after the send: 0
 *
 * And the second half, which the audit did not name and which is worse than it looks:
 * **`ui.locked` was assigned in exactly one place and cleared in NONE.** So even a television
 * that recovers its BEAT from a later fanout never recovers its LOCK: `armSendCountdown` and
 * `maybeArmFromBackstop` both bail on `ui.locked`, so after the first pair of the night the
 * 3·2·1 can never arm again and every later casting round waits out the server's 45s backstop.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚪 THREE DOORS, ONE SCREEN — and why the fix is not keyed to the refusal
 * ---------------------------------------------------------------------------------------------
 * The refusal reason is not the invariant. Everything that leaves the television's `t:'episode'`
 * unanswered produces the identical screen:
 *
 *   1. **The server refuses.** `validCastBallots` is empty and the handler returns. H1.
 *   2. **The send never leaves.** `PartyNightClient.send` is `if (this.ws?.readyState === 1)` and
 *      a silent no-op otherwise — a wifi blip under the thumb is a beat painted for a message
 *      nobody sent. H5, and it needs no server co-operation at all.
 *   3. **The handler throws.** Every client message runs inside a `try/catch` that logs
 *      `dropped a message` and carries on, by design (a malformed `whisper` used to kill the
 *      process). A throw inside `runEpisodeFromBallots` is door 1 with a different cause.
 *
 * Door 1's own reachability is worth writing down, because it is structural rather than
 * hypothetical: the ballot list the TELEVISION gates on is fanned unfiltered —
 * `{t:'ballots', votes:[...room.ballots.values()]}` — while the list the server DECIDES on is
 * `validCastBallots`, the same map filtered by `seatedPlayerIds`. Two lists, two rules, and no
 * message on the wire when they disagree. H4 measures that gap live. Today the only generator
 * for it is a seat that stops being taken, which the server does not yet do (`local.mjs`'s
 * "ghost pair" comment says it should) — so door 1 is one line away while doors 2 and 3 are
 * live now. All three land on the same television, and the fix is common to them.
 *
 * ---------------------------------------------------------------------------------------------
 * ⚠️ WHAT THE NAIVE FIXES BREAK — the `show-beat` lesson, applied again
 * ---------------------------------------------------------------------------------------------
 * "Never paint a beat before the server answers" is the obvious fix and it is the wrong one: it
 * spends a whole round trip on the 3·2·1, which is the one cut of the night the room is actually
 * looking at the screen, and it makes every beat change on the TV hostage to the slowest socket.
 *
 * "The TV's beat must equal the server's phase" is wrong outright — `playEpisode` runs the whole
 * offline episode ahead of the room, so `state.phase` legitimately reads VERDICT during a live
 * expedition (`PRIME-TIME-STATE.md` §4, `show-beat`'s header). The beat and the phase are not a
 * mirror, and any invariant that assumes they are is false before it is written.
 *
 * What ships is narrower and it is about TIME rather than content — `resolveBeatClaim` in
 * `src/views/party-host.js`:
 *
 *   **A locally-set beat is provisional for `BEAT_CLAIM_MS`. Past that, the only beat this
 *   television may show is the last one the SERVER named** (`client.beat`, written from
 *   `t:'show'` and from nothing else), and `ui.locked` ends when the server names a beat a pair
 *   is cast from.
 *
 * The cost, stated so nobody has to rediscover it: a fanout slower than `BEAT_CLAIM_MS` buys one
 * wrong repaint before the next `show` corrects it, and a room that keeps refusing keeps
 * re-arming the countdown (~7s a try) instead of hanging. Both beat a locked screen.
 *
 * ---------------------------------------------------------------------------------------------
 * 🧮 DERIVED, NOT TABULATED
 * ---------------------------------------------------------------------------------------------
 *   · the recovery window this file waits is `BEAT_CLAIM_MS` imported from the view — retune the
 *     constant and the gate retunes with it.
 *   · the roll-back TARGET is never spelled here: every row compares the television against
 *     `client.beat` / `room.show` / what the phones were told, read live off the wire.
 *   · `UNLOCK_ON_BEATS` is asserted to be real `show.js` beats (H4c), so a renamed beat reddens
 *     rather than silently killing the countdown for a whole night.
 *   · H8 binds the television stand-in below to the shipped file: if `party-host.js` stops
 *     routing its optimistic beats through `claimBeat`/`settleBeatClaim`, the behavioural rows
 *     would keep passing against a function nothing calls. That row is the only string test here.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 A GATE WHOSE CONTROLS STOP FAILING HAS GONE BLIND
 * ---------------------------------------------------------------------------------------------
 * `party-isolation` reported 20 passed / 0 failed — all four blindness controls included — while
 * leaking the Glitched to every phone. So this file runs TWO ARMS against two live rooms on one
 * server, judged by the SAME `measure()`: the shipped television, and a CONTROL television that
 * restores the optimism exactly as it was (paint the beat, set the lock, never reconcile).
 * H9 requires the shipped rows to be GREEN and the control's to be RED. H6 is the control's own
 * precondition — it asserts the control really did reproduce the split — so a control that stops
 * reproducing the bug reddens instead of quietly becoming a second shipped arm.
 *
 * ---------------------------------------------------------------------------------------------
 * ⚠️ THE VACUOUS PASS
 * ---------------------------------------------------------------------------------------------
 * "The TV and the phones agree" is trivially true of a room nobody joined, a beat change nobody
 * attempted, and a refusal that never happened. H0 is the ground truth and it is asserted as
 * COUNTS — handsets holding a playerId, seats the server sees, phones told the beat — and H1
 * asserts the refusal ITSELF fired: the room did not move, no pair was locked, no episode was
 * played, and ZERO messages came back. H1a is the liveness probe that stops that zero being
 * read as a dead socket: the same socket, in the same room, is shown to produce a fanout
 * moments before the fault.
 */

import { readFile } from 'node:fs/promises';
import { startServer, enterBeatLive, seatedPlayerIds, livingSeatedIds } from '../net/party/local.mjs';
import { PartyNightClient } from '../src/party/night-client.js';
import { SHOW_BEATS } from '../src/party/show.js';
import { BEAT_CLAIM_MS, UNLOCK_ON_BEATS, resolveBeatClaim } from '../src/views/party-host.js';
import { PAIR_LOCK_MS } from '../src/game/pair-lock-stage.js';

const PORT = 5207;
const PHONES = 5;
let pass = 0, fail = 0;
const t = (n, c, d = '') => {
  if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); }
  else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); }
  return !!c;
};
const say = (s) => console.log(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A handset. Raw socket, so nothing on the phone side is under test here. */
function openPhone(url) {
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    const msgs = [];
    const box = {
      ws, msgs, welcome: null,
      send: (o) => ws.send(JSON.stringify(o)),
      close: () => ws.close(),
      get toldBeat() { return [...msgs].reverse().find((m) => m.t === 'show')?.beat ?? null; },
    };
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      msgs.push(m);
      if (m.t === 'welcome' || m.t === 'full') { box.welcome = m; resolve(box); }
    };
    ws.onerror = () => resolve(box);
    setTimeout(() => resolve(box), 1500);
  });
}

/**
 * 📺 THE TELEVISION. The real `PartyNightClient` on a real socket, plus the shipped host's beat
 * bookkeeping: `claimBeat` on every locally-set beat, `settleBeatClaim` on every `show` message
 * and on the clock. `recover:false` is the code as it was — paint and lock, reconcile never.
 * H8 binds this stand-in to `party-host.js` so the two cannot drift.
 */
async function television(url, { recover }) {
  const ui = { beat: 'lobby', locked: false, claim: null, sendArmed: false, sendUntil: 0, firstBallotAt: 0, sendoff: false };
  let fanouts = 0;
  const settle = () => {
    if (!recover) return false;
    const r = resolveBeatClaim({ claim: ui.claim, beat: ui.beat, serverBeat: client.beat, locked: ui.locked });
    const changed = r.beat !== ui.beat || r.locked !== ui.locked;
    ui.beat = r.beat; ui.claim = r.claim; ui.locked = r.locked;
    if (r.rolledBack) { ui.sendArmed = false; ui.sendUntil = 0; ui.firstBallotAt = 0; }
    return changed;
  };
  const client = new PartyNightClient({
    url,
    onMessage: (m) => {
      if (m.t === 'show' && m.beat) {
        fanouts++;
        ui.beat = m.beat;
        if (m.beat === 'expedition') ui.sendoff = false;
        settle();
      }
    },
  });
  await client.connect();
  const timer = setInterval(settle, 60);
  timer.unref?.();
  return {
    ui, client,
    get fanouts() { return fanouts; },
    claimBeat(beat) {
      ui.beat = beat;
      if (recover) ui.claim = { beat, until: Date.now() + BEAT_CLAIM_MS };
    },
    /** The shipped `sendThemIn`: lock the pair, stay on Casting for the sendoff. */
    sendThemIn() {
      if (ui.locked || ui.sendoff) return false;
      if (!(client.ballots || []).length) return false;
      ui.sendoff = true;
      client.send({ t: 'episode', opts: {} });
      this.claimBeat('casting');
      return true;
    },
    close() { clearInterval(timer); client.close(); },
  };
}

const srv = startServer({ port: PORT, count: 8, castSeed: 21, worldSeed: 3, code: 'hd' });
await sleep(120);

/** A live room: one television, `PHONES` handsets, cast dealt, sitting on CASTING. */
async function liveRoom(code, { recover }) {
  const base = `ws://localhost:${PORT}/?room=${code}`;
  const tv = await television(`${base}&host=1`, { recover });
  const phones = [];
  for (let i = 0; i < PHONES; i++) phones.push(await openPhone(base));
  await sleep(90);
  tv.client.send({ t: 'start' });
  await sleep(50);
  tv.client.send({ t: 'casting' });
  await sleep(90);
  return {
    room: srv.rooms.get(code), tv, phones,
    close: () => { tv.close(); for (const p of phones) p.close(); },
  };
}

/** The ONE reading both arms are judged by. Facts, never verdicts. */
function measure(r) {
  return {
    tvBeat: r.tv.ui.beat,
    tvLocked: r.tv.ui.locked,
    serverBeat: r.room.show,
    toldServer: r.tv.client.beat,
    phonesTold: r.phones.map((p) => p.toldBeat),
    agreeing: r.phones.filter((p) => p.toldBeat === r.tv.ui.beat).length,
    pair: r.room.game.state.pair?.runner || null,
    episode: r.room.game.state.episode,
  };
}

/** Every living handset votes for the same pair, the way a herding table does. */
async function ballotAll(r) {
  const ids = r.phones.map((p) => p.welcome.playerId);
  for (const p of r.phones) p.send({ t: 'ballot', runner: ids[0], guide: ids[1] });
  await sleep(140);
  return ids;
}

/** The fault, once, with the beat painted exactly as `sendThemIn` paints it. */
async function refuseEpisode(r) {
  const before = r.tv.fanouts;
  r.tv.ui.locked = true;
  r.tv.client.send({ t: 'episode', opts: {} });
  r.tv.claimBeat('expedition');
  await sleep(160);
  return { fanoutsAfter: r.tv.fanouts - before };
}

// ================================================================= H0 · ground truth, as counts
const A = await liveRoom('hd-ship', { recover: true });
{
  const joined = A.phones.filter((p) => p.welcome?.playerId).length;
  const seated = seatedPlayerIds(A.room).length;
  const living = livingSeatedIds(A.room).length;
  const told = A.phones.filter((p) => p.toldBeat === 'casting').length;
  t(`H0 · ground truth — ${PHONES} handsets hold a playerId, the server seats them, the TV holds the TV seat`,
    joined === PHONES && seated >= PHONES && living >= PHONES && A.tv.client.welcome?.isTV === true,
    `joined ${joined}/${PHONES} · seated ${seated} · living ${living} · tv ${A.tv.client.welcome?.isTV}`);
  t(`H0b · and all ${PHONES} phones were told CASTING before anything is attempted`,
    A.room.show === 'casting' && told === PHONES && A.tv.ui.beat === 'casting' && A.tv.client.beat === 'casting',
    `room ${A.room.show} · phones told casting ${told}/${PHONES} · tv ${A.tv.ui.beat}`);
  t('H0c · the ballot box the refusal turns on really is empty, and the TV is not holding one either',
    A.room.ballots.size === 0 && (A.tv.client.ballots || []).length === 0,
    `server ${A.room.ballots.size} · television ${(A.tv.client.ballots || []).length}`);
}

// ============================================== H1a · the wire is alive, measured, before the fault
{
  const before = A.tv.fanouts;
  A.tv.client.send({ t: 'show', beat: 'casting' });
  await sleep(160);
  t('H1a · liveness probe — a message from THIS socket in THIS room does produce a fanout, so a zero below means refusal, not a dead wire',
    A.tv.fanouts > before,
    `show fanouts ${before} -> ${A.tv.fanouts}`);
}

// ==================================== H1 · the refusal fires, and it says absolutely nothing
const shipFault = await refuseEpisode(A);
const shipStuck = measure(A);
{
  say('');
  say(`       THE TELEVISION SAYS : ${String(shipStuck.tvBeat).toUpperCase()}${shipStuck.tvLocked ? '   (locked)' : ''}`);
  say(`       EVERY PHONE WAS TOLD: ${String(shipStuck.phonesTold[0]).toUpperCase()}`);
  say(`       THE SERVER IS IN    : ${shipStuck.serverBeat}`);
  say(`       fanouts to the TV after the send: ${shipFault.fanoutsAfter}`);
  say('');
  t("H1 · the `t:'episode'` early-return ACTUALLY FIRED — the room did not move, no pair locked, no episode played",
    shipStuck.serverBeat === 'casting' && !shipStuck.pair && shipStuck.episode === A.room.game.state.episode
      && A.room.ballots.size === 0,
    `show=${shipStuck.serverBeat} pair=${shipStuck.pair} ep=${shipStuck.episode} box=${A.room.ballots.size}`);
  t('H1b · and the refusal is SILENT — zero fanouts came back to the television that sent it',
    shipFault.fanoutsAfter === 0,
    `fanouts after the send: ${shipFault.fanoutsAfter}`);
  t(`H1c · so the split is real: the TV painted EXPEDITION and locked while all ${PHONES} phones sit on casting`,
    shipStuck.tvBeat === 'expedition' && shipStuck.tvLocked === true
      && shipStuck.phonesTold.filter((b) => b === 'casting').length === PHONES,
    `tv ${shipStuck.tvBeat}/locked=${shipStuck.tvLocked} · phones on casting ${shipStuck.phonesTold.filter((b) => b === 'casting').length}/${PHONES}`);
}

// ================================================ H2 · the shipped television comes back on its own
{
  await sleep(BEAT_CLAIM_MS + 400);
  const m = measure(A);
  t(`H2 · SHIPPED — inside BEAT_CLAIM_MS (${BEAT_CLAIM_MS}ms) the claim expires and the TV rejoins the beat the SERVER named`,
    m.tvBeat === m.toldServer && m.tvBeat === m.serverBeat && m.tvBeat === 'casting',
    `tv ${m.tvBeat} · client.beat ${m.toldServer} · room ${m.serverBeat}`);
  t(`H2b · SHIPPED — and it agrees with every one of the ${PHONES} phones again`,
    m.agreeing === PHONES,
    `agreeing ${m.agreeing}/${PHONES} · phones [${m.phonesTold.join(' ')}]`);
  t('H2c · SHIPPED — the lock is released, so the room is not one refusal away from a dead countdown',
    m.tvLocked === false && A.tv.ui.claim === null,
    `locked ${m.tvLocked} · claim ${JSON.stringify(A.tv.ui.claim)}`);
}

// ============================== H3 · recovery is not cosmetic — the night carries on afterwards
{
  await ballotAll(A);
  const held = (A.tv.client.ballots || []).length;
  const sent = A.tv.sendThemIn();
  await sleep(PAIR_LOCK_MS + 80);
  const m = measure(A);
  t(`H3 · ground truth — ${held} real ballots went in after the recovery and the television actually sent the pair`,
    held === PHONES && sent === true && A.room.ballots.size === PHONES,
    `tv held ${held} · server box ${A.room.ballots.size} · sent ${sent}`);
  t('H3b · SHIPPED — the recovered television can still start an episode: the room goes to EXPEDITION and the pair is locked',
    m.serverBeat === 'expedition' && !!m.pair && m.tvBeat === 'expedition' && m.agreeing === PHONES,
    `room ${m.serverBeat} · pair ${m.pair} · tv ${m.tvBeat} · agreeing ${m.agreeing}/${PHONES}`);
}

// =============================== H4 · the lock, and the two ballot lists that let door 1 open
{
  // Back to casting through the same door the wire uses, as the end of an episode does.
  enterBeatLive(A.room, 'casting');
  await sleep(200);
  const m = measure(A);
  t('H4 · SHIPPED — the server naming CASTING ends the lock, so the 3·2·1 can arm on every later episode',
    m.tvLocked === false && m.tvBeat === 'casting' && m.serverBeat === 'casting',
    `locked ${m.tvLocked} · tv ${m.tvBeat} · room ${m.serverBeat}`);

  // Door 1's generator, measured rather than argued: the list the TV gates on is the raw map,
  // the list the server decides on is that map filtered by `seatedPlayerIds`.
  const B = await liveRoom('hd-lists', { recover: true });
  const ids = await ballotAll(B);
  const tvHeld = (B.tv.client.ballots || []).length;
  const beforeFanouts = B.tv.fanouts;
  const sock = B.room.game.sockets.find((s) => s.playerId === ids[0]);
  B.room.seatsTaken.delete(sock.id);          // the "ghost pair" the server does not clean up
  await sleep(120);
  const stillHeld = (B.tv.client.ballots || []).length;
  const serverSees = [...B.room.ballots.values()]
    .filter((v) => seatedPlayerIds(B.room).includes(v.runner) && seatedPlayerIds(B.room).includes(v.guide)).length;
  t('H4b · the two ballot lists really can disagree with nothing on the wire to say so — the TV still holds a full box the server would refuse',
    tvHeld === PHONES && stillHeld === PHONES && serverSees === 0 && B.tv.fanouts === beforeFanouts,
    `television ${stillHeld} · server-valid ${serverSees} · fanouts about it ${B.tv.fanouts - beforeFanouts}`);
  B.close();

  const strays = UNLOCK_ON_BEATS.filter((b) => !SHOW_BEATS.includes(b));
  t('H4c · UNLOCK_ON_BEATS names real `show.js` beats — a renamed beat reddens here rather than killing the countdown for a night',
    strays.length === 0 && UNLOCK_ON_BEATS.length > 0,
    strays.length ? `not beats: ${strays.join(', ')}` : `[${UNLOCK_ON_BEATS.join(' ')}] of [${SHOW_BEATS.join(' ')}]`);
}

// ===================================== H5 · the second door: a send that never left the building
{
  const D = await liveRoom('hd-drop', { recover: true });
  await ballotAll(D);
  const boxBefore = D.room.ballots.size;
  const showBefore = D.room.show;
  D.tv.client.ws.close();                     // the wifi blip under the thumb
  await sleep(120);
  const readyState = D.tv.client.ws.readyState;
  const sent = D.tv.sendThemIn();             // `send` is a no-op unless readyState === 1
  await sleep(160);
  t('H5 · ground truth — the socket was not OPEN, the send was swallowed by the client, and the server never heard it',
    readyState !== 1 && sent === true && D.room.show === showBefore && D.room.ballots.size === boxBefore
      && !D.room.game.state.pair?.runner,
    `readyState ${readyState} · room ${D.room.show} · box ${D.room.ballots.size}`);
  t('H5b · the television painted EXPEDITION for a message nobody sent',
    D.tv.ui.beat === 'expedition' && D.tv.ui.locked === true);
  await sleep(BEAT_CLAIM_MS + 400);
  t('H5c · SHIPPED — the same reconciliation covers it: back to the last beat the server named, unlocked',
    D.tv.ui.beat === D.tv.client.beat && D.tv.ui.beat === 'casting' && D.tv.ui.locked === false,
    `tv ${D.tv.ui.beat} · client.beat ${D.tv.client.beat} · locked ${D.tv.ui.locked}`);
  D.close();
}

// ================================================================= H8 · the stand-in is the file
{
  /*
   * 🪟 **Newlines are normalised, because two of the assertions below span a line break.**
   * The `show`-reconcile pattern reads `settleBeatClaim();` then a closing brace then the
   * `full` line, and a Windows checkout hands this file back with CRLF — so a bare `\n` in
   * the pattern misses by one invisible character. H8 was RED on Windows and GREEN in CI
   * against byte-identical content, which is the worst shape a gate can have: the machine
   * that reddens is not the machine anyone is looking at, so the red reads as a real drift
   * in `party-host.js` and gets "fixed" by editing a file that was already correct. The blob
   * in git is LF; this makes the local run agree with the blob instead of with the checkout.
   */
  const raw = await readFile(new URL('../src/views/party-host.js', import.meta.url), 'utf8');
  const src = raw.split('\r\n').join('\n');
  const optimistic = (src.match(/claimBeat\(/g) || []).length;
  t('H8 · the shipped file routes its local beats through `claimBeat` and reconciles on the clock AND on every `show` — otherwise these rows test a function nothing calls',
    /function claimBeat\(beat\)/.test(src) && /function settleBeatClaim\(\)/.test(src)
      && optimistic >= 4 && !/\n\s*ui\.beat = 'expedition';/.test(src) && !/\n\s*ui\.beat = 'casting';/.test(src)
      && /if \(settleBeatClaim\(\)\) \{ paint\(\); return; \}/.test(src)
      && /settleBeatClaim\(\);\n\s*\}\n\s*if \(m\.t === 'full'\)/.test(src),
    `claimBeat call sites ${optimistic}`);
}

// ============================================================================= THE CONTROL ARM
say('\n  ---- control arm · the optimism as it was: paint the beat, set the lock, reconcile never ----');
const C = await liveRoom('hd-ctrl', { recover: false });
const ctrlFault = await refuseEpisode(C);
const ctrlStuck = measure(C);
{
  say('');
  say(`       THE TELEVISION SAYS : ${String(ctrlStuck.tvBeat).toUpperCase()}${ctrlStuck.tvLocked ? '   (locked)' : ''}`);
  say(`       EVERY PHONE WAS TOLD: ${String(ctrlStuck.phonesTold[0]).toUpperCase()}`);
  say(`       THE SERVER IS IN    : ${ctrlStuck.serverBeat}`);
  say(`       fanouts to the TV after the send: ${ctrlFault.fanoutsAfter}`);
  say('');
  t('H6 control precondition · the control really did reproduce the split — refusal fired, silent, TV on a locked expedition while the phones hold casting',
    ctrlStuck.serverBeat === 'casting' && ctrlFault.fanoutsAfter === 0
      && ctrlStuck.tvBeat === 'expedition' && ctrlStuck.tvLocked === true
      && ctrlStuck.phonesTold.filter((b) => b === 'casting').length === PHONES,
    `tv ${ctrlStuck.tvBeat}/locked=${ctrlStuck.tvLocked} · room ${ctrlStuck.serverBeat} · fanouts ${ctrlFault.fanoutsAfter}`);
}
await sleep(BEAT_CLAIM_MS + 400);
const ctrlLate = measure(C);
{
  say(`       ${(BEAT_CLAIM_MS + 400) / 1000}s later, with nothing else on the wire:`);
  say(`       THE TELEVISION STILL SAYS : ${String(ctrlLate.tvBeat).toUpperCase()}${ctrlLate.tvLocked ? '   (locked)' : ''}`);
  say(`       THE SERVER IS STILL IN    : ${ctrlLate.serverBeat}`);
  say('');
  t('H6b control precondition · and there is no recovery path — the wait that heals the shipped television changes nothing here',
    ctrlLate.tvBeat === 'expedition' && ctrlLate.tvLocked === true && ctrlLate.agreeing === 0,
    `tv ${ctrlLate.tvBeat} · agreeing with phones ${ctrlLate.agreeing}/${PHONES}`);

  // The lock outlives even a beat the server DOES send: this is the half the audit did not name.
  enterBeatLive(C.room, 'lobby');
  await sleep(120);
  enterBeatLive(C.room, 'casting');
  await sleep(200);
  const m = measure(C);
  t('H7 control · the server puts the room back on CASTING and the lock is STILL set — `ui.locked` was written once a night and cleared never, so the 3·2·1 is dead for the rest of it',
    m.serverBeat === 'casting' && m.tvBeat === 'casting' && m.tvLocked === true,
    `room ${m.serverBeat} · tv ${m.tvBeat} · locked ${m.tvLocked}`);

  const RED = [
    ['H2 · the TV rejoins the beat the server named',
      shipStuck.tvBeat === 'expedition' && measure(A).tvBeat === 'casting',
      ctrlLate.tvBeat === 'casting'],
    ['H2b · the TV agrees with every phone again',
      measure(A).agreeing === PHONES, ctrlLate.agreeing === PHONES],
    ['H2c · the lock is released',
      measure(A).tvLocked === false, ctrlLate.tvLocked === false],
    ['H4 · a later CASTING clears the lock',
      measure(A).tvLocked === false, m.tvLocked === false],
  ];
  for (const [name, green, red] of RED) {
    t(`H9 control · ${name} — GREEN shipped, RED with the old optimism put back`,
      green === true && red === false,
      `shipped ${green} · control ${red}`);
  }
}

A.close();
C.close();
await sleep(80);
srv.close();
console.log(`\nhost-desync: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
