# Slice plan: keep the Meshy GLB, mesh-fitted voxels, unsupported fall (r3)

**Status:** SUPERSEDED by `docs/slices/task-furn-smash-vox-thick.md` (r4).

**Bar:** `docs/design/teardown-reference.md` + `refs/teardown/wiki-sledge-door.png`.
The intact prop must still **read as the Meshy GLB**. A hit punches a **section-sized hole
through that painted mesh**. Disconnected remainder **falls** with debris physics and **stays**.

## Why this slice

r2 hid the GLB on first contact and drew brown instanced cubes. That swap is the jarring
defect. John wants destructible furniture that still looks like the files in
`public/models/furn/`, more cells per swing, voxels fitted to the mesh (not the padded
hit box), and unsupported pieces falling.

Cubes are the *volume representation*. They must not replace the albedo.

## What it looks like (the picture)

1. **At rest:** the Meshy chair/desk/etc. is on screen, textures and all. No voxel overlay.
2. **On a hit:** a ~0.9 m sphere of cells is carved. Those fragments **discard** in the
   original materials, so the hole is a hole *in the painted object*. Knocked cells pay
   cuboid debris tinted from the sampled texel.
3. **After the hit:** 6-connected flood from anchors. Anything not connected to the floor
   (or, for hanging props, to the top two layers) is an island: those cells discard on the
   GLB and spawn **free-fall** debris (`sag: 0`, no wall pendulum). A chair back with the
   seat cut away drops. A chandelier bowl with the chain cut drops. The standing remainder
   is still the Meshy mesh with a hole.
4. **Finer grid:** 0.08 m cells, max 24 per axis, so the hole edge is a staircase of
   centimetres, not 14 cm bricks, and one swing removes more of the object.

## Ownership

| May edit | Do not touch |
|---|---|
| `src/destruction/furn-voxels.js` | `src/views/game.js` |
| `src/destruction/debris.js` — optional `o.color` on `chunk()` only | wall `DamageField` |
| `src/game/furn-smash-lab.js` — mesh AABB + hang flag | chair circle |
| `src/views/furn-smash.js` — `perKind: 960` | |
| `harness/_furn-smash-critic.mjs` — after wait 1100 ms | |
| this file + `docs/slices/task-furn-smash-vox.md` pointer | |

## Decisions (numbers)

1. Cell **0.08 m**, max **24** per axis. Voxel bounds = `Box3.setFromObject(root)` expanded
   by **0.35 × cell**. Never use the padded `HIT_H` walk box as the grid.
2. Occupancy: raster every mesh triangle (barycentric step ≤ 0.35 cell), then **dilate 1**.
   If count **< 8**, fill the AABB (same fallback as r2). Store a per-cell RGB from
   `material.color * map(uv)` when a map exists.
3. **Do not hide the GLB. Do not spawn the brown InstancedMesh.** Clone each mesh material,
   inject a `sampler3D` occupancy clip: fragment discards when its world-space cell is 0.
   Clip texture starts at **255** (intact mesh). Only cells that were carved or dropped
   are written to 0. Outside the grid, do not discard.
4. Carve radius **0.58 m** (finer cells mean more per swing than r2 without swallowing the
   prop). Zero **every** grid cell in the sphere on the clip texture
   (clean hole even if occupancy missed a triangle). Logical occupancy only clears cells
   that were filled. Pay **one `debris.chunk` per 5** removed occupied cells, cap 16.
5. After each carve, flood 6-connected from anchors:
   - floor props: `iy === 0` or cell bottom ≤ `floorY + 1.25 × cell`
   - hanging (`liftY >= 1`: wall-cam, chandelier): `iy >= ny - 2`
   Unvisited occupied cells are islands: clear them, zero clip, spawn **free-fall** chunks
   (`normal: {x:0,y:1,z:0}`, `sag: 0`, `hold: 0.02`, `spread: 0.7`). Cap 18 island plates
   per hit. Tint from stored cell RGB.
6. Shatter when remaining occupied **< 8%** or **< 6** cells: drop the rest as islands,
   hide the GLB, drop collider.
7. `chunk()`: if `o.color` is `{r,g,b}`, use it instead of the random grey multiply.
   No other debris behaviour changes. Wall dig is unaffected.
8. Smash-lab debris `perKind: 960`, `keepRest: true`.
9. Lab `fp.box` copies the mesh AABB after voxelize (rugs keep min.y = 0, max.y ≥ 0.45)
   so aim/walk match the visible object.
10. Critic: after last blow wait **1100 ms** before the after shot so falls land.

## Verification

```
npm run build
node harness/playtest.mjs --view furn.smash --script harness/_furn-smash-critic.mjs --port 5344 --q "quality=medium"
```

Playcritique looks at `s-<id>-aim.png` (must still be the Meshy paint), `s-<id>-wound.png`
(hole in that paint, not a brown cube swap), `s-<id>-after.png` vs the wiki door still.
Ceiling is PASS. Do not self-award WOWED.

## Traps

- `npm run build`, never `npx vite build`.
- No backticks inside any `/* glsl */` template literal. Prefer quoted GLSL strings here.
- `onBeforeCompile` miss must **throw**, not silently draw the intact mesh after a carve.
- Do not smash with mouse in the critic.
- Do not run unsupported-drop at init — only after a carve.
- `sag: 0` + `normal.x/z === 0` is what makes furniture fall instead of pendulum into a wall.
