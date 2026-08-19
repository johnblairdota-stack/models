# Teardown — the reference, finally

**Until 2026-08-09 this project had NO Teardown reference.** John named it as the bar on 2026-08-08
(*"I found a game called Teardown and it has an epic feel for the sledge hammer animation. the way
the chunks come off and the unconnected parts fall to the ground"*) and every brief since was
written from **my paraphrase of his sentence**. He then supplied frames from two videos.

⚠️ **Look at `refs/teardown/yt-*.png` first** — frames grabbed from playing YouTube
(IGN gamescom trailer + a house-sledge playthrough). This file is the write-up; the
clips are the evidence. Wiki stills in that folder are leftovers.

## What one hit does — and this is the headline

**A single sledgehammer hit removes a SECTION, not a chip.**

| clip | what it took | hits |
|---|---|---|
| timber plank shed wall | most of one wall bay, cladding gone, studs left standing | **1** |
| bathroom vanity unit | the entire bench, top and carcass | **2** |
| sofa | most of the sofa | **2** |
| plastered interior wall | a body-sized hole with daylight through it | **3** |

🎯 **This is the measurement that matters most, and it is why John changed the pacing.** Our dig was
~60 blows to breach one wall. Teardown is **1–3**. He played at the `[ ]` key's ×8 and said
*"8x should actually be the base speed"*, which lands us at ~7–8 blows — the same order as the
reference.

## What the material does

- **Chunks are LARGE, ANGULAR AND CUBOID.** Plank-sized and brick-sized slabs, not gravel. You can
  pick out an individual piece and follow it.
- **They TUMBLE SLOWLY ENOUGH TO READ.** Rotation is visible in flight. It is not a particle spray.
- **They LAND AND STAY.** By two minutes in, the floor is carpeted in recognisable large pieces
  **lying at every angle and leaning on each other.** The heap has structure; it is not a scatter.
- **Dust is a separate, softer layer BEHIND the slabs** — it never replaces them. Both are present
  in every impact frame.
- 🎯 **THE FRAME SURVIVES THE CLADDING.** On the timber shed the planks come off and the **studs
  remain standing as a skeleton**. That is an exceptionally strong read for *surface vs structure* —
  and it is exactly this game's coat → white → cyan stack, which means the stack is right and only
  its **legibility** is wrong.
- **Breaking fully through shows daylight and the space beyond**, and that is plainly the payoff
  moment in the footage.

## What it does NOT tell us, and where we deliberately differ

- ⚠️ **Teardown is voxels; we are not.** The blockiness is a consequence of its world
  representation, not a style choice we should copy. **Do not chase the cubes.** Copy the *size*,
  the *tumble*, the *persistence* and the *skeleton*, not the pixelation.
- ⚠️ **Teardown has no search.** Its satisfaction is fast catastrophic destruction with no hidden
  answer to find. Ours has to keep *"they are trying to find the doorway hidden behind the wall"*
  alive at 1–3 hits per probe, which is a design problem Teardown never had to solve.
  **This is the open risk of the ×8 change and it should be measured, not assumed.**
- ⚠️ Teardown is **first person with the tool in view**; we are third person with the player's own
  body covering **45.7–52.6%** of an opening. The reference's readability partly comes from a camera
  we do not have.

## Consequences already recorded elsewhere

- The dig band (47–67 s, six rooms) is **suspended** at John's instruction and will be invalidated
  by the ×8 change. `harness/scenarios/dig-band.mjs` should **report** the clock, not gate on it,
  until he re-sets a number.
- `critic-slice-3`'s #1 finding — *"the floor stays clean; the game leaves 6–10 hand-sized chips at
  the skirting"* — is confirmed by the reference as the single largest gap.
- The persistent-pile architecture (settled pieces leave the recycling pool and join one instanced
  mesh) is what makes the reference's floor possible at all.
