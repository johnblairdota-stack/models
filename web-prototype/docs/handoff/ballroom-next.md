# Ballroom — the next round

**Written 2026-08-28, after the port landed as `8da0b8f` on `main`.** Everything below is either
measured or read off a source line. Where something is a guess it says so.

The ballroom is the set for **most of the night** — lobby, intros, recap, debrief, reckoning and
vote all happen in it. It is worth more care than any other room in the game.

---

## Read this first, or you will redo settled decisions

| Decision | Status | Why |
|---|---|---|
| The game room is **NIGHT**; the showcase is **DAYLIGHT** | John's call, settled | Do not port the sun. "The game is darker" is not a defect. |
| **Planar reflections are NOT ported** | Settled, with numbers | Free in the showcase only because that camera never moves — one render, frozen at build. In a walkable room each is a full scene re-render *per frame*. The room already measures **2.24–2.28 ms against a 1.39 ms budget**. |
| Dust sheets, crates, spilled paper | Deliberately absent | The asset is a derelict hall. The game's ballroom is a working venue with a rug and chairs. |
| `views/room-ballroom.js` is **pinned** | Do not change its output | A pixel-diff gate plus a darkest-decile grade gate running **7.7 against a ceiling of 8.0**. Fold geometry was tried there once and reverted — it cost 0.35 of that 0.3 headroom. Everything you add must be **opt-in and default off**. |

### 🚨 The hard black point — this has cost two rounds already

The grade applies `col = (col − 0.5) * contrast + 0.5` **before** the toe, so **anything under
scene-linear ~0.030 clamps to literal zero**. No light, hemisphere or ambient term recovers it.
A mesh forced to *pure white* in the vestibule experiment still only read 43–63.

**Verify delivered pixels, never authored hex values.**

---

## DEFECTS — ranked. These outrank every gap below.

### D1 · The pier glasses read as blank pale slabs, brighter than the wall behind them
**Stations:** `arch`, `wide`, `mirror`, `floor` — eight plates, eye level, in the backdrop of the
vote. **The worst thing in the room.**

Not the un-ported reflection. `src/game/room.js` already substitutes a tuned dielectric
(`metalness 0.26`, `color 0xc1c5cc`) — and the comment above it records that the value was solved
by measuring plate luma against wall luma **at `ballroom.east`**. That measurement does not survive
delivery to the other wall: at `arch`/`wide` the end wall sits in shadow while the plates catch the
arch wash, so a value tuned to "match the boiserie" floats well above it.

Also `size: 512` across a 1.7 × 3.1 m plate at ~10 m has erased the foxing that was supposed to be
the drawing, so there is nothing in the plate but one soft env smear.

**Do:** re-derive the colour against the **end wall's** local value, and make the mottle survive at
distance (either `size: 1024` on the two end plates only, or push `fox` past 0.92). **Measure
delivered plate-vs-wall luma at `arch` and `wide`, before and after.** The previous derivation was
correct arithmetic against the wrong wall — do not repeat the shape of that mistake.

### D2 · Not one chandelier in the room is lit
**Stations:** `wide` (huge, foreground), `mirror`, `up`.

The fixture is one of the best-modelled objects in the game — brass ogee vase, faceted crystal
drops, eight scrolled arms, individually modelled candles. **Every candle is unlit.** Cold wax, no
flame, no halo, no hot core. The ironwork reads near-black because nothing is emitting inside it.

`src/lighting/ballroom-rig.js` builds all three with `intensity: 0, caustic: 0`, and
`grep -rn "setLit" src/` returns **no call site anywhere in the game** — only the showcase and the
definition. The candles, flames, halos and `setLit()` all live in `src/world/chandelier.js` and
default to `state.lit = 1`, so the flames *should* be drawing. Something between the merge/harvest
path and the frame is eating them.

**Do:** find out why. Keep the point lights at `intensity: 0` if you like — the budget argument for
that is sound — but the **emissive cores and additive flames must reach the frame**. Suspect the
additive bucket ordering in the fixture merge, and note the rig's own comment admits `update()` is
deliberately unwired. This turns three dark props into the only warm points in a night room.

### D3 · The marble chequer border is the brightest surface in the room
**Stations:** every one that sees floor. **This was introduced by the port — it is our own.**

The white tiles run near-clipping while the parquet sits mid-tone, so a hard black-and-white band
rings the entire room at the wall base and drags the eye straight off the players in the middle.
The black tiles also carry a splotchy mottle (`wear: 0.45` in `estateMarbleChequer`) that at TV
distance reads as smeared dirt rather than Nero Marquina veining.

The material is not wrong — Carrara against Nero Marquina is correct, and it works in the asset
because daylight lifts *everything*. Under the night grade nothing else competes with it.

**Do:** clone and darken so the white tile sits **under** the lit parquet, and cut `wear`. One
scalar, and it quiets the loudest distraction in every frame.

### D4 · Two chandeliers hang too low — delete them from the ballroom's dress
**Station:** `wide`. **John: "there are two placed chandeliers that are lower seen in wide. Delete
them from the ballroom spawn. the other two are part of the asset."**

Confirmed — there are **two independent sources** and only one belongs:

| Source | What it is | Verdict |
|---|---|---|
| `src/lighting/ballroom-rig.js` → `buildChandelier` at `P.chandelierZ` | The **asset's** crystal fixtures, hung off the order plan | **Keep** |
| `src/game/furn-layout.js:184` — `{ id: 'chandelier', copies: 2, place: 'hang' }` | A **catalog GLB prop**, `rrr_prop_chandelier_v1.glb`, `liftY: 2.85` | **Delete from the ballroom** |

`liftY: 2.85` is why they are low — they hang at 2.85 m in a **9.6 m** room. The catalog entry is
at `src/game/furn-catalog.js:29`; the ballroom binding is at `furn-layout.js:64`
(`chandelier: { rooms: ['ballroom'], … }`).

**Do:** drop the ballroom from that prop's room list. Leave the prop in the catalog — other rooms
may want it. Check nothing else depended on the count.

### D5 · A big blank square in the centre of the ceiling
**Station:** `up`. **John: "there is also a big blank square on the roof in the center of the room."**

Confirmed in the image: the centre bay is a **large flat cream panel** carrying a painted rosette
decal, with **no coffer beams crossing it** and no dome relief — while the surrounding bays do have
the beam grid. The asset puts a heavy gilt dome in every coffer and a modelled acanthus rose, plus
a chandelier hanging on a gold ring armature at that exact spot.

`src/world/kit.js` `cofferedCeiling` can already place the boss — it is gated on `o.boss !== false`.

**Do:** find why the centre bay has no beams (a rose/boss exclusion is the likely cause) and turn
the boss on. Lower priority than D1–D4 — nobody looks up at conversation height — but it is the
first thing anyone notices in a top-down or `iso` perspective, which are now live on the `P` key.

### D6 · Minor colour errors
- **Green/teal cast on the ceiling beams** (`up`): the left beam reads olive, the right teal,
  against cream pans. The asset's beams are gilt. Could be a coloured practical bleeding, could be
  a wrong key. Suspected, not diagnosed.
- **Two different window treatments on one wall** (`corner`): the left window has thin gold
  mullions, the centre has thick pale-grey ones. Looks like a material misassignment on one bay.

---

## NEW WORK — the golden skirting

**John: "there is also a golden skirting that traces the edges of the room that we need to add.
Its important that skirting doesn't block the arch way."**

This is a real gap and the constraint he names is exactly the trap.

**Where it went.** `src/game/room.js` passes `skirtLower: false` to `ballroomOrder`. So the room
loses `wallRun`'s **moulded gilt skirting** (55 mm proud, key `skirt` → `gilt`) and instead gets
`buildWall`'s own box — depth `o.t`, centred on the wall line, i.e. **flush, zero projection**, in
the grey stone bucket. Every wall base in the ballroom is a flat grey band where the asset has a
gilt moulding.

**🚨 Why you cannot simply set `skirtLower: true`.** Two separate problems, both already diagnosed:

1. **It double-draws with `buildWall`'s skirt and z-fights.** One of the two has to go.
2. **`wallRun`'s skirting is ONE continuous extrusion that openings do not cut.** It will run
   straight across the doorways — which is precisely John's constraint. This is not hypothetical:
   the dado rail did exactly this, crossed three doorways at 0.92 m, read as a barrier, and is why
   `dado: { end: false }` exists today.

**Do:** segment the skirting per opening. `buildWall` **already does this** — it emits this room's
skirting per wall SEGMENT, where it knows about the openings. So either
(a) teach `wallRun` to take the openings for its skirt run the way it already does for `clashes()`,
or (b) keep `buildWall` owning placement and give its skirt the gilt moulded profile instead of a
flush grey box. **(b) is smaller and reuses the segmentation that already works.**

Whichever you pick, the acceptance test is a photograph at the `arch` station showing gilt skirting
running to each jamb and stopping.

---

## GAPS — real, but every one ranks below the defects above

| Gap | Station | Note |
|---|---|---|
| **The end wall is a bald plaster field** | `arch`, `wide` | No dado, no skirting relief, no pilasters flanking the arch; panels are etched outlines with no bead. This is the backdrop of every conversation in the game. Deliberate today (`dado: { end: false }`) for the reason above — fixing it is the same segmentation job as the skirting. **Highest-value gap.** |
| **Curtains still read as red boxes** | `win`, `corner` | Flat `0xc02030`, hard edges, no fold shading, no valance. Shadow-casting was turned on and it is not enough. `room.js` already pre-authorises the next step: fold geometry, **game-only and default off**. Geometry is three axis-aligned boxes in `ballroom-order.js`. |
| **The parquet is matte** | `floor`, `wide` | No plank-to-plank variation, no sheen. Large area, so it reads bigger than its rank. The asset's floor carries the whole room's light. |
| **Coffers have no bosses, the rose no relief** | `up` | See D5 — same fix. |

---

## The one-sentence diagnosis worth keeping

> A ballroom at night is read almost entirely by **specular** — flames, gilt catching light, glass
> throwing a glint. The port carried the geometry and the albedo across and **dropped every
> highlight**. The two motifs meant to supply that glint are the mirrors and the chandeliers, and
> both currently deliver nothing.

Fix D1 and D2 and the room stops looking like a well-built model of a ballroom with the power cut.

---

## How to see what you are doing

**`harness/ballroom-compare.mjs`** shoots the asset and the game from **seven identical camera
stations**, resolved as fractions of each room's own bounds so the different room sizes cannot fake
a difference. `node harness/ballroom-compare.mjs [--only win,arch]`. Output in `progress/compare/`.

It exists because the show camera re-aims every frame, so nobody could stand in the same place in
both rooms — and "is it ported yet" was therefore answered from memory, and answered **wrongly at
least three times**. `?campose=x,y,z,tx,ty,tz[,fov]` is the pin that made it possible; it is a
developer INSTRUMENT, never emitted by a real TV slot.

**Perspectives:** `P` on a `?dev=1` TV cycles chase → wide → iso → top. The overhead two take the
roof off, so ceiling work is inspectable in play.

### Two instrument failures already paid for — do not repeat them
- **A rebuild mid-shoot contaminates a sheet.** One run came back with four stations on the old
  build, two on the new, and one pair split (game old, asset new). Freeze `dist` or do not rebuild
  while shooting.
- **A census that buckets by mesh NAME cannot tell "absent" from "merged".** The playable path
  merges fixtures into `fixture:brass/wax/crystal`, so a name diff reports 873 crystal pieces as
  missing when they are present. Triangle counts are the honest number.

---

## House rules for this codebase

- **`npm run gates:party` must exit 0.** Nothing is finished otherwise.
- **Every assertion ships with a control that would fail.** A gate whose controls stop failing has
  gone blind. Several controls written during the port caught real defects while being written.
- **Write `\r?\n` in every source-grep regex.** The checkout is CRLF.
- **Never let the literal `p.setInterconnect(null)` appear in `room.js`**, even inside a comment —
  `party-warm` W16c asserts its absence.
- **Verify, do not trust a comment.** Two agents contradicted each other on whether
  `views/game.js` assigns `scene.environment`; one trusted a stale comment that says it does not.
  It does, via `estate()` → `_studio.js`. That comment is the premise a material decision is
  documented on. **Fix it while you are in there.**
- Temp scripts live in `harness/tmp/` (gitignored) and get deleted.

## Known limitation, not a regression

The **arched surround is only drawn on one of the ballroom's four walls** — `ballroomOrderFor`
builds arches only from connectors on the `end` face. On seeds where the ballroom comes out
rotated, you get the wide 5.20 × 4.70 opening with no arch moulding round it. Generalising the arch
loop to all four faces is the fix; it was out of scope for the port.
