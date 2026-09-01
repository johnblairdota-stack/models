# CLAUDE.md — read this before HANDOFF.md

**There are two games in this repo. Know which one you are working on before you read anything else.**

| | Survival mode ("Run Robot Run") | **PRIME TIME** (social deception) |
|---|---|---|
| What | Small robots dig a destructible mansion; a corrupted hunter absorbs their parts | Reality-TV night loop: 8 robots, phones as controllers, TV as the show |
| Lives in | `src/game/`, `src/destruction/`, `src/world/`, `src/characters/` | `src/party/`, `net/party/`, `src/views/party-host.js`, `src/views/party-phone.js` |
| Its context doc | `web-prototype/HANDOFF.md` | **this file + `docs/design/rrr-social-deception-mode.md`** |
| Phase machine | `src/game/run.js` — `EXPLORE/WINDDOWN/DETONATION/RESULTS` | `src/party/phases.js` (design) + `src/party/show.js` (wire), kept in step by `episode-order` |

> ⚠️ **`HANDOFF.md` is the survival game's doc and says "read this first, then stop reading."
> That instruction is now wrong for Prime Time work.** It was last substantively updated
> 2026-08-19 and contains **zero** mentions of Prime Time, Casting, Debrief, Reckoning, Recap,
> Reunion, Expedition or ballots — every PR from #29 onward. Read it for the dig, the art bar,
> the GLSL lint rule and the build discipline. Do not read it for the night loop.

## Build and run

```bash
cd web-prototype
npm install
npm run build && node harness/serve.mjs     # -> localhost:5192/?view=game.play
npm run party:local                          # party server
npm run gates:party                          # the 24-gate suite CI runs
```

⚠️ **`npm run build`, never `npx vite build`** — the former runs `harness/lint-glsl.mjs` first, and
a backtick inside a `/* glsl */` template literal takes the whole build down. Editing a file with
`/* glsl */` in it? Run `node harness/lint-glsl.mjs` after **each** edit. (Argument in `HANDOFF.md`.)

## The night loop — designed vs wired

Designed order (`src/party/phases.js:45`, `EPISODE_ORDER`):

```
Casting → Expedition → Recap → Debrief → Reckoning → Vote → Execution → Verdict
   ↑                                                                       │
   │                                                          RENEWED      │
   └───────────────────────────────────────────────────────────────────────┤
                                                                           │
                    FINALE / CANCELLED / ABANDONED ─────────► Reunion ◄─────┘
                                                        (roll call · cut · awards · chat)
every episode runs this in full · the fold decides which way out of the Verdict
```

**Every episode runs the same order, premiere included.** `orderFor` used to stop episode 1
after Debrief while the live wire never did; the two disagreed, both halves were gated as
correct, and John kept the vote. `harness/episode-order.mjs` now asserts the two machines AGREE
rather than asserting an order — it derives the expected live walk from `orderFor`, so it follows
any future change and fails only when they drift apart again. **If you change the running order,
change it in `phases.js` and let that gate tell you what moves.**

**The whole designed order is on the wire as of 2026-08-28, and a session can end.** `SHOW_BEATS`
carries `verdict` and `reunion`; `AFTER_RUN_NEXT` walks `execution → verdict → casting`, and that
last edge is **conditional on the fold** — RENEWED plays on, FINALE / CANCELLED / ABANDONED enter
the Reunion. It is the first conditional edge in the whole wire and the only thing that has ever
ended a session. `episode-order`'s `WIRE_MISSING` is now empty, which is what it was written to
become. The Reunion is deliberately NOT on the rundown rail: the rail is one episode's schedule,
and the Reunion happens once.

**Before you "fix" anything else here, read the gap list in `docs/design/PRIME-TIME-STATE.md`.**

## Locked product rules — do not relitigate these without John

These were decided in playtest and cost real sessions to arrive at. Changing one is a design
decision, not a refactor.

- **D13 · The phone is a controller, never a viewport.** No 3D on the phone. The runner's camera
  lives on the **TV**. A phone chase embed was built (#29) and **removed** (#30) because it loaded
  slowly and did not work. The pad has **two shapes**, and which one is live follows the camera:
  on the ground it is two sticks (left = move, camera-relative; right = look/orbit); under the
  plan-locked top-down the look stick is **not rendered** and the move stick is **absolute** —
  screen direction is world direction — with RUN/SWING grown into the freed half. The phone is
  told which via `you.view` (runner-audience). Gates: `party-warm` W26i–W26i4.
- **The DIRECTOR may not cut during the run** — no shoulder / lead / doorway under the player's
  thumb, because those invert a camera-relative stick. ⚠️ This bullet used to read *"chase-only
  during the run"* and that became literally false when the four perspectives shipped; a
  perspective is **held**, chosen by the game, and is not a cut. Gate: `party-warm` W26h/W26h2.
- **The expedition chooses its own camera at the ballroom threshold.** Inside the ballroom the
  show is on `chase`; outside it the show is `top`, and the change between them is a 1.35 s
  **crane** (1.10 s coming back), not a cut. Hysteresis is a 2.20 m dead band at the wall so a
  doorway cannot strobe it. The `?dev=1` **P** key still cycles all four rigs for inspecting
  ceiling art, and the next crossing takes the camera back. Gates: `party-follow` F11i–F11i5,
  `party-warm` W26h3.
- **The TV may see over the walls of the runner's OWN rooms, and never the whole house.**
  `party-loop.md`'s "Do not" #1 is narrowed, not repealed — no whole-house fit, no hunter mark,
  no route line, no plan diagram. `setLid(on, ids)` is scoped to residency's set. Ratified by
  John after `CRITIC-LEDGER` round 8 raised it. Gates: `party-follow` F11c2d,
  `party-follow-drive` D5.
- **Casting has no "Send them in" button.** Once runner and guide lock, the TV counts 3·2·1.
- **The Verdict airs a status, cameras, a casualty by VISIBLE CAUSE and an incident count — and
  nothing else.** `rrr-social-round.md` §4; *"precision here is the whole of P6"*. Held back until
  the Reunion: every alignment and role, **the feed count** (evil losing a partner looks exactly
  like evil winning), which incidents were sabotage, and chat authorship. `foldWin` returns `fed`
  and `rule` right beside `camerasLit`, and the rule is the same leak in a costume — W3 *is* the
  feed count in words. Gates: `party-night` N17h0b, `party-warm` W47c/W47d.
- **The Reunion's reveal is its own message, not an exception inside `entitle.js`.** `MATRIX`
  projects the state frame and stays deny-by-default with no "unless the phase is REUNION"
  anywhere in it; `t:'reveal'` is a separate fanout with a closed schema and a **named** two-word
  exemption from `FANOUT_FORBIDDEN` (`role`, `alignment`, on `reveal.seat` only). `cover` is still
  forbidden even there — it travels as `believedTheyWere`, which is its name in the design.
  Gates: `party-night` N17m–N17m3, `party-warm` W47i.
- **SKIP TO REUNION is isTV and takes two taps.** It ends everybody's night, so a seated phone
  must not be able to send it, and one tap must not be able to either. Offered from a chair only —
  never mid-expedition. Gates: `party-night` N17k–N17k4, `party-warm` W47f.
- **A season lasts exactly `EPISODE_CAP` AIRED episodes.** The cap is measured against
  `state.airingEpisode`, not `state.episode`, because `playEpisode` bumps that before the live
  Verdict beat is reached and after the offline one — a live room used to stop after four of five
  while the offline machine stopped after five, with a green gate on each. Gates: `episode-order`
  E6/E6b, `party-night` N17n, `win-machine` W10c.
- **Every episode runs the full order, premiere included** — episode 1 votes and evicts like any
  other. Decided 2026-08-25; `phases.js` `orderFor` carries the argument, the 105s it costs the
  night, and the line to change back if a real premiere feels arbitrary. Gate: `episode-order`.
- **Two expedition jobs, locked 30 Aug.** Night one is the twin-painting smash (`WALL_CALL`) —
  identical faces, same loudness, guide says the REAL wall out loud, TV follow does not say
  which, empty-nail still is the delayed check. Later nights are one noisy DRILL until a camera
  mounts; blind still counts as `camera_lit`; a dark mount retries DRILL. Voice is in the room
  (GO/HOLD, CLOSE/LATE/GOING) — those words are not tappable cue rows on the pad. Guide E's
  neighbours map is the primary surface (this room + doors out; no whole-house flyover). The
  seek line advances once the runner is in the job room. Fail chrome names no person.
  Gates: `expedition-jobs`, `intel-pads`.
- **One Reckoning clock.** If it hits zero with nobody standing, skip the vote — nobody
  accused, no execution this episode. Do not re-arm the countdown. A name after zero does
  not stand. Two accused who lock before zero still vote. Gate: `party-night` N19 / N17d2.
- **The TV seat is held by a living host socket, not a sticky `tvTaken`.** Bind sets the
  flag; `dropIfMine` clears it when that host sock actually drops (and a destroyed ghost
  does not hold the seat). Two living hosts are still refused. Gate: `party-night` N2b–N2h.
- **Expedition reacts last ~10s, float up, and survive the 2 Hz world tick.** A tap is a new
  chip with `--dx`/`--dy`. A stable expedition does not `paint()` — `t:react` and `t:state`
  patch in place, because reinserting a chip restarts `react-float`. Gate: `react-pad` R42c / R43,
  `party-warm` W45b.
- **Casting has a server-side backstop** (`CASTING_BACKSTOP_MS`, 45s) so a dead TV tab cannot hang
  the room, but an **empty ballot box still waits** — the net re-arms and never invents a pair.
  Gate: `party-night` N20a–e.
- **The 3·2·1 arms on all *living* ballots in, or a ~20s backstop** — never the first ballot,
  never a dead phone (`CAST_BACKSTOP_MS`, gate `cast-ballot.mjs` B12b–B12e / B14, `party-night`
  N24). Sofa 29 Aug: Ada lynched in episode 1 still locked episode-2 CASTING on
  "PHONES ARE PICKING".
- **Empty ballots at capacity wait; they never invent a runner/guide pair** (gate
  `party-night.mjs:366`). Found live at N=8.
- **No self-vote on the lynch ballot** — server coerces a self-pick to NO ONE (gate
  `vote-table.mjs:108`).
- **Nominating is voting.** A nominator's vote is assumed for their nominee; they do not vote again.
- **Casting ties break on a seed, silently** — no human re-vote. The reason shows on the TV board.
- **Duplicate names and colours are allowed.** There is deliberately no anti-dupe system.
- **Recap is ~10s and must not scroll.** Talk chrome sits in top/side/bottom bands so the ballroom
  chairs never cover nomination / execution / verdict plates.
- **Ballroom camera is outside the chair circle**, sweeping, cameraman-walk transitions that keep
  the group centred. Not tight face-front intros.
- **Chairs are solid and persistent** — robots path around them, and the seated circle stays on
  air during the run.
- **Name tags float above the head, billboard to the TV camera, black-outlined white text**, and
  must stay legible at low quality and distance. Red `!` over a nominee, above the tag.
  ⚠️ The legibility half of this rule is **currently broken and measured** — see the tag-census
  note above. Any fix trades against the "float above the head" half, so it needs John.
  A seat tab was added beside the name (F12, John's call 2026-08-28); the NAME's treatment,
  stroke and colours are untouched.
- **Sledge grip is bench-locked**: `GRIP_SHIPPED` 2.37 rad, haft 0.205, guards 13.3 cm off wrist /
  31.0 cm up shaft / 89.8°. Bench is `?view=char.grip` / `harness/_grip_shot.mjs`. The product
  hammer must match the bench — this was got wrong twice.
- **Execution: the nominator walks and swings.** `vote.js` `executioner()` already returns the
  first nominator of the executed player (or `SHOWRUNNER` if that nominator was taken). The TV
  used to empty the `noms` cue and sit-and-cut. It now stands that robot, drops only their chair
  collider, unlocks at the stand-mark, walks the inner ring, and swings the existing sledge
  (clone `mountProp` / `playAttack`, grip lock untouched). Showrunner has no ninth body — the
  camera holds on the accused from outside the ring. Gate: `accusation-stage` E0–E6, `party-warm`
  W3j / W33o.
- **Dead stay wreckage.** After the hit, the victim is not `parkSit`'d living, their chair
  instance stays broken out, and episode-2 CASTING does not restore them. The wreck is standing
  set dressing: public-dead ids re-apply across dispose, and a talk plate uses the same low look
  as the hit so Recap / Debrief / later Casting / Reunion still find the floor body. Alignment
  still hidden until Reunion. The mixer **freezes** (`holdDead`) — never Idle_M / sit idle /
  loco idle on a corpse. On-back slack, chair toppled away from the torso. Death read is the
  **face only** — visor crashed, face lamp off; same shell/albedo as a living sit. No body dim.
  Sofa 29 Aug: Ada sat back; dusk sit-down never saw the floor body after the plate; live HEAT:
  prone idle on elbows, then darkened wrecks. Gates: `execute-hit` H11 / H12 / H14 / H15,
  `party-warm` W33u / W33v / W33y / W33z.
- **Idle after a remount must not throw.** Verdict sit sends `{kind:'idle'}` while `cuedRunner`
  is set; a CAM DARK remount leaves `introCast` null. Guard: `idleRebuildCast` — never read
  `.length` on a null last-cast. Episode 3 VERDICT after Fox, 30 Aug. Gate: `party-warm` W33w.
- **TV visual direction is B — "Rundown Rail"**: the night's schedule across the top, shrinking to
  a 22px ribbon during the Expedition.

## Gates are the memory

Every bug above that has a gate name beside it is locked in. `.github/workflows/gates.yml:44` runs
the full `gates:party` chain on every push and PR. **A playtest finding is not finished until it is
a gate** — five agents' findings were lost in August because they lived in transcripts.

**Couch Plan Rung 2 · SAME PAGE.** Recap airs every episode `orderFor` names it. `nextShowBeat('expedition')` is `recap` so `progressShow` on the run is not a no-op. A `t:'show'` jump that walks backwards along the talk chain (DUSK6 ep1 reckoning↔vote ~35 times) stays on the later beat — it does not re-enter. Recap chrome omits run claims unless `episodeHadRun`; "Run is in the book" is banned without a run. Gate: `episode-order` E7–E8 (season JSON if present).

**Couch Plan Rung 1 · honest scorekeeper.** DUSK6 ep2: `_loop8` wrote `votesSent` at send time (Cy→Gus); `chromeTally` was Gus 4 | Fox 4. Season JSON has no `ballotOk`. Logger records receipts + `t:'lynch'` and never writes `votesSent` as the tally; old-log replay treats `chromeTally` as the board and locks Cy from `noms`. TV tallyBoard keeps `Ballots in` / `{in} of {living}` / `needs ${need} to carry`; nameplates stay `named by ${nominator}`. Pads keep the nominator lock line. ADDs: `N of M clears` on Reckoning + Vote, ` · nominated.` on the lynch-row `nom-by`. Gate: `vote-table` V10–V12.

**H277 / DUSK6 · cap miss is Reunion, not another Casting.** At `EPISODE_CAP`, cameras/feed short
of `WIN_TARGETS` is Production + Reunion. `enterNextCasting` (the `t:'casting'` / `]` door) now
asks the fold the same way `progressShow` does. Execution kicker says Reunion at the cap, not
Casting. Gate: `party-night` N17p.

**H278 · the fold itself is never RENEWED at the cap on a miss.** DUSK6 chrome printed RENEWED /
"The season continues" while the driver wrote CANCELLED: W5 only fired when `phase.CASTING`
carried `episode`, and live `setPhase` wrote `{}`. `foldWin` now takes `aired`, reads
`cast.ballot`, and after the walk a cap miss on cameras or feed is W5 / CANCELLED. Gates:
`win-machine` W11–W11d, `party-night` N17q.

**The TV can now make a sound, and sound leaks differently from pixels.** An audio cue may only
be a function of state already painted on the current beat's HTML — never a pre-reveal internal,
never anything on `FOLLOW_FORBIDDEN`. Sound leaks through **timing and magnitude**, not just
content: a sting whose pitch tracked the real margin would tell the whole room something the
board does not, with nothing wrong on screen for a screenshot review to catch. `showCueViolations`
is to audio what `cueViolations` is to the follow iframe, and the voice is deliberately a **finite
table with no continuous parameter**, so there is nothing to ride. Gate: `party-audio`.

**The server does not author claims** (2026-08-28). `playEpisode` wrote `seat.cover ?? 'contestant'`
onto every living player, outside the `if (scaffold)` block, so on every live episode every phone
got a `players[].claim` column reading `contestant` except for one informing role name — the
Glitched. `party-isolation` I3b was supposed to guard that field and was circular: it accepted the
server's own `player.claim_set` as proof the owner had published. I3b now asserts provenance
against the DRIVER's record, I3c replays the reproduction as a live-night room, and `leak: 5` is
the control. A claim is a player verb (`roles.js` L82) and until it exists the number of claims on
the wire is zero. New too: **I1c** — `project`'s `unrowed` list is no longer thrown away, so a
field with no matrix row is a red line instead of a silent drop (`leak: 6` is its control).

**Known RED, with an instrument and no fix: the name tags bury each other** (2026-08-28).
`harness/tag-census.mjs` T7 fails on the shipped arm — 97% of one name hidden under a nearer one,
and only **4-6 of 8 names readable with room to spare at every camera position on the ring**.
Nothing is culled, cropped, occluded or shrunk: all 8 plates are in frame at all 82 measured
positions and the applied scale tracks the clamp to 0.001. It is packing — eight plates are
1238px laid end to end against 861px of arc between the outermost anchors, and past 8 m both
plates pin at `TAG_FAR_K` so apparent size goes as 1/d and the nearer one wins outright. **That
file is deliberately NOT in `gates:party`**, because a red gate in the chain reddens every push;
it is a finding with a measurement behind it. The fix moves where the tag floats relative to the
head, which is inside the locked tag rule below — **John's call, not a refactor.**

**A beat the TV paints for itself is provisional, and `ui.locked` had no way out** (2026-08-28).
`party-host.js` set `ui.beat` locally at four sites and never checked the local ones came true, so
a refused `t:'episode'` left the television on a locked EXPEDITION while every phone held CASTING,
with no recovery path. **The half nobody had named is worse:** `ui.locked = true` was the only
assignment in the file and nothing anywhere set it false, while both `armSendCountdown` and
`maybeArmFromBackstop` bail on it — so **after the first pair of the night the 3·2·1 could never
arm again and every later casting round waited out the server's 45s backstop.** Fixed by
`resolveBeatClaim`: a locally-set beat is provisional for 4s, after which the only beat the TV may
show is the last one the SERVER named, and the lock ends when the server names a beat a pair is
cast from. The roll-back target is read off the wire, never remembered locally. Rejected: "the
TV's beat must match the server's phase" (false by design — `playEpisode` runs ahead, so
`state.phase` legitimately reads VERDICT during a live expedition) and "never paint before the
server answers" (spends a round trip on the one cut of the night the room is watching).
**The refusal reason is not the invariant** — three doors reach the same screen: the server
refusing, the send never leaving (`PartyNightClient.send` is a silent no-op on a closed socket),
and a throw inside `handleClient`'s try/catch. Gate: `host-desync`.

**`t:'show'` is a door into a beat, not a repaint** (2026-08-28). It called `setShow` only, so the
dev `]` key and the host's shipped "Watch the run" workaround could leave a room on a RECKONING
screen the server was not in — `applyNominate` gates on `room.show` and lets the tap through,
`nominatePlayer` gates on `state.phase` and refuses it, and the `t:'nominate'` handler discards
the result, so **every nomination died with `not reckoning` and nothing on any screen said so.**
It now routes through the same `enter*Live` the clock uses. The naive coupling is a WORSE bug and
was rejected: `enter*Live` are transitions, not setters — `enterReckoningLive` clears
`state.nominations`, `enterExecutionLive` closes the ballot — and the server re-sends `show` more
than once per beat, so coupling it unguarded wipes a live Reckoning every time the TV repeats
itself. A same-beat send therefore re-broadcasts without re-entering. `lobby` and `expedition`
stay `setShow`-only on purpose, because `playEpisode` owns EXPEDITION and needs a locked pair.
Gate: `show-beat` — and per the `episode-order` lesson nothing in it is a hand-kept table, so
**SB2 reddens the day a ninth `SHOW_BEATS` entry is added without deciding which side of the door
it is on.** **Closed the same day:** `nominate` now pushes a `nomOk` receipt like `lynchVote`'s `ballotOk`.
`push`, never `fanout` — a nomination that lands is public, a nomination that is REFUSED is an
intention that never became a fact, and fanning it would put an attempted accusation on eight
screens the board deliberately does not carry. And the visible bug was never the silence: a phone
holding a debounce for a nomination that did not exist could not nominate again that episode and
read `Sending your nomination…` for the rest of the beat. Every reachable refusal is a race — the
pick list already filters yourself, the dead and anyone standing — which is exactly when a receipt
is the only thing that can tell you. Gate: `nom-receipt`.

**Smash-target visibility is guarded now, and the guard is RED** (2026-08-28). It was the last
live-found bug class with no regression net; `harness/target-sight.mjs` is the net, it is pure
node and runs 64 seeds in ~2s, and it reproduces the bug rather than clearing it: **24 of 64
seeds place a prop's body through the mission painting**, worst case **13% of the painting
visible from anywhere you could swing at it**. Two placers own one slot and neither knows —
`follow-bed.js:611` hangs the painting at `space.z0 + 0.22`, `furn-layout.js:238` puts a cam-wall
prop at the same coordinate, character for character — and the `vitrine` is inset 0.62 with a
drawn half of 0.651, so its body reaches behind the wall line. Separately, ~2% of nights seal the
mission room outright: `pickPlanSeed`'s `planPasses` asks the region graph, which cannot see a
door lost one stage later. **Not in `gates:party` until the shipped arm is green** — a red gate in
the chain reddens every push. Same standing as `tag-census.mjs`.

> ✅ **STATUS, 2026-09-01: that condition is met and this paragraph's RED is history.**
> `target-sight.mjs` is **in the `gates:party` chain** and its shipped arm is green — T1–T7 read
> *0/192 targets pierced*, *0 blind*, *worst 100% of the face visible*, *0 prop bodies inside a
> keep-out*. The measurement above is kept because the DEFINITION below it is still the thing to
> read before arguing with the gate; only the standing changed. **`tag-census.mjs` did NOT change
> and is still correctly outside the chain** — T7 reads *worst 100% buried, seat 7 at −55.8°* on
> the shipped arm, and per John brief overlap is fine, so that one is a finding and not a bug.

The definition it settled on is worth knowing before arguing with it: visibility and reachability
are ONE question here, because the smash is a ray with a finite `far`, and the runner has no
pitch control at all — `follow-bed.js`'s driven branch passes `{move, run, aimYaw}` and never
`aimPitch`, so a phone-driven runner is pinned at −0.06 rad all night. The swing is one shallow
fan, not a sweepable cone.

**The whisper's privacy was proven on the WIRE and never on a SCREEN** (2026-08-31, COUCH-PLAN
Rung 3, whisper half). `link-merge` L10–L14 assert the structure — `whisperAudience` returns two
ids, `fanoutViolations` refuses the verb `whisper` outright, the pair route pushes to socket ids —
and every one of those is about bytes. Both chromes were template literals inside a browser view,
so *"the partner pad shows the words and a third pad does not"* had only ever been checked by
opening six tabs. `harness/whisper-split.mjs` takes the photograph: a real server on 5347, one TV
and eight handsets, into DEBRIEF through the real beat door, John and Ellie pair into JELLIE, one
line goes out, and **one second later all nine screens are rendered from only the frames that
reached them.** Both halves moved into `src/party/link.js` so a node gate can execute the shipped
chrome — `whisperLines` (the pad's private list) and `pairShape` (the TV's public shape, with
`shapeLeaks` as its closed schema). Found while wiring it: **the television was missing a third of
the public shape.** `COUCH-PLAN.md` names it as *"who asked, who said yes, how long they held"*;
`pairBoard` had the first two, and `publicLinks` has carried `at` since the pair clock shipped with
a comment reading *"`at` rides along so BOTH screens can draw the countdown"* — only the pad ever
did. The board now prints `held Ns`, written in place on the existing 250ms tick (a repaint there
would strobe the TV through a five-minute Debrief). Controls, because six "0 hits" rows are worth
what the needle is worth: WS4b fires the same scanner where the words provably are, and WS4d has an
UNPAIRED pad shout a decoy that must reach nobody — the fail-CLOSED direction, live. Gate:
`whisper-split` (23 checks); fired against a leaky `applyWhisper` it goes red on WS2/WS3/WS4 with
the arms and controls still green.

**A source-reading gate must normalise newlines, or it reddens on one machine only** (2026-08-31,
found while landing the above). `host-desync` H8 binds its stand-in to the shipped `party-host.js`
with multi-line regexes, one of which spans `settleBeatClaim();` → `}` → the `full` line. A Windows
checkout hands that file back as CRLF, so a bare `\n` in the pattern misses by one invisible
character: **H8 was RED locally and GREEN in CI against byte-identical content.** That is the worst
shape a gate can have — the machine that reddens is not the machine anyone is looking at, so the
red reads as real drift in a file that was already correct, and the tempting "fix" edits the
product. H8 now reads the file and normalises to LF, which is what the blob in git holds. Any new
gate that greps a source file for a pattern crossing a line break needs the same line.

**The seal on the feed count was airtight and had NO OTHER END** (2026-08-31, COUCH-PLAN Rung 4).
`rrr-social-round.md` §4 holds the feed count back from the Verdict because the gauge is a
deliberately lossy proxy — evil losing a partner looks exactly like evil winning — and every guard
on the way in was built: `room.js` writes it `VIS.SEALED`, `enterVerdictLive` picks fields off the
fold, `FANOUT_KEYS.verdict` closes the schema, `party-night` N17h0b watches the wire, `party-warm`
W47c watched the screens. **Nothing opened it at the Reunion.** `reunion()` returned four beats and
none was the number, `FANOUT_KEYS.reveal` had no row, and no screen could print one — so *"held back
until the Reunion"* held it back past the last frame of the season, and W47c's whole-file `.fed` ban
had quietly become the ENFORCEMENT of that. A ban is the right gate for *"this does not exist
downstream"* and the wrong one for *"this is withheld from ONE BEAT"*; W47c is now per-beat (the
Verdict chrome may not name it, the Reunion chrome is the only thing that may) and W47c2 asserts
both Reunion screens really print it — the half a ban can never have. New: `feedCount` in
`reunion.js` (a query over `win.checked`, same shape as `chatUnmixed`; **null, not zero**, when no
verdict was ever folded), `reveal.feed` with `FANOUT_KEYS.revealFeed` as its closed schema, and a
ledger line on the pad and on the Director's Cut plate. `reunionSpecial` reads the SAME
`WIN_TARGETS[count]` row `foldVerdict` handed `foldWin`, so the bar printed is the bar the season
was judged against. Gate: `room-ghosts` RG3/RG4/RG6, `party-warm` W47c/W47c2.

**The Reunion's reach was gated on ONE phone, and the failure was all eight** (2026-08-31).
`party-night` N17m sweeps `p1x` by design — its header says *"It sweeps the PHONE, not the TV"* —
which is the right gate for the reveal's SHAPE and cannot see the blind-play finding, where the
Reunion reached **0 of 32** pad records across four nights. `harness/room-ghosts.mjs` is
`whisper-split`'s method pointed at the other end of the night: a real server on 5351, one TV and
eight handsets, one socket killed mid-casting, then every screen in the room rendered from only the
frames that reached it. Rung 3 proved a thing reaches exactly two people; this proves a thing
reaches exactly everybody. Also banked there: a **dropped socket is not a dead player** — it is in
`livingSeatedIds` and in `livingFromPublic` (which reads `alive:false` / `player.executed` /
`player.taken`, and a dark handset is none of those), so "wait for every living phone" is not slow,
it is *unsatisfiable*, and the backstop is the only thing that can ever fire. And `speakerNamed` /
`selfNamingLines` are a **fail-closed guard placed before the feature**: nothing in `src/` or `net/`
emits `chat.posted` — the *"Cy is clean," said by Cy* lines are all `_loop8` sim puppets — so RG5b
states the zero-of-zero out loud rather than letting it read as coverage. `generated` is the filter:
a human naming themselves is a bluff, not a bug. Gate: `room-ghosts` (33 checks).

**Two boards wore one class, and a stale `dist/` hid it** (2026-08-31). Rung 1's scorekeeper put
`tallyBoard` in `aside`, which renders AHEAD of the nominations on the same Reckoning beat and is
also a `.nom-board` — so `phone-accusation`'s `querySelector('.nom-board')` silently started reading
`5 OF 8 CLEARS` with zero chips, red against a television that was airing both nominations
correctly. It stayed green for two full-suite runs because that gate serves the BUILD, so it only
turned over on the next `npm run build`. **A browser gate is only as fresh as `dist/`; build before
believing one.** The nominations board now carries a `noms-board` handle the way every other board
in the file already did (`pair-board`, `lynch-board`, `roll-board`, `tally-board`) — additive, so
existing selectors and CSS keep matching.

**The night book counted DOORS INTO CASTING, and a live night opens two per episode** (2026-09-01).
`room.js` has two callers of `setPhase('CASTING')` — `playEpisode` (`:529`, the offline machine) and
`beginCasting` (`:836`, the live door behind `t:'casting'` / `]`). Offline only the first fires, and
that is the ONLY shape `episodesFromLog` had ever been tried against, because `friday-couch`'s
driver is `createRoom` + `playEpisode`. **On a socket a real night's log reads `1,1,2,2,3,3,4,4`**,
so the reader — which opened a record on every entry and numbered them `eps.length + 1` — gave a
four-episode night EIGHT records: four filed under the wrong numbers, four empty shells with no
pair, no nominations and no votes, **each still printing a scorekeeper bar into `bookLines`**. That
is the module's own worst case, executed: `quoteCheck` is exact membership, so *"4 of 5 clears"*
**verified** for an episode that never aired. Night one was recorded as a **DRILL** for the same
reason — the job was keyed off the array length too, and the real premiere was never the zeroth
record, so the locked two-jobs rule was mis-stated in the night's own book. Fixed with the number
the event already carries: H278 put `{ episode }` on `phase.CASTING` for `foldWin`'s cap and it
answers this as well, so a CASTING for the episode already open is a RE-ENTRY. A log whose entries
carry no episode (`setPhase` used to write `{}`) keeps the old behaviour — a missing number is not
evidence of a repeat. The job now comes from `missionFor`, the rule's one owner, not a second copy
of *"the first one is the smash"*. Found by `harness/_night-table.mjs`, a probe that plays one
season on a real server (`:5186`, one TV + eight handsets) and photographs all nine screens. Gate:
`friday-couch` FC4d–FC4f — FC4d is the arm that the doubling really happened, FC4f re-states the
old rule so the failure is executed rather than described, and both measure against the LOG's
ground truth rather than against the reader under test.

Known **undecided**, and it is John's call rather than a refactor: `COMPOSITION[n].cameras` and
`WIN_TARGETS[n].cameraTarget` disagree — **3 against 4 at eight players** — and both files
describe theirs as how many cameras must be lit to win. The running state counts against the
first; `foldWin` decides W2 against the second. The Verdict plate reports the fold's number,
because the plate is a report on the fold, and carries it on the wire so it cannot drift.

## Working style

- Land work on a branch, let `gates:party` go green, then merge. Never push to `main` directly.
- File ownership is exclusive when agents run in parallel (`ORCHESTRATION.md`) — note that file's
  own status line is stale, but the ownership table still governs.
- Findings go into **the instrument that proves them** (the gate's header) plus one line here.
  Not into a transcript.
