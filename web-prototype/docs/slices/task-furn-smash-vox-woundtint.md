# Slice plan: umber-stamp wound-facing Meshy (r38)

**Status:** REVERTED — player one-hit showed a flat brown disc on the remaining mesh. Wound-tint is out. Clip is back to r4 (discard only).

**Bar:** `refs/teardown/yt-house-148s-sledge-hole.png`.
r37 critic **PASS**, not WOWED. Hairline close (cell×1.0) moved densest
lip 68.1→**71.3%**. Leftover #1: not 148s **100%** `#4c3c2c`. Espresso/terra
**13.5/12.8** did not shrink (claimed shrink failed). Ranked `#443224`
luma 0.208. r32 lip still **80.7%**. Chaise stayed a seat-shaped bite.

Cubes are already unlit `#4c3c2c` family. Espresso in the densest window
is the **original Meshy** showing in the 0.90-scale tunnels, not the
cubes. Do not instance-scale toward 1.0 (r24 slab). Do not dilate clip
(r34 espresso ate the island). Do not brighten dust. Do not restore
the inward-normal skip (khaki). Do not undo AABB plug.

## Why

`patchVoxClip` only discards carved cells. Remaining wood in a cell next
to a carve is still Meshy espresso. Stamp that wound-facing Meshy to the
same unlit `#4c3c2c` the cubes use, only when chroma is low, so rose
velvet stays rose.

## Decisions

1. **In `patchVoxClip` only.** Bump cache key to `furn-vox-clip-r5`.

2. After the occupancy discard, 6-neighbor sample `uVoxOcc`. A neighbor
   **inside the grid** with occupancy `< 0.5` means this fragment faces
   a carve. Set `voxWound = 1.0`. Neighbors **outside** the grid do not
   count (do not umber the unsmashed exterior).

3. Before `#include <opaque_fragment>`, if `voxWound > 0.5` and
   `diffuseColor` chroma `< 0.20` and luma `>= 0.08`, set
   `outgoingLight` to `vec3(76.0, 60.0, 44.0) / 255.0` (`#4c3c2c`).
   Throw if the `opaque_fragment` needle is missing.

4. Cut geometry `g.cell * 1.0`, scale `(0.90, 0.90, 0.90)`, full AABB
   sphere plug, `_cellColor`, r32 dust — unchanged.

## Presentation

Fireplace densest espresso/terra shrink vs r37 13.5/12.8; lip toward
r32’s 80.7% and 148s 100%. Voxel grid not 104×113. Chaise seat-shaped
**rose/wood**, not a brown air sphere and not umber velvet. Not cream.
Well must stay gone. Plates must not go light.

## Ownership

| May edit | Do not touch |
|---|---|
| `src/destruction/furn-voxels.js` (`patchVoxClip` only) | `dust.js`, scale, plug, `_cellColor`, `cutS` |
| this file | cameras |

## Verification

```
npm run build
node harness/playtest.mjs --view furn.smash --script harness/_furn-smash-critic.mjs --port 5428 --q "quality=medium"
```

Espresso/terra should drop vs r37 13.5/12.8. Chaise seat must stay rose.
Ceiling PASS.

If a stated fact is wrong, say so rather than diverging.
