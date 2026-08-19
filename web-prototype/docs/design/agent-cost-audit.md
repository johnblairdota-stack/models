# Agent cost audit — 2026-08-09

> ## 🚨 CORRECTED 2026-08-10, AND THE CORRECTION CAME FROM A CRITIC, NOT FROM ME
>
> `critic-process-1` (`docs/design/critique-process.md` §4) re-ran the arithmetic **on this
> document's own 18-row table** and the headline below does not survive. Three findings, in order of
> how much they should change what you do:
>
> 1. **⚠️ "What the numbers say" point 1 is wrong by half.** The uncertainty effect is **~1.28×, not
>    ~1.6×**, and the 1.6× rested on **n = 2 against n = 3**. Classified honestly — every agent that
>    had to *locate* a cause before it could act, which adds `jitter-1`, `aperture-1`, `digparity-1`
>    and `critic-corridor-1` — it is **321k over 6 against 250k over 12**. ⚠️ Filed three days after
>    `digparity-1` demolished an n=3 diagnosis; the same error, in a document written to prevent it.
> 2. **🎯 Point 2 is the LARGER effect and it is buried.** Read-only agents cost **215k (n = 6)**
>    against `src/`-writing agents' **303k (n = 12)** — **1.41× on twice the sample.**
> 3. **🚨 The real driver was never in this document.** Least squares over all 18 rows gives
>    `tokens ≈ 190k + 0.75k × tool_calls` (**r² 0.62**), i.e. **a ~180k FIXED cost to being an agent
>    on this project** — ≈**4.1M of the 6.2M spent, two thirds, paid before any useful action.**
>    Tokens-per-tool-call is almost perfectly *inverse*-ordered with tool count, which is the
>    signature of a large constant being amortised. The largest identified component is agents
>    reading this project's own documentation, and `HANDOFF.md` is the biggest single file in it.
>    **That is why lever 1 below is no longer the top lever — capping the boot document is.**
>    (Acted on 2026-08-10: `HANDOFF.md` **95,398 → 30,665 bytes**, ~40.4k → ~13k tokens.)
>
> ⚠️ **This document is also stale on one of its own five death rows:** `thickness-1` is recorded as
> *"unknown — edits on disk, no report, still unverified"*, and `pace-2` closed it — no `src/`
> behaviour was missing, only the report. Same for `pace-1`. **A cost audit that is stale on 20% of
> its rows within a day is itself an instance of §5.2's pattern: documents repeat, agents measure.**
>
> ✅ **What survives unchallenged:** the token table itself, the ~600–700k unrecoverable death loss
> and its attribution to scheduling, point 3 (tool count predicts cost), point 4 ("changed nothing"
> is a cheap good outcome), and lever 1.

Every agent reports its own token count. This is all of them from the campaign so far, measured
rather than estimated. **~6.2M tokens across 23 agents**, which is ~55% of a weekly Max-5x
allowance — so the weekly budget is **on the order of 11M tokens**, and that is a floor, since
main-thread work counts too.

## The completed 18

| agent | tokens | tools | what it returned |
|---|---:|---:|---|
| `critic-corridor-1` | **175k** | **33** | measured corridors vs flush over 512 seeds; found the flat-plan metric; corrected a 2× stale baseline |
| `critic-slice-3` | **198k** | 84 | PASS 71; named the floor, the camera occlusion, the mousehole breach |
| `digband-1` | **199k** | 54 | John's minute holds; **changed nothing**; overturned two of my premises |
| `unblock-1` | **203k** | 91 | six blockers; `mechanics` 11→12 with the first reset check |
| `genspike-1` | **206k** | 69 | proved the packing over 512 seeds in 1.8 s; found the real wiring cost |
| `fieldsound-1` | 215k | 112 | three force-field candidates, rendered and measured |
| `maptool-1` | 240k | 91 | the visual map designer + labelling |
| `jitter-1` | 269k | 77 | refuted grain; found dynamic resolution; floors 43–49% → 0.00% |
| `audio-listen-1` | 270k | 122 | made the game audible; four real bugs incl. the clank firing on success |
| `localise-1` | 272k | 82 | every room portable, byte-identical |
| `exterior-1` | 277k | 87 | the yard, 0 draw calls |
| `digcover-1` | 296k | 83 | all six rooms diggable, +6 calls |
| `progkey-1` | 295k | 106 | **boot 199.7 s → 99 s** |
| `aperture-1` | 300k | 96 | 14 panels un-holed |
| `seethrough-1` | 329k | **218** | the shipped unlock was broken; 42/42 pairs |
| `digparity-1` | 331k | 93 | softlock 16/1750 → 0; refuted two diagnoses |
| `visible-1` | 388k | 132 | dead blows 62.5% → 4.1% |
| `calls-1` | **463k** | **381** | 682 → 426 calls; it was gadgets, never the ballroom |

## The 5 that died — ~1.25M tokens

| agent | tokens | recovered? |
|---|---:|---|
| `dark-1` | 194k | ❌ **nothing** — died 6 min in |
| `passfail-1` | 198k | ✅ mostly — H1 confirmed, read back out of its scenario header |
| `debris-1` | 265k | ✅ partly — the ring-buffer finding survived in its transcript |
| `cam-1` | 281k | ✅ mostly — its code was complete and correct; a successor found two changes written only as comments |
| `thickness-1` | 309k | ✅ **CLOSED 2026-08-10 by `pace-2`** — its `SEC_FLOOR` code was already complete; **no `src/` behaviour was missing, only the report.** (This row read "⚠️ unknown, still unverified" for a day after it was closed.) |

**≈600–700k of genuinely unrecoverable spend, about 10% of the total.** Every death was a
scheduling error of mine: over-parallelising into a limit.

## 🎯 What the numbers actually say

**1. Cost tracks UNCERTAINTY IN THE BRIEF, not difficulty of the work.**
🚨 **REFUTED IN PART — see the correction at the top of this file. The effect is ~1.28×, not ~1.6×,
and this claim rested on n = 2 against n = 3.** The original text, kept because the error is the
useful part: *when I could name the target, an agent cost **270–300k**: collapse the per-panel cache
key, make rooms portable, port the study. When it had to **find** the target first, it cost
**390–460k**: find the draw-call overrun (463k, **381 tool calls**), make the last 58% visible
(388k). Same models, same project, ~60% more spend.*
⚠️ Memory records this as "slice underspecification costs ~2× tokens". **On this table it is 1.28×
over n = 6 vs n = 12, and the read-only/writer split in point 2 is bigger.**

**2. Read-only agents are the cheapest thing on the board and they are not weaker.**
🎯 **This is the LARGER effect — 215k (n = 6) against 303k (n = 12), 1.41× — and it was buried under
a headline that did not hold.** `critic-process-1`, 2026-08-10.
`critic-corridor-1` (175k) and `genspike-1` (206k) are the two cheapest agents in the campaign and
between them they **de-risked an entire phase, found a failure metric nobody had, and corrected a
published figure that was wrong by 2×.** Neither wrote a line of `src/`.

**3. Tool count predicts cost better than wall-clock.**
Median is ~90 calls. `calls-1` used **381** and cost the most; `seethrough-1` used 218 and cost
third-most. `exterior-1` ran the longest (124 min) and cost a median amount. **A brief that forces
searching is expensive; a brief that forces waiting is not.**

**4. "Changed nothing" is a cheap, good outcome.**
`digband-1` cost 199k, retuned zero numbers, and its answer — *the band holds* — stopped a round of
speculative tuning. Do not treat a null result as a wasted agent.

## The three levers, in order of value

> 🚨 **A FOURTH LEVER OUTRANKS ALL THREE, and it is the one this audit missed** (`critic-process-1`,
> 2026-08-10): **cap the boot document and change what is allowed into it.** ~180k of every agent's
> cost is fixed and ≈4.1M of 6.2M went on it. **The rule now in force: a finding enters `HANDOFF.md`
> as one line + the number + the instrument, and the argument goes in that instrument's header or a
> named appendix.** Done 2026-08-10 — 95,398 → 30,665 bytes, with a 30 KB budget checked by `wc -c`.
> Lever 3 below ("sharpen the question") is also superseded: it is a self-assessment you make before
> the fact and cannot check afterwards. The checkable form is **"does the instrument already exist?"**
> — one grep — **and if it does not, building it IS the slice.**

1. **Stop losing agents to limits.** ~10% of all spend, and it is purely my scheduling. Three
   concurrent Opus builders maximum, and never start a long slice near a reset boundary.
2. **Split "find it" from "fix it" when I cannot name the target.** A cheap read-only diagnostic
   (175–210k) followed by a targeted fix beats one 460k agent that has to do both. ⚠️ Not always —
   `progkey-1` did both for 295k because the diagnosis was already in hand from `boot-1`.
3. **Sharpen the question, not the scope.** The single best predictor of a cheap agent in this
   dataset is whether the brief could state what the answer would look like.

## Budget shape from here

~5M tokens left over 5 days ≈ **1M/day ≈ three agent slices a day**, and the expensive part of the
campaign (the generator, room dressing, the hunter) is still ahead. ⚠️ At the current rate we run
out on Wednesday.
