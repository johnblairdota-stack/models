# Slice plan: plug the whole sphere inside the AABB (r36)

**Status:** CRITIQUED — r36 PASS, not WOWED. Khaki gone, lip 49.0→68.1 (r32 was 80.7%). Leftover: not 148s 100% `#4c3c2c`. Chaise not an air sphere.

**Bar:** `refs/teardown/yt-house-148s-sledge-hole.png`.
r35 critic **WEAK**. Same recipe as r32 but densest lip **80.7%→49.0%**,
khaki `#655a4d` through a sparse grid. r32 leftover was terra/espresso
in the 0.90 gaps, not khaki. The plug still skips cells with
`(cell−hit)·nrm > 0.04` — the **front** of the sphere, toward the
camera. Those empty opening cells are inside the fireplace AABB.
Skipping them is a hole you can see the studio floor through. Do not
pack scale 1.0. Do not dilate clip. Do not brighten dust. Do not
restore “any air in the carve sphere” (that was the chaise potato).

## Why

Inward-only plug fills the firebox *behind* the hit and leaves the
camera-facing opening empty. r35’s khaki is that opening. Filling
every empty sphere cell **inside `solidBox`** packs the island toward
the camera without planting cubes in studio air beside a chaise.

## Decisions

1. **Drop the inward-normal skip in the plug loop.** Keep
   already-carved skip, AABB skip, and sphere `plugR2` test. Delete
   `if (dx * nrm.x + dy * nrm.y + dz * nrm.z > 0.04) continue`.

2. Scale **0.90**, AABB `solidBox`, per-cell `_cellColor`, r32 dust
   (`bright: 0.55`, `brightVar: 0.18`) — unchanged. Geometry stays
   `g.cell * 0.98`.

## Presentation

Fireplace densest 80×80 is a packed umber island (lip toward r32’s
80.7%+, not khaki through a grid). Voxel grid not 104×113. Chaise
stays a seat-shaped bite, not a brown air sphere. Not cream. Well
must stay gone. Plates must not go light.

## Ownership

| May edit | Do not touch |
|---|---|
| `src/destruction/furn-voxels.js` (delete the `·nrm > 0.04` skip only) | `dust.js`, scale, `_cellColor`, dust args, `CELL` |
| this file | cameras |

## Verification

```
npm run build
node harness/playtest.mjs --view furn.smash --script harness/evidence/_furn-smash-critic.mjs --port 5425 --q "quality=medium"
```

Densest must not rank studio khaki. Lip toward 80%+. Chaise must not
grow an air sphere. Ceiling PASS.

If a stated fact is wrong, say so rather than diverging.
