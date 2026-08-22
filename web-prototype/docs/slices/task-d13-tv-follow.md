# Slice: D13 — the TV is the show. Put a moving camera on the runner.

**Files you may edit — nothing else:**

| file | new? | owner |
|---|---|---|
| `src/views/party-follow.js` | new | TV host / party paint |
| `src/game/follow-bed.js` | new | Task run — the thin end of the play view |
| `src/party/follow.js` | new | TV host — pure, gate-testable, no THREE |
| `src/views/party-host.js` | edit | TV host |
| `src/party/night-skin.js` | edit | TV host (the `.run-*` block only) |
| `src/views.js` | edit | one registry row |
| `harness/party-follow.mjs` | new | the gate |
| `harness/party-follow-drive.mjs` | new | the Chromium drive |
| `package.json` | edit | `gate:follow` + the `gates:party` chain |

**Files other agents own — do not touch:**

- `src/views/game.js`, `src/game/room.js`, `src/game/player.js`, `src/game/spaces.js`,
  `src/world/*`, `src/lighting/*` — the mansion bed. **Read them, import them, change none of
  them.** This slice does not get to refactor `game.play`.
- `src/views/party-phone.js`, `src/party/cast-ui.js`, `src/party/roles.js` — **PR #6 (role deal
  + hold-to-peek) is in flight on these.** Nothing in this slice needs a phone card, and a
  conflict there costs both PRs.
- `net/party/local.mjs`, `net/party/server.js`, `net/party/entitle.js`, `src/party/room.js` —
  the party session. **This slice makes no wire change at all.** See §3.0.

Decisions here are made. If a stated fact turns out to be wrong, say so in your report rather
than diverging silently.

---

## 1. Why — the framed still is not the show

`docs/design/party-loop.md` line 22, and it is the sentence the whole party mode hangs off:

> The TV plays the run like a reality show following the runner (will the hunter take them?).

Line 42 says what that means in build terms: *"TV reality-TV follow camera (limited, produced),
not god-view."*

PR #5 shipped the beat that gets us there — expedition is durable on the server, every socket
including the TV enters it with no host click, and a refreshed TV resumes on the right beat. It
then paints `runStage()`: an SVG robot face, the words **"Hai is running"**, and a `<div>` that
says `follow`. Its own header says so out loud — *"Not the D13 mansion camera. That is the next
slice."* This is that slice.

The gap is not cosmetic. Six people sit down, vote a pair in, the host hits **Send them in**,
and the shared screen shows **a still picture of a face and a caption asserting motion**. There
is nothing to react to, so there is nothing to talk about, so there is nothing to lie about
afterwards. Every downstream mechanic in the bible — the guide calling rooms, the reaction pad,
the recap argument, the Reunion — assumes the table has been *watching something happen*. A
caption is not a thing happening.

Meanwhile `game.play` already contains a lit, destructible, walkable mansion with a body that
walks it. It has never been on the TV. This slice is the seam between those two facts and
nothing else.

**What this unblocks:** the reaction pad has something to react to; the guide's "left, then
left again" has a picture to be right or wrong about; the take (when it lands) is a thing the
room *sees*, which is the entire premise of "will they get taken?".

---

## 2. The shape, decided

**A dedicated follow view, mounted by the TV in an iframe.** Not a second Three.js canvas in
the host tab, not a port of `game.play` into `party-host.js`.

Three reasons, and the third is the one that decides it:

1. `party-host.js`'s own header is *"DOM only — no THREE, no mansion, no flyover"*, and
   `night-skin.js` repeats it. A WebGL context in the host tab breaks that and puts the show's
   layout at the mercy of `Engine`, which appends a `position:fixed;inset:0` canvas to
   `document.body`.
2. `paint()` rebuilds `root.innerHTML` on **every** websocket message. A canvas owned by that
   subtree would be destroyed and rebuilt on every lobby snapshot. (An iframe is not immune to
   this either — see trap §5.1, it is the single most likely way to get this wrong.)
3. **The iframe is the ownership boundary.** The follow view can only be handed what goes in
   its URL. It has no socket, no token, no frame, no event log. It is *structurally incapable*
   of putting a role, an alignment, a hunter position or the guide's map on the TV, and
   `harness/party-follow.mjs` asserts that as a closed schema rather than trusting it.

```
 party.host (DOM, socket, beat)          party.follow (THREE, no socket)
 ────────────────────────────            ──────────────────────────────
 beat === 'expedition'                   estate() engine
   └─ followUrl(...)  ── URL ──────────►  buildTestRoom()  ← the real mansion
        room, runner name, look,          Player (unit4h + Gait)
        worldSeed, throttle               produced follow camera
                                          broadcast overlay
                                    ◄──   postMessage { t:'follow', ready:true }
```

### 2.0 Why `game.js` is not edited

The brief allows a thin export from the play view. **None is needed, and taking one would cost
more than it buys.** `src/views/game.js` is 4894 lines with exactly one export — the default
`view()` — and everything a follow camera would want (`room`, `player`, the boom, the light
rig) is a `const` inside that one function body. There is no seam to widen without carving the
function apart, which is its own slice.

What the bed is actually made of is already importable, and that is what §3.2 composes:

| import | from | gives |
|---|---|---|
| `estate(opts)` | `src/views/_studio.js` | Engine + scene + camera + post pipeline |
| `buildTestRoom(engine, o)` | `src/game/room.js` | the house, colliders, `castRay`, `pathPortals` |
| `Player` | `src/game/player.js` | unit4h body + `Gait`, driven by `{move, run, aimYaw}` |
| `SPACES`, `PASS_H` | `src/game/spaces.js`, `rules.js` | the floor plan as data |

The **one** thing that is private to `game.js` and genuinely wanted is `makeLightRig()` (L4028).
**Carry the technique, do not import it.** Importing `game.js` would drag `audio.js`,
`gadgets/index.js`, `hud.js`, `hunter-ai.js` and the rest of its static graph onto the TV's
critical path for 140 lines of light positioning. `followRig()` in `follow-bed.js` is the same
five-light idea (key spot, two warms, a cool, a hemisphere fill) reading the same
`space.lights` tables, minus the four ablation query flags a TV has no use for.

---

## 3. The changes, numbered

### 3.0 The wire: no change. None.

Everything the follow view needs is already public and already on the TV's frame:

| need | source | already public? |
|---|---|---|
| beat is `expedition` | `{ t:'show', beat }` | yes — PR #5, `FANOUT_KEYS.show` |
| runner / guide id | `frame.pair.runner` / `.guide` | yes — `entitle.js` `['pair.runner','all']` |
| runner display name | `mergePublicNames(frame.players, lobby)` | yes — `players[].name` is `all` |
| runner shell/accent | `lobby.seats[].shell` / `.accent` | yes — `FANOUT_KEYS.lobbySeat` |
| house seed | `frame.worldSeed` | yes — `entitle.js` `['worldSeed','all']` |

So `local.mjs`, `server.js`, `entitle.js` and `src/party/room.js` are **not edited**. If you
find yourself wanting a new field, stop and report it — you have almost certainly reached for
something the TV is not entitled to.

### 3.1 `src/party/follow.js` — the slot, as a pure function

No THREE, no DOM. Bare node must import it, because the gate does.

1. `FOLLOW_BEATS = ['expedition']`. Nothing else mounts a follow.
2. `FOLLOW_KEYS = ['view','room','runner','name','shell','accent','seed','throttle','tag']` —
   a **closed** allow-list, same shape and same reasoning as `local.mjs`'s `FANOUT_KEYS`.
3. `FOLLOW_FORBIDDEN` — reuse the wording of `local.mjs`'s list and add the two this slice
   introduces:
   `['role','alignment','cover','claim','castSeed','you','teammates','flyover','hunter','deal','marks','lid','plan']`
   - `flyover` / `marks` / `hunter`: `party-loop.md`'s own "Do not" list.
   - `lid`: `room.setLid(false)` is what `game.play`'s `[F]` uses to see the house through its
     ceilings. **A lid-off TV is a god-view.** It is forbidden by name, not by omission.
4. `followViolations(params) -> string[]` — empty means the schema holds. A key not on the
   allow-list, or any key on the forbidden list, is a violation. This is what the gate asserts
   and what `party-follow.js` throws on, so a later field fails closed exactly the way a later
   `role` on the lobby snapshot does.
5. `followUrl({ beat, room, runnerId, name, look, worldSeed, throttle, origin })` →
   a string on an expedition beat with a runner, **`null` otherwise**. Lobby, casting and recap
   return null; expedition with no runner returns null. Build it with `URLSearchParams`, run
   `followViolations()` over the result, and throw if it is non-empty.
6. `name` is capped at 12 chars — the same cap `room.setName` applies — and `shell` / `accent`
   go through `cleanLook()` so only the closed palette reaches the URL.

### 3.2 `src/game/follow-bed.js` — the mansion, a runner, and an operator

`export async function buildFollowBed(engine, opts)` returning
`{ room, runner, shot, update(dt, t), dispose() }`.

**a. The house.** `buildTestRoom(engine, { wallField: new WallField({ authority: true }) })`,
then `scene.add(room.root)`. Defaults: digging free (the shipped default), estate port on. Do
not pass `panels`, do not pass `dig`, do not pass `estate` — the TV shows the house the game
ships, or it is not the house.

**b. The runner.** `new Player({ scene, world: room, rng: engine.rng, id: 'runner' })`.
- **Procedural `unit4h`, no `avatar`.** `game.play` defaults to the generated mesh
  (`?mesh=1`), which is four GLB fetches. The TV must come up without a network round trip it
  can fail on, and `Player` builds the procedural body itself when `avatar` is absent.
- `field` is omitted. `LimbRig` accepts `field: null`; nothing here detaches a limb.
- Start at `room.spawn.player[0]`.

**c. Driving it.** `Player.update(dt, t, { move, run, aimYaw })` and `move` is **aim-relative**
(`_stepGround`, L905). So the whole steering problem is one line: set `aimYaw` to the heading
you want and push `move = { x: 0, y: 1 }`. Collision, sliding, doorways, sills, the foot plant
and the arm swing all come free from `Player` + `room.collide`.

- **Route.** `room.pathPortals(from, to, 0.9, 1.9)` returns the ordered portals between two
  points; each has a `centre: Vector3`. Waypoints are those centres plus a point inside the
  destination space. `0.9 / 1.9` are the clear-width and clear-height filters — a route through
  an opening the body cannot fit is the failure mode `minW` was written for (`room.js` L822).
- When the route runs out, pick a new destination space (seeded, never `Math.random`) and
  re-path. The runner never stops moving for more than the pause in **e**.
- Arrival radius **0.55 m**; heading is `atan2(dx, dz)` — forward in this codebase is
  `(sin yaw, cos yaw)`.

**d. Throttle.** `STILL / CREEP / WALK / RUN`, the four the phone pad already sends
(`party-phone.js` L231). Map to `{ move: 0, 0.45, 1, 1 }` and `run: true` on RUN only. The URL
carries `throttle` so the host can pass it through later; **for this slice the bed drives its
own schedule** and the phone stays local, exactly as the brief says. Nothing on the wire
changes to make this work.

**e. It has to look like someone walking a dark house, not a dolly.** Three cheap terms, all
seeded:
- a slow speed wobble around the throttle's base;
- a **hesitation** every 6–11 s: drop to CREEP for 0.8–1.6 s, look left or right (offset the
  heading by ±0.5 rad while the body keeps its line), then resume;
- heading lag toward the waypoint rather than a snap, so corners are turns.

**f. The operator — `followShot()`.** This is the part that makes it *produced* rather than a
chase cam, and it is the part a lazy implementation will skip. Four shots, all at human height,
all pointed at the runner, **none of them ever above the ceiling**:

| shot | eye | look at | note |
|---|---|---|---|
| `chase` | 2.9 m behind, 1.62 m up, 0.35 m off the right shoulder | runner chest | the default and the fallback |
| `shoulder` | 1.35 m behind, 1.52 m up, 0.48 m lateral | runner head | close, breathing, corridor work |
| `lead` | 2.4 m **ahead**, 1.55 m up, facing back | runner face | the operator walking backwards. The reality-TV shot. |
| `doorway` | parked at the last portal centre, 1.60 m up | runner | the runner walks away down the hall |

- **Cut every 5.5–9 s**, seeded. A cut is a hard cut, not a lerp — this is an edit, not a
  drone.
- **Validate every cut before taking it.** `room.blocksSight(eye, runnerHead)` must be false
  and the eye must be inside a space (`room.spaceAt(eye)` non-null). If the chosen shot fails,
  fall back down the list to `chase`; if `chase` fails, pull the boom in along the eye→runner
  ray until it clears. A produced camera that cuts into a wall is worse than no cut.
- **Handheld.** Sum two low-frequency sines per axis on position (±0.02 m) and on yaw/pitch
  (±0.006 rad), scaled by the runner's speed. It should be barely perceptible standing still
  and obvious at RUN.
- Between cuts the eye **chases** its target with `1 - exp(-k*dt)` (k ≈ 6.5), so the operator
  lags the runner rather than being welded to them.

**g. Lighting — `followRig()`.** Carry `game.js`'s `makeLightRig` technique (L4028): five
lights, **repositioned, never rebuilt**, read from `space.lights`. The count is part of
three.js's program cache key and a changing count recompiles every visible material — the
comment at `game.js` L201–221 records what that cost. Add **one** thing `game.play` does not
have and that this view specifically needs:

- **the camera light.** A dim warm point parented near the operator's eye, ~1.4 intensity,
  3.5 m range, tinted toward the runner's `accent`. It is diegetic (a camera crew has a light),
  it is the runner's identity colour, and it is the only reason a body 3 m away in an unlit
  service corridor is exposed at all. **It is a sixth light in the constructor, added before
  `finalizeScene()`**, so the count is still fixed for the life of the view.

Grade: copy `game.js` L285–294 verbatim. Do not invent a TV grade.

**h. Order, and it is load-bearing.** Same order as `game.js` L3580–3600, for the reason stated
there — `finalizeScene()` patches materials and compiles over **visible** objects only:

```
estate() → buildTestRoom → scene.add → camera to spawn → player → lights
  → one visibility lap with every space visible → engine.finalizeScene() → residency → markReady
```

Then `room.setViewpoint(camera.position, dir, dt)` **once per frame** in the updater. Residency
is what keeps this at frame rate; skip it and the TV draws the whole house every frame.

### 3.3 `src/views/party-follow.js` — the view

Default export `async function partyFollow({ params })`, per `main.js`'s contract.

1. Read and validate params through `followViolations()`. **A violation throws** — `main.js`
   turns that into the visible failure card, which is correct: a follow slot that silently
   dropped a forbidden param would be a silent guide-map leak.
2. `estate({ cameraPos, target, fov: 62, far: 90, orbit: false, envIntensity: 3.20 })` —
   `game.js` L84–98's numbers, and read that block's note on why 3.20 rather than 0.34.
3. `buildFollowBed`, `engine.start()`.
4. **Kill `#boot`.** `main.js` only removes the splash when the view's promise resolves, and
   the mansion takes seconds. Hide it the moment the view function is entered (`game.js` L4212
   does the same for the same reason) and paint a **"CAMERA WARMING"** slate in the RRR palette
   so the TV never shows the boot chrome of an embedded page.
5. **The broadcast overlay**, in DOM over the canvas. This is what makes it read as a show
   rather than as a dev build:
   - top-left: a **REC dot** (2 s pulse) and `RRR CAM 01`;
   - bottom-left lower-third: the runner's `robotFaceSvg(shell, accent)` at 64 px, their name
     huge, and `LIVE · EXPEDITION` under it;
   - bottom-right: the current shot name and throttle, small, letterspaced;
   - a light scanline/vignette wash and 2.35:1 letterbox bars.
   Palette is `night-skin.js`'s: `#f5a14a` accent, `#f3ece3` text, `#0c0a08` ground.
   **Nothing on this overlay may name a room, a heading, a coordinate or a camera count** — the
   guide's job is to be the only source of that, and a TV that captions the room has taken it.
6. **Report ready.** `document.body.dataset.rrrFollow = 'live'` and
   `parent.postMessage({ t: 'follow', ready: true, shot }, '*')` on the first rendered frame.
   The host uses this to cross-fade off the slate; the drive uses it as its wait condition.
7. `?still=1` freezes the runner for a deterministic screenshot. `?shot=lead` pins one shot.
   Both are instruments; live play passes neither.

### 3.4 `src/views.js`

One row, in the `party` group, after `party.phone`:

```js
{ id: 'party.follow', group: 'party', title: 'TV follow — the produced run camera',
  bar: 'reality-TV follow of the runner in the mansion; never the guide map',
  module: () => import('./views/party-follow.js') },
```

`debugChrome()` already returns false for anything starting with `party.` — no edit there.

### 3.5 `src/views/party-host.js` — mount the slot

1. Import `followUrl` from `../party/follow.js`.
2. In `runStage()`, replace the `.run-follow` block with a **slot**:
   `<div class="run-frame"><div class="run-slot-mount" data-follow-mount></div>…</div>`, and
   keep the face + name as the **slate** the slot covers once the follow reports ready. The
   pair-hero line below the frame stays exactly as PR #5 shipped it.
3. **Own the iframe outside `paint()`.** One `<iframe>` element, created lazily, held in a
   closure variable, re-parented into `[data-follow-mount]` after each paint. `paint()` rebuilds
   `root.innerHTML` on every message; an iframe written into that string reloads the whole
   mansion on every lobby snapshot. See trap §5.1.
4. Set `iframe.src` **once**, when `followUrl()` first returns non-null. Recompute the url each
   paint and only assign if it actually changed (name edits, look changes). Never assign the
   same string twice — that is a reload.
5. On `{ t:'follow', ready:true }` from `message`, add `.live` to the frame so the slate fades
   out under the canvas.
6. Tear the iframe down when the beat leaves `expedition` — the follow is a WebGL context and
   the recap does not need one. Coming back to expedition builds a new one.
7. **`sandbox="allow-scripts allow-same-origin"`**, `allow="autoplay"`, no `allow-forms`,
   no `allow-popups`.
8. Everything else in this file — join, the seat grid, the ballot board, sequential casting,
   the recap card, `patchLobby` — is **untouched**.

### 3.6 `src/party/night-skin.js`

Only the `.run-*` block. Add `.run-frame iframe { position:absolute; inset:0; width:100%;
height:100%; border:0; display:block; }`, make `.run-frame` `position:relative`, and give
`.run-slate` an opacity transition that `.run-frame.live` drives to 0. Do not restyle the
lobby, the ballot or the recap — those are PR #5's pixels and a critic has not seen them since.

---

## 4. The bar

### 4.1 Gates — `npm run gates:party` must be green

Nineteen become twenty. `harness/party-follow.mjs`, same shape as every other gate: bare node,
no dependency, `let pass = 0, fail = 0`, the shared one-line `t()`, exit on the count. Add
`gate:follow` and link it into the `gates:party` chain in `package.json`.

**CI has no `npm install` step** (`.github/workflows/gates.yml`) — deliberately, so a gate is
never skipped for want of a module. So this gate imports **only** `src/party/follow.js` and
`src/party/look.js`. No THREE, no playwright, no DOM.

| id | assertion |
|---|---|
| F0 | `followUrl` returns null on lobby, casting and recap, and null on expedition with no runner |
| F1 | expedition + a runner returns a url whose `view` is `party.follow` and which carries room, runner, name, seed |
| F2 | `followViolations()` is empty for a real slot |
| F3 | the name is capped at 12 and an off-palette `shell` is dropped rather than passed through |
| F4 | a `flyover`, `marks`, `hunter` or `lid` param is a violation — **four control arms, each must go red** |
| F5 | `FOLLOW_FORBIDDEN` is a superset of `local.mjs`'s `FANOUT_FORBIDDEN`, so a field banned from the socket cannot arrive by URL instead |
| F6 | the same inputs produce the same url — the slot is a pure function, so a repaint cannot reload the mansion |

**F4 is the control arm and it is the point.** `party-isolation`'s four injected leaks exist
because a gate whose controls stop failing has gone blind. Same discipline here: if a
deliberately leaky param set stops being caught, the gate is decorative.

### 4.2 The Chromium drive — `harness/party-follow-drive.mjs`

Not in `gates:party` (it needs playwright and a browser). Run by hand and in the PR:

```bash
node harness/party-follow-drive.mjs --shots
```

It owns its own ports so it cannot collide with a dev session: room server **5183**, Vite
**5193**. It must, in one process:

1. start `net/party/local.mjs` and Vite;
2. open the TV at `?view=party.host&room=…&wsPort=5183`;
3. open **two** phones, join both, lock a look in on each;
4. **Start the night**, then drive real sequential casting on both phones — tap, padlock, tap,
   padlock — through the DOM, not by faking a socket message;
5. click **Send them in**;
6. wait for `{ t:'follow', ready:true }` / `body[data-rrrFollow="live"]` inside the frame.

Then it must prove four things, and each one is a specific way this slice can be wrong:

| id | proves | how |
|---|---|---|
| D1 | **not lobby** | no QR node in the TV's DOM, and the run frame exists |
| D2 | **not black** | crop the run frame from the TV screenshot; mean luma **≥ 12** and stdev **≥ 8** over the crop. A black canvas passes a "canvas exists" test and fails this one. |
| D3 | **live, not a still** | three crops ~1.2 s apart; consecutive pairs must differ by **> 0.5%** of pixels. This is the assertion that separates a real follow from a rendered postcard. |
| D4 | **the mansion, not a slate** | inside the frame, `window.__rrr.engine` exists, `perf().tris > 50_000`, and `room.spaceAt(camera.position)` is a real space id — the camera is standing **in** the house |

And two negative assertions that are the traps in §5:

| id | proves |
|---|---|
| D5 | **no god-view** — the follow camera's y stays under the storey height for the whole drive, and `room.setLid` was never called with `false` |
| D6 | **no guide map** — nothing in the follow document's DOM or its URL matches `flyover\|marks\|hunter\|minimap`, and the TV's own socket transcript still passes `fanoutViolations()` |

Shots land in `progress/follow/` — `tv-expedition.png` (the whole TV) and `follow-crop-{1,2,3}.png`.
**Put `tv-expedition.png` in the PR.** A reviewer must be able to see the runner in the house
without running anything.

### 4.3 Presentation — what the frame has to look like

A slice that lands the mechanism and looks like a debug view has failed here before. Read
`BUILD_GUIDE.md` §4b. Specifically:

- **The runner is in frame and readable.** Not a speck at the end of a corridor, not a shoulder
  filling the lens. They should occupy roughly a fifth to a third of the frame height.
- **The house is legible around them.** If the crop could be any dark room, the camera light is
  too tight or the grade is too crushed. Panelling, a doorway or a floor pattern must read.
- **It is graded, not raw.** `game.js` L285's grade, unchanged. If the frame reads flat amber,
  something is lighting it that should not be.
- **Nothing floats and nothing clips to white.** The camera light at 1.4 is deliberately under
  `game.play`'s practicals — if the runner's shell blows out, it is too hot.
- **The overlay reads as broadcast.** REC dot, lower-third, letterbox. A reviewer glancing at
  the screenshot should think "reality TV", not "engine viewport".

---

## 5. The traps — each of these has already cost this project time

**5.1 `paint()` will reload your mansion.** `party-host.js` repaints on **every** websocket
message, including every lobby snapshot. An `<iframe>` emitted inside the `innerHTML` string is
destroyed and recreated each time — a fresh WebGL context and a fresh 20-second bake, several
times a second. **The element must live outside the repainted subtree and be re-parented.** And
assigning the same `src` string again is also a reload; compare before you assign.

**5.2 Do not put the flyover on the TV.** `party-loop.md` line 50, first item under "Do not".
The temptation is real, because `game.js`'s `[F]` is *right there* and gives a beautiful shot of
the whole house. Three things are forbidden and D5/F4 assert each: `room.setLid(false)`, any
camera above the storey height, and any hunter marker. The hunter may walk through frame as a
silhouette one day; it may never be an icon on a plan.

**5.3 Do not break hidden-role filtering.** The follow view has no socket, and that is the
safety. Do not "helpfully" give it one so it can read `pair` live. Everything it needs is in
the URL, and `followViolations()` is the closed schema that keeps it that way. If you add a
param, add it to `FOLLOW_KEYS` and to the gate in the same edit.

**5.4 Do not regress join / cast / card.** `party-night.mjs`'s N-series and `party-sockets`
cover the path PR #5 shipped. Run the whole chain, not `gate:follow` alone. If the seat grid,
the QR, the sequential padlock or the recap moves by a pixel, you have edited something you do
not own.

**5.5 The light count is a program cache key.** `game.js` L201–221 is not decoration. Adding or
removing a light mid-run recompiles every visible material; `hunter-ai.js`'s `_setFlare()`
records a clean 1.28 ms capture going to *"execution context destroyed"* over exactly this.
Construct all six, reposition forever.

**5.6 `finalizeScene()` only sees visible objects.** Run one lap with every space visible before
calling it, then hand residency back. `game.js` L3320–3330 spells out why; a room hidden at
that moment compiles its shaders on the frame you first walk into it, which on a TV is a
one-second hitch in the middle of the show.

**5.7 `?capture` is read from the URL, not from `args`.** `game.js` L63–81 is a long, angry
comment about a whole round of measurements corrupted by assuming otherwise. Detect it the way
`Engine` does.

**5.8 GLSL.** No backticks inside a `/* glsl */` template literal — it terminates the JS
string, and `npm run build` runs `lint:glsl` first exactly because of it. No reserved words as
GLSL identifiers (`cast`, `sample`, `filter`, `input`, `output`, `matrix`, `texture`, `buffer`).
This slice should not need to write any shader at all; if you are writing one, ask why.

**5.9 Prefer `Edit` over scripted replacement.** `Edit` fails loudly on a bad anchor. A silent
partial edit in `party-host.js` is a broken TV.

---

## 6. Out of scope — do not build these here

Named so a builder does not drift into them, and so the next slice knows what is still open:

- **the auto-dig picker** — `party-loop.md` §29's `DamageField.channel(0.34,1.70,0.30).open`
  aim. The runner in this slice walks; it does not dig. Survival dig stays `game.play`'s.
- **nameplates in 3D** — the name lives on the lower-third, not floating over the body.
- **the Production Panel** and any evil-only UI.
- **tasks 2–5**, the terminal, camera unlocks as a mechanic.
- **the Reunion Special.**
- **the PartyKit cutover** — `net/party/server.js` is still uncovered and still not this slice's
  problem.
- **ghost UI for taken players** — `party-loop.md` line 53. There is no take in this slice and
  there is no ghost screen after it.
- **the hunter on screen.** Not the AI, not a marker, not a silhouette. When the take arrives it
  is a directed beat and it gets its own slice.
- **driving the follow from the phone's throttle over the wire.** The pad stays local until the
  auto-dig slice, exactly as the brief says. The `throttle` URL param exists so that slice is a
  one-line change here rather than a re-plumb.

---

## 7. The next thin end, and say it in the PR

State plainly, in the PR body, which of these the shipped build is:

- **(a)** the runner is `Player` walking a `pathPortals` route through the real
  `buildTestRoom` mansion with a produced cut-to-cut operator — the full slice; or
- **(b)** an honest reduction (fewer shots, a shorter fixed route, a genplan corridor rather
  than the authored house) that is unmistakably the mansion and unmistakably moving.

**(b) is an acceptable ship. Pretending (b) is (a) is not.** If it is (b), name the exact next
thin end in the PR body — one sentence, one file.

Either way the door left open after this is the same one: **the follow is a scripted
performance, not the runner's real position.** Nothing on the wire says where the runner is,
because nothing on the wire knows — there is no simulation behind the party mode yet. The next
slice after this is where the runner's throttle starts moving a body the server agrees exists.

---

## 8. Report back

1. Which of §7 (a) or (b) shipped, and the one-sentence next thin end.
2. `npm run gates:party` output — the full tail, all twenty.
3. `node harness/party-follow-drive.mjs --shots` output, and `progress/follow/tv-expedition.png`
   in the PR body.
4. Anything in this document that turned out to be **wrong**. The bed was read closely to write
   it, but it was read, not run — say so rather than diverging silently.
