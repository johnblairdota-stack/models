# Starter prompt for the next session

Copy everything below the line into a fresh context window.

---

Read `docs/handoff/player-pipeline.md` in full before doing anything. It is short and it is the
state of play. Then read `docs/design/player-material-spec.md` — that is my own art direction and
it is the **authority** on what material goes where. Where a measurement disagrees with it, it
wins.

I am attaching the art bar. That is the bar. Judge everything against it.

**Context in one line:** the player is a generated, Meshy auto-rigged, skinned character (10,378
tris, 15 clips, one file) wearing procedurally-masked materials driven by its skeleton, because the
GLB is one primitive with zero material slots. The surface has been through five rounds and the
chrome now measures on the art. The next job is the **fine detail** — actuator rings, wrist rings,
calf panel, head ventilation, spine ridges, shoulder fixtures, exposed actuators, foot-crease
chrome, hip and shoulder detach creases — using the `aBoneLocal` attribute that already ships.

## Ground rules that are not negotiable

- **I judge how things look. You do things that can be checked.** Don't run long critique loops to
  decide whether something is attractive — show me and ask.
- **Cap any iteration loop at three rounds.** If it isn't there, the problem is upstream.
- **A number hitting its target is NOT evidence it looks right.** This has now bitten five rounds
  running: the best-scoring variant has photographed as cracked porcelain, electrical tape, a flat
  grey tube, a near-black ribbed tube, and a pure black frame the harness reported as a success.
  Ship a picture with every claim, and say plainly when the best-scoring variant is unshippable.
- **Sweep every free parameter of a measurement before quoting it** — colour cut, crop split, band,
  reference crop, camera angle. Quote only values that agree across 2+ settings and name the one
  that disagreed.
- **Compare from all four reference angles**, never one elevation: `?azim=0/90/-90/180` against
  `assets/mv/player/baseline_{front,side-left,side-right,back}.png`.
- **Every guard needs a control you have watched fail.**
- **I don't use a terminal.** Give me double-clickable `.bat` files and URLs, as prose — never a
  shell command in a code block.
- Verify before claiming. Run it the way I run it: through the `.bat`, on the production build.

## How to look at it

    MSYS_NO_PATHCONV=1 node harness/shoot.mjs --view mesh.animated \
      --extra "solo=1&clip=merged&anim=Alert&label=0&azim=0" --out "<abs path>.png"

`?solo=1` is essential — without it the rig sits at x=0.75 beside the old robot and every
measurement ray misses. `?bg=ff00ff` gives a flat chroma for masking; the default background is a
gradient and a naive mask selects the whole frame. I play it with **PLAYMESH.bat**.

## Two decisions waiting for me

1. **Absolute or ratio targets?** The art's chest measures 162.8 and ours 230.1 — a 67-level
   exposure gap. By ratio our arm/chest is 0.550 against the art's 0.739. Rounds so far chased
   absolute numbers for continuity; the last builder thinks ratios are the honest comparison. Ask
   me before spending a round on either.
2. **The swing clips.** Neither is a wall swing — both are ground chops that put the hammer head
   below the floor. The fix is a purpose-made clip from Meshy's Text-to-Motion, which we have never
   tried. Ask before spending credits.

Start by telling me what you think the highest-value next move is and why, then wait.
