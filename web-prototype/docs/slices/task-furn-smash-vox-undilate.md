# Slice plan: revert clip dilate (r35)

**Status:** CRITIQUED — r35 WEAK. Revert did not restore r32 packing (lip 80.7→49.0, khaki through grid). Live code is still AABB plug + scale 0.90 + per-cell tint.

**Bar:** `refs/teardown/yt-house-148s-sledge-hole.png`.
r34 critic **WEAK**. Clip dilate darkened the island: lip 70.4→**60.4%**,
ranked `#341e11` luma 0.133, espresso 7.3→**30.0%**. Punch stayed gone.
Dust 18→7 held. Last good packed island is **r32** (lip 80.7%). Delete
`_dilateClip`. Do not pack 1.0. Do not brighten dust. Keep AABB plug,
scale 0.90, per-cell tint, r32 dust.

## Decisions

1. **Remove `_dilateClip` and its `applyHit` call.** Clip stays
   per-carved-cell as r32.

2. Everything else unchanged from r32.

## Presentation

Fireplace densest recovers toward r32: packed umber, lip ~80%, not
espresso/terra majority. Chaise seat-shaped. Not cream. Well gone.
Plates not light.

## Ownership

| May edit | Do not touch |
|---|---|
| `src/destruction/furn-voxels.js` (delete dilate only) | `dust.js`, plug, scale, `_cellColor`, dust args |
| this file | cameras |

## Verification

```
npm run build
node harness/playtest.mjs --view furn.smash --script harness/evidence/_furn-smash-critic.mjs --port 5423 --q "quality=medium"
```

Lip should recover toward 80.7%. Ceiling PASS.

If a stated fact is wrong, say so rather than diverging.
