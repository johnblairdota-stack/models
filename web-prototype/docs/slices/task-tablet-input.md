# Slice: John cannot comfortably attack a wall from his tablet

**Files you may edit — nothing else:**
- `src/game/player.js` — the `Input` class and `_liveInput` path only

**Files other agents own — do not touch:** `src/materials/**`, `src/destruction/**`,
`src/game/wall.js`, `src/game/dig.js` all belong to **`chunks-2`**, running now.
`src/audio/audio.js` belongs to `audio-3`. `src/ui/hud.js` belongs to nobody — still do not edit it.

⚠️ **`player.js` was edited hours ago by `sledge-1` (now finished).** Its sledgehammer wiring is
live and must keep working — read `Player.attack` and the sledge block before touching anything.

Decisions here are made. If a stated fact turns out to be wrong, say so in your report rather than
diverging silently.

---

## 1. Why this is worth a slice

John, 2026-08-08: *"I have a keyboard with my tablet just a pen instead of a mouse. The touch
controls with the tablet made it feel like a struggle to attack the wall so I didn't hear the
sound."*

**This is not a comfort issue — it is a broken quality gate.** John tests from a tablet during the
working day, and this campaign's entire risk control is *John plays the build and says whether it
feels right*. He has now failed to evaluate the audio **and** the swing weight for one reason: he
could not comfortably hit a wall. **Every round of the dig loop is judged by someone who cannot
currently operate the tool being judged.**

His hardware: **tablet + physical keyboard + pen. No mouse.**

## 2. What is wrong, mechanically

- **Attack is mouse-only.** `fire` comes from a left-button press; there is **no keyboard attack
  binding at all**. With a pen you must tap precisely while also aiming, and a tap is
  indistinguishable from a look-drag below `DRAG_SLOP`.
- **Aiming assumes a mouse.** The look path is pointer-lock mouse movement, with a touch drag
  fallback (`pointerdown` + `DRAG_SLOP`). ⚠️ **Pointer lock is unreliable or unavailable on tablet
  browsers**, and a pen drag competes with the tap that is supposed to fire.
- **Net effect:** with a keyboard attached, movement works fine and *everything else fights back*.

## 3. What to build — the bindings are decided, do not redesign the scheme

1. **Attack on `Space`.** ✅ Verified free: `Space` appears only in the `preventDefault` list at
   `player.js:980` and is **bound to no action**. Wire it to the same path a left-click takes, so
   it swings the sledge / limb / fires the fitted gadget identically.
   ⚠️ **It must be a LATCHED press, not a level test** — the `Input` class already latches keys via
   `once`/`consume()` precisely because "pressed between keydown and keyup is a race the player
   always loses when the frame rate dips" (its own comment). Use that mechanism; do not read
   `keys.has('Space')` in the update loop.
   ⚠️ **Hold-to-repeat must work**, because digging is ~60 s of continuous blows. Repeat should be
   gated by the existing weapon cooldown, not by the OS key-repeat rate.
2. **Look on the arrow keys.** `ArrowLeft`/`ArrowRight` yaw, `ArrowUp`/`ArrowDown` pitch, at a rate
   that feels usable rather than twitchy — pick it, state it, and clamp pitch to the same limits the
   mouse path already uses. Add them to the `preventDefault` list or the page scrolls.
3. **Attacking must never require pointer lock.** Whatever gate currently makes fire depend on a
   locked pointer, remove that dependency for the keyboard path.
4. **Change nothing about the existing desktop feel.** LMB fire, mouse look and the pen-drag path
   all keep working exactly as they do. **This slice only ADDS routes to the same actions.**

## 4. The bar

**A keyboard and a pen are enough to play the dig**: walk to a wall, hold Space to break it for a
minute, look around with the arrows, and walk through the hole — without ever needing a mouse or a
successful pointer lock.

## 5. Traps

- ⚠️ **`requestPointerLock()` returns a promise, and a REJECTED one killed the whole game once** —
  `player.js:984` carries the note. Do not add a new unguarded call.
- ⚠️ **`preventDefault` matters on a tablet**: arrow keys scroll the page and Space scrolls or
  activates a focused button. If the browser eats the key, the binding will look broken when it is
  not.
- ⚠️ **Do not "fix" the tap-vs-drag ambiguity by lowering `DRAG_SLOP`.** The keyboard attack removes
  the need to tap at all; retuning the touch path risks the desktop path for no gain.
- ⚠️ `sledge-1` reported the equip control is *"E with nothing in reach"* and there is no HUD
  affordance for the hammer. **Out of scope — do not fix it here**, but note in your report if it
  blocks the §4 bar, because John will hit it.

## 6. Verify

```bash
node harness/playtest.mjs --view game.play --script harness/scenarios/dig-free.mjs --port 5341 --q "seed=s4&dig=1"
node harness/mechanics.mjs
```

⚠️ **`mechanics.mjs` already asserts input survival** — including that *"a keypress survives a
starved frame rate"*. That test is your friend: extend the same pattern to Space rather than
inventing a new one.
⚠️ **`harness/scenarios/*.mjs` are driven by `playtest.mjs`** — run one directly and it prints
nothing and exits 0, which looks exactly like a pass.
⚠️ **Loading `game.play` takes 75 s+**, more under concurrent agent load.

**What to look at:** drive a full dig using **only** Space and the arrow keys, with no mouse events
and no pointer lock, and confirm the wall actually takes damage and a hole opens.

## 7. Regression gate

- `mechanics.mjs` **11/11** — it covers WASD, mouse, `E`, `Q` and the starved-frame latch.
- `escape.mjs` **20/20** on `seed=s4`.
- `sledge-check.mjs` **10/10** — `sledge-1`'s own scenario; the hammer must still swing.
- **Mouse and pointer-lock play must be unchanged.** Prove it, do not assume it.

## 8. Report back

The exact bindings and the look rate you chose; confirmation that a full dig is possible with
keyboard + arrows alone; whether anything else in the loop is mouse-dependent (the equip control is
the known suspect); and anything here that turned out to be wrong.

```bash
node harness/status.mjs note "tablet-input-1: <what changed>"
```
**Set no board verdict.**
