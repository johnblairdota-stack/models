/**
 * Night expedition jobs — episode → room / target / copy.
 *
 * Episode 1 is the twin-painting smash (WALL_CALL). Every later expedition is
 * the same noisy wall-camera install (DRILL / TALLY) until a camera actually
 * mounts. A failed mount stays dark; the next pair drills again. Do not add
 * TILT. Chapel table-round stays furniture, not a job.
 *
 * No THREE, no DOM. Phones, the guide map, and the follow bed all read this so
 * the copy and the smash cannot disagree.
 */

import { JOB } from './jobs.js';

export const MISSION_PAINTING = {
  id: 'gallery-twin',
  job: JOB.SMASH,
  task: 'WALL_CALL',
  room: 'gallery',
  target: 'twin-painting',
  catalogId: null,
  seek: 'Find the gallery. Hit one painting.',
  /** Once she is standing in it. See `seekLine` — the room name has done its job by then. */
  arrived: 'You are in it. Two faces. Hit one.',
  home: 'One is down. Get back to the ballroom.',
};

/** @deprecated chapel smash is retired; kept so a stale import fails loudly on `.job`. */
export const MISSION_TABLE = {
  id: 'chapel-table',
  job: JOB.SMASH,
  task: 'WALL_CALL',
  room: 'chapel',
  target: 'table-round',
  catalogId: 'table-round',
  seek: 'Find the chapel. Smash the round table.',
  home: 'The table is down. Get back to the ballroom.',
};

export const MISSION_DRILL = {
  id: 'gallery-drill',
  job: JOB.DRILL,
  task: 'TALLY',
  room: 'gallery',
  target: 'wall-cam',
  catalogId: null,
  seek: 'Find the gallery. Mount the wall camera.',
  arrived: 'You are in it. Hold DRILL until it mounts.',
  home: 'The mount is in. Get back to the ballroom.',
};

/** Episode 1 is the twin smash. Every later expedition is DRILL. */
export function missionFor(episode) {
  const ep = Number(episode);
  // Missing / NaN / 0 / 1 stay on the premiere smash. Only 2+ is the drill.
  return Number.isFinite(ep) && ep >= 2 ? MISSION_DRILL : MISSION_PAINTING;
}

/**
 * 🧭 **THE SEEK LINE ADVANCES ONCE SHE IS STANDING IN IT.**
 *
 * John, 2026-09-01: *"Once the runner is in the mission room, advance the seek line (stop saying
 * Find the gallery)."*
 *
 * It is a small line and it was a real problem: a pad that keeps saying FIND THE GALLERY at
 * somebody standing in the gallery reads as a screen that has stopped listening, and the runner's
 * next question — *"am I in the right room?"* — is one the guide then has to answer instead of
 * doing her job. Under auto-walk it is worse, because the body arrived without the player
 * steering it and the copy is the only thing that can say so.
 *
 * 🚨 **IT COMPARES TWO ROOM IDS AND NOTHING ELSE, SO IT LEAKS NOTHING.** `here` is the seat's own
 * room — `you.here` for the runner, `scope.hereId` for the guide, both of which already exist and
 * are already entitled — and `missionRoom` rides the PUBLIC `mission.*` event every phone gets.
 * A player who is not in the room learns nothing they did not have.
 *
 * ⚠️ **NO FOURTH PHASE.** D1 is explicit that `mission.phase` stays `seek` → `return` → `done`.
 * This is copy, chosen from the phase and a room id; nothing here is a state.
 */
export function seekLine(spec, { here = null, missionRoom = null, phase = 'seek' } = {}) {
  const s = spec ?? MISSION_PAINTING;
  if (phase === 'done') return 'Home. That is the run.';
  if (phase === 'return') return s.home;
  const inRoom = !!here && !!missionRoom && String(here) === String(missionRoom);
  return inRoom ? (s.arrived ?? s.seek) : s.seek;
}
