# Slice plan: thick cut, Meshy chips, obvious island drop (r4)

**Status:** SUPERSEDED by `docs/slices/task-furn-smash-vox-lip.md` (r5 lip fix).

**Bar:** `docs/design/teardown-reference.md` + `refs/teardown/wiki-sledge-door.png`.
r3 closed the brown-box swap. Remaining hates: hollow cookie-cutter, tan timber
rubble, no frame of a disconnected piece falling.

## Why

The wiki door is **thick**. You see stepped cubic interior, not the back of a
hollow shell. Debris is the same colour as the door. A severed piece drops.

## What it looks like

1. **Wound:** the Meshy paint remains. The hole has a **voxel lip** — cubes the
   colour of the sampled texel, one cell thick, so you do not see through to the
   far side of a settee.
2. **Payout:** flying plates are **the prop's colour** (black fireplace → dark
   chips, green desk leather → green chips), not tan timber.
3. **Island:** a chair back / tabletop whose only path to the floor was the
   carved seat **falls** as free-fall chips. The standing remainder stays painted.

## Ownership

| May edit | Do not touch |
|---|---|
| `src/destruction/furn-voxels.js` | `src/views/game.js` |
| `src/destruction/debris.js` — add `furnchip` kind only | wall `DamageField` |
| `src/views/furn-smash.js` — `perKind` if needed | chair circle |
| `harness/evidence/_furn-smash-critic.mjs` — log `islands` | |
| this file | |

## Decisions (numbers)

1. Keep cell **0.08 m**, max **24**, GLB clip, carve **0.58 m** on large props.
   Carve radius on a prop is `clamp(0.32 × span, 0.28, 0.58)` so a chair keeps a
   carcass (r3 first chair blow ate 836 cells).
2. Voxelize returns **skin** (undilated triangle raster) and **occ** (dilate 1,
   then **outside-flood invert fill**). Interior empty cells not reachable from
   the grid boundary become occupied. RGB for filled cells copies the nearest
   skin texel. Between-the-legs air stays empty (open to the boundary).
3. After every carve+island, rebuild occ from remaining skin (dilate + fill) and
   write clip from occ. Do not keep a dilation-bridge that would glue a severed
   back back on.
4. **Cut cubes:** InstancedMesh of remaining occ cells that have a 6-neighbor
   marked **carved** (not merely exterior-empty). Tint from cell RGB. Hidden
   until the first carve. Cube size `cell × 0.96`. This is the hole's thickness.
   Do not draw cubes on the intact exterior.
5. Island flood runs on **skin**, not dilated occ. Anchors unchanged (floor /
   hang top). Dropped skin cells pay free-fall `furnchip`. Then rebuild occ.
6. New debris kind `furnchip`: white-vertex box (no tan `paint()`), same physics
   as timber (`vTerm` 16, `keepRest` via smash-lab). `pool: 2.0`. Furniture
   `chunk()` / island pay **only** `furnchip`, never timber/slab. `o.color` is
   the cell RGB. `_cellColor` must **not** use `|| 140` — that turned black
   fireplaces tan.
7. Shatter threshold unchanged (`< 8%` or `< 6` skin cells).
8. Critic: include `islands` on each blow in the report. After wait stays 1100 ms.

## Verification

```
npm run build
node harness/playtest.mjs --view furn.smash --script harness/evidence/_furn-smash-critic.mjs --port 5348 --q "quality=medium"
```

Playcritique looks at settee/fireplace **wound** (must not see through a hollow
shell; debris must match the paint) and chair/table-round **after** (a severed
piece on the floor, not only a hole). Ceiling PASS. Do not self-award WOWED.

## Traps

- `npm run build`, never `npx vite build`.
- No backticks in `/* glsl */` strings.
- `furnchip` is added to `DEBRIS_KINDS`; game.play gets an unused pool. Do not
  change timber/slab payout on walls.
- Do not smash with mouse in the critic.
- Do not show cut cubes before the first carve.
