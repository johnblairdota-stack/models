# The performance budget — spending it on the rest of the estate

Written 2026-08-08, at the point where the gallery has been ported to the real estate art and two
more rooms plus their lighting are queued behind it.

---

## 0. 🚨 Read this before trusting any number below

**The measuring tool was lying, and the history is not per-station.** `estate-spike-1` found that
`engine.director` **was never assigned anywhere in `src/`**, so `perf-spaces.mjs`'s "the camera is
parked" guard has always been silently false. Behind it sat a NaN, and behind *that* a camera boom
that eases **22.9 m during a supposedly stationary 2 s sample**. In capture mode, frames only run
inside a `resetPerf()` window, so that tool's warm-up lap has never warmed anything.

⚠️ **So the recorded "worst space 1.22–1.38 ms / 576–596 calls" figures are not what they claim.**
Every number in §2 is marked with how much it can be trusted. **Step one of this plan is
re-baselining on the fixed tool, on a quiet machine.** Both `perf-ab.mjs` and `perf-spaces.mjs` now
take `--port` (fixed 2026-08-08, after that collision blocked GPU measurement for four consecutive
rounds), so the excuse is gone.

---

## 1. 🎯 THE DECISION THAT MOVES EVERYTHING — and it is John's

The budget is **1.39 ms of GPU time**. That number is not a measurement, it is a derivation:

```
BUDGET = 16.67 ms / REF_RATIO      REF_RATIO = 12
```

`shoot.mjs` states the assumption in full: *"The target is 60 fps at 1080p on integrated graphics.
This harness does not run on integrated graphics, so a raw fps number here is meaningless — an RTX
3060 Ti will report 800 fps on a scene that stutters on an Iris Xe."* So 1.39 ms on the dev machine
stands in for a whole 16.67 ms frame on a weak laptop.

**Nobody has revisited that assumption, and it is a 12× lever on everything else in this document.**

| if the target is… | REF_RATIO | budget | where we are today |
|---|---|---|---|
| **integrated laptop graphics** (the current assumption) | 12 | **1.39 ms** | ~2× over |
| a modest discrete GPU | ~6 | 2.78 ms | roughly at it |
| **John's own machines** (RTX 3060 Ti + the tablet) | ~3 | 5.56 ms | comfortably inside |

⚠️ **This is a decision, not a measurement.** *"Who has to be able to play this?"* is a product
question. **Until it is answered, every "over budget" claim in this project is over a budget nobody
has confirmed we want.** Two data points worth weighing: John's tablet **loaded faster than his
RTX 3060 Ti** (that was shader compilation, not raster), and the game already runs on that tablet at
`quality=low`.

**Recommendation: keep REF_RATIO 12 as the shipping goal but stop treating it as a gate today.**
Ship-blocking on a laptop nobody has tested, while the art is still being decided, spends rounds on
the wrong thing. Re-assert it as a hard gate once the estate is in.

---

## 2. Where we actually are

| | value | confidence |
|---|---|---|
| GPU, `dig=1` | **2.95 ms** | measured `chunks-6`, 3 interleaved rounds, `quality=medium` — **good** |
| GPU, `dig=0` (shipped control) | **2.72 ms** | same run — **good** |
| **the dig's own cost** | **−0.23 ms against a 0.28 ms spread → NOT RESOLVED** | **treat as zero** |
| draw calls, `gallery.mid` + estate port | 570 / 625 | `estate-1`, deterministic — **good** |
| draw calls, `chapel.centre` | **645 / 625 — OVER** | `estate-1` — **good** |
| triangles | 337k / 900k | **good** |
| cold load | ~82 s (~15 s warm, same browser profile) | `boot-1` — **good** |

🚨 **Both arms are ~2× budget, including with the dig turned OFF.** Whatever the overrun is, **it is
not the dig and not any of the six dig rounds.** It is the shipped game.

⚠️ And the chapel was already at **634 calls before the estate port** — it is a pre-existing failure
that the port made marginally worse, not one the port caused.

---

## 3. What is still to be added, and what it costs

### 3a. The study room — **cheap, do it next**
The gallery is the precedent and it is a good one: **architecture + materials cost +11 draw calls and
0 extra bakes.** Draw calls scale with *material keys*, not geometry, because `GeoBin` already merges
— 14 clerestory bays, 20 pilasters, a coffered ceiling and 12 framed portraits came to eleven calls.
**Budget: ~15 calls, ~0.1 ms. Expect it to be nearly free.**

### 3b. The ballroom — ⚠️ **NOT a port. A design decision first.**
The game's ballroom is `storey 7.20`. The showcase's is a **two-storey 9.6 m with a musicians'
gallery**, and **the upper window order is what earns its PASS 85**. It cannot be lifted; something
has to be cut or the game's room has to grow. **Do not schedule this as engineering until John has
said which.**

### 3c. 🔴 The lighting — **this is where the budget actually goes**
Measured by the project's own ABBA instrument: **one point light = 0.112 ms** (SE 0.031).

| | cost | verdict |
|---|---|---|
| the showcase gallery's 17 point lights | **1.90 ms** | **137% of the entire budget, for one room** |
| the ported gallery's 2 lights | 0.22 ms | shipped |
| 3 rooms × 2 lights | 0.67 ms | **48% of budget — affordable** |
| 3 rooms × 6 lights | 2.02 ms | **over budget on lights alone** |

⚠️ **The fixture MESHES are nearly free once merged** — `estate-1` took 200 objects to 5, which is the
whole difference between +184 draw calls and a handful. **It is the lights themselves that cost.**
🎯 **So the rule is: bring in every fixture, light very few of them.** John's steer — *"light will be
important but for now it's okay if its just more practical"* — is exactly the right order.

### 3d. Everything already in
The hunter is the single most expensive object in the game (a census put it at **322 meshes and 209k
triangles**), and it is already counted in §2's numbers because `perf-spaces` parks it 6 m in front
of the camera on purpose.

---

## 4. The allocation

Against **1.39 ms** (REF_RATIO 12), which today is aspirational:

| | share | note |
|---|---|---|
| the shipped scene (rooms, hunter, post) | **1.00 ms** | the overrun lives here and is unattributed |
| lighting, all rooms | **0.25 ms** | ≈2 point lights per room |
| destruction (dig, debris, dust) | **0.10 ms** | measured at ~0 today; leave headroom for disconnection |
| slack | **0.04 ms** | |

**Draw calls, against 625:** rooms ~120 each once ported · hunter and gadgets ~150 · destruction ≤10
(instancing already makes a pristine panel cost no call of its own) · **keep 60 in reserve** —
residency means a doorway sightline can put two rooms on screen, which is exactly how the chapel
reached 645.

---

## 5. The sequence — measure at every step, stop when a step costs more than its slice

1. **Re-baseline on the fixed tool, quiet machine.** ⚠️ Nothing below means anything until this
   exists. Record per-station, both `dig` arms.
2. **Attribute the 2× overrun.** It is present with the dig off, so it is rooms, hunter or post.
   ⚠️ **Do this BEFORE adding rooms**, or the new art inherits the blame for it.
3. **Port the study.** Budget ~15 calls. Measure. (The gallery says this is nearly free.)
4. **Decide the ballroom** (John), then port to that decision.
5. **Light the rooms — two lights each, fixtures merged first.** Merging is not an optimisation
   here, it is the prerequisite: unmerged practicals were +184 calls for one room.
6. **Re-assert REF_RATIO 12 as a hard gate** and close whatever is left.

## 6. Savings already identified but not yet banked

- **534 of 696 shader programs are the same GLSL compiled again** — `wall.js:262`'s per-panel
  `pinProgramKey`. **~57 s of the 82 s cold load.** ⚠️ Load time, not frame time — but it taxes every
  iteration and every checkpoint. Collapsing the key projects a **~25 s** cold load.
- **Idle debris pools were paying draw calls for nothing.** `chunks-2` found four `InstancedMesh`es
  submitting beauty *and* shadow every frame for 880 zero-scaled instances; gating `visible` on live
  count paid for an entire new debris type and still came in at **net −8 calls**. ⚠️ **Worth sweeping
  for the same pattern elsewhere** — it is invisible in a census and free to fix.
- **`?warmlap=compile`** exists (opt-in): 14% cheaper per program, but reaches 169 programs the drawn
  lap never does, so it costs 8.5 s more *today*. **Flip it once the program count comes down.**

---

## 7. The rule to hold on to

**Draw calls scale with material keys, not geometry. GPU time scales with lights and fill.**

That one sentence explains every measurement in this document: why a coffered ceiling and twelve
portraits cost eleven calls, why 138 unmerged candle fixtures cost 184, and why two point lights cost
more than all the geometry in the room put together.
