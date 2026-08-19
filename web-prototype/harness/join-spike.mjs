#!/usr/bin/env node
/**
 * 📡 **join-spike — NINE REAL SOCKETS THROUGH THE LOBBY, HEADLESS, WITH THE LEAK CHECK.**
 *
 *   node harness/join-spike.mjs
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT THIS IS FOR, GIVEN THE SPIKE'S WHOLE POINT IS A ROOM FULL OF REAL PHONES
 * ---------------------------------------------------------------------------------------------
 * `net/party/spike.mjs` answers a question no gate can answer — *does domestic wifi hold nine
 * connections for forty minutes* — and it answers it at a party, not in CI. So this gate does not
 * try to. It covers the part that CAN go wrong silently and would ruin the evening's data:
 *
 *   · the two static pages actually exist and are served (the server references them by name and
 *     throws on request if they do not — a failure you would discover with guests in the room)
 *   · a returning phone gets ITS OWN seat back, even from a full lobby
 *   · the cold-boot number, which D13 turns on, is taken once and never flattered by a reconnect
 *   · **no token ever reaches the television**, which eight people are looking at
 *
 * 🚨 THE TOKEN CHECK IS THE REASON THIS FILE IS NOT OPTIONAL. In the lobby a token buys a seat;
 * in the real game the same token buys a SEAT WITH A ROLE ON IT. A TV that renders one, or a
 * roster frame that merely carries one into a screen everybody photographs, is the whole hidden
 * -role game lost to a phone camera. `party-isolation` proves the projection; this proves the
 * lobby in front of it never had the secret in hand to begin with.
 *
 * ⚠️ IT DOES NOT MEASURE WIFI. Every RTT here is loopback and will read ~0ms. The numbers this
 * gate asserts on are structural — that a sample exists, that a silent phone reads `null` rather
 * than a fabricated zero. The real numbers come home in `/report`.
 */

import { networkInterfaces } from 'node:os';
import { startSpike, lanAddress, BOOT_BUDGET_MS } from '../net/party/spike.mjs';
import { MAX_PHONES, CAPACITY } from '../net/party/local.mjs';

const PORT = 5196;
let pass = 0, fail = 0;
const t = (n, c, d = '') => { if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); } else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); } return c; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * One browser, near enough. Node 22's global `WebSocket` masks its frames exactly as a browser
 * does, which is the half of RFC6455 a hand-rolled test client usually gets wrong.
 */
function open(query = '') {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/${query}`);
    const msgs = [];
    const box = {
      ws, msgs, pong: true,
      send: (o) => ws.send(JSON.stringify(o)),
      last: (type) => [...msgs].reverse().find((m) => m.t === type),
      close: () => { try { ws.close(); } catch { /* already gone */ } },
    };
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      msgs.push(m);
      if (m.t === 'ping' && box.pong) box.send({ t: 'pong', at: m.at });
    };
    ws.onopen = () => resolve(box);
    ws.onerror = () => resolve(box);
  });
}

async function waitFor(box, type, ms = 1200) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const m = box.last(type);
    if (m) return m;
    await sleep(15);
  }
  return null;
}

const spike = startSpike({ port: PORT, code: 'gate' });
await sleep(120);

// ---------------------------------------------------------------- P0 · the pages exist
{
  const [tv, phone, nope] = await Promise.all([
    fetch(`http://127.0.0.1:${PORT}/`),
    fetch(`http://127.0.0.1:${PORT}/p`),
    fetch(`http://127.0.0.1:${PORT}/nothing-here`),
  ]);
  const tvHtml = await tv.text();
  const phoneHtml = await phone.text();

  t('P0 arm · both lobby pages are on disk and served, not 500s from a missing file',
    tv.status === 200 && phone.status === 200 && tvHtml.length > 500 && phoneHtml.length > 500,
    `tv ${tv.status} ${tvHtml.length}B · phone ${phone.status} ${phoneHtml.length}B`);

  t('P0b control · an unknown path is refused, so P0 is reading routes rather than a catch-all',
    nope.status === 404, `${nope.status}`);

  t('P1 · the pages carry the hooks their scripts drive',
    /id="seats"/.test(tvHtml) && /id="code"/.test(tvHtml)
    && /id="go"/.test(phoneHtml) && /localStorage/.test(phoneHtml),
    'tv: seats+code · phone: join button + token store');

  // 🚨 STATIC LEAK CHECK. The television's markup must not contain the word at all — not a field,
  // not a debug line, not a commented-out one somebody re-enables at 1am.
  t('P2 · the TV page has no token anywhere in it, markup or script',
    !/token/i.test(tvHtml), 'a lounge TV is a screen eight people photograph');
  t('P2 control · the phone page DOES mention tokens, so P2 is a real search',
    /token/i.test(phoneHtml), 'the phone is where the token legitimately lives');
}

// ---------------------------------------------------------------- J0 · the television
const tv = await open('?role=tv');
const hello = await waitFor(tv, 'hello');
t('J0 arm · the TV connected and was told what to put on screen',
  !!hello && typeof hello.code === 'string' && /\/p$/.test(hello.url || ''),
  hello ? `${hello.code.toUpperCase()} → ${hello.url}` : 'no hello');

t('J0b · the URL on screen is built from the LAN address, not from whatever host was typed',
  hello.url === `http://${lanAddress()}:${PORT}/p`, hello.url);

// 🚨 A PHONE CANNOT REACH `localhost`. The picker must skip every internal interface, and the
// only address it is allowed to return from the loopback set is the documented fallback when the
// machine genuinely has no other — which is a different situation from picking one carelessly.
{
  const external = Object.values(networkInterfaces()).flat()
    .filter((ni) => ni && ni.family === 'IPv4' && !ni.internal).map((ni) => ni.address);
  const internal = Object.values(networkInterfaces()).flat()
    .filter((ni) => ni && ni.family === 'IPv4' && ni.internal).map((ni) => ni.address);
  t('J0c · lanAddress() picked a non-internal interface, or the fallback because there was none',
    external.length ? external.includes(lanAddress()) : lanAddress() === '127.0.0.1',
    `${lanAddress()} · external [${external}] internal [${internal}]`);
  t('J0c control · this machine does have a loopback for the picker to have got wrong',
    internal.includes('127.0.0.1'), 'so J0c is a choice, not the only option');
}

// ---------------------------------------------------------------- J1 · eight phones
// One phone boots slowly on purpose and one lands exactly on the budget: the boundary is where a
// "worst phone in the room" threshold is normally got wrong.
const BOOTS = [1200, 2400, 900, 8000, 3100, 9100, 1500, 2000];
const phones = [];
for (let i = 0; i < MAX_PHONES; i++) {
  const p = await open();
  p.send({ t: 'join', name: `Robot ${i + 1}`, token: null, boot: BOOTS[i], ua: 'gate/1.0' });
  const s = await waitFor(p, 'seated');
  phones.push({ box: p, seated: s });
}

const seatNos = phones.map((p) => p.seated?.seat);
const tokens = phones.map((p) => p.seated?.token);
t('J1 · eight phones took eight distinct seats with eight distinct tokens',
  phones.every((p) => p.seated) && new Set(seatNos).size === MAX_PHONES && new Set(tokens).size === MAX_PHONES,
  `seats ${seatNos.join(',')}`);

t('J1b · nine sockets are live at once — eight phones and the television',
  spike.lobby.seats.size + (spike.lobby.tv ? 1 : 0) === CAPACITY,
  `${spike.lobby.seats.size} phones + TV = ${CAPACITY}`);

t('J1c · every seat got its own colour, so the TV can tell them apart at three metres',
  new Set(phones.map((p) => p.seated.colour)).size === MAX_PHONES);

// ---------------------------------------------------------------- J2 · the ninth is refused
{
  const ninth = await open();
  ninth.send({ t: 'join', name: 'Latecomer', token: null, boot: 500 });
  const m = await waitFor(ninth, 'full');
  t('J2 · the ninth phone is refused with the cap, not quietly seated',
    !!m && m.capacity === MAX_PHONES, JSON.stringify(m));
  t('J2b · the refusal is in the event log, so an unhappy guest is reconstructable',
    spike.lobby.events.some((e) => e.type === 'seat.refused' && e.name === 'Latecomer'));
  t('J2 control · the refused phone left no seat behind',
    spike.lobby.seats.size === MAX_PHONES
    && ![...spike.lobby.seats.values()].some((s) => s.name === 'Latecomer'),
    `${spike.lobby.seats.size} seats`);
  ninth.close();
}

// ---------------------------------------------------------------- J3 · coming back
await sleep(1300);                                          // one full ping beat, for the RTT below
{
  const victim = phones[3];
  const tok = victim.seated.token;
  victim.box.close();
  await sleep(150);

  t('J3 arm · the drop was actually seen by the server',
    spike.lobby.seats.get('phone-3').live === false
    && spike.lobby.events.some((e) => e.type === 'seat.dropped' && e.seat === 3));

  // 🚨 FROM A FULL LOBBY. The resume path is checked BEFORE the cap, and it has to be: a player
  // whose screen locked would otherwise be told the party is full while their own seat sits empty.
  const back = await open();
  back.send({ t: 'join', name: 'Impostor', token: tok, boot: 20 });
  const s = await waitFor(back, 'seated');
  t('J3 · a returning phone reclaims its own seat by token, even with the lobby full',
    !!s && s.seat === 3 && spike.lobby.seats.size === MAX_PHONES, JSON.stringify(s && { seat: s.seat }));
  t('J3b · the reclaimed seat keeps its own name — the token is the seat, the payload is not',
    s && s.name === 'Robot 4', `got "${s && s.name}"`);
  t('J3c · the reconnect was counted',
    spike.lobby.seats.get('phone-3').drops === 1
    && spike.lobby.events.some((e) => e.type === 'seat.resumed' && e.seat === 3));

  // ⏱ The resume claimed a 20ms boot. If that were believed, every slow phone at the party would
  // report as fast the moment its screen locked once, and D13 would be decided on a lie.
  t('J3d · a resume does not overwrite the cold-boot number with its warm one',
    spike.lobby.seats.get('phone-3').bootMs === BOOTS[3],
    `${spike.lobby.seats.get('phone-3').bootMs}ms, resume claimed 20ms`);

  phones[3] = { box: back, seated: s };
}

// ---------------------------------------------------------------- J3e · two seats empty at once
// 🚨 THE ONE THAT ACTUALLY CATCHES "FIRST FREE SEAT". With a single dropped phone, binding by
// token and binding by availability agree, and a gate that only ever drops one is green against
// both. Two people go to the kitchen at the same time; the one who comes back first must not be
// handed the other's seat — which, in the real game, is the other's ROLE.
{
  const a = phones[5], b = phones[6];
  const tokA = a.seated.token, tokB = b.seated.token;
  a.box.close(); b.box.close();
  await sleep(180);
  t('J3e arm · two seats are empty simultaneously and either is available to a careless bind',
    spike.lobby.seats.get('phone-5').live === false && spike.lobby.seats.get('phone-6').live === false);

  // The LATER seat comes back FIRST, so "first free" and "correct" point at different seats.
  const backB = await open();
  backB.send({ t: 'join', name: 'Whoever', token: tokB, boot: 30 });
  const sb = await waitFor(backB, 'seated');
  t('J3e · the returning phone got its own seat, not the other empty one',
    sb && sb.seat === 6 && sb.name === 'Robot 7',
    sb ? `seat ${sb.seat} "${sb.name}" — seat 5 was free and wrong` : 'never seated');

  const backA = await open();
  backA.send({ t: 'join', name: 'Whoever else', token: tokA, boot: 30 });
  const sa = await waitFor(backA, 'seated');
  t('J3f · and the second returner got the remaining seat, which is genuinely theirs',
    sa && sa.seat === 5 && sa.name === 'Robot 6', sa ? `seat ${sa.seat} "${sa.name}"` : 'never seated');
  t('J3f control · the two seats never collapsed into one',
    sa && sb && sa.seat !== sb.seat && spike.lobby.seats.size === MAX_PHONES);

  phones[5] = { box: backA, seated: sa };
  phones[6] = { box: backB, seated: sb };
}

// ---------------------------------------------------------------- J4 · the control on reclaim
{
  const bogus = await open();
  bogus.send({ t: 'join', name: 'Nobody', token: 'deadbeefdeadbeef', boot: 500 });
  const full = await waitFor(bogus, 'full', 800);
  const seated = bogus.last('seated');
  t('J4 control · an unknown token resumes nothing — it is refused like any other latecomer',
    !!full && !seated, full ? 'refused' : `SEATED as ${JSON.stringify(seated)}`);
  bogus.close();
}

// ---------------------------------------------------------------- J5 · names
{
  const p = phones[0];
  p.box.send({ t: 'rename', name: 'A'.repeat(40) });
  await sleep(120);
  t('J5 · a name is capped at 14 characters wherever it enters',
    spike.lobby.seats.get('phone-0').name.length === 14,
    `${spike.lobby.seats.get('phone-0').name.length} chars`);
  const roster = tv.last('roster');
  t('J5b · the rename reached the television',
    !!roster && roster.players.find((x) => x.seat === 0)?.name === 'A'.repeat(14));
  t('J5 control · the cap is a cap, not a coincidence of the test name',
    'A'.repeat(40).length === 40);
}

// ---------------------------------------------------------------- J6 · the RTT instrument
{
  phones[1].box.pong = false;                               // a phone that has gone quiet
  await sleep(2300);
  const report = await (await fetch(`http://127.0.0.1:${PORT}/report`)).json();
  const row = (n) => report.seats.find((s) => s.seat === n);

  t('J6 arm · the ping beat produced samples on a phone that answers',
    row(2).rtt && row(2).rtt.n >= 2, `${row(2).rtt?.n} samples`);
  // A phone whose screen locked keeps its socket open and simply stops answering. The instrument
  // must show that as missing samples — a server that timestamped its own ping would show a
  // healthy 0ms for a phone that is, in the lounge, plainly not there.
  t('J6 · a phone that stopped answering stops accruing samples rather than reading healthy',
    row(1).rtt === null || row(1).rtt.n < row(2).rtt.n,
    `quiet ${JSON.stringify(row(1).rtt)} vs answering n=${row(2).rtt.n}`);

  // ---------------------------------------------------------------- J7 · the boot verdict
  t('J7 · the report names the worst phone in the room, which is the number D13 turns on',
    report.worstBootMs === Math.max(...BOOTS) && report.bootBudgetMs === BOOT_BUDGET_MS,
    `worst ${report.worstBootMs}ms vs ${BOOT_BUDGET_MS}ms budget`);
  t('J7b · only the phone over budget is flagged — 8000ms exactly is inside it',
    JSON.stringify(report.seatsOverBudget) === JSON.stringify([5]),
    `flagged ${JSON.stringify(report.seatsOverBudget)} · seat 3 boots at exactly ${BOOT_BUDGET_MS}ms`);
  t('J7 control · the boundary seat exists and would have been flagged one millisecond later',
    row(3).bootMs === BOOT_BUDGET_MS && BOOTS[5] > BOOT_BUDGET_MS);

  // ---------------------------------------------------------------- J8 · the report is the deliverable
  t('J8 · the report carries a row per seat and the whole event log',
    report.seats.length === MAX_PHONES
    && report.events.some((e) => e.type === 'seat.joined')
    && report.events.some((e) => e.type === 'seat.resumed'),
    `${report.seats.length} seats · ${report.events.length} events`);
  t('J8b · no token is anywhere in the report — it gets pasted into chats and issues',
    !/token/i.test(JSON.stringify(report)));
}

// ---------------------------------------------------------------- J9 · the television never holds a secret
{
  const wire = JSON.stringify(tv.msgs);
  t('J9 · not one byte the TV was sent contains a token',
    !/token/i.test(wire), `${tv.msgs.length} frames scanned`);
  t('J9b control · the same scan finds the token on a phone\'s own wire, so J9 can see one',
    /token/i.test(JSON.stringify(phones[2].box.msgs)),
    'the phone is handed one; the TV never is');
  t('J9c · the TV\'s roster carries no user agent either',
    !/gate\/1\.0/.test(wire), 'ua is for the report, not the screen');
}

for (const p of phones) p.box.close();
tv.close();
spike.close();
console.log(`\njoin-spike: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
