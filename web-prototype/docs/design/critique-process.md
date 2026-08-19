# Critique — how this project is WORKED

`critic-process-1`, 2026-08-10. Subject: the orchestration, the briefs, the instruments and the
coordinator. **Not the game.** `critic-dig-8` is judging the game; nothing here touches its subject.

**I did not watch any of this happen.** I read its residue: `docs/design/agent-cost-audit.md`,
`HANDOFF.md` in full, `docs/handoff/instruments.md`, `docs/capture-determinism.md`,
`docs/design/house-packing.md`, `docs/design/critique-corridor-house.md`,
`docs/design/teardown-reference.md`, `docs/agents-resume-2026-08-09.md`, one slice brief
(`docs/slices/task-chunks-thickness.md`).

🚨 **Everything in that residue is testimony by agents with an interest in looking competent.**
I weight it accordingly, and I say where it matters. One structural note in the record's favour,
because it is the single best thing about this project's writing: **the reports confess.**
`jitter-1` wrote up *"the two ways the probe lied first"*; `calls-1` wrote *"the obvious probe
passed the broken build"*; `collapse-2` wrote *"the probe that measures the skill lied first"*.
An agent that reports its own instrument's failure is reporting against interest, and those are
the claims I trust most. The claims I trust least are the unattributed superlatives ("the biggest
single win on the board") and any number with no instrument named beside it.

**Two numbers in this document are mine, not the record's**, and both are computed from the audit's
own 18-row table: the cost regression in §4, and the token weight of `HANDOFF.md` in §4.2.

---

## 0. The verdict, before the detail

**You are doing well and being impatient — but not about nothing.** Two days produced boot
199.7 → 98.9 s, draw calls 682 → 426 (and the never-measured fully-dug worst case from ~857 → 567),
softlock 16/1750 → 0, dead blows 62.5% → 4.1%, a capture floor of 43–49% → 0.00%, six playtest
blockers cleared, and a procedural phase de-risked over 512 seeds. That is not a slow project.

**But "slow going" is pointing at something real, and it is not what anyone has looked at.**
Fitted to the audit's own table, **~180k tokens of every agent's cost is fixed** — paid before the
agent does anything — and 23 agents × ~180k is **≈4.1M of the 6.2M spent (66%)**. The single
largest line item in this campaign is **agents reading this project's own documentation**, and
`HANDOFF.md` alone is ~72k tokens that line 1 instructs every session to read in full. The 2026-08-07
diet was the right instinct and it has been undone in three days.

**And "we were not measuring the correct way" is correct, there is one pattern, and it is none of
the four you proposed** — those are four faces of it. The pattern is that **an instrument's failure
mode produced a result-shaped output instead of an error**, so "I could not observe" and "there is
nothing there" were indistinguishable. The counter already exists in this project, it is three days
old, and it has a perfect record. It is the top recommendation.

---

## 1. 🎯 "We were not measuring the correct way." Is there a pattern?

**Yes. One, and it subsumes all four of your candidates.**

### 1.1 The pattern

> **Almost every bad measurement here is an instrument whose failure mode is silent and
> plausible.** The probe could not observe, and said PASS, or 0.00, or "no difference", or
> "nothing draws there" — an answer shaped exactly like a finding.

Sorted from the record, by mechanism rather than by symptom:

| # | the instrument | what it said | what was true |
|---|---|---|---|
| 1 | `_progkey1-independence`, first form | independence PASS | framed from **outside the passage** |
| 2 | the old C4 check | "closed" | **accepted "closed" unconditionally — could not fail** |
| 3 | `mechanics` slow-frame check, v1 | PASS with the fix reverted | keydown/keyup as two CDP messages, a race the fast box wins |
| 4 | `--extra` on a scenario | 19/1, 5/1 — "nearly a pass" | unknown flag **silently ignored**; the checks SKIPped |
| 5 | `readRenderTargetPixels`, wrong array type | zeros → "nothing is drawn" | nothing had been *read* |
| 6 | `root.visible = false` as an ablation | "no difference", three A/B pairs | children parented elsewhere; a slab over **92% of the aperture** survived all three |
| 7 | `esc1b-the-way-out` | confident "no difference" | **both arms were a close-up of plaster** |
| 8 | `--pick` on an `InstancedMesh` | MISS → "never submitted" | submitted and **backface-culled**; the probe cannot see instances at all |
| 9 | `compositionReadout` with `aspect` NaN | a plausible `floor 0.0% … out 100.0%` | every ray's horizontal component collapsed |
| 10 | `performance.memory` | "0 GC events" | a frozen counter, nine sessions |
| 11 | `Engine.perf()` `frameMaxMs` | a max, i.e. coverage | a **120-sample ring = 2 s**; a 5 s freeze is overwritten |
| 12 | `lint-glsl` pass 1 | "glsl literals clean" — **on the file that had just taken the build down** | scanned only `/* glsl */` literals, and only `.js` |
| 13 | `onBeforeCompile` string replace | no error, result "a bit darker" | matched nothing; `#include`s unresolved |
| 14 | the round-reset audit | green | **its wreck step never dressed the body — John's skates survived** |
| 15 | every `gadget.oil` capture | scored **50** | a picture of an empty floor; the trigger primes at 0.5 s, capture at 0.20 s |
| 16 | `TextureLoader` unawaited | a solid navy rectangle | reads as a **design choice**, not a failure |

That is 16 incidents of one mechanism. Now your four candidates, scored honestly against the same
record:

- **Metrics that move with the harness** — real, **7 incidents**, and it is a *sub-case* of the
  above (the instrument is inside the system it measures): `_liveLoop`'s dynamic resolution making
  the same-config floor **0.7% alone and 43–49% under another agent's GPU load**
  (`capture-determinism.md` §7); `perf-spaces` calling `study_w` the worst space **in 4 of 6 runs
  purely for being first in `PLACES`**; `_audio1-wiring`'s **11.7× under-read** because
  `views/game.js` re-drove the state on every frame of the offline render; `collapse-1`'s C5 policy
  widening by `k / totalBlows` — *"a policy parameterised by the budget measures the budget"* —
  reporting **random beating skill 12×**; `renderer.info` accumulating into a fake linear leak
  (7370 calls against a 625 budget); HMR reloads crossing private ports; `grade.mjs` across tiers.
- **Probes that assert on their own setup** — real, and it is the same set as above (#1, and
  `collapse-1`'s policy, and `_audio1-wiring`).
- **Tests written to confirm a defect** — real but **rare: 2**. `_pf1-diag.mjs` inverting to 2
  failures on a good tree, and `_th1-section` asserting on a typed arm name (`5px-cap6`) that had
  drifted from a shipped `SEC_FLOOR` of `[6, 10]`. Both were *correctly* handled once found (a
  header, and rebuilding the arm list from the imported constant). This is your smallest class.
- **Sample size** — real, **2–3**, and 🚨 **the diagnosis is subtly wrong.** The parity case was not
  underpowered, it was **fitted**: three stalls, all on mirrored `.b` faces, a mechanism invented to
  explain them, and *the originally filed instance was itself an `.a` face the mirror never touches*.
  The full population — **1750 pairs, 6 on `.a`, 10 on `.b`** — was one run away the whole time.
  Same shape in `debris-floor` reading 0.69 rad then 0.11 rad **on the same build**. The lesson is
  not "use bigger n"; it is **"if a population instrument exists, an anecdote is not evidence."**

### 1.2 The counter already exists, it is three days old, and it has not failed once

Grep the two files. `docs/handoff/instruments.md` is **454 lines of instrument case studies** — the
project's whole catalogue of lying tools — and it contains **zero occurrences of "reintroduc"**.
The `HANDOFF.md` core carries **13** occurrences of reintroduction / built-in ablation / "fails
itself" / positive control, and **every one of them is from 2026-08-09 or -10 work.**

Instruments now carrying a control that must fail:

| instrument | the control |
|---|---|
| `mechanics.mjs` slow-frame | verified FAILING with the bug, PASSING with the fix |
| `mechanics.mjs` round reset (12th) | validated by reintroducing **five separate bugs** |
| `dig-band.mjs` **B2c** | drives both arms and **fails itself** if the old table does not go blind — **on every run** |
| `_progkey1-independence` | `unpinDithers` reintroduces the floor defect **in the same page, every run** |
| `aim-mark.mjs` **A2** | forcing the footprint to a 0.12 m dot takes it red on every run |
| `aim-step.mjs` **S4** | `setStepGuard(false)` must produce dropped barrier boxes (it produces 4) |
| `_collapse2-fall.mjs` | fails if putting the old terminal velocities back reads the same |
| the crazing tell | ablate `span` and crazing must go **219 → 0**, checked every run |
| the `MACRO` passability gate | **FAILS at `MACRO` 2, PASSES at 1** |
| `_st1-remain` neighbour check | a positive control that really breaks the neighbour, **51.7–57.2% against a 1.0% bar** |
| `lint-glsl` pass 2 | validated by putting a backtick back in `strobe.mjs` |

**Eleven instruments with a falsification control; zero recorded failures. ~16 without one;
essentially all of them lied at least once.**

⚠️ **The honest caveat, and it matters: all eleven are three days old.** They have had far less
time to be caught. This is survivorship, and the correct claim is not "reintroduction makes an
instrument true" — it is **"of the sixteen instruments that lied, a reintroduction arm would have
caught at least twelve of them on their first run"** (#1–#3, #5–#8, #11–#14, #16 — each has a state
in which the check must go red and did not). That is a strong enough claim to act on.

### 1.3 The one class reintroduction does *not* fix, and it is the one you asked about

You said *"with some of our **critic** agents."* Reintroduction fixes instruments that do not work.
It does nothing for **an instrument that works perfectly and measures the wrong quantity**, and that
is the critic-shaped failure. Five in the record:

- 🚨 **The blind A/B attribution flaw**, and it is the most expensive measurement error here.
  `critic-locomotion-4`'s #1 and #2 both describe **plant-OFF, the variant we do not ship**
  (`docs/sealed/loco-ab4-key.md`: −0.7 mm planted vs **+143.8 mm, both feet clear**). Round 5
  changed neither, correctly. `critic-locomotion-5` then **scored the piece DOWN 61 → 57 citing that
  same non-existent defect as untouched.** Two rounds of a scoring loop running on a phantom, and a
  recorded regression that describes nothing.
- **`house-packing.md`'s diggable-% headline ranks the two worst houses highest.** Seed 4 at
  **100.0%** and seed 5 at **99.5%** are, by `critic-corridor-1`'s eye and by plan depth, the two
  worst plans in the ten. The metric is real and it is not a quality score.
- **The flat-plan failure was invisible to every metric anyone had** — §7.1 says so itself, and
  `critic-corridor-1` then found one (plan depth) and showed the true rate is **42.4%, not 20%**,
  with the authored mansion as the control at depth 3.
- **A mean over a rect for a line feature.** The same crazing reads as **7.24% of pixels past 2 luma,
  worst 73.7** and as **0.7% of the rect's mean** — the second would have been filed as "technically
  present, probably invisible."
- **The dig band as a gate.** It measured a 47–67 s regime; at the ×8 base the same instrument reads
  **2.4–6.4 s medians, 9.4×–25.3× under the retired target.** Correctly demoted to REPORT.

**These are not sloppiness. They are the cost of choosing a number before knowing what decision it
will make.** There is no cheap universal gate for it. The only counter in the record that worked is
the one `critic-corridor-1` used: **state the criteria first so they are falsifiable** (*"what makes
a plan good, stated first so the list is falsifiable"*, §5) and **take a control the detector must
not condemn** (the authored mansion). That is a habit, not a gate, and it belongs in the critic
skill rather than in a new document.

---

## 2. 🎯 How much work was genuinely invalidated, and was it avoidable?

### 2.1 The tally, both directions

**Genuinely wasted, defensible from the record:**

| what | cost | avoidable? |
|---|---|---|
| 5 agents killed by usage limits | **~1.25M spent, ≈600–700k unrecoverable** (audit's own figure) | 🚨 **Yes, entirely.** *"Every death was a scheduling error of mine."* |
| Successor agents re-deriving dead agents' state | `unblock-1` 203k + `pace-2` (untabulated) — the audit share is unknowable | Mostly yes — see §2.2 |
| The ballroom "mirror void" | **two rounds of probe work aimed at an invisible object** (the plate was off-screen at x 2.37) | Yes — one occlusion check |
| `critic-locomotion-4/5` | two rounds and one score regression on a phantom defect | Yes — attribute defects to a named variant |
| The ring-buffer clean-floor theory | **three agents briefed on it; measured 437 vs 437** | Partly — see below |

**Productive dead ends — these are the system working, and it is important you do not count them:**

- `digband-1`, 199k, retuned zero numbers. The audit is right: *"do not treat a null result as a
  wasted agent."* It stopped a round of speculative tuning and overturned two premises.
- `jitter-1` refuting the grain. The grain hypothesis was cheap to hold and ruinous to keep — it was
  poisoning **every scenario pixel A/B on the project**. One agent, 269k, and the floor went
  43–49% → **0.00%**. Enormous positive return.
- `visible-1` overturning `digparity-1`'s "worst-case aiming model" and finding the real figure is
  **worse** than the arithmetic one. That is a later round measuring properly. Exactly as intended.
- `collapse-1` refuting `disconnection.md` §2, then **John refuting `collapse-1` in play**
  (*"it should not collapse the entire wall from just hitting the bottom once"*). The second one is
  unavoidable by construction — no measurement tells you a rule is *too eager*; you have to build it
  and hand it to him.
- `critic-corridor-1` correcting `house-packing.md`'s own headline baseline by **2×** (24.2 m on 5
  edges → 47.7 m on 7) **on the same day the doc was written**. 175k, the cheapest agent on the board.

### 2.2 The two findings inside the waste that are worth more than the tally

🎯 **Two of the five dead agents' work was complete and correct. Only the report was missing.**
`cam-1` — *"its code was complete and correct; a successor found two changes written only as
comments."* `thickness-1` / `pace-1` — `pace-2` audited both and *"**no `src/` behaviour was changed
at all** — `pace-1`'s and `thickness-1`'s code was already complete."* So the thing that died was
never the work; it was **the narration of the work.**

⚠️ And note: the audit still records `thickness-1` as *"⚠️ unknown — edits on disk, no report, still
unverified"*, which `pace-2` closed. **The cost audit is itself already stale on one of its five
rows** — a small live instance of §5.2's pattern.

🎯 **What survived a death survived because it was written into an instrument's header.**
This is the cleanest natural experiment in the whole record:

| agent | where its finding lived | recovered |
|---|---|---|
| `passfail-1` | **`_pf1-diag2.mjs`'s own header** | ✅ *"read back out of its scenario header"* |
| `debris-1` | only in its transcript | ⚠️ partly |
| `dark-1` | nowhere | ❌ **nothing** |

Three agents, three storage locations, three outcomes in exact rank order.

### 2.3 The ring-buffer case, judged fairly

This is the one that best fits your *"a breakthrough makes earlier agents feel like a waste"*, so it
deserves care. Three agents were briefed on a diagnosis (*"resting pieces fill the pool and get
recycled"*) that measured **437 vs 437 — worth nothing.**

But `collapse-1` reports: *"`debris.js` and `views/game.js` **untouched** — the payout
`debris-1..4` built was already right."* **The diagnosis was worthless; the architecture those
agents built on top of it was kept and is shipping.** The persistent-pile design does not depend on
why the floor was clean — it is right either way, and `teardown-reference.md` independently confirms
it as *"the single largest gap"*.

Same shape for `disconnection.md`: §2 is refuted with a number (**7 cells ever severed over 220
blows × 3 seeds, largest component 4**), and **§3–§6 survive, with §6 being what `views/game.js`'s
payout obeys today.** One section of six.

**So the honest answer to "how much was invalidated": the *reasoning* is invalidated far more often
than the *work*.** In three of the four biggest cases — the ring buffer, `disconnection.md`, the
parity flip — the code survived the theory. What actually gets thrown away is documents and
paragraphs, which is why the waste *feels* larger than the token tally supports.

### 2.4 The number

**≈700–800k of defensible avoidable waste, or 11–13% of 6.2M** — and **the largest single line is
scheduling deaths, which have nothing whatever to do with measurement quality.** Wrong diagnoses,
the thing that feels like the waste, are mostly absorbed inside the agent that receives them
(§5.1). ⚠️ I cannot put a number on the fraction of the three ring-buffer agents spent on the wrong
theory; the residue does not contain it, and I will not invent one.

---

## 3. "Finding blocks all the time" — which class dominates?

Four classes, and they rank differently depending on what you measure. That is why it feels
constant: **you are being blocked by a different thing each time.**

| class | frequency | token cost | blast radius | cost to remove |
|---|---|---|---|---|
| **Dead agents** | 6 (5 in one **14-minute window**, 18:05–18:19) | 🚨 **~700k, the largest** | the agent | 🎯 **zero — it is scheduling** |
| **Shared-resource outages** | **8 GLSL/parse incidents in a week**; *"five times in three days, five files, five agents"* | unmeasured | 🚨 **every agent at once** | mostly already paid |
| **Wrong diagnoses** | **most frequent** — 7 named | usually absorbed by the receiving agent | one slice | not removable, and see §5 |
| **Red gates** | 5 named | reading time, plus one multi-round delay | one agent | small |
| **File ownership** | many | 🎯 **no recorded stall** | none | n/a |

**By cost, dead agents dominate, and they are the cheapest thing on the board to remove.** The audit
already says so and the recommendation was already written. It is worth restating why it is cheap:
it requires no engineering, no new document and no behaviour change from any agent. Your own memory
records that you OK'd 5+ concurrent agents — **the constraint is not concurrency, it is the reset
boundary.** Five agents died in fourteen minutes; that is one clock, not five decisions.

**By blast radius, the shared-resource class is worst, and one gap is still open.** A single agent's
save takes down `dist/` for everyone (`breakmask.js` is load-bearing for `game.play`, so it kills
the dev server too) — that cost `sledge-2` *"a whole slice unable to run one scenario or
screenshot"* and left `boot-1` able to measure nothing. HMR crosses private ports. 🚨 **And
`shoot.mjs` still has no `@vite/client` stub — caught in the act on 2026-08-09, one of
`localise-1`'s frames coming back with 99.1% of pixels different, timestamps pinning it to
`seethrough-1` saving `wall.js` at 20:55:01.9. Every critic capture in this project goes through
`shoot.mjs`.** `playtest.mjs` already has the fix. This is the single cheapest unfixed blocker in
the record.

**File ownership is a non-problem and should stop being managed as one.** Every recorded contention
was handled in flight and correctly: `critic-corridor-1` took a snapshot of a file being edited
under it and patched only its own copy; `toggle-audit-1` *"correctly refused to patch blind under a
live diff"*; `seethrough-1` fixed a bug in a file `unblock-1` did not own by moving the fix down
into the panel. 🎯 **The real cost is the opposite of contention: files nobody owns.**
`exterior.dress.mortar` in `src/game/exterior.js` has a fully-diagnosed defect covering two
apertures and *"Owner: unassigned"*; queued item 4's fix lands in `room.js`, marked *"(unowned)"*.
An unowned file is a permanent blocker; a contended one is a five-minute message.

---

## 4. 🎯 "Slow going." Testing the audit's claim — it is yours, and it does not survive

### 4.1 The uncertainty claim, re-measured on its own table

> *"Cost tracks UNCERTAINTY IN THE BRIEF… 270–300k when I could name the target, 390–460k when it
> had to find it. Same models, same project, ~60% more spend."*

**The claim rests on n = 2 against n = 3**, filed three days after `digparity-1` demolished an n=3
diagnosis and one section after the audit's own advice to sharpen questions. It is the same error
in a document written to prevent it.

Widened honestly — every agent that had to **locate** a cause before it could act, which by the
record's own accounts adds `jitter-1` (nobody knew it was dynamic resolution), `aperture-1` (the
brief's instancing premise was wrong), `digparity-1` (*"both filed diagnoses were wrong"*) and
`critic-corridor-1` (*"review our plans"*, maximally open):

| classification | mean | n |
|---|---:|---:|
| the audit's own "find it" | 426k | **2** |
| the audit's own "named target" | 288k | **3** |
| **every agent that had to locate a cause** | **321k** | **6** |
| **everything else** | **250k** | **12** |
| read-only agents (no `src/` write) | **215k** | 6 |
| `src/`-writing agents | **303k** | 12 |

**The effect is real and it is ~1.28×, not 1.6×.** And the audit's *own point 2* — read-only agents
are cheaper — is the **larger** effect (**1.41×**) on **twice the sample**, and it is buried below
the headline. The headline is the self-serving half: "my briefs were vague" is a more flattering
diagnosis than "I asked one agent to do four things."

### 4.2 🚨 The real driver, and nobody has looked at it

Least-squares on all 18 rows of the audit's own table, tokens against tool calls:

```
tokens ≈ 190k + 0.75k × tool_calls          r² = 0.62   (n = 18)
tokens ≈ 176k + 0.90k × tool_calls          r² = 0.37   (n = 17, calls-1 removed)
```

**There is a ~180k fixed cost to being an agent on this project.** The independent confirmation is
that tokens-per-tool-call is almost perfectly *inverse*-ordered with tool count — the signature of a
large constant being amortised:

| agent | tools | tokens/tool |
|---|---:|---:|
| `critic-corridor-1` | 33 | **5,303** |
| `digband-1` | 54 | 3,685 |
| `jitter-1` | 77 | 3,494 |
| `unblock-1` | 91 | 2,231 |
| `seethrough-1` | 218 | 1,509 |
| `calls-1` | 381 | **1,215** |

**23 agents × ~180k ≈ 4.1M of the 6.2M spent — about two-thirds of the campaign — is paid before
any agent takes a useful action.**

Where does it go? Measured, not guessed. `HANDOFF.md` is **95,398 bytes**; my own read of lines
1–576 came back at **40,387 tokens for 53,440 bytes**, which puts the whole file at **≈72,000
tokens** — the text is roughly 3× denser than prose, because of the emoji, the ALL-CAPS, the
backticked identifiers and the decimals. **Line 1 says: *"This is the only document a new session
must read in full."*** Add one appendix (`docs/handoff/` is 442 KB across nine files, mean 49 KB),
the campaign doc (77 KB), the slice brief and the skill, and ~180k is not surprising — it is
arithmetic.

🎯 **And the diet is being undone in real time.** `HANDOFF.md` was cut from 365 KB on 2026-08-07
specifically because *"every agent was told to read it first."* Three days later the core carries
**38 date-stamped 08-09/08-10 entries** and `collapse-2` alone is credited **12 times** in it. Every
good round makes the next round more expensive. That is the actual mechanism of "slow going": the
project is paying compound interest on its own success, and the interest rate is set by how much
prose each win adds to the boot document.

⚠️ **What I cannot know:** whether the audit's per-agent figures are cumulative input across turns
or a single-pass count, and how much of the fixed cost prompt caching already absorbs. If they are
cumulative — which the tool-count correlation strongly implies — the boot document is not read once
for 72k, it is **resident for ~90 turns**, and the leverage on trimming it is larger than my
estimate, not smaller.

---

## 5. 🚨 Judging the coordinator

### 5.1 "Did stating a hypothesis in a brief make agents confirm it?" — No. Six for six against.

Every briefed hypothesis in the record was **refuted by the agent that received it**:

| stated in the brief / in HANDOFF | who received it | what they returned |
|---|---|---|
| the draw-call overrun is the ballroom (**named in three places**) | `calls-1` | the ballroom is **20 calls**; six gadgets were **555 of 689** |
| the black apertures are the instancing path | `aperture-1` | `?walls=legacy` shows the identical hole; it was `rotY` encoding an **axis, not a facing** |
| the parity flip, *"forwarded as strong evidence"*, n=3 | `digparity-1` | **6 on `.a`, 10 on `.b`** over 1750 pairs; the filed instance is an `.a` face |
| the capture jitter is the grain | `jitter-1` | grain measures **0.74%**; it is `_liveLoop`'s dynamic resolution |
| the clean floor is the ring buffer | `debris-floor` | **437 vs 437** |
| `disconnection.md` §2's flood fill | `collapse-1` | **7 cells ever severed** in 220 blows |

**Zero recorded confirmations of a wrong coordinator hypothesis.**

🚨 **But that record is written by the winners, and it is structurally incapable of containing the
failure you are worried about.** A refutation is a headline; a quiet confirmation of a wrong premise
produces no write-up, because there is nothing to write. **I cannot tell you it did not happen. I
can tell you the residue contains six refutations and no confirmations, and that this is exactly
what the residue would look like in both worlds.**

What I *can* attribute is the mechanism. The refutations are not luck — the coordinator puts a line
in **every** brief: *"if a stated fact is wrong, say so rather than diverging silently"* and
*"assume any unsourced number is wrong until you re-measure it."* HANDOFF's own assessment — *"both
keep paying — a dozen doc errors were overturned by measurement this campaign"* — is supported by
everything in the table above. **That line is the highest-return sentence in this project's process
and it costs nothing.** One slice brief I read (`task-chunks-thickness.md`) goes further and is the
model: it names the open question as a forced **disjunction** — *"Do not assume that is a rendering
bug. Determine which it is and say so: (a) the scenario is at fault… (b) the barrier genuinely is
not rendering"* — which makes confirmation structurally unavailable.

### 5.2 Where hypotheses *do* stick: documents, not agents

Agents measure. **Documents just repeat**, and that is where every propagated error in this record
lives:

- HANDOFF named the ballroom **in three separate places** before anyone measured it.
- `disconnection.md` §2 survived from design doc → brief → a second design doc, and died only when
  `collapse-1` counted the cells. HANDOFF now tells agents *"read `src/destruction/support.js`'s
  header instead"* — **a document you must be warned about is worse than no document.**
- The AO *"2× over budget"* figure was **the pre-fix number**, carried into the campaign's own
  framing four days after `perf-ao` landed, until `board-audit-2` caught it.
- `house-packing.md` §1 was stale by **2×** on the day it was written, and **§9.2 of the same
  document already had the correct figure.** A document contradicting itself within nine sections.
- `wall.js` shipped a comment describing a contact shadow that round 5 had **deleted by name**.
- `views/game.js:169` says in capitals *"THE LIGHT COUNT IS FIXED FOR THE WHOLE MANSION AND MUST
  NEVER CHANGE"* — true of the room rig, false of the game, *"a stale comment that is why nobody
  looked."*
- The cost audit is stale on `thickness-1` (§2.2).

**The failure mode is not that your guesses infect agents. It is that your guesses become prose,
prose becomes the boot document, and the boot document is the one thing nobody re-measures.**

### 5.3 "Was I paying 60% more to have my own guesses disproved?"

**No, on three counts.**

1. **The 60% is not there.** It is 28% on an honest classification (§4.1), and it is smaller than
   the read-only/writer effect the same audit under-weights.
2. **The disproof was free.** It came out of the same agent, in the same run, as the fix. `calls-1`
   did not spend a round disproving the ballroom and then a second round finding the gadgets — it
   did both, plus built the attribution instrument, plus measured the never-measured fully-dug
   worst case, plus discovered its own flip-A/B was blind and redid the method. **The chargeable
   thing in that brief was never the wrong hypothesis. It was four deliverables in one agent.**
   That is what 381 tool calls and 463k buys.
3. **The counterfactual is not a cheaper agent, it is a wasted round.** The alternative to `calls-1`
   refuting the ballroom is a builder optimising a room that is 20 of 689 calls. You have a measured
   price for that outcome: the ballroom mirror, *"two rounds of probe work aimed at an invisible
   object."*

🎯 **The real cost of a hypothesis in a brief is SCOPE, not bias.** "It's the ballroom" converts one
deliverable (*find and fix the overrun*) into three (*disprove the ballroom, then find the cause,
then fix it*). The audit half-notices this in its own footnote — `progkey-1` did diagnose-and-fix
for 295k **because the diagnosis was already in hand from `boot-1`**. So keep stating hypotheses;
they are how you transfer what you know. **Add one clause: say which deliverable dies if the
hypothesis is wrong.**

### 5.4 What is genuinely chargeable to you

- 🚨 **100% of the ~700k death loss.** Your own words, and the record supports them: five agents in
  one fourteen-minute window is a clock you did not look at.
- 🚨 **The boot document.** You paid for a diet on 2026-08-07 and let the file re-grow to 95 KB in
  three days. This is now the largest cost line in the campaign (§4.2) and it is the one nobody has
  costed, including the cost audit.
- ⚠️ **Forwarding n=3 as strong evidence when a 1750-pair instrument was one run away** — and then
  writing an audit whose headline claim also rests on n=2 vs n=3. The symmetry is the point: you
  are not careless with samples, you are careless with samples **when the sample already agrees with
  you**.
- ✅ **Not chargeable:** the wrong diagnoses themselves. Six for six, they were caught by the agent
  you handed them to, because of a sentence you put in every brief.

---

## 6. What should change on Monday — five, ranked

Ranked by *expected saving ÷ cost to adopt*. Nothing here is a new document, a new gate to run, or a
new role. Three of the five are things this project already does and does not yet do by default.

### 1. 🎯 Every new assertion ships with a control that must fail — on every run, not once

**The evidence:** 454 lines of instrument case studies, zero mentions of reintroduction; eleven
instruments built in the last three days that carry one, zero failures among them; twelve of the
sixteen lying instruments would have gone red on their first run (§1.2).
**The cost:** one clause in the brief — *"the check must go red when X is put back, and that arm
runs every time."* You already write this for some slices. Make it the default and stop writing it.
**It covers three of your four candidate patterns at once**, and it is the only recommendation here
that would have caught the reset check passing while John's skates survived.

### 2. 🎯 Cap the boot document, and change what is allowed into it

**The evidence:** ~180k fixed cost per agent, ≈4.1M of 6.2M; `HANDOFF.md` ≈72k tokens with a line-1
instruction to read it in full; 38 new dated entries in three days after a diet you already paid for.
**The rule, and it costs nothing:** a finding enters `HANDOFF.md` as **(a)** one line of what
changed, **(b)** the number, **(c)** the instrument that proves it. **The argument lives in the
instrument's header** — where the agent who needs it will read it anyway, where it is next to the
code it constrains, and where it survives the agent's death (§2.2). Everything else goes to an
appendix or the archive. Target: **core under 30 KB**, checked weekly, by `wc -c`.
⚠️ This is the single highest-leverage change here and it is the one most likely to be skipped,
because it asks you to delete your own good writing. The prose is excellent. It is also the tax.

### 3. Write the finding into the instrument's header the moment you have it

**The evidence is a clean three-way natural experiment** (§2.2): `passfail-1`'s answer survived a
kill because it was in `_pf1-diag2.mjs`'s header; `debris-1`'s survived only in a transcript;
`dark-1`'s survived nowhere. **Cost: zero** — it is a re-ordering, not extra work. It makes a killed
agent a delay rather than a loss, and combined with #2 it means the write-up *is* the header, so the
handoff paragraph gets written once instead of twice.

### 4. Name the instrument in the brief, and say whether it exists

**The evidence:** the cheapest agent in the campaign opens its report by saying it **reused** one —
*"I re-ran `harness/genspike.mjs`'s own `buildPlan`/`measure` over 512 seeds rather than re-deriving
anything"* (`critic-corridor-1`, 175k, 33 tool calls). The most expensive built three.
**This replaces the audit's lever 3** (*"sharpen the question"*), which is a self-assessment you make
before the fact and cannot check afterwards. *"Does the instrument exist?"* is a question you can
answer in one grep, before writing a word. **Rule: if it does not exist, building it IS the slice —
do not also ask for the fix in the same agent.** That is the same split the audit's lever 2 proposes,
stated in a form you can verify.

### 5. Two one-off fixes, then stop adding process

- **Put `playtest.mjs`'s `@vite/client` stub into `shoot.mjs`.** One line. It is the last shared-
  resource contamination path and **every critic capture on this project goes through it** (§3).
  Until it lands, HANDOFF's own workaround — shoot each arm twice — is a tax on every critic.
- **Do not start a slice inside the last hour before a limit reset.** 100% of the ~700k death loss,
  zero engineering, and it is about the clock, not about concurrency — your 5-agent limit is fine.

### And retire these — they are not paying for themselves

- **`docs/design/disconnection.md`.** §2 is refuted and HANDOFF instructs agents not to trust it.
  Delete §1–§2 and point to `support.js`'s header, or delete the file. A document that requires a
  warning label is a liability with a maintenance cost.
- **The `dig-band` clock as a gate** — already done; keep it reporting. It measures a regime that
  no longer exists (2.4–6.4 s against a retired 60 s target).
- 🎯 **Do not add anything to this list.** This project has slice docs, restart packs, nine handoff
  appendices, a cost audit, gates, critics, skills and now a process critique. **The machinery is
  not the problem; the machinery's reading cost is.** Recommendations 1, 3 and 4 are each one clause
  in a brief; recommendation 2 deletes more than it adds. If only one of the five gets adopted,
  make it #2 — it is the only one that makes every future agent cheaper rather than better.

---

## What I could not know, restated

- **I read testimony, not events.** Every "measured" claim here is an agent's account of its own
  competence. I weighted self-critical reports highest and unattributed superlatives lowest.
- **The confirmation question is unanswerable from the residue** (§5.1). Six refutations are on the
  record; a quiet confirmation would leave none. I cannot close it and I have not pretended to.
- **The ~180k fixed cost is a fit to 18 points**, and I do not know whether the audit's token figures
  are cumulative across turns or single-pass, or how much prompt caching already absorbs. The
  direction is not in doubt; the magnitude could be off by a third either way.
- **I could not price the three ring-buffer agents' wasted fraction**, and did not guess.
- **Eleven reintroduction-carrying instruments is three days of evidence.** They may yet lie. The
  claim I stand behind is the counterfactual one in §1.2, not "they are true".
- **I never saw a brief as sent.** I read one slice doc and inferred the rest from what agents
  reported back about their instructions — which is the weakest evidence in this critique, and it
  sits directly under the question about your briefs.
