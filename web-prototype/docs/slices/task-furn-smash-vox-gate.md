# Slice plan: umber gate catches fireplace wood (r26)

**Status:** CRITIQUED — r26 WEAK. Gate 0.08 changed nothing (densest lip 5.0% same as r25; still espresso `#30190b` luma 0.113).

**Bar:** `refs/teardown/yt-house-148s-sledge-hole.png`.
r25 critic **WEAK**. Scale 0.90 revert did not restore r23 umber.
Densest still espresso `#30190b` luma **0.113**, lip **5.0%** vs r23
**43.3%** vs 148s **100%**. Tight ranked fill `#2e170a` luma 0.105 —
below the r23 umber gate (`luma >= 0.11`). Last PASS is r23. r18 and
r24–r25 failed. Do not restore scale 1.0. Do not restore loud dust.
Do not go cream. Plates must not go light.

## Why

`_cellColor` only stamps `#4c3c2c` when chroma < 0.20 **and luma ≥
0.11**. Fireplace `bodyTint` ranks at luma **0.105**, so every cut
cube takes the espresso lift (`× 0.18/luma`) instead of 148s umber.
r24’s quiet dust then left that espresso as the densest meat. r23
PASS had umber cubes in the densest window; this round only opens
the gate so fireplace wood is umber. Dust stay quiet so we judge
cubes, not a particle overlay. Do not pack 1.0 (that fused a slab).

## Decisions

1. **Umber luma floor is 0.08.** `_cellColor`: if chroma < 0.20 and
   luma ≥ **0.08**, return `{ r: 76/255, g: 60/255, b: 44/255 }`
   (`#4c3c2c`). Else if luma < 0.16, scale to 0.18 as today. Velvet
   (chroma ≥ 0.20) and crate espresso (luma < 0.08) do not become
   umber. Do not multiply the umber (no ACES pre-boost).

2. **Keep `_rebuildCut` scale `(0.90, 0.90, 0.90)`.** Rotation
   `(0,0,0)`. Unlit `MeshBasicMaterial` unchanged.

3. **Keep r24’s quiet dust.** `Math.min(5, 2 + …)`, `life: 0.35`,
   `size: 0.08`. Do not restore the 22-particle burst.

4. Inward plug, `CELL`, `_payGroup`, cameras — unchanged.

## Presentation

Fireplace densest meat is the `#4c3c2c` umber family (luma ~0.24),
a voxel grid not an espresso disc. You can still read meat through
the volume (not a black well). Not cream. Chaise / settee /
table-round / crate plates must not go light. Well must stay gone.

## Ownership

| May edit | Do not touch |
|---|---|
| `src/destruction/furn-voxels.js` (`_cellColor` luma floor only) | `debris.js`, `dust.js`, `applyHit` dust, `_rebuildCut` scale, `CELL` |
| this file | cameras |

## Verification

```
npm run build
node harness/playtest.mjs --view furn.smash --script harness/_furn-smash-critic.mjs --port 5405 --q "quality=medium"
```

Look at densest 80×80. Ranked hex should be `#4c3c2c` family, not
`#2e170a`. Ceiling PASS.

If a stated fact is wrong, say so rather than diverging.
