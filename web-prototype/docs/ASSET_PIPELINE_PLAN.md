# Run Robot Run — Asset Pipeline Plan

> ⚠️ **THIS IS THE AUTHORITY, AND IT SUPERSEDES THE `rrr-pipeline` SKILL FOR NEW ASSETS.**
> On 2026-08-15 an agent was asked to "run the Asset pipeline plan MD into practice", could not
> find this file, silently substituted the `rrr-pipeline` skill — which describes the OLD
> process — and ran ~20 rounds of builder/critic on `hunter.2`/`hunter.3` before John noticed.
> That is the exact failure this plan exists to prevent. If you cannot find a document you were
> asked to follow, STOP AND ASK. Do not substitute the nearest thing in the repo.

**Purpose:** get new assets close to your bar *before* they enter the Claude iteration loop, so the loop only handles the last 10% instead of all of it.

**The core rule:** you judge how things look. Claude does things that can be checked. Generation happens on rented hardware for pennies. Right now you're paying Opus tokens to do the one job it's worst at — deciding whether something looks good.

---

## Before you start (one-time setup)

Do these once. They pay off on every asset forever.

### 1. Write the style contract

One page. Never changes. Everything gets measured against it.

- Triangle budget per asset class (hero character / enemy / prop / background)
- Unit scale — 1 unit = 1 metre, decide and stick to it
- Where the origin point sits (feet for characters, base centre for props)
- The colour palette — 8–12 colours, no more
- Material names — every asset uses the same short list
- Naming convention for files

This document is what makes disparate assets look like they belong to one game. It matters more than mesh quality.

### 2. Build the conditioning script

One Blender script, run from the command line, that takes any raw 3D file and spits out a game-ready one:

- Applies transforms, sets the origin per the contract
- Squashes the triangle count to budget
- Renames materials to the shared palette list
- Generates a simple collision shape
- Compresses and exports to GLB

Have Claude Code write this once. Then it's just a command you run. **This is the single highest-value thing to build** — it's the difference between assets taking an hour each and taking five minutes each.

### 3. Set up a rented machine template

RunPod or Vast.ai, roughly $0.30–0.40/hr, billed by the second. Get an image-to-3D setup working once, save it as a template. Then future sessions are: spin up, work, shut down.

---

## The pipeline (per asset)

### Step 0 — Decide if it even needs the loop

Be honest about this. Most assets don't.

| Asset type | Route |
|---|---|
| Background clutter, furniture, fences, generic props | Free CC0 packs (Kenney, Quaternius, Poly Haven). Zero effort, better topology than AI gives you. |
| Repeated architecture — walls, floors, panels, trim | Build one small modular kit properly. Reuse forever. |
| Hero assets — characters, the robot, key story objects | Full pipeline below |

Only hero assets earn the iteration loop. If you find yourself perfecting a filing cabinet, stop.

### Step 1 — Get it out of your head and into words

For assets that don't exist yet, write 4–6 lines before touching any tool:

- What is it, in one sentence
- What silhouette should it read as from 30 metres away
- What does the player need to understand instantly (is it dangerous? climbable? a hiding spot?)
- Mood in three adjectives
- What it must NOT look like

Keep this. It becomes the checklist the critic uses later, which is how you stop the loop drifting off course.

### Step 2 — Concept image

Feed that description into your image generator. Ask for:

- Three-quarter view, plain or transparent background
- Full object visible, nothing cropped
- Flat even lighting (baked-in shadows wreck the 3D conversion)
- A-pose or T-pose for anything you'll want to animate

**Generate 8. Look at them side by side. Pick one.** Ten seconds of your time, zero tokens. This is the highest-leverage moment in the whole pipeline — the quality of this image sets the ceiling for everything downstream.

If none are close, fix the *description*, not the image. Go back to Step 1.

### Step 3 — Turn one image into several views

Multi-view input produces dramatically better geometry than a single picture, because the model isn't guessing at the back. Ask your image generator for front, side and back views of the chosen concept, keeping style and proportions consistent.

Worth the extra couple of minutes every time.

### Step 4 — Generate the 3D

On the rented machine. TRELLIS 2 or Hunyuan3D.

**Generate 6–10 variants.** They cost you effectively nothing. Then eyeball them and pick one.

This is the mindset shift that fixes your budget problem: when attempts are free, you stop being precious. Make thirty, bin twenty-nine.

### Step 5 — Run the conditioning script

One command. Comes out sized right, named right, at budget, ready to drop in.

Nothing to judge here. It either passes the checks or it doesn't.

### Step 6 — Re-material in Three.js

Strip or heavily reduce the baked-in textures. Re-apply materials from your shared palette, lit by your one shared lighting setup.

This is what stops a pile of separately-generated assets looking like a pile of separately-generated assets. For a stylised horror look, silhouette plus a good colour ramp does most of the work — which means merely-decent meshes end up looking great.

### Step 7 — *Now* run the loop

Only now. And with tight rules.

**Give the critic the Step 1 description and the Step 2 concept image as the target.** It's comparing against something fixed, not vibing.

**Give it a job list it can actually check:**
- Does the silhouette read at distance
- Is it within triangle budget
- Do materials come from the approved palette
- Is scale right next to the player character
- Does it read as [dangerous / climbable / whatever] from gameplay distance

**Cap it.** Three rounds. If it's not there after three, the problem is upstream — go back to Step 2 with a better concept image. Dozens of rounds means the loop is being asked to solve a problem it can't solve.

---

## What changed vs. what you're doing now

| Now | New |
|---|---|
| Start from a basic shape | Start from a chosen-by-you concept |
| Claude judges aesthetics | You judge aesthetics |
| Dozens of rounds | Three, capped |
| Every asset gets the full treatment | Only hero assets do |
| Iteration costs tokens | Iteration costs cents |
| Assets styled individually | Assets styled by one shared contract |

---

## Rough costs per hero asset

- Concept images: a handful of image generations
- 3D generation: under $1 of rented time, covers a whole batch
- Conditioning: free, it's a script
- Loop: 3 rounds instead of 30

## First three things to do when you come back

1. Write the style contract
2. Have Claude Code build the conditioning script
3. Run one asset end-to-end and time it

Don't build the whole system before testing it. One asset all the way through will show you which step is actually slow.
