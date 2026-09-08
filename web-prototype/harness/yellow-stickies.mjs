#!/usr/bin/env node
/**
 * 📒 **yellow-stickies — LHL notes cases, on the shipped session store.**
 *
 *   node harness/yellow-stickies.mjs
 *
 * Mirrors Last House Live `engine.test` notes: first show, rejoin, other seat, restore,
 * new room. Plus present-before-paint, at-most-one, peel release, and a source read that
 * the first-note copy and attachment points still match the slice.
 *
 * Pure node. No browser, no port, no CAST.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  NOTE_COPY, NOTE_IDS, FIRST_NOTE_IDS, PEEL,
  createNotesSession, takeSticky, restoreSticky, peelRelease, notesPersistKey,
  stickyHtml, notesCornerHtml,
} from '../src/party/notes.js';

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(join(here, rel), 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
const t = (n, c, d = '') => {
  if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); }
  else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); }
  return c;
};

function memoryPersist(bag, key) {
  return {
    load() { return Array.isArray(bag[key]) ? bag[key].slice() : []; },
    save(presented) { bag[key] = presented.slice(); },
  };
}

function codeOf(text) {
  return String(text || '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

console.log('\n📒 yellow-stickies — one-shot peelable onboarding\n');

const VOTE = NOTE_IDS.PHONE_VOTE;

/* =================================================================================================
 * YS1–YS6 · LHL notes cases
 * ============================================================================================== */

{
  const s = createNotesSession({ room: 'abcd', seat: 'p1' });
  const first = s.note({ id: VOTE });
  t('YS1 · first presentation shows',
    first.show === true && s.notesPresented.includes(VOTE),
    `show=${first.show} presented=${s.notesPresented.join(',')}`);
}

{
  const bag = {};
  const persist = memoryPersist(bag, notesPersistKey('abcd', 'p1'));
  const a = createNotesSession({ room: 'abcd', seat: 'p1', ...persist });
  a.note({ id: VOTE });
  const b = createNotesSession({ room: 'abcd', seat: 'p1', ...persist });
  const again = b.note({ id: VOTE });
  t('YS2 · rejoin does not auto-show',
    again.show === false && b.notesPresented.includes(VOTE),
    `show=${again.show}`);
}

{
  const a = createNotesSession({ room: 'abcd', seat: 'p1' });
  a.note({ id: VOTE });
  const other = createNotesSession({ room: 'abcd', seat: 'p2' });
  const r = other.note({ id: VOTE });
  t('YS3 · other seat can still auto-show',
    r.show === true && other.notesPresented.includes(VOTE),
    `show=${r.show}`);
}

{
  const s = createNotesSession({ room: 'abcd', seat: 'p1' });
  s.note({ id: VOTE });
  const noAuto = s.note({ id: VOTE });
  const restored = s.note({ id: VOTE, restore: true });
  t('YS4 · restore shows again',
    noAuto.show === false && restored.show === true,
    `auto=${noAuto.show} restore=${restored.show}`);
}

{
  const bag = {};
  const a = createNotesSession({
    room: 'room1', seat: 'tv', ...memoryPersist(bag, notesPersistKey('room1', 'tv')),
  });
  a.note({ id: NOTE_IDS.TV_CAST_READY });
  const b = createNotesSession({
    room: 'room2', seat: 'tv', ...memoryPersist(bag, notesPersistKey('room2', 'tv')),
  });
  t('YS5 · new room clears presented history',
    b.notesPresented.length === 0,
    `n=${b.notesPresented.length}`);
}

{
  const bag = {};
  const key = notesPersistKey('keep', 'phone');
  const a = createNotesSession({ room: 'keep', seat: 'phone', ...memoryPersist(bag, key) });
  a.note({ id: NOTE_IDS.PHONE_GUIDE_PIN });
  const restart = createNotesSession({ room: 'keep', seat: 'phone', ...memoryPersist(bag, key) });
  t('YS6 · same-room restart keeps history',
    restart.notesPresented.includes(NOTE_IDS.PHONE_GUIDE_PIN)
    && restart.note({ id: NOTE_IDS.PHONE_GUIDE_PIN }).show === false,
    `presented=${restart.notesPresented.join(',')}`);
}

/* =================================================================================================
 * YS7–YS9 · present-before-paint, at most one, peel
 * ============================================================================================== */

{
  const s = createNotesSession({ room: 'abcd', seat: 'p1' });
  const r = s.note({ id: VOTE });
  t('YS7 · presentation is recorded before display',
    r.show === true && s.notesPresented[0] === VOTE,
    'note() wrote notesPresented before returning show');
}

{
  const s = createNotesSession({ room: 'abcd', seat: 'p1' });
  const first = takeSticky(s, NOTE_IDS.PHONE_GUIDE_PIN, null);
  const second = takeSticky(s, NOTE_IDS.PHONE_RUNNER_DODGE, first.showing);
  t('YS8 · at most one sticky visible',
    first.show === true && first.showing === NOTE_IDS.PHONE_GUIDE_PIN
    && second.show === false && second.showing === NOTE_IDS.PHONE_GUIDE_PIN
    && !String(second.html || '').includes('data-sticky'),
    `first=${first.showing} second.show=${second.show}`);
}

{
  t('YS9 · peel tap / flop / slide',
    peelRelease({ dx: 0, dy: 0, vx: 0, vy: 0 }) === 'peel'
    && peelRelease({ dx: 30, dy: 10, vx: 0.1, vy: 0 }) === 'flop'
    && peelRelease({ dx: 90, dy: 0, vx: 0, vy: 0 }) === 'slide'
    && peelRelease({ dx: 20, dy: 20, vx: PEEL.SLIDE_V, vy: 0 }) === 'slide',
    `tap=${PEEL.TAP_PX} flop=${PEEL.FLOP_PX} v=${PEEL.SLIDE_V}`);
}

/* =================================================================================================
 * YS10–YS14 · copy, chrome, attachment
 * ============================================================================================== */

{
  const want = {
    'phone-guide-pin': 'Pin a door, painting, or camera spot. Runner auto-walks there.',
    'phone-runner-dodge': 'Stick is dodge and hide. Walk is automatic to the pin.',
    'phone-vote': 'Tap a name to nominate or vote. Your pick stays private until the count.',
    'tv-cast-ready': 'Everyone joins on a phone. TV is the shared show.',
  };
  const ids = FIRST_NOTE_IDS.slice();
  const copyOk = ids.every((id) => NOTE_COPY[id] === want[id]);
  const spoil = /evil|saboteur|glitched|traitor|alignment|minion|producer|plant|fixer/i;
  t('YS10 · first-note ids + copy match the slice, no role spoilers',
    copyOk && ids.length === 4 && !ids.some((id) => spoil.test(NOTE_COPY[id])),
    ids.map((id) => id).join(', '));
}

{
  const notesSrc = src('../src/party/notes.js');
  const phoneSrc = src('../src/views/party-phone.js');
  const hostSrc = src('../src/views/party-host.js');
  const phoneCode = codeOf(phoneSrc);
  const hostCode = codeOf(hostSrc);
  t('YS11 · phone presents via takeSticky / claimSticky before innerHTML',
    /takeSticky\(notesSession\(\), id, state\.stickyShowing\)/.test(phoneCode)
    && /claimSticky\(NOTE_IDS\.PHONE_GUIDE_PIN\)/.test(phoneCode)
    && /claimSticky\(NOTE_IDS\.PHONE_RUNNER_DODGE\)/.test(phoneCode)
    && /claimSticky\(NOTE_IDS\.PHONE_VOTE\)/.test(phoneCode)
    && /session\.note\(\{\s*id: want\s*\}\)/.test(codeOf(notesSrc)),
    'record then html');
}

{
  const hostCode = codeOf(src('../src/views/party-host.js'));
  t('YS12 · TV presents tv-cast-ready beside the QR',
    /claimSticky\(NOTE_IDS\.TV_CAST_READY\)/.test(hostCode)
    && /wrapSticky\(/.test(hostCode)
    && /night-qr/.test(hostCode),
    'lobby QR');
}

{
  const css = src('../src/party/notes.js');
  t('YS13 · CSS is yellow paper with curl / peel / flop / slide',
    /#f4e15a/.test(css)
    && /\.sticky-curl/.test(css)
    && /sticky-flop/.test(css)
    && /sticky-slide/.test(css)
    && /data-note-restore/.test(css),
    'paper + peel + Notes corner helper');
}

{
  const phoneCode = codeOf(src('../src/views/party-phone.js'));
  const notesCode = codeOf(src('../src/party/notes.js'));
  t('YS14 · Notes corner restore: true; pin/dodge still wrap the live first-use controls',
    /restore:\s*true/.test(notesCode)
    && /data-note-restore/.test(notesCode)
    && /data-pin-pad/.test(phoneCode)
    && /id="stick"/.test(phoneCode)
    && /wrapSticky\(/.test(phoneCode)
    && /PHONE_GUIDE_PIN/.test(phoneCode)
    && /PHONE_RUNNER_DODGE/.test(phoneCode),
    'Guide E pin chips + Runner D dodge stick');
}

/* =================================================================================================
 * YS15–YS16 · controls — a leaky store / a missing restore must go red
 * ============================================================================================== */

{
  function rejoinShows(factory) {
    const bag = {};
    const persist = memoryPersist(bag, 'k');
    const a = factory(persist);
    a.note({ id: VOTE });
    return factory(persist).note({ id: VOTE }).show === true;
  }
  const leakyFactory = () => {
    const presented = [];
    return {
      notesPresented: presented,
      note({ id, restore } = {}) {
        if (restore) return { show: true };
        const show = !presented.includes(id);
        return { show };
      },
    };
  };
  const shippedFactory = (persist) => createNotesSession({ room: 'ctrl', seat: 'p1', ...persist });
  t('YS15 · control · a store that records after return re-spawns; the shipped one does not',
    rejoinShows(leakyFactory) === true && rejoinShows(shippedFactory) === false,
    'leaky true · shipped false');
}

{
  const s = createNotesSession({ room: 'abcd', seat: 'p1' });
  s.note({ id: VOTE });
  const html = notesCornerHtml(s.notesPresented, { open: true });
  const paper = stickyHtml(VOTE);
  const restored = restoreSticky(s, VOTE);
  t('YS16 · restore chrome and paper are the shipped helpers',
    html.includes(`data-note-restore="${VOTE}"`)
    && paper.includes(NOTE_COPY[VOTE])
    && paper.includes('sticky-curl')
    && restored.show === true
    && restored.html.includes('data-sticky'),
    'corner + paper');
}

console.log(`\n  ${pass} passed · ${fail} failed\n`);
process.exit(fail ? 1 : 0);
