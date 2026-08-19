# Slice plan: packed voxel island, not firebox slabs (r21)

**Status:** CRITIQUED — r21 PASS, not WOWED. Leftover #1: packed, but not 148s’ one crumbled umber island.

**Bar:** `refs/teardown/yt-house-148s-sledge-hole.png`.
r20 critic **PASS**, not WOWED. Leftover #1: fireplace interior is still
a few thick vertical slabs, not 148s’ dense house-voxel island. Rim
got finer (mean-run 5.9→3.3). Well did not return. Meat-window lip
fell 85%→43% (khaki through-gaps). Do not go cream. Plates must not
go light.

## Why

`fillYSpan` packs each XZ column between hearth and lintel, so the
opening is occupancy columns. A 0.58 m sphere then clips the Meshy
and leaves those columns — plus the firebox back — visible through a
thin 5 cm rim. Packed cubes also share one tint and one rotation, so
front faces fuse into planks. 148s is one crumbled umber island. Do
not shrink `CELL` again (that thinned the plug). Do not bring back a
depth cap.

## Decisions

1. **Inward empty plug.** After the carve loops, every cell still
   inside the same sphere whose `(cell − hit) · nrm ≤ 0.04` and is
   not already `carved` becomes `carved = 1`. That includes empty
   firebox / opening cells. Do **not** mark front air
   (`· nrm > 0.04`). Do not add them to `removed` (no extra plates).
   Hoist the existing `nrm` (hit vs grid centre, y=0.25) **before**
   the carve so the plug can use it. Fallback sphere uses `best` +
   `r2b` as the plug centre/radius when the main sphere removed
   nothing.

2. **Cut cubes break the plank.** In `_rebuildCut`, each instance
   gets a hash of `i`: yaw `(h−0.5)*0.7` rad, pitch `(h2−0.5)*0.35`,
   scale `0.84 + h3*0.14`. Tint is `_cellColor` times
   `0.88 + h*0.22` per channel, clamped to 1. Do not lift toward
   cream. Still one cube per carved cell. Still no depth cap.

3. `CELL`, `MAX_AXIS`, `fillYSpan`, `_payGroup`, `bodyTint`, cameras
   — unchanged.

## Presentation

Fireplace leave: looking into the bite you read a packed same-hue
voxel island through the volume, not a rim then vertical slabs.
Not cream. Desk the same idea. Chaise / settee / table-round / crate
plates must not go light. Well must stay gone.

## Ownership

| May edit | Do not touch |
|---|---|
| `src/destruction/furn-voxels.js` (`applyHit` plug, `_rebuildCut` jitter) | `debris.js`, `CELL`, `MAX_AXIS`, `fillYSpan`, `_payGroup` |
| this file | cameras |

## Verification

```
npm run build
node harness/playtest.mjs --view furn.smash --script harness/_furn-smash-critic.mjs --port 5395 --q "quality=medium"
```

Look at `s-fireplace-leave.png` vs 148s. Interior of the bite, not
just the rim. Ceiling PASS.

If a stated fact is wrong, say so rather than diverging.
