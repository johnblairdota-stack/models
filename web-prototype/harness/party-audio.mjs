#!/usr/bin/env node
/**
 * party-audio — THE PRIME TIME AUDIO LEAK RULE, and the two voices it governs.
 *
 *   node harness/party-audio.mjs
 *
 * The show ran SILENT until this slice: `src/audio/audio.js` was a large working synthesiser
 * that nothing in `src/party/` or `src/views/party-*.js` had ever called. Giving a hidden-role
 * game its first sound is not a wiring job — it opens a broadcast channel with no privacy model
 * on it at all, and this gate is that channel's entitlement check.
 *
 * 🚨 **WHY AUDIO NEEDS ITS OWN GATE AND CANNOT BORROW `party-follow`'s.** `cueViolations`
 * (`src/party/follow.js:534`) closes the follow iframe's channel by CONTENT: a field that is not
 * on the allowlist cannot be posted. Sound does not leak by content. It leaks by
 *
 *   TIMING     — a sting that fires one paint before the verdict plate tells the room the result
 *                early, and a screenshot review can never catch it: by the time the shutter is
 *                open the plate is up too.
 *   MAGNITUDE  — a parameter that is a CONTINUOUS function of a game value is a data channel. A
 *                bed whose intensity tracked true vote alignment, or a sting whose pitch rode the
 *                real margin, would broadcast an internal to eight people at once — including the
 *                Glitched — with nothing wrong on screen.
 *
 * The precedent is `src/party/log.js:69`, which blocks `player.claim_set` from the TV
 * specifically because DevTools on the host tab would read every cover. The host tab's
 * loudspeaker is the same tab.
 *
 * THE RULE, as three clauses, each with a section below:
 *   R1 CLOSED PAYLOAD  a cue is a validated object of facts already painted on that beat's HTML
 *   R2 BEAT-BOUND      a cue is refused on any beat but the one that paints its fact
 *   R3 FINITE VOICE    the whole cue space maps onto FIVE parameter blocks. No continuous
 *                      parameter exists, so there is nothing for a secret scalar to ride.
 *
 * 🚨 **A5, A6c AND A7c ARE THE CONTROL ARMS AND THEY ARE THE POINT.** `party-follow` F4 and
 * `party-isolation`'s injected leaks exist because a gate whose controls stop failing has gone
 * blind. A5 injects every forbidden field one at a time and each must be caught; A6c hands the
 * salt scanner a tampered copy of this repo's own source; A7c hands the host scanner a tampered
 * cue call. If any of them stops being a violation, this file is decorative.
 *
 * ⚠️ NO BROWSER, NO THREE, NO WEB AUDIO, NO DEPENDENCY — same discipline as `party-follow`.
 * `.github/workflows/gates.yml` runs the party chain with no `npm install`, so a gate must never
 * need one. `audio.js` guards its `window` block and `party-host.js`'s DOM work all lives inside
 * its default export, so both import cleanly in node; verified by A0.
 */

import { readFile } from 'node:fs/promises';
import {
  EVICT_STEPS, NAME_STEPS, SHOW_CUE_BEAT, SHOW_CUE_FORBIDDEN, SHOW_CUE_KEYS, SHOW_CUE_KINDS,
  playEviction, playNameLanded, showCueViolations, showCueVoice,
} from '../src/audio/audio.js';
import { FOLLOW_FORBIDDEN } from '../src/party/follow.js';
import { audioSilenced } from '../src/views/party-host.js';

let pass = 0, fail = 0;
const t = (n, c, d = '') => { if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); } else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); } return c; };

const AUDIO_SRC = await readFile(new URL('../src/audio/audio.js', import.meta.url), 'utf8');
const HOST_SRC = await readFile(new URL('../src/views/party-host.js', import.meta.url), 'utf8');

/**
 * A refused cue announces itself on `console.warn` — a developer who mis-wires one otherwise
 * gets no sound and no clue. This gate refuses ~60 cues on purpose, so it captures those warns
 * instead of drowning its own output in them, and then ASSERTS the count (A5c): a refusal that
 * stopped being announced would be a silent leak-block, which is the second-worst outcome after
 * a silent leak.
 */
let warned = [];
function quiet(fn) {
  const real = console.warn;
  console.warn = (...a) => { warned.push(a.join(' ')); };
  try { return fn(); } finally { console.warn = real; }
}

const NAME_OK = { kind: 'name', beat: 'reckoning', standing: 0 };
const EVICT_OK = { kind: 'evict', beat: 'execution', executed: true };

console.log('\nparty-audio — the show cues and the leak rule');

/* =============================================================================================
 * A0 · the two voices exist, are exported, and both modules load with no browser
 * ========================================================================================== */
{
  t('A0 · both show voices are exported functions',
    typeof playNameLanded === 'function' && typeof playEviction === 'function');
  t('A0b · the leak rule is queryable, not just promised',
    typeof showCueViolations === 'function' && typeof showCueVoice === 'function'
      && Array.isArray(SHOW_CUE_FORBIDDEN) && SHOW_CUE_KINDS.length === 2);
  /*
   * With no AudioContext there is no `ctx`, so a legal cue is a legal no-op — the same
   * "capture is silent because initAudio was never called" story the module header tells. What
   * matters is that it returns FALSE rather than throwing: a gate that could not call these in
   * node could not test them at all.
   */
  t('A0c · a legal cue in node is a silent no-op, not a throw',
    playNameLanded(NAME_OK) === false && playEviction(EVICT_OK) === false);
}

/* =============================================================================================
 * A1 · R1 · the forbidden list is a SUPERSET of the follow channel's
 *
 * Exactly `party-follow` F5's argument, one channel over: a secret that may not reach a
 * renderer must not be able to reach a loudspeaker instead. `audio.js` keeps a deliberate COPY
 * rather than importing `follow.js` (it has zero imports and must keep them — it is the survival
 * game's audio too), so this is the assertion that keeps the copy honest.
 * ========================================================================================== */
{
  const missing = FOLLOW_FORBIDDEN.filter((k) => !SHOW_CUE_FORBIDDEN.includes(k));
  t('A1 · SHOW_CUE_FORBIDDEN ⊇ FOLLOW_FORBIDDEN', missing.length === 0, missing.join(',') || 'all present');
  const scalars = ['margin', 'tally', 'votes', 'lynchVotes', 'threat', 'suspicion', 'alignment01', 'seed'];
  t('A1b · and it also names the SCALARS, which is the shape a magnitude leak arrives in',
    scalars.every((k) => SHOW_CUE_FORBIDDEN.includes(k)),
    scalars.filter((k) => !SHOW_CUE_FORBIDDEN.includes(k)).join(',') || 'all present');
  t('A1c · no allowlisted key is also forbidden — the two lists cannot contradict',
    Object.values(SHOW_CUE_KEYS).every((ks) => ks.every((k) => !SHOW_CUE_FORBIDDEN.includes(k))));
}

/* =============================================================================================
 * A2 · R1 · the closed payload holds, and nothing else does
 * ========================================================================================== */
{
  t('A2 · the two legal cues hold', showCueViolations(NAME_OK).length === 0
    && showCueViolations({ ...EVICT_OK, executed: false }).length === 0);
  t('A2b · an unknown kind is refused outright',
    showCueViolations({ kind: 'drone', beat: 'debrief' }).length > 0
      && showCueViolations(null).length > 0 && showCueViolations('name').length > 0);
  t('A2c · a key that is neither allowed nor known-forbidden is STILL a violation',
    showCueViolations({ ...NAME_OK, mood: 3 }).length > 0,
    'deny by default, same as the entitlement matrix');
  t('A2d · a missing or wrong-typed payload field is a violation, not a default',
    showCueViolations({ kind: 'name', beat: 'reckoning' }).length > 0
      && showCueViolations({ kind: 'name', beat: 'reckoning', standing: 1.5 }).length > 0
      && showCueViolations({ kind: 'name', beat: 'reckoning', standing: -1 }).length > 0
      && showCueViolations({ kind: 'evict', beat: 'execution' }).length > 0
      && showCueViolations({ kind: 'evict', beat: 'execution', executed: 'p3' }).length > 0,
    'executed is a BOOLEAN — a seat id here would be an identity on the wire');
}

/* =============================================================================================
 * A3 · R2 · THE TIMING CLAUSE. Legal fields on the wrong beat is a pre-reveal.
 *
 * This is the clause a screenshot review cannot enforce. `{kind:'name', standing:1}` fired on
 * DEBRIEF says a nomination exists before the Reckoning has painted a single row — every field
 * on it legal, the leak entirely in WHEN.
 * ========================================================================================== */
{
  const OTHER_BEATS = ['lobby', 'casting', 'expedition', 'recap', 'debrief', 'vote', 'verdict', 'reunion', '', null];
  t('A3 · each cue names exactly one legal beat',
    SHOW_CUE_BEAT.name === 'reckoning' && SHOW_CUE_BEAT.evict === 'execution');
  t('A3b · a perfectly-formed name cue on any other beat is refused',
    OTHER_BEATS.every((b) => showCueViolations({ ...NAME_OK, beat: b }).length > 0),
    OTHER_BEATS.length + ' beats');
  t('A3c · a perfectly-formed eviction cue on any other beat is refused',
    [...OTHER_BEATS, 'reckoning'].every((b) => showCueViolations({ ...EVICT_OK, beat: b }).length > 0));
  t('A3d · and the play functions refuse them too, not just the validator',
    quiet(() => playNameLanded({ ...NAME_OK, beat: 'debrief' }) === false
      && playEviction({ ...EVICT_OK, beat: 'vote' }) === false));
  t('A3e · a cue cannot be played through the wrong voice',
    quiet(() => playNameLanded(EVICT_OK) === false && playEviction(NAME_OK) === false));
}

/* =============================================================================================
 * A4 · R3 · THE MAGNITUDE CLAUSE. The whole legal cue space maps onto FIVE voices.
 *
 * This is deliberately stronger than "do not leak the margin". A finite, enumerable voice space
 * has no continuous parameter in it: no pitch to slide, no gain to swell, nothing for a room of
 * eight people to read a number off. Wire any game scalar into a cue parameter and the count
 * below moves, whatever it is called.
 * ========================================================================================== */
{
  const fp = (v) => JSON.stringify(v, Object.keys(v).sort());
  const names = [];
  for (let s = 0; s <= 15; s++) names.push(showCueVoice({ kind: 'name', beat: 'reckoning', standing: s }));
  const evicts = [true, false].map((e) => showCueVoice({ kind: 'evict', beat: 'execution', executed: e }));

  t('A4 · every legal cue resolves to a voice, and every illegal one to null',
    names.every(Boolean) && evicts.every(Boolean)
      && showCueVoice({ ...NAME_OK, margin: 4 }) === null
      && showCueVoice({ ...NAME_OK, beat: 'debrief' }) === null);

  const nameFps = new Set(names.map(fp));
  const evictFps = new Set(evicts.map(fp));
  t('A4b · sixteen distinct nomination counts make exactly NAME_STEPS sounds',
    nameFps.size === NAME_STEPS && NAME_STEPS === 3, `${nameFps.size} of 16 counts, NAME_STEPS=${NAME_STEPS}`);
  t('A4c · the eviction has exactly EVICT_STEPS sounds — out, and nobody',
    evictFps.size === EVICT_STEPS && EVICT_STEPS === 2, `${evictFps.size}`);
  t('A4d · FIVE voices is the entire audible vocabulary of the night loop',
    new Set([...nameFps, ...evictFps]).size === 5);
  t('A4e · a board of nine nominees sounds exactly like a board of three — the count is CLAMPED',
    fp(names[3]) === fp(names[15]) && fp(names[2]) === fp(names[9]),
    'an unclamped count is a continuous parameter with extra steps');
  t('A4f · showCueVoice is PURE — same cue, byte-identical voice, no clock and no module state',
    fp(showCueVoice(NAME_OK)) === fp(showCueVoice({ ...NAME_OK }))
      && fp(showCueVoice(EVICT_OK)) === fp(showCueVoice({ kind: 'evict', beat: 'execution', executed: true })));
  t('A4g · NOBODY is not a quieter eviction — it is a different voice',
    fp(evicts[0]) !== fp(evicts[1]) && evicts[0].dropG > 0 && evicts[1].dropG === 0,
    'a "no eviction" that sounded like a small eviction is one fact said wrong');
}

/* =============================================================================================
 * 🚨 A5 · THE CONTROL ARM. Every forbidden field, injected one at a time, must be caught.
 *
 * If any of these stops being a violation, somebody has widened the allowlist and this gate has
 * gone blind. The scalars are the ones that matter most: `margin` on an eviction cue is the
 * exact defect this whole file exists to prevent, and it is the one a well-meaning reviewer
 * adds while thinking about drama rather than about the Glitched.
 * ========================================================================================== */
{
  const PROBES = [
    ...SHOW_CUE_FORBIDDEN.map((k) => [k, 1]),
    ['margin', 3], ['tally', { p1: 2 }], ['alignment', 'evil'], ['role', 'Glitched'],
    ['executed', 'p3'],   // the id instead of the boolean
    ['intensity', 0.87], ['pitch', 440], ['loud', true],   // not forbidden BY NAME — denied by default
  ];
  let caught = 0;
  for (const [k, v] of PROBES) {
    const nameCue = { ...NAME_OK, [k]: v };
    const evictCue = { ...EVICT_OK, [k]: v };
    const blocked = showCueViolations(nameCue).length > 0
      && showCueViolations(evictCue).length > 0
      && showCueVoice(nameCue) === null && showCueVoice(evictCue) === null
      && quiet(() => playNameLanded(nameCue) === false && playEviction(evictCue) === false);
    if (blocked) caught++; else t(`A5 control ${k} · must be a violation`, false, `value ${JSON.stringify(v)}`);
  }
  t(`A5 · all ${PROBES.length} injected leaks refused at the validator, the voice AND the synth`,
    caught === PROBES.length, `${caught}/${PROBES.length}`);
  t('A5c · every one of those refusals announced itself, and named a KEY and never a VALUE',
    warned.length === PROBES.length * 2 + 4
      && warned.every((w) => w.startsWith('[audio] show cue refused'))
      && !warned.some((w) => /Glitched|evil|0\.87|440/.test(w)),
    `${warned.length} warns · printing the offending VALUE would recreate log.js:69's bug`);
  t('A5b · and the headline one on its own, named, so a diff never quietly deletes it',
    showCueViolations({ ...EVICT_OK, margin: 5 }).length > 0
      && showCueVoice({ ...EVICT_OK, margin: 5 }) === null,
    'a sting whose pitch rode the real margin would leak to the whole room');
}

/* =============================================================================================
 * A6 · R3's fine print · THE JITTER MAY NOT BE SALTED ON A CUE VALUE.
 *
 * Both voices draw per-call jitter from `seedRand(_audioSeed, salt)`, exactly as every other
 * voice in the module does, so two taps are not the same tap. That jitter is only harmless while
 * its SALT is the call counter: salt it on a cue field instead and you have finite tables with
 * secret dither underneath — R3's clothes over R3's defect. Nothing about the sound would look
 * wrong, and no unit test of `showCueVoice` would notice, because `showCueVoice` is not where it
 * would live. So this reads the source.
 * ========================================================================================== */
{
  const region = (src, from, to) => {
    const a = src.indexOf(from);
    const b = src.indexOf(to, a + 1);
    return a >= 0 && b > a ? src.slice(a, b) : '';
  };
  const VOICES = region(AUDIO_SRC, 'export function playNameLanded', "if (typeof window !== 'undefined')");
  t('A6 · the two show voices were found in source', VOICES.length > 500 && VOICES.includes('export function playEviction'));

  /** The scanner, as a function, so A6c can hand it a tampered copy. */
  function saltViolations(src) {
    const bad = [];
    const salts = [...src.matchAll(/const\s+salt\s*=\s*([^;]+);/g)].map((m) => m[1].trim());
    for (const s of salts) if (!/^_(showHit|evictHit)$/.test(s)) bad.push(`salt=${s}`);
    if (!salts.length) bad.push('no salt found at all');
    for (const m of src.matchAll(/seedRand\(_audioSeed,\s*`([^`]*)`\)/g)) {
      for (const i of m[1].matchAll(/\$\{([^}]*)\}/g)) {
        if (i[1].trim() !== 'salt') bad.push(`seedRand salt interpolates ${i[1].trim()}`);
      }
    }
    return bad;
  }
  const live = saltViolations(VOICES);
  t('A6b · every jitter draw in both voices is salted on the call counter alone',
    live.length === 0, live.join(', ') || 'clean');

  /* 🚨 THE CONTROL. Two tampered copies of this repo's own source; both must go red. */
  const tamperA = VOICES.replace('const salt = _showHit;', 'const salt = cue.standing;');
  const tamperB = VOICES.replace('`nlf|${salt}`', '`nlf|${salt}|${cue.standing}`');
  t('A6c control · a salt taken from a cue field is caught',
    tamperA !== VOICES && saltViolations(tamperA).length > 0);
  t('A6d control · and so is a cue field smuggled into the salt STRING',
    tamperB !== VOICES && saltViolations(tamperB).length > 0,
    'the dither is the channel, not the table');
}

/* =============================================================================================
 * A7 · THE HOST END. What `party-host.js` actually passes, and where it passes it from.
 *
 * `src/views/party-host.js` fences its audio wiring between `@audio-cue-builder:start` and
 * `:end`. That block is the only place in the TV that may touch a cue, and this section reads it
 * as text: comments stripped (the rule is about code, and the prose in there deliberately NAMES
 * the forbidden fields in order to warn about them), then scanned twice — once for the keys that
 * actually reach the synth, once for any forbidden identifier at all.
 * ========================================================================================== */
{
  const S = '@audio-cue-builder:start';
  const E = '@audio-cue-builder:end';
  const a = HOST_SRC.indexOf(S), b = HOST_SRC.indexOf(E);
  t('A7 · the host fences its audio wiring between the two sentinels', a > 0 && b > a);
  const BLOCK = HOST_SRC.slice(a, b);

  /* Naive but sufficient: this block contains no string with a comment marker in it, asserted
   * below so the stripper cannot silently start eating code. */
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  const CODE = strip(BLOCK);
  t('A7a · stripping comments leaves real code behind',
    CODE.includes('playNameLanded(') && CODE.includes('playEviction(') && !CODE.includes('DevTools'));

  /** Scanner 1 — the keys that actually reach the synth. */
  function cueKeyViolations(code) {
    const bad = [];
    let n = 0;
    for (const m of code.matchAll(/play(NameLanded|Eviction)\(\{([^}]*)\}\)/g)) {
      n++;
      const kind = m[1] === 'NameLanded' ? 'name' : 'evict';
      const keys = [...m[2].matchAll(/([A-Za-z_$][\w$]*)\s*:/g)].map((k) => k[1]);
      for (const k of keys) if (!SHOW_CUE_KEYS[kind].includes(k)) bad.push(`${kind}.${k}`);
      for (const k of SHOW_CUE_KEYS[kind]) if (!keys.includes(k)) bad.push(`${kind}.${k}:missing`);
    }
    if (n !== 2) bad.push(`call sites=${n}`);
    return bad;
  }
  /** Scanner 2 — any forbidden identifier anywhere in the block's code. */
  function tokenViolations(code) {
    return SHOW_CUE_FORBIDDEN.filter((k) => new RegExp(`\\b${k}\\b`).test(code));
  }

  const keyBad = cueKeyViolations(CODE);
  t('A7b · the host passes exactly the allowlisted keys, at exactly two call sites',
    keyBad.length === 0, keyBad.join(',') || 'kind/beat/standing + kind/beat/executed');
  const tokBad = tokenViolations(CODE);
  t('A7c · and the block mentions no forbidden identifier at all',
    tokBad.length === 0, tokBad.join(',') || 'clean');

  /* 🚨 THE CONTROL. Three tampered blocks — the three shapes this defect actually ships in. */
  const tam1 = CODE.replace('executed: out }', 'executed: out, margin: m }');
  const tam2 = CODE.replace('standing: audioSeen.standing }', 'standing: audioSeen.standing, alignment: a }');
  const tam3 = `${CODE}\n const x = client.frame.deal;\n`;
  t('A7d control · a margin smuggled onto the eviction cue is caught',
    tam1 !== CODE && cueKeyViolations(tam1).length > 0, cueKeyViolations(tam1).join(','));
  t('A7e control · an alignment smuggled onto the name cue is caught',
    tam2 !== CODE && cueKeyViolations(tam2).length > 0 && tokenViolations(tam2).length > 0);
  t('A7f control · and a forbidden value merely READ inside the block is caught',
    tokenViolations(tam3).length > 0,
    'a cue computed from a secret is a leak even when the cue looks clean');
  t('A7g control · deleting a call site is caught too — a silent TV is a regression',
    cueKeyViolations(CODE.replace('playEviction(', 'noPlay(')).length > 0);
}

/* =============================================================================================
 * A8 · THE GESTURE, THE ORDERING, AND THE OFF SWITCH.
 * ========================================================================================== */
{
  const iStart = HOST_SRC.indexOf('function startNight()');
  const iSend = HOST_SRC.indexOf('function sendThemIn()');
  const iInit = HOST_SRC.indexOf('initAudio({');
  t('A8 · initAudio is created inside startNight — the #go click, a real user gesture on a real top-level document',
    iStart > 0 && iSend > iStart && iInit > iStart && iInit < iSend);
  t('A8b · and it is handed a capture flag, exactly like the survival game hands it an engine',
    /initAudio\(\{\s*capture:\s*audioSilent\s*\}\)/.test(HOST_SRC));
  t('A8c · initAudio is CALLED exactly once — one context, one gesture, one place to audit',
    (HOST_SRC.match(/initAudio\(/g) || []).length === 1,
    'the named import carries no paren, so this counts call sites only');

  /*
   * ⏱️ **THE ORDERING IS THE TIMING CLAUSE MADE PHYSICAL.** `fireShowAudio` is called after the
   * last `root.innerHTML = ` assignment in `paint()`, so a cue cannot precede the pixels it
   * describes. Fired from `onMessage` instead, the sting would land one paint before the verdict
   * plate — early to the whole room, invisible to any screenshot.
   */
  const iPaint = HOST_SRC.lastIndexOf('root.innerHTML = ');
  // ⚠️ the trailing `;` is load-bearing: without it this finds the DECLARATION, several hundred
  // lines above `paint()`, and the ordering assertion below passes for the wrong reason. Caught
  // by this gate failing on its own first run.
  const iFire = HOST_SRC.indexOf('fireShowAudio(show, episode);');
  t('A8d · the cue call sits AFTER the innerHTML that paints the beat',
    iPaint > 0 && iFire > iPaint, `innerHTML@${iPaint} fire@${iFire}`);
  t('A8e · and the eviction waits for lynchResult — the same condition the verdict plate waits for',
    /show === 'execution' && client\.lynchResult/.test(HOST_SRC));

  /*
   * 🔇 THE OFF SWITCH. `?view=party.host` had no capture flag of any kind before this slice, and
   * roughly two dozen Playwright drivers open the page for real. None of them passes `capture`;
   * every one of them is Playwright, whose Chromium leaves `navigator.webdriver` true — so the
   * existing fleet goes silent with no edit to any driver. `?audio=1` is the escape hatch that
   * keeps a FUTURE audio driver able to measure the real page.
   */
  const P = (q) => new URLSearchParams(q);
  t('A8f · a real TV with a real audience makes sound', audioSilenced(P(''), {}) === false);
  t('A8g · every Playwright driver is silent with no edit to the driver',
    audioSilenced(P(''), { webdriver: true }) === true
      && audioSilenced(P('room=abcd&wsPort=5181&dev=1'), { webdriver: true }) === true);
  t('A8h · ?capture=1 and ?audio=0 are silent too', audioSilenced(P('capture=1'), {}) === true
    && audioSilenced(P('capture'), {}) === true && audioSilenced(P('audio=0'), {}) === true);
  t('A8i · ?audio=1 overrides all of it, or the cues could never be measured from a browser',
    audioSilenced(P('audio=1'), { webdriver: true }) === false
      && audioSilenced(P('capture=1&audio=1'), {}) === false);
  t('A8j · a missing navigator is not a crash and is not a licence to make noise',
    audioSilenced(P(''), null) === false && audioSilenced(P(''), undefined) === false,
    'no webdriver, no capture, no mute = a real page');
  t('A8k · the builder short-circuits on the flag, so a silenced page never even forms a cue',
    /function fireShowAudio\([^)]*\)\s*\{\s*(?:\/\*[\s\S]*?\*\/\s*)?if \(audioSilent\) return;/.test(HOST_SRC));
}

/* =============================================================================================
 * A9 · THE FOLLOW IFRAME STAYS MUTE.
 *
 * D13's whole safety argument is that the renderer has no channel. Audio lives on the host page,
 * which is the document that was actually clicked; the iframe never receives a gesture of its
 * own, and giving it a loudspeaker would be arguing with D13 for no gain.
 * ========================================================================================== */
{
  const follow = await readFile(new URL('../src/views/party-follow.js', import.meta.url), 'utf8');
  const phone = await readFile(new URL('../src/views/party-phone.js', import.meta.url), 'utf8');
  t('A9 · the follow view imports no audio', !/audio\/audio\.js/.test(follow));
  t('A9b · and neither does the phone — D13, the phone is a controller',
    !/audio\/audio\.js/.test(phone));
  t('A9c · the host is the one party view that does',
    /from '\.\.\/audio\/audio\.js'/.test(HOST_SRC));
}

/* =============================================================================================
 * A10 · THE VOICES ACTUALLY BUILD A GRAPH.
 *
 * Everything above this line tests the RULE. None of it would notice a typo in the synthesis —
 * a wrong node type, a param set on a node that has not got one, an `exponentialRampToValue` to
 * zero — because with no `AudioContext` every `play*` returns early at the `!ctx` guard and
 * looks like a well-behaved no-op. That is precisely how this module shipped three voices that
 * "sat unheard for four days" (file header): nothing was exercising them.
 *
 * So: a minimal fake Web Audio API, `initAudio` through it, and both voices fired. No browser,
 * no dependency — it is a hundred lines of stub. It proves the graph CONSTRUCTS and is honest
 * that it proves nothing about how it SOUNDS; the ear check needs `harness/audio-render.mjs`
 * and a browser, and is not in this chain.
 *
 * ⚠️ The `?smoke=1` on the import is a cache-buster, not decoration. ESM caches by URL and this
 * file already imported `audio.js` at the top, before `globalThis.window` existed; without a
 * fresh specifier the stub would arrive too late for the module-eval-time `window` block.
 * ========================================================================================== */
{
  const param = () => ({
    value: 0,
    setValueAtTime() { return this; },
    linearRampToValueAtTime() { return this; },
    exponentialRampToValueAtTime() { return this; },
    setTargetAtTime() { return this; },
    cancelScheduledValues() { return this; },
  });
  const built = { osc: 0, src: 0, filter: 0, gain: 0, started: 0 };
  const node = (extra) => ({ connect() {}, disconnect() {}, ...extra });
  const ctx = {
    currentTime: 1.25,
    sampleRate: 44100,
    state: 'running',
    destination: node({}),
    resume: () => Promise.resolve(),
    createGain: () => { built.gain++; return node({ gain: param() }); },
    createAnalyser: () => node({ fftSize: 0, getFloatTimeDomainData() {} }),
    createBiquadFilter: () => { built.filter++; return node({ type: '', frequency: param(), Q: param(), detune: param() }); },
    createOscillator: () => { built.osc++; return node({ type: '', frequency: param(), detune: param(), start() { built.started++; }, stop() {} }); },
    createBufferSource: () => { built.src++; return node({ buffer: null, loop: false, playbackRate: param(), start() { built.started++; }, stop() {} }); },
    createBuffer: (ch, len) => ({ length: len, numberOfChannels: ch, sampleRate: 44100, getChannelData: () => new Float32Array(len) }),
    createStereoPanner: () => node({ pan: param() }),
    createDelay: () => node({ delayTime: param() }),
    createWaveShaper: () => node({ curve: null, oversample: 'none' }),
  };
  globalThis.window = { AudioContext: function () { return ctx; } };
  const A = await import('../src/audio/audio.js?smoke=1');

  A.initAudio({ capture: false });
  t('A10 · initAudio builds a live context on the TV with no engine and no WebGL',
    globalThis.window.__rrrAudio?.hasCtx() === true,
    'the TV is DOM only — `initAudio` reads engine?.capture and nothing else');
  t('A10b · and it stays inert when the page is silenced',
    (() => { const B = { capture: true }; return A.initAudio(B) === undefined; })());

  A.seedAudioVariation(0x51e);
  /** Node counts built by one call — the only thing a stub can honestly measure. */
  const delta = (fn) => {
    const b0 = { ...built };
    const ok = fn();
    return { ok, src: built.src - b0.src, osc: built.osc - b0.osc, gain: built.gain - b0.gain, started: built.started - b0.started };
  };

  const n0 = delta(() => A.playNameLanded({ kind: 'name', beat: 'reckoning', standing: 0 }));
  const n2 = delta(() => A.playNameLanded({ kind: 'name', beat: 'reckoning', standing: 2 }));
  const eOut = delta(() => A.playEviction({ kind: 'evict', beat: 'execution', executed: true }));
  const eNone = delta(() => A.playEviction({ kind: 'evict', beat: 'execution', executed: false }));

  t('A10c · all four calls build a graph and report that they played',
    [n0, n2, eOut, eNone].every((d) => d.ok === true));
  t('A10d · a name landing is three layers — noise slap, triangle body, noise tick',
    n0.src === 2 && n0.osc === 1 && n0.gain === 3 && n0.src === n2.src && n0.osc === n2.osc,
    JSON.stringify(n0));
  t('A10e · an eviction is drop + curtain + a DETUNED PAIR, on one shared hold gain',
    eOut.src === 1 && eOut.osc === 3 && eOut.gain === 3,
    JSON.stringify(eOut) + ' — the pair is what makes the tail beat instead of sitting flat');
  t('A10f · NOBODY builds one oscillator FEWER — the drop is absent, not merely quiet',
    eNone.osc === eOut.osc - 1 && eNone.src === eOut.src,
    JSON.stringify(eNone));
  t('A10g · every node built was started — nothing constructed and left silent',
    [n0, n2, eOut, eNone].every((d) => d.started === d.src + d.osc));
  t('A10h · and no voice is longer than a beat can hold — nothing rings past ~0.7 s',
    [0, 1, 2].every((sd) => {
      const v = A.showCueVoice({ kind: 'name', beat: 'reckoning', standing: sd });
      return v.dur * 2.4 < 0.25;
    }) && [true, false].every((e) => {
      const v = A.showCueVoice({ kind: 'evict', beat: 'execution', executed: e });
      return Math.max(v.holdDur, v.curtainDur, v.dropDur) + 0.05 < 0.7;
    }),
    'Recap is ~10 s and the room is talking — a sting that rings is a sting they resent');

  /* 🚨 CONTROL. The stub must be able to SEE a voice that does nothing, or A10c is a rubber
   * stamp: a `play*` that returned true having built nothing would pass every check above. */
  const refused = quiet(() => delta(() => A.playNameLanded({ kind: 'name', beat: 'reckoning', standing: 0, margin: 4 })));
  t('A10i control · a refused cue builds NOTHING — no node, no start, no half a voice',
    refused.ok === false && refused.src === 0 && refused.osc === 0 && refused.gain === 0);
  delete globalThis.window;
}

console.log(`\nparty-audio: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
