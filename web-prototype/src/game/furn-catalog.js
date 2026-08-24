/**
 * All Meshy furniture smash-test assets (concept → GLB).
 * Original 8 first, then the later 16. Used by furn.smash and the Image-to-3D tool.
 *
 * Scale is vs a 1.7 m robot. `targetH` / `maxSpan` are the fitted metres after
 * flatten; the lab scales UP or down to hit them (Meshy native size is not the size).
 *
 * John / 2026-08-24: every non-rug row is ×0.7 of the previous fit (30% smaller).
 * `rug-circle` stays at catalog `maxSpan: 2.80` — ballroom chair-ring restale
 * (`rugScaleForSeats`) owns live rug diameter, not this table.
 *
 * `FURN_FIT_BOOST` is then applied on top (`furn-fit.js`) so Meshy native chairs read next
 * to UNIT-4H. Doorway keep-out MUST use the boosted span — after ×0.7 a crate is authored
 * at 0.63 m (~0.98 m on the floor). Pathing-only `maxSpan/2` is what left the old 0.90 m
 * crate sitting in the opening.
 */

/** Extra uniform scale after targetH/maxSpan. Same number `furn-fit.js` multiplies by. */
export const FURN_FIT_BOOST = 1.55;

export const FURN_SMASH_ASSETS = [
  { id: 'chair', file: 'rrr_prop_chair_v1.glb', kind: 'chair', targetH: 0.805, maxSpan: 0.595 },
  { id: 'desk', file: 'rrr_prop_desk_v1.glb', kind: 'desk', targetH: 0.574, maxSpan: 1.435 },
  { id: 'console', file: 'rrr_prop_console_v1.glb', kind: 'console', targetH: 0.616, maxSpan: 1.33 },
  { id: 'crate', file: 'rrr_prop_crate_v1.glb', kind: 'crate', targetH: 0.595, maxSpan: 0.63, vox: 'shell' },
  { id: 'cam-wall', file: 'rrr_prop_cam-wall_v1.glb', kind: 'camera', targetH: 0.385, maxSpan: 0.385, liftY: 1.55, vox: 'off' },
  { id: 'cam-tripod', file: 'rrr_prop_cam-tripod_v1.glb', kind: 'camera', targetH: 1.085, maxSpan: 0.595, vox: 'off' },
  { id: 'fireplace', file: 'rrr_prop_fireplace_v1.glb', kind: 'fireplace', targetH: 1.68, maxSpan: 1.785 },
  { id: 'chandelier', file: 'rrr_prop_chandelier_v1.glb', kind: 'giltbox', targetH: 0.945, maxSpan: 1.085, liftY: 2.85 },
  { id: 'rug-circle', file: 'rrr_prop_rug-circle_v1.glb', kind: 'rug', maxSpan: 2.80, thin: true },
  { id: 'wingback', file: 'rrr_prop_wingback_v1.glb', kind: 'chair', targetH: 0.945, maxSpan: 0.665 },
  { id: 'settee', file: 'rrr_prop_settee_v1.glb', kind: 'chair', targetH: 0.77, maxSpan: 1.505 },
  { id: 'sideboard', file: 'rrr_prop_sideboard_v1.glb', kind: 'desk', targetH: 0.70, maxSpan: 1.54 },
  { id: 'bookcase', file: 'rrr_prop_bookcase_v1.glb', kind: 'desk', targetH: 1.68, maxSpan: 0.945 },
  { id: 'grand-piano', file: 'rrr_prop_grand-piano_v1.glb', kind: 'desk', targetH: 0.84, maxSpan: 1.715, health: 3.2 },
  { id: 'armor', file: 'rrr_prop_armor_v1.glb', kind: 'urn', targetH: 1.435, maxSpan: 0.735, health: 2.0 },
  { id: 'pedestal-bust', file: 'rrr_prop_pedestal-bust_v1.glb', kind: 'urn', targetH: 1.225, maxSpan: 0.49, health: 1.5 },
  { id: 'table-round', file: 'rrr_prop_table-round_v1.glb', kind: 'console', targetH: 0.546, maxSpan: 1.015 },
  { id: 'chaise', file: 'rrr_prop_chaise_v1.glb', kind: 'chair', targetH: 0.70, maxSpan: 1.47 },
  { id: 'gramophone', file: 'rrr_prop_gramophone_v1.glb', kind: 'giltbox', targetH: 0.84, maxSpan: 0.56 },
  { id: 'torchiere', file: 'rrr_prop_torchiere_v1.glb', kind: 'giltbox', targetH: 1.33, maxSpan: 0.455 },
  { id: 'card-table', file: 'rrr_prop_card-table_v1.glb', kind: 'console', targetH: 0.546, maxSpan: 0.805 },
  { id: 'hall-stand', file: 'rrr_prop_hall-stand_v1.glb', kind: 'desk', targetH: 1.47, maxSpan: 0.665, vox: 'shell' },
  { id: 'vitrine', file: 'rrr_prop_vitrine_v1.glb', kind: 'desk', targetH: 1.505, maxSpan: 0.84, vox: 'shell' },
  { id: 'ottoman', file: 'rrr_prop_ottoman_v1.glb', kind: 'chair', targetH: 0.336, maxSpan: 0.665 },
];
