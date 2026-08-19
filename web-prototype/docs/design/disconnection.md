# Unconnected material falls — the Teardown property

> # 🚨 SUPERSEDED, 2026-08-10. DO NOT BUILD FROM §1–§2.
>
> **What replaced it: the ARCH, in `src/destruction/support.js`** — read that file's header, which
> carries the measurement. A wall arches over its holes: material with a hole anywhere beneath it in
> its own column is *hanging*, carried to the piers rather than standing on the ground. Every
> connected region of hanging material is weighed (`COLLAPSE.fail` = **3.40 m² of original wall**),
> the arch holds below that threshold, and at it the whole region comes down in one event, in waves.
> **The threshold is an AREA in m², not a fraction of the face, and that was measured rather than
> chosen** — as a fraction, one bottom blow would take a small wall down.
>
> **Why §2 is dead, with a number rather than an argument.** §2 specifies a connected-components
> flood fill dropping material fully SEVERED from the face. Measured on the shipped grid over
> **220 blows × 3 seeds** (`harness/scenarios/debris-collapse.mjs` C1): **7 cells ever severed,
> largest component 4 cells** — 0.06 m² of single chips across an entire dig, against a 26-cell
> floor below which `views/game.js` will not even spawn a slab. A radial dig excavates a **bowl**;
> the border ring stays intact, everything remains joined through the rim, and a flood fill can
> never call anything free. 🎯 **A cell with a hole under it is UNSUPPORTED long before it is
> DISCONNECTED.** (`collapse-1`, 2026-08-10.)
>
> ⚠️ **The flood fill still exists — it just fills the right set: HANGING material, not SURVIVING
> material.** That one word is the difference between a test that fires on 7 cells in a whole dig
> and the rule the shipped mechanic is built on.
>
> ✅ **§3–§6 SURVIVE AND ARE STILL WORTH READING.** §3's lagoon/atoll silhouette diagnosis, §4's
> "what it does NOT solve" (the cyan must never disconnect), §5's risk list and especially **§6 —
> *the piece that falls is the piece that left, at the size it left* — which is what
> `views/game.js`'s payout obeys today.**
>
> 🚨 **And John rejected the FIRST replacement too, which is why the arch has a threshold.** After
> playing `collapse-1`'s span sweep: *"it should not collapse the entire wall from just hitting the
> bottom once in 1x dig mode… when we blow through and the below feels unsupported it should also
> consider structural integrity of the other connected parts of the wall, and when that falls below
> a certain threshold that's when the collapse chains."* The shipped model is his.
>
> Full write-up: `docs/handoff/destruction.md` §6–7. Kept because §3–§6 are live and because the
> refutation itself is the record of how it was settled.

John, 2026-08-08:

> *"I found a game called Teardown and it has an epic feel for the sledge hammer animation. the way
> the chunks come off and **the unconnected parts fall to the ground**."*

---

## 1. What the reference actually does, and why it feels the way it does

Teardown's world is voxels, and it continuously answers one question: **is this material still attached
to anything?** When a cluster stops being connected to the structure, it stops being scenery and
becomes a falling object.

**That single rule is most of the feel**, and it is worth being precise about why:

- **Nothing unsupported stays standing.** You never get a neat rim or a floating island, because the
  moment a piece is cut free it leaves. Every silhouette is a consequence of what was still holding.
- **The player causes collapses they did not aim at.** You hit low, and something above falls. That
  is the "epic" part — the wall answers with more than you asked for.
- **Progress is legible without a meter.** You can see what is load-bearing by what has not fallen.

## 2. 🎯 Why this is unusually cheap for US — we already own the hard part

`src/destruction/damagefield.js` maintains a **CPU depth grid per destructible face** (~9.4 cm cells)
that is the single source of truth for both the shader and every gameplay query. `chunks-1` built it
that way deliberately so that what you see and what you can walk through cannot disagree.

**A grid is exactly what a connectivity test wants.** So:

1. After a blow, run a **connected-components sweep** over the face's solid cells.
2. Any component **not touching the face's border** is unsupported.
3. Convert it to falling debris — sized and shaped from the cells it occupied — and clear those cells.

No voxelisation, no rigid-body solver, no new source of truth. It is a flood fill over a grid that
is already updated on every hit.

## 3. It probably also fixes the defect five rounds have failed on

`critic-dig-4`, on round 5: two independent no-context crops both read as **"an aerial photo of a
coral atoll."** The cause is the *shape*, not the material — **3–4 smooth, evenly-spaced concentric
bands** where the reference has **one ragged tear with broken-plaster teeth**.

⚠️ **Concentric rings converging on a small pool ARE a lagoon, whatever colour they are painted.**
Rounds 2–5 changed the material four times and the misread survived every one.

**Disconnection destroys that silhouette by construction.** The inner rings are precisely the
material that is least supported; once islands fall, the boundary is irregular because pieces *left*,
not because a curve was authored. **The silhouette stops being something we draw and becomes
something that happens** — which is the same reason it looks right in the reference.

## 4. What it does NOT solve

- **The cyan barrier is undamageable and must never disconnect.** It is the one surface that stays
  whole; John's *"the cyan barrier is supposed to feel indestructable"* is settled and this must not
  reopen it.
- **It is not the swing.** `critic-swing-2` passed the choreography and the silhouette test; the
  hammer's arc is a separate open item (measured ~2× a human's path, *"slightly whippy"*).
- **It does not price itself.** A flood fill per blow is cheap, but the falling pieces are debris,
  and every particle in this project must be **instanced from the start** — the skate drift trail
  cost **+82 draw calls for 76 sprites** and is the standing warning.

## 5. Risks to design against, not discover

- ⚠️ **The dig band is 45–75 s and currently 67.** If islands fall away, material leaves faster than
  the hammer removes it and **the dig gets shorter**. `dig-free.mjs` gates this. Expect to retune the
  decay curve, and say what changed.
- ⚠️ **Passability must follow.** Cells cleared by a collapse are cleared for movement, line of sight
  and the AI's BFS too — that is the point of one source of truth, but it means a collapse can open a
  route the player did not dig. Verify `pathPortals()` still agrees with the picture.
- ⚠️ **The interconnect must stay unfindable.** `dig.md` §5: the search is the game. A collapse that
  reveals the way through by accident would delete it.
- ⚠️ **Determinism.** The field replays exactly from its hit list and the mask never goes on the wire.
  A collapse must be a pure function of the grid, or the replay diverges.

## 6. What "chunks come off" means beyond disconnection

John names two things and only one is connectivity. The other is that **the piece that falls is the
piece that left** — Teardown's debris is visibly the material removed, at the size it was removed.
`chunks-2` already spawns a slab sized from the patch just taken; the disconnection work should
extend that so a collapsing island becomes debris **shaped like the island**, not a generic burst.

---

**Status: designed, not built.** Raised as context to `chunks-7` mid-round with instructions not to
derail its scoped silhouette fix — if it reports that disconnection is the right idea and does not
fit, this becomes round 7.
