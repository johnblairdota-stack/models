/**
 * 📰 **THE LOWER THIRD AND THE NAMEPLATE RAIL — every word the broadcast is allowed to say.**
 *
 * `docs/design/rrr-broadcast.md` §4 and §6.6. §7's minimum viable director ends with *"a lower-third
 * renderer over the nameplate rail and camera wall"*; this is the model behind that renderer, and
 * `src/ui/broadcast.js` may put on screen **only** what this file returns.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 T5 IS ENFORCED BY A CLOSED VOCABULARY, NOT BY REVIEWING CAPTIONS.
 * ---------------------------------------------------------------------------------------------
 * §6.6: *"Never show alignment, cause or attribution in a caption, replay, outcome card or chat."*
 * Policing that caption by caption is unwinnable — the next helpful string is always one commit
 * away, and it arrives as `LOUD CRASH — EAST WING (VIC)` written by someone being helpful at 1am.
 *
 * So a caption is a **template plus a room**, and nothing else can be substituted into it. The
 * room must be one of the six in `coverage.js`; anything else throws at construction. There is no
 * parameter on `captionFor` that could carry a player, which is the same trick `events.js` plays
 * with `FAILURE_FIELDS` and for the same reason: *"prohibiting attribution field by field is
 * unwinnable; permitting exactly four fields is a five-line check."*
 *
 * 🚨 THE RAIL CANNOT SHOW A ROLE BECAUSE IT IS NEVER GIVEN ONE. `railFor` takes the **projected**
 * frame — the one `entitle.js` has already filtered — where `players[].alignment` and
 * `players[].role` have no matrix row and therefore do not exist. The rail is not withholding the
 * true role; it has never held it. That is P6 as a structural fact rather than a promise.
 *
 * ⚠️ THE CHAT IS NOT HERE. §5's mixing rule — a dead player's line indistinguishable from a
 * generated one — is its own system and is deliberately outside §7's minimum viable director.
 * Stated rather than omitted, so nobody reads this file as "the TV's text, complete".
 *
 * No THREE, no DOM.
 */

import { ROOMS } from './coverage.js';

/**
 * Rooms are the only nouns a caption may contain, and these are their on-air names.
 *
 * ⚠️ THE NAMES ARE THE HOUSE'S, NOT THE BROADCAST'S. `spaces.js` already gives every space a
 * display name — THE LONG GALLERY, THE SERVICE PASSAGE — and a second set invented here would
 * mean the television calling a room something the level designer never called it. Pinned to the
 * engine by `expedition-wire` E1.
 */
export const ROOM_LABEL = Object.freeze({
  ballroom: 'THE BALLROOM', gallery: 'THE LONG GALLERY', study_w: 'THE WEST STUDY',
  study_e: 'THE EAST STUDY', service: 'THE SERVICE PASSAGE', chapel: 'THE CHAPEL',
});

/**
 * The bank. `{ROOM}` is the only substitution that exists.
 *
 * ⚠️ `place` AND `progress` ARE DELIBERATELY SILENT, AND `progress` IS THE LOAD-BEARING ONE.
 * §6.8: *"Never leak wall stage health or channel progress as a number. Blows are shown as blows
 * landing, never as a progress bar."* A `progress` caption is where "STAGE 2 OF 4" would arrive,
 * so the kind has no template at all — the audience sees the impact and hears it, and learns how
 * close the wall is by watching, which is the whole texture of the mode.
 */
export const LOWER_THIRD = Object.freeze({
  place:         null,
  progress:      null,
  blow:          'IMPACT — {ROOM}',
  noise:         'LOUD CRASH — {ROOM}',
  channel_open:  'A WAY THROUGH — {ROOM}',
  terminal:      'TERMINAL LIVE — {ROOM}',
  cam_unlock:    'CAMERA ONLINE — {ROOM}',
  hunter_alert:  'SOMETHING HEARD THAT',
  hunter_commit: 'IT IS MOVING',
  grab:          'CONTACT',
  taken:         'WE HAVE LOST THE FEED',
  task_result:   'SEGMENT COMPLETE',
});

/** Seconds a lower third stays up. `hud.js`'s hold semantics, one level up. */
export const HOLD = Object.freeze({ rank1: 1.6, rank2: 2.2, rank3: 2.8, rank4: 3.4 });

/** The closed argument list. A caption request carrying anything else is refused, not ignored. */
export const CAPTION_FIELDS = Object.freeze(['kind', 'room', 'rank']);

/**
 * One lower third, or `null` for a kind that stays silent.
 *
 * @param {{kind:string, room?:string, rank?:number}} e
 * @returns {{text:string, hold:number}|null}
 * @throws if the request carries a field outside the closed list, or a room that is not a room
 */
export function captionFor(e = {}) {
  const bad = Object.keys(e).filter((k) => !CAPTION_FIELDS.includes(k));
  if (bad.length) {
    // 🚨 REFUSED, NOT DROPPED. Silently ignoring `{ subject: 'p3' }` is how a caller convinces
    // themselves the subject is being rendered somewhere. `events.js` learned this the same way.
    throw new Error(`T5: caption request carries non-schema field(s): ${bad.join(', ')}`);
  }
  const tpl = LOWER_THIRD[e.kind];
  if (tpl == null) return null;
  if (tpl.includes('{ROOM}')) {
    if (!ROOMS.includes(e.room)) throw new Error(`T5: caption for "${e.kind}" needs one of the six rooms, got ${JSON.stringify(e.room)}`);
    return { text: tpl.replace('{ROOM}', ROOM_LABEL[e.room]), hold: HOLD[`rank${e.rank ?? 2}`] ?? HOLD.rank2 };
  }
  return { text: tpl, hold: HOLD[`rank${e.rank ?? 2}`] ?? HOLD.rank2 };
}

/**
 * ⏱️ **THE LOWER-THIRD ARBITER — because nineteen alerts must not become nineteen lower thirds.**
 *
 * `captionFor` was called from exactly one place in the whole codebase, inside the expedition's
 * `finish()`, so **no lower third was ever displayed during the ninety seconds**. Wiring it to the
 * event bus is the fix, and it is also the trap: the bus carries 19 hunter alerts and hundreds of
 * noise events in a segment, and a renderer that printed each one would strobe.
 *
 * This is `hud.js:340`'s arbitration a second level down, over words instead of shots:
 *
 *   · a caption holds for `HOLD[rank]`, and a caption of **equal or lower** rank offered during
 *     that hold is dropped rather than queued — a line nobody finished reading is not information
 *   · a higher rank pre-empts immediately
 *   · **the same words** are refused for `REPEAT_GAP` seconds however high the rank, because
 *     `hunter-ai.js` already learned this one: *"re-arming on 'not committed' would fire the alarm
 *     every few seconds, which is how a warning becomes wallpaper"*
 *   · rank 4 is never refused. §3: television does not cut away from its own climax, and it does
 *     not decline to caption it either
 *
 * Pure, so `shot-solver` can hold the whole policy without a browser.
 */
export const MIN_GAP = 0.9;      // any two lower thirds
export const REPEAT_GAP = 12.0;  // the same words again

export function createLowerThirds() {
  let upUntil = -Infinity, upRank = 0, lastAt = -Infinity;
  const saidAt = new Map();
  return {
    /**
     * @returns {{text:string, hold:number}|null} the caption to display, or null if this one is
     *          refused. Refused, not queued: see the header.
     */
    offer(e = {}, t = 0, cameraRoom = e.room) {
      /**
       * 🚨 **A CAPTION MAY ONLY NAME THE ROOM THE CAMERA IS IN.** This is an information rule, not
       * a style one. The Hunter's room has no row anywhere on the wire — `entitle.js` gives it
       * none and `expedition-wire` E7's control asserts the absence — because the guide EARNS the
       * Hunter's position through cameras and the table argues about whether they really saw it.
       * A lower third reading "IMPACT — THE WEST STUDY" while the Hunter hammers a door two rooms
       * from the runner hands the whole room what the guide is paid to know, from the one screen
       * everybody is already looking at. An event elsewhere keeps its sound and loses its words,
       * which is §3 exactly: *"Audio never cuts. You hear the crash you did not see."*
       */
      if (e.room !== undefined && cameraRoom !== undefined && e.room !== cameraRoom) return null;
      const cap = captionFor(e);
      if (!cap) return null;
      const rank = e.rank ?? 2;
      if (rank < 4) {
        if (t - (saidAt.get(cap.text) ?? -Infinity) < REPEAT_GAP) return null;
        if (t - lastAt < MIN_GAP) return null;
        if (t < upUntil && rank <= upRank) return null;
      }
      upUntil = t + cap.hold; upRank = rank; lastAt = t;
      saidAt.set(cap.text, t);
      return cap;
    },
    /** For an instrument: what is up, and until when. */
    state: () => ({ upUntil, upRank }),
  };
}

/** Every string this bank can ever produce. A sweep needs a closed set, so here it is. */
export function allCaptions() {
  const out = [];
  for (const kind of Object.keys(LOWER_THIRD)) {
    if (LOWER_THIRD[kind] == null) continue;
    if (LOWER_THIRD[kind].includes('{ROOM}')) {
      for (const room of ROOMS) out.push(captionFor({ kind, room }).text);
    } else {
      out.push(captionFor({ kind }).text);
    }
  }
  return out;
}

/**
 * The permanent nameplate rail, §4: *"name, current public claim, ALIVE / OUT, and this round's
 * RUNNER / GUIDE badges. Never alignment, never true role."*
 *
 * @param {object} frame  a PROJECTED frame — the thing `entitle.js` already filtered
 */
export function railFor(frame = {}) {
  const pair = frame.pair || {};
  return (frame.players || []).map((p) => ({
    seat: p.seat,
    name: p.name,
    // §4: default `—`, set from the phone. A published claim only — a draft has no matrix row.
    claim: p.claim || '—',
    out: p.alive === false,
    // ⚠️ HOW THEY LEFT IS A NON-COLOUR CHANNEL, WHICH §4 REQUIRES: *"every state change carries a
    // non-colour channel … because half a party room is looking at the screen sideways."*
    mark: p.alive === false ? (p.taken ? '✕' : '⚒') : '⬤',
    badge: pair.runner === p.id ? 'RUNNER' : pair.guide === p.id ? 'GUIDE' : null,
  }));
}

/** §4's show bug. P10: an episode number, never "Round 3 of 5". */
export const showBug = (episode) => `● RRR LIVE · EP ${String(episode ?? 1).padStart(2, '0')}`;

/** §4's segment clock, the dimmest thing on screen. */
export function segmentClock(secondsLeft) {
  const s = Math.max(0, Math.ceil(secondsLeft || 0));
  return `SEGMENT ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
