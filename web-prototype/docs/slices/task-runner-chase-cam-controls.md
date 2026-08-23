# task-runner-chase-cam-controls — chase-only lens, camera-relative stick

Locked rework (John / Spine A). Decisions below are made. If a stated fact in the brief
was wrong, it is named here rather than silently diverged from.

`docs/design/party-loop.md` still wins on any disagreement about the party game.

---

## 0. Why

The runner's thumb and the runner's eyes were in two different frames.

- The pad posted a stick. `follow-bed.js` latched the body's heading on press and drove
  `move: { x: 0, y: mag }` — body-relative, forward-only.
- The TV `FollowOperator` auto-cut `chase` / `shoulder` / `lead` / `doorway` every 5.5–9 s.
- The runner phone was pad-only ("Eyes on the TV"). The person steering watched a cutting
  picture their stick was not measured against.

That is Genshin with the camera yanked every few seconds and the move stick glued to the
body. It feels broken.

---

## 1. What the brief said, and whether it was true

| claim | verdict |
|---|---|
| Stick is body-heading latch + `move: {x:0,y:mag}` | **True.** `perf.stickRef` + `stickHeading` + forward-only magnitude in `follow-bed.js`. |
| TV `FollowOperator` auto-cuts chase/shoulder/lead/doorway every ~5.5–9s | **True.** `until = 5.5 + rng()*3.5`, then `_pick()` from the other three. |
| Phone is pad-only; runner watches the cutting TV | **True.** `party-phone.js` expedition runner sheet was a stick and the sentence "Eyes on the TV." |
| `Player._stepGround` is already aim-relative | **True.** `player.js` — `sin/cos aimYaw` × `move.y/x`. Not edited. |

No silent divergence.

---

## 2. Decisions

### 2.1 Chase-only during the live run

`liveRunShot('run')` returns `'chase'`. `FollowOperator.update` takes that as `lockShot`,
stops the cut timer, and stays on chase. A `shot` cue that would cut to shoulder / lead /
doorway is dropped while the lock is chase.

Warm and intros keep their own cameras. `?shot=` (`FOLLOW_INSTRUMENTS`) still pins — a
host-built slot never emits it (F9d).

The four shot solvers stay. They are how `?shot=lead` and the pre-lock fallback exist.
They do not fire mid-expedition.

### 2.2 Camera-relative stick

Investigated both options the brief named. The clean path is the one `Player` already
implements:

1. Flatten the chase lens onto Y (`lookYaw(eye→look)`).
2. Put that yaw on `aimYaw`.
3. Hand the deadzoned stick through as real strafe+forward (`stickCamMove` → `move.x` +
   `move.y`).
4. `_targetFacing` turns the body toward travel.

Push up = into the shot. Radial deadzone + smootherstep stay (`stickMag` inside
`stickCamMove`). RUN and SWING are untouched.

The body-heading latch (`stickRef` / `stickHeading` / `STICK_TURN`) stays exported. It is
still the right diagnosis of a heading measured from itself, and the warm gate still holds
the sign and the spin. The driven bed no longer uses it.

### 2.3 Chase yaw is the lens, not the body

If chase stayed welded to `runner.facing`, a camera-relative hold-left would orbit: the
body faces the strafe, the camera follows the new facing, "left" rotates, repeat. Same
*class* of bug as adding `stickHeading` to a live heading, slower.

During a locked chase the operator keeps `_lockYaw`. It holds while the thumb is strafing
and recenters behind the body when the stick is released or the player pushes into the
shot. That is the one-stick Genshin/Roblox reading: up stays the current picture; a held
left is a straight line across it.

### 2.4 Runner phone shows the chase

Same follow slot the TV mounts: `warmUrl` in an iframe layered on `document.body` (never
inside `paint()`'s `innerHTML` — the host's own reload lesson). No socket. Run + move cues
go to that iframe from the pad; world reports from it are ignored (this parent is not the
TV). Stick overlays the picture. Copy that said "Eyes on the TV" is gone.

The GUIDE sheet is unchanged: `guideMapSvg`, flyover marks, no chase layer.

### 2.5 Out of scope, on purpose

- No CAUGHT / Producer chair / smash→recap end.
- No chrome-honesty thrash (#18–#27).
- `:5184` and overnight harnesses left alone.
- `player.js` not edited.

---

## 3. Files

| file | change |
|---|---|
| `src/party/follow.js` | `stickCamMove`, `lookYaw`, `liveRunShot` |
| `src/game/follow-bed.js` | chase lock, camera-relative drive |
| `src/views/party-phone.js` | runner chase embed, copy |
| `src/party/night-skin.js` | chase layer + pad-over-picture |
| `harness/party-warm.mjs` | W25 |
| `harness/party-isolation.mjs` | I10 |
| this file | decisions |

---

## 4. Gates

`npm run build` and `npm run gates:party`. New assertions: W25 (chase lock, camera-relative
math against `player.js`'s own strafe, bed/phone source) and I10 (embed is the follow slot,
guide map untouched, flyover still `guide`).
