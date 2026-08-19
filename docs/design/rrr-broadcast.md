# The Broadcast Director — PRIME TIME's television

Spec for the TV surface. **Authority:** `web-prototype/docs/design/party-loop.md` wins any
disagreement; `rrr-social-deception-mode.md` D1/D8/D9 and pillars **P1** (the broadcast is the
Storyteller) and **P10** (atmosphere never breaks) are the frame.

Under D9 a pair acts and **six of eight players see nothing but the TV** — for those six the
broadcast *is* the game. The objective is **camera unlocks**, so the broadcast is also the
progression bar: succeed and the show gets more angles. The Director is the Showrunner's hand, and
it is what makes an authored blind spot read as an edit rather than as concealment.

---

## 0. What exists today, and what is new

Measured against `web-prototype/` on this branch. Plainly: **no broadcast camera exists.** These
are the pieces to build it out of.

| Piece | Where | Reuse |
|---|---|---|
| `ThirdPersonCamera` — spring arm, lag, occlusion pull-in, shoulder swing, shake | `src/game/player.js:1628`, constructed at `src/views/game.js:1449` (`distance: 3.1, shoulder: 0.44`) | **This is the FOLLOW shot, already tuned.** Take it as-is |
| **WORK FRAMING** — swings the body out of frame when the robot is hammering a wall, and is gated off while the hunter is committed | `src/game/player.js:1502` (`workEnabled`/`workAllowed`), cleared per-frame at `src/views/game.js:3084` | **This is the WORK shot.** The gate is already "cut to the chase instead" |
| Ranked caption arbiter — `RANK {place:1, deny:2, alarm:2.5, wound:3}`, `MIN_HOLD 0.62`, `MIN_RESTORE 0.75`, `QUEUE_MAX 3`, with `say()`/`defer()`/`enqueue()` | `src/ui/hud.js:104-110`, `:340`, `:369`, `:375` | **This is the cut arbiter, one level up.** Same algorithm, shots instead of captions |
| Multi-viewpoint residency — `setViewpoints(views[])`, "written for split screen" | `src/game/room.js:1436`, used `src/views/game.js:3157`/`:3179` | **Split-screen is already possible** without a residency branch |
| Hunter commit latch + threat channel | `src/game/hunter-ai.js:238` (`onCommit`), `:271` (`committed`), `src/ui/hud.js:712`/`:726` | The rank-3 event source, already a latch (cannot flicker) |
| `HUNTER_SENSE`, `NoiseBus.recent()` | `src/game/rules.js:259`, `src/game/noise.js:186` | Event feed for `[LOUD CRASH — EAST WING]` lower thirds |
| **Fly-over** — roofless top-down, `flyover.overlay` / `flyover.senses` / `flyover.you` / `flyover.hunter` | `src/views/game.js:2273` (`placeFlyCamera`), `:2451-2460` (named nodes), `[F]` at `:2955` | **PHONE ONLY. Forbidden on the TV** — see §6. Named nodes make that assertable |

New, all of it: the shot library, the event bus, static RRR cameras as world objects, the
camera-unlock roster, the lower-third/nameplate/chat layer, the cutaway budget, and the
info-isolation boundary that keeps alignment out of the Director's scope.
## 1. The camera model

### 1.1 Shots

Every shot is a solver — `(world, subject, t) -> {eye, at, fov}` — plus an availability predicate.

| Shot | Solve | Available when |
|---|---|---|
| `BODYCAM` | `ThirdPersonCamera` on the runner. The default bed | Always (CAM 01 is never lost) |
| `WORK` | Bodycam with `workAllowed = true` — body swings clear of the wall face | Runner is swinging / at a terminal |
| `STATIC` | A fixed RRR camera bolted in a room corner, eye 2.4 m, 46° fov, looking at the room's long axis | That camera is **unlocked** and its subject is in frustum, unoccluded (`room.castRay`) |
| `STING` | A 1.2 s low, tight push on the hunter's silhouette crossing a doorway — red eyes only, no path, no destination | Hunter is inside an unlocked STATIC's frustum |
| `REACTION` | Bust of one seated robot in the circle, or a 2-shot | Always (the circle is always rendered) |
| `CONFESSIONAL` | Seated robot, off-centre, letterboxed, name super | Cutaway budget remains (§3) |
| `SPONSOR` | Full-frame card, no world render | Dead air ≥ 5 s with no rank ≥ 2 event |
| `SPLIT` | Two shots side by side through `setViewpoints([a, b])` | ≥ 4 cameras unlocked, two rank ≥ 2 events in different rooms |

There is **no establishing wide, no aerial, no roofless shot.** That is the guide's map with better
lighting — §6.

### 1.2 The event bus

The sim emits, and the Director consumes, only `{ t, rank, kind, subjectId, roomId, pos }`. `kind` ∈ `place | progress | blow | channel_open | terminal | cam_unlock | noise | hunter_alert |
hunter_commit | grab | taken | task_result`. **No alignment field exists in this struct**, and the
Director imports no role source; §8/B2 tests it.

| Rank | Events | Director contract |
|---|---|---|
| 1 | `place`, idle ambience | Fills seams. Yields to everything |
| 2 | `blow`, `progress`, `noise` above `HUNTER_SENSE.hearFloor` | Cut to it if the current shot has had `MIN_HOLD` |
| 3 | `hunter_alert`, `hunter_commit` (`onCommit`), `channel_open` | Pre-empts immediately; defers what it interrupted |
| **4** | `terminal`, `cam_unlock`, `grab`, `taken`, `task_result` | **Never cut away from. Never off-screen.** The one hard guarantee |

### 1.3 Cut rules

`MIN_HOLD = 1.4 s` (no cut before this, except a rank-4 pre-empt) · `MAX_HOLD = 6.0 s` (a shot with
nothing happening must re-solve; a locked wide is unwatchable) · `CUT_LEAD = 0.25 s` (the cut lands
within this of the event boundary — cut **on** action, not after it).

Subject score, evaluated every 0.2 s over all available shots:

```
S = rank * 10
  + 4 * recency(lastEventOnSubject)      # exp decay, tau = 2.5 s
  + 3 * continuity                       # +3 if same subject as current shot (do not ping-pong)
  - 5 * staleness(shot)                  # this shot's airtime in the last 20 s, normalised
  - 8 * occluded                         # subject not clear in this frustum
  - 6 * repeatAngle                      # this exact shot aired within the last 8 s
```

Highest score takes the slot under **`hud.js`'s arbitration verbatim** (`src/ui/hud.js:340`): higher
rank pre-empts and *defers* (the interrupted shot returns if ≥ `MIN_RESTORE` of its interest remains);
equal rank waits out `MIN_HOLD`; lower rank queues, capped at `QUEUE_MAX`.

Target cadence (§8/B3): **12–22 cuts/min**, median shot 2.2–3.5 s — a 90 s expedition is 25–30
shots. That is television. Six shots is a security monitor.
## 2. Camera unlocks — the progression, on screen

Cameras are the objective (`party-loop.md`). Each terminal reached lights one **RRR camera** in a
named room — a real world object with a real frustum. It sees the hunter, it sees the *other* robot,
it sees nothing outside its room. Coverage is genuinely partial, and that is the point.

| Cams | Roster | What the round looks like | What is unlocked as a *capability* |
|---|---|---|---|
| **1** | `BODYCAM` | One subject, forever. Everything not in front of the runner is audio only. The seams are held by lower thirds, confessional cutaways and chat. Deliberately thin | — |
| **2** | +1 `STATIC` | The first reverse angle. The audience sees the runner *arrive* somewhere instead of only arriving with them | Reverse angle |
| **3** | +1 `STATIC` | The Director can pre-position: cut to the room the runner is walking into. **First dramatic irony** — you see the hunter before the runner does | Anticipation |
| **4** | +1 `STATIC` | `SPLIT` unlocks. Guide-driven detours no longer cost coverage | Split-screen |
| **5+** | +`STATIC`… | `REPLAY` unlocks: a 4 s pose-track replay of the last rank-4 event, badged `REPLAY`. The blind spots shrink and the arguments get sharper | Replay |

**Legibility is not optional.** Anyone walking in mid-game must read the score off the screen:

- **Camera wall** bug, top-right: `04/09 CAMS ONLINE` over nine slots, lit / dark. Dark slots are
  drawn from round one, so the ceiling advertises itself before it is earned.
- Every unlock plays a 2.5 s `CAM 04 ONLINE` wipe that **cuts to the new angle and holds it** — the
  reward is the shot, not a toast.
- Cameras only ever go up; a failed task leaves its slot dark ("that terminal's cameras stay dark").
- Shot bug, bottom-left: `CAM 03 · EAST GALLERY · LIVE`.
## 3. Deliberate blind spots

Three things produce a gap; only the third is authored:

1. **Coverage gaps** (honest). No camera covers that room — `NO SIGNAL — CAM UNAVAILABLE`, or stay
   on the bodycam. This is the progression speaking.
2. **Composition gaps** (mechanical). Two events at once, one camera. The loser is off-screen; the
   audio still plays.
3. **Authored cutaways** (the Storyteller). The Director *chooses* to leave. These are the deniable
   blind spots players argue about — P1's whole payload.

**Rules that make a cutaway read as television rather than concealment:**

- **Motivated.** Never cut to black. Cut to a face, a chat spike, a sponsor, a confessional — the
  audience is always watching something they want to watch.
- **Audio never cuts.** You hear the crash you did not see — the deniability engine: everyone knows
  *that* it happened, nobody knows *who*. This is §5.6's INCIDENT COUNT, live.
- **Return to the aftermath, not a new scene.** Same room, 3–6 s later, in whatever state it is in.
  The gap is legible as a gap.
- **Name it as production.** `[FEED INTERRUPTED]`, `[CENSORED FOR LEGAL REASONS]`, `WE'LL BE RIGHT
  BACK`. Never `[LOADING]`.
- **Budget it.** `cutaways = min(3, ceil(cameras / 2))` per expedition, ≤ **12%** of round airtime.
  Over that it stops reading as an edit. And never twice from the same subject in one round.
- **Rank 4 is untouchable** — a task resolving, a camera lighting, a runner taken. Not because the
  game must be fair, but because television does not cut away from its own climax.

**The neutrality invariant — the most important line in this document.** Cutaway targets are drawn
from a seeded RNG over the round seed, weighted only by cutaway-count-so-far (least-cut subject wins
ties). The Director **cannot** read alignment, because alignment is not in its scope. If cutaway
frequency ever correlates with alignment, the edit becomes an oracle and P1 dies. Tested in §8/B2.
## 4. Screen layout

```
┌──────────────────────────────────────────────────────────────┬──────────────┐
│ ● RRR LIVE   EP 03                          04/09 CAMS ▮▮▮▮□□□□□            │
│                                                              │  CHAT        │
│                                                              │  ▸ …         │
│                    [ THE LIVE FEED — full bleed ]            │  ▸ …         │
│                                                              │  ▸ …         │
│   ┌────────────────────────────┐                             │  ▸ …         │
│   │ [LOUD CRASH — EAST WING]   │  ← transient lower third    │ ┌──────────┐ │
│   └────────────────────────────┘                             │ │3 OF THESE│ │
│ CAM 03 · EAST GALLERY · LIVE                    SEGMENT 1:04 │ │5 ARE TRUE│ │
├──────────────────────────────────────────────────────────────┤ └──────────┘ │
│ ⬤VIC   ⬤SAM   ⬤JO    ⬤KIT   ⬤ROO   ✕ALI   ⬤MO    ⬤BEN      │              │
│ "sound" "—"  "fixer" "—"   RUNNER  (out)  GUIDE  "producer"  │              │
└──────────────────────────────────────────────────────────────┴──────────────┘
```

**Permanent — never leaves the screen, in any phase, including ad breaks:**

- **Nameplate rail** (bottom, seat order). Per player: name, **current public claim** (P9 — set from
  the phone, default `—`), ALIVE / OUT (out = desaturated, ✕, struck through), and this round's
  `RUNNER` / `GUIDE` badges. **Never alignment, never true role.**
- **Camera wall** + `N/M CAMS ONLINE`; **shot bug** `CAM 03 · EAST GALLERY · LIVE`.
- **Show bug** `● RRR LIVE` + `EP 03` (P10 — an episode number, never "Round 3 of 5").
- **Chat column** (§5), including the pinned tips card during the Debrief.
- **Segment clock** as a rundown chip, `SEGMENT 1:04` — reuse `hud.setRunClock()`
  (`src/ui/hud.js:807`), the dimmest thing on screen.

**Transient:** lower thirds and name supers, `CAM 04 ONLINE` wipes, sponsor stings, confessional
cards, replays, reaction-bar emote bursts, the outcome card, `NO SIGNAL` static.

**Ten-foot rules.** At 3 m on a 1080p panel: nameplate name ≥ 30 px, claim ≥ 24 px, chat ≥ 22 px,
lower third ≥ 34 px; all text ≥ 4.5:1 on an opaque plate, never straight on the feed; nothing
important within 4% of an edge; every state change carries a non-colour channel (strike-through for
out, a lit/dark glyph for cameras) because half a party room is looking at the screen sideways.
## 5. The chat

One column, right side, 9 lines visible, 400 ms fade-in. Four sources, one visual treatment:

| Source | Behaviour |
|---|---|
| **Generated crowd** | Showrunner template bank keyed off real events (`[crash]`, `[name] went upstairs`), seeded per round |
| **Dead players** | Typed on their phone. Assigned a handle from the *same pool* at death, stable for the game |
| **Tips** | Five statements with a stated truth count, pinned as a card during the Debrief (§10.3) |
| **Sponsor bots** | Spam. Pure texture, keeps P10 |

**The mixing rule — the whole design (D4, §10.2).** A dead player's line must be indistinguishable
from a generated one: same font, same 6-colour handle palette (assigned by hash, never by liveness),
no badge, no ordering privilege. Delivery passes through a shaper matching the generated stream's
inter-arrival distribution — a dead line is held 0–1.5 s, so burst typing does not read as human.
Dead lines are **never dropped**; generated lines drop at the 3 msg/s cap. A chat that lags reality
is a chat nobody reads.

**Tips.** `"3 OF THESE 5 ARE TRUE"` is a header on a **pinned card**, not five inline messages —
inline, they scroll away before anyone finishes reading. The stated count is a hard generator
invariant (§8/B7). The Fan Favourite's lock renders as a `◆`; Favour-bought tips append to the same
card and increment the denominator.

**Chat may never contain:** a true role, an unpublished claim draft, an alignment, `X sabotaged Y`
(§5.3), or wall stage health — it is generated from the same event bus as the Director, which has
none of those in scope.
## 6. Never do this

Derived from `party-loop.md`'s **Do not** section, plus what follows from it.

1. **Never put the guide's flyover on the TV.** No top-down, no roofless view, no minimap bug, no
   route line, no plan diagram. `placeFlyCamera` (`src/views/game.js:2273`) is a phone-only view.
2. **Never draw the hunter's path**, its destination, its awareness value, or the sense overlay
   (`flyover.senses`, `src/views/game.js:2453`) on the TV. The hunter appears only as a silhouette a
   real camera can actually see.
3. **Never give evil red eyes.** Red eyes are the hunter's silhouette and nothing else.
4. **Never build a ghost UI.** The dead get a chat handle — no spectator free-cam, no camera
   control, no private feed, for anyone, ever (D1). And never treat `session-model.md` as the spec.
5. **Never break the frame.** No menus, no "Round 3 of 5", no spinner, no debug text. Ad break (P10).
6. **Never show alignment, cause or attribution** in a caption, replay, outcome card or chat.
7. **Never cut away from a rank-4 event**, and **never let the Director read alignment** — not to
   choose a cutaway, not to choose a subject, not to weight a score.
8. **Never leak wall stage health or channel progress as a number.** `net/server.mjs` already holds
   this line ("it would leak how close a wall is to opening"); the TV must not undo it. Blows are
   shown as *blows landing*, never as a progress bar.
9. **Never show the runner's private prompts or the guide's callouts as on-screen text.** The guide
   talks out loud, in the room. That is the game.
## 7. Build vs fake in v1

**Minimum viable director (M4b, one sentence):** *the ranked event bus, three shot solvers
(`BODYCAM`, `WORK`, one `STATIC` per unlocked camera), the `hud.js` arbiter re-pointed at shots with
`MIN_HOLD`/`MAX_HOLD`, and a lower-third renderer over the nameplate rail and camera wall* — nothing
else. That alone is watchable, and it must be proven before the rest is worth building.

| Must build | Can be faked in v1 | Cut from v1 |
|---|---|---|
| Event bus + rank table (needed by the event log for the Reunion, D5 — lay it down at M3) | **Confessionals**: a still bust render + a canned caption. No animation, no recorded audio | Real camera operators / smoothed dolly moves |
| Cut arbiter (port `src/ui/hud.js:340`) | **Sponsor stings**: 6 pre-rendered cards, shuffled | `REPLAY` (needs a pose-track ring buffer) — ship at 5 cams or later |
| `STATIC` shot solver + per-camera frustum/occlusion test | **Chat generation**: template bank + seeded shuffle. No LLM in the loop | Crowd audio mixing beyond a single stinger bed |
| Camera roster, unlock wipe, camera wall | **Split-screen**: `setViewpoints([a,b])` already exists (`src/game/room.js:1436`); two viewports, no compositing polish | Producer's Note (§5.5 — deliberately unshipped) |
| Nameplate rail + claim sync from phones | **`NO SIGNAL`**: one static card, not a per-camera degradation model | Multi-angle instant replay |
| Info-isolation boundary + its test | **Grade change per feed**: reuse `GRADE_PRESETS` (`src/post/pipeline.js:63`) — a STATIC gets more grain, less bloom | |

**Perf caution (audit A1).** The **≤ 625 draw call** budget is a single-player budget. A seated
circle of eight plus one live feed has never been measured, and `SPLIT` doubles the resident set.
Measure at M2 before art is committed to the circle; gate `SPLIT` on that number.
## 8. Verification

Extends §16.2 of the bible. **V18 is the parent gate**; B1 is its concrete form.

| # | Gate | Method | Pass |
|---|---|---|---|
| **B1** | **No key event is ever fully off-screen.** The headline test | Replay 500 recorded rounds through the Director headless. For every rank ≥ 3 event: assert the subject was inside the active shot's frustum and unoccluded for ≥ 0.6 s within ±1.0 s of the event, **or** the Director emitted `cutaway{intentional:true, reason}` | **Zero** unexplained misses. Rank 4: zero cutaways permitted at all |
| **B2** | **Cutaway neutrality** | (a) Static: assert the Director's import graph contains no role/alignment module. (b) 1000 sim games, cutaway count per player by alignment | (a) clean. (b) χ², p > 0.05 |
| **B3** | **Cadence** | Instrument shot changes over 500 rounds | No shot < `MIN_HOLD` except rank-4 pre-empt; none > `MAX_HOLD`; 12–22 cuts/min; median 2.2–3.5 s |
| **B4** | **Unlock legibility** | Screenshot at 1/3/5 cams via `harness/audit.mjs --render`; assert lit-slot count matches state. Then show a still to someone who was not watching | They say the right number, unprompted |
| **B5** | **No map, no hunter path** | Scene-graph assertion on every TV frame: `flyover.overlay`, `flyover.senses`, `flyover.you`, `flyover.hunter` absent (they are named at `src/views/game.js:2451-2460` precisely so this is cheap). Plus: TV camera pitch never below −60°, eye height ≤ 3.2 m | Zero violations across a 100-round soak |
| **B6** | **Chat indistinguishability** | Blind classification: 200 mixed messages, humans label dead-human vs generated. Automated: KS test on inter-arrival times of the two streams | Human accuracy 45–55%; KS p > 0.05 |
| **B7** | **Tips invariant** | 10k generator draws | Exactly the stated count true, every time |
| **B8** | **Couch readability** | Render 1080p stills, downscale to 1/3, run the `rrr-critique` identification gate on the nameplate rail and chat | Every name, claim and alive/dead state still legible |
| **B9** | **Second-screen rate** (the real test, §16.5) | Playtest: someone counts how many of the six non-crew players look away from the TV during the expedition | ≤ 1. Two or more means the broadcast has failed and D1 is back on the table |
| **B10** | **Perf** | Draw-call probe with the seated circle + live feed, and again with `SPLIT` | ≤ 625 both arms |

Debug: extend §16.4's Director's Cut overlay with the live shot-score table, the cutaway ledger and
every event on the bus with its rank. You cannot tune a director you cannot watch thinking.

**And the one that is not automatable.** Watch a round you are not in. Was it worth watching? If the
answer is no, nothing above matters.
