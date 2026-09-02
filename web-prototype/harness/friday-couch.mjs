#!/usr/bin/env node
/**
 * 🛋️ **friday-couch — NO DEV KEYS, AND THE NIGHT ANSWERS FOR ITSELF.**
 *
 *   node harness/friday-couch.mjs
 *   node harness/friday-couch.mjs --write my-night   # also drop the book on disk, for a real night
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------------
 * `docs/design/COUCH-PLAN.md` Rung 7 is a Friday: eight humans, one TV, one full season, and a
 * fun check nothing can gate — *someone lies, the room catches them with a fact it saw, and they
 * die to a count the whole room believes.* Its Verify section asks for exactly two things a
 * machine CAN do, and this is both of them:
 *
 *   1. **No couch URL carries `dev=1`.** That flag boots the sim puppet
 *      (`src/party/loop8-tick.js`), which drives eight fake phones. A guest tab that inherited it
 *      would put a robot on the couch. It also opens the `?dev=1` skip key on the TV and the
 *      read-only probe window on the pad.
 *   2. **The night is saved as JSON next to `harness/_loop8/`, and every quote can be traced to
 *      it.** Afterwards someone says *"the board said five of eight clears"* and either the book
 *      says which episode, or it says **that is not from this night**.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 THE THING THIS GATE CANNOT PROVE, STATED OUT LOUD
 * ---------------------------------------------------------------------------------------------
 * Two thirds of the fun check are on the wire. **The lie is not.** Nothing in `src/` or `net/`
 * emits `chat.posted` — `reunion.js` `speakerNamed`'s header says so, `room-ghosts` RG5b states
 * the zero-of-zero rather than letting it read as coverage, and every talk line in the four blind
 * nights came from a `harness/_loop8/drive-*.mjs` puppet. On a real Friday the lie is a sentence a
 * person says at a table and no JSON will ever hold it. FC5 is the fail-CLOSED guard on that: the
 * day something DOES start emitting talk, FC5 goes red and whoever lands it has to decide whether
 * the night book carries it — rather than discovering months later that it silently did.
 *
 * ⚠️ **AND THE BOOK IS A LEAK SURFACE, BECAUSE IT IS WRITTEN DOWN AND READ BY PEOPLE.** Rung 3
 * spent a whole gate proving whisper words reach exactly two phones and no third screen. A night
 * file that copied them out afterwards would undo that after the fact — later, on disk, where no
 * wire gate is looking. FC6 is `bookLeaks` as a deny-by-default schema and FC6b plants a real
 * whisper payload in a book to prove the seal actually closes.
 *
 * Pure node. No browser, no `npm install`, no port — `.github/workflows/gates.yml` runs the party
 * chain with neither, and every question here is answerable from source text plus a room built in
 * memory, which is the same argument `target-sight.mjs` and `room-ghosts.mjs` make.
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createRoom } from '../src/party/room.js';
import { missionFor } from '../src/party/mission.js';
import { reunion } from '../src/party/reunion.js';
import { WIN_TARGETS } from '../src/party/win.js';
import {
  BOOK_FORBIDDEN, BOOK_KEYS, EPISODE_KEYS,
  bookLeaks, bookLines, bookPath, episodesFromLog, nightBook, normQuote, quoteCheck,
} from '../src/party/night-book.js';

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(join(here, '..', rel), 'utf8').replace(/\r\n/g, '\n');
/** Same read, but `null` when the file is not in this tree. See FC3b — the puppet is untracked. */
const srcOpt = (rel) => { try { return src(rel); } catch { return null; } };

/**
 * Every shipped source file, walked rather than listed.
 *
 * ⚠️ The `episode-order` lesson, applied to a gate that greps: a hand-kept array of six views is a
 * gate that goes quiet the day a seventh view is added. This walks `src/` and `net/` whole, so a
 * new file is covered on the day it lands and not on the day somebody remembers.
 */
function shippedFiles(dirs = ['src', 'net'], out = []) {
  for (const d of dirs) {
    let entries;
    try { entries = readdirSync(join(here, '..', d)); } catch { continue; }
    for (const name of entries) {
      const rel = `${d}/${name}`;
      const abs = join(here, '..', rel);
      let st;
      try { st = statSync(abs); } catch { continue; }
      if (st.isDirectory()) shippedFiles([rel], out);
      else if (/\.(js|mjs|html)$/.test(name)) out.push(rel.split(sep).join('/'));
    }
  }
  return out;
}

let pass = 0, fail = 0;
const t = (n, c, d = '') => {
  if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); }
  else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); }
  return c;
};

const argv = process.argv.slice(2);
const WRITE = argv.indexOf('--write') >= 0 ? (argv[argv.indexOf('--write') + 1] || 'night') : null;

const hostSrc = src('src/views/party-host.js');
const phoneSrc = src('src/views/party-phone.js');
const mainSrc = src('src/main.js');
/**
 * 🚨 **OPTIONAL ON PURPOSE, AND THIS IS THE WHOLE POINT.** `src/party/loop8-tick.js` is untracked
 * in-flight work (`task-runner-intel.md` Trap 5 says leave it alone), so **CI checks out a tree
 * with no puppet in it at all.** A gate that read it unconditionally would throw before its first
 * assertion on the one machine that matters. Worse, it would read as a *product* failure. FC3 is
 * therefore written against the property that holds either way — nothing imports it — and FC3b
 * inspects the boot guard only when the file is actually here.
 */
const tickSrc = srcOpt('src/party/loop8-tick.js');

console.log('\nfriday-couch — no dev keys, and the night answers for itself');

/* =============================================================================================
 * FC1–FC3c · NO DEV KEYS ON THE COUCH
 *
 * Four doors, because `dev=1` can arrive by four routes and only one of them is a string in a
 * source file: the QR a guest scans (FC1), whatever the two screens are willing to read the flag
 * FROM (FC2), the puppet module itself and whether anything pulls it into the bundle (FC3/FC3b),
 * and the link list painted on the television that a guest can click (FC3c). A plain
 * `grep -r 'dev=1' src/` answers none of them — the flag lives in the URL BAR.
 * ============================================================================================= */

console.log('\n  no dev keys');

/*
 * The join URL is the ONE url a guest ever types, because the QR encodes the same string. It is
 * built from `location.origin` plus the view and the room and nothing else — so a TV that was
 * itself opened with `?dev=1` still hands out a clean phone. That is the property, and it is the
 * one a "grep for dev=1" check would have missed entirely: the flag is not in this file's URLs,
 * it is in the URL BAR, and the question is whether it propagates.
 */
{
  const line = (hostSrc.match(/^\s*const joinPath = .*$/m) || [])[0] || '';
  const usesOrigin = /location\.origin/.test(line);
  const params = [...line.matchAll(/[?&]([a-zA-Z0-9_]+)=/g)].map((m) => m[1]);
  const qr = /qrSvg\(joinPath[,)]/.test(hostSrc);
  t('FC1 · the join URL the TV prints and encodes is view + room, and carries no flag of any kind',
    usesOrigin && qr
    && params.join(',') === 'view,room'
    && !/dev/.test(line)
    && !/params\.get\('dev'\)[^\n]*joinPath/.test(hostSrc),
    `${params.length ? params.join(' + ') : '<none>'} · qr encodes the same string: ${qr}`);
}

/*
 * ...and the flag has exactly one reader on each screen, both of them opt-in on the URL, both of
 * them guarded rather than inferred from anything else (a hostname, a port, a stored value).
 */
{
  const hostDev = [...hostSrc.matchAll(/params\.get\('dev'\) === '1'/g)].length;
  const phoneDev = [...phoneSrc.matchAll(/params\.get\('dev'\) === '1'/g)].length;
  t('FC2 · `dev` is opt-in on the URL and read nowhere else — not from a host, a port or storage',
    hostDev >= 1 && phoneDev >= 1
    && !/localhost[^\n]*dev|dev[^\n]*localhost/i.test(hostSrc)
    && !/sessionStorage[^\n]*dev|localStorage[^\n]*dev/.test(hostSrc)
    && !/sessionStorage[^\n]*dev|localStorage[^\n]*dev/.test(phoneSrc),
    `TV ${hostDev} reader · pad ${phoneDev} reader`);
}

/*
 * 🚨 **THE PUPPET, AND THE ONE LINE THAT MUST NEVER BE COMMITTED.** `loop8-tick.js` boots eight
 * fake phones. Its own last line guards on `?dev=1`, and **that guard is worth nothing if a
 * shipped file imports the module**: a static `import` executes the file, the file reads
 * `location.search` itself, and on a `?dev=1` tab it boots — but the far worse shape is that the
 * import makes the puppet part of the bundle for every tab, so the guard becomes the only thing
 * standing between a guest and eight robots. The branch has carried exactly that leftover in a
 * working tree more than once; it is the first thing the Rung 7 brief warns not to commit.
 *
 * The sweep is over EVERY file under `src/` and `net/`, not a list — see `shippedFiles`.
 */
{
  const NEEDLE = /loop8[-_]?tick/i;
  const files = shippedFiles().filter((f) => f !== 'src/party/loop8-tick.js');
  const importers = files.filter((f) => NEEDLE.test(src(f)));
  // The control, because "0 importers" over 100 files is the exact shape a broken matcher makes.
  const planted = ["import '../party/loop8-tick.js';", 'import "./loop8_tick.js";',
    "await import('../party/loop8-tick.js')"].filter((s) => NEEDLE.test(s));
  t('FC3 · NOTHING in `src/` or `net/` imports the sim puppet — swept whole, not from a list',
    importers.length === 0 && planted.length === 3 && files.length > 20,
    `${files.length} shipped files swept · importers ${importers.length ? importers.join(', ') : 'none'}`
    + ` · control: ${planted.length}/3 planted import lines caught`);
}

/*
 * FC3b · and when the puppet IS in the tree, its own boot guard is still the `?dev=1` test.
 *
 * Absence is not a skip here, it is the SAFER state and is stated as such: no file, no bundle
 * entry, nothing to boot. What would be a skip is staying silent about which of the two this run
 * saw, so the line prints it.
 */
{
  const here7 = tickSrc != null;
  const boots = here7 && /if \(typeof window !== 'undefined' && \/\[\?&\]dev=1\\b\/\.test\(location\.search\)\) boot\(\);/.test(tickSrc);
  t('FC3b · the puppet self-boots behind `?dev=1` only — or is not in this tree at all',
    !here7 || boots,
    here7
      ? `present in this working tree · boot guard ${boots ? 'is the ?dev=1 test' : 'MISSING'}`
      : 'not in this tree — untracked in-flight work, and absent is the safer of the two');
}

/*
 * FC3c · **the view menu is a real couch path, and it drops every flag.**
 *
 * `main.js` `buildViewMenu` paints a link per view on every non-capture page, so a TV opened with
 * `?dev=1` has a clickable list of them on screen. `a.href` is written as a whole new query
 * string — `?view=<id>` and nothing appended — so clicking one LOSES `dev`. That is propagation
 * asked at the third door: FC1 is the QR a guest scans, FC2 is who may read the flag, and this is
 * the link a guest clicks on the television itself.
 */
{
  const href = (mainSrc.match(/^\s*a\.href = .*$/m) || [])[0] || '';
  const rebuilds = /a\.href = `\?view=\$\{encodeURIComponent\(v\.id\)\}`;/.test(href);
  t('FC3c · the on-screen view menu rebuilds the query string, so a click drops `dev` with it',
    rebuilds && !/location\.search/.test(href) && !/dev/.test(href),
    rebuilds ? '`?view=${id}` — a fresh query, never location.search + a flag' : `saw: ${href.trim() || '<no a.href>'}`);
}

/* =============================================================================================
 * FC4–FC5 · THE NIGHT, AS A BOOK
 * ============================================================================================= */

console.log('\n  the night book');

/** One real season, played in memory. Same shape `reunion-truth` uses. */
function playNight(seed) {
  const r = createRoom({ count: 8, castSeed: seed * 41, worldSeed: seed, send: () => {}, emit: () => {} });
  r.start();
  r.playEpisode({ hunterRoom: 'cellar' });
  const living = r.state.players.filter((p) => p.alive).map((p) => p.id);
  r.playEpisode({
    hunterRoom: 'gallery', takeRunner: true,
    nominations: [{ nominator: living[1], target: living[3] }],
    votes: Object.fromEntries(living.map((id) => [id, living[3]])),
  });
  r.playMatch({ hunterRoom: 'hall' });
  const align = Object.fromEntries(r.deal.seats.map((s) => [s.id, s.alignment]));
  const log = r.log.all();
  const players = r.state.players.map((p) => ({ id: p.id, name: p.name, seat: p.seat }));
  const eps = episodesFromLog(log, players.map((p) => p.id));
  // A driver that captured the wire has the ballots board; give episode 1 one, so the book
  // carries both shapes and FC4 covers the guard as well as the line.
  if (eps[0]) eps[0].tally = { in: 8, living: 8, need: 5 };
  return {
    r,
    book: nightBook({
      at: '2026-09-04T19:00:00.000Z',
      room: `friday-${seed}`,
      season: { outcome: r.state.outcome ?? null, aired: r.state.airingEpisode ?? null },
      players,
      episodes: eps,
      reunion: reunion(log, { alignmentOf: (id) => align[id], targets: WIN_TARGETS[8] }),
    }),
  };
}

const nights = [3, 4, 5, 6].map(playNight);
const { book } = nights[0];
const lines = bookLines(book);

t('FC4 arm · a real season makes a book with episodes, a Reunion and quotable lines on both',
  book.episodes.length >= 2
  && book.reunion && book.reunion.rollCall.length === 8
  && lines.length > 12
  && lines.some((l) => l.beat === 'reunion')
  && lines.some((l) => l.beat === 'vote'),
  `${book.episodes.length} episodes · ${book.reunion.rollCall.length} plates · ${lines.length} lines`);

/*
 * The three things Rung 7 asks the book to be able to quote. Two of them are here; the third is
 * the lie, and FC5 is why it is not.
 */
{
  const clears = lines.find((l) => l.kind === 'clears');
  // Both shapes, on purpose: an episode where somebody swung and one where nobody cleared. A
  // book that only ever held the eviction would be a book that quietly dropped the quiet nights.
  const swing = lines.find((l) => l.kind === 'swing' && / swings\.$/.test(l.line));
  const quiet = lines.find((l) => l.kind === 'swing' && /^Nobody reached/.test(l.line));
  const why = lines.find((l) => l.kind === 'why');
  const clue = lines.find((l) => l.beat === 'recap' || l.kind === 'cameras');
  t('FC4b · the count the room believed, the hand that swung, the quiet episodes, and a fact off the run',
    !!clears && /clears$/.test(clears.line)
    && !!swing && !!quiet && !!why
    && !!clue,
    `"${clears?.line}" · "${swing?.line}" (+ "${why?.line}") · "${quiet?.line}" · "${clue?.line}"`);
}

t('FC4c · every line in the book verifies against the book, from any screen\'s casing',
  lines.length > 0
  && lines.every((l) => quoteCheck(book, l.line).ok)
  && lines.every((l) => quoteCheck(book, l.line.toUpperCase()).ok)
  && lines.every((l) => quoteCheck(book, `  ${l.line}  `).ok),
  `${lines.length} lines · uppercase and padded both verify (the TV shouts and it wraps)`);

/* =============================================================================================
 * 🚨 FC4d–FC4f · THE READER AGAINST A **LIVE** LOG, WHICH IS NOT THE SHAPE ABOVE
 *
 * Everything from FC4 up is driven by `playEpisode` alone, and that is the OFFLINE machine. A
 * room driven over a socket enters CASTING through a second door as well — `beginCasting`
 * (`room.js:836`), which `t:'casting'` / `]` / `enterNextCasting` all reach — so a real night's
 * log carries **`phase.CASTING` twice per episode**: `1, 1, 2, 2, 3, 3, 4, 4`.
 *
 * `episodesFromLog` used to open a fresh record on every one of them and number records by
 * `eps.length + 1`, so a live four-episode night produced EIGHT records: four real ones filed
 * under the wrong numbers, and four empty shells with no pair, no nominations and no votes —
 * each still emitting a scorekeeper bar into `bookLines`. `quoteCheck` is exact membership over
 * those lines, so *"4 of 5 clears"* would have verified for an episode that never aired. The
 * module's own header calls that the worst outcome available to it: **a fabricated line that
 * verifies.** Night one was recorded as a DRILL for the same reason — the job was keyed off the
 * array length too, and the real premiere was never the zeroth record.
 *
 * Nothing here is hand-authored: the doubled log is produced by calling the two shipped doors in
 * the order a live night calls them, and FC4d asserts the doubling really happened before FC4e
 * asks what the reader made of it. Found by `harness/_night-table.mjs` on a real socket room.
 * ============================================================================================= */

console.log('\n  the reader, against a live log');

/** A season driven the way the WIRE drives one: the live casting door, then the episode. */
function playLiveShaped(seed, episodes = 4) {
  const r = createRoom({ count: 8, castSeed: seed * 41, worldSeed: seed, send: () => {}, emit: () => {} });
  r.start();
  for (let i = 0; i < episodes; i += 1) {
    r.beginCasting();                       // the live door — `t:'casting'` reaches this
    const living = r.state.players.filter((p) => p.alive).map((p) => p.id);
    if (living.length < 3) break;
    r.playEpisode({                          // ...and the offline walk fires the SAME phase again
      hunterRoom: 'cellar',
      nominations: [{ nominator: living[1], target: living[2] }],
      votes: Object.fromEntries(living.map((id) => [id, living[2]])),
    });
  }
  return r;
}

const liveRoom = playLiveShaped(3, 4);
const liveLog = liveRoom.log.all();
const liveRoster = liveRoom.state.players.map((p) => p.id);
const castEntries = liveLog.filter((e) => e && e.type === 'phase.CASTING');
const airedEps = [...new Set(castEntries.map((e) => Number(e?.data?.episode) || 0))].filter(Boolean);
const pairs = liveLog.filter((e) => e && e.type === 'cast.pair').length;

t('FC4d arm · a live-shaped night really does enter CASTING twice per episode — else FC4e is vacuous',
  castEntries.length === airedEps.length * 2
  && airedEps.length >= 3
  && pairs === airedEps.length,
  `${castEntries.length} phase.CASTING over ${airedEps.length} episodes`
  + ` (${castEntries.map((e) => e?.data?.episode).join(',')}) · ${pairs} cast.pair`);

const liveEps = episodesFromLog(liveLog, liveRoster);
{
  const numbered = liveEps.map((e) => e.episode).join(',');
  const shells = liveEps.filter((e) => !e.run.runner && !e.noms.length && !e.lynch.votes.length);
  t('FC4e · the reader gives a LIVE night one record per episode, numbered off the event, no shells',
    liveEps.length === airedEps.length
    && numbered === airedEps.join(',')
    && shells.length === 0
    && liveEps.every((e) => !!e.run.runner),
    `${liveEps.length} records for ${airedEps.length} episodes · numbered ${numbered}`
    + ` · ${shells.length} empty shells · every record has its pair`);

  /*
   * The locked two-jobs rule, read back out of the night's own record. `missionFor` owns it.
   *
   * ⚠️ **READ THE RECORD THAT HAS THE PAIR, NOT THE FIRST ONE.** On a live log the first CASTING
   * of each episode is the empty live door and the second is `playEpisode`'s — so under the old
   * rule the SHELL got `smash` and the real premiere, the one carrying `cast.pair`, got `drill`.
   * A check on `jobs[0]` reads the shell and passes while the night's own record calls episode
   * one a drill, which is the bug wearing the answer.
   */
  const jobs = liveEps.map((e) => e.run.job);
  const premiere = liveEps.find((e) => e.run.runner);
  t('FC4e2 · ...and night one is the SMASH in the book, as `missionFor` says, not a drill',
    !!premiere && premiere.episode === 1
    && premiere.run.job === missionFor(1).job && premiere.run.job === 'smash'
    && liveEps.filter((e) => e.episode >= 2).every((e) => e.run.job === missionFor(2).job),
    `jobs ${jobs.join(',')} · the first record WITH a pair is episode ${premiere?.episode}`
    + ` on ${premiere?.run.job} · missionFor(1)=${missionFor(1).job} missionFor(2)=${missionFor(2).job}`);
}

/*
 * 🚨 THE CONTROL, and it is the whole reason FC4e is worth its lines. The old rule is a handful
 * of characters of difference — open on every entry, number by the array length — and it is
 * re-stated here so the failure is EXECUTED rather than described. The last clause is the one
 * that matters: a shell episode's scorekeeper bar VERIFIES, which is the outcome the module's
 * header names as worse than having no line at all.
 *
 * ⚠️ Every comparison is against the LOG's own ground truth (`airedEps` / `castEntries`), never
 * against what the shipped reader returned. A control that measured itself against the thing
 * under test would go red in lock-step with an ablation and stop being a control.
 */
{
  const roster = liveRoom.state.players.map((p) => ({ id: p.id, name: p.name, seat: p.seat }));
  const old = episodesFromLogOldWay(liveLog, liveRoster);
  const oldBook = nightBook({ room: 'control', players: roster, episodes: old });
  const oldBars = bookLines(oldBook).filter((l) => l.kind === 'clears');
  const oldPremiere = old.find((e) => e.run.runner);

  t('FC4f control · the old rule doubles the season, misnames night one, and its ghost bars VERIFY',
    old.length === castEntries.length
    && old.length === airedEps.length * 2
    // The real premiere — the record carrying `cast.pair` — is filed as episode 2, on a DRILL.
    && !!oldPremiere && oldPremiere.episode === 2 && oldPremiere.run.job === 'drill'
    && oldBars.length === airedEps.length * 2
    && oldBars.every((l) => quoteCheck(oldBook, l.line).ok),
    `${old.length} records for ${airedEps.length} episodes · the real premiere filed as`
    + ` episode ${oldPremiere?.episode} on ${oldPremiere?.run.job} · ${oldBars.length} scorekeeper bars`
    + ` where the night had ${airedEps.length} · every ghost bar passes quoteCheck, which is the point`);
}

/** The reader exactly as it read before the fix — the control's arm, and nothing calls it twice. */
function episodesFromLogOldWay(log, roster) {
  const all = (roster || []).map(String);
  const dead = new Set();
  const eps = [];
  let cur = null;
  for (const e of log || []) {
    const d = e?.data || {};
    if (e?.type === 'phase.CASTING') {
      cur = {
        episode: eps.length + 1,
        living: all.filter((id) => !dead.has(id)),
        noms: [], ballotOk: [], lynch: { votes: [], result: null }, tally: null,
        run: { job: eps.length === 0 ? 'smash' : 'drill', outcome: null, cameraLit: false },
      };
      eps.push(cur);
      continue;
    }
    if (!cur) continue;
    if (e.type === 'cast.pair') { cur.run.runner = d.runner ?? null; cur.run.guide = d.guide ?? null; }
    if (e.type === 'nom.made') cur.noms.push({ nominator: d.nominator, target: d.target });
    if (e.type === 'vote.cast') cur.lynch.votes.push({ voter: d.voter, choice: d.choice });
    if (e.type === 'player.executed') dead.add(String(d.id));
  }
  return eps;
}

/*
 * 🚨 THE CONTROLS. A checker that says yes to everything is not a checker. Three ways of being
 * wrong, and the third is the one that would actually happen: a real line, from a real night,
 * that is not THIS night.
 */
{
  const made = quoteCheck(book, 'Ben swings — and the room believed it.');
  const near = quoteCheck(book, '99 of 8 clears');
  const other = nights[1];
  const otherOnly = bookLines(other.book)
    .filter((l) => !lines.some((m) => normQuote(m.line) === normQuote(l.line)));
  const crossed = otherOnly.filter((l) => quoteCheck(book, l.line).ok);
  t('FC5 control · a made-up quote, a near miss, and another night\'s own lines are all REFUSED',
    !made.ok && !near.ok
    && otherOnly.length > 0 && crossed.length === 0,
    `fabricated: ${made.why} · near miss: ${near.why}`
    + ` · ${otherOnly.length} lines unique to the other night, ${crossed.length} crossed over`);
}

/*
 * FC5b · the fail-CLOSED half, and the reason this gate can say "the lie is not in here" without
 * it reading as an excuse. Nothing in the shipped tree authors a talk line, so the book has no
 * chat column and no quote can come from one. The day that changes, this goes red.
 */
{
  // The same shape RG5b uses — an EMITTER is `record(makeEvent('chat.posted'`. `reunion.js`
  // reads the type and `night-book.js` names it in prose; neither writes one, and a grep for the
  // bare string would call both of them emitters.
  const emitters = ['src/party/room.js', 'net/party/local.mjs', 'src/party/show.js', 'src/party/link.js']
    .filter((f) => /record\(\s*makeEvent\(\s*'chat\.posted'/.test(src(f)));
  const bookHasChat = JSON.stringify(book).includes('"chat"');
  t('FC5b guard · nothing in the tree emits `chat.posted`, so the book has no chat column',
    emitters.length === 0 && !bookHasChat && BOOK_FORBIDDEN.includes('chat'),
    `${emitters.length} emitters in src · the lie is spoken at the table, not on the wire`);
}

/* =============================================================================================
 * FC6 · THE SEAL
 * ============================================================================================= */

console.log('\n  the seal');

t('FC6 · a real night\'s book passes its own closed schema',
  bookLeaks(book).length === 0
  && nights.every((n) => bookLeaks(n.book).length === 0)
  && BOOK_KEYS.length > 0 && EPISODE_KEYS.length > 0,
  `${nights.length} books · ${BOOK_KEYS.length} top-level keys, ${EPISODE_KEYS.length} per episode`);

{
  // A real whisper payload — `link.js` `WHISPER_KEYS` is `['t','from','text','at']` — pasted into
  // a book by a driver that thought a night record should be complete.
  const leaky = JSON.parse(JSON.stringify(book));
  leaky.episodes[0].chrome.push({ beat: 'debrief', kind: 'whisper', text: 'it was me, cover for me' });
  const leaked = bookLeaks(leaky);

  const extra = JSON.parse(JSON.stringify(book));
  extra.hunterRoom = 'gallery';
  const unrowed = bookLeaks(extra);

  const missing = JSON.parse(JSON.stringify(book));
  delete missing.reunion;

  t('FC6b control · whisper text, an unlisted key and a missing one are each a RED LINE',
    leaked.length > 0 && leaked.some((s) => s.includes('"text"'))
    && unrowed.length > 0
    && bookLeaks(missing).length > 0
    && bookLeaks(null).length > 0,
    `whisper: ${leaked[0]} · stray: ${unrowed[0]} · missing: ${bookLeaks(missing)[0]}`);
}

t('FC6c · a claim column cannot ride along either — the server does not author claims',
  !JSON.stringify(book).includes('"claim"')
  && BOOK_FORBIDDEN.includes('claim') && BOOK_FORBIDDEN.includes('cover'),
  '`party-isolation` I3b, arriving from the disk side');

/* =============================================================================================
 * FC7 · WHERE IT LANDS
 * ============================================================================================= */

console.log('\n  where it lands');

t('FC7 · the book is written beside `harness/_loop8/`, which is where every night already lives',
  bookPath('DUSK 7') === 'harness/_loop8/dusk-7-night-book.json'
  && bookPath('') === 'harness/_loop8/night-night-book.json'
  // The module must not reach the disk itself — a pure book is one a browser could build too.
  // The test is on the IMPORT, not on the string: the header says the words `node:fs` out loud.
  && !/^\s*import[^\n]*'node:fs'/m.test(src('src/party/night-book.js')),
  `${bookPath('friday')} · the module touches no disk, the caller writes`);

if (WRITE) {
  const rel = bookPath(WRITE);
  writeFileSync(join(here, '..', rel), `${JSON.stringify(book, null, 1)}\n`, 'utf8');
  console.log(`\n  wrote ${rel} — ${lines.length} quotable lines`);
}

console.log(`\n  reading · ${lines.length} quotable lines over ${book.episodes.length} episodes`
  + ` · beats ${[...new Set(lines.map((l) => l.beat))].join('/')}`);
console.log(`  reading · sample: "${lines.find((l) => l.kind === 'clears')?.line}"`
  + ` · "${lines.find((l) => l.kind === 'swing' && / swings\.$/.test(l.line))?.line}"`
  + ` · "${lines.find((l) => l.kind === 'roll')?.line}"`);
console.log(`\n  ${pass} ok · ${fail} fail\n`);
process.exit(fail ? 1 : 0);
