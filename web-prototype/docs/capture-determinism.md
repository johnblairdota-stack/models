# Capture determinism — what a screenshot is a picture of

**Status: fixed 2026-08-05. All 37 views verified pixel-identical over repeated runs.**
Gate: `node harness/determinism.mjs --all`

> 🚨 **AND IT IS A CAPTURE-MODE DOCUMENT. LIVE MODE WAS NEVER COVERED, AND EVERY
> `harness/scenarios/*.mjs` RUNS IN LIVE MODE.** Read **§7** before trusting any pixel number
> taken by a scenario. Nothing below regressed; the gap was always there and §4 states it in
> one line. Two agents hit it independently on 2026-08-09.

Every A/B on this project, and every grade-gate number, rests on one assumption: *two
captures of unchanged source are the same image.* Until 2026-08-05 that was false, and
nothing in the harness would have told you. This is the record of how false it was, why,
and what is guaranteed now.

---

## 1. The defect, as measured

Two `harness/shoot.mjs` runs of the same view with **identical flags**:

| view | differing PNG bytes | mean delta | max delta |
|---|---|---|---|
| `mat.lath` (studio grade, no grain) | 10.1% | 1.5 / 255 | 69 |
| `room.ballroom` (estate grade, grain 0.026) | 83.1% | 2.7 / 255 | 165 |

Found by accident during the `camtool-1` task, while building the orbit-controls camera in
`src/views/_studio.js`. Not a PNG re-encoding artifact — confirmed by decoding both files
and diffing raw pixels (that decoder is now `harness/pxdiff.mjs`).

This directly contradicted the design goal stated in `src/core/engine.js`'s own class
comment: *"deterministic RNG … two screenshots of the same view are the same image."*

## 2. Root cause — two independent mechanisms

### 2a. The capture loop free-ran through every Playwright round trip

`_captureLoop` stepped the simulation on every rAF, unconditionally, from `start()` until
the process died. rAF is uncapped in the harness (`--disable-frame-rate-limit`), so it kept
running during every `page.evaluate` and, above all, during the screenshot itself.

**Measured: 790 frames — 13.2 seconds of simulation — elapse inside one
`page.screenshot()` call.**

So `settle(12)` resolved at frame 16, and the pixels that reached disk were from frame
~806. The captured moment was a wall-clock lottery: a different frame index and a different
simulation time on every run, and on every machine.

`src/views/gadget.js` reasons out loud about *"after `settle(12)` — twelve fixed 1/60
steps, i.e. **t ≈ 0.20 s**"*. The true capture time was ~13 s. Anything tuned against that
comment was tuned against a moment the harness never actually captured.

### 2b. Two post passes are deliberately frame-variant

Both trade a per-frame dither for smoothness the eye integrates over time. A screenshot
integrates nothing — it gets one frame — so both were pure per-run noise:

- **AO sample rotation.** `pipeline.js` set `uFrame = frame % 64`, feeding
  `ign(pix + uFrame*7)` and `ign(pix.yx + 13 + uFrame*3)` in `shaders.js`. This is what made
  `mat.lath` drift even though its `studio` grade has `grain: 0`.
- **Film grain phase.** `h21(gp + fract(uTime) * 511)`, with `uTime` = elapsed seconds. This
  is the extra 73 points of byte-drift on `room.ballroom`.

Plus, for animated views, the scene genuinely moves: `room.ballroom`'s chandeliers run off
`t`, and 790 frames of drift is 13 seconds of a different pose.

### 2c. What it was NOT

The first hypothesis was the async-bake gate — that `settle()` resolving on
`_pendingWork === 0` would land on different frame numbers as bake timing varied. **That was
not the cause.** Across every run of both views probed, `_pendingWork` was `0` at
`markReady()` and the settle countdown was exact every time (frame 2 → 16/17, never
otherwise). `src/materials/baker.js` contains no `async`, `await` or rAF at all — it is
fully synchronous — and `engine.work()` has exactly one caller in the tree
(`src/views/game.js:119`).

The gate was hardened anyway, because it was structurally able to become a cause: it counted
settle frames down *while* work was outstanding, so a genuinely async bake would have made
the settled sim time a function of how long that bake took in wall-clock terms.

### 2d. The experiment that isolated it

`node harness/determinism.mjs --explain`. It freezes the rAF loop and renders exact frame
counts inside one page, so GPU state is identical across samples and the only variable is
the frame index. On the broken build:

```
pipe100 vs pipe101        7.163% bytes  12.562% px  mean 1.459  max 66
pipe100 vs pipe100_again  IDENTICAL
pipe100 vs pipe164        IDENTICAL          <- 164 % 64 == 100 % 64
```

Three separate renders of the same state are bit-identical, and frame 164 matches frame 100
exactly because the dither is periodic mod 64. **The GPU is perfectly repeatable; only those
two uniforms were not.** On the fixed build every row reads `IDENTICAL`.

---

## 3. The fix

**Capture mode no longer free-runs** (`src/core/engine.js`, `_captureLoop`). It steps only
while something is waiting on a frame: an outstanding `settle()` target, a `?at=N` run-up, an
explicit measurement window, or the boot frame. Otherwise it parks and holds the last frame.
`preserveDrawingBuffer` is already on in capture mode, so a parked canvas screenshots exactly
what it last drew. The screenshot cost 790 wasted frames before; it costs none now.

- The **boot frame** steps with `dt = 0`. It poses the scene at t=0 and paints it, so a tool
  that screenshots without settling gets the view rather than a blank canvas — but it costs
  no simulation time, which keeps `settle(n)` worth exactly `n/60` seconds.
- `_pendingWork > 0` parks the loop too, so async setup can never bleed into the sim clock.
- `resetPerf()` opens a free-running window (perf needs real back-to-back frames);
  `settle()` closes it. Every perf tool in `harness/` already called `resetPerf()` immediately
  before its sampling wait, which is exactly the right boundary. `window.__rrr.freeRun(on)`
  is the explicit knob for anything else.

**The two frame-variant post terms are pinned in capture mode** (`src/post/pipeline.js`,
`deterministic: true` from `engine.capture`): `uFrame → 0`, and the grain phase → 0. Live
mode is untouched — grain still animates and the AO dither still rotates there. The dither
*magnitude* is unchanged either way; pinning changes the seed, not the noise level.

`shaders.js` gained `uGrainPhase` in place of the composite's `uTime`, which was only ever
used for grain. The `fract` is now done on the CPU in float64: at t = 900 s a float32
`fract(uTime)` in the shader has ~5 significant bits left and the grain visibly coarsens.

**`harness/shoot.mjs` takes the screenshot before the perf window.** A measurement window
runs frames free, so the sim time on its far side is wall-clock dependent. Capturing first
makes the PNG a function of the flags and nothing else — `--view X` and `--view X --perf`
now produce byte-identical images, which they did not before. The perf block warms the GPU
for 700 ms (`--perfwarmms`) before opening its sample window, because the loop is parked
during the screenshot and sampling straight out of idle measures the clock ramp.

---

## 4. What is guaranteed now, and what is not

**Guaranteed** — verified across all 37 views, and across separate browser processes:

- Same view, same flags, same machine → **pixel-identical**. Any nonzero delta is a real
  change. There is no noise floor to subtract any more.
- The captured moment is a property of the flags:
  - default: `t = settle/60` s — **t = 0.2000 s**, frame 13, at the default `--settle 12`
  - `--seconds N`: `t = (N*60 + settle)/60` s, i.e. N **simulated** seconds then the settle
  - `--at N`: the first fixed 1/60 step at or after N (within 1/60 s of N, and identical run
    to run), then the settle frames render frozen at that pose
- `--perf` / `--gate` / `--at4k` do not change the image.

**Not guaranteed:**

- **Across machines, GPUs or drivers.** ANGLE compiles different code for different targets
  and float behaviour differs. Only compare captures taken on the same box.
- **Across quality tiers or pass toggles** (`--extra "quality=…&ao=0"`) — different by design.
- **Live mode.** Still temporally dithered, deliberately. Determinism is a capture-mode
  property.
- **Perf numbers.** Still noisy: this box drifts ~30% with heat, and a concurrent agent
  running captures against the shared dev server competes for the same GPU. Only back-to-back
  A/B is sound. Determinism is about *pixels*, not milliseconds.

## 5. Consequence: reference shots of animated views moved

Animated views used to capture at a random ~13 s; they now capture at a deterministic
t = 0.20 s. **Any reference shot of an animated view taken before 2026-08-05 is at an
arbitrary, unreproducible moment and should be re-taken.** Static views moved only by the AO
dither reseed.

Views with time-dependent content (`onUpdate` in `src/views/`): `char.locomotion`,
`gadget.*` (via `gadget-sheet.js`/`gadget.js`), `game.play`, `limb.detach`,
`prop.chandelier`, `room.ballroom`, `wall.transition`, plus anything using `_studio.js`'s
turntable.

Measured old-vs-new on a sample, which shows the two regimes cleanly:

| view | mean delta | reading |
|---|---|---|
| `mat.lath` (static) | 1.67 | AO dither reseed only — same frame |
| `char.locomotion` (animated) | 6.18 | a different moment of the walk cycle |
| `prop.chandelier` (animated) | 4.30 | a different moment |
| `wall.transition` (animated) | 40.29 | a different moment (and a stale Aug-1 reference) |

## 6. How to check

```bash
node harness/determinism.mjs --all
```

Exits non-zero if any view drifts, and writes `progress/last-determinism.json`. Also
`--view <id>`, `--group <name>`, `--runs N`, `--at N`, `--keep` (leave the PNGs on disk),
and `--explain` (re-run the isolating experiment from §2d).

`harness/pxdiff.mjs a.png b.png` diffs any two captures at the raw-pixel level. It reports
both per-byte and per-pixel-max statistics because they answer different questions: a
uniform dither reads as a huge byte percentage and a tiny mean, while a real content change
reads as a small percentage and a large max.

**A failure here is not cosmetic.** It means the harness cannot tell you whether a change
you just made did anything — which makes every downstream number unfalsifiable.

---

## 7. The half this document never covered: LIVE mode (2026-08-09, `jitter-1`)

§4 already says it, in one line under **Not guaranteed**: *"Live mode. Still temporally
dithered, deliberately. Determinism is a capture-mode property."* That sentence is correct and
it is also the whole hole, because of something that was not true when it was written:

🚨 **`harness/playtest.mjs` boots the LIVE loop — deliberately, that is its entire reason to
exist — and every `harness/scenarios/*.mjs` goes through it.** So *every scenario pixel A/B on
this project is taken in the one mode this document excludes.* `determinism.mjs --all` was and
still is green; nothing regressed. The instrument simply never pointed here.

What it cost, from two directions on the same day, neither agent looking for it:

- `visible-1`: `_progkey1-independence`'s same-config floor — **two captures, nothing done
  between them** — read **43–49% of the rect moved, mean |Δ| 12–14**, against the 0.44%
  HANDOFF recorded. Its bar is `test > 3 × floor`, so *"the dug panel's pixels changed"*
  **failed at 90% moved.**
- `calls-1`: *"kill the grain first or the same-config floor is 22–42% of pixels."*

### 7.1 What it actually is — each term armed ALONE on a pixel-identical base

`harness/scenarios/_jitter1-who.mjs`. The base is `deterministic` + every scene updater parked,
which is pixel-identical across a 12-frame burst at both stations, so each row owns everything
it moves. `?seed=s4&dig=1`, quality auto, 1280×720, one 320 ms window:

| armed alone, between the two captures | gallery station (rect) | service station (rect) |
|---|---|---|
| the grain **phase** advances | 0.74% moved, \|Δ\| 1.94 | 0.08% moved, \|Δ\| 2.12 |
| the AO sample rotation advances | 0.47% moved, \|Δ\| 1.52 | 0.07% moved, \|Δ\| 1.63 |
| **ONE dynamic-resolution step** | **7.54% moved, \|Δ\| 3.63** | 0.40% moved, \|Δ\| 2.28 |
| the whole game update, 320 ms | 0.07% moved, \|Δ\| 1.79 | 0.48% moved, \|Δ\| 0.78 |
| the four practical **flickers** | **0.00%, pixel-identical** | **0.00%, pixel-identical** |

🎯 **THE BIG TERM IS DYNAMIC RESOLUTION AND NOBODY WAS LOOKING AT IT.** `_liveLoop` nudges
`renderScale` by 0.02 whenever the 120-frame average leaves a band around the frame budget, and
the whole chain renders at that scale with the AA pass upscaling — **so one step resamples every
pixel in the frame.** It is driven by frame time, frame time is driven by whatever else is on
the GPU, and that is why the identical test floors at **0.7% alone and 43–49% while another
agent is capturing.** A floor that is a function of the neighbours is not a floor.

⚠️ **"KILL THE GRAIN" IS NOT THE FIX, AND THE ARITHMETIC IN HANDOFF WAS RIGHT.** Grain ships at
0.024, i.e. ±3 of 255; measured, it moves **under 1% of pixels** past a `d > 8` threshold and
contributes **|Δ| ≈ 2**. It cannot produce mean |Δ| 12–14. Removing it *lowers* a floor; it does
not *make* one, and doing it by editing the grade would take something out of the game to make
a test pass.

⚠️ **AND THE "GALLERY-LOCAL PRACTICAL" HYPOTHESIS IS REFUTED, MEASURED RATHER THAN ARGUED.**
`fixture-merge.js`'s global flicker — the one animated thing in `gallery-rig.js` — moves
**exactly zero pixels** over a live window at either station: its gust scales an emissive core
that is already clipped white and a glow decal by ~0.5%. The reason the gallery floors worse
than the service passage is not that the gallery has practicals. It is that **the gallery
station's frame is full of high-frequency detail** (portraits, pilasters, coffers) and the
service passage is flat plaster, so a whole-frame resample moves 7.54% of one and 0.40% of the
other. The camera does **not** drift: measured at **0.000 mm and 0.00e+0 rad over 32 live
frames** once settled.

### 7.2 The fix: `harness/still.mjs` — and there is no source change

```js
import { hold, release, unpinDithers, stillPair } from '../still.mjs';
```

`hold(page)` pins, from the page, the four terms above: `pipeline.deterministic = true` (the
grain **phase** and the AO rotation — never the grain **amplitude**), `opts.dynamicRes = false`
plus a canonical `renderScale` shared by every hold in the session, and `engine._updaters`
parked. `release(page)` puts all of it back exactly.

**Nothing in `src/` changed and nothing a player sees is different.** The grain still ships at
0.024 and still animates in the game; `GRADE_PRESETS` and `pipeline.js` are untouched. Every
knob is a field the live loop re-reads on the next frame, so the hold is armed and reverted
inside one page.

⚠️ **THE ORDER IS LOAD-BEARING AND GETTING IT WRONG PRODUCES A TABLE OF CONFIDENT ZEROES.**
The camera is driven **by** an updater. Hold first and then teleport, and the camera never
follows: the first build of `_jitter1-who.mjs` did exactly that and its second station's panel
projected to `-2556,-210`, entirely off screen, while every row under it read `0.00%`.

    await station(...);      // move
    await settle(45);        // let the camera ARRIVE, sim running
    await hold(page);        // now freeze
    ... two captures ...
    await release(page);

⚠️ **AND EVERY HOLD IN A SESSION MUST SHARE ONE `renderScale`.** Pinning "wherever it is now"
makes each pair internally consistent while the before/after comparison across two pairs is a
comparison of two render resolutions. `hold()` records the canonical scale on its first call.

### 7.3 Result, and the gate that should have existed

`_progkey1-independence`, both arms, same-config floor (two captures, nothing between them):

| | before | after |
|---|---|---|
| damage arm, `f.gal_east.0.a` | 4.18% moved (43–49% under load), \|Δ\| 4.19 | **0.00% moved, \|Δ\| 0.000** |
| damage arm, `f.gal_east.1.a` | 23.21% moved, \|Δ\| 5.80 | **0.00% moved, \|Δ\| 0.000** |
| scalar arm, `p.svc_w.n` | 0.74–4.75% moved | **0.00% moved, \|Δ\| 0.000** |
| scalar arm, `p.svc_w.s` | — | **0.00% moved, \|Δ\| 0.000** |

🚨 **STATE THE STANDARD EVERY TIME.** HANDOFF is right that *"byte-identical"* is an impossible
test in general and must never be demanded as proof of a **change**. This is the other case:
two captures of a held page are supposed to be the same picture, so **pixel-identical is the
standard being held here deliberately**, and the scenario's tolerance is slack against a
compositor, not a noise budget. It reads exactly 0.000 on this box.

**A scenario that measures a floor must ASSERT it is a floor.** The old form printed it and
divided by it, so a 23% floor silently granted the neighbour a **70% allowance to move** and a
48% one made the target's own 90% a FAIL. Both read, in a tail, as a game defect rather than an
instrument fault. `_progkey1-independence` now fails on the floor itself, first, and says not to
read the rest of the run — and it **reintroduces the defect in the same page on every run**
(`unpinDithers`), because a floor gate that has only ever seen a still page proves nothing.
