# Slice plan: one umber island, not split terracotta (r22)

**Status:** CRITIQUED — r22 PASS, not WOWED. Leftover #1: densest meat still terracotta/dust, not 148s umber.

**Bar:** `refs/teardown/yt-house-148s-sledge-hole.png`.
r21 critic **PASS**, not WOWED. Leftover #1: packed readable meat, not
148s’ **one crumbled umber island**. Densest 80×80 lip 46.6% vs 148s
**100%** `#4c3c2c` luma 0.245 chroma 0.126. Ours splits `#4b3b2d`
0.240 / `#5b4b3c` 0.303 / `#3c2315` 0.155. Tight faces still 55×79.
Well did not return. Do not go cream. Plates must not go light.

## Why

148s voxels are an axis-aligned grid of one umber. r21’s yaw/pitch and
`k∈[0.88,1.10]` plus roughness 0.62 split the same plug into dark
terracotta, dusty mid-brown, and punch — so the densest window cannot
hit 100% lip-band (0.14–0.28). `_cellColor` only lifts to luma 0.18,
so wood meat sits at ~0.15 and lighting drops it out of the band.
Do not shrink `CELL`. Do not hollow the plug. Do not bring back a
depth cap.

## Decisions

1. **Axis-align cut cubes.** `_rebuildCut`: rotation `(0,0,0)`, scale
   `(1,1,1)`, colour is `_cellColor(i)` with **no** per-instance `k`.
   Drop `uhash` if nothing else uses it. Keep one cube per carved
   cell. Keep the inward empty plug.

2. **Wood umber floor 0.24.** In `_cellColor`, chroma =
   `max(r,g,b)-min(r,g,b)`. If `chroma < 0.20` and `luma >= 0.11` and
   `luma < 0.22`, scale RGB so luma is **0.24**. Else if `luma < 0.16`,
   scale to **0.18** as today. Velvet/gilt (chroma ≥ 0.20) and crate
   espresso (luma < 0.11) do not take the 0.24 path.

3. **Cut material:** roughness **0.82**, emissive `0x222222`,
   intensity **0.04**. Geometry stays `g.cell * 0.98`.

4. `_payGroup`, `bodyTintFrom`, `CELL`, cameras — unchanged.

## Presentation

Fireplace leave densest meat is one umber through the volume (lip-band
faces, not a terracotta/dust split). Not cream. Chaise / settee /
table-round / crate plates must not go light. Well must stay gone.

## Ownership

| May edit | Do not touch |
|---|---|
| `src/destruction/furn-voxels.js` (`_rebuildCut`, `_cellColor`, cutMat) | `debris.js`, `applyHit` plug, `CELL`, `_payGroup` |
| this file | cameras |

## Verification

```
npm run build
node harness/playtest.mjs --view furn.smash --script harness/_furn-smash-critic.mjs --port 5397 --q "quality=medium"
```

Look at densest 80×80 in `s-fireplace-leave.png` vs 148s. Ceiling PASS.

If a stated fact is wrong, say so rather than diverging.
