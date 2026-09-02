# VERDICT — the hunter in the door (round 1, critic-fable, 2026-09-02)

**Piece:** `hunter.animated` — the Meshy clip body stood in a doorway, procedural stage-3
in a second doorway beside it. Capture: `hunter-door/captures/hunter-animated.review.png`
(tracked copy; fresh ones land in the ignored `progress/shots/`). Filed:
`node harness/status.mjs` — REJECT, 28%.

**Bar:** Dev Art `1785288883855` (hero) and `1785300149293` (turnaround), the locked spec.

## The blind comparison

Shown the capture and the hero unlabelled, a stranger picks the sides instantly:

- The **right door (procedural stage-3)** carries the read — wide chassis, extra arms,
  second head, red slits, grime. It is the same animal as the hero shot.
- The **left door (the Meshy clip stand-in)** reads as a clean showroom mannequin.
  Two arms, one head, no rider, no cracked mint caps, no wire looms. It is not the
  hunter and no lighting or grime pass will make it one.

## Why this is a FINDING and not a fix list

The stand-in is the **Lumi Bot biped** (`char1`, 8,346 verts) — the only rigged body in the
repo. The locked stage-3 silhouette is a wide six-armed chassis with a rider. **That
geometry does not exist in this repository.** The brief's premise ("extra arms were
Meshy-auto-rigged as a biped; skin weights on grafted limbs look wrong") describes a mesh
this repo does not hold; there are no grafted limbs to weight. The honest path to the door
is a **new Meshy generation + auto-rig** of the stage-3 body; the 24-joint clip pack then
binds to it unchanged (same skeleton contract, verified by `hunter-door` D1 on every load).
No weight paint was faked in JS.

## What genuinely works (wins, kept measured)

- The doorway A/B **is** the judging instrument the sofa lock demands: silhouette-in-the-door
  decides in under a second.
- Strike contact is measured and visibly honest: the red flash (measured contact,
  Attack 1.050 s / Heavy_Hammer_Swing 1.504 s) lands on the visible impact. Gate
  `hunter-door` D2 re-derives both from the GLB on every run.

## Open complaints (hates, actionable)

1. Stand-in body: two arms / one head / no rider vs the six-armed hero — blocked on new
   Meshy geometry, not on code.
2. The stand-in's eye quads read dark at bench distance while the procedural hunter's red
   slits carry across the room — worth one pass on quad size/emissive when the real body
   lands, judged from pixels then.

## Method notes

`measure.mjs` / `overlay.mjs` were not run: both instruments assume one figure per frame
and a proportional question. This round's question is categorical (limbs and heads that do
not exist), and the capture holds two figures by design. When the generated stage-3 body
lands, run both against the hero with the procedural figure hidden (`?proc=0`).
