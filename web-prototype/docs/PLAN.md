# Plan of action — pointer

**The plan is [`docs/design/dig-campaign.md`](design/dig-campaign.md).** This file does not restate
its waves. **The facts are `HANDOFF.md`.** This file exists to carry the numbers measured on the
date below, so `PLAN.md` and `progress/status.json` cannot disagree the way they did in early
August. Previous version archived at
[`docs/archive/plan-2026-08-05.md`](archive/plan-2026-08-05.md).

## Measured 2026-08-08 (`board-audit-2`)

**Tree:** `npm run build` ✓ · `mechanics.mjs` **11/11** · `escape.mjs` on `seed=s4` **20/20** (0
skipped) — all via `playtest.mjs --script`, not run standalone. `game.play` load: ready in
77–81 s (cold shader compile; expected, not a hang).

**Board (`status.mjs list`, round 38):** **0 WOWED · 5 PASS · 30 WEAK · 2 NOT_BUILT of 37.**
`room.ballroom` **90** (r16). Matches `progress/status.json`, **not** the old `PLAN.md` (3 PASS,
ballroom 87) — that old figure was stale; trust the board.

**Draw-call baseline** (`eo2-calls.mjs`, 12 parked stations, `seed=s4`, two runs): worst station
**`service.mid` — 576 calls / 277,798 tris**, both runs identical, against the 625-call / 900k-tri
budget (49 calls of headroom). ⚠️ Below the previously recorded 580–586 — not a regression, but a
disagreement worth tracking if it recurs.

**GPU per space** (`perf-spaces.mjs --extra "quality=medium"`, two runs, worst-of-4-yaws):

| space | run 1 | run 2 |
|---|---|---|
| study_w | 1.33 ms | 1.38 ms |
| gallery | **1.60 ms** | 1.52 ms |
| study_e | 1.54 ms | 1.39 ms |
| service | 1.46 ms | **1.54 ms** |
| ballroom | 1.42 ms | 1.37 ms |
| chapel | 1.46 ms | 1.49 ms |

Budget **1.39 ms**. Measured range **1.33–1.60 ms ≈ 0.96×–1.15× budget** — 🚨 **not** the "roughly
2×" this campaign's §1 and Wave 2's `perf-ao-4` assume. See the `board-audit-2` report for the full
finding; it changes `perf-ao-4`'s scope.

**Audit (`audit.mjs --render`):** 17 stale-verdict flags (verdict recorded before a later
re-render), 0 stub/dead-view/no-view flags. Full list in the `board-audit-2` report.

**Root litter proposed for cleanup, not yet moved:** 55 stray PNGs (32 MB) + 17 debug `.mjs`
scripts at repo root. Move list in the `board-audit-2` report — awaiting John's approval.
