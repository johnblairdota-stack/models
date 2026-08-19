# Slice plan: revert the pack (r25)

**Status:** CRITIQUED — r25 WEAK. Scale 0.90 revert did not restore r23 umber in the densest window.

**Bar:** `refs/teardown/yt-house-148s-sledge-hole.png`.
r24 critic **WEAK**. Scale 1.0 fused the fireplace bite into one
espresso slab (`#2f180b` luma 0.11). Densest lip 43.3%→**4.8%**
(148s 100%). Largest face 113×124. r23 **PASS** had scale **0.90**,
unlit `#4d3a2b` luma 0.238 leading, voxel grid 25×70. Do not stack
another pack. Do not go cream. Plates must not go light.

## Why

Packed 0.98 boxes at scale 1.0 read as one dark disc, not umber
cubes. r23 already proved 0.90 shows the `#4c3c2c` family and a
voxel grid. The unpaid r23 leftover (umber/dust 30.5/30.5) is
still unpaid; this round only undoes the r24 regression.

## Decisions

1. **`_rebuildCut` scale `(0.90, 0.90, 0.90)` again.** Rotation
   `(0,0,0)`. Unlit umber `_cellColor` unchanged.

2. **Keep r24’s quiet dust.** Do not restore the 22-particle burst.

3. Inward plug, `CELL`, `_payGroup`, cameras — unchanged.

## Presentation

Fireplace densest meat is r23’s umber family again (`#4c3c2c` luma
~0.24), a voxel grid not a 113×124 espresso disc. Not cream. Chaise /
settee / table-round / crate plates must not go light. Well must
stay gone.

## Ownership

| May edit | Do not touch |
|---|---|
| `src/destruction/furn-voxels.js` (`_rebuildCut` scale only) | `debris.js`, `dust.js`, `_cellColor`, `applyHit` dust, `CELL` |
| this file | cameras |

## Verification

```
npm run build
node harness/playtest.mjs --view furn.smash --script harness/_furn-smash-critic.mjs --port 5403 --q "quality=medium"
```

Look at densest 80×80. Ranked hex should be `#4c3c2c` family, not
`#2f180b`. Ceiling PASS.

If a stated fact is wrong, say so rather than diverging.
