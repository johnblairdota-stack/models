# Slice plan: standalone Meshy smash lab (`furn.smash`)

**Status:** DECIDED. Blank room, every Meshy prop in a hittable lineup, playcritic vs Teardown.

**Bar:** `docs/design/teardown-reference.md` + stills in `refs/teardown/` (agent context, not locked art).
Copy *size, tumble, persistence, skeleton* — not voxels.

## Why

`?furnline=1` inside `game.play` mixed smash testing with the estate. John asked for a
**standalone slice**: one large blank room, assets in a line, smash each, judge Teardown feel.

## Ownership

| May edit | Do not touch |
|---|---|
| `src/views/furn-smash.js` (**new**) | `src/views/game.js` smash path |
| `src/game/furn-smash-lab.js` (**new**) | wall dig / DamageField |
| `src/game/furn-catalog.js` (**new**) | chair circle layout |
| `src/views.js` — one `furn.smash` row | |
| `src/destruction/furn-fx.js` — `rug` profile only | |
| `harness/evidence/_furn-smash-critic.mjs` (**new**) | |
| `FURNSMASH.bat` (**new**) | |
| `docs/slices/task-furn-smash.md` (this) | |

`src/game/furn-meshy-lineup.js` / `?furnline=1` may stay; this slice does not depend on them.

## Layout (decided)

- Room **52 × 22 × 7.5 m**, mid-grey floor + walls. Lighting is **`studio()`** (cyc off), not `estate()`.
- **Two rows of 12**, spacing **3.6 m**, row Z **±3.6 m**.
- Fit GLB to `targetH` / `maxSpan`, then **×1.55 boost** (except rugs) so pieces read vs the 1.7 m mesh robot.
- Rug: Meshy disc is local XY; **`rotation.x = -π/2`**, span **2.8 m**, walk-through AABB 0.45 m.
- Each piece is a `FurnProp` with a `FurnVoxelBody` (`docs/slices/task-furn-smash-vox.md`).
- Player is **`createMeshAvatar`** (same as `PLAYMESH.bat` / `?mesh=1`): walk/run/attack clips, hammer on the hand bone. Procedural body only if the GLB fails to load.

## Playable view

`?view=furn.smash&quality=medium`

- Player + sledge equipped, **mesh avatar** (playmesh clips), ThirdPersonCamera, WASD / LMB.
- No hunter, no dig walls, no HUD sockets required.
- Hang `engine.player`, `engine.room` (lab), `engine.cam` for the critic.

## Playcritic instrument

`harness/evidence/_furn-smash-critic.mjs`: for **each** catalog id, park ~1.5 m in the aisle facing the
prop, aim, `_resolveSledgeHit` until shatter or 8 blows, screenshot before + after, log
connects / stages / debris rest count if exposed.

Then the **playcritique role** (not the builder) looks at the shots and files
`harness/out/furn-smash-critic/VERDICT.md` against the Teardown bar.

## Verification

```
npm run build
node harness/playtest.mjs --view furn.smash --script harness/evidence/_furn-smash-critic.mjs --port 5330 --q "quality=medium"
```

Assert: 24 lineup ids (or fewer if a GLB is still generating — report missing, do not fake).
Sledge equipped. At least one shatter per present prop.

## Traps

- Use `npm run build`, never `npx vite build`.
- Do not smash with mouse in the critic (overwrites `_lastSledgeHit`). Programmatic resolve only.
- Missing first-8 GLBs: critic reports `missing`, still smashes the 16.

## After this slice

Tune HP / debris size / wound hold from the critic hates. Do not self-award WOWED.
