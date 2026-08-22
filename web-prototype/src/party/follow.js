/**
 * THE FOLLOW SLOT — what the TV is allowed to hand the produced run camera.
 *
 * `docs/slices/task-d13-tv-follow.md` §3.1. `docs/design/party-loop.md` line 22: *"The TV plays
 * the run like a reality show following the runner"*, and line 42: *"TV reality-TV follow camera
 * (limited, produced), not god-view."*
 *
 * The follow view (`?view=party.follow`) has **no socket**. It gets a URL and nothing else, and
 * that is the whole safety argument: a renderer that cannot read the room cannot leak the room.
 * This file is the closed schema on that URL — the same shape and the same reasoning as
 * `net/party/local.mjs`'s `FANOUT_KEYS` / `fanoutViolations()`, one channel over.
 *
 * ⚠️ NO THREE, NO DOM. `harness/party-follow.mjs` imports this in bare node, and CI runs the
 * party gates with no `npm install` — a gate that needs a module is a gate that gets skipped.
 */

import { cleanLook } from './look.js';

/** The only beat that mounts a camera. Casting, recap and lobby get no follow. */
export const FOLLOW_BEATS = ['expedition'];

/** Closed allow-list. A param not on this list is a violation, not a pass. */
export const FOLLOW_KEYS = [
  'view', 'room', 'runner', 'name', 'shell', 'accent', 'seed', 'throttle', 'tag',
];

/**
 * 🚨 A SUPERSET OF `local.mjs`'s `FANOUT_FORBIDDEN`, AND THAT IS ASSERTED BY THE GATE (F5).
 * A field that may not travel on the public side-channel must not be able to arrive by URL
 * instead — otherwise the iframe is a hole cut around the entitlement matrix.
 *
 * The three this channel adds are `party-loop.md`'s own "Do not" list, by name:
 *   `marks`  the guide's flyover pins
 *   `lid`    `room.setLid(false)` — how `game.play`'s [F] sees the house through its ceilings.
 *            A lid-off TV IS a god-view. Forbidden explicitly rather than by omission.
 *   `plan`   `?plan=gen` swaps the floor plan out from under the house the phones are told about
 */
export const FOLLOW_FORBIDDEN = [
  'role', 'alignment', 'cover', 'claim', 'castSeed', 'you', 'teammates',
  'flyover', 'hunter', 'deal',
  'marks', 'lid', 'plan',
];

/** The four the phone pad already sends (`views/party-phone.js`). Anything else is STILL. */
export const THROTTLES = ['STILL', 'CREEP', 'WALK', 'RUN'];

export const FOLLOW_VIEW = 'party.follow';

/** Same 12-char cap `room.setName` applies, so the TV cannot be handed a longer name than the wire. */
const NAME_CAP = 12;

export function isFollowBeat(beat) {
  return FOLLOW_BEATS.includes(String(beat || ''));
}

export function cleanThrottle(t) {
  const up = String(t ?? '').toUpperCase();
  return THROTTLES.includes(up) ? up : 'WALK';
}

/**
 * Empty = the schema holds. Accepts a `URLSearchParams`, a plain object, or a url string.
 * Used by the gate as an assertion and by `followUrl` / the view as a throw, so a param added
 * six months from now fails closed the way a later `role` on the lobby snapshot does.
 */
export function followViolations(input) {
  const bad = [];
  let params;
  if (input instanceof URLSearchParams) params = input;
  else if (typeof input === 'string') {
    try { params = new URL(input, 'http://x').searchParams; }
    catch { return ['<unparseable>']; }
  } else if (input && typeof input === 'object') {
    params = new URLSearchParams();
    for (const [k, v] of Object.entries(input)) if (v != null) params.set(k, String(v));
  } else return ['<empty>'];

  for (const k of new Set([...params.keys()])) {
    if (FOLLOW_FORBIDDEN.includes(k)) bad.push(`follow.${k}`);
    else if (!FOLLOW_KEYS.includes(k)) bad.push(`follow.${k}`);
  }
  if (params.get('view') && params.get('view') !== FOLLOW_VIEW) bad.push(`follow.view=${params.get('view')}`);
  return bad;
}

/**
 * The slot's params, or `null` when there is nothing to mount.
 *
 * Pure: the same inputs give the same object, which is what lets `party-host.js` recompute this
 * on every repaint and only touch `iframe.src` when it actually changed. A slot that was not
 * pure would reload the mansion on every lobby snapshot (slice §5.1).
 */
export function followParams({
  beat, runnerId, name, look, worldSeed, throttle, tag,
} = {}) {
  if (!isFollowBeat(beat)) return null;
  if (!runnerId) return null;
  const clean = cleanLook(look);
  const out = {
    view: FOLLOW_VIEW,
    runner: String(runnerId),
    throttle: cleanThrottle(throttle),
  };
  // Trimmed on BOTH sides of the cap. `room.setName` trims then slices, which can leave a
  // trailing space inside 12 chars; that is invisible on the wire and a ragged lower-third on a
  // TV, so the slot trims again after cutting.
  const n = String(name ?? '').trim().slice(0, NAME_CAP).trim();
  if (n) out.name = n;
  if (clean) { out.shell = clean.shell; out.accent = clean.accent; }
  if (worldSeed != null && Number.isFinite(Number(worldSeed))) out.seed = String(Number(worldSeed) | 0);
  if (tag) out.tag = String(tag).slice(0, 16);
  return out;
}

/**
 * 📺 **THE BROADCAST FURNITURE, AS A STRING — and it lives here for `rolecard.js`'s reason.**
 *
 * #6 pulled the role card's CSS into a pure module so `role-peek` P11 could assert it holds no
 * colour of its own. This is the same hazard one frame further out: the follow overlay renders
 * inside an IFRAME, in a different document from `injectNightSkin()`, so it inherits nothing and
 * a reskin that missed it would leave the one stale surface on the biggest screen in the room.
 * Keeping it here — no THREE, no DOM — is what lets `party-follow.mjs` F8 walk it in bare node.
 *
 * ⚠️ **NO HEX, AND THE ONLY LITERALS ARE BLACK.** Every brand colour is a `--night-*` name. The
 * blacks that remain are photographic rather than brand — the letterbox matte is the absence of
 * picture, and the text shadows and vignette are what keep white type legible over a lit room —
 * so F8 permits `rgba(0,0,0,…)` by name and refuses everything else.
 *
 * ⚠️ It does NOT declare the tokens. `party-follow.js` prepends `NIGHT_TOKENS`, so there is still
 * exactly one place the palette is defined.
 */
export const FOLLOW_CHROME_CSS = `
    #fl { position:fixed; inset:0; pointer-events:none; z-index:20;
      font-family: ui-sans-serif, system-ui, sans-serif; color:var(--night-ink); }
    #fl .bar { position:absolute; left:0; right:0; height:6.5%; background:rgba(0,0,0,1); }
    #fl .bar.t { top:0; } #fl .bar.b { bottom:0; }
    #fl .wash { position:absolute; inset:0;
      background:
        radial-gradient(ellipse 92% 88% at 50% 46%, transparent 52%, rgba(0,0,0,.55) 100%),
        repeating-linear-gradient(0deg, rgba(0,0,0,.16) 0 1px, transparent 1px 3px); }
    #fl .rec { position:absolute; top:9%; left:2.6%; display:flex; align-items:center; gap:9px;
      letter-spacing:.24em; text-transform:uppercase; font-size:12px; font-weight:700;
      color:var(--night-ink); text-shadow:0 2px 10px rgba(0,0,0,.9); }
    #fl .dot { width:11px; height:11px; border-radius:50%; background:var(--night-bad);
      box-shadow:0 0 12px var(--night-bad); animation: fl-rec 2s ease-in-out infinite; }
    #fl .third { position:absolute; left:2.6%; bottom:10.5%; display:flex; align-items:flex-end; gap:14px; }
    #fl .third .face { width:64px; height:64px; filter: drop-shadow(0 8px 20px rgba(0,0,0,.8)); }
    #fl .third .who { font-size:clamp(30px, 4.6vw, 62px); font-weight:800; line-height:.98;
      text-shadow:0 3px 18px rgba(0,0,0,.95); }
    #fl .third .sub { margin-top:6px; font-size:12px; letter-spacing:.26em; text-transform:uppercase;
      color:var(--night-accent); text-shadow:0 2px 10px rgba(0,0,0,.9); }
    #fl .slug { position:absolute; right:2.6%; bottom:11%; text-align:right;
      font-size:11px; letter-spacing:.26em; text-transform:uppercase; color:var(--night-soft);
      text-shadow:0 2px 10px rgba(0,0,0,.9); }
    #fl .slug b { color:var(--night-ink); font-weight:700; }
    @keyframes fl-rec { 0%,100% { opacity:.25; } 50% { opacity:1; } }`;

/** What the camera calls itself on air. One camera for now; the unlock ladder is a later slice. */
export const CAM_LABEL = 'RRR CAM 01';

/**
 * The `src` for the TV's follow iframe, or `null`.
 *
 * `room` is carried for the operator's log line only — the follow view opens no socket with it.
 * `origin` defaults to the page's own, so a follow can never be pointed off-site.
 */
export function followUrl(opts = {}) {
  const p = followParams(opts);
  if (!p) return null;
  if (opts.room) p.room = String(opts.room).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
  const bad = followViolations(p);
  if (bad.length) throw new Error(`follow closed schema: ${bad.join(', ')}`);
  const origin = opts.origin
    ?? (typeof location !== 'undefined' ? location.origin : 'http://localhost:5178');
  return `${origin}/?${new URLSearchParams(p).toString()}`;
}
