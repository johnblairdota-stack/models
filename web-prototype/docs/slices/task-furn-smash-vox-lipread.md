# Slice plan: readable voxel lip, not a black punch (r17)

**Status:** CRITIQUED — PASS, not WOWED. Leftover #1: black well behind the lip.

**Bar:** `refs/teardown/yt-house-148s-sledge-hole.png`.
r16 critic PASS, not WOWED. #1: fireplace bite is a dead-black
rectangular punch (`#040303`, luma 0.014). 148s meat is the same
*hue* as the wall at luma ~0.21, with a countable stepped lip.

## Why

`bodyTint` is the darkest chromatic surface sample. On a black mantel
that is luma 0.014, so cut cubes are a punched void. They are also
inset `0.35 × cell`, which pulls the stair into a rectangular cavity
instead of a voxel lip.

148s: facing luma 0.249, meat 0.215. Same colour, faces still readable.

## Decisions

1. **Cut cubes only — `readableMeat(bodyTint)`.** If luma ≥ 0.16, use
   bodyTint as today. Else scale RGB so luma = **0.18** (148s is ~0.21;
   stay under cream). Do **not** `liftTint`. Do **not** change
   `_pickSkinColor` / flying plates.

2. **Inset 0.** Cut cubes sit on the occupancy grid (`cutS` stays
   `cell × 0.98`). Stepped lip, not a pulled-in rectangle.

3. Cut mat `roughness: 0.62` so faces take studio light. Keep
   `emissiveIntensity: 0.02`.

4. Plate payout, carve radius, cameras, `bodyTint` pick — unchanged.

## Presentation

Fireplace leave: a stepped same-hue lip you can count, not a black
rectangle. Desk bite stays espresso, a little more readable, not cream.
Chaise / settee / table-round / crate plates must not go light.

## Ownership

| May edit | Do not touch |
|---|---|
| `src/destruction/furn-voxels.js` (`_cellColor`, inset, cut roughness) | `debris.js`, `_payGroup`, `bodyTintFrom` |
| this file | carve radius, cameras |

## Verification

```
npm run build
node harness/playtest.mjs --view furn.smash --script harness/_furn-smash-critic.mjs --port 5387 --q "quality=medium"
```

Look at `s-fireplace-leave.png` vs 148s. Ceiling PASS.

If a stated fact is wrong, say so rather than diverging.
