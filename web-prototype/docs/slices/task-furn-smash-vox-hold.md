# Slice plan: plates still in the air at leave (r11)

**Status:** CRITIQUED — WEAK. Leave shows plates in flight on settee/crate/desk/chaise; not PASS vs the YouTube clips.

**Bar:** same YouTube clips as r10. r10 critic WEAK: popcorn is gone, but
leave frames show plates **already on the floor** (or the table still
intact). Fireplace’s one airborne slab is the exception, not the beat.

## Why

`chunk()` scales `w/h/t` as if the geo were wallSlab `0.22×0.19×0.058`.
`furnchip` geo is `0.16×0.12×0.10`. Passing an AABB thickness of 0.3 m
draws ~0.52 m of thickness, so the carton intersects the floor on the
spawn frame and the 160 ms leave shot is a heap. `hold` is 0.02–0.05 s,
so even a thin plate has already let go.

## Decisions

1. **Compensate furnchip scale in `_payGroup` only** (do not edit
   `debris.js`):
   `wPass = w * 0.22 / 0.16`, `hPass = h * 0.19 / 0.12`,
   `tPass = t * 0.058 / 0.10`. Drawn size equals the AABB metres.

2. **Slabs, not cartons.** After AABB: `t = min(t, 0.11)`. Clamp
   `w ∈ [0.22, 0.58]`, `h ∈ [0.16, 0.42]`.

3. **Hold long enough for the leave shot.** Carve `hold: 0.20`,
   freeFall `hold: 0.10`. Leave is captured at ~160 ms.

4. **Spawn above the floor.** `at.y = max(floorY + h * 0.55 + 0.05, plate.y)`.
   Carve `spread: 0.7`. FreeFall `spread: 0.9`, `sag: 0`.

5. Shell timber: same hold/spawn; keep plank floors on w/h/t, then the
   same furnchip compensation is **not** applied (timber geo matches
   `chunk()`’s wallSlab-ish timber). Timber: pass AABB metres as today
   with plank floors only.

6. Cut cubes, cameras, carve radius, catalog `vox` — unchanged.

## Ownership

| May edit | Do not touch |
|---|---|
| `src/destruction/furn-voxels.js` | `debris.js`, `game.js`, wall dig |
| this file | |

## Verification

```
npm run build
node harness/playtest.mjs --view furn.smash --script harness/evidence/_furn-smash-critic.mjs --port 5375 --q "quality=medium"
```

Look at `s-table-round-leave.png`, `s-settee-leave.png`,
`s-fireplace-leave.png`, `s-crate-leave.png`: **2–6 plates still in the
air or peeling off the wound**, not sitting. Ceiling PASS.

If a stated fact is wrong, say so rather than diverging.
