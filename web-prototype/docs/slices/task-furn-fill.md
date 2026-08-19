# Slice plan: procedural room fill (+ RRR cameras)

**Status:** DECIDED — execute against the room-fill catalog. Do not reopen placement
density without measuring draw calls.

**Bar:** house reads dressed (not empty corridors); cameras read as reality-TV set dressing.
Gate: extend `harness/scenarios/furn-sledge.mjs` (or `furn-fill.mjs`) with census + smash.

---

## Why

Ordered rooms (gallery / study / ballroom) have smashable furniture; **service** and
**chapel** are empty; ballroom depot is thinner than the showcase; party-loop needs
physical **RRR reality-TV cameras** in strategic spots (`docs/design/party-loop.md`).

---

## Decided model

### Cameras (`kind: 'camera'`)

- New `rrrCamera(bin|group, { mount:'wall'|'tripod', live:false })` in `props.js`.
- Wall-mount at y ≈ 2.2 m; tripod on floor. FurnProp HP **1.0**. Default `live: false`
  (tally LED off). Smash → brass audio + light debris; mark entry in `engine.__rrrCams`.
- House-wide **12–18** units via `dressCameras` (counts below are targets, ±2 by seed).

| Space | Count | Mount |
|---|---|---|
| gallery | 4 | wall |
| service | 2 | wall |
| ballroom | 3 | tripod / wall |
| study_w, study_e | 1 each | wall |
| chapel | 2 | wall |
| connector mouths | up to 4 | wall (interior only) |

### Service / chapel fill

- Service: crates, trestles, dust sheets, paper, boarded — clear centre lane.
- Chapel: candelabra, urn, giltbox, pew (`chapelPew` new) — sparse.

### Density ports

- Ballroom: +crate stacks, trestles, dust sheets, paper.
- Studies: second desk or console + wall chairs if free span.
- Gallery: second console + `galleryBench`.

### Ablation

`?furn=0` disables all loose fill including cameras.

---

## Owns

- `docs/slices/task-furn-fill.md` (this file)
- `src/world/props.js` — `rrrCamera`, `galleryBench`, `chapelPew`
- `src/game/furn-dress.js` — `dressCameras`, `dressService`, `dressChapel`, density
- `src/destruction/furnprop.js` / `furn-fx.js` — `camera` / `bench` / `pew` / `trestle` / `mound` HP + FX
- `harness/scenarios/furn-sledge.mjs` — fill census + camera smash
- `src/views/game.js` — only if dress return / `__rrrCams` wiring needed

**Does not own:** PartyKit unlock, live TV follow-cam, chandelier Phase D, dig, yards.

---

## Verification

```bash
npm run build
node harness/playtest.mjs --view game.play --script harness/scenarios/furn-sledge.mjs \
  --port 5291 --q "seed=s4"
```

Assert: `cameras` in 12..18; service + chapel have ≥1 FurnProp each; smash one camera.

---

## Traps

- Do not block the 3.4 m service centre lane with tripods or crates.
- Do not merge cameras into room GeoBins.
- Use `npm run build`, never `npx vite build`.
