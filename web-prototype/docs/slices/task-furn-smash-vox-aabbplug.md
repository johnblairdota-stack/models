# Slice plan: plug inside the solid AABB (r32)

**Status:** CRITIQUED — r32 PASS, not WOWED. Lip 80.7%, chaise sphere gone. Leftover: not 148s 100% `#4c3c2c` (ranked `#453224` 0.208 + terra/espresso).

**Bar:** `refs/teardown/yt-house-148s-sledge-hole.png`.
r31 critic **WEAK**. Column plug only recovered lip 31.3→**44.2%**
(r28 **73.9%**). Densest still khaki `#5c554b` luma 0.336 through a
sparse grid. Chaise air-sphere stayed gone. r30 cell-solid plug
emptied the firebox; r28’s sphere plug packed it. Discriminator:
fill empty sphere cells **only inside the AABB of occupied cells**.
Firebox is inside the mantel box; studio air beside a chaise is not.
Keep per-cell tint and scale 0.90. Do not pack 1.0. Do not quiet dust.

## Why

The fireplace opening is empty voxels *inside* the surround’s box.
The chaise potato was empty voxels *outside* the furniture box, in
the carve sphere. Column-has-solid missed opening cells whose XZ
does not share a filled Y. AABB of `solid` includes the firebox
volume and excludes hanging air.

## Decisions

1. **Drop `colSolid`.** Keep `this.solid`. After the copy, scan solid
   cells for index AABB `this.solidBox = { x0,y0,z0,x1,y1,z1 }`. If
   none, skip the plug loop.

2. **Plug predicate:** already-carved skip, then skip if `ix/iy/iz`
   is outside `solidBox`. No `solid[i]` test. No column test. Keep
   the inward normal `> 0.04` skip.

3. Scale 0.90, per-cell `_cellColor`, r28 dust — unchanged.

## Presentation

Fireplace densest is a packed umber island (lip toward r28 73.9%,
`#4c3c2c` family, not khaki through a grid). Voxel grid not 104×113.
Chaise stays a seat-shaped bite, not a brown air sphere. Not cream.
Well must stay gone. Plates must not go light.

## Ownership

| May edit | Do not touch |
|---|---|
| `src/destruction/furn-voxels.js` (solidBox + plug predicate; remove colSolid) | `dust.js`, `debris.js`, `_cellColor`, scale, dust args |
| this file | cameras |

## Verification

```
npm run build
node harness/playtest.mjs --view furn.smash --script harness/evidence/_furn-smash-critic.mjs --port 5417 --q "quality=medium"
```

Fireplace densest lip should recover toward 73.9%. Chaise must not
grow a brown air sphere. Ceiling PASS.

If a stated fact is wrong, say so rather than diverging.
