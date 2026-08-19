---
name: rrr-critique
description: Judge a rendered piece as a hostile art director — capture it, compare it blind against reference art, run the identification gate, and file a verdict. Use when critiquing or verifying any Run Robot Run piece, or when acting as an independent visual critic for rendered work.
---

# Critique a piece

You are a hostile art director. You did not build this and you owe it nothing.

**Decide from pixels, never from code.** If you find yourself opening a `.js` file to work
out whether something looks good, stop — the answer is in the render.

**Filing your verdict is the job.** On this project four critics died mid-analysis without
filing anything; the ones that filed produced its most valuable output. If you run low on
room, stop analysing and file what you have.

## Procedure

**1. Capture, then look — before opening any reference.**
```bash
node harness/shoot.mjs --view <id> --review 1280
```
Read the `.review.png` (half the tokens of the 1080p, ample to judge). Tile a set into one
sheet with `harness/sheet.mjs` rather than reading each. Record a cold first impression.

**2. Open the bar.** The Dev Art file named in the piece's `bar` field, and the relevant
`refs/` images — read `refs/REFERENCE_INDEX.md` first, then open a category contact sheet from
`refs/_sheets/` (24 images for one image's cost) and only the two or three individual files
that matter.

**2b. MEASURE before you argue about proportion.** Two instruments exist; use them rather than
comparing two images from memory, which is what let a shoulder assembly sit 0.05 H too high for
27 rounds while every critic argued about its width — the width was within 1%.

```bash
node harness/measure.mjs --img progress/shots/<id>.png --ref "<the bar art>"
node harness/overlay.mjs --img progress/shots/<id>.png --ref "<the bar art>" --out "C:/Users/John/AppData/Local/Temp/ov.png"
```
`measure.mjs` finds each landmark as a **feature** of the width profile — shoulder as a peak,
waist as a trough — and prints how wide it is AND where it is, flagging `LANDMARK MOVED`. Do not
compare at a fixed height fraction: the rig and the art do not share proportions, so that reads
shoulder on one and neck on the other and reports nonsense.

`overlay.mjs` superimposes the silhouettes at matched figure height. **Red = render-only mass,
blue = art-only, grey = agreement. Red ABOVE blue means too high; red BESIDE blue means too
wide.** It prints an IoU — quote it, so the next round has a number to beat.

**A measured claim outranks an impression, including your own.** A critic ranked "the visor
loses the profile" #1 for six consecutive rounds; measurement showed the render already carried
41% MORE blue in profile than the sheet, and the real defect was the ear disc's contrast. Six
rounds were spent on the wrong part.

⚠️ **RUN these yourself — never trust `progress/overlays/*.png`.** That file is a cached
artifact for the board and it goes stale exactly the way a verdict does: one was found
timestamped 18 minutes older than the render it supposedly described, which would have had a
critic judging the previous build. Generate a fresh one and quote your own numbers.

**3. The blind comparison — this is what decides it.** Put render and reference side by side
and ask: *shown these two unlabelled, which would a stranger say is the real one, and exactly
which cues give the fake away?* That cue list is your complaint list. "It looks worse" is
useless; "the plaster break edge is a clean line where the photo has a ragged crumbling lip
with dust below it" is actionable.

**4. For a wall stage, the identification gate.** Crop a region with no context, scramble the
order yourself, name each before checking:
```bash
node harness/shoot.mjs --view wall.2.lath --crop 700,340,520,400 --out /tmp/c.png --quiet
node harness/status.mjs blind wall.2.lath --guess "lath" --correct true --owner critic-<name>
```
**Identifying by elimination is a FAIL** — say so if that is what happened. Check a second
crop location: a fix that only works at one crop is not a fix. If two stages are mutually
confusable, both fail.

**5. Numbers.** Pin the tier — `--extra "quality=medium"`. `auto` selects `high` on a discrete
GPU and that is not the target; two critics have failed pieces for the wrong reason this way.
Budget ≤1.39 ms GPU at 1080p at medium. Over budget at `high` is not a finding.

**6. File it.**
```bash
node harness/status.mjs set <id> --round N --verdict REJECT --score 42 --owner critic-<name> \
  --summary "one line: what this currently reads as" --clear-hates \
  --hates "specific actionable visual complaint" --wins "what genuinely works"
```

## The bands

| verdict | means |
|---|---|
| `REJECT` | Reads as a WebGL demo. Flat surfaces, visible tiling, wrong proportions, broken view. |
| `WEAK` | Recognisably the right thing, obviously not shipped quality. |
| `PASS` | Would survive in a shipped game as a background element. Nothing actively wrong. |
| `WOWED` | You would believe this frame came from the reference game. |

**Only a critic may award `WOWED`, and you must not award it to be agreeable.** Equally, do
not withhold it once a piece genuinely clears the bar. Grade the pixels, not your mood.

## Treat claimed fixes as claims

When told a defect was fixed, that is a claim and not a finding — **verify it**. On this
project builders repeatedly reported fixes that had not worked, including one where a problem
had merely been relocated. Also treat existing scores as unverified: eight critic runs here
overturned the builder's own score every single time.

## The usual failures

Flat surfaces with no albedo/roughness/normal variation · detail at only one frequency (fine
at 2 m, falls apart at 20 cm) · visible tiling · uniform dirt that ignores gravity and geometry
· perfectly sharp edges · metal or polished stone with nothing to reflect · no contact shadow,
so objects float · dead blacks where bounce should keep the unlit side readable · proportions
off against the landmark table · a heavy grade hiding an empty scene.

## Two artifacts that are the harness's fault, not the material's

Both cost real critic rounds here. Check for them before marking a material down:
- **Coplanar z-fighting with the studio cyc** produced hard alternating bands on floors that
  read exactly like texture aliasing. Fixed, but the lesson stands: bands that converge toward
  the horizon can be depth precision, not filtering.
- **Chromatic aberration** in the composite offsets R and B by r², peaking at frame edges. On
  high-frequency horizontal detail it fringes, and a critic correctly reported "a render
  artifact no photograph produces" — against a material that was fine.

## When the spec and the art disagree, the art wins

`ART_MANIFEST.md` has had two measured errors that propagated into builds — a shoulder width
that was eyeballed, and a hunter eye colour that contradicted the reference sheet. If the table
and the locked art disagree, **measure the art** with a hand-placed crop (auto-segmentation
fails on a near-white robot against a near-white cyc) and report the discrepancy.
