# Slice plan: Teardown voxel smash in `furn.smash` (r2)

**Status:** SUPERSEDED by `docs/slices/task-furn-smash-vox-fit.md` (r3: keep the GLB,
mesh-fitted grid, unsupported fall). Numbers below are the r2 baseline.

**r2 bar:** Coarse occupancy voxels on smash-lab props only. Copy Teardown
*section removal, large tumbling plates, persistent heap, remaining carcass* — cubes are
allowed here because John said voxels are fine if they are cheaper than CSG.

**Bar:** `docs/design/teardown-reference.md` + `refs/teardown/wiki-sledge-door.png`.
One hit removes a **section** (~0.45 m sphere of cells). The rest of the object **stays**.
Chunks are plank-sized, tumble, and **do not recycle** once at rest.

## Why not a full Teardown world

A voxel engine for the estate is out of scope. 24 Meshy GLBs already exist. Filling each
AABB from mesh vertices (dilate 1) and drawing remaining cells as instanced boxes is one
evening and gives the same *read* as the wiki still: a hole in a thing that is still there.

Do **not** voxelize `game.play` walls. Those keep `DamageField`.

## Ownership

| May edit | Do not touch |
|---|---|
| `src/destruction/furn-voxels.js` (**new**) | `src/views/game.js` |
| `src/destruction/furnprop.js` — one `this.voxels` branch in `applyHit` | wall `DamageField` |
| `src/game/furn-smash-lab.js` — attach voxels at register | chair circle |
| `src/views/furn-smash.js` — `perKind` / `keepRest` | |
| `src/destruction/debris.js` — `keepRest` refuse to steal pile | |
| `src/core/debug.js` — hide chrome on `furn.smash` | |
| `harness/evidence/_furn-smash-critic.mjs` — wound + after framing | |
| `docs/slices/task-furn-smash.md` / this file | |

## Decisions (numbers)

1. Cell size **0.14 m**, max **16** cells per axis (fireplace ~3.7 m still fits).
2. Occupancy: mark every mesh vertex into the grid, then **dilate 1**. If the grid is empty,
   fill the AABB so the prop is still smashable.
3. First hit: hide the GLB, show instanced boxes tinted from the mesh `material.color`
   (fallback wood `#6b4a32`).
4. Each hit carves a sphere of radius **0.72 m** around the contact point. Removed cells
   pay **one `debris.chunk` per 4 cells** (merged), kind `timber` or `slab` (urn/fireplace).
   Dust behind, few crumbs (`burst` scale **0.12**).
5. Remaining cells stay. Shatter only when occupancy **< 8%** of the original count (or
   `< 6` cells). Then drop the collider.
6. Smash-lab debris: `perKind: 480`, `keepRest: true` (never recycle a resting piece).
7. Critic: after first connect, wait 400 ms, shot `s-<id>-wound.png`. After last blow, step
   **back 1.3 m from the same yaw**, `cam._first = true`, wait **900 ms**, shot after.
   Do not teleport to `z=0`.

## Verification

```
npm run build
node harness/playtest.mjs --view furn.smash --script harness/evidence/_furn-smash-critic.mjs --port 5340 --q "quality=medium"
```

Playcritique looks at wound + after vs the wiki still. Ceiling is PASS. Do not self-award WOWED.

## Traps

- `npm run build`, never `npx vite build`.
- No `Math.random()` — use `debris.rng`.
- Do not smash with mouse in the critic.
- If vertex fill is empty, say so in the report and use the AABB fill fallback (already decided).
