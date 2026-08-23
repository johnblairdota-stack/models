# task-evil-red-hunter-route — John's seven notes on `0349ef6`

Playtest of `main` after PR #8 merged. Seven items, all in the party night, none of them in a
system that was red: every one of the seven was green under 22 headless gates and wrong on a
screen. That is the shape of this slice and the reason it ships a browser drive as well as three
extended gates.

---

## What shipped

### 1 · Evil looks evil

`src/party/rolecard.js`, `src/party/palette.js`, `src/party/night-skin.js`

`You are PRODUCTION` and the role name (`The Producer`, `The Fixer`, `The Plant`, and anything
else `SCRIPT` marks `EVIL`) render in `--night-bad`, the token the REC dot on the TV already
wears. The **PRODUCTION FEED** strip on the guide's phone — the red John asked the card to match —
was itself only red in its border; its words were the same grey as WORD FROM THE HOUSE, and they
carry the colour now. `--night-bad-rgb` is new, for the name's glow.

Two things deliberately did not move. The word is still **spelled out** — §2.3 and §6's
accessibility rule say colour is never the message, and `role-peek` P3 and the new P12c both hold
it — and a good card is untouched, which is the assertion that matters: a rule that painted every
card red would satisfy "the evil card is red" and tell the table nothing.

Measured in Chromium as a computed colour rather than as a class name, because `rolecard.js`'s own
history is a rule that was correct and did not reach the element: `rgb(255, 138, 122)` on the
Producer, `rgb(243, 236, 227)` on the Camera Op beside it.

### 2 · The hunter is a game — it walks the house

`src/game/follow-bed.js`

The token walked **straight at its next patrol stop**, which between rooms is a diagonal through
the masonry. All the consequences landed on the guide's phone, which is why nothing caught it:

- the straight line spends most of a room-to-room leg inside the wall band, where `room.spaceAt`
  is null, so `world()` reported `hunter.room: null`, `coverageRoomOf(null)` is honestly `null`,
  and the guide's mark went dark **for most of every transit on a route that is mostly transit**;
- the rooms it did report were whichever rectangle the diagonal clipped, in an order no adjacency
  explains — the exact failure `spaces.js` `generatedPatrol`'s header warns about, one layer up.

A leg is now expanded through `room.pathPortals` into the doorway centres between here and the
stop — the same call, filter and reasoning as `RunnerRoute.replan` one function above — and the
reported room is held across a doorway rather than briefly becoming "nowhere". **11 of 11**
room-crossing legs on the drive's house resolve to real doors; **0** would have gone through a
wall. Still no mesh, no chase and no take: `HunterAI` is a later slice and the TV must not be able
to render a hunter at all.

### 3 · The runner's stick — and it was two bugs, not one

`src/party/follow.js` (`stickHeading`, `stickRef`, `STICK_DEADZONE`), `src/game/follow-bed.js`

**The sign.** `player.js` L887 turns a stick into a facing as `Math.atan2(-mv.x, mv.y) + aimYaw`.
The follow bed had written `Math.atan2(s.x, …)` and lost the minus, so with the chase camera behind
the body — where world-right is screen-right — a thumb pushed right went visibly left.

**The frame, which is the half John's sentence needs and the sign alone does not give.** The
bearing was added to the *live* heading every frame, so `want - heading` is a constant: the target
runs away from the body at exactly the speed the body chases it. A thumb held left was a turn rate
of about **14 rad/s** — two revolutions a second, forever. Measured in Chromium: nine seconds of
full left moved the runner **0.23 m** round a tight circle, against **8.12 m** for nine seconds of
full forward. With the sign fixed and nothing else, dragging left still would not have moved
anyone left.

So the bearing is measured from the heading the body had when the thumb went down, latched while
the thumb is down and cleared at centre. Push left, turn ninety degrees left, walk left, stop
turning. Not camera-relative: this camera *cuts*, and `lead` sits in front of the runner looking
back, so a camera-relative stick would invert on an edit nobody asked for.

After: **−1.22 m** left on a left drag, **+1.18 m** right on a right drag, through the real
phone → server → cue → body chain.

### 4 · Recap is gone from the UI

`src/views/party-host.js`, `src/views/party-phone.js`

The host's `Recap` button sat beside "Watch the run" for the whole expedition, so the one control
on the television that could cut the show short offered three facts about an episode that had not
finished. It is gone, and so is the phone's recap card.

**The beat is still on the wire.** `show.js`'s clock still walks to `recap`, `recapFromEvents`
still runs, and `recapBoard` still draws it when the clock gets there — what was removed is the
affordance, so putting it back is a paint rather than a rebuild.

### 5 · The TV follow takes ~90%

`src/party/follow.js` (`TV_FRAME_PCT`), `src/party/night-skin.js`

`min(58vh, 620px)` → `min(90vh, calc(90vw * 9 / 16))`. **The pixel cap was the half that actually
bit**: 620 px reads as 57% of a 1080p set and 38% of a 1440p one, so the picture got *smaller* on
exactly the screens this view exists for. A cap in px can never be right on this rule.

Ninety per cent of a television leaves ten per cent for everything else, so `.night.on-run`
compresses the top strip, drops the main padding, folds the camera/alarm line into a single small
strapline under the pair-hero, and floats the one remaining control into the bottom-right corner.
Measured on a 1920×1080 page: **1728×972**, top 34, bottom 1006, nothing scrolled.

The number lives in `follow.js` and is interpolated into the stylesheet, because `injectNightSkin`
builds its rules inside a function and a number no gate can read is a number that drifts back.

### 6 · No WORD FROM THE HOUSE on the runner

`src/views/party-phone.js`

The runner gets their information from the guide, out loud. The block is gone from that pad and
kept everywhere it was already earning its place — the guide reads, and a seated player's vague
read is their whole contribution from a chair.

⚠️ **`patchLive` had to stop treating the intel slot as proof the sheet is patchable.** It bailed
on a missing `[data-intel]`, which was safe while every expedition sheet had one; with the runner's
pad no longer carrying it, that bail would have sent every world report — twice a second, all run —
down a full `root.innerHTML` rebuild, destroying the stick under the player's thumb along with its
`setPointerCapture`. That is precisely the defect the structural stamp exists to prevent, and it
would have arrived as "the runner keeps walking after I let go".

### 7 · The guide's map: peek, then the evil robot eats it

`src/party/mapfeed.js` (new), `src/party/room.js`, `src/party/guidemap.js`,
`net/party/entitle.js`, `src/views/party-phone.js`

John, guiding as the Producer: *"Production Feed said the hunter moved Chapel → Gallery, but the
red hunter dot on the guide map did not keep tracking."* Both readings were correct about their own
rule and **the rules were different**. `you.intel` is exact and deliberately ungated for Production
(`party-warm` W7a); the *mark* went through `hunterVisibleToGuide`, so it blinked out every time the
hunter walked somewhere no camera watches. One screen, two answers, and the wrong one was the
picture.

- **Production** now gets continuous marks that equal the reported position tick for tick. This
  adds no information — the same coordinate is already on that socket's wire as
  `you.intel.hunter.at` — it stops two renderings of one fact from contradicting each other.
- **A good guide** keeps the camera ladder exactly as it was, and on top of it gets
  `mapfeed.js`'s cycle: **6 s** of map, then **14 s** of red matrix rain eating it. The resting
  state is blind, which is the direction a hidden-role map should fail in.

🚨 **The jam is a filter, not a screensaver.** A jammed frame carries **no hunter mark at all** —
the server decides before `flyover.marks` is built, so there is nothing under the glyphs to read
out of the network tab. Painting over a position that is still on the wire would be a suggestion,
which is `intel.js`'s argument applied to the map. `flyover.jam` is a `guide`-audience row and is
always present as a boolean, because a field that appeared only while the feed was cut would change
the guide's frame shape twice a cycle and trip `party-isolation` I7.

The phone says which of the two blindnesses it is — "the feed is being eaten" against "no camera
has the hunter" — because collapsing them would have the guide announce a clear house while an evil
robot chews their screen. And none of it is on the television: E7d re-greps the slot and the host
document for `guide-map`, `gm-jam`, `gm-hunter` and `flyover`.

---

## The instruments

**`gates:party` — 22/22 green, and CI still runs it with no `npm install`.**

| new | where | what it holds |
|---|---|---|
| **C5** ·  6 checks | `guide-coverage.mjs` | two guides, two feeds, over a real room: Production's mark is on **60/60** frames and **0 adrift** from the reported position; a good guide is **23 clear / 37 jammed** and never marked while jammed. ⚠️ C3 above it could not have caught this — both its episodes elect a *good* guide at `castSeed: 4`, so the evil arm was never entered. C5 searches for one of each and prints the seeds. |
| **W14** · 9 | `party-warm.mjs` | the feed cycle, the resting state, the row in the matrix, and the control that Production is never jammed at any point in the cycle |
| **W15** · 10 | `party-warm.mjs` | the stick, asserted against **`player.js`'s own strafe arithmetic** rather than against itself — 7/7 sticks agree. Three controls: PR #8's formula is left-right *mirrored* (not merely different), it agreed on forward (which is why it looked like it worked), and measured from the live heading it turns **2.1 revolutions a second, forever** |
| **W16** · 4 | `party-warm.mjs` | `TV_FRAME_PCT`, that the stylesheet interpolates it, and that no pixel cap came back |
| **P12** · 4 | `role-peek.mjs` | both card lines take the Production class, a good card takes neither, the word survives |

**`harness/party-playtest-drive.mjs` — new, 24/24, and out of `gates:party`** for the same reason
`party-follow-drive` and `party-warm-drive` are: it needs a browser. It walks a real night with a
TV and three phones and measures the seven items where being green headlessly was the problem.

Two accommodations are stated rather than hidden, because both produced a confidently wrong reading
first:

- **It holds the run beat.** `show.js`'s stub clock flips to `recap` at 26 s; the phones then leave
  the expedition sheet and an assertion about the runner's stick measures the "phones down" card.
  The first run reported "no `#stick`" about a pad that was fine.
- **It samples adaptively, not for a fixed window.** The patrol and the feed cycle are in
  *simulation* time and this box renders the mansion at a few frames a second, so a fixed 23 s
  window caught one leg of a 26-stop route and reported "the hunter is standing still", and a
  fixed 30 s window caught a good guide 30 times inside one jam and reported "the feed never comes
  back". Both now sample until they have seen what they are looking for.

Artefacts under `progress/playtest/` with `--shots`: the Producer's card beside a Cast card, the
guide's map clear and jammed, the runner's pad, and the 90% television.

---

## Not in this slice

`HunterAI` take/absorb, tasks 2–5, the Reunion, the PartyKit cutover, and Meshy hunter art. The
token still has no mesh and that is load-bearing rather than pending: `party-follow-drive` D6 greps
the slot's whole DOM for the word, and a hunter the TV can render is a hunter the TV can leak.

## Left open

- **The feed cycle is in the TV's report clock, not a wall clock.** `mapfeed.js` is driven by
  `state.worldTick × 0.5`, which is deterministic — gates that never call `setWorld` see the same
  behaviour they always did — and correct at 2 Hz on hardware. On a machine where the mansion
  renders slowly the cycle stretches with it. That is the right trade for reproducible transcripts;
  it is worth knowing before anybody times the jam on a slow TV.
- **`coverage.js`'s roster still names `hall` and `cellar`, and the generated houses build
  `service`.** So a `service` room can never be covered by a camera and two roster entries never
  match anything. Untouched here — it predates this slice and moving it moves `guide-coverage`'s
  whole curve — but it is a real reason a good guide is blinder than the algebra says.
