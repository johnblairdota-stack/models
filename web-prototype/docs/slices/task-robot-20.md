# Slice: `char.turnaround` — the base robot, round 20

**Owner for this slice:** one agent, run alone. **Files you may edit — nothing else:**
- `src/characters/unit4h.js`

Do not touch `_studio.js`, `robot.js`, `hunter.js`, `src/game/*`, or any gadget file.

Where a number is given, use that number. **If you find a stated fact is wrong, say so in
your report rather than diverging silently.** Three builders in a row have done that and all
three were right — one found two constants no code read, one predicted a fix would fail, one
caught a boot sinking through the floor. It is the most valuable thing you send back.

Ranked from `critic-robot-19` (WEAK 53, **down** from 58). **Five changes. Do not add a
sixth.** Material/specular is the critic's #6 and is round 21 — it needs shared files.

> **Context you need:** round 18 tried to fix the limbs and made them worse. This round
> reverses that specific decision. Two of the five changes below are undoing something I
> specified wrongly, not building on it. Read change 1 carefully before starting.

---

## 1. Limbs — revert the two-pod split; make them FLAT panels with a hard seam

> "Thighs/knees/shins now read as a **stack of soft bulbous pods joined by thin chrome collar
> rings** — a marshmallow/beanbag stack, not the art's **flat tapered armor panels with a
> hard seam**. The 'two plates with a gap' claim is technically true but produces the wrong
> silhouette entirely."

Round 18 split each shell into two tapered rounded plates with a gap. The gap landed exactly
as specified — **the specification was wrong.** Two rounded volumes with a space between them
read as pods however well they are executed. The art's limb is *one* flat-faced tapered panel
with a crisp seam line across it.

**Go back to a single shell per segment, and get the panel read from LOW CORNER RADIUS
instead of from a gap.** Radius is what has been making these read as soft.

```js
// thigh — one panel, flat faces, hard edges
const thighGeo = taperY(
  roundedBoxGeometry(w(W.thighR * 1.62), thighLen * 0.80, w(W.thighR * 1.72), w(0.014), 3),
  0.78, 1.06);
const thigh = mesh(thighGeo, mats.shell, `thigh${side}`);
thigh.position.y = -thighLen * 0.50;

// shin — same treatment
const shinGeo = taperY(
  roundedBoxGeometry(w(W.shinR * 1.90), shinLen * 0.97, w(W.shinR * 1.95), w(0.012), 3),
  0.72, 1.04);
const shinShell = mesh(shinGeo, mats.shell, `shin${side}`);
shinShell.position.y = -shinLen * 0.52;
```

Corner radius drops **0.038 → 0.014** and **0.032 → 0.012**. That is the whole point of this
change: flat faces with defined edges instead of rounded pods.

Delete `thighUpper`/`thighLower` and `shinUpper`/`shinLower` and the `parts.thighLower*` /
`parts.shinLower*` keys round 18 added. `parts.thigh${side}` and `parts.shin${side}` point at
these single shells again. (A previous builder verified nothing outside `unit4h.js` reads
`parts.*` at all — `collapseDrawCalls` merges the meshes and everything downstream walks
`unit.joints` — so this restructure is safe.)

**Then add the seam** — a thin dark band across each panel, which is what makes it read as
plating rather than a slab:
```js
// thigh seam, slightly proud of the shell so it catches its own shadow line
const tSeam = mesh(roundedBoxGeometry(w(W.thighR * 1.68), w(0.005), w(W.thighR * 1.78), w(0.002), 1),
  mats.gap, `thighSeam${side}`);
tSeam.position.y = -thighLen * 0.45;
hip.add(tSeam);

// shin seam
const sSeam = mesh(roundedBoxGeometry(w(W.shinR * 1.96), w(0.0045), w(W.shinR * 2.01), w(0.002), 1),
  mats.gap, `shinSeam${side}`);
sSeam.position.y = -shinLen * 0.42;
knee.add(sSeam);
```

**Verify by looking, front and profile.** The target read is one continuous tapered limb with
a crisp line across it — NOT two lumps. If it still reads as segments, the seam is too thick;
thin it rather than moving it.

---

## 2. Ear disc — too big; it is winning the profile silhouette

> "A deep, proud chrome ear-disc/lens now **dominates the profile silhouette**, meeting a thin
> sliver of the actual blue visor at a hard flat seam. Art shows the opposite: the **visor
> dominates** and curves continuously, ear-dial as a small secondary detail. Arguably worse
> than the old flat-chamfer failure since now the wrong element wins the silhouette."

This is the third consecutive failure of the profile check, each for a different reason. The
ear was sized at `0.046H` in round 15 to fix it being invisible, and overshot.

Everywhere the ear is built, `0.046 -> 0.032`:
- the boss cylinder radius
- the `driveDisc` radius
- the `boreDisc` radius stays proportional (`* 0.30` of the disc radius)

Keep the boss and the `x` offset logic; only the radii shrink. The ear must still read as a
ring with a dark hub — it just must not out-mass the visor.

**Settle it with the profile crop**, which is the only view that has ever decided this:
```bash
node harness/shoot.mjs --view char.turnaround --crop 690,190,180,150 --out "C:/Users/John/AppData/Local/Temp/prof.png" --quiet
```
Target: the blue visor is the dominant feature of the head in profile; the ear is secondary.

---

## 3. Knee — the ring must FRAME the kneecap, not sit beside it

> "The chrome ring is a generic hinge collar below the ball, **not a ring framing a distinct
> kneecap plate.** Ball itself is still nearly featureless."

`ART_MANIFEST.md` is specific: *"knee is a ring disc … with a white kneecap plate over it on
the front view."* The ring currently faces sideways (`driveDisc` builds facing +X), so from
the front there is nothing to frame anything.

Turn it to face front and seat the kneecap concentrically inside it:
```js
kd.rotation.y = Math.PI / 2;                    // face +Z instead of +X
kd.position.set(0, 0, w(W.thighR * 0.28));
kBore.rotation.y = Math.PI / 2;
kBore.position.set(0, 0, w(W.thighR * 0.28));

const cap = mesh(blob(w(0.030), w(0.032), w(0.012), 18), mats.shell, `kneeCap${side}`);
cap.position.set(0, 0, w(W.thighR * 0.52));     // concentric, proud of the ring
```
`kneeDiscR` stays `0.062`.

This deliberately trades the profile read for the front read, because the manifest and the
critic both describe the front. If the knee ends up looking bare in profile, **say so** —
that would mean the art needs both and it becomes a round-21 item.

---

## 4 & 5. Boots — restore the ankle collar, and get the sole back

These two interact; do them together.

> "**Boots: size fixed, structure not.** Genuinely larger (real fix), but a single featureless
> blob — no sole, no toe cap, no strap."
> "**Ankle collar tradeoff confirmed net-negative.** Shin-to-boot is now a plain white blend,
> no metal band. That collar was one of the leg's only material breaks."

Round 18 set `bootH = 0.095`, which does not fit between the floor and the ankle collar. The
builder correctly grounded the sole and the collar got covered. The critic has now judged that
trade and it lost.

```
bootH: 0.095 -> 0.078
```
That reopens roughly `0.017H` of vertical room. Keep the sole grounded exactly as round 18
left it — that part was right and it is the one thing that must not regress.

With the room recovered:
- the chrome `ankleCollar` / `ankleStack` band must be **visible again** between shin and
  boot. Check it in the profile crop.
- the **sole must read as a distinct dark slab** below the white upper, not a buried sliver.
  Round 18 found the sole spanning world Y `-0.062..-0.120`, entirely below the floor, because
  the boot was anchored from the top. It is now anchored at the sole; keep that.
- the **toe cap** should read as a separate moulded part catching its own highlight.

A previous critic reported sole, toe cap and collar as entirely absent and **that report was
wrong** — I cropped the foot myself and all three existed, just too small. Do not re-add them.
This is about size and clearance only.

Settle it with a foot crop and a profile crop.

---

## Presentation, traps, verification, regression gate

**Read the corresponding sections of `docs/slices/task-robot-18.md` and follow them** — they
have not changed. Do not touch `envIntensity`.

Two traps that bit this file specifically, both now written into the source:
- **`bendOutZ` takes a `dir` argument.** It defaults to `-1` for the back plate; the faceplate
  passes `+1`. The wrong sign pulls a plate's centre into the shell and splits a face into two
  crescents. Do not call it without thinking about which way the part faces.
- **Relief deeper than its own ring pitch reads as a spiral off-axis.** Keep any stepped detail
  under about half the step spacing.

Verification crops that actually settle each change: **front + profile** for change 1,
**profile** for change 2, **front knee crop** for change 3, **foot + profile** for 4/5.

```bash
node harness/shoot.mjs --view char.turnaround --view hunter.3 --view gadget.nailgun --view limb.detach --view game.play
node harness/audit.mjs --render
```
Perf: pin `--extra "quality=medium"`, take several samples, report raw numbers plus the budget
the harness prints. GPU sits on the line (1.35–1.45 ms vs 1.389 ms). Change 1 **removes** two
meshes per leg and adds two thin seams; report the triangle delta.

**You may not score your own work.** Do not run `status.mjs set`. Ceiling is PASS; only a
`critic-*` sets WOWED.
