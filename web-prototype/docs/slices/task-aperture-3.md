# task-aperture-3 — `buildWall` must survive a cut inside a cut

**This is a plan, not a defect list. Every decision is made and every number is the number to
use.** If a stated fact turns out to be wrong, say so in your report rather than diverging
silently — six briefed hypotheses were refuted by the agent that received them this campaign.

---

## 1. Exact file ownership

| you may edit | you may NOT edit |
|---|---|
| `src/game/room.js` — **the `buildWall` walk only**, lines ~2714–2744 | anything else in `src/` |
| `harness/fixtures/_ap3-golden.json` — **only** by re-running `--write`, and **only** if the gate below tells you to (it should not) | `src/game/spaces.js`, `src/game/dig.js`, `src/views/game.js`, `harness/_ap2-*`, `harness/scenarios/_ap2-slab.mjs` |

`views/game.js` was last held by `reach-1`; `spaces.js` by `doorlook-1`. **Do not touch either.**
⚠️ Other agents are on this tree: if `node harness/lint-glsl.mjs` names a file you did not edit,
that is **not yours** — message the owner, do not fix it (HANDOFF's rule; it happened once during
this slice's diagnosis, with `harness/scenarios/_dress1-skin.mjs`).

New files this slice ships (already written by `aperture-3`'s diagnostic pass — **read them, do
not rewrite them**):

- `harness/evidence/_ap3-build.mjs` — the whole mansion, built headless in node, one arm per process
- `harness/evidence/_ap3-geom.mjs` — the metres-of-masonry meter, its five controls, and `--preview`
- `harness/evidence/_ap3-golden.mjs` + `harness/fixtures/_ap3-golden.json` — the disjoint-cut regression gate

---

## 2. Why this slice matters

John, 2026-08-11: *"lets **aperture the doorways into the slab** and be able to do it in a **known
location**."* The GRID half of that is built and proved (`_ap2-rule.mjs`, `?slab=1&doors=1`). The
GEOMETRY half is broken, and it blocks the whole slab rollout: `maptool-2` priced **63.4% of
diggable runs as split by a door**, the generator's longest contiguous run is **31.3 m**, and every
one of those slabs will need doorways inside it at authored coordinates.

The next step after this one — the resume's *"put the actual doors in the apertures"* — is a
one-line change in `spaces.js`. **Do it before this fix and 2.96 m of floor-to-ceiling masonry
stands inside every service-passage slab, on all four faces, with a collider on it.** That is a
wall you can dig completely away and still not walk through: this project's most expensive failure
class, in a place nobody would look.

---

## 3. The mechanism — what is actually wrong, in terms of the walk

`buildWall` sorts `o.cuts` by **centre** and then tests each cut's **left edge** against a
`cursor` that only ever advances to a cut's **right edge**:

```js
const cuts = [...o.cuts].sort((a, b) => a.u - b.u);   // by CENTRE
let cursor = o.u0;
for (const c of cuts) {
  const left = c.u - c.w / 2;                          // by EDGE
  if (left > cursor + 0.01) { …emit solid infill… }
  …
  cursor = Math.max(cursor, c.u + c.w / 2);
}
```

For **disjoint** cuts those two orderings are the same ordering, which is why this has been
correct for every lintel, window, doorway and dig face in the house. **Nest one cut inside
another and they come apart.**

On the service-passage wall with the slab arm wired up, the cut list is three entries:

| cut | centre `u` | span | `y0..y1` |
|---|---|---|---|
| `p.svc_w.n` (doorway) | −20.00 | −21.04 … −18.96 | 0 … 2.68 |
| `f.svc_w.0` (the 15.40 m slab) | −16.30 | **−24.00 … −8.60** | 0 … 2.80 |
| `p.svc_w.s` (doorway) | −12.20 | −13.24 … −11.16 | 0 … 2.68 |

Sorted by centre, **the doorway is visited first** — −20.00 < −16.30 — while the slab's left edge
is 3 m to its left. So the walk reaches the doorway with `cursor` still at `o.u0` = −24.00, sees a
2.96 m gap in front of it, and fills it. Three artefacts follow, all measured off `sp.colliders`
of a house `_ap3-build.mjs` really built:

1. **The infill.** A **2.960 m × 4.80 m** solid box **plus a skirting board**, floor to ceiling, at
   z −24.00 … −21.04 — inside the span the slab is supposed to own. **Four of them** (both faces of
   `svc_w` and both of `svc_e`) = **11.840 m of floor-to-ceiling masonry standing inside an
   aperture span.** With a fourth opening in the wall it compounds: the `overhang` arm shows a
   second 1.62 m box on top of the first.
2. **The doubled lintels.** Each doorway's lintel is emitted at 2.68 … 4.80 over the slab's own
   tracked lintel at 2.80 … 4.80 — **2.08 × 2.12 m of coincident wall in one merged bin, twice per
   face**, i.e. z-fighting geometry paid for twice. (Total masonry intersecting a dig face
   rectangle: **7.120 m per face, 28.480 m over four faces.**)
3. **A degenerate box.** `-16.3 + 7.7` is `-8.600000000000001`, so `cursor < o.u1` is true by one
   ULP and the trailing branch emits a **zero-width, full-storey box and skirt**. ⚠️ **This one is
   already live on plain `?slab=1`, with no doorway involved at all** — four of them. The BAND walk
   twenty lines below already guards this exact case (`if (w < 1e-4) return;`); the main walk does
   not.

🚨 **The `3.04 m` in `docs/agents-resume-2026-08-11.md` is not reproducible and is superseded by
2.960 m.** `aperture-2`'s report does not exist on disk. The 2.96 m falls straight out of the
authored numbers — `SLAB_SPAN[0]` −24.00 to the doorway's left edge at −20.00 − 2.08/2 = −21.04 —
and is measured on the built house by `_ap3-geom.mjs` A1.

---

## 4. The changes — three edits, all inside `buildWall`

Use `Edit` with these exact strings. Do not reformat the surrounding block.

### Change 1 — sort by LEFT EDGE, widest first, and carry a `done` list

The walk's own test is an edge test, so its sort must be an edge sort. **For disjoint cuts this is
provably the same order** (if `a` ends before `b` starts then both `a.u < b.u` and
`a.left < b.left`), which is why the golden does not move. The `|| (b.w - a.w)` tiebreak makes the
CONTAINER come first when two cuts share a left edge, so a nested cut always finds its host.

`old_string`:
```js
    const cuts = [...o.cuts].sort((a, b) => a.u - b.u);
    let cursor = o.u0;
    for (const c of cuts) {
      const left = c.u - c.w / 2;
```

`new_string`:
```js
    /**
     * ⚠️ **SORTED BY LEFT EDGE, NOT BY CENTRE, AND THAT IS THE DIFFERENCE BETWEEN A SLAB WITH A
     * DOORWAY IN IT AND 2.96 m OF MASONRY STANDING INSIDE ONE.** The infill test below is an
     * EDGE test against a `cursor` that only advances to a cut's RIGHT edge. For disjoint cuts
     * centre-order and edge-order are the same order — which is why this was correct for every
     * opening in the house and why `_ap3-golden.mjs` finds 15740 leaves unmoved. Nest a 2.08 m
     * doorway at u −20.00 inside a 15.40 m slab centred at −16.30 and they come apart: the
     * doorway sorts FIRST, the walk still has `cursor` at the wall's start, and the 2.96 m in
     * front of the doorway is filled with a full-storey box and a skirting board — inside the
     * span the slab owns. `_ap3-geom.mjs` A1 is the number.
     *
     * `|| (b.w - a.w)` puts the WIDER cut first when two share a left edge, so a contained cut
     * always meets its container before itself.
     */
    const cuts = [...o.cuts].sort((a, b) => ((a.u - a.w / 2) - (b.u - b.w / 2)) || (b.w - a.w));
    const done = [];
    let cursor = o.u0;
    for (const c of cuts) {
      const left = c.u - c.w / 2, right = c.u + c.w / 2;
```

### Change 2 — a cut that lives wholly inside another emits nothing; one that overlaps without nesting is refused out loud

A doorway inside a dig face is already a hole: the face's own `apertures` rect carries it in the
`DamageField`, the slab's lintel already covers everything above the band, and the 0.12 m of head
between the doorway's 2.68 m and the band's 2.80 m is drawn by the destructible face itself
(`apertureRects` gives `v1 = 2.68 / 2.80 = 0.957`). So a contained cut owes this walk **no lintel
and no sill** — emitting them is the doubled masonry in §3.2.

An overlap that is *not* a containment (a doorway taller than the dig band) is a shape this
single-pass walk cannot represent in any visit order. **It cannot arise on the shipped table or on
`SLAB_DOORWAYS` — every doorway is 2.68 m in a 2.80 m band — so refuse it rather than guess.** A
`console.warn` and not a throw: a throw at build time paints `VIEW … FAILED` over the whole game
(HANDOFF's `unhandledrejection` hazard) and this is a floor-plan mistake, not a crash.

`old_string`:
```js
      if (c.y1 < o.H) { const h = o.H - c.y1; box(c.w, h, c.u, c.y1 + h / 2, c.dig ?? null); }
      if (c.y0 > 0.01) box(c.w, c.y0, c.u, c.y0 / 2);
      cursor = Math.max(cursor, c.u + c.w / 2);
```

`new_string`:
```js
      /**
       * 🚪 **A CUT THAT LIVES WHOLLY INSIDE AN EARLIER CUT OWES THIS WALK NOTHING.** A doorway
       * inside a dig face is already a hole: the face carries it as an `apertures` rect in its
       * `DamageField`, the host's lintel already covers everything above the host's own head, and
       * the sliver between the two heads (2.68 m in a 2.80 m band) is drawn by the destructible
       * face itself. Emitting a second lintel there puts 2.08 x 2.12 m of coincident wall in one
       * merged bin, twice per face — see `_ap3-geom.mjs` A1.
       *
       * 🚨 **AN OVERLAP THAT IS NOT A CONTAINMENT IS REFUSED, NOT GUESSED AT.** A doorway taller
       * than the band it sits in would need to CUT the host's lintel, and no visit order of a
       * single-pass walk can do that. Nothing in the house or in `dig.js` `SLAB_DOORWAYS` can
       * produce that shape, so this is a tripwire for a generator, not a live branch — and it
       * warns rather than throws, because a throw at build time paints "VIEW … FAILED" over the
       * whole game and a floor plan that does not fit is not a crash.
       */
      const host = done.find((d) => d.u - d.w / 2 <= left + 1e-6
        && d.u + d.w / 2 >= right - 1e-6 && d.y0 <= c.y0 + 1e-6 && d.y1 >= c.y1 - 1e-6);
      if (!host) {
        if (done.some((d) => d.u - d.w / 2 < right - 1e-6 && d.u + d.w / 2 > left + 1e-6)) {
          console.warn(`[room] buildWall: overlapping cuts that do not nest on ${sp.id} ${o.axis}@${o.at} — the opening at ${c.u} is not representable by this walk`);
        }
        if (c.y1 < o.H) { const h = o.H - c.y1; box(c.w, h, c.u, c.y1 + h / 2, c.dig ?? null); }
        if (c.y0 > 0.01) box(c.w, c.y0, c.u, c.y0 / 2);
      }
      done.push(c);
      cursor = Math.max(cursor, right);
```

### Change 3 — the trailing infill gets the same 0.01 m guard the leading one has

`old_string`:
```js
    if (cursor < o.u1) {
      const w = o.u1 - cursor;
```

`new_string`:
```js
    // ⚠️ **THE SAME 0.01 m THE LEADING TEST USES, AND IT IS NOT TIDINESS.** `-16.3 + 7.7` is
    // `-8.600000000000001`, so a cut that reaches exactly `o.u1` — which is what a slab spanning
    // its whole wall does — left `cursor` one ULP past it and this branch emitted a ZERO-WIDTH
    // full-storey box and skirting board. Four of them on plain `?slab=1`, doorway or no doorway.
    // The BAND walk below has always guarded this (`if (w < 1e-4) return;`); this walk had not.
    if (o.u1 - cursor > 0.01) {
      const w = o.u1 - cursor;
```

---

## 5. What must NOT change — read the comments before you touch the shape

- ⚠️ **The clerestory BAND is a second, disjoint walk over a separate height band ON PURPOSE, and
  it stays that way.** Sharing one cut list makes the walk emit a solid sill box from the floor to
  the window and SEALS a doorway — four of the gallery's seven clerestories overlap a doorway in
  `u`. It does not throw and it does not look like a bug from outside; the door is simply a wall.
  **Do not "unify" the two walks now that the main one handles nesting.** Out of scope, and the
  meter in §7 cannot see the band anyway.
- ⚠️ **A TRACKED box is never clipped by `capY`.** A clipped lintel is a floating band over a
  hunter-sized hole. The lintel over a dig segment is a MECHANIC — a 1.70 m robot walks under it
  and a 2.40 m hunter does not, and that exclusion is physical, not a flag. **Change 2 must never
  suppress a TRACKED lintel:** it cannot, because the dig cut is the widest and tallest cut on
  that wall and therefore is never itself contained — but if you find yourself editing the
  `c.dig ?? null` argument, stop.
- ⚠️ **`dedupeCuts` stays.** Change 2 would now absorb an exact duplicate as its own container,
  but `dedupeCuts` is what keeps the two-sided panel table from reaching the walk at all, and
  `dig-toggle.mjs` is baselined against it.
- ⚠️ **No doorway under ~2.0 m in a 2.80 m band.** Measured (`_ap2-rule.mjs` A8): below that it
  stands permanently cracked and one blow drops its own lintel. The shipped 2.68 m door in a
  2.80 m band already has essentially no lintel — one course, 0.193 m², **6% of the 3.40 m²
  collapse threshold**. Do not "improve" `SLAB_DOORWAYS` heights while you are here.

---

## 6. The traps

- 🚨 **Run `node harness/lint-glsl.mjs` after EVERY edit, not at the end.** Pass 2 parses every
  `.js`/`.mjs` with esbuild and a syntax error takes the shared build down for every agent. If it
  reports `harness/scenarios/_dress1-skin.mjs`, **that file is not yours** — leave it.
- 🚨 **`npm run build`, never `npx vite build`.**
- ⚠️ **Change 2's `console.warn` uses a template literal.** `room.js` contains no `/* glsl */`
  block, so the backtick hazard does not apply here — but do not "tidy" it into a glsl file.
- ⚠️ The band walk twenty lines below declares its own `left`/`right`. Change 1 adds `right` to a
  different block scope; that is fine and no rename is needed.
- ⚠️ **Do not use scripted search-and-replace.** `box(c.w, h, c.u, …)` appears in shapes that look
  alike. Use `Edit` with the exact strings above.
- ⚠️ Do not run `harness/shoot.mjs` — it still has no `@vite/client` stub, and another agent is on
  the tree. Nothing in this slice needs a browser.

---

## 7. Verification — the exact commands, and what green looks like

```
node harness/lint-glsl.mjs                                     # after every edit
node harness/evidence/_ap3-geom.mjs                                     # 20 pass / 0 fail
node harness/evidence/_ap3-golden.mjs --check harness/fixtures/_ap3-golden.json  # 15740 leaves + the control
npm run build
```

**`_ap3-geom.mjs` on the tree as you found it is `15 pass / 5 fail`.** Those five are this slice:

| line | before | after |
|---|---|---|
| `A1.wired` | ❌ 28.480 m over 4 faces, 11.840 m of it floor-to-ceiling | ✅ every dig face is hollow |
| `A2.slab` / `A2.slabdoors` / `A2.wired` | ❌ 4 degenerate boxes of 158 / 158 / 170 | ✅ 0 of 154 |
| `A3` | ❌ no warning raised | ✅ `[room] buildWall: overlapping cuts that do not nest…` |

**The other fifteen are the controls and they must stay green on every run.** If any of these goes
red, the measurement is meaningless and the A1/A2/A3 result above means nothing:

- `C1` — the SAME meter must report **2.080 m** of floor-to-ceiling masonry at the pier the default
  arm really does stand between two dig spans. A meter pointed at the wrong plane reports 0.000 m
  everywhere, which reads as a clean wall.
- `C2` — …and **0.000 m** inside every dig face on that same arm.
- `C3` — the A/B is a real switch: the wired arm carries the four `p.svc_*` rows and the plain
  `?slab=1&doors=1` arm carries none; the slab arm built `15.400 / 15.400 m` faces where the
  default built `2.960 / 5.720 / 2.560`.
- `C4` — every arm built a house (>100 colliders, >100 meshes, ≥8 dig faces).
- `C5` — the fabricated 3.40 m opening really reached `buildWall` (its 3.40 m lintel is in the
  collider set), so A3's "no refusal" cannot mean "nothing to refuse".

**Before you start**, run `node harness/evidence/_ap3-geom.mjs --preview`. 🎯 **It parses §4's own
`old_string` / `new_string` blocks out of this file and applies them to `room.js` in memory** —
comments and all — so the preview measures the document you are about to follow, and prints
`preview: 20 pass / 0 fail`. That is the target. If your typed version does not reach it, you
mistyped something: re-paste from §4. `node harness/evidence/_ap3-golden.mjs --check harness/fixtures/_ap3-golden.json
--preview` does the same for the regression gate. Once the fix is in the tree both print *"the fix
is already in the tree"* and that is correct, not a failure.

⚠️ Because §4 is executable, **do not reword the code inside those six fenced blocks.** Prose
around them is free; the fences are the patch.

⚠️ **There is no browser check in this slice and that is deliberate.** The nested cut is
unreachable from any URL on the shipped tree — `spaces.js` refuses `?slab=1&doors=1` its four
`p.svc_*` connector rows — so the arm under test is reached through `buildTestRoom`'s own
documented `o.panels` ablation, in node. See §9.

---

## 8. The regression gate — this is the whole risk of the fix

**Every lintel, window, doorway, sill, clerestory and dig lintel in the house goes through this
walk.** The defect only exists when cuts nest, which happens on no shipped arm, so the entire risk
is that the fix moves something on a DISJOINT arm and nobody notices for a week.

```
node harness/evidence/_ap3-golden.mjs --check harness/fixtures/_ap3-golden.json
```

Carries `localise-1`'s technique (`_loc1_golden.mjs`, **1170 leaves `Object.is`-identical**) onto
built geometry: every `THREE.Box3` collider per space in build order, plus every merged mesh by
name, material, vertex count, index count and a SHA-256 of the raw bytes of its position buffer.
Five arms — `default`, `doors`, `bays`, `nodig`, `noestate` — chosen so that between them they
exercise the tracked dig lintels, the gallery's `capY` + clerestory band, the study's window
sills, the 36-cut `?dig=bays` list, connector-only walls, and no-order walls.

**Expected: `✅ 15740 leaves Object.is-identical across 5 arms`. `aperture-3` measured exactly that
with these three changes applied (`--preview`): zero leaves moved.**

The gate ships its own **control that must fail, on every `--check`**: it rebuilds one arm with
`room.js`'s skirting height and collider thickness each perturbed by 0.1 mm in memory and requires
the comparison to go red (**178 leaves**). A stale file, an empty census or a surface that stopped
including geometry all print the same "identical" as a correct no-op; the ablation is what tells
them apart. **If the control line is ❌, the ✅ above it means nothing.**

🚨 **If any leaf moves, do not re-run `--write`.** The golden was recorded on the pre-fix tree and
its whole purpose is that the fix does not move it. A moved leaf is a bug in your edit — most
likely a `<` that should be `<=` in Change 2's containment test, which would suppress a lintel the
house needs. Report it.

The `?slab=1` arms are deliberately **not** in the golden: they carry the four degenerate boxes
Change 3 removes on purpose, and a golden that pinned them would forbid the fix.
`_ap3-geom.mjs` A2 is what guards them.

---

## 9. What this unblocks, and the one line that turns it on — NOT part of this slice

With the fix landed, the wiring the resume calls *"put the actual doors in the apertures"* is one
line in `src/game/spaces.js`:

```js
export const PASSAGE_DOORS_ON = DOORS_URL && !SLAB_ARM;   // -> DOORS_URL
```

**Do not make that edit in this slice.** It is a different owner's file and it changes what an
existing arm MEANS, which is a decision for the lead, not a side effect of a geometry fix:

- `?slab=1&doors=1` today = *two OPEN doorways — holes with nothing standing in them*. After that
  line it = *two BREACHABLE door leaves standing in those holes*.
- **`harness/scenarios/_ap2-slab.mjs` B3 asserts `a body walks through the doorway of a PRISTINE
  slab`.** A door leaf in the hole flips it. That gate is correct today and would be correct after;
  it is asserting a different sentence. Whoever lands the wiring owns updating it, and owns saying
  so in `HANDOFF.md`.
- Everything else is free: all four rows are `BREACHABLE`, never `EXIT`, and `PANELS` is a FILTER
  over `PANELS_AUTHORED` rather than a re-insert, so `EXIT_SITES` is unchanged and **no seed
  moves** (`_doors1-pool.mjs`). `views/game.js` already routes `PANELS` through `o.panels`.

`_ap3-geom.mjs`'s `wired` arm is that exact table, driven through `buildTestRoom`'s own ablation
hook — so this slice proves the geometry is ready for the wiring **without shipping the wiring**.
