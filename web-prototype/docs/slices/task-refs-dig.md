# Slice: ingest John's nine dig images and make them cheap to look at

**Files you may edit — nothing else:**
- `refs/**` — new image files under `refs/dig/`, plus `refs/REFERENCE_INDEX.md` and
  `refs/_index.tsv`
- `refs/_sheets/dig.png` (you generate it)

**Files other agents own this wave — do not touch:** `HANDOFF.md` and `docs/handoff/**` belong to
`handoff-diet-1`; `docs/PLAN.md` and `progress/**` belong to `board-audit-2`. **Touch no file under
`src/` or `harness/`.**

Decisions here are made. If a stated fact turns out to be wrong, say so in your report rather than
diverging silently.

---

## 1. Why this matters

John generated nine images on 2026-08-07 that **re-point the whole campaign**
(`docs/design/dig-campaign.md`). They currently exist only in a chat transcript. He has been asked
to drop them on disk, most likely at **`refs/dig/incoming/`**.

Until they are ingested and indexed, **no slice in this campaign may cite the new art as a bar** —
which means Wave 3 cannot start. This slice is small and it is on the critical path.

There is exactly **one** existing dig reference (`refs/dig/dig-gallery-leg-breach.jpg`, John's own,
2026-08-04) and it is already indexed with a good entry. **Match that entry's shape.** It is the
house style and it is the reason the index works.

## 2. What the nine images are

Identify each from the file itself; this is what to expect, and what each one is FOR:

1. **Hero — six-armed corrupted hunter mid-room**, ornate hall blown open, cyan voids beyond the
   holes, rubble everywhere. *Composition and the cyan-behind-the-wall read.*
2. **Gallery hall, three robots with sledgehammers**, one on scaffolding, huge ragged cyan-backed
   hole, dust plume, white rubble on marble. **This is the single closest image to the campaign's
   target and probably the primary bar.**
3. **Ballroom from above, six robots hammering**, chunks in flight, cyan voids on two walls.
   *Chunk scale and count in flight; multiple simultaneous digs.*
4. **Same ballroom, wider/later**, larger cyan apertures. *Progression — what "further along" looks
   like.*
5. **Isometric cutaway of a three-room block**, white shell, cyan interior faces, rubble spilling.
   *The macro read of the whole layout idea.*
6. **The same isometric, annotated**: `DESTRUCTIBLE WHITE PANELING` · `INDESTRUCTIBLE CYAN
   STRUCTURE` · `INDESTRUCTIBLE GRAND BALLROOM` · a `DESTRUCTION METER` bar top-right. **This is
   the design-intent diagram — the most important of the nine for understanding, and the one with a
   trap in it (see §6).**
7. **UNIT-4H turnaround sheet**, four views, clean baseline robot.
8. **The 4Humanity wordmark** on white.
9. **Hunter growth sheet** — BASELINE / STAGE 2 / STAGE 3 turnarounds.

Plus a **four-panel barrier-destruction diagram**: `STAGE 1 MICRO-FRACTURING` · `STAGE 2 VISIBLE
STRAIN & PITTING` · `STAGE 3 STRUCTURAL FAILURE` · `STAGE 4 DEEP COLLAPSE`, isometric, white walls
with cyan cores. *This is the stage-gradient bar for `whitecyan-1`.*

⚠️ If what is on disk does not match this list, **index what is actually there and say so in your
report.** Do not force a file into a description.

## 3. What to do

1. **Move them from `incoming/` into `refs/dig/`** with descriptive kebab-case names —
   `dig-hall-sledge-crew.png`, `dig-iso-annotated.png`, `dig-barrier-stages.png`, and so on. The
   existing `dig-gallery-leg-breach.jpg` is the naming precedent. **Move, do not copy**; leave
   `incoming/` empty and remove it.
2. **Add each to `refs/_index.tsv`** in the existing format — `path⇥WxH⇥size⇥source`. These have no
   URL: use `generated-by-john-2026-08-07` in the source column.
3. **Write the `refs/REFERENCE_INDEX.md` section.** `refs/dig/` already has an entry saying "1
   image"; rewrite that heading and extend the section. For each image, in the style of the existing
   entry: what it is, **what it is FOR**, and any ⚠️ about what it is *not* for.
4. **Build the contact sheet:**
   ```bash
   node harness/sheet.mjs --dir refs/dig --out refs/_sheets/dig.png --cols 3 --width 1600
   ```
   Then add it to the "Sheets already built" line near the top of `REFERENCE_INDEX.md`.

## 4. The bar

The existing `refs/dig/` entry in `REFERENCE_INDEX.md` (the `dig-gallery-leg-breach.jpg` block).
Open it first. It does three things this slice must reproduce: it says what the image contains, it
says what to judge against it, and it **warns explicitly about the parts that are not the bar.**

## 5. Presentation

- The section must be readable **as a decision aid, not a catalogue.** An agent lands here asking
  "which one image do I open?" and must be able to answer without opening any.
- Lead the section with a one-line statement that these nine **supersede** the 2026-08-04 dig
  reference on material language (white/cyan, not brick) while that older image remains the bar for
  chunk scale, debris behaviour and staging.

## 6. Traps

- 🚨 **The `DESTRUCTION METER` in image 6 is not a spec.** `dig.md` §6a.2 already argued this once
  about the older image's "WALL SMASHED: 85%" HUD: **a numeric readout deletes the search mechanic**,
  because reading how fast the wall gives way *is* how you find the interconnect. Index it with that
  ⚠️ attached, and note it is pending John's Phase 0 decision 3
  (`docs/design/dig-campaign.md` §2.3). **Do not let a future agent read it as a requirement.**
- ⚠️ **These are generated images.** Judge composition, palette, chunk scale, staging and material
  *language*. Do not judge fine surface detail against them, and do not read softness or AI
  artefacts as art direction. Check the actual pixel dimensions and put them in the entry —
  several are around 1024–2000 px wide, not clean 1920×1080 plates.
- ⚠️ **Images 7, 8 and 9 are character/logo art, not dig art.** They are relevant to the *paused*
  logo and hunter work, not to this campaign (art is frozen). Index them accurately and say so, so
  nobody treats the hunter sheet as a live bar this campaign.
- ⚠️ **Quote Windows paths, or use forward slashes.** `harness/sheet.mjs`'s own docstring warns that
  an unquoted Windows path gets its backslashes eaten and the file silently lands in the repo root
  — where there are already 55 stray PNGs from exactly this mistake.

## 7. Verify

```bash
ls -la refs/dig/
node harness/sheet.mjs --dir refs/dig --out refs/_sheets/dig.png --cols 3 --width 1600
```

**What to look at:** open `refs/_sheets/dig.png` — **once**. Every tile must be identifiable from
the sheet alone at that size; if one is not, it needs a better caption or a larger `--width`. That
sheet is how every later critic will look at this set, so it has to work.

Then re-read your own `REFERENCE_INDEX.md` section cold and ask: *if I only got to open one of
these, would this text tell me which?*

## 8. Regression gate

`refs/REFERENCE_INDEX.md` is read by every critic in the project. Confirm you have not disturbed
the existing sections (`bf1`, `lath`, `alien`, `hitman`, `marble`) or the token-cost preamble at the
top, and that the image count in the opening line is updated from 115 to the new total.

## 9. Report back

The final filename → description mapping; the sheet; the actual dimensions of each image; anything
in the nine that **contradicts** something in `docs/design/dig.md` (the white/cyan-versus-brick
conflict is known and expected — report any others you spot). Flag anything John dropped that is not
one of the nine.

**Do not set a board verdict.** Optionally:
```bash
node harness/status.mjs note "refs-dig-2: 9 new John images indexed under refs/dig/, sheet built"
```
