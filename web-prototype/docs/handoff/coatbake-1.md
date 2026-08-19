# `coatbake-1` — what a PER-ROOM dig coat costs in programs, bakes, VRAM and boot (2026-08-11)

**The instrument is `harness/scenarios/_coat1-programs.mjs` and its argument is in its own header.**

```bash
node harness/playtest.mjs --view game.play --script harness/scenarios/_coat1-programs.mjs \
     --port 5456 --q "seed=s4"           # 19 passed · 0 failed  (the damage arm — the real run)
node harness/playtest.mjs --view game.play --script harness/scenarios/_coat1-programs.mjs \
     --port 5456 --q "seed=s4&dig=0"     # 9 passed · 0 failed · 2 SKIPPED — the null arm
```

**Headline, and it reverses the shape of the risk this slice was given.**
A per-room coat is **+0 shader programs, +0 bakes, +0 MB VRAM and +0 ms of boot** — provided every
room's coat is built as **one material class carrying that room's own baked textures**. The one
thing that costs anything is building each coat with its room's own *maker function*: that is
**+1 program in place, ~+6 at boot (~0.6 s of cold boot)**, and it is a **material-CLASS**
difference that **no cache key can undo**. Both numbers are measured, both carry controls.

`dressbin-1` priced the erosion at +0 draw calls and named the bake as the unpriced risk. **The
bake is not a risk. It is free by construction, and the mechanism that makes it free is the one
`wall.js` already relies on.** What is actually at stake is one program family and one taste call.

| the question | the answer | the arm |
|---|---|---|
| per-room coat, one class + per-room textures | **+0 programs** at 4/4 distinct room bakes | **A1** |
| per-room coat, each room's own maker | **+1 program** (gallery only) — a class difference | **A2** |
| `estateSkinMat(roomOpts)`, the one-line edit | **+0 programs** | **A3** |
| the gallery in the one family (token clearcoat 0.02) | **+0 programs** | **A4** |
| new bakes needed | **0** — 4/4 cache HITS, key round-trips | **B1** |
| new VRAM | **0.00 MB** | **B1** |
| getting one room's arguments wrong by 0.001 | **1 bake · 16.08 MB · 9–14 ms** | **C5** |
| any bake during play | **0** in 3.0 s of live play | **C6** |

---

# PART II — ✅ IT IS BUILT (2026-08-11), THREE ARMS ON `[C]`, AND ARM 0 IS UNCHANGED BY MEASUREMENT

**`?coat=0|1|2`, and `[C]` cycles it live in game** beside `[G]`'s black point, printing the arm,
the number of faces it moved and the live program count into the prompt slot — so John is never
guessing which arm he is looking at or what it costs.

| arm | what it is | faces wearing their room's skin | rooms | **programs** |
|---|---|---|---|---|
| **0** SHIPPED | one hardcoded boiserie on every face | **8 / 28** | **2 / 6** | **231** |
| **1** PER-ROOM | the room's own skin · gallery joins the family (clearcoat 0.02) | **28 / 28** | **6 / 6** | **231** |
| **2** PER-ROOM+ | the room's own skin · gallery matches its paper exactly (Standard class) | **28 / 28** | **6 / 6** | **231** |

Each row is its own `playtest` run of `_coat1-programs.mjs`. **Arm 0 reproduces the pre-change
build to the digit** — 231 programs, 8/28 faces, 2/6 rooms — which is the "unchanged by
measurement, not by inspection" the brief asked for. The assertion **flips with the arm** (arm 0
must mismatch, arms 1–2 must match), so neither outcome can be a constant.

## 🚨 ARM 2 IS +0, WHICH OVERTURNS MY OWN ESTIMATE FROM PART I

Part I priced arm 2 at **"+1 in place, ~+6 at boot, ~0.6 s of cold boot"**, by arithmetic off the
program-name histogram. **On the real build it is +0: 231 on all three arms.**

I did not accept that at face value, because "+0" is the most result-shaped output there is. **A5**
was added for exactly this: it takes each face's *live* `mats[0]` and draws it once. If a coat's
program had merely been *deferred* (a pristine face never draws its own layer 0 — see below), A5
would read +1. It reads **+0 on 4 of 4 live coats**, so nothing is deferred and 231 is the whole
bill. The per-name histogram confirms the coats really did change class — arm 2 shows
`×4 MeshStandardMaterial · defines RRR_BREAK_DAMAGE+RRR_BREAK_RAGGED+STANDARD` where arm 0 shows
none — while the total holds.

⚠️ **The MECHANISM is unattributed and I am not going to invent one.** On arm 0 the single coat
family owns 6 programs; on arm 2 the coats span a Physical family and a Standard family and the
house total does not grow, so something compiles fewer variants elsewhere. **Do not requote my
"~+6 / ~0.6 s" figure — it is dead.** The measured statement is: *on this build, at seed s4, all
three arms read 231.* A2's in-place **+1** for a Standard-class coat added on top of arm 0's set is
also real and reproduced five times; the two coexist and I could not reconcile them from the
histogram alone.

## 🚨 AND THE FINDING THAT MATTERS MOST — THE COAT HAS NEVER BEEN VISIBLE ON AN UNTOUCHED FACE

Measured, not read: **28 of 28 free faces are `pristine`, 28 of 28 are `instanced`, and 0 of 28
draw their own layer 0.** A pristine face is drawn by `wallinstances.js`'s shared
`wall.pristine.face` — `applyBreakMask(wallStageMaterials()[0], BREAK_CFG[0])`, i.e. the **damask
wallpaper stage** — while `wall.js` hides the panel's own five meshes.

🚨 **This is PRE-EXISTING and true on arm 0.** `estateSkinMat()` has been on the tree since
2026-08-08 and has never reached the screen on a face nobody has hit yet. `wall.js`'s own header
argues the opposite (*"a band of damask in a boiserie room gave away the whole dig band before a
blow landed"*) — **that is exactly what still happens.** The coat appears on the first blow, when
`pristine` goes false and the panel de-instances.

**So arms 1 and 2 are judgeable on any face that has taken a blow, and invisible before that.**
The instrument reports this as a **named FAIL on every run** rather than hiding it, in the same
spirit as `dig-band`'s chapel line.

**The fix is one file and it is NOT this slice's:** `wallinstances.js` groups by authored aperture
(`w×h×t + apertureKey`) and hands every group one shared face material. The group key would have to
carry the room's coat too. ⚠️ **That is the draw-call instancing path** — more groups means more
`InstancedMesh`es, and `eo2-calls` is the gate — so it needs its own owner, its own measurement,
and the current 423/625 as its baseline. **Reported, not attempted.**

## What was actually edited

- **`src/game/wall.js`** — the whole feature. A module block (`COAT_ARMS`, `coatArm`, `setCoatArm`,
  `roomWallMaterialOf`, `coatFromWall`) carrying the measured price of each arm in its header; the
  layer-patch `for` loop turned into a re-callable closure `_patchLayerMaterial(i)` **with nothing
  inside it changed**; and `recoat()` beside `resetDamage()`.
- **`src/views/game.js`** — four small edits, none of them near `onChunk`: one import, the
  `cycleCoat` handler beside `cycleBlackPoint`, one `input.consume('KeyC')` line beside `KeyG`'s,
  and one legend entry.
- **`harness/scenarios/_coat1-programs.mjs`** — arm-aware assertions, the pristine/instance census,
  and the new **A5** arm.

### The three design decisions worth arguing with

1. **The coat resolves on `added`, not in the constructor, and that is forced.** The room's own
   wall material is found by walking the panel's PARENT — `room.js` sets `p.ownerSpace = owner` and
   calls `owner.root.add(p.root)` on the next line, and `buildSpace()` has already run for every
   space a whole loop earlier. **So this needed no `room.js` change at all**, which matters because
   `skin-1` owns that file right now. It still lands inside the loading screen, which is the
   property C6 protects.
   🔜 **One line for whoever next owns `room.js`:** `coat: mats.wall` in the `new DestructibleWall({…})`
   call, exactly parallel to the `revealMaterial: mats.reveal` already there. That should replace
   the parent-walk; it is explicit where this is implicit.
2. **Arm 0 is unchanged by an early-out, not by a flag.** Every panel is constructed at arm 0 and
   `recoat()` returns immediately when the requested arm is the one already applied, so on the
   default arm the feature executes `if (0 === 0) return false` once per face and touches no
   material, mesh or program.
3. **`_apply()` is called after every re-coat.** A fresh `applyBreakMask` starts the new material's
   break uniforms at their defaults; `_apply()` is the one place that writes the panel's real state
   back. Without it, re-coating mid-dig would repaint a dug face pristine.

### Gates, re-run on this tree

`npm run build` ✓ · `node harness/lint-glsl.mjs` ✓ after **every** edit (469 files) ·
**`eo2-calls` 6/0** (worst `ballroom.centre` **423/625 calls, 605k/900k tris**) ·
**`dig-free` 15/15** (the gate the closure refactor could most plausibly have broken) ·
**`_ap3-geom` 38/0** · **`_progkey1-independence` 12/0 on the damage arm** ·
`_coat1-programs` **20 passed / 1 failed** on each of arms 0, 1 and 2 (the 1 is the pristine-instance
finding above, correctly red) and **9/0/2-skipped** on the null arm.

⚠️ **Two reds that are NOT mine, checked rather than assumed:**
- **`_ap3-golden --check`: 72 of 15740 leaves moved.** Every one is a room dressing bin —
  `portraits`, `kit:wall`, `kit:gilt`, `kit:mould`, `kit:skirt` — with **vertex counts growing**
  (1500 → 2325, 2292 → 2328). That is `skin-1` pre-subdividing dressing so it can erode per cell,
  which is precisely what the brief said to expect. **A material change adds no vertices and mine
  adds none.** The comparator's own control passed (a 0.1 mm ablation moves 206 leaves).
- **`_progkey1-independence` scalar arm reads 5/1-skip** against HANDOFF's recorded 12/12: its
  picker chose `x.ballroom.terrace_w`, a CHAINED exit site, and skipped rather than ruling. **The
  coat cannot reach the scalar arm** — every line of it is gated on `this.field`, the listener is
  only installed on damage-armed faces, and `_coat1-programs.mjs` on `--q "seed=s4&dig=0"` reports
  both coat sections SKIPPED and **0 console errors**. Panel ORDER is `room.js`'s, and the slab and
  aperture work has landed since that 12/12 was recorded. **Reported, not adopted, and worth an
  owner** — a picker that lands on a chained site turns a leak gate into a skip.

---

Everything in PART I below was taken on **`quality` as the view ships**, seed s4, `?estate=port`, `?dig=free`,
`?walls=instanced`, **231 programs**, at ONE settled station with every arm flipped **in place** —
`dressbin-1`'s 423/461/479 finding means a walked reading is not comparable, and I did not walk.
**Three independent default-arm runs reproduced every delta to the digit** (231 → 232 → 231 on the
+1 arms, 231 → 231 → 231 on the +0 arms), plus one null-arm run.

---

## 1. The premise, re-measured off the built scene — `dressbin-1` is right

**20 of 28 damage-armed faces wear a coat that is not their room's wall bake. 2 of 6 rooms match.**

| room | faces whose coat IS that room's own `kit:wall` bake |
|---|---|
| service | **7/7** |
| chapel | **1/1** |
| study_w | 0/5 |
| study_e | 0/7 |
| gallery | 0/4 |
| ballroom | 0/4 |

All 28 free faces wear **one** material: `est-bois:{"paint":[0.3,0.258,0.212],"grime":0.9,
"size":1024,"repeat":[1,1]}`, `MeshPhysicalMaterial`, clearcoat 0.25, defines
`PHYSICAL+RRR_BREAK_DAMAGE+RRR_BREAK_RAGGED+STANDARD`, key `rrr-wall|dig|rrr-ssao-v1`. That is
`room.js:3159`'s `mats.wall` exactly, which is service's and chapel's wall and nobody else's.

**The four bakes a per-room coat has to reproduce** — read off the scene, not off `room.js`:

| rooms | family | class | clearcoat |
|---|---|---|---|
| service + chapel | `est-bois` paint `[0.300,0.258,0.212]` grime 0.9 | `MeshPhysicalMaterial` | **0.25** |
| ballroom | `est-bois` paint `[0.330,0.302,0.262]` grime 0.85 | `MeshPhysicalMaterial` | **0.25** |
| study_w + study_e | `walnut` (`walnutField`) | `MeshPhysicalMaterial` | **0.55** |
| **gallery** | `ws.paper` (`wallpaperNeutral`) | **`MeshStandardMaterial`** | **none** |

**Four distinct bakes, not six** — the two studies share one and service/chapel share one. That
matters: the coat table is four rows, not six.

---

## 2. Can `estateSkinMat()` become per-room without adding programs? **Yes — and the boundary is not where the brief assumed**

### The three fields that decide it, in three's own order

`WebGLPrograms.getProgramCacheKey` (r180) hashes `shaderID` (the material **class**) and the
parameter flags first, then `material.defines`, then **`customProgramCacheKey` LAST**. A TEXTURE is
a uniform value and appears in none of them.

### ⚠️ `patchForScreenAO` — checked before concluding anything, and it is load-bearing in one direction only

`post/pipeline.js:157` **assigns** `customProgramCacheKey = () => 'rrr-ssao-v1'` over every
standard material in the scene; `wall.js`'s `pinProgramKey` is an accessor that **composes** onto
it. Measured on the live coat: **every one of the 28 free faces already carries the identical key
`rrr-wall|dig|rrr-ssao-v1`.**

So that field is:
- **load-bearing** for keeping the dig arm apart from the ordinary estate walls (that is why
  `pinProgramKey` exists, and `progkey-1` says so);
- **useless as a separator** between rooms — they already share it, and adding a per-room suffix
  would be `progkey-1`'s exact defect reintroduced;
- **useless as a merger** — C3 and C7 both move the counter by +1 with the key held *identical*,
  because the class and the parameter flags are hashed three fields earlier.

**Measured (C1):** a unique custom key is **+1**, so the field is read. **Measured (C3):** an
identical key with a different class is **+1**, so the field cannot merge. Both directions
answered with a number rather than an argument.

### A1 — one class, per-room textures: **+0 programs, 4 of 4**

```
+0  231→231→231   A1 texture-only coat · gallery          · ws.paper
+0  231→231→231   A1 texture-only coat · study_w+study_e  · walnut
+0  231→231→231   A1 texture-only coat · service+chapel   · est-bois
+0  231→231→231   A1 texture-only coat · ballroom         · est-bois
```

Same class, same defines, same pinned key, that room's baked `map`/`normalMap`/`orm`. **Zero.**

### A2 — each room's own maker: **+1, and it is exactly one room**

```
+1  231→232→231   A2 maker-built coat · gallery          · ws.paper   ← MeshStandardMaterial
+0  231→231→231   A2 maker-built coat · study_w+study_e  · walnut     ← Physical, clearcoat 0.55
+0  231→231→231   A2 maker-built coat · service+chapel   · est-bois   ← Physical, clearcoat 0.25
+0  231→231→231   A2 maker-built coat · ballroom         · est-bois   ← Physical, clearcoat 0.25
```

🚨 **The surprising half, and it is the useful one: `walnutPanel` costs NOTHING even though it is a
completely different surface shader.** `baker().standard()` bakes every surface to the same three
textures and wires them into the same slots, so *the surface GLSL runs at BAKE time and never at
DRAW time*. `walnutField` differs from the service boiserie only in its clearcoat **value** (0.55
vs 0.25) and its textures — and both are uniforms.

**The only offender is the gallery, because `wallpaperMat` returns a `MeshStandardMaterial` while
`boiserieMat` and `walnutPanel` both return `MeshPhysicalMaterial`** (`materials-local.js:1370`
`clearcoat: 0.25`; `walnut.js:265` `clearcoat: 0.55`; `wallstages.js:790` takes the default Ctor).

### A4 / C7 — the boundary is clearcoat PRESENCE, not its value

```
+0  231→231→231   A4 gallery paper as Physical, clearcoat 0.02
+1  231→232→231   C7 CONTROL · the same coat with clearcoat 0
```

`getParameters` sets `clearcoat: material.clearcoat > 0`. So **0.02 and 0.55 are one program and
0.00 is another.** The gallery's coat can join the single family for the price of a wax its own
wall does not have — a specular term at 0.02 against the 0.25 already on four fifths of the house.

### 🎯 And the house is ALREADY doing this

Of the four room-wall materials, **3 of 4 create ZERO programs of their own** on the damage arm
(4 of 4 on the scalar arm) — they are already sharing programs first compiled by another room's
material with different textures. **A per-room coat is asking for behaviour that ships today.**

### The boot multiplier — stated as arithmetic, because it is

An arm flipped at one settled station compiles for the ONE light/shadow configuration on screen,
so a new family reads **+1**. The page's own histogram puts every wall material family at
**×6 programs** (`est-bois:{0.3…}` ×6, `ws.paper:{0.455…}` ×6, `ws.plaster` ×6, `wall.pristine.face`
×6) — the light/shadow variants `views/game.js` warms on purpose. So the A2 form is **~+6 of 231
at boot (+2.6%)**, and at `progkey-1`'s recorded ~106 ms/program **~0.6 s of cold boot**.
⚠️ **That last figure is ARITHMETIC off this page's histogram, not a timed measurement** — a timed
one needs a source edit, which this slice was not allowed to make.

---

## 3. What does the bake cost? **Nothing, and here is why it cannot cost anything**

`baker.js` keys the cache on `family:JSON.stringify(opts)` and `standard()` returns a **new
material instance sharing the CACHED textures**. So asking a maker for a room's own arguments is a
pure cache hit.

### B1 — measured, per distinct room bake

| family | bakes | hits | VRAM | ms | key round-trips |
|---|---|---|---|---|---|
| `ws.paper` (gallery) | **+0** | +1 | **0.00 MB** | **0.0** | ✅ |
| `walnut` (both studies) | **+0** | +1 | **0.00 MB** | **0.0** | ✅ |
| `est-bois` (service+chapel) | **+0** | +1 | **0.00 MB** | **0.0** | ✅ |
| `est-bois` (ballroom) | **+0** | +1 | **0.00 MB** | **0.0** | ✅ |

The arguments are not hardcoded in the probe — they are **parsed back out of the live material's
own `name`**, which *is* the baker key, and handed straight to the maker. The material that comes
back has the identical name, so the round trip is exact. (Rule 4, 2026-08-11: an instrument that
re-derives what it measures will agree with it. This one asks the game.)

### C5 — the price of getting it wrong, which is the number a build slice needs

Perturbing one scalar (`ws.paper`'s `repeatX` by 0.001) costs **1 bake · 16.08 MB VRAM ·
9–14 ms**, three runs.

🎯 **Note how SMALL that is, and why.** The baker's expensive term is the first D3D compile of a
surface shader (`materials-local.js`'s own header: eleven local surfaces = 7.8 s, the walnut and
marble family = most of 54 s). A *second* bake of an *already-compiled* surface is a
`RawShaderMaterial` with byte-identical source, so three reuses its program and all that is left is
one render + one 4-texel readback + a mip chain: **~11 ms**. So even the fully-botched form — six
coats, none of them matching their room — is **~96 MB and ~70 ms**, not seconds.

**Whole-page context, for scale:** 75 bakes · 320 cache hits · **672.3 MB VRAM** · **39.1–41.6 s of
bake time**, i.e. the bake is already ~40 % of a ~100 s cold boot. A per-room coat adds **0.0 %**
of it, and even the botched form adds **0.17 %**.

### C6 — where it lands relative to John's five-second freezes

**3.0 s of live play, bakes 75 → 75 (+0).** Every bake in the page happens during construction —
inside the loading screen, not inside a frame the player is looking at. A coat built where the
current one is built (`wall.js`'s `DestructibleWall` constructor, line 878) inherits that.

⚠️ **The one way to put a bake inside a freeze: build the coat lazily, on first damage.** Don't.
C5 prices that at ~11 ms + 16 MB *per face* on the worst frame in the run — the same frame
`instancing-1` refused to allocate on, having measured a first-draw upload there at 33 ms.

---

## 4. Is there a cheaper shape? — three were considered; the cheapest is also the simplest

| shape | programs | bakes | VRAM | look |
|---|---|---|---|---|
| **(i) N materials, one class, per-room textures** | **+0** | **+0** | **+0** | exact in 5/6 rooms; gallery gains a 0.02 wax |
| (ii) N materials, each room's own maker | +1 in place / ~+6 boot | +0 | +0 | exact in 6/6 |
| (iii) one material + an atlas / UV offset | +0 | **+1** (the atlas) | **+16 MB** | needs a new bake, and re-bakes when a room's paint changes |
| (iv) one material + an instanced attribute | n/a | n/a | n/a | **impossible here** |

**(iii) is worse, not cheaper.** An atlas is a *new* baked texture set that does not exist in the
cache, so it is the one shape that actually pays C5's 16 MB — and it decouples the coat from the
room's wall bake, which is the exact property that makes (i) free and that `wall.js`'s header calls
"the whole point". It also loses `repeat`-based tiling at the atlas seams.

**(iv) cannot be built.** A per-face material is *required* independently of the coat: `wall.js`
line 860 — *"the break uniform lives on the material, so panels must not share instances or one
hole appears in all of them at once."* Every free face already owns its own material and always
will. **A per-room coat therefore adds no material instances at all — it changes which textures the
28 instances that already exist are pointing at.**

### ✅ Recommendation: **(i)**, and the edit is small

1. **`estateSkinMat(opts)` already takes `opts` and spreads them over the hardcoded boiserie
   arguments** (`wallstages.js:905`). For service, chapel and the ballroom that is literally the
   whole fix, and **A3 measured it at +0 programs**.
2. For the studies and the gallery the maker is a different function, so the coat must be built
   from the **bake** rather than from the maker — `material.userData.bake` is exactly the
   `{map, orm, normalMap}` set the baker returned, and it is already on every room wall material.
   Build one `MeshPhysicalMaterial` from it with `clearcoat` copied from the room's wall (0.55 for
   the studies) or set to a token 0.02 for the gallery. **A1 and A4 measured both at +0.**
3. **The plumbing exists and it is one line.** `room.js:311/364` sets `p.ownerSpace = byId.get(def.a)`,
   and `dig.js:665` makes `def.a` the room a face's side actually looks into. `binMaterials(m, sp)`
   already returns that room's `wall`. A coat table keyed on the owner space is a lookup, not a
   refactor.

### 🚨 Two hazards a build slice must not walk into

- **Do NOT hand the room's `mats.wall` INSTANCE to the coat.** `applyBreakMask` mutates the
  material it is given (defines, `onBeforeCompile`, uniforms) and `pinProgramKey` redefines a
  property on it. Passing the shared `kit:wall` material would break-patch the whole room's wall
  bin. Call the maker again — it returns a **new material sharing the cached textures**, which is
  free (B1) and is what `estateSkinMat` already does.
- **Do NOT reach for a cache key.** If a future coat ever needs to emit *different source* per
  room, the discriminator goes in `material.defines` (C2: +1, and it is hashed ahead of the custom
  key), never in `customProgramCacheKey` — `patchForScreenAO` would discard it anyway, and a
  per-panel key is `progkey-1`'s 1077-program defect by another name.

### One taste call, priced, for John and not for a builder

The gallery's own wall has **no clearcoat**. Its coat can either

- **join the one family** (clearcoat 0.02) — **+0 programs**, and the coat is very slightly
  glossier than the paper beside it; or
- **match exactly** (`MeshStandardMaterial`) — **+1 program in place, ~+6 at boot, ~0.6 s of cold
  boot**, and the coat is the paper to the bit.

**~0.6 s against a ~100 s boot is not a veto.** It is 0.6 % of boot for one room's specular
response, and the honest framing is that it is a look question with a small price tag, not a perf
question. **I have not looked at a picture of either.** Nothing here judges the look, and a coat
critic should see both before this is decided.

---

## 5. What this brief and the record got wrong

1. ⚠️ **"Same shader with a different TEXTURE is one program; a different shader is not" — right,
   but "a different shader" is not what you would guess.** The four rooms use four genuinely
   different *surface* shaders (`BOISERIE_SURFACE`, `WALLPAPER_SURFACE`, `WALNUT_SURFACE`) and
   **three of the four are the same program**, because those shaders run at BAKE time. The thing
   that splits a program is the *material class*, which is invisible in the room tables and lives
   one argument deep in each maker.
2. ⚠️ **"A per-room coat is where the BAKE RISK lives" (resume item 2, `dressbin-1` §4.1).**
   Measured: the bake risk is **zero**, and even the botched form is ~11 ms and 16 MB per room.
   The real exposure is one program family and one line of material class.
3. ⚠️ **`dressbin-1`: "one more `boiserieMat` cache key per room (six keys)".** It is **four
   distinct bakes, not six** (the studies share; service and chapel share), **none of them new**,
   and two of the four are not `boiserieMat` at all.
4. ✅ **HANDOFF's "213 programs" is stale and it is not this slice's doing — this tree reads 231**,
   reproducing `_slab1-boot.mjs`'s recorded 231 to the digit across four runs. Reported, not chased.
5. ⚠️ **`wall.js`:867's *"`estateSkinMat()` calls `boiserieMat` with `room.js`'s exact `mats.wall`
   arguments"* is TRUE and its conclusion is what is stale** — it is `room.js:3159`'s arguments,
   and four of the six rooms stopped using that line when `?estate=port` landed. The "no extra
   bake, no extra VRAM" half of that comment survives a per-room coat unchanged; B1 is the receipt.

---

## Contracts

⚠️ **These were PART I's contracts, when the slice was read-only.** PART II's are above and they
supersede them. `src/game/room.js`, `src/destruction/debris.js`, `views/game.js`'s `onChunk`,
`src/materials/breakmask.js`, `src/game/wallinstances.js`, `tools/mapdesigner/**`,
`harness/_ap3-*.mjs` and `harness/scenarios/_dress1-skin.mjs` were **read only throughout**.

`_coat1-programs.mjs` on the shipped build: **19 passed · 0 failed · 0 skipped** on
`--q "seed=s4"`, **9 passed · 0 failed · 2 skipped** on the null arm `--q "seed=s4&dig=0"`.
**Seven runs in total**, five on the damage arm and two on the null arm, across three states of
the file as arms were added (13 arms → 15 arms → 15 arms + the console control, reporting 16/0/0,
18/0/0 and 19/0/0). ⚠️ **Only the last of each pair is a run of the file as it now stands** — but
`programs 231` and **every program delta reproduced to the digit on all five damage-arm runs**,
which is the number this report rests on. **One uninterrupted session · 1 navigation** on every run
whose full tail was read.

### The controls, and every one runs on every run

- **C1** a unique `customProgramCacheKey` must move the counter by **exactly +1**. (+1 ✅)
- **C2** a novel `defines` entry must move it by **exactly +1** — this is the mechanism
  `progkey-1`'s whole collapse rests on. (+1 ✅)
- **C3** the same textures, defines and key in a `MeshStandardMaterial` must move it by **exactly
  +1**. 🎯 **Without C3, A1's zero is worthless** — it is indistinguishable from a probe whose
  meshes never drew. (+1 ✅)
- **C7** the same coat at `clearcoat: 0` must move it by **exactly +1**, proving the boundary is
  clearcoat *presence*. Without it, A4's zero would be unfalsifiable. (+1 ✅)
- **C4** every arm must REVERT — dispose and the count returns to its start. 15/15 reverted, so no
  arm can hide behind a program another arm compiled, and the results are order-independent.
- **C5** the bake counter must move for a deliberately-perturbed argument set, and that delta is
  the price of getting a coat's arguments wrong. (+1 bake, 16.08 MB, 9–14 ms ✅)
- **C6** no bake during play (+0 over 3.0 s ✅), with C5 as the arm that makes it move.
- **CONSOLE** the probe's arms emit **5** `THREE.WebGLProgram … VALIDATE_STATUS false` warnings and
  they are the probe's, not the build's: **0 before the arms** on every run, and **0 for the whole
  run on the null arm**, which builds no ad-hoc material. Asserted, so a real boot error can never
  hide in the probe's noise. It cannot touch the numbers — a program delta is over
  `getProgramCacheKey`, which three computes *before* it compiles anything.

### What I did NOT measure, stated as a gap

- **No picture of any coat.** Every number here is a program count, a bake count or a byte count.
  The gallery's 0.02-clearcoat option and the per-room coat generally are **look** questions and a
  critic must see them. `_dress1-skin.mjs`'s `LOOK=` arm is the tool that already parks and
  photographs a named face.
- **No timed cold boot.** The ~0.6 s figure for the A2 form is arithmetic from this page's own
  program histogram × `progkey-1`'s 106 ms/program. Timing it needs a source edit.
- **No GPU-time measurement.** A per-room coat changes no draw call (`dressbin-1`: +0) and no
  material count, so there was nothing to price — but that is an argument, not a measurement, and
  it is stated as one.
- **The per-CELL erosion question `dressbin-1` left open** — whether hiding a *partial* contiguous
  run inside a merged bin stays 0 calls — is untouched here. It is still the first thing the build
  slice must measure.
