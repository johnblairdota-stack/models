#!/usr/bin/env node
/**
 * 👏 **react-pad — THE REACTION PAD REACHES ANOTHER MACHINE.**
 *
 *   node harness/react-pad.mjs
 *
 * Round 4's critic filed this twice — **D3** for the dead wiring and **S4** for the reason to
 * bother — and it sat banked through rounds 4, 5 and 6. The defect it names is not subtle: four
 * buttons printed a word on the tapper's own screen and reached nothing, so for the sixty to
 * ninety seconds of every Expedition, six of eight players held a dead remote.
 *
 * The rules live in `src/party/react.js` with no DOM and no socket in them, which is what lets
 * R1-R9 below enumerate every refusal in bare node. R20+ fire real payloads at a real server,
 * because the interesting failures here are all at the seam:
 *
 *  - a phone that sends a reaction it invented,
 *  - a DEAD phone reacting (the reason casting grew a living check in L92 — an executed player
 *    with a live channel to the living can signal what they learned on the way out),
 *  - a TELEVISION reacting, which is a camera crew with an opinion,
 *  - and a fast thumb holding the whole strip.
 *
 * ⚠️ **R30 IS THE ONE TO NOT DELETE.** It fires a WIDENED react payload at `fanoutViolations` and
 * asserts the schema REFUSES it rather than quietly filtering it. Every other public fanout in
 * this game earned that control the same way — the closed shape is what stops a later "put the
 * name on it while we are here" from shipping a second copy of a player's identity on a hot path,
 * or a `text` field that would be a whisper channel with no pair, no clock and no cap.
 */

import {
  REACTIONS, REACT_BEATS, REACT_COOLDOWN_MS, REACT_HOLD_MS, REACT_MAX_ON_AIR, REACT_MOOD,
  cleanReaction, isReactBeat, onAir, reactCheck, spawnOffset,
} from '../src/party/react.js';
import { fanoutViolations, FANOUT_KEYS } from '../net/party/local.mjs';
import { robotFaceSvg } from '../src/party/look.js';
import { readFile } from 'node:fs/promises';

let pass = 0, fail = 0;
const t = (n, c, d = '') => { if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); } else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); } return c; };
const OK = { reaction: 'CLAP', beat: 'expedition', alive: true, lastAt: null, now: 10_000 };

// ---------------------------------------------------------------- R1 · the closed set
{
  t('R1 · the four reactions are a closed set, and a phone cannot smuggle a fifth',
    REACTIONS.length === 4
      && ['CLAP', 'BOO', 'SUS', 'SHOCK'].every((r) => cleanReaction(r) === r)
      && cleanReaction('clap') === 'CLAP'
      && [null, undefined, 42, {}, [], '', 'LAUGH', 'CLAP; DROP', '__proto__'].every((x) => cleanReaction(x) === null),
    REACTIONS.join(' · '));

  /* The crash class L30 found: a non-string that answers toString(). cleanReaction must not
     call it — it must refuse anything that is not already a string. */
  const bomb = { toString() { throw new Error('boom'); } };
  let threw = false;
  try { cleanReaction(bomb); } catch { threw = true; }
  t('R1b control · a hostile non-string is REFUSED, not stringified · the L30 crash class',
    !threw && cleanReaction(bomb) === null);
}

// ---------------------------------------------------------------- R2 · who and when
{
  t('R2 · a living player on the Expedition may react', reactCheck(OK).ok === true);
  t('R3 · the DEAD do not react · same reason casting grew a living check at L92',
    reactCheck({ ...OK, alive: false }).why === 'dead');
  t('R4 · reactions are the RUN, not the talk beats · a second cheap channel beside the pairs',
    ['casting', 'recap', 'debrief', 'reckoning', 'vote', 'execution', 'lobby', '', null]
      .every((b) => reactCheck({ ...OK, beat: b }).why === 'beat')
      && isReactBeat('expedition') && REACT_BEATS.length === 1);
  t('R5 · an invented reaction is refused before anything else is even looked at',
    reactCheck({ ...OK, reaction: 'LAUGH' }).why === 'unknown'
      && reactCheck({ reaction: 'LAUGH', beat: 'vote', alive: false, lastAt: 0, now: 0 }).why === 'unknown');
}

// ---------------------------------------------------------------- R6 · the cooldown
{
  const at = 10_000;
  t('R6 · a second tap inside the cooldown is refused',
    reactCheck({ ...OK, lastAt: at, now: at + 1 }).why === 'cooling'
      && reactCheck({ ...OK, lastAt: at, now: at + REACT_COOLDOWN_MS - 1 }).why === 'cooling');
  t('R6b · and it survives to the last millisecond, then opens',
    reactCheck({ ...OK, lastAt: at, now: at + REACT_COOLDOWN_MS }).ok === true,
    `${REACT_COOLDOWN_MS}ms`);
  /*
   * John, live on DUSK: emotes are SPAMMABLE. The number is a debounce so one physical tap
   * cannot fire twice, not a budget that ignores the next tap while the first is still on air.
   */
  t('R6c · the cooldown is a debounce · a second tap while the first is still on air is allowed',
    REACT_COOLDOWN_MS >= 80 && REACT_COOLDOWN_MS <= 400
    && REACT_COOLDOWN_MS * 4 < REACT_HOLD_MS
    && reactCheck({ ...OK, lastAt: at, now: at + Math.min(REACT_HOLD_MS / 2, 400) }).ok === true,
    `${REACT_COOLDOWN_MS}ms debounce · hold ${REACT_HOLD_MS}ms`);
}

// ---------------------------------------------------------------- R7 · what is on air
{
  const now = 100_000;
  const ev = (from, r, ago) => ({ from, r, at: now - ago });

  t('R7 · a reaction ages off the strip by wall clock',
    onAir([ev('p1', 'CLAP', REACT_HOLD_MS - 1)], now).length === 1
      && onAir([ev('p1', 'CLAP', REACT_HOLD_MS)], now).length === 0,
    `${REACT_HOLD_MS}ms`);
  t('R7b · and it lasts 3–4× the old 2.6s pop',
    REACT_HOLD_MS >= 7800 && REACT_HOLD_MS <= 12000,
    `${(REACT_HOLD_MS / 2600).toFixed(2)}×`);

  /*
   * ⚠️ SPAM IS THE FEATURE. A second tap from the same player while the first is still up
   * must stay on air as its own event. The old one-row-per-player dedupe was the bug.
   */
  const spammer = [ev('p1', 'CLAP', 2000), ev('p1', 'BOO', 100), ev('p2', 'SUS', 50)];
  const air = onAir(spammer, now);
  t('R8 · spam is allowed · two taps from the same player both stay on air',
    air.length === 3
    && air.filter((e) => e.from === 'p1').length === 2
    && air[0].from === 'p2' && air[1].r === 'BOO' && air[2].r === 'CLAP');
  t('R8b · each extra tap from the same player starts on a different path',
    spawnOffset(0).ox !== spawnOffset(1).ox
    && spawnOffset(1).ox !== spawnOffset(2).ox
    && spawnOffset(0).oy !== spawnOffset(1).oy);
  t('R8c · and the lanes are wider than the face, so spam is not a smear on the first chip',
    Math.abs(spawnOffset(1).ox - spawnOffset(0).ox) >= 56
    && Math.abs(spawnOffset(2).ox - spawnOffset(0).ox) >= 24);

  // `events` is newest-LAST, the order the client appends in — so p11 is the most recent here.
  const crowd = Array.from({ length: 20 }, (_, i) => ev(`p${i}`, 'CLAP', (19 - i) * 10));
  t('R9 · the overlay is capped, newest first · a full table cannot bury the run picture',
    onAir(crowd, now).length === REACT_MAX_ON_AIR && onAir(crowd, now)[0].from === 'p19',
    `${REACT_MAX_ON_AIR} slots`);
  t('R9b · an empty or stale list is empty, not a crash',
    onAir([], now).length === 0 && onAir([ev('p1', 'CLAP', 90_000)], now).length === 0);
  const flood = Array.from({ length: 20 }, (_, i) => ev('p1', 'CLAP', (19 - i) * 10));
  t('R9c · a spammer is capped with everyone else · newest first, not one-per-player',
    onAir(flood, now).length === REACT_MAX_ON_AIR
    && onAir(flood, now).every((e) => e.from === 'p1'));
}

// ---------------------------------------------------------------- R20 · the wire
{
  const good = { t: 'react', from: 'p3', r: 'BOO', at: 1 };
  t('R20 · the aired payload passes the closed schema', fanoutViolations(good).length === 0);

  /*
   * 🚨 THE CONTROL. A widened payload must be REFUSED by the schema, not filtered by it. Each of
   * these is a plausible next commit: the name "while we are here", the look "so the TV need not
   * look it up", and a short message "so a boo can say why". The third is the dangerous one — it
   * is a whisper channel with no pair, no clock and no cap, which is precisely what the link
   * system exists to prevent.
   */
  const widened = [
    ['name', { ...good, name: 'MARY-KATE 3' }],
    ['accent', { ...good, accent: '#f5a14a' }],
    ['text', { ...good, text: 'she is lying' }],
    ['role', { ...good, role: 'production' }],
  ];
  t('R30 control · a widened react payload is REFUSED by the schema, never filtered',
    widened.every(([, m]) => fanoutViolations(m).length > 0),
    widened.map(([k]) => k).join(' · '));
  t('R30b · and the allow-list itself carries no identity and no free text',
    FANOUT_KEYS.react.join(',') === 't,from,r,at');
}

// ---------------------------------------------------------------- R40 · the two ends
{
  const netSrc = await readFile(new URL('../net/party/local.mjs', import.meta.url), 'utf8');
  const phoneSrc = await readFile(new URL('../src/views/party-phone.js', import.meta.url), 'utf8');
  const hostSrc = await readFile(new URL('../src/views/party-host.js', import.meta.url), 'utf8');

  /*
   * A TELEVISION MAY NOT REACT. The show branch shipped without an isTV guard once already and
   * any seated phone could drive the room's night with it; this asserts the mirror image, that
   * the react branch is phones-only, at the source rather than by hoping.
   */
  t('R40 · reacting is phones-only, and it is refused SILENTLY',
    /msg\.t === 'react' && self && !isTV/.test(netSrc)
      && /export function applyReact/.test(netSrc)
      && !/ballotOk[\s\S]{0,200}react/.test(netSrc));

  /*
   * ⚠️ THE BUG THIS PAD SHIPPED WITH FOR THREE ROUNDS. The old handler read `dataset.r` straight
   * off `e.target`, which worked only while the buttons were plain text. Every button now holds
   * a face and a label, so every tap lands on a CHILD and reads undefined — a pad that looks
   * perfect and does nothing, which is exactly the defect being fixed.
   */
  t('R41 · the phone tap survives a button with children, and it actually SENDS',
    /closest\?\.\('\[data-r\]'\)/.test(phoneSrc)
      && /send\(\{ t: 'react', r \}\)/.test(phoneSrc)
      && !/state\.flash = r;/.test(phoneSrc));

  /*
   * The strip is patched on the clock tick, never by paint(). A full repaint four times a second
   * to age a face out would remount the follow camera's canvas in the middle of the chase.
   */
  t('R42 · the TV patches the overlay in place on the tick, and never repaints the run frame for it',
    /data-react-strip/.test(hostSrc) && /function paintReactStrip/.test(hostSrc)
      && /paintReactStrip\(\);/.test(hostSrc) && /ui\.reactKey/.test(hostSrc));
  t('R42b · chips are keyed per EVENT (from+at), never reused by player · spam does not replace',
    /e\.from\}:\$\{e\.at/.test(hostSrc)
    && !/dataset\.rk === e\.from/.test(hostSrc)
    && /--ox/.test(hostSrc) && /spawnOffset\(/.test(hostSrc));

  const skinSrc = await readFile(new URL('../src/party/night-skin.js', import.meta.url), 'utf8');
  t('R43 · chips float up onto the picture over the hold, they do not pop 8px and stick',
    /@keyframes react-float-up/.test(skinSrc)
    && /animation:\s*react-float-up var\(--react-hold/.test(skinSrc)
    && !/\.react-chip \{[^}]*animation:\s*night-rise/.test(skinSrc)
    && /- 240px/.test(skinSrc));
}

// ---------------------------------------------------------------- R50 · the faces
{
  /*
   * Each reaction wears a DIFFERENT face, and every one is the shipped drawing rather than a
   * second set of art — see W40 in party-warm. A mood table that quietly collapsed two of them
   * onto the same picture would leave the pad four buttons that say four things and show two.
   */
  const svg = (m) => robotFaceSvg('#2a2420', '#f5a14a', { size: 64, treatment: 'portrait', mood: m });
  const moods = REACTIONS.map((r) => REACT_MOOD[r]);
  t('R50 · four reactions, four moods, four DIFFERENT pictures',
    moods.length === 4 && new Set(moods).size === 4
      && new Set(moods.map(svg)).size === 4,
    moods.join(' · '));

  /*
   * BOO has to read as hostile rather than as sad, and the cue that carries it is the angled
   * brow — the same inner-end-drops cue the 3D face uses for the hunter. A frown on its own is
   * disappointment. This asserts the tilt is actually emitted, because it is one field in a
   * table and silently losing it would cost the only reaction the room can be told off with.
   */
  t('R51 · BOO angles its brows · a frown without the tilt reads as sad, not as an objection',
    /<path[^>]*transform="rotate\(-?\d/.test(svg('boo'))
      && !/transform="rotate/.test(svg('clap')),
    'inner ends drop, as uEyeCant does on the hunter');

  t('R52 · SUS stays ASYMMETRIC · the accusation is the squint on one side, not a frown',
    (() => {
      const eyes = [...svg('sus').matchAll(/<rect data-paint="lit"[^>]*height="([\d.]+)"/g)].map((m) => +m[1]);
      return eyes.length >= 2 && Math.abs(eyes[0] - eyes[1]) > 1;
    })());
}

// ---------------------------------------------------------------- R60 · the badge
{
  /*
   * 🏷️ John's partner asked for floating symbols. Three things about the shipped answer are
   * decisions rather than details, and each is one somebody will try to undo.
   */
  const svg = (m, treat = 'portrait') => robotFaceSvg('#2a2420', '#f5a14a', { size: 56, treatment: treat, mood: m });
  const badged = REACTIONS.map((r) => svg(REACT_MOOD[r]));

  t('R60 · four reactions, four DIFFERENT badges, all inside the existing 100x100 box',
    new Set(badged).size === 4
      && badged.every((s) => /<g class="bot-badge" data-react="[a-z]+">/.test(s))
      && badged.every((s) => /viewBox="0 0 100 100"/.test(s)),
    REACTIONS.join(' · '));

  /*
   * ⚠️ IDLE NEVER GETS ONE, AND IT IS DERIVED FROM THE MOOD SO NO CALLER CAN TURN IT ON. Seven
   * of the nine places this face is mounted are hard-coded idle — the picker, the run slate, the
   * lobby grid, the lower third, the nominee rows, the pair board, the spectator view. A badge on
   * any of them is an emotion the player never sent; on the pair board, where two faces overlap
   * by a third of their width, it would land underneath the other player's head.
   */
  t('R61 · idle carries no badge, in every treatment · a badge is a reaction, not decoration',
    ['portrait', 'chip', 'screen'].every((tr) => !/bot-badge/.test(svg('idle', tr)))
      && ['portrait', 'chip', 'screen'].every((tr) => /bot-badge/.test(svg('sus', tr))));

  /*
   * 🚨 NO IDS — eight faces mount at once in the lobby, so an id-scoped gradient, filter or clip
   * path collides and the last one mounted wins. This is the same rule W40a pins for the face.
   */
  t('R62 · the badge adds no id and no url() reference · the lobby mounts eight of these',
    badged.every((s) => !/\bid=/.test(s) && !/url\(#/.test(s)));

  /*
   * THE COLOURS ARE FIXED PER REACTION, not the player's accent: the badge's only job is WHICH
   * reaction, identity is already carried by the face and the name, and a fixed colour has to
   * survive all twelve accents rather than vanish into one. They are palette names, not new hues.
   */
  const fills = badged.map((s) => s.match(/<rect x="62"[^>]*fill="(#[0-9a-f]{6})"/)?.[1]);
  const PALETTE = ['#9ff2c8', '#ff8a7a', '#f5a14a', '#f3ece3'];
  t('R63 · badge colours are fixed, distinct, and every one is already in the night palette',
    new Set(fills).size === 4 && fills.every((f) => PALETTE.includes(f)),
    fills.join(' · '));
  t('R63b control · a badge does NOT take the player accent · it is the same on two players',
    robotFaceSvg('#2a2420', '#f5a14a', { size: 56, mood: 'sus' }).match(/<rect x="62"[^>]*fill="(#[0-9a-f]{6})"/)[1]
      === robotFaceSvg('#1e3330', '#9ad7c2', { size: 56, mood: 'sus' }).match(/<rect x="62"[^>]*fill="(#[0-9a-f]{6})"/)[1]);

  /*
   * 🚫 NOT RED, AND NO EXCLAMATION MARK. `--night-bad` already means taken / dark / Production,
   * and a red `!` above a head is this game's LOCKED word for a nominee — a mark the room reads
   * ninety seconds later at the Reckoning. The partner's brief asked for red `?` and `!`; the
   * shapes that survived are `?` (amber) and a spark (white). Sus is the one that must never
   * drift back to red, because sus is the accusation.
   */
  const susFill = fills[REACTIONS.indexOf('SUS')];
  t('R64 · SUS is not red · a red mark above a head is already this game\'s word for NOMINEE',
    susFill !== '#ff8a7a' && susFill === '#f5a14a', `sus badge ${susFill}`);

  /*
   * CLAP AND BOO ARE THE SAME CHEVRON MIRRORED — John's call, and it is what makes the pair read
   * as one control with two directions. Mirrored about the tile centre, y=21: the two paths must
   * be each other's reflection, so a tweak to one that is not made to the other fails here.
   */
  const chev = (m) => svg(m).match(/d="M72\.4 ([\d.]+)L79 ([\d.]+)L85\.6 ([\d.]+)"/)?.slice(1).map(Number);
  const up = chev('clap'), down = chev('boo');
  // Reflected about y = 21 (the tile's centre), so every matching pair sums to 42.
  t('R65 · clap and boo are one chevron mirrored about the tile centre',
    up && down && up.every((v, i) => Math.abs(v + down[i] - 42) < 0.001)
      && up[1] < up[0] && down[1] > down[0],
    `up ${up?.join('/')} · down ${down?.join('/')} · each pair sums to 42`);
}

console.log(`\nreact-pad: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
