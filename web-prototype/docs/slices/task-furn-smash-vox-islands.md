# Slice plan: Teardown-sized islands in flight (r10)

**Status:** CRITIQUED — WEAK. Leave is not 2–6 plates in flight (table still intact; pieces already on the floor); popcorn cubes are gone.

**Bar:** `refs/teardown/yt-house-240s-chunks-tumble.png`,
`yt-house-145s-table-island.png`, `yt-ign-52s-plank-tumble.png`,
`yt-ign-65s-hole-heap.png`. YouTube motion, not the wiki still.

r9 critic (WEAK): leave frames are a spray of same-size cubes. Teardown
throws 2–6 readable islands that tumble and heap.

## Why

`_dropUnsupported` lists **every unanchored skin cell as its own island**
(table-round paid 695). `_pay` then groups **5 cells** into a chip of
`cell × 1.5 / 1.1 / 0.7` (~12 cm) and `chunk()` floors w/h at 0.12 m, so
every piece is the same popcorn cube. Fireplace lucked into one big slab;
that is the look to copy, not the exception.

## Decisions

1. **Flood unanchored skin into 6-connected components.** One component
   = one falling piece (or two if it is huge). Zero skin/occ/clip on the
   whole component, same as today, just not cell-by-cell payout.

2. **Piece size is the component AABB**, not `cell × 1.5`.
   Sort the three extents descending → `w, h, t`.
   `t = max(0.055, smallest)`. Pass those metres into existing
   `debris.chunk('furnchip' | 'timber', …)`. Do not edit `debris.js`.

3. **Carve payout is 2–5 slabs, not 16 cubes.** Partition removed cells
   into `k = clamp(round(n / 22), 2, 5)` groups (sort by x then z, equal
   slices). Each group is one AABB plate. If `n < 8`, one plate.

4. **Split a piece only when longest AABB > 0.72 m** — cut that axis in
   half, two plates. Cap **8** airborne pieces per hit (carve + islands
   combined). Merge leftover cells into the largest group.

5. **Do not `debris.burst` extra furnchip crumbs** on a voxel hit. Dust
   burst stays. Shell mode still pays timber planks from its components
   (AABB, not the old 0.32×0.07×0.16 unless the AABB is smaller — then
   keep those plank numbers as a floor).

6. **Shatter rest** uses the same component flood, not `_pay(..., cap: 14)`.

7. Cut cubes in the wound, clip, carve radius, catalog `vox` modes,
   cameras — **unchanged**. Do not shrink cut cubes. Do not touch
   `game.js` / wall dig.

## Presentation

Leave shot (~160 ms): **2–6 distinct tumbling plates**, mixed sizes, you
can follow one. Heap: plates at angles, not a grid of identical bricks.
Colour still the sampled Meshy average per group.

## Ownership

| May edit | Do not touch |
|---|---|
| `src/destruction/furn-voxels.js` | `game.js`, `debris.js`, wall dig |
| this file | catalog / cameras / cut-cube size |

## Verification

```
npm run build
node harness/playtest.mjs --view furn.smash --script harness/evidence/_furn-smash-critic.mjs --port 5373 --q "quality=medium"
```

Look at `s-table-round-leave.png`, `s-settee-leave.png`,
`s-fireplace-leave.png`, `s-crate-leave.png` vs the four bar clips.
Ceiling **PASS**. Builder does not self-award WOWED.

If a stated fact is wrong, say so in the report rather than diverging.
