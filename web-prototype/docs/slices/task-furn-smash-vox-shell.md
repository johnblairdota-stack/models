# Slice plan: hollow shells, inset interiors (r7)

**Status:** CRITIQUED — PASS (not WOWED). Smash-lab only.

**Bar:** crate should punch like plank walls (empty inside). Cameras must
not puff. Thick carcasses keep packed voxels **behind** the Meshy surface.

John: loves crate holes, but a crate is empty — do not fill it. Bigger
props still sprout cubes past the mesh. Tripod / wall-cam popcorn when
hit because they are thinner than a cell.

## Why

r6 packed occupancy and stopped re-flooding. That filled **every enclosed
void** (crate interior, glass, dilated 1-cell halo) and drew cubes on the
outer occ shell, then clipped those cells — so the Meshy vanished and a
brick blister sat outside the model. Thin props have no interior, so the
same cubes *are* the object, scaled up to the cell.

## Decisions

1. **Catalog `vox`:**
   - `off` — `cam-wall`, `cam-tripod`, and any `thin: true` (rug). Do not
     construct `FurnVoxelBody`. Existing stage smash + small cam FX.
   - `shell` — `crate`, `vitrine`, `hall-stand` (empty box / glass / frame).
     Voxelize **skin only**: no Y-span fill, no dilate, no interior flood,
     **no cut cubes**. Still clip the GLB and drop **timber planks**
     (`w 0.32, h 0.07, t 0.16`), not `furnchip`.
   - `solid` — everyone else.

2. **Solid occupancy:** `fillYSpan` + `fillInterior` only. **Do not
   `dilateSkin`.** Dilate is the halo that sits outside the Meshy.

3. **Cut cubes only on original interior cells** (`inner`: occ with all 6
   neighbours occ at voxelize time) that still have occ and 6-neighbour a
   carved cell. If `inner` count `< 8`, demote that prop to `shell` (auto
   thin: legs, frames, glass).

4. **Do not clip remaining occ.** r6 zeroed `clip` on the lip, which hid
   the Meshy and parked cubes on the outside. Clip stays the carve sphere
   only. Inset each cube **into the solid** (away from the carved
   neighbour) by `cell × 0.35`. Size stays **`cell × 0.98`**.

5. Colour sampling unchanged. Do not touch `game.js` / wall dig.

## Ownership

| May edit | Do not touch |
|---|---|
| `src/destruction/furn-voxels.js` | `game.js`, wall dig |
| `src/game/furn-catalog.js` | |
| `src/game/furn-smash-lab.js` | |
| this file | |

## Verification

```
npm run build
node harness/playtest.mjs --view furn.smash --script harness/_furn-smash-critic.mjs --port 5357 --q "quality=medium"
```

Look at `s-crate-wound.png` (hole in wood, empty inside, no voxel fill),
`s-cam-tripod-wound.png` (no popcorn puff), `s-desk-wound.png` /
`s-fireplace-wound.png` (packed cubes **inside** the remaining mesh).
Ceiling PASS.
