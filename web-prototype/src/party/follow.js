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

/** Closed allow-list — what the TV may SEND. A param not on this list is a violation, not a pass. */
export const FOLLOW_KEYS = [
  'view', 'room', 'runner', 'name', 'shell', 'accent', 'seed', 'throttle', 'tag', 'warm',
];

/**
 * 🔥 **THE WARM SLOT — the same view, mounted at LOBBY, carrying no cast at all.**
 *
 * `docs/slices/task-prime-time-lobby-warm-night.md` §3.1. John's playtest note on `bb7cf6a`:
 * *"the mansion only loaded AFTER nominations locked, took a long time, and had no loading
 * indicator."* All three are the same defect — `followUrl()` returns `null` until there is a
 * runner, so the iframe is created at the moment the room stops looking at anything else, and
 * then spends 22.6-23.7 s (`show.js`'s own measured figure) fetching a 9.0 MB character and
 * baking a mansion behind a slate.
 *
 * The warm slot is the fix and it is a URL, not a flag: `?view=party.follow&warm=1&seed=N`. It
 * carries **no runner, no name and no look**, for one reason that is worth more than the
 * tidiness — those are the fields that CHANGE during a night, and a slot URL that changed would
 * reassign `iframe.src`, and reassigning `src` is a reload (`party-host.js` `ensureFollow`). One
 * URL per night means one WebGL context, one fetch and one bake per night. Everything that varies
 * arrives on the cue channel below instead.
 *
 * ⚠️ **`FOLLOW_BEATS` IS NOT WIDENED AND MUST NOT BE.** The obvious implementation — add `'lobby'`
 * to `FOLLOW_BEATS` so `followUrl` starts returning a string earlier — turns `party-follow` F0c
 * (`FOLLOW_BEATS.length === 1`) red, and it would also mean the lobby slot carried a runner field
 * it has no business having. Separate function, separate key list, same forbidden list.
 */
export const WARM_KEYS = ['view', 'room', 'seed', 'warm'];

/**
 * ⚠️ **INSTRUMENTS — what a developer may TYPE, and a separate list on purpose.**
 *
 * `?still=1` freezes the runner for a deterministic screenshot; `?shot=lead` pins one camera.
 * Both are documented on the camera-alone URL and both were **missing from the allow-list**, so
 * every URL the PR advertised threw `follow slot: forbidden or unknown params` at the door. Found
 * in review; it is the difference between a closed schema and a schema that is merely closed to
 * the things somebody remembered.
 *
 * They are not folded into `FOLLOW_KEYS` because the two lists answer different questions. F2c
 * asserts that **every key a host-built slot emits** is a `FOLLOW_KEYS` name — put `still` on that
 * list and a TV that started shipping `still=1` to the whole room would pass its own gate. So:
 * accepted at the door, never emitted by `followParams`, and F9 holds both halves.
 */
export const FOLLOW_INSTRUMENTS = ['still', 'shot'];

/**
 * The operator's shots, named here rather than in `follow-bed.js`, because `?shot=` has to be
 * checkable without loading THREE. The bed reads this list; so does the gate.
 */
export const SHOT_NAMES = ['chase', 'shoulder', 'lead', 'doorway'];

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

/**
 * 🚨 **THE IDENTITY SECRETS — the subset of `FOLLOW_FORBIDDEN` that is forbidden in BOTH
 * DIRECTIONS, and the distinction is not pedantry.**
 *
 * `FOLLOW_FORBIDDEN` is a rule about what may be sent *into* the renderer, and most of it is
 * SPATIAL: `hunter`, `flyover`, `marks`, `lid` and `plan` are on that list because a TV that was
 * told them would put a god-view on the shared screen. `docs/slices/task-prime-time-lobby-warm-
 * night.md` §3.6 adds a channel pointing the other way — the TV reporting to the server where the
 * bodies it is already rendering have got to — and on that channel `hunter` is not a leak, it is
 * the payload. The TV cannot leak to itself something it computed.
 *
 * What stays forbidden in every direction is IDENTITY. No message on any channel, at any time,
 * carries a role, an alignment, a cover, a claim, the cast seed, a `you` or a teammate list. That
 * is `party-loop.md`'s hidden-role floor and it does not have a direction.
 *
 * Derived from `FOLLOW_FORBIDDEN` rather than restated, so a word added there is refused here
 * unless it is deliberately excluded as spatial — and `harness/party-warm.mjs` W4h asserts the
 * partition covers the whole list.
 */
export const SPATIAL_WORDS = ['flyover', 'hunter', 'marks', 'lid', 'plan'];
export const IDENTITY_SECRETS = FOLLOW_FORBIDDEN.filter((k) => !SPATIAL_WORDS.includes(k));

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
    else if (!FOLLOW_KEYS.includes(k) && !FOLLOW_INSTRUMENTS.includes(k)) bad.push(`follow.${k}`);
  }
  if (params.get('view') && params.get('view') !== FOLLOW_VIEW) bad.push(`follow.view=${params.get('view')}`);
  // An instrument is allowed to be present; it is not allowed to mean anything it likes. A
  // mistyped `?shot=leed` would otherwise pin nothing and read as the cut logic being broken.
  const shot = params.get('shot');
  if (shot && !SHOT_NAMES.includes(shot)) bad.push(`follow.shot=${shot}`);
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
    /* Warming and intros: the frame is a frame, but there is no production to graphic yet. */
    #fl.pre .rec, #fl.pre .third { opacity:0; }
    #fl.pre .slug { opacity:.35; }
    #fl .rec, #fl .third { transition: opacity .5s ease; }
    @keyframes fl-rec { 0%,100% { opacity:.25; } 50% { opacity:1; } }`;

/** What the camera calls itself on air. One camera for now; the unlock ladder is a later slice. */
export const CAM_LABEL = 'RRR CAM 01';

/**
 * 📺 **HOW MUCH OF THE TELEVISION THE PICTURE TAKES, AS A PERCENTAGE OF THE SHORT SIDE.**
 *
 * John, on `0349ef6`: *"TV follow ~90%. Runner camera / follow frame should take about 90% of
 * the TV screen — bigger broadcast picture, less chrome."*
 *
 * PR #7 set it to 58vh, and that was the right answer to the question it was asked: the frame had
 * just stopped being a letterbox strip with four storeys of type under it, and 58 was a
 * conservative first step that left the pair-hero and the camera line legible. Played on an
 * actual television it reads as a video embedded in a web page rather than as a broadcast.
 *
 * It lives here rather than in `night-skin.js` for `FOLLOW_CHROME_CSS`'s reason — `injectNightSkin`
 * builds its rules inside a function, so a bare-node gate cannot read them, and a number nobody
 * can assert is a number that drifts. `night-skin.js` interpolates this; `party-warm` W14 pins it.
 *
 * ⚠️ **IT IS THE SHORT SIDE, NOT THE AREA.** At 16:9 a frame 90% of the height is also 90% of the
 * width, so this is 81% of the pixels — which is what "about 90% of the screen" means to an eye
 * and is as much as can be given away while the top strip and the pair line still fit.
 */
export const TV_FRAME_PCT = 90;

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

// =============================================================================================
// THE WARM SLOT AND THE CUE CHANNEL
// =============================================================================================

/** Normalise a room code the same way `followUrl` does, so the two slots agree byte for byte. */
function cleanRoom(room) {
  return String(room ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
}

/**
 * The night-long slot's params. Pure, and **constant for the whole night** — that is the property
 * the whole design rests on, so it takes only the two things that cannot change once the room
 * exists.
 *
 * ⚠️ `seed` IS NEVER ABSENT. `followParams` drops a non-numeric seed, which is right for a slot
 * that is rebuilt per episode and wrong here: a slot mounted with no seed and later rebuilt with
 * one is a second bake, in front of the room. A missing or unparseable `worldSeed` becomes `0`.
 */
export function warmParams({ room, worldSeed } = {}) {
  const seed = Number(worldSeed);
  const out = {
    view: FOLLOW_VIEW,
    warm: '1',
    seed: String(Number.isFinite(seed) ? (seed | 0) : 0),
  };
  const r = cleanRoom(room);
  if (r) out.room = r;
  return out;
}

/** Empty = the warm slot holds. A stricter list than the run slot's, because it carries less. */
export function warmViolations(input) {
  const bad = followViolations(input);
  let params;
  if (input instanceof URLSearchParams) params = input;
  else if (typeof input === 'string') {
    try { params = new URL(input, 'http://x').searchParams; } catch { return ['<unparseable>']; }
  } else if (input && typeof input === 'object') {
    params = new URLSearchParams();
    for (const [k, v] of Object.entries(input)) if (v != null) params.set(k, String(v));
  } else return ['<empty>'];
  for (const k of new Set([...params.keys()])) {
    if (!WARM_KEYS.includes(k) && !bad.includes(`follow.${k}`)) bad.push(`warm.${k}`);
  }
  return bad;
}

/**
 * The `src` for the TV's night-long mansion iframe. Never `null` — there is always a house to
 * warm, even before anyone has joined, which is the earliest the bake can possibly start.
 */
export function warmUrl(opts = {}) {
  const p = warmParams(opts);
  const bad = warmViolations(p);
  if (bad.length) throw new Error(`warm closed schema: ${bad.join(', ')}`);
  const origin = opts.origin
    ?? (typeof location !== 'undefined' ? location.origin : 'http://localhost:5178');
  return `${origin}/?${new URLSearchParams(p).toString()}`;
}

/**
 * 🔁 **THE CUE CHANNEL — the second way into a renderer that used to have only one.**
 *
 * The warm slot's URL is fixed for the night, so everything that varies has to arrive some other
 * way, and that way is `postMessage` from the host. That is a real widening of this view's attack
 * surface and it is treated as one: a cue goes through a closed, per-kind allow-list that reuses
 * `FOLLOW_FORBIDDEN` verbatim, and a violation THROWS at both ends rather than being dropped.
 *
 * The reasoning is `follow.js`'s own, one channel over. The follow view still has no socket; it
 * still cannot read the room. What it can now be TOLD is exactly these five shapes and nothing
 * else, and the words that may never appear in any of them are the same words that may never
 * appear in a URL or on the public side-channel.
 *
 * `intros.cast[]` looks like the widest of these and is in fact the narrowest kind of data on the
 * wire: `id`, `seat`, `name`, `shell`, `accent` are precisely `FANOUT_KEYS.lobbySeat`'s public
 * fields, already fanned out to every socket in the room by a decision that predates this slice.
 */
export const CUE_KINDS = ['intros', 'run', 'move', 'shot', 'idle'];

/** Per-kind closed allow-lists. A key not listed for its kind is a violation, not a pass. */
export const CUE_KEYS = {
  intros: ['kind', 'cast'],
  run: ['kind', 'runner', 'name', 'shell', 'accent'],
  move: ['kind', 'x', 'y', 'run', 'swing', 'act'],
  shot: ['kind', 'shot'],
  idle: ['kind'],
};

/** What one seat may contribute to an `intros` cue. `FANOUT_KEYS.lobbySeat`'s public subset. */
export const CUE_CAST_KEYS = ['id', 'seat', 'name', 'shell', 'accent'];

function scanKeys(obj, allowed, path, bad, forbidden = FOLLOW_FORBIDDEN) {
  if (!obj || typeof obj !== 'object') { bad.push(`${path}:<not an object>`); return; }
  for (const k of Object.keys(obj)) {
    if (forbidden.includes(k)) bad.push(`${path}.${k}`);
    else if (!allowed.includes(k)) bad.push(`${path}.${k}`);
  }
}

/** Empty = the cue holds. Used as an assertion by the gate and as a throw by both ends. */
export function cueViolations(cue) {
  const bad = [];
  if (!cue || typeof cue !== 'object') return ['<empty>'];
  const kind = cue.kind;
  if (!CUE_KINDS.includes(kind)) return [`cue.kind=${String(kind)}`];
  scanKeys(cue, CUE_KEYS[kind], `cue.${kind}`, bad);
  if (kind === 'intros') {
    const cast = cue.cast;
    if (!Array.isArray(cast)) bad.push('cue.intros.cast:<not an array>');
    else cast.forEach((s, i) => scanKeys(s, CUE_CAST_KEYS, `cue.intros.cast[${i}]`, bad));
  }
  if (kind === 'shot' && cue.shot != null && !SHOT_NAMES.includes(cue.shot)) {
    bad.push(`cue.shot.shot=${cue.shot}`);
  }
  return bad;
}

/**
 * 📊 **THE WARM STAGES — five named milestones with fixed percentages, and no fake ease.**
 *
 * A progress bar that interpolates on a timer is a lie that gets found out on a slow TV, which is
 * the only machine where the bar matters. These are the five points the view can honestly say it
 * has reached, and the numbers are roughly proportional to the measured time each span takes on a
 * software rasteriser (the GLB fetch and the material bake dominate; `finalizeScene`'s compile
 * pass is the last fifth).
 *
 * They live here rather than in the view because `harness/party-warm.mjs` asserts the ladder is
 * monotonic and ends at exactly 100 in bare node, with no browser.
 */
export const WARM_STAGES = ['boot', 'engine', 'house', 'dress', 'ready'];

const WARM_PCT = { boot: 8, engine: 22, house: 55, dress: 80, ready: 100 };

export function warmPct(stage) {
  return WARM_PCT[String(stage ?? '')] ?? 0;
}

/** What the TV prints next to the bar. Never a room name — the TV is still not the map. */
export function warmLabel(stage) {
  if (stage === 'ready') return 'the mansion is ready';
  if (stage === 'dress') return 'dressing the rooms';
  return 'warming the mansion';
}

/**
 * 🕹️ **THE PAD — what a runner's phone may say about its own thumbs, and nothing else.**
 *
 * `party-loop.md` line 21 makes the runner a first-person body in dark corridors; D13 shipped a
 * four-button throttle that the phone did not even send. This is the wire for a real stick, and it
 * is deliberately a STICK and not a POSITION: the phone says where its thumb is, the TV owns where
 * the body ends up. A phone that could post a position could post any position.
 */
export const MOVE_KEYS = ['t', 'x', 'y', 'run', 'swing', 'act'];

/**
 * 🧭 **THE STICK'S BEARING, AND THE MINUS SIGN IS THE WHOLE FUNCTION.**
 *
 * John, on `0349ef6`: *"Runner stick L/R inverted — drag left should aim and move left."* It did
 * the opposite, and the reason is a sign that this codebase gets right everywhere else.
 *
 * The house's yaw convention is `forward = (sin y, cos y)`, so a body at yaw 0 faces **+Z** — a
 * half turn from a default camera — and its RIGHT is therefore **−X**, which is what
 * `follow-bed.js`'s `_solve` means by `rx = -Math.cos(f)`. Turning right is DECREASING yaw.
 * `src/game/player.js` L887 already writes exactly this as `Math.atan2(-mv.x, mv.y) + aimYaw`;
 * the follow bed wrote `Math.atan2(s.x, …)` and lost the minus, so a thumb pushed right turned
 * the runner toward +X, which is the runner's left and the viewer's left as well — the chase
 * camera sits behind the body, so screen-right is world-right and the mistake is visible rather
 * than merely wrong.
 *
 * ⚠️ **THE FORWARD TERM IS NO LONGER CLAMPED POSITIVE EITHER, AND THAT WAS THE SECOND HALF.** The
 * old line read `Math.atan2(s.x, Math.max(0.0001, s.y))`, which pins the answer inside ±90° — so
 * pulling the stick straight back asked for the same heading as pushing it straight forward and
 * the runner walked ON, away from the thing the player was backing away from. With the full range
 * the stick's direction IS the direction, and a pull-back is a turn-and-go. The caller lerps
 * toward this over about 9 rad/s and takes the short way round, so a 180° request reads as the
 * body wheeling rather than snapping.
 *
 * Pure, and exported from here rather than living inline in the bed so `harness/party-warm.mjs`
 * W15 can assert the sign in bare node — a control that must fail is the only thing that would
 * have caught the original, since both signs produce a runner that moves.
 *
 * @param {number} x  stick right, −1..1
 * @param {number} y  stick forward, −1..1
 * @returns {number}  radians to ADD to the current heading
 */
export function stickHeading(x, y) {
  return Math.atan2(-(Number(x) || 0), Number(y) || 0);
}

export function moveViolations(msg) {
  const bad = [];
  if (!msg || typeof msg !== 'object') return ['<empty>'];
  scanKeys(msg, MOVE_KEYS, 'move', bad);
  for (const k of ['x', 'y']) {
    const v = Number(msg[k]);
    if (!Number.isFinite(v) || v < -1.001 || v > 1.001) bad.push(`move.${k}=${msg[k]}`);
  }
  return bad;
}

/**
 * 🌍 **THE WORLD REPORT — the TV telling the server where the bodies are.**
 *
 * ⚠️ **THE ARROW POINTS THIS WAY BECAUSE NOTHING ELSE KNOWS.** `src/party/room.js`'s `playEpisode`
 * runs an entire episode synchronously and has never simulated an expedition; the mansion only
 * exists inside the follow slot. So the TV is the world authority and the server is the
 * ENTITLEMENT FILTER — which is the right split, because it keeps hidden-role filtering in
 * `net/party/entitle.js` where it already lives instead of growing a second copy.
 *
 * ⚠️ **THIS CHANNEL SCANS `IDENTITY_SECRETS`, NOT `FOLLOW_FORBIDDEN`, AND THE DIFFERENCE IS THE
 * DIRECTION OF THE ARROW.** `hunter` is a forbidden word on every channel that points INTO the
 * renderer, because a TV that was told where the hunter is would put it on the shared screen. This
 * channel points OUT of the renderer: the hunter's position is the payload, reported by the one
 * process that computed it, so that the server can decide who is told. See `IDENTITY_SECRETS`.
 *
 * 🚨 What remains structurally impossible is a role. Rooms and coordinates are facts about the
 * house; `role`, `alignment`, `cover`, `claim`, `castSeed`, `you`, `teammates` and `deal` are
 * facts about a person, and not one of them has a key here or can be added by accident.
 */
export const WORLD_KEYS = ['t', 'runner', 'hunter', 'mission', 'seq'];
export const WORLD_SPOT_KEYS = ['room', 'x', 'z'];
export const WORLD_MISSION_KEYS = ['phase', 'room'];

/** The mission's four states. `none` before it is placed; `done` when the runner is home. */
export const MISSION_PHASES = ['none', 'seek', 'return', 'done'];

export function worldViolations(msg) {
  const bad = [];
  if (!msg || typeof msg !== 'object') return ['<empty>'];
  scanKeys(msg, WORLD_KEYS, 'world', bad, IDENTITY_SECRETS);
  for (const k of ['runner', 'hunter']) {
    if (msg[k] == null) continue;
    scanKeys(msg[k], WORLD_SPOT_KEYS, `world.${k}`, bad, IDENTITY_SECRETS);
  }
  if (msg.mission != null) {
    scanKeys(msg.mission, WORLD_MISSION_KEYS, 'world.mission', bad, IDENTITY_SECRETS);
    if (msg.mission.phase != null && !MISSION_PHASES.includes(msg.mission.phase)) {
      bad.push(`world.mission.phase=${msg.mission.phase}`);
    }
  }
  return bad;
}
