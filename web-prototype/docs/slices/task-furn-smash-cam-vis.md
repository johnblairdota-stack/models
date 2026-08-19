# Slice plan: visible smash-lab cameras (r8)

**Status:** BUILT — cameras dressed; look shots in `harness/out/furn-smash-look/`.
Video critic blocked until a Teardown sledge clip is on disk.

**Bar:** cameras must be readable in the lineup (not shadow-only). Then
feel-critic against **Teardown sledge video**, not a wiki still.

## Why

`cam-wall` / `cam-tripod` GLBs are upright and sized. They cast shadows.
Albedo is charcoal, ORM metalness is high, emissive factor is `[1,1,1]`
on a black emissive map. In the grey studio they disappear. r7 `vox: off`
also skipped the voxel material clone other props get, so cameras kept
the raw Meshy chrome-black.

## Decisions

1. On smash-lab load, for `kind === 'camera'` only: clone materials,
   drop `emissiveMap`, cap `metalness` at **0.12** and clear
   `metalnessMap`, `side = DoubleSide`, `frustumCulled = false`,
   fill emissive `{0.10, 0.09, 0.08}` × intensity **0.45** so thin
   legs read. Do not change other kinds.
2. Give `cam-wall` `targetH: 0.55` so the hanging cam is not a 25 cm
   speck at 1.55 m.
3. Keep `vox: 'off'`.
4. After cameras read, the next critic is **motion vs Teardown sledge
   video** (chunks tumbling off). A still is not the bar.

## Ownership

| May edit | Do not touch |
|---|---|
| `src/game/furn-smash-lab.js` | `game.js`, wall dig |
| `src/game/furn-catalog.js` | voxel fill |
| this file | |

## Verification

```
npm run build
node harness/playtest.mjs --view furn.smash --script harness/_furn-smash-look.mjs --port 5361 --q "quality=medium"
```

Look at `s-cam-wall-aim` / `s-cam-tripod-aim` (or look-script shots):
the camera body and tripod legs must be visible, not only their shadows.
