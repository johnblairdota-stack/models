# Slice plan: body colour, not highlight (r13)

**Status:** CRITIQUED — WEAK. Plates match: settee NO, chaise NO, desk NO, table-round YES, fireplace NO. #1: chaise still dusty-rose tiles (`#9d6868`) off black-red velvet (`#360b0f`).

**Bar:** `refs/teardown/yt-house-240s-chunks-tumble.png`,
`yt-house-148s-sledge-hole.png`, `yt-ign-52s-plank-tumble.png`,
`yt-house-145s-table-island.png`.
r12 critic WEAK #1: highest-chroma picked baked-map highlights
(khaki/cream/magenta), not gilt, velvet, or dark wood. Teardown chunks
still wear the object.

## Why

`_pickSkinColor` takes **max chroma**. On these Meshys that is a
specular/bake highlight: dusty rose off near-black velvet, cream off
mahogany. Interior fill also inherits those texels (`rebuildOcc` copies
neighbour RGB inward), so the carved group is highlight-heavy.

Fireplace brown and crate dark already work when the pool is the facing
colour. Copy that, do not max-chroma.

## Decisions

1. **Colour from original surface cells only.** Skip `this.inner[i]`
   (fully enclosed fill). If that leaves zero samples, use `g.avgTint`.

2. **Drop highlight wash.** Luma = `0.2126 r + 0.7152 g + 0.0722 b`.
   Drop a sample when `luma > 0.58` **and** chroma `< 0.28` (cream/pink
   tiles go; gilt stays). Empty/black cells (`r+g+b < 0.04`) are skipped,
   not replaced with avgTint inside the pool.

3. **Pick the darkest remaining sample with chroma ≥ 0.04.** If none
   chromatic, pick darkest remaining. If the pool is empty, `g.avgTint`.
   Do **not** `liftTint` the pick (`liftTint` brightens `s < 0.12` toward
   0.55 — that is the pink/cream lift).

4. Hold, AABB, carve radius, cut-cube `_cellColor`, cameras, `furnchip`
   env map — unchanged.

## Presentation

Leave plates read as the facing object: settee gilt/upholstery or dark
frame, not khaki foam; chaise deep red velvet, not magenta tiles; desk
and table-round dark wood, not cream; fireplace brown and crate brown
must not go light.

## Ownership

| May edit | Do not touch |
|---|---|
| `src/destruction/furn-voxels.js` (`_pickSkinColor` only) | `debris.js`, `game.js`, wall dig |
| this file | hold / AABB / carve / cameras |

## Verification

```
npm run build
node harness/playtest.mjs --view furn.smash --script harness/_furn-smash-critic.mjs --port 5379 --q "quality=medium"
```

Look at `s-settee-leave.png`, `s-chaise-leave.png`, `s-desk-leave.png`,
`s-table-round-leave.png`, `s-table-round-after.png`, `s-fireplace-leave.png`
vs the bar. Ceiling PASS.

If a stated fact is wrong, say so rather than diverging.
