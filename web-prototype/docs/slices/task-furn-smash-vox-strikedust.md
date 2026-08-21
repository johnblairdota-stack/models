# Slice plan: restore r23 strike dust (r27)

**Status:** CRITIQUED — r27 PASS, not WOWED. Leftover #1: densest still umber/dust split (31.3/31.7), not 148s 100% lip island.

**Bar:** `refs/teardown/yt-house-148s-sledge-hole.png`.
r26 critic **WEAK**. Umber luma floor 0.08 changed **nothing**
(densest lip **5.0%** same as r25; espresso `#30190b` luma 0.113).
Last PASS is **r23**: unlit umber, scale **0.90**, loud dust
(`size: 0.2`, up to 22 particles, densest lip **43.3%**, `#4d3a2b`
luma 0.238). r24 quieted dust and packed 1.0. r25–r26 kept the quiet
burst. Do not restore scale 1.0. Do not go cream. Plates must not go
light.

## Why

r24–r26 densest windows sit on espresso Meshy in the 0.90 gaps. r23
had the same scale and unlit cubes, but the louder strike dust sat
on the crater at luma ~0.30 and the densest 80×80 ranked umber. The
gate was a no-op. This round only puts the r23 dust args back. Do
not pack. Do not touch `_cellColor`.

## Decisions

1. **`applyHit` dust is the r23 burst.** Count
   `Math.min(22, 8 + Math.floor((removed.length + islands.length) * 0.1))`,
   `{ speed: 2.0, life: 0.8, size: 0.2, rise: 0.65 }`. Do not edit
   `dust.js`.

2. **Keep `_rebuildCut` scale `(0.90, 0.90, 0.90)`.** Rotation
   `(0,0,0)`. Unlit `MeshBasicMaterial` and `_cellColor` unchanged.

3. Inward plug, `CELL`, `_payGroup`, cameras — unchanged.

## Presentation

Fireplace densest meat is the `#4c3c2c` umber family (luma ~0.24),
a voxel grid not an espresso disc. You can still read meat through
the volume (not a black well). Not cream. Chaise / settee /
table-round / crate plates must not go light. Well must stay gone.

## Ownership

| May edit | Do not touch |
|---|---|
| `src/destruction/furn-voxels.js` (`applyHit` dust args only) | `debris.js`, `dust.js`, `_cellColor`, `_rebuildCut` scale, `CELL` |
| this file | cameras |

## Verification

```
npm run build
node harness/playtest.mjs --view furn.smash --script harness/evidence/_furn-smash-critic.mjs --port 5407 --q "quality=medium"
```

Look at densest 80×80. Ranked hex should be `#4c3c2c` family, not
`#2e170a`. Ceiling PASS.

If a stated fact is wrong, say so rather than diverging.
