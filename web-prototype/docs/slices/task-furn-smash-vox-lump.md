# Slice plan: lumpy islands, not AABB tiles (r15)

**Status:** SUPERSEDED — John asked for r14 after trying r15. Carve flood / stepped chip / unclamp / early tumble are off.

**Bar:** `refs/teardown/yt-ign-52s-plank-tumble.png`,
`yt-house-145s-table-island.png`, `yt-house-240s-chunks-tumble.png`,
`yt-house-148s-sledge-hole.png`.
r14 critic WEAK #1: colour paid; leave is still packing-foam AABB slabs
in a rectangular bite. Teardown is a plank, a table island, or a lumpy
cluster.

## Why

Three stacked rectangle factories:

1. `clusterCarve` x-sorts the bite into 2–5 equal slices — identical
   tiles.
2. r11 clamped every plate to `w∈[0.22,0.58] h∈[0.16,0.42] t≤0.11` —
   same foam brick.
3. `furnChip()` is a box. Stretching a box is still a box.
4. Carve `hold: 0.20` means the 160 ms leave frame has not started to
   tumble, so they sit axis-aligned in the hole.

Unsupported payout already flood-fills. Carve does not.

## Decisions

1. **`furnChip()` is a 6-connected stepped cluster**, not a box. Five to
   seven small boxes whose combined AABB stays **0.16 × 0.12 × 0.10**
   (so existing `wPass` scale math is unchanged). White vertex colours.
   Do not change timber/slab/plaster geos.

2. **Carve payout is 6-connected flood of `removed`**, same neighbour
   walk as unsupported islands. Delete `clusterCarve`. Then `splitHuge`
   as today. `MAX_AIR` 8 still caps.

3. **Plate size is the component AABB**, not the r11 clamp.
   `w = clamp(plate.w, 0.18, 0.95)`, `h = clamp(plate.h, 0.14, 0.70)`,
   `t = clamp(plate.t, 0.06, 0.22)`. Keep furnchip `0.22/0.16` scale
   compensation. Shell timber: plank floors as today, then those clamps.

4. **Leave must show tumble.** Carve `hold: 0.05`, freeFall `hold: 0.08`,
   `spinScale: 1.85`. Keep the floor spawn `py` line. Colour
   (`bodyTint`), carve radius, cameras, cut cubes — unchanged.

5. Do not retune table-round into a full-object island this round
   (r14 nit #2). If the first bite is bigger because flood+unclamp, that
   is allowed, not required.

## Presentation

Leave: 2–6 **irregular** pieces in the air, mixed sizes, already
rotating. A long component reads as a plank. A compact one reads as a
lumpy cluster, not a packing-foam rectangle. Body tint must not go cream
/ rose / khaki.

## Ownership

| May edit | Do not touch |
|---|---|
| `src/destruction/debris.js` (`furnChip` only) | wall slab/timber geos, `game.js` |
| `src/destruction/furn-voxels.js` (carve flood, `_payGroup` size/hold) | cameras, carve radius, `bodyTint` |
| this file | |

## Verification

```
npm run build
node harness/playtest.mjs --view furn.smash --script harness/_furn-smash-critic.mjs --port 5383 --q "quality=medium"
```

Look at `s-chaise-leave.png`, `s-settee-leave.png`, `s-desk-leave.png`,
`s-table-round-leave.png`, `s-fireplace-leave.png`, `s-crate-leave.png`
vs the bar. Ceiling PASS.

If a stated fact is wrong, say so rather than diverging.
