# Slice: white chunks fall off where the hammer lands

**This is the campaign's core slice. It replaces the segmented "dud bay" system with free-form
positional destruction — `docs/design/dig.md` §3's approach A, which that section always called
"the real thing, later".**

**Files you may edit — nothing else:**
- `src/materials/breakmask.js` — the threshold source (the one shader change)
- `src/destruction/damagefield.js` — **NEW**, the damage grid and its texture
- `src/game/wall.js` — the renderer/collider side of a destructible surface
- `src/game/dig.js` — wiring the field in, retiring the bay segmentation behind a flag

**Files other agents own — do not touch:**
- `src/game/player.js`, `src/game/locomotion.js`, `src/game/weapons.js` belong to `sledge-1`. **It
  calls you**; you do not reach into it. The interface is fixed in §3.6 below.
- `src/audio/audio.js` belongs to `audio-3`. Call its API, never edit it.
- `src/destruction/debris.js` and `dust.js` belong to `satisfy-1`. **Call `debris.burst(...)`; do
  not modify it.** If a chunk needs a capability those files lack, say so in your report.
- `src/views/game.js`'s load warm-up block belongs to `boot-1`.

Decisions here are made. If a stated fact turns out to be wrong, say so in your report rather than
diverging silently.

---

## 1. Why this exists

John played the segmented build and said: *"I don't really want to use the dud bay. I wanted a whole
new system where white chucks fall off when hit with the hammer."*

**`dig.md` §1 predicted this failure in advance.** The whole design was justified on the grounds
that *"with a handful of fixed candidates you find the way through by counting padlocks. Here there
is nothing to count — the wall is continuous and the answer is inside it."* **Nine bays per wall is
nine candidates.** Segmentation moved the counting from padlocks to panels and kept the defect.

So the search stops being *"which of nine panels?"* and becomes *"where in this wall?"* — and the
answer is legible only from **how fast the wall is giving way**, which is the mechanic §5 is built
on and the one thing a numeric meter would destroy (John, same day: *"no numeric destruction
meter"*).

## 2. What is already built, and why this is smaller than it sounds

⚠️ **Read `src/materials/breakmask.js`'s header before anything else.** It grows a ragged hole with
a crumbling lip and a dark undercut by comparing a **baked break-order field** against **one scalar
uniform**:

```
discard where breakOrder < uBreak
```

`uBreak` is one number for a whole surface — which is precisely why the wall currently breaks
uniformly instead of where you hit it.

**The entire look — raggedness, lip width variation, the dark rim undercut, the nested layer
silhouettes — is threshold-driven and survives this change untouched.** You are changing where the
threshold comes from. **Do not redesign the break edge.** It carries `wall.sheet` PASS 78, the
board's only material PASS lineage, and its comments record two hard-won fixes (the scallop-lobe
field and the constant-width bevel) that must not be undone.

## 3. What to build

### 3.1 The damage field — `src/destruction/damagefield.js` (new)
One per destructible wall face. **A CPU array is the source of truth**, mirrored into a
`THREE.DataTexture` for the shader.

- Resolution: **~64 × 32 cells for a full wall face** (roughly 10 cm per cell on a 6 m wall).
  Decide from the actual wall dimensions and state the figure in your report.
- Each cell holds **depth 0..1**: 0 intact, 1 dug through to whatever is behind.
- ⚠️ **The CPU array and the texture must never diverge.** One writer, one `needsUpdate` per frame —
  **not one per hit.** A hammer landing 3 times a second must not cause 3 texture uploads.

### 3.2 The brush — what one hammer blow does
`applyHit(worldPos, power)` → convert to wall UV → add a **radial falloff** brush.

- Radius ~0.35 m at full power; a blow removes a patch, not a pixel.
- ⚠️ **THE FALLOFF IS DEPTH-BASED AND IT IS THE SEARCH HEURISTIC.** The increment a cell receives
  **decreases as that cell's depth rises** — big chunks from a fresh surface, chips near the bottom.
  That is John's *"they can destroy big chunks initially but it becomes less and less"* from
  `dig.md` §5, and it is what lets a player read "this spot is bottoming out, move along".
  🎯 **JOHN'S BAND, SET 2026-08-08: *"about a minute to dig into another room."*** Target **~60 s
  median (45–75 s acceptable)** measured as **first hammer blow → standing in the next room,
  including every abandoned dig.** Today's segmented build runs 27.9 / 50.2 / 48.9 s, so aim
  *slightly longer* than today.
  🚨 **THIS IS A BAND, NOT A DIRECTION. 25 s is as much a failure as 120 s.** Reading how fast the
  wall gives way *is* the search (`dig.md` §5), so a "faster is better" reading deletes the
  mechanic. Report the number you actually measured, on at least three seeds.

### 3.3 The shader change — `breakmask.js`
Replace the scalar threshold with a sample from `tDamage` at the surface UV.

⚠️ **KEEP THE SCALAR PATH.** Every existing piece (`wall.*`, `mat.*`, the studio views) drives
`uBreak` as a uniform and **must render byte-identical**. Gate the new path on the presence of
`tDamage` (or an explicit `uDamageMode`), defaulting to the old behaviour. This is the regression
gate in §8 and it is not negotiable.

The nested layers keep working: each layer offsets/scales the sampled depth so outer layers break
first and further, exactly as the scalar version does today.

### 3.4 Passability — **this is the real work, not the rendering**
A continuous wall has no stages to hang collision off.

- A cell is **open** when `depth >= 1`.
- A player may pass where a **connected open region is at least player-diameter** in both axes.
  Compute it from the same CPU array — never from the texture, and never from a second structure
  that could disagree.
- Feed the existing consumers: `room.collide()`, `castRay`, `blocksSight`, and `pathPortals()`.
  ⚠️ **`pathPortals()` BFSs over whatever is open right now and was built for exactly this
  (`dig.md` §7) — it should need no change. If it does, that is a finding worth reporting.**
- **Holes open wherever the hammer lands, at any height** (John, 2026-08-07). ⚠️ **This knowingly
  drops the "too low for the hunter" refuge.** Do not try to preserve it; it is a recorded trade.

### 3.5 Chunks, the barrier, and the interconnect
- **Chunks**: on each hit, `debris.burst(...)` with count and size **proportional to the depth
  actually removed this blow** — so the wall visibly pays out big early and stingy late, and the
  falloff is felt as well as seen. ⚠️ **Instanced from the start**: the skate drift trail cost
  **+82 draw calls for 76 sprites** and is the standing warning.
- **The barrier**: **cyan structure** behind the white. Reaching depth 1 exposes cyan — visible,
  impassable, undamageable. ⚠️ **It must read as an ANSWER ("not here"), not as failure or a bug.**
- **The interconnect**: one seeded region per shared edge where depth 1 means **passage** instead of
  barrier. Seeded, continuous, and **giving nothing away while closed**.
- **The unlock stays GLOBAL and the duds become the routes** — John confirmed this by describing it:
  *"the barrier disapears when a robot uses the interconnect… allowing other player to walk through
  the other areas they destroyed the white wall through to the other room."* Every abandoned dig
  turns into a doorway the moment anyone gets through. **That already works in the segmented build;
  preserve it.**

### 3.6 The interface `sledge-1` calls — fixed, do not renegotiate
```
wall.applyHit(worldPos, power)   // power 0..1; returns { removed, brokeThrough, depthAt }
```
`sledge-1` calls it on contact. It also calls `playMeleeImpact(stage)` on the audio module. **You own
neither of those call sites.**

### 3.7 Determinism and the network
⚠️ **`dig.md` §3 lists "new network sync (a mask is not one float)" as approach A's cost. The answer
is: never sync the mask.** Record the **hit list** (position, power, ordering) — replaying it
reproduces the field exactly, it is tiny, and it keeps `run.js`/`wall.js` purity intact. Multiplayer
is out of scope this campaign, but **build the field so a replay reconstructs it**, because
retrofitting that is expensive and doing it now is nearly free. Capture determinism depends on the
same property.

## 4. The bar

`refs/dig/` — ingested and contact-sheeted by `refs-dig-2`. **Read `refs/_sheets/dig.png` once
rather than opening the originals.** The set shows sledgehammer crews taking person-sized ragged
holes out of ornate walls with cyan behind, chunks in flight, white rubble accumulating.

⚠️ **Two things in that set are NOT the bar**: the `DESTRUCTION METER` overlay (John has explicitly
ruled it out) and fine surface detail (they are generated images — judge composition, chunk scale,
palette and staging).

## 5. Presentation

- **The hole must be legible from where a player stands**, not only in a close-up. `dig.md` §6.
- **The last blow must feel different from the ninetieth** — the breakthrough beat.
- **Chunk scale must vary** — the reference shows roughly 40 fragments with real size variety, the
  largest ~25 cm. A uniform particle spray reads as an effect, not as masonry.
- **Rubble persists** on the floor, so a room records what was done to it.

## 6. Traps

- ⚠️ **`fbmT`'s narrow bell around 0.5** — gates written at 0.9 never fire. It has bitten four files.
- ⚠️ **Never put a backtick inside a GLSL template literal**, and never name a GLSL variable with a
  reserved word (`sample`, `filter`, `input`, `output`, `matrix`, `texture`, `buffer`, `cast`).
- ⚠️ **`onBeforeCompile` hands you the shader with its `#include`s unresolved, and a replace that
  misses fails completely silently.** HANDOFF has a section on this.
- ⚠️ **Prefer `Edit` over scripted string replacement** — it fails loudly on a bad anchor.
- ⚠️ **Do not upload the DataTexture more than once per frame.**
- ⚠️ **`PANELS` / dig ids are a network protocol surface — append, never insert.**

## 7. Verify

⚠️ **`harness/scenarios/*.mjs` are NOT standalone scripts** — they export a default function that
`playtest.mjs` drives. Run one directly and it prints nothing and exits 0, which looks exactly like
a pass. Always:

```bash
node harness/playtest.mjs --view game.play --script harness/scenarios/dig-link.mjs --port 5271 --q "seed=s4&dig=1"
node harness/playtest.mjs --view game.play --script harness/scenarios/escape.mjs --port 5272 --q "seed=s4"
node harness/mechanics.mjs
node harness/shoot.mjs --view wall.sheet --review 1280
```

**What to look at:** dig a hole with the hammer, screenshot it, and ask whether **a stranger would
say someone smashed through that wall, or that a texture faded out.** Then dig a second hole beside
it and check the two do not look like the same stamp twice — the baked field should make them
differ. Then walk through the hole you made.

Expect to have to update `dig-link.mjs`: its assertions are written in the vocabulary of bays
("bay 3 of 9"). **Rewriting those assertions in the new vocabulary is part of this slice** — the
honest metric survives the change: **time to FIND the way through, including wasted digging.**

## 8. Regression gate — non-negotiable

**With the new path inactive, these must be unchanged:**
- `node harness/shoot.mjs --view wall.sheet --review 1280` → **pixel-identical** to before. This
  protects `wall.sheet` PASS 78, the board's only material PASS lineage.
- `mechanics.mjs` **11/11**, `escape.mjs` **20 passed** on `seed=s4`.
- `?walls=legacy|occlude|instanced` must all still work — they are how every historic draw-call
  number stays checkable.

Keep the segmented system reachable behind a flag (`?dig=bays`) so today's measurements remain
comparable. ⚠️ **A toggle that does not revert every piece of state it implies contaminates every
comparison made with it** — `?cam=r10` was sold as a complete revert and was not.

## 9. Report back

What resolution the field runs at and why; the measured time to dig through and to find the
interconnect; the draw-call delta at the worst station; whether `pathPortals()` needed changes; how
chunk size tracks depth; and **anything in this document that turned out to be wrong**.

Board:
```bash
node harness/status.mjs set game.play --round N --verdict BUILDING --owner chunks-1 --summary "..."
```
**Ceiling is PASS — only a `critic-*` agent sets WOWED.** Do not grade your own fix generously; a
builder here has already had a claimed fix overturned by a critic.
