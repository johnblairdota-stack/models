/**
 * 🎥 **THE SHOT SOLVERS — where a chosen shot becomes a place to put a camera.**
 *
 * `docs/design/rrr-broadcast.md` §7's minimum viable director names three of these by name:
 * *"the ranked event bus, three shot solvers (`BODYCAM`, `WORK`, one `STATIC` per unlocked
 * camera), the `hud.js` arbiter re-pointed at shots, and a lower-third renderer."* The bus and the
 * arbiter are `director.js`. This is the second clause.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 THE GEOMETRY IS INJECTED. THIS FILE DOES ARITHMETIC AND ASKS QUESTIONS; IT NEVER LOOKS.
 * ---------------------------------------------------------------------------------------------
 * `director.js`'s header states the split and the reason: *"Turning a chosen shot into
 * `{eye, at, fov}` needs THREE and the live world, so it lives in the renderer adapter.
 * `hunter-ai.js`, `damagefield.js` and `spaces.js` all import THREE; if the choice lived with
 * them, `director-cut` would need a GPU and would never be run."*
 *
 * The same trap is one level down here. A solver that reached into a `THREE.Scene` for the
 * subject's position would drag THREE into `src/party/`, and then the only way to ask *"can this
 * shot see a room no camera has unlocked"* would be to render a frame and look at it. So the
 * world arrives as a **probe** — five small questions, listed below — and `src/game/director-rig.js`
 * answers them from the live scene while `harness/shot-solver.mjs` answers them from a fixture.
 *
 * 🚨 A SEAM FILLER CANNOT PRODUCE A POSE, AND THAT IS ENFORCED HERE RATHER THAN REMEMBERED.
 * `director.js` already refuses to let a `live:false` shot serve a rank-3-or-4 event. This is the
 * other half of the same promise: REACTION, CONFESSIONAL and SPONSOR return a **card** and no
 * `eye` at all, so there is no code path by which a seam filler points a camera down a corridor.
 * *"They show the circle or a card, never the halls."*
 *
 * No THREE, no DOM.
 */

import { ROOMS } from './coverage.js';

/**
 * 📐 THE BODYCAM NUMBERS ARE THE SHIPPED ONES, READ FROM THE RIG RATHER THAN CHOSEN.
 * `ThirdPersonCamera` (`src/game/player.js:1628-1634`) has survived contact with the game at
 * distance 3.0, height 1.42, shoulder 0.42, pitch -0.13. A broadcast camera that invented its own
 * numbers would look like a different game in the cutaways, which is the one thing an edit must
 * never do.
 */
export const BODYCAM_RIG = Object.freeze({ distance: 3.0, height: 1.42, shoulder: 0.42, pitch: -0.13 });

/**
 * ⚠️ WORK IS TIGHTER AND LOWER, AND IT IS THE ONLY SHOT ALLOWED TO BE CLOSE. §7 wants the hands
 * legible at three metres on a 1080p panel; everything else stays at conversational distance so
 * the audience can tell where in the house they are.
 */
export const WORK_RIG = Object.freeze({ distance: 1.35, height: 1.05, shoulder: 0.30, pitch: -0.22 });

/** Field of view per shot. A STING is long because a silhouette read at distance is the point. */
export const FOV = Object.freeze({
  BODYCAM: 68, WORK: 52, STATIC: 46, STING: 34, SPLIT: 50,
});

/**
 * ⚠️ THE GRADE IS NAMED, NOT BUILT. §7: *"reuse `GRADE_PRESETS` (`src/post/pipeline.js:63`) — a
 * STATIC gets more grain, less bloom."* Naming a preset keeps the post stack out of `src/party/`
 * and keeps this file runnable in bare node.
 */
export const GRADE = Object.freeze({
  BODYCAM: 'estate', WORK: 'estate', STATIC: 'security', STING: 'security', SPLIT: 'security',
});

/** A STING never gets closer than this. The Hunter is a silhouette a real camera saw, not a portrait. */
export const STING_MIN_RANGE = 6.0;

/**
 * 📏 `player.js:1474`'s number, and it is what keeps the near plane off the surface the boom hit.
 * Without it a boom that stops exactly ON a wall renders the wall's inside face filling the frame
 * — which is what the first wired screenshot showed: a perfectly composed shot of dark plaster
 * under a perfectly correct broadcast overlay, because the runner had just stepped through a
 * doorway and the lens was still in the room behind them.
 */
export const BOOM_STANDOFF = 0.30;

/** Seam fillers, and what each one puts on the screen instead of the house. */
export const CARDS = Object.freeze({
  REACTION: 'circle',        // the nameplate rail, blown up — the room reacting to itself
  CONFESSIONAL: 'bust',      // a still bust render and a canned line (§7: faked in v1)
  SPONSOR: 'sponsor',        // one of six pre-rendered cards
});

export const isFiller = (shotId) => shotId in CARDS;

/**
 * 🔌 THE PROBE — the entire surface between this file and the world. Five questions:
 *
 *   `pose(subjectId)`            → `{x,y,z,yaw,eyeHeight}` or null if they are not in the scene
 *   `sites()`                    → the camera roster, live ones only: `[{index,room,x,y,z,yaw,pitch}]`
 *   `boom(from, dir, maxLen)`    → how far a boom gets before something solid stops it
 *   `sees(site, point)`          → is that point inside this camera's frustum AND unoccluded
 *   `label(room)`                → the room's on-air name, e.g. `EAST GALLERY`
 *
 * 🚨 `sites()` RETURNS UNLOCKED CAMERAS ONLY, AND THAT IS THE PROBE'S CONTRACT RATHER THAN A
 * FILTER APPLIED HERE. A STATIC solved from a camera the crew has not lit would put a room on the
 * television that the good team has not earned — the objective and the information system are the
 * same system (S3), and this is where that could quietly come apart.
 */

const v = (x, y, z) => ({ x, y, z });
const add = (a, b) => v(a.x + b.x, a.y + b.y, a.z + b.z);
const sub = (a, b) => v(a.x - b.x, a.y - b.y, a.z - b.z);
const len = (a) => Math.hypot(a.x, a.y, a.z);
const scale = (a, k) => v(a.x * k, a.y * k, a.z * k);
const norm = (a) => { const l = len(a) || 1; return scale(a, 1 / l); };

/** Where a boom sits for a given yaw/pitch/distance/shoulder offset around a pivot. */
function boomPose(pivot, yaw, rig, probe) {
  const dir = v(-Math.sin(yaw) * Math.cos(rig.pitch), -Math.sin(rig.pitch), -Math.cos(yaw) * Math.cos(rig.pitch));
  const right = v(Math.cos(yaw), 0, -Math.sin(yaw));
  const anchor = add(pivot, scale(right, rig.shoulder));
  /**
   * 🚨 `dir` ALREADY POINTS BEHIND THE SUBJECT. DO NOT NEGATE IT.
   *
   * `player.js`'s forward is `(sin yaw, cos yaw)` — stated at `:1806` where the lead uses exactly
   * that — and `ThirdPersonCamera`'s `dirAt(pitch)` is `(-sin·cos p, -sin p, -cos·cos p)`, i.e.
   * the NEGATIVE of forward with the pitch folded in. The rig then probes along it
   * (`castRay(from, dirAt(pitch), distance)`) and places the eye at the far end, so
   * `eye = pivot + dir · dist` puts the camera behind and slightly above the shoulder.
   *
   * The first draft here flipped the sign "to go behind them" and put the lens IN FRONT of the
   * runner, in a doorway, against a wall — a perfectly composed frame of damask wallpaper under a
   * perfectly correct broadcast overlay. Nothing threw, and `H6` still passed because it only
   * compared boom LENGTHS. `H6b` now asserts the side.
   */
  // ⚠️ THE BOOM IS PULLED IN BY THE WORLD, NOT PUSHED THROUGH IT. `ThirdPersonCamera.update` does
  // exactly this and it is the reason the shipped camera does not clip a wall in a corridor.
  const clear = probe.boom ? probe.boom(anchor, dir, rig.distance) : rig.distance;
  const dist = Math.max(0.35, Math.min(rig.distance, clear - BOOM_STANDOFF));
  return { eye: add(anchor, scale(dir, dist)), at: pivot, dist };
}

/**
 * Solve one chosen shot.
 *
 * @param {string} shotId              one of `director.js`'s SHOTS
 * @param {object} o
 * @param {string} o.subjectId         who the arbiter chose to be on
 * @param {object} o.probe             the five questions above
 * @param {string} [o.hunterId]        the Hunter's probe id, for STING
 * @returns {{shotId, kind:'live'|'card', eye?, at?, fov?, grade?, bug:string, card?:string}|null}
 *          `null` means **this shot cannot be solved right now** — the arbiter must pick another.
 *          A solver that returned a pose anyway would point a camera at a wall on live television.
 */
export function solve(shotId, { subjectId, probe, hunterId = 'hunter' } = {}) {
  // ---- seam fillers never touch the world
  if (isFiller(shotId)) {
    return { shotId, kind: 'card', card: CARDS[shotId], bug: bugFor(shotId, null, probe) };
  }

  if (shotId === 'BODYCAM' || shotId === 'WORK') {
    const p = probe.pose(subjectId);
    if (!p) return null;
    const rig = shotId === 'WORK' ? WORK_RIG : BODYCAM_RIG;
    const pivot = v(p.x, p.y + (p.eyeHeight ?? 1.62) * 0.94, p.z);
    const { eye, at } = boomPose(pivot, p.yaw ?? 0, rig, probe);
    return { shotId, kind: 'live', eye, at, fov: FOV[shotId], grade: GRADE[shotId], bug: bugFor(shotId, null, probe) };
  }

  if (shotId === 'STATIC' || shotId === 'STING') {
    const target = shotId === 'STING' ? hunterId : subjectId;
    const p = probe.pose(target);
    if (!p) return null;
    const point = v(p.x, p.y + 1.0, p.z);
    // The best live camera that can actually see them. `sites()` is unlocked-only by contract.
    const seen = (probe.sites() || []).filter((s) => probe.sees(s, point));
    if (!seen.length) return null;
    // 🚨 A STING TAKES THE FURTHEST CAMERA THAT CAN SEE, NOT THE NEAREST. §6.2: the Hunter appears
    // *"only as a silhouette a real camera can actually see"* — a close-up turns a silhouette into
    // a character model and hands the audience a monster reveal the game has not earned.
    const ranked = seen
      .map((s) => ({ s, d: len(sub(point, s)) }))
      .sort((a, b) => (shotId === 'STING' ? b.d - a.d : a.d - b.d));
    const pick = shotId === 'STING'
      ? (ranked.find((r) => r.d >= STING_MIN_RANGE) || ranked[0])
      : ranked[0];
    if (shotId === 'STING' && pick.d < STING_MIN_RANGE) return null;
    return {
      shotId, kind: 'live', eye: v(pick.s.x, pick.s.y, pick.s.z), at: point,
      fov: FOV[shotId], grade: GRADE[shotId], bug: bugFor(shotId, pick.s, probe),
    };
  }

  if (shotId === 'SPLIT') {
    // §7 permits the cheap version: `setViewpoints([a,b])` already exists (`src/game/room.js:1436`),
    // two viewports, no compositing polish. So a SPLIT is two solved BODYCAMs, or it is nothing.
    const subs = (probe.splitSubjects ? probe.splitSubjects() : []).slice(0, 2);
    if (subs.length < 2) return null;
    const panes = subs.map((id) => solve('BODYCAM', { subjectId: id, probe })).filter(Boolean);
    if (panes.length < 2) return null;
    return { shotId, kind: 'live', panes, fov: FOV.SPLIT, grade: GRADE.SPLIT, bug: bugFor(shotId, null, probe) };
  }

  return null;
}

/**
 * 🚨 THE SHOT BUG NAMES A CAMERA AND A ROOM, AND IT CAN NAME NOTHING ELSE.
 *
 * §4's mock reads `CAM 03 · EAST GALLERY · LIVE`. The temptation, every single time, is to add the
 * subject — *"CAM 03 · EAST GALLERY · VIC"* — which is a caption naming a person standing where
 * something just went wrong, i.e. **T5 violated by the furniture**. The room comes from
 * `probe.label`, which only knows the six rooms; there is no parameter here that could carry a
 * player, and `shot-solver` H7 sweeps every bug this function can produce to keep it that way.
 */
export function bugFor(shotId, site, probe) {
  if (isFiller(shotId)) return shotId === 'SPONSOR' ? 'AD BREAK' : 'RRR LIVE';
  if (!site) return `${shotId} · LIVE`;
  const n = String((site.index ?? 0) + 1).padStart(2, '0');
  const room = probe.label ? probe.label(site.room) : String(site.room || '').toUpperCase();
  return `CAM ${n} · ${room} · LIVE`;
}

/** The camera wall's own readout — `N/M CAMS ONLINE`, §4's permanent furniture. */
export const camWall = (unlocked, needed) => `${unlocked}/${needed} CAMS ONLINE`;

/** Every room this module could ever name, so a sweep has a closed set to check against. */
export const NAMEABLE_ROOMS = Object.freeze(ROOMS.slice());
