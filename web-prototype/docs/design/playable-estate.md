# Getting the estate into the game

John, 2026-08-04: *"the playable slice is very bland and boring. is there a plan to build a
playable slice with the estate assets we spent so much effort on?"*

**There was no plan. He is right, and the gap is structural rather than cosmetic.**

---

## 1. What is actually wired, verified in code

`src/views/game.js` imports **none** of the estate world. Not `props.js`, not `chandelier.js`,
not `practicals.js`, not `volumetric.js`. It imports `rig.js` for **`GRADES` only** — the colour
grade, not the lighting.

`src/game/room.js` dynamically imports `materials-local.js` and takes **six materials**, at
reduced size, each with a plain-PBR fallback:

| slot | maker | size |
|---|---|---|
| floor | `parquetMat` | 1024 |
| wall | `boiserieMat` | 1024 |
| ceiling | `ceilingMat` | 512 |
| mould | `giltMat` | 512 |
| skirt | `stoneMat` | 512 |
| reveal | plain PBR | — |

Its own comment says why: *"Deliberately a SMALL set… most of the texture budget for one test
room."* **And the function that builds the playable space is called `buildTestRoom`.** The file
is honest about what it is; nobody had noticed that it never stopped being that.

**So everything the estate group has been scored on is in views nobody plays:** the chandelier
(72), the sconces and candelabra and their flicker, the light shafts, dust motes, light pools and
glow patches (`light.shaft`, 74 — the best lighting work in the project), the pier glass and
mirrors (`room.ballroom`, 76 — the best piece in the project), the urns, dust-sheet rows, chair
rows and console tables, the portraits and sitters (`room.gallery`, 75), the stained glass, the
cartouche, the marble and the tapestries.

## 2. Why it is not a copy-paste — one number, measured this week

🆕 ⚠️ **UPDATE 2026-08-04 — THE 19 POINT LIGHTS MAY BE ALMOST FREE TO DELETE, WHICH CHANGES THIS
WHOLE SECTION.** `estate-owner-12` ablated them live and measured their contribution:
**all 19 point lights OFF moves the lit floor by −0.8%.** They cost **47% of the frame** (−1.10 ms)
and deliver **under 1% of its light.** The room's actual lighting is one spot plus the sky shell.

**So the premise below — "the estate look is mostly lighting and lighting is unaffordable" — is
probably wrong in the direction that helps.** What made these rooms look good was never the
practicals; it was the *shaping*, and shaping is a few sources plus geometry that casts shade.
**Re-price the port on that basis before assuming rooms cannot fit.** (They were not cut in the
showcase view because they are a *look* call there — visible sconce glow, candle pools — not
because they earn their cost.)

**The estate look is mostly LIGHTING, and lighting is the one thing the game cannot afford:**

| | lights | GPU |
|---|---|---|
| `room.ballroom` | 19 point + 1 spot + 3 dir | 2.30–2.32 ms (killing the 19 points is **−1.10 ms, 47% of frame**) |
| `room.gallery` | 33 | 3.32 ms (**−2.42** when killed) |
| **`game.play`** | **fixed 5-light rig** | **1.22–1.38 ms against a 1.39 ms budget** |

⚠️ **`distance` culls a point light's CONTRIBUTION, not its COST — ~0.058 ms each, paid by every
fragment.** And `game.play` holds **up to six spaces resident at once** (portal residency), not
one room. Six rooms at ballroom density is ~114 lights ≈ **6.6 ms of lighting alone, about five
times the entire frame budget.**

⚠️ **CORRECTION, 2026-08-04, and it removes this plan's foundation.** This section originally read
*"draw calls, by contrast, have headroom: 423 against 625 — that asymmetry is the whole plan."*
**That is false.** `escape-owner-2` measured twelve **parked** stations and found the worst at
**598 / 625 BEFORE its round, and 616 / 625 after.**

The 413–423 figure — which the lead quoted here — comes from `perf-spaces` sampling a **moving
capture Director that never parks in the service passage**, so it never sees the worst case. **The
number was not wrong; it was answering a different question, and nobody had ever taken the
parked-worst-case reading.** It does not appear anywhere in HANDOFF.

**So there are ~9 draw calls of headroom, not ~202.** The asymmetry this plan was built on does not
exist: *both* budgets are effectively spent. That does not kill the approach — baked lighting is
still the only way the estate look can enter a six-space resident world — but it means:

🆕 **UPDATE 2026-08-05 (`instancing-1`): re-measured on the same twelve stations the worst was
625 / 627, i.e. already OVER, not 616. It is now 580–586 — about 40 calls of headroom.** Read that
as a runway, not a licence: item 1 below is the standing rule and it is now demonstrated rather than
argued. The wall panels went from **51 calls at the worst station to 6** and, more usefully, from
*scaling with count* to **flat**. The skate drift trail's standing warning — **+82 draw calls for
76 sprites**, *"instance before wiring into `game`"* — is unchanged and is exactly the same shape of
problem; `src/game/wallinstances.js` is the worked example and `exterior.js`'s connector dressing is
the other one.

1. **Nothing can be added until something is instanced or merged.** The estate props are exactly
   the kind of repeated geometry (chair rows, dust sheets, candles, balusters) that instancing
   collapses, so this becomes *pay for itself before you spend*, not *spend the headroom*.
2. **A room's worth of props must be measured at PARKED worst-case stations**, never from a moving
   route. Use `harness/scenarios/eo2-calls.mjs`'s twelve-station method.
3. **`?exits=4` and the other ablation toggles matter more now** — with 9 calls spare, every
   feature needs its own on/off switch to stay attributable.

## 3. The plan — spend draw calls, never lights

**The pattern is already proven in this repo.** `src/game/exterior.js` faced exactly this problem
and solved it, and its header states the rule: **NO NEW LIGHT, EVER** — `numPointLights` is part
of three's program cache key, so **one added light recompiles every material in the scene** (a
clean 1.28 ms capture became "execution context destroyed" with a 2.5 s worst frame). Everything
is baked: `MeshBasicMaterial` with per-vertex colour, sun and sky and ground bounce evaluated once
on the CPU at build time. **Measured cost: +3 draw calls when visible, +1 call and zero meshes when
not.** An entire outdoors for three draw calls.

Apply the same discipline inward:

1. **Bake the room lighting instead of running it.** Per-vertex or lightmapped, evaluated once at
   build time. The estate rooms are static; the only things that move are the robots, the hunter
   and the debris, and those already have the five-light rig.
2. **Practicals become emissive geometry plus a baked pool**, not `PointLight`s. `driveFlicker`
   can modulate an emissive value and a baked pool's intensity — **that costs nothing per
   fragment**, which is precisely where the 0.058 ms goes.
3. **Props come across under residency**, so a room's furniture exists only while that room is
   resident. The exterior already proves the accounting works.
4. **Instance the repeats.** Already flagged and not yet needed: the skate drift trail is 76
   sprites / +82 draw calls — *"fine for a studio view, NOT for the mansion; instance before
   wiring into `game`."* Same rule for chair rows, dust sheets, candles.
5. **One room at a time, ballroom first** — it is the best-scoring piece (76) and already a
   playable space.

## 4. Two honest risks

- **Some estate work is camera-specific and will not survive being walked through.** The ballroom's
  planar reflection is documented as **exact only for this camera**, and if the room becomes
  walkable with those plates it *"becomes a per-frame render per plate and must be re-costed."*
  Baked lighting is likewise one time of day and one set of open doors. **Expect to re-cost, not
  to port.**
- **The showcase views should stay.** They are the measurement rig — the reference frames, the
  grade gates and the blind A/Bs all live there, and they are how quality is judged at all. The
  change is that **the playable room becomes the deliverable and the showcase view becomes its
  target**, rather than the two being unrelated.

## 5. Why this is the highest-value work left

`play-critic-7` proved the game can be won and scored it **WEAK 64**. The estate group is at
**65–76**. Those numbers describe two different products. The estate effort only becomes the
game's quality at the moment a player stands inside it — until then it is a gallery of pictures of
a game.
