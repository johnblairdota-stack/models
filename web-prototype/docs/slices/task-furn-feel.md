# Slice plan: furniture feel fixes (playcritique)

**Status:** DECIDED — execute. Do not reopen numbers without a new play session.

**Bar:** play feel only (not art score). Builder ceiling **PASS**.
Claim for later critic: cameras hittable; chair wound holds a beat; every connect flashes;
furndemo stands clear of chairs; tripod tips before vanish.

Source: playcritique proposals (ranked), session `harness/out/furn-playcritique/`.

---

## Why

Chair-circle smash works; wall cameras / mid-fight read / spawn-in-prop / missing hit flash
made the house-wide furniture loop feel like a delete button or a miss.

---

## Owns (edit only)

- `docs/slices/task-furn-feel.md` (this file)
- `src/game/furn-dress.js` — camera mount height + hit AABB; tip-over hook on placeCamera
- `src/destruction/furn-parts.js` — wound hold before hide / delayed cascade
- `src/destruction/furn-fx.js` — `dust.flash` on connect (onStage / onPartBreak / onChip)
- `src/destruction/furnprop.js` — optional tip-over path on shatter for `kind==='camera'`
- `src/views/game.js` — `armFurnDemo` collide push
- `harness/scenarios/furn-sledge.mjs` — wall-cam connect + tip-over smoke if cheap

**Does not own:** dig field, PartyKit, chandelier, density catalog, art score.

---

## Changes (decided)

### 1. Cameras hittable at play height

- Visual wall mount **`WALL_Y = 1.85`** (was 2.2).
- Hit AABB: height **`1.35`**, bottom at `mountY - 1.10` so the slab covers ~0.75–2.1 m
  (sledge eye arc). Mesh still at `group.position.y = mountY`.
- Tripod unchanged visually; ensure collider `h >= 1.5` from floor.

### 2. Broken silhouette holds ~0.4 s

In `FurnAssembly.applyHit` when a part **breaks**:
- Drop collider (`alive = false`) immediately.
- **Do not** `hide()` yet — dark-tint the mesh (`_tintPart(part, 0)`).
- `setTimeout` **400 ms** then `part.hide()`.
- If collapse triggers: **do not** call `_shatterAll` synchronously — schedule it at
  **450 ms**; until then set `stage = BATTERED` and keep wounded meshes visible.
- Guard with `_shatterScheduled` so double-hits do not stack timers.

### 3. Impact flash on every furn connect

In `makeFurnHandlers`:
- Add `onHit(prop, info)` OR call `dust.flash(at, intensity, 0.18)` from:
  - `onPartBreak` (non-cascade: **1.1**, cascade: **0.55**)
  - `onStage` for simple FurnProp (scuff/batter: **0.85**)
  - `onChip` fireplace: **1.0**
- Wire `onHit` from player only if needed — prefer handlers already on the blow path.
- Also flash from `onBreak` at **1.2** for whole-prop shatter.

`dust.flash` already exists in `src/destruction/dust.js`.

### 4. Furndemo spawn clear of chairs

In `armFurnDemo` after `player.pos.copy(at)`:
- `player.pos.z -= 0.55` (step back from +Z chair.0).
- Call `room.collide(player.pos, 0.42)` **twice**.
- Keep facing +Z / sledge equip.

### 5. Tripod tip-over on shatter

- On `FurnProp` with `kind === 'camera'` and `userData.mount === 'tripod'` (set in
  `placeCamera`): `_shatter` runs a **380 ms** tip (`rotation.z += 1.2`, slight Y drop)
  via `requestAnimationFrame`, then `_hideMesh` + `onBreak`.
- Wall cameras: immediate hide (no tip).

---

## Verification

```bash
npm run build
node harness/playtest.mjs --view game.play --script harness/scenarios/furn-sledge.mjs \
  --port 5296 --q "seed=s4&furndemo=1"
```

Assert: existing D1–D6 still green; add **D7** wall-cam `hadFurn` within 4 swings from
parked aim; **D8** furndemo `pos` not inside `ballroom.chair.0` box.

---

## Traps

- Do not merge cameras into GeoBins.
- Do not lower visual mount below **1.7** (reads as head-height clutter in service).
- No `npx vite build` — `npm run build` only.
- Builder does not self-WOW; re-run playcritique after.
