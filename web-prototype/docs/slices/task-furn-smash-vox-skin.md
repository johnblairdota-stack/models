# Slice plan: debris wears the Meshy skin (r12)

**Status:** CRITIQUED — WEAK. Plates still cream/pink foam, not the Meshy (settee/chaise/desk/table-round all NO).

**Bar:** `refs/teardown/yt-house-240s-chunks-tumble.png`,
`yt-house-148s-sledge-hole.png`, `yt-ign-52s-plank-tumble.png`.
r11 critic WEAK #1: cream / tan / pink tiles off dark wood, gilt, and
velvet. Teardown chunks still wear the object.

## Why

Three stacked washes:

1. `paint` uses `Math.max` per channel, so baked map highlights win and
   every cell drifts toward cream.
2. `_payGroup` **averages** those cells, so red velvet + dark frame =
   pink, gilt + cream = foam.
3. `furnchip` shares `envMapIntensity: 2.0` with wall debris, so the grey
   studio cyc lifts the instance colour toward beige.

## Decisions

1. **`paint` keeps the higher-chroma sample.** If chroma is within 2/255,
   keep the **darker** (lower sum). First write still wins on an empty
   cell. Do not `Math.max` RGB.

2. **Plate colour is the highest-chroma cell in the group**, not the
   mean. If that chroma is `< 0.06`, use `g.avgTint`. Do **not** run
   `liftTint` on a chromatic pick. Cut cubes keep `_cellColor` as today.

3. **`furnchip` only** in `debris.js`: `envMapIntensity: 0.50` (constructor
   must read `def.envMapIntensity ?? 2.0` so other kinds stay at 2.0),
   `emissiveIntensity: 0.03`. Do not change slab/timber/plaster.

4. Hold, AABB, carve radius, cut-cube size, cameras — unchanged.

## Presentation

Leave: settee plates read as the upholstery / gilt, not packing-foam
cream. Chaise plates read as the red velvet, not pink. Desk / table-round
plates read as the dark wood, not tan. Fireplace brown already did this;
do not break it.

## Ownership

| May edit | Do not touch |
|---|---|
| `src/destruction/furn-voxels.js` | `game.js`, wall dig, other debris kinds |
| `src/destruction/debris.js` (`furnchip` + `envMapIntensity` default) | |
| this file | |

## Verification

```
npm run build
node harness/playtest.mjs --view furn.smash --script harness/evidence/_furn-smash-critic.mjs --port 5377 --q "quality=medium"
```

Look at `s-settee-leave.png`, `s-chaise-leave.png`, `s-desk-leave.png`,
`s-table-round-after.png` vs the bar. Ceiling PASS.

If a stated fact is wrong, say so rather than diverging.
