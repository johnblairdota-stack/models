# Slice plan: meat plug in the carved volume (r19)

**Status:** CRITIQUED — r19 PASS, not WOWED. Leftover #1: chip grain.

**Bar:** `refs/teardown/yt-house-148s-sledge-hole.png`.
r18 critic **WEAK**. The 0.24 m depth cap made leftover #1 worse (punch
22%→37% in the densest hole window). Do not stack another clamp.

## Why

A mantel thinner than `carveR` is a tunnel: clip and occ go to zero all
the way through, so the Meshy hole shows studio black. Cut cubes sat on
*remaining* occ (inside the solid), so the empty crater stayed a well.
r18 tried to keep a back wall by shrinking the sphere. That left a
smaller, denser well. The missing geometry is in the **carved** cells.

## Decisions

1. **Revert the depth cap.** `applyHit` uses `const rCarve = this.carveR;`
   again (both the main sphere and the fallback). Do not introduce a new
   metre clamp.

2. **Cut cubes on carved cells**, not remaining occ. `_rebuildCut` loops
   `this.carved[i]` and instances a cube at that cell centre. Colour is
   still `_cellColor(i)` (readableMeat). Inset stays 0. Drop the remaining-
   occ + neighbour-walk gate — the plug *is* the crater walls you read.

3. Plate payout, `bodyTint`, cameras — unchanged.

## Presentation

Fireplace leave: looking into the bite you read same-hue cube faces
through the volume, not a lip then a black well. Not cream. Desk the
same idea. Plates must not go light.

## Ownership

| May edit | Do not touch |
|---|---|
| `src/destruction/furn-voxels.js` (`applyHit` rCarve, `_rebuildCut`) | `debris.js`, `_payGroup`, `bodyTintFrom` |
| this file | cameras |

## Verification

```
npm run build
node harness/playtest.mjs --view furn.smash --script harness/evidence/_furn-smash-critic.mjs --port 5391 --q "quality=medium"
```

Look at `s-fireplace-leave.png` vs 148s. Ceiling PASS.

If a stated fact is wrong, say so rather than diverging.
