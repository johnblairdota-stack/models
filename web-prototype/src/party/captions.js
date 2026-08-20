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

/** Rooms are the only nouns a caption may contain, and these are their on-air names. */
export const ROOM_LABEL = Object.freeze({
  ballroom: 'THE BALLROOM', gallery: 'EAST GALLERY', study: 'THE STUDY',
  chapel: 'THE CHAPEL', hall: 'THE GREAT HALL', cellar: 'THE CELLAR',
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
