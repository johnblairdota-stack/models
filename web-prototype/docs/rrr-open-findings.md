# Found and not built

Everything below was **measured** by a critic and, where it says so, **verified by hand**. None of
it is built. It is ordered by what it costs, not by what it costs to fix, and every entry names
the file so the next session can start at the code rather than at the argument.

Written at the end of a long session that took the party mode from 464 assertions across 24 gates
to **990 across 32**, closed five Fatal bugs that a fully green suite had been passing over, and
replaced the gate runner. What follows is what that session found and did not have budget to fix.

---

## The one that decides whether there is a game

**No player holds private information that anyone else wants.** The claim stands. It is now
gated — `harness/party-private.mjs`, 18 assertions over six complete games on both real servers —
and the gate **corrected the original measurement in three places.** The corrections make the
finding narrower and sharper, not weaker:

1. **Not "exactly one private event" for everybody.** The two Production members get **two**:
   `production.panel` is `VIS.EVIL` *and* carries `for`, so it reaches one phone rather than the
   faction (`log.js`: *"the class says WHO MAY; `for` says WHO"*). The measured band is **[1, 2]**,
   and everyone outside Production sits exactly on the floor — 6 of 8, 4 of 6, 4 of 5.
2. **`call.said` was not the only non-`you` frame difference.** The guide's whole flyover is a
   private surface and the first pass missed it: `flyover.hunter`, `flyover.room`,
   `flyover.marks[].x/z/kind`, `flyover.plan[].id/x0/x1/z0/z1`. None of it is a leak — every path
   is correctly rowed `guide`. The corrected sentence is the one worth keeping: **every byte on a
   frame that one phone holds and the others do not belongs to whoever is currently the guide.
   Nobody else, in any chair, at any moment, holds anything.**
3. **113 frames per phone, not 31.** Frames re-broadcast on every input and clock event, not once
   per phase, so the original "31 phase-frames" undercounted the surface by ~3.6×.

And the part that matters most is unchanged: **every private envelope in every game is dealt in
episode one. Nothing private is written to anybody for the remaining four episodes**, on either
server, at any count. `126 = 116 PUBLIC + 8 SELF + 2 EVIL` turns out to be the wire union rather
than `log.all()` — the right thing to have counted; a complete five-episode show writes ~183
entries, ~28 of them SEALED and reaching nobody.

So the Debrief is eight people reasoning about six facts they all share. The mode bible's own test
is that every event should have at least two plausible explanations; the build passes that and
fails the precondition it never states — **there has to be more than one event.**

**Twelve of thirteen role cards are text.** `roles.js` is imported for `cardFor` and nothing else.
`resolveInformation`, `pairContainsProduction`, `falsify`, `spendableFromChair`,
`STATIC_LAG_SECONDS` have no caller outside `harness/role-script.mjs` — which is 24/24 green over a
system where no role has ever fired, because all 24 assertions read data literals.

The cheapest real fix, argued by two independent critics: **fire Continuity automatically every
episode as a `SELF` reading.** `pairContainsProduction()` is already written, already gated, and
has never been called; it needs no mansion, no Hunter, no Director. Roughly ten lines in
`session.js`, four `self` rows in `entitle.js`, six in `show-phone.html`. Honest costs: at 8
players it says NO three times in four, and the Glitched only contradicts it in about 22% of games.

Related and cheap: **`GUARANTEED` colliding with `COMPOSITION` makes three cards structurally
undealable** — the Static and the Method Actor can never appear at 4, 5 or 6 players; the Fixer can
never appear at 8. Nobody decided that; it falls out of two tables.

---

## The room is watching a screen that cannot tell it anything

**The terminal has no mesh, no light, no prop and no HUD mark.** `TERMINAL_AT` is six anchor names
and `TERMINAL_REACH` is a 2.2 m disc, so the objective exists only as a coordinate the code knows.
Measured blind-sweep worst case: 21 s at RUN in the ballroom. The runner cannot see it, the guide
cannot point at it, and the audience cannot tell a runner closing on it from one wandering past —
while `lit` is the camera-unlock event the entire win condition runs on, delivered with no on-screen
cause. The builder who found it ranked it above everything else remaining in that file.

**The phone sends an absolute world compass bearing, unthrottled.** `rrr-phone-ux.md` §3.1
specifies yaw *rate* at 20 Hz capped at `MOVE.turnRate`. An absolute bearing has no idle value, no
rate cap, and **no "the thumb is off the stick" signal at all** — which is why the drivable-frame
contract had to key off the throttle alone. With none of §5's ack/retransmit/safe-hold, a dropped
packet leaves the last bearing latched and the robot drives into a wall rather than stopping. Treat
the rate wire and safe-hold as one job.

**Nothing on either screen makes a sound or vibrates.** Zero `AudioContext`, zero
`navigator.vibrate` in `show-tv.html` and `show-phone.html`. Every state change the room must
notice is visual only, on a television half of them are looking at sideways and a phone the game's
own copy told them to put face down.

---

## Accessibility, measured

**The eight-seat palette is not colour-blind safe, and seat colour is how both screens identify
people.** Viénot/Brettel LMS simulation with CIEDE2000 across all 28 pairs: seat 2 blue vs seat 5
purple is **ΔE 3.3** under deuteranopia — not "similar", the same colour. Seat 6 pink vs seat 7 teal
is 4.6. Luminance does not rescue it: amber and teal are **0.7 L\* apart**. Red–green deficiency is
~8% of men, so with four men on a sofa that is roughly a one-in-three chance per evening.

The probe is committed — `harness/evidence/_room-probe3.mjs` — and the gate is worth more than the
repalette, because it stops the next person picking a prettier colour.

**At 8 m the shared evidence board is at the acuity limit.** Measured on a 55" 1080p panel: the
public claim 6.5 arcmin, the RUNNER/GUIDE badge 5.5, the footer 4.6, against a 5 arcmin detection
threshold and ~16 for comfortable reading. The Debrief board is the phase whose whole purpose is
arguing from shared evidence. And the seat number inside the dot — the non-colour channel that
saves the deuteranope — is 5.5 arcmin. **The channel that rescues one failure fails first at
distance.**

---

## The economy

- ⚠️ **EVERY NUMBER IN THIS SECTION IS MEASURED ON A GAME THAT DOES NOT SHIP.** `party-sim`
  gives seated evil a Producer spike each episode via `policy.js`'s `spikesThisEpisode`
  (`harness/party-sim.mjs:151`). Nothing in the tree ever fires `noise.spike` —
  `harness/party-anon.mjs:77` says so in its own header. So the simulated evil side has a
  per-episode lever the real one does not, and the shipped vote is probably **worse** than the
  figure below, not better. An independent critic measured 28.4% vs 26.4% chance on a separate
  sweep, which agrees to within a fifth of a point and inherits the same caveat. Read every
  economy number here as an upper bound until the spike is real.
- **The vote is worth +2.1 percentage points over guessing** (n = 14,064): 24.8% of executed
  players were Production against a 22.7% random-standing-nominee baseline, and it does not improve
  across episodes. Root cause measured: at 4 and 5 players the guide of a *failed* expedition is
  **less** likely to be Production than a random living player.
- ~~**Reveal `hunter.placed` at RECAP.** It is one `VIS` constant.~~ **BUILT 2026-08-21, AND THE
  ADVICE ABOVE WAS WRONG TWICE.** It is not one `VIS` constant and following it literally would
  have shipped a fatal. (1) `hunter.placed` is recorded on ENTRY TO EXPEDITION, so re-rowing it
  `PUBLIC` publishes the Hunter's room *before* the ninety seconds run — the guide's job
  evaporates and the runner walks around one room. (2) The room is
  `pick(ROOMS.length, worldSeed, 'hunter', episode)`, so airing five of them is five
  (episode → room) pairs to brute-force a 32-bit seed against, and with it every future
  placement — Fatal #5's `/report` leak one field along.

  What shipped instead: `onEnter[PHASE.RECAP]` airs two booleans — `guideSaw` (was the flyover
  showing them the Hunter when they spoke) and `hunterHere` (was the Hunter in the wing). A guide
  who was blind and called it wrong is unlucky; one who could see and called it wrong is doing
  something else. Strictly less information than this entry asked for, and it is the information
  that makes a call evidence rather than a verdict. `hunter.placed` stays `SEALED` and still
  carries the room to the Reunion. Gated by `expedition-wire` E14 on real projected frames —
  306 pre-recap frames carry the reveal zero times; moving the write one phase early turns E14a
  red at 81 of 306.
- **The camera objective's back half buys nothing.** Three cameras exist; `WIN_TARGETS` asks for 3
  or 4 lights. Coverage is total from the **second** earned light, so 1 light at a 4–5p table and 2
  at 6–8p move the guide's sight by exactly zero. Three documents disagree about that table —
  `win.js` names all three and follows one on a scope contract, which is the model; do not let
  anyone reconcile them silently.
- **The show keeps shooting after it is over.** `foldWin` fires on the winning camera but
  `closeEpisode()` only runs when the phase queue empties: **71.3% of games execute someone after
  the result is locked.**

---

## Solo, which `party-loop.md` says is the art bed and not a shipping mode

Recorded so nobody rediscovers it, **not** recommended for work unless that decision reverses:

- **The exit siege is broken.** The sledgehammer bypasses `panel.damage()` and spends a *fraction of
  a stage* rather than damage, so all three locks cost 15/12/4 blows against a 19× health ratio —
  and the design's declared hardest lock, `beams`, is in practice its cheapest at 3.8 s. The siege
  was measured with a hitscan weapon, before the hammer existed.
- The win condition is **7.3–23.8 seconds** long.
- `WINDDOWN` and `DETONATION` are unreachable in both modes; `escape.mjs` E10 proves otherwise by
  constructing a two-player run the game never produces.
- **Solo's entire play-facing gate suite cannot run in this environment**: 196 of 533 harness files
  import Playwright, the browser cache is empty, and `package.json` gates the party 32 ways and solo
  zero. That is why nobody looked at this half all session.

---

## Known limits in what shipped tonight

- **`phone-hands.mjs` is committed and not in the runner.** Its six browser arms have never been
  observed to complete. So `mount()` — the fix that stopped CLEAR and HOLD being rebuilt 450 times
  an expedition — is **shipped and unmeasured**. Its header records the two traps already ruled out.
- **The two-tab chair exploit is open and cannot be closed by the per-socket guard.** Two tabs are
  two sockets and the server has no identity separating them from two phones; source address would
  refuse eight harness phones on localhost. A product decision, not a patch.
- **`report()` is still a free-form bag.** `note()` takes arbitrary fields and `report()` returns
  them raw — which is how the second copy of the seed existed. Both known writers are closed and a
  gate walks the whole response, but nothing structurally stops the next field. A projection choke
  point on the report, as the frame already has, is the real fix.
- **13 citations in `harness/scenarios/` are stale** after the probe migration, left for whoever
  owns those assertions.
- **186 MB is recoverable** from 34 byte-identical duplicate GLBs; `.git` is 521 MB.

---

## The rule this session was actually about

Five Fatal bugs passed a fully green suite. Every one was a gate measuring a model, a fixture, or a
hand-built artefact instead of the code that ships — and the harness's own stated discipline, *"a
SKIP is never a PASS; every assertion ships a control that must fail"*, could not see any of them,
because it polices whether an assertion **can** go red and says nothing about whether the thing
underneath it is the thing that ships.

The missing sentence, now in `wire-parity`'s header:

> **A model may stand in for something that does not exist yet. It may never stand in for something
> that does.**
