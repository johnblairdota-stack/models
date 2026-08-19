# Slice plan: revert smash voxels to r16 (r40)

**Status:** SUPERSEDED by r41 — John asked for r15. Cut meat is per-cell `liftTint` again, not bodyTint.

John: revert to r16. Colour loop (r17–r37) is parked. Play bar is
Teardown plates spilling onto the floor, not 148s hole colour.

## Why

r16 was the last PASS before we started filling the crater with cubes
(r19), shrinking cells (r20), plugging air (r21–r36), and painting
umber (r23–r38). Those made one hit a brown disc. r16 still has r15
lumpy plates + `bodyTint` meat, with cut cubes only **inside** remaining
solid (inset 0.35), not a sphere of fill in the hole.

## Decisions

Restore `furn-voxels.js` smash body to r16:

1. `CELL = 0.08`, `MAX_AXIS = 24`, cell floor `0.045`.
2. Cut geo `cell × 0.98`. `MeshStandardMaterial` emissive `0x111111` @
   `0.02`, roughness `0.78`. Not unlit basic.
3. `_cellColor` is `bodyTint` only. No per-cell RGB, no luma lift, no
   `#4c3c2c` stamp.
4. `_rebuildCut`: remaining `inner` occ that 6-neighbours a carved
   cell, inset `cell × 0.35` into the solid. Scale `(1,1,1)`.
5. Carve clips the whole sphere (r16), then removes occ/skin. No AABB
   air plug. No `solidBox` plumbing.
6. `_payGroup` / `furnChip` stay at r15 (lumpy plates). Do not edit
   `debris.js`.

## Presentation

One hit: a hole in the Meshy and plates tumbling to the floor. Not a
brown pancake. Fireplace bite may be a dark punch — that was r16’s
leftover and is accepted.

## Ownership

| May edit | Do not touch |
|---|---|
| `src/destruction/furn-voxels.js` | `debris.js`, `dust.js`, cameras |
| this file | |

## Verification

```
npm run build
```

John relaunches `FURNSMASH.bat`. Ceiling is play-read.

If a stated fact is wrong, say so rather than diverging.
