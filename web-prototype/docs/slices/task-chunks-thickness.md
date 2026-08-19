# Slice: it reads as 2D layers peeling, not thick chunks falling off

---

# 🔴 ROUND 2 BRIEF — read this section first. `critic-dig-1` filed REJECT 24.

Round 1 built real geometric thickness, a ray-marched cut face, per-blow slabs and the estate skin.
**The build is green and the dig band held at 67 s. Two fixes were credited. The round still missed,
and the critic's diagnosis of why is the important part.**

## 🚨 THE INSIGHT THAT REFRAMES THE PROBLEM

> *"it's being asked to imply depth through blur alone, which can't work without per-layer albedo.
> The real fix is giving each depth band a distinct colour."*

**Round 1 treated thickness as a GEOMETRY and SHADING problem. The reference solves it as a COLOUR
problem.** In `dig-gallery-sledge-crew.webp` every hole is a crisp jagged **white** plaster rim
directly against a **saturated flat teal** fill — a hard material break with no ambiguity.
`dig-barrier-stages.webp` confirms the wall is a literal sandwich: white shell, teal structural core.

Our render is **one continuous hue** — the cut face is the wall's own colour, lightened. The critic
cropped a hole out of context (no HUD, no floor, no rim) and **could not identify it as a hole in a
wall at all.** That is an identification-gate FAIL; by the skill's rule, identifying by elimination
does not count.

**🎯 ROUND 2'S HEADLINE: give each depth band its own ALBEDO.** Ornate boiserie → **white
paneling** → **cyan structure**, as three materials that look nothing like one another — not one
surface getting lighter with depth. Round 1's ray-marched front, gradient normals and real thickness
are correct groundwork; they simply have nothing to reveal yet.

## 🚨 ANSWER THIS BEFORE FIXING ANYTHING

**Cyan is not visible in a single one of the 12 `thick-*` captures** — the 6 nominated plus 6 more
angles the critic checked, including full head-on. The reference's most identifying signature is
absent from the entire evidence set.

⚠️ **Do not assume that is a rendering bug. Determine which it is and say so:**
- **(a)** the captures never dug deep enough to expose the barrier at −146 mm → the scenario is at
  fault. **Then fix `chunk-thick.mjs` to include a fully bottomed-out spot** — a round of evidence
  with no cyan cannot be judged on the campaign's central material.
- **(b)** the barrier genuinely is not rendering, is occluded by the removal front, or is invisible
  against the cavity → **that is the bug and it outranks everything else.**

## The ranked defect list — most damaging first
1. **Cyan invisible.** Rank 1: it is the reference's whole signature.
2. **The cut face is unlayered** — one continuous untextured gradient, no material or colour
   transition anywhere. Fix with per-band albedo.
3. **`uCutSoft` too large AND the wrong tool.** Verdict: **cut it hard, to about a third of 0.11** —
   but sharpening alone cannot carry this. Sharpen *and* colour the bands.
4. **The reveal step is illegible.**
5. **Half the capture set is too dark to judge** — a critic cannot judge what it cannot see, and
   this wasted half the evidence. Fix the capture staging/lighting.

## Credited — keep these, do not regress
- **The debris chunk shapes.** The slab work landed; rubble reads as genuine broken masonry.
- **The jagged outer rim** — *"chunks bitten out, not a punched circle."* The radial-ramp and
  corner-saturation fixes are visible and working.

## Round 2 deliverables
Grazing-angle captures again, **plus at least one frame showing ornate → white → cyan in a single
image** — that frame is what John will actually look at. Keep the dig band at 45–75 s (currently 67).
⚠️ Round 1's **`dig-promoted` failure** (`ballroom.north` 639/625, no baseline taken) and the
**unmeasured GPU time** are still open — do not let round 2 bury them.

---


**This slice runs in a BUILDER↔CRITIC LOOP.** You are the builder. A blind critic (`critic-dig-*`)
will judge each round against John's reference art and hand you back a defect list. **The loop
continues until the critic says it is close to the art.** Expect several rounds; land a coherent
improvement each round rather than attempting everything at once.

**Files you may edit:**
- `src/materials/breakmask.js` — the cut edge
- `src/materials/surfaces/wallstages.js` — `BREAK_FIELD` / `raggedBreak`, the silhouette's source
- `src/destruction/debris.js` — the chunks that fall
- `src/game/wall.js` — where a blow becomes geometry and debris
- `src/destruction/damagefield.js` — only if thickness genuinely needs a new channel

**Files other agents own — do not touch:** `src/game/player.js`, `locomotion.js`, `weapons.js`,
`sledge.js` (`sledge-1`); `src/audio/audio.js` (`audio-3`); `src/game/room.js` beyond what already
exists.

Decisions here are made. If a stated fact turns out to be wrong, say so in your report rather than
diverging silently.

---

## 1. The verdict this slice exists to answer

John played the free-form dig build (2026-08-08) and said:

> *"the destruction didn't feel like chunks coming off the wall. It felt like a 2d mesh taking off
> layers where I was clicking… thick chunks falling off the wall."*

**He is describing the mechanism exactly, which makes this diagnosable rather than vague.**

## 2. What is actually happening — verified, start here

**The wall has no thickness anywhere.** A destructible surface is a stack of **flat nested planes**,
and destruction is `discard where breakOrder < damage`. So:

1. **The cut edge is zero-thickness.** The "lip" in `breakmask.js` is a *shading* trick — a darkened,
   roughened band with an undercut painted on a plane. It has no silhouette and no side face. **At
   any angle off perpendicular, a real slab shows its cut face. Ours cannot, because there is
   nothing there.**
2. **Removing material reveals the next flat layer**, which is precisely "a 2D mesh taking off
   layers."
3. **The falling chunks are unrelated to the hole.** ⚠️ **The chunks themselves are NOT the problem —
   `debris.js` already spawns fractured solids with real volume** (`plasterChunk` is a fractured
   icosahedron, `lathChunk` a fractured box; its header records "NO THICKNESS" as a bug already
   fixed). The problem is that **nothing connects the chunk that flies to the material that left the
   wall.** They read as a particle effect playing near a fading texture.
4. **The silhouette is scalloped, not torn.** Independently confirmed by the orchestrator on
   `progress/playtest/game.play.dig-free-*.png`, and **already a known defect**:
   `breakmask.js`'s own header records the field "thresholded into scallop lobes", and the old
   `PLAN.md` Phase 3 called the break edge "CG-soft… smooth rounded cloud/scallop lobes" and flagged
   it as cross-cutting. **Free-form digging promoted it from background flaw to the thing John looks
   at most.**

## 3. What to build — the goal is decided, the technique is yours

**GOAL: a blow takes a THICK PIECE off the wall, and you can see the wall is thick where it broke.**

⚠️ **The technique is deliberately NOT specified, because choosing it IS the work** and it needs
measurement rather than assertion. Candidates, with what each buys:

| approach | buys | costs |
|---|---|---|
| **Rim geometry generated from the damage contour** | a real silhouette — the hole edge has depth from every angle | geometry per damaged face, rebuilt as the contour moves; draw calls |
| **Parallax / relief mapping into the cavity** | depth into the hole for near-free | no silhouette change — still flat at grazing angles |
| **Giving each layer real box thickness (a shell)** | side faces exist at the cut | the mask must cut the shell coherently, not just its front face |
| **A detaching chunk mesh matching the removed patch** | the piece that falls IS the piece that left | one mesh per blow; must be instanced |

**A combination is expected. The strongest single move is likely the last one** — spawn the falling
chunk *shaped and sized to the patch that was just removed*, at the impact, with the same material,
so cause and effect are visibly the same object. That alone converts "texture fades, particles play"
into "a piece came off."

⚠️ **Whatever you choose, the constraint is absolute: the ragged break edge, lip and undercut must
survive.** They carry `wall.sheet` PASS 78, the board's only material PASS lineage. **Do not trade
the edge quality for thickness — the goal is both.**

**Also fix the scalloped silhouette.** `BREAK_FIELD` in `wallstages.js` is the source, and its own
comments record the previous fix attempt. At the scale a person-sized hole is now viewed, the field
needs structure between "a fifth of a tile" and "a texel", or the threshold produces lobes.

## 4. The bar — this is what "close to my art" means

```bash
node harness/sheet.mjs --dir refs/dig --out refs/_sheets/dig.png --cols 3 --width 1600
```
**Read the sheet once. Do not open the originals.** Primary: **`dig-gallery-sledge-crew.webp`**
(2000×1125) and **`dig-barrier-stages.webp`**.

What the art shows, and what to match:
- **Chunks with visible THICKNESS** — slabs and blocks with depth, not flakes.
- **Real size variety** — roughly 40 fragments, the largest ~25 cm.
- **A hole whose rim shows the wall's cross-section**, so you can see how thick the wall is.
- **Rubble accumulating on the floor**, recording what was done.
- ⚠️ **NOT the bar:** the `DESTRUCTION METER` overlay (John has ruled it out), and fine surface
  detail (these are generated images — judge composition, chunk scale, palette, staging).

## 5. Traps

- ⚠️ **Every particle and every chunk instanced from the start.** The skate drift trail cost
  **+82 draw calls for 76 sprites** and is the standing warning.
- 🚨 **DRAW CALLS ARE AT 605 OF 625 — twenty of headroom, and it is already the top open risk.**
  A damaged face draws up to 6 own meshes. **Rim geometry could blow this instantly.** Measure with
  `dig-promoted.mjs` and report the delta; if you spend headroom, say how much and on what.
- ⚠️ **GPU time is unmeasured** and a fully dug face already adds 3 coplanar 5.72 × 2.80 m
  alpha-tested planes against a 1.39 ms budget. **Fill rate is the risk nobody has priced.**
- ⚠️ `fbmT`'s narrow bell around 0.5 — gates written at 0.9 never fire.
- ⚠️ Never a backtick inside a GLSL template literal; never a GLSL reserved word as a variable.
- ⚠️ `onBeforeCompile` hands you unresolved `#include`s — a replace that misses fails silently.
- ⚠️ **Parallel agents corrupt each other's playtests through HMR** even on a private port — inject
  the `@vite/client` stub and confirm "1 navigation" in the output.

## 6. Verify

```bash
node harness/playtest.mjs --view game.play --script harness/scenarios/dig-free.mjs --port 5331 --q "seed=s4&dig=1"
node harness/playtest.mjs --view game.play --script harness/scenarios/dig-promoted.mjs --port 5332 --q "seed=s4&dig=1"
node harness/mechanics.mjs
```

**What to look at — and this is the whole test:** capture a hole from **a grazing angle, not
head-on**, and ask whether **a stranger would say the wall has thickness.** Head-on hides exactly
the defect this slice is about. Then capture the moment of a blow and ask whether the piece flying
away plausibly came out of the hole that just appeared.

⚠️ **`harness/scenarios/*.mjs` are driven by `playtest.mjs`** — run one directly and it prints
nothing and exits 0, which looks exactly like a pass.
⚠️ **Loading `game.play` takes 75 s+**; under concurrent agent load it can exceed 180 s.

## 7. Regression gate

- `wall.sheet` unchanged with `?dig=0`. ⚠️ **Its stored reference predates the 2026-08-05
  determinism fix — RE-TAKE the reference first, then diff.** Diffing against the stored one is
  diffing against noise.
- `mechanics.mjs` 11/11 · `escape.mjs` 20/20 · `dig-free.mjs` 15/15 · `dig-toggle.mjs` 14/14 on
  `?dig=bays`.
- **The dig band must survive: 61–67 s to get through, John's target is 45–75 s.** If thickness
  changes how fast material comes off, **retune to hold the band and say what you changed.**

## 8. Report back, every round

What you changed, the draw-call and GPU delta, the measured dig time, and **a grazing-angle capture**
for the critic. Say plainly what you could not achieve. **Builder ceiling is PASS — only a
`critic-*` agent sets WOWED**, and this slice is explicitly judged by one.
