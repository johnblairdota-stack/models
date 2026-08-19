# Slice: the sounds are "pretty meh", and there is no impact sound at all

**Files you may edit — nothing else:**
- `src/audio/audio.js`
- `harness/scenarios/_audio1-wiring.mjs` (the existing offline-render probe — extend it, do not
  start a second one)

**Files other agents own — do not touch:**
- `src/game/player.js`, `locomotion.js`, `weapons.js`, new `sledge.js` belong to **`sledge-1`**,
  running now. **It calls you.** You publish the function; you do not wire the call site.
- `src/materials/breakmask.js`, `src/destruction/damagefield.js`, `src/game/wall.js`,
  `src/game/dig.js` belong to **`chunks-1`**, running now.
- `src/ui/hud.js` belongs to nobody this wave — still do not touch it.

Decisions here are made. If a stated fact turns out to be wrong, say so in your report rather than
diverging silently.

---

## 1. Why this exists

**Two facts, and the second is the bigger one.**

**John has now heard the game** — the first human ever to, since the audio landed on 2026-08-04 and
sat unheard. His verdict, 2026-08-08: **"there are a few sounds. they are pretty meh."**

That is the most useful possible answer. It means **the graph works and is audible** — this is not
a debugging job, and you should not spend the slice proving the oscillators run. **It is a quality
job.** `play-critic-8` ranked audio above every other open item on the board *combined*, so this is
the highest-leverage quality work available.

**And the sound the campaign actually needs does not exist.** `audio.js` has three voices —
gunshot, wall-crossing-a-stage, hunter-proximity. **There is no melee impact sound of any kind.**
The entire campaign is John's sentence *"I want the feel of sledge hammering the wall to be
satisfying and familiar"*, and a sledgehammer with no sound cannot be satisfying. **The impact voice
is this slice's headline.**

## 2. Constraints that are not negotiable

- ⚠️ **ZERO ASSETS. Everything is synthesised WebAudio.** The project has no image or audio files
  anywhere and that is a deliberate property, not an oversight. Do not add a sample, a base64 blob,
  or a fetch.
- ⚠️ **This must survive ~60 s of continuous hammering.** John's dig band is *"about a minute to dig
  into another room"*, at roughly one blow per second. **A sound that is great once and unbearable
  ninety times has failed this slice.** Variation is a requirement, not a polish item.

## 3. What to build

### 3.1 The impact voice — the headline
```
playMeleeImpact(depth01)     // 0 = fresh surface, 1 = fully dug through to the barrier
```
`sledge-1` calls this on the contact frame. **You own the signature and the sound; it owns the call
site.**

**The timbre must track depth, because the sound is half of the search heuristic.** `dig.md` §5's
core idea is that *how fast the wall is giving way* is how a player finds the route — and John has
ruled out a numeric meter, which means **the wall's own feedback carries the whole signal.** Sound
is the channel that works even when the player is standing too close to see the hole.

| depth | what the player is hitting | what it should say |
|---|---|---|
| ~0 | the ornate surface | brittle, papery crack — something decorative breaking |
| ~0.3 | white body, fresh | full-bodied crunch, big chunks, the satisfying one |
| ~0.7 | white body, spent | drier, tighter, smaller — *"this spot is giving less"* |
| **1.0** | **the cyan barrier** | 🎯 **a dead, flat clank. No debris tail. It must read as "NOT HERE" without a word of UI.** |

⚠️ **That last row is the most important sound in the game.** It is `dig.md` §5's *"do not make the
barrier look like failure — make it look like an ANSWER"*, delivered in audio. A player should hear
it once and move along the wall without being told why.

### 3.2 Raise the three that exist
John said "meh" about the set as a whole. Judge each against what it is *for*:
- **Gunshot** — must have attack and body; a soft click reads as a toy.
- **Wall stage crossing** — will be re-pointed by `chunks-1` toward continuous depth; keep it
  working and coherent with §3.1's ladder rather than fighting it.
- **Hunter proximity** — this is the horror channel and the one with most to gain. It must build
  dread without becoming a drone the player stops hearing.

⚠️ **Do not rebuild the graph architecture.** Improve the voices inside it. A rewrite you cannot
verify is worse than three better-sounding oscillators.

### 3.3 Variation
Per-hit jitter in pitch, timbre and envelope, plus a small pool of variants so consecutive blows are
never identical. **Deterministic given a seed** — capture reproducibility depends on it.

## 4. The bar

There is no reference audio, so the bar is behavioural, and it is honest:

1. **Ninety blows in a row must not become annoying.** Render or play a full ~60 s dig and listen.
2. **The barrier clank must be identifiable with your eyes shut**, distinct from every other depth.
3. **A stranger hearing one impact should be able to say roughly how deep the dig is.** If they
   cannot, §3.1's ladder is not doing its job.

## 5. Traps

- 🚨 **THE LYING INSTRUMENT — this project has hit it six times, and audio is where it hides best.**
  A graph that "runs" and outputs silence passes every check that asks "did the function get
  called". **Verify the OUTPUT, not the invocation**: render offline and assert the buffer is
  non-silent *and* that the four depth steps are **spectrally distinct from one another**. Two
  different-sounding names producing the same waveform is exactly the failure mode.
- ⚠️ **`_renderOffline` already exists in the codebase — use its pattern.** Do not write a seventh
  throwaway probe; extend `harness/scenarios/_audio1-wiring.mjs`.
- ⚠️ **Browsers refuse to start an AudioContext without a user gesture.** The game already has a
  PLAY gate for exactly this reason. If you hit silence in a harness run, suspect the context state
  before you suspect your synthesis.
- ⚠️ **Do not let the impact sound depend on `chunks-1` having landed.** Take `depth01` as a plain
  number and be verifiable on your own.

## 6. Verify

```bash
node harness/scenarios/_audio1-wiring.mjs
node harness/mechanics.mjs
```

⚠️ **CORRECTION, 2026-08-08 (found by `audio-3`, and this doc was wrong):** `_audio1-wiring.mjs` is
**the exception** — it has no `export default` and launches its own browser, so it *is* run
standalone. The general rule still holds for every other scenario: **`harness/scenarios/*.mjs`
export a default function driven by `playtest.mjs`, and running one directly prints nothing and
exits 0, which looks exactly like a pass.** Check for `export default` before choosing how to run
one.
⚠️ **Loading `game.play` takes 75–115 s** (cold shader compile). Expected, not a hang.

**What to look at:** the rendered buffers. Assert non-silence, then compare the four depth steps'
spectra and **state the actual numbers in your report** — "they sound different" is not evidence,
and nobody downstream can check it.

## 7. Regression gate

- `mechanics.mjs` **11/11**.
- The three existing voices still fire at their existing call sites — **you are not allowed to
  break the wiring while improving the timbre.** If a call site must change, it is in another
  agent's file: report it, do not edit it.

## 8. Report back

What you changed per voice and what it sounds like now, in words John can check by listening; the
measured spectral separation between the four depth steps; how variation is generated and how it
stays deterministic; and **the one thing you would fix next with more room**.

⚠️ **Then say plainly what still cannot be judged without a human ear.** You cannot hear your own
output. John is the only listener this project has, and a claim of "much better" that he then
disagrees with costs a whole round — so describe, do not grade.

```bash
node harness/status.mjs note "audio-3: <what changed>"
```
**Set no board verdict** — there is no audio piece on the scoreboard, and `game.play` belongs to
other agents this wave.
