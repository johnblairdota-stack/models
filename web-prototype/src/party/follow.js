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
 *
 * 🌙 `ballnight` is `game/room.js`'s ablation for what is outside the ballroom's windows
 * (`?ballnight=0` = the opaque daylight pane and no backdrop). It is an INSTRUMENT for exactly
 * the reason the list exists: the A/B has to be photographable from one camera in one boot, and
 * a cross-session before/after proves nothing in this project. The TV never emits it.
 */
export const FOLLOW_INSTRUMENTS = ['still', 'shot', 'campose', 'ballnight'];

/* =============================================================================================
 * 📐 **`?campose=x,y,z,tx,ty,tz[,fov]` — STAND THE SHOW CAMERA IN AN EXACT SPOT.**
 *
 * John, after three sessions of the ballroom asset not arriving: *"Why are there so many things
 * that didn't get ported over from the asset and how can we verify that we actually have
 * everything? We need to compare the exact files visibly open and compare each until it is
 * perfect."*
 *
 * `harness/shoot.mjs --cam` can already photograph the ASSET from any pose — it puts exactly this
 * parameter on the URL. The show camera could not be posed at all: the operator re-aims it every
 * frame, so there was no way to stand in the same place in both rooms and no way to compare them
 * except by eye and memory. That is why "is it ported yet" kept being answered wrongly, including
 * by me.
 *
 * ⚠️ **AN INSTRUMENT, NOT A SLOT KEY.** It is accepted at the door and NEVER emitted by
 * `followParams`, the same rule `still` and `shot` live under — put it on `FOLLOW_KEYS` and a TV
 * that started shipping a pinned camera to the whole room would pass its own gate. F9 holds both
 * halves.
 *
 * ⚠️ **AND IT CANNOT SMUGGLE A VIEW.** Six or seven finite numbers, nothing else: a pose is a
 * place to stand, and there is no field here that could name a room, a role or a player.
 * ============================================================================================= */
export function cleanCampose(raw) {
  if (raw == null) return null;
  const n = String(raw).split(',').map((v) => Number(v.trim()));
  if (n.length < 6 || n.length > 7) return null;
  if (!n.every((v) => Number.isFinite(v))) return null;
  const [x, y, z, tx, ty, tz, fov] = n;
  if (Math.hypot(x - tx, y - ty, z - tz) < 1e-3) return null;   // a camera cannot look at itself
  return {
    eye: [x, y, z],
    at: [tx, ty, tz],
    fov: Number.isFinite(fov) && fov >= 10 && fov <= 120 ? fov : null,
  };
}

/**
 * The operator's shots, named here rather than in `follow-bed.js`, because `?shot=` has to be
 * checkable without loading THREE. The bed reads this list; so does the gate.
 */
/* =============================================================================================
 * 🎥 **THE FOUR PERSPECTIVES — and why they are not four more shots.**
 *
 * John: *"Maybe the runner should start having just left the ballroom and play with a different
 * perspective (3rd person but further back or top down or isometric and the rooms scaled
 * differently)… ultimately the roles would change if tasks change and I'm not sure where it will
 * go yet."* He cannot judge that from a description — so all four ship as live keys and he picks
 * by feel.
 *
 * ⚠️ **A PERSPECTIVE IS HELD; A SHOT IS CUT TO.** `shoulder` / `lead` / `doorway` are the
 * director's shots — it cuts between them on a timer during warm and intros. A perspective is
 * how the game is PLAYED, so it must never be cut away from: a director that decided to try
 * `top` for five seconds mid-corridor would be taking the controls off the player. `CUT_SHOTS`
 * is the director's pool and it deliberately does not contain the new three.
 *
 * ⚠️ **`top` AND `iso` LOOK IN THROUGH THE ROOF.** Their eyes are ABOVE the storey by design,
 * which is exactly what `_valid` refuses for every other shot, and they need `room.setLid(false)`
 * — the flyover's existing roof-off switch — or they photograph a ceiling. Both are handled in
 * `follow-bed.js`; see `isOverhead`.
 * ============================================================================================= */
export const PERSPECTIVES = ['chase', 'wide', 'iso', 'top'];
/** The ones whose eye sits above the roof, so the lid has to come off and the ceiling test skipped. */
export const OVERHEAD = ['iso', 'top'];
export const isOverhead = (name) => OVERHEAD.includes(String(name || ''));

/* =============================================================================================
 * 🧭 **PLAN NORTH — the yaw a map-like perspective is nailed to, and why it is exactly π.**
 *
 * `orbit: false` was written to stop the LOOK STICK swinging an overhead view. It did not stop
 * the BODY swinging it: `_solve` placed every non-chase rig from `runner.facing`, so the whole
 * "stable map" turned with the robot — the D-pad-on-a-rotating-map problem the rig table's own
 * comment says `top` exists to avoid, arriving through the other door.
 *
 * So a plan-locked rig is nailed to one compass bearing and translates only. The bearing is the
 * one the guide's map already draws in (`rrr-phone-ux.md` §4: screen-up is world −Z, screen-right
 * is +X), so the guide and the television finally agree about the word "left".
 *
 * 🚨 **AND THE SAME CONSTANT IS THE CONTROL SCHEME, WHICH IS WHY THERE IS NO SECOND MOVEMENT
 * MODEL IN THIS SLICE.** `player.js` `_stepGround` is aim-relative:
 *
 *     want = ( sin(aimYaw)·mv.y − cos(aimYaw)·mv.x , 0 , cos(aimYaw)·mv.y + sin(aimYaw)·mv.x )
 *
 * At `aimYaw = π` that is stick-up → world `(0,0,−1)` and stick-right → world `(+1,0,0)`. Screen
 * direction IS world direction, on both axes, with `player.js` untouched. The absolute top-down
 * stick is this constant and nothing else.
 * ============================================================================================= */
export const PLAN_YAW = Math.PI;
/**
 * A rig the look stick may not swing is a rig that must not turn under the body either — the two
 * are the same promise. Derived from the table rather than kept as a second list, so a future rig
 * cannot be added to one and forgotten in the other.
 */
export const isPlanLocked = (name) =>
  !(PERSPECTIVE_RIG[String(name || '')] ?? PERSPECTIVE_RIG.chase).orbit;

/**
 * ⏱️ **HOW LONG THE CRANE TAKES, AND WHY THE TWO NUMBERS DIFFER.**
 *
 * Going out is the reveal: the player is being told, without a caption, that the view and their
 * controls have changed, and that reading takes a beat. Coming home is a release — the mission
 * is done and the ballroom is on screen — so making them watch the same move in reverse for as
 * long would be charging them for information they already have.
 */
export const RISE_SECONDS = 1.35;
export const DROP_SECONDS = 1.10;

/**
 * Where each perspective puts the eye, as an offset from the runner, and how it frames them.
 *
 * `dist` is horizontal metres behind; `height` is metres above the floor; `lateral` is the
 * over-the-shoulder offset. `fov` widens for the pulled-back views so a room still fits.
 * `orbit` says whether the look stick may swing it — an overhead view that swung under the thumb
 * would be the D-pad-on-a-rotating-map problem, and the whole point of `top` is a stable map.
 */
export const PERSPECTIVE_RIG = {
  chase: { dist: 2.90, height: 1.62, lateral: 0.35, fov: 58, orbit: true },
  wide: { dist: 5.40, height: 2.85, lateral: 0.30, fov: 62, orbit: true },
  iso: { dist: 5.60, height: 5.60, lateral: 0, fov: 46, orbit: false },
  top: { dist: 1.20, height: 9.0, lateral: 0, fov: 52, orbit: false },
};

/** The director's own pool. NOT the perspectives — see the block above. */
export const CUT_SHOTS = ['chase', 'shoulder', 'lead', 'doorway'];
export const SHOT_NAMES = ['chase', 'shoulder', 'lead', 'doorway', 'wide', 'iso', 'top'];

/** Next perspective in the cycle. The dev key walks this. */
export function nextPerspective(name) {
  const i = PERSPECTIVES.indexOf(String(name || 'chase'));
  return PERSPECTIVES[(i < 0 ? 0 : i + 1) % PERSPECTIVES.length];
}

/** Smootherstep. Zero velocity at BOTH ends, which is what stops a crane having a stop frame. */
export function smootherstep(x) {
  const t = Math.max(0, Math.min(1, Number(x) || 0));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * 🎬 **THE CRANE INTERPOLATES THE RIG, NOT A PITCH — and that is not a workaround, it is the
 * only move compatible with the decision above.**
 *
 * `perspectiveEye` refuses a pitch for an overhead rig on purpose: *"a top-down view you can
 * tilt is a chase camera with extra steps."* So a ground→overhead transition cannot be a boom
 * swinging up an arc, because the arc IS a pitch and halfway through it the view would be the
 * exact tilted thing that decision forbids.
 *
 * Blending the four numbers instead gives a camera that rises and pulls in without ever being
 * "a tilted top-down" at any point on the path — at every value of `s` the result is a legal
 * rig, just not one in the table. `orbit` does not interpolate: it belongs to the rig you are
 * arriving at the moment you leave, so the look stick stops steering the instant a plan-locked
 * destination is chosen rather than fading out.
 */
export function lerpRig(a, b, s) {
  const t = smootherstep(s);
  const mix = (x, y) => x + (y - x) * t;
  return {
    dist: mix(a.dist, b.dist),
    height: mix(a.height, b.height),
    lateral: mix(a.lateral, b.lateral),
    fov: mix(a.fov, b.fov),
    orbit: t <= 0 ? a.orbit : b.orbit,
  };
}

/**
 * 🗺️ **HOW MUCH OF A MAP THIS RIG IS, 0..1 — the dial the handheld and the lag hang off.**
 *
 * A crane's `blend` is progress through a move and is 1 at rest at BOTH ends, so it cannot say
 * whether the camera is currently a shoulder or a plan. Eye height can: it is 0 at the chase
 * rig, 1 at `top`, and it moves continuously through a transition, so one number serves the
 * held view and the move into it without a second state.
 *
 * What it is for: a camera a person is carrying should sway and lag, and a camera bolted nine
 * metres over a room should do neither — ±2 cm of handheld on a 52° lens that high is a map
 * that drifts, which reads as a bug rather than as an operator. At `chase` this returns exactly
 * 0, so every ground shot keeps the shipped feel untouched.
 */
export function rigMapness(rig) {
  const lo = PERSPECTIVE_RIG.chase.height;
  const hi = PERSPECTIVE_RIG.top.height;
  const h = Number(rig?.height);
  if (!Number.isFinite(h) || hi <= lo) return 0;
  return Math.max(0, Math.min(1, (h - lo) / (hi - lo)));
}

/**
 * The eye offset for a perspective, in world space, given the frame the player is steering.
 *
 * Pure, and deliberately separate from `chaseOrbitOffset` rather than a special case of it: the
 * overhead rigs do not take a pitch at all, because a top-down view that could be pitched is just
 * a chase camera with extra steps and the player would lose the map.
 *
 * `name` may also be a rig OBJECT, which is how `lerpRig`'s in-between rigs are drawn — a
 * transition is a rig that is not in the table, and it has to be solvable by the same function
 * or the crane would be a second camera model to keep in sync with the first.
 */
export function perspectiveEye(name, yaw, pitch = 0) {
  const rig = (name && typeof name === 'object')
    ? name
    : (PERSPECTIVE_RIG[String(name || '')] || PERSPECTIVE_RIG.chase);
  const f = Number(yaw) || 0;
  const fx = Math.sin(f), fz = Math.cos(f);
  const rx = -Math.cos(f), rz = Math.sin(f);
  if (!rig.orbit) {
    return { x: -fx * rig.dist + rx * rig.lateral, y: rig.height, z: -fz * rig.dist + rz * rig.lateral };
  }
  const p = Number(pitch) || 0;
  const horiz = rig.dist * Math.cos(p);
  const y = rig.height + rig.dist * Math.sin(-p);
  return {
    x: -fx * horiz + rx * rig.lateral,
    y: Math.max(CHASE_EYE_Y_MIN, Math.min(CHASE_EYE_Y_MAX, y)),
    z: -fz * horiz + rz * rig.lateral,
  };
}

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
    #fl .third { position:absolute; left:2.6%; bottom:10.5%; display:flex; align-items:flex-end; gap:14px;
      padding:10px 22px 10px 10px; background:rgba(0,0,0,.62); border-radius:0 12px 12px 0; }
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
    /* No production graphic during warm/intros — a dim WARM · WALK lied on air. */
    #fl.pre .slug { opacity:0; }
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
 * 🎬 **HOW MUCH OF THE TELEVISION THE INTROS TAKE, WHILE CASTING IS STILL UP.**
 *
 * The warm layer is full-bleed behind the lobby, dimmed and blurred on purpose so the join
 * code wins. Intros fire the moment Start is pressed — which is CASTING — so that same dim
 * backdrop is where the robots used to walk: a thin strip of ballroom on the far left of a
 * ballot board. This number is the picture they get instead, a centred 16:9 frame, bright.
 *
 * Smaller than `TV_FRAME_PCT` because the phase strap and a one-line ballot hint still have
 * to fit; large enough that a Meshy body at `INTRO_FOV` is the thing you are looking at,
 * with the neighbour still readable in the same plate.
 */
export const INTRO_FRAME_PCT = 78;

/**
 * 🎥 **OUTSIDE THE RING, LOOKING IN.** The run camera is 62° (`engine.js`). 38° at 1.75 m
 * filled the visor; #39's 52° interior 3/4 was still too close / inside the chairs. Live
 * playtest: pull FURTHER OUT so the circle of chairs is readable and the robots are smaller
 * in frame. `intro-bed.js` applies it; the expedition still restores 62° on dispose.
 */
export const INTRO_FOV = 56;

/**
 * Talk beats (Debrief / Reckoning / Vote / Execution / Recap / post-walk Casting) sit
 * wider so a slow sweep from OUTSIDE the chair ring still reads as a room. Same
 * restore-on-dispose rule. Under the run's 62°.
 */
export const TALK_FOV = 60;

/**
 * Metres beyond the chair radius. Intro / talk eyes sit OUTSIDE the circle looking in,
 * not ringside inside it. `intro-bed.js` applies it; the expedition still restores 62°.
 */
export const RING_OUT = 3.15;

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
 * still cannot read the room. What it can now be TOLD is exactly these six shapes and nothing
 * else, and the words that may never appear in any of them are the same words that may never
 * appear in a URL or on the public side-channel.
 *
 * `intros.cast[]` looks like the widest of these and is in fact the narrowest kind of data on the
 * wire: `id`, `seat`, `name`, `shell`, `accent` are precisely `FANOUT_KEYS.lobbySeat`'s public
 * fields, already fanned out to every socket in the room by a decision that predates this slice.
 */
export const CUE_KINDS = ['intros', 'run', 'move', 'shot', 'idle', 'noms', 'pair'];

/** Per-kind closed allow-lists. A key not listed for its kind is a violation, not a pass. */
export const CUE_KEYS = {
  intros: ['kind', 'cast', 'talk'],
  run: ['kind', 'runner', 'name', 'shell', 'accent', 'episode'],
  move: ['kind', 'x', 'y', 'lookX', 'lookY', 'run', 'swing', 'act'],
  shot: ['kind', 'shot'],
  idle: ['kind'],
  noms: ['kind', 'standing'],
  /* 🍮 Who is one name now. PUBLIC — the room watching a pair form is the point. There is no
     text key here and there must never be one: the words go to two sockets and are not a cue. */
  pair: ['kind', 'pairs'],
};

/** What one seat may contribute to an `intros` cue. `FANOUT_KEYS.lobbySeat`'s public subset. */
export const CUE_CAST_KEYS = ['id', 'seat', 'name', 'shell', 'accent'];
/** Public standing noms — the same pair `FANOUT_KEYS.nomRow` already fans to every socket. */
export const CUE_NOM_KEYS = ['nominator', 'target'];
/** One merged pair: the two seats and what they are called now. Never what they said. */
export const CUE_PAIR_KEYS = ['a', 'b', 'name'];

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
  if (kind === 'noms') {
    const standing = cue.standing;
    if (!Array.isArray(standing)) bad.push('cue.noms.standing:<not an array>');
    else standing.forEach((s, i) => scanKeys(s, CUE_NOM_KEYS, `cue.noms.standing[${i}]`, bad));
  }
  if (kind === 'pair') {
    const pairs = cue.pairs;
    if (!Array.isArray(pairs)) bad.push('cue.pair.pairs:<not an array>');
    else pairs.forEach((p, i) => scanKeys(p, CUE_PAIR_KEYS, `cue.pair.pairs[${i}]`, bad));
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
export const MOVE_KEYS = ['t', 'x', 'y', 'lookX', 'lookY', 'run', 'swing', 'act'];

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

/**
 * Below this the stick is centred. `views/party-phone.js` lights its nub on the same number.
 *
 * 0.15 (was 0.12) after the L/R + latch pass: a held thumb resting near the rim of the old
 * zone still posted a heading, so a "release" that did not quite hit centre flicked the body
 * onto a new bearing. The phone and the bed share this constant; W15j holds the range.
 */
export const STICK_DEADZONE = 0.15;
/**
 * Release is looser than press, so the latch does not chatter at the rim. A push arms at
 * `STICK_DEADZONE`; it only clears once the thumb has come back inside this.
 */
export const STICK_RELEASE = 0.10;
/**
 * How fast the heading chases the stick's bearing, rad/s. Was 9.0 inline in the bed — a
 * 90° ask arrived in ~0.2 s, then the body (`MOVE.turnRate` 3.4) spent another half-second
 * catching the aim, which read as a slide. 6.4 keeps the latch a direction (W15g still
 * settles) without the snap-then-drift.
 */
export const STICK_TURN = 6.4;

/**
 * 🧭 **THE FRAME THE STICK'S BEARING IS MEASURED FROM, AND WITHOUT IT THE RUNNER SPINS.**
 *
 * `stickHeading` alone is an OFFSET, and the shipped code added it to the live heading every
 * frame:
 *
 *     want = heading + stickHeading(x, y);   heading += shortestTurn(want - heading) * k
 *
 * — where `want - heading` is `stickHeading(x, y)`, a CONSTANT. The target runs away from the
 * body at exactly the speed the body chases it, so a thumb held left is a turn rate of about
 * 14 rad/s rather than a direction: **two and a bit revolutions a second, forever.** Measured in
 * Chromium, holding full left for nine seconds moved the runner 0.23 m — it walked a tight circle
 * — while the same nine seconds of full forward covered 8.12 m. That is the other half of John's
 * *"drag left aims/moves left (standard)"*: with the sign alone corrected, dragging left still
 * would not have moved anyone left.
 *
 * A standard stick is a DIRECTION, so the bearing needs a frame that does not move under it. The
 * frame is the heading the body had when the thumb went down, latched for as long as the thumb
 * stays down and cleared when it comes back to centre:
 *
 *   · push left        → turn ninety degrees left, walk left, and STOP turning
 *   · hold left        → keep walking left in a straight line
 *   · roll the thumb   → the body follows the thumb
 *   · pull back        → turn around and walk back
 *
 * ⚠️ **THIS LATCH IS NOT THE LIVE RUN ANY MORE.** It stays exported because the sign and the
 * spin it stopped are still the right diagnosis of a heading measured from itself, and the
 * warm gate holds both. The driven expedition now uses `stickCamMove` in the chase lens'
 * horizontal basis — see `liveRunShot` — because the operator no longer cuts mid-run, so the
 * reason this frame refused the camera (a `lead` invert) is gone.
 *
 * @param {number|null} prevRef  the latch, or null when the stick was centred
 * @param {number} x  stick right     @param {number} y  stick forward
 * @param {number} heading  the body's heading right now
 * @returns {number|null} the latch to carry into the next frame
 */
export function stickRef(prevRef, x, y, heading) {
  const mag = Math.hypot(Number(x) || 0, Number(y) || 0);
  const cut = prevRef == null ? STICK_DEADZONE : STICK_RELEASE;
  if (mag <= cut) return null;
  return prevRef == null ? heading : prevRef;
}

/**
 * 🕹️ **THE STICK'S MAGNITUDE AFTER A RADIAL DEADZONE, RESCALED SO LEAVING CENTRE STARTS AT 0.**
 *
 * The bed used to drive `move.y = min(1, hypot(x,y))`. Crossing 0.12 therefore jumped from
 * standstill to 12% of walk in one sample — a lurch — and a resting thumb that hovered just
 * outside the zone walked forever. Subtract the zone, remap the rest onto 0..1, then
 * smootherstep so a gentle push is a creep and a full throw is still a 1.
 *
 * Pure, exported, gated by W15k. Does not rewrite `Player._stepGround`.
 */
export function stickMag(x, y) {
  const m = Math.hypot(Number(x) || 0, Number(y) || 0);
  if (m <= STICK_DEADZONE) return 0;
  const t = Math.min(1, (m - STICK_DEADZONE) / (1 - STICK_DEADZONE));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * 🎥 **CAMERA-RELATIVE STICK — the live run's move, once the operator is chase-only.**
 *
 * `Player._stepGround` is already aim-relative (`sin/cos aimYaw` × `move.y/x`). So "up = into
 * the shot" is one product: flatten the chase lens onto Y, put that yaw on `aimYaw`, and hand
 * the deadzoned stick through as real strafe+forward (`move.x` + `move.y`). The body faces the
 * travel via `_targetFacing`. Left stick. The right stick orbits the same lens.
 *
 * Direction is the thumb's; magnitude is `stickMag` (radial deadzone + smootherstep). A raw
 * hypot would reintroduce the rim lurch W15k holds down.
 *
 * @param {number} x  stick right, −1..1
 * @param {number} y  stick forward, −1..1
 * @returns {{x:number,y:number}}
 */
export function stickCamMove(x, y) {
  const sx = Number(x) || 0;
  const sy = Number(y) || 0;
  const mag = stickMag(sx, sy);
  const raw = Math.hypot(sx, sy);
  if (raw <= 0 || mag <= 0) return { x: 0, y: 0 };
  const s = mag / raw;
  return { x: sx * s, y: sy * s };
}

/**
 * Horizontal yaw of a look direction (Y flattened). Same convention as `player.aimYaw`:
 * forward = `(sin yaw, cos yaw)`.
 */
export function lookYaw(dx, dz) {
  return Math.atan2(Number(dx) || 0, Number(dz) || 0);
}

/**
 * 🎬 **CHASE-ONLY WHILE THE EXPEDITION IS ON THE AIR.**
 *
 * The operator still knows four shots. During a live run it is not allowed to use the other
 * three: auto-cuts to `shoulder` / `lead` / `doorway` invert a camera-relative stick and take
 * the runner's eyes off the frame their thumb is steering. Warm / intros do not go through
 * this lock — they have their own cameras.
 *
 * `pinShot` is the `?shot=` instrument. A developer who typed `?shot=lead` still gets lead.
 * A host-built slot never emits that param (`FOLLOW_INSTRUMENTS` / F9d).
 *
 * @param {string} mode  `warm` · `intros` · `run`
 * @param {string|null} [pinShot]
 * @returns {'chase'|string|null}
 */
export function liveRunShot(mode, pinShot = null) {
  if (pinShot && SHOT_NAMES.includes(pinShot)) return pinShot;
  return mode === 'run' ? 'chase' : null;
}

/**
 * What the lens is locked to on a live run, once the room has chosen a perspective.
 *
 * `liveRunShot` answers "may the director cut right now" and the answer on a run is still no.
 * This answers the question after it: WHICH held perspective. A `?shot=` instrument still wins,
 * because a developer who typed one is asking for exactly that and nothing else.
 */
export function runPerspective(mode, pinShot = null, chosen = null) {
  if (pinShot && SHOT_NAMES.includes(pinShot)) return pinShot;
  if (mode !== 'run') return null;
  return PERSPECTIVES.includes(chosen) ? chosen : 'chase';
}

/**
 * 🎥 **RIGHT-STICK ORBIT — yaw/pitch of the TV chase, not of the body.**
 *
 * #29 welded chase yaw to a one-stick Genshin reading (hold while strafing, recenter when
 * the thumb pushed into the shot). The playtest pivot gives the runner a look stick, so
 * that recenter would fight the person aiming the TV. Look owns the orbit; release holds.
 *
 * Yaw sign is the house's: look right DECREASES yaw (`stickHeading`, `_solve`'s right).
 * Pitch is look-up radians: positive = camera drops, still framed on the chest.
 * Magnitude is `stickCamMove` so a resting thumb does not drift the lens.
 */
export const LOOK_YAW_RATE = 2.2;
export const LOOK_PITCH_RATE = 1.4;
export const LOOK_PITCH_MIN = -0.52;
export const LOOK_PITCH_MAX = 0.28;
export const CHASE_DIST = 2.90;
export const CHASE_HEIGHT = 1.62;
export const CHASE_LATERAL = 0.35;
export const CHASE_LOOK_Y = 1.30;
export const CHASE_EYE_Y_MIN = 0.78;
export const CHASE_EYE_Y_MAX = 2.85;

/* =============================================================================================
 * 🎥 **HOW CLOSE THE LENS MAY EVER GET, AND WHY THERE HAS TO BE A FLOOR.**
 *
 * John, playing it: *"if the camera clips the wall it pushes into the players robot and the
 * direction of the movement is affected."* Both halves of that sentence are the same defect.
 *
 * When a wall blocked the shot, `_reel` pulled the eye along the eye→runner ray at 0.75, 0.60,
 * 0.45, 0.30 and finally **0.20** of its distance. At 0.20 of `CHASE_DIST` the lens is 0.58 m
 * from the runner's chest — inside a robot that is about half a metre across. So the picture
 * became the inside of your own player.
 *
 * `CAM_MIN_DIST` is the floor that stops it. It is deliberately larger than the worst case the
 * old ladder could reach, so the defect is excluded by arithmetic rather than by taste; the gate
 * asserts exactly that.
 *
 * ⚠️ **A FLOOR ALONE WOULD ONLY TRADE ONE BAD PICTURE FOR ANOTHER** — a lens pinned at 1.15 m
 * staring at a wall. So the operator is allowed to LIFT over a low obstruction and to SWING
 * around a corner at full distance first, and only pulls in when neither clears. That is safe
 * to do now, and was not before, because the stick's frame no longer comes from where the camera
 * ended up — see `FollowOperator.basisYaw`.
 * ============================================================================================= */
export const CAM_MIN_DIST = 1.15;
/** How far the eye may rise to clear something low, in metres. */
export const CAM_LIFT = 0.45;
/** How far the eye may swing around a corner, in radians, at full distance. */
export const CAM_SWING = 0.72;

export function stepLookOrbit(yaw, pitch, lookX, lookY, dt) {
  const stick = stickCamMove(lookX, lookY);
  const t = Number(dt) || 0;
  const nextYaw = (Number(yaw) || 0) - stick.x * LOOK_YAW_RATE * t;
  const nextPitch = (Number(pitch) || 0) + stick.y * LOOK_PITCH_RATE * t;
  return {
    yaw: Math.atan2(Math.sin(nextYaw), Math.cos(nextYaw)),
    pitch: Math.max(LOOK_PITCH_MIN, Math.min(LOOK_PITCH_MAX, nextPitch)),
  };
}

/**
 * Chase eye offset from the runner, in the house's horizontal basis. Pitch 0 is the
 * shipped chase (2.90 behind, 1.62 high, 0.35 to the right). Soft follow — the bed
 * still lerps the operator's eye onto this point.
 */
export function chaseOrbitOffset(yaw, pitch = 0) {
  const f = Number(yaw) || 0;
  const p = Number(pitch) || 0;
  const horiz = CHASE_DIST * Math.cos(p);
  const y = CHASE_HEIGHT + CHASE_DIST * Math.sin(-p);
  const fx = Math.sin(f), fz = Math.cos(f);
  const rx = -Math.cos(f), rz = Math.sin(f);
  return {
    x: -fx * horiz + rx * CHASE_LATERAL,
    y: Math.max(CHASE_EYE_Y_MIN, Math.min(CHASE_EYE_Y_MAX, y)),
    z: -fz * horiz + rz * CHASE_LATERAL,
  };
}

export function moveViolations(msg) {
  const bad = [];
  if (!msg || typeof msg !== 'object') return ['<empty>'];
  scanKeys(msg, MOVE_KEYS, 'move', bad);
  for (const k of ['x', 'y', 'lookX', 'lookY']) {
    if (msg[k] == null && (k === 'lookX' || k === 'lookY')) continue;
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
