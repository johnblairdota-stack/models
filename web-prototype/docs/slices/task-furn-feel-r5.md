# Slice plan: furniture Teardown feel r5

**Status:** DECIDED — execute after playcritique r4 WEAK.

**Bar:** Teardown feel for furniture smash in `game.play`.
Stop when playcritique files **WOWED** or **PASS with no new hates**.

**Verified r4:** desk wins first hit (`study_w.desk.0`).
**Open hates:** flat heap; wall-cam 1/4 connects; tip-over unreadable under dust.

---

## Owns

- `docs/slices/task-furn-feel-r5.md` (this file)
- `src/destruction/debris.js` — big-chunk rest lean on open floor (furniture plates)
- `src/destruction/furn-fx.js` — less crumb + camera dust; tip-friendly payout
- `src/game/furn-dress.js` — wall cam AABB thicker / taller
- `src/destruction/furnprop.js` — longer slower tip; delay hide; less immediate dust via handlers
- `harness/_furn-feel-critic.mjs` — longer settle before after-chair / after-tripod shots

**Does not own:** dig DamageField, board art WOWED.

---

## Changes (decided)

### 1. Heap lean (open floor)

In `debris.update` settle path: when `p.big[i]` and not wall-leaning, widen rest attitude
jitter to ~±0.9–1.4 rad on rx/rz (Teardown “every angle”), keep ry free. Do **not** change
wall `lean` math for dig slabs.

### 2. Wall cam connect

Wall register: `w=1.2`, `d=1.0`, `h=1.55`, `cy = mountY - 1.25` so swing arcs hit.

### 3. Tip-over readable

- Tip duration **900 ms**, tip angle **1.55 rad**, keep mesh visible until tip ends.
- Camera `onBreak` / stage: dust flash scale **0.35** of current for kind `camera`.
- Critic: swingBurst settle **700 ms** after tripod; after-chair settle **900 ms**.

---

## Verification

```bash
npm run build
node harness/playtest.mjs --view game.play --script harness/_furn-feel-critic.mjs \
  --port 5305 --q "seed=s4&furndemo=1&quality=medium"
```

LOOK at `r1-03-after-chair` (leaning plates) and `r2-09-after-tripod` (silhouette mid-tip).
Critic files verdict; builder ceiling PASS.
