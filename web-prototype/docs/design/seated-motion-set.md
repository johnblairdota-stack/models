# The seated motion set — for the eight seats facing each other

John, 2026-08-17: *"I'm planning something for the 8 seats facing each other"* and *"I want as many as
there are for different emotions and communication while sitting in the seats."*

This is the shopping list, read off Meshy's own preset motion library on 2026-08-17. **Nothing has
been fetched yet** — see the ordering rule below, which is the whole reason.

---

## ⚠️ THE ORDERING RULE, AND IT IS JOHN'S DECISION, NOT A PREFERENCE

**Fetch these AFTER the new model exists, never before.** Meshy applies a motion to a SELECTED
model — the Animate panel refuses to do anything with "Select Model / Textured Model to Rig" until
one is chosen. Pull these onto the current body and every clip has to be bought again for the new
one.

The sequence:

1. the unlit reference render (`progress/shots/unlit/`)
2. the new Meshy model generated from it
3. **then** these motions applied to THAT model, exported as ONE merged GLB together with the
   existing locomotion and combat set
4. `tools/unwrap_player.py` then `tools/smooth_normals.py` on the download

⚠️ **Step 4 is not optional and is easy to forget.** A fresh Meshy download has neither the
cube-projected UV atlas the panel-seam network needs, nor the normal merge — and the normal merge
is worth a quarter of the whole surface's shading defect (see `player-pipeline.md` section 7).
Skipping it silently loses both.

## What already exists locally, unused

`public/models/anim/Meshy_AI_Animation_Stand_Cheer_and_Sit_Down_withSkin.glb` carries one clip,
`Stand_Cheer_and_Sit_Down`. It is **not** in the merged 15 and has never been wired. It is a
stand-then-sit combo, not a seated idle, so it does not cover the loop.

None of the shipped 15 clips is a sit.

## EMOTION AND COMMUNICATION, SEATED — the set John asked for

| clip | what it reads as |
|---|---|
| `Sitting Answering` | responding, being spoken to |
| `Sitting Clap` | approval, applause |
| `Sit Cheer with Left Hand` | celebration |
| `Sit Shout Hands On` | anger, alarm |
| `Sit Finger Wag No` | refusal, disagreement |
| `Sit Thumbs Up Right` | assent |
| `Sit Hands on Head Lean` | despair, frustration |
| `Sit on Chair Arms Crossed` | closed, sceptical |
| `Sit and Doze Off` | bored, asleep |
| `Sit and Drink` | idle business |
| `Sit Dodge` | startled reaction |
| `Angry to Tantrum Sit` | rage |
| `Sit Cross-legged` | relaxed posture |

## THE LOOP — without one of these the seats have nothing to do between beats

`Chair Sit Idle Female` · `Chair Sit Idle Male`

## GETTING IN AND OUT

`Walk to Sit` · `Step to Sit Transition` · `Stand to Sit Transition` · `Look Back and Sit` ·
`Sit to Stand Transition` (two variants) · `Stand Wave and Sit Down` · `Stand Clap and Sit Down`

## Not relevant despite matching the search

`Situps` (exercise) · `Sit Lie Bed` (bed, not a seat)

---

## Notes for whoever wires these

- **The search box is FUZZY, not substring.** "chair" returns Cheer / Carry / Cherish. "sit" is the
  query that surfaces the seated set; do not trust a term-by-term sweep to be exhaustive.
- Meshy's library is alphabetical and virtualised, so a `read_page` only sees what is scrolled into
  view — screenshot and scroll, or search.
- **Eight seats facing each other will read as eight clones unless the phases are offset**, not just
  the clips. Whatever drives them needs a per-seat time offset as well as a per-seat clip choice;
  the existing `SWINGS` list in `mesh-avatar.js` is the precedent for a varied set, and its lesson
  applies here — **each entry's own timing is a property of the clip and must never be shared**.
- Credits: John had 4,150 on 2026-08-17. Per-motion cost was NOT read — read it back to him before
  applying anything.
