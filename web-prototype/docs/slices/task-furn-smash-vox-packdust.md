# Slice plan: pack the umber, quiet the dust (r24)

**Status:** CRITIQUED — r24 WEAK. Scale 1.0 fused an espresso slab. Revert toward r23’s 0.90; do not stack another pack.

**Bar:** `refs/teardown/yt-house-148s-sledge-hole.png`.
r23 critic **PASS**, not WOWED. Leftover #1: densest meat leads
`#4d3a2b` luma 0.238 (148s family) but is still an **umber/dust split
30.5%/30.5%**, lip 43.3% vs 148s **100%**. Scale 0.90 opened espresso
`#2e170a` luma 0.105 gaps (meat-window lip 64%→37%, dark 0.9%→27.6%).
Voxel grid YES (largest 25×70). Well did not return. Do not go cream.
Plates must not go light.

## Why

Unlit `#4c3c2c` landed in the densest ranks. Scale **0.90** then left
10% tunnels through the plug, so the camera reads espresso Meshy
between cubes and strike dust (`size: 0.2`, up to 22 particles) sits
on the crater at luma 0.30. 148s densest 80×80 is 100% one umber with
no gaps. Geometry is already `g.cell * 0.98`. Do not rotate. Do not
hollow the plug. Do not bring back a depth cap.

## Decisions

1. **`_rebuildCut` scale `(1,1,1)`.** Hairline is the 0.98 box. Close
   the espresso tunnels. Rotation stays `(0,0,0)`. Unlit umber
   `_cellColor` unchanged.

2. **Quiet the voxel dust burst.** `applyHit` dust: count
   `Math.min(5, 2 + Math.floor((removed.length + islands.length) * 0.04))`,
   `life: 0.35`, `size: 0.08`, `speed: 1.4`, `rise: 0.4`. Do not edit
   `dust.js`.

3. Inward plug, `CELL`, `_payGroup`, cameras — unchanged.

## Presentation

Fireplace densest 80×80 is one packed umber island (lip-band, not
umber/dust/espresso). Faces still read as voxels, not 79×70 slabs.
Not cream. Chaise / settee / table-round / crate plates must not go
light. Well must stay gone.

## Ownership

| May edit | Do not touch |
|---|---|
| `src/destruction/furn-voxels.js` (`_rebuildCut` scale, `applyHit` dust args) | `debris.js`, `dust.js`, `_cellColor`, `CELL`, `_payGroup` |
| this file | cameras |

## Verification

```
npm run build
node harness/playtest.mjs --view furn.smash --script harness/evidence/_furn-smash-critic.mjs --port 5401 --q "quality=medium"
```

Look at densest 80×80 vs 148s. Espresso 0.105 must not eat the lip.
Ceiling PASS.

If a stated fact is wrong, say so rather than diverging.
