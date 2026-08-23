# Digging — sealed rooms, one hidden interconnect, and a house that opens

John, 2026-08-04:

> *"We start at a scale of 5 rooms touching at their edge (with as much surface area as possible
> shared) but the cosmetic doors are all heavily chained and barricaded. Then instead beneath the
> walls there is a secret pathway into the next room. It generates procedurally in a different spot
> each time as the only connection point. Because of this each robot has to destroy the walls 'dig'
> into the other rooms. They can destroy big chunks initially but it becomes less and less over
> time and then where the rooms interconnect there is a solid visible barrier that robots can't
> enter until they find the interconnect. Once the interconnect is accessed by a player the whole
> robot barrier turns off and players can continue digging into the other rooms of the estate. As
> they attack the walls it should be utterly satisfying."*

**This makes destruction the game's verb rather than one of its verbs**, and it resolves the defect
`play-critic-7` proved by playing: with a handful of fixed candidates you find the way through by
*counting padlocks*. Here there is nothing to count — the wall is continuous and the answer is
inside it.

---

## 0. PR B — cyan is the map edge, not the room wall (John 2026-08-23) ✅

Locked against the live inventory (which was **correct** and is now history):

5. All walls are destructible.
6. Walls on the **edge of the map** keep the **cyan barrier** so players cannot leave.
7. Walls **between rooms** have **no cyan** — dig through wall to wall and reach any room.

**Before:** G=1 on every interior dig face. The interconnect blob was the only G=0 region.
The envelope was solid architecture — you could not leave because there was no dig face.

**After:**

| kind | G channel | smash | walk through |
|---|---|---|---|
| inter-room (`DIG_EDGES` / `generatedDigEdges`) | 0 | yes | yes, once white is gone |
| map envelope (`envDigTable`) | 1 | yes | no — cyan stays |

The interconnect search no longer gates room-to-room travel. `setInterconnect` still exists
for the smash bed and old harnesses; `setDigPlan` does not write it onto G. `[B]` and
`unlockBarrier` never lift envelope cyan.

Verify: `node harness/_cy1-edge.mjs` and party-warm W16. Play: smash a shared wall, walk
through; smash an outer wall, hit cyan.

Map-designer "cyan" (short nodig < 1.20 m) is still a different mark. Do not conflate them.

---

## 1. The shape it creates

**Act 1 — sealed.** Five rooms, every door chained and decorative. You are in a box with a monster
somewhere in the house. The only way on is to dig, and you do not know where.

**Act 2 — open.** Someone finds the interconnect, the barrier drops **house-wide**, and the estate
becomes the connected, breachable place the current game already is.

That is a genuine act break, and the moment it flips is a broadcast event: *someone else got
through first.* It sits perfectly beside the escape design, where the first robot out starts the
bomb clock. **The house opens, and then it ends.**

⚠️ **One reading to confirm: "the whole robot barrier turns off" is taken as GLOBAL** — one
discovery opens every room pair, not each pair needing its own. Global is the better game (the same
puzzle four more times is a grind) and it makes the finder's moment matter. *Flagged, not assumed.*

> 🕳️ **`dig-2`, 2026-08-05: BUILT AS GLOBAL, AND STILL FLAGGED.** A reason the reading is wrong was
> looked for and not found. The strongest argument against global is that it throws away four
> fifths of the content the barrier mechanic pays for — **but the content is the SEARCH, and the
> search still happens, once, with the whole house's worth of wall to do it in.** Both readings are
> built (`?unlock=global | edge | off`, default `global`) so this stays a question John can answer
> by playing rather than one anybody has to argue. `off` is also exactly the pre-interconnect
> build, which keeps `dig-1`'s figures re-runnable.

## 2. Why the hunter must ignore the barrier — and why that is the best version

If players are sealed in and the hunter is too, Act 1 has no threat and the horror dies.

**So the barrier is a ROBOT barrier, exactly as John wrote it, and the hunter is not a robot in that
sense.** It crosses. It comes through the wall.

**This is already built and it is the engine's best scare.** `_tooNarrowPanel` already makes a
stage-3 hunter breach rather than squeeze, and HANDOFF's own words are *"a wall bulging and then
bursting beside you is the single best scare this engine can already render."* In Act 1 that stops
being an occasional beat and becomes **the** beat: you are sealed in a room, digging, making the
loudest noise in the game — and the only thing that can reach you comes through the wall.

## 3. What the engine can and cannot do today — measured, not assumed

**`breakmask.js` grows a ragged hole from a SINGLE FLOAT.** Each surface bakes a "break order"
scalar into the unused alpha of its ORM texture; one uniform `uBreak` is a threshold that discards
where `breakOrder < uBreak`, with a darkened, roughened lip just above it. *No extra texture, no
geometry work, no per-frame CPU cost, and the hole silhouette is deterministic so two clients and
two screenshots agree.* **This is why the wall group holds the project's only material PASS.**

⚠️ **But the hole shape is AUTHORED IN THE BAKE, not driven by the impact point.** `damage(id,
amount, hit)` passes a hit, and the wall advances a **stage**; the hole does not open *where you
shot it*. **So "dig where I choose" is a new capability, and there are two ways to get it:**

| approach | what it needs | verdict |
|---|---|---|
| **A · positional** — `uBreak` becomes a painted mask (a small render target stamped at impact UVs) | new rendering work, new network sync (a mask is not one float), determinism risk | **the real thing, later** |
| **B · segmented** — divide each shared wall into N panels; the interconnect is behind one of them | **nothing new** — reuses panels, stages, `breakmask`, the network ids, `pathPortals` | **do this first** |

**B gives the whole design immediately.** "Which part of the wall?" is exactly the search John wants,
at panel granularity instead of pixel granularity, and every part of it is already the strongest
code in the project. **A is the upgrade once B proves the game is fun.**

> 🚩 **RESOLVED BY PLAY, 2026-08-07: B WAS BUILT, PLAYED, AND REJECTED. THE BUILD IS NOW A.**
>
> John, after playing the segmented build: *"I don't really want to use the dud bay. I wanted a
> whole new system where white chucks fall off when hit with the hammer."*
>
> **He is right, and this section predicted why.** §1 justified the whole design on the grounds that
> *"with a handful of fixed candidates you find the way through by counting padlocks. Here there is
> nothing to count — the wall is continuous and the answer is inside it."* **Nine bays per wall is
> nine countable candidates.** The segmented shortcut reintroduced the exact defect the design was
> written to remove; it just moved the counting from padlocks to panels. The proof-of-concept did
> its job and the answer it returned is *"do the real one."*
>
> ⚠️ **AND "A IS NEW RENDERING WORK" OVERSTATES IT — the expensive half is already built.**
> `breakmask.js` grows the ragged hole, the crumbling lip and the dark undercut by comparing a baked
> break-order field against **one scalar uniform**. Positional destruction changes *where that
> threshold comes from* — a texture sample instead of a uniform — and every part of the look
> survives untouched. **The genuinely new work is not the rendering. It is PASSABILITY**: a
> continuous wall has no stages to hang collision, pathfinding and line-of-sight off, so a CPU-side
> damage grid has to become the gameplay truth, with the GPU reading the same grid so what you see
> and what you can walk through cannot drift apart.
>
> **What survives from B:** the interconnect concept, the two-sided barrier, the house-wide unlock,
> the depth falloff, the duds-become-routes payoff — all of §1, §5 and §7. Only the *granularity*
> changes, from nine panels to anywhere you swing.
>
> **Decided with it (John, 2026-08-07):** holes open **wherever the hammer lands**, at any height,
> as in the reference art. ⚠️ **That knowingly gives up the "too low for the hunter" refuge** — the
> 1.80 m low bay from §5 and the D7 mechanic it echoed. Logged as a deliberate trade, not an
> oversight; if the refuge is wanted back it must be re-earned by another means.
>
> Slice: `chunks-1` (`docs/slices/task-chunks.md`). Campaign: `docs/design/dig-campaign.md`.

## 4. The hard constraint — ✅ **SOLVED 2026-08-05 (`instancing-1`), and this section is now history**

⚠️ **THE FIGURE BELOW WAS STALE AND STALE IN THE DANGEROUS DIRECTION.** *"614–617 of 625, about
eight spare"* re-measured on the same twelve parked stations reads **625 and 627** — the gate was
already failing on one run in two. **It is now 580–586, i.e. 39–45 calls of headroom**, and more
importantly the cost no longer scales with panel count. Full write-up in `HANDOFF.md`.

⚠️ The original constraint, kept because it is why the work was done:
**8 panels already account for 32 of the game room's 37 meshes.** Segmenting five shared walls into
even 8 pieces each is **40 panels** — several times the entire budget of the day.

**So the promote-on-damage design already written in `gameplay-plan.md` §4 is not an optimisation
here, it is a prerequisite:**

- an **undamaged** segment is cheap single-stage geometry, ideally instanced across the whole house;
- a segment **promotes** to the full layered multi-mesh stack the first time it takes damage;
- it **demotes** (or freezes) when it is finished and the player has moved on.

**Distant walls need one stage of state, not five layers of geometry.** Nothing in this design ships
without that.

### ✅ What is actually built, and what a segmenting round can rely on

`src/game/wallinstances.js` + `src/game/wall.js`, behind **`?walls=legacy|occlude|instanced`**
(default `instanced`; `legacy` reproduces the pre-change build to the digit at all twelve stations).

- **A PRISTINE PANEL COSTS NO DRAW CALL OF ITS OWN.** Every undamaged panel in the house is drawn
  from one shared `InstancedMesh` pair per **authored aperture** — today 2 apertures, so **4 meshes,
  fixed at construction, on every seed** (128 re-plans, 38 distinct (site, lock) outcomes, one
  geometry signature). Forty segments of one aperture is still 2 meshes.
- **Measured flat**: across twelve stations carrying 2–15 panels on screen, panel draw cost is
  **4–9 calls**, where before it was **10–51 and tracked the count**.
- **Promotion is five `visible` flags and one instance matrix.** No geometry is created or
  destroyed — the layered stack is still built once at construction, so a segment that is dug into
  cannot pay a first-draw GPU upload. Measured on the promotion frame: **14.40 ms against a
  surrounding median of 16.70, `dtex 0 · dgeo 0 · dprog 0`.**
- **A second, independent win the depth falloff will want:** a layer whose break amount is exactly 0
  is an opaque occluder for the layers behind it, so those are not drawn. Layer planes drawn per
  stage at one station: **stage 0 → 11 of 44 · stage 1 → 22 · stage 2 → 33 · stages 3–4 → 44.** So a
  segment that bottoms out shallow stays cheap, which is exactly what §5's *"most digs are duds"*
  needs.

⚠️ **THE ONE THING A SEGMENTING ROUND MUST RE-MEASURE: there is NO DEMOTION.** A panel that has
taken damage keeps its own stack for the rest of the round (§4 above sanctions *"demotes **or**
freezes"*). That is bounded by residency today and by the fact that a run can only damage a handful
of panels — but **dig makes deep digging routine and could put a dozen promoted segments in one
room.** Re-run `harness/scenarios/inst-census.mjs` after the first segmented build and decide then.

⚠️ **AND `PANELS` IDS ARE STILL A NETWORK PROTOCOL SURFACE — append, never insert.** Instancing
does not change that; the instance slot index is derived from the panel list at build time and is
never sent.

## 5. "Big chunks, then less" is DEPTH, not time — and it is the best idea in the design

John, clarifying: *"I mean that as you get closer to the barrier it takes less and less until you
can only see the barrier."*

**So the falloff is spatial, through the thickness of the wall.** The first hits tear out big
chunks; the deeper you get the less each hit removes; and it bottoms out with the **barrier**
exposed and no further progress possible.

**That turns the diminishing return into a SEARCH HEURISTIC MADE PHYSICAL, and it is the whole
mechanic.** The player is not told where the interconnect is. They learn to read *how fast the wall
is giving way*: chunks still coming = keep going; down to chips = this spot is bottoming out, move
along the wall and start again. **The feedback and the puzzle are the same channel**, which is why
this is a better idea than a run-timer — a timer pressures you, but it tells you nothing.

### ✅ The existing stage table is ALREADY this gradient, and it already has the right shape
`STAGE_DEFS` is not an arbitrary state machine — it is **the wall's layers going inward**:
wallpaper → plaster → lath → beam. And the healths are **40 · 70 · 55 · 90**, so **the deepest
layer is already the most expensive by a wide margin.** *"Less and less the closer you get"* is
close to what the table already does; it needs tuning and a terminal state, not inventing.

**The one change: a normal segment must bottom out at BARRIER, not at OPEN.** Today the last stage
is `open` — passable. Under this design:

| | terminal state | meaning |
|---|---|---|
| **ordinary wall segment** | **`barrier`** — visible, impassable, undamageable | *"you dug all the way and this is not the way through"* |
| **the interconnect** | `open` | the one place the wall bottoms out into a passage |

⚠️ **Do not make the barrier look like failure — make it look like an ANSWER.** The player should
read *"not here"* and move, not *"this is broken"*. It is the only surface in the game they cannot
damage, and it is human-made — the same storytelling as the padlocks: **someone built this to keep
you in.**

### The barrier is TWO-SIDED
John: *"and you can't damage the walls on the opposite side of the barrier either."*

**So the barrier is a property of the room BOUNDARY, not of either room's wall**, and it stops
digging from both directions. Model it **once per shared edge**, not twice — two independent
barriers that have to be kept in agreement is a desync waiting to happen, and the id is a network
protocol surface.

**This closes the obvious exploit before it exists: you cannot meet in the middle.** Two players
digging toward each other on opposite faces of the same wall never connect, however long they work.
**The interconnect is the only connection point, exactly as specified** — and that has to be true
*mechanically*, not just by level design, or the first coordinated pair of players deletes Act 1.

It also fixes what digging *is*: **you always dig inward from your own side and stop at the
boundary.** Depth is per-side; the barrier is the shared floor of both sides. Exposing it from room
A tells you nothing about how far anyone has dug from room B — **which is a real piece of hidden
information in a multiplayer game, and worth keeping.**

### 🆕 And "beneath the walls" gives back a mechanic that was thought lost
John: *"beneath the walls there is a secret pathway into the next room."* ⚠️ **There is NO VERTICAL
AXIS** (`Player.update` ends with `this.pos.y = this.world.floorY` unconditionally), so this cannot
be a crawl-down. **But it does not need to be — a gap at the BASE of the wall is a passage on the
floor plane, and the robots are small.**

**Which means the interconnect can be too low for the hunter.** That is exactly the D7 mechanic —
*the chapel is a refuge that growth takes away* — reappearing for free, and it is already loved,
already measured, and already the reason a stage-3 hunter breaches instead of squeezing.

⚠️ **Must be measured, not asserted.** The escape siege is tuned to **15.5–25.1 s** with a hunter
that leaves PATROL within one stage. A depth curve that turns a 20 s dig into a 90 s dig invalidates
every one of those numbers. **Re-run `eo2-siege.mjs` and `pc7-play.mjs` after tuning it**, and note
that *searching several dud spots* is now the common case — the honest metric is **time to find the
interconnect**, not time to open one segment.

## 6. "Utterly satisfying" — what that means concretely

The bones are unusually good already: five stages, damage carried through, debris and dust, the
crumbling lip, and a torn edge whose silhouette was authored rather than stencilled.

What digging specifically needs on top:
- **Progress you can read on the wall itself** — the lip advancing is the feedback; it should be
  legible from where you stand, not just in a close-up.
- **The last hit should feel different from the ninetieth.** A breakthrough beat: sound, light
  through the gap, dust pushed toward you.
- ⚠️ **The BEAM stage is already the payoff and must not be spent early**: `blocksSight: false` at
  the last and most expensive stage means **you see through before you can walk through.** For
  digging, that is the moment you learn whether you found the interconnect or wasted the wall.
- **Debris that persists** in the hole you made, so the room records what you did to it.
- ⚠️ **The skate drift trail is the cautionary tale**: it cost **+82 draw calls for 76 sprites** and
  was flagged *"fine for a studio view, NOT for the mansion — instance before wiring into `game`."*
  **Every particle in this design must be instanced from the start.**

## 6a. Art direction — John's generated gallery-dig reference (2026-08-04)

> 🚩 **SUPERSEDED IN PART, 2026-08-07 — THE MATERIAL LANGUAGE IS NOW WHITE AND CYAN, NOT BRICK.**
>
> John generated nine more images and restated the direction:
>
> > *"big chunks of the wall falling away. Its just white underneath and they are trying to find the
> > doorway hidden behind the wall… I want the feel of sledge hammering the wall to be satisfying
> > and familiar."*
>
> The new set shows **destructible white paneling over indestructible cyan structure** — one of them
> labels exactly that — and the tool in the robots' hands is a **sledgehammer**, not a detached limb.
> Per this project's standing rule, **when the spec and the art disagree, the art wins.**
>
> **What that changes below:**
> - §6a.1's resolution — *"the layers read wallpaper → plaster → lath → beam → BRICK"* — **no longer
>   holds for dig bays.** The barrier is **cyan structure**. The reasoning in §6a.1 was sound against
>   the reference it had; it simply has a newer reference now.
> - ⚠️ **`mat.lath` and the planned brick material are OBVIATED on this critical path.** They existed
>   here to dress the barrier. `mat.lath` remains a piece on the board in its own right; it is no
>   longer a dig dependency.
> - **§6a.2's argument about the HUD survives and is strengthened.** The new annotated image also
>   carries a `DESTRUCTION METER`. It is generated furniture for the same reason the *"WALL SMASHED:
>   85%"* readout was: **a number replaces the physical tell, and reading how fast the wall gives way
>   IS the search.** Recommendation is unchanged — no numeric readout; spend legibility on the wall.
> - The new set adds a **four-stage barrier diagram** (micro-fracturing → visible strain and pitting
>   → structural failure → deep collapse) which maps onto the existing dig stages. **The barrier
>   itself stays undamageable** — it is the answer, not a fifth thing to break.
> - ⚠️ **The scope of the pivot is a John decision, pending** (`docs/design/dig-campaign.md` §2.3,
>   decision 1). Recommendation on the table: **dig bays only this campaign** — the timber stages
>   carry `wall.sheet` PASS 78, the board's only material PASS lineage, and doors and exits keep
>   them.
>
> **What survives untouched:** everything in §6a about composition, chunk scale and count, the
> ragged lip, the dust plume, persistent floor rubble, and *the robot standing BESIDE the hole rather
> than square in front of it.* The 2026-08-04 image remains the bar for all of that.
>
> ✅ **CONFIRMED BY JOHN 2026-08-07, and the layering is now explicit:** *"white under the asset as
> a destructable wall, the cyan barrier forces the player to find the interconnect to the other
> room."* So the read is **ornate surface → white destructible body → cyan barrier**, and the scope
> is dig bays only; doors and exits keep the timber stages. He also confirmed **global unlock** in
> his own description, and **no numeric meter**.
>
> 🆕 **A LATER IDEA, LOGGED SO IT IS NOT LOST:** *"the cyan wall maybe see through but still a clear
> barrier in the future."* A translucent, impassable barrier would let a player **see the room they
> cannot reach** — the same beat the BEAM stage already earns with `blocksSight:false` at the last
> and most expensive stage. ⚠️ **Not scheduled**; take it only if `whitecyan-1` gets it nearly free.
>
> Campaign: `docs/design/dig-campaign.md`. Slice that executes the re-skin: `whitecyan-1`, Wave 3.


**`refs/dig/dig-gallery-leg-breach.jpg`** — indexed in `refs/REFERENCE_INDEX.md` and `_index.tsv`.
A `room.gallery` frame: a robot blowing a person-sized ragged hole in the gallery wall, a detached
mint-green **leg** in the blast, brass gadget in hand, debris in flight, rubble already on the
parquet. ⚠️ **1024×576, not 1920×1080 like the `bf1` plates — judge composition, chunk scale and
debris behaviour against it, NOT fine surface detail, and do not read its softness as art
direction.**

**What it CONFIRMS about what is already built:**
- **The hole is ragged with a crumbling lip and a person-sized silhouette** — which is exactly what
  `breakmask.js` produces (authored break-order threshold + darkened lip band). **The approach is
  right; the art is reachable with the existing mechanism.**
- **Rubble persists on the floor** well after the event, as §6 asked.
- **A detached limb is the tool.** Limbs are already health *and* weapons (`limbClub` 34 dmg), so
  the game's core mechanic is already the image.
- **The robot stands BESIDE the hole, not square in front of it**, and the hole is fully legible.
  ⚠️ **That is the answer to `play-critic-8`'s finding that the player's body covers the centre
  third of the aperture at the only station you can shoot from** — its proposal #5 (offset the boom
  laterally near a connector) is what makes the game frame look like this frame.

**What it CONTRADICTS, and both need a decision:**
1. ✅ **RESOLVED — the masonry is not a contradiction, it is THE BARRIER.** I first read the art's
   brick as conflicting with our timber stages (wallpaper → plaster → lath → beam). It does not.
   **The existing reference set already shows exactly this construction:**
   `refs/lath/lath-tower-of-london.jpg` is *"bare framing against BRICK — the stage-3 reference"*,
   and `refs/lath/demo-selective-12.jpg` is *"plaster stripped back to brick with lath fragments."*
   **Lath and plaster on studs, in front of a masonry wall, is a real building** — and it is the
   building we already collected photographs of.

   **So the layers read: wallpaper → plaster → lath → beam → BRICK, and the brick is the thing you
   cannot get through.** That gives §5's barrier a material identity that is physical rather than
   arbitrary, it is already photographed, and it explains the two-sided rule for free: **the same
   masonry wall is the barrier from both rooms.** ⚠️ It also means `mat.lath` — one of only three
   NOT_BUILT pieces — is still needed, **plus a brick material for the barrier**, and the brick
   course line is what gives the eye something to measure dig progress against.
2. 🚨 **THE HUD IN THE ART WOULD DELETE THE MECHANIC JOHN JUST DESIGNED.** *"WALL SMASHED: 85%"*
   is generated furniture, but if the game printed it, **nobody would ever read chunk size again** —
   and §5's whole idea is that *the rate the wall gives way* is the search heuristic. **An explicit
   percentage replaces a physical tell with a number and throws away the best part of the design.**
   Recommend: **no numeric readout.** If digging needs legibility, spend it on the *wall* — course
   lines, chunk scale, the lip advancing — not on the HUD.

## 7. What this supersedes, and what survives

**Survives, and is now load-bearing:**
- `connectors.js`'s four states — chained doors are the "cosmetic doors" John describes, and the
  interconnect is a fifth state or a special exit.
- `pathPortals()` — BFS over whatever is open right now. **Needs no work; it was built for this.**
- The escape design entirely: exits to outside sit alongside interconnects, and *"you do not know
  if it leads outside or to another room"* becomes literally true of every hole you dig.
- The hunter's breach behaviour, promoted from a beat to the core threat.

**Superseded or reduced:**
- The **six-space floor plan with corridors** — five rooms sharing maximal edge is a different,
  blockier layout. ⚠️ Good news for residency: fewer long sightlines than the current hub-and-spoke.
- ⚠️ **`PATROL_ROUTE`, `SPAWN` and `ANCHORS` are hand-authored** against the current plan and become
  generator outputs.
- ⚠️ **D7 is 1.20 m ON PURPOSE** — a stage-3 hunter cannot fit, which is what makes the chapel a
  refuge that growth takes away. **A generated layout must be able to place such a room
  deliberately, or that mechanic is lost.**

## 8. Order of work

> 📌 **2026-08-07: items 4, 5 and 6 are now the DIG CAMPAIGN** — `docs/design/dig-campaign.md`.
> Item 4 (the decay curve) is slice `decay-3`, Wave 2. Item 5 (satisfaction) is `satisfy-1`,
> Wave 3, preceded by `whitecyan-1` for the white/cyan re-skin and `sledge-1` for the hammer
> itself — **the tool changed, so §6's "utterly satisfying" is now about a sledgehammer.**
> Item 6 (the generator) is `gen-1`, Wave 4, and it carries `procedural-map.md` §5's solvability
> gate over 512+ seeds.


1. ✅ **BUILT (`dig-1`, 2026-08-05).** **Segmented walls + promote-on-damage** (§3B, §4). Prove the draw-call budget survives at the
   twelve parked stations **before** anything else is built on it. *This is the gate.*
2. ✅ **BUILT (`dig-2`, 2026-08-05).** **The interconnect**: one hidden connection per shared wall, seeded, with the barrier and the
   house-wide unlock. ⚠️ **The unlock is GLOBAL and §1's flagged reading was taken** — a reason it
   is wrong was looked for and not found; `?unlock=global|edge|off` keeps the question answerable.
   Finding it costs **4–7 dud bays and 28–49 s** across three seeds (`harness/scenarios/dig-link.mjs`).
3. ✅ **BUILT (`dig-2`).** **The hunter crossing the barrier** — mostly wiring what exists. ⚠️ **And
   its hole is not the player's hole**: a segment is now a 1.80 m LOW BAY (§5's *"beneath the
   walls"*, and `rules.js` `PASS_H` is where the two clear heights live), so the dig network is
   robot-scale and the hunter's crossing takes the masonry, the lintel and the bay next door — a
   2.28 × 4.80 breach. Measured in `harness/scenarios/dig-low.mjs`, not asserted, per §5's own
   demand.
4. **The decay curve** (§5), then **re-measure the siege and escape times**. ⚠️ The curve has NOT
   been retuned since `dig-1` set it, and the siege was re-measured anyway after the low bay and
   the hunter routing landed: **15.4–25.1 s against the recorded 15.5–25.1** (`eo2-siege.mjs`).
5. **Satisfaction pass** (§6), instanced from the start.
6. **The generator** for room placement — and §5's solvability gate from `procedural-map.md` still
   applies: **at least one interconnect reachable, nobody sealed in, the hunter able to reach
   everyone, and a minimum walk.** Assert it over 512+ seeds, the way `escape.mjs` already does.
