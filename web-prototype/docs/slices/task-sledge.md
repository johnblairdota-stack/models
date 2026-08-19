# Slice: the sledgehammer, and it has to feel heavy

**Files you may edit — nothing else:**
- `src/game/player.js`
- `src/game/locomotion.js`
- `src/game/weapons.js`
- `src/game/sledge.js` — **NEW**, the prop and its swing

**Files other agents own — do not touch, and do not reach into their structures:**
- `src/materials/breakmask.js`, `src/destruction/damagefield.js`, `src/game/wall.js`,
  `src/game/dig.js` belong to **`chunks-1`**, which is running right now. **You call it. It does not
  call you.** The interface is fixed in §3 and is not yours to renegotiate.
- `src/audio/audio.js` belongs to **`audio-3`**, also running. You call `playMeleeImpact(...)`;
  you never edit that file.
- `src/destruction/debris.js` and `dust.js` belong to `satisfy-1`. Chunks are `chunks-1`'s job, not
  yours — **do not spawn debris from here.**

Decisions here are made. If a stated fact turns out to be wrong, say so in your report rather than
diverging silently.

---

## 1. Why this exists

John, on the campaign's whole direction: *"I want the feel of sledge hammering the wall to be
satisfying and familiar."* **That sentence is the campaign's acceptance test**, and this slice owns
the half of it that lives in the player's body.

Today the melee tool is a **detached limb** (`limbClub`, 34 damage, 1.95 m reach) — which is a great
idea and stays. John, 2026-08-08: **"sledge and limbs coexist."** So the hammer is an *additional*
tool, not a replacement: **the hammer is what you dig with, the limb is what you fight with.**
Limb-loss-as-health is the game's identity and nothing here may weaken it.

## 2. What already exists — start by reading it, not by writing

- **`player.rig.swingHit()`** is polled in the game loop and already drives `weapons.melee(...)`.
  The swing phase, contact timing (~0.42 of the animation) and `swingKick` wind/strike already
  exist. **You are adding a weapon to a working swing system, not building a swing system.**
- **`src/game/rules.js`** holds `MOVE`, the melee table, and gait selection. Weapon numbers belong
  in that table, in the existing shape — do not scatter magic numbers into `sledge.js`.
- **`harness/scenarios/swing-weight.mjs`** already exists and already measures whether the *body*
  moves in a swing rather than just the arm. **It is your gate. Read it before you build**, so you
  build toward what it measures.
- **`src/gadgets/index.js`** is the worked example for a held/attached prop's construction and
  material use. Read it for the pattern; do not edit it.

## 3. The interface `chunks-1` publishes — call it, do not reinvent it

```
wall.applyHit(worldPos, power)   // power 0..1 → { removed, brokeThrough, depthAt }
```

⚠️ **`chunks-1` is landing this in parallel with you.** Call it defensively —
`wall.applyHit?.(...)` — so your slice builds, runs and is verifiable **before** it exists. Your
animation, weight and camera work do not depend on the wall responding, and **you must not block on
another agent.** If it is absent, log once and continue.

Audio, owned by `audio-3`,同样 defensive:
```
playMeleeImpact(depth01)   // called on contact
```

## 4. What to build

1. **The prop.** A two-handed sledgehammer: long haft, heavy head, readable silhouette against the
   robot's body. ⚠️ **Zero image assets in this project** — build it from geometry and the existing
   procedural material path. It must read as *heavy* in the silhouette alone: the head is the mass,
   and the mass is the point.
2. **The swing, in three beats.** **Wind-up** (slow, telegraphed, the body loads), **contact** (the
   frame the damage lands), **follow-through** (the head carries past and the body recovers).
   ⚠️ **The wind-up is what makes the hit feel earned** — a swing that starts at contact feels like
   a click. Make the wind-up long enough to read and short enough not to annoy across the ~60 s of
   digging John's band asks for.
3. **The body swings, not the arm.** This is what `swing-weight.mjs` measures and what separates a
   sledgehammer from a wave. Torso rotation, weight transfer, a settle on follow-through.
4. **Contact reaction.** On the frame damage lands: a camera kick (small — this is a hammer, not an
   explosion), and a recoil through the rig. ⚠️ **Scale the reaction to `removed`** (how much the
   wall actually gave) once `chunks-1` returns it — a blow that tears out a chunk should feel
   different from one that chips a nearly-spent surface. **That coupling is the falloff made
   physical, and it is the most valuable thing in this slice.**
5. **Cooldown and rhythm.** The hammer is slower than the limb club. Decide the numbers in
   `rules.js`'s existing table; the rhythm must sustain **~60 s of continuous digging** without
   becoming either a mash or a wait. **Say what you chose and why.**
6. **Coexistence.** Hammer and limb club both available, switching legible in the HUD's existing
   socket model. ⚠️ **Do not touch `src/ui/hud.js`** — if the HUD cannot express it, report that
   rather than editing another owner's file.

## 5. The bar

`refs/_sheets/dig.png` — **read the sheet, not the originals.** Primary: `dig-gallery-sledge-crew.webp`
(2000×1125), robots mid-swing at a wall. Judge **pose, stance and where the mass sits**; these are
generated images, so do not judge fine surface detail against them.

## 6. Presentation

- The hammer must be **legible in the third-person frame at playing distance** — not just in a
  close-up. If the head is ambiguous at 4 m, it is too small or too dark.
- ⚠️ **The player's body must not cover the hole being made.** `play-critic-8` found the player
  covers the centre third of the aperture at the only station you can shoot from, and John's own
  reference art answers it: **the robot stands BESIDE the hole, not square in front of it.** Favour
  a stance and camera offset that keeps the impact point visible.

## 7. Traps

- ⚠️ **`fbmT`'s narrow bell around 0.5** — gates written at 0.9 never fire. Four files have been bitten.
- ⚠️ **Never a backtick inside a GLSL template literal**; never a GLSL reserved word as a variable
  (`sample`, `filter`, `input`, `output`, `matrix`, `texture`, `buffer`, `cast`).
- ⚠️ **Prefer `Edit` over scripted string replacement** — it fails loudly on a bad anchor.
- ⚠️ **`player.js` has a flat `_fireCd` of 0.14 s that ignores `WEAPON_COOLDOWN`.** It is a known
  landmine for the future net client. **Do not fix it here** (out of scope), but do not copy the
  pattern for the hammer — read the cooldown from the table.
- ⚠️ **Locomotion degrades with missing limbs** (walk → limp → crawl → skate). A two-handed hammer
  in a robot with one arm is a real state. **Decide what happens and state it** — dropping the
  hammer is an acceptable answer; a two-handed animation on a one-armed rig is not.

## 8. Verify

```bash
node harness/playtest.mjs --view game.play --script harness/scenarios/swing-weight.mjs --port 5311 --q "seed=s4"
node harness/mechanics.mjs
node harness/playtest.mjs --view game.play --script harness/scenarios/escape.mjs --port 5312 --q "seed=s4"
```

⚠️ **`harness/scenarios/*.mjs` are NOT standalone scripts** — they export a default function that
`playtest.mjs` drives. Run one directly and it prints nothing and exits 0, which looks exactly like
a pass.
⚠️ **Loading `game.play` takes 75–115 s** (cold shader compile). Expected, not a hang.

**What to look at:** take a screenshot at the contact frame and ask whether **a stranger would say
that robot just hit something hard.** Then watch a full ~60 s dig and ask whether the ninetieth
swing is still tolerable — that is the question John's band actually tests.

## 9. Regression gate

- `mechanics.mjs` **11/11** (it asserts attack animation and refitted-limb animation).
- `escape.mjs` **20 passed** on `seed=s4`.
- **The limb club must be unchanged** — same damage, same reach, same feel. It is measured and it is
  the game's identity. If you touch shared swing code, prove the club still behaves identically.

## 10. Report back

The numbers you chose (damage, cooldown, wind-up duration) and why; what `swing-weight.mjs`
measured before and after; what you decided for a one-armed robot holding a two-handed hammer;
whether `chunks-1`'s `applyHit` existed by the time you finished and whether you could exercise the
reaction scaling; and anything in this document that turned out to be wrong.

```bash
node harness/status.mjs set game.play --round N --verdict BUILDING --owner sledge-1 --summary "..."
```
**Ceiling is PASS — only a `critic-*` agent sets WOWED.**
