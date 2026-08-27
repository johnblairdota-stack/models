# Slice plan: bed + tato in the smash rotation

**Status:** BUILT — smash-lab catalog only. Relaunch FURNSMASH.

**Bar:** same blank room as `furn.smash`. New pieces stand in the two-row lineup
with the existing 24, smashable with the shipped r13 voxel body.

## Why

`C:\Users\John\Documents\models\models\` has `bed.glb` and `tato.glb`. They are
not in `FURN_SMASH_ASSETS`, so FURNSMASH never loads them.

Native bounds (gltf-transform): bed ≈ 1.27 × 1.28 × 2.00 m; tato ≈ 1.33 × 2.00 ×
1.69 m. Already metres, unlike Meshy toys. Do **not** apply `LAB.boost` 1.55.

## Decisions

1. Copy both GLBs into `public/models/furn/` as `bed.glb` and `tato.glb`.
2. Append to `FURN_SMASH_ASSETS`:
   - bed: `kind: 'desk'`, `targetH: 1.05`, `maxSpan: 2.20`, `boost: 1`, HP 2.4
   - tato: `kind: 'urn'`, `targetH: 1.70`, `maxSpan: 1.50`, `boost: 1`, HP 1.8
3. `fitProp`: `s *= spec.boost ?? LAB.boost` (thin still skips).
4. `LAB.cols = 13` so 26 pieces stay two rows (room ±26 m still clears 12 × 3.6 m).
5. Smash voxels stay shipped r13. Do not touch `game.play` chair circle or dig.

## Presentation

Bed reads as a bed next to the 1.7 m robot, not a Meshy-boosted four-poster.
Tato reads person-height. Same aisle, same smash.

## Ownership

| May edit | Do not touch |
|---|---|
| `src/game/furn-catalog.js` | `furn-voxels.js`, `debris.js`, wall dig |
| `src/game/furn-smash-lab.js` (`fitProp`, `LAB.cols`) | `furn-dress.js`, chair circle |
| `public/models/furn/{bed,tato}.glb` | colour/plug loop |
| this file | |

## Verification

```
npm run build
```

Relaunch `FURNSMASH.bat`. Walk the rows: 13 + 13, bed and tato at the end.

If a stated fact is wrong, say so rather than diverging.
