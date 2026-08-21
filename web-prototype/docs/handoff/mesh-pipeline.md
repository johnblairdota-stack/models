> ⚠️ **SUPERSEDED FOR DAY-TO-DAY WORK by `docs/handoff/player-pipeline.md`**, which is the short
> state of play. This file is the ARCHAEOLOGY — every round, every wrong turn and the control that
> caught it. Read it when something in the short one surprises you, or before repeating an
> experiment that may already have been run and rejected here.

# Handoff — the generated-mesh pipeline (2026-08-15)

**The process changed.** `docs/ASSET_PIPELINE_PLAN.md` is now the authority for new assets, and it
**supersedes the `rrr-pipeline` skill**, which describes the old build-then-critique-forever loop.
⚠️ An agent asked to "run the asset pipeline plan" could not find that file, silently substituted
the skill, and burned ~20 builder/critic rounds before John caught it. **If you cannot find a
document you were told to follow, stop and ask.**

Contract: `docs/STYLE_CONTRACT.md`. John signed off: hero character **60k tris**, re-origining
**automated**, and the **player goes first** as the end-to-end test.

---

## Where it got to

The player is now a **generated, auto-rigged, skinned character** and it beats the hand-built one.

- `assets/raw/meshy_biped/` — 9 skinned GLBs, one per animation, served from `public/models/anim/`
- **10,378 tris** (a sixth of budget), 24-joint humanoid skeleton, real `JOINTS_0`/`WEIGHTS_0`
- Clips: `walking running run3 alert attack arise dance groove cheer`
- View: `mesh.animated` — `?clip=` `?solo=1` `?kit=0` `?at=N`. Also `mesh.compare`, `mesh.rigged`.
- **`MESH.bat`** — double-click, opens it orbitable in a browser

**`char.turnaround` r38 WEAK 66** (`critic-meshplayer-1`) scores the GENERATED mesh, not the
procedural. It beats the procedural against the baseline art on proportion: max span −4.7% vs
−20%, IoU 81.1% vs 66.2%. The structural finding — *the procedural's widest point is its
shoulders; the art's is its hands at hip height.* The mesh matches the art; the procedural
inverts it. The auto-rig deforms cleanly: no candy-wrapper waist, no shoulder collapse.

Its open hates: **no neck**, **no ear disc**, soft creases where the art has dark plate gaps,
plus visible faceting at 1080p.

---

## What is half-done — pick this up first

`src/characters/mesh-identity.js` attaches rig-owned parts to **bones** (contract §6). Bone props
need no skin weights and ride the deformation for free.

| part | bone | state |
|---|---|---|
| neck column + ribs | `neck` | ✅ works, closes the "no neck" hate |
| ear discs + rings | `Head` | ✅ works, closes "no ear disc" |
| mint caps | `LeftArm` / `RightArm` | ✅ works |
| **faceplate** | `Head` | ✅ works — eyes and smile render |

**How the face got fixed, because the failure was not obvious.** It first rendered as a blank blue
shield. `faceplate()`'s material is baked against **`visorCap`'s** UV layout (`unit4h.js:1063`, uv
0..1 spans ±54° of the head sphere); a generic `SphereGeometry` cap carries sphere UVs, so the eyes
and mouth land off the visible area. **No amount of moving or rescaling could ever have fixed it.**
Rather than export `visorCap` and its four internals (`headBox`, `headR`, `VISOR`, `headStretch`),
`mesh-identity.js` builds one throwaway `buildUnit4H`, borrows the finished faceplate's geometry
and its transform relative to the rig's own head joint, and hangs that off the Meshy `Head` bone.

⚠️ Two **eyeballed** offsets remain in that file (`translateY headW*0.30`, `translateZ headW*0.10`)
because the two rigs put their head joint at different heights on the skull and there is no shared
landmark to derive from. They are labelled as tuned, not disguised as measurements.

### The kit is finished — bezel, ear discs and wordmark all closed (2026-08-15, second pass)

All three were the SAME bug wearing three hats: **the kit sized everything off `ART.headW * H`,
the head the ART has, and this body does not have that head.** Measured, the generated skull is
**0.2576 m — 0.1515 H against the art's 0.174 H, a ratio of 0.871.** Every part hung off a ruler
13% too long. It now measures the body it is decorating, at build time, by raycast.

| hate | what it actually was | now |
|---|---|---|
| "visor runs to the head's edges" | plate at **0.964** of head width; the donor's is **0.7835** | scaled to the donor's ratio — the white shell around it IS the bezel, plus a raised ring |
| "ear discs read smaller" | NOT small — **buried**. Seated at x 0.088 while the skull surface is at x **0.123–0.129** | seated on the measured surface, outer face at **0.153** |
| chest wordmark | not started | `mats.decal` from the locked brand art, raycast onto the real chest |

**The ratios come from `unit4h`, and that is the point.** It is a build John has already signed
off, so its PROPORTIONS are measurements. Its raw distances are not transferable; its ratios are.
Measured by the probes: visor/head **0.7835**, decal width / front-facing band **0.965**, decal
height **0.7310 H**.

⚠️ **"Front-facing band", not chest width.** A side raycast reports 0.29–0.33 m of "torso" on a
character whose chest is 0.16 m deep — it is hitting the A-pose ARM. The usable denominator is the
run of chest whose normal still points within ~37° of camera (nz ≥ 0.80): **0.096 m half-width**.
The generated chest is much rounder than the procedural one, so the donor's raw 0.2992 m mark
would have curled round the ribs. It ships at **0.1853 × 0.0440 m**.

**Two eyeballed offsets survive** (`translateY/Z headW*0.30/0.10`) and are now written against
`ART.headW * H` **on purpose** — they were tuned by eye on the 0.2958 m ruler, so re-basing them
onto the measured skull would silently drop the face 11 mm down the jaw as a side effect of
fixing the ears. Conforming made the Z one nearly inert anyway.

Probes: `harness/evidence/_kit1_probe.mjs` (bone-owned boxes) · `_kit2_surfaces.mjs` (skull/torso profiles
+ donor ratios) · `_kit3_chest.mjs` (chest cross-section and normals) · `_kit5_where.mjs` (where a
kit part actually landed) · `_kit7_artratio.mjs` (measures the ART) · `_kit8_delivered.mjs`
(target vs DELIVERED, in metres, off the built character).

### Round two — John: "comedically small" and "caps in the wrong spot". Both real.

**He was right about a 32% error by eye, before anything was measured.** The visor was SET to 0.78
of head width and SHIPPED at **0.529**. Conforming was the cause: projecting a plate outward from
the head centre preserves each vertex's ANGLE, and a plate standing proud of the face is further
from the centre than the skull is, so its projection lands inside its own outline. **The constant
was right and the delivery was wrong**, which is why re-reading the constant would never have
found it. Scaling up to compensate does not converge either — a wider plate wraps further round the
skull and eventually projects down the neck (a bezel spanning y 1.184..1.618 on a 1.421..1.700
head). The fix is **parallel rays along the face's forward**: width in, width out, depth only.

Now: **visor delivered 0.781 of head against the art's 0.78.**

⚠️ **Do not size a part before conforming it and then trust the number.** `_kit8_delivered.mjs`
exists to report TARGET against DELIVERED, because those were silently different for a whole round.

**The mint caps were three errors at once**, measured against the art: 2 cm too low, 30% too tall,
and **124% too wide**. The lift `position.set(0, capR * 0.62, ...)` was meant to raise the cap onto
the deltoid, but the arm bone's +Y points **down the limb** — measured, `(0.187, -0.970, -0.158)`.
*A bone-local offset only means what you think it means once you have checked that bone's axes.*

They are now a **shell raycast onto the real shoulder**, not a solid: it cannot float and cannot
bulge, because every vertex is a point on the body. The band is solved **per column** — solving it
once at the outward direction assumes the shoulder is a sphere about the arm joint, and that
shipped a cap half again too tall. Delivered y 1.1814..1.3170 against the art's 1.1815..1.3141.

**Three failures in this round were invisible-in-render, identical on screen, different in cause.**
All three now have a control that was watched failing:

| symptom | cause | guard |
|---|---|---|
| no face | plate conformed to the BACK of the skull — ray origin and travel both flipped | `assertOnHead` z check |
| no face | lift pushed the plate INTO the head; `dir` points opposite ways in the two conform modes | — sign is now derived from the mode |
| no caps | patch wound inside-out; a FrontSide material draws neither side | `assertFacesOut` dot check |

⚠️ The back-of-skull one is the nastiest: **every other number stayed plausible.** The width solve
still converged to 0.781 and the height band still matched, because the back of a head is at the
same heights as the front.

### Round three — ALL THREE `MESH.bat` TABS FAILED while every development capture passed

**Read this before adding any raycast to a skinned character.**

`mesh-animated.js` puts the rig at **x = 0.75** whenever it is shown beside the procedural player
— which is every view except `?solo=1`. Every capture taken while building the kit used `solo=1`.
`MESH.bat` opens the paired view. So the feature was verified exclusively through the one entry
point John does not use, and he got three dead tabs.

**The underlying defect is a three.js SkinnedMesh raycast double count.** This GLB carries a scale
pair — SkinnedMesh at 0.01 under an Armature at 100 — that nets to identity, which is why its raw
geometry is already world-space. Raycasting runs the skinning, and the **bone matrices already
carry the rig's translation**; the mesh's own `matrixWorld` translation is then applied on top.
Measured with the rig at x = 0.75:

```
body bounding box   x 0.3838 .. 1.1162
side ray reports    x 1.6265          <- 0.75 beyond where the body ends
```

At the origin the double count is zero. **That is why it was invisible: correct at x=0, silently
wrong everywhere else** — including in the game, which moves the player constantly.

**Fix:** `attachIdentity` neutralises the rig's x/z position and its rotation, measures and builds,
then restores them in a `finally`. Kit parts are bone-parented, so they ride the restore.

**Control:** a raycast hit on a body must lie INSIDE that body's bounding box. One line, true of
every correct hit, false of every double-counted one, and independent of where the character
stands. Watched failing before it was trusted.

### Round four — the face, the caps, and INTO THE GAME

**"The face still looks a little small."** Right again, and the visor was not the cause. Measured
on a chroma capture against the art at the same figure scale:

```
                     head silhouette   visible blue   blue / head
art                       146 px          112 px         0.767
ours (before)             154+24 px       110 px         0.618   <- head inflated by EAR DISCS
ours (now)                154 px          117 px         0.760
```

The visor was already right *against the skull* — 110 px of 142, i.e. 0.775. The **ear discs were
breaking the head's silhouette**, and the row profile shows it as a step from 156 px to 175 px in
four rows where the art's head is a smooth dome that never steps. `baseline_side-left.png` settles
it: the art's ear is a **concentric ring INSET into the skull**, not a boss.

⚠️ **A part measured correctly can still read wrong because a DIFFERENT part broke the silhouette
it is judged against.** Sizing the visor up would have "fixed" the symptom and left the head wide.

`ARTREF.visorOfSkull` is now **calibrated against a render**, not copied from the art — the art's
number is blue-vs-silhouette in a picture, ours is plate-vs-skull in a model, and those are not
the same ratio. Shoot `?bg=ff00ff` and run `_kit7_artratio.mjs` to re-derive it.

**"The shoulder caps are clipping during movement."** The kit's own header claimed a bone-parented
prop "cannot fight the deformation". True of the HEAD, false of a SHOULDER: the deltoid is blended
across `Spine`, `LeftShoulder` and `LeftArm`, so a cap welded to one bone swings on that bone's arc
while the surface under it bends. **Invisible in bind pose, appears on the first frame of a clip.**

Caps and the wordmark are now `SkinnedMesh`es sharing the body's skeleton, with weights copied from
the nearest body vertex — legitimate here because both parts are BUILT by raycast onto the body, so
every vertex already sits on a real surface point. They now deform by the same arithmetic as the
skin they lie on and cannot cross it at any pose.

---

## The game adapter — `?mesh=1`, and the one conflict it has to resolve

`PLAYMESH.bat` · `src/characters/mesh-avatar.js` · `harness/scenarios/_mesh1-hammer.mjs`

**The game poses procedurally; the generated character is animated by baked clips.** A clip cannot
know where the hammer is, and `SledgeRig` solves a two-handed IK grip onto it. Play the clips and
the hands come off the hammer — the campaign's core verb. Pose everything from `Gait` and the
auto-rig's clips are wasted, which is most of the reason the generated character is better.

**Split by body part, along the line where each system is actually better:**

| part | driven by |
|---|---|
| legs, spine, head | the baked clip — real walk and run cycles |
| **arms and hands** | **retargeted from the procedural rig, every frame, after the clip** |

⚠️ **The retarget transfers a DELTA, not a pose.** The skeletons share no bone axes, lengths or
rest orientations, so copying a quaternion across gives a broken arm. What transfers is rotation
from its own rest: `wanted = procNow * inverse(procRest) * meshRest`. Both rests captured in bind
pose, before anything animates.

**The unit is NOT replaced.** `Player` keeps `buildUnit4H` as the skeleton — still posed, still
owning the four sockets, still solving the grip — and only its *meshes* stop drawing. Swapping the
unit out would mean reimplementing `LimbRig`, `Gait`, `SledgeRig` and `views/game.js` against a
skinned mesh in one step. **Arm 0 is bit-identical without `?mesh=1`.**

⚠️ `unit.root.visible = false` WOULD HIDE THE SLEDGEHAMMER — it mounts on `joints.chest`, inside
that subtree. Hide per-mesh and re-show held props (`Player._reshowHeldProps`).

A detached limb is not an object to remove — it is vertices weighted to a bone. The avatar
collapses that bone; the flying `LimbItem` is still the procedural one.

### ⚠️ THE SPLIT ABOVE WAS BUILT, PLAYED AND REJECTED. The clip drives everything now.

John, after playing it: *"the current swing is very broken, the arms are not right. The arms are
also not right without the hammer, just walk around. I think we need to abandon the old
skellington."*

He is right on the mechanism as well as the look: **bolting one skeleton's arms onto another
skeleton's body leaves a seam at the shoulder that no retarget arithmetic removes**, because the
two solutions disagree about where the shoulder is. The delta transfer was correct and the result
was still wrong.

**So the Meshy `attack` clip IS the sledgehammer swing, and the clip drives the whole body.**

That inverts how the hammer is held — it is **parented to the hand bone**, not fitted to two solved
hands. `SledgeRig` keeps the clock (`SWING_DUR`, `CONTACT_PHASE`, the body kick) and
`playAttack(SWING_DUR)` retimes the clip to it, so picture and damage stay one event.
`swingHit()` reads the prop's real `matrixWorld`, so **the hit follows whatever the animation
actually did** with no extra work.

`SledgeRig.ownsProp` (new, defaults `true`) is what stops the two systems writing `root.position`
on alternate lines of one tick.

**Three traps this cost, all of which passed every assertion at the time:**

1. **The prop mounted at 1/100 size.** Bones carry the GLB's 0.01 scale — the same trap
   `mesh-identity.js` divides out for every kit part, arriving again the moment something outside
   that file hangs off a bone. Parented ✓, `visible` ✓, near the hand ✓, and the robot held
   nothing. Guard: the mounted prop's **world span** must exceed a third of character height.
2. **The haft ran diagonally through the chest.** I aligned it to the hand bone's local +Y on the
   reasoning that +Y runs down the limb — true of the ARM bone, *measured*, and not a fact about
   the hand's frame. Now derived from the **forearm→hand vector**, which needs no axis convention.
3. **The test swung on the wrong clock.** `swing(performance.now()/1000)` sets `t0` ~100 s ahead of
   the sim's accumulated `t`; the phase never goes positive and the swing silently never happens.
   Go through `player.attack(t)` with the `t` the player is actually being driven with.

**Two eyeballed numbers remain, shipped as live knobs** rather than as questions — the fist has no
landmark to derive them from: `?grip=` (roll of the haft in the fist, rad) and `?griplen=` (how far
down the haft the hand sits, fraction of height).

**Still open:** foot skate not yet measured against `harness/footskate.mjs`; no clip for the limb
club, crawl or death; the limb stump is a collapsed bone and has not been judged.

Scenario: `harness/scenarios/_mesh1-hammer.mjs` — 11 checks, including that the head actually
travels during the swing, which is what separates "the clip is playing" from "the clip is
assigned".

### Played again — limbs, and what the clip set is missing

`grip = 0.8` is John's pick, baked. The attack clip as the swing: **"the attack animation is
however good."** Two defects and one gap came out of that session.

**1. "An original robot arm floating in front of me after I reattached the limb."** A detached limb
becomes its own visible object — correct, that is the limb flying across the room — and
`LimbRig.attach()` puts THAT OBJECT back on the body still visible, because the constructor's hide
pass ran long before it existed separately. `Player` now re-hides the whole procedural body on
**every** socket change, not just on detach. Idempotent, and cheaper than enumerating which events
can introduce a newly-visible mesh.

**2. The mesh limb did not disappear when the arm came off.** `setLimbVisible` collapsed the bone
once — and **the clips carry SCALE TRACKS**, so `mixer.update()` overwrote it on the next frame.
Collapsed bones are now a `Set`, re-asserted **after** the mixer every frame.

⚠️ Both are the same shape of bug: *a one-shot write into state that an animation system owns.*

Scenario: `harness/scenarios/_mesh2-limbs.mjs`. Its assertion is a **count of visible procedural
meshes** — with the avatar on, the only things under the unit that may render are held props, so
anything else is the old body showing through. Reverted, it fails naming `j.wristR.merged` and
`j.elbowR.merged`: exactly the arm John saw.

**3. THE CLIP SET IS THE REAL LIMIT NOW.** "The idle sledge holding position is weird. It doesn't
match the grip you would expect." Correct, and no code change fixes it: `alert` is a ready stance
with **empty hands**, so a hammer in it reads as one the character forgot they were carrying.
Stopgap — hold a frame of the ATTACK clip instead, since that is the one animation authored around
a two-handed swing; `?ready=` scrubs which frame.

**The next asset to make is animation, not geometry.** Missing, in rough order of how often the
player sees them: idle-holding · walk-holding · hit reaction · collapse/death · crawl · the limb
club swing.

---

## Art critique, 2026-08-15 — VERDICT: does NOT read as the same character

Run against `assets/mv/player/baseline_*.png`. **Every kit measurement passes and the surface still
fails.** Ranked:

1. **MATERIAL, and it outweighs everything else combined.** Ours is matte white plastic; the art is
   brushed metal with panel seams and deep occlusion. Fraction of shell below luma 90: **art
   13.9–15.9%, render 0.56–1.16%**. On the legs, art 10.0–10.9% against render **0.01–0.11%** —
   effectively no dark pixels at all. Panel-seam (local-trough) density **art 12.1–13.6% vs render
   2.4–3.9%**, holding across four probe depths. Value spread p95−p05: art ~159, render ~111.
2. ~~The chest mark is the wrong mark.~~ **RULED ON BY JOHN: the 4Humanity wordmark is
   DELIBERATE.** "We have decided already to switch over to the 4humanity logo." The baseline art
   predates that decision and shows the older circular emblem. **Do not re-raise this**, and do not
   let a critic "correct" the chest back to the art — on this one point the art is stale, not
   authoritative.
3. **Head contrast is inverted.** With no colour cut at all — the one setting with zero free
   parameters — the art's head band is median luma **136** with **42.2%** below 120; ours is median
   **168** with **16.4%**. The art's face is dominated by a large DARK tinted window. Exclude the
   glass and it reverses: our ear discs and neck slot are dark where the art keeps that hardware
   cream.
4. **Mint caps cover ~60% of the art's area** (render/art 0.56–0.68 across three cuts; a fourth cut
   disagreed at 0.21 and is excluded) and are **~1.5x too saturated** — 0.164–0.207 against the
   art's greyed sage 0.114–0.116. The vertical BAND is correct; this is a width/wrap defect.
5. **Visible low-poly faceting on hips, thighs and abdomen.** ⚠️ Reported on the IMAGE ALONE — the
   critic's facet metric returned art 8.9–11.7 vs render 5.8–7.5, i.e. it measured the render as
   *smoother*, because the metric counts high-frequency luminance and the art's dense panel lines
   dominate it. It measures detail density, not flat shading. Confidence medium.

**Genuinely good:** the head-and-visor silhouette. Visor/head 0.760 against the art's 0.726–0.767,
head width 154 vs 155 px at matched scale.

⚠️ The critic's default-background control run **failed as designed** and caught the gradient trap —
the figure masked to the whole 1920x1080 frame — so those numbers were discarded. All shell
statistics come from a `?bg=ff00ff` capture.

**So the next art round is MATERIAL, not geometry or kit.** `mat.robot` is the view; the target is
the art's dark fraction and seam density, and both now have numbers to hit.

---

## The material round, and the UV bug it uncovered

`robot.js` gained a baked panel-seam network and a real cavity-occlusion term. Measured:

| | before | after | ART |
|---|---|---|---|
| shell < luma 90 | 0.7–1.0% | 10.3–12.0% | 13.9–15.9% |
| legs < luma 90 | 0.03–0.07% | 6.5–9.1% | 10.0–10.9% |
| seam density @14 | 3.4–3.7% | **13.0–14.6%** ✓ | 12.1–13.6% |
| spread p95−p05 | 107–111 | **163–166** ✓ | ~159 |

⚠️ **AND IT LOOKED LIKE CRACKED PORCELAIN.** Two targets hit, darks up 15x, and the generated body
read as crazed glaze. This is the project's own rule catching a real case: *a number hitting its
target is not evidence it looks right.* Four of five columns passed; only **facet energy**
(17.9–18.7 against the art's 9–12) disagreed, and it was the one that was right.

**The cause was the UV atlas, not the material.** Seams are baked in uv space — correct, because a
world-space pattern swims across a skinned mesh. Meshy's atlas is **405 charts, median 14 cm, at
arbitrary orientations**, so each chart got one or two lines at whatever angle it carried. Proof it
was upstream: the *same material* on the procedural robot, which has an authored unwrap, reads as
proper plating.

### `tools/unwrap_player.py` — the fix

**Cube projection, not Smart UV Project.** Smart UV at a 66° angle limit took 405 charts to
**2,269** — it cuts at every crease and this is a faceted mesh. Cube projection maps faces along
their dominant WORLD AXIS, so islands are axis-aligned by construction. Overlapping uvs are fine:
the shell is a PROCEDURAL pattern sampled in uv, not a unique painted atlas.

| | before | after |
|---|---|---|
| metres per uv unit | 1.9875 | 2.0578 |
| density spread p75/p25 | **1.689** | **1.094** |

⚠️ **`cube_size` MUST BE DERIVED FROM THE OBJECT'S SCALE.** cube_project divides LOCAL coordinates,
and this GLB carries the 0.01/100 pair — mesh data is ~170 units for a 1.7 m character. A
hand-picked 0.489 gave **0.005 m per uv**, a grid 400x too fine. `cube_size = TARGET / object_scale`.

⚠️ **TWO NUMERIC CONTROLS IN A ROW WERE WRONG AND BLOCKED A GOOD UNWRAP.**
1. "charts must consolidate" — chart COUNT is not the defect; 405 charts agreeing on an axis would
   be fine.
2. "islands must grow in uv" — a coarser, correct projection makes them smaller.
3. `orientDeg` is reported but **not asserted on**: it measures dominant EDGE direction, and
   triangle diagonals run at every angle inside even a perfectly aligned island, so it reads ~22°
   before AND after. It cannot see the property it was written to test.

What IS asserted: uv density within 20% of target, and p75/p25 spread ≤ 1.6. **The original atlas
fails that spread control at 1.689** — a control watched failing on real data.

### The avatar now loads ONE file

`public/models/anim/player_unwrapped.glb` — the merged Meshy export, re-unwrapped, carrying all 15
clips. It replaces four separate GLB loads that were four full copies of the character, three
downloaded purely for their animation tracks.

Wired: `idle=Alert · walk=Walking · run=Running · attack=Heavy_Hammer_Swing ·
idleHold=Axe_Breathe_and_Look_Around · walkHold=Walk_Turn_Left_with_Weapon`.

⚠️ **NOT `Axe_Stance`** for the held idle — despite the name it is a crouched, hand-on-the-ground
landing pose. Checked on a render, not on the name. The frozen-attack-frame stopgap and `?ready=`
are retired; the character has a real held pose now.

Still unwired from the 15: `Dead`, `Face_Punch_Reaction`, `Crawl_and_Look_Back`, `Arise` — the
interrupts and the crawl mode from the agreed state machine.

### ⚠️ THE RE-UNWRAP DID NOT FIX THE SURFACE — a retraction

An earlier version of the comment in `mesh-avatar.js` said "✅ FIXED UPSTREAM". **That was wrong**
and a critic caught it by re-measuring the number that diagnosed the original defect:

```
facet energy   pre-unwrap 17.9–18.7   post-unwrap 17.6–19.2   ART 8.3–12.3
```

**Unmoved.** The UV-space statistic improved exactly as claimed (density spread 1.689 → 1.094) and
the IMAGE-space one did not move at all. What changed is the *appearance of the failure*: crazed
glaze became an axis-aligned graph-paper grid stamped across a curved body. Same defect, new
orientation. The unwrap was **necessary and not sufficient**.

⚠️ **A UV-SPACE WIN IS NOT AN IMAGE-SPACE WIN.** Re-measure the diagnosing metric, not the one you
just improved.

### Current ranked defects (critique 2)

1. **Darks are atomised speckle, not plate channels.** Median dark connected component **1–2 px vs
   the art's 10–16**, and **21.9–59.7 components per 1000 dark px vs the art's 1.5–7.3**. Disjoint
   at all four dark cuts and both poses. The dark *fraction* target is met; the structure is dust.
   Probe: `harness/evidence/_critdig_darkstruct.mjs`. Per-component elongation did NOT separate them
   (art 1.95–2.32 vs render 1.74–1.91) — it is count and size, not shape.
2. **Visible flat-shaded triangle mosaic.** Facet energy 15.7–21.5 vs art 8.3–12.3 across all five
   neutrality cuts and four regions. MESH.
3. **No plate separation** — the art has cuirass / gap / belly band / gap / pelvic plate; the
   render's torso is one continuous mass. Largest continuous dark channel 2.16–4.38 × figure height
   in the art against 0.61–1.55 here.
4. **The head is inverted.** Head/torso dark ratio **0.33–0.58 in the art, 1.32–2.24 in the
   render** — never overlapping. Ours is the dirtiest region; the art's is the cleanest pearl
   shell. This is where the eye lands first.
5. **The shell is dead neutral; the art is warm champagne.** R−B is **+10.5 to +11.0 in the art**
   (remarkably stable across four cuts) and **−0.2 to +1.5 here**. Absolute levels match within ~2,
   so it is not exposure — the blue channel is ~9 levels too high. **Cheapest of the five.**

**The single highest-leverage change: subdivide the body to ~40k tris (budget is 60k) and re-bake
the cavity term on smoothed normals.** The faceting is likely the CAUSE of the speckle — a
curvature-driven cavity term on a coarse faceted mesh fires at every triangle edge. Falsifier: if
facet energy drops toward 10 but components-per-1k stays above 20, the speckle is the seam texture
independently, and the network should be clamped to a few wide continuous lines.

### Two bugs from play, both the same shape

**"After respawning from an escape there are the old robot feet showing. I had skates on."** The
skates are NOT a socket occupant — `LimbRig` fires `{ kind: 'skates', on }` with **no `socket`** —
and `removeSkates()` deliberately un-hides the procedural boots, because the skates ARE the feet
while worn. `Player`'s re-hide was gated on `what.socket`, so it never ran. Now runs on every
change. Scenario: `harness/scenarios/_mesh3-skates.mjs`.

**"Sometimes when walking forward the model aims to the left."** Not sometimes — every time, while
carrying the hammer. `walkHold` was wired to `Walk_Turn_Left_with_Weapon`, chosen off its NAME.
Measured on its own Hips track it drifts **−270.2° over 2.21 s**, against +0.3 for `Walking` and
−0.1 for `Running`. There is no straight walk-with-weapon clip in the set; `walkHold` falls back to
`Walking` until one is fetched.

⚠️ New guard: `mesh-avatar` measures each locomotion clip's Hips yaw drift at LOAD and refuses any
clip that turns more than 25°. Watched failing — with the turning clip restored the avatar throws,
and `game.js` falls back to the procedural player rather than shipping it.

⚠️ `?meshseams` was a DEAD FLAG on `mesh.animated` — that view assigned `mats.shell`
unconditionally while the branch lived in `mesh-avatar.js`. A critic ran the A/B and got two
MD5-identical captures. Now honoured on both paths. *A knob that silently does nothing is worse
than no knob: it makes a comparison look like it was run.*

---

## Hunters: rebuilt as MORE PARTS, not scaled up

John's call, and the art backs it. `HUNTER_STAGES.scale` is now **1.00 at every stage** (was
1.35/1.90/2.60). Bulk comes from width + grafted limbs.

**The measurement that settled it** (baseline vs stage 2, front views): head **59px vs 58px** —
the same head — while shoulders go **150 → 235**. Head-to-shoulder falls 37%. A ×1.90 robot has a
×1.90 head and that ratio would not move. Because the head is the same real object measuring the
same pixels, the rows share a scale, so heights compare: **339/320/300 = ×1.00/×0.94/×0.88** —
the art's hunter is *shorter* than the player, and much wider.

Poses re-derived from the art's **side** view: the hunch is **spinal**, not a crouch — domed back,
head forward, legs near-straight. Verified by crown ratio against the player in-frame: s1 0.929,
s2 0.897, s3 0.890 (art: s2 0.94, s3 0.88).

⚠️ **Stage 2 is still 4.5% short and the trunk is NOT the cause** — dropping spine/chest moved it
0.887→0.897. Next knob is `neckSink` (0.048), pulling the head into the shoulders.

⚠️ **This reframes 16 rounds of `hunter.3` critique.** "Reads as twins, not absorption" was the
standing #1 hate, and two same-sized heads sharing a collar is *exactly* what absorbing a player
produces. The render was driven away from the right answer.

⚠️ Stage 3's rider is still the old small tucked head. Under this model it should be **full size**.

Board: `hunter.2` r19 WEAK 70 · `hunter.3` r21 WEAK 64 · `hunter.sheet` r7 WEAK 76.

---

## Traps this session paid for

**Measurement — sweep every free parameter, not just the one you thought of.**
- `measure.mjs` needs explicit `--band`/`--refband`. The default truncated BOTH figures for 18
  rounds. Tell: reported height ≈ 0.78 × image height.
- Sweep the **reference** crop too, not just the render's. Two wrong conclusions came from this.
- Crop as `[split,0,1-split,1]` and sweep the split. Only widths agreeing across 2+ splits are real.
- `measure.mjs` pairs figures **by position**: figure 1 is the PLAYER. On the default hunter frame
  the two robots can **merge** and it reports "1 figure" for two, with a full plausible table.
- `crotch` is a HEIGHT, and 0.060 is its scan floor (the contact shadow bridges the boots).
- **A scalar hitting its target is not evidence it looks right.** Crown height cannot tell a stoop
  from a squat — stage 3 measured 0.881 against the art's 0.88 while reading as bent double.

**Measuring a SKINNED mesh — three wrong ways before the right one.** Getting the head's real
width took four attempts, and each wrong one printed a confident table:

- `position × matrixWorld` → a **3 mm head**. The SkinnedMesh node carries scale 0.01 under a
  parent carrying 100; the pair nets to identity, so applying only the mesh's half shrinks by 100.
- `applyBoneTransform` → a **0 mm head**. `Skeleton.update()` fills `boneMatrices` and it runs at
  RENDER time only. Nothing in a probe renders, so the palette is still the constructor's
  zero-filled array and every vertex collapses onto the origin.
- Calling `skeleton.update()` by hand does not save it either — bone and bind matrices then
  compose to ~1e-5.
- **Right answer: the raw attribute IS bind-pose world space for this asset** (geometry box is
  x ±0.366, y 0→1.700, z ±0.166). Two independent measurements agree — that box, and a scene-space
  raycast finding the chest front at the same 0.166. `_kit1_probe.mjs` re-checks the agreement
  every run and exits non-zero if a re-export ever breaks it.

**A part conformed to a surface must be PARENTED first.** `mesh-identity.js` builds head parts in
a frame relative to the HEAD JOINT, so an unparented plate's vertices sit near y 0.1, not y 1.5.
Conforming one in that frame fired every ray from the head centre at the FLOOR and returned a
faceplate smeared down the legs, y 0.000–0.755. On screen that is *a character with no face* —
much harder to read than a number. `assertOnHead` now names the part and prints where it landed;
it was watched failing before it was trusted.

⚠️ **`geometry.clone()` copies the CACHED bounds.** A conformed part keeps the donor's
`boundingBox` and `boundingSphere` unless they are nulled. That is not cosmetic — the stale sphere
sits at the head joint's origin, so frustum culling drops the face on a close camera. It also made
the bug above harder to find, by reporting the donor's box for geometry lying across the legs.

**Tooling.**
- Blender **4.5.10 LTS** installed (`BLENDER.bat`). `python` on PATH is only the Store stub —
  conditioning runs in Blender's own Python.
- `shoot.mjs --extra` reads only the **first** occurrence. Join with `&` or the second is ignored.
- Orphaned `chrome-headless-shell` processes wreck perf numbers — 16 of them moved a GPU reading
  1.35→1.09 ms. Check the process table before believing any perf figure.
- Git Bash mangles `/models/...` into `C:/Program Files/Git/models/...`. Use `MSYS_NO_PATHCONV=1`.
- Backticks in a `/* glsl */` comment take the whole build down. Run `lint-glsl` after EACH edit.
- Don't judge hue on `--review` PNGs — amber resamples to red at 1280.

---

## Tools added

`harness/mv-prep.mjs` (art sheet → multi-view generation inputs) · `harness/rig-joints.mjs` (dumps
rig bind pose + faceplate box) · `tools/condition_asset.py` (scale/origin/decimate/split/aperture,
fails loudly) · `tools/probe_parts.py` · `src/characters/mesh-shell.js` + `mesh-identity.js` ·
`MESH.bat`, `BLENDER.bat`, `HUNTER.bat`.

⚠️ `condition_asset.py` **joins meshes**, which destroys a skin binding — skinned assets skip it
and are normalised at load in `mesh-animated.js` instead. Its splitter/aperture/calibration paths
were built for the abandoned rigid-part approach and are dead weight for skinned characters.
