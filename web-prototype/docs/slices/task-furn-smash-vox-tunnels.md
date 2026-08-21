# Slice plan: close espresso tunnels a hair (r29)

**Status:** CRITIQUED — r29 PASS, not WOWED. Scale 0.94 did not shrink espresso (13.8→17.6; lip 73.9→73.3). Do not walk toward 1.0. Leftover #1: still not 148s 100% `#4c3c2c`.

**Bar:** `refs/teardown/yt-house-148s-sledge-hole.png`.
r28 critic **PASS**, not WOWED. Leftover #1: densest is umber-led
(lip **73.9%**, dust split **6.2%**) but not 148s’ **100%** `#4c3c2c`.
Ranked `#453224` luma 0.207 / `#4b3a2c` luma 0.238. Hue-split espresso
**13.8%** + terra **13.5%** still in the window. r24 scale **1.0** fused
a 104×113 espresso slab — do not repeat. Do not quiet dust. Do not go
cream. Plates must not go light.

## Why

Scale **0.90** leaves 10% tunnels. The camera still reads espresso
Meshy and terracotta in those gaps (hue-split 13.8/13.5). Scale 1.0
on the 0.98 box fused coplanar faces into one disc. **0.94** is the
step between: smaller tunnels, hairline still a voxel grid. Dust
stays at r28 brightness so the island does not re-split. Do not
touch `_cellColor`.

## Decisions

1. **`_rebuildCut` scale `(0.94, 0.94, 0.94)`.** Rotation `(0,0,0)`.
   Geometry stays `g.cell * 0.98`.

2. **Keep r28 dust.** Count `min(22, 8+…*0.1)`, `size: 0.2`,
   `life: 0.8`, `bright: 0.55`, `brightVar: 0.18`. Do not quiet.

3. Unlit umber `_cellColor`, inward plug, `CELL`, `_payGroup`,
   cameras — unchanged.

## Presentation

Fireplace densest 80×80 is one `#4c3c2c` umber island (lip toward
148s 100%), still a voxel grid not a 104×113 slab. Espresso/terra
gaps shrink. Not cream. Chaise / settee / table-round / crate plates
must not go light. Well must stay gone.

## Ownership

| May edit | Do not touch |
|---|---|
| `src/destruction/furn-voxels.js` (`_rebuildCut` scale only) | `dust.js`, `debris.js`, `_cellColor`, `applyHit` dust, `CELL` |
| this file | cameras |

## Verification

```
npm run build
node harness/playtest.mjs --view furn.smash --script harness/evidence/_furn-smash-critic.mjs --port 5411 --q "quality=medium"
```

Look at densest 80×80 hue-split. Espresso/terra should drop; lip
should rise. Largest face must not return to 104×113. Ceiling PASS.

If a stated fact is wrong, say so rather than diverging.
