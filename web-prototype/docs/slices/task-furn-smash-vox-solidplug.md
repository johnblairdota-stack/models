# Slice plan: meat is the object, not air (r30)

**Status:** CRITIQUED — r30 WEAK. Cell-solid plug emptied the firebox (lip 31.3%, khaki through grid). Chaise air-sphere died. Next: column plug.

**Bar:** `refs/teardown/yt-house-148s-sledge-hole.png`.
r29 critic **PASS**, not WOWED. Scale **0.94** grew espresso 13.8→17.6
and lip 73.9→73.3. Do not walk to 1.0. Last better densest was **r28**
(scale **0.90**, lip 73.9%). John also showed the chaise: a ~0.58 m
brown sphere of cut cubes in empty air. 148s leftover: not 100%
`#4c3c2c`. Do not quiet dust. Do not go cream. Plates must not go light.

## Why

The inward plug marks every empty cell in the carve sphere. On a
chaise that is a brown potato in studio air. Fireplace firebox cells
are already `occ` from `fillYSpan` / `fillInterior` — they still get
meat. Cut colour is one `bodyTint` (darkest wood), so velvet becomes
umber. Per-cell `rgb` keeps rose on velvet and umber on wood. Scale
reverts to r28’s 0.90. Dust stays r28.

## Decisions

1. **`_rebuildCut` scale `(0.90, 0.90, 0.90)` again.** Rotation
   `(0,0,0)`. Geometry stays `g.cell * 0.98`.

2. **Inward plug only where the object was.** Constructor copies
   `this.solid = new Uint8Array(this.grid.occ)` after voxelize. Plug
   loop: if `!this.solid[i]` skip. Do not plant cubes in exterior air.

3. **`_cellColor(i)` uses that cell’s `g.rgb` when the texel is
   non-black** (`r+g+b > 0.04`), else `bodyTint`. Same umber gate:
   chroma < 0.20 and luma ≥ 0.08 → `#4c3c2c`. Velvet (chroma ≥ 0.20)
   keeps its tint. Crate espresso (luma < 0.08) still lifts to 0.18.

4. **Keep r28 dust** (`min(22,…)`, `size: 0.2`, `bright: 0.55`,
   `brightVar: 0.18`).

## Presentation

Fireplace densest 80×80 stays an umber island (lip at least r28’s
73.9%, not an espresso disc). Voxel grid, not 104×113. Chaise bite
is the chaise, not a brown air sphere. Not cream. Well must stay
gone. Chaise / settee / table-round / crate plates must not go light.

## Ownership

| May edit | Do not touch |
|---|---|
| `src/destruction/furn-voxels.js` (scale, `this.solid`, plug skip, `_cellColor` source tint) | `dust.js`, `debris.js`, `CELL`, dust args |
| this file | cameras |

## Verification

```
npm run build
node harness/playtest.mjs --view furn.smash --script harness/evidence/_furn-smash-critic.mjs --port 5413 --q "quality=medium"
```

Fireplace densest: `#4c3c2c` family, espresso must not grow vs r28.
Chaise leave: no 0.58 m brown sphere in air. Ceiling PASS.

If a stated fact is wrong, say so rather than diverging.
