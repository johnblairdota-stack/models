# Slice: refresh the board with measured numbers before a campaign is planned on it

**Files you may edit — nothing else:**
- `docs/PLAN.md`
- `progress/**` (the board is written through `harness/status.mjs`, never by hand)

**Files other agents own this wave — do not touch:** `HANDOFF.md` and `docs/handoff/**` belong to
`handoff-diet-1`; `refs/**` belongs to `refs-dig-2`. **Touch no file under `src/`.** You may *run*
anything in `harness/` but may not edit it.

**You hold the GPU measurer lane (▮) for this wave. No other agent may run `perf-*` or
`eo2-calls.mjs` while you are working. Do not run two measurements at once yourself.**

Decisions here are made. If a stated fact turns out to be wrong, say so in your report rather than
diverging silently.

---

## 1. Why this matters

A campaign has just been planned (`docs/design/dig-campaign.md`) on numbers that are **two days
old and already known to disagree with each other**:

- `docs/PLAN.md` says **0 WOWED · 3 PASS · 2 NOT_BUILT** and `room.ballroom` **87**.
- `progress/status.json` — written *later*, 2026-08-05 04:22 — says **0 WOWED · 5 PASS** and
  `room.ballroom` **90**.

This project has been bitten by exactly this before: a stale figure in `HANDOFF.md` claimed
"614–617 of 625 draw calls, about eight spare" when the true number was **625 and 627 — already
failing on one run in two.** The note in `dig.md` §4 says it plainly: *the figure was stale, and
stale in the dangerous direction.*

**Every gate in the new campaign is a comparison against a baseline.** If the baseline is fiction,
so is every gate.

## 2. What to do

### 2a. Prove the tree is green

```bash
npm run build
node harness/mechanics.mjs
node harness/playtest.mjs --view game.play --script harness/scenarios/escape.mjs --port 5194 --q "seed=s4"
```

Expected: build passes the GLSL lint then vite; `mechanics.mjs` **11/11**; escape **20 passed**.

🚨 **`harness/scenarios/*.mjs` ARE NOT STANDALONE SCRIPTS. They are scenario modules that export a
default function, and `playtest.mjs` drives them.** Verified 2026-08-07: running
`node harness/scenarios/escape.mjs` directly **prints nothing and exits 0** — it looks exactly like
a clean pass. This is the lying-instrument pattern the project has hit repeatedly; do not let it
happen to a number you are about to publish. **Every scenario in this slice goes through
`playtest.mjs --script`.**

⚠️ **Seed matters.** On `seed=rrr-test-1` the suite reports **19 passed · 1 skipped**, and the skip
is real: *"this seed's site has no neighbouring room in its escape box — try seed=s4 (the chapel
vestry)."* **A SKIP IS NOT A PASS** — the harness says so itself. Use `seed=s4` to get the recorded
20, and if you report anything less than 20, say which assertion skipped and why.

⚠️ **`npm run build`, never `npx vite build`** — the npm script lints GLSL literals first, and
skipping it took the build down four times in two days.

If any of these fails, **stop and report it.** A red tree is a bigger finding than anything else in
this slice, and the campaign should not spawn Wave 2 on top of it.

### 2b. Re-measure the draw-call baseline ▮

```bash
node harness/scenarios/eo2-calls.mjs
```

Twelve parked stations, seed s4. The recorded post-`instancing-1` figure is **580–586 at the worst
station** against a 625 ceiling. Record what you actually get. **Run it twice** — the historical
failure was a number that was true on one run and false on the next.

### 2c. Establish the honest GPU baseline ▮

`docs/design/dig-campaign.md` asserts "every space is roughly 2× over the 1.39 ms budget", inherited
from a note that was never isolated by measurement. **`perf-ao-4` in Wave 2 will be spawned to
diagnose it, so it needs a real starting number, not a rumour.**

```bash
node harness/perf-spaces.mjs
```

⚠️ **Pin the quality** — measurements at different quality levels are not comparable. Follow the
existing convention in the script and in `rrr-pipeline`: `quality=medium`, and cover a full
animation cycle rather than a snapshot. **Time the GPU, not the CPU.**

Record per space. If the "2×" claim is wrong, that is a finding and it changes Wave 2's scope —
say so loudly.

### 2d. Audit the board

```bash
node harness/status.mjs list
node harness/audit.mjs --render
```

`audit.mjs` mechanically catches stub views, verdicts with no screenshot behind them, `WOWED` set by
a non-critic, dead views, and stale verdicts. **Report every flag it raises. Fix none of them** —
they belong to the pieces' owners, and the art is frozen this campaign.

### 2e. Rewrite `docs/PLAN.md`

Replace it with a short pointer document, not a second plan:

- **What it must say:** the current ordering is `docs/design/dig-campaign.md`; `HANDOFF.md` is the
  facts; here are today's measured numbers (board line, tree state, draw calls, GPU per space).
- **What it must not do:** restate the campaign's waves. Two documents describing the same plan is
  how `PLAN.md` and `status.json` came to disagree in the first place.
- **Archive the current one** to `docs/archive/plan-2026-08-05.md` first. ⚠️ **There is no git.
  Move, never overwrite.**

### 2f. Propose the root-litter cleanup — **propose only**

The repo root contains **55 stray PNGs totalling 32 MB** (all named
`UsersJohnAppDataLocalTemp*.png` — the signature of an unquoted Windows path in a `sheet.mjs` or
`shoot.mjs` call) and **17 debug scripts** (`_t.mjs` … `_t7.mjs`, `_estate_dbg*.mjs`,
`diag_tmp.mjs`, `measure_tmp.mjs`, and similar).

Write the proposed archive-move as a **list in your report** — source → destination, nothing else.
🚨 **Do not move or delete anything.** There is no git in this project; a wrong move is
unrecoverable, and John approves this one himself.

## 3. The bar

**A new agent reads `docs/PLAN.md` and `progress/status.json` and finds no contradiction between
them, and no number that cannot be traced to a command run today.**

## 4. Presentation

`docs/PLAN.md` should fit on one screen. Its job now is to point, and to carry today's measured
numbers. Everything narrative belongs in the campaign doc or the HANDOFF appendices.

## 5. Traps

- ⚠️ **Do not write `progress/status.json` by hand.** It is written atomically through
  `harness/status.mjs` because a dozen agents touch it. A hand edit races.
- ⚠️ **Do not change any piece's verdict or score.** You are not a critic; this slice measures the
  tree and the counters, it does not judge pieces. If `audit.mjs` says a verdict is stale, **report
  it** — re-scoring is a critic's job and the art is frozen.
- ⚠️ **Captures taken before 2026-08-05 are not reproducible** — two identical runs differed in
  10.1% of bytes on `mat.lath` and 83.1% on `room.ballroom` (`docs/capture-determinism.md`). **Do
  not re-take them wholesale**; that is expensive and pointless. Re-take only if a Wave 2+ slice is
  about to diff against one, and list the affected pieces in your report so the orchestrator can
  schedule it.
- ⚠️ **One measurement at a time.** You hold ▮ this wave; running `eo2-calls` and `perf-spaces`
  concurrently corrupts both.
- ⚠️ **`harness/serve.mjs` exists for a reason** — neither `npm run dev` nor `vite preview` is used
  for measurement (port collision with `shoot.mjs`, HMR reloads killing bakes). Follow whatever the
  scenario scripts do; do not substitute your own server.

## 6. Verify

```bash
node harness/status.mjs list
node harness/audit.mjs --render
npm run build
```

⚠️ Re-read §2a's warning before you report any scenario result: **a scenario run directly prints
nothing and exits 0.** If a suite gives you no output, you ran it wrong — you did not get a pass.

**What to look at:** put the numbers you measured beside the numbers in `docs/design/dig-campaign.md`
§7 (the honest metric table's baseline row) and beside the old `PLAN.md`. **Every disagreement is a
finding**, and the disagreements are the most valuable output of this slice.

## 7. Regression gate

You are editing prose and reading counters, so the code gate is simply that the tree is as green
after you as before: `npm run build`, `mechanics.mjs` 11/11, `escape.mjs` 20/20. If any of those
was *already* failing when you arrived, say so explicitly — do not fix it silently, and do not
let it look like you broke it.

## 8. Report back

1. The tree result (build / mechanics / escape).
2. **The measured baseline table**: worst-station draw calls (two runs), GPU ms per space at pinned
   quality, current board line.
3. Every disagreement found between `PLAN.md`, `status.json`, `HANDOFF.md` and the campaign doc.
4. Every flag `audit.mjs --render` raised, unfixed.
5. The proposed root-litter move list, unexecuted.
6. The list of pieces whose captures predate 2026-08-05 and would need re-taking *if* diffed.

Then leave the trail:
```bash
node harness/status.mjs note "board-audit-2: tree <state>, worst station <n> calls, GPU <x>-<y> ms, PLAN.md repointed at dig-campaign"
```

**Set no verdicts.**
