/**
 * 📺 **TV E — "CAMERA STINGER", as functions.**
 *
 * John picked the board on 2026-09-01:
 * `docs/design/refs-runner-intel/canvas/TvFollowE.dc.html`.
 *
 * Its axis, in the board's own words: *"the camera count is the run's only scoreboard, and a
 * number is a weak thing to celebrate. So when a camera mounts, the show STINGS it — the new
 * camera's own picture cuts into a corner for about two seconds, with its number, then goes. The
 * count becomes a moment instead of a digit ticking."*
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 WHY THIS IS A MODULE AND NOT A TEMPLATE LITERAL INSIDE `party-host.js`
 * ---------------------------------------------------------------------------------------------
 * The same lesson Rung 3 paid for and `intel-pad.js` repeated one screen over. `link-merge`
 * L10–L14 proved the whisper's privacy on the WIRE and every check was about bytes, while both
 * chromes were template literals inside a browser view — so the SCREEN half had only ever been
 * checked by opening tabs. `whisperLines`/`pairShape` moved into `link.js` for that reason;
 * `guidePad`/`runnerPad` moved into `intel-pad.js` for that reason. **`harness/tv-stinger.mjs`
 * executes exactly what the television renders**, so a leak has to get past the same function on
 * both machines.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚧 **THE RULE JOHN'S BOARD ATTACHED TO ITS OWN PICK, AND WHY IT IS ENFORCEABLE HERE**
 * ---------------------------------------------------------------------------------------------
 * The board flags itself: *"THE ONE TO ARGUE ABOUT, and John should: this is the only board on the
 * canvas that puts a SECOND view of the house on air. … If it is the pick, the stinger must never
 * fire on a camera the runner has not already left."*
 *
 * It was the pick, so the rule binds. `stepSting` answers it from two fields and only two:
 *
 *   `world.runner.room`     where she is standing now
 *   `world.mission.room`    the room the job — and therefore the mount — is in
 *
 * Both are facts about **the runner and her own job**, which is exactly the scope the locked rule
 * allows: *"The TV may see over the walls of the runner's OWN rooms, and never the whole house."*
 * `STING_READS` is that list, closed, and `world.hunter` is not on it. `sameRoom` never receives
 * the world object at all — it is handed two strings — so a hunter position cannot be read by this
 * path even by accident, and `tv-stinger` TS6 proves it by moving the hunter and asserting the
 * stinger is byte-identical.
 *
 * ⚠️ **FAIL-CLOSED, AND THE COST IS REAL.** With no world report there is no mount room, so
 * "has she left?" is unanswerable and `stepSting` refuses to fire. That means an offline
 * `playEpisode` — which resolves a whole episode synchronously and never calls `setWorld` — never
 * stings, and neither does a run whose follow bed has not reported yet. That is the correct
 * direction for a rule whose whole content is *never fire early*, and it is stated here rather
 * than discovered on a sofa.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 **THE CAMERA'S PICTURE HAS NO WIRE, AND THE STINGER SAYS SO INSTEAD OF PRETENDING.**
 * ---------------------------------------------------------------------------------------------
 * `run.camera_lit` carries `{ camera, episode, job }` (`room.js` `lightCameraFromJob`) and nothing
 * spatial. There is no camera pose, no second render target, and no second follow slot anywhere in
 * `src/` — the mansion exists in one iframe and `party-loop.md`'s asymmetry has not moved. So the
 * thing the board calls *"the shot that camera will feed from now on"* **cannot be drawn today**,
 * and this file does not draw a fake one.
 *
 * What ships is the MOMENT: the cyan frame, the camera's own number, NOW LIVE, and the count
 * lifted for as long as the sting holds. The picture slot renders its honest empty state — the
 * same choice `bezelOf` makes for an unpinned runner and for the same reason.
 *
 * The consequence is worth saying plainly, because it is good news: **the board's "nearest the
 * line" worry is not on air.** No second view of the house is broadcast by this file. `TS9` is the
 * fail-closed guard in `room-ghosts` RG5b's shape — it states the zero-of-zero out loud and goes
 * RED the day a camera pose or a second render target lands, so whoever lands it has to decide
 * deliberately whether the room may see it, rather than inheriting a yes.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚫 **PROOF OF NO INTEL — the board's own absent list is the deny list.**
 * ---------------------------------------------------------------------------------------------
 * `TvFollowE.dc.html`'s footer names what may not be on the television at any second of the run:
 * plan · minimap · room outline · whole-house fit · room name · bearing pin · compass · heading ·
 * arrow · wedge · route · breadcrumb · door count · hunter mark · hunter bearing · hunter distance
 * · target glow · cyan edge · object caption.
 *
 * `STING_FORBIDDEN` is that list as keys and `stingLeaks` is deny-by-default over `STING_KEYS`,
 * the same shape as `link.js` `shapeLeaks`, `intel-pad.js` `padLeaks` and `night-book.js`
 * `bookLeaks`. The shape that survives is four numbers and a boolean. **Nothing in it comes from a
 * person** — there is no name, no seat and no room in the stinger, so there is nothing to escape
 * and nothing a costume could carry.
 */

/* =================================================================================================
 * THE BEAT
 * ============================================================================================== */

/** ~2 s, from the board's own caption (*"cuts into a corner for about two seconds, then goes"*). */
export const STINGER_MS = 2000;

/**
 * The ONLY fields of the world report this feature may read, closed.
 *
 * `party-host.js`'s relay says *"The host does not read this — it relays it. A TV that interpreted
 * the report would be a TV that knew where the hunter was."* That sentence names the thing it is
 * protecting, and it is `hunter`. These two are the runner and her own job, which the locked
 * own-rooms rule already puts on the television's side of the wall — and the host keeps them
 * NAMED, never spread, at the relay site for the same reason `local.mjs` names them there.
 */
export const STING_READS = Object.freeze(['runner.room', 'mission.room']);

/** Two room ids, compared as strings. It is never handed the world object — see the header. */
export function sameRoom(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const l = a.trim(), r = b.trim();
  return l !== '' && l === r;
}

/**
 * Has she left the room the camera mounted in?
 *
 * Unanswerable is NOT "yes". A null mount room, a null current room or a run with no world report
 * behind it all return false, which is what keeps the board's rule a rule instead of a hope.
 */
export function hasLeft(mountRoom, runnerRoom) {
  if (typeof mountRoom !== 'string' || mountRoom.trim() === '') return false;
  if (typeof runnerRoom !== 'string' || runnerRoom.trim() === '') return false;
  return !sameRoom(mountRoom, runnerRoom);
}

/* =================================================================================================
 * THE SEAL — deny-by-default, one schema
 * ============================================================================================== */

/**
 * Keys that must never appear in the stinger's shape, at any depth.
 *
 * This is `TvFollowE.dc.html`'s footer transcribed. `room` and `roomId` are on it because the board
 * bans *room name* and *room outline* in the same breath, and a room id on the television is a room
 * name with a costume on. `hunter` is on it because Rung 5 is a door and it is shut.
 */
export const STING_FORBIDDEN = Object.freeze([
  'plan', 'minimap', 'outline', 'fit', 'room', 'roomId', 'rooms',
  'pin', 'compass', 'heading', 'bearing', 'arrow', 'wedge',
  'route', 'path', 'breadcrumb', 'trail', 'doors', 'doorCount',
  'hunter', 'marks', 'distance',
  'target', 'glow', 'edge', 'caption', 'flyover', 'lid',
]);

/** The stinger's shape, closed. Four numbers and a boolean, and not one of them is a person. */
export const STING_KEYS = Object.freeze(['cam', 'n', 'need', 'at', 'left']);

function walkKeys(v, out = [], depth = 0) {
  if (depth > 10 || !v || typeof v !== 'object') return out;
  if (Array.isArray(v)) { for (const x of v) walkKeys(x, out, depth + 1); return out; }
  for (const [k, x] of Object.entries(v)) { out.push(k); walkKeys(x, out, depth + 1); }
  return out;
}

/** Returns the complaints; empty means the shape is safe to put on the television. */
export function stingLeaks(shape) {
  if (shape == null || typeof shape !== 'object') return ['not a sting shape'];
  const bad = [];
  for (const k of walkKeys(shape)) {
    if (STING_FORBIDDEN.includes(k)) bad.push(`forbidden key "${k}"`);
    else if (!STING_KEYS.includes(k)) bad.push(`unlisted key "${k}"`);
  }
  return bad;
}

/* =================================================================================================
 * THE STATE MACHINE — arm on the mount, fire when she is out, expire on the clock
 * ============================================================================================== */

/**
 * The last `run.camera_lit` in a log, as `{ cam, seq, episode }`, or null.
 *
 * ⚠️ **`cam` IS THE EVENT'S OWN NUMBER, NOT `cameras.unlocked`.** They agree at the instant of the
 * mount and drift the moment anything else lights one; the board's caption is *"with its number"*,
 * and the number of the camera that just mounted is the one on its own event.
 */
export function lastMount(events, episode = null) {
  const evs = Array.isArray(events) ? events : [];
  for (let i = evs.length - 1; i >= 0; i--) {
    const e = evs[i];
    if (!e || e.type !== 'run.camera_lit') continue;
    const ep = Number(e.data?.episode) || 0;
    /*
     * ⚠️ **A MOUNT FROM AN EARLIER EPISODE IS NOT A MOUNT.** `client.events` is the whole night, so
     * episode 1's `run.camera_lit` is still the newest one in the log all through episode 2's
     * expedition — and a television that reconnected mid-run would arm on it, walk the "has she
     * left" test against tonight's rooms, pass, and sting a camera that mounted twenty minutes ago.
     * The event carries its own `episode`; matching it is one comparison and closes that door.
     */
    if (episode != null && ep && ep !== Number(episode)) return null;
    return { cam: Number(e.data?.camera) || 0, seq: Number(e.seq ?? i), episode: ep };
  }
  return null;
}

/**
 * One step of the stinger.
 *
 * @param {object|null} prev  the previous return, threaded by the caller
 * @param {object} input
 *   `events`   the public log the television already holds — `run.camera_lit` is `VIS.PUBLIC`
 *   `cameras`  `{unlocked, needed}` off the frame, both `all`-audience in `entitle.js`
 *   `world`    `{runnerRoom, missionRoom}` — the TWO fields of `STING_READS`, and never the
 *              world report itself, so there is no hunter in scope to read
 *   `now`      wall clock
 *   `episode`  the airing episode, so last night's mount cannot arm tonight — see `lastMount`
 * @returns {{cam:number,n:number,need:number,at:number,left:boolean}|null}
 *
 * The three edges, in order:
 *   ARM   a `run.camera_lit` newer than the one already held. The mount room is latched HERE,
 *         at the instant of the mount, because by the time she has walked out `mission.room` may
 *         already be the next job's.
 *   FIRE  she is out of that room. `at` is stamped on the frame it fires, not on the mount, so the
 *         two seconds are two seconds of AIR TIME and a slow walk home does not eat them.
 *   GO    `STINGER_MS` after `at`. The board says *"then goes"* and means it — nothing latches.
 */
export function stepSting(prev, { events, cameras, world, now, episode = null } = {}) {
  const mount = lastMount(events, episode);
  if (!mount || !mount.cam) return null;

  const need = Number(cameras?.needed) || 0;
  const n = Number(cameras?.unlocked) || mount.cam;
  const runnerRoom = world?.runnerRoom ?? null;
  const missionRoom = world?.missionRoom ?? null;

  // ARM. A new mount replaces whatever was on screen — one camera stings at a time, the same way
  // one pin replaces another on the guide's pad. There is no queue and no second slot.
  let seq = prev?.seq, cam = prev?.mountCam, mountRoom = prev?.mountRoom, fireAt = prev?.fireAt;
  if (seq !== mount.seq) {
    seq = mount.seq; cam = mount.cam; mountRoom = missionRoom; fireAt = null;
  }

  // FIRE, once. `fireAt != null` is the latch; re-entering with the same seq must not restamp it,
  // or the sting would ride the 250 ms tick forever while she stayed out of the room.
  const t = Number(now) || 0;
  if (fireAt == null) {
    if (!hasLeft(mountRoom, runnerRoom)) {
      return carry({ seq, mountCam: cam, mountRoom, fireAt: null }, null);
    }
    fireAt = t;
  }

  const st = { seq, mountCam: cam, mountRoom, fireAt };
  if (t - fireAt >= STINGER_MS) return carry(st, null);
  return carry(st, { cam, n, need, at: fireAt, left: true });
}

/*
 * The machine has to remember `seq`, the camera, `mountRoom` and `fireAt`; the SHAPE must carry
 * none of them — `mountRoom` is a room name and `STING_FORBIDDEN` bans it outright, which is the
 * whole point of the seal. So the bookkeeping rides NON-ENUMERABLE slots and the enumerable half of
 * the object is exactly `STING_KEYS`. `stingLeaks` and `JSON.stringify` both walk enumerable keys,
 * so what a reviewer reads, what the seal checks and what could ever be serialised are one object.
 *
 * ⚠️ The hidden camera is `mountCam`, NOT `cam`. `Object.defineProperty` REDEFINES an own property
 * it collides with, so a hidden `cam` would have quietly stripped the visible `cam` out of every
 * live shape — the sting would still have fired and the label would have read CAM 00. Nothing
 * hidden here may share a name with `STING_KEYS`; `tv-stinger` TS3b is the guard.
 */
export const CARRIED = Object.freeze(['seq', 'mountCam', 'mountRoom', 'fireAt', 'live']);

function carry(st, shape) {
  const out = shape ? { ...shape } : {};
  const bag = { ...st, live: shape != null };
  for (const k of CARRIED) {
    Object.defineProperty(out, k, { value: bag[k] ?? null, enumerable: false });
  }
  return out;
}

/** Is this step's return something the television should be showing? */
export const isStinging = (st) => !!(st && st.live);

/* =================================================================================================
 * THE CHROME — what the television actually paints
 * ============================================================================================== */

/** `2` -> `CAM 02`. The board's label, zero-padded, and the only text in the frame. */
export const camLabel = (cam) => `CAM ${String(Math.max(0, Number(cam) || 0)).padStart(2, '0')}`;

/**
 * The stinger, as HTML.
 *
 * ⚠️ **NO `esc` AND NO CALLER-SUPPLIED STRING.** Everything interpolated below is run through
 * `Number()` or `camLabel`, so there is no path from a player's name, a room id or a chat line into
 * this markup. That is not a saving, it is the point: a stinger that could print a string would be
 * a stinger that could print a room name, which is the first line of the board's absent list.
 *
 * The picture slot is deliberately empty of house — scanlines and a vignette, no geometry. See the
 * header: the camera's view has no wire, and a drawn stand-in would be a lie about what mounted.
 */
export function stingHtml(shape) {
  if (!shape || !shape.left) return '';
  const cam = camLabel(shape.cam);
  const n = Number(shape.n) || 0;
  const need = Number(shape.need) || 0;
  return `<div class="cam-sting" data-cam-sting aria-hidden="true">
      <div class="cam-sting-pic"><i class="cam-sting-scan"></i></div>
      <div class="cam-sting-bar"><span class="cam-sting-id">${cam}</span><span class="cam-sting-live">now live</span></div>
      <div class="cam-sting-count"><span class="cam-sting-k">Cameras</span><span class="cam-sting-v">${n}<i>/ ${need}</i></span></div>
    </div>`;
}

/**
 * The CSS. Lives beside the markup so the gate can assert one against the other, and is injected by
 * `night-skin.js` with the rest of the television's skin.
 *
 * ⚠️ **NO BACKTICKS ANYWHERE IN THIS STRING.** It is a template literal, and one backtick takes
 * `npm run build` down for every agent — CLAUDE.md's standing warning, same as the pad block.
 */
export const STING_CSS = `
    /* 📺 TV E · CAMERA STINGER — docs/design/refs-runner-intel/canvas/TvFollowE.dc.html.
       The picture's top-right corner, ~2s, then removed by patchRunChrome.

       ⚠️ IT MOUNTS INSIDE '.run-cam-layer', NOT INSIDE '.run-frame', AND THAT IS STACKING RATHER
       THAN TASTE. '.night' is 'position:fixed; z-index:1' so it is a stacking context, and the
       camera layer is a SIBLING of it at z-index 5 parented to body — so no z-index a descendant
       of '.night' can carry will ever paint over the camera. That is why '.run-slate' is faded to
       opacity 0 by '.run-frame.live' instead of being layered under one. Riding the camera layer
       also means the sting is already registered to the run frame's client rect every frame by
       placeFollow, and paint() rewriting root.innerHTML cannot tear it off mid-flight.

       It never enters any flow: the run picture is the product, and a corner card that reflowed it
       would resize the follow canvas twice a mount (party-warm W41's failure). */
    .run-cam-layer .cam-sting { position:absolute; top:14px; right:14px; width:min(28%, 356px);
      z-index:2; pointer-events:none; animation: cam-sting-in .22s ease-out both; }
    .cam-sting-pic { position:relative; aspect-ratio:16 / 9; overflow:hidden;
      border:2px solid var(--night-accent); background:var(--night-well);
      box-shadow:0 0 40px rgba(var(--night-accent-rgb), .35); }
    .cam-sting-scan { position:absolute; inset:0; display:block; opacity:.5;
      background:repeating-linear-gradient(0deg, rgba(255,255,255,.05) 0 1px, transparent 1px 3px); }
    .cam-sting-bar { display:flex; align-items:center; justify-content:space-between;
      margin-top:5px; font-size:11px; font-weight:900; letter-spacing:.22em; text-transform:uppercase; }
    .cam-sting-id { color:var(--night-accent); }
    .cam-sting-live { color:var(--night-soft); }
    .cam-sting-count { display:flex; align-items:baseline; justify-content:space-between;
      margin-top:8px; }
    .cam-sting-count .cam-sting-k { font-size:11px; font-weight:800; letter-spacing:.24em;
      text-transform:uppercase; color:var(--night-dim); }
    .cam-sting-count .cam-sting-v { font-size:34px; font-weight:900; line-height:1;
      color:var(--night-accent); font-variant-numeric:tabular-nums; }
    .cam-sting-count .cam-sting-v i { font-style:normal; font-size:19px; color:var(--night-dim); }
    /* THE COUNT BECOMES A MOMENT. The run-facts line lifts for exactly as long as the sting holds,
       which is the board's whole argument against a digit ticking. */
    .run-stage.stung .run-facts { color:var(--night-accent); }
    @keyframes cam-sting-in {
      from { opacity:0; transform: translateY(-6px); }
      to   { opacity:1; transform: none; }
    }
`;
