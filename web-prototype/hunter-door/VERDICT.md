# VERDICT — the hunter in the door (round 2, 2026-09-02)

**Piece:** `hunter.animated` — the Meshy stage-3 pack stood in a doorway, procedural
stage-3 in a second doorway beside it. Round 1 (`hunter-door/captures/hunter-animated.review.png`)
judged the **Lumi Bot stand-in** and REJECTED it at 28%. That body is gone.

**Bar:** Dev Art `1785288883855` (hero) and `1785300149293` (turnaround), the locked spec.

## What changed

`createHunterMeshAvatar` / `?hunterm=1` / `hunter.animated` now load John's Meshy
stage-3 pack from `public/models/anim/hunter/`:

| role | file |
|---|---|
| body + walk | `walking.glb` |
| run | `running.glb` |
| attack | `attack.glb` |
| combo | `double-combo-attack.glb` (real clip — not `Heavy_Hammer_Swing`) |

Walking is the carrier; the other files' clips bind by bone name (`bindClipToRig`,
prefix remap, throw on a miss). Baked Meshy textures stay. Game owns root XZ.
The GLBs stay gitignored; copy from
`C:\Users\John\Documents\Run Robot Run\web-prototype\public\models\anim\hunter\`.

## Remaining FINDING — extra-arm weights / silhouette

The locked stage-3 hunter has six arms, two heads and a rider. The Meshy pack is a
biped auto-rig of that body: grafted extra-arm weights may deform wrong, and the
silhouette in the door may still lose the A/B against the hero. **That is a FINDING,
not a fix list.** No JS weight paint. Re-judge in the doorway (`?view=hunter.animated`,
`?proc=0` to hide the procedural figure) once the pack is copied; do not invent a
camera. Hunter stays a door.

Round 1's "there is no generated hunter mesh in the repo" is no longer the finding —
the pack exists on disk at the Documents path. The Lumi stand-in was the wrong body.

## What genuinely works (wins, kept measured)

- The doorway A/B is still the judging instrument.
- Strike contact is measured from **these** GLBs (FK at 240 Hz). Gate `hunter-door`
  D2 re-derives on every run when the files are present; Lumi 1.050 / 1.504 are
  refused. When the files are absent the gate skips D1/D2/D4 rather than asserting
  a stand-in.

## Method notes

This cloud checkout does not hold the gitignored GLBs, so round 2 does not re-file
a pixel verdict. After copy: `node harness/hunter-door.mjs --write`, then
`?view=hunter.animated&proc=0`, then run `rrr-critique` against the hero.
