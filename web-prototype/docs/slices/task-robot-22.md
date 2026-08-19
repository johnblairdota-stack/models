# Slice: `char.turnaround` — the material pass, round 22

**Owner for this slice:** one agent, run alone. **Files you may edit — nothing else:**
- `src/views/_studio.js` — **additively only, see change 1**
- `src/materials/surfaces/robot.js`
- `src/characters/unit4h.js` — only for change 4

Where a number is given, use it as a **starting point and then tune against the render** —
this slice is different from its predecessors in that respect, and change 1 says so
explicitly. **If a stated fact turns out to be wrong, say so in your report rather than
diverging silently.** Four builders in a row have done that and all four were right.

> **Why this round is different.** The last five rounds moved geometry and the score went
> 48 → 54 → 58 → 53 → 46. Three critics in a row have ranked material as a major miss and the
> most recent one says the highest-value surfaces are **ready now**, not blocked. This round
> touches almost no geometry.

---

## 1. The studio environment has nothing dark to reflect — ADDITIVELY

`buildStudioEnv()` in `_studio.js` builds a bright room: ceiling softbox at 7.5x, side fill
3.2, kick 1.5, back rim 2.4, room shell `0.72` grey, floor bounce `0.62`. **Nothing in it is
dark.** `robot.js` says it in its own comment: *"A metal has no diffuse term: it is ONLY what
it reflects."* Chrome surrounded exclusively by bright panels renders as uniformly bright grey
at any `envMapIntensity`. That is the mechanism behind "flat matte, no specular pop."

The art's crispness comes from its **darks** — the chrome limbs carry visibly dark reflection
bands. This environment cannot supply them.

**CRITICAL — blast radius.** `buildStudioEnv` is shared by nearly every view in the project,
including `wall.sheet`, which holds the **only critic-awarded PASS on the board**. You must
not change what existing callers get.

Add an **opt-in high-contrast variant**, with the default preserving current behaviour byte
for byte:
- give `buildStudioEnv(renderer, opts = {})` a `contrast` option, default `0` = today's env
- cache the variants separately — the current code memoises a single `_studioEnv`, so a second
  variant needs its own cache slot or it will return the wrong one
- at `contrast > 0`, add **dark elements** the chrome can reflect: drop the room shell toward
  `0.20`, add two dark flag panels at +/-X, and darken the floor bounce. Keep the bright
  panels as they are so exposure does not move.
- thread the option through `studio()` and opt in **only** from `char-turnaround.js`

Then verify: shoot `wall.sheet`, `mat.marble` and `game.play` and confirm they are unchanged.
If any of them shifts, the default path is not preserved and that is a bug, not a tradeoff.

**Tune this against the render.** The goal is chrome that carries a dark-to-bright gradient
rather than a flat wash. Too much and the robot goes murky — a previous round already had to
fix exposure sitting below the sheet's key, so watch that you do not undo it.

---

## 2. White shells have essentially zero specular

`critic-robot-21`, answering directly: *"Torso/chest shell — ready now. Panel boundaries
already exist; largest surface in every view; currently flat matte pale white vs. the art's
dark brushed steel with real highlight streaks."* And: whites and chromes are failing
**differently** — chromes have a real metal response that is merely dull; whites have flat
diffuse only.

`shellWhite()` already sets `clearcoat: 0.9`, `clearcoatRoughness: 0.075`,
`envMapIntensity: 1.0`. On paper that should produce a bright specular lobe. **Find out why it
does not read** and report what you find — that diagnosis is worth more than the fix.

Prime suspects, in order:
1. the environment has no darks for the clearcoat lobe to contrast against (change 1 may fix
   this on its own — do change 1 first and re-look before touching this file)
2. `envMapIntensity` of 1.0 against a very bright env washes the lobe flat
3. the roughness texture may be uniform in practice, so there is no variation to catch light

Target: the torso and head dome read as **shells with a highlight that moves across them**,
not as flat paper. Do not make them grey — the art's shells are near-white.

---

## 3. Sharpen the chrome — hip discs first, they are the cheapest win on the board

`critic-robot-21`: *"Hip discs — ready now. Stepped-ring geometry is a confirmed win already
built; just needs a chrome specular response instead of soft matte. Cheapest fix on the
board."*

`chromeSatin()` runs `envMapIntensity: 2.4`, `roughness ~0.28`. With change 1 giving it darks
to reflect, it may sharpen on its own. If it does not, lower the roughness toward `0.18` so
the ring steps catch hard highlights and read as machined metal.

**Do NOT add specular to the ear-disc lens.** Same critic: *"do not add specular to the
ear-disc lens itself until its size/dominance is fixed geometrically — polishing it now would
worsen complaint #1."* The ear already dominates the profile silhouette; making it shinier
makes the piece's top complaint worse. Head **shell** yes, ear lens no.

**Legs and boots are BLOCKED** on geometry — the knee ball still bulges and the boots have no
surface breaks. Do not spend effort there this round; it will not read.

---

## 4. Recover the draw-call regression — delete the leg seams

Perf now fails the gate on both axes: **648 draw calls against a 625 budget**, GPU 1.51–1.58 ms
against 1.389 ms. Two independent measurements agree.

The cause is understood. `collapseDrawCalls` emits one merged mesh **per material per joint**.
Round 20 added `mats.gap` seams to hip and knee joints that had no gap material, creating new
groups — about 8 per robot, times the 4 copies on the sheet.

**Delete `thighSeam${side}` and `shinSeam${side}` entirely** (construction, the `.add()` calls
and any `parts.` keys). They were my idea, they cost 32 draw calls, and the critic that
followed still called the legs "three bulging lobes" — so they did not buy the panel read they
were added for. Removing them is not a regression; it is undoing something that did not work.

Confirm calls drop back to ~616 and report the number.

---

## Presentation requirements

Read the "Presentation requirements" section of `docs/slices/task-robot-15.md` and follow it.
The one that matters most here: **exposure must still match the sheet's high-key** afterwards —
a critic verified it does today, and change 1 can easily break it.

## The traps

- **Never put a backtick inside a GLSL template literal** — it terminates the JS string.
- **Never name a GLSL variable with a reserved word**: `cast`, `sample`, `filter`, `input`,
  `output`, `matrix`, `texture`, `buffer`.
- **`fbmT` sums octaves**, so its output is a narrow bell around 0.5 and a gate at 0.9 never
  fires. Four files here have had authored detail that never drew for this reason.
- **Prefer `Edit` over scripted string replacement.**
- The dominant failure here is **code that looks right and renders nothing.** Shoot and look
  after each change.

## Verification

```bash
node harness/shoot.mjs --view char.turnaround --review 1280
node harness/sheet.mjs --img progress/shots/char.turnaround.png --img "C:/Users/John/Documents/Run Robot Run/Dev Art/1785277053522.png" --out "C:/Users/John/AppData/Local/Temp/cmp22.png" --cols 1
```
**And the blast-radius check, which is mandatory:**
```bash
node harness/shoot.mjs --view wall.sheet --view mat.marble --view game.play
```
Compare those three against their previous shots. Unchanged is the pass condition.

```bash
node harness/shoot.mjs --view char.turnaround --view hunter.3 --view gadget.nailgun --view limb.detach --view game.play
node harness/audit.mjs --render
```
Perf: pin `--extra "quality=medium"`, several samples, report raw numbers and the harness's
printed budget. Change 4 should bring calls back under 625.

**You may not score your own work.** Do not run `status.mjs set`. Ceiling is PASS; only a
`critic-*` sets WOWED.
