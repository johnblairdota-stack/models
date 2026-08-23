# task-runner-chase-cam-controls — dual-stick pad, TV chase view

Playtest pivot (John). Supersedes the #29 phone chase-embed (`43ea598`). Decisions below
are made. If a stated fact in the brief was wrong, it is named here rather than silently
diverged from.

`docs/design/party-loop.md` still wins on any disagreement about the party game.

---

## 0. Why

John playtested #29. The runner phone embedded the TV follow slot (`warmUrl` iframe). The
embed was slow and did not work. The lock is now:

- **Phone = controls only.** No 3D view. Two virtual sticks + RUN + SWING.
- **TV = the playable view.** Continuous 3rd-person chase of the runner. The person
  steering watches the TV.

#29's chase-only TV lock and camera-relative move math stay. The phone picture goes.

---

## 1. What the brief said, and whether it was true

| claim | verdict |
|---|---|
| `main` includes #29 at `43ea598` | **True.** |
| #29 mounted a runner phone chase embed (`party-phone.js` warm-slot iframe) | **True.** `ensureChase` / `runner-chase-layer` / `warmUrl` / `sendChaseCue`. |
| Live TV `FollowOperator` is already chase-only (no auto-cuts) | **True.** `liveRunShot('run')` → `'chase'`. Kept. |
| `stickCamMove` already maps a deadzoned stick onto strafe+forward | **True.** Reused. Not rewritten. |
| `Player._stepGround` is already aim-relative | **True.** `player.js` — not edited. |
| Pre-#29 runner copy said "Eyes on the TV." | **True.** #29 deleted it. This pivot puts eyes-on-the-TV back. |

No silent divergence.

---

## 2. Decisions

### 2.1 Phone is a pad again — no chase iframe

Remove the runner chase layer entirely: no `warmUrl` iframe, no `postMessage` cue into a
phone WebGL context, no `chase-live` overlay. The runner sheet is room label + dual
sticks + RUN/SWING. Copy may say eyes on the TV.

The GUIDE sheet is unchanged: `guideMapSvg`, flyover marks, no chase layer. A later
"helpfully give the phone its own mansion socket" still fails I10.

### 2.2 Dual sticks on one move cue

Left `#stick` = move. Right `#stick-look` = look / orbit.

Both ride the existing `t:'move'` path (phone → TV socket → host `queueMove` →
`kind:'move'` cue). Payload grows by `lookX` / `lookY` (−1..1, same clamp as `x`/`y`).
No second cue kind. Coalesced like move: latest sample wins; a swing is still an edge.

`CUE_KEYS.move` and `MOVE_KEYS` list the new keys. `local.mjs` relays them. A missing
look pair is still a valid pad (zeros). A `lookX: 9` is refused at the door.

### 2.3 TV chase is continuous; right stick orbits it

`liveRunShot('run')` still returns `'chase'`. Auto-cuts to shoulder / lead / doorway stay
dropped. Warm / intros / `?shot=` unchanged.

Right stick drives camera **yaw / pitch** around the runner:

- Look right decreases house yaw (same convention as `stickHeading` / `_solve`'s right).
- Look up raises pitch (camera drops, still framed on the chest).
- Clamps: `LOOK_PITCH_MIN` / `LOOK_PITCH_MAX`. Soft follow distance stays `CHASE_DIST`
  (2.90) with the existing lateral offset and eye lerp.
- Look stick is deadzoned with `stickCamMove` so a resting thumb does not drift the lens.
- **No auto-recenter** onto body facing while the pad is driving. That was the one-stick
  #29 reading. The look stick owns the orbit; releasing it holds the angle. The
  undriven/scripted fallback (`?view=party.follow` with no phone) still recenters behind
  the body so a developer window is not a locked south chase.

### 2.4 Left stick is camera-relative to that TV chase

Same product as #29:

1. Flatten the chase lens onto Y (`lookYaw` / `operator.basisYaw()`).
2. Put that yaw on `aimYaw`.
3. Hand the deadzoned left stick through as real strafe+forward (`stickCamMove`).
4. `_stepGround` + `_targetFacing` already walk aim-relative.

Push up = into the shot. RUN and SWING untouched.

### 2.5 Out of scope, on purpose

- No CAUGHT / Producer chair / smash→recap end.
- No chrome-honesty thrash (#18–#27).
- No phone WebGL / follow iframe for the runner.
- `player.js` not edited.

---

## 3. Files

| file | change |
|---|---|
| `src/party/follow.js` | `lookX`/`lookY` on move, `stepLookOrbit`, `chaseOrbitOffset`, rates/clamps |
| `src/game/follow-bed.js` | look-driven chase orbit; keep chase lock + `stickCamMove` drive |
| `src/views/party-phone.js` | remove chase embed; dual sticks; eyes-on-the-TV copy |
| `src/party/night-skin.js` | dual-stick pad; drop chase-layer CSS |
| `src/views/party-host.js` | forward `lookX`/`lookY` on the move cue |
| `net/party/local.mjs` | relay `lookX`/`lookY` |
| `harness/party-warm.mjs` | W26 — no embed; look cue + camera-relative math |
| `harness/party-isolation.mjs` | I10 — no runner chase embed |
| this file | this lock |

---

## 4. Gates

`npm run build` and `npm run gates:party`. W26 / I10 replace the #29 embed assertions:
no runner chase iframe; look cue + orbit math; camera-relative move against
`player.js`'s own strafe; guide map / flyover untouched.
