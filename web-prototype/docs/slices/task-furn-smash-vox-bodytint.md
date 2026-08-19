# Slice plan: plate colour is the prop body (r14)

**Status:** CRITIQUED — r14 WEAK. Body tint paid (chaise/settee/fireplace/desk/table-round YES); leftover heaps ignored. #1 AABB slabs, not a Teardown island.

**Bar:** `refs/teardown/yt-house-240s-chunks-tumble.png`,
`yt-house-148s-sledge-hole.png`, `yt-ign-52s-plank-tumble.png`,
`yt-house-145s-table-island.png`.
r13 critic WEAK #1: chaise dusty-rose `#9d6868` off velvet `#360b0f`.
Settee olive-khaki, fireplace tan. Table-round colour paid — do not
regress it.

## Why

r13 sampled the **carved group**. A seat/mantel bite is mostly
`inner` fill, so the pool is empty (or only mid-luma bake texels) and
the plate falls back to **lifted** `avgTint` — dusty rose / tan, not
the facing. Highlight-wash `luma > 0.58` never saw `#9d6868` (luma
0.45). Teardown chunks wear the object, not the texels in the hole.

## Decisions

1. **At voxelize, store `g.bodyTint`.** From original surface cells
   (`skin && !inner`), same wash drop as r13 (`luma > 0.58 && chroma
   < 0.28`), pick the **darkest chromatic** sample. No `liftTint`.
   If the pool is empty, unlifted skin mean (`tr/tn`, not `avgTint`).

2. **`_pickSkinColor` returns `g.bodyTint`.** Do not sample the carved
   group. Every plate from that prop wears the same body colour.

3. `avgTint`, `_cellColor`, hold, AABB, carve, cameras, `furnchip`
   env — unchanged.

## Presentation

Chaise leave plates read as black-red velvet, not dusty rose. Settee
plates read as dark frame (or gilt), not olive-khaki. Fireplace plates
read as the black mantel, not tan fill. Table-round stay mahogany.
Crate stay dark brown.

## Ownership

| May edit | Do not touch |
|---|---|
| `src/destruction/furn-voxels.js` (`voxelize` + `_pickSkinColor`) | `debris.js`, `game.js`, wall dig |
| this file | hold / AABB / carve / cameras / `_cellColor` |

## Verification

```
npm run build
node harness/playtest.mjs --view furn.smash --script harness/_furn-smash-critic.mjs --port 5381 --q "quality=medium"
```

Look at `s-chaise-leave.png`, `s-settee-leave.png`, `s-fireplace-leave.png`,
`s-desk-leave.png`, `s-table-round-leave.png`, `s-table-round-after.png`
vs the bar. Ceiling PASS.

If a stated fact is wrong, say so rather than diverging.
