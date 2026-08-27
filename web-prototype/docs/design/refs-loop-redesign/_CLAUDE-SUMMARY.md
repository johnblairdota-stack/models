Done. Here is your design canvas:

**https://claude.ai/code/artifact/48c34074-aff5-4d50-b63b-71fd22981426**

## What I did

I ran `/design` for the TV chrome, as the prompt says. Nothing in the code changed yet.

The canvas has **two pages**:
- **Page 1 — Pick a direction.** Three options, all drawn on the same beat (Expedition), because that is where chrome and picture fight.
- **Page 2 — The night.** All ten beats drawn in the leading option: Lobby, Casting, Expedition, Recap, Debrief, Reckoning, Vote, Execution, Verdict, Reunion.

I cut a clean frame out of `11-tv-run-chrome.png` and used it as the live picture. So the chrome sits over the real game, not a grey box.

I looked at every board in a browser before saving. They all render correctly.

## The three options

- **A — Camera Bug.** Chrome shrinks to a corner. Picture is king. But you cannot tell the beat from the couch.
- **B — Rundown Rail** ⭐. The shooting schedule sits across the top all night. Current beat lit, its bar draining.
- **C — Studio Card.** Amber spine, huge beat name and clock, picture inset. Loudest. But the picture loses a third of the screen.

**I would go with B.** `phases.js` already *is* the game. The rail is that file drawn on the TV. It shrinks to a 22px ribbon over the run and opens up on the talk beats. One part teaches the whole night. A is just B with the rail deleted, and C is B with the furniture turned up — so switching later is a CSS swap, not a rebuild.

## Also done

`docs/design/prime-time-loop-redesign-plan.md` now has the chosen-direction notes, the colour token table (2 new tokens proposed: `--night-rec`, `--night-scrim`), and the type ramp.

Working files live in `docs/design/refs-loop-redesign/artboards/`. Rebuild them with:
```
node docs/design/refs-loop-redesign/artboards/_build.mjs
```

## What you do now

Open the link. Look at page 1. Tell me **A, B, or C**.

Then I do one of two things:
1. **Build it** — the PR into `night-skin.js` + `party-host.js` for Lobby, Expedition, Debrief/Reckoning/Vote.
2. **Draw the phones first** — `/design` pass 2, the 390×844 pads.

I would build the TV first. It is the highest playtest leverage, and the phones should copy a settled TV language, not guess at one.