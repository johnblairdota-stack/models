# Slice plan: furniture Teardown feel r8

**Status:** DECIDED — after playcritique r7 WEAK (tip only).

**Open hate:** tip-over unread — local X tip was off-axis / wrong fall direction.

---

## Owns

- `docs/slices/task-furn-feel-r8.md`
- `src/destruction/furnprop.js` — world-axis tip toward hit/player; quat slerp
- `harness/_furn-feel-critic.mjs` — park ~1.35 m; mid-tip at 0.4 s; ensure tip in frame

Defer camera `onBreak` FX until tip ≥55% so dust/chunk does not hide the fall.

Stop: WOWED or PASS-no-hates.
