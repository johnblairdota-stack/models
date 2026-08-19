# Slice plan: bite meat is the body colour (r16)

**Status:** CRITIQUED — Round 16 PASS (not WOWED). Fireplace/desk meat not cream.

**Bar:** `refs/teardown/yt-house-148s-sledge-hole.png`,
`yt-house-240s-chunks-tumble.png`.
r15 critic PASS, not WOWED. #1: fireplace leave is a **cream cut-cube
cavity** plus crumbs. Teardown 148s is the same colour through the
volume. Desk bite still flashes cream too.

## Why

Cut cubes call `_cellColor`. Inner fill RGB is near-black on a mantel
(`r+g+b < 0.04`), so it substitutes **lifted `avgTint`** (the highlight
mean), then `liftTint` again. That is the cream rectangle in the hole.
Plates already use `bodyTint`. The meat does not.

## Decisions

1. **`_cellColor` returns `g.bodyTint`.** No per-cell RGB. No `liftTint`.
   Fallback `g.avgTint` only if bodyTint is missing. Cut cubes and any
   other `_cellColor` caller wear the same facing colour as the plates.

2. **Cut material:** `emissive: 0x111111`, `emissiveIntensity: 0.02`.
   Do not leave 0x3a3a3a @ 0.06 — that lifts black meat toward grey.

3. Plate payout, `furnChip` geo, hold, AABB, carve radius, cameras,
   `bodyTint` computation — unchanged.

## Presentation

Fireplace leave: the hole is near-black mantel meat, not a cream brick.
Desk bite: espresso, not cream. Chaise / settee / table-round / crate
must not go light. A lumpy island still leaving the fireplace is not
this claim; the cream cavity is.

## Ownership

| May edit | Do not touch |
|---|---|
| `src/destruction/furn-voxels.js` (`_cellColor` + cutMat) | `debris.js`, `game.js`, plate `_payGroup` |
| this file | carve radius, cameras, bodyTint pick |

## Verification

```
npm run build
node harness/playtest.mjs --view furn.smash --script harness/_furn-smash-critic.mjs --port 5385 --q "quality=medium"
```

Look at `s-fireplace-leave.png`, `s-desk-leave.png` vs `yt-house-148s`.
Confirm `s-chaise-leave.png` / `s-table-round-leave.png` did not go
cream. Ceiling PASS. WOWED only from the critic.

If a stated fact is wrong, say so rather than diverging.
