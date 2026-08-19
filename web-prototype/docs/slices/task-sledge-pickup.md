# Slice: the sledgehammer is unreachable — make it a thing you find and pick up

**Files you may edit — nothing else:**
- `src/views/game.js` — the spawn loadout and the world placement block **only**
- `src/game/player.js` — the equip/pickup path only
- `src/ui/hud.js` — the held-tool readout and the pickup prompt
- `src/game/sledge.js` — only if the prop needs a resting pose on the floor

**Files other agents own — do not touch:** `src/materials/**`, `src/destruction/**`,
`src/game/wall.js`, `src/game/dig.js` all belong to **`chunks-2`**, running now.
`src/core/engine.js` and `views/game.js`'s **load warm-up block** belong to **`boot-1`**, running
now — ⚠️ **you both edit `views/game.js`. Stay out of the warm-up block (roughly the
`if (!engine.capture)` prewarm around lines 980–1180); it stays out of the loadout and placement
blocks.** If you must touch its region, stop and report instead.

Decisions here are made. If a stated fact turns out to be wrong, say so in your report rather than
diverging silently.

---

## 1. The bug: the campaign's headline feature cannot be reached by playing

`src/views/game.js:268` runs `player.rig.fitGadget('shoulderL', 'nailgun')` at spawn. **Fitting a
gadget replaces that arm** — that is the game's central idea, not a side effect. So the player
starts with `caps.arms === 1`.

`Player._toggleSledge` gates equipping on **`caps.arms === 2`**, because the hammer is two-handed
(`player.js:452`, `sledge.js:232`).

**Therefore the sledgehammer is unequippable in the default game and always has been.** John played
the Wave 2 build and reported *"a 2d mesh taking off layers where I was clicking"* — **he was
clicking, i.e. firing the nailgun. He has never swung the hammer.** An entire feel checkpoint was
spent judging a weapon nobody could hold.

⚠️ **This project has had this exact defect before, and wrote down the lesson.** `play-critic-4`
found there was zero world placement of gadgets anywhere, and `views/game.js`'s own comment records
it: *"Everything else about them can be perfect and it does not matter until they exist somewhere a
person can walk to."* **The sledge is that defect again.**

## 2. John's direction, 2026-08-08 — verbatim

> *"can the robot be spawened with two arms like a typical base robot from the art and then pick up
> the sledge from the ground instead of it just floating in front of the robot"*
>
> *"yes start unarmed. put the sledge in the first room for the player to find imediatly. the nail
> gun can spwn somewhere else for now."*

## 3. What to build — placements are decided, do not re-choose them

### 3.1 Spawn unarmed, as the baseline robot
**Remove the spawn `fitGadget('shoulderL', 'nailgun')`.** The player starts as the **baseline
two-armed UNIT-4H from `char.turnaround`** — which is exactly what John's own turnaround art shows,
and it means `caps.arms === 2`, so the hammer becomes equippable.

⚠️ **`LOADOUT` is derived from the rig immediately after this line and `resetRound()` restores it.**
It is deliberately *"recorded from the rig itself rather than restated"* so there is no second list
to forget. **Verify a retry still restores the right thing** — `resetRound` is now the live retry
path (retry no longer reloads the page), so a mistake here breaks every restart.

### 3.2 The sledge lies in the spawn room, dead ahead
**Anchor: `study_w.north`.** ✅ Verified: the player spawns at `[-8.60, -11.60]`, which is the
**south end of `study_w`**, and `spaces.js` records that the player *"spawns at the study's SOUTH
end facing north, up the room and toward D1."*

**So `study_w.north` is directly in the player's view on the first frame, about ten metres up the
room they are already facing.** They see it, walk to it, pick it up. That is the opening beat, and
it needs no text.

Lay it **on the floor**, resting naturally — not floating, not hovering, not spinning. It is a heavy
object on the ground.

### 3.3 The nailgun moves to `gallery.west`
The gallery is entered through **D1, directly north of the study's north end**, so the route reads:
spawn → hammer → through D1 → the long gallery → the gun at its far end. ⚠️ **`gallery.east` is
taken by the ball** — use the west end so they do not stack.

**Follow the existing placement block's pattern exactly** (the `for (const [gadget, anchor] of …)`
loop at `views/game.js:296`) rather than inventing a second mechanism. Its comment — **"PLACEMENT IS
THE TUTORIAL"** — is the standard to meet: each tool sits where its own verb is the obvious answer.

### 3.4 Pick it up, and know you are holding it
- **Picking up uses the same interaction as the gadgets** — the existing proximity + `E` path. Do
  not invent a new key.
- **HUD: show what is in your hands.** Today the readout shows the fitted gadget only, which is why
  a player cannot tell hammer from fist. Add the held tool to the existing readout in the shape
  `hud.js` already uses. ⚠️ **Do not redesign the HUD** — `dig.md` §6a.2 and John both rule out a
  numeric destruction meter, and the HUD's four-socket schematic is the game's whole inventory model.
- **A prompt when the hammer is in reach**, in the existing context-prompt slot (`hud.say` /
  the context prompt already used for `[E] TAKE OIL`).

## 4. The bar

**A new player spawns, sees a sledgehammer on the floor ahead, walks to it, picks it up, and hits a
wall — without being told anything.** If any step needs explaining, it is not built yet.

## 5. Traps

- ⚠️ **`fitGadget()` returns a `displaced` item and nothing used it** (`views/game.js:1878`).
  Removing the spawn gadget may change what is displaced — check nothing now leaks a limb.
- ⚠️ **The player is now unarmed at spawn.** The hunter is seeded one part short of stage 2 and
  hunts from the first frame. **Verify the opening is still survivable** — `escape.mjs` and
  `pc7-play.mjs` are the instruments. If it is not, report it; do not retune the hunter (not your
  file).
- ⚠️ **`sledge-1` reported equip is "E with nothing in reach"** — a mode toggle, not a pickup. You
  are replacing that with a real acquisition. Make sure the old toggle cannot also fire, or the
  hammer can be conjured from nothing.
- ⚠️ Never a backtick inside a GLSL template literal; prefer `Edit` over scripted replacement.
- ⚠️ **Parallel agents corrupt each other's playtests via HMR even on a private port** — inject the
  `@vite/client` stub and confirm "1 navigation" in the output.

## 6. Verify

```bash
node harness/playtest.mjs --view game.play --script harness/scenarios/sledge-check.mjs --port 5351 --q "seed=s4"
node harness/playtest.mjs --view game.play --script harness/scenarios/escape.mjs --port 5352 --q "seed=s4"
node harness/mechanics.mjs
```

⚠️ **`harness/scenarios/*.mjs` are driven by `playtest.mjs`** — run one directly and it prints
nothing and exits 0, which looks exactly like a pass.
⚠️ **Loading `game.play` takes 75 s+**, well over 180 s under concurrent agent load. Raise the wait
rather than declaring a hang.

**What to look at — and this is the test that matters:** take a screenshot of **the first frame the
player sees**. The hammer must be visible and legible in it. Then take one of the player holding it,
and confirm a stranger would say the robot is *carrying* a heavy tool rather than standing near a
prop. ⚠️ `play-critic` has hit the floating-prop failure before: gadgets read as *"an oversized prop
floating in space beside an unmodified-looking robot."*

## 7. Regression gate

- `mechanics.mjs` **11/11** · `escape.mjs` **20/20** on `seed=s4` · `sledge-check.mjs` **10/10**.
- **`resetRound()` must restore the new loadout** — retry is in-play now, not a page reload.
- The other four gadgets still spawn at their anchors and still work.

## 8. Report back

Where each tool ended up; a first-frame screenshot; whether the opening is survivable unarmed;
whether the hammer reads as carried rather than floating; and anything here that was wrong.

```bash
node harness/status.mjs set game.play --round N --verdict BUILDING --owner sledge-2 --summary "..."
```
**Ceiling is PASS — only a `critic-*` agent sets WOWED.**
