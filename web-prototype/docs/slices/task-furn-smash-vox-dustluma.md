# Slice plan: dust luma into 148s umber (r33)

**Status:** CRITIQUED — r33 PASS, not WOWED. Hex `#4d3a2c` 0.240 but lip 80.7→70.4, dust 6.6→18.2. Revert bright.

**Bar:** `refs/teardown/yt-house-148s-sledge-hole.png`.
r32 critic **PASS**, not WOWED. Best densest yet: lip **80.7%** (r28
73.9%, 148s **100%**), packed umber not khaki. Ranked `#453224` luma
**0.208** then `#4b3a2c` 0.238. Hue-split umber/dust/espresso/terra
**49.6 / 6.6 / 8.4 / 13.4**. Chaise air-sphere stayed gone. r28 dust
`bright: 0.55, brightVar: 0.18` lands those puffs at 0.208 — the low
end of umber, so they outrank `#4c3c2c`. Raise smash puff brightness
so densest hex is the 0.24 family without returning to the dust bin
(0.28–0.36). Do not pack 1.0. Do not quiet count/size. Do not undo
AABB plug.

## Why

Cubes already display `#4b3a2c` luma 0.238. Dimmed dust ranks first at
0.208 and splits the island. 148s densest is **100% `#4c3c2c` luma
0.245**. Same particle count covering espresso gaps; only `bright` /
`brightVar` change.

## Decisions

1. **`applyHit` dust:** keep `min(22, 8+…*0.1)`, `speed: 2.0`,
   `life: 0.8`, `size: 0.2`, `rise: 0.65`. Set **`bright: 0.68`,
   `brightVar: 0.16`** (puffs 0.68–0.84). Do not edit `dust.js`.

2. Scale 0.90, AABB plug, per-cell `_cellColor` — unchanged.

## Presentation

Fireplace densest 80×80 ranks `#4c3c2c` family luma ~0.24 (not 0.208
dark umber, not dust 0.30). Lip holds ≥80%. Voxel grid. Chaise stays
seat-shaped, not a brown air sphere. Not cream. Well must stay gone.
Plates must not go light.

## Ownership

| May edit | Do not touch |
|---|---|
| `src/destruction/furn-voxels.js` (`applyHit` bright/brightVar only) | `dust.js`, plug, scale, `_cellColor`, `CELL` |
| this file | cameras |

## Verification

```
npm run build
node harness/playtest.mjs --view furn.smash --script harness/_furn-smash-critic.mjs --port 5419 --q "quality=medium"
```

Densest ranked hex should be `#4c3c2c` / `#4b3a2c` luma ~0.24. Dust
hue-split must not jump back to ~30%. Ceiling PASS.

If a stated fact is wrong, say so rather than diverging.
