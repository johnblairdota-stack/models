# Slice plan: revert dust bright; dilate clip (r34)

**Status:** CRITIQUED — r34 WEAK. Dilate grew espresso 7.3→30.0, lip 70.4→60.4. Revert.

**Bar:** `refs/teardown/yt-house-148s-sledge-hole.png`.
r33 critic **PASS**, not WOWED. Ranked hex hit `#4d3a2c` luma 0.240
but lip **80.7%→70.4%** and dust **6.6%→18.2%**. r32 is the better
island (lip 80.7%, dust 6.6%). Revert `bright`/`brightVar` to r32.
Leftover terra/espresso is Meshy in 0.90 gaps. Dilate clip one cell
so those gaps show umber cubes, not Meshy. Do not pack 1.0. Do not
undo AABB plug. Chaise must stay a seat-shaped bite.

## Why

Brighter dust painted over the island and split it. The unpaid 148s
gap is espresso/terra in cube tunnels (r32 hue-split 8.4/13.4). Clip
already discards carved cells; a 6-neighbor dilate hides the Meshy
hairline without fusing cubes (scale stays 0.90).

## Decisions

1. **Dust back to r32:** `bright: 0.55`, `brightVar: 0.18`. Count/size
   unchanged.

2. **After the plug loop, dilate `this.clip` one 6-neighbor step.**
   Any cell with clip 0 forces its six grid neighbors to 0. One pass.
   Then existing `tex.needsUpdate` at end of `applyHit`.

3. Scale 0.90, AABB plug, per-cell `_cellColor` — unchanged.

## Presentation

Fireplace densest lip back toward 80%+, `#4c3c2c` family, espresso/
terra shrink vs r32. Voxel grid not 104×113. Chaise seat-shaped, not
a brown air sphere. Not cream. Well must stay gone. Plates must not
go light.

## Ownership

| May edit | Do not touch |
|---|---|
| `src/destruction/furn-voxels.js` (dust bright revert + clip dilate in `applyHit`) | `dust.js`, `debris.js`, scale, `_cellColor` |
| this file | cameras |

## Verification

```
npm run build
node harness/playtest.mjs --view furn.smash --script harness/_furn-smash-critic.mjs --port 5421 --q "quality=medium"
```

Lip should recover vs r33 70.4%. Dust hue-split must not stay at 18%.
Espresso/terra should drop vs r32. Ceiling PASS.

If a stated fact is wrong, say so rather than diverging.
