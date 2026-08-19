# Slice plan: Meshy furniture smash lineup

**Status:** DECIDED — build after the 16 Image→3D GLBs land in `public/models/furn/`.

**Bar:** Teardown feel for smash (`docs/design/teardown-reference.md`) + visual appeal.
This slice only **stages** the props in a hittable line. Feel tuning is a follow-up after
John plays the lineup.

## Why

Concepts → Meshy GLBs need a playable station so we can smash each piece, judge debris /
wound / silhouette, and decide what the destruction mechanic needs next.

## Ownership

| May edit | Do not touch |
|---|---|
| `docs/slices/task-meshy-furn-lineup.md` (this) | dig / DamageField |
| `src/game/furn-meshy-lineup.js` (**new**) | existing chair circle layout |
| `src/game/furn-dress.js` — one call site only | wall dig shaders |
| `src/views/game.js` — `?furnline=1` arm only | |
| `src/destruction/furnprop.js` — optional `FURN_HP` keys for new kinds | |
| `public/models/furn/*.glb` (copied by Meshy tool) | |

## Assets (16)

From `assets/concept/furn/` → Meshy Image→3D → `public/models/furn/rrr_prop_<id>_v1.glb`:

rug-circle · wingback · settee · sideboard · bookcase · grand-piano · armor ·
pedestal-bust · table-round · chaise · gramophone · torchiere · card-table ·
hall-stand · vitrine · ottoman

Tool: `node tools/meshy-furn-img2d.mjs` (needs `MESHY_API_KEY`).

## Decided placement

1. Query **`?furnline=1&seed=s4&quality=medium`** (also imply furndemo sledge equip).
2. Park player in **ballroom** facing +X.
3. Place the 16 props in a **single row** along +X, spacing **2.4 m** centre-to-centre,
   starting at ballroom centre + `(−2, 0, 4)` so the first prop is ~4 m in front of a
   player parked at centre stepped back.
4. Load each GLB with `GLTFLoader`, `auto_size` already applied by Meshy; still **normalize**:
   - compute bbox, scale so max horizontal span ≤ **1.8 m** (rug: diameter ≤ **6.0 m**,
     sit on y=0, no collider block height > 0.05 — rug uses a thin floor AABB).
   - origin at bbox bottom centre on floor (`y = -box.min.y` after scale).
5. Wrap each in `FurnProp` with `kind` mapped:

| id | kind | HP |
|---|---|---|
| rug-circle | `rug` | 1.0 |
| wingback, settee, chaise, ottoman | `chair` | default |
| sideboard, bookcase, vitrine, hall-stand | `desk` | default |
| table-round, card-table | `console` | default |
| grand-piano | `desk` | 3.2 |
| armor | `urn` | 2.0 |
| pedestal-bust | `urn` | 1.5 |
| gramophone, torchiere | `giltbox` | default |

6. Add `FURN_HP.rug = 1.0` in `furnprop.js`.
7. Reuse existing `onBreak` / `onStage` from `dressLooseFurniture` handlers (debris + dust).
8. Do **not** tip cameras here — none of these 16 are cameras.

## Presentation

- Lineup must be walkable between props (2.4 m centres, props ≤1.8 m wide → ≥0.6 m gap).
- Rug first or last in the row is fine; prefer **index 0 = rug** so smash order starts
  soft, then furniture.
- Labels: optional floating HTML is **out of scope**. Judge by silhouette.

## Verification

```
npm run build
node harness/playtest.mjs --view game.play --port 5320 --q "seed=s4&furnline=1&quality=medium"
```

Look: 16 smashable meshes in a row; sledge connects; shatter hides mesh + pays debris.
Gate: no boot error; `room.furnProps` length includes ≥16 meshy ids (`lineup.*`).

## Traps

- Do not `npx vite build`.
- Large GLB textures: keep `quality=medium` for first play.
- Rug must not block movement like a wall — thin AABB height **0.08 m**, `blocksMove`
  still true for smash but player capsule clears it (capsule bottom above 0.08).

## After this slice (NOT this build)

Playcritique smash feel Teardown-style; tune debris / HP / part breaks per kind.
