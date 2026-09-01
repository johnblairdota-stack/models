/**
 * 🎯 **OBJECTIVE PINS — the guide may pin the JOB, not only the next door.**
 *
 * John, 2026-09-02 (~8:07am Brisbane), answering the overnight pass's one open question:
 *
 *   *"guides need to also be able to pin objectives like the paintings or the camera install
 *   position."*
 *
 * The overnight pass put the pin on the wire and made the body walk it, but a pin could only ever
 * be a NEIGHBOUR DOOR — so the walk stopped at the gallery threshold and the last four metres went
 * back to being a thumb. This module is the other half: inside the mission room the guide's chips
 * become the job's own targets, the pin travels on exactly the same wire, and the body walks it.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 **AN OBJECTIVE PIN NAMES A THING, NOT A PLACE — AND THAT IS THE WHOLE SAFETY ARGUMENT.**
 * ---------------------------------------------------------------------------------------------
 * A door pin is a coordinate the phone computed and the body walks to. An objective pin is not,
 * and it must not be, because the phone and the body do not build the same house from the same
 * numbers:
 *
 *   · the phone has `mansion.js` `planRegions(seed)`, whose rooms are a UNION OF RECTANGLES —
 *     a decomposed room hands back two or three rects sharing one id;
 *   · `follow-bed.js` has `room.tables.spaces`, and `spaceOfType` picks ONE of them.
 *
 * They agree for a plain rectangular gallery and they are free to disagree for any other. So the
 * coordinates on an objective pin are a BEARING HINT for `intel-pad.js` `bezelOf` — which draws a
 * heading on the runner's phone edge and nothing else — and the BODY RE-RESOLVES THE NAME against
 * the scene it actually built. `follow-bed.js` `resolvePin` is where that happens. A phone that
 * sent `face-left` with coordinates in the ballroom still walks the runner to the real left
 * painting, and `harness/runner-intel.mjs` RI19d is that stated as a check rather than as a hope.
 *
 * ---------------------------------------------------------------------------------------------
 * 🤫 **AND IT LEAKS NOTHING THE VOICE DID NOT ALREADY LEAK.**
 * ---------------------------------------------------------------------------------------------
 * Nothing in this file imports `realFaceFor` or `drillShotFor`. It cannot: the four kinds below
 * are the two twins and the two brackets, neutrally, and which of them is REAL is decided in
 * `jobs.js` and printed only on the GUIDE's private pad. So an objective pin carries exactly what
 * the guide shouting *"left wall"* across a couch already carried — **which one she picked**, never
 * which one is right. That is the lie, intact:
 *
 *   · a good guide pins the real face, or the bracket that sees the hall;
 *   · an evil guide pins the decoy face, or the bracket that ends up looking at boards.
 *
 * ⚠️ **THE RUNNER'S PAD NEVER RENDERS THE KIND.** `bezelOf` returns `{whole, runs, word, range,
 * pinned}` — there is no `kind` in it and `RUNNER_PAD_KEYS` has no row for one — so she sees a
 * BEARING to whatever she was pinned at, exactly as she does for a door. The two brackets are the
 * same fixture on two walls, and what a mounted camera would end up SEEING is on the other side of
 * a wall she is standing behind. Gate: `runner-intel` RI19f.
 */

import { JOB, SHOTS, FACES, twinHang, camHang } from './jobs.js';

/**
 * The four objective pins, closed.
 *
 * 🚨 **THERE IS NO FIFTH AND ADDING ONE IS A DESIGN DECISION.** `CLAUDE.md`'s *"Two expedition
 * jobs, locked 30 Aug"* is what makes a fixed list honest — one smash with two faces, one drill
 * with two brackets. A third job comes back through John and comes back through here, and
 * `follow.js` `PIN_KINDS` is derived from this array rather than being a second copy of it.
 */
export const OBJECTIVE_KINDS = Object.freeze([
  'face-left', 'face-right', 'mount-hall', 'mount-floor',
]);

/** `face-left` gives `left`, `mount-hall` gives `hall`, anything else gives `null`. */
export function objectiveSpot(kind) {
  const k = String(kind ?? '');
  if (!OBJECTIVE_KINDS.includes(k)) return null;
  return k.slice(k.indexOf('-') + 1);
}

/** True for the four above and false for `room` / `edge` / junk. One test, used everywhere. */
export function isObjectivePin(kind) {
  return OBJECTIVE_KINDS.includes(String(kind ?? ''));
}

/** The two kinds this job offers, in chip order. Empty for a job with no targets. */
export function kindsForJob(job) {
  if (job === JOB.SMASH) return FACES.map((f) => `face-${f}`);
  if (job === JOB.DRILL) return SHOTS.map((s) => `mount-${s}`);
  return [];
}

/**
 * Chip copy. Deliberately flat words with no quality in them: LEFT and RIGHT are the two twins as
 * the guide already says them out loud, HALL and FLOOR are the two brackets as `toolLabel` already
 * prints them. Nothing here says which is real — `guideJobPad`'s private line does, one surface up.
 */
const LABEL = Object.freeze({
  'face-left': 'LEFT FACE',
  'face-right': 'RIGHT FACE',
  'mount-hall': 'HALL MOUNT',
  'mount-floor': 'FLOOR MOUNT',
});

export function objectiveLabel(kind) {
  return LABEL[String(kind ?? '')] ?? '';
}

/**
 * Where an objective kind hangs in a given room rect.
 *
 * The SAME `jobs.js` functions the 3D builder calls, so the hint and the truth are one edit apart
 * rather than two files apart. `null` for an unknown kind or a missing space — never a guess.
 */
export function objectiveHang(kind, space, floorY = 0) {
  const spot = objectiveSpot(kind);
  if (!spot || !space) return null;
  if (String(kind).startsWith('face-')) return twinHang(space, spot, floorY);
  return camHang(space, floorY, spot);
}

/**
 * The guide's chips for one job in one room — `{kind, label, x, z}` each, or `[]`.
 *
 * ⚠️ **`roomId` IS NOT ON THE CHIP AND THE CALLER SUPPLIES IT.** The chip knows the geometry; the
 * pin knows which room the geometry was read out of, and those are different facts. Keeping them
 * apart is what stops a stale chip from claiming a room the runner has since walked out of.
 */
export function objectiveSpots(job, space, floorY = 0) {
  const out = [];
  for (const kind of kindsForJob(job)) {
    const hang = objectiveHang(kind, space, floorY);
    if (!hang) continue;
    out.push({ kind, label: objectiveLabel(kind), x: Number(hang.x), z: Number(hang.z) });
  }
  return out;
}

/**
 * The union bounding box of every rect sharing an id — the phone's stand-in for the one `space`
 * the builder picked.
 *
 * 🚨 **THIS IS AN APPROXIMATION AND IT IS LABELLED ONE.** For a plain rectangular room it is exact.
 * For a decomposed room it is the box AROUND the pieces, so a hang computed from it can sit a metre
 * or two off the built one — a bearing that points slightly wrong, and never a body that walks
 * somewhere wrong, because of `resolvePin`. See the header.
 */
export function unionRect(rects, id) {
  const mine = (rects ?? []).filter((r) => r && String(r.id) === String(id));
  if (!mine.length) return null;
  return {
    id: String(id),
    x0: Math.min(...mine.map((r) => r.x0)), x1: Math.max(...mine.map((r) => r.x1)),
    z0: Math.min(...mine.map((r) => r.z0)), z1: Math.max(...mine.map((r) => r.z1)),
  };
}

/**
 * Turn a tapped chip into a pin. Assignment, never append — D2, same as `pinDoor`.
 *
 * `roomId` is the MISSION ROOM's id, which is what `room.js` already stores for a door pin and what
 * the body compares against before it will resolve the name at all.
 */
export function pinObjective(spots, kind, roomId) {
  const spot = (spots ?? []).find((s) => s.kind === kind);
  if (!spot) return null;
  return { x: Number(spot.x), z: Number(spot.z), roomId: String(roomId ?? ''), kind };
}

/**
 * The board's big line for an objective pin, in the guide's own mouth. One sentence, because — as
 * `sayThis` says — it exists to be SAID rather than read.
 *
 * ⚠️ **IT NAMES THE PICK AND NEVER THE TRUTH.** *"Hit the left one"*, not *"hit the real one"*. If
 * this sentence ever knew which face was real it would be reading the guide's private card out
 * loud onto a line the design intends her to have to CHOOSE to say.
 */
export function objectiveSay(kind) {
  switch (String(kind ?? '')) {
    case 'face-left': return 'Hit the left one.';
    case 'face-right': return 'Hit the right one.';
    case 'mount-hall': return 'Mount it on the hall wall.';
    case 'mount-floor': return 'Mount it on the low wall.';
    default: return '';
  }
}

/**
 * 🎯 **THE RESOLVER — a name, plus what the SCENE says is there, gives a place to walk to.**
 *
 * 🚨 **THIS IS A PURE FUNCTION FOR `runner-intel.js`'s REASON AND NOT FOR TIDINESS.** The rule it
 * carries — *an objective pin names a thing, not a place* — is the one thing standing between a
 * lying phone and a body walking somewhere nobody asked for, and a rule that lives inside a THREE
 * closure has only ever been checked by opening a browser. `follow-bed.js` `resolveObjective` reads
 * the scene (which faces are still intact, where the two brackets ended up), hands the ANSWERS in,
 * and gets a coordinate back. `harness/runner-intel.mjs` RI19d/RI19e run this exact function.
 *
 * Two refusals, and both of them are `null` rather than a fallback:
 *
 *   1. **The runner is not in the mission room.** `room.pathPortals` will happily return a
 *      four-door route to a painting three rooms away, which is precisely the memorised route D4
 *      forbids. The chips only exist while she is standing in the room (`guidePad`), so this is
 *      that same rule enforced a second time at the end that has to be right.
 *   2. **The named target is not there** — a smashed face, a bracket that failed to build. A pin
 *      at a canvas somebody already broke is not a destination.
 *
 * ⚠️ **`pin.x` AND `pin.z` ARE NEVER READ HERE.** That is the whole guarantee. Grep this function
 * for them and you will not find them; RI19d asserts it by sending a pin whose coordinates are in
 * another room entirely and watching the body still walk to the real target.
 *
 * @param {{left?:object,right?:object,hall?:object,floor?:object}} targets what the scene has, by
 *   spot name — `{x, z}` each, and `live: false` for a target that is no longer there.
 */
export function objectiveGoal(pin, { here = null, missionRoom = null, targets = null } = {}) {
  const spot = objectiveSpot(pin?.kind);
  if (!spot) return null;
  if (!here || !missionRoom || String(here) !== String(missionRoom)) return null;
  const at = targets?.[spot];
  if (!at || at.live === false) return null;
  if (!Number.isFinite(Number(at.x)) || !Number.isFinite(Number(at.z))) return null;
  return { x: Number(at.x), z: Number(at.z) };
}

/**
 * Words an objective line may never contain — the same fail-closed shape as `TELL_FORBIDDEN`.
 * `real` and `decoy` are the two that matter: they are the guide's private card, and the moment one
 * of them reaches a shared surface the whole drill is a formality.
 */
export const SAY_FORBIDDEN = Object.freeze([
  'real', 'decoy', 'fake', 'sabotage', 'evil', 'traitor',
]);
