# The 5-second freezes — a diagnosis plan

John, 2026-08-04: *"The playable slice is very laggy. sometimes very smooth some times the browser
says 'this page is slowing down Firefox' and it freezes for 5 seconds or so."*

**Smooth-then-frozen is not a framerate problem.** A slow frame budget makes everything evenly
sluggish; multi-second freezes with smooth play between them are **main-thread stalls**, and they
have a small number of possible causes. Measured GPU time is 1.22–1.38 ms against a 1.39 ms budget
— so the renderer is *not* the thing failing.

---

## ✅ ANSWERED, 2026-08-04 (perf-stall-1). IT IS A SHADER COMPILE, AND THE CAUSE IS THAT THERE ARE **FOUR** POINT-LIGHT COUNTS, NOT TWO.

**Instrument: `harness/perf-stall.mjs`.** LIVE mode (no `capture=1`), a 4-minute autopilot session,
and a per-frame recorder that keeps EVERY frame of the session in preallocated typed arrays.

**John's freeze is reproduced on demand: episodes of 4.97 s, 5.29 s, 5.41 s, 5.90 s, 10.26 s.**

The counter that names it: `renderer.info.programs.length` jumps **+30 to +52 on the stalling
frame**, `renderer.info.memory.textures` is FLAT, `baker.stats.bakes` is FLAT, and **~100 % of the
interval is inside `pipeline.render()`**. Programs built *during play*, five un-prewarmed runs:
**+152, +107, +177, +132, +111**. It is a compile. It is not an upload, not a bake, and the game's
own per-frame update JS is 0/19 of the slow frames.

**Why the existing warm-up misses it.** `views/game.js:855` loops `for (const flareOn of [true,
false])` — two point-light counts, because the file believes the only thing that moves the count is
the hunter's eye. Measured, the RENDERED count takes **four** values in live play — **8, 9, 10, 11**
— and the probe names the lights:

    10 = warmA + warmB + cool  +  nailgun x2  +  oil (fireSplash, oilJet) x2  +  grapple  +  skates x2
    11 = 10 + the hunter's eye flare
     8 = 10 - the nail gun's pair leaving the render list
     9 = 8 + the flare

**The gadgets bring their own point lights** (`src/gadgets/index.js:447,450,814,817,1123,1962`), so
`views/game.js:169`'s "THE LIGHT COUNT IS FIXED FOR THE WHOLE MANSION AND MUST NEVER CHANGE" is true
of the room rig and false of the game. **One frame at an uncompiled count recompiles every visible
material** — in one run count 8 was live for a single frame and still cost +132 programs.

**Proof by removal.** `harness/perf-stall.mjs --prewarm` re-runs the load warm-up with every object
visible and **four** light variants (16 s, +230 programs, paid at load). In-play program builds
collapse **+152/+107/+177 → +10/+8/+7/+2**, reproduced four times, and no freeze episode in any
prewarmed run contains a compile burst.

**Second cause, now the leading residual: dynamic resolution.** `Engine._liveLoop` moves
`renderScale` whenever the 120-frame average is outside ±budget and calls `pipeline.setSize()`,
which **disposes and reallocates the whole render-target chain**. One stall inflates that average
for 120 frames, so it steps the scale down ~19 frames in a row: **102–306 full RT rebuilds per
4-minute session**, each costing 30–600 ms, landing OUTSIDE `pipeline.render()`. `_captureLoop`
pins it, so no capture-mode tool has ever executed one frame of this.

⚠️ **`?exits=4` is NOT the cause.** It is a multiplier: 14 yards carry **+157 programs at boot**
(444 vs 287) and therefore more to recompile per light variant (+152/+177 vs +111) — but the
`exits=4` arm still froze for 5.41 s on a 31-program compile burst. Suspect #1 in the old ordering
is wrong.

⚠️ **GC IS UNMEASURED, NOT RULED OUT.** `performance.memory.usedJSHeapSize` **never moved once** in
any of nine sessions, with or without `--enable-precise-memory-info`. That column is dead; a GC
pause would appear in the tool's ELSEWHERE bucket.

## ⚠️ 0. CORRECTION — John tested Chrome and **the spikes happen there too**

**That refutes §1 as the primary explanation.** It is not a Firefox-specific fault, and the
browser-coverage gap — while still real and still worth closing — is no longer the lead suspect.

**The sharper question is now: the harness DOES drive Chromium, so why has it never caught this?**
Because of what the harness never does:

- **It never plays a long, human-paced session.** Every scenario is a short scripted run or a
  parked station. **Nothing accumulates**: debris, dust, detached limbs, wall damage across
  panels, hunter growth, and the exterior's per-site state all build up over minutes of real play
  and are measured over seconds of scripted play.
- **The live warm-up is `if (!engine.capture)`**, so every capture-mode tool skips the exact code
  path that live play depends on.
- **Frame-time averages hide stalls by construction.** A 5 s freeze inside a 60 s window is one
  sample; the mean barely moves. **Nothing in the harness reports a MAXIMUM frame time or a
  histogram tail** — and the tail is the entire complaint.

**🆕 TOP SUSPECT, and it is recent: the exit pool went from 4 sites to 14, EACH WITH ITS OWN YARD.**
That is ~3.5× the exterior geometry and textures, all built at load and warmed hidden — and the
"+3 draw calls, +1 when not resident" figure that made the exterior look free **was measured when
there were four.** Combined with a bake already measured at 222–270 MB and one live HUD read of
96.5 MB VRAM, texture residency on an integrated GPU is now the most plausible cause of an
*intermittent, multi-second, browser-independent* freeze.

**Revised order of work:** (1) add **max frame time and a p99 tail** to the harness — the metric
that would have caught this on day one; (2) drive a **10-minute human-paced session** and log
per-frame programs / textures / heap; (3) ablate the yard count (`?exits=4` already exists) and
re-measure; (4) only then worry about browsers.

> ⚠️ Steps 1–3 are DONE (`harness/perf-stall.mjs`) and the answer is at the top of this file.
> **Step 3's prediction was wrong**: `?exits=4` did not remove the freezes. Suspect ordering by
> plausibility cost nothing here only because the instrument was built first.
>
> ⚠️ **"Nothing in the harness reports a MAXIMUM frame time" was not quite right, and the real
> defect is worse than the stated one.** `Engine.perf()` has reported `frameMaxMs` and
> `frameP95Ms` since it was written — over a **120-sample ring**, i.e. **two seconds at 60 fps**.
> A five-second freeze is gone from that window before anything can read it, and every consumer
> reads a mean anyway. A max that only remembers two seconds is worse than no max, because it
> looks like coverage.

## 1. The browser-coverage gap (still true, no longer the lead suspect)

**55 harness files drive Chromium. Not one drives Firefox.** Every perf number, every stall fix and
every capture in this project's history was taken in headless Chromium via Playwright.

This matters more than usual here, because **the stall class John is describing has already been
found and fixed once — in Chromium.** `views/game.js:818` records it at length:

- `renderer.compile()` **is not enough on its own**: walking study → gallery still cost a **1974 ms**
  frame, with the renderer's program count going **59 → 73 in that one frame**. Program count is
  what separates a *shader compile* from a *texture upload* — they need opposite fixes — so this
  was unambiguously a compile.
- The fix is to **actually draw each space once** during loading, camera inside it so nothing is
  frustum-culled out of the pass.
- **And once per light-count variant**, because `numPointLights` is part of three's program cache
  key and `HunterAI._setFlare(true)` **adds the eye light the first time the hunter notices you**.
  Measured at **1974–2410 ms across five runs, always exactly +14 programs**. It took four wrong
  fixes to find, and it was not the doorway crossing — it was the eye light coming on.

**Firefox does not have to behave the same way.** Different program cache key, different lazy
linking, a separate GPU process with IPC, and no guarantee that the Chromium-shaped warm-up forces
the same work. **A warm-up validated on one browser is not a warm-up.**

⚠️ Playwright already ships Firefox. `import { chromium }` → `firefox` is close to a one-line
change per script. **Until that runs, every perf claim in this repo silently means "in Chromium".**

## 2. Ruled out

**`resetRound()`'s ~3 s cost is capture-only.** `game.js:760` guards it with
`if (engine.capture && t > resetAt)`, so it cannot fire in live play. (It is still worth fixing for
the capture director, which eats it every 28 s — but it is not this.)

## 3. The three candidates, and how to tell them apart

They need opposite fixes, so **identify before building.** One per-frame probe distinguishes all
three — the technique is already proven in this repo:

| cause | signature on the stalling frame | fix |
|---|---|---|
| **shader compile** | `renderer.info.programs.length` jumps | draw each space × each light variant during load |
| **texture upload** | `renderer.info.memory.textures` / VRAM jumps, programs flat | smaller bakes, upload during the loading screen |
| **GC pause** | neither jumps; `performance.memory` sawtooths | pool the debris/dust allocations |

**Texture upload deserves real suspicion**, and nobody has measured it in play: the estate atlas
work took the bake from **222.1 MB to 270.3 MB**, and one live HUD read showed **96.5 MB VRAM with a
62 342 ms bake**. On integrated or tablet GPUs that is enough for the driver to evict and re-upload,
which produces exactly this stutter pattern — intermittent, multi-second, and invisible to a
frame-time average.

## 4. What John can settle in five minutes, better than any agent

The freeze correlates with **an event**, and which event names the cause. While playing, note
whether the freeze happens when:

1. **entering a room you have not been in yet** → first-visit compile or upload
2. **the hunter first notices you** (its eye light comes on) → the light-variant compile, i.e. the
   Chromium fix not holding in Firefox
3. **an exit first opens** → the exterior's programs, built hidden (`exterior.warmup(true)` exists
   precisely for this; `game.js:814` calls that frame *"the one frame in the run where a stall is
   unforgivable: it is the win"*)
4. **none of the above / at random** → GC or texture eviction

## 5. Immediate mitigations, no diagnosis required

- **`&quality=low`** — drops AO entirely, halves shadow map, cuts particles and dust. Biggest single
  lever available today.
- Confirm Firefox has **hardware acceleration** enabled; software WebGL would produce this exactly.
- `about:support` → check the WebGL/compositing backend.

## 6. Order of work

1. **Make the harness drive Firefox** — an instrument that only sees one browser has been reporting
   on a game played in another.
2. **Per-frame probe** (programs / textures / heap) in live play, in Firefox, to name the cause.
3. Fix the one it names. **Do not pre-emptively fix all three.**
4. Then re-cost the bake sizes, which are large and have never been questioned in a play context.
