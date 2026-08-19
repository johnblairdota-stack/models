# Slice: gadget limbs must READ as replaced limbs

**Files you may edit — nothing else:**
- `src/views/gadget.js`
- `src/gadgets/index.js` (only if a gadget's local origin or axis is genuinely wrong)

Decisions here are made. If a stated fact turns out to be wrong, say so in your report
rather than diverging silently.

---

## The problem, verified twice

An independent critic reported, and the project lead then confirmed by looking at the
render: **four of the five gadgets present as an oversized prop floating in space beside
an unmodified-looking robot.** The view overlays the caption *"REPLACES A LIMB — NOT
CARRIED"* — text asserting exactly what the pixels contradict.

This is the game's central idea. Limbs are the HP system, the inventory and the loadout
at once; equipping the nail gun costs you an arm. If the showcase for that reads as a
robot holding a prop, the idea has failed in the one place it is being demonstrated.

**`gadget.skates` is the exception and it is your model.** It modifies both legs on the
character's own body, and the critic singled it out as *"the one piece correctly
demonstrated in-place… structurally the right presentation."* Make the other four match
its approach.

## What is actually wrong — I diagnosed this, start here

The mounting itself works. `hideLimb(unit, 'elbowL')` hides the forearm and hand, and the
gadget is parented to `joints.elbowL` after that, so it is genuinely attached. Two things
then break the read:

1. **Scale.** `gadget.root.scale.setScalar(1.3)` sits on top of dimensions that were
   already generous. In the nail gun render the gadget is roughly as long as the robot's
   entire torso. In the reference (`1785313925351.png`) it is about forearm length plus
   the magazine — large and chunky, but unmistakably an arm.
2. **Orientation.** It projects sideways across the body instead of running down the
   forearm axis. `index.js` documents each gadget's origin as the attachment point with
   `-Y` running down the limb and `+Z` forward, so a gadget hanging correctly should
   continue the arm's line, not cross it.

## What to do

1. **Drop the 1.3× scale** and size each gadget against the forearm it replaces. The
   silhouette test: from the front, the gadget plus upper arm should read as one limb,
   not as an arm and a separate object.
2. **Orient along the limb.** The gadget should continue the forearm's direction. Pose the
   arm so the gadget is clearly visible against the background rather than against the
   torso — the reference shots hold it slightly away from the body with the working end
   readable.
3. **Show the join.** The wrist collar where gadget meets arm is what proves replacement.
   Frame so it is visible, and make sure the hidden forearm leaves no floating stump or
   visible gap.
4. **Delete the caption.** `labels()` currently prints "replaces a limb — not carried". If
   the picture needs a caption to make its point, the picture has not made its point. Keep
   the gadget's name; drop the assertion.
5. **Frame per `BUILD_GUIDE.md` §4b.** Nothing floats, nothing cropped, no clipping to
   white, camera distance from the formula. A 1.7 m subject at fov 33 needs ~3.5 m.
6. **Consider a second angle.** A 3/4 view showing the gadget as part of the arm's
   silhouette may sell it better than the straight-on shot. Judge from the render.

## Also fix, if it is cheap while you are here

The critic found `gadget.nailgun`'s heat ramp **runs backwards**: the chrome breech collar
at the arm end glows white-hot while the muzzle fades dark. Reference and intent are both
red at the breech, white at the muzzle. `hotSteel()` in `src/gadgets/gadgetmat.js` takes a
`half` parameter to normalise the ramp along local Y — the sign or the axis is inverted.
**Only touch this if it is a small change**; the mounting read is the priority, and
`gadgetmat.js` is outside your two owned files, so flag it rather than expanding scope if
it turns out to be involved.

## Verify

```bash
node harness/shoot.mjs --view gadget.nailgun --view gadget.oil --view gadget.grapple --view gadget.ball --view gadget.skates --review 1280 --seconds 1
node harness/sheet.mjs --img progress/shots/gadget.nailgun.review.png --img progress/shots/gadget.oil.review.png --img progress/shots/gadget.grapple.review.png --img progress/shots/gadget.ball.review.png --img progress/shots/gadget.skates.review.png --out C:\Users\John\AppData\Local\Temp\g.png --cols 3 --width 1700
node harness/audit.mjs --render
```

**The test to apply to every one of the five:** cover the caption and ask whether a
stranger would say this robot's arm has been replaced, or that it is holding something.
That is the only question this slice is about.

Compare against the locked art — one sheet, read once:
```bash
node harness/sheet.mjs --img "C:\Users\John\Documents\Run Robot Run\Dev Art\1785313925351.png" --img "C:\Users\John\Documents\Run Robot Run\Dev Art\1785315723570.png" --img "C:\Users\John\Documents\Run Robot Run\Dev Art\1785320715285.png" --img "C:\Users\John\Documents\Run Robot Run\Dev Art\1785320614586.png" --img "C:\Users\John\Documents\Run Robot Run\Dev Art\1785314396477.png" --out C:\Users\John\AppData\Local\Temp\gref.png --cols 3 --width 1700
```

Do **not** pass `--perf` — other agents may be rendering.

## Rules that have cost this project real time
- Never put backticks inside a GLSL template literal — it terminates the JS string.
- Never name a GLSL variable with a reserved word (`cast`, `sample`, `filter`, `input`,
  `output`, `matrix`, `texture`, `buffer`).
- Prefer `Edit` over scripted string replacement — `Edit` fails loudly on a bad anchor.

## Record
```bash
node harness/status.mjs set gadget.nailgun --round 16 --verdict WEAK --score N \
  --owner gadget-mount --summary "..." --wins "..."
```
**Ceiling is PASS — only a critic sets `WOWED`.** Do not re-score your own fix generously;
a builder here has already had a claimed fix proved wrong by a critic.

## Report back
For each of the five, whether a stranger would now read it as a replaced limb, what you
changed, and anything you could not fix. Include the before/after sheet.
