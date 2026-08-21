# Slice plan: plug silhouette columns, not air (r31)

**Status:** CRITIQUED — r31 WEAK. Column plug lip 31.3→44.2, still khaki through grid. Next: AABB plug.

**Bar:** `refs/teardown/yt-house-148s-sledge-hole.png`.
r30 critic **WEAK**. Plug-only-if-`solid[i]` emptied the fireplace
opening: densest lip **73.3%→31.3%**, khaki `#5c554a` luma 0.336
through a sparse grid. Chaise brown air-sphere **did** die (seat-shaped
velvet `#4b1115`). Keep per-cell tint and scale **0.90**. Do not restore
the old “any empty cell in the sphere” plug. Do not pack 1.0. Do not
quiet dust. Do not go cream.

## Why

Fireplace firebox cells are empty (`occ=0`) in the same XZ columns as
the surround. The old sphere plug filled them (packed umber). r30
required `solid[i]`, so those opening cells got no cubes and the camera
read the studio floor. Chaise exterior air sits in XZ columns with
**no** occupancy — skip those. Discriminator: plug empty cells only if
that XZ column had any solid at voxelize.

## Decisions

1. **Keep `_rebuildCut` scale `(0.90, 0.90, 0.90)`** and per-cell
   `_cellColor`. Keep r28 dust.

2. **Plug if the XZ column was solid, not if this cell was.** After
   copying `this.solid`, build `this.colSolid` (`Uint8Array(nx*nz)`):
   for each (ix,iz), 1 if any iy has `solid`. Plug loop: skip when
   `!this.colSolid[ix + iz * g.nx]`. Remove the `!this.solid[i]` skip.

3. Inward normal test, `CELL`, `_payGroup`, cameras — unchanged.

## Presentation

Fireplace densest 80×80 is a packed umber island again (lip back
toward r28’s 73.9%, `#4c3c2c` family, not khaki through a grid).
Voxel grid not 104×113. Chaise stays a seat-shaped bite, not a brown
air sphere. Not cream. Well must stay gone. Plates must not go light.

## Ownership

| May edit | Do not touch |
|---|---|
| `src/destruction/furn-voxels.js` (colSolid + plug predicate only) | `dust.js`, `debris.js`, `_cellColor`, scale, dust args |
| this file | cameras |

## Verification

```
npm run build
node harness/playtest.mjs --view furn.smash --script harness/evidence/_furn-smash-critic.mjs --port 5415 --q "quality=medium"
```

Fireplace densest lip should recover vs r30 31.3%. Chaise must not
grow a brown air sphere. Ceiling PASS.

If a stated fact is wrong, say so rather than diverging.
