# Slice plan: furniture Teardown feel r6

**Status:** DECIDED — execute after playcritique r5 WEAK.

**Verified r5:** desk first-hit; wall cam 2-hit shatter; tip/heap still fail the eye.

**Open hates:** flat foot-scatter heap; tip silhouette unread.

---

## Owns

- `docs/slices/task-furn-feel-r6.md` (this file)
- `src/destruction/debris.js` — big-chunk open-floor prop lean (stand plates)
- `src/destruction/furn-fx.js` — larger seat/back plates; near-zero crumbs on part break
- `src/destruction/furnprop.js` — tip toward camera, longer, less sink; FX already light for cams
- `harness/evidence/_furn-feel-critic.mjs` — mid-tip shot ~400 ms after tripod shatter

---

## Changes

1. **Heap:** On settle, if `p.big[i]`, add extra prop lean ±(0.7–1.6) on rx or rz and lift `py` by half standing height. Enlarge seat/back PART_CHUNK ~25%. Part-break crumb scale ≤0.08.
2. **Tip:** Tip 1200 ms, rotate mostly about X (~1.4 rad) so body falls into frame; sink Y only 0.35; hide at end.
3. **Critic:** After tripod shatter connect, wait 400 ms, `r6-09-mid-tip` shot, then settle.

Stop: WOWED or PASS-no-hates.
