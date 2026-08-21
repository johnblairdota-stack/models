# Slice plan: furniture Teardown feel r2

**Status:** DECIDED — execute after playcritique r1 WEAK.

**Bar:** Teardown feel (`docs/design/teardown-reference.md`) for **furniture** smash in
`game.play`. Stop when playcritique files **WOWED** or **PASS with no new hates**.

**Claimed r1 (verify):** wall cams sometimes connect; furndemo clear; wound timers exist.
**Failed Teardown bar:** debris is flat chip scatter; tripod often miss; desk chair steals hits;
no “section leaves as one chunk.”

---

## Owns

- `docs/slices/task-furn-feel-r2.md` (this file)
- `src/destruction/furn-fx.js` — part/whole break pays `debris.chunk` (sized) + light crumbs
- `src/game/furn-dress.js` — tripod hit AABB enlarge; desk park clearer later if needed
- `src/destruction/furnprop.js` — camera HP / tip only if needed
- `harness/evidence/_furn-feel-critic.mjs` — keep as critic instrument

**Does not own:** dig DamageField, voxel conversion, art board WOWED.

---

## Changes (decided)

### 1. Part break = one Teardown-sized chunk

In `onPartBreak` / cascade / whole `onBreak` for wood kinds:

| Role | chunk kind | w × h × t (m) |
|---|---|---|
| leg | timber | 0.10 × 0.55 × 0.10 |
| seat | timber | 0.48 × 0.14 × 0.42 |
| back | timber | 0.48 × 0.72 × 0.08 |
| body | timber | 0.90 × 0.50 × 0.70 |
| batten | lath→timber | 0.90 × 0.12 × 0.08 |
| default | timber | 0.35 × 0.28 × 0.12 |

Call `debris.chunk(kind, at, { w, h, t, normal, spread: 0.35, hold: 0.05 })`.
Keep a **small** crumb burst (scale **0.25** of current) so dust still has grit.
Dust flash unchanged.

### 2. Tripod connect

Tripod register: `w=1.15`, `d=1.15`, `h=max(size.h, 1.55)`.
On park miss: already evidence fails — collider must be fat.

### 3. Desk aim friction (small)

When dressing study desk chair, place it **0.15 m further** from desk centreline so
sledge aiming at desk mid prefers the desk AABB (margin, not a new system).

---

## Verification

```bash
npm run build
node harness/playtest.mjs --view game.play --script harness/evidence/_furn-feel-critic.mjs \
  --port 5302 --q "seed=s4&furndemo=1&quality=medium"
```

Then **LOOK** at `r*-03-after-chair` / `r*-05-after-crate`: expect large tumbling timber plates,
not only flat chips. Critic files verdict in chat (not board art score).

---

## Traps

- Do not copy Teardown voxels — copy size/tumble/persistence (`teardown-reference.md`).
- `debris.chunk` uses `slab` pool sizing axes — timber pool must exist (it does).
- Builder ceiling PASS; only playcritic declares feel WOWED/PASS-no-hates.
