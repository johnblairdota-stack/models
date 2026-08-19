# Reference index

**Read this before opening any reference image.** 123 images live in `refs/`. Opening one
costs roughly `width × height ÷ 750` tokens — a 1920×1080 screenshot is ~2,800. Opening ten
to find the two you need costs 28,000 for nothing.

So: read this file, pick the one or two images you actually need, open only those.

To browse a whole category at once, open its contact sheet instead — 24 images for the price
of one:

```bash
node harness/sheet.mjs --dir refs/lath --out refs/_sheets/lath.png --cols 4 --width 1400
```

Sheets already built: `refs/_sheets/{lath,hitman,alien,bf1,marble,dig}.png`.
`refs/_index.tsv` has path / dimensions / size / source URL for all 123.

---

## refs/dig/ — 8 images, two generations. All John's own.

**2026-08-04 (1 image, `dig-gallery-leg-breach.jpg`) is the ORIGINAL dig bar — brick barrier.**
**2026-08-07 (7 images) SUPERSEDES it on material language only: white destructible paneling over
an indestructible CYAN barrier, not brick** (`docs/design/dig.md` §6a, "art wins" rule). The older
image is demoted, not retired — it remains the bar for chunk scale, debris behaviour and staging,
none of which the new set improves on. ⚠️ **All 8 are generated images** — judge composition,
palette, chunk scale, staging and material *language* against them; do not judge fine surface
detail, and do not read softness or AI artefacts as art direction. Actual pixel dimensions are
given per image below; several of the new set are 1024–2000 px wide, not clean plates.

**Which one do I open?** — an agent should be able to answer without opening any of these:

| need | open |
|---|---|
| The single closest image to the new material target | `dig-gallery-sledge-crew.webp` |
| Composition / cyan-visible-through-a-hole at a distance | `dig-hall-multiarm-breach.jpg` |
| Multiple simultaneous digs in one room, then progression | `dig-ballroom-breach-early.webp` → `dig-ballroom-breach-wide.webp`, in that order |
| The macro layout idea (three rooms, one shell) | `dig-iso-cutaway.jpg` (clean) or `dig-iso-annotated.webp` (labeled — ignore its meter, see ⚠️ below) |
| The stage-gradient bar for `whitecyan-1` | `dig-barrier-stages.webp` |
| Chunk scale, debris behaviour, staging (still the bar for these) | `dig-gallery-leg-breach.jpg` |

---

**`dig-gallery-sledge-crew.webp`** — 2000×1125. **PRIMARY BAR for the new material language.** Gallery
hall, three robots with sledgehammers — one on scaffolding — hammering a huge ragged cyan-backed hole
in the wall; dust plume, white rubble on the marble/parquet floor, chandeliers and arched windows
read as our gallery. **Use it for:** the sledgehammer as tool, the white-paneling-over-cyan material
read in the act of breaking, multiple crew digging at once, chunk scale mid-swing.

**`dig-hall-multiarm-breach.jpg`** — 1024×576. A large multi-armed robotic figure standing mid-room in
an ornate hall blown open on two sides, cyan voids beyond both holes, a gilded doorway visible
through the left hole, rubble scattered on the floor. **Use it for:** composition (subject centred
between two flanking breaches) and the cyan-behind-the-wall read at a distance. ⚠️ **Do not read this
as a confirmed "hunter stage 3" sheet** — only one head and roughly four arms are legible from this
angle (more may be occluded behind the torso), short of the "two-headed six-armed" hunter stage 3
described in `docs/design/motion-hil-assessment.md`. Character identity is unconfirmed; the room
composition is what it is for.

**`dig-ballroom-breach-early.webp`** — 2000×1125. Red-curtained ballroom, checkerboard-and-parquet
floor, gilt chandeliers; roughly four robots (not six) hammering at two separate cyan-backed
openings — one large, one smaller. **Use it for:** multiple simultaneous digs in one room, cyan on
more than one wall at once.

**`dig-ballroom-breach-wide.webp`** — 2000×1125. Same ballroom (same curtains, chandeliers, floor),
shot from a higher, more elevated angle; the cyan aperture has grown to consume most of one wall and
wrap the corner pillar, with chunks visibly in flight. **Use it for:** progression — what "further
along" looks like on the same room. Pair with `dig-ballroom-breach-early.webp` as a before/after. ⚠️
Neither ballroom image counts to six robots (both are roughly four) and this "wide" one, not the
"early" one, is the more genuinely elevated/"from above" shot of the pair.

**`dig-iso-cutaway.jpg`** — 1000×563. Unlabelled isometric dollhouse cutaway of a three-room block —
gallery (staircase, portraits), ballroom (red curtains, checkerboard), and a dark wood-panelled room
with a fireplace — one continuous white shell with a cyan band running through the walls at the cut
plane, rubble spilling at the base. **Use it for:** the macro read of the whole layout idea.

**`dig-iso-annotated.webp`** — 1364×768. **THE DESIGN-INTENT DIAGRAM** — same cutaway, labelled
`INDESTRUCTIBLE GRAND BALLROOM`, `INDESTRUCTIBLE CYAN STRUCTURE` (×3), `DESTRUCTIBLE WHITE PANELING`,
confirming the read **ornate surface → white destructible body → cyan barrier**. **Use it for:**
material-language labels and room adjacency — the clearest single image for understanding the pivot.

🚨 **The `DESTRUCTION METER` widget (top-right, a partially-filled progress bar) is NOT a spec.**
Exactly like the older image's *"WALL SMASHED: 85%"* HUD (`dig.md` §6a.2), **a quantified readout
would delete the search mechanic** — reading how fast the wall gives way *is* the search heuristic.
John has confirmed **no numeric meter** (`docs/design/dig-campaign.md` §2.3, decision 3). Do not let
a future agent read this widget as a requirement.

**`dig-barrier-stages.webp`** — 1376×768. **The stage-gradient bar for `whitecyan-1`.** Four-panel
isometric diagram, "BARRIER DESTRUCTION": `STAGE 1 MICRO-FRACTURING` (magnified hairline cracks) ·
`STAGE 2 VISIBLE STRAIN & PITTING` (small holes, tiny cyan glimpses) · `STAGE 3 STRUCTURAL FAILURE` (a
robot mid-swing has broken a doorway-sized hole through the white paneling, exposing a full cyan slab
intact behind it) · `STAGE 4 DEEP COLLAPSE` (the white paneling is almost entirely rubbled away, the
cyan slab now fully exposed). **Use it for:** the four-stage progression of the *white paneling*
breaking away — the cyan slab reads as solid and intact in all four panels, consistent with
`dig.md`'s "the barrier itself stays undamageable." Not a contradiction of that rule; a match for it.

**`dig-gallery-leg-breach.jpg`** — 1024×576. Generated by John, 2026-08-04, the ORIGINAL dig bar,
now demoted to material only where the 2026-08-07 set disagrees (brick → white/cyan). ⚠️ **It is
1024×576, not 1920×1080 like the `bf1` plates** — do not judge fine surface detail against it, and do
not read its softness as an art direction.

**What it is:** a robot in `room.gallery` blowing a person-sized ragged hole in the wall, a detached
mint-green **leg** in the blast, brass gadget in hand, chunks in flight, rubble already settled on
the parquet. Portraits, arched windows and rug all read as our gallery.

**Still the bar for:** chunk scale and count (~40 visible fragments, largest ~25 cm, real size
variety), the ragged lip, the dust plume, persistent floor rubble, and the fact that **the robot
stands BESIDE the hole rather than square in front of it** — which is the composition `play-critic-8`
found the game cannot currently produce, because the player's body covers the centre third of the
aperture at the only station you can shoot from.

⚠️ **Two things in it are NOT the bar:**
- **The HUD** (*"WALL SMASHED: 85%"*) is generated furniture. **A numeric readout would delete
  `dig.md` §5's core mechanic** — reading how fast the wall gives way *is* the search heuristic.
- **The masonry/brick material is superseded** — see the white/cyan note at the top of this section.

**Not delivered — do not go looking for these.** John's original chat also described a UNIT-4H
turnaround sheet, a 4Humanity wordmark, and a hunter growth sheet (BASELINE/STAGE 2/STAGE 3). None of
the three landed on disk with this drop — only the 7 images above did. If they surface later: they
are character/logo art, not dig art, and **not a live bar this campaign** — art is frozen outside the
dig — index them accurately and say so rather than treating them as reference.

## refs/lath/ — 24 images. THE most important category.

The five wall stages are the project's hardest gate: a critic must name the stage from a
cropped screenshot with no context. These photographs are the ground truth for that.

**Use these — ranked, best first:**

| file | what it gives you | stage |
|---|---|---|
| `lath-kent.jpg` | **The stage-2 texture reference.** A clean full-frame field of horizontal laths, even gaps, warm bare timber, nail fixings visible, slight cupping and colour drift plank to plank. If you build one thing off one photo, build the lath field off this. | 2 |
| `lath-clay-plaster-ceiling.jpg` | **The best break edge in the set.** Plaster torn back over a ceiling leaving a ragged crumbling lip with lath exposed behind and a dark cavity. Shows exactly how the plaster edge should read: irregular, crumbling, never a clean line. | 1→2 |
| `lath-mcminnville-oregon.jpg` | Hole punched in a plaster wall, lath behind, plaster crumbs on the stair below. Shows the *silhouette* of a broken opening and that debris falls. | 2, 4 |
| `lath-and-plaster-wall.jpg` | Plaster mostly intact with one lath showing through — the stage-1→2 transition caught mid-way. Also the best look at plain lime plaster surface quality: trowel undulation, chalky, faintly crazed. | 1 |
| `lath-geograph-wall.jpg` | Full wall of exposed lath at an angle, with a stud visible. Good for how the field reads across a whole wall rather than a patch. | 2 |
| `lath-straw-lime-closeup.jpg` | Destroyed lath and straw/lime in close-up — splintered, fibrous, chaotic. Use for the 20 cm detail layer and for broken lath *ends*. | 2, 4 |
| `lath-tower-of-london.jpg` | **Bare framing against brick — the stage-3 reference.** Vertical studs, horizontal members, open cavity. Note how completely different the silhouette is from the dense horizontal lath field. | 3 |
| `demo-selective-12.jpg` | Plaster stripped back to brick with lath fragments and a ragged plaster margin. Good composite of several stages at once. | 1–3 |
| `demo-to-brick.jpg` | Room stripped to brick and lath around a window. Wide context shot. | 2–3 |
| `demo-selective-05.jpg` | Lath over stone, window opening, wide room context. | 2–3 |
| `lath-geograph-ceiling.jpg` | Lath ceiling with plaster partly gone. | 2 |
| `lath-japanese-wall-structure.jpg` | A *construction diagram* of a lath-and-plaster wall in section. Useful for understanding the layer order, not for texture. | all |

**Skip these — they are in the folder but not useful:** `demo-synagogue-01/02.jpg`,
`lath-eastgate-house.jpg` (building exteriors), `lath-metal-over-wood-01/02.jpg` (expanded
*metal* lath — wrong period and wrong material for this estate), `lath-vyne-restoration.jpg`
(scaffolding), `lath-hiroshima-burned-ceiling.jpg` (holes but heavily degraded/tinted),
`demo-selective-09/11/13.jpg`, `demo-ceiling-partial.jpg`, `demo-remaining.jpg` (mostly
structural timber, little plaster/lath read).

**What the photographs actually teach — the details a critic will look for:**
- **Plaster keys.** Wet plaster was squeezed through the gaps between laths and slumped
  over the back; when the face breaks off, those keys stay. This is the single detail that
  makes exposed lath read as real rather than as a wooden slat wall.
- **The break edge is never straight.** It crumbles, undercuts, and leaves a thin lip. Any
  stage boundary drawn as a clean line is an instant reject.
- **Debris obeys gravity.** Every photograph with a hole has crumbs, dust and fallen lumps
  on the floor or ledge directly below it.
- **Lath is not uniform.** Split, cupped, snapped ends, varying gaps, colour drift, nail
  heads and rust bleed at the fixings.
- **Colour separation between stages is large.** Plaster is chalky near-white/warm grey;
  lath is warm mid-brown; framing timber is greyer and coarser; the cavity behind is
  near-black. Those four values are what make the stages identifiable in a blind crop.

---

## refs/bf1/ — 22 images. Battlefield 1 "Ballroom Blitz".

Gilded ruined chateau ballroom. Use for: how much ornament a room actually carries, gilt
panelling against ruin, shell-damaged walls at a distance, chandeliers, tall arched windows,
parquet and marble. `bf1-ballroom-01..03.png` are clean 1920×1080 interiors — start there.
Primary bar for `room.ballroom`.

## refs/hitman/ — 20 images. Hitman 3 Paris, Palais de Walewska.

Grand atrium and staircase, geometric marble inlay floors, gilt-framed mirrors, crystal
chandeliers, silk damask salons. Primary bar for `room.gallery` and the material palette.

## refs/alien/ — 19 images. Alien: Isolation.

Darkness reference. Pools of light against near-black, deep falloff, volumetric shafts,
harsh practicals. Primary bar for `light.dark`. The lesson these carry: an *evenly dim*
room reads as unfinished, a room of hard contrast reads as dark.

## refs/marble/ — 30 images.

Slab textures (Carrara, Calacatta, Nero Marquina, bookmatched) plus historic geometric
floors (Ravenna and Firenze opus sectile, diamond chequers). `marble-navapark-calacatta-bianco.jpg`
is the one to judge Carrara veining against: **mostly clean white ground, a few bold
directional veins with thin tributaries, large empty areas.** The floor pattern references
(`floor-*.jpg`) are for the inlay layout, not the stone itself.
