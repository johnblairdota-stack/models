#!/usr/bin/env node
/**
 * 🎴 **role-peek — THE DEAL HAPPENS AT NIGHT START, AND THE CARD IS HOLD-TO-REVEAL.**
 *
 *   node harness/role-peek.mjs
 *
 * Two claims, and they fail in different places, so they are asserted separately.
 *
 * **P1-P8, the card.** `docs/design/rrr-phone-ux.md` §2.3 in numbers: the role name at 34 px, one
 * line of rule text at 24 px, **GOOD** or **PRODUCTION** spelled out, and a 400 ms re-blur. The
 * copy comes from `SCRIPT`, which is the file `docs/design/rrr-roles.md` is written into — a
 * second table of display names is how a card and a Reunion roll call end up naming the same role
 * differently, and this project had exactly that (`Editor` against `The Editor`) until it didn't.
 *
 * ⚠️ THE BLUR IS ASSERTED AS THE RESTING STATE, NOT AS A RULE THAT EXISTS. `lit` has to be the
 * exception: a script that never runs must leave the card unreadable rather than open. A gate
 * that only checked "there is a blur rule somewhere" would pass a stylesheet that blurs on
 * `.dim` and defaults to clear.
 *
 * **W1-W6, the wire.** The live bug this replaces: the deal was written inside `playEpisode`
 * behind `episode === 1`, so a phone voted a runner in before it had ever been told what it was
 * playing for, and the card landed on a screen that had moved on. So the assertion is ORDERING,
 * over real sockets: every joined phone holds its own card **before** the first ballot, the TV
 * holds none, and playing the episode afterwards does not deal a second one.
 *
 * Bare node, no dependency — see `.github/workflows/gates.yml`. The DOM half of `rolecard.js`
 * (`mount`) is not exercised here; everything this gate reads is a pure string.
 */

import { startServer } from '../net/party/local.mjs';
import { SCRIPT } from '../src/party/roles.js';
import {
  DEAL_MS, HOLD_NOTE, HOLD_NOTE_LIT, PREMIERE_COPY, REBLUR_MS, ROLE_CARD_CSS,
  cardFor, dealDeckHtml, faceDownHtml, premiereHtml, roleCardFaceHtml, roleLine, roleName, sideLabel,
} from '../src/party/rolecard.js';

const PORT = 5199;
let pass = 0, fail = 0;
const t = (n, c, d = '') => { if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); } else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); } return c; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- P: the card itself
/**
 * The thirteen cards, and there is no fourteenth. `docs/design/rrr-roles.md`'s list, in the
 * order the doc writes it. A gate that only counted would pass a bag with a role renamed.
 */
const ROSTER = [
  'Contestant', 'Camera Op', 'Focus Puller', 'Continuity', 'The Editor', 'Fan Favourite',
  'Stunt Double', 'Glitched', 'The Static', 'The Method Actor', 'The Producer', 'The Fixer',
  'The Plant',
];

{
  const names = Object.keys(SCRIPT).map((k) => SCRIPT[k].name);
  t('P1 · thirteen roles, named exactly as the roles doc names them, and no fourteenth',
    names.length === 13 && ROSTER.every((n) => names.includes(n)) && names.every((n) => ROSTER.includes(n)),
    `${names.length} roles`);

  const missing = Object.keys(SCRIPT).filter((k) => !roleLine(k) || roleName(k) === k);
  t('P2 · every card has a display name and a one-line rule, so the card is never a key',
    missing.length === 0, missing.join(',') || '13/13');

  t('P2b · an unknown role does not render a key or an empty card',
    roleName('nope') === 'nope' && roleName(null) === '—' && roleLine('nope') === '');
}

{
  t('P3 · the side is SPELLED OUT, never colour alone',
    sideLabel('evil') === 'PRODUCTION' && sideLabel('good') === 'GOOD' && sideLabel(null) === '');

  // 🚨 The sole traitor at 4-5 players has NO teammates, so an alignment inferred from the
  // teammate array reads GOOD on the one phone that must not. `cardFor` reads `alignment`.
  const solo = cardFor({ role: 'producer', alignment: 'evil' });
  t('P4 · a Production member with no teammates still reads PRODUCTION',
    solo.side === 'PRODUCTION' && solo.evil === true && solo.teammates.length === 0);

  const good = cardFor({ role: 'cameraOp', alignment: 'good', teammates: [{ id: 'p2', role: 'plant' }] });
  t('P4b · a good card carries no teammate, even when one is handed to it',
    good.side === 'GOOD' && good.evil === false && good.teammates.length === 0,
    JSON.stringify(good.teammates));

  const pair = cardFor({ role: 'fixer', alignment: 'evil', teammates: [{ id: 'p7', role: 'producer' }] });
  const html = roleCardFaceHtml(pair, (id) => (id === 'p7' ? 'Hai' : id));
  t('P5 · the card is name + line + side, and Production is named on the peek',
    html.includes('The Fixer') && html.includes(SCRIPT.fixer.line.replace(/'/g, '&#39;'))
      && html.includes('You are PRODUCTION') && html.includes('Hai') && html.includes('The Producer'),
    'fixer peek');

  t('P5b · the face escapes a player name rather than trusting it',
    roleCardFaceHtml(pair, () => '<script>x</script>').includes('&lt;script&gt;'));
}

{
  // §2.3's own numbers. The face is the only blurred element, so these live on `.card-view`.
  const css = ROLE_CARD_CSS.replace(/\s+/g, ' ');
  t('P6 · the role name is 34 px and the rule line is 24 px — §2.3',
    /\.card-view \.role \{ font:800 34px/.test(css) && /\.card-view \.line \{ font:500 24px/.test(css),
    'role 34 / line 24');

  t('P6b · the card is full-bleed',
    /\.card-view \{ position:fixed; inset:0;/.test(css));

  // 🚨 BLUR IS THE DEFAULT, `lit` IS THE EXCEPTION.
  t('P7 · the face is blurred at rest and clear only under .lit',
    /\.card-view \.face \{ filter:blur\(\d+px\)/.test(css)
      && /\.card-view\.lit \.face \{ filter:none/.test(css)
      && !/\.card-view \.face \{ filter:none/.test(css));

  t('P7b · a hold cannot be swallowed by a scroll',
    /\.card-view \{[^}]*touch-action:none/.test(css) && /\.hold-bar \{[^}]*touch-action:none/.test(css));

  // 🚨 THE OVERLAY IS OUTSIDE `.night`, SO IT DECLARES ITS OWN FAMILY, AND EVERY `font:`
  // SHORTHAND CARRIES THE STACK. The shorthand resets `font-family`, so `font:800 34px/1.1
  // ui-sans-serif` rendered §2.3's 34 px name in the browser's default SERIF.
  const fonts = css.match(/font:[^;]+;/g) || [];
  t('P7c · every font shorthand keeps a family fallback, and the overlays declare one',
    fonts.length > 0 && fonts.every((f) => f.includes('inherit') || /sans-serif;$/.test(f))
      && /\.card-view \{[^}]*font-family:ui-sans-serif/.test(css)
      && /\.deal-view \{[^}]*font-family:ui-sans-serif/.test(css),
    `${fonts.length} shorthands`);

  t('P7d · the strip above the bar is a STATE readout, not a second instruction',
    HOLD_NOTE !== HOLD_NOTE_LIT && /blurred/i.test(HOLD_NOTE) && /release/i.test(HOLD_NOTE_LIT)
      && /\.card-view \.when-lit[^}]*display:none/.test(css)
      && /\.card-view\.lit \.when-lit \{ display:inline/.test(css));
}

{
  t('P8 · the re-blur is §2.3\'s 400 ms', REBLUR_MS === 400, `${REBLUR_MS} ms`);
  t('P8b · the deal is a beat, not a frame', DEAL_MS >= 600 && DEAL_MS <= 4000, `${DEAL_MS} ms`);

  t('P9 · the premiere says the card stays blurred until a finger is on it',
    PREMIERE_COPY.includes('Hold the button below to read it')
      && PREMIERE_COPY.includes('it stays blurred until a finger is on it'),
    'premiere copy');
  t('P9b · the premiere sheet and the face-down tab name no role',
    !/producer|contestant|cameraOp|Camera Op/i.test(premiereHtml() + faceDownHtml()));

  const deck = dealDeckHtml(4, 2);
  t('P10 · the deal hands out one back per phone and exactly one of them is this phone\'s',
    (deck.match(/class="b/g) || []).length === 4 && (deck.match(/class="b mine"/g) || []).length === 1);
  t('P10b · a one-phone deck and an over-full deck both stay inside eight backs',
    (dealDeckHtml(1, 0).match(/class="b/g) || []).length === 1
      && (dealDeckHtml(99, 0).match(/class="b/g) || []).length === 8);
}

// ---------------------------------------------------------------- W: the deal, over real sockets
function open(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const msgs = [];
    const box = { ws, msgs, welcome: null, send: (o) => ws.send(JSON.stringify(o)), close: () => ws.close() };
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      msgs.push(m);
      if (m.t === 'welcome' || m.t === 'full') { box.welcome = m; resolve(box); }
    };
    ws.onerror = () => reject(new Error('socket error'));
    setTimeout(() => resolve(box), 1500);
  });
}

const evs = (box) => box.msgs.filter((m) => m.t === 'event').map((m) => m.ev);
const cards = (box) => evs(box).filter((e) => e.type === 'role.card');

const srv = startServer({ port: PORT, count: 8, castSeed: 7, worldSeed: 5, code: 'peek' });
await sleep(120);
const base = `ws://localhost:${PORT}/?room=peek`;

const tv = await open(`${base}&host=1`);
const a = await open(base);
const b = await open(base);
await sleep(80);

t('W0 · a TV and two phones are seated',
  tv.welcome?.isTV === true && a.welcome?.isTV === false && b.welcome?.isTV === false);

t('W1 · nothing is dealt before the night starts',
  cards(a).length === 0 && cards(b).length === 0 && !srv.rooms.get('peek').game.isDealt());

tv.send({ t: 'start' });
await sleep(120);

t('W2 · the night start deals — every joined phone holds exactly one card, before any ballot',
  cards(a).length === 1 && cards(b).length === 1
    && !evs(a).some((e) => e.type === 'cast.pair') && !evs(b).some((e) => e.type === 'cast.pair'),
  `a=${cards(a).length} b=${cards(b).length}`);

t('W2b · the card each phone holds is its own',
  cards(a).every((e) => e.for === a.welcome.playerId)
    && cards(b).every((e) => e.for === b.welcome.playerId)
    && !evs(a).some((e) => e.type === 'role.card' && e.for === b.welcome.playerId));

t('W2c · the dealt role is a card the script knows, so the phone never prints a key',
  cards(a).every((e) => !!SCRIPT[e.data?.role]) && cards(b).every((e) => !!SCRIPT[e.data?.role]),
  [cards(a)[0]?.data?.role, cards(b)[0]?.data?.role].join(' / '));

// 🚨 THE TV NEVER SEES A COVER. `role.card` is SELF, `production.panel` is EVIL, the deal is
// SEALED, and this is the assertion that is allowed to block a merge outright.
t('W3 · the TV received no card, no panel, and no sealed deal',
  !evs(tv).some((e) => e.type === 'role.card' || e.type === 'production.panel' || e.type === 'cast.deal')
    && !evs(tv).some((e) => e.vis === 'SEALED'));

t('W3b · no socket received the sealed deal',
  ![...evs(tv), ...evs(a), ...evs(b)].some((e) => e.vis === 'SEALED'));

{
  const panels = [...evs(a), ...evs(b)].filter((e) => e.type === 'production.panel');
  const seats = srv.rooms.get('peek').game.truth().seats;
  const evilOf = (pid) => seats.find((s) => s.id === pid)?.alignment === 'evil';
  t('W4 · a Production Panel only ever reaches its own Production socket',
    panels.every((e) => evilOf(e.for)),
    `${panels.length} panels`);
}

{
  // Every phone frame carries `you`, and no frame on any socket carries another seat's role.
  const rows = [...a.msgs, ...b.msgs, ...tv.msgs].filter((m) => m.t === 'state').map((m) => m.frame);
  t('W4b · no frame on any socket carries a role or an alignment in the players list',
    rows.every((f) => (f.players || []).every((p) => p.role == null && p.alignment == null)));
  const tvRows = tv.msgs.filter((m) => m.t === 'state').map((m) => m.frame);
  t('W4c · the TV frame has no `you` at all — the shape is absent, not empty',
    tvRows.length > 0 && tvRows.every((f) => f.you === undefined),
    `${tvRows.length} TV frames`);
}

tv.send({ t: 'casting' });
await sleep(60);
a.send({ t: 'ballot', runner: b.welcome.playerId, guide: a.welcome.playerId });
b.send({ t: 'ballot', runner: a.welcome.playerId, guide: b.welcome.playerId });
await sleep(60);
tv.send({ t: 'episode', opts: {} });
await sleep(220);

t('W5 · playing the episode does not deal a second card',
  cards(a).length === 1 && cards(b).length === 1,
  `a=${cards(a).length} b=${cards(b).length}`);

t('W5b · the episode still ran, and the pair is public',
  evs(tv).some((e) => e.type === 'cast.pair') && evs(tv).some((e) => e.type === 'phase.EXPEDITION'));

{
  // The card is available THROUGH the expedition, which on the wire means a phone that drops
  // mid-run is caught up with it. `replay` is how the phone knows not to re-animate the deal.
  const tok = a.welcome.token;
  a.close();
  await sleep(100);
  const back = await open(`${base}&token=${tok}`);
  await sleep(90);
  const replayed = back.msgs.filter((m) => m.t === 'event' && m.replay);
  t('W6 · a phone that comes back mid-run is replayed its own card, marked as catch-up',
    back.welcome?.resumed === true
      && replayed.some((m) => m.ev.type === 'role.card' && m.ev.for === a.welcome.playerId)
      && replayed.every((m) => m.ev.vis !== 'SEALED' && (!m.ev.for || m.ev.for === a.welcome.playerId))
      && replayed.every((m) => m.ev.seq != null),
    `${replayed.length} replayed`);
  back.close();
}

for (const c of [tv, b]) c.close();
srv.close();
console.log(`\nrole-peek: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
