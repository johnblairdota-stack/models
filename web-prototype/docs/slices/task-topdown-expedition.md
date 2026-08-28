# Slice: the expedition goes top-down on its own, and the handoff is a camera move

**Files you may edit — nothing else:**

| file | what you own in it |
|---|---|
| `src/party/follow.js` | the view state machine, `lerpRig`, `PLAN_YAW`, `view` on `WORLD_KEYS` |
| `src/game/follow-bed.js` | `FollowOperator._solve` / `.update`, the rig-apply block, lighting, residency, `readout()` |
| `src/game/room.js` | **`setLid` only** — one optional argument. Touch nothing else in this file. |
| `src/views/party-phone.js` | the runner sheet in the `expedition` branch, and `liveStamp` |
| `src/party/night-skin.js` | the `.stick-wrap` block only |
| `net/party/entitle.js` | one `MATRIX` row |
| `harness/party-follow-drive.mjs`, `harness/party-follow.mjs`, `harness/party-warm.mjs`, `harness/perspective-shots.mjs` | the assertions named in §7 |
| `package.json` | one `gate:` script |
| `CLAUDE.md`, `docs/design/CRITIC-LEDGER.md`, `docs/design/party-loop.md`, `../docs/design/rrr-broadcast.md` | the doc corrections in §8 |

Decisions here are made and the numbers are the numbers to use. **If a stated fact turns out
to be wrong, say so in your report rather than diverging silently** — §2 exists because the
last pass of this plan got two facts wrong and they were caught this way.

---

## 1. Why this slice matters

`8da0b8f` shipped four camera perspectives and a `P` key to cycle them. What it did not ship
is the *game* using them: the expedition still runs on `chase` unless a developer presses a
key, and pressing that key is a hard cut — the FOV snaps, every ceiling in the house vanishes
in one frame, and the light jumps ×10.

John's ask is that the expedition — everything outside the ballroom, where the hunter stalks
from the shadows — **is** the top-down view, that the ballroom keeps its seated circle and its
chase camera for the walk out, and that the handoff between them is a camera move the player
reads instantly, without being told, as *"the view changed and so did my controls."*

Three defects found while planning make that impossible today, and all three are on the path:
the top-down **rotates with the runner's body**, the movement stick's frame is **derived from
where the lens ended up** on every non-chase rig, and the roof comes off **the whole house**.

---

## 2. Four stated facts, checked against the source

Carry these; do not re-derive them. Two corrections from an earlier draft are included
deliberately.

1. **`aimYaw = Math.PI` is exactly the absolute control scheme.** `player.js` `_stepGround`
   (:927) builds `want = (sin·mv.y − cos·mv.x, 0, cos·mv.y + sin·mv.x)`. At π, stick-up gives
   world `(0,0,−1)` and stick-right gives `(+1,0,0)` — screen-up = −Z, screen-right = +X, the
   plan orientation the guide's map already locks to. **`player.js` is not edited by this slice.**
2. **`sp._lid` is already keyed per space** (`room.js:2034` loops `for (const sp of spaces)`),
   and `lidCensus()` already reports per-space `took`. Per-room roof-off is an argument, not a
   subsystem.
3. **CORRECTION — `spaceAt` ignores Y.** `room.js:1030` is a pure XZ AABB test with a 0.6 m
   pad. An earlier draft claimed residency collapses overhead because the camera is above the
   roof; that is false. `top` sits only 1.20 m off in plan and resolves correctly. The real
   holes are `iso` (5.60 m back, so near a wall its XZ lands outside every footprint and
   `setViewpoints` latches `_cur` at `room.js:1524`) and the portal-bleed facing test, which
   uses a near-vertical `vp.dir` overhead and behaves close to randomly.
4. **CORRECTION — the bed's grade is `haze: 0.042`**, not the `0.0075` preset. At a 9 m eye,
   `linZ` is 9.0 m under the camera and √(9²+8²) ≈ 12.04 m at 8 m lateral, so
   `f = 1 − exp(−linZ·haze)` is **0.316 vs 0.397** — eight points across the whole frame. Haze
   is a flat wash in a top-down and does no concealment work. **Leave `haze` alone.** Do not
   zero it the way `views/game.js`'s fly-over does; that is a 40 m eye and its reasoning does
   not transfer.

---

## 3. The plan lock — do this first, it has the largest blast radius

`FollowOperator` currently maintains `_lockYaw` for `chase` only. Everywhere else it nulls it
(`follow-bed.js:527`, `:531`), so `basisYaw()` falls through to `lensYaw()` — and on `top` that
yaw is read off a **1.20 m** baseline against a lerping, sway-perturbed eye. That is the
Round-7 defect (*"forward rotated under the player's thumb"*) reintroduced overhead.
`CRITIC-LEDGER.md:357` and `follow-bed.js:1456-1459` both claim the controls needed no special
case. **That claim is true of `chase` only — correct both comments as part of this change.**

1. Add `export const PLAN_YAW = Math.PI;` to `follow.js`, with the §2.1 arithmetic in its
   doc comment. Screen-up is world −Z, which is what the guide's map already uses.
2. `follow-bed.js:332` — `_solve`'s first line. A plan-locked rig is placed from `PLAN_YAW`,
   not `runner.facing`. Plan-locked means `orbit === false`, i.e. `iso` and `top`.
3. `follow-bed.js:526-532` — stop nulling. **Set** `_lockYaw`:
   - `orbit: true` rigs (`chase`, `wide`) integrate `stepLookOrbit` exactly as `chase` does
     today. This also revives `wide`'s advertised `orbit: true`, which is dead code right now.
   - `orbit: false` rigs (`iso`, `top`) hold `_lockYaw = PLAN_YAW`, `_lockPitch = 0`.

`basisYaw()` then returns `_lockYaw` on every rig and never reaches `lensYaw()` on a driven
run. Leave `lensYaw()` in place — the undriven warm/intros cameras still use it.

**The property this buys, and it is the reason the transition can feel instant:** `_lockYaw`
becomes *both* the camera's yaw and the stick's frame — one number. Slerp it once in §4 and
there is no frame in the crane where up-on-the-pad is not up-on-the-TV.

**Check before moving on:** at `chase` the feel must be bit-for-bit what it is today. At `top`,
pushing the stick left must walk the runner toward screen-left and must **not** start a turn
that keeps turning.

---

## 4. The crane

`perspectiveEye` deliberately refuses a pitch for overhead rigs — *"a top-down view you can
tilt is a chase camera with extra steps"* — and that decision stands. **Interpolate the rig
fields, never a pitch.**

1. `follow.js`: `export function lerpRig(a, b, s)` over `dist`, `height`, `lateral`, `fov`.
   Let `perspectiveEye` take a rig object as well as a name.
2. Smootherstep the blend, so velocity is zero at both ends — the crane eases off the shoulder
   and settles at the top with no stop frame.
3. Ramp on that one blend: rig fields, FOV (it snaps 58→52 today), `_lockYaw` slerped
   shortest-arc to `PLAN_YAW`, and the light (§6).
4. **Damping tightens with the blend.** `follow-bed.js:543` is
   `1 - Math.exp(-6.5 * dt)`; make the rate `6.5 + 26 * blend`. Hand-carried at the bottom,
   locked at the top. This is the feel as much as the maths — handheld→mechanical is itself
   the signal the show changed cameras. Same treatment for the look target's `-8.0`.
5. **Sway and wrist breath scale by `(1 - blend)`** (`follow-bed.js:568-582`). ±2 cm and
   ±0.006 rad on a 52° lens 9 m up is a drifting, rolling map. A shaky top-down reads as a bug.
6. **The lid fires at `blend > 0.35`, and that number is arithmetic.** `height` smootherstepped
   from 1.62 to 9.0 is **3.36 m** at s = 0.35 and **5.31 m** at s = 0.50, against a 4.8 m
   storey. Firing at 0.35 takes the roof off while the eye is still *below* it, so the ceiling
   lifts away in front of the player instead of popping once they are already through it — and
   it removes, by construction, the chord-through-the-ceiling that today's `lerp` gets away
   with only by luck. `setHangers` goes on the same trigger.

`RISE_SECONDS = 1.35`, `DROP_SECONDS = 1.10`. Drop is shorter on purpose: coming home is a
release and should not make the player wait; going out is the reveal and gets the time.

**Known limit — state it, do not fix it.** `room.js:2483` refuses to hide `ballroom:gilt`
(it spans −1.77→9.60 because coffers, capitals and skirting share one merged bucket), so the
gilt lattice stays over the ballroom. The ballroom is on `chase` anyway, so it never appears
under the top-down.

---

## 5. The state machine, and the `P` key

Pure, in `src/party/follow.js`. **`src/party/*` imports no THREE and no DOM** — that rule is
what lets the bare-node gates drive this, so keep the machine free of both.

```js
export const VIEW_STATES = ['ground', 'rising', 'over', 'dropping'];
export const EXPEDITION_PERSPECTIVE = 'top';
export const RISE_SECONDS = 1.35;
export const DROP_SECONDS = 1.10;
export const VIEW_MARGIN  = 1.10;   // metres of hysteresis on the ballroom AABB
export function insideBallroom(pos, ballroom, margin = 0)
export function stepView(view, inside, dt)   // -> { state, s, from, to, pinned }
export function viewBlend(view)              // -> smootherstep 0..1
```

**Trigger:** extract the ballroom AABB test `missionTick` already runs for its `return` phase,
so one predicate serves both the mission and the perspective. A second copy that drifts from
the first is a failure class this codebase has paid for before.

**Two guards against strobing.** Leaving needs the runner outside the AABB by `VIEW_MARGIN`;
returning needs inside by the same. And a ramp in flight is not interruptible — a runner who
steps back over the line at `s = 0.5` must not get a camera that reverses mid-crane.

**Two authorities on `perf.perspective`.** The machine writes it on a crossing. `P` writes it
and sets `perf.pinned`, which suppresses the machine until the next crossing clears the pin.
The ceiling-inspection tool `docs/handoff/ballroom-next.md:188` documents keeps working, and
the game loop always wins in the end.

**Telling the phone.** `view` joins `WORLD_KEYS` and is validated against `VIEW_STATES` exactly
as `worldViolations` already validates `mission.phase` against `MISSION_PHASES`. Then one row
in `net/party/entitle.js` `MATRIX`: `['you.view', 'runner']`, modelled on the `['you.here',
'runner']` row directly above it. Seated phones and the TV never see it.

That channel is 2 Hz and **that is fine** — the sheet swap can land 500 ms into a 1350 ms crane
without breaking anything, because §3 already made the stick correct from the lock. The sheet
is a label catching up with a control that never stopped working.

---

## 6. The dark — two mechanisms, because one is not enough

1. **Tighten the runner's lamp.** `follow-bed.js:1524-1530` gives `top` `distance = up*1.5 =
   13.5 m`, `intensity = 6.0 + up*0.9 = 14.1`. Take `distance` to **6.5 m**. A three.js point
   light with `decay 2` and a finite `distance` is windowed: past `distance` it contributes
   **exactly zero**, so a hunter at 8 m gets nothing. Keep the lamp height at `min(4.2, up*0.55)`
   — only one variable moves — which puts the lit floor radius at √(6.5² − 4.2²) ≈ **4.96 m**.
   Shrinking `distance` dims the near field too (the window term at the runner's feet goes from
   (1−4.2/13.5)² = 0.475 to (1−4.2/6.5)² = 0.125), so raise `intensity` to **≈54** to hold the
   pool. Treat 54 as a starting value and settle it against the measurement below, not the algebra.
2. 🚨 **Damp the key spot, or none of (1) matters.** The per-space five-light rig is independent
   of `camLight`, and its key is `SpotLight(0xffdcb4, **150**, 34, 0.88, 0.62, 1.6)` with
   `castShadow`. It lights the room whatever the runner's lamp does. Scale its intensity by
   `(1 - 0.75 * blend)` — 150 at `chase`, 37.5 at full `top`. **This is the change that decides
   whether the concealment works at all; do it before tuning anything else in this section.**
3. **The hunter carries no lit body until it commits.** It is mesh-less today
   (`buildHunterToken`), so this is a rule to hold when the body lands next slice — but write
   its gate now, so the rule has an instrument before it has a mesh.

**The measurement that settles the numbers**, and it is anchored to an existing gate: D2 in
`party-follow-drive.mjs` asserts the run frame has `mean >= 12 && stdev >= 8` of 255. So the
target is **frame mean ≥ 12 with D2 still passing**, while the footprint 8 m from the runner
reads **≤ 6**. Tune 54 and 0.75 until both hold. Report the numbers you land on.

---

## 7. Presentation — what the frame must look like, not just what the code does

Specified because a plan buys compliance only on what it says out loud.

- **The crane is legible as a move.** Watching the TV alone, it must be obvious the camera
  rose rather than cut. If it reads as a jump, the damping ramp in §4.4 is wrong.
- **The roof lifts before you reach it**, never after (§4.6). If a ceiling pops while the eye
  is already above it, the 0.35 trigger did not fire.
- **The top-down does not drift or roll** when the runner is standing still. §4.5.
- **The frame does not rotate** when the runner turns. §3. This is the single most visible
  symptom of getting the plan lock wrong.
- **The room beyond the pool is dark, and the pool is not a hard-edged disc.** §6.
- **The slug says what is happening.** `readout()` already reports `operator.shot`, so it
  already prints `TOP`. Add `CRANE` on the way up and `DROP` on the way down — `CRANE` is a
  real television word for a camera going up, and on screen for 1.35 s it says the change is a
  production choice rather than a glitch.
- **The phone sheet re-shapes without dropping the stick under a thumb.** `liveStamp`
  (`party-phone.js:535`) is `beat:role:missionPhase:card|nocard`; add the view segment so the
  sheet rebuilds on the one transition and never mid-expedition. `patchLive` already guards on
  `#stick` and keeps patching `[data-here]` in place.
- **The top-down runner sheet:** the look stick and both `Move`/`Look` caps go; RUN and SWING
  grow to fill the freed half (≥ 96 px). The stick stays in its corner rather than centring —
  moving it would undo the thumb's learned position at the exact moment the player is being
  asked to relearn the mapping. Copy:

  > **You walk.**
  > Eyes on the TV. The stick is the room — push where you want to go.
  > Hold RUN, tap SWING.
  > Listen to your guide — they have the map, you have the hammer.

  *"The stick is the room"* is the whole scheme in five words and needs no diagram.
  `night-skin.js` gets a `.stick-wrap.top` modifier: two columns instead of three,
  `.stick-side` grown. `.stick { touch-action: none }` is load-bearing and stays.

---

## 8. Gates, and the docs that now contradict the code

**D5 must be rewritten — today it gates the default, not the capability.**
`party-follow-drive.mjs:440` is byte-identical to before the perspectives landed and passes
only because that drive never presses `P`. The moment top-down is automatic it fails — and
`drive:party-follow` is **not in CI**, so it would fail late. Its replacement keeps a real
refusal:

> `D5 · no god-view — the roof comes off only over the runner's own rooms, the whole-house
> frame is never taken, and every rig but the overhead pair stays under the storey`

- `lidCensus()`: the spaces with `took` entries are always a subset of the runner's space plus
  its portal neighbours. Never the whole house.
- ground rigs still clamp under `storey − 1.0`, so the exemption stays provably two rigs wide.
- the overhead eye is bounded **above** too. A camera that keeps climbing is the fly-over back
  in disguise.

**Survives unchanged:** D6, D2/D3, D4b. **Updated:** `perspective-shots.mjs` P3/P3b/P3c assert
a global lid and become per-space; `party-warm.mjs` W26i asserts the phone carries
`id="stick-look"` and *"Eyes on the TV"* and becomes perspective-aware rather than weakened.

**New:**
- **the stick basis equals the camera basis on every frame of the crane** — sample `basisYaw()`
  against the runner's realised world velocity and the stick vector across the ramp. This turns
  §3's property from a claim into a measurement and is the most valuable assertion here.
- the crane completes inside `RISE_SECONDS`, and the blend is monotonic.
- the lid fires while the eye is still below the storey.
- the hunter is not visible at 8 m (§6.3), against the mesh-less token.
- pure: `stepView` hysteresis, and `P` pinning released by the next crossing.

**Wiring:** `perspective-shots.mjs` has no npm script at all and runs only by hand. Add
`gate:perspective-shots`. Leave it out of the `gates:party` chain, matching the other drives.

**Doc corrections — part of the slice, per `CLAUDE.md`'s "findings go into the instrument that
proves them plus one line here":**

| file | change |
|---|---|
| `CLAUDE.md` "Chase-only during the run" | already literally false since `8da0b8f`. Restate: the *director* may not cut; the *player's* perspective is chosen by the loop. |
| `docs/design/CRITIC-LEDGER.md:365-373` | Round 8's "⚠️ FLAGGED FOR JOHN — the overhead views are a god-view" is still open. **Record the answer: roof off locally.** |
| `../docs/design/rrr-broadcast.md:213` (repo root, not under `web-prototype/`) | narrow "no top-down, no roofless view" to: no whole-house fit, no hunter mark, no route line, no plan diagram. |
| `docs/design/party-loop.md:42,48-50` | same narrowing. |
| `src/game/follow-bed.js:66-67` | header still says *"`room.setLid()` is never called. The ceilings stay on."* False since `8da0b8f`. |
| `follow-bed.js:565`, `:1521` | comments say "twelve metres up"; `PERSPECTIVE_RIG.top.height` is 9.0. |

---

## 9. Traps — each of these has cost real time

- **`npm run build`, never `npx vite build`.** The former runs `harness/lint-glsl.mjs` first,
  and a backtick inside a `/* glsl */` template literal takes the whole build down.
- **`src/party/*` and `net/party/*` import no THREE and no DOM.** The state machine in §5 must
  stay pure or every bare-node gate that imports `follow.js` dies.
- **Use `Edit`, not scripted replacement.** `follow-bed.js` is 1700 lines of heavily commented
  code and a regex pass will hit the wrong one of five similar lines.
- **Do not delete the doc blocks.** Where one is now false (§8), correct it in place — this
  codebase's comments are its memory.
- **Do not add `top` / `crane` / `drop` to D6's grep list** (`['flyover','minimap','hunter',
  'marks=']`). They are not leaks.
- **Do not route the lid through a URL param.** `lid` is on `FOLLOW_FORBIDDEN`
  (`follow.js:198`) and gate F5b asserts it. The cue channel is the legal route and already works.
- **`_valid` tests `this.shot`, not the candidate shot** — so once the current shot is overhead
  every candidate validates unconditionally (`follow-bed.js:408`). It is unreachable on a live
  run because the lock is always set. **Leave it. Do not "fix" it in this slice.**
- **`setHangers` caches on first call** by name regex, so a chandelier added to the scene after
  the first call is never found. Known; not this slice.

---

## 10. Verification

```bash
npm run build
npm run gates:party
npm run drive:party-follow
node harness/perspective-shots.mjs
```

**What to look at**, not just that it exits 0:

- `progress/persp/` — the four photographs. `top` must be plan-oriented (screen-up = −Z) and
  must show a lit pool with dark beyond, not an evenly lit room.
- `progress/persp/measured.json` — the per-shot eye height, plan distance and roof state.
- The new stick-basis assertion's reported angle error across the ramp. It is the one number
  that proves the handoff feels right.
- The §6 luma pair: frame mean (≥ 12, D2 still green) and the 8 m footprint (≤ 6).

**Manual, the loop this slice is about:**

```bash
npm run party:local
npm run build && node harness/serve.mjs
# TV:    localhost:5192/?view=party.host&room=dusk&dev=1
# phone: localhost:5192/?view=party.phone
```

Send the pair in and walk the runner out of the ballroom. Every bullet in §7 is a thing to
look for, in order.

## 11. Regression gate

`follow-bed.js` and `follow.js` have dependants, and §3 changes `basisYaw()` for every rig.
Before touching anything, capture baseline shots on `chase` (`node harness/perspective-shots.mjs`
writes all four) and keep them. After the work, the `chase` frame must be unchanged and the
chase feel must be identical — this slice is allowed to change `wide`/`iso`/`top` and nothing else.

**The specific regression to watch:** the guide's sheet and `guideMapSvg` must be
pixel-identical before and after. Nothing here touches the private map, and if it moved,
something is wired wrong.

## 12. Out of scope

- `HunterAI` body, chase and take, `taken.js`, CAUGHT. The token stays mesh-less. **Next slice.**
- Retuning `top`'s 9.0 m / 81°. It is measured, photographed and approved.
- Handedness mirroring; the stick's noise ring; junction-swipe rails.
- Any edit to `player.js`.
- A lid opacity fade. If the pop still reads badly after the §4.6 timing, that is its own slice.
- The vestigial `act` key on `MOVE_KEYS` — it travels one hop as a constant `0`. Leave it.
