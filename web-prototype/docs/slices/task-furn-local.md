# Slice plan: local / part-based furniture destruction

**Status:** DECIDED — execute; do not reopen the model without measuring.

**Bar:** play feel vs walls (`DamageField` dig) and vs current whole-prop HP stages.
Gate: extend `harness/scenarios/furn-sledge.mjs`.

---

## Why

Whole-prop stages make a chair die the same way whether you smash a leg or the back.
John wants **damage where the hammer lands**, with **different physics per part** (legs vs
seat; crate battens vs body), and the **chimney to feel like a diggable wall face** because
it is building fabric — without ever opening a dig interconnect / walkable hole through the
house wall.

---

## Decided model

### 1. `FurnAssembly` — chairs, crates (and similar free props)

Not a DamageField. Named **parts** with their own AABB + HP + debris profile.

| Part role | Examples | On break |
|---|---|---|
| `leg` | chair FL/FR/RL/RR | light timber; sideways eject; drop that collider |
| `seat` / `body` | chair seat, crate body | heavier timber; upward bias |
| `back` / `batten` | splat, crate rails | lath-heavy spray |

- Raycast prefers the **part box** that the ray hits (`box._furnPart`).
- `applyHit(point, power, { partId })` damages only that part.
- Structural collapse: seat gone **or** ≥3 legs gone → remaining parts shatter (cascade).
- **Do not** put these into `DamageField` / dig unlock.

### 2. `FurnCladding` — study fireplace / chimney piece

**Does** use a `DamageField` on the chimneypiece front plane (same brush as walls).

| Rule | Decision |
|---|---|
| Local dig look | `field.applyHit(u,v,power)`; hide child meshes whose centre projects into cells with depth ≥ 0.72 |
| Debris | `slab` + `plaster` at hit (wall-like), not timber-first |
| Passable | **never** — breast / wall collider stays; `brokeThrough` never clears dig / barrier |
| Interconnect | **never** call dig unlock / twin couple |

Audio: `depthAt` from the field so it rides `playMeleeImpact` like a wall.

### 3. Perf

- Chair circle: leave InstancedMesh **or** switch to 8 parted Groups. **Decision: parted Groups**
  (shared materials). Budget check at ballroom.centre; abort if calls jump >+40 at that station.
- One DamgeField per fireplace only (≤2 studies with chimney).

---

## Owns (edit only)

- `src/destruction/furn-parts.js` (**new**) — `FurnAssembly`, `FurnCladding`
- `src/destruction/furnprop.js` — keep for simple props; assemblies wrap or replace
- `src/world/props.js` — `ornateChairParts()`, parted crate bake helper
- `src/game/room.js` — castRay returns `partId`; register/drop part boxes
- `src/game/player.js` — pass `partId` into `applyHit`
- `src/game/furn-dress.js` / `src/views/game.js` — wire chairs / crates / fireplace
- `src/destruction/furn-fx.js` — part profiles
- `harness/scenarios/furn-sledge.mjs` — part-hit + cladding gates
- `docs/slices/task-furn-local.md` (this file)

**Does not own:** `damagefield.js` internals, dig unlock, wall.js, skin.js.

---

## Verification

```bash
npm run build
node harness/playtest.mjs --view game.play --script harness/scenarios/furn-sledge.mjs \
  --port 5288 --q "seed=s4"
```

Assert: leg hit does not shatter whole chair on first blow; fireplace hit removes local
cladding / pays slab; fireplace never becomes walkable.

---

## Traps

- Do not merge breakable parts into room GeoBins.
- Do not set fireplace field barrier unlockable.
- InstancedMesh cannot hide one leg — parted meshes required for chairs.
- Use `npm run build`, never `npx vite build`.
