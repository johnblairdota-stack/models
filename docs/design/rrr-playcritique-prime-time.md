# Playcritique — PRIME TIME and the expedition bed

2026-08-21. Played `game.play` live (`seed=s4`, `?quality=low`), looked at the frames, ran `party-sim` (1,200 matches). Did not score art. Did not patch anything.

> **It is not fun yet, and not because it is unfinished.** The survival slice is a room you can walk around in. The party mode is a rules engine you cannot sit down and play. Neither is a game night. The design bible is doing the work a playtest is supposed to do, and it shows.

---

## What I actually did

- Booted `/?view=game.play&seed=s4`. Clicked PLAY. Drove WASD, Shift, E, LMB, F. Looked at every screenshot I took. Pointer lock was not granted in this session, so mouse-look was driven through `aimYaw` — I cannot certify look the way a player experiences it.
- Ready in **122.9 s**. The gate says 25–30 s. On this box that line is a lie. After PLAY I had **32 s** of live play on the clock.
- Ran `node harness/party-sim.mjs` to completion. 10/0. The numbers below are from that run, not from memory.

What I could not do, named so nothing below pretends otherwise: there is no TV client, no phone client, no QR lobby, and no eight people in a room. The Expedition is still a model in `party-sim` and a different game in `game.play`. I am judging the mode from the slice that would have to carry it, and from the sim that claims the scaffolding is not already broken.

---

## Ranked: what is wrong to PLAY

Most damaging first. Each one is a thing I did, a thing that happened, and a thing I expected.

### 1. Six people would have been watching nothing

I spawned in the west study, third person, over the shoulder of a white robot. Fireplace. Boarded doors marked X. A table. HUD: `FIST`. No hunter. No hole. No terminal. No objective on screen.

I walked, strafed, looked four ways. I never knew what the game wanted. A first-timer's first sixty seconds are: *nice room, now what?*

PRIME TIME puts **six of eight players on that shot for 90 seconds**, five episodes. D1 made the broadcast the game. This broadcast is a robot standing in a parlor. I would have looked at my phone. That is the glance-count failure, and it happened on episode 1, while novelty is supposed to carry it.

The hunter was not late. It was **1.13 km away** — `root` at `(9, 1121)`, `space: null`, `PATROL`, awareness 0. I faced it, walked toward those coordinates for eight ticks, and closed nothing. I cannot score "being hunted" because I was not. On the gated seed, live, the antagonist is not in the house.

### 2. The opening verb is invisible, then refuses you

The comments say the sledge is "first thing on screen, first frame." It was in the field as `pickup.sledgehammer` at `(-8.6, -21)`, 9.4 m dead ahead of spawn `(-8.6, -11.6)`. I looked at that shot. I did not see a hammer. Mottled floor, dim room, a small prop at 9 m. I walked toward it, pressed **E**, still `FIST`. Only standing on the item made `sledgeOwned` true.

So the tutorial beat is: walk to a thing you cannot see, press the interact key, get no prompt and no pickup. Then you are still holding a fist in a mansion you are supposed to smash.

Party mode automates the hammer. **Good.** Do not make "find the sledge" anyone's first lesson. It already failed as one.

### 3. I swung at a wall and the wall did not care

Four committed blows plus walking into geometry. The after-dig frame is the same boarded X and the same fireplace. No white undercoat, no cyan, no hole, no "that did something." Either I was not on a diggable face — and nothing told me — or four blows at 0.95 s cadence is not enough to read. Either way: **destruction, the prototype's whole identity, did not happen to me.**

The automated doorway picker exists because this verb is the wrong party verb. This session is why.

### 4. The guide's view is a debug overlay, and it is an oracle

I pressed **F**. Roof came off. Black void. Six rooms. The HUD printed:

`[F] FLY-OVER · FREE, MOUSE AIMS · HUNTER HEARS 14 M · SEES 26/120° · [N] SENSES ON`

Default **tilt 90°, `blindStrip: 0`.** Top-down, no wall can hide anything. The honest-error mechanic the whole mode rests on is a number that is **zero at the default camera**. Dragging down to 62° is what creates a strip, and a first-time guide will not know to do that.

`coverage.js` gates the hunter mark on live cameras. That module is not this view. The flyover I actually opened still has `senses: true` and `hunter.inScene: true`. S3 was marked built. The thing a guide would hold in their hand was not it.

A Jackbox phone cannot be this screen. A deduction game cannot be this screen. It is a developer map with the enemy's stats written on it.

### 5. The PLAY card teaches the other game, and it includes the cheat keys

The gate is well written for *Run Robot Run*: limbs are health and weapons; *it grows from what it takes.* That is the survival slice. PRIME TIME explicitly bypasses the limb economy and `taken` is binary. The first thing the TV would teach is a rule the party mode threw away.

Then the same card lists `B` cyan walls, `G` black point, `C` coat, `[` `]` dig power. A stranger's first screen is the debug menu. For a party game that is shown on a television, this is not a tone problem. It is the product telling the room it is not a product.

### 6. The vote, as currently evidenced, is a coin

`party-sim` S2: executions hit evil **28.4%** of the time against a **26.4%** chance baseline. The gate passes because it only asks to beat chance. A two-point gap is "the suspicion table is not random." It is not a game of deduction. Bots only know "who guided when it went wrong," and because honest errors sit at **23.6%** (S4, inside T3's band — that part is correctly built), that signal is *supposed* to be weak.

Humans will have faces and talk. They still need **evidence on the TV** that is better than "the run failed, blame the guide." If the Recap is a scoreboard of outcomes with no pictures, the 28% is what the table will do too.

Good win rate by count, camera race only (bots cannot vote well):

| Players | Good win | Exec hits evil |
|---|---|---|
| 4 | 60.8% | 21.5% |
| 5 | 65.0% | 18.9% |
| 6 | 40.0% | 37.8% |
| 7 | 39.6% | 24.9% |
| 8 | 40.8% | 31.2% |

The product count is 7–8. That is **evil-favoured before anyone bluffs**, on the camera race alone. Scatter (random play) is **75.8% good** — if the table is confused, cameras just light. Tuned play is **49.3%**. So the mechanical game is: evil must actively stall, and if they do, they are slightly ahead, and the vote will not save good. That is a lot of weight on a social layer that has never been in a room.

### 7. Off-crew evil is a button you press once, and S5 barely notices

S5: **1.10** events per seated-evil round. The floor is 1.0. The Producer spike is almost the entire remote game. At 8 players, most of Production's night is watching TV and hoping to get the guide chair. The Production Panel (live draft claims) is the actual job, and it is not in the slice I played because there is no phone.

If the spike is anonymous and the hunter was 1 km off-map anyway, the lever does not exist as a feeling.

---

## Game mode suggestions

Ranked by felt improvement per unit of work. Small. Specific. From what I felt, not from genre.

### 1. Build the Recap before task two. Before roles. Before the Reunion.

The 90 seconds I played were not a show. A 20-second produced Recap — runner face, one cutaway, the three facts (`camera lit / not`, `taken / not`, `N alarms`) in huge type — is the first thing six spectators can argue about. File: the log is already there (`src/party/log.js`, `vis`). Query it. Put it on a full-screen card. Do not wait for a Broadcast Director that cuts on action.

**Risk:** a Recap without footage becomes a results screen. Then it is Among Us's "task failed" toast, which nobody watches. Even two stills (runner in the hall / dark camera) beat a number.

This is the D15 problem, solved from the other end: if the live Expedition is dull, the Recap is the product for v1. Shorten live to 45 s if you have to. **Do not add a fifth task until one Recap of the Dark Run has made a room shout.**

### 2. Throw away `[F]` as the guide phone. Ship a 2D, camera-gated map.

What I opened is an oracle with a telemetry HUD. What the mode needs is: rooms, which cameras are live, a last-known hunter ghost inside coverage, and **NO SIGNAL** everywhere else. `coverage.js` already measures the error curve (0 cams 49.9% · 1 cam 33.3% · 2 cams 16.9% · 3 cams 0%). **Wire that to the thing the guide sees, and default the camera to ~70°, not 90°**, so the blind strip is not an advanced technique.

Hide `HUNTER HEARS 14 M`. That string is a confession.

**Risk:** a 2D map is less pretty than the flyover. Pretty is how the oracle leaked. Accept it.

### 3. Keep the limb spectacle. Change only the rule.

The only line on the PLAY card that I remembered after the session was *It grows from what it takes.* Party mode bypasses the limb economy so a take can be terminal. Fine. **The picture on the TV should still be a robot coming apart and a hunter putting the part on.** Execution already wants a sledge cinematic; the Take should be the same family. `taken.js` can stay binary. The survival identity is the only image this project has that a living room would watch.

If you ship "the runner vanishes and the nameplate turns down," you threw away the reason anyone looked at this prototype.

**Risk:** a four-limb take reads as "not dead yet" to people who played the survival slice. Caption it. `TAKEN` in the lower third. Once.

### 4. Air every casting ballot, huge, attributed, before anyone talks.

The vote cannot carry the game (28% vs 26%). Casting can. Who you sent, who you refused, who self-picked for guide — that is the cheapest deduction in the design, and it already computes (`ballot.js`). Put it on the TV the way a reality show puts the vote reveal: one name at a time, the room shouting over it.

Episode 1 skipping eviction is correct. **Episode 1 should still air the ballots.** That is how you teach the real verb on the premiere.

**Risk:** 8 × 2 names is a lot of text. Don't list them. Animate them.

### 5. Cut Season One to four cards until a table has played.

Contestant. One info role (Camera Op as recast: sight vs sound). Glitched. Producer. That is a script a stranger can hold. Thirteen cards (`rrr-roles.md`) is Blood on the Clocktower with no Storyteller and no night. Jackbox nights bounce off that. The bible already allows a no-roles quick mode — **run that on paper before you deal Glitched.** If the Dark Run plus a vote is already a game, roles are seasoning. If it isn't, roles will not save it.

Chair Rule stays. Anything that only works on the Expedition is already dead at 8 players (~32% never go).

**Risk:** the Glitched is load-bearing doubt. If you cut info roles to one, you need it in the bag or Camera Op becomes an oracle. Keep Glitched. Cut the rest first.

### 6. Give every seated player a toy during the 90 s, not a lecture about the Recap.

Reaction bar (CLAP / BOO / SUS / SHOCK) is the right shape and it is currently vapour. Ship it on episode 1, on the phone, with no strategic effect. Dead-air (D15) is unmeasurable without it. Off-crew evil's Producer spike should **change the TV** — hunter turns, lower-third `SOMETHING IN THE EAST WING` — so the seated traitor feels the lever and the room has a thing to mis-attribute.

S5 at 1.10 is a gate that is one sneeze from failing. Do not add a fifth remote lever. Make the one you have visible.

---

## What is already good (do not redo)

- **D13 is right.** Third-person follow is a TV shot. I would rather watch that robot's back than a bobbing phone. First-person on the phone would have killed the room.
- **T3's 15–25% band is actually in the sim.** 23.6%. That is the rare case of a design number that survived contact with its instrument.
- **Patient evil vs aggressive is distinguishable.** Natural hunter arrivals 44.2% vs 33.8%. The lie is catchable *in principle* if coverage is partial. Do not "clarify" the guide's view to help good. That is how you delete the game.
- **Episode 1 has no vote.** Correct. I had nothing after 32 s. An eviction on that would have taught the table that votes are arbitrary.
- **Automating the hammer was the right call.** I could not pick it up and I could not make a wall notice me. Player-aimed sledge is a different game, and that game did not happen in my hands tonight.
- **Scatter 75.8% good vs tuned 49.3%.** The sim is measuring play, not noise. Trust S0d. Do not retune off a feeling until a human table exists.

---

## What to do this week (and what not to)

**Do the paper night.** The kit is written. The sim cannot tell you whether a lying guide is catchable in a room, and neither can I from a headless browser. The one number that matters is still the one in the paper prototype: after every expedition, before talk, everyone writes `LIED` or `HONEST`. 55–70% and you have a game. Under 50% and you raise coverage. Over 80% and you cut a camera.

**Do not build the other four tasks.** Five shapes is a content roadmap, not a v1. Dark Run plus Recap plus ballot-airing plus a vote is the vertical slice. I walked the 3D bed that would have to carry all five. It could not carry one.

**Do not keep writing bibles.** `party-loop.md`, the deception-mode doc, the build brief, the round spec, the role spec, the task deck, and the paper kit still disagree in public (crew of 2 vs 3, ghosts, evil at 6, thirteen cards vs ten). A table cannot play a diff. Pick the paper kit as the night's rules and freeze the rest until someone has shouted at a Recap.

---

## First sixty seconds, as a stranger

The gate. A sentence about limbs. Cheat keys. Two minutes of `BUILDING THE ESTATE…` on this machine. PLAY. A handsome study. A robot with a fist. Boarded X's I did not know were doors. No hammer I could see. No monster. A timer counting up like I was already late for a rule nobody told me.

I would have asked whoever owned the TV what we were doing.

That question is the whole design. Answer it on the first card, in one line, for the party mode:

**Two of you go in. One walks, one talks. The rest of us watch. Someone in this room is lying.**
