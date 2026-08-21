# Agent resume pack — session limit 2026-08-04 ~10:47 (reset 12:20pm Brisbane)

Three agents killed mid-task. **Tree verified AFTER the kills: `npm run build` green ·
`harness/mechanics.mjs` 11/11 · `harness/scenarios/escape.mjs` exit 0.** Their edits survive;
their reasoning does not.

## ⚠️ THE TASK NOTIFICATIONS LIED — they showed each agent's FIRST message, not its last

Taken at face value, `exterior-owner-1` had done nothing ("I'll start by reading the required
documents"). On disk it had written **`src/game/exterior.js`, 33 KB, imported by `spaces.js`**.
**Do archaeology on every kill; never trust the death quote.**

Preamble to give each respawned agent, verbatim:
> Your predecessor was killed mid-task by a usage limit. Its edits survive; its reasoning does
> not. Inspect the files it owned, capture current renders, verify `npm run build` compiles, and
> continue from what is on disk. If a stated fact turns out wrong, say so rather than diverging
> silently.

---

## 1. `exterior-owner-1` — MOST OF A ROUND LANDED

> ⚠️ **CORRECTION (`exterior-owner-2`, 2026-08-04): "imported by `spaces.js`" IS FALSE, in both
> places this document says it.** `spaces.js` mentions the word "exterior" in two comments and
> imports nothing. **Nothing in the repo imported `exterior.js`**, so vite tree-shook all 33 KB
> out of the bundle and not one line of it had ever run — which is why the way out was still a
> black rectangle after "most of a round landed". It is wired into `src/views/game.js` now. The
> file size was right; the import was inferred. See HANDOFF's "THE OUTSIDE IS WIRED IN".

**On disk:** `src/game/exterior.js` (33 KB), ~~imported by `src/game/spaces.js`~~. Header documents
three owned things — daylight per exit yard (resident only while that site exposes it), the
**concealment tell** (live exits *leak*: seam of daylight, draught carrying dust inward, cold
patch on the floor; chained exits are dead flat and carry chain/padlock/hasp), and a walled court
per yard with real colliders because the hunter follows you out.

**Two self-imposed constraints worth preserving:**
- ⚠️ **NO NEW LIGHT, EVER.** `numPointLights` is part of three's program cache key, so one added
  light recompiles every material — a clean 1.28 ms capture became "execution context destroyed"
  with a 2.5 s worst frame. Everything is **baked**: `MeshBasicMaterial` + per-vertex colour, sun
  / sky dome / ground bounce evaluated once on the CPU at build time.
- ⚠️ **NO NEW GLSL.** Three bundle breaks in one week came from a backtick in a shader template
  literal. It reuses `lighting/volumetric.js` instead of writing shader source.

**Unverified and the first thing to do:** *does the way out actually show daylight now?*
**Re-capture `progress/playtest/game.play.esc1b-the-way-out.png` and prove it changed.** Then the
ablated draw-call A/B (twice), and prove residency keeps the exterior off the bill indoors.

## 2. `gadget-owner-5` — THE MISSING INSTRUMENT LANDED

**On disk:** `harness/scenarios/gadget-stage.mjs` — **the equip-a-gadget-and-park scenario
`critic-gadget-4` could not find.** That was item 2 of its brief and it is the thing that makes
the `heatWash` verdict reproducible. Also modified: `src/gadgets/index.js` (heatWash lives here)
and `src/game/limbs.js`.

**Died at:** *"The art is unambiguous — hottest at the grip/coil end, dark cap at the muzzle. The
render has it backwards. Let me flip it."* — so **the nailgun heat-gradient flip is probably NOT
applied.** Check before redoing it.

**Still open:** the `heatWash` contradiction (critic picked the normal blend, which `fx-glow`
measured as INERT on this backdrop; the promising answer is gating wash strength by the SURFACE
it lands on), whether the shipped setting ever took effect, and the grapple housing (46, lowest
on the board, untouched for two rounds).

## 3. `estate-owner-8` — ✅ RESPAWNED AS `estate-owner-9` AND LANDED. See HANDOFF's
## "estate-owner-9 (r9)" section; this entry is kept only for the archaeology trail.
##
## What was on disk was good: the `uMedal` bullseye gate in `materials-local.js` was correct
## and is now validated by a break-test, and the 384 -> 640 cube in `room-ballroom.js` was
## real but — measured — a NO-OP, because PMREM floors a cube to a power of two and the mip
## the shipped roughness asks for (7.44) is under BOTH cubes' CUBEUV_MAX_MIP. The mirror is
## now a true planar reflection and both plates are legible. The dying question ("check
## three's actual PMREM roughness->mip mapping rather than trust memory") was the right one
## and memory would have got it wrong.

### Original entry


**On disk:** `harness/evidence/_tmp_eo8_glassuv.mjs` and `harness/evidence/_tmp_eo8_mirror.mjs` — so it probed both
the bullseye-decal cause and the mirror. Also modified: `src/world/materials-local.js` and
`src/views/room-ballroom.js`.

**Died at:** *"Let me check three's actual PMREM roughness→mip mapping rather than trust memory."*
— mid-mirror, and about to verify rather than assume, which is the right instinct: **continue
that check.**

**Its brief:** ballroom **63** is the group's weakest. (1) the new bullseye decal on all four
windows — check the `worldUV` metres-per-repeat trap FIRST, it may be a one-number fix; (2) the
**far** mirror reads as illegible haze, and a **true planar reflection** (mirrored camera +
screen-space UVs) is the named exact answer, affordable because the camera is static — cost it
honestly; (3) settle the unverified "reflects the chequer floor" claim.

---

## Board at the pause (all critic-owned, still 0/37 WOWED)
estate **63–74** (`light.shaft` 74 is the highest score in the project) · gadgets 46–67 ·
`game.play` BUILDING r10 unscored · hunter 50–63 · char.locomotion 61 · char.turnaround 61 ·
mat.robot 51.

## Standing rules
`npm run build`, never `npx vite build`. Only critics award WOWED; builders never score their own
work. One owner per coupled concern. **`status.mjs --wins` REPLACES, it does not append.** Every
brief carries "if a stated fact is wrong, say so rather than diverging silently" and "validate an
assertion by breaking it once" — between them they have overturned a dozen false facts and six
lying instruments, including three of the lead's own.
