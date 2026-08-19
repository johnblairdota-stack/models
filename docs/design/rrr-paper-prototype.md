# PRIME TIME — the paper prototype (M0)

Everything you need to run the social loop at a table, with no code. **Prep: 15 minutes. Session: 40.**

> **What this tests, and what it doesn't.** The 17 gates prove the mechanical scaffolding isn't broken. They cannot tell you whether the game is *fun*, whether a lying guide is catchable, or whether six spectators stay interested. Those are the four risks the build brief calls fatal, and a table of eight resolves them in one evening.

---

## 1. What you need

| | |
|---|---|
| **6 room cards** | Index cards: CELLAR · BALLROOM · CHAPEL · STUDY · HALL · GALLERY |
| **3 camera tokens** | Coins. Each covers a fixed pair — see §2 |
| **1 Hunter token** | Something ugly |
| **1 runner token, 1 terminal token** | Anything |
| **Sight slips** | ~40 small slips. Half pre-written `NO SIGNAL`, half blank |
| **Role cards** | §6, cut out |
| **Nameplates** | One folded card per player, stood in front of them |
| **Ballot slips** | ~60. Casting, votes, and the survey |
| **A phone timer** | Loud |
| **One Showrunner** | Not a player. This is the job — see §4 |

**Deliberately absent: any screen.** The TV is the Showrunner's mouth. If a beat only works because someone can see a map, it will not survive the real build either.

---

## 2. The mansion

Lay the six cards in a 2×3 grid. Rooms are adjacent orthogonally.

```
   CELLAR   BALLROOM   CHAPEL
   STUDY     HALL      GALLERY
```

**Camera pairs** — these are the shipped roster (`coverage.js`, worldSeed 7), so what you learn transfers:

| Camera | Covers |
|---|---|
| **CAM 1** *(live from the start)* | CELLAR + BALLROOM |
| **CAM 2** | CHAPEL + STUDY |
| **CAM 3** | HALL + GALLERY |

Coverage runs **33% → 67% → 100%** as they unlock. That curve is the whole progression: round one the guide is nearly blind, and by the end they can see.

---

## 3. Setup by player count

Evil is **1 at 4–5 players, 2 at 6–8**. Deal one card per player, face down. Nobody reveals anything, ever.

| Players | Evil | Cameras to win | Always in the bag | Draw the rest from |
|---|---|---|---|---|
| **4** | 1 | 2 | Camera Op · Producer · Contestant | Stunt Double, Editor, Fan Favourite |
| **5** | 1 | 2 | Camera Op · Producer · Glitched | Stunt Double, Editor, Fan Favourite, Continuity, Focus Puller |
| **6** | 2 | 2 | Glitched · Continuity · Stunt Double · Fixer · Producer | Fan Favourite, Focus Puller, Editor, Camera Op |
| **7** | 2 | 3 | Producer · Contestant · Continuity | one minion (Fixer/Plant), one Outsider, plus informed roles |
| **8** | 2 | 3 | Focus Puller · Continuity · Camera Op · Plant · Producer | Static, Method Actor, Fan Favourite, Glitched, Stunt Double, Editor |

**The Glitched needs one extra step.** Hand them a role card for a role that *receives information* — Camera Op, Focus Puller or Continuity — and say nothing. They believe it all game. If that role is genuinely in play too, **that is correct and intended**: two players will claim it, both honestly, and the table has to work out which reading to trust.

---

## 4. The Showrunner

You are not a player and you cannot win. Your job is to be the television: keep time out loud, narrate with commitment, and **never let a silence be an accident**.

Three rules you must not break:

1. **Never say who caused anything.** Not "the guide sent him wrong", not "that was deliberate". You may say *"the camera shorted"*, *"there was a crash in the east"*, *"he's out"*. This is Task Contract T5 and it is the single easiest way to destroy the game from the chair you're sitting in.
2. **Never reveal an alignment.** Not on a death, not at the end of an episode, not by tone. Only at the Reunion.
3. **Roll where they can't see, and never re-roll.**

---

## 5. The episode

**Episode 1 stops after the Debrief — there is no vote.** Nobody has anything to go on, and an eviction decided on nothing teaches a table that the vote is arbitrary.

### 5.1 CASTING — 45 s

Announce the task and the wing *first*, then everyone writes two names on a slip: **runner**, then **guide**. Read every ballot aloud, attributed.

Highest runner-count takes the runner chair. Highest guide-count of the remainder takes the guide chair. Ties: fewest expeditions so far → whoever went longest ago → your call, stated out loud.

**Last episode's runner may not run; last episode's guide may not guide.** They may swap. Once per game a player may **refuse the chair** — loud, permanent, and the runner-up takes it.

### 5.2 THE EXPEDITION — 90 s ⏱

Place the Hunter on a room (d6, hidden). Place the terminal at least two moves from HALL. Runner token starts in HALL.

**The guide gets a sight slip. The runner sees nothing, ever.**

Then repeat until the terminal is reached or the timer goes:

| | |
|---|---|
| **1** | Runner declares **CREEP** or **RUN**, out loud |
| **2** | Runner names one adjacent room |
| **3** | The guide may say anything, at any time |
| **4** | Move the runner. Then move the Hunter: **RUN** → one room *toward* the runner. **CREEP** → d6 wander |
| **5** | Same room? **TAKEN.** The runner is out of the mansion for the rest of the game |
| **6** | Hand the guide a new sight slip |

**The sight slip is the whole prototype.** Look at where the Hunter is:

- On a room a **live camera** covers → write the room name on a blank slip
- Otherwise → hand over **`NO SIGNAL`**

With one camera live, two of every three slips say NO SIGNAL. **The guide has to guess, and a guess is honestly wrong half the time.** That is the honest error rate the whole design rests on — and it is why nobody can prove a lie.

> **Evil's levers.** The guide lies about a slip. The runner declares RUN at a bad moment — loud, visible, and completely deniable as panic. And once per episode **the Producer** may pass you a folded slip naming a room; the Hunter moves toward *that* instead. Take it without comment.

**Reaching the terminal unlocks the next camera.** Say which one, and turn the coin face-up where everyone can see.

### 5.3 THE DEBRIEF — 75 s

They talk. You say nothing except the three facts:

> *"Camera two is live."* · *"Nobody was taken."* / *"He's out."* · *"Two alarms this episode."*

**A number, never a name.**

### 5.4 THE RECKONING and THE VOTE — 45 s + 25 s

Any living player may nominate once; any player may be nominated once; **no self-nomination**; three standing nominations maximum. 20 seconds each to the nominator and the accused.

Then one simultaneous ballot: every living player writes one name or `NO ONE`.

**A player is executed only on strictly more than half of the *living*.** Not half of votes cast — half of everyone still alive. So abstaining protects the accused, and **two people can never tie**, because two players cannot both hold more than half.

The nominator mimes the sledgehammer. Turn the nameplate **face down**. **Say nothing about what they were.**

### 5.5 THE VERDICT — 15 s

Exactly one of:

- **RENEWED** — play on
- **CANCELLED** — evil wins *(all cameras not lit by the last episode, or evil ≥ good, or 3 goods taken by the Hunter)*
- **SEASON FINALE** — good wins *(all cameras lit, or all evil dead)*

**Five episodes maximum.** That's what keeps the session under 40 minutes.

---

## 6. The role cards

Cut these out. One line each — if you have to explain it twice, write down which one.

**CAST — good**

> **CONTESTANT** — You have no special ability. You're just here to win.
> **CAMERA OP** — Each episode, learn whether the Hunter noticed the runner by **sight** or by **sound**.
> **FOCUS PULLER** — Each episode, learn how many seconds the Hunter was visible on the guide's map.
> **CONTINUITY** — Once per game, as a pair is announced, learn whether **that pair contains a member of Production**.
> **THE EDITOR** — Once per game, force the show to re-air ten seconds **raw and uncut**, at a moment you name.
> **FAN FAVOURITE** — Once per game, mark one rumour **guaranteed true**.
> **STUNT DOUBLE** — Once per game, name the runner as they leave: the first thing the Hunter takes is a **limb, not the episode**.

**CAST — but a liability**

> **GLITCHED** — *(they get another role's card and are never told)*
> **THE STATIC** — When you guide, your slip is always one turn out of date. *(Not told.)*
> **THE METHOD ACTOR** — The show writes a role on your nameplate each episode. You may change it — after everyone has read it.

**PRODUCTION — evil**

> **THE PRODUCER** — Once per episode, from your chair, send the Hunter toward any room.
> **THE FIXER** — You know Production. Once per game, rig a room: the next expedition entering it loses a turn.
> **THE PLANT** — You know Production. You register as **good** to every information role.

Evil learn each other at the start — a nod round the table while everyone's eyes are shut.

---

## 7. The three numbers

Take these or the evening proves nothing.

### ① Is the lie catchable? — **the one that matters**

**After every expedition, before anyone talks**, everybody writes `LIED` or `HONEST` about the guide. Collect, then compare against the truth.

| Accuracy | Verdict |
|---|---|
| **Under 50%** | The lie is invisible. Evil is too strong — raise coverage or shrink the mansion |
| **55–70%** | ✅ **The design works.** Evidence, never proof |
| **Over 80%** | Evil is transparent. Cut a camera, or widen the board |

This single number decides whether the mode is a game or a lie detector, and one evening answers it.

### ② Is it worth watching?

During each expedition, count how many spectators look at **their own phone for three seconds or more**. Turning to argue with a neighbour is the design working — only the phone counts.

**More than a third is a warning. Half means the broadcast has failed.** Take it from episode 3 onward; novelty carries episode 1.

### ③ Does it fit?

Wall-clock each phase. Target **32 minutes**, hard ceiling 40. Note any phase that overran and by how much.

---

## 8. Record sheet

One row per episode.

| Ep | Runner | Guide | Guide lied? | Slips: signal/none | Outcome | Taken | Executed | Lie-detect % | Second-screen | Length |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | | | | / | | | *(no vote)* | | | |
| 2 | | | | / | | | | | | |
| 3 | | | | / | | | | | | |
| 4 | | | | / | | | | | | |
| 5 | | | | / | | | | | | |

**Post-game, in one line each:** Was it fun? Did you understand your role? Did you ever have nothing to do?

---

## 9. The Reunion — don't skip it

Five minutes, and it's what the silent deaths were *for*.

1. **Roll call.** One at a time, flip every nameplate. True role beside what they claimed. Slowly. Let the room shout.
2. **The decisive episode.** Walk back through the round that ended it, and say — for the first time — who did what and why.
3. **The Glitched.** Tell them what they actually were. This is usually the best moment of the night.
4. **Awards.** Most Trusted · The Mark · Best Liar · Cold Blood · Dead Air.

If the Reunion doesn't land, the silent deaths were pure cost — and that's worth knowing too.
