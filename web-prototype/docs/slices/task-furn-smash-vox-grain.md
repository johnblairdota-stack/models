# Slice plan: house-voxel grain, not six blocks (r20)

**Status:** CRITIQUED — r20 PASS, not WOWED. Leftover #1: interior still thick vertical slabs.

**Bar:** `refs/teardown/yt-house-148s-sledge-hole.png`.
r19 critic **PASS**, not WOWED. Leftover #1: fireplace meat is a handful
of large cubes, not 148s’ dense house-voxel island. Well is gone; do
not reopen it. Do not go cream. Plates must not go light.

## Why

Cut cubes are one box per occupancy cell. `CELL` is 0.08 m but
`MAX_AXIS` 24 forces the fireplace (`maxSpan` 2.55 m) to
`cell = span/24 ≈ 0.11 m` after padding. A 0.58 m carve then shows
about six stairs. 148s reads cube faces at house-voxel scale through
the same kind of hole. Subdividing cubes inside a coarse stair would
leave the silhouette. The lattice itself has to get smaller.

## Decisions

1. **`CELL = 0.05`.** `MAX_AXIS = 48`. Floor `0.04` (the two
   `Math.max(..., 0.045)` lines). Fireplace cell lands near 5 cm, not
   11 cm. Do not add a cut-cube SUB grid — one cube per carved cell.

2. **Still instance every carved cell.** The r19 meat plug stays. Do
   not hollow the crater. Do not bring back a depth cap.

3. `_payGroup`, `bodyTint`, `readableMeat`, `furnChip`, cameras —
   unchanged.

## Presentation

Fireplace leave: a dense same-hue voxel crater you can read into, at
house-voxel grain, not six large blocks. Not cream. Desk the same
idea. Chaise / settee / table-round / crate plates must not go light.

## Ownership

| May edit | Do not touch |
|---|---|
| `src/destruction/furn-voxels.js` (`CELL`, `MAX_AXIS`, cell floor) | `debris.js`, `_payGroup`, `_rebuildCut` logic, `bodyTintFrom` |
| this file | cameras |

## Verification

```
npm run build
node harness/playtest.mjs --view furn.smash --script harness/_furn-smash-critic.mjs --port 5393 --q "quality=medium"
```

Look at `s-fireplace-leave.png` vs 148s. Count cube faces in the bite.
Ceiling PASS. Well must still be gone.

If a stated fact is wrong, say so rather than diverging.
