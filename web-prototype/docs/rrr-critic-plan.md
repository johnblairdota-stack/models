# Plan — three critics, one build queue

Written after three independent critics read the canvas: a spec critic against John's eight
notes, a social-deception critic against the NO SIGNAL mechanic, and a systems designer asked
for six replacements. This file is the queue, not the argument; the arguments live in the
findings quoted under each item.

The queue has two halves and they carry very different risk.

## Half A — decided. Build now.

These are either bugs, or notes John has already made a call on. The critics changed *how*,
not *whether*. Ordered by damage, not by effort.

### A0 — The incident counter is a lie detector. (Fatal, and not on anyone's list.)

`src/party/session.js:366-373` increments the public `incident.alarms` **if and only if the
guide's call was wrong**, and that is the only increment in the file. `net/party/entitle.js:126`
rows it `all`; `net/party/show-tv.html:211,:255` prints it permanently. So the number on
television is a public read-out of whether the guide lied — or, indistinguishably, was honestly
wrong. Either way the deniable HOLD, the exact play `session.js`'s own comment claims is
uncatchable, is deleted by a counter in the corner of the screen.

Round §4 defines incidents as a count over noise events. Mode bible §5.6: *"a number, with no
attribution ... nobody knows which were malice."* T5: never name the culprit. R14 rates this
**Fatal**. The gates miss it because `events.js`'s closed schema and `party-anon` A4 check the
*shape* of attribution, not its *entropy* — a perfectly anonymous number can still be a perfect
index of one player's honesty.

**Fix.** `incident.alarms` must count physical noise across all sources, so that a given delta
is consistent with several histories. The misled call stays a contributor; it stops being the
only one. Every expedition emits the runner's own work noise, so an honest expedition also moves
the counter.

**Gate (this is the point).** Extend `party-anon` with an *entropy* assertion, not a shape one:
over a seeded sweep of episodes, there must exist two episodes with the same alarm delta and
opposite `misled`, and two with different deltas and the same `misled`. Control that must fail:
restore the single-source increment and the assertion goes red.

### A1 — The guide's call is on the wire and on television.

`call.by` and `call.said` are entitled and printed. Verify against broadcast §6.9 and T2 before
touching: if §6.9 forbids airing the call live, both rows come off the public frame and the TV
stops printing it; the Reunion still has it, because `log.reunion() === log.all()`. If §6.9
permits it, leave it and record why here. Do not guess — read the doc.

**Resolved: §6.9 forbids it, and both rows came off.** The doc is unambiguous — *"Never show the
runner's private prompts or the guide's callouts as on-screen text. The guide talks out loud, in
the room. That is the game."* The build broke it on both screens at once: the television printed
CLEAR at sixty-eight pixels across the middle of the circle and the runner's phone printed it
again under the guide's name. What ships now: `call.by` has **no row at all** (it was `pair.guide`
with a second name attached), `call.said` is rowed `guide` so the caller's own controller can say
it back to them and no other socket can, and a new `call.made` boolean is rowed `all` — that the
guide has spoken is the shooting clock, and the runner's GO/WAIT has to unlock on something. The
log is untouched: `call.made` is still a PUBLIC event carrying `by` and `said` in full, so the
Reunion and every query over the log still see the call. `live-session` L14 holds the line.

### A2 — Note 2, the executioner beat. Free, and the TV throws it away.

`src/party/vote.js:90 executioner()` already returns exactly the nominator John describes, with
the SHOWRUNNER fallback, and `session.js:409-412` logs it PUBLIC on `player.executed`.
`show-tv.html:207-210` renders only the victim, and the TV socket handler (`:284-288`) ignores
`t:'event'` entirely. No entitlement work. Render what the existing function already returns —
"X voted out · nominated by Y".

**Not in scope:** whether "first nominator" should mean an ordered pile-on rather than the
unique nominator. That is a rules change (it breaks the standing-nomination cap and the
no-tie-rule property) and it is John's call. Build the free version.

### A3 — Note 3, colour. The phone receives it and throws it away.

The roster carries per-player colours and the TV uses them; the phone discards them, so the
nominate and vote swatches are grey. They are not neutral, they are *lying* — the TV and the
phone disagree about who is who. Use the roster colours on both sheets.

### A4 — Note 5, hold-to-reveal.

`rrr-phone-ux.md` §2.3 specs press-and-hold verbatim. The build shipped the cheap v1 (tap to
open a card view) and the code comment defends it as the design. Implement the spec; correct
the comment.

### A5 — Note 6, sequential casting.

Needs an atomic submit. Also: `src/party/ballot.js:87 refuse()` is fully implemented, gated, and
**unreachable** — `refuse` is absent from `session.js`'s `INPUT` list. Wire it or delete it;
wire it. Reconcile the doc with whichever shape ships.

### A6 — Note 1's answer is "dark", not "more map". (This reverses earlier advice.)

P2 and round §1's phase table both say RECAP phones are dark. The build instead offers a claim
text box. A map at RECAP would be worse still: it gives the guide twenty idle seconds holding a
*producible* alibi, which attacks the one unwitnessed asset D13 rests on. Ship build §2.4's
"PHONES DOWN — TALK", plus at most a words-only stamp.

### A7 — At 4-5 players the sole traitor is shown the GOOD card.

`show-phone.html:143` infers alignment from `Array.isArray(you.teammates)`. With one traitor the
array is empty, `project()`'s prune legitimately deletes it, and the traitor reads GOOD.
`you.alignment` is sitting in the frame, unread. Read it.

### Half A is built. Three places where what shipped is wider than the item as written.

**A0 also sealed `task.miss`.** The item says to fix the counter, and the counter is fixed — it
counts noise from the runner's throttle, the Hunter's own prowling and the guide's blunder, so a
delta of 1 is consistent with three histories. But `task.miss` was `VIS.PUBLIC` and fires **if and
only if the call was wrong**, which is the same lie detector one layer down and on the wire of
every phone in the room. Leaving it would have made A0 cosmetic — the counter ambiguous and the
packet beside it decisive — so it is SEALED. Nothing public is lost: a wrong CLEAR is already
witnessed as a take, and a wrong HOLD is a room nobody entered and nobody heard.

**A6 also darkened `EXECUTION` and `VERDICT`.** The item names RECAP, and round §1's `Phones`
column reads **dark** for all three. Fixing only the row the critic happened to read would have
left the identical bug two rows down.

**`room.js:219` was left alone, and it did not need changing.** It emits two `noise.emitted` events
at 1.25 and 0.62 and adds 2. Against the new `INCIDENT_LOUD = 0.60` that is exactly what the
session's rule would compute, so the fixture path already agrees with the shipped semantics.

## Half B — the NO SIGNAL replacement. Recommendation only; not queued.

Held for John. It changes the deception engine, and it is the one place where building the
wrong thing costs more than not building.

The recommendation is **THE SOUND DESK**: the guide's screen stops showing where the Hunter is
and starts showing what the house heard — sound marks on the §4 plan, sized by loudness, placed
precisely inside camera coverage and as a bearing arc outside it, masked by the runner's own
throttle noise, with a stationary Hunter emitting nothing.

Why it beats the alternatives: NO SIGNAL's deepest flaw is not the blank screen, it is that the
guide's evidence is **unshared**, so the table has nothing to reason over and the Reunion has
nothing to settle. The noise bus is already public on television — `captions.js` prints
`LOUD CRASH — THE LONG GALLERY` and broadcast §3 forbids cutting the audio. The Sound Desk is
the only candidate that moves the guide onto evidence the room already partly holds. It is also
the cheapest real option: `simReport()` already carries `runner.noise` and the Hunter's position
every tick, so nothing under `src/game/` is touched.

Measured, the current mechanic is out of band and untunable: honest error is 38.7% / 27.3% /
16.0% at one, two and three cameras against a T3 target of 15-25%, and its only two inputs are
the win condition and a welded-shut constant. The Sound Desk's proposed numbers are 26 / 23 /
20, in band from episode 2, declining round over round, with a **floor at 20% that no amount of
winning removes** — because a Hunter lying in wait is silent and a sprinting robot is deaf.

Three duty cycles must be *measured* before those numbers are quoted as targets, and one of
them is a stop-ship: if the Hunter's stationary fraction reads under 0.10, the floor collapses
and full coverage is an oracle again.

One human metric to hold the whole design to, at one button: after the Debrief, "was that call
reasonable?" YES / NO / CAN'T TELL. **If CAN'T TELL exceeds 40%, it is NO SIGNAL with better
graphics.**

Companion, after the display measures in band: **THE WINDOW** — the guide calls a duration
("clear for three") instead of a state. It is the only mechanic where the argument needs no
access to the guide's screen at all: *"you said five and it walked in at two"* is a complete
accusation from the television alone.

Rejected, and worth recording because it will be re-proposed: **THE CONTACT SHEET** (a bank of
live camera tiles) looks best and is worst. If the Recap can re-air the frame the guide saw,
the Debrief has a correct answer thirty seconds in, and T3's requirement that the lie and the
honest mistake be the same observable event dies — not because mistakes got rare but because
the evidence got complete. **Arguability is bounded above as well as below.** A task wants
evidence that constrains the answer without determining it.

## Open question for John

Note 2: does "the first person who nominated" mean the unique nominator (already built, free) or
an ordered pile-on (a rules change that kills the standing-nomination cap and the no-tie-rule
property)? A2 ships the free reading until told otherwise.
