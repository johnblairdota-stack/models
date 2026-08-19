# Slice plan: furniture Teardown feel r9

**Status:** DECIDED — after playcritique r8 WEAK (tip unread).

**Fix:** tip reaches ~90° by 0.35 s, **holds visible** until 1.1 s, then FX+hide.
Brighten tally LED while tipping. Critic parks on mesh world pos, asserts ballroom.

---

## Owns

- `docs/slices/task-furn-feel-r9.md`
- `src/destruction/furnprop.js` — tip/hold phases; tally flash
- `harness/_furn-feel-critic.mjs` — park assert + mid-tip at 0.45 s

Stop: WOWED or PASS-no-hates.
