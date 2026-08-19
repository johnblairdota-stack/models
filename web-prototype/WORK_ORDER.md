# Work order — what to build first, and why

Measured, not guessed. `grep -rl` for importers of each module gives the real fan-out.

The rule: **fix a thing once, at the deepest point it is shared.** A defect in the base
robot is a defect in twenty pieces; a defect in `room.gallery` is a defect in one.

---

## The dependency tiers

### Tier 0 — infrastructure. Done, and now guarded.
`materials/baker.js` · `materials/glsl-noise.js` · `core/engine.js` · `post/` ·
`views/_studio.js` · `harness/`

Every piece in the project renders through these. They are stable and each of the four
silent-failure classes found so far now has a guard:

| failure | guard |
|---|---|
| perf measured on CPU while WebGL runs async | real GPU timer queries |
| quality tiers defined but never forwarded | tiers passed through, `--extra "quality=medium"` |
| perf sampled 4 s of a 26 s loop | `--perfms` covering a full cycle |
| shader compile failure baking an all-zero texture set | baker probes albedo, throws a named error |
| a piece scored above zero with a stub view | `harness/audit.mjs` |

**Do not casually edit Tier 0.** A regression here is a regression everywhere.

---

### Tier 1 — THE BASE ROBOT. Highest leverage in the project.
`characters/unit4h.js` · `materials/surfaces/robot.js`

**12 modules import the rig directly**, and `characters/hunter.js` is built entirely from
it — the hunter is the same chassis corrupted, which is the whole horror of it. Counting
transitively, one file is upstream of roughly **20 of the 37 pieces**: all four `char.*`,
all five `hunter.*`, all six `gadget.*`, `limb.detach`, `game.play`, and the room views
that place a robot for scale.

So every defect a critic found in the base robot is currently being inherited twenty
times over. As of the last critic pass those are:

- the head is a **sphere**; the locked art has a rounded-**cube** helmet with a flush
  rounded-rect faceplate. The left-profile view has no face and no ear disc at all.
- shoulder span measures **0.40 of body height against the manifest's 0.245** — a 64%
  overshoot, which alone makes the build read stocky against a "heroic-cute, slim limbs"
  brief
- mint shoulder caps are plain spheres, not the asymmetric teardrop over a visible chrome
  ball joint
- elbows are smooth tubes; the art has a stacked-disc ring hinge
- hands read as a solid mitt; the art has four fingers plus an opposed thumb, each
  visibly 3-segmented
- pelvis and knee drive discs are faint bumps, not concentric rings
- the back plate is a blank grey rectangle that reads as a missing texture

**Fixing these once fixes them everywhere.** This is the single highest-value work
available and it should be done before any more time goes into the hunter, the gadgets,
or the playable slice, all of which are currently inheriting a wrong silhouette.

---

### Tier 2 — surfaces shared by several pieces
`materials/surfaces/wallstages.js` — 5 importers: the five stage views, the sheet, the
transition, and the game room's real walls.

Currently the strongest area in the project (WEAK 63–66, `wall.sheet` at PASS 78, and the
blind-identification gate independently verified at two crop locations). Outstanding:
studs are dead-straight with identical section and uniform fresh-pine colour where
reference framing is mismatched, doubled and weathered.

---

### Tier 3 — architectural materials
`marble.js` (built, WEAK 55) · `walnut.js` · `wallpaper.js` · `plaster.js` · `lath.js` ·
`brass.js` — **four of six have never been built.** The rooms cannot be good until these
exist, so this blocks Tier 4 entirely.

---

### Tier 4 — rooms and lighting
`world/` · `lighting/` · `room.*` · `prop.chandelier` · `light.*`

Needs Tier 3. **Rooms and lighting are ONE concern and must have ONE owner.** Splitting
them is what produced a game frame rendered in flat monochrome amber: one agent set a
saturated key light, another tuned material roughness against a different grade, a third
owned the post stack, and nobody owned the look. A warm key must fall against a cool
fill, with the separation carried by the grade's shadow/highlight tint — never by
saturating the lights.

---

### Tier 5 — the game
`game/` · `net/` · `ui/` · `game.play`

Needs everything above. Systems already exist (limbs, player, weapons, hunter AI, wall
damage, HUD, a websocket server). Multiplayer has never been run with two clients.

---

## Which model for which job

Five Sonnet critics have now filed verdicts and **all five overturned a builder's
self-assessment**, four of them downward, one by 47 points. That is the strongest
measured result on this project.

**Sonnet should own CRITIQUE, and only critique:**
- Compare a render against a reference, work a checklist, file a verdict. Measured across
  five runs: 77k–142k tokens, 7–20 minutes, 3–5 pieces each. Run these generously.
- Blind identification gates. Purely perceptual, no architecture required.

**Opus should own BUILDING.** This was measured, and it contradicts an earlier version of
this file which claimed Sonnet could build against a precise defect list:

| | model | tokens | tools |
|---|---|---|---|
| `wall-agent` — full rebuild of 7 pieces | Opus | 322k | 165 |
| `robot-tier1` — 9 named defects on 1 file | Sonnet | **462k** | 171 |

The Sonnet build used **43% more tokens for a much smaller brief**, and still shipped a
regression (it deleted the mint shoulder caps, the character's signature read) plus a
measurement it could not make reliably. It reached a decent result by grinding more
iterations. Per unit of progress Opus was *cheaper*, not more expensive.

The reason generalises: every valuable finding on this project came from **diagnosing why
something invisible was happening** — a shader silently baking an all-zero texture, a
noise gate that never fires, arms swinging behind the body because shoulder rotation is
relative to a pitched chest, a "drip stain" that was exposed chrome catching a ceiling
reflection. Building here is not transcription, it is hypothesis work, and that is what
the stronger model buys. Comparing a render to a reference and listing what is wrong is a
genuinely different task, and Sonnet does it well for a third of the price.

**So: Opus builds, Sonnet judges.** Also Opus for anything touching Tier 0.

**The pattern that works:** Opus writes the spec once, Sonnet executes and judges against
it repeatedly. `ART_MANIFEST.md`'s landmark table is exactly this — because the
proportions are written down as numbers, a Sonnet critic could measure a 64% shoulder
overshoot without any judgement call.

---

## Standing rules for any agent here

- **One owner per coupled concern, and run them sequentially.** Parallel agents on a
  coupled system break each other's assumptions: `setPose` wrote into limbs another agent
  had detached; the amber frame needed materials, lighting and post to agree.
  Genuinely independent things (separate surfaces, separate props) can parallelise.
- **A builder may never award `WOWED`, and should not re-score its own fix.** The one
  score that went up under scrutiny was a fix whose author explicitly refused to grade it.
- **Never put backticks inside a GLSL template literal** — it terminates the JS string.
- **Never name a GLSL variable with a reserved word** (`cast`, `sample`, `filter`,
  `input`, `output`, `matrix`, `texture`, `buffer`).
- **`fbmT` returns a narrow bell around 0.5** and never reaches 0.9, so
  `smoothstep(0.9, 0.99, fbmT(...))` never fires. Stretch first with
  `pat(v,k) = clamp((v-0.5)*k+0.5, 0, 1)`.
- **Prefer `Edit` over scripted string replacement.** `Edit` fails loudly on a bad anchor;
  a `node` replace silently applies half its changes.
- **Measure perf at `quality=medium`** — `auto` selects `high` on a discrete GPU and that
  is not the target tier.
