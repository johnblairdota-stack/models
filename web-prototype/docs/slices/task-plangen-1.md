# task-plangen-1 — a generated house John can walk, behind `?plan=gen&planseed=N`

**Written by `genwalk-1`, 2026-08-11. The argument and every number is in
`docs/handoff/genwalk-1.md`; this file is the decisions.** It is a plan, not a defect list: the
numbers here are the numbers to use.

> John, 2026-08-11, closing the map-critic programme: *"I can still tell the longer route. it's all
> the other door/wall combinations I can't really focus on... **I don't know the feel and can't
> understand from just a map**"*

He has labelled 40 plans he has never walked through. Nothing built on those labels means anything
until he has stood in one. **This slice's only job is to get him inside a generated house.** Rough
is fine. Ugly is fine. Enterable, navigable and diggable-enough is the bar.

---

## 1. Exact file ownership

**You may edit these three files and create the two new ones. Nothing else.**

| file | what you do to it |
|---|---|
| `src/game/spaces.js` | **the whole slice lives here.** One new URL-conditional module-scope branch, in the idiom the file already uses twice. |
| `src/game/dig.js` | **one line** inside the existing `digEdges()` function. |
| `src/game/exterior.js` | **~6 lines** — a `DEFAULT_YARD` row and one `??`. |
| 🆕 `src/world/genplan.js` | new. The only place `genspike.mjs`'s output becomes `spaces.js` tables. |
| 🆕 `harness/scenarios/_plangen1-boot.mjs` | new. This slice's own gate. **Building it IS part of the slice.** |

### 🚨 You do NOT need `src/views/game.js`, and two builders are live in it right now

One is in `onChunk` plus a `?skin=` line, one is adding a `?coat=` line. **Do not open it.**

`genwalk-1`'s first report said this slice needed ~4 lines there for `SPAWN`. **That was wrong and
it is corrected here.** Measured: `views/game.js` never imports `SPAWN`. It reads `room.spawn`, and
`room.js` builds `room.spawn` from `SPAWN` in exactly three lines:

```js
      player: SPAWN.player.map((p) => new THREE.Vector3(p[0], 0, p[1])),
      hunter: new THREE.Vector3(SPAWN.hunter[0], 0, SPAWN.hunter[1]),
      capture: new THREE.Vector3(SPAWN.capture[0], 0, SPAWN.capture[1]),
```

So **generating `SPAWN` inside `spaces.js` covers all three read sites with zero edits to
`views/game.js`.** `src/game/room.js` is also NOT yours — another agent has been mutating it in
place while reverting it, and you do not need it either.

### 🚨 LOCATE BY CONTENT, NEVER BY LINE NUMBER

`genwalk-1` quoted `views/game.js:15/113/121` from `house-packing.md` §9.3 and the real lines were
`:16/:115/:123` — the doc had drifted by 1–2 in three days, and **two agents are editing that file
as you read this.** Every anchor below is given as **verbatim text to search for**. If an anchor is
not found verbatim, **stop and report it** — do not find "something like it".

---

## 2. Why this slice matters

It is the only thing that calibrates John's eye. From the resume doc: *"a walkable `?estate=gen`,
however rough, is worth more than a better score, because it is the only thing that calibrates his
eye."*

It is also cheap for one measured reason: **everything downstream of `spaces.js` is id lookup and
derivation.** Only three `src/` files import `spaces.js` at all (`dig.js`, `room.js`,
`views/game.js`). `views/game.js:675`'s `exits` finds panels by **id** and rooms by **`site.a`**;
`outSign` is derived from the panel plane; `outThrough()` — the win test — is four derived
conditions and no world constant. Put a different plan into `spaces.js` and the rest of the game
follows it.

---

## 3. The changes

### Change 0 — prove the import path before you write anything else

`harness/genspike.mjs` is the ONE packing algorithm (`house-packing.md` §9.2; `tools/mapdesigner/`
imports it rather than copying it). `src/` must import it, not duplicate it.

**DECIDED: a relative import, and the file does not move.**

```js
// src/world/genplan.js
import { buildPlan, measure, W_MIN_S, WALL_T, L_DOOR } from '../../harness/genspike.mjs';
```

- **Do not move `genspike.mjs`.** Moving it breaks `tools/mapdesigner/app.js:19`
  (`from '/harness/genspike.mjs'`), the `node harness/genspike.mjs --sweep 512` command quoted in
  four documents, and all three `harness/_genwalk1-*.mjs` instruments.
- **Do not copy it.** A second copy of the packer is the thing §9.2 forbids.
- It is safe to import into a browser bundle: `genspike.mjs` has **zero imports** and its CLI is
  behind an `IS_MAIN` guard written for exactly this (`tools/mapdesigner/` already runs it in a
  browser).

🎯 **DO THIS FIRST, ALONE, AS A TWO-MINUTE DERISK.** Create `src/world/genplan.js` containing only
that import and `export function generatedPlan(seed) { return buildPlan(seed); }`, import it from
`spaces.js`, and run `npm run build`. **If it goes green, the rest of the slice has no packaging
risk.** If vite refuses the path, the fix is a `vite.config.js` with `server.fs.allow: ['..', '.']`
— **not a copy and not a move.** There is no `vite.config.*` today; adding one is in scope only if
this step fails, and you must report it if you add one.

### Change 1 — the flag, in the idiom `spaces.js` already uses twice

**The parameter is `?plan=gen&planseed=N`.** Read it exactly the way the file already reads two
others. Search for these two verbatim anchors and put the new block immediately after them:

```js
const SLAB_ARM = typeof location !== 'undefined'
```
```js
const DOORS_URL = typeof location !== 'undefined'
```

The new block:

```js
const PLAN_URL = typeof location !== 'undefined'
  && new URLSearchParams(location.search).get('plan') === 'gen';
const PLAN_SEED = PLAN_URL
  ? (new URLSearchParams(location.search).get('planseed') ?? '0') : null;
export const GEN = PLAN_URL ? generatedTables(PLAN_SEED, {
  // ⚠️ PASSED THROUGH, NOT TUNED. The three placement dials are John's to turn, per the
  // project's own rule about shipping taste decisions as live toggles with arm 0 unchanged.
  align: numOr('planalign', 0.35), gap: numOr('plangap', 2.2), waste: numOr('planwaste', 0.04),
}) : null;
```

**`typeof location !== 'undefined'` is load-bearing and is the whole regression story** — see §7.

### Change 2 — `SPACES` from the plan. Rooms only, `turns: 0` always.

Anchor: `export const SPACES = roomsFromPlan(HOUSE_PLAN);` → `roomsFromPlan(GEN ? GEN.plan : HOUSE_PLAN)`
for the rooms, concatenated with the corridor rows from Change 3.

**Rotation is FORBIDDEN. Every generated slot is `turns: 0`.** Measured over 512 seeds
(`_genwalk1-rot.mjs`): forbidding rotation costs **nothing** in packing — voids/plan 0.72 → **0.61**
(void *area* 5.5 → **1.4 m²**), shared wall 288.2 → **290.1 m**, `fracInternalDiggable` 0.9279 →
**0.9298**, slivers 0.90 → **0.63**, `minWalk` 65.4% → **71.1%**, all closure gates 100%. Do not
"improve" it by turning rooms; the ballroom's colonnade throws and that is Arm B's slice.

⚠️ **Do not use `turns: 2` either**, even though `_genwalk1-place.mjs` shows every type accepts it.
A half turn moves the light rig and **produces a byte-identical built census** (`_genwalk1-build.mjs
--arm turn2`), because the orders solve from the world-axis footprint. It buys a variable, not
variety.

🚨 **THE CONVERSION THAT DECIDES WHETHER EVERY WALL IN THE HOUSE IS RIGHT.** `genspike.mjs` rects
are **STRUCTURAL** — the clear rect inflated by `WALL_T/2` = 0.15 m on all four sides. `SPACES`
rows are **CLEAR**. So:

```
clear x0 = struct x0 + 0.15      clear x1 = struct x1 - 0.15      (and the same in z)
```

For a ROOM, do not deflate by hand: hand `placeRoom` the rect's **centre** and let the library's own
`w`/`d` produce the extents, then **assert** the result matches the deflated rect to 1e-6. The
generator's `LIBRARY` was copied from `ROOMS` and `genspike.mjs --selftest` gates that they agree,
so a mismatch means the seed produced a room the library does not have and you must stop.

Room ids come straight from `genspike`: `r0.gallery`, `r3.study`, … They are unique, they are a
network key (`WallField.add(id)`), and they must never collide with the literal `'outside'`.

### Change 3 — one `SPACES` row per corridor RECT, not per corridor REGION

🚨 **THIS IS THE COST `house-packing.md` §9 DOES NOT NAME, AND IT WILL BITE SILENTLY IF YOU MISS
IT.** A `genspike` corridor region carries `rects: []` — **plural**. Measured on arm A over 512
seeds: **4.36 corridor regions per plan but 9.62 corridor RECTS**, mean **2.21 rects per region**,
max 9, and **54.8% of regions have more than one rect** — i.e. more than half of all corridors are
an L or worse.

`room.js` gives every space its own four walls unconditionally (`spaces.js`'s own rule: *"each space
always draws its own four walls"*). **Emit an L-corridor as one row and it is not a rectangle; emit
it as two rows with no connector and you get a full wall across the middle of the corridor.**

**DECIDED: one `SPACES` row per rect, plus an OPEN portal at each internal joint.** An L-corridor
becomes two short corridors with a doorway between them, which reads fine in a horror house and
costs nothing new in `room.js`.

Corridors do **not** go through `placeRoom`/`ROOMS` — their size varies per rect and `ROOMS` entries
have fixed `w`/`d`. Emit the row directly, in the shape `placeRoom` returns minus `order`/`columns`/
`lights`:

```js
{ id: 'c0.1', name: 'THE PASSAGE', x0, x1, z0, z1, storey: 4.80, floor: 'floor', wall: 'wall' }
```

⚠️ **DROP the alcoves.** A rect whose `minDim` is under `W_MIN_S` (1.90 structural / 1.60 clear) is
narrower than body-plus-swing — **1.04 per plan on arm A**. Do not emit it as a space; leaving it out
makes it solid infill and the neighbouring walls simply close. Use the exported `W_MIN_S`, do not
retype 1.90.

### Change 4 — `PORTALS` and `PANELS`, every door OPEN

**Slice 1 makes every door an OPEN portal and ignores `genspike`'s seeded `door` state.** He must be
able to walk the whole house before the dig works. Slice 2 restores `breachable` / `chained`.

For each `genspike` edge with `canDoor === true`, emit ONE portal, in the shape `PORTALS` already
uses:

```js
{ id: 'D.<edgeKey>', state: OPEN, a: <regionA>, b: <regionB>, axis: 'x'|'z',
  x, z, w: 1.90, h: DOOR_H }
```

🚪 **Put it on `edge.runs[edge.doorRun]`, centred, NEVER on the edge's summed `clear`.** That
distinction is `maptool-2`'s fix for John's own reported defect — *"green open door clipping on the
corner of the rooms and into the hallway"* — and pre-fix it hit **433 of 512 seeds**. `runMax` and
`doorRun` exist on every edge for exactly this.

`axis` is the axis the portal's WIDTH runs along; the normal is the other one. `PORTALS` rows use
`axis`, `PANELS` rows use `rotY`, and `connectorAxis()` reads either — match the table you are
writing into.

**`PANELS` in slice 1 carries the EXIT SITES and nothing else.** Anchor:
`export const PANELS = PASSAGE_DOORS_ON`. For every room with envelope frontage ≥ `L_DOOR` (the
`frontage[]` array `planFromRooms` already returns), emit one row on that frontage wall:

```js
{ id: 'x.<roomId>.<side>', a: <roomId>, b: 'outside', x, z, rotY,
  state: EXIT, name: 'THE …', room: '<room name>' }
```

`b: 'outside'` is what makes it an exterior wall and puts it in the exit pool.
`EXIT_SITES = PANELS.filter(isExitSite)` — anchor
`export const EXIT_SITES = PANELS.filter(isExitSite);` — **stays exactly as it is. Do not touch it,
do not make it a function, do not thread it through anything.** That is the entire reason this slice
does not need `views/game.js`.

### Change 5 — `SPAWN`

Anchor: `export const SPAWN = {`. Under `GEN`, replace the three world coordinate pairs:

- `player` — the centre of the plan's spawn room. `measure(plan).spawn` is already a region index,
  chosen seeded and excluding the exit room. Use its rect centre. Emit it twice (the authored table
  has two entries).
- `hunter` — the centre of a different room. The hunter is out of scope, but it is still constructed
  and a body placed outside the envelope is a visible mess.
- `capture` — same as `player`. The capture Director is already known to frame the wrong wall
  (resume doc item 5) and is not this slice's problem.

**Without this the player spawns outside the generated envelope and the first thing John sees is not
the house.** It is the single most load-bearing four lines in the slice.

### Change 6 — `dig.js`: no dig faces in slice 1

Anchor, verbatim:

```js
export function digEdges() { return SLAB ? SLAB_EDGES : DIG_EDGES; }
```

Return `[]` when the gen flag is on. **One line, in a function that already branches on a mode
flag.** The authored `DIG_EDGES` names spaces (`service`, `study_w`, …) that do not exist in a
generated house; leaving it live puts dig panels at authored coordinates inside generated rooms.

Slice 2 fills this in from `boundarySegments(plan)`, which emits the `{ id, normal, at, a, b, spans }`
shape `DIG_EDGES` already uses. **That is slice 2. Do not start it.**

### Change 7 — `exterior.js`: one default yard

Anchor, verbatim:

```js
    if (!spec) { console.warn('[exterior] no yard authored for', e.site.id); continue; }
```

`YARDS` is keyed by exit-site id, so a generated pool opens every new site onto `scene.background`
(`#05070b`) — a near-black void, **visible through the hole before he steps out**.

**`house-packing.md` §9.4b calls `YARDS` "world-authored per site" and that is wrong**, which is why
this is five lines and not a slice of its own. `exterior.js` says so above the table: *"+z is
outward through the hole, +x is the panel's own lateral axis … nothing here repeats a coordinate
that `spaces.js` already owns."* `buildYard` derives the frame from the panel. Only `x0`/`x1` are
solved against the floor plan.

Add one row beside `const YARDS = {` and change the guard to a `??`:

```js
const DEFAULT_YARD = { kind: 'lawn', x0: -6.0, x1: 6.0, depth: 22, sky: 21,
  wallH: 1.35, trees: 8, hedges: true, piers: 2 };
```

⚠️ **Known and accepted:** a fixed ±6 m lateral extent can clip a neighbouring wing on some seeds,
because that is the exact thing the per-site `x0`/`x1` were solved for. **Accept a clipped hedge for
the feel test.** Do not try to solve it.

---

## 4. What John will see on his first three seeds — say this to him up front

**Every house will be a shoebox pointing the same way.** Measured, arm A against the shipped
generator over 512 seeds:

| | rotation ON | **arm A** |
|---|---:|---:|
| envelope aspect L:S | 1.571 | **2.220** |
| long axis runs along X | 47.9% | **94.1%** |
| envelope LONG axis, m | 51.2 | **61.6** |

**Nothing cheap fixes it inside Arm A, and you must not try.** It is a direct consequence of every
long room lying the same way — `genspike.mjs`'s own header says rotation *"is the only reason a
27.20 m gallery can ever be a north-south spine"*. Turning the whole plan is Arm T (the mirror,
6.1%) and it throws on the ballroom's colonnade. **It genuinely waits for Arm B**, which is one
library field, one reader at `room.js`'s `const { z, xs, w = 0.95 } = sp.columns;`, and one
`placeColumns` — and which is the next slice.

What you CAN give him is the three placement dials as live URL parameters (Change 1:
`?planalign=`, `?plangap=`, `?planwaste=`, **defaults unchanged at 0.35 / 2.2 / 0.04**). `--waste`
is the compactness penalty and is the one that moves the envelope. **Expose it; do not tune it.**
This is the project's own rule about shipping taste calls as toggles with arm 0 unchanged.

⚠️ **Also tell him the flat-plan rate goes 42.4% → 65.8% and then tell him not to care.**
`maplabel-1` tested `depth ≥ 3` against his own 40 labels and it **rejects his taste** — AUC 0.383
pointing the wrong way, flagging 6 of his 16 GOOD plans against 2 of his 12 BAD. It is reported
because hiding it would be dishonest, not because it is a defect.

---

## 5. The traps

1. 🚨 **`?estate=gen` IS A LIVE DEFECT AND `docs/design/house-packing.md` §9.3 TELLS YOU TO USE IT.**
   Verified by running the function, not by reading it:

   ```
   "port"      -> port=true
   "gen"       -> null (ART PORT OFF)
   "port,gen"  -> port=true
   ```

   `estateMode()` in `src/game/estate-spike.js` walks a list of known tokens and ends
   `return any ? m : null`. `gen` matches nothing, so `any` stays false, it returns `null`, and
   `views/game.js`'s three `_estate?.port &&` guards all short-circuit — **the entire gallery, study
   and ballroom art port turns off.** John would walk a generated house with none of his art in it,
   which is the one thing this whole exercise exists to let him judge. **The parameter is `?plan=gen`
   and `?estate=` is not touched.** If you find yourself typing `estate` anywhere in this slice, stop.

2. 🚨 **STRUCTURAL vs CLEAR — 0.15 m on all four sides.** Get it backwards and every wall in the
   house is 0.30 m out, which looks almost right and is not. See Change 2.

3. **`spaces.js` validates every connector at module scope and THROWS.** Search for
   `const seen = new Set();` — the block below it refuses duplicate ids, unknown states, an unknown
   space `a` or `b` (except `'outside'`), and `clearWidth(c) > 0.4`. A malformed generated table
   **fails to boot with a `[spaces]` message**. That is the correct behaviour. **Do not weaken the
   guard to make your table load.**

4. **Locate by content, never by line number.** §1. Two agents are editing `views/game.js` and one
   has been editing `room.js`.

5. ⚠️ **Run `node harness/lint-glsl.mjs` after EACH edit to any `.js`/`.mjs`, not at the end.** A
   backtick inside a `/* glsl */` template literal takes the whole build down for every agent at
   once — five times in three days. `npm run build`, **never** `npx vite build`.

6. ⚠️ **Scenarios take `--q`, never `--extra`.** The wrong one does not error; the run happens on
   the default arm and the checks SKIP, which in a tail reads as nearly a pass.

7. **Do not renumber, insert into, or reorder `PANELS_AUTHORED`, `PORTALS` or `DIG_EDGES`.** Their
   order is the input to `chooseExit()` and their ids are a network key. Your work is a **parallel
   branch**, never an edit to the authored arrays.

8. ⚠️ **`_ap3-golden.mjs` pins 15,740 built-geometry leaves and another builder is legitimately
   moving some of them right now.** See §7 for how to tell whose is whose.

9. **`docs/design/house-packing.md` §1's "the three solvability gates and the hunter gate pass on
   512/512 seeds" is weak evidence and must not be used to justify skipping a check.** `genwalk-1`
   wrote a control expecting a **272 m ballroom** to break those gates and it did not:
   `allReach` / `exitReach` / `hunterAll` / not-degenerate stay at **100.0% on all 512 seeds** while
   `fracInternalDiggable` falls **0.9279 → 0.6861** and void area rises **5.5 → 30.0 m²**. They are
   connected *by construction* — every room is placed flush against an already-placed one and every
   leftover cell becomes corridor. **`_genwalk1-rot.mjs`'s `C4` is the arm that keeps the claim
   falsifiable** (`L_DIG` 1.20 → 40.0 and the door jamb 0.20 → 40.0: **512/512 fail to close**), and
   it runs on every run. Your boot gate must assert reachability **in the built house**, not inherit
   it from the generator's own gate.

---

## 6. Verification — the exact commands, and what green looks like

### 6a. The instruments that already exist, and which change each one proves

```
node harness/evidence/_genwalk1-place.mjs           must stay 10 pass / 0 fail
```
Proves **Change 2**'s `turns: 0` assumption (every library type places at turns 0) and that
**Change 5 of the NEXT slice** — the colonnade — is still guarded: its `ballroom × turns 1/3` cells
must still read `X`. When Arm B lands, those two cells flip to `.` and that is Arm B's gate.

```
node harness/evidence/_genwalk1-rot.mjs --n 512     must print "controls OK"
```
Proves the arm-A choice is the measured one and that C1/C2/C3/C4 still behave. **If C1 goes red the
harness is measuring its own patching and every number in this plan is void.**

```
node harness/evidence/_genwalk1-build.mjs --all     control/turn1/turn2 exit 0 · ballturn exit 1
```
Proves the **authored** house still builds headless after your `spaces.js` edit. `--arm control`
going red is the loudest possible signal that Change 1's `typeof location` guard is wrong. It prints
`room.js`'s sha1 so a failure can be attributed rather than believed.

### 6b. The gate you build — `harness/scenarios/_plangen1-boot.mjs`

**Building it IS part of the slice.** It does not exist. Fork the machinery from
`harness/evidence/_genwalk1-build.mjs` — the `node:module` `registerHooks` load hook, the four-call
`stubRenderer()`, `globalThis.location` set BEFORE the first `src/` import, and
`buildTestRoom({ work: (p) => p }, {})`. ⚠️ **`harness/evidence/_ap3-build.mjs` does the same thing and it is
another agent's file — do not import it and do not edit it.** Re-state the ~15 lines.

Over **16 seeds**, with `globalThis.location = { search: '?plan=gen&planseed=' + s }`:

| id | assertion |
|---|---|
| B1 | the build completes with **zero `[spaces]` throws** and zero uncaught warnings |
| B2 | `room.spaces.length` is **11–20** (arm A: 6.94 rooms + 9.62 corridor rects, mean 16.6, max seen 17 regions) |
| B3 | **`room.spawn.player[0]` is inside a space** — `room.spaceAt(p)` is not null. This is Change 5 and it is the one that ruins the first impression |
| B4 | **every space is reachable from the spawn space through `room.pathPortals`** at the player's clear width. ⚠️ Ask the BUILT house, not the generator — see trap 9 |
| B5 | at least one panel has `spec.b === 'outside'` and `EXIT_SITES.length >= 1` |
| B6 | no two spaces overlap in XZ, and no space has a zero or negative clear extent |
| **C1** | 🚨 **the control that must fail: run one seed with the plan patched to drop every emitted portal, and require B4 to go RED.** Without it, "every space is reachable" is indistinguishable from "my BFS returned early". |
| **C2** | 🚨 **a second control: run with NO flag and require B2 to read exactly 6.** If the unflagged build ever reports 16 spaces, the mode is leaking into the authored arm and every gate in §7 is lying. |

**Both controls run on every run.** Of the ~16 instruments in `instruments.md` that lied, a
reintroduction arm would have caught at least twelve on their first run.

### 6c. Look at it

```
npm run build && node harness/serve.mjs
  localhost:5192/?view=game.play&plan=gen&planseed=0
  ...&planseed=1     ...&planseed=2
```

Walk three seeds. You are checking four things and nothing else: **you spawn in a room**, **you can
walk to every room**, **the doorways are in walls rather than hanging off corners**, and **an exit
site opens onto a yard rather than onto black**. Do not judge the look; that is a critic's job and
John's.

---

## 7. The regression gate — and it is not optional

### 7a. The property, verified rather than assumed

**`escape` 20/20 on `seed=s4` and `mechanics` 13/13 keep running on the authored plan by
construction, because every `harness/scenarios/*` that imports `spaces.js` in node has no
`location`.** That is the property `typeof location !== 'undefined'` buys, and `spaces.js` already
depends on it for `SLAB_ARM` and `DOORS_URL`.

**Verify it. Do not reassure yourself about it.** Two commands, and the second is the control:

```
node -e "import('./src/game/spaces.js').then(S=>console.log(S.SPACES.length, S.SPACES.map(s=>s.id).join(',')))"
```
→ must print `6 gallery,study_w,service,study_e,ballroom,chapel` — **the authored six, unchanged.**

```
node -e "globalThis.location={search:'?plan=gen&planseed=7'};import('./src/game/spaces.js').then(S=>console.log(S.SPACES.length, S.SPACES.map(s=>s.id).join(',')))"
```
→ must print a **different, longer** list. **If these two print the same thing, one of them is
broken and you cannot tell which — stop and diagnose before running anything below.**

### 7b. The gates, all on the authored arm, all with NO flag

Run every one of these **before** you start and **after** you finish, and diff:

```
npm run build                                                          green
node harness/evidence/_loc1_golden.mjs --check harness/fixtures/_loc1_golden.json        1170 leaves, Object.is
node harness/playtest.mjs --view game.play --script harness/scenarios/escape.mjs   --port 5457 --q "seed=s4"     20/20
node harness/mechanics.mjs                                                                                       13/13
node harness/playtest.mjs --view game.play --script harness/scenarios/dig-free.mjs --port 5457                    15/15
node harness/playtest.mjs --view game.play --script harness/scenarios/eo2-calls.mjs --port 5457                    6/0
node harness/evidence/_ap3-golden.mjs --check harness/fixtures/_ap3-golden.json          15740 leaves
```

⚠️ **`_loc1_golden` is the sharpest of these** — 1170 exported leaves compared with `Object.is`. Your
change adds a branch above `SPACES`; if a single leaf moves on the unflagged arm, you have leaked.

### 7c. `_ap3-golden.mjs` — how to tell whose red is whose

Another builder is legitimately moving built-geometry leaves right now, so a red here is ambiguous
by default. **It is resolvable, and here is the rule:**

`_ap3-build.mjs` sets `globalThis.location = { search: arm.search }` from its own `ARMS` table, and
**not one of those arms contains `plan=gen`**. Your branch is therefore off in every one of its
arms, and **your change cannot move an `_ap3-golden` leaf unless it moved something on the authored
path — which `_loc1_golden` would have caught first.**

So: **if `_ap3-golden` is red and `_loc1_golden` is green, it is not yours.** If you want certainty,
copy your `spaces.js` to a scratch file, restore the pre-slice version, re-run `_ap3-golden`, and
put yours back — if it is still red without your change, report it to the lead and do not fix it.
**A build broken by a file you do not own: do NOT fix it. Message the owner the line.**

---

## 8. What this slice deliberately does NOT do

Named so nobody adds them, and each is priced in `docs/handoff/genwalk-1.md` §6:

the hunter, `PATROL_ROUTE` and `ANCHORS` (John's call; verified not to break the boot — `_patrol`
never reads `wp.space`) · room rotation (Arm B, the next slice) · corridor polygons (one space per
rect) · sub-1.60 m alcoves (dropped) · per-site yards (one default) · two storeys (`at[1]` stays 0
in all six slots, measured) · seeded door states (every door OPEN) · dig faces (slice 2) · the
`DIG_EDGES` id handshake and generator-version negotiation (single player, one build) · the 2.96 m
authored-span minimum · dressing variety for duplicate rooms.

### The draw-call budget — measure it AFTER, report it, do not gate on it

**16.6 spaces per plan against 6 today**, and HANDOFF prices a room at **10–21 draw calls**, against
a **625** ceiling whose worst parked station today reads **461**. Naively that is +100 to +220 and it
can blow the budget.

**It probably will not, and the reason is residency:** `room.js`'s `setViewpoints` switches every
space root and `visibleSpaces()` is what costs, not the total. Today it peaks at 4. On arm A the
biggest corridor touches **3.82 rooms on average (p95 5, max 7)** with a span of **26.6 m mean
(p95 34.0)**, so a player in a long corridor may resolve 5–7 space roots at once.

**Measure it with `eo2-calls.mjs` under `?plan=gen`, AFTER the mode boots**, because that instrument
needs a house to boot into and there is no proxy for it (`house-packing.md` §9.4 says the same:
*"needs a real measurement, not a proxy"*). ⚠️ **A parked draw-call reading is not stable across a
walk** — `ballroom.centre` read **423 / 461 / 479** on one build, seed and station. **Flip in place
at ONE station; never compare two walks.**

---

## 9. Report back

**If a stated fact in this plan turns out to be wrong, say so in your report rather than diverging
silently.** Six briefed hypotheses were refuted by the agent that received them this campaign, with
none confirmed, and `genwalk-1` already corrected three of `house-packing.md` §9's own claims — the
`?estate=gen` flag name, the `YARDS` mechanism, and the size of the turned-room problem.

Report: the seeds you walked, `_plangen1-boot.mjs`'s tally including both controls, the §7b
before/after diff, and **one sentence on whether the shoebox is as bad as §4 predicts** — because
that is the only question John is actually being asked.
