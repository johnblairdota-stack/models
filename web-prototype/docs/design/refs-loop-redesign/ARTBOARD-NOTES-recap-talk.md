# Recap + talk chrome — artboard notes

Playtest fix on top of Direction B (rundown rail, PR #36). Palette and rail stay. This file is the recap density and the talk-beat safe zones.

## The problem

On a 16:9 TV:

1. **Recap scrolled.** Outcome / camera / runner / alarms were a single column of 84px cards plus a 120px countdown plus the show line. `.night-main` is overflow-auto off the talk beats, so the sofa had to scroll a 10-foot UI.
2. **Talk plates sat in the ballroom picture.** Debrief / Reckoning / Vote / Execution painted noms, tallies, verdict, and the clock as an absolute inset overlay over `.talk-frame`. The follow canvas is a body-level layer at z-index 5; `.night` is z-index 1. Anything that shares the frame rect is under the seated chairs.

## What shipped

Reserved chrome around the picture, not on it. Recap is a lower-third strip.

| Surface | Picture | Chrome |
|---|---|---|
| Recap | none (still not a talk beat) | Compact 4-across fact row + modest clock. `on-recap` hides the show line and overflow-hides `.night-main`. |
| Debrief | ballroom well | Top under rail: mini recap + countdown. Bottom: nameplate / kicker. |
| Reckoning / Vote | ballroom well | Same top band. Noms / tallies in a **side column**. Bottom: nameplate. |
| Execution / Verdict | ballroom well | Same. Verdict plate in the bottom band, not over the chairs. |

The follow layer still sizes to `.intro-frame.talk-frame`. That rect is now the remaining well after the bands, so chairs cannot cover text even though night stays under the canvas.

Rail, tokens, builders: unchanged contract. `look.js` SHOW_CHROME_CSS grew the recap grid and the talk bands; `night-skin.js` interpolates it. No hex in the chrome string. No backticks in CSS comments.

## Before / after

**Before:** Recap was a scrolling stack of huge cards. Talk chrome shared the full-bleed 3D frame with the seated circle.

**After:** Recap is one viewport, denser type, lower-third. Talk chrome is top-under-rail / side column / true lower-third. Ballroom stays the picture.

## Out of scope (still true)

Phone redesign. Guide map on the TV. Evil on nameplates. CAUGHT. Casting depth. Direction B rail (already shipped). Recap *button* (still gone; ghost "Run" is recovery only).
