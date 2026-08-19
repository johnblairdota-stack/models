/**
 * All Meshy furniture smash-test assets (concept → GLB).
 * Original 8 first, then the later 16. Used by furn.smash and the Image-to-3D tool.
 *
 * Scale is vs a 1.7 m robot. `targetH` / `maxSpan` are the fitted metres after
 * flatten; the lab scales UP or down to hit them (Meshy native size is not the size).
 */

export const FURN_SMASH_ASSETS = [
  { id: 'chair', file: 'rrr_prop_chair_v1.glb', kind: 'chair', targetH: 1.15, maxSpan: 0.85 },
  { id: 'desk', file: 'rrr_prop_desk_v1.glb', kind: 'desk', targetH: 0.82, maxSpan: 2.05 },
  { id: 'console', file: 'rrr_prop_console_v1.glb', kind: 'console', targetH: 0.88, maxSpan: 1.90 },
  { id: 'crate', file: 'rrr_prop_crate_v1.glb', kind: 'crate', targetH: 0.85, maxSpan: 0.90, vox: 'shell' },
  { id: 'cam-wall', file: 'rrr_prop_cam-wall_v1.glb', kind: 'camera', targetH: 0.55, maxSpan: 0.55, liftY: 1.55, vox: 'off' },
  { id: 'cam-tripod', file: 'rrr_prop_cam-tripod_v1.glb', kind: 'camera', targetH: 1.55, maxSpan: 0.85, vox: 'off' },
  { id: 'fireplace', file: 'rrr_prop_fireplace_v1.glb', kind: 'fireplace', targetH: 2.40, maxSpan: 2.55 },
  { id: 'chandelier', file: 'rrr_prop_chandelier_v1.glb', kind: 'giltbox', targetH: 1.35, maxSpan: 1.55, liftY: 2.85 },
  { id: 'rug-circle', file: 'rrr_prop_rug-circle_v1.glb', kind: 'rug', maxSpan: 2.80, thin: true },
  { id: 'wingback', file: 'rrr_prop_wingback_v1.glb', kind: 'chair', targetH: 1.35, maxSpan: 0.95 },
  { id: 'settee', file: 'rrr_prop_settee_v1.glb', kind: 'chair', targetH: 1.10, maxSpan: 2.15 },
  { id: 'sideboard', file: 'rrr_prop_sideboard_v1.glb', kind: 'desk', targetH: 1.00, maxSpan: 2.20 },
  { id: 'bookcase', file: 'rrr_prop_bookcase_v1.glb', kind: 'desk', targetH: 2.40, maxSpan: 1.35 },
  { id: 'grand-piano', file: 'rrr_prop_grand-piano_v1.glb', kind: 'desk', targetH: 1.20, maxSpan: 2.45, health: 3.2 },
  { id: 'armor', file: 'rrr_prop_armor_v1.glb', kind: 'urn', targetH: 2.05, maxSpan: 1.05, health: 2.0 },
  { id: 'pedestal-bust', file: 'rrr_prop_pedestal-bust_v1.glb', kind: 'urn', targetH: 1.75, maxSpan: 0.70, health: 1.5 },
  { id: 'table-round', file: 'rrr_prop_table-round_v1.glb', kind: 'console', targetH: 0.78, maxSpan: 1.45 },
  { id: 'chaise', file: 'rrr_prop_chaise_v1.glb', kind: 'chair', targetH: 1.00, maxSpan: 2.10 },
  { id: 'gramophone', file: 'rrr_prop_gramophone_v1.glb', kind: 'giltbox', targetH: 1.20, maxSpan: 0.80 },
  { id: 'torchiere', file: 'rrr_prop_torchiere_v1.glb', kind: 'giltbox', targetH: 1.90, maxSpan: 0.65 },
  { id: 'card-table', file: 'rrr_prop_card-table_v1.glb', kind: 'console', targetH: 0.78, maxSpan: 1.15 },
  { id: 'hall-stand', file: 'rrr_prop_hall-stand_v1.glb', kind: 'desk', targetH: 2.10, maxSpan: 0.95, vox: 'shell' },
  { id: 'vitrine', file: 'rrr_prop_vitrine_v1.glb', kind: 'desk', targetH: 2.15, maxSpan: 1.20, vox: 'shell' },
  { id: 'ottoman', file: 'rrr_prop_ottoman_v1.glb', kind: 'chair', targetH: 0.48, maxSpan: 0.95 },
];
