# Slice plan: smaller coloured lip, no proud cubes (r5)

**Status:** SUPERSEDED by `docs/slices/task-furn-smash-vox-pack.md` (r6 packed interior).

**Bar:** same Teardown still. John: lip voxels are too big, stick outside the
wound, always black, and look jarring on thin legs / tripod.

## Decisions

1. **Cut cubes only on remaining `skin` cells** that neighbour a carved cell.
   Never on dilated / Y-fill `occ` — those sit outside the Meshy surface.
2. Cube size **`cell × 0.26`**. Flatten any axis with no skin neighbour (`scale 0.42`
   on that axis) so legs and tabletops do not sprout bricks. Inset `cell × 0.18`
   toward the carved neighbour.
3. Colour: sample `map.image` or `map.source.data`. Black GLTF factors with a map
   sample as white. Lift near-black tints; reject near-white unknowns as wood
   `{0.42, 0.30, 0.20}`. White vertex colours on the cut box.

## Ownership

| May edit | Do not touch |
|---|---|
| `src/destruction/furn-voxels.js` | `game.js`, wall dig |
| this file | |

## Verification

```
npm run build
node harness/playtest.mjs --view furn.smash --script harness/_furn-smash-critic.mjs --port 5349 --q "quality=medium"
```

Critic looks at chair / cam-tripod / desk / settee **wound**: lip must sit in the
hole, match the paint hue, and not dwarf thin legs. Ceiling PASS.
