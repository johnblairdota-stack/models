# Slice plan: umber-bright strike dust (r28)

**Status:** CRITIQUED — r28 PASS, not WOWED. Dust split 31.7→6.2, lip 44.5→73.9. Leftover #1: densest still not 148s 100% `#4c3c2c` (ranked `#453224` luma 0.207 + terra/espresso).

**Bar:** `refs/teardown/yt-house-148s-sledge-hole.png`.
r27 critic **PASS**, not WOWED. Leftover #1: densest is still an
**umber/dust split 31.3/31.7**, lip **44.5%** vs 148s **100%**. Ranked
`#4d3a2b` luma 0.238 (148s family) then dust `#5c4b3c` luma **0.304**.
r24 packed 1.0 and quieted dust → espresso WEAK. Do not pack. Do not
quiet count/size. Do not go cream. Plates must not go light.

## Why

r27 densest 80×80 is umber cubes plus lit strike-dust tops. Dust
`bright` is `0.62 + rng*0.62` (up to 1.24), so those puffs land in
the critic’s dust bin (luma 0.28–0.36) and split the island. 148s
densest is **100% one umber**. Lower smash-lab puff brightness so
the same particles display in the umber bin (0.20–0.28). Keep the
r27 count and size so espresso gaps stay covered. Do not edit
`_cellColor`. Do not restore scale 1.0.

## Decisions

1. **`Dust.burst` reads `o.bright` / `o.brightVar`.** Default stays
   `0.62` / `0.62` (byte-identical when omitted). Only the assignment
   line in `burst()`; do not touch `roll()`, `uLit`, or the shader.

2. **Smash `applyHit` dust keeps r27 count/size/life**
   (`min(22, 8+…*0.1)`, `speed: 2.0`, `life: 0.8`, `size: 0.2`,
   `rise: 0.65`) and adds **`bright: 0.55`, `brightVar: 0.18`**
   (puffs 0.55–0.73, not 0.62–1.24).

3. **Keep `_rebuildCut` scale `(0.90, 0.90, 0.90)`.** Rotation
   `(0,0,0)`. Unlit umber `_cellColor` unchanged.

4. Inward plug, `CELL`, `_payGroup`, cameras — unchanged.

## Presentation

Fireplace densest 80×80 is one umber island through the volume
(lip-band, not umber/dust split). Faces still a voxel grid. Not
cream (watch the 0.35 cream bin — r27 densest cream was 8.6% lit
dust tops). Chaise / settee / table-round / crate plates must not
go light. Well must stay gone.

## Ownership

| May edit | Do not touch |
|---|---|
| `src/destruction/dust.js` (`burst` bright assignment only) | `roll()`, shader, `uLit` |
| `src/destruction/furn-voxels.js` (`applyHit` dust args only) | `_cellColor`, `_rebuildCut` scale, `CELL`, `debris.js` |
| this file | cameras |

## Verification

```
npm run build
node harness/playtest.mjs --view furn.smash --script harness/_furn-smash-critic.mjs --port 5409 --q "quality=medium"
```

Look at densest 80×80 hue-split. Dust bin must not tie umber. Ranked
hex stays `#4c3c2c` family. Ceiling PASS.

If a stated fact is wrong, say so rather than diverging.
