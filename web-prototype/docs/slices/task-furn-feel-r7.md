# Slice plan: furniture Teardown feel r7

**Status:** DECIDED — after playcritique r6 WEAK.

**Open hates:** flat chair heap; tip unread at mid-shot (ease too slow / RAF).

---

## Owns

- `docs/slices/task-furn-feel-r7.md`
- `src/destruction/furnprop.js` — tip via `update(dt)`, front-loaded ease, ~0.75 s
- `src/game/room.js` — call `fp.update(dt)` in `room.update`
- `src/destruction/furn-fx.js` — cascade pays 2 offset plates for seat/back/body
- `harness/_furn-feel-critic.mjs` — step back for heap shot; mid-tip at ~0.45 s

Stop: WOWED or PASS-no-hates.
