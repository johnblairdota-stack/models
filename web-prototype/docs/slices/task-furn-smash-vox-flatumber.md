# Slice plan: displayed umber, not lit terracotta (r23)

**Status:** CRITIQUED — r23 PASS, not WOWED. Leftover #1: densest still umber/dust split, not 148s 100% lip.

**Bar:** `refs/teardown/yt-house-148s-sledge-hole.png`.
r22 critic **PASS**, not WOWED. Leftover #1: densest meat still
terracotta/dust, not 148s’ one umber island. Densest lip 54.3% vs
148s **100%**. Ranked `#3c2212` luma **0.150** chroma 0.164 vs 148s
`#4c3c2c` luma **0.245** chroma 0.126. Dust `#645343` luma 0.334
still leads at r21’s coords. Axis-align grew faces (mean-run 6.6→9.5,
largest 79×70). Well did not return. Do not go cream. Plates must not
go light.

## Why

r22 scaled wood albedo toward luma 0.24. Studio PBR then displayed
`#3c2212` at 0.15 — the unlifted terracotta. Lighting also splits
faces into terracotta vs dust 0.33. 148s densest 80×80 is **100% one
unshaded umber**. The metric is pixel luma, so cut cubes must *display*
`#4c3c2c`, not hope PBR lands there. Do not hollow the plug. Do not
bring back a depth cap. Do not rotate cubes (that was the r21 split).

## Decisions

1. **Wood cuts are 148s umber.** `_cellColor`: if chroma < 0.20 and
   luma ≥ 0.11, return `{ r: 76/255, g: 60/255, b: 44/255 }`
   (`#4c3c2c`). Else if luma < 0.16, scale to 0.18 as today. Velvet
   (chroma ≥ 0.20) and crate espresso (luma < 0.11) do not become
   umber.

2. **Cut material is unlit.** `MeshBasicMaterial({ color: 0xffffff,
   vertexColors: true })`. Instance colour is the pixel colour.
   Drop Standard roughness/emissive. Keep `g.cell * 0.98` geometry.

3. **Crumble without rotation.** `_rebuildCut` scale **0.90** on every
   cube, rotation still `(0,0,0)`. Gaps show the grid; plug stays.

4. Inward plug, `CELL`, `_payGroup`, `bodyTintFrom` — unchanged.

## Presentation

Fireplace densest 80×80 is one umber through the volume (lip-band,
not terracotta/dust). Faces read as a voxel grid, not 79×70 slabs.
Not cream. Chaise / settee / table-round / crate plates must not go
light. Well must stay gone.

## Ownership

| May edit | Do not touch |
|---|---|
| `src/destruction/furn-voxels.js` (`_cellColor`, cutMat, `_rebuildCut` scale) | `debris.js`, `applyHit` plug, `CELL`, `_payGroup` |
| this file | cameras |

## Verification

```
npm run build
node harness/playtest.mjs --view furn.smash --script harness/evidence/_furn-smash-critic.mjs --port 5399 --q "quality=medium"
```

Look at densest 80×80 vs 148s. Ranked hex should be the `#4c3c2c`
family. Ceiling PASS.

If a stated fact is wrong, say so rather than diverging.
