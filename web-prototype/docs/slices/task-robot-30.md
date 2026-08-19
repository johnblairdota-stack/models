# Slice: `char.turnaround` — round 30

**Owner:** one agent, run alone, on Opus. **Files you may edit — nothing else:**
- `src/characters/unit4h.js`

Do not touch `robot.js`, `_studio.js`, `hunter.js`, `src/game/*`, or any gadget file — other
agents are in the materials and the network layer this round.

Ranked from `critic-robot-29` (WEAK 54, **down** from 58). Its aiming answer was explicit:
**proportion and placement, not surface detail or material.**

**Two of these are repairs to damage round 28 did.** Read item 2 before item 1.

**The design is yours where a number is not given.** Four specs written from verbal descriptions
on this piece were provably wrong; the rounds that handed design authority to the agent produced
the breakthroughs. **If a stated fact here is wrong, say so rather than diverging silently** —
seven agents in a row have done that and all seven were right.

---

## 1. The joint family — build the art's ACTUAL joint, and use it for BOTH elbow and knee

`critic-robot-29`, having compared them directly:

> "The elbow is a smooth dark bulbous hub with a small bolt-disc; the knee is a lighter banded
> ring with a rectangular vent slot and a separate small disc — **unrelated shapes**. Worse,
> neither matches the reference: its own knee/hip-in-profile support sheet shows **elbow and knee
> sharing one construction — a knurled ribbed cylindrical collar plus a face-on bolt disc**,
> present on both. The round unified nothing."

John's direction was *"the elbow should have the rounded joint — almost the same as the knee, just
without the kneecap."* **He was right.** Round 28 unified them onto `kneeHub`, which is the wrong
shape, and the knee was already wrong against the sheet.

So: **measure the art's joint and build it once**, then use that one construction at both the
elbow and the knee. Sources — `1785308800211.png` (side plank, knee and hip in profile) and the
turnaround's own back figure, where the critic measured the elbow at crop `1225,340,90,90`.

The read to hit is a **knurled ribbed cylindrical collar with a face-on bolt disc** — ribs
running around the collar, a distinct disc on the outboard face. The knee additionally carries
its white kneecap plate on the front; the elbow does not. That is the only difference.

**Delete whatever is left unused afterwards** rather than leaving it dead — `W.bootH`/`W.bootW`
sat unread for many rounds and every attempt to use them silently did nothing.

⚠️ **Watch relief/pitch.** Knurling is stepped detail, and relief deeper than its own step
spacing reads as a **spiral** when seen off-axis — that cost this project a multi-round
misdiagnosis. Keep total relief under about half the rib spacing.

⚠️ The elbow hub must stay inside `mountSleeve()` in `gadgets/index.js` (radius 0.040 H), which
covers it. Verify in a `gadget.nailgun` crop that nothing pokes through.

## 2. REGRESSION — the profile forearm collapsed into the torso

> "Reference forearm bends forward, hangs clear of the body with an open hand; render forearm is
> almost entirely hidden behind the torso, a thin hook-shaped sliver. **Measured**: `measure.mjs`
> figure 2 reports **NO DAYLIGHT between arm and torso** where the reference has a clear gap,
> raw-width deltas −44% to −60% through that band. Likely a side effect of the elbow hub rebuild."

Round 28 moved the elbow down 0.047 H and added a hub. Something in that pushed the forearm
against the torso in profile. **Diagnose it before changing anything** — it may be the hub's
size, the new arm split, or the forearm's rest angle.

Verify with the tool, not by eye:
```bash
node harness/measure.mjs --img progress/shots/char.turnaround.png --ref "C:/Users/John/Documents/Run Robot Run/Dev Art/1785277053522.png"
```
**Figure 2's `arm gap` row must stop saying NO DAYLIGHT.** That is the pass condition for this
item, and it is a number rather than an opinion — use it.

## 3. The upper-arm segment is being eaten by the hub

> "Claimed 'distinct chrome upper-arm segment' isn't visible in front or profile — the mint cap
> sits almost flush against the new elbow hub. The 0.047 H freed by moving the elbow down is
> being eaten by the hub itself."

This is John's original note re-opening. Round 28 correctly re-split the arm at the sheet's ratio
and then spent the gain on hub. Item 1 changes the joint's shape anyway, so **do item 1 first and
re-check this** — a correctly sized collar may restore the run on its own. If it does not, the
segment has to win: a visible chrome upper arm between mint cap and elbow is the point.

## 4. The ear disc — it is too DARK, not too big

Seventh consecutive round the profile fails. Rounds have tried shrinking the ear (0.046→0.032)
and flattening its relief (0.42→0.16). Both helped slightly; it still dominates.

**Measurement says the visor is not the problem.** Round 28 measured profile blue depth ÷ head
depth at **0.24 against the sheet's 0.17** — we already carry 41% *more* blue in profile than the
reference. Widening it moves away from the sheet.

What has never been tried: **the art's ear is a BRIGHT annulus; ours is a dark bullseye.** Round
28's own builder said so — *"the ear still reads darker than the sheet's bright annulus."* The
hierarchy failure is one of **contrast**, not area. A bright ring recedes; a dark one advertises
itself.

Crop both and compare tone directly before deciding what to change. If the fix genuinely needs a
material change rather than geometry, **say so and stop** — `robot.js` is not yours this round.

## 5. The hip connector overcorrected

> "The oversized-plate problem is genuinely fixed (small, correctly placed) but now reads as a
> **small dark smudge rather than a bearing** — no bolt head, rings, or knurling."

John's note was right and round 28 went too far the other way, 0.088 → 0.028 H. It should read as
the bearing the leg turns on. Note the art's hip is likely the **same joint family as item 1** —
check that before inventing a third construction.

---

## Perf — this round must not add net cost

Currently **600 draw calls / 625**, **879,954 triangles / 900,000**, GPU **over budget in 4 of 5
warm samples** (median 1.44 vs 1.389), and CPU exceeded twice — the first time that has been
observed. Headroom is nearly gone.

Item 1 replaces geometry rather than adding it, so this is achievable — but **budget deliberately**
and report the deltas. `collapseDrawCalls` emits one merged mesh per material per joint, and the
scene renders in **four passes**, so a new material on a joint costs **16** draw calls across the
sheet, not 4.

If you cannot land all five items inside budget, **land fewer and say which you dropped.** An
over-budget build is a failure regardless of how it looks.

```bash
node harness/shoot.mjs --view char.turnaround --perf --extra "quality=medium"
```
Discard the first (cold-cache) run. Take several samples — GPU here is bimodal on clock state.

## Verification

Run BOTH instruments and quote the numbers — you are the second agent to have them:
```bash
node harness/measure.mjs --img progress/shots/char.turnaround.png --ref "C:/Users/John/Documents/Run Robot Run/Dev Art/1785277053522.png"
node harness/overlay.mjs --img progress/shots/char.turnaround.png --ref "C:/Users/John/Documents/Run Robot Run/Dev Art/1785277053522.png" --out progress/overlays/char.turnaround.png
```
Silhouette IoU is **81.8%** — raise it or explain why it did not move. Regenerate the overlay at
the end so the board is not showing a stale one.

Note the tools self-report joint-trough detection as UNRELIABLE when left/right counts disagree.
Respect that flag; do not quote a number the tool has disowned.

## Regression gate — mandatory

```bash
node harness/shoot.mjs --view char.turnaround --view hunter.3 --view gadget.nailgun --view limb.detach --view game.play --view char.locomotion
node harness/audit.mjs --render
node harness/shoot.mjs --view char.turnaround --extra "knee=0,0.7,1.4,2.0"
```
`char.locomotion` holds a PASS and bends both knees and elbows — item 1 puts it directly at risk.
The knee-flex probe drives the run cycle's worst case. `audit --render` sometimes reports a view
as failed that renders fine alone and self-labels those transient; re-shoot individually before
reporting one as real.

Keep `buildUnit4H`'s exported shape stable: `root`, `joints`, `parts`, `limbs`, `sockets`,
`setPose`, `detach`, `attach`, `isAttached`, `height`, `materials`.

**You may not score your own work.** Do not run `status.mjs set`.
