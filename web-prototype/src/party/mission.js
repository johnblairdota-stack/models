/**
 * Night smash missions — episode → room / target / copy.
 *
 * Episode 1 is the gallery painting (a framed plane; there is no painting GLB).
 * Episode 2+ is the chapel round table (`rrr_prop_table-round_v1.glb`), already
 * in `furn-catalog.js` and already assigned to chapel in `furn-layout.js`.
 *
 * No THREE, no DOM. Phones, the guide map, and the follow bed all read this so
 * the copy and the smash cannot disagree.
 */

export const MISSION_PAINTING = {
  id: 'gallery-painting',
  room: 'gallery',
  target: 'painting',
  catalogId: null,
  seek: 'Find the gallery. Break the painting.',
  home: 'The painting is down. Get back to the ballroom.',
};

export const MISSION_TABLE = {
  id: 'chapel-table',
  room: 'chapel',
  target: 'table-round',
  catalogId: 'table-round',
  seek: 'Find the chapel. Smash the round table.',
  home: 'The table is down. Get back to the ballroom.',
};

/** Episode 1 is the painting; every later expedition is the chapel table. */
export function missionFor(episode) {
  const ep = Number(episode);
  // Missing / NaN / 0 / 1 stay on the premiere smash. Only 2+ is the table.
  return Number.isFinite(ep) && ep >= 2 ? MISSION_TABLE : MISSION_PAINTING;
}
