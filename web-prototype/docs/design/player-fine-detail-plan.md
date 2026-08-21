# How to get the fine detail onto the player

**The problem, stated once.** `docs/design/player-material-spec.md` asks for details that are
**finer than a bone**: a dark ring around the elbow actuator, two chrome rings at the wrist, a
chrome panel on the back of the calf, ventilation on the back of the head, ridges in the spine
chrome, a white round fixture front and back on each shoulder cap, exposed actuators at the elbow
and posterior knee, chrome showing in the foot crease.

The mask that delivered two-tone is driven by **skin weights**, and a skin weight is per-bone. It
can say "this is the forearm". It cannot say "this is a 2 cm band 3 cm below the elbow, on the
back". Every one of the details above needs the second thing.

---

## The key realisation

Each of those details is expressible as a function of two quantities:

1. **which bone owns this surface** — already available (`skinIndex` / `skinWeight`)
2. **where the surface sits WITHIN that bone's own frame** — not currently available

And (2) is **static**. Where a vertex sits relative to its bone does not change when the character
animates — that is the definition of skinning. So it does not need solving per frame, per pixel,
or in the shader at all. It can be computed once, on the CPU, at load:

```
aBoneLocal = skeleton.boneInverses[dominantBone] * vertexBindPosition
```

`boneInverses` is the bind-pose inverse the skinning system already stores. One `vec3` attribute,
one `float` attribute for the bone id, computed in the same pass that already walks the geometry.

Every detail in the spec then becomes arithmetic on `aBoneLocal`:

| spec item | expression |
|---|---|
| dark ring around the elbow/knee/ankle actuator | band on distance along the bone axis, near 0 |
| two chrome rings at the wrist | two bands at set distances from the hand joint |
| chrome panel on the back of the calf | band along the shin × **dot(normal, bone-local back)** |
| ventilation on the back of the head | stripes on the head bone × back-facing test |
| ridges in the spine chrome | repeating bands along the spine axis, back-facing only |
| white round fixture, front and back of the shoulder cap | disc: radial distance from the shoulder joint, both facings |
| chrome above/below/front/back/side of knee and elbow | signed distance band about the joint |
| teal only on the front/outer of the shoulder cap | facing test in the shoulder bone's frame |

**One mechanism covers the whole list.** That is the test of whether a plan is right.

---

## Why not the obvious alternatives

**Painted texture atlas.** Would work, and is how a studio would do it — but this body's UVs are a
CUBE PROJECTION with deliberate overlap (`tools/unwrap_player.py`: the shell pattern is procedural,
so two parts sharing uv space is free). A unique painted texture needs a **non-overlapping** unwrap,
so this means re-unwrapping first, then authoring or baking an atlas. It also turns every future
change from a parameter into a re-bake, and John iterates by eye. **Keep as the fallback for
anything the procedural route cannot reach.**

**More kit geometry for everything.** `mesh-identity.js` already adds real parts (ear discs, neck
column, mint caps, faceplate, wordmark) and skins them to the body, so this is proven. But a
recessed dark ring in a crease is a *hole*, not a part — geometry sitting proud of the surface is
the wrong answer for it, and adding a torus per joint is a lot of parts to place and keep seated.

**Regenerating the mesh with the detail modelled in.** Rejected: John has chosen this model.

---

## The split, by what each detail physically IS

**Recessed / painted — do these in the shader off `aBoneLocal`:**
dark rings at elbow, knee, ankle · darker creases at the hip and shoulder detach points · spine
ridges · head ventilation · chrome bands around knee and elbow · chrome calf panel · chrome waist
wrap to the small of the back · teal restricted to the front/outer cap · foot rubber.

**Proud physical parts — do these as kit geometry, which is already the kit's job:**
two chrome wrist rings · white round fixture on the shoulder caps · exposed actuator parts at the
outer/inner elbow and posterior knee · chrome showing in the foot crease · **the ear rebuilt as a
chrome RING with a white disc centre** (this one is entirely ours — the kit builds that part today
as a solid disc, so it is a shape change in code we own, not a mesh problem at all).

---

## What the WHOLE-REGION round already delivered (2026-08-16)

The reachable set is done and shipped in `src/materials/surfaces/robot.js`. The single `dark`
flag became a **per-bone family vector** — `uRRWFamW` is a `vec4[64]`, channels chrome / dark /
rubber / inner-face — so more than two materials now ride one mechanism. Delivered: forearms and
hands returned to WHITE, upper arms and waist to CHROME, feet to dark RUBBER, and teal restricted
to the cap's front/outer face by narrowing the swing window in `mesh-identity.js` to 0..105 deg.

Two findings that change what the rest of this plan should assume:

- **A FACING test did not need `aBoneLocal`.** The inner thigh is chrome on the inboard face only,
  and that was reachable with the world normal against the body's own left-right axis, derived per
  draw from the two upper-leg bones. Anything in the table below that is a pure DIRECTION test —
  "back-facing only", "front/outer" — can be done the same way, today, without the attribute. Only
  the items needing a POSITION along the bone actually require `aBoneLocal`.
- ✅ **A masked region inherits the WHITE SHELL'S baked texture — FIXED, AND THIS LINE WAS STALE.**
  It read: "upper-arm value spread is 110.7 against the art's 163.9 ... the largest remaining gap on
  the chrome". A later round closed it in the shader rather than in a tile — per-pixel turned
  machining (`?dlcturn=`), a chrome-only environment gain (`?dlcenv=`) and a ONE-SIDED contrast
  curve on the gathered radiance (`?dlccon=`), each with its own revert. `player-pipeline.md` now
  records chrome value spread **166.6 against the art's 163.9**.

  ⚠️ **This stale line cost a session's opening recommendation**: it was read as the highest-value
  next move, and the work turned out to be already shipped and already measuring. Nothing was built
  on it — the code was checked first. **Re-measure any number in this file before spending a round
  on it**; the pipeline doc is newer than this one.

## Order of work

1. **`aBoneLocal` + `aBoneId` attributes**, computed at load in `mesh-avatar.js`, with a control:
   a vertex on the forearm must report a bone-local position whose length is under the forearm's
   own length. If that fails, the frame is wrong and every detail built on it would be wrong in
   the same invisible way.
2. ✅ **DONE 2026-08-16 — and it came in as the WHOLE crease family rather than one ring**, because
   the elbow ring, the knee, the ankle, the hip detach and the shoulder detach are one expression
   with a different bone name in it: a dark band at one end of one bone. Building the elbow alone
   would have cost the same round and proved the same thing. `rrwBoneDetail()` in `robot.js` is the
   rule, `harness/evidence/_fd2-ring.mjs` its gate, `?dlringctl=1` the frame's control.

   ⚠️ **THE ATTRIBUTE IS `aBoneEnd`, NOT `aBoneLocal`, AND THE REASON IS INTERPOLATION.** A crease
   at the elbow is drawn on vertices owned by TWO bones, so a varying carrying raw
   `dot(aBoneLocal, axis)` interpolates 0.01 against 0.28 across the boundary triangle and the ring
   TEARS. `aBoneEnd = vec2(d, len - d)` — distance to each end of the bone — is continuous across
   the joint because both bones report ~0 there. Anything the rest of this list draws AT a joint
   wants the same treatment; anything drawn in the middle of a bone (the calf panel) can use
   `aBoneLocal` directly.

   ⚠️ **AND IT NEEDED TWICE THE WIDTH THE SPEC'S OWN 4 px FLOOR IMPLIES.** The first setting cleared
   the floor on paper, was correctly placed, differed from the pre-round capture in 0.141% of
   pixels — and was invisible to a human. The floor is a floor for a crease on flat white; on a
   curved limb the crease competes with the form shading already there.

3. ✅ **DONE 2026-08-16 — the rest of the shader list.** Chrome caps at elbow and knee, the chrome
   calf panel, the waist flexion ridges, the two wrist rings, the head ventilation. Two lessons the
   next feature on this mechanism should not re-learn:

   - **A DISTANCE-TO-A-FEATURE interpolates safely; a raw POSITION does not.** `aBoneEnd` was built
     to be continuous across a joint, so creases and caps need no gate. The waist ridges carry a
     PHASE, which is a position, and on triangles straddling the waist/chest handover it swept an
     arbitrary range and `fract()` drew a contour map of the interpolation — a chaotic MAZE across
     the whole upper back. Anything carrying a phase needs the interior gate the ridge block uses.
   - **A shared varying wants a SIGN or a per-bone scale, not a second array.** The panel channel's
     sign picks the calf window or the head's; the stripe channel carries its own pitch in metres,
     so one varying serves the waist and the head at different pitches. Three `vec4[64]` arrays is
     already 192 uniform vectors against a 256 floor — the next feature packs, or re-thinks.
4. ✅ **DONE 2026-08-16 — the kit-geometry list.** The ear was already a ring and had simply never
   been shot. The other twelve parts (shoulder fixtures, elbow, knee and ankle actuators) are in
   `mesh-identity.js`, seated by raycast with a distance guard, and `?fixmax=0.01` is the control
   that has been watched failing.

   ⚠️ **A CHROME PART FACING AWAY FROM THE KEY MUST NOT BE FLAT.** The actuators shipped first as
   flat-topped discs and photographed as HOLES: one normal returns one radiance, and on the back of
   a leg that radiance is near black. A torus has every normal in its tube's plane and always
   carries a highlight. This is the same failure the shader round hit from the other direction, and
   it is now three for three — **on this character, chrome plus "faces away from the key" equals
   black unless the form curves.**
5. Fallback only if something resists: re-unwrap non-overlapping and paint that one detail.

⚠️ **Every one of these ships with matched-angle captures** — `?azim=0/90/-90/180` against
`baseline_front / side-left / side-right / back`. John's standing instruction, and until today the
render could not be shot from anywhere but the front.

---

## What could make this fail, stated in advance

- **The dominant-bone assumption.** A vertex blended 50/50 across the elbow has no single frame.
  Details sitting exactly on a joint are the ones the spec asks for most. Mitigation: blend the
  detail across the two heaviest bones rather than picking one, and measure how many vertices are
  genuinely ambiguous before deciding it matters.
- **Bone axis convention.** The arm bones' +Y points DOWN the limb here, measured, not assumed —
  `(0.187, -0.970, -0.158)` for `LeftArm`. That has already caused one shipped bug. Derive the
  axis per bone from parent-to-child, never from a convention.
- **Detail finer than the mesh.** At 10,378 triangles a 2 cm ring may land inside one triangle. The
  shader draws per-pixel so it will still appear, but it will not follow the silhouette. That is
  acceptable for a painted crease and not acceptable for an exposed actuator, which is why those
  are geometry.
