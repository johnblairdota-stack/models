# Slice plan: carve only wood, let plates fall (r39)

**Status:** BUILT — relaunch FURNSMASH.bat for one-hit play

**Bar:** Teardown play, not the 148s colour still. John: colour is
lower priority than voxels spilling, breaking off, and collapsing in
plates onto the floor. Player shot of one hit: a flat brown disc plus
a slat grid on the remaining Meshy. r38 wound-tint is already reverted.

## Why

One sledge blow currently treats the whole carve sphere as furniture.
Empty cells inside the AABB get clipped (punches a grid through the
original mesh) and then plugged with unlit brown cubes (the disc).
Teardown removes the wood that was there; that wood becomes debris on
the floor. Air is not a brown pancake.

The 8-blow crater-colour loop (r16–r37) is paused. Fireplace packing
may go hollow. That is accepted this round.

## Decisions

1. **Clip and carve only cells that already have `occ` or `skin`.**
   In both carve loops, do not `clip[i] = 0` on empty air. Move the
   clip write to after the `if (!g.skin[i] && !g.occ[i]) continue`.

2. **Delete the AABB empty-cell plug block** (`solidBox` sphere fill
   after carve). Do not plant cubes in air. `solidBox` can stay unused
   this round; do not delete the field.

3. Remove now-dead `plugX` / `plugY` / `plugZ` / `plugR2` plumbing.

4. `_payGroup`, dust, scale 0.90, `cutS`, `_cellColor` — unchanged.
   Occupied carved cells still sit as cut cubes (the wood that stayed).
   Removed skin still pays falling plates.

## Presentation

One hit is a hole in the wood plus plates on the floor. Not a brown
disc stuck on the front. Not a repeating slat grid punched through the
intact Meshy. Chaise must not grow a brown air sphere (plug is gone).

## Ownership

| May edit | Do not touch |
|---|---|
| `src/destruction/furn-voxels.js` (carve + delete plug only) | `dust.js`, `debris.js`, scale, `_cellColor`, `cutS` |
| this file | cameras |

## Verification

```
npm run build
```

John relaunches `FURNSMASH.bat` and one-hits the mantel. Look for
falling plates, not a pancake. Ceiling is play-read, not WOWED colour.

If a stated fact is wrong, say so rather than diverging.
