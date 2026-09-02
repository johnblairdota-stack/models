/**
 * 📔 **THE NIGHT BOOK — Couch Plan Rung 7, "if someone asks *is it broken?*, the JSON answers".**
 *
 * Rung 7 is a Friday, eight humans and one TV, and its Verify line is deliberately modest:
 *
 *   > Verify cannot gate fun. It can prove every quote came from this night's JSON.
 *
 * So this is not a scorer and not a replay. It is a **receipt**: the strings the room actually
 * saw, in the order it saw them, plus the facts under them — written next to `harness/_loop8/`
 * where every other night's record already lives. Afterwards somebody says *"the board said five
 * of eight clears"* and `quoteCheck` answers yes-from-episode-2 or **no, that is not from this
 * night** — which is the only thing a verifier is any use for once the couch is the judge.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 **THE LIE IS NOT IN HERE, AND THAT IS A FINDING RATHER THAN A GAP.**
 * ---------------------------------------------------------------------------------------------
 * Rung 7's fun check is one sentence: *someone lies, the room catches them with a fact it saw,
 * and they die to a count the whole room believes.* Two of those three are on the wire. The lie
 * is not, and cannot be: **nothing in `src/` or `net/` emits `chat.posted`** — `reunion.js`
 * `speakerNamed`'s header says so and `room-ghosts` RG5b states the zero-of-zero out loud rather
 * than letting it read as coverage. Every talk line in the four blind nights came from
 * `harness/_loop8/drive-*.mjs` sim puppets, and on a real Friday the lie is spoken at a table by
 * a person. No JSON will ever hold it.
 *
 * What the book holds instead is everything the lie has to survive: the nominations, the ballot
 * receipts, the count that was printed BEFORE the vote, the run's own facts, and — once the
 * Reunion has opened them — the roles. *"Someone lied"* is then checkable the way the room checks
 * it, against the reveal. `FC5` is the assertion that this file does not quietly grow a chat
 * column the day something starts emitting one.
 *
 * ---------------------------------------------------------------------------------------------
 * ⚠️ **WHY `lines` IS BUILT BY CALLING THE SHIPPED CHROME AND NOT BY RE-TYPING IT**
 * ---------------------------------------------------------------------------------------------
 * A quote checker whose corpus is a hand-written list of sentences proves that the hand-written
 * list contains the sentence. It says nothing about the television. So every line in `chrome`
 * below comes out of a function a screen already calls — `scorekeeper.js`'s `clearsLine`,
 * `tallyBoardCopy`, `lynchBoardRows` and `executionPlate`, and `jobs.js`'s `SMASH_CHROME`,
 * `FAIL_CHROME` and `wallWord`. Change the copy on the TV and this book changes with it; a quote
 * taken from the old wording then stops verifying, which is correct.
 *
 * `facts` is the other half, and it is honest about being the other half: the Reunion's roll call
 * and the Director's Cut ledger are rendered by template literals inside `party-host.js` and
 * `party-phone.js` (two hand-typed copies that have ALREADY drifted — the pad ends the line with
 * a full stop and the TV prefixes `Unsealed:`). Unifying those touches the seal `party-warm`
 * W47c/W47c2 guards, which is a decision and not a tidy-up, so the book does not pretend to own
 * their wording. It records the numbers and names, phrases its own line for them under
 * `reunionLines`, and `FC6` asserts every number and name in those lines came from the facts.
 *
 * ⚠️ **CASE IS FOLDED ON PURPOSE.** `show-verdict-v` is `text-transform:uppercase`, so a person
 * quoting the television writes `BEN SWINGS.` while the chrome that produced it holds
 * `Ben swings.` A checker that refused that would be refusing the thing it exists to confirm.
 * Whitespace is collapsed for the same reason — the TV wraps.
 *
 * ⚠️ **THE BOOK IS PUBLIC, SO IT IS A LEAK SURFACE.** It is written to disk and read by people.
 * `bookLeaks` is its closed schema and it is deny-by-default in the same shape as `link.js`
 * `shapeLeaks`: a key nobody listed is a red line, not a silent pass. Whisper text in particular
 * may never reach it — `link-merge` L10/L12 spent a rung proving those words reach exactly two
 * phones, and a night file that copied them out would undo that after the fact.
 *
 * No THREE, no DOM, no `node:fs` — the caller owns the disk. `bookPath` returns a path and writes
 * nothing.
 */

import { clearsLine, executionPlate, lynchBoardRows, tallyBoardCopy } from './scorekeeper.js';
import { FAIL_CHROME, SMASH_CHROME, wallWord } from './jobs.js';
import { missionFor } from './mission.js';

export const BOOK_VERSION = 1;

/** The whole schema. `bookLeaks` refuses anything else at the top level. */
export const BOOK_KEYS = Object.freeze([
  'version', 'at', 'room', 'season', 'players', 'episodes', 'reunion',
]);

/** Per-episode keys. Same deny-by-default rule one level down. */
export const EPISODE_KEYS = Object.freeze([
  'episode', 'living', 'noms', 'ballotOk', 'lynch', 'tally', 'run', 'chrome',
]);

/**
 * Names that must never appear as a key anywhere in the tree, at any depth.
 *
 * `text` is here because the whisper is the only free text in the game and it is the one thing
 * `link.js` guarantees two people. `cover` travels as `believedTheyWere` at the Reunion and by no
 * other name — the same exemption `entitle.js` carries. `claim` is on the list because the server
 * does not author claims (`party-isolation` I3b) and a column of them appearing here would be
 * that bug arriving from a new direction.
 */
export const BOOK_FORBIDDEN = Object.freeze([
  'text', 'whisper', 'whispers', 'words', 'said', 'chat',
  'cover', 'claim', 'secret', 'pocket', 'intel', 'hunter',
]);

/**
 * ⚠️ The book's own rows call the string `line`, never `text`. That is not a style choice:
 * `link.js` `WHISPER_KEYS` is `['t','from','text','at']`, so `text` IS the whisper's field name,
 * and banning the key is what makes a pasted-in whisper a red line rather than a row that reads
 * like any other quote. Anything the book wants to say goes in `line`.
 */

/* =================================================================================================
 * NORMALISATION — one function, used by the writer and the checker, so they cannot disagree.
 * ============================================================================================== */

/** Collapse whitespace, drop the case, trim. See the header: the TV shouts and it wraps. */
export function normQuote(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/* =================================================================================================
 * THE CHROME — every string built by calling the function a screen calls.
 * ============================================================================================== */

/**
 * One episode's quotable lines. `ep` is a `seasonEpisodeRecord` (`scorekeeper.js`) plus an
 * optional `run` card in the shape `room.js` already publishes to the Recap.
 */
export function episodeChrome(ep, names = null) {
  if (!ep) return [];
  const out = [];
  const push = (beat, kind, text) => {
    const s = String(text ?? '').trim();
    if (s) out.push({ beat, kind, line: s });
  };

  // The bar, printed BEFORE the vote. Rung 1's second wire, and the count the room believed.
  const living = (ep.living || []).length;
  const need = ep.tally?.need ?? (living ? Math.floor(living / 2) + 1 : 0);
  push('reckoning', 'clears', clearsLine({ need, living }));

  /*
   * ⚠️ The ballots board is quoted ONLY when the night actually carried a `t:'tally'`. Defaulting
   * `in` to zero would put "0 of 8" in the book, and "0 of 8" was never on any screen — a
   * verifier that invents a line is worse than one that has none, because the fabricated line
   * verifies.
   */
  if (ep.tally) {
    const copy = tallyBoardCopy(ep.tally);
    if (copy) {
      push('vote', 'ballots', copy.header);
      push('vote', 'count', copy.count);
      push('vote', 'note', copy.note);
      push('vote', 'clears', copy.clears);
    }
  }

  // Who named whom. The nameplate's own words; the board's own rows.
  for (const n of ep.noms || []) {
    const who = pickName(names, n.nominator);
    push('reckoning', 'named-by', `named by ${who}`);
  }
  const box = {};
  for (const r of ep.ballotOk || []) if (r?.voter && r.choice) box[r.voter] = r.choice;
  for (const v of ep.lynch?.votes || []) if (v?.voter) box[v.voter] = v.choice;
  for (const row of lynchBoardRows({
    votes: box, noms: ep.noms || [], living: ep.living || null, names,
  })) push('vote', 'row', row.text);

  // The hand, and the rule behind it. Two lines because the plate has two sizes — Rung 6.
  const res = ep.lynch?.result || null;
  if (res) {
    const swingName = pickName(names, res.executioner);
    const plate = executionPlate(res, swingName);
    push('execution', 'swing', plate.line);
    push('execution', 'why', plate.why);
  }

  // The clue. Only words `jobs.js` owns — the room heard these, the log did not invent them.
  const run = ep.run || null;
  if (run) {
    if (run.job === 'smash' && run.cameraLit) push('recap', 'hit', SMASH_CHROME.hit);
    if (run.failLine || run.outcome === 'TIME') push('recap', 'house', FAIL_CHROME.take);
    if (run.quiet) push('recap', 'house', FAIL_CHROME.quiet);
    if (run.realFace) push('expedition', 'wall', wallWord(run.realFace));
  }
  return out;
}

function pickName(names, id) {
  if (id == null) return '';
  if (typeof names === 'function') return names(id) || String(id);
  if (names && typeof names === 'object' && names[id] != null && names[id] !== '') {
    return String(names[id]);
  }
  return String(id);
}

/* =================================================================================================
 * THE LOG READER — what a Friday driver hands `nightBook`.
 *
 * The room's own event log IS the night's record (`party-log` L4: the Reunion is `log.all()` and
 * nothing else), so a driver should not keep a second one — that is the DUSK6 hole, where
 * `_loop8` wrote its wish beside the server's answers and the wish is what got read. This walks
 * the log and nothing else.
 *
 * ⚠️ `tally` is deliberately left null here. `{in, living, need}` is a WIRE message
 * (`t:'tally'`), not a log entry, so a driver that captured the wire passes it in and one that
 * did not gets a book with no ballots board rather than a made-up one. See `episodeChrome`.
 *
 * 🚨 **A `phase.CASTING` ENTRY IS NOT AN EPISODE — IT IS AN ENTRY INTO CASTING, AND A LIVE NIGHT
 * MAKES TWO OF THEM PER EPISODE.**
 *
 * `room.js` has two callers of `setPhase('CASTING')`: `playEpisode` (the offline machine walk,
 * `room.js:529`) and `beginCasting` (the live door behind `t:'casting'` / `]`, `room.js:836`).
 * A room driven offline by `playEpisode` alone fires it once per episode, which is the only shape
 * this reader was ever tried against — `friday-couch`'s driver is exactly that. **A room driven
 * over a socket fires BOTH**, and a real night's log reads `episode 1, 1, 2, 2, 3, 3, 4, 4`.
 *
 * Opening a fresh record on every entry therefore gave a live night a book with:
 *   • **twice as many episode records as episodes aired** — the extra ones empty shells with no
 *     pair, no nominations and no votes, each still printing a scorekeeper bar into `bookLines`;
 *   • **the wrong episode numbers**, because records were numbered `eps.length + 1`, so the real
 *     fourth episode was filed as episode 8;
 *   • **night one recorded as a DRILL**, because the job was derived from `eps.length` too, and
 *     the real premiere was never the zeroth record.
 *
 * That last one is the locked two-jobs rule mis-stated in the night's own record, and the first
 * one is the failure this whole module exists to prevent: `quoteCheck` is exact membership over
 * `bookLines`, so a shell episode's bar is a line that **verifies** for an episode that never
 * happened — *"a verifier that invents a line is worse than one that has none."*
 *
 * The fix is the number the event already carries. H278 put `{ episode }` on `phase.CASTING` so
 * `foldWin` could see the cap (`win.js` L89); it answers this too. A CASTING entry for the
 * episode already open is a RE-ENTRY and merges into it. An older log whose `phase.CASTING` has
 * no episode (`setPhase` used to write `{}`) keeps the previous behaviour rather than collapsing
 * a whole season into one record — a missing number is not evidence of a repeat.
 *
 * The job comes from `missionFor`, which is the rule's one owner, rather than a second copy of
 * *"the first one is the smash"* keyed off an array length.
 * ============================================================================================== */

export function episodesFromLog(log = [], roster = []) {
  const all = (roster || []).map(String);
  const dead = new Set();
  const eps = [];
  let cur = null;
  for (const e of log || []) {
    const d = e?.data || {};
    if (e?.type === 'phase.CASTING') {
      const aired = Number(d.episode) || 0;
      // The re-entry. Only ever the episode currently open: a CASTING for an OLDER episode after
      // a later one has started is not something the room does, and re-pointing at it would file
      // tonight's events under last night's number, which is worse than an extra record.
      if (aired && cur && cur.episode === aired) continue;
      const episode = aired || eps.length + 1;
      cur = {
        episode,
        living: all.filter((id) => !dead.has(id)),
        noms: [], ballotOk: [],
        lynch: { votes: [], result: null },
        tally: null,
        run: { job: missionFor(episode).job, outcome: null, cameraLit: false },
      };
      eps.push(cur);
      continue;
    }
    if (!cur) continue;
    switch (e.type) {
      case 'cast.pair':
        cur.run.runner = d.runner ?? null;
        cur.run.guide = d.guide ?? null;
        break;
      case 'run.camera_lit':
        cur.run.cameraLit = true;
        cur.run.outcome = cur.run.outcome ?? 'SMASHED';
        break;
      case 'nom.made':
        cur.noms.push({ nominator: d.nominator, target: d.target });
        break;
      case 'vote.cast':
        cur.lynch.votes.push({ voter: d.voter, choice: d.choice });
        break;
      case 'vote.tallied':
        cur.lynch.result = {
          ...(cur.lynch.result || {}),
          executed: d.executed ?? null,
          counts: { ...(d.counts || {}) },
        };
        break;
      case 'player.executed':
        cur.lynch.result = {
          ...(cur.lynch.result || {}),
          executed: d.id ?? null,
          executioner: d.executioner ?? null,
        };
        dead.add(String(d.id));
        break;
      case 'player.taken':
        cur.run.failLine = true;
        cur.run.outcome = 'TIME';
        dead.add(String(d.id));
        break;
      default:
        break;
    }
  }
  return eps;
}

/* =================================================================================================
 * THE REUNION — facts, and the book's OWN phrasing for them. See the header on why.
 * ============================================================================================== */

/**
 * @param {{ rollCall?: Array, feed?: object|null, decisive?: object|null }} reunion
 *   the payload `reunion.js` `reunion(log, ctx)` returns, minus `chat`.
 */
export function reunionLines(reunion, names = null) {
  if (!reunion) return [];
  const out = [];
  const push = (kind, text) => {
    const s = String(text ?? '').trim();
    if (s) out.push({ beat: 'reunion', kind, line: s });
  };
  for (const p of reunion.rollCall || []) {
    const who = pickName(names, p.id ?? p.playerId);
    if (!who || !p.role) continue;
    push('roll', `${who} was the ${p.role} · ${p.alignment}`);
    if (p.believedTheyWere) push('believed', `${who} believed they were the ${p.believedTheyWere}`);
  }
  const f = reunion.feed || null;
  if (f) {
    const bar = (n, of) => (of == null ? String(n) : `${n} of ${of}`);
    push('feed', `${bar(f.fed, f.feedTarget)} fed to the Hunter`);
    push('cameras', `${bar(f.camerasLit, f.cameraTarget)} cameras lit`);
  }
  const d = reunion.decisive || null;
  if (d && d.episode != null) push('decisive', `Episode ${d.episode} decided it`);
  return out;
}

/* =================================================================================================
 * THE BOOK
 * ============================================================================================== */

/**
 * @param {{
 *   at?: string, room?: string, season?: object,
 *   players?: Array<{ id:string, name:string, seat?:number }>,
 *   episodes?: Array, reunion?: object|null, names?: object|Function|null,
 * }} opts
 */
export function nightBook({
  at = null, room = '', season = null, players = [], episodes = [], reunion = null, names = null,
} = {}) {
  const nameOf = names ?? Object.fromEntries(
    (players || []).filter((p) => p && p.id).map((p) => [String(p.id), String(p.name ?? p.id)]),
  );
  return {
    version: BOOK_VERSION,
    at: at ?? null,
    room: String(room || ''),
    season: season ? {
      outcome: season.outcome ?? null,
      aired: season.aired ?? null,
      cap: season.cap ?? null,
    } : null,
    players: (players || []).map((p) => ({
      id: String(p.id), name: String(p.name ?? p.id), seat: p.seat ?? null,
    })),
    episodes: (episodes || []).map((ep) => ({
      episode: ep.episode | 0,
      living: (ep.living || []).slice(),
      noms: (ep.noms || []).map((n) => ({ nominator: n.nominator, target: n.target })),
      ballotOk: (ep.ballotOk || []).map((r) => ({
        voter: r.voter, ok: r.ok !== false, choice: r.choice, why: r.why || '',
      })),
      lynch: ep.lynch ? {
        votes: (ep.lynch.votes || []).map((v) => ({ voter: v.voter, choice: v.choice })),
        result: ep.lynch.result ? { ...ep.lynch.result } : null,
      } : { votes: [], result: null },
      tally: ep.tally ? { ...ep.tally } : null,
      run: ep.run ? {
        job: ep.run.job ?? null,
        outcome: ep.run.outcome ?? null,
        cameraLit: !!ep.run.cameraLit,
        seated: !!ep.run.seated,
        emptyNail: ep.run.emptyNail ?? null,
        realFace: ep.run.realFace ?? null,
        failLine: ep.run.failLine ?? null,
        quiet: !!ep.run.quiet,
        runner: ep.run.runner ?? null,
        guide: ep.run.guide ?? null,
      } : null,
      chrome: episodeChrome(ep, nameOf),
    })),
    reunion: reunion ? {
      rollCall: (reunion.rollCall || []).map((p) => ({
        id: p.id ?? p.playerId ?? null,
        role: p.role ?? null,
        alignment: p.alignment ?? null,
        believedTheyWere: p.believedTheyWere ?? null,
      })),
      feed: reunion.feed ? { ...reunion.feed } : null,
      decisive: reunion.decisive
        ? { episode: reunion.decisive.episode ?? null, because: reunion.decisive.because ?? null }
        : null,
      lines: reunionLines(reunion, nameOf),
    } : null,
  };
}

/** Every quotable line in the book, flattened, with where it was said. */
export function bookLines(book) {
  const out = [];
  for (const ep of book?.episodes || []) {
    for (const c of ep.chrome || []) out.push({ ep: ep.episode, ...c });
  }
  for (const c of book?.reunion?.lines || []) out.push({ ep: null, ...c });
  return out;
}

/**
 * Did this sentence come from this night?
 *
 * Exact membership after `normQuote`, and nothing looser. A substring rule would say yes to
 * *"five of eight clears, so Ben is out"* on a night where nobody was out, which is the shape of
 * mistake the whole rung exists to stop.
 */
export function quoteCheck(book, text) {
  const want = normQuote(text);
  if (!want) return { ok: false, why: 'empty quote', hits: [] };
  const hits = bookLines(book).filter((l) => normQuote(l.line) === want);
  if (!hits.length) return { ok: false, why: 'not from this night', hits: [] };
  return { ok: true, why: '', hits };
}

/* =================================================================================================
 * THE SEAL
 * ============================================================================================== */

function walkKeys(v, out = [], depth = 0) {
  if (depth > 12 || !v || typeof v !== 'object') return out;
  if (Array.isArray(v)) {
    for (const x of v) walkKeys(x, out, depth + 1);
    return out;
  }
  for (const [k, x] of Object.entries(v)) {
    out.push(k);
    walkKeys(x, out, depth + 1);
  }
  return out;
}

/**
 * Deny-by-default. Returns the complaints; empty means the book is safe to write down.
 * Shape stolen wholesale from `link.js` `shapeLeaks`, for the reason its header gives.
 */
export function bookLeaks(book) {
  const bad = [];
  if (!book || typeof book !== 'object') return ['not a book'];
  for (const k of Object.keys(book)) {
    if (!BOOK_KEYS.includes(k)) bad.push(`top-level key "${k}"`);
  }
  for (const k of BOOK_KEYS) {
    if (!(k in book)) bad.push(`missing "${k}"`);
  }
  for (const ep of book.episodes || []) {
    for (const k of Object.keys(ep)) {
      if (!EPISODE_KEYS.includes(k)) bad.push(`episode key "${k}"`);
    }
  }
  for (const k of walkKeys(book)) {
    if (BOOK_FORBIDDEN.includes(k)) bad.push(`forbidden key "${k}"`);
  }
  return bad;
}

/**
 * Where a night's book goes. Beside `harness/_loop8/`, which is where every other night's record
 * already lives — Rung 7 names that directory, so this does not invent a second one. No disk
 * access here; the caller writes the file.
 */
export function bookPath(name = 'night') {
  const slug = String(name || 'night').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '');
  return `harness/_loop8/${slug || 'night'}-night-book.json`;
}
