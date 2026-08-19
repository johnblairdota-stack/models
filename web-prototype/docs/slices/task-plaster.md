# Slice: `mat.plaster` — lime plaster and horsehair

**Owner:** one agent, run alone. **Files you may edit — nothing else:**
- `src/materials/surfaces/plaster.js` (create it)
- `src/views/mat-plaster.js` (currently the `notBuilt()` stub — replace it entirely)

Do **not** touch `unit4h.js`, `robot.js`, `_studio.js` or `wall.js` — other agents are working
in the robot and the studio environment this round. If you believe you need a change in one of
those, **report it instead of making it**.

## Why this slice matters

`mat.plaster` is `NOT_BUILT` and it is the **last unbuilt architectural material**. All six
room/lighting pieces are blocked behind it, which makes it the highest-leverage unbuilt thing
on the board. An agent was previously assigned this and died before writing anything, so the
tree is clean — you are starting fresh, not resuming.

Note `wall.1.plaster` already exists as a wall *stage* and scores WEAK 52. That is the
destruction stage, a different piece. **This is the material.** Look at how `wall.js` consumes
the other materials so yours can be consumed the same way, but do not edit it.

## The bar

- `refs/REFERENCE_INDEX.md` first, then the **lath-and-plaster demolition** category sheet in
  `refs/_sheets/`. One contact sheet costs the same as one image and shows 24 — always tile
  before reading a set.
- `C:\Users\John\Documents\Run Robot Run\Dev Art\1785320177684.png` — in-world, a robot clinging
  to a broken lath-and-plaster wall. The only locked art showing this material in context.
- `1785319916301.png` — the study, for how a finished wall surface reads at room distance.

## The design is yours

This slice deliberately does **not** hand you numbers. On this project, rounds where the lead
specified values from a verbal description were roughly a coin flip and four such specs were
provably wrong, while rounds that handed design authority to the agent produced the only
breakthroughs. Decide the look against the references and justify what you chose.

What the material has to do, as outcomes rather than settings:

1. **Read as lime plaster at two distances.** Fine at 2 m and fine at 20 cm. Detail authored at
   a single frequency is a named recurring failure here — it looks right in the view that was
   used to tune it and falls apart at any other.
2. **Carry horsehair.** Historic lime plaster is hair-reinforced, and broken edges show it. This
   is the detail that separates it from modern gypsum, and it is why the piece is titled the way
   it is.
3. **Have a believable broken edge**, since this material exists to be destroyed. A critic on
   the wall group put it exactly right: the failure mode is "a clean line where the photo has a
   ragged crumbling lip with dust below it."
4. **Not tile.** Visible repetition is a hard reject cue in `BUILD_GUIDE.md` §5.

## The traps — every one has cost real time here

- **`fbmT` sums octaves**, so its output is a narrow bell around 0.5 and a gate at 0.9 **never
  fires**. Four files on this project have had authored detail that silently never drew for this
  reason. Use the `pat()` helper: `float pat(float v,float k){return clamp((v-0.5)*k+0.5,0.,1.);}`
- **Never put a backtick inside a GLSL template literal** — it terminates the JS string.
- **Never name a GLSL variable with a reserved word**: `cast`, `sample`, `filter`, `input`,
  `output`, `matrix`, `texture`, `buffer`. One of these silently produced an all-zero bake.
- **`material.envMapIntensity` does nothing in this project** unless the material sets its own
  `envMap`; the renderer overwrites it with `scene.environmentIntensity`. Use `setEnvResponse()`
  in `_studio.js` if you need per-material control. An entire round's conclusion was invalidated
  by not knowing this.
- **Prefer `Edit` over scripted string replacement.**
- The dominant failure here is **code that looks right, reviews fine, and renders nothing.**
  Shoot and look after every change.

## Presentation — the view is half the score

A previous slice landed every specified shader change and still scored WEAK 48 because its
specimen floated, its frame was cropped and its speculars clipped. Read the "Presentation
requirements" section of `docs/slices/task-robot-15.md` and follow it. Specifically: ground the
specimen with a contact shadow, keep highlights unclipped, and show the material at **more than
one distance** so the two-frequency requirement above is actually visible.

## Verification

```bash
node harness/shoot.mjs --view mat.plaster --review 1280
node harness/sheet.mjs --img progress/shots/mat.plaster.png --img refs/_sheets/lath.png --out "C:/Users/John/AppData/Local/Temp/pl.png" --cols 1
```

**Perf LAST, and not before you have finished everything else.** Another agent is measuring GPU
timings right now and two at once contaminate each other. When you get there:
```bash
node harness/shoot.mjs --view mat.plaster --perf --extra "quality=medium"
```
Pin the tier — `auto` picks `high` on this discrete GPU and that is not the target. Discard the
first (cold-shader-cache) run. Report raw numbers and the budget the harness prints.

```bash
node harness/audit.mjs --render
```
Note `audit --render` sometimes reports a view as failed that renders fine alone — it self-labels
those "transient". Re-shoot any failure individually before reporting it as real.

**You may not score your own work.** Do not run `status.mjs set`. Ceiling is PASS; only a
`critic-*` sets WOWED.

**If a stated fact here is wrong, say so in your report rather than diverging silently.** Six
builders in a row have done that and all six were right.
