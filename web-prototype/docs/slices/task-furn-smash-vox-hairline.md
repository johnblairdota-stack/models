# Slice plan: close the 0.98 hairline (r37)

**Status:** CRITIC FILED — PASS, not WOWED. Lip 68.1→71.3; espresso/terra did not shrink.

**Bar:** `refs/teardown/yt-house-148s-sledge-hole.png`.
r36 critic **PASS**, not WOWED. Full AABB sphere plug killed khaki
(lip 49.0→**68.1%**). Leftover #1: not 148s **100%** `#4c3c2c`. Ranked
`#453324` luma 0.210. Hue-split espresso/terra **12.7/12.8**. r32 lip
was **80.7%** with the inward skip — do not put that skip back (r35
khaki). Do not instance-scale 1.0 (r24 slab). Do not dilate clip.
Do not brighten dust. Chaise must stay a seat-shaped bite.

## Why

Cut boxes are `g.cell * 0.98` then instance scale **0.90**, so tunnels
are ~12% of a cell. Espresso/terra in the densest window is Meshy in
those tunnels. Growing the box to `g.cell * 1.0` keeps the 0.90 grid
and only closes the authored hairline. Not a pack.

## Decisions

1. **Cut geometry `g.cell * 1.0`.** `_rebuildCut` scale stays
   `(0.90, 0.90, 0.90)`. Rotation `(0,0,0)`.

2. Full AABB sphere plug, per-cell `_cellColor`, r32 dust — unchanged.

## Presentation

Fireplace densest lip toward r32’s 80.7% and 148s 100%, espresso/terra
shrink vs r36. Voxel grid not 104×113. Chaise seat-shaped, not a brown
air sphere. Not cream. Well must stay gone. Plates must not go light.

## Ownership

| May edit | Do not touch |
|---|---|
| `src/destruction/furn-voxels.js` (`cutS` only) | `dust.js`, plug, scale, `_cellColor`, dust args |
| this file | cameras |

## Verification

```
npm run build
node harness/playtest.mjs --view furn.smash --script harness/evidence/_furn-smash-critic.mjs --port 5427 --q "quality=medium"
```

Espresso/terra should drop vs r36 12.7/12.8. Largest face must not
return to 104×113. Ceiling PASS.

If a stated fact is wrong, say so rather than diverging.
