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
  home: 'The mount is in. Get back to the ballroom.',
};

/** Episode 1 is the twin smash. Every later expedition is DRILL. */
export function missionFor(episode) {
  const ep = Number(episode);
  // Missing / NaN / 0 / 1 stay on the premiere smash. Only 2+ is the drill.
  return Number.isFinite(ep) && ep >= 2 ? MISSION_DRILL : MISSION_PAINTING;
}
